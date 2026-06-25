import axios from 'axios';
import * as cheerio from 'cheerio';
import { writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const BASE = 'https://uspdigital.usp.br/jupiterweb';
const OUT  = join(dirname(fileURLToPath(import.meta.url)), 'output');

const get = async (url) => {
  const { data: raw } = await axios.get(url, {
    headers: { 'User-Agent': 'matrusp-clone/0.1 (estudo)' },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  const html = new TextDecoder('iso-8859-1').decode(raw);
  return cheerio.load(html);
};

// Etapa 1: lista todas as unidades (codcg)
async function getUnidades() {
  const $ = await get(`${BASE}/jupColegiadoLista?tipo=D`);
  const unidades = [];
  $('a[href*="codcg="]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/codcg=(\d+)/);
    if (match) {
      unidades.push({ codcg: match[1], nome: $(el).text().trim() });
    }
  });
  return [...new Map(unidades.map(u => [u.codcg, u])).values()];
}

// Etapa 2: lista disciplinas de uma unidade
async function getDisciplinas(codcg) {
  const $ = await get(`${BASE}/jupDisciplinaLista?letra=A-Z&tipo=D&codcg=${codcg}`);
  const disciplinas = [];
  $('a[href*="sgldis="]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/sgldis=([A-Z0-9]+)/);
    if (match) {
      disciplinas.push({ codigo: match[1], nome: $(el).text().trim() });
    }
  });
  return disciplinas;
}

const DIA_MAP = { seg: 0, ter: 1, qua: 2, qui: 3, sex: 4, sab: 5, 'sáb': 5 };

// Etapa 3: extrai turmas de uma disciplina
async function getTurmas(sgldis) {
  // encoding: USP serve ISO-8859-1
  const { data: raw } = await axios.get(`${BASE}/obterTurma?print=true&sgldis=${sgldis}`, {
    headers: { 'User-Agent': 'matrusp-clone/0.1 (estudo)' },
    responseType: 'arraybuffer',
    timeout: 15000,
  });
  const html = new TextDecoder('iso-8859-1').decode(raw);
  const $ = cheerio.load(html);

  const turmas = [];
  let turmaAtual = null;

  // Itera todas as TRs em ordem de documento
  $('tr').each((_, tr) => {
    const cells = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
    const rowText = cells.join(' ').replace(/\s+/g, ' ');

    // Nova turma: linha "Código da Turma: XXXXXXX"
    const codigoMatch = rowText.match(/C[oó]digo da Turma[:\s]+(\d{5,})/i);
    if (codigoMatch) {
      turmaAtual = { codigo: codigoMatch[1], professor: '', horarios: [] };
      turmas.push(turmaAtual);
      return;
    }

    if (!turmaAtual) return;

    // Linha de horário: cells[0] = dia, cells[1] = início, cells[2] = fim, cells[3] = prof
    if (cells.length >= 3) {
      const dia = cells[0].toLowerCase().replace(/[.\s]/g, '');
      if (dia in DIA_MAP) {
        const horaMatch = cells[1]?.match(/(\d{2}:\d{2})/);
        const fimMatch  = cells[2]?.match(/(\d{2}:\d{2})/);
        if (horaMatch) {
          turmaAtual.horarios.push({
            dia: DIA_MAP[dia],
            inicio: horaMatch[1],
            fim: fimMatch ? fimMatch[1] : '',
          });
          // professor: cells[3], remove "(R) " prefix
          if (!turmaAtual.professor && cells[3]) {
            turmaAtual.professor = cells[3].replace(/^\(R\)\s*/, '').trim();
          }
        }
      }
    }
  });

  return turmas.filter(t => t.horarios.length > 0);
}

// Runner principal
// Uso: node scrape.js                    → raspa IME (45)
//      CODCG=8,27,31 node scrape.js      → raspa unidades específicas
//      ALL=1 node scrape.js              → raspa todas (76 unidades)
//      MERGE=1 CODCG=8,27,31 node scrape.js → merge com JSON existente
async function main() {
  const outFile = join(OUT, 'disciplinas.json');

  // carrega JSON existente se MERGE=1
  let resultado = {};
  if (process.env.MERGE && existsSync(outFile)) {
    resultado = JSON.parse(readFileSync(outFile, 'utf8'));
    console.log(`Merge ativo — ${Object.keys(resultado).length} unidade(s) já no JSON.`);
  }

  console.log('Buscando unidades...');
  const unidades = await getUnidades();
  console.log(`Total unidades disponíveis: ${unidades.length}`);

  let alvo;
  if (process.env.ALL) {
    alvo = unidades;
  } else {
    const codcgs = (process.env.CODCG || '45').split(',').map(s => s.trim());
    alvo = unidades.filter(u => codcgs.includes(u.codcg));
    if (!alvo.length) { console.error('Nenhuma unidade encontrada para', codcgs); process.exit(1); }
  }

  mkdirSync(OUT, { recursive: true });

  for (const unidade of alvo) {
    // pula unidades já presentes no merge (não re-raspa)
    if (process.env.MERGE && resultado[unidade.codcg]) {
      console.log(`\n  [${unidade.codcg}] ${unidade.nome} — já presente, pulando`);
      continue;
    }

    console.log(`\n  [${unidade.codcg}] ${unidade.nome}`);
    let disciplinas = [];
    try {
      disciplinas = await getDisciplinas(unidade.codcg);
    } catch (e) {
      console.error(`\n  Erro ao listar disciplinas: ${e.message} — pulando unidade`);
      continue;
    }
    console.log(`  ${disciplinas.length} disciplinas encontradas`);
    resultado[unidade.codcg] = { nome: unidade.nome, disciplinas: [] };

    for (const disc of disciplinas) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const turmas = await getTurmas(disc.codigo);
        if (turmas.length > 0) {
          resultado[unidade.codcg].disciplinas.push({ ...disc, turmas });
          process.stdout.write('.');
        }
      } catch (e) {
        process.stderr.write(`\nErro ${disc.codigo}: ${e.message}\n`);
      }
    }
    console.log();

    // checkpoint: salva após cada unidade
    writeFileSync(outFile, JSON.stringify(resultado, null, 2));
  }

  const publicFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'disciplinas.json');
  copyFileSync(outFile, publicFile);

  const totalDiscs  = Object.values(resultado).reduce((s, u) => s + u.disciplinas.length, 0);
  const totalTurmas = Object.values(resultado).reduce((s, u) => s + u.disciplinas.reduce((t, d) => t + d.turmas.length, 0), 0);
  console.log(`\nSalvo em ${outFile} e copiado para public/data/`);
  console.log(`Unidades: ${Object.keys(resultado).length} | Disciplinas: ${totalDiscs} | Turmas: ${totalTurmas}`);
}

main().catch(console.error);
