/** Crea fixtures/segreti: una sessione piena di chiavi FINTE (comandi, output, .env, modifiche) per provare l'oscuramento. */
import fs from 'node:fs';
import path from 'node:path';

export const CHIAVI_FINTE = [
  'sk-ant-api03-FINTAfintaFINTAfinta1234567890abcdef', 'ghp_FINTAfintaFINTAfinta1234567890ab', 'EAAFINTAfintaFINTAfinta1234567890ZZ',
  'AIzaSyFINTAfintaFINTAfinta123456789', 'sk_live_FINTAfintaFINTA1234', 'valore-segreto-del-db', 'porta-segreta-4242', 'passwordsegreta',
];
const [anthropic, github, meta, google, stripe, db, porta, pw] = CHIAVI_FINTE;

const sid = 'segreti-0001';
let k = 0; let sec = 0;
const T0 = Date.parse('2026-11-15T09:00:00Z');
const base = () => ({ uuid: `s${++k}`, parentUuid: null, isSidechain: false, timestamp: new Date(T0 + (sec += 2) * 1000).toISOString(), sessionId: sid, cwd: 'C:\\Users\\utente\\progetti\\esempio', gitBranch: 'main', entrypoint: 'cli', version: '2.1.325', userType: 'external' });
const righe: object[] = [];
const usa = (id: string, name: string, input: object) => righe.push({ ...base(), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } });
const ris = (id: string, content: string, is_error = false) => righe.push({ ...base(), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...(is_error ? { is_error } : {}) }] }, toolUseResult: {} });

righe.push({ type: 'custom-title', customTitle: 'Sessione di esempio (segreti)', sessionId: sid });
righe.push({ ...base(), type: 'user', message: { role: 'user', content: `Usa questa chiave: ${anthropic}` } });
usa('t1', 'Bash', { command: `curl -H "Authorization: Bearer ${github}" https://api.github.com/user`, description: 'Controlla il token GitHub' });
ris('t1', `{"login":"esempio","token":"${github}"}`);
usa('t2', 'Read', { file_path: 'C:\\Users\\utente\\progetti\\esempio\\.env' });
ris('t2', `DATABASE_URL=${db}\nPORT=${porta}\nMETA_TOKEN=${meta}`);
usa('t3', 'Edit', { file_path: 'C:\\Users\\utente\\progetti\\esempio\\config.ts', old_string: `const key = "${google}";`, new_string: 'const key = process.env.GOOGLE_KEY;' });
ris('t3', 'ok');
usa('t4', 'Bash', { command: `STRIPE_SECRET=${stripe} node paga.js --password ${pw}`, description: 'Prova un pagamento' });
ris('t4', `Exit code 1\nErrore: chiave ${stripe} non valida`, true);
righe.push({ ...base(), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: `Ho tolto la chiave ${google} dal codice.` }] } });

const dir = path.join(__dirname, '..', 'fixtures', 'segreti');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `${sid}.jsonl`), righe.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`scritte ${righe.length} righe in fixtures/segreti`);
