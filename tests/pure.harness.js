'use strict';
/* Cópias VERBATIM de funções PURAS do app.js, para teste unitário em Node
   (sem navegador, sem rede, sem dependências).

   IMPORTANTE: ao editar uma destas funções no app.js, atualize a cópia aqui.
   Cada cópia é delimitada pelos marcadores @fonte/@fim (ver os blocos abaixo):
   o tests/check.js recorta o bloco entre eles e exige que o CORPO INTEIRO exista
   igual dentro do app.js. Cópia exportada sem marcador derruba o gate por
   cobertura; cópia que divergiu derruba o gate nomeando a função. */

// app.js — 101001001 → 101-001-001 (código da ligação no PDF oficial)
/* @fonte fmtCode */
function fmtCode(code) {
  if (!code) return '';
  const s = String(code);
  return s.length === 9 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
}
/* @fim */
// app.js — HH:MM:SS → HH:MM
/* @fonte fmtTime */
function fmtTime(t){ if(!t) return '—'; const m=String(t).match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:t; }
/* @fim */
// app.js — data ISO (YYYY-MM-DD) → DD/MM/YYYY
/* @fonte fmtDate */
function fmtDate(d){ if(!d) return '—'; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
/* @fim */
// app.js — escape de HTML (relevante p/ XSS)
/* @fonte esc */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
/* @fim */
/* @fonte enc */
const enc = s => encodeURIComponent(s);
/* @fim */
// app.js — sanitiza termo p/ uso dentro de padrão ilike do PostgREST
/* @fonte ilikeTerm */
const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));
/* @fim */
/* @fonte orDash */
const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
/* @fim */
// app.js — nome "Origem - Destino": quebra só no " - ", cada lado inteiro (&nbsp;)
/* @fonte fmtLineName */
const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
/* @fim */
// app.js — ordena listagem de linhas pelo código (codlinha), natural/numérico
/* @fonte byCodlinha */
const byCodlinha = (a, b) => String(a.codlinha||'').localeCompare(String(b.codlinha||''), undefined, { numeric:true });
/* @fim */
/* @fonte boolChip */
const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
/* @fim */
// app.js — situação da linha (busca e documentos): Cancelada, Paralisada ou Ativa.
// "Ativa" só quando operando (não cancelada e não paralisada). Transferida/sub judice contam como Ativa.
/* @fonte situacaoHTML */
const situacaoHTML = r => r.cancelado ? '<span class="chip chip-on">Cancelada</span>'
  : r.paralisado ? '<span class="chip chip-on">Paralisada</span>'
  : '<span class="chip chip-off">Ativa</span>';
/* @fim */
// app.js — linha ATIVA = operando (não cancelada e não paralisada). Sub judice e
// transferida contam como ativas. Critério único de Empresas e Relatórios.
/* @fonte isLinhaAtiva */
const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
/* @fim */
// app.js — VIGENTE (seção/tarifa) = critério estrito: além de ativa, exclui sub judice e transferida.
/* @fonte isVigente */
const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;
/* @fim */
// app.js — normaliza acento/caixa para busca
/* @fonte norm */
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
/* @fim */
/* @fonte yearOf */
const yearOf = d => d ? parseInt(String(d).slice(0,4),10) : null;
/* @fim */
// app.js — filtro do histórico de eventos (depende de norm e yearOf)
/* @fonte matchEvent */
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
/* @fim */
// app.js — nomes canônicos da lista de localidades que casam o termo (insensível a acento/caixa) —
// permite digitar "sao goncalo" e buscar no servidor por "SÃO GONÇALO" (o ilike do PostgREST
// NÃO ignora acento)
/* @fonte localidadesQueCasam */
function localidadesQueCasam(lista, term){
  const nt = norm(term);
  return nt ? lista.filter(n => norm(n).includes(nt)).slice(0, 5) : [];
}
/* @fim */
// app.js — filtro or=() do PostgREST: cada coluna ilike cada termo (depende de ilikeTerm)
/* @fonte orIlike */
const orIlike = (cols, termos) => 'or=(' + termos.map(t => { const e = ilikeTerm(t); return cols.map(c => `${c}.ilike.*${e}*`).join(','); }).join(',') + ')';
/* @fim */
// app.js — cod_ibge cujo nome de município é EXATAMENTE um dos termos (insens. a acento/caixa) —
// exato de propósito: "rio" não pode puxar Rio de Janeiro/Rio Bonito/Rio Claro inteiros
/* @fonte municipiosExatos */
function municipiosExatos(ibge, termos){
  const nts = new Set(termos.map(norm).filter(Boolean));
  return Object.entries(ibge).filter(([,v])=>nts.has(norm(v.nome))).map(([c])=>c);
}
/* @fim */
/* @fonte groupBy */
function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
/* @fim */
/* @fonte countBy */
function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
/* @fim */
/* @fonte fmtMoney */
function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
/* @fim */
// app.js — classifica linhas por município (dentro × intermunicipal) a partir das linhas de
// itinerário (codlinha, cod_municipio_origem). "dentro" = todos os trechos no próprio município (M);
// "inter" = tem ao menos um trecho em OUTRO município (cod_municipio_origem não-vazio e != M).
/* @fonte classifyMunLines */
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
/* @fim */
/* @fonte terminaisDoMunicipio */
function terminaisDoMunicipio(itRows, codibge){
  const grupos = new Map();
  for(const r of itRows){
    if(String(r.cod_municipio_origem) !== String(codibge)) continue;
    const nome = r.nome_logradouro==null ? '' : String(r.nome_logradouro).trim();
    if(!nome) continue;
    const chave = norm(nome);
    let grupo = grupos.get(chave);
    if(!grupo){ grupo = { grafias:new Map(), linhas:new Set() }; grupos.set(chave, grupo); }
    grupo.grafias.set(nome, (grupo.grafias.get(nome)||0)+1);
    if(r.codlinha!=null && r.codlinha!=='') grupo.linhas.add(String(r.codlinha));
  }
  return [...grupos.values()].map(grupo=>{
    let nome = '', maior = 0;
    for(const [grafia, total] of grupo.grafias){
      if(total>maior){ nome=grafia; maior=total; }
    }
    return { nome, nLinhas:grupo.linhas.size };
  }).sort((a,b)=>a.nome.localeCompare(b.nome));
}
/* @fim */

/* app.js — filtro do Realtime, por ABA (#54). Puro: recebe a aba (com sua própria
   `view` e sua própria `line`) em vez de ler `currentView`/`activeLine` do módulo. */
/* @fonte tabMatchesEvent */
function tabMatchesEvent(tab, table, payload){
  const view = tab && tab.view;
  if(!view || !(view.tables||[]).includes(table)) return false;
  if(!view.lineFilter || !tab.line) return true;      // documento não filtrado por linha → sempre casa
  const cod = payload?.new?.codlinha ?? payload?.old?.codlinha;
  if(cod===undefined || cod===null) return true;      // sem como filtrar → recarrega
  return String(cod) === String(tab.line.codlinha);
}
/* @fim */
/* app.js — dispatch do Realtime sobre o conjunto de abas abertas (#54): quem recarrega
   agora (só a ativa) e quem só fica marcada como desatualizada (as de segundo plano). */
/* @fonte dispatchRealtime */
function dispatchRealtime(tabs, activeTabId, table, payload){
  const casam = (tabs||[]).filter(t => tabMatchesEvent(t, table, payload));
  return {
    reload: casam.some(t => t.id === activeTabId) ? activeTabId : null,
    stale:  casam.filter(t => t.id !== activeTabId).map(t => t.id),
  };
}
/* @fim */

// app.js — ordenação numérica do RJ usada nas listagens por empresa
/* @fonte rjOrder */
function rjOrder(a, b){
  const na=parseInt(a,10), nb=parseInt(b,10);
  if(isNaN(na)&&isNaN(nb)) return String(a).localeCompare(String(b));
  if(isNaN(na)) return 1; if(isNaN(nb)) return -1;
  return na-nb;
}
/* @fim */
// app.js — agregação da Frota por Empresa (depende de groupBy/rjOrder)
/* @fonte resumoFrota */
function resumoFrota(rows){
  const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const sum = (arr,f) => arr.reduce((s,r)=>s+num(r[f]),0);
  return {
    totOp: sum(rows,'frota_operacional'),
    totRes: sum(rows,'reserva'),
    porEmp: [...groupBy(rows, r=>r.codempresa||'—')]
      .map(([cod,rs])=>({cod, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>rjOrder(a.cod,b.cod)),
    porHier: [...groupBy(rows, r=>r.hierarquia||'—')]
      .map(([h,rs])=>({h, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>b.op-a.op),
  };
}
/* @fim */
// app.js — filtro da tabela Frota por Empresa
/* @fonte filtrarFrotaEmpresas */
function filtrarFrotaEmpresas(items, status='ativas', termo=''){
  const raw = String(termo||'').trim(), q = norm(raw);
  return (items||[]).filter(e=>{
    const situacao = norm(e.situacao||'');
    if(status==='ativas' && situacao!=='regular') return false;
    if(status==='canceladas' && situacao!=='cancelado') return false;
    if(q && !(norm(e.nome_empresa||'').includes(q) || String(e.cod||'').includes(raw))) return false;
    return true;
  });
}
/* @fim */

// app.js — inicia uma nova tentativa de escrever um resultado nesta view; retorna o
// token (geração) que a chamadora deve guardar localmente e passar a commitViewResult
// ao terminar. Chamado no INÍCIO de cada loader/run, antes do seu próprio await — é isso
// que permite distinguir "tentativa mais recente" de uma resposta atrasada de uma busca
// anterior (mesma view reaberta ou reexecutada).
/* @fonte beginGen */
function beginGen(view){
  if (!view) return null;   // modal já pode ter fechado (currentView virou null) — no-op seguro
  view._gen = (view._gen || 0) + 1;
  return view._gen;
}
/* @fim */
// app.js — `gen` ainda é a tentativa mais recente para essa view? Usada por
// commitViewResult e por todo ponto que pinta resultado NA TELA (paginate/paginateEvents).
/* @fonte isCurrentGen */
function isCurrentGen(view, gen){
  return !!view && gen === view._gen;
}
/* @fim */
// app.js — único ponto de escrita em view.pdfHTML: só aplica o patch se `gen` ainda
// for a tentativa mais recente para essa view. Descarta em silêncio uma escrita de uma
// busca/troca de linha anterior que resolveu depois de uma mais nova.
/* @fonte commitViewResult */
function commitViewResult(view, gen, patch){
  if (!isCurrentGen(view, gen)) return false;
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
  return true;
}
/* @fim */
// app.js — entra num "detalhe" dentro de um painel de lista (hoje só Portarias):
// guarda o pdfHTML que a lista tinha em view._detail e aplica o do item aberto.
/* @fonte pushDetail */
function pushDetail(view, patch){
  if (!view) return;
  view._detail = { pdfHTML: view.pdfHTML };
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
}
/* @fim */
// app.js — sai do detalhe: restaura o pdfHTML que a lista tinha antes.
/* @fonte popDetail */
function popDetail(view){
  if (!view || !view._detail) return;
  view.pdfHTML = view._detail.pdfHTML;
  view._detail = null;
}
/* @fim */

// app.js — bordas de paginação das listagens de linha (clampa a página)
/* @fonte pageBounds */
function pageBounds(total, pageSize, page){
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, (page|0) || 1), totalPages);
  const start = (p - 1) * pageSize;
  return { page:p, totalPages, start, end:Math.min(start + pageSize, total) };
}
/* @fim */

// app.js — teto de abas simultâneas (#52)
/* @fonte MAX_TABS */
const MAX_TABS = 5;
/* @fim */
// app.js — formato de uma aba em branco (linha/view/histórico de Voltar próprios)
/* @fonte makeTab */
function makeTab(id){ return { id, line: null, view: null, navStack: [], stale: false }; }
/* @fim */
// app.js — abre uma aba em branco; nunca ultrapassa MAX_TABS (devolve blocked:true e
// `tabs`/`activeTabId` originais intactos nesse caso — quem chama decide o toast)
/* @fonte openTabState */
function openTabState(tabs, tabIdSeq){
  if (tabs.length >= MAX_TABS) return { blocked:true, tabs, activeTabId:null, tabIdSeq };
  const id = tabIdSeq + 1;
  return { blocked:false, tabs:[...tabs, makeTab(id)], activeTabId:id, tabIdSeq:id };
}
/* @fim */
// app.js — fecha a aba `id`; se era a ativa, ativa a vizinha (direita, senão esquerda).
// Fechar a última aba devolve closedModal:true (tabs fica vazio)
/* @fonte closeTabState */
function closeTabState(tabs, activeTabId, id){
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return { tabs, activeTabId, closedModal:false };
  const next = tabs.slice(0, idx).concat(tabs.slice(idx + 1));
  if (!next.length) return { tabs: next, activeTabId:null, closedModal:true };
  const nextActiveId = activeTabId !== id ? activeTabId : (next[idx] || next[idx - 1]).id;
  return { tabs: next, activeTabId: nextActiveId, closedModal:false };
}
/* @fim */

// app.js — filtro de SITUAÇÃO das listas de linha (barra Todas/Ativas/Canceladas). Definição
// única compartilhada pelo lineResults (listas paginadas) e pelo renderLocalidadeSecoes.
/* @fonte filtrarSituacao */
function filtrarSituacao(rows, st){
  return st==='ativas'     ? rows.filter(isLinhaAtiva)
       : st==='canceladas' ? rows.filter(r=>!!r.cancelado)
       : rows;
}
/* @fim */

module.exports = {
  filtrarSituacao,
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm,
  yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, terminaisDoMunicipio, localidadesQueCasam, orIlike, municipiosExatos,
  tabMatchesEvent, dispatchRealtime,
  rjOrder, resumoFrota, filtrarFrotaEmpresas, pageBounds,
  beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail,
  MAX_TABS, makeTab, openTabState, closeTabState,
};
