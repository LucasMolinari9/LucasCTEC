# Plano — desmontar o monólito do `app.js` (fatias 3 e 4 do estudo)

Escrito em 14/08/2026, podado em 15/08/2026. Diferente dos arquivos de `docs/historico/`, este é um
plano **vivo**: atualize-o conforme as fases entrarem, e apague-o quando a última fechar.

## Como este plano é escrito (leia antes de editá-lo)

Este documento **declara restrições e mede o presente. Não prevê o futuro.**

Não é preferência de estilo. A 1ª versão previa: dizia quais funções seriam movíveis, quanto cada
fase encolheria o `app.js`, o que sobraria em cada registro. Foram **seis rodadas de revisão e 26
achados** — quatro de planejamento no #126 e 22 neste PR (21 P1 e um P2), contados nas threads —, e
nenhum deles sobre o código: todos sobre afirmações do plano a respeito do código. (Este número já
saiu errado uma vez, como "25 / 21": foi estimado em vez de contado, no mesmo commit que criou a
regra da citação.) O motivo é estrutural: a única forma
de saber se `X` é movível é tentar mover `X`, e nenhum gate deste repo distingue uma frase
verdadeira de uma falsa sobre o `app.js` (`check.js`, `semgrep`, `views` e `smoke` ficaram verdes
nas seis rodadas).

Duas regras, portanto:

1. **Toda afirmação sobre comportamento de código cita `arquivo:linha`** — e a linha é aberta antes
   de a frase ser escrita. Citação é falsificável; prosa afirmativa não é. Citar a seção em vez da
   linha não conta (já aconteceu, e passou).
2. **Onde a resposta depende de código que ainda não existe, escreva a restrição e quem decide —
   não a decisão.** Quem executar a fase terá o código na frente e medirá melhor do que este texto.

Se você for editar este plano e sentir vontade de acrescentar uma tabela de projeção ou um veredito
por função, é exatamente isso que foi removido daqui, e por quê.

> **A regra 1 falhou em silêncio por cinco dias, e o conserto está no gate.** Re-ancorado em
> 20/08/2026: **todas** as citações `app.js:NNN` deste documento estavam **exatamente 2 linhas
> baixas** — 28 símbolos conferidos um a um, sem uma única exceção, e nenhum commit da história
> tem `selecionarSupabase` em 75 ou `lineSearchRun` em 1265. Os números vieram de uma árvore de
> trabalho intermediária da Sessão 4 e nunca foram reconferidos contra o commit entregue. As
> citações de OUTROS arquivos estavam certas, o que localiza o erro: foram transcritas de um buffer
> velho de uma vez só. Depois disso o PR #132 somou +13 a partir de `app.js:2014` e mexeu nos dois
> lados. Nada pegou: nem as seis rodadas de revisão, nem `check.js`, `semgrep`, `views` ou `smoke`
> — porque **nenhum deles conferia âncora de código**. Quem abrisse `app.js:1154` procurando
> `const view = currentView` encontrava um comentário, e a única defesa que este plano declara ter
> não defendia nada. Desde este PR, o `tests/check.js` §[2b] confere as citações no formato
> `` `SÍMBOLO` (`arquivo:NNN`) ``: se a linha citada não contém o símbolo, o gate reprova nomeando
> a linha do markdown. **Ao mover código, o gate cobra a citação — atualize o número, não apague a
> citação.**

## Por que

Uma crítica externa disse que o `app.js` é "um monólito de 3.500 linhas". Procede. As Sessões 1 e 2
do plano de 6 ([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md))
responderam à crítica **irmã** — a de que o processo virou projeto paralelo. O monólito mal foi
arranhado.

Medido no `app.js` de **3.264 linhas** (remedido em 20/08/2026, depois do PR #132). Cada faixa vai
da **marca da seção** até a linha anterior à marca seguinte — a convenção que o extrator do
`tests/check.js` §[2b] usa, e que as faixas anteriores desta tabela erravam por duas linhas:

| bloco | linhas | % |
|---|---|---|
| `MODAL / SISTEMA DE VIEWS` (`app.js:633`–`:2549`) | 1.909 | 58,5% |
| `COMPONENTES AUXILIARES` (`:2550`–`:2834`) | 285 | 8,7% |
| `SUPABASE CONFIG` (`:51`–`:109`) | 171 | 5,2% |

O `MODAL` **sobe** de 57,9% para 58,3% e daí para 58,5% — as duas vezes sem que ninguém tocasse
nele por modularização. Na primeira, a Sessão 4 tirou 82 linhas do arquivo inteiro e o denominador
encolheu mais que o numerador; na segunda, o PR #132 (seções de tarifa) somou 13 linhas **dentro**
do bloco. Percentual de seção não é medida de progresso da modularização — a de progresso é o
total, que subiu de 3.252 para 3.264.

Dois terços do arquivo, e é onde nenhuma das sessões já planejadas toca. O estudo de 10/08
([`../historico/estudo-modularizacao-frontend-2026-08-10.md`](../historico/estudo-modularizacao-frontend-2026-08-10.md))
chama isso de fatias 3 e 4, e as **condiciona** no item 3 de "Próximas fatias recomendadas"
(`docs/historico/estudo-modularizacao-frontend-2026-08-10.md:29`): separar documentos "somente após
injetar explicitamente estado e render target; não exportar dezenas de variáveis do IIFE".

O diagnóstico que justifica a ordem abaixo: um documento típico lê `currentView` e `activeLine` —
estado mutável de módulo. O `lineSearchRun` (`app.js:1155`) é o caso típico: abre com
`const view = currentView, gen = beginGen(view);` em `app.js:1156` e lê `activeLine` em `:1159`. A
mesma abertura se repete em `:1265`, `:1306` e `:1404`. **Não são quatro: são 28**
(`grep -c '^\s*const view = currentView' app.js`, medido em 20/08/2026), e é essa a superfície da
Fase A — as quatro acima são exemplos, não o inventário. Enquanto isso for verdade, mover o arquivo
troca um monólito por módulos rasos acoplados por variável global. Seria piorar com aparência de
melhorar.

**O padrão de injeção já existe e está em produção.** O seam do `pdfHTML` fez cinco helpers
receberem `view` e `gen` por parâmetro: `paginate` (`app.js:2573`), `paginateTable` (`:2610`),
`paginateLines` (`:2621`) e `lineResults` (`:2646`) os declaram na própria assinatura;
`paginateEvents` (`:1213`) os recebe dentro de `opts` e os lê em `:1214` — nele a assinatura
sozinha não prova nada, a evidência é a linha seguinte. As fases abaixo estendem essa disciplina —
não é desenho novo.

---

## ✅ PRECONDIÇÃO SATISFEITA — travessia transitiva (PR #122, mergeado)

**Era o único item deste documento que, ignorado, quebrava o portal em produção sem nenhum gate
acusar.** O #122 entrou na `main` em `e834e58` (15/08/2026), antes da Sessão 3 — B, B2 e C estão
liberadas. O texto abaixo fica como registro do que ele consertou e de como se prova que
continua consertado; a mutação da última linha da tabela é a que reproduz o buraco.

Nem o `tests/check.js` §[1] nem o `scripts/check_deploy.mjs` seguiam import de módulo para módulo.
Com `app.js → familia.mjs → dep.mjs` e `dep.mjs` fora da allowlist, os dois ficavam **verdes** e o
portal morria — import ES é atômico, um 404 mata o grafo inteiro. Não é dedução: foi reproduzido em
14/08/2026, e o registro está no cabeçalho do próprio gate, `scripts/check_deploy.mjs:186`–`:193`.

Onde cada um está **hoje**, na `main`:

- o smoke **atravessa**: a fila de `scripts/check_deploy.mjs:212`–`:228` reenfileira cada módulo que
  descobre (`fila.push(alvo)` em `:225`), partindo de `app.js` (`:211`), então alcança o grafo
  inteiro. O próprio gate registra o estado em `scripts/check_deploy.mjs:190`–`:193`;
- o `check.js` **também atravessa**, desde o #122 — era ele que não tinha fila.

**Por que travava B/B2/C e não as Sessões 3–4.** A distinção não é "importa outro módulo", é **ser
alcançável só por outro módulo**. O `app.js` importa `core.mjs`, `agrupamento.mjs`, `busca.mjs` e
`view-state.mjs` direto, e três deles importam `./core.mjs` — a aresta módulo→módulo já existia,
mas é **redundante**: quem ela alcança, o `app.js` também alcança. A B2 nasce para ser importada
pelas famílias da C, e é ali que a redundância acaba — daí a precondição valer para elas.

---

## Ordem — uma fase por sessão, um PR por sessão

| ordem | fase | entrega | estado |
|---|---|---|---|
| **0** | **merge do #122** | travessia transitiva no `check.js` — travava B/B2/C | ✅ `e834e58` |
| 1 | Sessão 3 | `src/domain/busca.mjs` | ✅ PR #130, mergeado em `3aab30f` |
| 2 | Sessão 4 | `src/domain/view-state.mjs` | ✅ PR #131 |
| 3a | **A** — bancada de corrida | `scripts/check_corrida_view.mjs` + trava de rede no rig | ✅ 20/08 |
| 3b | **A** — guard de tela | os 8 renders sem `isCurrentGen` na escrita do DOM | ✅ 20/08 |
| 3c | **A** — contexto explícito | `ctx` nas 28 aberturas `const view = currentView` | **a fazer** |
| 4 | **B** | `src/data/rest.mjs` + `lookups.mjs` — aposentou o `@canon` | ✅ 20/08, −112 no `app.js`, −378 de processo |
| 5 | **B2** | helpers compartilhados + o seam de seleção | **PRÓXIMA** |
| 6–9 | **C1…C4** | documentos por família | a fazer |
| 10 | **D** | `LOADERS` como composição explícita | a fazer |
| 11 | **E** | infra do modal (opcional) | a fazer |

**A Fase A foi partida em três, e a ordem não foi capricho.** A bancada (3a) veio primeiro e
sozinha porque a rede tem de existir antes do salto: sem ela, mover 28 aberturas seria mover no
escuro. A bancada então ACHOU um defeito real — tela e PDF discordando com respostas fora de
ordem — e o 3b o consertou nos 8 renders. Sobra o 3c, a injeção de `ctx` propriamente dita, que
agora reescreve um padrão uniforme em vez de oito exceções. **A B e a B2 não dependem do 3c**: a B
já entrou sem ele.

**Sessão 4 antes da Fase A:** ela extraiu `beginGen`/`isCurrentGen`/`commitViewResult` como módulo
puro sobre um objeto `view`. É o seam que a Fase A injeta — fazer A antes seria injetar um contrato
que ainda morava dentro do IIFE. Com ela feita, a Fase A começa com o contrato já publicado em
`src/domain/view-state.mjs`: o que falta é os documentos **receberem** `view`/`gen` em vez de
abrirem com `const view = currentView`.

As Sessões 5 (custo do processo) e 6 (retomada do PR #98) não conflitam e entram em qualquer ponto.

---

## Fase A — contexto explícito (precondição de tudo)

Nenhum arquivo muda de lugar. Muda o **contrato**: cada `render*`/loader passa a **receber**
`ctx = { view, gen, pane, host, line }` em vez de abrir com `const view = currentView, …` — a
abertura de hoje, medida em `app.js:1156`, `:1265`, `:1306` e `:1404`.

Três coisas que a fase precisa acertar, todas conferidas no código:

**1. Há DUAS invocações de loader, não uma.** `await view.loader();` aparece em **`app.js:1096`**
(dentro de `runView`) e em **`app.js:3004`** (`reloadTab`, comentada como "views diretas"). Mudar só
a primeira faz o card funcionar ao abrir e o mesmo loader receber `undefined` no recarregamento por
Realtime — falha que só aparece com o portal aberto e o banco mudando. Ou as duas passam `ctx`, ou a
invocação é centralizada num ponto só.

**2. `line` precisa ser derivável depois do `await`.** Não basta capturar `activeLine` junto com
`view`/`gen`: no `lineSearchRun` a linha certa **só existe depois** da busca —
`if (lines.length === 1){ selectLine(lines[0]); return render(host, lines[0]); }` (`app.js:1165`) e
o clique da lista (`app.js:1168`). Um render que lesse só o `ctx.line` inicial receberia `null` ou
**a linha anterior**, pintando o documento da linha errada sem erro nenhum. Logo o contrato precisa
de `withLine(ctx, linha)` → `{ ...ctx, line: linha }`, **preservando `view` e `gen`**: derivar com
`gen` novo destruiria a proteção que esta fase existe para dar.

**3. `activeLine` tem mais de um escritor legítimo, e eles ficam.** A escrita não passa só por
`selectLine`: `setActiveLine` atribui em `app.js:359`, `activateTab` faz `activeLine = t.line` em
`app.js:837`, e há limpezas em `app.js:607` e `app.js:3138`. A regra desta fase vale para
**documentos**: um documento deixa de ler o global e passa a usar `ctx.line`. O wiring de troca e
limpeza de abas continua escrevendo — mexer nele é fora de escopo e quebraria a seleção.

**`currentView` tem exatamente o mesmo formato de problema**, e a versão anterior desta seção
consertou o `activeLine` e deixou a frase gêmea errada ao lado: `setCurrentView` atribui em
`app.js:1000`, **mas `activateTab` também escreve**, `currentView = t.view`, em `app.js:838`. Vale
a mesma regra: o que acaba é **ler** essas variáveis de dentro de um documento; o wiring de abas
continua escrevendo as duas.

**Exceções documentadas — e a razão da primeira estava errada.**

- **`_panelRun` fica fora do seam**, mas *não* porque seja "sempre atribuído antes de qualquer
  `await`". Isso vale para dois dos três: `LOADERS.localidades` (declarado em `app.js:2475`,
  atribui em `:2540`) e `searchPanel` (declarado em `app.js:2789`, atribui em `:2831`) atribuem
  antes de qualquer `await` do próprio corpo. **Portarias não**: o loader
  faz `await getPortariaAnos()` em `app.js:2275` e só atribui `_panelRun` em `app.js:2317`. O que
  protege ali é o guard explícito — `if (!isCurrentGen(view, gen)) return;` em `app.js:2276`. Quem
  mexer neste seam **preserva esse guard**: sem ele, uma tentativa velha religa o runner depois de
  uma troca de aba.
- Os **5** call sites com `pdf:false` seguem passando `view`/`gen`: `app.js:1507`, `:1977`,
  `:1981`, `:2249` e `:2771`. (Eram descritos como 4 — número herdado e nunca medido.)

### ✅ Entregável obrigatório: a bancada de corrida — ENTREGUE ANTES DA FASE

`scripts/check_corrida_view.mjs`, mergeado como parte separada, **antes** de a Fase A tocar
qualquer render. A ordem é deliberada: a bancada é a rede que torna a fase verificável, e
construir a rede depois do salto é construir rede nenhuma. Ela já roda no CI (`views.yml`).

As nove asserções passam contra o código de hoje, e **mordem**: duas mutações foram medidas —
(1) voltar o `pdfHTML` a ser escrito em `currentView` (o código pré-seam) reprova (b), (b2) e
(c2); (2) fazer o render reler o pane ativo em vez do `host` capturado reprova (a), (a2) e (c).
Controle restaurado volta a verde.

**✅ Achado da bancada, FECHADO na parte 2.** A primeira sondagem da bancada encontrou um defeito
real: na corrida da MESMA aba (duas buscas, a 1ª voltando DEPOIS da 2ª), a tela e o PDF
**discordavam** — o pane ficava com a linha obsoleta e o `pdfHTML` com a vigente. O usuário
conferia na tela e baixava outro documento, sem aviso nenhum. A causa: o seam guardava a escrita
do PDF (`commitViewResult`) e **não** a escrita final no DOM. Eram **8** dos 28, todos com `await`
antes de escreverem `innerHTML` e sem guard próprio nem delegação a `paginate`/`lineResults`.
Todos ganharam o mesmo guard explícito que as Portarias já usavam — `isCurrentGen`
(`app.js:2284`) — logo depois do primeiro `await` e antes de qualquer escrita:

| render | declarado em | abertura do seam | guard novo |
|---|---|---|---|
| `renderItinerarios` | `app.js:1305` | `:1306` | `:1312` |
| `renderLinhaQuadro` | `app.js:1402` | `:1404` | `:1414` |
| `quadroEmpresaRun` | `app.js:1446` | `:1447` | `:1455` |
| `renderTarifas` | `app.js:1544` | `:1545` | `:1548` |
| `tarifaEmpresaRun` | `app.js:1568` | `:1569` | `:1577` |
| `renderFrota` | `app.js:1655` | `:1656` | `:1662` |
| `renderEstrutura` | `app.js:1676` | `:1677` | `:1689` |
| `LOADERS.historicoEmpresa` | `app.js:1835` | `:1839` | `:1844` |

Os outros 19 dos 28 já estavam cobertos (guard próprio ou via `paginate`/`paginateEvents`/
`lineResults`, que o aplicam por dentro). **Só era observável com respostas fora de ordem**, por
isso passou despercebido: o caminho comum entrega na ordem do pedido e a divergência não aparece.

**O que está provado e o que não está, dito sem arredondar.** A bancada exercita **2** dos 8
renders — `renderItinerarios` (`Promise.all`) e `renderTarifas` (um `sbFetch` só), escolhidos por
terem formatos diferentes —, e cada um foi provado por mutação separada: tirar só aquele guard
reprova `(d)` e `(d3)` daquele documento. Os outros **6** receberam a mesma linha na mesma posição,
conferida por leitura, e o `check_views.mjs` prova que nenhum deles quebrou o render normal. Quem
mexer neles depois herda essa dívida de cobertura — e a bancada aceita documento novo sem código
novo: é só mais uma chamada de `corridaMesmaAba`.

### O registro de por que ela precisou existir

Os gates de hoje **não cobrem** esta fase, e vale registrar por quê: nenhum dos três **cria a
ordenação** que define o bug.

- `check_views.mjs` abre cada view numa página limpa, em sequência — `page.goto('about:blank')` em
  `scripts/check_views.mjs:149`, dentro do laço que percorre as views em `:142`;
- `check_abas.mjs` dá `waitForTimeout` **depois** de cada ação — `scripts/check_abas.mjs:38`, `:49`
  e `:65`, que são as três ocorrências do arquivo —, ou seja, espera a requisição assentar antes de
  trocar de aba;
- `check_selecao_linha.mjs` espera o pane parar de girar antes de seguir: `waitForFunction` exigindo
  `#locHost` sem `.spin` em `scripts/check_selecao_linha.mjs:97`–`:100`.

E o stub do PostgREST responde na hora — `route.fulfill` síncrono, sem atraso nenhum, em
`scripts/lib/rig.mjs:294`–`:297`. Os três podem ficar verdes enquanto um render atrasado pinta o
pane ATIVO em vez do pane que capturou.

O seam `beginGen`/`commitViewResult` nasceu de raciocínio, não de teste — e esta fase mexe nele.
**No mesmo PR:** uma bancada que force a ordenação (stub com atraso controlável, abrir documento na
aba 1, trocar para a aba 2 antes da resposta voltar) e afirme:

- **(a)** o pane da aba 2 não foi pintado pelo render da aba 1;
- **(b)** o `pdfHTML` da aba 2 não foi sobrescrito;
- **(c)** o pane **da aba 1** e o `pdfHTML` **dela** recebem a resposta atrasada.

A fase não fecha sem ela, e não fecha com (a) e (b) apenas: sem a asserção positiva a bancada
aprova uma implementação que **descarta** toda resposta pós-troca-de-aba, deixando a aba 1
eternamente sem o resultado do pane que capturou.

---

## ✅ Fase B — módulo profundo de acesso REST — FEITA

`src/data/rest.mjs` e `src/data/lookups.mjs`. **É a primeira fase deste plano em que o total cai**:
o `app.js` foi de 3.272 para **3.160** linhas (−112), e a seção `SUPABASE CONFIG` de 171 para
**59** — o que sobrou lá são as constantes literais e o wiring.

**A interface esconde timeout, retry e truncagem** — a condição literal do estudo, e o critério que
decidia se a fase valia. `criarRest({ url, key, fetch })` (`src/data/rest.mjs:126`) devolve
`{ sbFetch }` e mais nada; quem chama escreve `sbFetch('tabela', 'query')` e não decide sobre
AbortController, backoff nem teto de linhas. **Config é injetada, não lida de global** — é isso que
tornou o módulo testável sem navegador e sem rede.

**O que ficou no `app.js`, de propósito:** `SB_URL`, `SB_KEY`, `SB_TESTE_URL`, `SB_TESTE_KEY` e
`HOSTS_PROD` continuam literais no topo (`SB_URL` em `app.js:60`). Não é resíduo: `check_deriva.mjs`,
`check_realtime.mjs`, `check_data_quality.mjs` e `check_grants.mjs` extraem as duas primeiras de lá
por regex, e movê-las cegaria os quatro de uma vez, em silêncio.

**Três imports que NÃO entraram** — `marcarTrunc`, `CANCELADO` e `SB_MAX_ROWS`: depois da extração
só o próprio `rest.mjs` os usa. Importá-los seria binding morto, o mesmo motivo que deixou `yearOf`
fora do import do `busca.mjs`.

### ✅ O marco: o mecanismo `@canon` se aposentou

Era o item de maior retorno da auditoria de custo da Sessão 5, e dependia inteiramente desta fase.
O `tests/harness.js` tinha **12** marcas `@canon` — cópias verbatim da seção `SUPABASE CONFIG` mais
o `preencherLookup`. Todas saíram; ele virou ponte de 46 linhas (era 153) que faz `require` dos
módulos reais. Com a última cópia foram embora:

| arquivo | linhas | destino |
|---|---:|---|
| `tests/canon.js` | 56 | apagado |
| `tests/drift.test.js` | 72 | apagado |
| §[2] do `tests/check.js` | 141 | apagada |
| `tests/harness.js` | 153 → 46 | **−107** |

**−376 linhas de processo**, contra as 128 que a Sessão 5 projetava (ela contava só `canon.js` +
`drift.test.js`, sem a §[2] nem o encolhimento do harness). Processo apagado por ter **perdido o
objeto**, não por corte de rigor: ele existia para compensar código não-modular, e o código virou
módulo. `sbFetch.test.js` e `environment.test.js` continuam com o mesmo placar, agora exercitando a
implementação que o navegador executa em vez de uma cópia dela.

### Os runbooks do `SB_MAX_ROWS`, movidos junto

A constante mudou de arquivo, então as três instruções que mandavam editá-la no `app.js` mudaram
com ela — `CLAUDE.md` (dois pontos) e `docs/backup_schema.sql`. Nenhum gate do repo menciona
`SB_MAX_ROWS`: a falha de esquecer isso só apareceria quando alguém subisse o teto do PostgREST e a
truncagem ficasse no valor velho, em silêncio. Por isso saiu no mesmo PR, não depois.

---

## Fase B2 — helpers compartilhados e o seam de seleção

As Fases A e B não bastam para mover um documento: ao virar módulo nativo ele perde acesso aos
helpers privados do IIFE — que abre em `app.js:50` e fecha em `app.js:3160`, sem uma única
instrução `export` no arquivo (`grep -c '^export ' app.js` = 0). Onde cada um é declarado hoje:
`getIbge` (`app.js:368`), `getOrigem` (`:377`), `getEmpresas` (`:393`), `empNome` (`:406`),
`getEvLookups` (`:425`), `loading` (`:1059`), `emptyBox` (`:1060`),
`emptyLinha` (`:1069`), `docHead` (`:1104`), `metaRows` (`:1109`), `colClass` (`:1118`),
`tableHTML` (`:1119`) e os paginadores (`:1213`, `:2573`, `:2610`, `:2621`). O `preencherLookup`
saiu desta lista na Fase B — mora em `src/data/lookups.mjs:18` e já é `import`. Esta fase existe para
resolver isso, e vem **antes** da C.

Alvos: `src/ui/doc.mjs` (`docHead`, `metaRows`, `tableHTML`, `colClass`, `loading`, `emptyBox`,
`emptyLinha` — markup, sem estado), `src/data/lookups.mjs` (`getEmpresas`/`empNome`/`getIbge`/
`getOrigem`/`getEvLookups` + `preencherLookup`, com o cache explicitado) e os paginadores.

`activeLine` **não** vira import: chega pelo campo `line` do `ctx` da Fase A.

### A restrição que esta fase TEM de resolver

Quem executar decide **como**; o que não é opcional é resolver. Os fatos, conferidos:

- `bindLineRows` (declarado em `app.js:2690`) chama `selectLine` e `closeModal` em `app.js:2694`, e
  `toast` lendo `activeLine` em `app.js:2695` — é composição de seleção, fechamento de modal e
  rota. Não é paginação: é **ação de shell**.
- `paginateLines` fixa `afterPaint: bindLineRows` (`app.js:2630`).
- `lineResults` chama `paginateLines` nos dois ramos (`app.js:2666`, `:2668`), e
  `renderLocalidadeSecoes` o chama direto (`app.js:2771`).
- `renderLocalidadeSecoes` (`app.js:2713`) tem **dois** chamadores desde o PR #132:
  `mostrarLinhasResultado` (declarado em `app.js:2012`, chama em `:2031`) e
  `mostrarLinhasPorLocalidade` (declarado em `app.js:2380`, chama em `:2458`). Ele deixou de ser da
  família Localidades sozinha e passou a ser compartilhado com Municípios — quem partir C3/C4
  decide onde ele mora **antes** de mover qualquer das duas.
- `lineResults` tem **8 call sites**, e eles **não permanecem no `app.js`**: pertencem a famílias
  que C3 e C4 movem — `:1774` (`openEmpresaLigacoes`), `:1793` (`LOADERS.ligacoesPorEmpresa`),
  `:1875` (`LOADERS.ligacoesPorLogradouro`), `:1926` (`LOADERS.municipioRegiao`), `:1977` `:1981`
  (`openLinhasPorIbge`), `:2120` `:2164` (`LOADERS.ligacoesPorTerminal`).
  **Eram 9 até o PR #132**, e o 9º não estava em `openLinhasPorIbge` como esta lista afirmava: era
  o de `mostrarLinhasResultado`, que aquele PR trocou por `renderLocalidadeSecoes`.

**Portanto:** um render de C3/C4 que virou ESM não alcança `lineResults`, `paginateLines` nem
`bindLineRows` se eles continuarem privados. Havia duas saídas; **o dono decidiu pela 1 em
20/08/2026**, ao escolher o alvo de conclusão (o `app.js` caindo pela metade). A opção 2 não
alcança esse alvo — sem os 285 do `COMPONENTES AUXILIARES` o piso é ~1.730 —, então ela deixou de
estar disponível. Fica registrada porque o raciocínio ainda importa se o alvo for revisto:

1. ✅ **expor o seam de seleção** — mover a família de listas com a ação de seleção injetada como
   callback. Custo: encadear o callback por `lineResults` até os **8** call sites. Esquecer um
   deixa as linhas daquela tela **renderizadas e não clicáveis**, sem erro no console. **É modo de
   falha silencioso, então a B2 não fecha sem bancada que clique numa linha de cada família e
   exija que a seleção aconteça** — o `check_selecao_linha.mjs` hoje cobre só o card de Localidade;
2. ❌ **manter a família no `app.js`** — exigiria **reduzir o escopo declarado de C3/C4** para os
   renders que não listam linha, e dizer em qual fase esses renders saem. Descartada pelo alvo.

Escolher um lado sem ajustar a outra ponta é o erro que este plano já cometeu duas vezes. A ponta
da opção 1: C3 e C4 **mantêm** o escopo declarado, e a Fase E segue **opcional**.

---

## Fase C — documentos por família (4 sessões)

Famílias, do mais isolado para o mais acoplado. **Os tamanhos vêm do estudo de 10/08 e não foram
reconferidos** — meça antes de dimensionar a sessão:

| # | famílias |
|---|---|
| C1 | Frota · Histórico da linha · Itinerários |
| C2 | Estrutura · Tarifas · Portaria |
| C3 | Quadro de Horários · Empresas |
| C4 | Municípios · Localidades |

C4 por último, e cada metade traz uma complicação própria. Municípios é a única família com filtro
de escopo — `#regScope` (`app.js:1904`) e `#munScope` (`app.js:1950`), os dois únicos do arquivo —
e com dois ramos de PDF na mesma tela (`app.js:1977` e `:1981`, ambos `pdf:false`). Localidades tem
o bloco secundário cujo `pdfHTML` cobre os DOIS blocos: por isso o `paginateLines` dele vai com
`pdf:false` (`app.js:2771`) e o `commitViewResult` único vem depois, em `:2773`.

**Cada fase C move a SUA família, no mesmo PR.** Não junte numa fase final: migrar tudo de uma vez
é o que o estudo proíbe, e concentra num commit só a superfície de regressão de ordem/TDZ.

**O que cada família consegue exportar varia, e é a primeira coisa a medir na sessão.** Alguns
loaders já delegam a um `render*`, e aqui a linha da **declaração** não é a linha da **delegação** —
citar a primeira no lugar da segunda não prova a delegação:

| loader | declarado em | delega em |
|---|---|---|
| `LOADERS.historicoLinha` | `app.js:1280` | `app.js:1283` — passa `renderLineHistory` como `render:` do `lineSearchRun` |
| `LOADERS.quadroHorarios` | `app.js:1511` | `app.js:1517` (despacha `quadroLinhaRun`/`quadroEmpresaRun`) e `:1522` (chama `renderLinhaQuadro` direto) |
| `LOADERS.tarifas` | `app.js:1619` | `app.js:1625` (despacha `tarifaEmpresaRun`/`lineDocRun`) e `:1631` (chama `renderTarifas` direto) |

Nos one-liners `itinerarios` (`app.js:1337`), `frota` (`:1673`) e `estrutura` (`:1712`) as duas
coincidem: a delegação via `lineDocView` é a própria linha da declaração. Outros têm a
implementação dentro do próprio loader. **Não há partição limpa** — uma versão anterior deste plano
afirmou "3 assim, 14 assado" e estava errada. Abra o loader da família antes de planejar a sessão.

O registro `LOADERS` guarda **loaders**, nunca renders: o valor é invocado como função de carga
(`app.js:1096`, `:3004`). Depois da Fase A ele recebe `ctx`, e aí um loader exportado por módulo
pode entrar no registro — é o que torna a Fase D possível.

---

## Fase D — `LOADERS` como composição explícita

Entrega o item 4 do estudo (`docs/historico/estudo-modularizacao-frontend-2026-08-10.md:30`):
*"Por último, transformar o registro `LOADERS` em composição explícita. Não migrar todos os loaders
de uma vez."*

O tamanho é **consequência**: cada fase C que puder compor o loader da sua família já compõe, e a D
fica com o resto.

**O critério de saída depende do ramo escolhido na B2, e tratá-lo como único estava errado:**

- **ramo da opção 1** (seam de seleção exposto) — se a D estiver grande, **alguma fase C não
  terminou o próprio trabalho**; o tamanho é sinal de falha;
- **ramo da opção 2** (família de listas fica no `app.js`) — C3 e C4 terminam legitimamente com
  escopo reduzido, e os loaders que dependem da família de listas ficam adiados. A D **pode** ser
  grande com todas as fases C tendo cumprido exatamente o que declararam. Aqui o critério é outro:
  a D fecha quando tiver composto tudo que **não** depende da família de listas, e o restante é
  declarado como herança da E — nominalmente, não por omissão.

Os wrappers (`lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel`) não são trabalho da D:
são shell, e saem na E.

---

## Fase E — infra do modal (opcional)

Chrome do modal e faixa de abas para `src/ui/`, mais o shell de busca de linha (`lineDocView`,
`lineDocRun`, `lineSearchRun`, `searchPanel`) e — se a B2 tiver escolhido a opção 2 — a família de
listas e os renders que a C tiver adiado.

É a área que o `check_abas.mjs` exercita diretamente — ele clica `#modalTabAdd` em
`scripts/check_abas.mjs:34` e `:60`, e lê `.modal-tab` em `:39`, `:53` e `:66` —, e o ganho é menor
que o das anteriores.

**Se ela é opcional depende do ramo da B2, e dizer "opcional" sem qualificar estava errado:**

- **ramo da opção 1** — a E é de fato **opcional**. Cortá-la deixa no `app.js` o shell do modal e o
  de busca de linha: escolha de escopo declarada, não dívida escondida;
- **ramo da opção 2** — a E deixa de ser cosmética e passa a ser **obrigatória para o plano
  fechar**, porque é a única fase que ainda moveria os documentos que C3/C4 adiaram
  (`ligacoesPorEmpresa`, `ligacoesPorLogradouro`, `municipioRegiao`, `ligacoesPorTerminal` e os
  demais que listam linha). Cortá-la nesse ramo é decisão legítima, mas então **o estado de parada
  precisa declarar esses documentos por nome** como permanentes no `app.js` — senão o plano termina
  afirmando ter movido o que não moveu.

Em qualquer um dos dois: quem cortar a E escreve aqui o que ficou.

---

Refatoração sem critério de parada é a mesma doença da crítica que originou este plano. Por isso
este plano tem os dois: um alvo de CONCLUSÃO (abaixo) e sinais de PARADA (mais abaixo).

- o módulo novo precisar receber mais de ~6 dependências **injetadas** — estado passado em
  parâmetro. `import` de módulo declarado **não conta**: importar `docHead` de `src/ui/doc.mjs` é
  dependência resolvida, não acoplamento a estado. O que faz mal é depender de coisa que **muda por
  baixo**, não de coisa que a função declara;
- o `app.js` passar a **exportar estado do IIFE** para alimentar o módulo;
- a fase exigir mudar query, chave ou schema (nenhuma exige — se exigir, o plano está errado).

## Critério de CONCLUSÃO — decisão do dono, 20/08/2026

Até esta data o plano dizia "não há meta de linhas, de propósito". **O dono pediu um alvo
verificável**, porque sem ele a pergunta "quando o monólito estará resolvido?" não tinha resposta
escrita em lugar nenhum — e uma refatoração sem linha de chegada é indistinguível de uma que não
termina. O alvo escolhido, entre as três opções medidas e apresentadas:

> **O `app.js` cai pela METADE: de 3.160 linhas (medidas em 20/08/2026, pós-Fase B) para
> ≤ 1.580.**

O caminho medido até lá, e é por isso que a escolha do dono decide a B2:

| fase | o que sai | medido |
|---|---|---:|
| **B2**, ramo da **opção 1** (seam de seleção exposto) | helpers de documento, helpers de evento e o bloco `COMPONENTES AUXILIARES` inteiro | até **445** |
| **C1–C4** | os 10 documentos, menos os 17 registros `LOADERS.*` que ficam | ~**1.265** |

**A opção 1 da B2 deixa de ser escolha e passa a ser requisito.** O ramo da opção 2 (família de
listas fica no `app.js`) não alcança a metade: sem os 285 do `COMPONENTES AUXILIARES`, o piso é
~1.730. Quem executar a B2 **expõe o seam de seleção como callback injetado** e encadeia por
`lineResults` até os **8** call sites. As duas pontas, como o plano exige:

- **ponta A** — o callback chega aos 8 call sites. Esquecer um deixa as linhas daquela tela
  **renderizadas e não clicáveis, sem erro no console**: é modo de falha silencioso, então a B2 não
  fecha sem um caso de bancada que clique numa linha de cada família e exija que a seleção aconteça;
- **ponta B** — C3 e C4 mantêm o escopo declarado (nada de reduzi-lo), e a **E continua opcional**:
  cortá-la deixa no `app.js` o shell do modal e o de busca de linha, que é escolha de escopo
  declarada, não dívida escondida.

### A regra anti-fraude, que vale mais que o número

Linha movida sem acoplamento reduzido **não conta**. Especificamente: dividir o `app.js` em pedaços
que continuam lendo `currentView`/`activeLine` por baixo bateria a meta e pioraria o projeto — é
exatamente o que o estudo de 10/08 proíbe, e o motivo de a Fase A existir. Por isso o critério é
**conjuntivo**: ≤ 1.580 linhas **E** os sinais de acoplamento abaixo, todos respeitados. Bater o
número violando qualquer um deles é falhar, não concluir.

Vale também o inverso, e é honesto dizer: **o total de código servido vai SUBIR**, não descer.
Medido na Fase B — `app.js` −112, módulos +195, líquido **+83** —, e dos 195 apenas 100 são código;
o resto é o cabeçalho que explica o contrato de cada módulo. Quem quiser "menos código no total"
não vai conseguir por aqui, e isso foi dito antes de a decisão ser tomada.

## Sinais de parar e registrar (valem em toda fase)

Uma fase só se justifica se **reduzir acoplamento**, não linhas:



---

## Riscos, todos conhecidos por acidente deste repo

1. **`.vercelignore`** — uma linha por módulo novo, **sempre**. Import ES é atômico: um 404 mata o
   `app.js` inteiro e a tela fica vazia sem erro no console (10/08/2026). O `check.js` §[1] reprova
   nomeando o arquivo que ficou de fora — o `fail` de `tests/check.js:158`–`:159` imprime a lista e
   o motivo de cada um. O smoke deriva os módulos dos `import` (`scripts/check_deploy.mjs:202`–`:231`)
   desde a Sessão 2 — o commit é `0841a48`, mergeado no #125 — então se alguém reintroduzir lista
   manual em qualquer gate, trate como defeito, não como estilo.
2. **Hoisting/TDZ e ordem do `LOADERS`** — regras em [`../estrutura-frontend.md`](../estrutura-frontend.md).
3. **Fixtures do `check_views.mjs`** — o `FIXTURES` (`scripts/lib/rig.mjs:121`) — nome
   de coluna divergente chega `undefined` no render e a tela sai vazia **sem erro**: falso verde.
4. **`version.json` + `#verTag`** a cada fase que mexa em arquivo servido.

## Por que o site não corre risco enquanto nada entra na `main`

1. **Produção sai apenas da `main`.** Push em branch gera *preview deploy*, em domínio próprio. Os
   únicos caminhos para produção são o merge (auto-deploy) e a promoção manual pelo painel.
2. **Preview não alcança o banco de produção.** `HOSTS_PROD` (`app.js:81`) é allowlist, e o
   `selecionarSupabase` (`src/data/rest.mjs:47`) decide por pertencimento:
   `hostsProd.includes(host)` em `src/data/rest.mjs:50` mandam todo host fora da lista para o
   banco de teste.
   Branch nova nasce apontando para teste, por desenho fail-closed.
3. **Zero SQL neste plano.** Nenhuma migração, query, chave ou policy.

A ressalva que mantém isso honesto: não mergear protege o **site**, não o **repositório**. O único
risco real mora no **merge** — a falha do `.vercelignore` é invisível no CI e só aparece na tela.
Daí a conferência do preview ser condição de merge, não formalidade.

## Protocolo

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
`matchEvent` passou meses coberto por uma guarda que só olhava a assinatura. O episódio está
registrado onde a guarda foi consertada: `tests/canon.js:14`–`:16` e `tests/check.js:268`–`:269`
(corpo trocado por `return false`, gate saindo "tudo verde"), e em `docs/CHANGELOG.md:179`.
