import type { Sessione, Stato } from '../core/tipi';
import { icona } from './icone';
import { capacita, parole, scorciatoiaLeggibile, sistema, type Sistema } from '../core/piattaforma';
export { icona };

/** Sistema su cui gira l'app (arriva con la config): decide le parole giuste ("vicino all'orologio" / "barra in alto"…). */
export let SIS: Sistema = sistema(navigator.userAgent.includes('Mac') ? 'darwin' : navigator.userAgent.includes('Windows') ? 'win32' : 'linux');
export const T = () => parole(SIS);
export const PUO = () => capacita(SIS);
export const tasti = (acc: string) => scorciatoiaLeggibile(acc, SIS);
export function impostaSistema(s?: string) { if (s) SIS = sistema(s); }

export interface Config { modo: 'lista' | 'pillola'; mostraInattive: boolean; aperte: string[]; registrazione?: boolean; hook?: 'assenti' | 'attivi' | 'parziali'; fantasma?: boolean; tema?: 'sistema' | 'chiaro' | 'scuro'; sistema?: string }
export interface PezzoOutput { strumentoId: string; testo: string; nuovo: boolean; manca?: boolean }

declare global {
  interface Window { torre: {
    suSessioni(f: (l: Sessione[]) => void): void; suConfig(f: (c: Config) => void): void; pronto(): void;
    dimensione(w: number, h: number): void; modo(m: 'lista' | 'pillola'): void; nascondi(): void; hook(): void; esci(): void; tema(t: 'sistema' | 'chiaro' | 'scuro'): void; fantasma(attivo: boolean): void; interagisci(si: boolean): void; imposta(campo: string, v: unknown): void;
    suDettaglio(f: (d: Sessione | null) => void): void; suOutput(f: (o: PezzoOutput) => void): void;
    apriDettaglio(id: string): void; chiudiDettaglio(): void; seguiOutput(id: string, strumentoId: string): void; smettiOutput(): void;
    copia(testo: string): void; apri(tipo: 'cartella' | 'registro', id: string): void;
  } }
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function durata(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} g`;
}
export const ora = (ms: number) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const ETICHETTA: Record<Stato, string> = { aspetta: 'Aspetta te', lavora: 'Lavora', finito: 'Finito', inattivo: 'Inattivo' };
const ICONA_STATO: Record<Stato, string> = { aspetta: 'campanella', lavora: '', finito: 'spunta', inattivo: 'luna' };
export const COLORE: Record<Stato, string> = { aspetta: 'var(--aspetta)', lavora: 'var(--lavora)', finito: 'var(--finito)', inattivo: 'var(--inattivo)' };

/** Nome dell'icona di uno strumento. */
export function nomeIcona(n: string): string {
  if (n === 'Bash' || n === 'PowerShell') return 'terminale';
  if (n === 'Read') return 'documento';
  if (n === 'Edit' || n === 'Write' || n === 'MultiEdit' || n === 'NotebookEdit') return 'matita';
  if (n === 'Grep' || n === 'Glob' || n === 'WebSearch') return 'lente';
  if (n === 'WebFetch' || /browser|navigate|preview/i.test(n)) return 'globo';
  if (n === 'Agent' || n === 'Task') return 'agente';
  if (n === 'AskUserQuestion') return 'domanda';
  if (n === 'TodoWrite' || /update_plan/.test(n)) return 'piano';
  if (n === 'TaskStop' || n === 'KillShell') return 'stop';
  if (n.startsWith('mcp__')) return 'presa';
  return 'ingranaggio';
}
export const iconaNome = (n: string) => icona(nomeIcona(n));

/** Icona dell'azione corrente di una sessione (tiene conto dello stato). */
export function iconaStrumento(s: Sessione): string {
  if (s.stato === 'aspetta' && s.motivo === 'domanda') return icona('domanda');
  if (s.stato === 'aspetta') return icona('lucchetto');
  if (s.motivo === 'background') return icona('orologio');
  if (s.motivo === 'sotto-agente') return icona('agente');
  if (s.stato === 'finito' || s.stato === 'inattivo') return icona(s.motivo === 'interrotto' ? 'stop' : s.motivo === 'errore-api' ? 'avviso' : 'messaggio');
  return s.strumentoAttivo ? iconaNome(s.strumentoAttivo) : icona('pensa');
}

export function chip(s: Sessione) {
  if (s.stato === 'aspetta' && s.stimato)
    return `<span class="chip stima" title="Stima: uno strumento è fermo da troppo, probabilmente chiede un permesso. Con lo stato preciso (pulsante col mirino) diventa certo.">${icona('campanella')} Forse aspetta te</span>`;
  const ic = s.stato === 'lavora' ? '<span class="pulsa"></span>' : icona(ICONA_STATO[s.stato]);
  return `<span class="chip ${s.stato}">${ic} ${ETICHETTA[s.stato]}</span>`;
}

/** Il tipo di sotto-agente in parole semplici. */
export function tipoAgente(t?: string): string {
  if (!t) return 'Aiutante';
  const k = t.toLowerCase();
  if (k === 'explore') return 'Esploratore';
  if (k === 'plan') return 'Pianificatore';
  if (k === 'general-purpose' || k === 'claude') return 'Aiutante';
  if (k === 'fork') return 'Copia di sé';
  if (k.includes('guide')) return 'Guida';
  if (k.includes('fetch')) return 'Lettore web';
  if (k.includes('review')) return 'Revisore';
  return t;
}
