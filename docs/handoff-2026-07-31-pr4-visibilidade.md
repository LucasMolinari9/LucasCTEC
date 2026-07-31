# Handoff — PR 4 (visibilidade) e o fim da fila de PRs do plano de 30/07

> **Para a sessão nova:** leia este arquivo e o `CLAUDE.md`. Este descreve **o que aconteceu numa
> sessão específica e o que ficou aberto**; o `CLAUDE.md` é a fonte das regras do projeto. Se os
> dois divergirem, o `CLAUDE.md` manda.
>
> Handoff anterior: `docs/handoff-2026-07-31-prs-e-smoke.md`. ⚠️ **Ele contém uma afirmação
> errada** — ver "Correções ao handoff anterior", abaixo.

## Estado

- **`main`: `fda0152`.** Gate verde contra ela (`node tests/check.js`).
- **A fila do plano de 30/07 acabou.** PRs 1, 2, 3 e 4 estão todos na `main`.
- **Repositório: PÚBLICO, agora por decisão escrita** (`docs/adr/0003-repositorio-publico.md`).
- **Nenhuma decisão de merge pendente** — mas há **dois PRs abertos que nenhum handoff mencionou**
  (ver Pendências 1 e 2).

| PR | O que é | Estado |
|---|---|---|
| #85 | PR 3 (guarda `[2b]` varre workflows) + PR 2 (derivas do achado D) | ✅ na `main` |
| #86 | PR 1 (cada gate roda uma vez, não duas) | ✅ na `main` |
| #87 | `deploy-smoke`: causa da falha de rede + loop de redirect | ✅ na `main` |
| #88 | **PR 4** (visibilidade) + resgate do handoff de 30/07 + Status do ADR-0002 | ✅ na `main` |
| #84 | handoff de 30/07 | 🟡 **aberto e redundante** — conteúdo já está na `main` |
| #73 | Fase 3: endurece RPCs e auditoria do Supabase | 🟡 **draft aberto desde 29/07** |

## O que a sessão fez

### O item perigoso, fechado

`docs/seguranca.md` § 5 listava "**Repositório GitHub privado:** Settings → Danger Zone → Change
visibility → Private" entre as ações de maior ganho do dono. Não era premissa velha em prosa: era
**instrução acionável**, num documento escrito para ser executado, mandando desfazer a decisão em
vigor. Removida, com nota no lugar apontando para a ADR-0003.

Junto: § 9 reescrito como registro de decisão, ADR-0003 criada, premissas velhas corrigidas em
`semgrep.yml` (× 2), `docs/semgrep.md` e `backup.yml`, `LICENSE` conferida (proprietária, sem
mudança — público não é open source).

### A decisão que mudou de rumo no meio: o `CLAUDE.md` NÃO foi redigido

O plano previa tirar do `CLAUDE.md:60-68` o mesmo trecho redigido do § 9.1 — a medição do default
do `supabase_admin`, os 108 grants, "RLS não bloqueia TRUNCATE". **Avaliado e recusado**, e a
recusa está escrita na ADR-0003 e no CHANGELOG, porque "por que não fizemos" é exatamente o que uma
auditoria futura redescobre como pendência se ninguém anotou.

Os dois motivos:

1. **Não é segredo.** São três fatos públicos compostos — RLS não bloquear TRUNCATE é
   comportamento documentado do Postgres, a chave `anon` é servida a todo visitante, os defaults
   do `supabase_admin` são característica da plataforma — e a composição descreve um buraco **já
   fechado** (`backup_schema.sql` revoga, o gate diário confere; o próprio texto diz "**era**
   caminho aberto").
2. **O custo de tirar é assimétrico.** Aquele parágrafo é o **único lugar** que explica por que o
   `check_grants.mjs` roda todo dia e por que o `backup_schema.sql` revoga mais que `MAINTAIN`.
   Regra sem lastro é regra que a próxima faxina apaga por parecer redundante — foi assim que a
   versão anterior daquele mesmo parágrafo pôde afirmar o oposto do medido por dois dias.

**Se uma sessão futura receber de novo a tarefa "redigir o roteiro do § 9.1 no `CLAUDE.md`": leia a
ADR-0003 antes.** A pergunta já foi feita e respondida.

### O que isso obrigou a corrigir na própria entrega

A 1ª versão da ADR-0003 ancorava a decisão em "não versionar roteiro operacional". A justificativa
não se sustenta, e ADR é justamente o documento que alguém cita depois. Reescrita para dizer o que
a mudança **de fato** faz: separar registro de decisão de log de auditoria dentro do manual do
dono. O § 9 continua valendo por isso, não por sigilo.

**A única exposição real do repo público está nomeada na ADR:** § 9.2 (não há onde aplicar rate
limit sem mudar a arquitetura) + § 9.3 (o restore nunca foi concluído, RTO/RPO sem medição). Isso
**não** é derivável de fora. E a resposta a isso é **fechar o SEC-06**, não redigir a prosa —
enquanto o RTO for desconhecido, a frase é verdadeira dentro ou fora do git.

## Correções ao handoff anterior

**1. A "deriva criada hoje" (pendência 3 do handoff de 31/07) não existia como descrita.** Ele
afirmava que `docs/seguranca.md` § 9.3 e `docs/backup.md` "ainda dizem que o isolamento de preview
nunca foi exercitado". Verificado linha a linha: **nenhum dos dois menciona preview.** Ambos falam
do **restore** (SEC-06), e essa afirmação **continua verdadeira**. Apagá-la teria introduzido uma
deriva, não corrigido uma.

A deriva real era a ausência do oposto: nenhum documento vivo registrava que a propriedade do
ADR-0002 passou a ser verificada. Corrigido no **Status do ADR-0002**, que agora datou a
verificação (31/07, 01:03 UTC) e diz que a partir dali é regressão vigiada. O `smoke` do próprio
#88 repetiu a verificação contra o preview da branch (`divatdetro-9zdu9j0oz-…`).

**2. "O handoff de 30/07 está preso numa branch, sem PR" — havia PR: o #84.** O conteúdo foi
resgatado por cherry-pick no #88 e está na `main`; o arquivo é byte-idêntico ao da branch.

**Lição das duas:** o handoff anterior descreveu o repositório de memória em vez de conferir.
**Confira o estado antes de agir sobre ele** — inclusive contra este arquivo.

## Pendências

### 1. PR #84 — fechar (redundante)

`docs/handoff-2026-07-30-auditoria-verificacao.md` já está na `main`, idêntico. O PR só ocupa
espaço. Fechar sem merge; a branch `claude/ask-matt-u6cwf8` pode ir junto. **Não mergear** — a
branch está 4 merges atrás da `main` e o merge reverteria trabalho.

### 2. PR #73 — decidir o destino (o item mais substancial da lista)

**Draft aberto desde 29/07, esquecido por dois handoffs.** 724 adições em 10 arquivos, 17 commits:
formaliza o portal como público sem Auth, mantém só duas RPCs de produto para `anon`, remove todo
acesso de `authenticated`, move helpers para `private` e diagnósticos para `audit`, cria papéis
`NOLOGIN` de owner/auditor, e adiciona gate estrutural de migrações + auditor PostgreSQL
fail-closed. **Aplicado só no Supabase de teste** (`gontnlfmothfglssbyyk`); nada em produção.

Dois fatos que mudaram desde que ele parou:

- **Uma das pendências que o mantinham em draft já foi resolvida:** `VERCEL_AUTOMATION_BYPASS_SECRET`
  está configurado desde 31/07 (foi o que destravou o #87).
- **A base dele está 11 merges atrás da `main`.** Vai precisar de rebase, e o `tests/check.js`
  mudou bastante nesse intervalo (guarda `[2b]`, cobertura do canon).

Sobram como bloqueio: criar/rotacionar `divat_auditor_ci`, configurar
`SUPABASE_TEST_AUDIT_DATABASE_URL` nos Actions Secrets, e confirmar branch protection da `main`.
**Todas do dono.** Decisão a tomar: retomar, ou fechar e reabrir com escopo menor.

### 3. Oportunidade de custo zero (fora de escopo até aqui)

Em repo público o **Code Scanning / SARIF é gratuito**. O comentário do `semgrep.yml` que o
descartava por "exigir Advanced Security" **já foi corrigido** — hoje ele diz que está de fora por
escolha, não por impedimento. Ativar é ergonomia (achado vira anotação no diff), não cobertura
nova.

## O que continua sendo só do dono

| Item | Onde | Peso |
|---|---|---|
| Terminar o restore e **medir RTO/RPO** (SEC-06) | máquina do dono + projeto Supabase descartável | **o maior aberto**; 16/07, 27/07 e 31/07, ainda sem número |
| Desbloquear ou encerrar o **PR #73** | Supabase + Actions Secrets | médio, mas é trabalho pronto parado |
| Conferir as codlinhas órfãs | processo original do DETRO | baixo — já medido, não afetam a busca |
| "Only notify for failed workflows" | GitHub → Settings → Notifications | baixo |

⚠️ **Armadilha do restore, já mapeada:** se os dados faltantes vieram de CSV do Table Editor, é
exportação parcial — use `pg_dump`/`pg_restore`. Contagens de referência em `docs/backup.md`.

**Por que o SEC-06 subiu de importância depois da análise de hoje:** é o único item do repositório
que descreve uma **capacidade** que um atacante não consegue inferir de fora. Nenhuma redação de
documento melhora isso.

## Consequência prática do PR 1 (continua valendo)

**Push numa branch SEM PR aberto não dispara gate nenhum.** Rode `node tests/check.js` local, ou
use Actions → Run workflow (`workflow_dispatch`, que os cinco gates têm). Com PR aberto, os cinco
rodam normalmente — medido nesta sessão, sem `paths` filtrando nenhum deles.

## Limitações do ambiente de agente (calibra o que dá para pedir)

1. **Sem rede até o Supabase e até a Vercel** (403 do proxy). `check_deriva.mjs`,
   `check_realtime.mjs` e `check_data_quality.mjs` não rodam aqui — só no CI ou na máquina do dono.
2. **Semgrep não instalado** — SAST local não roda; o CI cobre.
3. **Sem permissão para disparar workflows** pela API e **sem ferramenta para listar secrets**.
   Rodar o `Run workflow` é do dono; **ler o log é do agente** e funciona bem — foi assim que a
   verificação do preview foi confirmada.
4. **A API de check-runs do GitHub serve estado velho.** Nesta sessão `semgrep` e `views`
   apareceram `in_progress` por minutos depois de terem terminado. **Confirme pelo log do job ou
   pelo `mergeable_state` do PR** antes de concluir que um gate travou.
