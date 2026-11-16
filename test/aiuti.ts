/** Costruttori di righe JSONL finte, con la stessa forma di quelle vere (vedi docs/RICOGNIZIONE.md). */
let k = 0;
const T0 = Date.parse('2026-11-15T10:00:00.000Z');
export const ts = (sec: number) => new Date(T0 + sec * 1000).toISOString();
export const ms = (sec: number) => T0 + sec * 1000;
const base = (sec: number, extra: object = {}) => ({ uuid: `u${++k}`, parentUuid: null, isSidechain: false, timestamp: ts(sec), sessionId: 'sess-1',
  cwd: 'C:\\Users\\utente\\progetti\\torre', gitBranch: 'main', entrypoint: 'cli', version: '2.1.325', userType: 'external', ...extra });

export const R = {
  prompt: (sec: number, testo: string, extra = {}) => JSON.stringify({ ...base(sec, extra), type: 'user', message: { role: 'user', content: testo } }),
  pensa: (sec: number) => JSON.stringify({ ...base(sec), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: '' }] } }),
  testo: (sec: number, testo: string, stop = 'end_turn') => JSON.stringify({ ...base(sec), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'text', text: testo }] } }),
  usa: (sec: number, id: string, name: string, input: object, extra = {}) => JSON.stringify({ ...base(sec, extra), type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] } }),
  risultato: (sec: number, id: string, content: string, is_error = false, toolUseResult: object = {}) =>
    JSON.stringify({ ...base(sec), type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, ...(is_error ? { is_error: true } : {}) }] }, toolUseResult }),
  fineTurno: (sec: number) => JSON.stringify({ ...base(sec), type: 'system', subtype: 'stop_hook_summary', hookCount: 0, level: 'suggestion' }),
  titolo: (t: string) => JSON.stringify({ type: 'custom-title', customTitle: t, sessionId: 'sess-1' }),
  taskStatus: (sec: number, taskId: string, status: string, outputFilePath?: string) => JSON.stringify({ ...base(sec), type: 'attachment', attachment: { type: 'task_status', taskId, taskType: 'local_bash', status, description: 'Task', outputFilePath } }),
  notifica: (sec: number, taskId: string, status = 'completed') => JSON.stringify({ ...base(sec), type: 'attachment', attachment: { type: 'queued_command', prompt: `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n</task-notification>` } }),
  erroreApi: (sec: number) => JSON.stringify({ ...base(sec), type: 'assistant', isApiErrorMessage: true, apiErrorStatus: 529, message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'API Error' }] } }),
};
