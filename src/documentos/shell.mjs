/* Seam das dependências de shell compartilhadas pelos documentos.
   A rede não é injetada aqui: todos importam a fronteira única `src/data/rest.mjs`.
   `selecionarLinha` sincroniza banner/rota/abas; `novoCtx` cria um contexto de busca.
   Ambos falham fechado antes do bootstrap, evitando documentos silenciosamente vazios. */

let _selecionarLinha = null;
let _novoCtx = null;
let _montarPainelBusca = null;
let _abrirView = null;
let _distinctCods = null;
let _fetchLinesByCods = null;

export function configurarDocumentos({ selecionarLinha, novoCtx, montarPainelBusca, abrirView,
                                        distinctCods, fetchLinesByCods }){
  _selecionarLinha = selecionarLinha;
  _novoCtx = novoCtx;
  _montarPainelBusca = montarPainelBusca;
  _abrirView = abrirView;
  _distinctCods = distinctCods;
  _fetchLinesByCods = fetchLinesByCods;
}

/* Ação de shell: torna `row` a linha ativa (banner + rota + faixa de abas). */
export function selecionarLinha(row){
  if (!_selecionarLinha) throw new Error('src/documentos: selecionarLinha não configurada — chame configurarDocumentos({ selecionarLinha, novoCtx }) no bootstrap do app.js');
  return _selecionarLinha(row);
}

/* Fabrica um ctx NOVO (geração nova + a linha ativa do momento) para uma busca dentro do próprio
   documento — o mesmo que o `novoCtx` do app.js faz para `runView`/`reloadTab`/`searchPanel`. */
export function novoCtx(view, pane, host){
  if (!_novoCtx) throw new Error('src/documentos: novoCtx não configurado — chame configurarDocumentos({ selecionarLinha, novoCtx }) no bootstrap do app.js');
  return _novoCtx(view, pane, host);
}

export function montarPainelBusca(ctx, options){
  if (!_montarPainelBusca) throw new Error('src/documentos: montarPainelBusca não configurado');
  return _montarPainelBusca(ctx, options);
}

export function abrirView(options){
  if (!_abrirView) throw new Error('src/documentos: abrirView não configurado');
  return _abrirView(options);
}

export function distinctCods(rows, limit){
  if (!_distinctCods) throw new Error('src/documentos: distinctCods não configurado');
  return _distinctCods(rows, limit);
}

export function fetchLinesByCods(cods, options){
  if (!_fetchLinesByCods) throw new Error('src/documentos: fetchLinesByCods não configurado');
  return _fetchLinesByCods(cods, options);
}
