// `fmtTime`/`fmtDate` NÃO entram: sem call site no `app.js` (achado ao editar este bloco de
// import para a Fase C4, já mortas de antes — outros módulos, como `quadro-empresas.mjs`, os
// importam por conta própria).
import {
  fmtCode, esc, enc, ilikeTerm, orDash,
  boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, debounce,
} from './src/domain/core.mjs';
// `scoreEmpresa` não entra aqui de propósito: só o dedupEmpresasPorRJ a usa, e ele mora no módulo.
// `groupBy`/`countBy`/`fmtMoney`/`rjOrder`/`classifyMunLines`/`terminaisDoMunicipio` NÃO entram
// mais: quem os usava (a família Municípios/Localidades) saiu inteira na Fase C4 e os importa
// por conta própria.
import {
  byCodlinha,
  dedupEmpresasPorRJ,
  resumoFrota, filtrarFrotaEmpresas,
} from './src/domain/agrupamento.mjs';
// `src/domain/busca.mjs` (`localidadesQueCasam`/`orIlike`/`municipiosExatos`) NÃO é mais
// importado AQUI: quem os usava (`termosLocalidade`, I/O, e por isso nunca morou no módulo
// puro) saiu inteiro para `src/documentos/municipios-localidades.mjs` na Fase C4, que os importa
// por conta própria — o módulo em si continua existindo e testado (`tests/`).
// `yearOf` e `matchEvent` NÃO entram: quem os usa é o `paginateEvents` de src/ui/paginacao.mjs,
// que os importa por conta própria desde a Fase B2 — aqui seriam binding morto, o mesmo motivo
// pelo qual `beginGen` ficou de fora acima. (O `matchEvent` FICOU nesta lista por engano na B2 e
// só foi removido na Fase C1; os dois seguem exportados porque os testes os exercitam.)
// Estado do que está na tela — o seam do ciclo de vida da view, o modelo de abas, o despacho do
// Realtime por aba e o que cada lista mostra. A camada de UI (renderTabs/activateTab/markStale/
// scheduleReload) fica no app.js: o módulo decide, o app.js aplica.
// `beginGen` NÃO entra: desde a Fase A ninguém no app.js cunha geração à mão — quem chama o
// beginGen é o `makeCtx`/`nextGen` do próprio módulo, e importá-lo aqui seria binding morto (e
// um convite a recriar o `const view = currentView, gen = beginGen(view)` que a fase eliminou).
// `nextGen`/`filtrarSituacao` também NÃO entram mais: a Fase C4 moveu quem os usava
// (`municipioRegiaoRun`/`openLinhasPorIbge`, `renderLocalidadeSecoes`) para o módulo novo.
import {
  isCurrentGen, commitViewResult, pushDetail, popDetail,
  makeCtx, withLine, withHost,
  MAX_TABS, makeTab, openTabState, closeTabState,
  dispatchRealtime,
} from './src/domain/view-state.mjs';
// `pageBounds` também não entra, pelo mesmo motivo: quem o usa é o `paginate` de
// src/ui/paginacao.mjs. Ficou nesta lista por engano na B2 e saiu na C1.
// Markup de documento (cabeçalho, meta, tabela, estados de tela) — string de HTML, sem DOM nem
// estado. O SVG do logo chega por `configurarDoc` no bootstrap logo abaixo. `emptyLinha` NÃO
// entra mais: quem o usava (`renderSecoesPorLigacao`) saiu na Fase C4.
import {
  configurarDoc, docHead, metaRows, colClass, tableHTML,
  loading, emptyBox, errorBox, bannerTrunc,
} from './src/ui/doc.mjs';
// Caches de referência (municípios, origens, terminais, cadastro de empresas, tipos de evento).
// A função de rede chega neles por `configurarLookups` no bootstrap logo abaixo.
// `preencherLookup` NÃO entra: quem o usa é o próprio módulo (e o tests/harness.js, que o
// importa direto). Terceiro binding morto herdado da B2, removido na C1 junto com os outros dois.
// `getEvLookups` NÃO entra mais: quem o usava (`renderEmpresaHistory`) saiu na Fase C3.
import {
  configurarLookups, getIbge, getOrigem, getTerminais,
  getEmpresas, empNome, empresasMap, empresasList, empresaPorCod,
  INVALIDADORES_LOOKUP,
} from './src/data/lookups.mjs';
// Paginação de tela — o núcleo agnóstico de conteúdo. Só de TELA: dados e PDF saem inteiros.
// `paginateEvents` NÃO entra mais: quem o usava (`renderEmpresaHistory`) saiu na Fase C3 — quem
// precisa dele agora é o próprio `src/documentos/quadro-empresas.mjs`. `paginate` também não:
// quem o usava (`pintarLocalidadeSecoes`) saiu na Fase C4, para o mesmo módulo.
import { paginateTable } from './src/ui/paginacao.mjs';
// A família de listas de LINHA. A ação de clicar numa linha (selecionar + fechar o modal + toast)
// é de shell e chega por `configurarListas` no bootstrap logo abaixo. `bindLineRows`/
// `paginateLines` NÃO entram mais: quem os usava (`pintarLocalidadeSecoes`) saiu na Fase C4.
import {
  configurarListas, situacaoSelectHTML, linhasTable, lineResults,
} from './src/ui/listas.mjs';
// As listas de colunas do `select=`. São dado, não estado; saíram na Fase C1 junto com o
// primeiro documento, para não existirem em duas cópias (a do módulo e a daqui). Só `LINE_FIELDS`
// segue lida diretamente pelo `app.js` — as outras seis (`ITINERARIO_FIELDS`, `QH_*`,
// `TARIFA_LINHA_FIELDS`, `FROTA_FIELDS`, `EVENTO_FIELDS`) ficaram sem nenhum call site aqui desde
// que a Fase C3 moveu o Quadro de Horários e o Histórico da Empresa — binding morto removido
// junto (as duas primeiras já estavam mortas desde a C1/C2, e escaparam por engano).
import { LINE_FIELDS } from './src/data/campos.mjs';
// FASE C1 — a primeira família de documentos a sair inteira do arquivo. O que fica aqui embaixo
// são os registros `LOADERS.*`, que são shell (wrappers de busca de linha) e saem nas Fases D/E.
// `configurarDocumentos` é o seam ÚNICO de `src/documentos/`: injeta a rede e a ação de shell
// para TODAS as famílias da Fase C, e é onde o critério de parada do plano se mede.
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
// FASE C4 — Municípios · Localidades, a quarta e última família a sair inteira. As DUAS metades
// vivem no MESMO módulo (compartilham markup de verdade — ver o cabeçalho do arquivo). Os três
// `xxxRun` alimentam `LOADERS.ligacoesPorLogradouro`/`municipioRegiao`/`ligacoesPorTerminal`, que
// FICAM (têm corpo — mesmo padrão de `LOADERS.tarifas`/`quadroHorarios`). `renderSecoesPorLigacao`
// e `renderLocalidades` viraram one-liners (mesmo padrão de `renderPortarias`, C2).
import {
  ligacoesPorLogradouroRun, municipioRegiaoRun, ligacoesPorTerminalRun, renderSecoesPorLigacao,
  renderLocalidades,
} from './src/documentos/municipios-localidades.mjs';

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
configurarLookups({ sbFetch });
/* O seam de seleção: clicar numa linha de qualquer lista SELECIONA a linha, fecha o modal e
   avisa. É composição de shell (rota + modal + toast), não markup, e por isso não desce para o
   módulo — desce a AÇÃO, uma vez. `selectLine`/`closeModal`/`toast` são `function` (hoisted).
   O `activeLine` lido no toast é o de DEPOIS do `selectLine`, de propósito: é a linha que
   acabou de ser escolhida, com o formato já normalizado pelo `setActiveLine`. */
configurarListas({ aoSelecionarLinha: row => {
  selectLine(row); closeModal();
  toast('Linha selecionada: '+(activeLine.nome_ligacao||activeLine.codlinha),'info');
}});
/* Os documentos de `src/documentos/` (Fase C). Quatro coisas: a função de rede, a ação de tornar
   uma linha a ativa, o fabricante de ctx novo e — desde a C4 — o dispatcher de view nova.
   `renderLineHistory` chama a segunda para sincronizar o banner do topo com a linha cujo
   histórico está na tela — é shell, como o `aoSelecionarLinha` acima, e por isso desce injetada
   em vez de o módulo ir buscá-la. O `sbFetch` aqui é ANDAIME: some quando a Fase B criar
   `src/data/rest.mjs` e os documentos passarem a importá-lo. */
// `novoCtx` chega por FECHO (não por referência direta): é `const`, declarada mais abaixo no
// arquivo, e passá-la aqui por valor bateria em TDZ — o bootstrap roda no TOPO do IIFE, antes da
// declaração existir. O fecho só a lê quando de fato CHAMADO, muito depois de o arquivo inteiro
// já ter sido avaliado (nenhum documento abre no load). `runView` é `function` (hoisted) — pode
// ir por referência direta, como `selectLine`.
configurarDocumentos({
  sbFetch, selecionarLinha: selectLine, novoCtx: (view, pane, host) => novoCtx(view, pane, host),
  runView,
});

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

function selecionarSupabase(hostname, config){
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  const hostsProd = (config.hostsProd || []).map(h => String(h).trim().toLowerCase().replace(/\.$/, ''));
  const producao = hostsProd.includes(host);
  const alvo = producao
    ? { url: config.prodUrl,  key: config.prodKey,  ambiente: 'producao' }
    : { url: config.testeUrl, key: config.testeKey, ambiente: 'teste' };
  if (!alvo.url || !alvo.key) {
    throw new Error(`Configuração Supabase ausente para o ambiente de ${alvo.ambiente}.`);
  }
  return Object.freeze({ ...alvo, hostname: host });
}

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

// Teto do PostgREST: `pgrst.db_max_rows` do role `authenticator`. Confirmado contra o banco vivo
// em 09/08/2026 e versionado em docs/backup_schema.sql (bloco LIMITES DE ROLE), além de descrito
// no CLAUDE.md (seção Supabase). Subir o teto exige mudar os TRÊS na mesma tarefa: o banco, esta
// constante e a baseline — a baseline porque um restore sem ela devolve o banco sem teto nenhum,
// e sem sintoma; esta constante porque o marcarTrunc a usa como segundo critério de truncagem.
const SB_MAX_ROWS = 30000;
// Marca (sem alterar o conteúdo) um array de resultados que provavelmente foi CORTADO:
// só sinaliza quando a consulta tinha um limit "de lista" (>=50) e veio cheio até o teto.
// A flag é não-enumerável → JSON.stringify/map/spread ignoram; só quem checa rows._trunc vê.
// O teto efetivo é o MENOR entre o limit pedido e o do servidor: um `limit` maior que
// SB_MAX_ROWS sairia cortado em silêncio pelo critério antigo, porque data.length (30000)
// nunca alcança lim (50000) — sem banner e sem toast. Hoje não dispara (os 5 maiores limits
// do app.js são exatamente 30000); é armadilha armada para a próxima consulta grande.
function marcarTrunc(data, qs){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (m){
    const teto = Math.min(+m[1], SB_MAX_ROWS);
    if (teto >= 50 && data.length >= teto){
      Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
      Object.defineProperty(data, '_limite', { value:teto, enumerable:false });
    }
  }
  return data;
}
// O BANNER que avisa o usuário sobre essa truncagem é markup, não infraestrutura: mora em
// `src/ui/doc.mjs` (`bannerTrunc`). O contrato entre os dois são os campos não-enumeráveis
// `_trunc`/`_limite` marcados logo acima — mexeu num lado, leia o outro.

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
   As **quatro** famílias da Fase C (C1–C4) saíram inteiras — sob CADA uma dessas dez marcas
   sobrou só o registro `LOADERS.*` (one-liner, wrapper fino ou composição de `searchPanel`,
   trabalho de Fase D). A marca fica porque o CARD continua sendo servido daqui — é por ela que
   se acha o registro.
   A marca "Eventos — helpers compartilhados" SUMIU: o markup do evento foi para
   `src/ui/blocos.mjs`, junto com o da tabela de itinerário e o da grade de frota.
   AVISO, medido em 21/08/2026 e ainda NÃO consertado — agora é residual, não mais "quem mover a
   família seguinte conserta a sua" (as quatro já saíram): `LOADERS.empresasRegulares` mora sob
   `DOC · Estrutura Operacional`, `LOADERS.municipioRegiao` mora sob `DOC · Empresas`, e
   `ligacoesPorTerminal`/`secoesPorLigacao` moram sob `DOC · Municípios`. Nenhum dos quatro tem
   corpo de render — são composição/one-liner, então o mau posicionamento da marca é só
   cosmético. **Exceção real:** `LOADERS.frotaPorEmpresa`, também sob `DOC · Municípios`, TEM
   corpo de render completo — é o loader órfão que a Fase C4 mediu e decidiu não mover (não é
   Município nem Localidade por conteúdo NEM por categoria — o `SECTIONS` o lista sob "Empresa",
   já C3; ver o cabeçalho de `src/documentos/municipios-localidades.mjs`). Não dimensione nada
   por marca: meça por SÍMBOLO.
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

/* ---- Consultas (por logradouro, terminal, localidade, município) ----
   Os três `LOADERS.*` abaixo FICAM: cada um monta `selectOpts`/`suggest` de um lookup ANTES de
   chamar `searchPanel` (shell reservado à Fase E) — têm CORPO, mesmo padrão de
   `LOADERS.tarifas`/`quadroHorarios`. O `onRun` de cada um virou `xxxRun`, exportado por
   `src/documentos/municipios-localidades.mjs` (Fase C4). */
LOADERS.ligacoesPorLogradouro = async (ctx) => {
  const ibge = await getIbge();
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  searchPanel(ctx, { title:'Ligações por Logradouro', placeholder:'Nome da via / logradouro', selectOpts:[['','Todos os municípios'],...munOpts],
    onRun: (term, rctx, ibgeCod) => ligacoesPorLogradouroRun(rctx, term, ibgeCod) });
};
LOADERS.municipioRegiao = async (ctx) => {
  const ibge = await getIbge();
  // Região Programa clássica (regiao_municipio) — é a classificação do print DETRO.
  const regioes = [...new Set(Object.values(ibge).map(x=>x.regiaoPrograma).filter(Boolean))].sort();
  searchPanel(ctx, { title:'Município e Região', placeholder:'Nome do município (ou escolha uma região)', selectOpts:[['','Todas as regiões'],...regioes.map(r=>[r,r])],
    onRun: (term, rctx, region) => municipioRegiaoRun(rctx, term, region), auto:true });
};
/* --- DOC · Municípios / entre-municípios ---------------------------
   `openLinhasPorIbge`, `linhasNoMunicipio`, `mostrarLinhasResultado`, `mostrarLinhasEntreMunicipios`
   e os três `xxxRun` de cima moraram para `src/documentos/municipios-localidades.mjs` na Fase C4
   — junto com a metade Localidades (as duas compartilham markup; ver o cabeçalho do módulo). */
LOADERS.ligacoesPorTerminal = async (ctx) => {
  const [orig, ibge, terminais] = await Promise.all([getOrigem(), getIbge(), getTerminais()]);
  const munOpts = Object.entries(ibge).sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'')).map(([cod,v])=>[cod, v.nome]);
  const nomesOrigem = [...new Set(Object.values(orig).filter(Boolean))];
  const nomesTerminal = [...new Set(terminais.map(r=>r.nome_logradouro).filter(Boolean))];
  const nomesTodos = [...new Set([...nomesOrigem, ...nomesTerminal])].sort((a,b)=>a.localeCompare(b));
  const suggest = q => { const nq=norm(q); return nomesTodos.filter(n=>norm(n).includes(nq)); };
  searchPanel(ctx, { title:'Ligações por Terminais', placeholder:'Nome do terminal / origem', selectOpts:[['','Todos os municípios'],...munOpts], suggest,
    onRun: (term, rctx, ibgeCod) => ligacoesPorTerminalRun(rctx, term, ibgeCod) });
};
LOADERS.secoesPorLigacao = renderSecoesPorLigacao;

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

/* --- DOC · Localidades --------------------------------------------
   `getLocalidades`/`termosLocalidade`/`codsPorLocalidade`/`mostrarLinhasPorLocalidade`/
   `LOC_FILTERS` e o corpo inteiro do antigo `LOADERS.localidades` (que não passa por
   `searchPanel` — tem formulário próprio) moraram para
   `src/documentos/municipios-localidades.mjs` na Fase C4. `LOADERS.localidades` virou o
   one-liner `renderLocalidades`, mesmo padrão de `LOADERS.portarias` (C2). */
LOADERS.localidades = renderLocalidades;

/* ================================================================
   COMPONENTES AUXILIARES (painel de busca reutilizável)
   ================================================================ */
// A PAGINAÇÃO mora em módulos: o núcleo agnóstico de conteúdo (`paginate`, `paginateTable`,
// `paginateEvents`) em `src/ui/paginacao.mjs`, e a família de listas de LINHA
// (`situacaoSelectHTML`, `linhasTable`, `bindLineRows`, `paginateLines`, `lineResults`) em
// `src/ui/listas.mjs`, que recebe a ação de clicar numa linha pelo `configurarListas` do
// bootstrap. Ver docs/estrutura-frontend.md §4.
// `distinctCods`/`fetchLinesByCods` e o render "seções por localidade/município"
// (`secoesLocalidadeTable`/`renderLocalidadeSecoes`/`locLinhaSecHTML`/`locComSecaoHTML`/
// `LOC_SEM_SECAO_OBS`/`pintarLocalidadeSecoes`) moraram para
// `src/documentos/municipios-localidades.mjs` na Fase C4 — toda chamada a eles vinha de dentro
// daquela família, então não há binding morto a limpar aqui.
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
