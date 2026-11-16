/** Modello dati di AGENT TOWER. Tutto ciò che va all'interfaccia è serializzabile (niente Map/Set). */

export type Stato = 'aspetta' | 'lavora' | 'finito' | 'inattivo';

/** Perché una sessione è in quello stato: serve all'interfaccia per spiegarlo in parole semplici. */
export type Motivo =
  | 'domanda'          // AskUserQuestion senza risposta
  | 'permesso?'        // strumento veloce fermo da troppo: probabilmente chiede un permesso (stima)
  | 'permesso'         // chiede un permesso: certo, arriva dagli hook
  | 'chiusa'           // sessione chiusa (hook SessionEnd)
  | 'strumento'        // sta eseguendo uno strumento
  | 'sotto-agente'     // aspetta un sotto-agente
  | 'background'       // turno finito ma un comando/agente in background sta ancora andando
  | 'pensa'            // aspetta la risposta del modello
  | 'fine-turno'       // ha finito di rispondere
  | 'interrotto'       // fermato dall'utente
  | 'errore-api'       // ultimo evento è un errore dell'API
  | 'silenzio';        // nessun evento da troppo tempo

export interface Strumento {
  id: string;
  nome: string;                 // Bash, Edit, mcp__server__tool...
  azione: string;               // frase leggibile: "Esegue: Avvia i test"
  dettaglio?: string;           // comando esatto, file, pattern, URL...
  inizio: number;               // ms epoch
  fine?: number;
  errore?: boolean;
  risultato?: string;           // coda dell'output (accorciata)
  background?: { taskId: string; outputFile?: string; finito?: boolean; esito?: string };
  agentId?: string;             // per lo strumento Agent: id del sotto-agente
  diff?: { vecchio: string; nuovo: string; troncato?: boolean };  // Edit/Write: cosa è cambiato
  sensibile?: boolean;          // tocca un .env o simili: l'output va oscurato tutto
  extra?: string;               // altro dettaglio leggibile (es. prompt del sotto-agente, domanda)
}

export interface Sessione {
  id: string;
  file: string;
  padreId?: string;             // se è un sotto-agente
  toolUseIdPadre?: string;      // id del tool_use "Agent" nella madre
  tipoAgente?: string;          // general-purpose, Explore...
  titolo: string;
  progetto: string;             // nome cartella del progetto (stabile)
  cwdProgetto?: string;         // percorso completo del progetto
  cwdAttuale?: string;
  ramo?: string;
  entrypoint?: string;          // claude-desktop, cli, sdk-cli
  versione?: string;
  modello?: string;
  modoPermessi?: string;
  primoPrompt?: string;
  ultimoPrompt?: string;
  ultimoTesto?: string;         // ultimo messaggio dell'assistente
  inizio: number;
  ultimaAttivita: number;
  stato: Stato;
  motivo: Motivo;
  stimato: boolean;             // true se lo stato è dedotto (senza hook)
  daQuando: number;             // ms epoch dell'ultimo cambio di stato
  ultimaAzione: string;
  strumentoAttivo?: string;     // nome dello strumento in corso
  contatori: { strumenti: number; errori: number; inBackground: number };
  ultimoErrore?: { quando: number; testo: string };
  strumenti: Strumento[];       // ultimi N, dal più vecchio al più recente
  sottoAgenti: Sessione[];
  finitoMeta?: boolean;         // dal .meta.json del sotto-agente
  conHook?: boolean;            // da questa sessione arrivano gli eventi degli hook (stato preciso)
}

export interface OpzioniStato {
  ora: number;
  inattivoDopoMs: number;       // default 30 min
  sogliaPermessoMs: number;     // default 10 s
  pensaMaxMs: number;           // oltre questo, "pensa" senza eventi diventa silenzio (default 10 min)
}

export const OPZIONI_STATO_DEFAULT: Omit<OpzioniStato, 'ora'> = {
  inattivoDopoMs: 30 * 60_000,
  sogliaPermessoMs: 10_000,
  pensaMaxMs: 10 * 60_000,
};
