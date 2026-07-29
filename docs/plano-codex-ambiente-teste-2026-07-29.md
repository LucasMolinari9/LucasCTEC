# Ambiente de teste — o que falta e o prompt para o Codex (29/07/2026)

Complemento operacional de `docs/plano-verificacao-ambiente-2026-07-29.md`, escrito para um
agente com **acesso ao repositório e nada mais** — sem painel da Vercel, sem painel do Supabase.

## A descoberta que reorganiza a lista

**Nada verifica o banco de teste. Nem um gate, nem um script, nem uma linha.**

Os quatro verificadores vivos (`check_deriva.mjs`, `check_realtime.mjs`,
`check_data_quality.mjs`, `check_grants.mjs`) extraem `SB_URL`/`SB_KEY` do `app.js` por regex e
**não têm nenhuma forma de apontar para outro projeto** — não leem variável de ambiente, não
aceitam argumento. Isso é deliberado e está certo para o que eles foram feitos: auditar produção
por construção. O efeito colateral é que o projeto `gontnlfmothfglssbyyk` nunca foi conferido por
nada. Que ele tenha schema, RLS, `db_max_rows` e as 14 tabelas no Realtime é **suposição**.

E o MCP do Supabase — tanto o do Claude (`.mcp.json`) quanto o do Codex (`.codex/config.toml`) —
está fixado em `project_ref=lwzsxuaqqeoamukduhev&read_only=true`. Nenhum agente enxerga o projeto
de teste nem por aí.

**A alavanca:** o CI tem rede que nem o Claude nem o Codex têm. Um workflow que rode os
verificadores existentes contra o projeto de teste responde a pergunta com evidência, e é uma
mudança **só de repositório** — nenhum painel envolvido. É por isso que a Tarefa 1 vem primeiro:
o relatório dela é o que diz ao dono o que exatamente falta provisionar, em vez de mandá-lo
conferir seis itens no escuro.

Bônus de desenho: `check_deriva.mjs` apontado para teste **é** o gate teste × produção que o
ADR-0002 declara inexistente. Ele compara a forma da API contra o que os docs afirmam; os docs
descrevem o schema que produção tem. Rodá-lo contra teste responde "o banco de teste é mesmo uma
cópia fiel?" — a dívida registrada como não-vigiada, fechada de graça.

## Situação por item

| # | Item | Quem resolve |
|---|---|---|
| 1 | Banco de teste nunca verificado | **Codex** (T1+T2) → relatório → dono provisiona o que faltar |
| 2 | `deploy-smoke.yml` testa produção pela URL por-deploy e reprova | **Codex** (T3) |
| 3 | Branch `teste` 13 commits atrás, lê **produção** | **Codex** (T4) |
| 4 | 6 branches mortas acumuladas | **Codex** (T5) |
| 5 | MCP fixado em produção nos dois agentes | **Codex** (T6) + OAuth do dono |
| 6 | `VERCEL_AUTOMATION_BYPASS_SECRET` ausente | **só o dono** |
| 7 | Provisionamento do banco de teste | **só o dono**, guiado pelo relatório da T2 |

Os itens 2, 3 e 4 **não precisam da Vercel**: são YAML, git e nada mais. O workflow roda no
GitHub Actions, não no Codex. Só o item 6 é bloqueado por não dar acesso da Vercel ao Codex — e
ele já estava fora do alcance de qualquer agente, porque é um segredo de painel.

---

# PROMPT PARA O CODEX

> Copie daqui para baixo. É autocontido.

Você trabalha no repositório `LucasMolinari9/LucasCTEC` (Portal DIVAT, zero-build: `index.html` +
`styles.css` + `app.js`). Leia o `CLAUDE.md` antes de começar — ele tem regras que sobrepõem seus
padrões. Leia também `docs/adr/0002-ambiente-de-teste-isolado.md` e
`docs/plano-verificacao-ambiente-2026-07-29.md`.

Você tem acesso ao repositório e ao GitHub. **Não tem acesso ao painel da Vercel nem ao painel do
Supabase, e não vai precisar.** Sua rede não alcança o Supabase — os verificadores que você vai
escrever rodam no CI, não na sua máquina.

Objetivo: tornar o ambiente de teste **verificável** e consertar dois defeitos ativos. Trabalhe
numa branch por tarefa, com os gates verdes antes de cada push.

## Restrições que valem para tudo

1. **As linhas 24–25 do `app.js` são intocáveis.** `const SB_URL = '…';` e `const SB_KEY = '…';`,
   uma por linha, literais, aspas simples. Quatro scripts as extraem por regex. Virar `let`,
   quebrar em linhas ou virar ternário cega os quatro de uma vez, e a mensagem de erro parece
   defeito do script.
2. **O padrão de todo verificador continua sendo PRODUÇÃO.** O ambiente de teste é opt-in
   explícito. Se alguém rodar `node scripts/check_grants.mjs` sem argumento, ele audita produção,
   exatamente como hoje. Nenhum gate existente pode mudar de comportamento.
3. **`node tests/check.js` precisa ficar verde e continuar offline.** É o contrato dele. Não
   acrescente nada que precise de rede. Se você mudar a contagem de linhas de arquivo citada em
   doc, a seção `[2b]` cobra o número — **atualize o número, não apague a guarda**.
4. `scripts/check_grants.mjs` contém **bytes NUL literais** nas linhas 140 e 178
   (`` `${a.tipo}\x00${a.alvo}` ``), usados como separador de chave composta do baseline. Por isso
   o `file` reporta o arquivo como `data`. **Não deixe seu editor normalizá-los** — se virarem
   `\0` escapado ou sumirem, as chaves do `security_baseline.json` deixam de casar e o gate
   quebra de um jeito difícil de ler.
5. Não toque nas branches `agent/fase-3-hardening-moderado` e
   `agent/fase-4-manutencao-incremental`. A fase-4 está fazendo extração para `shared/*.js`; para
   não colidir, seu código novo vai em **`scripts/lib/`** (que já existe, com o `rig.mjs`), nunca
   em `shared/`.

## T1 — dar aos verificadores um alvo escolhível

Branch: `fix/verificadores-aceitam-ambiente`.

Crie `scripts/lib/ambiente.mjs`, único lugar que passa a extrair a config do `app.js`. Ele
exporta algo como `resolverAmbiente(argv)` devolvendo `{ ambiente, url, key }`:

- sem `--ambiente` (ou com `--ambiente=producao`): extrai `SB_URL`/`SB_KEY` — comportamento atual,
  bit a bit;
- com `--ambiente=teste`: extrai `SB_TESTE_URL`/`SB_TESTE_KEY`;
- qualquer outro valor: erro claro, sem cair em produção por omissão (mesma doutrina fail-closed
  do `selecionarSupabase` no `app.js`).

Migre os quatro scripts (`check_deriva.mjs`, `check_realtime.mjs`, `check_data_quality.mjs`,
`check_grants.mjs`) para usá-lo, apagando as quatro cópias do `extrair(...)`. Cada um deve
imprimir no cabeçalho da saída **contra qual projeto está rodando** — hoje é impossível saber
olhando o log, e depois desta mudança fica ambíguo se não for dito.

Cuidados por script, que não são simétricos:

- **`check_data_quality.mjs`:** o `data_quality_baseline.json` descreve a dívida do dado de
  PRODUÇÃO (17 codlinhas órfãs etc.). Aplicá-lo ao banco de teste é comparar coisas diferentes.
  Contra `--ambiente=teste`, rode **sem baseline** e trate o resultado como **informativo**: ele
  reporta, não reprova. Deixe isso explícito no comentário do arquivo e na saída.
- **`check_grants.mjs`:** as exceções do `security_baseline.json` são os defaults do role
  `supabase_admin`, que existem em qualquer projeto Supabase — a expectativa é que transfiram.
  Se não transferirem, **relate; não edite o baseline** para o teste passar.
- **`check_deriva.mjs` e `check_realtime.mjs`:** contra teste, estes são o que interessa. Podem
  reprovar de verdade — é o ponto.

Verificação: `node tests/check.js` e `./scripts/semgrep.sh` (sem `--full`, que exige rede) verdes.
Você não consegue rodar os quatro verificadores localmente; isso é esperado.

## T2 — workflow que audita o banco de teste

Mesma branch da T1.

Crie `.github/workflows/ambiente-teste.yml`, espelhando o desenho do `db-checks.yml` — leia-o
antes: jobs **separados** e paralelos, de propósito, para que um vermelho não esconda o outro;
`permissions: contents: read`; `uses:` presos ao SHA; `persist-credentials: false`.

- Gatilhos: `workflow_dispatch` + `schedule` semanal + `push`/`pull_request` nos paths dos
  scripts envolvidos.
- Jobs: `estrutura` (`check_deriva.mjs --ambiente=teste`), `realtime`
  (`check_realtime.mjs --ambiente=teste`), `seguranca` (`check_grants.mjs --ambiente=teste`) e
  `dados` (`check_data_quality.mjs --ambiente=teste`, **`continue-on-error: true`** — informativo,
  pelo motivo da T1).
- Sem segredos. A anon key de teste é pública por desenho e já está no `app.js`.
- Escreva no cabeçalho do arquivo **por que ele existe**: o banco de teste nunca foi conferido por
  nada, e este workflow é o que transforma "achamos que está provisionado" em evidência.

Depois do merge, **dispare o workflow à mão** (`workflow_dispatch`) e me relate a saída dos quatro
jobs. Esse relatório é o entregável mais importante desta tarefa: ele é a lista de compras do dono
para o painel do Supabase. Não conserte o banco — você não tem acesso, e não é para ter.

## T3 — consertar o `deploy-smoke.yml`

Branch: `fix/deploy-smoke-alias-producao`.

Hoje o gate falha em 100% dos runs. Uma das causas é sua: a Vercel entrega no `deployment_status`
a URL **por-deploy** (`https://divatdetro-m46wp903k-lucas-molinari-s-projects.vercel.app`), que
não está em `HOSTS_PROD` — e não deve estar, porque esses hostnames são gerados a cada deploy e é
justamente por isso que produção é uma allowlist. O `check_deploy.mjs` então calcula
`expectedEnvironment='production'`, vê `isProductionHost=false` e reprova. O gate está exigindo
que a URL efêmera seja produção, o oposto do isolamento que ele deveria provar.

No bloco `env:` do job `smoke`, acrescente `PRODUCTION_URL: https://divatdetro.vercel.app` (o
alias canônico; ele existe no projeto Vercel) com um comentário explicando o parágrafo acima. Em
seguida, resolva a URL antes de chamar o script:

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

**Não mexa no `check_deploy.mjs`.** A lógica dele está correta; quem entregava a URL errada era o
workflow. Em particular, mantenha a asserção `isProductionHost` — é ela que prova a allowlist.

Depois do merge, confira no run de `Deploy smoke` da `main` que o cabeçalho virou
`[deploy] https://divatdetro.vercel.app/` e que o bloco `[ambiente]` diz
`divatdetro.vercel.app está na allowlist de produção`.

**O job de preview vai continuar vermelho** — falta o secret `VERCEL_AUTOMATION_BYPASS_SECRET`,
que só o dono cria no painel. Isso é correto e **não deve ser contornado**: um smoke que passa sem
ter testado o portal é pior que um vermelho honesto. Não adicione `continue-on-error` nem filtro
para esconder essa falha.

## T4 — ressincronizar a branch `teste`

A branch `teste` está em `aaed386`, 13 commits atrás da `main`, parada **antes** do commit que
introduziu a seleção de ambiente. O `app.js` dela não tem `HOSTS_PROD` nem `selecionarSupabase`:
usa `SB_URL` direto. **O preview da branch chamada "teste" consulta o banco de produção.** É
exatamente o "isolamento aparente" que o ADR-0002 condena, ativo hoje.

Ela tem 0 commits próprios, então é fast-forward:

```bash
git fetch origin
git rev-list --left-right --count origin/main...origin/teste   # o SEGUNDO campo tem que ser 0
git push origin origin/main:teste
```

**Se o segundo campo não for 0, PARE e me avise.** Significa que a branch ganhou commit próprio
depois desta auditoria, e o push deixou de ser fast-forward. Não force.

## T5 — apagar branches mortas

Só as de diff vazio contra a `main`. Confirme uma a uma antes de apagar:

```bash
for b in agent/fase-1-isolamento-preview claude/cleanup-branches-main-g3e57n \
         codex/execute-tarefa-a-e-tarefa-c codex/criar-arquivo-.mcp.json \
         codex/configurar-supabase-mcp-codex codex/alterar-row_id-para-by-default-em-tabelas; do
  echo "$b -> $(git diff --stat origin/main origin/$b | wc -l)"
done
```

`git push origin --delete <branch>` **apenas** nas que derem `0`. Se alguma der diferente de zero,
deixe viva e me diga qual.

## T6 — MCP também enxergar o projeto de teste

Branch: `chore/mcp-projeto-teste`.

`.mcp.json` e `.codex/config.toml` apontam os dois para
`project_ref=lwzsxuaqqeoamukduhev&read_only=true` (produção). Acrescente em ambos um **segundo**
servidor, `supabase-teste`, com `project_ref=gontnlfmothfglssbyyk`, mantendo `read_only=true` e o
mesmo conjunto de `features`. Não remova nem altere o de produção.

O OAuth de cada servidor é do dono; você só deixa a configuração pronta. Diga isso no commit, para
ninguém achar que passou a funcionar sozinho.

## Ordem e entrega

T1+T2 primeiro (uma branch, um PR) — é o que produz o relatório. T3 em seguida, independente. T4 e
T5 são git puro e podem ir a qualquer momento; T4 é a mais urgente em risco, então não a deixe para
o fim. T6 por último.

Em cada PR: `node tests/check.js` e `./scripts/semgrep.sh` verdes, e no corpo do PR diga qual gate
você **não** conseguiu rodar e por quê (rede). Não abra PR que você não consiga justificar assim.

---

## Depois do Codex — o que fica para o dono

1. **Vercel → projeto `divatdetro` → Settings → Deployment Protection → Protection Bypass for
   Automation:** gerar o segredo; salvar o mesmo valor no secret GitHub
   `VERCEL_AUTOMATION_BYPASS_SECRET`. Valor diferente falha igual a valor ausente.
2. **Banco de teste:** provisionar o que o relatório da T2 apontar. O checklist completo está em
   `docs/plano-ambiente-teste-2026-07-28.md` (schema, default-deny + `REVOKE MAINTAIN`,
   `pgrst.db_max_rows = 30000`, 14 tabelas no `supabase_realtime`, dados).
3. **Olho humano, que nenhum gate substitui:** abrir o preview da `teste` já ressincronizada e
   confirmar no DevTools que as requisições vão para `gontnlfmothfglssbyyk`; abrir
   `divatdetro.vercel.app` e confirmar que vão para `lwzsxuaqqeoamukduhev`.
4. **Decidir** o destino de `agent/fase-3-hardening-moderado` e
   `agent/fase-4-manutencao-incremental` — duas revisões grandes, independentes deste conserto.
