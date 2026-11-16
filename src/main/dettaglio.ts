import os from 'node:os';
import { BrowserWindow, clipboard, ipcMain, shell } from 'electron';
import { LettoreCoda } from '../core/lettore';
import type { Motore } from '../core/motore';
import { anonimizza, oscura, suOgniStringa } from '../core/oscura';

/**
 * Vista dettaglio: manda all'interfaccia la sessione aperta (con timeline e output)
 * e segue in diretta il file .output di un comando in background.
 * Tutto passa da perInterfaccia(): segreti sempre oscurati, percorsi personali nascosti in modalità registrazione.
 */
export class Dettaglio {
  private aperto?: string;
  private seguito?: { id: string; strumentoId: string; lettore: LettoreCoda; timer: NodeJS.Timeout };

  constructor(private motore: () => Motore | undefined, private win: () => BrowserWindow | undefined, private registrazione: () => boolean) {
    ipcMain.on('dettaglio:apri', (_e, id: unknown) => { if (typeof id === 'string') { this.aperto = id; this.ultimaFirma = ''; this.ultimoInvio = 0; this.invia(); } });
    ipcMain.on('dettaglio:chiudi', () => { this.aperto = undefined; this.smettiDiSeguire(); });
    ipcMain.on('output:segui', (_e, id: unknown, strumentoId: unknown) => { if (typeof id === 'string' && typeof strumentoId === 'string') this.segui(id, strumentoId); });
    ipcMain.on('output:stop', () => this.smettiDiSeguire());
    ipcMain.on('copia', (_e, testo: unknown) => { if (typeof testo === 'string') clipboard.writeText(testo); });
    ipcMain.on('apri', (_e, tipo: unknown, id: unknown) => {
      // i percorsi li decide il motore (non l'interfaccia): si apre solo ciò che appartiene a una sessione vera
      const p = typeof id === 'string' ? this.motore()?.percorsi(id) : undefined;
      if (tipo === 'cartella' && p?.cartella) shell.openPath(p.cartella);
      if (tipo === 'registro' && p?.registro) shell.showItemInFolder(p.registro);
    });
  }

  /** Testo per l'interfaccia: senza segreti e, in modalità registrazione, senza percorsi personali. */
  perInterfaccia<T>(x: T): T {
    const reg = this.registrazione();
    const o = { home: os.homedir(), utente: os.userInfo().username };
    return suOgniStringa(x, (s) => (reg ? anonimizza(oscura(s), o) : oscura(s)));
  }

  /** Da chiamare quando il motore emette: se c'è un dettaglio aperto, lo aggiorna (al massimo 2 volte al secondo). */
  invia() {
    if (!this.aperto || this.inAttesa) return;
    const passati = Date.now() - this.ultimoInvio;
    if (passati < 500) { this.inAttesa = setTimeout(() => { this.inAttesa = undefined; this.invia(); }, 500 - passati); return; }
    this.ultimoInvio = Date.now();
    const d = this.motore()?.dettaglio(this.aperto);
    const testo = d ? this.perInterfaccia(d) : null;
    const firma = JSON.stringify(testo);
    if (firma === this.ultimaFirma) return; // niente di nuovo: non far ridisegnare l'interfaccia
    this.ultimaFirma = firma;
    this.win()?.webContents.send('dettaglio', testo);
  }
  private ultimoInvio = 0;
  private inAttesa?: NodeJS.Timeout;
  private ultimaFirma = '';

  private segui(id: string, strumentoId: string) {
    if (this.seguito?.id === id && this.seguito.strumentoId === strumentoId) return;
    this.smettiDiSeguire();
    const file = this.motore()?.fileOutput(id, strumentoId);
    if (!file) { this.win()?.webContents.send('output', { strumentoId, testo: '', nuovo: true, manca: true }); return; }
    const lettore = new LettoreCoda(file);
    lettore.saltaAllaFine(64 * 1024); // si parte dagli ultimi 64 KB
    let primo = true;
    const giro = () => {
      const t = lettore.leggiTesto();
      if (!t && !primo) return;
      this.win()?.webContents.send('output', { strumentoId, testo: this.perInterfaccia(t), nuovo: primo });
      primo = false;
    };
    this.seguito = { id, strumentoId, lettore, timer: setInterval(giro, 500) };
    giro();
  }

  private smettiDiSeguire() {
    if (this.seguito) clearInterval(this.seguito.timer);
    this.seguito = undefined;
  }
}
