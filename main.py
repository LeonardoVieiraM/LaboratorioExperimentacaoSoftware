import os
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
import time

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
        pullRequests(states: MERGED) {
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

def fetch_100_repos():
    repositorios = []
    cursor = None 
    
    while len(repositorios) < 100:
        variaveis = {"cursor": cursor}
        response = requests.post(URL, json={'query': QUERY, 'variables': variaveis}, headers=HEADERS)
        
        if response.status_code == 200:
            dados = response.json()
            
            if 'errors' in dados:
                raise Exception(f"Erro na API do GitHub: {dados['errors']}")
                
            busca = dados['data']['search']
            repositorios.extend(busca['nodes'])
            
            print(f"Coletados {len(repositorios)} repositórios...")
            
            page_info = busca['pageInfo']
            if page_info['hasNextPage']:
                cursor = page_info['endCursor']
            else:
                break 
                
            time.sleep(1)
        else:
            raise Exception(f"Falha na requisição: {response.status_code} - {response.text}")
            
    return repositorios[:100] 

def calculate_metrics_and_print(repos):
    hoje = datetime.now(timezone.utc)

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

        print(f"Repositório: {nome}")
        print(f"RQ 01 (Idade): {idade_dias} dias")
        print(f"RQ 02 (PRs Aceitos): {repo['pullRequests']['totalCount']}")
        print(f"RQ 03 (Releases): {repo['releases']['totalCount']}")
        print(f"RQ 04 (Sem atualizar): {dias_sem_atualizar} dias")
        print(f"RQ 05 (Linguagem): {linguagem}")
        print(f"RQ 06 (Razão Issues Fechadas): {razao_issues:.2f}% ({closed_issues} de {total_issues})")
        print("-" * 50)

if __name__ == "__main__":
    print("Iniciando a busca em lotes para evitar sobrecarga (502)...")
    try:
        repos = fetch_100_repos()
        print("\nCalculando as métricas finais...\n")
        calculate_metrics_and_print(repos)
        print(f"Total de repositórios analisados com sucesso: {len(repos)}")
    except Exception as e:
        print(f"\nErro durante a execução: {e}")