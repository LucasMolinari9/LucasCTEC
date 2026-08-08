'use strict';
/* Prova que a guarda anti-drift detecta CORPO divergente, não só assinatura.
   Rode: node drift.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que este teste existe: até 08/08/2026 a guarda era `js.includes(snippet)` com
   trechos escritos à mão, e 15 dos 50 trechos eram só a assinatura da função. Medido:
   com o corpo de matchEvent trocado por `return false`, o gate saía "tudo verde" e as
   17 views passavam. Os testes rodam sobre a CÓPIA no harness; a guarda era a única
   coisa ligando a cópia ao app.js, e ela não ligava.

   Roda sobre strings em memória: não lê nem escreve arquivo do repo. */

const { extrairCanon, conferirCanon } = require('./canon.js');

let ok = 0;
const falhas = [];
const t = (nome, cond) => cond ? ok++ : falhas.push(nome);

/* --- extração --- */
const harness = [
  '/* @canon matchEvent */',
  'function matchEvent(r, c){',
  '  return r.ano === c.ano;',
  '}',
  '/* @endcanon */',
].join('\n');

const appIgual  = 'xxx\nfunction matchEvent(r, c){\n  return r.ano === c.ano;\n}\nyyy';
const appMutado = 'xxx\nfunction matchEvent(r, c){\n  return false;\n}\nyyy';

const mapa = extrairCanon(harness);
t('extrai 1 cópia',                 mapa.size === 1);
t('extrai o corpo inteiro',         mapa.get('matchEvent').texto.includes('return r.ano === c.ano;'));
t('não engole os marcadores',       !mapa.get('matchEvent').texto.includes('@canon'));
t('cópia igual passa',              conferirCanon(mapa, appIgual).length === 0);
t('CORPO MUTADO É PEGO',            conferirCanon(mapa, appMutado).length === 1);
t('o pego é nomeado',               conferirCanon(mapa, appMutado)[0] === 'matchEvent');

/* --- assinatura igual + corpo diferente: o caso que passava antes --- */
const soAssinaturaBate = 'function matchEvent(r, c){\n  return 42;\n}';
t('assinatura igual não basta',     conferirCanon(mapa, soAssinaturaBate).length === 1);

/* --- adaptação declarada --- */
const adaptado = [
  '/* @canon-adaptado SB_URL — host falso: o teste não pode alcançar o projeto real */',
  "const SB_URL = 'https://example.invalid';",
  '/* @endcanon */',
].join('\n');
const mapaAdaptado = extrairCanon(adaptado);
t('adaptada é extraída',            mapaAdaptado.size === 1);
t('adaptada é marcada como tal',    mapaAdaptado.get('SB_URL').adaptado === true);
t('adaptada não é cobrada',         conferirCanon(mapaAdaptado, "const SB_URL = 'outra coisa';").length === 0);

/* --- várias cópias no mesmo arquivo, incluindo uma de uma linha só --- */
const varias = [
  '/* @canon umaLinha */',
  'function umaLinha(a){ return a; }',
  '/* @endcanon */',
  '// comentário solto entre as cópias',
  '/* @canon multi */',
  'function multi(a){',
  '  return a + 1;',
  '}',
  '/* @endcanon */',
].join('\n');
const mapaVarias = extrairCanon(varias);
t('extrai as duas',                 mapaVarias.size === 2);
t('função de uma linha inteira',    mapaVarias.get('umaLinha').texto === 'function umaLinha(a){ return a; }');
t('não vaza texto entre cópias',    !mapaVarias.get('umaLinha').texto.includes('comentário solto'));

console.log('\n==== PLACAR:', ok + '/' + (ok + falhas.length), '====');
if (falhas.length){ console.log('FALHAS:'); falhas.forEach(f => console.log('  -', f)); process.exit(1); }
