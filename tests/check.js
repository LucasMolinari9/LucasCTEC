'use strict';
/* GATE DE PRÉ-PUBLICAÇÃO — rode `node tests/check.js` antes de publicar.
   Faz, em sequência, e agrega o resultado:
     [1] valida a SINTAXE do app.js (sem executar o código) e garante que o
         index.html NÃO tem <script> inline (a CSP publica script-src 'self');
    [1c] confere que nenhum `env:` de workflow tem duas chaves que só diferem em
         maiúsculas — o GitHub rejeita o workflow e o run morre com zero jobs;
     [2] guarda anti-drift: confere que as funções copiadas nos *.harness.js ainda
         existem iguais no app.js (avisa se a original mudou e a cópia ficou velha);
    [2b] deriva docs x codigo: fatos numericos, links markdown e citacoes
         `arquivo:linha` dos docs vivos, conferidos contra o codigo de verdade;
     [3] roda todos os *.test.js desta pasta.
   Sai com código != 0 se QUALQUER etapa falhar. Node puro, sem dependências. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { extrairCanon, conferirCanon } = require('./canon.js');

const TESTS_DIR = __dirname;
const INDEX = path.join(__dirname, '..', 'index.html');
const APPJS = path.join(__dirname, '..', 'app.js');
const CSS   = path.join(__dirname, '..', 'styles.css');
const VERSION = path.join(__dirname, '..', 'version.json');

let problems = 0;
const fail   = msg => { console.log('  ✗', msg); problems++; };
const okline = msg => console.log('  ✓', msg);

const html = fs.readFileSync(INDEX, 'utf8');
const js   = fs.readFileSync(APPJS, 'utf8');
const css  = fs.readFileSync(CSS, 'utf8');

// ---------- [1] sintaxe do app.js + nenhum <script> inline no index.html ----------
console.log('\n[1] Sintaxe do app.js + index.html sem <script> inline');
try {
  const syntax = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: js, encoding:'utf8' });
  if (syntax.status !== 0) throw new Error((syntax.stderr || syntax.stdout || 'erro desconhecido').trim());
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
if (!/<script\s+type="module"\s+src="app\.js"><\/script>/.test(html)) {
  fail('app.js deve ser carregado como ES module nativo');
}
if (!js.includes("from './src/domain/core.mjs'")) {
  fail('app.js deve consumir o módulo puro src/domain/core.mjs');
}
if (!fs.existsSync(VERSION) || !js.includes("'/version.json")) {
  fail('auto-atualização deve observar /version.json');
}

// Guarda de PUBLICAÇÃO: todo asset que o app.js exige em runtime tem de sobreviver ao deploy.
// Motivo (produção, 10/08/2026): o app.js virou ES module e passou a importar
// `src/domain/core.mjs`, mas a allowlist do .vercelignore não reabria `src/` — o import
// respondia 404. **Import ES é atômico**: não degrada, ele impede o app.js INTEIRO de executar.
// A página subia com cabeçalho e rodapé, `<main id="app">` ficava vazio e NENHUM card aparecia.
// Nenhum outro gate vê isso: local o arquivo existe e a sintaxe está certa — quem omite é o
// deploy. O mesmo vale para o `/version.json` do auto-update, que 404 deixa mudo.
// A allowlist é default-deny de propósito (achado SEC-03), então arquivo novo NASCE não
// publicado: esta guarda é o que transforma esse acerto de segurança num erro barulhento em vez
// de uma tela branca em produção.
{
  const ROOT = path.join(__dirname, '..');
  const exigidos = new Map();   // caminho relativo à raiz → por que é exigido

  // Comentário NÃO é dependência: o navegador nunca pede o que está comentado, e cobrá-lo
  // reprova mudança legítima (quem comenta um import para testar não deveria brigar com o gate).
  // O corte do `//` exige início de linha ou espaço antes — sem isso `'https://x'` viraria
  // `'https:` e mutilaria strings, trocando um falso positivo por um falso negativo.
  const semCom = {
    js:   s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1'),
    html: s => s.replace(/<!--[\s\S]*?-->/g, ''),
    css:  s => s.replace(/\/\*[\s\S]*?\*\//g, ''),
  };

  // Resolve um especificador para caminho relativo À RAIZ. `/x` é absoluto do site; o resto é
  // relativo AO ARQUIVO QUE PEDE — e isso importa: `./formatters.mjs` dentro de
  // `src/domain/core.mjs` é `src/domain/formatters.mjs`, não `formatters.mjs` na raiz.
  // O `.trim()` existe porque `url(x )` sem aspas traz o espaço na captura e faria o gate
  // procurar um arquivo com espaço no nome, reprovando um asset publicado.
  const resolver = (dir, spec) => {
    const lim = String(spec).trim().split(/[?#]/)[0];
    if (!lim || /^[a-z][a-z0-9+.-]*:/i.test(lim) || lim.startsWith('//')) return null; // externa, data:, mailto:
    return lim.startsWith('/') ? path.posix.normalize(lim.slice(1))
                               : path.posix.normalize(path.posix.join(dir, lim));
  };
  const ehLocal = s => /^\.{0,2}\//.test(s);   // ./x, ../x, /x — descarta pacote bare ('react')

  // (a) MÓDULOS — varredura TRANSITIVA. Parar no app.js deixava o buraco de origem aberto: um
  // módulo publicado que importe outro não publicado quebra o app.js inteiro do mesmo jeito
  // (import ES é atômico), com o gate verde. Por isso a fila segue cada módulo descoberto.
  const RE_MOD = [
    [/\bfrom\s*['"]([^'"]+)['"]/g,            'import … from'],
    [/\bimport\s+['"]([^'"]+)['"]/g,          'import sem binding'],
    [/\bimport\s*\(\s*['"`]([^'"`]+)['"`]/g,  'import() dinâmico'],
  ];
  const vistos = new Set(['app.js']);
  const fila = [['app.js', semCom.js(js)]];
  while (fila.length) {
    const [arquivo, src] = fila.shift();
    const dir = path.posix.dirname(arquivo);
    for (const [re, rotulo] of RE_MOD) {
      for (const m of src.matchAll(re)) {
        if (!ehLocal(m[1])) continue;
        const rel = resolver(dir, m[1]);
        if (!rel) continue;
        if (!exigidos.has(rel)) exigidos.set(rel, `${rotulo} em ${arquivo} ('${m[1]}')`);
        if (vistos.has(rel)) continue;            // já na fila/varrido — não reenfileira (ciclo)
        vistos.add(rel);
        const abs = path.join(ROOT, rel);
        if (/\.(mjs|js)$/.test(rel) && fs.existsSync(abs)) {
          fila.push([rel, semCom.js(fs.readFileSync(abs, 'utf8'))]);
        }
      }
    }
  }

  // (b) canais NÃO-modulares: não têm grafo a percorrer, cada um pede um arquivo e acabou.
  const canais = [
    ['app.js',     semCom.js(js),     /\.src\s*=\s*['"`]([^'"`]+)['"`]/g,     'asset injetado por .src='],
    ['app.js',     semCom.js(js),     /\bfetch\(\s*['"`](\/[^'"`\s]+)['"`+]/g, 'fetch()'],
    ['index.html', semCom.html(html), /\b(?:href|src)\s*=\s*(["'])([^"']*)\1/g, 'href/src'],
    ['styles.css', semCom.css(css),   /\burl\(\s*['"]?([^'")]*)['"]?\s*\)/g,  'url()'],
  ];
  for (const [arquivo, fonte, re, rotulo] of canais) {
    for (const m of fonte.matchAll(re)) {
      const spec = m[2] !== undefined ? m[2] : m[1];       // href/src usa retrovisor p/ casar as aspas
      const rel = resolver(path.posix.dirname(arquivo), spec);
      if (rel) exigidos.set(rel, `${rotulo} em ${arquivo} ('${spec}')`);
    }
  }

  // A allowlist é interpretada pelo PRÓPRIO git — mesma engine de padrões que a Vercel usa —
  // em vez de reimplementada aqui. `ls-files -c -i` lista os arquivos RASTREADOS que os padrões
  // excluem; o deploy da Vercel parte do git, então rastreado+não-excluído == publicado.
  const gitOut = (...args) => {
    const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
    if (r.status !== 0) return null;
    return new Set(r.stdout.split('\n').filter(Boolean));
  };
  const rastreados = gitOut('ls-files');
  const excluidos  = gitOut('ls-files', '-c', '-i', '--exclude-from=.vercelignore');
  if (!rastreados || !excluidos) {
    // Falha FECHADO. Um "pulei porque o git não respondeu" seria justamente a cegueira
    // silenciosa que esta guarda existe para eliminar.
    fail('não consegui consultar o git para conferir a allowlist do .vercelignore');
  } else {
    const fora = [...exigidos.keys()]
      .filter(f => !rastreados.has(f) || excluidos.has(f))
      .sort();
    if (fora.length) {
      fail(`assets necessários ignorados no deploy: ${fora.join(', ')}`
         + ` — reabra no .vercelignore (${fora.map(f => exigidos.get(f)).join('; ')})`);
    } else {
      okline(`allowlist do .vercelignore publica os ${exigidos.size} assets pedidos por app.js/index.html/styles.css`);
    }
  }
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

// ---------- [1c] env: dos workflows sem chave duplicada ignorando maiúsculas ----------
console.log('\n[1c] Workflows: nenhum env: com chave duplicada ignorando maiúsculas');
// Por que existe: o validador do GitHub trata nome de variável de ambiente como
// CASE-INSENSITIVE, então `NO_PROXY:` e `no_proxy:` no MESMO bloco `env:` fazem ele
// REJEITAR o workflow inteiro. E workflow rejeitado não vira job vermelho que se vê: o run
// nasce e morre no mesmo segundo, com zero jobs, o nome cai para o caminho do arquivo e nem
// os filtros de `on:` são avaliados. Foi assim que o gate do ci.yml ficou morto por horas
// em 31/07/2026, com PRs passando verdes porque os OUTROS workflows rodavam.
// YAML puro aceita as duas chaves (são distintas), então nenhum parser acusa — só o GitHub,
// e só depois do push. Daí a guarda ser textual e offline.
{
  const WF = path.join(__dirname, '..', '.github', 'workflows');
  let arquivos = [];
  try { arquivos = fs.readdirSync(WF).filter(f => /\.ya?ml$/.test(f)); } catch (_) { /* sem workflows */ }
  let achados = 0, blocos = 0;
  for (const f of arquivos){
    const linhas = fs.readFileSync(path.join(WF, f), 'utf8').split('\n');
    for (let i = 0; i < linhas.length; i++){
      const abre = /^(\s*)env:\s*$/.exec(linhas[i]);
      if (!abre) continue;
      blocos++;
      const dentro = abre[1].length;                       // indentação do próprio `env:`
      const vistas = new Map();                            // minúscula → nome como escrito
      for (let j = i + 1; j < linhas.length; j++){
        const l = linhas[j];
        if (!l.trim() || /^\s*#/.test(l)) continue;        // linha vazia/comentário não fecha
        const ind = l.length - l.trimStart().length;
        if (ind <= dentro) break;                          // desindentou: acabou o bloco
        const chave = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(l);
        if (!chave) continue;
        const k = chave[1], baixa = k.toLowerCase();
        if (vistas.has(baixa)){
          fail(`${f}:${j + 1} — env: tem '${vistas.get(baixa)}' e '${k}' no mesmo bloco; `
             + 'o GitHub ignora maiúsculas e REJEITA o workflow (run com zero jobs). '
             + 'Deixe uma só e exporte a outra no shell do `run:`.');
          achados++;
        } else vistas.set(baixa, k);
      }
    }
  }
  if (!achados) okline(`ok (${blocos} bloco(s) env: em ${arquivos.length} workflow(s))`);
}

// ---------- [2] guarda anti-drift ----------
console.log('\n[2] Guarda anti-drift (cópias verbatim batem com o app.js)');
// Compara o TEXTO INTEIRO de cada cópia marcada nos harness contra o app.js.
//
// Até 08/08/2026 isto era `js.includes(snippet)` com o trecho escrito à mão, e em 15 das 50
// entradas o trecho era só a ASSINATURA da função. A guarda perguntava se existia uma linha
// `function matchEvent(r, c){` no app.js — o corpo era irrelevante. Medido: trocando o corpo
// de matchEvent por `return false`, o gate saía "tudo verde", os 213 testes puros passavam e
// as 17 views também. Como os testes rodam sobre a CÓPIA, e a guarda era a única coisa ligando
// a cópia ao original, a rede inteira ficava verde com o portal quebrado.
//
// A fronteira da cópia agora é declarada por marcador (`/* @canon <nome> */` … `/* @endcanon */`),
// não inferida por contagem de chaves — contar chaves é a armadilha: ao sondar isto, um extrator
// ingênuo deu 6 falsos negativos só em funções de UMA LINHA, que fecham sem `\n}\n`.
{
  const HARNESSES = ['pure.harness.js', 'harness.js'];
  const copias = new Map();
  const fontes = new Map();
  for (const arquivo of HARNESSES){
    const src = fs.readFileSync(path.join(TESTS_DIR, arquivo), 'utf8');
    for (const [nome, dados] of extrairCanon(src)){ copias.set(nome, dados); fontes.set(nome, arquivo); }
  }
  const fora = new Set(conferirCanon(copias, js));
  for (const [nome, { adaptado }] of copias){
    if (fora.has(nome)){
      fail(`cópia DIVERGE do app.js: "${nome}" (${fontes.get(nome)}) — o harness testa código que o `
         + 'app.js não tem mais. Reponha o texto do app.js entre os marcadores @canon, ou, se a '
         + 'mudança for intencional, atualize a cópia E confira se o teste dela ainda faz sentido.');
    } else okline(adaptado ? `${nome} (adaptada de propósito)` : nome);
  }

  // Cópia exportada SEM marcador passaria batida — foi o que aconteceu com `ilikeTerm` e
  // `MAX_TABS` na auditoria externa de 27/07/2026 (37 cópias exportadas × 36 guardas, contadas
  // à mão). Esta checagem fecha o laço: todo símbolo exportado por um harness tem de estar
  // entre marcadores. Varre os DOIS harness — varrer só um e deixar o irmão aberto é o mesmo
  // bug, adiado (o harness.js ficou descoberto assim até 27/07/2026). Harness NOVO entra aqui.
  //
  // A exceção legítima é o símbolo que o harness IMPORTA de `src/domain/` em vez de copiar: ali
  // não há cópia para divergir, é a mesma implementação que o navegador executa.
  //
  // A exceção é apurada por harness e por BINDING — não por nome existir em algum lugar de
  // `src/domain/`. A diferença não é purismo: com a versão por nome, um harness que tirasse
  // `groupBy` do seu `require` e reintroduzisse uma cópia local sem marcador continuaria isento,
  // porque `groupBy` segue exportado pelo `agrupamento.mjs`. Medido em 14/08/2026 (achado do
  // Codex no PR #125): o gate saía "todas marcadas e conferidas", VERDE, com a cópia local no
  // lugar — e dali em diante ela podia divergir do módulo sem nada olhando. É o mesmo buraco da
  // lista escrita à mão que esta seção veio fechar, entrando por outra porta.
  //
  // Falha FECHADO em toda ambiguidade: forma de require que o extrator não reconhece (namespace,
  // `require` computado) não isenta ninguém, e o gate reprova pedindo o marcador em vez de
  // adivinhar. Um extrator que erra para o lado permissivo é pior que extrator nenhum.
  const exportsPorModulo = () => {
    const dir = path.join(__dirname, '..', 'src', 'domain');
    const porArquivo = new Map();
    let arquivos = [];
    try { arquivos = fs.readdirSync(dir).filter(f => f.endsWith('.mjs')); } catch (_) { return null; }
    if (!arquivos.length) return null;
    for (const f of arquivos){
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const nomes = new Set();
      for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) nomes.add(m[1]);
      for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)){
        for (const parte of m[1].split(',')){
          const nome = parte.trim().split(/\s+as\s+/).pop().trim();
          if (nome) nomes.add(nome);
        }
      }
      porArquivo.set(f, nomes);
    }
    return porArquivo;
  };
  // Nomes que ESTE harness liga a um módulo de domínio, lidos dos seus próprios `require`.
  // Só a forma desestruturada é aceita — é a que o repo usa, e é a única em que dá para saber,
  // pelo texto, qual binding veio do módulo.
  const RE_REQUIRE_DOMINIO = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*require\(\s*['"][^'"]*\/src\/domain\/([A-Za-z0-9_.-]+\.mjs)['"]\s*\)/g;
  // Comentário é removido ANTES de procurar o `require`, senão declaração MORTA concede isenção
  // viva. Medido em 14/08/2026 (achado do Codex sobre o próprio commit que trocou a isenção por
  // nome pela isenção por binding): bastava tirar `groupBy` do require de verdade, deixar
  // `// const { groupBy } = require('../src/domain/agrupamento.mjs')` no arquivo e recolocar a
  // cópia local sem marcador — o gate imprimia "todas marcadas e conferidas" e saía verde.
  // É o MESMO defeito da versão anterior (extrator que erra para o lado permissivo) entrando pela
  // terceira porta; daí o comentário longo, para a quarta não passar.
  // O corte do `//` exige início de linha ou espaço antes: sem isso `'https://x'` viraria
  // `'https:` e mutilaria strings, trocando um falso positivo por um falso negativo.
  const semComentariosJS = txt => txt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const ligadosAoDominio = (bruto, porModulo, arquivo) => {
    const src = semComentariosJS(bruto);
    const nomes = new Set();
    for (const m of src.matchAll(RE_REQUIRE_DOMINIO)){
      const modulo = m[2];
      const exportsDele = porModulo.get(modulo);
      if (!exportsDele){
        fail(`[${arquivo}] require de src/domain/${modulo}, que não existe — corrija o caminho`);
        continue;
      }
      for (const parte of m[1].split(',')){
        const t = parte.trim();
        if (!t) continue;
        // `{ a: b }` — `a` é o export, `b` é o nome local que o harness reexporta.
        const [origem, local] = t.split(':').map(s => s.trim());
        const nomeExportado = origem, nomeLocal = local || origem;
        if (!/^[A-Za-z_$][\w$]*$/.test(nomeExportado) || !/^[A-Za-z_$][\w$]*$/.test(nomeLocal)) continue;
        if (!exportsDele.has(nomeExportado)){
          fail(`[${arquivo}] desestrutura "${nomeExportado}" de src/domain/${modulo}, que não o exporta `
             + '— o binding chega undefined e o teste passaria testando nada');
          continue;
        }
        nomes.add(nomeLocal);
      }
    }
    return nomes;
  };
  let totalExportados = 0, falhou = false;
  const porModulo = exportsPorModulo();
  if (!porModulo){
    fail('não consegui ler os export de src/domain/*.mjs — a guarda de cobertura @canon ficaria cega');
    falhou = true;
  }
  for (const arquivo of HARNESSES){
    const src = fs.readFileSync(path.join(TESTS_DIR, arquivo), 'utf8');
    const m = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!m){ fail(`não achei o module.exports do ${arquivo} (a cobertura não pôde ser conferida)`); falhou = true; continue; }
    const exportados = m[1].split(',').map(s => s.trim()).filter(Boolean)
      // `get X(){…}` / `set X(v){…}`: o nome é o 2º token, não o 1º.
      .map(s => s.replace(/^(?:get|set)\s+/, '').split(/[:(]/)[0].trim())
      .filter(Boolean);
    totalExportados += new Set(exportados).size;
    const doDominio = porModulo ? ligadosAoDominio(src, porModulo, arquivo) : new Set();
    const semMarcador = [...new Set(exportados)].filter(n => !copias.has(n) && !doDominio.has(n));
    if (semMarcador.length){
      fail(`[${arquivo}] cópia exportada sem marcador @canon: ${semMarcador.join(', ')} — `
         + 'envolva o bloco em /* @canon <nome> */ … /* @endcanon */ '
         + '(ou, se a função já foi extraída, importe-a de src/domain/ em vez de copiá-la)');
      falhou = true;
    }
  }
  if (!falhou && !fora.size) okline(`cobertura (${totalExportados} cópias exportadas nos ${HARNESSES.length} harness, todas marcadas e conferidas)`);
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

  // `docs/adr/` e `docs/planos/` entram por DESCOBERTA, não por lista escrita à mão: ADR novo e
  // plano novo passam a ser cobrados sozinhos. Foi por estarem fora do alcance que o ADR-0002
  // pôde afirmar por 10 dias que "somente divatdetro.vercel.app usa produção" enquanto o app.js
  // tinha três hosts — e ADR é NORMATIVO: quem o seguisse recriava o bug. `docs/historico/` fica
  // de fora de propósito (retrato datado envelhece por desenho), como o CHANGELOG.
  const varrerDocs = dir => existe(dir)
    ? fs.readdirSync(path.join(RAIZ, dir)).filter(f => f.endsWith('.md')).sort().map(f => `${dir}/${f}`)
    : [];
  const DOCS_VIVOS = ['CLAUDE.md', 'README.md', 'CONTEXT.md', 'docs/estrutura-frontend.md',
    'docs/schema.md', 'docs/backup.md', 'docs/etl.md', 'docs/seguranca.md', 'docs/semgrep.md',
    'docs/agents/domain.md', 'docs/agents/issue-tracker.md', 'docs/agents/triage-labels.md',
    'tests/README.md', ...varrerDocs('docs/adr'), ...varrerDocs('docs/planos')].filter(existe);

  // Comentário de workflow é prosa viva como qualquer outra — e prosa que ninguém relê, porque
  // não abre em leitor de markdown. A 1ª versão desta guarda varria só `.md`, e por isso o
  // `views.yml` pôde afirmar "23 views" e "~62% do app.js" (medido: 17 e ~58,8%) por dias, com o
  // gate verde. Achado da auditoria preliminar de 30/07/2026. Os `.yml` entram SÓ na conferência
  // de fatos numéricos: link markdown e `SB_URL` não são a linguagem deles.
  const WORKFLOWS = existe('.github/workflows')
    ? fs.readdirSync(path.join(RAIZ, '.github/workflows')).filter(f => /\.ya?ml$/.test(f)).sort()
        .map(f => `.github/workflows/${f}`)
    : [];

  // Cabeçalho de script é prosa viva pelo mesmo motivo — e pior: é o primeiro texto que alguém lê
  // ao abrir a ferramenta, então um número errado ali é lido como medição. O `check_views.mjs`
  // afirmou "~62% do app.js" (medido: ~58%) até 08/08/2026, e nenhuma guarda alcançava o arquivo.
  // Como os `.yml`, os `.mjs` entram SÓ na conferência de fatos numéricos: link markdown e
  // `SB_URL` não são a linguagem deles.
  const SCRIPTS = existe('scripts')
    ? fs.readdirSync(path.join(RAIZ, 'scripts')).filter(f => f.endsWith('.mjs')).sort()
        .map(f => `scripts/${f}`)
    : [];
  const PROSA_VIVA = [...WORKFLOWS, ...SCRIPTS];

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
  const workflowCount = WORKFLOWS.length;
  const hostsProd = conta(js, /const HOSTS_PROD\s*=\s*\[([\s\S]*?)\]/, /'[^']+'/g);
  // Skills do Superpowers vendorizadas: a fonte da verdade é o manifesto que o
  // update_superpowers.sh gera, não a contagem de diretórios (`.claude/skills/` também
  // guarda skills nossas, como a `db-change`).
  const spManifesto = existe('.claude/skills/.superpowers-manifest.json')
    ? JSON.parse(ler('.claude/skills/.superpowers-manifest.json')) : null;
  const spSkills = spManifesto ? (spManifesto.skills || []).length : null;

  // Regras LOCAIS do Semgrep (.semgrep/rules/), que a prosa cita pelo número. Ficaram de fora
  // da guarda até 14/08/2026, e o número virou justamente o argumento de uma crítica externa
  // ("o local roda 5, o CI roda 116") — fato numérico repetido em vários arquivos é exatamente
  // o que esta seção existe para prender. Só as LOCAIS entram: as vendorizadas
  // (.semgrep/vendor/) mudam quando o registry muda, e prendê-las aqui faria o gate reprovar
  // por um número que ninguém neste repo escolheu. A contagem delas mora no manifesto.
  const semgrepRegras = existe('.semgrep/rules')
    ? fs.readdirSync(path.join(RAIZ, '.semgrep/rules')).filter(f => /\.ya?ml$/.test(f))
        .reduce((n, f) => n + (ler(`.semgrep/rules/${f}`).match(/^\s{0,2}- id:/gm) || []).length, 0)
    : null;

  // --- fatos que os docs AFIRMAM (regex contra o texto com espaços normalizados,
  //     para que quebra de linha do markdown não escape da checagem) ---
  // Em `.yml` o marcador `#` do comentário é removido ANTES de normalizar o espaço: um comentário
  // longo quebra em várias linhas, cada uma recomeçando com `#`, e sem tirá-lo a frase "Abre as 23
  // \n#  views" nunca casa o regex — a guarda passaria cega, que é pior que não existir.
  // Em `.mjs` o marcador é `//` e vale o mesmo raciocínio: um cabeçalho de 20 linhas recomeça
  // com `//` a cada linha, e sem tirá-lo a frase quebrada nunca casa o regex — guarda cega.
  const normalizar = (arq, txt) =>
    (/\.ya?ml$/.test(arq) ? txt.replace(/^[ \t]*#[ \t]?/gm, ' ')
      : /\.mjs$/.test(arq) ? txt.replace(/^[ \t]*\/\/[ \t]?/gm, ' ')
      : txt).replace(/\s+/g, ' ');
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
    { doc:'README.md',                  o:'quantidade de workflows', re:/Os ([\d]+) workflows de automação e CI/, real:workflowCount, esc:'exato' },
    { doc:'CLAUDE.md',                  o:'quantidade de workflows', re:/Existem \*\*([\d]+) workflows\*\*/, real:workflowCount, esc:'exato' },
    { doc:'CLAUDE.md',                  o:'domínios de produção', re:/allowlist de \*\*([\d]+) domínios\*\*/, real:hostsProd, esc:'exato' },
    // `doc` pode ser uma LISTA de arquivos: o fato tem de aparecer em pelo menos um deles, e toda
    // ocorrência em qualquer um é conferida. Nos workflows a lista é o diretório inteiro, de
    // propósito — se a frase migrar do `views.yml` para outro workflow, continua coberta.
    { doc:PROSA_VIVA, o:'views do check_views (workflows/scripts)', re:/([\d]+)\s*views\b/, real:views,   esc:'exato' },
    { doc:PROSA_VIVA, o:'% da seção MODAL (workflows/scripts)',     re:/~([\d,.]+)% do app\.js/, real:modalPct, esc:'pct' },
    // O `backup_rest.mjs` anuncia no próprio cabeçalho quantas tabelas baixa em modo público. O
    // `*{0,2}` deixa o mesmo regex servir ao markdown (`**14**`) e ao comentário de script.
    { doc:['docs/backup.md', ...SCRIPTS], o:'tabelas públicas (docs/scripts)',
      re:/as \*{0,2}([\d]+)\*{0,2} tabelas públicas/, real:bkPublicas, esc:'exato' },
    // O comentário do hook entra na lista pelo mesmo motivo dos workflows: é prosa viva que
    // ninguém relê (não abre em leitor de markdown) e que afirma um número. Mantenha a frase
    // numa linha só — o `normalizar` não tira o `#` de `.sh`, então quebra de linha a esconde.
    { doc:['CLAUDE.md', '.claude/hooks/superpowers-session-start.sh'],
      o:'skills do Superpowers', re:/([\d]+) skills do Superpowers/, real:spSkills, esc:'exato' },
    // O `scripts/semgrep.sh` é `.sh`: o `normalizar` não tira o `#`, então a frase precisa caber
    // numa linha só (mesma armadilha do hook, logo acima). O `\*{0,2}` deixa o regex servir ao
    // markdown do CLAUDE.md (`**5** regras locais`) e ao comentário do shell ao mesmo tempo.
    { doc:['CLAUDE.md', 'docs/semgrep.md', 'scripts/semgrep.sh'],
      o:'regras locais do Semgrep', re:/as \*{0,2}([\d]+) regras locais/, real:semgrepRegras, esc:'exato' },
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

  // --- a lista de rulesets do Semgrep bate nos TRÊS lugares que a repetem ---
  // O scan local (`scripts/semgrep.sh`), o CI (`semgrep.yml`) e o atualizador
  // (`atualizar-semgrep-rulesets.yml`) precisam operar sobre o MESMO conjunto. Editar só um
  // faria os três divergirem em silêncio: o CI cobriria um ruleset que o local não cobre — que
  // é literalmente o defeito que a vendorização veio consertar, reaparecendo por outra porta.
  // A comparação é NOMINAL, como a de RT_TABLES acima: contagem igual com nomes diferentes
  // passaria, e é o tipo de verde que não vale nada.
  {
    const FONTES = {
      'scripts/semgrep.sh': t => (/REGISTRY_IDS="([^"]*)"/.exec(t)?.[1] || '').split(/\s+/),
      '.github/workflows/atualizar-semgrep-rulesets.yml': t => (/^\s*RULESETS:\s*(.+)$/m.exec(t)?.[1] || '').trim().split(/\s+/),
      '.github/workflows/semgrep.yml': t => (t.match(/--config=p\/([a-z0-9-]+)/g) || []).map(s => s.split('/')[1]),
    };
    const lidas = {};
    let cego = false;
    for (const [arq, extrair] of Object.entries(FONTES)){
      if (!existe(arq)) continue;
      const ids = extrair(ler(arq)).filter(Boolean).sort();
      if (!ids.length){ fail(`[${arq}] não consegui ler a lista de rulesets do Semgrep — a guarda ficou cega, conserte o extrator`); cego = true; }
      else lidas[arq] = ids;
    }
    const arqs = Object.keys(lidas);
    if (!cego && arqs.length >= 2){
      const ref = lidas[arqs[0]].join(' ');
      const fora = arqs.slice(1).filter(a => lidas[a].join(' ') !== ref);
      if (fora.length) fail(`[${fora.join(', ')}] a lista de rulesets do Semgrep divergiu de ${arqs[0]} (${ref}) — as três precisam bater, senão local e CI escaneiam conjuntos diferentes`);
      else okline(`rulesets do Semgrep iguais nos ${arqs.length} lugares (${ref})`);
    }
  }

  // --- toda tabela de RT_TABLES aparece no mapa tabela→card do CLAUDE.md ---
  // A contagem sozinha não bastava: o CLAUDE.md dizia "as 14 tabelas lidas pelo portal" logo acima
  // de um mapa que listava 12 (faltavam `codempresa_teste` e `portaria_teste`, e com elas o tópico
  // Portarias inteiro). O número certo ao lado da lista errada é pior que os dois errados, porque
  // parece conferido. Aqui a comparação é NOMINAL, tabela a tabela — a única forma de a lista não
  // poder ficar para trás quando um card novo lê tabela nova.
  {
    const claude = ler('CLAUDE.md');
    const mapa = /## Tabelas → onde aparecem \(cards\)\n([\s\S]*?)\n## /.exec(claude)?.[1];
    const rt = (/RT_TABLES\s*=\s*\[([\s\S]*?)\]/.exec(js)?.[1] || '').match(/'([a-z_]+)'/g) || [];
    if (!mapa) fail('[CLAUDE.md] não achei a seção "Tabelas → onde aparecem (cards)" — se ela mudou de título, atualize o regex (não apague a guarda)');
    else if (!rt.length) fail('[app.js] não consegui ler RT_TABLES — a guarda ficou cega, conserte o extrator');
    else {
      const faltando = rt.map(t => t.slice(1, -1)).filter(t => !mapa.includes(`\`${t}\``));
      if (faltando.length) fail(`[CLAUDE.md] o mapa tabela→card não cita ${faltando.length} tabela(s) de RT_TABLES: ${faltando.join(', ')} — card que lê tabela nova entra no mapa junto`);
      else okline(`mapa tabela→card cobre as ${rt.length} tabelas de RT_TABLES`);
    }
  }

  // --- a contagem de entradas de .claude/skills/ bate com o que o CLAUDE.md afirma ---
  // O manifesto do Superpowers já era conferido, mas ele só conhece a leva DELE: `.claude/skills/`
  // tinha 36 entradas (15 diretórios reais + 21 symlinks para `.agents/skills/`, de
  // `mattpocock/skills`) e nenhum `.md` do repo mencionava o segundo conjunto, o lockfile ou a
  // origem. Contar do disco é o que impede a prosa de descrever metade da pasta.
  if (existe('.claude/skills')) {
    const ent = fs.readdirSync(path.join(RAIZ, '.claude/skills'), { withFileTypes:true })
      .filter(e => !e.name.startsWith('.'));
    const links = ent.filter(e => e.isSymbolicLink()).length;
    const dirs = ent.length - links;
    const claude = normalizar('CLAUDE.md', ler('CLAUDE.md'));
    const m = /\*\*(\d+) diretórios reais \+ (\d+) symlinks = (\d+) entradas\*\*/.exec(claude);
    if (!m) fail('[CLAUDE.md] não afirma a composição de `.claude/skills/` — escreva "**N diretórios reais + N symlinks = N entradas**" (não apague a guarda)');
    else if (+m[1] !== dirs || +m[2] !== links || +m[3] !== ent.length) {
      fail(`[CLAUDE.md] composição de .claude/skills/: doc diz ${m[1]}+${m[2]}=${m[3]}, disco diz ${dirs}+${links}=${ent.length}`);
    } else okline(`.claude/skills/: ${dirs} diretórios + ${links} symlinks = ${ent.length} entradas, como o CLAUDE.md afirma`);
  }

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

  // --- toda citação `SÍMBOLO` (`arquivo:NNN`) aponta para a linha onde o símbolo está ---
  // Irmã da checagem de link acima: link markdown é promessa de NAVEGABILIDADE; citação
  // `arquivo:linha` é promessa de EVIDÊNCIA. O plano vivo da modularização declara, como método,
  // que "toda afirmação sobre comportamento de código cita `arquivo:linha` — e a linha é aberta
  // antes de a frase ser escrita. Citação é falsificável; prosa afirmativa não é". Era falso:
  // em 20/08/2026 as 28 citações `app.js:NNN` conferíveis daquele documento estavam TODAS
  // exatamente 2 linhas baixas, desde o dia em que foram escritas — os números vieram de uma
  // árvore de trabalho intermediária e nunca foram reconferidos. Seis rodadas de revisão e os
  // quatro gates verdes não pegaram, porque nenhum deles abria a linha citada. Quem seguisse o
  // plano encontrava um comentário onde ele prometia `const view = currentView`.
  //
  // O formato conferido é DELIBERADAMENTE ESTREITO — a mesma lição da checagem de link, que na
  // 1ª versão varreu todo backtick e deu 61 falsos positivos contra 0 verdadeiros. Só entra a
  // citação em que um IDENTIFICADOR em backtick é seguido, com no máximo um conector curto
  // ("em", "de", "declarado em", "atribui em") e pontuação de amarração, da própria citação.
  // Fora dessa forma a regra não opina: prosa que cita uma linha SEM nomear o símbolo dela
  // ("o guard explícito em `app.js:2380`") continua sendo responsabilidade de quem escreve.
  // Medido ao entrar: 55 citações no formato, 55 conferidas, 0 falsos positivos.
  //
  // Faixa (`f:A`–`:B`) procura no intervalo inteiro: quem cita um bloco está apontando o bloco,
  // não a 1ª linha dele. Seletor (`#regScope`) casa também com `id="regScope"`, que é como o
  // markup o escreve. Escape hatch: `<!-- deriva-ok: <motivo> -->` na linha, o mesmo marcador
  // que a guarda de SB_URL usa — hoje só o plano ENCERRADO de 08/08 o usa, porque re-ancorar
  // documento não-normativo é arqueologia, não manutenção.
  {
    const RE_CIT = /`([\w./-]*):(\d+)`(?:\s*[–-]\s*`:(\d+)`)?/g;
    const RE_SIMB = /^[#.]?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
    // O `//` e o `*`/`>`/`#` entram porque a citação pode cair na linha seguinte de um
    // comentário de script, de uma bandeira markdown ou de um bloco de destaque — e aí o
    // prefixo da linha se interpõe entre o símbolo e a citação. Sem isto, quebrar a linha
    // DESLIGA a conferência daquela citação em silêncio: exatamente o defeito que esta guarda
    // existe para impedir. Medido ao acrescentar: +5 citações cobertas, 0 falsos positivos.
    const RE_CONECTOR = /^[\s(|,]*(?:\/\/|[*>#]+)?[\s(|,]*(?:declarado em|atribui em|em|de)?[\s(|,]*(?:\/\/|[*>#]+)?[\s(|,]*$/;
    const cacheLinhas = new Map();
    const linhasDe = f => {
      // tira o elemento vazio do \n final: sem isso a última linha "existe" uma a mais que o
      // arquivo, e uma citação para o fim dele passaria batido.
      if (!cacheLinhas.has(f)) cacheLinhas.set(f, existe(f) ? ler(f).replace(/\n$/, '').split('\n') : null);
      return cacheLinhas.get(f);
    };
    let conferidas = 0, erradas = 0;
    // Workflows e cabeçalhos de script entram pelo mesmo motivo que já entram na conferência de
    // fato numérico: são prosa viva que ninguém relê, porque não abrem em leitor de markdown — e
    // citação num cabeçalho de gate é lida como medição por quem for operá-lo.
    for (const doc of [...DOCS_VIVOS, ...PROSA_VIVA]){
      const txt = ler(doc);
      const linhasDoDoc = txt.split('\n');
      let ultimoArquivo = null;                  // `:NNN` sem arquivo herda o último citado
      for (const m of txt.matchAll(RE_CIT)){
        const arquivo = m[1] || ultimoArquivo;
        if (m[1]) ultimoArquivo = m[1];
        if (!arquivo || !existe(arquivo)) continue;   // caminho que não é deste repo: não opina
        const nMd = txt.slice(0, m.index).split('\n').length;
        if (/deriva-ok/.test(linhasDoDoc[nMd - 1] || '')) continue;
        const L = linhasDe(arquivo);
        const ini = +m[2], fim = m[3] ? +m[3] : ini;
        if (ini < 1 || fim > L.length || fim < ini){
          fail(`[${doc}:${nMd}] cita ${arquivo}:${m[2]}${m[3] ? '–' + m[3] : ''}, fora de 1..${L.length}`);
          erradas++; continue;
        }
        // o símbolo é o último `…` ANTES da citação, e só vale se for identificador colado nela
        const mm = /`([^`\n]{1,60})`([^`\n]{0,16})$/.exec(txt.slice(Math.max(0, m.index - 140), m.index));
        if (!mm || !RE_SIMB.test(mm[1]) || !RE_CONECTOR.test(mm[2])) continue;
        const simb = mm[1];
        const alvos = [simb];
        if (simb[0] === '#') alvos.push(`id="${simb.slice(1)}"`, `id='${simb.slice(1)}'`);
        conferidas++;
        if (L.slice(ini - 1, fim).some(l => alvos.some(t => l.includes(t)))) continue;
        const onde = L.findIndex(l => alvos.some(t => l.includes(t)));
        fail(`[${doc}:${nMd}] cita \`${simb}\` em ${arquivo}:${m[2]}${m[3] ? '–' + m[3] : ''}, `
           + `mas o símbolo não está ali${onde >= 0 ? ` (a 1ª ocorrência está em :${onde + 1})` : ''}`
           + ' — mova a citação, não a apague');
        erradas++;
      }
    }
    if (!erradas) okline(`citações arquivo:linha conferidas (${conferidas} no formato \`SÍMBOLO\` (\`arquivo:NNN\`), em ${DOCS_VIVOS.length + PROSA_VIVA.length} arquivos)`);
  }

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

  // --- localização das fontes: @font-face mora em styles.css, não no HTML ---
  // A extração do CSS deixou duas descrições vivas apontando para um <style> que não existia.
  // Além de bloquear a frase velha, exige uma afirmação positiva no manual principal.
  let fonteErrada = 0;
  for (const doc of DOCS_VIVOS){
    ler(doc).split('\n').forEach((l, i) => {
      if (/deriva-ok/.test(l)) return;
      if (/@font-face/.test(l) && /(index\.html|<style>)/.test(l)) {
        fail(`[${doc}:${i + 1}] atribui @font-face ao index.html/<style>; as declarações ficam em styles.css`);
        fonteErrada++;
      }
    });
  }
  if (!/@font-face[^\n]*styles\.css/.test(ler('CLAUDE.md'))) {
    fail('[CLAUDE.md] não afirma que @font-face fica em styles.css');
    fonteErrada++;
  }
  if (!fonteErrada) okline('@font-face documentado em styles.css, não no index.html');

  // --- tipo real da chave pública ---
  // `anon` (role JWT) e `sb_publishable_*` são públicas, mas não são sinônimos nem usam o mesmo
  // header Authorization. Chamar a JWT legada de publishable esconde trabalho de migração.
  {
    const m = /const SB_KEY\s*=\s*'([^']+)'/.exec(js);
    let tipo = 'desconhecido';
    if (m?.[1]?.startsWith('sb_publishable_')) tipo = 'publishable';
    else if (m?.[1]?.split('.').length === 3) {
      try {
        const b64 = m[1].split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        if (payload.role === 'anon') tipo = 'anon-jwt-legada';
      } catch (_) { /* a guarda abaixo acusa o tipo desconhecido */ }
    }
    if (tipo === 'desconhecido') fail('não consegui classificar SB_KEY como anon JWT legada ou sb_publishable_*');
    if (tipo === 'anon-jwt-legada' && /anon\s*\(publishable\)/i.test(ler('CLAUDE.md'))) {
      fail('[CLAUDE.md] chama a anon JWT legada de publishable');
    } else if (tipo === 'anon-jwt-legada' && !/JWT `anon` legada/.test(ler('CLAUDE.md'))) {
      fail('[CLAUDE.md] não registra que a chave atual é JWT anon legada');
    } else if (tipo !== 'desconhecido') okline(`tipo da chave pública documentado (${tipo})`);
  }

  // --- status estável do PR #73 nos dois handoffs correntes ---
  // O merge é evento histórico estável. O que drifta é deixar o handoff continuar mandando
  // "decidir o draft" depois de ele já ter entrado na main.
  // `if (!existe) continue` era fail-open: ao mover estes dois para `docs/historico/` (08/08/2026)
  // a guarda simplesmente PAROU DE IMPRIMIR, sem uma linha de aviso — o gate seguiu verde com dois
  // checks a menos. Arquivo que a guarda cita por caminho e some é achado, não silêncio.
  for (const doc of ['docs/historico/contexto-proxima-sessao-2026-07-31.md',
                     'docs/historico/pendencias-2026-07-31-consolidado.md']) {
    if (!existe(doc)) { fail(`[${doc}] sumiu — se o arquivo foi movido, atualize o caminho aqui (não apague a guarda)`); continue; }
    const src = ler(doc);
    if (!/0bfb38a/.test(src) || !/#73[^\n]*(mergeado|merge)/i.test(src)) {
      fail(`[${doc}] não registra o merge do #73 em 0bfb38a`);
    } else if (/draft aberto|decidir o destino|Decidir o #73/i.test(src)) {
      fail(`[${doc}] ainda trata o #73 como decisão/draft aberto`);
    } else okline(`${doc}: #73 registrado como mergeado`);
  }

  if (!existe('scripts/restore_rest.mjs') || !existe('tests/restore_rest.rig.mjs')) {
    fail('runbook NDJSON sem importador e/ou bancada de restauração');
  } else okline('importador NDJSON e bancada de restauração presentes');

  // --- runbook de DR não pode voltar aos dois caminhos inexequíveis encontrados em 31/07 ---
  {
    const runbook = ler('docs/backup.md');
    const restoreSemDataOnly = runbook.split('\n').findIndex(l => /^\s+pg_restore\s/.test(l) && !/--data-only/.test(l));
    const promessaSemStub = /rode[^.\n]*check_views\.mjs[^.\n]*sem stub/i.test(runbook);
    if (restoreSemDataOnly >= 0) {
      fail(`[docs/backup.md:${restoreSemDataOnly + 1}] pg_restore sem --data-only recria o schema e conflita com backup_schema.sql`);
    }
    if (promessaSemStub) {
      fail('[docs/backup.md] manda rodar check_views.mjs sem stub, mas esse modo não existe');
    }
    if (restoreSemDataOnly < 0 && !promessaSemStub) okline('runbook de DR sem DDL duplicado nem promessa de check_views live');
  }

  // --- toda tabela com IDENTITY precisa de setval no runbook, e o caminho NDJSON precisa achá-lo ---
  // Inserir `row_id` explícito numa coluna GENERATED BY DEFAULT AS IDENTITY não avança a sequência.
  // O restore_rest.mjs grava row_id explícito (o backup faz `select=*`), então o Caminho B herda
  // exatamente o problema que o Caminho C já documentava — e foi assim que o passo ficou de fora
  // dele. A lista sai do SCHEMA, não de um número escrito à mão: tabela nova com IDENTITY entra na
  // cobrança sozinha. `setval` é SQL e o script só fala PostgREST, então isto é dívida de runbook.
  {
    const schema = ler('docs/backup_schema.sql');
    const runbook = ler('docs/backup.md');
    const comIdentity = [];
    let tabelaAtual = null;
    for (const l of schema.split('\n')) {
      const m = /^CREATE TABLE\s+public\.([a-z_]+)/i.exec(l);
      if (m) tabelaAtual = m[1];
      if (/GENERATED BY DEFAULT AS IDENTITY/i.test(l) && tabelaAtual) comIdentity.push(tabelaAtual);
    }
    const semSetval = comIdentity.filter(t => !new RegExp(`setval\\([^)]*'public\\.${t}'`).test(runbook));
    // O bloco existir não basta: quem lê só a seção do Caminho B tem de ser mandado até ele.
    const caminhoB = /### Caminho B[\s\S]*?(?=\n### )/.exec(runbook)?.[0] || '';
    const bApontaSetval = /Passo comum 2/.test(caminhoB);
    if (!comIdentity.length) fail('[docs/backup_schema.sql] nenhuma coluna IDENTITY encontrada — o parser da guarda quebrou');
    else if (semSetval.length) fail(`[docs/backup.md] sem setval para tabela(s) IDENTITY: ${semSetval.join(', ')}`);
    else if (!bApontaSetval) fail('[docs/backup.md] o Caminho B (NDJSON) não manda reposicionar as sequências');
    else okline(`sequências: ${comIdentity.length} tabela(s) IDENTITY com setval, e o Caminho B aponta para o passo`);
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
console.log('\n[3] Testes unitários (*.test.js / *.test.mjs)');
const testFiles = fs.readdirSync(TESTS_DIR).filter(f => /\.test\.(?:js|mjs)$/.test(f)).sort();
if (!testFiles.length) fail('nenhum arquivo *.test.js ou *.test.mjs encontrado');
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
