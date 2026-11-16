/**
 * Eventi degli hook di Claude Code (opzionali): rendono CERTO lo stato "aspetta te" per i permessi,
 * che dai soli registri è una stima. Tutto qui è puro: niente rete, niente file.
 */

/** Il JSON che Claude Code passa allo hook (solo i campi che ci servono; gli altri si ignorano). */
export interface EventoHook {
  hook_event_name: string;
  session_id: string;
  agent_id?: string;
  agent_type?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  notification_type?: string;
  message?: string;
}

export interface AttesaHook {
  tipo: 'permesso' | 'input';
  strumento?: string;       // nome dello strumento che chiede il permesso
  dettaglio?: string;       // comando / file, se si capisce
  messaggio?: string;       // testo della notifica di Claude Code
  da: number;               // ms epoch
}

/** Cosa sappiamo dagli hook per UNA sessione (o un sotto-agente). */
export interface InfoHook {
  ultimo: number;           // ultimo evento ricevuto
  attesa?: AttesaHook;      // c'è una richiesta aperta
  chiusa?: number;          // SessionEnd
}

/** Eventi che dicono "la richiesta di permesso è stata risolta" (o che la sessione è andata avanti). */
const CHIUDONO = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'PermissionDenied', 'UserPromptSubmit', 'Stop', 'StopFailure', 'SessionEnd', 'SessionStart', 'SubagentStop']);

const eTesto = (x: unknown): x is string => typeof x === 'string' && x.length > 0;

/** Valida un oggetto arrivato dalla rete: se non è un evento hook plausibile, undefined. */
export function leggiEvento(x: unknown): EventoHook | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  if (!eTesto(o.hook_event_name) || !eTesto(o.session_id) || o.session_id.length > 200) return undefined;
  const s = (k: string) => (eTesto(o[k]) ? (o[k] as string).slice(0, 2000) : undefined);
  return {
    hook_event_name: o.hook_event_name.slice(0, 60), session_id: o.session_id,
    agent_id: s('agent_id'), agent_type: s('agent_type'), transcript_path: s('transcript_path'), cwd: s('cwd'),
    tool_name: s('tool_name'), tool_use_id: s('tool_use_id'), tool_input: o.tool_input,
    notification_type: s('notification_type'), message: s('message'),
  };
}

function dettaglioDa(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  const v = i.command ?? i.file_path ?? i.path ?? i.url ?? i.pattern;
  return typeof v === 'string' ? v.slice(0, 500) : undefined;
}

/**
 * Tiene lo stato degli hook per tutte le sessioni.
 * Chiave: agent_id per i sotto-agenti, altrimenti session_id (come gli id del motore).
 */
export class StatoHook {
  private info = new Map<string, InfoHook>();
  /** sessioni da cui è arrivato almeno un evento: per loro niente stime "permesso?" */
  readonly viste = new Set<string>();

  applica(e: EventoHook, ora: number): string {
    const chiave = e.agent_id || e.session_id;
    this.viste.add(e.session_id); if (e.agent_id) this.viste.add(e.agent_id);
    const i = this.info.get(chiave) ?? { ultimo: ora };
    i.ultimo = ora;
    const ev = e.hook_event_name;

    if (ev === 'PermissionRequest') {
      i.attesa = { tipo: 'permesso', strumento: e.tool_name, dettaglio: dettaglioDa(e.tool_input), da: ora };
    } else if (ev === 'Notification' && e.notification_type === 'permission_prompt') {
      // arriva anche dopo PermissionRequest: tiene l'ora della prima, aggiunge il messaggio
      i.attesa = { tipo: 'permesso', strumento: i.attesa?.strumento, dettaglio: i.attesa?.dettaglio, messaggio: e.message, da: i.attesa?.da ?? ora };
    } else if (ev === 'Notification' && (e.notification_type === 'elicitation_dialog' || e.notification_type === 'elicitation_url_dialog' || e.notification_type === 'agent_needs_input')) {
      i.attesa = { tipo: 'input', messaggio: e.message, da: i.attesa?.da ?? ora };
    } else if (ev === 'Notification' && e.notification_type === 'elicitation_complete') {
      i.attesa = undefined;
    } else if (CHIUDONO.has(ev)) {
      // Gli hook girano in parallelo: il PreToolUse dello STESSO strumento (che precede la richiesta)
      // può arrivare un attimo dopo. Quello non chiude l'attesa.
      const ritardatario = ev === 'PreToolUse' && i.attesa && i.attesa.strumento === e.tool_name && ora - i.attesa.da < 2000;
      if (!ritardatario) i.attesa = undefined;
    }
    if (ev === 'SessionEnd') i.chiusa = ora;
    if (ev === 'SessionStart' || ev === 'UserPromptSubmit') i.chiusa = undefined;
    this.info.set(chiave, i);
    return chiave;
  }

  di(chiave: string): InfoHook | undefined { return this.info.get(chiave); }
  attivo(chiave: string) { return this.viste.has(chiave); }

  /** Dimentica le sessioni vecchie (memoria limitata). */
  pulisci(primaDi: number) { for (const [k, v] of this.info) if (v.ultimo < primaDi) { this.info.delete(k); this.viste.delete(k); } }
}
