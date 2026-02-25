import os
import requests
import random
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
  # Busca os repositórios mais estrelados (ordem decrescente)
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
        # Trazer nós de PRs mesclados com `authorAssociation` para
        # permitir contar PRs externos client-side (filtrar por associação).
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

def fetch_100_repos():
  repositorios = []
  cursor = None 
    
  while len(repositorios) < 100:
    variaveis = {"cursor": cursor}
    # usa retries exponenciais simples para 5xx/erros transitórios
    payload = {'query': QUERY, 'variables': variaveis}
    response = post_with_retries(payload)
        
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


def post_with_retries(payload, max_retries: int = 4, base_delay: float = 1.0):
  """Faz POST ao endpoint GraphQL com retries exponenciais para 5xx.

  Retorna o objeto `requests.Response` final (pode ser não-200).
  """
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

    # sucesso não-5xx: retorna imediatamente
    if resp.status_code < 500:
      return resp

    # 5xx: retry até max_retries
    if attempt >= max_retries:
      return resp

    sleep_for = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
    print(f"Received {resp.status_code}, retry {attempt}/{max_retries} after {sleep_for:.1f}s")
    time.sleep(sleep_for)

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
        # Conta PRs externos mesclados (autor não é OWNER/MEMBER/COLLABORATOR)
        excluded = {"OWNER", "MEMBER", "COLLABORATOR"}
        external_prs = 0

        pr_conn = repo.get('pullRequests') or {}
        nodes = pr_conn.get('nodes') or []
        for node in nodes:
          if node.get('authorAssociation') not in excluded:
            external_prs += 1

        print(f"RQ 02 (PRs Aceitos Externos): {external_prs}")
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