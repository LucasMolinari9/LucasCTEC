/* O SEAM entre um documento e o shell — o único ponto de injeção de `src/documentos/`.

   Um documento que sai do `app.js` perde o acesso a coisas que só existem lá: a função que fala
   com a rede (`sbFetch`, `app.js:209`), as ações de shell (selecionar a linha, que repinta o
   banner, sincroniza a rota e a faixa de abas — `selectLine`, `app.js:725`), o fabricante de
   contexto para uma busca NOVA dentro do próprio documento (`novoCtx`, `app.js:1198` — geração
   nova + a linha ativa do momento, desde a C2) e, desde a C4, o dispatcher que abre uma view
   INTEIRA nova (`runView`, `app.js:1211` — chrome do modal: histórico, faixa de abas, foco).
   Nenhum dos quatro é markup, nenhum cabe num módulo de domínio.

   Por que UM módulo em vez de um `configurar*` por família (o padrão que a Fase B2 usou em
   `configurarDoc`/`configurarLookups`/`configurarListas`): as quatro famílias da Fase C precisam
   das MESMAS coisas. Quatro `configurar*` seriam quatro nomes a não colidir no `import` do
   `app.js`, quatro chamadas no bootstrap e quatro cópias do guard de "falha fechado". Aqui é uma
   chamada só, e os re-exports abaixo fazem os call sites dentro dos documentos ficarem IDÊNTICOS
   ao que eram no `app.js` — `sbFetch('evento_teste', …)`, `selecionarLinha(line)`,
   `novoCtx(view, pane, host)`, `runView({ title, tables, loader })` — o que é o ponto de um PR de
   refatoração: o corpo movido não muda.

   FALHA FECHADO, como os três da B2: sem `configurarDocumentos`, a primeira chamada LANÇA. Um
   documento que saísse mudo (sem rede, sem banner) pintaria uma tela vazia sem erro, que é o modo
   de falha invisível a todo gate deste repo.

   CRITÉRIO DE PARADA — este arquivo é onde ele se mede. O plano vivo
   (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`, seção "Critério de parada") diz que mais
   de ~6 dependências INJETADAS é sinal de parar e registrar. Como todas as famílias da Fase C
   passam por aqui, a conta é o número de slots deste módulo. A C2 acrescentou o TERCEIRO —
   `novoCtx` — porque o loader de Portarias monta um ctx novo a cada busca. A C4 acrescentou o
   QUARTO — `runView` — pelo motivo abaixo. Ainda longe do sétimo, mas registrado aqui porque é
   exatamente o tipo de crescimento que o critério pede para vigiar.

   POR QUE `runView` ENTROU AGORA, E NÃO FICOU "RESTRIÇÃO, NÃO DECISÃO" COMO NA C3: a C3 deixou
   `LOADERS.empresasRegulares`/`openEmpresaLigacoes` no `app.js` porque a dependência de `runView`
   era de uma função-FOLHA (só ela chamava `runView`, e só um loader a chamava) — deixar os dois
   para trás não bloqueava mais nada. Em `openLinhasPorIbge` (C4, "Linhas no Município") o mesmo
   `runView` é o CORAÇÃO do documento — sem ele o próprio drill-down município→linhas não existe
   — e três funções da família o chamam (`openLinhasPorIbge` mesma, o `munTable`/chips de
   `municipioRegiaoRun` e o atalho de `mostrarLinhasEntreMunicipios`, este último do LADO
   Localidades). Deixar `runView` de fora não teria poupado uma função pequena: teria mantido a
   família inteira presa ao `app.js`, porque nenhuma delas pode chamar de volta uma função que só
   existe lá (o `app.js` não exporta nada — `grep -c '^export ' app.js` = 0). Injetá-lo resolve
   a família inteira de uma vez, dentro do mesmo orçamento (4 de ~6).

   O QUE SAI DAQUI NA FASE B: `sbFetch` é andaime. Quando `src/data/rest.mjs` existir, o slot some
   e cada documento passa a importá-lo de lá — sem tocar em nenhum call site, porque o nome
   importado é o mesmo. `selecionarLinha`, `novoCtx` e `runView` são ação/leitura/dispatcher de
   shell de verdade e ficam até a Fase E. */

let _sbFetch = null;
let _selecionarLinha = null;
let _novoCtx = null;
let _runView = null;

export function configurarDocumentos({ sbFetch, selecionarLinha, novoCtx, runView }){
  _sbFetch = sbFetch;
  _selecionarLinha = selecionarLinha;
  _novoCtx = novoCtx;
  _runView = runView;
}

/* Acesso a dado (PostgREST). Assinatura idêntica à do `sbFetch` do app.js. */
export function sbFetch(tabela, qs){
  if (!_sbFetch) throw new Error('src/documentos: sbFetch não configurado — chame configurarDocumentos({ sbFetch, selecionarLinha, novoCtx, runView }) no bootstrap do app.js');
  return _sbFetch(tabela, qs);
}

/* Ação de shell: torna `row` a linha ativa (banner + rota + faixa de abas). */
export function selecionarLinha(row){
  if (!_selecionarLinha) throw new Error('src/documentos: selecionarLinha não configurada — chame configurarDocumentos({ sbFetch, selecionarLinha, novoCtx, runView }) no bootstrap do app.js');
  return _selecionarLinha(row);
}

/* Fabrica um ctx NOVO (geração nova + a linha ativa do momento) para uma busca dentro do próprio
   documento — o mesmo que o `novoCtx` do app.js faz para `runView`/`reloadTab`/`searchPanel`. */
export function novoCtx(view, pane, host){
  if (!_novoCtx) throw new Error('src/documentos: novoCtx não configurado — chame configurarDocumentos({ sbFetch, selecionarLinha, novoCtx, runView }) no bootstrap do app.js');
  return _novoCtx(view, pane, host);
}

/* Dispatcher de shell: abre uma view NOVA (troca o conteúdo do modal inteiro, empilha a anterior
   no histórico de navegação, atualiza a faixa de abas e o hash). Usado por documentos que fazem
   drill-down para outro documento — ex.: clicar num município dentro de "Município e Região"
   abre "Linhas no Município" como uma view nova, não uma troca de conteúdo dentro da mesma. */
export function runView(view){
  if (!_runView) throw new Error('src/documentos: runView não configurado — chame configurarDocumentos({ sbFetch, selecionarLinha, novoCtx, runView }) no bootstrap do app.js');
  return _runView(view);
}
