// Regras puras sobre o ESTADO DO QUE ESTÁ NA TELA: qual tentativa de carga ainda vale, quais
// abas existem, qual delas se importa com um evento do Realtime, e que fatia/subconjunto de
// linhas uma lista mostra. Todas recebem o estado por parâmetro (a `view`, o array de abas, as
// linhas já buscadas) em vez de ler `currentView`/`activeLine`/`tabs` do IIFE — é isso que as
// torna testáveis sem navegador, e é o mesmo contrato que a Fase A injetou nos documentos: o
// `ctx` do bloco "o CONTEXTO explícito de um documento", mais abaixo.
// Como o core.mjs, o agrupamento.mjs e o busca.mjs: sem DOM, sem rede, sem storage, sem estado
// global. O que é DOM/runtime fica do lado de fora — `renderTabs`, `activateTab`, `markStale` e
// `scheduleReload` continuam no app.js, e são eles que aplicam o que estas funções decidem.
import { isLinhaAtiva } from './core.mjs';

// --- seam do ciclo de vida da view ---
// Único caminho de escrita em `view.pdfHTML` (e no slot de detalhe de painéis tipo Portarias).
// Protege contra respostas atrasadas de uma busca/troca de linha anterior sobrescreverem o
// resultado de uma tentativa mais nova (ex.: digitar "101" e trocar pra "202" antes de a 1ª
// resposta voltar).
//
// Uso: `beginGen` não é mais chamado à mão pelos documentos — quem o chama é o `makeCtx`/
// `nextGen` abaixo, que embrulham a geração no `ctx` que todo loader/render recebe. Ao terminar,
// `commitViewResult(view, gen, { pdfHTML: X })` com o `view`/`gen` que vieram no ctx (nunca
// relendo `currentView`, que já pode ser outra aba).
// Helpers que escrevem pdfHTML DEPOIS do await de quem os chama (paginateTable, paginateLines,
// lineResults) recebem `gen` como opção em vez de capturar a própria — capturar ali seria tarde
// demais pra distinguir qual tentativa é a mais recente.
export function beginGen(view){
  if (!view) return null;   // modal já pode ter fechado (currentView virou null) — no-op seguro
  view._gen = (view._gen || 0) + 1;
  return view._gen;
}
// `gen` ainda é a tentativa mais recente para essa view? Usada por commitViewResult e por todo
// ponto que pinta resultado NA TELA (paginate/paginateEvents) — a mesma pergunta protege os dois.
export function isCurrentGen(view, gen){
  return !!view && gen === view._gen;
}
export function commitViewResult(view, gen, patch){
  if (!isCurrentGen(view, gen)) return false;
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
  return true;
}
// pushDetail/popDetail: entra/sai de um "detalhe" dentro de um painel de lista (hoje só
// Portarias) sem perder o pdfHTML/pesquisa da lista por baixo.
export function pushDetail(view, patch){
  if (!view) return;
  view._detail = { pdfHTML: view.pdfHTML };
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
}
export function popDetail(view){
  if (!view || !view._detail) return;
  view.pdfHTML = view._detail.pdfHTML;
  view._detail = null;
}

// --- o CONTEXTO explícito de um documento (Fase A do plano de modularização) ---
// `ctx = { view, gen, pane, host, line }` — tudo que um render/loader precisa saber sobre onde,
// para quem e por conta de qual tentativa ele está desenhando. Passado por PARÂMETRO em vez de
// lido de `currentView`/`activeLine`/`modalBody`: quem MONTA um ctx é o shell (o dispatcher, o
// recarregamento por Realtime e cada busca de painel); quem o RECEBE é o documento, e ele deixa
// de ter como ler o global errado depois de um await.
//   view … a view dona da tentativa — a mesma que beginGen/commitViewResult recebem
//   gen  … a geração desta tentativa: o que descarta uma resposta atrasada
//   pane … o `.modal-body` da ABA que pediu (nó fixo — não muda quando o usuário troca de aba)
//   host … o container DENTRO do pane onde este documento desenha (null = o pane inteiro)
//   line … a linha DESTA tentativa, não "a linha ativa agora"
export function makeCtx(view, { pane = null, host = null, line = null } = {}){
  return { view, gen: beginGen(view), pane, host, line };
}
// Deriva o ctx para a linha que a busca ACABOU de resolver, PRESERVANDO `view` e `gen`. A linha
// certa só existe depois do await (1 resultado, ou o clique na lista de N), e derivar com geração
// NOVA destruiria exatamente a proteção que o seam existe para dar: a tentativa velha voltaria a
// poder escrever por cima da mais nova, que é o bug "digitei 101, troquei pra 202, o PDF saiu da
// 101" com outra roupa.
export function withLine(ctx, line){ return { ...ctx, line }; }
// Mesma tentativa, outro container — o `#spHost` que o painel de busca acabou de criar dentro do
// pane. Não mexe em `gen`: continua sendo a mesma tentativa.
export function withHost(ctx, host){ return { ...ctx, host }; }
// Mesma view/pane/host/linha, geração NOVA: para o que o usuário dispara DE NOVO dentro de um
// documento já aberto (trocar o escopo do Município, refiltrar as Portarias) e cujo await pode
// ser ultrapassado pelo clique seguinte. É o `beginGen(view)` que esses pontos já faziam à mão.
export function nextGen(ctx){ return { ...ctx, gen: beginGen(ctx.view) }; }

// --- abas do modal (#51 prefactor + #52 faixa de abas) ---
// Cada aba guarda sua própria linha, sua própria view aberta e sua própria pilha de navegação do
// botão Voltar (`navStack`). `stale` = aba em segundo plano com dado novo esperando: o Realtime a
// marca sem recarregar nada e ela só recarrega ao ser reativada (ver dispatchRealtime).
// `paneEl` (o `<div class="modal-body">` da aba) e `scrollTop` são propriedades de runtime/DOM,
// coladas pela camada de UI (seção MODAL do app.js) — de propósito NÃO fazem parte do formato
// abaixo, que é o que mantém openTabState/closeTabState testáveis sem DOM.
export const MAX_TABS = 5;
export function makeTab(id){ return { id, line: null, view: null, navStack: [], stale: false }; }
// abre uma aba em branco (linha/view null); nunca ultrapassa MAX_TABS — nesse caso devolve
// blocked:true com `tabs`/`activeTabId` originais intactos (quem chama decide o toast).
export function openTabState(tabs, tabIdSeq){
  if (tabs.length >= MAX_TABS) return { blocked:true, tabs, activeTabId:null, tabIdSeq };
  const id = tabIdSeq + 1;
  return { blocked:false, tabs:[...tabs, makeTab(id)], activeTabId:id, tabIdSeq:id };
}
// fecha a aba `id`. Se ela era a ativa, ativa a vizinha (prioriza a da direita, senão a da
// esquerda — convenção comum de abas de navegador). Fechar a última aba devolve closedModal:true
// (tabs fica vazio; quem chama decide fechar o modal e recriar a aba inicial em branco).
export function closeTabState(tabs, activeTabId, id){
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return { tabs, activeTabId, closedModal:false };
  const next = tabs.slice(0, idx).concat(tabs.slice(idx + 1));
  if (!next.length) return { tabs: next, activeTabId:null, closedModal:true };
  const nextActiveId = activeTabId !== id ? activeTabId : (next[idx] || next[idx - 1]).id;
  return { tabs: next, activeTabId: nextActiveId, closedModal:false };
}

// --- despacho do Realtime sobre as abas abertas (#54) ---
// a aba `tab` se importa com este evento? (view dela lê a tabela alterada E, se o documento
// depende de linha, a mudança é da linha DAQUELA aba — cada aba tem a sua). Generalização do
// antigo rowMatchesActiveLine, que perguntava isso do par global currentView/activeLine.
export function tabMatchesEvent(tab, table, payload){
  const view = tab && tab.view;
  if(!view || !(view.tables||[]).includes(table)) return false;
  if(!view.lineFilter || !tab.line) return true;      // documento não filtrado por linha → sempre casa
  const cod = payload?.new?.codlinha ?? payload?.old?.codlinha;
  if(cod===undefined || cod===null) return true;      // sem como filtrar → recarrega
  return String(cod) === String(tab.line.codlinha);
}
// quem recarrega AGORA (só a ativa, ao vivo como sempre) e quem só fica marcada como
// desatualizada (as de segundo plano — recarregam ao serem reativadas).
export function dispatchRealtime(tabs, activeTabId, table, payload){
  const casam = (tabs||[]).filter(t => tabMatchesEvent(t, table, payload));
  return {
    reload: casam.some(t => t.id === activeTabId) ? activeTabId : null,
    stale:  casam.filter(t => t.id !== activeTabId).map(t => t.id),
  };
}

// --- o que uma lista mostra: a fatia (página) e o subconjunto (situação) ---
// bordas de paginação: clampa `page` no intervalo válido e devolve os índices da fatia.
// total=0 → 1 página (start=end=0).
export function pageBounds(total, pageSize, page){
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, (page|0) || 1), totalPages);
  const start = (p - 1) * pageSize;
  return { page:p, totalPages, start, end:Math.min(start + pageSize, total) };
}
// Filtro de SITUAÇÃO das listas de linha — definição única, usada pelo `lineResults` (listas
// paginadas) e pelo `renderLocalidadeSecoes` (relatório por localidade). Ficava só no
// lineResults, então o card "Linhas por Localidade e Município" não tinha filtro nenhum;
// duplicar a regra aqui faria as duas telas divergirem na definição de "ativa". A regra de
// "ativa" em si não mora aqui: é o `isLinhaAtiva` do core.mjs, e este filtro só a aplica.
export function filtrarSituacao(rows, st){
  return st==='ativas'     ? rows.filter(isLinhaAtiva)
       : st==='canceladas' ? rows.filter(r=>!!r.cancelado)
       : rows;
}
