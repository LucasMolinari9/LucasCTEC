# Auditoria completa — código, arquitetura, engenharia e documentação (08/08/2026)

> **Snapshot datado — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`; a cronologia,
> no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma auditoria feita em 08/08/2026 sobre o
> commit `e09893d`, e envelhece de propósito.

**Método.** Cinco eixos auditados em paralelo (frontend, documentação, testes/CI, banco/segurança,
produto/operação). Todo achado de severidade ALTA ou CRÍTICA foi **reconferido à mão** contra o
repositório antes de entrar aqui — dois números relatados pelos auditores foram corrigidos na
verificação e um achado mudou de natureza. Onde a medição não foi possível, está escrito.

**Limites desta auditoria (importantes).** O ambiente não alcança o Supabase nem a Vercel (o proxy
devolve `403`). Portanto: nada aqui foi medido contra o **banco vivo** nem contra o **site em
produção**. O que sustenta as afirmações sobre banco é o SQL versionado, os baselines e os scripts.
Afirmações não verificáveis daqui estão marcadas **[DOC]**.

---

## Veredito em um parágrafo

Este é um projeto **incomumente bem construído para o seu porte** — CSP sem nenhum `unsafe-*`,
read-only real no banco, gates que falham fechado, baseline de dívida versionada em vez de gate
ignorado, e prosa que registra quando uma afirmação anterior foi desmentida por medição. O problema
não está na disciplina; está em **duas asserções mal desenhadas no centro dela**. A guarda
anti-drift não compara nada, e a bancada de views ignora o `select=`. As duas juntas significam que
a rede de segurança pode estar verde com o portal quebrado — e isso vale mais que a soma de todos os
outros achados deste documento.

---

## Tópico 1 — A rede de testes tem um furo no centro (CRÍTICO)

### 1.1 A guarda anti-drift não compara nada

A técnica declarada do projeto é: funções puras são copiadas *verbatim* para `tests/*.harness.js`,
os testes rodam sobre a cópia, e uma guarda anti-drift garante que a cópia continua igual ao
original. **A guarda não faz isso.**

`tests/check.js:211` é `if (js.includes(snippet))` — uma **sondagem de substring** contra o
`app.js`, não uma comparação. E **15 das 50 entradas do `canon` são apenas a assinatura da
função** (medido: entradas cujo trecho termina em `{`):

```
matchEvent · terminaisDoMunicipio · municipiosExatos · tabMatchesEvent · dispatchRealtime
sbFetch · selecionarSupabase · fetchComTimeout · marcarTrunc · bannerTrunc · rjOrder
resumoFrota · filtrarFrotaEmpresas · openTabState · closeTabState
```

Para essas 15, a guarda pergunta se existe uma linha `function matchEvent(r, c){` no `app.js`. O
corpo é irrelevante.

**Reproduzido nesta auditoria** (numa cópia em scratchpad; o repositório não foi tocado — `git
status` limpo ao final). Substituindo o corpo inteiro de `matchEvent` por `return false;` e mantendo
a assinatura:

```
✓ matchEvent
✓ pure.test.js — placar 213/213
✓ check.js: tudo verde.          EXIT=0
```

O laço das 17 views também passa (`ok historicoLinha`, `ok historicoEmpresa`). Em produção, o filtro
do Histórico devolveria **zero resultado para todo evento**, e nenhum gate do projeto acusaria.

A causa é estrutural, não descuido: **os testes exercitam a cópia, não o `app.js`.** A guarda era a
única coisa ligando as duas, e ela não liga. Isso vale para as 50 cópias — as 35 com trecho longo
estão mais protegidas por acidente (mais texto = mais chance de o `includes` falhar), não por
desenho.

**Correção — ALTA / P.** Trocar `js.includes(snippet)` por: extrair o bloco da função no `app.js`
(contagem de chaves a partir da assinatura) e comparar por igualdade normalizada com o corpo no
harness. O `canon` já tem os nomes; falta o extrator, ~15 linhas. Enquanto isso não existir, **o
placar de 330 asserções mede menos do que aparenta**.

### 1.2 A bancada de views ignora o `select=`

`scripts/lib/rig.mjs:214` pula explicitamente `select` ao servir a fixture:

```js
if (['select', 'order', 'limit', 'offset', 'or'].includes(key)) continue;
```

Consequência: a bancada devolve a fixture inteira independentemente das colunas pedidas, e **uma
coluna inexistente não produz erro nenhum**. Em produção o PostgREST responde `HTTP 400` e a view
mostra `errorBox`. Trocar um nome de coluna no `select=` do `app.js` mantém as 17 views verdes.

Isso torna o `check_views.mjs` cego exatamente ao modo de falha que o `CLAUDE.md` mais teme e
descreve como "dado errado na tela, sem erro nenhum".

**Agravante medido — três colunas de produção não existem nas fixtures:**

| Coluna pedida em produção | Onde | Fixture |
|---|---|---|
| `codempresa_teste.processo` | `app.js:1943` (`historicoEmpresa`) | ausente (`rig.mjs:121-124`) |
| `codempresa_teste.data_publicacao` | `app.js:1943` | ausente |
| `tarifa_atual_teste.nome_ligacao_cresc` | `app.js:2609` (`localidades`) | ausente |

As três existem no banco [DOC: `docs/backup_schema.sql:67-68,80`]. As views que as usam são
exercitadas pelo laço e passam verdes renderizando `undefined`. **Um rename dessas três colunas não
seria pego por gate nenhum.**

**Correção — ALTA / P.** Fazer o `serve()` projetar as colunas de `select=` e responder `400` para
coluna ausente na fixture; completar as três fixtures. Isso converte o vetor mais perigoso do
projeto em vermelho.

### 1.3 O que o laço de views realmente afirma

`check_views.mjs:143-144` exige apenas `corpo ≠ 0` — **um caractere passa**. O próprio cabeçalho do
script declara isso (`:11-12`), então não é engano; é escopo. Mas convém não confundir o verde dele
com "a view está certa": `historicoLinha`, `frota` e `historicoEmpresa` passam com **zero linhas de
tabela**.

**Melhoria — MÉDIA / M.** Contrato mínimo por view (nº de linhas esperado, cabeçalhos), em vez de
"corpo ≠ 0".

### 1.4 Cobertura medida

Instrumentação V8 no mesmo cenário do `check_views`: **156 de 249 funções** executadas (62,7%);
união com o harness, **170 (68,3%)**; **79 funções (31,7%) não são tocadas por nada**. As mais caras
entre elas: `baixarPdf`/`exportViaPrint`/`cleanupPrint` (**o PDF inteiro**), `errorBox` (**nenhum
caminho de erro HTTP é exercitado em navegador**), e todo o ciclo `onRealtime`/`initRealtime`/
`markStale`/`reloadTab` (**o Realtime ponta a ponta**, porque a bancada não emite `wss`).

---

## Tópico 2 — Banco: o schema não é reproduzível, e a baseline já derivou

### 2.1 O modelo de mudança

Existe **uma** migração (`supabase/migrations/20260729034018_phase3_moderate_hardening.sql`) e ela
**não cria nenhuma tabela**. As 18 tabelas nascem em `docs/backup_schema.sql`, que não é migração:
é script de reconstrução mantido por **transcrição manual** do que foi feito no painel.

O git não vê o DDL; vê a cópia. **Consequência: o schema atual não é reproduzível por migrações** —
só pela baseline, e só se a transcrição estiver em dia. Ela já não está.

### 2.2 Três derivas na baseline que só doem no dia do restore

| # | Deriva | Verificação | Severidade |
|---|---|---|---|
| 1 | **`db_max_rows` e `statement_timeout` ausentes.** `grep` por `db_max_rows\|statement_timeout\|ALTER ROLE\|authenticator` em `docs/backup_schema.sql` → **0 ocorrências.** | Confirmado à mão | **ALTA / P** |
| 2 | **7 `GRANT EXECUTE … TO anon, authenticated`** (linhas 316, 341, 364, 470, 504, 522, 602) — padrão que a regra (e) do `check_migrations.mjs:67-69` **reprova** numa migração. Quatro deles são as RPCs de auditoria que a fase 3 move para `audit`. | Confirmado à mão | **MÉDIA / P** |
| 3 | **`rls_auto_enable()`** é documentada em `docs/schema.md:161,179` e não tem DDL em lugar nenhum do repo. | Confirmado à mão | **MÉDIA / P** |

A #1 é a mais séria e merece o detalhe: `pgrst.db_max_rows = 30000` é citado no `CLAUDE.md:80` como
controle ativo, e é o teto que impede varredura da base pela chave pública. **Um restore a partir da
baseline devolve o banco sem esse teto** — o portal continua funcionando normalmente (todos os
`limit` são ≤ 30000), então a perda é silenciosa. É o item SEC-02 do `docs/seguranca.md:167`
reaparecendo por um caminho que ninguém vigia.

**Correção — P.** Versionar os `ALTER ROLE authenticator SET pgrst.db_max_rows` e o
`statement_timeout` do `anon` na baseline, e alinhar os 7 `GRANT EXECUTE` ao contrato de migração.
Nenhuma das duas quebra o portal: a primeira **restaura** um limite que a produção já tem [DOC], a
segunda só remove `authenticated` de funções que `anon` continua executando.

### 2.3 A armadilha do `marcarTrunc`

`app.js:147-155` só marca truncagem quando `data.length >= lim`, sendo `lim` o `limit` **pedido**.
Se um dia um `limit=50000` for emitido sem subir o `db_max_rows`, o PostgREST devolve 30.000, a
condição `30000 >= 50000` é falsa, e **a lista sai cortada sem banner e sem toast**. Hoje não
dispara — os 5 maiores `limit` são exatamente 30000 (`app.js:516,1513,2085,2162,2219`). É uma
armadilha armada para a próxima consulta grande, não um bug ativo. **MÉDIA / P.**

### 2.4 Integridade: convenção, não restrição

Há **uma única FK declarada** no banco: `fk_tarifa_linha` [DOC: `backup_schema.sql:252-259`]. As
outras 11 ligações do modelo hub-and-spoke são convenção resolvida em JS. Por isso as 17 codlinhas
órfãs existem, e por isso a política de baseline do `check_data_quality.mjs` é a resposta certa —
ela está bem argumentada e bem desenhada (a política mora no repo, o rebaixamento **imprime** em vez
de silenciar, e `--atualizar-baseline` preserva a lista escrita à mão).

Três limites reais desse gate:
- **compara contagem, não lista** — uma órfã corrigida e outra criada mantêm o número. O baseline
  avisa disso, mas nenhuma automação lê `orfaos_conhecidos`;
- **achado novo em `evento_teste` sai como aviso** — preço explícito e aceito. Já há um caso na
  sombra: `186006400`, evento de 2021 classificado no próprio baseline como "suspeito de digitação";
- **não mede `codempresa` órfã** em `qh_teste`/`itinerario_teste`/`evento_teste`, nem
  `cod_municipio_origem` órfão — duas convenções documentadas sem alarme nenhum. **MÉDIA / M.**

### 2.5 Segurança: sólida, com um fail-open

A postura é boa e — o que é raro — **verificada em vez de afirmada**: RLS nas 18 tabelas, policies
todas `FOR SELECT TO anon`, `REVOKE` largo motivado por medição (108 grants indevidos num projeto
novo; RLS não bloqueia TRUNCATE), default deny para objeto novo, CSP sem `unsafe-*`, zero terceiros
em runtime. A anon key pública no `app.js:25` não é vazamento — é o desenho do Supabase, e a postura
que a torna inócua é conferida diariamente.

**O fail-open (achado E, agora com nome).** `scripts/check_grants.mjs:83-86` aborta quando a RPC
devolve zero tabelas, com o raciocínio certo escrito no código: *"Isso não é 'tudo certo', é visão
perdida"*. **O mesmo raciocínio não foi aplicado a `funcoes` e `default_privileges`** — lista vazia
nesses dois passa como "nenhum achado". São exatamente os dois eixos onde mora o risco 9.1 (os
defaults do `supabase_admin`, que não são fecháveis). **ALTA / P** — replicar o guard.

Outras lacunas do mesmo script: ele detecta privilégio **a mais**, nunca **a menos** (uma policy
`anon_read_*` apagada passa verde e o portal quebra); não olha `USING`/`WITH CHECK`; e não vê
schemas, roles, extensões nem os `ALTER ROLE` do item 2.2.

---

## Tópico 3 — Frontend: saudável, com bugs pontuais

O `app.js` está **melhor do que o tamanho sugere**. Medições que merecem registro: **apenas 1 função
acima de 80 linhas** (`mostrarLinhasPorLocalidade`, 81); **zero** funções mortas; **zero**
`console.log`; **zero** TODO/FIXME; **zero** N+1 (os 56 `sbFetch` estão agrupados em 19
`Promise.all`); **zero** vazamento de listener; debounce consistente e `AbortController` na busca.
O peso do bloco `MODAL` (1.981 linhas, 58,6%) é estrutural, distribuído em ~90 funções pequenas —
não vale fatiar, e fatiar contrariaria a decisão zero-build.

**Bugs confirmados:**

1. **Cache envenenado em `getEvLookups` — MÉDIA / P.** `app.js:551-552` grava `evLookups.emp={}`
   *depois* do `.catch(()=>[])`. Objeto vazio é *truthy*, então `if (!evLookups.emp)` nunca mais
   dispara: **uma falha transitória de rede deixa os lookups de evento permanentemente vazios
   naquela sessão**, e o Histórico passa a mostrar ids crus em vez de nomes de evento — sem erro.
   Correção: só gravar o cache quando o fetch der certo.

2. **Três bypasses do seam do ciclo de vida — MÉDIA / P.** `LOADERS.secoesPorLigacao`
   (`app.js:2307-2314`), `LOADERS.portarias` (`2432-2442`) e `mostrarLinhasEntreMunicipios`
   (`2182-2232`) escrevem `innerHTML` depois de um `await` sem chamar `beginGen`. O caso mais claro é
   o terceiro: a função irmã `mostrarLinhasPorLocalidade` captura corretamente (`2555`), e **as duas
   são chamadas do mesmo `run()`** — assimetria dentro do mesmo fluxo. O `CLAUDE.md` tem 31 linhas
   explicando por que isso importa; três call sites não seguem.

3. **Seis listas `select=` duplicadas — ALTA / M.** `renderEstrutura` (`app.js:1794-1825`) refaz as
   colunas de cinco outros documentos (`1433↔1801`, `1531↔1802`, `1532↔1803`, `1534/1668↔1800`,
   `1778↔1804`), e `1392↔1941` repete as de evento. Isto é o combustível do §1.2: a coluna diverge
   num lugar e não no outro, e a tela fica vazia sem erro. Extrair 6 constantes fecha a classe
   inteira.

**Acessibilidade — o que existe é bom, o que falta é pequeno.** Já existem: `lang`, hierarquia de
títulos correta, landmarks, `role="dialog" aria-modal`, foco movido e **restaurado**, Esc, focus
trap, Enter/Espaço em linhas clicáveis, setas no dropdown, `role="status"` nos toasts. Faltam:

- 4 controles de Portarias com `<label>` **irmão sem `for=`** (`app.js:2436-2439`) → sem nome
  acessível. A barra irmã de eventos faz certo. **MÉDIA / P**;
- panes sem `role="tabpanel"`/`aria-controls` (o `role="tab"` existe) — **MÉDIA / P**;
- focus trap não filtra panes ocultos (`app.js:798`) — *hipótese não medida em navegador*: com ≥2
  abas, o foco pode escapar do diálogo. **MÉDIA / P**;
- 3 contrastes abaixo de 4,5:1 — `.doc-head .sub` (3,49), `.doc-foot` (3,54), `.side-eyebrow`
  (3,69). **MÉDIA / P**. Para portal de órgão público este é o item com argumento externo.

**CSS — BAIXA.** 13 seletores órfãos (o bloco `.fd-*` de "folha de rosto", `styles.css:812-819`, é
resíduo de código removido); apenas 1 duplicação real de regra em 433; 6 marcadores de seção para
907 linhas (contra 15 + 18 sub-marcas no `app.js` — a navegabilidade do CSS está abaixo do padrão
do próprio projeto).

---

## Tópico 4 — Documentação: bem cuidada, e derivando onde a guarda não olha

O sistema de docs é bom: 26 links resolvem, o `CLAUDE.md` é hub real citado por 24 docs, os **68
identificadores citados no `CLAUDE.md` existem todos no `app.js`**, a separação estado × cronologia
é respeitada, e o `tests/README.md` **recusa deliberadamente** fixar a contagem de testes ("pinar
contagem em prosa drifta"). A guarda `[2b]` funciona — todas as derivas abaixo estão **fora** do
escopo dela, nenhuma dentro.

**As derivas (todas conferidas contra o código):**

| # | Onde | O que diz | O que é |
|---|---|---|---|
| **D1** | `estrutura-frontend.md:160` | "**NÃO paginado**: Frota por Empresa" | `app.js:2407-2410` chama `paginateTable(… pageSize:25 …)` |
| **D2** | `adr/0002:9-10` | "somente `divatdetro.vercel.app` … usa produção" | `app.js:42-44` tem **3 hosts** |
| **D3** | `CLAUDE.md:428-432` | `.claude/skills/` = "14 skills + `db-change`" | **36 entradas**: 15 diretórios reais + **21 symlinks** |
| **D4** | `CLAUDE.md:93-101` | mapa tabela→card com **12** tabelas | `RT_TABLES` tem **14**; falta o tópico **Portarias** inteiro |
| **D5** | `estrutura-frontend.md:170` / `CLAUDE.md:351` | 2 e 3 consumidores de `pdf:false` | **4** call sites — e os dois docs divergem entre si |
| **D6** | `check_views.mjs:5` | "~62% do app.js é a seção MODAL" | **58,6%** — comentário de `.mjs` está fora da varredura da `[2b]` |
| **D7** | `analise-duplicacao.md:10` | "o frontend é um único `index.html`" | pré-split de 21-22/07; ~50 citações `index.html:NNNN` intraduzíveis |

**A D2 é a mais perigosa e a única ALTA.** É um **ADR**, ou seja, normativo. `app.js:38-44` tem um
comentário explicando que até 29/07 só o canônico estava na lista e **os outros dois serviam
conteúdo de produção lendo o banco de teste** — "o sintoma é o pior possível: dado errado na tela,
sem erro nenhum". O ADR ficou congelado na versão anterior a essa descoberta. Alguém que siga o ADR
recria o bug. **Correção: P.**

**A D3 merece explicação porque muda de natureza na verificação.** `.claude/skills/` tem 36
entradas, mas **não há duplicação de conteúdo**: 15 são diretórios reais (14 do Superpowers +
`db-change`) e **21 são symlinks para `.agents/skills/`**, um segundo conjunto de skills vindo de
`mattpocock/skills` e travado em `skills-lock.json` (21 entradas com hash, 95 arquivos no git). É um
desenho deliberado e limpo. O problema é que **nenhum `.md` do projeto menciona `.agents/`,
`skills-lock.json` ou a origem `mattpocock`** — a única ocorrência em toda a documentação é o
cabeçalho de uma tabela em `docs/agents/triage-labels.md:6`. A guarda passa porque conta contra o
manifesto, não contra o diretório. **MÉDIA / M.**

**Estrutura.** 33 arquivos `.md`, 6.407 linhas: **16 vivos** (2.141 linhas) e **17 snapshots**
(4.143). Quatro snapshots (896 linhas) não são citados por nenhum outro doc. Não é entulho — é
histórico com valor de auditoria — mas **não há critério declarado** de arquivamento, e 12
arquivos/2.637 linhas não aparecem no README nem por nome nem por diretório, incluindo
`docs/planos/fase-3-hardening-moderado.md`, que é **vivo e normativo**.

**Densidade do `CLAUDE.md`.** 462 linhas, 5.195 palavras, lido no início de toda sessão. 71% em
quatro seções; o bloco 2a-2e (~119 linhas) é **runbook de gates**, não contexto — descreve órfãs
individuais e unidades de `qtd` que **já estão** no `data_quality_baseline.json` (o campo `nota`
repete quase palavra por palavra). Cortar para um ponteiro de 3 linhas: **−70 linhas, esforço P.**

**Buracos.** Sem runbook de operação do dono — todo o assunto do ETL cabe em `CLAUDE.md:79` ("direto
pelo painel"), e o próprio `CLAUDE.md:337-340` manda replicar correção na staging "senão o rebuild
do ETL desfaz", **sem que nenhum doc descreva o rebuild**. Só 3 ADRs, e nenhum cobre as decisões
maiores (zero-build, CSP sem `unsafe-inline`, o seam, default deny, baseline como política).
`CONTEXT.md` tem **2 termos** e não define `linha`, `ligação`, `seção`, `codlinha`, `vigente`.

---

## Tópico 5 — Produto e operação: o que falta

1. **Zero telemetria — ALTA.** Nenhum analytics, error tracking ou beacon em `app.js`, `index.html`
   ou `vercel.json`. **Se uma view quebrar para um usuário real, ninguém fica sabendo.** O
   `check_deploy.mjs` é retrato do momento do deploy, não vigilância. Somado ao §1.1 e ao §1.2, o
   projeto não tem nem detecção prévia confiável nem detecção posterior.

2. **O modo de falha silencioso tem uma ponta de UX que ninguém ligou — ALTA.** As codlinhas órfãs
   fazem a view renderizar vazia, e o `emptyBox` responde *"Nenhum itinerário cadastrado para esta
   linha"* (`app.js:1416`). **Para o cidadão, dado corrompido e linha genuinamente sem itinerário
   são a mesma tela.** O portal afirma com confiança algo que não sabe. Correção barata: quando a
   linha existe no hub e a tabela filha não tem nenhuma linha, dizer que o documento não foi
   localizado — não que ele não existe.

3. **Sem canal de retorno — MÉDIA.** Portal público, problemas de dado reais e conhecidos, e nenhum
   caminho para um usuário avisar. Um `mailto:` no rodapé já mudaria isso.

4. **PWA pela metade — MÉDIA / P.** `manifest.webmanifest` declara `display: standalone` com 5
   ícones (todos presentes em `vendor/`), mas **não há service worker** em lugar nenhum. O navegador
   oferece "instalar app"; instalado, ele morre offline. Ou entra um SW mínimo (a CSP `default-src
   'self'` permite; o `.vercelignore` é allowlist e precisaria abrir o arquivo), ou sai o
   `display: standalone`.

5. **A ambição de SEO não é entregável nesta arquitetura — MÉDIA.** `index.html` traz
   `robots: index,follow`, `description` e 5 tags Open Graph, mas o conteúdo é SPA com rota por hash
   e dado vindo de `fetch` — Google não indexa `#/linha/101`. Não há `robots.txt`, `sitemap.xml` nem
   `canonical`. Um portal público de consulta que não aparece na busca por "itinerário linha X
   DETRO" perde a maior porta de entrada que teria. Isto é decisão de produto, não bug: ou se aceita
   que a descoberta é por link direto, ou a arquitetura precisaria de renderização no servidor —
   o que contraria o zero-build.

6. **Rastreador derivando — BAIXA / P.** Das 11 issues abertas, **#50** (abas no modal) está
   entregue (`MAX_TABS = 5` em `app.js:459`, com `check_abas.mjs` guardando) e **#63** (qualidade de
   dados) também (`check_data_quality.mjs` roda semanal em `db-checks.yml:98`) — o `CLAUDE.md` chega
   a afirmar "fecha a issue #63". Duas issues entregues e abertas.

7. **`deploy-smoke` pode não estar rodando — MÉDIA / P.** Ele dispara por `deployment_status`, que
   só existe pela integração Vercel↔GitHub. *Hipótese não verificável daqui*: no caminho alternativo
   (MCP `deploy_to_vercel`) nenhum `deployment_status` é emitido e o smoke não roda. Vale conferir na
   aba Actions se houve run recente.

---

## O que está bom (e não deve ser mexido)

Vale registrar, porque a lista de achados acima não dá a medida do conjunto:

- **Gates falham fechado, sem exceção** — medido: os quatro que dependem de rede saem com `EXIT=1` e
  diagnóstico explícito quando o proxy bloqueia. Zero `continue-on-error` no repositório inteiro,
  permissões mínimas, actions presas a SHA, Playwright e Semgrep em versão fixa.
- **Jobs separados de propósito** para que um vermelho não esconda o outro — disciplina de projeto
  grande.
- **Duas meta-guardas** que a maioria dos repositórios não tem: view nova não listada no
  `check_views` falha, e símbolo exportado por harness sem guarda no `canon` falha.
- **`backup_rest.mjs`** compara o baixado com a contagem do servidor e aborta com "BACKUP
  INCOMPLETO" em vez de produzir dump vazio verde.
- **Baseline de dívida versionada** (`data_quality_baseline.json`) — a resposta certa para dívida
  real: não mente e não vira gate que se aprende a ignorar.
- **A migração da fase 3** tem pré-condições, 10 asserções em runtime e smoke com credencial
  própria. É engenharia acima da média.
- **A prosa registra quando errou** (`CLAUDE.md:64-75` é o modelo do gênero) e distingue medição de
  suposição. Foi por isso que esta auditoria conseguiu ser específica.

---

## Plano

Quatro blocos, na ordem em que devem ser feitos. O bloco 1 vem primeiro porque **os outros três só
são confiáveis depois dele** — enquanto a rede tiver os dois furos do Tópico 1, qualquer verde é
inconclusivo.

### Bloco 1 — Devolver sentido ao verde (esforço P, maior retorno do projeto)

1. `tests/check.js`: extrator de bloco + comparação de igualdade, no lugar do `js.includes`.
   Esperar que **algumas cópias acusem deriva real** ao ligar — é o objetivo.
2. `scripts/lib/rig.mjs`: `serve()` projeta `select=` e responde `400` para coluna ausente.
3. Completar as 3 fixtures (`codempresa_teste.processo`, `.data_publicacao`,
   `tarifa_atual_teste.nome_ligacao_cresc`).
4. `scripts/check_grants.mjs`: replicar o guard de "visão perdida" para `funcoes` e
   `default_privileges`.

### Bloco 2 — Fechar o que dói no dia do restore (esforço P)

5. Versionar `ALTER ROLE authenticator SET pgrst.db_max_rows` e o `statement_timeout` do `anon` em
   `docs/backup_schema.sql`.
6. Alinhar os 7 `GRANT EXECUTE … TO anon, authenticated` ao contrato do `check_migrations.mjs`.
7. Registrar `rls_auto_enable()` (DDL ou nota explícita de que é objeto de plataforma).
8. Corrigir o **ADR-0002** para os 3 hosts de `HOSTS_PROD`.

> Nenhum destes muda comportamento do portal. O item 5 **restaura** um limite que a produção já tem
> [DOC]; o 6 remove `authenticated` de funções que `anon` continua executando; o 7 e o 8 são texto.

### Bloco 3 — Bugs e acessibilidade (esforço P–M)

9. `getEvLookups`: só gravar cache em caso de sucesso.
10. Três bypasses do seam (`secoesPorLigacao`, `portarias`, `mostrarLinhasEntreMunicipios`).
11. Extrair as 6 listas `select=` duplicadas para constantes.
12. Acessibilidade: `for=` nos 4 controles de Portarias, `role="tabpanel"`, filtro de panes ocultos
    no focus trap, 3 contrastes.
13. Distinguir "não cadastrado" de "não localizado" nos `emptyBox` de linha existente.

### Bloco 4 — Documentação e operação (esforço P–M)

14. Corrigir D1, D4, D5, D6; marcar `analise-duplicacao.md` como pré-split.
15. Documentar `.agents/skills/` + `skills-lock.json` + origem `mattpocock` no `CLAUDE.md`.
16. Mover os 17 snapshots para `docs/historico/`, com uma linha de cabeçalho em cada; unificar
    `docs/planos/` como único lugar de plano vivo.
17. Enxugar o bloco 2a-2e do `CLAUDE.md` para ponteiro (−70 linhas).
18. Escrever o runbook de ETL do dono (o rebuild da staging, hoje não descrito em lugar nenhum).
19. Fechar as issues #50 e #63.
20. Decidir telemetria (mesmo que seja um contador de erro próprio, sem terceiro — a CSP
    `connect-src` precisaria abrir) e canal de retorno no rodapé.

### Guardas novas que valem a pena (transformar prosa em gate)

Cada uma custa P e mata uma classe de deriva desta auditoria:

- incluir `docs/adr/` e `docs/planos/` em `DOCS_VIVOS` (mataria D2);
- incluir `scripts/*.mjs` na varredura de fatos numéricos (mataria D6);
- cobrar que as tabelas de `RT_TABLES` apareçam no mapa tabela→card (mataria D4);
- contar as entradas de `.claude/skills/` e cobrar o número no `CLAUDE.md` (mataria D3).
