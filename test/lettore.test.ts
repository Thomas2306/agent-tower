import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LettoreCoda } from '../src/core/lettore';

let dir: string; let f: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torre-')); f = path.join(dir, 'a.jsonl'); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('lettura incrementale', () => {
  it('legge solo i byte nuovi e aspetta le righe a metà', () => {
    fs.writeFileSync(f, '{"a":1}\n{"b":');
    const l = new LettoreCoda(f);
    expect(l.leggiRighe()).toEqual(['{"a":1}']);
    expect(l.leggiRighe()).toEqual([]);
    fs.appendFileSync(f, '2}\r\n{"c":3}\n');
    expect(l.leggiRighe()).toEqual(['{"b":2}', '{"c":3}']);
  });

  it('non spezza i caratteri UTF-8 tra un blocco e l\'altro', () => {
    const riga = JSON.stringify({ t: 'perché è così 🤖'.repeat(50) });
    fs.writeFileSync(f, (riga + '\n').repeat(20));
    const l = new LettoreCoda(f, 7); // blocchi piccolissimi apposta
    const righe = l.leggiRighe();
    expect(righe).toHaveLength(20);
    expect(righe.every((r) => r === riga)).toBe(true);
  });

  it('se il file viene troncato riparte da capo', () => {
    fs.writeFileSync(f, '{"a":1}\n{"b":2}\n');
    const l = new LettoreCoda(f); l.leggiRighe();
    fs.writeFileSync(f, '{"z":9}\n');
    expect(l.leggiRighe()).toEqual(['{"z":9}']);
  });

  it('file mancante: nessun errore', () => {
    expect(new LettoreCoda(path.join(dir, 'non-esiste.jsonl')).leggiRighe()).toEqual([]);
  });

  it('saltaAllaFine legge solo da adesso in poi; leggiTesto dà anche la riga non finita', () => {
    fs.writeFileSync(f, 'vecchio\n');
    const l = new LettoreCoda(f); l.saltaAllaFine();
    fs.appendFileSync(f, 'passo 1\npasso 2 in cor');
    expect(l.leggiTesto()).toBe('passo 1\npasso 2 in cor');
  });
});
