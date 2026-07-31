'use strict';
/* GATE DE PRÉ-PUBLICAÇÃO — rode `node tests/check.js` antes de publicar.
   Faz, em sequência, e agrega o resultado:
     [1] valida a SINTAXE do app.js (sem executar o código) e garante que o
         index.html NÃO tem <script> inline (a CSP publica script-src 'self');
     [2] guarda anti-drift: confere que as funções copiadas nos *.harness.js ainda
         existem iguais no app.js (avisa se a original mudou e a cópia ficou velha);
     [3] roda todos os *.test.js desta pasta.
   Sai com código != 0 se QUALQUER etapa falhar. Node puro, sem dependências. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const TESTS_DIR = __dirname;
const INDEX = path.join(__dirname, '..', 'index.html');
const APPJS = path.join(__dirname, '..', 'app.js');
const CSS   = path.join(__dirname, '..', 'styles.css');

let problems = 0;
const fail   = msg => { console.log('  ✗', msg); problems++; };
const okline = msg => console.log('  ✓', msg);

const html = fs.readFileSync(INDEX, 'utf8');
const js   = fs.readFileSync(APPJS, 'utf8');
const css  = fs.readFileSync(CSS, 'utf8');

// ---------- [1] sintaxe do app.js + nenhum <script> inline no index.html ----------
console.log('\n[1] Sintaxe do app.js + index.html sem <script> inline');
try {
  new vm.Script(js, { filename: 'app.js' });                    // só COMPILA — não roda
  okline(`sintaxe OK (${js.split('\n').length} linhas em app.js)`);
} catch (e){
  const first = String(e.stack || '').split('\n')[0];
  const mm = /:(\d+)\s*$/.exec(first);
  fail(`erro de sintaxe no app.js${mm ? ` (linha ${mm[1]})` : ''}: ${e.message}`);
}
// guard anti-regressão da CSP: script-src é 'self' (sem 'unsafe-inline') —
// qualquer <script> sem src= no index.html seria BLOQUEADO no navegador.
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
  fail('<script> inline no index.html — a CSP (script-src \'self\') bloqueia; mova o código para o app.js.');
} else {
  okline('index.html sem <script> inline (compatível com a CSP)');
}

// Irmã da guarda acima, para o outro eixo da CSP: desde 27/07/2026 o style-src é 'self' com
// `style-src-attr 'none'`, então atributo `style=` em markup é IGNORADO pelo navegador (medido
// em Chromium headless — markup e setAttribute bloqueados, CSSOM liberado). O sintoma de uma
// recaída é mudo: a largura/o esconder simplesmente não acontece, sem erro no console.
// Só o ATRIBUTO é proibido; `el.style.x = …` continua legítimo (é como o dropdown se posiciona).
// A varredura cobre index.html E os templates do app.js — foi lá que estavam 7 dos 10 casos.
const styleAttr = /(?<!\/\/[^\n]{0,200})<[a-z][^>]*\sstyle\s*=\s*["'`]/i;
const semComentarios = src => src.replace(/^\s*(\/\/|--).*$/gm, '');
let styleInline = 0;
for (const [nome, src] of [['index.html', html], ['app.js', semComentarios(js)]]){
  if (styleAttr.test(src)){
    const linha = src.split('\n').findIndex(l => /<[a-z][^>]*\sstyle\s*=\s*["'`]/i.test(l)) + 1;
    fail(`[${nome}:${linha}] atributo style= em markup — a CSP (style-src-attr 'none') ignora; use classe no styles.css (ou el.style.x via JS, que é permitido).`);
    styleInline++;
  }
}
if (!styleInline) okline("index.html e app.js sem atributo style= (compatível com style-src-attr 'none')");

// Largura de coluna: todo `w:'…'` do app.js precisa de classe correspondente no styles.css.
// Sem isto, uma largura nova vira `class="w-999"` que não existe e a coluna sai torta EM
// SILÊNCIO — o modo de falha exato que a troca de style= por classe introduziu.
{
  const larguras = [...js.matchAll(/\bw:\s*'(\d+(?:px|%))'/g)].map(m => m[1]);
  const faltando = [...new Set(larguras)]
    .map(w => `w-${w.replace('px','').replace('%','p')}`)
    .filter(cls => !new RegExp(`\\.${cls}\\{`).test(css));
  if (faltando.length) fail(`larguras de coluna sem classe em styles.css: ${faltando.join(', ')}`);
  else okline(`larguras de coluna com classe (${new Set(larguras).size} distintas)`);
}

// ---------- [1b] nenhuma chave service_role nos arquivos servidos ----------
// A chave anon (role=anon) é pública por design; a service_role IGNORA o RLS e
// jamais pode ir para um arquivo entregue ao cliente. Decodifica cada JWT do
// index.html e do app.js e falha se algum tiver role=service_role (sem
// falso-positivo na palavra "service_role" de comentários/docs).
console.log('\n[1b] Segredo: nenhuma JWT service_role no index.html/app.js');
{
  const jwts = (html + '\n' + js).match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+/g) || [];
  let vazou = false;
  for (const tok of jwts){
    try {
      const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      if (payload && payload.role === 'service_role') vazou = true;
    } catch (_) { /* token não-JWT: ignora */ }
  }
  if (vazou) fail('CHAVE service_role embutida em arquivo servido — ignora o RLS, NÃO publicar.');
  else okline(`ok (${jwts.length} token(s) JWT, nenhum service_role)`);
}

// ---------- [2] guarda anti-drift ----------
console.log('\n[2] Guarda anti-drift (cópias verbatim batem com o app.js)');
// trecho distintivo de cada função copiada nos harness; se sumir do app.js,
// a cópia no harness provavelmente ficou desatualizada.
const canon = [
  ['fmtCode',              's.slice(3,6)'],
  ['fmtTime',             'm[1]}:${m[2]}'],
  ['fmtDate',       'm[3]}/${m[2]}/${m[1]}'],
  ['esc',                  "'&':'&amp;'"],
  ['enc',                  'const enc = s => encodeURIComponent(s);'],
  // ilikeTerm é o saneador que neutraliza ( ) * antes de entrar no filtro or=() do
  // PostgREST — os testes dele rodam contra a CÓPIA, então o trecho vigiado é a
  // declaração INTEIRA: qualquer mudança no saneador tem de derrubar este gate.
  ['ilikeTerm',            "const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));"],
  ['orDash',               "==='') ? '—'"],
  ['fmtLineName',          "split(' - ').map(p => p.replace(/ /g, '&nbsp;'))"],
  ['byCodlinha',           "localeCompare(String(b.codlinha||''), undefined, { numeric:true })"],
  ['boolChip',             'chip chip-on'],
  ['situacaoHTML',         'const situacaoHTML = r => r.cancelado'],
  ['isLinhaAtiva',         'const isLinhaAtiva = r => !r.cancelado && !r.paralisado;'],
  ['isVigente',            'const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;'],
  ['norm',                 "normalize('NFD')"],
  ['yearOf',               'parseInt(String(d).slice(0,4),10)'],
  ['matchEvent',           'function matchEvent(r, c){'],
  ['groupBy',              'if(!m.has(k))m.set(k,[])'],
  ['countBy',              '(m.get(k)||0)+1'],
  ['fmtMoney',             'minimumFractionDigits:2,maximumFractionDigits:2'],
  ['classifyMunLines',     'function classifyMunLines('],
  ['terminaisDoMunicipio', 'function terminaisDoMunicipio(itRows, codibge){'],
  ['localidadesQueCasam',  'function localidadesQueCasam('],
  ['orIlike',              "const orIlike = (cols, termos) => 'or=('"],
  ['municipiosExatos',     'function municipiosExatos(ibge, termos){'],
  ['tabMatchesEvent',      'function tabMatchesEvent(tab, table, payload){'],
  ['dispatchRealtime',     'function dispatchRealtime(tabs, activeTabId, table, payload){'],
  ['beginGen',              'view._gen = (view._gen || 0) + 1;'],
  ['isCurrentGen',          'return !!view && gen === view._gen;'],
  ['commitViewResult',      "if (!isCurrentGen(view, gen)) return false;"],
  ['pushDetail',            "view._detail = { pdfHTML: view.pdfHTML };"],
  ['popDetail',             "view.pdfHTML = view._detail.pdfHTML;"],
  // --- cópias do harness.js (seção SUPABASE CONFIG) ---
  // Estavam SEM guarda até 27/07/2026: a auditoria anterior fechou o laço para o
  // pure.harness.js e o harness.js ficou de fora — 8 dos 9 exports descobertos, incluindo
  // marcarTrunc/bannerTrunc, com 28 testes rodando contra cópias que nada garantia estarem
  // atualizadas. Mesmo bug do `ilikeTerm`, um arquivo ao lado.
  ['sbFetch',              "async function sbFetch(table, qs = '', sinal) {"],
  ['selecionarSupabase',   'function selecionarSupabase(hostname, config){'],
  ['SB_RETRIES',           'const SB_RETRIES    = 2;'],
  ['esperar',              'const esperar = ms => new Promise'],
  ['fetchComTimeout',      'async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS, sinal){'],
  ['SB_TIMEOUT_MS',        'const SB_TIMEOUT_MS = 20000;'],
  ['marcarTrunc',          'function marcarTrunc(data, qs){'],
  ['bannerTrunc',          'function bannerTrunc(rows){'],
  // CANCELADO/ehCancelamento sustentam o cancelamento de busca obsoleta (SEC-02): se a
  // distinção entre "cancelei" e "deu timeout" sumir do app.js, os testes que a provam
  // continuariam verdes contra a cópia.
  ['CANCELADO',            "const CANCELADO = 'RequisicaoCancelada';"],
  ['ehCancelamento',       'const ehCancelamento = e => e && e.name === CANCELADO;'],
  ['rjOrder',              'function rjOrder(a, b){'],
  ['resumoFrota',          'function resumoFrota(rows){'],
  ['filtrarFrotaEmpresas', "function filtrarFrotaEmpresas(items, status='ativas', termo=''){"],
  ['pageBounds',           'const p = Math.min(Math.max(1, (page|0) || 1), totalPages);'],
  ['MAX_TABS',             'const MAX_TABS = 5;'],
  ['makeTab',              'function makeTab(id){ return { id, line: null, view: null, navStack: [], stale: false }; }'],
  ['openTabState',         'function openTabState(tabs, tabIdSeq){'],
  ['closeTabState',        'function closeTabState(tabs, activeTabId, id){'],
];
for (const [name, snippet] of canon){
  if (js.includes(snippet)) okline(`${name}`);
  else fail(`harness DESATUALIZADO p/ "${name}": não achei no app.js → ${snippet}`);
}

// A guarda acima só vale para quem está no `canon`. Uma cópia exportada pelo harness SEM
// entrada aqui passa batido — foi o que aconteceu com `ilikeTerm` e `MAX_TABS` (37 cópias
// exportadas × 36 guardas; descoberto na auditoria externa de 27/07/2026, contando à mão).
// Esta checagem fecha o laço: cada símbolo exportado por um harness tem de ter guarda.
//
// Varre os DOIS harness. Na primeira versão varria só o pure.harness.js, e o harness.js ficou
// descoberto — 8 dos 9 exports sem guarda, achado em 27/07/2026 ao mexer no sbFetch. Fechar o
// laço num arquivo e deixar o irmão aberto é o mesmo bug, adiado. Harness NOVO entra aqui.
{
  const HARNESSES = ['pure.harness.js', 'harness.js'];
  const guardados = new Set(canon.map(([n]) => n));
  let totalExportados = 0, falhou = false;
  for (const arquivo of HARNESSES){
    const src = fs.readFileSync(path.join(TESTS_DIR, arquivo), 'utf8');
    const m = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!m){ fail(`não achei o module.exports do ${arquivo} (a cobertura do canon não pôde ser conferida)`); falhou = true; continue; }
    const exportados = m[1].split(',').map(s => s.trim()).filter(Boolean)
      // `get X(){…}` / `set X(v){…}`: o nome é o 2º token, não o 1º.
      .map(s => s.replace(/^(?:get|set)\s+/, '').split(/[:(]/)[0].trim())
      .filter(Boolean);
    totalExportados += new Set(exportados).size;
    const semGuarda = [...new Set(exportados)].filter(n => !guardados.has(n));
    if (semGuarda.length){
      fail(`[${arquivo}] cópia exportada sem guarda anti-drift: ${semGuarda.join(', ')} — adicione ao \`canon\` do check.js`);
      falhou = true;
    }
  }
  if (!falhou) okline(`cobertura do canon (${totalExportados} cópias exportadas nos ${HARNESSES.length} harness, todas com guarda)`);
}

// ---------- [2b] guarda docs × código ----------
// Irmã offline do scripts/check_deriva.mjs. Ele guarda docs × BANCO (tabelas, colunas, RPCs);
// esta guarda o eixo que ficava descoberto: docs × CÓDIGO. As duas nascem da mesma causa —
// fato copiado à mão para a prosa e nunca mais conferido. A auditoria externa de 27/07/2026
// achou 6 derivas desse tipo, todas plantadas pela extração de 21-22/07 (JS/CSS saíram do
// index.html), e nenhuma ferramenta do repo era capaz de vê-las.
//
// Só policia os docs VIVOS. O CHANGELOG, os `analise-*.md` e os `revisao-externa-*.md` são
// snapshots datados de propósito: os números deles descrevem o estado de quando foram
// escritos, e cobrá-los transformaria esta guarda em alarme falso.
console.log('\n[2b] Deriva docs × código');
{
  const RAIZ = path.join(__dirname, '..');
  const ler = p => fs.readFileSync(path.join(RAIZ, p), 'utf8');
  const existe = p => fs.existsSync(path.join(RAIZ, p));

  // As ADRs entraram em 31/07/2026, depois de a auditoria cruzada achar que a ADR-0002 ainda
  // dizia "somente `divatdetro.vercel.app` … usa produção" enquanto o HOSTS_PROD já tinha três
  // hosts — a MESMA deriva que o gate corrigiu no CLAUDE.md dias antes. Ela sobreviveu porque
  // `docs/adr/` não estava aqui, e por isso as ADRs escapavam de TODAS as guardas do [2b]:
  // fatos numéricos, links, SB_URL/SB_KEY e @font-face. ADR é documento vivo e prescritivo —
  // alguém a lê para decidir. São lidas do diretório, não listadas à mão, senão a ADR-0004
  // nasceria fora do gate pelo mesmo motivo que as três primeiras ficaram.
  const ADRS = existe('docs/adr')
    ? fs.readdirSync(path.join(RAIZ, 'docs/adr')).filter(f => f.endsWith('.md')).sort()
        .map(f => `docs/adr/${f}`)
    : [];
  const DOCS_VIVOS = ['CLAUDE.md', 'README.md', 'CONTEXT.md', 'docs/estrutura-frontend.md',
    'docs/schema.md', 'docs/backup.md', 'docs/seguranca.md', 'docs/semgrep.md',
    'docs/agents/domain.md', 'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md',
    'tests/README.md', ...ADRS].filter(existe);

  // Comentário de workflow é prosa viva como qualquer outra — e prosa que ninguém relê, porque
  // não abre em leitor de markdown. A 1ª versão desta guarda varria só `.md`, e por isso o
  // `views.yml` pôde afirmar "23 views" e "~62% do app.js" (medido: 17 e ~58,8%) por dias, com o
  // gate verde. Achado da auditoria preliminar de 30/07/2026. Os `.yml` entram SÓ na conferência
  // de fatos numéricos: link markdown e `SB_URL` não são a linguagem deles.
  const WORKFLOWS = existe('.github/workflows')
    ? fs.readdirSync(path.join(RAIZ, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)).sort()
        .map(f => `.github/workflows/${f}`)
    : [];

  // --- fatos computados do CÓDIGO (a fonte da verdade) ---
  const linhasApp = js.split('\n').length;
  const linhasArr = js.split('\n');
  const marcas = [];
  linhasArr.forEach((l, i) => { if (/^\/\* ={10,}/.test(l)) marcas.push({ i, titulo: (linhasArr[i + 1] || '').trim() }); });
  const iModal = marcas.findIndex(m => m.titulo === 'MODAL / SISTEMA DE VIEWS');
  const modalLinhas = (iModal >= 0 && marcas[iModal + 1]) ? marcas[iModal + 1].i - marcas[iModal].i : null;
  const modalPct = modalLinhas == null ? null : Math.round(modalLinhas / linhasApp * 1000) / 10;

  const bloco = (txt, re) => { const m = txt.match(re); return m ? m[1] : null; };
  const conta = (txt, re, item) => { const b = bloco(txt, re); return b == null ? null : (b.match(item) || []).length; };

  const views = existe('scripts/check_views.mjs')
    ? conta(ler('scripts/check_views.mjs'), /const VIEWS\s*=\s*\[([\s\S]*?)^\];/m, /\bkey\s*:/g) : null;
  const rtTables = conta(js, /RT_TABLES\s*=\s*\[([\s\S]*?)\]/, /'[a-z_]+'/g);
  // O inventário saiu do backup_rest.mjs para scripts/lib/tabelas.mjs em 31/07/2026, quando o
  // restore_rest.mjs passou a precisar do mesmo mapa. Este extrator seguiu junto — e note que a
  // mudança NÃO passou despercebida: o gate acusou "a guarda ficou cega" em vez de continuar
  // verde contando zero, que é o que uma guarda mal escrita teria feito.
  const bk = existe('scripts/lib/tabelas.mjs') ? ler('scripts/lib/tabelas.mjs') : '';
  const bkTodas = bk ? conta(bk, /export const PK\s*=\s*\{([\s\S]*?)^\};/m, /^\s*[a-z_]+\s*:/gm) : null;
  const bkStaging = bk ? conta(bk, /export const STAGING\s*=\s*new Set\(\[([\s\S]*?)\]\)/, /'[a-z_]+'/g) : null;
  const bkPublicas = (bkTodas != null && bkStaging != null) ? bkTodas - bkStaging : null;
  // Quantidade de workflows e de hosts de produção. As duas entraram em 31/07/2026, depois de a
  // auditoria cruzada achar que o README anunciava "6 workflows" (eram 7 — faltava o
  // deploy-smoke.yml) e que o CLAUDE.md dizia "somente divatdetro.vercel.app usa produção"
  // enquanto HOSTS_PROD já tinha 3 domínios. Os dois fatos são contáveis e ninguém os contava:
  // é exatamente o vão que o [2b] existe para cobrir, e ficou aberto porque a tabela só olhava
  // o que a extração de 21-22/07 tinha sujado.
  const nWorkflows = WORKFLOWS.length || null;
  const nHostsProd = conta(js, /HOSTS_PROD\s*=\s*\[([\s\S]*?)\]/, /'[^']+'/g);

  // --- fatos que os docs AFIRMAM (regex contra o texto com espaços normalizados,
  //     para que quebra de linha do markdown não escape da checagem) ---
  // Em `.yml` o marcador `#` do comentário é removido ANTES de normalizar o espaço: um comentário
  // longo quebra em várias linhas, cada uma recomeçando com `#`, e sem tirá-lo a frase "Abre as 23
  // \n#  views" nunca casa o regex — a guarda passaria cega, que é pior que não existir.
  const normalizar = (arq, txt) =>
    (/\.ya?ml$/.test(arq) ? txt.replace(/^[ \t]*#[ \t]?/gm, ' ') : txt).replace(/\s+/g, ' ');
  const num = s => parseFloat(String(s).replace(',', '.'));
  const FATOS = [
    { doc:'docs/estrutura-frontend.md', o:'linhas do app.js',      re:/~([\d,.]+)k linhas — extraído do HTML/, real:linhasApp,   esc:'k' },
    { doc:'CLAUDE.md',                  o:'linhas do app.js',      re:/~([\d,.]+)k\s*linhas, num IIFE/,        real:linhasApp,   esc:'k' },
    { doc:'README.md',                  o:'linhas do app.js',      re:/~([\d,.]+)k linhas num IIFE/,           real:linhasApp,   esc:'k' },
    { doc:'docs/estrutura-frontend.md', o:'linhas da seção MODAL', re:/é ~[\d,.]+% do JS \(~([\d,.]+)k linhas/, real:modalLinhas, esc:'k' },
    { doc:'docs/estrutura-frontend.md', o:'% da seção MODAL',      re:/é ~([\d,.]+)% do JS/,                   real:modalPct,    esc:'pct' },
    { doc:'CLAUDE.md',                  o:'% da seção MODAL',      re:/~([\d,.]+)% do `app\.js`/,              real:modalPct,    esc:'pct' },
    { doc:'CLAUDE.md',                  o:'views do check_views',  re:/abre as \*\*([\d]+)\s*views\*\*/,       real:views,       esc:'exato' },
    { doc:'README.md',                  o:'views do check_views',  re:/abre as ([\d]+) views/,                 real:views,       esc:'exato' },
    { doc:'CLAUDE.md',                  o:'tabelas do RT_TABLES',  re:/as ([\d]+) tabelas lidas pelo portal/,  real:rtTables,    esc:'exato' },
    { doc:'docs/backup.md',             o:'tabelas do backup',     re:/as \*\*([\d]+) tabelas\*\*, inclusive staging/, real:bkTodas,   esc:'exato' },
    { doc:'docs/backup.md',             o:'tabelas públicas',      re:/as \*\*([\d]+) tabelas públicas\*\*/,   real:bkPublicas,  esc:'exato' },
    // `doc` pode ser uma LISTA de arquivos: o fato tem de aparecer em pelo menos um deles, e toda
    // ocorrência em qualquer um é conferida. Nos workflows a lista é o diretório inteiro, de
    // propósito — se a frase migrar do `views.yml` para outro workflow, continua coberta.
    { doc:WORKFLOWS, o:'views do check_views (workflows)', re:/([\d]+)\s*views\b/, real:views,   esc:'exato' },
    { doc:WORKFLOWS, o:'% da seção MODAL (workflows)',     re:/~([\d,.]+)% do app\.js/, real:modalPct, esc:'pct' },
    { doc:['README.md','CLAUDE.md'], o:'nº de workflows',  re:/[Oo]s ([\d]+) workflows/,  real:nWorkflows, esc:'exato' },
    { doc:['CLAUDE.md','docs/adr/0002-ambiente-de-teste-isolado.md'],
                                     o:'hosts de produção', re:/os ([\d]+) domínios de produção/, real:nHostsProd, esc:'exato' },
  ];
  // TODA ocorrência é conferida, não só a primeira. A 1ª versão parava no primeiro casamento, e
  // o `views.yml` afirma "23 views" em TRÊS linhas (1, 11 e 71): consertar uma e esquecer as
  // outras deixaria o gate verde com a deriva ainda no arquivo — o mesmo bug, adiado.
  let fatosOk = 0, fatosPulados = 0, ocorrencias = 0;
  for (const f of FATOS){
    const alvos = (Array.isArray(f.doc) ? f.doc : [f.doc]).filter(existe);
    if (!alvos.length) { fatosPulados++; continue; }
    if (f.real == null) { fail(`[${alvos.join(', ')}] não consegui computar "${f.o}" no código — a guarda ficou cega, conserte o extrator`); continue; }
    const gre = new RegExp(f.re.source, f.re.flags.includes('g') ? f.re.flags : f.re.flags + 'g');
    let achou = 0, divergiu = 0;
    for (const alvo of alvos){
      for (const m of normalizar(alvo, ler(alvo)).matchAll(gre)){
        achou++;
        const dito = m[1], d = num(dito);
        let ok, esperado;
        if (f.esc === 'k'){ ok = Math.abs(d * 1000 - f.real) / f.real <= 0.08; esperado = `~${(Math.round(f.real / 100) / 10).toFixed(1).replace('.', ',')}k`; }
        else if (f.esc === 'pct'){ ok = Math.abs(d - f.real) <= 1.5; esperado = `~${String(f.real).replace('.', ',')}%`; }
        else { ok = d === f.real; esperado = String(f.real); }
        if (!ok){
          fail(`[${alvo}] "${f.o}": doc diz ${dito}${f.esc === 'pct' ? '%' : f.esc === 'k' ? 'k' : ''}, código diz ${f.real} (escreva ${esperado})`);
          divergiu++;
        }
      }
    }
    if (!achou) fail(`[${alvos.join(', ')}] não achei a afirmação sobre "${f.o}" — se a frase mudou, atualize o regex em check.js (não apague a guarda)`);
    else { ocorrencias += achou; if (!divergiu) fatosOk++; }
  }
  okline(`fatos numéricos conferidos (${fatosOk}/${FATOS.length - fatosPulados} afirmações, ${ocorrencias} ocorrências)`);

  // --- todo LINK markdown aponta para algo que existe ---
  // Deliberadamente só links `[texto](caminho)`, não qualquer token em backtick: a primeira
  // versão desta checagem varria os backticks e deu 61 falsos positivos contra 0 verdadeiros
  // — confundia nome de função (`fmtCode/fmtTime`), ruleset do Semgrep (`p/xss`), slash
  // command (`/triage`), caminho de sistema (`/opt/...`), diretório gerado (`node_modules/`)
  // e o próprio `package.json`, citado justamente para dizer que NÃO existe. Um gate que
  // grita à toa é um gate que alguém desliga. Link markdown é promessa de navegabilidade:
  // se está quebrado, é defeito, sem julgamento a fazer.
  let refs = 0, quebrados = 0;
  for (const doc of DOCS_VIVOS){
    const base = path.dirname(doc);
    for (const m of ler(doc).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)){
      const bruto = m[1].split('#')[0].trim();
      if (!bruto || /^(https?|mailto):/.test(bruto)) continue;
      refs++;
      const alvo = path.posix.normalize(path.posix.join(base === '.' ? '' : base, bruto)).replace(/\/$/, '');
      if (!existe(alvo)) { fail(`[${doc}] link para "${m[1]}" está quebrado (resolvido: ${alvo})`); quebrados++; }
    }
  }
  if (!quebrados) okline(`links markdown resolvem (${refs} links em ${DOCS_VIVOS.length} docs)`);

  // --- SB_URL/SB_KEY nunca mais apontados para o index.html ---
  // A deriva concreta: o passo 5 do runbook de restauração mandava editá-los no index.html
  // por 6 dias depois de eles terem ido para o app.js. Num runbook de perda total, isso
  // custa tempo exatamente quando não há tempo.
  // Escape hatch: prosa que RECONTA o bug histórico ("o runbook mandava editar no index.html")
  // é legítima e a regra não sabe distinguir isso de uma instrução. Quem recontar marca a linha
  // com `<!-- deriva-ok: <motivo> -->` (invisível no markdown renderizado). A regra fica
  // estrita; a exceção fica explícita e visível no fonte, para quem revisar o diff.
  let sbErrado = 0;
  for (const doc of DOCS_VIVOS){
    ler(doc).split('\n').forEach((l, i) => {
      if (/deriva-ok/.test(l)) return;
      if (/SB_URL|SB_KEY/.test(l) && /index\.html/.test(l)){
        fail(`[${doc}:${i + 1}] associa SB_URL/SB_KEY ao index.html — elas moram no topo do app.js (se a linha reconta o bug histórico, marque com \`<!-- deriva-ok: histórico -->\`)`);
        sbErrado++;
      }
    });
  }
  if (!sbErrado) okline('SB_URL/SB_KEY sempre atribuídas ao app.js');

  // --- ninguém afirma que só UM host usa produção quando HOSTS_PROD tem vários ---
  // Guarda de PADRÃO DE ERRO, não de número — e ela nasceu de a guarda numérica ter falhado.
  // Em 31/07/2026 as ADRs entraram em DOCS_VIVOS justamente porque a ADR-0002 carregava a deriva
  // do HOSTS_PROD; mas o gate seguiu VERDE, porque o fato `hosts de produção` da tabela FATOS só
  // olha o CLAUDE.md e só casa uma frase que traz o número. A ADR afirma o mesmo fato em prosa,
  // sem número — invisível. Guarda que só sabe conferir número não cobre quem escreve por
  // extenso, e "somente X usa produção" é como um humano naturalmente escreve isso.
  // Por isso esta pergunta ao CÓDIGO quantos hosts existem e cobra a prosa que diz "só um".
  // Casa por SENTENÇA no texto com espaço normalizado, não linha a linha: a frase da ADR-0002
  // quebra em duas linhas ("somente `divatdetro.vercel.app` … usa" / "produção; qualquer outro
  // host usa teste"), e a 1ª versão desta guarda, que olhava linha a linha, passou VERDE por
  // isso. Mesmo motivo pelo qual a tabela FATOS normaliza espaço antes de casar.
  // A isenção existe porque a prosa CORRETA também usa "só": "só os 3 domínios de produção …
  // usam produção" casaria os três termos. O que separa certo de errado é a frase declarar a
  // contagem — então sentença que traz o número certo (ou fala no plural) não é erro.
  let hostErrado = 0;
  if (nHostsProd != null && nHostsProd > 1){
    for (const doc of DOCS_VIVOS){
      const sentencas = ler(doc).replace(/\s+/g, ' ').split(/(?<=[.;])\s+/);
      for (const s of sentencas){
        if (/deriva-ok/.test(s)) continue;
        if (!/\b(somente|apenas|só)\b/i.test(s)) continue;
        if (!/divatdetro\.vercel\.app/.test(s) || !/produção/.test(s)) continue;
        if (new RegExp(`\\b${nHostsProd}\\b`).test(s) || /\bdomínios\b|\bhosts\b/i.test(s)) continue;
        fail(`[${doc}] reduz a produção a um host só: "${s.trim().slice(0, 90)}…" — HOSTS_PROD tem ${nHostsProd} (se reconta o bug histórico, marque com \`<!-- deriva-ok: histórico -->\`)`);
        hostErrado++;
      }
    }
    if (!hostErrado) okline(`nenhum doc reduz os ${nHostsProd} hosts de produção a um só`);
  }

  // --- os @font-face moram onde a prosa diz que moram ---
  // Mesma família da regra acima, e pela mesma razão: a extração do CSS de 21-22/07/2026 levou os
  // `@font-face` do `<style>` do index.html para o styles.css, e a prosa do README e do CLAUDE.md
  // continuou apontando para o index.html — achado 7 da auditoria cruzada de 31/07/2026. É uma
  // afirmação de LOCALIZAÇÃO, não um número, então não cabe na tabela FATOS; e é exatamente o tipo
  // de fato que a extração de arquivo suja e ninguém relê. A regra pergunta ao código quem de fato
  // declara `@font-face` e cobra a prosa contra isso, em vez de fixar "styles.css" no gate — assim
  // ela continua valendo se um dia as fontes mudarem de arquivo de novo.
  const CANDIDATOS_FONTE = ['styles.css', 'index.html'];
  const declaramFonte = CANDIDATOS_FONTE.filter(f => existe(f) && /@font-face/.test(ler(f)));
  let fonteErrado = 0;
  if (declaramFonte.length === 1){
    const certo = declaramFonte[0];
    const errado = CANDIDATOS_FONTE.find(f => f !== certo);
    for (const doc of DOCS_VIVOS){
      ler(doc).split('\n').forEach((l, i) => {
        if (/deriva-ok/.test(l)) return;
        if (/@font-face/.test(l) && new RegExp(errado.replace('.', '\\.')).test(l)){
          fail(`[${doc}:${i + 1}] diz que os @font-face estão no ${errado} — eles estão no ${certo}`);
          fonteErrado++;
        }
      });
    }
    if (!fonteErrado) okline(`@font-face declarados no ${certo}, e a prosa concorda`);
  } else {
    fail(`@font-face declarado em ${declaramFonte.length} arquivo(s) (${declaramFonte.join(', ') || 'nenhum'}) — a guarda ficou cega, conserte o extrator`);
  }

  // --- o baseline de qualidade dos dados é legível offline ---
  // O check_data_quality.mjs só roda no cron semanal (precisa de rede). Um baseline malformado
  // ou com entrada incompleta só apareceria uma semana depois, e o gate semanal falharia por
  // motivo errado. Conferir aqui custa nada.
  if (existe('scripts/data_quality_baseline.json')){
    try {
      const b = JSON.parse(ler('scripts/data_quality_baseline.json'));
      if (!Array.isArray(b.achados)) throw new Error('campo "achados" não é um array');
      const ruim = b.achados.filter(a => !a.verificacao || !a.detalhe || !a.severidade || !Number.isFinite(a.qtd));
      if (ruim.length) throw new Error(`${ruim.length} entrada(s) sem verificacao/detalhe/severidade/qtd`);
      okline(`baseline de qualidade dos dados válido (${b.achados.length} achado(s) de dívida registrada)`);
    } catch (e){
      fail(`scripts/data_quality_baseline.json inválido: ${e.message}`);
    }
  }

  // --- o baseline de segurança é legível offline ---
  // Mesma razão do de cima, com um agravante: este baseline registra EXCEÇÕES de segurança
  // aceitas. Se ele ficar ilegível, o check_grants.mjs aborta e o gate diário some — e um gate
  // que some não avisa que sumiu.
  if (existe('scripts/security_baseline.json')){
    try {
      const b = JSON.parse(ler('scripts/security_baseline.json'));
      if (!Array.isArray(b.achados)) throw new Error('campo "achados" não é um array');
      const ruim = b.achados.filter(a => !a.tipo || !a.alvo || !a.detalhe);
      if (ruim.length) throw new Error(`${ruim.length} entrada(s) sem tipo/alvo/detalhe`);
      okline(`baseline de segurança válido (${b.achados.length} exceção(ões) aceita(s))`);
    } catch (e){
      fail(`scripts/security_baseline.json inválido: ${e.message}`);
    }
  }

  // --- nenhum arquivo termina com tag de ferramenta de sessão de IA vazada ---
  // Dois docs terminavam com </content> (e um com </invoke>): sobra de chamada de ferramenta
  // que virou conteúdo do arquivo. Só sobrevive porque ninguém releu o arquivo até o fim.
  const varrer = dir => fs.readdirSync(path.join(RAIZ, dir), { withFileTypes:true }).flatMap(e => {
    const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) return (e.name === '.git' || e.name === 'node_modules' || e.name === 'vendor') ? [] : varrer(rel);
    return /\.(md|sql|js|mjs|css|html|json|yml|yaml|sh)$/.test(e.name) ? [rel] : [];
  });
  let vazadas = 0;
  for (const f of varrer('.')){
    const fim = ler(f).trimEnd().split('\n').slice(-3);
    for (const l of fim){
      if (/^\s*<\/(content|invoke|parameter|function_calls|antml:[a-z_]+)>\s*$/.test(l)){
        fail(`[${f}] termina com tag de ferramenta vazada: ${l.trim()}`); vazadas++;
      }
    }
  }
  if (!vazadas) okline('nenhum arquivo termina com tag de ferramenta vazada');
}

// ---------- [3] roda os testes unitários ----------
console.log('\n[3] Testes unitários (*.test.js)');
const testFiles = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.test.js')).sort();
if (!testFiles.length) fail('nenhum arquivo *.test.js encontrado');
for (const f of testFiles){
  const res = spawnSync(process.execPath, [path.join(TESTS_DIR, f)], { encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  const placar = (out.match(/==== PLACAR: ([\d/]+) ====/) || [])[1] || '?';
  if (res.status === 0){
    okline(`${f} — placar ${placar}`);
  } else {
    fail(`${f} — FALHOU (placar ${placar}, exit ${res.status})`);
    out.split('\n').filter(l => /FALHA|FAIL|Error/.test(l)).forEach(l => console.log('       ', l));
  }
}

// ---------- resumo ----------
console.log('\n' + (problems ? `✗ check.js: ${problems} problema(s) — NÃO publique.` : '✓ check.js: tudo verde.'));
process.exit(problems ? 1 : 0);
