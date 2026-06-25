import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE = 'https://uspdigital.usp.br/jupiterweb';
const { data: raw } = await axios.get(`${BASE}/jupColegiadoLista?tipo=D`, {
  headers: { 'User-Agent': 'matrusp-clone/0.1' },
  responseType: 'arraybuffer', timeout: 15000,
});
const html = new TextDecoder('iso-8859-1').decode(raw);
const $ = cheerio.load(html);

const unidades = [];
$('a[href*="codcg="]').each((_, el) => {
  const match = $(el).attr('href').match(/codcg=(\d+)/);
  if (match) unidades.push({ codcg: match[1], nome: $(el).text().trim() });
});

const unicas = [...new Map(unidades.map(u => [u.codcg, u])).values()];
unicas.sort((a, b) => a.nome.localeCompare(b.nome));
unicas.forEach(u => console.log(`${u.codcg.padStart(3)}: ${u.nome}`));
console.log(`\nTotal: ${unicas.length}`);

// busca por termo
const termo = process.argv[2]?.toUpperCase();
if (termo) {
  const hits = unicas.filter(u => u.nome.toUpperCase().includes(termo));
  console.log(`\nMatches para "${termo}":`, hits);
}
