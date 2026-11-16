import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { app } from 'electron';
import { leggiEvento, type EventoHook } from '../core/hook';
import { anteprima, applica, comandoHook, leggiStato, SEGNO, type StatoInstallazione } from '../core/installa-hook';

/** ~/.claude/settings.json: lo si tocca SOLO da installa()/rimuovi(), dopo la conferma dell'utente. */
export const fileSettings = () => process.env.AGENT_TOWER_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const cartellaHook = () => path.join(app.getPath('userData'), 'hook');
const cartellaBackup = () => path.join(app.getPath('userData'), 'backup-settings');
const scriptHook = () => path.join(cartellaHook(), SEGNO);

/** Copia lo script dello hook in %APPDATA%\agent-tower\hook (percorso stabile, anche se l'app si sposta). */
function preparaScript() {
  const origini = [path.join(app.getAppPath(), 'risorse', SEGNO), path.join(process.resourcesPath ?? '', 'risorse', SEGNO)];
  const o = origini.find((p) => fs.existsSync(p));
  if (!o) throw new Error('script dello hook non trovato');
  fs.mkdirSync(cartellaHook(), { recursive: true });
  const nuovo = fs.readFileSync(o, 'utf8');
  if (!fs.existsSync(scriptHook()) || fs.readFileSync(scriptHook(), 'utf8') !== nuovo) fs.writeFileSync(scriptHook(), nuovo);
}

/** Node installato (percorso assoluto) oppure, se manca, l'app stessa in modalità Node. */
function trovaNode(): string | undefined {
  const primo = (out: string) => out.split(/\r?\n/).map((s) => s.trim()).find((s) => s && path.isAbsolute(s) && fs.existsSync(s));
  try {
    const t = primo(execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8', timeout: 3000, windowsHide: true }));
    if (t) return t;
  } catch { /* non nel PATH dell'app */ }
  if (process.platform === 'win32') return undefined;
  // Mac/Linux: le app aperte dal Finder o dal menu non hanno il PATH del terminale (Homebrew, nvm…):
  // lo chiediamo alla shell di login dell'utente, poi proviamo i posti soliti
  try {
    const t = primo(execFileSync(process.env.SHELL || '/bin/sh', ['-lc', 'command -v node'], { encoding: 'utf8', timeout: 4000 }));
    if (t) return t;
  } catch { /* shell senza node */ }
  return ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node'].find((p) => fs.existsSync(p));
}
export function comando() { return comandoHook(scriptHook(), trovaNode(), process.execPath); }

export const statoHook = (): StatoInstallazione => leggiStato(fileSettings());
export function anteprimaHook(azione: 'installa' | 'rimuovi') { return anteprima(fileSettings(), comando(), azione); }
export function installaHook() { preparaScript(); return applica(fileSettings(), cartellaBackup(), comando(), 'installa'); }
export function rimuoviHook() { return applica(fileSettings(), cartellaBackup(), comando(), 'rimuovi'); }
export const cartellaBackupHook = cartellaBackup;

/**
 * Server locale: SOLO 127.0.0.1, porta scelta dal sistema, chiave nuova a ogni avvio.
 * Porta e chiave stanno in hook/connessione.json, che lo script legge a ogni evento.
 */
export class ServerHook {
  private server?: http.Server;
  private token = crypto.randomBytes(24).toString('hex');
  ricevuti = 0;

  constructor(private suEvento: (e: EventoHook) => void) {}

  avvia() {
    try { preparaScript(); } catch (e) { console.warn('hook:', e); }
    this.server = http.createServer((req, res) => {
      const porta = (this.server?.address() as { port: number } | null)?.port;
      // solo POST /evento, dalla macchina stessa, con la chiave giusta (niente pagine web che fingono eventi)
      const ok = req.method === 'POST' && req.url === '/evento' && req.headers.host === `127.0.0.1:${porta}` && req.headers['x-agent-tower'] === this.token && !req.headers.origin;
      if (!ok) { res.writeHead(403).end(); req.resume(); return; }
      let dati = '';
      req.setEncoding('utf8');
      req.on('data', (c) => { dati += c; if (dati.length > 256 * 1024) { res.writeHead(413).end(); req.destroy(); } });
      req.on('end', () => {
        res.writeHead(204).end();
        try { const e = leggiEvento(JSON.parse(dati)); if (e) { this.ricevuti++; if (process.env.AGENT_TOWER_DEBUG_HOOK) console.log('[hook]', e.hook_event_name, e.session_id.slice(0, 8), e.tool_name ?? '', e.notification_type ?? ''); this.suEvento(e); } } catch { /* ignorato */ }
      });
    });
    this.server.on('error', (e) => console.warn('server hook:', e));
    this.server.listen(0, '127.0.0.1', () => {
      const porta = (this.server!.address() as { port: number }).port;
      try {
        fs.mkdirSync(cartellaHook(), { recursive: true });
        fs.writeFileSync(path.join(cartellaHook(), 'connessione.json'), JSON.stringify({ porta, token: this.token }), { mode: 0o600 });
      } catch (e) { console.warn('hook:', e); }
    });
  }

  ferma() {
    this.server?.close();
    try { fs.rmSync(path.join(cartellaHook(), 'connessione.json'), { force: true }); } catch {}
  }
}
