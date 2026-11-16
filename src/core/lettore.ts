import fs from 'node:fs';

/**
 * Lettore incrementale di un file "solo in coda" (JSONL o .output).
 * Tiene l'offset e legge solo i byte nuovi, a blocchi, senza mai ricaricare tutto il file.
 * Gestisce le righe a metà (le tiene da parte fino al prossimo giro) e i caratteri UTF-8 spezzati.
 */
export class LettoreCoda {
  offset = 0;
  private resto = '';
  private decoder = new TextDecoder('utf-8');

  constructor(public readonly file: string, private bloccoByte = 4 * 1024 * 1024) {}

  /** Salta al fondo: legge solo da adesso in poi. */
  saltaAllaFine(daTenere = 0) {
    try { this.offset = Math.max(0, fs.statSync(this.file).size - daTenere); } catch { this.offset = 0; }
    this.resto = '';
    this.decoder = new TextDecoder('utf-8');
  }

  /** Legge le righe complete nuove. Ritorna [] se non c'è niente (o il file non esiste). */
  leggiRighe(): string[] {
    let dim: number;
    try { dim = fs.statSync(this.file).size; } catch { return []; }
    if (dim < this.offset) { this.offset = 0; this.resto = ''; this.decoder = new TextDecoder('utf-8'); } // troncato/riscritto
    if (dim === this.offset) return [];
    const righe: string[] = [];
    let fd: number;
    try { fd = fs.openSync(this.file, 'r'); } catch { return []; }
    try {
      const buf = Buffer.allocUnsafe(Math.min(this.bloccoByte, dim - this.offset));
      while (this.offset < dim) {
        const n = fs.readSync(fd, buf, 0, Math.min(buf.length, dim - this.offset), this.offset);
        if (n <= 0) break;
        this.offset += n;
        const testo = this.resto + this.decoder.decode(buf.subarray(0, n), { stream: true });
        const pezzi = testo.split('\n');
        this.resto = pezzi.pop() ?? '';
        for (const p of pezzi) if (p.trim()) righe.push(p.endsWith('\r') ? p.slice(0, -1) : p);
      }
    } finally { fs.closeSync(fd); }
    return righe;
  }

  /** Per i .output: il testo nuovo, anche se l'ultima riga non è ancora finita. */
  leggiTesto(maxByte = 256 * 1024): string {
    let dim: number;
    try { dim = fs.statSync(this.file).size; } catch { return ''; }
    if (dim < this.offset) this.offset = 0;
    if (dim === this.offset) return '';
    if (dim - this.offset > maxByte) this.offset = dim - maxByte; // troppo indietro: tieni la coda
    const fd = fs.openSync(this.file, 'r');
    try {
      const buf = Buffer.allocUnsafe(dim - this.offset);
      const n = fs.readSync(fd, buf, 0, buf.length, this.offset);
      this.offset += n;
      return this.decoder.decode(buf.subarray(0, n), { stream: true });
    } finally { fs.closeSync(fd); }
  }
}
