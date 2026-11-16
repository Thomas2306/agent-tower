/**
 * La lista di AGENT TOWER in versione testo, usando il motore vero (src/core).
 *   npx tsx scripts/torre-testo.ts            # si aggiorna da sola, Ctrl+C per uscire
 *   npx tsx scripts/torre-testo.ts --una-volta
 *   npx tsx scripts/torre-testo.ts --ore 6    # mostra le sessioni delle ultime 6 ore (default 24)
 */
import { Motore, Sessione } from '../src/core';

const args = process.argv.slice(2);
const val = (n: string, d: number) => { const i = args.indexOf('--' + n); return i >= 0 ? Number(args[i + 1]) : d; };
const unaVolta = args.includes('--una-volta');

const c = (n: string) => (s: string) => `\x1b[${n}m${s}\x1b[0m`;
const grigio = c('90'), grassetto = c('1'), viola = c('35');
const COLORE: Record<string, (s: string) => string> = { aspetta: c('41;97'), lavora: c('42;30'), finito: c('44;97'), inattivo: c('100;97') };
const ETICHETTA: Record<string, string> = { aspetta: ' ASPETTA TE ', lavora: '   LAVORA   ', finito: '   FINITO   ', inattivo: '  INATTIVO  ' };

const durata = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`; if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}g`;
};
const taglia = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function riga(s: Sessione, rientro = '') {
  const sotto = s.padreId ? viola('↳ ' + (s.tipoAgente ?? 'agente') + ' ') : '';
  const stima = s.stimato && s.stato === 'aspetta' ? grigio(' (stima)') : '';
  const extra = [s.contatori.errori ? `\x1b[31m✗${s.contatori.errori}\x1b[0m` : '', s.contatori.inBackground ? viola(`⏱${s.contatori.inBackground}`) : ''].filter(Boolean).join(' ');
  return [
    `${rientro}${COLORE[s.stato](ETICHETTA[s.stato])} ${sotto}${grassetto(taglia(s.titolo, 48))} ${grigio('· ' + s.progetto + (s.ramo ? ` (${s.ramo})` : ''))} ${grigio(durata(Date.now() - s.daQuando))}${stima}`,
    `${rientro}             ${taglia(s.ultimaAzione, 90)} ${grigio(`· ${s.contatori.strumenti} strumenti`)} ${extra}`,
  ].join('\n');
}

function disegna(lista: Sessione[]) {
  const n = (st: string) => lista.filter((s) => s.stato === st).length;
  const out = [grassetto(`AGENT TOWER — ${lista.length} sessioni · `) + COLORE.aspetta(` ${n('aspetta')} aspetta te `) + ' ' + COLORE.lavora(` ${n('lavora')} lavora `)
    + grigio(`   ${new Date().toLocaleTimeString('it-IT')}`), ''];
  for (const s of lista) {
    out.push(riga(s));
    const attivi = s.sottoAgenti.filter((a) => a.stato !== 'finito' && a.stato !== 'inattivo');
    for (const a of attivi.slice(0, 5)) out.push(riga(a, '    '));
    const finiti = s.sottoAgenti.length - attivi.length;
    if (finiti) out.push(grigio(`                 + ${finiti} sotto-agenti finiti`));
    out.push('');
  }
  return out.join('\n');
}

const t0 = performance.now();
const motore = new Motore({ nascondiDopoOre: val('ore', 24) });
if (unaVolta) {
  motore.scopri();
  const lista = motore.istantanea();
  console.log(disegna(lista));
  const st = motore.statistiche();
  console.log(grigio(`letti ${st.file} registri, ${st.righe} righe (${st.rotte} illeggibili) in ${(performance.now() - t0).toFixed(0)} ms`));
} else {
  motore.on('sessioni', (l: Sessione[]) => { process.stdout.write('\x1b[2J\x1b[H' + disegna(l) + '\n'); });
  motore.on('errore', (e) => console.error('errore:', e));
  motore.avvia();
  setInterval(() => process.stdout.write('\x1b[2J\x1b[H' + disegna(motore.istantanea()) + '\n'), 5000); // aggiorna i "da quanto"
}
