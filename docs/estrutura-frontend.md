# Estrutura e navegação do frontend (`index.html` + `styles.css` + `app.js`) — Portal DIVAT

> **Por que este arquivo existe:** o frontend tem `index.html` (HTML), `styles.css` (CSS),
> `app.js` (~2,6k linhas — extraído do HTML e ainda envolto num IIFE) e módulos em `src/`. Continua
> **zero-build**: nada de bundler, framework ou `package.json`. Este doc registra (1) *por que*
> essa forma, (2) *como navegar* no `app.js` sem se perder, e (3) as **regras de segurança** para
> reorganizar o JS sem quebrar nada. Complementa o "Mapa do código" do `CLAUDE.md` (que lista as
> seções e funções-chave). Diagnósticos anteriores de acoplamento e reúso continuam recuperáveis
> no histórico do Git, mas não substituem este mapa vigente.

## 1. Estrutura atual e modularização incremental

Até 21/07/2026 o JS era embutido no `index.html`. Foi extraído para um único `app.js` por **um**
motivo: derrubar o `'unsafe-inline'` do `script-src` da CSP — com JS inline, a CSP não segura um
XSS que escape do `esc()`; com `script-src 'self'` (estado atual do `vercel.json`), segura. O que
mudou junto, e o que continua valendo:

- **Auto-update atômico:** `checarNovaVersao` faz `HEAD` de `/version.json`. Todo deploy que muda
  HTML, CSS, JS ou módulos deve incrementar `version`; assim a lista não cresce a cada módulo.
- **Zero-build continua.** `app.js` é um ES module nativo carregado com `type="module"`; não há
  bundler nem dependências. Os seams de `src/domain/`, todos sem DOM, rede ou estado global:
  **`core.mjs`** (formatação, escaping, `norm`, `debounce`, situação da linha),
  **`agrupamento.mjs`** (agregação, ordenação e filtros de conjunto),
  **`busca.mjs`** (filtro de evento e preparação do termo de busca) e
  **`view-state.mjs`** (seam do ciclo de vida da view, modelo de abas, despacho do
  Realtime por aba e o que cada lista mostra). O corte é pela pureza, não pelo assunto:
  `termosLocalidade` é da mesma família do `localidadesQueCasam`, mas faz `await
  getLocalidades()` na linha seguinte à declaração (`grep 'async function termosLocalidade'`) —
  é I/O, e ficou.
- **Nem todo módulo é de domínio puro — e o que não é declara a dependência.** A Fase B2 do plano
  das fatias 3-4 abriu quatro que fazem markup ou guardam cache: **`src/ui/doc.mjs`** (cabeçalho,
  meta, tabela, estados de tela, `bannerTrunc`), **`src/ui/paginacao.mjs`**
  (`paginate`/`paginateTable`/`paginateEvents`), **`src/ui/listas.mjs`** (a família de listas de
  linha, com o seam de seleção) e **`src/data/lookups.mjs`** (os caches de referência).
  O que eles precisam do `app.js` **não é lido de global: é injetado**, num bootstrap único no
  topo do IIFE (`grep 'Bootstrap dos módulos'`) — `configurarDoc({logoSVG})`,
  `configurarListas({aoSelecionarLinha})`; `lookups.mjs` importa `src/data/rest.mjs` diretamente. Três consequências
  práticas: (a) o módulo é exercitável em Node puro, sem navegador, porque a dependência entra
  por parâmetro (`tests/ui-data-module.test.mjs`); (b) a dependência aparece na assinatura, em
  vez de num acesso escondido no meio do corpo; (c) **os três falham fechado** — sem configurar,
  `docHead`/`getEmpresas`/`bindLineRows` lançam, e o gate de navegador fica vermelho na hora.
  Regra ao abrir um módulo assim: o que ele **esconde** é o mecanismo (o cache, a paginação, o
  markup); o que ele **expõe** é o que outra camada precisa decidir (a invalidação do cache, a
  ação de clicar numa linha).
- **Regra para extrair:** prefira módulos profundos com interface pequena. Não mova loaders/estado
  apenas para reduzir linhas; extraia quando a dependência puder ser expressa por imports claros.
- **Extração paga o processo que ela torna desnecessário.** Os harness importam os módulos reais, de modo que os testes exercitam exatamente o código que o navegador executa. A Fase B encerrou as últimas cópias e aposentou o mecanismo `@canon`.
- **Toda extração tem três passos obrigatórios, não um:** mover a função + importar no `app.js`;
  trocar o harness para o módulo real; e **reabrir o arquivo no `.vercelignore`**.
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

- **Índice no topo do `<script>`** — logo após os `import`, um comentário lista as 14 seções na ordem.
- **Marcas de seção** (topo de nível), formato de 64 `=`:
  ```
  /* ================================================================
     TÍTULO DA SEÇÃO
     ================================================================ */
  ```
  As 14: `SUPABASE CONFIG` · `ÍCONES` · `SEÇÕES / CARDS` · `RENDER CARDS` · `STATE + CACHES` ·
  `BUSCA DE LINHAS (hero)` · `LINHA ATIVA — BANNER` · `MODAL / SISTEMA DE VIEWS` ·
  `COMPONENTES AUXILIARES` · `CLIQUE NOS CARDS` · `TOAST` · `REALTIME` ·
  `AUTO-ATUALIZAÇÃO` · `ROTAS (hash)`. Eram 15: `UTILITÁRIOS` guardava só o `debounce`, que foi
  para `src/domain/core.mjs` na Fase B2 — seção que fica vazia sai, não vira comentário órfão.
- **Sub-marcas** (dentro de uma seção), formato mais leve: `/* --- Título --- */`. Só o bloco
  `MODAL / SISTEMA DE VIEWS` tem sub-marcas, porque é ~54,4% do JS (~1,3k linhas). Ele **subiu**
  de participação na Fase B2 tendo ENCOLHIDO em linhas — ela tirou 263 do arquivo e 98 dele, e o
  denominador caiu mais que o numerador. Nas Fases C1, C2 e C3 aconteceu o inverso: C1 tirou 98
  linhas do bloco (1.844 → 1.746) e o percentual CAIU (60,4% → 58,7%); C2 tirou mais 219
  (1.746 → 1.527) e caiu de novo (58,7% → 55,2%); C3 tirou mais 186 (1.527 → 1.341) e caiu de
  novo (55,2% → 52,1%) — nas três a saída foi quase toda dele. Nos quatro casos a lição é a
  mesma — percentual de seção não mede progresso de modularização; o total mede.

### Sub-marcas do bloco `MODAL / SISTEMA DE VIEWS`

O próprio marcador do bloco traz um **sub-índice**. A ordem das sub-marcas:

`Chrome do modal` · `Faixa de abas` · `Dispatcher — runView` ·
`Busca de linha — wrappers de documento` ·
`DOC · Histórico (linha)` · `DOC · Itinerários` · `DOC · Quadro de Horários` · `DOC · Tarifas` ·
`DOC · Frota` · `DOC · Estrutura Operacional` · `DOC · Empresas` ·
`DOC · Municípios / entre-municípios` · `DOC · Portaria` · `DOC · Localidades`.

Cada bloco `DOC · X` reúne, **juntos**, tudo daquele documento **que ainda mora no `app.js`**:
helper(s) HTML (`xxxHTML`), o render (`renderX`), eventuais runners e o registro `LOADERS.x = …`.

**Desde a Fase C1, "juntos" quer dizer menos do que dizia.** Três dessas marcas — `DOC · Histórico
(linha)`, `DOC · Itinerários` e `DOC · Frota` — guardam **só** o registro `LOADERS.x`: o render
mora em `src/documentos/frota-historico-itinerarios.mjs` e o markup compartilhado, em
`src/ui/blocos.mjs`. A marca fica porque é por ela que se acha o registro, e cada uma diz, em
comentário, para onde o resto foi. A sub-marca `Eventos — helpers compartilhados` **sumiu**, junto
com o markup que a batizava. C2, C3 e C4 vão esvaziar as outras do mesmo jeito.

**NÃO dimensione uma fase pela marca — meça por SÍMBOLO.** As faixas entre marcas derivaram do
código, e três registros moram sob a marca de outra família (medido em 21/08/2026): além do
`LOADERS.empresasRegulares` documentado no §6, `LOADERS.municipioRegiao` mora sob `DOC · Empresas`,
e `ligacoesPorTerminal`/`secoesPorLigacao`/`frotaPorEmpresa` moram sob `DOC · Municípios`. O
arquivo também usa **dois** estilos de sub-marca (`/* --- X --- */` e `/* ---- X ---- */`), então
um extrator que só case o primeiro reparte errado. Quem mover essas famílias conserta as suas
marcas — a C1 consertou as três dela.

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

Listas longas são quebradas em **páginas de 25 itens** para não exigir rolagem infinita. Desde a
Fase B2 a paginação **não mora mais no `app.js`**: o núcleo agnóstico de conteúdo está em
[`src/ui/paginacao.mjs`](../src/ui/paginacao.mjs) e a família de listas de LINHA em
[`src/ui/listas.mjs`](../src/ui/listas.mjs). Ela é **apenas visual** — os dados e o PDF nunca são
cortados.

### As funções (grep pela marca / nome)

- **`pageBounds(total, pageSize, page)`** — matemática **pura** (clampa a página, devolve
  `{page,totalPages,start,end}`). Mora em `src/domain/view-state.mjs` desde a Sessão 4 (era cópia
  no harness); casos em `tests/pure.test.js`. É o único pedaço testável; o resto é DOM.
- **`paginate(container, total, renderSlice, {pageSize=25, afterPaint, unit})`**
  (`src/ui/paginacao.mjs`) — **núcleo** por fatia, agnóstico de conteúdo. Renderiza **só a fatia atual** num `.pg-slot` + uma barra
  `.doc-pager` (‹ Anterior · `.pg-info` "Página X de Y · N `unit`" · "ir p/ Nº" · Próxima ›).
  Sem barra quando `total <= pageSize`. `afterPaint(slot)` religa cliques a cada página.
- **`paginateTable(container, items, {cols, rowHTML, foot, bind, unit, pdf=true})`**
  (`src/ui/paginacao.mjs`) — tabelas homogêneas via `tableHTML`. **`rowHTML(item, i)` recebe o índice GLOBAL** (`i` = posição na
  lista inteira) → `data-idx` continua batendo com a lista completa mesmo paginado (crítico para
  Portarias, cujo clique abre `rows[+idx]`). `foot(total)` monta o rodapé com o **total**.
- **`paginateLines(container, rows, {grouped, pdf=true})`** (`src/ui/listas.mjs`) — listas de
  **linha**. `grouped` insere os cabeçalhos de empresa **dentro** de cada página (contagem = total
  do grupo). Usado por `lineResults`, o hub das listagens de linha — hoje **8 call sites**, todos
  em documentos que as Fases C3/C4 vão mover. Ele fica no módulo (e não no `app.js`) porque a
  única coisa que o prendia lá era o CLIQUE na linha, que agora entra pelo seam
  `configurarListas({aoSelecionarLinha})`.
- **`paginateEvents`** (`src/ui/paginacao.mjs`) — o paginador **antigo e diferente**: **um evento
  por página** (não N itens), com filtros próprios. Só o Histórico usa; o markup do evento
  (`evBandHTML`/`evBlocksHTML`) morou para `src/ui/blocos.mjs` na Fase C1 — o bloco
  `Eventos — helpers compartilhados` do MODAL deixou de existir.

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
`paginateTable` (`src/ui/paginacao.mjs`) e `paginateLines` (`src/ui/listas.mjs`) **definem
`currentView.pdfHTML` com a lista COMPLETA**
(`renderSlice(0,total)` + `docHead`). Quem já expõe um PDF próprio mais rico passa **`pdf:false`**
para não ser sobrescrito — são **4 documentos**: **Quadro "por empresa"** (PDF = todos os quadros),
**Município** (PDF determinístico = lista completa + meta/aviso; dois call sites, um por ramo do
`scope`), **Frota por Empresa** (PDF = a lista filtrada, escrita pelo `commitViewResult` logo
abaixo) e o **bloco secundário do Localidade** (o PDF de lá cobre os DOIS blocos, e deixar o
`paginateLines` escrever o dele o sobrescreveria com só a lista secundária).
**Ao criar uma tela nova que pagina uma tabela,**
use estes helpers (o `pdf` cuida da completude) — não monte `tableHTML` cru sem paginar, nem
dependa do fallback do `.doc` visível.

## 5. Contexto explícito (`ctx`) — o que todo `render*`/loader recebe

Desde 21/08/2026 (Fase A do plano de modularização) **nenhum documento lê `currentView`,
`activeLine` ou `modalBody`.** Cada `render*`/loader **recebe**:

```js
ctx = { view, gen, pane, host, line }
```

| campo | o que é | por que não pode ser lido do global |
|---|---|---|
| `view` | a view dona da tentativa | depois de um `await`, `currentView` já pode ser a de OUTRA aba |
| `gen` | a geração desta tentativa (`beginGen`) | é o que descarta a resposta atrasada |
| `pane` | o `.modal-body` da aba que pediu | `modalBody` aponta para a aba que está na tela AGORA |
| `host` | o container dentro do pane (`#spHost`, `#pHost`, `#locHost`…) | — |
| `line` | a linha DESTA tentativa | `activeLine` muda com troca de aba e com a própria busca |

**Quem monta um ctx é o shell, em três pontos e só neles** — todos via `novoCtx(view, pane, host)`
(`app.js`, seção `MODAL / SISTEMA DE VIEWS`), que é o único lugar que ainda lê `activeLine` para
esse fim:

1. `runView` — abrir ou trocar de documento;
2. `reloadTab` — recarregamento ao vivo do Realtime. **São DUAS invocações de loader, não uma.**
   Mudar só a primeira faz o card abrir certo e o recarregamento passar `undefined` — falha que só
   aparece com o portal aberto e o banco mudando;
3. o `run()` de cada painel de busca (`searchPanel`, e os `run` próprios de Portarias e
   Localidades). Cada busca é uma tentativa nova: geração nova + a linha ativa daquele instante.

**Derivar, nunca cunhar geração à mão.** Três derivações, em `src/domain/view-state.mjs`:

- `withLine(ctx, linha)` — a linha que a busca ACABOU de resolver, **preservando `view` e `gen`**.
  A linha certa só existe depois do `await` (1 resultado, ou o clique na lista de N). Derivar com
  geração nova aqui devolveria a corrida que o seam existe para impedir: a busca velha voltaria a
  poder escrever por cima da nova.
- `withHost(ctx, el)` — mesma tentativa, outro container.
- `nextGen(ctx)` — o usuário disparou algo DE NOVO dentro do documento já aberto (trocar o escopo
  do Município, refiltrar as Portarias) e o novo `await` pode ser ultrapassado pelo clique seguinte.

**O que continua sendo global, e de propósito:** `activeLine` e `currentView` têm mais de um
escritor legítimo e eles ficam — o wiring de abas (`activateTab`) e as limpezas (`closeModal`,
`applyRoute`) seguem escrevendo os dois. O que acabou foi um **documento** os LER.

**Duas exceções documentadas:**

- `_panelRun` fica fora do seam: é a referência ao `run` do painel, não resultado de operação
  assíncrona. Mas a **casca** de um painel pode escrever depois de um `await` — é o caso de
  Portarias, que faz `await getPortariaAnos()` antes de pintar. Ali o que protege é um
  `if (!isCurrentGen(view, gen)) return;` explícito, e **ele tem de ser preservado**: sem ele uma
  tentativa velha religa o runner depois de uma troca de aba.
- `setBody` continua escrevendo no `modalBody` ao vivo. Seu único chamador é o `runView`, que
  acabou de ativar a aba — não há `await` no meio. Quem escreve depois de um `await` usa `ctx.pane`.

**Como isso é guardado:** `scripts/check_corrida_abas.mjs`. É o único gate do repo que **cria** a
ordenação do bug — o stub do PostgREST segura a resposta (`segurar`, em `scripts/lib/rig.mjs`) até
a troca de aba ter acontecido. Ele afirma, em dois atos (um render de documento e a casca de um
loader): (a) o pane da aba 2 não foi pintado pelo trabalho atrasado da aba 1; (b) o `pdfHTML` da
aba 2 não foi sobrescrito; (c) o pane **da aba 1** e o `pdfHTML` **dela** receberam a resposta
atrasada. A (c) não é decoração: sem ela, uma implementação que descartasse toda resposta
pós-troca-de-aba passaria em (a) e (b).

**A Fase C1 endureceu a (c) do ATO 1, e a razão vale como aviso geral sobre asserção de PDF.** Ela
afirmava só que o PDF da aba 1 continha o TÍTULO do documento e uma linha da tabela — e nenhuma das
duas coisas distingue o `pdfHTML` committado do **fallback** do `baixarPdf` (`app.js`, seção
`MODAL`), que clona o `.doc` vivo quando `pdfHTML` é `null`. O `searchPanel` também chama
`docHead(title)`, então o título aparece nos dois caminhos; e um documento sem paginação de tela
tem a tabela inteira no DOM, então as linhas também. Medido mutando o `commitViewResult` do
`renderItinerarios` para fora: a asserção continuava **verde**. O que só o `pdfHTML` tem é a
AUSÊNCIA do campo de busca (`id="spInput"`) — o PDF é o documento, não o painel em volta dele —, e
é isso que a asserção passou a exigir. Ao escrever asserção sobre PDF, pergunte sempre o que dela
**não** sobreviveria ao fallback.

**O que a Fase C1 provou sobre o contrato, de brinde:** um documento que virou módulo em
`src/documentos/` não tem mais como cometer o erro clássico — `currentView`, `activeLine` e
`modalBody` **não estão no escopo dele**. O compilador passou a garantir o que antes era
disciplina. O que a bancada ainda precisa provar, e prova, é que o ctx **chega** correto através
da fronteira do módulo: o ATO 1 usa justamente o documento de Itinerários, que a C1 moveu.

## 6. Histórico da organização

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
    com a rede. (Desde a Fase B2 o `bannerTrunc` não está mais aí: ele é markup e foi para
    `src/ui/doc.mjs`; o `marcarTrunc`, que põe a marca que ele lê, ficou.)
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
