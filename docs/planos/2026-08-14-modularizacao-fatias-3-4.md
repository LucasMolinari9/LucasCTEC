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
3. **Reconfira as citações DEPOIS da última edição do código, não antes.** A regra 1 diz "a linha é
   aberta antes de a frase ser escrita", e isso não basta: a Fase B2 abriu as 42 linhas, escreveu as
   frases, e **depois** acrescentou 3 linhas ao índice do `app.js` e 1 a um comentário. As 42
   citações foram para a `main` deslocadas em 3–4 linhas — todas apontando para código real, todas
   erradas, e nenhum gate viu (a §[2b] confere fatos NUMÉRICOS por regex, não citações). Custo de
   evitar: rodar o script de conferência uma vez a mais, no fim. Custo de não evitar: uma sessão
   inteira só para re-ancorar, que é o que já aconteceu na Sessão 3 (115 citações) e de novo aqui.

Se você for editar este plano e sentir vontade de acrescentar uma tabela de projeção ou um veredito
por função, é exatamente isso que foi removido daqui, e por quê.

## Por que

Uma crítica externa disse que o `app.js` é "um monólito de 3.500 linhas". Procede. As Sessões 1 e 2
do plano de 6 ([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md))
responderam à crítica **irmã** — a de que o processo virou projeto paralelo. O monólito mal foi
arranhado.

Medido no `app.js` de **3.053 linhas** (remedido em 21/08/2026, sobre a `main` com a Fase B2 mais
a Fase A). Cada faixa vai da **marca da seção** até a linha anterior à marca seguinte — a
convenção que o extrator do `tests/check.js` §[2b] usa, e que as faixas anteriores desta tabela
erravam por duas linhas:

| bloco | linhas | % |
|---|---|---|
| `MODAL / SISTEMA DE VIEWS` (`app.js:724`–`:2567`) | 1.844 | 60,4% |
| `COMPONENTES AUXILIARES` (`:2568`–`:2731`) | 164 | 5,4% |
| `SUPABASE CONFIG` (`:88`–`:255`) | 168 | 5,5% |

O `MODAL` subiu de 58,3% para 60,3% na Fase B2 tendo PERDIDO 98 linhas — a B2 tirou 263 do arquivo
inteiro, e o denominador encolheu mais que o numerador. A Fase A fez o contrário: **acrescentou**
52 linhas ao arquivo e 33 ao `MODAL`, e o percentual mal se mexeu (60,3% → 60,4%). As duas coisas
dizem a mesma coisa: percentual de seção não é medida de progresso da modularização, e a Fase A não
é medida em linhas — ela é a precondição da Fase C, que é onde o bloco sai.

Dois terços do arquivo, e é onde nenhuma das sessões já planejadas toca. O estudo de 10/08
([`../historico/estudo-modularizacao-frontend-2026-08-10.md`](../historico/estudo-modularizacao-frontend-2026-08-10.md))
chama isso de fatias 3 e 4, e as **condiciona** no item 3 de "Próximas fatias recomendadas"
(`docs/historico/estudo-modularizacao-frontend-2026-08-10.md:29`): separar documentos "somente após
injetar explicitamente estado e render target; não exportar dezenas de variáveis do IIFE".

O diagnóstico que justificava a ordem abaixo, e que a **Fase A resolveu**: um documento típico lia
`currentView` e `activeLine` — estado mutável de módulo. A abertura
`const view = currentView, gen = beginGen(view);` aparecia **22 vezes** no arquivo (o `grep -c`
dava 23, uma delas dentro do comentário de contrato). Enquanto fosse verdade, mover o arquivo
trocaria um monólito por módulos rasos acoplados por variável global — piorar com aparência de
melhorar. Hoje `grep -c 'const view = currentView' app.js` = **0**: cada documento recebe o
contexto por parâmetro, e o `lineSearchRun` (`app.js:1244`) é o exemplo que mostra por quê — a
linha certa só existe depois do await dele.

**O padrão de injeção já existe e está em produção.** O seam do `pdfHTML` fez cinco helpers
receberem `view` e `gen` por parâmetro: `paginate` (`src/ui/paginacao.mjs:24`), `paginateTable`
(`:62`), `paginateLines` (`src/ui/listas.mjs:75`) e `lineResults` (`:94`) os declaram na própria
assinatura; `paginateEvents` (`src/ui/paginacao.mjs:95`) os recebe dentro de `opts` e os lê em
`:96` — nele a assinatura sozinha não prova nada, a evidência é a linha seguinte. (Os cinco
moraram para `src/ui/` na Fase B2; a disciplina é a mesma, o endereço mudou.) As fases abaixo
estendem essa disciplina — não é desenho novo.

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
| 3 | **B2** | helpers compartilhados + o seam de seleção | ✅ feita — ver a seção da fase |
| 4 | **A** | contexto explícito + bancada de corrida | ✅ feita — ver a seção da fase |
| 5 | **B** | `src/data/rest.mjs` — encerra o mecanismo `@canon` | a fazer |
| 6–9 | **C1…C4** | documentos por família | a fazer |
| 10 | **D** | `LOADERS` como composição explícita | a fazer |
| 11 | **E** | infra do modal (opcional) | a fazer |

**B2 saiu na frente de A e de B, e a razão é medida, não conveniência.** A ordem original supunha
que B2 dependesse das duas — "As Fases A e B não bastam para mover um documento". Supunha errado
em um ponto: *bastar* não é *preceder*. Os helpers que a B2 moveu não leem `currentView` nem
`activeLine`; o que faltava a eles era um endereço importável, não um contexto explícito. As duas
dependências reais foram resolvidas sem invadir as outras fases:
`src/data/lookups.mjs` precisa de `sbFetch` e o recebe **injetado**
(`configurarLookups({ sbFetch })`, `app.js:77`) em vez de importar o `src/data/rest.mjs` que a
Fase B ainda vai criar — quando ela criar, troca-se a injeção por um `import` sem tocar em nenhum
call site; e `bannerTrunc`, que a Fase B listava, saiu aqui porque é markup, não infraestrutura
(ver a nota na Fase B). O custo de ter invertido: nenhum. O ganho: A e C passam a ter os helpers
já importáveis.

**Sessão 4 antes da Fase A:** ela extraiu `beginGen`/`isCurrentGen`/`commitViewResult` como módulo
puro sobre um objeto `view`. É o seam que a Fase A injeta — fazer A antes seria injetar um contrato
que ainda morava dentro do IIFE. Com ela feita, a Fase A começa com o contrato já publicado em
`src/domain/view-state.mjs`: o que falta é os documentos **receberem** `view`/`gen` em vez de
abrirem com `const view = currentView`.

As Sessões 5 (custo do processo) e 6 (retomada do PR #98) não conflitam e entram em qualquer ponto.

---

## ✅ Fase A — contexto explícito (FEITA)

Nenhum arquivo mudou de lugar. Mudou o **contrato**: cada `render*`/loader passou a **receber**
`ctx = { view, gen, pane, host, line }` em vez de abrir com `const view = currentView, …`. As **22**
aberturas desse tipo acabaram — hoje `grep -c 'const view = currentView' app.js` = 0, e a única
menção que restava, a do comentário de contrato, foi reescrita. `beginGen` deixou de ser importado
pelo `app.js` (a razão em `app.js:21`–`:23`, o `import` que sobrou em `:24`–`:29`): quem o chama
agora é o `makeCtx`/`nextGen` do próprio módulo, e importá-lo aqui seria binding morto — e um
convite a recriar a abertura que a fase eliminou.

O contrato vive no bloco "o CONTEXTO explícito de um documento": `makeCtx`
(`src/domain/view-state.mjs:64`), `withLine` (`:72`), `withHost` (`:75`) e `nextGen` (`:79`).
Runbook para quem for mexer: `docs/estrutura-frontend.md` §5.

### As três coisas que a fase precisava acertar, e o que foi feito

**1. As DUAS invocações de loader.** `await view.loader(ctx)` em `app.js:1200` (`runView`) e
`await view.loader(novoCtx(view, tab.paneEl))` em `app.js:2897` (`reloadTab`, "views diretas"). As
duas passam `ctx`. Mudar só a primeira faria o card abrir certo e o recarregamento por Realtime
receber `undefined` — falha que só aparece com o portal aberto e o banco mudando.

**2. `line` derivável depois do `await`.** `withLine` preserva `view` e `gen`, e é usado nos dois
pontos em que a linha certa só existe depois da busca: o resultado único (`app.js:1254`) e o clique
na lista de N (`app.js:1257`). Derivar com geração nova ali destruiria a proteção que a fase existe
para dar. **De brinde, fechou um buraco real:** antes, o caminho de 1 resultado chamava
`render(host, lines[0])` e o render cunhava uma geração NOVA — uma busca velha que resolvesse tarde
voltava a vencer a mais recente. Hoje ela herda a geração da própria tentativa e é descartada.

**3. `activeLine`/`currentView` continuam com mais de um escritor, e eles ficaram.** `setActiveLine`
(`app.js:506`), `activateTab` (`app.js:935` e `:936`) e as limpezas do `closeModal`/`applyRoute`
seguem escrevendo. O que acabou foi um **documento** os LER. A leitura que sobrou é toda de shell,
e passa por um ponto só: `novoCtx(view, pane, host)` (`app.js:1169`), com três call sites —
`runView` (`:1199`), `reloadTab` (`:2897`) e o `run` de painel (`searchPanel` em `app.js:2695`,
Portarias em `:2302`, Localidades em `:2545`). Ler `activeLine` ali, a cada tentativa, é o que **preserva** o comportamento de hoje: um
painel re-executado pelo Realtime tem de enxergar a linha que o usuário escolheu DENTRO do
documento, não a que estava ativa quando o painel foi montado.

### As exceções, e uma mudança que não estava no roteiro

- **O guard de Portarias foi preservado**, como o plano exigia: `await getPortariaAnos()` em
  `app.js:2286`, `if (!isCurrentGen(view, gen)) return;` em `app.js:2287`, `_panelRun = run` em
  `app.js:2331`. `_panelRun` segue fora do seam — mas a CASCA do painel escreve depois de um await,
  e sem esse guard uma tentativa velha religa o runner depois de uma troca de aba.
- **Os 5 call sites com `pdf:false` seguem passando `view`/`gen`**: `app.js:1525`, `:1990`, `:1994`,
  `:2259` e `:2659`.
- **`searchPanel` passou a escrever em `ctx.pane`, não no `modalBody` ao vivo** (`app.js:2688`). Não
  é zelo: dois loaders montam o painel DEPOIS de um await — `ligacoesPorLogradouro` espera o
  `getIbge` (`app.js:1870`) e `ligacoesPorTerminal` espera três lookups (`app.js:2107`). Trocar de
  aba nesse intervalo fazia o painel inteiro ser pintado na aba errada. É o ATO 2 da bancada, e é o
  único ponto em que o código anterior de fato sangrava (medido: com o `modalBody` de volta, o ato
  2 fica vermelho em duas checagens).
- **Um adaptador morreu:** `renderActiveLineQuadro = host => renderLinhaQuadro(host, activeLine)`
  existia só porque o contrato antigo separava o container da linha e obrigava a buscar a segunda no
  global. Com o ctx a chamada é `renderLinhaQuadro(ctx)`, direta — o comentário que registra a
  remoção está em `app.js:1460`.

### A bancada de corrida — `scripts/check_corrida_abas.mjs`

O entregável obrigatório. Os gates de hoje não cobriam esta fase porque **nenhum deles CRIA a
ordenação** que define o bug, e o stub do PostgREST respondia na hora. A bancada acrescentou ao
`scripts/lib/rig.mjs` um `segurar(tabela, qs)` opcional (`scripts/lib/rig.mjs:297`, aplicado em
`:303`) que prende a resposta até o teste liberar — o comportamento padrão, sem ele, é o de sempre.

Dois atos, porque são dois pontos de escrita diferentes: **ATO 1**, um render de documento
(Itinerários); **ATO 2**, a casca de um loader (Ligações por Logradouro). Cada um abre o documento
na aba 1, troca para a aba 2 antes de a resposta voltar, abre Portarias lá, e só então libera.
As asserções:

- **(a)** o pane da aba 2 não foi pintado pelo trabalho atrasado da aba 1;
- **(b)** o `pdfHTML` da aba 2 não foi sobrescrito (lido pelo caminho real: um stub de
  `window.print` captura o `.pdf-export` que o `baixarPdf` monta);
- **(c)** o pane **da aba 1** e o `pdfHTML` **dela** receberam a resposta atrasada.

A (c) é o que impede a bancada de aprovar uma implementação que simplesmente descartasse toda
resposta pós-troca-de-aba. Ela roda no CI, no mesmo `views.yml` dos outros três gates de navegador.

**Uma armadilha da própria bancada, encontrada ao escrevê-la:** a 1ª versão do ATO 1 afirmava que o
PDF da aba 2 não continha `/Itiner/i`. Falhou — o texto de uma das portarias da fixture fala em
"alteracao do itinerario da linha 549M". O marcador virou o TÍTULO do documento
(`Cadastro de Linhas: Itiner…`, `scripts/check_corrida_abas.mjs:39`). Falso vermelho é tão inútil
quanto falso verde.

### O que ficou provado, e como

- `node tests/check.js` verde; `check_views.mjs` 18/18; `check_abas.mjs`, `check_selecao_linha.mjs`
  e `check_corrida_abas.mjs` verdes; `./scripts/semgrep.sh` 0 achados em 121 regras.
- **Prova por mutação, em três frentes** (a fase exige uma):
  1. `searchPanel` de volta ao `modalBody` ao vivo → **ATO 2 vermelho** em (a) e (c). É a
     reprodução do bug real, não uma mutação artificial;
  2. `renderItinerarios` relendo `currentView` na hora de escrever (o erro clássico que o ctx
     impede) → **ATO 1 (b) vermelho**: o `pdfHTML` da aba 2 é sobrescrito;
  3. corpo de `renderFrota` trocado por uma caixa vazia → `check_views.mjs frota` vermelho
     ("0 `.kpi`, esperado >= 12").
- Custo em linhas: `app.js` 3.001 → 3.053 (+52), `view-state.mjs` 120 → 149 (+29), mais 185 linhas
  de bancada nova. A fase **não encolhe o `app.js`** — nunca prometeu. Ela é a precondição da C.

### O que a Fase C herda

O registro `LOADERS` guarda funções que recebem `ctx` e não fecham sobre nada do IIFE além dos
helpers já importáveis. Um loader exportado por módulo pode entrar no registro sem adaptador — que
é o que torna a Fase D possível, e o que faltava para um documento inteiro sair do arquivo.

---

## Fase B — módulo profundo de acesso REST

`src/data/rest.mjs`, com o que cada símbolo é hoje: `esperar` (`app.js:145`), `SB_TIMEOUT_MS`
(`:147`), `SB_RETRIES` (`:148`), `CANCELADO` (`:152`), `ehCancelamento` (`:153`), `fetchComTimeout`
(`:160`), `sbFetch` (`:178`), `SB_MAX_ROWS` (`:222`), `marcarTrunc` (`:230`) e
`selecionarSupabase` (`:124`).
Só entra se a interface **esconder** timeout, retry e truncagem — condição literal do estudo.
Config (URL, chave, `fetch`) injetada, não lida de global.
**O consumidor já está pronto:** `src/data/lookups.mjs` recebe `sbFetch` por injeção
(`configurarLookups`, `app.js:77`), então esta fase troca a injeção por um `import` lá dentro sem
tocar em nenhum call site.

**Dois símbolos saíram desta lista na Fase B2, e não por conveniência.** `bannerTrunc` era listado
aqui porque ficava no mesmo bloco do `app.js`; ele não é infraestrutura — não conhece rede, timeout
nem `limit`, só lê os campos `_trunc`/`_limite` que o `marcarTrunc` marca e devolve HTML. Foi para
`src/ui/doc.mjs:71`, e o contrato entre marcar e pintar está escrito nos dois lados
(`app.js:242`–`:244` e `src/ui/doc.mjs:65`–`:70`). `preencherLookup` também não era REST — o
próprio plano dizia isso — e foi para o `src/data/lookups.mjs:106` a que pertencia; a razão de
adiá-lo (fechar o marco abaixo junto) deixou de existir quando a B2 veio antes.

**Também no mesmo PR:** os dois runbooks que mandam editar `SB_MAX_ROWS` no `app.js` — o
`CLAUDE.md` ("suba, na mesma tarefa, a constante `SB_MAX_ROWS` do `app.js`" e "São TRÊS lugares a
mudar juntos", ambos na seção Supabase, `grep -n SB_MAX_ROWS CLAUDE.md`), mais
`docs/backup_schema.sql:783`–`:784` ("na constante SB_MAX_ROWS do app.js"). Mover a constante sem
mover a instrução deixa os dois apontando para onde ela não está, e a guarda docs×código **não**
cobre esse caminho: ela começa em `tests/check.js:411` e confere fatos NUMÉRICOS por regex (tabela
`FATOS`, `tests/check.js:512`) — nenhum gate do repo sequer menciona `SB_MAX_ROWS` (grep vazio em
`tests/check.js` e `scripts/*.mjs`). A falha só apareceria quando
alguém subisse o teto do PostgREST e a truncagem ficasse no valor velho, em silêncio.

**O marco:** [`../../tests/harness.js`](../../tests/harness.js) tem hoje **10** marcas `@canon`
(`grep -c '^/\* @canon' tests/harness.js` — o `grep -c '@canon'` citado antes dá 12 e conta as
duas menções em PROSA, no cabeçalho do arquivo; conte os marcadores, não a palavra). Eram 12 até a
B2 tirar as duas que não eram do bloco `SUPABASE CONFIG`, e as 10 que restam são **todas** dele —
ou seja, o marco agora depende só desta fase. Quando a última sair,
[`../../tests/canon.js`](../../tests/canon.js) (56 linhas) e
[`../../tests/drift.test.js`](../../tests/drift.test.js) (72) se aposentam junto com a §[2] do
`check.js` — processo apagado por ter **perdido o objeto**, não por corte de rigor.

---

## ✅ Fase B2 — helpers compartilhados e o seam de seleção (FEITA)

**O problema que ela tinha de resolver.** Ao virar módulo nativo, um documento perde acesso aos
helpers privados do IIFE — que abre em `app.js:67` e fecha em `app.js:3053`, sem uma única
instrução `export` no arquivo (`grep -c '^export ' app.js` = 0). Quatro módulos novos, todos
reabertos linha a linha no `.vercelignore`:

| módulo | o que leva |
|---|---|
| `src/ui/doc.mjs` (75 linhas) | `docHead` (`:26`), `metaRows` (`:35`), `colClass` (`:45`), `tableHTML` (`:47`), `loading` (`:52`), `emptyBox` (`:53`), `emptyLinha` (`:62`), `errorBox` (`:63`), `bannerTrunc` (`:71`) |
| `src/data/lookups.mjs` (137 linhas) | `getIbge` (`:39`), `getOrigem` (`:49`), `getTerminais` (`:59`), `getEmpresas` (`:67`), `empNome` (`:81`), `preencherLookup` (`:106`), `getEvLookups` (`:116`), `INVALIDADORES_LOOKUP` (`:128`) |
| `src/ui/paginacao.mjs` (143 linhas) | `paginate` (`:24`), `paginateTable` (`:62`), `paginateEvents` (`:95`) |
| `src/ui/listas.mjs` (122 linhas) | `situacaoSelectHTML` (`:36`), `linhasTable` (`:40`), `bindLineRows` (`:62`), `paginateLines` (`:75`), `lineResults` (`:94`) |

Três símbolos entraram além da lista original, e cada um por um motivo:
`errorBox` (irmão de `loading`/`emptyBox`/`emptyLinha`, e o primeiro que um render de C vai
querer ao tratar erro), `getTerminais` (cache idêntico aos outros quatro — deixá-lo faria o
módulo ser arbitrário) e `debounce`, que foi para `src/domain/core.mjs:35` porque o
`paginateEvents` o usa e o `app.js` também: cópia local nos dois recriaria a divergência
silenciosa. Com o `debounce` fora, a seção `UTILITÁRIOS` ficou vazia e **foi apagada** — o
`app.js` tem 14 seções, não 15.

`activeLine` **não** virou import, como o plano exigia: quem precisava dele continuou lendo do
`app.js` — e a **Fase A trocou essa leitura por `ctx.line`**, que é o que o plano de fato queria.

### A decisão: opção 1 — seam de seleção exposto

O plano deixava a bifurcação em aberto e dizia que escolher um lado sem ajustar a outra ponta é o
erro já cometido duas vezes. **Escolhida a opção 1** (mover a família de listas com a ação de
seleção injetada), e a outra ponta está ajustada abaixo, nas Fases D e E.

O que decidiu: o custo que o plano atribuía à opção 1 — "encadear o callback por `lineResults` até
os call sites; esquecer um deixa as linhas daquela tela **renderizadas e não clicáveis**, sem erro
no console" — **não é intrínseco à opção, é intrínseco a encadear por parâmetro**. "Selecionar
linha e fechar o modal" é UMA ação do portal inteiro, não uma variação por tela: existe uma só
implementação, e ela é composição de shell (`selectLine` + `closeModal` + `toast`). Injetada UMA
vez no bootstrap — `configurarListas({ aoSelecionarLinha })`, `app.js:83` — o encadeamento some, e
com ele o modo de falha. Nenhum dos call sites de `lineResults` mudou.

E o esquecimento deixou de ser silencioso: sem configuração, `bindLineRows`
(`src/ui/listas.mjs:62`) **lança na LIGAÇÃO**, não no clique (`src/ui/listas.mjs:63`–`:65`).
Falhar no clique é o que seria invisível — nenhum gate clica em tudo. Falhar ao ligar derruba a
tela inteira, e foi medido: removendo o `configurarListas` do bootstrap,
`node scripts/check_selecao_linha.mjs` fica vermelho em 4 checagens (entre elas "resultado tem
linha clicável"). O mesmo padrão vale para os outros dois injetados — sem `configurarDoc`,
`node scripts/check_views.mjs frota` fica vermelho com a mensagem do próprio módulo.

**A contagem de call sites de `lineResults` estava errada aqui: eram 9, hoje são 8.** O PR #132
(seções de tarifa nos modos por Município) trocou a chamada de `mostrarLinhasResultado` por
`renderLocalidadeSecoes`. Os 8 de hoje: `app.js:1787`, `:1805`, `:1884`, `:1939`, `:1990`,
`:1994`, `:2133` e `:2177`. **Nenhum deles precisou mudar**, que é o ponto da decisão acima —
mas eles seguem pertencendo a documentos que C3 e C4 vão mover, e agora podem ir.

### O que ficou provado, e como

- `node tests/check.js` verde, incluindo a §[2] — que precisou ser generalizada: ela varria só
  `src/domain/` para reconhecer o `require` de um harness, e passou a varrer `src/` inteiro. Sem
  isso, o `require('../src/ui/doc.mjs')` do `tests/harness.js` seria lido como cópia sem marcador,
  reprovando quem fez a coisa certa.
- `node scripts/check_views.mjs` 18/18, `check_abas.mjs` e `check_selecao_linha.mjs` verdes.
- **Prova por mutação, em três frentes** (a fase não exigia; verde que não morde não é evidência):
  bootstrap do `configurarDoc` removido → `check_views` vermelho; `configurarListas` removido →
  `check_selecao_linha` vermelho em 4 checagens; corpo de `linhasTable` trocado por uma caixa
  vazia → `check_views ligacoesPorEmpresa` vermelho **e** `tests/ui-data-module.test.mjs` 20/21.
- Testes novos: `tests/ui-data-module.test.mjs` (21 casos) exercita em Node puro tudo que é markup
  ou cache — inclusive os três "falha fechado". O que escreve no DOM não entra ali (o repo é
  zero-dependência, não há jsdom) e fica com os gates de navegador.

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
de escopo — `#regScope` (`app.js:1914`) e `#munScope` (`app.js:1963`), os dois únicos do arquivo —
e com dois ramos de PDF na mesma tela (`app.js:1990` e `:1994`, ambos `pdf:false`). Localidades tem
o bloco secundário cujo `pdfHTML` cobre os DOIS blocos: por isso o `paginateLines` dele vai com
`pdf:false` (`app.js:2659`) e o `commitViewResult` único vem depois, em `:2661`.

**A B2 removeu a restrição que ameaçava encolher C3 e C4.** `lineResults`, `paginateLines`,
`linhasTable` e `bindLineRows` são importáveis (`src/ui/listas.mjs`), e o clique numa linha chega
por seam, não por fechamento sobre o IIFE. As duas famílias saem **inteiras**; nenhum render fica
adiado por isso.

**Cada fase C move a SUA família, no mesmo PR.** Não junte numa fase final: migrar tudo de uma vez
é o que o estudo proíbe, e concentra num commit só a superfície de regressão de ordem/TDZ.

**O que cada família consegue exportar varia, e é a primeira coisa a medir na sessão.** Alguns
loaders já delegam a um `render*`, e aqui a linha da **declaração** não é a linha da **delegação** —
citar a primeira no lugar da segunda não prova a delegação:

| loader | declarado em | delega em |
|---|---|---|
| `LOADERS.historicoLinha` | `app.js:1300` | `app.js:1303` — passa `renderLineHistory` como `render:` do `lineSearchRun` |
| `LOADERS.quadroHorarios` | `app.js:1529` | `app.js:1535` (despacha `quadroLinhaRun`/`quadroEmpresaRun`) e `:1540` (chama `renderLinhaQuadro` direto) |
| `LOADERS.tarifas` | `app.js:1635` | `app.js:1641` (despacha `tarifaEmpresaRun`/`lineDocRun`) e `:1647` (chama `renderTarifas` direto) |

Nos one-liners `itinerarios` (`app.js:1356`), `frota` (`:1688`) e `estrutura` (`:1726`) as duas
coincidem: a delegação via `lineDocView` é a própria linha da declaração. Outros têm a
implementação dentro do próprio loader. **Não há partição limpa** — uma versão anterior deste plano
afirmou "3 assim, 14 assado" e estava errada. Abra o loader da família antes de planejar a sessão.

O registro `LOADERS` guarda **loaders**, nunca renders: o valor é invocado como função de carga em
`app.js:1200` e `:2897`, e desde a Fase A as duas invocações passam `ctx`. Um loader exportado por
módulo pode entrar no registro sem adaptador — é o que torna a Fase D possível.

---

## Fase D — `LOADERS` como composição explícita

Entrega o item 4 do estudo (`docs/historico/estudo-modularizacao-frontend-2026-08-10.md:30`):
*"Por último, transformar o registro `LOADERS` em composição explícita. Não migrar todos os loaders
de uma vez."*

O tamanho é **consequência**: cada fase C que puder compor o loader da sua família já compõe, e a D
fica com o resto.

**O critério de saída ficou fixado pela decisão da B2 (opção 1):** se a D estiver grande,
**alguma fase C não terminou o próprio trabalho** — o tamanho é sinal de falha, não de escopo.
Não há mais o segundo ramo, o da opção 2, em que C3/C4 terminariam com escopo reduzido e a D
herdaria legitimamente os loaders que dependem da família de listas: a família saiu, os oito call
sites de `lineResults` seguem intactos, e nenhuma fase C tem desculpa para adiar um documento
seu.

Os wrappers (`lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel`) não são trabalho da D:
são shell, e saem na E.

---

## Fase E — infra do modal (opcional)

Chrome do modal e faixa de abas para `src/ui/`, mais o shell de busca de linha (`lineDocView`,
`app.js:1218`; `lineDocRun`, `:1261`; `lineSearchRun`, `:1244`; `searchPanel`, `:2683`). A
família de listas **não** está mais nesta lista: saiu na B2.

É a área que o `check_abas.mjs` exercita diretamente — ele clica `#modalTabAdd` em
`scripts/check_abas.mjs:34` e `:60`, e lê `.modal-tab` em `:39`, `:53` e `:66` —, e o ganho é menor
que o das anteriores.

**Com a opção 1 decidida na B2, ela é de fato opcional** — e a qualificação que faltava agora
tem resposta. Cortá-la deixa no `app.js` o shell do modal e o de busca de linha: escolha de escopo
declarada, não dívida escondida. O ramo em que a E virava **obrigatória** — o da opção 2, em que
ela seria a única fase capaz de mover `ligacoesPorEmpresa`, `ligacoesPorLogradouro`,
`municipioRegiao`, `ligacoesPorTerminal` e os demais que listam linha — **não existe mais**: esses
documentos são trabalho de C3/C4, e a B2 já lhes deu o que faltava.

Quem cortar a E escreve aqui o que ficou.

---

## Critério de parada

Refatoração sem critério de parada é a mesma doença da crítica que originou este plano.

Uma fase só se justifica se **reduzir acoplamento**, não linhas. Sinais de parar e registrar:

- o módulo novo precisar receber mais de ~6 dependências **injetadas** — estado passado em
  parâmetro. `import` de módulo declarado **não conta**: importar `docHead` de `src/ui/doc.mjs` é
  dependência resolvida, não acoplamento a estado. O que faz mal é depender de coisa que **muda por
  baixo**, não de coisa que a função declara;
- o `app.js` passar a **exportar estado do IIFE** para alimentar o módulo;
- a fase exigir mudar query, chave ou schema (nenhuma exige — se exigir, o plano está errado).

Não há meta de linhas, de propósito. O que sobra no fim é wiring — bootstrap, referências de DOM,
listeners, rotas, composição — e wiring não é o defeito que a crítica apontou.

---

## Riscos, todos conhecidos por acidente deste repo

1. **`.vercelignore`** — uma linha por módulo novo, **sempre**. Import ES é atômico: um 404 mata o
   `app.js` inteiro e a tela fica vazia sem erro no console (10/08/2026). O `check.js` §[1] reprova
   nomeando o arquivo que ficou de fora — o `fail` de `tests/check.js:159`–`:160` imprime a lista e
   o motivo de cada um. **Cada subdiretório novo de `src/` custa três linhas, não uma**: a B2 abriu
   `src/ui/` e `src/data/`, e cada um precisou de `!/src/<dir>`, `/src/<dir>/*` e depois um
   `!/src/<dir>/<arquivo>` por módulo — reabrir só o arquivo não funciona, o git não desce em
   diretório excluído. O smoke deriva os módulos dos `import` (`scripts/check_deploy.mjs:202`–`:231`)
   desde a Sessão 2 — o commit é `0841a48`, mergeado no #125 — então se alguém reintroduzir lista
   manual em qualquer gate, trate como defeito, não como estilo.
2. **Hoisting/TDZ e ordem do `LOADERS`** — regras em [`../estrutura-frontend.md`](../estrutura-frontend.md).
3. **Fixtures do `check_views.mjs`** (`scripts/lib/rig.mjs:121`, o `export const FIXTURES`) — nome
   de coluna divergente chega `undefined` no render e a tela sai vazia **sem erro**: falso verde.
4. **`version.json` + `#verTag`** a cada fase que mexa em arquivo servido.

## Por que o site não corre risco enquanto nada entra na `main`

1. **Produção sai apenas da `main`.** Push em branch gera *preview deploy*, em domínio próprio. Os
   únicos caminhos para produção são o merge (auto-deploy) e a promoção manual pelo painel.
2. **Preview não alcança o banco de produção.** `HOSTS_PROD` (`app.js:118`) é allowlist, e o
   `selecionarSupabase` (`app.js:124`) decide por pertencimento: `hostsProd.includes(host)` em
   `app.js:127` e o ternário de `:128`–`:130` mandam todo host fora da lista para o banco de teste.
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
node scripts/check_corrida_abas.mjs    # o ctx dos documentos sob troca de aba (nasceu na A)
./scripts/semgrep.sh                   # análise estática
```

O `check_corrida_abas.mjs` é o único que **cria** a ordenação do bug em vez de esperar a
requisição assentar. Toda fase que mexa em `runView`, `reloadTab`, `searchPanel` ou na assinatura
de um `render*`/loader precisa dele — ou seja, C, D e E.

As Fases A e C ganham, além disso, uma **prova por mutação**: trocar o corpo de um render movido e
confirmar que algum gate fica vermelho. Verde que não morde não é evidência — foi assim que
`matchEvent` passou meses coberto por uma guarda que só olhava a assinatura. O episódio está
registrado onde a guarda foi consertada: `tests/canon.js:13`–`:15` e `tests/check.js:264`–`:268`
(corpo trocado por `return false`, gate saindo "tudo verde"), e em `docs/CHANGELOG.md:261`.
A B2 fez a prova sem ser obrigada, e o registro está na seção dela — três mutações, três gates
vermelhos. Recomendado para toda fase: custa uma edição e um comando.
