/* Família C1 — Frota · Histórico da linha · Itinerários.

   Os três documentos de UMA linha que não consolidam nada: cada um faz uma consulta, monta o
   cabeçalho de meta e pinta um bloco. São a primeira família a sair do `app.js` inteira, e saem
   porque a Fase A lhes deu o `ctx` (`docs/estrutura-frontend.md` §5): nenhum render aqui lê
   `currentView`, `activeLine` ou `modalBody` — tudo vem em `ctx = { view, gen, pane, host, line }`.

   O QUE FICOU NO `app.js`, e não é falha: os três registros `LOADERS.*` são one-liners de SHELL
   (`lineDocView`/`searchPanel` + `lineSearchRun`, os wrappers de busca de linha). O plano vivo
   põe esses wrappers na Fase E e a composição do registro na Fase D — forçá-los agora seria
   antecipar duas fases dentro desta.

   O QUE NÃO ESTÁ AQUI E PODERIA PARECER QUE DEVIA: `evBandHTML`/`evBlocksHTML`,
   `itinerarioTableHTML` e `frotaBlockHTML`. Os três são markup que OUTRAS famílias também usam
   (Estrutura, em C2; Histórico da empresa, em C3), e por isso moram em `../ui/blocos.mjs` — a
   razão está escrita lá, e é o que impede um ciclo entre módulos de família. */
import { esc, enc, fmtCode, fmtDate, orDash, situacaoHTML } from '../domain/core.mjs';
import { commitViewResult } from '../domain/view-state.mjs';
import { docHead, metaRows, loading, emptyLinha } from '../ui/doc.mjs';
import { paginateEvents } from '../ui/paginacao.mjs';
import { evBandHTML, evBlocksHTML, itinerarioTableHTML, frotaBlockHTML, SENTIDO_ORDER, normSentido } from '../ui/blocos.mjs';
import { getIbge, getEmpresas, empNome, getEvLookups } from '../data/lookups.mjs';
import { EVENTO_FIELDS, ITINERARIO_FIELDS, FROTA_FIELDS } from '../data/campos.mjs';
import { sbFetch } from '../data/rest.mjs';
import { selecionarLinha } from './shell.mjs';

let _loaderShell = null;
export function configurarLoadersFrotaHistoricoItinerarios(shell){ _loaderShell = shell; }
function loaderShell(){
  if(!_loaderShell) throw new Error('configurarLoadersFrotaHistoricoItinerarios precisa ser chamado antes dos loaders');
  return _loaderShell;
}

export function loadHistoricoLinha(ctx){
  const { searchPanel, lineSearchRun } = loaderShell();
  const pre = ctx.line ? (ctx.line.numero_ligacao || ctx.line.codlinha || '') : '';
  return searchPanel(ctx, { title:'Histórico da Linha', placeholder:'Nome, número ou código da linha', value:pre,
    onRun: (term, rctx) => lineSearchRun(rctx, term, { render:renderLineHistory,
      emptyMsg:'Busque pelo nome, número ou código da linha.', prompt:'clique para ver o histórico' }) });
}
export function loadItinerarios(ctx){
  return loaderShell().lineDocView(ctx, { subtitle:'Cadastro de Linhas: Itinerários', render:renderItinerarios });
}
export function loadFrota(ctx){
  return loaderShell().lineDocView(ctx, { subtitle:'Frota da Linha', render:renderFrota });
}

/* ================================================================
   DOC · Histórico (linha)
   Um evento por página, descrição/observação por extenso. A impressão e o PDF saem com TODOS
   os eventos, um por página — e seguem o filtro aplicado na tela.
   ================================================================ */
export async function renderLineHistory(ctx){
  const { view, gen, host, line } = ctx;
  selecionarLinha(line);   // sincroniza a linha ativa e o banner do topo
  const [rows, lk] = await Promise.all([
    sbFetch('evento_teste', `codlinha=eq.${enc(line.codlinha)}&select=${EVENTO_FIELDS}&order=data_registro.asc&limit=2000`),
    getEvLookups(), getEmpresas()
  ]);
  const head = docHead('Histórico da Linha');
  const meta = metaRows([['Empresa',esc(empNome(line.codempresa)),true],['Registro','RJ-'+esc(orDash(line.codempresa))],['Código da Ligação',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],['Ligação',esc(line.nome_ligacao||'—'),true]]);
  if (!rows.length){ host.innerHTML = meta + emptyLinha('evento'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const build = r => evBandHTML(r, 'Tipo Evento da Linha', lk.lin?.[r.evento_linha] || lk.emp?.[r.evento_empresa] || '—', false) + evBlocksHTML(r);
  // PDF/impressão: um evento por página (cabeçalho repetido); segue o filtro aplicado na tela
  const pdfFrom = list => `<div class="doc">${list.map(r=>`<div class="ev-page">${head}${meta}${build(r)}</div>`).join('')}</div>`;
  paginateEvents(host, rows, build, meta, { view, gen, onFilter:(vis)=>{ commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(vis) }); } });
  commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(rows) });
}

/* ================================================================
   DOC · Itinerários
   ================================================================ */
export async function renderItinerarios(ctx){
  const { view, gen, host, line } = ctx;
  host.innerHTML = loading();
  const [rows, ibge] = await Promise.all([
    sbFetch('itinerario_teste', `codlinha=eq.${enc(line.codlinha)}&select=${ITINERARIO_FIELDS}&order=id`),
    getIbge(), getEmpresas()
  ]);
  if (!rows.length) { host.innerHTML = emptyLinha('itinerário'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const codEmp = rows[0]?.codempresa || line.codempresa || '';
  const meta = metaRows([['Empresa',esc(empNome(codEmp)),true],['Registro','RJ-'+esc(codEmp)],
      ['Código da Ligação',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],
      ['Ligação',esc(line.nome_ligacao||'—'),true],['Via',esc(orDash(line.via))],
      ['Característica',esc(orDash(line.caracteristica))],['Tipo da Ligação',esc(orDash(line.tipo))],
      ['Situação',situacaoHTML(line),true]]);
  const inner = `${meta}${itinerarioTableHTML(rows, ibge)}`;   // documento completo (p/ PDF)
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Cadastro de Linhas: Itinerários')}${inner}</div>` });
  // filtro por sentido — o PDF segue com os dois sentidos
  rows.forEach(r=>r._sn=normSentido(r.sentido));
  const sentidos = [...new Set(rows.map(r=>r._sn))].filter(Boolean).sort((a,b)=>(SENTIDO_ORDER[a]||9)-(SENTIDO_ORDER[b]||9));
  const tools = sentidos.length>1 ? `<div class="loc-tools"><label>Sentido <select id="itiSent"><option value="">Todos</option>${sentidos.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label></div>` : '';
  host.innerHTML = `${meta}${tools}<div id="itiResult"></div>`;
  const result = host.querySelector('#itiResult'), sel = host.querySelector('#itiSent');
  const paint = ()=>{
    const s = sel?sel.value:'';
    const f = s ? rows.filter(r=>r._sn===s) : rows;
    result.innerHTML = itinerarioTableHTML(f, ibge);
  };
  if(sel) sel.addEventListener('change', paint);
  paint();
}

/* ================================================================
   DOC · Frota
   ================================================================ */
export async function renderFrota(ctx){
  const { view, gen, host, line } = ctx;
  host.innerHTML = loading();
  const [rows] = await Promise.all([
    sbFetch('qh_teste', `codlinha=eq.${enc(line.codlinha)}&select=${FROTA_FIELDS}&limit=1`),
    getEmpresas()
  ]);
  if (!rows.length) { host.innerHTML = emptyLinha('frota'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const f = rows[0];
  const inner = `${metaRows([['Empresa',esc(empNome(f.codempresa)),true],['Registro','RJ-'+esc(orDash(f.codempresa))],
      ['Código',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],
      ['Ligação',esc(line.nome_ligacao||'—'),true],['Hierarquia',esc(orDash(f.hierarquia))],['Última alteração',fmtDate(f.ultima_alteracao)]])}
    ${frotaBlockHTML(f)}`;
  host.innerHTML = inner;
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Frota da Linha')}${inner}</div>` });
}
