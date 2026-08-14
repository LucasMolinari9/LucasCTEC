#!/usr/bin/env sh
# semgrep.sh — roda o Semgrep (análise estática) neste repo. Ver docs/semgrep.md.
#
# Por que um wrapper: o scan tem TRÊS fontes de regra, com requisitos diferentes de REDE.
#   - regras LOCAIS  (.semgrep/rules/) — invariantes deste projeto; rodam offline, sempre.
#   - rulesets VENDORIZADOS (.semgrep/vendor/) — cópia versionada dos rulesets do registry.
#     Rodam offline também. É o que faz o modo padrão valer tanto quanto o CI.
#   - rulesets do REGISTRY ao vivo (p/javascript, p/xss…) — baixados de semgrep.dev; precisam
#     de rede. No CI isso funciona; no ambiente do agente Claude a saída pra semgrep.dev é
#     bloqueada, igual ao `vercel` CLI (ver CLAUDE.md § Publicação).
#
# POR QUE VENDORIZAR (09/08/2026, e o motivo é um episódio real): enquanto o padrão rodava só
# as 5 regras locais e o CI rodava o conjunto completo, "verde local" não era evidência de
# "verde no CI" — e **3 achados de `run-shell-injection` passaram batido para o CI** no
# `atualizar-baseline.yml`. Cachear fora do git não resolveria para ninguém aqui: nem o agente
# nem o dono (que opera pelo celular, sem terminal) alcançam semgrep.dev. A cópia no git é a
# única forma de os dois rodarem o mesmo conjunto. Mesma disciplina do supabase-js e das fontes.
#
# A cópia se atualiza pelo workflow `atualizar-semgrep-rulesets` (aba Actions → Run workflow),
# que busca, regrava `.semgrep/vendor/` + o manifesto e abre um PR com o diff. Nunca à mão.
#
# Uso:
#   ./scripts/semgrep.sh            # locais + vendorizados (offline) — o padrão
#   ./scripts/semgrep.sh --full     # locais + registry AO VIVO (precisa de rede)
#   ./scripts/semgrep.sh --test     # testa as REGRAS contra .semgrep/tests/
#   ./scripts/semgrep.sh --baseline-commit=origin/main   # só o que a SUA branch introduziu
#
# `--full` continua existindo como conferência de FRESCOR: se ele acusar o que o padrão não
# acusou, a cópia vendorizada está velha — rode o workflow.
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

# --metrics=off: a razão NÃO é a visibilidade do repo (ele é público desde 31/07/2026, ver
# docs/adr/0003) — é não mandar dado do projeto para terceiro sem necessidade.
COMMON="--metrics=off --error"
LOCAL_RULES="--config=$ROOT/.semgrep/rules"

# Rulesets do registry. Escolhidos pelo que este portal É: JS de navegador que monta HTML
# por concatenação de string (xss), com chave Supabase em arquivo servido (secrets) e os
# workflows do Actions (github-actions). Sem p/react, p/nodejs etc. — não há nada disso aqui.
# Esta lista é a FONTE DA VERDADE do que o workflow `atualizar-semgrep-rulesets` vendoriza:
# ao mexer aqui, mexa lá também (o manifesto registra o que foi de fato baixado).
REGISTRY="--config=p/javascript --config=p/xss --config=p/secrets --config=p/github-actions"

# Cópia vendorizada dos rulesets acima. Ausente = repo ainda não rodou o workflow; o scan
# roda assim mesmo (só com as locais), mas AVISA — silenciar aqui reconstruiria exatamente o
# falso "verde local" que motivou a vendorização.
VENDOR_DIR="$ROOT/.semgrep/vendor"
VENDOR_RULES=""
if [ -d "$VENDOR_DIR" ] && [ -n "$(find "$VENDOR_DIR" -maxdepth 1 -name '*.yml' -print -quit)" ]; then
  VENDOR_RULES="--config=$VENDOR_DIR"
fi

aviso_sem_vendor() {
  [ -n "$VENDOR_RULES" ] && return 0
  echo "AVISO: .semgrep/vendor/ está vazio — este scan rodou SÓ as regras locais." >&2
  echo "       O CI roda também os rulesets do registry, então verde aqui ainda NÃO é" >&2
  echo "       evidência de verde no CI. Para preencher: aba Actions → 'Atualizar rulesets" >&2
  echo "       do Semgrep' → Run workflow (ele abre um PR com o diff)." >&2
}

case "${1:-}" in
  --test)
    exec "$SEMGREP" --test --metrics=off --config="$ROOT/.semgrep/rules" "$ROOT/.semgrep/tests"
    ;;
  --full)
    shift
    # shellcheck disable=SC2086
    exec "$SEMGREP" scan $COMMON $LOCAL_RULES $REGISTRY "$@" .
    ;;
  *)
    aviso_sem_vendor
    # shellcheck disable=SC2086
    exec "$SEMGREP" scan $COMMON $LOCAL_RULES $VENDOR_RULES "$@" .
    ;;
esac
