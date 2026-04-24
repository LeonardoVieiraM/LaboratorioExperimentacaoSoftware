import os
import requests
import time
import pandas as pd
import threading
from datetime import datetime, timezone
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed

# Carrega o token do arquivo .env
load_dotenv()
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").replace('"', '').replace("'", "")

if not GITHUB_TOKEN:
    raise ValueError("Verifique o GITHUB_TOKEN no arquivo .env")

URL_GITHUB = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {GITHUB_TOKEN}"}

csv_lock = threading.Lock()

# Configurações globais
TARGET_REPOS = 200  
MIN_PRS_PER_REPO = 100  
MAX_WORKERS = 2  

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

def load_existing_data():
    """
    Carrega dados existentes do CSV e retorna a lista de PRs e conjunto de repositórios processados.
    """
    csv_path = "enunciado03/dataset_code_review.csv"
    if os.path.exists(csv_path):
        try:
            df = pd.read_csv(csv_path)
            processed_repos = set(df["Repositorio"].unique())
            prs_data = df.to_dict('records')
            print(f"--> Carregados dados existentes: {len(df)} PRs de {len(processed_repos)} repositórios.\n")
            return prs_data, processed_repos
        except Exception as e:
            print(f"--> Erro ao carregar CSV existente: {e}. Iniciando do zero.\n")
            return [], set()
    return [], set()

def get_unique_repo_count(prs_data):
    """
    Retorna o número de repositórios únicos no dataset de PRs.
    """
    return len(set(pr["Repositorio"] for pr in prs_data))

def process_repo_task(repo_full_name, index, total):
    """
    Processa PRs de um repositório e retorna os resultados.
    Retorna: (sucesso: bool, prs: list, repo_name: str)
    Sucesso é True apenas se conseguir MIN_PRS_PER_REPO ou mais PRs.
    """
    try:
        print(f"[{index}/{total}] Minerando PRs de: {repo_full_name}...")
        prs = process_prs_for_repo(repo_full_name, limit_valid_prs=MIN_PRS_PER_REPO)
        
        if len(prs) >= MIN_PRS_PER_REPO:
            print(f"   ✓ {repo_full_name}: {len(prs)} PRs coletadas (meta atingida)")
            return (True, prs, repo_full_name)
        else:
            print(f"   ✗ {repo_full_name}: apenas {len(prs)} PRs (insuficiente, descartando)")
            return (False, [], repo_full_name)
    except Exception as e:
        if "Múltiplos erros 502/504" in str(e):
            print(f"   ✗ {repo_full_name}: múltiplos erros 502/504 do GitHub (ignorando)")
        else:
            print(f"[{index}/{total}] Erro ao processar {repo_full_name}: {type(e).__name__}")
        return (False, [], repo_full_name)

def fetch_top_repos(target=500):
    """
    Busca repositórios populares. Usa target>200 para ter opções em caso de filtros rigorosos.
    Retorna lista de repositórios com pelo menos 100 PRs no GitHub.
    """
    print(f"--> Buscando os {target} repositórios mais populares...")
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
                print(f"   Fim da busca: {len(repos)} repositórios encontrados")
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
    error_502_504_count = 0  # Contador de erros 502/504
    
    while len(valid_prs) < limit_valid_prs:
        variables = {"owner": owner, "name": name, "cursor": cursor}
        try:
            response = requests.post(URL_GITHUB, json={"query": QUERY_PRS, "variables": variables}, headers=HEADERS)
            
            # Verificar erros 502 ou 504
            if response.status_code in [502, 504]:
                error_502_504_count += 1
                if error_502_504_count > 2:
                    raise Exception(f"Múltiplos erros 502/504 ({error_502_504_count} tentativas)")
                print(f"   ⚠ Erro {response.status_code} (tentativa {error_502_504_count}/2). Retentando...")
                time.sleep(15)
                continue
            
            # Trava de segurança contra erros de HTML/Timeout do GitHub
            if response.status_code != 200:
                print(f"   > GitHub muito ocupado (Status {response.status_code}). Pausando 10s...")
                time.sleep(10)
                continue
            
            # Reset contador em sucesso
            error_502_504_count = 0
            
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
            if "Múltiplos erros 502/504" in str(e):
                raise
            print(f"   > Exceção ao ler PRs. Retentando em breve... ({type(e).__name__})")
            time.sleep(5)
            
    return valid_prs

if __name__ == "__main__":
    # Carregar dados existentes
    todas_prs_validas, processed_repos = load_existing_data()
    unique_repos_count = get_unique_repo_count(todas_prs_validas)
    
    # Buscar repositórios candidatos (com buffer)
    candidate_repos = fetch_top_repos(target=500)
    
    # Filtrar repositórios já processados
    remaining_repos = [r for r in candidate_repos if r not in processed_repos]
    print(f"--> Repositórios não processados: {len(remaining_repos)} (de {len(candidate_repos)} candidatos)\n")
    
    if not remaining_repos:
        print("--> Todos os repositórios candidatos já foram processados!")
        print(f"--> Dataset contém {unique_repos_count} repositórios e {len(todas_prs_validas)} PRs.")
    else:
        try:
            # Loop para continuar até atingir TARGET_REPOS repositórios únicos
            while unique_repos_count < TARGET_REPOS and remaining_repos:
                repos_needed = TARGET_REPOS - unique_repos_count
                batch = remaining_repos[:min(MAX_WORKERS * 2, len(remaining_repos))]
                remaining_repos = remaining_repos[len(batch):]
                
                print(f"\n--> Processando lote com {len(batch)} repositórios (necessários: {repos_needed})...")
                
                with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                    futures = {}
                    for i, repo in enumerate(batch, 1):
                        future = executor.submit(
                            process_repo_task,
                            repo,
                            i,
                            len(batch)
                        )
                        futures[future] = repo
                    
                    # Processar resultados conforme completam
                    for future in as_completed(futures):
                        try:
                            success, prs, repo_name = future.result()
                            if success:
                                # Acesso thread-safe para escrita
                                with csv_lock:
                                    todas_prs_validas.extend(prs)
                                    processed_repos.add(repo_name)
                                    unique_repos_count = get_unique_repo_count(todas_prs_validas)
                                    
                                    # Salvar CSV após cada repo bem-sucedido
                                    df_temp = pd.DataFrame(todas_prs_validas)
                                    df_temp.to_csv("enunciado03/dataset_code_review.csv", index=False)
                                    print(f"      > Salvo! Repositórios: {unique_repos_count}/{TARGET_REPOS}, PRs: {len(todas_prs_validas)}")
                            else:
                                # Se não sucesso, marcar como processado para não retentá-lo
                                with csv_lock:
                                    processed_repos.add(repo_name)
                        except Exception as e:
                            print(f"Erro em tarefa paralela: {type(e).__name__} - {str(e)}")
                            # Marcar como processado mesmo em erro
                            with csv_lock:
                                if 'repo_name' in locals():
                                    processed_repos.add(repo_name)
                
                if unique_repos_count >= TARGET_REPOS:
                    print(f"\n✓ Meta atingida: {unique_repos_count} repositórios com {len(todas_prs_validas)} PRs!")
                    break
                
                if not remaining_repos and unique_repos_count < TARGET_REPOS:
                    print(f"\n⚠ Fim dos repositórios candidatos antes de atingir meta.")
                    print(f"   {unique_repos_count}/{TARGET_REPOS} repositórios processados com sucesso.")
                    break
        
        except KeyboardInterrupt:
            print("\n--> Mineração pausada manualmente!")
            with csv_lock:
                df_final = pd.DataFrame(todas_prs_validas)
                df_final.to_csv("enunciado03/dataset_code_review.csv", index=False)
                print(f"--> Dados salvos: {len(todas_prs_validas)} PRs de {unique_repos_count} repositórios.")
    
    # Relatório final
    print(f"\n" + "="*60)
    print(f"PROCESSO FINALIZADO!")
    print(f"={'='*60}")
    print(f"Arquivo: dataset_code_review.csv")
    print(f"Repositórios únicos: {unique_repos_count}/{TARGET_REPOS}")
    print(f"Total de PRs coletadas: {len(todas_prs_validas)}")
    print(f"PRs por repositório (média): {len(todas_prs_validas) / unique_repos_count if unique_repos_count > 0 else 0:.1f}")
    print(f"{'='*60}")