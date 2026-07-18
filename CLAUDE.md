# CLAUDE.md — Portal DIVAT (Cadastro de Linhas Regulares)

Contexto para qualquer sessão futura do Claude trabalhar neste projeto.

## O que é
Portal **público de consulta (somente leitura)** do DETRO/RJ · DIVAT. Os usuários
buscam linhas de ônibus e abrem documentos (itinerários, quadro de horários, tarifas,
frota, histórico/eventos, empresas, relatórios). Os dados são **alimentados pelo dono
direto no Supabase**; o site apenas exibe e **atualiza ao vivo** (Realtime).

## Arquitetura (importante)
- **Frontend = um único arquivo: `index.html`** — auto-contido, com **CSS e JS embutidos**.
  Não há build, nem framework, nem `package.json`. É só servir o arquivo estático.
- As consultas usam **REST do Supabase via `fetch`** (PostgREST). O **supabase-js** é usado **só**
  para o canal **Realtime** — e é **vendorado** em `vendor/supabase-js-2.110.7.min.js` (versão fixa,
  mesma origem, sem CDN nem terceiro em runtime; ver Armadilhas).
- O botão **PDF** (na barra do modal, ao lado de Imprimir) monta o documento **completo** (sem a
  paginação de tela) num container oculto `.pdf-export` e usa a **impressão nativa** do navegador
  (`window.print()`, vetorial) para o usuário "Salvar como PDF" — sem dependência externa de PDF.
- `vercel.json` define os cabeçalhos de segurança (CSP etc.) e `Cache-Control: must-revalidate`.

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `<script>` em `index.html`. A chave é a **anon
  (publishable)** — pública por design; a segurança vem do **RLS + privilégio mínimo** (anon só lê).
- **RLS / segurança (LER COM ATENÇÃO):**
  - Todas as tabelas têm RLS ligado. Cada tabela de consulta tem policy `anon_read_*` (SELECT) para `anon`.
  - **Postura atual — endurecida em 26/06/2026 (auditoria de segurança):** o portal é **read-only de
    verdade**. `anon` e `authenticated` têm **apenas SELECT** — toda escrita (INSERT/UPDATE/DELETE/TRUNCATE/
    REFERENCES/TRIGGER) foi **revogada** desses papéis, e um `ALTER DEFAULT PRIVILEGES` garante que **tabelas
    novas não voltem a conceder escrita** a eles. **Não há mais caminho de escrita pela API pública.**
  - **Defesa em profundidade:** mesmo que o RLS de uma tabela caia por engano, não existe grant de escrita
    para o público explorar. Ainda assim, **mantenha o RLS ligado** e **NUNCA conceda escrita (GRANT nem
    policy de INSERT/UPDATE/DELETE) a `anon`/`authenticated`** — foi exatamente o que se removeu nesta auditoria.
  - **`auth_all_*` REMOVIDAS:** as 16 policies `auth_all_*` (ALL `USING(true) WITH CHECK(true)`) que davam
    escrita total a qualquer usuário logado foram **dropadas** na mesma auditoria. Logo, `authenticated`
    também não escreve mais via API. Se um dia precisar de edição logada legítima, crie policy **restrita por
    tabela/coluna** — nunca `ALL USING(true)`.
  - **Signup do Auth:** manter **FECHADO** (Dashboard → Authentication → Sign In/Providers → "Allow new users
    to sign up" = OFF) segue sendo boa prática (1 usuário, o do dono), mas **já não é a única barreira** — com
    as `auth_all_*` removidas, nem um usuário logado escreve. Pendente (só dashboard): ligar **Leaked Password
    Protection** (Authentication → Password).
  - **Como o dono alimenta:** direto pelo **painel do Supabase** (service role, ignora RLS e **não** foi
    afetado pela remediação) — esse é o fluxo real. O frontend logado (`authenticated`) **não** é usado para
    alimentar e, após a remoção das `auth_all_*`, tampouco teria permissão de escrita.
  - **Rollback / snapshot de segurança (reproduzível):** a baseline **segura** de reconstrução (RLS/
    policies/grants/índices/funções) está **versionada** em `docs/backup_schema.sql`. Para um snapshot do
    estado **atual** (auditoria/DR), rode `scripts/gen_security_snapshot.sql` — a saída **é** o snapshot,
    sempre regenerável (salve como `divat_security_snapshot_AAAA-MM-DD.sql`, **fora do git**). Assim o
    snapshot nunca mais "se perde". O snapshot pré-endurecimento de 26/06/2026 é **obsoleto** — restaurá-lo
    reabriria as brechas fechadas na auditoria; não use como caminho de rollback.
- **Realtime**: as 14 tabelas lidas pelo portal estão na publicação `supabase_realtime`
  (endurecido em 16/07/2026 — 6 tabelas centrais faltavam e a atualização ao vivo estava
  quebrada; ver auditoria). Ao criar um card que lê uma tabela nova, faça **as duas coisas**:
  (1) **adicione-a à publicação** (`alter publication supabase_realtime add table public.<tabela>;`)
  e (2) **inclua-a em `RT_TABLES` e no `VIEW_TABLES` da view** no `index.html`. O teste offline
  `tests/realtime.test.js` guarda os itens do lado do JS (`VIEW_TABLES ⊆ RT_TABLES`); a **checagem
  viva** contra o banco é `scripts/check_realtime.mjs` (compara `RT_TABLES` com a publicação via a
  função RPC `realtime_tables()`; rode-o depois de mexer no Realtime).

## Tabelas → onde aparecem (cards)
- `tabela_vista_teste` (cadastro de linhas) → busca, Folha de Rosto, Ligações por Empresa/
  Nome/Número, Empresas Regulares, Relatórios.
- `itinerario_teste` (+ `cod_ibge_teste`) → Itinerários, Ligações por Logradouro/Município.
- `qh_intervalo_teste` / `qh_predeterminado_teste` (+ `tab_origem_teste`) → Quadro de
  Horários, Ligações por Terminais.
- `qh_teste` (frota_*) → Frota, Estrutura.
- `tarifa_atual_teste` → Tarifas, Seções por Ligação/Empresa.
- `evento_teste` (+ `evento_empresa_teste`, `evento_linha_teste`) → Histórico, Pesquisa de
  Evento.
- `localidades_teste` → Linhas por Localidade e Município.

## Como o Realtime funciona no código
- Cada card abre uma "view": `runView({ title, tables:[...], lineFilter, loader })`.
- Um canal assina `postgres_changes` de todas as tabelas (`RT_TABLES`). Quando chega um
  evento de uma tabela que a view aberta usa (`VIEW_TABLES`/`tables`) e bate o filtro de
  linha ativa, o `loader()` (ou `_panelRun` dos painéis de busca) roda de novo, com debounce.
  **`VIEW_TABLES` deve listar TODAS as tabelas que o loader lê — inclusive as lidas por baixo
  via lookups** (`getEmpresas→codempresa_teste`, `getIbge→municipio_teste`, `getOrigem→origem_teste`,
  `getEvLookups→evento_empresa_teste/evento_linha_teste`). Se faltar uma, mudanças nela não
  recarregam a tela (foi o bug corrigido em 16/07/2026). Obs.: `searchPanel(...)` **não** recebe
  `tables` — quem controla é o `VIEW_TABLES[view]` usado no `runView` (os args `tables:[...]` mortos
  que sobravam nas chamadas de `searchPanel` foram removidos em 17/07/2026).
- Atualiza **a tela aberta**. Quem não está com o card aberto vê o dado novo na próxima busca.

## Mapa do código (`index.html`)
O JS é um arquivo só (~2.400 linhas), mas está dividido em seções com marcas
`/* ===== TÍTULO ===== */`. **Para achar algo, dê grep na marca da seção** (ela não
muda de lugar como número de linha muda). Há um **índice no topo do `<script>`** e o bloco
`MODAL / SISTEMA DE VIEWS` (o maior) tem **sub-índice + sub-marcas `/* --- … --- */`** por
documento. Guia completo de navegação e as **regras de segurança para reorganizar o JS**
(hoisting, TDZ, ordem do `LOADERS`, verificação em 3 camadas) em **`docs/estrutura-frontend.md`**.
Visão geral:

| Seção (faça grep do título) | Funções-chave | O que faz |
|---|---|---|
| `SUPABASE CONFIG` | `sbFetch`, `fetchComTimeout`, `marcarTrunc`, `bannerTrunc`, `fmtCode/fmtTime/fmtDate`, `esc/enc/orDash` | Config SB + fetch com timeout/retry; helpers de formatação e escape (XSS). |
| `ÍCONES` | objeto `I` | SVGs dos ícones. |
| `SEÇÕES / CARDS` | array `SECTIONS` | Define os cards `[ícone, título, descrição, view, precisaLinha]`. |
| `RENDER CARDS` | — | Monta os cards da home a partir de `SECTIONS`. |
| `STATE + CACHES` | `activeLine`, `*Map`, `getIbge/getOrigem/getEmpresas/getEvLookups` | Estado global e caches dos lookups. |
| `BUSCA DE LINHAS (hero)` | `doSearch`, `closeDropdown` | Busca do topo e dropdown de resultados. |
| `LINHA ATIVA — BANNER` | `selectLine`, `bannerEmpHTML` | Banner navy da linha selecionada. |
| `MODAL / SISTEMA DE VIEWS` | `runView` (dispatcher), `closeModal`, `setBody/loading/errorBox`, `baixarPdf`, `docHead`, `tableHTML`, `paginateEvents`, `matchEvent`, todos os `render*` | **Maior bloco**: abre/preenche o modal e renderiza TODOS os documentos (itinerário, quadro, frota, tarifas, histórico, empresas, municípios, localidades). |
| `COMPONENTES AUXILIARES` | `linhasTable`, `bindLineRows`, `searchPanel`, `lineResults`, `pageBounds`, `paginate`, `paginateTable`, `paginateLines` | Tabela de linhas + painel de busca reutilizável + **paginação de tela** (25/pág; ver `docs/estrutura-frontend.md` §4). |
| `CLIQUE NOS CARDS` | — | Liga o clique do card → abre a view. |
| `UTILITÁRIOS` | `groupBy`, `countBy`, `fmtMoney` | Agregação dos relatórios e moeda pt-BR. |
| `TOAST` | `toast` | Avisos transitórios. |
| `REALTIME` | `RT_TABLES`, `invalidateCaches`, `scheduleReload`, `rowMatchesActiveLine`, `onRealtime` | Assina mudanças do Supabase e recarrega a tela aberta. |
| `AUTO-ATUALIZAÇÃO` | `checarNovaVersao` | Detector de novo deploy (ETag) que recarrega sozinho. |

A lógica **pura** dessas seções (formatação, busca, filtros, `sbFetch`) tem testes em
`tests/` — veja a próxima seção. Render/DOM e PDF não têm teste (exigiriam navegador).

## Publicação (Vercel) e atualização automática
- **Host: Vercel** (único host em uso). A ligação com o Supabase é toda **client-side** (REST/
  Realtime via `SB_URL`/`SB_KEY` no `index.html`); o host só serve o arquivo estático.
- **Config do Vercel:** `vercel.json` (na raiz) carrega os cabeçalhos de segurança — em especial a
  **CSP**, cujo `connect-src` **autoriza** o navegador a falar com
  `lwzsxuaqqeoamukduhev.supabase.co` (REST) e `wss://…` (Realtime). Ao mexer na CSP, edite o
  `vercel.json`.
- **Auto-deploy:** conectar o repo GitHub `LucasMolinari9/LucasCTEC` ao projeto Vercel pelo
  **dashboard** (OAuth GitHub, ação única) → **push na `main` = deploy automático**. Sem essa
  conexão, publica-se rodando o MCP `deploy_to_vercel` (deploya o diretório atual) após o push.
- **Atualização automática para todos os usuários** (sem limpar cache):
  1. `Cache-Control: public, max-age=0, must-revalidate` (no `vercel.json`) → cada visita revalida.
  2. Detector de versão no JS (`checarNovaVersao`): compara o **ETag** do `index.html` a cada
     ~3 min e ao focar a aba; se mudou, recarrega sozinho (espera fechar o modal aberto). O Vercel
     devolve ETag em `HEAD /index.html`, então o detector continua funcionando.
- **Carimbo de versão** no rodapé (`#verTag`, ex.: `build 19/06-A`). Ao publicar algo que o
  usuário precisa confirmar, **incremente esse texto** — serve para checar qual versão está no ar.
- O `vercel` CLI **não** funciona pelo ambiente do Claude (rede de saída
  bloqueia upload e `WebFetch`/`curl` ao site/Supabase). Os caminhos são: **push na `main`**
  (se o auto-deploy git estiver conectado) ou o MCP **`deploy_to_vercel`**.

## Como fazer mudanças
1. Edite **`index.html`** (todo o código está nele). Trabalhe na branch **`main`** (é a publicada).
2. **Antes de publicar, rode `node tests/check.js`** — valida a sintaxe do `<script>` inline,
   confere as cópias de teste (guarda anti-drift) e roda todos os testes. Só publique se sair
   tudo verde. (Ao alterar uma função que tem cópia em `tests/*.harness.js`, atualize a cópia.)
3. Commit e **push na `main`** → se o auto-deploy git do Vercel estiver conectado, republica sozinho;
   senão, rode o MCP `deploy_to_vercel`. As telas dos usuários se atualizam (via detector de versão).
   Bumpe o carimbo de versão se quiser confirmar a chegada.
4. Mudanças de **dados** NÃO exigem deploy — o site lê o Supabase ao vivo.

## Armadilhas / observações
- **CSS — dropdown da busca:** o dropdown de resultados é inserido **dentro de `.selector`**.
  A regra do botão verde usa **`.selector > button`** (filho direto) de propósito — **não** use
  `.selector button`, senão os `<button>` dos resultados herdam o fundo verde do "Abrir linha".
- **Encoding dos dados**: há acentos corrompidos na origem (ex.: "Niter�i"). É problema da
  importação no banco (caractere U+FFFD, irrecuperável pelo banco); só some reimportando os
  dados em UTF-8 no Supabase.
- **Estética:** topo navy + faixa verde fina (identidade DETRO/DIVAT); banner da linha em navy
  com faixa verde inferior. Manter esse idioma visual ao criar telas novas.
- **PKs e índices (escalabilidade) — endurecido em 15/07/2026:** hoje **todas as tabelas têm PRIMARY KEY**.
  Nas que já tinham coluna única (`id`, `cod_ibge`, `cod_origem`, `ordem_importacao`) a PK foi promovida
  **sobre a coluna existente** (não muda a forma da tabela → não quebra o ETL de importação do dono).
  As 3 grandes com `id` repetido (`itinerario_teste`, `qh_intervalo_teste`, `qh_predeterminado_teste`)
  ganharam uma coluna surrogate **`row_id` (`bigint GENERATED ALWAYS AS IDENTITY`)** — o `id` original
  foi mantido porque o front ordena por ele; `row_id` não é selecionado pelo front. Índices btree +
  trigram (`pg_trgm`) nas colunas de filtro já existem desde a auditoria 26/06, e a FK `fk_tarifa_linha`
  (`tarifa_atual_teste`) tem índice de cobertura `idx_tarifa_codempresa_codlinha`. Ao criar telas que
  filtram **novas** colunas de tabelas grandes, **criar o índice** (btree; `pg_trgm`+GIN para `ilike`).
- **`cod_origem` × `cod_municipio_origem` (desambiguado em 17/07/2026):** `cod_origem` = **terminal/origem**
  (em `origem_teste`, `qh_intervalo_teste`, `qh_predeterminado_teste`); `cod_municipio_origem` = **código
  IBGE de município** (em `itinerario_teste` — antes se chamava `cod_origem`, mesmo nome com significado
  diferente). O typo `cod_origen` (só em `qh_intervalo_teste`) também virou `cod_origem`. Índices e função
  `divat_linhas_regiao` acompanharam o rename; detalhe + diagrama em `docs/schema.md`. **Atenção ETL:** o
  import do dono precisa escrever nos nomes NOVOS (`cod_origem` em `qh_intervalo_teste`, `cod_municipio_origem`
  em `itinerario_teste`) — se escrever nos antigos, **recria as colunas velhas**.
- **Tabelas de staging do ETL (não são lidas pelo portal):** `evento_dados` + `evento_textos` montam
  `evento_teste`; `portaria_data` + `portaria_texto_teste` montam `portaria_teste`. O front lê **só** as
  finais (`evento_teste`/`portaria_teste`). As de staging têm RLS ligado **sem policy** e **sem grant para
  `anon`/`authenticated`** (revogado em 15/07/2026) → invisíveis pela API pública, de propósito. O lint
  `rls_enabled_no_policy` nelas é **esperado**, não é bug. Alimentação é via service role (painel), que ignora isso.
- **BACKUP — manual, ainda sem PITR (endurecido em 16/07/2026):** o plano é **Free (NANO)**, que **não
  oferece** backup automático/PITR (recurso só do Pro). A rede de segurança hoje é **manual e documentada**
  em **`docs/backup.md`**: (1) **estrutura** em `docs/backup_schema.sql` — versionado no git, recria tabelas/
  PK/FK/índices/RLS/grants/funções/trigger; (2) **dados** por 3 caminhos (ver `docs/backup.md`): `pg_dump`
  (padrão-ouro), o script `scripts/backup_rest.mjs` (Node, sem deps, dump NDJSON via REST) ou 18 CSVs pelo
  Table Editor — sempre **guardados FORA do git** (Drive do dono; dados no repo = vazamento). Um mapa relacional das tabelas está em
  `docs/schema.md`. **Continua valendo:** o git versiona só o CÓDIGO, nunca os DADOS, e **não rodar nada
  destrutivo (DROP/DELETE/TRUNCATE/REVOKE/migração) sem um backup fresco** (refazer os CSVs antes). Migrar
  para o Pro tornaria o backup automático e dispensaria a rotina manual.
- **Truncagem silenciosa:** a maioria dos loaders avisa via `marcarTrunc`/`bannerTrunc`, mas cortes
  feitos por `slice(0,N)` no cliente **perdem** a flag não-enumerável `_trunc` (o `slice` não a copia)
  e podem exibir listas incompletas sem aviso. Ao criar/editar uma view que faz `slice` no cliente,
  **reponha a flag** (ou avise o usuário) quando o limite for atingido. (Obs.: o antigo corte de 300 no
  cliente em `lineResults` foi **removido** em 18/07/2026 — a paginação de tela exibe tudo em páginas e
  o `bannerTrunc(rows)` no topo avisa o teto **da query**.)
- **Paginação é SÓ de tela; o PDF sai INTEIRO (18/07/2026):** listas longas são paginadas (25/pág) por
  `paginateTable`/`paginateLines` (núcleo `paginate` + `pageBounds`), reusando o CSS `.doc-pager`/`.pg-*`.
  Como só a fatia atual entra no DOM, o **fallback do `baixarPdf`** (clonar o `.doc` visível quando
  `currentView.pdfHTML` é null) exportaria só a página aberta — por isso os dois wrappers **definem
  `currentView.pdfHTML` com a lista completa**. Quem já tem PDF próprio mais rico passa **`pdf:false`**
  (Quadro "por empresa"; Município). Detalhes, o que é/não é paginado e o padrão de clique por índice
  GLOBAL (Portarias) estão em **`docs/estrutura-frontend.md` §4**. Ao criar tela nova que lista muita
  coisa, **use esses helpers** em vez de `tableHTML` cru — o `pdf` cuida da completude.
- **Dependência do supabase-js — vendorada (17/07/2026):** era `@supabase/supabase-js@2` (qualquer 2.x)
  da jsDelivr, **sem versão fixa nem SRI**. Agora é **vendorada** em `vendor/supabase-js-2.110.7.min.js`
  (build UMD exato do npm, integridade sha512 conferida contra o registro), servida da **mesma origem** —
  versão fixa, sem CDN nem terceiro em runtime, e o `script-src` da CSP (`vercel.json`) não lista mais o
  jsDelivr. Para **atualizar a versão**: `npm pack @supabase/supabase-js@<v>`, extrair `dist/umd/supabase.js`,
  conferir a integridade, trocar o arquivo em `vendor/` e a tag `<script src>` no `index.html`.
- **`sbFetch` tem timeout (20s) + retry** (backoff) para erros transitórios; erros definitivos (4xx) não
  repetem. Não remover isso ao refatorar.
- **NÃO duplicar busca/listagem — reusar os helpers.** Antes de colar um bloco de busca de linha,
  busca de empresa ou listagem de linhas, **reuse** os helpers existentes em vez de recriar:
  `searchLines`/`lineSearchRun` (resolve termo → linha ativa / 1 / N), `searchEmpresas` +
  `empresaChooserHTML`/`bindEmpresaRows` (busca e tabela de escolha de empresa) e
  `distinctCods`/`fetchLinesByCods` (codlinhas distintos → buscar linhas + empresas). Copiar esses
  blocos cria cópias que divergem: uma correção futura acerta uma e esquece as outras (bug que
  reaparece só em alguns cards).

# Coding Guidelines (Karpathy-inspired)

Bias toward caution over speed on non-trivial work. For trivial tasks
(typo fixes, obvious one-liners), use judgment — not every change needs the
full rigor.

## 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.
- State assumptions explicitly — if uncertain, ask rather than guess.
- Present multiple interpretations — don't pick silently when ambiguity exists.
- Push back when warranted — if a simpler approach exists, say so.
- Stop when confused — name what's unclear and ask.

## 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.
- Test: would a senior engineer say this is overcomplicated? If yes, simplify.

## 3. Surgical Changes
Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Test: every changed line should trace directly to the request.

## 4. Goal-Driven Execution
Define success criteria. Loop until verified.
- "Add validation" -> "Write tests for invalid inputs, then make them pass."
- "Fix the bug" -> "Write a test that reproduces it, then make it pass."
- "Refactor X" -> "Ensure tests pass before and after."
- For multi-step tasks, state a brief plan with a verify step for each.
- Strong success criteria let the model loop independently; weak ones
  ("make it work") require constant clarification.
