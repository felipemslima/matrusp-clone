// Script de enriquecimento: adiciona campo `creditos` a cada disciplina no JSON existente.
// Uso: node scraper/check_credits.mjs   (rename depois para add-credits.mjs)
import axios from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE   = 'https://uspdigital.usp.br/jupiterweb';
const DIR    = dirname(fileURLToPath(import.meta.url));
const IN     = join(DIR, 'output', 'disciplinas.json');
const OUT    = join(DIR, 'output', 'disciplinas.json');
const PUBLIC = join(DIR, '..', 'public', 'data', 'disciplinas.json');

async function fetchCreditos(sgldis) {
  try {
    const { data: raw } = await axios.get(
      `${BASE}/obterDisciplina?sgldis=${sgldis}&verdis=1`,
      { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'matrusp-clone/0.1' } }
    );
    const html = new TextDecoder('iso-8859-1').decode(raw);
    const $ = cheerio.load(html);
    let aula = 0, trabalho = 0;
    $('tr').each((_, tr) => {
      const txt = $(tr).text().replace(/\s+/g, ' ').trim();
      const ma = txt.match(/Cr[eé]ditos Aula[:\s]+(\d+)/i);
      const mt = txt.match(/Cr[eé]ditos Trabalho[:\s]+(\d+)/i);
      if (ma) aula     = parseInt(ma[1]);
      if (mt) trabalho = parseInt(mt[1]);
    });
    return aula + trabalho;
  } catch {
    return null;
  }
}

const data = JSON.parse(readFileSync(IN, 'utf8'));
let total = 0, done = 0;
for (const u of Object.values(data)) total += u.disciplinas.length;
console.log(`Enriquecendo ${total} disciplinas...`);

for (const u of Object.values(data)) {
  for (const disc of u.disciplinas) {
    if (disc.creditos !== undefined) { done++; continue; } // já tem
    await new Promise(r => setTimeout(r, 250));
    const cred = await fetchCreditos(disc.codigo);
    disc.creditos = cred ?? 0;
    done++;
    if (done % 20 === 0) {
      process.stdout.write(`\r${done}/${total}`);
      writeFileSync(OUT, JSON.stringify(data, null, 2)); // checkpoint
    }
  }
}

writeFileSync(OUT, JSON.stringify(data, null, 2));
copyFileSync(OUT, PUBLIC);
console.log(`\nDone. Copiado para ${PUBLIC}`);
