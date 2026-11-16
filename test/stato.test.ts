import { describe, expect, it } from 'vitest';
import { ModelloSessione } from '../src/core/modello';
import { calcolaStato, ordina } from '../src/core/stato';
import { OPZIONI_STATO_DEFAULT, Sessione } from '../src/core/tipi';
import { ms, R } from './aiuti';

const nuovo = (...righe: string[]) => { const m = new ModelloSessione('s', 'x', { home: 'C:\\Users\\utente' }); righe.forEach((r) => m.elaboraRiga(r)); return m; };
const st = (m: ModelloSessione, sec: number, sotto: Sessione[] = []) => calcolaStato(m, sotto, { ora: ms(sec), ...OPZIONI_STATO_DEFAULT });

describe('regole di stato (solo registri)', () => {
  it('lavora mentre pensa dopo un prompt', () => {
    expect(st(nuovo(R.prompt(0, 'vai'), R.pensa(2)), 10)).toMatchObject({ stato: 'lavora', motivo: 'pensa', daQuando: ms(0) });
  });

  it('lavora mentre un comando Bash gira, anche a lungo (non è un permesso)', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Bash', { command: 'npm test', description: 'Test' }));
    expect(st(m, 300)).toMatchObject({ stato: 'lavora', motivo: 'strumento', ultimaAzione: 'Esegue: Test', strumentoAttivo: 'Bash' });
  });

  it('uno strumento veloce fermo oltre la soglia → aspetta te (stima: permesso)', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Edit', { file_path: 'C:\\a\\b.ts' }));
    expect(st(m, 5)).toMatchObject({ stato: 'lavora' });
    expect(st(m, 12)).toMatchObject({ stato: 'aspetta', motivo: 'permesso?', stimato: true, ultimaAzione: 'Modifica b.ts' });
  });

  it('AskUserQuestion senza risposta → aspetta te (certo)', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 'q', 'AskUserQuestion', { questions: [{ question: 'Quale nome?' }] }));
    expect(st(m, 2)).toMatchObject({ stato: 'aspetta', motivo: 'domanda', stimato: false, ultimaAzione: 'Ti chiede: Quale nome?' });
    // anche dopo 40 minuti è ancora una domanda per te
    expect(st(m, 40 * 60).stato).toBe('aspetta');
    m.elaboraRiga(R.risultato(50, 'q', 'Risposta: Torre'));
    expect(st(m, 51).stato).toBe('lavora');
  });

  it('finito dopo il testo finale o la fine del turno', () => {
    expect(st(nuovo(R.prompt(0, 'vai'), R.testo(5, 'Fatto!')), 6)).toMatchObject({ stato: 'finito', motivo: 'fine-turno', stimato: true });
    expect(st(nuovo(R.prompt(0, 'vai'), R.testo(5, 'Fatto!'), R.fineTurno(6)), 7)).toMatchObject({ stato: 'finito', stimato: false });
  });

  it('il testo intermedio (stop_reason tool_use) non vuol dire finito', () => {
    expect(st(nuovo(R.prompt(0, 'vai'), R.testo(5, 'Ora controllo…', 'tool_use')), 6)).toMatchObject({ stato: 'lavora', ultimaAzione: 'Scrive la risposta' });
  });

  it('inattivo dopo 30 minuti di silenzio', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.testo(5, 'Fatto!'), R.fineTurno(6));
    expect(st(m, 6 + 29 * 60).stato).toBe('finito');
    expect(st(m, 6 + 31 * 60)).toMatchObject({ stato: 'inattivo', motivo: 'silenzio' });
  });

  it('"pensa" senza eventi per 10 minuti diventa inattivo (sessione chiusa a metà)', () => {
    expect(st(nuovo(R.prompt(0, 'vai')), 11 * 60).stato).toBe('inattivo');
  });

  it('turno finito ma comando in background ancora acceso → lavora (background)', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 't1', 'Bash', { command: 'x', description: 'Build lunga', run_in_background: true }),
      R.risultato(2, 't1', 'Command running in background with ID: b1. Output is being written to: C:\\T\\b1.output.'), R.testo(3, 'Ti avviso quando finisce'), R.fineTurno(4));
    expect(st(m, 5)).toMatchObject({ stato: 'lavora', motivo: 'background', ultimaAzione: 'In background: Build lunga' });
    m.elaboraRiga(R.notifica(60, 'b1'));
    m.elaboraRiga(R.testo(62, 'Build finita'));
    expect(st(m, 63).stato).toBe('finito');
  });

  it('errore API definitivo → finito con errore', () => {
    expect(st(nuovo(R.prompt(0, 'vai'), R.erroreApi(3)), 4)).toMatchObject({ stato: 'finito', motivo: 'errore-api', ultimaAzione: 'Errore API 529' });
  });

  it('un sotto-agente che aspetta fa aspettare anche la madre', () => {
    const m = nuovo(R.prompt(0, 'vai'), R.usa(1, 'a', 'Agent', { description: 'Cerca' }));
    const sotto = { stato: 'aspetta', stimato: true, daQuando: ms(3), ultimaAzione: 'Modifica x.ts' } as Sessione;
    expect(st(m, 5, [sotto])).toMatchObject({ stato: 'aspetta', motivo: 'sotto-agente', ultimaAzione: 'Un aiutante: Modifica x.ts' });
  });

  it('il .meta.json "finished" vince anche se nel registro resta uno strumento aperto', () => {
    const m = nuovo(R.prompt(0, 'cerca'), R.usa(1, 'g', 'Grep', { pattern: 'x' }));
    expect(calcolaStato(m, [], { ora: ms(60), ...OPZIONI_STATO_DEFAULT }, true)).toMatchObject({ stato: 'finito' });
  });

  it('dentro "aspetta te" le domande (certe) vengono prima delle stime', () => {
    const s = (stimato: boolean, ultimaAttivita: number) => ({ stato: 'aspetta', stimato, ultimaAttivita }) as Sessione;
    expect([s(true, 9), s(false, 1)].sort(ordina).map((x) => x.stimato)).toEqual([false, true]);
  });

  it('ordine: aspetta, lavora, finito, inattivo; poi il più recente', () => {
    const s = (stato: string, ultimaAttivita: number) => ({ stato, ultimaAttivita }) as Sessione;
    const l = [s('finito', 5), s('inattivo', 9), s('lavora', 1), s('aspetta', 0), s('lavora', 3)].sort(ordina);
    expect(l.map((x) => `${x.stato}${x.ultimaAttivita}`)).toEqual(['aspetta0', 'lavora3', 'lavora1', 'finito5', 'inattivo9']);
  });
});
