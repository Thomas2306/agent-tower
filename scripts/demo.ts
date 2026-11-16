/**
 * DEMO: crea sessioni finte "vive" in una cartella temporanea (MAI in ~/.claude) e le fa evolvere.
 * Serve per le prove e per il video. Poi avvia l'app che legge da lì:
 *   npx tsx scripts/demo.ts            → scrive in %TEMP%\agent-tower-demo e stampa il comando per avviare l'app
 *   (in un altro terminale)  set AGENT_TOWER_RADICE=%TEMP%\agent-tower-demo && npx electron .
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const RADICE = path.join(os.tmpdir(), 'agent-tower-demo');
fs.rmSync(RADICE, { recursive: true, force: true });
let n = 0;
const ora = () => new Date().toISOString();
const base = (sid: string, cwd: string, ramo = 'main') => ({ uuid: `d${++n}`, parentUuid: null, isSidechain: false, timestamp: ora(), sessionId: sid, cwd, gitBranch: ramo, entrypoint: 'cli', version: '2.1.325', userType: 'external' });

class Sessione {
  file: string;
  constructor(public sid: string, public cwd: string, titolo: string, public ramo = 'main', cartella = 'C--progetti-' + path.basename(cwd)) {
    const d = path.join(RADICE, cartella); fs.mkdirSync(d, { recursive: true });
    this.file = path.join(d, sid + '.jsonl');
    this.scrivi({ type: 'custom-title', customTitle: titolo, sessionId: sid });
  }
  scrivi(o: object) { fs.appendFileSync(this.file, JSON.stringify(o) + '\n'); }
  prompt(t: string) { this.scrivi({ ...base(this.sid, this.cwd, this.ramo), type: 'user', message: { role: 'user', content: t } }); }
  usa(id: string, name: string, input: object) { this.scrivi({ ...base(this.sid, this.cwd, this.ramo), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } }); }
  risultato(id: string, content: string, errore = false, extra = {}) { this.scrivi({ ...base(this.sid, this.cwd, this.ramo), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...(errore ? { is_error: true } : {}) }] }, toolUseResult: extra }); }
  testo(t: string) { this.scrivi({ ...base(this.sid, this.cwd, this.ramo), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: t }] } }); }
  fine() { this.scrivi({ ...base(this.sid, this.cwd, this.ramo), type: 'system', subtype: 'stop_hook_summary', level: 'suggestion' }); }
}

// 1. aspetta te: domanda
const a = new Sessione('demo-0001', 'C:\\progetti\\negozio-online', 'Pagamenti con Stripe', 'feature/checkout');
a.prompt('Aggiungi il pagamento con Stripe al checkout');
a.usa('a1', 'Read', { file_path: 'C:\\progetti\\negozio-online\\src\\checkout.ts' }); a.risultato('a1', '...');
a.usa('a2', 'AskUserQuestion', { questions: [{ question: 'Vuoi anche Apple Pay o solo carta?', header: 'Metodi', options: [] }] });

// 2. lavora con 2 sotto-agenti
const b = new Sessione('demo-0002', 'C:\\progetti\\app-meteo', 'Rifare la schermata previsioni');
b.prompt('Rifai la schermata delle previsioni');
b.usa('b1', 'Agent', { description: 'Cerca i componenti grafici', subagent_type: 'Explore' });
b.usa('b2', 'Agent', { description: 'Controlla i test esistenti', subagent_type: 'general-purpose' });
const sub = (id: string, tipo: string, desc: string, tu: string) => {
  const d = path.join(path.dirname(b.file), b.sid, 'subagents'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, `agent-${id}.meta.json`), JSON.stringify({ agentType: tipo, description: desc, toolUseId: tu, finished: false }));
  const f = path.join(d, `agent-${id}.jsonl`);
  const s = { ...base(b.sid, b.cwd), isSidechain: true, agentId: id };
  fs.appendFileSync(f, JSON.stringify({ ...s, type: 'user', message: { role: 'user', content: desc } }) + '\n');
  return f;
};
const s1 = sub('s1', 'Explore', 'Cerca i componenti grafici', 'b1');
const s2 = sub('s2', 'general-purpose', 'Controlla i test esistenti', 'b2');
const usaSub = (f: string, id: string, name: string, input: object) =>
  fs.appendFileSync(f, JSON.stringify({ ...base(b.sid, b.cwd), isSidechain: true, type: 'assistant', message: { role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } }) + '\n');
usaSub(s1, 'x1', 'Grep', { pattern: 'ForecastCard' });
usaSub(s2, 'x2', 'Bash', { command: 'npm test -- forecast', description: 'Avvia i test delle previsioni' });

// 3. lavora: comando lungo con un errore prima
const c = new Sessione('demo-0003', 'C:\\progetti\\sito-portfolio', 'Sistemare la build');
c.prompt('La build fallisce, sistemala');
c.usa('c1', 'Bash', { command: 'npm run build', description: 'Prova la build' }); c.risultato('c1', 'Exit code 1\nType error in Header.tsx', true);
c.usa('c2', 'Edit', { file_path: 'C:\\progetti\\sito-portfolio\\src\\Header.tsx',
  old_string: 'export function Header({ titolo }) {\n  return <h1>{titolo.toUpperCase}</h1>;',
  new_string: 'export function Header({ titolo }: { titolo: string }) {\n  return <h1>{titolo.toUpperCase()}</h1>;' });
c.risultato('c2', 'ok');
c.usa('c3', 'Bash', { command: 'npm run build', description: 'Ricompila il sito' });

// 4. finito
const d = new Sessione('demo-0004', 'C:\\progetti\\bot-telegram', 'Comando /meteo per il bot');
d.prompt('Aggiungi il comando /meteo'); d.usa('d1', 'Write', { file_path: 'C:\\progetti\\bot-telegram\\comandi\\meteo.js' }); d.risultato('d1', 'ok');
d.testo('Fatto: il comando /meteo risponde con le previsioni di oggi.'); d.fine();

// 5. in background
const e = new Sessione('demo-0005', 'C:\\progetti\\video-tiktok', 'Esportare i video della settimana');
e.prompt('Esporta tutti i video della settimana');
e.usa('e1', 'Bash', { command: 'node esporta.js --tutti', description: 'Esporta 7 video', run_in_background: true });
e.risultato('e1', `Command running in background with ID: bdemo1. Output is being written to: ${path.join(RADICE, 'bdemo1.output')}. You will be notified when it completes.`, false, { backgroundTaskId: 'bdemo1' });
e.testo('Sto esportando i 7 video in background, ti avviso quando ha finito.'); e.fine();
fs.writeFileSync(path.join(RADICE, 'bdemo1.output'), 'video 1 di 7 esportato\n');

// 6. aspetta un permesso (CERTO, dagli hook): manda l'evento tramite lo script vero dello hook, se l'app l'ha preparato
const g = new Sessione('demo-0006', 'C:\\progetti\\api-clienti', 'Rilascio della versione 2.0', 'release/2.0');
g.prompt('Pubblica la versione 2.0');
g.usa('g1', 'Bash', { command: 'npm version 2.0.0', description: 'Aggiorna la versione' }); g.risultato('g1', 'v2.0.0');
g.usa('g2', 'Bash', { command: 'git push origin release/2.0 --tags', description: 'Pubblica il ramo e i tag' });
const scriptHook = path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), 'agent-tower', 'hook', 'agent-tower-hook.cjs');
function mandaHook(evento: object) {
  if (!fs.existsSync(scriptHook)) return console.log('(script dello hook non trovato: avvia prima l\'app)');
  const p = spawn(process.execPath, [scriptHook], { stdio: ['pipe', 'ignore', 'ignore'] });
  p.stdin.end(JSON.stringify({ session_id: 'demo-0006', transcript_path: g.file, cwd: g.cwd, ...evento }));
}
setTimeout(() => {
  mandaHook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git push origin release/2.0 --tags' } });
  mandaHook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'git push origin release/2.0 --tags' } });
}, 1500);

console.log(`Demo pronta in ${RADICE}`);
console.log(`Avvia l'app con:  set AGENT_TOWER_RADICE=${RADICE} && npx electron .`);

// un po' di vita: l'export avanza, la build finisce e il sotto-agente Explore finisce
let passo = 1;
const t = setInterval(() => {
  passo++;
  if (passo <= 7) fs.appendFileSync(path.join(RADICE, 'bdemo1.output'), `video ${passo} di 7 esportato\n`);
  if (passo === 4) { c.risultato('c3', 'Build completata'); c.usa('c4', 'Bash', { command: 'npx playwright test', description: 'Prova il sito nel browser' }); }
  if (passo === 6) fs.writeFileSync(path.join(path.dirname(s1), 'agent-s1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Cerca i componenti grafici', toolUseId: 'b1', finished: true }));
  if (passo > 40) { clearInterval(t); console.log('demo finita'); }
}, 3000);
