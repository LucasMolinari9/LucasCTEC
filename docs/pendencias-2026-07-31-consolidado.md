# Estado consolidado — o que falta executar (31/07/2026)

Reúne, num lugar só, tudo que o **relatório de auditoria externa de 30/07** (gerado por outro
modelo) apontou, tudo que a **verificação contra o repositório real** apurou depois, e tudo que
apareceu nas sessões de 30 e 31/07. O objetivo é responder a uma pergunta: **o que ainda falta
executar.**

- **`main`:** `47de6ee` (merge do #90). Gate verde. *(Era `fda0152` quando este documento foi
  escrito; o #89 trouxe os três docs de 31/07 para a `main`, e o #90 os atualizou.)*
- **Fontes:** `docs/handoff-2026-07-30-auditoria-verificacao.md` (verificação do relatório),
  `docs/handoff-2026-07-31-prs-e-smoke.md`, `docs/handoff-2026-07-31-pr4-visibilidade.md`.
- ⚠️ **Nada aqui foi medido contra os bancos vivos.** O ambiente do agente não alcança o Supabase
  (403 do proxy). O que sustenta as afirmações sobre banco é o SQL versionado, os baselines e o
  histórico verde do `db-checks` — evidência forte, mas não medição própria.

---

## 1. Os cinco achados do relatório

| # | Achado | Estado | Onde fechou |
|---|---|---|---|
| 🔴 **A** | `deploy-smoke` vermelho em **todo** preview — o ADR-0002 nunca era exercitado | ✅ **FECHADO** | dono configurou o bypass + PR #87 |
| 🔴 **B** | Restore não concluído, RTO/RPO sem medição (SEC-06) | ❌ **ABERTO** | só o dono |
| 🟡 **C** | Cada gate rodando duas vezes por push | ✅ **FECHADO** | PR #86 |
| 🟡 **D** | Derivas de documentação (`seguranca.md` § 9.1; `views.yml` "23 views"/"~62%") | ✅ **FECHADO** | PR #85 |
| 🟡 **E** | Lacunas no `check_grants.mjs` | ❌ **ABERTO** | nunca tratado |

**Os dois achados mais graves não estavam no relatório** — ele só enxergava o repositório, e ambos
eram sobre defesas construídas que não estavam operando (A e B). Um fechou; o outro é o maior item
aberto do projeto.

### O plano dos 4 PRs: concluído

| PR do plano | Virou | Estado |
|---|---|---|
| PR 1 — gate roda uma vez, não duas | #86 | ✅ na `main` |
| PR 2 — corrigir as duas derivas do achado D | #85 | ✅ na `main` |
| PR 3 — guarda `[2b]` varre workflows | #85 | ✅ na `main` |
| PR 4 — registrar a decisão de visibilidade | #88 | ✅ na `main` |

Fora do plano, também fechados: `deploy-smoke` consertado (#87), handoff de 30/07 resgatado para a
`main`, ADR-0002 com a verificação de preview datada, PR #84 fechado como redundante.

---

## 2. O que falta executar — só o dono

Nenhum agente fecha estes. Exigem painel, credencial ou processo externo.

### 2.1 🔴 Terminar o restore e medir RTO/RPO (achado B / SEC-06)

**O maior item aberto.** Apontado em 16/07, 27/07, 30/07 e 31/07 — ainda sem número.

Três passos, e o terceiro é o que dá valor aos dois primeiros:

1. terminar a importação dos dados faltantes;
2. apontar o portal ao banco restaurado e rodar `check_views.mjs` contra ele;
3. **medir RTO e RPO** e escrevê-los em `docs/backup.md`.

⚠️ **Armadilha:** se a importação for por CSV do Table Editor, exportação parcial é a causa
provável dos dados faltantes — foi o que travou a tentativa de 28/07 (`tabela_vista_teste` vazia,
`itinerario_teste` com 5.298 de 52.146). **Use `pg_dump`/`pg_restore`.** Contagens de referência em
`docs/backup.md`.

**Por que subiu de importância:** é o único item do repositório que descreve uma **capacidade** que
um atacante não consegue inferir de fora. Nenhuma redação de documento melhora isso.

### 2.2 Desbloquear ou encerrar o PR #73

Draft aberto desde 29/07, 722 adições em 10 arquivos. Três pendências operacionais, todas suas:

- criar/rotacionar `divat_auditor_ci` via `scripts/bootstrap_phase3_auditor.sql`;
- configurar `SUPABASE_TEST_AUDIT_DATABASE_URL` nos Actions Secrets;
- confirmar checks obrigatórios / branch protection da `main`.

A quarta pendência que constava do PR — `VERCEL_AUTOMATION_BYPASS_SECRET` — **já caiu** (foi o que
destravou o #87 em 31/07).

### 2.3 Conferir as codlinhas órfãs

Em cada uma: a linha existe no cadastro e faltou importar, ou o código está errado no filho?

| codlinha | Empresa | Pista |
|---|---|---|
| `146016000` | LINAVE | o hub vai só até `146015000` |
| `191020001` | VIAÇÃO PROGRESSO E TURISMO | o hub tem `191020000`; falta a variante `001` |
| `156002003` | TRANSPORTADORA TINGUÁ | o hub tem `000`/`001`/`002` |
| `121003000` | indeterminada | o hub vai só até `121002001` |
| `116000001` | indeterminada | só existe em `qh_predeterminado_teste` |
| `150006000` | RÁPIDO MACAENSE | **caso duplo**: histórico 1983–1996 *e* quadro vivo |

**`186006400`** (VIAÇÃO NOSSA SENHORA DO AMPARO) — evento de **2021**, recente demais para acervo
histórico, e o hub tem `186006000`/`186006001`. Se o processo original disser `186006000`, é
digitação — e a correção precisa ir **também na staging** (`evento_dados`/`evento_textos`), senão o
próximo rebuild do ETL desfaz.

⚠️ **NÃO apagar os filhos órfãos de `evento_teste`:** são atos reais de 1974–1996, arquivo
institucional insubstituível.

### 2.4 Itens de painel, pequenos

- **Ligar Leaked Password Protection** (Supabase → Authentication → Passwords). É o único WARN dos
  advisors, aberto desde 23/07.
- **"Only notify for failed workflows"** (GitHub → Settings → Notifications → Actions).

---

## 3. O que falta executar — trabalho de código, sem bloqueio

### 3.1 🟡 Achado E — lacunas no `check_grants.mjs` (nunca tratado)

Verificado em 31/07 contra a `main`: **zero** ocorrências de `security_invoker`/`reloptions` e
**zero** de `polroles`/`polqual` no gate. Os dois sub-itens continuam de pé.

- **`security_invoker` não é verificado.** `divat_security_shape()` varre
  `relkind in ('r','p','v','m')` mas não lê `reloptions`. Uma view futura sem `security_invoker`
  contorna a RLS das tabelas de baixo, e o gate só diria `rls_off` genérico — que convida a
  baselinar, o gesto errado.
- **A checagem de policy olha só `polcmd`**, não `polroles`/`polqual`. Hoje inofensivo (as 14
  policies são `FOR SELECT TO anon USING (true)` sobre dado público, correto por desenho). **Vira
  IDOR no dia em que existir a área autenticada do ADR-0001.**

Não é urgente. É dívida que vence numa data conhecida.

### 3.2 Gate de qualidade compara contagem, não a lista

O `data_quality_baseline.json` **já traz** as 12 órfãs nominalmente classificadas — o pedido "não
use só contagem" já estava atendido do lado do dado. O que falta é o **gate comparar a lista**: uma
órfã corrigida e outra criada mantêm o número e passam despercebidas.

### 3.3 `phase3-security.yml` reintroduz a execução dupla

O workflow novo do PR #73 declara `push:` com `paths:`, **sem `branches: [main]`** — exatamente o
padrão que o PR 1 removeu dos outros cinco. Se entrar assim, desfaz parcialmente o #86 para os
caminhos que ele vigia. **Correção de uma linha, antes do merge.**

### 3.4 Code Scanning / SARIF (opcional, custo zero)

Em repo público é gratuito. A premissa falsa nos comentários **já foi corrigida** no #88 — hoje
`semgrep.yml` e `docs/semgrep.md` dizem que está de fora **por escolha**, não por impedimento.
Ativar é ergonomia (achado vira anotação na linha do diff), não cobertura nova.

---

## 4. Decisões pendentes

### 4.1 ✅ RESOLVIDO — force-push do rebase do #73

**Promovido em 31/07**, com autorização do dono: `agent/fase-3-hardening-moderado` (o head do #73)
passou de `13c897a` para `631d97e`, por `--force-with-lease` com o SHA esperado explícito. O head
anterior ficou preservado na branch `pr73-antes-do-rebase`. **CI todo verde no PR** — foi a primeira
vez que qualquer gate rodou contra este trabalho.

> ⚠️ **Correção:** uma versão anterior desta seção dizia que a 1ª tentativa,
> `claude/fase3-rebased-fda0152`, "se perdeu com o contêiner". **Falso** — ela está no remoto, em
> `58903bb`. O rebase foi refeito à toa, por leitura de `git branch -a` (que só mostra refs já
> buscados) em vez de `git ls-remote --heads origin`. As duas resoluções do conflito são
> semanticamente idênticas.

Um conflito, em `docs/seguranca.md` § 9 — a seção reescrita no #88 horas antes, que o #73 também
tinha reescrito por conta própria em 29/07. Idêntico nas duas tentativas.

**Resolução aplicada:** mantido o enquadramento do #88 (registro de decisão) e incorporado o
controle novo que o #73 traz de fato — toda migração que cria tabela pública revoga
`anon`/`authenticated` e liga RLS na mesma transação, com `check_migrations.mjs` cobrando no diff.
O § 10 do #73 entrou inteiro. **Não** foi restaurado o roteiro detalhado do § 9.1.

O head novo traz também as duas correções que faltavam: `branches: [main]` no `push:` do
`phase3-security.yml` e o registro do pré-requisito da promoção (seção 5) no plano da Fase 3.

**Continua em rascunho de propósito** — o que falta são as pendências operacionais listadas no
corpo do PR, todas do dono.

### 4.2 ✅ FECHADO — o handoff e este documento na `main`

Entraram pelo **PR #89**, mergeado em 31/07 (`aac916c`), com os gates rodando no GitHub.

---

## 5. Armadilha registrada: a promoção do #73 quebra quatro gates

**Não é risco atual.** A migração vive no projeto de teste, os gates olham produção, e produção não
tem o schema `audit`. Mergear o #73 **não muda banco nenhum** — o workflow não aplica nada
(`test-auditor` é `workflow_dispatch` puro; `migration-contract` só lê o diff).

O problema é adiado. A migração move quatro RPCs de `public` para `audit`, revogando o `execute` de
`anon`. E os quatro gates chamam exatamente essas RPCs pela API com a chave anon:

| Gate | RPC que chama |
|---|---|
| `check_grants.mjs` (**diário**) | `divat_security_shape` |
| `check_deriva.mjs` | `divat_api_shape` |
| `check_data_quality.mjs` | `divat_data_quality` |
| `check_realtime.mjs` | `realtime_tables` |

**O PR #73 não toca em nenhum dos quatro** (conferido no diff). No dia da promoção para produção,
os quatro param — inclusive o diário, que o § 9.1 nomeia como o controle que compensa o default
não-fechável do `supabase_admin`.

**Pré-requisito da promoção:** migrar os quatro gates para a credencial de auditor **antes** de
aplicar a migração em produção. ✅ **Já registrado** — quando este documento foi escrito não estava
em lugar nenhum; agora tem seção própria em `docs/planos/fase-3-hardening-moderado.md` (mais o item
7 dos critérios de promoção), já no head do #73, mais o corpo do próprio PR.

---

## 6. Nunca verificado — por ninguém, nem pelo relatório

Estes não são "abertos" nem "fechados": são **desconhecidos**. Nenhuma sessão de agente conseguiu
inspecionar painel de Vercel ou Supabase.

- **MFA nas três contas** (Supabase, GitHub, Vercel) — a ação de maior impacto do `seguranca.md`
  § 5, item 1.
- **Branch protection na `main`** — bloquear force-push, exigir CI verde, secret scanning ativo.
- **Signup do Auth fechado** — a regra é manter OFF; nunca confirmado ao vivo.
- **Estado vivo dos dois bancos** — tudo que este documento afirma sobre banco vem do SQL
  versionado e do histórico do `db-checks`.

---

## 7. O que foi verificado e está CERTO (não mexer)

- **Zero** chave `service_role` na árvore e em todo o histórico do git.
- CSP sem `unsafe-inline`/`unsafe-eval`, com `style-src-attr 'none'`.
- `.vercelignore` allowlist; `permissions: contents: read` e `persist-credentials: false` em 7/7
  workflows; Actions presas a SHA de 40 caracteres.
- `selecionarSupabase` falha fechado; `HOSTS_PROD` com 3 domínios.
- Seam `beginGen`/`commitViewResult` guardado em três camadas (canon, Semgrep, testes).
- `esc`/`enc`/`ilikeTerm` corretos; nenhuma interpolação crua de campo do banco.
- **ADR-0002 exercitado em preview real** desde 31/07 — e repetido a cada deploy.

---

## 8. Ordem sugerida

1. **Restore + RTO/RPO** (2.1). Nada mais no projeto tem esse peso, e é o único que descreve
   capacidade, não configuração.
2. **Decidir o #73** (2.2 + 4.1). É trabalho pronto parado por três configurações.
3. Se o #73 for em frente: **corrigir o `push:` do workflow** (3.3) e **registrar o pré-requisito
   da promoção** (5) antes de qualquer coisa tocar produção.
4. **Painel** (2.4) — dois cliques, e um deles fecha o único WARN dos advisors.
5. **Achado E** (3.1) quando a área autenticada do ADR-0001 sair do papel — é a data em que a
   dívida vence.
