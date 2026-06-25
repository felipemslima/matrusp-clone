import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PAGE = `file://${ROOT}/index.html`;

let browser, page;

async function setup() {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--allow-file-access-from-files', '--disable-web-security'],
  });
  page = await browser.newPage();
  await page.goto(PAGE, { waitUntil: 'networkidle0' });
  // aguarda carregamento dos dados (fetch do JSON)
  await page.waitForFunction(() => window._dataLoaded, { timeout: 5000 }).catch(() => {});
}

async function teardown() {
  await browser.close();
}

// ── helpers ───────────────────────────────────────────────────────────────────
const pass = (name) => console.log(`  ✓ ${name}`);
const fail = (name, err) => { console.error(`  ✗ ${name}: ${err.message}`); process.exitCode = 1; };

// ── testes ────────────────────────────────────────────────────────────────────
async function testeTituloPresente() {
  const title = await page.$eval('#logo', el => el.textContent);
  if (!title.includes('MatrUSP')) throw new Error(`Título inesperado: ${title}`);
  pass('título presente');
}

async function testeBuscaRetornaDisciplina() {
  await page.type('#search', 'MAC');
  await page.waitForSelector('#search-results li', { timeout: 2000 });
  const items = await page.$$('#search-results li');
  if (items.length === 0) throw new Error('nenhum resultado de busca');
  pass(`busca retorna ${items.length} resultado(s)`);
}

async function testeSelecionarDisciplina() {
  const primeiro = await page.$('#search-results li');
  await primeiro.click();
  await page.waitForSelector('.lecture-item', { timeout: 2000 });
  const cards = await page.$$('.lecture-item');
  if (!cards.length) throw new Error('card não apareceu no accordion');
  pass('disciplina selecionada aparece no accordion');
}

async function testeBlocoNaGrade() {
  const blocos = await page.$$('.schedule-box');
  if (!blocos.length) throw new Error('nenhum bloco de aula na grade');
  pass(`grade tem ${blocos.length} bloco(s) de aula`);
}

async function testeRemoverDisciplina() {
  const btn = await page.$('.lecture-remove');
  await btn.click();
  await new Promise(r => setTimeout(r, 300));
  const cards = await page.$$('.lecture-item');
  if (cards.length) throw new Error('card ainda presente após remoção');
  pass('disciplina removida do accordion e grade');
}

// ── runner ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\nMatrUSP Clone — E2E Tests\n');
  await setup();

  const testes = [
    testeTituloPresente,
    testeBuscaRetornaDisciplina,
    testeSelecionarDisciplina,
    testeBlocoNaGrade,
    testeRemoverDisciplina,
  ];

  for (const t of testes) {
    try { await t(); } catch (e) { fail(t.name, e); }
  }

  await teardown();
  console.log('\nDone.\n');
})();
