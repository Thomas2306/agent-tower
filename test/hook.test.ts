import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import { ModelloSessione } from '../src/core/modello';
import { calcolaStato } from '../src/core/stato';
import { OPZIONI_STATO_DEFAULT } from '../src/core/tipi';
import { leggiEvento, StatoHook, type EventoHook } from '../src/core/hook';
import { anteprima, applica, comandoHook, EVENTI, statoInstallazione, togli, unisci } from '../src/core/installa-hook';
import { Motore } from '../src/core/motore';
import { ms, R } from './aiuti';

const nuovo = (...righe: string[]) => { const m = new ModelloSessione('sess-1', 'x', { home: 'C:\\Users\\utente' }); righe.forEach((r) => m.elaboraRiga(r)); return m; };
const ev = (hook_event_name: string, extra: Partial<EventoHook> = {}): EventoHook => ({ hook_event_name, session_id: 'sess-1', ...extra });
const st = (m: ModelloSessione, sec: number, h: StatoHook, id = 'sess-1') => calcolaStato(m, [], { ora: ms(sec), ...OPZIONI_STATO_DEFAULT }, false, { attivo: h.attivo(id), info: h.di(id) });

describe('stato con gli hook', () => {
  it('PermissionRequest → aspetta te CERTO, e si chiude quando lo strumento finisce nel registro', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Bash', { command: 'rm -rf build', description: 'Pulisce' }));
    h.applica(ev('PreToolUse', { tool_name: 'Bash' }), ms(1));
    h.applica(ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }), ms(1.2));
    // il PreToolUse in ritardo (gli hook girano in parallelo) non chiude l'attesa
    h.applica(ev('PreToolUse', { tool_name: 'Bash' }), ms(1.4));
    expect(st(m, 2, h)).toMatchObject({ stato: 'aspetta', motivo: 'permesso', stimato: false, ultimaAzione: 'Chiede il permesso: Pulisce' });
    // dopo 20 minuti è ancora un permesso che aspetta te
    expect(st(m, 1200, h)).toMatchObject({ stato: 'aspetta', motivo: 'permesso' });
    // approvato: il comando finisce e il registro scrive il risultato → torna a lavorare
    m.elaboraRiga(R.risultato(30, 't1', 'ok'));
    expect(st(m, 31, h).stato).toBe('lavora');
  });

  it('PostToolUse chiude la richiesta', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Edit', { file_path: 'C:\\a\\b.ts' }));
    h.applica(ev('PermissionRequest', { tool_name: 'Edit' }), ms(1));
    expect(st(m, 5, h).stato).toBe('aspetta');
    h.applica(ev('PostToolUse', { tool_name: 'Edit' }), ms(8));
    expect(st(m, 9, h)).toMatchObject({ stato: 'lavora' });
  });

  it('con gli hook attivi uno strumento fermo NON diventa "forse aspetta te"', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Edit', { file_path: 'C:\\a\\b.ts' }));
    expect(st(m, 30, h)).toMatchObject({ stato: 'aspetta', stimato: true }); // senza eventi: stima come prima
    h.applica(ev('PreToolUse', { tool_name: 'Edit' }), ms(1));
    expect(st(m, 30, h)).toMatchObject({ stato: 'lavora' });
  });

  it('notifica permission_prompt da sola basta; elicitation = ti chiede una risposta', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'mcp__x__y', {}));
    h.applica(ev('Notification', { notification_type: 'permission_prompt', message: 'Claude needs your permission to use y' }), ms(7));
    expect(st(m, 8, h)).toMatchObject({ stato: 'aspetta', motivo: 'permesso', daQuando: ms(7) });
    h.applica(ev('Notification', { notification_type: 'elicitation_dialog', message: 'Scegli un account' }), ms(9));
    expect(st(m, 10, h)).toMatchObject({ stato: 'aspetta', ultimaAzione: 'Ti chiede: Scegli un account' });
  });

  it('richiesta di permesso di uno strumento che non compare mai nel registro: scade dopo 3 s', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.testo(1, 'ok'));
    h.applica(ev('PermissionRequest', { tool_name: 'Write' }), ms(2));
    expect(st(m, 3, h).stato).toBe('aspetta');
    expect(st(m, 6, h).stato).not.toBe('aspetta');
  });

  it('SessionEnd → inattiva (chiusa)', () => {
    const h = new StatoHook();
    const m = nuovo(R.prompt(0, 'vai'), R.testo(1, 'fatto'), R.fineTurno(1));
    h.applica(ev('SessionEnd'), ms(5));
    expect(st(m, 6, h)).toMatchObject({ stato: 'inattivo', motivo: 'chiusa' });
  });

  it('eventi dei sotto-agenti vanno sotto il loro agent_id', () => {
    const h = new StatoHook();
    expect(h.applica(ev('PermissionRequest', { agent_id: 'ag1', tool_name: 'Bash' }), 1)).toBe('ag1');
    expect(h.di('ag1')?.attesa?.tipo).toBe('permesso');
    expect(h.di('sess-1')).toBeUndefined();
    expect(h.attivo('sess-1')).toBe(true);
  });

  it('leggiEvento scarta le cose strane', () => {
    expect(leggiEvento(null)).toBeUndefined();
    expect(leggiEvento({ hook_event_name: 'Stop' })).toBeUndefined();
    expect(leggiEvento({ hook_event_name: 'Stop', session_id: 7 })).toBeUndefined();
    expect(leggiEvento({ hook_event_name: 'Stop', session_id: 'a', tool_name: { x: 1 } })).toMatchObject({ session_id: 'a', tool_name: undefined });
  });
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'at-hook-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const CMD = comandoHook('C:\\Users\\x\\AppData\\Roaming\\agent-tower\\hook\\agent-tower-hook.cjs', 'C:\\Program Files\\nodejs\\node.exe');

describe('installazione in settings.json', () => {
  const esistente = {
    permissions: { allow: ['Bash(git:*)'] }, theme: 'dark',
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mio-controllo.sh' }] }], PreCompact: [{ hooks: [{ type: 'command', command: 'x' }] }] },
  };

  it('comando: percorsi con / e tra virgolette (anche con spazi)', () => {
    expect(CMD).toBe('"C:/Program Files/nodejs/node.exe" "C:/Users/x/AppData/Roaming/agent-tower/hook/agent-tower-hook.cjs"');
    expect(comandoHook('/a/h.cjs', undefined, '/App/at')).toBe('ELECTRON_RUN_AS_NODE=1 "/App/at" "/a/h.cjs"');
  });

  it('unisci aggiunge senza toccare gli hook che ci sono; togli riporta ESATTAMENTE a prima', () => {
    const u = unisci(esistente, CMD);
    expect(statoInstallazione(esistente)).toBe('assenti');
    expect(statoInstallazione(u)).toBe('attivi');
    const pre = (u.hooks as any).PreToolUse;
    expect(pre[0]).toEqual(esistente.hooks.PreToolUse[0]); // il tuo hook resta primo e identico
    expect(pre[1].hooks[0]).toEqual({ type: 'command', command: CMD, async: true });
    expect(u.permissions).toEqual(esistente.permissions);
    expect(togli(u)).toEqual(esistente);
    expect(unisci(u, CMD)).toEqual(u); // ripetibile: niente doppioni
    expect(togli(unisci({ theme: 'x' }, CMD))).toEqual({ theme: 'x' }); // se "hooks" non c'era, sparisce di nuovo
  });

  it('applica: backup, formato rispettato, cambia solo il blocco hooks; rimuovi torna al file identico', () => {
    const f = path.join(tmp, 'settings.json');
    const originale = JSON.stringify({ permissions: { allow: ['Bash(curl:*)'] }, theme: 'dark' }, null, 2) + '\n';
    fs.writeFileSync(f, originale);
    const a = anteprima(f, CMD, 'installa');
    expect(fs.readFileSync(f, 'utf8')).toBe(originale); // l'anteprima non scrive
    const e = applica(f, path.join(tmp, 'backup'), CMD, 'installa', new Date('2026-11-15T10:00:00Z'));
    expect(e.stato).toBe('attivi');
    expect(fs.readFileSync(e.backup!, 'utf8')).toBe(originale);
    const dopo = fs.readFileSync(f, 'utf8');
    expect(dopo).toBe(a.dopo);
    expect(dopo.startsWith(originale.slice(0, -3))).toBe(true); // tutto uguale fino a dove inizia "hooks"
    expect(Object.keys(JSON.parse(dopo).hooks)).toEqual(EVENTI.map((x) => x.evento));
    const r = applica(f, path.join(tmp, 'backup'), CMD, 'rimuovi', new Date('2026-11-15T10:01:00Z'));
    expect(r.stato).toBe('assenti');
    expect(fs.readFileSync(f, 'utf8')).toBe(originale);
    expect(fs.readdirSync(path.join(tmp, 'backup'))).toHaveLength(2);
    expect(fs.existsSync(f + '.agent-tower-tmp')).toBe(false);
  });

  it('settings.json rotto: non lo tocca', () => {
    const f = path.join(tmp, 'rotto.json');
    fs.writeFileSync(f, '{ "theme": "dark", ');
    expect(() => applica(f, path.join(tmp, 'b2'), CMD, 'installa')).toThrow(/non è un JSON valido/);
    expect(fs.readFileSync(f, 'utf8')).toBe('{ "theme": "dark", ');
    expect(fs.existsSync(path.join(tmp, 'b2'))).toBe(false);
  });

  it('rispetta CRLF, rientro a 4 e BOM', () => {
    const f = path.join(tmp, 'crlf.json');
    const orig = '\uFEFF' + JSON.stringify({ theme: 'dark' }, null, 4).replace(/\n/g, '\r\n') + '\r\n';
    fs.writeFileSync(f, orig);
    applica(f, path.join(tmp, 'b3'), CMD, 'installa');
    const t = fs.readFileSync(f, 'utf8');
    expect(t.startsWith('\uFEFF{\r\n    "theme"')).toBe(true);
    expect(t.includes('\n') && !/[^\r]\n/.test(t)).toBe(true);
    applica(f, path.join(tmp, 'b3'), CMD, 'rimuovi');
    expect(fs.readFileSync(f, 'utf8')).toBe(orig);
  });
});

describe('script dello hook → server locale (vero, con node)', () => {
  const script = path.join(__dirname, '..', 'risorse', 'agent-tower-hook.cjs');
  const lancia = (cartella: string, input: string) => new Promise<number>((ok) => {
    const copia = path.join(cartella, 'agent-tower-hook.cjs');
    fs.copyFileSync(script, copia);
    const p = spawn(process.execPath, [copia], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
    p.on('exit', (c) => { expect(out).toBe(''); ok(c ?? -1); }); // non scrive MAI niente (Claude Code non vede niente)
    p.stdin.end(input);
  });

  it('manda solo i campi minimi, con la chiave; senza app esce subito con 0', async () => {
    const cartella = fs.mkdtempSync(path.join(tmp, 'h-'));
    const ricevuti: { corpo: any; chiave: unknown; host?: string }[] = [];
    const server = http.createServer((req, res) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { ricevuti.push({ corpo: JSON.parse(d), chiave: req.headers['x-agent-tower'], host: req.headers.host }); res.writeHead(204).end(); }); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const porta = (server.address() as any).port;
    fs.writeFileSync(path.join(cartella, 'connessione.json'), JSON.stringify({ porta, token: 'segreto' }));
    const evento = { hook_event_name: 'PostToolUse', session_id: 's1', transcript_path: 'C:/x.jsonl', cwd: 'C:/p', tool_name: 'Write', tool_use_id: 'tu1',
      tool_input: { file_path: 'C:/p/.env', content: 'API_KEY=sk-ant-api03-VERO' }, tool_response: { output: 'tanta roba' }, prompt: 'il mio prompt privato' };
    expect(await lancia(cartella, JSON.stringify(evento))).toBe(0);
    server.close();
    expect(ricevuti).toHaveLength(1);
    expect(ricevuti[0].chiave).toBe('segreto');
    expect(ricevuti[0].host).toBe(`127.0.0.1:${porta}`);
    const c = JSON.stringify(ricevuti[0].corpo);
    expect(c).not.toContain('sk-ant'); expect(c).not.toContain('tanta roba'); expect(c).not.toContain('prompt privato');
    expect(ricevuti[0].corpo).toMatchObject({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Write', tool_input: { file_path: 'C:/p/.env' } });
    // app spenta (porta chiusa) e input rotto: sempre 0, sempre silenzio
    const t0 = Date.now();
    expect(await lancia(cartella, JSON.stringify(evento))).toBe(0);
    expect(await lancia(cartella, 'non json')).toBe(0);
    fs.rmSync(path.join(cartella, 'connessione.json'));
    expect(await lancia(cartella, JSON.stringify(evento))).toBe(0);
    expect(Date.now() - t0).toBeLessThan(2500);
  });

  it('il motore usa gli eventi: permesso certo su una sessione vera dal vivo', async () => {
    const radice = fs.mkdtempSync(path.join(tmp, 'r-'));
    const cart = path.join(radice, 'C--p'); fs.mkdirSync(cart);
    const f = path.join(cart, 'sess-1.jsonl');
    fs.writeFileSync(f, [R.prompt(0, 'vai'), R.usa(1, 't1', 'Bash', { command: 'git push', description: 'Pubblica' })].join('\n') + '\n');
    const mot = new Motore({ radice, ora: () => ms(20), home: 'C:\\Users\\utente', intervalloControlloMs: 100000, intervalloScopertaMs: 100000 });
    mot.avvia();
    expect(mot.istantanea()[0]).toMatchObject({ stato: 'lavora', motivo: 'strumento' });
    mot.riceviHook({ hook_event_name: 'PermissionRequest', session_id: 'sess-1', transcript_path: f, tool_name: 'Bash', tool_input: { command: 'git push' } });
    expect(mot.istantanea()[0]).toMatchObject({ stato: 'aspetta', motivo: 'permesso', stimato: false, conHook: true });
    // un percorso fuori dalla cartella dei registri viene ignorato
    mot.riceviHook({ hook_event_name: 'SessionStart', session_id: 'altro', transcript_path: 'C:\\Windows\\win.ini' });
    expect(mot.istantanea()).toHaveLength(1);
    mot.ferma();
  });
});
