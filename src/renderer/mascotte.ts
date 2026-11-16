import type { Stato } from '../core/tipi';

/**
 * Il personaggino di ogni chat: pixel art ORIGINALE disegnata qui (griglia 16×14, 2 unità per pixel):
 * un robottino tondo con un'antenna, occhi stretti e gambette.
 * Colore diverso per ogni chat (dall'id), animazione diversa per ogni stato:
 *   lavora   → cammina e muove le braccia (2 fotogrammi)
 *   aspetta  → saltella con le braccia in alto, l'antenna lampeggia di rosso
 *   finito   → sorride, fermo
 *   inattivo → dorme: occhi chiusi, "z" che compare e scompare, colori spenti
 * I fotogrammi li cambia UN solo timer di tutta la pagina (classe sul body): niente animazioni CSS continue,
 * che in una finestra trasparente costano molta GPU.
 */

/** Tavolozza delle chat: colori vivi, distinti tra loro. */
export const COLORI_CHAT = ['#f0883e', '#a371f7', '#2f9ee8', '#e5579a', '#14a89a', '#d6a21c', '#6e6ef0', '#7bb33a', '#e4573d', '#3fb6c9'];

export function coloreChat(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return COLORI_CHAT[(h >>> 0) % COLORI_CHAT.length];
}

// X corpo · D ombra · L luce · E occhio/bocca · B guance · A punta antenna (colore chat chiaro) · R punta rossa
const CORPO = [
  '.......A........',
  '.......X........',
  '....XXXXXXXX....',
  '...XLLXXXXXXX...',
  '..XLXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '...XXXXXXXXXX...',
  '....DDDDDDDD....',
  '................',
  '................',
];

type Punto = { x: number; y: number; c: string };
const punti = (c: string, ...xy: [number, number][]): Punto[] => xy.map(([x, y]) => ({ x, y, c }));

const OCCHI = punti('E', [5, 5], [5, 6], [10, 5], [10, 6]);
const OCCHI_CHIUSI = punti('E', [4, 6], [5, 6], [10, 6], [11, 6]);
const OCCHI_FELICI = punti('E', [4, 6], [5, 5], [6, 6], [9, 6], [10, 5], [11, 6]);
const SORRISO = punti('E', [6, 8], [7, 9], [8, 9], [9, 8]);
const BOCCA_O = punti('E', [7, 8], [8, 8], [7, 9], [8, 9]);
const BOCCA = punti('E', [7, 8], [8, 8]);
const GUANCE = punti('B', [3, 8], [12, 8]);
const gambe = (sx: number, dx: number) => punti('X', [5, 12], [10, 12], [sx, 13], [dx, 13]);
const braccia = (sxSu: boolean, dxSu: boolean) => punti('X', [1, sxSu ? 5 : 8], [1, sxSu ? 6 : 7], [14, dxSu ? 5 : 8], [14, dxSu ? 6 : 7]);

function disegna(sopra: Punto[], dy = 0, antenna = 'A'): string {
  const g = CORPO.map((r) => r.split(''));
  g[0][7] = antenna;
  for (const p of sopra) if (g[p.y]?.[p.x] !== undefined) g[p.y][p.x] = p.c;
  let out = '';
  g.forEach((riga, y) => riga.forEach((c, x) => {
    if (c !== '.') out += `<rect class="m-${c.toLowerCase()}" x="${x * 2}" y="${(y + dy) * 2}" width="2" height="2"/>`;
  }));
  return out;
}

function fotogrammi(stato: Stato): [string, string] {
  switch (stato) {
    case 'lavora':
      return [disegna([...OCCHI, ...BOCCA, ...gambe(4, 10), ...braccia(true, false)]),
        disegna([...OCCHI, ...BOCCA, ...gambe(5, 11), ...braccia(false, true)])];
    case 'aspetta':
      return [disegna([...OCCHI, ...BOCCA_O, ...gambe(5, 10), ...braccia(false, false)], 0, 'R'),
        disegna([...OCCHI, ...BOCCA_O, ...gambe(5, 10), ...braccia(true, true)], -1, 'A')];
    case 'finito': { const f = disegna([...OCCHI_FELICI, ...SORRISO, ...GUANCE, ...gambe(5, 10), ...braccia(false, false)]); return [f, f]; }
    default: { const f = disegna([...OCCHI_CHIUSI, ...BOCCA, ...gambe(5, 10), ...braccia(false, false)]); return [f, f]; }
  }
}

const cache = new Map<Stato, string>();
/** SVG del personaggino. */
export function mascotte(id: string, stato: Stato, dimensione: 'piccola' | 'media' | 'grande' = 'media'): string {
  let f = cache.get(stato);
  if (!f) { const [a, b] = fotogrammi(stato); f = a === b ? `<g>${a}</g>` : `<g class="fa">${a}</g><g class="fb">${b}</g>`; cache.set(stato, f); }
  const zzz = stato === 'inattivo' ? '<text class="m-z" x="26" y="4">z</text>' : '';
  return `<svg class="masc ${stato} ${dimensione}" style="--m:${coloreChat(id)}" viewBox="-1 -3 34 33" shape-rendering="crispEdges" aria-hidden="true">${f}${zzz}</svg>`;
}
