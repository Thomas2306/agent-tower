/** Misura la CPU usata dal motore acceso sulle sessioni vere.  npx tsx scripts/misura-cpu.ts --secondi 60 */
import os from 'node:os';
import { Motore } from '../src/core';

const i = process.argv.indexOf('--secondi');
const SECONDI = i >= 0 ? Number(process.argv[i + 1]) : 60;
const t0 = performance.now();
const m = new Motore();
let eventi = 0;
m.on('sessioni', () => eventi++);
m.avvia();
const carico = performance.now() - t0;
const c0 = process.cpuUsage(); const w0 = performance.now();
setTimeout(() => {
  const c = process.cpuUsage(c0); const w = performance.now() - w0;
  const pct = ((c.user + c.system) / 1000 / w) * 100;
  const st = m.statistiche();
  console.log(`prima lettura: ${carico.toFixed(0)} ms (${st.file} registri, ${st.righe} righe, ${st.rotte} illeggibili)`);
  console.log(`CPU nei ${SECONDI}s successivi: ${pct.toFixed(2)}% di un core (${(pct / os.cpus().length).toFixed(2)}% del PC), ${eventi} aggiornamenti emessi`);
  console.log(`memoria: ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
  m.ferma();
}, SECONDI * 1000);
