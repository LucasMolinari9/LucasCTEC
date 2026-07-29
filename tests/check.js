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
  ['resumoRelatorio',      'function resumoRelatorio(rows){'],
  ['resumoFrota',          'function resumoFrota(rows){'],
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

  const DOCS_VIVOS = ['CLAUDE.md', 'README.md', 'CONTEXT.md', 'docs/estrutura-frontend.md',
    'docs/schema.md', 'docs/backup.md', 'docs/seguranca.md', 'docs/semgrep.md',
    'docs/agents/domain.md', 'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md',
    'tests/README.md'].filter(existe);

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
  const bk = existe('scripts/backup_rest.mjs') ? ler('scripts/backup_rest.mjs') : '';
  const bkTodas = bk ? conta(bk, /const TABELAS\s*=\s*\{([\s\S]*?)^\};/m, /^\s*[a-z_]+\s*:/gm) : null;
  const bkStaging = bk ? conta(bk, /const STAGING\s*=\s*new Set\(\[([\s\S]*?)\]\)/, /'[a-z_]+'/g) : null;
  const bkPublicas = (bkTodas != null && bkStaging != null) ? bkTodas - bkStaging : null;

  // --- fatos que os docs AFIRMAM (regex contra o texto com espaços normalizados,
  //     para que quebra de linha do markdown não escape da checagem) ---
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
  ];
  let fatosOk = 0, fatosPulados = 0;
  for (const f of FATOS){
    if (!existe(f.doc)) { fatosPulados++; continue; }
    if (f.real == null) { fail(`[${f.doc}] não consegui computar "${f.o}" no código — a guarda ficou cega, conserte o extrator`); continue; }
    const txt = ler(f.doc).replace(/\s+/g, ' ');
    const dito = bloco(txt, f.re);
    if (dito == null) { fail(`[${f.doc}] não achei a afirmação sobre "${f.o}" — se a frase mudou, atualize o regex em check.js (não apague a guarda)`); continue; }
    const d = num(dito);
    let ok, esperado;
    if (f.esc === 'k'){ ok = Math.abs(d * 1000 - f.real) / f.real <= 0.08; esperado = `~${(Math.round(f.real / 100) / 10).toFixed(1).replace('.', ',')}k`; }
    else if (f.esc === 'pct'){ ok = Math.abs(d - f.real) <= 1.5; esperado = `~${String(f.real).replace('.', ',')}%`; }
    else { ok = d === f.real; esperado = String(f.real); }
    if (ok) fatosOk++;
    else fail(`[${f.doc}] "${f.o}": doc diz ${dito}${f.esc === 'pct' ? '%' : f.esc === 'k' ? 'k' : ''}, código diz ${f.real} (escreva ${esperado})`);
  }
  okline(`fatos numéricos conferidos (${fatosOk}/${FATOS.length - fatosPulados})`);

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
