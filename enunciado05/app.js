/* ============================================================
   GRAPHQL vs REST DASHBOARD — app.js
   Charts chosen based on Data-to-Viz recommendations:
   • Slope chart  → paired comparison (REST→GraphQL per query)
   • Box + jitter → distribution of n=150 measurements
   • Dumbbell     → multi-query paired dot plot
   • Lollipop     → % reduction ranking (cleaner than bar)
   • Scatter      → correlation Tempo × Tamanho
   • Grouped bar  → absolute comparison per query
   ============================================================ */

// ── Color palette (light theme) ────────────────────────────────────────────
const C = {
  rest:    '#ea580c',
  restDim: 'rgba(234,88,12,0.12)',
  restBg:  'rgba(234,88,12,0.08)',
  gql:     '#7c3aed',
  gqlDim:  'rgba(124,58,237,0.12)',
  gqlBg:   'rgba(124,58,237,0.08)',
  green:   '#059669',
  red:     '#dc2626',
  blue:    '#2563eb',
  grid:    'rgba(0,0,0,0.06)',
  text:    '#64748b',
  textDark:'#1e293b',
};

const QUERY_COLORS = ['#6366f1','#ea580c','#7c3aed','#0891b2','#d97706'];

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  allData: [],
  analise: null,
  removeOutliers: false,
  selectedQueries: new Set(),
  metric: 'both',
  rawPage: 1,
  rawPageSize: 20,
  rawSearch: '',
  rawFilterQuery: '',
  rawSort: 'timestamp',
};

const charts = {};

// ── Utilities ──────────────────────────────────────────────────────────────
const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
const sum  = arr => arr.reduce((a,b)=>a+b,0);
function median(arr) {
  if (!arr.length) return 0;
  const s=[...arr].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2===0?(s[m-1]+s[m])/2:s[m];
}
function stddev(arr) {
  if (!arr.length) return 0;
  const m=mean(arr);
  return Math.sqrt(arr.reduce((a,v)=>a+Math.pow(v-m,2),0)/arr.length);
}
function percentile(arr, p) {
  if (!arr.length) return 0;
  const s=[...arr].sort((a,b)=>a-b);
  return s[Math.max(0,Math.min(Math.ceil((p/100)*s.length)-1,s.length-1))];
}
function iqrFilter(arr) {
  const q1=percentile(arr,25), q3=percentile(arr,75), iqr=q3-q1;
  return arr.filter(v=>v>=q1-1.5*iqr&&v<=q3+1.5*iqr);
}
const fmt     = (n,d=2) => Number(n).toFixed(d);
const fmtMs   = ms => `${fmt(ms,2)} ms`;
const fmtBytes = b => b<1024 ? `${fmt(b,0)} B` : `${fmt(b/1024,2)} KB`;

function destroyChart(id) { if(charts[id]){charts[id].destroy();delete charts[id];} }
function mkChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, config);
  return charts[id];
}

// Simple seeded random for reproducible jitter
function seededRand(seed) {
  let s = seed;
  return () => { s = (s*9301+49297)%233280; return s/233280; };
}

// ── Data helpers ───────────────────────────────────────────────────────────
function getFilteredData() {
  let data = state.allData.filter(d =>
    d.rest.status===200 && d.graphql.status===200 && !d.rest.erro && !d.graphql.erro
  );
  if (state.selectedQueries.size > 0)
    data = data.filter(d => state.selectedQueries.has(d.id_consulta));
  return data;
}

function getTempos(data) {
  let rest = data.map(d=>d.rest.tempo_ms);
  let gql  = data.map(d=>d.graphql.tempo_ms);
  if (state.removeOutliers) { rest=iqrFilter(rest); gql=iqrFilter(gql); }
  return {rest, gql};
}

function getTamanhos(data) {
  let rest = data.map(d=>d.rest.tamanho_bytes);
  let gql  = data.map(d=>d.graphql.tamanho_bytes);
  if (state.removeOutliers) { rest=iqrFilter(rest); gql=iqrFilter(gql); }
  return {rest, gql};
}

function groupByQuery(data) {
  const g = {};
  data.forEach(d => {
    if (!g[d.id_consulta]) {
      g[d.id_consulta] = {
        id: d.id_consulta,
        nome: d.nome_consulta,
        rest_tempos: [],
        gql_tempos: [],
        rest_tamanhos: [],
        gql_tamanhos: []
      };
    }
    g[d.id_consulta].rest_tempos.push(d.rest.tempo_ms);
    g[d.id_consulta].gql_tempos.push(d.graphql.tempo_ms);
    g[d.id_consulta].rest_tamanhos.push(d.rest.tamanho_bytes);
    g[d.id_consulta].gql_tamanhos.push(d.graphql.tamanho_bytes);
  });

  const result = Object.values(g).sort((a,b)=>a.id-b.id);

  if (state.removeOutliers) {
    result.forEach(group => {
      group.rest_tempos = iqrFilter(group.rest_tempos);
      group.gql_tempos  = iqrFilter(group.gql_tempos);
      group.rest_tamanhos = iqrFilter(group.rest_tamanhos);
      group.gql_tamanhos  = iqrFilter(group.gql_tamanhos);
    });
  }

  return result;
}

const shortName = g => g.nome.length > 22 ? g.nome.substring(0,20)+'…' : g.nome;

// ── Chart.js Defaults (light theme) ───────────────────────────────────────
Chart.defaults.color = C.text;
Chart.defaults.borderColor = C.grid;
Chart.defaults.plugins.legend.labels.boxWidth = 11;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.plugins.tooltip.backgroundColor = '#fff';
Chart.defaults.plugins.tooltip.borderColor = '#e2e8f0';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.titleColor = C.textDark;
Chart.defaults.plugins.tooltip.bodyColor = C.text;
Chart.defaults.plugins.tooltip.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';

const baseScales = {
  x: { grid:{color:C.grid}, ticks:{color:C.text, font:{size:11}} },
  y: { grid:{color:C.grid}, ticks:{color:C.text, font:{size:11}} }
};

// ── CHART BUILDERS ─────────────────────────────────────────────────────────

/**
 * SLOPE CHART (Connected dot plot)
 * Data-to-Viz: paired comparison showing direction of change
 */
function buildSlopeChart(canvasId, groups, metric='tempo', title='') {
  const labels = ['REST', 'GraphQL'];
  const datasets = groups.map((g, i) => {
    const restVal  = metric==='tempo' ? mean(g.rest_tempos)   : mean(g.rest_tamanhos);
    const gqlVal   = metric==='tempo' ? mean(g.gql_tempos)    : mean(g.gql_tamanhos);
    return {
      label: shortName(g),
      data: [restVal, gqlVal],
      borderColor: QUERY_COLORS[i],
      backgroundColor: QUERY_COLORS[i],
      borderWidth: 2.5,
      pointRadius: 7,
      pointHoverRadius: 9,
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      fill: false,
      tension: 0,
    };
  });

  return mkChart(canvasId, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 10 } },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 12, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.parsed.y;
              return ` ${ctx.dataset.label}: ${metric==='tempo' ? fmtMs(val) : fmtBytes(val)}`;
            }
          }
        }
      },
      scales: {
        x: { ...baseScales.x, grid: { display: false } },
        y: {
          ...baseScales.y,
          title: { display: true, text: metric==='tempo' ? 'Tempo (ms)' : 'Tamanho (bytes)', color: C.text, font: { size: 11 } }
        }
      }
    }
  });
}

/**
 * DUMBBELL CHART (horizontal dot plot with range line)
 * Data-to-Viz: parallel dot plot
 * Encodes direction and magnitude
 */
function buildDumbbellChart(canvasId, groups, metric='tempo') {
  const labels = groups.map(shortName);
  const restVals = groups.map(g => metric==='tempo' ? mean(g.rest_tempos) : mean(g.rest_tamanhos));
  const gqlVals  = groups.map(g => metric==='tempo' ? mean(g.gql_tempos)  : mean(g.gql_tamanhos));
  const xLabel   = metric==='tempo' ? 'Tempo (ms)' : 'Tamanho (bytes)';

  const dumbbellLinePlugin = {
    id: 'dumbbellLines_' + canvasId,
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      ctx.save();
      groups.forEach((g, i) => {
        const rv = restVals[i], gv = gqlVals[i];
        const px1 = x.getPixelForValue(rv);
        const px2 = x.getPixelForValue(gv);
        const py  = y.getPixelForValue(labels[i]); 
        
        ctx.strokeStyle = 'rgba(100,116,139,0.35)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px1, py);
        ctx.lineTo(px2, py);
        ctx.stroke();
      });
      ctx.restore();
    }
  };

  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ch = new Chart(canvas, {
    type: 'scatter',
    plugins: [dumbbellLinePlugin],
    data: {
      datasets: [
        {
          label: 'REST',
          data: restVals.map((v, i) => ({ x: v, y: labels[i] })),
          backgroundColor: C.rest,
          borderColor: '#fff',
          borderWidth: 2,
          pointRadius: 10,
          pointHoverRadius: 12,
          pointStyle: 'circle',
          order: 1,
        },
        {
          label: 'GraphQL',
          data: gqlVals.map((v, i) => ({ x: v, y: labels[i] })),
          backgroundColor: C.gql,
          borderColor: '#fff',
          borderWidth: 2,
          pointRadius: 10,
          pointHoverRadius: 12,
          pointStyle: 'circle',
          order: 2,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font:{size:11}, padding:12, boxWidth:11 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.x;
              return ` ${ctx.dataset.label}: ${metric==='tempo' ? fmtMs(v) : fmtBytes(v)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ...baseScales.x,
          title: { display: true, text: xLabel, color: C.text, font:{size:11} }
        },
        y: {
          type: 'category',
          labels: labels,
          ticks: {
            color: C.text,
            font: { size: 11 },
          },
          grid: { display: false },
        }
      }
    }
  });
  charts[canvasId] = ch;
  return ch;
}

/**
 * BOX PLOT + JITTER OVERLAY
 * Data-to-Viz: for n=150, add individual points over box plot
 * Shows summary stats and raw distribution shape
 */
function buildBoxJitterChart(canvasId, restVals, gqlVals, yLabel='ms') {
  const rnd = seededRand(42);
  const jitterW = 0.12;

  return mkChart(canvasId, {
    type: 'boxplot',
    data: {
      labels: ['REST', 'GraphQL'],
      datasets: [
        {
          label: 'REST',
          data: [restVals],
          backgroundColor: C.restBg,
          borderColor: C.rest,
          borderWidth: 2,
          medianColor: C.rest,
          outlierColor: C.rest,
          itemRadius: 0,
        },
        {
          label: 'GraphQL',
          data: [gqlVals],
          backgroundColor: C.gqlBg,
          borderColor: C.gql,
          borderWidth: 2,
          medianColor: C.gql,
          outlierColor: C.gql,
          itemRadius: 0,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const s = ctx.raw;
              if (!s) return '';
              return [
                ` Mediana: ${fmt(s.median,2)} ${yLabel}`,
                ` Q1: ${fmt(s.q1,2)} · Q3: ${fmt(s.q3,2)} ${yLabel}`,
                ` Min: ${fmt(s.min,2)} · Max: ${fmt(s.max,2)} ${yLabel}`,
              ];
            }
          }
        }
      },
      scales: {
        x: { ...baseScales.x, grid:{display:false} },
        y: { ...baseScales.y, title:{display:true,text:yLabel,color:C.text,font:{size:11}} }
      }
    }
  });
}

/**
 * JITTER / STRIP PLOT
 * Data-to-Viz: for n=150 individual observations — strip plot
 * Shows every data point, reveals distribution shape
 */
function buildJitterChart(canvasId, restVals, gqlVals, xLabel='ms') {
  const rnd = seededRand(99);
  const restPoints = restVals.map(v => ({ x: v, y: rnd()*0.6-0.3 }));
  const gqlPoints  = gqlVals.map(v => ({ x: v, y: rnd()*0.6+1-0.3 }));

  return mkChart(canvasId, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'REST',
          data: restPoints,
          backgroundColor: 'rgba(234,88,12,0.35)',
          borderColor: C.rest,
          borderWidth: 0.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'GraphQL',
          data: gqlPoints,
          backgroundColor: 'rgba(124,58,237,0.35)',
          borderColor: C.gql,
          borderWidth: 0.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position:'top' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.x,2)} ${xLabel}`
          }
        }
      },
      scales: {
        x: { ...baseScales.x, title:{display:true,text:xLabel,color:C.text,font:{size:11}} },
        y: {
          ...baseScales.y,
          ticks: {
            callback: v => v > 0.4 && v < 0.6 ? 'GraphQL' : v > -0.4 && v < 0.1 ? 'REST' : '',
            color: C.text,
            font: { size: 11 },
          },
          min: -0.7, max: 1.7,
          grid: { display: false },
        }
      }
    }
  });
}

/**
 * DIVERGING LOLLIPOP (horizontal)
 * Data-to-Viz: lollipop for ranking + diverging for +/- values
 * lollipop = thin stick drawn by plugin + scatter dot at tip
 */
function buildDivergingLollipopChart(canvasId, groups, metric='tempo') {
  const values = groups.map(g => {
    const r = metric==='tempo' ? mean(g.rest_tempos)   : mean(g.rest_tamanhos);
    const q = metric==='tempo' ? mean(g.gql_tempos)    : mean(g.gql_tamanhos);
    return +fmt(((r-q)/r*100), 2);
  });
  const dotColors = values.map(v => v>0 ? C.gql : C.rest);

  const paired = groups.map((g,i)=>({name:shortName(g), val:values[i], color:dotColors[i]}));
  paired.sort((a,b)=>a.val-b.val);
  const orderedLabels = paired.map(p => p.name);
  const sticksPlugin = {
    id: 'lollipopSticks_' + canvasId,
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      const x0 = x.getPixelForValue(0);
      ctx.save();
      paired.forEach((p, i) => {
        const px = x.getPixelForValue(p.val);
        const py = y.getPixelForValue(p.name); 
        
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(x0, py);
        ctx.lineTo(px, py);
        ctx.stroke();
      });
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x0, chart.chartArea.top);
      ctx.lineTo(x0, chart.chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  };

  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ch = new Chart(canvas, {
    type: 'scatter',
    plugins: [sticksPlugin],
    data: {
      datasets: [{
        label: '% Ganho',
        data: paired.map(p => ({ x: p.val, y: p.name })),
        backgroundColor: paired.map(p => p.color),
        borderColor: '#fff',
        borderWidth: 2,
        pointRadius: 9,
        pointHoverRadius: 11,
        pointStyle: 'circle',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.x;
              return v>0
                ? ` GraphQL ${fmt(v,1)}% mais ${metric==='tempo'?'rápido':'leve'}`
                : ` REST ${fmt(Math.abs(v),1)}% mais ${metric==='tempo'?'rápido':'leve'}`;
            }
          }
        }
      },
      scales: {
        x: {
          ...baseScales.x,
          title: { display:true, text:'% (positivo = GraphQL melhor)', color:C.text, font:{size:11} },
        },
        y: {
          type: 'category',
          labels: orderedLabels,
          ticks: {
            color: C.text,
            font: { size: 11 },
          },
          grid: { display: false },
        }
      }
    }
  });
  charts[canvasId] = ch;
  return ch;
}

function buildGroupedBar(canvasId, groups, metric='tempo') {
  const labels = groups.map(shortName);
  const restData = groups.map(g => metric==='tempo' ? mean(g.rest_tempos) : mean(g.rest_tamanhos));
  const gqlData  = groups.map(g => metric==='tempo' ? mean(g.gql_tempos)  : mean(g.gql_tamanhos));
  const yLabel   = metric==='tempo' ? 'Tempo (ms)' : 'Tamanho (bytes)';

  return mkChart(canvasId, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'REST', data:restData, backgroundColor:C.restDim, borderColor:C.rest, borderWidth:2, borderRadius:5 },
        { label:'GraphQL', data:gqlData, backgroundColor:C.gqlDim, borderColor:C.gql, borderWidth:2, borderRadius:5 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend:{position:'top'} },
      scales: {
        x: { ...baseScales.x },
        y: { ...baseScales.y, title:{display:true,text:yLabel,color:C.text,font:{size:11}} }
      }
    }
  });
}

/**
 * SCATTER PLOT — Tempo vs Tamanho
 * Data-to-Viz: relationship between two quantitative variables
 * Shows the tradeoff correlation between speed and payload size
 */
function buildScatterChart(canvasId, data) {
  const sample = data.filter((_,i)=>i%2===0);
  return mkChart(canvasId, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'REST',
          data: sample.map(d=>({x:d.rest.tempo_ms, y:d.rest.tamanho_bytes})),
          backgroundColor: 'rgba(234,88,12,0.3)',
          borderColor: C.rest,
          borderWidth: 0.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          label: 'GraphQL',
          data: sample.map(d=>({x:d.graphql.tempo_ms, y:d.graphql.tamanho_bytes})),
          backgroundColor: 'rgba(124,58,237,0.3)',
          borderColor: C.gql,
          borderWidth: 0.5,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {position:'top'},
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtMs(ctx.parsed.x)}, ${fmtBytes(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: { ...baseScales.x, title:{display:true,text:'Tempo (ms)',color:C.text,font:{size:11}} },
        y: { ...baseScales.y, title:{display:true,text:'Tamanho (bytes)',color:C.text,font:{size:11}} }
      }
    }
  });
}

// ── RENDER: Overview Tab ────────────────────────────────────────────────────
function renderOverview() {
  const data = getFilteredData();
  const {rest:rt, gql:gt} = getTempos(data);
  const {rest:rs, gql:gs} = getTamanhos(data);
  const groups = groupByQuery(data);

  // KPI cards
  document.getElementById('kpi-val-tempo-rest').textContent = fmtMs(mean(rt));
  document.getElementById('kpi-med-tempo-rest').textContent = fmtMs(median(rt));
  document.getElementById('kpi-val-tempo-gql').textContent  = fmtMs(mean(gt));
  document.getElementById('kpi-med-tempo-gql').textContent  = fmtMs(median(gt));
  document.getElementById('kpi-val-tam-rest').textContent   = fmtBytes(mean(rs));
  document.getElementById('kpi-med-tam-rest').textContent   = fmtBytes(median(rs));
  document.getElementById('kpi-val-tam-gql').textContent    = fmtBytes(mean(gs));
  document.getElementById('kpi-med-tam-gql').textContent    = fmtBytes(median(gs));

  // Verdict cards
  const tempoGanho = (mean(rt)-mean(gt))/mean(rt)*100;
  const tamGanho   = (mean(rs)-mean(gs))/mean(rs)*100;
  const v1Val   = document.getElementById('verdict-rq1-val');
  const v1Stat  = document.getElementById('verdict-rq1-stat');
  const v1Badge = document.getElementById('verdict-rq1-badge');
  if (tempoGanho > 0) {
    v1Val.textContent  = 'REST mais rápido'; v1Val.style.color = C.rest;
    v1Stat.textContent = `GraphQL ${fmt(Math.abs(tempoGanho),1)}% mais lento`;
    v1Badge.className = 'verdict-badge rest-wins'; v1Badge.textContent = '🏁 REST vence em velocidade';
  } else {
    v1Val.textContent  = 'GraphQL mais rápido'; v1Val.style.color = C.gql;
    v1Stat.textContent = `GraphQL ${fmt(Math.abs(tempoGanho),1)}% mais rápido`;
    v1Badge.className = 'verdict-badge gql-wins'; v1Badge.textContent = '⚡ GraphQL vence em velocidade';
  }
  const v2Val   = document.getElementById('verdict-rq2-val');
  const v2Stat  = document.getElementById('verdict-rq2-stat');
  const v2Badge = document.getElementById('verdict-rq2-badge');
  if (tamGanho > 0) {
    v2Val.textContent  = 'GraphQL mais leve'; v2Val.style.color = C.gql;
    v2Stat.textContent = `Redução de ${fmt(tamGanho,1)}% no payload médio`;
    v2Badge.className = 'verdict-badge gql-wins'; v2Badge.textContent = '🗜 GraphQL vence em tamanho';
  } else {
    v2Val.textContent  = 'REST mais leve'; v2Val.style.color = C.rest;
    v2Stat.textContent = `GraphQL ${fmt(Math.abs(tamGanho),1)}% maior em média`;
    v2Badge.className = 'verdict-badge rest-wins'; v2Badge.textContent = '📦 REST vence em tamanho';
  }

  // Significance badges (only once)
  document.querySelectorAll('.verdict-sig-extra').forEach(el=>el.remove());
  if (state.analise) {
    ['rq1','rq2'].forEach((rq, i) => {
      const t = state.analise[rq].teste_t;
      const el = document.createElement('span');
      el.className = 'verdict-badge sig verdict-sig-extra';
      el.style.display = 'inline-block';
      el.textContent = t.significativo ? '✓ Significativo (p<0.05)' : '✗ Não significativo';
      (i===0 ? v1Badge : v2Badge).insertAdjacentElement('afterend', el);
    });
  }

  // Charts — respect metric filter
  // When metric='tempo', show slope (tempo) and hide dumbbell (tamanho); vice-versa; 'both' shows both
  const showTempo   = state.metric === 'both' || state.metric === 'tempo';
  const showTamanho = state.metric === 'both' || state.metric === 'tamanho';

  if (showTempo)   buildSlopeChart('chart-slope-tempo', groups, 'tempo');
  else             destroyChart('chart-slope-tempo');

  if (showTamanho) buildDumbbellChart('chart-dumbbell-tam', groups, 'tamanho');
  else             destroyChart('chart-dumbbell-tam');

  // Scatter always visible (shows both axes)
  buildScatterChart('chart-scatter-overview', data);
}

// ── RENDER: RQ1 Tab ─────────────────────────────────────────────────────────
function renderRQ1() {
  const data = getFilteredData();
  const {rest:rt, gql:gt} = getTempos(data);
  const groups = groupByQuery(data);

  // Hypothesis
  const sig = state.analise ? state.analise.rq1.teste_t.significativo : false;
  const hyp = document.getElementById('hyp-rq1-result');
  hyp.textContent = sig ? 'H₀ REJEITADA' : 'H₀ NÃO REJEITADA';
  hyp.className = 'hyp-result ' + (sig ? 'reject' : 'accept');

  // Stat table
  document.getElementById('stat-table-rq1-body').innerHTML = `
    <tr>
      <td><span class="tag-rest">REST</span></td>
      <td>${fmtMs(mean(rt))}</td>
      <td>${fmtMs(median(rt))}</td>
      <td>${fmtMs(stddev(rt))}</td>
      <td>${fmtMs(percentile(rt,95))}</td>
      <td>${fmtMs(percentile(rt,99))}</td>
    </tr>
    <tr>
      <td><span class="tag-gql">GraphQL</span></td>
      <td>${fmtMs(mean(gt))}</td>
      <td>${fmtMs(median(gt))}</td>
      <td>${fmtMs(stddev(gt))}</td>
      <td>${fmtMs(percentile(gt,95))}</td>
      <td>${fmtMs(percentile(gt,99))}</td>
    </tr>
  `;

  // T-test
  if (state.analise) {
    const t = state.analise.rq1.teste_t;
    document.getElementById('tt-rq1-t').textContent = fmt(t.t_statistic,4);
    document.getElementById('tt-rq1-p').textContent = t.p_value<=0.01 ? '< 0.01' : fmt(t.p_value,4);
    const sigEl = document.getElementById('tt-rq1-sig');
    sigEl.textContent = t.significativo ? 'SIM ✓' : 'NÃO ✗';
    sigEl.className = 'ttest-val ' + (t.significativo ? 'sig' : 'not-sig');
  }

  // Box plot + jitter (Data-to-Viz: show individual points for n=150)
  buildBoxJitterChart('chart-boxplot-tempo', rt, gt, 'ms');

  // Strip/Jitter plot — individual measurements (Data-to-Viz: strip plot reveals true distribution)
  buildJitterChart('chart-jitter-tempo', rt, gt, 'ms');

  // Slope chart — tempo per query (paired comparison — Data-to-Viz: connected scatter)
  buildSlopeChart('chart-slope-rq1', groups, 'tempo');
}

// ── RENDER: RQ2 Tab ─────────────────────────────────────────────────────────
function renderRQ2() {
  const data = getFilteredData();
  const {rest:rs, gql:gs} = getTamanhos(data);
  const groups = groupByQuery(data);

  // Hypothesis
  const sig = state.analise ? state.analise.rq2.teste_t.significativo : false;
  const hyp = document.getElementById('hyp-rq2-result');
  hyp.textContent = sig ? 'H₀ REJEITADA' : 'H₀ NÃO REJEITADA';
  hyp.className = 'hyp-result ' + (sig ? 'reject' : 'accept');

  // Stat table
  document.getElementById('stat-table-rq2-body').innerHTML = `
    <tr>
      <td><span class="tag-rest">REST</span></td>
      <td>${fmtBytes(mean(rs))}</td>
      <td>${fmtBytes(median(rs))}</td>
      <td>${fmtBytes(Math.max(...rs))}</td>
    </tr>
    <tr>
      <td><span class="tag-gql">GraphQL</span></td>
      <td>${fmtBytes(mean(gs))}</td>
      <td>${fmtBytes(median(gs))}</td>
      <td>${fmtBytes(Math.max(...gs))}</td>
    </tr>
  `;

  // T-test
  if (state.analise) {
    const t = state.analise.rq2.teste_t;
    document.getElementById('tt-rq2-t').textContent = fmt(t.t_statistic,4);
    document.getElementById('tt-rq2-p').textContent = t.p_value<=0.01 ? '< 0.01' : fmt(t.p_value,4);
    const sigEl = document.getElementById('tt-rq2-sig');
    sigEl.textContent = t.significativo ? 'SIM ✓' : 'NÃO ✗';
    sigEl.className = 'ttest-val ' + (t.significativo ? 'sig' : 'not-sig');
  }

  // Box plot (Data-to-Viz: essential for distribution comparison)
  buildBoxJitterChart('chart-boxplot-tamanho', rs, gs, 'bytes');

  // Diverging lollipop — % reduction (Data-to-Viz: lollipop for ranking; diverging for +/-)
  buildDivergingLollipopChart('chart-lollipop-tam', groups, 'tamanho');

  // Grouped bar — absolute values (Data-to-Viz: grouped bar for categorical comparison)
  buildGroupedBar('chart-bars-tamanho', groups, 'tamanho');
}

// ── RENDER: Queries Tab ─────────────────────────────────────────────────────
function renderQueries() {
  const data = getFilteredData();
  const groups = groupByQuery(data);
  const badges = ['q1','q2','q3','q4','q5'];

  // Query detail cards
  const grid = document.getElementById('query-detail-grid');
  grid.innerHTML = '';
  groups.forEach((g, idx) => {
    const mRT = mean(g.rest_tempos), mGT = mean(g.gql_tempos);
    const mRS = mean(g.rest_tamanhos), mGS = mean(g.gql_tamanhos);
    const tG = (mRT-mGT)/mRT*100, sG = (mRS-mGS)/mRS*100;
    const tClass  = tG>2?'positive':tG<-2?'negative':'neutral';
    const tLabel  = tG>2?`GraphQL ${fmt(tG,1)}% mais rápido`:tG<-2?`REST ${fmt(Math.abs(tG),1)}% mais rápido`:'Desempenho semelhante';
    const sClass  = sG>2?'positive':sG<-2?'negative':'neutral';
    const sLabel  = sG>2?`GraphQL ${fmt(sG,1)}% menor`:sG<-2?`REST ${fmt(Math.abs(sG),1)}% menor`:'Tamanho semelhante';
    const card = document.createElement('div');
    card.className = 'qd-card';
    card.innerHTML = `
      <div class="qd-badge ${badges[idx]}">Consulta ${g.id}</div>
      <div class="qd-name">${g.nome}</div>
      <div class="qd-metrics">
        <div class="qd-metric-row">
          <span class="qd-metric-label">Tempo médio</span>
          <div class="qd-metric-vals">
            <span class="qd-pill rest">${fmtMs(mRT)}</span>
            <span class="qd-pill gql">${fmtMs(mGT)}</span>
          </div>
        </div>
        <div class="qd-metric-row">
          <span class="qd-metric-label">Tamanho médio</span>
          <div class="qd-metric-vals">
            <span class="qd-pill rest">${fmtBytes(mRS)}</span>
            <span class="qd-pill gql">${fmtBytes(mGS)}</span>
          </div>
        </div>
        <div class="qd-metric-row">
          <span class="qd-metric-label">Trials</span>
          <span style="font-size:0.72rem;color:#64748b;">${g.rest_tempos.length}</span>
        </div>
      </div>
      <div class="qd-gain">
        ⏱ <span class="${tClass}">${tLabel}</span><br>
        📦 <span class="${sClass}">${sLabel}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  // Charts — respect metric filter
  const showTempo   = state.metric === 'both' || state.metric === 'tempo';
  const showTamanho = state.metric === 'both' || state.metric === 'tamanho';

  // Dumbbell chart — Tempo (Data-to-Viz: parallel dot plot for paired multi-query comparison)
  if (showTempo) buildDumbbellChart('chart-dumbbell-tempo', groups, 'tempo');
  else           destroyChart('chart-dumbbell-tempo');

  // Diverging lollipop — Tempo % gain (Data-to-Viz: lollipop for ranked diverging values)
  if (showTempo) buildDivergingLollipopChart('chart-lollipop-tempo', groups, 'tempo');
  else           destroyChart('chart-lollipop-tempo');

  // Grouped bar — absolute tempo per query
  if (showTempo) buildGroupedBar('chart-grouped-tempo', groups, 'tempo');
  else           destroyChart('chart-grouped-tempo');
}

// ── RENDER: Raw Data ─────────────────────────────────────────────────────────
function renderRaw() {
  let data = getFilteredData();
  if (state.rawSearch) {
    const q = state.rawSearch.toLowerCase();
    data = data.filter(d => d.nome_consulta.toLowerCase().includes(q) || String(d.id_param).includes(q));
  }
  if (state.rawFilterQuery) data = data.filter(d => d.id_consulta===Number(state.rawFilterQuery));
  const sortFns = {
    timestamp:  (a,b)=>new Date(a.timestamp)-new Date(b.timestamp),
    rest_tempo: (a,b)=>a.rest.tempo_ms-b.rest.tempo_ms,
    gql_tempo:  (a,b)=>a.graphql.tempo_ms-b.graphql.tempo_ms,
    rest_tam:   (a,b)=>a.rest.tamanho_bytes-b.rest.tamanho_bytes,
    gql_tam:    (a,b)=>a.graphql.tamanho_bytes-b.graphql.tamanho_bytes,
  };
  data = [...data].sort(sortFns[state.rawSort]||sortFns.timestamp);
  document.getElementById('raw-count').textContent = `${data.length} linhas`;
  const total = Math.max(1, Math.ceil(data.length/state.rawPageSize));
  state.rawPage = Math.min(state.rawPage, total);
  const start = (state.rawPage-1)*state.rawPageSize;
  const page  = data.slice(start, start+state.rawPageSize);
  const tbody = document.getElementById('raw-table-body');
  tbody.innerHTML = '';
  page.forEach((d,i) => {
    const dT = d.graphql.tempo_ms-d.rest.tempo_ms;
    const dS = d.graphql.tamanho_bytes-d.rest.tamanho_bytes;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-muted">${start+i+1}</td>
      <td class="td-query">${d.nome_consulta}</td>
      <td>${d.id_param}</td>
      <td class="td-rest">${fmtMs(d.rest.tempo_ms)}</td>
      <td class="td-gql">${fmtMs(d.graphql.tempo_ms)}</td>
      <td class="${dT>0?'td-delta-neg':'td-delta-pos'}">${dT>0?'+':''}${fmtMs(Math.abs(dT))}</td>
      <td class="td-rest">${fmtBytes(d.rest.tamanho_bytes)}</td>
      <td class="td-gql">${fmtBytes(d.graphql.tamanho_bytes)}</td>
      <td class="${dS>0?'td-delta-neg':'td-delta-pos'}">${dS>0?'+':''}${fmtBytes(Math.abs(dS))}</td>
      <td class="td-muted">${new Date(d.timestamp).toLocaleString('pt-BR')}</td>
    `;
    tbody.appendChild(tr);
  });
  // Pagination
  const pag = document.getElementById('raw-pagination');
  pag.innerHTML = '';
  const lo = Math.max(1, state.rawPage-3), hi = Math.min(total, lo+6);
  for (let p=lo; p<=hi; p++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn'+(p===state.rawPage?' active':'');
    btn.textContent = p;
    btn.addEventListener('click',()=>{state.rawPage=p;renderRaw();});
    pag.appendChild(btn);
  }
}

// ── RENDER: Sidebar ──────────────────────────────────────────────────────────
function renderSidebar() {
  const data = state.allData.filter(d=>d.rest.status===200&&d.graphql.status===200);
  document.getElementById('qs-total').textContent = data.length;
  document.getElementById('qs-queries').textContent = new Set(data.map(d=>d.id_consulta)).size;
  if (data.length) {
    const d0 = new Date(Math.min(...data.map(d=>new Date(d.timestamp))));
    document.getElementById('qs-period').textContent = d0.toLocaleDateString('pt-BR');
  }
  document.getElementById('total-medicoes-header').textContent = data.length;

  // Query checkboxes
  const list = document.getElementById('query-filter-list');
  list.innerHTML = '';
  const names = {};
  data.forEach(d=>{names[d.id_consulta]=d.nome_consulta;});
  Object.entries(names).sort(([a],[b])=>Number(a)-Number(b)).forEach(([id,nome])=>{
    const lbl = document.createElement('label');
    lbl.className = 'query-filter-item';
    lbl.innerHTML = `<input type="checkbox" value="${id}" checked/><span>${nome}</span>`;
    lbl.querySelector('input').addEventListener('change',e=>{
      if (e.target.checked) state.selectedQueries.delete(Number(id));
      else state.selectedQueries.add(Number(id));
      renderAll();
    });
    list.appendChild(lbl);
  });

  // Raw filter dropdown
  const sel = document.getElementById('raw-filter-query');
  sel.innerHTML = '<option value="">Todas as consultas</option>';
  Object.entries(names).sort(([a],[b])=>Number(a)-Number(b)).forEach(([id,nome])=>{
    const o = document.createElement('option');
    o.value=id; o.textContent=nome; sel.appendChild(o);
  });
}

// ── Render active tab ────────────────────────────────────────────────────────
function renderAll() {
  // Sync metric filter to body so CSS can show/hide elements
  document.body.dataset.metric = state.metric;

  const active = document.querySelector('.tab-section.active');
  if (!active) return;
  switch(active.id.replace('tab-','')) {
    case 'overview': renderOverview(); break;
    case 'rq1':      renderRQ1();      break;
    case 'rq2':      renderRQ2();      break;
    case 'queries':  renderQueries();  break;
    case 'raw':      renderRaw();      break;
  }
}

// ── Event Setup ──────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(s=>s.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
      renderAll();
    });
  });
}

function initOutlierToggle() {
  const toggle = document.getElementById('outlier-toggle');
  const track  = document.getElementById('toggle-track');
  toggle.addEventListener('click',()=>{
    state.removeOutliers=!state.removeOutliers;
    track.classList.toggle('on', state.removeOutliers);
    renderAll();
  });
}

function initMetricSelector() {
  document.querySelectorAll('.metric-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.metric = btn.dataset.metric;
      document.querySelectorAll('.metric-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderAll();
    });
  });
}

function initRawControls() {
  document.getElementById('raw-search').addEventListener('input',e=>{state.rawSearch=e.target.value;state.rawPage=1;renderRaw();});
  document.getElementById('raw-filter-query').addEventListener('change',e=>{state.rawFilterQuery=e.target.value;state.rawPage=1;renderRaw();});
  document.getElementById('raw-sort').addEventListener('change',e=>{state.rawSort=e.target.value;state.rawPage=1;renderRaw();});
}

// ── Data Loading ──────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const [m,a] = await Promise.all([fetch('./resultados/medicoes.json'),fetch('./resultados/analise.json')]);
    state.allData = await m.json();
    state.analise = await a.json();
  } catch(e) {
    document.querySelector('.main-content').innerHTML = `
      <div style="padding:60px;text-align:center;color:#dc2626;">
        <h2 style="font-family:'Space Grotesk',sans-serif">Erro ao carregar dados</h2>
        <p style="margin-top:8px;color:#64748b;">Abra via servidor HTTP: <code style="background:#f1f5f9;padding:4px 8px;border-radius:6px;border:1px solid #e2e8f0;">npx serve .</code></p>
      </div>`;
    return false;
  }
  return true;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function main() {
  initTabs();
  initOutlierToggle();
  initMetricSelector();
  initRawControls();
  if (!await loadData()) return;
  renderSidebar();
  renderAll();
}

document.addEventListener('DOMContentLoaded', main);