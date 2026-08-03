#!/usr/bin/env bash
# ==========================================================================
# superpowers-session-start.sh — bootstrap do Superpowers em toda sessão.
#
# O Superpowers depende de UMA injeção de contexto no início da sessão: o
# conteúdo inteiro da skill `using-superpowers`, que é o que faz o agente
# procurar skill ANTES de responder. Sem isso as 14 skills do Superpowers ficam
# instaladas mas ninguém as invoca — elas viram documentação morta.
#
# Como aqui o Superpowers é vendorizado como skills de projeto (ver o cabeçalho
# de scripts/update_superpowers.sh) e não como plugin, o hook do próprio
# upstream não roda. Este script faz o mesmo trabalho, lendo a cópia
# vendorizada. Sai em silêncio (código 0) se ela não existir.
#
# Contrato de saída: JSON com hookSpecificOutput.additionalContext — o formato
# que o Claude Code consome em SessionStart.
# ==========================================================================
set -euo pipefail

RAIZ="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SKILL="$RAIZ/.claude/skills/using-superpowers/SKILL.md"

[ -f "$SKILL" ] || exit 0

node -e '
  const fs = require("fs");
  const corpo = fs.readFileSync(process.argv[1], "utf8");
  const contexto =
    "<EXTREMELY_IMPORTANT>\n" +
    "You have superpowers.\n\n" +
    "**Below is the full content of your `using-superpowers` skill - your " +
    "introduction to using skills. For all other skills, use the `Skill` tool " +
    "(project skills, no namespace prefix: `brainstorming`, " +
    "`test-driven-development`, …):**\n\n" +
    corpo +
    "\n</EXTREMELY_IMPORTANT>";
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: contexto
    }
  }) + "\n");
' "$SKILL"
