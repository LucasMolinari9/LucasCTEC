# Contexto para a próxima sessão — 14/08/2026

Snapshot de 14/08 — não atualizar. Handoff do plano de resposta a uma crítica externa ao projeto,
com a **Sessão 1 concluída** e as Sessões 2 a 6 especificadas.

## De onde isto veio

Uma crítica externa levantou três pontos sobre o projeto. Os três foram apurados **contra o
repositório**, não respondidos de memória:

| Afirmação | Veredito | Medido em 14/08 |
|---|---|---|
| "O processo virou um projeto paralelo" | **Procede, e é maior do que a crítica diz** | 4.773 linhas de produto servido (`app.js` + `styles.css` + `index.html` + `core.mjs`) contra 13.168 de processo (4.480 de gates/testes + 8.688 de docs) = **2,8 : 1** |
| "O semgrep local roda 5 regras; o CI roda 116, e já vazaram achados de shell-injection" | **Procede inteiramente — a crítica estava citando ESTE repo** | O número e o episódio estavam em `.github/workflows/atualizar-baseline.yml` e em `docs/historico/contexto-proxima-sessao-2026-08-09.md:91`. Os 3 achados de `run-shell-injection` aconteceram em 09/08 |
| "`app.js` é um monólito de 3.500 linhas" | **Procede** | 3.447 linhas. O estudo `docs/historico/estudo-modularizacao-frontend-2026-08-10.md` já planejou 4 fatias; só a fatia 1 foi feita — **22 linhas** em `src/domain/core.mjs`, e foi ela que derrubou o portal em 10/08 pelo `.vercelignore` |

**Lição de método, para quem for verificar afirmação sobre este repo:** a primeira apuração da
afirmação nº 2 deu "improcedente" porque varreu só `docs/semgrep.md` e `docs/CHANGELOG.md`. O
número morava num **comentário de workflow** e num **snapshot de `docs/historico/`**. Varra o repo
inteiro antes de dizer que algo não existe nele.

## A descoberta que organiza o resto

`tests/pure.harness.js` mantém **30 cópias verbatim** de funções do `app.js` (305 linhas),
guardadas pelo mecanismo `@canon` (`tests/canon.js` + `tests/drift.test.js` + §[1] do `check.js`).
Essas cópias **só existem porque o código não é modular**. Extrair cada função para `src/domain/`
apaga a cópia e a guarda junto — ou seja, a fatia 2 do `app.js` é também a maior fatia de corte de
custo de processo disponível. As duas críticas (nº 1 e nº 3) têm a mesma obra como resposta.

## Regras de operação combinadas com o dono

1. **Uma sessão = uma obra = um PR.** Nada vai para a `main` sem OK explícito dele.
2. Rodar os gates **antes** de abrir o PR. Só abrir com tudo verde.
3. Abrir o PR e postar **`@codex review`** como comentário (é o gatilho; confirmado no #98 e #123).
4. **Ler a revisão do Codex achado por achado** e tratar cada um: corrigir, ou explicar por que não
   se aplica. Não implementar cegamente nem concordar por educação.
5. Conferir o **preview deploy** — nas sessões que mexem em arquivo servido, confirmar que **os
   cards aparecem na tela**, não só que o build passou.
6. **Não fazer merge por conta própria.** A decisão é do dono.

### Limites do ambiente do agente, medidos (não supostos)

- `semgrep.dev` → HTTP **000**. Por isso os rulesets são vendorizados.
- Domínio da Vercel (preview) → HTTP **000**. **A conferência visual do preview é obrigatoriamente
  do dono.** O agente entrega os gates offline verdes e o `smoke` do CI; a tela, não.
- Disparar workflow pela API → **403 "Resource not accessible by integration"**. O token da sessão
  não tem `actions: write`. Rodar workflow é sempre ato do dono, pela aba Actions.
- **O dono opera pelo CELULAR.** "Rode `node …` na sua máquina" não é instrução executável para
  ele. E o **app** do GitHub não mostra o botão *Run workflow* — só o site no navegador, às vezes
  exigindo "versão para computador".

## Sessões

Carimbo em 14/08: **`build 10/08-A`** · `version.json: 2`.
Regra: `build <DD/MM>-<letra>`, letra reiniciando a cada dia. `version.json` incrementa **só**
quando muda arquivo servido.

| # | Obra | Arquivo servido? | Estampa | `version.json` | Estado |
|---|---|---|---|---|---|
| 1 | Vendorizar os rulesets do Semgrep | não | — | 2 | **✅ PR #123, mergeado em `c3b0627`** |
| 2 | `src/domain/agrupamento.mjs` | **sim** | `build DD/MM-A` | 3 | a fazer |
| 3 | `src/domain/busca.mjs` | **sim** | `build DD/MM-A` | 4 | a fazer |
| 4 | `src/domain/view-state.mjs` | **sim** | `build DD/MM-A` | 5 | a fazer |
| 5 | Documento de custo do processo | não | — | 5 | a fazer |
| 6 | Rebase e retomada do PR #98 | não | — | 5 | a fazer |

### Sessão 1 — feita, com uma pendência do dono

PR #123 (3 commits, 9 arquivos, +643/−35), mergeado em `c3b0627`. Duas rodadas do Codex, **6
achados, todos procedentes e tratados** — detalhe completo na entrada de 14/08 do `CHANGELOG`.

**Pendente, e só o dono pode:** aba Actions → **"Atualizar rulesets do Semgrep"** → *Run workflow*
→ branch `main`. É isso que preenche `.semgrep/vendor/` e fecha o gap de fato. Até rodar, o
`./scripts/semgrep.sh` roda só as 5 regras locais e **avisa em `stderr`** que o verde não é
conclusivo. O workflow abre um PR com o diff; **conferir esse PR antes do merge**.

> O botão só apareceu depois do merge: `workflow_dispatch` **só existe se o arquivo estiver na
> branch padrão** — a mesma armadilha do #115.

### Sessões 2 a 4 — a fatia 2 do `app.js`, via eliminação das cópias `@canon`

**Um módulo por sessão, nunca dois.**

| Sessão | Módulo novo | Funções a mover (todas já em `tests/pure.harness.js`) |
|---|---|---|
| 2 | `src/domain/agrupamento.mjs` | `groupBy`, `countBy`, `fmtMoney`, `byCodlinha`, `rjOrder`, `scoreEmpresa`, `dedupEmpresasPorRJ`, `classifyMunLines`, `terminaisDoMunicipio`, `resumoFrota`, `filtrarFrotaEmpresas` |
| 3 | `src/domain/busca.mjs` | `norm`, `yearOf`, `orIlike`, `municipiosExatos`, `localidadesQueCasam`, `matchEvent` |
| 4 | `src/domain/view-state.mjs` | `beginGen`, `isCurrentGen`, `commitViewResult`, `pushDetail`, `popDetail`, `pageBounds`, `MAX_TABS`, `makeTab`, `openTabState`, `closeTabState`, `tabMatchesEvent`, `dispatchRealtime`, `filtrarSituacao` |

**Ordem escolhida e por quê:** as duas primeiras não têm acoplamento com estado do modal.
`view-state` mexe no seam do ciclo de vida da view **e** no despacho do Realtime — é a de maior
consequência, vai por último e sozinha.

**Passos, iguais em cada sessão:**

1. Mover as funções do `app.js` para o módulo novo; `app.js` passa a importá-las.
2. Em `tests/pure.harness.js`, apagar os blocos `@canon` correspondentes e trocar por `require` do
   módulo real — **o padrão já existe**: a linha 2 do arquivo faz exatamente isso com o `core.mjs`.
3. **`.vercelignore`: acrescentar `!/src/domain/<novo>.mjs`.** Os níveis `src/` e `src/domain/` já
   estão reabertos, então é uma linha por arquivo. **Esquecer isto derrubou o portal em 10/08:**
   import ES é atômico, então um módulo em 404 mata o `app.js` inteiro e a tela fica vazia sem
   erro visível. `tests/check.js` §[1] deriva os imports e reprova nomeando o que ficou de fora.
4. Bumpar `#verTag` no `index.html` e o `version.json`.

**Gates das sessões 2 e 3:** `node tests/check.js` · `node scripts/check_views.mjs` ·
`./scripts/semgrep.sh` · **preview com os cards na tela (do dono)**.

**Gates da sessão 4:** os acima **mais** `node scripts/check_abas.mjs` e
`node scripts/check_selecao_linha.mjs`; e, no preview, abrir um card e confirmar que a atualização
ao vivo ainda chega.

**Fora de escopo nestas três:** módulo de acesso REST, separação de documentos por família,
composição do `LOADERS`. São as fatias 3 e 4 do estudo, dependem de injeção explícita de estado, e
misturá-las recria o risco que o faseamento existe para evitar.

**Ganho colateral esperado:** `pure.harness.js` cai de 305 linhas para perto de zero. Quando o
último `@canon` sair, `tests/canon.js` (56) e `tests/drift.test.js` (72) podem se aposentar —
**~430 linhas de processo apagadas** por ficarem desnecessárias, não por corte de disciplina.

### Sessão 5 — auditar o custo do processo

Entregável: `docs/planos/<data>-custo-do-processo.md`, sem mudança de código. Uma tabela por gate e
por workflow com três colunas: **o que já pegou de verdade** (evidência citada do `CHANGELOG`, não
impressão), **custo por rodada**, **veredito** (manter / fundir / aposentar).

Alvos já identificados:

- **`phase3-security.yml` é temporário por construção** — aposenta quando a Fase 3 entrar.
- **A API do GitHub lista 12 workflows; o disco tem 10.** Os dois extras
  (`backup-pre-revoke.yml`, `deploy-pages.yml`) são registros órfãos de arquivos já removidos, que
  o GitHub mantém por causa do histórico de runs. Não rodam. Vale confirmar e registrar, para
  ninguém "descobrir" isso de novo como se fosse achado.
- **8.688 linhas de docs.** `docs/historico/` são snapshots datados, já fora da checagem de deriva.
  O `CLAUDE.md` tem ~470 linhas lidas em **toda** sessão: é o orçamento de contexto mais caro do
  projeto e merece um teto declarado.
- **Critério de parada, que hoje não existe:** quando um gate novo se justifica. Sem essa regra, a
  razão 2,8 : 1 só sobe.

### Sessão 6 — rebase e retomada do PR #98

Ficou por último **por decisão do dono**, para que as obras sem SQL viessem primeiro. O #98 toca
`tests/check.js`, `scripts/semgrep.sh` e os workflows — vai precisar de rebase depois das sessões 1
a 4. Já sobreviveu a um rebase de 37 commits.

Os dois passos que faltam são do dono e exigem rede/secrets: runbook em
`docs/historico/contexto-proxima-sessao-2026-08-09.md`, ordem completa em
`docs/planos/fase-3-hardening-moderado.md`. **A parte de banco vai no ambiente de TESTE primeiro**,
com produção em janela separada e backup fresco (`CLAUDE.md` § Backup).

## O que este plano NÃO faz

Conferido contra o repo, porque o dono perguntou explicitamente se o banco corria risco:

- **Zero SQL** nas sessões 1 a 5. Nenhuma migração, nenhuma mudança de query ou de chave.
- **Realtime, lado do banco: intocado.** `alter publication` = **0 ocorrências** em
  `supabase/migrations/`. A publicação `supabase_realtime` e as 14 tabelas não são tocadas.
- **Nenhum dado apagado ou corrompido**, em nenhuma sessão.
- O que **pode** sair do ar é o **site**, e só nas sessões 2 a 4 — daí a conferência do preview ser
  obrigatória antes de cada merge.
