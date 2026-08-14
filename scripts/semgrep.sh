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
#
# Esta lista aparece em TRÊS lugares (aqui, no semgrep.yml e no atualizar-semgrep-rulesets.yml)
# e o `tests/check.js` §[2b] reprova se divergirem — sem essa guarda, editar só um faria o scan
# local, o CI e o atualizador operarem sobre conjuntos diferentes, em silêncio.
REGISTRY_IDS="javascript xss secrets github-actions"
REGISTRY=""
for _R in $REGISTRY_IDS; do REGISTRY="$REGISTRY --config=p/$_R"; done

# Cópia vendorizada dos rulesets acima. Exigimos o conjunto COMPLETO: um `.yml` solto não
# autoriza o modo offline. Se um arquivo se perder (merge malfeito, remoção acidental), o scan
# rodaria um subconjunto e devolveria verde — que é EXATAMENTE o falso verde que a vendorização
# existe para matar, e num repo limpo o parcial e o completo acham zero do mesmo jeito.
VENDOR_DIR="$ROOT/.semgrep/vendor"
VENDOR_RULES=""
VENDOR_FALTANDO=""
for _R in $REGISTRY_IDS; do
  [ -f "$VENDOR_DIR/$_R.yml" ] || VENDOR_FALTANDO="$VENDOR_FALTANDO p/$_R"
done
# `if` e não `x && y`: sob `set -e`, uma AND-OR list cujo lado esquerdo falha devolve não-zero
# e pode abortar o script. Aqui o caminho "faltando" é NORMAL (é o estado de hoje), não erro.
if [ -z "$VENDOR_FALTANDO" ]; then
  VENDOR_RULES="--config=$VENDOR_DIR"
fi

# Versão do binário × versão do CI. O CI fixa `semgrep==1.171.0`; a instrução de instalação do
# repo é `pipx install semgrep`, sem versão. Binário mais velho PULA regra que não entende, mais
# novo a interpreta diferente — e aí o mesmo `.semgrep/vendor/` dá verde aqui e vermelho no CI,
# reconstruindo o problema por outro caminho. A versão do CI é lida do próprio workflow (mesma
# fonte única que o hook de sessão usa), não copiada para um segundo lugar.
# AVISA, não falha: travar aqui quebraria a instalação do dono e o hook, e o risco é de
# divergência, não de dano.
aviso_versao() {
  [ -f "$ROOT/.github/workflows/semgrep.yml" ] || return 0
  V_CI=$(sed -n 's/.*pip install semgrep==\([0-9][0-9.]*\).*/\1/p' \
    "$ROOT/.github/workflows/semgrep.yml" | head -n 1)
  V_LOCAL=$("$SEMGREP" --version 2>/dev/null | head -n 1 | tr -d '\r')
  [ -n "$V_CI" ] && [ -n "$V_LOCAL" ] || return 0
  [ "$V_CI" = "$V_LOCAL" ] && return 0
  echo "AVISO: seu semgrep é $V_LOCAL; o CI roda $V_CI." >&2
  echo "       Versões diferentes leem os rulesets vendorizados de formas diferentes —" >&2
  echo "       verde aqui pode virar vermelho lá. Para alinhar:" >&2
  echo "         pipx install 'semgrep==$V_CI' --force" >&2
}

aviso_sem_vendor() {
  [ -n "$VENDOR_RULES" ] && return 0
  if [ -n "$(printf '%s' "$VENDOR_FALTANDO" | tr -d ' ')" ] && [ -d "$VENDOR_DIR" ]; then
    echo "AVISO: .semgrep/vendor/ está INCOMPLETO — falta:$VENDOR_FALTANDO" >&2
    echo "       Rodar um subconjunto daria verde enganoso, então o scan caiu para SÓ as" >&2
    echo "       regras locais. Restaure os arquivos ou rode o workflow de atualização." >&2
  else
    echo "AVISO: .semgrep/vendor/ está vazio — este scan rodou SÓ as regras locais." >&2
    echo "       O CI roda também os rulesets do registry, então verde aqui ainda NÃO é" >&2
    echo "       evidência de verde no CI. Para preencher: aba Actions → 'Atualizar rulesets" >&2
    echo "       do Semgrep' → Run workflow (ele abre um PR com o diff)." >&2
  fi
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
    if [ -n "$VENDOR_RULES" ]; then aviso_versao; fi
    # shellcheck disable=SC2086
    exec "$SEMGREP" scan $COMMON $LOCAL_RULES $VENDOR_RULES "$@" .
    ;;
esac
