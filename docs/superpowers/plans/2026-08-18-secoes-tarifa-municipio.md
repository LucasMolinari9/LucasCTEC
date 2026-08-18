# Seções de tarifa nos modos por Município — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nos modos "Do Município A para o Município B" e "Trafegam nos municípios A e B" do card
Linhas por Localidade e Município, mostrar a tabela de seções de tarifa (e o valor) de cada linha
do resultado — hoje só o modo por Localidade mostra isso.

**Architecture:** `mostrarLinhasResultado` (a função de render comum aos dois modos por
Município) passa a buscar TODAS as seções de `tarifa_atual_teste` das linhas encontradas (sem
filtro por nome, diferente do modo Localidade) e a pintar com `renderLocalidadeSecoes` — a
mesma função visual que o modo Localidade já usa — em vez de `lineResults`. Como o texto fixo
do bloco "Outras linhas" (`renderLocalidadeSecoes`/`pintarLocalidadeSecoes`) descreve um motivo
específico do modo Localidade (seção que não bate o NOME buscado), esses dois textos viram
parâmetros opcionais, com o texto atual como default — o modo Localidade não muda de
comportamento.

**Tech Stack:** JS vanilla (IIFE, `app.js`), Playwright (`scripts/check_views.mjs`, headless,
contra o stub do PostgREST em `scripts/lib/rig.mjs`). Sem framework, sem `package.json`.

## Global Constraints

- Zero-build: todo JS novo vai dentro de `app.js` (nada de `<script>` inline em `index.html`).
- Não duplicar busca/listagem — reusar `renderLocalidadeSecoes`, `fetchLinesByCods`, `groupBy`,
  `enc`, `sbFetch`, já existentes.
- `VIEW_TABLES.localidades` já inclui `tarifa_atual_teste` — não precisa mexer nisso (o
  Realtime já cobre a query nova).
- Nenhuma mudança de schema/RLS/Realtime — não aciona a skill `db-change`.
- Antes de considerar pronto: `node tests/check.js` (offline, sempre) e
  `node scripts/check_views.mjs localidades` (Playwright — precisa de navegador headless, já
  disponível neste ambiente) têm que estar verdes.
- Commits em português, seguindo o estilo do repo (mensagem curta + corpo quando precisa).

---

### Task 1: Caso de regressão em `check_views.mjs` (RED)

**Files:**
- Modify: `scripts/check_views.mjs` (array `VIEWS`, perto da linha 70 — a entrada existente
  `{ key: 'localidades', busca: 'rio', ... }`)

**Interfaces:**
- Consumes: nada de `app.js` diretamente — dirige o DOM já publicado (`.loc-filter-btn`,
  `#locA`, `#locB`, `#locGo`), igual à entrada `localidades` existente.
- Produces: uma segunda entrada em `VIEWS` com `key: 'localidades'`, que a Task 2 precisa
  fazer passar. Não precisa de nome próprio — o campeonato (`makeReporter`) aceita nomes
  repetidos no placar (confirmado em `scripts/lib/rig.mjs:305-312`, sem dedupe por chave).

O fixture do `rig.mjs` já tem o que basta para este caso, sem editar `FIXTURES`: a linha
`549000001` tem trechos de itinerário em `RIO DE JANEIRO` (cod_ibge `3304557`, sentido IDA) e em
`NITEROI` (cod_ibge `3303302`, sentido VOLTA) — então ela entra no modo NÃO-direcional
("Trafegam nos municípios A e B", `data-idx="4"` em `LOC_FILTERS`) ao cruzar os dois. Essa mesma
linha tem 2 seções em `tarifa_atual_teste` (`101`, secao 1 e 2) — por isso o teste consegue
exigir `.loc-linha-sec`/`.loc-emp-head` (o marcador visual de `renderLocalidadeSecoes`) sem
tocar em fixture nenhuma.

- [ ] **Step 1: Adicionar a entrada nova em `VIEWS`, logo depois da entrada `localidades` já existente**

```js
  // Mesma view do card acima, mas exercitando um dos 2 modos por MUNICÍPIO (idx 4 de
  // LOC_FILTERS = "Trafegam nos municípios A e B") — cobre o caminho de render que passou a
  // usar renderLocalidadeSecoes (seções/tarifa por linha) em vez de lineResults.
  { key: 'localidades', minimo: { '.loc-linha-sec': 1, '.loc-emp-head': 1, 'tbody tr': 2 },
    driver: async page => {
      await page.click('.modal-body.active .loc-filter-btn[data-idx="4"]');
      await page.fill('.modal-body.active #locA', 'Rio de Janeiro');
      await page.fill('.modal-body.active #locB', 'Niteroi');
      await page.click('.modal-body.active #locGo');
    } },
```

- [ ] **Step 2: Rodar o script e confirmar que a entrada nova FALHA (código ainda não mudou)**

Run: `node scripts/check_views.mjs localidades`
Expected: a PRIMEIRA entrada `localidades` (busca "rio") continua `ok`; a SEGUNDA entrada
`localidades` (o driver novo) dá `FALHA` com `conteúdo abaixo do contrato: 0 ".loc-linha-sec"`
(ou `.loc-emp-head`) — hoje esse modo pinta com `lineResults`, que não usa essas classes.
Se a segunda entrada passar de primeira, pare e investigue — o teste não está testando o que
deveria.

- [ ] **Step 3: Commit**

```bash
git add scripts/check_views.mjs
git commit -m "test: caso de regressão p/ seções nos modos por Município (RED)

Cobre o modo 'Trafegam nos municípios A e B' do card Linhas por
Localidade e Município — hoje pinta com lineResults (sem seção/tarifa);
vai passar a usar renderLocalidadeSecoes na próxima tarefa.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018BnCL2TPE3AT2JsZGDsG9A"
```

---

### Task 2: Implementar a mudança em `app.js` (GREEN)

**Files:**
- Modify: `app.js` — três pontos, todos dentro da seção `COMPONENTES AUXILIARES` /
  `MODAL / SISTEMA DE VIEWS`:
  1. `renderLocalidadeSecoes` (perto da linha 2804)
  2. `pintarLocalidadeSecoes` (perto da linha 2840)
  3. `mostrarLinhasResultado` (perto da linha 2116)

**Interfaces:**
- Consumes: `renderLocalidadeSecoes(host, base, secByLine, opts)` e
  `pintarLocalidadeSecoes(host, base, secByLine, opts)` já existem — só ganham 2 chaves NOVAS
  e opcionais em `opts`: `semSecaoSub` (string, default `'por itinerário ou nome'`) e
  `semSecaoObs` (string, default o valor atual de `LOC_SEM_SECAO_OBS`). `fetchLinesByCods`,
  `groupBy`, `enc`, `sbFetch`, `distinctCods` já existem, sem mudança de assinatura.
- Produces: `mostrarLinhasResultado` continua com a MESMA assinatura
  (`host, cods, titulo`) — quem chama (`mostrarLinhasEntreMunicipios`) não muda.

- [ ] **Step 1: Parametrizar `renderLocalidadeSecoes` e `pintarLocalidadeSecoes`**

Ler o trecho atual antes de editar (o texto exato pode ter mudado de linha desde este plano —
localize pelo nome da função, não pelo número). Estado hoje:

```js
function renderLocalidadeSecoes(host, base, secByLine, { prefixHTML='', view, gen } = {}){
  host.innerHTML = prefixHTML
    + `<div class="loc-tools">${situacaoSelectHTML()}</div><div id="locSecResult"></div>`;
  const result = host.querySelector('#locSecResult');
  const statusSel = host.querySelector('#lrStatus');
  const paint = () => {
    const rows = filtrarSituacao(base, statusSel.value);
    // o contador do `prefixHTML` é o do resultado INTEIRO e fica acima da barra; ao filtrar,
    // repetir só o total mentiria sobre o que está na tela — daí a contagem do recorte.
    pintarLocalidadeSecoes(result, rows, secByLine, { total: base.length, view, gen });
  };
  statusSel.addEventListener('change', paint);
  paint();
}
```

Substituir por (repassa os dois textos novos para `pintarLocalidadeSecoes`, com o default do
modo Localidade preservado):

```js
function renderLocalidadeSecoes(host, base, secByLine, { prefixHTML='', view, gen, semSecaoSub, semSecaoObs } = {}){
  host.innerHTML = prefixHTML
    + `<div class="loc-tools">${situacaoSelectHTML()}</div><div id="locSecResult"></div>`;
  const result = host.querySelector('#locSecResult');
  const statusSel = host.querySelector('#lrStatus');
  const paint = () => {
    const rows = filtrarSituacao(base, statusSel.value);
    // o contador do `prefixHTML` é o do resultado INTEIRO e fica acima da barra; ao filtrar,
    // repetir só o total mentiria sobre o que está na tela — daí a contagem do recorte.
    pintarLocalidadeSecoes(result, rows, secByLine, { total: base.length, view, gen, semSecaoSub, semSecaoObs });
  };
  statusSel.addEventListener('change', paint);
  paint();
}
```

Estado hoje de `pintarLocalidadeSecoes` (a função logo abaixo, depois de
`locComSecaoHTML`/`LOC_SEM_SECAO_OBS`):

```js
function pintarLocalidadeSecoes(host, base, secByLine, { total = base.length, view, gen } = {}){
  // filtro que não sobra nada: zera o pdfHTML junto, senão o botão PDF baixaria o recorte anterior
  if(!base.length){ host.innerHTML = emptyBox('Nenhuma linha com esse filtro.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const comSecao = [...groupBy(base.filter(r=>secByLine.has(r.codlinha)), r=>r.codempresa||'—')]
    .sort((x,y)=>rjOrder(x[0],y[0])).flatMap(([,rs])=>[...rs].sort(byCodlinha));
  const semSecao = base.filter(r=>!secByLine.has(r.codlinha));
  const totais = countBy(comSecao, r=>r.codempresa||'—');

  const cabSemSecao = `<h3 class="loc-emp-head mt22">Outras linhas <span class="loc-emp-rj">por itinerário ou nome · ${semSecao.length} linha(s)</span></h3>`
    + `<div class="doc-obs tight">${LOC_SEM_SECAO_OBS}</div>`;
```

Substituir as 2 linhas finais (as que montam `cabSemSecao`, e a assinatura da função) por:

```js
function pintarLocalidadeSecoes(host, base, secByLine, { total = base.length, view, gen, semSecaoSub = 'por itinerário ou nome', semSecaoObs = LOC_SEM_SECAO_OBS } = {}){
  // filtro que não sobra nada: zera o pdfHTML junto, senão o botão PDF baixaria o recorte anterior
  if(!base.length){ host.innerHTML = emptyBox('Nenhuma linha com esse filtro.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const comSecao = [...groupBy(base.filter(r=>secByLine.has(r.codlinha)), r=>r.codempresa||'—')]
    .sort((x,y)=>rjOrder(x[0],y[0])).flatMap(([,rs])=>[...rs].sort(byCodlinha));
  const semSecao = base.filter(r=>!secByLine.has(r.codlinha));
  const totais = countBy(comSecao, r=>r.codempresa||'—');

  const cabSemSecao = `<h3 class="loc-emp-head mt22">Outras linhas <span class="loc-emp-rj">${semSecaoSub ? esc(semSecaoSub)+' · ' : ''}${semSecao.length} linha(s)</span></h3>`
    + `<div class="doc-obs tight">${semSecaoObs}</div>`;
```

(`semSecaoObs` continua indo direto pro HTML sem `esc()` — mesmo tratamento que
`LOC_SEM_SECAO_OBS` já tinha: é texto fixo do código, nunca dado do usuário/banco. `semSecaoSub`
idem, mas leva `esc()` porque compõe a mesma `<span>` que já tinha texto fixo sem escape — segue
o padrão do restante da função, que não escapa strings constantes suas.)

Nenhuma outra linha de `pintarLocalidadeSecoes` muda — o resto da função (paginação, PDF) já é
agnóstico do texto do cabeçalho.

- [ ] **Step 2: Rodar o `check_views.mjs` de novo — a entrada 1 (Localidade) tem que continuar OK**

Run: `node scripts/check_views.mjs localidades`
Expected: a primeira entrada (`busca: 'rio'`) passa OK — os defaults preservam o texto e o
comportamento atuais. A segunda (a nova, da Task 1) ainda FALHA — `mostrarLinhasResultado`
ainda não foi tocada.

- [ ] **Step 3: Reescrever `mostrarLinhasResultado`**

Estado hoje:

```js
async function mostrarLinhasResultado(host, cods, titulo){
  const view = currentView, gen = beginGen(view);
  if(!cods.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para este critério.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const slice = cods.slice(0,250);
  const rows = await fetchLinesByCods(slice,{limit:250});
  const extra = cods.length>slice.length ? ` (mostrando ${slice.length})` : '';
  const prefix = `<p class="doc-count">${cods.length} linha(s) — ${esc(titulo)}${extra}</p>`;
  lineResults(host, rows, { prefixHTML: prefix, view, gen });
}
```

Substituir por:

```js
async function mostrarLinhasResultado(host, cods, titulo){
  const view = currentView, gen = beginGen(view);
  if(!cods.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para este critério.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const slice = cods.slice(0,250);
  const rows = await fetchLinesByCods(slice,{limit:250});
  // Diferente do modo Localidade (que filtra a seção pelo NOME buscado), aqui não há um nome
  // pra casar — a busca é geográfica (itinerário). Mostra a tabela de tarifa INTEIRA de cada
  // linha encontrada.
  const baseCods = distinctCods(rows, 250);
  let secByLine = new Map();
  if(baseCods.length){
    const secRows = await sbFetch('tarifa_atual_teste',
      `codlinha=in.(${baseCods.map(enc).join(',')})&select=codlinha,secao,nome_ligacao,nome_ligacao_cresc,tipo_ligacao,tarifa,situacao&order=codlinha,secao&limit=5000`);
    secByLine = groupBy(secRows, r=>r.codlinha);
  }
  const comSecaoN = rows.reduce((n,r)=>n+(secByLine.has(r.codlinha)?1:0),0);
  const secNote = comSecaoN ? ` · ${comSecaoN} com tarifa cadastrada` : '';
  const extra = cods.length>slice.length ? ` (mostrando ${slice.length})` : '';
  const prefix = `<p class="doc-count">${cods.length} linha(s) — ${esc(titulo)}${secNote}${extra}</p>`;
  renderLocalidadeSecoes(host, rows, secByLine, { prefixHTML: prefix, view, gen,
    semSecaoSub: '', semSecaoObs: 'Ligam os municípios buscados, mas não têm seção de tarifa cadastrada.' });
}
```

- [ ] **Step 4: Rodar o `check_views.mjs` de novo — as DUAS entradas `localidades` têm que passar**

Run: `node scripts/check_views.mjs localidades`
Expected: `2 view(s) OK.` (as duas entradas `localidades`, uma pra cada modo).

- [ ] **Step 5: Rodar o gate offline completo**

Run: `node tests/check.js`
Expected: todas as seções (`[1]`…`[2b]` incl.) verdes — em especial `[2b]` (deriva docs×código),
que não deveria acusar nada (nenhum fato numérico do CLAUDE.md mudou, `tarifa_atual_teste` já
está listado em "Tabelas → onde aparecem"). Se acusar algo, PARE e reavalie — não force o gate.

- [ ] **Step 6: Rodar a bateria completa de views, não só as tocadas**

Run: `node scripts/check_views.mjs`
Expected: todas as views (inclusive as 2 `localidades`) OK — garante que nada em volta
(realtime, outras views que também usam `lineResults`/`fetchLinesByCods`) quebrou.

- [ ] **Step 7: Commit**

```bash
git add app.js
git commit -m "feat: seções de tarifa nos modos por Município

Os modos 'Do Município A para o Município B' e 'Trafegam nos
municípios A e B' (card Linhas por Localidade e Município) passam a
mostrar a tabela de seções/tarifa de cada linha, no mesmo formato do
modo Localidade (renderLocalidadeSecoes) — como não há nome pra
filtrar seção nesse modo, mostra a tarifa inteira da linha.

renderLocalidadeSecoes/pintarLocalidadeSecoes ganham semSecaoSub/
semSecaoObs opcionais (default = texto atual do modo Localidade, sem
mudança de comportamento nele).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018BnCL2TPE3AT2JsZGDsG9A"
```

- [ ] **Step 8: Push**

```bash
git push -u origin claude/ola-ucii4k
```

(Se falhar por erro de rede, repetir com backoff 2s/4s/8s/16s, até 4 tentativas — ver instruções
de Git Operations da sessão.)

---

## Verificação final (pós-push)

- Conferir o preview deploy da branch (Vercel) nos dois modos por Município com municípios reais
  (ex.: Macaé/Rio das Ostras, do print original) e comparar visualmente com o modo Localidade —
  este passo é MANUAL, fora do escopo dos gates automatizados, mas fecha o loop com o pedido
  original do usuário.
