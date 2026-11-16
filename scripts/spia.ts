/**
 * SPIA — fase 0 di AGENT TOWER.
 * Segue in diretta i registri JSONL delle sessioni Claude Code e stampa gli eventi in modo leggibile.
 * SOLO LETTURA: apre i file in lettura, non scrive mai in ~/.claude.
 *
 *   npx tsx scripts/spia.ts                 # sessioni toccate nell'ultima ora, da adesso in poi
 *   npx tsx scripts/spia.ts --minuti 600    # finestra più larga
 *   npx tsx scripts/spia.ts --storia 15     # stampa anche gli ultimi 15 eventi di ogni sessione
 *   npx tsx scripts/spia.ts --secondi 30    # si ferma dopo 30 secondi (utile per le prove)
 *   npx tsx scripts/spia.ts --cartella fixtures --minuti 99999999 --storia 200 --secondi 2   # rilegge le fixture
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const opt = (n: string, d: number) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
const MINUTI = opt('minuti', 60);
const STORIA = opt('storia', 0);
const SECONDI = opt('secondi', 0);
const iCart = args.indexOf('--cartella');
const ROOT = iCart >= 0 ? path.resolve(args[iCart + 1]) : path.join(os.homedir(), '.claude', 'projects');
// le fixture usano {{FIXTURES}} al posto della cartella vera dei file .output
const FIXTURES = path.resolve(__dirname, '..', 'fixtures');

// ---------- colori minimi ----------
const c = (n: number) => (s: string) => `\x1b[${n}m${s}\x1b[0m`;
const grigio = c(90), verde = c(32), giallo = c(33), rosso = c(31), ciano = c(36), viola = c(35), grassetto = c(1);

// ---------- oscuramento segreti (versione base, la completa arriva in fase 3) ----------
const SEGRETI: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, /sk-[A-Za-z0-9_-]{16,}/g, /ghp_[A-Za-z0-9]{20,}/g, /EAA[A-Za-z0-9]{20,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g, /Bearer\s+[A-Za-z0-9._-]{10,}/g,
  /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*\S+/g,
];
const oscura = (s: string) => SEGRETI.reduce((a, r) => a.replace(r, (m, k) => (k ? `${k}=••••` : '••••')), s);
const corto = (s: unknown, n = 110) => {
  let t = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  t = oscura(t.replace(/\s+/g, ' ').trim());
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

// ---------- stato per file ----------
type Info = { offset: number; resto: string; nome: string; progetto: string; sub: boolean; inCorso: Map<string, { nome: string; t: number }> };
const files = new Map<string, Info>();
const outputSeguiti = new Map<string, { offset: number; chi: string }>();

function nomeProgetto(cartella: string) {
  // "C--dev-tt-social" -> "tt-social" (ultima parte leggibile); il cwd vero arriva dagli eventi
  return cartella.replace(/^[a-zA-Z]--/, '').split('-').slice(-2).join('-');
}

function scopri() {
  const limite = Date.now() - MINUTI * 60_000;
  const giro = (d: string, prof: number) => {
    let voci: fs.Dirent[] = [];
    try { voci = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of voci) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (prof < 3 && e.name !== 'memory' && e.name !== 'tool-results') giro(p, prof + 1); continue; }
      if (!e.name.endsWith('.jsonl') || files.has(p)) continue;
      let st: fs.Stats; try { st = fs.statSync(p); } catch { continue; }
      if (st.mtimeMs < limite) continue;
      const sub = p.includes(`${path.sep}subagents${path.sep}`);
      const rel = path.relative(ROOT, p).split(path.sep);
      const info: Info = {
        offset: 0, resto: '', sub, progetto: nomeProgetto(rel[0]),
        nome: sub ? '↳ ' + e.name.replace(/^agent-|\.jsonl$/g, '').slice(0, 8) : e.name.slice(0, 8),
        inCorso: new Map(),
      };
      if (sub) { // il .meta.json accanto dice tipo e descrizione del sotto-agente
        try { const m = JSON.parse(fs.readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8')); info.nome = `↳ ${m.agentType ?? 'agente'}: ${corto(m.description, 30)}`; } catch {}
      }
      files.set(p, info);
      console.log(grigio(`+ seguo ${path.relative(ROOT, p)} (${(st.size / 1e6).toFixed(1)} MB)`));
      if (STORIA > 0) { leggi(p, info, STORIA); }
      else { info.offset = st.size; } // da adesso in poi
    }
  };
  giro(ROOT, 0);
}

function ora(ts?: string) { const d = ts ? new Date(ts) : new Date(); return d.toLocaleTimeString('it-IT'); }

function leggi(p: string, info: Info, soloUltimi = 0) {
  let st: fs.Stats; try { st = fs.statSync(p); } catch { return; }
  if (st.size < info.offset) { info.offset = 0; info.resto = ''; } // file riscritto/troncato
  if (st.size === info.offset) return;
  let inizio = info.offset;
  if (soloUltimi && st.size - inizio > 4e6) inizio = st.size - 4e6; // storia: basta la coda
  const fd = fs.openSync(p, 'r');
  try {
    const buf = Buffer.alloc(st.size - inizio);
    fs.readSync(fd, buf, 0, buf.length, inizio);
    info.offset = st.size;
    const testo = info.resto + buf.toString('utf8');
    const righe = testo.split('\n');
    info.resto = righe.pop() ?? ''; // ultima riga forse a metà
    let daStampare = righe.filter((r) => r.trim());
    if (inizio > 0 && soloUltimi) daStampare = daStampare.slice(1); // prima riga troncata
    const eventi: string[] = [];
    for (const r of daStampare) { const s = descrivi(r, info); if (s) eventi.push(s); }
    for (const s of soloUltimi ? eventi.slice(-soloUltimi) : eventi) console.log(s);
  } finally { fs.closeSync(fd); }
}

function testa(info: Info, ts?: string) {
  return `${grigio(ora(ts))} ${ciano(info.progetto)} ${info.sub ? viola(info.nome) : grassetto(info.nome)}`;
}

function descrivi(riga: string, info: Info): string | null {
  let j: any; try { j = JSON.parse(riga); } catch { return testa(info) + rosso(' [riga non leggibile]'); }
  const t = j.type;
  if (t === 'custom-title' && j.customTitle) { if (!info.sub) info.nome = corto(j.customTitle, 40); return null; }
  if (t === 'agent-name' && j.agentName && !info.sub) { return null; }
  if (j.cwd && !info.sub) info.progetto = path.basename(j.cwd) || info.progetto;
  const h = testa(info, j.timestamp);
  const parti = Array.isArray(j.message?.content) ? j.message.content : null;

  if (t === 'user') {
    if (typeof j.message?.content === 'string') return j.isMeta ? null : `${h} 👤 ${corto(j.message.content)}`;
    const out: string[] = [];
    for (const b of parti ?? []) {
      if (b.type === 'text' && !j.isMeta) out.push(`${h} 👤 ${corto(b.text)}`);
      if (b.type === 'tool_result') {
        const tu = info.inCorso.get(b.tool_use_id); info.inCorso.delete(b.tool_use_id);
        const durata = tu ? ` ${((Date.parse(j.timestamp) - tu.t) / 1000).toFixed(1)}s` : '';
        const testo = typeof b.content === 'string' ? b.content : (b.content ?? []).map((x: any) => x.text ?? `[${x.type}]`).join(' ');
        const bg = /Output is being written to: (.+?\.output)/.exec(testo);
        if (bg) segui(bg[1].trim(), info);
        out.push(`${h}    ${b.is_error ? rosso('✗') : verde('✓')} ${grigio((tu?.nome ?? '?') + durata)} ${b.is_error ? rosso(corto(testo, 90)) : grigio(corto(testo, 90))}`);
      }
    }
    return out.join('\n') || null;
  }
  if (t === 'assistant') {
    const out: string[] = [];
    for (const b of parti ?? []) {
      if (b.type === 'text' && b.text?.trim()) out.push(`${h} 🤖 ${corto(b.text)}`);
      if (b.type === 'thinking') out.push(`${h} ${grigio('💭 pensa…')}`);
      if (b.type === 'tool_use') {
        info.inCorso.set(b.id, { nome: b.name, t: Date.parse(j.timestamp) });
        const i = b.input ?? {};
        let cosa = '';
        if (b.name === 'Bash' || b.name === 'PowerShell') cosa = `${giallo(i.description ?? '')} ${grigio('$ ' + corto(i.command, 70))}${i.run_in_background ? viola(' [background]') : ''}`;
        else if (['Read', 'Write', 'Edit'].includes(b.name)) cosa = corto(i.file_path, 80);
        else if (b.name === 'Agent') cosa = viola(`${i.subagent_type ?? ''}: ${corto(i.description, 60)}`);
        else if (b.name === 'AskUserQuestion') cosa = rosso('❓ ' + corto(i.questions?.[0]?.question, 80));
        else if (b.name === 'Grep' || b.name === 'Glob') cosa = corto(i.pattern, 60);
        else cosa = grigio(corto(i, 70));
        out.push(`${h} 🔧 ${grassetto(b.name)} ${cosa}`);
      }
    }
    if (j.isApiErrorMessage) out.push(`${h} ${rosso('⚠ errore API ' + (j.apiErrorStatus ?? ''))}`);
    return out.join('\n') || null;
  }
  if (t === 'system') {
    if (j.subtype === 'stop_hook_summary') return `${h} ${verde('■ turno finito')}`;
    if (j.subtype === 'compact_boundary') return `${h} ${grigio('↻ conversazione compattata')}`;
    if (j.subtype === 'api_error') return `${h} ${rosso('⚠ errore API, riprovo')}`;
    return null;
  }
  if (t === 'attachment') {
    const a = j.attachment ?? {};
    if (a.type === 'task_status') { if (a.outputFilePath) segui(a.outputFilePath, info); return `${h} ${viola(`⏱ task ${a.taskId} ${a.status}: ${corto(a.description, 50)}`)}`; }
    if (a.type === 'queued_command' && /<task-notification>/.test(a.prompt ?? '')) {
      const st = /<status>(.*?)<\/status>/.exec(a.prompt)?.[1] ?? 'notifica';
      return `${h} ${viola('🔔 task in background: ' + st)}`;
    }
    return null;
  }
  if (t === 'queue-operation' && j.operation === 'enqueue' && j.content) return `${h} 📥 ${grigio('in coda: ' + corto(j.content, 80))}`;
  return null; // api-request, file-history, ecc.: rumore
}

// ---------- file .output dei comandi in background ----------
function segui(p: string, info: Info) {
  p = p.replace('{{FIXTURES}}', FIXTURES);
  if (outputSeguiti.has(p)) return;
  let size = 0; try { size = fs.statSync(p).size; } catch {}
  outputSeguiti.set(p, { offset: Math.max(0, size - 400), chi: `${info.progetto} ${info.nome}` });
  console.log(grigio(`  ↪ seguo l'output in diretta: ${path.basename(p)}`));
}
function leggiOutput() {
  for (const [p, o] of outputSeguiti) {
    let st: fs.Stats; try { st = fs.statSync(p); } catch { continue; }
    if (st.size <= o.offset) continue;
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(Math.min(st.size - o.offset, 64_000));
      fs.readSync(fd, buf, 0, buf.length, o.offset);
      o.offset += buf.length;
      for (const r of buf.toString('utf8').split(/\r?\n/).filter((x) => x.trim()).slice(-5))
        console.log(`${grigio(ora())} ${viola('│ ' + path.basename(p, '.output'))} ${corto(r, 100)}`);
    } finally { fs.closeSync(fd); }
  }
}

// ---------- giro principale (polling leggero: stat ogni 700 ms) ----------
console.log(grassetto(`SPIA — seguo ${ROOT} (sessioni toccate negli ultimi ${MINUTI} min). Ctrl+C per uscire.`));
scopri();
const t1 = setInterval(() => { for (const [p, i] of files) leggi(p, i); leggiOutput(); }, 700);
const t2 = setInterval(scopri, 5000);
if (SECONDI > 0) setTimeout(() => { clearInterval(t1); clearInterval(t2); console.log(grigio('fine prova')); }, SECONDI * 1000);
