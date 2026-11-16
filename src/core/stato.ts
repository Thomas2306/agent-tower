import { ModelloSessione } from './modello';
import { Motivo, OpzioniStato, Sessione, Stato, Strumento } from './tipi';
import type { InfoHook } from './hook';
import { nomeCartella } from './piattaforma';

/** Strumenti che possono durare a lungo da soli: se sono fermi NON vuol dire che aspettano un permesso. */
const LENTI = new Set(['Bash', 'PowerShell', 'Agent', 'Task', 'WebSearch', 'WebFetch', 'Monitor', 'Skill', 'Workflow', 'SendMessage']);
const eLento = (nome: string) => LENTI.has(nome) || /wait|generate|render|batch|browser|computer|preview|navigate|screenshot/i.test(nome);

export interface Calcolo { stato: Stato; motivo: Motivo; stimato: boolean; daQuando: number; ultimaAzione: string; strumentoAttivo?: string }

/** Regole della sezione 2 del piano, versione "solo registri". Funzione pura: facile da testare. */
export function calcolaStato(m: ModelloSessione, sotto: Sessione[], o: OpzioniStato, finitoMeta?: boolean, hook?: { attivo: boolean; info?: InfoHook }): Calcolo {
  const silenzio = o.ora - m.ultimaAttivita;
  const aperti = [...m.aperti.values()].filter((s) => !s.background);
  const ultimoAperto = aperti[aperti.length - 1];

  // sotto-agente che il .meta.json dà per finito: è la fonte più affidabile, vince su tutto
  if (finitoMeta) return { stato: 'finito', motivo: 'fine-turno', stimato: false, daQuando: m.ultimaAttivita, ultimaAzione: 'Ha finito' };

  // 1. domanda all'utente senza risposta: aspetta te (certo). Resta "aspetta" fino a 4× la soglia di inattività.
  const domanda = aperti.find((s) => s.nome === 'AskUserQuestion');
  if (domanda && silenzio < o.inattivoDopoMs * 4) return { stato: 'aspetta', motivo: 'domanda', stimato: false, daQuando: domanda.inizio, ultimaAzione: domanda.azione, strumentoAttivo: domanda.nome };

  // 1b. con gli hook: richiesta di permesso CERTA. Vale finché lo strumento è ancora aperto nel registro
  //     (quando finisce, o viene negato, il registro scrive il risultato e l'attesa si chiude da sola).
  const att = hook?.info?.attesa;
  if (att && o.ora - att.da < o.inattivoDopoMs * 4) {
    const s = att.strumento ? aperti.filter((x) => x.nome === att.strumento).pop() : ultimoAperto;
    const valida = att.strumento ? !!s || o.ora - att.da < 3000 : true; // 3 s di tolleranza: il registro può arrivare un attimo dopo
    if (valida) {
      const azione = att.tipo === 'input' ? (att.messaggio ? `Ti chiede: ${att.messaggio}` : 'Ti chiede una risposta') : `Chiede il permesso: ${s?.azione.replace(/^Esegue: /, '') ?? att.dettaglio ?? att.strumento ?? att.messaggio ?? 'uno strumento'}`;
      return { stato: 'aspetta', motivo: 'permesso', stimato: false, daQuando: att.da, ultimaAzione: azione, strumentoAttivo: s?.nome ?? att.strumento };
    }
  }
  // sessione chiusa (SessionEnd): inattiva, a meno che il registro non sia andato avanti dopo
  if (hook?.info?.chiusa && m.ultimaAttivita <= hook.info.chiusa + 1000)
    return { stato: 'inattivo', motivo: 'chiusa', stimato: false, daQuando: hook.info.chiusa, ultimaAzione: 'Sessione chiusa' };

  // 2. un sotto-agente aspetta te → aspetta anche la madre
  const sottoAspetta = sotto.find((s) => s.stato === 'aspetta');
  if (sottoAspetta && silenzio < o.inattivoDopoMs) return { stato: 'aspetta', motivo: 'sotto-agente', stimato: sottoAspetta.stimato, daQuando: sottoAspetta.daQuando, ultimaAzione: `Un aiutante: ${sottoAspetta.ultimaAzione}` };

  // 3. troppo silenzio: inattivo (ma un sotto-agente che lavora tiene viva la madre)
  const sottoLavora = sotto.find((s) => s.stato === 'lavora');
  if (silenzio >= o.inattivoDopoMs && !sottoLavora) return { stato: 'inattivo', motivo: 'silenzio', stimato: true, daQuando: m.ultimaAttivita, ultimaAzione: ultimaFrase(m) };

  // 4. strumenti in corso
  if (ultimoAperto) {
    const fermo = o.ora - ultimoAperto.inizio;
    // con gli hook attivi per questa sessione le richieste di permesso arrivano certe: niente stime
    if (!hook?.attivo && !eLento(ultimoAperto.nome) && fermo >= o.sogliaPermessoMs)
      return { stato: 'aspetta', motivo: 'permesso?', stimato: true, daQuando: ultimoAperto.inizio + o.sogliaPermessoMs, ultimaAzione: ultimoAperto.azione, strumentoAttivo: ultimoAperto.nome };
    const sa = ultimoAperto.nome === 'Agent' || ultimoAperto.nome === 'Task';
    return { stato: 'lavora', motivo: sa ? 'sotto-agente' : 'strumento', stimato: false, daQuando: m.inizioTurno || ultimoAperto.inizio, ultimaAzione: ultimoAperto.azione, strumentoAttivo: ultimoAperto.nome };
  }
  if (sottoLavora) return { stato: 'lavora', motivo: 'sotto-agente', stimato: false, daQuando: m.inizioTurno || sottoLavora.daQuando, ultimaAzione: `Un aiutante: ${sottoLavora.ultimaAzione}` };

  // 5. niente in corso: decide l'ultimo evento
  const bg = m.backgroundAttivi;
  switch (m.ultimoEvento) {
    case 'testo-fine': case 'fine-turno':
      if (bg.length) return { stato: 'lavora', motivo: 'background', stimato: true, daQuando: bg[bg.length - 1].inizio, ultimaAzione: `In background: ${bg[bg.length - 1].azione.replace(/^Esegue: /, '').replace(/ \(in background\)$/, '')}` };
      return { stato: 'finito', motivo: 'fine-turno', stimato: m.ultimoEvento === 'testo-fine', daQuando: m.quandoUltimoEvento, ultimaAzione: 'Ha finito' };
    case 'interrotto': return { stato: 'finito', motivo: 'interrotto', stimato: false, daQuando: m.quandoUltimoEvento, ultimaAzione: 'Interrotto da te' };
    case 'errore-api': return { stato: 'finito', motivo: 'errore-api', stimato: false, daQuando: m.quandoUltimoEvento, ultimaAzione: m.ultimoErrore?.testo ?? 'Errore API' };
    case 'nessuno': return { stato: 'inattivo', motivo: 'silenzio', stimato: true, daQuando: m.ultimaAttivita, ultimaAzione: 'Nessuna attività' };
    default: // prompt, thinking, testo, tool_result, tool_use, riprova-api: il modello sta lavorando
      if (silenzio >= o.pensaMaxMs) return { stato: 'inattivo', motivo: 'silenzio', stimato: true, daQuando: m.ultimaAttivita, ultimaAzione: ultimaFrase(m) };
      return { stato: 'lavora', motivo: 'pensa', stimato: false, daQuando: m.inizioTurno || m.quandoUltimoEvento, ultimaAzione: m.ultimoEvento === 'riprova-api' ? 'Errore API, riprova…' : m.ultimoEvento === 'thinking' ? 'Pensa…' : m.ultimoEvento === 'testo' ? 'Scrive la risposta' : 'Pensa…' };
  }
}

function ultimaFrase(m: ModelloSessione) {
  const s = m.strumenti[m.strumenti.length - 1];
  return s ? s.azione : m.ultimoTesto ? 'Ha risposto' : 'Nessuna attività';
}

export interface ExtraVista { padreId?: string; toolUseIdPadre?: string; tipoAgente?: string; descrizione?: string; finitoMeta?: boolean; progettoPadre?: { progetto: string; cwd?: string }; hook?: { attivo: boolean; info?: InfoHook } }

/** Costruisce la vista serializzabile di una sessione (con i suoi sotto-agenti già calcolati). */
export function vistaSessione(m: ModelloSessione, sotto: Sessione[], o: OpzioniStato, extra: ExtraVista = {}, maxStrumenti = 60): Sessione {
  const c = calcolaStato(m, sotto, o, extra.finitoMeta, extra.hook);
  const cwd = extra.progettoPadre?.cwd ?? m.cwdStabile;
  const inBg = m.backgroundAttivi.length;
  return {
    id: m.id, file: m.file, padreId: extra.padreId, toolUseIdPadre: extra.toolUseIdPadre, tipoAgente: extra.tipoAgente,
    titolo: extra.descrizione ?? m.titolo,
    progetto: extra.progettoPadre?.progetto ?? (cwd ? nomeCartella(cwd) : 'sconosciuto'),
    cwdProgetto: cwd, cwdAttuale: m.cwdAttuale, ramo: m.ramo, entrypoint: m.entrypoint, versione: m.versione, modello: m.modello, modoPermessi: m.modoPermessi,
    primoPrompt: m.primoPrompt, ultimoPrompt: m.ultimoPrompt, ultimoTesto: m.ultimoTesto,
    inizio: m.inizio, ultimaAttivita: m.ultimaAttivita,
    ...c,
    contatori: { strumenti: m.totStrumenti, errori: m.totErrori, inBackground: inBg },
    ultimoErrore: m.ultimoErrore,
    strumenti: m.strumenti.slice(-maxStrumenti).map(copia),
    sottoAgenti: sotto, finitoMeta: extra.finitoMeta, conHook: extra.hook?.attivo || undefined,
  };
}

const copia = (s: Strumento): Strumento => ({ ...s, background: s.background ? { ...s.background } : undefined });

/** Ordine della lista: aspetta te, poi lavora, poi finito, poi inattivo; dentro, il più recente prima. */
const PESO: Record<Stato, number> = { aspetta: 0, lavora: 1, finito: 2, inattivo: 3 };
export function ordina(a: Sessione, b: Sessione) {
  // dentro "aspetta te": prima le certezze (domande), poi le stime
  return PESO[a.stato] - PESO[b.stato] || (a.stato === 'aspetta' ? Number(a.stimato) - Number(b.stimato) : 0) || b.ultimaAttivita - a.ultimaAttivita;
}
