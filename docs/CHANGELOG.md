# CHANGELOG — Portal DIVAT

Cronologia dos endurecimentos e mudanças estruturais. O `CLAUDE.md` descreve só o **estado
atual + regras**; o histórico de *como se chegou nele* vive aqui (com links para os relatórios
de auditoria em `docs/`).

## 30/07/2026 — Rótulos dos tópicos do painel lateral

- Os rótulos visíveis passaram de **Documentos da Linha** para **Linhas**, de **Empresas** para
  **Empresa** e de **Consultas de Ligações** para **Itinerários**; o botão **Buscar Linha** passou
  a **Buscar**. As `key` (`doc`, `emp`, `lig`, `ger`) e as rotas `#/topico/<key>` permaneceram
  intactas — só o campo `name` de `SECTIONS` e o rótulo literal do botão em `renderSideNav`.
- Correção no mesmo dia (PR #81 sobre o #80): a primeira leitura do pedido pôs **Itinerários** no
  tópico `doc` e **Ligações** no `lig`, invertendo os dois. Além de errado, criava colisão com o
  card **Itinerários** que vive dentro do `doc`. Os nomes acima são os corretos: **Linhas** é o
  tópico dos documentos de UMA linha; **Itinerários** é o das consultas por logradouro, terminal,
  localidade e município.
- Nenhum gate do repo casa esses rótulos por texto (navegam por `data-view` e por `key`), então a
  renomeação não exigiu ajuste em `tests/` nem em `scripts/`.

## 30/07/2026 — Card "Itinerários" movido para o tópico Itinerários

- Removido do tópico **Linhas** (PR #82) e **restaurado dentro do tópico Itinerários** (`lig`),
  como primeiro card. Loader, render, ícone `route`, `VIEW_TABLES` e a entrada no
  `check_views.mjs` voltaram intactos — o deep link `#/consulta/itinerarios` volta a resolver, e
  `VIEW_TOPIC.itinerarios` agora aponta para `lig`, então o card é destacado no tópico certo pela
  busca do topo. Views do `check_views.mjs`: **16 → 17** de novo.
- `desc` dos dois tópicos acertadas junto: a de `doc` não anuncia mais "Itinerário" (o card saiu
  de lá) e a de `lig` passou a anunciar o percurso além das buscas.
- O tópico e seu primeiro card passam a ter o **mesmo nome** — decisão consciente do dono, não
  descuido: o card é o documento do percurso de UMA linha, os outros são buscas que partem de
  logradouro/terminal/localidade.

## 26/06/2026 — Auditoria de segurança (escrita fechada de verdade)

- **Escrita revogada** de `anon` e `authenticated` em todas as tabelas (INSERT/UPDATE/DELETE/
  TRUNCATE/REFERENCES/TRIGGER) + `ALTER DEFAULT PRIVILEGES` para tabelas futuras não voltarem
  a conceder escrita. Desde então **não há caminho de escrita pela API pública**.
- **16 policies `auth_all_*` dropadas** (eram `ALL USING(true) WITH CHECK(true)` — davam escrita
  total a qualquer usuário logado).
- Índices **btree + trigram (`pg_trgm`)** nas colunas de filtro.
- O snapshot de segurança pré-endurecimento gerado nesse dia ficou **obsoleto** — restaurá-lo
  reabriria as brechas; a baseline válida é `docs/backup_schema.sql`.

## 15/07/2026 — PKs e permissões de staging

- **PRIMARY KEY em todas as tabelas.** Onde já havia coluna única (`id`, `cod_ibge`,
  `cod_origem`, `ordem_importacao`), a PK foi promovida sobre ela (sem mudar a forma → ETL
  intacto). As 3 grandes com `id` repetido (`itinerario_teste`, `qh_intervalo_teste`,
  `qh_predeterminado_teste`) ganharam **`row_id` bigint GENERATED ALWAYS AS IDENTITY** (o `id`
  original ficou porque o front ordena por ele).
- FK `fk_tarifa_linha` com índice de cobertura `idx_tarifa_codempresa_codlinha`.
- **Staging do ETL sem grant** para `anon`/`authenticated` (invisíveis pela API pública).

## 16/07/2026 — Realtime completo + runbook de backup

- **6 tabelas centrais** que faltavam entraram na publicação `supabase_realtime` (a atualização
  ao vivo estava quebrada para elas); `VIEW_TABLES` passou a listar também as tabelas lidas por
  baixo via lookups (bug: mudança em lookup não recarregava a tela).
- Runbook **`docs/backup.md`** + baseline **`docs/backup_schema.sql`** + script
  **`scripts/backup_rest.mjs`** (o projeto está no plano Free, sem PITR).
- Relatório: `docs/revisao-externa-2026-07-16.md`.

## 17/07/2026 — Vendoring do supabase-js + renames de schema

- **supabase-js vendorado** em `vendor/supabase-js-2.110.7.min.js` (antes: jsDelivr `@2` sem
  versão fixa nem SRI); jsDelivr saiu da CSP.
- **Desambiguação** `cod_origem` (terminal/origem) × `cod_municipio_origem` (IBGE em
  `itinerario_teste`; antes se chamava `cod_origem`) e typo `cod_origen` corrigido em
  `qh_intervalo_teste`. Índices e `divat_linhas_regiao` acompanharam (`docs/schema.md`).
- Args `tables:[...]` mortos removidos das chamadas de `searchPanel`.
- Relatório: `docs/revisao-externa-2026-07-17.md`.

## 18/07/2026 — Paginação de tela + PDF inteiro

- Listas longas paginadas (25/pág) por `paginateTable`/`paginateLines`; o PDF continua saindo
  **inteiro** (`currentView.pdfHTML` com a lista completa). Corte de 300 no cliente em
  `lineResults` removido. Detalhes: `docs/estrutura-frontend.md` §4.

## 21/07/2026 — Endurecimento final (revisão de arquitetura)

Plano completo em `docs/plano-endurecimento-2026-07-21.md`. Em resumo:

1. **Backup automático**: workflow `.github/workflows/backup.yml` (semanal + manual) roda o
   `backup_rest.mjs` em **modo público** (anon key, 14 tabelas, sem staging), artifact 90 dias.
   O script ganhou os modos completo/público.
2. **Fontes vendoradas** em `vendor/fonts/` (Archivo, IBM Plex Mono/Sans, subset latin, via
   pacotes `@fontsource` 5.3.0); Google Fonts saiu do runtime e da CSP (`font-src 'self'`).
3. **JS extraído para `app.js`** (byte a byte) e **CSP `script-src 'self'`** — fim do
   `'unsafe-inline'` de script. `checarNovaVersao` compara os ETags de `index.html` **e**
   `app.js`; `tests/check.js` compila o `app.js` e **falha** se voltar `<script>` inline no
   HTML; `realtime.test.js`/`check_realtime.mjs` extraem literais do `app.js`.
   Racional: `docs/estrutura-frontend.md` §1.
4. **`pgrst.db_max_rows = 30000`** no role `authenticator` (teto do PostgREST = maior `limit`
   do front).
5. **U+FFFD zerado no banco**: 41 rótulos de `evento_empresa_teste` + 6 textos longos (eventos/
   portarias, finais e staging) + 1 tarifa + 1 `dia_semana` restaurados (contexto inequívoco,
   padrões Latin-1/UTF-8 de mojibake). Único juízo editorial: `evento_empresa_teste.row_id=48`
   era "Suspenção de Intervenção" (typo da origem) → restaurado como "Suspensão de Intervenção".
   **Atenção ETL:** reimportar com encoding errado recria o problema — importar sempre UTF-8.
6. **Docs**: este CHANGELOG criado; `CLAUDE.md` enxuto (só estado atual + regras); fluxo de
   trabalho passa a ser **branch → preview do Vercel → merge na `main`**.

## 22/07/2026 — Profissionalização do frontend (UX, rotas, CSS próprio)

Revisão completa do frontend (branch `claude/frontend-review-2sty95`, avaliada em preview antes
do merge). Nenhuma mudança de banco. Em resumo:

1. **Rotas por hash** (seção `ROTAS (hash)` no `app.js`): `#/linha/<codlinha>`,
   `#/consulta/<view>` e a combinação. Links compartilháveis/favoritáveis, deep link na
   entrada, e o **Voltar do navegador fecha o modal** (abertura cria UMA entrada de histórico;
   trocas de view internas usam `replaceState`).
2. **CSS extraído para `styles.css`** (o `<style>` do `index.html` saiu; `style-src` segue com
   `'unsafe-inline'` por causa dos `style=""` dinâmicos — accents dos cards e larguras de `th`).
   Os ~30 estilos inline REPETIDOS dos templates viraram classes (`.doc-h3`, `.doc-note`,
   `.doc-count`, `.fd-*`, `.qh-*`, `.doc-obs.tight` etc.). `checarNovaVersao` vigia agora
   **3 ETags** (`index.html`, `app.js`, `styles.css`).
3. **`esc()` também escapa `'`** (`&#39;`) — remove a classe de bug dos atributos single-quoted
   (os `.replace(/'/g,…)` manuais saíram); cópia no `tests/pure.harness.js` atualizada + teste.
4. **`app.js` num IIFE** (nada vaza p/ `window`) e **logo DETRO (SVG ~280 linhas) saiu do JS**
   — vive inline no `#brandLogo` do `index.html`; `docHead` reusa o markup e a cor vem da
   classe `.brand-logo-doc` (fim do `replace(currentColor)`).
5. **supabase-js injetado dinamicamente** pelo `app.js` (só serve o Realtime; script dinâmico é
   async → não bloqueia a primeira pintura). A tag `<script>` dele saiu do `index.html`.
6. **Busca do topo**: busca-enquanto-digita (debounce 300 ms, ≥2 caracteres), navegação por
   teclado (↓/↑/Esc), semântica de combobox (`aria-expanded` etc.) e **consultas no dropdown**
   (digitar "tarifa" acha o card Tarifas — `matchViews`/`VIEW_META`).
7. **Cards**: descrições diferenciadas (a instrução repetida "Busque a linha…" saiu), documentos
   mais usados primeiro, ícones exclusivos (`histEmp`, `fleet`, `ruler`), chip visível nos cards
   que exigem linha ("Requer linha selecionada" → "Linha <nº>" quando há linha ativa) e modo
   compacto no celular (linha única, sem descrição — menos rolagem).
8. **Sem detalhe interno na UI pública**: rodapé sem "Supabase"/"bd_teste" (carimbo `#verTag`
   continua, discreto) e rodapés de documento sem nome de tabela (`tabela_vista_teste` etc. →
   "cadastro DETRO-RJ · DIVAT").
9. **A11y**: toasts com `role="status"` (leitores de tela anunciam avisos e o "Atualizado ao
   vivo").
10. **PWA mínimo**: `manifest.webmanifest` + `vendor/icon.svg` (instalável na tela inicial;
    sem service worker).

## 23/07/2026 — Revisão de segurança guiada pelo checklist do CyberSources

Revisão pontual do frontend e da postura do Supabase, adaptando ao formato do site (estático +
PostgREST, sem servidor próprio) a fatia de "Web Testing/Reconnaissance" do catálogo de
ferramentas [bst04/CyberSources](https://github.com/bst04/CyberSources). Escopo somente-leitura
(headers HTTP, GRANTs/RLS via SQL e Security Advisor, varredura estática de XSS/injeção de
filtro no `app.js`, segredos nos arquivos servidos); nenhuma escrita real foi tentada contra a
API pública (rede de saída bloqueada no ambiente da revisão) — compensado consultando os GRANTs
direto no Postgres, prova mais forte que um teste de caixa-preta.

- **Único achado (médio): HTML injection refletido em 2 telas.** `pesquisaEvento`
  (`app.js`, Pesquisa de Evento) e `mostrarLinhasPorLocalidade` (`app.js`, Ligações por
  Localidade/Município) concatenavam o termo de busca do usuário direto em `innerHTML` na
  mensagem de "nenhum resultado", sem passar por `esc()` — ao contrário do resto do arquivo
  (~150 outros pontos escapam corretamente). Em Localidade/Município a inconsistência era
  visível na própria função: a variável `b` era escapada numa branch e não na outra. A CSP
  `script-src 'self'` (sem `unsafe-inline`) já impedia execução de JS por esse vetor (handlers
  inline como `onerror=` são bloqueados pelo navegador), então o risco real era injeção de HTML
  morto/link de phishing dentro do resultado de busca, não roubo de sessão. **Corrigido**:
  `term`/`a`/`b` agora passam por `esc()` nos dois pontos, igual ao padrão do resto do arquivo —
  diff de 2 linhas, `node tests/check.js` verde (259/259 testes) depois da mudança.
- **Confirmado sem achado**: GRANTs do Postgres mostram só `SELECT` para `anon`/
  `authenticated` em todas as 18 tabelas públicas (zero INSERT/UPDATE/DELETE);
  `rolbypassrls=false` para os dois (só `service_role` ignora RLS); as 4 tabelas de staging do
  ETL seguem "RLS ativo, sem policy" — o padrão intencional já documentado, não uma falha;
  nenhuma chave `service_role` embutida nos arquivos servidos; `ilikeTerm()` neutraliza
  injeção no agrupador `or=(...)` do PostgREST; headers de segurança (CSP, HSTS,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) completos no
  `vercel.json`.
- **Pendente, fora do escopo desta revisão**: ativar *Leaked Password Protection* no Dashboard
  do Supabase (Authentication → Policies) — já listado como pendente no `CLAUDE.md`; não foi
  possível confirmar ao vivo se o signup do Auth está fechado (mesmo bloqueio de rede); hash do
  `vendor/supabase-js-2.110.7.min.js` não foi reconferido contra o pacote oficial do npm.

## 23/07/2026 — Home vira painel lateral (sidebar de tópicos)

- **Home de cards → painel lateral fixo.** A grade de seções empilhadas deu lugar a uma
  **sidebar de tópicos** (nav navy à esquerda) + **painel de conteúdo** que mostra os cards do
  tópico ativo. A casca é montada uma vez e preenchida por `selectTopic`; a seção `RENDER CARDS`
  do `app.js` passou a ter `renderSideNav`/`renderSideContent` (mapa de código no `CLAUDE.md`
  atualizado).
- **Tópico "Gerenciais e Pesquisa" renomeado para "Portarias".** Cor de acento **unificada**
  (mesmo azul de "Documentos da Linha") em todos os cards e no destaque do tópico ativo — parou
  de variar por família.
- **Rota nova `#/topico/<key>`** (deep link do tópico ativo no painel; omitida quando é o
  padrão). Convive com `#/linha/…` e `#/consulta/…`; a busca do topo leva ao tópico dono e
  **realça** o card (sem abrir o documento sozinho).
- **Sub-lista da sidebar só abre por clique explícito** no tópico (nunca sozinha ao virar o
  tópico atual). No **mobile** a sidebar vira faixa horizontal de ícones e a sub-lista some;
  `renderSideNav` faz `scrollIntoView` do tópico ativo para o destaque não ficar fora da faixa
  (deep link / busca).
- **Fix de dado na tela de Tarifas:** "Piso I" é **quilometragem** (extensão da seção), não
  valor — passou a exibir `… km` em vez de `R$ …`.
- `node tests/check.js` verde (260/260). Sem mudança de schema/Realtime — só frontend.

## 24/07/2026 — Aba nova deixa de ser beco sem saída (seletor de documentos no pane)

- **Bug:** a aba aberta pelo "+" achava a linha e parava num aviso *"escolha um documento no
  painel lateral"* — instrução impossível de cumprir. O painel lateral vive no `#app`, e o
  `.modal-overlay` (`position:fixed; inset:0; z-index:1000`) cobre a viewport inteira enquanto
  o modal está aberto: **nenhum clique chega nos cards**. Pelo mesmo motivo não dava pra ter
  dois assuntos abertos ao mesmo tempo (Quadro de Horários + Portarias), já que o único caminho
  pra isso — o ícone "abrir em nova aba" do card (`openViewInNewTab`) — também está atrás do
  overlay. Não era regressão: o aviso nasceu junto com a faixa de abas (`a8f95bb`) e o overlay
  nunca teve exceção de `pointer-events`; era funcionalidade entregue pela metade.
- **Conserto:** `renderTabChooser` desenha o **seletor de documentos dentro do próprio pane**,
  com TODOS os tópicos (não só "Documentos da Linha" — é o que alcança os cards que não exigem
  linha, como Portarias) e reusando `topicGridHTML`, o mesmo markup/CSS dos cards do painel.
  Escolher um documento **substitui a view daquela aba** (o `openView` de sempre, que roda na
  aba ativa) — é o que preenche a aba em branco; aba nova continua nascendo só pelo "+" ou pelo
  ícone/clique-do-meio no card. O seletor aparece com ou sem linha selecionada.
- **Delegação de clique nova em `modalBodyWrap`**: o listener dos cards mora no `#app`, e o
  modal é **irmão** do `#app` — cliques dentro do modal nunca subiriam até lá. Delegado no wrap
  (não num pane) pelo mesmo motivo do `keydown` de linhas clicáveis: panes de aba são criados e
  destruídos.
- **`scripts/check_abas.mjs`** (novo): checagem de regressão em navegador headless (Playwright),
  com o PostgREST stubado — determinística e sem acesso ao Supabase. Fora do CI, no mesmo
  contrato manual do `check_realtime.mjs`, porque `tests/check.js` é offline e sem dependências
  de propósito. Verificada vermelha no código anterior e verde depois do conserto.
- `node tests/check.js` verde (331/331). Sem mudança de schema/Realtime — só frontend.

## 25/07/2026 — Semgrep (análise estática) instalado

Runbook completo: **`docs/semgrep.md`**.

- **Por que:** o `tests/check.js` só **compila** o `app.js`, nunca o executa — então um
  `eval`/`new Function` passa verde por ele e só morre no navegador do usuário, onde a CSP
  (`script-src 'self'`, sem `'unsafe-eval'`) bloqueia. Essa faixa — "padrão que o gate atual
  não consegue ver" — é o que o Semgrep cobre. Os dois gates ficam **separados de propósito**
  (`ci.yml` × `semgrep.yml`): o `check.js` é Node puro e sem dependências, e vale manter assim.
- **4 regras locais** em `.semgrep/rules/divat.yml`, escritas para invariantes já documentados
  no `CLAUDE.md` que nenhum ruleset genérico conhece: `currentView.pdfHTML` atribuído fora do
  seam (a corrida que faz o PDF sair da linha errada), `eval`/`new Function`, `setTimeout` com
  string, e CDN externo em runtime (tudo é vendorado; a CSP bloquearia).
- **As regras têm teste** (`.semgrep/tests/divat.js`, `./scripts/semgrep.sh --test`): cada uma
  com o caso ruim **e** o bom, então falha tanto se parar de pegar quanto se virar falso
  positivo. 4/4 verdes.
- **`scripts/semgrep.sh`** com o padrão **offline** (só regras locais) e `--full` para somar os
  rulesets do registry (`p/javascript`, `p/xss`, `p/secrets`, `p/github-actions`). A separação
  não é estética: `semgrep.dev` é inalcançável do ambiente do agente Claude (mesma política de
  rede que barra o `vercel` CLI), então o modo que roda **em qualquer lugar** é o padrão.
- **`.github/workflows/semgrep.yml`** em push e PR, com a versão **fixa** (`semgrep==1.171.0`),
  mesma disciplina do supabase-js vendorado — versão nova traz regra nova e deixaria vermelho
  um PR que não mexeu em nada disso. Sem SARIF/Code Scanning (exige Advanced Security, que o
  repo privado no plano free não tem).
- **Repo limpo:** 0 achados nas regras locais. A única exceção é um `nosemgrep` **justificado**
  em `tests/realtime.test.js` — o `new Function` ali roda no Node (não é servido ao navegador,
  a CSP não se aplica) e o alvo é um literal puro recortado do `app.js`.
- `node tests/check.js` verde (331/331). Sem mudança de schema/Realtime — nada do portal servido
  mudou (só o teste ganhou um comentário).

### Adendo — actions presas ao SHA (mesmo dia)

O primeiro CI com os rulesets públicos veio **vermelho**: `github-actions-mutable-action-tag`,
7 ocorrências nos 3 workflows (`actions/checkout@v4` e cia.). Tag é ponteiro **móvel** — quem
controla a action pode repontar `v4` e o CI passa a rodar outro código sem nada mudar no repo
(foi o que houve nos incidentes do `trivy-action` e do `kics-github-action`). É o **mesmo
raciocínio que tirou o jsDelivr `@2`** em 17/07. Os 7 `uses:` foram presos ao SHA de 40
caracteres, com a tag ao lado só como legenda. Contrapartida assumida: sem Dependabot, a
atualização vira **manual** — o procedimento está em `docs/semgrep.md` § "Actions presas ao
SHA". A metade offline do scan já tinha passado; foi só essa regra.

## 26/07/2026 — Laço de fumaça sobre as 23 views (rede sob o render)

**Motivação.** O `tests/check.js` é offline e sem dependências de propósito, então só cobre a
lógica **pura** copiada nos `*.harness.js` (~224 linhas). A seção `MODAL / SISTEMA DE VIEWS`
ocupa as linhas 636–2591 do `app.js` — **~62% do arquivo, todo o render** — e não tinha
nenhuma checagem automatizada além do `check_abas.mjs`, que cobre só as abas. Ou seja: uma
view podia passar a explodir ou a pintar em branco e **nada acusaria** até um usuário abrir.

**O que entrou.**

- **`scripts/lib/rig.mjs`** — bancada compartilhada: servidor estático, Chromium headless,
  placar, e as **fixtures do PostgREST em definição única** (uma linha plausível por tabela das
  14 lidas pelo portal + stub das 2 RPCs, `divat_busca_logradouro` e `divat_linhas_regiao`).
  Extraída de dentro do `check_abas.mjs` justamente para as fixtures não divergirem em duas
  cópias — o modo de falha que o `CLAUDE.md` chama de "cópias que divergem".
- **`scripts/check_views.mjs`** — abre as 23 views por deep link, digita um termo que casa as
  fixtures quando há painel de busca, e falha se a view lançar erro (`errorBox`), ficar presa
  no spinner, pintar **só a moldura** ou não achar nada. Um laço genérico em vez de 23 testes
  escritos à mão. Fecha com uma checagem **anti-drift**: view no seletor que não esteja em
  `VIEWS` derruba o script.
- **`check_abas.mjs` migrado** para o rig (assertions inalteradas, segue verde).

**Resultado.** 23/23 verdes — **nenhum defeito encontrado** no `app.js`. Os 4 vermelhos da
primeira execução eram todos defeito **do teste**, e cada um ensinou algo que virou regra:
`secoesPorEmpresa` pede **código** de empresa (não nome); `ligacoesPorLogradouro` e
`municipioRegiao` passam por **RPC**, não por tabela; `localidades` tem formulário próprio
(`#locA`/`#locGo`), não o painel padrão; e documentos como o Histórico renderizam **blocos, não
`<table>`** — contar tabelas era a asserção errada.

**Validado por mutação** (a checagem só vale se souber ficar vermelha): um `null.x` dentro de
`LOADERS.frota` foi pego com a mensagem exata e **sem** contaminar as outras 22; um
`renderFrota` devolvendo vazio **passou** na primeira versão — a moldura (cabeçalho + campo de
busca) contava como "pane não-vazio". Daí a medição virar o **corpo** do documento
(`#spHost`/`#locHost`), não o pane. Só depois disso a mutação foi pega.

**Escopo deliberadamente de fora:** conferir se o conteúdo está **certo** (colunas, totais) —
isso é asserção por view. E o script fica **fora do CI**, como o `check_abas.mjs` e o
`check_realtime.mjs`: exige Playwright, que o `check.js` não tem. *(Essa última parte durou um
dia — ver a entrada seguinte.)*

## 26/07/2026 — O laço de fumaça no CI (`views.yml`)

**Motivação.** A fatia 0 (acima) deixou o `check_views.mjs` pronto, mas **manual**: valia
enquanto alguém lembrasse de rodá-lo antes do push. Checagem que depende de memória humana é
checagem que um dia não roda — e o buraco que ela cobre (~62% do `app.js`, todo o render) é
grande demais para ficar nessa dependência.

**O que entrou.** **`.github/workflows/views.yml`**, em todo push e PR: instala o Playwright
(**versão fixa**, `playwright@1.56.1`) + Chromium e roda **`check_views.mjs`** e
**`check_abas.mjs`** — os dois usam o mesmo rig e o mesmo navegador, então o segundo sai quase
de graça depois de instalado.

**Job/arquivo separado, decisão de projeto.** O `ci.yml` roda `node tests/check.js` — Node puro,
sem dependências, segundos; essa leveza é uma propriedade que o repo valoriza e está escrita no
cabeçalho do próprio workflow. Playwright + Chromium custam ~1 min só de instalação. Pendurar
isso no job `check` transformaria o gate rápido num gate lento, então o navegador roda **ao
lado** — mesma disciplina do `semgrep.yml`, e um vermelho não esconde o resultado do outro. São
três workflows hoje: `ci.yml` (leve), `views.yml` (navegador), `semgrep.yml` (estático).

**Detalhes com motivo:**
- **Versão do Playwright fixa**, como o Semgrep e o supabase-js vendorado: subir é uma decisão,
  não efeito colateral de um push qualquer.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** na instalação global, e só então
  `playwright install --with-deps chromium` — evita baixar os três navegadores quando os
  scripts usam um. Sem `--with-deps` o Chromium não sobe no runner do GitHub.
- **Instalação global** (`npm i -g`) porque o repo é zero-build (não há `package.json`) e o
  `rig.mjs` procura o Playwright no `npm root -g`.
- **Sem cache do Chromium:** os `uses:` do repo são presos ao **SHA de 40 caracteres** (regra de
  26/07, adendo acima) e não havia como resolver o SHA do `actions/cache` no ambiente onde o
  workflow foi escrito — inventar SHA seria pior que não cachear. `playwright install` leva
  ~30 s num job de ~2 min; se um dia incomodar, some o cache com o SHA conferido à mão.

**Verificação.** Gate local verde antes do commit (`check.js` 331/331, 23/23 views, abas OK) e
**resultado real conferido no GitHub Actions** depois do push — workflow que ninguém olhou não
está provado, e o falso verde clássico é o job que passa por não ter rodado nada.

**Nada servido ao usuário mudou** (só CI e documentação) — sem deploy e sem bump do carimbo de
versão. A fatia 1 (asserções de **conteúdo** por view) segue adiada por decisão do dono.

### Fecho do dia 26/07 — o que o dia inteiro foi (e o que ficou decidido)

As duas entradas acima são o **quê**. Isto é o **porquê**, registrado aqui porque o documento
onde ele morava (`docs/handoff-fatia2-ci.md`) era transitório de propósito e foi apagado ao fim
da fatia 2 — sem isto, a decisão se perderia junto com ele.

**De onde veio.** O dono levantou um medo: *"tenho medo do meu projeto estar todo bonito por
fora e podre por dentro, e eu não sei como resolver"*. A conversa concluiu que o medo era
**epistêmico** — falta de visibilidade — e não estrutural: não havia sinal de podridão, havia
ausência de instrumento capaz de dizer que não há. E a consequência disso é que **laudo não
resolve pergunta contínua**: uma auditoria responde "hoje está de pé" e envelhece no dia
seguinte. Só instrumento — que roda sozinho, de novo, a cada mudança — responde a pergunta na
forma em que ela foi feita.

**O plano, em três fatias.**

| Fatia | O que | Estado ao fim do dia |
|---|---|---|
| **0** | Laço de fumaça sobre as 23 views (`check_views.mjs` + `rig.mjs`) | ✅ `73f0d37` |
| **2** | Pôr o laço no CI, rodando sozinho a cada push (`views.yml`) | ✅ `c7b6177` (PR #60) |
| 1 | Asserções de **conteúdo** por view ("está certo?", não só "está de pé?") | **adiada** — ver o gatilho abaixo |

A ordem (0 → 2 → 1) não foi acidente: primeiro o instrumento, depois a automação que garante
que ele roda, e só então — se fizer falta — o refinamento do que ele mede.

**Por que a fatia 1 ficou adiada, e qual é o gatilho para retomá-la.** O laço rodou 23/23 sem
achar nada: não existe, hoje, **um caso concreto** de dado errado que passou despercebido numa
tela. Escrever 23 asserções de conteúdo sem esse caso é adivinhar o que vai quebrar — e
asserção adivinhada é a que quebra por mudança legítima e treina todo mundo a ignorar o
vermelho. **Gatilho:** no dia em que aparecer na mão um dado errado numa view, escreva a
asserção *daquela* view, nascida do erro real. Uma de cada vez, pagas pelo defeito que as
justificou.

**Estado do CI ao fim do dia — três workflows, separados de propósito** (um vermelho não
esconde o resultado do outro):

| Workflow | O que pergunta | Custo |
|---|---|---|
| `ci.yml` | "faz o que deve?" — sintaxe, anti-drift, lógica pura (Node puro, sem dependências) | ~14 s |
| `views.yml` | "alguma tela explode ou fica em branco?" — 23 views + abas, em navegador | ~46 s |
| `semgrep.yml` | "contém padrão proibido?" — regras locais + rulesets públicos | ~34 s |

**Pendências abertas encontradas no caminho** (nenhuma urgente, nenhuma bloqueia nada):
1. **Node 20 depreciado nas actions.** O runner avisa que `actions/checkout` e
   `actions/setup-node` têm como alvo o Node 20 e estão sendo forçadas para o Node 24 — vale
   para os **três** workflows, não só o novo. Nada quebrou; um dia vira erro. Consertar = subir
   a versão das actions **e o SHA junto** (`docs/semgrep.md` § "Actions presas ao SHA").
2. **Cache do Chromium no `views.yml`.** Ficou de fora porque não havia como resolver o SHA do
   `actions/cache` no ambiente onde o workflow foi escrito, e SHA inventado é pior que cache
   nenhum. Economizaria ~20 s num job de ~46 s — cosmético.

## 26/07/2026 — Auditoria docs×banco: estoque corrigido, guarda instalada

Uma auditoria contra o catálogo do Postgres do projeto vivo achou **8 divergências** entre o
que os docs afirmam e o que o banco é — todas com a mesma origem: um fato copiado à mão para
`CLAUDE.md`/`docs/schema.md`/`docs/seguranca.md`/`docs/backup_schema.sql` e nunca mais
conferido. Os tickets (`.scratch/doc-drift/`) foram implementados em sequência:

- **Docs (tickets 01–04):** `CLAUDE.md` citava duas tabelas que não existem
  (os nomes certos são `municipio_teste` e `origem_teste`); `schema.md` afirmava unicidade de
  `codempresa` que o banco não garante (índice btree comum — unicidade é convenção do ETL),
  apontava o código para o `index.html` (vive no `app.js` desde sempre, com nomes de função
  que também tinham driftado) e não documentava **nenhuma** das 6 funções nem o trigger
  `trg_vigor_auto` — ganhou a seção "Funções e trigger".
- **Banco (ticket 05):** `divat_busca_logradouro` era a única função sem `SET search_path`
  (o doc de segurança já dizia "fixo" — agora é verdade). `ALTER FUNCTION ... SET search_path`
  aplicado via migration; advisor do Supabase limpo; baseline atualizada.
- **Ticket 06 (parcial):** o `seguranca.md` dizia "a única função SQL pública" — eram 6 com
  EXECUTE para `anon`; o doc agora lista as que têm motivo. **Decisão que contraria a
  auditoria:** `divat_data_quality` NÃO foi revogada — a issue #63 (aberta no mesmo dia,
  antes da auditoria) planeja o runner semanal chamando-a exatamente como `anon`, e os grants
  atuais já são o estado final que a #63 prescreve. Sobrou 1 REVOKE (inócuo) pendente em
  `fn_vigor_auto`, bloqueado pela regra "backup fresco antes de REVOKE" (o ambiente do Claude
  não alcança o Supabase nem consegue disparar o workflow Backup — passo a passo no ticket).
  **Fechado no mesmo dia, a pedido do dono:** o backup fresco saiu por um workflow
  temporário disparado por push na branch (artifact `divat-backup-pre-revoke-30212757689`,
  90 dias; o workflow foi removido em seguida), e o REVOKE foi aplicado via migration e
  verificado — trigger disparando num UPDATE de teste (revertido), `anon` sem EXECUTE na
  função e com as RPCs do portal intactas (busca por logradouro e `realtime_tables` testadas
  como `anon`). Primeiro run real da regra "backup antes de REVOKE": funcionou, e o caminho
  do workflow-por-push fica registrado para a próxima vez que a integração não puder usar o
  dispatch manual.
- **Baseline (ticket 07):** ressincronizada com `pg_get_functiondef` do vivo. Além do previsto
  (faltava `divat_data_quality` inteira; `realtime_tables` é INVOKER, não DEFINER), a conferência
  achou mais duas: `f_unaccent` no banco usa `extensions.unaccent` com `search_path` fixado (a
  baseline dizia `public.unaccent`, o que quebraria a reconstrução) e `divat_linhas_regiao`
  também tem `search_path` que a baseline omitia.
- **Guarda (ticket 08):** `scripts/check_deriva.mjs` + workflow `deriva.yml` (semanal + sob
  demanda + push/PR nos arquivos relevantes). Compara a visão de `anon` do banco com os docs:
  cada uma das 4 checagens teria pego uma divergência real desta auditoria. Verificado numa
  bancada local (mock da API): verde no repo corrigido; reintroduzir um nome fantasma num doc
  deixa o script vermelho apontando arquivo:linha. **O 1º run no CI derrubou o plano
  original:** o ticket apostava no OpenAPI do PostgREST como fonte de fatos, mas neste
  projeto o endpoint é restrito à service_role (HTTP 401 com a anon key). Saída: a RPC
  `divat_api_shape()` (INVOKER, EXECUTE p/ anon — a alternativa que o próprio ticket previa),
  criada via migration e versionada na baseline; rodando como `anon`, devolve exatamente a
  visão de `anon` (tabelas/colunas via `information_schema`, RPCs via
  `has_function_privilege`), sem vazar nada que a API pública já não mostre.

Nada servido ao usuário mudou (docs + CI + metadado de função no banco) — sem deploy e sem
bump do carimbo.

## 27/07/2026 — 4ª auditoria externa: privilégios fecham por padrão, CSP fecha de vez

Chegou um relatório externo com 8 achados (SEC-01…SEC-08) e, depois, um **parecer de revisão do
próprio plano de correção**. Os 8 foram verificados contra o repo **e contra o banco vivo** — a
lição registrada no handoff anterior ("pergunte ao banco, não ao doc") virou método. Todos
procediam. Do parecer de revisão, 12 dos 14 pontos foram aceitos; **dois estavam errados**, e a
diferença mudou o que foi executado.

### O que o banco mostrou e nenhum dos dois relatórios podia ver

`pg_default_acl` tinha **dois** conjuntos de defaults para `public`. O do `postgres` concedia
`anon=rm` a tabelas novas — e o `CLAUDE.md` afirmava o **oposto** do que o SQL fazia ("um
`ALTER DEFAULT PRIVILEGES` garante que tabelas novas não voltem a conceder"; o comando
**concedia**). O `m` de `rm` é **MAINTAIN** (VACUUM/ANALYZE/CLUSTER/REINDEX/LOCK), não leitura —
daí `REVOKE ALL` e não `REVOKE SELECT`, ponto do parecer, aceito.

### A probe que derrubou a premissa dos dois relatórios

Antes de aplicar DDL, uma **probe em transação** (cria tabela/função/sequência descartáveis, mede
com `has_*_privilege`, `RAISE EXCEPTION` para desfazer) mostrou que, nas **funções**, os dois
relatórios miravam no alvo errado: pediam revogar `EXECUTE` de `PUBLIC`, mas o default do Supabase
**já excluía `PUBLIC`** — quem estava aberto era **`anon`**. Revogar só de `PUBLIC` não fecharia
nada, e uma função administrativa criada em `public` continuaria chamável pelo PostgREST. O revoke
aplicado inclui `anon`/`authenticated`; a probe confirmou o resultado (ACL final: `postgres` +
`service_role`).

O parecer também afirmava que `REVOKE EXECUTE` **não deve** usar `IN SCHEMA`, porque "revogação
limitada a schema não neutraliza o default global". A premissa está errada — `defaclacl` guarda a
ACL **completa** do objeto novo, não um delta (prova: a entrada de tabelas deste banco carregava
`postgres=arwdDxtm`, vindo do `acldefault`). Seguir a justificativa levaria a **pular** o escopo
que pega o caso real. Aplicados os dois escopos, e a decisão veio da probe, não do argumento.

### Aberto e aceito

`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` responde **`42501`** — `postgres` não é
superusuário no Supabase. Esse segundo conjunto de defaults concede escrita a `anon` e **não é
fechável**. Registrado em `docs/seguranca.md` §9.1; por causa dele o gate de segurança roda
**diariamente**, não semanalmente.

### O gate que sustenta tudo (SEC-04)

RLS, grants, policies e privilégios de função não eram verificados por **nada** — a conferência
era um checklist trimestral manual, e o dono alimenta o banco pelo painel com service role. Agora
há a RPC `divat_security_shape()` + `scripts/check_grants.mjs`, em job independente no
`db-checks.yml`. A RPC devolve **fatos derivados**, não ACL crua (ponto do parecer, e o mais
valioso dele): `proacl` nulo não é "sem acesso", é o *default* do PostgreSQL — um gate lendo ACL
crua trataria a função recém-criada, a mais perigosa, como a mais fechada. Bancada em
`tests/check_grants.rig.mjs`, 13 casos, **dois deles cobrindo fail-open**: RPC devolvendo lista
vazia ou faltando campo tem de **abortar**, não relatar "nenhum achado".

### Frontend: a CSP fecha (SEC-08)

A premissa que o handoff anterior deixou explicitamente por conferir foi **medida em Chromium
headless** antes de qualquer mudança: markup `style=` e `setAttribute('style')` são bloqueados;
CSSOM (`el.style.x`, `setProperty`) é permitido. (`cssText` **não** é bloqueado — correção ao
parecer.) Os 10 atributos saíram: os 4 de accent eram **sempre a mesma constante** e viraram
`--accent`/`--accent-soft` estáticos no `:root`; larguras de `<th>` viraram classes `.w-*`; os 3
`display:none` viraram `.is-hidden`, obrigando 8 sites de `.style.display` a virarem `classList`.
`vercel.json` passa a `style-src 'self'; style-src-attr 'none'`.

Como o sintoma de uma recaída é **mudo** (a regra simplesmente não acontece, sem erro no console),
foram três guardas: `tests/check.js` §[1] (cobre `index.html` **e** os templates do `app.js`, e
exige classe para toda largura declarada) e a regra Semgrep `divat-style-attr-quebra-csp`. As duas
primeiras foram testadas **plantando a recaída** e vendo o gate ficar vermelho.

E os gates de navegador passaram a servir a **CSP de produção, lida do `vercel.json`**. Rodavam
sem cabeçalho nenhum — num mundo mais permissivo que o real —, então jamais teriam pego uma
regressão de CSP.

### Achados que apareceram ao conferir (nenhum dos relatórios os viu)

- **A baseline de reconstrução não restaurava.** `docs/backup_schema.sql` criava `pg_trgm` e
  `unaccent` `WITH SCHEMA public`, mas as duas estão em `extensions` no banco e `f_unaccent` chama
  `extensions.unaccent` — num restore limpo a função quebra e o índice GIN não é criado.
- **O laço anti-drift estava fechado só pela metade.** A auditoria anterior cobriu o
  `pure.harness.js` e deixou o `harness.js` descoberto: **8 dos 9 exports sem guarda**, incluindo
  `marcarTrunc`/`bannerTrunc`, com 28 testes rodando contra cópias que nada garantia estarem
  atualizadas. Mesmo bug do `ilikeTerm`, um arquivo ao lado. A cobertura varre os dois agora.
- **`backup_rest.mjs` prometia o que não fazia:** o cabeçalho dizia "pagina pela PRIMARY KEY" e o
  código fazia `order=PK` + `offset`, que sob escrita concorrente pula ou duplica linha em
  silêncio. Virou keyset de verdade (com comparação lexicográfica à mão para a PK composta,
  porque o PostgREST não compara tupla), mais conferência contra `Content-Range` e SHA-256.
- **`backup.yml` afirmava que o repositório é público.** É privado.

### O que NÃO ficou encerrado

**SEC-02** e **SEC-06** ficam **mitigados**. A memoização e o cancelamento de busca reduzem a
carga que o *portal* gera, mas não são rate limiting — quem quiser abusar chama o PostgREST direto
com a anon key, que é pública por design; um controle real exigiria Edge Function ou gateway. E o
**restore nunca foi testado ponta a ponta**, apontado desde 16/07. Os dois estão em
`docs/seguranca.md` §9 para não serem redescobertos como novidade na próxima auditoria.

Carimbo: **build 27/07-A** (o Bloco 4 é o único que muda o que o usuário vê).

### Adendo do mesmo dia — o gate achou algo na primeira rodada real

Ao rodar o `check_grants.mjs` contra o payload de produção da RPC (e não contra fixtures), ele
ficou **vermelho**: `anon` e `authenticated` tinham **MAINTAIN** nas 18 tabelas. O `REVOKE ALL`
aplicado antes fechou os **defaults**, que valem só para objetos FUTUROS — as tabelas existentes
nasceram sob o default antigo `anon=rm` e guardaram o privilégio. Corrigido com
`REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated`.

Não havia caminho de abuso pela API pública (o PostgREST só faz CRUD, não `VACUUM`/`LOCK`), mas
era privilégio indevido num portal declaradamente somente-leitura — e é exatamente o que a
correção alegava ter removido. **Fechar o default não conserta o que já existe.**

## 30/07/2026 — 6 cards apagados + Portarias vira tópico-ação

- **6 cards removidos de vez** (loader, render, entrada em `SECTIONS`/`VIEW_TABLES` e ícone
  exclusivo, quando ficava com 0 usos): `folhaRosto` (Folha de Rosto), `folhaDivisoria` (Folha
  Divisória), `ligacoesPorNome` (Ligações pelo Nome), `ligacoesPorNumero` (Identificar pelo
  Número), `relatoriosGerenciais` (Relatórios Gerenciais, com a função pura `resumoRelatorio`) e
  `pesquisaEvento` (Pesquisa de Evento). Os ícones `divider`, `alpha`, `hash` e `chart` saíram do
  objeto `I` por terem ficado sem nenhum uso; `file` e `search` foram conferidos por grep e
  mantidos (servem outros lugares). `isLinhaAtiva` também foi conferido e mantido — `isVigente` e
  o card Empresas dependem dele, mesmo com `resumoRelatorio` fora.
- **Tópico "Portarias" virou tópico-ação**: continua com o mesmo nome na sidebar, mas perdeu a
  grade (só tinha um card real depois da remoção dos outros dois) e ganhou `direct:'portarias'`
  em `SECTIONS`. Clicar no tópico abre o modal de Portarias direto, sem pintar um grid vazio
  atrás — e o painel de fundo fica exatamente onde o usuário estava (não mexe em
  `currentTopicKey`/`expandedTopicKey`/hash). Os metadados do card (`VIEW_META.portarias`,
  `VIEW_TOPIC.portarias`) continuam existindo via um `directMeta` novo no `SECTIONS`, então o
  deep link `#/consulta/portarias` e a busca do topo continuam funcionando como antes.
  `applyRoute` passou a ignorar tópico com `direct` ao calcular o "tópico ativo do painel" (senão
  um `#/topico/ger` antigo, ou o dono do `view`, tentaria pintar uma grade vazia atrás do modal).
  O seletor de documentos da aba nova ("+") também foi ajustado — sem isso o card de Portarias
  teria sumido de lá junto com a grade do tópico.
- **17 views** no lugar de 23 — `scripts/check_views.mjs`, `tests/realtime.test.js`,
  `tests/pure.harness.js`/`pure.test.js` e o `canon` do `tests/check.js` atualizados junto; a
  guarda `[2b]` do `check.js` cobrou os números na prosa (`~23 views` → `~17`, `~60,4%` →
  `~58,8%` da seção `MODAL`, ambos deslocados pela remoção de código).
