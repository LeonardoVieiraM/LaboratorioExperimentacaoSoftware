import os
import requests
import random
import time
import csv 
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()
token = os.getenv("GITHUB_TOKEN")

if not token:
    raise ValueError("Token não encontrado. Verifique se o arquivo .env contém GITHUB_TOKEN=seu_token")

URL = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {token}"}

QUERY = """
query($cursor: String) {
    search(query: "stars:>10000 sort:stars-desc", type: REPOSITORY, first: 10, after: $cursor) {
    pageInfo {
      endCursor
      hasNextPage
    }
    nodes {
      ... on Repository {
        nameWithOwner
        createdAt
        updatedAt
        primaryLanguage {
          name
        }
        releases {
          totalCount
        }
        pullRequests(states: MERGED, first: 100) {
          nodes {
            authorAssociation
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          totalCount
        }
        totalIssues: issues {
          totalCount
        }
        closedIssues: issues(states: CLOSED) {
          totalCount
        }
      }
    }
  }
}
"""

def fetch_repos(total_target=1000):
    """Busca os repositórios no GitHub até atingir o total_target."""
    repositorios = []
    cursor = None 
    
    while len(repositorios) < total_target:
        variaveis = {"cursor": cursor}
        payload = {'query': QUERY, 'variables': variaveis}
        
        try:
            response = post_with_retries(payload)
        except Exception as e:
            print(f"Erro fatal ao buscar dados: {e}")
            break 
            
        if response.status_code == 200:
            dados = response.json()
            
            if 'errors' in dados:
                raise Exception(f"Erro na API do GitHub: {dados['errors']}")
                
            busca = dados['data']['search']
            repositorios.extend(busca['nodes'])
            
            print(f"Coletados {len(repositorios)} de {total_target} repositórios...")
            
            page_info = busca['pageInfo']
            if page_info['hasNextPage']:
                cursor = page_info['endCursor']
            else:
                break 
                
            time.sleep(1)
        else:
            raise Exception(f"Falha na requisição: {response.status_code} - {response.text}")
            
    return repositorios[:total_target]

def post_with_retries(payload, max_retries: int = 10, base_delay: float = 1.0):
 
    attempt = 0
    while True:
        attempt += 1
        try:
            resp = requests.post(URL, json=payload, headers=HEADERS)
        except requests.RequestException as e:
            if attempt >= max_retries:
                raise
            sleep_for = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            print(f"Request exception, retry {attempt}/{max_retries} after {sleep_for:.1f}s: {e}")
            time.sleep(sleep_for)
            continue

        if resp.status_code < 500:
            return resp

        if attempt >= max_retries:
            return resp

        sleep_for = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
        print(f"Received {resp.status_code}, retry {attempt}/{max_retries} after {sleep_for:.1f}s")
        time.sleep(sleep_for)

def process_metrics(repos):
    """Calcula as métricas e organiza os dados em formato de Dicionário."""
    hoje = datetime.now(timezone.utc)
    metricas_organizadas = []

    for repo in repos:
        if not repo: 
            continue

        nome = repo['nameWithOwner']
        
        created_at = datetime.fromisoformat(repo['createdAt'].replace('Z', '+00:00'))
        updated_at = datetime.fromisoformat(repo['updatedAt'].replace('Z', '+00:00'))
        
        idade_dias = (hoje - created_at).days
        dias_sem_atualizar = (hoje - updated_at).days
        
        linguagem = repo['primaryLanguage']['name'] if repo['primaryLanguage'] else "Nenhuma"
        
        total_issues = repo['totalIssues']['totalCount']
        closed_issues = repo['closedIssues']['totalCount']
        razao_issues = (closed_issues / total_issues * 100) if total_issues > 0 else 0

        excluded = {"OWNER", "MEMBER", "COLLABORATOR"}
        external_prs = 0

        pr_conn = repo.get('pullRequests') or {}
        nodes = pr_conn.get('nodes') or []
        for node in nodes:
            if node.get('authorAssociation') not in excluded:
                external_prs += 1

        metricas_organizadas.append({
            "Nome do Repositório": nome,
            "Idade (dias)": idade_dias,
            "PRs Aceitos Externos": external_prs,
            "Releases": repo['releases']['totalCount'],
            "Dias sem atualizar": dias_sem_atualizar,
            "Linguagem": linguagem,
            "Total Issues": total_issues,
            "Issues Fechadas": closed_issues,
            "Razão Issues Fechadas (%)": str(round(razao_issues, 2)).replace('.', ',')
        })

    return metricas_organizadas

def export_to_csv(data, filename="relatorio_repositorios.csv"):
    """Recebe os dados processados e gera o arquivo .csv."""
    if not data:
        print("Nenhum dado para exportar.")
        return

    colunas = data[0].keys()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    filepath = os.path.join(script_dir, filename)

    with open(filepath, mode='w', newline='', encoding='utf-8') as arquivo_csv:
        writer = csv.DictWriter(arquivo_csv, fieldnames=colunas)
        writer.writeheader()
        writer.writerows(data)

    print(f"Sucesso! Dados exportados para o arquivo: {filepath}")

if __name__ == "__main__":
    print("Iniciando a busca em lotes... Isso vai demorar um pouquinho (1000 repositórios).")
    try:
        repos_brutos = fetch_repos(total_target=1000)
        
        print("\nCalculando as métricas finais...")
        dados_processados = process_metrics(repos_brutos)
        
        export_to_csv(dados_processados)
        
    except Exception as e:
        print(f"\nErro durante a execução: {e}")