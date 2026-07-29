/* Módulo compartilhado sem etapa de build: navegador (DIVAT.viewState) e Node (CommonJS). */
(function(root, factory){
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  const namespace = root.DIVAT || (root.DIVAT = {});
  namespace.viewState = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const MAX_TABS = 5;
  
  function makeTab(id){ return { id, line: null, view: null, navStack: [], stale: false }; }
  
  function openTabState(tabs, tabIdSeq){
    if (tabs.length >= MAX_TABS) return { blocked:true, tabs, activeTabId:null, tabIdSeq };
    const id = tabIdSeq + 1;
    return { blocked:false, tabs:[...tabs, makeTab(id)], activeTabId:id, tabIdSeq:id };
  }
  
  function closeTabState(tabs, activeTabId, id){
    const idx = tabs.findIndex(t => t.id === id);
    if (idx === -1) return { tabs, activeTabId, closedModal:false };
    const next = tabs.slice(0, idx).concat(tabs.slice(idx + 1));
    if (!next.length) return { tabs: next, activeTabId:null, closedModal:true };
    const nextActiveId = activeTabId !== id ? activeTabId : (next[idx] || next[idx - 1]).id;
    return { tabs: next, activeTabId: nextActiveId, closedModal:false };
  }
  
  function beginGen(view){
    if (!view) return null;   // modal já pode ter fechado (currentView virou null) — no-op seguro
    view._gen = (view._gen || 0) + 1;
    return view._gen;
  }
  
  function isCurrentGen(view, gen){
    return !!view && gen === view._gen;
  }
  
  function commitViewResult(view, gen, patch){
    if (!isCurrentGen(view, gen)) return false;
    if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
    return true;
  }
  
  function pushDetail(view, patch){
    if (!view) return;
    view._detail = { pdfHTML: view.pdfHTML };
    if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
  }
  
  function popDetail(view){
    if (!view || !view._detail) return;
    view.pdfHTML = view._detail.pdfHTML;
    view._detail = null;
  }
  
  function pageBounds(total, pageSize, page){
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, (page|0) || 1), totalPages);
    const start = (p - 1) * pageSize;
    return { page:p, totalPages, start, end:Math.min(start + pageSize, total) };
  }
  
  function tabMatchesEvent(tab, table, payload){
    const view = tab && tab.view;
    if(!view || !(view.tables||[]).includes(table)) return false;
    if(!view.lineFilter || !tab.line) return true;      // documento não filtrado por linha → sempre casa
    const cod = payload?.new?.codlinha ?? payload?.old?.codlinha;
    if(cod===undefined || cod===null) return true;      // sem como filtrar → recarrega
    return String(cod) === String(tab.line.codlinha);
  }
  
  function dispatchRealtime(tabs, activeTabId, table, payload){
    const casam = (tabs||[]).filter(t => tabMatchesEvent(t, table, payload));
    return {
      reload: casam.some(t => t.id === activeTabId) ? activeTabId : null,
      stale:  casam.filter(t => t.id !== activeTabId).map(t => t.id),
    };
  }

  return Object.freeze({ MAX_TABS, makeTab, openTabState, closeTabState, beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail, pageBounds, tabMatchesEvent, dispatchRealtime });
});
