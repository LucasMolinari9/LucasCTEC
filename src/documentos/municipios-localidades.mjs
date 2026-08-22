/* Família C4 — Municípios · Localidades. A quarta e última família da Fase C a sair inteira.

   POR QUE AS DUAS METADES MORAM NO MESMO ARQUIVO: ao contrário de C1/C2/C3 (famílias distintas
   por nome E por conteúdo), Município e Localidade COMPARTILHAM markup de verdade —
   `renderLocalidadeSecoes`/`pintarLocalidadeSecoes` e os helpers que os cercam (`secoesLocalidadeTable`,
   `locLinhaSecHTML`, `locComSecaoHTML`, `LOC_SEM_SECAO_OBS`) são usados pelo `mostrarLinhasResultado`
   (metade Município) E pelo `mostrarLinhasPorLocalidade` (metade Localidade). Como as duas saem no
   MESMO PR, essa aresta nunca vira aresta ENTRE MÓDULOS — a regra do `src/ui/blocos.mjs` (duas
   famílias → desce pra lá) existe para evitar ciclo entre módulos que saem em PRs diferentes; aqui
   não há PRs diferentes. `distinctCods`/`fetchLinesByCods` (antes em "COMPONENTES AUXILIARES" do
   `app.js`) tiveram o mesmo destino pelo mesmo motivo: toda chamada a eles, sem exceção, vinha de
   dentro desta família — nenhuma família já extraída (C1/C2/C3) os usa.

   O QUARTO SLOT DE `./shell.mjs` — `runView` — EXISTE POR CAUSA DESTA FAMÍLIA. `openLinhasPorIbge`
   ("Linhas no Município") abre uma view NOVA via `runView({...})` — é o drill-down que qualquer
   lista de municípios usa para "entrar" num município. Diferente do caso análogo da C3
   (`openEmpresaLigacoes`, que FICOU no `app.js` porque só uma função-folha dependia de `runView`),
   aqui a dependência não é de folha: `openLinhasPorIbge` é chamada por `municipioRegiaoRun` (linha
   digitada com 1 resultado, tabela de drill-down, chips de região) E por
   `mostrarLinhasEntreMunicipios` (metade Localidade, quando só o campo A é preenchido e casa um
   município só). Deixar `runView` de fora teria prendido as DUAS metades ao `app.js` — não uma
   função pequena. Ver o cabeçalho de `./shell.mjs` para o raciocínio completo.

   O QUE FICOU NO `app.js`, E POR QUÊ — três loaders têm CORPO (preparam `selectOpts`/`suggest`
   ANTES de chamar `searchPanel`, que é shell puro reservado para a Fase E): `LOADERS.ligacoesPorLogradouro`
   (monta `munOpts` de `getIbge()`), `LOADERS.municipioRegiao` (monta `regioes`) e
   `LOADERS.ligacoesPorTerminal` (monta `munOpts`/`suggest`). Mesmo padrão que `LOADERS.tarifas`
   (C2) e `LOADERS.quadroHorarios` (C3): a composição do `searchPanel` é trabalho da Fase D, não
   desta. Os `onRun` de cada um SAÍRAM como `xxxRun(ctx, term, …)`, mesmo padrão que a C2 usou para
   `tarifaEmpresaRun`.

   A DECISÃO SOBRE `secoesPorLigacao`, E A CORREÇÃO AO REGISTRO DA C2: a C2
   (`docs/planos/2026-08-14-modularizacao-fatias-3-4.md`, seção "O achado dos 4 loaders órfãos")
   decidiu que este loader ficaria com a C4, descrevendo-o como uma listagem "por município/
   logradouro". Medido agora (o loader mora sob a marca `DOC · Municípios` desde a C1, mas o corpo
   dele é `LOADERS.secoesPorLigacao = async ({ view, gen, pane, line }) => { const rows = await
   sbFetch('tarifa_atual_teste', \`codlinha=eq.${'${enc(line.codlinha)}'}\`…`): é um documento POR
   LINHA (usa `line.codlinha` do ctx, `needsLine:true` no `SECTIONS`), não por município — a
   descrição da C2 estava errada. A DECISÃO (destino = C4) foi mantida: é um loader autocontido,
   sem dependência de `runView`/`searchPanel`, sem família melhor (Tarifas, a família de que é mais
   próximo por conteúdo, já fechou na C2), e esta é a última fase C. Renomeado para
   `renderSecoesPorLigacao` e exportado como one-liner, mesmo padrão de `LOADERS.portarias`.

   O QUE NÃO ENTROU, E FICA COMO RESTRIÇÃO PARA QUEM MEXER DEPOIS: `LOADERS.frotaPorEmpresa`
   (`app.js`, ~60 linhas) é o único dos "4 loaders órfãos" da C2 que NÃO tem lugar aqui — por
   CONTEÚDO (frota consolidada por empresa e hierarquia, nada de município/localidade) e por
   CATEGORIA (o próprio `SECTIONS` do `app.js` o lista sob o tópico "Empresa", junto de
   `empresasRegulares`/`historicoEmpresa`/`ligacoesPorEmpresa`/`secoesPorEmpresa` — todos C3, já
   fechada). Diferente de `secoesPorLigacao`, incluí-lo aqui violaria a regra do próprio plano
   ("Cada fase C move a SUA família... não junte numa fase final"). Ele não tem bloqueio técnico
   (não usa `runView`/`searchPanel`/`lineSearchRun` — só `sbFetch`, lookups e helpers já
   importáveis), então mover não é o problema; é não ter família. Fica no `app.js`, órfão,
   candidato a uma limpeza pequena e independente (não é trabalho de Fase D — não compõe modos). */
import {
  esc, enc, ilikeTerm, orDash, boolChip, fmtLineName, fmtCode, norm, debounce,
} from '../domain/core.mjs';
import {
  groupBy, countBy, fmtMoney, byCodlinha, rjOrder, classifyMunLines, terminaisDoMunicipio,
} from '../domain/agrupamento.mjs';
import { localidadesQueCasam, orIlike, municipiosExatos } from '../domain/busca.mjs';
import { isCurrentGen, commitViewResult, nextGen, filtrarSituacao } from '../domain/view-state.mjs';
import {
  docHead, metaRows, tableHTML, loading, emptyBox, emptyLinha, errorBox, bannerTrunc,
} from '../ui/doc.mjs';
import { paginate } from '../ui/paginacao.mjs';
import { situacaoSelectHTML, linhasTable, bindLineRows, paginateLines, lineResults } from '../ui/listas.mjs';
import { getIbge, getOrigem, getTerminais, getEmpresas, empNome } from '../data/lookups.mjs';
import { LINE_FIELDS } from '../data/campos.mjs';
import { sbFetch, novoCtx, runView } from './shell.mjs';

/* ================================================================
   Helpers de listagem, usados pelas DUAS metades desta família
   ================================================================ */

// codlinhas distintos (descarta vazios); `limit` opcional corta a lista
export const distinctCods = (rows, limit) => [...new Set(rows.map(r=>r.codlinha).filter(Boolean))].slice(0, limit);

// busca as linhas (tabela_vista) de uma lista de codlinha + garante o cache de empresas
export async function fetchLinesByCods(cods, { limit = 300 } = {}){
  const [rows] = await Promise.all([
    sbFetch('tabela_vista_teste', `codlinha=in.(${cods.map(enc).join(',')})&select=${LINE_FIELDS}&order=nome_ligacao&limit=${limit}`),
    getEmpresas()
  ]);
  return rows;
}

/* ================================================================
   DOC · Municípios / entre-municípios
   ================================================================ */

// linhas (codlinha distintos) cujo itinerário passa por um município (codibge)
//
// `memo` (opcional): Map de UMA execução, para não repetir a mesma consulta dentro da mesma
// busca. NÃO é cache global de propósito — cache global aqui envelheceria em silêncio se o
// Realtime caísse, e precisaria entrar no invalidateCaches; o ganho não paga o acoplamento,
// porque a repetição que importa acontece toda dentro de uma única busca (ver
// mostrarLinhasEntreMunicipios).
export async function linhasNoMunicipio(codibge, memo){
  const chave = String(codibge);
  // guarda a PROMESSA, não o resultado: duas chamadas para o mesmo município no mesmo tick
  // pegam o mesmo voo em vez de disparar dois.
  if (memo && memo.has(chave)) return memo.get(chave);
  const p = (async () => {
    // limite alto de propósito: Rio de Janeiro tem ~13,5 mil trechos de itinerário — com
    // limite menor o conjunto chega incompleto e as interseções entre municípios encolhem
    const rows = await sbFetch('itinerario_teste', `cod_municipio_origem=eq.${enc(codibge)}&select=codlinha&limit=30000`);
    return distinctCods(rows);
  })();
  // promessa REJEITADA sai do memo: senão um erro transitório de rede ficaria memorizado
  // pelo resto da busca e toda combinação seguinte falharia pelo mesmo motivo já superado.
  if (memo){ memo.set(chave, p); p.catch(() => memo.delete(chave)); }
  return p;
}

export function openLinhasPorIbge(codibge, nome){
  runView({ title:'Linhas no Município', tables:['itinerario_teste','tabela_vista_teste','codempresa_teste'], loader: async(ctx)=>{
    const { view, gen, pane } = ctx;
    const it = await sbFetch('itinerario_teste', `cod_municipio_origem=eq.${enc(codibge)}&select=codlinha&limit=4000`);
    const allCods=distinctCods(it);          // total real (sem corte) para o "Total"
    const cods=allCods.slice(0,500);         // teto de listagem (alinha com as views irmãs)
    if(!cods.length){ pane.innerHTML = `<div class="doc">${docHead('Linhas no Município')}${emptyBox('Nenhuma linha registrada em '+(nome||codibge)+'.')}</div>`; return; }
    const rows = await fetchLinesByCods(cods,{limit:500});
    const avisoTrunc = allCods.length>cods.length
      ? `<div class="trunc-aviso"><b>Lista parcial:</b> ${allCods.length} linhas no total; mostrando as primeiras ${cods.length}.</div>` : '';
    pane.innerHTML = `<div class="doc">${docHead('Linhas no Município')}
      ${metaRows([['Município',esc(nome||codibge),true],['Total',allCods.length+' linha(s)']])}
      ${avisoTrunc}
      <div class="loc-tools"><label>Mostrar <select id="munScope">
        <option value="todas">Todas as linhas</option>
        <option value="dentro">Só dentro do município</option>
        <option value="inter">Que vão para outros municípios</option>
      </select></label></div>
      <div id="munResult"></div></div>`;
    const result = pane.querySelector('#munResult');
    const scope  = pane.querySelector('#munScope');
    const metaPdf = metaRows([['Município',esc(nome||codibge),true],['Total',allCods.length+' linha(s)']]);
    // PDF determinístico: lista completa, sem a barra de filtro (evita espaço em branco / subconjunto filtrado)
    commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Linhas no Município')}${metaPdf}${avisoTrunc}${linhasTable(rows)}</div>` });
    // classificação dentro×intermunicipal PREGUIÇOSA: só busca o itinerário completo das
    // linhas quando o usuário escolhe um filtro (o padrão "todas" mantém o custo atual).
    let cls = null;
    async function ensureCls(){
      if(cls) return cls;
      const it2 = await sbFetch('itinerario_teste', `codlinha=in.(${cods.map(enc).join(',')})&select=codlinha,cod_municipio_origem&limit=30000`);
      cls = classifyMunLines(it2, codibge);
      return cls;
    }
    async function paint(){
      // geração PRÓPRIA, derivada do ctx (nextGen preserva view/pane): o usuário pode alternar o
      // filtro de novo antes de ensureCls() (seu próprio await) resolver — mesma corrida que
      // motivou o seam. Montar um ctx do zero aqui acertaria a aba ERRADA se ele tivesse trocado
      // de aba nesse meio-tempo (mesma razão de o `pane` vir capturado).
      const pctx = nextGen(ctx);
      // pdf:false → o PDF do Município é o determinístico definido acima (lista completa + meta)
      if(scope.value==='todas'){ lineResults(result, rows, { pdf:false, view, gen:pctx.gen }); return; }
      result.innerHTML = loading();
      const c = await ensureCls();
      const set = scope.value==='dentro' ? c.dentro : c.inter;
      lineResults(result, rows.filter(r=>set.has(String(r.codlinha))), { pdf:false, view, gen:pctx.gen });
    }
    scope.addEventListener('change', ()=>{ paint().catch(e=>{ result.innerHTML = errorBox(e.message); }); });
    paint();
  }});
}

// Corpo do antigo `onRun` de `LOADERS.ligacoesPorLogradouro` — o loader FICA no `app.js` porque
// monta `munOpts` (de `getIbge()`) antes de chamar `searchPanel`, que é shell reservado à Fase E.
export async function ligacoesPorLogradouroRun(ctx, term, ibgeCod){
  const { view, gen, host } = ctx;
  if(!term){ host.innerHTML=emptyBox('Digite o nome do logradouro.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const ibge = await getIbge();
  // RPC divat_busca_logradouro: busca sem acento/caixa, casando TIPO + NOME do logradouro
  // (ex. "Rua Acre" ou só "Acre" — nome_logradouro sozinho não tem o tipo) e filtra
  // opcionalmente por município (cod_municipio_origem, via p_ibge).
  const qsMun = ibgeCod? `&p_ibge=${enc(ibgeCod)}` : '';
  const it = await sbFetch('rpc/divat_busca_logradouro', `termo=${ilikeTerm(term)}${qsMun}&select=codlinha&limit=2000`);
  const cods=distinctCods(it,500);
  const munTxt = ibgeCod? ` em ${esc(ibge[ibgeCod]?.nome||'')}` : '';
  if(!cods.length){ host.innerHTML=emptyBox(`Nenhuma linha passa por esse logradouro${munTxt}.`); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const rows = await fetchLinesByCods(cods,{limit:500});
  const prefix = bannerTrunc(it) + `<p class="doc-note">${cods.length} linha(s) passam por "${esc(term)}"${munTxt}</p>`;
  lineResults(host, rows, { prefixHTML: prefix, view, gen });
}

// Corpo do antigo `onRun` de `LOADERS.municipioRegiao` — o loader FICA no `app.js` pelo mesmo
// motivo do de cima (monta `regioes` antes do `searchPanel`).
export async function municipioRegiaoRun(ctx, term, region){
  const host = ctx.host;
  const ibge = await getIbge();
  await getEmpresas();
  // tabela de municípios clicáveis (drill-down → openLinhasPorIbge)
  const munTable = (entries, tableHost)=>{
    const body = entries.sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>
      `<tr class="clickable" tabindex="0" role="button" data-ibge="${esc(cod)}"><td class="td-logr">${esc(v.nome)}</td><td class="td-tipo">${esc(orDash(v.regiaoPrograma))}</td><td class="td-num">cód. ${esc(cod)}</td></tr>`).join('');
    tableHost.innerHTML = body? tableHTML([{t:'Município'},{t:'Região',w:'160px'},{t:'IBGE',w:'100px'}], body, entries.length+' município(s) · clique para ver as linhas'):emptyBox('Nenhum município.');
    tableHost.querySelectorAll('tr[data-ibge]').forEach(tr=>tr.addEventListener('click',()=>openLinhasPorIbge(tr.dataset.ibge, ibge[tr.dataset.ibge]?.nome)));
  };
  // 1) município digitado → vai pras linhas do município (lista se houver vários)
  if(term){
    const municipios = Object.entries(ibge).filter(([,v])=> (!region||v.regiaoPrograma===region) && norm(v.nome).includes(norm(term)) );
    if(!municipios.length){ host.innerHTML = emptyBox('Nenhum município.'); return; }
    if(municipios.length===1){ openLinhasPorIbge(municipios[0][0], municipios[0][1].nome); return; }
    munTable(municipios, host); return;
  }
  // 2) Região Programa escolhida → duas métricas do print (RPC divat_linhas_regiao):
  //    "origem na região" (1º trecho da linha na região) × "trafega dentro da região"
  //    (todos os trechos na região). O usuário alterna pelo seletor de escopo.
  if(region){
    const muns = Object.entries(ibge).filter(([,v])=>v.regiaoPrograma===region).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||''));
    const chips = muns.map(([cod,v])=>`<button type="button" class="mun-chip" data-ibge="${esc(cod)}">${esc(v.nome)}</button>`).join('');
    host.innerHTML = `<div class="loc-tools"><label>Mostrar <select id="regScope">
        <option value="origem">Linhas com origem na Região Programa</option>
        <option value="dentro">Linhas que trafegam dentro da Região Programa</option>
      </select></label></div>
      <div class="mun-chips"><span class="mun-chips-lbl">Filtrar por município:</span>${chips}</div>
      <div id="regResult"></div>`;
    const result = host.querySelector('#regResult');
    const scope  = host.querySelector('#regScope');
    host.querySelectorAll('.mun-chip').forEach(b=>b.addEventListener('click',()=>openLinhasPorIbge(b.dataset.ibge, ibge[b.dataset.ibge]?.nome)));
    async function paint(){
      // geração NOVA da MESMA tentativa (nextGen preserva view/pane/host): o usuário pode
      // trocar o escopo de novo antes de a RPC responder — é a corrida que motivou o seam.
      // Um ctx montado do zero aqui acertaria a aba errada se ele tivesse trocado de aba.
      const { view, gen } = nextGen(ctx);
      result.innerHTML = loading();
      const modo = scope.value;
      const it = await sbFetch('rpc/divat_linhas_regiao', `p_regiao=${enc(region)}&p_modo=${enc(modo)}&select=codlinha&limit=2000`);
      const lc = distinctCods(it,500);
      // sem esc() aqui de propósito: emptyBox já escapa. Escapar duas vezes fazia uma região
      // com apóstrofo sair como &amp;#39; na tela.
      if(!lc.length){ result.innerHTML = emptyBox('Nenhuma linha para esse critério na região '+region+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
      const rows = await fetchLinesByCods(lc,{limit:500});
      const label = modo==='origem' ? 'com origem na' : 'que trafegam dentro da';
      const prefix = bannerTrunc(it)
        + `<p class="doc-count">${lc.length} linha(s) ${label} região ${esc(region)}</p>`;
      lineResults(result, rows, { prefixHTML: prefix, view, gen });
    }
    scope.addEventListener('change', ()=>{ paint().catch(e=>{ result.innerHTML = errorBox(e.message); }); });
    paint().catch(e=>{ result.innerHTML = errorBox(e.message); });
    return;
  }
  // 3) nada informado → orienta
  host.innerHTML = emptyBox('Escolha uma região para ver as linhas, ou digite o nome de um município.');
}

// linhas encontradas por critério GEOGRÁFICO (município/logradouro) — mostra a tabela de tarifa
// INTEIRA de cada linha (diferente do modo Localidade, que filtra a seção pelo NOME buscado:
// aqui não há um nome pra casar).
export async function mostrarLinhasResultado(ctx, cods, titulo){
  const { view, gen, host } = ctx;
  if(!cods.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para este critério.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const slice = cods.slice(0,250);
  const rows = await fetchLinesByCods(slice,{limit:250});
  const baseCods = distinctCods(rows, 250);
  let secByLine = new Map();
  if(baseCods.length){
    const secRows = await sbFetch('tarifa_atual_teste',
      `codlinha=in.(${baseCods.map(enc).join(',')})&select=codlinha,secao,nome_ligacao,nome_ligacao_cresc,tipo_ligacao,tarifa,situacao&order=codlinha,secao&limit=5000`);
    secByLine = groupBy(secRows, r=>r.codlinha);
  }
  const comSecaoN = rows.reduce((n,r)=>n+(secByLine.has(r.codlinha)?1:0),0);
  const secNote = comSecaoN ? ` · ${comSecaoN} com tarifa cadastrada` : '';
  const extra = cods.length>slice.length ? ` (mostrando ${slice.length})` : '';
  const prefix = `<p class="doc-count">${cods.length} linha(s) — ${esc(titulo)}${secNote}${extra}</p>`;
  renderLocalidadeSecoes(host, rows, secByLine, { prefixHTML: prefix, view, gen,
    semSecaoSub: '', semSecaoObs: 'Ligam os municípios buscados, mas não têm seção de tarifa cadastrada.' });
}

// Município A × Município B — filtro direcional (A→B, respeita a ordem do itinerário) e
// filtro "trafega pelos dois" (qualquer ordem). `inter` é o próprio resultado não-direcional;
// o direcional refina `inter` consultando a sequência de trechos do itinerário.
export async function mostrarLinhasEntreMunicipios(ctx, aTerm, bTerm, directional){
  // Mesmo contrato da irmã `mostrarLinhasPorLocalidade`: as duas são chamadas do MESMO run() e
  // recebem o MESMO ctx — a busca pode ser trocada enquanto esta está no ar, e é o `gen` que
  // veio no ctx (não um recém-cunhado) que sabe se esta tentativa ainda é a mais nova.
  const { view, gen, host } = ctx;
  const ibge = await getIbge();
  if (!isCurrentGen(view, gen)) return;            // tentativa velha: descarta em silêncio
  const nameOf = c => ibge[c]?.nome || c;
  const findCods = t => Object.entries(ibge).filter(([,v])=>norm(v.nome).includes(norm(t))).map(([c])=>c);
  const a = (aTerm||'').trim(), b = (bTerm||'').trim();
  if(!a){ host.innerHTML = emptyBox('Informe ao menos o primeiro município.'); return; }
  const codsA = findCods(a);
  if(!codsA.length){ host.innerHTML = emptyBox(`Nenhum município com o nome "${esc(a)}".`); return; }
  if(!b){
    if(codsA.length===1){ openLinhasPorIbge(codsA[0], nameOf(codsA[0])); return; }
    host.innerHTML = tableHTML([{t:'Município'},{t:'Região',w:'160px'},{t:'IBGE',w:'100px'}],
      codsA.map(c=>`<tr class="clickable" tabindex="0" role="button" data-ibge="${esc(c)}"><td class="td-logr">${esc(nameOf(c))}</td><td class="td-tipo">${esc(orDash(ibge[c].regiao))}</td><td class="td-num">cód. ${esc(c)}</td></tr>`).join(''),
      codsA.length+' município(s) · clique para ver as linhas');
    host.querySelectorAll('tr[data-ibge]').forEach(tr=>tr.addEventListener('click',()=>openLinhasPorIbge(tr.dataset.ibge, nameOf(tr.dataset.ibge))));
    return;
  }
  if(a.toLowerCase()===b.toLowerCase()){ host.innerHTML = emptyBox('Use municípios diferentes nos dois campos.'); return; }
  const codsB = findCods(b);
  if(!codsB.length){ host.innerHTML = emptyBox(`Nenhum município com o nome "${esc(b)}".`); return; }
  host.innerHTML = loading();
  try{
    const all = new Set();    // direcional: A→B, nessa ordem
    const inter = new Set();  // trafega pelos dois, qualquer ordem
    // Memo de UMA execução. O laço é 5×5, e sem ele o mesmo `ca` era rebuscado nas 5 iterações
    // internas e cada `cb` reaparecia a cada volta externa: 50 consultas de município para no
    // máximo 10 municípios distintos. Com o memo, no pior caso 75 requisições viram ~35.
    // Isso reduz a carga que o PORTAL gera — NÃO é rate limiting: quem quiser abusar chama o
    // PostgREST direto com a chave anon, que é pública por design (ver docs/seguranca.md §9.2).
    const memoMun = new Map();
    for(const ca of codsA.slice(0,5)){
      for(const cb of codsB.slice(0,5)){
        if(ca===cb) continue;
        const lA = await linhasNoMunicipio(ca, memoMun);
        const sB = new Set(await linhasNoMunicipio(cb, memoMun));
        const interPar = lA.filter(c=>sB.has(c));
        interPar.forEach(c=>inter.add(c));
        if(!directional || !interPar.length) continue;
        const it = await sbFetch('itinerario_teste', `codlinha=in.(${interPar.slice(0,200).map(enc).join(',')})&select=codlinha,cod_municipio_origem,sentido&order=id&limit=30000`);
        for(const [k,seq] of groupBy(it, r=>r.codlinha+'¦'+(r.sentido||''))){
          const iA=seq.findIndex(r=>String(r.cod_municipio_origem)===String(ca));
          const iB=seq.findIndex(r=>String(r.cod_municipio_origem)===String(cb));
          if(iA>=0&&iB>=0&&iA<iB) all.add(k.split('¦')[0]);
        }
      }
    }
    const titA = codsA.length===1 ? nameOf(codsA[0]) : a;
    const titB = codsB.length===1 ? nameOf(codsB[0]) : b;
    const titulo = directional ? `de ${titA} → ${titB}` : `${titA} e ${titB} (qualquer sentido)`;
    await mostrarLinhasResultado(ctx, [...(directional?all:inter)], titulo);
  }catch(e){ host.innerHTML = errorBox(e.message); }
}

// Corpo do antigo `onRun` de `LOADERS.ligacoesPorTerminal` — o loader FICA no `app.js` pelo mesmo
// motivo dos dois de cima (monta `munOpts`/`suggest` antes do `searchPanel`).
export async function ligacoesPorTerminalRun(ctx, term, ibgeCod){
  const { view, gen, pane, host } = ctx;
  const [orig, ibge] = await Promise.all([getOrigem(), getIbge()]);
  if(!term && !ibgeCod){ host.innerHTML=emptyBox('Digite o nome do terminal/origem, ou escolha um município para ver seus terminais.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  if(!term){
    const itRows = await getTerminais();
    const terminaisMun = terminaisDoMunicipio(itRows, ibgeCod);
    const nomeMun = ibge[ibgeCod]?.nome || ibgeCod;
    const chips = terminaisMun.length
      ? `<div class="mun-chips"><span class="mun-chips-lbl">Filtrar por terminal:</span>${terminaisMun.map(t=>{
          const titulo = `${t.nLinhas} linha(s)`;
          return `<button type="button" class="mun-chip" data-term="${esc(t.nome)}" title="${esc(titulo)}">${esc(t.nome)}</button>`;
        }).join('')}</div>`
      : emptyBox('Nenhum terminal cadastrado em '+nomeMun+'.');
    const todosCods = await linhasNoMunicipio(ibgeCod);
    const lineCods = todosCods.slice(0,500);
    const rows = await fetchLinesByCods(lineCods,{limit:500});
    const aviso = todosCods.length>lineCods.length
      ? `<div class="trunc-aviso"><b>Lista parcial:</b> ${todosCods.length} linhas no total; mostrando as primeiras ${lineCods.length}.</div>` : '';
    const prefix = bannerTrunc(itRows) + chips
      + `<p class="doc-count">${terminaisMun.length} terminal(is) em ${esc(nomeMun)}</p>` + aviso;
    lineResults(host, rows, { prefixHTML:prefix, view, gen });
    host.querySelectorAll('.mun-chip').forEach(b => b.addEventListener('click', () => {
      const i = pane.querySelector('#spInput');
      if(i) i.value = b.dataset.term;
      if(view && view._panelRun) view._panelRun();
    }));
    return;
  }
  const nTerm = norm(term);
  // duas fontes distintas de "terminal": origem_teste (ponto de origem do quadro de horários,
  // quase sempre nome de município) e itinerario_teste tipo "Terminal" (terminal físico, ex.
  // "Rodoviário Menezes Côrtes") — busca casa qualquer uma das duas.
  const cods = Object.entries(orig).filter(([,n])=>norm(n).includes(nTerm)).map(([c])=>c);
  const rawTermRows = await getTerminais();
  const termRows = rawTermRows.filter(r=>norm(r.nome_logradouro).includes(nTerm));
  if(!cods.length && !termRows.length){ host.innerHTML=bannerTrunc(rawTermRows)+emptyBox('Nenhum terminal/origem com esse nome.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  let qi=[], qp=[];
  if(cods.length){
    const inList = cods.slice(0,50).map(enc).join(',');
    [qi, qp] = await Promise.all([
      sbFetch('qh_intervalo_teste', `cod_origem=in.(${inList})&select=codlinha&limit=3000`),
      sbFetch('qh_predeterminado_teste', `cod_origem=in.(${inList})&select=codlinha&limit=3000`)
    ]);
  }
  const todosCods = distinctCods([...qi, ...qp, ...termRows]);
  let filtrados = todosCods;
  const munTxt = ibgeCod? ` em ${esc(ibge[ibgeCod]?.nome||'')}` : '';
  if(ibgeCod){
    const munSet = new Set((await linhasNoMunicipio(ibgeCod)).map(String));
    filtrados = filtrados.filter(c=>munSet.has(String(c)));
  }
  const lineCods = filtrados.slice(0,120);
  if(!lineCods.length){
    const msg = ibgeCod && todosCods.length
      ? `Esse terminal/origem existe, mas não serve o município ${ibge[ibgeCod]?.nome||ibgeCod}.`
      : 'Nenhuma linha vinculada a esse terminal/origem.';
    host.innerHTML=bannerTrunc(qi)+bannerTrunc(qp)+bannerTrunc(rawTermRows)+emptyBox(msg);
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  const rows = await fetchLinesByCods(lineCods,{limit:200});
  const aviso = filtrados.length>lineCods.length
    ? `<div class="trunc-aviso"><b>Lista parcial:</b> ${filtrados.length} linhas no total; mostrando as primeiras ${lineCods.length}.</div>` : '';
  const prefix = bannerTrunc(qi)+bannerTrunc(qp)+bannerTrunc(rawTermRows)+aviso
    + `<p class="doc-note">${lineCods.length} linha(s) a partir de "${esc(term)}"${munTxt}</p>`;
  lineResults(host, rows, { prefixHTML: prefix, view, gen });
}

/* --- "Seções por Ligação" — decisão da C2, corrigida no cabeçalho deste arquivo ---
   Documento POR LINHA (não por município), sem dependência de `runView`/`searchPanel`. */
export async function renderSecoesPorLigacao(ctx){
  const { view, gen, pane, line } = ctx;
  // Tudo vem do ctx, incluindo a LINHA. Antes este documento lia `activeLine` DEPOIS do await:
  // trocar de linha com a busca no ar fazia o cabeçalho sair com a linha nova e a tabela com as
  // seções da velha — a mesma tela mostrando duas linhas diferentes, sem erro nenhum.
  const rows = await sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=secao,nome_ligacao,tarifa&order=secao`);
  if (!isCurrentGen(view, gen)) return;            // tentativa velha: descarta em silêncio
  const meta = metaRows([['Ligação',esc(line.nome_ligacao||'—'),true],['Código',esc(fmtCode(line.codlinha))]]);
  if(!rows.length){ pane.innerHTML = `<div class="doc">${docHead('Seções por Ligação')}${meta}${emptyLinha('seção')}</div>`; return; }
  const cols = [{t:'Seção',w:'70px'},{t:'Descrição'},{t:'Tarifa',w:'90px'}];
  const rowHTML = r=>`<tr><td class="td-num">${esc(orDash(r.secao))}</td><td class="td-logr">${esc(orDash(r.nome_ligacao))}</td><td class="td-sentido">R$ ${esc(fmtMoney(r.tarifa))}</td></tr>`;
  pane.innerHTML = `<div class="doc">${docHead('Seções por Ligação')}${meta}
    <div class="loc-tools"><label>Filtrar <input type="text" id="secF" placeholder="seção ou descrição" autocomplete="off"></label></div>
    <div id="secResult"></div></div>`;
  const result = pane.querySelector('#secResult'), inp = pane.querySelector('#secF');
  const paint = ()=>{
    const q = norm(inp.value.trim());
    const f = q ? rows.filter(r=>norm(`${orDash(r.secao)} ${r.nome_ligacao||''}`).includes(q)) : rows;
    result.innerHTML = f.length ? tableHTML(cols, f.map(rowHTML).join(''), f.length+' seção(ões)') : emptyBox('Nenhuma seção com esse filtro.');
  };
  inp.addEventListener('input', debounce(paint));
  paint();
  commitViewResult(view, gen, { pdfHTML:null });
}

/* ================================================================
   DOC · Localidades
   ================================================================ */

let _localidadesList = null;
export async function getLocalidades(){
  if(_localidadesList) return _localidadesList;
  const rows = await sbFetch('localidades_teste', 'select=localidade,ordem_importacao&order=ordem_importacao&limit=2000');
  const seen = new Set(); const out = [];
  rows.forEach(r=>{
    const nome = String(r.localidade||'').replace(/^"+|"+$/g,'').trim();
    const key = nome.toLowerCase();
    if(!nome || nome.length<3 || key==='localidade' || seen.has(key)) return;
    seen.add(key); out.push(nome);
  });
  out.sort((a,b)=>a.localeCompare(b));
  _localidadesList = out;
  return out;
}
// termos p/ o ilike de localidade: nomes canônicos (com acento) + o termo digitado (texto
// livre, cobre grafias sem acento na base), sem duplicatas
export async function termosLocalidade(term){
  const canon = localidadesQueCasam(await getLocalidades(), term);
  const out = [], seen = new Set();
  for(const t of [...canon, term.trim()]){
    const k = t.toLowerCase(); if(!t || seen.has(k)) continue; seen.add(k); out.push(t);
  }
  return out;
}
// codlinha que casam uma localidade pelo NOME/VIA da linha (tabela_vista), por uma SEÇÃO de
// tarifa OU por um LOGRADOURO do itinerário — MESMA semântica usada na busca do campo A.
// Usado p/ cruzar duas localidades de forma simétrica (independe da ordem dos campos).
export async function codsPorLocalidade(term){
  const termos = await termosLocalidade(term);
  const [ln, sec, itin] = await Promise.all([
    sbFetch('tabela_vista_teste', `${orIlike(['nome_ligacao','nome_lig_cresc','via'], termos)}&select=codlinha&limit=3000`),
    sbFetch('tarifa_atual_teste', `${orIlike(['nome_ligacao','via'], termos)}&select=codlinha&limit=3000`),
    sbFetch('itinerario_teste', `${orIlike(['nome_logradouro'], termos)}&select=codlinha&limit=2000`)
  ]);
  const out = new Set([...ln, ...sec, ...itin].map(r=>r.codlinha).filter(Boolean));
  // localidade que também é MUNICÍPIO (ex.: Niterói): une as linhas cujo itinerário passa
  // pelo município — a busca textual não enxerga quem passa sem citar o nome
  for(const c of municipiosExatos(await getIbge(), termos).slice(0,3)){
    (await linhasNoMunicipio(c)).forEach(cl=>out.add(cl));
  }
  return out;
}
export async function mostrarLinhasPorLocalidade(ctx, a, b, bTipo='localidade'){
  // `view`/`gen`/`host` vêm do ctx da busca, montado ANTES do primeiro await: a busca pode ser
  // trocada enquanto esta está no ar, e quem escreve o resultado no fim precisa saber se ainda
  // é a tentativa mais nova (ver o contrato do seam em MODAL / SISTEMA DE VIEWS).
  const { view, gen, host } = ctx;
  host.innerHTML = loading();
  try{
    const termos = await termosLocalidade(a);
    // 1) linhas cujo nome/nome_cresc/via casa a localidade  2) linhas cujas SEÇÕES de tarifa
    //    casam a localidade (item 13: as seções da Estrutura também entram na busca)
    // 3) linhas cujo ITINERÁRIO passa por um logradouro com o nome da localidade (a dica da
    //    tela promete "nome/itinerário")
    const [lineRows, secHits, itinHits, ibge] = await Promise.all([
      sbFetch('tabela_vista_teste', `${orIlike(['nome_ligacao','nome_lig_cresc','via'], termos)}&select=${LINE_FIELDS}&order=nome_ligacao&limit=400`),
      sbFetch('tarifa_atual_teste', `${orIlike(['nome_ligacao','via'], termos)}&select=codlinha&limit=3000`),
      sbFetch('itinerario_teste', `${orIlike(['nome_logradouro'], termos)}&select=codlinha&limit=2000`),
      getIbge()
    ]);
    // 4) localidade que também é MUNICÍPIO (ex.: Niterói): linhas cujo itinerário passa pelo
    //    município também entram — a busca textual não enxerga quem passa sem citar o nome
    const munACods = [];
    for(const c of municipiosExatos(ibge, termos).slice(0,3)){
      (await linhasNoMunicipio(c)).forEach(cl=>munACods.push(cl));
    }
    const haveCods = new Set(lineRows.map(r=>r.codlinha));
    let extraCods = [...new Set([...secHits, ...itinHits].map(r=>r.codlinha).concat(munACods).filter(c=>c && !haveCods.has(c)))];
    // cruzamento com o campo B: interseção por CODLINHA antes de baixar os dados das linhas
    // extras (evita buscar linhas que a interseção descartaria e o corte de 200 que estrangulava)
    let rows = lineRows;
    if(b && bTipo==='municipio'){
      // localidade A × MUNICÍPIO B: interseção com as linhas que passam pelo município
      const cods = Object.entries(ibge).filter(([,v])=>norm(v.nome).includes(norm(b))).map(([c])=>c);
      if(!cods.length){ host.innerHTML = emptyBox(`Nenhum município com o nome "${esc(b)}".`); commitViewResult(view, gen, { pdfHTML:null }); return; }
      const munSet = new Set();
      for(const c of cods.slice(0,5)){ (await linhasNoMunicipio(c)).forEach(cl=>munSet.add(cl)); }
      rows = rows.filter(r=> munSet.has(r.codlinha));
      extraCods = extraCods.filter(c=> munSet.has(c));
    } else if(b){
      // localidade A × localidade B: interseção SIMÉTRICA por codlinha (mesma busca de
      // nome/via + seção/itinerário/município que a de A), para não depender da ordem dos campos.
      const setB = await codsPorLocalidade(b);
      rows = rows.filter(r=> setB.has(r.codlinha));
      extraCods = extraCods.filter(c=> setB.has(c));
    }
    const fetchCods = extraCods.slice(0,250);
    let base = rows;
    if(fetchCods.length) base = rows.concat(await fetchLinesByCods(fetchCods, { limit: fetchCods.length }));
    if(!base.length){ host.innerHTML = emptyBox(b?`Nenhuma linha entre "${esc(a)}" e "${esc(b)}".`:`Nenhuma linha encontrada para "${esc(a)}".`); commitViewResult(view, gen, { pdfHTML:null }); return; }
    await getEmpresas();
    // seções de tarifa cujo NOME casa a(s) localidade(s) buscada(s), por linha — reproduz o
    // relatório oficial. Município B é só filtro de trânsito, não entra nos termos de seção.
    const secTerms = [...termos];
    let termsB = null;
    if(b && bTipo==='localidade'){ termsB = await termosLocalidade(b); termsB.forEach(t=>secTerms.push(t)); }
    const baseCods = distinctCods(base, 600);
    let secByLine = new Map();
    if(baseCods.length){
      let secRows = await sbFetch('tarifa_atual_teste',
        `codlinha=in.(${baseCods.map(enc).join(',')})&${orIlike(['nome_ligacao','nome_ligacao_cresc'], secTerms)}`
        + `&select=codlinha,secao,nome_ligacao,nome_ligacao_cresc,tipo_ligacao,tarifa,situacao&order=codlinha,secao&limit=5000`);
      // localidade A × localidade B: mostrar só a seção que liga A↔B (casa AMBAS as
      // localidades), não toda seção que toca A ou B — foco no trecho pesquisado.
      if(termsB){
        const hasAny = (hay, ts) => ts.some(t=>{ const n=norm(t); return n && hay.includes(n); });
        secRows = secRows.filter(r=>{
          const hay = norm(`${r.nome_ligacao||''} ${r.nome_ligacao_cresc||''}`);
          return hasAny(hay, termos) && hasAny(hay, termsB);
        });
      }
      secByLine = groupBy(secRows, r=>r.codlinha);
    }
    const comSecaoN = base.reduce((n,r)=>n+(secByLine.has(r.codlinha)?1:0),0);
    const corte = extraCods.length - fetchCods.length;
    const titulo = b? `${esc(a)} ↔ ${esc(b)}` : esc(a);
    const secNote = comSecaoN ? ` · ${comSecaoN} com seção ${b && bTipo==='localidade' ? `${esc(a)} ↔ ${esc(b)}` : `em ${esc(a)}`}` : '';
    const corteNote = corte>0 ? ` (${corte} linha(s) a mais não exibidas — refine a busca)` : '';
    const prefix = bannerTrunc(lineRows)
      + `<p class="doc-count">${base.length} linha(s) · ${titulo}${secNote}${corteNote}</p>`;
    renderLocalidadeSecoes(host, base, secByLine, { prefixHTML: prefix, view, gen });
  }catch(e){ host.innerHTML = errorBox(e.message); }
}
// 5 modos de busca da tela "Linhas por Localidade e Município" — cada botão de filtro decide
// o tipo do campo A/B e qual função de busca roda (localidade× vs. município×).
export const LOC_FILTERS = [
  { label:'Possui seção na Localidade A', kind:'localidade', aType:'localidade', bMode:'none',
    hint:'Lista as linhas que têm uma seção de tarifa com esse nome na localidade A.' },
  { label:'De localidade A para localidade B', kind:'localidade', aType:'localidade', bMode:'localidade',
    hint:'Cruza duas localidades: mostra as linhas que ligam A a B (independe da ordem digitada).' },
  { label:'De localidade A para Município B', kind:'localidade', aType:'localidade', bMode:'municipio',
    hint:'Mostra as linhas da localidade A que também passam pelo município B.' },
  { label:'Do Município A para o Município B', kind:'municipio', aType:'municipio', bMode:'municipio', directional:true,
    hint:'Mostra as linhas cujo itinerário vai de A para B, nessa ordem.' },
  { label:'Trafegam nos municípios A e B', kind:'municipio', aType:'municipio', bMode:'municipio', directional:false,
    hint:'Mostra as linhas que passam pelos dois municípios, em qualquer ordem.' },
];
// `LOADERS.localidades` inteiro: não passa por `searchPanel` (tem o próprio formulário, com dois
// campos e uma barra de filtros), então vira one-liner — mesmo padrão de `LOADERS.portarias` (C2).
export async function renderLocalidades(ctx){
  const { view, pane } = ctx;   // `pane` capturado — usado também pelo `.then()` assíncrono abaixo
  pane.innerHTML = `<div class="doc">${docHead('Linhas por Localidade e Município')}
    <div class="doc-obs tight" id="locHint"><b>Dica:</b> ${esc(LOC_FILTERS[0].hint)}</div>
    <div class="loc-filters" id="locFilters" role="tablist">${LOC_FILTERS.map((f,i)=>
      `<button type="button" class="loc-filter-btn${i===0?' active':''}" data-idx="${i}" aria-pressed="${i===0}">${esc(f.label)}</button>`).join('')}</div>
    <div class="loc-form">
      <label id="locALabel"><span class="loc-lbl-txt">Localidade</span><input id="locA" list="locList" placeholder="Digite a localidade…" autocomplete="off"></label>
      <label id="locBLabel"><span class="loc-lbl-txt">Cruzar com</span><input id="locB" list="locList" placeholder="Segunda localidade…" autocomplete="off"></label>
    </div>
    <datalist id="locList"></datalist><datalist id="munLocList"></datalist>
    <div class="loc-actions"><button class="loc-btn" id="locGo" type="button">Buscar linhas</button></div>
    <div id="locHost">${emptyBox('Escolha um filtro, preencha os campos e clique em Buscar.')}</div></div>`;

  const A=pane.querySelector('#locA'), B=pane.querySelector('#locB'),
        ALbl=pane.querySelector('#locALabel .loc-lbl-txt'), BLbl=pane.querySelector('#locBLabel'),
        BLblTxt=pane.querySelector('#locBLabel .loc-lbl-txt'),
        hint=pane.querySelector('#locHint'), host=pane.querySelector('#locHost'),
        filtersBar=pane.querySelector('#locFilters');

  let modeIdx = 0;
  function applyMode(){
    const f = LOC_FILTERS[modeIdx];
    filtersBar.querySelectorAll('.loc-filter-btn').forEach(b=>{
      const active = +b.dataset.idx===modeIdx;
      b.classList.toggle('active', active); b.setAttribute('aria-pressed', active);
    });
    hint.innerHTML = `<b>Dica:</b> ${esc(f.hint)}`;
    ALbl.textContent = f.aType==='municipio' ? 'Município' : 'Localidade';
    A.setAttribute('list', f.aType==='municipio' ? 'munLocList' : 'locList');
    A.placeholder = f.aType==='municipio' ? 'Nome do município…' : 'Digite a localidade…';
    A.value=''; B.value='';
    if(f.bMode==='none'){
      BLbl.style.display='none';
    }else{
      BLbl.style.display='';
      const bIsMun = f.bMode==='municipio';
      B.setAttribute('list', bIsMun ? 'munLocList' : 'locList');
      B.placeholder = bIsMun ? 'Nome do município…' : (f.kind==='municipio' ? 'Segundo município…' : 'Segunda localidade…');
      BLblTxt.textContent = bIsMun ? 'Município B' : (f.kind==='municipio' ? 'Município B' : 'Cruzar com');
    }
    host.innerHTML = emptyBox('Preencha os campos e clique em Buscar.');
  }
  filtersBar.addEventListener('click', e=>{
    const btn = e.target.closest('.loc-filter-btn'); if(!btn) return;
    modeIdx = +btn.dataset.idx; applyMode();
  });
  applyMode();

  // Como o painel de Portarias, este tem o `run` dele e monta o próprio ctx: uma tentativa nova
  // por busca, com o pane e o host DESTA tela — as duas funções de busca recebem o MESMO.
  const run = async () => {
    const f = LOC_FILTERS[modeIdx];
    const a=(A.value||'').trim(), b=(B.value||'').trim();
    if(!a){ host.innerHTML = emptyBox(`Informe ${f.aType==='municipio'?'o município':'a localidade'}.`); return; }
    const rctx = novoCtx(view, pane, host);
    if(f.kind==='localidade'){
      const bTipo = f.bMode==='municipio' ? 'municipio' : 'localidade';
      const bb = f.bMode==='none' ? '' : b;
      if(bb && bTipo==='localidade' && a.toLowerCase()===bb.toLowerCase()){ host.innerHTML=emptyBox('Use localidades diferentes nos dois campos.'); return; }
      await mostrarLinhasPorLocalidade(rctx, a, bb, bTipo);
    }else{
      if(b && a.toLowerCase()===b.toLowerCase()){ host.innerHTML=emptyBox('Use municípios diferentes nos dois campos.'); return; }
      await mostrarLinhasEntreMunicipios(rctx, a, b, f.directional);
    }
  };
  pane.querySelector('#locGo').addEventListener('click', run);
  [A,B].forEach(el=>el.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); }));
  if(view) view._panelRun = run;   // realtime relê modeIdx a cada chamada, não fixa o modo

  Promise.all([getLocalidades(), getIbge()]).then(([locs, ibge])=>{
    const muns = [...new Set(Object.values(ibge).map(v=>v.nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const locDL = pane.querySelector('#locList'), munDL = pane.querySelector('#munLocList');
    if(locDL) locDL.innerHTML = locs.map(n=>`<option value="${esc(n)}"></option>`).join('');
    if(munDL) munDL.innerHTML = muns.map(n=>`<option value="${esc(n)}"></option>`).join('');
  }).catch(e=>{ console.warn('datalists de localidade/município indisponíveis:', e); });
}

/* ================================================================
   Render do bloco "seções por localidade/município" — usado por AMBAS as metades
   ================================================================ */

// tabela leve de seções de tarifa (Nome da Seção · Tipo · Tarifa) — formato do relatório
// oficial "seções que possuem seção em <localidade>"
export function secoesLocalidadeTable(secoes){
  const cols = [{t:'Nome da Seção'},{t:'Tipo',w:'160px'},{t:'Tarifa',w:'90px'}];
  const body = [...secoes].sort((a,b)=>(a.secao||0)-(b.secao||0)).map(s=>
    `<tr><td class="td-logr">${esc(orDash(s.nome_ligacao))}</td><td class="td-tipo">${esc(orDash(s.tipo_ligacao))}</td><td class="td-sentido">R$ ${esc(fmtMoney(s.tarifa))}</td></tr>`).join('');
  return tableHTML(cols, body, secoes.length+' seção(ões)');
}
// render do "Linhas por Localidade": bloco principal = linhas COM seção na localidade,
// agrupadas por empresa e com as seções por linha (reproduz o relatório antigo); bloco
// secundário = demais linhas da cobertura ampla (entram por itinerário/nome), como lista.
// A barra de situação (Todas/Ativas/Canceladas) usa o MESMO seletor e a MESMA regra do
// `lineResults` (via situacaoSelectHTML/filtrarSituacao): as duas telas listam linha e
// precisam concordar no que é "ativa". O filtro repinta os DOIS blocos e refaz o
// `bindLineRows` — quem entra na tela depois de filtrar tem que continuar clicável.
export function renderLocalidadeSecoes(host, base, secByLine, { prefixHTML='', view, gen, semSecaoSub, semSecaoObs } = {}){
  host.innerHTML = prefixHTML
    + `<div class="loc-tools">${situacaoSelectHTML()}</div><div id="locSecResult"></div>`;
  const result = host.querySelector('#locSecResult');
  const statusSel = host.querySelector('#lrStatus');
  const paint = () => {
    const rows = filtrarSituacao(base, statusSel.value);
    // o contador do `prefixHTML` é o do resultado INTEIRO e fica acima da barra; ao filtrar,
    // repetir só o total mentiria sobre o que está na tela — daí a contagem do recorte.
    pintarLocalidadeSecoes(result, rows, secByLine, { total: base.length, view, gen, semSecaoSub, semSecaoObs });
  };
  statusSel.addEventListener('change', paint);
  paint();
}
// uma linha do bloco "com seção": cabeçalho clicável (data-row → bindLineRows) + as seções dela
export function locLinhaSecHTML(r, secByLine){
  const chips = [boolChip(r.cancelado,'canc.'), boolChip(r.paralisado,'paral.')].filter(Boolean).join(' ');
  return `<div class="loc-linha-sec">
    <div class="loc-linha-head clickable" tabindex="0" role="button" data-row='${esc(JSON.stringify(r))}'><span class="mono">${esc(fmtCode(r.codlinha))}</span> <span>${fmtLineName(r.nome_ligacao)}</span> ${chips}</div>
    ${secoesLocalidadeTable(secByLine.get(r.codlinha)||[])}</div>`;
}
// bloco "com seção" de uma FATIA de linhas já ordenada por empresa: os cabeçalhos de empresa
// entram DENTRO da fatia, e a contagem do cabeçalho é a do grupo INTEIRO (`totais`), não a da
// página — mesma convenção do `paginateLines` no modo agrupado.
export function locComSecaoHTML(fatia, secByLine, totais){
  return [...groupBy(fatia, r=>r.codempresa||'—')].map(([cod,rs])=>
    `<h3 class="loc-emp-head">${esc(empNome(cod))} <span class="loc-emp-rj">RJ-${esc(cod||'—')} · ${totais.get(cod)} linha(s)</span></h3>`
    + rs.map(r=>locLinhaSecHTML(r, secByLine)).join('')).join('');
}
export const LOC_SEM_SECAO_OBS = 'Ligam os pontos buscados, mas não têm uma seção de tarifa com esse nome.';
// Os DOIS blocos são paginados em 25/página (`paginate`/`paginateLines`), como as demais listas
// de linha do portal — uma localidade grande chega a 400 linhas, cada uma com sua tabela de
// seções, e despejar tudo no DOM de uma vez travava a tela.
// Como só a fatia atual entra no DOM, o fallback do `baixarPdf` exportaria só a página aberta:
// por isso o `pdfHTML` é escrito aqui pelo seam (`commitViewResult`), com os dois blocos
// INTEIROS. Ver CLAUDE.md § "Paginação é SÓ de tela; o PDF sai INTEIRO".
export function pintarLocalidadeSecoes(host, base, secByLine, { total = base.length, view, gen, semSecaoSub = 'por itinerário ou nome', semSecaoObs = LOC_SEM_SECAO_OBS } = {}){
  // filtro que não sobra nada: zera o pdfHTML junto, senão o botão PDF baixaria o recorte anterior
  if(!base.length){ host.innerHTML = emptyBox('Nenhuma linha com esse filtro.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const comSecao = [...groupBy(base.filter(r=>secByLine.has(r.codlinha)), r=>r.codempresa||'—')]
    .sort((x,y)=>rjOrder(x[0],y[0])).flatMap(([,rs])=>[...rs].sort(byCodlinha));
  const semSecao = base.filter(r=>!secByLine.has(r.codlinha));
  const totais = countBy(comSecao, r=>r.codempresa||'—');

  const cabSemSecao = `<h3 class="loc-emp-head mt22">Outras linhas <span class="loc-emp-rj">${semSecaoSub ? esc(semSecaoSub)+' · ' : ''}${semSecao.length} linha(s)</span></h3>`
    + `<div class="doc-obs tight">${semSecaoObs}</div>`;
  host.innerHTML = (base.length < total ? `<p class="doc-count">${base.length} de ${total} linha(s) com o filtro escolhido</p>` : '')
    + (comSecao.length ? '<div id="locComSecao"></div>' : '')
    + (semSecao.length ? cabSemSecao + '<div id="locSemSecao"></div>' : '');

  const fatiaComSecao = (s,e) => locComSecaoHTML(comSecao.slice(s,e), secByLine, totais);
  if(comSecao.length){
    paginate(host.querySelector('#locComSecao'), comSecao.length, fatiaComSecao,
      { afterPaint: bindLineRows, unit:'linhas', view, gen });
  }
  // `pdf:false`: o PDF deste documento é escrito abaixo, com os DOIS blocos — deixar o
  // paginateLines escrever o dele sobrescreveria isso com só a lista secundária.
  if(semSecao.length){
    paginateLines(host.querySelector('#locSemSecao'), semSecao, { grouped:false, pdf:false, view, gen });
  }
  if(view) commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead(view.title)}`
    + (comSecao.length ? fatiaComSecao(0, comSecao.length) : '')
    + (semSecao.length ? cabSemSecao + linhasTable([...semSecao].sort(byCodlinha)) : '')
    + '</div>' });
}
