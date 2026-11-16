import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Motore } from '../src/core/motore';
import { Sessione } from '../src/core/tipi';
import { R } from './aiuti';

let dir: string; let motore: Motore | undefined;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torre-')); });
afterEach(() => { motore?.ferma(); motore = undefined; fs.rmSync(dir, { recursive: true, force: true }); });

/** Aspetta il primo evento 'sessioni' che soddisfa la condizione (o fallisce dopo `ms`). */
function aspetta(m: Motore, ok: (l: Sessione[]) => boolean, ms = 2000): Promise<{ lista: Sessione[]; dopoMs: number }> {
  const t0 = Date.now();
  return new Promise((ris, rif) => {
    const subito = m.istantanea(); if (ok(subito)) return ris({ lista: subito, dopoMs: 0 });
    const t = setTimeout(() => { m.off('sessioni', f); rif(new Error('tempo scaduto')); }, ms);
    const f = (l: Sessione[]) => { if (ok(l)) { clearTimeout(t); m.off('sessioni', f); ris({ lista: l, dopoMs: Date.now() - t0 }); } };
    m.on('sessioni', f);
  });
}

// i test "dal vivo" usano l'orologio vero: le righe hanno l'ora di adesso
const adesso = (r: string) => r.replace(/"timestamp":"[^"]+"/, `"timestamp":"${new Date().toISOString()}"`);

describe('motore dal vivo', () => {
  it('vede una sessione nuova, i suoi aggiornamenti e un sotto-agente entro 2 secondi', async () => {
    const p = path.join(dir, 'C--progetti-torre'); fs.mkdirSync(p);
    motore = new Motore({ radice: dir, intervalloControlloMs: 300, intervalloScopertaMs: 300 }).avvia();

    const f = path.join(p, 'sess-1.jsonl');
    fs.writeFileSync(f, [R.titolo('Prova dal vivo'), adesso(R.prompt(0, 'Fai la build'))].join('\n') + '\n');
    const a = await aspetta(motore, (l) => l.some((s) => s.titolo === 'Prova dal vivo' && s.stato === 'lavora'));
    expect(a.dopoMs).toBeLessThan(2000);

    fs.appendFileSync(f, adesso(R.usa(1, 't1', 'Bash', { command: 'npm run build', description: 'Compila' })) + '\n');
    const b = await aspetta(motore, (l) => l[0]?.ultimaAzione === 'Esegue: Compila');
    expect(b.lista[0].strumentoAttivo).toBe('Bash');

    // sotto-agente con il suo .meta.json
    const sd = path.join(p, 'sess-1', 'subagents'); fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Cerca i test', toolUseId: 't9', finished: false }));
    fs.writeFileSync(path.join(sd, 'agent-a1.jsonl'), adesso(R.prompt(0, 'Cerca')) + '\n');
    const c = await aspetta(motore, (l) => l[0]?.sottoAgenti.length === 1);
    expect(c.lista[0].sottoAgenti[0]).toMatchObject({ titolo: 'Cerca i test', tipoAgente: 'Explore', stato: 'lavora' });

    // il .meta.json dice "finito"
    fs.writeFileSync(path.join(sd, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Cerca i test', toolUseId: 't9', finished: true }));
    await aspetta(motore, (l) => l[0]?.sottoAgenti[0]?.stato === 'finito');

    fs.appendFileSync(f, [adesso(R.risultato(2, 't1', 'ok')), adesso(R.testo(3, 'Fatto')), adesso(R.fineTurno(4))].join('\n') + '\n');
    await aspetta(motore, (l) => l[0]?.stato === 'finito');
  });

  it('nasconde le sessioni più vecchie di 24 ore', () => {
    const p = path.join(dir, 'C--x'); fs.mkdirSync(p);
    fs.writeFileSync(path.join(p, 'vecchia.jsonl'), R.prompt(0, 'ciao') + '\n'); // timestamp del 15/11/2026 10:00
    const m = new Motore({ radice: dir, ora: () => Date.parse('2026-11-17T10:00:00Z') }); m.scopri();
    expect(m.istantanea()).toHaveLength(0);
    const m2 = new Motore({ radice: dir, ora: () => Date.parse('2026-11-15T12:00:00Z') }); m2.scopri();
    expect(m2.istantanea()).toHaveLength(1);
  });
});

describe('prestazioni', () => {
  it('registro da 50 MB: prima lettura veloce, poi solo i byte nuovi', () => {
    const p = path.join(dir, 'C--grande'); fs.mkdirSync(p);
    const f = path.join(p, 'grande.jsonl');
    // mix realistico: tanto rumore api-request + strumenti con output lunghi
    const rumore = JSON.stringify({ type: 'api-request', id: 'x', params: 'p'.repeat(20_000) });
    const blocco: string[] = [];
    for (let i = 0; i < 200; i++) {
      blocco.push(R.usa(i, `t${i}`, 'Bash', { command: `cmd ${i}`, description: `Passo ${i}` }));
      blocco.push(R.risultato(i, `t${i}`, 'o'.repeat(3000)));
      if (i % 4 === 0) blocco.push(rumore);
    }
    const pezzo = blocco.join('\n') + '\n';
    const fd = fs.openSync(f, 'w');
    let scritti = 0; while (scritti < 50e6) { fs.writeSync(fd, pezzo); scritti += Buffer.byteLength(pezzo); }
    fs.closeSync(fd);

    const m = new Motore({ radice: dir, nascondiDopoOre: 1e7 });
    const t0 = performance.now(); m.scopri(); const lista = m.istantanea(); const t1 = performance.now();
    console.log(`prima lettura di ${(scritti / 1e6).toFixed(0)} MB: ${(t1 - t0).toFixed(0)} ms`);
    expect(lista).toHaveLength(1);
    expect(lista[0].strumenti.length).toBeLessThanOrEqual(60);
    expect(t1 - t0).toBeLessThan(5000);

    fs.appendFileSync(f, R.usa(999, 'tz', 'Bash', { command: 'fine', description: 'Ultimo' }) + '\n');
    (m as any).voci.forEach((v: any) => (m as any).leggi(v));
    const t2 = performance.now(); const l2 = m.istantanea(); const t3 = performance.now();
    expect(l2[0].ultimaAzione).toBe('Esegue: Ultimo');
    expect(t3 - t2).toBeLessThan(50);
  }, 30_000);
});
