'use strict';
const assert = require('assert');
const { selecionarSupabase } = require('./harness');

const CONFIG = Object.freeze({
  hostsProd: ['divatdetro.vercel.app'],
  prodUrl: 'https://producao.supabase.co',
  prodKey: 'prod-public-key',
  testeUrl: 'https://teste.supabase.co',
  testeKey: 'test-public-key',
});

const casos = [
  ['host canônico de produção', 'divatdetro.vercel.app', 'producao', CONFIG.prodUrl],
  ['produção com caixa e ponto final', 'DIVATDETRO.VERCEL.APP.', 'producao', CONFIG.prodUrl],
  ['preview Vercel', 'lucasctec-git-feature-exemplo.vercel.app', 'teste', CONFIG.testeUrl],
  ['localhost', 'localhost', 'teste', CONFIG.testeUrl],
  ['arquivo local sem hostname', '', 'teste', CONFIG.testeUrl],
  ['hostname desconhecido', 'portal-exemplo.invalid', 'teste', CONFIG.testeUrl],
];

for (const [nome, hostname, ambiente, url] of casos) {
  const escolhido = selecionarSupabase(hostname, CONFIG);
  assert.strictEqual(escolhido.ambiente, ambiente, nome);
  assert.strictEqual(escolhido.url, url, nome);
  assert(Object.isFrozen(escolhido), `${nome}: configuração deve ser imutável`);
}

assert.throws(
  () => selecionarSupabase('preview.vercel.app', { ...CONFIG, testeKey: '' }),
  /Configuração Supabase ausente para o ambiente de teste/,
  'preview sem configuração de teste deve falhar fechado'
);

assert.throws(
  () => selecionarSupabase('divatdetro.vercel.app', { ...CONFIG, prodUrl: '' }),
  /Configuração Supabase ausente para o ambiente de producao/,
  'produção sem configuração de produção deve falhar fechado'
);

// Os casos acima exercitam a FUNÇÃO com config sintética. Este bloco confere a LISTA REAL do
// app.js, que é onde o erro de verdade aconteceu: até 29/07/2026 HOSTS_PROD tinha só o domínio
// canônico, e os outros dois domínios que a Vercel serve como produção liam o banco de TESTE.
// Esse esquecimento não produz erro — produz dado de teste numa página de produção, com
// aparência perfeitamente normal, porque o banco de teste é uma cópia. Nenhum gate via.
const fs = require('fs');
const path = require('path');
const appjs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

const listaReal = appjs.match(/const HOSTS_PROD\s*=\s*\[([\s\S]*?)\]/);
assert(listaReal, 'HOSTS_PROD não encontrado no app.js');
const hostsReais = [...listaReal[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

// Os domínios que o projeto Vercel `divatdetro` serve. Ao adicionar domínio no painel, ele entra
// no app.js E aqui — é de propósito que esta lista seja manual: ela é a segunda opinião.
const DOMINIOS_VERCEL = [
  'divatdetro.vercel.app',
  'divatdetro-lucas-molinari-s-projects.vercel.app',
  'divatdetro-git-main-lucas-molinari-s-projects.vercel.app',
];
for (const dominio of DOMINIOS_VERCEL) {
  assert(
    hostsReais.includes(dominio),
    `HOSTS_PROD não lista ${dominio}: esse domínio serve produção e leria o banco de TESTE`
  );
}
// Produção lendo teste é o erro silencioso; teste lendo produção é o perigoso. Um host a mais
// aqui é tão grave quanto um a menos, então a lista é conferida nos dois sentidos.
for (const host of hostsReais) {
  assert(
    DOMINIOS_VERCEL.includes(host),
    `HOSTS_PROD lista ${host}, que não é domínio de produção conhecido`
  );
}

console.log(
  `✓ environment: ${casos.length} hostnames + 2 cenários fail-closed + ` +
  `${DOMINIOS_VERCEL.length} domínios de produção conferidos no app.js`
);
