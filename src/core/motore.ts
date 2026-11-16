import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { LettoreCoda } from './lettore';
import { ModelloSessione } from './modello';
import { ordina, vistaSessione } from './stato';
import { OPZIONI_STATO_DEFAULT, Sessione } from './tipi';
import { oscura, suOgniStringa } from './oscura';
import { EventoHook, StatoHook } from './hook';

export interface OpzioniMotore {
  radice?: string;                  // default ~/.claude/projects
  nascondiDopoOre?: number;         // default 24
  inattivoDopoMin?: number;         // default 30
  sogliaPermessoSec?: number;       // default 10
  ora?: () => number;               // per i test
  home?: string;                    // per i test
  trasformaPercorso?: (p: string) => string; // per i test (fixture con {{FIXTURES}})
  intervalloControlloMs?: number;   // giro di sicurezza oltre a fs.watch (default 2000)
  intervalloScopertaMs?: number;    // ricerca file nuovi (default 5000)
  oscuraSegreti?: boolean;          // default true: nessun segreto esce dal motore
  strumentiInLista?: number;        // quanti strumenti per sessione nella lista (default 60; l'app ne usa 1, il resto va nel dettaglio)
}

interface Meta { agentType?: string; description?: string; toolUseId?: string; finished?: boolean }
interface Voce {
  file: string; lettore: LettoreCoda; modello: ModelloSessione;
  sessioneId: string;               // id della sessione madre (o di sé stessa)
  agentId?: string;                 // se è un sotto-agente
  meta?: Meta; metaMtime?: number; mtime: number;
}

/**
 * Motore dati: trova le sessioni, le legge in modo incrementale e produce la lista "riassunta".
 * Eventi: 'sessioni' (Sessione[]) quando qualcosa cambia; 'errore' (Error) per problemi non fatali.
 * SOLO LETTURA: non scrive mai nella cartella dei registri.
 */
export class Motore extends EventEmitter {
  readonly radice: string;
  private voci = new Map<string, Voce>();
  private sporchi = new Set<string>();
  private watcher?: fs.FSWatcher;
  private timer: NodeJS.Timeout[] = [];
  private ultimaFirma = '';
  private emissione?: NodeJS.Timeout;
  /** eventi degli hook (opzionali): stato "aspetta te" certo */
  readonly hook = new StatoHook();
  private o: Required<Omit<OpzioniMotore, 'radice' | 'home' | 'trasformaPercorso'>> & Pick<OpzioniMotore, 'home' | 'trasformaPercorso'>;

  constructor(opz: OpzioniMotore = {}) {
    super();
    this.radice = opz.radice ?? path.join(os.homedir(), '.claude', 'projects');
    this.o = {
      nascondiDopoOre: opz.nascondiDopoOre ?? 24, inattivoDopoMin: opz.inattivoDopoMin ?? 30, sogliaPermessoSec: opz.sogliaPermessoSec ?? 10,
      ora: opz.ora ?? Date.now, home: opz.home, trasformaPercorso: opz.trasformaPercorso,
      intervalloControlloMs: opz.intervalloControlloMs ?? 2000, intervalloScopertaMs: opz.intervalloScopertaMs ?? 5000, oscuraSegreti: opz.oscuraSegreti ?? true, strumentiInLista: opz.strumentiInLista ?? 60,
    };
  }

  /** Lettura iniziale + sorveglianza. */
  avvia() {
    this.scopri();
    this.emetti(true);
    try {
      this.watcher = fs.watch(this.radice, { recursive: true }, (_ev, nome) => {
        if (!nome) return;
        const p = path.join(this.radice, nome.toString());
        if (p.endsWith('.jsonl') || p.endsWith('.meta.json')) { this.sporchi.add(p.replace(/\.meta\.json$/, '.jsonl')); this.programma(); }
      });
      this.watcher.on('error', (e) => this.emit('errore', e));
    } catch (e) { this.emit('errore', e); } // senza watch si va avanti col giro di controllo
    this.timer.push(setInterval(() => this.controlla(), this.o.intervalloControlloMs));
    this.timer.push(setInterval(() => { this.scopri(); this.emetti(); }, this.o.intervalloScopertaMs));
    return this;
  }

  ferma() {
    this.watcher?.close(); this.watcher = undefined;
    for (const t of this.timer) clearInterval(t); this.timer = [];
    if (this.emissione) clearTimeout(this.emissione);
  }

  /** Cerca file nuovi e smette di seguire quelli troppo vecchi. Pubblica per i test. */
  scopri() {
    const limite = this.o.ora() - this.o.nascondiDopoOre * 3600_000;
    const visti = new Set<string>();
    for (const progetto of leggiDir(this.radice)) {
      if (!progetto.isDirectory()) continue;
      const dirP = path.join(this.radice, progetto.name);
      for (const e of leggiDir(dirP)) {
        if (e.isFile() && e.name.endsWith('.jsonl')) this.considera(path.join(dirP, e.name), e.name.slice(0, -6), undefined, limite, visti);
        else if (e.isDirectory() && e.name !== 'memory') {
          const dirSub = path.join(dirP, e.name, 'subagents');
          for (const s of leggiDir(dirSub))
            if (s.isFile() && /^agent-.+\.jsonl$/.test(s.name)) this.considera(path.join(dirSub, s.name), e.name, s.name.slice(6, -6), limite, visti);
        }
      }
    }
    for (const f of [...this.voci.keys()]) if (!visti.has(f)) this.voci.delete(f);
  }

  private considera(file: string, sessioneId: string, agentId: string | undefined, limite: number, visti: Set<string>) {
    let st: fs.Stats; try { st = fs.statSync(file); } catch { return; }
    if (st.mtimeMs < limite) return;
    visti.add(file);
    if (this.voci.has(file)) return;
    const v: Voce = { file, sessioneId, agentId, lettore: new LettoreCoda(file), mtime: 0,
      modello: new ModelloSessione(agentId ?? sessioneId, file, { home: this.o.home }) };
    this.voci.set(file, v);
    this.leggi(v);
  }

  private leggi(v: Voce) {
    try {
      for (const r of v.lettore.leggiRighe()) v.modello.elaboraRiga(r);
      if (v.agentId) {
        const fm = v.file.replace(/\.jsonl$/, '.meta.json');
        const st = fs.statSync(fm, { throwIfNoEntry: false });
        if (st && st.mtimeMs !== v.metaMtime) { v.metaMtime = st.mtimeMs; try { v.meta = JSON.parse(fs.readFileSync(fm, 'utf8')); } catch {} }
      }
    } catch (e) { this.emit('errore', e); }
  }

  /** Giro di sicurezza: file cambiati senza notifica, output in background che crescono, stati che scadono col tempo. */
  private controlla() {
    for (const v of this.voci.values()) {
      const st = fs.statSync(v.file, { throwIfNoEntry: false });
      if (st && (st.size !== v.lettore.offset || st.mtimeMs !== v.mtime)) { v.mtime = st.mtimeMs; this.sporchi.add(v.file); }
      for (const s of v.modello.backgroundAttivi) {
        const f = s.background?.outputFile; if (!f) continue;
        const so = fs.statSync(this.percorso(f), { throwIfNoEntry: false });
        if (so) v.modello.tocca(Math.min(so.mtimeMs, this.o.ora()));
      }
    }
    this.programma();
  }

  private programma() {
    if (this.emissione) return;
    this.emissione = setTimeout(() => {
      this.emissione = undefined;
      for (const f of this.sporchi) { const v = this.voci.get(f); if (v) this.leggi(v); }
      this.sporchi.clear();
      this.emetti();
    }, 150);
  }

  private emetti(forza = false) {
    const lista = this.istantanea();
    const firma = JSON.stringify(lista.map(firmaSessione));
    if (!forza && firma === this.ultimaFirma) return;
    this.ultimaFirma = firma;
    this.emit('sessioni', lista);
  }

  /** Un evento hook arrivato dal server locale. Il file della sessione si legge subito (può essere nuovo). */
  riceviHook(e: EventoHook) {
    this.hook.applica(e, this.o.ora());
    this.hook.pulisci(this.o.ora() - this.o.nascondiDopoOre * 3600_000);
    if (e.transcript_path && !e.agent_id) {
      const f = path.resolve(e.transcript_path);
      if (f.startsWith(path.resolve(this.radice)) && f.endsWith('.jsonl')) {
        if (!this.voci.has(f)) this.considera(f, path.basename(f, '.jsonl'), undefined, 0, new Set());
        else this.sporchi.add(f);
      }
    }
    // PreToolUse/PostToolUse: il registro cambia proprio ora, rileggiamo prima di decidere
    for (const v of this.voci.values()) if (v.sessioneId === e.session_id) this.sporchi.add(v.file);
    this.programma();
  }
  private infoHook(id: string) { return { attivo: this.hook.attivo(id), info: this.hook.di(id) }; }

  percorso(p: string) { return this.o.trasformaPercorso ? this.o.trasformaPercorso(p) : p; }

  private opzStato() {
    return { ora: this.o.ora(), ...OPZIONI_STATO_DEFAULT, inattivoDopoMs: this.o.inattivoDopoMin * 60_000, sogliaPermessoMs: this.o.sogliaPermessoSec * 1000 };
  }
  private gruppi() {
    const madri = new Map<string, Voce>(); const figli = new Map<string, Voce[]>();
    for (const v of this.voci.values()) {
      if (v.agentId) { const l = figli.get(v.sessioneId) ?? []; l.push(v); figli.set(v.sessioneId, l); }
      else madri.set(v.sessioneId, v);
    }
    return { madri, figli };
  }
  private vistaFiglio(f: Voce, madre: Voce | undefined, os_: ReturnType<Motore['opzStato']>, maxStrumenti: number) {
    const cwd = madre?.modello.cwdStabile;
    const progettoPadre = cwd ? { progetto: path.basename(cwd) || cwd, cwd } : undefined;
    return vistaSessione(f.modello, [], os_, {
      padreId: f.sessioneId, toolUseIdPadre: f.meta?.toolUseId, tipoAgente: f.meta?.agentType, descrizione: f.meta?.description,
      finitoMeta: f.meta?.finished, progettoPadre, hook: f.agentId ? { attivo: this.hook.attivo(f.agentId) || this.hook.attivo(f.sessioneId), info: this.hook.di(f.agentId) } : undefined,
    }, maxStrumenti);
  }
  /** Tutto ciò che esce dal motore passa da qui: niente segreti verso l'interfaccia. */
  private pulisci<T>(x: T): T { return this.o.oscuraSegreti ? suOgniStringa(x, oscura) : x; }

  /** Elenco riassunto delle sessioni, ordinato (aspetta te → lavora → finito → inattivo). */
  istantanea(): Sessione[] {
    const os_ = this.opzStato();
    const { madri, figli } = this.gruppi();
    const limite = os_.ora - this.o.nascondiDopoOre * 3600_000;
    const out: Sessione[] = [];
    for (const [sid, madre] of madri) {
      const n = this.o.strumentiInLista;
      const sotto = (figli.get(sid) ?? []).map((f) => this.vistaFiglio(f, madre, os_, Math.min(n, 30))).sort(ordina);
      const vista = vistaSessione(madre.modello, sotto, os_, { hook: this.infoHook(sid) }, n);
      if (vista.ultimaAttivita >= limite || sotto.some((s) => s.ultimaAttivita >= limite)) out.push(vista);
    }
    // sotto-agenti orfani (madre già sparita o non ancora scritta): mostrati da soli
    for (const [sid, l] of figli) if (!madri.has(sid)) for (const f of l) out.push(this.vistaFiglio(f, undefined, os_, Math.min(this.o.strumentiInLista, 30)));
    return this.pulisci(out.sort(ordina));
  }

  /** Vista completa di UNA sessione (o di un sotto-agente, per agentId): più strumenti, con output e differenze. */
  dettaglio(id: string, maxStrumenti = 200): Sessione | undefined {
    const os_ = this.opzStato();
    const { madri, figli } = this.gruppi();
    const madre = madri.get(id);
    if (madre) {
      const sotto = (figli.get(id) ?? []).map((f) => this.vistaFiglio(f, madre, os_, 5)).sort(ordina);
      return this.pulisci(vistaSessione(madre.modello, sotto, os_, { hook: this.infoHook(id) }, maxStrumenti));
    }
    for (const l of figli.values()) for (const f of l)
      if (f.agentId === id) return this.pulisci(this.vistaFiglio(f, madri.get(f.sessioneId), os_, maxStrumenti));
    return undefined;
  }

  /** Percorso VERO (non oscurato) del file .output di uno strumento in background, per seguirlo in diretta. */
  fileOutput(id: string, strumentoId: string): string | undefined {
    for (const v of this.voci.values()) {
      if ((v.agentId ?? v.sessioneId) !== id) continue;
      const s = v.modello.strumenti.find((x) => x.id === strumentoId) ?? [...v.modello.background.values()].find((x) => x.id === strumentoId);
      const f = s?.background?.outputFile;
      return f ? this.percorso(f) : undefined;
    }
    return undefined;
  }

  /** Percorsi veri della sessione (per "Apri cartella" e "Apri registro"). */
  percorsi(id: string): { cartella?: string; registro?: string } | undefined {
    for (const v of this.voci.values()) {
      if ((v.agentId ?? v.sessioneId) !== id) continue;
      const madre = v.agentId ? [...this.voci.values()].find((m) => !m.agentId && m.sessioneId === v.sessioneId) : v;
      return { cartella: (madre ?? v).modello.cwdStabile, registro: v.file };
    }
    return undefined;
  }

  /** Per diagnosi/test. */
  statistiche() {
    let righe = 0, rotte = 0;
    for (const v of this.voci.values()) { righe += v.modello.righeLette; rotte += v.modello.righeRotte; }
    return { file: this.voci.size, righe, rotte };
  }
}

function leggiDir(d: string): fs.Dirent[] { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } }

function firmaSessione(s: Sessione): unknown {
  return [s.id, s.stato, s.motivo, s.ultimaAttivita, s.ultimaAzione, s.titolo, s.contatori.strumenti, s.contatori.errori, s.contatori.inBackground,
    Math.floor(s.daQuando / 1000), s.sottoAgenti.map(firmaSessione)];
}
