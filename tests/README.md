# Testes — lógica pura do `index.html` (sem navegador, sem rede)

Testes unitários isolados (Node, **sem dependências**) da lógica do `index.html`.
Não precisam de navegador nem de rede: o `fetch` é mockado, o `AbortController` é o
nativo do Node, e as funções puras (formatação, busca, filtros) são copiadas
**verbatim** dos respectivos blocos do `index.html`.

## Como rodar

**Recomendado — roda tudo de uma vez (é o gate de pré-publicação):**
```bash
node tests/check.js
```
Esse comando: (1) valida a **sintaxe** do `<script>` inline do `index.html` sem
executá-lo; (2) confere que as cópias verbatim ainda batem com o `index.html`
(**guarda anti-drift**); (3) roda todos os `*.test.js`. Sai com código ≠ 0 se algo
falhar — **rode-o antes de cada publicação**.

Avulso (um arquivo só), se quiser:
```bash
cd tests
node sbFetch.test.js   # → ==== PLACAR: 28/28 ====
node pure.test.js      # → ==== PLACAR: 56/56 ====
```

## O que é coberto
- **`sbFetch`** — sucesso; retry em 5xx e 429; 4xx que **não** repete (lança a
  mensagem do corpo); erro de rede (`TypeError`) que repete até o limite; e
  **timeout** via `AbortController` (não trava).
- **`marcarTrunc`** — marca arrays cortados (`limit>=50` que veio cheia) com a flag
  **não-enumerável** `_trunc`/`_limite`; não marca quando o limite é pequeno (<50),
  ausente, ou a lista não encheu; confirma que a flag **não vaza** em
  `JSON.stringify`/`Object.keys`/`spread`/`map`.
- **`bannerTrunc`** — gera o aviso "Resultado parcial…" só quando há truncagem.
- **Formatação:** `fmtCode`, `fmtTime`, `fmtDate`, `fmtMoney`, `orDash`, `boolChip`.
- **Segurança/busca:** `esc` (escape HTML / XSS), `enc`, `norm` (acento+caixa).
- **Lógica de negócio:** `matchEvent` (filtro do histórico por texto/processo/ano),
  `groupBy`/`countBy` (agregação dos relatórios), `rowMatchesActiveLine` (filtro do
  Realtime: só recarrega quando a mudança é da linha ativa).

## Arquivos
- `check.js` — **runner / gate de pré-publicação** (sintaxe + anti-drift + testes).
- `harness.js` — cópia das funções do bloco SUPABASE CONFIG + mocks; usado por `sbFetch.test.js`.
- `sbFetch.test.js` — casos de `sbFetch`/`marcarTrunc`/`bannerTrunc`.
- `pure.harness.js` — cópia **verbatim** das funções puras (com a linha de origem citada).
- `pure.test.js` — casos das funções puras.

## ⚠️ Regra de ouro (anti-drift)
Os harness **copiam o código do `index.html` à mão**. Ao **editar uma dessas funções
no `index.html`, atualize a cópia** no harness correspondente. O `check.js` tem uma
guarda que falha avisando "harness DESATUALIZADO" se um trecho canônico sumir do
`index.html` — mas ela cobre só os trechos listados; mantenha a disciplina.

> Observação: estes testes cobrem a camada de dados/lógica pura. A renderização (DOM)
> e o PDF não são testados aqui — exigiriam um navegador headless.
