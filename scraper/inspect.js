import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync } from 'fs';

const { data } = await axios.get(
  'https://uspdigital.usp.br/jupiterweb/obterTurma?print=true&sgldis=MAC0110',
  { headers: { 'User-Agent': 'matrusp-clone/0.1' }, responseType: 'arraybuffer', timeout: 15000 }
);

const html = new TextDecoder('iso-8859-1').decode(data);
writeFileSync('scraper/output/mac0110_raw.html', html);

const $ = cheerio.load(html);

// Mapear estrutura de alto nível
console.log('=== ESTRUTURA DE TABELAS ===\n');
$('table').each((i, table) => {
  const text = $(table).text().replace(/\s+/g, ' ').trim().slice(0, 120);
  console.log(`Table[${i}]: ${text}`);
});

console.log('\n=== LINHAS COM "Turma" ===\n');
$('tr').each((i, tr) => {
  const txt = $(tr).text().replace(/\s+/g, ' ').trim();
  if (/turma/i.test(txt) && txt.length < 200) console.log(`TR[${i}]: ${txt}`);
});

console.log('\n=== LINHAS COM DIA (ter/seg/qua) ===\n');
$('tr').each((i, tr) => {
  const txt = $(tr).text().replace(/\s+/g, ' ').trim();
  if (/\b(seg|ter|qua|qui|sex|sab|sáb)\b/i.test(txt) && txt.length < 300)
    console.log(`TR[${i}]: ${txt}`);
});
