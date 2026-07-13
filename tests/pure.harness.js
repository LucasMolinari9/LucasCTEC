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
// index.html — nome "Origem - Destino": quebra só no " - ", cada lado inteiro (&nbsp;)
const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
// index.html — ordena listagem de linhas pelo código (codlinha), natural/numérico
const byCodlinha = (a, b) => String(a.codlinha||'').localeCompare(String(b.codlinha||''), undefined, { numeric:true });
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
    // usa o ano do Registro (campo que ordena); sem registro, cai p/ a publicação
    const reg = yearOf(r.data_registro);
    const y = reg!=null ? reg : yearOf(r.data_publicacao);
    if (y !== c.ano) return false;
  }
  return true;
}
// index.html — nomes canônicos da lista de localidades que casam o termo (insensível a acento/caixa) —
// permite digitar "sao goncalo" e buscar no servidor por "SÃO GONÇALO" (o ilike do PostgREST
// NÃO ignora acento)
function localidadesQueCasam(lista, term){
  const nt = norm(term);
  return nt ? lista.filter(n => norm(n).includes(nt)).slice(0, 5) : [];
}
// index.html — filtro or=() do PostgREST: cada coluna ilike cada termo (depende de ilikeTerm)
const orIlike = (cols, termos) => 'or=(' + termos.map(t => { const e = ilikeTerm(t); return cols.map(c => `${c}.ilike.*${e}*`).join(','); }).join(',') + ')';
// index.html — cod_ibge cujo nome de município é EXATAMENTE um dos termos (insens. a acento/caixa) —
// exato de propósito: "rio" não pode puxar Rio de Janeiro/Rio Bonito/Rio Claro inteiros
function municipiosExatos(ibge, termos){
  const nts = new Set(termos.map(norm).filter(Boolean));
  return Object.entries(ibge).filter(([,v])=>nts.has(norm(v.nome))).map(([c])=>c);
}
// index.html:2356
function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
// index.html:2357
function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
// index.html:2358
function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
// index.html — classifica linhas por município (dentro × intermunicipal) a partir das linhas de
// itinerário (codlinha, cod_origem). "dentro" = todos os trechos no próprio município (M);
// "inter" = tem ao menos um trecho em OUTRO município (cod_origem não-vazio e != M).
function classifyMunLines(itRows, codibge){
  const M = String(codibge);
  const bySet = new Map();                       // codlinha(String) → Set de cod_origem (não vazios)
  for(const r of itRows){
    if(r.codlinha==null || r.codlinha==='') continue;
    const cl = String(r.codlinha);
    let s = bySet.get(cl); if(!s){ s = new Set(); bySet.set(cl, s); }
    const co = r.cod_origem==null ? '' : String(r.cod_origem);
    if(co) s.add(co);
  }
  const dentro = new Set(), inter = new Set();
  for(const [cl, s] of bySet){
    let outro = false;
    for(const co of s){ if(co !== M){ outro = true; break; } }
    (outro ? inter : dentro).add(cl);
  }
  return { dentro, inter };
}

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
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, isLinhaAtiva, norm,
  yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, localidadesQueCasam, orIlike, municipiosExatos,
  setRTState, rowMatchesActiveLine,
  resumoRelatorio, resumoFrota,
};
