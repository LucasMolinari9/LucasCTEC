'use strict';
/* Cópias VERBATIM de funções PURAS do app.js, para teste unitário em Node
   (sem navegador, sem rede, sem dependências).

   IMPORTANTE: ao editar uma destas funções no app.js, atualize a cópia aqui.
   O tests/check.js tem uma guarda anti-drift que avisa se a versão original mudar.
   A linha de origem está citada em cada bloco. */

// app.js:728 — 101001001 → 101-001-001 (código da ligação no PDF oficial)
/* @canon fmtCode */
function fmtCode(code) {
  if (!code) return '';
  const s = String(code);
  return s.length === 9 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
}
/* @endcanon */
// app.js:734 — HH:MM:SS → HH:MM
/* @canon fmtTime */
function fmtTime(t){ if(!t) return '—'; const m=String(t).match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:t; }
/* @endcanon */
// app.js:736 — data ISO (YYYY-MM-DD) → DD/MM/YYYY
/* @canon fmtDate */
function fmtDate(d){ if(!d) return '—'; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
/* @endcanon */
// app.js:737 — escape de HTML (relevante p/ XSS)
/* @canon esc */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
/* @endcanon */
// app.js:738
/* @canon enc */
const enc = s => encodeURIComponent(s);
/* @endcanon */
// app.js:760 — sanitiza termo p/ uso dentro de padrão ilike do PostgREST
/* @canon ilikeTerm */
const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));
/* @endcanon */
// app.js:739
/* @canon orDash */
const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
/* @endcanon */
// app.js — nome "Origem - Destino": quebra só no " - ", cada lado inteiro (&nbsp;)
/* @canon fmtLineName */
const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
/* @endcanon */
// app.js — ordena listagem de linhas pelo código (codlinha), natural/numérico
/* @canon byCodlinha */
const byCodlinha = (a, b) => String(a.codlinha||'').localeCompare(String(b.codlinha||''), undefined, { numeric:true });
/* @endcanon */
// app.js:740
/* @canon boolChip */
const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
/* @endcanon */
// app.js — situação da linha (busca e documentos): Cancelada, Paralisada ou Ativa.
// "Ativa" só quando operando (não cancelada e não paralisada). Transferida/sub judice contam como Ativa.
/* @canon situacaoHTML */
const situacaoHTML = r => r.cancelado ? '<span class="chip chip-on">Cancelada</span>'
  : r.paralisado ? '<span class="chip chip-on">Paralisada</span>'
  : '<span class="chip chip-off">Ativa</span>';
/* @endcanon */
// app.js (seção STATE + CACHES) — desempate do cadastro de empresas quando o mesmo RJ aparece
// duplicado (ex.: o 103). Definição única usada pelo getEmpresas (nome no banner) e pelo
// LOADERS.empresasRegulares (o card) — antes da issue #111 eram duas cópias que podiam divergir.
/* @canon scoreEmpresa */
function scoreEmpresa(e){
  if (!e || e.cassada) return 0;
  return String(e.situacao||'').toUpperCase()==='REGULAR' ? 2 : 1;
}
/* @endcanon */
/* @canon dedupEmpresasPorRJ */
function dedupEmpresasPorRJ(lista){
  const best = {};
  (lista||[]).forEach(e => {
    const k = e && e.codempresa;
    if (k == null) return;
    if (!Object.prototype.hasOwnProperty.call(best, k) || scoreEmpresa(e) > scoreEmpresa(best[k])) best[k] = e;
  });
  return Object.values(best);
}
/* @endcanon */
// app.js:763 — linha ATIVA = operando (não cancelada e não paralisada). Sub judice e
// transferida contam como ativas. Critério único de Empresas e Relatórios.
/* @canon isLinhaAtiva */
const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
/* @endcanon */
// app.js — VIGENTE (seção/tarifa) = critério estrito: além de ativa, exclui sub judice e transferida.
/* @canon isVigente */
const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;
/* @endcanon */
// app.js:842 — normaliza acento/caixa para busca
/* @canon norm */
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
/* @endcanon */
// app.js:1510
/* @canon yearOf */
const yearOf = d => d ? parseInt(String(d).slice(0,4),10) : null;
/* @endcanon */
// app.js:1511 — filtro do histórico de eventos (depende de norm e yearOf)
/* @canon matchEvent */
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
/* @endcanon */
// app.js — nomes canônicos da lista de localidades que casam o termo (insensível a acento/caixa) —
// permite digitar "sao goncalo" e buscar no servidor por "SÃO GONÇALO" (o ilike do PostgREST
// NÃO ignora acento)
/* @canon localidadesQueCasam */
function localidadesQueCasam(lista, term){
  const nt = norm(term);
  return nt ? lista.filter(n => norm(n).includes(nt)).slice(0, 5) : [];
}
/* @endcanon */
// app.js — filtro or=() do PostgREST: cada coluna ilike cada termo (depende de ilikeTerm)
/* @canon orIlike */
const orIlike = (cols, termos) => 'or=(' + termos.map(t => { const e = ilikeTerm(t); return cols.map(c => `${c}.ilike.*${e}*`).join(','); }).join(',') + ')';
/* @endcanon */
// app.js — cod_ibge cujo nome de município é EXATAMENTE um dos termos (insens. a acento/caixa) —
// exato de propósito: "rio" não pode puxar Rio de Janeiro/Rio Bonito/Rio Claro inteiros
/* @canon municipiosExatos */
function municipiosExatos(ibge, termos){
  const nts = new Set(termos.map(norm).filter(Boolean));
  return Object.entries(ibge).filter(([,v])=>nts.has(norm(v.nome))).map(([c])=>c);
}
/* @endcanon */
// app.js:2356
/* @canon groupBy */
function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
/* @endcanon */
// app.js:2357
/* @canon countBy */
function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
/* @endcanon */
// app.js:2358
/* @canon fmtMoney */
function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
/* @endcanon */
// app.js — classifica linhas por município (dentro × intermunicipal) a partir das linhas de
// itinerário (codlinha, cod_municipio_origem). "dentro" = todos os trechos no próprio município (M);
// "inter" = tem ao menos um trecho em OUTRO município (cod_municipio_origem não-vazio e != M).
/* @canon classifyMunLines */
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
/* @endcanon */
/* @canon terminaisDoMunicipio */
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
/* @endcanon */

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

// app.js:2715 — ordenação numérica do RJ usada nas listagens por empresa
/* @canon rjOrder */
function rjOrder(a, b){
  const na=parseInt(a,10), nb=parseInt(b,10);
  if(isNaN(na)&&isNaN(nb)) return String(a).localeCompare(String(b));
  if(isNaN(na)) return 1; if(isNaN(nb)) return -1;
  return na-nb;
}
/* @endcanon */
// app.js:2344 — agregação da Frota por Empresa (depende de groupBy/rjOrder)
/* @canon resumoFrota */
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
/* @endcanon */
// app.js:2359 — filtro da tabela Frota por Empresa
/* @canon filtrarFrotaEmpresas */
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
