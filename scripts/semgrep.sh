#!/usr/bin/env sh
# semgrep.sh — roda o Semgrep (análise estática) neste repo. Ver docs/semgrep.md.
#
# Por que um wrapper: o scan tem duas metades com requisitos diferentes de REDE.
#   - regras LOCAIS  (.semgrep/rules/) — invariantes deste projeto; rodam offline, sempre.
#   - rulesets do REGISTRY (p/javascript, p/xss…) — baixados de semgrep.dev; precisam de
#     rede. No CI isso funciona; no ambiente do agente Claude a saída pra semgrep.dev é
#     bloqueada, igual ao `vercel` CLI (ver CLAUDE.md § Publicação).
# O modo padrão é o que roda em QUALQUER lugar; a metade que depende de rede é opt-in.
#
# Uso:
#   ./scripts/semgrep.sh            # só regras locais (offline) — o padrão
#   ./scripts/semgrep.sh --full     # locais + rulesets do registry (precisa de rede)
#   ./scripts/semgrep.sh --test     # testa as REGRAS contra .semgrep/tests/
#   ./scripts/semgrep.sh --baseline-commit=origin/main   # só o que a SUA branch introduziu
#
# Argumento extra vai direto pro `semgrep scan` (é o caso do --baseline-commit acima).
#
# Sai != 0 se houver achado (--error), pra servir de gate.
#
# Instalação do binário (não é dependência do projeto — o gate `node tests/check.js`
# continua Node puro e sem dependências):
#   pipx install semgrep      (recomendado)
#   python3 -m venv .venv-semgrep && .venv-semgrep/bin/pip install semgrep
# O .venv-semgrep/ está no .gitignore; este script o encontra sozinho.

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

# --- acha o binário: PATH, senão a venv local ---
if command -v semgrep >/dev/null 2>&1; then
  SEMGREP=semgrep
elif [ -x "$ROOT/.venv-semgrep/bin/semgrep" ]; then
  SEMGREP="$ROOT/.venv-semgrep/bin/semgrep"
else
  echo "semgrep não encontrado. Instale com:" >&2
  echo "  pipx install semgrep" >&2
  echo "ou, sem pipx:" >&2
  echo "  python3 -m venv .venv-semgrep && .venv-semgrep/bin/pip install semgrep" >&2
  exit 127
fi

# --metrics=off: o repo é privado; nada de telemetria pra semgrep.dev por padrão.
COMMON="--metrics=off --error"
LOCAL_RULES="--config=$ROOT/.semgrep/rules"

# Rulesets do registry. Escolhidos pelo que este portal É: JS de navegador que monta HTML
# por concatenação de string (xss), com chave Supabase em arquivo servido (secrets) e dois
# workflows do Actions (github-actions). Sem p/react, p/nodejs etc. — não há nada disso aqui.
REGISTRY="--config=p/javascript --config=p/xss --config=p/secrets --config=p/github-actions"

# SEMGREP_ENABLE_VERSION_CHECK=0: os dois modos OFFLINE (padrão e --test) não podem depender de
# rede para nem sequer INICIAR — sem isso o semgrep bate em check-version antes de escanear, e no
# ambiente do Claude (saída bloqueada, igual ao vercel CLI) essa checagem consome o timeout da
# tentativa em vez de falhar rápido. --full FICA DE FORA de propósito: ele já precisa de rede para
# baixar os rulesets do registry (REGISTRY, abaixo), então desligar o version-check ali não
# destrava nada e esconderia um aviso de versão que faz sentido justamente quando há rede.
case "${1:-}" in
  --test)
    export SEMGREP_ENABLE_VERSION_CHECK=0
    exec "$SEMGREP" --test --metrics=off --config="$ROOT/.semgrep/rules" "$ROOT/.semgrep/tests"
    ;;
  --full)
    shift
    # shellcheck disable=SC2086
    exec "$SEMGREP" scan $COMMON $LOCAL_RULES $REGISTRY "$@" .
    ;;
  *)
    export SEMGREP_ENABLE_VERSION_CHECK=0
    # shellcheck disable=SC2086
    exec "$SEMGREP" scan $COMMON $LOCAL_RULES "$@" .
    ;;
esac
