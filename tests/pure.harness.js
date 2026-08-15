'use strict';
/* O que é IMPORTADO dos módulos de domínio já é a implementação real que o navegador executa —
   não há cópia a guardar, e por isso estes nomes não aparecem entre marcadores @canon.
   O que ainda é CÓPIA (blocos @canon abaixo) só existe porque a função continua dentro do
   app.js; cada extração para src/domain/ apaga a cópia e a guarda junto. */
const { fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm } = require('../src/domain/core.mjs');
const { groupBy, countBy, fmtMoney, byCodlinha, rjOrder, scoreEmpresa, dedupEmpresasPorRJ,
        classifyMunLines, terminaisDoMunicipio, resumoFrota, filtrarFrotaEmpresas } = require('../src/domain/agrupamento.mjs');
const { yearOf, matchEvent, localidadesQueCasam, orIlike, municipiosExatos } = require('../src/domain/busca.mjs');

/* Cópias VERBATIM de funções PURAS do app.js, para teste unitário em Node
   (sem navegador, sem rede, sem dependências).

   IMPORTANTE: ao editar uma destas funções no app.js, atualize a cópia aqui.
   O tests/check.js tem uma guarda anti-drift que avisa se a versão original mudar.
   A linha de origem está citada em cada bloco. */

/* app.js:2966 — filtro do Realtime, por ABA (#54). Puro: recebe a aba (com sua própria
   `view` e sua própria `line`) em vez de ler `currentView`/`activeLine` do módulo. */
/* @canon tabMatchesEvent */
function tabMatchesEvent(tab, table, payload){
  const view = tab && tab.view;
  if(!view || !(view.tables||[]).includes(table)) return false;
  if(!view.lineFilter || !tab.line) return true;      // documento não filtrado por linha → sempre casa
  const cod = payload?.new?.codlinha ?? payload?.old?.codlinha;
  if(cod===undefined || cod===null) return true;      // sem como filtrar → recarrega
  return String(cod) === String(tab.line.codlinha);
}
/* @endcanon */
/* app.js:2976 — dispatch do Realtime sobre o conjunto de abas abertas (#54): quem recarrega
   agora (só a ativa) e quem só fica marcada como desatualizada (as de segundo plano). */
/* @canon dispatchRealtime */
function dispatchRealtime(tabs, activeTabId, table, payload){
  const casam = (tabs||[]).filter(t => tabMatchesEvent(t, table, payload));
  return {
    reload: casam.some(t => t.id === activeTabId) ? activeTabId : null,
    stale:  casam.filter(t => t.id !== activeTabId).map(t => t.id),
  };
}
/* @endcanon */

// app.js:726 — inicia uma nova tentativa de escrever um resultado nesta view; retorna o
// token (geração) que a chamadora deve guardar localmente e passar a commitViewResult
// ao terminar. Chamado no INÍCIO de cada loader/run, antes do seu próprio await — é isso
// que permite distinguir "tentativa mais recente" de uma resposta atrasada de uma busca
// anterior (mesma view reaberta ou reexecutada).
/* @canon beginGen */
function beginGen(view){
  if (!view) return null;   // modal já pode ter fechado (currentView virou null) — no-op seguro
  view._gen = (view._gen || 0) + 1;
  return view._gen;
}
/* @endcanon */
// app.js:733 — `gen` ainda é a tentativa mais recente para essa view? Usada por
// commitViewResult e por todo ponto que pinta resultado NA TELA (paginate/paginateEvents).
/* @canon isCurrentGen */
function isCurrentGen(view, gen){
  return !!view && gen === view._gen;
}
/* @endcanon */
// app.js:736 — único ponto de escrita em view.pdfHTML: só aplica o patch se `gen` ainda
// for a tentativa mais recente para essa view. Descarta em silêncio uma escrita de uma
// busca/troca de linha anterior que resolveu depois de uma mais nova.
/* @canon commitViewResult */
function commitViewResult(view, gen, patch){
  if (!isCurrentGen(view, gen)) return false;
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
  return true;
}
/* @endcanon */
// app.js:743 — entra num "detalhe" dentro de um painel de lista (hoje só Portarias):
// guarda o pdfHTML que a lista tinha em view._detail e aplica o do item aberto.
/* @canon pushDetail */
function pushDetail(view, patch){
  if (!view) return;
  view._detail = { pdfHTML: view.pdfHTML };
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
}
/* @endcanon */
// app.js:748 — sai do detalhe: restaura o pdfHTML que a lista tinha antes.
/* @canon popDetail */
function popDetail(view){
  if (!view || !view._detail) return;
  view.pdfHTML = view._detail.pdfHTML;
  view._detail = null;
}
/* @endcanon */

// app.js:2850 — bordas de paginação das listagens de linha (clampa a página)
/* @canon pageBounds */
function pageBounds(total, pageSize, page){
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, (page|0) || 1), totalPages);
  const start = (p - 1) * pageSize;
  return { page:p, totalPages, start, end:Math.min(start + pageSize, total) };
}
/* @endcanon */

// app.js:376 — teto de abas simultâneas (#52)
/* @canon MAX_TABS */
const MAX_TABS = 5;
/* @endcanon */
// app.js:378 — formato de uma aba em branco (linha/view/histórico de Voltar próprios)
/* @canon makeTab */
function makeTab(id){ return { id, line: null, view: null, navStack: [], stale: false }; }
/* @endcanon */
// app.js:386 — abre uma aba em branco; nunca ultrapassa MAX_TABS (devolve blocked:true e
// `tabs`/`activeTabId` originais intactos nesse caso — quem chama decide o toast)
/* @canon openTabState */
function openTabState(tabs, tabIdSeq){
  if (tabs.length >= MAX_TABS) return { blocked:true, tabs, activeTabId:null, tabIdSeq };
  const id = tabIdSeq + 1;
  return { blocked:false, tabs:[...tabs, makeTab(id)], activeTabId:id, tabIdSeq:id };
}
/* @endcanon */
// app.js:394 — fecha a aba `id`; se era a ativa, ativa a vizinha (direita, senão esquerda).
// Fechar a última aba devolve closedModal:true (tabs fica vazio)
/* @canon closeTabState */
function closeTabState(tabs, activeTabId, id){
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return { tabs, activeTabId, closedModal:false };
  const next = tabs.slice(0, idx).concat(tabs.slice(idx + 1));
  if (!next.length) return { tabs: next, activeTabId:null, closedModal:true };
  const nextActiveId = activeTabId !== id ? activeTabId : (next[idx] || next[idx - 1]).id;
  return { tabs: next, activeTabId: nextActiveId, closedModal:false };
}
/* @endcanon */

// app.js — filtro de SITUAÇÃO das listas de linha (barra Todas/Ativas/Canceladas). Definição
// única compartilhada pelo lineResults (listas paginadas) e pelo renderLocalidadeSecoes.
/* @canon filtrarSituacao */
function filtrarSituacao(rows, st){
  return st==='ativas'     ? rows.filter(isLinhaAtiva)
       : st==='canceladas' ? rows.filter(r=>!!r.cancelado)
       : rows;
}
/* @endcanon */

module.exports = {
  filtrarSituacao, scoreEmpresa, dedupEmpresasPorRJ,
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm,
  yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, terminaisDoMunicipio, localidadesQueCasam, orIlike, municipiosExatos,
  tabMatchesEvent, dispatchRealtime,
  rjOrder, resumoFrota, filtrarFrotaEmpresas, pageBounds,
  beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail,
  MAX_TABS, makeTab, openTabState, closeTabState,
};
