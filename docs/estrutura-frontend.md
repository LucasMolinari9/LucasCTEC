# Estrutura e navegação do `index.html` — Portal DIVAT

> **Por que este arquivo existe:** o frontend é **um único `index.html`** (HTML + CSS + JS
> embutidos, ~3,1k linhas). Isso é uma escolha **deliberada** — não um acidente por resolver. Este
> doc registra (1) *por que* é arquivo único, (2) *como navegar* dentro dele sem se perder, e (3) as
> **regras de segurança** para reorganizar o JS sem quebrar nada. Complementa o "Mapa do código" do
> `CLAUDE.md` (que lista as seções e funções-chave) e os relatórios `analise-separacao.md` /
> `analise-duplicacao.md` (que são diagnósticos de acoplamento/reuso, não guias de navegação).

## 1. Por que arquivo único (e por que **não** quebrar em `css/` + `js/`)

A tentação natural é dividir num diretório `css/` + `js/` por "separação de responsabilidades". Para
**este** projeto, isso custa mais do que entrega. Motivos concretos:

- **Auto-update por ETag.** `checarNovaVersao` (seção `AUTO-ATUALIZAÇÃO`) faz `HEAD /index.html` e
  compara o **ETag**; quando muda, o navegador recarrega sozinho para todos os usuários. Com o código
  em `js/*.js`, mudar um módulo **não muda o ETag do `index.html`** → a atualização automática
  quebra. Separar exigiria **reprojetar** a detecção de versão (manifest com hash, cache-busting).
- **Zero-build, uma requisição.** Não há bundler, framework nem `package.json`. Servir um arquivo
  estático é uma requisição. `js/*.js` sem build vira N requisições / cadeia de `import`.
- **Testabilidade** *seria* o único ganho estrutural real (importar módulos em vez das cópias
  verbatim `tests/*.harness.js`) — mas isso é o argumento para o dia em que houver essa necessidade,
  não hoje.

**Conclusão adotada:** manter arquivo único e resolver a real dor — "achar as coisas" — com
**organização interna** (seções 2 e 3 abaixo). O `connect-src` da CSP (`vercel.json`) e a hospedagem
Vercel assumem esse arquivo único.

## 2. Como navegar — índice, marcas e sub-marcas (navegue por `grep`)

Números de linha **deslocam** a cada edição; **marcas de comentário não**. A regra de ouro é sempre
achar por `grep` do texto da marca, nunca por linha.

- **Índice no topo do `<script>`** — logo após `<script>`, um comentário lista as 14 seções na ordem.
- **Marcas de seção** (topo de nível), formato de 64 `=`:
  ```
  /* ================================================================
     TÍTULO DA SEÇÃO
     ================================================================ */
  ```
  As 14: `SUPABASE CONFIG` · `ÍCONES` · `SEÇÕES / CARDS` · `RENDER CARDS` · `STATE + CACHES` ·
  `BUSCA DE LINHAS (hero)` · `LINHA ATIVA — BANNER` · `MODAL / SISTEMA DE VIEWS` ·
  `COMPONENTES AUXILIARES` · `CLIQUE NOS CARDS` · `UTILITÁRIOS` · `TOAST` · `REALTIME` ·
  `AUTO-ATUALIZAÇÃO`.
- **Sub-marcas** (dentro de uma seção), formato mais leve: `/* --- Título --- */`. Só o bloco
  `MODAL / SISTEMA DE VIEWS` tem sub-marcas, porque é ~57% do JS (~1,7k linhas, ~60 funções).

### Sub-marcas do bloco `MODAL / SISTEMA DE VIEWS`

O próprio marcador do bloco traz um **sub-índice**. A ordem das sub-marcas:

`Chrome do modal` · `Dispatcher — runView` · `Helpers de documento e busca de linha` ·
`DOC · Folha de Rosto` · `Eventos — helpers compartilhados` · `DOC · Histórico (linha)` ·
`DOC · Itinerários` · `DOC · Quadro de Horários` · `DOC · Tarifas` · `DOC · Frota` ·
`DOC · Estrutura Operacional` · `DOC · Empresas` · `DOC · Municípios / entre-municípios` ·
`Relatórios` · `DOC · Portaria` · `DOC · Localidades`.

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
  `{page,totalPages,start,end}`). Tem cópia verbatim em `tests/pure.harness.js` + casos em
  `tests/pure.test.js`. É o único pedaço testável; o resto é DOM.
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
  **Pesquisa de Evento**, **Empresas Regulares**, **Quadro "por empresa"** (`renderEmpresaQuadros`).
- **NÃO paginado — documento de 1 linha (leitura corrida + alimenta o PDF inteiro):** Folha de
  Rosto, Folha Divisória, Itinerários, Quadro de Horários (modo linha), Tarifas, Frota, Estrutura,
  Seções por Ligação.
- **NÃO paginado — relatório agregado (lido/impresso inteiro):** Relatórios Gerenciais, Frota por
  Empresa.
- **Deixado para depois:** `munTable` (lista de municípios de uma região, ≤~92, pick-list curto) e
  `localidades`/`renderLocalidadeSecoes` (estrutura **compósita** agrupada com sub-tabelas — paginar
  exigiria achatar como o `grouped` das linhas).

### Regra de ouro do PDF: sai SEMPRE a lista inteira

`baixarPdf` monta o documento de `currentView.pdfHTML()`. **Quando `pdfHTML` é `null`, ele faz
fallback clonando o `.doc` visível** — que, com paginação, teria só a página atual. Por isso
`paginateTable` e `paginateLines` **definem `currentView.pdfHTML` com a lista COMPLETA**
(`renderSlice(0,total)` + `docHead`). Quem já expõe um PDF próprio mais rico passa **`pdf:false`**
para não ser sobrescrito: **Quadro "por empresa"** (PDF = todos os quadros) e **Município** (PDF
determinístico = lista completa + meta/aviso). **Ao criar uma tela nova que pagina uma tabela,**
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
  Seções por Empresa, Pesquisa de Evento, Empresas Regulares e Quadro "por empresa" (com o refactor
  do `paginateLines` para usar o núcleo); (3) correção de completude do PDF — os wrappers passaram a
  definir `currentView.pdfHTML` com a lista inteira (`pdf:false` p/ Quadro-por-empresa e Município),
  fechando a regressão em que o fallback do `.doc` visível exportaria só a página atual. Verificado
  com `node tests/check.js` + smoke tests no Chromium (dados falsos, sem rede): navegação, índice
  global do clique (Portarias) e `pdfHTML()` com a lista completa.
