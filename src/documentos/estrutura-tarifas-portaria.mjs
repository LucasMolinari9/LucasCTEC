/* Família C2 — Estrutura Operacional · Tarifas · Portaria.

   Três documentos que a Estrutura Operacional CONSOLIDA (ela é o documento composto: cadastro +
   Seções/Tarifas + Itinerário + Quadro de Horários e Frota, num `.doc` só) e a Portaria, que não
   tem relação com linha nenhuma — é o único documento de lista+detalhe da Fase C (ver abaixo).

   O QUE FICOU NO `app.js`, e não é falha: `LOADERS.estrutura` é one-liner de shell (`lineDocView`,
   igual à C1). `LOADERS.tarifas` TEM corpo (monta o `searchPanel` com dois modos e decide qual
   render chamar) — meça antes de mexer: mover essa composição é trabalho da Fase D, não desta.
   `LOADERS.portarias`, ao contrário, era corpo de PAINEL PRÓPRIO (não usa `searchPanel`) sem
   nenhuma composição de Fase D a proteger — por isso virou `renderPortarias` aqui, e o `app.js`
   ficou só com `LOADERS.portarias = renderPortarias;`.

   O QUE NÃO ESTÁ AQUI E PODERIA PARECER QUE DEVIA: `secoesTarifasHTML`/`tarifaRowHTML`/
   `TARIFA_COLS` (Tarifas usa, mas o Quadro de Horários — C3, ainda no `app.js` — também) e
   `quadroHorariosBodyHTML` (a Estrutura usa, mas o Quadro é o dono). Os dois moram em
   `../ui/blocos.mjs` — é o que fecha o grafo da C1 (ver o cabeçalho de lá) e evita um ciclo entre
   os módulos de C2 e C3. `empresaChooserHTML`/`bindEmpresaRows`/`searchEmpresas` (o modo "por
   empresa" de Tarifas) moram em `../ui/empresas.mjs` pelo mesmo critério — o Quadro de Horários e
   o Histórico da Empresa (C3) também os usam.

   ARMADILHA DA PORTARIA: é o ÚNICO documento com lista+detalhe da Fase C, e por isso usa
   `pushDetail`/`popDetail` (não `commitViewResult`) em `showPortaria` — trocar por
   `commitViewResult` reintroduziria o bug original (o PDF baixava a lista errada). A CASCA do
   painel (`renderPortarias`) escreve DEPOIS de um `await getPortariaAnos()`; o guard
   `if (!isCurrentGen(view, gen)) return;` logo em seguida TEM de ficar — sem ele, uma tentativa
   velha religa o `_panelRun` depois de uma troca de aba. E o `run()` de dentro do painel monta o
   PRÓPRIO ctx a cada busca (não recebe um pronto): é o `novoCtx` injetado por `./shell.mjs`,
   3º slot desde esta fase — o painel não passa pelo `searchPanel` do `app.js` (que é quem
   chamava `novoCtx` até agora), então precisa da mesma fábrica de ctx por conta própria. */
import {
  esc, enc, fmtCode, fmtDate, orDash, ilikeTerm, situacaoHTML, isVigente,
} from '../domain/core.mjs';
import { groupBy, fmtMoney } from '../domain/agrupamento.mjs';
import { commitViewResult, isCurrentGen, pushDetail, popDetail, withHost } from '../domain/view-state.mjs';
import { docHead, metaRows, loading, emptyBox, emptyLinha, errorBox } from '../ui/doc.mjs';
import { paginateTable } from '../ui/paginacao.mjs';
import {
  itinerarioTableHTML, frotaBlockHTML, quadroHorariosBodyHTML,
  secoesTarifasHTML, TARIFA_COLS, tarifaRowHTML,
} from '../ui/blocos.mjs';
import { searchEmpresas, empresaChooserHTML, bindEmpresaRows } from '../ui/empresas.mjs';
import { getIbge, getOrigem, getEmpresas, empNome } from '../data/lookups.mjs';
import {
  LINE_FIELDS, ITINERARIO_FIELDS, QH_INTERVALO_FIELDS, QH_PREDET_FIELDS,
  TARIFA_LINHA_FIELDS, FROTA_FIELDS,
} from '../data/campos.mjs';
import { sbFetch } from '../data/rest.mjs';
import { novoCtx } from './shell.mjs';

let _loaderShell = null;
export function configurarLoadersEstruturaTarifas(shell){ _loaderShell = shell; }
function loaderShell(){
  if(!_loaderShell) throw new Error('configurarLoadersEstruturaTarifas precisa ser chamado antes dos loaders');
  return _loaderShell;
}

export function loadEstrutura(ctx){
  return loaderShell().lineDocView(ctx, { subtitle:'Cadastro de Linhas: Estrutura Operacional', render:renderEstrutura });
}
export function loadTarifas(ctx){
  const { searchPanel, lineDocRun } = loaderShell();
  searchPanel(ctx, {
    title:'Tarifas Vigentes',
    placeholder:'Nome, número ou código da linha (ou empresa)',
    selectOpts:[['linha','Por linha'],['empresa','Por empresa']],
    note:'Por linha: nome, número ou código → mostra as tarifas dela. Por empresa: nome ou código RJ → lista as tarifas de todas as linhas da operadora.',
    onRun:(term, rctx, modo) => modo==='empresa' ? tarifaEmpresaRun(rctx, term) : lineDocRun(rctx, term, renderTarifas)
  });
  const host = ctx.pane.querySelector('#spHost');
  if (ctx.line){
    const i = ctx.pane.querySelector('#spInput');
    if (i) i.value = ctx.line.numero_ligacao || ctx.line.codlinha || '';
    return renderTarifas(withHost(ctx, host));
  }
  host.innerHTML = emptyBox('Busque a linha pelo nome, número ou código — ou troque para "Por empresa".');
}

/* ================================================================
   DOC · Tarifas
   ================================================================ */
export async function renderTarifas(ctx){
  const { view, gen, host, line } = ctx;
  host.innerHTML = loading();
  const rows = await sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=${TARIFA_LINHA_FIELDS}&order=secao`);
  if (!rows.length) { host.innerHTML = emptyLinha('tarifa'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const meta = metaRows([['Ligação',esc(line.nome_ligacao||'—'),true],['Código',esc(fmtCode(line.codlinha))]]);
  const inner = `${meta}${secoesTarifasHTML(rows)}`;            // documento completo (p/ PDF)
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Tarifas Vigentes')}${inner}</div>` });
  // filtro por situação da seção — reusa isVigente (critério estrito compartilhado; ver junto a isLinhaAtiva)
  const temInativa = rows.some(r=>!isVigente(r));
  const tools = temInativa ? `<div class="loc-tools"><label>Situação <select id="tarSit"><option value="todas">Todas</option><option value="vigentes">Vigentes</option><option value="inativas">Canceladas/inativas</option></select></label></div>` : '';
  host.innerHTML = `${meta}${tools}<div id="tarResult"></div>`;
  const result = host.querySelector('#tarResult'), sel = host.querySelector('#tarSit');
  const paint = ()=>{
    const s = sel?sel.value:'todas';
    const f = s==='vigentes' ? rows.filter(isVigente) : s==='inativas' ? rows.filter(r=>!isVigente(r)) : rows;
    result.innerHTML = f.length ? secoesTarifasHTML(f) : emptyBox('Nenhuma seção com esse filtro.');
  };
  if(sel) sel.addEventListener('change', paint);
  paint();
}

// Modo empresa: resolve a empresa e lista as tarifas de TODAS as linhas dela
export async function tarifaEmpresaRun(ctx, term){
  const { view, gen, host, line } = ctx;
  term = (term||'').trim();
  if(!term){
    if(line) return renderTarifasEmpresa(ctx, line.codempresa, empNome(line.codempresa));
    host.innerHTML = emptyBox('Busque por uma empresa (nome ou código RJ), ou troque para "Por linha".');
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  await getEmpresas();
  const emps = searchEmpresas(term);
  if(emps.length > 1){
    host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para ver as tarifas' });
    bindEmpresaRows(host, (cod,nome)=>renderTarifasEmpresa(ctx, cod, nome));
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  const cod = emps.length===1 ? emps[0].codempresa : term;
  const nome = emps.length===1 ? emps[0].nome_empresa : null;
  await renderTarifasEmpresa(ctx, cod, nome);
}
// Lista (paginada) as tarifas de todas as linhas de UMA empresa
const LINHA_TARIFA_COLS = [{t:'Número',w:'100px'},{t:'Ligação'},{t:'Código',w:'120px'},{t:'Seções',w:'80px'},{t:'Tarifa',w:'150px'}];
// uma linha por LIGAÇÃO (deduplicado), mesmo quando ela tem várias seções de tarifa
function linhaTarifaRowHTML(l){
  return `<tr><td class="td-num">${esc(orDash(l.numero_linha||fmtCode(l.codlinha)))}</td><td class="td-logr">${esc(orDash(l.nome_ligacao))}</td><td class="td-num">${esc(fmtCode(l.codlinha))}</td><td class="td-num">${l.nsec}</td><td class="td-sentido">${esc(l.tarifaTxt)}</td></tr>`;
}
export async function renderTarifasEmpresa(ctx, cod, nome){
  const { view, gen, host } = ctx;
  host.innerHTML = loading();
  const rows = await sbFetch('tarifa_atual_teste', `codempresa=eq.${enc(cod)}&select=codlinha,secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia&order=codlinha,secao&limit=3000`);
  const nomeEmp = nome || empNome(cod);
  const nLinhas = new Set(rows.map(r=>r.codlinha)).size;
  const meta = metaRows([['Empresa',esc(nomeEmp||'—'),true],['Registro','RJ-'+esc(cod)],['Total',nLinhas+' linha(s) · '+rows.length+' seção(ões)']]);
  if(!rows.length){ host.innerHTML = meta + emptyBox('Nenhuma tarifa cadastrada para a empresa '+esc(nomeEmp||cod)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  // agrupa por linha — cada linha aparece 1x, com a qtd. de seções e a TARIFA DA LINHA
  // (a da 1ª seção, mesma convenção da Folha de Rosto — não o intervalo das seções).
  const linhas = [...groupBy(rows, r=>r.codlinha)].map(([codlinha,secs])=>{
    const tarifaTxt = secs[0].tarifa != null ? 'R$ '+fmtMoney(secs[0].tarifa) : '—';
    return { codlinha, numero_linha:secs[0].numero_linha, nome_ligacao:secs[0].nome_ligacao, nsec:secs.length, tarifaTxt };
  });
  const tools = `<div class="loc-tools"><label>Ver <select id="tarEmpModo"><option value="secoes" selected>Linhas com seção</option><option value="linhas">Somente linhas</option></select></label></div>`;
  host.innerHTML = `${meta}${tools}<div id="tarEmpResult"></div>`;
  const result = host.querySelector('#tarEmpResult'), sel = host.querySelector('#tarEmpModo');
  const paint = ()=>{
    if(sel.value==='linhas') paginateTable(result, linhas, { cols:LINHA_TARIFA_COLS, rowHTML:linhaTarifaRowHTML, foot:t=>t+' linha(s)', unit:'linhas', view, gen });
    else paginateTable(result, rows, { cols:TARIFA_COLS, rowHTML:tarifaRowHTML, foot:t=>t+' seção(ões)', unit:'seções', view, gen });
  };
  sel.addEventListener('change', paint);
  paint();
}

/* ================================================================
   DOC · Estrutura Operacional
   Documento consolidado (igual ao Relatório oficial): cadastro + Seções/Tarifas + Itinerário +
   Quadro de Horários e Frota, num único `.doc` (também usado no PDF).
   ================================================================ */
export async function renderEstrutura(ctx){
  const { view, gen, host, line } = ctx;
  host.innerHTML = loading();
  const cod = enc(line.codlinha);
  const [lineRows, secoes, itin, interv, predet, qh, orig, ibge] = await Promise.all([
    sbFetch('tabela_vista_teste', `codlinha=eq.${cod}&select=${LINE_FIELDS}&limit=1`),
    sbFetch('tarifa_atual_teste', `codlinha=eq.${cod}&select=${TARIFA_LINHA_FIELDS}&order=secao`),
    sbFetch('itinerario_teste', `codlinha=eq.${cod}&select=${ITINERARIO_FIELDS}&order=id`),
    sbFetch('qh_intervalo_teste', `codlinha=eq.${cod}&select=${QH_INTERVALO_FIELDS}&order=id`),
    sbFetch('qh_predeterminado_teste', `codlinha=eq.${cod}&select=${QH_PREDET_FIELDS}&order=id`),
    sbFetch('qh_teste', `codlinha=eq.${cod}&select=${FROTA_FIELDS}&limit=1`),
    getOrigem(), getIbge(), getEmpresas()
  ]);
  const L = lineRows[0] || line;
  const f = qh[0] || {};
  const h3 = t => `<h3 class="doc-h3-rule">${t}</h3>`;
  const frotaMeta = metaRows([['Hierarquização',esc(orDash(f.hierarquia))],['Frota operacional',esc(orDash(f.frota_operacional))],['Reserva',esc(orDash(f.reserva))],['Última alteração',fmtDate(f.ultima_alteracao)]]);
  const inner = `${metaRows([
      ['Empresa',esc(empNome(L.codempresa)),true],['Registro','RJ-'+esc(orDash(L.codempresa))],
      ['Código da Ligação',esc(fmtCode(L.codlinha))],['Número da Ligação',esc(orDash(L.numero_ligacao))],
      ['Ligação',esc(L.nome_ligacao||'—'),true],['Via',esc(orDash(L.via))],
      ['Característica',esc(orDash(L.caracteristica))],['Tipo da Ligação',esc(orDash(L.tipo))],
      ['Data de criação',fmtDate(L.data_criacao)],['Processo Nº',esc(orDash(L.processo_criacao)),true],
      ['Situação',situacaoHTML(L),true],
    ])}
    ${h3('Seções e Tarifas')}${secoesTarifasHTML(secoes)}
    ${h3('Itinerário')}${itinerarioTableHTML(itin, ibge)}
    ${h3('Quadro de Horários e Frota')}${frotaMeta}${f&&Object.keys(f).length?frotaBlockHTML(f):''}${quadroHorariosBodyHTML(interv, predet, orig)}
    <div class="doc-foot">Fonte: cadastro DETRO-RJ · DIVAT</div>`;
  host.innerHTML = inner;
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Cadastro de Linhas: Estrutura Operacional')}${inner}</div>` });
}

/* ================================================================
   DOC · Portaria
   O único documento de lista+detalhe da Fase C — ver a nota de armadilha no topo do arquivo.
   ================================================================ */
let _portariaAnos = null;
async function getPortariaAnos(){
  if(_portariaAnos) return _portariaAnos;
  const maxAno = new Date().getFullYear();
  let minAno = 1975;
  try{
    const r = await sbFetch('portaria_teste', 'select=data_portaria&data_portaria=not.is.null&order=data_portaria.asc&limit=1');
    if(r[0]?.data_portaria){ const m=String(r[0].data_portaria).match(/^(\d{4})/); if(m) minAno=+m[1]; }
  }catch(_){}
  _portariaAnos = []; for(let a=maxAno; a>=minAno; a--) _portariaAnos.push(a);
  return _portariaAnos;
}
/* Invalidação do cache acima pelo Realtime — o `app.js` (seção REALTIME, `CACHE_INVALIDATORS`)
   não tem mais acesso a `_portariaAnos` depois que ela virou estado de módulo; chama esta função
   em vez de zerar a variável direto, mesmo padrão do `INVALIDADORES_LOOKUP` de
   `src/data/lookups.mjs`. */
export function invalidarPortariaAnos(){ _portariaAnos = null; }
export async function renderPortarias(ctx){
  // A CASCA deste painel escreve DEPOIS do await de getPortariaAnos() — trocar de aba nesse
  // intervalo repintava o pane errado. O guard abaixo é o que impede isso, e ele PRECISA
  // continuar existindo: `_panelRun` fica fora do seam, então aqui não há nada mais protegendo.
  const { view, gen, pane } = ctx;
  const anos = await getPortariaAnos();
  if (!isCurrentGen(view, gen)) return;            // tentativa velha: descarta em silêncio
  pane.innerHTML = `<div class="doc">${docHead('Portarias / Legislação')}
    <div class="ev-filters">
      <label class="evf">Número<input id="pNum" type="text" placeholder="ex.: 1975" autocomplete="off"></label>
      <label class="evf">Ano<select id="pAno"><option value="">Todos</option>${anos.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label>
      <label class="evf">Situação<select id="pVig"><option value="">Todas</option><option value="vigor">Em vigor</option><option value="revog">Revogadas</option></select></label>
      <label class="evf evf-wide">Texto (assunto / conteúdo)<input id="pTxt" type="text" placeholder="palavra no assunto ou no texto da portaria" autocomplete="off"></label>
      <button class="evf-clear" id="pClear" type="button">Limpar</button>
    </div>
    <div id="pHost"></div></div>`;
  const num=pane.querySelector('#pNum'), ano=pane.querySelector('#pAno'),
        vig=pane.querySelector('#pVig'), txt=pane.querySelector('#pTxt'), host=pane.querySelector('#pHost');
  // Este painel tem o `run` dele (não passa pelo searchPanel), então monta o próprio ctx: cada
  // busca é uma tentativa nova, com o pane e o host DESTE painel.
  const run = async()=>{
    const rctx = novoCtx(view, pane, host);
    const { gen } = rctx;
    host.innerHTML = loading();
    try{
      let qs='';
      const n=num.value.trim(); if(n) qs+=`numero_portaria=ilike.*${ilikeTerm(n)}*&`;
      if(ano.value) qs+=`data_portaria=gte.${ano.value}-01-01&data_portaria=lte.${ano.value}-12-31&`;
      if(vig.value==='vigor') qs+='vigor=is.true&'; else if(vig.value==='revog') qs+='vigor=is.false&';
      const tx=txt.value.trim(); if(tx){ const e=ilikeTerm(tx); qs+=`or=(assunto.ilike.*${e}*,conteudo.ilike.*${e}*)&`; }
      const rows = await sbFetch('portaria_teste', `${qs}select=numero_portaria,data_portaria,data_publicacao,tipo_portaria,tipo_legislacao,assunto,conteudo,vigor,portaria_anterior&order=data_portaria.desc.nullslast&limit=300`);
      if(!rows.length){ host.innerHTML=emptyBox('Nenhuma portaria para os filtros informados.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
      paginateTable(host, rows, {
        cols:[{t:'Número',w:'110px'},{t:'Data',w:'90px'},{t:'Tipo',w:'120px'},{t:'Assunto'},{t:'Vigor',w:'90px'}],
        // i = índice GLOBAL na `rows` completa → data-idx continua batendo mesmo paginado
        rowHTML:(r,i)=>`<tr class="clickable" tabindex="0" role="button" data-idx="${i}"><td class="td-num">${esc(orDash(r.numero_portaria))}</td><td class="td-num">${esc(fmtDate(r.data_portaria))}</td><td class="td-tipo">${esc(orDash(r.tipo_portaria||r.tipo_legislacao))}</td><td class="td-logr">${esc(orDash(r.assunto))}</td><td>${r.vigor?'<span class="chip chip-off">Em vigor</span>':'<span class="chip chip-on">Revogada</span>'}</td></tr>`,
        foot:t=>t+' portaria(s)'+(t>=300?' (mostrando 300)':'')+' · clique para ler',
        bind:c=>c.querySelectorAll('tr[data-idx]').forEach(tr=>{
          const open=()=>showPortaria(rctx, rows[+tr.dataset.idx]);
          tr.addEventListener('click', open);
          tr.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
        }),
        unit:'portarias',
        view, gen,
      });
    }catch(e){ host.innerHTML=errorBox(e.message); }
  };
  [num,txt].forEach(el=>el.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); }));
  [ano,vig].forEach(el=>el.addEventListener('change', run));
  pane.querySelector('#pClear').addEventListener('click', ()=>{ num.value=''; ano.value=''; vig.value=''; txt.value=''; run(); });
  if(view) view._panelRun = run;
  run();
}
// `ctx` = o da LISTA (o `rctx` da busca que abriu o item) — pushDetail/popDetail trocam só o
// pdfHTML da view, preservando a busca/paginação por baixo (ver o contrato do seam no topo).
function showPortaria(ctx, r){
  const { view, host } = ctx;
  const inner = `${metaRows([['Portaria',esc(orDash(r.numero_portaria))],['Tipo',esc(orDash(r.tipo_portaria||r.tipo_legislacao))],
      ['Data',esc(fmtDate(r.data_portaria))],['Publicação',esc(fmtDate(r.data_publicacao))],
      ['Situação', r.vigor?'Em vigor':'Revogada'], r.portaria_anterior?['Portaria anterior',esc(r.portaria_anterior)]:['','']])}
    <div class="ev-block"><div class="ev-label">Assunto</div><div class="ev-text${r.assunto?'':' empty'}">${r.assunto?esc(r.assunto):'—'}</div></div>
    <div class="ev-block"><div class="ev-label">Conteúdo</div><div class="ev-text${r.conteudo?'':' empty'}">${r.conteudo?esc(r.conteudo):'—'}</div></div>`;
  pushDetail(view, { pdfHTML: ()=>`<div class="doc">${docHead('Portaria')}${inner}</div>` });
  host.innerHTML = `<button class="loc-btn mb12" id="pbBack">← Voltar aos resultados</button>
    <div class="doc flush">${inner}</div>`;
  const b=host.querySelector('#pbBack'); if(b) b.addEventListener('click', ()=>{ popDetail(view); if(view&&view._panelRun) view._panelRun(); });
}
