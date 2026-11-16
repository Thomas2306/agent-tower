import zlib from 'node:zlib';
import { nativeImage, NativeImage } from 'electron';
import type { Stato } from '../core/tipi';

/**
 * Icone del tray disegnate al volo (niente file): una torretta col pallino del colore dello stato più urgente.
 * Le produciamo come PNG: è l'unico formato che Windows, Mac e Linux leggono tutti allo stesso modo
 * (i pixel grezzi cambiano ordine dei colori da un sistema all'altro).
 */
export const COLORI: Record<Stato | 'nessuno', [number, number, number]> = {
  aspetta: [229, 72, 77], lavora: [48, 164, 108], finito: [62, 99, 221], inattivo: [128, 135, 148], nessuno: [128, 135, 148],
};

const cache = new Map<string, NativeImage>();

/** bordo: contorno scuro attorno alla torretta, per vederla anche su barre chiare (Mac, molti Linux). */
export function iconaTray(stato: Stato | 'nessuno', bordo = process.platform !== 'win32'): NativeImage {
  const k = `${stato}|${bordo}`; const c = cache.get(k); if (c) return c;
  const img = nativeImage.createEmpty();
  for (const scala of [1, 2]) {
    const n = 16 * scala;
    img.addRepresentation({ scaleFactor: scala, dataURL: 'data:image/png;base64,' + png(n, disegna(n, COLORI[stato], bordo)).toString('base64') });
  }
  cache.set(k, img);
  return img;
}

/** Pixel RGBA della torretta, lato n. */
export function disegna(n: number, [r, g, b]: [number, number, number], bordo: boolean): Buffer {
  const buf = Buffer.alloc(n * n * 4);
  const u = n / 16;
  const metti = (x: number, y: number, rr: number, gg: number, bb: number, a: number) => {
    const i = (y * n + x) * 4; const a0 = buf[i + 3] / 255; const a1 = a / 255; const ao = a1 + a0 * (1 - a1);
    if (ao <= 0) return;
    buf[i] = (rr * a1 + buf[i] * a0 * (1 - a1)) / ao; buf[i + 1] = (gg * a1 + buf[i + 1] * a0 * (1 - a1)) / ao;
    buf[i + 2] = (bb * a1 + buf[i + 2] * a0 * (1 - a1)) / ao; buf[i + 3] = ao * 255;
  };
  const torre = (px: number, py: number) => {
    const corpo = px >= 4 && px <= 12 && py >= 5 && py <= 15;
    const merli = py >= 2.5 && py < 5 && px >= 3 && px <= 13 && Math.floor((px - 3) / 2.5) % 2 === 0;
    const porta = px >= 7 && px <= 9 && py >= 11.5 && py <= 15;
    return (corpo || merli) && !porta;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = (x + 0.5) / u, py = (y + 0.5) / u;
    if (torre(px, py)) metti(x, y, 236, 238, 242, 255);
    else if (bordo) {
      // contorno di ~0.8 unità attorno alla torretta
      const d = 0.8;
      if (torre(px - d, py) || torre(px + d, py) || torre(px, py - d) || torre(px, py + d)) metti(x, y, 40, 44, 52, 255);
    }
    // pallino di stato in basso a destra
    const dist = Math.hypot(px - 12, py - 12);
    if (dist <= 4) metti(x, y, 20, 20, 24, 255);
    if (dist <= 3.1) metti(x, y, r, g, b, 255);
  }
  return buf;
}

/** PNG minimo (RGBA 8 bit, senza filtri). */
export function png(n: number, rgba: Buffer): Buffer {
  const righe = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) rgba.copy(righe, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  const pezzo = (tipo: string, dati: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(dati.length);
    const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dati]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6; // 8 bit, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pezzo('IHDR', ihdr), pezzo('IDAT', zlib.deflateSync(righe)), pezzo('IEND', Buffer.alloc(0))]);
}

let tabella: Uint32Array | undefined;
function crc32(b: Buffer): number {
  if (!tabella) {
    tabella = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tabella[i] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (const x of b) c = tabella[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
