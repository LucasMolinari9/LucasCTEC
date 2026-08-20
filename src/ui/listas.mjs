// LISTAS DE LINHA — a família que quase todo card de consulta usa para mostrar "as linhas que
// casaram": a tabela (`linhasTable`), a barra de situação (`situacaoSelectHTML`), o paginador
// delas (`paginateLines`) e o hub que junta tudo (`lineResults`).
//
// O SEAM DE SELEÇÃO. Clicar numa linha da lista não é paginação: é AÇÃO DE SHELL — seleciona a
// linha, fecha o modal, mexe na rota e avisa por toast. Nada disso cabe num módulo de markup, e
// era o que prendia esta família dentro do IIFE (Fase B2 do plano das fatias 3-4). A saída
// escolhida foi expor o seam: a ação chega por `configurarListas({ aoSelecionarLinha })`, UMA
// vez, no bootstrap do app.js — não encadeada pelos call sites de `lineResults`.
// Por que num ponto só, e não por parâmetro: "selecionar linha e fechar o modal" é UMA ação do
// portal inteiro, não uma variação por tela; encadeá-la por opção até cada call site custaria
// exatamente o modo de falha que o plano descreve — esquecer um deixa aquela tela com as linhas
// **renderizadas e não clicáveis**, sem erro no console. Aqui o esquecimento é impossível de
// passar batido: sem configuração, `bindLineRows` LANÇA na hora de ligar, e o gate de navegador
// (scripts/check_selecao_linha.mjs) fica vermelho.

import { esc, fmtCode, fmtLineName, boolChip } from '../domain/core.mjs';
import { groupBy, countBy, byCodlinha, rjOrder } from '../domain/agrupamento.mjs';
import { commitViewResult, filtrarSituacao } from '../domain/view-state.mjs';
import { empNome } from '../data/lookups.mjs';
import { docHead, tableHTML, emptyBox, bannerTrunc } from './doc.mjs';
import { paginate } from './paginacao.mjs';

let aoSelecionarLinha = null;

/* Liga a família ao que acontece quando o usuário clica numa linha. Chamar UMA vez, no
   bootstrap. `aoSelecionarLinha(row)` recebe a linha já desserializada do `data-row`. */
export function configurarListas({ aoSelecionarLinha: fn } = {}){
  aoSelecionarLinha = fn;
}

// O par que define o filtro de situação continua sendo um só, mas em camadas diferentes: a REGRA
// (`filtrarSituacao`) vem de `src/domain/view-state.mjs`, o MARKUP fica aqui. Quem lista linha
// usa os dois — nunca uma cópia local do `filter(r=>!r.cancelado…)`.
// markup do seletor Todas/Ativas/Canceladas (id `lrStatus` — a CSS de `.loc-tools` já o cobre)
export function situacaoSelectHTML(){
  return `<label>Situação <select id="lrStatus"><option value="todas">Todas</option><option value="ativas">Ativas</option><option value="canceladas">Canceladas</option></select></label>`;
}

export function linhasTable(rows){
  if(!rows.length) return emptyBox('Nenhuma ligação.');
  const body = [...rows].sort(byCodlinha).map(r=>`<tr class="clickable" tabindex="0" role="button" data-row='${esc(JSON.stringify(r))}'>
    <td class="td-logr" data-label="Empresa">${esc(empNome(r.codempresa))}</td>
    <td class="td-num" data-label="RJ">${esc(r.codempresa||'')}</td>
    <td class="td-num" data-label="Código">${esc(fmtCode(r.codlinha))}</td>
    <td class="td-num" data-label="Número">${esc(r.numero_ligacao||'—')}</td>
    <td class="td-logr" data-label="Nome">${fmtLineName(r.nome_ligacao)}</td>
    <td class="td-logr" data-label="Via">${esc(r.via||'—')}</td>
    <td class="td-tipo" data-label="Característica">${esc(r.caracteristica||'—')}</td>
    <td data-label="Tipo">${esc(r.tipo||'')} ${boolChip(r.cancelado,'canc.')}</td></tr>`).join('');
  // "Nome" e "Empresa" ficam sem largura fixa (colunas flexíveis); as secundárias têm largura
  // fixa e enxuta para sobrar mais espaço ao nome da linha.
  return bannerTrunc(rows) + tableHTML([{t:'Empresa',w:'150px'},{t:'RJ',w:'52px'},{t:'Código',w:'108px'},{t:'Número',w:'82px'},{t:'Nome'},{t:'Via',w:'110px'},{t:'Característica',w:'100px'},{t:'Tipo',w:'95px'}], body, rows.length+' ligação(ões) · clique para abrir', 'stack');
}

// Liga o clique de qualquer elemento com `data-row` (a <tr> da tabela OU o cabeçalho de linha do
// relatório de seções) à ação de seleção configurada.
// `host` é OBRIGATÓRIO — o antigo `(host||modalBody)` caía num nó global que este módulo não tem,
// e nenhum dos call sites o usava (os dois chegam pelo `afterPaint`, que sempre passa o slot).
// Falha aqui, na LIGAÇÃO, e não no clique: linha que só quebra quando o usuário clica é
// exatamente o silêncio que este seam existe para evitar.
export function bindLineRows(host){
  if (typeof aoSelecionarLinha !== 'function'){
    throw new Error('src/ui/listas.mjs: configurarListas({ aoSelecionarLinha }) não foi chamado');
  }
  if (!host) throw new Error('src/ui/listas.mjs: bindLineRows(host) precisa do container');
  host.querySelectorAll('[data-row]').forEach(el=>el.addEventListener('click',()=>{
    aoSelecionarLinha(JSON.parse(el.dataset.row));
  }));
}

// Paginador de LISTAS de linha (25/página). `grouped` insere os cabeçalhos de empresa DENTRO de
// cada página; a contagem do cabeçalho é a do grupo INTEIRO (não só a da página).
// `view`/`gen` — mesma observação do paginateTable (src/ui/paginacao.mjs).
export function paginateLines(container, rows, { grouped=false, pageSize=25, pdf=true, view, gen } = {}){
  const groupTotals = grouped ? countBy(rows, r=>r.codempresa||'—') : null;
  const renderSlice = (s,e)=>{
    const slice = rows.slice(s,e);
    return grouped
      ? [...groupBy(slice, r=>r.codempresa||'—')].map(([cod,seg])=>
          `<h3 class="loc-emp-head">${esc(empNome(cod))} <span class="loc-emp-rj">RJ-${esc(cod||'—')} · ${groupTotals.get(cod)} linha(s)</span></h3>${linhasTable(seg)}`).join('')
      : linhasTable(slice);
  };
  paginate(container, rows.length, renderSlice, { pageSize, afterPaint:bindLineRows, unit:'linhas', view, gen });
  // PDF = todas as linhas (a paginação é só de tela). `pdf:false` p/ quem já define um pdfHTML
  // próprio mais rico (ex.: Município com meta/aviso).
  if(pdf && view) commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead(view.title)}${renderSlice(0, rows.length)}</div>` });
}

// Lista de linhas com barra de filtro (situação) + agrupamento por empresa LIGADO por padrão,
// com os grupos ordenados pelo RJ (codempresa). Padrão de qualquer consulta que lista linhas.
// `prefixHTML` entra antes da barra (contadores/banner). Requer getEmpresas() já carregado.
// `view`/`gen` — repassados pra paginateLines (ver observação lá).
export function lineResults(host, rows, { prefixHTML='', pdf=true, view, gen } = {}){
  if(!rows || !rows.length){ host.innerHTML = prefixHTML + emptyBox('Nenhuma ligação encontrada.'); return; }
  // bannerTrunc(rows) uma vez no topo: avisa "Resultado parcial" quando a QUERY atingiu o teto
  // (limit). A paginação abaixo exibe tudo em páginas — não corta mais no cliente.
  host.innerHTML = prefixHTML + bannerTrunc(rows)
    + `<div class="loc-tools">
         ${situacaoSelectHTML()}
         <label><input type="checkbox" id="lrGroup" checked> Agrupar por empresa</label>
       </div>
       <div id="lrResult"></div>`;
  const result = host.querySelector('#lrResult');
  const statusSel = host.querySelector('#lrStatus'), groupChk = host.querySelector('#lrGroup');
  const paint = ()=>{
    const f = filtrarSituacao(rows, statusSel.value);
    if(!f.length){ result.innerHTML = emptyBox('Nenhuma linha com esse filtro.'); return; }
    if(groupChk.checked){
      // achata os grupos (empresas por RJ; linhas por codlinha) num array global e pagina
      // contando TODAS as linhas — os cabeçalhos de empresa entram dentro de cada página.
      const ordered = [...groupBy(f, r=>r.codempresa||'—')].sort((x,y)=>rjOrder(x[0],y[0]))
        .flatMap(([,rs])=>[...rs].sort(byCodlinha));
      paginateLines(result, ordered, { grouped:true, pdf, view, gen });
    } else {
      paginateLines(result, [...f].sort(byCodlinha), { grouped:false, pdf, view, gen });
    }
  };
  statusSel.addEventListener('change', paint);
  groupChk.addEventListener('change', paint);
  paint();
}
