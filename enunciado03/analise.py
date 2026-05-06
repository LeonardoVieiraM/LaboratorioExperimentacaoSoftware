# -*- coding: utf-8 -*-
"""
analise.py - Analise de Code Review no GitHub
==============================================
Gera todos os graficos e estatisticas para as 8 Questoes de Pesquisa (RQs)
definidas no enunciado do Laboratorio 03.

Estrutura de saida:
    enunciado03/graficos/
        rq01_tamanho_vs_status.png
        rq02_tempo_vs_status.png
        rq03_descricao_vs_status.png
        rq04_interacoes_vs_status.png
        rq05_tamanho_vs_revisoes.png
        rq06_tempo_vs_revisoes.png
        rq07_descricao_vs_revisoes.png
        rq08_interacoes_vs_revisoes.png
        correlacoes_heatmap.png
        resumo_medianas.png
"""

import os
import sys
import warnings
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import seaborn as sns
from scipy import stats

# Forca UTF-8 na saida do terminal para evitar erros de encoding no Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

warnings.filterwarnings("ignore")

# --- Configuracao de caminhos --------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "dataset_code_review.csv")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "graficos")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- Paleta e estilo global ----------------------------------------------------
MERGED_COLOR = "#4ECDC4"   # teal
CLOSED_COLOR = "#FF6B6B"   # coral
BG_COLOR     = "#0F1117"   # fundo escuro
PANEL_COLOR  = "#1A1D27"   # paineis internos
GRID_COLOR   = "#2A2D3E"   # linhas de grade
TEXT_COLOR   = "#E0E0E0"   # texto principal
ACCENT       = "#A78BFA"   # roxo acento

plt.rcParams.update({
    "figure.facecolor":  BG_COLOR,
    "axes.facecolor":    PANEL_COLOR,
    "axes.edgecolor":    GRID_COLOR,
    "axes.labelcolor":   TEXT_COLOR,
    "axes.titlecolor":   TEXT_COLOR,
    "xtick.color":       TEXT_COLOR,
    "ytick.color":       TEXT_COLOR,
    "grid.color":        GRID_COLOR,
    "text.color":        TEXT_COLOR,
    "legend.facecolor":  PANEL_COLOR,
    "legend.edgecolor":  GRID_COLOR,
    "font.family":       "DejaVu Sans",
    "font.size":         11,
})

# --- Utilitarios ---------------------------------------------------------------

def spearman(x, y):
    """Retorna (rho, p_value) de Spearman removendo NaNs."""
    mask = ~(np.isnan(x) | np.isnan(y))
    if mask.sum() < 3:
        return (np.nan, np.nan)
    return stats.spearmanr(x[mask], y[mask])


def pval_label(p):
    if np.isnan(p):
        return "p = NaN"
    if p < 0.001:
        return "p < 0.001"
    return f"p = {p:.3f}"


def add_spearman_text(ax, rho, p, x=0.97, y=0.97):
    txt = f"rho = {rho:.3f}\n{pval_label(p)}"
    ax.text(x, y, txt, transform=ax.transAxes, ha="right", va="top",
            fontsize=10, color=TEXT_COLOR,
            bbox=dict(boxstyle="round,pad=0.4", fc=PANEL_COLOR, ec=GRID_COLOR, alpha=0.9))


def save(fig, name):
    path = os.path.join(OUTPUT_DIR, name)
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG_COLOR)
    plt.close(fig)
    print(f"  [OK] Salvo: {name}")


def cap_percentile(series, q=99):
    """Limita a serie ao percentil q para melhor visualizacao."""
    cap = series.quantile(q / 100)
    return series.clip(upper=cap)


# --- Carregamento e pre-processamento -----------------------------------------

print("=" * 60)
print("ANALISE DE CODE REVIEW - Laboratorio 03")
print("=" * 60)

df = pd.read_csv(CSV_PATH)
print(f"\nDataset carregado: {len(df):,} PRs de {df['Repositorio'].nunique()} repositorios")

# Coluna binaria numerica: MERGED=1, CLOSED=0 (para correlacao de Spearman)
df["Status_Bin"] = (df["Status"] == "MERGED").astype(int)

# Tamanho total de linhas (adicoes + remocoes)
df["Tamanho_Linhas_Total"] = df["Tamanho_Linhas_Adicionadas"] + df["Tamanho_Linhas_Removidas"]

print(f"  MERGED: {(df['Status']=='MERGED').sum():,} | CLOSED: {(df['Status']=='CLOSED').sum():,}")
print(f"\nMedianas globais:")

COLUNAS_MEDIANA = [
    "Tamanho_Arquivos", "Tamanho_Linhas_Adicionadas", "Tamanho_Linhas_Removidas",
    "Tempo_Analise_Horas", "Descricao_Caracteres",
    "Interacoes_Participantes", "Interacoes_Comentarios", "Revisoes"
]
for col in COLUNAS_MEDIANA:
    print(f"  {col}: {df[col].median():.2f}")

merged = df[df["Status"] == "MERGED"]
closed = df[df["Status"] == "CLOSED"]

# --- Funcao: boxplot MERGED vs CLOSED ------------------------------------------

def boxplot_status(ax, col, label, cap=True):
    """
    Boxplot lado a lado MERGED vs CLOSED para uma coluna.
    Aplica Mann-Whitney U para significancia estatistica.
    """
    data_m = merged[col]
    data_c = closed[col]
    if cap:
        data_m = cap_percentile(data_m)
        data_c = cap_percentile(data_c)

    bp = ax.boxplot(
        [data_m, data_c],
        labels=["MERGED", "CLOSED"],
        patch_artist=True,
        widths=0.5,
        medianprops=dict(color="white", linewidth=2.5),
        whiskerprops=dict(color=TEXT_COLOR, linewidth=1.2),
        capprops=dict(color=TEXT_COLOR, linewidth=1.5),
        flierprops=dict(marker="o", markerfacecolor=GRID_COLOR, markersize=2, alpha=0.4),
    )
    bp["boxes"][0].set(facecolor=MERGED_COLOR, alpha=0.85)
    bp["boxes"][1].set(facecolor=CLOSED_COLOR, alpha=0.85)

    # Adiciona a mediana como texto acima da caixa
    for i, data in enumerate([data_m, data_c], 1):
        med = data.median()
        offset = med * 0.05 if med > 0 else 0.5
        ax.text(i, med + offset, f"Md={med:.1f}", ha="center", va="bottom",
                fontsize=9, color="white", fontweight="bold")

    ax.set_ylabel(label, fontsize=11)
    ax.grid(axis="y", alpha=0.3)

    # Teste Mann-Whitney U (nao-parametrico, robusto para dados assimetricos)
    stat_mw, p_mw = stats.mannwhitneyu(merged[col], closed[col], alternative="two-sided")
    if p_mw < 0.001:
        sig = "*** (p < 0.001)"
    elif p_mw < 0.01:
        sig = f"** (p = {p_mw:.4f})"
    elif p_mw < 0.05:
        sig = f"* (p = {p_mw:.4f})"
    else:
        sig = f"n.s. (p = {p_mw:.4f})"
    ax.set_title(f"Mann-Whitney: {sig}", fontsize=9, color=TEXT_COLOR, pad=4)


def scatter_rq(ax, x_col, y_col, x_label, y_label, cap_x=True, sample=3000):
    """
    Scatter plot com linha de tendencia e correlacao de Spearman (RQ 05-08).
    """
    d = df[[x_col, y_col]].dropna().copy()
    if cap_x:
        d[x_col] = cap_percentile(d[x_col])
    if cap_x:
        d[y_col] = cap_percentile(d[y_col], q=99)

    if len(d) > sample:
        d = d.sample(sample, random_state=42)

    rho, p = spearman(d[x_col].values, d[y_col].values)

    ax.scatter(d[x_col], d[y_col], alpha=0.25, s=12, color=ACCENT, rasterized=True)

    # Linha de tendencia
    try:
        m, b, *_ = stats.linregress(d[x_col], d[y_col])
        xs = np.linspace(d[x_col].min(), d[x_col].max(), 200)
        ax.plot(xs, m * xs + b, color="#FF6B6B", linewidth=2, label="Tendencia")
    except Exception:
        pass

    ax.set_xlabel(x_label, fontsize=10)
    ax.set_ylabel(y_label, fontsize=10)
    ax.grid(alpha=0.2)
    add_spearman_text(ax, rho, p)
    return rho, p


# ==============================================================================
# RQ 01 - Tamanho vs Status (MERGED / CLOSED)
# ==============================================================================
print("\n[RQ 01] Tamanho vs Status")

fig, axes = plt.subplots(1, 3, figsize=(16, 6))
fig.suptitle("RQ 01 - Tamanho dos PRs vs Feedback Final (Status)", fontsize=15, fontweight="bold", y=1.02)

boxplot_status(axes[0], "Tamanho_Arquivos",             "Arquivos Alterados")
boxplot_status(axes[1], "Tamanho_Linhas_Adicionadas",   "Linhas Adicionadas")
boxplot_status(axes[2], "Tamanho_Linhas_Removidas",     "Linhas Removidas")

legend_els = [mpatches.Patch(fc=MERGED_COLOR, label="MERGED"),
              mpatches.Patch(fc=CLOSED_COLOR,  label="CLOSED")]
fig.legend(handles=legend_els, loc="upper right", fontsize=11)
fig.tight_layout()
save(fig, "rq01_tamanho_vs_status.png")

# ==============================================================================
# RQ 02 - Tempo de Analise vs Status
# ==============================================================================
print("[RQ 02] Tempo de Analise vs Status")

fig, ax = plt.subplots(figsize=(8, 6))
fig.suptitle("RQ 02 - Tempo de Analise (horas) vs Feedback Final (Status)", fontsize=14, fontweight="bold")

boxplot_status(ax, "Tempo_Analise_Horas", "Tempo de Analise (horas)", cap=True)
legend_els = [mpatches.Patch(fc=MERGED_COLOR, label="MERGED"),
              mpatches.Patch(fc=CLOSED_COLOR,  label="CLOSED")]
ax.legend(handles=legend_els, fontsize=11)
fig.tight_layout()
save(fig, "rq02_tempo_vs_status.png")

# ==============================================================================
# RQ 03 - Descricao vs Status
# ==============================================================================
print("[RQ 03] Descricao vs Status")

fig, ax = plt.subplots(figsize=(8, 6))
fig.suptitle("RQ 03 - Tamanho da Descricao (chars) vs Feedback Final (Status)", fontsize=14, fontweight="bold")

boxplot_status(ax, "Descricao_Caracteres", "Caracteres na Descricao", cap=True)
legend_els = [mpatches.Patch(fc=MERGED_COLOR, label="MERGED"),
              mpatches.Patch(fc=CLOSED_COLOR,  label="CLOSED")]
ax.legend(handles=legend_els, fontsize=11)
fig.tight_layout()
save(fig, "rq03_descricao_vs_status.png")

# ==============================================================================
# RQ 04 - Interacoes vs Status
# ==============================================================================
print("[RQ 04] Interacoes vs Status")

fig, axes = plt.subplots(1, 2, figsize=(13, 6))
fig.suptitle("RQ 04 - Interacoes nos PRs vs Feedback Final (Status)", fontsize=14, fontweight="bold")

boxplot_status(axes[0], "Interacoes_Participantes", "Numero de Participantes")
boxplot_status(axes[1], "Interacoes_Comentarios",   "Numero de Comentarios")

legend_els = [mpatches.Patch(fc=MERGED_COLOR, label="MERGED"),
              mpatches.Patch(fc=CLOSED_COLOR,  label="CLOSED")]
fig.legend(handles=legend_els, loc="upper right", fontsize=11)
fig.tight_layout()
save(fig, "rq04_interacoes_vs_status.png")

# ==============================================================================
# RQ 05 - Tamanho vs Numero de Revisoes
# ==============================================================================
print("[RQ 05] Tamanho vs Numero de Revisoes")

fig, axes = plt.subplots(1, 3, figsize=(18, 6))
fig.suptitle("RQ 05 - Tamanho dos PRs vs Numero de Revisoes", fontsize=14, fontweight="bold", y=1.02)

scatter_rq(axes[0], "Tamanho_Arquivos",           "Revisoes",
           "Arquivos Alterados",      "No. de Revisoes")
scatter_rq(axes[1], "Tamanho_Linhas_Adicionadas", "Revisoes",
           "Linhas Adicionadas",      "No. de Revisoes")
scatter_rq(axes[2], "Tamanho_Linhas_Removidas",   "Revisoes",
           "Linhas Removidas",        "No. de Revisoes")

fig.tight_layout()
save(fig, "rq05_tamanho_vs_revisoes.png")

# ==============================================================================
# RQ 06 - Tempo de Analise vs Numero de Revisoes
# ==============================================================================
print("[RQ 06] Tempo de Analise vs Numero de Revisoes")

fig, ax = plt.subplots(figsize=(8, 6))
fig.suptitle("RQ 06 - Tempo de Analise (horas) vs Numero de Revisoes", fontsize=14, fontweight="bold")

scatter_rq(ax, "Tempo_Analise_Horas", "Revisoes",
           "Tempo de Analise (horas)", "No. de Revisoes")
fig.tight_layout()
save(fig, "rq06_tempo_vs_revisoes.png")

# ==============================================================================
# RQ 07 - Descricao vs Numero de Revisoes
# ==============================================================================
print("[RQ 07] Descricao vs Numero de Revisoes")

fig, ax = plt.subplots(figsize=(8, 6))
fig.suptitle("RQ 07 - Tamanho da Descricao (chars) vs Numero de Revisoes", fontsize=14, fontweight="bold")

scatter_rq(ax, "Descricao_Caracteres", "Revisoes",
           "Caracteres na Descricao", "No. de Revisoes")
fig.tight_layout()
save(fig, "rq07_descricao_vs_revisoes.png")

# ==============================================================================
# RQ 08 - Interacoes vs Numero de Revisoes
# ==============================================================================
print("[RQ 08] Interacoes vs Numero de Revisoes")

fig, axes = plt.subplots(1, 2, figsize=(14, 6))
fig.suptitle("RQ 08 - Interacoes nos PRs vs Numero de Revisoes", fontsize=14, fontweight="bold")

scatter_rq(axes[0], "Interacoes_Participantes", "Revisoes",
           "Numero de Participantes", "No. de Revisoes")
scatter_rq(axes[1], "Interacoes_Comentarios",   "Revisoes",
           "Numero de Comentarios",  "No. de Revisoes")

fig.tight_layout()
save(fig, "rq08_interacoes_vs_revisoes.png")

# ==============================================================================
# EXTRA - Heatmap de Correlacoes de Spearman (visao geral)
# ==============================================================================
print("[EXTRA] Heatmap de correlacoes de Spearman")

num_cols = [
    "Tamanho_Arquivos", "Tamanho_Linhas_Adicionadas", "Tamanho_Linhas_Removidas",
    "Tempo_Analise_Horas", "Descricao_Caracteres",
    "Interacoes_Participantes", "Interacoes_Comentarios",
    "Revisoes", "Status_Bin",
]
labels = [
    "Arquivos", "Linhas +", "Linhas -",
    "Tempo (h)", "Descricao",
    "Participantes", "Comentarios",
    "Revisoes", "Status\n(Merged=1)",
]

corr_matrix = np.zeros((len(num_cols), len(num_cols)))
for i, c1 in enumerate(num_cols):
    for j, c2 in enumerate(num_cols):
        rho, _ = spearman(df[c1].values, df[c2].values)
        corr_matrix[i, j] = rho if not np.isnan(rho) else 0

fig, ax = plt.subplots(figsize=(12, 10))
fig.suptitle("Heatmap - Correlacoes de Spearman entre todas as metricas",
             fontsize=14, fontweight="bold")

cmap = sns.diverging_palette(10, 240, as_cmap=True)
sns.heatmap(
    corr_matrix,
    xticklabels=labels,
    yticklabels=labels,
    annot=True,
    fmt=".2f",
    cmap=cmap,
    center=0,
    vmin=-1, vmax=1,
    ax=ax,
    linewidths=0.5,
    linecolor=GRID_COLOR,
    annot_kws={"size": 9},
)
ax.set_xticklabels(ax.get_xticklabels(), rotation=45, ha="right")
ax.set_yticklabels(ax.get_yticklabels(), rotation=0)
fig.tight_layout()
save(fig, "correlacoes_heatmap.png")

# ==============================================================================
# EXTRA - Tabela de Medianas - Resumo das RQs
# ==============================================================================
print("[EXTRA] Tabela de medianas por status")

summary = df.groupby("Status")[COLUNAS_MEDIANA].median().T
summary = summary.reset_index().rename(columns={"index": "Metrica"})

fig, ax = plt.subplots(figsize=(12, 5))
fig.suptitle("Resumo - Medianas por Status do PR", fontsize=14, fontweight="bold")
ax.axis("off")

col_labels = ["Metrica", "MERGED", "CLOSED"]
table_data = summary[["Metrica", "MERGED", "CLOSED"]].values.tolist()
table_data = [[row[0], f"{row[1]:.2f}", f"{row[2]:.2f}"] for row in table_data]

tbl = ax.table(
    cellText=table_data,
    colLabels=col_labels,
    cellLoc="center",
    loc="center",
)
tbl.auto_set_font_size(False)
tbl.set_fontsize(11)
tbl.scale(1.3, 1.8)

for (row, col), cell in tbl.get_celld().items():
    if row == 0:
        cell.set_facecolor("#2A2D3E")
        cell.set_text_props(color="white", fontweight="bold")
    elif col == 1:
        cell.set_facecolor(MERGED_COLOR + "44")
    elif col == 2:
        cell.set_facecolor(CLOSED_COLOR + "44")
    else:
        cell.set_facecolor(PANEL_COLOR)
    cell.set_edgecolor(GRID_COLOR)
    cell.set_text_props(color=TEXT_COLOR)

fig.tight_layout()
save(fig, "resumo_medianas.png")

# ==============================================================================
# Tabela de correlacoes de Spearman no terminal
# ==============================================================================
print("\n" + "=" * 60)
print("CORRELACOES DE SPEARMAN (metricas vs Revisoes e Status)")
print("=" * 60)

metricas = {
    "Tamanho_Arquivos":           "Arquivos Alterados",
    "Tamanho_Linhas_Adicionadas": "Linhas Adicionadas",
    "Tamanho_Linhas_Removidas":   "Linhas Removidas",
    "Tempo_Analise_Horas":        "Tempo de Analise (h)",
    "Descricao_Caracteres":       "Descricao (chars)",
    "Interacoes_Participantes":   "Participantes",
    "Interacoes_Comentarios":     "Comentarios",
}

print(f"\n{'Metrica':<30} {'rho (vs Status)':<20} {'rho (vs Revisoes)':<20}")
print("-" * 70)
for col, label in metricas.items():
    rho_s, p_s = spearman(df[col].values, df["Status_Bin"].values)
    rho_r, p_r = spearman(df[col].values, df["Revisoes"].values)
    sig_s = "***" if p_s < 0.001 else ("**" if p_s < 0.01 else ("*" if p_s < 0.05 else "n.s."))
    sig_r = "***" if p_r < 0.001 else ("**" if p_r < 0.01 else ("*" if p_r < 0.05 else "n.s."))
    print(f"{label:<30} {rho_s:+.4f} {sig_s:<12}  {rho_r:+.4f} {sig_r}")

print("\n*** p<0.001  ** p<0.01  * p<0.05  n.s. nao significativo")
print(f"\nGraficos salvos em: {OUTPUT_DIR}")
print("=" * 60)
