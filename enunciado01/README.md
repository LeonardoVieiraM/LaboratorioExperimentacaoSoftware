# LaboratorioExperimentacaoSoftware

## Análise de Repositórios Populares no GitHub

Este projeto tem como objetivo analisar empiricamente as características dos 1000 repositórios mais populares do GitHub (medidos pelo número de estrelas). Através da coleta automatizada de dados via API GraphQL, buscamos responder questões sobre maturidade, contribuição externa, frequência de atualizações, linguagens predominantes e taxa de resolução de issues em projetos de alto impacto.

## Questões de Pesquisa

- **RQ 01:** Sistemas populares são maduros/antigos?
- **RQ 02:** Sistemas populares recebem muita contribuição externa?
- **RQ 03:** Sistemas populares lançam releases com frequência?
- **RQ 04:** Sistemas populares são atualizados com frequência?
- **RQ 05:** Sistemas populares são escritos nas linguagens mais populares?
- **RQ 06:** Sistemas populares possuem um alto percentual de issues fechadas?

## Tecnologias Utilizadas

- **Python 3** - Linguagem principal do projeto
- **GitHub GraphQL API** - Fonte dos dados
- **Bibliotecas Python:**
  - `requests` - Requisições HTTP
  - `python-dotenv` - Gerenciamento de variáveis de ambiente
  - `csv` - Exportação dos dados
  - `datetime` - Cálculos temporais

### 1. Configuração Inicial
- Carregamento do token de autenticação do GitHub a partir do arquivo `.env`
- Configuração dos headers e URL da API GraphQL

### 2. Definição da Query GraphQL
A query busca repositórios com mais de 10.000 estrelas, ordenados por popularidade, coletando:
- Nome e proprietário
- Datas de criação e última atualização
- Linguagem primária
- Número de releases
- Pull requests mesclados (com informação de autoria)
- Total de issues e issues fechadas

### 3. Coleta Paginada (`fetch_repos`)
- Implementa paginação com cursor para coletar exatamente 1000 repositórios
- Faz requisições em lotes de 10 repositórios por vez
- Inclui pausas entre requisições para respeitar limites da API

### 4. Sistema de Retry com Exponential Backoff (`post_with_retries`)
- Em caso de falhas (erros 5xx ou exceções de rede), o script tenta novamente
- Atraso progressivo entre tentativas: `delay = base * 2^(attempt-1) + jitter`
- Máximo de 10 tentativas por requisição

### 5. Processamento das Métricas (`process_metrics`)
Para cada repositório, calcula:
- **Idade em dias** (desde a criação)
- **Dias sem atualização** (desde o último commit)
- **PRs externos aceitos** (autores que não são OWNER/MEMBER/COLLABORATOR)
- **Percentual de issues fechadas** (closed/total * 100)

### 6. Exportação para CSV (`export_to_csv`)
- Gera arquivo `relatorio_repositorios.csv` com todas as métricas calculadas
- Formatação com ponto e vírgula como separador decimal

##  Estrutura do Projeto
.
├── main.py # Script principal de coleta e processamento
├── .env # Arquivo com GITHUB_TOKEN (não versionado)
├── relatorio_repositorios.csv # Dados exportados (gerado após execução)
├── README.md # Este arquivo
└── Relatório Final.docx # Análise completa dos resultados

##  Como Executar

### Pré-requisitos
- Python 3 ou superior
- Conta no GitHub com token de acesso pessoal

### Passo a passo

1. **Clone o repositório**
```bash
git clone https://github.com/LeonardoVieiraM/LaboratorioExperimentacaoSoftware.git
cd enunciado01

Crie e ative um ambiente virtual
bash
python -m venv venv

Instale as dependências
bash
pip install requests python-dotenv

Configure o token do GitHub
Crie um arquivo .env na raiz do projeto:
GITHUB_TOKEN=seu_token_aqui

Execute o script
bash
python main.py
Aguarde a coleta

Resultado
O arquivo relatorio_repositorios.csv será gerado no mesmo diretório.