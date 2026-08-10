# Modularização segura do frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o primeiro módulo puro do `app.js` sem alterar comportamento nem banco.

**Architecture:** `app.js` permanece o entrypoint e importa um módulo ESM sem efeitos colaterais. Testes importam a mesma implementação e `version.json` torna a invalidação independente da quantidade de módulos.

**Tech Stack:** JavaScript ESM nativo, Node.js sem dependências, HTML estático e Chromium.

## Global Constraints

- Não executar SQL nem escrever no Supabase.
- Não alterar queries, seleção de ambiente, DOM ou comportamento visual.
- Manter CSP sem `unsafe-inline` e projeto zero-build.

---

### Task 1: Contrato do módulo puro

**Files:** Create `src/domain/core.mjs`; modify `tests/pure.harness.js` and `tests/check.js`.

**Interfaces:** Produces exports com os mesmos nomes e argumentos das funções puras atuais.

- [ ] Escrever teste de importação que falha porque `core.mjs` não existe.
- [ ] Executar o teste e confirmar `ERR_MODULE_NOT_FOUND`.
- [ ] Mover, sem mudança semântica, as funções puras cobertas para `core.mjs`.
- [ ] Fazer o harness reexportar o módulo real e executar todos os testes.
- [ ] Commitar a extração testável.

### Task 2: Entry point ESM e versão atômica

**Files:** Modify `index.html`, `app.js`, `tests/check.js`; create `version.json`.

**Interfaces:** `app.js` importa `core.mjs`; `version.json` expõe `{ "version": 1 }`.

- [ ] Criar guardas que exijam `type="module"`, o import e `version.json` no auto-update.
- [ ] Executar o gate e confirmar falha pelas três ausências.
- [ ] Converter o script, importar as funções e remover apenas suas definições locais.
- [ ] Trocar a lista de ETags pelo `HEAD /version.json`.
- [ ] Executar gate, rigs e smokes de navegador.
- [ ] Commitar a integração.

### Task 3: Documentação e auditoria

**Files:** Modify `docs/estrutura-frontend.md` and `tests/README.md`.

**Interfaces:** Documentação descreve o seam e como adicionar módulos/versionar deploys.

- [ ] Atualizar o mapa e as regras de segurança.
- [ ] Verificar ausência de placeholders e executar `git diff --check`.
- [ ] Rodar novamente o gate completo e commit final.
