'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-smoke.yml'), 'utf8');
const smokeSource = fs.readFileSync(path.join(root, 'scripts', 'check_deploy.mjs'), 'utf8');

const loadTarget = () => import(pathToFileURL(path.join(root, 'scripts', 'lib', 'deploy-target.mjs')));

test('workflow não interpola expressions de inputs ou outputs dentro de run', () => {
  const runBlocks = [...workflow.matchAll(/^\s+run:\s*(?:\||>)?\s*\n((?:\s{10,}.*\n?)*)/gm)]
    .map(match => match[1]);

  assert.ok(runBlocks.length > 0, 'o workflow deve conter ao menos um bloco run');
  for (const block of runBlocks) {
    assert.doesNotMatch(block, /\$\{\{[\s\S]*?(?:inputs\.|steps\.[^.]+\.outputs\.)/);
  }
  assert.match(workflow, /SMOKE_URL:\s*\$\{\{\s*steps\.alvo\.outputs\.url\s*\}\}/);
  assert.match(workflow, /node scripts\/check_deploy\.mjs "\$SMOKE_URL" "\$DEPLOY_ENVIRONMENT"/);
});

test('workflow rejeita URL vazia, CR e LF antes de gravar GITHUB_OUTPUT', () => {
  const validation = workflow.indexOf('URL de smoke vazia ou contendo CR/LF');
  const output = workflow.indexOf('>> "$GITHUB_OUTPUT"');
  assert.ok(validation >= 0, 'a validação explícita deve existir');
  assert.ok(output > validation, 'a URL só pode ser gravada depois da validação');
  assert.match(workflow.slice(0, output), /\*\$'[\\]r'\*\|\*\$'[\\]n'\*/);
});

test('normalização aceita somente HTTPS, origem exata e URL sem credenciais ou porta', async () => {
  const { normalizeDeployTarget } = await loadTarget();
  const allowed = ['preview.divatdetro.example'];
  const invalid = [
    '',
    'https://preview.divatdetro.example\r.evil.test',
    'https://preview.divatdetro.example\n.evil.test',
    'http://preview.divatdetro.example',
    'https://evil.test',
    'https://preview.divatdetro.example.evil.test',
    'https://user:pass@preview.divatdetro.example',
    'https://preview.divatdetro.example:444',
    'https://127.0.0.1',
    'https://[::1]',
  ];

  for (const raw of invalid) {
    assert.throws(() => normalizeDeployTarget(raw, allowed), { name: 'DeployTargetError' }, raw);
  }
  assert.equal(normalizeDeployTarget('https://PREVIEW.divatdetro.example/a?q=1#x', allowed).href,
    'https://preview.divatdetro.example/');
});

test('hostname usa allowlist exata, nunca wildcard vercel.app', async () => {
  const { isAllowedHostname } = await loadTarget();
  assert.equal(isAllowedHostname('divatdetro.vercel.app', ['divatdetro.vercel.app']), true);
  assert.equal(isAllowedHostname('divatdetro.vercel.app.evil.test', ['divatdetro.vercel.app']), false);
  assert.equal(isAllowedHostname('attacker.vercel.app', ['*.vercel.app']), false);
});

test('redirect para outra origem é recusado antes da segunda requisição e não vaza bypass', async () => {
  const { fetchSameOrigin } = await loadTarget();
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url: String(url), headers: { ...options.headers } });
    return new Response(null, { status: 302, headers: { location: 'https://evil.test/roubo' } });
  };

  await assert.rejects(
    fetchSameOrigin(new URL('https://preview.divatdetro.example/'), {
      fetchImpl: fakeFetch,
      headers: { 'x-vercel-protection-bypass': 'segredo' },
    }),
    /mudança de origem/i,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-vercel-protection-bypass'], 'segredo');
  assert.equal(calls.some(call => call.url.startsWith('https://evil.test')), false);
});

test('redirect relativo e absoluto na mesma origem continuam funcionando', async () => {
  const { fetchSameOrigin } = await loadTarget();
  for (const location of ['/final', 'https://preview.divatdetro.example/final']) {
    const calls = [];
    const fakeFetch = async (url, options) => {
      calls.push({ url: String(url), headers: { ...options.headers } });
      return calls.length === 1
        ? new Response(null, { status: 307, headers: { location } })
        : new Response('ok', { status: 200 });
    };
    const response = await fetchSameOrigin(new URL('https://preview.divatdetro.example/inicio'), {
      fetchImpl: fakeFetch,
      headers: { 'x-vercel-protection-bypass': 'segredo' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map(call => call.url), [
      'https://preview.divatdetro.example/inicio',
      'https://preview.divatdetro.example/final',
    ]);
    assert.equal(calls[1].headers['x-vercel-protection-bypass'], 'segredo');
  }
});

test('redirect é limitado a cinco saltos', async () => {
  const { fetchSameOrigin } = await loadTarget();
  let calls = 0;
  await assert.rejects(
    fetchSameOrigin(new URL('https://preview.divatdetro.example/0'), {
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: `/${++calls}` },
      }),
    }),
    /limite de 5 redirects/i,
  );
  assert.equal(calls, 6);
});

test('script valida o destino antes de ler ou anexar o segredo', () => {
  const validation = smokeSource.indexOf('normalizeDeployTarget(');
  const secretRead = smokeSource.indexOf('process.env.VERCEL_AUTOMATION_BYPASS_SECRET');
  const secretHeader = smokeSource.indexOf("headers['x-vercel-protection-bypass']");
  assert.ok(validation >= 0, 'o script deve normalizar o destino');
  assert.ok(secretRead > validation, 'o segredo só pode ser lido depois da validação');
  assert.ok(secretHeader > secretRead, 'o header só pode ser criado depois da leitura tardia');
  assert.doesNotMatch(smokeSource, /redirect:\s*['"]follow['"]/);
});

test('smoke ainda verifica a guarda fail-closed publicada no módulo REST', () => {
  assert.match(smokeSource, /publicResponses\.get\(['"]\/src\/data\/rest\.mjs['"]\)/);
  assert.match(smokeSource, /Configuração Supabase ausente para o ambiente de/);
  assert.match(smokeSource, /\.test\(restSource\)/);
});
