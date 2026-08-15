# Plano — desmontar o monólito do `app.js` (fatias 3 e 4 do estudo)

Escrito em 14/08/2026. Diferente dos arquivos de `docs/historico/`, este é um plano **vivo**:
atualize-o conforme as fases forem entrando, e apague-o quando a última fechar.

**Linha de base:** todos os números abaixo valem para o `app.js` **depois da Sessão 2** (PR #125,
`src/domain/agrupamento.mjs`), ou seja **3.352 linhas**. Na `main` de hoje são 3.447.

## Por que

Uma crítica externa disse que o `app.js` é "um monólito de 3.500 linhas". Procede. As Sessões 1 e 2
do plano de 6 ([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md))
responderam à crítica **irmã** — a de que o processo virou projeto paralelo — com ganho medível.
Mas o monólito mal foi arranhado: 3.447 → 3.352 linhas, **2,8%**. As Sessões 3 e 4, já
especificadas, movem mais funções puras pequenas: outras ~150 linhas. Terminadas as três, o
`app.js` fica perto de **3.200**. Continua monólito.

A massa está onde nenhuma sessão planejada toca:

| bloco (grep a marca da seção) | linhas | % do `app.js` |
|---|---|---|
| `MODAL / SISTEMA DE VIEWS` | 1.956 | 58,3% |
| `COMPONENTES AUXILIARES` | 299 | 8,9% |
| `SUPABASE CONFIG` | 171 | 5,1% |

Dois terços do arquivo. O estudo de 10/08
([`../historico/estudo-modularizacao-frontend-2026-08-10.md`](../historico/estudo-modularizacao-frontend-2026-08-10.md))
chama isso de fatias 3 e 4 e as **condiciona**, com razão: separar documentos "somente após injetar
explicitamente estado e render target; não exportar dezenas de variáveis do IIFE".

O diagnóstico concreto: um documento típico (`renderFrota`, seção `MODAL`) depende de 4 funções
puras, 4 helpers de DOM, 4 de I/O e — o problema — **lê `currentView`**, estado mutável de módulo.
Enquanto isso for verdade, mover o arquivo só troca um monólito por módulos rasos acoplados por
variável global. Seria piorar com aparência de melhorar.

## O que torna isto executável agora

**O padrão de injeção já existe no repo e está provado em produção.** O seam do `pdfHTML` fez
`paginate`, `paginateTable`, `paginateLines`, `lineResults` e `paginateEvents` receberem `view` e
`gen` **por parâmetro**, em vez de relerem `currentView`. As fases abaixo estendem essa mesma
disciplina ao resto — não é desenho novo.

**A leitura de estado global é estereotipada, não difusa.** `const view = currentView, gen =
beginGen(view)` aparece ~30 vezes, quase sempre como **primeira linha** do loader/render. Isso faz
da Fase A um trabalho mecânico e revisável, não uma cirurgia.

## ⚠️ PRECONDIÇÃO DE BLOQUEIO — travessia transitiva (PR #122)

**Nenhuma fase B, B2 ou C começa antes de o PR #122 entrar na `main`.** Não é zelo de processo: é
o único item desta lista que, se ignorado, quebra o portal em produção sem nenhum gate acusar.

Nem o `tests/check.js` §[1] nem o `scripts/check_deploy.mjs` seguiam import de módulo para módulo.
Com `app.js → familia.mjs → dep.mjs` e `dep.mjs` fora da allowlist, os dois ficavam **verdes** e o
portal morria — import ES é atômico, um 404 mata o grafo inteiro. O smoke foi corrigido no PR #128;
o `check.js` é o #122.

Estado medido em 14/08/2026, contra a `main` de hoje (`761213d`):

| | medida |
|---|---|
| #128 (smoke) | CI verde nos 5 checks; `mergeable_state: clean` |
| #122 (`check.js`) | cherry-pick **limpo** sobre a `main` de hoje — **não precisa de rebase** |
| #122 — gates | `node tests/check.js` **verde** já rebasado, e verde também com o #128 empilhado |
| #122 — mutação | com `dep.mjs` importado só por `agrupamento.mjs`: **acusa**, nomeando arquivo e importador |
| `main` sem #122 | a mesma mutação passa como `✓ allowlist … publica os 15 assets` — **o buraco** |

O que falta no #122 é **só o merge**. O CI que aparece verde nele é de 10/08, contra uma base de
15 commits e 5 merges atrás (#123 a #127); a evidência acima é que vale, e ela foi levantada
rodando os gates, não lendo o badge — que é a mesma disciplina que este plano cobra das fases.

## Achados de planejamento do Codex — tratados neste PR

Os outros quatro achados da revisão do Codex sobre o PR #126 eram defeitos **do plano**, não do
código: seguir as fases como estavam escritas esbarrava neles. Foram tratados nas seções
correspondentes, e ficam registrados aqui com o destino de cada um. Threads em
`https://github.com/LucasMolinari9/LucasCTEC/pull/126`.

| achado (2ª rodada, P2) | onde foi tratado |
|---|---|
| Os paginadores não mudam de arquivo "sem mudar assinatura" | **Fase B2**, que passou a separar os cinco em vez de tratá-los como bloco |
| Os loaders de C1 dependem de wrappers privados (`lineDocView`, `searchPanel`/`lineSearchRun`) | **Fase C**, que passou a mover só os `render*` |
| A bancada de corrida da Fase A precisa da asserção POSITIVA | **Fase A**, asserção (c) |
| `activeLine` tem de estar no contrato da Fase A | **Fase A**, o `ctx` ganhou `line` |

**3ª rodada (P1) — as correções acima estavam certas no diagnóstico e erradas na dose.** O Codex
revisou o próprio commit que fechou os P2 e achou três defeitos mais graves, todos reproduzidos
contra o `app.js` antes de aceitar:

| achado (3ª rodada, P1) | o que estava errado | onde foi tratado |
|---|---|---|
| Separe os renders do registro de loaders | `runView` faz `await view.loader()` **sem argumentos**, e 14 dos 17 loaders não têm `render*` autônomo — o `Object.assign` prometido quebraria a abertura do card | **Fase C** reescrita (a Fase D foi cancelada aqui e **restaurada** na 4ª rodada) |
| Permita derivar o contexto com a linha encontrada | no `lineSearchRun` a linha certa só existe **depois** do `await` (`:1322`, `:1325`); render que lesse só o `ctx.line` inicial pegaria `null` ou a linha anterior | **Fase A**, `withLine(ctx, linha)` |
| Propague `afterPaint` por `lineResults` | `lineResults` chama `paginateLines` por dentro e tem **9 call sites**; injetar só em `paginateLines` deixaria listas sem handler de seleção, em silêncio | **Fase B2**: a família de listas **fica** no `app.js` |

**4ª rodada (P1) — e a regra que saiu dela.** O Codex derrubou as duas decisões que a 3ª rodada
tomou: manter as listas no `app.js` (o argumento "os 9 call sites estão no `app.js`" era retrato
**pré-extração** — eles pertencem às famílias que C3/C4 movem) e cancelar a Fase D (a justificativa
usava o `await view.loader()` **sem argumentos de hoje**, que a própria Fase A revoga).

Quatro rodadas com a mesma assinatura: **entradas verificadas, saídas inventadas.** Em cada uma, as
alegações do revisor foram conferidas com `grep` antes de aceitas — e a resolução escrita em
seguida saiu da cabeça, sem reabrir o arquivo. Nenhum gate pega isso: `check.js`, `semgrep`,
`views` e `smoke` ficaram verdes nas quatro. A §[2b] confere fatos **numéricos** em docs; nada
confere se uma frase descreve corretamente o comportamento do código.

Daí as duas regras que este documento passa a seguir, e que valem para quem o editar depois:

1. **Toda afirmação sobre comportamento de código cita `arquivo:linha`** — e a linha é aberta antes
   de a frase ser escrita. Citação é falsificável; prosa afirmativa não é.
2. **Onde a decisão depende de código que ainda não existe, o plano RESTRINGE em vez de decidir.**
   As seções B2 e C agora declaram a restrição e as opções com o custo de cada uma, e nomeiam quem
   escolhe. Três versões seguidas tentaram fechar em prosa o que só a extração resolve.

## Ordem — uma fase por sessão, um PR por sessão

| ordem | fase | entrega | risco |
|---|---|---|---|
| **0** | **merge do #122** | travessia transitiva no `check.js` — **trava B/B2/C** | — (só merge) |
| 1 | Sessão 3 (já especificada) | `src/domain/busca.mjs` | baixo |
| 2 | Sessão 4 (já especificada) | `src/domain/view-state.mjs` | médio (seam + Realtime) |
| 3 | **A** | contexto explícito + **bancada de corrida** | médio |
| 4 | **B** | `src/data/rest.mjs` — **encerra o mecanismo `@canon`** | baixo |
| 5 | **B2** | `src/ui/doc.mjs` + acesso a lookups — o seam que torna a C possível | médio |
| 6–9 | **C1…C4** | documentos por família, **cada uma movendo seus `render*`** | cresce a cada uma |
| 10 | **D** | `LOADERS` como composição explícita (item 4 do estudo) | baixo |
| 11 | **E** | infra do modal + shell de busca de linha (opcional) | médio |

A ordem 0 não é fase: é o merge de um PR já pronto.

**Por que ele trava B/B2/C e não as Sessões 3 e 4** — a distinção não é "importa outro módulo",
é **ser alcançável só por outro módulo**. Hoje o `app.js` importa `core.mjs` e `agrupamento.mjs`
os dois **diretamente**, e o `agrupamento.mjs` ainda importa o `core.mjs` (`src/domain/agrupamento.mjs:5`).
Ou seja: a aresta módulo→módulo **já existe**, e o buraco do `check.js` só não morde porque essa
aresta é hoje **redundante** — quem ela alcança, o `app.js` também alcança direto. As Sessões 3 e 4
mantêm essa propriedade (o `app.js` importa o que criam). Já a B2 nasce para ser importada pelas
famílias da C, e uma família importar `src/ui/doc.mjs` que o `app.js` não importe é exatamente o
caso em que o gate fica cego e o portal morre. É por isso que a trava cai em B/B2/C e não antes:
não por precaução genérica, mas porque é ali que a redundância acaba.

**Por que a Sessão 4 antes da Fase A:** ela extrai `beginGen`/`isCurrentGen`/`commitViewResult`
como módulo puro sobre um objeto `view`. É exatamente o seam que a Fase A injeta — fazer A antes
seria injetar um contrato que ainda mora dentro do IIFE.

**Por que A antes de B, e por que a ordem quase não importa:** o `ctx` da Fase A carrega **ciclo de
vida da view e a linha corrente** (`view`, `gen`, `pane`, `host`, `line`) — o que ele não carrega é
**acesso a dado**. Logo A mexe na *primeira linha* de cada render e B mexe nas *chamadas de
`sbFetch`*: linhas diferentes, sem retrabalho. A vem antes porque é a precondição declarada pelo
estudo, e porque, se correr mal, descobrimos barato.

As Sessões 5 (custo do processo) e 6 (retomada do PR #98) do plano vigente não conflitam e podem
entrar em qualquer ponto desta fila.

---

## Fase A — contexto explícito (precondição de tudo)

Nenhum arquivo muda de lugar. Muda o **contrato**.

- Cada `render*`/loader passa a **receber** `ctx = { view, gen, pane, host, line }` de quem o chama,
  em vez de abrir com `const view = currentView, …`. Quem monta o `ctx` são os pontos que já
  conhecem a view: `runView`, `lineDocView`, `lineDocRun`, `lineSearchRun` e `searchPanel`.
- **A invocação do registro muda junto, e isso é entregável explícito da Fase A.** Hoje o `runView`
  faz `await view.loader();` — **sem argumentos** (`app.js`, seção `MODAL / SISTEMA DE VIEWS`,
  dentro de `runView`). Passa a `await view.loader(ctx);`. Registrar isto aqui não é detalhe de
  implementação: é o que torna possível, mais tarde, um loader **exportado por módulo** entrar no
  registro — um loader que recebe `ctx` pode morar em qualquer arquivo. Sem esta linha, a Fase D
  fica sem contrato (e foi exatamente o erro de uma versão anterior deste plano, que cancelou a D
  citando o `loader()` sem argumentos **de hoje**, ignorando que a própria Fase A o revoga).
- **`line` é o quinto campo por necessidade, não por conforto** — é o `activeLine` capturado no
  mesmo instante que `view`/`gen`. Sem ele a Fase C não teria fonte válida para a linha corrente
  (`lineDocView` e `lineSearchRun` leem `activeLine` direto do IIFE hoje, e o estudo proíbe
  exportá-lo), e a B2 acabaria reabrindo uma fase dada por encerrada. Vale a mesma disciplina do
  `view`: é **snapshot**, capturado antes do `await` e usado depois dele — quem reler o global no
  fim reintroduz a corrida por outra porta. Escrita continua só por `selectLine`.
- **O contrato precisa de `withLine(ctx, linha)`, e não é detalhe de conveniência.** Há um fluxo em
  que a linha certa **só existe depois do `await`**: no `lineSearchRun`, quando não há linha ativa
  ou o termo casa outra, a linha sai da busca e é passada explicitamente ao render —
  `if (lines.length === 1){ selectLine(lines[0]); return render(host, lines[0]); }` (`app.js:1322`),
  e o mesmo no clique da lista (`:1325`). Um render que consumisse **só** o `ctx.line` capturado no
  início receberia `null` (sem linha ativa) ou **a linha anterior** (troca de linha) — regressão
  silenciosa, do tipo que pinta o documento da linha errada sem erro nenhum. Então:
  `withLine(ctx, linha)` devolve `{ ...ctx, line: linha }` — **mesmos `view` e `gen`**, linha nova.
  Só quem *resolve* uma linha deriva; ninguém relê `activeLine`. Preservar `view`/`gen` na derivação
  é o ponto: um `gen` novo ali destruiria justamente a proteção que a Fase A existe para dar.
- `currentView` continua existindo e continua sendo escrito só por `setCurrentView`. O que acaba é
  **ler** essa variável de dentro de um documento. O mesmo vale para `activeLine`: continua
  existindo e continua sendo lido pelo wiring do `app.js` — o que acaba é lê-lo de dentro de um
  documento.
- Duas exceções ficam como estão, e por motivo documentado: `_panelRun` está fora do seam de
  propósito (é atribuído antes de qualquer `await`, então não há corrida a proteger), e os 4 call
  sites com `pdf:false` seguem passando `view`/`gen`.

**Como se sabe que deu certo — e por que os gates de hoje NÃO bastam.** A tentação é dizer que
`check_views.mjs`, `check_abas.mjs` e `check_selecao_linha.mjs` cobrem isto. **Não cobrem**, e a
diferença importa: nenhum dos três **cria a ordenação** que define o bug. O `check_views` abre cada
view numa página limpa, em sequência; o `check_abas` dá `waitForTimeout` **depois** de cada ação,
ou seja, espera a requisição assentar antes de trocar de aba; o `check_selecao_linha` exercita
seleção e paginação. O stub do PostgREST responde instantaneamente. Os três podem ficar verdes
enquanto um render atrasado pinta o pane ATIVO em vez do pane que ele capturou.

Ou seja: o seam `beginGen`/`commitViewResult` nasceu de raciocínio, não de um teste que reproduz a
corrida — e a Fase A mexe justamente nele. **Entregável obrigatório da Fase A, no mesmo PR:** uma
bancada que force a ordenação — stub com resposta atrasada controlável, abrir documento na aba 1,
trocar para a aba 2 antes de a resposta voltar, e afirmar que:

- **(a)** o pane da aba 2 não foi pintado pelo render da aba 1;
- **(b)** o `pdfHTML` da aba 2 não foi sobrescrito;
- **(c)** o pane **da aba 1** e o `pdfHTML` **dela** recebem a resposta atrasada.

A fase **não fecha** sem ela — e não fecha com (a) e (b) apenas. Sem a asserção positiva, a
bancada aprova uma implementação que simplesmente **descarta** toda resposta concluída após uma
troca de aba: (a) e (b) ficariam verdes e a aba 1 ficaria eternamente sem o resultado que pertence
ao pane que ela capturou. Descartar tudo passa numa bancada que só sabe dizer "não corrompeu" —
é o modo de falha clássico de guarda escrita pelo lado negativo, e este repo já tem um caso
(`matchEvent`, coberto por anos de verde que só olhava a assinatura).

## Fase B — módulo profundo de acesso REST

`src/data/rest.mjs`: `sbFetch`, `fetchComTimeout`, `esperar`, `SB_TIMEOUT_MS`, `SB_RETRIES`,
`CANCELADO`, `ehCancelamento`, `marcarTrunc`/`bannerTrunc`, `SB_MAX_ROWS`, `selecionarSupabase`.
Só entra se a interface **esconder** timeout, retry e truncagem — condição literal do estudo.
Config (URL, chave, `fetch`) injetada, não lida de global.

**Mais `preencherLookup`, que não é REST e por isso quase ficou de fora.** Ele preenche cache de
lookup a partir de um `buscar()` recebido — pertence a `src/data/lookups.mjs`, não ao módulo REST.
Mas é a **12ª** cópia `@canon` do `harness.js` (usada por `sbFetch.test.js`), então deixá-la para
depois anularia o marco abaixo: as máquinas anti-drift seguiriam necessárias por causa de uma
função só. Ou ela sai nesta fase, ou `canon.js`/`drift.test.js` **permanecem** até que saia. Não há
terceira opção, e escolher a primeira é o que fecha a conta.

**Também entra no mesmo PR:** os runbooks que mandam editar `SB_MAX_ROWS` no `app.js` —
`CLAUDE.md` (§ Supabase, o parágrafo dos "TRÊS lugares a mudar juntos") e o comentário do
`docs/backup_schema.sql`. Mover a constante sem mover a instrução deixa dois runbooks apontando
para um lugar onde ela não está mais; e a guarda docs×código **não** cobre esse caminho, então a
falha só apareceria quando alguém subisse o teto do PostgREST e a truncagem continuasse no valor
velho — em silêncio.

**O marco que esta fase fecha:** [`../../tests/harness.js`](../../tests/harness.js) guarda as **12
últimas cópias `@canon`** do repositório. Depois das Sessões 3 e 4, o `pure.harness.js` fica com
**zero**. Portanto, ao fim da Fase B — **incluindo o `preencherLookup`** — não sobra nenhuma cópia
verbatim, e [`../../tests/canon.js`](../../tests/canon.js) (56 linhas) e
[`../../tests/drift.test.js`](../../tests/drift.test.js) (72) se aposentam, junto com a §[2] do
`check.js`. São ~430 linhas de processo apagadas por terem **perdido o objeto**, não por corte de
rigor. É a resposta definitiva à crítica nº 1.

## Fase B2 — o seam dos helpers compartilhados (sem ela, a Fase C não acontece)

As Fases A e B **não bastam** para mover um documento. Medido no `renderFrota`: ao virar módulo
nativo ele perde acesso a `loading`, `emptyLinha`, `metaRows`, `docHead`, `empNome`, `getEmpresas`
e `FROTA_FIELDS` — todos privados do IIFE. Outras famílias ainda leem `activeLine` e usam os
lookups e os paginadores. A Fase A injeta só ciclo de vida da view; a B expõe só REST; e adiar a
UI para a Fase E (opcional!) deixaria a C impossível ou forçaria uma extração não planejada no meio
dela. Por isso esta fase existe, e vem **antes** da C:

- `src/ui/doc.mjs` — `docHead`, `metaRows`, `tableHTML`, `colClass`, `loading`, `emptyBox`,
  `emptyLinha`: markup puro, sem estado. É o grosso do que falta.
- `src/data/lookups.mjs` — `getEmpresas`/`empNome`/`getIbge`/`getOrigem`/`getEvLookups` e o
  `preencherLookup` que veio na B, com o cache explicitado em vez de global do IIFE.
- Os paginadores **não são um bloco só**, e tratá-los como bloco foi um erro da 1ª versão deste
  plano: "já recebem `view`/`gen`, logo mudam de arquivo sem mudar assinatura" vale para dois dos
  quatro. Medido no `app.js`:

  | função | do que depende, além do que a B2 já move | veredito |
  |---|---|---|
  | `paginate` | só `isCurrentGen` + DOM | **move** |
  | `paginateTable` | `tableHTML`, `docHead`, `commitViewResult` | **move** (todos saem na B2/Sessão 4) |
  | `linhasTable` | `empNome`, `bannerTrunc`, `tableHTML`, `emptyBox` | tecnicamente móvel, **fica** (ver abaixo) |
  | `paginateLines` | fixa `afterPaint: bindLineRows` | **fica** |
  | `lineResults` | `situacaoSelectHTML`/`filtrarSituacao` + `paginateLines` (`:2841`, `:2843`) | **fica** |

  O bloqueio é um só, e tem nome: **`bindLineRows`**, que chama `selectLine`, `closeModal` e
  `toast` e lê `activeLine` — ou seja, compõe seleção de linha, fechamento de modal e rota. Isso
  não é paginação, é **ação do shell**, e o shell só sai na Fase E (opcional).

  **Aqui o plano PARA de decidir e passa a restringir.** Duas versões anteriores fecharam esta
  questão em prosa — a 1ª mandou injetar `afterPaint` e mover tudo; a 2ª mandou o oposto, manter a
  família inteira no `app.js` — e **as duas estavam erradas**, cada uma por ignorar um fato que só
  aparece quando se olha o call site. A decisão certa depende de código que ainda não existe
  (`src/ui/`), então o que fica escrito aqui é a **restrição que a sessão executora tem de
  satisfazer**, com os números medidos, não a escolha.

  Os fatos, todos conferidos no `app.js` de hoje:

  - `bindLineRows` (`app.js:2865`) chama `selectLine`, `closeModal`, `toast` e lê `activeLine`:
    é composição de **seleção + fechamento de modal + rota**, não paginação;
  - `paginateLines` fixa `afterPaint: bindLineRows` (`:2798`);
  - `lineResults` chama `paginateLines` nos dois ramos (`:2841`, `:2843`), e
    `renderLocalidadeSecoes` o chama direto (`:2946`);
  - `lineResults` tem **9 call sites**, e — este é o fato que derrubou a 2ª versão — eles **não
    ficam no `app.js`**: pertencem a famílias que C3 e C4 prometem mover.

  | call site | dono | família |
  |---|---|---|
  | `:1935` | `openEmpresaLigacoes` | Empresas (C3) |
  | `:1954` | `LOADERS.ligacoesPorEmpresa` | Empresas (C3) |
  | `:2035` | `LOADERS.ligacoesPorLogradouro` | Itinerários/Logradouro |
  | `:2086` | `LOADERS.municipioRegiao` | Municípios (C4) |
  | `:2137` `:2141` `:2179` | `openLinhasPorIbge` | Municípios (C4) |
  | `:2267` `:2311` | `LOADERS.ligacoesPorTerminal` | Quadro/Terminais (C3) |

  **A restrição, então:** um render de C3/C4 que virou ESM **não alcança** `lineResults`,
  `paginateLines` nem `bindLineRows` se eles continuarem privados no IIFE. Logo, **antes de C3**,
  a B2 tem de fazer uma das duas — e registrar qual:

  1. **expor o seam de seleção** (mover a família de listas para `src/ui/` com a ação de seleção
     injetada como callback), pagando o encadeamento por `lineResults`; ou
  2. **manter a família no `app.js`** e, nesse caso, **reduzir o escopo declarado de C3/C4** para os
     renders que não listam linha — recalculando a projeção, que hoje conta com eles.

  O que **não** é opção é o que as duas versões anteriores fizeram: escolher uma e não mexer na
  outra ponta. Escolher (1) sem cobrir os 9 call sites deixa listas **renderizadas e não
  clicáveis**, sem erro no console. Escolher (2) sem recalcular a projeção deixa o plano prometendo
  uma queda de linhas que ele não entrega.
- `activeLine` **não** vira import: chega pelo campo `line` do `ctx` da Fase A (ver o contrato lá,
  que foi corrigido para incluí-lo), porque é estado mutável de sessão — exatamente o que o estudo
  proíbe exportar do IIFE.

## Fase C — documentos por família (4 sessões)

1.280 linhas em 10 famílias, do mais isolado para o mais acoplado:

| # | famílias | linhas |
|---|---|---|
| C1 | Frota (37) · Histórico da linha (24) · Itinerários (51) | 112 |
| C2 | Estrutura (87) · Tarifas (109) · Portaria (77) | 273 |
| C3 | Quadro de Horários (185) · Empresas (172) | 357 |
| C4 | Municípios (310) · Localidades (228) | 538 |

C4 por último: são os únicos com filtro de escopo, dois ramos de PDF e o bloco secundário cujo PDF
cobre os dois blocos — logo não pode ser sobrescrito pelo paginador.

**Cada fase C move os `render*` DA SUA família, no mesmo PR.** Não junte isso numa fase final: uma
sessão que fizesse todas migraria tudo **de uma vez** — precisamente o que o estudo proíbe — e
concentraria num commit só toda a superfície de regressão de ordem/TDZ. Adiar não é fatiar.

**O registro `LOADERS` guarda LOADERS, nunca renders.** Três versões deste plano tropeçaram aqui.
A 1ª mandava `Object.assign(LOADERS, …)` numa fase final; a 2ª mandava o mesmo por família,
"compondo renders, não loaders"; a 3ª concluiu que o registro era intocável e **cancelou a Fase D**.
As três erraram, e vale separar o que é permanente do que era contrato de momento:

- **Permanente:** o valor do registro é chamado como função de carga, não como render. Um `render*`
  precisa de `host` e da linha; pôr um render no registro é `TypeError` na abertura do card.
- **Contrato de momento:** hoje `runView` faz `await view.loader();`, **sem argumentos** — e foi
  disso que a 3ª versão concluiu, erradamente, que módulo nenhum poderia alimentar o registro. Só
  que **a Fase A revoga esse contrato**: ela passa o `ctx` ao loader (ver o entregável explícito
  lá). Depois da A, um loader que recebe `ctx` pode morar em qualquer arquivo — inclusive num
  módulo de família.

Ou seja: a Fase D volta a ser possível *porque a Fase A a torna possível*, e o estudo original
continua exigindo-a (`docs/historico/estudo-modularizacao-frontend-2026-08-10.md`, "Próximas
fatias", item 4: *"transformar o registro `LOADERS` em composição explícita. Não migrar todos os
loaders de uma vez."*).

O que **não** muda com a Fase A é a forma dos loaders de hoje. **Medido: 3 dos 17.**

| forma | quantos | exemplos |
|---|---|---|
| one-liner sobre `lineDocView` | **3** | `itinerarios` (`app.js:1504`), `frota` (`:1835`), `estrutura` (`:1873`) |
| `async () => { … }` com a implementação **dentro** | **14** | `empresasRegulares` (`:1876`), `portarias` (`:2418`), `localidades` (`:2636`) |

Para os 14, **não existe `render*` autônomo para exportar**: extrair um é parte do trabalho da fase
C daquela família, não uma precondição já satisfeita. Quem planejar C2–C4 contando com um render
pronto vai encontrar um loader de 300 linhas.

Então a regra da Fase C:

- a família exporta **`render*` de documento**, que recebem `ctx` e dados;
- para os 14 loaders monolíticos, **extrair o `render*` é o primeiro passo da própria fase** — não
  é precondição que alguma fase anterior entregue;
- **se** a B2 tiver exposto o seam de seleção (opção 1 lá), a família também exporta o **loader**
  `(ctx) => …`, e o `app.js` o compõe no registro — é o começo da composição explícita que o estudo
  pede, feita família a família, como ele exige;
- **se** a B2 tiver mantido a família de listas no `app.js` (opção 2), C3 e C4 movem só os renders
  que não listam linha, e a projeção é recalculada. Esta é a bifurcação que a B2 resolve; a C
  **herda** a escolha, não a refaz.

Isso não esvazia a fase — esvazia a retórica de que ela sozinha zeraria o registro. A massa das
1.280 linhas está nos `render*`.

## Fase D — composição explícita do registro (o que sobrar dela)

A fase entrega o item 4 do estudo: `LOADERS` como **composição explícita**. Ela **não** foi
cancelada — uma versão anterior deste plano a cancelou citando o `await view.loader()` sem
argumentos, sem notar que a **própria Fase A revoga esse contrato** ao passar o `ctx`. O erro era
raciocinar sobre o mundo pós-A com a assinatura pré-A.

O tamanho dela é **consequência**, não escolha: cada fase C que puder compor o loader da sua
família já terá composto (é o que o estudo quer — "não migrar todos de uma vez"), e a D fica com o
resto. Se a B2 escolher a opção 2, sobra mais para cá; se escolher a 1, a D pode ser quase vazia.
**Se ela estiver grande, alguma fase C não terminou o próprio trabalho** — o tamanho é sinal, e é
para ser lido como sinal.

Os wrappers (`lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel`) **não** são trabalho da
D: são shell, e saem na E.

## Fase E — infra do modal (opcional)

Chrome do modal (95) + faixa de abas (346) = 441 linhas para `src/ui/`, **mais o shell de busca de
linha** que a Fase C não leva (`lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel`) — e,
**se a B2 tiver escolhido a opção 2**, também a família de listas (`linhasTable`, `paginateLines`,
`lineResults`, `bindLineRows`). É a área mais exercitada pelo `check_abas.mjs` e o ganho é menor que o das
anteriores. **Só fazer se A–C correrem sem sustos** — continua sendo a primeira candidata a ser
cortada.

Cortá-la agora tem preço conhecido, e é barato: o `app.js` fica com o shell de busca e as linhas
de `LOADERS` que o chamam. Nenhuma fase anterior fica pela metade por causa disso — a C entrega os
`render*` de qualquer jeito. É corte de escopo, não dívida escondida.

---

## Projeção honesta

**A projeção BIFURCA na escolha da B2**, e apresentá-la como número único foi outro caso de prosa
confiante: as versões anteriores desta tabela mostravam uma coluna só, como se a estrutura já
estivesse decidida.

| etapa | B2 opção 1 (seam exposto) | B2 opção 2 (listas ficam) |
|---|---|---|
| após a Sessão 2 | 3.352 | 3.352 |
| após as Sessões 3–4 | ~3.200 | ~3.200 |
| após a Fase B | ~3.030 | ~3.030 |
| após a Fase B2 | ~2.700 | ~2.770 |
| após a Fase C | ~1.700 | **~2.000** |
| após D | ~1.650 | ~1.950 |
| após E | **~1.250** | **~1.250** |

A diferença mora em C: na opção 2, C3 e C4 não movem os renders que listam linha — e são
justamente os maiores (Municípios 310, Localidades 228, Empresas 172). As duas convergem na E,
porque é lá que a família de listas sai de um jeito ou de outro.

São estimativas, e estão marcadas com `~` de propósito. A única linha medida é a primeira.

Não vai a zero, e não deve: o que sobra é wiring de verdade — bootstrap, referências de DOM,
listeners, rotas, composição. Um arquivo de 1.250 linhas de ligação não é o defeito que a crítica
apontou. E se a Fase E for cortada, o piso é ~1.650 ou ~1.950 conforme o ramo — o que continua não
sendo o monólito da crítica.

## Critério de parada

Este plano tem fim declarado, de propósito — refatoração sem critério de parada é a mesma doença da
crítica nº 1 por outra porta.

Uma fase só se justifica se **reduzir acoplamento**, não linhas. Sinais de parar e registrar em vez
de empurrar:

- o módulo novo precisar receber mais de ~6 dependências **injetadas** — estado passado em
  parâmetro. `import` de módulo declarado **não conta**: `renderFrota` importar `docHead` de
  `src/ui/doc.mjs` é dependência resolvida, não acoplamento a estado. A distinção é o que separa
  esta contagem de virar burocracia: o que faz mal é a função depender de coisa que **muda por
  baixo**, não de coisa que ela declara;
- o `app.js` passar a **exportar estado do IIFE** para alimentar o módulo;
- a fase exigir mudar query, chave ou schema (nenhuma delas exige — se exigir, o plano está errado).

## Riscos, todos já conhecidos por acidente deste repo

1. **`.vercelignore`** — uma linha por módulo novo, **sempre**. Import ES é atômico: um 404 mata o
   `app.js` inteiro e a tela fica vazia sem erro no console (10/08/2026). O `check.js` §[1] reprova
   nomeando o arquivo que ficou de fora.
   **Havia um segundo inventário, e ele era manual:** o `scripts/check_deploy.mjs` mantinha a
   própria lista de arquivos públicos, com um comentário mandando incluir todo módulo novo. A
   Sessão 2 atualizou o `.vercelignore` e não a lista — e o smoke passou **verde** sem nunca pedir
   o `agrupamento.mjs`, o mesmo ponto cego de 10/08, quatro dias depois. Corrigido na Sessão 2: o
   smoke agora **deriva** os módulos dos `import` do `app.js`. Consequência para este plano: as
   fases seguintes não precisam lembrar dele — mas se alguém reintroduzir lista manual em qualquer
   gate, é para tratar como defeito, não como estilo.
2. **Hoisting/TDZ e ordem do `LOADERS`** — regras em [`../estrutura-frontend.md`](../estrutura-frontend.md).
3. **Fixtures do `check_views.mjs`** (`scripts/lib/rig.mjs`) — nome de coluna divergente chega
   `undefined` no render e a tela sai vazia **sem erro**: falso verde.
4. **`version.json` + `#verTag`** a cada fase, porque todas mexem em arquivo servido.

## Por que o site não corre risco enquanto nada entra na `main`

Registrado aqui porque o dono perguntou explicitamente. São três camadas independentes, conferidas
contra o repo:

1. **Produção sai apenas da `main`.** Push em branch gera *preview deploy*, em domínio próprio; o
   domínio canônico segue servindo o último build da `main`. Os únicos caminhos para produção são o
   merge (auto-deploy) e a promoção manual pelo painel da Vercel.
2. **Preview não alcança o banco de produção.** `HOSTS_PROD` é allowlist; host fora dela cai no
   banco de **teste**. Branch nova nasce apontando para teste, por desenho fail-closed.
3. **Zero SQL neste plano.** Nenhuma migração, query, chave ou policy. Só JavaScript mudando de
   arquivo.

A ressalva que mantém isso honesto: não mergear protege o **site**, não o **repositório** — e é a
proteção certa, porque commit ruim em branch é reversível e invisível para o usuário. O que essa
regra **não** cobriria seria mudança de banco, que é compartilhado e lido ao vivo; não é o caso
aqui. O único risco real mora no **merge**, não na branch: a falha do `.vercelignore` é invisível
no CI e só aparece na tela. Daí a conferência do preview ser condição de merge, não formalidade.

## Protocolo, inalterado

Uma fase = um PR = `@codex review`, gates verdes antes de abrir, **sem merge por conta própria**, e
conferência do preview pelo dono — o agente não alcança o domínio da Vercel (HTTP 000 medido).

## Verificação, por fase

```bash
node tests/check.js                    # sintaxe, allowlist, @canon, deriva docs×código, testes
node scripts/check_views.mjs           # as views num navegador headless
node scripts/check_abas.mjs            # abas + seletor de documentos   (obrigatório em A, D, E)
node scripts/check_selecao_linha.mjs   # seleção dentro do modal        (obrigatório em A, C)
./scripts/semgrep.sh                   # análise estática
```

As Fases A e C ganham, além disso, uma **prova por mutação**: trocar o corpo de um render movido e
confirmar que algum gate fica vermelho. Verde que não morde não é evidência — foi assim que
`matchEvent` passou meses coberto por uma guarda que só olhava a assinatura.
