const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { gerarCenariosTeste } = require('./consultas');

// Configurações
const CONFIG = {
  aquecimentoRequisicoes: 5,  // Número de requisições de aquecimento
  timeoutMs: 30000,           // Timeout de 30 segundos
  delayEntreRequisicoesMs: 100, // Delay entre requisições (evita sobrecarga)
  arquivoResultados: './resultados/medicoes.json'
};

// Garantir diretório de resultados
if (!fs.existsSync('./resultados')) {
  fs.mkdirSync('./resultados');
}

// Função para medir requisição
async function medirRequisicao(config) {
  const startTime = process.hrtime.bigint();
  let tamanhoResposta = 0;
  let statusCode = 0;
  let erro = null;
  
  try {
    const response = await axios({
      method: config.method,
      url: config.url,
      data: config.data,
      timeout: CONFIG.timeoutMs,
      validateStatus: () => true // Não lançar erro para status 4xx/5xx
    });
    
    const endTime = process.hrtime.bigint();
    const tempoMs = Number(endTime - startTime) / 1_000_000;
    
    tamanhoResposta = JSON.stringify(response.data).length;
    statusCode = response.status;
    
    return {
      tempo_ms: tempoMs,
      tamanho_bytes: tamanhoResposta,
      status: statusCode,
      erro: null
    };
  } catch (error) {
    const endTime = process.hrtime.bigint();
    const tempoMs = Number(endTime - startTime) / 1_000_000;
    
    return {
      tempo_ms: tempoMs,
      tamanho_bytes: 0,
      status: 0,
      erro: error.message
    };
  }
}

// Função para executar aquecimento
async function executarAquecimento(apiType, baseUrl) {
  console.log(`Aquecendo ${apiType}...`);
  
  for (let i = 0; i < CONFIG.aquecimentoRequisicoes; i++) {
    if (apiType === 'REST') {
      await medirRequisicao({
        method: 'GET',
        url: `${baseUrl}/usuarios/1`
      });
    } else {
      await medirRequisicao({
        method: 'POST',
        url: `${baseUrl}/graphql`,
        data: {
          query: '{ usuario(id: 1) { id nome } }'
        }
      });
    }
    await delay(CONFIG.delayEntreRequisicoesMs);
  }
}

// Função delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função principal do experimento
async function executarExperimento() {
  console.log('Iniciando experimento controlado GraphQL vs REST\n');
  console.log('='.repeat(60));
  
  // Verificar se servidores estão rodando
  console.log('Verificando servidores...');
  
  try {
    await axios.get('http://localhost:3000/health');
    console.log('Servidor REST OK');
  } catch (error) {
    console.error('Servidor REST não está rodando! Execute: npm run start-rest');
    process.exit(1);
  }
  
  try {
    await axios.get('http://localhost:3001/health');
    console.log('Servidor GraphQL OK\n');
  } catch (error) {
    console.error('Servidor GraphQL não está rodando! Execute: npm run start-graphql');
    process.exit(1);
  }
  
  // Aquecimento
  await executarAquecimento('REST', 'http://localhost:3000');
  await executarAquecimento('GraphQL', 'http://localhost:3001');
  
  // Gerar cenários de teste
  const cenarios = gerarCenariosTeste();
  console.log(`Total de cenários gerados: ${cenarios.length}\n`);
  
  // Randomizar ordem para evitar viés
  const cenariosRandomizados = [...cenarios];
  for (let i = cenariosRandomizados.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cenariosRandomizados[i], cenariosRandomizados[j]] = [cenariosRandomizados[j], cenariosRandomizados[i]];
  }
  
  // Executar medições
  const resultados = [];
  let contador = 0;
  
  console.log('Executando medições...\n');
  
  for (const cenario of cenariosRandomizados) {
    contador++;
    console.log(`[${contador}/${cenarios.length}] Medindo: ${cenario.nome_consulta} (ID: ${cenario.id_param})`);
    
    // Medir REST
    console.log(`  → REST...`);
    const restResult = await medirRequisicao({
      method: cenario.rest.method,
      url: cenario.rest.url
    });
    
    await delay(CONFIG.delayEntreRequisicoesMs);
    
    // Medir GraphQL
    console.log(`  → GraphQL...`);
    const graphqlResult = await medirRequisicao({
      method: cenario.graphql.method,
      url: cenario.graphql.url,
      data: cenario.graphql.data
    });
    
    // Registrar resultados
    resultados.push({
      timestamp: new Date().toISOString(),
      id_consulta: cenario.id_consulta,
      nome_consulta: cenario.nome_consulta,
      id_param: cenario.id_param,
      rest: restResult,
      graphql: graphqlResult
    });
    
    await delay(CONFIG.delayEntreRequisicoesMs);
  }
  
  // Salvar resultados
  fs.writeFileSync(CONFIG.arquivoResultados, JSON.stringify(resultados, null, 2));
  console.log(`\nExperimento concluído! Resultados salvos em ${CONFIG.arquivoResultados}`);
  
  // Estatísticas rápidas
  console.log('\nEstatísticas preliminares:');
  const temposRest = resultados.map(r => r.rest.tempo_ms).filter(t => t > 0);
  const temposGraphQL = resultados.map(r => r.graphql.tempo_ms).filter(t => t > 0);
  const tamanhosRest = resultados.map(r => r.rest.tamanho_bytes).filter(t => t > 0);
  const tamanhosGraphQL = resultados.map(r => r.graphql.tamanho_bytes).filter(t => t > 0);
  
  console.log(`\nTempo médio REST: ${(temposRest.reduce((a,b) => a+b, 0) / temposRest.length).toFixed(2)}ms`);
  console.log(`Tempo médio GraphQL: ${(temposGraphQL.reduce((a,b) => a+b, 0) / temposGraphQL.length).toFixed(2)}ms`);
  console.log(`\nTamanho médio REST: ${(tamanhosRest.reduce((a,b) => a+b, 0) / tamanhosRest.length / 1024).toFixed(2)}KB`);
  console.log(`Tamanho médio GraphQL: ${(tamanhosGraphQL.reduce((a,b) => a+b, 0) / tamanhosGraphQL.length / 1024).toFixed(2)}KB`);
}

// Executar experimento
executarExperimento().catch(console.error);