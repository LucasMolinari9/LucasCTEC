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

const [, , rawUrl, rawEnvironment = 'auto'] = process.argv;
if (!rawUrl) {
  console.error('Uso: node scripts/check_deploy.mjs <url> [preview|production|auto]');
  process.exit(2);
}

const base = new URL(rawUrl);
if (base.protocol !== 'https:') {
  throw new Error(`Deploy precisa usar HTTPS: ${base.href}`);
}
base.pathname = '/';
base.search = '';
base.hash = '';
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
    headers['x-vercel-set-bypass-cookie'] = 'true';
  }
  try {
    return await fetch(new URL(pathname, base), {
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function expectStatus(pathname, status) {
  try {
    const response = await request(pathname);
    if (response.status === status) ok(`${pathname} → ${status}`);
    else fail(`${pathname}: esperado HTTP ${status}, recebido ${response.status}`);
    return response;
  } catch (error) {
    fail(`${pathname}: ${error.message}`);
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
const publicAssets = [
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.webmanifest',
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

  if (/preview jamais pode usar produção como fallback/.test(source)) ok('guarda fail-closed publicada');
  else fail('app.js publicado não contém a guarda fail-closed esperada');
} else {
  fail('não foi possível validar a matriz porque /app.js não respondeu 200');
}

if (failures.length) {
  console.error(`\nDeploy reprovado: ${failures.length} problema(s).`);
  process.exit(1);
}

console.log('\nDeploy aprovado: headers, allowlist e isolamento de ambiente estão coerentes.');
