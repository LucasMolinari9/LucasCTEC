/* Família C3 — Quadro de Horários · Empresas.

   Duas famílias que compartilham a MESMA fábrica de listagem por empresa: o Quadro de Horários
   tem um modo "por empresa" (todos os quadros de uma operadora, um PDF só) e a família Empresas
   tem três documentos que resolvem uma empresa por nome/código (Ligações, Seções, Histórico).
   Nenhum bloco de markup daqui é usado por OUTRA família (o que É compartilhado —
   `evBandHTML`/`evBlocksHTML`, `secoesTarifasHTML`, `quadroHorariosBodyHTML` — já morava em
   `../ui/blocos.mjs` desde a C1/C2), então esta família não acrescenta nada lá.

   O QUE FICOU NO `app.js`, e por quê — são DOIS motivos distintos, não um só:

   1. **Wrappers de busca de linha, que chamam `lineSearchRun`/`selectLine` (shell puro).**
      `quadroLinhaRun` (o modo "por linha" do Quadro) é wrapper — como `lineDocRun`/`lineDocView`,
      ele delega a `lineSearchRun`, que só existe no `app.js` (chama `selectLine`, ação de shell
      que ainda não tem seam de injeção). Mover o wrapper sem mover `lineSearchRun` juntaria os
      dois em módulos diferentes por um acoplamento que já existe hoje — o plano deixa esses
      wrappers para a Fase E de propósito (`lineDocView`/`lineDocRun`/`lineSearchRun`/
      `searchPanel`). `quadroEmpresaRun`, ao contrário, NÃO usa `lineSearchRun` — só chama
      `renderLinhaQuadro`/`renderEmpresaQuadros` (deste módulo) e helpers importáveis — por isso
      ele sai.

   2. **`LOADERS.empresasRegulares`/`openEmpresaLigacoes` dependem de `runView` (o dispatcher de
      views novas), que é shell de verdade e não tem seam de injeção.** `openEmpresaLigacoes`
      ABRE uma view nova ao clicar numa empresa da lista de Empresas Regulares — é orquestração
      do modal, não render de documento. Diferente de `selecionarLinha`/`novoCtx` (que passaram a
      ser injetados via `./shell.mjs` porque um documento MOVIDO precisava deles), aqui é o
      inverso: quem chama `runView` é o loader que FICOU. Forçar a saída exigiria um quarto tipo
      de slot (abrir view nova) só para isto — registrado como restrição, não decisão, para quem
      mexer na Fase E (chrome do modal) depois.

   `LOADERS.quadroHorarios` também fica — tem CORPO (a composição do `searchPanel` com dois
   modos), e essa composição é trabalho da Fase D, mesmo padrão de `LOADERS.tarifas` (C2).
   `LOADERS.ligacoesPorEmpresa`/`secoesPorEmpresa`/`historicoEmpresa` viraram wrappers finos —
   a lógica de cada um (antes inline dentro do `onRun`) agora é a função exportada com o mesmo
   nome + `Run`, o mesmo padrão que a C2 usou para `tarifaEmpresaRun`. */
import {
  esc, enc, fmtCode, fmtDate, fmtLineName, orDash, boolChip, situacaoHTML, norm, debounce,
} from '../domain/core.mjs';
import { groupBy, resumoFrota, filtrarFrotaEmpresas } from '../domain/agrupamento.mjs';
import { commitViewResult, isCurrentGen, withHost } from '../domain/view-state.mjs';
import { docHead, metaRows, tableHTML, loading, emptyBox, emptyLinha, errorBox, bannerTrunc } from '../ui/doc.mjs';
import { paginateTable, paginateEvents } from '../ui/paginacao.mjs';
import { lineResults } from '../ui/listas.mjs';
import { evBandHTML, evBlocksHTML, secoesTarifasHTML, quadroHorariosBodyHTML } from '../ui/blocos.mjs';
import { searchEmpresas, empresaChooserHTML, bindEmpresaRows } from '../ui/empresas.mjs';
import { getOrigem, getEmpresas, empNome, empresaPorCod, empresasList, empresasMap, getEvLookups } from '../data/lookups.mjs';
import { LINE_FIELDS, QH_INTERVALO_FIELDS, QH_PREDET_FIELDS, TARIFA_LINHA_FIELDS, EVENTO_FIELDS } from '../data/campos.mjs';
import { sbFetch } from '../data/rest.mjs';

let _loaderShell = null;
export function configurarLoadersQuadroEmpresas(shell){ _loaderShell = shell; }
function loaderShell(){
  if(!_loaderShell) throw new Error('configurarLoadersQuadroEmpresas precisa ser chamado antes dos loaders');
  return _loaderShell;
}

function quadroLinhaRun(ctx, term){
  return loaderShell().lineSearchRun(ctx, term, { render:renderLinhaQuadro,
    emptyMsg:'Busque a linha pelo número, nome ou código.', prompt:'clique para ver o quadro' });
}
export function loadQuadroHorarios(ctx){
  const { searchPanel } = loaderShell();
  searchPanel(ctx, {
    title:'Quadro de Horários',
    placeholder:'Número, nome ou código da linha (ou empresa)',
    selectOpts:[['linha','Por linha'],['empresa','Por empresa (PDF de todos)']],
    note: 'Por linha: número, nome ou código → mostra o quadro dela. Por empresa: nome ou código → baixa o PDF de todos os quadros da operadora.',
    onRun: (term, rctx, modo) => modo==='empresa' ? quadroEmpresaRun(rctx, term) : quadroLinhaRun(rctx, term)
  });
  if(ctx.line){
    const i = ctx.pane.querySelector('#spInput');
    if(i) i.value = ctx.line.numero_ligacao || ctx.line.codlinha || '';
    return renderLinhaQuadro(withHost(ctx, ctx.pane.querySelector('#spHost')));
  }
}
export function loadLigacoesPorEmpresa(ctx){
  const pre = ctx.line?.codempresa || '';
  return loaderShell().searchPanel(ctx, { title:'Ligações por Empresa', placeholder:'Código (ex. 101) ou nome da empresa', value:pre,
    onRun: (term, rctx) => ligacoesPorEmpresaRun(rctx, term) });
}
export function loadSecoesPorEmpresa(ctx){
  const pre = ctx.line?.codempresa || '';
  return loaderShell().searchPanel(ctx, { title:'Seções por Empresa', placeholder:'Código da empresa (ex. 101)', value:pre,
    onRun: (term, rctx) => secoesPorEmpresaRun(rctx, term) });
}
export function loadHistoricoEmpresa(ctx){
  const pre = ctx.line?.codempresa || '';
  return loaderShell().searchPanel(ctx, { title:'Histórico da Empresa', placeholder:'Nome ou código da empresa (ex. 1001 ou AUTO VIAÇÃO)', value:pre,
    onRun: (term, rctx) => historicoEmpresaRun(rctx, term) });
}

/* ================================================================
   DOC · Quadro de Horários
   ================================================================ */

// Corpo de UM quadro (meta + tabelas) para uma linha qualquer — reusado na linha ativa,
// no clique da lista por empresa e na montagem do PDF de todos os quadros.
export function quadroMetaHTML(line, ultimaAlteracao){
  const pares = [['Empresa',esc(empNome(line.codempresa)),true],['Registro','RJ-'+esc(line.codempresa||'—')],['Código',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],['Ligação',esc(line.nome_ligacao||'—'),true],['Via',esc(orDash(line.via))],['Característica',esc(orDash(line.caracteristica))],['Tipo',esc(orDash(line.tipo))],['Situação',situacaoHTML(line),true]];
  if(ultimaAlteracao!==undefined) pares.push(['Última alteração',fmtDate(ultimaAlteracao)]);
  return metaRows(pares);
}

export function quadroDocInner(line, interv, predet, orig){
  return `${quadroMetaHTML(line)}
    ${quadroHorariosBodyHTML(interv, predet, orig)}`;
}

// Busca os quadros (intervalo + predeterminado) de várias linhas de uma vez e agrupa por codlinha.
export async function fetchQHByLines(codlinhas){
  const inList = codlinhas.map(enc).join(',');
  const [interv, predet] = await Promise.all([
    sbFetch('qh_intervalo_teste', `codlinha=in.(${inList})&select=codlinha,cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo&order=id&limit=20000`),
    sbFetch('qh_predeterminado_teste', `codlinha=in.(${inList})&select=codlinha,cod_origem,nome_origem,dia_semana,saida&order=id&limit=30000`)
  ]);
  return { intervBy: groupBy(interv, r=>r.codlinha), predetBy: groupBy(predet, r=>r.codlinha),
           trunc: !!(interv._trunc || predet._trunc) };
}

// Quadro de UMA linha (comportamento clássico do card). O modo "por linha" chama este render via
// `lineSearchRun` — wrapper que fica no `app.js` porque usa `selectLine` (shell puro, sem seam).
export async function renderLinhaQuadro(ctx){
  const { view, gen, host, line } = ctx;
  if(!host || !line) return;
  host.innerHTML = loading();
  try {
    const [interv, predet, qh, secoes, orig] = await Promise.all([
      sbFetch('qh_intervalo_teste', `codlinha=eq.${enc(line.codlinha)}&select=${QH_INTERVALO_FIELDS}&order=id`),
      sbFetch('qh_predeterminado_teste', `codlinha=eq.${enc(line.codlinha)}&select=${QH_PREDET_FIELDS}&order=id`),
      sbFetch('qh_teste', `codlinha=eq.${enc(line.codlinha)}&select=ultima_alteracao&limit=1`),
      sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=${TARIFA_LINHA_FIELDS}&order=secao`),
      getOrigem(), getEmpresas()
    ]);
    if (!interv.length && !predet.length){ host.innerHTML = emptyLinha('quadro de horários'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    const ultima = qh[0]?.ultima_alteracao;
    // bloco de Seções e Tarifas da linha (mesma tabela/builder da Estrutura), fora do #qhResult
    const h3sec = `<h3 class="doc-h3">Seções e Tarifas</h3>`;
    const secBlock = secoes.length ? `${h3sec}${secoesTarifasHTML(secoes)}` : '';
    commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Quadro de Horários')}${quadroMetaHTML(line, ultima)}${secBlock}${quadroHorariosBodyHTML(interv, predet, orig)}</div>` });
    // filtros por sentido (origem das partidas) e por dia — o PDF segue completo
    const sentidoKey = (cod,nome)=> orig[cod] || nome || ('Origem '+orDash(cod));
    const sentidos = [...new Set([...interv.map(r=>sentidoKey(r.cod_origem,r.nome_origem)), ...predet.map(r=>sentidoKey(r.cod_origem,r.nome_origem))])].filter(Boolean).sort((a,b)=>a.localeCompare(b));
    const dias = [...new Set([...interv,...predet].map(r=>r.dia_semana||'—'))].filter(v=>v&&v!=='—').sort((a,b)=>a.localeCompare(b));
    const sentSel = sentidos.length>1 ? `<label>Sentido <select id="qhSent"><option value="">Todos</option>${sentidos.map(s=>`<option value="${esc(s)}">de ${esc(s)}</option>`).join('')}</select></label>` : '';
    const diaSel  = dias.length>1 ? `<label>Dia <select id="qhDia"><option value="">Todos</option>${dias.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label>` : '';
    const tools = (sentSel||diaSel) ? `<div class="loc-tools">${sentSel}${diaSel}</div>` : '';
    host.innerHTML = `${quadroMetaHTML(line, ultima)}${secBlock}${tools}<div id="qhResult"></div>`;
    const result = host.querySelector('#qhResult'), ss = host.querySelector('#qhSent'), ds = host.querySelector('#qhDia');
    const paint = ()=>{
      const s = ss?ss.value:'', d = ds?ds.value:'';
      const fi = interv.filter(r=>(!s||sentidoKey(r.cod_origem,r.nome_origem)===s)&&(!d||(r.dia_semana||'—')===d));
      const fp = predet.filter(r=>(!s||sentidoKey(r.cod_origem,r.nome_origem)===s)&&(!d||(r.dia_semana||'—')===d));
      result.innerHTML = quadroHorariosBodyHTML(fi, fp, orig);
    };
    if(ss) ss.addEventListener('change', paint);
    if(ds) ds.addEventListener('change', paint);
    paint();
  } catch(e){ host.innerHTML = errorBox(e.message); }
}

// O adaptador `renderActiveLineQuadro = host => renderLinhaQuadro(host, activeLine)` existia só
// porque o contrato antigo separava o container da linha e obrigava a ir buscar a segunda no
// global. Com o ctx a linha vem dentro dele: a chamada é `renderLinhaQuadro(ctx)`, direta.

// Modo empresa: resolve a empresa e lista as linhas com quadro
export async function quadroEmpresaRun(ctx, term){
  const { view, gen, host, line } = ctx;
  term = (term||'').trim();
  if(!term){
    if(line) return renderLinhaQuadro(ctx);
    host.innerHTML = emptyBox('Busque por uma empresa (nome ou código), ou selecione uma linha.');
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  await getEmpresas();
  const emps = searchEmpresas(term);
  if(emps.length > 1){
    host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para abrir os quadros' });
    bindEmpresaRows(host, (cod,nome)=>renderEmpresaQuadros(ctx, cod, nome));
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  const cod = emps.length===1 ? emps[0].codempresa : term;
  const nome = emps.length===1 ? emps[0].nome_empresa : null;
  await renderEmpresaQuadros(ctx, cod, nome);
}

// Lista as linhas (com quadro) de uma empresa e prepara o PDF de todos os quadros
export async function renderEmpresaQuadros(ctx, cod, nome){
  const { view, gen, host } = ctx;
  host.innerHTML = loading();
  const [linhas, orig] = await Promise.all([
    sbFetch('tabela_vista_teste', `codempresa=eq.${enc(cod)}&select=${LINE_FIELDS}&order=codlinha&limit=500`),
    getOrigem(), getEmpresas()
  ]);
  const nomeEmp = nome || empNome(cod);
  if(!linhas.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para a empresa '+esc(nomeEmp)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const { intervBy, predetBy, trunc } = await fetchQHByLines(linhas.map(l=>l.codlinha));
  const comQuadro = linhas.filter(l => intervBy.has(l.codlinha) || predetBy.has(l.codlinha));
  if(!comQuadro.length){ host.innerHTML = emptyBox('Nenhum quadro de horários cadastrado para as linhas da empresa '+esc(nomeEmp)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  // PDF: todos os quadros, um por página
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${comQuadro.map(l=>
    `<div class="ev-page">${docHead('Quadro de Horários')}${quadroDocInner(l, intervBy.get(l.codlinha)||[], predetBy.get(l.codlinha)||[], orig)}</div>`).join('')}</div>` });
  host.innerHTML = `<div class="doc-obs tight"><b>${esc(nomeEmp)}</b> · ${linhas.length} linha(s), ${comQuadro.length} com quadro de horários.
      Use o botão <b>PDF</b> da barra acima para baixar todos os quadros (um por página).</div>`
    + (trunc? `<div class="trunc-aviso"><b>Resultado parcial:</b> a empresa tem muitos horários e alguns podem não ter sido carregados.</div>`:'')
    + `<div id="eqResult"></div>`;
  // clique numa linha → quadro individual (com voltar). data-cod=codlinha → fatia-safe.
  // Reusa o mesmo view/gen da lista: é ação síncrona (sem fetch próprio), o clique mais
  // recente sempre vence naturalmente (JS de thread única), sem precisar de nova geração.
  const abrirQuadro = tr=>{
    const l = comQuadro.find(x=>String(x.codlinha)===String(tr.dataset.cod));
    if(!l) return;
    const iv = intervBy.get(l.codlinha)||[], pd = predetBy.get(l.codlinha)||[];
    host.innerHTML = `<button type="button" class="qh-back">‹ Voltar à lista da empresa</button>`
      + quadroDocInner(l, iv, pd, orig);
    commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Quadro de Horários')}${quadroDocInner(l, iv, pd, orig)}</div>` });
    host.querySelector('.qh-back').addEventListener('click', ()=>renderEmpresaQuadros(ctx, cod, nome));
  };
  paginateTable(host.querySelector('#eqResult'), comQuadro, {
    cols:[{t:'Número',w:'110px'},{t:'Ligação'},{t:'Código',w:'130px'}],
    rowHTML:l=>`<tr class="clickable" tabindex="0" role="button" data-cod="${esc(l.codlinha)}">
      <td class="td-num" data-label="Número">${esc(l.numero_ligacao||fmtCode(l.codlinha))}</td>
      <td class="td-logr" data-label="Ligação">${fmtLineName(l.nome_ligacao)}</td>
      <td class="td-num" data-label="Código">${esc(fmtCode(l.codlinha))}</td></tr>`,
    foot:t=>t+' linha(s) com quadro · clique para ver o quadro',
    bind:c=>c.querySelectorAll('tr[data-cod]').forEach(tr=>tr.addEventListener('click',()=>abrirQuadro(tr))),
    unit:'linhas', pdf:false, view, gen,   // o PDF desta tela é "todos os quadros" (definido acima), não a lista
  });
}

/* ================================================================
   DOC · Empresas — Ligações · Seções · Histórico
   `LOADERS.empresasRegulares`/`openEmpresaLigacoes` NÃO estão aqui — dependem de `runView`,
   que é shell puro; ver a nota no topo do arquivo.
   ================================================================ */

// Modo "por empresa": resolve o(s) código(s) e lista as ligações. Corpo do antigo `onRun` de
// `LOADERS.ligacoesPorEmpresa`, extraído para o `LOADERS.*` virar wrapper fino (mesmo padrão de
// `tarifaEmpresaRun` na C2).
export async function ligacoesPorEmpresaRun(ctx, term){
  const { view, gen, host } = ctx;
  if(!term){ host.innerHTML=emptyBox('Informe o código ou nome da empresa.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  await getEmpresas();
  let cods = [];
  if(/^\d+$/.test(term.trim())){
    cods = [term.trim()];
  } else {
    const t = norm(term);
    cods = Object.entries(empresasMap()).filter(([,n])=>norm(n||'').includes(t)).map(([c])=>c);
    if(!cods.length){ host.innerHTML=emptyBox('Nenhuma empresa encontrada para "'+esc(term)+'".'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  }
  const filter = cods.length===1 ? `codempresa=eq.${enc(cods[0])}` : `codempresa=in.(${cods.map(enc).join(',')})`;
  const rows = await sbFetch('tabela_vista_teste', `${filter}&select=${LINE_FIELDS}&order=nome_ligacao&limit=500`);
  lineResults(host, rows, { view, gen });
}

// Corpo do antigo `onRun` de `LOADERS.secoesPorEmpresa`.
export async function secoesPorEmpresaRun(ctx, term){
  const { view, gen, host } = ctx;
  if(!term){ host.innerHTML=emptyBox('Informe o código da empresa.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const rows = await sbFetch('tarifa_atual_teste', `codempresa=eq.${enc(term)}&select=codlinha,secao,nome_ligacao&order=codlinha&limit=1000`);
  if(!rows.length){ host.innerHTML=emptyBox('Nenhuma seção cadastrada para a empresa '+esc(term)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const cols = [{t:'Linha',w:'110px'},{t:'Seção',w:'70px'},{t:'Descrição'}];
  const rowHTML = r=>`<tr><td class="td-num">${esc(fmtCode(r.codlinha))}</td><td class="td-num">${esc(orDash(r.secao))}</td><td class="td-logr">${esc(orDash(r.nome_ligacao))}</td></tr>`;
  host.innerHTML = `<div class="loc-tools"><label>Filtrar <input type="text" id="secF" placeholder="seção, linha ou descrição" autocomplete="off"></label></div><div id="secResult"></div>`;
  const result = host.querySelector('#secResult'), inp = host.querySelector('#secF');
  const paint = ()=>{
    const q = norm(inp.value.trim());
    const f = q ? rows.filter(r=>norm(`${orDash(r.secao)} ${fmtCode(r.codlinha)} ${r.codlinha} ${r.nome_ligacao||''}`).includes(q)) : rows;
    if(!f.length){ result.innerHTML = emptyBox('Nenhuma seção com esse filtro.'); return; }
    paginateTable(result, f, { cols, rowHTML:r=>rowHTML(r), foot:t=>t+' seção(ões)', unit:'seções', view, gen });
  };
  inp.addEventListener('input', debounce(paint));
  paint();
}

// Renderiza o histórico (paginado) de UMA empresa dentro de um container
export async function renderEmpresaHistory(ctx, cod, nome){
  const { view, gen, host } = ctx;
  const [rows, lk, empRows] = await Promise.all([
    sbFetch('evento_teste', `codempresa=eq.${enc(cod)}&select=${EVENTO_FIELDS}&order=data_registro.asc&limit=500`),
    getEvLookups(),
    sbFetch('codempresa_teste', `codempresa=eq.${enc(cod)}&select=nome_empresa,situacao,processo,data_publicacao,cassada,sob_intervencao&limit=1`)
  ]);
  const E = empRows[0] || {};
  const head = docHead('Histórico da Empresa');
  const empSit = [ boolChip(E.cassada,'Cassada'), boolChip(E.sob_intervencao,'Sob intervenção') ].filter(Boolean).join(' ') || '<span class="chip chip-off">Regular</span>';
  const meta = metaRows([['Empresa',esc(nome||E.nome_empresa||'—'),true],['Código da Empresa',esc(cod)],['Situação',esc(orDash(E.situacao))],['Processo',esc(orDash(E.processo))],['Publicação',fmtDate(E.data_publicacao)],['Situação cadastral',empSit,true],['Total',rows.length+' evento(s)']]);
  if(!rows.length){ host.innerHTML = meta + emptyBox('Nenhum evento para a empresa '+esc(cod)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const build = r => evBandHTML(r, 'Tipo Evento Empresa', lk.emp?.[r.evento_empresa]||lk.lin?.[r.evento_linha]||'—', !!(r.codlinha)) + evBlocksHTML(r);
  const pdfFrom = list => `<div class="doc">${list.map(r=>`<div class="ev-page">${head}${meta}${build(r)}</div>`).join('')}</div>`;
  paginateEvents(host, rows, build, meta, { view, gen, onFilter:(vis)=>{ commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(vis) }); } });
  commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(rows) });
}

// Corpo do antigo `onRun` de `LOADERS.historicoEmpresa`.
export async function historicoEmpresaRun(ctx, term){
  const { view, gen, host } = ctx;
  term = (term||'').trim();
  if(!term){ host.innerHTML=emptyBox('Busque pelo nome ou código da empresa.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  // busca client-side sobre o cadastro completo → insensível a maiúsc./minúsc. E acento
  await getEmpresas();
  const emps = searchEmpresas(term);
  if(emps.length === 1){ await renderEmpresaHistory(ctx, emps[0].codempresa, emps[0].nome_empresa); return; }
  if(emps.length > 1){
    host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para ver o histórico', sitWidth:'170px',
      extraChips:e=>boolChip(e.cassada,'cassada')+boolChip(e.sob_intervencao,'interv.') });
    bindEmpresaRows(host, (cod,nome)=>renderEmpresaHistory(ctx, cod, nome));
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  // não achou no cadastro de nomes → tenta o termo como código direto nos eventos
  await renderEmpresaHistory(ctx, term, null);
}

export async function frotaPorEmpresa({ view, gen, pane }){
  const [rows] = await Promise.all([
    sbFetch('qh_teste', 'select=codempresa,hierarquia,frota_operacional,reserva&limit=10000'),
    getEmpresas()
  ]);
  if(!isCurrentGen(view, gen)) return;
  if(!rows.length){
    pane.innerHTML = `<div class="doc">${docHead('Frota por Empresa')}${emptyBox('Nenhuma frota cadastrada.')}</div>`;
    commitViewResult(view, gen, { pdfHTML:null });
    return;
  }
  const fmtN = n => n.toLocaleString('pt-BR');
  const { totOp, totRes, porEmp, porHier } = resumoFrota(rows);
  const frotaEmpresas = porEmp.map(e=>{
    const cadastro = empresaPorCod(e.cod);
    return { ...e, nome_empresa:cadastro?.nome_empresa || empNome(e.cod), situacao:cadastro?.situacao || '' };
  });
  const h3 = t => `<h3 class="doc-h3">${t}</h3>`;
  const kpisHTML = `<div class="kpi-grid">
      <div class="kpi"><b>${fmtN(totOp)}</b><span>Frota operacional</span></div>
      <div class="kpi"><b>${fmtN(totRes)}</b><span>Reserva</span></div>
      <div class="kpi"><b>${rows.length}</b><span>Linhas</span></div>
      <div class="kpi"><b>${porEmp.length}</b><span>Empresas</span></div>
      <div class="kpi"><b>${porHier.length}</b><span>Hierarquias</span></div>
    </div>`;
  const empCols = [{t:'RJ',w:'62px'},{t:'Empresa'},{t:'Linhas',w:'78px'},{t:'Operacional',w:'108px'},{t:'Reserva',w:'90px'}];
  const empRowHTML = e=>`<tr><td class="td-num">${esc(e.cod)}</td><td class="td-logr">${esc(e.nome_empresa)}</td><td class="td-num">${e.n}</td><td class="td-sentido">${fmtN(e.op)}</td><td class="td-num">${fmtN(e.res)}</td></tr>`;
  const empTableHTML = items=>tableHTML(empCols, items.map(empRowHTML).join(''), `${items.length} empresa(s)`);
  const hierHTML = tableHTML([{t:'Hierarquia'},{t:'Linhas',w:'78px'},{t:'Operacional',w:'108px'},{t:'Reserva',w:'90px'}],
    porHier.map(x=>`<tr><td class="td-logr">${esc(orDash(x.h))}</td><td class="td-num">${x.n}</td><td class="td-sentido">${fmtN(x.op)}</td><td class="td-num">${fmtN(x.res)}</td></tr>`).join(''));
  const footHTML = `<div class="doc-foot">Consolidado sobre ${rows.length} linhas · cadastro DETRO-RJ · DIVAT</div>`;
  const pdfHTML = items=>`<div class="doc">${docHead('Frota por Empresa')}${bannerTrunc(rows)}${kpisHTML}
    ${h3('Frota por empresa')}${items.length ? empTableHTML(items) : emptyBox('Nenhuma empresa com esse filtro.')}
    ${h3('Frota por hierarquia')}${hierHTML}${footHTML}</div>`;
  pane.innerHTML = `<div class="doc">${docHead('Frota por Empresa')}
    ${bannerTrunc(rows)}${kpisHTML}
    ${h3('Frota por empresa')}
    <div class="loc-tools">
      <label>Situação <select id="frotaEmpSit"><option value="todas">Todas</option><option value="ativas" selected>Ativas</option><option value="canceladas">Canceladas</option></select></label>
      <label>Buscar <input type="text" id="frotaEmpBusca" placeholder="nome ou RJ" autocomplete="off"></label>
    </div>
    <div id="frotaEmpResult"></div>
    ${h3('Frota por hierarquia')}${hierHTML}${footHTML}</div>`;
  const result = pane.querySelector('#frotaEmpResult');
  const sel = pane.querySelector('#frotaEmpSit'), inp = pane.querySelector('#frotaEmpBusca');
  const paint = ()=>{
    const filtradas = filtrarFrotaEmpresas(frotaEmpresas, sel.value, inp.value);
    if(!filtradas.length) result.innerHTML = emptyBox('Nenhuma empresa com esse filtro.');
    else paginateTable(result, filtradas, {
      cols:empCols, rowHTML:empRowHTML, foot:t=>t+' empresa(s)', unit:'empresas',
      pageSize:25, pdf:false, view, gen,
    });
    commitViewResult(view, gen, { pdfHTML:()=>pdfHTML(filtradas) });
  };
  sel.addEventListener('change', paint);
  inp.addEventListener('input', debounce(paint));
  paint();
}
