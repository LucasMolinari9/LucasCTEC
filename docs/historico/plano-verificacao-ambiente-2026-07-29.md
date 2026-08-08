# Verificação do ambiente de teste — estado em 29/07/2026 (handoff para o Codex)

> **Snapshot de 29/07/2026 — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`;
> a cronologia, no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma sessão e envelhece
> de propósito.

Auditoria do que o plano de 28/07 prometeu contra o que está de fato no ar. **Veredito: o
encanamento de código está pronto e verde; a verificação do deploy nunca passou uma única vez, e
a branch `teste` — a que deveria ser o ambiente de teste — aponta para o banco de PRODUÇÃO.**

O desenho vigente está em `docs/adr/0002-ambiente-de-teste-isolado.md`; o histórico do plano, em
`docs/historico/plano-ambiente-teste-2026-07-28.md`. Este documento é só o laudo + as tarefas que faltam.

## O que está pronto (conferido, não presumido)

| Item | Estado |
|---|---|
| `app.js` — `selecionarSupabase`, fail-closed, `HOSTS_PROD`/`SB_TESTE_*` preenchidos | ✅ |
| `app.js` — `SB.url`/`SB.key` nos 3 pontos de uso (`sbFetch` URL, `sbFetch` headers, `initRealtime`) | ✅ |
| `app.js` linhas 24–25 literais (os 4 gates por regex continuam achando produção) | ✅ |
| `vercel.json` — `connect-src` com prod e teste, `https` + `wss` | ✅ |
| `tests/environment.test.js` — 6 hostnames + 2 cenários fail-closed | ✅ |
| `docs/adr/0002-ambiente-de-teste-isolado.md` | ✅ |
| `node tests/check.js` na `main` | ✅ tudo verde |
| CI na `main`: `ci`, `views`, `semgrep`, `deriva`, `db-checks` | ✅ verdes |
| Projeto Supabase de teste `gontnlfmothfglssbyyk` referenciado em código e CSP | ✅ |
| Domínio `divatdetro.vercel.app` existe no projeto Vercel `divatdetro` | ✅ |

As Tarefas A, B e C do plano de 28/07 estão cumpridas e mergeadas (PR #72, commit `140712c`).

## O que está quebrado

### 1. `deploy-smoke.yml` nunca passou — 100% dos runs vermelhos

O único gate que verifica o isolamento **no ar** falha em todo commit, na `main` e nas branches.
São **duas causas independentes** — consertar uma só mantém o gate vermelho.

**1a. Preview protegido, sem segredo de bypass.** O log do run `30416386392` mostra
`VERCEL_AUTOMATION_BYPASS_SECRET:` vazio, e o script aborta com exit 3:

```
✗ preview protegido pela Vercel; configure o mesmo Protection Bypass for Automation …
Deploy não testado: a resposta é a tela de autenticação da Vercel, não o portal.
```

O `check_deploy.mjs` acerta ao falhar — testar a tela de login da Vercel e chamar de verde seria
pior. Falta a configuração, não o código. **Ação do dono** (ver seção final).

**1b. Produção é verificada pela URL errada — e reprovaria mesmo com o segredo.** O evento
`deployment_status` entrega a URL **por-deploy**:

```
DEPLOY_URL: https://divatdetro-m46wp903k-lucas-molinari-s-projects.vercel.app
DEPLOY_ENVIRONMENT: Production
```

Esse hostname **não está** em `HOSTS_PROD` (`['divatdetro.vercel.app']`) — de propósito, é a
doutrina de allowlist. Mas o `check_deploy.mjs` então calcula `expectedEnvironment='production'`
e `isProductionHost=false`, cai no `else` e reprova:

```
✗ <host>: ambiente informado=production, HOSTS_PROD=divatdetro.vercel.app
```

Ou seja: **o gate está pedindo que a URL por-deploy esteja na allowlist, o que quebraria o
isolamento se fosse atendido.** Produção precisa ser verificada pelo **alias canônico**.

### 2. A branch `teste` lê o banco de PRODUÇÃO

`origin/teste` está em `aaed386` — **13 commits atrás da `main`**, parada *antes* do commit que
introduziu a seleção de ambiente. O `app.js` dela não tem `selecionarSupabase`, não tem
`HOSTS_PROD`: usa `SB_URL` direto. **O preview da branch chamada "teste" consulta produção.**

É exatamente o modo de falha que o ADR-0002 nomeia — "a aparência de isolamento sem isolamento
de dados […] induz quem testa a acreditar que produção está protegida". Hoje ele está ativo.

A branch tem **0 commits próprios** (só ficou para trás), então atualizar é **fast-forward** —
não perde nada e não exige force.

### 3. Branches de agente acumuladas

| Branch | Situação | Destino |
|---|---|---|
| `agent/fase-1-isolamento-preview` | diff **vazio** contra a `main` (foi mergeada como #72) | apagar |
| `codex/execute-tarefa-a-e-tarefa-c`, `codex/criar-arquivo-.mcp.json`, `codex/configurar-supabase-mcp-codex`, `codex/alterar-row_id-para-by-default-em-tabelas`, `claude/cleanup-branches-main-g3e57n` | mergeadas | apagar |
| `agent/fase-3-hardening-moderado` | **17 commits à frente**, não mergeada | decisão do dono |
| `agent/fase-4-manutencao-incremental` | **42 commits à frente**, empilhada sobre a fase-3 | decisão do dono |

As fases 3 e 4 têm `ci`/`views`/`semgrep` **verdes** e `deploy smoke` vermelho pela mesma causa
1a/1b. Elas trazem coisa grande e fora do escopo desta verificação — migração SQL de hardening
(`supabase/migrations/`), auditor PostgreSQL no CI, e uma extração de `shared/*.js` que muda a
arquitetura zero-build. **Não mergear junto com o conserto do smoke**: são revisões separadas.

### 4. Não verificável deste ambiente

A rede até o Supabase é bloqueada aqui e o MCP do Supabase exige OAuth (sessão não-interativa).
**Nada do lado do banco de teste foi confirmado** — só que o código aponta para ele. Continua em
aberto, do checklist do plano de 28/07: schema aplicado, default-deny conferido,
`pgrst.db_max_rows = 30000`, as 14 tabelas na publicação `supabase_realtime`, e dados carregados.

---

## TAREFA 1 — consertar o `deploy-smoke.yml` (Codex, agora)

Branch: `fix/deploy-smoke-alias-producao`, a partir da `main`.

Produção passa a ser verificada pelo alias canônico, não pela URL por-deploy. Em
`.github/workflows/deploy-smoke.yml`, no bloco `env:` do job `smoke`, acrescentar:

```yaml
      # A Vercel entrega no deployment_status a URL POR-DEPLOY
      # (divatdetro-<hash>-….vercel.app). Ela não está em HOSTS_PROD, e não deve estar: a
      # allowlist existe justamente porque esses hostnames são gerados a cada deploy. Verificar
      # produção por ela faria o gate exigir que a URL efêmera fosse produção — o contrário do
      # isolamento. Produção é sempre verificada pelo alias estável.
      PRODUCTION_URL: https://divatdetro.vercel.app
```

E trocar o passo final por dois:

```yaml
      - name: Resolve a URL a verificar
        id: alvo
        run: |
          url="$DEPLOY_URL"
          case "$(echo "$DEPLOY_ENVIRONMENT" | tr '[:upper:]' '[:lower:]')" in
            *prod*) url="$PRODUCTION_URL" ;;
          esac
          echo "url=$url" >> "$GITHUB_OUTPUT"
      - name: Headers, allowlist e isolamento do Supabase
        run: node scripts/check_deploy.mjs "${{ steps.alvo.outputs.url }}" "$DEPLOY_ENVIRONMENT"
```

Notas de execução:

- Não mexer no `check_deploy.mjs`. A lógica dele está correta; quem entregava a URL errada era o
  workflow. Manter a asserção `isProductionHost` como está — ela é o que prova a allowlist.
- `divatdetro.vercel.app` fica em **dois** lugares agora (`HOSTS_PROD` no `app.js` e
  `PRODUCTION_URL` no workflow). A divergência é detectada, não silenciosa: se um mudar, o
  `check_deploy.mjs` reprova com `ambiente informado=production, HOSTS_PROD=…`. Registrar isso
  no comentário do YAML já feito acima.
- Verificação local possível: `node tests/check.js` (o gate de deriva cobra links markdown deste
  documento — se algum quebrar, ele acusa). O smoke em si só roda no CI, contra deploy real.
- **Depois do merge**, confirmar no run de `Deploy smoke` da `main` que a linha passou a ser
  `[deploy] https://divatdetro.vercel.app/` e que o bloco `[ambiente]` diz
  `divatdetro.vercel.app está na allowlist de produção`.

O job de **preview** continuará vermelho até o dono criar o segredo (Tarefa 4). Isso é correto e
não deve ser contornado: um smoke que passa sem testar o portal é pior que um vermelho honesto.

## TAREFA 2 — ressincronizar a branch `teste` (Codex, agora)

É fast-forward puro (`teste` tem 0 commits próprios):

```bash
git fetch origin
git rev-list --left-right --count origin/main...origin/teste   # precisa dar "13\t0" — o 2º campo TEM que ser 0
git push origin origin/main:teste
```

**Se o segundo campo não for 0, PARE** — a branch ganhou commit próprio desde esta auditoria e o
push deixa de ser fast-forward. Nesse caso, relatar em vez de forçar.

Depois: abrir o preview da `teste` e confirmar no DevTools que as requisições vão para
`gontnlfmothfglssbyyk`. Enquanto isso não for feito por olho humano, o isolamento é hipótese.

## TAREFA 3 — limpar branches mortas (Codex, agora)

Apagar só as de diff vazio contra a `main`. Confirmar uma a uma antes:

```bash
for b in agent/fase-1-isolamento-preview claude/cleanup-branches-main-g3e57n \
         codex/execute-tarefa-a-e-tarefa-c codex/criar-arquivo-.mcp.json \
         codex/configurar-supabase-mcp-codex codex/alterar-row_id-para-by-default-em-tabelas; do
  echo "== $b: $(git diff --stat origin/main origin/$b | wc -l) linha(s) de diff"
done
```

Apagar (`git push origin --delete <branch>`) **apenas** as que derem `0`.
**Não tocar** em `agent/fase-3-hardening-moderado` nem em `agent/fase-4-manutencao-incremental`.

---

## TAREFA 4 — só o dono (painel; nenhum agente tem acesso)

1. **Vercel → projeto `divatdetro` → Settings → Deployment Protection → Protection Bypass for
   Automation:** gerar o segredo, copiar o valor.
2. **GitHub → repo → Settings → Secrets and variables → Actions:** criar o secret
   `VERCEL_AUTOMATION_BYPASS_SECRET` com **exatamente** o mesmo valor. Valor diferente falha
   igual a valor ausente.
3. **Banco de teste `gontnlfmothfglssbyyk`** — confirmar o que nunca foi verificado:
   - `docs/backup_schema.sql` aplicado;
   - os `ALTER DEFAULT PRIVILEGES` de default-deny **e** o `REVOKE MAINTAIN ON ALL TABLES`
     (fechar o default não conserta o que já existe);
   - `ALTER ROLE authenticator SET pgrst.db_max_rows = '30000'; NOTIFY pgrst, 'reload config';`
   - as 14 tabelas em `supabase_realtime`;
   - dados carregados (`scripts/backup_rest.mjs` contra produção → importar no de teste).
4. **Decidir** o destino das branches `agent/fase-3-*` e `agent/fase-4-*` — são duas revisões
   grandes e independentes, não parte deste conserto.

## O que continua sem vigia

`check_deriva.mjs` compara docs × **produção**. Nada compara **teste × produção**. As duas cópias
de schema vão divergir e o primeiro sintoma será uma view vazia no preview, sem erro — dívida já
registrada no ADR-0002 e não endereçada aqui.
