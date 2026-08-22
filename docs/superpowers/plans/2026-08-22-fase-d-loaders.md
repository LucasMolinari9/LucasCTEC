# Fase D Loaders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `LOADERS` um registro explícito de loaders documentais exportados, preservando no shell os helpers reservados à Fase E.

**Architecture:** Cada família exporta loaders finais `loader(ctx)` e recebe apenas suas ações de shell por um configurador próprio fail-closed. `app.js` configura as famílias no bootstrap e associa os exports diretamente; infraestrutura que abre views novas continua local.

**Tech Stack:** JavaScript ES modules, Node.js assertions, Playwright headless e Semgrep.

## Global Constraints

- Não migrar novamente corpos já extraídos nas fases C1–C4.
- Preservar `lineDocView`, `lineDocRun`, `lineSearchRun` e `searchPanel` em `app.js`.
- Não criar container global, service locator ou objeto genérico de dependências.
- Tratar qualquer corpo documental extenso remanescente como falha da família C responsável.
- Executar obrigatoriamente `check_abas`, `check_corrida_abas`, `check_views` e os gates gerais.

---

### Task 1: Guardar o contrato estrutural da Fase D

**Files:**
- Modify: `tests/check.js`
- Test: `tests/check.js`

**Interfaces:**
- Consumes: texto de `app.js` e exports dos módulos documentais.
- Produces: gate que exige associações diretas, rejeita wrappers triviais e preserva os quatro helpers.

- [x] **Step 1: Escrever a asserção estrutural antes da implementação**
- [x] **Step 2: Rodar `node tests/check.js` e confirmar falha causada pelo registro antigo**
- [x] **Step 3: Manter a falha como guia da implementação**

### Task 2: Exportar e registrar os loaders finais

**Files:**
- Modify: `src/documentos/frota-historico-itinerarios.mjs`
- Modify: `src/documentos/estrutura-tarifas-portaria.mjs`
- Modify: `src/documentos/quadro-empresas.mjs`
- Modify: `app.js`
- Test: `tests/ui-data-module.test.mjs`

**Interfaces:**
- Consumes: configuradores de família com as ações nominais `lineDocView`, `lineDocRun`,
  `lineSearchRun` e `searchPanel` necessárias a cada família.
- Produces: exports `loadHistoricoLinha`, `loadItinerarios`, `loadFrota`, `loadEstrutura`,
  `loadTarifas`, `loadQuadroHorarios`, `loadLigacoesPorEmpresa`, `loadSecoesPorEmpresa` e
  `loadHistoricoEmpresa`, todos com assinatura `(ctx) => void | Promise<void>`.

- [x] **Step 1: Acrescentar testes fail-closed e de encaminhamento para os configuradores**
- [x] **Step 2: Rodar `node tests/ui-data-module.test.mjs` e confirmar falha por exports ausentes**
- [x] **Step 3: Implementar os configuradores e loaders mínimos reutilizando renders existentes**
- [x] **Step 4: Associar os exports diretamente em `app.js` e remover wrappers sem comportamento**
- [x] **Step 5: Rodar `node tests/ui-data-module.test.mjs` e `node tests/check.js` até ambos passarem**

### Task 3: Registrar inventário e critério de parada

**Files:**
- Modify: `docs/planos/2026-08-14-modularizacao-fatias-3-4.md`
- Modify: `CLAUDE.md`
- Modify: `docs/CHANGELOG.md`
- Modify: `version.json`

**Interfaces:**
- Consumes: inventário final do código implementado.
- Produces: estado vivo marcando B, C4 e D concluídas, wiring remanescente nominal e decisão sobre E.

- [x] **Step 1: Atualizar a tabela de fases e as seções B, C4 e D**
- [x] **Step 2: Atualizar `CLAUDE.md` com o bootstrap e o wiring que ficou**
- [x] **Step 3: Registrar a entrega no changelog e incrementar `version.json`**
- [x] **Step 4: Rodar `node tests/check.js` para validar fatos derivados e documentação**

### Task 4: Verificação, revisão e entrega

**Files:**
- Review: all changed files

**Interfaces:**
- Consumes: árvore final da Fase D.
- Produces: evidência dos gates, commit único e PR próprio.

- [x] **Step 1: Rodar `node tests/check.js`**
- [x] **Step 2: Rodar `node scripts/check_views.mjs`**
- [x] **Step 3: Rodar `node scripts/check_abas.mjs`**
- [x] **Step 4: Rodar `node scripts/check_selecao_linha.mjs`**
- [x] **Step 5: Rodar `node scripts/check_corrida_abas.mjs`**
- [x] **Step 6: Rodar `./scripts/semgrep.sh`**
- [x] **Step 7: Revisar diff e confirmar cada requisito do desenho**
- [x] **Step 8: Fazer commit e criar o PR próprio da Fase D**
