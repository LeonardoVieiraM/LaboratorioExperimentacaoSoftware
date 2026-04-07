import pandas as pd
import os

# Carregar o arquivo CSV
file_path = 'enunciado02\metricas_finais_1000.csv'

# Verificar se o arquivo existe
if not os.path.exists(file_path):
    print(f"Erro: Arquivo '{file_path}' não encontrado!")
    exit(1)

# Ler o CSV
df = pd.read_csv(file_path)

# Limpar nomes das colunas (remover espaços extras)
df.columns = df.columns.str.strip()

print("=" * 80)
print("ANÁLISE DE MÉTRICAS DE SOFTWARE - TOP 15 REPOSITÓRIOS")
print("=" * 80)

# 1. TOP 15 - Tamanho_LOC (Linhas de Código)
print("\nTOP 15 REPOSITÓRIOS COM MAIOR Tamanho_LOC:")
print("-" * 60)
top_loc = df.nlargest(15, 'Tamanho_LOC')[['Nome', 'Tamanho_LOC']]
for idx, row in top_loc.iterrows():
    print(f"{top_loc.index.get_loc(idx)+1:2d}. {row['Nome'][:50]:50s} {row['Tamanho_LOC']:>12,}")

# 2. TOP 15 - CBO (Coupling Between Objects)
print("\n\n🔗 TOP 15 REPOSITÓRIOS COM MAIOR CBO:")
print("-" * 60)
top_cbo = df.nlargest(15, 'CBO')[['Nome', 'CBO']]
for idx, row in top_cbo.iterrows():
    print(f"{top_cbo.index.get_loc(idx)+1:2d}. {row['Nome'][:50]:50s} {row['CBO']:>12.2f}")

# 3. TOP 15 - DIT (Depth of Inheritance Tree)
print("\n\nTOP 15 REPOSITÓRIOS COM MAIOR DIT:")
print("-" * 60)
top_dit = df.nlargest(15, 'DIT')[['Nome', 'DIT']]
for idx, row in top_dit.iterrows():
    print(f"{top_dit.index.get_loc(idx)+1:2d}. {row['Nome'][:50]:50s} {row['DIT']:>12.2f}")

# 4. TOP 15 - LCOM (Lack of Cohesion of Methods)
print("\n\nTOP 15 REPOSITÓRIOS COM MAIOR LCOM:")
print("-" * 60)
top_lcom = df.nlargest(15, 'LCOM')[['Nome', 'LCOM']]
for idx, row in top_lcom.iterrows():
    print(f"{top_lcom.index.get_loc(idx)+1:2d}. {row['Nome'][:50]:50s} {row['LCOM']:>12.2f}")

# Resumo estatístico
print("\n\n" + "=" * 80)
print("RESUMO ESTATÍSTICO DAS MÉTRICAS:")
print("=" * 80)

metrics = ['Tamanho_LOC', 'CBO', 'DIT', 'LCOM']
for metric in metrics:
    print(f"\n{metric}:")
    print(f"  Média:     {df[metric].mean():>12.2f}")
    print(f"  Mediana:   {df[metric].median():>12.2f}")
    print(f"  Máximo:    {df[metric].max():>12.2f}")
    print(f"  Mínimo:    {df[metric].min():>12.2f}")
    print(f"  Desvio Padrão: {df[metric].std():>8.2f}")

# Criar diretório para resultados
output_dir = 'enunciado02/resultados_top'
os.makedirs(output_dir, exist_ok=True)

# Salvar cada top 15 em arquivo separado
top_loc.to_csv(f'{output_dir}/top15_Tamanho_LOC.csv', index=False)
top_cbo.to_csv(f'{output_dir}/top15_CBO.csv', index=False)
top_dit.to_csv(f'{output_dir}/top15_DIT.csv', index=False)
top_lcom.to_csv(f'{output_dir}/top15_LCOM.csv', index=False)

print(f"Arquivos salvos no diretório: '{output_dir}/'")
print(f"  - top15_Tamanho_LOC.csv")
print(f"  - top15_CBO.csv")
print(f"  - top15_DIT.csv")
print(f"  - top15_LCOM.csv")

# Gráficos simples
try:
    import matplotlib.pyplot as plt
    import matplotlib
    
    # Configurar matplotlib para mostrar caracteres corretamente
    matplotlib.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
    matplotlib.rcParams['axes.unicode_minus'] = False
    
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle('Top 15 Repositórios por Métricas de Software', fontsize=16, fontweight='bold')
    
    # Gráfico LOC
    axes[0, 0].barh(top_loc['Nome'].str[:30], top_loc['Tamanho_LOC'], color='skyblue')
    axes[0, 0].set_xlabel('Linhas de Código (LOC)')
    axes[0, 0].set_title('Top 15 - Tamanho_LOC')
    axes[0, 0].invert_yaxis()
    
    # Gráfico CBO
    axes[0, 1].barh(top_cbo['Nome'].str[:30], top_cbo['CBO'], color='lightcoral')
    axes[0, 1].set_xlabel('CBO')
    axes[0, 1].set_title('Top 15 - CBO')
    axes[0, 1].invert_yaxis()
    
    # Gráfico DIT
    axes[1, 0].barh(top_dit['Nome'].str[:30], top_dit['DIT'], color='lightgreen')
    axes[1, 0].set_xlabel('DIT')
    axes[1, 0].set_title('Top 15 - DIT')
    axes[1, 0].invert_yaxis()
    
    # Gráfico LCOM
    axes[1, 1].barh(top_lcom['Nome'].str[:30], top_lcom['LCOM'], color='plum')
    axes[1, 1].set_xlabel('LCOM')
    axes[1, 1].set_title('Top 15 - LCOM')
    axes[1, 1].invert_yaxis()
    
    plt.tight_layout()
    plt.savefig(f'{output_dir}/top15_metricas_grafico.png', dpi=300, bbox_inches='tight')
    print(f"\n✓ Gráfico salvo como: '{output_dir}/top15_metricas_grafico.png'")
    plt.show()
    
except ImportError:
    print("\nMatplotlib não instalado. Para gerar gráficos, instale com: pip install matplotlib")
except Exception as e:
    print(f"\nNão foi possível gerar gráficos: {e}")

print("\nAnálise concluída com sucesso!")