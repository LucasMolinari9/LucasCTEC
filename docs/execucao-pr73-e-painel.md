# Execução — validar a Fase 3 mergeada e fechar os itens de painel

> **Para que serve:** briefing autocontido para uma sessão nova executar dois itens do placar de
> 31/07/2026 — o **item 2** (validar operacionalmente a Fase 3 já mergeada) e o **item 4**
> (itens de painel).
> Leia junto: `CLAUDE.md` (regras), `docs/contexto-proxima-sessao-2026-07-31.md` (o que está aberto).
>
> **Quem executa:** o **dono**, em quase tudo. Um agente não alcança o Supabase nem a Vercel deste
> ambiente (403 do proxy), não dispara workflow pela API e não lista secrets. O papel do agente
> aqui é conferir saída colada no chat, atualizar documento e abrir PR.

---

## Estado de partida (31/07/2026)

- **Versão-base:** `0bfb38a` (merge do PR #73).
- O código da Fase 3 e o workflow estão na `main`; o job manual `test-auditor` ainda precisa ser
  executado no projeto de teste.
- **`pr73-antes-do-rebase`** (`13c897a`): o head do #73 antes da promoção. Rede de segurança —
  **não apagar** sem intenção.
- A migração da Fase 3 (`20260729034018_phase3_moderate_hardening.sql`) está aplicada **somente no
  Supabase de teste** `gontnlfmothfglssbyyk`. **Produção (`lwzsxuaqqeoamukduhev`) não recebeu nada.**

⚠️ **Este briefing não é autorização para tocar produção.** Tudo abaixo acontece no projeto de
teste e no painel do GitHub. A aplicação da migração em produção tem pré-requisito próprio, descrito
no corpo do #73 e no plano da Fase 3 — e **não** faz parte desta tarefa.

---

## Item 2 — concluir a validação operacional da Fase 3

O merge já ocorreu. As três pendências abaixo continuam sendo do dono e não aplicam nada em
produção. A antiga pendência `VERCEL_AUTOMATION_BYPASS_SECRET` já foi resolvida.

### 2a. Criar o login `divat_auditor_ci` no projeto de TESTE

O script `scripts/bootstrap_phase3_auditor.sql` já está na `main` desde o merge do #73.

Ele é deliberadamente separado da migração para impedir senha em SQL versionado. Precisa de três
coisas, e **nenhuma delas pode ir para o Git**:

| Variável | O que é |
|---|---|
| `ADMIN_DATABASE_URL` | conexão administrativa do projeto de **teste** (Dashboard → Settings → Database) |
| `AUDITOR_PASSWORD` | senha aleatória, de gerenciador de segredos |
| `valid_until` | validade curta — o plano sugere `2026-10-31 23:59:59+00` |

```bash
psql "$ADMIN_DATABASE_URL" \
  --set=auditor_password="$AUDITOR_PASSWORD" \
  --set=valid_until="2026-10-31 23:59:59+00" \
  --file=scripts/bootstrap_phase3_auditor.sql
```

O script é idempotente: cria o role se não existir, e em qualquer caso reaplica atributos e senha.
Ele **falha de propósito** se o resultado ficar errado, com três asserções ao final — o login não
pode ter capacidade administrativa, não pode ler tabelas direto, e precisa ter herdado as funções
de `audit`.

⚠️ **Se a terceira asserção falhar** (`não herdou as funções de audit`), a causa provável é que
você conectou no projeto **errado**: as funções `audit.*` só existem onde a migração da Fase 3 foi
aplicada, isto é, no teste. Confira o project ref antes de investigar qualquer outra coisa.

### 2b. Gravar o secret e disparar o workflow manual

Grave a URL de conexão do `divat_auditor_ci` no secret de Actions
**`SUPABASE_TEST_AUDIT_DATABASE_URL`** (GitHub → Settings → Secrets and variables → Actions).

O `scripts/check_phase3_audit.mjs` **recusa a conexão** se ela não passar pelas validações do
`scripts/lib/auditor.mjs` (extraído em 04/08/2026 e compartilhado com o `check_data_quality.mjs`,
para a guarda não divergir entre os dois gates) — vale conferir antes de colar, para não gastar
uma rodada:

- a variável do ambiente escolhido tem de estar configurada
  (`SUPABASE_TEST_AUDIT_DATABASE_URL` para `teste`, `SUPABASE_PROD_AUDIT_DATABASE_URL` para
  `producao`);
- tem de ser URL PostgreSQL válida;
- host tem de ser `db.<ref do ambiente>.supabase.co` **ou** um pooler `*.pooler.supabase.com`
  cujo usuário termine em `.<ref do ambiente>` (para `teste`, `gontnlfmothfglssbyyk`);
- o usuário tem de começar com `divat_auditor_ci`;
- tem de conter senha.

**O ambiente vem do argumento:** `node scripts/check_phase3_audit.mjs` usa `teste` (o padrão);
`... producao` usa o ref de produção. Até 04/08/2026 o script travava o ref de teste e recusava
produção de propósito — trava que deixou de servir quando a Fase 3 passou a ser aplicável em
produção e o `check_data_quality.mjs` passou a depender deste mesmo caminho. O que continua
fail-closed é o ref **desconhecido**: host, login ou senha fora do esperado são recusados antes
de qualquer conexão.

Depois: aba **Actions → Phase 3 database security → Run workflow**. O job `test-auditor` só roda por
`workflow_dispatch` — em PR ele sai `skipped`, de propósito, para não expor o secret. Anexe o
resultado ao registro da Fase 3.

### 2c. Branch protection e checks obrigatórios na `main`

GitHub → Settings → Branches → regra para `main`: bloquear force-push, exigir CI verde antes de
merge, e confirmar que *secret scanning / push protection* está ativo.

🚨 **A armadilha, e ela trava merge de verdade.** Nem todo gate roda em todo PR. Três rodam sempre;
os outros têm filtro de `paths` e **só rodam quando o diff toca os arquivos que vigiam**. Um check
marcado como obrigatório que **não roda** fica pendente para sempre, e o PR nunca fica mergeável.

| Check | Roda em todo PR? | Pode ser obrigatório? |
|---|---|---|
| `check` | sim | ✅ |
| `views` | sim | ✅ |
| `semgrep` | sim | ✅ |
| `deriva` | só se o diff tocar `CLAUDE.md`, `docs/schema.md`, `app.js`… | ❌ |
| `seguranca` / `qualidade` / `realtime` | só se o diff tocar os scripts/baselines que vigiam | ❌ |
| `migration-contract` | só se o diff tocar `supabase/migrations/**` e afins | ❌ |
| `smoke` | depende de deploy da Vercel | ❌ |

**Marque como obrigatórios apenas `check`, `views` e `semgrep`.** Os demais continuam rodando e
falhando visivelmente quando são relevantes — só não bloqueiam merge de um PR que não os aciona.

### O que fazer depois

Com 2a, 2b e 2c feitos, registre a execução verde e remova a pendência dos handoffs. Aplicar a
migration em produção continua sendo ato manual separado, com os quatro gates migrados para a
credencial auditora antes e autorização expressa do dono.

---

## Item 4 — itens de painel

Dois cliques, e o primeiro fecha o único WARN dos advisors, aberto desde 23/07/2026.

### 4a. Ligar Leaked Password Protection

Supabase Dashboard → **Authentication → Passwords** → ativar *Leaked password protection*.

Confirme depois rodando os **advisors de segurança**: o esperado é ficar só com os **4 INFO** de
staging sem policy (`evento_dados`, `evento_textos`, `portaria_data`, `portaria_texto_teste`), que
são esperados por desenho, e **zero WARN**.

Enquanto estiver ali, confirme também que **"Allow new users to sign up" está OFF** — é regra
permanente do `CLAUDE.md`, e nenhuma sessão de agente conseguiu verificá-la ao vivo até hoje.

### 4b. "Only notify for failed workflows"

GitHub → **Settings → Notifications → Actions** → marcar *Only notify for failed workflows*.

Puramente ergonômico: com oito workflows, o verde vira ruído e o vermelho se perde nele.

---

## Depois de executar — o que atualizar no repo

Um agente faz esta parte a partir do que você colar no chat:

- **`docs/seguranca.md` § 5** — os itens 2 (Leaked Password Protection) e 3 (signup fechado) saem
  de "a fazer" para verificado, com data.
- **`docs/contexto-proxima-sessao-2026-07-31.md`** — § 2.6 (painel) e § 3 (nunca verificado)
  perdem os itens fechados. **§ 3 é o que mais importa**: ele lista o que é *desconhecido*, não o
  que é falso, e branch protection + signup saem de lá assim que você confirmar ao vivo.
- **`docs/pendencias-2026-07-31-consolidado.md`** — § 2.2 e § 2.4.
- **Corpo do #73** — riscar as pendências cumpridas.

⚠️ Ao mexer nesses documentos, rode **`node tests/check.js`**: a seção `[2b]` cobra os fatos
numéricos declarados na prosa e os links markdown. Se você mudar uma frase que carrega número,
**atualize o número, não apague a guarda**.

---

## Limites do ambiente do agente (para calibrar o que pedir)

1. **Sem rede até o Supabase e até a Vercel** (403 do proxy). Nenhum gate que fala com banco roda
   aqui — só no CI ou na sua máquina.
2. **Sem permissão para disparar workflows** pela API e **sem ferramenta para listar secrets**.
   `Run workflow` é sempre seu. **Ler log de job funciona bem.**
3. **O proxy git não aceita push de tag** — falha em silêncio, com `the remote end hung up` seguido
   de `Everything up-to-date`. Para marcar um commit aqui, use branch.
4. **`git branch -a` não mostra o que existe no remoto** — só os refs que este clone já buscou. Use
   **`git ls-remote --heads origin`**. Ler a ausência como prova de inexistência já custou um rebase
   refeito à toa em 31/07.
5. **A API do GitHub serve estado velho.** Se um gate parecer travado, confirme por
   `actions_get(get_workflow_job)` antes de agir — `get_check_runs` e um 404 de `get_job_logs` não
   distinguem "rodando" de "cache velho".
