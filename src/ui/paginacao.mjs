// PAGINAÇÃO DE TELA — agnóstica de conteúdo. A paginação daqui é **só visual**: os dados e o PDF
// nunca são cortados (ver docs/estrutura-frontend.md §4). Quem lista LINHA usa os wrappers de
// `src/ui/listas.mjs`, que compõem sobre o `paginate` daqui.
//
// Os três recebem `view`/`gen` de quem os chama, nunca capturam os próprios: eles rodam DEPOIS
// do `await` do chamador, e capturar aqui seria tarde demais para o guard significar alguma
// coisa. Ver o contrato no cabeçalho da seção MODAL do app.js e `isCurrentGen` em
// `src/domain/view-state.mjs`.

import { norm, debounce } from '../domain/core.mjs';
import { matchEvent } from '../domain/busca.mjs';
import { isCurrentGen, commitViewResult, pageBounds } from '../domain/view-state.mjs';
import { docHead, tableHTML } from './doc.mjs';

// Núcleo de paginação POR FATIA, agnóstico de conteúdo. Reusa o visual do paginador de eventos
// (.doc-pager/.pg-*) e o `pageBounds` (matemática pura, testada em tests/pure.test.js).
// `renderSlice(start,end)` devolve o HTML da página; `afterPaint(slot)` (opcional) religa
// cliques; `unit` rotula o .pg-info. Sem barra quando total <= pageSize.
// `view`/`gen`: guardam a escrita inicial em `container.innerHTML` (não só o pdfHTML — ver
// `isCurrentGen`) contra uma resposta atrasada de uma busca/troca de linha anterior pintando a
// tabela errada por cima de uma mais nova, mesmo DENTRO do mesmo painel (host ainda anexado).
// Cliques de página (prev/next/ir) que rodam DEPOIS não reconferem: já pertencem ao commit
// vencedor — se uma busca mais nova tivesse ganho, este container nem teria sido escrito.
export function paginate(container, total, renderSlice, { pageSize=25, afterPaint, unit='itens', view, gen } = {}){
  if (!isCurrentGen(view, gen)) return;
  if(total <= pageSize){
    container.innerHTML = renderSlice(0, total);
    if(afterPaint) afterPaint(container);
    return;
  }
  container.innerHTML = `<div class="pg-slot"></div>
    <div class="doc-pager">
      <button class="pg-btn" type="button" data-pg="prev">‹ Anterior</button>
      <span class="pg-info"></span>
      <span class="pg-goto">ir p/ <input type="number" class="pg-num" min="1" aria-label="Ir para a página nº"> <button class="pg-btn pg-go" type="button">Ir</button></span>
      <button class="pg-btn" type="button" data-pg="next">Próxima ›</button></div>`;
  const slot=container.querySelector('.pg-slot'), info=container.querySelector('.pg-info');
  const prev=container.querySelector('[data-pg="prev"]'), next=container.querySelector('[data-pg="next"]'), num=container.querySelector('.pg-num');
  let page=1;
  const paint = ()=>{
    const b=pageBounds(total, pageSize, page); page=b.page;
    slot.innerHTML = renderSlice(b.start, b.end); if(afterPaint) afterPaint(slot);
    info.textContent = `Página ${b.page} de ${b.totalPages} · ${total} ${unit}`;
    prev.disabled = b.page<=1; next.disabled = b.page>=b.totalPages; num.max = b.totalPages;
  };
  paint();
  const nav = d => ()=>{ page += d; paint(); container.scrollIntoView({block:'start'}); };
  prev.addEventListener('click', ()=>{ if(!prev.disabled) nav(-1)(); });
  next.addEventListener('click', ()=>{ if(!next.disabled) nav(1)(); });
  const doGo = ()=>{ const v=parseInt(num.value,10); if(!isNaN(v)){ page=v; paint(); container.scrollIntoView({block:'start'}); } };
  container.querySelector('.pg-go').addEventListener('click', doGo);
  num.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doGo(); } });
}

// Paginador de TABELA homogênea: cada página é um tableHTML da fatia. `rowHTML(item, i)` recebe
// o índice GLOBAL (i = posição na lista inteira) — assim data-idx continua batendo com a lista
// completa mesmo paginado. `foot(total)` monta o rodapé com o TOTAL. `bind(slot)` religa cliques.
// `view`/`gen` vêm de quem chamou (capturados com `const view = currentView, gen =
// beginGen(view)` ANTES do próprio await) — paginateTable não tem await próprio, então
// capturar aqui seria tarde demais, e usar a view ATUAL escreveria na aba errada quando quem
// chamou já não é mais ela (troca de view no meio do caminho).
export function paginateTable(container, items, { cols, rowHTML, foot, bind, cls='', pageSize=25, unit='itens', pdf=true, view, gen } = {}){
  const total = items.length;
  const renderSlice = (s,e)=>tableHTML(cols, items.slice(s,e).map((it,j)=>rowHTML(it, s+j)).join(''),
    typeof foot==='function' ? foot(total) : foot, cls);
  paginate(container, total, renderSlice, { pageSize, afterPaint:bind, unit, view, gen });
  // PDF = lista INTEIRA (a paginação é só de tela). `pdf:false` p/ quem já define o próprio pdfHTML.
  if(pdf && view) commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead(view.title)}${renderSlice(0, total)}</div>` });
}

/* --- Histórico de eventos — o paginador de UM item por página ----- */
// `pagerHTML` e `eventFilterBarHTML` são privados do módulo: só o paginateEvents os usa.
function pagerHTML(total){
  if (total <= 1) return '';
  return `<div class="doc-pager">
    <button class="pg-btn" type="button" data-pg="prev">‹ Evento anterior</button>
    <span class="pg-info"></span>
    <span class="pg-goto">ir p/ <input type="number" class="pg-num" min="1" max="${total}" aria-label="Ir para o evento nº"> <button class="pg-btn pg-go" type="button">Ir</button></span>
    <button class="pg-btn" type="button" data-pg="next">Próximo evento ›</button></div>`;
}
// barra de filtros do histórico (texto, nº do processo e ano)
function eventFilterBarHTML(){
  return `<div class="ev-filters">
    <label class="evf evf-wide">Texto (descrição/observação)<input type="text" data-f="text" placeholder="ex.: reformulação"></label>
    <label class="evf">Nº do processo<input type="text" data-f="proc" placeholder="ex.: 2.599/46"></label>
    <label class="evf">Ano<input type="number" data-f="ano" min="1900" max="2100" placeholder="aaaa"></label>
    <button type="button" class="evf-clear">Limpar filtros</button>
  </div>`;
}
// `yearOf`/`matchEvent` (o filtro deste paginador) moram em `src/domain/busca.mjs`.
// Paginador (um evento por vez) com filtros, "ir para a página N" e callback de filtro p/ PDF.
// `opts.view`/`opts.gen` guardam a escrita inicial em `container.innerHTML` (ver `isCurrentGen`
// junto a `paginate`) — filtros digitados depois só alternam `.hid` em nós já commitados, sem
// reescrever a partir do zero, então não precisam reconferir.
export function paginateEvents(container, rows, buildPage, headerHTML='', opts={}){
  if (!isCurrentGen(opts.view, opts.gen)) return;
  const total = rows.length;
  let visible = rows.map((_,i)=>i);   // índices visíveis após o filtro
  let page = 1;
  const filtersHTML = total > 1 ? eventFilterBarHTML() : '';
  container.innerHTML = (headerHTML||'') + filtersHTML
    + `<div class="ev-empty hid">Nenhum evento corresponde ao filtro.</div>`
    + rows.map((r,i)=>`<div class="ev-page" data-idx="${i}">${buildPage(r)}</div>`).join('') + pagerHTML(total);
  const pages = [...container.querySelectorAll('.ev-page[data-idx]')];
  const emptyMsg = container.querySelector('.ev-empty');
  const paint = ()=>{
    if (page > visible.length) page = visible.length; if (page < 1) page = 1;
    const cur = visible.length ? visible[page-1] : -1;
    pages.forEach(p=>p.classList.toggle('hid', (+p.dataset.idx) !== cur));
    if (emptyMsg) emptyMsg.classList.toggle('hid', visible.length>0);
    const info = container.querySelector('.pg-info');
    if (info) info.textContent = !visible.length ? '0 eventos'
      : (visible.length===total ? `Evento ${page} de ${total}` : `Evento ${page} de ${visible.length} (de ${total})`);
    const prev = container.querySelector('[data-pg="prev"]'); if (prev) prev.disabled = page <= 1;
    const next = container.querySelector('[data-pg="next"]'); if (next) next.disabled = page >= visible.length;
    const num = container.querySelector('.pg-num'); if (num) num.max = visible.length;
  };
  paint();
  container.querySelectorAll('.pg-btn[data-pg]').forEach(b=>b.addEventListener('click',()=>{
    if (b.disabled) return; page += (b.dataset.pg === 'next' ? 1 : -1); paint();
    container.scrollIntoView({block:'start'});
  }));
  const num = container.querySelector('.pg-num'), go = container.querySelector('.pg-go');
  const doGo = ()=>{ const v = parseInt(num.value,10); if(!isNaN(v)){ page = v; paint(); container.scrollIntoView({block:'start'}); } };
  if (go) go.addEventListener('click', doGo);
  if (num) num.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); doGo(); } });
  // filtros
  const fEls = [...container.querySelectorAll('.ev-filters [data-f]')];
  const readCriteria = ()=>{
    const g = k => (container.querySelector(`.ev-filters [data-f="${k}"]`)?.value || '').trim();
    const a=g('ano');
    return { text:norm(g('text')), proc:norm(g('proc')), ano:a?parseInt(a,10):null };
  };
  const applyFilters = ()=>{
    const c = readCriteria();
    visible = rows.map((_,i)=>i).filter(i=>matchEvent(rows[i], c));
    page = 1; paint();
    if (opts.onFilter) opts.onFilter(visible.map(i=>rows[i]));
  };
  fEls.forEach(el=>el.addEventListener('input', debounce(applyFilters)));
  const clear = container.querySelector('.evf-clear');
  if (clear) clear.addEventListener('click', ()=>{ fEls.forEach(el=>el.value=''); applyFilters(); });
}
