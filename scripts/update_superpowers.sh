#!/usr/bin/env bash
# ==========================================================================
# update_superpowers.sh — (re)vendoriza as skills do Superpowers no repo.
#
# POR QUE VENDORIZAR (e não instalar o plugin):
#   O Superpowers (github.com/obra/superpowers) é distribuído como plugin do
#   Claude Code (`/plugin install superpowers@...`). Plugin instalado mora em
#   ~/.claude/plugins/, FORA do repo. As sessões web do Claude rodam em
#   container efêmero que só clona o repo — ou seja, plugin instalado some na
#   sessão seguinte. Registrar o marketplace com `--scope project` também não
#   resolve: medido em 03/08/2026, sessão nova com cache global vazio NÃO
#   auto-instala o plugin declarado no settings.json (o `installed_plugins.json`
#   nasce com `"plugins": {}` e nenhuma skill `superpowers:` aparece).
#   O único mecanismo que carrega com estado global zero é o diretório de
#   skills do projeto. Por isso as skills entram no git, planas, tanto em
#   `.claude/skills/` (Claude Code) quanto em `.agents/skills/` (Codex), e este
#   script mantém as duas cópias atualizáveis.
#
# CONSEQUÊNCIA PRÁTICA: sem o plugin não há prefixo de namespace, então as
#   skills chamam-se `brainstorming`, `test-driven-development`, … (e não
#   `superpowers:brainstorming`). As referências cruzadas dentro dos SKILL.md
#   são reescritas por este script para bater com isso.
#
# USO:  ./scripts/update_superpowers.sh          # segue o branch padrão
#       ./scripts/update_superpowers.sh <ref>    # tag/branch/commit específico
# Precisa de rede (github.com). Depois de rodar, confira o diff e commite.
# ==========================================================================
set -euo pipefail

REF="${1:-}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINOS=("$RAIZ/.claude/skills" "$RAIZ/.agents/skills")
UPSTREAM="https://github.com/obra/superpowers.git"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ clonando $UPSTREAM ${REF:+(ref: $REF)}"
if [ -n "$REF" ]; then
  git clone --quiet "$UPSTREAM" "$TMP/sp"
  git -C "$TMP/sp" checkout --quiet "$REF"
else
  git clone --quiet --depth 1 "$UPSTREAM" "$TMP/sp"
fi

SHA="$(git -C "$TMP/sp" rev-parse HEAD)"
VERSAO="$(node -e 'process.stdout.write(require(process.argv[1]).version)' \
          "$TMP/sp/.claude-plugin/plugin.json" 2>/dev/null || echo desconhecida)"
echo "→ upstream $VERSAO @ ${SHA:0:12}"

# --- remove a leva anterior (só o que ESTE script instalou) -----------------
for DEST in "${DESTINOS[@]}"; do
  MANIFEST="$DEST/.superpowers-manifest.json"
  if [ -f "$MANIFEST" ]; then
    while IFS= read -r nome; do
      [ -n "$nome" ] && rm -rf "$DEST/${nome:?}"
    done < <(node -e '
      const m = require(process.argv[1]);
      for (const s of m.skills || []) console.log(s);
    ' "$MANIFEST")
  fi
done

# --- copia as skills, planas ------------------------------------------------
NOMES=()
for dir in "$TMP/sp/skills"/*/; do
  nome="$(basename "$dir")"
  [ -f "$dir/SKILL.md" ] || { echo "  ! $nome sem SKILL.md, pulado"; continue; }
  for DEST in "${DESTINOS[@]}"; do
    mkdir -p "$DEST"
    cp -r "$dir" "$DEST/$nome"
  done
  NOMES+=("$nome")
done

# --- reescreve as referências namespaced (superpowers:X → X) ----------------
# Sem plugin não há namespace; deixar `superpowers:X` faria a skill mandar
# invocar um nome que o tool Skill não resolve.
ALVOS="$(printf '%s|' "${NOMES[@]}")"; ALVOS="${ALVOS%|}"
REESCRITOS=0
while IFS= read -r f; do
  if grep -qE "superpowers:($ALVOS)" "$f"; then
    sed -i -E "s/superpowers:($ALVOS)/\1/g" "$f"
    REESCRITOS=$((REESCRITOS + 1))
  fi
done < <(find "${DESTINOS[@]}" -type f -name '*.md')

# --- manifesto (provenance + lista para a próxima limpeza) ------------------
for DEST in "${DESTINOS[@]}"; do
  MANIFEST="$DEST/.superpowers-manifest.json"
  node -e '
    const [out, sha, versao, upstream, ...skills] = process.argv.slice(1);
    require("fs").writeFileSync(out, JSON.stringify({
      _comment: "Gerado por scripts/update_superpowers.sh — NÃO editar à mão.",
      upstream, versao, commit: sha,
      vendorizadoEm: new Date().toISOString().slice(0, 10),
      skills: skills.sort()
    }, null, 2) + "\n");
  ' "$MANIFEST" "$SHA" "$VERSAO" "$UPSTREAM" "${NOMES[@]}"
done

echo "→ ${#NOMES[@]} skills vendorizadas para Claude Code e Codex ($REESCRITOS arquivo(s) com referência reescrita)"
printf '→ manifesto: %s/.superpowers-manifest.json\n' .claude/skills .agents/skills
echo "Confira o diff (git status) e commite."
