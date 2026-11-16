import { describe, expect, it } from 'vitest';
import { ModelloSessione } from '../src/core/modello';
import { calcolaStato } from '../src/core/stato';
import { OPZIONI_STATO_DEFAULT } from '../src/core/tipi';
import { ms, R } from './aiuti';

const HOME = 'C:\\Users\\utente';
const nuovo = (...righe: string[]) => { const m = new ModelloSessione('sess-1', 'x.jsonl', { home: HOME, tmp: 'C:\\Temp' }); righe.forEach((r) => m.elaboraRiga(r)); return m; };
const stato = (m: ModelloSessione, sec: number) => calcolaStato(m, [], { ora: ms(sec), ...OPZIONI_STATO_DEFAULT });

describe('parser tollerante', () => {
  it('non va mai in crash con righe rotte, vuote, sconosciute o strane', () => {
    const m = nuovo('{rotta', 'null', '42', '"testo"', '[]', '{}', '{"type":"tipo-mai-visto","x":1}',
      '{"type":"assistant","message":null}', '{"type":"assistant","message":{"content":[null,1,{"type":"tool_use"}]}}',
      '{"type":"user","message":{"content":[{"type":"tool_result"}]}}', '{"type":"attachment","attachment":{"type":"task_status"}}',
      '{"type":"user","timestamp":"non-una-data","message":{"content":"ciao"}}');
    expect(m.righeRotte).toBe(1);
    expect(m.righeLette).toBe(12);
    expect(() => stato(m, 0)).not.toThrow();
  });

  it('scarta il rumore senza fare JSON.parse', () => {
    const m = nuovo('{"type":"api-request","rotto', '{"type":"file-history-snapshot",', '{"parentUuid":null,"attachment":{"type":"prompt_snapshot",ROTTO');
    expect(m.righeRotte).toBe(0);
  });
});

describe('titolo e progetto', () => {
  it('vale l\'ultimo custom-title, altrimenti le prime parole del primo prompt', () => {
    expect(nuovo(R.prompt(0, 'Sistema il bug del login e poi aggiungi i test per favore grazie')).titolo).toBe('Sistema il bug del login e poi aggiungi');
    expect(nuovo(R.prompt(0, 'x'), R.titolo('Primo'), R.titolo('Secondo')).titolo).toBe('Secondo');
  });

  it('il progetto è dove lavora di più nel turno: ignora home, ~/.claude, C:\\dev e i cd di passaggio', () => {
    const cwd = (c: string, sec: number) => R.usa(sec, `t${sec}`, 'Read', { file_path: 'x' }, { cwd: c });
    const m = nuovo(R.prompt(0, 'a', { cwd: HOME }), cwd(HOME + '\\.claude\\projects', 1), cwd('C:\\dev', 2),
      cwd('C:\\dev\\agent-tower', 3), cwd('C:\\dev\\agent-tower\\docs\\prove', 4), cwd('C:\\dev\\agent-tower\\src', 5), cwd('C:\\Users\\utente\\Downloads', 6));
    expect(m.cwdStabile).toBe('C:\\dev\\agent-tower');
    expect(m.cwdAttuale).toBe('C:\\Users\\utente\\Downloads');
  });

  it('nel turno nuovo il progetto segue il lavoro, finché non c\'è niente resta quello di prima', () => {
    const cwd = (c: string, sec: number) => R.usa(sec, `t${sec}`, 'Read', { file_path: 'x' }, { cwd: c });
    const m = nuovo(R.prompt(0, 'a', { cwd: HOME }), cwd('C:\\dev\\uno', 1), cwd('C:\\dev\\uno', 2));
    m.elaboraRiga(R.prompt(10, 'ora l\'altro', { cwd: HOME }));
    expect(m.cwdStabile).toBe('C:\\dev\\uno');
    m.elaboraRiga(cwd('C:\\dev\\due', 11));
    expect(m.cwdStabile).toBe('C:\\dev\\due');
  });

  it('ignora i prompt interni (notifiche) per titolo e ultimo prompt', () => {
    const m = nuovo(R.prompt(0, '<task-notification>\n<task-id>x</task-id>\n</task-notification>'), R.prompt(1, 'Fai la build'));
    expect(m.primoPrompt).toBe('Fai la build');
  });

  it('i comandi slash diventano leggibili', () => {
    expect(nuovo(R.prompt(0, '<command-name>/review</command-name><command-args>123</command-args>')).primoPrompt).toBe('/review 123');
  });
});

describe('strumenti', () => {
  it('Bash mostra la descrizione e tiene il comando esatto', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'npm test', description: 'Avvia i test' }));
    expect(m.strumenti[0]).toMatchObject({ azione: 'Esegue: Avvia i test', dettaglio: 'npm test' });
    expect(m.aperti.size).toBe(1);
  });

  it('il risultato chiude lo strumento, conta gli errori e tiene la coda dell\'output', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'x' }), R.risultato(3, 't1', 'Exit code 1\nboom', true));
    expect(m.aperti.size).toBe(0);
    expect(m.strumenti[0]).toMatchObject({ errore: true, risultato: 'Exit code 1\nboom', fine: ms(3) });
    expect(m.totErrori).toBe(1);
  });

  it('riconosce il comando in background e il file .output', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'npm run build', run_in_background: true }),
      R.risultato(1, 't1', 'Command running in background with ID: bab12. Output is being written to: C:\\Temp\\claude\\x\\tasks\\bab12.output. You will be notified when it completes.', false, { backgroundTaskId: 'bab12' }));
    expect(m.backgroundAttivi).toHaveLength(1);
    expect(m.backgroundAttivi[0].background).toMatchObject({ taskId: 'bab12', outputFile: 'C:\\Temp\\claude\\x\\tasks\\bab12.output' });
    m.elaboraRiga(R.notifica(20, 'bab12'));
    expect(m.backgroundAttivi).toHaveLength(0);
  });

  it('riconosce il comando spostato in background dopo il timeout', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'x' }),
      R.risultato(600, 't1', 'Command did not complete within its 600s timeout and was moved to the background (ID: bq1). Output is being written to: C:\\T\\bq1.output.'));
    expect(m.backgroundAttivi[0].background?.taskId).toBe('bq1');
    m.elaboraRiga(R.taskStatus(700, 'bq1', 'completed'));
    expect(m.backgroundAttivi).toHaveLength(0);
  });

  it('NON scambia per background un output che contiene per caso quella frase (es. un log stampato)', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'cat registro.jsonl' }),
      R.risultato(1, 't1', 'riga 1\n"Command running in background with ID: bfinto. Output is being written to: C:\\T\\bfinto.output"'));
    expect(m.backgroundAttivi).toHaveLength(0);
  });

  it('TaskStop chiude il comando in background', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'x', run_in_background: true }),
      R.risultato(1, 't1', 'Command running in background with ID: b7. Output is being written to: C:\\T\\b7.output.'),
      R.usa(5, 't2', 'TaskStop', { task_id: 'b7' }), R.risultato(6, 't2', '{"message":"Successfully stopped task: b7"}'));
    expect(m.backgroundAttivi).toHaveLength(0);
    expect(m.strumenti[0].background).toMatchObject({ finito: true, esito: 'killed' });
  });

  it('riconosce l\'agente asincrono', () => {
    const m = nuovo(R.usa(0, 't1', 'Agent', { description: 'Conta righe', subagent_type: 'Explore' }),
      R.risultato(1, 't1', 'Async agent launched successfully.\nagentId: a0fd06 (internal ID)', false, { agentId: 'a0fd06', status: 'async_launched' }));
    expect(m.strumenti[0].agentId).toBe('a0fd06');
    expect(m.backgroundAttivi).toHaveLength(1);
  });

  it('l\'interruzione chiude gli strumenti aperti', () => {
    const m = nuovo(R.usa(0, 't1', 'Bash', { command: 'x' }), R.prompt(5, '[Request interrupted by user for tool use]'));
    expect(m.aperti.size).toBe(0);
    expect(stato(m, 6)).toMatchObject({ stato: 'finito', motivo: 'interrotto' });
  });
});
