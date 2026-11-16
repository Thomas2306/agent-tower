import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

/** Impostazioni di AGENT TOWER: stanno nella cartella dati dell'app (%APPDATA%\agent-tower), MAI in ~/.claude. */
export interface Config {
  posizione?: { x: number; y: number };  // angolo in alto a destra della finestra (ancoraggio)
  modo: 'lista' | 'pillola';
  scorciatoia: string;
  mostraInattive: boolean;
  aperte: string[];                       // sessioni con i sotto-agenti aperti
  registrazione?: boolean;                // nasconde percorsi personali e nomi (per video e screenshot)
  fantasma?: boolean;                     // semi-trasparente e i clic passano a ciò che c'è sotto (Ctrl + mouse sopra per usarla)
  nascostaInCondivisione?: boolean;       // invisibile nelle condivisioni schermo e nelle registrazioni (default sì)
  tema?: 'sistema' | 'chiaro' | 'scuro';  // colori: come Windows (default), sempre chiaro o sempre scuro
}

const DEFAULT: Config = { modo: 'lista', scorciatoia: 'Control+Alt+A', mostraInattive: false, aperte: [], nascostaInCondivisione: true };
const file = () => path.join(app.getPath('userData'), 'config.json');

export function leggiConfig(): Config {
  try { return { ...DEFAULT, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { return { ...DEFAULT }; }
}

let timer: NodeJS.Timeout | undefined;
export function salvaConfig(c: Config) {
  // scrittura ritardata: trascinando la finestra arrivano decine di eventi
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(c, null, 2)); } catch {}
  }, 400);
}
