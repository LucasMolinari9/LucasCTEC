# Governança e Critério de Parada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma entrada documental canônica e uma política objetiva de parada sem remover conteúdo nem alterar o portal.

**Architecture:** `docs/README.md` funciona como roteador, enquanto `docs/governanca.md` concentra apenas regras normativas. Documentos extensos permanecem como fontes de evidência e apontam para a política para evitar autoridade duplicada.

**Tech Stack:** Markdown, links relativos e verificações locais de integridade documental.

## Global Constraints

- Não alterar código executável, banco, publicação, comportamento ou arquivos servidos.
- Não excluir, comprimir ou reescrever documentos históricos nesta entrega.
- Não fazer merge na `main`.

---

### Task 1: Entrada canônica e política

**Files:**
- Create: `docs/README.md`
- Create: `docs/governanca.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: estrutura documental descrita atualmente em `README.md`.
- Produces: rota de leitura única e regras normativas para documentação, gates e módulos.

- [x] **Step 1: Criar o índice e a política**

Escrever links relativos para fontes vigentes, ADRs, planos e arquivo frio, além dos critérios de
admissão e parada aprovados no design.

- [x] **Step 2: Ligar a raiz ao índice**

Acrescentar `docs/README.md` à tabela de documentação do `README.md`, sem retirar os links
especializados existentes.

- [x] **Step 3: Validar os links locais**

Run: `node -e "const fs=require('fs'),p=require('path'); for(const f of ['README.md','docs/README.md','docs/governanca.md']) for(const m of fs.readFileSync(f,'utf8').matchAll(/\\[[^\\]]*\\]\\(([^)#]+)(?:#[^)]+)?\\)/g)){if(/^(https?:|mailto:)/.test(m[1]))continue;const x=p.resolve(p.dirname(f),m[1]);if(!fs.existsSync(x))throw Error(f+' -> '+m[1])}"`

Expected: exit code 0.

### Task 2: Reconciliar as fontes anteriores

**Files:**
- Modify: `docs/planos/2026-08-19-custo-do-processo.md`
- Modify: `docs/planos/2026-08-14-modularizacao-fatias-3-4.md`

**Interfaces:**
- Consumes: `docs/governanca.md` como política normativa.
- Produces: planos preservados como medição e execução, sem concorrer com a política vigente.

- [x] **Step 1: Inserir notas de autoridade**

Adicionar no início de cada plano uma nota curta que preserve seu conteúdo e encaminhe decisões
futuras para `docs/governanca.md`.

- [x] **Step 2: Verificar escopo e integridade**

Run: `git diff --check && git diff --stat`

Expected: nenhuma falha de whitespace e somente arquivos Markdown alterados.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/README.md docs/governanca.md docs/planos/2026-08-19-custo-do-processo.md docs/planos/2026-08-14-modularizacao-fatias-3-4.md docs/superpowers/specs/2026-08-22-governanca-e-criterio-de-parada-design.md docs/superpowers/plans/2026-08-22-governanca-e-criterio-de-parada.md
git commit -m "docs: define governanca e criterio de parada"
```
