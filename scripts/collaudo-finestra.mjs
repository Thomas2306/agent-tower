// Collaudo della finestra tramite il canale di debug di Chromium (l'app va avviata con --remote-debugging-port=9333).
// Uso: node scripts/collaudo-finestra.mjs "<espressione JS da valutare nella finestra>"
globalThis.__fs = await import('node:fs');
const porta = process.env.PORTA ?? 9333;
const pagine = await (await fetch(`http://127.0.0.1:${porta}/json`)).json();
const p = pagine.find((x) => x.type === 'page');
if (!p) throw new Error('finestra non trovata');
const ws = new WebSocket(p.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
// METODO=Emulation.setEmulatedMedia PARAMETRI='{"features":[...]}' node scripts/collaudo-finestra.mjs  → comando CDP diretto
const msg = process.env.METODO
  ? { id: 1, method: process.env.METODO, params: JSON.parse(process.env.PARAMETRI ?? '{}') }
  : { id: 1, method: 'Runtime.evaluate', params: { expression: espressione(process.argv[2]), awaitPromise: true, returnByValue: true } };
// "@file.js" → legge l'espressione da un file (PowerShell toglie le virgolette interne agli argomenti)
function espressione(a) { return a?.startsWith('@') ? (await_fs()).readFileSync(a.slice(1), 'utf8') : a; }
function await_fs() { return globalThis.__fs; }
ws.send(JSON.stringify(msg));
const risp = await new Promise((r) => ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) r(m); }));
console.log(JSON.stringify(risp.result?.result?.value ?? risp.result?.exceptionDetails ?? risp, null, 1));
// FOTO=percorso.png: dopo il comando salva la foto della finestra (anche se sta su un altro monitor)
if (process.env.FOTO) {
  ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png', captureBeyondViewport: false } }));
  const f = await new Promise((r) => ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 2) r(m); }));
  globalThis.__fs.writeFileSync(process.env.FOTO, Buffer.from(f.result.data, 'base64'));
  console.log('foto:', process.env.FOTO);
}
// TIENI_MS: resta collegato (le emulazioni CDP valgono solo finché la sessione è aperta)
if (process.env.TIENI_MS) await new Promise((r) => setTimeout(r, Number(process.env.TIENI_MS)));
ws.close();
