import {
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash,
  fmtLineName, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, debounce,
} from './src/domain/core.mjs';
// `scoreEmpresa` não entra aqui de propósito: só o dedupEmpresasPorRJ a usa, e ele mora no módulo.
import {
  groupBy, countBy, fmtMoney, byCodlinha, rjOrder,
  dedupEmpresasPorRJ, classifyMunLines, terminaisDoMunicipio,
  resumoFrota, filtrarFrotaEmpresas,
} from './src/domain/agrupamento.mjs';
// `termosLocalidade` NÃO vem daqui: é async (`await getLocalidades()`), então é I/O e ficou no
// app.js — ela consome o `localidadesQueCasam` importado abaixo.
// `yearOf` e `matchEvent` NÃO entram: quem os usa é o `paginateEvents` de src/ui/paginacao.mjs,
// que os importa por conta própria desde a Fase B2 — aqui seriam binding morto, o mesmo motivo
// pelo qual `beginGen` ficou de fora acima. (O `matchEvent` FICOU nesta lista por engano na B2 e
// só foi removido na Fase C1; os dois seguem exportados porque os testes os exercitam.)
import {
  localidadesQueCasam, orIlike, municipiosExatos,
} from './src/domain/busca.mjs';
// Estado do que está na tela — o seam do ciclo de vida da view, o modelo de abas, o despacho do
// Realtime por aba e o que cada lista mostra. A camada de UI (renderTabs/activateTab/markStale/
// scheduleReload) fica no app.js: o módulo decide, o app.js aplica.
// `beginGen` NÃO entra: desde a Fase A ninguém no app.js cunha geração à mão — quem chama o
// beginGen é o `makeCtx`/`nextGen` do próprio módulo, e importá-lo aqui seria binding morto (e
// um convite a recriar o `const view = currentView, gen = beginGen(view)` que a fase eliminou).
import {
  isCurrentGen, commitViewResult, pushDetail, popDetail,
  makeCtx, withLine, withHost, nextGen,
  MAX_TABS, makeTab, openTabState, closeTabState,
  dispatchRealtime, filtrarSituacao,
} from './src/domain/view-state.mjs';
// `pageBounds` também não entra, pelo mesmo motivo: quem o usa é o `paginate` de
// src/ui/paginacao.mjs. Ficou nesta lista por engano na B2 e saiu na C1.
// Markup de documento (cabeçalho, meta, tabela, estados de tela) — string de HTML, sem DOM nem
// estado. O SVG do logo chega por `configurarDoc` no bootstrap logo abaixo.
import {
  configurarDoc, docHead, metaRows, colClass, tableHTML,
  loading, emptyBox, emptyLinha, errorBox, bannerTrunc,
} from './src/ui/doc.mjs';
// Caches de referência (municípios, origens, terminais, cadastro de empresas, tipos de evento).
// Os lookups importam diretamente a fronteira REST única.
// `preencherLookup` NÃO entra: quem o usa é o próprio módulo (e o tests/harness.js, que o
// importa direto). Terceiro binding morto herdado da B2, removido na C1 junto com os outros dois.
// `getEvLookups` NÃO entra mais: quem o usava (`renderEmpresaHistory`) saiu na Fase C3.
import {
  getIbge, getOrigem, getTerminais,
  getEmpresas, empNome, empresasMap, empresasList, empresaPorCod,
  INVALIDADORES_LOOKUP,
} from './src/data/lookups.mjs';
// Paginação de tela — o núcleo agnóstico de conteúdo. Só de TELA: dados e PDF saem inteiros.
// `paginateEvents` NÃO entra mais: quem o usava (`renderEmpresaHistory`) saiu na Fase C3 — quem
// precisa dele agora é o próprio `src/documentos/quadro-empresas.mjs`.
import { paginate, paginateTable } from './src/ui/paginacao.mjs';
// A família de listas de LINHA. A ação de clicar numa linha (selecionar + fechar o modal + toast)
// é de shell e chega por `configurarListas` no bootstrap logo abaixo.
import {
  configurarListas, situacaoSelectHTML, linhasTable, bindLineRows, paginateLines, lineResults,
} from './src/ui/listas.mjs';
// As listas de colunas do `select=`. São dado, não estado; saíram na Fase C1 junto com o
// primeiro documento, para não existirem em duas cópias (a do módulo e a daqui). Só `LINE_FIELDS`
// segue lida diretamente pelo `app.js` — as outras seis (`ITINERARIO_FIELDS`, `QH_*`,
// `TARIFA_LINHA_FIELDS`, `FROTA_FIELDS`, `EVENTO_FIELDS`) ficaram sem nenhum call site aqui desde
// que a Fase C3 moveu o Quadro de Horários e o Histórico da Empresa — binding morto removido
// junto (as duas primeiras já estavam mortas desde a C1/C2, e escaparam por engano).
import { LINE_FIELDS } from './src/data/campos.mjs';
import { configurarRest, selecionarSupabase, sbFetch, ehCancelamento } from './src/data/rest.mjs';
// FASE C1 — a primeira família de documentos a sair inteira do arquivo. O que fica aqui embaixo
// são os registros `LOADERS.*`, que são shell (wrappers de busca de linha) e saem nas Fases D/E.
// `configurarDocumentos` injeta apenas as duas ações de shell compartilhadas; a rede vem da
// fronteira REST importada diretamente por cada família.
import { configurarDocumentos } from './src/documentos/shell.mjs';
import {
  renderLineHistory, renderItinerarios, renderFrota,
} from './src/documentos/frota-historico-itinerarios.mjs';
// FASE C2 — Estrutura Operacional · Tarifas · Portaria. `LOADERS.estrutura` (one-liner) e
// `LOADERS.tarifas` (tem corpo — a composição do `searchPanel`, que é trabalho de Fase D) ainda
// ficam aqui embaixo; `LOADERS.portarias` virou o one-liner `renderPortarias`.
import {
  renderTarifas, tarifaEmpresaRun, renderEstrutura, renderPortarias, invalidarPortariaAnos,
} from './src/documentos/estrutura-tarifas-portaria.mjs';
// FASE C3 — Quadro de Horários · Empresas, a terceira família a sair inteira. `renderLinhaQuadro`
// (modo "por linha") e `quadroEmpresaRun` (modo "por empresa") alimentam `LOADERS.quadroHorarios`,
// que FICA (tem corpo — mesma razão de `LOADERS.tarifas`). `ligacoesPorEmpresaRun`/
// `secoesPorEmpresaRun`/`historicoEmpresaRun` alimentam os três `LOADERS.*` de Empresas, que
// viraram wrappers finos — mesmo padrão que a C2 usou para `tarifaEmpresaRun`.
import {
  renderLinhaQuadro, quadroEmpresaRun,
  ligacoesPorEmpresaRun, secoesPorEmpresaRun, historicoEmpresaRun,
} from './src/documentos/quadro-empresas.mjs';

/* ================================================================
   ÍNDICE DO ARQUIVO  —  navegue por `grep` da marca da seção.
   ----------------------------------------------------------------
   SUPABASE CONFIG · ÍCONES · SEÇÕES/CARDS · RENDER CARDS ·
   STATE + CACHES · BUSCA DE LINHAS · LINHA ATIVA — BANNER ·
   MODAL / SISTEMA DE VIEWS (maior bloco — tem sub-índice próprio) ·
   COMPONENTES AUXILIARES · CLIQUE NOS CARDS ·
   TOAST · REALTIME · AUTO-ATUALIZAÇÃO · ROTAS (hash)
   ----------------------------------------------------------------
   O arquivo inteiro roda dentro de um IIFE: nenhuma função/estado
   vaza para window (o vendor supabase-js continua global, é lido
   aqui dentro normalmente). Logo depois do `(() => {` vem o
   BOOTSTRAP DOS MÓDULOS (grep `Bootstrap dos módulos`), que injeta
   nos módulos de src/ui e src/data o que só existe aqui: o SVG do
   logo, a função de rede e a ação de selecionar uma linha.
   ================================================================ */
(() => {
/* --- Bootstrap dos módulos (src/ui, src/data) ---------------------
   Um lugar só para LIGAR os módulos ao que só o app.js tem: um nó do DOM, uma função que fala
   com a rede, uma ação de shell. O que os módulos NÃO fazem é ir buscar essas coisas por conta
   própria — daí a injeção ser explícita e acontecer aqui, antes de qualquer render.
   Roda no topo do IIFE de propósito: `renderSideNav`/`renderSideContent` pintam no load, e
   configurar depois deles deixaria uma janela em que um helper já pode ser chamado sem estar
   ligado. As funções passadas abaixo são todas `function` (hoisted), então referenciá-las aqui
   é seguro mesmo estando declaradas mais adiante — ver docs/estrutura-frontend.md §3. */
configurarDoc({ logoSVG: document.getElementById('brandLogo').innerHTML });
/* O seam de seleção: clicar numa linha de qualquer lista SELECIONA a linha, fecha o modal e
   avisa. É composição de shell (rota + modal + toast), não markup, e por isso não desce para o
   módulo — desce a AÇÃO, uma vez. `selectLine`/`closeModal`/`toast` são `function` (hoisted).
   O `activeLine` lido no toast é o de DEPOIS do `selectLine`, de propósito: é a linha que
   acabou de ser escolhida, com o formato já normalizado pelo `setActiveLine`. */
configurarListas({ aoSelecionarLinha: row => {
  selectLine(row); closeModal();
  toast('Linha selecionada: '+(activeLine.nome_ligacao||activeLine.codlinha),'info');
}});
/* Os documentos de `src/documentos/` (Fase C). Duas coisas, e só duas: a função de rede e a ação
   de tornar uma linha a ativa. `renderLineHistory` chama a segunda para sincronizar o banner do
   topo com a linha cujo histórico está na tela — é shell, como o `aoSelecionarLinha` acima, e por
   isso desce injetada em vez de o módulo ir buscá-la. O `sbFetch` aqui é ANDAIME: some quando a
   Fase B criar `src/data/rest.mjs` e os documentos passarem a importá-lo. */
// `novoCtx` chega por FECHO (não por referência direta): é `const`, declarada mais abaixo no
// arquivo, e passá-la aqui por valor bateria em TDZ — o bootstrap roda no TOPO do IIFE, antes da
// declaração existir. O fecho só a lê quando de fato CHAMADO, muito depois de o arquivo inteiro
// já ter sido avaliado (nenhum documento abre no load).
configurarDocumentos({ selecionarLinha: selectLine, novoCtx: (view, pane, host) => novoCtx(view, pane, host) });

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
   lança erro; preview jamais pode usar produção como fallback.

   HOSTS_PROD precisa listar TODOS os domínios que o projeto Vercel `divatdetro` serve como
   produção — hoje três: o canônico, o alias do time e o alias da branch `main`. Até 29/07/2026
   só o canônico estava aqui, e os outros dois serviam conteúdo de produção lendo o banco de
   TESTE. O sintoma desse esquecimento é o pior possível: dado errado na tela, sem erro nenhum,
   porque o banco de teste é uma cópia e a página parece perfeitamente normal. **Ao adicionar
   domínio no painel da Vercel, adicione aqui também**, na mesma tarefa. */
const HOSTS_PROD   = ['divatdetro.vercel.app',
                      'divatdetro-lucas-molinari-s-projects.vercel.app',
                      'divatdetro-git-main-lucas-molinari-s-projects.vercel.app'];
const SB_TESTE_URL = 'https://gontnlfmothfglssbyyk.supabase.co';
const SB_TESTE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvbnRubGZtb3RoZmdsc3NieXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTU0OTAsImV4cCI6MjEwMDgzMTQ5MH0.NMEaXXeWxI6A50KuA1euHpSH3Mi53CXU71N16zrjhH4';

const SB = selecionarSupabase(location.hostname, {
  hostsProd: HOSTS_PROD,
  prodUrl: SB_URL,
  prodKey: SB_KEY,
  testeUrl: SB_TESTE_URL,
  testeKey: SB_TESTE_KEY
});
configurarRest({ url: SB.url, key: SB.key, fetch: window.fetch.bind(window) });

// O BANNER que avisa o usuário sobre essa truncagem é markup, não infraestrutura: mora em
// `src/ui/doc.mjs` (`bannerTrunc`). O contrato entre os dois são os campos não-enumeráveis
// `_trunc`/`_limite` marcados em `src/data/rest.mjs` — mexeu num lado, leia o outro.

/* --- Regras de domínio e formatação (funções puras) ---
   Daqui pra baixo, nenhuma função toca rede/DOM — só recebem dado e devolvem
   dado (string/bool/HTML-string). É a "camada de domínio": pode ser testada
   isolada (é o que os `tests/*.harness.js` fazem) e não sabe de onde o dado
   veio nem quem vai renderizá-lo. Em especial `isLinhaAtiva`/`isVigente` são
   a REGRA DE NEGÓCIO central do portal (o que conta como linha ativa/vigente)
   — mudar esse critério é editar só aqui, nunca nos `render*`. --- */
// Formatação, escaping e regras de situação de linha vivem em
// src/domain/core.mjs: uma implementação compartilhada pelo navegador e pelos testes.

/* ================================================================
   ÍCONES
   ================================================================ */
const I = {
  file:'<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  route:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  ticket:'<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 6 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-6Z"/><path d="M13 7v10"/>',
  bus:'<rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19" r="1.4"/><circle cx="16" cy="19" r="1.4"/><path d="M4 17v2M20 17v2"/>',
  structure:'<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="15" width="6" height="5" rx="1"/><rect x="15" y="15" width="6" height="5" rx="1"/><path d="M12 8v3M6 15v-2h12v2"/>',
  building:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M15 9h3a2 2 0 0 1 2 2v10"/><path d="M8 7h2M8 11h2M8 15h2M3 21h18"/>',
  link:'<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
  segments:'<path d="M3 12h4M10 12h4M17 12h4"/><circle cx="8.5" cy="12" r="1.2"/><circle cx="15.5" cy="12" r="1.2"/>',
  signpost:'<path d="M12 3v18"/><path d="M5 6h11l3 2.5L16 11H5z"/>',
  map:'<path d="m9 4 6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>',
  pin:'<path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  hub:'<circle cx="12" cy="12" r="2.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.5 6.5 8.6 8.6M15.4 15.4l2.1 2.1M17.5 6.5 15.4 8.6M8.6 15.4l-2.1 2.1"/>',
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
  { key:'doc', name:'Linhas',
    icon:'file', desc:'Itinerários, quadro de horários, tarifas, seções, frota, histórico e estrutura de cada linha regular.',
    items:[
      // Itinerários e Seções por Ligação vivem aqui (não em "Consultas"): são documentos de UMA
      // linha, como os demais deste tópico — o que "Consultas" reúne são buscas que partem de
      // logradouro/terminal/localidade/empresa para CHEGAR às linhas.
      ['route','Itinerários','Percurso por sentido: logradouros e municípios','itinerarios',false],
      ['clock','Quadro de Horários','Partidas por sentido e dia — por linha ou empresa','quadroHorarios',false],
      ['ticket','Tarifas','Seções e valores vigentes — por linha ou empresa','tarifas',false],
      ['ruler','Seções por Ligação','Seções que compõem uma linha','secoesPorLigacao',true],
      ['history','Histórico da Linha','Alterações e eventos registrados','historicoLinha',false],
      ['bus','Frota','Frota operacional e reserva por tipo de veículo','frota',false],
      ['structure','Estrutura Operacional','Consolidado: cadastro, seções, itinerário, horários e frota','estrutura',false],
    ]},
  { key:'emp', name:'Empresa',
    icon:'building', desc:'Operadoras regulares, frota consolidada, seções atendidas e histórico de eventos por empresa.',
    items:[
      ['building','Empresas Regulares','Operadoras com linhas regulares ativas','empresasRegulares',false],
      ['histEmp','Histórico da Empresa','Eventos e alterações por operadora','historicoEmpresa',false],
      ['link','Ligações por Empresa','Linhas operadas por uma empresa','ligacoesPorEmpresa',false],
      ['segments','Seções por Empresa','Seções atendidas por operadora','secoesPorEmpresa',false],
      ['fleet','Frota por Empresa','Frota consolidada por operadora e hierarquia','frotaPorEmpresa',false],
    ]},
  { key:'lig', name:'Consultas',
    icon:'hub', desc:'Busca de linhas por logradouro, terminal, localidade ou município.',
    items:[
      ['signpost','Ligações por Logradouro','Linhas que passam por uma via','ligacoesPorLogradouro',false],
      ['map','Município e Região','Linhas por origem e destino','municipioRegiao',false],
      ['pin','Linhas por Localidade e Município','Busque por seção, "via" ou cruze localidades/municípios','localidades',false],
      ['hub','Ligações por Terminais','Linhas que atendem um terminal','ligacoesPorTerminal',false],
    ]},
  { key:'ger', name:'Portarias', direct:'portarias',
    icon:'law', desc:'Portarias e legislação — busca por número, assunto ou texto.',
    items:[],
    // metadados do card único do tópico — não entra na grade (o tópico abre o modal direto),
    // mas precisa alimentar VIEW_META/VIEW_TOPIC (deep link, busca do topo) como se entrasse.
    directMeta:['law','Portarias / Legislação','Buscar portarias por número, assunto ou texto','portarias',false],
  },
];

/* ================================================================
   RENDER CARDS — painel lateral fixo (sidebar de tópicos) + conteúdo
   ================================================================ */
const app = document.getElementById('app');
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

// cor única (mesmo azul de "Linhas") pra todos os cards e pro destaque do
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
  // tópico-ação (`direct`): o card não entra na grade, mas o deep link (#/consulta/<view>) e a
  // busca do topo precisam achar VIEW_META/VIEW_TOPIC do mesmo jeito que achariam se ele
  // estivesse em `items` normalmente.
  if (sec.directMeta){
    const [ic, title, desc, view, needsLine] = sec.directMeta;
    VIEW_META[view] = { title, icon:ic, needsLine:!!needsLine };
    VIEW_TOPIC[view] = sec.key;
  }
});

const DEFAULT_TOPIC = 'doc';   // tópico mostrado ao abrir o site sem hash (o mais consultado)

// grid dos cards-folha do tópico ativo (documentos/consultas dentro dele). Cada card vem
// envolto num `.card-slot` (não-interativo) só pra hospedar o ícone "abrir em nova aba" (#53)
// como IRMÃO do `<button class="card">`, nunca filho dele — um <button> aninhado dentro de
// outro <button> é fechado implicitamente pelo parser HTML (regra do "stack de botões"),
// quebrando o layout; o `.card-slot` com position:relative é quem posiciona o ícone por cima.
function topicGridHTML(sec){
  // tópico-ação (`direct`): não tem grade própria no painel lateral (o clique no tópico abre o
  // modal direto), mas o seletor de documentos da aba ("+", `tabChooserHTML`) varre TODOS os
  // tópicos por este mesmo helper — sem isso o card do tópico-ação some de lá também.
  const items = (sec.direct && sec.directMeta) ? [sec.directMeta] : sec.items;
  return items.map(([ic, title, desc, view, needsLine]) => `
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
                              // "Linhas" (único cujos cards exigem linha selecionada)
                              // — some com valor padrão fechado; só abre por clique no card "Buscar"

function renderSideNav(activeKey){
  sideNav.innerHTML = `
    <div class="side-brand">
      <span class="side-brand-badge">${svg('<path d="M6 7.5h12M12 7.5V17"/><circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none"/>')}</span>
      <div class="side-brand-txt"><b>Coordenadoria Técnica</b><span>DETRO/RJ</span></div>
    </div>
    <div class="side-eyebrow">Consultas</div>
    <button type="button" class="side-search-btn${(activeKey==='doc'&&searchOpen)?' open':''}">
      <span class="t-ico">${svg(I.search)}</span>Buscar
    </button>` +
    SECTIONS.map(sec => `
    <button type="button" class="topic-btn${(sec.key===activeKey&&!(activeKey==='doc'&&searchOpen))?' active':''}${sec.key===expandedTopicKey?' expanded':''}" data-topic="${sec.key}">
      <span class="t-ico">${svg(I[sec.icon])}</span>${sec.name}
      ${sec.direct ? '' : `<span class="chev">${svg('<path d="m9 6 6 6-6 6"/>')}</span>`}
    </button>
    ${(sec.key===expandedTopicKey && !sec.direct) ? `<div class="sub-list">${sec.items.map(([ic,title,desc,view]) => `<button type="button" data-view="${view}">${title}</button>`).join('')}</div>` : ''}
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
// clique no card "Buscar" da sidebar: abre/fecha a barra de busca dentro do
// painel; se o tópico ativo não for "Linhas", muda pra ele já aberta.
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
  // sai de "Linhas" sem fechar a busca por outro caminho (ex.: clicar direto
  // em outro tópico) deixava `searchOpen` preso em true — ao voltar pro "doc" depois, a
  // busca reabria sozinha em vez do grid, e a sidebar mostrava "Buscar" com destaque
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

/* ---- Abas — estado de runtime das abas de documento (#51 prefactor + #52 faixa de abas) ----
   O FORMATO da aba e as transições puras (makeTab/openTabState/closeTabState/MAX_TABS) moram em
   `src/domain/view-state.mjs`; aqui fica só o estado vivo — qual aba existe agora, qual é a
   ativa — e o `paneEl`/`scrollTop` que a camada de UI (seção MODAL) cola por cima.
   `activeLine`/`currentView` (declarado mais abaixo, seção MODAL) são estado de SHELL: quem os
   lê é o banner, a rota, a faixa de abas e o `novoCtx` que monta o contexto de um documento —
   documento nenhum os lê (ver o CONTRATO no cabeçalho da seção MODAL). Eles continuam com mais
   de um escritor legítimo, e isso não muda aqui: setActiveLine e activateTab escrevem os dois,
   sempre nos pontos de abrir/selecionar/fechar aba e sempre em sincronia com `activeTab()`. */
let tabIdSeq = 1;
let tabs = [makeTab(tabIdSeq)];
let activeTabId = tabs[0].id;
function activeTab(){ return tabs.find(t => t.id === activeTabId); }
function setActiveLine(row){ activeLine = row; activeTab().line = row; }

// Os CACHES de lookup (municípios, origens, terminais, cadastro de empresas e tipos de evento)
// e os `get*` que os enchem moram em `src/data/lookups.mjs`, importados no topo. Aqui fica só o
// que depende de estado desta tela. A invalidação deles continua ligada ao Realtime, pelo
// INVALIDADORES_LOOKUP que a seção REALTIME espalha no CACHE_INVALIDATORS.
// `searchEmpresas` saiu na Fase C2 para `src/ui/empresas.mjs`, importado no topo — usado por
// mais de uma família (Tarifas, Quadro de Horários, Histórico da Empresa), o mesmo critério do
// `src/ui/blocos.mjs`.

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

/* As listas de colunas do `select=` (LINE_FIELDS, ITINERARIO_FIELDS, QH_*, TARIFA_LINHA_FIELDS,
   FROTA_FIELDS, EVENTO_FIELDS) moraram para `src/data/campos.mjs` na Fase C1 e são importadas no
   topo — inclusive o comentário que explica por que a definição é única. Elas seguem sendo lidas
   aqui (busca de linha, rota, banner, e os documentos que ainda não saíram) e lá (os que saíram);
   é o mesmo binding, não duas cópias. */

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
  const sec = SECTIONS.find(s => s.key === topic);
  // tópico-ação (`direct`): não há grade pra destacar um card dentro — abre o modal direto,
  // senão a busca levaria a um grid vazio.
  if (sec && sec.direct){ openView(view); return; }
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
  if (!empresasMap()) getEmpresas().then(() => {
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
   CONTRATO — todo `render…`/`loader` RECEBE `ctx`; nenhum lê `currentView`/`activeLine`/`modalBody`.
     ctx = { view, gen, pane, host, line }   (definido em src/domain/view-state.mjs)
   Quem MONTA um ctx é o shell, em três pontos e só neles: `runView` (abrir/trocar documento),
   `reloadTab` (recarregamento ao vivo do Realtime) e o `run` de cada painel de busca. Todos
   passam por `novoCtx(view, pane, host)`, o único lugar que ainda lê a linha ativa global.
   Quem o RECEBE é o documento — e por receber, não tem como ler o global ERRADO depois de um
   await: `ctx.pane` é o pane da aba que pediu (nó fixo), `ctx.line` é a linha daquela tentativa.
   Derivações, nunca `beginGen` à mão: `withLine(ctx, l)` (a linha que a busca resolveu, MESMA
   geração — geração nova aqui devolveria a corrida), `withHost(ctx, el)` (outro container da
   mesma tentativa) e `nextGen(ctx)` (o usuário disparou de novo dentro do documento aberto).
   Escrita em pdfHTML/_detail — NÃO atribua `currentView.pdfHTML` direto. Ao terminar:
   `commitViewResult(view, gen, { pdfHTML: fn ou null })`, com o `view`/`gen` que vieram no ctx.
   `gen` descarta em silêncio uma escrita de uma busca/troca de linha anterior que resolveu
   depois de uma mais nova (ex.: digitar "101" e trocar pra "202" antes da 1ª resposta voltar).
   Helpers que escrevem pdfHTML DEPOIS do await de quem os chama (paginateTable, paginateLines,
   lineResults) recebem `view` E `gen` como opções em vez de capturar os próprios — capturar ali
   seria tarde demais pro guard fazer sentido. A pintura em TELA usa o MESMO guard: paginate()
   (núcleo de paginateTable/paginateLines) e paginateEvents() só escrevem container.innerHTML
   se isCurrentGen(view, gen) — por isso todo call site passa view+gen, mesmo quem usa pdf:false
   (o guard da tela independe de escrever PDF). `_panelRun` fica FORA do seam de propósito: é a
   referência ao `run` do painel, atribuída uma vez — não é resultado de operação assíncrona, não
   há corrida a proteger; o que ele PRECISA é do ctx do painel, e por isso o `run` monta um novo
   a cada chamada. Painéis com lista+detalhe (hoje só Portarias) usam pushDetail(view, patch)/
   popDetail(view) em vez de commitViewResult, pra não perder o pdfHTML/busca da lista quando um
   item é aberto. Detalhes do design: beginGen/commitViewResult/pushDetail/popDetail/makeCtx e
   as derivações, em src/domain/view-state.mjs.
   ----------------------------------------------------------------
   SUB-ÍNDICE (grep `--- ` para pular). Na ordem atual do arquivo:
     Chrome do modal · Faixa de abas · Dispatcher — runView ·
     Busca de linha — wrappers de documento ·
     DOC · Histórico (linha) · DOC · Itinerários ·
     DOC · Quadro de Horários · DOC · Tarifas · DOC · Frota ·
     DOC · Estrutura Operacional · DOC · Empresas ·
     DOC · Municípios / entre-municípios · DOC · Portaria · DOC · Localidades
   Sob três dessas marcas sobrou só o registro `LOADERS.*`: Histórico (linha), Itinerários e
   Frota são a família C1, e os renders delas moraram para
   `src/documentos/frota-historico-itinerarios.mjs`. A marca fica porque o CARD continua sendo
   servido daqui — é por ela que se acha o registro.
   A marca "Eventos — helpers compartilhados" SUMIU: o markup do evento foi para
   `src/ui/blocos.mjs`, junto com o da tabela de itinerário e o da grade de frota.
   AVISO, medido em 21/08/2026 e NÃO consertado (não é desta família): três marcas abaixo
   abrigam registro de outra. `LOADERS.empresasRegulares` mora sob `DOC · Estrutura
   Operacional`, `LOADERS.municipioRegiao` mora sob `DOC · Empresas`, e `ligacoesPorTerminal`,
   `secoesPorLigacao` e `frotaPorEmpresa` moram sob `DOC · Municípios`. Não dimensione uma fase
   pela marca: meça por SÍMBOLO. Quem mover essas famílias (C2, C3, C4) conserta as suas.
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
tabs[0].paneEl   = wirePane(modalBody, tabs[0].id);   // o pane da 1ª aba vem do index.html, não de createPane
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
  // Só o que está VISÍVEL entra no ciclo. Panes de abas em segundo plano continuam no DOM (é o
  // que preserva paginação e rolagem delas), e sem este filtro o Tab passeava por dezenas de
  // controles invisíveis — o foco sumia da tela sem sair do modal. `offsetParent === null` cobre
  // os dois casos que ocorrem aqui, ambos `display:none`: pane sem `.active` e `.sp-drop` fechado.
  // (Cuidado ao trocar o critério: `.sp-drop` ABERTO é `position:fixed`, e um teste de
  // posicionamento o descartaria — seus botões, porém, têm offsetParent = o próprio .sp-drop.)
  const f = [...overlay.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null);
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
/* Cada pane é o tabpanel da sua aba: `role="tabpanel"` + `aria-labelledby` apontando para o
   `role="tab"` correspondente (que, do outro lado, ganha `aria-controls` em renderTabs). Sem esse
   par, a faixa anuncia "aba 2 de 3" e o leitor de tela não tem como dizer QUAL região do documento
   aquela aba controla. O id fica no PRÓPRIO elemento de propósito: stripIds/restoreIds varrem só
   descendentes (querySelectorAll não casa o próprio nó), então a ligação sobrevive à aba ir para o
   segundo plano — que é justamente quando os ids internos dela são recolhidos. */
function wirePane(el, tabId){
  el.id = `pane-${tabId}`;
  el.setAttribute('role', 'tabpanel');
  el.setAttribute('aria-labelledby', `tab-${tabId}`);
  return el;
}
function createPane(tabId){
  const el = document.createElement('div');
  el.className = 'modal-body';
  el.innerHTML = loading();
  wirePane(el, tabId);
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
    <div class="modal-tab${t.id===activeTabId?' active':''}${t.stale?' stale':''}" id="tab-${t.id}" role="tab" aria-selected="${t.id===activeTabId}" aria-controls="pane-${t.id}">
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
  newTab.paneEl = createPane(newTab.id);
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
  t.paneEl = createPane(t.id);
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
   O seletor mostra TODOS os tópicos (não só "Linhas") justamente pra alcançar
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
// `ctx.line` chega do lineDocRun (1 resultado ou escolha na tabela); null = nenhuma linha ainda.
function renderTabChooser({ host, line }){
  const aviso = line
    ? `Linha ${esc(line.numero_ligacao || fmtCode(line.codlinha))} selecionada — escolha o documento desta aba:`
    : 'Escolha o documento desta aba (os que exigem linha pedem a busca acima):';
  host.innerHTML = `<p class="doc-note">${aviso}</p>` + tabChooserHTML();
  updateNeedChips();
}
function renderBlankTab(ctx){
  searchPanel(ctx, { title:'Buscar linha', placeholder:'Nome, número ou código da linha',
    onRun:(term, rctx)=>lineDocRun(rctx, term, renderTabChooser) });
  const host = ctx.pane.querySelector('#spHost');
  if (ctx.line){
    const i = ctx.pane.querySelector('#spInput');
    if (i) i.value = ctx.line.numero_ligacao || ctx.line.codlinha || '';
  }
  // o seletor aparece SEMPRE (com ou sem linha): sem ele, uma aba nova sem linha ficava presa
  // no "busque a linha…" e os cards que não precisam de linha seguiam inalcançáveis.
  renderTabChooser(withHost(ctx, host));
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

// O seam do ciclo de vida da view (beginGen/isCurrentGen/commitViewResult/pushDetail/popDetail)
// mora em `src/domain/view-state.mjs`, importado no topo — é puro sobre o objeto `view`, e o
// runbook de uso está lá e no CLAUDE.md § Armadilhas.

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
  //
  // O `history.back()` só é seguro quando a entrada ANTERIOR ainda descreve o estado atual.
  // Clicar numa linha DENTRO do modal (bindLineRows: `selectLine(...)` e logo `closeModal()`)
  // muda a linha ativa e grava isso por replaceState — na entrada do modal, que o back()
  // acabou de descartar. O usuário voltava para a entrada pré-modal, o `hashchange` chamava
  // applyRoute e, sem `linha/` no hash, ela executava `setActiveLine(null)`: a seleção
  // recém-feita era apagada. Sem linha ativa antes (cards que não exigem linha, como
  // "Linhas por Localidade e Município") o resultado era não conseguir selecionar linha
  // nenhuma por ali; com uma linha já ativa, a seleção revertia em silêncio para a antiga.
  // Quando a linha mudou com o modal aberto, então, mantemos a entrada e só reescrevemos o
  // hash (replaceState não dispara hashchange, logo não há applyRoute para desfazer nada).
  // Efeito colateral aceito e desejável: o Voltar do navegador passa a desfazer a seleção.
  if (!_applyingRoute){
    const linhaAgora = activeLine ? String(activeLine.codlinha) : null;
    const empurrou = _modalPushed;
    _modalPushed = false;
    if (empurrou && linhaAgora === _lineAtPush) history.back();
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
// `loading`/`emptyBox`/`emptyLinha`/`errorBox` (os estados de tela) são markup puro e moram em
// `src/ui/doc.mjs`, importados no topo. `setBody` fica aqui porque escreve no DOM — e escreve no
// `modalBody` AO VIVO de propósito: seu único chamador é o `runView`, que acabou de ativar a aba.
// Quem escreve depois de um await usa `ctx.pane`, o nó capturado (ver o contrato acima).

// Ponto ÚNICO onde o shell monta um contexto novo para um documento — e o único que ainda lê o
// `activeLine` global para isso. Lê-lo AQUI, a cada tentativa, é o que mantém o comportamento de
// sempre: o painel de busca re-executado pelo Realtime (`_panelRun`) tem de enxergar a linha que
// o usuário escolheu DENTRO do documento, não a que estava ativa quando o painel foi montado.
// Documento nenhum chama esta função: ele recebe o ctx pronto e deriva com withLine/withHost/
// nextGen. Três call sites, e são as três bordas do sistema: runView, reloadTab e o `run` de
// painel (searchPanel, Portarias e Localidades, que têm o seu próprio).
const novoCtx = (view, pane, host = null) => makeCtx(view, { pane, host, line: activeLine });

/* --- Dispatcher — runView ---------------------------------------- */
async function runView(view, { silent=false } = {}){
  if (!nav.goingBack && overlay.classList.contains('open') && currentView) {
    nav.push(currentView);
  }
  nav.goingBack = false;
  const wasOpen = overlay.classList.contains('open');
  if (!wasOpen) lastFocused = document.activeElement;
  setCurrentView(view);
  // fixa o pane DESTA view no momento em que ela começa a rodar — não o `modalBody` ao vivo. É
  // ele que vai para o `ctx.pane` do loader logo abaixo: quem escreve depois de um await escreve
  // no pane capturado, não no compartilhado. Sem isso, trocar de aba com o loader no ar faria a
  // resposta atrasada pintar a aba ERRADA — a que está em foco agora, não a que pediu (mesma
  // razão do seam beginGen/commitViewResult, só que pro HTML da tela em vez do pdfHTML).
  // `view._pane` continua existindo porque o `catch` do runView e o próprio ctx o usam; a
  // bancada que reproduz essa corrida é scripts/check_corrida_abas.mjs.
  view._pane = modalBody;
  mtTitle.textContent = view.title;
  renderTabs();   // título da aba ativa pode ter mudado (troca de documento dentro da mesma aba)
  overlay.classList.add('open');
  modalClose.focus();                     // move o foco p/ dentro do diálogo
  // rota: ABRIR o modal cria UMA entrada de histórico (Voltar do navegador fecha o modal);
  // trocas de view com o modal já aberto só atualizam o hash (replace, sem nova entrada).
  syncHash({ push: !wasOpen && !!view.key });
  if (!silent) setBody(loading());
  // O ctx nasce AQUI, e é o que o loader recebe: view+geração desta abertura, o pane capturado
  // acima e a linha ativa deste instante. Nada entre o `novoCtx` e o `await` — a geração tem de
  // ser a mais nova no momento em que o loader começa.
  const ctx = novoCtx(view, view._pane);
  try { await view.loader(ctx); }
  catch(e){ ctx.pane.innerHTML = errorBox(e.message); }
}

/* --- Busca de linha — wrappers de documento ---------------------- */
// `docHead`/`metaRows`/`colClass`/`tableHTML` moraram para `src/ui/doc.mjs` (markup sem estado);
// o SVG do logo chega lá pelo `configurarDoc` do bootstrap, no topo do arquivo.

/* ----------------------------------------------------------------
   LOADERS POR CARD — cada um RECEBE o ctx, desenha em `ctx.pane` e é re-executável
   ---------------------------------------------------------------- */
const LOADERS = {};

/* ---- Linhas — busca embutida no card (nome, número ou código) ----
   Cada documento abre com um campo de busca de linha dentro do próprio card. Havendo
   linha já selecionada no topo, mostra o documento dela de imediato; pode-se trocar de
   linha pesquisando ali mesmo. `render(ctx)` desenha o documento de UMA linha (`ctx.line`)
   em `ctx.host`; o wrapper cuida da busca, da escolha entre várias linhas e do PDF. */
function lineDocView(ctx, { subtitle, render }){
  searchPanel(ctx, { title:subtitle, placeholder:'Nome, número ou código da linha',
    onRun:(term, rctx)=>lineDocRun(rctx, term, render) });
  const host = ctx.pane.querySelector('#spHost');
  if (ctx.line){
    const i = ctx.pane.querySelector('#spInput');
    if (i) i.value = ctx.line.numero_ligacao || ctx.line.codlinha || '';
    // MESMA geração do loader (`withHost` só troca o container): este render É a tentativa de
    // abertura do documento, não uma busca nova.
    render(withHost(ctx, host));
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
// `render(ctx)` desenha o documento; `useActive` liga o atalho da linha já selecionada.
// A linha certa só existe DEPOIS do await, e é por isso que o contrato tem `withLine`: ela entra
// no ctx preservando `view` e `gen`. Com geração nova, uma busca velha que resolvesse tarde
// voltaria a vencer a mais recente — o bug que este seam existe para impedir.
async function lineSearchRun(ctx, term, { render, emptyMsg, prompt, useActive = true }){
  const { view, gen, host, line } = ctx;
  term = (term||'').trim();
  if (!term){
    if (useActive && line) return render(ctx);
    host.innerHTML = emptyBox(emptyMsg); commitViewResult(view, gen, { pdfHTML:null }); return;
  }
  if (useActive && line && lineMatchesTerm(line, term)) return render(ctx);
  const lines = await searchLines(term);
  if (!lines.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para “'+esc(term)+'”.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  if (lines.length === 1){ selectLine(lines[0]); return render(withLine(ctx, lines[0])); }
  await getEmpresas();
  host.innerHTML = `<p class="doc-note">${lines.length} linha(s) encontradas — ${prompt}:</p>` + linhasTable(lines);
  host.querySelectorAll('tr[data-row]').forEach(tr=>tr.addEventListener('click',()=>{ const l=JSON.parse(tr.dataset.row); selectLine(l); render(withLine(ctx, l)); }));
  commitViewResult(view, gen, { pdfHTML:null });
}
// resolve o termo → 1 linha (renderiza o documento) ou várias (lista p/ escolher)
function lineDocRun(ctx, term, render){
  return lineSearchRun(ctx, term, { render, emptyMsg:'Busque a linha pelo nome, número ou código.', prompt:'clique para abrir o documento' });
}

/* --- DOC · Histórico (linha) --------------------------------------
   O RENDER mora em `src/documentos/frota-historico-itinerarios.mjs` (Fase C1). Aqui fica o
   registro, que é shell: o painel de busca de linha e o `lineSearchRun` que resolve o termo.
   O MARKUP do evento (`evBandHTML`/`evBlocksHTML`) mora em `src/ui/blocos.mjs`, porque o
   Histórico da EMPRESA (mais abaixo, família C3) usa os mesmos dois blocos. */
LOADERS.historicoLinha = async (ctx) => {
  const pre = ctx.line ? (ctx.line.numero_ligacao || ctx.line.codlinha || '') : '';
  searchPanel(ctx, { title:'Histórico da Linha', placeholder:'Nome, número ou código da linha', value:pre,
    onRun: (term, rctx) => lineSearchRun(rctx, term, { render:renderLineHistory,
      emptyMsg:'Busque pelo nome, número ou código da linha.', prompt:'clique para ver o histórico' }) });
};

/* --- DOC · Itinerários --------------------------------------------
   Render em `src/documentos/frota-historico-itinerarios.mjs`; a tabela e a normalização de
   sentido, em `src/ui/blocos.mjs` (a Estrutura Operacional, família C2, também as usa). */
LOADERS.itinerarios = (ctx) => lineDocView(ctx, { subtitle:'Cadastro de Linhas: Itinerários', render:renderItinerarios });

/* --- DOC · Quadro de Horários ---------------------------------
   `quadroMetaHTML`/`quadroDocInner`/`fetchQHByLines`, os renders (`renderLinhaQuadro`,
   `renderEmpresaQuadros`) e o modo empresa (`quadroEmpresaRun`) moraram para
   `src/documentos/quadro-empresas.mjs` na Fase C3. `quadroLinhaRun` FICOU: é wrapper que chama
   `lineSearchRun` (abaixo), que só existe aqui porque usa `selectLine` — shell puro, sem seam de
   injeção (a razão está no cabeçalho do módulo novo). */

// Modo linha: resolve o termo (número, nome ou código) → 1 linha (mostra o quadro) ou várias (lista)
function quadroLinhaRun(ctx, term){
  return lineSearchRun(ctx, term, { render:renderLinhaQuadro, emptyMsg:'Busque a linha pelo número, nome ou código.', prompt:'clique para ver o quadro' });
}

LOADERS.quadroHorarios = async (ctx) => {
  searchPanel(ctx, {
    title:'Quadro de Horários',
    placeholder:'Número, nome ou código da linha (ou empresa)',
    selectOpts:[['linha','Por linha'],['empresa','Por empresa (PDF de todos)']],
    note: 'Por linha: número, nome ou código → mostra o quadro dela. Por empresa: nome ou código → baixa o PDF de todos os quadros da operadora.',
    onRun: (term, rctx, modo) => modo==='empresa' ? quadroEmpresaRun(rctx, term) : quadroLinhaRun(rctx, term)
  });
  // havendo linha ativa, prefill com a linha e mostra o quadro dela (modo "Por linha", padrão)
  if (ctx.line){
    const i = ctx.pane.querySelector('#spInput'); if(i) i.value = ctx.line.numero_ligacao || ctx.line.codlinha || '';
    await renderLinhaQuadro(withHost(ctx, ctx.pane.querySelector('#spHost')));
  }
};

/* --- DOC · Tarifas --------------------------------------------
   Os renders (`renderTarifas`, `tarifaEmpresaRun`, `renderTarifasEmpresa`) e o markup só de
   Tarifas (`linhaTarifaRowHTML`/`LINHA_TARIFA_COLS`) moraram para
   `src/documentos/estrutura-tarifas-portaria.mjs` na Fase C2. `secoesTarifasHTML`/`tarifaRowHTML`/
   `TARIFA_COLS`, que o Quadro de Horários (logo acima) TAMBÉM usa, foram para `src/ui/blocos.mjs`.
   Aqui fica só o registro — que É trabalho de shell (composição do `searchPanel` com dois
   modos), não um one-liner; mover essa composição é trabalho da Fase D, não desta. */
LOADERS.tarifas = (ctx) => {
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
    renderTarifas(withHost(ctx, host));
  } else {
    host.innerHTML = emptyBox('Busque a linha pelo nome, número ou código — ou troque para "Por empresa".');
  }
};

/* --- DOC · Frota --------------------------------------------------
   Render em `src/documentos/frota-historico-itinerarios.mjs`; a grade de KPIs
   (`frotaBlockHTML`), em `src/ui/blocos.mjs` — a Estrutura Operacional, logo abaixo, a repete. */
LOADERS.frota = (ctx) => lineDocView(ctx, { subtitle:'Frota da Linha', render:renderFrota });

/* --- DOC · Estrutura Operacional ------------------------------
   Render em `src/documentos/estrutura-tarifas-portaria.mjs` (Fase C2) — o documento consolidado
   (igual ao Relatório oficial): cadastro + Seções/Tarifas + Itinerário + Quadro de Horários e
   Frota, num único `.doc` (também usado no PDF). Aqui fica só o registro, one-liner de shell. */
LOADERS.estrutura = (ctx) => lineDocView(ctx, { subtitle:'Cadastro de Linhas: Estrutura Operacional', render:renderEstrutura });

/* ---- Empresas ---- */
LOADERS.empresasRegulares = async ({ view, gen, pane }) => {
  // lista TODAS as empresas do cadastro (codempresa_teste), inclusive sem linhas
  const [lineRows] = await Promise.all([
    sbFetch('tabela_vista_teste', `select=codempresa,cancelado,paralisado&limit=5000`),
    getEmpresas()
  ]);
  const cnt = {};
  lineRows.forEach(r=>{ const k=r.codempresa||'—'; cnt[k]=cnt[k]||{total:0,ativas:0}; cnt[k].total++; if(isLinhaAtiva(r))cnt[k].ativas++; });
  // dedup do cadastro por RJ (uma entrada por codempresa) — mesma regra que o getEmpresas usa
  // para o nome do banner, e por isso a MESMA função: ver dedupEmpresasPorRJ, em
  // src/domain/agrupamento.mjs (o getEmpresas que a usa mora em src/data/lookups.mjs)
  const list = dedupEmpresasPorRJ(empresasList()).map(e=>({ ...e, total:(cnt[e.codempresa]?.total)||0, ativas:(cnt[e.codempresa]?.ativas)||0 }));
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

/* --- DOC · Empresas -----------------------------------------------
   `ligacoesPorEmpresaRun`/`secoesPorEmpresaRun`/`historicoEmpresaRun` (a lógica que era o corpo
   do `onRun` de cada `LOADERS.*`) e `renderEmpresaHistory` moraram para
   `src/documentos/quadro-empresas.mjs` na Fase C3 — mesmo padrão que a C2 usou para
   `tarifaEmpresaRun`. Os três registros ficaram como wrappers finos (`searchPanel` + a função
   importada). `openEmpresaLigacoes` FICOU: abre uma view NOVA via `runView`, que é shell puro
   sem seam de injeção — ver a nota no cabeçalho do módulo novo. */
function openEmpresaLigacoes(cod){
  runView({ title:'Ligações por Empresa', tables:['tabela_vista_teste','codempresa_teste'], loader: async({ view, gen, pane })=>{
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
LOADERS.ligacoesPorEmpresa = async (ctx) => {
  const pre = ctx.line?.codempresa || '';
  searchPanel(ctx, { title:'Ligações por Empresa', placeholder:'Código (ex. 101) ou nome da empresa', value:pre,
    onRun: (term, rctx) => ligacoesPorEmpresaRun(rctx, term) });
};
LOADERS.secoesPorEmpresa = async (ctx) => {
  const pre = ctx.line?.codempresa || '';
  searchPanel(ctx, { title:'Seções por Empresa', placeholder:'Código da empresa (ex. 101)', value:pre,
    onRun: (term, rctx) => secoesPorEmpresaRun(rctx, term) });
};
LOADERS.historicoEmpresa = async (ctx) => {
  const pre = ctx.line?.codempresa || '';
  searchPanel(ctx, { title:'Histórico da Empresa', placeholder:'Nome ou código da empresa (ex. 1001 ou AUTO VIAÇÃO)', value:pre,
    onRun: (term, rctx) => historicoEmpresaRun(rctx, term) });
};

/* ---- Consultas (por logradouro, terminal, localidade, município) ---- */
LOADERS.ligacoesPorLogradouro = async (ctx) => {
  const ibge = await getIbge();
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  searchPanel(ctx, { title:'Ligações por Logradouro', placeholder:'Nome da via / logradouro', selectOpts:[['','Todos os municípios'],...munOpts], onRun: async(term, { view, gen, host }, ibgeCod)=>{
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
LOADERS.municipioRegiao = async (ctx) => {
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
  searchPanel(ctx, { title:'Município e Região', placeholder:'Nome do município (ou escolha uma região)', selectOpts:[['','Todas as regiões'],...regioes.map(r=>[r,r])], onRun: async(term, rctx, region)=>{
    const host = rctx.host;
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
        // geração NOVA da MESMA tentativa (nextGen preserva view/pane/host): o usuário pode
        // trocar o escopo de novo antes de a RPC responder — é a corrida que motivou o seam.
        // Um ctx montado do zero aqui acertaria a aba errada se ele tivesse trocado de aba.
        const { view, gen } = nextGen(rctx);
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
// A classificação dentro × intermunicipal (classifyMunLines) e o agrupamento de terminais por
// grafia (terminaisDoMunicipio) vivem em src/domain/agrupamento.mjs.
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
async function mostrarLinhasResultado(ctx, cods, titulo){
  const { view, gen, host } = ctx;
  if(!cods.length){ host.innerHTML = emptyBox('Nenhuma linha encontrada para este critério.'); commitViewResult(view, gen, { pdfHTML:null }); return; }
  const slice = cods.slice(0,250);
  const rows = await fetchLinesByCods(slice,{limit:250});
  // Diferente do modo Localidade (que filtra a seção pelo NOME buscado), aqui não há um nome
  // pra casar — a busca é geográfica (itinerário). Mostra a tabela de tarifa INTEIRA de cada
  // linha encontrada.
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
async function mostrarLinhasEntreMunicipios(ctx, aTerm, bTerm, directional){
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
LOADERS.ligacoesPorTerminal = async (ctx) => {
  const [orig, ibge, terminais] = await Promise.all([getOrigem(), getIbge(), getTerminais()]);
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  const nomesOrigem = [...new Set(Object.values(orig).filter(Boolean))];
  const nomesTerminal = [...new Set(terminais.map(r=>r.nome_logradouro).filter(Boolean))];
  const nomesTodos = [...new Set([...nomesOrigem, ...nomesTerminal])].sort((a,b)=>a.localeCompare(b));
  const suggest = q => { const nq=norm(q); return nomesTodos.filter(n=>norm(n).includes(nq)); };
  searchPanel(ctx, { title:'Ligações por Terminais', placeholder:'Nome do terminal / origem', selectOpts:[['','Todos os municípios'],...munOpts], suggest, onRun: async(term, rctx, ibgeCod)=>{
    const { view, gen, pane, host } = rctx;
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
  }});
};
LOADERS.secoesPorLigacao = async ({ view, gen, pane, line }) => {
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
};

// A agregação (resumoFrota) e o filtro da tabela (filtrarFrotaEmpresas) vivem em
// src/domain/agrupamento.mjs.
// Frota consolidada por empresa (total geral + quebra por hierarquia) — item 16
LOADERS.frotaPorEmpresa = async ({ view, gen, pane }) => {
  const [rows] = await Promise.all([
    sbFetch('qh_teste', `select=codempresa,hierarquia,frota_operacional,reserva&limit=10000`),
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
    if(!filtradas.length){
      result.innerHTML = emptyBox('Nenhuma empresa com esse filtro.');
    } else {
      paginateTable(result, filtradas, {
        cols:empCols, rowHTML:empRowHTML, foot:t=>t+' empresa(s)', unit:'empresas',
        pageSize:25, pdf:false, view, gen,
      });
    }
    commitViewResult(view, gen, { pdfHTML:()=>pdfHTML(filtradas) });
  };
  sel.addEventListener('change', paint);
  inp.addEventListener('input', debounce(paint));
  paint();
};
/* --- DOC · Portaria -----------------------------------------------
   `getPortariaAnos`/`renderPortarias`/`showPortaria` moraram para
   `src/documentos/estrutura-tarifas-portaria.mjs` na Fase C2 — é o único documento de
   lista+detalhe da Fase C (a razão de usar pushDetail/popDetail está no cabeçalho de lá).
   `LOADERS.portarias` virou o one-liner `renderPortarias` (import no topo do arquivo). */
LOADERS.portarias = renderPortarias;

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
// `localidadesQueCasam`/`orIlike`/`municipiosExatos` moraram para `src/domain/busca.mjs`.
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
async function mostrarLinhasPorLocalidade(ctx, a, b, bTipo='localidade'){
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
LOADERS.localidades = async (ctx) => {
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
// A PAGINAÇÃO mora em módulos: o núcleo agnóstico de conteúdo (`paginate`, `paginateTable`,
// `paginateEvents`) em `src/ui/paginacao.mjs`, e a família de listas de LINHA
// (`situacaoSelectHTML`, `linhasTable`, `bindLineRows`, `paginateLines`, `lineResults`) em
// `src/ui/listas.mjs`, que recebe a ação de clicar numa linha pelo `configurarListas` do
// bootstrap. Ver docs/estrutura-frontend.md §4.
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
// A barra de situação (Todas/Ativas/Canceladas) usa o MESMO seletor e a MESMA regra do
// `lineResults` (via situacaoSelectHTML/filtrarSituacao): as duas telas listam linha e
// precisam concordar no que é "ativa". O filtro repinta os DOIS blocos e refaz o
// `bindLineRows` — quem entra na tela depois de filtrar tem que continuar clicável.
function renderLocalidadeSecoes(host, base, secByLine, { prefixHTML='', view, gen, semSecaoSub, semSecaoObs } = {}){
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
function locLinhaSecHTML(r, secByLine){
  const chips = [boolChip(r.cancelado,'canc.'), boolChip(r.paralisado,'paral.')].filter(Boolean).join(' ');
  return `<div class="loc-linha-sec">
    <div class="loc-linha-head clickable" tabindex="0" role="button" data-row='${esc(JSON.stringify(r))}'><span class="mono">${esc(fmtCode(r.codlinha))}</span> <span>${fmtLineName(r.nome_ligacao)}</span> ${chips}</div>
    ${secoesLocalidadeTable(secByLine.get(r.codlinha)||[])}</div>`;
}
// bloco "com seção" de uma FATIA de linhas já ordenada por empresa: os cabeçalhos de empresa
// entram DENTRO da fatia, e a contagem do cabeçalho é a do grupo INTEIRO (`totais`), não a da
// página — mesma convenção do `paginateLines` no modo agrupado.
function locComSecaoHTML(fatia, secByLine, totais){
  return [...groupBy(fatia, r=>r.codempresa||'—')].map(([cod,rs])=>
    `<h3 class="loc-emp-head">${esc(empNome(cod))} <span class="loc-emp-rj">RJ-${esc(cod||'—')} · ${totais.get(cod)} linha(s)</span></h3>`
    + rs.map(r=>locLinhaSecHTML(r, secByLine)).join('')).join('');
}
const LOC_SEM_SECAO_OBS = 'Ligam os pontos buscados, mas não têm uma seção de tarifa com esse nome.';
// Os DOIS blocos são paginados em 25/página (`paginate`/`paginateLines`), como as demais listas
// de linha do portal — uma localidade grande chega a 400 linhas, cada uma com sua tabela de
// seções, e despejar tudo no DOM de uma vez travava a tela.
// Como só a fatia atual entra no DOM, o fallback do `baixarPdf` exportaria só a página aberta:
// por isso o `pdfHTML` é escrito aqui pelo seam (`commitViewResult`), com os dois blocos
// INTEIROS. Ver CLAUDE.md § "Paginação é SÓ de tela; o PDF sai INTEIRO".
function pintarLocalidadeSecoes(host, base, secByLine, { total = base.length, view, gen, semSecaoSub = 'por itinerário ou nome', semSecaoObs = LOC_SEM_SECAO_OBS } = {}){
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
// `empresaChooserHTML`/`bindEmpresaRows` moraram para `src/ui/empresas.mjs` na Fase C2 —
// importados no topo do arquivo. Usados por mais de uma família (Tarifas, Quadro de Horários,
// Histórico da Empresa), mesmo critério do `src/ui/blocos.mjs`; endereço diferente porque
// `bindEmpresaRows` toca DOM (ver o cabeçalho do módulo).
// Painel com input de busca dentro do modal; o run() é re-executável (realtime).
// Recebe o `ctx` do documento e escreve no `ctx.pane` — não no `modalBody` ao vivo. A diferença
// aparece quando o loader faz `await` ANTES de montar o painel (ligacoesPorLogradouro espera o
// getIbge, ligacoesPorTerminal espera três lookups): se o usuário trocar de aba nesse intervalo,
// o `modalBody` já aponta para outra aba e o painel inteiro era pintado na aba errada.
// Cada `run()` monta o SEU ctx (geração nova + a linha ativa do momento) e o entrega ao `onRun`,
// que por isso não recebe mais `host` solto: ele vem em `ctx.host`.
function searchPanel(ctx, { title, placeholder, value='', selectOpts, onRun, auto=false, note, suggest }){
  const selHTML = selectOpts? `<select id="spSel" aria-label="Filtro">${selectOpts.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`:'';
  // `suggest(termo)` (opcional) devolve nomes candidatos p/ autocomplete; dropdown próprio
  // (classe sp-*, não results-drop/.selector — evita a armadilha do CSS ".selector > button").
  const dropHTML = suggest? `<div class="sp-drop" id="spDrop" role="listbox"></div>` : '';
  const pane = ctx.pane;
  pane.innerHTML = `<div class="doc">${docHead(title)}
    ${note?`<div class="doc-obs tight"><b>Nota:</b> ${esc(note)}</div>`:''}
    <div class="doc-search"><div class="sp-field"><input id="spInput" type="text" placeholder="${esc(placeholder)}" value="${esc(value)}" aria-label="${esc(placeholder)}" autocomplete="off"${suggest?' role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="spDrop"':''}>${dropHTML}</div>${selHTML}<button id="spBtn">Buscar</button></div>
    <div id="spHost"></div></div>`;
  const input=pane.querySelector('#spInput'), btn=pane.querySelector('#spBtn'), host=pane.querySelector('#spHost'), sel=pane.querySelector('#spSel');
  const run = async()=>{ closeSug(); host.innerHTML=loading();
    const rctx = novoCtx(ctx.view, pane, host);
    try{ await onRun(input.value.trim(), rctx, sel?sel.value:undefined); }catch(e){ host.innerHTML=errorBox(e.message);} };
  let closeSug = ()=>{};
  if(suggest){
    const drop = pane.querySelector('#spDrop');
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
  if(ctx.view) ctx.view._panelRun = run;
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
  historicoLinha:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste','tabela_vista_teste'], itinerarios:['itinerario_teste','municipio_teste','codempresa_teste'],
  quadroHorarios:['qh_intervalo_teste','qh_predeterminado_teste','qh_teste','tarifa_atual_teste','origem_teste','codempresa_teste','tabela_vista_teste'], tarifas:['tarifa_atual_teste','codempresa_teste'],
  frota:['qh_teste','codempresa_teste'], estrutura:['tabela_vista_teste','tarifa_atual_teste','itinerario_teste','qh_intervalo_teste','qh_predeterminado_teste','qh_teste','origem_teste','municipio_teste','codempresa_teste'],
  empresasRegulares:['tabela_vista_teste','codempresa_teste'], historicoEmpresa:['evento_teste','evento_empresa_teste','evento_linha_teste','codempresa_teste'],
  ligacoesPorEmpresa:['tabela_vista_teste','codempresa_teste'], secoesPorEmpresa:['tarifa_atual_teste'],
  ligacoesPorLogradouro:['itinerario_teste','tabela_vista_teste','codempresa_teste','municipio_teste'], municipioRegiao:['municipio_teste','itinerario_teste','tabela_vista_teste','codempresa_teste'],
  ligacoesPorTerminal:['qh_intervalo_teste','qh_predeterminado_teste','origem_teste','tabela_vista_teste','codempresa_teste','municipio_teste','itinerario_teste'],
  secoesPorLigacao:['tarifa_atual_teste'],
  frotaPorEmpresa:['qh_teste','codempresa_teste'],
  portarias:['portaria_teste'],
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
    const sec = SECTIONS.find(s => s.key === key);
    // tópico-ação (`direct`): abre o modal direto, sem tocar no painel de fundo — o usuário
    // continua exatamente no tópico onde estava, e o modal reaparece sobre ele ao fechar.
    if (sec && sec.direct){ openView(sec.direct); return; }
    // clique no tópico é o ÚNICO jeito de abrir/fechar a sub-lista (nunca abre sozinha)
    expandedTopicKey = (expandedTopicKey === key) ? null : key;
    if (currentTopicKey === key){
      // clicar em "Linhas" enquanto a busca está aberta em cima dele fecha a
      // busca e volta pro grid — senão o clique parecia não fazer nada (a sub-lista abria/
      // fechava, mas "Buscar" continuava com o destaque em vez do tópico clicado).
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

// tabela → como invalidar o cache derivado dela. Declarativo em vez de cadeia de if: deixa o
// conjunto de caches invalidáveis visível num lugar só. Os caches de LOOKUP moram em
// `src/data/lookups.mjs` e trazem os invalidadores deles prontos (quem sabe o que limpar é quem
// guarda); aqui embaixo ficam só os caches desta camada. Cache novo entra do lado certo: de
// lookup, no módulo; de tela, aqui.
const CACHE_INVALIDATORS = {
  ...INVALIDADORES_LOOKUP,
  portaria_teste:       invalidarPortariaAnos,
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
    // reconfere DEPOIS do await: o ctx do loader é montado logo abaixo, a partir de `tab`, então
    // rodar o loader agora despacharia trabalho para uma aba que já não é a dona do evento.
    // Trocou de documento na mesma aba → o runView novo já trouxe dado fresco, nada a fazer;
    // trocou de aba → ela volta a ser só "desatualizada".
    if(tab.view !== view) return;
    if(tab !== activeTab()){ markStale([tab.id]); return; }
    // A SEGUNDA invocação de loader do arquivo (a outra é o runView). Mudar só uma delas faria
    // o card abrir certo e o recarregamento ao vivo passar `undefined` — falha que só aparece
    // com o portal aberto e o banco mudando, que nenhum gate offline enxerga.
    // O `_panelRun` não recebe ctx: ele é o `run` do painel, que monta o seu (geração nova + a
    // linha do momento) a cada chamada — é exatamente o que um recarregamento precisa.
    if(view._panelRun) await view._panelRun();        // painéis de busca
    else await view.loader(novoCtx(view, tab.paneEl));  // views diretas
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
// O dispatch por aba (`dispatchRealtime`, e o `tabMatchesEvent` que ele usa por dentro) mora em
// `src/domain/view-state.mjs`: decide quem recarrega AGORA e quem só fica marcada. Quem APLICA a
// decisão é o `onRealtime` abaixo, com o `markStale`/`scheduleReload` daqui.
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
   AUTO-ATUALIZAÇÃO — detecta novo deploy e recarrega sozinho.
   version.json é o marcador atômico do conjunto index/CSS/JS/módulos:
   qualquer deploy que os altere também incrementa sua versão.
   ================================================================ */
let _verTag = null;
async function checarNovaVersao(){
  try {
    const res = await fetch('/version.json?_=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
    const tag = res.headers.get('etag') || res.headers.get('last-modified');
    if (!tag) return;                  // sem como comparar → não faz nada
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
// codlinha da linha ativa NO MOMENTO em que o modal empurrou sua entrada de histórico.
// Serve para o closeModal saber se a entrada anterior ainda descreve o estado atual — ver o
// comentário longo lá.
let _lineAtPush   = null;

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
    if (push){ history.pushState(null, '', target); _modalPushed = true; _lineAtPush = activeLine ? String(activeLine.codlinha) : null; }
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
    // — tópico-ação (`direct`) nunca vira "tópico ativo" (não tem grade pra pintar atrás do
    // modal): ignora tanto o dono do view quanto um `#/topico/<key>` antigo apontando pra ele,
    // caindo no segmento seguinte ou no padrão.
    const isDirectTopic = key => !!SECTIONS.find(s => s.key === key)?.direct;
    const viewTopic = view && VIEW_TOPIC[view];
    const topicoAlvo = (viewTopic && !isDirectTopic(viewTopic) && viewTopic)
      || (topico && !isDirectTopic(topico) && topico)
      || DEFAULT_TOPIC;
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
