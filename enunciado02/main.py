import os
import requests
import time
import subprocess
import shutil
import stat
import pandas as pd
import json
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv()

# Configurações do ambiente
CK_JAR_PATH = os.getenv("CK_JAR_PATH", "").replace('"', '').replace("'", "")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").replace('"', '').replace("'", "")

if not GITHUB_TOKEN or not os.path.exists(CK_JAR_PATH):
    raise ValueError("Verifique GITHUB_TOKEN e CK_JAR_PATH no arquivo .env")

URL_GITHUB = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {GITHUB_TOKEN}"}

# Query para buscar em blocos de 25
QUERY_GRAPHQL = """
query($cursor: String) {
    search(query: "language:Java stars:>1000 sort:stars-desc", type: REPOSITORY, first: 25, after: $cursor) {
        pageInfo { endCursor hasNextPage }
        nodes {
            ... on Repository {
                nameWithOwner
                url
                createdAt
                stargazerCount
                releases { totalCount }
            }
        }
    }
}
"""

def on_rm_error(func, path, exc_info):
    """Força a exclusão de arquivos protegidos ou somente leitura no Windows"""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

class RepositoryAnalyzer:
    def __init__(self):
        self.base_dir = Path.cwd() / "enunciado02"
        self.cloned_repos_dir = self.base_dir / "cloned_repos"
        self.ck_results_dir = self.base_dir / "ck_results"
        self.output_file = self.base_dir / "metricas_finais_1000.csv"
        
        for folder in [self.cloned_repos_dir, self.ck_results_dir]:
            folder.mkdir(parents=True, exist_ok=True)

        # Carrega progresso existente para evitar duplicatas
        self.processed_repos = set()
        if self.output_file.exists():
            try:
                df_existing = pd.read_csv(self.output_file)
                self.processed_repos = set(df_existing['Nome'].unique())
                print(f"--> Retomando: {len(self.processed_repos)} repositórios já processados.")
            except Exception:
                pass

    def run_analysis(self, total_target=1000):
        """Busca e processa repositórios em lotes para evitar atrasos na inicialização."""
        cursor = None
        count = len(self.processed_repos) + 1
        
        print(f"--> Iniciando coleta de dados (Alvo: {total_target} repositórios)")

        while count <= total_target:
            # Busca um lote via GraphQL
            variables = {"cursor": cursor}
            try:
                response = requests.post(URL_GITHUB, 
                                      json={"query": QUERY_GRAPHQL, "variables": variables}, 
                                      headers=HEADERS, 
                                      timeout=(10, 30))
                data = response.json().get("data", {}).get("search", {})
                nodes = data.get("nodes", [])
                
                if not nodes:
                    print("--> Nenhum repositório adicional encontrado.")
                    break
            except Exception as e:
                print(f"--> Erro na API: {e}. Re-tentando em 10s...")
                time.sleep(10)
                continue

            # Processa o lote imediatamente
            for repo in nodes:
                name = repo["nameWithOwner"]
                
                # Pula se já estiver no CSV
                if name in self.processed_repos:
                    continue
                
                if count > total_target: break

                url = repo["url"]
                repo_folder = name.replace("/", "_")
                repo_path = self.cloned_repos_dir / repo_folder
                repo_results_dir = self.ck_results_dir / f"{repo_folder}_tmp"
                
                print(f"\n[{count}/{total_target}] Processando: {name}")

                try:
                    # Limpeza de resíduos anteriores
                    if repo_path.exists(): shutil.rmtree(repo_path, onerror=on_rm_error)
                    if repo_results_dir.exists(): shutil.rmtree(repo_results_dir, onerror=on_rm_error)
                    repo_results_dir.mkdir(parents=True, exist_ok=True)

                    # Clone progressivo com suporte a caminhos longos
                    print(f"   > Clonando...")
                    result = subprocess.run(
                        ["git", "-c", "core.longpaths=true", "clone", "--depth", "1", url, str(repo_path)], 
                        capture_output=True, text=True, timeout=300
                    )

                    if result.returncode != 0:
                        print(f"   > Erro no clone: {result.stderr.strip()[:100]}")
                        continue

                    # Validação de conteúdo Java 
                    java_files = list(Path(repo_path).rglob("*.java"))
                    if not java_files:
                        print("   > Pulando: Nenhum arquivo Java encontrado.")
                        continue

                    # Medição de comentários via CLOC
                    cloc_proc = subprocess.run(["cloc", str(repo_path), "--json", "--quiet"], 
                                               capture_output=True, text=True)
                    comments = 0
                    if cloc_proc.returncode == 0:
                        try:
                            comments = json.loads(cloc_proc.stdout).get("Java", {}).get("comment", 0)
                        except Exception: comments = 0

                    # Execução do CK com 4GB de RAM para lidar com repos grandes 
                    print(f"   > Executando CK (Heap: 4GB)...")
                    subprocess.run([
                        "java", "-Xmx4G", "-jar", CK_JAR_PATH,
                        str(repo_path), "true", "0", "false", str(repo_results_dir) + "/"
                    ], capture_output=True, timeout=600)

                    # Processamento das métricas de qualidade
                    class_csv = repo_results_dir / "class.csv"
                    if class_csv.exists() and class_csv.stat().st_size > 0:
                        df_class = pd.read_csv(class_csv)
                        if not df_class.empty and "cbo" in df_class.columns:
                            metrics = {
                                "Nome": name,
                                "Popularidade_Stars": repo["stargazerCount"],
                                "Maturidade_Idade": round((datetime.now(timezone.utc) - datetime.fromisoformat(repo["createdAt"].replace("Z", "+00:00"))).days / 365.25, 2),
                                "Atividade_Releases": repo["releases"]["totalCount"],
                                "Tamanho_LOC": int(df_class["loc"].sum()),
                                "Tamanho_Comentarios": comments,
                                "CBO_Media": round(df_class["cbo"].mean(), 2),
                                "CBO_Mediana": round(df_class["cbo"].median(), 2),
                                "CBO_DesvioPadrao": round(df_class["cbo"].std(), 2),
                                "DIT_Media": round(df_class["dit"].mean(), 2),
                                "DIT_Mediana": round(df_class["dit"].median(), 2),
                                "DIT_DesvioPadrao": round(df_class["dit"].std(), 2),
                                "LCOM_Media": round(df_class["lcom"].mean(), 2),
                                "LCOM_Mediana": round(df_class["lcom"].median(), 2),
                                "LCOM_DesvioPadrao": round(df_class["lcom"].std(), 2)
                            }
                            # Escrita incremental no CSV
                            df_temp = pd.DataFrame([metrics])
                            df_temp.to_csv(self.output_file, mode='a', header=not os.path.exists(self.output_file), index=False)
                            self.processed_repos.add(name)
                            count += 1
                            print(f"   > Sucesso.")
                        else:
                            print(f"   > Aviso: CK não extraiu classes válidas para {name}")
                    else:
                        print(f"   > Aviso: Falha no CK (Arquivo vazio/não gerado)")

                except subprocess.TimeoutExpired:
                    print(f"   > Erro: Tempo limite excedido para {name}")
                except Exception as e:
                    print(f"   > Erro inesperado: {e}")
                finally:
                    # Limpeza de disco
                    if repo_path.exists(): shutil.rmtree(repo_path, onerror=on_rm_error)
                    if repo_results_dir.exists(): shutil.rmtree(repo_results_dir, onerror=on_rm_error)

            # Paginação do GitHub
            if not data.get("pageInfo", {}).get("hasNextPage"): break
            cursor = data.get("pageInfo", {}).get("endCursor")

if __name__ == "__main__":
    analyzer = RepositoryAnalyzer()
    analyzer.run_analysis(1000)