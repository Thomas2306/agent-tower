import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

/**
 * Installazione OPZIONALE degli hook in ~/.claude/settings.json.
 * Regole del piano: solo dopo conferma, backup prima di scrivere, si AGGIUNGE senza toccare il resto,
 * e si può togliere tutto (rimuove solo le voci di AGENT TOWER).
 */

export const SEGNO = 'agent-tower-hook.cjs'; // ogni nostra voce contiene questo nel comando: così la riconosciamo

/** Eventi che ascoltiamo. Quelli degli strumenti con matcher "*" (tutti gli strumenti). */
export const EVENTI: { evento: string; matcher?: string }[] = [
  { evento: 'SessionStart' }, { evento: 'UserPromptSubmit' },
  { evento: 'PreToolUse', matcher: '*' }, { evento: 'PostToolUse', matcher: '*' }, { evento: 'PostToolUseFailure', matcher: '*' },
  { evento: 'PermissionRequest', matcher: '*' }, { evento: 'PermissionDenied', matcher: '*' },
  { evento: 'Notification' }, { evento: 'Stop' }, { evento: 'StopFailure' },
  { evento: 'SubagentStop' }, { evento: 'SessionEnd' },
];

type Json = Record<string, unknown>;
interface Gruppo { matcher?: string; hooks?: { type?: string; command?: string; async?: boolean }[] }

const eNostra = (g: unknown) => !!g && typeof g === 'object' && Array.isArray((g as Gruppo).hooks) && (g as Gruppo).hooks!.some((h) => typeof h?.command === 'string' && h.command.includes(SEGNO));

/** Comando dello hook. Gli hook su Windows girano in Git Bash (verificato), su Mac in sh: stessa sintassi. */
export function comandoHook(script: string, node?: string, electron?: string): string {
  const q = (p: string) => `"${p.replace(/\\/g, '/')}"`;
  if (node) return `${q(node)} ${q(script)}`;
  if (electron) return `ELECTRON_RUN_AS_NODE=1 ${q(electron)} ${q(script)}`;
  throw new Error('nessun programma per eseguire lo hook');
}

/** Il blocco che aggiungiamo (serve anche per mostrarlo a chi deve confermare). */
export function bloccoNostro(comando: string): Record<string, Gruppo[]> {
  const out: Record<string, Gruppo[]> = {};
  for (const { evento, matcher } of EVENTI) out[evento] = [{ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: comando, async: true }] }];
  return out;
}

/** Toglie solo le nostre voci. Se un evento resta vuoto lo toglie; se "hooks" resta vuoto, anche lui. */
export function togli(s: Json): Json {
  const out: Json = structuredClone(s);
  const h = out.hooks as Record<string, unknown[]> | undefined;
  if (!h || typeof h !== 'object') return out;
  for (const ev of Object.keys(h)) {
    if (!Array.isArray(h[ev])) continue;
    const resto = h[ev].filter((g) => !eNostra(g));
    if (resto.length) h[ev] = resto; else delete h[ev];
  }
  if (!Object.keys(h).length) delete out.hooks;
  return out;
}

/** Aggiunge le nostre voci (prima toglie eventuali vecchie nostre: così è ripetibile). Non tocca nient'altro. */
export function unisci(s: Json, comando: string): Json {
  const out = togli(s);
  const h = (out.hooks && typeof out.hooks === 'object' ? out.hooks : {}) as Record<string, unknown[]>;
  for (const [ev, gruppi] of Object.entries(bloccoNostro(comando))) h[ev] = [...(Array.isArray(h[ev]) ? h[ev] : []), ...gruppi];
  out.hooks = h;
  return out;
}

export type StatoInstallazione = 'assenti' | 'attivi' | 'parziali';
export function statoInstallazione(s: Json): StatoInstallazione {
  const h = s.hooks as Record<string, unknown[]> | undefined;
  const n = EVENTI.filter(({ evento }) => Array.isArray(h?.[evento]) && h![evento].some(eNostra)).length;
  return n === 0 ? 'assenti' : n === EVENTI.length ? 'attivi' : 'parziali';
}

/** Formato del file com'è (rientro, a capo finale, CRLF): lo rispettiamo per cambiare solo il necessario. */
function formato(t: string) {
  const m = t.match(/\n([ \t]+)"/);
  return { rientro: m ? m[1] : '  ', finale: /\r?\n$/.test(t), crlf: t.includes('\r\n') };
}
function scrivi(o: Json, f: ReturnType<typeof formato>) {
  let t = JSON.stringify(o, null, f.rientro);
  if (f.finale) t += '\n';
  return f.crlf ? t.replace(/\n/g, '\r\n') : t;
}

function leggiSettings(file: string): { testo: string; dati: Json; esiste: boolean; bom: boolean } {
  if (!fs.existsSync(file)) return { testo: '', dati: {}, esiste: false, bom: false };
  const grezzo = fs.readFileSync(file, 'utf8');
  const bom = grezzo.startsWith('\uFEFF');
  const testo = bom ? grezzo.slice(1) : grezzo;
  let dati: unknown;
  try { dati = JSON.parse(testo); } catch { throw new Error(`${path.basename(file)} non è un JSON valido: non lo tocco`); }
  if (!dati || typeof dati !== 'object' || Array.isArray(dati)) throw new Error(`${path.basename(file)} ha un formato inatteso: non lo tocco`);
  return { testo, dati: dati as Json, esiste: true, bom };
}

export function leggiStato(file: string): StatoInstallazione {
  try { return statoInstallazione(leggiSettings(file).dati); } catch { return 'assenti'; }
}

export interface Anteprima { prima: string; dopo: string; aggiunte: number; stato: StatoInstallazione }
/** Cosa cambierebbe, SENZA scrivere niente. */
export function anteprima(file: string, comando: string, azione: 'installa' | 'rimuovi'): Anteprima {
  const { testo, dati } = leggiSettings(file);
  const nuovo = azione === 'installa' ? unisci(dati, comando) : togli(dati);
  return { prima: testo, dopo: scrivi(nuovo, formato(testo || '{\n  "a": 1\n}\n')), aggiunte: azione === 'installa' ? EVENTI.length : 0, stato: statoInstallazione(dati) };
}

export interface Esito { backup?: string; stato: StatoInstallazione }
/**
 * Scrive davvero. Prima: backup del file com'è. Poi: controlla che togliendo le nostre voci dal risultato
 * si riottenga ESATTAMENTE il file di partenza (senza le nostre). Scrittura via file temporaneo + rinomina.
 */
export function applica(file: string, cartellaBackup: string, comando: string, azione: 'installa' | 'rimuovi', ora = new Date()): Esito {
  const { testo, dati, esiste, bom } = leggiSettings(file);
  if (!esiste && azione === 'rimuovi') return { stato: 'assenti' };
  const nuovo = azione === 'installa' ? unisci(dati, comando) : togli(dati);
  if (!isDeepStrictEqual(togli(nuovo), togli(dati))) throw new Error('controllo di sicurezza fallito: non scrivo');
  let backup: string | undefined;
  if (esiste) {
    fs.mkdirSync(cartellaBackup, { recursive: true });
    const stamp = ora.toISOString().replace(/[:.]/g, '-');
    backup = path.join(cartellaBackup, `settings.json.${stamp}.bak`);
    fs.writeFileSync(backup, testo, { flag: 'wx' });
  }
  const testoNuovo = scrivi(nuovo, formato(testo || '{\n  "a": 1\n}\n'));
  // il file è cambiato mentre lavoravamo? meglio fermarsi
  if (esiste && fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '') !== testo) throw new Error('settings.json è cambiato proprio ora: riprova');
  const tmp = `${file}.agent-tower-tmp`;
  fs.writeFileSync(tmp, (bom ? '\uFEFF' : '') + testoNuovo);
  fs.renameSync(tmp, file);
  const verifica = leggiSettings(file).dati;
  return { backup, stato: statoInstallazione(verifica) };
}
