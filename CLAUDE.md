# CLAUDE.md — Portal DIVAT (Cadastro de Linhas Regulares)

Contexto para qualquer sessão futura do Claude trabalhar neste projeto. Este arquivo descreve o
**estado atual + regras**; a cronologia de como se chegou aqui está em **`docs/CHANGELOG.md`**.

## O que é
Portal **público de consulta (somente leitura)** do DETRO/RJ · DIVAT. Os usuários buscam linhas
de ônibus e abrem documentos (itinerários, quadro de horários, tarifas, frota, histórico/eventos,
empresas, relatórios). Os dados são **alimentados pelo dono direto no Supabase**; o site apenas
exibe e **atualiza ao vivo** (Realtime).

## Arquitetura (importante)
- **Frontend = `index.html` (HTML) + `styles.css` (todo o CSS) + `app.js` (todo o JS, ~2,3k
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
  **`script-src 'self'`** (sem `unsafe-inline` de script) e **`font-src 'self'`**; o `style-src`
  mantém `'unsafe-inline'` (CSS embutido, decisão consciente).

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `app.js`. A chave é a **anon (publishable)** — pública por
  design; a segurança vem do **RLS + privilégio mínimo** (anon só lê).
- **RLS / segurança (LER COM ATENÇÃO):**
  - Todas as tabelas têm RLS ligado; cada tabela de consulta tem policy `anon_read_*` (SELECT).
  - O portal é **read-only de verdade**: `anon` e `authenticated` têm **apenas SELECT** — toda
    escrita foi revogada e um `ALTER DEFAULT PRIVILEGES` garante que tabelas novas não voltem a
    conceder. **Não há caminho de escrita pela API pública.**
  - **NUNCA conceda escrita (GRANT nem policy de INSERT/UPDATE/DELETE) a `anon`/`authenticated`.**
    Se um dia precisar de edição logada legítima, crie policy **restrita por tabela/coluna** —
    nunca `ALL USING(true)`.
  - **Signup do Auth: manter FECHADO** (Dashboard → Authentication → "Allow new users to sign
    up" = OFF). Pendente (só dashboard): ligar **Leaked Password Protection**.
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
- `tabela_vista_teste` (cadastro de linhas) → busca, Folha de Rosto, Ligações por Empresa/
  Nome/Número, Empresas Regulares, Relatórios.
- `itinerario_teste` (+ `cod_ibge_teste`) → Itinerários, Ligações por Logradouro/Município.
- `qh_intervalo_teste` / `qh_predeterminado_teste` (+ `tab_origem_teste`) → Quadro de
  Horários, Ligações por Terminais.
- `qh_teste` (frota_*) → Frota, Estrutura.
- `tarifa_atual_teste` → Tarifas, Seções por Ligação/Empresa.
- `evento_teste` (+ `evento_empresa_teste`, `evento_linha_teste`) → Histórico, Pesquisa de Evento.
- `localidades_teste` → Linhas por Localidade e Município.

## Como o Realtime funciona no código
- Cada card abre uma "view": `runView({ title, tables:[...], lineFilter, loader })`.
- Um canal assina `postgres_changes` de todas as tabelas (`RT_TABLES`). Quando chega evento de
  tabela que a view aberta usa (`VIEW_TABLES`/`tables`) e bate o filtro de linha ativa, o
  `loader()` (ou `_panelRun` dos painéis de busca) roda de novo, com debounce.
  **`VIEW_TABLES` deve listar TODAS as tabelas que o loader lê — inclusive as lidas por baixo
  via lookups** (`getEmpresas→codempresa_teste`, `getIbge→municipio_teste`,
  `getOrigem→origem_teste`, `getEvLookups→evento_empresa_teste/evento_linha_teste`). Se faltar
  uma, mudanças nela não recarregam a tela. Obs.: `searchPanel(...)` **não** recebe `tables` —
  quem controla é o `VIEW_TABLES[view]` usado no `runView`.
- Atualiza **a tela aberta**. Quem não está com o card aberto vê o dado novo na próxima busca.

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
| `MODAL / SISTEMA DE VIEWS` | `runView` (dispatcher), `closeModal`, `setBody/loading/errorBox`, `baixarPdf`, `docHead`, `tableHTML`, `paginateEvents`, `matchEvent`, `beginGen`/`isCurrentGen`/`commitViewResult`/`pushDetail`/`popDetail` (seam do ciclo de vida da view), todos os `render*` | **Maior bloco**: abre/preenche o modal e renderiza TODOS os documentos. |
| `COMPONENTES AUXILIARES` | `linhasTable`, `bindLineRows`, `searchPanel`, `lineResults`, `pageBounds`, `paginate`, `paginateTable`, `paginateLines` | Tabela de linhas + painel de busca reutilizável + **paginação de tela** (25/pág; ver `docs/estrutura-frontend.md` §4). |
| `CLIQUE NOS CARDS` | — | Liga o clique do card → abre a view. |
| `UTILITÁRIOS` | `groupBy`, `countBy`, `fmtMoney` | Agregação dos relatórios e moeda pt-BR. |
| `TOAST` | `toast` | Avisos transitórios. |
| `REALTIME` | `RT_TABLES`, `invalidateCaches`, `scheduleReload`, `rowMatchesActiveLine`, `onRealtime`, `initRealtime` | Assina mudanças do Supabase e recarrega a tela aberta (supabase-js injetado dinamicamente aqui). |
| `AUTO-ATUALIZAÇÃO` | `checarNovaVersao` | Detector de novo deploy (ETags de `index.html`, `app.js` e `styles.css`) que recarrega sozinho. |
| `ROTAS (hash)` | `syncHash`, `applyRoute` | Deep link (`#/linha/…`, `#/consulta/…`) e Voltar do navegador fechando o modal. |

A lógica **pura** dessas seções tem testes em `tests/` (cópias verbatim nos `*.harness.js`,
guardadas pelo `check.js`). Render/DOM e PDF não têm teste (exigiriam navegador).

## Publicação (Vercel) e atualização automática
- **Host: Vercel** (único host em uso). A ligação com o Supabase é toda **client-side**; o host
  só serve arquivos estáticos.
- **Config:** `vercel.json` (raiz) carrega os cabeçalhos de segurança — em especial a **CSP**,
  cujo `connect-src` autoriza `lwzsxuaqqeoamukduhev.supabase.co` (REST) e `wss://…` (Realtime).
  Ao mexer na CSP, edite o `vercel.json`.
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
   `main` (que é a publicada). O CI (`.github/workflows/ci.yml`) roda o gate em todo push.
2. **Antes de publicar, rode `node tests/check.js`** — valida a sintaxe do `app.js`, garante que
   não voltou `<script>` inline no `index.html`, confere as cópias de teste (anti-drift) e roda
   todos os testes. Só publique tudo verde. (Ao alterar função com cópia em `tests/*.harness.js`,
   atualize a cópia.)
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
