import os
import sys
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "dataset_code_review.csv")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "graficos")
os.makedirs(OUTPUT_DIR, exist_ok=True)

df = pd.read_csv(CSV_PATH)
repos = df.groupby("Repositorio").size().sort_values(ascending=False)

print("=" * 65)
print("DIAGNOSTICO DO DATASET")
print("=" * 65)
print(f"Total de repositorios coletados : {len(repos)}")
print(f"Meta do enunciado               : 200 repositorios")
print(f"Faltam                          : {max(0, 200 - len(repos))} repositorios")
print(f"Total de PRs                    : {len(df):,}")
print(f"PRs por repo  (min/media/max)   : {repos.min()} / {repos.mean():.1f} / {repos.max()}")
print(f"Repos com >= 100 PRs            : {(repos >= 100).sum()}")
print(f"Repos com <  100 PRs            : {(repos < 100).sum()}")
print()
print("--- Filtros aplicados (conferir com enunciado) ---")
status_counts = df["Status"].value_counts()
print(f"  MERGED : {status_counts.get('MERGED', 0):,}")
print(f"  CLOSED : {status_counts.get('CLOSED', 0):,}")
print(f"  PRs com revisoes >= 1 : {(df['Revisoes'] >= 1).sum():,}  (todos, filtro aplicado na coleta)")
print(f"  PRs com tempo >= 1h   : {(df['Tempo_Analise_Horas'] >= 1.0).sum():,}  (todos, filtro aplicado na coleta)")
print()
print("--- Colunas x metricas do enunciado ---")
checks = {
    "Tamanho - Arquivos":              ("Tamanho_Arquivos",              "changedFiles"),
    "Tamanho - Linhas adicionadas":    ("Tamanho_Linhas_Adicionadas",    "additions"),
    "Tamanho - Linhas removidas":      ("Tamanho_Linhas_Removidas",      "deletions"),
    "Tempo de analise (horas)":        ("Tempo_Analise_Horas",           "mergedAt - createdAt"),
    "Descricao (caracteres)":          ("Descricao_Caracteres",          "len(body)"),
    "Interacoes - Participantes":      ("Interacoes_Participantes",      "participants.totalCount"),
    "Interacoes - Comentarios":        ("Interacoes_Comentarios",        "comments.totalCount"),
    "Numero de revisoes":              ("Revisoes",                      "reviews.totalCount"),
}
for desc, (col, source) in checks.items():
    ok = col in df.columns
    status_str = "[OK]" if ok else "[FALTANDO]"
    print(f"  {status_str}  {desc:<35} -> coluna '{col}'")

# ==============================================================================
# GRAFICO: PRs por repositorio (barras horizontais) com linha de meta 100
# ==============================================================================
BG = "#0F1117"
PANEL = "#1A1D27"
GRID = "#2A2D3E"
TEXT = "#E0E0E0"
TARGET_REPOS = 200
TARGET_PRS = 100

fig, axes = plt.subplots(1, 2, figsize=(20, max(8, len(repos) * 0.22 + 2)),
                          facecolor=BG,
                          gridspec_kw={"width_ratios": [3, 1]})

# --- Painel esquerdo: barras de PRs por repo ---
ax = axes[0]
ax.set_facecolor(PANEL)

colors = ["#4ECDC4" if v >= TARGET_PRS else "#FF6B6B" for v in repos.values]
bars = ax.barh(repos.index, repos.values, color=colors, height=0.75, alpha=0.9)
ax.axvline(TARGET_PRS, color="#FFD700", linewidth=2, linestyle="--", label=f"Minimo {TARGET_PRS} PRs")

# Rotulos nas barras
for bar, val in zip(bars, repos.values):
    ax.text(bar.get_width() + repos.max() * 0.01, bar.get_y() + bar.get_height() / 2,
            f"{val}", va="center", ha="left", fontsize=7.5, color=TEXT)

ax.set_xlabel("Numero de PRs coletados", color=TEXT, fontsize=12)
ax.set_title(
    f"PRs por Repositorio  |  {len(repos)} repos coletados de {TARGET_REPOS} necessarios",
    color=TEXT, fontsize=13, fontweight="bold", pad=12
)
ax.tick_params(colors=TEXT, labelsize=8)
ax.grid(axis="x", alpha=0.25, color=GRID)
ax.set_xlim(0, repos.max() * 1.12)
ax.invert_yaxis()

patch_ok  = mpatches.Patch(color="#4ECDC4", label=f">= {TARGET_PRS} PRs (valido)")
patch_bad = mpatches.Patch(color="#FF6B6B", label=f"< {TARGET_PRS} PRs (insuficiente)")
line_min  = plt.Line2D([0], [0], color="#FFD700", linestyle="--", linewidth=2,
                        label=f"Minimo exigido ({TARGET_PRS} PRs)")
ax.legend(handles=[patch_ok, patch_bad, line_min], fontsize=9,
          facecolor=PANEL, edgecolor=GRID, labelcolor=TEXT)

# --- Painel direito: resumo do progresso ---
ax2 = axes[1]
ax2.set_facecolor(PANEL)
ax2.axis("off")

collected = len(repos)
remaining = max(0, TARGET_REPOS - collected)
pct = collected / TARGET_REPOS * 100

# Barra de progresso manual
bar_w = 0.6
ax2.barh([0.72], [pct / 100], color="#4ECDC4", height=0.08, left=0.2, alpha=0.9)
ax2.barh([0.72], [(100 - pct) / 100], color=GRID, height=0.08,
         left=0.2 + pct / 100, alpha=0.9)
ax2.text(0.5, 0.82, f"{pct:.0f}% concluido", ha="center", va="bottom",
         fontsize=13, color=TEXT, fontweight="bold", transform=ax2.transAxes)
ax2.text(0.5, 0.61, f"{collected} / {TARGET_REPOS} repos", ha="center",
         fontsize=11, color=TEXT, transform=ax2.transAxes)

lines = [
    ("Total de PRs",       f"{len(df):,}"),
    ("MERGED",             f"{status_counts.get('MERGED', 0):,}"),
    ("CLOSED",             f"{status_counts.get('CLOSED', 0):,}"),
    ("Faltam repos",       f"{remaining}"),
    ("Media PRs/repo",     f"{repos.mean():.0f}"),
    ("Min PRs/repo",       f"{repos.min()}"),
    ("Max PRs/repo",       f"{repos.max()}"),
]
y = 0.52
for label, val in lines:
    ax2.text(0.1, y, label, ha="left", fontsize=10, color="#A0A0A0",
             transform=ax2.transAxes)
    ax2.text(0.9, y, val, ha="right", fontsize=10, color=TEXT, fontweight="bold",
             transform=ax2.transAxes)
    y -= 0.07

ax2.set_title("Resumo do Dataset", color=TEXT, fontsize=12, fontweight="bold", pad=12)

fig.tight_layout(pad=2)
out_path = os.path.join(OUTPUT_DIR, "diagnostico_repos.png")
fig.savefig(out_path, dpi=150, bbox_inches="tight", facecolor=BG)
plt.close(fig)
print(f"\n[OK] Grafico salvo: graficos/diagnostico_repos.png")
print("=" * 65)
