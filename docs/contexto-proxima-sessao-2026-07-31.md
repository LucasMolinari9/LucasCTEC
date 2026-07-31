# Contexto para a próxima sessão — o que falta, em detalhe

> **Leia primeiro:** este arquivo e o `CLAUDE.md`. O `CLAUDE.md` é a fonte das **regras**; este
> descreve **o que está aberto e como atacar cada coisa**. Se divergirem, o `CLAUDE.md` manda.
>
> Complementares: `docs/pendencias-2026-07-31-consolidado.md` (o placar dos achados),
> `docs/handoff-2026-07-31-pr4-visibilidade.md` (o que a sessão de 31/07 fez e decidiu).

## 0. Estado do repositório

- **`main`: `fda0152`.** Gate verde (`node tests/check.js`).
- **Repositório PÚBLICO**, por decisão registrada em `docs/adr/0003-repositorio-publico.md`.

### Branches vivas

| Branch | O que tem | Estado |
|---|---|---|
| `claude/handoff-audit-pr87-merge-5exd3g` | 3 docs de 31/07 (handoff, consolidado, este) | **sem PR** — nenhum gate rodou no GitHub |
| `claude/fase3-rebased-fda0152` | o PR #73 **rebaseado** em `fda0152`, com o conflito resolvido | intacta, aguardando decisão |
| `agent/fase-3-hardening-moderado` | o PR #73 **original**, base 11 merges atrás | é a branch do PR, não foi tocada |

### PRs

| PR | Estado |
|---|---|
| #85, #86, #87, #88 | ✅ mergeados (o plano dos 4 PRs, concluído) |
| #84 | ✅ fechado como redundante em 31/07 |
| **#73** | 🟡 **draft aberto desde 29/07** — o único PR aberto |

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

---

### 2.2 🟡 PR #73 — decidir o destino

O único PR aberto. Draft desde 29/07, **722 adições em 10 arquivos, 17 commits**, aplicado somente
no Supabase de **teste** (`gontnlfmothfglssbyyk`). Produção não é alvo de nada nele.

**O que ele faz:** cria schemas `private` e `audit`; move `f_unaccent`/`fn_vigor_auto` para
`private` (saem do alcance do PostgREST); move as 4 RPCs diagnósticas para `audit` como
`SECURITY DEFINER` de um owner limitado; deixa `anon` com **exatamente duas** RPCs de produto;
fecha os default privileges. Tudo numa transação, com pré-condições antes e asserções depois —
se qualquer coisa não bater, a transação inteira volta atrás.

**Mergear o #73 não muda banco nenhum.** O workflow não aplica nada: `migration-contract` só lê o
diff, e `test-auditor` é `workflow_dispatch` puro. Aplicar continua sendo ato manual do dono.

#### 2.2.1 O rebase já está feito — está em `claude/fase3-rebased-fda0152`

Rebase em `fda0152`: **um conflito**, em `docs/seguranca.md` § 9 — a seção reescrita no #88 poucas
horas antes, que o #73 também tinha reescrito por conta própria em 29/07.

**Resolução aplicada** (revisar antes de aceitar):
- mantido o enquadramento do #88 (registro de decisão);
- **incorporado o controle novo que o #73 traz de fato**: toda migração que cria tabela pública
  revoga `anon`/`authenticated` e liga RLS na mesma transação, com `check_migrations.mjs` cobrando
  no diff — complementar ao `check_grants.mjs` (um fecha pelo código, o outro detecta drift vivo);
- § 10 do #73 entrou inteiro;
- **não** foi restaurado o roteiro detalhado do § 9.1 (`arwdDxtm`, TRUNCATE) — seria desfazer a
  decisão 3 da seção 1.

`node tests/check.js` verde contra a árvore rebaseada. `node scripts/check_migrations.mjs` roda
offline e passa.

**Para promover:** `git push --force-with-lease origin claude/fase3-rebased-fda0152:agent/fase-3-hardening-moderado`.
Reescreve a história do draft — decisão do dono.

#### 2.2.2 Corrigir antes do merge: `phase3-security.yml` reintroduz a execução dupla

O workflow declara `push:` com `paths:`, **sem `branches: [main]`** — exatamente o padrão que o
PR 1 (#86) removeu dos outros cinco em 30/07. Se entrar assim, desfaz parcialmente o #86 para os
caminhos que ele vigia. **Uma linha.**

#### 2.2.3 ⚠️ O pré-requisito da promoção, hoje escrito em lugar nenhum

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
Registrar isso no `docs/planos/fase-3-hardening-moderado.md` e no corpo do #73.

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

### 2.8 Os três documentos de 31/07 não estão na `main`

`claude/handoff-audit-pr87-merge-5exd3g` tem o handoff, o consolidado e este arquivo, **sem PR
aberto** — portanto nenhum gate rodou no GitHub (só `node tests/check.js` local, verde).

---

## 3. Nunca verificado — desconhecido, não "fechado"

Nenhuma sessão de agente conseguiu inspecionar painel de Vercel ou Supabase. Três dos quatro
handoffs anteriores tratavam parte disto como resolvido.

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
   virou a branch `claude/fase3-rebased-fda0152` em vez de ficar local.

---

## 5. Como rodar os gates

```
node tests/check.js              # offline, sempre — sintaxe, canon, deriva docs×código, unitários
node scripts/check_views.mjs     # navegador headless, 17 views; aceita filtro: check_views.mjs frota
node scripts/check_abas.mjs      # abas do modal / seletor de documentos
node scripts/check_migrations.mjs # (só na branch do #73) contrato das migrações, offline
```

⚠️ **Push numa branch SEM PR aberto não dispara gate nenhum** (consequência do PR 1, desde 30/07).
Rode `node tests/check.js` local, ou use Actions → Run workflow (`workflow_dispatch`, que os cinco
gates têm). Com PR aberto, os cinco rodam normalmente — medido em 31/07, sem `paths` filtrando
nenhum deles.

---

## 6. Ordem sugerida

1. **SEC-06** (2.1). Nada mais tem esse peso, e é o único que descreve capacidade.
2. **Decidir o #73** (2.2) — trabalho pronto parado por três configurações do dono. Se for em
   frente: corrigir o `push:` (2.2.2) e registrar o pré-requisito da promoção (2.2.3) **antes** de
   qualquer coisa tocar produção.
3. **Painel** (2.6) — dois cliques, e um fecha o único WARN dos advisors.
4. **Achado E** (2.3) e **lista das órfãs** (2.4) — os dois exigem mudar RPC, então valem uma
   sessão de `db-change` conjunta, com o dono aplicando.
