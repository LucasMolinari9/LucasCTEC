/* Seam das duas dependências de shell compartilhadas pelos documentos.
   A rede não é injetada aqui: todos importam a fronteira única `src/data/rest.mjs`.
   `selecionarLinha` sincroniza banner/rota/abas; `novoCtx` cria um contexto de busca.
   Ambos falham fechado antes do bootstrap, evitando documentos silenciosamente vazios. */

let _selecionarLinha = null;
let _novoCtx = null;

export function configurarDocumentos({ selecionarLinha, novoCtx }){
  _selecionarLinha = selecionarLinha;
  _novoCtx = novoCtx;
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
