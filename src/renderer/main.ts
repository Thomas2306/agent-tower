import type { Sessione, Stato } from '../core/tipi';
import { chip, COLORE, Config, durata, esc, icona, iconaStrumento, impostaSistema, PUO, T, tasti, tipoAgente } from './comuni';
import { mascotte } from './mascotte';
import { Vista } from './dettaglio';

const app = document.getElementById('app')!;
let sessioni: Sessione[] = [];
let config: Config = { modo: 'lista', mostraInattive: false, aperte: [] };
let caricato = false;
const vista = new Vista(app, () => disegna());

function frase(s: Sessione) {
  if (s.stato === 'inattivo' || (s.stato === 'finito' && s.motivo === 'fine-turno')) return s.ultimoTesto ? `Ha finito: ${s.ultimoTesto}` : 'Ha finito';
  return s.ultimaAzione;
}

function scheda(s: Sessione): string {
  const aperta = config.aperte.includes(s.id);
  const sotto = s.sottoAgenti;
  const attivi = sotto.filter((a) => a.stato === 'lavora' || a.stato === 'aspetta');
  const segni = [
    s.contatori.errori ? `<span class="segno errore" title="${s.contatori.errori} ${s.contatori.errori === 1 ? 'strumento finito' : 'strumenti finiti'} con un errore">${icona('x')}${s.contatori.errori}</span>` : '',
    s.contatori.inBackground ? `<span class="segno bg" title="${s.contatori.inBackground} ${s.contatori.inBackground === 1 ? 'lavoro' : 'lavori'} in background">${icona('orologio')}${s.contatori.inBackground}</span>` : '',
  ].join('');
  const blocco = sotto.length ? `
    <div class="${aperta ? 'aperta' : ''}">
      <div class="sotto-testa" data-apri="${esc(s.id)}">
        <span class="freccia">${icona('freccia')}</span>
        <span>${attivi.length ? `${attivi.length} ${attivi.length === 1 ? 'aiutante al lavoro' : 'aiutanti al lavoro'}` : `${sotto.length} ${sotto.length === 1 ? 'aiutante' : 'aiutanti'}`}</span>
        <span class="pallini">${sotto.slice(0, 8).map((a) => `<span class="pallino" style="--c:${COLORE[a.stato]}"></span>`).join('')}</span>
      </div>
      <div class="sotto">${sotto.slice(0, 12).map((a) => `
        <div class="agente ${a.stato}" data-agente="${esc(a.id)}" title="Clic per vedere cosa fa">
          ${mascotte(a.id, a.stato, 'piccola')}
          <div class="agente-testo">
            <div class="agente-r1"><span class="tipo">${esc(tipoAgente(a.tipoAgente))}</span><span class="nome">${esc(a.titolo)}</span></div>
            <div class="cosa">${a.stato === 'finito' ? `${icona('spunta')} Ha finito` : `${iconaStrumento(a)} ${esc(a.ultimaAzione)}`}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>` : '';
  return `
  <div class="scheda ${s.stato}" data-id="${esc(s.id)}">
    ${mascotte(s.id, s.stato)}
    <div class="corpo-s">
    <div class="riga1">
      <span class="titolo" title="${esc(s.primoPrompt ?? s.titolo)}">${esc(s.titolo)}</span>
      <span class="tempo" data-da="${s.daQuando}"></span>
    </div>
    <div class="riga2">
      <span class="progetto" title="${esc(s.cwdProgetto ?? '')}">${esc(s.progetto)}</span>
      ${s.ramo ? `<span class="ramo">${icona('ramo')}${esc(s.ramo)}</span>` : ''}
    </div>
    <div class="azione">
      ${chip(s)}
      <span class="icona">${iconaStrumento(s)}</span>
      <span class="testo" title="${esc(frase(s))}">${esc(frase(s))}</span>
      <span class="segni">${segni}</span>
    </div>
    ${blocco}
    </div>
  </div>`;
}

// ---------- viste ----------
function disegnaLista() {
  const visibili = sessioni.filter((s) => s.stato !== 'inattivo');
  const inattive = sessioni.filter((s) => s.stato === 'inattivo');
  const aspettano = visibili.filter((s) => s.stato === 'aspetta').length;
  const lavorano = visibili.filter((s) => s.stato === 'lavora').length;
  const mostrate = config.mostraInattive ? sessioni : visibili;
  const scroll = app.querySelector('.lista')?.scrollTop ?? 0;
  app.innerHTML = `
  <div class="pannello">
    <div class="testa">
      <span class="logo">${icona('torre')} AGENT TOWER</span>
      <span class="riassunto">
        ${aspettano ? `<span class="conta aspetta" title="Agenti che aspettano te">${icona('campanella')} ${aspettano}</span>` : ''}
        ${lavorano ? `<span class="conta lavora" title="Agenti al lavoro"><span class="pulsa"></span> ${lavorano}</span>` : ''}
      </span>
      ${bottoniTesta()}
    </div>
    <div class="lista">
      ${mostrate.length ? mostrate.map(scheda).join('') : `
        <div class="vuoto"><div class="grande">${icona('torre')}</div>${caricato ? 'Nessun agente al lavoro.<br>Avvia Claude Code e lo vedrai qui.' : 'Cerco le sessioni…'}</div>`}
    </div>
    ${inattive.length ? `<div class="piede" data-azione="inattive">${config.mostraInattive ? `${icona('giu')} Nascondi le inattive` : `${icona('freccia')} ${inattive.length} ${inattive.length === 1 ? 'sessione inattiva' : 'sessioni inattive'}`}</div>` : ''}
  </div>`;
  const l = app.querySelector('.lista'); if (l) l.scrollTop = scroll;
}

/** Pulsanti della testata, uguali in lista e dettaglio. La X grande a destra, come quella delle finestre. */
const mediaScuro = window.matchMedia('(prefers-color-scheme: dark)');
const scuro = () => mediaScuro.matches;
mediaScuro.addEventListener('change', () => disegna());

export function bottoniTesta(): string {
  const hook = config.hook === 'attivi';
  return `
      <button class="bottone ${hook ? 'spia-verde' : ''}" data-azione="hook" title="${hook
        ? 'Stato preciso ACCESO (non vuol dire che qualcuno lavora): Claude Code avvisa l’app quando ti chiede un permesso, così “Aspetta te” è sicuro. Clic per spegnerlo.'
        : 'Stato preciso spento: “Aspetta te” per i permessi è solo una stima. Clic per accenderlo (chiede conferma).'}">${icona('mirino')}</button>
      <button class="bottone ${config.registrazione ? 'acceso' : ''}" data-azione="registrazione" title="Modalità registrazione: ${config.registrazione ? 'ATTIVA' : 'spenta'}. Nasconde cartelle personali, nome utente ed email, e rende la finestra visibile nei video.">${icona(config.registrazione ? 'occhioNo' : 'registra')}</button>
      <button class="bottone ${config.fantasma ? 'acceso blu' : ''}" data-azione="fantasma" title="Fantasma: ${config.fantasma ? 'ATTIVO' : 'spento'}. La finestra diventa trasparente e i clic passano alle finestre sotto. ${PUO().mouseAttraversoFantasma ? `Per usarla: tieni premuto ${T().ctrl} e passa sopra col mouse.` : `Per riprenderla: ${tasti('Control+Alt+F')}.`} Accendi/spegni anche con ${tasti('Control+Alt+F')}.">${icona('fantasma')}</button>
      <button class="bottone" data-azione="tema" title="${scuro() ? 'Passa ai colori chiari' : 'Passa ai colori scuri'}${(config.tema ?? 'sistema') === 'sistema' ? ` (ora segue ${T().sistema})` : ''}. Per tornare a seguire ${T().sistema}: ${T().menuIcona} → Colori.">${icona(scuro() ? 'sole' : 'luna')}</button>
      <button class="bottone" data-azione="pillola" title="Riduci a striscia (solo i personaggini, occupa pochissimo)">${icona('meno')}</button>
      <button class="chiudi" data-azione="nascondi" title="Chiudi la finestra. AGENT TOWER resta accesa ${T().doveIcona}: la riapri con ${tasti('Control+Alt+A')} o dal menu dell’icona.">${icona('x')}</button>`;
}

/** Striscia: una riga sottile con un personaggino per ogni agente attivo. Clic su uno → il suo dettaglio. */
function disegnaStriscia() {
  const visibili = sessioni.filter((s) => s.stato !== 'inattivo');
  const aspettano = visibili.filter((s) => s.stato === 'aspetta').length;
  const MAX = 9;
  app.innerHTML = `
  <div class="striscia">
    <span class="presa" title="Trascina per spostare">${icona('presa-trascina')}</span>
    ${visibili.length ? visibili.slice(0, MAX).map((s) => `
      <button class="omino ${s.stato}" data-omino="${esc(s.id)}" title="${esc(s.titolo)} — ${esc(s.stato === 'aspetta' ? 'aspetta te: ' : '')}${esc(s.ultimaAzione)}">
        ${mascotte(s.id, s.stato, 'piccola')}${s.stato === 'aspetta' ? '<span class="bollino"></span>' : ''}
      </button>`).join('') : `<span class="tenue piccolo">Nessun agente</span>`}
    ${visibili.length > MAX ? `<span class="tenue piccolo">+${visibili.length - MAX}</span>` : ''}
    ${aspettano ? `<span class="conta aspetta" title="Agenti che aspettano te">${icona('campanella')} ${aspettano}</span>` : ''}
    <button class="bottone" data-azione="lista" title="Apri la lista">${icona('giu')}</button>
  </div>`;
}

function disegna() {
  if (config.modo === 'pillola') disegnaStriscia();
  else if (vista.attivo) {
    const c = app.querySelector<HTMLElement>('.corpo-d');
    const o = app.querySelector<HTMLElement>('pre.output');
    const scroll = c?.scrollTop ?? 0;
    const inFondo = !o || o.scrollHeight - o.scrollTop - o.clientHeight < 30;
    app.innerHTML = vista.disegna();
    vista.dopo(scroll, inFondo);
  } else disegnaLista();
  aggiornaTempi();
  misura();
}

/** Dice al processo principale quanto deve essere grande la finestra (altezza naturale, senza tagli). */
let ultimaMisura = { w: 0, h: 0 };
function misura() {
  requestAnimationFrame(() => {
    const radice = app.firstElementChild as HTMLElement | null; if (!radice) return;
    let h = radice.getBoundingClientRect().height;
    // altezza "naturale": quanto servirebbe senza barre di scorrimento (poi il processo principale la limita)
    const scorre = app.querySelector('.lista, .corpo-d') as HTMLElement | null;
    if (scorre) h += scorre.scrollHeight - scorre.clientHeight;
    const w = Math.ceil(radice.getBoundingClientRect().width) + 20; h = Math.ceil(h) + 20;
    // tolleranza di 2 px: con lo schermo in scala (125%, 150%) le misure arrotondate oscillano di 1 px
    // e la finestra si ridimensionava all'infinito (il "tremolio" aprendo le inattive)
    if (w === ultimaMisura.w && Math.abs(h - ultimaMisura.h) <= 2) return;
    ultimaMisura = { w, h };
    window.torre.dimensione(w, h);
  });
}

function aggiornaTempi() {
  const ora = Date.now();
  app.querySelectorAll<HTMLElement>('[data-da]').forEach((e) => { e.textContent = durata(ora - Number(e.dataset.da)); });
}

// ---------- clic ----------
app.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const apri = t.closest<HTMLElement>('[data-apri]');
  if (apri) {
    const id = apri.dataset.apri!;
    config.aperte = config.aperte.includes(id) ? config.aperte.filter((x) => x !== id) : [...config.aperte, id];
    window.torre.imposta('aperte', config.aperte);
    return disegna();
  }
  const az = t.closest<HTMLElement>('[data-azione]')?.dataset.azione;
  if (!az && !vista.attivo && config.modo === 'lista') {
    // clic su un sotto-agente o su una scheda → dettaglio
    const agente = t.closest<HTMLElement>('[data-agente]')?.dataset.agente;
    if (agente) return vista.apri(agente);
    const scheda = t.closest<HTMLElement>('.scheda')?.dataset.id;
    if (scheda) return vista.apri(scheda);
  }
  const omino = t.closest<HTMLElement>('[data-omino]')?.dataset.omino;
  if (omino) { window.torre.modo('lista'); return vista.apri(omino); }
  if (az === 'fantasma') { window.torre.fantasma(!config.fantasma); }
  else if (az === 'tema') window.torre.tema(scuro() ? 'chiaro' : 'scuro');
  else if (az === 'registrazione') { config.registrazione = !config.registrazione; window.torre.imposta('registrazione', config.registrazione); disegna(); }
  else if (az === 'pillola') window.torre.modo('pillola');
  else if (az === 'lista') window.torre.modo('lista');
  else if (az === 'nascondi') window.torre.nascondi();
  else if (az === 'hook') window.torre.hook();
  else if (az === 'inattive') { config.mostraInattive = !config.mostraInattive; window.torre.imposta('mostraInattive', config.mostraInattive); disegna(); }
});

window.torre.suSessioni((l) => { sessioni = l; caricato = true; disegna(); });
window.torre.suConfig((c) => {
  config = c; impostaSistema(c.sistema);
  document.body.classList.toggle('fantasma', !!c.fantasma);
  // Linux: la trasparenza della finestra la facciamo noi (il sistema non la supporta)
  document.body.classList.toggle('opacita-css', !PUO().opacitaFinestra);
  disegna();
});
// un solo timer: ogni ½ s cambia il passo dei personaggini (solo se qualcuno lavora o aspetta),
// ogni secondo aggiorna i "da quanto" e fa il battito dei pallini. Niente animazioni CSS continue.
let mezzi = 0;
setInterval(() => {
  if (document.hidden) return;
  mezzi++;
  if (app.querySelector('.masc.lavora, .masc.aspetta')) document.body.classList.toggle('passo');
  if (mezzi % 2 === 0) { aggiornaTempi(); document.body.classList.toggle('tic'); }
}, 500);
new ResizeObserver(() => misura()).observe(app);
// modalità fantasma: la finestra lascia passare i clic; con Ctrl + mouse sopra torna usabile finché il mouse resta sopra
let interagisco = false;
document.addEventListener('mousemove', (e) => {
  if (!config.fantasma) return;
  if (e.ctrlKey && !interagisco) { interagisco = true; document.body.classList.add('interagisco'); window.torre.interagisci(true); }
});
document.addEventListener('mouseleave', () => {
  if (!interagisco) return;
  interagisco = false; document.body.classList.remove('interagisco'); window.torre.interagisci(false);
});
window.torre.pronto();
disegna();
