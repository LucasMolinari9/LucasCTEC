'use strict';
/* Cópias VERBATIM de funções PURAS do index.html, para teste unitário em Node
   (sem navegador, sem rede, sem dependências).

   IMPORTANTE: ao editar uma destas funções no index.html, atualize a cópia aqui.
   O tests/check.js tem uma guarda anti-drift que avisa se a versão original mudar.
   A linha de origem está citada em cada bloco. */

// index.html:728 — 101001001 → 101-001-001 (código da ligação no PDF oficial)
function fmtCode(code) {
  if (!code) return '';
  const s = String(code);
  return s.length === 9 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
}
// index.html:734 — HH:MM:SS → HH:MM
function fmtTime(t){ if(!t) return '—'; const m=String(t).match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:t; }
// index.html:736 — data ISO (YYYY-MM-DD) → DD/MM/YYYY
function fmtDate(d){ if(!d) return '—'; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
// index.html:737 — escape de HTML (relevante p/ XSS)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
// index.html:738
const enc = s => encodeURIComponent(s);
// index.html:760 — sanitiza termo p/ uso dentro de padrão ilike do PostgREST
const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));
// index.html:739
const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
// index.html:740
const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
// index.html:763 — linha ATIVA = operando (não cancelada e não paralisada). Sub judice e
// transferida contam como ativas. Critério único de Empresas e Relatórios.
const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
// index.html:842 — normaliza acento/caixa para busca
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
// index.html:1510
const yearOf = d => d ? parseInt(String(d).slice(0,4),10) : null;
// index.html:1511 — filtro do histórico de eventos (depende de norm e yearOf)
function matchEvent(r, c){
  if (c.text && !norm((r.descricao||'')+' '+(r.observacao||'')).includes(c.text)) return false;
  if (c.proc && !norm(r.numero_processo||'').includes(c.proc)) return false;
  if (c.ano!=null){
    // casa o ano com o registro OU a publicação (o que estiver preenchido)
    if (yearOf(r.data_registro) !== c.ano && yearOf(r.data_publicacao) !== c.ano) return false;
  }
  return true;
}
// index.html:2356
function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
// index.html:2357
function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
// index.html:2358
function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* index.html:2401 — filtro do Realtime. No index.html depende do estado de módulo
   `currentView` e `activeLine`; aqui são variáveis locais ajustáveis via setRTState()
   só para teste (o corpo da função é cópia verbatim). */
let currentView = null, activeLine = null;
function setRTState(st){ currentView = (st && st.currentView) || null; activeLine = (st && st.activeLine) || null; }
function rowMatchesActiveLine(payload){
  // se a view depende da linha ativa, só recarrega se a mudança for da mesma linha
  if(!currentView || !currentView.lineFilter || !activeLine) return true;
  const cod = payload?.new?.codlinha ?? payload?.old?.codlinha;
  if(cod===undefined || cod===null) return true; // sem como filtrar → recarrega
  return String(cod) === String(activeLine.codlinha);
}

// index.html:2303 — agregação do Relatório Gerencial (depende de isLinhaAtiva e countBy)
function resumoRelatorio(rows){
  return {
    total: rows.length,
    ativas: rows.filter(isLinhaAtiva).length,
    canc:  rows.filter(r=>r.cancelado).length,
    paral: rows.filter(r=>r.paralisado).length,
    sj:    rows.filter(r=>r.sub_judice).length,
    empCount: new Set(rows.map(r=>r.codempresa)).size,
    porEmp: [...countBy(rows, r=>r.codempresa||'—')].sort((a,b)=>b[1]-a[1]).slice(0,15),
  };
}
// index.html:2327 — agregação da Frota por Empresa (depende de groupBy)
function resumoFrota(rows){
  const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const sum = (arr,f) => arr.reduce((s,r)=>s+num(r[f]),0);
  return {
    totOp: sum(rows,'frota_operacional'),
    totRes: sum(rows,'reserva'),
    porEmp: [...groupBy(rows, r=>r.codempresa||'—')]
      .map(([cod,rs])=>({cod, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>b.op-a.op),
    porHier: [...groupBy(rows, r=>r.hierarquia||'—')]
      .map(([h,rs])=>({h, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>b.op-a.op),
  };
}

module.exports = {
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, boolChip, isLinhaAtiva, norm,
  yearOf, matchEvent, groupBy, countBy, fmtMoney,
  setRTState, rowMatchesActiveLine,
  resumoRelatorio, resumoFrota,
};
