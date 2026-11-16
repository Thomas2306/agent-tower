/**
 * Oscuramento dei segreti (sempre attivo) e "modalità registrazione" (nasconde percorsi personali e nomi).
 * Si applica a TUTTO ciò che va all'interfaccia: comandi, output, prompt, titoli, percorsi.
 * Meglio oscurare una cosa innocua in più che mostrare una chiave in un video.
 */

export const PUNTINI = '••••••';

const REGOLE: [RegExp, string | ((...m: string[]) => string)][] = [
  // blocchi di chiavi private
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, `-----PRIVATE KEY ${PUNTINI}-----`],
  // intestazioni (prima delle chiavi: così "Bearer <chiave>" diventa "Bearer ••••••" intero)
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, (_m, t) => `${t} ${PUNTINI}`],
  // chiavi con prefisso noto
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, `sk-ant-${PUNTINI}`],
  [/\bsk-(proj-|svcacct-|live_|test_)?[A-Za-z0-9_-]{16,}/g, (_m, p = '') => `sk-${p}${PUNTINI}`],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}/g, (_m, a, b) => `${a}_${b}_${PUNTINI}`],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, (m) => `${m.slice(0, 4)}${PUNTINI}`],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, `github_pat_${PUNTINI}`],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, `glpat-${PUNTINI}`],
  [/\bEAA[A-Za-z0-9]{20,}/g, `EAA${PUNTINI}`],
  [/\bAIza[A-Za-z0-9_-]{20,}/g, `AIza${PUNTINI}`],
  [/\bya29\.[A-Za-z0-9_-]{20,}/g, `ya29.${PUNTINI}`],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, (m) => `${m.slice(0, 5)}${PUNTINI}`],
  [/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, (_m, p) => `${p}${PUNTINI}`],
  [/\bhf_[A-Za-z0-9]{20,}/g, `hf_${PUNTINI}`],
  [/\bsbp_[A-Za-z0-9]{20,}/g, `sbp_${PUNTINI}`],
  [/\bnpm_[A-Za-z0-9]{30,}/g, `npm_${PUNTINI}`],
  // JWT (eyJ...eyJ...firma)
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, `eyJ${PUNTINI}`],
  [/\b(x-api-key|api-key|apikey|authorization|x-auth-token)(["']?\s*[:=]\s*["']?)(?!Bearer\b|Basic\b|Token\b)[^\s"',;•]{8,}/gi, (_m, k, s) => `${k}${s}${PUNTINI}`],
  // credenziali dentro gli URL: https://utente:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]{3,}@/gi, (_m, a) => `${a}${PUNTINI}@`],
  // parametri negli URL: ?token=...&key=...
  [/([?&](?:access_token|refresh_token|token|key|api_key|apikey|secret|password|pwd|sig|signature|code)=)[^&\s"'#]{6,}/gi, (_m, a) => `${a}${PUNTINI}`],
  // assegnazioni stile .env / shell / JSON / YAML con nome "sospetto"
  [/\b([A-Za-z0-9_.-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|PASS|CREDENTIAL|PRIVATE|AUTH|SESSION|COOKIE|SIGNATURE|DSN)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*)(["']?)([^\s"',;}{)&•]{4,})(?!•)/gi,
    (m, k, s, q, v) => (/^(\d+|bearer|basic|token|true|false|null|none|undefined|\$\{?[A-Z_]+\}?|process\.env\.\w+|os\.environ.*|<[^>]*>|x{4,}|\*+|•+)$/i.test(v) ? m : `${k}${s}${q}${PUNTINI}`)],
  // opzioni da riga di comando: --password xyz, -p:xyz, --token=xyz
  [/(--?(?:password|passwd|pass|token|api-key|apikey|secret|key)(?:=|\s+))(["']?)[^\s"']{4,}/gi, (_m, a, q) => `${a}${q}${PUNTINI}`],
];

/** Toglie i segreti da un testo. Idempotente. */
export function oscura(t: string): string {
  if (!t) return t;
  let r = t;
  for (const [re, sost] of REGOLE) r = r.replace(re, sost as any);
  return r;
}

/** Per il contenuto di file .env: OGNI valore va nascosto, non solo quelli con nomi sospetti. */
export function oscuraEnv(t: string): string {
  if (!t) return t;
  return oscura(t).replace(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*)(.+)$/gm, (_m, k, v) => (v.trim() ? `${k}${PUNTINI}` : _m));
}

/** Un file o un comando che tocca un .env: il suo output va trattato con oscuraEnv. */
export function eSensibile(percorsoOComando: unknown): boolean {
  return typeof percorsoOComando === 'string' && /(^|[\\/\s"'=])\.env(\.[\w-]+)?(\b|$)/.test(percorsoOComando)
    || (typeof percorsoOComando === 'string' && /\b(secrets?|credentials?)\.(json|ya?ml|toml|txt)\b/i.test(percorsoOComando));
}

export interface OpzioniRegistrazione { home: string; utente: string }

/** Modalità registrazione: nasconde cartella utente, nome utente ed email (per i video e gli screenshot). */
export function anonimizza(t: string, o: OpzioniRegistrazione): string {
  if (!t) return t;
  let r = t;
  const homeSlash = o.home.replace(/\\/g, '/');
  // percorsi della home in tutte le forme: C:\Users\nome, C:/Users/nome, /c/Users/nome, C--Users-nome (cartelle dei registri)
  const forme = new Set([o.home, homeSlash, homeSlash.replace(/^([A-Za-z]):/, (_m, d) => `/${d.toLowerCase()}`), o.home.replace(/[:\\/]/g, '-')]);
  for (const f of forme) if (f) r = r.split(f).join(f.includes('--') ? 'C--Users-utente' : f.startsWith('/') ? '/c/Users/utente' : f.includes('/') ? 'C:/Users/utente' : 'C:\\Users\\utente');
  r = r.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '•••@•••');
  if (o.utente && o.utente.length >= 3) r = r.replace(new RegExp(`\\b${o.utente.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), 'utente');
  return r;
}

/** Applica una funzione a tutte le stringhe di un oggetto (copia profonda). */
export function suOgniStringa<T>(x: T, f: (s: string) => string): T {
  if (typeof x === 'string') return f(x) as unknown as T;
  if (Array.isArray(x)) return x.map((v) => suOgniStringa(v, f)) as unknown as T;
  if (x && typeof x === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(x)) o[k] = suOgniStringa(v, f);
    return o;
  }
  return x;
}
