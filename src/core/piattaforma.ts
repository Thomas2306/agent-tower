/**
 * Differenze tra Windows, Mac e Linux in un posto solo: parole da mostrare e cose che il sistema sa fare.
 * Puro (niente Electron): lo usano sia il processo principale sia l'interfaccia.
 */
export type Sistema = 'win32' | 'darwin' | 'linux';

export function sistema(p: string): Sistema {
  return p === 'darwin' ? 'darwin' : p === 'win32' ? 'win32' : 'linux';
}

export interface Capacita {
  /** la finestra si può escludere dalle condivisioni schermo */
  nascondiInCondivisione: 'si' | 'parziale' | 'no';
  /** il mouse sopra una finestra "fantasma" arriva comunque all'app (serve per Ctrl + mouse sopra) */
  mouseAttraversoFantasma: boolean;
  /** la trasparenza della finestra intera la fa il sistema (altrimenti la facciamo nell'interfaccia) */
  opacitaFinestra: boolean;
}

export function capacita(s: Sistema): Capacita {
  if (s === 'win32') return { nascondiInCondivisione: 'si', mouseAttraversoFantasma: true, opacitaFinestra: true };
  // Mac: le app che catturano con ScreenCaptureKit (macOS 15+) possono ignorare l'esclusione
  if (s === 'darwin') return { nascondiInCondivisione: 'parziale', mouseAttraversoFantasma: true, opacitaFinestra: true };
  // Linux: niente esclusione dalle catture, il mouse non attraversa, opacità della finestra non supportata
  return { nascondiInCondivisione: 'no', mouseAttraversoFantasma: false, opacitaFinestra: false };
}

/** Parole che cambiano da sistema a sistema. */
export function parole(s: Sistema) {
  const mac = s === 'darwin';
  return {
    sistema: mac ? 'macOS' : s === 'win32' ? 'Windows' : 'Linux',
    /** dove sta l'icona dell'app */
    doveIcona: mac ? 'nella barra in alto' : s === 'win32' ? 'vicino all’orologio' : 'nella barra di sistema',
    /** come si apre il menu dell'icona */
    menuIcona: mac ? 'clic sull’icona nella barra in alto' : s === 'win32' ? 'clic destro sull’icona vicino all’orologio' : 'clic sull’icona nella barra di sistema',
    ctrl: mac ? '⌃ Ctrl' : 'Ctrl',
    alt: mac ? '⌥ Opzione' : 'Alt',
  };
}

/** "Control+Alt+A" → "Ctrl+Alt+A" (o "⌃ Ctrl+⌥ Opzione+A" su Mac). */
export function scorciatoiaLeggibile(acc: string, s: Sistema) {
  const p = parole(s);
  return acc.split('+').map((k) => (k === 'Control' || k === 'Ctrl' ? p.ctrl : k === 'Alt' ? p.alt : k)).join('+');
}

/** Ultimo pezzo di un percorso, sia "C:\a\b" sia "/a/b" (i registri possono venire da un altro sistema). */
export function nomeCartella(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;
}
