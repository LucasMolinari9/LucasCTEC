/* Módulo compartilhado sem etapa de build: navegador (DIVAT.domain) e Node (CommonJS). */
(function(root, factory){
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  const namespace = root.DIVAT || (root.DIVAT = {});
  namespace.domain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  function fmtCode(code) {
    if (!code) return '';
    const s = String(code);
    return s.length === 9 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
  }
  
  function fmtTime(t){ if(!t) return '—'; const m=String(t).match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:t; }
  
  function fmtDate(d){ if(!d) return '—'; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
  
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
  
  function classifyMunLines(itRows, codibge){
    const M = String(codibge);
    const bySet = new Map();                       // codlinha(String) → Set de cod_municipio_origem (não vazios)
    for(const r of itRows){
      if(r.codlinha==null || r.codlinha==='') continue;
      const cl = String(r.codlinha);
      let s = bySet.get(cl); if(!s){ s = new Set(); bySet.set(cl, s); }
      const co = r.cod_municipio_origem==null ? '' : String(r.cod_municipio_origem);
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
  
  function localidadesQueCasam(lista, term){
    const nt = norm(term);
    return nt ? lista.filter(n => norm(n).includes(nt)).slice(0, 5) : [];
  }
  
  function municipiosExatos(ibge, termos){
    const nts = new Set(termos.map(norm).filter(Boolean));
    return Object.entries(ibge).filter(([,v])=>nts.has(norm(v.nome))).map(([c])=>c);
  }
  
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
  
  function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
  
  function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
  
  function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  
  const enc = s => encodeURIComponent(s);
  
  const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));
  
  const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
  
  const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
  
  const byCodlinha = (a, b) => String(a.codlinha||'').localeCompare(String(b.codlinha||''), undefined, { numeric:true });
  
  const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
  
  const situacaoHTML = r => r.cancelado ? '<span class="chip chip-on">Cancelada</span>'
    : r.paralisado ? '<span class="chip chip-on">Paralisada</span>'
    : '<span class="chip chip-off">Ativa</span>';
  
  const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
  
  const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;
  
  const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  
  const yearOf = d => d ? parseInt(String(d).slice(0,4),10) : null;
  
  const orIlike = (cols, termos) => 'or=(' + termos.map(t => { const e = ilikeTerm(t); return cols.map(c => `${c}.ilike.*${e}*`).join(','); }).join(',') + ')';
  
  function dedupEmpresasPorRJ(rows){
    const best = new Map();
    const score = r => (r && !r.cassada && String(r.situacao||'').toUpperCase()==='REGULAR') ? 2 : (r && !r.cassada ? 1 : 0);
    for (const row of rows || []){
      const rawKey = row && row.codempresa;
      if (rawKey==null) continue;
      const key = String(rawKey);
      const atual = best.get(key);
      if (!atual || score(row) > atual.score) best.set(key, { row, score:score(row) });
    }
    return [...best.values()].map(item => item.row);
  }

  return Object.freeze({ fmtCode, fmtTime, fmtDate, matchEvent, classifyMunLines, localidadesQueCasam, municipiosExatos, resumoRelatorio, resumoFrota, groupBy, countBy, fmtMoney, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, yearOf, orIlike, dedupEmpresasPorRJ });
});
