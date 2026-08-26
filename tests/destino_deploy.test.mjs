/* Destino do smoke de deploy (`scripts/lib/destino_deploy.mjs`).

   Achado SEC-03 da auditoria de 26/08/2026, medido no código: `scripts/check_deploy.mjs`
   mandava `x-vercel-protection-bypass` em TODA requisição, validava só que a URL era `https:`
   e usava `redirect: 'follow'`. Ou seja, bastava a URL apontar para (ou redirecionar a) um host
   qualquer para o segredo de bypass da Vercel sair da máquina. A URL não é constante: vem do
   `inputs.url` do `workflow_dispatch` e do `environment_url` do `deployment_status`.

   A allowlist NÃO pode depender do `HOSTS_PROD` baixado do próprio deploy — no momento da
   primeira requisição ele ainda não foi lido, e ler do alvo para decidir se pode falar com o
   alvo é circular. Por isso a regra tem duas fontes confiáveis: o `HOSTS_PROD` do `app.js`
   LOCAL (veio do checkout) e o domínio da Vercel, que é onde um segredo da Vercel pode ir.

   Rode: node destino_deploy.test.mjs   (ou, melhor, node check.js para rodar tudo). */

import assert from 'node:assert';
import { validarDestinoDeploy, hostsProdDe } from '../scripts/lib/destino_deploy.mjs';

let pass = 0; const fails = [];
const t = (nome, fn) => { try { fn(); pass++; } catch (e) { fails.push(`${nome}: ${e.message}`); } };
const lanca = (fn, re, msg) => {
  let erro = null;
  try { fn(); } catch (e) { erro = e; }
  assert.ok(erro, `${msg}: não lançou`);
  assert.match(erro.message, re, `${msg}: mensagem inesperada (${erro.message})`);
};

const PROD = ['divatdetro.vercel.app', 'divatdetro-lucas-molinari-s-projects.vercel.app'];

t('recusa host fora da Vercel e fora do HOSTS_PROD', () =>
  lanca(() => validarDestinoDeploy('https://evil.example.com', { hostsProd: PROD }),
    /não é um destino de deploy/, 'host arbitrário'));

t('recusa sufixo que só PARECE a Vercel', () => {
  lanca(() => validarDestinoDeploy('https://vercel.app.evil.com', { hostsProd: PROD }),
    /não é um destino de deploy/, 'sufixo à direita');
  lanca(() => validarDestinoDeploy('https://naovercel.app', { hostsProd: PROD }),
    /não é um destino de deploy/, 'sem o ponto');
});

t('recusa http', () =>
  lanca(() => validarDestinoDeploy('http://divatdetro.vercel.app', { hostsProd: PROD }),
    /HTTPS/, 'http'));

t('recusa valor que nem é URL', () =>
  lanca(() => validarDestinoDeploy(';curl evil', { hostsProd: PROD }), /URL válida/, 'lixo'));

t('aceita preview por hash (não dá para enumerar, mas é .vercel.app)', () => {
  const u = validarDestinoDeploy('https://divatdetro-9f2ab1c-lucas.vercel.app', { hostsProd: PROD });
  assert.equal(u.hostname, 'divatdetro-9f2ab1c-lucas.vercel.app');
  assert.equal(u.pathname, '/');
});

t('aceita host de produção mesmo que um dia não seja .vercel.app', () => {
  const u = validarDestinoDeploy('https://portal.detro.rj.gov.br', {
    hostsProd: [...PROD, 'portal.detro.rj.gov.br'],
  });
  assert.equal(u.hostname, 'portal.detro.rj.gov.br');
});

t('normaliza path, query e hash', () => {
  const u = validarDestinoDeploy('https://divatdetro.vercel.app/x?y=1#z', { hostsProd: PROD });
  assert.equal(u.href, 'https://divatdetro.vercel.app/');
});

t('hostsProdDe extrai a allowlist do app.js', () => {
  const src = "const HOSTS_PROD   = ['a.vercel.app',\n  'b.vercel.app'];\n";
  assert.deepEqual(hostsProdDe(src), ['a.vercel.app', 'b.vercel.app']);
});

t('hostsProdDe devolve lista vazia quando não acha (e não inventa host)', () => {
  assert.deepEqual(hostsProdDe('const OUTRA = [];'), []);
});

console.log('\n==== PLACAR:', pass + '/' + (pass + fails.length), '====');
if (fails.length) { console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
