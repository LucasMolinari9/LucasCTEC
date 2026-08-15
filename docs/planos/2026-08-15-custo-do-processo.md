# Custo do processo — auditoria gate a gate

Escrito em 15/08/2026. **Sessão 5** do plano de 6
([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md)).
Sem mudança de código, sem SQL, sem risco para o site.

Este é um **plano vivo**, não um retrato: a tabela de vereditos é para ser executada, e o critério
de parada da última seção fica em vigor depois que ela for. As **medições** têm data e devem ser
refeitas por quem executar um veredito — os comandos estão em cada linha.

## Por que existe

Uma crítica externa disse que "o processo virou um projeto paralelo". A apuração de 14/08 deu
**procede**, com a razão medida em 2,8 : 1 entre linhas de processo e linhas de produto servido. As
Sessões 2 a 4 responderam a essa crítica pela via mais barata que havia — extrair função pura para
`src/domain/` apaga a cópia de teste *e* a guarda `@canon` junto. Essa via está quase esgotada, e o
que sobra é a pergunta que ninguém tinha feito ainda, gate a gate: **este aqui já pegou alguma
coisa?**

Regra de escrita, herdada do plano irmão
([`2026-08-14-modularizacao-fatias-3-4.md`](2026-08-14-modularizacao-fatias-3-4.md)): **toda
afirmação sobre comportamento cita arquivo, data ou PR.** "Impressão de que ajuda" não entra na
coluna de evidência. Onde não achei evidência, a coluna diz *nenhuma registrada* — que é um dado,
não um vazio.

## Como ler as três colunas

- **Já pegou de verdade** — um defeito real que este gate barrou, com citação do
  [`../CHANGELOG.md`](../CHANGELOG.md), de um PR ou de um run do Actions. Uma guarda cuja única
  história é *ter sido consertada* não conta como ter pego algo: conta como ter custado.
- **Custo por rodada** — tempo medido. Onde há dois números, o primeiro é neste container em
  15/08/2026 e o segundo é a **mediana das últimas 30 execuções** do workflow correspondente no
  GitHub Actions (janela de 14/08 19:24 a 15/08 19:09 UTC para `ci`/`views`/`semgrep`, mais larga
  para os demais). Trinta execuções é uma amostra curta: serve para o custo, **não** para estimar
  taxa de vermelho.
- **Veredito** — manter / fundir / aposentar, com a condição que dispara a mudança. Um veredito
  sem condição é opinião.

## O tamanho do processo hoje, remedido

Medido **contra dois commits com o mesmo comando**, para a comparação valer: `fb469ea` (o pai do
merge da Sessão 2, que é o estado que a apuração de 14/08 mediu) e `af918e5` (a `main` de hoje,
depois da Sessão 4). Produto = `app.js` + `styles.css` + `index.html` + `src/domain/*.mjs`; gates =
todo arquivo sob `tests/` e `scripts/`; docs = todo `.md` sob `docs/`.

| Conjunto | `fb469ea` (pré-Sessão 2) | `af918e5` (hoje) |
|---|---|---|
| Produto servido | 4.773 | **4.867** |
| Gates e testes | 5.941 | **5.935** |
| Documentação | 8.536 | **9.091** |
| **Razão processo : produto** | **3,03 : 1** | **3,09 : 1** |

O produto bate **exatamente** com o número publicado em 14/08 (4.773), o que confirma o método
daquela coluna. A razão de lá — 2,8 : 1 — vem de uma contagem de gates mais estreita (4.480 contra
os 5.941 que o diretório inteiro dá no mesmo commit); **as duas séries não se comparam entre si**, e
a desta tabela é a que tem os dois pontos medidos pelo mesmo comando.

**O que a série mostra é o achado mais desconfortável desta auditoria: a razão não caiu.** As
Sessões 2 a 4 fizeram exatamente o que prometeram — `tests/pure.harness.js` caiu de 305 linhas para
**34**, e não sobrou nenhum bloco `@canon` nele —, o total de gates ficou praticamente parado
(−6 linhas) e a razão ainda assim **subiu de 3,03 para 3,09**. Não é contradição: as cópias que
saíram do harness viraram módulos e testes de módulo, e as mesmas sessões acrescentaram 555 linhas
de documentação. Extrair função pura corta a cópia; **não corta a prosa que descreve o corte.**

Duas leituras válidas, e a escolha entre elas é do dono:

1. A razão é o número errado para perseguir. Documentação de um projeto operado por uma pessoa que
   trabalha pelo celular é ferramenta de trabalho, não overhead.
2. A razão importa, e então o alvo não são os gates — que ficaram parados — é `docs/`, onde estão
   9.091 das 15.026 linhas de processo, e de onde veio todo o crescimento do período.

Este documento assume a leitura 2 para a seção de docs e a leitura 1 para os gates, e diz em cada
caso por quê.

Fora dessas contas, por não serem escritas neste repo: `.semgrep/vendor/` (13.458 linhas, cópia
versionada de rulesets de terceiro), `.claude/skills/` e `.agents/` (skills vendorizadas) e
`vendor/` (supabase-js e fontes). Vendorizado ocupa disco, não atenção.

## Tabela A — as seções do gate offline (`node tests/check.js`)

O arquivo inteiro custa **6 s** neste container e **21 s** de mediana no `ci.yml`. As seções não
são separáveis em custo; a tabela existe para separá-las em *valor*.

| Seção | Já pegou de verdade | Custo | Veredito |
|---|---|---|---|
| **[1]** sintaxe do `app.js`, `<script>` inline, allowlist do `.vercelignore` | **Três vezes, cada uma reproduzida.** O portal caiu inteiro em 10/08 por módulo fora da allowlist; a guarda nasceu disso e reprovou de verdade na 1ª rodada da Sessão 2 (CHANGELOG 14/08) e de novo na Sessão 3 (CHANGELOG 15/08), nomeando arquivo e importador | incluído nos 6 s | **Manter.** O gate com a melhor razão evidência/custo do repo |
| **[1]** `style=` em markup (CSP `style-src-attr 'none'`) | Achado SEC-08, 27/07: a guarda foi provada plantando a recaída. Sintoma real é **mudo** — a regra simplesmente não acontece | idem | **Manter** |
| **[1b]** nenhuma JWT `service_role` nos arquivos servidos | Nenhuma registrada — sempre verde | idem | **Manter.** Custo zero, consequência de um vazamento é irreversível. É seguro por assimetria, não por histórico |
| **[1c]** `env:` de workflow sem chave duplicada por caixa | **Uma, e cara:** em 31/07 o `ci.yml` ficou **morto por horas**, com PRs passando verdes porque os *outros* workflows rodavam. Workflow rejeitado não vira job vermelho — nasce e morre com zero jobs | idem | **Manter.** Guarda contra gate ausente vale mais que guarda contra gate errado |
| **[2]** anti-drift `@canon` das cópias verbatim | **Nenhuma deriva real registrada em 12 meses de CHANGELOG.** O histórico dela é de consertos *nela mesma*: 15 de 50 entradas eram só assinatura (PR #106, 08/08), `harness.js` com 8 de 9 exports sem guarda (27/07), isenção por nome furada (Codex no PR #125, 14/08) | idem | **Aposentar quando a Fase B fechar.** Restam **12** cópias, todas em `tests/harness.js` (`sbFetch` e companhia). Zero em `pure.harness.js`. Com a última, `canon.js` (56) + `drift.test.js` (72) + a §[2] saem juntos — ~430 linhas que deixaram de ter objeto |
| **[2b]** deriva docs × código | **A campeã de achados.** `views.yml` afirmando "23 views" e "~62% do app.js" (30/07, 4 divergências, gate vermelho antes e verde depois); mapa `RT_TABLES` com 12 tabelas sob a frase "as 14" (08/08); contagem de regras do Semgrep (14/08); "~59,5%" virando 57,9% na Sessão 3 (15/08) | idem | **Manter e não afrouxar.** Reação certa a um vermelho dela é *atualizar o número*, nunca apagar a frase |
| **[3]** testes unitários | 232 puros + 80 realtime + 49 `sbFetch` + 13 rig + 13 drift + 55 do smoke ESM. Mordem o código servido desde a Sessão 2: trocar `return 0` por `return 9` em `scoreEmpresa` **dentro do módulo** derruba 3 testes (14/08) | idem | **Manter** |

## Tabela B — os gates de navegador (workflow `views.yml`)

Os três rodam no mesmo job, sobre a mesma bancada (`scripts/lib/rig.mjs`). O custo do workflow é
dominado pela instalação do Playwright + Chromium, não pelos scripts.

| Gate | Já pegou de verdade | Custo | Veredito |
|---|---|---|---|
| [`check_views.mjs`](../../scripts/check_views.mjs) — 17 views | **Nenhum defeito do `app.js`, desde a estreia.** 23/23 verdes na 1ª execução (26/07); os 4 vermelhos iniciais eram defeito do teste. Pegou **deriva de inventário** (view no seletor fora de `VIEWS`) e, em 08/08, descobriu-se que ele pulava o `select=` — falso verde no próprio gate | **11 s** local | **Manter, sem ilusão sobre o que ele é.** É seguro contra tela em branco, cobrindo ~58% do `app.js` que nenhum outro gate vê. Zero achados em 3 semanas é o resultado esperado de um seguro, não motivo para cancelá-lo |
| [`check_abas.mjs`](../../scripts/check_abas.mjs) | Nasceu do bug real da aba "+" (issue #50, 24/07), verificado **vermelho antes e verde depois**. Nenhuma regressão desde | **3 s** local | **Manter.** Custo marginal ~zero: o navegador já está instalado pelo gate acima |
| [`check_selecao_linha.mjs`](../../scripts/check_selecao_linha.mjs) | Nasceu de dois bugs relatados pelo dono (31/07): `closeModal` apagando a linha recém-selecionada, e a lista de Localidade sem barra de situação. Conferido vermelho sem **cada** correção | **6 s** local | **Manter.** Mesma economia de escala do anterior |
| **Workflow `views.yml` inteiro** | — | **57 s** de mediana no CI (n=30); ~30 s são `playwright install` | **Manter.** O cache do Chromium segue de fora por falta do SHA do `actions/cache` — economia cosmética de ~20 s, registrada em 26/07 e ainda válida |

## Tabela C — análise estática (`semgrep.yml`)

| Gate | Já pegou de verdade | Custo | Veredito |
|---|---|---|---|
| **5 regras locais** (`.semgrep/rules/divat.yml`) | **Nenhum achado, nunca** — o repo está limpo nelas desde a estreia (25/07). Elas têm teste próprio com caso bom e ruim, então a ausência de achado é verificada, não presumida | — | **Manter.** São o único lugar que conhece os invariantes deste projeto (`pdfHTML` fora do seam, CDN em runtime, `style=`). Regra que nunca dispara num repo limpo é o estado normal de uma regra de invariante |
| **Rulesets vendorizados** (173 regras, `.semgrep/vendor/`) | **Duas vezes, as duas caras.** 7 ocorrências de `github-actions-mutable-action-tag` no 1º CI com rulesets públicos (25/07) — a mesma classe de risco que tirou o jsDelivr; e **3 achados de `run-shell-injection`** que vazaram do local para o CI em 09/08 porque o local rodava só 5 regras | **208 s** local · **50 s** de mediana no CI (n=30) | **Manter.** É o gate mais caro do repo por rodada, e o único com dois achados reais de segurança no histórico |
| **Pendência da Sessão 1** | — | — | **Fechada.** `.semgrep/vendor/.manifest.json` está preenchido, datado de 2026-08-14T22:04:56Z, com link do run e 173 regras em 4 rulesets. O `./scripts/semgrep.sh` rodou aqui **121 regras, 0 achados** — sem o aviso de cópia incompleta. O gap que motivou a Sessão 1 está fechado de fato, não só documentado |

**Custo escondido:** os 208 s locais contra 50 s no CI. Quem desenvolve paga 4× o preço do CI para
rodar o mesmo conjunto. É o único gate deste repo que alguém tem motivo prático para pular — e
pular é exatamente como os 3 achados de shell-injection chegaram ao CI em 09/08. Mitigação
disponível hoje, sem código novo: `./scripts/semgrep.sh --baseline-commit=origin/main` escaneia só
o que a branch introduziu.

## Tabela D — os gates que falam com o banco

Precisam de rede; nenhum roda no ambiente do agente. Todos vivem no `db-checks.yml` (cron diário)
ou no `deriva.yml` (cron semanal).

| Gate | Já pegou de verdade | Custo | Veredito |
|---|---|---|---|
| [`check_grants.mjs`](../../scripts/check_grants.mjs) | **Sim, na 1ª rodada real contra produção** (27/07): `anon` e `authenticated` tinham **MAINTAIN** nas 18 tabelas. O `REVOKE ALL` aplicado antes fechou só os *defaults* — "fechar o default não conserta o que já existe" nasceu daí | ~17 s (job do `db-checks`) | **Manter diário.** A cadência é diária **por causa do §9.1** do `docs/seguranca.md` — o default do `supabase_admin` não é fechável. Rebaixar para semanal exige fechar aquele buraco antes |
| [`check_data_quality.mjs`](../../scripts/check_data_quality.mjs) | Mediu e congelou a dívida real (17 codlinhas órfãs + 4 `cod_origem` inexistentes, 27/07). Views dessas linhas renderizam **vazias, sem erro** | idem | **Manter, e consertar o diagnóstico** — ver achado 2 |
| [`check_realtime.mjs`](../../scripts/check_realtime.mjs) | Nenhuma registrada | idem | **Manter.** O modo de falha que ele cobre (tabela nova fora da publicação) é silencioso e só aparece como "a tela não atualiza sozinha" |
| [`check_deriva.mjs`](../../scripts/check_deriva.mjs) | **Sim, por construção:** cada uma das 4 checagens teria pego uma das 8 divergências reais da auditoria de 26/07. Nenhum achado novo desde | ~16 s | **Manter semanal.** O cron existe porque deriva nasce de mudança **no banco**, que não gera push |
| [`check_migrations.mjs`](../../scripts/check_migrations.mjs) | **Nenhuma — zero ocorrências no CHANGELOG.** Há 1 migração em `supabase/migrations/` | job offline do `phase3-security`; o run inteiro levou 14 s | **Manter, sabendo que é pré-pago.** Cobra que tabela pública nova ligue RLS e revogue `anon` na mesma transação: o defeito que ele evita custa mais que todas as suas execuções somadas |
| [`check_phase3_audit.mjs`](../../scripts/check_phase3_audit.mjs) | Nenhuma. Último run do `phase3-security.yml` foi em 10/08, na branch do PR #98; 41 runs no total | `workflow_dispatch` puro (o secret não vai a PR de fora) | **Aposentar junto com a Fase 3**, como o próprio cabeçalho do workflow já declara. Condição: PR #98 mergeado e a Fase 3 aplicada em produção (Sessão 6) |

## Tabela E — os workflows, por gatilho

Dez arquivos em `.github/workflows/`. Custo de PR: os que disparam em `pull_request` rodam **em
paralelo**, então o tempo de espera é o do mais lento (`views`, ~57 s), não a soma.

| Workflow | Gatilho | Custo mediano | Runs | Veredito |
|---|---|---|---|---|
| `ci.yml` | push `main` + PR + dispatch | 21 s | 569 | **Manter.** O gate rápido é uma propriedade, não um acidente |
| `views.yml` | push `main` + PR + dispatch | 57 s | 312 | **Manter** |
| `semgrep.yml` | push `main` + PR + dispatch | 50 s | 319 | **Manter** |
| `deriva.yml` | cron semanal + PR com `paths` | 16 s | 171 | **Manter** |
| `db-checks.yml` | cron **diário** + PR com `paths` | 17 s | 162 | **Manter** (ver achado 2) |
| `deploy-smoke.yml` | `deployment_status` | 15 s | 261 | **Manter.** É o único gate que vê o deploy **real** — headers servidos e preview apontando para o Supabase de teste. Fechou o achado A de 30/07, quando descobriu-se que a propriedade central do ADR-0002 nunca tinha sido exercitada |
| `backup.yml` | cron semanal + dispatch | ~60 s | 3 | **Manter.** Plano Free, sem PITR. Artifact de 90 dias |
| `phase3-security.yml` | dispatch + PR com `paths` | 14 s | 41 | **Aposentar com a Fase 3** |
| `atualizar-baseline.yml` | só `workflow_dispatch` | sob demanda | — | **Manter.** Existe para o dono fazer pelo celular, na aba Actions, o que exigiria terminal |
| `atualizar-semgrep-rulesets.yml` | só `workflow_dispatch` | sob demanda | — | **Manter.** Mesmo motivo, e já provou servir: rodou em 14/08 e preencheu `.semgrep/vendor/` |

## Achados desta auditoria

**1. Os dois workflows extras da API são órfãos de registro, e agora está escrito.**
A API do GitHub lista **12** workflows; o disco tem **10**. Os dois extras são
`backup-pre-revoke.yml` (criado 26/07, removido no mesmo dia depois de gerar o artifact
`divat-backup-pre-revoke-30212757689`) e `deploy-pages.yml` (criado 13/06, de quando o host
cogitado era o GitHub Pages). O GitHub mantém o registro por causa do histórico de runs; **os
arquivos não estão na `main`, então não rodam e não podem rodar.** Aparecem como `state: active` na
API, que é o rótulo que engana. Nada a fazer — o objetivo deste parágrafo é que ninguém redescubra
isso como se fosse achado.

**2. O gate diário tem um vermelho falso, e o diagnóstico dele aponta para o lugar errado.**
O run agendado de 12/08 (`31580827667`, job `qualidade`) ficou **vermelho** e voltou verde sozinho
em 13/08, sem nenhuma mudança de código ou de dado. O log diz:

```
RPC divat_data_quality falhou (HTTP 500): {"code":"57014", … "canceling statement due to statement timeout"}
A função public.divat_data_quality() existe e tem GRANT EXECUTE para anon?
```

O `57014` é o **`statement_timeout` de 3 s do role `anon`**, medido e versionado em 09/08 — a RPC
varre as tabelas grandes e às vezes não cabe. A segunda linha, que é o que quem opera lê primeiro,
sugere problema de GRANT ou de função inexistente: manda investigar o lugar errado. Isto é o
padrão que mata gate diário — um vermelho que se cura sozinho treina todo mundo a ignorar o
próximo, e o próximo pode ser real. **Correção proposta (não feita aqui, é mudança de código):
distinguir `57014` dos demais erros e imprimir "a RPC estourou o `statement_timeout` de 3 s do
`anon`; não é falha de permissão", com nova tentativa antes de reprovar.** Decisão do dono se vira
aviso ou segue vermelho.

**3. O placar agregado do `check.js` está cego em 2 dos 7 arquivos de teste.**
A saída traz `domain-module.test.mjs — placar ?` e `environment.test.js — placar ?`, porque o
extrator procura a linha `==== PLACAR: n/n ====` e esses dois imprimem outro formato. **Não é falso
verde** — o veredito vem do código de saída, e os dois verificam de verdade (o smoke ESM imprime
`domain module: 55/55`; o `environment` confere 6 hostnames, 2 cenários fail-closed e 3 domínios). É a
contagem exibida que fica incompleta. Num repo cuja tese é "número em prosa sem guarda vira
mentira", vale alinhar o formato dos dois arquivos.

**4. A extração de módulos não derrubou a razão de processo.** Já está na tabela do começo; repito
aqui porque é a resposta honesta à crítica nº 1, e ela não é a resposta bonita. A obra fez o que
prometia no seu próprio termo (305 → 34 linhas de cópia), o total de gates ficou parado (5.941 →
5.935) e a razão global subiu mesmo assim (3,03 → 3,09), porque `docs/` cresceu 555 linhas no mesmo
período. **Se o objetivo for a razão, a próxima obra é em `docs/`, não em `tests/`.**

**5. Nenhum gate está sem dono nem sem motivo.** Fui procurar gate abandonado — que roda, ninguém
lê, e ninguém sabe por quê. Não achei. Os dois candidatos naturais (`check_migrations.mjs`,
`check_phase3_audit.mjs`) são pré-pagos da Fase 3, com condição de aposentadoria escrita no
cabeçalho do próprio workflow. O único conjunto realmente amortizado é o mecanismo `@canon`, e ele
já tem data: a Fase B.

## Onde está o peso, e o que fazer com ele

**9.091 linhas de `docs/**/*.md`.** A distribuição:

| Pasta | Linhas | Natureza |
|---|---|---|
| `docs/historico/` | 4.157 | Retratos datados, `não atualizar`, fora da checagem de deriva |
| `docs/` (topo) | 2.524 | Manuais vivos: `seguranca.md`, `backup.md`, `etl.md`, `schema.md`, `estrutura-frontend.md`, `semgrep.md` |
| `docs/planos/` | 2.031 | Planos vivos, para apagar quando a última fase fechar |
| `docs/adr/` + `docs/agents/` | 292 | Decisões e convenções |
| `docs/superpowers/` | 87 | Plano e spec da modularização de 10/08 |
| *(dos 2.524 do topo)* | *1.066* | *`CHANGELOG.md`, que é arquivo por natureza* |

**`docs/historico/` é 46% da documentação e custo zero de manutenção** — snapshots não derivam
porque não prometem estar atualizados. Não é ali que dói.

**Onde dói é o `CLAUDE.md`: 536 linhas, lidas em toda sessão, antes de qualquer trabalho.** E ele
cresce a cada sessão, de forma monotônica — medido nos quatro commits do período: **485** em
`fb469ea` (pré-Sessão 2), **502** com a Sessão 2, **515** com a Sessão 3, **536** com a Sessão 4.
São **+51 linhas em três sessões**, e nenhuma delas se propunha a mexer nele: o crescimento vem do
ponteiro de trabalho em curso e do mapa de módulos, que toda extração amplia. É o orçamento de
contexto mais caro do projeto e o único documento que **todo** agente paga integralmente, útil ou
não.

**Teto proposto: 550 linhas.** Regra: acima disso, linha nova entra tirando outra. Ao ritmo medido
(+17 por sessão), o teto passa a valer **na próxima sessão** — que é o ponto de propô-lo agora e
não quando o arquivo tiver 700 linhas. O destino do que
sai já tem precedente medido — em 08/08 o runbook de gates encolheu 49 linhas mandando o detalhe
para o cabeçalho do `check_data_quality.mjs`, "que é onde quem opera o gate vai olhar". Transformar
o teto numa guarda do `check.js` §[2b] é possível e barato, mas **é mudança de código e fica para o
dono decidir**; o custo de não ter a guarda é o de sempre neste repo — número em prosa que ninguém
relê.

## Critério de parada — quando um gate novo se justifica

Hoje esse critério não existe, e sem ele a razão 3,09 : 1 só sobe: cada bug vira um gate, e nenhum
gate sai. As cinco perguntas abaixo são para responder **antes** de escrever a primeira linha do
gate. Uma resposta negativa em qualquer uma não proíbe o gate — obriga a escrever o porquê no PR.

1. **Existe um defeito concreto que já aconteceu?** Com data, PR ou run. Gate escrito contra defeito
   imaginado é o que o fecho de 26/07 chama de "asserção adivinhada": quebra por mudança legítima e
   treina todo mundo a ignorar vermelho. A fatia 1 do `check_views` está adiada por essa regra
   desde 26/07, e o gatilho para retomá-la continua sendo um dado errado aparecendo numa tela.
2. **Algum gate existente pode hospedar a checagem?** Seção nova no `check.js` custa 0 s de CI;
   workflow novo custa um job, um badge e mais um lugar onde um vermelho pode se esconder. A ordem
   de preferência é: seção no `check.js` → passo num workflow que já existe → workflow novo.
3. **O sintoma do defeito é mudo?** Este repo já pagou caro por três defeitos silenciosos: módulo
   fora da allowlist (portal vazio, sem erro), `style=` ignorado pela CSP (regra que não acontece) e
   workflow rejeitado (zero jobs, nenhum vermelho). Defeito que grita no console tem menos direito a
   um gate que defeito mudo.
4. **O gate sabe ficar vermelho?** A resposta é obrigatória e é uma demonstração, não uma
   afirmação — a prática de mutação já é padrão aqui.
5. **Qual é a condição de aposentadoria?** Escrita no cabeçalho do gate, no formato "sai quando X".
   **Gate sem condição de aposentadoria nasce permanente**, e foi por ter essa linha escrita que o
   `phase3-security.yml` e o mecanismo `@canon` puderam ser julgados nesta auditoria em vez de
   virarem paisagem.

Regra de simetria, para o critério não ser só uma catraca de entrada: **toda auditoria de custo
revisita as condições de aposentadoria já escritas** e executa as que venceram. Esta executou duas —
`@canon` (vence na Fase B) e `phase3-security` (vence com a Fase 3).

## O que este documento não faz

- **Zero mudança de código, zero SQL, zero deploy.** Nenhum arquivo servido foi tocado; o
  `version.json` e o carimbo `#verTag` **não** mudam, pela regra do plano de 6 sessões.
- **Não aposenta nada agora.** Os dois vereditos de aposentadoria têm condição futura (Fase B e
  Fase 3) e a execução é da sessão que fechar cada uma.
- **Não mede taxa de falha histórica dos gates.** A API devolve no máximo 30 runs por chamada
  aqui; 30 runs de `ci`/`views`/`semgrep` cobrem só as últimas 24 h. Serve para custo, não para
  confiabilidade — e afirmar o contrário seria o tipo de número sem lastro que a §[2b] existe para
  pegar.
