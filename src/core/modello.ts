import path from 'node:path';
import os from 'node:os';
import { Strumento } from './tipi';
import { accorcia, descriviStrumento, ePromptInterno, pulisciPrompt } from './azioni';
import { eSensibile, oscuraEnv } from './oscura';

/** Ultimo evento "significativo": guida il calcolo dello stato. */
export type UltimoEvento = 'prompt' | 'thinking' | 'testo' | 'testo-fine' | 'tool_use' | 'tool_result' | 'fine-turno' | 'interrotto' | 'errore-api' | 'riprova-api' | 'nessuno';

const MAX_STRUMENTI = 300;
const MAX_RISULTATO = 4000;

/** Righe che non servono mai: si scartano PRIMA del JSON.parse (sono il ~22% dei byte). */
const PREFISSI_RUMORE = ['{"type":"api-request', '{"type":"file-history', '{"type":"atis-latch', '{"type":"frame-link',
  '{"type":"artifact-', '{"type":"session-owner', '{"type":"cost-state', '{"type":"tools-used', '{"type":"relocated'];

export interface OpzioniModello { home?: string; tmp?: string }

/**
 * Accumula gli eventi di UN registro (sessione o sotto-agente).
 * Tollerante: righe rotte, campi mancanti o tipi sconosciuti vengono ignorati, mai un'eccezione.
 */
export class ModelloSessione {
  titoloCustom?: string; titoloAi?: string; nomeAgente?: string;
  primoPrompt?: string; ultimoPrompt?: string; ultimoTesto?: string;
  cwdAttuale?: string; private primoCwd?: string;
  ramo?: string; entrypoint?: string; versione?: string; modello?: string; modoPermessi?: string;
  inizio = 0; ultimaAttivita = 0; inizioTurno = 0;
  ultimoEvento: UltimoEvento = 'nessuno'; quandoUltimoEvento = 0;
  strumenti: Strumento[] = [];
  aperti = new Map<string, Strumento>();          // tool_use senza tool_result
  background = new Map<string, Strumento>();      // taskId -> strumento lanciato in background
  totStrumenti = 0; totErrori = 0;
  ultimoErrore?: { quando: number; testo: string };
  righeRotte = 0; righeLette = 0;
  agentIdRighe?: string;                          // agentId visto nelle righe (sotto-agenti)
  private home: string; private tmp: string; private claudeDir: string;

  constructor(public readonly id: string, public readonly file: string, opz: OpzioniModello = {}) {
    this.home = norm(opz.home ?? os.homedir());
    this.tmp = norm(opz.tmp ?? os.tmpdir());
    this.claudeDir = norm(path.join(opz.home ?? os.homedir(), '.claude'));
  }

  /** L'output di un comando in background è cresciuto: la sessione è viva. */
  tocca(ms: number) { if (ms > this.ultimaAttivita) this.ultimaAttivita = ms; }

  elaboraRiga(riga: string): void {
    this.righeLette++;
    for (const p of PREFISSI_RUMORE) if (riga.startsWith(p)) return;
    // allegati enormi (prompt di sistema, file): servono solo task_status e queued_command
    const testa = riga.slice(0, 400);
    if (testa.includes('"attachment":{') && !/"attachment":\{"type":"(task_status|queued_command)"/.test(testa)) return;
    let j: any;
    try { j = JSON.parse(riga); } catch { this.righeRotte++; return; }
    if (!j || typeof j !== 'object') return;
    try { this.elaboraEvento(j); } catch { this.righeRotte++; }
  }

  private segna(ev: UltimoEvento, t: number) {
    if (!t) return;
    this.ultimoEvento = ev; this.quandoUltimoEvento = t;
    if (t > this.ultimaAttivita) this.ultimaAttivita = t;
  }

  private elaboraEvento(j: any) {
    const t = typeof j.timestamp === 'string' ? Date.parse(j.timestamp) || 0 : 0;
    if (t && !this.inizio) this.inizio = t;
    if (typeof j.cwd === 'string') this.notaCwd(j.cwd);
    if (typeof j.gitBranch === 'string' && j.gitBranch && j.gitBranch !== 'HEAD') this.ramo = j.gitBranch;
    if (typeof j.entrypoint === 'string') this.entrypoint = j.entrypoint;
    if (typeof j.version === 'string') this.versione = j.version;
    if (typeof j.permissionMode === 'string') this.modoPermessi = j.permissionMode;
    if (typeof j.agentId === 'string') this.agentIdRighe = j.agentId;

    switch (j.type) {
      case 'custom-title': if (typeof j.customTitle === 'string' && j.customTitle.trim()) this.titoloCustom = j.customTitle.trim(); return;
      case 'ai-title': if (typeof j.aiTitle === 'string') this.titoloAi = j.aiTitle; return;
      case 'agent-name': if (typeof j.agentName === 'string') this.nomeAgente = j.agentName; return;
      case 'last-prompt': if (typeof j.lastPrompt === 'string' && !ePromptInterno(j.lastPrompt)) this.ultimoPrompt = accorcia(pulisciPrompt(j.lastPrompt), 300); return;
      case 'user': return this.user(j, t);
      case 'assistant': return this.assistant(j, t);
      case 'system': return this.system(j, t);
      case 'attachment': return this.attachment(j.attachment, t);
      case 'queue-operation':
        if (typeof j.content === 'string' && /<task-notification>/.test(j.content)) this.notificaTask(j.content);
        if (t > this.ultimaAttivita) this.ultimaAttivita = t;
        return;
    }
  }

  /**
   * Il progetto NON è il cwd dell'ultima riga (cambia a ogni cd) né il primo (le sessioni lunghe dell'app cambiano progetto).
   * È la cartella dove l'agente lavora di più nel turno corrente, contando anche le sottocartelle;
   * escluse home, ~/.claude, cartelle temporanee e cartelle troppo in alto (C:\, C:\dev).
   */
  private notaCwd(cwd: string) {
    this.cwdAttuale = cwd;
    if (!this.primoCwd) this.primoCwd = cwd;
    const n = norm(cwd);
    if (n === this.home || n.startsWith(this.claudeDir + path.sep) || n === this.claudeDir || n.startsWith(this.tmp)) return;
    if (n.split(/[\\/]/).filter(Boolean).length < 3) return;
    const v = this.cwdTurno.get(n); if (v) v.n++; else this.cwdTurno.set(n, { orig: cwd, n: 1 });
    this.cwdScelto = undefined;
  }
  private cwdTurno = new Map<string, { orig: string; n: number }>();
  private cwdScelto?: string; private cwdTurnoPrima?: string;
  private nuovoTurnoCwd() { const c = this.sceltaCwd(); if (c) this.cwdTurnoPrima = c; this.cwdTurno.clear(); this.cwdScelto = undefined; }
  private sceltaCwd(): string | undefined {
    if (this.cwdScelto) return this.cwdScelto;
    let meglio: { orig: string; punti: number; prof: number } | undefined;
    for (const [n, v] of this.cwdTurno) {
      let punti = 0;
      for (const [m, w] of this.cwdTurno) if (m === n || m.startsWith(n + path.sep)) punti += w.n;
      const prof = n.length;
      if (!meglio || punti > meglio.punti || (punti === meglio.punti && prof > meglio.prof)) meglio = { orig: v.orig, punti, prof };
    }
    return (this.cwdScelto = meglio?.orig);
  }
  get cwdStabile() { return this.sceltaCwd() ?? this.cwdTurnoPrima ?? this.primoCwd; }

  private user(j: any, t: number) {
    const c = j.message?.content;
    if (typeof c === 'string') { if (!j.isMeta) this.prompt(c, t); return; }
    if (!Array.isArray(c)) return;
    let testo = '';
    for (const b of c) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'tool_result') this.risultato(b, j.toolUseResult, t);
      else if (b.type === 'text' && typeof b.text === 'string') testo += b.text + '\n';
    }
    if (testo && !j.isMeta) this.prompt(testo, t);
  }

  private prompt(testo: string, t: number) {
    if (/^\[Request interrupted by user/.test(testo.trim())) {
      for (const s of this.aperti.values()) { s.fine = t; s.errore = true; s.risultato = 'Interrotto'; }
      this.aperti.clear();
      return this.segna('interrotto', t);
    }
    if (/<task-notification>/.test(testo)) this.notificaTask(testo);
    if (ePromptInterno(testo)) return this.segna('prompt', t); // il modello riparte, ma non l'ha scritto l'utente
    const p = pulisciPrompt(testo);
    if (!p) return;
    this.nuovoTurnoCwd();
    if (!this.primoPrompt) this.primoPrompt = accorcia(p, 300);
    this.ultimoPrompt = accorcia(p, 300);
    this.inizioTurno = t;
    this.segna('prompt', t);
  }

  private assistant(j: any, t: number) {
    const m = j.message ?? {};
    if (typeof m.model === 'string' && m.model !== '<synthetic>') this.modello = m.model;
    if (j.isApiErrorMessage) { this.ultimoErrore = { quando: t, testo: `Errore API ${j.apiErrorStatus ?? ''}`.trim() }; return this.segna('errore-api', t); }
    const c = Array.isArray(m.content) ? m.content : [];
    for (const b of c) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'thinking' || b.type === 'redacted_thinking') this.segna('thinking', t);
      else if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        this.ultimoTesto = accorcia(b.text, 500);
        this.segna(m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence' || m.stop_reason === 'max_tokens' || m.stop_reason === 'refusal' ? 'testo-fine' : 'testo', t);
      } else if (b.type === 'tool_use' && typeof b.id === 'string') {
        const nome = typeof b.name === 'string' ? b.name : '?';
        const { azione, dettaglio } = descriviStrumento(nome, b.input);
        const s: Strumento = { id: b.id, nome, azione, dettaglio, inizio: t || this.ultimaAttivita };
        if ((nome === 'TaskStop' || nome === 'KillShell') && b.input && typeof (b.input.task_id ?? b.input.shell_id) === 'string') s.dettaglio = b.input.task_id ?? b.input.shell_id;
        arricchisci(s, b.input);
        this.aperti.set(b.id, s);
        this.strumenti.push(s);
        if (this.strumenti.length > MAX_STRUMENTI) this.strumenti.splice(0, this.strumenti.length - MAX_STRUMENTI);
        this.totStrumenti++;
        this.segna('tool_use', t);
      }
    }
  }

  private risultato(b: any, tur: any, t: number) {
    const id = b.tool_use_id;
    const s = this.aperti.get(id) ?? this.strumenti.find((x) => x.id === id);
    this.aperti.delete(id);
    const testo = testoRisultato(b.content);
    if (s) {
      s.fine = t || s.inizio;
      const pulito = s.sensibile ? oscuraEnv(testo) : testo;
      s.risultato = pulito.length > MAX_RISULTATO ? '…' + pulito.slice(-MAX_RISULTATO) : pulito;
      if (b.is_error) s.errore = true;
      // comando finito in background? (lanciato così, o spostato dopo il timeout)
      // la frase deve stare all'INIZIO: altrove può essere solo testo stampato da un comando
      const inizio = testo.slice(0, 600);
      const fraseBg = /^\s*(Command running in background with ID: (\w+)|Command did not complete within .{0,40}?moved to the background \(ID: (\w+)\))/.exec(inizio);
      const idBg = (tur && typeof tur === 'object' && typeof tur.backgroundTaskId === 'string' ? tur.backgroundTaskId : undefined) ?? fraseBg?.[2] ?? fraseBg?.[3];
      const out = idBg ? /Output is being written to: (.+?\.output)/.exec(inizio)?.[1]?.trim() : undefined;
      if (idBg && !this.background.has(idBg)) { s.background = { taskId: idBg, outputFile: out }; this.background.set(idBg, s); }
      if ((s.nome === 'TaskStop' || s.nome === 'KillShell') && !b.is_error && s.dettaglio) {
        const fermato = this.background.get(s.dettaglio);
        if (fermato?.background) { fermato.background.finito = true; fermato.background.esito = 'killed'; }
      }
      // sotto-agente
      if (tur && typeof tur === 'object' && typeof tur.agentId === 'string') {
        s.agentId = tur.agentId;
        if (tur.status === 'async_launched' || /Async agent launched/.test(testo)) {
          s.background = { taskId: tur.agentId, outputFile: typeof tur.outputFile === 'string' ? tur.outputFile : undefined };
          this.background.set(tur.agentId, s);
        }
      } else if (s.nome === 'Agent' && /agentId: (\w+)/.test(testo)) {
        s.agentId = /agentId: (\w+)/.exec(testo)![1];
        if (/Async agent launched/.test(testo)) { s.background = { taskId: s.agentId }; this.background.set(s.agentId, s); }
      }
    }
    if (b.is_error) { this.totErrori++; this.ultimoErrore = { quando: t, testo: accorcia(testo, 200) }; }
    this.segna('tool_result', t);
  }

  private system(j: any, t: number) {
    if (j.subtype === 'stop_hook_summary') return this.segna('fine-turno', t);
    if (j.subtype === 'api_error') return this.segna('riprova-api', t);
    if (t > this.ultimaAttivita) this.ultimaAttivita = t;
  }

  private attachment(a: any, t: number) {
    if (!a || typeof a !== 'object') return;
    if (a.type === 'task_status' && typeof a.taskId === 'string') {
      const s = this.background.get(a.taskId);
      const finito = typeof a.status === 'string' && a.status !== 'running' && a.status !== 'pending';
      if (s?.background) {
        if (typeof a.outputFilePath === 'string') s.background.outputFile = a.outputFilePath;
        if (finito) { s.background.finito = true; s.background.esito = a.status; }
      } else if (!finito) { // task che non abbiamo visto partire (registro letto a metà): lo teniamo lo stesso
        const ns: Strumento = { id: 'task-' + a.taskId, nome: a.taskType === 'local_agent' ? 'Agent' : 'Bash', azione: `In background: ${accorcia(a.description, 50)}`, inizio: t, fine: t,
          background: { taskId: a.taskId, outputFile: typeof a.outputFilePath === 'string' ? a.outputFilePath : undefined } };
        this.background.set(a.taskId, ns);
      }
      if (t > this.ultimaAttivita) this.ultimaAttivita = t;
    } else if (a.type === 'queued_command' && typeof a.prompt === 'string') {
      this.notificaTask(a.prompt);
    }
  }

  private notificaTask(testo: string) {
    const re = /<task-notification>([\s\S]*?)<\/task-notification>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(testo))) {
      const id = /<task-id>(.*?)<\/task-id>/.exec(m[1])?.[1];
      const stato = /<status>(.*?)<\/status>/.exec(m[1])?.[1] ?? 'completed';
      const s = id ? this.background.get(id) : undefined;
      if (s?.background && stato !== 'running') { s.background.finito = true; s.background.esito = stato; }
    }
  }

  /** Comandi/agenti in background ancora in corso. */
  get backgroundAttivi(): Strumento[] { return [...this.background.values()].filter((s) => !s.background?.finito); }

  get titolo(): string {
    return this.titoloCustom ?? this.titoloAi ?? this.nomeAgente
      ?? (this.primoPrompt ? accorcia(this.primoPrompt.split(' ').slice(0, 8).join(' '), 60) : `Sessione ${this.id.slice(0, 8)}`);
  }
}

function norm(p: string) { return path.resolve(p).toLowerCase().replace(/[\\/]+$/, ''); }

export function testoRisultato(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x: any) => (x && typeof x.text === 'string' ? x.text : x && x.type ? `[${x.type}]` : '')).join('\n');
  return c == null ? '' : JSON.stringify(c);
}

const MAX_DIFF = 3000;
const taglia = (x: unknown) => (typeof x === 'string' ? x : '');

/** Dettagli in più per la vista dettaglio: differenza di Edit/Write, file sensibili, prompt dei sotto-agenti. */
function arricchisci(s: Strumento, input: any) {
  const i = input && typeof input === 'object' ? input : {};
  if (eSensibile(i.file_path) || eSensibile(i.command) || eSensibile(i.notebook_path)) s.sensibile = true;
  let vecchio = '', nuovo = '';
  if (s.nome === 'Edit') { vecchio = taglia(i.old_string); nuovo = taglia(i.new_string); }
  else if (s.nome === 'MultiEdit' && Array.isArray(i.edits)) {
    vecchio = i.edits.map((e: any) => taglia(e?.old_string)).join('\n⋯\n');
    nuovo = i.edits.map((e: any) => taglia(e?.new_string)).join('\n⋯\n');
  } else if (s.nome === 'Write') nuovo = taglia(i.content);
  if (vecchio || nuovo) {
    const troncato = vecchio.length > MAX_DIFF || nuovo.length > MAX_DIFF;
    s.diff = { vecchio: vecchio.slice(0, MAX_DIFF), nuovo: nuovo.slice(0, MAX_DIFF), ...(troncato ? { troncato } : {}) };
    if (s.sensibile) s.diff = { vecchio: oscuraEnv(s.diff.vecchio), nuovo: oscuraEnv(s.diff.nuovo), troncato: s.diff.troncato };
  }
  if ((s.nome === 'Agent' || s.nome === 'Task') && typeof i.prompt === 'string') s.extra = accorcia(i.prompt, 600);
  if (s.nome === 'AskUserQuestion' && Array.isArray(i.questions))
    s.extra = i.questions.map((q: any) => {
      const opzioni = Array.isArray(q?.options) ? q.options.map((o: any) => `  • ${taglia(o?.label)}`).join('\n') : '';
      return taglia(q?.question) + (opzioni ? '\n' + opzioni : '');
    }).join('\n\n');
  if (s.nome === 'WebSearch' && typeof i.query === 'string') s.dettaglio = i.query;
}
