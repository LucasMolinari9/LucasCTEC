# Ambiente de teste — o que falta e o prompt para o Codex (29/07/2026)

Complemento operacional de `docs/plano-verificacao-ambiente-2026-07-29.md`, escrito para um
agente com **acesso ao repositório e nada mais** — sem painel da Vercel, sem painel do Supabase.

## A descoberta que reorganiza a lista

Os quatro verificadores vivos (`check_deriva.mjs`, `check_realtime.mjs`,
`check_data_quality.mjs`, `check_grants.mjs`) extraem `SB_URL`/`SB_KEY` do `app.js` por regex e
**não têm nenhuma forma de apontar para outro projeto** — não leem variável de ambiente, não
aceitam argumento. Isso é deliberado e está certo para o que eles foram feitos: auditar produção
por construção. O efeito colateral é que **nenhum deles consegue olhar o projeto de teste**.

Essa lacuna já está catalogada: é a **issue #74**, aberta em 29/07/2026, e é ela que mantém a
Fase 4 bloqueada. A issue pede mais do que "poder apontar para teste" — pede que os gates de PR
sejam **test-only e fail-closed contra produção**. Ver a seção T1, que segue a issue, não uma
versão minha dela.

E o MCP do Supabase — tanto o do Claude (`.mcp.json`) quanto o do Codex (`.codex/config.toml`) —
está fixado em `project_ref=lwzsxuaqqeoamukduhev&read_only=true`. Nenhum agente enxerga o projeto
de teste nem por aí.

### Correção: o banco de teste está provisionado, e já divergiu de produção

Uma versão anterior deste documento dizia que o provisionamento do banco de teste era suposição.
**Está errado, e a evidência estava nas branches de fase, que eu ainda não tinha lido.** O
projeto `gontnlfmothfglssbyyk` está provisionado e foi **endurecido** pela migração
`20260729034018_phase3_moderate_hardening` (PR #73, em rascunho), aplicada **só nele**. Produção
não recebeu DDL nenhuma.

Isso tem uma consequência que muda o desenho da verificação: a Fase 3 moveu os diagnósticos para
o schema `audit` e os helpers para `private`, deixando **apenas duas RPCs de produto** acessíveis
a `anon` (`divat_busca_logradouro`, `divat_linhas_regiao`). Ou seja, `divat_api_shape()`,
`realtime_tables()`, `divat_security_shape()` e `divat_data_quality()` **não são mais chamáveis
por `anon` no projeto de teste**. Um workflow que apontasse os verificadores atuais para teste via
anon key responderia 404 em quase tudo — e o erro pareceria banco vazio, não postura de segurança.

É exatamente por isso que a Fase 3 criou o `check_phase3_audit.mjs`, que entra por um **login
PostgreSQL** (`divat_auditor_ci`) em vez da anon key. **A chave de tudo é o secret
`SUPABASE_TEST_AUDIT_DATABASE_URL`** — sem ele, nada consegue auditar o banco de teste, e nenhum
agente pode criá-lo. É a única dependência realmente bloqueante do ambiente.

Segunda consequência, que vale registrar sem maquiagem: **teste e produção divergiram de
propósito, e teste hoje é mais restrito que produção.** Isso inverte parcialmente o valor do
ambiente — ele deixa de ser cópia fiel. A direção é a segura (o que passa no teste passa em
produção), mas o inverso não vale: um card que funciona em produção pode falhar no preview por
falta de RPC, e o sintoma será tela vazia sem erro. Enquanto a Fase 3 não for promovida a
produção, esse é o modo de falha a suspeitar primeiro quando um preview parecer quebrado.

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

## T1 — resolver a issue #74 (gates de banco com alvo explícito)

Branch: `fix/74-gates-test-only`. **Leia a issue #74 inteira antes de escrever código** — ela é o
contrato, este texto é só apoio. Ela é a dependência que bloqueia a Fase 4, e a issue pede
explicitamente que seja resolvida em **PR separada da Fase 4**, sem misturar escopos.

Crie `scripts/lib/ambiente.mjs`, único lugar que passa a resolver a config. Ele recebe o alvo de
forma **explícita** — variável de ambiente e/ou `--ambiente=` — e devolve `{ ambiente, url, key }`.
Regras que a issue impõe:

- **Nenhum gate de PR deriva o alvo do `app.js`.** Em PR, o alvo é configuração explícita do
  projeto de teste.
- **Fail-closed** se a configuração estiver ausente **ou** se o alvo resolvido for o ref de
  produção `lwzsxuaqqeoamukduhev`. Recusar produção é requisito, não zelo extra.
- O log precisa mostrar **contra qual project ref** rodou, e evidenciar a rejeição de produção
  quando ela ocorrer — **sem imprimir credencial**.

O que **não** muda: os jobs **agendados** do `db-checks.yml` e do `deriva.yml` continuam auditando
produção derivando do `app.js`. Esse acoplamento é o que mantém produção vigiada de graça e o
`CLAUDE.md` o trata como recurso. A separação é por gatilho: **cron → produção; PR → teste.**
Deixe isso escrito no cabeçalho de `ambiente.mjs`, porque é a parte que alguém vai "simplificar"
por engano depois.

Migre os quatro scripts para o helper, apagando as quatro cópias do `extrair(...)`.

Cuidados que não são simétricos:

- **Contra o projeto de teste, os verificadores por anon key não servem mais.** A Fase 3 (PR #73)
  moveu `divat_api_shape`, `realtime_tables`, `divat_security_shape` e `divat_data_quality` para o
  schema `audit`; `anon` só chama as duas RPCs de produto. O caminho de auditoria do teste é o
  `check_phase3_audit.mjs`, por login PostgreSQL (`SUPABASE_TEST_AUDIT_DATABASE_URL`). **Não tente
  contornar isso** reexpondo RPC a `anon` no teste — seria desfazer a Fase 3 para fazer o gate
  passar, que é o pior conserto possível.
- **`check_data_quality.mjs`:** o `data_quality_baseline.json` descreve a dívida do dado de
  PRODUÇÃO (17 codlinhas órfãs etc.). Contra teste ele não se aplica: rode sem baseline e trate
  como **informativo**, e diga isso na saída.
- **`check_grants.mjs`:** contém **bytes NUL literais** (ver restrição 4). As exceções do
  `security_baseline.json` são os defaults do `supabase_admin`. Se não transferirem para o teste,
  **relate; não edite o baseline** para passar.

Verificação: `node tests/check.js` e `./scripts/semgrep.sh` (sem `--full`) verdes. Você não
consegue rodar os verificadores localmente — sem rede até o Supabase. Isso é esperado; diga no PR.

## T2 — workflow do ambiente de teste

Mesma branch da T1. Crie `.github/workflows/ambiente-teste.yml`, espelhando o desenho do
`db-checks.yml` — leia-o antes: jobs **separados** e paralelos, para que um vermelho não esconda o
outro; `permissions: contents: read`; `uses:` presos ao SHA; `persist-credentials: false`.

- Gatilhos: `workflow_dispatch` + `schedule` semanal + `pull_request` nos paths envolvidos.
- Alvo: sempre o projeto de teste, explícito, nunca derivado do `app.js`.
- O job que depende de `SUPABASE_TEST_AUDIT_DATABASE_URL` deve **falhar com mensagem clara**
  quando o secret não existir — não pular em silêncio. Enquanto o dono não criar a credencial,
  esse job fica vermelho, e é assim que se sabe que ele está pendente.
- Escreva no cabeçalho **por que existe**: até aqui nenhum gate olhava o projeto de teste, e a
  Fase 3 tornou o caminho por anon key insuficiente.

Depois do merge, **dispare à mão** e relate a saída job a job. Esse relatório é o entregável mais
importante desta tarefa. Não conserte o banco — você não tem acesso, e não é para ter.

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

**Correção de método: `git diff origin/main origin/<branch>` NÃO serve para decidir isto.** Uma
branch já mergeada mas atrasada mostra diff enorme — o diff é a `main` que andou, não trabalho
dela. Foi o erro da primeira versão desta tarefa, e ele teria mandado você preservar cinco branches
mortas e, pior, teria escondido o achado dos dois domínios de produção. Use ancestralidade:

```bash
git merge-base --is-ancestor origin/<branch> origin/main   # sucesso = totalmente contida na main
```

Para as que **não** forem ancestrais, o commit exclusivo pode ainda assim ter sido aplicado na
`main` por outro SHA (squash/rebase). Aí a pergunta certa é se as árvores coincidem:

```bash
git diff origin/main origin/<branch> | wc -l    # 0 = conteúdo idêntico, nada se perde
```

E se **nem isso** for zero, leia o commit antes de apagar — pode haver trabalho que a `main` nunca
recebeu. Foi exatamente o caso de `claude/cleanup-branches-main-g3e57n`, cuja versão de
`HOSTS_PROD` tinha três domínios enquanto a `main` tinha um.

Estado em 29/07/2026, já apurado — todas estas são seguras:

| Branch | Por quê |
|---|---|
| `codex/execute-tarefa-a-e-tarefa-c` | ancestral da `main` |
| `codex/alterar-row_id-para-by-default-em-tabelas` | ancestral da `main` |
| `agent/fase-1-isolamento-preview` | árvore idêntica à `main` |
| `codex/criar-arquivo-.mcp.json` | conteúdo (`.mcp.json`) já na `main` |
| `codex/configurar-supabase-mcp-codex` | conteúdo (`.codex/config.toml`) já na `main` |
| `claude/cleanup-branches-main-g3e57n` | o que ela tinha a mais foi portado para a `main` |

**Nota:** `git push origin --delete` é recusado com HTTP 403 pelo proxy do ambiente do Claude.
A deleção precisa sair do Codex ou da UI do GitHub.

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

## Decisões do dono — recomendação, em ordem

**1. Criar a credencial auditora e o secret `SUPABASE_TEST_AUDIT_DATABASE_URL`. É a peça que
destrava tudo.** Depois da Fase 3, é o único caminho de auditoria do banco de teste; sem ele, o
ambiente continua sem verificação nenhuma e a T2 nasce vermelha. Rodar
`scripts/bootstrap_phase3_auditor.sql` com senha de gerenciador e validade curta, gravar a URL de
conexão (`divat_auditor_ci`, ref de teste) no secret de Actions.

**2. Criar o `VERCEL_AUTOMATION_BYPASS_SECRET` na mesma sessão.** Vercel → projeto `divatdetro` →
Settings → Deployment Protection → Protection Bypass for Automation; o **mesmo** valor no secret
do GitHub. Valor diferente falha igual a valor ausente. É de dez minutos e destrava o job de
preview do smoke.

**3. PR #73 (Fase 3): não mergear ainda — mergear logo depois do item 1.** A migração está
testada, com rollback exercitado, e a PR é boa. Mas ela já está aplicada no banco de teste
enquanto o código que a descreve segue em rascunho, e o gate que prova essa postura
(`check_phase3_audit.mjs`) não roda sem a credencial do item 1.

**Atenção ao laço:** o `workflow_dispatch` do `Phase 3 database security` **não está disponível**
— o GitHub só oferece despacho manual de workflow presente na branch padrão, e o
`phase3-security.yml` só existe na `agent/fase-3-hardening-moderado`. Não dá para disparar antes
de mergear, nem faz sentido mergear antes de ver verde. A saída é rodar o auditor **localmente**,
que é onde a credencial já está nesse momento:

```bash
SUPABASE_TEST_AUDIT_DATABASE_URL='postgresql://divat_auditor_ci:…' \
  node scripts/check_phase3_audit.mjs
```

Ordem recomendada: criar a credencial → rodar o auditor local → verde → gravar o secret → sair do
rascunho e mergear. O workflow chega na `main` junto e passa a ser despachável dali em diante.
Assim a Fase 3 entra com evidência viva, não com evidência narrada no corpo da PR.

Duas armadilhas práticas do bootstrap: ele **exige `psql`** (usa `\set`, `\if` e `\gexec`, que o
SQL Editor do painel não interpreta), e o `check_phase3_audit.mjs` só aceita host direto
`db.gontnlfmothfglssbyyk.supabase.co` ou pooler com usuário `divat_auditor_ci.<ref>` — qualquer
outra forma, inclusive produção, é recusada de propósito.

**4. Fase 4: segurar.** É a maior e a mais arriscada — muda a arquitetura zero-build ao publicar
`shared/*.js`, mexe na allowlist do `.vercelignore` e no detector de versão, e está empilhada
sobre a Fase 3 ainda não mergeada. Ela própria se declara bloqueada pela #74. Ordem: #74 (T1)
entra sozinha → Fase 3 entra → rebase da Fase 4 → revisão dela como mudança de arquitetura, não
como manutenção. Mergear as três juntas mistura três escopos numa revisão só.

**5. Não tornar o `Deploy smoke` check obrigatório antes de ele estar verde.** Hoje ele falha em
100% dos runs; promovê-lo a obrigatório agora tranca todos os merges. Ordem: T3 + item 2 →
confirmar verde na `main` → então exigir.

**6. Promover a Fase 3 a produção — decidir, mas não agora.** Endurecimento que vive só no teste
não protege nada, e enquanto a divergência existir o preview pode falhar por falta de RPC que
produção tem. Mas é DDL no banco vivo: exige backup fresco (`docs/backup.md`) e revisão própria.
Sugestão: depois de a Fase 3 rodar verde no teste por algumas semanas, com o gate da T2 ativo.

**7. Olho humano, que nenhum gate substitui:** abrir o preview da `teste` já ressincronizada e
confirmar no DevTools que as requisições vão para `gontnlfmothfglssbyyk`; abrir
`divatdetro.vercel.app` e confirmar que vão para `lwzsxuaqqeoamukduhev`.
