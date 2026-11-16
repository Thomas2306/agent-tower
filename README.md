# AGENT TOWER

Una piccola torre di controllo sempre in primo piano che mostra **tutti gli agenti Claude Code accesi sul PC**: chi lavora, chi ha finito e chi **aspetta una tua risposta**.

*An always-on-top overlay that shows every Claude Code agent running on your computer — who is working, who is done, and who is waiting for you. Windows, macOS, Linux. MIT.*

## Cosa fa
- Una scheda per ogni sessione (CLI e app desktop), con i sotto-agenti sotto.
- Colori: 🟢 lavora · 🔴 aspetta te · 🔵 finito · ⚪ inattivo.
- Ultima azione in parole semplici ("Esegue: avvia i test", "Modifica app.ts").
- Icona nel tray / barra dei menu che cambia colore con lo stato più urgente.
- Modalità **Fantasma** (trasparente, il mouse ci passa attraverso) e **pillola** compatta.
- **Modalità registrazione**: nasconde nome utente e percorsi, per girare video.
- Chiaro / scuro / come il sistema.
- La finestra non compare nelle condivisioni schermo (Windows; su macOS con molte app).
- Hook opzionali di Claude Code per sapere *subito* quando un agente chiede un permesso: si installano solo dopo la tua conferma, con backup di `settings.json`.

Legge solo i file in `~/.claude` (sola lettura). Niente rete, niente account: lo hook parla solo con `127.0.0.1`.

## Scorciatoie
| | |
|---|---|
| `Ctrl+Alt+A` | mostra / nascondi |
| `Ctrl+Alt+F` | Fantasma sì / no |

## Scaricare
I pacchetti sono nella pagina **Actions → pacchetti** (o nelle Release):
- **Windows**: `agent-tower-…-win-x64.exe`
- **macOS**: `agent-tower-…-mac-arm64.dmg` (Apple Silicon) o `…-mac-x64.dmg` (Intel). Non firmato: la prima volta clic destro → Apri.
- **Linux**: `…-linux-x86_64.AppImage` o `.deb`

macOS e Linux sono **da provare**: segnala pure i problemi nelle Issues.

## Sviluppo
```bash
npm install
npm run dev        # app in sviluppo
npm test           # test (Vitest)
npm run pacchetto  # pacchetto per il sistema su cui sei
```

## Licenza
MIT
