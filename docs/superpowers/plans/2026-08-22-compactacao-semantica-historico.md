# Compactação Semântica do Histórico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar os 20 snapshots históricos encontráveis por um índice curto e uma síntese temática, preservando integralmente cada original.

**Architecture:** `docs/historico/README.md` será o catálogo completo e a única porta de entrada do arquivo frio. `docs/historico/resumo-tematico.md` reterá somente lições duráveis, sempre com link para a evidência integral e para a fonte vigente quando existir.

**Tech Stack:** Markdown, Git, Node.js e SHA-256 para conferência de preservação.

## Global Constraints

- Trabalhar somente na branch `work`, a partir do commit `7994a08`.
- Não excluir, renomear, sobrescrever ou editar os 20 documentos históricos existentes.
- Não alterar código, SQL, banco, workflows, configuração ou arquivos servidos.
- Não apresentar snapshot como estado vigente.
- Não fazer merge na `main`.

---

### Task 1: Inventário completo do arquivo frio

**Files:**
- Create: `docs/historico/README.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: títulos, datas, conclusões e marcadores de estado dos 20 snapshots.
- Produces: uma linha por original com data, assunto, resultado, situação atual e link integral.

- [x] **Step 1: Conferir as precondições e contar os originais**

Run: `git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD && find docs/historico -maxdepth 1 -type f -name '*.md' | wc -l`

Expected: `work`, `7994a08` e `20` antes da criação dos dois documentos desta fase.

- [x] **Step 2: Ler títulos, aberturas, conclusões e cabeçalhos dos 20 originais**

Run: `for f in docs/historico/*.md; do sed -n '1,16p' "$f"; rg -n '^#{1,3} ' "$f"; tail -35 "$f"; done`

Expected: cada classificação apoiada pelo conteúdo do próprio snapshot.

- [x] **Step 3: Criar o catálogo e ligar o mapa documental a ele**

O catálogo deve declarar explicitamente que “situação atual” significa a posição documental do
snapshot, não uma afirmação sobre produção, banco ou issue.

### Task 2: Síntese durável e prova de preservação

**Files:**
- Create: `docs/historico/resumo-tematico.md`

**Interfaces:**
- Consumes: fatos repetidos ou decisões duráveis dos 20 snapshots.
- Produces: síntese por tema com links para originais e fontes vigentes; nenhuma instrução nova.

- [x] **Step 1: Escrever apenas lições duráveis com origem explícita**

Separar método, arquitetura, ambiente de teste, segurança operacional e custo de processo. Quando
houver fonte vigente, apontar para ela em vez de copiar a instrução.

- [x] **Step 2: Confirmar que os 20 originais não mudaram**

Run: `git diff --exit-code 7994a08 -- 'docs/historico/*.md' ':(exclude)docs/historico/README.md' ':(exclude)docs/historico/resumo-tematico.md'`

Expected: exit code 0 e nenhuma saída.

- [x] **Step 3: Validar links, whitespace e gate principal**

Run: verificador local de links Markdown, `git diff --check` e `node tests/check.js`.

Expected: todos verdes.

- [x] **Step 4: Commit**

```bash
git add docs/README.md docs/historico/README.md docs/historico/resumo-tematico.md docs/superpowers/plans/2026-08-22-compactacao-semantica-historico.md
git commit -m "docs: cataloga e resume o historico"
```
