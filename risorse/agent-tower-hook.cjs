#!/usr/bin/env node
// AGENT TOWER — hook per Claude Code (opzionale).
// Claude Code lo lancia a ogni evento (in background, "async": non rallenta mai Claude).
// Legge il JSON dell'evento da stdin, tiene SOLO i campi che servono a capire lo stato
// e li manda all'app AGENT TOWER sul tuo PC (127.0.0.1). Non manda niente altrove.
// Se l'app è spenta non succede niente: esce subito, sempre con codice 0, senza scrivere nulla.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const esci = () => process.exit(0);
setTimeout(esci, 3000).unref(); // in ogni caso, dopo 3 s se ne va

let dati = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { dati += c; if (dati.length > 4 * 1024 * 1024) esci(); });
process.stdin.on('error', esci);
process.stdin.on('end', () => {
  try {
    const conf = JSON.parse(fs.readFileSync(path.join(__dirname, 'connessione.json'), 'utf8'));
    const e = JSON.parse(dati);
    const corto = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    const ti = e.tool_input && typeof e.tool_input === 'object' ? e.tool_input : {};
    // niente prompt, risposte, contenuti dei file o output: solo chi, cosa e quando
    const minimo = {
      hook_event_name: e.hook_event_name, session_id: e.session_id, agent_id: e.agent_id, agent_type: e.agent_type,
      transcript_path: e.transcript_path, cwd: e.cwd, tool_name: e.tool_name, tool_use_id: e.tool_use_id,
      notification_type: e.notification_type, message: corto(e.message, 300),
      tool_input: { command: corto(ti.command, 500), file_path: corto(ti.file_path, 500), path: corto(ti.path, 500), url: corto(ti.url, 500), pattern: corto(ti.pattern, 200) },
    };
    const corpo = JSON.stringify(minimo);
    const req = http.request({
      host: '127.0.0.1', port: conf.porta, path: '/evento', method: 'POST', timeout: 1500,
      headers: { 'content-type': 'application/json', 'x-agent-tower': conf.token, 'content-length': Buffer.byteLength(corpo) },
    }, (r) => { r.resume(); r.on('end', esci); });
    req.on('error', esci);
    req.on('timeout', () => { req.destroy(); esci(); });
    req.end(corpo);
  } catch { esci(); }
});
