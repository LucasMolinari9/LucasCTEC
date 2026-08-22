# CHANGELOG — Portal DIVAT

Cronologia dos endurecimentos e mudanças estruturais. O `CLAUDE.md` descreve só o **estado
atual + regras**; o histórico de *como se chegou nele* vive aqui (com links para os relatórios
de auditoria em `docs/`).

## 22/08/2026 — encerramento deliberado da modularização

- Após B, C1–C4 e D, foram inventariadas as responsabilidades de shell restantes no `app.js`:
  chrome do modal, abas, rotas, listeners, despacho, busca e painel.
- A etapa E foi deliberadamente não executada: a extração atravessaria 9 estados de abas e ao
  menos 7 ações do shell, exportaria estado do IIFE ou criaria dependências bidirecionais, sem
  retirar uma responsabilidade de negócio completa.
- As conclusões duráveis foram transferidas para `docs/estrutura-frontend.md` e o plano vivo foi
  removido conforme a política de saída documental.

## 22/08/2026 — Fase D: `LOADERS` vira composição explícita

O inventário pós-C4 encontrou 17 entradas. Dezesseis loaders documentais agora são exports das
famílias associados diretamente no `app.js`; `empresasRegulares` é a única infraestrutura do
modal mantida inline, porque abre outra view por `runView`. Wrappers que apenas repassavam `ctx`
foram removidos, enquanto `lineDocView`, `lineDocRun`, `lineSearchRun` e `searchPanel` continuam no
shell para a Fase E opcional.

A auditoria também encontrou dois corpos extensos indevidamente remanescentes: `secoesPorLigacao`
voltou à família C4 e `frotaPorEmpresa` à C3 antes de D prosseguir. As composições finas de C1–C3
recebem apenas seus helpers de shell em configuradores próprios fail-closed; o seam compartilhado
de C4 segue em seis slots e não nasceu container global ou service locator. O gate estrutural
novo exige associações diretas e preserva os quatro helpers de E.

O critério global manda parar: o restante é bootstrap, DOM, navegação, abas e abertura de views;
a Fase E não foi aberta porque não há redução mensurável de acoplamento. `app.js` caiu de 1.870
para 1.730 linhas e o bloco modal, de 821 para 685 linhas (~39,6%). `version.json` avançou para 12.

## 22/08/2026 — Fase C4: Municípios · Localidades saem do `app.js`

**Fase C4 em PR próprio**, sem a composição global da Fase D. A medição foi refeita sobre o
arquivo vigente: `app.js` 2.464 → **1.870** linhas (−594) e o bloco `MODAL / SISTEMA DE VIEWS`
1.341 → **821** (−520; 43,7% do arquivo novo).

- **Módulo novo:** `src/documentos/municipios-localidades.mjs` reúne os quatro loaders
  (`ligacoesPorLogradouro`, `municipioRegiao`, `ligacoesPorTerminal`, `localidades`), 13 funções
  privadas de busca/render e o cache de localidades com invalidator explícito. O arquivo foi
  reaberto individualmente na `.vercelignore`.
- **Contrato preservado:** toda entrada usa `ctx = { view, gen, pane, host, line }`; o módulo não
  exporta nem alcança `currentView`, `activeLine` ou `modalBody`. A fronteira chegou exatamente a
  seis slots mutáveis (`selecionarLinha`, `novoCtx`, `montarPainelBusca`, `abrirView`,
  `distinctCods`, `fetchLinesByCods`), limite guardado por teste. A próxima dependência larga deve
  ficar no `app.js`.
- **UI sem duplicação:** tabelas, paginação e clique de linha continuam em `src/ui/listas.mjs`.
  Nenhum markup exclusivo foi promovido a `src/ui/blocos.mjs`.
- **Estado/PDF:** `#regScope` e `#munScope` persistem durante recargas/repinturas; os dois ramos de
  tela municipal mantêm `pdf:false`; Localidades mantém `paginateLines(..., { pdf:false })` no
  bloco secundário e um único commit depois de montar os dois blocos.
- **Cobertura:** o gate de views ganhou casos para os dois seletores. A mutação que esvaziou
  `pintarLocalidadeSecoes` derrubou os dois cenários de Localidades por conteúdo abaixo do
  contrato, e foi revertida antes da validação final.

## 22/08/2026 — Fase C3: Quadro de Horários · Empresas saem do `app.js`

**Fase C3 do plano vivo** (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`): a terceira
família de documentos a sair inteira. Zero SQL, nenhuma mudança de comportamento pretendida.

**Medido:** `app.js` 2.763 → **2.573** (`wc -l`; −190); o bloco `MODAL / SISTEMA DE VIEWS`
1.527 → **1.341** (−186), e o percentual caiu de novo (55,2% → 52,1%). Total de JS do projeto
4.211 → 4.291 (+80, líquido — o menor de todas as fases C, porque o `app.js` perdeu MAIS linhas
que o `MODAL` sozinho: a sessão também limpou seis imports mortos). Fator "sai do `app.js` →
aparece em módulo" ≈1,4x — mais baixo que o ~1,7–1,8x anterior, pela mesma razão.

- **Um módulo novo:** `src/documentos/quadro-empresas.mjs` (270 linhas) — os renders do Quadro de
  Horários (`renderLinhaQuadro`, `quadroEmpresaRun`, `renderEmpresaQuadros`, mais os helpers
  `quadroMetaHTML`/`quadroDocInner`/`fetchQHByLines`) e de Empresas (`ligacoesPorEmpresaRun`,
  `secoesPorEmpresaRun`, `renderEmpresaHistory`, `historicoEmpresaRun`). Reaberto no
  `.vercelignore` com 1 linha (`src/documentos/` já estava aberto).
- **Sem aresta de grafo para fechar desta vez** — o markup compartilhado entre famílias
  (`evBandHTML`/`evBlocksHTML`, `secoesTarifasHTML`, `quadroHorariosBodyHTML`) já morava em
  `src/ui/blocos.mjs` desde a C1/C2, e o módulo novo só importa de lá.
- **Dois motivos medidos, não "faltou tempo", para o que ficou no `app.js`:**
  1. `quadroLinhaRun` é wrapper de `lineSearchRun`, que só existe no `app.js` porque chama
     `selectLine` (shell puro, sem seam de injeção) — o plano deixa esses quatro wrappers
     (`lineDocView`/`lineDocRun`/`lineSearchRun`/`searchPanel`) para a Fase E de propósito.
  2. `LOADERS.empresasRegulares`/`openEmpresaLigacoes` dependem de `runView` (abre uma view NOVA
     ao clicar numa empresa) — também shell puro, sem seam. Forçar a saída exigiria um quarto
     tipo de slot em `shell.mjs` só para isto — registrado como restrição, não decisão, para a
     Fase E.
- **`LOADERS.quadroHorarios` fica** (tem corpo — a composição do `searchPanel` com dois modos, é
  trabalho de Fase D, mesmo padrão de `LOADERS.tarifas` na C2). `LOADERS.ligacoesPorEmpresa`/
  `secoesPorEmpresa`/`historicoEmpresa` viraram wrappers finos — a lógica que era o corpo do
  `onRun` (sem nome antes) virou a função exportada com o mesmo nome + `Run`, o mesmo padrão que
  a C2 usou para `tarifaEmpresaRun`.
- **Achado, fora da família, declarado:** ao podar o import de `src/data/campos.mjs`,
  `ITINERARIO_FIELDS` e `FROTA_FIELDS` já estavam mortos desde a C1/C2 (escaparam por engano nas
  duas sessões). Removidos junto com os quatro que esta sessão tornou órfãos
  (`QH_INTERVALO_FIELDS`, `QH_PREDET_FIELDS`, `TARIFA_LINHA_FIELDS`, `EVENTO_FIELDS`) e três
  bindings de outros módulos (`getEvLookups`, `paginateEvents`, o trio `searchEmpresas`/
  `empresaChooserHTML`/`bindEmpresaRows`) — mesmo defeito que a C1 já tinha achado uma vez
  (`matchEvent`/`pageBounds`/`preencherLookup`).
- **Prova por mutação: duas tentativas, as duas morderam.** `renderLinhaQuadro` esvaziado (retorno
  antes do fetch) → `check_views quadroHorarios` vermelho (`documento em branco`, `0 tbody tr`);
  `ligacoesPorEmpresaRun` esvaziado → `check_views ligacoesPorEmpresa` vermelho (mesmo padrão).
- Sem testes novos em `ui-data-module.test.mjs`: nada nesta família é markup puro sem DOM/rede —
  fica coberto pelos gates de navegador (mesma nota da C1).
- Gates: `check.js`, `check_views` 18/18, `check_abas`, `check_selecao_linha`, `check_corrida_abas`
  e `semgrep` (121 regras, 0 achados) verdes. `version.json` 9 → 10, carimbo `build 22/08-A`.

## 21/08/2026 — Fase C2: Estrutura Operacional · Tarifas · Portaria saem do `app.js`

**Fase C2 do plano vivo** (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`): a segunda
família de documentos a sair inteira, no mesmo dia da C1. Zero SQL, nenhuma mudança de
comportamento pretendida.

**Medido:** `app.js` 2.974 → **2.763** (−211); o bloco `MODAL / SISTEMA DE VIEWS` 1.746 → **1.527**
(−219), e o percentual caiu de novo (58,7% → 55,2%). Total de JS do projeto 4.060 → 4.211
(+151, líquido — o `src/` sozinho cresceu 362, de 1.086 para 1.448). Fator "sai do `app.js` →
aparece em módulo" ≈1,7x, no mesmo patamar de B2/C1 (~1,8x).

- **Dois módulos novos:** `src/documentos/estrutura-tarifas-portaria.mjs` (251 linhas — os
  renders das três famílias) e `src/ui/empresas.mjs` (39 linhas — o chooser de empresa). Ambos
  reabertos no `.vercelignore` (1 linha cada, `src/ui/` e `src/documentos/` já estavam abertos).
- **Fechou a última aresta do grafo de `blocos.mjs` que a C1 tinha deixado pendente:**
  `secoesTarifasHTML`/`tarifaRowHTML`/`TARIFA_COLS` (Tarifas, C2, mas o Quadro, C3, também usa) e
  `quadroHorariosBodyHTML` (a Estrutura, C2, usa; o Quadro, C3, é o dono) foram para
  `src/ui/blocos.mjs`. Sem isso a Estrutura não saía — ela consome markup de C1 e C3, e o `app.js`
  não exporta nada (`grep -c '^export ' app.js` = 0).
- **Um achado no meio da sessão, fora do escopo original:** o modo "por empresa" de Tarifas
  precisa de `searchEmpresas`/`empresaChooserHTML`/`bindEmpresaRows`, e os três já eram usados por
  mais de uma família (Quadro de Horários, Histórico da Empresa) antes desta fase. Mesmo critério
  do `blocos.mjs`; foram para `src/ui/empresas.mjs` em vez de para lá porque `bindEmpresaRows` toca
  DOM, e o contrato do `blocos.mjs` é "nada de DOM, só string de HTML" — o precedente é
  `src/ui/listas.mjs`, que já mistura markup e bind pelo mesmo motivo.
- **O 3º slot do `src/documentos/shell.mjs`:** o painel de Portarias monta o próprio `ctx` a cada
  busca (não passa pelo `searchPanel`), e a função que fazia isso (`novoCtx`) lê o `activeLine`
  global do `app.js` — não podia sair. Virou o 3º slot injetado (`sbFetch`, `selecionarLinha`,
  `novoCtx`), ainda longe do critério de parada (~6).
- **O que NÃO saiu, por medição, não por omissão:** `LOADERS.estrutura` é one-liner (`lineDocView`,
  igual C1). `LOADERS.tarifas` tem corpo — a composição do `searchPanel` com dois modos — e essa
  composição é trabalho da Fase D. `LOADERS.portarias`, sem composição de Fase D a proteger, virou
  o one-liner `renderPortarias`. A armadilha de Portaria (único documento de lista+detalhe da Fase
  C, `pushDetail`/`popDetail`) e o guard `isCurrentGen` da casca do painel foram preservados.
- **O achado dos 4 loaders órfãos da C1, parcialmente resolvido:** `secoesPorLigacao` decidido
  para C4 (é de Município, não de Tarifas, apesar do nome parecido — medido, não suposto pelo
  nome). `ligacoesPorLogradouro`, `ligacoesPorTerminal` e `frotaPorEmpresa` seguem sem decisão,
  registrados no plano como restrição para quem executar C3/C4.
- **Prova por mutação: duas tentativas, as duas morderam.** `secoesTarifasHTML` esvaziado em
  `blocos.mjs` → `check_views` vermelho em **tarifas, estrutura E quadroHorarios** (a prova de que
  o bloco de fato serve mais de uma família); `renderEstrutura` trocado por uma caixa vazia →
  `check_views estrutura` vermelho (`0 tbody tr`, `0 .kpi`).
- Gates: `check.js`, `check_views` 18/18, `check_abas`, `check_selecao_linha`, `check_corrida_abas`
  e `semgrep` (121 regras, 0 achados) verdes. `tests/ui-data-module.test.mjs` 34 → 42 casos.
  `version.json` 8 → 9, carimbo `build 21/08-C`.

## 21/08/2026 — Fase C1: a primeira família de documentos sai do `app.js`

**Fase C1 do plano vivo** (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`): Frota ·
Histórico da linha · Itinerários. É a primeira fase em que um documento inteiro deixa o `app.js` —
possível porque a Fase A, no mesmo dia, deu `ctx` a todo render. Zero SQL, nenhuma mudança de
comportamento pretendida.

**Medido:** `app.js` 3.053 → **2.974** (−79); o bloco `MODAL / SISTEMA DE VIEWS` 1.844 → **1.746**
(−98), e pela primeira vez o **percentual dele caiu** (60,4% → 58,7%). Total de JS do projeto
3.879 → 4.060 (+181). O fator "sai do `app.js` → aparece em módulo" ficou em ≈1,8x, o mesmo da B2.

- **Quatro módulos novos**, cada um por um motivo distinto:
  `src/documentos/frota-historico-itinerarios.mjs` (os três renders);
  `src/ui/blocos.mjs` (o markup que MAIS DE UMA família usa: `evBandHTML`/`evBlocksHTML`,
  `itinerarioTableHTML` + `SENTIDO_ORDER`/`normSentido`, `frotaBlockHTML`);
  `src/data/campos.mjs` (as 7 listas de coluna do `select=`);
  `src/documentos/shell.mjs` (o seam de injeção). Os quatro reabertos no `.vercelignore` —
  `src/documentos/` custou as suas três linhas, como o risco de 10/08 exige.
- **A DECISÃO que a sessão tinha de fechar: markup compartilhado vai para `src/ui/`, nunca para o
  módulo de uma família.** Não é estética — é um ciclo. O documento consolidado (Estrutura, C2)
  consome markup de C1 e C3, enquanto o Quadro (C3) consome markup de C2: famílias exportando umas
  para as outras poriam dois módulos em ciclo, com TDZ à espreita. Critério de entrada do
  `blocos.mjs`: **duas** famílias, não uma. Isso **desfaz a aresta para trás** do grafo — C2 e C3
  podem entrar em qualquer ordem.
- **Um seam de injeção para toda a Fase C, não um por família.** `configurarDocumentos({ sbFetch,
  selecionarLinha })`, chamado uma vez no bootstrap. Dois slots: `sbFetch` é andaime (sai na Fase
  B) e `selecionarLinha` é ação de shell (até a Fase E). É onde o critério de parada do plano
  ("mais de ~6 dependências injetadas") passou a ser **medível** — e virou asserção em
  `tests/ui-data-module.test.mjs`, que foi de 21 para 34 casos.
- **O que NÃO saiu, e não é falha:** os três registros `LOADERS.*` são one-liners de shell
  (`lineDocView`/`searchPanel`) e saem nas Fases D/E. As três marcas `DOC ·` ficaram, guardando só
  o registro, cada uma dizendo em comentário para onde o resto foi. A sub-marca `Eventos — helpers
  compartilhados` sumiu junto com o markup que a batizava.
- **Prova por mutação: cinco tentativas, três morderam** — `renderFrota` esvaziado →
  `check_views frota` vermelho; `evBlocksHTML` esvaziado → historicoLinha **E** historicoEmpresa
  vermelhos (a prova de que o módulo compartilhado serve duas famílias); bootstrap removido → 3
  views vermelhas, uma exibindo a mensagem do próprio módulo (falha fechado).
- **Dois verdes que não morderam, e o que se fez com cada um.** (1) A asserção (c) do ATO 1 do
  `check_corrida_abas.mjs` não distinguia o `pdfHTML` committado do **fallback** do `baixarPdf`:
  o título que ela procurava vem também do `searchPanel`, que chama o mesmo `docHead`. Tirar o
  `commitViewResult` do `renderItinerarios` deixava a bancada verde. **Consertado:** passou a
  exigir a ausência do campo de busca (`id="spInput"`) no PDF. (2) A bancada não cobre a corrida de
  gerações DENTRO da mesma view — cada aba tem o seu objeto `view`, então o guard nunca é exercido
  ali. **Não consertado**, de propósito: é buraco pré-existente, sem relação com mover a família, e
  virar um terceiro ato é trabalho próprio. Registrado no plano.
- **Limpeza fora da família, declarada:** `matchEvent`, `pageBounds` e `preencherLookup` estavam
  no `import` do `app.js` sem uso no corpo desde a B2 — binding morto, o mesmo defeito que dois
  comentários do topo do arquivo existem para evitar. Removidos porque esta fase edita esse bloco.
- **Correção de um fato do plano, medida aqui:** o plano vivo afirmava que "a falha do
  `.vercelignore` é invisível no CI e só aparece na tela". **Não é** — o job `smoke` rodou contra o
  preview desta branch e buscou os quatro módulos novos por HTTP (200 nos quatro), com os arquivos
  internos em 404. A frase era stale desde a Sessão 2, e contradizia a seção "Riscos" do mesmo
  documento. O preview segue sendo condição de merge, mas por COMPORTAMENTO (o documento
  renderiza? a atualização ao vivo chega?), não mais pelo risco de 404.
- Gates: `check.js`, `check_views` 18/18, `check_abas`, `check_selecao_linha`,
  `check_corrida_abas` e `semgrep` (121 regras, 0 achados) verdes; no CI, os 10 checks do PR #137
  verdes, `smoke` incluído. `version.json` 7 → 8, carimbo `build 21/08-B`.

## 21/08/2026 — Fase A: contexto explícito (`ctx`) e a bancada de corrida

**Fase A do plano vivo** (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`). **Nenhum arquivo
mudou de lugar** — mudou o **contrato**: cada `render*`/loader do modal passou a **receber**
`ctx = { view, gen, pane, host, line }` em vez de abrir com `const view = currentView, gen =
beginGen(view);`. Zero SQL, nenhuma mudança de comportamento pretendida.

**Não meça esta fase em linhas: `app.js` 3.001 → 3.053 (+52).** Ela é a precondição da Fase C, que
é onde o bloco `MODAL / SISTEMA DE VIEWS` (1.844 linhas, 60,4% do arquivo) sai. As **22** aberturas
`const view = currentView, …` acabaram; hoje o `grep` dá **0**.

- **O contrato mora em `src/domain/view-state.mjs`**, ao lado do seam que ele embrulha: `makeCtx`,
  `withLine`, `withHost`, `nextGen`. `beginGen` deixou de ser importado pelo `app.js` — quem o
  chama é o módulo, e o import viraria binding morto.
- **Quem MONTA um ctx é o shell, em três pontos e só neles:** `runView`, `reloadTab` e o `run()`
  de cada painel de busca, todos via `novoCtx(view, pane, host)` — o único ponto que ainda lê
  `activeLine` para isso. **São DUAS invocações de loader, não uma:** mudar só a do `runView`
  faria o card abrir certo e o recarregamento por Realtime receber `undefined`, falha que só
  aparece com o portal aberto e o banco mudando.
- **`withLine` preserva `view` e `gen`** — a linha certa só existe depois do `await`, e derivar com
  geração nova devolveria a corrida que o seam existe para impedir. **Isso fechou um buraco real:**
  no caminho de 1 resultado, o `lineSearchRun` chamava `render(host, lines[0])` e o render cunhava
  uma geração NOVA; uma busca velha que resolvesse tarde voltava a vencer a mais recente.
- **`activeLine`/`currentView` continuam com mais de um escritor, e eles ficaram** (o wiring de
  abas, as limpezas). O que acabou foi um **documento** os LER.
- **`searchPanel` passou a escrever em `ctx.pane`, não no `modalBody` ao vivo.** Dois loaders
  montam o painel DEPOIS de um `await` (`ligacoesPorLogradouro` espera o `getIbge`,
  `ligacoesPorTerminal` espera três lookups): trocar de aba nesse intervalo pintava o painel
  inteiro na aba errada. Era o único ponto em que o código anterior de fato sangrava.
- **`LOADERS.secoesPorLigacao` lia `activeLine` DEPOIS do `await`** — trocar de linha com a busca no
  ar dava cabeçalho de uma linha e tabela de outra, na mesma tela, sem erro. Hoje lê `ctx.line`.
- **O guard explícito de Portarias foi preservado** (`await getPortariaAnos()` → `isCurrentGen`):
  `_panelRun` fica fora do seam, então é a única coisa que protege a casca daquele painel.
- **Um adaptador morreu:** `renderActiveLineQuadro = host => renderLinhaQuadro(host, activeLine)`
  existia só porque o contrato antigo separava o container da linha e mandava buscar a segunda no
  global.

**A bancada de corrida — `scripts/check_corrida_abas.mjs` (entregável obrigatório da fase).**
Nenhum gate do repo cobria isto, e o motivo é estrutural: nenhum deles **cria** a ordenação que
define o bug. O `check_views.mjs` abre cada view numa página limpa; o `check_abas.mjs` espera cada
ação assentar; o `check_selecao_linha.mjs` espera o pane parar de girar; e o stub do PostgREST
respondia na hora. Os três podiam ficar verdes com um render atrasado pintando o pane ativo em vez
do que capturou. O `scripts/lib/rig.mjs` ganhou um `segurar(tabela, qs)` opcional que prende a
resposta até o teste liberar (sem ele, o comportamento é o de sempre). Dois atos — um render de
documento (Itinerários) e a casca de um loader (Ligações por Logradouro) — e três asserções:
**(a)** o pane da aba 2 não foi pintado pelo trabalho atrasado da aba 1; **(b)** o `pdfHTML` da aba
2 não foi sobrescrito (lido pelo caminho real, com um stub de `window.print` sobre o `.pdf-export`
que o `baixarPdf` monta); **(c)** o pane **da aba 1** e o `pdfHTML` **dela** receberam a resposta
atrasada. Sem a (c), a bancada aprovaria uma implementação que descartasse toda resposta
pós-troca-de-aba. Roda no CI, no mesmo `views.yml` dos outros três gates de navegador.

- **Armadilha da própria bancada, achada ao escrevê-la:** a 1ª versão afirmava que o PDF da aba 2
  não continha `/Itiner/i` — e falhou, porque o texto de uma portaria da fixture fala em
  "alteracao do itinerario da linha 549M". O marcador virou o TÍTULO do documento. Falso vermelho
  é tão inútil quanto falso verde.

**Prova por mutação (o plano exige uma; foram três).** (1) `searchPanel` de volta ao `modalBody` ao
vivo → ATO 2 vermelho em (a) e (c) — é a reprodução do bug real, não uma mutação artificial;
(2) `renderItinerarios` relendo `currentView` na hora de escrever → ATO 1 (b) vermelho, o `pdfHTML`
da aba 2 é sobrescrito; (3) corpo de `renderFrota` trocado por uma caixa vazia →
`check_views.mjs frota` vermelho ("0 `.kpi`, esperado >= 12").

**Verificação:** `node tests/check.js` verde · `check_views.mjs` 18/18 · `check_abas.mjs`,
`check_selecao_linha.mjs` e `check_corrida_abas.mjs` verdes · `./scripts/semgrep.sh` 0 achados em
121 regras. `version.json` 6 → 7 e `#verTag` para `build 21/08-A` (o `app.js`, os módulos e o
`index.html` são servidos).

**Revisão:** a cota do Codex segue esgotada desde 15/08. A revisão foi própria, e ausência de
revisão não é aprovação — os achados estão registrados no PR.

## 20/08/2026 — Fase B2: helpers compartilhados e o seam de seleção

**Fase B2 do plano vivo** (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`), executada **fora
de ordem** — antes das Fases A e B, e a razão está registrada no plano: ela não depende delas.
`app.js` **3.264 → 3.001 linhas** (−263, −8,1%); a seção `COMPONENTES AUXILIARES` caiu de 285 para
155. Quatro módulos novos, nenhuma mudança de comportamento pretendida, zero SQL.

- **`src/ui/doc.mjs`** — markup de documento (`docHead`, `metaRows`, `colClass`, `tableHTML`) e os
  estados de tela (`loading`, `emptyBox`, `emptyLinha`, `errorBox`), mais o `bannerTrunc`.
- **`src/data/lookups.mjs`** — os caches de referência (`getIbge`, `getOrigem`, `getTerminais`,
  `getEmpresas`, `empNome`, `getEvLookups`, `preencherLookup`). Esconde o cache; **expõe** a
  invalidação, no `INVALIDADORES_LOOKUP` que a seção `REALTIME` do `app.js` espalha dentro do
  `CACHE_INVALIDATORS` — quem sabe QUANDO invalidar é o Realtime, quem sabe O QUE é o módulo.
- **`src/ui/paginacao.mjs`** — `paginate`, `paginateTable`, `paginateEvents`.
- **`src/ui/listas.mjs`** — a família de listas de linha (`situacaoSelectHTML`, `linhasTable`,
  `bindLineRows`, `paginateLines`, `lineResults`).
- **`debounce` foi para `src/domain/core.mjs`** (o `app.js` e o `paginateEvents` precisam dele, e
  cópia local nos dois recriaria a divergência que o módulo existe para evitar). Com ele fora, a
  seção `UTILITÁRIOS` ficou vazia e **foi apagada**: o `app.js` tem **14** seções, não 15.

**A decisão que o plano deixava em aberto — e que fixa as Fases D e E.** Ele dava duas saídas para
a família de listas e exigia escolher uma *ajustando a outra ponta*. Escolhida a **opção 1**, o
seam de seleção exposto: clicar numa linha é ação de shell (`selectLine` + `closeModal` + `toast`),
e ela chega ao módulo por `configurarListas({ aoSelecionarLinha })` **uma vez, no bootstrap**, não
encadeada pelos 8 call sites de `lineResults` — nenhum deles mudou. O custo que o plano temia
("esquecer um call site deixa as linhas renderizadas e não clicáveis, sem erro no console") era do
encadeamento, não da opção. Consequência declarada no plano: a Fase D grande passa a ser **sinal de
falha** de alguma fase C, e a Fase E é **de fato opcional** — C3 e C4 saem inteiras.

**Injeção explícita, e falhando fechado.** Os três `configurar*` do bootstrap
(`grep 'Bootstrap dos módulos' app.js`) passam o que só o `app.js` tem: o SVG do `#brandLogo`, a
função de rede, a ação de selecionar linha. Sem configuração, `docHead`/`getEmpresas`/
`bindLineRows` **lançam** em vez de sair mudos — e `bindLineRows` lança na LIGAÇÃO, não no clique,
porque falhar no clique é o que nenhum gate veria. Efeito colateral que vale mais que a ergonomia:
com a dependência entrando por parâmetro, os módulos passaram a ser exercitáveis em Node puro
(`tests/ui-data-module.test.mjs`, 21 casos).

- **Guarda ajustada junto:** a §[2] do `tests/check.js` varria só `src/domain/` para reconhecer o
  `require` de um harness. Passou a varrer `src/` inteiro — sem isso o
  `require('../src/ui/doc.mjs')` do `harness.js` seria lido como cópia sem marcador, reprovando
  quem fez a coisa certa.
- **`@canon`: 12 → 10**, e as 10 restantes são **todas** do bloco `SUPABASE CONFIG` — ou seja, a
  aposentadoria de `canon.js`/`drift.test.js` agora depende só da Fase B.
- **Prova por mutação (a fase não exigia):** sem `configurarDoc`, `check_views frota` vermelho;
  sem `configurarListas`, `check_selecao_linha` vermelho em 4 checagens; `linhasTable` devolvendo
  caixa vazia, `check_views ligacoesPorEmpresa` vermelho **e** o teste novo 20/21.
- **Verificação:** `node tests/check.js` verde, `check_views.mjs` 18/18, `check_abas.mjs` e
  `check_selecao_linha.mjs` verdes, `./scripts/semgrep.sh` sem achados.
- **`.vercelignore`:** `src/ui/` e `src/data/` reabertos nível a nível (três linhas por
  subdiretório novo, mais uma por módulo). Import ES é atômico — foi o que derrubou o portal em
  10/08/2026. O smoke confirmou **HTTP 200 nos quatro módulos novos** no preview e, depois do
  merge, em produção (`divatdetro.vercel.app`) — que é exatamente o risco que nenhum outro gate vê.
- **Correção pós-merge (21/08):** os números desta entrada saíram errados por 3 linhas
  (`2.998`/`−266`, quando é `3.001`/`−263`) e as **42 citações `app.js:linha` do plano vivo foram
  para a `main` deslocadas**. Causa: as citações foram conferidas e, DEPOIS disso, o `app.js` ainda
  recebeu 4 linhas (o ponteiro do bootstrap no índice e um comentário). Nenhum gate acusa — a §[2b]
  confere fato numérico por regex, não citação. Virou a regra 3 do "Como este plano é escrito":
  reconferir citação depois da última edição, não antes.

## 19/08/2026 — Sessão 5: o custo do processo, medido

**Sessão 5 do plano de 6** (`docs/historico/contexto-proxima-sessao-2026-08-14.md`). Documento
novo: `docs/planos/2026-08-19-custo-do-processo.md`. **Zero mudança de código, zero SQL, nenhum
arquivo servido tocado** — por isso sem bump de `version.json` nem de `#verTag`.

- **A razão processo : produto SUBIU**, de 3,03 para 3,20 (mesma régua nas duas datas), apesar das
  Sessões 2 a 4 existirem para baixá-la. O handoff registrou 2,8 : 1 com um critério que não
  consegui reproduzir (nenhum recorte dá 4.480); a ressalva está no documento, e a comparação usa
  uma régua só.
- **Por que subiu — o achado que organiza o resto:** extração converte cópia em guarda, não reduz o
  total. O `pure.harness.js` caiu 305 → 34 (**−271**, zero `@canon` restantes), e o líquido de
  `tests/` + `scripts/` foi **+4**: `check.js` +126 (a guarda que policia a modularização),
  `domain-module.test.mjs` +62, `check_deploy.mjs` +58, `README` +19, `check_views` +10. Redução
  real só vem de **aposentadoria**, e a única disponível (`canon.js` + `drift.test.js`, 128 linhas)
  está bloqueada nos 12 `@canon` de `tests/harness.js` — a Fase B.
- **`./scripts/semgrep.sh` gasta ~98% do tempo num timeout de rede.** Medido: **>10 min** como está
  na `main` (o scan termina — *"Ran 121 rules on 110 files: 0 findings"* — e o wrapper fica preso
  depois disso) contra **12 s** com `SEMGREP_ENABLE_VERSION_CHECK=0`. `--metrics=off` desliga a
  telemetria, não o version check, que insiste em alcançar `semgrep.dev` (HTTP 000 no ambiente do
  agente). **A correção de uma linha já existe na branch do PR #98 e não está na `main`.** Não foi
  portada aqui porque a Sessão 5 é documental por acordo; é a recomendação nº 1 do documento.
- **Os dois workflows fantasma, confirmados:** a API lista 12, o disco tem 10.
  `backup-pre-revoke.yml` (id 320886214) e `deploy-pages.yml` (id 295332914) aparecem `active` mas
  não têm arquivo na `main`, logo não há o que executar; o registro persiste pelo histórico de
  runs. Registrado para não ser "descoberto" uma terceira vez.
- **`CLAUDE.md`: 470 → 536 linhas em 5 dias** (~13/dia), lido em toda sessão. Proposto teto de 550
  com regra de **mover** para o doc especializado, não apagar.
- **Critério de parada, que não existia:** gate novo só se justifica com (1) modo de falha
  silencioso documentado, (2) nenhum gate existente cobrindo com uma asserção a mais, (3) custo
  cabendo no ciclo (~32 s offline + semgrep). Mais a regra de saída: gate de fase/incidente nasce
  com condição de aposentadoria no cabeçalho.

**Issues conferidas, não mexidas.** A #121 foi **verificada como resolvida**: os quatro defeitos
foram reproduzidos um a um contra o `check.js` atual e cada caso inverteu de resultado — o
transitivo e o de aspas simples reprovam nomeando arquivo e importador, o de espaço em `url()` e o
de comentário passam. As #101, #102, #103 e #104 **já estão corrigidas na branch do PR #98**, e
três delas tratam de arquivos que sequer existem na `main` (`scripts/lib/auditor.mjs`,
`tests/check_data_quality.test.js`) — corrigi-las aqui criaria conflito no rebase da Sessão 6.

**Gates:** `check.js` verde (49 links em 20 docs, 232 testes puros), `check_views.mjs` 18/18,
`check_abas.mjs` OK, `check_selecao_linha.mjs` OK, Semgrep 0 achados em 121 regras.

## 15/08/2026 — `src/domain/busca.mjs`: o corte é pela pureza, não pelo assunto

**Sessão 3 do plano de 6** (`docs/historico/contexto-proxima-sessao-2026-08-14.md`), executada sob
o plano vivo `docs/planos/2026-08-14-modularizacao-fatias-3-4.md`. Mesma forma da Sessão 2: a
função sai do `app.js`, a cópia e a guarda `@canon` são apagadas no mesmo commit, e o teste passa a
exercitar o código que o navegador executa.

- **`src/domain/busca.mjs`** (novo): `yearOf`, `matchEvent`, `localidadesQueCasam`, `orIlike`,
  `municipiosExatos`. Duas famílias sob o mesmo teto — o filtro do histórico de eventos, aplicado
  no cliente sobre linhas já buscadas, e a preparação do termo que vai ao servidor (o `or=()` do
  PostgREST). Quatro das cinco dependem do `core.mjs` (`norm`, `ilikeTerm`), então `busca.mjs →
  core.mjs` é aresta módulo→módulo — a mesma que `agrupamento.mjs:5` já tinha, e a primeira a
  entrar depois de o #122 passar a enxergá-la.
- **São CINCO, não seis.** A tabela do plano de 6 sessões
  (`docs/historico/contexto-proxima-sessao-2026-08-14.md:87`) lista `norm` nesta sessão. Ela saiu
  na frente, na Sessão 2, por ser dependência do `agrupamento.mjs` — desvio já registrado no
  ponteiro do `CLAUDE.md`. A Sessão 3 a encontrou pronta e importou do `core`.
- **`termosLocalidade` NÃO foi junto** (`app.js:2494`), embora chame `localidadesQueCasam`: faz
  `await getLocalidades()` em `app.js:2495`, ou seja, é I/O. Ficou no `app.js` e passou a importar
  a que saiu. O critério de corte deste repo é pureza, não proximidade temática.
- **`app.js` cai de 3.352 para 3.332 linhas**; o `pure.harness.js`, de 185 para 147, com **5 blocos
  `@canon` apagados** (de 18 para 13). Os 13 restantes são todos da Sessão 4 (`view-state.mjs`).
- **`.vercelignore`:** `!/src/domain/busca.mjs`. A guarda §[1] do `check.js` **reprovou de verdade
  na primeira rodada** — pelo motivo certo e por um segundo que vale registrar: ela lê a allowlist
  pelo `git ls-files`, então o módulo só conta como publicado depois de **rastreado**. Arquivo novo
  criado e não commitado reprova igual, que é o comportamento correto (a Vercel parte do git).
- **`tests/domain-module.test.mjs`:** o smoke ESM passou a cobrir o módulo novo. Não é redundante
  com o `pure.test.js`: aquele chega por `require`, este pelo `import` que o **navegador** usa —
  erro de sintaxe ESM ou `export` com nome trocado passaria batido pelo primeiro. 27 → 37 asserções.
- **`.github/workflows/views.yml`:** a seção `MODAL` afirmava "~59,5% do app.js"; com 20 linhas a
  menos no arquivo o real virou 57,9% e a guarda docs×código do `check.js` §[2b] reprovou. Número
  atualizado, guarda intacta — a reação prescrita pelo `CLAUDE.md` §2d.

**Verificado por mutação:** removida a linha `!/src/domain/busca.mjs` do `.vercelignore`, o
`check.js` reprova nomeando **o arquivo e o importador** (`assets necessários ignorados no deploy:
src/domain/busca.mjs — reabra no .vercelignore (import … from em app.js)`); reposta, volta a
`publica os 16 assets`. Gates: `check.js` verde (54 símbolos exportados pelos harness, 232 testes
puros, 19/19 fatos numéricos), `check_views.mjs` 17/17, Semgrep local 0 achados em 121 regras.

## 14/08/2026 — `src/domain/agrupamento.mjs`: a extração que apaga a cópia e a guarda junto

**Sessão 2 do plano de 6** (`docs/historico/contexto-proxima-sessao-2026-08-14.md`). Responde às
críticas nº 1 ("o processo virou um projeto paralelo") e nº 3 ("`app.js` é um monólito") com a
**mesma obra**, e é essa coincidência que faz o passo valer a pena.

**A ligação entre as duas críticas.** `tests/pure.harness.js` mantinha **30 cópias verbatim** de
funções do `app.js`, e cada cópia exigia uma guarda `@canon` para não divergir do original. As
cópias não existiam por gosto por processo: existiam **porque o código não era modular** — teste
unitário em Node não consegue importar uma função declarada dentro de um IIFE de navegador. Mover
a função para um módulo ES apaga a cópia *e* a guarda, e ainda deixa o teste exercitando o código
que o navegador de fato executa, em vez de um gêmeo.

- **`src/domain/agrupamento.mjs`** (novo): `groupBy`, `countBy`, `fmtMoney`, `byCodlinha`,
  `rjOrder`, `scoreEmpresa`, `dedupEmpresasPorRJ`, `classifyMunLines`, `terminaisDoMunicipio`,
  `resumoFrota`, `filtrarFrotaEmpresas`. São 11 funções que respondem "como estes registros se
  agrupam, se ordenam e quais deles ficam" — sem DOM, rede ou estado global, como o `core.mjs`.
- **`norm` foi para `core.mjs`, não para `agrupamento.mjs`.** `terminaisDoMunicipio` e
  `filtrarFrotaEmpresas` dependem dela, e a tabela do plano só a extrai na Sessão 3 (`busca.mjs`).
  As saídas eram duplicá-la (recriando a divergência silenciosa que a extração existe para acabar)
  ou promovê-la à primitiva de string que ela já é, ao lado de `esc`/`enc`/`ilikeTerm`. **Desvio
  deliberado do plano**, registrado aqui e no ponteiro do `CLAUDE.md`: a Sessão 3 encontra `norm`
  já pronta e importa do `core`.
- **`app.js` cai de 3.447 para 3.352 linhas** e o `pure.harness.js`, de 305 para 185: **12 blocos
  `@canon` apagados** (as 11 funções + `norm`), de 30 para 18. Não é corte de disciplina — é
  processo que deixou de ter objeto.
- **`tests/check.js` §[2]:** a lista de "símbolos que o harness pode exportar sem marcador
  `@canon`" (os importados do domínio) era escrita **à mão** e teria virado dívida a cada extração.
  Agora a isenção é apurada **por harness e por binding**: o gate lê os `require` de cada harness e
  os casa com os `export` do módulo citado. O modo de falha da lista manual era o pior possível:
  com o gate reclamando, a saída mais curta é escrever o nome na lista — que é exatamente como uma
  cópia de verdade passaria batida.
- **`.vercelignore`:** `!/src/domain/agrupamento.mjs`. A guarda §[1] do `check.js` **pegou o
  esquecimento na primeira rodada** (o arquivo ainda não estava no git), que é o cenário exato que
  derrubou o portal em 10/08.

**Verificado por mutação, não por leitura:** (1) exportar um símbolo novo sem marcador no harness
→ gate reprova nomeando-o, então a derivação automática não afrouxou a cobertura; (2) trocar
`return 0` por `return 9` em `scoreEmpresa` **dentro do módulo** → 3 testes falham, prova de que
os testes agora mordem o código servido. Gates: `check.js` verde (54 símbolos exportados pelos
harness, todos ou marcados ou vindos de módulo; 232 testes puros;
19/19 fatos numéricos), `check_views.mjs` 17/17, `check_abas.mjs` e `check_selecao_linha.mjs`
verdes, Semgrep local 0 achados (com o aviso de `vendor/` vazio — a pendência do dono da Sessão 1).

### Revisão do Codex (PR #125) — um achado, procedente: a isenção por NOME tinha o mesmo buraco

A 1ª versão da correção acima trocou a lista escrita à mão por um conjunto de todos os nomes
exportados em qualquer lugar de `src/domain/`. O Codex apontou que isso isenta por **nome**, não
por **ligação**: um harness que tirasse `groupBy` do seu `require` e recolocasse uma cópia local
sem marcador continuaria isento, porque `groupBy` segue exportado pelo `agrupamento.mjs`.

**Reproduzido antes de aceitar**, que é o único jeito de saber se um achado é real: com a cópia
local fiel no lugar da importada, o gate imprimia *"cobertura (54 …), todas marcadas e conferidas"*
e saía **tudo verde**. Dali em diante a cópia podia divergir do módulo sem nada olhando — a lista
manual saindo pela porta e voltando pela janela.

A isenção passou a ser apurada **por harness e por binding**: o gate lê os `require` daquele
arquivo, casa cada nome desestruturado com os `export` do módulo citado, e só então isenta. Três
comportamentos novos, cada um provado por mutação: cópia local reintroduzida **reprova**;
desestruturar nome que o módulo não exporta **reprova** (o binding chegaria `undefined` e o teste
passaria testando nada); e forma de `require` que o extrator não reconhece — namespace, caminho
computado — **não isenta ninguém**, porque um extrator que erra para o lado permissivo é pior que
extrator nenhum.

## 14/08/2026 — "Verde local não é verde no CI": os rulesets do Semgrep passam a ser vendorizados

**Motivação — uma crítica externa que estava certa.** Levantaram três pontos sobre o projeto; o
segundo era que `./scripts/semgrep.sh` rodava 5 regras enquanto o CI rodava 116, e que achados
reais de shell-injection já tinham vazado do local para o CI por causa disso. A apuração mostrou
que a crítica **citava a documentação do próprio repo**: o número e o episódio estão em
`.github/workflows/atualizar-baseline.yml` e em
`docs/historico/contexto-proxima-sessao-2026-08-09.md` — *"o CI roda 116 … Foi assim que 3 achados
de `run-shell-injection` passaram para o CI no workflow novo"* (09/08). Não era hipótese: tinha
acontecido cinco dias antes.

**Por que vendorizar, e não cachear.** O caminho óbvio — guardar os rulesets fora do git — não
serve a ninguém que trabalha neste repo: nem o ambiente do agente Claude nem o dono (que opera
pelo **celular**, sem terminal) alcançam `semgrep.dev`. A cópia versionada é a única forma de os
dois rodarem o mesmo conjunto. Mesma disciplina do supabase-js e das fontes.

Isso **não** contradiz a versão fixa do binário: aquilo prende o *executável* para que atualizá-lo
seja uma decisão; isto prende as *regras* pelo mesmo motivo, e com o mesmo mecanismo (só
`workflow_dispatch`, PR com diff, merge deliberado).

- **`.github/workflows/atualizar-semgrep-rulesets.yml`** (novo, 10º workflow): baixa os 4 rulesets
  de `https://semgrep.dev/c/p/<nome>`, escreve `.semgrep/vendor/` + `.manifest.json` (provenance:
  binário, data, contagem por ruleset, link do run) e abre PR. `workflow_dispatch` puro —
  operável pela aba Actions, no celular.
- **A conferência que dá sentido ao workflow:** antes de propor, ele roda o conjunto **vendorizado**
  e o **registry ao vivo** contra o mesmo commit e compara as assinaturas dos achados
  (`check_id` + arquivo + linha). Se divergirem, **falha** em vez de propor uma cópia que mente.
  Sem isso, vendorizar só trocaria um falso verde por outro — pior, porque este pareceria resolvido.
- **`scripts/semgrep.sh`:** o modo padrão passa a somar `.semgrep/vendor/`; `--full` vira
  conferência de frescor contra o registry. Enquanto `vendor/` estiver vazio, o wrapper **avisa em
  `stderr`** que o verde ali ainda não vale como verde no CI — silenciar seria reconstruir
  exatamente o problema que motivou tudo.
- **`semgrep.yml`:** ganha o passo `[2] Rulesets vendorizados`, que roda o que a máquina de quem
  desenvolve roda, **antes** do registry ao vivo. `[2]` verde + `[3]` vermelho tem diagnóstico
  único: a cópia está velha, rode o workflow. O `if: hashFiles(...)` cobre o estado transitório em
  que `vendor/` ainda não foi preenchido.
- **`tests/check.js` §[2b]:** a contagem de regras locais entra na tabela `FATOS`, conferida em
  `CLAUDE.md`, `docs/semgrep.md` e `scripts/semgrep.sh`. Era um número repetido em prosa viva e
  sem guarda — exatamente o que essa seção existe para prender, e o que virou munição de crítica.
  Só as **locais** entram: as vendorizadas mudam quando o registry muda, e prendê-las faria o gate
  reprovar por um número que ninguém neste repo escolheu.

**Verificado, não suposto:** `--dump-config` **não existe** no Semgrep 1.171.0 (só `--dump-ast` e
afins), por isso o download é por `curl` no endpoint que o próprio Semgrep resolve. A guarda nova
foi provada quebrando-a de propósito (`5` → `7` no `CLAUDE.md` → gate reprova nomeando o arquivo).
O carregamento do `vendor/` foi provado com uma regra de mentira: 5 regras sem o diretório, 6 com
ele, e o aviso some quando ele existe.

### Leva de revisão do Codex (mesmo dia) — cinco achados, cinco procedentes

Nenhum foi descartado, e dois eram o **defeito original reaparecendo por outra porta** — o que é
o risco típico de uma correção escrita pela mesma cabeça que criou o problema:

- **`vendor/` parcial passava por completo.** A checagem era "existe *algum* `.yml`?", então
  perder um arquivo num merge faria o wrapper escanear um subconjunto e devolver verde. Num repo
  limpo, parcial e completo acham zero igualmente — verde indistinguível do verdadeiro, que é
  exatamente o que este PR veio matar. Hoje exige-se o conjunto **completo**; faltando qualquer
  um, cai para as regras locais e diz o que falta.
- **Versão do binário local × do CI.** O wrapper usava qualquer `semgrep` do `PATH` enquanto o CI
  fixa 1.171.0. Versões diferentes leem os mesmos rulesets de formas diferentes — mesmo falso
  verde, outro caminho. Passa a avisar (não falhar), lendo a versão do próprio `semgrep.yml`.
- **Provenance volátil tornava o "nada mudou" inalcançável.** O manifesto grava data e URL do
  run, e a decisão de abrir PR olhava o diretório inteiro — então **todo run abriria um PR só de
  provenance**, o oposto do que o passo prometia. A decisão passou a olhar só os `.yml`, e o
  manifesto só é reescrito quando eles mudam.
- **`set +e` engolia falha de scan.** Sem `--error`, achado sai 0 — logo, saída não-zero é falha
  real (config inválida, regra que o binário fixo não entende). Se as duas metades falhassem do
  mesmo jeito, as saídas parciais concordariam e o workflow proporia uma cópia que o próprio
  Semgrep recusou. Os quatro status agora são capturados e conferidos antes de qualquer comparação.
- **Um comentário afirmava uma guarda que não existia.** O workflow dizia que o `check.js` §[2b]
  conferia as três listas de rulesets; não conferia — a entrada nova só contava regras locais,
  fato não relacionado. A guarda foi **implementada** (comparação nominal entre `semgrep.sh`,
  `semgrep.yml` e o atualizador) em vez de o comentário ser apagado. De quebra, a lista deixou de
  aparecer três vezes dentro do próprio atualizador: virou `RULESETS` no `env:` do job.

Provado quebrando: lista divergente em um dos três arquivos → gate reprova nomeando os outros
dois; `vendor/` com 1 de 4 arquivos → avisa "INCOMPLETO" e roda 5 regras (não o subconjunto);
com 4 de 4 → roda 9 e não avisa; versão do CI trocada para 9.9.9 → avisa com o comando de
alinhamento. Fixtures removidas depois.

### Segunda rodada do Codex, sobre o commit de correção — um achado, procedente

**O ramo do atualizador reusava o `run_id`, e re-executar não tinha saída.** Re-executar um run
pela aba Actions **preserva o `run_id`** e só incrementa o `run_attempt`. Então, se o `git push`
passasse e o `gh pr create` seguinte falhasse por instabilidade da API, a re-execução recriaria o
**mesmo nome de ramo**, a partir da base, com um commit **irmão** do que já estava no remoto — e o
push sairia rejeitado como non-fast-forward. Quem opera pelo celular ficaria sem saída, justamente
no caminho que este workflow existe para servir. O ramo passou a incluir a tentativa
(`semgrep/rulesets-<run>-<tentativa>`). Custo aceito: tentativa falha deixa ramo órfão — barato,
visível, e sem PR apontando para ele.

Vale registrar o padrão das duas rodadas: **os seis achados foram sobre o mecanismo de segurança,
nenhum sobre o portal.** É o que se espera quando a mudança é toda de ferramental — e é a razão
de a revisão externa valer a pena mesmo com todos os gates verdes: gate confere o que alguém já
pensou em conferir.

**Concluído em 14/08/2026:** o dono executou o workflow pela aba Actions; o run
[`31845142284`](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/31845142284) validou os
173 rulesets vendorizados contra o registry, abriu a PR #127 e ela foi mesclada sem alterações fora
de `.semgrep/vendor/`.

## 08–09/08/2026 — A auditoria completa vira 22 correções, e o gate passa a ver o que não via

Uma auditoria de código, arquitetura, engenharia e documentação
(`docs/historico/analise-2026-08-08-auditoria-completa.md`) virou o plano
`docs/planos/2026-08-08-correcoes-auditoria.md`, executado em seis PRs (#106, #107, #108, #110,
#112, #113). O achado que organiza todos os outros: **a rede de testes tinha dois furos no
centro**, e enquanto eles existissem o verde de todo o resto era inconclusivo.

**Os dois furos (PR #106).** A guarda anti-drift era `js.includes(snippet)` com trechos escritos à
mão, e 15 das 50 entradas eram só a assinatura da função — com o corpo de `matchEvent` trocado por
`return false`, o gate imprimia "tudo verde". E a bancada headless **pulava o `select=`**,
devolvendo a fixture inteira: trocar um nome de coluna no `app.js` mantinha as 17 views verdes
enquanto o PostgREST responderia 400 em produção. Hoje os marcadores `@canon` delimitam cada cópia
e a comparação é do texto inteiro; a bancada projeta as colunas pedidas e devolve 400 para coluna
ausente. As duas sabotagens foram reproduzidas para provar que agora reprovam.

**Bugs do frontend (PRs #107, #108).** `getEvLookups` gravava `evLookups.emp = {}` **depois** do
`.catch`, e objeto vazio é *truthy*: uma falha transitória de rede deixava os lookups vazios pela
sessão inteira e o Histórico passava a mostrar ids crus, sem erro na tela. Três loaders escreviam
`innerHTML` pós-`await` sem passar pelo seam do ciclo de vida da view. `marcarTrunc` só marcava
corte quando `data.length >= limit` **pedido** — um `limit` maior que o teto do servidor sairia
cortado em silêncio. O laço de views deixou de aceitar "corpo ≠ 0" e passou a exigir conteúdo
mínimo **na unidade de cada documento** (linhas de tabela, `.ev-block` no Histórico, `.kpi` na
Frota), porque uma régua única reprovaria duas views por um defeito inexistente.

**Documentação e as guardas novas (PR #110).** 17 retratos datados saíram de `docs/` para
`docs/historico/`, cada um abrindo com `Snapshot de DD/MM — não atualizar`, e o README ganhou o
critério: plano vivo em `docs/planos/`, retrato datado em `docs/historico/`. O bloco de runbook de
gates do `CLAUDE.md` encolheu 49 linhas — o detalhe da dívida de qualidade de dados foi para o
cabeçalho do `check_data_quality.mjs`, que é onde quem opera o gate vai olhar. E a seção `[2b]`
ganhou **quatro guardas**, cada uma provada falhando com a deriva reintroduzida de propósito antes
de passar: `docs/adr/` e `docs/planos/` entram em `DOCS_VIVOS` por descoberta; `scripts/*.mjs`
entram na varredura de fatos numéricos; toda tabela de `RT_TABLES` precisa aparecer no mapa
tabela→card (comparação **nominal** — o doc dizia "as 14 tabelas" logo acima de um mapa com 12, e
número certo ao lado de lista errada é pior que os dois errados); e a composição de
`.claude/skills/` é contada do disco.

**A baseline de restauração (PR #113), e por que ela esperou.** Três tarefas dependiam de medição
no banco vivo, que só o dono alcança. Valeu a espera: o rascunho propunha versionar
`statement_timeout = 8s` para o `anon`, e a medição mostrou **3s** — os 8s são do `authenticated`.
Versionar o palpite teria triplicado, num restore, o tempo que uma consulta anônima pode segurar o
banco, sem sintoma nenhum. Junto entraram `pgrst.db_max_rows = 30000` e o `lock_timeout`, que não
vinham no dump por não serem objetos de schema — um restore devolvia o banco **sem teto**, e o que
se perdia era o SEC-02.

**Duas afirmações dos docs caíram por medição.** `rls_auto_enable()`, descrita em `docs/schema.md`
como função de plataforma que liga RLS em tabela nova, **não existe** — logo **não há automatismo
ligando RLS**, e tabela pública nova exige `ENABLE ROW LEVEL SECURITY` explícito. E o `CLAUDE.md`
mandava replicar correção na staging "senão o rebuild do ETL desfaz", sem que nenhum doc
descrevesse o rebuild: medido, **não existe rebuild automatizado**, mas as contagens de staging e
final batem exatamente (20.753 e 2.100), porque o import de CSV alimenta as duas cópias. A regra
continua valendo — pelo motivo certo, agora escrito em `docs/etl.md`, que nasceu nesta rodada.

Fecharam as issues **#50** (abas do modal), **#63** (qualidade de dados pós-ETL) e **#111**
(`dedupEmpresasPorRJ`, a heurística de desempate de empresa que estava escrita em dois lugares e
podia fazer o banner discordar do card para o mesmo RJ).

## 03/08/2026 — Superpowers vendorizado: as skills de processo passam a sobreviver à sessão

O objetivo era ter as skills do **Superpowers** (`obra/superpowers` — `brainstorming`,
`test-driven-development`, `systematic-debugging`, `writing-plans`,
`verification-before-completion`, …) disponíveis em toda sessão, inclusive nas sessões web.

O caminho anunciado pelo upstream é `/plugin install`, e **ele não serve aqui**. Plugin
instalado mora em `~/.claude/plugins/`, fora do repo, e a sessão web roda em container efêmero
que só clona o repo: some na sessão seguinte. A segunda tentativa foi declarar o marketplace no
`.claude/settings.json` com `--scope project`, apostando que uma sessão nova auto-instalaria.
**Medição desmentiu:** com o cache global esvaziado (`rm -rf ~/.claude/plugins`), o
`installed_plugins.json` nasce com `"plugins": {}` e nenhuma skill `superpowers:` aparece na
sessão. O único mecanismo que carrega com estado global zero é o diretório de skills do
projeto, `.claude/skills/<nome>/SKILL.md`.

Então as 14 skills entraram **no git**, planas, com três peças em volta:

- **`scripts/update_superpowers.sh`** — clona o upstream (opcionalmente numa tag/commit),
  remove a leva anterior pelo que o manifesto lista (não varre o diretório: a skill de domínio
  `db-change` mora ali do lado e não é do Superpowers), copia as novas, **reescreve
  `superpowers:X` → `X`** nas referências cruzadas — sem plugin não há namespace, e deixar o
  prefixo faria a skill mandar invocar um nome que o tool `Skill` não resolve — e regrava o
  manifesto com versão e commit.
- **`.claude/skills/.superpowers-manifest.json`** — provenance (upstream, versão 6.2.0, commit,
  data) e a lista que a próxima limpeza usa.
- **`.claude/hooks/superpowers-session-start.sh`** — a peça sem a qual o resto é decoração. O
  Superpowers depende de **uma injeção de contexto** no início da sessão: o conteúdo inteiro da
  skill `using-superpowers`, que é o que faz o agente procurar skill *antes* de responder. Esse
  trabalho é do hook do plugin, que aqui não roda; o script faz o mesmo lendo a cópia
  vendorizada, e sai em silêncio se ela não existir. Entrou como um **segundo** bloco
  `SessionStart` no `.claude/settings.json` (matcher `startup|clear|compact`), ao lado do hook
  que instala o Semgrep — dois blocos, não um só, para que um não engula o outro.

Verificado do jeito que este repo exige: container com `~/.claude/plugins` apagado, sessão
nova, e a pergunta feita ao próprio agente — recebeu a instrução de que tem superpowers (sim),
enxerga as 5 skills sorteadas da leva (sim), nomeia a primeira (`brainstorming`).

Por fim, o número virou fato guardado: a seção `[2b]` do `tests/check.js` compara a contagem
declarada no `CLAUDE.md` **e no comentário do hook** com o que o manifesto lista. Comentário de
script é prosa viva que ninguém relê — a mesma razão pela qual os comentários dos workflows
entraram na varredura em 30/07.

## 31/07/2026 — Clicar numa linha volta a selecioná-la, e o card de Localidade ganha filtro de situação

Dois defeitos relatados pelo dono no card **Linhas por Localidade e Município**, diagnosticados
com loop de repro em navegador headless antes de qualquer hipótese.

- **A seleção de linha era apagada pelo próprio `closeModal`.** `bindLineRows` faz
  `selectLine(...)` e logo `closeModal()`. O `selectLine` grava a linha nova por `replaceState`
  — na entrada de histórico **do modal**; o `closeModal` desfazia essa entrada com
  `history.back()` para não poluir o histórico, caindo na entrada **pré-modal**, que não conhece
  a linha. O `hashchange` chamava `applyRoute` e, sem `linha/` no hash, ela executava
  `setActiveLine(null)`. O efeito dependia do estado anterior: em card que **não exige linha**
  (Localidade, Ligações por Logradouro, Município e Região) não se conseguia selecionar linha
  nenhuma clicando no resultado; com uma linha já ativa, a seleção **revertia em silêncio para a
  antiga** — o modo de falha mais difícil de ver. Agora o `closeModal` compara `activeLine` com
  `_lineAtPush` (gravado no `syncHash({push:true})`) e só usa `history.back()` quando a entrada
  anterior ainda descreve o estado atual; se a linha mudou com o modal aberto, reescreve o hash
  com `syncHash()` — `replaceState` não dispara `hashchange`, então não há `applyRoute` para
  desfazer nada. Efeito colateral aceito e desejável: o Voltar do navegador passa a desfazer a
  seleção.
- **O resultado por localidade era a única lista de linha sem barra de situação.** O
  `renderLocalidadeSecoes` não tinha filtro algum, e o cadastro real tem **500 linhas canceladas**
  misturadas nos resultados. Ganhou a barra Todas/Ativas/Canceladas, que repinta os dois blocos
  (com seção e "outras linhas") e refaz o `bindLineRows` — filtrar não pode transformar as linhas
  em texto morto. O contador do recorte aparece quando o filtro esconde alguma coisa, senão a
  contagem do topo mentiria sobre o que está na tela.
- **A regra do filtro virou definição única.** `situacaoSelectHTML()` + `filtrarSituacao()`
  (escrita sobre o `isLinhaAtiva` que já existia) substituem a cópia que só o `lineResults` tinha.
  Sem isso as duas telas divergiriam na definição de "ativa" — o modo de falha que o `CLAUDE.md`
  chama de "cópias que divergem".
- **Os dois blocos passaram a paginar em 25/página**, como as demais listas de linha. Uma
  localidade grande chega ao teto de 400 linhas da query, cada uma com sua tabela de seções, e
  despejar tudo no DOM travava a tela. O bloco "com seção" usa o `paginate` com os cabeçalhos de
  empresa dentro da fatia (convenção do `paginateLines` agrupado, com a contagem do grupo
  inteiro); o bloco "outras linhas" usa o `paginateLines` com `pdf:false`. Como só a fatia atual
  entra no DOM, o documento passou a **escrever `pdfHTML` pelo seam** (`view`/`gen` capturados
  antes do primeiro `await` do `mostrarLinhasPorLocalidade`), com os dois blocos inteiros — sem
  isso o botão PDF exportaria só a página aberta. Os caminhos de resultado vazio zeram o
  `pdfHTML`, para o botão não baixar o recorte da busca anterior.
- **Guardas novas:** `scripts/check_selecao_linha.mjs` (bancada do `rig.mjs`, no `views.yml`)
  reproduz o caminho do usuário — entra sem linha ativa, abre o card pelo clique, busca, filtra e
  clica — e confere também a paginação (25 na 1ª página, o resto na 2ª, clique vivo depois de
  virar), que o PDF sai com as 30 linhas e não com as 5 da página aberta, e que o conserto não
  empilhou histórico nem quebrou o "Voltar fecha o modal". Conferido que ele fica **vermelho**
  sem cada uma das correções. `filtrarSituacao`
  entrou no `pure.harness.js` com 6 testes e guarda no `canon`. As fixtures do `rig.mjs` ganharam
  uma linha **cancelada**: uma bancada só com linhas ativas não consegue ver barra de situação
  nenhuma funcionando.

## 31/07/2026 — Restore NDJSON executável e documentação reconciliada após o merge do #73

Revisão do pacote `0bfb38a` depois das correções da auditoria anterior.

- Criado `scripts/restore_rest.mjs`: dry-run por padrão, allowlist de 14/18 tabelas, validação de
  JSON/contagem/SHA-256, confirmação explícita do project ref, recusa do projeto de origem e de
  destino não vazio, ordem da única FK, lotes e conferência final.
- Criada `tests/restore_rest.rig.mjs`; ela e a bancada do backup agora rodam no `ci.yml`. As duas
  provam também que chaves opacas `sb_publishable_*`/`sb_secret_*` vão em `apikey`, nunca como
  Bearer JWT.
- Corrigido o Caminho A do runbook: a versão anterior fazia `pg_restore` completo e depois rodava
  18 `CREATE TABLE` não idempotentes. Agora uma baseline cria o schema e o dump entra somente com
  `--data-only`.
- Corrigida outra promessa falsa do runbook: `check_views.mjs` sempre usa fixtures; nunca existiu
  o modo “sem stub”. A validação contra banco restaurado continua exigindo preview real.
- Separados backup automático próprio, backup gerenciado e PITR; declarado o estado-alvo
  pré/pós-Fase 3 e o requisito de exposição explícita do schema na Data API de projetos novos.
- README, CLAUDE, segurança e handoffs corrigidos para 8 workflows, `@font-face` em `styles.css`,
  3 domínios de produção, JWT `anon` legada e PR #73 mergeado em `0bfb38a`.
- A guarda `[2b]` passou a derivar do código a quantidade de workflows e domínios e a bloquear
  regressões na localização das fontes, no tipo da chave e no estado histórico do #73.

## 31/07/2026 — O repositório é público POR DECISÃO, e a documentação parou de dizer o contrário

PR 4 do plano da auditoria preliminar de 30/07. O repo já era público havia dias; o que faltava era
a decisão estar escrita em algum lugar — e, enquanto não estava, a documentação continuava
mandando o contrário.

- **O item perigoso, corrigido:** `docs/seguranca.md` § 5 listava "**Repositório GitHub privado:**
  Settings → Danger Zone → Change visibility → Private" entre as ações de maior ganho do dono. Não
  era premissa velha em prosa — era **instrução acionável**, num documento escrito para ser
  executado, mandando desfazer a decisão em vigor. Um agente lendo o manual de segurança executa.
- **`docs/adr/0003-repositorio-publico.md`:** a decisão passa a ter lugar próprio, com o custo
  aceito registrado — e com o limite desse custo medido, não presumido. A maior parte da
  documentação descreve controles já observáveis de fora (a chave `anon` e o `app.js` são servidos
  a todo visitante) ou comportamento público do Postgres. **A exceção é a capacidade de resposta a
  incidente** (§ 9.2 e § 9.3): essa não é derivável de fora — e a resposta a ela é **fechar o
  SEC-06**, não redigir a prosa. Enquanto o RTO for desconhecido, a frase é verdadeira dentro ou
  fora do git.
- **§ 9 (riscos residuais) reescrito:** registra QUE cada risco foi avaliado, QUAL controle o
  compensa e POR QUE a convivência foi aceita — **registro de decisão, não log de auditoria**. A
  versão anterior trazia dump de medição e hash de commit no meio do manual do dono. Os ganchos que
  impedem remoção silenciosa de controle ficaram: o gate `check_grants.mjs` é diário **por causa do
  § 9.1**, e as otimizações do `app.js` seguem marcadas como **não** sendo rate limiting.
- **O `CLAUDE.md` NÃO foi redigido, por decisão.** O plano original previa tirar de lá o mesmo
  trecho — a medição do default do `supabase_admin`, os 108 grants, "RLS não bloqueia TRUNCATE".
  Avaliado e recusado: são três fatos públicos compostos, descrevendo um buraco **já fechado**, e
  aquele parágrafo é o único lugar que explica por que o gate roda todo dia e por que o
  `backup_schema.sql` revoga mais que `MAINTAIN`. Regra sem lastro é regra que a próxima faxina
  apaga — foi assim que a versão anterior daquele mesmo parágrafo pôde afirmar o oposto do medido.
- **Premissas velhas nos comentários:** `semgrep.yml` (× 2), `docs/semgrep.md` e `backup.yml`.
  Duas conclusões sobreviveram à troca de premissa e ficaram registradas como tal — `--metrics=off`
  (não mandar dado a terceiro vale em repo público ou privado) e "nada de service key no workflow"
  (superfície do Actions, não visibilidade). Uma caiu: Code Scanning / SARIF **não** exige Advanced
  Security em repo público — segue de fora por escolha, não por impedimento.
- **`LICENSE` conferida, sem mudança:** proprietária, todos os direitos reservados. Público não é
  open source.
- **ADR-0002 saiu do papel, e a ADR passou a dizer isso:** a verificação de 31/07 às 01:03 UTC está
  registrada no Status. Entre 28/07 e essa data a ADR afirmava a propriedade sem que nenhum gate a
  exercesse em preview.
- **`docs/historico/handoff-2026-07-30-auditoria-verificacao.md` resgatado:** existia só na branch
  `claude/ask-matt-u6cwf8`, sem PR, e o CHANGELOG **já citava o caminho** — referência apontando
  para arquivo ausente na `main` desde a entrada anterior.

## 31/07/2026 — O `deploy-smoke` passou a verificar preview de verdade (achado A)

Fecha o achado **A** da auditoria preliminar de 30/07: o gate reprovava em **todo** preview, e por
isso a propriedade central do **ADR-0002** — preview nunca lê o banco de produção — **nunca tinha
sido exercitada**. Só produção era verificada, que é justamente o caso sem risco.

- **Lado do dono:** Protection Bypass for Automation criado na Vercel e gravado no secret GitHub
  `VERCEL_AUTOMATION_BYPASS_SECRET`. Nenhuma linha de código dependia disso.
- **Lado do repo, 2 commits:** (1) `check_deploy.mjs` passou a imprimir `error.cause` — o `fetch`
  do Node põe TODA falha de rede sob a mesma frase `fetch failed` e o script descartava o motivo;
  (2) removido o header `x-vercel-set-bypass-cookie`, que pede à Vercel um redirect + Set-Cookie e
  é receita para **navegador** (Playwright/Cypress, que têm cookie jar). O `fetch` do Node não
  guarda cookie: seguia o redirect sem ele, a Vercel redirecionava de novo, até estourar o limite.
- **A inversão que quase custou caro, registrada no comentário do código:** com o segredo ERRADO o
  loop não acontecia — a Vercel devolvia a tela de login com 200. O loop só começou **porque** o
  bypass passou a valer. Os runs #83 e #84, lidos sem a causa, pareciam regressão; eram o primeiro
  sinal de acerto.
- **Primeiro log verde contra preview:** `divatdetro-4ghtjqif8-… está fora da allowlist e
  seleciona teste`, `URL de teste isolada`, `guarda fail-closed publicada`.
- ⚠️ **Deriva aberta por isto:** `docs/seguranca.md` §9.3 e `docs/backup.md` ainda afirmam que o
  isolamento de preview nunca foi exercitado. Deixou de ser verdade.

## 30/07/2026 — Cada gate parou de rodar duas vezes por push

PR 1 do plano da auditoria preliminar de 30/07/2026 (achado **C**). `ci`, `views`, `semgrep`,
`deriva` e `db-checks` rodavam em `push` (qualquer branch) **e** em `pull_request`: com PR aberto,
todo push disparava cada gate **duas vezes**. Medido ao vivo no PR #85 — **8 execuções onde 4
bastavam**. Agora o `push` é `branches: [main]` nos cinco; `pull_request`, os crons e os filtros de
`paths` ficaram intactos. `backup.yml` e `deploy-smoke.yml` não rodam em push e não foram tocados.

- **A cobertura não muda:** toda mudança segue verificada antes do merge (pelo `pull_request`) e
  push direto na `main` segue coberto (pelo `push`).
- **Custo aceito, registrado onde dói:** push numa branch **sem PR aberto** não dispara mais nada.
  Antes disparava, e era um sinal que se usava — nesta própria sessão o veredito do CI foi lido no
  push, antes de o PR existir. Mitigação no mesmo commit: `workflow_dispatch` acrescentado a `ci`,
  `views` e `semgrep` (o `deriva` e o `db-checks` já tinham), então dá para disparar à mão pela aba
  Actions. Para o gate leve, `node tests/check.js` local continua sendo a resposta mais rápida.
- Em repo **público** o ganho é tempo e ruído, não dinheiro (minutos ilimitados). O valor de
  dinheiro só volta se o repositório voltar a ser privado — ver o PR 4.
- `CLAUDE.md` passo 1 acertado junto: diz onde cada gate dispara, e que "quatro workflows" é o
  que entra num diff comum — os outros três são de cron.

## 30/07/2026 — A guarda `[2b]` passou a varrer os comentários dos workflows

PRs 3 e 2 do plano acordado na auditoria preliminar de 30/07/2026
(`docs/historico/handoff-2026-07-30-auditoria-verificacao.md`, achado **D**). Feitos **nesta ordem** de
propósito: primeiro a guarda, para provar contra o caso real que ela pega; depois a correção.

- **A guarda (PR 3).** A seção `[2b]` do `tests/check.js` varria só `.md`. Comentário de workflow
  é prosa viva que ninguém relê — não abre em leitor de markdown —, e por isso o `views.yml` pôde
  afirmar "23 views" e "~62% do app.js" com o gate verde. Agora os `.github/workflows/*.yml`
  entram na conferência de **fatos numéricos** (só nela: link markdown e `SB_URL` não são a
  linguagem deles). Três mudanças de mecanismo: `doc` do `FATOS` aceita **lista** de arquivos (nos
  workflows, o diretório inteiro — se a frase migrar de arquivo, continua coberta); em `.yml` o
  marcador `#` sai **antes** de normalizar o espaço, senão frase quebrada em duas linhas nunca
  casa o regex e a guarda passa **cega**, que é pior que não existir; e **toda ocorrência** é
  conferida, não só a primeira.
- **A correção (PR 2).** `views.yml`: **23 → 17 views** (nas três linhas que afirmavam isso) e
  **~62% → ~59,5%** da seção MODAL. `docs/seguranca.md` §9.1: dizia que os defaults do
  `supabase_admin` "só atingem objetos criados por esse role; o painel cria como `postgres`, que
  já está fechado" — a medição de 28/07 desmentiu (18 tabelas nasceram com TRUNCATE/REFERENCES/
  TRIGGER para `anon`, **108 grants**), o `CLAUDE.md` foi atualizado e o §9.1 ficou para trás no
  commit `ead1d67`. O documento que o dono lê **subestimava** o risco que justifica o gate diário.
- **Medido, não presumido:** o gate ficou **vermelho** nas 4 divergências antes do PR 2 e **verde**
  depois (13/13 afirmações, 15 ocorrências). Conserto parcial (uma das três linhas) segue vermelho;
  apagar a frase inteira dá "não achei a afirmação", não silêncio.
- O percentual **~59,5%** é o medido hoje, não os ~58,8% que o handoff registrou: o `app.js` mudou
  entre a auditoria e esta sessão. As menções a ~58,8% em `CLAUDE.md` e `estrutura-frontend.md`
  seguem dentro da tolerância de 1,5 ponto e não foram tocadas.

## 30/07/2026 — Rótulos dos tópicos do painel lateral

- Os rótulos visíveis passaram de **Documentos da Linha** para **Linhas**, de **Empresas** para
  **Empresa** e de **Consultas de Ligações** para **Itinerários**; o botão **Buscar Linha** passou
  a **Buscar**. As `key` (`doc`, `emp`, `lig`, `ger`) e as rotas `#/topico/<key>` permaneceram
  intactas — só o campo `name` de `SECTIONS` e o rótulo literal do botão em `renderSideNav`.
- Correção no mesmo dia (PR #81 sobre o #80): a primeira leitura do pedido pôs **Itinerários** no
  tópico `doc` e **Ligações** no `lig`, invertendo os dois. Além de errado, criava colisão com o
  card **Itinerários** que vive dentro do `doc`. Os nomes acima são os corretos: **Linhas** é o
  tópico dos documentos de UMA linha; **Itinerários** é o das consultas por logradouro, terminal,
  localidade e município.
- Nenhum gate do repo casa esses rótulos por texto (navegam por `data-view` e por `key`), então a
  renomeação não exigiu ajuste em `tests/` nem em `scripts/`.

## 30/07/2026 — Tópico `lig` renomeado para "Consultas"

- O tópico passou de **Itinerários** para **Consultas**; o card **Itinerários** dentro dele fica.
  Some a repetição do nome entre tópico e card. Só o `name` de `SECTIONS` mudou — a `key` `lig` e
  a rota `#/topico/lig` seguem intactas.
- **Atenção visual:** a sidebar já tem a etiqueta fixa **CONSULTAS** acima da lista de tópicos
  (`side-eyebrow`, em `renderSideNav`). Agora ela e um dos tópicos têm o mesmo texto. Não é bug —
  a etiqueta some no mobile (`display:none` no `@media`) —, mas se incomodar no desktop o
  conserto é apagar a etiqueta ou trocar seu texto.

## 30/07/2026 — Card "Itinerários" movido para o tópico Itinerários (depois renomeado)

- Removido do tópico **Linhas** (PR #82) e **restaurado dentro do tópico Itinerários** (`lig`),
  como primeiro card. Loader, render, ícone `route`, `VIEW_TABLES` e a entrada no
  `check_views.mjs` voltaram intactos — o deep link `#/consulta/itinerarios` volta a resolver, e
  `VIEW_TOPIC.itinerarios` agora aponta para `lig`, então o card é destacado no tópico certo pela
  busca do topo. Views do `check_views.mjs`: **16 → 17** de novo.
- `desc` dos dois tópicos acertadas junto: a de `doc` não anuncia mais "Itinerário" (o card saiu
  de lá) e a de `lig` passou a anunciar o percurso além das buscas.
- O tópico e seu primeiro card passam a ter o **mesmo nome** — decisão consciente do dono, não
  descuido: o card é o documento do percurso de UMA linha, os outros são buscas que partem de
  logradouro/terminal/localidade.

## 26/06/2026 — Auditoria de segurança (escrita fechada de verdade)

- **Escrita revogada** de `anon` e `authenticated` em todas as tabelas (INSERT/UPDATE/DELETE/
  TRUNCATE/REFERENCES/TRIGGER) + `ALTER DEFAULT PRIVILEGES` para tabelas futuras não voltarem
  a conceder escrita. Desde então **não há caminho de escrita pela API pública**.
- **16 policies `auth_all_*` dropadas** (eram `ALL USING(true) WITH CHECK(true)` — davam escrita
  total a qualquer usuário logado).
- Índices **btree + trigram (`pg_trgm`)** nas colunas de filtro.
- O snapshot de segurança pré-endurecimento gerado nesse dia ficou **obsoleto** — restaurá-lo
  reabriria as brechas; a baseline válida é `docs/backup_schema.sql`.

## 15/07/2026 — PKs e permissões de staging

- **PRIMARY KEY em todas as tabelas.** Onde já havia coluna única (`id`, `cod_ibge`,
  `cod_origem`, `ordem_importacao`), a PK foi promovida sobre ela (sem mudar a forma → ETL
  intacto). As 3 grandes com `id` repetido (`itinerario_teste`, `qh_intervalo_teste`,
  `qh_predeterminado_teste`) ganharam **`row_id` bigint GENERATED ALWAYS AS IDENTITY** (o `id`
  original ficou porque o front ordena por ele).
- FK `fk_tarifa_linha` com índice de cobertura `idx_tarifa_codempresa_codlinha`.
- **Staging do ETL sem grant** para `anon`/`authenticated` (invisíveis pela API pública).

## 16/07/2026 — Realtime completo + runbook de backup

- **6 tabelas centrais** que faltavam entraram na publicação `supabase_realtime` (a atualização
  ao vivo estava quebrada para elas); `VIEW_TABLES` passou a listar também as tabelas lidas por
  baixo via lookups (bug: mudança em lookup não recarregava a tela).
- Runbook **`docs/backup.md`** + baseline **`docs/backup_schema.sql`** + script
  **`scripts/backup_rest.mjs`** (o projeto está no plano Free, sem PITR).
- Relatório: `docs/historico/revisao-externa-2026-07-16.md`.

## 17/07/2026 — Vendoring do supabase-js + renames de schema

- **supabase-js vendorado** em `vendor/supabase-js-2.110.7.min.js` (antes: jsDelivr `@2` sem
  versão fixa nem SRI); jsDelivr saiu da CSP.
- **Desambiguação** `cod_origem` (terminal/origem) × `cod_municipio_origem` (IBGE em
  `itinerario_teste`; antes se chamava `cod_origem`) e typo `cod_origen` corrigido em
  `qh_intervalo_teste`. Índices e `divat_linhas_regiao` acompanharam (`docs/schema.md`).
- Args `tables:[...]` mortos removidos das chamadas de `searchPanel`.
- Relatório: `docs/historico/revisao-externa-2026-07-17.md`.

## 18/07/2026 — Paginação de tela + PDF inteiro

- Listas longas paginadas (25/pág) por `paginateTable`/`paginateLines`; o PDF continua saindo
  **inteiro** (`currentView.pdfHTML` com a lista completa). Corte de 300 no cliente em
  `lineResults` removido. Detalhes: `docs/estrutura-frontend.md` §4.

## 21/07/2026 — Endurecimento final (revisão de arquitetura)

Plano completo em `docs/historico/plano-endurecimento-2026-07-21.md`. Em resumo:

1. **Backup automático**: workflow `.github/workflows/backup.yml` (semanal + manual) roda o
   `backup_rest.mjs` em **modo público** (anon key, 14 tabelas, sem staging), artifact 90 dias.
   O script ganhou os modos completo/público.
2. **Fontes vendoradas** em `vendor/fonts/` (Archivo, IBM Plex Mono/Sans, subset latin, via
   pacotes `@fontsource` 5.3.0); Google Fonts saiu do runtime e da CSP (`font-src 'self'`).
3. **JS extraído para `app.js`** (byte a byte) e **CSP `script-src 'self'`** — fim do
   `'unsafe-inline'` de script. `checarNovaVersao` compara os ETags de `index.html` **e**
   `app.js`; `tests/check.js` compila o `app.js` e **falha** se voltar `<script>` inline no
   HTML; `realtime.test.js`/`check_realtime.mjs` extraem literais do `app.js`.
   Racional: `docs/estrutura-frontend.md` §1.
4. **`pgrst.db_max_rows = 30000`** no role `authenticator` (teto do PostgREST = maior `limit`
   do front).
5. **U+FFFD zerado no banco**: 41 rótulos de `evento_empresa_teste` + 6 textos longos (eventos/
   portarias, finais e staging) + 1 tarifa + 1 `dia_semana` restaurados (contexto inequívoco,
   padrões Latin-1/UTF-8 de mojibake). Único juízo editorial: `evento_empresa_teste.row_id=48`
   era "Suspenção de Intervenção" (typo da origem) → restaurado como "Suspensão de Intervenção".
   **Atenção ETL:** reimportar com encoding errado recria o problema — importar sempre UTF-8.
6. **Docs**: este CHANGELOG criado; `CLAUDE.md` enxuto (só estado atual + regras); fluxo de
   trabalho passa a ser **branch → preview do Vercel → merge na `main`**.

## 22/07/2026 — Profissionalização do frontend (UX, rotas, CSS próprio)

Revisão completa do frontend (branch `claude/frontend-review-2sty95`, avaliada em preview antes
do merge). Nenhuma mudança de banco. Em resumo:

1. **Rotas por hash** (seção `ROTAS (hash)` no `app.js`): `#/linha/<codlinha>`,
   `#/consulta/<view>` e a combinação. Links compartilháveis/favoritáveis, deep link na
   entrada, e o **Voltar do navegador fecha o modal** (abertura cria UMA entrada de histórico;
   trocas de view internas usam `replaceState`).
2. **CSS extraído para `styles.css`** (o `<style>` do `index.html` saiu; `style-src` segue com
   `'unsafe-inline'` por causa dos `style=""` dinâmicos — accents dos cards e larguras de `th`).
   Os ~30 estilos inline REPETIDOS dos templates viraram classes (`.doc-h3`, `.doc-note`,
   `.doc-count`, `.fd-*`, `.qh-*`, `.doc-obs.tight` etc.). `checarNovaVersao` vigia agora
   **3 ETags** (`index.html`, `app.js`, `styles.css`).
3. **`esc()` também escapa `'`** (`&#39;`) — remove a classe de bug dos atributos single-quoted
   (os `.replace(/'/g,…)` manuais saíram); cópia no `tests/pure.harness.js` atualizada + teste.
4. **`app.js` num IIFE** (nada vaza p/ `window`) e **logo DETRO (SVG ~280 linhas) saiu do JS**
   — vive inline no `#brandLogo` do `index.html`; `docHead` reusa o markup e a cor vem da
   classe `.brand-logo-doc` (fim do `replace(currentColor)`).
5. **supabase-js injetado dinamicamente** pelo `app.js` (só serve o Realtime; script dinâmico é
   async → não bloqueia a primeira pintura). A tag `<script>` dele saiu do `index.html`.
6. **Busca do topo**: busca-enquanto-digita (debounce 300 ms, ≥2 caracteres), navegação por
   teclado (↓/↑/Esc), semântica de combobox (`aria-expanded` etc.) e **consultas no dropdown**
   (digitar "tarifa" acha o card Tarifas — `matchViews`/`VIEW_META`).
7. **Cards**: descrições diferenciadas (a instrução repetida "Busque a linha…" saiu), documentos
   mais usados primeiro, ícones exclusivos (`histEmp`, `fleet`, `ruler`), chip visível nos cards
   que exigem linha ("Requer linha selecionada" → "Linha <nº>" quando há linha ativa) e modo
   compacto no celular (linha única, sem descrição — menos rolagem).
8. **Sem detalhe interno na UI pública**: rodapé sem "Supabase"/"bd_teste" (carimbo `#verTag`
   continua, discreto) e rodapés de documento sem nome de tabela (`tabela_vista_teste` etc. →
   "cadastro DETRO-RJ · DIVAT").
9. **A11y**: toasts com `role="status"` (leitores de tela anunciam avisos e o "Atualizado ao
   vivo").
10. **PWA mínimo**: `manifest.webmanifest` + `vendor/icon.svg` (instalável na tela inicial;
    sem service worker).

## 23/07/2026 — Revisão de segurança guiada pelo checklist do CyberSources

Revisão pontual do frontend e da postura do Supabase, adaptando ao formato do site (estático +
PostgREST, sem servidor próprio) a fatia de "Web Testing/Reconnaissance" do catálogo de
ferramentas [bst04/CyberSources](https://github.com/bst04/CyberSources). Escopo somente-leitura
(headers HTTP, GRANTs/RLS via SQL e Security Advisor, varredura estática de XSS/injeção de
filtro no `app.js`, segredos nos arquivos servidos); nenhuma escrita real foi tentada contra a
API pública (rede de saída bloqueada no ambiente da revisão) — compensado consultando os GRANTs
direto no Postgres, prova mais forte que um teste de caixa-preta.

- **Único achado (médio): HTML injection refletido em 2 telas.** `pesquisaEvento`
  (`app.js`, Pesquisa de Evento) e `mostrarLinhasPorLocalidade` (`app.js`, Ligações por
  Localidade/Município) concatenavam o termo de busca do usuário direto em `innerHTML` na
  mensagem de "nenhum resultado", sem passar por `esc()` — ao contrário do resto do arquivo
  (~150 outros pontos escapam corretamente). Em Localidade/Município a inconsistência era
  visível na própria função: a variável `b` era escapada numa branch e não na outra. A CSP
  `script-src 'self'` (sem `unsafe-inline`) já impedia execução de JS por esse vetor (handlers
  inline como `onerror=` são bloqueados pelo navegador), então o risco real era injeção de HTML
  morto/link de phishing dentro do resultado de busca, não roubo de sessão. **Corrigido**:
  `term`/`a`/`b` agora passam por `esc()` nos dois pontos, igual ao padrão do resto do arquivo —
  diff de 2 linhas, `node tests/check.js` verde (259/259 testes) depois da mudança.
- **Confirmado sem achado**: GRANTs do Postgres mostram só `SELECT` para `anon`/
  `authenticated` em todas as 18 tabelas públicas (zero INSERT/UPDATE/DELETE);
  `rolbypassrls=false` para os dois (só `service_role` ignora RLS); as 4 tabelas de staging do
  ETL seguem "RLS ativo, sem policy" — o padrão intencional já documentado, não uma falha;
  nenhuma chave `service_role` embutida nos arquivos servidos; `ilikeTerm()` neutraliza
  injeção no agrupador `or=(...)` do PostgREST; headers de segurança (CSP, HSTS,
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`) completos no
  `vercel.json`.
- O hash do `vendor/supabase-js-2.110.7.min.js` não foi reconferido contra o pacote oficial do
  npm nesta revisão.

## 23/07/2026 — Home vira painel lateral (sidebar de tópicos)

- **Home de cards → painel lateral fixo.** A grade de seções empilhadas deu lugar a uma
  **sidebar de tópicos** (nav navy à esquerda) + **painel de conteúdo** que mostra os cards do
  tópico ativo. A casca é montada uma vez e preenchida por `selectTopic`; a seção `RENDER CARDS`
  do `app.js` passou a ter `renderSideNav`/`renderSideContent` (mapa de código no `CLAUDE.md`
  atualizado).
- **Tópico "Gerenciais e Pesquisa" renomeado para "Portarias".** Cor de acento **unificada**
  (mesmo azul de "Documentos da Linha") em todos os cards e no destaque do tópico ativo — parou
  de variar por família.
- **Rota nova `#/topico/<key>`** (deep link do tópico ativo no painel; omitida quando é o
  padrão). Convive com `#/linha/…` e `#/consulta/…`; a busca do topo leva ao tópico dono e
  **realça** o card (sem abrir o documento sozinho).
- **Sub-lista da sidebar só abre por clique explícito** no tópico (nunca sozinha ao virar o
  tópico atual). No **mobile** a sidebar vira faixa horizontal de ícones e a sub-lista some;
  `renderSideNav` faz `scrollIntoView` do tópico ativo para o destaque não ficar fora da faixa
  (deep link / busca).
- **Fix de dado na tela de Tarifas:** "Piso I" é **quilometragem** (extensão da seção), não
  valor — passou a exibir `… km` em vez de `R$ …`.
- `node tests/check.js` verde (260/260). Sem mudança de schema/Realtime — só frontend.

## 24/07/2026 — Aba nova deixa de ser beco sem saída (seletor de documentos no pane)

- **Bug:** a aba aberta pelo "+" achava a linha e parava num aviso *"escolha um documento no
  painel lateral"* — instrução impossível de cumprir. O painel lateral vive no `#app`, e o
  `.modal-overlay` (`position:fixed; inset:0; z-index:1000`) cobre a viewport inteira enquanto
  o modal está aberto: **nenhum clique chega nos cards**. Pelo mesmo motivo não dava pra ter
  dois assuntos abertos ao mesmo tempo (Quadro de Horários + Portarias), já que o único caminho
  pra isso — o ícone "abrir em nova aba" do card (`openViewInNewTab`) — também está atrás do
  overlay. Não era regressão: o aviso nasceu junto com a faixa de abas (`a8f95bb`) e o overlay
  nunca teve exceção de `pointer-events`; era funcionalidade entregue pela metade.
- **Conserto:** `renderTabChooser` desenha o **seletor de documentos dentro do próprio pane**,
  com TODOS os tópicos (não só "Documentos da Linha" — é o que alcança os cards que não exigem
  linha, como Portarias) e reusando `topicGridHTML`, o mesmo markup/CSS dos cards do painel.
  Escolher um documento **substitui a view daquela aba** (o `openView` de sempre, que roda na
  aba ativa) — é o que preenche a aba em branco; aba nova continua nascendo só pelo "+" ou pelo
  ícone/clique-do-meio no card. O seletor aparece com ou sem linha selecionada.
- **Delegação de clique nova em `modalBodyWrap`**: o listener dos cards mora no `#app`, e o
  modal é **irmão** do `#app` — cliques dentro do modal nunca subiriam até lá. Delegado no wrap
  (não num pane) pelo mesmo motivo do `keydown` de linhas clicáveis: panes de aba são criados e
  destruídos.
- **`scripts/check_abas.mjs`** (novo): checagem de regressão em navegador headless (Playwright),
  com o PostgREST stubado — determinística e sem acesso ao Supabase. Fora do CI, no mesmo
  contrato manual do `check_realtime.mjs`, porque `tests/check.js` é offline e sem dependências
  de propósito. Verificada vermelha no código anterior e verde depois do conserto.
- `node tests/check.js` verde (331/331). Sem mudança de schema/Realtime — só frontend.

## 25/07/2026 — Semgrep (análise estática) instalado

Runbook completo: **`docs/semgrep.md`**.

- **Por que:** o `tests/check.js` só **compila** o `app.js`, nunca o executa — então um
  `eval`/`new Function` passa verde por ele e só morre no navegador do usuário, onde a CSP
  (`script-src 'self'`, sem `'unsafe-eval'`) bloqueia. Essa faixa — "padrão que o gate atual
  não consegue ver" — é o que o Semgrep cobre. Os dois gates ficam **separados de propósito**
  (`ci.yml` × `semgrep.yml`): o `check.js` é Node puro e sem dependências, e vale manter assim.
- **4 regras locais** em `.semgrep/rules/divat.yml`, escritas para invariantes já documentados
  no `CLAUDE.md` que nenhum ruleset genérico conhece: `currentView.pdfHTML` atribuído fora do
  seam (a corrida que faz o PDF sair da linha errada), `eval`/`new Function`, `setTimeout` com
  string, e CDN externo em runtime (tudo é vendorado; a CSP bloquearia).
- **As regras têm teste** (`.semgrep/tests/divat.js`, `./scripts/semgrep.sh --test`): cada uma
  com o caso ruim **e** o bom, então falha tanto se parar de pegar quanto se virar falso
  positivo. 4/4 verdes.
- **`scripts/semgrep.sh`** com o padrão **offline** (só regras locais) e `--full` para somar os
  rulesets do registry (`p/javascript`, `p/xss`, `p/secrets`, `p/github-actions`). A separação
  não é estética: `semgrep.dev` é inalcançável do ambiente do agente Claude (mesma política de
  rede que barra o `vercel` CLI), então o modo que roda **em qualquer lugar** é o padrão.
- **`.github/workflows/semgrep.yml`** em push e PR, com a versão **fixa** (`semgrep==1.171.0`),
  mesma disciplina do supabase-js vendorado — versão nova traz regra nova e deixaria vermelho
  um PR que não mexeu em nada disso. Sem SARIF/Code Scanning (exige Advanced Security, que o
  repo privado no plano free não tem).
- **Repo limpo:** 0 achados nas regras locais. A única exceção é um `nosemgrep` **justificado**
  em `tests/realtime.test.js` — o `new Function` ali roda no Node (não é servido ao navegador,
  a CSP não se aplica) e o alvo é um literal puro recortado do `app.js`.
- `node tests/check.js` verde (331/331). Sem mudança de schema/Realtime — nada do portal servido
  mudou (só o teste ganhou um comentário).

### Adendo — actions presas ao SHA (mesmo dia)

O primeiro CI com os rulesets públicos veio **vermelho**: `github-actions-mutable-action-tag`,
7 ocorrências nos 3 workflows (`actions/checkout@v4` e cia.). Tag é ponteiro **móvel** — quem
controla a action pode repontar `v4` e o CI passa a rodar outro código sem nada mudar no repo
(foi o que houve nos incidentes do `trivy-action` e do `kics-github-action`). É o **mesmo
raciocínio que tirou o jsDelivr `@2`** em 17/07. Os 7 `uses:` foram presos ao SHA de 40
caracteres, com a tag ao lado só como legenda. Contrapartida assumida: sem Dependabot, a
atualização vira **manual** — o procedimento está em `docs/semgrep.md` § "Actions presas ao
SHA". A metade offline do scan já tinha passado; foi só essa regra.

## 26/07/2026 — Laço de fumaça sobre as 23 views (rede sob o render)

**Motivação.** O `tests/check.js` é offline e sem dependências de propósito, então só cobre a
lógica **pura** copiada nos `*.harness.js` (~224 linhas). A seção `MODAL / SISTEMA DE VIEWS`
ocupa as linhas 636–2591 do `app.js` — **~62% do arquivo, todo o render** — e não tinha
nenhuma checagem automatizada além do `check_abas.mjs`, que cobre só as abas. Ou seja: uma
view podia passar a explodir ou a pintar em branco e **nada acusaria** até um usuário abrir.

**O que entrou.**

- **`scripts/lib/rig.mjs`** — bancada compartilhada: servidor estático, Chromium headless,
  placar, e as **fixtures do PostgREST em definição única** (uma linha plausível por tabela das
  14 lidas pelo portal + stub das 2 RPCs, `divat_busca_logradouro` e `divat_linhas_regiao`).
  Extraída de dentro do `check_abas.mjs` justamente para as fixtures não divergirem em duas
  cópias — o modo de falha que o `CLAUDE.md` chama de "cópias que divergem".
- **`scripts/check_views.mjs`** — abre as 23 views por deep link, digita um termo que casa as
  fixtures quando há painel de busca, e falha se a view lançar erro (`errorBox`), ficar presa
  no spinner, pintar **só a moldura** ou não achar nada. Um laço genérico em vez de 23 testes
  escritos à mão. Fecha com uma checagem **anti-drift**: view no seletor que não esteja em
  `VIEWS` derruba o script.
- **`check_abas.mjs` migrado** para o rig (assertions inalteradas, segue verde).

**Resultado.** 23/23 verdes — **nenhum defeito encontrado** no `app.js`. Os 4 vermelhos da
primeira execução eram todos defeito **do teste**, e cada um ensinou algo que virou regra:
`secoesPorEmpresa` pede **código** de empresa (não nome); `ligacoesPorLogradouro` e
`municipioRegiao` passam por **RPC**, não por tabela; `localidades` tem formulário próprio
(`#locA`/`#locGo`), não o painel padrão; e documentos como o Histórico renderizam **blocos, não
`<table>`** — contar tabelas era a asserção errada.

**Validado por mutação** (a checagem só vale se souber ficar vermelha): um `null.x` dentro de
`LOADERS.frota` foi pego com a mensagem exata e **sem** contaminar as outras 22; um
`renderFrota` devolvendo vazio **passou** na primeira versão — a moldura (cabeçalho + campo de
busca) contava como "pane não-vazio". Daí a medição virar o **corpo** do documento
(`#spHost`/`#locHost`), não o pane. Só depois disso a mutação foi pega.

**Escopo deliberadamente de fora:** conferir se o conteúdo está **certo** (colunas, totais) —
isso é asserção por view. E o script fica **fora do CI**, como o `check_abas.mjs` e o
`check_realtime.mjs`: exige Playwright, que o `check.js` não tem. *(Essa última parte durou um
dia — ver a entrada seguinte.)*

## 26/07/2026 — O laço de fumaça no CI (`views.yml`)

**Motivação.** A fatia 0 (acima) deixou o `check_views.mjs` pronto, mas **manual**: valia
enquanto alguém lembrasse de rodá-lo antes do push. Checagem que depende de memória humana é
checagem que um dia não roda — e o buraco que ela cobre (~62% do `app.js`, todo o render) é
grande demais para ficar nessa dependência.

**O que entrou.** **`.github/workflows/views.yml`**, em todo push e PR: instala o Playwright
(**versão fixa**, `playwright@1.56.1`) + Chromium e roda **`check_views.mjs`** e
**`check_abas.mjs`** — os dois usam o mesmo rig e o mesmo navegador, então o segundo sai quase
de graça depois de instalado.

**Job/arquivo separado, decisão de projeto.** O `ci.yml` roda `node tests/check.js` — Node puro,
sem dependências, segundos; essa leveza é uma propriedade que o repo valoriza e está escrita no
cabeçalho do próprio workflow. Playwright + Chromium custam ~1 min só de instalação. Pendurar
isso no job `check` transformaria o gate rápido num gate lento, então o navegador roda **ao
lado** — mesma disciplina do `semgrep.yml`, e um vermelho não esconde o resultado do outro. São
três workflows hoje: `ci.yml` (leve), `views.yml` (navegador), `semgrep.yml` (estático).

**Detalhes com motivo:**
- **Versão do Playwright fixa**, como o Semgrep e o supabase-js vendorado: subir é uma decisão,
  não efeito colateral de um push qualquer.
- **`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** na instalação global, e só então
  `playwright install --with-deps chromium` — evita baixar os três navegadores quando os
  scripts usam um. Sem `--with-deps` o Chromium não sobe no runner do GitHub.
- **Instalação global** (`npm i -g`) porque o repo é zero-build (não há `package.json`) e o
  `rig.mjs` procura o Playwright no `npm root -g`.
- **Sem cache do Chromium:** os `uses:` do repo são presos ao **SHA de 40 caracteres** (regra de
  26/07, adendo acima) e não havia como resolver o SHA do `actions/cache` no ambiente onde o
  workflow foi escrito — inventar SHA seria pior que não cachear. `playwright install` leva
  ~30 s num job de ~2 min; se um dia incomodar, some o cache com o SHA conferido à mão.

**Verificação.** Gate local verde antes do commit (`check.js` 331/331, 23/23 views, abas OK) e
**resultado real conferido no GitHub Actions** depois do push — workflow que ninguém olhou não
está provado, e o falso verde clássico é o job que passa por não ter rodado nada.

**Nada servido ao usuário mudou** (só CI e documentação) — sem deploy e sem bump do carimbo de
versão. A fatia 1 (asserções de **conteúdo** por view) segue adiada por decisão do dono.

### Fecho do dia 26/07 — o que o dia inteiro foi (e o que ficou decidido)

As duas entradas acima são o **quê**. Isto é o **porquê**, registrado aqui porque o documento
onde ele morava (`docs/handoff-fatia2-ci.md`) era transitório de propósito e foi apagado ao fim
da fatia 2 — sem isto, a decisão se perderia junto com ele.

**De onde veio.** O dono levantou um medo: *"tenho medo do meu projeto estar todo bonito por
fora e podre por dentro, e eu não sei como resolver"*. A conversa concluiu que o medo era
**epistêmico** — falta de visibilidade — e não estrutural: não havia sinal de podridão, havia
ausência de instrumento capaz de dizer que não há. E a consequência disso é que **laudo não
resolve pergunta contínua**: uma auditoria responde "hoje está de pé" e envelhece no dia
seguinte. Só instrumento — que roda sozinho, de novo, a cada mudança — responde a pergunta na
forma em que ela foi feita.

**O plano, em três fatias.**

| Fatia | O que | Estado ao fim do dia |
|---|---|---|
| **0** | Laço de fumaça sobre as 23 views (`check_views.mjs` + `rig.mjs`) | ✅ `73f0d37` |
| **2** | Pôr o laço no CI, rodando sozinho a cada push (`views.yml`) | ✅ `c7b6177` (PR #60) |
| 1 | Asserções de **conteúdo** por view ("está certo?", não só "está de pé?") | **adiada** — ver o gatilho abaixo |

A ordem (0 → 2 → 1) não foi acidente: primeiro o instrumento, depois a automação que garante
que ele roda, e só então — se fizer falta — o refinamento do que ele mede.

**Por que a fatia 1 ficou adiada, e qual é o gatilho para retomá-la.** O laço rodou 23/23 sem
achar nada: não existe, hoje, **um caso concreto** de dado errado que passou despercebido numa
tela. Escrever 23 asserções de conteúdo sem esse caso é adivinhar o que vai quebrar — e
asserção adivinhada é a que quebra por mudança legítima e treina todo mundo a ignorar o
vermelho. **Gatilho:** no dia em que aparecer na mão um dado errado numa view, escreva a
asserção *daquela* view, nascida do erro real. Uma de cada vez, pagas pelo defeito que as
justificou.

**Estado do CI ao fim do dia — três workflows, separados de propósito** (um vermelho não
esconde o resultado do outro):

| Workflow | O que pergunta | Custo |
|---|---|---|
| `ci.yml` | "faz o que deve?" — sintaxe, anti-drift, lógica pura (Node puro, sem dependências) | ~14 s |
| `views.yml` | "alguma tela explode ou fica em branco?" — 23 views + abas, em navegador | ~46 s |
| `semgrep.yml` | "contém padrão proibido?" — regras locais + rulesets públicos | ~34 s |

**Pendências abertas encontradas no caminho** (nenhuma urgente, nenhuma bloqueia nada):
1. **Node 20 depreciado nas actions.** O runner avisa que `actions/checkout` e
   `actions/setup-node` têm como alvo o Node 20 e estão sendo forçadas para o Node 24 — vale
   para os **três** workflows, não só o novo. Nada quebrou; um dia vira erro. Consertar = subir
   a versão das actions **e o SHA junto** (`docs/semgrep.md` § "Actions presas ao SHA").
2. **Cache do Chromium no `views.yml`.** Ficou de fora porque não havia como resolver o SHA do
   `actions/cache` no ambiente onde o workflow foi escrito, e SHA inventado é pior que cache
   nenhum. Economizaria ~20 s num job de ~46 s — cosmético.

## 26/07/2026 — Auditoria docs×banco: estoque corrigido, guarda instalada

Uma auditoria contra o catálogo do Postgres do projeto vivo achou **8 divergências** entre o
que os docs afirmam e o que o banco é — todas com a mesma origem: um fato copiado à mão para
`CLAUDE.md`/`docs/schema.md`/`docs/seguranca.md`/`docs/backup_schema.sql` e nunca mais
conferido. Os tickets (`.scratch/doc-drift/`) foram implementados em sequência:

- **Docs (tickets 01–04):** `CLAUDE.md` citava duas tabelas que não existem
  (os nomes certos são `municipio_teste` e `origem_teste`); `schema.md` afirmava unicidade de
  `codempresa` que o banco não garante (índice btree comum — unicidade é convenção do ETL),
  apontava o código para o `index.html` (vive no `app.js` desde sempre, com nomes de função
  que também tinham driftado) e não documentava **nenhuma** das 6 funções nem o trigger
  `trg_vigor_auto` — ganhou a seção "Funções e trigger".
- **Banco (ticket 05):** `divat_busca_logradouro` era a única função sem `SET search_path`
  (o doc de segurança já dizia "fixo" — agora é verdade). `ALTER FUNCTION ... SET search_path`
  aplicado via migration; advisor do Supabase limpo; baseline atualizada.
- **Ticket 06 (parcial):** o `seguranca.md` dizia "a única função SQL pública" — eram 6 com
  EXECUTE para `anon`; o doc agora lista as que têm motivo. **Decisão que contraria a
  auditoria:** `divat_data_quality` NÃO foi revogada — a issue #63 (aberta no mesmo dia,
  antes da auditoria) planeja o runner semanal chamando-a exatamente como `anon`, e os grants
  atuais já são o estado final que a #63 prescreve. Sobrou 1 REVOKE (inócuo) pendente em
  `fn_vigor_auto`, bloqueado pela regra "backup fresco antes de REVOKE" (o ambiente do Claude
  não alcança o Supabase nem consegue disparar o workflow Backup — passo a passo no ticket).
  **Fechado no mesmo dia, a pedido do dono:** o backup fresco saiu por um workflow
  temporário disparado por push na branch (artifact `divat-backup-pre-revoke-30212757689`,
  90 dias; o workflow foi removido em seguida), e o REVOKE foi aplicado via migration e
  verificado — trigger disparando num UPDATE de teste (revertido), `anon` sem EXECUTE na
  função e com as RPCs do portal intactas (busca por logradouro e `realtime_tables` testadas
  como `anon`). Primeiro run real da regra "backup antes de REVOKE": funcionou, e o caminho
  do workflow-por-push fica registrado para a próxima vez que a integração não puder usar o
  dispatch manual.
- **Baseline (ticket 07):** ressincronizada com `pg_get_functiondef` do vivo. Além do previsto
  (faltava `divat_data_quality` inteira; `realtime_tables` é INVOKER, não DEFINER), a conferência
  achou mais duas: `f_unaccent` no banco usa `extensions.unaccent` com `search_path` fixado (a
  baseline dizia `public.unaccent`, o que quebraria a reconstrução) e `divat_linhas_regiao`
  também tem `search_path` que a baseline omitia.
- **Guarda (ticket 08):** `scripts/check_deriva.mjs` + workflow `deriva.yml` (semanal + sob
  demanda + push/PR nos arquivos relevantes). Compara a visão de `anon` do banco com os docs:
  cada uma das 4 checagens teria pego uma divergência real desta auditoria. Verificado numa
  bancada local (mock da API): verde no repo corrigido; reintroduzir um nome fantasma num doc
  deixa o script vermelho apontando arquivo:linha. **O 1º run no CI derrubou o plano
  original:** o ticket apostava no OpenAPI do PostgREST como fonte de fatos, mas neste
  projeto o endpoint é restrito à service_role (HTTP 401 com a anon key). Saída: a RPC
  `divat_api_shape()` (INVOKER, EXECUTE p/ anon — a alternativa que o próprio ticket previa),
  criada via migration e versionada na baseline; rodando como `anon`, devolve exatamente a
  visão de `anon` (tabelas/colunas via `information_schema`, RPCs via
  `has_function_privilege`), sem vazar nada que a API pública já não mostre.

Nada servido ao usuário mudou (docs + CI + metadado de função no banco) — sem deploy e sem
bump do carimbo.

## 27/07/2026 — 4ª auditoria externa: privilégios fecham por padrão, CSP fecha de vez

Chegou um relatório externo com 8 achados (SEC-01…SEC-08) e, depois, um **parecer de revisão do
próprio plano de correção**. Os 8 foram verificados contra o repo **e contra o banco vivo** — a
lição registrada no handoff anterior ("pergunte ao banco, não ao doc") virou método. Todos
procediam. Do parecer de revisão, 12 dos 14 pontos foram aceitos; **dois estavam errados**, e a
diferença mudou o que foi executado.

### O que o banco mostrou e nenhum dos dois relatórios podia ver

`pg_default_acl` tinha **dois** conjuntos de defaults para `public`. O do `postgres` concedia
`anon=rm` a tabelas novas — e o `CLAUDE.md` afirmava o **oposto** do que o SQL fazia ("um
`ALTER DEFAULT PRIVILEGES` garante que tabelas novas não voltem a conceder"; o comando
**concedia**). O `m` de `rm` é **MAINTAIN** (VACUUM/ANALYZE/CLUSTER/REINDEX/LOCK), não leitura —
daí `REVOKE ALL` e não `REVOKE SELECT`, ponto do parecer, aceito.

### A probe que derrubou a premissa dos dois relatórios

Antes de aplicar DDL, uma **probe em transação** (cria tabela/função/sequência descartáveis, mede
com `has_*_privilege`, `RAISE EXCEPTION` para desfazer) mostrou que, nas **funções**, os dois
relatórios miravam no alvo errado: pediam revogar `EXECUTE` de `PUBLIC`, mas o default do Supabase
**já excluía `PUBLIC`** — quem estava aberto era **`anon`**. Revogar só de `PUBLIC` não fecharia
nada, e uma função administrativa criada em `public` continuaria chamável pelo PostgREST. O revoke
aplicado inclui `anon`/`authenticated`; a probe confirmou o resultado (ACL final: `postgres` +
`service_role`).

O parecer também afirmava que `REVOKE EXECUTE` **não deve** usar `IN SCHEMA`, porque "revogação
limitada a schema não neutraliza o default global". A premissa está errada — `defaclacl` guarda a
ACL **completa** do objeto novo, não um delta (prova: a entrada de tabelas deste banco carregava
`postgres=arwdDxtm`, vindo do `acldefault`). Seguir a justificativa levaria a **pular** o escopo
que pega o caso real. Aplicados os dois escopos, e a decisão veio da probe, não do argumento.

### Aberto e aceito

`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` responde **`42501`** — `postgres` não é
superusuário no Supabase. Esse segundo conjunto de defaults concede escrita a `anon` e **não é
fechável**. Registrado em `docs/seguranca.md` §9.1; por causa dele o gate de segurança roda
**diariamente**, não semanalmente.

### O gate que sustenta tudo (SEC-04)

RLS, grants, policies e privilégios de função não eram verificados por **nada** — a conferência
era um checklist trimestral manual, e o dono alimenta o banco pelo painel com service role. Agora
há a RPC `divat_security_shape()` + `scripts/check_grants.mjs`, em job independente no
`db-checks.yml`. A RPC devolve **fatos derivados**, não ACL crua (ponto do parecer, e o mais
valioso dele): `proacl` nulo não é "sem acesso", é o *default* do PostgreSQL — um gate lendo ACL
crua trataria a função recém-criada, a mais perigosa, como a mais fechada. Bancada em
`tests/check_grants.rig.mjs`, 13 casos, **dois deles cobrindo fail-open**: RPC devolvendo lista
vazia ou faltando campo tem de **abortar**, não relatar "nenhum achado".

### Frontend: a CSP fecha (SEC-08)

A premissa que o handoff anterior deixou explicitamente por conferir foi **medida em Chromium
headless** antes de qualquer mudança: markup `style=` e `setAttribute('style')` são bloqueados;
CSSOM (`el.style.x`, `setProperty`) é permitido. (`cssText` **não** é bloqueado — correção ao
parecer.) Os 10 atributos saíram: os 4 de accent eram **sempre a mesma constante** e viraram
`--accent`/`--accent-soft` estáticos no `:root`; larguras de `<th>` viraram classes `.w-*`; os 3
`display:none` viraram `.is-hidden`, obrigando 8 sites de `.style.display` a virarem `classList`.
`vercel.json` passa a `style-src 'self'; style-src-attr 'none'`.

Como o sintoma de uma recaída é **mudo** (a regra simplesmente não acontece, sem erro no console),
foram três guardas: `tests/check.js` §[1] (cobre `index.html` **e** os templates do `app.js`, e
exige classe para toda largura declarada) e a regra Semgrep `divat-style-attr-quebra-csp`. As duas
primeiras foram testadas **plantando a recaída** e vendo o gate ficar vermelho.

E os gates de navegador passaram a servir a **CSP de produção, lida do `vercel.json`**. Rodavam
sem cabeçalho nenhum — num mundo mais permissivo que o real —, então jamais teriam pego uma
regressão de CSP.

### Achados que apareceram ao conferir (nenhum dos relatórios os viu)

- **A baseline de reconstrução não restaurava.** `docs/backup_schema.sql` criava `pg_trgm` e
  `unaccent` `WITH SCHEMA public`, mas as duas estão em `extensions` no banco e `f_unaccent` chama
  `extensions.unaccent` — num restore limpo a função quebra e o índice GIN não é criado.
- **O laço anti-drift estava fechado só pela metade.** A auditoria anterior cobriu o
  `pure.harness.js` e deixou o `harness.js` descoberto: **8 dos 9 exports sem guarda**, incluindo
  `marcarTrunc`/`bannerTrunc`, com 28 testes rodando contra cópias que nada garantia estarem
  atualizadas. Mesmo bug do `ilikeTerm`, um arquivo ao lado. A cobertura varre os dois agora.
- **`backup_rest.mjs` prometia o que não fazia:** o cabeçalho dizia "pagina pela PRIMARY KEY" e o
  código fazia `order=PK` + `offset`, que sob escrita concorrente pula ou duplica linha em
  silêncio. Virou keyset de verdade (com comparação lexicográfica à mão para a PK composta,
  porque o PostgREST não compara tupla), mais conferência contra `Content-Range` e SHA-256.
- **`backup.yml` afirmava que o repositório é público.** É privado.

### O que NÃO ficou encerrado

**SEC-02** e **SEC-06** ficam **mitigados**. A memoização e o cancelamento de busca reduzem a
carga que o *portal* gera, mas não são rate limiting — quem quiser abusar chama o PostgREST direto
com a anon key, que é pública por design; um controle real exigiria Edge Function ou gateway. E o
**restore nunca foi testado ponta a ponta**, apontado desde 16/07. Os dois estão em
`docs/seguranca.md` §9 para não serem redescobertos como novidade na próxima auditoria.

Carimbo: **build 27/07-A** (o Bloco 4 é o único que muda o que o usuário vê).

### Adendo do mesmo dia — o gate achou algo na primeira rodada real

Ao rodar o `check_grants.mjs` contra o payload de produção da RPC (e não contra fixtures), ele
ficou **vermelho**: `anon` e `authenticated` tinham **MAINTAIN** nas 18 tabelas. O `REVOKE ALL`
aplicado antes fechou os **defaults**, que valem só para objetos FUTUROS — as tabelas existentes
nasceram sob o default antigo `anon=rm` e guardaram o privilégio. Corrigido com
`REVOKE MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon, authenticated`.

Não havia caminho de abuso pela API pública (o PostgREST só faz CRUD, não `VACUUM`/`LOCK`), mas
era privilégio indevido num portal declaradamente somente-leitura — e é exatamente o que a
correção alegava ter removido. **Fechar o default não conserta o que já existe.**

## 30/07/2026 — 6 cards apagados + Portarias vira tópico-ação

- **6 cards removidos de vez** (loader, render, entrada em `SECTIONS`/`VIEW_TABLES` e ícone
  exclusivo, quando ficava com 0 usos): `folhaRosto` (Folha de Rosto), `folhaDivisoria` (Folha
  Divisória), `ligacoesPorNome` (Ligações pelo Nome), `ligacoesPorNumero` (Identificar pelo
  Número), `relatoriosGerenciais` (Relatórios Gerenciais, com a função pura `resumoRelatorio`) e
  `pesquisaEvento` (Pesquisa de Evento). Os ícones `divider`, `alpha`, `hash` e `chart` saíram do
  objeto `I` por terem ficado sem nenhum uso; `file` e `search` foram conferidos por grep e
  mantidos (servem outros lugares). `isLinhaAtiva` também foi conferido e mantido — `isVigente` e
  o card Empresas dependem dele, mesmo com `resumoRelatorio` fora.
- **Tópico "Portarias" virou tópico-ação**: continua com o mesmo nome na sidebar, mas perdeu a
  grade (só tinha um card real depois da remoção dos outros dois) e ganhou `direct:'portarias'`
  em `SECTIONS`. Clicar no tópico abre o modal de Portarias direto, sem pintar um grid vazio
  atrás — e o painel de fundo fica exatamente onde o usuário estava (não mexe em
  `currentTopicKey`/`expandedTopicKey`/hash). Os metadados do card (`VIEW_META.portarias`,
  `VIEW_TOPIC.portarias`) continuam existindo via um `directMeta` novo no `SECTIONS`, então o
  deep link `#/consulta/portarias` e a busca do topo continuam funcionando como antes.
  `applyRoute` passou a ignorar tópico com `direct` ao calcular o "tópico ativo do painel" (senão
  um `#/topico/ger` antigo, ou o dono do `view`, tentaria pintar uma grade vazia atrás do modal).
  O seletor de documentos da aba nova ("+") também foi ajustado — sem isso o card de Portarias
  teria sumido de lá junto com a grade do tópico.
- **17 views** no lugar de 23 — `scripts/check_views.mjs`, `tests/realtime.test.js`,
  `tests/pure.harness.js`/`pure.test.js` e o `canon` do `tests/check.js` atualizados junto; a
  guarda `[2b]` do `check.js` cobrou os números na prosa (`~23 views` → `~17`, `~60,4%` →
  `~58,8%` da seção `MODAL`, ambos deslocados pela remoção de código).
