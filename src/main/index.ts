import path from 'node:path';
import fs from 'node:fs';
import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeTheme, screen, shell, Tray } from 'electron';
import { Motore } from '../core/motore';
import type { Sessione, Stato } from '../core/tipi';
import { Config, leggiConfig, salvaConfig } from './config';
import { iconaTray } from './icone';
import { Dettaglio } from './dettaglio';
import { anteprimaHook, cartellaBackupHook, comando, fileSettings, installaHook, rimuoviHook, ServerHook, statoHook } from './hook';
import { bloccoNostro, EVENTI } from '../core/installa-hook';
import { capacita, parole, scorciatoiaLeggibile, sistema } from '../core/piattaforma';

const SISTEMA = sistema(process.platform);
const PUO = capacita(SISTEMA);
const P = parole(SISTEMA);
/** seconda scorciatoia globale: Fantasma acceso/spento (su Linux è l'unico modo per riprendere la finestra) */
const SCORCIATOIA_FANTASMA = 'Control+Alt+F';

const LARGHEZZA_LISTA = 380;
const MARGINE = 12;

if (!app.requestSingleInstanceLock()) app.quit();

let win: BrowserWindow | undefined;
let tray: Tray | undefined;
let motore: Motore | undefined;
let config: Config;
let ultimaLista: Sessione[] = [];
let dettaglio: Dettaglio | undefined;
let serverHook: ServerHook | undefined;
let mossaDaNoi = false; // per distinguere i nostri setBounds dai trascinamenti dell'utente

/** La lista che va all'interfaccia: senza la storia degli strumenti (quella va solo nel dettaglio). */
const leggera = (s: Sessione): Sessione => ({ ...s, strumenti: s.strumenti.slice(-1), sottoAgenti: s.sottoAgenti.map(leggera) });
const perLista = (l: Sessione[]) => (dettaglio ? dettaglio.perInterfaccia(l.map(leggera)) : l.map(leggera));

/** Area utile dello schermo su cui sta la finestra (non sempre il principale: con due monitor conta quello giusto). */
function areaLavoro() {
  const p = config?.posizione;
  if (p) return screen.getDisplayNearestPoint({ x: Math.round(p.x) - 10, y: Math.round(p.y) + 10 }).workArea;
  return screen.getPrimaryDisplay().workArea;
}

/** Ancora: angolo in alto a destra. Se la posizione salvata è fuori dagli schermi (monitor staccato), torna al default. */
function ancora(): { destra: number; alto: number } {
  const p = config.posizione;
  if (p && screen.getAllDisplays().some((d) => p.x > d.workArea.x + 40 && p.x <= d.workArea.x + d.workArea.width + 1 && p.y >= d.workArea.y - 1 && p.y < d.workArea.y + d.workArea.height - 40))
    return { destra: p.x, alto: p.y };
  const a = areaLavoro();
  return { destra: a.x + a.width - MARGINE, alto: a.y + MARGINE };
}

function ridimensiona(larghezza: number, altezza: number) {
  if (!win) return;
  const { destra, alto } = ancora();
  const max = Math.floor(areaLavoro().height * 0.8);
  const w = Math.round(larghezza), h = Math.max(40, Math.min(max, Math.round(altezza)));
  const b = win.getBounds();
  // tolleranza: differenze di 1-2 px (arrotondamenti con lo schermo in scala) non muovono la finestra
  if (b.width === w && Math.abs(b.height - h) <= 2 && b.x === destra - w && b.y === alto) return;
  mossaDaNoi = true;
  ultimoImposto = { x: destra - w, y: alto };
  win.setBounds({ x: destra - w, y: alto, width: w, height: h });
  setTimeout(() => (mossaDaNoi = false), 300);
}
/** Ultima posizione decisa da noi: gli eventi 'move' che la riportano non sono spostamenti dell'utente
 *  (Windows li manda anche a metà di un cambio di larghezza, con la larghezza vecchia: salvarli farebbe scivolare la finestra). */
let ultimoImposto: { x: number; y: number } | undefined;

function creaFinestra() {
  const { destra, alto } = ancora();
  win = new BrowserWindow({
    x: destra - LARGHEZZA_LISTA, y: alto, width: LARGHEZZA_LISTA, height: 160,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, title: 'AGENT TOWER',
    // Mac: 'panel' resta sopra anche alle app a schermo intero; Windows/Linux: 'toolbar' (fuori dalla barra delle app)
    type: SISTEMA === 'darwin' ? 'panel' : 'toolbar',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  applicaVisibilita();
  // non ruba il focus: si mostra senza attivarsi
  win.once('ready-to-show', () => win?.showInactive());
  // 'move' (non 'moved'): su Windows 'moved' arriva solo alla fine di un trascinamento col mouse,
  // mentre la finestra può essere spostata anche in altri modi (scorciatoie di Windows, altri programmi)
  win.on('move', () => {
    if (!win || mossaDaNoi) return;
    const b = win.getBounds();
    if (ultimoImposto && Math.abs(b.x - ultimoImposto.x) <= 2 && Math.abs(b.y - ultimoImposto.y) <= 2) return;
    config.posizione = { x: b.x + b.width, y: b.y };
    salvaConfig(config);
  });
  win.on('closed', () => (win = undefined));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // errori dell'interfaccia nel registro del processo principale (diagnosi)
  win.webContents.on('console-message', (e) => { if (e.level === 'warning' || e.level === 'error') console.warn(`[interfaccia] ${e.message} (${e.sourceId}:${e.lineNumber})`); });
  win.webContents.on('did-fail-load', (_e, cod, desc) => console.warn('caricamento fallito', cod, desc));
  win.webContents.on('render-process-gone', (_e, d) => console.warn('interfaccia caduta', d.reason));

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

/**
 * Come si vede e si comporta la finestra sopra le altre:
 * - condivisione schermo: invisibile in Teams/Meet/OBS e negli screenshot (tranne in modalità registrazione,
 *   che serve proprio per farla vedere nei video, con i dati personali nascosti);
 * - fantasma: semi-trasparente e i clic passano alle finestre sotto. Per usarla: Ctrl + mouse sopra.
 */
const OPACITA_FANTASMA = 0.45;
let interattiva = false; // in modalità fantasma: l'utente la sta usando (Ctrl + mouse sopra)
function applicaVisibilita() {
  if (!win) return;
  win.setContentProtection(config.nascostaInCondivisione !== false && !config.registrazione);
  const fantasma = !!config.fantasma && !interattiva;
  win.setIgnoreMouseEvents(fantasma, { forward: true });
  // Linux: il sistema non sa rendere trasparente la finestra intera → lo fa l'interfaccia (classe "fantasma")
  if (PUO.opacitaFinestra) win.setOpacity(fantasma ? OPACITA_FANTASMA : 1);
}
function impostaFantasma(attivo: boolean) {
  config.fantasma = attivo; interattiva = false; salvaConfig(config);
  applicaVisibilita(); inviaConfig(); aggiornaTray();
}

/** Tema: 'sistema' segue Windows; chiaro/scuro lo forzano. L'interfaccia segue da sola (prefers-color-scheme). */
function applicaTema() {
  const t = config.tema ?? 'sistema';
  nativeTheme.themeSource = t === 'chiaro' ? 'light' : t === 'scuro' ? 'dark' : 'system';
}
function impostaTema(t: unknown) {
  if (t !== 'sistema' && t !== 'chiaro' && t !== 'scuro') return;
  config.tema = t; salvaConfig(config);
  applicaTema(); inviaConfig(); aggiornaTray();
}

function mostraNascondi(forza?: boolean) {
  if (!win) return creaFinestra();
  const visibile = forza ?? !win.isVisible();
  if (visibile) win.showInactive(); else win.hide();
  aggiornaTray();
}

function cambiaModo(modo: Config['modo']) {
  config.modo = modo; salvaConfig(config);
  inviaConfig();
  aggiornaTray();
}

/** La config va all'interfaccia insieme allo stato degli hook (che non si salva: si legge da settings.json). */
function inviaConfig() { win?.webContents.send('config', { ...config, hook: statoHook(), sistema: SISTEMA }); }

/**
 * Attiva/disattiva gli hook. Scrive in ~/.claude/settings.json SOLO dopo la conferma esplicita nel dialogo,
 * con backup in %APPDATA%\agent-tower\backup-settings, aggiungendo/togliendo SOLO le voci di AGENT TOWER.
 */
async function cambiaHook() {
  const attivi = statoHook() !== 'assenti';
  const azione = attivi ? 'rimuovi' : 'installa';
  let cmd: string;
  try { cmd = comando(); anteprimaHook(azione); } catch (e) { dialog.showErrorBox('AGENT TOWER', (e as Error).message); return; }
  const dettaglio = attivi
    ? `Tolgo da ${fileSettings()} SOLO le voci di AGENT TOWER (quelle con il comando ${cmd}).\nTutto il resto resta com'è.\n\nPrima faccio una copia di backup in:\n${cartellaBackupHook()}`
    : `Claude Code avviserà AGENT TOWER a ogni evento (strumento, richiesta di permesso, fine): così "aspetta te" diventa preciso.\n\n` +
      `Cosa cambia: in ${fileSettings()} aggiungo la sezione "hooks" con ${EVENTI.length} voci (${EVENTI.map((e) => e.evento).join(', ')}), tutte con lo stesso comando:\n${cmd}\n\n` +
      `• Nient'altro nel file viene toccato.\n• Prima faccio una copia di backup in:\n  ${cartellaBackupHook()}\n• I dati vanno solo all'app sul tuo PC (127.0.0.1).\n• Gli hook girano in background: non rallentano Claude. Se AGENT TOWER è spenta non succede niente.\n• Vale per le sessioni nuove (quelle già aperte restano con la stima).\n• Si toglie da qui con un clic.`;
  for (;;) {
    const r = await dialog.showMessageBox(win!, {
      type: 'question', title: 'AGENT TOWER — stato preciso', noLink: true, defaultId: 2, cancelId: 2,
      message: attivi ? 'Togliere gli hook di AGENT TOWER?' : 'Attivare lo stato preciso (hook di Claude Code)?',
      detail: dettaglio, buttons: [attivi ? 'Togli gli hook' : 'Attiva', 'Mostra la modifica esatta', 'Annulla'],
    });
    if (r.response === 2) return;
    if (r.response === 1) { mostraModifica(azione, cmd); continue; }
    break;
  }
  try {
    const esito = attivi ? rimuoviHook() : installaHook();
    inviaConfig(); aggiornaTray();
    await dialog.showMessageBox(win!, { type: 'info', title: 'AGENT TOWER', message: attivi ? 'Hook tolti.' : 'Stato preciso attivo.',
      detail: `${esito.backup ? `Backup: ${esito.backup}\n` : ''}${attivi ? 'Le sessioni nuove tornano alla stima.' : 'Vale per le sessioni di Claude Code che apri da adesso.'}` });
  } catch (e) { dialog.showErrorBox('AGENT TOWER', `Non ho cambiato niente: ${(e as Error).message}`); }
}

/** Scrive in %APPDATA%\agent-tower un file leggibile con il blocco esatto che si aggiunge (o si toglie) e lo apre. */
function mostraModifica(azione: 'installa' | 'rimuovi', cmd: string) {
  const f = path.join(app.getPath('userData'), 'modifica-settings.txt');
  const a = anteprimaHook(azione);
  const righe = (t: string) => t.split(/\r?\n/).length;
  fs.writeFileSync(f, [
    `AGENT TOWER — ${azione === 'installa' ? 'cosa AGGIUNGO' : 'cosa TOLGO'} in ${fileSettings()}`,
    `(il file passa da ${righe(a.prima)} a ${righe(a.dopo)} righe; il resto resta identico)`, '',
    azione === 'installa' ? 'Blocco aggiunto (unito a eventuali hook che hai già, senza toccarli):' : 'Voci tolte (solo quelle con questo comando):', '',
    JSON.stringify({ hooks: bloccoNostro(cmd) }, null, 2), '',
  ].join('\n'));
  shell.openPath(f);
}

const PRIORITA: Stato[] = ['aspetta', 'lavora', 'finito', 'inattivo'];
function statoPiuUrgente(l: Sessione[]): Stato | 'nessuno' {
  const visibili = l.filter((s) => s.stato !== 'inattivo');
  for (const p of PRIORITA) if (visibili.some((s) => s.stato === p || s.sottoAgenti.some((a) => a.stato === p && p === 'aspetta'))) return p;
  return 'nessuno';
}

function aggiornaTray() {
  if (!tray) return;
  const attivi = ultimaLista.filter((s) => s.stato !== 'inattivo');
  const aspettano = attivi.filter((s) => s.stato === 'aspetta').length;
  tray.setImage(iconaTray(statoPiuUrgente(ultimaLista)));
  tray.setToolTip(`AGENT TOWER — ${attivi.length} ${attivi.length === 1 ? 'agente' : 'agenti'}${aspettano ? ` · ${aspettano} aspetta${aspettano > 1 ? 'no' : ''} te` : ''}`);
  const visibile = !!win?.isVisible();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: visibile ? 'Nascondi la finestra' : 'Mostra la finestra', click: () => mostraNascondi() },
    { label: config.modo === 'lista' ? 'Riduci a striscia' : 'Apri la lista', click: () => cambiaModo(config.modo === 'lista' ? 'pillola' : 'lista') },
    { label: `Fantasma: trasparente, i clic passano sotto (${PUO.mouseAttraversoFantasma ? `${P.ctrl} + mouse per usarla` : `${scorciatoiaLeggibile(SCORCIATOIA_FANTASMA, SISTEMA)} per riprenderla`})`, type: 'checkbox', checked: !!config.fantasma, click: (m) => impostaFantasma(m.checked) },
    PUO.nascondiInCondivisione === 'no'
      ? { label: 'Invisibile quando condividi lo schermo (Linux non lo permette)', enabled: false }
      : { label: `Invisibile quando condividi lo schermo${PUO.nascondiInCondivisione === 'parziale' ? ' (su Mac non con tutte le app)' : ''}`, type: 'checkbox', checked: config.nascostaInCondivisione !== false, click: (m) => { config.nascostaInCondivisione = m.checked; salvaConfig(config); applicaVisibilita(); } },
    { label: 'Colori', submenu: [
      { label: `Come ${P.sistema}`, type: 'radio', checked: (config.tema ?? 'sistema') === 'sistema', click: () => impostaTema('sistema') },
      { label: 'Chiaro', type: 'radio', checked: config.tema === 'chiaro', click: () => impostaTema('chiaro') },
      { label: 'Scuro', type: 'radio', checked: config.tema === 'scuro', click: () => impostaTema('scuro') },
    ] },
    { label: 'Modalità registrazione (nasconde percorsi e nomi, visibile nei video)', type: 'checkbox', checked: !!config.registrazione, click: (m) => impostaRegistrazione(m.checked) },
    { label: statoHook() === 'assenti' ? 'Attiva stato preciso (hook)…' : 'Stato preciso attivo — togli gli hook…', click: () => cambiaHook() },
    { label: 'Riporta in alto a destra', click: () => { config.posizione = undefined; salvaConfig(config); inviaConfig(); } },
    { type: 'separator' },
    { label: `Mostra/nascondi: ${scorciatoiaLeggibile(config.scorciatoia, SISTEMA)}`, enabled: false },
    { label: `Fantasma sì/no: ${scorciatoiaLeggibile(SCORCIATOIA_FANTASMA, SISTEMA)}`, enabled: false },
    { label: 'Esci', click: () => app.quit() },
  ]));
}

function impostaRegistrazione(attiva: boolean) {
  config.registrazione = attiva; salvaConfig(config);
  applicaVisibilita();
  inviaConfig();
  win?.webContents.send('sessioni', perLista(ultimaLista));
  dettaglio?.invia();
  aggiornaTray();
}

function registraScorciatoia() {
  globalShortcut.unregisterAll();
  try {
    if (!globalShortcut.register(config.scorciatoia, () => mostraNascondi()))
      console.warn(`scorciatoia ${config.scorciatoia} già usata da un altro programma`);
    if (!globalShortcut.register(SCORCIATOIA_FANTASMA, () => impostaFantasma(!config.fantasma)))
      console.warn(`scorciatoia ${SCORCIATOIA_FANTASMA} già usata da un altro programma`);
  } catch (e) { console.warn('scorciatoia non valida', e); }
}

app.on('second-instance', () => mostraNascondi(true));

app.whenReady().then(() => {
  config = leggiConfig();
  applicaTema();
  if (SISTEMA === 'win32') app.setAppUserModelId('AgentTower');
  // Mac: niente icona nel Dock, vive solo nella barra in alto (come le app di utilità)
  if (SISTEMA === 'darwin') app.dock?.hide();

  ipcMain.on('pronto', (e) => { inviaConfig(); e.sender.send('sessioni', perLista(ultimaLista)); });
  ipcMain.on('dimensione', (_e, w: number, h: number) => ridimensiona(w, h));
  ipcMain.on('modo', (_e, modo: Config['modo']) => cambiaModo(modo));
  ipcMain.on('nascondi', () => mostraNascondi(false));
  ipcMain.on('hook', () => cambiaHook());
  ipcMain.on('esci', () => app.quit());
  ipcMain.on('tema', (_e, t: unknown) => impostaTema(t));
  ipcMain.on('fantasma', (_e, attivo: unknown) => impostaFantasma(!!attivo));
  // in modalità fantasma: Ctrl + mouse sopra → la finestra torna piena e cliccabile finché il mouse resta sopra
  ipcMain.on('interagisci', (_e, si: unknown) => {
    if (!config.fantasma || interattiva === !!si) return;
    interattiva = !!si; applicaVisibilita();
  });
  ipcMain.on('imposta', (_e, campo: 'mostraInattive' | 'aperte' | 'registrazione', valore: unknown) => {
    if (campo === 'mostraInattive') config.mostraInattive = !!valore;
    if (campo === 'registrazione') { impostaRegistrazione(!!valore); return; }
    if (campo === 'aperte' && Array.isArray(valore)) config.aperte = valore.filter((x) => typeof x === 'string').slice(-50);
    salvaConfig(config);
  });
  dettaglio = new Dettaglio(() => motore, () => win, () => !!config.registrazione);

  creaFinestra();
  tray = new Tray(iconaTray('nessuno'));
  // Mac e Linux: il clic sull'icona apre il menu (è il comportamento normale lì); Windows: clic = mostra/nascondi
  if (SISTEMA === 'win32') tray.on('click', () => mostraNascondi());
  // Mac: l'icona della barra in alto cambia colore col tema (chiara su barra scura e viceversa)
  nativeTheme.on('updated', () => aggiornaTray());
  aggiornaTray();
  registraScorciatoia();

  // AGENT_TOWER_RADICE: legge da un'altra cartella (demo, prove) invece di ~/.claude/projects
  motore = new Motore({ radice: process.env.AGENT_TOWER_RADICE || undefined, strumentiInLista: 1 });
  motore.on('sessioni', (l: Sessione[]) => {
    ultimaLista = l;
    win?.webContents.send('sessioni', perLista(l));
    dettaglio?.invia();
    aggiornaTray();
  });
  motore.on('errore', (e) => console.warn('motore:', e));
  serverHook = new ServerHook((e) => motore?.riceviHook(e));
  serverHook.avvia();
  motore.avvia();
  // i "da quanto" e gli stati a tempo (es. inattivo dopo 30 min) si aggiornano anche senza nuovi eventi
  setInterval(() => motore && motore.emit('sessioni', motore.istantanea()), 15_000);

  screen.on('display-metrics-changed', () => inviaConfig());
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); motore?.ferma(); serverHook?.ferma(); });
app.on('window-all-closed', () => { /* resta nel tray */ });
