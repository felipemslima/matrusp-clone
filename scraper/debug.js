import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://uspdigital.usp.br/jupiterweb';
const DIA_MAP = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, 'sáb': 5 };

const { data: raw } = await axios.get(
  `${BASE}/obterTurma?print=true&sgldis=MAC0110`,
  { headers: { 'User-Agent': 'matrusp-clone/0.1' }, responseType: 'arraybuffer', timeout: 15000 }
);
const html = new TextDecoder('iso-8859-1').decode(raw);
const $ = cheerio.load(html);

let turmaAtual = null;
const turmas = [];

$('tr').each((i, tr) => {
  const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
  const rowText = cells.join(' ');

  const codigoMatch = rowText.match(/C[oó]digo da Turma[:\s]+(\d{5,})/i);
  const diaKey = cells[0]?.toLowerCase().replace(/[.\s]/g, '');
  const ehDia = diaKey in DIA_MAP;

  if (codigoMatch || ehDia || i < 40) {
    console.log(`TR[${i}] cells=${cells.length} | "${rowText.slice(0,100)}" | codigoMatch=${!!codigoMatch} ehDia=${ehDia}`);
  }

  if (codigoMatch) {
    turmaAtual = { codigo: codigoMatch[1], professor: '', horarios: [] };
    turmas.push(turmaAtual);
  }
  if (ehDia && turmaAtual && cells.length >= 3) {
    turmaAtual.horarios.push({ dia: DIA_MAP[diaKey], inicio: cells[1], fim: cells[2] });
  }
});

console.log('\nTurmas encontradas:', turmas.length);
for (const t of turmas) console.log(' ', t.codigo, t.horarios);
