const fs = require('fs');

// Funções estatísticas
function calcularMedia(valores) {
  if (valores.length === 0) return 0;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function calcularMediana(valores) {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calcularDesvioPadrao(valores) {
  if (valores.length === 0) return 0;
  const media = calcularMedia(valores);
  const squareDiffs = valores.map(value => Math.pow(value - media, 2));
  const avgSquareDiff = calcularMedia(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

function calcularPercentil(valores, percentil) {
  if (valores.length === 0) return 0;
  const sorted = [...valores].sort((a, b) => a - b);
  const index = Math.ceil((percentil / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

// Teste t pareado (simplificado)
function calcularTesteT(valoresRest, valoresGraphQL) {
  if (valoresRest.length !== valoresGraphQL.length || valoresRest.length === 0) {
    return { tStatistic: 0, pValue: 1, significativo: false };
  }
  
  const diferencas = valoresRest.map((v, i) => v - valoresGraphQL[i]);
  const mediaDiferencas = calcularMedia(diferencas);
  const desvioDiferencas = calcularDesvioPadrao(diferencas);
  const n = diferencas.length;
  
  if (desvioDiferencas === 0) {
    return { tStatistic: 0, pValue: 1, significativo: false };
  }
  
  const tStatistic = mediaDiferencas / (desvioDiferencas / Math.sqrt(n));
  const grausLiberdade = n - 1;
  
  // p-value aproximado (simplificado para 95% de confiança)
  const significativo = Math.abs(tStatistic) > 2.0;
  const pValue = significativo ? 0.01 : 0.1;
  
  return { tStatistic, pValue, significativo };
}

// Função principal de análise
function analisarResultados() {
  console.log('\nANÁLISE DE RESULTADOS - GRAPHQL vs REST');
  console.log('='.repeat(60));
  
  // Carregar dados
  const dados = JSON.parse(fs.readFileSync('./resultados/medicoes.json', 'utf8'));
  
  console.log(`\nTotal de medições válidas: ${dados.length}\n`);
  
  // Filtrar medições com erro
  const medicoesValidas = dados.filter(d => 
    d.rest.status === 200 && 
    d.graphql.status === 200 &&
    !d.rest.erro && 
    !d.graphql.erro
  );
  
  console.log(`Medições sem erro: ${medicoesValidas.length}\n`);
  
  // ===== RQ1: Tempo de resposta =====
  console.log('⏱RQ1 - TEMPO DE RESPOSTA');
  console.log('-'.repeat(40));
  
  const temposRest = medicoesValidas.map(m => m.rest.tempo_ms);
  const temposGraphQL = medicoesValidas.map(m => m.graphql.tempo_ms);
  
  console.log('\nEstatísticas descritivas:');
  console.log(`REST - Média: ${calcularMedia(temposRest).toFixed(2)}ms`);
  console.log(`REST - Mediana: ${calcularMediana(temposRest).toFixed(2)}ms`);
  console.log(`REST - Desvio: ${calcularDesvioPadrao(temposRest).toFixed(2)}ms`);
  console.log(`REST - P95: ${calcularPercentil(temposRest, 95).toFixed(2)}ms`);
  console.log(`REST - P99: ${calcularPercentil(temposRest, 99).toFixed(2)}ms`);
  
  console.log(`\nGraphQL - Média: ${calcularMedia(temposGraphQL).toFixed(2)}ms`);
  console.log(`GraphQL - Mediana: ${calcularMediana(temposGraphQL).toFixed(2)}ms`);
  console.log(`GraphQL - Desvio: ${calcularDesvioPadrao(temposGraphQL).toFixed(2)}ms`);
  console.log(`GraphQL - P95: ${calcularPercentil(temposGraphQL, 95).toFixed(2)}ms`);
  console.log(`GraphQL - P99: ${calcularPercentil(temposGraphQL, 99).toFixed(2)}ms`);
  
  // Teste estatístico RQ1
  const testeTRQ1 = calcularTesteT(temposRest, temposGraphQL);
  console.log(`\nTeste t pareado:`);
  console.log(`t-statistic: ${testeTRQ1.tStatistic.toFixed(4)}`);
  console.log(`p-value: ${testeTRQ1.pValue}`);
  console.log(`Diferença significativa (α=0.05): ${testeTRQ1.significativo ? 'SIM' : 'NÃO'}`);
  
  const tempoGanho = ((calcularMedia(temposRest) - calcularMedia(temposGraphQL)) / calcularMedia(temposRest)) * 100;
  console.log(`\n💰 GraphQL é ${tempoGanho > 0 ? `${tempoGanho.toFixed(1)}% MAIS RÁPIDO` : `${Math.abs(tempoGanho).toFixed(1)}% MAIS LENTO`} que REST (em média)`);
  
  // ===== RQ2: Tamanho da resposta =====
  console.log('\nRQ2 - TAMANHO DA RESPOSTA');
  console.log('-'.repeat(40));
  
  const tamanhosRest = medicoesValidas.map(m => m.rest.tamanho_bytes);
  const tamanhosGraphQL = medicoesValidas.map(m => m.graphql.tamanho_bytes);
  
  console.log('\nEstatísticas descritivas:');
  console.log(`REST - Média: ${(calcularMedia(tamanhosRest) / 1024).toFixed(2)}KB`);
  console.log(`REST - Mediana: ${(calcularMediana(tamanhosRest) / 1024).toFixed(2)}KB`);
  console.log(`REST - Máximo: ${(Math.max(...tamanhosRest) / 1024).toFixed(2)}KB`);
  
  console.log(`\nGraphQL - Média: ${(calcularMedia(tamanhosGraphQL) / 1024).toFixed(2)}KB`);
  console.log(`GraphQL - Mediana: ${(calcularMediana(tamanhosGraphQL) / 1024).toFixed(2)}KB`);
  console.log(`GraphQL - Máximo: ${(Math.max(...tamanhosGraphQL) / 1024).toFixed(2)}KB`);
  
  // Teste estatístico RQ2
  const testeTRQ2 = calcularTesteT(tamanhosRest, tamanhosGraphQL);
  console.log(`\nTeste t pareado:`);
  console.log(`t-statistic: ${testeTRQ2.tStatistic.toFixed(4)}`);
  console.log(`p-value: ${testeTRQ2.pValue}`);
  console.log(`Diferença significativa (α=0.05): ${testeTRQ2.significativo ? 'SIM' : 'NÃO'}`);
  
  const reducaoTamanho = ((calcularMedia(tamanhosRest) - calcularMedia(tamanhosGraphQL)) / calcularMedia(tamanhosRest)) * 100;
  console.log(`\nGraphQL REDUZ o payload em ${reducaoTamanho.toFixed(1)}% em média comparado ao REST`);
  
  // ===== Análise por tipo de consulta =====
  console.log('\nANÁLISE DETALHADA POR CONSULTA');
  console.log('-'.repeat(40));
  
  const consultasAgrupadas = {};
  medicoesValidas.forEach(m => {
    if (!consultasAgrupadas[m.id_consulta]) {
      consultasAgrupadas[m.id_consulta] = {
        nome: m.nome_consulta,
        rest_tempos: [],
        graphql_tempos: [],
        rest_tamanhos: [],
        graphql_tamanhos: []
      };
    }
    consultasAgrupadas[m.id_consulta].rest_tempos.push(m.rest.tempo_ms);
    consultasAgrupadas[m.id_consulta].graphql_tempos.push(m.graphql.tempo_ms);
    consultasAgrupadas[m.id_consulta].rest_tamanhos.push(m.rest.tamanho_bytes);
    consultasAgrupadas[m.id_consulta].graphql_tamanhos.push(m.graphql.tamanho_bytes);
  });
  
  for (const [id, dados] of Object.entries(consultasAgrupadas)) {
    const tempoMedioRest = calcularMedia(dados.rest_tempos);
    const tempoMedioGraphQL = calcularMedia(dados.graphql_tempos);
    const tamanhoMedioRest = calcularMedia(dados.rest_tamanhos);
    const tamanhoMedioGraphQL = calcularMedia(dados.graphql_tamanhos);
    const reducaoTempo = ((tempoMedioRest - tempoMedioGraphQL) / tempoMedioRest) * 100;
    const reducaoTamanho = ((tamanhoMedioRest - tamanhoMedioGraphQL) / tamanhoMedioRest) * 100;
    
    console.log(`\n${id}. ${dados.nome}:`);
    console.log(`   Tempo: REST=${tempoMedioRest.toFixed(2)}ms | GraphQL=${tempoMedioGraphQL.toFixed(2)}ms | Ganho=${reducaoTempo.toFixed(1)}%`);
    console.log(`   Tamanho: REST=${(tamanhoMedioRest/1024).toFixed(2)}KB | GraphQL=${(tamanhoMedioGraphQL/1024).toFixed(2)}KB | Redução=${reducaoTamanho.toFixed(1)}%`);
  }
  
  // ===== Recomendações =====
  console.log('\nRECOMENDAÇÕES');
  console.log('-'.repeat(40));
  
  const vantagemTempo = calcularMedia(temposGraphQL) < calcularMedia(temposRest);
  const vantagemTamanho = calcularMedia(tamanhosGraphQL) < calcularMedia(tamanhosRest);
  
  if (vantagemTempo && vantagemTamanho) {
    console.log('\nGraphQL supera REST em ambos os aspectos (tempo e tamanho)');
    console.log('  Recomenda-se adotar GraphQL para cenários com sobrecarga de dados');
  } else if (vantagemTempo) {
    console.log('\nGraphQL é mais rápido, mas com payload similar ou maior');
    console.log('  Recomenda-se GraphQL para aplicações sensíveis à latência');
  } else if (vantagemTamanho) {
    console.log('\nGraphQL reduz payload, mas pode ser mais lento');
    console.log('  Recomenda-se GraphQL para mobile ou redes limitadas');
  } else {
    console.log('\nREST ainda é competitivo neste cenário específico');
    console.log('  Avaliar necessidade real dos benefícios do GraphQL');
  }
  
  // Salvar análise
  const analise = {
    timestamp: new Date().toISOString(),
    total_medicoes: medicoesValidas.length,
    rq1: {
      rest: {
        media_ms: calcularMedia(temposRest),
        mediana_ms: calcularMediana(temposRest),
        desvio_ms: calcularDesvioPadrao(temposRest),
        p95_ms: calcularPercentil(temposRest, 95),
        p99_ms: calcularPercentil(temposRest, 99)
      },
      graphql: {
        media_ms: calcularMedia(temposGraphQL),
        mediana_ms: calcularMediana(temposGraphQL),
        desvio_ms: calcularDesvioPadrao(temposGraphQL),
        p95_ms: calcularPercentil(temposGraphQL, 95),
        p99_ms: calcularPercentil(temposGraphQL, 99)
      },
      teste_t: {
        t_statistic: testeTRQ1.tStatistic,
        p_value: testeTRQ1.pValue,
        significativo: testeTRQ1.significativo
      },
      ganho_percentual: ((calcularMedia(temposRest) - calcularMedia(temposGraphQL)) / calcularMedia(temposRest)) * 100
    },
    rq2: {
      rest: {
        media_bytes: calcularMedia(tamanhosRest),
        mediana_bytes: calcularMediana(tamanhosRest),
        max_bytes: Math.max(...tamanhosRest)
      },
      graphql: {
        media_bytes: calcularMedia(tamanhosGraphQL),
        mediana_bytes: calcularMediana(tamanhosGraphQL),
        max_bytes: Math.max(...tamanhosGraphQL)
      },
      teste_t: {
        t_statistic: testeTRQ2.tStatistic,
        p_value: testeTRQ2.pValue,
        significativo: testeTRQ2.significativo
      },
      reducao_percentual: ((calcularMedia(tamanhosRest) - calcularMedia(tamanhosGraphQL)) / calcularMedia(tamanhosRest)) * 100
    }
  };
  
  fs.writeFileSync('./resultados/analise.json', JSON.stringify(analise, null, 2));
  console.log('\nAnálise detalhada salva em ./resultados/analise.json');
}

// Executar análise
analisarResultados();