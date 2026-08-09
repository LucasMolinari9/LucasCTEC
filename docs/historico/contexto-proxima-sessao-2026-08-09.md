# Contexto para a próxima sessão — 09/08/2026

> **Snapshot de 09/08/2026 — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`;
> a cronologia, no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma sessão e envelhece
> de propósito.

> **O código da issue #99 está pronto e no #98. O que falta são dois passos do dono, e o primeiro
> deles deixou de precisar de terminal nesta sessão.** O dono opera **pelo celular** — leve isso a
> sério ao propor qualquer coisa: "rode `node ...` na sua máquina" não é instrução executável para
> ele.

---

## Onde as coisas estão

| | |
|---|---|
| `main` | `3072f718` — merge do PR #115 (workflow `atualizar-baseline`) |
| PR #98 | **aberto**, head `2f740ca`, base na `main` atual, sem conflitos |
| PR #115 | **mergeado** nesta sessão |
| Issue #99 | **aberta**, com o comentário que registra a decisão. Fechar só depois do gate verde |
| Plano | `docs/planos/2026-08-09-baseline-por-ambiente.md` — 18/18 caixas marcadas |

**Placar do #98 (head `2f740ca`):** 9 verdes · `seguranca` ❌ · `qualidade` ❌ · `test-auditor` ⏭️

Os dois vermelhos **não são bug de código** e já foram diagnosticados contra o log real do CI:

- **`seguranca`**: `✗ Baseline sem 'digest' para o ambiente 'teste'`. A RPC respondeu — a chave
  anon do `ambientes.json` está **correta** e o gate chegou até a comparação. Só falta a medição.
- **`qualidade`**: `PGRST202 — Could not find the function public.divat_data_quality`. É o desenho
  funcionando: a migração 1 moveu a função para o schema `audit` e a migração 2 tem uma asserção
  que falha se `anon` puder executá-la. Depende do login auditor, que ainda não existe como secret.

---

## O que falta — na ordem

### 1. Medir o baseline de segurança do teste · **pelo celular, sem terminal**

Aba **Actions** → **Atualizar baseline** → **Run workflow**:

- Branch: `claude/divat-fase3-diagnosticos-y7ry57`
- Baseline: `seguranca`
- Alvo: `teste`

Ele mede, escreve o slot e **abre um PR com o diff** (o diff também vai no resumo do run, que no
celular é um toque em vez de vários). Conferir e mergear no branch do #98 → **`seguranca` verde**.

O que conferir antes do merge: o diff tem de tocar **só** `ambientes.teste`; `achados` (a política,
no topo) e o slot de `producao` não podem ter mudado. Contagem que **subiu** é privilégio novo —
investigar, não é rotina.

### 2. O login auditor · precisa do painel do Supabase

**Runbook completo, já escrito e ainda válido:**
[`contexto-proxima-sessao-2026-08-08.md` § "Runbook do que é do dono"](contexto-proxima-sessao-2026-08-08.md#runbook-do-que-é-do-dono-celular-basta) —
os três passos (criar o role no SQL Editor, montar a URL do **pooler**, gravar o secret
`SUPABASE_TEST_AUDIT_DATABASE_URL`). Não foi duplicado aqui de propósito: duas cópias de um runbook
divergem, e aquela é a boa.

Dois pontos daquele runbook que valem repetir porque são os que derrubam a tentativa:

- **tem que ser a URL do _Session pooler_**, não a conexão direta — o runner do GitHub é IPv4 e a
  direta do Supabase é IPv6;
- o `scripts/bootstrap_phase3_auditor.sql` versionado **não roda no SQL Editor** (usa `\set`,
  `\if`, `\gexec` do `psql`). A variante para o painel está naquele handoff.

→ **`qualidade` e `test-auditor` verdes.** Depois, rodar o workflow do passo 1 de novo com
Baseline `qualidade` / Alvo `teste`, para preencher aquele slot.

### 3. Merge do #98 → `main`

Com tudo verde. Aí a issue #99 fecha e o plano migra deste diretório.

O slot de `producao` dos dois baselines fica `null` **de propósito**, até a janela de promoção
descrita em `docs/planos/fase-3-hardening-moderado.md`.

---

## Armadilhas descobertas hoje (custaram tempo; não repita)

- **`workflow_dispatch` só aparece se o arquivo estiver na branch PADRÃO.** Foi por isso que o
  workflow foi para a `main` sozinho, no #115, antes do #98 — senão ficaria circular: o botão que
  destrava o gate que segura o PR estaria preso dentro do PR.

- **Chave anon numa URL longa quebra no celular.** A tentativa de medir abrindo
  `…/rpc/divat_security_digest?apikey=<JWT>` no navegador devolveu `Invalid API key`. **A chave não
  está errada** — o log do CI provou que a mesma chave funciona. A URL é cortada no toque, e JWT
  truncado é chave inválida. Se for tentar de novo por esse caminho, o link precisa chegar inteiro.

- **`./scripts/semgrep.sh` local roda 5 regras; o CI roda 116.** Verde local **não** é evidência de
  verde no CI. Foi assim que 3 achados de `run-shell-injection` passaram para o CI no workflow
  novo. Regra prática: **nenhum `${{ ... }}` dentro de bloco `run:`** — tudo por `env:` e lido como
  `"$VAR"`. Já corrigido, mas a lição vale para todo workflow futuro.

- **Cuidado ao tocar `scripts/check_grants.mjs` num commit destinado à `main`.** Ele está no filtro
  de paths do `db-checks.yml`, e o push dispararia aquele gate contra o banco de **teste** com o
  script **antigo** da `main`, que não conhece o schema `audit` → main vermelha por efeito colateral
  de um commit de documentação. Foi por isso que o #115 ficou com escopo mínimo (só o workflow e as
  duas contagens de `CLAUDE.md`/`README.md`).

- **Duas sessões trabalharam na mesma branch ao mesmo tempo, sem se ver.** As Tasks 1–4 da #99
  foram implementadas em duplicata (commits `f423c78`/`6bb7123` de um lado, uma implementação
  equivalente do outro). As duas convergiram na mesma forma — o desperdício foi de trabalho, não de
  qualidade. **Rode `git fetch` antes de começar**, e se for despachar sessões em paralelo, divida
  por arquivo ou por task.

---

## O que esta sessão fez

- Executou o plano da #99 inteiro (Tasks 1–5), incluindo a Task 4, que era recomendação e não
  pedido da issue.
- Da leva duplicada, ficou a primeira; da segunda vieram os **nomes de ambiente derivados de
  `scripts/ambientes.json`** na guarda `§[2b]` (antes era a dupla literal `['teste','producao']`,
  uma terceira lista mantida à mão) e o registro de procedência no plano.
- Criou o workflow `atualizar-baseline.yml` — `workflow_dispatch` apenas, nunca escreve em branch,
  sempre abre PR. Reescreveu as frases "SÓ LOCAL, nunca no CI" do `check_grants.mjs` e do
  `db-checks.yml` para enunciarem a regra pelo que ela protege (nunca dentro de um gate; sempre com
  decisão humana e diff revisável em PR), apontando para o workflow — duas frases em contradição
  envelhecem numa mentira.
- CHANGELOG e o plano fechados.

**Toda guarda nova foi vista falhando antes de passar.** As mutações que valem lembrar: ler o campo
de topo derruba os casos de leitura; escrever sem preservar o outro slot derruba os de isolamento;
e colapsar `achados: null` em lista vazia faz o caso do banco não medido sair **0** — o fail-open
medido diretamente, não deduzido.

---

## Se algo der errado no passo 1

O workflow sai 1 sem gravar nada quando encontra um dos **seis indicadores graves** — e isso é o
desenho, não defeito: `check_grants.mjs` recusa baseliná-los. Se acontecer, a resposta certa é
**revogar o privilégio no banco**, nunca registrar exceção. Não existe caminho de contorno pelo
workflow, de propósito.

A combinação `seguranca` + `producao` existe no menu, roda, e faz **coisa diferente** do que o nome
sugere: produção ainda não tem as migrações da Fase 3, então cai no caminho antigo, que mede
`achados` (a política) e não preenche slot de medição nenhum. O corpo do PR avisa isso em destaque.
Hoje, o alvo certo é `teste`.
