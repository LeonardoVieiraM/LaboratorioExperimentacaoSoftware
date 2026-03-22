import os
import requests
import random
import time
import subprocess
import shutil
import stat
import pandas as pd
import numpy as np
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from glob import glob

# Carrega .env
load_dotenv()

CK_JAR_PATH = os.getenv("CK_JAR_PATH")
token = os.getenv("GITHUB_TOKEN")
if not token:
    raise ValueError("Token não encontrado no .env. Verifique se GITHUB_TOKEN está configurado.")
URL = "https://api.github.com/graphql"
HEADERS = {"Authorization": f"Bearer {token}"}

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
    """Tratamento de erro para deletar arquivos somente-leitura (comum no Windows/.git)"""
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception:
        pass

class RepositoryAnalyzer:
    def __init__(self, repos_dir="cloned_repos"):
        self.repos_dir = Path(repos_dir).absolute()
        self.repos_dir.mkdir(exist_ok=True)
        self.ck_jar = Path(CK_JAR_PATH)
        
    def check_dependencies(self):
        """Valida a existência do CK.jar"""
        if not self.ck_jar.exists():
            print(f"ERRO: JAR do CK não encontrado em: {self.ck_jar}")
            return False
        return True

    def fetch_repos(self, total_target=1000):
        """Coleta metadados via GraphQL"""
        repositorios = []
        cursor = None
        while len(repositorios) < total_target:
            payload = {'query': QUERY, 'variables': {"cursor": cursor}}
            resp = requests.post(URL, json=payload, headers=HEADERS)
            if resp.status_code == 200:
                dados = resp.json()['data']['search']
                repositorios.extend(dados['nodes'])
                print(f"Coletados {len(repositorios)}/{total_target} repositórios...")
                if not dados['pageInfo']['hasNextPage']:
                    break
                cursor = dados['pageInfo']['endCursor']
                time.sleep(1)
            else:
                print(f"Erro na API: {resp.status_code} - {resp.text}")
                break
        return repositorios[:total_target]

    def clone_repository(self, repo_url, repo_name):
        """Realiza shallow clone do repositório"""
        safe_name = repo_name.replace('/', '_')
        repo_path = self.repos_dir / safe_name
        if repo_path.exists():
            shutil.rmtree(repo_path, onerror=on_rm_error)
        attempts = 3
        wait = 5
        for attempt in range(1, attempts + 1):
            try:
                proc = subprocess.run(["git", "clone", "--depth", "1", repo_url, str(repo_path)],
                                      capture_output=True, text=True, timeout=1200)
                if proc.returncode == 0:
                    return repo_path
                else:
                    print(f"git clone retornou {proc.returncode} para {repo_name} (tentativa {attempt}): {proc.stderr.strip()}")
            except subprocess.TimeoutExpired:
                print(f"git clone timeout para {repo_name} (tentativa {attempt})")
            except Exception as e:
                print(f"Erro ao executar git clone para {repo_name} (tentativa {attempt}): {e}")
            time.sleep(wait * attempt)
        return None

    def run_ck_tool(self, repo_path, repo_name):
        """Executa a ferramenta CK"""
        output_dir = self.repos_dir / "ck_results"
        output_dir.mkdir(exist_ok=True)
        prefix = str(output_dir / f"{repo_name.replace('/', '_')}_")
        try:
            proc = subprocess.run(
                ["java", "-jar", str(self.ck_jar), str(repo_path), "true", "0", "false", prefix],
                capture_output=True, text=True, timeout=1800
            )
            if proc.returncode != 0:
                print(f"CK retornou {proc.returncode} para {repo_name}: stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}")
                return None
            pattern = str(output_dir / f"{repo_name.replace('/', '_')}_*.csv")
            matches = list(Path(output_dir).glob(f"{repo_name.replace('/', '_')}_*.csv"))
            if not matches:
                return None
            class_files = [p for p in matches if 'class' in p.name.lower()]
            target = class_files[0] if class_files else matches[0]
            return target
        except subprocess.TimeoutExpired:
            print(f"CK timeout para {repo_name}")
            return None
        except Exception as e:
            print(f"Erro ao executar CK em {repo_name}: {e}")
            return None

    def calculate_loc(self, repo_path):
        """Calcula linhas de código via cloc"""
        try:
            result = subprocess.run(["cloc", "--csv", "--quiet", str(repo_path)],
                                   capture_output=True, text=True, timeout=300)
            if result.returncode != 0:
                print(f"cloc retornou {result.returncode} para {repo_path}: {result.stderr.strip()}")
                return {'comment': 0, 'code': 0}
            for line in result.stdout.strip().split('\n'):
                if line.startswith('Java'):
                    parts = line.split(',')
                    try:
                        return {'comment': int(parts[3]), 'code': int(parts[4])}
                    except Exception:
                        return {'comment': 0, 'code': 0}
            return {'comment': 0, 'code': 0}
        except Exception:
            return {'comment': 0, 'code': 0}

    def process_metrics(self, repos):
        """Fluxo principal de processamento de métricas"""
        all_metrics = []
        filename = "metricas_finais_1000.csv"
        
        for idx, repo in enumerate(repos, 1):
            name = repo['nameWithOwner']
            print(f"[{idx}/{len(repos)}] Processando: {name}")
            
            repo_path = self.clone_repository(repo['url'], name)
            if not repo_path:
                continue

            try:
                ck_file = self.run_ck_tool(repo_path, name)
                loc_data = self.calculate_loc(repo_path)
                
                created_at = datetime.fromisoformat(repo['createdAt'].replace('Z', '+00:00'))
                idade_anos = (datetime.now(timezone.utc) - created_at).days / 365.25

                if ck_file and ck_file.exists():
                    df_ck = pd.read_csv(ck_file)
                    if not df_ck.empty:
                        cbo_mean = df_ck['cbo'].mean() if 'cbo' in df_ck.columns else np.nan
                        dit_mean = df_ck['dit'].mean() if 'dit' in df_ck.columns else np.nan
                        lcom_mean = df_ck['lcom'].mean() if 'lcom' in df_ck.columns else np.nan
                        metric_entry = {
                            "Nome": name,
                            "Stars": repo['stargazerCount'],
                            "Idade_Anos": round(idade_anos, 2),
                            "Releases": repo['releases']['totalCount'],
                            "LOC": loc_data['code'],
                            "CBO_Media": cbo_mean,
                            "DIT_Media": dit_mean,
                            "LCOM_Media": lcom_mean
                        }
                        all_metrics.append(metric_entry)
                        print(f"   > Sucesso: {name} analisado.")
                        
                        pd.DataFrame(all_metrics).to_csv(filename, index=False)
                    else:
                        print(f"   > Aviso: CK gerou arquivo vazio para {name}")
                else:
                    print(f"   > Erro: CK falhou em gerar métricas para {name}")

            except Exception as e:
                print(f"   > Erro inesperado em {name}: {e}")
            
            finally:
                if repo_path and repo_path.exists():
                    shutil.rmtree(repo_path, onerror=on_rm_error)
            
        return all_metrics

if __name__ == "__main__":
    analyzer = RepositoryAnalyzer()
    if analyzer.check_dependencies():
        print("Buscando lista de repositórios...")
        
        # Alterar para 1000 dps
        repos = analyzer.fetch_repos(total_target=1) 
        
        print(f"\nIniciando análise de {len(repos)} repositórios...")
        final_data = analyzer.process_metrics(repos)
        
        if final_data:
            print(f"\nConcluído! Total de {len(final_data)} repositórios salvos em 'metricas_finais_1000.csv'.")
        else:
            print("\nNenhum repositório pôde ser analisado com sucesso.")