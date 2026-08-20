# Estrutura e navegação do frontend (`index.html` + `styles.css` + `app.js`) — Portal DIVAT

> **Por que este arquivo existe:** o frontend tem `index.html` (HTML), `styles.css` (CSS),
> `app.js` (~3,3k linhas — extraído do HTML e ainda envolto num IIFE) e módulos puros em `src/`. Continua
> **zero-build**: nada de bundler, framework ou `package.json`. Este doc registra (1) *por que*
> essa forma, (2) *como navegar* no `app.js` sem se perder, e (3) as **regras de segurança** para
> reorganizar o JS sem quebrar nada. Complementa o "Mapa do código" do `CLAUDE.md` (que lista as
> seções e funções-chave). Os relatórios [`docs/historico/analise-separacao.md`](historico/analise-separacao.md)
> e [`docs/historico/analise-duplicacao.md`](historico/analise-duplicacao.md) são diagnósticos de
> acoplamento/reuso, **não** guias de navegação — e são **pré-split**: descrevem o frontend quando
> era um único `index.html`, então as citações `index.html:NNN` deles não se traduzem para o
> `app.js` atual.

## 1. Estrutura atual e modularização incremental

Até 21/07/2026 o JS era embutido no `index.html`. Foi extraído para um único `app.js` por **um**
motivo: derrubar o `'unsafe-inline'` do `script-src` da CSP — com JS inline, a CSP não segura um
XSS que escape do `esc()`; com `script-src 'self'` (estado atual do `vercel.json`), segura. O que
mudou junto, e o que continua valendo:

- **Auto-update atômico:** `checarNovaVersao` faz `HEAD` de `/version.json`. Todo deploy que muda
  HTML, CSS, JS ou módulos deve incrementar `version`; assim a lista não cresce a cada módulo.
- **Zero-build continua.** `app.js` é um ES module nativo carregado com `type="module"`; não há
  bundler nem dependências. Os seams abertos até aqui, todos sem DOM, rede ou estado global:
  **`src/domain/core.mjs`** (formatação, escaping, `norm`, situação da linha),
  **`src/domain/agrupamento.mjs`** (agregação, ordenação e filtros de conjunto),
  **`src/domain/busca.mjs`** (filtro de evento e preparação do termo de busca) e
  **`src/domain/view-state.mjs`** (seam do ciclo de vida da view, modelo de abas, despacho do
  Realtime por aba e o que cada lista mostra). O corte é pela pureza, não pelo assunto:
  `termosLocalidade` (`app.js:2465`) é da mesma família do
  `localidadesQueCasam`, mas faz `await getLocalidades()` em `app.js:2466` — é I/O, e ficou.
- **Regra para extrair:** prefira módulos profundos com interface pequena. Não mova loaders/estado
  apenas para reduzir linhas; extraia quando a dependência puder ser expressa por imports claros.
- **Extração paga o processo que ela torna desnecessário.** Enquanto a função mora no `app.js`, o
  teste unitário roda sobre uma **cópia** em `tests/*.harness.js`, e essa cópia precisa da guarda
  `@canon` para não divergir do original. Extraída, o harness importa o módulo real: cópia e guarda
  são **apagadas** no mesmo commit — o teste passa a exercitar exatamente o código que o navegador
  executa. Quando o último `@canon` sair, `tests/canon.js` e `tests/drift.test.js` se aposentam.
  O `pure.harness.js` chegou lá na Sessão 4 (zero cópias); as 12 que faltam estão no `harness.js`
  e dependem da Fase B (`src/data/rest.mjs`).
- **Toda extração tem três passos obrigatórios, não um:** mover a função + importar no `app.js`;
  apagar o `@canon` e trocar por `require` no harness; e **reabrir o arquivo no `.vercelignore`**.
  Pular o terceiro derruba o portal inteiro (import ES é atômico — ver §`.vercelignore` no
  `CLAUDE.md`); o `check.js` §[1] reprova nomeando o arquivo que ficou de fora.
- **CSS em `styles.css`** (extraído do `<style>` em 22/07/2026): cacheável separado do HTML e
  editável com tooling. Desde **27/07/2026** o `style-src` é `'self'` com **`style-src-attr
  'none'`** — **nenhum `unsafe-inline`** (achado SEC-08). Os 10 atributos `style=` que restavam
  saíram: os 4 de accent eram sempre a MESMA constante e viraram `--accent`/`--accent-soft`
  estáticos no `:root`; as larguras de `<th>` viraram classes `.w-*` (conjunto fechado, porque
  `c.w` é sempre constante do código); e os 3 `display:none` do `index.html` viraram `.is-hidden`,
  o que obrigou os 8 sites de `.style.display` a virarem `classList`.
  **Regra:** estilo novo é **classe no `styles.css`**. Atributo `style=` em markup é ignorado pelo
  navegador **em silêncio** — o sintoma é a regra simplesmente não acontecer. Só o ATRIBUTO é
  proibido: `el.style.x = …` e `setProperty` continuam válidos e são o caminho para o que é
  genuinamente dinâmico (o dropdown se posiciona assim, com `getBoundingClientRect`).
  Guardas: `tests/check.js` §[1] (offline, cobre `index.html` e os templates do `app.js`, e ainda
  exige classe `.w-*` para toda largura declarada) e a regra Semgrep `divat-style-attr-quebra-csp`.
  Os gates de navegador (`check_views.mjs`/`check_abas.mjs`) passaram a servir **a CSP de
  produção, lida do `vercel.json`** — antes rodavam sem cabeçalho nenhum, num mundo mais
  permissivo que o real, e uma regressão de CSP passaria verde.
- **IIFE**: após os imports, o `app.js` roda dentro de `(() => { … })();` — nada vaza para `window`
  (o vendor `supabase-js` continua global e é lido normalmente). O escopo interno é único, então
  as regras de hoisting/TDZ da seção 3 continuam valendo sem mudança.
- **supabase-js é injetado dinamicamente** pelo `app.js` (seção `REALTIME`) — script dinâmico é
  async, não bloqueia a primeira pintura. Não há mais `<script>` dele no `index.html`; ao
  atualizar a versão vendorada, troque o `s.src` no `initRealtime`.
- **Rotas por hash** (seção `ROTAS (hash)`, fim do `app.js`): `#/linha/<codlinha>`,
  `#/consulta/<view>` e a combinação — deep link compartilhável, e o Voltar do navegador fecha o
  modal (a abertura cria UMA entrada de histórico; trocas de view usam `replaceState`).
- **Guarda no gate:** `tests/check.js` **falha** se aparecer `<script>` inline no `index.html` —
  a CSP bloquearia no navegador; todo JS novo vai no `app.js`.

A real dor — "achar as coisas" — continua resolvida com **organização interna** (seções 2 e 3
abaixo), que agora vivem no `app.js`.

## 2. Como navegar — índice, marcas e sub-marcas (navegue por `grep`)

Números de linha **deslocam** a cada edição; **marcas de comentário não**. A regra de ouro é sempre
achar por `grep` do texto da marca, nunca por linha.

- **Índice no topo do `<script>`** — logo após `<script>`, um comentário lista as 15 seções na ordem.
- **Marcas de seção** (topo de nível), formato de 64 `=`:
  ```
  /* ================================================================
     TÍTULO DA SEÇÃO
     ================================================================ */
  ```
  As 15: `SUPABASE CONFIG` · `ÍCONES` · `SEÇÕES / CARDS` · `RENDER CARDS` · `STATE + CACHES` ·
  `BUSCA DE LINHAS (hero)` · `LINHA ATIVA — BANNER` · `MODAL / SISTEMA DE VIEWS` ·
  `COMPONENTES AUXILIARES` · `CLIQUE NOS CARDS` · `UTILITÁRIOS` · `TOAST` · `REALTIME` ·
  `AUTO-ATUALIZAÇÃO` · `ROTAS (hash)`.
- **Sub-marcas** (dentro de uma seção), formato mais leve: `/* --- Título --- */`. Só o bloco
  `MODAL / SISTEMA DE VIEWS` tem sub-marcas, porque é ~58,5% do JS (~1,9k linhas, ~90 funções).

### Sub-marcas do bloco `MODAL / SISTEMA DE VIEWS`

O próprio marcador do bloco traz um **sub-índice**. A ordem das sub-marcas:

`Chrome do modal` · `Dispatcher — runView` · `Helpers de documento e busca de linha` ·
`Eventos — helpers compartilhados` · `DOC · Histórico (linha)` ·
`DOC · Itinerários` · `DOC · Quadro de Horários` · `DOC · Tarifas` · `DOC · Frota` ·
`DOC · Estrutura Operacional` · `DOC · Empresas` · `DOC · Municípios / entre-municípios` ·
`DOC · Portaria` · `DOC · Localidades`.

Cada bloco `DOC · X` reúne, **juntos**, tudo daquele documento: helper(s) HTML (`xxxHTML`), o
render (`renderX`), eventuais runners e o registro `LOADERS.x = …`.

## 3. Regras de segurança ao reorganizar o JS (leia antes de mover código)

O JS é um único escopo de topo. Mover código é seguro **se** você respeitar como o JavaScript
resolve nomes no load:

1. **`function foo(){}` é *hoisted*** → declarações de função podem ser reordenadas livremente entre
   si e em relação a quem as chama em runtime. Mover é seguro.
2. **`const` / `let` **não** é hoisted (TDZ)** → só há risco se **código executado no load** (fora de
   corpo de função) ler a variável **antes** da sua declaração. Na prática, quase toda leitura no
   bloco MODAL é **lazy** (dentro de funções/arrows, roda em tempo de chamada), então a ordem textual
   não importa para elas.
3. **`LOADERS.x = …` são statements executados no load** → precisam rodar **depois** de
   `const LOADERS = {}` (seção `Helpers de documento`). Nunca mova um `LOADERS.x` para antes dessa
   declaração. A ordem entre os `LOADERS.x` é irrelevante.
4. `runView` faz `LOADERS[view]()` e os loaders chamam os `render*` em runtime → ordem textual não
   importa para eles.

**Referência "para frente" esperada e correta:** `renderEmpresaQuadros` (bloco Quadro) chama
`secoesTarifasHTML` (bloco Tarifas, definido depois). É seguro porque `secoesTarifasHTML` é
`function` (hoisted). **Não "corrija" isso.**

### Como verificar uma reorganização (o `check.js` sozinho **não basta**)

`node tests/check.js` só **compila** o `<script>` — não executa a página, então **não pega** erro de
ordem/TDZ em runtime. Ao mover código, use as 3 camadas:

1. **`node tests/check.js`** — sintaxe + guarda anti-drift + testes unitários.
2. **Invariante de permutação pura** — se a mudança é só reordenação, o **conjunto de linhas de
   código** (ignorando comentários e linhas em branco) tem de ser **byte-idêntico** antes e depois.
   Extraia, ordene e faça `diff`. Prova que nada foi adicionado/removido/alterado.
3. **Smoke test no Chromium** (binário pré-instalado em `/opt/pw-browsers/chromium`) — carregue
   `file://…/index.html` com `--headless=new --enable-logging=stderr --v=1` e compare os erros de
   `CONSOLE` do arquivo **antes** e **depois**. Erros ambientais (CDN/Supabase bloqueados na rede do
   agente) aparecem iguais nos dois; um bug de ordem/TDZ introduz um `ReferenceError` /
   `before initialization` **novo**. Se o navegador não subir, apoie-se nas camadas 1–2 e diga que a
   camada 3 não rodou — não afirme verificação de runtime que não aconteceu.

## 4. Paginação (só de tela) e completude do PDF

Listas longas são quebradas em **páginas de 25 itens** para não exigir rolagem infinita. Toda a
paginação vive na seção `COMPONENTES AUXILIARES` (exceto `paginateEvents`, que é do MODAL) e é
**apenas visual** — os dados e o PDF nunca são cortados.

### As funções (grep pela marca / nome)

- **`pageBounds(total, pageSize, page)`** — matemática **pura** (clampa a página, devolve
  `{page,totalPages,start,end}`). Mora em `src/domain/view-state.mjs` desde a Sessão 4 (era cópia
  no harness); casos em `tests/pure.test.js`. É o único pedaço testável; o resto é DOM.
- **`paginate(container, total, renderSlice, {pageSize=25, afterPaint, unit})`** — **núcleo** por
  fatia, agnóstico de conteúdo. Renderiza **só a fatia atual** num `.pg-slot` + uma barra
  `.doc-pager` (‹ Anterior · `.pg-info` "Página X de Y · N `unit`" · "ir p/ Nº" · Próxima ›).
  Sem barra quando `total <= pageSize`. `afterPaint(slot)` religa cliques a cada página.
- **`paginateTable(container, items, {cols, rowHTML, foot, bind, unit, pdf=true})`** — tabelas
  homogêneas via `tableHTML`. **`rowHTML(item, i)` recebe o índice GLOBAL** (`i` = posição na
  lista inteira) → `data-idx` continua batendo com a lista completa mesmo paginado (crítico para
  Portarias, cujo clique abre `rows[+idx]`). `foot(total)` monta o rodapé com o **total**.
- **`paginateLines(container, rows, {grouped, pdf=true})`** — listas de **linha**. `grouped`
  insere os cabeçalhos de empresa **dentro** de cada página (contagem = total do grupo). Usado por
  `lineResults` (o hub de ~10 cards de listagem de linha).
- **`paginateEvents`** (bloco `Eventos — helpers compartilhados`, no MODAL) — o paginador **antigo
  e diferente**: **um evento por página** (não N itens), com filtros próprios. Só o Histórico usa.

### O que é paginado e o que NÃO é

- **Paginado (tela):** listas de linha (via `lineResults`), **Portarias**, **Seções por Empresa**,
  **Empresas Regulares**, **Quadro "por empresa"** (`renderEmpresaQuadros`, com `pdf:false`),
  **Frota por Empresa** (com `pdf:false`) e **Localidade** (`renderLocalidadeSecoes`: o bloco
  agrupado por `paginate` + `locComSecaoHTML`, o bloco secundário por `paginateLines` com
  `pdf:false`).
- **NÃO paginado — documento de 1 linha (leitura corrida + alimenta o PDF inteiro):**
  Itinerários, Quadro de Horários (modo linha), Tarifas, Frota, Estrutura,
  Seções por Ligação.
- **Deixado para depois:** `munTable` (lista de municípios de uma região, ≤~92, pick-list curto).

### Regra de ouro do PDF: sai SEMPRE a lista inteira

`baixarPdf` monta o documento de `currentView.pdfHTML()`. **Quando `pdfHTML` é `null`, ele faz
fallback clonando o `.doc` visível** — que, com paginação, teria só a página atual. Por isso
`paginateTable` e `paginateLines` **definem `currentView.pdfHTML` com a lista COMPLETA**
(`renderSlice(0,total)` + `docHead`). Quem já expõe um PDF próprio mais rico passa **`pdf:false`**
para não ser sobrescrito — são **4 documentos**: **Quadro "por empresa"** (PDF = todos os quadros),
**Município** (PDF determinístico = lista completa + meta/aviso; dois call sites, um por ramo do
`scope`), **Frota por Empresa** (PDF = a lista filtrada, escrita pelo `commitViewResult` logo
abaixo) e o **bloco secundário do Localidade** (o PDF de lá cobre os DOIS blocos, e deixar o
`paginateLines` escrever o dele o sobrescreveria com só a lista secundária).
**Ao criar uma tela nova que pagina uma tabela,**
use estes helpers (o `pdf` cuida da completude) — não monte `tableHTML` cru sem paginar, nem
dependa do fallback do `.doc` visível.

## 5. Histórico da organização

- **Parte A (2026-07-16):** adicionado o índice no topo, o sub-índice do MODAL e as sub-marcas —
  **sem mover código** (mudança puramente aditiva de comentários). Deu navegação por `grep`.
- **Parte B (2026-07-17):** desembaralhada a região de documentos do MODAL (o miolo que misturava
  builders e renders de tarifa/itinerário/quadro/frota/estrutura) em 5 blocos contíguos por
  documento — **permutação pura**, verificada pelas 3 camadas acima. Escopo restrito de propósito: o
  resto do bloco já estava agrupado; não foi tocado.

> **Fora de escopo, anotado para o futuro:** o marcador `DOC · Empresas` fica logo antes de
> `openEmpresaLigacoes`, mas a seção de Empresas na verdade começa um pouco antes, em
> `LOADERS.empresasRegulares` — imperfeição cosmética pré-existente, não corrigida para manter as
> mudanças mínimas.

- **Parte C (2026-07-18):** adicionada a **paginação de tela** (seção 4). Em três rodadas:
  (1) `pageBounds`/`paginateLines` + `lineResults` para as listas de linha (25/página, agrupado
  contando todas as linhas); (2) núcleo genérico `paginate`/`paginateTable` e aplicação a Portarias,
  Seções por Empresa, Empresas Regulares e Quadro "por empresa" (com o refactor
  do `paginateLines` para usar o núcleo); (3) correção de completude do PDF — os wrappers passaram a
  definir `currentView.pdfHTML` com a lista inteira (`pdf:false` p/ Quadro-por-empresa e Município),
  fechando a regressão em que o fallback do `.doc` visível exportaria só a página atual. Verificado
  com `node tests/check.js` + smoke tests no Chromium (dados falsos, sem rede): navegação, índice
  global do clique (Portarias) e `pdfHTML()` com a lista completa.
- **Parte D (2026-07-23):** submarcado o limite **infra × domínio** dentro da seção `SUPABASE
  CONFIG` — mudança **puramente aditiva de comentários**, sem mover código. Motivação: adaptar o
  que dá para aproveitar da Clean Architecture (github.com/jasontaylordev/CleanArchitecture) num
  projeto zero-build/arquivo-único, onde não cabe a separação literal em camadas/pastas
  (Domain/Application/Infrastructure) — o valor do padrão aqui é só a **fronteira de
  dependência**: domínio (regras puras) não deve depender de infraestrutura (I/O), e infra não deve
  saber de regra de negócio. Duas submarcas novas:
  - `/* --- Infraestrutura de acesso a dado (Supabase/fetch) --- */`: `SB_URL`/`SB_KEY`,
    `fetchComTimeout`, `sbFetch`, `marcarTrunc`, `bannerTrunc` — único trecho do arquivo que fala
    com a rede.
  - `/* --- Regras de domínio e formatação (funções puras) --- */`: `fmtCode`/`fmtTime`/`fmtDate`,
    `esc`/`enc`/`ilikeTerm`/`orDash`/`fmtLineName`/`boolChip`, e sobretudo `situacaoHTML`,
    `isLinhaAtiva` e `isVigente` — a **regra de negócio central** do portal (o que conta como
    linha ativa/vigente). Essas funções só recebem e devolvem dado; não tocam rede nem DOM, por
    isso já tinham cópia verbatim testável em `tests/*.harness.js` mesmo antes desta parte.
  `norm` (seção `STATE + CACHES`) ganhou o mesmo comentário — é pura, mas fica perto de quem a usa
  primeiro (busca de empresas) em vez de subir para a submarca de domínio, para não misturar
  reorganização de comentário com deslocamento de código nesta rodada. **Não criar `js/domain/` ou
  qualquer pasta**: continua valendo a regra da seção 1 (zero-build, um arquivo só). Verificado com
  `node tests/check.js` (mudança é comentário puro, sem risco de TDZ/hoisting).
