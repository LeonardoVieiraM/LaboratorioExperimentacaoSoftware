/**
 * app.js — Dashboard Executivo: Impacto de Assistentes de IA na Manutenibilidade de Código
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * Estrutura:
 *   1. Configuração e Constantes
 *   2. Estado Global da Aplicação
 *   3. Carregamento do CSV (PapaParse)
 *   4. Lógica de Filtragem
 *   5. Cálculo de Métricas e KPIs
 *   6. Renderização dos Gráficos (Chart.js)
 *   7. Renderização da Tabela de Dados
 *   8. Inicialização dos Filtros (Sliders)
 *   9. Busca na Tabela e Ordenação
 *  10. Inicialização Geral
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   1. CONFIGURAÇÃO E CONSTANTES
══════════════════════════════════════════════════════════ */

/** Caminho para o arquivo CSV (deve estar na mesma pasta) */
const CSV_PATH = 'analise_impacto_ia.csv';

/** Paleta de cores padronizada para todos os gráficos */
const CORES = {
  pre:        '#60A5FA',   // Azul — período Pré-IA
  pos:        '#A78BFA',   // Violeta — período Pós-IA
  preBg:      'rgba(96,165,250,0.15)',
  posBg:      'rgba(167,139,250,0.15)',
  positivo:   '#10B981',   // Verde — melhoria
  negativo:   '#EF4444',   // Vermelho — piora
  neutro:     '#94A3B8',
  texto:      '#0F172A',
  grade:      'rgba(0,0,0,0.05)',
  amber:      '#F59E0B',
  pink:       '#EC4899',
};

/** Configuração padrão de plugins para os gráficos Chart.js */
const CONFIG_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600, easing: 'easeInOutCubic' },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0F1120',
      titleColor: '#F1F5F9',
      bodyColor: '#CBD5E1',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      padding: 12,
      cornerRadius: 10,
      titleFont: { family: "'Space Grotesk', sans-serif", weight: '600', size: 13 },
      bodyFont:  { family: "'Inter', sans-serif", size: 12 },
    },
  },
  scales: {
    x: {
      grid: { color: CORES.grade, drawBorder: false },
      ticks: { color: '#475569', font: { family: "'Inter', sans-serif", size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: CORES.grade, drawBorder: false },
      ticks: { color: '#475569', font: { family: "'Inter', sans-serif", size: 11 } },
      border: { display: false },
    },
  },
};

/* ══════════════════════════════════════════════════════════
   2. ESTADO GLOBAL DA APLICAÇÃO
══════════════════════════════════════════════════════════ */

/** Estado centralizado da aplicação */
const estado = {
  /** Todos os dados carregados do CSV */
  dadosCompletos: [],
  /** Dados atualmente visíveis após filtragem */
  dadosFiltrados: [],
  /** Instâncias dos gráficos Chart.js (para atualização) */
  graficos: {
    mttr: null,
    linhas: null,
    fixRevert: null,
    divergencia: null,
    mi: null,
  },
  /**
   * Limites reais dos dados (calculados após carregar o CSV).
   * Usados para garantir que os filtros abranjam 100% da amostra ao serem limpos.
   */
  limites: {
    starsMin: 0,
    starsMax: 250000,
    ageMin: 0,
    ageMax: 20,
    aiMin: 0,
    aiMax: 15,
  },
  /** Configuração atual dos filtros */
  filtros: {
    starsMin: 0,
    starsMax: 250000,
    ageMin: 0,
    ageMax: 20,
    aiMin: 0,
    aiMax: 15,
  },
  /** Estado da tabela */
  tabela: {
    busca: '',
    colunaOrdem: null,
    ordemAsc: true,
  },
};

/* ══════════════════════════════════════════════════════════
   3. CARREGAMENTO DO CSV
══════════════════════════════════════════════════════════ */

/**
 * Carrega o CSV usando PapaParse e inicializa o dashboard.
 * Trata erros de carregamento exibindo uma mensagem amigável.
 */
function carregarCSV() {
  Papa.parse(CSV_PATH, {
    download: true,
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true, // Converte números automaticamente
    complete: (resultados) => {
      // Filtra linhas completamente vazias
      const dadosValidos = resultados.data.filter(row =>
        row.repository && row.repository.trim() !== ''
      );
      estado.dadosCompletos = dadosValidos;
      estado.dadosFiltrados = [...dadosValidos];

      // ── Calcula limites reais dos dados para garantir filtros corretos ──
      calcularLimitesReais(dadosValidos);

      // Remove o overlay de loading
      const overlay = document.getElementById('loading-overlay');
      overlay.classList.add('hidden');

      // Atualiza o status no header
      const statusDot = document.getElementById('status-dot');
      statusDot.classList.add('loaded');
      document.getElementById('status-label').textContent = `${dadosValidos.length} repositórios carregados`;
      document.getElementById('total-repos-header').textContent = dadosValidos.length;

      // Inicializa o dashboard com todos os dados
      atualizarDashboard();
    },
    error: (erro) => {
      console.error('[CSV Erro]:', erro);
      document.getElementById('loading-overlay').innerHTML = `
        <div style="text-align:center;color:#FCA5A5;font-family:'Inter',sans-serif">
          <p style="font-size:20px;font-weight:700;margin-bottom:10px">⚠ Erro ao carregar o CSV</p>
          <p style="font-size:14px;opacity:0.8">Certifique-se que <code style="background:rgba(255,255,255,0.1);padding:2px 6px;border-radius:4px">analise_impacto_ia.csv</code> está na mesma pasta que o <code>index.html</code>.</p>
          <p style="font-size:12px;margin-top:12px;opacity:0.5">Use um servidor local (Live Server no VS Code) para abrir o dashboard.</p>
        </div>`;
    },
  });
}

/* ══════════════════════════════════════════════════════════
   3b. CÁLCULO DINÂMICO DOS LIMITES DOS FILTROS
══════════════════════════════════════════════════════════ */

/**
 * Calcula os valores mínimos e máximos reais de cada campo de filtro
 * a partir dos dados carregados. Isso garante que ao limpar os filtros,
 * TODOS os 105 repositórios sejam exibidos (sem exclusão por hardcode).
 *
 * @param {Array} dados - Array completo de dados do CSV
 */
function calcularLimitesReais(dados) {
  const vals = (col) => dados
    .map(r => numValido(r[col]))
    .filter(v => !isNaN(v) && isFinite(v) && v > 0);

  const starsArr = vals('stars');
  const ageArr   = vals('age_years');
  const aiArr    = vals('ai_score');

  // Arredonda o máximo para cima para garantir que todos os valores sejam incluídos
  const maxStars = starsArr.length ? Math.ceil(Math.max(...starsArr) / 1000) * 1000 : 250000;
  const maxAge   = ageArr.length   ? Math.ceil(Math.max(...ageArr))              : 20;
  const maxAI    = aiArr.length    ? Math.ceil(Math.max(...aiArr))               : 15;

  estado.limites = {
    starsMin: 0,
    starsMax: maxStars,
    ageMin:   0,
    ageMax:   maxAge,
    aiMin:    0,
    aiMax:    maxAI,
  };

  // Aplica os limites reais como estado inicial dos filtros
  estado.filtros = { ...estado.limites };

  // Atualiza os atributos max dos sliders no DOM
  atualizarAtributosSliders();
}

/**
 * Atualiza os atributos max dos elementos <input type="range">
 * para refletir os limites reais calculados a partir dos dados.
 */
function atualizarAtributosSliders() {
  const { starsMax, ageMax, aiMax } = estado.limites;

  // Stars
  document.getElementById('stars-min').max = starsMax;
  document.getElementById('stars-max').max = starsMax;
  document.getElementById('stars-max').value = starsMax;
  document.getElementById('stars-min').value = 0;

  // Age
  document.getElementById('age-min').max = ageMax;
  document.getElementById('age-max').max = ageMax;
  document.getElementById('age-max').value = ageMax;
  document.getElementById('age-min').value = 0;

  // AI Score
  document.getElementById('ai-min').max = aiMax;
  document.getElementById('ai-max').max = aiMax;
  document.getElementById('ai-max').value = aiMax;
  document.getElementById('ai-min').value = 0;

  atualizarDisplaysFiltros();
}

/* ══════════════════════════════════════════════════════════
   4. LÓGICA DE FILTRAGEM
══════════════════════════════════════════════════════════ */

/**
 * Aplica os filtros ativos sobre os dados completos e
 * dispara a re-renderização de KPIs, gráficos e tabela.
 */
function aplicarFiltros() {
  const { starsMin, starsMax, ageMin, ageMax, aiMin, aiMax } = estado.filtros;

  estado.dadosFiltrados = estado.dadosCompletos.filter(row => {
    const stars = numValido(row.stars);
    const age   = numValido(row.age_years);
    const ai    = numValido(row.ai_score);
    return (
      stars >= starsMin && stars <= starsMax &&
      age   >= ageMin   && age   <= ageMax   &&
      ai    >= aiMin    && ai    <= aiMax
    );
  });

  atualizarDashboard();
}

/**
 * Reseta todos os filtros para os valores padrão e re-aplica.
 */
function limparFiltros() {
  // Reseta os valores no estado usando os LIMITES REAIS dos dados
  // (não valores hardcoded que podem não cobrir todos os repositórios)
  estado.filtros = { ...estado.limites };

  // Reseta os inputs dos sliders para os limites reais
  document.getElementById('stars-min').value = estado.limites.starsMin;
  document.getElementById('stars-max').value = estado.limites.starsMax;
  document.getElementById('age-min').value   = estado.limites.ageMin;
  document.getElementById('age-max').value   = estado.limites.ageMax;
  document.getElementById('ai-min').value    = estado.limites.aiMin;
  document.getElementById('ai-max').value    = estado.limites.aiMax;

  // Atualiza displays e faixas de preenchimento
  atualizarDisplaysFiltros();
  aplicarFiltros();
}

/* ══════════════════════════════════════════════════════════
   5. CÁLCULO DE MÉTRICAS E KPIs
══════════════════════════════════════════════════════════ */

/**
 * Calcula a média de uma coluna numérica, ignorando valores nulos/NaN.
 * @param {Array}  dados  - Array de objetos (linhas do CSV)
 * @param {string} coluna - Nome da coluna a calcular
 * @returns {number} Média calculada, ou 0 se não houver dados válidos
 */
function media(dados, coluna) {
  const valoresValidos = dados
    .map(row => numValido(row[coluna]))
    .filter(v => !isNaN(v) && isFinite(v) && v !== null);

  if (valoresValidos.length === 0) return 0;
  return valoresValidos.reduce((acc, v) => acc + v, 0) / valoresValidos.length;
}

/**
 * Converte um valor para número, retornando 0 se inválido.
 * @param {*} v - Valor a converter
 * @returns {number}
 */
function numValido(v) {
  const n = parseFloat(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

/**
 * Formata um número de horas de forma legível.
 * @param {number} h - Horas
 * @returns {string}
 */
function formatarHoras(h) {
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k h`;
  return `${h.toFixed(0)} h`;
}

/**
 * Calcula e renderiza todos os KPIs com base na amostra filtrada.
 */
function renderizarKPIs() {
  const d = estado.dadosFiltrados;
  const n = d.length;

  // ── KPI 1: Tamanho da Amostra ──
  document.getElementById('kpi-sample-value').textContent = n;
  document.getElementById('kpi-sample-sub').textContent =
    `de ${estado.dadosCompletos.length} repositórios totais`;

  // ── KPI 2: Variação do MTTR ──
  const mttrPre = media(d, 'pre_avg_resolution_hours');
  const mttrPos = media(d, 'pos_avg_resolution_hours');
  const deltaMTTR = mttrPos - mttrPre;
  const deltaMTTRPct = mttrPre !== 0 ? ((deltaMTTR / mttrPre) * 100).toFixed(1) : '—';

  document.getElementById('kpi-mttr-value').textContent = formatarHoras(mttrPos);
  document.getElementById('kpi-mttr-sub').textContent =
    `Pré: ${formatarHoras(mttrPre)} → Pós: ${formatarHoras(mttrPos)}`;
  renderizarDelta('kpi-mttr-delta', deltaMTTRPct, false); // false = menor é melhor

  // ── KPI 3: Taxa de Correção Pós-IA ──
  const fixPos = media(d, 'pos_fix_percent');
  const fixPre = media(d, 'pre_fix_percent');
  const deltaFix = fixPos - fixPre;

  document.getElementById('kpi-fix-value').textContent = `${fixPos.toFixed(1)}%`;
  document.getElementById('kpi-fix-sub').textContent =
    `Pré: ${fixPre.toFixed(1)}% → Pós: ${fixPos.toFixed(1)}%`;
  renderizarDelta('kpi-fix-delta', deltaFix.toFixed(1), false); // Mais fix = pior

  // ── KPI 4: Variação do MI ──
  const miPre = media(d, 'pre_avg_mi');
  const miPos = media(d, 'pos_avg_mi');
  const deltaMI = miPos - miPre;

  document.getElementById('kpi-mi-value').textContent = miPos.toFixed(1);
  document.getElementById('kpi-mi-sub').textContent =
    `Pré: ${miPre.toFixed(1)} → Pós: ${miPos.toFixed(1)}`;
  renderizarDelta('kpi-mi-delta', `${deltaMI >= 0 ? '+' : ''}${deltaMI.toFixed(2)}`, true); // Mais MI = melhor

  // ── KPIs de estatísticas Q2 ──
  const revertPre = media(d, 'pre_revert_percent');
  const revertPos = media(d, 'pos_revert_percent');
  const issuesPos = media(d, 'pos_issues');

  const statFixEl = document.getElementById('stat-fix-val');
  const dFix = deltaFix.toFixed(1);
  statFixEl.textContent = `${dFix >= 0 ? '+' : ''}${dFix}pp`;
  statFixEl.className = `stat-value ${deltaFix > 0 ? 'negative' : 'positive'}`;

  const statRevEl = document.getElementById('stat-revert-val');
  const dRevert = (revertPos - revertPre).toFixed(2);
  statRevEl.textContent = `${dRevert >= 0 ? '+' : ''}${dRevert}pp`;
  statRevEl.className = `stat-value ${dRevert > 0 ? 'negative' : 'positive'}`;

  document.getElementById('stat-issues-val').textContent = issuesPos.toFixed(0);
}

/**
 * Renderiza o badge de delta com cor condicional.
 * @param {string}  id         - ID do elemento HTML
 * @param {string}  valor      - Valor formatado a exibir
 * @param {boolean} positivoBom - true se aumento é positivo, false se redução é positiva
 */
function renderizarDelta(id, valor, positivoBom) {
  const el = document.getElementById(id);
  if (!el || valor === '—') { if (el) el.textContent = ''; return; }

  const num = parseFloat(valor);
  const isPositivo = num > 0;

  let classe = 'kpi-delta ';
  if (positivoBom) {
    classe += isPositivo ? 'positive' : (num < 0 ? 'negative' : 'neutral');
  } else {
    classe += isPositivo ? 'negative' : (num < 0 ? 'positive' : 'neutral');
  }

  el.className = classe;
  el.textContent = `${num >= 0 ? '+' : ''}${valor}`;
}

/* ══════════════════════════════════════════════════════════
   6. RENDERIZAÇÃO DOS GRÁFICOS
══════════════════════════════════════════════════════════ */

/**
 * Ponto central: cria ou atualiza todos os gráficos.
 */
function renderizarGraficos() {
  renderizarGraficoMTTR();
  renderizarGraficoLinhas();
  renderizarGraficoFixRevert();
  renderizarGraficoDivergencia();
  renderizarGraficoMI();
}

/**
 * Utilitário: cria ou atualiza um gráfico Chart.js.
 * Se a instância já existe, ela é destruída antes de recriar
 * para garantir transições limpas.
 *
 * @param {string} chave   - Chave no objeto estado.graficos
 * @param {string} canvasId - ID do elemento <canvas>
 * @param {Object} config  - Configuração completa do Chart.js
 */
function criarOuAtualizarGrafico(chave, canvasId, config) {
  // Destrói o gráfico anterior para evitar vazamentos de memória
  if (estado.graficos[chave]) {
    estado.graficos[chave].destroy();
    estado.graficos[chave] = null;
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  estado.graficos[chave] = new Chart(ctx, config);
}

// ── Gráfico 1 (Q1): MTTR Pré vs Pós ──────────────────────
function renderizarGraficoMTTR() {
  const d = estado.dadosFiltrados;

  // Ordena por MTTR Pós decrescente para melhor visualização
  const ordenados = [...d].sort((a, b) =>
    numValido(b.pos_avg_resolution_hours) - numValido(a.pos_avg_resolution_hours)
  ).slice(0, 40); // Limita a 40 repos para legibilidade

  // Extrai apenas o nome curto do repositório (ex: "Python" de "TheAlgorithms/Python")
  const labels = ordenados.map(r => {
    const partes = (r.repository || '').split('/');
    return partes.length > 1 ? partes[1] : r.repository;
  });

  const preData = ordenados.map(r => numValido(r.pre_avg_resolution_hours));
  const posData = ordenados.map(r => numValido(r.pos_avg_resolution_hours));

  criarOuAtualizarGrafico('mttr', 'chart-mttr', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pré-IA (horas)',
          data: preData,
          backgroundColor: CORES.preBg,
          borderColor: CORES.pre,
          borderWidth: 1.5,
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Pós-IA (horas)',
          data: posData,
          backgroundColor: CORES.posBg,
          borderColor: CORES.pos,
          borderWidth: 1.5,
          borderRadius: 4,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...CONFIG_DEFAULTS,
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#475569',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 12, boxHeight: 12, borderRadius: 4, padding: 16,
          },
        },
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} horas`,
          },
        },
      },
      scales: {
        x: {
          ...CONFIG_DEFAULTS.scales.x,
          ticks: {
            ...CONFIG_DEFAULTS.scales.x.ticks,
            maxRotation: 45,
            minRotation: 30,
            font: { size: 9 },
          },
        },
        y: {
          ...CONFIG_DEFAULTS.scales.y,
          type: 'logarithmic', // Escala log para melhor visualização com outliers
          ticks: {
            ...CONFIG_DEFAULTS.scales.y.ticks,
            callback: v => {
              if (v >= 1000) return `${(v/1000).toFixed(0)}k h`;
              return `${v} h`;
            },
          },
          title: {
            display: true,
            text: 'Horas (escala log)',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ── Gráfico 3 (Q1): Verbosidade — Linhas por Commit ──────
function renderizarGraficoLinhas() {
  const d = estado.dadosFiltrados;

  // Agrupa por decis de AI score para uma visão mais limpa
  const agrupado = agruparPorAiScore(d);

  criarOuAtualizarGrafico('linhas', 'chart-lines', {
    type: 'bar',
    data: {
      labels: agrupado.labels,
      datasets: [
        {
          label: 'Pré-IA',
          data: agrupado.pre_lines,
          backgroundColor: CORES.preBg,
          borderColor: CORES.pre,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Pós-IA',
          data: agrupado.pos_lines,
          backgroundColor: CORES.posBg,
          borderColor: CORES.pos,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...CONFIG_DEFAULTS,
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#475569',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 12, boxHeight: 12, borderRadius: 4, padding: 16,
          },
        },
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} linhas`,
          },
        },
      },
      scales: {
        x: {
          ...CONFIG_DEFAULTS.scales.x,
          title: {
            display: true,
            text: 'Grupo de AI Score',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
        y: {
          ...CONFIG_DEFAULTS.scales.y,
          title: {
            display: true,
            text: 'Avg Linhas / Commit',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

// ── Gráfico 2 (Q2): Fix% e Revert% Agrupados ─────────────
function renderizarGraficoFixRevert() {
  const d = estado.dadosFiltrados;

  const mediaPre_fix    = media(d, 'pre_fix_percent');
  const mediaPos_fix    = media(d, 'pos_fix_percent');
  const mediaPre_revert = media(d, 'pre_revert_percent');
  const mediaPos_revert = media(d, 'pos_revert_percent');

  criarOuAtualizarGrafico('fixRevert', 'chart-fix-revert', {
    type: 'bar',
    data: {
      labels: ['% Fix (Correções)', '% Revert (Reversões)'],
      datasets: [
        {
          label: 'Pré-IA',
          data: [mediaPre_fix, mediaPre_revert],
          backgroundColor: CORES.preBg,
          borderColor: CORES.pre,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        },
        {
          label: 'Pós-IA',
          data: [mediaPos_fix, mediaPos_revert],
          backgroundColor: CORES.posBg,
          borderColor: CORES.pos,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...CONFIG_DEFAULTS,
      indexAxis: 'y', // Barras horizontais para melhor leitura
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#475569',
            font: { family: "'Inter', sans-serif", size: 12 },
            boxWidth: 14, boxHeight: 14, borderRadius: 4, padding: 20,
          },
        },
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.x.toFixed(2)}%`,
          },
        },
      },
      scales: {
        x: {
          ...CONFIG_DEFAULTS.scales.x,
          ticks: {
            ...CONFIG_DEFAULTS.scales.x.ticks,
            callback: v => `${v.toFixed(1)}%`,
          },
          title: {
            display: true,
            text: 'Percentual (%)',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
        y: {
          ...CONFIG_DEFAULTS.scales.y,
          ticks: {
            ...CONFIG_DEFAULTS.scales.y.ticks,
            font: { size: 13 },
          },
        },
      },
    },
  });
}

// ── Gráfico 4 (Resumo Global): Divergência de Métricas ───
function renderizarGraficoDivergencia() {
  const d = estado.dadosFiltrados;

  /**
   * Calcula variação percentual (Pós − Pré) / Pré × 100
   */
  const pct = (pre, pos) => {
    if (pre === 0) return 0;
    return ((pos - pre) / Math.abs(pre)) * 100;
  };

  // Define as métricas e se "positivo" é bom (+1) ou ruim (-1)
  const metricas = [
    {
      label: 'Tempo de Resolução (MTTR)',
      pre: media(d, 'pre_avg_resolution_hours'),
      pos: media(d, 'pos_avg_resolution_hours'),
      positivoBom: false, // Menos horas = melhor
      unidade: 'h',
    },
    {
      label: 'Taxa de Correção (Fix%)',
      pre: media(d, 'pre_fix_percent'),
      pos: media(d, 'pos_fix_percent'),
      positivoBom: false, // Mais bugs corrigidos indica mais bugs
      unidade: '%',
    },
    {
      label: 'Taxa de Reversão (Revert%)',
      pre: media(d, 'pre_revert_percent'),
      pos: media(d, 'pos_revert_percent'),
      positivoBom: false,
      unidade: '%',
    },
    {
      label: 'Verbosidade (Linhas/Commit)',
      pre: media(d, 'pre_avg_lines_changed'),
      pos: media(d, 'pos_avg_lines_changed'),
      positivoBom: null, // Neutro — depende do contexto
      unidade: '',
    },
    {
      label: 'Índice de Manutenibilidade (MI)',
      pre: media(d, 'pre_avg_mi'),
      pos: media(d, 'pos_avg_mi'),
      positivoBom: true, // Mais MI = mais fácil de manter
      unidade: '',
    },
    {
      label: 'Taxa de Issues por Mês',
      pre: media(d, 'pre_issue_rate_per_month'),
      pos: media(d, 'pos_issue_rate_per_month'),
      positivoBom: null,
      unidade: '/mês',
    },
    {
      label: 'Número de Commits',
      pre: media(d, 'pre_commits'),
      pos: media(d, 'pos_commits'),
      positivoBom: true, // Mais commits = mais atividade (positivo)
      unidade: '',
    },
    {
      label: 'Número de Issues',
      pre: media(d, 'pre_issues'),
      pos: media(d, 'pos_issues'),
      positivoBom: null,
      unidade: '',
    },
  ];

  const valores    = metricas.map(m => pct(m.pre, m.pos));
  const labels     = metricas.map(m => m.label);
  const backgrounds = metricas.map((m, i) => {
    const v = valores[i];
    if (m.positivoBom === null) return 'rgba(148,163,184,0.3)';
    if (m.positivoBom) {
      return v > 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
    } else {
      return v < 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
    }
  });
  const bordas = metricas.map((m, i) => {
    const v = valores[i];
    if (m.positivoBom === null) return '#94A3B8';
    if (m.positivoBom) {
      return v > 0 ? CORES.positivo : CORES.negativo;
    } else {
      return v < 0 ? CORES.positivo : CORES.negativo;
    }
  });

  criarOuAtualizarGrafico('divergencia', 'chart-divergence', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Variação % (Pós vs Pré)',
        data: valores,
        backgroundColor: backgrounds,
        borderColor: bordas,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      ...CONFIG_DEFAULTS,
      indexAxis: 'y',
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              const m = metricas[ctx.dataIndex];
              const sinal = v >= 0 ? '+' : '';
              return [
                ` Variação: ${sinal}${v.toFixed(2)}%`,
                ` Pré-IA: ${m.pre.toFixed(1)}${m.unidade}`,
                ` Pós-IA: ${m.pos.toFixed(1)}${m.unidade}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ...CONFIG_DEFAULTS.scales.x,
          ticks: {
            ...CONFIG_DEFAULTS.scales.x.ticks,
            callback: v => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`,
          },
          title: {
            display: true,
            text: 'Variação Percentual (Pós vs Pré)',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
        y: {
          ...CONFIG_DEFAULTS.scales.y,
          ticks: {
            ...CONFIG_DEFAULTS.scales.y.ticks,
            font: { size: 11 },
          },
        },
      },
      // Adiciona linha de referência em zero
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        annotation: undefined,
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              const m = metricas[ctx.dataIndex];
              const sinal = v >= 0 ? '+' : '';
              return [
                ` Variação: ${sinal}${v.toFixed(2)}%`,
                ` Pré-IA: ${m.pre.toFixed(1)}${m.unidade}`,
                ` Pós-IA: ${m.pos.toFixed(1)}${m.unidade}`,
              ];
            },
          },
        },
      },
    },
  });
}

// ── Gráfico MI: Scatter Pré vs Pós ────────────────────────
function renderizarGraficoMI() {
  const d = estado.dadosFiltrados;

  // Scatter: eixo X = MI Pré, eixo Y = MI Pós
  // Linha diagonal (x=y) indica sem mudança
  const pontos = d
    .filter(r => numValido(r.pre_avg_mi) > 0 && numValido(r.pos_avg_mi) > 0)
    .map(r => ({
      x: numValido(r.pre_avg_mi),
      y: numValido(r.pos_avg_mi),
      repo: r.repository,
      score: numValido(r.ai_score),
    }));

  // Linha de referência (Pré = Pós)
  const allMI = pontos.map(p => p.x).concat(pontos.map(p => p.y));
  const minMI = Math.max(0, Math.min(...allMI) - 5);
  const maxMI = Math.min(110, Math.max(...allMI) + 5);

  // Cor dos pontos baseada no AI Score
  const pontosCores = pontos.map(p => {
    if (p.score >= 8) return CORES.pink;
    if (p.score >= 4) return CORES.pos;
    return CORES.pre;
  });

  criarOuAtualizarGrafico('mi', 'chart-mi', {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Repositório',
          data: pontos,
          backgroundColor: pontos.map((p, i) => pontosCores[i] + '99'),
          borderColor:     pontosCores,
          borderWidth: 1.5,
          pointRadius: 5,
          pointHoverRadius: 8,
        },
        {
          // Linha de referência diagonal (sem mudança)
          label: 'Sem mudança (Pré = Pós)',
          data: [{ x: minMI, y: minMI }, { x: maxMI, y: maxMI }],
          type: 'line',
          borderColor: 'rgba(148,163,184,0.5)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      ...CONFIG_DEFAULTS,
      plugins: {
        ...CONFIG_DEFAULTS.plugins,
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#475569',
            font: { family: "'Inter', sans-serif", size: 11 },
            boxWidth: 12, boxHeight: 12, borderRadius: 4, padding: 16,
            filter: item => item.text !== 'Repositório',
          },
        },
        tooltip: {
          ...CONFIG_DEFAULTS.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.label === 'Sem mudança (Pré = Pós)') return null;
              const p = pontos[ctx.dataIndex];
              return [
                ` ${p.repo}`,
                ` MI Pré: ${ctx.parsed.x.toFixed(2)}`,
                ` MI Pós: ${ctx.parsed.y.toFixed(2)}`,
                ` AI Score: ${p.score}`,
              ];
            },
          },
        },
      },
      scales: {
        x: {
          ...CONFIG_DEFAULTS.scales.x,
          min: minMI,
          max: maxMI,
          title: {
            display: true,
            text: 'MI Pré-IA',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
        y: {
          ...CONFIG_DEFAULTS.scales.y,
          min: minMI,
          max: maxMI,
          title: {
            display: true,
            text: 'MI Pós-IA',
            color: '#94A3B8',
            font: { size: 11 },
          },
        },
      },
    },
  });
}

/* ══════════════════════════════════════════════════════════
   7. RENDERIZAÇÃO DA TABELA DE DADOS
══════════════════════════════════════════════════════════ */

/**
 * Renderiza a tabela de repositórios com base na amostra filtrada.
 * Suporta busca textual e ordenação por coluna.
 */
function renderizarTabela() {
  const { busca, colunaOrdem, ordemAsc } = estado.tabela;

  // Filtra por busca textual
  let dados = estado.dadosFiltrados.filter(r =>
    !busca || (r.repository || '').toLowerCase().includes(busca.toLowerCase())
  );

  // Ordena se houver coluna selecionada
  if (colunaOrdem) {
    dados = [...dados].sort((a, b) => {
      const va = numValido(a[colunaOrdem]);
      const vb = numValido(b[colunaOrdem]);
      return ordemAsc ? va - vb : vb - va;
    });
  }

  const tbody = document.getElementById('table-body');
  document.getElementById('table-count').textContent = `${dados.length} repositórios`;

  tbody.innerHTML = dados.map(r => {
    const repo    = r.repository || '';
    const repoURL = `https://github.com/${repo}`;
    const stars   = numValido(r.stars);
    const age     = numValido(r.age_years);
    const aiScore = numValido(r.ai_score);

    const mttrPre = numValido(r.pre_avg_resolution_hours);
    const mttrPos = numValido(r.pos_avg_resolution_hours);
    const fixPre  = numValido(r.pre_fix_percent);
    const fixPos  = numValido(r.pos_fix_percent);
    const miPre   = numValido(r.pre_avg_mi);
    const miPos   = numValido(r.pos_avg_mi);
    const deltaMI = miPos - miPre;

    // Classe do badge de AI Score
    let aiClass = 'ai-score-low';
    if (aiScore >= 8) aiClass = 'ai-score-high';
    else if (aiScore >= 4) aiClass = 'ai-score-medium';

    // Classe do delta MI
    const deltaMIClass = deltaMI > 0 ? 'delta-positive' : (deltaMI < 0 ? 'delta-negative' : '');

    return `
      <tr>
        <td>
          <div class="repo-chip">
            <a href="${repoURL}" target="_blank" rel="noopener noreferrer" title="${repo}">
              ${repo}
            </a>
          </div>
        </td>
        <td>${stars.toLocaleString('pt-BR')}</td>
        <td>${age.toFixed(1)} a</td>
        <td><span class="ai-score-badge ${aiClass}">${aiScore}</span></td>
        <td>${formatarHoras(mttrPre)}</td>
        <td>${formatarHoras(mttrPos)}</td>
        <td>${fixPre.toFixed(1)}%</td>
        <td>${fixPos.toFixed(1)}%</td>
        <td>${miPre.toFixed(1)}</td>
        <td>${miPos.toFixed(1)}</td>
        <td class="${deltaMIClass}">${deltaMI >= 0 ? '+' : ''}${deltaMI.toFixed(2)}</td>
      </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   8. INICIALIZAÇÃO DOS FILTROS (SLIDERS)
══════════════════════════════════════════════════════════ */

/**
 * Atualiza os textos de exibição dos sliders e as faixas de preenchimento.
 */
function atualizarDisplaysFiltros() {
  const L = estado.limites;

  // Stars
  const starsMin = parseInt(document.getElementById('stars-min').value);
  const starsMax = parseInt(document.getElementById('stars-max').value);
  document.getElementById('stars-min-display').textContent =
    starsMin >= 1000 ? `${(starsMin/1000).toFixed(0)}k` : starsMin;
  document.getElementById('stars-max-display').textContent =
    starsMax >= 1000 ? `${(starsMax/1000).toFixed(0)}k` : starsMax;
  atualizarFaixaSlider('stars-fill', 'stars-min', 'stars-max', L.starsMin, L.starsMax);

  // Age
  const ageMin = parseFloat(document.getElementById('age-min').value);
  const ageMax = parseFloat(document.getElementById('age-max').value);
  document.getElementById('age-min-display').textContent = ageMin;
  document.getElementById('age-max-display').textContent = ageMax;
  atualizarFaixaSlider('age-fill', 'age-min', 'age-max', L.ageMin, L.ageMax);

  // AI Score
  const aiMin = parseInt(document.getElementById('ai-min').value);
  const aiMax = parseInt(document.getElementById('ai-max').value);
  document.getElementById('ai-min-display').textContent = aiMin;
  document.getElementById('ai-max-display').textContent = aiMax;
  atualizarFaixaSlider('ai-fill', 'ai-min', 'ai-max', L.aiMin, L.aiMax);
}

/**
 * Posiciona o preenchimento de cor no track do slider duplo.
 */
function atualizarFaixaSlider(fillId, minId, maxId, absMin, absMax) {
  const fill = document.getElementById(fillId);
  const minEl = document.getElementById(minId);
  const maxEl = document.getElementById(maxId);

  if (!fill || !minEl || !maxEl) return;

  const intervalo = absMax - absMin;
  const leftPct   = ((parseFloat(minEl.value) - absMin) / intervalo) * 100;
  const rightPct  = ((parseFloat(maxEl.value) - absMin) / intervalo) * 100;

  fill.style.left  = `${leftPct}%`;
  fill.style.width = `${rightPct - leftPct}%`;
}

/**
 * Configura todos os event listeners dos sliders de filtro.
 */
function inicializarFiltros() {
  // ── Stars ──
  const starsMinEl = document.getElementById('stars-min');
  const starsMaxEl = document.getElementById('stars-max');

  starsMinEl.addEventListener('input', () => {
    if (parseInt(starsMinEl.value) > parseInt(starsMaxEl.value)) {
      starsMinEl.value = starsMaxEl.value;
    }
    estado.filtros.starsMin = parseInt(starsMinEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  starsMaxEl.addEventListener('input', () => {
    if (parseInt(starsMaxEl.value) < parseInt(starsMinEl.value)) {
      starsMaxEl.value = starsMinEl.value;
    }
    estado.filtros.starsMax = parseInt(starsMaxEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  // ── Age ──
  const ageMinEl = document.getElementById('age-min');
  const ageMaxEl = document.getElementById('age-max');

  ageMinEl.addEventListener('input', () => {
    if (parseFloat(ageMinEl.value) > parseFloat(ageMaxEl.value)) {
      ageMinEl.value = ageMaxEl.value;
    }
    estado.filtros.ageMin = parseFloat(ageMinEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  ageMaxEl.addEventListener('input', () => {
    if (parseFloat(ageMaxEl.value) < parseFloat(ageMinEl.value)) {
      ageMaxEl.value = ageMinEl.value;
    }
    estado.filtros.ageMax = parseFloat(ageMaxEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  // ── AI Score ──
  const aiMinEl = document.getElementById('ai-min');
  const aiMaxEl = document.getElementById('ai-max');

  aiMinEl.addEventListener('input', () => {
    if (parseInt(aiMinEl.value) > parseInt(aiMaxEl.value)) {
      aiMinEl.value = aiMaxEl.value;
    }
    estado.filtros.aiMin = parseInt(aiMinEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  aiMaxEl.addEventListener('input', () => {
    if (parseInt(aiMaxEl.value) < parseInt(aiMinEl.value)) {
      aiMaxEl.value = aiMinEl.value;
    }
    estado.filtros.aiMax = parseInt(aiMaxEl.value);
    atualizarDisplaysFiltros();
    aplicarFiltros();
  });

  // ── Botão Limpar ──
  document.getElementById('btn-clear-filters').addEventListener('click', limparFiltros);

  // Inicializa displays
  atualizarDisplaysFiltros();
}

/* ══════════════════════════════════════════════════════════
   9. BUSCA NA TABELA E ORDENAÇÃO
══════════════════════════════════════════════════════════ */

/**
 * Configura o campo de busca e os cabeçalhos ordenáveis da tabela.
 */
function inicializarTabela() {
  // ── Campo de busca ──
  document.getElementById('table-search').addEventListener('input', (e) => {
    estado.tabela.busca = e.target.value;
    renderizarTabela();
  });

  // ── Cabeçalhos ordenáveis ──
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (estado.tabela.colunaOrdem === col) {
        estado.tabela.ordemAsc = !estado.tabela.ordemAsc;
      } else {
        estado.tabela.colunaOrdem = col;
        estado.tabela.ordemAsc    = false; // Começa decrescente
      }

      // Atualiza classes de ordenação nos cabeçalhos
      document.querySelectorAll('.data-table th.sortable').forEach(t => {
        t.classList.remove('sort-asc', 'sort-desc');
        t.setAttribute('aria-sort', 'none');
      });
      th.classList.add(estado.tabela.ordemAsc ? 'sort-asc' : 'sort-desc');
      th.setAttribute('aria-sort', estado.tabela.ordemAsc ? 'ascending' : 'descending');

      renderizarTabela();
    });
  });
}

/* ══════════════════════════════════════════════════════════
   UTILITÁRIOS EXTRAS
══════════════════════════════════════════════════════════ */

/**
 * Agrupa os dados por faixas de AI Score para o gráfico de verbosidade.
 * @param {Array} dados
 * @returns {{ labels, pre_lines, pos_lines }}
 */
function agruparPorAiScore(dados) {
  const grupos = {
    '1–3 (Baixo)':    { pre: [], pos: [] },
    '4–6 (Médio)':    { pre: [], pos: [] },
    '7–10 (Alto)':    { pre: [], pos: [] },
  };

  dados.forEach(r => {
    const score = numValido(r.ai_score);
    const preLn = numValido(r.pre_avg_lines_changed);
    const posLn = numValido(r.pos_avg_lines_changed);

    if (score <= 3) {
      grupos['1–3 (Baixo)'].pre.push(preLn);
      grupos['1–3 (Baixo)'].pos.push(posLn);
    } else if (score <= 6) {
      grupos['4–6 (Médio)'].pre.push(preLn);
      grupos['4–6 (Médio)'].pos.push(posLn);
    } else {
      grupos['7–10 (Alto)'].pre.push(preLn);
      grupos['7–10 (Alto)'].pos.push(posLn);
    }
  });

  const mediArr = arr => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : 0;

  return {
    labels:    Object.keys(grupos),
    pre_lines: Object.values(grupos).map(g => mediArr(g.pre)),
    pos_lines: Object.values(grupos).map(g => mediArr(g.pos)),
  };
}

/* ══════════════════════════════════════════════════════════
   ORQUESTRAÇÃO: ATUALIZAR TODO O DASHBOARD
══════════════════════════════════════════════════════════ */

/**
 * Função central de atualização — chamada sempre que os filtros mudam.
 * Recalcula KPIs, atualiza gráficos e re-renderiza a tabela.
 */
function atualizarDashboard() {
  renderizarKPIs();
  renderizarGraficos();
  renderizarTabela();
}

/* ══════════════════════════════════════════════════════════
   10. INICIALIZAÇÃO GERAL
══════════════════════════════════════════════════════════ */

/**
 * Ponto de entrada da aplicação.
 * Aguarda o DOM estar pronto, configura os listeners e carrega os dados.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Inicializa os sliders de filtro
  inicializarFiltros();

  // Inicializa a tabela (busca + ordenação)
  inicializarTabela();

  // Carrega o CSV e inicializa o dashboard
  carregarCSV();
});
