#!/usr/bin/env node
/*
 * Smoke test de um deploy Vercel já publicado.
 *
 * Uso:
 *   node scripts/check_deploy.mjs https://preview.vercel.app preview
 *   node scripts/check_deploy.mjs https://divatdetro.vercel.app production
 *
 * Sem dependências: usa fetch nativo do Node 20. Valida os limites que os testes
 * locais não alcançam — headers reais, allowlist de arquivos e seleção do banco
 * pelo hostname efetivamente publicado.
 */

import {
  ALLOWED_DEPLOY_HOSTS,
  fetchSameOrigin,
  normalizeDeployTarget,
} from './lib/deploy-target.mjs';

const [, , rawUrl, rawEnvironment = 'auto'] = process.argv;
if (!rawUrl) {
  console.error('Uso: node scripts/check_deploy.mjs <url> [preview|production|auto]');
  process.exit(2);
}

// Esta validação completa precisa preceder até mesmo a leitura do segredo. A allowlist contém
// somente aliases estáveis já controlados pelo projeto; hostnames efêmeros `*.vercel.app` não
// autenticam que o deployment pertence a este projeto e, portanto, nunca recebem o bypass.
const base = normalizeDeployTarget(rawUrl, ALLOWED_DEPLOY_HOSTS);
const vercelBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';

const failures = [];
const ok = message => console.log(`  ✓ ${message}`);
const fail = message => {
  failures.push(message);
  console.error(`  ✗ ${message}`);
};

async function request(pathname) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const headers = { 'user-agent': 'divat-deploy-smoke/1.0' };
  if (vercelBypassSecret) {
    headers['x-vercel-protection-bypass'] = vercelBypassSecret;
    // NÃO mandar `x-vercel-set-bypass-cookie` aqui. Ele pede à Vercel que ela responda com
    // redirect + Set-Cookie, para que as requisições SEGUINTES passem pelo cookie. Isso serve a
    // NAVEGADOR (é a receita da doc para Playwright/Cypress, que têm cookie jar). O `fetch` do
    // Node não guarda nem reenvia cookie: ele segue o redirect sem o cookie, a Vercel redireciona
    // de novo, e o laço só termina no limite — `fetch failed (causa: redirect count exceeded)`.
    //
    // Medido em 31/07/2026, e o sintoma foi reproduzido com servidor local (21 voltas, cookie
    // nunca reenviado). Detalhe cruel: com o segredo ERRADO nada disso aparecia — a Vercel
    // devolvia a tela de login com 200. Ou seja, o loop só começou quando o bypass passou a
    // valer, e parecia uma piora quando era o oposto.
    //
    // Não é preciso cookie nenhum: o header de bypass vai em TODA requisição deste script.
  }
  try {
    return await fetchSameOrigin(new URL(pathname, base), {
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// O `fetch` do Node entrega TODA falha de rede como a mesma frase inútil, "fetch failed", e guarda
// o motivo real em `error.cause` — ENOTFOUND, ECONNREFUSED, ECONNRESET, certificado, timeout. O
// script imprimia só `error.message`, então jogava fora exatamente a informação que resolve o
// problema. Em 31/07/2026 isso custou três execuções seguidas do gate (#83, #84 e a anterior) em
// que 18 verificações reprovaram dizendo "fetch failed" — sem nenhuma pista de se o alvo não
// resolvia, recusava conexão ou derrubava o TLS. Gate que não sabe dizer por que falhou obriga a
// adivinhar toda vez que a rede tossir.
//
// `AbortError` do timeout de 20 s não tem `cause`; por isso o sufixo é condicional.
function descreveErro(error) {
  const causa = error?.cause;
  if (!causa) return error?.message ?? String(error);
  // `code` (ENOTFOUND, ECONNRESET) é o que se procura num runbook; a mensagem vem junto porque
  // erro de TLS traz o detalhe ali e nem sempre tem `code`.
  //
  // Erro de OpenSSL chega em VÁRIAS linhas, com caminho de arquivo do próprio Node no meio
  // (medido: `ERR_SSL_PACKET_LENGTH_TOO_LONG` ocupa 3 linhas). Sem achatar, uma falha de TLS
  // empurraria o resto do laço para fora da tela do log; por isso o espaço é normalizado e o
  // texto cortado — o que identifica a causa está sempre no começo.
  const detalhe = [causa.code, causa.message].filter(Boolean).join(': ').replace(/\s+/g, ' ').trim();
  const texto = detalhe || String(causa);
  return `${error.message} (causa: ${texto.length > 200 ? texto.slice(0, 200) + '…' : texto})`;
}

async function expectStatus(pathname, status) {
  try {
    const response = await request(pathname);
    if (response.status === status) ok(`${pathname} → ${status}`);
    else fail(`${pathname}: esperado HTTP ${status}, recebido ${response.status}`);
    return response;
  } catch (error) {
    fail(`${pathname}: ${descreveErro(error)}`);
    return null;
  }
}

function expectHeader(headers, name, predicate, expected) {
  const value = headers.get(name) || '';
  if (predicate(value)) ok(`${name}: ${expected}`);
  else fail(`${name}: esperado ${expected}; recebido ${value || '(ausente)'}`);
}

console.log(`\n[deploy] ${base.href}`);
const home = await expectStatus('/', 200);

if (home) {
  const homeHtml = await home.text();
  if (
    /vercel\.com\/(?:sso-api|login)/i.test(home.url) ||
    /<title>[^<]*(?:Log in|Authentication Required)[^<]*Vercel/i.test(homeHtml) ||
    /Log in to Vercel/i.test(homeHtml)
  ) {
    fail(
      'preview protegido pela Vercel; configure o mesmo Protection Bypass for Automation ' +
      'no projeto Vercel e no secret GitHub VERCEL_AUTOMATION_BYPASS_SECRET'
    );
    console.error('\nDeploy não testado: a resposta é a tela de autenticação da Vercel, não o portal.');
    process.exit(3);
  }

  expectHeader(home.headers, 'x-frame-options', value => value.toUpperCase() === 'DENY', 'DENY');
  expectHeader(home.headers, 'x-content-type-options', value => value.toLowerCase() === 'nosniff', 'nosniff');
  expectHeader(
    home.headers,
    'referrer-policy',
    value => value.toLowerCase() === 'strict-origin-when-cross-origin',
    'strict-origin-when-cross-origin'
  );
  expectHeader(
    home.headers,
    'strict-transport-security',
    value => /max-age=31536000/i.test(value) && /includeSubDomains/i.test(value),
    'max-age=31536000 + includeSubDomains'
  );
  expectHeader(
    home.headers,
    'permissions-policy',
    value => ['geolocation=()', 'microphone=()', 'camera=()'].every(rule => value.includes(rule)),
    'geolocation, microphone e camera desabilitados'
  );

  const csp = home.headers.get('content-security-policy') || '';
  const cspRules = [
    ["default-src 'self'", 'default-src'],
    ["script-src 'self'", 'script-src sem inline/eval'],
    ["style-src-attr 'none'", 'style-src-attr'],
    ["frame-ancestors 'none'", 'frame-ancestors'],
    ['https://lwzsxuaqqeoamukduhev.supabase.co', 'Supabase produção HTTPS'],
    ['wss://lwzsxuaqqeoamukduhev.supabase.co', 'Supabase produção WSS'],
    ['https://gontnlfmothfglssbyyk.supabase.co', 'Supabase teste HTTPS'],
    ['wss://gontnlfmothfglssbyyk.supabase.co', 'Supabase teste WSS'],
  ];
  for (const [rule, label] of cspRules) {
    if (csp.includes(rule)) ok(`CSP: ${label}`);
    else fail(`CSP sem ${rule}`);
  }
  if (csp.includes("'unsafe-inline'") || csp.includes("'unsafe-eval'")) {
    fail("CSP contém 'unsafe-inline' ou 'unsafe-eval'");
  } else {
    ok('CSP sem unsafe-inline/unsafe-eval');
  }
}

console.log('\n[allowlist] arquivos públicos necessários');
// Os módulos ES saem do PRÓPRIO app.js, não de uma lista escrita à mão.
//
// Import ES é ATÔMICO: um 404 num módulo não degrada, impede o app.js INTEIRO de executar e a
// página sai com cabeçalho, rodapé e nenhum card. Foi o defeito de 10/08/2026, e a lista daqui
// não continha o `core.mjs` — por isso o smoke passou VERDE com o portal quebrado.
//
// A lição foi lida pela metade: o item que faltava entrou, mas a lista continuou manual. Medido
// em 14/08/2026, ao extrair o `agrupamento.mjs`: o `.vercelignore` foi atualizado, esta lista
// não, e o smoke voltou a passar verde sem nunca pedir o módulo novo — o mesmo ponto cego, com
// o mesmo sintoma, quatro dias depois. Uma lista que precisa ser lembrada será esquecida; ela
// só falha quando alguém acerta, que é o oposto do que um gate deve fazer.
//
// Derivar do `import` resolve para todo módulo futuro sem ninguém lembrar de nada. Quem não é
// alcançável por `import` (HTML, CSS, fontes, vendor, o marcador do auto-update) continua
// explícito abaixo — não há de onde derivá-los.
//
// A travessia é TRANSITIVA, e isso não é zelo. A 1ª versão lia só o `app.js`, e um módulo
// importado apenas por OUTRO módulo ficava invisível: com `app.js → familia.mjs → dep.mjs`, o
// smoke pedia os dois primeiros com 200, dava o deploy por aprovado, e o navegador tomava 404 no
// terceiro — matando o grafo ESM inteiro, que é atômico. Reproduzido em 14/08/2026 (achado P1 do
// Codex): com um `dep.mjs` fora da allowlist, ESTE gate e o `tests/check.js` §[1] ficavam os dois
// verdes e o portal morria. O `check.js` segue lendo só o `app.js` — a correção dele é o PR #122;
// enquanto ele não entrar, a travessia daqui é a ÚNICA que enxerga o grafo, e ela roda no preview,
// antes de produção.
//
// Comentário é descartado antes da varredura: um `import` comentado num módulo faria o smoke
// exigir arquivo que ninguém pede, e o gate reprovaria um deploy correto. O corte do `//` exige
// início de linha ou espaço antes, senão `'https://x'` viraria `'https:` e mutilaria a string —
// trocar falso positivo por falso negativo é piorar.
const semComentarios = txt => txt
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|\s)\/\/[^\n]*/g, '$1');
const modulosImportados = async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const raiz = fileURLToPath(new URL('..', import.meta.url));
  const RES = [/\bfrom\s*['"](\.[^'"]+)['"]/g, /\bimport\s+['"](\.[^'"]+)['"]/g,
               /\bimport\s*\(\s*['"`](\.[^'"`]+)['"`]/g];
  const achados = new Set();
  const vistos = new Set();
  const fila = ['app.js'];
  while (fila.length) {
    const rel = fila.shift();
    if (vistos.has(rel)) continue;              // ciclo de imports não trava a fila
    vistos.add(rel);
    let src;
    try { src = semComentarios(await readFile(path.join(raiz, rel), 'utf8')); }
    catch { continue; }                          // arquivo ausente: quem acusa é o 404 do fetch
    const dir = path.posix.dirname(rel);
    for (const re of RES) {
      for (const m of src.matchAll(re)) {
        // especificador é relativo a QUEM IMPORTA, não à raiz
        const alvo = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, m[1]));
        achados.add('/' + alvo);
        fila.push(alvo);
      }
    }
  }
  if (!achados.size) throw new Error('nenhum import encontrado a partir do app.js — o extrator do smoke quebrou');
  return [...achados].sort();
};
const publicAssets = [
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
  ...(await modulosImportados()),
  // Marcador do auto-update (`checarNovaVersao` faz HEAD nele). Em 404 o detector fica mudo:
  // ninguém recebe deploy novo sem recarregar na mão, e o sintoma é invisível.
  '/version.json',
  '/vendor/supabase-js-2.110.7.min.js',
  '/vendor/icon.svg',
  '/vendor/fonts/archivo-latin-600-normal.woff2',
];
const publicResponses = new Map();
for (const pathname of publicAssets) {
  publicResponses.set(pathname, await expectStatus(pathname, 200));
}

console.log('\n[allowlist] arquivos internos obrigatoriamente fechados');
const forbiddenFiles = [
  '/CLAUDE.md',
  '/CONTEXT.md',
  '/.git/config',
  '/.mcp.json',
  '/.codex/config.toml',
  '/.github/workflows/ci.yml',
  '/docs/backup_schema.sql',
  '/scripts/check_grants.mjs',
  '/tests/check.js',
];
for (const pathname of forbiddenFiles) {
  await expectStatus(pathname, 404);
}

console.log('\n[ambiente] matriz hostname → Supabase');
const appResponse = publicResponses.get('/app.js');
if (appResponse?.ok) {
  const source = await appResponse.text();
  const literal = name => {
    const match = source.match(new RegExp(`const ${name}\\s*=\\s*'([^']*)'`));
    return match?.[1] || '';
  };
  const listMatch = source.match(/const HOSTS_PROD\s*=\s*\[([^\]]*)\]/);
  const productionHosts = listMatch
    ? [...listMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1].toLowerCase())
    : [];

  const prodUrl = literal('SB_URL');
  const testUrl = literal('SB_TESTE_URL');
  const prodKey = literal('SB_KEY');
  const testKey = literal('SB_TESTE_KEY');

  const environmentInput = rawEnvironment.toLowerCase();
  const expectedEnvironment = environmentInput.includes('prod')
    ? 'production'
    : environmentInput.includes('preview') || environmentInput.includes('develop')
      ? 'preview'
      : productionHosts.includes(base.hostname.toLowerCase()) ? 'production' : 'preview';

  const isProductionHost = productionHosts.includes(base.hostname.toLowerCase());
  if (expectedEnvironment === 'production' && isProductionHost) {
    ok(`${base.hostname} está na allowlist de produção`);
  } else if (expectedEnvironment === 'preview' && !isProductionHost) {
    ok(`${base.hostname} está fora da allowlist e seleciona teste`);
  } else {
    fail(`${base.hostname}: ambiente informado=${expectedEnvironment}, HOSTS_PROD=${productionHosts.join(', ')}`);
  }

  if (prodUrl === 'https://lwzsxuaqqeoamukduhev.supabase.co') ok('URL de produção preservada');
  else fail(`URL de produção inesperada: ${prodUrl || '(ausente)'}`);
  if (testUrl === 'https://gontnlfmothfglssbyyk.supabase.co') ok('URL de teste isolada');
  else fail(`URL de teste inesperada: ${testUrl || '(ausente)'}`);

  const verifyAnonKey = (key, expectedRef, label) => {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'anon' && payload.ref === expectedRef) ok(`${label}: anon key do projeto esperado`);
      else fail(`${label}: JWT aponta para role=${payload.role}, ref=${payload.ref}`);
    } catch {
      fail(`${label}: chave pública não é uma JWT anon válida`);
    }
  };
  verifyAnonKey(prodKey, 'lwzsxuaqqeoamukduhev', 'produção');
  verifyAnonKey(testKey, 'gontnlfmothfglssbyyk', 'teste');

  // Asserção sobre CÓDIGO, não sobre prosa. A Fase B moveu selecionarSupabase e seu `throw`
  // fail-closed para a fronteira REST. Procurá-lo ainda em app.js reprovaria todo deploy correto.
  const restResponse = publicResponses.get('/src/data/rest.mjs');
  const restSource = restResponse?.ok ? await restResponse.text() : '';
  if (/Configuração Supabase ausente para o ambiente de/.test(restSource)) ok('guarda fail-closed publicada');
  else fail('src/data/rest.mjs publicado não contém o throw fail-closed de selecionarSupabase');
} else {
  fail('não foi possível validar a matriz porque /app.js não respondeu 200');
}

if (failures.length) {
  console.error(`\nDeploy reprovado: ${failures.length} problema(s).`);
  process.exit(1);
}

console.log('\nDeploy aprovado: headers, allowlist e isolamento de ambiente estão coerentes.');
