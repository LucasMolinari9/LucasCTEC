# Análise de Duplicação de Código — Portal DIVAT

> **Tipo:** relatório de análise (somente leitura). Nenhuma linha do `index.html` foi alterada,
> nenhuma operação de banco foi executada. As referências `index.html:NNN` são do estado atual
> do arquivo; como o JS é um único bloco, os números podem deslocar a cada edição — confira
> sempre pelo **trecho de código citado**, não só pela linha.

## Sumário

O frontend é **um único `index.html`** com JS embutido (~2.1k linhas). **Não é React**, então
não há "hooks" — as unidades reutilizáveis aqui são **funções utilitárias** e **builders de HTML**.
O código já está razoavelmente fatorado (existem `sbFetch`, `tableHTML`, `metaRows`, `searchPanel`,
`lineResults`, `linhasTable`, `groupBy`…). A duplicação restante está concentrada em **3 pipelines
de UI** que foram copiados-e-colados entre loaders de cards, mais alguns idiomas curtos repetidos.

Catálogo abaixo, do **maior ganho** ao **opcional**:

| ID | Padrão | Cópias | Risco da refatoração | Recomendado? |
|----|--------|:------:|:--------------------:|:------------:|
| D1+D2 | Resolvedor de busca de linha (termo → 1/N linhas) | 3–5 | Baixo | ✅ Sim |
| D3+D4 | Resolvedor de empresa por nome/código + tabela de escolha | 2–3 | Baixo | ✅ Sim |
| D5 | Pipeline "codlinhas → buscar linhas → `lineResults`" | ~6 | Baixo | ✅ Sim |
| D6 | Composição de chips de status | ~4 | Muito baixo | ➖ Opcional |
| D7 | Closure `sentidoKey` duplicada | 2 | Trivial | ➖ Opcional |
| D8 | Idioma `currentView.pdfHTML = …` / `= null` | 24 / 21 | Cosmético (alto churn) | ➖ Opcional |
| D9 | Early-return de resultado vazio | ~6–12 | Cosmético | ➖ Opcional |
| D10 | Builders de `metaRows` da linha | ~6 | **Médio** (rótulos divergem) | ⚠️ Cuidado |

---

## D1 — Resolvedor de busca de linha (termo → 1 ou N linhas) ★ maior ganho

O mesmo bloco "pega o termo, monta os dois `ilikeTerm`, consulta `tabela_vista_teste`, trata 0/1/N
resultados" foi copiado entre vários loaders.

**Idioma A — os dois termos de busca** (`const e1 = ilikeTerm(term), code = ilikeTerm(term.replace(/[-.\s]/g,''));`):
- `doSearch` (hero) — `index.html:922-923` (usa `encCode` em vez de `code`)
- `lineDocRun` — `index.html:1466`
- `historicoLinha` (onRun) — `index.html:1634`
- `quadroLinhaRun` — `index.html:1798`
- `ligacoesPorNumero` — `index.html:2138`

**Idioma B — a query verbatim** (idêntica em 3 lugares):
```js
or=(nome_ligacao.ilike.*${e1}*,numero_ligacao.ilike.*${e1}*,codlinha.ilike.*${code}*)&select=${LINE_FIELDS}&order=nome_ligacao&limit=40
```
- `lineDocRun` — `index.html:1467`
- `historicoLinha` — `index.html:1635`
- `quadroLinhaRun` — `index.html:1799`

(`doSearch` :924-927 e `ligacoesPorNumero` :2140 são variantes da mesma query: `limit=15` com
dropdown, e `or=(numero…,codlinha…)` sem nome.)

### Refatoração sugerida
Uma função de busca pura + um orquestrador que trata os 3 casos (nenhuma / uma / várias linhas):

```js
// 1) só a busca — devolve as linhas
async function searchLines(term, { limit = 40, order = 'nome_ligacao' } = {}) {
  const e1 = ilikeTerm(term), code = ilikeTerm(term.replace(/[-.\s]/g, ''));
  return sbFetch('tabela_vista_teste',
    `or=(nome_ligacao.ilike.*${e1}*,numero_ligacao.ilike.*${e1}*,codlinha.ilike.*${code}*)`
    + `&select=${LINE_FIELDS}&order=${order}&limit=${limit}`);
}

// 2) orquestra 0 / 1 / N dentro de um host (reusa linhasTable + selectLine)
async function pickLine(term, host, { onResolved, emptyMsg, prompt = 'clique para abrir' }) {
  const lines = await searchLines(term);
  if (!lines.length) { host.innerHTML = emptyBox(emptyMsg); clearPdf(); return; }
  if (lines.length === 1) { selectLine(lines[0]); return onResolved(host, lines[0]); }
  await getEmpresas();
  host.innerHTML = `<p class="pick-hint">${lines.length} linha(s) encontradas — ${prompt}:</p>`
    + linhasTable(lines);
  host.querySelectorAll('tr[data-row]').forEach(tr =>
    tr.addEventListener('click', () => { const l = JSON.parse(tr.dataset.row); selectLine(l); onResolved(host, l); }));
}
```

Depois `lineDocRun`, o onRun de `historicoLinha` e `quadroLinhaRun` encolhem para ~3 linhas, cada
um só passando seu `onResolved` (renderiza o documento / o histórico / o quadro). Reusa o que já
existe: `ilikeTerm`, `LINE_FIELDS`, `sbFetch`, `linhasTable`, `selectLine`, `getEmpresas`.

**Ganho:** elimina ~3 cópias da query + ~3 cópias do bloco de listagem. **Telas idênticas** (mesmo
HTML, mesma query). O hero `doSearch` pode passar a usar `searchLines(term, { limit: 15, order: 'codlinha' })`
e manter o seu render de dropdown próprio.

---

## D2 — Bloco "várias linhas → escolher" (faz par com D1)

O trecho `<p>…N linha(s) encontradas — clique…</p>` + `linhasTable(lines)` +
`querySelectorAll('tr[data-row]')…selectLine`:
- `index.html:1471-1472`
- `index.html:1640-1641`
- `index.html:1803-1804`

**É exatamente o "caso N" do `pickLine` acima** — sai de graça ao adotar D1.

---

## D3 — Resolvedor de empresa por nome/código ★

Filtro client-side idêntico sobre `empresaList`:
```js
(empresaList||[])
  .filter(e => norm(e.nome_empresa).includes(nt) || String(e.codempresa||'').includes(term))
  .sort((a,b)=> String(a.nome_empresa||'').localeCompare(String(b.nome_empresa||'')))
  .slice(0,40)
```
- `quadroEmpresaRun` — `index.html:1856-1860`
- `historicoEmpresa` (onRun) — `index.html:2106-2109`

Variante mais leve (sobre `empresaMap`, sem ordenar) em `ligacoesPorEmpresa` — `index.html:2052-2053`.

### Refatoração sugerida
```js
function searchEmpresas(term, { limit = 40 } = {}) {   // assume getEmpresas() já carregado
  const nt = norm(term);
  return (empresaList || [])
    .filter(e => norm(e.nome_empresa).includes(nt) || String(e.codempresa || '').includes(term))
    .sort((a, b) => String(a.nome_empresa || '').localeCompare(String(b.nome_empresa || '')))
    .slice(0, limit);
}
```
Reusa `norm` e `empresaList`. Os dois loaders passam a chamar `searchEmpresas(term)`.

---

## D4 — Tabela "empresas → escolher" (faz par com D3)

Montagem de `tableHTML` de empresas (colunas Código / Empresa / Situação) + ligação de clique,
diferindo só por **chips extras** e pelo **callback** de destino:
- `quadroEmpresaRun` — `index.html:1862-1866` (callback → `renderEmpresaQuadros`)
- `historicoEmpresa` — `index.html:2112-2116` (callback → `renderEmpresaHistory`, com chips
  `cassada`/`interv.`)

### Refatoração sugerida
```js
function empresaChooserHTML(emps, { prompt = 'clique para abrir', extraChips } = {}) {
  const rows = emps.map(e => `<tr class="clickable" tabindex="0" role="button"
    data-emp="${esc(e.codempresa)}" data-nome="${esc(e.nome_empresa||'')}">
    <td class="td-num">${esc(e.codempresa)}</td>
    <td class="td-logr">${esc(e.nome_empresa||'—')}</td>
    <td class="td-tipo">${esc(orDash(e.situacao))}${extraChips ? ' ' + extraChips(e) : ''}</td></tr>`).join('');
  return `<p class="pick-hint">${emps.length} empresa(s) encontradas — ${prompt}:</p>`
    + tableHTML([{t:'Código',w:'90px'},{t:'Empresa'},{t:'Situação',w:'170px'}], rows, emps.length+' empresa(s)');
}
```
Com um bind genérico `(host, fn) => host.querySelectorAll('tr[data-emp]').forEach(tr => tr.addEventListener('click', () => fn(tr.dataset.emp, tr.dataset.nome)))`.
`historicoEmpresa` passa `extraChips: e => boolChip(e.cassada,'cassada')+boolChip(e.sob_intervencao,'interv.')`.

---

## D5 — Pipeline "codlinhas → buscar linhas → `lineResults`" ★ (~6 cópias)

Vários cards seguem a mesma receita: a partir de uma lista de itinerários, extraem `codlinha`
distintos, buscam as linhas em `tabela_vista_teste` e renderizam com `lineResults`.

**Sub-idioma A — codlinhas distintos** (`[...new Set(it.map(r=>r.codlinha).filter(Boolean))].slice(0,N)`):
- `index.html:2150` (logradouro, 100)
- `index.html:2183` (região, 500)
- `index.html:2202` (`openLinhasPorIbge`, 150)
- `index.html:2300` (terminal, 120)
- também em `linhasNoMunicipio` — `index.html:2220-2221` (sem slice)

**Sub-idioma B — buscar as linhas + empresas** (`codlinha=in.(${cods.map(enc).join(',')})&select=${LINE_FIELDS}&order=nome_ligacao&limit=N` + `getEmpresas()` + `lineResults`):
- `ligacoesPorLogradouro` — `index.html:2152-2157`
- `municipioRegiao` (região) — `index.html:2185-2191`
- `openLinhasPorIbge` — `index.html:2204-2215`
- `mostrarLinhasResultado` — `index.html:2226-2232`
- `ligacoesPorTerminal` — `index.html:2302-2307`
- `mostrarLinhasPorLocalidade` (trecho final) — `index.html:2497, 2515-2517`

### Refatoração sugerida
```js
const distinctCods = (rows, limit) =>
  [...new Set(rows.map(r => r.codlinha).filter(Boolean))].slice(0, limit);

async function fetchLinesByCods(cods, { limit = 300 } = {}) {  // devolve rows; carrega empresas
  const [rows] = await Promise.all([
    sbFetch('tabela_vista_teste',
      `codlinha=in.(${cods.map(enc).join(',')})&select=${LINE_FIELDS}&order=nome_ligacao&limit=${limit}`),
    getEmpresas()
  ]);
  return rows;
}
```
`mostrarLinhasResultado` (`index.html:2223`) já é quase isso — pode virar um fino wrapper sobre os
dois helpers (calcula o prefixo e chama `lineResults`). Reusa `enc`, `LINE_FIELDS`, `lineResults`,
`bannerTrunc`, `getEmpresas`.

**Ganho:** centraliza a query de linhas-por-código (hoje espalhada em ~6 cópias com `limit`
variando), o que também facilita o item da CLAUDE.md sobre **índices/escala** — um único ponto para
ajustar quando as tabelas crescerem.

---

## D6–D10 — Follow-up opcional (NÃO recomendado para a 1ª rodada)

Itens de menor valor; documentados para completude. Os 3 primeiros são quase inócuos, mas geram
**bastante churn** (muitos sites) para um ganho cosmético; D10 exige cuidado.

- **D6 — Chips de status.** `[...].filter(Boolean).join(' ') || '<span class="chip chip-off">…</span>'`
  em `index.html:1487` (folhaRosto), `:1655` (`secoesTarifasHTML`, com datas), `:1999`
  (`empresasRegulares`, fallback com `situacao`) e `:2089` (`renderEmpresaHistory`).
  → `statusChips(parts, fallback)` = `parts.filter(Boolean).join(' ') || fallback`. ~4 sites.

- **D7 — Closure `sentidoKey` duplicada.** `(cod,nome) => orig[cod] || nome || ('Origem '+orDash(cod))`
  em `quadroHorariosBodyHTML` (`index.html:1681`) e `renderLinhaQuadro` (`index.html:1826`).
  → módulo: `const sentidoKey = (orig, cod, nome) => orig[cod] || nome || ('Origem '+orDash(cod));`. Trivial.

- **D8 — Idioma `currentView.pdfHTML`.** `if (currentView) currentView.pdfHTML = ()=>…` (24×) e
  `currentView.pdfHTML = null` (21×) espalhados pelos renders. → helpers `setPdf(fn)` e `clearPdf()`.
  Reduz ruído, mas é **puramente cosmético e de alto churn** (toca ~45 linhas).

- **D9 — Early-return de vazio.** `if(!rows.length){ host.innerHTML=emptyBox('…'); …pdfHTML=null; return; }`
  (~6 ocorrências no formato exato, ~12 em variantes). → `emptyAndClear(host, msg)`. Liga-se a D8.

- **D10 — Builders de `metaRows` da linha. ⚠️ cuidado.** O prefixo
  Empresa / Registro / Código / Número / Ligação / Via / Característica / Tipo se repete em
  `index.html:1488` (folhaRosto), `:1620` (renderLineHistory), `:1709` (`quadroMetaHTML`),
  `:1754` (itinerarios), `:1940` (frota), `:1967` (estrutura). **Mas os rótulos divergem de
  propósito** ("Código" vs "Código da Ligação", "Tipo" vs "Tipo da Ligação", presença de
  Registro/Número). Um `lineMetaPairs(line)` só capturaria o subconjunto realmente idêntico —
  extração **parcial** e com risco de uniformizar rótulos sem querer. Menor prioridade.

---

## Por que NÃO mexer nas funções puras

`esc`, `enc`, `fmtCode`, `fmtTime`, `fmtDate`, `norm`, `orDash`, `boolChip`, `groupBy`, `countBy`,
`fmtMoney`, `yearOf`, `matchEvent`, `sbFetch`, `rowMatchesActiveLine` são **guardadas** por
`tests/check.js` (snippets canônicos) + cópias verbatim em `tests/*.harness.js`. Elas **já são
definição única** (não estão duplicadas no app). Refatorá-las daria zero dedup e quebraria o guarda
anti-drift — **fora de escopo**.

---

## Recomendação de escopo

**Aplicar apenas o tier "alto valor, baixo risco": D1+D2, D3+D4 e D5.** Motivos:

1. **Banco intocado.** Nada aqui executa SQL/migração/grant. As queries continuam **idênticas**
   (mesmas tabelas, filtros e `limit`), apenas centralizadas. É impossível este trabalho
   destruir/paralisar/escrever no banco — coerente com o aviso "SEM BACKUP" da CLAUDE.md.
2. **Funções atuais preservadas.** Mexe só em código de **render/DOM sem testes**; as funções
   puras guardadas ficam **byte-idênticas**, então `node tests/check.js` continua verde.
3. **Telas idênticas.** Os helpers extraídos emitem o **mesmo HTML** e as **mesmas strings de
   query** — nenhuma mudança visível ao usuário.
4. **Casa com as diretrizes da CLAUDE.md** ("Simplicity First", "Surgical Changes"): D1+D3+D5
   removem duplicação real e dão um único ponto para futuros índices/escala; D6–D10 são churn
   cosmético e ficam de fora.

Se um dia for implementar, o roteiro seguro é: extrair `searchLines`/`pickLine`,
`searchEmpresas`/`empresaChooserHTML`, `distinctCods`/`fetchLinesByCods`; substituir os call-sites
um a um; rodar `node tests/check.js`; conferir visualmente cada card afetado; e só então
commit/push na `main`. **Nada disso é executado nesta tarefa — este documento é só o diagnóstico.**
