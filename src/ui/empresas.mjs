/* Chooser de EMPRESA — busca por nome/código, tabela de escolha, e o bind de clique. Nasceu
   nesta fase (C2) porque `renderTarifasEmpresa`/`tarifaEmpresaRun` (Tarifas, agora em
   `src/documentos/estrutura-tarifas-portaria.mjs`) precisam dele, e ele já era usado por MAIS
   DE UMA família antes disso: o modo "por empresa" do Quadro de Horários (C3, `app.js`,
   `quadroEmpresaRun`) e o Histórico da Empresa (C3, `app.js`, `renderEmpresaHistory`). Mesmo
   critério do `src/ui/blocos.mjs` — usado por ≥2 famílias, não fica em nenhuma delas —, mas o
   endereço é outro porque `bindEmpresaRows` toca DOM (`querySelectorAll`/`addEventListener`), e
   o contrato de `blocos.mjs` é "nada de DOM, só string de HTML". O precedente é
   `src/ui/listas.mjs`: markup + bind convivem lá (`linhasTable`/`bindLineRows`) pelo mesmo
   motivo — é a família de UI de uma coisa (linha / empresa), não um agrupamento por camada.

   `searchEmpresas` é busca de LISTA (filtra o cache que `getEmpresas()`, em
   `src/data/lookups.mjs`, mantém) — não é fetch, por isso não mora lá; é UI de interface
   (alimenta o chooser), não markup nem DOM, por isso não mora em `blocos.mjs` nem em
   `doc.mjs`. Fica aqui, ao lado de quem a consome. */
import { esc, orDash, norm } from '../domain/core.mjs';
import { tableHTML } from './doc.mjs';
import { empresasList } from '../data/lookups.mjs';

// busca empresas por nome (insensível a acento) ou código — assume getEmpresas() já carregado.
export function searchEmpresas(term, { limit = 40 } = {}){
  const nt = norm(term);
  return empresasList()
    .filter(e => norm(e.nome_empresa).includes(nt) || String(e.codempresa||'').includes(term))
    .sort((a,b)=> String(a.nome_empresa||'').localeCompare(String(b.nome_empresa||'')))
    .slice(0, limit);
}

// tabela de empresas p/ escolher (código/nome/situação) — `extraChips(e)` acrescenta chips à situação
export function empresaChooserHTML(emps, { prompt, sitWidth = '150px', extraChips } = {}){
  const body = emps.map(e=>`<tr class="clickable" tabindex="0" role="button" data-emp="${esc(e.codempresa)}" data-nome="${esc(e.nome_empresa||'')}">
    <td class="td-num">${esc(e.codempresa)}</td><td class="td-logr">${esc(e.nome_empresa||'—')}</td><td class="td-tipo">${esc(orDash(e.situacao))}${extraChips? ' '+extraChips(e):''}</td></tr>`).join('');
  return `<p class="doc-note">${emps.length} empresa(s) encontradas — ${prompt}:</p>`
    + tableHTML([{t:'Código',w:'90px'},{t:'Empresa'},{t:'Situação',w:sitWidth}], body, emps.length+' empresa(s)');
}

export function bindEmpresaRows(host, fn){
  host.querySelectorAll('tr[data-emp]').forEach(tr=>tr.addEventListener('click',()=>fn(tr.dataset.emp, tr.dataset.nome)));
}
