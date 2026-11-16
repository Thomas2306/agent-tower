import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Motore } from '../src/core/motore';
import { CHIAVI_FINTE } from '../scripts/crea-fixture-segreti';

const F = path.resolve(__dirname, '..', 'fixtures');
const motore = (opz = {}) => { const m = new Motore({ radice: F, nascondiDopoOre: 1e7, ...opz }); m.scopri(); return m; };

describe('nessun segreto esce dal motore (fixture con chiavi finte)', () => {
  it('né nella lista né nel dettaglio, in nessun campo', () => {
    const m = motore();
    const tutto = JSON.stringify(m.istantanea()) + JSON.stringify(m.dettaglio('segreti-0001'));
    for (const c of CHIAVI_FINTE) expect(tutto, c).not.toContain(c);
  });

  it('senza oscuramento le chiavi ci sarebbero (il test sopra non è vuoto)', () => {
    const tutto = JSON.stringify(motore({ oscuraSegreti: false }).dettaglio('segreti-0001'));
    expect(tutto).toContain(CHIAVI_FINTE[1]); // github nel comando
  });

  it('il contenuto di un .env è oscurato tutto, anche i valori con nomi innocui', () => {
    const d = motore().dettaglio('segreti-0001')!;
    const env = d.strumenti.find((s) => s.dettaglio?.endsWith('.env'))!;
    expect(env.sensibile).toBe(true);
    expect(env.risultato).toBe('DATABASE_URL=••••••\nPORT=••••••\nMETA_TOKEN=••••••');
  });
});

describe('dettaglio', () => {
  it('ha comando esatto, output, differenza delle modifiche ed errori', () => {
    const d = motore().dettaglio('segreti-0001')!;
    expect(d.titolo).toBe('Sessione di esempio (segreti)');
    const bash = d.strumenti.find((s) => s.nome === 'Bash')!;
    expect(bash.dettaglio).toMatch(/^curl -H "Authorization: Bearer ••••••" https:\/\/api\.github\.com\/user$/);
    expect(bash.risultato).toContain('"login":"esempio"');
    const edit = d.strumenti.find((s) => s.nome === 'Edit')!;
    expect(edit.diff).toEqual({ vecchio: 'const key = "AIza••••••";', nuovo: 'const key = process.env.GOOGLE_KEY;' });
    expect(d.strumenti.filter((s) => s.errore)).toHaveLength(1);
  });

  it('funziona anche per un sotto-agente (per agentId) e dà la madre e i percorsi', () => {
    const m = motore();
    const madre = m.istantanea().find((s) => s.titolo.includes('(sottoagenti)'))!;
    const figlio = madre.sottoAgenti[0];
    const d = m.dettaglio(figlio.id)!;
    expect(d.padreId).toBe(madre.id);
    expect(d.strumenti.length).toBeGreaterThan(0);
    expect(m.percorsi(figlio.id)?.registro).toMatch(/subagents[\\/]agent-.+\.jsonl$/);
    expect(m.percorsi(madre.id)?.cartella).toBe('C:\\Users\\utente\\progetti\\esempio');
    expect(m.dettaglio('non-esiste')).toBeUndefined();
  });

  it('trova il file .output di un comando in background', () => {
    const m = motore({ trasformaPercorso: (p: string) => p.replace('{{FIXTURES}}', F) });
    const s = m.istantanea().find((x) => x.titolo.includes('(background)'))!;
    const bg = m.dettaglio(s.id)!.strumenti.find((t) => t.background)!;
    const f = m.fileOutput(s.id, bg.id)!;
    expect(fs.existsSync(f)).toBe(true);
    expect(fs.readFileSync(f, 'utf8')).toContain('riga 1 di output di esempio');
  });

  it('il domanda: il testo completo della domanda è nel dettaglio', () => {
    const m = motore();
    const s = m.istantanea().find((x) => x.titolo.includes('(domanda)'))!;
    const q = m.dettaglio(s.id)!.strumenti.find((t) => t.nome === 'AskUserQuestion')!;
    expect(q.extra).toContain('Domanda di esempio');
    expect(q.extra).toContain('• Sì');
  });
});
