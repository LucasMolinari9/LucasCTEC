/* Smoke test dos módulos de `src/domain/` pelo caminho ESM — o mesmo `import` que o NAVEGADOR usa.
   Os casos de mesa moram no pure.test.js, que chega por `require`; aqui o que se prova é que os
   módulos carregam como ES module e expõem o que prometem. A distinção não é acadêmica: o app.js
   só executa se este caminho funcionar, e um erro de sintaxe ESM ou um export com nome trocado
   passaria batido por um teste que só usa `require`. */
import assert from 'node:assert/strict';
import {
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash,
  fmtLineName, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm,
} from '../src/domain/core.mjs';
import * as agrupamento from '../src/domain/agrupamento.mjs';

assert.equal(fmtCode('101001001'), '101-001-001');
assert.equal(fmtTime('12:34:56'), '12:34');
assert.equal(fmtDate('2026-08-10'), '10/08/2026');
assert.equal(esc(`<a href="x">'`), '&lt;a href=&quot;x&quot;&gt;&#39;');
assert.equal(enc('a b'), 'a%20b');
assert.equal(ilikeTerm('a(*)'), 'a%20%20%20');
assert.equal(orDash(''), '—');
assert.equal(fmtLineName('Rio de Janeiro - São Paulo'), 'Rio&nbsp;de&nbsp;Janeiro - São&nbsp;Paulo');
assert.equal(boolChip(true, 'Ativa'), '<span class="chip chip-on">Ativa</span>');
assert.match(situacaoHTML({ cancelado: true }), /Cancelada/);
assert.equal(isLinhaAtiva({ cancelado: false, paralisado: false, sub_judice: true }), true);
assert.equal(isVigente({ cancelado: false, paralisado: false, sub_judice: true, transferido: false }), false);
assert.equal(norm(' SÃO GONÇALO '), 'sao goncalo');

// agrupamento.mjs: todo nome que o app.js importa tem de existir e ser função (byCodlinha e
// rjOrder são comparadores; entram no mesmo laço). Lista escrita à mão de propósito — é o
// CONTRATO que o app.js consome, e derivá-la do próprio módulo provaria apenas que ele é igual
// a si mesmo.
const ESPERADOS = ['groupBy', 'countBy', 'fmtMoney', 'byCodlinha', 'rjOrder', 'scoreEmpresa',
  'dedupEmpresasPorRJ', 'classifyMunLines', 'terminaisDoMunicipio', 'resumoFrota',
  'filtrarFrotaEmpresas'];
for (const nome of ESPERADOS) assert.equal(typeof agrupamento[nome], 'function', `agrupamento.${nome} ausente`);
assert.deepEqual([...agrupamento.groupBy([{ a: 1 }, { a: 1 }, { a: 2 }], x => x.a).keys()], [1, 2]);
assert.equal(agrupamento.fmtMoney(1234.5), '1.234,50');
// prova que o módulo resolve a própria dependência (norm vem do core) pelo caminho ESM
assert.deepEqual(agrupamento.filtrarFrotaEmpresas(
  [{ situacao: 'REGULAR', nome_empresa: 'VIAÇÃO SÃO JOSÉ', cod: 103 }], 'ativas', 'sao jose'),
  [{ situacao: 'REGULAR', nome_empresa: 'VIAÇÃO SÃO JOSÉ', cod: 103 }]);

console.log(`domain module: ${13 + ESPERADOS.length + 3}/${13 + ESPERADOS.length + 3}`);
