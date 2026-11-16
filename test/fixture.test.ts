import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Motore } from '../src/core/motore';
import { Sessione } from '../src/core/tipi';

const F = path.resolve(__dirname, '..', 'fixtures');

/** Legge le fixture come se fossero ~/.claude/projects, con l'orologio fermo `dopoSec` secondi dopo l'ultima attività. */
function sessione(nome: string, dopoSec = 5): Sessione {
  const tutte = new Motore({ radice: F, nascondiDopoOre: 1e7 }); tutte.scopri();
  const s0 = tutte.istantanea().find((s) => s.titolo.includes(`(${nome})`))!;
  expect(s0, `fixture ${nome}`).toBeTruthy();
  const m = new Motore({ radice: F, nascondiDopoOre: 1e7, ora: () => s0.ultimaAttivita + dopoSec * 1000 }); m.scopri();
  return m.istantanea().find((s) => s.id === s0.id)!;
}

describe('fixture reali anonimizzate', () => {
  it('le legge tutte senza righe rotte', () => {
    const m = new Motore({ radice: F, nascondiDopoOre: 1e7 }); m.scopri();
    const s = m.statistiche();
    expect(s.file).toBe(7); // 5 sessioni + 2 sotto-agenti
    expect(s.rotte).toBe(0);
    expect(m.istantanea()).toHaveLength(5); // i sotto-agenti sono annidati, non in lista
  });

  it('normale: titolo, progetto, strumenti, errore, versione', () => {
    const s = sessione('normale');
    expect(s).toMatchObject({ titolo: 'Sessione di esempio (normale)', progetto: 'esempio', entrypoint: 'claude-desktop', stato: 'lavora' });
    expect(s.contatori.errori).toBe(1);
    expect(s.contatori.strumenti).toBeGreaterThan(15);
    expect(s.strumenti.some((t) => t.nome === 'Bash' && t.dettaglio?.startsWith('echo esempio-'))).toBe(true);
    expect(s.versione).toMatch(/^2\.1\./);
  });

  it('sottoagenti: 2 sotto-agenti annidati, con tipo, descrizione e legame alla madre', () => {
    const s = sessione('sottoagenti');
    expect(s.sottoAgenti).toHaveLength(2);
    for (const a of s.sottoAgenti) {
      expect(a).toMatchObject({ tipoAgente: 'web-fetch', titolo: 'Sotto-agente di esempio', progetto: 'esempio', padreId: s.id, stato: 'finito' });
      expect(s.strumenti.some((t) => t.nome === 'Agent' && t.id === a.toolUseIdPadre)).toBe(true);
    }
  });

  it('background: comando in background con il suo file .output', () => {
    const s = sessione('background');
    expect(s).toMatchObject({ stato: 'lavora', motivo: 'background' });
    expect(s.contatori.inBackground).toBe(1);
    const bg = s.strumenti.find((t) => t.background)!;
    expect(bg.background!.outputFile).toMatch(/\{\{FIXTURES\}\}\\background\\tasks\\\w+\.output$/);
  });

  it('domanda: AskUserQuestion senza risposta → aspetta te', () => {
    const s = sessione('domanda', 60);
    expect(s).toMatchObject({ stato: 'aspetta', motivo: 'domanda', stimato: false });
    expect(s.ultimaAzione).toBe('Ti chiede: Domanda di esempio 32?');
  });

  it('ordina la lista con "aspetta te" in cima', () => {
    // orologio al momento della domanda: la sessione "domanda" deve venire prima
    const tutte = new Motore({ radice: F, nascondiDopoOre: 1e7 }); tutte.scopri();
    const d = tutte.istantanea().find((s) => s.titolo.includes('(domanda)'))!;
    const m = new Motore({ radice: F, nascondiDopoOre: 1e7, inattivoDopoMin: 1e9, ora: () => d.ultimaAttivita + 1000 }); m.scopri();
    expect(m.istantanea()[0].titolo).toContain('(domanda)');
  });
});
