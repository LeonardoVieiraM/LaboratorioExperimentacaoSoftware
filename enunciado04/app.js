'use strict';

const CSV_PATH = 'analise_impacto_ia.csv';

// Cores Oficiais da sua Pesquisa
const CORES = {
  pre: '#3b82f6', preBg: 'rgba(59, 130, 246, 0.8)', // Azul
  pos: '#ef4444', posBg: 'rgba(239, 68, 68, 0.8)',  // Vermelho
  green: '#10B981', red: '#EF4444'
};

const estado = {
  dadosCompletos: [],
  dadosFiltrados: [],
  graficos: {},
  filtros: { starsMin: 0, starsMax: 100000, ageMin: 0, ageMax: 20, commitsMin: 0, commitsMax: 50000, aiMin: 0, aiMax: 15 },
  limites: { starsMax: 0, ageMax: 0, commitsMax: 0, aiMax: 0 }
};

// Utilitários Matemáticos
function num(v) { const n = parseFloat(v); return isNaN(n) || !isFinite(n) ? 0 : n; }
function extrairArray(dados, coluna) { return dados.map(r => num(r[coluna])).filter(v => v !== 0); }
function media(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function mediana(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Emulador do Seaborn KDE
function calcularKDE(dados, numPoints = 100) {
  if (dados.length === 0) return [];
  const min = Math.min(...dados);
  const max = Math.max(...dados);
  const m = media(dados);
  const variance = dados.reduce((a, b) => a + Math.pow(b - m, 2), 0) / dados.length;
  const std = Math.sqrt(variance);
  
  const bandwidth = 1.06 * std * Math.pow(dados.length, -0.2) || 0.1;
  const step = (max - min) / numPoints;
  const pts = Array.from({length: numPoints}, (_, i) => min + i * step);
  const kernel = x => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
  
  return pts.map(p => {
    const sum = dados.reduce((acc, v) => acc + kernel((p - v) / bandwidth), 0);
    return { x: p, y: sum / (dados.length * bandwidth) };
  });
}

// Inicialização
function carregarCSV() {
  Papa.parse(CSV_PATH, {
    download: true, header: true, dynamicTyping: true,
    complete: (res) => {
      estado.dadosCompletos = res.data.filter(r => r.repository);
      estado.dadosFiltrados = [...estado.dadosCompletos];
      
      document.getElementById('loading-overlay').classList.add('hidden');
      
      document.getElementById('status-label').textContent = 'Análise Concluída';
      const dot = document.querySelector('.dot');
      if (dot) {
          dot.style.background = '#10B981';
          dot.style.animation = 'none';
      }

      configurarLimitesFiltros();
      atualizarDashboard();
    }
  });
}

// Configuração dos Sliders Duplos
function configurarLimitesFiltros() {
  const d = estado.dadosCompletos;
  estado.limites.starsMax = Math.ceil(Math.max(...d.map(r => num(r.stars))));
  estado.limites.ageMax = Math.ceil(Math.max(...d.map(r => num(r.age_years))));
  estado.limites.commitsMax = Math.ceil(Math.max(...d.map(r => num(r.pre_commits) + num(r.pos_commits))));
  estado.limites.aiMax = Math.ceil(Math.max(...d.map(r => num(r.ai_score))));
  
  resetarFiltrosEstado();
  
  ['stars', 'age', 'commits', 'ai'].forEach(tipo => {
    const maxVal = estado.limites[`${tipo}Max`];
    document.getElementById(`${tipo}-min`).max = maxVal;
    document.getElementById(`${tipo}-max`).max = maxVal;
    
    document.getElementById(`${tipo}-min`).addEventListener('input', aplicarLogicaFiltro);
    document.getElementById(`${tipo}-max`).addEventListener('input', aplicarLogicaFiltro);
  });

  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    resetarFiltrosEstado();
    aplicarLogicaFiltro();
  });
  
  sincronizarDOMComEstado();
}

function resetarFiltrosEstado() {
  estado.filtros = {
    starsMin: 0, starsMax: estado.limites.starsMax,
    ageMin: 0, ageMax: estado.limites.ageMax,
    commitsMin: 0, commitsMax: estado.limites.commitsMax,
    aiMin: 0, aiMax: estado.limites.aiMax
  };
  sincronizarDOMComEstado();
}

function sincronizarDOMComEstado() {
  const f = estado.filtros;
  document.getElementById('stars-min').value = f.starsMin; document.getElementById('stars-max').value = f.starsMax;
  document.getElementById('age-min').value = f.ageMin; document.getElementById('age-max').value = f.ageMax;
  document.getElementById('commits-min').value = f.commitsMin; document.getElementById('commits-max').value = f.commitsMax;
  document.getElementById('ai-min').value = f.aiMin; document.getElementById('ai-max').value = f.aiMax;
}

function aplicarLogicaFiltro() {
  const f = estado.filtros;
  
  ['stars', 'age', 'commits', 'ai'].forEach(tipo => {
    let min = num(document.getElementById(`${tipo}-min`).value);
    let max = num(document.getElementById(`${tipo}-max`).value);
    if (min > max) { min = max; document.getElementById(`${tipo}-min`).value = min; }
    f[`${tipo}Min`] = min; f[`${tipo}Max`] = max;
    
    document.getElementById(`${tipo}-min-display`).textContent = min >= 1000 ? `${(min/1000).toFixed(1)}k` : min;
    document.getElementById(`${tipo}-max-display`).textContent = max >= 1000 ? `${(max/1000).toFixed(1)}k` : max;
    
    const fill = document.getElementById(`${tipo}-fill`);
    const lMax = estado.limites[`${tipo}Max`];
    fill.style.left = `${(min / lMax) * 100}%`;
    fill.style.width = `${((max - min) / lMax) * 100}%`;
  });

  estado.dadosFiltrados = estado.dadosCompletos.filter(r => {
    const s = num(r.stars), a = num(r.age_years), c = num(r.pre_commits) + num(r.pos_commits), ai = num(r.ai_score);
    return (s >= f.starsMin && s <= f.starsMax && a >= f.ageMin && a <= f.ageMax && c >= f.commitsMin && c <= f.commitsMax && ai >= f.aiMin && ai <= f.aiMax);
  });

  atualizarDashboard();
}

function atualizarDashboard() {
  document.getElementById('total-repos-header').textContent = estado.dadosFiltrados.length;
  
  const d = estado.dadosFiltrados;
  const mttrPre = media(extrairArray(d, 'pre_avg_resolution_hours')), mttrPos = media(extrairArray(d, 'pos_avg_resolution_hours'));
  const verbPre = media(extrairArray(d, 'pre_avg_lines_changed')), verbPos = media(extrairArray(d, 'pos_avg_lines_changed'));
  const fixPre = media(extrairArray(d, 'pre_fix_percent')), fixPos = media(extrairArray(d, 'pos_fix_percent'));
  const miPre = media(extrairArray(d, 'pre_avg_mi')), miPos = media(extrairArray(d, 'pos_avg_mi'));

  const fmt = (pre, pos) => pre ? `${((pos - pre)/pre * 100) > 0 ? '+' : ''}${(((pos - pre)/pre) * 100).toFixed(1)}%` : '—';
  
  document.getElementById('kpi-mttr-val').textContent = fmt(mttrPre, mttrPos);
  document.getElementById('kpi-verb-val').textContent = fmt(verbPre, verbPos);
  document.getElementById('kpi-fix-val').textContent = fmt(fixPre, fixPos);
  document.getElementById('kpi-mi-val').textContent = fmt(miPre, miPos);

  renderizarGraficosMSR(d);
}

// ==========================================
// RENDERIZAÇÃO INTELIGENTE DOS GRÁFICOS
// ==========================================

function destroy(id) { if (estado.graficos[id]) estado.graficos[id].destroy(); }

/**
 * Plota um ou múltiplos Violinos, garantindo o Diamante Negro Absoluto 
 * e corrigindo o achatamento em dados altamente discretos (Jitter)
 */
function plotViolinCompleto(id, categories, yTitle, isBoxplot = false) {
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  
  // SOLUÇÃO DO VIOLINO ACHATADO: Micro-jitter apenas para o desenho da curva do KDE.
  // Isso espalha artificialmente dados idênticos (como o 1.0 ou 2.0 da CC mediana)
  // em +/- 0.05, permitindo que a biblioteca desenhe a "barriga" do violino.
  const applyJitter = arr => arr.map(v => v + (Math.random() - 0.5) * 0.1);

  const labels = categories.map(c => c.label);
  const bgColors = categories.map(c => c.type === 'pre' ? CORES.preBg : CORES.posBg);
  const borders = categories.map(c => '#475569');

  // A média oficial e real é calculada SEM jitter (exatidão matemática)
  const mediasCoords = categories.map(c => ({
    x: c.label,
    y: media(c.data.length ? c.data : [0])
  }));

  // O desenho da distribuição recebe o jitter se for violino
  const dataArrays = categories.map(c => {
    if (!c.data.length) return [0];
    return isBoxplot ? c.data : applyJitter(c.data);
  });

  const datasets = [{
    label: 'Distribuição',
    data: dataArrays,
    backgroundColor: bgColors,
    borderColor: borders,
    borderWidth: 1.5,
    outlierRadius: 2,
    itemRadius: 0,
    order: 1
  }];

  if (!isBoxplot) {
    datasets.push({
      label: 'Média Global',
      type: 'scatter',
      data: mediasCoords,
      // SOLUÇÃO DO DIAMANTE: Forçar as cores nativas de pontos no Chart.js
      backgroundColor: 'black',
      borderColor: 'black',
      pointBackgroundColor: 'black',
      pointBorderColor: 'black',
      pointStyle: 'rectRot', 
      pointRadius: 6,
      pointHoverRadius: 7,
      borderWidth: 1,
      order: 0,
      showLine: false
    });
  }

  estado.graficos[id] = new Chart(ctx, {
    type: isBoxplot ? 'boxplot' : 'violin',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { title: { display: true, text: yTitle } } },
      plugins: {
        legend: {
          display: true, position: 'top',
          labels: {
            generateLabels: (chart) => {
              const base = [{text: 'Pré-IA', fillStyle: CORES.preBg, strokeStyle: '#475569'}, {text: 'Pós-IA', fillStyle: CORES.posBg, strokeStyle: '#475569'}];
              if (!isBoxplot) base.push({text: 'Média Global (com outliers)', fillStyle: 'black', strokeStyle: 'black', pointStyle: 'rectRot'});
              return base;
            }
          }
        }
      }
    }
  });
}

function plotKDE(id, arrPre, arrPos, xTitle) {
  destroy(id);
  const kdePre = calcularKDE(arrPre);
  const kdePos = calcularKDE(arrPos);
  
  estado.graficos[id] = new Chart(document.getElementById(id).getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        { type: 'line', label: `Pré-IA (Mediana: ${mediana(arrPre).toFixed(2)})`, data: kdePre, borderColor: CORES.pre, backgroundColor: 'rgba(59, 130, 246, 0.4)', fill: true, tension: 0.4, pointRadius: 0 },
        { type: 'line', label: `Pós-IA (Mediana: ${mediana(arrPos).toFixed(2)})`, data: kdePos, borderColor: CORES.pos, backgroundColor: 'rgba(239, 68, 68, 0.4)', fill: true, tension: 0.4, pointRadius: 0 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { title: { display: true, text: xTitle } }, y: { title: { display: true, text: 'Densidade' }, beginAtZero: true } },
      plugins: { legend: { position: 'top' } }
    }
  });
}

function renderizarGraficosMSR(d) {
  // Q1
  plotKDE('chart-kde-issues', extrairArray(d, 'pre_issue_rate_per_month'), extrairArray(d, 'pos_issue_rate_per_month'), 'Issues / Mês');
  
  plotViolinCompleto('chart-issues-violin', [
    {label: 'Issues/mês (Pré)', data: extrairArray(d, 'pre_issue_rate_per_month'), type: 'pre'},
    {label: 'Issues/mês (Pós)', data: extrairArray(d, 'pos_issue_rate_per_month'), type: 'pos'},
    {label: 'Total issues (Pré)', data: extrairArray(d, 'pre_issues'), type: 'pre'},
    {label: 'Total issues (Pós)', data: extrairArray(d, 'pos_issues'), type: 'pos'}
  ], 'Valor');

  // Boxplot puro (Sem diamante negro)
  destroy('chart-mttr-box');
  const ctxMttr = document.getElementById('chart-mttr-box').getContext('2d');
  estado.graficos['chart-mttr-box'] = new Chart(ctxMttr, {
    type: 'boxplot',
    data: {
      labels: ['MTTR (horas)'],
      datasets: [
        { label: 'Pré-IA', data: [extrairArray(d, 'pre_avg_resolution_hours')], backgroundColor: CORES.preBg, borderColor: '#475569' },
        { label: 'Pós-IA', data: [extrairArray(d, 'pos_avg_resolution_hours')], backgroundColor: CORES.posBg, borderColor: '#475569' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { type: 'logarithmic', title: { display: true, text: 'Horas (escala log)' } } } }
  });

  // Q2
  plotViolinCompleto('chart-fix-violin', [{label: '% Fix (Pré)', data: extrairArray(d, 'pre_fix_percent'), type: 'pre'}, {label: '% Fix (Pós)', data: extrairArray(d, 'pos_fix_percent'), type: 'pos'}], '% Fix');
  plotViolinCompleto('chart-revert-violin', [{label: '% Revert (Pré)', data: extrairArray(d, 'pre_revert_percent'), type: 'pre'}, {label: '% Revert (Pós)', data: extrairArray(d, 'pos_revert_percent'), type: 'pos'}], '% Revert');
  plotViolinCompleto('chart-total-commits-violin', [{label: 'Commits (Pré)', data: extrairArray(d, 'pre_commits'), type: 'pre'}, {label: 'Commits (Pós)', data: extrairArray(d, 'pos_commits'), type: 'pos'}], 'Commits');

  // Q3
  plotViolinCompleto('chart-verb-violin', [{label: 'Linhas/commit (Pré)', data: extrairArray(d, 'pre_avg_lines_changed'), type: 'pre'}, {label: 'Linhas/commit (Pós)', data: extrairArray(d, 'pos_avg_lines_changed'), type: 'pos'}], 'Valor');
  plotKDE('chart-kde-cc', extrairArray(d, 'pre_avg_cc'), extrairArray(d, 'pos_avg_cc'), 'Índice Radon (CC)');

  plotViolinCompleto('chart-cc-violin', [
    {label: 'CC média (Pré)', data: extrairArray(d, 'pre_avg_cc'), type: 'pre'},
    {label: 'CC média (Pós)', data: extrairArray(d, 'pos_avg_cc'), type: 'pos'},
    {label: 'CC mediana (Pré)', data: extrairArray(d, 'pre_median_cc'), type: 'pre'},
    {label: 'CC mediana (Pós)', data: extrairArray(d, 'pos_median_cc'), type: 'pos'}
  ], 'Valor');

  plotViolinCompleto('chart-mi-violin', [
    {label: 'MI médio (Pré)', data: extrairArray(d, 'pre_avg_mi'), type: 'pre'},
    {label: 'MI médio (Pós)', data: extrairArray(d, 'pos_avg_mi'), type: 'pos'},
    {label: 'MI mediano (Pré)', data: extrairArray(d, 'pre_median_mi'), type: 'pre'},
    {label: 'MI mediano (Pós)', data: extrairArray(d, 'pos_median_mi'), type: 'pos'}
  ], 'Valor');

  // SÍNTESE
  destroy('chart-sintese');
  const pct = (preCol, posCol) => { const pm=media(extrairArray(d,preCol)), psm=media(extrairArray(d,posCol)); return pm?((psm-pm)/pm)*100:0; };
  const labels = ['MTTR', 'Issues/mês', '% Fix', '% Revert', 'Linhas/Commit', 'MI Médio', 'CC Média'];
  const values = [pct('pre_avg_resolution_hours','pos_avg_resolution_hours'), pct('pre_issue_rate_per_month','pos_issue_rate_per_month'), pct('pre_fix_percent','pos_fix_percent'), pct('pre_revert_percent','pos_revert_percent'), pct('pre_avg_lines_changed','pos_avg_lines_changed'), pct('pre_avg_mi','pos_avg_mi'), pct('pre_avg_cc','pos_avg_cc')];
  
  estado.graficos['chart-sintese'] = new Chart(document.getElementById('chart-sintese').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Variação Média (%)', data: values, backgroundColor: values.map(v => v>0?CORES.green:CORES.red), borderRadius: 4 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: {display: false}, tooltip: { callbacks: { label: c => ` ${c.parsed.x>0?'+':''}${c.parsed.x.toFixed(1)}%` } } } }
  });
}

document.addEventListener('DOMContentLoaded', carregarCSV);