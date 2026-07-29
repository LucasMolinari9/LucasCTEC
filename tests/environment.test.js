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

console.log(`✓ environment: ${casos.length} hostnames + 2 cenários fail-closed`);
