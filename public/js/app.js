const DATA_URL    = 'data/disciplinas.json';
const HORA_INICIO = 7;
const HORA_FIM    = 23;
const HORAS       = HORA_FIM - HORA_INICIO;
const PX_POR_HORA = 60;
const NUM_CORES   = 13;
const LS_KEY      = 'matrusp-clone-grade';
const MAX_COMB    = 500; // limite de segurança

let disciplinasDB = [];
let selecionadas  = []; // { disc, turmasHab: Set<number>, corIdx }
let combinacoes   = []; // [[{ disc, turma, corIdx }], ...]
let combIdx       = 0;
let proximaCor    = 0;

// ── Utilitários ───────────────────────────────────────────────────────────────
const toMin = str => { const [h, m] = str.split(':').map(Number); return h * 60 + m; };

const DIAS_ABREV = ['Seg','Ter','Qua','Qui','Sex','Sáb'];

function formatHorarios(turma) {
  return turma.horarios
    .map(h => `${DIAS_ABREV[h.dia]} ${h.inicio}${h.fim ? '–' + h.fim : ''}`)
    .join(' · ');
}

function calcTotalCreditos(comb) {
  if (!comb) return null;
  let total = 0, hasCreditos = false;
  for (const { disc } of comb) {
    if (disc.creditos != null) { total += disc.creditos; hasCreditos = true; }
  }
  if (!hasCreditos) return null;
  return total;
}

function calcTotalMin(comb) {
  let min = 0;
  for (const { turma } of (comb || [])) {
    for (const h of turma.horarios) {
      if (h.fim) min += toMin(h.fim) - toMin(h.inicio);
    }
  }
  return min;
}

function conflita(turmaA, turmaB) {
  for (const ha of turmaA.horarios) {
    for (const hb of turmaB.horarios) {
      if (ha.dia !== hb.dia) continue;
      const iniA = toMin(ha.inicio), fimA = toMin(ha.fim || ha.inicio);
      const iniB = toMin(hb.inicio), fimB = toMin(hb.fim || hb.inicio);
      if (iniA < fimB && fimA > iniB) return true;
    }
  }
  return false;
}

// ── Engine de combinações ─────────────────────────────────────────────────────
function computarCombinacoes() {
  let combs = [[]];

  for (const s of selecionadas) {
    const hab = [...s.turmasHab].map(i => s.disc.turmas[i]).filter(Boolean);
    if (!hab.length) continue;

    const novas = [];
    for (const turma of hab) {
      for (const comb of combs) {
        if (!comb.some(item => conflita(turma, item.turma))) {
          novas.push([...comb, { disc: s.disc, turma, corIdx: s.corIdx }]);
          if (novas.length >= MAX_COMB) break;
        }
      }
      if (novas.length >= MAX_COMB) break;
    }

    if (novas.length) combs = novas;
    // se nenhuma turma cabe: mantém combinações sem essa disciplina (unavailable)
  }

  combinacoes = combs.filter(c => c.length > 0);
  combIdx = 0;
}

// ── Loader ────────────────────────────────────────────────────────────────────
async function carregarDados() {
  document.getElementById('loading-bar').hidden = false;
  try {
    const res  = await fetch(DATA_URL);
    const json = await res.json();
    disciplinasDB = [];
    for (const unidade of Object.values(json)) {
      for (const disc of unidade.disciplinas) disciplinasDB.push(disc);
    }
  } finally {
    document.getElementById('loading-bar').hidden = true;
  }
  buildTimeLabels();
}

// ── Grade: rótulos de hora ────────────────────────────────────────────────────
function buildTimeLabels() {
  const container = document.getElementById('time-labels');
  container.innerHTML = '';
  for (let h = HORA_INICIO; h <= HORA_FIM; h++) {
    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = `${String(h).padStart(2,'0')}:00`;
    label.style.top = `${((h - HORA_INICIO) / HORAS) * 100}%`;
    container.appendChild(label);
  }
}

// ── Busca ─────────────────────────────────────────────────────────────────────
const searchEl    = document.getElementById('search');
const resultBox   = document.getElementById('search-result-box');
const resultsList = document.getElementById('search-results');

searchEl.addEventListener('input', () => {
  const q = searchEl.value.trim().toUpperCase();
  if (q.length < 2) { resultBox.hidden = true; return; }

  const hits = disciplinasDB
    .filter(d => d.codigo.includes(q) || d.nome.toUpperCase().includes(q))
    .slice(0, 12);

  if (!hits.length) { resultBox.hidden = true; return; }

  resultsList.innerHTML = '';
  for (const d of hits) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="result-code">${d.codigo}</span><span class="result-name">${d.nome}</span>`;
    li.addEventListener('mousedown', e => { e.preventDefault(); selecionar(d); });
    resultsList.appendChild(li);
  }
  resultBox.hidden = false;
});

searchEl.addEventListener('blur',  () => setTimeout(() => { resultBox.hidden = true; }, 150));
searchEl.addEventListener('focus', () => { if (searchEl.value.trim().length >= 2) resultBox.hidden = false; });

// ── Seleção ───────────────────────────────────────────────────────────────────
function selecionar(disc) {
  if (selecionadas.find(s => s.disc.codigo === disc.codigo)) {
    searchEl.value = ''; resultBox.hidden = true; return;
  }
  const turmasHab = new Set(disc.turmas.map((_, i) => i)); // todas habilitadas por padrão
  selecionadas.push({ disc, turmasHab, corIdx: proximaCor++ % NUM_CORES });
  searchEl.value = ''; resultBox.hidden = true;
  atualizar();
  salvarEstado();
}

function remover(codigo) {
  selecionadas = selecionadas.filter(s => s.disc.codigo !== codigo);
  atualizar();
  salvarEstado();
}

function moverPrioridade(codigo, delta) {
  const idx = selecionadas.findIndex(s => s.disc.codigo === codigo);
  const novoIdx = idx + delta;
  if (novoIdx < 0 || novoIdx >= selecionadas.length) return;
  [selecionadas[idx], selecionadas[novoIdx]] = [selecionadas[novoIdx], selecionadas[idx]];
  atualizar();
  salvarEstado();
}

function toggleTurma(codigo, turmaIdx, habilitado) {
  const s = selecionadas.find(s => s.disc.codigo === codigo);
  if (!s) return;
  habilitado ? s.turmasHab.add(turmaIdx) : s.turmasHab.delete(turmaIdx);
  atualizar();
  salvarEstado();
}

// ── Atualização central ───────────────────────────────────────────────────────
function atualizar() {
  computarCombinacoes();
  renderAccordion();
  renderGrade();
  renderCombBar();
}

// ── Render Accordion ──────────────────────────────────────────────────────────
let dragSrc = null;

function renderAccordion() {
  const accordion = document.getElementById('accordion');
  const empty     = document.getElementById('accordion-empty');
  const footer    = document.getElementById('explorer-footer');
  accordion.querySelectorAll('.lecture-item').forEach(el => el.remove());

  if (!selecionadas.length) {
    empty.hidden = false;
    footer.hidden = true;
    return;
  }
  empty.hidden = true;

  const disponiveis = new Set(combinacoes.flatMap(c => c.map(item => item.disc.codigo)));

  selecionadas.forEach(s => {
    const unavail = selecionadas.length > 1 && !disponiveis.has(s.disc.codigo);
    const div = document.createElement('div');
    div.className = `lecture-item color-${s.corIdx}${unavail ? ' lecture-unavailable' : ''}`;
    div.dataset.codigo = s.disc.codigo;
    div.draggable = true;

    const turmasHtml = s.disc.turmas.map((t, i) => {
      const checked  = s.turmasHab.has(i) ? 'checked' : '';
      const schedule = formatHorarios(t);
      const prof     = t.professor ? t.professor.split(' ').slice(0, 3).join(' ') : '';
      return `
        <label class="turma-check-label">
          <input type="checkbox" class="turma-check" data-idx="${i}" ${checked}>
          <span class="turma-info">
            <span class="turma-code-tag">T${t.codigo}</span>
            <span class="turma-schedule">${schedule}</span>
            ${prof ? `<span class="turma-prof">${prof}</span>` : ''}
          </span>
        </label>`;
    }).join('');

    const credTag = s.disc.creditos != null
      ? `<span class="lecture-credits">${s.disc.creditos}cr</span>` : '';
    div.innerHTML = `
      <div class="lecture-header">
        <span class="drag-handle" title="Arrastar para reordenar">⠿</span>
        <div class="lecture-info-text">
          <span class="lecture-code">${s.disc.codigo}</span>
          <span class="lecture-name">${s.disc.nome}</span>
          ${credTag}
          ${unavail ? '<span class="lecture-conflict-badge">conflito</span>' : ''}
        </div>
        <button class="lecture-remove" title="Remover">×</button>
      </div>
      <div class="lecture-turmas">${turmasHtml}</div>
    `;

    div.querySelector('.lecture-remove')
       .addEventListener('click', () => remover(s.disc.codigo));
    div.querySelectorAll('.turma-check')
       .forEach(cb => cb.addEventListener('change', e =>
         toggleTurma(s.disc.codigo, parseInt(cb.dataset.idx), e.target.checked)));

    // drag-and-drop reorder
    div.addEventListener('dragstart', e => {
      dragSrc = s.disc.codigo;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.classList.add('dragging'), 0);
    });
    div.addEventListener('dragend', () => {
      dragSrc = null;
      accordion.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      div.classList.remove('dragging');
    });
    div.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragSrc && dragSrc !== s.disc.codigo) {
        accordion.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        div.classList.add('drag-over');
      }
    });
    div.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragSrc || dragSrc === s.disc.codigo) return;
      const fromIdx = selecionadas.findIndex(sel => sel.disc.codigo === dragSrc);
      const toIdx   = selecionadas.findIndex(sel => sel.disc.codigo === s.disc.codigo);
      const [item]  = selecionadas.splice(fromIdx, 1);
      selecionadas.splice(toIdx, 0, item);
      atualizar();
      salvarEstado();
    });

    accordion.appendChild(div);
  });

  // footer: créditos (se disponível) ou horas/sem
  const comb = combinacoes[combIdx];
  const cred = calcTotalCreditos(comb);
  footer.hidden = false;
  if (cred != null) {
    footer.textContent = `${cred} crédito${cred !== 1 ? 's' : ''} na grade atual`;
  } else {
    const min  = calcTotalMin(comb);
    const h    = (min / 60).toFixed(1).replace('.0', '');
    footer.textContent = `${h}h/sem na grade atual`;
  }
}

// ── Render Grade ──────────────────────────────────────────────────────────────
function renderGrade() {
  for (let dia = 0; dia < 6; dia++) {
    const col = document.querySelector(`#col-${dia} .column-content`);
    if (col) col.querySelectorAll('.schedule-box').forEach(el => el.remove());
  }

  const comb = combinacoes[combIdx];
  if (!comb) return;

  for (const { disc, turma, corIdx } of comb) {
    for (const h of turma.horarios) {
      const col = document.querySelector(`#col-${h.dia} .column-content`);
      if (!col) continue;

      const iniMin = toMin(h.inicio);
      const fimMin = h.fim ? toMin(h.fim) : iniMin + 100;
      const topP   = ((iniMin - HORA_INICIO * 60) / (HORAS * 60)) * 100;
      const htP    = ((fimMin - iniMin) / (HORAS * 60)) * 100;

      const box = document.createElement('div');
      box.className = `schedule-box color-${corIdx}`;
      box.style.top    = `${topP}%`;
      box.style.height = `${htP}%`;

      const profCurto = turma.professor
        ? turma.professor.split(' ').slice(0, 2).join(' ') : '';
      box.innerHTML = `
        <span class="schedule-box-code">${disc.codigo}</span>
        <span class="schedule-box-name">${disc.nome}</span>
        ${profCurto ? `<span class="schedule-box-prof">${profCurto}</span>` : ''}
      `;
      col.appendChild(box);
    }
  }
}

// ── Render Combination Bar ────────────────────────────────────────────────────
const MINI_W = 68, MINI_H = 56, MINI_DAYS = 6;
const MINI_COL = MINI_W / MINI_DAYS;
const MINI_CORES = [
  '#adf0b2','#a1defc','#ffc299','#edc3ee','#f3dd95',
  '#dff5a3','#9cf2ec','#ece7ca','#c0cbed','#f79cc9',
  '#afdebf','#d2bbf7','#d6c8b8',
];
const MINI_BORDAS = [
  '#1c9c26','#0679b2','#b34700','#9b2d9f','#937410',
  '#7ba112','#14948c','#9b8a36','#2d489a','#a00d57',
  '#317748','#5316b6','#6b563d',
];

function desenharMiniBoard(canvas, comb, ativo) {
  const ctx = canvas.getContext('2d');
  canvas.width  = MINI_W;
  canvas.height = MINI_H;

  ctx.fillStyle = ativo ? '#e8f4f5' : '#f8f8f8';
  ctx.fillRect(0, 0, MINI_W, MINI_H);

  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 0.5;
  for (let h = 0; h <= HORAS; h += 2) {
    const y = Math.round((h / HORAS) * MINI_H) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MINI_W, y); ctx.stroke();
  }
  ctx.strokeStyle = '#e0e0e0';
  for (let d = 1; d < MINI_DAYS; d++) {
    const x = Math.round(d * MINI_COL) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MINI_H); ctx.stroke();
  }

  for (const { turma, corIdx } of (comb || [])) {
    for (const hor of turma.horarios) {
      const x   = hor.dia * MINI_COL + 1;
      const ini = toMin(hor.inicio);
      const fim = hor.fim ? toMin(hor.fim) : ini + 100;
      const y   = ((ini - HORA_INICIO * 60) / (HORAS * 60)) * MINI_H;
      const ht  = Math.max(2, ((fim - ini) / (HORAS * 60)) * MINI_H);
      ctx.fillStyle   = MINI_CORES[corIdx % MINI_CORES.length];
      ctx.fillRect(x, y, MINI_COL - 2, ht);
      ctx.strokeStyle = MINI_BORDAS[corIdx % MINI_BORDAS.length];
      ctx.lineWidth   = 1;
      ctx.strokeRect(x, y, MINI_COL - 2, ht);
    }
  }

  if (ativo) {
    ctx.strokeStyle = '#0097A7';
    ctx.lineWidth   = 2;
    ctx.strokeRect(1, 1, MINI_W - 2, MINI_H - 2);
  }
}

function renderCombBar() {
  const track   = document.getElementById('comb-track');
  const count   = document.getElementById('comb-count');
  const btnPrev = document.getElementById('comb-prev');
  const btnNext = document.getElementById('comb-next');
  track.innerHTML = '';

  if (!combinacoes.length) {
    count.textContent = '0 combinações';
    btnPrev.disabled = btnNext.disabled = true;
    return;
  }

  const n = combinacoes.length;
  count.textContent = `${combIdx + 1} / ${n}${n >= MAX_COMB ? '+' : ''}`;
  btnPrev.disabled = combIdx === 0;
  btnNext.disabled = combIdx === n - 1;

  // mostra janela de até 9 mini-boards centrada no ativo
  const JANELA = 9;
  const start = Math.max(0, Math.min(combIdx - Math.floor(JANELA / 2), n - JANELA));
  const end   = Math.min(n, start + JANELA);

  for (let i = start; i < end; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = `comb-board${i === combIdx ? ' comb-active' : ''}`;
    wrapper.title = `Combinação ${i + 1}`;

    const canvas = document.createElement('canvas');
    desenharMiniBoard(canvas, combinacoes[i], i === combIdx);
    wrapper.appendChild(canvas);

    const lbl = document.createElement('span');
    lbl.className = 'comb-label';
    lbl.textContent = i + 1;
    wrapper.appendChild(lbl);

    const idx = i;
    wrapper.addEventListener('click', () => { combIdx = idx; renderGrade(); renderCombBar(); });
    track.appendChild(wrapper);
  }
}

// ── Persistência ──────────────────────────────────────────────────────────────
function salvarEstado() {
  const estado = selecionadas.map(s => ({
    codigo:    s.disc.codigo,
    turmasHab: [...s.turmasHab],
    corIdx:    s.corIdx,
  }));
  localStorage.setItem(LS_KEY, JSON.stringify({ version: 2, disciplinas: estado }));
}

function carregarEstado(json) {
  if (!json?.version || !Array.isArray(json.disciplinas)) return false;
  let ok = false;
  for (const entry of json.disciplinas) {
    const disc = disciplinasDB.find(d => d.codigo === entry.codigo);
    if (!disc) continue;
    if (selecionadas.find(s => s.disc.codigo === disc.codigo)) continue;
    const turmasHab = entry.turmasHab
      ? new Set(entry.turmasHab)
      : new Set(disc.turmas.map((_, i) => i));
    selecionadas.push({ disc, turmasHab, corIdx: entry.corIdx ?? (proximaCor++ % NUM_CORES) });
    proximaCor = Math.max(proximaCor, (entry.corIdx ?? 0) + 1);
    ok = true;
  }
  return ok;
}

// ── Export / Import ───────────────────────────────────────────────────────────
function exportarGrade() {
  const estado = selecionadas.map(s => ({
    codigo:    s.disc.codigo,
    nome:      s.disc.nome,
    turmasHab: [...s.turmasHab],
    corIdx:    s.corIdx,
  }));
  const blob = new Blob([JSON.stringify({ version: 2, disciplinas: estado }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'grade-matrusp.json' });
  a.click(); URL.revokeObjectURL(a.href);
}

function importarArquivo(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json.version) throw new Error();
      selecionadas = []; proximaCor = 0;
      if (!carregarEstado(json)) { alert('Nenhuma disciplina reconhecida.'); return; }
      salvarEstado(); atualizar();
    } catch { alert('Arquivo inválido.'); }
  };
  reader.readAsText(file);
}

// ── Wire: buttons ─────────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', exportarGrade);
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!selecionadas.length || confirm('Limpar toda a grade?')) {
    selecionadas = []; proximaCor = 0; combinacoes = []; combIdx = 0;
    salvarEstado(); atualizar();
  }
});
const importInput = document.getElementById('import-input');
document.getElementById('btn-import').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', e => { if (e.target.files[0]) { importarArquivo(e.target.files[0]); e.target.value = ''; } });

document.getElementById('comb-prev').addEventListener('click', () => {
  if (combIdx > 0) { combIdx--; renderGrade(); renderCombBar(); }
});
document.getElementById('comb-next').addEventListener('click', () => {
  if (combIdx < combinacoes.length - 1) { combIdx++; renderGrade(); renderCombBar(); }
});

// ── Init ──────────────────────────────────────────────────────────────────────
carregarDados().then(() => {
  window._dataLoaded = true;
  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    try { if (carregarEstado(JSON.parse(saved))) atualizar(); }
    catch { localStorage.removeItem(LS_KEY); }
  } else {
    renderCombBar();
  }
});
