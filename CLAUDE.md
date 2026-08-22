# CLAUDE.md — Portal DIVAT (Cadastro de Linhas Regulares)

Contexto para qualquer sessão futura do Claude trabalhar neste projeto. Este arquivo descreve o
**estado atual + regras**; a cronologia de como se chegou aqui está em **`docs/CHANGELOG.md`**.

> **TRABALHO EM CURSO:** o plano vivo de modularização está em
> [`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`](docs/planos/2026-08-14-modularizacao-fatias-3-4.md).
> As fases B, C1–C4 e D foram concluídas. A avaliação global encerrou a extração: a Fase E não foi
> aberta porque o restante é wiring de shell e não há redução mensurável de acoplamento. O plano de
> [`hardening moderado`](docs/planos/fase-3-hardening-moderado.md) registra separadamente as
> condições externas ainda necessárias antes de qualquer promoção para produção.
>
> **O dono opera pelo CELULAR:** "rode `node …` na sua máquina" não é instrução executável para ele
> — o caminho é a aba Actions ou o painel do Supabase, no navegador (o **app** do GitHub não mostra
> o botão *Run workflow*; só o site). Ao fechar esses passos, atualize este ponteiro ou remova-o.

## O que é
Portal **público de consulta (somente leitura)** do DETRO/RJ · DIVAT. Os usuários buscam linhas
de ônibus e abrem documentos (itinerários, quadro de horários, tarifas, frota, histórico/eventos,
empresas, relatórios). Os dados são **alimentados pelo dono direto no Supabase**; o site apenas
exibe e **atualiza ao vivo** (Realtime).

## Arquitetura (importante)
- **Frontend = `index.html` (HTML) + `styles.css` (todo o CSS) + `app.js` (shell principal, ~1,7k
  linhas, num IIFE)** — zero-build: sem framework, sem `package.json`, `<script src>` clássico no
  fim do `<body>`. Todo JS novo vai no `app.js` (o `tests/check.js` **falha** se aparecer
  `<script>` inline no `index.html` — a CSP publica `script-src 'self'` e bloquearia) e todo CSS
  novo vai em **classe no `styles.css`** (não em `style=""` no template). Há **rotas por hash**
  (`#/linha/<cod>`, `#/consulta/<view>`) — deep link e Voltar do navegador fecham o modal.
  Racional e regras de navegação: **`docs/estrutura-frontend.md`**.
- **A lógica PURA vai saindo do `app.js` para `src/domain/*.mjs`**, um módulo por sessão. Hoje são
  quatro: **`core.mjs`** (formatação, escaping, `norm`, `debounce`, e as regras de situação
  `isLinhaAtiva`/`isVigente`), **`agrupamento.mjs`** (`groupBy`/`countBy`/`fmtMoney`, as ordenações `byCodlinha`/
  `rjOrder`, o desempate `scoreEmpresa`/`dedupEmpresasPorRJ`, os recortes por município
  `classifyMunLines`/`terminaisDoMunicipio` e a frota `resumoFrota`/`filtrarFrotaEmpresas`),
  **`busca.mjs`** (o filtro do histórico de eventos `yearOf`/`matchEvent` e a preparação do termo
  que vai ao servidor, `localidadesQueCasam`/`orIlike`/`municipiosExatos`) e **`view-state.mjs`**
  (o seam do ciclo de vida da view `beginGen`/`isCurrentGen`/`commitViewResult`/`pushDetail`/
  `popDetail`, o CONTEXTO que todo documento recebe `makeCtx`/`withLine`/`withHost`/`nextGen`,
  o modelo de abas `MAX_TABS`/`makeTab`/`openTabState`/`closeTabState`, o despacho do
  Realtime por aba `tabMatchesEvent`/`dispatchRealtime` e o que cada lista mostra, `pageBounds`/
  `filtrarSituacao`).
- **Desde a Fase B2 há módulos que NÃO são de domínio puro** — eles fazem markup ou guardam
  cache, e por isso moram fora de `src/domain/`. São oito: **`src/ui/doc.mjs`** (markup de
  documento: `docHead`/`metaRows`/`colClass`/`tableHTML` e os estados de tela `loading`/
  `emptyBox`/`emptyLinha`/`errorBox`, mais o `bannerTrunc`), **`src/ui/paginacao.mjs`**
  (`paginate`/`paginateTable`/`paginateEvents` — paginação de tela, agnóstica de conteúdo),
  **`src/ui/listas.mjs`** (a família de listas de LINHA: `situacaoSelectHTML`/`linhasTable`/
  `bindLineRows`/`paginateLines`/`lineResults`) e **`src/data/lookups.mjs`** (os caches de
  referência: `getIbge`/`getOrigem`/`getTerminais`/`getEmpresas`/`empNome`/`getEvLookups` +
  `preencherLookup`, com `INVALIDADORES_LOOKUP` para o Realtime). A Fase C1 acrescentou os três
  seguintes: **`src/ui/blocos.mjs`** (o markup que MAIS DE UMA família de documentos usa —
  `evBandHTML`/`evBlocksHTML`, `itinerarioTableHTML` + `SENTIDO_ORDER`/`normSentido`, e
  `frotaBlockHTML`), **`src/data/campos.mjs`** (as listas de coluna do `select=`: `LINE_FIELDS`,
  `ITINERARIO_FIELDS`, `QH_INTERVALO_FIELDS`, `QH_PREDET_FIELDS`, `TARIFA_LINHA_FIELDS`,
  `FROTA_FIELDS`, `EVENTO_FIELDS`) e **`src/documentos/shell.mjs`** (o seam de injeção dos
  documentos). A Fase C2 acrescentou **`src/ui/empresas.mjs`** (o chooser de empresa — busca +
  tabela + bind de clique: `searchEmpresas`/`empresaChooserHTML`/`bindEmpresaRows`).
  **REGRA que a C1 fixou, e vale para C2/C3/C4: markup usado por DUAS famílias vai para
  `src/ui/blocos.mjs`, nunca para o módulo de uma delas.** Não é simetria: o documento
  consolidado (Estrutura Operacional) consome markup de três famílias, e havia uma aresta PARA
  TRÁS — Estrutura (C2) usava `quadroHorariosBodyHTML` (C3) enquanto o Quadro (C3) usava
  `secoesTarifasHTML` (C2). Famílias exportando umas para as outras viraria ciclo entre módulos,
  com TDZ à espreita — por isso a C2 moveu os DOIS para `blocos.mjs` (junto de
  `tarifaRowHTML`/`TARIFA_COLS`, dependência de `secoesTarifasHTML`), fechando a aresta como
  aresta ENTRE FASES. O critério de entrada do `blocos.mjs` é estreito de propósito: **duas**
  famílias, não uma — e o mesmo critério, endereço diferente por tocar DOM, levou
  `searchEmpresas`/`empresaChooserHTML`/`bindEmpresaRows` para `src/ui/empresas.mjs` na C2 (já
  eram usados por Tarifas, Quadro de Horários e Histórico da Empresa).
  **O que eles precisam do app.js chega por INJEÇÃO, num bootstrap único no topo do IIFE**
  (`grep 'Bootstrap dos módulos'`): `configurarDoc({logoSVG})` passa o SVG do `#brandLogo`,
  `lookups.mjs` importa a fronteira REST diretamente; `configurarListas({aoSelecionarLinha})`
  passa a ação de shell de clicar numa linha (selecionar + fechar o modal + toast) e
  `configurarDocumentos({selecionarLinha, novoCtx})` passa a ação de tornar uma
  linha ativa e a fábrica de ctx novo (o segundo slot, acrescentado para o painel de
  Portarias) para TODOS os documentos de `src/documentos/`. Os quatro **falham fechado**: sem
  configuração, `docHead`/`getEmpresas`/`bindLineRows`/`sbFetch` lançam em vez de sair mudos —
  regressão silenciosa aqui é invisível para todo gate. Módulo que precise de mais
  de ~6 dependências injetadas é sinal de parar (ver o critério no plano vivo); o
  `src/documentos/shell.mjs` é onde essa conta se mede para a Fase C inteira, e hoje ela é **2**.
  Os harness importam módulos reais; o mecanismo transitório `@canon` foi aposentado na Fase B.
- As consultas usam **REST do Supabase via `fetch`** (PostgREST). O **supabase-js** é usado **só**
  para o canal **Realtime** — é **vendorado** em `vendor/supabase-js-2.110.7.min.js` (versão
  fixa, mesma origem, sem CDN em runtime; ver Armadilhas para atualizar) e **injetado
  dinamicamente pelo `app.js`** (seção `REALTIME`; não há `<script>` dele no `index.html` — não
  bloqueia a primeira pintura).
- **Fontes vendoradas** em `vendor/fonts/` (Archivo, IBM Plex Mono/Sans — subset latin, dos
  pacotes `@fontsource` 5.3.0); os `@font-face` ficam no início de `styles.css`. **Nenhum terceiro
  externo em runtime.** Para atualizar: `npm pack @fontsource/<família>`, extrair
  `files/<família>-latin-<peso>-normal.woff2`.
- O botão **PDF** (barra do modal) monta o documento **completo** num container oculto
  `.pdf-export` e usa `window.print()` (vetorial) — sem dependência externa de PDF.
- `vercel.json` define os cabeçalhos de segurança e `Cache-Control: must-revalidate`. A CSP é
  **`script-src 'self'`**, **`style-src 'self'` + `style-src-attr 'none'`** e **`font-src 'self'`**
  — **sem nenhum `unsafe-inline`** desde 27/07/2026 (achado SEC-08). Consequência prática:
  **atributo `style=` em markup é IGNORADO pelo navegador, em silêncio.** Estilo novo vai em
  **classe no `styles.css`**; o que for genuinamente dinâmico (posição calculada, p. ex.) vai por
  **CSSOM** — `el.style.x = …` e `setProperty`, que a CSP permite (medido em Chromium headless).
  Duas guardas cobram isso: `tests/check.js` §[1] e a regra Semgrep `divat-style-attr-quebra-csp`.
- **`.vercelignore` é allowlist**: o deploy publica só `index.html`, `app.js`, `styles.css`,
  `manifest.webmanifest`, `vercel.json`, `version.json`, `vendor/` e os módulos de `src/`
  reabertos um a um (hoje `domain/core.mjs`, `domain/agrupamento.mjs`, `domain/busca.mjs`,
  `domain/view-state.mjs`, `ui/doc.mjs`, `ui/paginacao.mjs`, `ui/listas.mjs`, `ui/blocos.mjs`,
  `ui/empresas.mjs`, `data/lookups.mjs`, `data/campos.mjs`, `documentos/shell.mjs`,
  `documentos/frota-historico-itinerarios.mjs`, `documentos/estrutura-tarifas-portaria.mjs` e
  `documentos/quadro-empresas.mjs` — cada subdiretório novo de `src/` também precisa das suas
  três linhas, e a Fase C1 abriu `src/documentos/` pagando exatamente isso; arquivo novo num
  subdiretório já aberto custa só a linha dele, como C2 e C3 pagaram para `ui/empresas.mjs`,
  `documentos/estrutura-tarifas-portaria.mjs` e `documentos/quadro-empresas.mjs`).
  Arquivo público novo (ícone, fonte) precisa ser reaberto lá, senão vira 404. **`src/` é reaberto
  arquivo a arquivo**, não com um `!/src` de uma linha: é diretório cujo nome convida a guardar o
  que não se serve, e reabri-lo inteiro publicaria em silêncio o que alguém largar ali. Reabrir só
  o arquivo **não basta** — o git não desce em diretório excluído, então cada nível precisa ser
  reaberto e ter o conteúdo fechado de novo (medido, não suposto).
  **Esquecer isso derrubou o portal inteiro em 10/08/2026**: o `app.js` virou ES module e importa
  `src/domain/core.mjs`; sem `src/` na allowlist o import deu 404 e — porque **import ES é
  atômico** — o `app.js` inteiro deixou de executar, com `<main id="app">` vazio e nenhum card na
  tela. Hoje `tests/check.js` §[1] deriva os assets pedidos por `app.js` (`import`, `import()`,
  `.src=`, `fetch('/…')`), `index.html` (`href`/`src`) e `styles.css` (`url()`) e reprova se algum
  não sobreviver à allowlist, conferindo pelo próprio git — a mesma engine de padrões da Vercel.
  A varredura de módulos é **transitiva**: segue cada módulo descoberto resolvendo o
  especificador **relativo ao arquivo que importa**, porque um módulo publicado que importe outro
  não publicado quebra o `app.js` inteiro do mesmo jeito. Referência dentro de comentário **não**
  conta (o navegador não a pede). Os dois vieram da revisão na issue #121, cada um reproduzido
  antes de corrigir; a bateria de mutação que os guarda tem 18 casos.

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `app.js`. A chave atual é a **JWT `anon` legada**, não uma
  `sb_publishable_...`; ambas são públicas, mas têm formatos de header diferentes. A migração para
  publishable precisa atualizar REST, Realtime, scripts e testes em conjunto. A segurança vem do
  **RLS + privilégio mínimo** (anon só lê).
- **RLS / segurança (LER COM ATENÇÃO):**
  - Todas as tabelas têm RLS ligado; cada tabela de consulta tem policy `anon_read_*` (SELECT).
  - O portal é **read-only de verdade**: `anon` e `authenticated` têm **apenas SELECT** nas 14
    tabelas de consulta, e toda escrita foi revogada. **Não há caminho de escrita pela API pública**
    (conferido contra o banco vivo em 27/07/2026, não só contra o SQL versionado).
  - **Objeto novo nasce FECHADO (default deny), desde 27/07/2026.** Os `ALTER DEFAULT PRIVILEGES`
    do schema `public` **revogam** de `anon`/`authenticated`: tabelas, sequências e `EXECUTE` de
    funções. Antes eles faziam o oposto — `GRANT SELECT ON TABLES` — e a prosa daqui afirmava que
    "garantiam que tabelas novas não voltassem a conceder", o que estava invertido (era o achado
    SEC-01). **Consequência prática: tabela nova exige `GRANT SELECT` + policy explícitos, e RPC
    nova exige `GRANT EXECUTE` explícito** — sem isso o portal recebe 401/404 e parece bug de
    front. A skill `db-change` cobra isso. **Fechar o default não conserta o que já existe:** as
    18 tabelas atuais nasceram sob o default antigo e ficaram com `MAINTAIN` até um `REVOKE
    MAINTAIN ON ALL TABLES` explícito — achado do próprio gate na 1ª rodada contra o banco.
  - **Limitação ATIVA:** há um segundo conjunto de defaults, do role `supabase_admin`, que concede
    escrita a `anon` em tabelas de `public`, e não é fechável — `postgres` não é superusuário no
    Supabase. Até 28/07/2026 esta linha dizia que ele "só atinge objetos criados por esse role (o
    painel cria como `postgres`)", ou seja, que na prática não pegava. **Medição desmentiu:** ao
    rodar o `backup_schema.sql` num projeto novo pelo SQL Editor (portanto como `postgres`), as 18
    tabelas nasceram com TRUNCATE/REFERENCES/TRIGGER para `anon` e `authenticated` — 108 grants.
    **RLS não bloqueia TRUNCATE**, e a anon key é pública, então era caminho aberto para esvaziar o
    banco. Por isso o `backup_schema.sql` agora revoga tudo que não é SELECT, não só `MAINTAIN`.
    Mitigação: o gate `scripts/check_grants.mjs` roda **diariamente** enquanto esse default existir.
  - **NUNCA conceda escrita (GRANT nem policy de INSERT/UPDATE/DELETE) a `anon`/`authenticated`.**
    Se um dia precisar de edição logada legítima, crie policy **restrita por tabela/coluna** —
    nunca `ALL USING(true)`.
  - **Signup do Auth: manter FECHADO** (Dashboard → Authentication → "Allow new users to sign
    up" = OFF). O estado e as limitações vigentes ficam registrados em `docs/seguranca.md`.
  - **Manual de segurança do dono + auditoria/pentest** (linguagem direta, modelo de ameaça,
    checklist trimestral e resposta a incidente): **`docs/seguranca.md`**. Auditoria completa +
    teste de invasão ao vivo em 23/07/2026 (sem achados de segredo; sem caminho de escrita).
  - **Como o dono alimenta:** o banco do **DETRO** é a fonte; o dono exporta em **CSV** e importa
    pelo **Table Editor** do painel do Supabase (service role, ignora RLS). Runbook completo —
    encoding obrigatório, staging, o que rodar depois: **`docs/etl.md`**.
  - **Teto do PostgREST:** `pgrst.db_max_rows = 30000` no role `authenticator` (igual ao maior
    `limit` do front). **Ao criar query com `limit` > 30000, suba o teto junto**
    (`ALTER ROLE authenticator SET pgrst.db_max_rows = '<n>'; NOTIFY pgrst, 'reload config';`)
    **e suba, na mesma tarefa, a constante `SB_MAX_ROWS` de `src/data/rest.mjs`** (seção `SUPABASE CONFIG`):
    o `marcarTrunc` a usa como segundo critério de truncagem — é o que impede uma resposta cortada
    pelo SERVIDOR de passar sem banner, já que `data.length` nunca alcança um `limit` maior que o
    teto. Deixá-la para trás faz o portal avisar "resultado parcial" num teto que não é mais o
    real. **São TRÊS lugares a mudar juntos:** o banco, o `SB_MAX_ROWS` de `src/data/rest.mjs` e o
    `docs/backup_schema.sql` (onde os `ALTER ROLE` passaram a ser versionados em 09/08/2026).
  - **Timeouts por role** (medidos em 09/08/2026, versionados na baseline): `anon` = **3s**,
    `authenticated` = **8s**, `authenticator` = 8s + `lock_timeout` 8s. Não são iguais de
    propósito — o caminho anônimo é o exposto, e tem o teto mais curto.
  - **Baseline de reconstrução** (RLS/policies/grants/índices/funções) versionada em
    `docs/backup_schema.sql`. Snapshot do estado atual (auditoria/DR):
    `scripts/gen_security_snapshot.sql` (salvar a saída **fora do git**).
- **Realtime:** as 14 tabelas lidas pelo portal estão na publicação `supabase_realtime`. Ao criar
  um card que lê tabela nova, faça **as duas coisas**: (1) `alter publication supabase_realtime
  add table public.<tabela>;` e (2) inclua-a em `RT_TABLES` e no `VIEW_TABLES` da view no
  `app.js`. O teste offline `tests/realtime.test.js` guarda o lado do JS (`VIEW_TABLES ⊆
  RT_TABLES`); a checagem viva contra o banco é `scripts/check_realtime.mjs` (rode após mexer no
  Realtime).

## Tabelas → onde aparecem (cards)
As **14** tabelas de `RT_TABLES`, sem exceção — a lista abaixo é conferida contra o código pelo
`tests/check.js` §[2b]: tabela que entra no `RT_TABLES` e não aparece aqui reprova o gate.
- `tabela_vista_teste` (cadastro de linhas) → busca, Ligações por Empresa, Empresas Regulares.
- `itinerario_teste` (+ `municipio_teste`) → Itinerários, Ligações por Logradouro/Município.
- `qh_intervalo_teste` / `qh_predeterminado_teste` (+ `origem_teste`) → Quadro de
  Horários, Ligações por Terminais.
- `qh_teste` (frota_*) → Frota, Estrutura, Frota por Empresa.
- `tarifa_atual_teste` → Tarifas, Seções por Ligação/Empresa.
- `evento_teste` (+ `evento_empresa_teste`, `evento_linha_teste`) → Histórico.
- `localidades_teste` → Linhas por Localidade e Município.
- `codempresa_teste` (cadastro de empresas) → lookup `getEmpresas`, usado por **quase todo card**
  (o nome da empresa no banner e nas listas); é a fonte direta do Histórico da Empresa
  (processo/data de publicação) e das Empresas Regulares.
- `portaria_teste` → Portarias (lista + detalhe; único card que a lê).

## Como o Realtime funciona no código
- Cada card abre uma "view": `runView({ title, tables:[...], lineFilter, loader })`.
- Um canal assina `postgres_changes` de todas as tabelas (`RT_TABLES`). Quando chega evento de
  tabela que a view aberta usa (`VIEW_TABLES`/`tables`) e bate o filtro da linha **daquela aba**,
  o `loader()` (ou `_panelRun` dos painéis de busca) roda de novo, com debounce.
  **`VIEW_TABLES` deve listar TODAS as tabelas que o loader lê — inclusive as lidas por baixo
  via lookups** (`getEmpresas→codempresa_teste`, `getIbge→municipio_teste`,
  `getOrigem→origem_teste`, `getEvLookups→evento_empresa_teste/evento_linha_teste`). Se faltar
  uma, mudanças nela não recarregam a tela. Obs.: `searchPanel(...)` **não** recebe `tables` —
  quem controla é o `VIEW_TABLES[view]` usado no `runView`.
- Atualiza **a aba ativa** (a que está na tela), ao vivo. Uma **aba em segundo plano** cujo evento
  bate só fica marcada como **desatualizada** (`stale`, ponto verde na faixa de abas): nenhum
  fetch, nenhum re-render — ela recarrega quando o usuário volta pra ela (`dispatchRealtime` →
  `markStale`; `activateTab` → `reloadTab`). Quem não está com o card aberto vê o dado novo na
  próxima busca.

## Mapa do código (`app.js`)
O JS é um arquivo só, dividido em seções com marcas `/* ===== TÍTULO ===== */`. **Para achar
algo, dê grep na marca da seção** (ela não muda de lugar como número de linha muda). Há um
**índice no topo do arquivo** e o bloco `MODAL / SISTEMA DE VIEWS` (o maior) tem **sub-índice +
sub-marcas `/* --- … --- */`** por documento. Guia completo de navegação e as **regras de
segurança para reorganizar o JS** (hoisting, TDZ, ordem do `LOADERS`, verificação em 3 camadas)
em **`docs/estrutura-frontend.md`**. Visão geral:

| Seção (faça grep do título) | Funções-chave | O que faz |
|---|---|---|
| *(fora do `app.js`)* `src/domain/core.mjs` | `fmtCode/fmtTime/fmtDate`, `esc/enc/ilikeTerm/orDash`, `norm`, `debounce`, `isLinhaAtiva`/`isVigente` | Formatação, escaping, normalização de texto, o `debounce` compartilhado e as regras de situação da linha. |
| *(fora do `app.js`)* `src/domain/agrupamento.mjs` | `groupBy`, `countBy`, `fmtMoney`, `byCodlinha`, `rjOrder`, `scoreEmpresa`/`dedupEmpresasPorRJ`, `classifyMunLines`/`terminaisDoMunicipio`, `resumoFrota`/`filtrarFrotaEmpresas` | Agregação, ordenação e filtros de conjunto — importados pelo `app.js` e pelos testes, sem cópia no meio. |
| *(fora do `app.js`)* `src/domain/busca.mjs` | `yearOf`/`matchEvent`, `localidadesQueCasam`, `orIlike`, `municipiosExatos` | Filtro do histórico de eventos e preparação do termo PostgREST; o I/O de localidades mora no módulo C4. |
| *(fora do `app.js`)* `src/domain/view-state.mjs` | `beginGen`/`isCurrentGen`/`commitViewResult`/`pushDetail`/`popDetail`, `makeCtx`/`withLine`/`withHost`/`nextGen`, `MAX_TABS`/`makeTab`/`openTabState`/`closeTabState`, `tabMatchesEvent`/`dispatchRealtime`, `pageBounds`, `filtrarSituacao` | Regras puras sobre o ESTADO DO QUE ESTÁ NA TELA: qual tentativa de carga ainda vale, quais abas existem, qual delas se importa com um evento, e que fatia/subconjunto uma lista mostra. Quem APLICA a decisão (DOM, fetch, toast) continua no `app.js`. |
| *(fora do `app.js`)* `src/ui/doc.mjs` | `configurarDoc`, `docHead`, `metaRows`, `colClass`, `tableHTML`, `loading`/`emptyBox`/`emptyLinha`/`errorBox`, `bannerTrunc` | Markup de documento e estados de tela — string de HTML, sem DOM nem estado. O SVG do logo chega por `configurarDoc` no bootstrap. |
| *(fora do `app.js`)* `src/ui/paginacao.mjs` | `paginate`, `paginateTable`, `paginateEvents` | Paginação **só de tela** (25/pág), agnóstica de conteúdo; `paginateEvents` é o de UM evento por página, com filtros. Recebem `view`/`gen` de quem chama. |
| *(fora do `app.js`)* `src/ui/listas.mjs` | `configurarListas`, `situacaoSelectHTML`, `linhasTable`, `bindLineRows`, `paginateLines`, `lineResults` | A família de listas de LINHA, o hub de ~10 cards. O clique numa linha é ação de shell e chega por `configurarListas({aoSelecionarLinha})`. |
| *(fora do `app.js`)* `src/data/lookups.mjs` | `getIbge`/`getOrigem`/`getTerminais`/`getEmpresas`/`empNome`/`getEvLookups`, `preencherLookup`, `INVALIDADORES_LOOKUP` | Caches de referência que quase todo card lê por baixo. Esconde o cache; **expõe** a invalidação, porque quem sabe QUANDO invalidar é o Realtime. |
| *(fora do `app.js`)* `src/ui/blocos.mjs` | `evBandHTML`/`evBlocksHTML`, `itinerarioTableHTML` + `SENTIDO_ORDER`/`normSentido`, `frotaBlockHTML`, `quadroHorariosBodyHTML`, `secoesTarifasHTML`/`tarifaRowHTML`/`TARIFA_COLS` | Markup de documento usado por MAIS DE UMA família da Fase C. Critério de entrada: **duas** famílias. Impede que um módulo de família importe o da irmã (ciclo). Os dois últimos entraram na C2 e fecharam a última aresta do grafo (C2↔C3). |
| *(fora do `app.js`)* `src/ui/empresas.mjs` | `searchEmpresas`, `empresaChooserHTML`, `bindEmpresaRows` | **Fase C2** — o chooser de empresa (busca + tabela + bind de clique), usado por MAIS DE UMA família (Tarifas, Quadro de Horários, Histórico da Empresa). Mesmo critério do `blocos.mjs`; endereço diferente porque `bindEmpresaRows` toca DOM. |
| *(fora do `app.js`)* `src/data/campos.mjs` | `LINE_FIELDS`, `ITINERARIO_FIELDS`, `QH_INTERVALO_FIELDS`, `QH_PREDET_FIELDS`, `TARIFA_LINHA_FIELDS`, `FROTA_FIELDS`, `EVENTO_FIELDS` | As listas de coluna do `select=`. Definição ÚNICA: coluna que diverge entre um documento e a Estrutura chega `undefined` e a tela sai vazia sem erro. |
| *(fora do `app.js`)* `src/documentos/shell.mjs` | `configurarDocumentos`, `selecionarLinha`, `novoCtx`, `montarPainelBusca`, `abrirView`, `distinctCods`, `fetchLinesByCods` | Seam ÚNICO de ações de shell em `src/documentos/`: **6** slots, o limite de parada; a rede vem de `src/data/rest.mjs`. |
| *(fora do `app.js`)* `src/documentos/frota-historico-itinerarios.mjs` | `loadHistoricoLinha`, `loadItinerarios`, `loadFrota` + renders | **C1 + D** — exporta os loaders finais; recebe só `lineDocView`/`lineSearchRun`/`searchPanel` num configurador próprio fail-closed. |
| *(fora do `app.js`)* `src/documentos/estrutura-tarifas-portaria.mjs` | `loadTarifas`, `loadEstrutura`, `renderPortarias` + renders/runners | **C2 + D** — composição de Tarifas e Estrutura fechada na família; Portaria continua loader direto. |
| *(fora do `app.js`)* `src/documentos/quadro-empresas.mjs` | `loadQuadroHorarios`, três `load*Empresa`, `frotaPorEmpresa` + renders/runners | **C3 + D** — composição fina exportada; o corpo de `frotaPorEmpresa`, encontrado no acabamento da D, voltou à família responsável. `empresasRegulares`/`openEmpresaLigacoes` permanecem no shell porque abrem view nova com `runView`. |
| *(fora do `app.js`)* `src/documentos/municipios-localidades.mjs` | `ligacoesPorLogradouro`, `municipioRegiao`, `ligacoesPorTerminal`, `secoesPorLigacao`, `localidades`, `invalidarLocalidades` | **C4 + D** — loaders completos; `secoesPorLigacao`, ainda inline depois de C4, foi corrigido na família antes de concluir D. |
| `SUPABASE CONFIG` | configuração de ambiente e `configurarRest` | URL/chave/fetch são injetados em `src/data/rest.mjs`, que esconde timeout/retry/truncagem. Os helpers de formatação e escape moraram para `src/domain/core.mjs`; o `bannerTrunc` que pinta a truncagem, para `src/ui/doc.mjs` (marcar é dado, pintar é markup). |
| `ÍCONES` | objeto `I` | SVGs dos ícones. |
| `SEÇÕES / CARDS` | array `SECTIONS` | Define os cards `[ícone, título, descrição, view, precisaLinha]`. |
| `RENDER CARDS` | `selectTopic`, `renderSideNav`, `renderSideContent` | Monta o **painel lateral** (sidebar de tópicos + painel de conteúdo) a partir de `SECTIONS`; `selectTopic` troca o tópico ativo (clique na sidebar, busca do topo e rota `#/topico/<key>`). |
| `STATE + CACHES` | `activeLine`, `tabs`/`activeTab`/`setActiveLine`, `searchEmpresas` | Estado global desta tela. Os caches de lookup foram para `src/data/lookups.mjs` (linha acima); ficou a busca de empresa do modal, que só lê a lista que o módulo expõe. |
| `BUSCA DE LINHAS (hero)` | `doSearch`, `closeDropdown` | Busca do topo e dropdown de resultados. |
| `LINHA ATIVA — BANNER` | `selectLine`, `bannerEmpHTML` | Banner navy da linha selecionada. |
| `MODAL / SISTEMA DE VIEWS` | `runView`, chrome/abas, `lineDocView`/`lineDocRun`/`lineSearchRun`/`searchPanel`, `empresasRegulares`/`openEmpresaLigacoes`, registro `LOADERS` | **Shell final após D**: 16 loaders documentais são imports associados diretamente. Ficam o bootstrap estreito das famílias e a infraestrutura que depende de DOM, navegação ou abertura de nova view. A Fase E não foi aberta. |
| `COMPONENTES AUXILIARES` | `searchPanel`, `distinctCods`/`fetchLinesByCods` | Painel e buscas compartilhadas que permanecem no shell e chegam ao módulo C4 pelo seam limitado. A tabela e paginação moram em `src/ui/listas.mjs` e `src/ui/paginacao.mjs`. |
| `CLIQUE NOS CARDS` | — | Liga o clique do card → abre a view. |
| `TOAST` | `toast` | Avisos transitórios. |
| `REALTIME` | `RT_TABLES`, `CACHE_INVALIDATORS` (espalha o `INVALIDADORES_LOOKUP` do módulo e acrescenta os caches desta camada), `invalidateCaches`, `scheduleReload`/`reloadTab`, `markStale`, `onRealtime`, `initRealtime` (a decisão de quem recarrega, `dispatchRealtime`, vem de `src/domain/view-state.mjs`) | Assina mudanças do Supabase e despacha por aba: a aba ativa recarrega ao vivo, as de segundo plano só ficam `stale` (recarregam ao serem reativadas). supabase-js injetado dinamicamente aqui. |
| `AUTO-ATUALIZAÇÃO` | `checarNovaVersao` | Detector de novo deploy (`HEAD /version.json`, compara o ETag) que recarrega sozinho. |
| `ROTAS (hash)` | `syncHash`, `applyRoute` | Deep link (`#/linha/…`, `#/consulta/…`) e Voltar do navegador fechando o modal. |

A lógica **pura** dessas seções tem testes em `tests/`: o que já saiu para `src/domain/` é
testado direto pelo módulo real; o que ainda mora no `app.js` roda sobre cópia verbatim guardada
pelo `check.js` — são as **10** do `tests/harness.js`, todas do bloco `SUPABASE CONFIG` (o
  `preencherLookup` e o `bannerTrunc`, que eram as duas de fora, saíram na Fase B2). Render/DOM e
PDF não têm teste em Node; o que os módulos de `src/ui/` têm de markup puro é exercitado em
`tests/ui-data-module.test.mjs`, e o resto fica com os gates de navegador.

## Publicação (Vercel) e atualização automática
- **Host: Vercel** (único host em uso). A ligação com o Supabase é toda **client-side**; o host
  só serve arquivos estáticos.
- **Config:** `vercel.json` (raiz) carrega os cabeçalhos de segurança — em especial a **CSP**,
  cujo `connect-src` autoriza os projetos Supabase de produção
  (`lwzsxuaqqeoamukduhev`) e teste (`gontnlfmothfglssbyyk`) em REST e Realtime.
  `app.js` mantém produção numa allowlist de **3 domínios**: o canônico, o alias do time e o alias
  da branch `main`. Preview, localhost e hostname desconhecido usam teste. Configuração ausente
  falha fechado, sem fallback para produção. Ao mexer na CSP ou nessa matriz, rode também
  `tests/environment.test.js`.
- **Auto-deploy:** conectar o repo GitHub `LucasMolinari9/LucasCTEC` ao projeto Vercel pelo
  **dashboard** (OAuth, ação única) → **push na `main` = deploy** (e **push em branch = preview
  deploy**, use-o). Sem essa conexão, publica-se rodando o MCP `deploy_to_vercel` após o push.
- **Atualização automática para todos os usuários** (sem limpar cache):
  1. `Cache-Control: public, max-age=0, must-revalidate` (no `vercel.json`) → cada visita
     revalida (`index.html` **e** `app.js`).
  2. Detector de versão (`checarNovaVersao` no `app.js`): faz **`HEAD /version.json`** e compara o
     ETag a cada ~3 min, ao focar a aba e ao voltar de segundo plano; se mudou, recarrega sozinho
     (espera fechar o modal aberto). **Não há lista de arquivos a manter** — é um arquivo só, de
     propósito, e por isso **todo deploy que muda HTML, CSS, JS ou MÓDULO tem de incrementar o
     `version.json`**. Até 15/08/2026 esta linha descrevia o mecanismo antigo (ETags de
     `/index.html`, `/app.js` e `/styles.css`) e mandava pôr "arquivo novo de primeira ordem" numa
     lista que não existe mais: quem seguisse podia concluir que módulo novo dispensa o bump, e o
     usuário ficaria com a versão velha em cache.
- **Carimbo de versão** no rodapé (`#verTag`, ex.: `build 21/07-A`). Ao publicar algo que o
  usuário precisa confirmar, **incremente esse texto**.
- O `vercel` CLI **não** funciona pelo ambiente do Claude (rede de saída bloqueada). Os caminhos
  são: **push** (auto-deploy git) ou o MCP **`deploy_to_vercel`**.

## Como fazer mudanças
0. **Mudança estrutural no banco** (tabela/coluna nova, RLS/GRANT, Realtime, índice, staging do
   ETL)? Use a skill `db-change` (`.claude/skills/db-change/`) — ela cobre o checklist de
   armadilhas antes de escrever SQL/JS. Ajuste isolado de CSS/texto/UI pula direto pro passo 1.
1. Edite `app.js` (JS) e/ou `index.html` (HTML/CSS). **Trabalhe numa branch**, não direto na
   `main`: push na branch → o Vercel gera **preview deploy** → confira no preview → merge na
   `main` (que é a publicada). Existem **10 workflows**, separados por preocupação: `ci.yml`,
   `views.yml`, `semgrep.yml`, `deriva.yml`, `db-checks.yml`, `phase3-security.yml`,
   `deploy-smoke.yml`, `backup.yml`, `atualizar-baseline.yml` e `atualizar-semgrep-rulesets.yml`
   (os dois últimos são **só** `workflow_dispatch` e existem pelo mesmo motivo: fazer, pela aba
   Actions, o que de outro modo exigiria terminal — um mede um banco e abre PR com o diff do
   baseline; o outro baixa os rulesets do Semgrep e abre PR com o diff deles). Os cinco primeiros
   mais o contrato offline da Fase 3 podem entrar num PR conforme os arquivos tocados; o smoke
   acompanha deploys; o backup é cron/manual. Um vermelho não esconde o outro.
   Se previews estiverem protegidos pela Vercel, configure um **Protection Bypass for
   Automation** e grave o mesmo valor no secret GitHub `VERCEL_AUTOMATION_BYPASS_SECRET`;
   sem isso o smoke recebe a tela de login em vez do portal e falha de propósito.
   **Onde os gates disparam (desde 30/07/2026):** `ci`, `views`, `semgrep`, `deriva` e
   `db-checks` rodam em **`pull_request`** e em **push na `main`** — não mais em push de branch
   qualquer, que fazia cada um rodar **duas vezes** quando havia PR aberto. Consequência prática:
   **push numa branch sem PR aberto não dispara gate nenhum.** Rode `node tests/check.js` local,
   ou dispare pela aba Actions → Run workflow (`workflow_dispatch`, que os cinco têm).
2. **Antes de publicar, rode `node tests/check.js`** — valida a sintaxe do `app.js`, garante que
   não voltou `<script>` inline no `index.html`, confere as cópias de teste (anti-drift), cobra a
   **deriva docs×código** (seção `[2b]`, ver abaixo) e roda todos os testes. Só publique tudo
   verde. (Ao alterar função com cópia em `tests/*.harness.js`, atualize a cópia — e se criar
   cópia nova, **adicione a guarda no `canon`**: o `check.js` agora falha se um símbolo exportado
   pelo harness não tiver guarda, porque foi assim que `ilikeTerm` e `MAX_TABS` ficaram
   descobertos.) **Ao mexer nas abas do modal / no seletor de documentos**, rode também
   `node scripts/check_abas.mjs` — checagem de regressão em navegador headless (Playwright, com
   o PostgREST stubado); fica fora do `check.js` porque este é offline e sem dependências, mas
   **roda no CI** junto com o `check_views.mjs` (workflow `views.yml`).
   **Ao mexer em `bindLineRows`/`selectLine`/`closeModal`/`syncHash` ou nas barras de situação
   das listas de linha**, rode `node scripts/check_selecao_linha.mjs` — mesma bancada, guarda
   o bug em que o `history.back()` do `closeModal` apagava a linha recém-selecionada dentro do
   modal (ver Armadilhas) e a barra Todas/Ativas/Canceladas do card de Localidade.
   **Ao mexer no `ctx` dos documentos — `runView`, `reloadTab`, `searchPanel`, ou a assinatura de
   qualquer `render*`/loader**, rode `node scripts/check_corrida_abas.mjs`. Mesma bancada, e é o
   único gate que **cria** a ordenação do bug: o stub segura a resposta até a troca de aba ter
   acontecido. Os outros três esperam a requisição assentar antes de agir e por isso podem ficar
   verdes com um render pintando o pane errado. Roda no CI, no mesmo `views.yml`.
> Os cinco gates abaixo (2a–2e) têm **runbook no cabeçalho do próprio script**. Aqui fica só
> quando rodar e **o que quebra se você esquecer** — o detalhe mora junto da ferramenta, que é
> onde quem a opera vai olhar. Este arquivo é lido no início de toda sessão; runbook de gate não.

2a. **Mexeu em render/loader? `node scripts/check_views.mjs`** — abre as **20 views** (cenários) num
   navegador headless e falha se alguma explodir, ficar no spinner ou pintar menos que o
   `minimo` declarado. É a rede sob a seção `MODAL / SISTEMA DE VIEWS` (~39,5% do `app.js`), que o
   `check.js` **não** cobre. Aceita filtro: `check_views.mjs frota`.
   **O que quebra se esquecer:** view nova sem entrada em `VIEWS` (a checagem anti-drift do final
   pega); `select=` alterado sem ajustar a fixture em `scripts/lib/rig.mjs` — nome de coluna
   divergente chega `undefined` no render e a tela fica vazia *sem erro*, falso verde; caminho de
   dado por **RPC** sem stub em `serveRpc`, e aí o laço acusa defeito que é da bancada.
   Roda no CI (`views.yml`), junto do `check_abas.mjs`.
2b. **Análise estática — `./scripts/semgrep.sh`.** Complementa o `check.js`, não substitui: o
   `check.js` pergunta "faz o que deve?", o Semgrep pergunta "contém padrão proibido?". Pega o
   que só quebraria no navegador do usuário — `eval`/`new Function`, CDN externo em runtime,
   `style=` em markup e atribuição direta a `currentView.pdfHTML` fora do seam.
   **O que quebra se esquecer:** nada no gate offline — é justamente o que ele não vê.
   O modo padrão roda as **5 regras locais** mais os rulesets **vendorizados** em
   `.semgrep/vendor/` — offline, e igual ao que o CI roda. Até 14/08/2026 rodava só as 5, e
   "verde local" não era evidência de verde no CI: foi assim que **3 achados de
   `run-shell-injection`** chegaram ao CI em 09/08. `--full` (rede, bloqueada no ambiente do
   Claude) vira conferência de frescor. **Para atualizar a cópia, nunca edite à mão:** aba
   Actions → workflow `atualizar-semgrep-rulesets` → abre PR com o diff.
   Runbook e como escrever regra nova: **`docs/semgrep.md`**.
2c. **Deriva docs×banco — `node scripts/check_deriva.mjs`** (precisa de rede). Confere que toda
   tabela/coluna/RPC que o repo afirma existe mesmo, na visão de `anon`.
   **O que quebra se esquecer:** nada imediato — por isso o workflow `deriva.yml` roda **semanal**
   além de push/PR: deriva também nasce de mudança NO BANCO, que não gera push. Do ambiente do
   Claude não roda; é para a máquina do dono e o CI. Fica **fora** do `check.js` (contrato dele:
   offline).
2d. **Deriva docs×código — seção `[2b]` do `tests/check.js`** (offline, roda no gate de sempre).
   Irmã do `check_deriva.mjs`: ele guarda docs×**banco**, esta guarda docs×**código**. Cobra, nos
   **docs vivos** (`CLAUDE.md`, `README.md`, `docs/*.md` de topo, `docs/adr/` e `docs/planos/` —
   o `CHANGELOG` fica fora de propósito por ser cronologia): fatos
   numéricos batendo com o código, links markdown resolvendo, `SB_URL`/`SB_KEY` nunca associadas
   ao `index.html` <!-- deriva-ok: enuncia a regra -->, mapa tabela→card cobrindo `RT_TABLES`,
   composição de `.claude/skills/`, e nenhum arquivo terminando com tag de ferramenta de IA
   vazada. Os fatos numéricos varrem também os comentários de `.github/workflows/*.yml` e os
   cabeçalhos de `scripts/*.mjs` — prosa viva que ninguém relê porque não abre em leitor de
   markdown, e foi assim que o `views.yml` pôde afirmar "23 views" e o `check_views.mjs` "~62% do
   app.js" com o gate verde.
   **O que quebra se esquecer:** você não esquece — ela roda sozinha. O que importa é a reação:
   se mudou uma frase que carrega número, **atualize o número, não apague a guarda** (se a frase
   mudou de forma, ajuste o regex na tabela `FATOS`). Ela é deliberadamente estreita: a 1ª versão
   varria todo token em backtick e deu 61 falsos positivos contra 0 verdadeiros.
2e. **Qualidade dos dados pós-ETL — `node scripts/check_data_quality.mjs`** (precisa de rede;
   chama a RPC `divat_data_quality()` como `anon`). Fecha a issue #63. Roda semanal no
   `db-checks.yml`, junto do `check_realtime.mjs`.
   **A integridade hub-and-spoke JÁ ESTÁ VIOLADA no banco:** 17 codlinhas órfãs em 4 tabelas + 4
   linhas com `cod_origem` inexistente, medidas em 27/07/2026. **As views dessas linhas renderizam
   VAZIAS, sem erro.** A dívida está registrada em `scripts/data_quality_baseline.json` — o gate
   passa com ela e falha no instante em que aparece achado **novo** ou um conhecido **piora**.
   **O que quebra se esquecer:** ao consertar dado, rode `--atualizar-baseline`, senão o gate
   segue frouxo; e **confira a lista `orfaos_conhecidos`, não só o número** — o gate compara
   contagem, então uma órfã corrigida e outra criada passam despercebidas.
   **NÃO apagar os filhos órfãos de `evento_teste`:** são atos reais de 1974–1996, arquivo
   institucional insubstituível, e por isso rebaixados a aviso.
   Detalhe completo (quais tabelas, por que o rebaixamento, a unidade de `qtd`): cabeçalho do
   `scripts/check_data_quality.mjs`.
3. Merge na `main` → republica sozinho (ou MCP `deploy_to_vercel`). As telas dos usuários se
   atualizam via detector de versão. Bumpe o carimbo se quiser confirmar a chegada.
4. Mudanças de **dados** NÃO exigem deploy — o site lê o Supabase ao vivo.

## Backup (leia antes de qualquer coisa destrutiva no banco)
- Plano **Free (NANO)** — sem PITR automático (só no Pro). A rede de segurança tem 3 camadas
  (runbook completo: **`docs/backup.md`**):
  1. **Automática:** `.github/workflows/backup.yml` roda semanal (e sob demanda) o
     `scripts/backup_rest.mjs` em **modo público** (anon JWT legada hoje; 14 tabelas públicas, sem staging);
     artifact do Actions por 90 dias.
  2. **Manual (completa):** `pg_dump` (padrão-ouro) ou `backup_rest.mjs` com secret/service key
     (18 tabelas) ou 18 CSVs pelo Table Editor — sempre **FORA do git** (dados no repo =
     vazamento; o git versiona só CÓDIGO).
  3. **Estrutura:** `docs/backup_schema.sql` (versionado). Para NDJSON, o caminho inverso é
     `scripts/restore_rest.mjs`, com dry-run padrão, confirmação do ref e destino vazio.
- **Não rodar nada destrutivo (DROP/DELETE/TRUNCATE/REVOKE/migração) sem backup fresco.**

## Armadilhas / observações
- **CSS — dropdown da busca:** o dropdown é inserido **dentro de `.selector`**. A regra do botão
  verde usa **`.selector > button`** (filho direto) de propósito — **não** use `.selector button`,
  senão os `<button>` dos resultados herdam o fundo verde do "Abrir linha".
- **Encoding dos dados:** o banco está **limpo de U+FFFD** (corrigido em 21/07/2026 — ver
  CHANGELOG). **Atenção ETL:** importar com encoding errado recria o problema — **sempre UTF-8**.
- **Estética:** topo navy + faixa verde fina (identidade DETRO/DIVAT); banner da linha em navy
  com faixa verde inferior. Manter esse idioma visual ao criar telas novas.
- **PKs e índices (escalabilidade):** todas as tabelas têm PRIMARY KEY (as 3 grandes com `id`
  repetido têm surrogate `row_id`, não selecionado pelo front). Ao criar telas que filtram
  **novas** colunas de tabelas grandes, **criar o índice** (btree; `pg_trgm`+GIN para `ilike`).
- **`cod_origem` × `cod_municipio_origem`:** `cod_origem` = **terminal/origem** (`origem_teste`,
  `qh_intervalo_teste`, `qh_predeterminado_teste`); `cod_municipio_origem` = **código IBGE de
  município** (`itinerario_teste`). Detalhe + diagrama em `docs/schema.md`. **Atenção ETL:** o
  import precisa escrever nesses nomes — se escrever nos antigos (`cod_origen`, `cod_origem` em
  `itinerario_teste`), **recria as colunas velhas**.
- **Staging do ETL (não lidas pelo portal):** `evento_dados` + `evento_textos` casam por `id` com
  `evento_teste`; `portaria_data` + `portaria_texto_teste`, com `portaria_teste`. RLS ligado
  **sem policy** e **sem grant** → invisíveis pela API pública, de propósito (o lint
  `rls_enabled_no_policy` nelas é **esperado**). Alimentação via service role (painel).
  **Replique na staging toda correção feita em tabela final** (casando pelo `id`): são duas cópias
  do mesmo fato, e o portal só lê a final — a discordância é invisível até alguém reconstruir a
  final a partir da staging e o dado velho voltar.
  **Não existe rebuild automatizado** (medido em 09/08/2026: nenhuma função ou trigger menciona a
  staging, e as contagens batem exatamente — 20.753 nos três de evento, 2.100 nos três de
  portaria). As duas cópias andam juntas porque **o import de CSV alimenta as duas**. Até
  08/08/2026 esta linha afirmava que "o rebuild do ETL desfaz", como se houvesse um mecanismo
  automático; não há. Detalhe em `docs/etl.md` §3.
- **Truncagem silenciosa:** a maioria dos loaders avisa via `src/data/rest.mjs` (marca o
  array) + `bannerTrunc` (`src/ui/doc.mjs`, pinta o aviso), mas
  cortes por `slice(0,N)` no cliente **perdem** a flag não-enumerável `_trunc` (o `slice` não a
  copia). Ao criar/editar view que faz `slice` no cliente, **reponha a flag** (ou avise o
  usuário) quando o limite for atingido.
- **Paginação é SÓ de tela; o PDF sai INTEIRO:** listas longas são paginadas (25/pág) por
  `paginateTable` (`src/ui/paginacao.mjs`) e `paginateLines` (`src/ui/listas.mjs`) — núcleo
  `paginate` + o `pageBounds` do `view-state.mjs`. Como só a fatia atual
  entra no DOM, o fallback do `baixarPdf` exportaria só a página aberta — por isso os wrappers
  **escrevem `pdfHTML` (via `commitViewResult`) com a lista completa**. Quem tem PDF próprio mais
  rico passa **`pdf:false`** — são **4 documentos**: Quadro "por empresa"; Município (dois call
  sites, um por ramo do `scope`); Frota por Empresa; e o bloco secundário do Localidade, cujo PDF
  cobre os DOIS blocos e por isso não pode ser sobrescrito pelo paginador. Detalhes:
  `docs/estrutura-frontend.md` §4. Em tela nova que lista muita coisa, **use esses helpers** em
  vez de `tableHTML` cru.
- **Todo `render*`/loader do modal RECEBE `ctx = { view, gen, pane, host, line }`; nenhum lê
  `currentView`, `activeLine` ou `modalBody`.** É o contrato da Fase A (21/08/2026) — runbook
  completo em `docs/estrutura-frontend.md` §5, definição em `src/domain/view-state.mjs`
  (`makeCtx`/`withLine`/`withHost`/`nextGen`). Em uma frase: quem MONTA um ctx é o shell, em três
  pontos e só neles — `runView`, `reloadTab` (**são DUAS invocações de loader**, e mudar só a
  primeira faz o recarregamento ao vivo receber `undefined`) e o `run()` de cada painel de busca,
  todos via `novoCtx(view, pane, host)`, o único ponto que ainda lê `activeLine` para isso. Quem
  RECEBE é o documento, e por receber não tem como ler o global ERRADO depois de um `await`.
  Deriva-se com `withLine(ctx, linha)` (a linha que a busca resolveu, **mesma geração** — geração
  nova aqui devolve a corrida), `withHost(ctx, el)` e `nextGen(ctx)`; `beginGen` à mão dentro de um
  documento é regressão. `activeLine`/`currentView` continuam com mais de um escritor legítimo (o
  wiring de abas, as limpezas) e isso **fica**: o que acabou foi um documento os LER. Guardado por
  `scripts/check_corrida_abas.mjs`, o único gate que CRIA a ordenação do bug.
- **NUNCA atribua `currentView.pdfHTML` direto — use o seam do ciclo de vida da view:**
  `beginGen`/`commitViewResult`/`pushDetail`/`popDetail` (em `src/domain/view-state.mjs`,
  importados no topo do `app.js`; o `let currentView` a que eles se aplicam continua na seção
  `MODAL / SISTEMA DE VIEWS`). Todo loader/run/render que faz `await` e depois escreve um
  resultado usa o `view` e o `gen` que vieram no **ctx** (montado antes do seu próprio `await`) e
  troca a atribuição por `commitViewResult(view, gen, { pdfHTML: fn ou null })` — nunca relendo
  `currentView` no fim, porque uma escrita atrasada acertaria a view ERRADA, a que está aberta
  agora e não a dona da busca. Sem
  isso, uma resposta atrasada de uma busca/troca de linha anterior pode sobrescrever o resultado de
  uma busca mais nova (ex.: digitar "101", trocar pra "202" antes da 1ª resposta voltar → PDF sai
  da linha errada). `paginateTable` (`src/ui/paginacao.mjs`) e `paginateLines`/`lineResults`
  (`src/ui/listas.mjs`) escrevem `pdfHTML` DEPOIS do
  `await` de quem os chama — por isso recebem `view` e `gen` como opções em vez de capturar os
  próprios (capturar ali seria tarde demais, e um `view`/`gen` frescos ali dentro não identificam
  qual tentativa é a mais recente). Painéis com lista+detalhe (hoje só Portarias) usam
  `pushDetail`/`popDetail` em vez de `commitViewResult`, pra não perder o `pdfHTML`/busca da lista
  quando um item é aberto (bug original: `showPortaria` nunca reescrevia `pdfHTML`, então o PDF
  baixava a lista errada e o Realtime bouncava o usuário sem aviso). **`_panelRun` fica de fora do
  seam de propósito** — é só a referência à função de busca do painel (`if(view) view._panelRun =
  run;`), não é resultado de operação assíncrona, então não há janela de corrida a proteger. **A
  CASCA de um painel, porém, pode escrever depois de um `await`:** o loader de Portarias faz
  `await getPortariaAnos()` antes de pintar, e o que o protege é um `if (!isCurrentGen(view, gen))
  return;` explícito. **Esse guard tem de ser preservado** — sem ele uma tentativa velha religa o
  runner depois de uma troca de aba.
  **A pintura em TELA usa o mesmo guard, via `isCurrentGen(view, gen)`** (a mesma pergunta que
  `commitViewResult` faz, extraída porque `paginate`/`paginateEvents` também precisam dela):
  `paginate` (núcleo de `paginateTable`/`paginateLines`) e `paginateEvents` recebem `view`/`gen`
  e só escrevem `container.innerHTML` se `isCurrentGen` for `true` — descartando em silêncio a
  escrita inteira (nem tabela, nem PDF) quando a tentativa já está velha. Cliques de página
  (prev/next/ir) que rodam DEPOIS **não** reconferem — já pertencem ao commit vencedor; se uma
  busca mais nova tivesse ganho, o container nem teria sido escrito. Isso vale mesmo pra quem
  passa `pdf:false` (o guard da tela é independente de escrever PDF ou não) — todo call site de
  `paginateTable`/`paginateLines`/`lineResults`/`paginateEvents` passa `view`+`gen`, sem exceção.
- **Selecionar linha DENTRO do modal × `history.back()`:** `bindLineRows` faz `selectLine(...)`
  e logo `closeModal()`. O `selectLine` grava a linha nova por **replaceState — na entrada de
  histórico DO MODAL**; o `closeModal` desfazia essa entrada com `history.back()`, caindo na
  entrada PRÉ-modal, que não conhece a linha. O `hashchange` chamava `applyRoute`, que sem
  `linha/` no hash roda `setActiveLine(null)` — **apagando a seleção recém-feita**. Em card que
  não exige linha (Localidade, Ligações por Logradouro, Município e Região) o usuário não
  conseguia selecionar linha nenhuma por ali; com uma linha já ativa, a seleção **revertia em
  silêncio para a antiga**. Hoje o `closeModal` compara `activeLine` com `_lineAtPush` (gravado
  no `syncHash({push:true})`) e, **se a linha mudou com o modal aberto, usa `syncHash()` em vez
  de `history.back()`** — `replaceState` não dispara `hashchange`, então não há `applyRoute`
  para desfazer nada. Guardado por `scripts/check_selecao_linha.mjs`. **Ao mexer nesse trio,
  lembre: qualquer estado que a rota carrega e que mude com o modal aberto tem a mesma
  armadilha.**
- **Filtro de situação das listas de linha:** a barra Todas/Ativas/Canceladas tem **definição
  única**, em duas camadas — `situacaoSelectHTML()` (markup, em `src/ui/listas.mjs`) +
  `filtrarSituacao()` (regra, sobre `isLinhaAtiva`, em `src/domain/view-state.mjs`), usadas pelo
  `lineResults` e pelo `renderLocalidadeSecoes`. **Tela nova que lista linha usa
  esses dois**, não uma quarta cópia do `filter(r=>!r.cancelado…)`.
- **Clicar numa linha de qualquer lista passa por UM seam só:** `bindLineRows`
  (`src/ui/listas.mjs`) não sabe o que é selecionar uma linha — ele chama a ação que o
  `configurarListas({aoSelecionarLinha})` do bootstrap injetou, e que é composta no `app.js`
  (`selectLine` + `closeModal` + `toast`). **Tela nova não escreve o próprio `onclick` de linha**:
  usa `linhasTable`/`lineResults`, e o clique vem junto. Sem a configuração, `bindLineRows`
  **lança na hora de ligar** — de propósito: linha renderizada e não clicável é falha silenciosa,
  e falhar no clique deixaria o defeito passar por todo gate.
- **supabase-js vendorado:** para atualizar a versão: `npm pack @supabase/supabase-js@<v>`,
  extrair `dist/umd/supabase.js`, conferir a integridade contra o registro, trocar o arquivo em
  `vendor/` e a tag `<script src>` no `index.html`.
- **`sbFetch` tem timeout (20s) + retry** (backoff) para erros transitórios; erros definitivos
  (4xx) não repetem. Não remover isso ao refatorar.
- **NÃO duplicar busca/listagem — reusar os helpers:** `searchLines`/`lineSearchRun` (termo →
  linha ativa / 1 / N), `searchEmpresas` + `empresaChooserHTML`/`bindEmpresaRows` (busca e
  escolha de empresa) e `distinctCods`/`fetchLinesByCods` (codlinhas distintos → linhas +
  empresas). Copiar esses blocos cria cópias que divergem (bug que reaparece só em alguns cards).

## Agent skills

### Issue tracker

Issues vivem no GitHub Issues do repo (`LucasMolinari9/LucasCTEC`), via `gh` CLI. Ver
`docs/agents/issue-tracker.md`.

### Triage labels

Vocabulário padrão (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`). Ver `docs/agents/triage-labels.md`.

### Domain docs

Single-context — `CONTEXT.md` + `docs/adr/` na raiz do repo. Ver `docs/agents/domain.md`.


### Superpowers (skills de processo, vendorizadas)

As **14 skills do Superpowers** (upstream `obra/superpowers`) moram em `.claude/skills/`,
**dentro do git**, com provenance em `.claude/skills/.superpowers-manifest.json` (versão +
commit). São skills de *processo* — `brainstorming` antes de criar funcionalidade,
`test-driven-development`, `systematic-debugging`, `writing-plans`,
`verification-before-completion`, `requesting-code-review`, … — e convivem com a skill de
domínio deste repo (`db-change`), que **não** é do Superpowers e não é tocada pelo updater.

- **Por que vendorizado e não instalado como plugin:** plugin mora em `~/.claude/plugins/`,
  **fora do repo**, e a sessão web roda em container efêmero que só clona o repo — plugin some
  na sessão seguinte. Registrar o marketplace com `--scope project` **também não resolve**
  (medido em 03/08/2026: container com cache global vazio nasce com `"plugins": {}` e nenhuma
  skill `superpowers:`). O único mecanismo que carrega com estado global zero é
  `.claude/skills/<nome>/SKILL.md`.
- **Consequência prática: não há prefixo de namespace.** As skills chamam-se `brainstorming`,
  `test-driven-development`, … e **não** `superpowers:brainstorming`. O updater reescreve as
  referências cruzadas dentro dos `SKILL.md` para bater com isso — ao editar um deles à mão,
  não reintroduza o prefixo.
- **O hook é o que faz elas serem usadas:** `.claude/hooks/superpowers-session-start.sh`
  (ligado no `.claude/settings.json`, matcher `startup|clear|compact`) injeta o conteúdo da
  skill `using-superpowers` no contexto da sessão. Sem essa injeção as skills ficam instaladas
  e ninguém as invoca. Ele sai em silêncio se a cópia vendorizada não existir.
- **Atualizar:** `./scripts/update_superpowers.sh [ref]` — clona o upstream, troca a leva
  anterior (só o que o manifesto lista), reescreve o namespace e regrava o manifesto. Precisa
  de rede (github.com). Confira o diff antes de commitar.
- A contagem acima é conferida pelo `tests/check.js` §[2b] contra o manifesto: ao mudar a leva
  de skills, o gate cobra o número aqui e no comentário do hook.
- **Há um segundo conjunto de skills, de outra origem.** Além das 14 do Superpowers e da
  `db-change`, `.claude/skills/` contém **21 symlinks** para `.agents/skills/`, que hospeda
  skills vindas de `mattpocock/skills` e travadas por hash em `skills-lock.json` (raiz; 95
  arquivos versionados sob `.agents/`). Os dois conjuntos são independentes: o
  `update_superpowers.sh` remove só o que o manifesto do Superpowers lista, então nunca toca
  nestas — e o instalador delas (a skill `setup-matt-pocock-skills`) não toca nas do Superpowers.
  `.claude/skills/` tem, no total, **15 diretórios reais + 21 symlinks = 36 entradas** — número
  conferido pelo `tests/check.js` §[2b] contra o disco.

### Mudanças de banco

Toda alteração de schema deve ser uma migração em `supabase/migrations/` e passar por
`node scripts/check_migrations.mjs`. Tabela pública nova liga RLS e revoga anon/authenticated na
mesma migração. RPC anônima nova é proibida por padrão; a allowlist contém somente
`divat_busca_logradouro` e `divat_linhas_regiao`. Diagnósticos pertencem a `audit` e usam a
credencial PostgreSQL mínima descrita em `docs/planos/fase-3-hardening-moderado.md`.
