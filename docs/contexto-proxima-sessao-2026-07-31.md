# Contexto para a próxima sessão — o que falta, em detalhe

> **Leia primeiro:** este arquivo e o `CLAUDE.md`. O `CLAUDE.md` é a fonte das **regras**; este
> descreve **o que está aberto e como atacar cada coisa**. Se divergirem, o `CLAUDE.md` manda.
>
> Complementares: `docs/pendencias-2026-07-31-consolidado.md` (o placar dos achados),
> `docs/handoff-2026-07-31-pr4-visibilidade.md` (o que a sessão de 31/07 fez e decidiu),
> **`docs/handoff-2026-07-31-auditoria-cruzada.md`** (a lista curta do que ficou aberto depois da
> 3ª sessão — comece por ela se quiser só o "o que falta").

## 0. Estado do repositório

> **Atualizado em 31/07 (3ª sessão — auditoria cruzada).** A versão anterior dizia
> `main: 47de6ee` e listava o **#73 como o único PR aberto**; os dois deixaram de valer.

- **`main`: `0bfb38a`** (merge do **#73**). Gate verde (`node tests/check.js`).
- **Repositório PÚBLICO**, por decisão registrada em `docs/adr/0003-repositorio-publico.md`.
- A `main` agora tem **`supabase/migrations/`** e **8 workflows** (entrou o `phase3-security.yml`).
- ⚠️ **A Fase 3 continua aplicada SÓ no banco de teste.** Mergear o #73 não aplicou DDL em lugar
  nenhum. Promover para produção segue **proibido sem autorização separada** — ver § 2.2.

### O trabalho da 3ª sessão está numa branch, NÃO na `main`

| Branch | O que tem | Estado |
|---|---|---|
| **`claude/gpt-sol-report-9jrx5h`** | 7 commits: achados 1, 2, 3, 5-9 da auditoria cruzada + o gate de ambientes + prontidão para as chaves publishable | ⚠️ **empurrada, SEM PR aberto** |
| `pr73-antes-do-rebase` | `13c897a`, o head do #73 antes da promoção | rede de segurança, não apagar sem querer |
| `agent/fase-3-hardening-moderado`, `claude/fase3-rebased-*` | já mergeadas ou redundantes | podem ser apagadas |

⚠️ **`git branch -a` não lista as branches do remoto neste ambiente** — o clone traz poucos refs, e
o que ele mostra é só o que já foi buscado. Foi assim que a 2ª sessão de 31/07 concluiu que a
`claude/fase3-rebased-fda0152` tinha sumido e refez um rebase que já existia. **Use
`git ls-remote --heads origin`**, que pergunta ao servidor.

### PRs

| PR | Estado |
|---|---|
| #84 a #91 | ✅ mergeados ou fechados |
| **#73** | ✅ **mergeado em 31/07** (`0bfb38a`) — saiu de rascunho depois de a branch ser atualizada e a CI rodar verde contra a base nova |
| — | 🟡 **nenhum PR aberto.** O trabalho da 3ª sessão está na branch acima esperando PR |

---

## 1. Decisões já tomadas — NÃO reabrir

Uma sessão nova tende a "consertar" estas. Todas foram decididas com o dono e têm registro.

1. **O repositório é público e continua público.** Nenhum documento deve instruir a torná-lo
   privado. ADR-0003.
2. **O `CLAUDE.md:60-68` NÃO é redigido.** O parágrafo que descreve o default do `supabase_admin`,
   os 108 grants e "RLS não bloqueia TRUNCATE" **fica inteiro**. A pergunta já foi feita e
   respondida em 31/07: são fatos públicos compostos, descrevendo um buraco já fechado, e aquele é
   o **único lugar** que explica por que o `check_grants.mjs` roda diariamente. Razão completa na
   ADR-0003, seção "O que a decisão NÃO justifica".
3. **`docs/seguranca.md` § 9 é registro de decisão, não log de auditoria.** Não devolver a medição
   detalhada para lá. A medição vive no `CLAUDE.md` (§ 9.1) e no `docs/backup.md` (§ 9.3).
4. **Os filhos órfãos de `evento_teste` não se apagam.** São atos reais de 1974–1996, arquivo
   institucional insubstituível.
5. **`LICENSE` permanece proprietária.** Público não é open source; conferido em 31/07.

---

## 2. Os itens abertos, em detalhe

### 2.1 🔴 SEC-06 — terminar o restore e medir RTO/RPO

**Só o dono. Nenhum agente fecha.** Exige a máquina dele e um projeto Supabase descartável.

**Por que é o maior item.** É o único item do repositório que descreve uma **capacidade** — quanto
tempo levaria para se recuperar de uma perda total — e não uma configuração. Também é a única coisa
no repo público que um atacante não conseguiria inferir de fora. Apontado em 16/07, 27/07, 30/07 e
31/07, ainda sem número.

**O que já foi provado (28/07):** os passos 1-3 do runbook reconstroem a estrutura inteira — 18
tabelas, 14 policies, RLS, 44 índices, Realtime, extensões — e o exercício **achou dois defeitos
reais**, ambos corrigidos: grants mais abertos que produção (`anon` com TRUNCATE) e `row_id`
recusando os valores dos CSVs.

**O que falta, nesta ordem:**

1. terminar a importação dos dados faltantes;
2. apontar o portal ao banco restaurado e rodar `check_views.mjs` contra ele;
3. **medir RTO e RPO** e escrever os números em `docs/backup.md`.

⚠️ **A armadilha, já mapeada:** se a importação for por **CSV do Table Editor**, exportação parcial
é a causa provável dos dados faltantes — foi exatamente o que travou 28/07 (`tabela_vista_teste`
vazia, `itinerario_teste` com 5.298 de 52.146 linhas). **Use `pg_dump`/`pg_restore`.** Contagens de
referência em `docs/backup.md`.

**Como um agente pode ajudar:** preparando o runbook, conferindo contagens que o dono colar no
chat, e escrevendo os números em `docs/backup.md` + fechando o § 9.3 do `seguranca.md`. **Não pode**
executar nada — sem rede até o Supabase.

✅ **O runbook já foi preparado** (31/07, 2ª sessão). O `docs/backup.md` § "Como RESTAURAR" era
**um caminho só, e era o do CSV** — ou seja, o roteiro versionado levava direto para a armadilha
acima. Agora tem:
- **caminho A (`pg_restore`)** como recomendado e **B (CSV)** como exceção, com o risco de cada um
  numa tabela de escolha logo no topo — o passo do `backup_schema.sql` continua nos dois, porque é
  ele que impede o projeto restaurado de nascer mais aberto que produção;
- **passo 8**, conferência em três camadas (contagem por tabela contra a referência já existente no
  próprio doc, `gen_security_snapshot.sql`, e `check_views.mjs` **sem stub** contra o banco
  restaurado — este último nunca foi executado);
- **passo 9**, com a tabela de RTO/RPO já montada e vazia, esperando os números.

Sobra para o dono exatamente o que só ele pode fazer: rodar e cronometrar.

---

### 2.2 ✅ FECHADO — PR #73 mergeado em 31/07 (3ª sessão)

> **Decidido pelo dono e executado.** A branch foi atualizada para a `main` (os 7 commits
> intermediários eram de documentação, mas tocavam `docs/seguranca.md`, `docs/schema.md` e
> `CLAUDE.md` — os mesmos arquivos do PR —, então valia rodar os gates contra a base nova em vez
> de confiar no `mergeable_state: clean`). CI toda verde no head `026bb1e`; saiu de rascunho e
> mergeou em `0bfb38a`.
>
> **O QUE CONTINUA VALENDO, e é a parte que importa:** promover a Fase 3 para **produção** segue
> proibido sem autorização separada. A leitura abaixo explica por quê — não é burocracia.
>
> As três pendências operacionais (credencial `divat_auditor_ci`, secret
> `SUPABASE_TEST_AUDIT_DATABASE_URL`, branch protection) **continuam abertas e são do dono** —
> elas não bloqueavam o merge. A quarta, o `VERCEL_AUTOMATION_BYPASS_SECRET`, já tinha caído.

Histórico do que ele faz, mantido porque é o que sustenta a proibição acima: **778 adições em 10
arquivos, 18 commits**, aplicado somente no Supabase de **teste** (`gontnlfmothfglssbyyk`).
Produção não é alvo de nada nele.

**O que ele faz:** cria schemas `private` e `audit`; move `f_unaccent`/`fn_vigor_auto` para
`private` (saem do alcance do PostgREST); move as 4 RPCs diagnósticas para `audit` como
`SECURITY DEFINER` de um owner limitado; deixa `anon` com **exatamente duas** RPCs de produto;
fecha os default privileges. Tudo numa transação, com pré-condições antes e asserções depois —
se qualquer coisa não bater, a transação inteira volta atrás.

**Mergear o #73 não muda banco nenhum.** O workflow não aplica nada: `migration-contract` só lê o
diff, e `test-auditor` é `workflow_dispatch` puro. Aplicar continua sendo ato manual do dono.

#### 2.2.1 ✅ O rebase está promovido — é o head do #73

> ⚠️ **Correção de um erro deste documento.** Uma versão anterior desta seção afirmava que a
> `claude/fase3-rebased-fda0152` "sumiu" e que por isso o rebase foi refeito. **Falso.** A branch
> está no remoto, em `58903bb`. O engano veio de ler `git branch -a`, que neste ambiente só mostra
> refs já buscados, e tratar a ausência como prova de que não existia — o mesmo erro de raciocínio
> que o § 4.5 registra sobre o `get_job_logs` 404. O rebase foi refeito à toa.
>
> **O que se salvou do retrabalho:** as duas resoluções do conflito são **semanticamente idênticas**
> (conferido por diff — mudam só as palavras), o rebase novo caiu numa base mais recente e trouxe
> junto as correções 2.2.2 e 2.2.3. Nada se perdeu, mas o trabalho foi duplicado por uma
> verificação preguiçosa.

Rebase em `aac916c`: **um conflito**, em `docs/seguranca.md` § 9 — a seção reescrita no #88 poucas
horas antes, que o #73 também tinha reescrito por conta própria em 29/07. Idêntico ao da 1ª vez.

**Resolução aplicada** (revisar antes de aceitar):
- mantido o enquadramento do #88 (registro de decisão);
- **incorporado o controle novo que o #73 traz de fato**: toda migração que cria tabela pública
  revoga `anon`/`authenticated` e liga RLS na mesma transação, com `check_migrations.mjs` cobrando
  no diff — complementar ao `check_grants.mjs` (um fecha pelo código, o outro detecta drift vivo);
- § 10 do #73 entrou inteiro;
- **não** foi restaurado o roteiro detalhado do § 9.1 (`arwdDxtm`, TRUNCATE) — seria desfazer a
  decisão 3 da seção 1.

**Promovido em 31/07**, com autorização do dono, para `agent/fase-3-hardening-moderado` (a branch
do #73), por `--force-with-lease` com o SHA esperado explícito. O head anterior (`13c897a`) ficou
preservado na branch **`pr73-antes-do-rebase`**.

**O #73 hoje:** base `aac916c`, head `631d97e`, **CI todo verde** — `check`, `views`, `semgrep`,
`deriva`, `seguranca`, `qualidade`, `realtime`, `migration-contract` e `smoke`; `test-auditor`
`skipped` por desenho. Foi a primeira vez que qualquer gate rodou contra este trabalho.

Três coisas que só se souberam aí: o **`semgrep` passa** nos `.mjs`/`.sql` novos (era o risco não
avaliável offline); **cada gate rodou uma vez só**, confirmando na prática a correção 2.2.2; e os
**quatro gates vivos estão verdes contra produção**, o que é o retrato de "antes" para comparar no
dia da promoção da migração.

**Nota sobre tags:** o proxy git deste ambiente **não aceita push de tag** — falha com
`the remote end hung up` seguido de `Everything up-to-date`, silenciosamente. Por isso a rede de
segurança virou branch, não tag. Quem precisar marcar um commit aqui, use branch.

#### 2.2.2 ✅ FEITO — `phase3-security.yml` reintroduzia a execução dupla

O workflow declarava `push:` com `paths:`, **sem `branches: [main]`** — exatamente o padrão que o
PR 1 (#86) removeu dos outros cinco em 30/07. Se entrasse assim, desfaria parcialmente o #86 para
os caminhos que ele vigia.

**Corrigido** em `claude/fase3-rebased-aac916c` (commit `631d97e`): `branches: [main]` acrescentado
sob o `push:`, alinhado ao `deriva.yml`/`db-checks.yml`, que são os dois que combinam `branches` +
`paths`. O arquivo também ganhou o cabeçalho explicativo que os outros seis workflows já tinham —
era o único sem.

#### 2.2.3 ✅ REGISTRADO — o pré-requisito da promoção

**Não é risco atual** — a migração vive no teste, os gates olham produção, e produção não tem o
schema `audit`.

Mas a migração move quatro RPCs de `public` para `audit`, revogando o `execute` de `anon`. E os
quatro gates chamam exatamente essas RPCs pela API com a chave anon:

| Gate | RPC | Frequência |
|---|---|---|
| `check_grants.mjs` | `divat_security_shape` | **diária** |
| `check_deriva.mjs` | `divat_api_shape` | semanal + PR |
| `check_data_quality.mjs` | `divat_data_quality` | semanal |
| `check_realtime.mjs` | `realtime_tables` | semanal |

**O PR #73 não toca em nenhum dos quatro** (conferido no diff). No dia em que a migração for
aplicada em produção, os quatro param — inclusive o diário, que o § 9.1 nomeia como o controle que
compensa o default não-fechável do `supabase_admin`.

**Portanto:** migrar os quatro gates para a credencial de auditor **antes** de aplicar em produção.

**Registrado** em `claude/fase3-rebased-aac916c` (commit `631d97e`): seção própria
**"Pré-requisito da promoção a produção — os quatro gates vivos param"** no
`docs/planos/fase-3-hardening-moderado.md`, mais o **item 7** dos critérios de promoção. A tabela
acima foi conferida contra os scripts: os quatro chamam `POST /rest/v1/rpc/<nome>` com a chave anon
lida do `app.js`, e as linhas 67-83 da migração movem exatamente essas quatro para `audit`.

Consequência registrada junto, que não estava no diagnóstico original: um gate que fale por
credencial de auditor **deixa de derivar `SB_URL`/`SB_KEY` do `app.js`** e passa a depender de
secret — portanto deixa de rodar em PR vindo de fora, igual ao job `test-auditor`. É perda de
alcance, e faz parte da decisão.

---

### 2.3 🟡 Achado E — lacunas no `check_grants.mjs` (nunca tratado)

Do relatório de 30/07. **Nunca entrou em nenhum PR nem em nenhum handoff como pendência** — quase
sumiu. Conferido contra a `main` em 31/07: **zero** ocorrências de `security_invoker`/`reloptions` e
**zero** de `polroles`/`polqual`.

**Duas lacunas:**

1. **`security_invoker` não é verificado.** `divat_security_shape()` varre
   `relkind in ('r','p','v','m')` mas não lê `reloptions`. Uma **view** futura sem
   `security_invoker` contorna a RLS das tabelas de baixo, e o gate só diria `rls_off` genérico —
   que convida a baselinar, o gesto exatamente errado.
2. **A checagem de policy olha só `polcmd`**, não `polroles`/`polqual`. Hoje inofensivo: as 14
   policies são `FOR SELECT TO anon USING (true)` sobre dado público, correto por desenho.

**A data de vencimento é conhecida:** vira IDOR no dia em que existir a área autenticada do
**ADR-0001**. Enquanto o portal for só-leitura público, é dívida dormindo.

⚠️ **Onde a correção mora, e por que ela não é só JavaScript.** O `check_grants.mjs` é um **runner
fino**: quem enxerga o banco é a RPC `public.divat_security_shape()`, que é `SECURITY INVOKER` com
`EXECUTE` para `anon`. Se o campo não vem na resposta, o script não tem como inventá-lo.
**Corrigir exige mudar a RPC no banco** — ou seja, a skill `db-change`, `docs/backup_schema.sql`
atualizado, e uma aplicação manual do dono. Não dá para fazer inteiro do ambiente do agente.

O script tem uma guarda que ajuda: ele **aborta** se a resposta não trouxer `tabelas`, `funcoes` e
`default_privileges` como listas. Ao acrescentar campo novo, estender essa validação junto — o
comentário no arquivo explica por que tratar ausência como vazio seria fail-open silencioso.

---

### 2.4 🟡 Gate de qualidade compara contagem, não a lista

`scripts/check_data_quality.mjs`. O `data_quality_baseline.json` **já traz** as 12 órfãs
nominalmente classificadas, em `orfaos_conhecidos` — o pedido "não use só contagem" já está
atendido **do lado do dado**.

O que falta é o gate **comparar a lista**: hoje uma órfã corrigida e outra criada mantêm o número e
passam despercebidas.

⚠️ **Mesma restrição da 2.3:** o comentário no script diz que `orfaos_conhecidos` é escrito **à
mão** porque "a RPC agrega e não devolve QUAIS codlinhas". Comparar lista exige que
`divat_data_quality()` passe a devolver as codlinhas — **mudança de RPC**, não de JS.

O baseline já carrega a query pronta em `como_listar_os_orfaos`, e o `--atualizar-baseline`
preserva `orfaos_conhecidos` de propósito (sem isso, a primeira regeneração apagaria em silêncio um
levantamento que custou uma sessão inteira). **Não quebrar esse resgate.**

---

### 2.5 Codlinhas órfãs — conferir contra o processo original

Só o dono (processo original do DETRO). Em cada uma: a linha existe no cadastro e faltou importar,
ou o código está errado no filho?

| codlinha | Empresa | Pista |
|---|---|---|
| `146016000` | LINAVE | o hub vai só até `146015000` |
| `191020001` | VIAÇÃO PROGRESSO E TURISMO | o hub tem `191020000`; falta a variante `001` |
| `156002003` | TRANSPORTADORA TINGUÁ | o hub tem `000`/`001`/`002` |
| `121003000` | indeterminada | o hub vai só até `121002001` |
| `116000001` | indeterminada | só existe em `qh_predeterminado_teste` |
| `150006000` | RÁPIDO MACAENSE | **caso duplo**: histórico 1983–1996 *e* quadro vivo |

**`186006400`** (VIAÇÃO NOSSA SENHORA DO AMPARO) — evento de **2021**, recente demais para acervo
histórico, e o hub tem `186006000`/`186006001`. Suspeito de digitação.

⚠️ **Se corrigir:** a correção precisa ir **também na staging** (`evento_dados`/`evento_textos`),
senão o próximo rebuild do ETL desfaz.

⚠️ Órfã em `evento_teste` está **rebaixada a aviso** de propósito (`REBAIXADOS_A_AVISO` no script) —
o preço aceito é que achado novo ali também sai como aviso.

---

### 2.6 Itens de painel (dono, minutos)

- **Ligar Leaked Password Protection** — Supabase → Authentication → Passwords. É o **único WARN**
  dos advisors, aberto desde 23/07.
- **"Only notify for failed workflows"** — GitHub → Settings → Notifications → Actions.

---

### 2.7 Code Scanning / SARIF (opcional, custo zero)

Em repo público é gratuito. **A premissa falsa nos comentários já foi corrigida** no #88 —
`semgrep.yml` e `docs/semgrep.md` hoje dizem que está de fora **por escolha**, não por impedimento.
Ativar é ergonomia (achado vira anotação na linha do diff), não cobertura nova.

---

### 2.8 ✅ FECHADO — os três documentos de 31/07 estão na `main`

Entraram pelo **PR #89**, mergeado em 31/07 (`aac916c`), com os gates rodando no GitHub. A versão
anterior desta seção descrevia a branch `claude/handoff-audit-pr87-merge-5exd3g` como pendente e
sem PR; deixou de valer.

---

### 2.9 🟡 A branch da auditoria cruzada espera PR

Sete commits em `claude/gpt-sol-report-9jrx5h`, gate verde, **sem PR**. Fecham 8 dos 9 achados do
relatório de 31/07. O que entrou, em uma linha cada:

- `backup_schema.sql` **idempotente** (achado 1, o crítico) — medido em PG 16 local: o arquivo
  antigo abortava na 2ª execução e, como o SQL Editor roda em lote único, o restore ficava **sem
  os GRANTs endurecidos**, em silêncio;
- `scripts/restore_rest.mjs` (achado 2) — o NDJSON do backup automático ganhou caminho de volta;
- escopo declarado nos docs que afirmam estado de banco (achado 3) + `bd_teste` removido, que era
  **nome morto**: produção hoje se chama `Banco - Divat`;
- `scripts/check_ambientes.mjs` — **o gate de divergência teste × produção**, a dívida que estava
  registrada em quatro documentos e em nenhum código;
- prontidão para as chaves `sb_publishable_` (achado 4) — o `Bearer` só vai quando a chave é JWT;
- guardas novas no `[2b]`: ADRs em `DOCS_VIVOS`, marcador de escopo, hosts de produção lidos em
  prosa, e toda `*.rig.mjs` obrigada a rodar em workflow.

⚠️ **Abrir o PR é o que dispara as verificações que faltam** — ver § 3.

---

## 3. Nunca verificado — desconhecido, não "fechado"

Nenhuma sessão de agente conseguiu inspecionar painel de Vercel ou Supabase. Três dos quatro
handoffs anteriores tratavam parte disto como resolvido.

**Acrescentado pela 3ª sessão — nada disto rodou contra os bancos reais:**

- **`check_deriva.mjs`** — o `docs/schema.md` mudou (título e cabeçalho de escopo) e ele valida
  esse arquivo coluna a coluna. **É a verificação pendente mais importante.**
- **`check_ambientes.mjs`** — gate novo, nunca executado contra os dois projetos. O baseline nasceu
  vazio com uma **previsão escrita dentro**: não deve haver achado, porque a Fase 3 divergiu o
  teste no que o portal não usa. Se a 1ª execução falhar, a previsão estava errada — investigue
  antes de baselinar.
- **`restore_rest.mjs`** — conversou só com o stub da bancada, nunca com um PostgREST real. Se o
  modelo de PostgREST que a bancada implementa estiver errado, o script está errado do mesmo jeito
  e a bancada passa verde. Três pontos que só um Supabase de verdade resolve: se
  `?col=not.is.null` é aceito como filtro de DELETE; se lotes de 500 linhas cabem no limite de
  requisição em tabela larga (`itinerario_teste`, 52k linhas de texto); se
  `GENERATED BY DEFAULT AS IDENTITY` aceita `row_id` explícito vindo por REST.
  **Descubra isso no exercício do § 2.1, não num restore de verdade.**

- **MFA nas três contas** (Supabase, GitHub, Vercel) — a ação de maior impacto do `seguranca.md`
  § 5 item 1.
- **Branch protection na `main`** — bloquear force-push, exigir CI verde, secret scanning ativo.
- **Signup do Auth fechado** — a regra é manter OFF; nunca confirmado ao vivo.
- **Estado vivo dos dois bancos** — tudo que os documentos afirmam sobre banco vem do SQL
  versionado, dos baselines e do histórico verde do `db-checks`.

---

## 4. Limitações do ambiente do agente

Calibra o que dá para pedir. Não são falhas a contornar — são o contrato.

1. **Sem rede até o Supabase e até a Vercel** (403 do proxy). `check_deriva.mjs`,
   `check_realtime.mjs`, `check_data_quality.mjs` e `check_grants.mjs` **não rodam aqui**. Só no CI
   ou na máquina do dono.
2. **Semgrep não instalado** — SAST local não roda; o CI cobre. `./scripts/semgrep.sh --full`
   precisa de rede e também não roda.
3. **Sem permissão para disparar workflows** pela API e **sem ferramenta para listar secrets**.
   Rodar `Run workflow` é sempre do dono. **Ler log de job funciona bem** — foi assim que o
   `deploy-smoke` foi diagnosticado e que a verificação de preview foi confirmada.
4. **A API da Vercel não expõe o Protection Bypass** — `get_project_deployment_protection` só
   reporta password, SSO e trusted IPs.
5. **A API do GitHub serve estado velho em VÁRIOS níveis — e duas checagens intuitivas não
   resolvem.** Em 31/07 isto custou dois diagnósticos errados no mesmo dia:
   - `pull_request_read(get_check_runs)` mostrou `semgrep` e `views` como `in_progress` por mais de
     **dez minutos** depois de terem terminado;
   - **`get_job_logs` devolvendo HTTP 404 NÃO prova que o job está rodando.** Parece provar (o log
     só existe ao terminar), e foi assim que concluí "está mesmo na fila" — errado; os dois já
     tinham terminado havia dez minutos;
   - `mergeable_state: unstable` também não distingue "pendente" de "cache velho".

   **O que funciona:** `actions_get(method: 'get_workflow_job', resource_id: <job_id>)`. Ele traz
   `steps[]` com `started_at`/`completed_at` **por passo** — dá para ver exatamente onde o job está
   ou quando cada etapa acabou. Foi o que desfez o engano.

   **Regra prática:** se um gate parece travado, compare a duração com a normal (`check` ~15 s,
   `semgrep` ~35 s, `views` ~45 s) e confirme por `get_workflow_job` antes de agir. Push de commit
   vazio para "destravar" um job que já passou só gasta uma rodada.
6. **O contêiner é efêmero.** Trabalho não empurrado se perde — foi por isso que o rebase do #73
   virou branch em vez de ficar local, e a branch **sobreviveu** (está lá, em `58903bb`). Empurrar
   funciona.

   Ainda assim, **trabalho que importa vira PR**, não branch solta: branch sem PR não dispara gate
   nenhum desde 30/07, não aparece em lugar nenhum da interface e some do radar da sessão seguinte
   — que foi literalmente o que aconteceu.

7. **Ausência de evidência não é evidência de ausência — de novo.** O § 4.5 registra isso sobre o
   `get_job_logs` 404; a 2ª sessão de 31/07 repetiu o mesmo erro com `git branch -a`, concluiu que
   uma branch tinha sumido, e refez um rebase que já existia. **`git branch -a` mostra só os refs
   que este clone já buscou**, não o que o servidor tem. Para saber o que existe de verdade:
   `git ls-remote --heads origin`. A regra geral, que já falhou duas vezes por caminhos diferentes:
   **antes de concluir que algo não existe, use o comando que pergunta à fonte**, não o que mostra
   o cache local.

---

## 5. Como rodar os gates

```
node tests/check.js               # offline, sempre — sintaxe, canon, deriva docs×código, unitários
node scripts/check_migrations.mjs # contrato das migrações, offline (já está na main desde o #73)
node scripts/check_views.mjs      # navegador headless, 17 views; aceita filtro: check_views.mjs frota
node scripts/check_abas.mjs       # abas do modal / seletor de documentos

# bancadas com stub de PostgREST — offline, mas sobem servidor e processo filho,
# por isso ficam fora do check.js. Rodam no ci.yml e o [2b] cobra que estejam lá.
NO_PROXY=127.0.0.1 node tests/backup_rest.rig.mjs
NO_PROXY=127.0.0.1 node tests/restore_rest.rig.mjs
NO_PROXY=127.0.0.1 node tests/ambientes.rig.mjs
NO_PROXY=127.0.0.1 node tests/check_grants.rig.mjs

# precisam de REDE — não rodam no ambiente do agente (403 do proxy)
node scripts/check_deriva.mjs        # docs × produção
node scripts/check_realtime.mjs      # RT_TABLES × publicação
node scripts/check_data_quality.mjs  # órfãos e U+FFFD
node scripts/check_grants.mjs        # RLS/grants/policies
node scripts/check_ambientes.mjs     # teste × produção (o único que fala com os DOIS bancos)
```

⚠️ **Push numa branch SEM PR aberto não dispara gate nenhum** (consequência do PR 1, desde 30/07).
Rode `node tests/check.js` local, ou use Actions → Run workflow (`workflow_dispatch`, que os cinco
gates têm). Com PR aberto, os cinco rodam normalmente — medido em 31/07, sem `paths` filtrando
nenhum deles.

---

## 6. Ordem sugerida

> **O que não depende do dono já foi feito** (31/07, 3ª sessão): o #73 mergeado, os 8 achados
> documentais/estruturais da auditoria cruzada, o gate de ambientes e a prontidão para as chaves
> publishable. Tudo o que sobra abaixo precisa da máquina, do painel ou da autorização do dono.

1. **Abrir o PR da branch `claude/gpt-sol-report-9jrx5h`** (2.9). É barato e destrava as
   verificações do § 3 — nenhum gate de rede rodou contra esse trabalho ainda, e branch sem PR não
   dispara gate nenhum desde 30/07.
2. **SEC-06** (2.1). Nada mais tem esse peso, e é o único que descreve **capacidade**, não postura.
   Junte com a validação do `restore_rest.mjs` (§ 3): o mesmo projeto descartável serve para os
   dois, e é a diferença entre "o script roda" e "o procedimento funciona".
3. **Painel** (2.6) — dois cliques, e um fecha o único WARN dos advisors. Some as três pendências
   operacionais do #73 (§ 2.2), que são da mesma natureza.
4. **Achado E** (2.3) e **lista das órfãs** (2.4) — os dois exigem mudar RPC, então valem uma
   sessão de `db-change` conjunta, com o dono aplicando.
5. **Vigiar a postura interna do teste** — o `check_ambientes.mjs` vê os dois bancos como `anon`
   vê. Índices, policies, RLS e grants do projeto de **teste** seguem sem gate nenhum. É a próxima
   peça natural se quiser fechar o eixo que a ADR-0002 abriu.
