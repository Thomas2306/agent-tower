/**
 * Estrae fixture ANONIME da registri veri (sola lettura sui registri).
 * Tiene la struttura (tipi, uuid, tempi, nomi strumenti, errori, background, sotto-agenti)
 * e sostituisce OGNI testo con segnaposto: prompt, risposte, comandi, percorsi, output.
 *
 *   npx tsx scripts/estrai-fixture.ts <registro.jsonl> <nome> [--cerca "regex"] [--max 120] [--ferma-dopo-match]
 */
import fs from 'node:fs';
import path from 'node:path';

const [src, nome, ...resto] = process.argv.slice(2);
if (!src || !nome) { console.error('uso: estrai-fixture <registro.jsonl> <nome> [--cerca re] [--max n] [--ferma-dopo-match]'); process.exit(1); }
const flag = (n: string) => resto.includes('--' + n);
const val = (n: string) => { const i = resto.indexOf('--' + n); return i >= 0 ? resto[i + 1] : undefined; };
const CERCA = val('cerca') ? new RegExp(val('cerca')!) : null;
const MAX = Number(val('max') ?? 120);
const OUT = path.join(__dirname, '..', 'fixtures', nome);

const TIPI_TENUTI = new Set(['user', 'assistant', 'system', 'custom-title', 'agent-name', 'last-prompt', 'queue-operation', 'attachment', 'mode', 'ai-title']);
const CAMPI_TOP = ['type', 'uuid', 'parentUuid', 'isSidechain', 'timestamp', 'sessionId', 'gitBranch', 'entrypoint', 'version', 'agentId', 'isMeta',
  'isApiErrorMessage', 'apiErrorStatus', 'subtype', 'level', 'permissionMode', 'operation', 'userType', 'promptId', 'sourceToolAssistantUUID',
  'hookCount', 'preventedContinuation', 'stopReason', 'hasOutput', 'mode', 'leafUuid', 'isCompactSummary'];
const CWD_FINTO = 'C:\\Users\\utente\\progetti\\esempio';
const DIR_TASK = `{{FIXTURES}}\\${nome}\\tasks`;

let n = 0; const num = () => ++n;
const bgIds = new Set<string>();

function anonimizzaInput(nomeTool: string, i: any) {
  const k = num();
  switch (nomeTool) {
    case 'Bash': case 'PowerShell':
      return { command: `echo esempio-${k}`, description: `Comando di esempio ${k}`, ...(i?.run_in_background ? { run_in_background: true } : {}), ...(i?.timeout ? { timeout: i.timeout } : {}) };
    case 'Read': case 'Write': case 'Edit': return { file_path: `${CWD_FINTO}\\file-${k}.ts` };
    case 'Grep': case 'Glob': return { pattern: `parola-${k}` };
    case 'AskUserQuestion': return { questions: [{ question: `Domanda di esempio ${k}?`, header: 'Scelta', multiSelect: false, options: [{ label: 'Sì', description: 'prima opzione' }, { label: 'No', description: 'seconda opzione' }] }] };
    case 'Agent': return { subagent_type: i?.subagent_type ?? 'general-purpose', description: `Sotto-agente di esempio ${k}`, prompt: `Compito di esempio ${k}` };
    case 'TaskStop': return { task_id: i?.task_id };
    default: return {};
  }
}

function anonimizzaRisultato(b: any) {
  const testo = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
  const bg = /background with ID: (\w+)|\(ID: (\w+)\)/.exec(testo);
  let content: string;
  if (bg && /Output is being written to/.test(testo)) {
    const id = bg[1] ?? bg[2]; bgIds.add(id);
    content = `Command running in background with ID: ${id}. Output is being written to: ${DIR_TASK}\\${id}.output. You will be notified when it completes.`;
  } else if (b.is_error) content = `Exit code 1\nErrore di esempio ${num()}`;
  else content = `Output di esempio ${num()}`;
  return { type: 'tool_result', tool_use_id: b.tool_use_id, content, ...(b.is_error ? { is_error: true } : {}) };
}

function anonimizzaToolUseResult(r: any) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return typeof r === 'string' ? 'Risultato di esempio' : undefined;
  const o: any = {};
  for (const k of ['interrupted', 'isImage', 'noOutputExpected', 'backgroundTaskId', 'timedOutAfterMs', 'status', 'agentId', 'agentType', 'isAsync', 'totalDurationMs', 'totalToolUseCount'])
    if (k in r) o[k] = r[k];
  if ('stdout' in r) { o.stdout = r.stdout ? 'stdout di esempio' : ''; o.stderr = r.stderr ? 'stderr di esempio' : ''; }
  if (r.questions) o.answers = { 'Domanda di esempio?': 'Sì' };
  return o;
}

function anonimizza(j: any): any | null {
  if (!TIPI_TENUTI.has(j.type)) return null;
  const o: any = {};
  for (const k of CAMPI_TOP) if (k in j) o[k] = j[k];
  if ('cwd' in j) o.cwd = CWD_FINTO;
  if (j.type === 'custom-title') o.customTitle = `Sessione di esempio (${nome})`;
  if (j.type === 'ai-title') o.aiTitle = `Titolo automatico (${nome})`;
  if (j.type === 'agent-name') o.agentName = `agente-${nome}`;
  if (j.type === 'last-prompt') o.lastPrompt = 'Ultimo prompt di esempio';
  if (j.type === 'queue-operation' && 'content' in j) o.content = 'Messaggio in coda di esempio';
  if (j.type === 'system' && j.subtype === 'api_error') Object.assign(o, { retryInMs: j.retryInMs, retryAttempt: j.retryAttempt, maxRetries: j.maxRetries });
  if (j.type === 'attachment') {
    const a = j.attachment ?? {};
    if (a.type === 'task_status') {
      bgIds.add(a.taskId);
      o.attachment = { type: a.type, taskId: a.taskId, taskType: a.taskType, status: a.status, description: 'Task di esempio', outputFilePath: `${DIR_TASK}\\${a.taskId}.output` };
    } else if (a.type === 'queued_command' && /<task-notification>/.test(a.prompt ?? '')) {
      const id = /<task-id>(.*?)<\/task-id>/.exec(a.prompt)?.[1] ?? 'x';
      const tu = /<tool-use-id>(.*?)<\/tool-use-id>/.exec(a.prompt)?.[1] ?? '';
      const st = /<status>(.*?)<\/status>/.exec(a.prompt)?.[1] ?? 'completed';
      o.attachment = { type: a.type, prompt: `<task-notification>\n<task-id>${id}</task-id>\n<tool-use-id>${tu}</tool-use-id>\n<output-file>${DIR_TASK}\\${id}.output</output-file>\n<status>${st}</status>\n<summary>Task di esempio terminato</summary>\n</task-notification>` };
    } else return null; // gli altri allegati contengono prompt di sistema, email, file: fuori
  }
  if (j.message) {
    const m = j.message; const om: any = { role: m.role };
    if (m.model) om.model = m.model;
    if (m.stop_reason !== undefined) om.stop_reason = m.stop_reason;
    if (typeof m.content === 'string') om.content = j.type === 'user' ? `Prompt di esempio ${num()}` : `Testo di esempio ${num()}`;
    else if (Array.isArray(m.content)) {
      om.content = m.content.map((b: any) => {
        if (b.type === 'text') return { type: 'text', text: j.type === 'user' ? `Prompt di esempio ${num()}` : `Risposta di esempio ${num()}` };
        if (b.type === 'thinking') return { type: 'thinking', thinking: '', signature: '' };
        if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: anonimizzaInput(b.name, b.input) };
        if (b.type === 'tool_result') return anonimizzaRisultato(b);
        return { type: b.type }; // image/document: solo il tipo
      });
    }
    o.message = om;
  }
  if ('toolUseResult' in j) { const r = anonimizzaToolUseResult(j.toolUseResult); if (r !== undefined) o.toolUseResult = r; }
  return o;
}

function estrai(file: string, dest: string, cerca: RegExp | null, max: number, fermaDopo: boolean) {
  const righe = fs.readFileSync(file, 'utf8').split('\n').filter((r) => r.trim());
  let inizio = 0;
  if (cerca) {
    const hit = righe.findIndex((r) => cerca.test(r));
    if (hit < 0) throw new Error(`nessuna riga trovata per ${cerca} in ${file}`);
    // risali fino al prompt utente (testo vero, non tool_result) che apre quel turno
    inizio = hit;
    for (let i = hit; i >= 0; i--) {
      try { const j = JSON.parse(righe[i]); if (j.type === 'user' && !j.isMeta && (typeof j.message?.content === 'string' || j.message?.content?.some?.((b: any) => b.type === 'text'))) { inizio = i; break; } } catch {}
    }
  }
  const out: string[] = [];
  // il titolo, ovunque sia, va in testa
  const titolo = righe.find((r) => r.includes('"type":"custom-title"'));
  if (titolo && !righe.slice(inizio).includes(titolo)) { const a = anonimizza(JSON.parse(titolo)); if (a) out.push(JSON.stringify(a)); }
  let matchVisto = false;
  for (let i = inizio; i < righe.length && out.length < max; i++) {
    let j: any; try { j = JSON.parse(righe[i]); } catch { continue; }
    const a = anonimizza(j); if (a) out.push(JSON.stringify(a));
    if (cerca && cerca.test(righe[i])) matchVisto = true;
    if (fermaDopo && matchVisto) break;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out.join('\n') + '\n');
  return out.length;
}

// --- sessione principale ---
const sid = path.basename(src, '.jsonl');
const tot = estrai(src, path.join(OUT, `${sid}.jsonl`), CERCA, MAX, flag('ferma-dopo-match'));
console.log(`${nome}: ${tot} righe`);

// --- sotto-agenti citati nell'estratto ---
const subDir = path.join(path.dirname(src), sid, 'subagents');
const estratto = fs.readFileSync(path.join(OUT, `${sid}.jsonl`), 'utf8');
if (fs.existsSync(subDir)) {
  for (const f of fs.readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const id = f.replace(/^agent-|\.jsonl$/g, '');
    if (!estratto.includes(id)) continue;
    const k = estrai(path.join(subDir, f), path.join(OUT, sid, 'subagents', f), null, 40, false);
    try {
      const m = JSON.parse(fs.readFileSync(path.join(subDir, f.replace('.jsonl', '.meta.json')), 'utf8'));
      fs.writeFileSync(path.join(OUT, sid, 'subagents', f.replace('.jsonl', '.meta.json')),
        JSON.stringify({ agentType: m.agentType, description: 'Sotto-agente di esempio', toolUseId: m.toolUseId, spawnDepth: m.spawnDepth, finished: m.finished }));
    } catch {}
    console.log(`  sotto-agente ${id}: ${k} righe`);
  }
}

// --- file .output finti per i comandi in background ---
for (const id of bgIds) {
  fs.mkdirSync(path.join(OUT, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'tasks', `${id}.output`), Array.from({ length: 5 }, (_, i) => `riga ${i + 1} di output di esempio`).join('\n') + '\n');
  console.log(`  output finto ${id}.output`);
}
