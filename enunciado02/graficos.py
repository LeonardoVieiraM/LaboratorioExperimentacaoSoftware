import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns
from scipy import stats
import os

# Configuração de estilo para melhor visualização
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

# Carregar os dados
file_path = 'enunciado02/metricas_finais_1000.csv'

# Verificar se o arquivo existe
if not os.path.exists(file_path):
    print(f"Erro: Arquivo '{file_path}' não encontrado!")
    exit(1)

# Ler o CSV
df = pd.read_csv(file_path)

# Limpar nomes das colunas (remover espaços extras)
df.columns = df.columns.str.strip()

print("=" * 80)
print("ANÁLISE DE DISTRIBUIÇÃO DAS MÉTRICAS DE SOFTWARE")
print("=" * 80)

# Criar diretório para resultados
output_dir = 'enunciado02/resultados_gerais'
os.makedirs(output_dir, exist_ok=True)

# Métricas a serem analisadas
metricas = ['LCOM', 'DIT', 'CBO', 'Tamanho_LOC']
nomes_metricas = {
    'LCOM': 'Lack of Cohesion of Methods (LCOM)',
    'DIT': 'Depth of Inheritance Tree (DIT)',
    'CBO': 'Coupling Between Objects (CBO)',
    'Tamanho_LOC': 'Lines of Code (LOC)'
}

# Estatísticas descritivas
print("\nESTATÍSTICAS DESCRITIVAS:")
print("-" * 60)
for metrica in metricas:
    print(f"\n{metrica}:")
    print(f"  Média:        {df[metrica].mean():>12.2f}")
    print(f"  Mediana:      {df[metrica].median():>12.2f}")
    print(f"  Moda:         {df[metrica].mode().iloc[0] if not df[metrica].mode().empty else 'N/A':>12.2f}")
    print(f"  Desvio Padrão:{df[metrica].std():>12.2f}")
    print(f"  Variância:    {df[metrica].var():>12.2f}")
    print(f"  Mínimo:       {df[metrica].min():>12.2f}")
    print(f"  Q1 (25%):     {df[metrica].quantile(0.25):>12.2f}")
    print(f"  Q3 (75%):     {df[metrica].quantile(0.75):>12.2f}")
    print(f"  Máximo:       {df[metrica].max():>12.2f}")
    print(f"  Amplitude:    {df[metrica].max() - df[metrica].min():>12.2f}")
    
    # Assimetria e Curtose
    skewness = df[metrica].skew()
    kurtosis = df[metrica].kurtosis()
    print(f"  Assimetria:   {skewness:>12.2f} ({'Positiva' if skewness > 0 else 'Negativa' if skewness < 0 else 'Simétrica'})")
    print(f"  Curtose:      {kurtosis:>12.2f} ({'Leptocúrtica' if kurtosis > 0 else 'Platicúrtica' if kurtosis < 0 else 'Mesocúrtica'})")

# 1. GRÁFICO DE DISTRIBUIÇÃO - Histogramas com KDE
fig, axes = plt.subplots(2, 2, figsize=(15, 12))
fig.suptitle('Distribuição das Métricas de Software', fontsize=20, fontweight='bold')

for idx, metrica in enumerate(metricas):
    row, col = idx // 2, idx % 2
    ax = axes[row, col]
    
    # Histograma com KDE
    sns.histplot(data=df, x=metrica, bins=50, kde=True, ax=ax, alpha=0.7, color=sns.color_palette()[idx])
    
    # Adicionar linha da média e mediana
    media = df[metrica].mean()
    mediana = df[metrica].median()
    ax.axvline(media, color='red', linestyle='--', linewidth=2, label=f'Média: {media:.2f}')
    ax.axvline(mediana, color='green', linestyle='--', linewidth=2, label=f'Mediana: {mediana:.2f}')
    
    ax.set_title(nomes_metricas[metrica], fontsize=14, fontweight='bold')
    ax.set_xlabel('Valor', fontsize=12)
    ax.set_ylabel('Frequência', fontsize=12)
    ax.legend()
    ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(f'{output_dir}/1_histogramas_distribuicao.png', dpi=300, bbox_inches='tight')
print(f"\nGráfico 1 salvo: '1_histogramas_distribuicao.png'")

# 2. BOXPLOTS - Visualização de outliers
fig, axes = plt.subplots(2, 2, figsize=(15, 12))
fig.suptitle('Boxplots das Métricas (Identificação de Outliers)', fontsize=20, fontweight='bold')

for idx, metrica in enumerate(metricas):
    row, col = idx // 2, idx % 2
    ax = axes[row, col]
    
    # Boxplot
    bp = ax.boxplot(df[metrica].dropna(), vert=True, patch_artist=True,
                     showmeans=True, meanline=True)
    
    # Personalizar cores
    bp['boxes'][0].set_facecolor(sns.color_palette()[idx])
    bp['medians'][0].set_color('black')
    bp['means'][0].set_color('red')
    bp['means'][0].set_linewidth(2)
    
    ax.set_title(nomes_metricas[metrica], fontsize=14, fontweight='bold')
    ax.set_ylabel('Valor', fontsize=12)
    ax.grid(True, alpha=0.3, axis='y')
    
    # Adicionar estatísticas no gráfico
    stats_text = f"Média: {df[metrica].mean():.2f}\nMediana: {df[metrica].median():.2f}\nQ1: {df[metrica].quantile(0.25):.2f}\nQ3: {df[metrica].quantile(0.75):.2f}"
    ax.text(0.95, 0.95, stats_text, transform=ax.transAxes, 
            verticalalignment='top', horizontalalignment='right',
            bbox=dict(boxstyle='round', facecolor='white', alpha=0.8),
            fontsize=10)

plt.tight_layout()
plt.savefig(f'{output_dir}/2_boxplots_outliers.png', dpi=300, bbox_inches='tight')
print(f"Gráfico 2 salvo: '2_boxplots_outliers.png'")

# 3. MATRIZ DE CORRELAÇÃO
fig, ax = plt.subplots(figsize=(10, 8))
correlacao = df[metricas].corr()

# Heatmap de correlação
sns.heatmap(correlacao, annot=True, cmap='coolwarm', center=0, 
            square=True, linewidths=1, cbar_kws={"shrink": 0.8},
            fmt='.2f', ax=ax, annot_kws={'size': 12})

ax.set_title('Matriz de Correlação entre Métricas', fontsize=16, fontweight='bold')

plt.tight_layout()
plt.savefig(f'{output_dir}/3_matriz_correlacao.png', dpi=300, bbox_inches='tight')
print(f"Gráfico 3 salvo: '3_matriz_correlacao.png'")

# Salvar estatísticas detalhadas em CSV
estatisticas = []
for metrica in metricas:
    estatisticas.append({
        'Métrica': metrica,
        'Média': df[metrica].mean(),
        'Mediana': df[metrica].median(),
        'Moda': df[metrica].mode().iloc[0] if not df[metrica].mode().empty else None,
        'Desvio Padrão': df[metrica].std(),
        'Variância': df[metrica].var(),
        'Mínimo': df[metrica].min(),
        'Q1 (25%)': df[metrica].quantile(0.25),
        'Q3 (75%)': df[metrica].quantile(0.75),
        'Máximo': df[metrica].max(),
        'Amplitude': df[metrica].max() - df[metrica].min(),
        'Assimetria': df[metrica].skew(),
        'Curtose': df[metrica].kurtosis(),
        'Coef. Variação (%)': (df[metrica].std() / df[metrica].mean()) * 100
    })

df_estatisticas = pd.DataFrame(estatisticas)
df_estatisticas.to_csv(f'{output_dir}/estatisticas_descritivas.csv', index=False)
print(f"Estatísticas salvas em: 'estatisticas_descritivas.csv'")

# Mostrar resumo dos outliers para cada métrica
print("\n\n📈 ANÁLISE DE OUTLIERS:")
print("-" * 60)
for metrica in metricas:
    Q1 = df[metrica].quantile(0.25)
    Q3 = df[metrica].quantile(0.75)
    IQR = Q3 - Q1
    limite_inferior = Q1 - 1.5 * IQR
    limite_superior = Q3 + 1.5 * IQR
    
    outliers = df[(df[metrica] < limite_inferior) | (df[metrica] > limite_superior)]
    pct_outliers = (len(outliers) / len(df)) * 100
    
    print(f"\n{metrica}:")
    print(f"  Limites: [{limite_inferior:.2f}, {limite_superior:.2f}]")
    print(f"  Outliers detectados: {len(outliers)} ({pct_outliers:.2f}% dos dados)")

print(f"\n\nTodos os gráficos foram salvos no diretório: '{output_dir}/'")

try:
    plt.show()
except:
    pass