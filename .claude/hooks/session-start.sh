#!/bin/bash
# session-start.sh — prepara o ambiente de uma sessão do Claude Code na WEB.
#
# Por que existe: o container das sessões web é EFÊMERO (é reciclado depois de um tempo de
# inatividade), e o repo é zero-build de propósito — não há `package.json`, e o gate
# `node tests/check.js` é Node puro sem dependências. Essa decisão vale a pena e não muda;
# o preço é que a única ferramenta de fora, o Semgrep, precisa ser reinstalada a cada
# sessão. Sem isso, `./scripts/semgrep.sh` sai 127 e o agente conferia os padrões proibidos
# à mão — foi exatamente o que aconteceu no PR #93.
#
# O que NÃO instala, porque a imagem já traz:
#   - Node 22 e Chromium (/opt/pw-browsers)
#   - Playwright 1.56.1 global — a MESMA versão fixada no .github/workflows/views.yml.
#     Se um dia divergirem, o certo é acertar o workflow, não instalar por cima aqui:
#     subir o Playwright é decisão, não efeito colateral (ver o cabeçalho do views.yml).
#
# Contratos que este script respeita:
#   - idempotente: rodar de novo com a venv pronta é um no-op barato;
#   - não-interativo: nada de prompt;
#   - só no ambiente REMOTO: na máquina do dono, quem manda na instalação é o dono
#     (docs/semgrep.md § instalação recomenda pipx, que sobrevive entre sessões);
#   - nunca derruba a sessão: se o PyPI estiver fora do ar, avisa e sai 0. Sessão sem
#     Semgrep é pior que com, mas sessão que não abre é pior que as duas.
set -euo pipefail

# Fora do ambiente remoto (máquina do dono, CI) este hook não tem o que fazer.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)}"
cd "$ROOT"

VENV="$ROOT/.venv-semgrep"          # o caminho que scripts/semgrep.sh procura sozinho
WORKFLOW="$ROOT/.github/workflows/semgrep.yml"

# A versão sai do WORKFLOW, não daqui: ela já é fixa lá (`pip install semgrep==X`) e o CI é
# quem dá o veredito. Repetir o número neste arquivo criaria um segundo lugar para atualizar
# — e o que diverge sem ninguém ver é justamente o que o repo passa o tempo todo caçando.
# Se o formato da linha mudar, o script diz isso em vez de instalar uma versão qualquer.
VERSAO=$(sed -n 's/.*semgrep==\([0-9][0-9.]*\).*/\1/p' "$WORKFLOW" | head -n 1)
if [ -z "$VERSAO" ]; then
  echo "session-start: não achei 'semgrep==<versão>' em $WORKFLOW — pulando o Semgrep." >&2
  echo "session-start: rode './scripts/semgrep.sh' para ver a mensagem de instalação." >&2
  exit 0
fi

# Idempotência: já está na versão certa? Não faz nada. (A comparação é com a versão do CI,
# então uma venv velha de uma sessão anterior é REFEITA em vez de aceita — local divergindo
# do CI é como um PR passa verde aqui e vermelho lá.)
if [ -x "$VENV/bin/semgrep" ] && "$VENV/bin/semgrep" --version 2>/dev/null | grep -qx "$VERSAO"; then
  echo "session-start: semgrep $VERSAO já instalado."
  exit 0
fi

echo "session-start: instalando semgrep==$VERSAO (versão do .github/workflows/semgrep.yml)…"
rm -rf "$VENV"
if ! python3 -m venv "$VENV" \
  || ! "$VENV/bin/pip" install --quiet --disable-pip-version-check "semgrep==$VERSAO"; then
  rm -rf "$VENV"    # venv pela metade engana o scripts/semgrep.sh, que só testa se o binário existe
  echo "session-start: falha ao instalar o Semgrep (rede/PyPI?). A sessão segue sem ele;" >&2
  echo "session-start: o gate do CI continua cobrindo essa análise." >&2
  exit 0
fi

echo "session-start: semgrep $("$VENV/bin/semgrep" --version) pronto — use ./scripts/semgrep.sh"
