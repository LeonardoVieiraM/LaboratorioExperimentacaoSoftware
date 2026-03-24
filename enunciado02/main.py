import os
import requests
import time
import subprocess
import shutil
import stat
import pandas as pd
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Carrega arquivo .env
load_dotenv()

CK_JAR_PATH = os.getenv("CK_JAR_PATH")
token = os.getenv("GITHUB_TOKEN")

if not token:
    raise ValueError("GITHUB_TOKEN não encontrado no arquivo .env")

URL = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {token}"}

# Query GraphQL para buscar repositórios Java populares
QUERY = """
query($cursor: String) {
    search(query: "language:Java stars:>1000 sort:stars-desc", type: REPOSITORY, first: 10, after: $cursor) {
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
    """Tratamento de erro para ficheiros somente-leitura (comum no Windows/.git)"""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

class RepositoryAnalyzer:
    def __init__(self):
        self.base_dir = Path.cwd()
        self.cloned_repos_dir = self.base_dir / "enunciado02/cloned_repos"
        self.ck_results_dir = self.base_dir / "enunciado02/ck_results"
        self.output_file = "enunciado02/metricas_finais_1000.csv"
        
        # 1.  Remove o CSV antigo ao iniciar uma nova execução do zero
        if os.path.exists(self.output_file):
            print(f"Limpando ficheiro de saída anterior: {self.output_file}")
            os.remove(self.output_file)
            
        self.cloned_repos_dir.mkdir(exist_ok=True)
        self.ck_results_dir.mkdir(exist_ok=True)

    def fetch_repos(self, total_target=1000):
        all_repos = []
        cursor = None
        while len(all_repos) < total_target:
            variables = {"cursor": cursor}
            response = requests.post(URL, json={"query": QUERY, "variables": variables}, headers=HEADERS)
            if response.status_code != 200:
                break
            data = response.json().get("data", {}).get("search", {})
            nodes = data.get("nodes", [])
            all_repos.extend(nodes)
            if not data.get("pageInfo", {}).get("hasNextPage"):
                break
            cursor = data.get("pageInfo", {}).get("endCursor")
        return all_repos[:total_target]

    def process_metrics(self, repos):
        for i, repo in enumerate(repos, 1):
            name = repo["nameWithOwner"]
            url = repo["url"]
            repo_folder = name.replace("/", "_")
            repo_path = self.cloned_repos_dir / repo_folder
            
            print(f"\n[{i}/{len(repos)}] Processando: {name}")

            # 2. Garante que a pasta está vazia antes do clone
            if repo_path.exists():
                shutil.rmtree(repo_path, onerror=on_rm_error)

            try:
                # Clone do repositório
                print(f"   > Clonando...")
                result = subprocess.run(
                    ["git", "-c", "core.longpaths=true", "clone", url, str(repo_path)], 
                    capture_output=True, 
                    text=True
                )                
                if result.returncode != 0:
                    print(f"   > Erro no clone: {result.stderr.strip()}")
                    continue

                # Filtro de arquivos Java
                java_files = list(Path(repo_path).rglob("*.java"))
                if not java_files:
                    print("   > Pulando: Nenhum arquivo Java encontrado.")
                    continue

                # Execução do CK
                repo_results_dir = self.ck_results_dir / f"{repo_folder}_tmp"
                repo_results_dir.mkdir(exist_ok=True)
                
                print(f"   > Analisando com CK...")
                subprocess.run([
                    "java", "-jar", CK_JAR_PATH,
                    str(repo_path), "true", "0", "false", str(repo_results_dir) + os.sep
                ], capture_output=True)

                class_csv = repo_results_dir / "class.csv"
                if class_csv.exists():
                    df_class = pd.read_csv(class_csv)
                    
                    metrics = {
                        "Nome": name,
                        "Stars": repo["stargazerCount"],
                        "Idade_Anos": round((datetime.now(timezone.utc) - datetime.fromisoformat(repo["createdAt"].replace("Z", "+00:00"))).days / 365.25, 2),
                        "Releases": repo["releases"]["totalCount"],
                        "LOC": int(df_class["loc"].sum()),
                        "CBO_Media": round(df_class["cbo"].mean(), 2),
                        "DIT_Media": int(df_class["dit"].max()),
                        "LCOM_Media": round(df_class["lcom"].mean(), 2)
                    }
                    
                    # 3. Escreve no CSV imediatamente para salvar progresso
                    df_temp = pd.DataFrame([metrics])
                    df_temp.to_csv(self.output_file, mode='a', header=not os.path.exists(self.output_file), index=False)
                    
                    print(f"   > Sucesso: {name} (LOC: {metrics['LOC']})")
                    
                    # Limpa resultados temporários do CK
                    shutil.rmtree(repo_results_dir, onerror=on_rm_error)
                else:
                    print("   > Falha: CK não gerou resultados.")

            except Exception as e:
                print(f"   > Erro inesperado: {e}")
            
            finally:
                # 4. Apaga a pasta clonada apos execução
                if repo_path.exists():
                    shutil.rmtree(repo_path, onerror=on_rm_error)
                    print(f"   > Pasta temporária removida.")

if __name__ == "__main__":
    analyzer = RepositoryAnalyzer()
    print("Buscando lista de repositórios no GitHub...")
    # MUDAR TOTAL_TARGET PRA 1000 DPS
    repos_to_analyze = analyzer.fetch_repos(total_target=10) 
    
    print(f"Iniciando análise de {len(repos_to_analyze)} repositórios...")
    analyzer.process_metrics(repos_to_analyze)
    print(f"\nProcesso concluído. Verifique o ficheiro: {analyzer.output_file}")