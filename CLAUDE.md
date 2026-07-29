# CLAUDE.md — Portal DIVAT (Cadastro de Linhas Regulares)

Contexto para qualquer sessão futura do Claude trabalhar neste projeto. Este arquivo descreve o
**estado atual + regras**; a cronologia de como se chegou aqui está em **`docs/CHANGELOG.md`**.

## O que é
Portal **público de consulta (somente leitura)** do DETRO/RJ · DIVAT. Os usuários buscam linhas
de ônibus e abrem documentos (itinerários, quadro de horários, tarifas, frota, histórico/eventos,
empresas, relatórios). Os dados são **alimentados pelo dono direto no Supabase**; o site apenas
exibe e **atualiza ao vivo** (Realtime).

## Arquitetura (importante)
- **Frontend = `index.html` (HTML) + `styles.css` (todo o CSS) + `app.js` (todo o JS, ~3,2k
  linhas, num IIFE)** — zero-build: sem framework, sem `package.json`, `<script src>` clássico no
  fim do `<body>`. Todo JS novo vai no `app.js` (o `tests/check.js` **falha** se aparecer
  `<script>` inline no `index.html` — a CSP publica `script-src 'self'` e bloquearia) e todo CSS
  novo vai em **classe no `styles.css`** (não em `style=""` no template). Há **rotas por hash**
  (`#/linha/<cod>`, `#/consulta/<view>`) — deep link e Voltar do navegador fecham o modal.
  Racional e regras de navegação: **`docs/estrutura-frontend.md`**.
- As consultas usam **REST do Supabase via `fetch`** (PostgREST). O **supabase-js** é usado **só**
  para o canal **Realtime** — é **vendorado** em `vendor/supabase-js-2.110.7.min.js` (versão
  fixa, mesma origem, sem CDN em runtime; ver Armadilhas para atualizar) e **injetado
  dinamicamente pelo `app.js`** (seção `REALTIME`; não há `<script>` dele no `index.html` — não
  bloqueia a primeira pintura).
- **Fontes vendoradas** em `vendor/fonts/` (Archivo, IBM Plex Mono/Sans — subset latin, dos
  pacotes `@fontsource` 5.3.0); `@font-face` no `<style>` do `index.html`. **Nenhum terceiro
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
  `manifest.webmanifest`, `vercel.json` e `vendor/`. Arquivo público novo (ícone, fonte) precisa
  ser reaberto lá, senão vira 404.

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `app.js`. A chave é a **anon (publishable)** — pública por
  design; a segurança vem do **RLS + privilégio mínimo** (anon só lê).
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
    up" = OFF). Pendente (só dashboard): ligar **Leaked Password Protection**.
  - **Manual de segurança do dono + auditoria/pentest** (linguagem direta, modelo de ameaça,
    checklist trimestral e resposta a incidente): **`docs/seguranca.md`**. Auditoria completa +
    teste de invasão ao vivo em 23/07/2026 (sem achados de segredo; sem caminho de escrita).
  - **Como o dono alimenta:** direto pelo **painel do Supabase** (service role, ignora RLS).
  - **Teto do PostgREST:** `pgrst.db_max_rows = 30000` no role `authenticator` (igual ao maior
    `limit` do front). **Ao criar query com `limit` > 30000, suba o teto junto**
    (`ALTER ROLE authenticator SET pgrst.db_max_rows = '<n>'; NOTIFY pgrst, 'reload config';`).
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
- `tabela_vista_teste` (cadastro de linhas) → busca, Ligações por Empresa, Empresas Regulares.
- `itinerario_teste` (+ `municipio_teste`) → Itinerários, Ligações por Logradouro/Município.
- `qh_intervalo_teste` / `qh_predeterminado_teste` (+ `origem_teste`) → Quadro de
  Horários, Ligações por Terminais.
- `qh_teste` (frota_*) → Frota, Estrutura.
- `tarifa_atual_teste` → Tarifas, Seções por Ligação/Empresa.
- `evento_teste` (+ `evento_empresa_teste`, `evento_linha_teste`) → Histórico.
- `localidades_teste` → Linhas por Localidade e Município.

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
| `SUPABASE CONFIG` | `sbFetch`, `fetchComTimeout`, `marcarTrunc`, `bannerTrunc`, `fmtCode/fmtTime/fmtDate`, `esc/enc/orDash` | Config SB + fetch com timeout/retry; helpers de formatação e escape (XSS). |
| `ÍCONES` | objeto `I` | SVGs dos ícones. |
| `SEÇÕES / CARDS` | array `SECTIONS` | Define os cards `[ícone, título, descrição, view, precisaLinha]`. |
| `RENDER CARDS` | `selectTopic`, `renderSideNav`, `renderSideContent` | Monta o **painel lateral** (sidebar de tópicos + painel de conteúdo) a partir de `SECTIONS`; `selectTopic` troca o tópico ativo (clique na sidebar, busca do topo e rota `#/topico/<key>`). |
| `STATE + CACHES` | `activeLine`, `*Map`, `getIbge/getOrigem/getEmpresas/getEvLookups` | Estado global e caches dos lookups. |
| `BUSCA DE LINHAS (hero)` | `doSearch`, `closeDropdown` | Busca do topo e dropdown de resultados. |
| `LINHA ATIVA — BANNER` | `selectLine`, `bannerEmpHTML` | Banner navy da linha selecionada. |
| `MODAL / SISTEMA DE VIEWS` | `runView` (dispatcher), `closeModal`, `setBody/loading/errorBox`, `baixarPdf`, `docHead`, `tableHTML`, `paginateEvents`, `matchEvent`, `beginGen`/`isCurrentGen`/`commitViewResult`/`pushDetail`/`popDetail` (seam do ciclo de vida da view), `renderBlankTab`/`renderTabChooser` (seletor de documentos da aba do "+"), todos os `render*` | **Maior bloco**: abre/preenche o modal e renderiza TODOS os documentos. |
| `COMPONENTES AUXILIARES` | `linhasTable`, `bindLineRows`, `searchPanel`, `lineResults`, `pageBounds`, `paginate`, `paginateTable`, `paginateLines` | Tabela de linhas + painel de busca reutilizável + **paginação de tela** (25/pág; ver `docs/estrutura-frontend.md` §4). |
| `CLIQUE NOS CARDS` | — | Liga o clique do card → abre a view. |
| `UTILITÁRIOS` | `groupBy`, `countBy`, `fmtMoney` | Agregação dos relatórios e moeda pt-BR. |
| `TOAST` | `toast` | Avisos transitórios. |
| `REALTIME` | `RT_TABLES`, `invalidateCaches`, `scheduleReload`/`reloadTab`, `markStale`, `tabMatchesEvent`, `dispatchRealtime`, `onRealtime`, `initRealtime` | Assina mudanças do Supabase e despacha por aba: a aba ativa recarrega ao vivo, as de segundo plano só ficam `stale` (recarregam ao serem reativadas). supabase-js injetado dinamicamente aqui. |
| `AUTO-ATUALIZAÇÃO` | `checarNovaVersao` | Detector de novo deploy (ETags de `index.html`, `app.js` e `styles.css`) que recarrega sozinho. |
| `ROTAS (hash)` | `syncHash`, `applyRoute` | Deep link (`#/linha/…`, `#/consulta/…`) e Voltar do navegador fechando o modal. |

A lógica **pura** dessas seções tem testes em `tests/` (cópias verbatim nos `*.harness.js`,
guardadas pelo `check.js`). Render/DOM e PDF não têm teste (exigiriam navegador).

## Publicação (Vercel) e atualização automática
- **Host: Vercel** (único host em uso). A ligação com o Supabase é toda **client-side**; o host
  só serve arquivos estáticos.
- **Config:** `vercel.json` (raiz) carrega os cabeçalhos de segurança — em especial a **CSP**,
  cujo `connect-src` autoriza os projetos Supabase de produção
  (`lwzsxuaqqeoamukduhev`) e teste (`gontnlfmothfglssbyyk`) em REST e Realtime.
  `app.js` mantém produção em allowlist: somente `divatdetro.vercel.app` usa produção; preview,
  localhost e hostname desconhecido usam teste. Configuração ausente falha fechado, sem fallback
  para produção. Ao mexer na CSP ou nessa matriz, rode também `tests/environment.test.js`.
- **Auto-deploy:** conectar o repo GitHub `LucasMolinari9/LucasCTEC` ao projeto Vercel pelo
  **dashboard** (OAuth, ação única) → **push na `main` = deploy** (e **push em branch = preview
  deploy**, use-o). Sem essa conexão, publica-se rodando o MCP `deploy_to_vercel` após o push.
- **Atualização automática para todos os usuários** (sem limpar cache):
  1. `Cache-Control: public, max-age=0, must-revalidate` (no `vercel.json`) → cada visita
     revalida (`index.html` **e** `app.js`).
  2. Detector de versão (`checarNovaVersao` no `app.js`): compara os **ETags** de `/index.html`,
     `/app.js` e `/styles.css` a cada ~3 min e ao focar a aba; se mudou, recarrega sozinho
     (espera fechar o modal aberto). Arquivo estático novo de primeira ordem → entra na lista.
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
   `main` (que é a publicada). O CI roda **quatro workflows** no seu diff, separados de
   propósito (um vermelho não esconde o outro): `ci.yml` (gate leve — `tests/check.js`),
   `views.yml` (navegador — `check_views.mjs` + `check_abas.mjs`), `semgrep.yml` (estático) e
   `deploy-smoke.yml` depois que a Vercel publica (headers, allowlist e isolamento do Supabase).
   Os outros três (`deriva.yml`, `db-checks.yml`, `backup.yml`) são de cron, e só entram no seu
   diff se ele tocar os arquivos que eles vigiam.
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
2a. **Ao mexer em qualquer render/loader, rode `node scripts/check_views.mjs`** — abre as **17
   views** num navegador headless e falha se alguma explodir (`errorBox`), ficar presa no
   spinner, pintar só a moldura ou não achar nada com um termo que casa as fixtures. É a rede
   sob a seção `MODAL / SISTEMA DE VIEWS` (~58,8% do `app.js`), que o `check.js` **não** cobre —
   ele só testa a lógica pura copiada nos `*.harness.js`. Aceita filtro: `check_views.mjs frota`.
   Ele **não** confere se o conteúdo está certo (isso é asserção por view, ainda não existe).
   **View nova = uma entrada em `VIEWS` no script** — a checagem anti-drift do final compara a
   lista com os `data-view` do seletor e falha se você esquecer.
   Servidor + fixtures + Chromium moram em **`scripts/lib/rig.mjs`**, compartilhados com o
   `check_abas.mjs`. **Ao mudar um `select=` do `app.js`, ajuste a fixture junto**: nome de
   coluna divergente chega `undefined` no render e a tela fica vazia *sem erro* — falso verde.
   Caminho de dado novo por **RPC** (`rpc/…`) precisa de stub em `serveRpc`, senão a view
   responde vazio e o laço acusa defeito que é da bancada, não do portal.
   **No CI:** o workflow **`.github/workflows/views.yml`** roda os dois scripts de navegador em
   todo push/PR (job separado do `check`, que continua leve e sem dependências; Playwright em
   **versão fixa** — subir é decisão, não efeito colateral). Rodar localmente antes do push
   continua valendo: dá o veredito em ~40 s, sem esperar o runner instalar o Chromium.
2b. **Análise estática — `./scripts/semgrep.sh`** (Semgrep). Complementa o `check.js`, não
   substitui: o `check.js` pergunta "faz o que deve?" (compila o `app.js` e roda a lógica
   pura), o Semgrep pergunta "contém padrão proibido?". Pega o que só quebraria no navegador
   do usuário — `eval`/`new Function` (a CSP é `script-src 'self'`, sem `'unsafe-eval'`, e o
   `check.js` só COMPILA, não executa), CDN externo em runtime e atribuição direta a
   `currentView.pdfHTML` (fora do seam). O modo padrão usa só as regras locais
   (`.semgrep/rules/`) e roda **offline**; `--full` soma os rulesets do registry e **precisa
   de rede** (bloqueada no ambiente do Claude — igual ao `vercel` CLI; lá rode sem `--full`).
   O CI (`.github/workflows/semgrep.yml`) roda as duas metades. Runbook e como escrever regra
   nova: **`docs/semgrep.md`**.
2c. **Deriva docs×banco — `node scripts/check_deriva.mjs`** (precisa de rede; irmão do
   `check_realtime.mjs`, mesma anon key do `app.js`). Compara a visão de `anon` do banco
   (RPC `divat_api_shape()` — o OpenAPI do PostgREST deste projeto é restrito à service_role)
   com o que o repo afirma: toda tabela citada no `CLAUDE.md`/`docs/schema.md` existe no banco;
   toda coluna do diagrama mermaid do `docs/schema.md` existe na tabela real; toda RPC chamada
   no `app.js` existe e responde a `anon`; toda RPC exposta está documentada no `schema.md`.
   Nasceu da auditoria de 26/07/2026 (8 divergências, todas de fato copiado à mão e nunca mais
   conferido). Roda no CI (workflow `deriva.yml`): **semanal + sob demanda + push/PR** que
   toque esses arquivos — o cron existe porque deriva também nasce de mudança NO BANCO, que
   não gera push. Do ambiente do Claude não roda (rede até o Supabase bloqueada); é para a
   máquina do dono e o CI. Fica **fora** do `tests/check.js` (contrato dele: offline).
2d. **Deriva docs×código — seção `[2b]` do `tests/check.js`** (offline, roda no gate de sempre).
   Irmã do `check_deriva.mjs`: ele guarda docs×**banco**, esta guarda docs×**código** — o eixo
   que ficava descoberto. Nasceu da auditoria externa de 27/07/2026, que achou 6 derivas
   plantadas pela extração de 21-22/07 (o README ainda anunciava "um único arquivo `index.html`
   com CSS e JS embutidos" e `supabase-js` vindo de CDN; o runbook de restauração mandava editar
   `SB_URL`/`SB_KEY` no `index.html`; <!-- deriva-ok: reconta o bug --> duas contagens erradas; dois docs terminando com
   `</content>` vazado). **Extração de arquivo é exatamente o tipo de mudança que esquece a
   prosa que menciona o arquivo antigo** — e nenhuma ferramenta do repo era capaz de ver isso.
   Ela cobra 4 coisas nos **docs vivos** (o `CHANGELOG`, os `analise-*.md` e os
   `revisao-externa-*.md` ficam fora de propósito: são snapshots datados): (1) **fatos numéricos**
   declarados na prosa batem com o código — linhas do `app.js`, tamanho/percentual da seção
   `MODAL`, nº de views do `check_views.mjs`, `RT_TABLES`, tabelas do `backup_rest.mjs` (tolerância
   de 8% nos "~Nk" e 1,5 ponto nos "~N%", para arredondamento não virar alarme). **Desde
   30/07/2026 essa conferência varre também os comentários de `.github/workflows/*.yml`** — só
   ela, não as outras três: comentário de workflow é prosa viva que ninguém relê (não abre em
   leitor de markdown), e foi por isso que o `views.yml` pôde afirmar "23 views" e "~62% do
   app.js" com o gate verde (achado D da auditoria de 30/07). **Toda ocorrência é conferida, não
   só a primeira** — a frase das views aparecia em três linhas do mesmo arquivo, e consertar uma
   delas não pode bastar para o gate passar; (2) todo **link
   markdown** resolve; (3) `SB_URL`/`SB_KEY` **nunca** aparecem na mesma linha que `index.html` <!-- deriva-ok: enuncia a regra -->;
   (4) nenhum arquivo termina com **tag de ferramenta de IA vazada**. Se você mudar uma frase que
   carrega número, o gate cobra o número — **atualize o número, não apague a guarda** (se a frase
   mudou de forma, ajuste o regex na tabela `FATOS`). Ela é deliberadamente estreita: a 1ª versão
   varria todo token em backtick e deu 61 falsos positivos contra 0 verdadeiros.
2e. **Qualidade dos dados pós-ETL — `node scripts/check_data_quality.mjs`** (precisa de rede;
   chama a RPC `divat_data_quality()` como `anon`). Fecha a issue #63. Roda semanal no workflow
   `db-checks.yml`, que **também passou a rodar o `check_realtime.mjs`** — ele existia desde
   sempre e não estava em nenhum workflow, só rodava se alguém lembrasse.
   **A integridade hub-and-spoke JÁ ESTÁ VIOLADA no banco** (medido em 27/07/2026): há **17
   codlinhas órfãs** — filhos em `itinerario_teste` (2), `qh_teste` (3),
   `qh_predeterminado_teste` (5) e `evento_teste` (7) apontando para `codlinha` que não existe
   em `tabela_vista_teste` — mais **4 linhas** de `qh_predeterminado_teste` com `cod_origem`
   inexistente em `origem_teste`. `146016000` e `191020001` aparecem órfãos em **três** tabelas
   cada. **Consequência prática: as views dessas linhas renderizam VAZIAS, sem erro** — é
   exatamente o modo de falha que a issue #63 descreve, já acontecendo.
   (U+FFFD e `codempresa` inválida: zero achados, os dois limpos.)
   **Órfã não quer dizer a mesma coisa em toda tabela** (apurado em 27/07/2026, contra o banco):
   as 7 de `evento_teste` são **atos reais de 1974–1996**, da época do DTC/RJ, de linhas
   anteriores ao cadastro atual — e linha extinta **não some** do cadastro (o hub tem a coluna
   `cancelado`, com **500 linhas** marcadas assim), então órfã em `evento_teste` não é rastro de
   exclusão, é história mais velha que o cadastro. Por isso o `check_data_quality.mjs`
   **rebaixa `evento_teste` órfã a aviso** (`REBAIXADOS_A_AVISO`, no próprio script — a RPC
   *mede* o fato, a *política* de severidade fica versionada no repo) e mantém as demais como
   erro. **NÃO apagar os filhos órfãos de `evento_teste`: é arquivo institucional
   insubstituível.** O preço do rebaixamento é conhecido e aceito: achado **novo** em
   `evento_teste` também sai como aviso e não derruba o gate — inclusive `186006400`, evento de
   2021 com sufixo anômalo (o hub tem `186006000`/`186006001`), **suspeito de digitação**.
   As 12 codlinhas órfãs estão listadas **uma a uma e classificadas** em `orfaos_conhecidos`
   dentro do `data_quality_baseline.json` (a RPC agrega e não diz *quais*; o campo é mantido à
   mão e o `--atualizar-baseline` o preserva). **O gate compara CONTAGEM, não a lista** — uma
   órfã corrigida e outra criada mantêm o número e passam despercebidas; ao mexer nesses dados,
   confira a lista, não só o número.
   Por isso o script tem **baseline** (`scripts/data_quality_baseline.json`): gate vermelho desde
   o primeiro dia é gate que se aprende a ignorar, e apagar achado seria mentir. Ele passa com a
   dívida conhecida e falha no instante em que aparece achado **novo** ou um conhecido **piora**.
   O baseline é dívida registrada, não perdão — ao consertar dado, rode
   `--atualizar-baseline` para o gate voltar a apertar; para ver o estado cru, `--sem-baseline`.
   **Atenção:** `qtd` não tem unidade única — em `codlinha_orfa` é `count(distinct codlinha)`,
   nas outras verificações é `count(*)` de linhas (a saída rotula qual é qual).
3. Merge na `main` → republica sozinho (ou MCP `deploy_to_vercel`). As telas dos usuários se
   atualizam via detector de versão. Bumpe o carimbo se quiser confirmar a chegada.
4. Mudanças de **dados** NÃO exigem deploy — o site lê o Supabase ao vivo.

## Backup (leia antes de qualquer coisa destrutiva no banco)
- Plano **Free (NANO)** — sem PITR automático (só no Pro). A rede de segurança tem 3 camadas
  (runbook completo: **`docs/backup.md`**):
  1. **Automática:** `.github/workflows/backup.yml` roda semanal (e sob demanda) o
     `scripts/backup_rest.mjs` em **modo público** (anon key, 14 tabelas públicas, sem staging);
     artifact do Actions por 90 dias.
  2. **Manual (completa):** `pg_dump` (padrão-ouro) ou `backup_rest.mjs` com service key
     (18 tabelas) ou 18 CSVs pelo Table Editor — sempre **FORA do git** (dados no repo =
     vazamento; o git versiona só CÓDIGO).
  3. **Estrutura:** `docs/backup_schema.sql` (versionado). Mapa relacional: `docs/schema.md`.
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
- **Staging do ETL (não lidas pelo portal):** `evento_dados` + `evento_textos` montam
  `evento_teste`; `portaria_data` + `portaria_texto_teste` montam `portaria_teste`. RLS ligado
  **sem policy** e **sem grant** → invisíveis pela API pública, de propósito (o lint
  `rls_enabled_no_policy` nelas é **esperado**). Alimentação via service role (painel).
  **Correção de dado em tabela final deve ser replicada na staging correspondente** (senão o
  rebuild do ETL desfaz).
- **Truncagem silenciosa:** a maioria dos loaders avisa via `marcarTrunc`/`bannerTrunc`, mas
  cortes por `slice(0,N)` no cliente **perdem** a flag não-enumerável `_trunc` (o `slice` não a
  copia). Ao criar/editar view que faz `slice` no cliente, **reponha a flag** (ou avise o
  usuário) quando o limite for atingido.
- **Paginação é SÓ de tela; o PDF sai INTEIRO:** listas longas são paginadas (25/pág) por
  `paginateTable`/`paginateLines` (núcleo `paginate` + `pageBounds`). Como só a fatia atual
  entra no DOM, o fallback do `baixarPdf` exportaria só a página aberta — por isso os wrappers
  **escrevem `pdfHTML` (via `commitViewResult`) com a lista completa**. Quem tem PDF próprio mais
  rico passa **`pdf:false`** (Quadro "por empresa"; Município). Detalhes: `docs/estrutura-frontend.md`
  §4. Em tela nova que lista muita coisa, **use esses helpers** em vez de `tableHTML` cru.
- **NUNCA atribua `currentView.pdfHTML` direto — use o seam do ciclo de vida da view:**
  `beginGen`/`commitViewResult`/`pushDetail`/`popDetail` (declarados logo após `let currentView`,
  seção `MODAL / SISTEMA DE VIEWS`). Todo loader/run/render que faz `await` e depois escreve um
  resultado captura `const view = currentView, gen = beginGen(view);` **antes** do seu próprio
  `await`, e troca a atribuição por `commitViewResult(view, gen, { pdfHTML: fn ou null })` — usando
  o `view` CAPTURADO, nunca `currentView` de novo (se reler `currentView` no fim, uma escrita
  atrasada pode acertar a view ERRADA, a que está aberta agora, não a que a busca pertencia). Sem
  isso, uma resposta atrasada de uma busca/troca de linha anterior pode sobrescrever o resultado de
  uma busca mais nova (ex.: digitar "101", trocar pra "202" antes da 1ª resposta voltar → PDF sai
  da linha errada). `paginateTable`/`paginateLines`/`lineResults` escrevem `pdfHTML` DEPOIS do
  `await` de quem os chama — por isso recebem `view` e `gen` como opções em vez de capturar os
  próprios (capturar ali seria tarde demais, e um `view`/`gen` frescos ali dentro não identificam
  qual tentativa é a mais recente). Painéis com lista+detalhe (hoje só Portarias) usam
  `pushDetail`/`popDetail` em vez de `commitViewResult`, pra não perder o `pdfHTML`/busca da lista
  quando um item é aberto (bug original: `showPortaria` nunca reescrevia `pdfHTML`, então o PDF
  baixava a lista errada e o Realtime bouncava o usuário sem aviso). **`_panelRun` fica de fora do
  seam de propósito** — é só a referência à função de busca do painel, atribuída uma vez,
  **antes** de qualquer `await`, direto de dentro do loader (`if(currentView) currentView._panelRun
  = run;`); não é resultado de operação assíncrona, então não há janela de corrida a proteger.
  **A pintura em TELA usa o mesmo guard, via `isCurrentGen(view, gen)`** (a mesma pergunta que
  `commitViewResult` faz, extraída porque `paginate`/`paginateEvents` também precisam dela):
  `paginate` (núcleo de `paginateTable`/`paginateLines`) e `paginateEvents` recebem `view`/`gen`
  e só escrevem `container.innerHTML` se `isCurrentGen` for `true` — descartando em silêncio a
  escrita inteira (nem tabela, nem PDF) quando a tentativa já está velha. Cliques de página
  (prev/next/ir) que rodam DEPOIS **não** reconferem — já pertencem ao commit vencedor; se uma
  busca mais nova tivesse ganho, o container nem teria sido escrito. Isso vale mesmo pra quem
  passa `pdf:false` (o guard da tela é independente de escrever PDF ou não) — todo call site de
  `paginateTable`/`paginateLines`/`lineResults`/`paginateEvents` passa `view`+`gen`, sem exceção.
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


### Mudanças de banco

Toda alteração de schema deve ser uma migração em `supabase/migrations/` e passar por
`node scripts/check_migrations.mjs`. Tabela pública nova liga RLS e revoga anon/authenticated na
mesma migração. RPC anônima nova é proibida por padrão; a allowlist contém somente
`divat_busca_logradouro` e `divat_linhas_regiao`. Diagnósticos pertencem a `audit` e usam a
credencial PostgreSQL mínima descrita em `docs/planos/fase-3-hardening-moderado.md`.
