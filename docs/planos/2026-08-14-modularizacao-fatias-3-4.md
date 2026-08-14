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

| achado | onde foi tratado |
|---|---|
| Os paginadores não mudam de arquivo "sem mudar assinatura" | **Fase B2**, que passou a separar os quatro em vez de tratá-los como bloco |
| Os loaders de C1 dependem de wrappers privados (`lineDocView`, `searchPanel`/`lineSearchRun`) | **Fase C**, que passou a compor só os `render*` |
| A bancada de corrida da Fase A precisa da asserção POSITIVA | **Fase A**, asserção (c) |
| `activeLine` tem de estar no contrato da Fase A | **Fase A**, o `ctx` ganhou `line` |

## Ordem — uma fase por sessão, um PR por sessão

| ordem | fase | entrega | risco |
|---|---|---|---|
| **0** | **merge do #122** | travessia transitiva no `check.js` — **trava B/B2/C** | — (só merge) |
| 1 | Sessão 3 (já especificada) | `src/domain/busca.mjs` | baixo |
| 2 | Sessão 4 (já especificada) | `src/domain/view-state.mjs` | médio (seam + Realtime) |
| 3 | **A** | contexto explícito + **bancada de corrida** | médio |
| 4 | **B** | `src/data/rest.mjs` — **encerra o mecanismo `@canon`** | baixo |
| 5 | **B2** | `src/ui/doc.mjs` + acesso a lookups — o seam que torna a C possível | médio |
| 6–9 | **C1…C4** | documentos por família, **cada uma compondo seus `render*`** | cresce a cada uma |
| 10 | **D** | remoção do registro `LOADERS` residual | baixo |
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
- **`line` é o quinto campo por necessidade, não por conforto** — é o `activeLine` capturado no
  mesmo instante que `view`/`gen`. Sem ele a Fase C não teria fonte válida para a linha corrente
  (`lineDocView` e `lineSearchRun` leem `activeLine` direto do IIFE hoje, e o estudo proíbe
  exportá-lo), e a B2 acabaria reabrindo uma fase dada por encerrada. Vale a mesma disciplina do
  `view`: é **snapshot**, capturado antes do `await` e usado depois dele — quem reler o global no
  fim reintroduz a corrida por outra porta. Escrita continua só por `selectLine`.
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
  | `paginate` | só `isCurrentGen` + DOM | move limpo |
  | `paginateTable` | `tableHTML`, `docHead`, `commitViewResult` | move limpo (todos saem na B2/Sessão 4) |
  | `linhasTable` | `empNome`, `bannerTrunc`, `tableHTML`, `emptyBox` | move limpo (a `bannerTrunc` vem da Fase B) |
  | `paginateLines` | fixa `afterPaint: bindLineRows` | **bloqueado** |
  | `lineResults` | `situacaoSelectHTML`/`filtrarSituacao` + `paginateLines` | **bloqueado** pelo anterior |

  O bloqueio é um só, e tem nome: **`bindLineRows`**, que chama `selectLine`, `closeModal` e
  `toast` e lê `activeLine` — ou seja, compõe seleção de linha, fechamento de modal e rota. Isso
  não é paginação, é **ação do shell**, e o shell só sai na Fase E (opcional). Resolução adotada:
  `paginateLines` deixa de fixar `bindLineRows` e passa a **receber** `afterPaint` de quem chama,
  como `paginateTable` já faz com `bind`. `bindLineRows` **fica no `app.js`**. Custo: uma
  dependência injetada, e ela é callback, não estado — bem dentro do teto do critério de parada.
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

**Cada fase C compõe os loaders DA SUA família, no mesmo PR.** Não junte isso numa fase final: uma
sessão que compusesse o registro inteiro migraria todos os loaders **de uma vez** — precisamente o
que o estudo proíbe — e concentraria num commit só toda a superfície de regressão de ordem/TDZ.
Adiar não é fatiar. Na prática, ao fim de cada C o `app.js` faz `Object.assign(LOADERS, …)` com o
que aquela família exporta, e o registro encolhe família a família.

**O que cada família exporta é o `render*`, não o loader inteiro** — e isso corrige uma promessa
que a 1ª versão deste plano não podia cumprir. Os loaders de C1 não são autônomos: são
one-liners sobre wrappers privados do IIFE, que a B2 não move e que ninguém planejou mover.
Medido:

```js
LOADERS.itinerarios   = () => lineDocView({ subtitle:'…', render:renderItinerarios });  // app.js:1504
LOADERS.frota         = () => lineDocView({ subtitle:'Frota da Linha', render:renderFrota });   // 1835
LOADERS.historicoLinha = async () => { searchPanel({ …, onRun:(t,h)=>lineSearchRun(t, h, { render:renderLineHistory, … }) }); };  // 1448
```

`lineDocView` chama `searchPanel` e lê `activeLine`/`modalBody`; `lineSearchRun` lê `currentView`,
chama `selectLine`, `searchLines`, `getEmpresas` e `linhasTable`. Um módulo ESM não alcança nada
disso. Então a regra da Fase C é: **a família exporta os `render*`; a linha do `LOADERS` e o
wrapper que ela chama ficam no `app.js`.** O `Object.assign` compõe renders, não loaders.

Isso não esvazia a fase — esvazia a retórica. A massa das 1.280 linhas está nos `render*`; as
linhas do `LOADERS` são wiring de uma linha cada, e wiring é exatamente o que o critério de parada
declara como resíduo legítimo. O que muda é a expectativa sobre a Fase D, abaixo.

## Fase D — remover o registro residual

Quando a última família sair, o que resta do `LOADERS` no `app.js` é casca: a composição já terá
sido feita em C1…C4. Esta fase só apaga o resíduo e confere que a ordem de avaliação continua
segura. É pequena de propósito — se ela estiver grande, alguma fase C não terminou o próprio
trabalho.

**Com a correção da Fase C, "resíduo" tem tamanho previsto:** as linhas `LOADERS.x = () =>
lineDocView({…, render:renderX })` **permanecem**, porque o wrapper permanece. A Fase D apaga o que
sobrou de registro morto e para aí. Mover os wrappers (`lineDocView`, `lineDocRun`, `lineSearchRun`,
`searchPanel`) é trabalho da Fase E, junto com o resto do shell — e é o único ponto em que a E
deixa de ser cosmética: enquanto ela não acontecer, o `app.js` guarda o shell de busca de linha,
o que é uma escolha declarada, não um esquecimento.

## Fase E — infra do modal (opcional)

Chrome do modal (95) + faixa de abas (346) = 441 linhas para `src/ui/`, **mais o shell de busca de
linha** que a Fase C não pôde levar: `lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel` e
`bindLineRows`. É a área mais exercitada pelo `check_abas.mjs` e o ganho é menor que o das
anteriores. **Só fazer se A–D correrem sem sustos** — continua sendo a primeira candidata a ser
cortada.

Cortá-la agora tem preço conhecido, e é barato: o `app.js` fica com o shell de busca e as linhas
de `LOADERS` que o chamam. Nenhuma fase anterior fica pela metade por causa disso — a C entrega os
`render*` de qualquer jeito. É corte de escopo, não dívida escondida.

---

## Projeção honesta

| etapa | `app.js` |
|---|---|
| após a Sessão 2 | 3.352 |
| após as Sessões 3–4 | ~3.200 |
| após a Fase B | ~3.030 |
| após a Fase B2 | ~2.700 |
| após a Fase C | ~1.700 |
| após D+E | **~1.250** |

Não vai a zero, e não deve: o que sobra é wiring de verdade — bootstrap, referências de DOM,
listeners, rotas, composição. Um arquivo de 1.250 linhas de ligação não é o defeito que a crítica
apontou.

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
