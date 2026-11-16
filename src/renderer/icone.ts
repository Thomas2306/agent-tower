/**
 * Icone di AGENT TOWER: SVG disegnati a mano, tratto unico e arrotondato, colore = currentColor.
 * Niente emoji (cambiano aspetto da un PC all'altro e non seguono il tema).
 */
const P: Record<string, string> = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  meno: '<path d="M6 12h12"/>',
  indietro: '<path d="M15 5l-7 7 7 7"/>',
  freccia: '<path d="M9 6l6 6-6 6"/>',
  giu: '<path d="M6 9l6 6 6-6"/>',
  cartella: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  file: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1-1.5z"/><path d="M14 3.5V8h4M9 12.5h6M9 16h6"/>',
  copia: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  spunta: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  terminale: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
  matita: '<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 0 1 2.9 0l.1.1a2 2 0 0 1 0 2.9L8.5 18.5z"/><path d="M13.5 7.5l3 3"/>',
  documento: '<path d="M4 6.5c2.5-1.3 5.5-1.3 8 .5 2.5-1.8 5.5-1.8 8-.5v12c-2.5-1.3-5.5-1.3-8 .5-2.5-1.8-5.5-1.8-8-.5z"/><path d="M12 7v12"/>',
  lente: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  globo: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  agente: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 13v1M14.5 13v1"/><circle cx="12" cy="4" r="1"/>',
  domanda: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.8v.2"/>',
  lucchetto: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v1.5"/>',
  orologio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  avviso: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17v.2"/>',
  messaggio: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3.5v-3.5h0a2 2 0 0 1-2-2z"/>',
  pensa: '<circle cx="7" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="17" cy="12" r="1.2"/>',
  piano: '<path d="M9 7h10M9 12h10M9 17h10"/><path d="M4.5 7l1 1 1.5-2M4.5 12l1 1 1.5-2M4.8 17h1.5"/>',
  presa: '<path d="M9 4.5v4M15 4.5v4M7 8.5h10v3a5 5 0 0 1-10 0zM12 16.5v3"/>',
  ingranaggio: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6"/>',
  mirino: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  registra: '<rect x="3" y="6.5" width="13" height="11" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3"/>',
  campanella: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  sole: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  luna: '<path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z"/>',
  persona: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5a7 7 0 0 1 14 0"/>',
  scintille: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"/>',
  torre: '<path d="M7 20.5V9h10v11.5M5 20.5h14M7 9V5h2v2h2V5h2v2h2V5h2v4M10.5 20.5v-4a1.5 1.5 0 0 1 3 0v4"/>',
  ramo: '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="8" r="2"/><path d="M7 8v8M17 10c0 4-10 2-10 6"/>',
  fantasma: '<path d="M5.5 20V11a6.5 6.5 0 0 1 13 0v9l-2.2-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6z"/><path d="M9.8 11v.5M14.2 11v.5"/>',
  'presa-trascina': '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
  occhio: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  occhioNo: '<path d="M4 4l16 16M9.9 6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M14.1 14.2A3 3 0 0 1 9.8 9.9M6.3 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 4-.9"/>',
};

/** <svg> pronto da mettere nell'HTML. */
export function icona(nome: keyof typeof P | string, classe = ''): string {
  return `<svg class="ico ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nome] ?? P.ingranaggio}</svg>`;
}
