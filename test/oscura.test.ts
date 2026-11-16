import { describe, expect, it } from 'vitest';
import { anonimizza, eSensibile, oscura, oscuraEnv, PUNTINI, suOgniStringa } from '../src/core/oscura';

// Chiavi FINTE: hanno la forma giusta ma non valgono niente.
const FINTE = {
  anthropic: 'sk-ant-api03-FINTAfintaFINTAfinta1234567890abcdefABCDEF',
  openai: 'sk-proj-FINTAfintaFINTAfinta1234567890',
  github: 'ghp_FINTAfintaFINTAfinta1234567890ab',
  meta: 'EAAFINTAfintaFINTAfinta1234567890ZZ',
  google: 'AIzaSyFINTAfintaFINTAfinta123456789',
  stripe: 'sk_live_FINTAfintaFINTA1234',
  slack: 'xoxb-1234567890-FINTAfinta',
  aws: 'AKIAFINTAFINTA123456',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaW50byJ9.FINTAfintaFINTAfirma',
  hf: 'hf_FINTAfintaFINTAfinta123456',
};

describe('oscura i segreti', () => {
  for (const [nome, chiave] of Object.entries(FINTE)) {
    it(`nasconde la chiave ${nome}`, () => {
      const t = `prima ${chiave} dopo`;
      const r = oscura(t);
      expect(r).not.toContain(chiave);
      expect(r).toContain(PUNTINI);
      expect(r.startsWith('prima ') && r.endsWith(' dopo')).toBe(true);
    });
  }

  it('assegnazioni stile .env, shell, JSON e YAML', () => {
    const r = oscura([
      'OPENAI_API_KEY=abc123segreto', 'export GITHUB_TOKEN="tok_segreto_42"', '"apiKey": "valoresegreto"', 'db_password: hunter2hunter',
      'SUPABASE_SERVICE_ROLE_KEY=qwertyuiop', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    ].join('\n'));
    for (const s of ['abc123segreto', 'tok_segreto_42', 'valoresegreto', 'hunter2hunter', 'qwertyuiop', 'abcdefghijklmnopqrstuvwxyz']) expect(r).not.toContain(s);
    expect(r).toContain('OPENAI_API_KEY=' + PUNTINI);
  });

  it('URL con credenziali o token nei parametri, opzioni da riga di comando', () => {
    const r = oscura('git clone https://mario:passwordsegreta@github.com/x.git && curl "https://api.x.com/v1?token=tokensegreto123&q=ok" && mysql --password supersegreta');
    expect(r).not.toMatch(/passwordsegreta|tokensegreto123|supersegreta/);
    expect(r).toContain('q=ok');
  });

  it('blocchi di chiavi private', () => {
    expect(oscura('-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----')).not.toContain('MIIEow');
  });

  it('NON tocca le cose normali', () => {
    const normali = ['npm run build', 'git commit -m "fix login"', 'const key = process.env.API_KEY', 'API_KEY=${API_KEY}', 'tokens: 1500', 'sk-1 è corto', 'PASSWORD=true'];
    for (const n of normali) expect(oscura(n)).toBe(n);
  });

  it('è idempotente', () => {
    const una = oscura(`k=${FINTE.github} OPENAI_API_KEY=xyzxyzxyz`);
    expect(oscura(una)).toBe(una);
  });
});

describe('file .env', () => {
  it('riconosce i comandi e i file sensibili', () => {
    expect(eSensibile('C:\\progetto\\.env')).toBe(true);
    expect(eSensibile('C:\\progetto\\.env.local')).toBe(true);
    expect(eSensibile('cat .env | grep URL')).toBe(true);
    expect(eSensibile('C:\\progetto\\environment.ts')).toBe(false);
    expect(eSensibile('npm run dev')).toBe(false);
  });
  it('nasconde OGNI valore, anche con nomi innocui', () => {
    const r = oscuraEnv('DATABASE_URL=postgres://u:p@h/db\nPORT=3000\n# commento\nVUOTO=');
    expect(r).toBe(`DATABASE_URL=${PUNTINI}\nPORT=${PUNTINI}\n# commento\nVUOTO=`);
  });
});

describe('modalità registrazione', () => {
  const o = { home: 'C:\\Users\\thoma', utente: 'thoma' };
  it('nasconde la cartella utente in tutte le forme, il nome e le email', () => {
    const r = anonimizza('C:\\Users\\thoma\\dev C:/Users/thoma/x /c/Users/thoma/y C--Users-thoma-progetto mario.rossi@gmail.com ciao thoma', o);
    expect(r).not.toMatch(/thoma|gmail|mario/i);
    expect(r).toContain('C:\\Users\\utente\\dev');
    expect(r).toContain('/c/Users/utente/y');
  });
  it('suOgniStringa copia in profondità senza toccare numeri e booleani', () => {
    const x = { a: 'OPENAI_API_KEY=segretissimo', b: [1, true, { c: FINTE.github }], d: null };
    const y = suOgniStringa(x, oscura);
    expect(JSON.stringify(y)).not.toMatch(/segretissimo|ghp_FINTA/);
    expect(y.b[0]).toBe(1); expect(y.b[1]).toBe(true); expect(y.d).toBeNull();
    expect(x.a).toBe('OPENAI_API_KEY=segretissimo'); // l'originale non cambia
  });
});
