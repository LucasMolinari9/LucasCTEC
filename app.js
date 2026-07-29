/* ================================================================
   ÍNDICE DO ARQUIVO  —  navegue por `grep` da marca da seção.
   ----------------------------------------------------------------
   SUPABASE CONFIG · ÍCONES · SEÇÕES/CARDS · RENDER CARDS ·
   STATE + CACHES · BUSCA DE LINHAS · LINHA ATIVA — BANNER ·
   MODAL / SISTEMA DE VIEWS (maior bloco — tem sub-índice próprio) ·
   COMPONENTES AUXILIARES · CLIQUE NOS CARDS · UTILITÁRIOS ·
   TOAST · REALTIME · AUTO-ATUALIZAÇÃO · ROTAS (hash)
   ----------------------------------------------------------------
   O arquivo inteiro roda dentro de um IIFE: nenhuma função/estado
   vaza para window (o vendor supabase-js continua global, é lido
   aqui dentro normalmente).
   ================================================================ */
(() => {
const sharedModules = globalThis.DIVAT;
if (!sharedModules?.environment || !sharedModules?.domain || !sharedModules?.viewState) {
  throw new Error('Módulos compartilhados DIVAT não foram carregados.');
}
const { selecionarSupabase } = sharedModules.environment;
const { fmtCode, fmtTime, fmtDate, matchEvent, classifyMunLines, localidadesQueCasam, municipiosExatos, resumoRelatorio, resumoFrota, groupBy, countBy, fmtMoney, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, yearOf, orIlike, dedupEmpresasPorRJ } = sharedModules.domain;
const { MAX_TABS, makeTab, openTabState, closeTabState, beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail, pageBounds, tabMatchesEvent, dispatchRealtime } = sharedModules.viewState;
/* ================================================================
   SUPABASE CONFIG
   ================================================================ */
/* --- Infraestrutura de acesso a dado (Supabase/fetch) ---
   Único ponto que fala com o mundo externo (rede). Nada aqui embaixo conhece
   view, DOM ou regra de negócio — só HTTP, timeout/retry e o formato cru do
   PostgREST. Inspirado no limite Domain→Infrastructure da Clean Architecture:
   a "camada de dado" fica isolada para poder mudar (outro backend, outro
   client) sem mexer em quem lê `isLinhaAtiva`/`isVigente` abaixo. --- */
const SB_URL = 'https://lwzsxuaqqeoamukduhev.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3enN4dWFxcWVvYW11a2R1aGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTk4NjYsImV4cCI6MjA5NTQ5NTg2Nn0.90R-n9pu_gpDfmRr7O4DMAdjtIUkIDGyEKfG9zXXV1s';

/* --- Seleção de ambiente (produção × teste) ---
   As duas constantes ACIMA são de produção e devem permanecer literais, uma por linha, com
   `const` e aspas simples: check_deriva.mjs, check_realtime.mjs, check_data_quality.mjs e
   check_grants.mjs extraem as duas por regex (/const SB_URL\s*=\s*'([^']+)'/) para saber qual
   banco auditar. Virar `let`, quebrar em linhas ou virar ternário cega os quatro de uma vez.

   Produção é ALLOWLIST, não o contrário: URL de preview do Vercel carrega hash gerado por
   deploy e é impossível de listar. Todo host fora de HOSTS_PROD cai no banco de teste, então
   uma branch nova nasce apontando para teste — nunca para produção. Mesma doutrina do
   .vercelignore e do default-deny do banco: o objeto novo nasce fechado. Configuração ausente
   lança erro; preview jamais pode usar produção como fallback. */
const HOSTS_PROD   = ['divatdetro.vercel.app'];
const SB_TESTE_URL = 'https://gontnlfmothfglssbyyk.supabase.co';
const SB_TESTE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvbnRubGZtb3RoZmdsc3NieXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTU0OTAsImV4cCI6MjEwMDgzMTQ5MH0.NMEaXXeWxI6A50KuA1euHpSH3Mi53CXU71N16zrjhH4';



const SB = selecionarSupabase(location.hostname, {
  hostsProd: HOSTS_PROD,
  prodUrl: SB_URL,
  prodKey: SB_KEY,
  testeUrl: SB_TESTE_URL,
  testeKey: SB_TESTE_KEY
});

const esperar = ms => new Promise(r => setTimeout(r, ms));

const SB_TIMEOUT_MS = 20000;   // teto por requisição: evita a tela presa em "Carregando…" pra sempre
const SB_RETRIES    = 2;       // tentativas extras só p/ erros transitórios (rede / 5xx / 429)

// Erro de requisição CANCELADA de propósito (busca ficou obsoleta), distinto de timeout e de
// falha de rede. Quem chama trata isto como "ignore em silêncio", não como erro para exibir.
const CANCELADO = 'RequisicaoCancelada';
const ehCancelamento = e => e && e.name === CANCELADO;

// fetch com timeout via AbortController — cancela a requisição se passar do teto.
// `sinal` (opcional) é um AbortSignal EXTERNO, de quem quer cancelar antes disso (busca obsoleta).
// Os dois são compostos, e a distinção entre eles é preservada: timeout vira mensagem para o
// usuário, cancelamento externo é engolido. Sem essa distinção, trocar de termo de busca pintaria
// "Tempo de resposta esgotado" na tela.
async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS, sinal){
  if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const repassar = () => ctrl.abort();
  if (sinal) sinal.addEventListener('abort', repassar, { once: true });
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    // o abort veio de fora, não do relógio
    if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
    throw e;
  } finally {
    clearTimeout(t);
    if (sinal) sinal.removeEventListener('abort', repassar);
  }
}

async function sbFetch(table, qs = '', sinal) {
  const url = `${SB.url}/rest/v1/${table}?${qs}`;
  let ultimoErro;
  for (let tentativa = 0; tentativa <= SB_RETRIES; tentativa++) {
    try {
      const res = await fetchComTimeout(url, {
        headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}` }
      }, SB_TIMEOUT_MS, sinal);
      if (!res.ok) {
        // 5xx/429 são transitórios → vale repetir; demais 4xx são definitivos
        if ((res.status >= 500 || res.status === 429) && tentativa < SB_RETRIES) {
          ultimoErro = new Error(`HTTP ${res.status}`);
          await esperar(400 * 2 ** tentativa);          // backoff: 400ms, 800ms
          // o cancelamento pode chegar DURANTE o backoff: sem esta conferência, a tentativa
          // seguinte sairia para a rede depois de a busca já ter sido abandonada.
          if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
          continue;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return marcarTrunc(await res.json(), qs);
    } catch (e) {
      // cancelamento nunca repete: foi pedido, não é falha.
      if (ehCancelamento(e)) throw e;
      ultimoErro = e;
      const transitorio = (e.name === 'AbortError') || (e instanceof TypeError); // timeout ou falha de rede
      if (transitorio && tentativa < SB_RETRIES) {
        await esperar(400 * 2 ** tentativa);
        if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
        continue;
      }
      if (e.name === 'AbortError') throw new Error('Tempo de resposta esgotado — verifique a conexão e tente novamente.');
      throw ultimoErro;
    }
  }
  throw ultimoErro;
}

// Marca (sem alterar o conteúdo) um array de resultados que provavelmente foi CORTADO:
// só sinaliza quando a consulta tinha um limit "de lista" (>=50) e veio cheio até o teto.
// A flag é não-enumerável → JSON.stringify/map/spread ignoram; só quem checa rows._trunc vê.
function marcarTrunc(data, qs){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (m){
    const lim = +m[1];
    if (lim >= 50 && data.length >= lim){
      Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
      Object.defineProperty(data, '_limite', { value:lim,  enumerable:false });
    }
  }
  return data;
}
// Banner de aviso quando a lista foi truncada (atingiu o limite da consulta).
function bannerTrunc(rows){
  return (rows && rows._trunc)
    ? `<div class="trunc-aviso"><b>Resultado parcial:</b> mostrando os primeiros ${rows._limite}. Refine a busca para encontrar itens mais específicos.</div>`
    : '';
}

/* --- Regras de domínio e formatação (funções puras) ---
   Daqui pra baixo, nenhuma função toca rede/DOM — só recebem dado e devolvem
   dado (string/bool/HTML-string). É a "camada de domínio": pode ser testada
   isolada (é o que os `tests/*.harness.js` fazem) e não sabe de onde o dado
   veio nem quem vai renderizá-lo. Em especial `isLinhaAtiva`/`isVigente` são
   a REGRA DE NEGÓCIO central do portal (o que conta como linha ativa/vigente)
   — mudar esse critério é editar só aqui, nunca nos `render*`. --- */
// 101001001 → 101-001-001 (formato do código da ligação no PDF oficial)

// HH:MM:SS → HH:MM

// data ISO (YYYY-MM-DD) → DD/MM/YYYY



// Sanitiza um termo do usuário para uso DENTRO de um padrão ilike do PostgREST.
// encodeURIComponent não escapa ( ) * — que delimitam o grupo or=(...) e são curinga;
// neutralizá-los impede que o termo quebre o filtro ou injete curingas. Depois codifica.


// Nome de ligação "Origem - Destino": só permite quebra de linha no separador " - ",
// mantendo cada lado inteiro (não pica "Rio de Janeiro" palavra a palavra). Escapa e
// devolve HTML pronto (&nbsp; nos espaços internos) — NÃO re-escapar quem usa.


// Situação da linha (busca e documentos): Cancelada, Paralisada ou Ativa. "Ativa" (verde) só
// quando a linha está operando (não cancelada e não paralisada) — igual ao critério isLinhaAtiva.
// Transferida/Sub judice contam como Ativa (a linha segue operando).

// Uma linha está ATIVA quando está operando: não cancelada e não paralisada.
// Sub judice (pendência só na Justiça) e transferida (mudou de operadora) seguem
// operando → contam como ativas. Critério único usado por Empresas e Relatórios.

// VIGENTE (seção/tarifa) é o critério ESTRITO: além de ativa, exclui sub judice e transferida.
// Repare que sub_judice/transferido têm efeito OPOSTO aqui vs. em isLinhaAtiva — por isso as
// duas noções são explícitas e derivam de um ponto só (não confundir "ativa" com "vigente").


/* ================================================================
   ÍCONES
   ================================================================ */
const I = {
  file:'<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/>',
  divider:'<path d="M4 5h16M4 12h10M4 19h16"/><path d="M16 9l3 3-3 3"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  route:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  ticket:'<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z"/><path d="M13 7v10"/>',
  bus:'<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/><path d="M4 17v2M20 17v2"/>',
  structure:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M12 8v3M6 15v-2h12v2"/>',
  building:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M15 9h3a2 2 0 0 1 2 2v10"/><path d="M8 7h2M8 11h2M8 15h2M3 21h18"/>',
  link:'<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
  segments:'<path d="M3 12h4M10 12h4M17 12h4"/><circle cx="8.5" cy="12" r="1.2"/><circle cx="15.5" cy="12" r="1.2"/>',
  alpha:'<path d="M4 18 7 9l3 9M5 15h4"/><path d="M14 9h5l-5 9h5"/>',
  hash:'<path d="M9 4 7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  signpost:'<path d="M12 3v18"/><path d="M5 6h11l3 2.5L16 11H5z"/>',
  map:'<path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>',
  pin:'<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  hub:'<circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5 8.6 8.6M15.4 15.4l2.1 2.1M17.5 6.5 15.4 8.6M8.6 15.4l-2.1 2.1"/>',
  chart:'<path d="M4 20V4M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  law:'<path d="M12 3v18M5 21h14M7 7l-3 6h6zM17 7l-3 6h6z"/><path d="M5 7h14"/><circle cx="12" cy="4" r="1"/>',
  // ícones exclusivos (evitam repetição entre famílias — o ícone é o elemento mais escaneável)
  histEmp:'<path d="M4 21V7a2 2 0 0 1 2-2h5v16"/><path d="M7.5 9h2M7.5 13h2"/><path d="M3 21h8"/><circle cx="17" cy="15.5" r="4.2"/><path d="M17 13.8v1.7l1.4 1.2"/>',
  fleet:'<rect x="7" y="6" width="14" height="10" rx="2"/><path d="M7 11h14"/><circle cx="10.5" cy="18.5" r="1.3"/><circle cx="17.5" cy="18.5" r="1.3"/><path d="M4 14V6a2 2 0 0 1 2-2h9"/>',
  ruler:'<path d="M3 9h18v6H3z"/><path d="M7 9v3M11 9v3M15 9v3"/>',
  openTab:'<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>'
};

/* ================================================================
   SEÇÕES / CARDS  — [icone, titulo, descricao, view, precisaLinha]
   ================================================================ */
const SECTIONS = [
  // Documentos: os mais consultados primeiro; cada descrição diz o que o DOCUMENTO contém
  // (a instrução "busque a linha…" repetida virava ruído — a busca fica dentro do card).
  { key:'doc', name:'Documentos da Linha',
    icon:'file', desc:'Itinerário, quadro de horários, tarifas, frota e histórico de cada linha regular.',
    items:[
      ['file','Folha de Rosto','Resumo cadastral: empresa, código, tarifa e situação','folhaRosto',false],
      ['route','Itinerários','Percurso por sentido: logradouros e municípios','itinerarios',false],
      ['clock','Quadro de Horários','Partidas por sentido e dia — por linha ou empresa','quadroHorarios',false],
      ['ticket','Tarifas','Seções e valores vigentes — por linha ou empresa','tarifas',false],
      ['history','Histórico da Linha','Alterações e eventos registrados','historicoLinha',false],
      ['bus','Frota','Frota operacional e reserva por tipo de veículo','frota',false],
      ['structure','Estrutura Operacional','Consolidado: cadastro, seções, itinerário, horários e frota','estrutura',false],
      ['divider','Folha Divisória','Capa de separação para processos e arquivos','folhaDivisoria',false],
    ]},
  { key:'emp', name:'Empresas',
    icon:'building', desc:'Operadoras regulares, seções atendidas e histórico de eventos por empresa.',
    items:[
      ['building','Empresas Regulares','Operadoras com linhas regulares ativas','empresasRegulares',false],
      ['histEmp','Histórico da Empresa','Eventos e alterações por operadora','historicoEmpresa',false],
      ['link','Ligações por Empresa','Linhas operadas por uma empresa','ligacoesPorEmpresa',false],
      ['segments','Seções por Empresa','Seções atendidas por operadora','secoesPorEmpresa',false],
    ]},
  { key:'lig', name:'Consultas de Ligações',
    icon:'hub', desc:'Busque linhas por nome, número, logradouro, terminal ou município.',
    items:[
      ['alpha','Ligações pelo Nome','Buscar em ordem alfabética crescente','ligacoesPorNome',false],
      ['hash','Identificar pelo Número','Localizar uma linha pelo código','ligacoesPorNumero',false],
      ['signpost','Ligações por Logradouro','Linhas que passam por uma via','ligacoesPorLogradouro',false],
      ['map','Município e Região','Linhas por origem e destino','municipioRegiao',false],
      ['pin','Linhas por Localidade e Município','Busque por seção, "via" ou cruze localidades/municípios','localidades',false],
      ['hub','Ligações por Terminais','Linhas que atendem um terminal','ligacoesPorTerminal',false],
      ['ruler','Seções por Ligação','Seções que compõem uma linha','secoesPorLigacao',true],
    ]},
  { key:'ger', name:'Portarias',
    icon:'law', desc:'Relatórios consolidados, frota por empresa, pesquisa de eventos e legislação.',
    items:[
      ['chart','Relatórios Gerenciais','Indicadores e consolidados da DIVAT','relatoriosGerenciais',false],
      ['fleet','Frota por Empresa','Frota consolidada por operadora e hierarquia','frotaPorEmpresa',false],
      ['search','Pesquisa de Evento','Buscar eventos por termo livre','pesquisaEvento',false],
      ['law','Portarias / Legislação','Buscar portarias por número, assunto ou texto','portarias',false],
    ]},
];

/* ================================================================
   RENDER CARDS — painel lateral fixo (sidebar de tópicos) + conteúdo
   ================================================================ */
const app = document.getElementById('app');
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

// cor única (mesmo azul de "Documentos da Linha") pra todos os cards e pro destaque do
// tópico ativo na sidebar — parou de variar por família de tópico.
// (ACCENT/ACCENT_SOFT viviam aqui. Eram injetados como `style="--accent:…"` em 4 templates e
//  valiam SEMPRE a mesma constante — nunca foram dinâmicos. Viraram `--accent`/`--accent-soft`
//  estáticos no :root do styles.css em 27/07/2026, o que permitiu fechar o `'unsafe-inline'` do
//  style-src da CSP. Se um dia o tema precisar variar por seção, o caminho é `setProperty` via
//  CSSOM — que a CSP permite —, não o atributo de volta.)

// metadados por view (título, ícone, cores, pré-requisito) — usados pelo clique do card,
// pela busca do topo (consultas no dropdown) e pelo roteamento por hash. Populados eagerly,
// independente de qual tópico está ativo no painel no momento.
const VIEW_META = {};
const VIEW_TOPIC = {};   // view → key do tópico dono (SECTIONS[].key) — usado pela busca do topo
SECTIONS.forEach(sec => {
  sec.items.forEach(([ic, title, desc, view, needsLine]) => {
    VIEW_META[view] = { title, icon:ic, needsLine:!!needsLine };
    VIEW_TOPIC[view] = sec.key;
  });
});

const DEFAULT_TOPIC = 'doc';   // tópico mostrado ao abrir o site sem hash (o mais consultado)

// grid dos cards-folha do tópico ativo (documentos/consultas dentro dele). Cada card vem
// envolto num `.card-slot` (não-interativo) só pra hospedar o ícone "abrir em nova aba" (#53)
// como IRMÃO do `<button class="card">`, nunca filho dele — um <button> aninhado dentro de
// outro <button> é fechado implicitamente pelo parser HTML (regra do "stack de botões"),
// quebrando o layout; o `.card-slot` com position:relative é quem posiciona o ícone por cima.
function topicGridHTML(sec){
  return sec.items.map(([ic, title, desc, view, needsLine]) => `
    <div class="card-slot">
      <button class="card${needsLine?' needs-line':''}" type="button"
        data-view="${view}" data-needs-line="${needsLine?1:0}" data-title="${esc(title)}">
        <span class="ico">${svg(I[ic])}</span>
        <span class="card-txt"><h3>${title}</h3><p>${desc}</p>${needsLine?'<span class="need-chip"></span>':''}</span>
      </button>
      <button class="card-newtab" type="button" data-newtab-view="${view}"
        title="Abrir em nova aba" aria-label="Abrir ${esc(title)} em nova aba">${svg(I.openTab)}</button>
    </div>`).join('');
}

// casca fixa: sidebar (nav) + painel de conteúdo — montada uma vez, preenchida por selectTopic()
app.innerHTML = `
  <div class="side-shell">
    <nav class="side" id="sideNav"></nav>
    <div class="content" id="sideContent"></div>
  </div>`;
const sideNav = document.getElementById('sideNav');
const sideContent = document.getElementById('sideContent');

let currentTopicKey;      // key do tópico ativo no painel de conteúdo — undefined até a 1ª renderização
let expandedTopicKey = null; // key do tópico com a sub-lista aberta na sidebar — só muda por CLIQUE explícito
                              // no botão do tópico (nunca abre sozinha por virar o tópico atual)
let searchOpen = false;      // barra de busca de linha visível no painel? só existe no tópico
                              // "Documentos da Linha" (único cujos cards exigem linha selecionada)
                              // — some com valor padrão fechado; só abre por clique no card "Buscar Linha"

function renderSideNav(activeKey){
  sideNav.innerHTML = `
    <div class="side-brand">
      <span class="side-brand-badge">${svg('<path d="M6 7.5h12M12 7.5V17"/><circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none"/>')}</span>
      <div class="side-brand-txt"><b>Coordenadoria Técnica</b><span>DETRO/RJ</span></div>
    </div>
    <div class="side-eyebrow">Consultas</div>
    <button type="button" class="side-search-btn${(activeKey==='doc'&&searchOpen)?' open':''}">
      <span class="t-ico">${svg(I.search)}</span>Buscar Linha
    </button>` +
    SECTIONS.map(sec => `
    <button type="button" class="topic-btn${(sec.key===activeKey&&!(activeKey==='doc'&&searchOpen))?' active':''}${sec.key===expandedTopicKey?' expanded':''}" data-topic="${sec.key}">
      <span class="t-ico">${svg(I[sec.icon])}</span>${sec.name}
      <span class="chev">${svg('<path d="m9 6 6 6-6 6"/>')}</span>
    </button>
    ${sec.key===expandedTopicKey ? `<div class="sub-list">${sec.items.map(([ic,title,desc,view]) => `<button type="button" data-view="${view}">${title}</button>`).join('')}</div>` : ''}
  `).join('');
  // no mobile a sidebar vira faixa horizontal (ver @media em styles.css); sem isso, um
  // tópico ativo fora da 1ª "dobra" da faixa (deep link, busca) fica sem destaque visível
  // — a sub-lista some no mobile, então o botão realçado é o único indicador de onde se está.
  sideNav.querySelector('.topic-btn.active')?.scrollIntoView({ block:'nearest', inline:'nearest' });
}
function renderSideContent(key){
  const sec = SECTIONS.find(s => s.key === key);
  // busca aberta: o painel mostra SÓ a barra — nada de título, descrição ou grade
  // junto (pedido explícito). `sideContent.innerHTML` abaixo já desanexou o nó de
  // qualquer render anterior; reinserimos o MESMO nó (não clona, mantém os
  // listeners de busca já ligados).
  if (key === 'doc' && searchOpen){
    sideContent.innerHTML = '';
    selector.classList.remove('is-hidden');
    sideContent.appendChild(selector);
    return;
  }
  sideContent.innerHTML = `
    <div class="sec-head"><h2>${sec.name}</h2></div>
    <p class="content-sub">${sec.desc}</p>
    <div class="grid">${topicGridHTML(sec)}</div>`;
}
// clique no card "Buscar Linha" da sidebar: abre/fecha a barra de busca dentro do
// painel; se o tópico ativo não for "Documentos da Linha", muda pra ele já aberta.
function toggleSearchCard(){
  searchOpen = !(currentTopicKey === 'doc' && searchOpen);
  if (currentTopicKey === 'doc'){ renderSideContent('doc'); renderSideNav('doc'); updateNeedChips(); }
  else selectTopic('doc');
  if (searchOpen) searchInput.focus();
}
// troca o tópico ativo do painel — usado pelo clique na sidebar, pela busca do topo
// (com destaque no card) e pelo roteamento por hash.
function selectTopic(key, opts = {}){
  const sec = SECTIONS.find(s => s.key === key);
  if (!sec) return;
  // sai de "Documentos da Linha" sem fechar a busca por outro caminho (ex.: clicar direto
  // em outro tópico) deixava `searchOpen` preso em true — ao voltar pro "doc" depois, a
  // busca reabria sozinha em vez do grid, e a sidebar mostrava "Buscar Linha" com destaque
  // no lugar do tópico realmente clicado.
  if (key !== 'doc') searchOpen = false;
  currentTopicKey = key;
  renderSideNav(key);
  renderSideContent(key);
  updateNeedChips();
  if (!_applyingRoute) syncHash();
  if (opts.highlight){
    const el = sideContent.querySelector(`.card[data-view="${opts.highlight}"]`);
    if (el){
      el.scrollIntoView({ block:'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      el.classList.add('card-flash');
      setTimeout(() => el.classList.remove('card-flash'), 1600);
    }
  }
}
// chips dos cards que exigem linha: mostram o pré-requisito ANTES do clique e, com uma
// linha selecionada, viram confirmação com o número dela (estado visível, não punitivo).
function updateNeedChips(){
  document.querySelectorAll('.card.needs-line .need-chip').forEach(chip => {
    if (activeLine){
      chip.textContent = 'Linha ' + (activeLine.numero_ligacao || fmtCode(activeLine.codlinha));
      chip.classList.add('ok');
    } else {
      chip.textContent = 'Requer linha selecionada';
      chip.classList.remove('ok');
    }
  });
}

/* ================================================================
   STATE + CACHES
   ================================================================ */
let activeLine = null;   // { codlinha, numero_ligacao, nome_ligacao, codempresa, ... }

/* ---- Abas — modelo de múltiplas abas de documento (#51 prefactor + #52 faixa de abas) ----
   Cada aba guarda sua própria linha, sua própria view aberta e sua própria pilha de navegação
   do botão Voltar (`navStack`; a pilha global antiga era `nav.stack`). `stale` = aba em segundo
   plano com dado novo esperando: o Realtime a marca sem recarregar nada e ela só recarrega ao
   ser reativada (ver dispatchRealtime/reloadTab, seção REALTIME, e #54). `paneEl`
   (o `<div class="modal-body">` da aba) e `scrollTop` são propriedades de runtime/DOM, coladas
   pela camada de UI (seção MODAL) — não fazem parte do formato "puro" abaixo, pra manter
   openTabState/closeTabState testáveis sem DOM (cópia em tests/pure.harness.js).
   `activeLine`/`currentView` (declarado mais abaixo, seção MODAL) continuam sendo os pontos de
   LEITURA usados pelos loaders — não se espalha acesso "por aba" pelos call sites existentes.
   Eles só são reatribuídos nos pontos de abrir/selecionar/fechar aba (setActiveLine aqui;
   setCurrentView e activateTab na seção MODAL), sempre em sincronia com `activeTab()`. */

let tabIdSeq = 1;

let tabs = [makeTab(tabIdSeq)];
let activeTabId = tabs[0].id;
function activeTab(){ return tabs.find(t => t.id === activeTabId); }
function setActiveLine(row){ activeLine = row; activeTab().line = row; }

// abre uma aba em branco (linha/view null); nunca ultrapassa MAX_TABS — nesse caso devolve
// blocked:true com `tabs`/`activeTabId` originais intactos (quem chama decide o toast).

// fecha a aba `id`. Se ela era a ativa, ativa a vizinha (prioriza a da direita, senão a da
// esquerda — convenção comum de abas de navegador). Fechar a última aba devolve closedModal:true
// (tabs fica vazio; quem chama decide fechar o modal e recriar a aba inicial em branco).


let ibgeMap   = null;    // { [codibge]: {nome,regiao,regiaoPrograma} }
let origemMap = null;    // { [cod_origem]: nome_origem }
let terminalRows = null; // itinerario_teste com tipo_logradouro='Terminal': [{nome_logradouro,codlinha,cod_municipio_origem}]
// caches carregados e invalidados JUNTOS → cada grupo num objeto só (ver CACHE_INVALIDATORS)
const evLookups = { emp:null, lin:null };  // lookups de evento: emp={[id]:evento_empresa}, lin={[id]:evento_linha}
const empresas  = { map:null, list:null }; // cadastro (nome↔RJ): map={[codempresa]:nome_empresa}, list=linhas cruas p/ busca client-side

// função pura (domínio), só mora aqui perto de quem a usa primeiro — não acessa o cache acima


async function getIbge() {
  if (ibgeMap) return ibgeMap;
  const rows = await sbFetch('municipio_teste', 'select=cod_ibge,nome_municipio,regiao_municipio,regiao_novo&limit=2000');
  ibgeMap = {};
  // `regiao` = regionalização nova (usada na coluna "Região" dos outros cards);
  // `regiaoPrograma` = Região Programa clássica (regiao_municipio) — é a do print DETRO.
  rows.forEach(r => { ibgeMap[r.cod_ibge] = { nome:r.nome_municipio, regiao:r.regiao_novo||r.regiao_municipio, regiaoPrograma:r.regiao_municipio }; });
  return ibgeMap;
}
async function getOrigem() {
  if (origemMap) return origemMap;
  const rows = await sbFetch('origem_teste', 'select=cod_origem,nome_origem&limit=2000');
  origemMap = {}; rows.forEach(r => { origemMap[r.cod_origem] = r.nome_origem; });
  return origemMap;
}
// terminais físicos (ex.: "Rodoviário Menezes Côrtes") — trechos de itinerário do tipo "Terminal",
// conceito distinto de origem_teste (que é o ponto de origem do quadro de horários, quase sempre
// nome de município). Ver Ligações por Terminais.
async function getTerminais() {
  if (terminalRows) return terminalRows;
  terminalRows = await sbFetch('itinerario_teste', `tipo_logradouro=eq.Terminal&select=nome_logradouro,codlinha,cod_municipio_origem&limit=6000`);
  return terminalRows;
}
async function getEmpresas() {
  if (empresas.map) return empresas.map;
  const rows = await sbFetch('codempresa_teste', 'select=codempresa,nome_empresa,situacao,cassada,sob_intervencao&limit=2000');
  empresas.list = rows;
  // alguns RJ aparecem duplicados (ex.: 103): usa a regra compartilhada e testada.
  empresas.map = Object.fromEntries(
    dedupEmpresasPorRJ(rows).map(r => [r.codempresa, r.nome_empresa])
  );
  return empresas.map;
}
// nome da empresa (síncrono; cai no próprio código se o cache ainda não carregou)
const empNome = cod => (empresas.map && empresas.map[cod]) ? empresas.map[cod] : (cod ?? '—');
// busca empresas por nome (insensível a acento) ou código — assume getEmpresas() já carregado
function searchEmpresas(term, { limit = 40 } = {}){
  const nt = norm(term);
  return (empresas.list||[])
    .filter(e => norm(e.nome_empresa).includes(nt) || String(e.codempresa||'').includes(term))
    .sort((a,b)=> String(a.nome_empresa||'').localeCompare(String(b.nome_empresa||'')))
    .slice(0, limit);
}

async function getEvLookups() {
  if (!evLookups.emp) { const r = await sbFetch('evento_empresa_teste','select=id,evento_empresa').catch(()=>[]); evLookups.emp={}; r.forEach(x=>evLookups.emp[x.id]=x.evento_empresa); }
  if (!evLookups.lin) { const r = await sbFetch('evento_linha_teste','select=id,evento_linha').catch(()=>[]); evLookups.lin={}; r.forEach(x=>evLookups.lin[x.id]=x.evento_linha); }
  return evLookups;
}

/* ================================================================
   BUSCA DE LINHAS (hero)
   ================================================================ */
const searchInput = document.getElementById('lineInput');
const searchBtn   = document.getElementById('openLine');
const selector    = document.querySelector('.selector');
const dropdown = document.createElement('div');
dropdown.className = 'results-drop';
dropdown.id = 'searchResults';
selector.appendChild(dropdown);
// semântica de combobox no input (dropdown controlado, estado aberto/fechado anunciado)
searchInput.setAttribute('role', 'combobox');
searchInput.setAttribute('aria-expanded', 'false');
searchInput.setAttribute('aria-autocomplete', 'list');
searchInput.setAttribute('aria-controls', 'searchResults');
function openDropdown(){ dropdown.classList.add('open'); searchInput.setAttribute('aria-expanded','true'); }
function closeDropdown(){ dropdown.classList.remove('open'); searchInput.setAttribute('aria-expanded','false'); }

const LINE_FIELDS = 'codlinha,numero_ligacao,nome_ligacao,nome_lig_cresc,via,codempresa,tipo,caracteristica,licitado,cancelado,paralisado,sub_judice,transferido,data_criacao,processo_criacao';

// consultas (cards) cujo título casa o termo — a busca do topo também navega para os cards,
// não só para linhas ("tarifa" acha o card Tarifas, "horário" acha Quadro de Horários).
function matchViews(term){
  const t = norm(term);
  if (t.length < 3) return [];
  return Object.entries(VIEW_META)
    .filter(([,m]) => norm(m.title).includes(t))
    .slice(0, 4);
}
const viewResultsHTML = views => views.map(([view, m]) => `
  <button class="result-view" type="button" data-open-view="${esc(view)}">
    <span class="rv-ico">${svg(I[m.icon])}</span>
    <span class="rv-txt">${esc(m.title)}</span>
    <span class="rv-kind">consulta</span>
  </button>`).join('');
// clique num resultado de "consulta" no dropdown → leva para dentro do tópico dono no painel
// lateral, com o card destacado (não abre o documento sozinho; o clique final no card é que abre).
// fecha a busca primeiro: com ela aberta o painel mostra só a barra (sem grade) — sem
// fechar, o card escolhido não teria onde ser destacado.
function openViewFromSearch(view){
  const topic = VIEW_TOPIC[view];
  if (!topic) return;
  searchOpen = false;
  selectTopic(topic, { highlight: view });
}

// `auto:true` = disparo da busca-enquanto-digita: sem toast de campo vazio e sem
// mexer no rótulo do botão (feedback visual só na busca manual).
// Controller da busca em voo. Trocar de termo CANCELA a anterior: antes, o descarte era só
// pós-resposta (`if (term !== searchInput.value.trim()) return`), então a requisição obsoleta
// ainda ia à rede e era paga inteira — com debounce de 300 ms, digitar "132004001" disparava
// várias buscas completas das quais só a última importava.
let buscaEmVoo = null;
async function doSearch({ auto = false } = {}) {
  const term = searchInput.value.trim();
  if (!term) { if (!auto) toast('Digite o número ou nome da linha.', 'warn'); return; }
  if (!auto) { searchBtn.textContent = '…'; searchBtn.disabled = true; }
  if (buscaEmVoo) buscaEmVoo.abort();
  const ctrl = new AbortController();
  buscaEmVoo = ctrl;
  try {
    const e1 = ilikeTerm(term);
    const encCode = ilikeTerm(term.replace(/[-.\s]/g, ''));
    const rows = await sbFetch('tabela_vista_teste',
      `select=${LINE_FIELDS}` +
      `&or=(numero_ligacao.ilike.*${e1}*,nome_ligacao.ilike.*${e1}*,codlinha.ilike.*${encCode}*)` +
      `&limit=15`, ctrl.signal);
    if (term !== searchInput.value.trim()) return;   // usuário já digitou outra coisa → descarta
    const viewsHTML = viewResultsHTML(matchViews(term));
    if (!rows.length && !viewsHTML) {
      dropdown.innerHTML = '<div class="drop-empty">Nenhuma linha encontrada.</div>';
    } else {
      dropdown.innerHTML = viewsHTML + rows.sort(byCodlinha).map(r => `
        <button class="result-item" type="button" data-row='${esc(JSON.stringify(r))}'>
          <span class="r-num">${esc(r.numero_ligacao || fmtCode(r.codlinha))}</span>
          <span class="r-name">${esc(r.nome_ligacao || '—')}</span>
          ${situacaoHTML(r)}
          <span class="r-emp">${esc(fmtCode(r.codlinha))} · ${esc(empNome(r.codempresa))}${r.codempresa?` (RJ ${esc(r.codempresa)})`:''}</span>
        </button>`).join('');
    }
    openDropdown();
  } catch (e) {
    // cancelada por uma busca mais nova: não é erro do usuário, não pinta nada.
    if (ehCancelamento(e)) return;
    if (auto) return;                               // busca automática falhou → silencioso
    dropdown.innerHTML = `<div class="drop-error">Erro: ${esc(e.message)}</div>`;
    openDropdown();
  } finally {
    // só limpa se ainda for a MINHA busca: uma busca antiga terminando depois não pode apagar o
    // controller da busca nova, senão a próxima troca de termo não teria o que cancelar.
    if (buscaEmVoo === ctrl) buscaEmVoo = null;
    if (!auto) { searchBtn.textContent = 'Abrir linha'; searchBtn.disabled = false; }
  }
}
searchBtn.addEventListener('click', () => doSearch());
// busca-enquanto-digita (debounce): a partir de 2 caracteres; campo esvaziado fecha a lista
searchInput.addEventListener('input', debounce(() => {
  const t = searchInput.value.trim();
  if (t.length >= 2) doSearch({ auto:true });
  else closeDropdown();
}, 300));
// navegação por teclado: ↓ entra na lista, ↑/↓ percorrem, Esc fecha e devolve o foco
const dropItems = () => [...dropdown.querySelectorAll('button')];
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { doSearch(); return; }
  if (e.key === 'Escape') { closeDropdown(); return; }
  if (e.key === 'ArrowDown' && dropdown.classList.contains('open')){
    const items = dropItems();
    if (items.length){ e.preventDefault(); items[0].focus(); }
  }
});
dropdown.addEventListener('keydown', e => {
  const items = dropItems();
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown' && i < items.length - 1){ e.preventDefault(); items[i+1].focus(); }
  else if (e.key === 'ArrowUp'){
    e.preventDefault();
    if (i > 0) items[i-1].focus(); else searchInput.focus();
  }
  else if (e.key === 'Escape'){ closeDropdown(); searchInput.focus(); }
});
dropdown.addEventListener('click', e => {
  const view = e.target.closest('.result-view');
  if (view){ closeDropdown(); searchInput.value = ''; openViewFromSearch(view.dataset.openView); return; }
  const item = e.target.closest('.result-item');
  if (!item) return;
  selectLine(JSON.parse(item.dataset.row));
  closeDropdown(); searchInput.value = '';
  // achou a linha → fecha a busca e mostra a grade de documentos, já com a linha ativa
  if (currentTopicKey === 'doc' && searchOpen){ searchOpen = false; renderSideContent('doc'); renderSideNav('doc'); updateNeedChips(); }
});
document.addEventListener('click', e => { if (!selector.contains(e.target)) closeDropdown(); });

/* ================================================================
   LINHA ATIVA — BANNER
   ================================================================ */
const banner = document.getElementById('lineBanner');
function bannerEmpHTML(row){
  return `Empresa: ${esc(empNome(row.codempresa))} · RJ ${esc(row.codempresa || '—')} · Cód.: ${esc(fmtCode(row.codlinha))}`;
}
// desenha o banner a partir de UMA linha (ou esconde, se `row` for null) — usado tanto por
// selectLine (usuário escolheu uma linha nova) quanto por activateTab (troca de aba só repinta
// o banner com a linha que a aba de destino já tinha, sem tocar em setActiveLine/activeTab().line).
function paintBanner(row){
  if (!row){ banner.classList.add('is-hidden'); return; }
  banner.classList.remove('is-hidden');
  banner.innerHTML = `
    <span class="lb-num">${esc(row.numero_ligacao || row.codlinha)}</span>
    <div>
      <div class="lb-name">${esc(row.nome_ligacao || '—')} ${situacaoHTML(row)}</div>
      <div class="lb-emp">${bannerEmpHTML(row)}</div>
    </div>
    <button class="lb-clear" id="btnClearLine">✕ Limpar</button>`;
  document.getElementById('btnClearLine').addEventListener('click', () => {
    setActiveLine(null); banner.classList.add('is-hidden');
    updateNeedChips(); renderTabs(); syncHash();
  });
  // se o cache de empresas ainda não chegou, atualiza o texto quando carregar
  if (!empresas.map) getEmpresas().then(() => {
    if (activeLine === row) { const el = banner.querySelector('.lb-emp'); if (el) el.innerHTML = bannerEmpHTML(row); }
  }).catch(()=>{});
}
function selectLine(row) {
  setActiveLine(row);
  paintBanner(row);
  updateNeedChips(); renderTabs(); syncHash();
}
// `activeLine` é um snapshot do row (congelado no clique). Sem isto, uma edição ao vivo em
// tabela_vista_teste (nome, empresa, cancelamento) recarregava o modal mas deixava o BANNER
// exibindo os dados antigos. Rebusca a linha ativa e re-renderiza o banner (chamado pelo Realtime).
async function refreshActiveLine(){
  if (!activeLine) return;
  const cod = activeLine.codlinha;
  try {
    const rows = await sbFetch('tabela_vista_teste', `codlinha=eq.${enc(cod)}&select=${LINE_FIELDS}&limit=1`);
    // só reaplica se a linha ativa ainda é a mesma (usuário pode ter trocado durante a busca)
    if (rows && rows[0] && activeLine && String(activeLine.codlinha) === String(cod)) selectLine(rows[0]);
  } catch(_){ /* transitório → banner segue com o último valor conhecido */ }
}

/* ================================================================
   MODAL / SISTEMA DE VIEWS
   currentView = { title, tables:[], lineFilter, loader, _panelRun, _gen, _detail, pdfHTML }
   ----------------------------------------------------------------
   Contrato de escrita em pdfHTML/_detail — NÃO atribua currentView.pdfHTML direto.
   Todo loader/run/render que faz `await` e depois escreve um resultado:
     1. no INÍCIO, antes do seu próprio await: `const view = currentView, gen = beginGen(view);`
     2. ao terminar: `commitViewResult(view, gen, { pdfHTML: fn ou null })` no lugar da atribuição
        — usando o `view` CAPTURADO, nunca `currentView` de novo (senão uma escrita atrasada
        acerta a view aberta AGORA, não a dona da busca).
   `gen` descarta em silêncio uma escrita de uma busca/troca de linha anterior que resolveu
   depois de uma mais nova (ex.: digitar "101" e trocar pra "202" antes da 1ª resposta voltar).
   Helpers que escrevem pdfHTML DEPOIS do await de quem os chama (paginateTable, paginateLines,
   lineResults) recebem `view` E `gen` como opções em vez de capturar os próprios — capturar ali
   seria tarde demais pro guard fazer sentido. A pintura em TELA usa o MESMO guard: paginate()
   (núcleo de paginateTable/paginateLines) e paginateEvents() só escrevem container.innerHTML
   se isCurrentGen(view, gen) — por isso todo call site passa view+gen, mesmo quem usa pdf:false
   (o guard da tela independe de escrever PDF). `_panelRun` fica FORA do seam de propósito: é
   atribuído uma vez, antes de qualquer await, direto no loader — não é resultado de operação
   assíncrona, não há corrida a proteger. Painéis com lista+detalhe (hoje só Portarias) usam
   pushDetail(view, patch)/popDetail(view) em vez de commitViewResult, pra não perder o pdfHTML/
   busca da lista quando um item é aberto. Detalhes do design: beginGen/commitViewResult/
   pushDetail/popDetail logo abaixo de `let currentView`.
   ----------------------------------------------------------------
   SUB-ÍNDICE (grep `--- ` para pular). Na ordem atual do arquivo:
     Chrome do modal · Faixa de abas · Dispatcher — runView ·
     Helpers de documento e busca de linha · DOC · Folha de Rosto ·
     Eventos — helpers compartilhados · DOC · Histórico (linha) ·
     DOC · Itinerários · DOC · Quadro de Horários · DOC · Tarifas ·
     DOC · Frota · DOC · Estrutura Operacional ·
     DOC · Empresas · DOC · Municípios / entre-municípios ·
     Relatórios · DOC · Portaria · DOC · Localidades
   ================================================================ */
/* --- Chrome do modal --------------------------------------------- */
const overlay       = document.getElementById('modalOverlay');
const modalClose    = document.getElementById('modalClose');
const modalTabsEl   = document.getElementById('modalTabs');
const modalBodyWrap = document.getElementById('modalBodyWrap');
// `modalBody` deixou de ser fixo: aponta pro pane (`.modal-body`) da aba ATIVA no momento,
// trocado só por activateTab() (seção "Faixa de abas", abaixo) — nunca por atribuição direta em
// outro lugar. Todo `setBody`/`modalBody.querySelector(...)` lê o valor atual em tempo de
// chamada, então helpers síncronos (baixarPdf, searchPanel, etc.) sempre acertam a aba certa.
let modalBody    = modalBodyWrap.querySelector('.modal-body');
tabs[0].paneEl   = modalBody;
const mtTitle    = document.getElementById('mtTitle');
const mtLive     = document.getElementById('mtLive');
document.getElementById('btnPrint').addEventListener('click', () => window.print());
document.getElementById('btnPdf').addEventListener('click', baixarPdf);
modalClose.addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (overlay.classList.contains('fs-fallback')) { exitFull(); return; }
  if (!document.fullscreenElement && !document.webkitFullscreenElement) closeModal();
});
// Mantém o foco preso dentro do modal enquanto ele está aberto (Tab/Shift+Tab)
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || !overlay.classList.contains('open')) return;
  const f = overlay.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0], last = f[f.length-1], a = document.activeElement;
  if (!overlay.contains(a)) { e.preventDefault(); first.focus(); return; }   // foco escapou → traz de volta
  if (e.shiftKey && a === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last){ e.preventDefault(); first.focus(); }
});
// Linhas de tabela clicáveis: Enter/Espaço disparam o clique (reaproveita os handlers de click).
// Delegado em modalBodyWrap (não no `modalBody` de uma aba específica): o wrap é o único elemento
// estável — panes de aba são criados/destruídos, um listener preso a um deles sumiria com ele.
modalBodyWrap.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest('tr.clickable');
  if (!tr) return;
  e.preventDefault();   // Espaço não rola a página
  tr.click();
});
// Cards do seletor da aba em branco (renderTabChooser). O listener de clique dos cards mora no
// `#app`, e o modal é IRMÃO do `#app` (não descendente) — cliques aqui dentro nunca subiriam
// até lá. Delegado no wrap pelo mesmo motivo do keydown acima: os panes de aba vão e voltam.
// Reusa openView/openViewInNewTab (mesmas checagens de meta/loader/needsLine e o mesmo toast),
// então o card do modal se comporta igual ao card do painel — inclusive o ícone "abrir em
// nova aba", que aqui vira o caminho para dois assuntos abertos lado a lado.
modalBodyWrap.addEventListener('click', e => {
  const novaAba = e.target.closest('.card-newtab[data-newtab-view]');
  if (novaAba){ openViewInNewTab(novaAba.dataset.newtabView); return; }
  const card = e.target.closest('.card[data-view]');
  if (card) openView(card.dataset.view);
});
modalBodyWrap.addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const card = e.target.closest('.card[data-view]');
  if (card){ e.preventDefault(); openViewInNewTab(card.dataset.view); }
});

// Tela cheia do modal: tenta a Fullscreen API nativa; se o navegador recusar
// (ex.: dentro de iframe/preview), cai para uma maximização via classe CSS.
const btnFull = document.getElementById('btnFull');
function isFull(){ return !!(document.fullscreenElement || document.webkitFullscreenElement) || overlay.classList.contains('fs-fallback'); }
async function exitFull(){
  overlay.classList.remove('fs-fallback');
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit && (document.fullscreenElement || document.webkitFullscreenElement)) { try { await exit.call(document); } catch(_){} }
  syncFullLabel();
}
btnFull.addEventListener('click', async () => {
  if (isFull()) { exitFull(); return; }
  // 1) maximização por CSS — efeito garantido em qualquer contexto (inclusive iframe)
  overlay.classList.add('fs-fallback');
  syncFullLabel();
  // 2) fullscreen nativo do navegador como bônus, quando permitido
  const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
  if (req) { try { await req.call(overlay); } catch(_){} }
});
function syncFullLabel(){
  const lbl = btnFull.querySelector('.mt-btn-label');
  if (lbl) lbl.textContent = isFull() ? 'Sair da tela cheia' : 'Tela cheia';
}
// Se o usuário sair do fullscreen nativo (Esc/botão do navegador), tira também a maximização
function onFsChange(){ if (!(document.fullscreenElement || document.webkitFullscreenElement)) overlay.classList.remove('fs-fallback'); syncFullLabel(); }
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);

/* --- Faixa de abas ------------------------------------------------
   Cada aba tem seu próprio pane de DOM (`tab.paneEl`, um `.modal-body` dentro de
   `modalBodyWrap`) que fica vivo (escondido via CSS, não desmontado) enquanto a aba não é a
   ativa — troca de aba nunca re-renderiza nem re-executa o loader, então paginação, posição de
   rolagem e o histórico de Voltar (`tab.navStack`) da aba que vai pro fundo sobrevivem intactos.
   `activateTab` é o ÚNICO ponto que troca `activeTabId` e realinha `activeLine`/`currentView`/
   `modalBody`/o botão Voltar/o banner/a URL com a aba recém-ativada — switchTab/openTabUI/
   closeTabUI só calculam QUAL aba deve ficar ativa (via openTabState/closeTabState, puras) e
   chamam activateTab pra aplicar. */
function createPane(){
  const el = document.createElement('div');
  el.className = 'modal-body';
  el.innerHTML = loading();
  modalBodyWrap.appendChild(el);
  return el;
}
// ids (`#spInput`, `#spHost`, `#lrResult`, ...) usados pelos renderizadores de documento
// assumem que só existe UM na página — verdade quando havia uma view por vez. Com panes de
// várias abas vivos ao mesmo tempo, precisamos garantir que só a aba ATIVA carrega ids "de
// verdade" (os outros viram data-id) — sem isso, document.getElementById/aria-controls/
// Playwright etc. acertariam o primeiro pane no DOM, não necessariamente o visível.
// `modalBody.querySelector('#x')` (escopado ao pane) já funcionaria sem isto, mas ids
// duplicados no documento continuam inválidos e quebram o que depende de unicidade global.
function stripIds(pane){ pane.querySelectorAll('[id]').forEach(el => { el.dataset.id = el.id; el.removeAttribute('id'); }); }
function restoreIds(pane){ pane.querySelectorAll('[data-id]').forEach(el => { el.id = el.dataset.id; delete el.dataset.id; }); }
function showPane(tab){
  tabs.forEach(t => {
    if (!t.paneEl) return;
    const active = t === tab;
    t.paneEl.classList.toggle('active', active);
    if (active) restoreIds(t.paneEl); else stripIds(t.paneEl);
  });
}
function syncBackButton(){ btnBack.classList.toggle('is-hidden', !nav.length); }
// rótulo da aba na faixa: título do documento (ou "Nova aba", sem view ainda) + a linha, se houver
function tabLabel(t){
  const title = t.view ? t.view.title : 'Nova aba';
  const line = t.line ? (t.line.numero_ligacao || t.line.codlinha) : '';
  return line ? `${title} · ${line}` : title;
}
function renderTabs(){
  const items = tabs.map(t => `
    <div class="modal-tab${t.id===activeTabId?' active':''}${t.stale?' stale':''}" role="tab" aria-selected="${t.id===activeTabId}">
      <button type="button" class="mtab-select" data-select-tab="${t.id}" title="${esc(tabLabel(t))}${t.stale?' — dados desatualizados, atualiza ao abrir':''}">${
        t.stale ? `<span class="mtab-stale" role="img" aria-label="Dados desatualizados">●</span>` : ''}${esc(tabLabel(t))}</button>
      <button type="button" class="mtab-close" data-close-tab="${t.id}" title="Fechar aba" aria-label="Fechar aba: ${esc(tabLabel(t))}">✕</button>
    </div>`).join('');
  // o "+" fica sempre clicável (mesmo no teto de MAX_TABS) — quem bloqueia com toast é
  // openTabUI(); um botão disabled não dispararia click nenhum, e o critério de aceite pede
  // exatamente "tentar abrir... é bloqueado com um toast", não um botão inerte.
  modalTabsEl.innerHTML = items +
    `<button type="button" class="modal-tab-add" id="modalTabAdd" title="Nova aba" aria-label="Nova aba">+</button>`;
}
modalTabsEl.addEventListener('click', e => {
  const closeBtn = e.target.closest('[data-close-tab]');
  if (closeBtn){ closeTabUI(+closeBtn.dataset.closeTab); return; }
  const selBtn = e.target.closest('[data-select-tab]');
  if (selBtn){ switchTab(+selBtn.dataset.selectTab); return; }
  if (e.target.closest('#modalTabAdd')) openTabUI();
});
function activateTab(id){
  activeTabId = id;
  const t = activeTab();
  activeLine = t.line;
  currentView = t.view;
  modalBody = t.paneEl;
  showPane(t);
  overlay.scrollTop = t.scrollTop || 0;
  paintBanner(t.line);
  updateNeedChips();
  mtTitle.textContent = t.view ? t.view.title : 'Nova aba';
  syncBackButton();
  renderTabs();
  syncHash();
  // aba desatualizada volta ao ar já recarregando (o fetch que ela NÃO fez enquanto estava em
  // segundo plano acontece agora) — reloadTab limpa o indicador e repinta a faixa.
  if (t.stale) reloadTab(t);
}
// preserva a rolagem de quem está saindo (aba ativa ATUAL, antes de trocar) — chamado por
// switchTab/openTabUI logo antes de activateTab() mudar `activeTabId`.
function saveScroll(){ const cur = activeTab(); if (cur) cur.scrollTop = overlay.scrollTop; }
function switchTab(id){
  if (id === activeTabId) return;
  const t = tabs.find(x => x.id === id);
  if (!t) return;
  saveScroll();
  activateTab(id);
}
// abre uma aba (openTabState) e prepara o pane de DOM dela; devolve a aba nova, ou `null` (com
// o toast de bloqueio já disparado) se já no teto de MAX_TABS. Único ponto que cria aba de
// verdade — usado pelo "+" (aba em branco, openTabUI) e por abrir um card direto numa aba nova
// (clique-do-meio/ícone de hover, openViewInNewTab, seção CLIQUE NOS CARDS).
function addTab(){
  const res = openTabState(tabs, tabIdSeq);
  if (res.blocked){ toast(`Máximo de ${MAX_TABS} abas abertas — feche uma para abrir outra.`, 'warn'); return null; }
  saveScroll();
  tabIdSeq = res.tabIdSeq;
  tabs = res.tabs;
  const newTab = tabs[tabs.length - 1];
  newTab.paneEl = createPane();
  return newTab;
}
function openTabUI(){
  const newTab = addTab();
  if (!newTab) return;
  activateTab(newTab.id);
  runView({ title:'Nova aba', tables:['tabela_vista_teste','codempresa_teste'], loader: renderBlankTab });
}
function closeTabUI(id){
  const closed = tabs.find(t => t.id === id);
  if (!closed) return;
  const res = closeTabState(tabs, activeTabId, id);
  if (closed.paneEl) closed.paneEl.remove();
  if (res.closedModal){ closeModal(); return; }   // closeModal() já devolve a faixa a 1 aba em branco
  tabs = res.tabs;
  if (res.activeTabId === activeTabId){ renderTabs(); return; }   // fechou uma aba em 2º plano só
  activateTab(res.activeTabId);
}
// devolve a faixa a UMA aba em branco — usado quando a última aba fecha, pra próxima abertura
// do modal começar limpa (a página recarregada também só tem essa aba, nunca as antigas).
function resetTabsToSingle(){
  tabs.forEach(t => { if (t.paneEl) t.paneEl.remove(); });
  const t = makeTab(++tabIdSeq);
  t.paneEl = createPane();
  t.paneEl.classList.add('active');
  tabs = [t];
  activeTabId = t.id;
  modalBody = t.paneEl;
  renderTabs();
}
/* aba em branco (aberta pelo "+"): busca de linha + o SELETOR DE DOCUMENTOS dentro do próprio
   pane. Antes ela terminava num aviso "escolha um documento no painel lateral" — instrução
   impossível de cumprir: o painel lateral vive no `#app`, e o `.modal-overlay`
   (position:fixed; inset:0; z-index:1000) cobre a tela inteira enquanto o modal está aberto,
   então nenhum clique chega nos cards. A aba nova achava a linha e virava beco sem saída, e
   pelo mesmo motivo não dava pra abrir dois assuntos diferentes (Quadro + Portaria) em abas
   distintas — o único caminho pra isso, o ícone "abrir em nova aba" do card
   (openViewInNewTab), também está atrás do overlay.
   O seletor mostra TODOS os tópicos (não só "Documentos da Linha") justamente pra alcançar
   os cards que não exigem linha — Portarias, Empresas Regulares — e reusa `topicGridHTML`,
   o mesmo markup/CSS dos cards do painel (nada de segunda cópia que diverge depois).
   Escolher um documento SUBSTITUI a view desta aba (o `openView` de sempre, que roda na aba
   ativa): é o que preenche a aba em branco recém-criada. Aba nova continua nascendo só pelo
   "+" ou pelo ícone/clique-do-meio no card. Sem view própria em VIEW_META — não é endereçável
   por card nem por hash, como os drill-downs. */
function tabChooserHTML(){
  return `<div class="tab-chooser">` + SECTIONS.map(sec => `
    <section class="tab-chooser-sec">
      <h3>${esc(sec.name)}</h3>
      <div class="grid">${topicGridHTML(sec)}</div>
    </section>`).join('') + `</div>`;
}
// `line` chega do lineDocRun (1 resultado ou escolha na tabela); null = nenhuma linha ainda.
function renderTabChooser(host, line){
  const aviso = line
    ? `Linha ${esc(line.numero_ligacao || fmtCode(line.codlinha))} selecionada — escolha o documento desta aba:`
    : 'Escolha o documento desta aba (os que exigem linha pedem a busca acima):';
  host.innerHTML = `<p class="doc-note">${aviso}</p>` + tabChooserHTML();
  updateNeedChips();
}
function renderBlankTab(){
  searchPanel({ title:'Documentos da Linha', placeholder:'Nome, número ou código da linha',
    onRun:(term, host)=>lineDocRun(term, host, renderTabChooser) });
  const host = modalBody.querySelector('#spHost');
  if (activeLine){
    const i = modalBody.querySelector('#spInput');
    if (i) i.value = activeLine.numero_ligacao || activeLine.codlinha || '';
  }
  // o seletor aparece SEMPRE (com ou sem linha): sem ele, uma aba nova sem linha ficava presa
  // no "busque a linha…" e os cards que não precisam de linha seguiam inalcançáveis.
  renderTabChooser(host, activeLine);
}

// Gera o PDF do documento aberto via impressão nativa do navegador
let _exportandoPdf = false;
async function baixarPdf(){
  if (_exportandoPdf) return;          // evita 2º clique com o diálogo aberto (título preso / containers duplicados)
  const liveDoc = modalBody.querySelector('.doc');
  const base = (mtTitle.textContent || 'documento')
    .replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'documento';
  const code = activeLine && activeLine.codlinha ? '-' + activeLine.codlinha : '';
  const filename = `${base}${code}.pdf`;

  // Monta o documento COMPLETO (sem a paginação de tela) num container oculto de largura A4 fixa,
  // para o PDF não depender do tamanho da janela/tela cheia e não sair cortado.
  // Painéis longos (ex.: Histórico) expõem pdfHTML() com todos os eventos; os demais clonam o .doc.
  let inner;
  if (currentView && currentView.pdfHTML) inner = currentView.pdfHTML();
  else if (liveDoc) inner = liveDoc.outerHTML;
  else inner = `<div class="doc">${modalBody.innerHTML}</div>`;
  const temp = document.createElement('div');
  temp.className = 'pdf-export';
  temp.innerHTML = inner;
  document.body.appendChild(temp);

  // Caminho vetorial: imprime só este container pelo motor nativo do navegador → texto nítido,
  // selecionável e sem limite de tamanho (qualidade do "Imprimir → Salvar como PDF").
  // Trocamos o document.title pelo nome do arquivo p/ o diálogo "Salvar como PDF" sugeri-lo;
  // restauramos no cleanup. (filename já vem com ".pdf"; o navegador adiciona a extensão sozinho.)
  const tituloOriginal = document.title;
  const cleanupPrint = () => {
    document.documentElement.classList.remove('exporting');
    document.title = tituloOriginal;
    if (temp.parentNode) temp.remove();
    _exportandoPdf = false;
  };
  const exportViaPrint = () => {
    _exportandoPdf = true;             // a partir daqui o título muda → trava reentrância até o cleanup
    window.addEventListener('afterprint', cleanupPrint, { once:true });
    document.title = filename.replace(/\.pdf$/i, '');
    document.documentElement.classList.add('exporting');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ try { window.print(); } catch(_){ cleanupPrint(); } }));
    setTimeout(cleanupPrint, 60000);   // rede de segurança caso 'afterprint' não dispare (ex.: Safari)
  };

  // Garante as fontes carregadas antes de imprimir (evita fonte trocada e layout desalinhado)
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(_){}

  toast('Abrindo impressão — escolha “Salvar como PDF”', 'info');
  exportViaPrint();
}

let currentView = null, lastFocused = null;
// ponto de escrita de currentView irmão de setActiveLine (seção STATE + CACHES) — mesma regra:
// só chamado nos pontos de abrir/fechar aba (runView/closeModal), mantendo `currentView` em
// sincronia com `activeTab().view` sem espalhar leitura "por aba" pelos loaders existentes.
function setCurrentView(view){ currentView = view; activeTab().view = view; }
const btnBack = document.getElementById('btnBack');

// Seam do ciclo de vida da view: único caminho de escrita em view.pdfHTML (e no slot
// de detalhe de painéis tipo Portarias). Protege contra respostas atrasadas de uma
// busca/troca de linha anterior sobrescreverem o resultado de uma tentativa mais nova
// (ex.: digitar "101" e trocar pra "202" antes da 1ª resposta voltar).
//
// Uso: no INÍCIO de todo loader/run que vai fazer `await` e depois escrever pdfHTML —
// antes desse await, não depois — capture `const view = currentView, gen = beginGen(view);`.
// Ao terminar, troque `currentView.pdfHTML = X` por `commitViewResult(view, gen, { pdfHTML: X })`.
// Helpers que escrevem pdfHTML DEPOIS do await de quem os chama (paginateTable,
// paginateLines, lineResults) recebem `gen` como opção em vez de capturar a própria —
// capturar ali seria tarde demais pra distinguir qual tentativa é a mais recente.

// `gen` ainda é a tentativa mais recente para essa view? Usada por commitViewResult e por todo
// ponto que pinta resultado NA TELA (paginate/paginateEvents) — a mesma pergunta protege os dois.


// pushDetail/popDetail: entra/sai de um "detalhe" dentro de um painel de lista (hoje só
// Portarias) sem perder o pdfHTML/pesquisa da lista por baixo.



// Pilha de navegação do modal (voltar). Estado que muda junto — pilha, flag de "indo p/ trás"
// e o botão Voltar — encapsulado aqui em vez de três variáveis soltas espalhadas por
// runView/btnBack/closeModal (o flag solto `_goingBack` era fácil de dessincronizar).
// A pilha em si (`stack`) vive em `activeTab().navStack`, não mais numa variável de módulo —
// cada aba tem a sua própria (ver "Faixa de abas", acima).
const nav = {
  goingBack: false,
  get stack(){ return activeTab().navStack; },
  get length(){ return this.stack.length; },
  push(view){ this.stack.push(view); btnBack.classList.remove('is-hidden'); },
  pop(){ const v = this.stack.pop(); btnBack.classList.toggle('is-hidden', !this.stack.length); return v; },
  reset(){ activeTab().navStack = []; this.goingBack = false; btnBack.classList.add('is-hidden'); },
};
function closeModal(){
  if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document); }
  overlay.classList.remove('open','fs-fallback'); setCurrentView(null);
  nav.reset();
  // fechar o modal descarta TODAS as abas (mesmo estado final do "fechar" único de antes de
  // #52) — a próxima abertura começa de uma aba em branco só, nunca reaproveita as antigas.
  resetTabsToSingle();
  // devolve o foco ao elemento que abriu o modal (acessibilidade)
  if (lastFocused && lastFocused.focus) { try { lastFocused.focus(); } catch(_){} lastFocused = null; }
  // rota: fechar pela UI desfaz a entrada criada na abertura (back) ou limpa o hash;
  // fechamento disparado pela PRÓPRIA rota (botão Voltar do navegador) não mexe no histórico.
  if (!_applyingRoute){
    if (_modalPushed){ _modalPushed = false; history.back(); }
    else syncHash();
  } else { _modalPushed = false; }
  if (window.__divatReload) location.reload();
}
btnBack.addEventListener('click', () => {
  if (!nav.length) return;
  const prev = nav.pop();
  nav.goingBack = true;
  runView(prev, { silent: false });
});
function setBody(html){ modalBody.innerHTML = html; }
function loading(msg='Carregando…'){ return `<div class="m-loading"><div class="spin"></div>${esc(msg)}</div>`; }
function emptyBox(msg){ return `<div class="m-loading">${esc(msg)}</div>`; }
function errorBox(msg){ return `<div class="m-loading err">Erro ao carregar: ${esc(msg)}</div>`; }

/* --- Dispatcher — runView ---------------------------------------- */
async function runView(view, { silent=false } = {}){
  if (!nav.goingBack && overlay.classList.contains('open') && currentView) {
    nav.push(currentView);
  }
  nav.goingBack = false;
  const wasOpen = overlay.classList.contains('open');
  if (!wasOpen) lastFocused = document.activeElement;
  setCurrentView(view);
  // fixa o pane DESTA view no momento em que ela começa a rodar — não o `modalBody` ao vivo.
  // Loaders que fazem `await` e só DEPOIS chamam setBody/modalBody.querySelector (grep
  // `view._pane` neles) usam esse pane capturado, não o `modalBody` compartilhado: sem isso,
  // se o usuário trocar de aba enquanto o loader está no ar, a resposta atrasada pintaria a
  // aba ERRADA — a que está em foco agora, não a que pediu (mesma razão do seam beginGen/
  // commitViewResult, só que pro HTML da tela em vez do pdfHTML).
  view._pane = modalBody;
  mtTitle.textContent = view.title;
  renderTabs();   // título da aba ativa pode ter mudado (troca de documento dentro da mesma aba)
  overlay.classList.add('open');
  modalClose.focus();                     // move o foco p/ dentro do diálogo
  // rota: ABRIR o modal cria UMA entrada de histórico (Voltar do navegador fecha o modal);
  // trocas de view com o modal já aberto só atualizam o hash (replace, sem nova entrada).
  syncHash({ push: !wasOpen && !!view.key });
  if (!silent) setBody(loading());
  try { await view.loader(); }
  catch(e){ view._pane.innerHTML = errorBox(e.message); }
}

// header institucional reutilizável — o SVG do logo vive no index.html (header #brandLogo);
// aqui só reaproveitamos o markup (recolorável via currentColor + classe .brand-logo-doc).
const DETRO_LOGO_SVG = document.getElementById('brandLogo').innerHTML;
/* --- Helpers de documento e busca de linha ----------------------- */
function docHead(subtitle){
  return `<div class="doc-head">
    <span class="brand-logo brand-logo-doc" role="img" aria-label="DETRO — Departamento de Transportes Rodoviários do RJ">${DETRO_LOGO_SVG}</span>
    <div class="doc-head-titles"><div class="sub">DIVAT · ${esc(subtitle)}</div></div></div>`;
}
function metaRows(pairs){
  return `<div class="doc-meta">${pairs.map(([k,v,full])=> k===''? '<div class="row"></div>' : `<div class="row${full?' full':''}"><b>${esc(k)}:</b><span>${v}</span></div>`).join('')}</div>`;
}
// Largura de coluna vira CLASSE, não `style="width:…"`: a CSP publica `style-src-attr 'none'`
// e atributo style em markup é ignorado pelo navegador (verificado em Chromium headless).
// `c.w` é sempre constante do próprio código — nunca dado do usuário —, então o conjunto é
// FECHADO e cabe numa allowlist. Valor sem classe correspondente em styles.css derruba o
// gate (tests/check.js, seção [2b]): sem essa guarda, uma largura nova viraria classe
// inexistente e a coluna sairia torta EM SILÊNCIO.
const colClass = w => (w ? ` class="w-${String(w).replace('px','').replace('%','p')}"` : '');
function tableHTML(cols, bodyRows, foot, cls=''){
  return `<div class="doc-table-wrap"><table class="doc-table${cls?' '+cls:''}"><thead><tr>${cols.map(c=>`<th${colClass(c.w)}>${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${bodyRows}</tbody></table></div>${foot?`<div class="doc-foot">${esc(foot)}</div>`:''}`;
}

/* ----------------------------------------------------------------
   LOADERS POR CARD — cada um desenha em modalBody e é re-executável
   ---------------------------------------------------------------- */
const LOADERS = {};

/* ---- Documentos da Linha — busca embutida no card (nome, número ou código) ----
   Cada documento abre com um campo de busca de linha dentro do próprio card. Havendo
   linha já selecionada no topo, mostra o documento dela de imediato; pode-se trocar de
   linha pesquisando ali mesmo. `render(host, line)` desenha o documento de UMA linha
   em `host`; o wrapper cuida da busca, da escolha entre várias linhas e do PDF. */
function lineDocView({ subtitle, render }){
  searchPanel({ title:subtitle, placeholder:'Nome, número ou código da linha',
    onRun:(term, host)=>lineDocRun(term, host, render) });
  const host = modalBody.querySelector('#spHost');
  if (activeLine){
    const i = modalBody.querySelector('#spInput');
    if (i) i.value = activeLine.numero_ligacao || activeLine.codlinha || '';
    render(host, activeLine);
  } else {
    host.innerHTML = emptyBox('Busque a linha pelo nome, número ou código.');
  }
}
// o termo casa exatamente a linha já ativa? (evita re-buscar ao recarregar ao vivo)
const lineMatchesTerm = (line, term) => { const t=norm(term); return !!t && (norm(line.codlinha)===t || norm(line.numero_ligacao)===t || norm(fmtCode(line.codlinha))===t); };
// Busca linhas por nome/número/código (query única usada por todos os cards de linha).
async function searchLines(term){
  const e1 = ilikeTerm(term), code = ilikeTerm(term.replace(/[-.\s]/g,''));
  return sbFetch('tabela_vista_teste', `or=(nome_ligacao.ilike.*${e1}*,numero_ligacao.ilike.*${e1}*,codlinha.ilike.*${code}*)&select=${LINE_FIELDS}&order=nome_ligacao&limit=40`);
}
// Resolve o termo → renderiza a linha ativa, 1 resultado, ou lista p/ escolher (N).
// `render(host, line)` desenha o documento; `useActive` liga o atalho da linha já selecionada.
async function lineSearchRun(term, host, { render, emptyMsg, prompt, useActive = true }){
  const view = currentView, gen = beginGen(view);
  term = (term||'').trim();
  if (!term){
    if (useActive && activeLine) return render(host, activeLine);
    host.innerHTML = emptyBox(emptyMsg); commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  if (useActive && activeLine && lineMatchesTerm(activeLine, term)) return render(host, activeLine);
  const lines = await searchLines(term);
  if (!lines.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para “'+esc(term)+'”.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  if (lines.length === 1){ selectLine(lines[0]); return render(host, lines[0]); }
  await getEmpresas();
  host.innerHTML = `<p class="doc-note">${lines.length} linha(s) encontradas — ${prompt}:</p>` + linhasTable(lines);
  host.querySelectorAll('tr[data-row]').forEach(tr=>tr.addEventListener('click',()=>{ const l=JSON.parse(tr.dataset.row); selectLine(l); render(host, l); }));
  commitViewResult(view, gen, { pdfHTML:null });
}
// resolve o termo → 1 linha (renderiza o documento) ou várias (lista p/ escolher)
function lineDocRun(term, host, render){
  return lineSearchRun(term, host, { render, emptyMsg:'Busque a linha pelo nome, número ou código.', prompt:'clique para abrir o documento' });
}

LOADERS.folhaRosto = () => lineDocView({ subtitle:'Cadastro de Linhas: Folha de Rosto', render:renderFolhaRosto });
/* --- DOC · Folha de Rosto ----------------------------------------- */
async function renderFolhaRosto(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  const [rows, , tarifas] = await Promise.all([
    sbFetch('tabela_vista_teste', `codlinha=eq.${enc(line.codlinha)}&select=${LINE_FIELDS}&limit=1`),
    getEmpresas(),
    sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=tarifa,secao&order=secao&limit=1`)
  ]);
  const L = rows[0] || line;
  const tv = tarifas[0]?.tarifa;
  const tarifa = tv != null ? 'R$ '+Number(tv).toFixed(2).replace('.',',') : '—';
  const status = situacaoHTML(L);
  const inner = `${metaRows([
      ['Empresa', esc(empNome(L.codempresa)), true],
      ['Registro', 'RJ-'+esc(orDash(L.codempresa))],
      ['Código da Ligação', esc(fmtCode(L.codlinha))],
      ['Número da Ligação', esc(orDash(L.numero_ligacao))],
      ['Ligação', esc(L.nome_ligacao||'—'), true],
      ['Nome (ordem crescente)', esc(orDash(L.nome_lig_cresc)), true],
      ['Via', esc(orDash(L.via))],
      ['Característica', esc(orDash(L.caracteristica))],
      ['Tipo', esc(orDash(L.tipo))],
      ['Tarifa', tarifa],
      ['Licitada', L.licitado?'Sim':'Não'],
      ['Data de criação', fmtDate(L.data_criacao)],
      ['Processo de criação', esc(orDash(L.processo_criacao))],
      ['Situação', status, true],
    ])}
    <div class="doc-foot">Fonte: cadastro DETRO-RJ · DIVAT</div>`;
  host.innerHTML = inner;
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Cadastro de Linhas: Folha de Rosto')}${inner}</div>` });
}

LOADERS.folhaDivisoria = () => lineDocView({ subtitle:'Folha Divisória', render:renderFolhaDivisoria });
async function renderFolhaDivisoria(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  await getEmpresas();
  const corpo = `<div class="fd-body">
      <div class="fd-title">${esc(line.nome_ligacao||'—')}</div>
      <div class="mono fd-code">${esc(fmtCode(line.codlinha))} · ${esc(empNome(line.codempresa))} · RJ-${esc(line.codempresa||'—')}</div>
      <div class="fd-chip">${situacaoHTML(line)}</div>
      <div class="fd-note">Página de separação do processo da linha</div>
    </div>`;
  host.innerHTML = `<div class="fd-wrap">${corpo}</div>`;
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc fd-wrap-pdf">${docHead('Folha Divisória')}<div class="fd-body-pdf">${corpo}</div></div>` });
}

/* Histórico (linha e empresa): um evento por página, descrição/observação por extenso.
   A impressão e o PDF saem com todos os eventos, um por página. */
/* --- Eventos — helpers compartilhados ---------------------------- */
function evBlocksHTML(r){
  return `<div class="ev-block"><div class="ev-label">Descrição:</div><div class="ev-text${r.descricao?'':' empty'}">${r.descricao?esc(r.descricao):'—'}</div></div>
    <div class="ev-block"><div class="ev-label">Observação:</div><div class="ev-text${r.observacao?'':' empty'}">${r.observacao?esc(r.observacao):'—'}</div></div>`;
}
function evBandHTML(r, tipoLabel, tipoVal, showLine){
  return `<div class="ev-grid${showLine?' ev5':''}">
    <div class="ev-cell"><span class="ev-h">Data do Registro</span><span class="ev-v mono">${esc(fmtDate(r.data_registro))}</span></div>
    ${showLine?`<div class="ev-cell"><span class="ev-h">Linha</span><span class="ev-v mono">${esc(fmtCode(r.codlinha))}</span></div>`:''}
    <div class="ev-cell"><span class="ev-h">Nº do Processo/Doc.</span><span class="ev-v mono">${esc(orDash(r.numero_processo))}</span></div>
    <div class="ev-cell"><span class="ev-h">${esc(tipoLabel)}</span><span class="ev-v">${esc(tipoVal)}</span></div>
    <div class="ev-cell"><span class="ev-h">Data da Publicação</span><span class="ev-v mono">${esc(fmtDate(r.data_publicacao))}</span></div></div>`;
}
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


// Paginador (um evento por vez) com filtros, "ir para a página N" e callback de filtro p/ PDF.
// `opts.view`/`opts.gen` guardam a escrita inicial em `container.innerHTML` (ver `isCurrentGen`
// junto a `paginate`) — filtros digitados depois só alternam `.hid` em nós já commitados, sem
// reescrever a partir do zero, então não precisam reconferir.
function paginateEvents(container, rows, buildPage, headerHTML='', opts={}){
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
// Renderiza o histórico (paginado) de UMA linha dentro de um container
/* --- DOC · Histórico (linha) -------------------------------------- */
async function renderLineHistory(host, line){
  const view = currentView, gen = beginGen(view);
  selectLine(line);   // sincroniza a linha ativa e o banner do topo
  const [rows, lk] = await Promise.all([
    sbFetch('evento_teste', `codlinha=eq.${enc(line.codlinha)}&select=data_registro,codlinha,numero_processo,evento_linha,evento_empresa,data_publicacao,descricao,observacao&order=data_registro.asc&limit=2000`),
    getEvLookups(), getEmpresas()
  ]);
  const head = docHead('Histórico da Linha');
  const meta = metaRows([['Empresa',esc(empNome(line.codempresa)),true],['Registro','RJ-'+esc(orDash(line.codempresa))],['Código da Ligação',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],['Ligação',esc(line.nome_ligacao||'—'),true]]);
  if (!rows.length){ host.innerHTML = meta + emptyBox('Nenhum evento registrado para esta linha.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const build = r => evBandHTML(r, 'Tipo Evento da Linha', lk.lin[r.evento_linha] || lk.emp[r.evento_empresa] || '—', false) + evBlocksHTML(r);
  // PDF/impressão: um evento por página (cabeçalho repetido); segue o filtro aplicado na tela
  const pdfFrom = list => `<div class="doc">${list.map(r=>`<div class="ev-page">${head}${meta}${build(r)}</div>`).join('')}</div>`;
  paginateEvents(host, rows, build, meta, { view, gen, onFilter:(vis)=>{ commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(vis) }); } });
  commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(rows) });
}
LOADERS.historicoLinha = async () => {
  const pre = activeLine ? (activeLine.numero_ligacao || activeLine.codlinha || '') : '';
  searchPanel({ title:'Histórico da Linha', placeholder:'Nome, número ou código da linha', value:pre,
    onRun: (term, host) => lineSearchRun(term, host, { render:renderLineHistory,
      emptyMsg:'Busque pelo nome, número ou código da linha.', prompt:'clique para ver o histórico' }) });
};

/* --- DOC · Itinerários ---------------------------------------- */
const SENTIDO_ORDER = { 'Ida':1, 'Volta':2, 'Circular':3 };
const normSentido = s => { const t=String(s||'').trim().toLowerCase(); if(t.startsWith('ida'))return'Ida'; if(t.startsWith('volta'))return'Volta'; if(t.startsWith('circ'))return'Circular'; return s?String(s):'—'; };

function itinerarioTableHTML(rows, ibge){
  if(!rows.length) return emptyBox('Nenhum itinerário cadastrado para esta linha.');
  rows.forEach(r=>r._sn=normSentido(r.sentido));
  rows.sort((a,b)=>{ const oa=SENTIDO_ORDER[a._sn]||9, ob=SENTIDO_ORDER[b._sn]||9; return oa!==ob?oa-ob:(a.id-b.id); });
  let last=null;
  const body = rows.map(r=>{
    let sep=''; if(r._sn!==last){ sep=`<tr class="sentido-sep"><td colspan="4">Sentido: ${esc(r._sn)}</td></tr>`; last=r._sn; }
    const mun = (ibge[r.cod_municipio_origem]?.nome) || (r.cod_municipio_origem?String(r.cod_municipio_origem):'');
    return sep+`<tr><td class="td-sentido">${esc(r._sn||'')}</td><td class="td-tipo">${esc(r.tipo_logradouro||'')}</td>
      <td class="td-logr">${esc(r.nome_logradouro||'—')}</td><td class="td-mun">${esc(mun)}</td></tr>`;
  }).join('');
  return tableHTML([{t:'Sentido',w:'62px'},{t:'Tipo',w:'84px'},{t:'Nome do Logradouro'},{t:'Município',w:'110px'}], body, `${rows.length} logradouro(s) · cadastro DETRO-RJ`);
}

async function renderItinerarios(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  const [rows, ibge] = await Promise.all([
    sbFetch('itinerario_teste', `codlinha=eq.${enc(line.codlinha)}&select=id,sentido,tipo_logradouro,nome_logradouro,cod_municipio_origem,codempresa&order=id`),
    getIbge(), getEmpresas()
  ]);
  if (!rows.length) { host.innerHTML = emptyBox('Nenhum itinerário encontrado para esta linha.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
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

LOADERS.itinerarios = () => lineDocView({ subtitle:'Cadastro de Linhas: Itinerários', render:renderItinerarios });

/* --- DOC · Quadro de Horários --------------------------------- */
function quadroHorariosBodyHTML(interv, predet, orig){
  if(!interv.length && !predet.length) return emptyBox('Nenhum quadro de horários cadastrado para esta linha.');
  // Rótulo do SENTIDO: a origem AUTORITATIVA (origem_teste, via `orig`) tem prioridade sobre o
  // nome_origem denormalizado das tabelas de QH (que vem inconsistente/trocado na base). Agrupa
  // pelo rótulo resolvido → códigos diferentes com a mesma origem não geram blocos repetidos.
  const sentidoKey = (cod, nome) => orig[cod] || nome || ('Origem '+orDash(cod));
  let html='';
  if (interv.length){
    html += `<h3 class="doc-h3">Por intervalo / frequência</h3>`;
    for (const [label, list] of groupBy(interv, r=>sentidoKey(r.cod_origem, r.nome_origem))){
      html += `<div class="qh-sentido">Sentido · partidas de ${esc(label)}</div>`;
      for (const [dia, rows] of groupBy(list, r=>r.dia_semana||'—')){
        const body = rows.map(r=>`<tr><td class="td-num">${esc(fmtTime(r.hora_inicio))}</td>
          <td class="td-num">${esc(fmtTime(r.hora_fim))}</td><td class="td-tipo">${esc(orDash(r.intervalo))} min</td></tr>`).join('');
        html += `<div class="mt6"><div class="sentido-sep sm">${esc(dia)}</div>
          <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th class="w-33p">Início</th><th class="w-33p">Fim</th><th>Intervalo</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
      }
    }
  }
  if (predet.length){
    html += `<h3 class="doc-h3">Horários predeterminados</h3>`;
    for (const [label, list] of groupBy(predet, r=>sentidoKey(r.cod_origem, r.nome_origem))){
      html += `<div class="qh-sentido">Sentido · partidas de ${esc(label)}</div>`;
      for (const [dia, rows] of groupBy(list, r=>r.dia_semana||'—')){
        const horas = rows.map(r=>`<span class="mono qh-hora">${esc(fmtTime(r.saida))}</span>`).join('');
        html += `<div class="mt6"><div class="sentido-sep sm">${esc(dia)} · ${rows.length} partida(s)</div><div class="qh-horas">${horas}</div></div>`;
      }
    }
  }
  return html;
}

// Corpo de UM quadro (meta + tabelas) para uma linha qualquer — reusado na linha ativa,
// no clique da lista por empresa e na montagem do PDF de todos os quadros.
function quadroMetaHTML(line, ultimaAlteracao){
  const pares = [['Empresa',esc(empNome(line.codempresa)),true],['Registro','RJ-'+esc(line.codempresa||'—')],['Código',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],['Ligação',esc(line.nome_ligacao||'—'),true],['Via',esc(orDash(line.via))],['Característica',esc(orDash(line.caracteristica))],['Tipo',esc(orDash(line.tipo))],['Situação',situacaoHTML(line),true]];
  if(ultimaAlteracao!==undefined) pares.push(['Última alteração',fmtDate(ultimaAlteracao)]);
  return metaRows(pares);
}

function quadroDocInner(line, interv, predet, orig){
  return `${quadroMetaHTML(line)}
    ${quadroHorariosBodyHTML(interv, predet, orig)}`;
}

// Busca os quadros (intervalo + predeterminado) de várias linhas de uma vez e agrupa por codlinha.
async function fetchQHByLines(codlinhas){
  const inList = codlinhas.map(enc).join(',');
  const [interv, predet] = await Promise.all([
    sbFetch('qh_intervalo_teste', `codlinha=in.(${inList})&select=codlinha,cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo&order=id&limit=20000`),
    sbFetch('qh_predeterminado_teste', `codlinha=in.(${inList})&select=codlinha,cod_origem,nome_origem,dia_semana,saida&order=id&limit=30000`)
  ]);
  return { intervBy: groupBy(interv, r=>r.codlinha), predetBy: groupBy(predet, r=>r.codlinha),
           trunc: !!(interv._trunc || predet._trunc) };
}

// Modo linha: resolve o termo (número, nome ou código) → 1 linha (mostra o quadro) ou várias (lista)
function quadroLinhaRun(term, host){
  return lineSearchRun(term, host, { render:renderLinhaQuadro, emptyMsg:'Busque a linha pelo número, nome ou código.', prompt:'clique para ver o quadro' });
}

// Quadro de UMA linha (comportamento clássico do card)
async function renderLinhaQuadro(host, line){
  if(!host || !line) return;
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  try {
    const [interv, predet, qh, secoes, orig] = await Promise.all([
      sbFetch('qh_intervalo_teste', `codlinha=eq.${enc(line.codlinha)}&select=cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo&order=id`),
      sbFetch('qh_predeterminado_teste', `codlinha=eq.${enc(line.codlinha)}&select=cod_origem,nome_origem,dia_semana,saida&order=id`),
      sbFetch('qh_teste', `codlinha=eq.${enc(line.codlinha)}&select=ultima_alteracao&limit=1`),
      sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia&order=secao`),
      getOrigem(), getEmpresas()
    ]);
    if (!interv.length && !predet.length){ host.innerHTML = emptyBox('Nenhum quadro de horários cadastrado para esta linha.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
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

// compat: alguns caminhos chamam o quadro da linha ativa
const renderActiveLineQuadro = host => renderLinhaQuadro(host, activeLine);

// Modo empresa: resolve a empresa e lista as linhas com quadro
async function quadroEmpresaRun(term, host){
  const view = currentView, gen = beginGen(view);
  term = (term||'').trim();
  if(!term){
    if(activeLine) return renderActiveLineQuadro(host);
    host.innerHTML = emptyBox('Busque por uma empresa (nome ou código), ou selecione uma linha.');
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  await getEmpresas();
  const emps = searchEmpresas(term);
  if(emps.length > 1){
    host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para abrir os quadros' });
    bindEmpresaRows(host, (cod,nome)=>renderEmpresaQuadros(host, cod, nome));
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  const cod = emps.length===1 ? emps[0].codempresa : term;
  const nome = emps.length===1 ? emps[0].nome_empresa : null;
  await renderEmpresaQuadros(host, cod, nome);
}

// Lista as linhas (com quadro) de uma empresa e prepara o PDF de todos os quadros
async function renderEmpresaQuadros(host, cod, nome){
  const view = currentView, gen = beginGen(view);
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
    host.querySelector('.qh-back').addEventListener('click', ()=>renderEmpresaQuadros(host, cod, nome));
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

LOADERS.quadroHorarios = async () => {
  searchPanel({
    title:'Quadro de Horários',
    placeholder:'Número, nome ou código da linha (ou empresa)',
    selectOpts:[['linha','Por linha'],['empresa','Por empresa (PDF de todos)']],
    note: 'Por linha: número, nome ou código → mostra o quadro dela. Por empresa: nome ou código → baixa o PDF de todos os quadros da operadora.',
    onRun: (term, host, modo) => modo==='empresa' ? quadroEmpresaRun(term, host) : quadroLinhaRun(term, host)
  });
  // havendo linha ativa, prefill com a linha e mostra o quadro dela (modo "Por linha", padrão)
  if (activeLine){
    const i = modalBody.querySelector('#spInput'); if(i) i.value = activeLine.numero_ligacao || activeLine.codlinha || '';
    await renderLinhaQuadro(modalBody.querySelector('#spHost'), activeLine);
  }
};

/* --- DOC · Tarifas -------------------------------------------- */
const TARIFA_COLS = [{t:'Seção',w:'60px'},{t:'Nº Linha',w:'80px'},{t:'Ligação'},{t:'Via',w:'90px'},{t:'Caract.',w:'90px'},{t:'Tipo',w:'90px'},{t:'RM',w:'55px'},{t:'Tarifa',w:'80px'},{t:'Piso I (km)',w:'90px'},{t:'Situação',w:'90px'},{t:'Criação',w:'90px'},{t:'Status',w:'150px'}];
function tarifaRowHTML(r){
  // chip de status com a data do evento ao lado (quando a coluna de data está disponível)
  const dChip = (v,label,date) => v ? `<span class="chip chip-on">${label}${date?' '+fmtDate(date):''}</span>` : '';
  const st = [ dChip(r.cancelado,'Canc.',r.data_cancelamento), dChip(r.paralisado,'Paral.',r.data_paralisacao), dChip(r.sub_judice,'Sub jud.',r.data_sub_judice), dChip(r.transferido,'Transf.',r.data_transferencia) ].filter(Boolean).join(' ') || '<span class="chip chip-off">OK</span>';
  // "Piso I" é quilometragem (extensão da seção), não valor monetário — sem "R$"
  const pisoTxt = (r.piso_i===null||r.piso_i===undefined||r.piso_i==='') ? '—' : `${fmtMoney(r.piso_i)} km`;
  return `<tr><td class="td-num">${esc(orDash(r.secao))}</td><td class="td-num">${esc(orDash(r.numero_linha))}</td><td class="td-logr">${esc(orDash(r.nome_ligacao))}</td>
  <td class="td-tipo">${esc(orDash(r.via))}</td><td class="td-tipo">${esc(orDash(r.caracteristica))}</td><td class="td-tipo">${esc(orDash(r.tipo_ligacao))}</td><td class="td-num">${esc(orDash(r.rm))}</td>
  <td class="td-sentido">R$ ${esc(fmtMoney(r.tarifa))}</td><td class="td-num">${esc(pisoTxt)}</td>
  <td class="td-tipo">${esc(orDash(r.situacao))}</td><td class="td-num">${fmtDate(r.data_criacao)}</td><td>${st}</td></tr>`;
}
function secoesTarifasHTML(rows){
  if(!rows.length) return emptyBox('Nenhuma seção/tarifa cadastrada para esta linha.');
  return tableHTML(TARIFA_COLS, rows.map(tarifaRowHTML).join(''), rows.length+' seção(ões)');
}

async function renderTarifas(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  const rows = await sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(line.codlinha)}&select=secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia&order=secao`);
  if (!rows.length) { host.innerHTML = emptyBox('Nenhuma tarifa cadastrada para esta linha.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
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
async function tarifaEmpresaRun(term, host){
  const view = currentView, gen = beginGen(view);
  term = (term||'').trim();
  if(!term){
    if(activeLine) return renderTarifasEmpresa(host, activeLine.codempresa, empNome(activeLine.codempresa));
    host.innerHTML = emptyBox('Busque por uma empresa (nome ou código RJ), ou troque para "Por linha".');
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  await getEmpresas();
  const emps = searchEmpresas(term);
  if(emps.length > 1){
    host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para ver as tarifas' });
    bindEmpresaRows(host, (cod,nome)=>renderTarifasEmpresa(host, cod, nome));
    commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  const cod = emps.length===1 ? emps[0].codempresa : term;
  const nome = emps.length===1 ? emps[0].nome_empresa : null;
  await renderTarifasEmpresa(host, cod, nome);
}
// Lista (paginada) as tarifas de todas as linhas de UMA empresa
const LINHA_TARIFA_COLS = [{t:'Número',w:'100px'},{t:'Ligação'},{t:'Código',w:'120px'},{t:'Seções',w:'80px'},{t:'Tarifa',w:'150px'}];
// uma linha por LIGAÇÃO (deduplicado), mesmo quando ela tem várias seções de tarifa
function linhaTarifaRowHTML(l){
  return `<tr><td class="td-num">${esc(orDash(l.numero_linha||fmtCode(l.codlinha)))}</td><td class="td-logr">${esc(orDash(l.nome_ligacao))}</td><td class="td-num">${esc(fmtCode(l.codlinha))}</td><td class="td-num">${l.nsec}</td><td class="td-sentido">${esc(l.tarifaTxt)}</td></tr>`;
}
async function renderTarifasEmpresa(host, cod, nome){
  const view = currentView, gen = beginGen(view);
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

LOADERS.tarifas = () => {
  searchPanel({
    title:'Tarifas Vigentes',
    placeholder:'Nome, número ou código da linha (ou empresa)',
    selectOpts:[['linha','Por linha'],['empresa','Por empresa']],
    note:'Por linha: nome, número ou código → mostra as tarifas dela. Por empresa: nome ou código RJ → lista as tarifas de todas as linhas da operadora.',
    onRun:(term, host, modo) => modo==='empresa' ? tarifaEmpresaRun(term, host) : lineDocRun(term, host, renderTarifas)
  });
  const host = modalBody.querySelector('#spHost');
  if (activeLine){
    const i = modalBody.querySelector('#spInput');
    if (i) i.value = activeLine.numero_ligacao || activeLine.codlinha || '';
    renderTarifas(host, activeLine);
  } else {
    host.innerHTML = emptyBox('Busque a linha pelo nome, número ou código — ou troque para "Por empresa".');
  }
};

/* --- DOC · Frota ---------------------------------------------- */
function frotaBlockHTML(f){
  return `<div class="kpi-grid">
      <div class="kpi"><b>${esc(orDash(f.frota_operacional))}</b><span>Operacional</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_a))}</b><span>Comum (A)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_sa))}</b><span>Comum (SA)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_ac))}</b><span>Ar cond. (AC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_sac))}</b><span>Ar cond. (SAC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_a))}</b><span>Micro (A)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_sa))}</b><span>Micro (SA)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_ac))}</b><span>Micro (AC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_sac))}</b><span>Micro (SAC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_e))}</b><span>Micro (E)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_e))}</b><span>Especial (E)</span></div>
      <div class="kpi"><b>${esc(orDash(f.reserva))}</b><span>Reserva</span></div>
    </div>`;
}

async function renderFrota(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  const [rows] = await Promise.all([
    sbFetch('qh_teste', `codlinha=eq.${enc(line.codlinha)}&select=codempresa,hierarquia,ultima_alteracao,frota_operacional,reserva,frota_a,frota_sa,frota_ac,frota_sac,frota_e,frota_micro_a,frota_micro_sa,frota_micro_ac,frota_micro_sac,frota_micro_e&limit=1`),
    getEmpresas()
  ]);
  if (!rows.length) { host.innerHTML = emptyBox('Nenhuma frota cadastrada para esta linha.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const f = rows[0];
  const inner = `${metaRows([['Empresa',esc(empNome(f.codempresa)),true],['Registro','RJ-'+esc(orDash(f.codempresa))],
      ['Código',esc(fmtCode(line.codlinha))],['Número da Ligação',esc(orDash(line.numero_ligacao))],
      ['Ligação',esc(line.nome_ligacao||'—'),true],['Hierarquia',esc(orDash(f.hierarquia))],['Última alteração',fmtDate(f.ultima_alteracao)]])}
    ${frotaBlockHTML(f)}`;
  host.innerHTML = inner;
  commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead('Frota da Linha')}${inner}</div>` });
}

LOADERS.frota = () => lineDocView({ subtitle:'Frota da Linha', render:renderFrota });

/* --- DOC · Estrutura Operacional ------------------------------ */
async function renderEstrutura(host, line){
  const view = currentView, gen = beginGen(view);
  host.innerHTML = loading();
  const cod = enc(line.codlinha);
  const [lineRows, secoes, itin, interv, predet, qh, orig, ibge] = await Promise.all([
    sbFetch('tabela_vista_teste', `codlinha=eq.${cod}&select=${LINE_FIELDS}&limit=1`),
    sbFetch('tarifa_atual_teste', `codlinha=eq.${cod}&select=secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia&order=secao`),
    sbFetch('itinerario_teste', `codlinha=eq.${cod}&select=id,sentido,tipo_logradouro,nome_logradouro,cod_municipio_origem,codempresa&order=id`),
    sbFetch('qh_intervalo_teste', `codlinha=eq.${cod}&select=cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo&order=id`),
    sbFetch('qh_predeterminado_teste', `codlinha=eq.${cod}&select=cod_origem,nome_origem,dia_semana,saida&order=id`),
    sbFetch('qh_teste', `codlinha=eq.${cod}&select=codempresa,hierarquia,ultima_alteracao,frota_operacional,reserva,frota_a,frota_sa,frota_ac,frota_sac,frota_e,frota_micro_a,frota_micro_sa,frota_micro_ac,frota_micro_sac,frota_micro_e&limit=1`),
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

// Documento consolidado (igual ao Relatório oficial): cadastro + Seções/Tarifas +
// Itinerário + Quadro de Horários e Frota, num único .doc (também usado no PDF).
LOADERS.estrutura = () => lineDocView({ subtitle:'Cadastro de Linhas: Estrutura Operacional', render:renderEstrutura });

/* ---- Empresas ---- */
LOADERS.empresasRegulares = async () => {
  const view = currentView, gen = beginGen(view), pane = view._pane;
  // lista TODAS as empresas do cadastro (codempresa_teste), inclusive sem linhas
  const [lineRows] = await Promise.all([
    sbFetch('tabela_vista_teste', `select=codempresa,cancelado,paralisado&limit=5000`),
    getEmpresas()
  ]);
  const cnt = {};
  lineRows.forEach(r=>{ const k=r.codempresa||'—'; cnt[k]=cnt[k]||{total:0,ativas:0}; cnt[k].total++; if(isLinhaAtiva(r))cnt[k].ativas++; });
  // mesma regra compartilhada usada pelo cache nome ↔ RJ.
  const list = dedupEmpresasPorRJ(empresas.list).map(e=>({
    ...e, total:(cnt[e.codempresa]?.total)||0, ativas:(cnt[e.codempresa]?.ativas)||0
  }));
  list.sort((a,b)=> b.total-a.total || String(a.nome_empresa||'').localeCompare(String(b.nome_empresa||'')));
  const semLinha = list.filter(e=>!e.total).length;
  const statusCol = e => [boolChip(e.cassada,'Cassada'), boolChip(e.sob_intervencao,'Interv.')].filter(Boolean).join(' ') || `<span class="chip chip-off">${esc(orDash(e.situacao))}</span>`;
  const rowHTML = e => `<tr class="clickable" tabindex="0" role="button" data-emp="${esc(e.codempresa)}"><td class="td-num">${esc(e.codempresa)}</td><td class="td-logr">${esc(e.nome_empresa||'—')}</td><td class="td-tipo">${statusCol(e)}</td><td class="td-sentido">${e.total}</td><td class="td-tipo">${e.ativas}</td></tr>`;
  const cols = [{t:'RJ',w:'70px'},{t:'Empresa'},{t:'Situação',w:'150px'},{t:'Total de linhas',w:'120px'},{t:'Linhas ativas',w:'110px'}];
  pane.innerHTML = `<div class="doc">${docHead('Empresas Regulares')}
    <p class="doc-note">${list.length} empresas no cadastro${semLinha?` · ${semLinha} sem linhas`:''}. Clique para ver as ligações da empresa.</p>
    <div class="loc-tools">
      <label>Situação <select id="empSit"><option value="todas">Todas</option><option value="regular">Regulares</option><option value="cassada">Cassadas</option><option value="interv">Sob intervenção</option></select></label>
      <label>Buscar <input type="text" id="empBusca" placeholder="nome ou RJ" autocomplete="off"></label>
    </div>
    <div id="empResult"></div></div>`;
  const result = pane.querySelector('#empResult');
  const sel = pane.querySelector('#empSit'), inp = pane.querySelector('#empBusca');
  const paint = ()=>{
    const s = sel.value, termo = inp.value.trim(), q = norm(termo);
    const f = list.filter(e=>{
      const cass = !!e.cassada, interv = !!e.sob_intervencao, reg = !cass && !interv;
      if(s==='cassada' && !cass) return false;
      if(s==='interv'  && !interv) return false;
      if(s==='regular' && !reg) return false;
      if(q && !(norm(e.nome_empresa||'').includes(q) || String(e.codempresa||'').includes(termo))) return false;
      return true;
    });
    if(!f.length){ result.innerHTML = emptyBox('Nenhuma empresa com esse filtro.'); return; }
    paginateTable(result, f, {
      cols, rowHTML:e=>rowHTML(e), foot:t=>t+' empresa(s)', unit:'empresas',
      bind:c=>c.querySelectorAll('tr[data-emp]').forEach(tr=>tr.addEventListener('click',()=>openEmpresaLigacoes(tr.dataset.emp))),
      view, gen,
    });
  };
  sel.addEventListener('change', paint);
  inp.addEventListener('input', debounce(paint));
  paint();
};

/* --- DOC · Empresas ----------------------------------------------- */
function openEmpresaLigacoes(cod){
  runView({ title:'Ligações por Empresa', tables:['tabela_vista_teste','codempresa_teste'], loader: async()=>{
    const view = currentView, gen = beginGen(view), pane = view._pane;
    const [rows] = await Promise.all([
      sbFetch('tabela_vista_teste', `codempresa=eq.${enc(cod)}&select=${LINE_FIELDS}&order=nome_ligacao&limit=500`),
      getEmpresas()
    ]);
    pane.innerHTML = `<div class="doc">${docHead('Ligações por Empresa')}
      ${metaRows([['Empresa',esc(empNome(cod)),true],['Registro','RJ-'+esc(cod)],['Total',rows.length+' ligação(ões)']])}
      <div id="empLigResult"></div></div>`;
    lineResults(pane.querySelector('#empLigResult'), rows, { view, gen });
  }});
}
LOADERS.ligacoesPorEmpresa = async () => {
  const pre = activeLine?.codempresa || '';
  searchPanel({ title:'Ligações por Empresa', placeholder:'Código (ex. 101) ou nome da empresa', value:pre, onRun: async(term, host)=>{
    const view = currentView, gen = beginGen(view);
    if(!term){ host.innerHTML=emptyBox('Informe o código ou nome da empresa.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    await getEmpresas();
    let cods = [];
    if(/^\d+$/.test(term.trim())){
      cods = [term.trim()];
    } else {
      const t = norm(term);
      cods = Object.entries(empresas.map).filter(([,n])=>norm(n||'').includes(t)).map(([c])=>c);
      if(!cods.length){ host.innerHTML=emptyBox('Nenhuma empresa encontrada para "'+esc(term)+'".'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    }
    const filter = cods.length===1 ? `codempresa=eq.${enc(cods[0])}` : `codempresa=in.(${cods.map(enc).join(',')})`;
    const rows = await sbFetch('tabela_vista_teste', `${filter}&select=${LINE_FIELDS}&order=nome_ligacao&limit=500`);
    lineResults(host, rows, { view, gen });
  }});
};
LOADERS.secoesPorEmpresa = async () => {
  const pre = activeLine?.codempresa || '';
  searchPanel({ title:'Seções por Empresa', placeholder:'Código da empresa (ex. 101)', value:pre, onRun: async(term, host)=>{
    const view = currentView, gen = beginGen(view);
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
  }});
};
// Renderiza o histórico (paginado) de UMA empresa dentro de um container
async function renderEmpresaHistory(host, cod, nome){
  const view = currentView, gen = beginGen(view);
  const [rows, lk, empRows] = await Promise.all([
    sbFetch('evento_teste', `codempresa=eq.${enc(cod)}&select=data_registro,codlinha,numero_processo,evento_linha,evento_empresa,data_publicacao,descricao,observacao&order=data_registro.asc&limit=500`),
    getEvLookups(),
    sbFetch('codempresa_teste', `codempresa=eq.${enc(cod)}&select=nome_empresa,situacao,processo,data_publicacao,cassada,sob_intervencao&limit=1`)
  ]);
  const E = empRows[0] || {};
  const head = docHead('Histórico da Empresa');
  const empSit = [ boolChip(E.cassada,'Cassada'), boolChip(E.sob_intervencao,'Sob intervenção') ].filter(Boolean).join(' ') || '<span class="chip chip-off">Regular</span>';
  const meta = metaRows([['Empresa',esc(nome||E.nome_empresa||'—'),true],['Código da Empresa',esc(cod)],['Situação',esc(orDash(E.situacao))],['Processo',esc(orDash(E.processo))],['Publicação',fmtDate(E.data_publicacao)],['Situação cadastral',empSit,true],['Total',rows.length+' evento(s)']]);
  if(!rows.length){ host.innerHTML = meta + emptyBox('Nenhum evento para a empresa '+esc(cod)+'.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const build = r => evBandHTML(r, 'Tipo Evento Empresa', lk.emp[r.evento_empresa]||lk.lin[r.evento_linha]||'—', !!(r.codlinha)) + evBlocksHTML(r);
  const pdfFrom = list => `<div class="doc">${list.map(r=>`<div class="ev-page">${head}${meta}${build(r)}</div>`).join('')}</div>`;
  paginateEvents(host, rows, build, meta, { view, gen, onFilter:(vis)=>{ commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(vis) }); } });
  commitViewResult(view, gen, { pdfHTML: ()=>pdfFrom(rows) });
}
LOADERS.historicoEmpresa = async () => {
  const pre = activeLine?.codempresa || '';
  searchPanel({ title:'Histórico da Empresa', placeholder:'Nome ou código da empresa (ex. 1001 ou AUTO VIAÇÃO)', value:pre,
    onRun: async(term, host)=>{
      const view = currentView, gen = beginGen(view);
      term = (term||'').trim();
      if(!term){ host.innerHTML=emptyBox('Busque pelo nome ou código da empresa.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
      // busca client-side sobre o cadastro completo → insensível a maiúsc./minúsc. E acento
      await getEmpresas();
      const emps = searchEmpresas(term);
      if(emps.length === 1){ await renderEmpresaHistory(host, emps[0].codempresa, emps[0].nome_empresa); return; }
      if(emps.length > 1){
        host.innerHTML = empresaChooserHTML(emps, { prompt:'clique para ver o histórico', sitWidth:'170px',
          extraChips:e=>boolChip(e.cassada,'cassada')+boolChip(e.sob_intervencao,'interv.') });
        bindEmpresaRows(host, (cod,nome)=>renderEmpresaHistory(host, cod, nome));
        commitViewResult(view, gen, { pdfHTML:null }); return;
      }
      // não achou no cadastro de nomes → tenta o termo como código direto nos eventos
      await renderEmpresaHistory(host, term, null);
    } });
};

/* ---- Consultas de Ligações ---- */
LOADERS.ligacoesPorNome = async () => {
  searchPanel({ title:'Ligações pelo Nome', placeholder:'Parte do nome da ligação', note:'Esta consulta casa apenas o NOME da ligação (ordem alfabética). Para localizar por número ou código, use a busca do topo da página.', onRun: async(term, host)=>{
    const view = currentView, gen = beginGen(view);
    const qs = term? `nome_ligacao=ilike.*${ilikeTerm(term)}*&` : '';
    const [rows] = await Promise.all([
      sbFetch('tabela_vista_teste', `${qs}select=${LINE_FIELDS}&order=nome_ligacao&limit=80`),
      getEmpresas()
    ]);
    lineResults(host, rows, { view, gen });
  }, auto:true});
};
LOADERS.ligacoesPorNumero = async () => {
  searchPanel({ title:'Identificar pelo Número', placeholder:'Número ou código da linha', onRun: async(term, host)=>{
    const view = currentView, gen = beginGen(view);
    if(!term){ host.innerHTML=emptyBox('Digite o número ou código.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    const e1=ilikeTerm(term), code=ilikeTerm(term.replace(/[-.\s]/g,''));
    const [rows] = await Promise.all([
      sbFetch('tabela_vista_teste', `or=(numero_ligacao.ilike.*${e1}*,codlinha.ilike.*${code}*)&select=${LINE_FIELDS}&order=codlinha&limit=80`),
      getEmpresas()
    ]);
    lineResults(host, rows, { view, gen });
  }});
};
LOADERS.ligacoesPorLogradouro = async () => {
  const ibge = await getIbge();
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  searchPanel({ title:'Ligações por Logradouro', placeholder:'Nome da via / logradouro', selectOpts:[['','Todos os municípios'],...munOpts], onRun: async(term, host, ibgeCod)=>{
    const view = currentView, gen = beginGen(view);
    if(!term){ host.innerHTML=emptyBox('Digite o nome do logradouro.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
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
  }});
};
LOADERS.municipioRegiao = async () => {
  const ibge = await getIbge();
  // Região Programa clássica (regiao_municipio) — é a classificação do print DETRO.
  const regioes = [...new Set(Object.values(ibge).map(x=>x.regiaoPrograma).filter(Boolean))].sort();
  // tabela de municípios clicáveis (drill-down → openLinhasPorIbge)
  const munTable = (entries, host)=>{
    const body = entries.sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>
      `<tr class="clickable" tabindex="0" role="button" data-ibge="${esc(cod)}"><td class="td-logr">${esc(v.nome)}</td><td class="td-tipo">${esc(orDash(v.regiaoPrograma))}</td><td class="td-num">cód. ${esc(cod)}</td></tr>`).join('');
    host.innerHTML = body? tableHTML([{t:'Município'},{t:'Região',w:'160px'},{t:'IBGE',w:'100px'}], body, entries.length+' município(s) · clique para ver as linhas'):emptyBox('Nenhum município.');
    host.querySelectorAll('tr[data-ibge]').forEach(tr=>tr.addEventListener('click',()=>openLinhasPorIbge(tr.dataset.ibge, ibge[tr.dataset.ibge]?.nome)));
  };
  searchPanel({ title:'Município e Região', placeholder:'Nome do município (ou escolha uma região)', selectOpts:[['','Todas as regiões'],...regioes.map(r=>[r,r])], onRun: async(term, host, region)=>{
    await getEmpresas();
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
        const view = currentView, gen = beginGen(view);
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
  }, auto:true});
};
/* --- DOC · Municípios / entre-municípios -------------------------- */
function openLinhasPorIbge(codibge, nome){
  runView({ title:'Linhas no Município', tables:['itinerario_teste','tabela_vista_teste','codempresa_teste'], loader: async()=>{
    const view = currentView, gen = beginGen(view), pane = view._pane;
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
      // gen PRÓPRIO (nova geração da MESMA view capturada, não currentView): o usuário pode
      // alternar o filtro de novo antes de ensureCls() (seu próprio await) resolver — mesma
      // corrida que motivou o seam. Reler `currentView` aqui acertaria a aba ERRADA se o
      // usuário tivesse trocado de aba nesse meio-tempo (mesma razão do `view._pane` acima).
      const pGen = beginGen(view);
      // pdf:false → o PDF do Município é o determinístico definido acima (lista completa + meta)
      if(scope.value==='todas'){ lineResults(result, rows, { pdf:false, view, gen:pGen }); return; }
      result.innerHTML = loading();
      const c = await ensureCls();
      const set = scope.value==='dentro' ? c.dentro : c.inter;
      lineResults(result, rows.filter(r=>set.has(String(r.codlinha))), { pdf:false, view, gen:pGen });
    }
    scope.addEventListener('change', ()=>{ paint().catch(e=>{ result.innerHTML = errorBox(e.message); }); });
    paint();
  }});
}
// classifica linhas por município (dentro × intermunicipal) a partir das linhas de
// itinerário (codlinha, cod_municipio_origem). "dentro" = todos os trechos no próprio município (M);
// "inter" = tem ao menos um trecho em OUTRO município (cod_municipio_origem não-vazio e != M).

// linhas (codlinha distintos) cujo itinerário passa por um município (codibge)
//
// `memo` (opcional): Map de UMA execução, para não repetir a mesma consulta dentro da mesma
// busca. NÃO é cache global de propósito — cache global aqui envelheceria em silêncio se o
// Realtime caísse, e precisaria entrar no invalidateCaches; o ganho não paga o acoplamento,
// porque a repetição que importa acontece toda dentro de uma única busca (ver
// mostrarLinhasEntreMunicipios).
async function linhasNoMunicipio(codibge, memo){
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
async function mostrarLinhasResultado(host, cods, titulo){
  const view = currentView, gen = beginGen(view);
  if(!cods.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para este critério.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const slice = cods.slice(0,250);
  const rows = await fetchLinesByCods(slice,{limit:250});
  const extra = cods.length>slice.length ? ` (mostrando ${slice.length})` : '';
  const prefix = `<p class="doc-count">${cods.length} linha(s) — ${esc(titulo)}${extra}</p>`;
  lineResults(host, rows, { prefixHTML: prefix, view, gen });
}
// Município A × Município B — filtro direcional (A→B, respeita a ordem do itinerário) e
// filtro "trafega pelos dois" (qualquer ordem). `inter` é o próprio resultado não-direcional;
// o direcional refina `inter` consultando a sequência de trechos do itinerário.
async function mostrarLinhasEntreMunicipios(host, aTerm, bTerm, directional){
  const ibge = await getIbge();
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
    const pares = [];         // pares e linhas candidatas; itinerários são baixados em lote abaixo
    const memoMun = new Map();
    for(const ca of codsA.slice(0,5)){
      for(const cb of codsB.slice(0,5)){
        if(ca===cb) continue;
        const lA = await linhasNoMunicipio(ca, memoMun);
        const sB = new Set(await linhasNoMunicipio(cb, memoMun));
        const interPar = lA.filter(c=>sB.has(c));
        interPar.forEach(c=>inter.add(c));
        if(directional && interPar.length) pares.push({ ca, cb, cods:interPar.slice(0,200) });
      }
    }
    if(directional && pares.length){
      // Hotspot medido: os pares ambíguos repetiam consultas de itinerário. Une os códigos e
      // baixa lotes de até 200 uma vez; a decisão A→B continua local e separada por sentido.
      const necessarios = [...new Set(pares.flatMap(p=>p.cods))];
      const porLinha = new Map();
      for(let i=0; i<necessarios.length; i+=200){
        const lote = necessarios.slice(i, i+200);
        const it = await sbFetch('itinerario_teste', `codlinha=in.(${lote.map(enc).join(',')})&select=codlinha,cod_municipio_origem,sentido&order=id&limit=30000`);
        for(const r of it){
          const cl = String(r.codlinha), sentido = r.sentido || '';
          if(!porLinha.has(cl)) porLinha.set(cl, new Map());
          const sentidos = porLinha.get(cl);
          if(!sentidos.has(sentido)) sentidos.set(sentido, []);
          sentidos.get(sentido).push(r);
        }
      }
      for(const par of pares){
        for(const cod of par.cods){
          const sentidos = porLinha.get(String(cod));
          if(!sentidos) continue;
          for(const seq of sentidos.values()){
            const iA=seq.findIndex(r=>String(r.cod_municipio_origem)===String(par.ca));
            const iB=seq.findIndex(r=>String(r.cod_municipio_origem)===String(par.cb));
            if(iA>=0&&iB>=0&&iA<iB){ all.add(String(cod)); break; }
          }
        }
      }
    }
    const titA = codsA.length===1 ? nameOf(codsA[0]) : a;
    const titB = codsB.length===1 ? nameOf(codsB[0]) : b;
    const titulo = directional ? `de ${titA} → ${titB}` : `${titA} e ${titB} (qualquer sentido)`;
    await mostrarLinhasResultado(host, [...(directional?all:inter)], titulo);
  }catch(e){ host.innerHTML = errorBox(e.message); }
}
LOADERS.ligacoesPorTerminal = async () => {
  const [orig, ibge, terminais] = await Promise.all([getOrigem(), getIbge(), getTerminais()]);
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  const nomesOrigem = [...new Set(Object.values(orig).filter(Boolean))];
  const nomesTerminal = [...new Set(terminais.map(r=>r.nome_logradouro).filter(Boolean))];
  const nomesTodos = [...new Set([...nomesOrigem, ...nomesTerminal])].sort((a,b)=>a.localeCompare(b));
  const suggest = q => { const nq=norm(q); return nomesTodos.filter(n=>norm(n).includes(nq)); };
  searchPanel({ title:'Ligações por Terminais', placeholder:'Nome do terminal / origem', selectOpts:[['','Todos os municípios'],...munOpts], suggest, onRun: async(term, host, ibgeCod)=>{
    const view = currentView, gen = beginGen(view);
    if(!term){ host.innerHTML=emptyBox('Digite o nome do terminal/origem.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    const nTerm = norm(term);
    // duas fontes distintas de "terminal": origem_teste (ponto de origem do quadro de horários,
    // quase sempre nome de município) e itinerario_teste tipo "Terminal" (terminal físico, ex.
    // "Rodoviário Menezes Côrtes") — busca casa qualquer uma das duas.
    const cods = Object.entries(orig).filter(([,n])=>norm(n).includes(nTerm)).map(([c])=>c);
    const termRows = (await getTerminais()).filter(r=>norm(r.nome_logradouro).includes(nTerm));
    if(!cods.length && !termRows.length){ host.innerHTML=emptyBox('Nenhum terminal/origem com esse nome.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    let qi=[], qp=[];
    if(cods.length){
      const inList = cods.slice(0,50).map(enc).join(',');
      [qi, qp] = await Promise.all([
        sbFetch('qh_intervalo_teste', `cod_origem=in.(${inList})&select=codlinha&limit=3000`),
        sbFetch('qh_predeterminado_teste', `cod_origem=in.(${inList})&select=codlinha&limit=3000`)
      ]);
    }
    let lineCods=distinctCods([...qi, ...qp, ...termRows],120);
    const munTxt = ibgeCod? ` em ${esc(ibge[ibgeCod]?.nome||'')}` : '';
    if(ibgeCod){
      const munSet = new Set(await linhasNoMunicipio(ibgeCod));
      lineCods = lineCods.filter(c=>munSet.has(c));
    }
    if(!lineCods.length){ host.innerHTML=emptyBox(`Nenhuma linha vinculada a esse terminal${munTxt}.`); commitViewResult(view, gen, { pdfHTML:null }); return; }
    const rows = await fetchLinesByCods(lineCods,{limit:200});
    const prefix = `<p class="doc-note">${lineCods.length} linha(s) a partir de "${esc(term)}"${munTxt}</p>`;
    lineResults(host, rows, { prefixHTML: prefix, view, gen });
  }});
};
LOADERS.secoesPorLigacao = async () => {
  const pane = currentView._pane;   // capturado ANTES do await — ver comentário em runView()
  const rows = await sbFetch('tarifa_atual_teste', `codlinha=eq.${enc(activeLine.codlinha)}&select=secao,nome_ligacao,tarifa&order=secao`);
  const meta = metaRows([['Ligação',esc(activeLine.nome_ligacao||'—'),true],['Código',esc(fmtCode(activeLine.codlinha))]]);
  if(!rows.length){ pane.innerHTML = `<div class="doc">${docHead('Seções por Ligação')}${meta}${emptyBox('Nenhuma seção cadastrada para esta linha.')}</div>`; return; }
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
};

/* ---- Gerenciais ---- */
// Agregação PURA do Relatório Gerencial (testável em tests/) — separa o cálculo do render.
// ativa = isLinhaAtiva (não cancelada nem paralisada); porEmp = top 15 empresas por nº de linhas.
/* --- Relatórios --------------------------------------------------- */

LOADERS.relatoriosGerenciais = async () => {
  const pane = currentView._pane;   // capturado ANTES do await — ver comentário em runView()
  const [rows] = await Promise.all([
    sbFetch('tabela_vista_teste', `select=codempresa,tipo,cancelado,paralisado,sub_judice,transferido&limit=5000`),
    getEmpresas()
  ]);
  const { total, ativas, canc, paral, sj, empCount, porEmp } = resumoRelatorio(rows);
  pane.innerHTML = `<div class="doc">${docHead('Relatórios Gerenciais')}
    <div class="kpi-grid">
      <div class="kpi"><b>${total}</b><span>Linhas cadastradas</span></div>
      <div class="kpi"><b>${ativas}</b><span>Ativas</span></div>
      <div class="kpi"><b>${canc}</b><span>Canceladas</span></div>
      <div class="kpi"><b>${paral}</b><span>Paralisadas</span></div>
      <div class="kpi"><b>${sj}</b><span>Sub judice</span></div>
      <div class="kpi"><b>${empCount}</b><span>Empresas</span></div>
    </div>
    <h3 class="doc-h3">Top empresas por nº de linhas</h3>
    ${tableHTML([{t:'RJ',w:'70px'},{t:'Empresa'},{t:'Linhas',w:'90px'}], porEmp.map(([c,n])=>`<tr><td class="td-num">${esc(c)}</td><td class="td-logr">${esc(empNome(c))}</td><td class="td-sentido">${n}</td></tr>`).join(''))}
    <div class="doc-foot">Consolidado sobre ${total} linhas · cadastro DETRO-RJ · DIVAT</div></div>`;
};
// Agregação PURA da Frota por Empresa (testável em tests/): total geral + quebra por empresa e
// por hierarquia. num() trata vazio/inválido como 0; ordena por frota operacional desc.

// Frota consolidada por empresa (total geral + quebra por hierarquia) — item 16
LOADERS.frotaPorEmpresa = async () => {
  const pane = currentView._pane;   // capturado ANTES do await — ver comentário em runView()
  const [rows] = await Promise.all([
    sbFetch('qh_teste', `select=codempresa,hierarquia,frota_operacional,reserva&limit=10000`),
    getEmpresas()
  ]);
  if(!rows.length){ pane.innerHTML = `<div class="doc">${docHead('Frota por Empresa')}${emptyBox('Nenhuma frota cadastrada.')}</div>`; return; }
  const fmtN = n => n.toLocaleString('pt-BR');
  const { totOp, totRes, porEmp, porHier } = resumoFrota(rows);
  const h3 = t => `<h3 class="doc-h3">${t}</h3>`;
  pane.innerHTML = `<div class="doc">${docHead('Frota por Empresa')}
    ${bannerTrunc(rows)}
    <div class="kpi-grid">
      <div class="kpi"><b>${fmtN(totOp)}</b><span>Frota operacional</span></div>
      <div class="kpi"><b>${fmtN(totRes)}</b><span>Reserva</span></div>
      <div class="kpi"><b>${rows.length}</b><span>Linhas</span></div>
      <div class="kpi"><b>${porEmp.length}</b><span>Empresas</span></div>
      <div class="kpi"><b>${porHier.length}</b><span>Hierarquias</span></div>
    </div>
    ${h3('Frota por empresa')}
    ${tableHTML([{t:'RJ',w:'62px'},{t:'Empresa'},{t:'Linhas',w:'78px'},{t:'Operacional',w:'108px'},{t:'Reserva',w:'90px'}],
      porEmp.map(e=>`<tr><td class="td-num">${esc(e.cod)}</td><td class="td-logr">${esc(empNome(e.cod))}</td><td class="td-num">${e.n}</td><td class="td-sentido">${fmtN(e.op)}</td><td class="td-num">${fmtN(e.res)}</td></tr>`).join(''),
      `${porEmp.length} empresa(s) · total operacional ${fmtN(totOp)} · reserva ${fmtN(totRes)}`)}
    ${h3('Frota por hierarquia')}
    ${tableHTML([{t:'Hierarquia'},{t:'Linhas',w:'78px'},{t:'Operacional',w:'108px'},{t:'Reserva',w:'90px'}],
      porHier.map(x=>`<tr><td class="td-logr">${esc(orDash(x.h))}</td><td class="td-num">${x.n}</td><td class="td-sentido">${fmtN(x.op)}</td><td class="td-num">${fmtN(x.res)}</td></tr>`).join(''))}
    <div class="doc-foot">Consolidado sobre ${rows.length} linhas · cadastro DETRO-RJ · DIVAT</div></div>`;
};
LOADERS.pesquisaEvento = async () => {
  searchPanel({ title:'Pesquisa de Evento', placeholder:'Termo livre (processo, descrição, observação)', onRun: async(term, host)=>{
    const view = currentView, gen = beginGen(view);
    if(!term){ host.innerHTML=emptyBox('Digite um termo para pesquisar eventos.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    const t=ilikeTerm(term);
    const [rows] = await Promise.all([
      sbFetch('evento_teste', `or=(descricao.ilike.*${t}*,observacao.ilike.*${t}*,numero_processo.ilike.*${t}*)&select=data_registro,codlinha,codempresa,numero_processo,descricao,observacao&order=data_registro.desc&limit=200`),
      getEmpresas()
    ]);
    if(!rows.length){ host.innerHTML = emptyBox('Nenhum evento encontrado para "'+esc(term)+'".'); commitViewResult(view, gen, { pdfHTML:null }); return; }
    paginateTable(host, rows, {
      cols:[{t:'Data',w:'82px'},{t:'Linha',w:'100px'},{t:'Empresa'},{t:'RJ',w:'60px'},{t:'Processo',w:'100px'},{t:'Descrição'},{t:'Observação'}],
      rowHTML:r=>`<tr><td class="td-num">${esc(fmtDate(r.data_registro))}</td><td class="td-num">${esc(fmtCode(r.codlinha))}</td><td class="td-logr">${esc(empNome(r.codempresa))}</td><td class="td-num">${esc(orDash(r.codempresa))}</td>
        <td class="td-num">${esc(orDash(r.numero_processo))}</td><td class="td-logr">${esc(orDash(r.descricao))}</td><td class="td-logr">${esc(orDash(r.observacao))}</td></tr>`,
      foot:t=>t+' evento(s)', unit:'eventos',
      view, gen,
    });
  }});
};
let _portariaAnos = null;
/* --- DOC · Portaria ----------------------------------------------- */
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
LOADERS.portarias = async () => {
  const pane = currentView._pane;   // capturado ANTES do await — ver comentário em runView()
  const anos = await getPortariaAnos();
  pane.innerHTML = `<div class="doc">${docHead('Portarias / Legislação')}
    <div class="ev-filters">
      <div class="evf"><label>Número</label><input id="pNum" type="text" placeholder="ex.: 1975" autocomplete="off"></div>
      <div class="evf"><label>Ano</label><select id="pAno"><option value="">Todos</option>${anos.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></div>
      <div class="evf"><label>Situação</label><select id="pVig"><option value="">Todas</option><option value="vigor">Em vigor</option><option value="revog">Revogadas</option></select></div>
      <div class="evf evf-wide"><label>Texto (assunto / conteúdo)</label><input id="pTxt" type="text" placeholder="palavra no assunto ou no texto da portaria" autocomplete="off"></div>
      <button class="evf-clear" id="pClear" type="button">Limpar</button>
    </div>
    <div id="pHost"></div></div>`;
  const num=pane.querySelector('#pNum'), ano=pane.querySelector('#pAno'),
        vig=pane.querySelector('#pVig'), txt=pane.querySelector('#pTxt'), host=pane.querySelector('#pHost');
  const run = async()=>{
    const view = currentView, gen = beginGen(view);
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
          const open=()=>showPortaria(rows[+tr.dataset.idx], host, view);
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
  if(currentView) currentView._panelRun = run;
  run();
};
// `view` = a view da LISTA (capturada por quem abriu o item) — pushDetail/popDetail trocam só
// o pdfHTML dela, preservando a busca/paginação por baixo (ver `Seam do ciclo de vida da view`).
function showPortaria(r, host, view){
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

/* ---- Linhas por Localidade (cruza nome em tabela_vista_teste; enriquece com qh_teste) ---- */
let _localidadesList = null;
/* --- DOC · Localidades -------------------------------------------- */
async function getLocalidades(){
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
// nomes canônicos da lista de localidades que casam o termo (insensível a acento/caixa) —
// permite digitar "sao goncalo" e buscar no servidor por "SÃO GONÇALO" (o ilike do PostgREST
// NÃO ignora acento)

// termos p/ o ilike de localidade: nomes canônicos (com acento) + o termo digitado (texto
// livre, cobre grafias sem acento na base), sem duplicatas
async function termosLocalidade(term){
  const canon = localidadesQueCasam(await getLocalidades(), term);
  const out = [], seen = new Set();
  for(const t of [...canon, term.trim()]){
    const k = t.toLowerCase(); if(!t || seen.has(k)) continue; seen.add(k); out.push(t);
  }
  return out;
}
// filtro or=() do PostgREST: cada coluna ilike cada termo

// cod_ibge cujo nome de município é EXATAMENTE um dos termos (insens. a acento/caixa) —
// exato de propósito: "rio" não pode puxar Rio de Janeiro/Rio Bonito/Rio Claro inteiros

// codlinha que casam uma localidade pelo NOME/VIA da linha (tabela_vista), por uma SEÇÃO de
// tarifa OU por um LOGRADOURO do itinerário — MESMA semântica usada na busca do campo A.
// Usado p/ cruzar duas localidades de forma simétrica (independe da ordem dos campos).
async function codsPorLocalidade(term){
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
async function mostrarLinhasPorLocalidade(host, a, b, bTipo='localidade'){
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
      if(!cods.length){ host.innerHTML = emptyBox(`Nenhum município com o nome "${esc(b)}".`); return; }
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
    if(!base.length){ host.innerHTML = emptyBox(b?`Nenhuma linha entre "${esc(a)}" e "${esc(b)}".`:`Nenhuma linha encontrada para "${esc(a)}".`); return; }
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
    renderLocalidadeSecoes(host, base, secByLine, { prefixHTML: prefix });
  }catch(e){ host.innerHTML = errorBox(e.message); }
}
// 5 modos de busca da tela "Linhas por Localidade e Município" — cada botão de filtro decide
// o tipo do campo A/B e qual função de busca roda (localidade× vs. município×).
const LOC_FILTERS = [
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
LOADERS.localidades = async () => {
  const pane = currentView._pane;   // capturado agora — usado também pelo .then() assíncrono abaixo
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

  const run = async () => {
    const f = LOC_FILTERS[modeIdx];
    const a=(A.value||'').trim(), b=(B.value||'').trim();
    if(!a){ host.innerHTML = emptyBox(`Informe ${f.aType==='municipio'?'o município':'a localidade'}.`); return; }
    if(f.kind==='localidade'){
      const bTipo = f.bMode==='municipio' ? 'municipio' : 'localidade';
      const bb = f.bMode==='none' ? '' : b;
      if(bb && bTipo==='localidade' && a.toLowerCase()===bb.toLowerCase()){ host.innerHTML=emptyBox('Use localidades diferentes nos dois campos.'); return; }
      await mostrarLinhasPorLocalidade(host, a, bb, bTipo);
    }else{
      if(b && a.toLowerCase()===b.toLowerCase()){ host.innerHTML=emptyBox('Use municípios diferentes nos dois campos.'); return; }
      await mostrarLinhasEntreMunicipios(host, a, b, f.directional);
    }
  };
  pane.querySelector('#locGo').addEventListener('click', run);
  [A,B].forEach(el=>el.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); }));
  if(currentView) currentView._panelRun = run;   // realtime relê modeIdx a cada chamada, não fixa o modo

  Promise.all([getLocalidades(), getIbge()]).then(([locs, ibge])=>{
    const muns = [...new Set(Object.values(ibge).map(v=>v.nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const locDL = pane.querySelector('#locList'), munDL = pane.querySelector('#munLocList');
    if(locDL) locDL.innerHTML = locs.map(n=>`<option value="${esc(n)}"></option>`).join('');
    if(munDL) munDL.innerHTML = muns.map(n=>`<option value="${esc(n)}"></option>`).join('');
  }).catch(e=>{ console.warn('datalists de localidade/município indisponíveis:', e); });
};

/* ================================================================
   COMPONENTES AUXILIARES (tabela de linhas + painel de busca)
   ================================================================ */
// codlinhas distintos (descarta vazios); `limit` opcional corta a lista
const distinctCods = (rows, limit) => [...new Set(rows.map(r=>r.codlinha).filter(Boolean))].slice(0, limit);
// busca as linhas (tabela_vista) de uma lista de codlinha + garante o cache de empresas
async function fetchLinesByCods(cods, { limit = 300 } = {}){
  const [rows] = await Promise.all([
    sbFetch('tabela_vista_teste', `codlinha=in.(${cods.map(enc).join(',')})&select=${LINE_FIELDS}&order=nome_ligacao&limit=${limit}`),
    getEmpresas()
  ]);
  return rows;
}
// ordena grupos de empresa pelo RJ (codempresa) numérico; sem código vai pro fim
function rjOrder(a, b){
  const na=parseInt(a,10), nb=parseInt(b,10);
  if(isNaN(na)&&isNaN(nb)) return String(a).localeCompare(String(b));
  if(isNaN(na)) return 1; if(isNaN(nb)) return -1;
  return na-nb;
}
// bordas de paginação: clampa `page` no intervalo válido e devolve os índices da fatia.
// total=0 → 1 página (start=end=0). PURA (cópia em tests/pure.harness.js; testada).

// Núcleo de paginação POR FATIA, agnóstico de conteúdo. Reusa o visual do paginador de eventos
// (.doc-pager/.pg-*) e o `pageBounds` (testado). `renderSlice(start,end)` devolve o HTML da
// página; `afterPaint(slot)` (opcional) religa cliques; `unit` rotula o .pg-info. Sem barra
// quando total <= pageSize. Usado por paginateLines e paginateTable.
// `view`/`gen`: guarda a escrita inicial em `container.innerHTML` (não só o pdfHTML — ver
// `isCurrentGen`) contra uma resposta atrasada de uma busca/troca de linha anterior pintando a
// tabela errada por cima de uma mais nova, mesmo DENTRO do mesmo painel (host ainda anexado).
// Cliques de página (prev/next/ir) que rodam DEPOIS não reconferem: já pertencem ao commit
// vencedor — se uma busca mais nova tivesse ganho, este container nem teria sido escrito.
function paginate(container, total, renderSlice, { pageSize=25, afterPaint, unit='itens', view, gen } = {}){
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
// capturar aqui seria tarde demais, e usar `currentView` (em vez do `view` recebido) escreveria
// na view ATUAL mesmo que quem chamou já não seja mais ela (troca de view no meio do caminho).
function paginateTable(container, items, { cols, rowHTML, foot, bind, cls='', pageSize=25, unit='itens', pdf=true, view, gen } = {}){
  const total = items.length;
  const renderSlice = (s,e)=>tableHTML(cols, items.slice(s,e).map((it,j)=>rowHTML(it, s+j)).join(''),
    typeof foot==='function' ? foot(total) : foot, cls);
  paginate(container, total, renderSlice, { pageSize, afterPaint:bind, unit, view, gen });
  // PDF = lista INTEIRA (a paginação é só de tela). `pdf:false` p/ quem já define o próprio pdfHTML.
  if(pdf && view) commitViewResult(view, gen, { pdfHTML: ()=>`<div class="doc">${docHead(view.title)}${renderSlice(0, total)}</div>` });
}
// Paginador de LISTAS de linha (25/página). `grouped` insere os cabeçalhos de empresa DENTRO de
// cada página; a contagem do cabeçalho é a do grupo INTEIRO (não só a da página).
// `view`/`gen` — mesma observação de paginateTable acima.
function paginateLines(container, rows, { grouped=false, pageSize=25, pdf=true, view, gen } = {}){
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
function lineResults(host, rows, { prefixHTML='', pdf=true, view, gen } = {}){
  if(!rows || !rows.length){ host.innerHTML = prefixHTML + emptyBox('Nenhuma ligação encontrada.'); return; }
  // bannerTrunc(rows) uma vez no topo: avisa "Resultado parcial" quando a QUERY atingiu o teto
  // (limit). A paginação abaixo exibe tudo em páginas — não corta mais no cliente.
  host.innerHTML = prefixHTML + bannerTrunc(rows)
    + `<div class="loc-tools">
         <label>Situação <select id="lrStatus"><option value="todas">Todas</option><option value="ativas">Ativas</option><option value="canceladas">Canceladas</option></select></label>
         <label><input type="checkbox" id="lrGroup" checked> Agrupar por empresa</label>
       </div>
       <div id="lrResult"></div>`;
  const result = host.querySelector('#lrResult');
  const statusSel = host.querySelector('#lrStatus'), groupChk = host.querySelector('#lrGroup');
  const paint = ()=>{
    const st = statusSel.value;
    const f = st==='ativas' ? rows.filter(r=>!r.cancelado && !r.paralisado)
            : st==='canceladas' ? rows.filter(r=>r.cancelado) : rows;
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
// ordenação padrão de qualquer listagem de linhas: pelo código da ligação (codlinha),
// natural/numérico (108-003 antes de 108-029). Usado em toda exibição de várias linhas.

function linhasTable(rows){
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
function bindLineRows(host){
  // qualquer elemento com data-row (linha <tr> da tabela OU cabeçalho de linha do
  // relatório de seções) abre a linha ao clicar
  (host||modalBody).querySelectorAll('[data-row]').forEach(el=>el.addEventListener('click',()=>{
    selectLine(JSON.parse(el.dataset.row)); closeModal();
    toast('Linha selecionada: '+(activeLine.nome_ligacao||activeLine.codlinha),'info');
  }));
}
// tabela leve de seções de tarifa (Nome da Seção · Tipo · Tarifa) — formato do relatório
// oficial "seções que possuem seção em <localidade>"
function secoesLocalidadeTable(secoes){
  const cols = [{t:'Nome da Seção'},{t:'Tipo',w:'160px'},{t:'Tarifa',w:'90px'}];
  const body = [...secoes].sort((a,b)=>(a.secao||0)-(b.secao||0)).map(s=>
    `<tr><td class="td-logr">${esc(orDash(s.nome_ligacao))}</td><td class="td-tipo">${esc(orDash(s.tipo_ligacao))}</td><td class="td-sentido">R$ ${esc(fmtMoney(s.tarifa))}</td></tr>`).join('');
  return tableHTML(cols, body, secoes.length+' seção(ões)');
}
// render do "Linhas por Localidade": bloco principal = linhas COM seção na localidade,
// agrupadas por empresa e com as seções por linha (reproduz o relatório antigo); bloco
// secundário = demais linhas da cobertura ampla (entram por itinerário/nome), como lista.
function renderLocalidadeSecoes(host, base, secByLine, { prefixHTML='' } = {}){
  const comSecao = base.filter(r=>secByLine.has(r.codlinha));
  const semSecao = base.filter(r=>!secByLine.has(r.codlinha));
  let html = prefixHTML;
  if(comSecao.length){
    const groups = [...groupBy(comSecao, r=>r.codempresa||'—')].sort((x,y)=>rjOrder(x[0],y[0]));
    html += groups.map(([cod,rs])=>{
      const linhas = [...rs].sort(byCodlinha).map(r=>{
        const chips = [boolChip(r.cancelado,'canc.'), boolChip(r.paralisado,'paral.')].filter(Boolean).join(' ');
        return `<div class="loc-linha-sec">
          <div class="loc-linha-head clickable" tabindex="0" role="button" data-row='${esc(JSON.stringify(r))}'><span class="mono">${esc(fmtCode(r.codlinha))}</span> <span>${fmtLineName(r.nome_ligacao)}</span> ${chips}</div>
          ${secoesLocalidadeTable(secByLine.get(r.codlinha)||[])}</div>`;
      }).join('');
      return `<h3 class="loc-emp-head">${esc(empNome(cod))} <span class="loc-emp-rj">RJ-${esc(cod||'—')} · ${rs.length} linha(s)</span></h3>${linhas}`;
    }).join('');
  }
  if(semSecao.length){
    html += `<h3 class="loc-emp-head mt22">Outras linhas <span class="loc-emp-rj">por itinerário ou nome · ${semSecao.length} linha(s)</span></h3>`
      + `<div class="doc-obs tight">Ligam os pontos buscados, mas não têm uma seção de tarifa com esse nome.</div>`
      + linhasTable(semSecao);
  }
  host.innerHTML = html || emptyBox('Nenhuma linha encontrada.');
  bindLineRows(host);
}
// tabela de empresas p/ escolher (código/nome/situação) — `extraChips(e)` acrescenta chips à situação
function empresaChooserHTML(emps, { prompt, sitWidth = '150px', extraChips } = {}){
  const body = emps.map(e=>`<tr class="clickable" tabindex="0" role="button" data-emp="${esc(e.codempresa)}" data-nome="${esc(e.nome_empresa||'')}">
    <td class="td-num">${esc(e.codempresa)}</td><td class="td-logr">${esc(e.nome_empresa||'—')}</td><td class="td-tipo">${esc(orDash(e.situacao))}${extraChips? ' '+extraChips(e):''}</td></tr>`).join('');
  return `<p class="doc-note">${emps.length} empresa(s) encontradas — ${prompt}:</p>`
    + tableHTML([{t:'Código',w:'90px'},{t:'Empresa'},{t:'Situação',w:sitWidth}], body, emps.length+' empresa(s)');
}
function bindEmpresaRows(host, fn){
  host.querySelectorAll('tr[data-emp]').forEach(tr=>tr.addEventListener('click',()=>fn(tr.dataset.emp, tr.dataset.nome)));
}
// painel com input de busca dentro do modal; o run() é re-executável (realtime)
function searchPanel({ title, placeholder, value='', selectOpts, onRun, auto=false, note, suggest }){
  const selHTML = selectOpts? `<select id="spSel" aria-label="Filtro">${selectOpts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`:'';
  // `suggest(termo)` (opcional) devolve nomes candidatos p/ autocomplete; dropdown próprio
  // (classe sp-*, não results-drop/.selector — evita a armadilha do CSS ".selector > button").
  const dropHTML = suggest? `<div class="sp-drop" id="spDrop" role="listbox"></div>` : '';
  setBody(`<div class="doc">${docHead(title)}
    ${note?`<div class="doc-obs tight"><b>Nota:</b> ${esc(note)}</div>`:''}
    <div class="doc-search"><div class="sp-field"><input id="spInput" type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(placeholder)}" autocomplete="off"${suggest?' role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="spDrop"':''}>${dropHTML}</div>${selHTML}<button id="spBtn">Buscar</button></div>
    <div id="spHost"></div></div>`);
  const input=modalBody.querySelector('#spInput'), btn=modalBody.querySelector('#spBtn'), host=modalBody.querySelector('#spHost'), sel=modalBody.querySelector('#spSel');
  const run = async()=>{ closeSug(); host.innerHTML=loading(); try{ await onRun(input.value.trim(), host, sel?sel.value:undefined); }catch(e){ host.innerHTML=errorBox(e.message);} };
  let closeSug = ()=>{};
  if(suggest){
    const drop = modalBody.querySelector('#spDrop');
    closeSug = ()=>{ drop.classList.remove('open'); drop.innerHTML=''; input.setAttribute('aria-expanded','false'); };
    // fixed (não absolute) escapa do overflow:hidden do .modal — precisa recalcular a
    // posição (viewport) a cada abertura, não só uma vez.
    const posSug = ()=>{
      const r = input.getBoundingClientRect();
      drop.style.left = r.left+'px'; drop.style.width = r.width+'px'; drop.style.top = (r.bottom+6)+'px';
    };
    const paintSug = debounce(()=>{
      const q = input.value.trim();
      const items = q? suggest(q).slice(0,8) : [];
      if(!items.length){ closeSug(); return; }
      drop.innerHTML = items.map(s=>`<button type="button" role="option">${esc(s)}</button>`).join('');
      posSug();
      drop.classList.add('open'); input.setAttribute('aria-expanded','true');
    });
    input.addEventListener('input', paintSug);
    input.addEventListener('keydown', e=>{ if(e.key==='Escape') closeSug(); });
    // mousedown (antes do blur do input) para o clique registrar antes do dropdown sumir
    drop.addEventListener('mousedown', e=>{
      const b = e.target.closest('button'); if(!b) return;
      e.preventDefault(); input.value = b.textContent; closeSug(); run();
    });
    input.addEventListener('blur', ()=> setTimeout(closeSug, 120));
  }
  btn.addEventListener('click', run);
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') run(); });
  if(sel) sel.addEventListener('change', run);
  // guarda o "run" para o realtime re-executar mantendo o termo digitado
  if(currentView) currentView._panelRun = run;
  if(auto || value) run();
}

/* ================================================================
   CLIQUE NOS CARDS  → abre a view
   ================================================================ */
// tabelas que cada view consome (para o realtime saber quando recarregar).
// REGRA: listar TODAS as tabelas que o loader lê — inclusive as lidas por baixo via lookups
// (getEmpresas→codempresa_teste, getIbge→municipio_teste, getOrigem→origem_teste,
// getEvLookups→evento_empresa_teste/evento_linha_teste, getLocalidades→localidades_teste).
// Se uma tabela lida não estiver aqui, mudanças nela NÃO recarregam a tela aberta (bug de
// atualização ao vivo). Toda tabela citada aqui também precisa estar em RT_TABLES (assinada) e
// na publicação supabase_realtime do banco. O teste tests/realtime.test.js guarda essa regra.
const VIEW_TABLES = {
  folhaRosto:['tabela_vista_teste','codempresa_teste','tarifa_atual_teste'], folhaDivisoria:['tabela_vista_teste','codempresa_teste'],
  historicoLinha:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste','tabela_vista_teste'], itinerarios:['itinerario_teste','municipio_teste','codempresa_teste'],
  quadroHorarios:['qh_intervalo_teste','qh_predeterminado_teste','qh_teste','tarifa_atual_teste','origem_teste','codempresa_teste','tabela_vista_teste'], tarifas:['tarifa_atual_teste','codempresa_teste'],
  frota:['qh_teste','codempresa_teste'], estrutura:['tabela_vista_teste','tarifa_atual_teste','itinerario_teste','qh_intervalo_teste','qh_predeterminado_teste','qh_teste','origem_teste','municipio_teste','codempresa_teste'],
  empresasRegulares:['tabela_vista_teste','codempresa_teste'], historicoEmpresa:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste'],
  ligacoesPorEmpresa:['tabela_vista_teste','codempresa_teste'], secoesPorEmpresa:['tarifa_atual_teste'],
  ligacoesPorNome:['tabela_vista_teste','codempresa_teste'], ligacoesPorNumero:['tabela_vista_teste','codempresa_teste'],
  ligacoesPorLogradouro:['itinerario_teste','tabela_vista_teste','codempresa_teste','municipio_teste'], municipioRegiao:['municipio_teste','itinerario_teste','tabela_vista_teste','codempresa_teste'],
  ligacoesPorTerminal:['qh_intervalo_teste','qh_predeterminado_teste','origem_teste','tabela_vista_teste','codempresa_teste','municipio_teste','itinerario_teste'],
  secoesPorLigacao:['tarifa_atual_teste'], relatoriosGerenciais:['tabela_vista_teste','codempresa_teste'],
  frotaPorEmpresa:['qh_teste','codempresa_teste'],
  pesquisaEvento:['evento_teste','codempresa_teste'], portarias:['portaria_teste'],
  localidades:['tabela_vista_teste','tarifa_atual_teste','itinerario_teste','municipio_teste','localidades_teste','codempresa_teste'],
};

// Caminho único para abrir uma view de card — usado pelo clique do card, pelos resultados
// de "consulta" da busca do topo e pelo roteamento por hash (deep link / botão Voltar).
function openView(view){
  const meta = VIEW_META[view];
  if (!meta) return false;
  const loader = LOADERS[view];
  if (!loader){ toast(`${meta.title} — disponível em breve`, 'info'); return false; }
  if (meta.needsLine && !activeLine){ toast('Selecione uma linha primeiro.', 'warn'); return false; }
  runView({ key:view, title:meta.title, tables: VIEW_TABLES[view]||[], lineFilter: meta.needsLine, loader });
  return true;
}
// Clique-do-meio no card / ícone "abrir em nova aba" revelado no hover (#53): SEMPRE abre uma
// aba nova pra aquele documento (nunca substitui a ativa) — mesmo com o modal ainda fechado
// (tabs[0] segue intacta como "Nova aba" ao lado). "Quando fizer sentido" no critério de aceite
// qualifica só o PRÉ-PREENCHIMENTO da linha, não a criação da aba — abrir aba nova aqui não é
// condicional. Reaproveita as mesmas checagens de meta/loader/needsLine do openView (view
// inexistente, ainda não implementada, falta linha selecionada) em vez de duplicá-las: nesses
// casos de erro nada abre de qualquer forma (ambos só mostram o mesmo toast), então delegar pro
// openView não muda o resultado observável. A linha ativa da aba de origem vira a pré-seleção da
// aba nova (mesmo padrão que os cards já usam hoje via `activeLine`); o teto de MAX_TABS é
// aplicado por addTab(), com o mesmo toast do "+".
function openViewInNewTab(view){
  const meta = VIEW_META[view];
  if (!meta) return false;
  if (!LOADERS[view] || (meta.needsLine && !activeLine)) return openView(view);
  const newTab = addTab();
  if (!newTab) return false;
  newTab.line = activeLine;
  activateTab(newTab.id);
  runView({ key:view, title:meta.title, tables: VIEW_TABLES[view]||[], lineFilter: meta.needsLine, loader: LOADERS[view] });
  return true;
}
app.addEventListener('click', e => {
  if (e.target.closest('.side-search-btn')){ toggleSearchCard(); return; }
  const topicBtn = e.target.closest('.topic-btn');
  if (topicBtn){
    const key = topicBtn.dataset.topic;
    // clique no tópico é o ÚNICO jeito de abrir/fechar a sub-lista (nunca abre sozinha)
    expandedTopicKey = (expandedTopicKey === key) ? null : key;
    if (currentTopicKey === key){
      // clicar em "Documentos da Linha" enquanto a busca está aberta em cima dele fecha a
      // busca e volta pro grid — senão o clique parecia não fazer nada (a sub-lista abria/
      // fechava, mas "Buscar Linha" continuava com o destaque em vez do tópico clicado).
      if (key === 'doc' && searchOpen){ searchOpen = false; renderSideContent('doc'); }
      renderSideNav(currentTopicKey);
    } else {
      selectTopic(key);
    }
    return;
  }
  // sub-título da sidebar = mesmo alvo do card correspondente no painel de conteúdo
  const subBtn = e.target.closest('.sub-list button');
  if (subBtn){ openView(subBtn.dataset.view); return; }
  const newTabBtn = e.target.closest('.card-newtab[data-newtab-view]');
  if (newTabBtn){ openViewInNewTab(newTabBtn.dataset.newtabView); return; }
  const card = e.target.closest('.card[data-view]');
  if (card) openView(card.dataset.view);
});
// clique-do-meio num card = mesmo destino do ícone "abrir em nova aba" (openViewInNewTab).
// `auxclick` é o evento certo pra botões não-primários (o `click` normal só dispara pro
// botão esquerdo); o `mousedown` some com o autoscroll que o botão do meio abriria por padrão.
app.addEventListener('mousedown', e => {
  if (e.button === 1 && e.target.closest('.card[data-view]')) e.preventDefault();
});
app.addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const card = e.target.closest('.card[data-view]');
  if (card){ e.preventDefault(); openViewInNewTab(card.dataset.view); }
});

/* ================================================================
   UTILITÁRIOS
   ================================================================ */
function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }




/* ================================================================
   TOAST
   ================================================================ */
function toast(msg, type = 'info') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', 'status');       // leitores de tela anunciam o aviso (aria-live polite)
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ================================================================
   REALTIME — atualiza o que está na tela quando o Supabase muda
   ================================================================ */
const RT_TABLES = ['tabela_vista_teste','itinerario_teste','qh_teste','qh_intervalo_teste',
  'qh_predeterminado_teste','tarifa_atual_teste','municipio_teste','origem_teste',
  'localidades_teste','evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste',
  'portaria_teste'];
const rtDot = document.getElementById('rtDot');
let reloadTimer = null;

// tabela → como invalidar o cache derivado dela (ver STATE + CACHES). Declarativo em vez de
// cadeia de if: deixa o conjunto de caches invalidáveis visível num lugar só. Ao criar um cache
// novo derivado de uma tabela do Realtime, adicione a entrada aqui.
const CACHE_INVALIDATORS = {
  municipio_teste:      () => { ibgeMap = null; },
  origem_teste:         () => { origemMap = null; },
  itinerario_teste:     () => { terminalRows = null; },
  evento_empresa_teste: () => { evLookups.emp = null; },
  evento_linha_teste:   () => { evLookups.lin = null; },
  codempresa_teste:     () => { empresas.map = null; empresas.list = null; getEmpresas().catch(()=>{}); },
  portaria_teste:       () => { _portariaAnos = null; },
  localidades_teste:    () => { _localidadesList = null; },
};
function invalidateCaches(table){
  const fn = CACHE_INVALIDATORS[table];
  if (fn) fn();
}
function scheduleReload(tab){
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(()=>reloadTab(tab), 350);
}
// recarrega UMA aba (a ativa). Se o usuário trocou de aba durante o debounce, a aba dona do
// evento já não está na tela → vira desatualizada em vez de recarregar em segundo plano
// (mesma regra do dispatch: só a aba visível gasta requisição de rede).
async function reloadTab(tab){
  if(!tab || !tab.view) return;
  if(tab !== activeTab()){ markStale([tab.id]); return; }
  const view = tab.view, eraStale = tab.stale;
  // aba REATIVADA (estava desatualizada): o dado velho não fica na tela enquanto a rede responde —
  // o pane vai pro estado de carregamento, como em qualquer abertura de documento (runView).
  // Recarregamento ao vivo da aba que já está na tela continua sem piscar (mantém o conteúdo até
  // o novo chegar), igual ao comportamento de sempre.
  if(eraStale){ tab.stale = false; renderTabs(); if(tab.paneEl) tab.paneEl.innerHTML = loading('Atualizando…'); }
  try {
    await refreshActiveLine();                        // banner ao vivo (activeLine é snapshot)
    // reconfere DEPOIS do await: os loaders capturam `currentView` no começo (seam beginGen/
    // commitViewResult), então rodar o loader agora mexeria na aba que estiver ativa AGORA —
    // não na dona do evento. Trocou de documento na mesma aba → o runView novo já trouxe dado
    // fresco, nada a fazer; trocou de aba → ela volta a ser só "desatualizada".
    if(tab.view !== view) return;
    if(tab !== activeTab()){ markStale([tab.id]); return; }
    if(view._panelRun) await view._panelRun();        // painéis de busca
    else await view.loader();                         // views diretas
    mtLive.classList.remove('on'); void mtLive.offsetWidth; mtLive.classList.add('on');
    toast('Atualizado ao vivo', 'live');
  } catch(e){
    // falhou: a aba VOLTA a ser desatualizada (o indicador não pode sumir por um recarregamento
    // que não aconteceu) — reativá-la de novo tenta outra vez.
    if(eraStale){ if(tab.paneEl) tab.paneEl.innerHTML = errorBox(e.message); markStale([tab.id]); }
  }
}
// marca abas em segundo plano como desatualizadas (sem fetch, sem re-render do documento) —
// só a faixa de abas é repintada, pra mostrar o indicador.
function markStale(ids){
  let mudou = false;
  ids.forEach(id => { const t = tabs.find(x => x.id === id); if (t && !t.stale){ t.stale = true; mudou = true; } });
  if (mudou) renderTabs();
}
// a aba `tab` se importa com este evento? (view dela lê a tabela alterada E, se o documento
// depende de linha, a mudança é da linha DAQUELA aba — cada aba tem a sua). Generalização do
// antigo rowMatchesActiveLine, que perguntava isso do par global currentView/activeLine.

// dispatch por aba: quem recarrega AGORA (só a ativa, ao vivo como sempre) e quem só fica
// marcada como desatualizada (as de segundo plano — recarregam ao serem reativadas).

function onRealtime(table, payload){
  invalidateCaches(table);
  const { reload, stale } = dispatchRealtime(tabs, activeTabId, table, payload);
  if (stale.length) markStale(stale);
  if (reload !== null) scheduleReload(activeTab());
}
function initRealtime(){
  try {
    const sbClient = supabase.createClient(SB.url, SB.key, { realtime:{ params:{ eventsPerSecond:5 } } });
    const channel = sbClient.channel('divat-rt');
    RT_TABLES.forEach(t => channel.on('postgres_changes', { event:'*', schema:'public', table:t }, p => onRealtime(t, p)));
    channel.subscribe(status => {
      rtDot.classList.toggle('live', status==='SUBSCRIBED');
      if (status==='CHANNEL_ERROR' || status==='TIMED_OUT') console.warn('Realtime status:', status);
    });
  } catch(e){
    console.warn('Realtime indisponível:', e);
    // supabase-js (vendorado) indisponível → a consulta via REST segue funcionando, mas sem atualização ao vivo
    if (typeof toast === 'function') toast('Atualização ao vivo indisponível no momento', 'warn');
  }
}
// O supabase-js (~100 KB, usado SÓ pelo Realtime) é injetado dinamicamente — script dinâmico
// é async por padrão, então não atrasa a primeira pintura (a CSP script-src 'self' permite:
// mesmo origin, arquivo vendorado). Ao atualizar a versão vendorada, troque o src aqui.
{
  const s = document.createElement('script');
  s.src = 'vendor/supabase-js-2.110.7.min.js';
  s.onload = initRealtime;
  s.onerror = () => { console.warn('Falha ao carregar o supabase-js vendorado'); toast('Atualização ao vivo indisponível no momento', 'warn'); };
  document.head.appendChild(s);
}

// pré-carrega o cadastro de empresas (nome ↔ RJ) p/ os renderizadores síncronos (banner, listas)
getEmpresas().catch(()=>{});

/* ================================================================
   AUTO-ATUALIZAÇÃO — detecta novo deploy e recarrega sozinho,
   sem ninguém precisar limpar cache. Compara os ETags do index.html,
   dos módulos compartilhados, do app.js E do styles.css (deploy que muda só um deles também
   precisa recarregar todo mundo).
   ================================================================ */
let _verTag = null;
async function checarNovaVersao(){
  try {
    const heads = await Promise.all(['/index.html', '/shared/environment.js', '/shared/domain.js', '/shared/view-state.js', '/app.js', '/styles.css'].map(p =>
      fetch(p + '?_=' + Date.now(), { method: 'HEAD', cache: 'no-store' })));
    const tags = heads.map(r => r.headers.get('etag') || r.headers.get('last-modified'));
    if (tags.some(t => !t)) return;    // sem como comparar → não faz nada
    const tag = tags.join('|');
    if (_verTag === null) { _verTag = tag; return; }   // 1ª medição = referência
    if (tag !== _verTag) {             // mudou no servidor → versão nova publicada
      _verTag = tag;
      if (overlay.classList.contains('open')) {
        window.__divatReload = true;   // não interrompe quem está consultando
        toast('Nova versão disponível — atualiza ao fechar', 'info');
      } else {
        location.reload();
      }
    }
  } catch(_) { /* offline/erro → tenta de novo no próximo ciclo */ }
}
setInterval(checarNovaVersao, 3 * 60 * 1000);                     // a cada 3 min
window.addEventListener('focus', checarNovaVersao);              // ao voltar pra aba
document.addEventListener('visibilitychange', () => { if (!document.hidden) checarNovaVersao(); });
checarNovaVersao();                                              // referência inicial

/* ================================================================
   ROTAS (hash) — deep link compartilhável e botão Voltar do navegador
   Formatos:
     #/linha/<codlinha>                    → seleciona a linha
     #/topico/<key>                        → tópico ativo no painel lateral (omitido quando é o padrão)
     #/consulta/<view>                     → abre o card <view> (tópico dono fica ativo no painel)
     #/linha/<codlinha>/consulta/<view>    → linha + documento
   Views de drill-down (sem `key`, ex.: "Linhas no Município") não
   entram na URL — o hash fica no último estado endereçável.
   ================================================================ */
let _applyingRoute = false;   // aplicando uma rota → runView/selectLine/selectTopic não reescrevem o hash
let _modalPushed  = false;    // a abertura do modal criou uma entrada de histórico?

// estado atual → hash. `push:true` cria entrada de histórico (só na ABERTURA do modal —
// é o que faz o Voltar do navegador fechar o modal em vez de sair do site). Trocar de tópico no
// painel lateral é só `replace` (não é mais "entrar numa tela" — o painel sempre está visível).
function syncHash({ push = false } = {}){
  if (_applyingRoute) return;
  const parts = [];
  if (activeLine) parts.push('linha/' + encodeURIComponent(activeLine.codlinha));
  if (currentTopicKey && currentTopicKey !== DEFAULT_TOPIC) parts.push('topico/' + currentTopicKey);
  if (overlay.classList.contains('open') && currentView && currentView.key) parts.push('consulta/' + currentView.key);
  const target = parts.length ? '#/' + parts.join('/') : location.pathname + location.search;
  const alvoHash = parts.length ? target : '';
  if ((location.hash || '') === alvoHash) return;
  try {
    if (push){ history.pushState(null, '', target); _modalPushed = true; }
    else history.replaceState(null, '', target);
  } catch(_){ /* file:// ou contexto sem History API → segue sem rota */ }
}

// hash → estado (idempotente: só mexe no que estiver diferente do hash)
async function applyRoute(){
  const seg = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let cod = null, view = null, topico = null;
  for (let i = 0; i < seg.length; i++){
    if (seg[i] === 'linha'    && seg[i+1]) cod    = decodeURIComponent(seg[++i]);
    else if (seg[i] === 'topico'   && seg[i+1]) topico = decodeURIComponent(seg[++i]);
    else if (seg[i] === 'consulta' && seg[i+1]) view   = decodeURIComponent(seg[++i]);
  }
  _applyingRoute = true;
  try {
    if (cod && (!activeLine || String(activeLine.codlinha) !== String(cod))){
      try {
        const rows = await sbFetch('tabela_vista_teste', `codlinha=eq.${enc(cod)}&select=${LINE_FIELDS}&limit=1`);
        if (rows[0]) selectLine(rows[0]);
      } catch(_){ /* linha inacessível → segue sem selecionar */ }
    }
    if (!cod && activeLine){ setActiveLine(null); banner.classList.add('is-hidden'); updateNeedChips(); }
    // tópico ativo no painel: dono do view (se houver), senão o segmento topico/, senão o padrão
    const topicoAlvo = (view && VIEW_TOPIC[view]) || topico || DEFAULT_TOPIC;
    if (currentTopicKey !== topicoAlvo) selectTopic(topicoAlvo);
    if (view && VIEW_META[view]){
      if (!(overlay.classList.contains('open') && currentView && currentView.key === view)) openView(view);
    } else if (!view && overlay.classList.contains('open')){
      closeModal();
    }
  } finally { _applyingRoute = false; }
}
window.addEventListener('hashchange', () => { applyRoute(); });

/* ---- boot ---- */
applyRoute();          // 1ª renderização do painel (tópico padrão ou o do hash) + deep link de entrada
})();
