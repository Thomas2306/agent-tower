/** Traduce uno strumento in una frase semplice da mostrare nella scheda. */

const base = (p: unknown) => {
  const s = typeof p === 'string' ? p : '';
  const pezzi = s.split(/[\\/]/).filter(Boolean);
  return pezzi[pezzi.length - 1] ?? s;
};
export const accorcia = (s: unknown, n = 80): string => {
  let t = typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s);
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const host = (u: unknown) => { try { return new URL(String(u)).host; } catch { return accorcia(u, 40); } };

/** Ritorna [frase, dettaglio] per uno strumento. Tollerante: input può essere qualunque cosa. */
export function descriviStrumento(nome: string, input: any): { azione: string; dettaglio?: string } {
  const i = input && typeof input === 'object' ? input : {};
  switch (nome) {
    case 'Bash': case 'PowerShell': {
      const desc = typeof i.description === 'string' && i.description.trim() ? i.description.trim() : accorcia(i.command, 60);
      return { azione: `Esegue: ${desc}${i.run_in_background ? ' (in background)' : ''}`, dettaglio: typeof i.command === 'string' ? i.command : undefined };
    }
    case 'Read': return { azione: `Legge ${base(i.file_path)}`, dettaglio: i.file_path };
    case 'Write': return { azione: `Scrive ${base(i.file_path)}`, dettaglio: i.file_path };
    case 'Edit': case 'MultiEdit': return { azione: `Modifica ${base(i.file_path)}`, dettaglio: i.file_path };
    case 'NotebookEdit': return { azione: `Modifica ${base(i.notebook_path)}`, dettaglio: i.notebook_path };
    case 'Grep': return { azione: `Cerca "${accorcia(i.pattern, 40)}"`, dettaglio: i.path };
    case 'Glob': return { azione: `Cerca file ${accorcia(i.pattern, 40)}`, dettaglio: i.path };
    case 'WebSearch': return { azione: `Cerca sul web: ${accorcia(i.query, 50)}` };
    case 'WebFetch': return { azione: `Legge la pagina ${host(i.url)}`, dettaglio: i.url };
    case 'Agent': case 'Task': return { azione: `Chiama un aiutante: ${accorcia(i.description, 50)}`, dettaglio: i.subagent_type };
    case 'AskUserQuestion': return { azione: `Ti chiede: ${accorcia(i.questions?.[0]?.question, 70)}` };
    case 'TodoWrite': case 'mcp__ccd_turn__update_plan': return { azione: 'Aggiorna la lista dei compiti' };
    case 'mcp__ccd_turn__wrap_up': return { azione: 'Chiude il turno' };
    case 'ToolSearch': return { azione: 'Carica strumenti' };
    case 'Skill': return { azione: `Usa la skill ${accorcia(i.skill, 40)}` };
    case 'TaskStop': case 'KillShell': return { azione: 'Ferma un comando in background' };
    case 'ExitPlanMode': return { azione: 'Propone un piano' };
  }
  const mcp = /^mcp__(.+?)__(.+)$/.exec(nome);
  if (mcp) {
    const server = mcp[1].length > 20 ? 'connettore' : mcp[1].replace(/^Claude_/, '');
    return { azione: `${server}: ${mcp[2].replace(/_/g, ' ')}` };
  }
  return { azione: nome };
}

/** Pulisce un prompt: toglie tag interni (<command-name>, <system-reminder>...) e spazi. */
export function pulisciPrompt(t: string): string {
  const cmd = /<command-name>(.*?)<\/command-name>/.exec(t)?.[1];
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(t)?.[1];
  if (cmd) return `${cmd} ${args ?? ''}`.trim();
  return t.replace(/<(system-reminder|local-command-stdout|local-command-caveat)>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<\/?[a-z_-]+>/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** Prompt "finti" generati da Claude Code stesso: non sono l'utente che scrive. */
export function ePromptInterno(t: string): boolean {
  return /^\s*<(task-notification|agent-message|side-sessions-event|ci-monitor-event|system-reminder)/.test(t)
    || /^\s*\[SYSTEM NOTIFICATION/.test(t) || /^Caveat: The messages below/.test(t);
}
