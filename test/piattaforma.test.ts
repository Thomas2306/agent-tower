import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { capacita, nomeCartella, parole, scorciatoiaLeggibile, sistema } from '../src/core/piattaforma';
import { comandoHook } from '../src/core/installa-hook';
import { disegna, png } from '../src/main/icone';

describe('piattaforma', () => {
  it('riconosce i tre sistemi (altri Unix = Linux)', () => {
    expect(sistema('win32')).toBe('win32');
    expect(sistema('darwin')).toBe('darwin');
    expect(sistema('linux')).toBe('linux');
    expect(sistema('freebsd')).toBe('linux');
  });
  it('parole e scorciatoie giuste per sistema', () => {
    expect(parole('win32').doveIcona).toContain('orologio');
    expect(parole('darwin').doveIcona).toContain('barra in alto');
    expect(scorciatoiaLeggibile('Control+Alt+A', 'win32')).toBe('Ctrl+Alt+A');
    expect(scorciatoiaLeggibile('Control+Alt+A', 'darwin')).toBe('⌃ Ctrl+⌥ Opzione+A');
  });
  it('Linux: niente esclusione dalle catture né mouse attraverso il fantasma', () => {
    expect(capacita('linux')).toEqual({ nascondiInCondivisione: 'no', mouseAttraversoFantasma: false, opacitaFinestra: false });
    expect(capacita('win32').nascondiInCondivisione).toBe('si');
  });
  it('comando dello hook con percorsi Mac (spazi) e Linux', () => {
    expect(comandoHook('/Users/a/Library/Application Support/agent-tower/hook/agent-tower-hook.cjs', '/opt/homebrew/bin/node'))
      .toBe('"/opt/homebrew/bin/node" "/Users/a/Library/Application Support/agent-tower/hook/agent-tower-hook.cjs"');
    expect(comandoHook('/home/a/.config/agent-tower/hook/agent-tower-hook.cjs', undefined, '/opt/AGENT TOWER/agent-tower'))
      .toBe('ELECTRON_RUN_AS_NODE=1 "/opt/AGENT TOWER/agent-tower" "/home/a/.config/agent-tower/hook/agent-tower-hook.cjs"');
  });
});

describe('icona del tray in PNG (uguale su tutti i sistemi)', () => {
  it('PNG valido, colori in ordine RGBA', () => {
    const n = 16;
    const px = disegna(n, [229, 72, 77], true);
    const f = png(n, px);
    expect(f.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(f.readUInt32BE(16)).toBe(n);
    const idat = f.indexOf('IDAT');
    const len = f.readUInt32BE(idat - 4);
    const righe = zlib.inflateSync(f.subarray(idat + 4, idat + 4 + len));
    expect(righe.length).toBe(n * (n * 4 + 1));
    // pallino rosso in basso a destra (12,12)
    const i = 12 * (n * 4 + 1) + 1 + 12 * 4;
    expect([righe[i], righe[i + 1], righe[i + 2], righe[i + 3]]).toEqual([229, 72, 77, 255]);
  });
});

describe('nome del progetto da un percorso', () => {
  it('va bene con percorsi Windows e Mac/Linux, ovunque giri', () => {
    expect(nomeCartella('C:\\Users\\a\\progetti\\esempio')).toBe('esempio');
    expect(nomeCartella('/Users/a/dev/torre/')).toBe('torre');
    expect(nomeCartella('C:\\')).toBe('C:');
  });
});
