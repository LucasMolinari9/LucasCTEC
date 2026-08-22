# C4 Municípios e Localidades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair as famílias completas de Municípios e Localidades do `app.js` para um módulo de documentos testado, sem incluir a composição global da Fase D.

**Architecture:** Um módulo `src/documentos/municipios-localidades.mjs` concentra os quatro loaders, seus runners/renders e helpers exclusivos, usando o contrato explícito de contexto e os módulos de UI existentes. O `app.js` importa as entradas da família e conserva apenas shell que ultrapassaria o limite estreito de dependências mutáveis.

**Tech Stack:** JavaScript ESM, DOM do navegador, Supabase/PostgREST, Node.js `assert`, Playwright/Chromium.

## Global Constraints

- Preserve `ctx = { view, gen, pane, host, line }`.
- Não exporte `currentView`, `activeLine`, `modalBody` nem estado mutável do IIFE.
- Pare e documente em `app.js` se o módulo exigir mais de aproximadamente seis dependências mutáveis.
- Reutilize `src/ui/listas.mjs`; só use `src/ui/blocos.mjs` para markup compartilhado por duas famílias.
- Preserve `#regScope`, `#munScope`, os dois ramos de PDF municipal e o único commit final de Localidades.
- Não inclua a composição global da Fase D.

---

### Task 1: Contrato e medição atual

**Files:**
- Modify: `tests/ui-data-module.test.mjs`
- Modify: `docs/estrutura-frontend.md`

**Interfaces:**
- Consumes: exports ESM e os quatro registros atuais do `app.js`.
- Produces: contrato nominal do módulo e tabela de símbolos/dependências medida no código vigente.

- [x] Adicionar ao teste de módulos a importação e os exports públicos esperados de `municipios-localidades.mjs`.
- [x] Rodar `node tests/ui-data-module.test.mjs` e confirmar falha por módulo ausente.
- [x] Medir limites, símbolos e dependências diretamente no `app.js`, sem copiar números históricos.
- [x] Registrar a medição na documentação estrutural.

### Task 2: Extração das famílias

**Files:**
- Create: `src/documentos/municipios-localidades.mjs`
- Modify: `app.js`
- Modify: `.vercelignore`

**Interfaces:**
- Consumes: `ctx`, helpers de domínio/dados/UI e o seam estreito de documentos.
- Produces: quatro funções usadas pelos registros `LOADERS.ligacoesPorLogradouro`, `LOADERS.municipioRegiao`, `LOADERS.ligacoesPorTerminal` e `LOADERS.localidades`.

- [x] Mover helpers/runners/renders completos e manter helpers exclusivos privados.
- [x] Substituir os corpos no `app.js` por imports/atribuições finas, deixando documentada qualquer responsabilidade de shell retida.
- [x] Preservar filtros, gerações, PDFs e ordem única de commit de Localidades.
- [x] Liberar o arquivo novo individualmente na `.vercelignore`.
- [x] Rodar `node tests/ui-data-module.test.mjs` e confirmar passagem.

### Task 3: Cobertura comportamental e documentação

**Files:**
- Modify: `scripts/check_views.mjs`
- Modify: `scripts/check_selecao_linha.mjs`
- Modify: `scripts/check_corrida_abas.mjs`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: comportamento das quatro views no navegador.
- Produces: asserções sobre seleção persistente, conteúdo dos dois blocos e corridas.

- [x] Acrescentar somente as asserções comportamentais que faltarem aos gates existentes.
- [x] Rodar os gates focados e corrigir regressões no código, não nos contratos.
- [x] Registrar a entrega C4 e suas decisões estruturais no changelog.

### Task 4: Mutação, gates e entrega

**Files:**
- Temporarily modify and restore: `src/documentos/municipios-localidades.mjs`

**Interfaces:**
- Consumes: render movido e contrato mínimo de `check_views`.
- Produces: evidência de que uma quebra real é detectada e árvore final limpa.

- [x] Fazer uma mutação temporária que suprima conteúdo de um render movido.
- [x] Rodar o gate focado e confirmar falha pela mutação.
- [x] Restaurar o arquivo e confirmar passagem do mesmo gate.
- [x] Rodar `node tests/check.js`, `node tests/ui-data-module.test.mjs`, `node scripts/check_views.mjs`, `node scripts/check_selecao_linha.mjs` e `node scripts/check_corrida_abas.mjs`, além dos gates gerais disponíveis.
- [x] Revisar diff, confirmar ausência da Fase D, commitar e criar o PR C4.

