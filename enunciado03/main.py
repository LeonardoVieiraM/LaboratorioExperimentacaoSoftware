import os
import requests
import time
import pandas as pd
from datetime import datetime, timezone
from dotenv import load_dotenv

# Carrega o token do arquivo .env
load_dotenv()
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").replace('"', '').replace("'", "")

if not GITHUB_TOKEN:
    raise ValueError("Verifique o GITHUB_TOKEN no arquivo .env")

URL_GITHUB = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {GITHUB_TOKEN}"}

# Query 1: Buscar os repositórios mais populares
QUERY_REPOS = """
query($cursor: String) {
    search(query: "stars:>1000 sort:stars-desc", type: REPOSITORY, first: 50, after: $cursor) {
        pageInfo { endCursor hasNextPage }
        nodes {
            ... on Repository {
                nameWithOwner
                pullRequests(states: [MERGED, CLOSED]) { totalCount }
            }
        }
    }
}
"""

# Query 2: Reduzimos de first: 100 para first: 40 para não estourar o limite do servidor do GitHub
QUERY_PRS = """
query($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
        pullRequests(first: 40, states: [MERGED, CLOSED], after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
            pageInfo { endCursor hasNextPage }
            nodes {
                state
                createdAt
                closedAt
                mergedAt
                body
                additions
                deletions
                changedFiles
                reviews { totalCount }
                participants { totalCount }
                comments { totalCount }
            }
        }
    }
}
"""

def fetch_top_repos(target=200):
    print("--> Buscando os 200 repositórios mais populares...")
    repos = []
    cursor = None
    
    while len(repos) < target:
        try:
            response = requests.post(URL_GITHUB, json={"query": QUERY_REPOS, "variables": {"cursor": cursor}}, headers=HEADERS)
            if response.status_code != 200:
                print(f"GitHub retornou status {response.status_code}. Aguardando...")
                time.sleep(10)
                continue
                
            data = response.json().get("data", {}).get("search", {})
            for node in data.get("nodes", []):
                if node and node.get("pullRequests", {}).get("totalCount", 0) >= 100:
                    repos.append(node["nameWithOwner"])
                    if len(repos) == target:
                        break
            
            if not data.get("pageInfo", {}).get("hasNextPage"):
                break
            cursor = data.get("pageInfo", {}).get("endCursor")
        except Exception as e:
            print(f"Erro na API. Retentando... {e}")
            time.sleep(5)
            
    return repos

def process_prs_for_repo(repo_full_name, limit_valid_prs=50):
    owner, name = repo_full_name.split("/")
    cursor = None
    valid_prs = []
    
    while len(valid_prs) < limit_valid_prs:
        variables = {"owner": owner, "name": name, "cursor": cursor}
        try:
            response = requests.post(URL_GITHUB, json={"query": QUERY_PRS, "variables": variables}, headers=HEADERS)
            
            # Trava de segurança contra erros de HTML/Timeout do GitHub
            if response.status_code != 200:
                print(f"   > GitHub muito ocupado (Status {response.status_code}). Pausando 10s...")
                time.sleep(10)
                continue
                
            data = response.json()
            if "errors" in data:
                print(f"   > Erro GraphQL ignorado: {data['errors'][0].get('message')}")
                break

            pull_requests = data.get("data", {}).get("repository", {}).get("pullRequests", {})
            nodes = pull_requests.get("nodes", [])
            
            if not nodes:
                break
                
            for pr in nodes:
                if not pr: continue # Pula se o PR vier completamente nulo
                
                # Extração segura usando .get() encadeado para evitar o erro 'NoneType'
                reviews_count = (pr.get("reviews") or {}).get("totalCount", 0)
                participants_count = (pr.get("participants") or {}).get("totalCount", 0)
                comments_count = (pr.get("comments") or {}).get("totalCount", 0)
                
                if reviews_count < 1:
                    continue
                
                created_at = pr.get("createdAt")
                merged_at = pr.get("mergedAt")
                closed_at = pr.get("closedAt")
                
                if not created_at: continue
                
                created_dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                end_date_str = merged_at if merged_at else closed_at
                
                if not end_date_str: continue 
                    
                end_dt = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                duration_hours = (end_dt - created_dt).total_seconds() / 3600.0
                
                if duration_hours < 1:
                    continue
                
                desc_body = pr.get("body")
                desc_length = len(desc_body) if desc_body else 0
                
                valid_prs.append({
                    "Repositorio": repo_full_name,
                    "Status": pr.get("state", "UNKNOWN"),
                    "Tamanho_Arquivos": pr.get("changedFiles", 0),
                    "Tamanho_Linhas_Adicionadas": pr.get("additions", 0),
                    "Tamanho_Linhas_Removidas": pr.get("deletions", 0),
                    "Tempo_Analise_Horas": round(duration_hours, 2),
                    "Descricao_Caracteres": desc_length,
                    "Interacoes_Participantes": participants_count,
                    "Interacoes_Comentarios": comments_count,
                    "Revisoes": reviews_count
                })
                
                if len(valid_prs) >= limit_valid_prs:
                    break

            if not pull_requests.get("pageInfo", {}).get("hasNextPage"):
                break
            cursor = pull_requests.get("pageInfo", {}).get("endCursor")
            
        except Exception as e:
            print(f"   > Exceção ao ler PRs. Retentando em breve... ({type(e).__name__})")
            time.sleep(5)
            
    return valid_prs

if __name__ == "__main__":
    repos = fetch_top_repos(200)
    print(f"--> {len(repos)} repositórios mapeados com sucesso!\n")
    
    todas_prs_validas = []
    
    # Adicionamos um Try/Except geral para salvar os dados caso você precise cancelar
    try:
        for i, repo in enumerate(repos, 1):
            print(f"[{i}/200] Minerando PRs de: {repo}...")
            prs = process_prs_for_repo(repo, limit_valid_prs=50)
            todas_prs_validas.extend(prs)
            
            # Salva o arquivo CSV de forma iterativa a cada repositório concluído
            if todas_prs_validas:
                df_temp = pd.DataFrame(todas_prs_validas)
                df_temp.to_csv("dataset_code_review.csv", index=False)
                print(f"   > Salvo! Total acumulado: {len(todas_prs_validas)} PRs válidas.")
    except KeyboardInterrupt:
        print("\n--> Mineração pausada manualmente!")
        
    print(f"\n--> Processo finalizado! O arquivo 'dataset_code_review.csv' está pronto.")