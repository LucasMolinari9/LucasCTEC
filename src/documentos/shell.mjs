/* O SEAM entre um documento e o shell — o único ponto de injeção de `src/documentos/`.

   Um documento que sai do `app.js` perde o acesso a duas coisas que só existem lá: a função que
   fala com a rede (`sbFetch`, `app.js:209`) e as ações de shell (selecionar a linha, que repinta
   o banner, sincroniza a rota e a faixa de abas — `selectLine`, `app.js:725`). Nem uma nem outra
   é markup, nem cabe num módulo de domínio.

   Por que UM módulo em vez de um `configurar*` por família (o padrão que a Fase B2 usou em
   `configurarDoc`/`configurarLookups`/`configurarListas`): as quatro famílias da Fase C precisam
   exatamente das MESMAS duas coisas. Quatro `configurar*` seriam quatro nomes a não colidir no
   `import` do `app.js`, quatro chamadas no bootstrap e quatro cópias do guard de "falha fechado".
   Aqui é uma chamada só, e os re-exports abaixo fazem os call sites dentro dos documentos ficarem
   IDÊNTICOS ao que eram no `app.js` — `sbFetch('evento_teste', …)`, `selecionarLinha(line)` — o
   que é o ponto de um PR de refatoração: o corpo movido não muda.

   FALHA FECHADO, como os três da B2: sem `configurarDocumentos`, a primeira chamada LANÇA. Um
   documento que saísse mudo (sem rede, sem banner) pintaria uma tela vazia sem erro, que é o modo
   de falha invisível a todo gate deste repo.

   CRITÉRIO DE PARADA — este arquivo é onde ele se mede. O plano vivo
   (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`, seção "Critério de parada") diz que mais
   de ~6 dependências INJETADAS é sinal de parar e registrar. Como todas as famílias da Fase C
   passam por aqui, a conta é o número de slots deste módulo. Hoje são DOIS. Uma fase C que
   precise acrescentar um terceiro deve escrever no plano por quê; uma que precise do sétimo deve
   parar.

   O QUE SAI DAQUI NA FASE B: `sbFetch` é andaime. Quando `src/data/rest.mjs` existir, o slot some
   e cada documento passa a importá-lo de lá — sem tocar em nenhum call site, porque o nome
   importado é o mesmo. `selecionarLinha` é ação de shell de verdade e fica até a Fase E. */

let _sbFetch = null;
let _selecionarLinha = null;

export function configurarDocumentos({ sbFetch, selecionarLinha }){
  _sbFetch = sbFetch;
  _selecionarLinha = selecionarLinha;
}

/* Acesso a dado (PostgREST). Assinatura idêntica à do `sbFetch` do app.js. */
export function sbFetch(tabela, qs){
  if (!_sbFetch) throw new Error('src/documentos: sbFetch não configurado — chame configurarDocumentos({ sbFetch, selecionarLinha }) no bootstrap do app.js');
  return _sbFetch(tabela, qs);
}

/* Ação de shell: torna `row` a linha ativa (banner + rota + faixa de abas). */
export function selecionarLinha(row){
  if (!_selecionarLinha) throw new Error('src/documentos: selecionarLinha não configurada — chame configurarDocumentos({ sbFetch, selecionarLinha }) no bootstrap do app.js');
  return _selecionarLinha(row);
}
