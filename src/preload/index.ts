import { contextBridge, ipcRenderer } from 'electron';

/** Ponte minimo e sicuro tra interfaccia e processo principale. */
const api = {
  suSessioni: (f: (l: unknown) => void) => ipcRenderer.on('sessioni', (_e, l) => f(l)),
  suConfig: (f: (c: unknown) => void) => ipcRenderer.on('config', (_e, c) => f(c)),
  pronto: () => ipcRenderer.send('pronto'),
  dimensione: (w: number, h: number) => ipcRenderer.send('dimensione', w, h),
  modo: (m: 'lista' | 'pillola') => ipcRenderer.send('modo', m),
  nascondi: () => ipcRenderer.send('nascondi'),
  hook: () => ipcRenderer.send('hook'),
  esci: () => ipcRenderer.send('esci'),
  tema: (t: 'sistema' | 'chiaro' | 'scuro') => ipcRenderer.send('tema', t),
  fantasma: (attivo: boolean) => ipcRenderer.send('fantasma', attivo),
  interagisci: (si: boolean) => ipcRenderer.send('interagisci', si),
  imposta: (campo: string, valore: unknown) => ipcRenderer.send('imposta', campo, valore),
  suDettaglio: (f: (d: unknown) => void) => ipcRenderer.on('dettaglio', (_e, d) => f(d)),
  suOutput: (f: (o: unknown) => void) => ipcRenderer.on('output', (_e, o) => f(o)),
  apriDettaglio: (id: string) => ipcRenderer.send('dettaglio:apri', id),
  chiudiDettaglio: () => ipcRenderer.send('dettaglio:chiudi'),
  seguiOutput: (id: string, strumentoId: string) => ipcRenderer.send('output:segui', id, strumentoId),
  smettiOutput: () => ipcRenderer.send('output:stop'),
  copia: (testo: string) => ipcRenderer.send('copia', testo),
  apri: (tipo: 'cartella' | 'registro', id: string) => ipcRenderer.send('apri', tipo, id),
};
contextBridge.exposeInMainWorld('torre', api);
export type ApiTorre = typeof api;
