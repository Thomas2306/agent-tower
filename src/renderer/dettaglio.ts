import type { Sessione, Strumento } from '../core/tipi';
import { chip, durata, esc, icona, T, tasti, iconaNome, iconaStrumento, ora, PezzoOutput, tipoAgente } from './comuni';
import { mascotte } from './mascotte';

const MAX_OUTPUT = 200_000; // caratteri tenuti in memoria per l'output in diretta

/**
 * Vista dettaglio di una sessione (o di un sotto-agente): richiesta, ultima risposta,
 * strumento selezionato col comando esatto e l'output (anche in diretta), cronologia degli strumenti.
 */
export class Vista {
  id?: string;
  private dati?: Sessione;
  private selezionato?: string;
  private segueUltimo = true;            // seleziona da solo l'ultimo strumento finché non scegli tu
  private pila: string[] = [];           // per tornare dal sotto-agente alla madre
  private output: { strumentoId?: string; testo: string; manca?: boolean } = { testo: '' };
  private richiestaAperta = false;

  constructor(private radice: HTMLElement, private ridisegnaTutto: () => void) {
    window.torre.suDettaglio((d) => this.suDati(d));
    window.torre.suOutput((o) => this.suOutput(o));
    radice.addEventListener('click', (e) => this.clic(e));
  }

  get attivo() { return !!this.id; }

  apri(id: string, daFiglio = false) {
    if (this.id && daFiglio) this.pila.push(this.id);
    if (!daFiglio) this.pila = [];
    this.id = id; this.dati = undefined; this.selezionato = undefined; this.segueUltimo = true; this.output = { testo: '' };
    window.torre.smettiOutput();
    window.torre.apriDettaglio(id);
    this.ridisegnaTutto();
  }

  chiudi() {
    const precedente = this.pila.pop();
    if (precedente) return this.apri(precedente, false);
    this.id = undefined; this.dati = undefined;
    window.torre.chiudiDettaglio();
    this.ridisegnaTutto();
  }

  private suDati(d: Sessione | null) {
    if (!this.id) return;
    if (!d) { this.dati = undefined; return this.ridisegnaTutto(); }
    if (d.id !== this.id) return;
    this.dati = d;
    const ultimo = d.strumenti[d.strumenti.length - 1];
    if (this.segueUltimo && ultimo) this.selezionato = ultimo.id;
    this.ridisegnaTutto();
  }

  private suOutput(o: PezzoOutput) {
    if (o.strumentoId !== this.selezionato) return;
    if (o.nuovo || this.output.strumentoId !== o.strumentoId) this.output = { strumentoId: o.strumentoId, testo: '', manca: o.manca };
    this.output.testo = (this.output.testo + o.testo).slice(-MAX_OUTPUT);
    const pre = this.radice.querySelector<HTMLElement>('#output-diretta');
    if (pre) { // aggiunta senza ridisegnare tutto
      const inFondo = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 30;
      pre.textContent = this.output.testo || (o.manca ? 'File di output non trovato.' : 'In attesa di output…');
      if (inFondo) pre.scrollTop = pre.scrollHeight;
    }
  }

  private strumento(): Strumento | undefined { return this.dati?.strumenti.find((s) => s.id === this.selezionato); }

  disegna(): string {
    const d = this.dati;
    if (!d) return `<div class="pannello dettaglio"><div class="testa"><button class="bottone" data-d="indietro" title="Indietro">${icona('indietro')}</button><span class="logo">Carico…</span></div></div>`;
    const s = this.strumento();
    // output in diretta: si chiede al processo principale solo per i comandi in background
    if (s?.background?.outputFile && this.output.strumentoId !== s.id) { this.output = { strumentoId: s.id, testo: '' }; window.torre.seguiOutput(d.id, s.id); }
    else if (s && !s.background?.outputFile && this.output.strumentoId) { this.output = { testo: '' }; window.torre.smettiOutput(); }

    const frase = d.stato === 'finito' && d.motivo === 'fine-turno' ? 'Ha finito il suo turno' : d.stato === 'inattivo' ? 'Fermo da un po’' : d.ultimaAzione;
    return `
    <div class="pannello dettaglio">
      <div class="testa">
        <button class="bottone" data-d="indietro" title="${this.pila.length ? 'Torna alla sessione principale' : 'Torna alla lista'}">${icona('indietro')}</button>
        <span class="titolo-d" title="${esc(d.titolo)}">${d.padreId ? 'Aiutante' : 'Sessione'}</span>
        <button class="bottone" data-d="cartella" title="Apri la cartella del progetto">${icona('cartella')}</button>
        <button class="bottone" data-d="registro" title="Mostra il file del registro della sessione">${icona('file')}</button>
        <button class="chiudi" data-azione="nascondi" title="Chiudi la finestra (resta accesa ${T().doveIcona}: ${tasti('Control+Alt+A')} per riaprirla)">${icona('x')}</button>
      </div>
      <div class="corpo-d">
        <div class="eroe ${d.stato}">
          ${mascotte(d.id, d.stato, 'grande')}
          <div class="eroe-testo">
            <div class="eroe-titolo" title="${esc(d.titolo)}">${d.padreId ? `<span class="tipo">${esc(tipoAgente(d.tipoAgente))}</span> ` : ''}${esc(d.titolo)}</div>
            <div class="eroe-meta">
              <span class="progetto" title="${esc(d.cwdProgetto ?? '')}">${icona('cartella')}${esc(d.progetto)}</span>
              ${d.ramo ? `<span class="ramo">${icona('ramo')}${esc(d.ramo)}</span>` : ''}
            </div>
            <div class="eroe-adesso">${chip(d)}<span class="tempo" data-da="${d.daQuando}"></span></div>
          </div>
        </div>
        <div class="adesso ${d.stato}"><span class="icona">${iconaStrumento(d)}</span><span>${esc(frase)}</span></div>
        ${this.blocchiTesto(d)}
        ${d.sottoAgenti.length ? `<div class="sezione-d">${icona('agente')} Aiutanti <span class="tenue">· ${d.sottoAgenti.length}</span></div>
          <div class="aiutanti-d">${d.sottoAgenti.map((a) => `
          <button class="aiutante-d ${a.stato}" data-d-agente="${esc(a.id)}" title="Clic per vedere cosa fa">
            ${mascotte(a.id, a.stato, 'piccola')}
            <span class="aiutante-testo">
              <span class="agente-r1"><span class="tipo">${esc(tipoAgente(a.tipoAgente))}</span><span class="nome">${esc(a.titolo)}</span></span>
              <span class="cosa">${a.stato === 'finito' ? `${icona('spunta')} Ha finito` : `${iconaStrumento(a)} ${esc(a.ultimaAzione)}`}</span>
            </span>
            ${icona('freccia', 'vai')}
          </button>`).join('')}</div>` : ''}
        ${s ? `<div class="sezione-d">${icona('occhio')} ${s.id === d.strumenti[d.strumenti.length - 1]?.id ? 'Ultimo strumento' : 'Strumento scelto'}</div>${this.schedaStrumento(d, s)}` : '<div class="vuoto-d">Nessuno strumento ancora usato.</div>'}
        <div class="sezione-d">${icona('orologio')} Cronologia <span class="tenue">· ${d.contatori.strumenti} strumenti${d.contatori.errori ? ` · <span class="segno errore">${icona('x')}${d.contatori.errori}</span>` : ''}</span>
          ${!this.segueUltimo ? `<button class="link" data-d="segui">${icona('giu')} segui l'ultimo</button>` : ''}</div>
        <div class="cronologia">${[...d.strumenti].reverse().map((t) => this.rigaCronologia(t)).join('')}</div>
      </div>
    </div>`;
  }

  private blocchiTesto(d: Sessione) {
    const richiesta = d.ultimoPrompt ?? d.primoPrompt;
    return `
      ${richiesta ? `<div class="blocco-d ${this.richiestaAperta ? 'aperto' : ''}" data-d="richiesta" title="Clic per ${this.richiestaAperta ? 'accorciare' : 'leggere tutto'}">
        <div class="etichetta-d">${icona('persona')} Hai chiesto</div><div class="testo-d">${esc(richiesta)}</div></div>` : ''}
      ${d.ultimoTesto ? `<div class="blocco-d" data-d="richiesta"><div class="etichetta-d">${icona('messaggio')} Ultima risposta</div><div class="testo-d">${esc(d.ultimoTesto)}</div></div>` : ''}`;
  }

  private schedaStrumento(d: Sessione, s: Strumento) {
    const inCorso = !s.fine && !s.background;
    const bgVivo = s.background && !s.background.finito;
    const tempo = inCorso ? `in corso da <span data-da="${s.inizio}"></span>`
      : `${ora(s.inizio)}${s.fine && s.fine - s.inizio >= 1000 ? ` · ${durata(s.fine - s.inizio)}` : ''}`;
    let corpo = '';
    if (s.nome === 'Bash' || s.nome === 'PowerShell') {
      corpo += `<div class="codice-d"><div class="etichetta-d">Comando ${s.nome === 'PowerShell' ? 'PowerShell' : ''}
        <button class="link" data-d="copia" title="Copia il comando (così come lo vedi, segreti oscurati)">${icona('copia')} copia</button></div>
        <pre class="mono comando">${esc(s.dettaglio ?? '')}</pre></div>`;
    } else if (s.dettaglio && s.nome !== 'Agent') corpo += `<div class="etichetta-d">${s.nome === 'WebSearch' ? 'Ricerca' : 'Dove'}</div><pre class="mono percorso">${esc(s.dettaglio)}</pre>`;
    if (s.diff) corpo += this.diff(s);
    if (s.extra) corpo += `<div class="etichetta-d">${s.nome === 'AskUserQuestion' ? 'La domanda' : 'Il compito che ha ricevuto'}</div><pre class="testo-lungo">${esc(s.extra)}</pre>`;
    if (s.agentId && d.sottoAgenti.some((a) => a.id === s.agentId)) corpo += `<button class="pulsante-d" data-d-agente="${esc(s.agentId)}">${icona('agente')} Guarda cosa fa questo aiutante</button>`;

    // output
    if (s.background?.outputFile) {
      corpo += `<div class="etichetta-d">Output ${bgVivo ? '<span class="dal-vivo"><span class="pulsa"></span> in diretta</span>' : '(finito)'}</div>
        <pre class="mono output" id="output-diretta">${esc(this.output.testo || 'In attesa di output…')}</pre>`;
    } else if (inCorso && (s.nome === 'Bash' || s.nome === 'PowerShell')) {
      corpo += `<div class="nota-d">${icona('orologio')} L'output arriva quando il comando finisce (Claude Code lo scrive nel registro solo alla fine).</div>`;
    } else if (s.risultato && !s.diff) {
      corpo += `<div class="etichetta-d">${s.errore ? `<span class="segno errore">${icona('x')} Errore</span>` : 'Risultato'}</div><pre class="mono output ${s.errore ? 'errore' : ''}">${esc(s.risultato)}</pre>`;
    } else if (s.errore && s.risultato) {
      corpo += `<div class="etichetta-d"><span class="segno errore">${icona('x')} Errore</span></div><pre class="mono output errore">${esc(s.risultato)}</pre>`;
    }
    return `
      <div class="strumento-d ${s.errore ? 'con-errore' : ''}">
        <div class="testa-strumento"><span class="icona">${iconaNome(s.nome)}</span><span class="azione-d">${esc(s.azione)}</span></div>
        <div class="tenue piccolo">${esc(s.nome)} · ${tempo}${s.sensibile ? ` · ${icona('lucchetto')} file sensibile: valori nascosti` : ''}</div>
        ${corpo}
      </div>`;
  }

  private diff(s: Strumento) {
    const righe = (t: string, segno: string, cls: string, max: number) => {
      const r = t.split('\n'); const taglio = r.length > max;
      return r.slice(0, max).map((x) => `<div class="${cls}">${segno} ${esc(x)}</div>`).join('') + (taglio ? `<div class="tenue">… altre ${r.length - max} righe</div>` : '');
    };
    const { vecchio, nuovo, troncato } = s.diff!;
    return `<div class="etichetta-d">${s.nome === 'Write' ? 'Contenuto scritto' : 'Modifica'}${troncato ? ' (accorciata)' : ''}</div>
      <div class="mono diff">${vecchio ? righe(vecchio, '−', 'tolta', 25) : ''}${righe(nuovo, '+', 'aggiunta', s.nome === 'Write' ? 30 : 25)}</div>`;
  }

  private rigaCronologia(t: Strumento) {
    const inCorso = !t.fine && !t.background;
    const dur = inCorso ? '<span class="pulsa verde"></span>' : t.background && !t.background.finito ? `<span class="segno bg">${icona('orologio')}</span>` : t.fine && t.fine - t.inizio >= 1000 ? durata(t.fine - t.inizio) : '';
    return `<div class="riga-c ${t.id === this.selezionato ? 'scelta' : ''} ${t.errore ? 'errore' : ''}" data-d-strumento="${esc(t.id)}" title="${esc(t.dettaglio ?? t.azione)}">
      <span class="icona">${iconaNome(t.nome)}</span>
      <span class="azione-c">${esc(t.azione)}</span>
      ${t.errore ? `<span class="segno errore">${icona('x')}</span>` : ''}
      <span class="ora-c">${ora(t.inizio)}</span>
      <span class="dur-c">${dur}</span>
    </div>`;
  }

  private clic(e: MouseEvent) {
    if (!this.attivo) return;
    const t = e.target as HTMLElement;
    const agente = t.closest<HTMLElement>('[data-d-agente]')?.dataset.dAgente;
    if (agente) return this.apri(agente, true);
    const st = t.closest<HTMLElement>('[data-d-strumento]')?.dataset.dStrumento;
    if (st) {
      this.selezionato = st;
      this.segueUltimo = st === this.dati?.strumenti[this.dati.strumenti.length - 1]?.id;
      return this.ridisegnaTutto();
    }
    const az = t.closest<HTMLElement>('[data-d]')?.dataset.d;
    if (az === 'indietro') this.chiudi();
    else if (az === 'cartella' && this.id) window.torre.apri('cartella', this.id);
    else if (az === 'registro' && this.id) window.torre.apri('registro', this.id);
    else if (az === 'copia') {
      const c = this.strumento()?.dettaglio; if (!c) return;
      window.torre.copia(c);
      const b = t.closest<HTMLElement>('[data-d=copia]'); if (b) { b.innerHTML = `${icona('spunta')} copiato`; setTimeout(() => (b.innerHTML = `${icona('copia')} copia`), 1500); }
    } else if (az === 'segui') { this.segueUltimo = true; this.selezionato = this.dati?.strumenti[this.dati.strumenti.length - 1]?.id; this.ridisegnaTutto(); }
    else if (az === 'richiesta') { this.richiestaAperta = !this.richiestaAperta; this.ridisegnaTutto(); }
  }

  /** Dopo aver ridisegnato: riporta l'output in fondo e la cronologia dov'era. */
  dopo(scrollCronologia: number, outputInFondo: boolean) {
    const c = this.radice.querySelector<HTMLElement>('.corpo-d'); if (c) c.scrollTop = scrollCronologia;
    this.radice.querySelectorAll<HTMLElement>('pre.output').forEach((p) => { if (outputInFondo) p.scrollTop = p.scrollHeight; });
  }
}
