import assert from 'node:assert/strict';
import {
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash,
  fmtLineName, boolChip, situacaoHTML, isLinhaAtiva, isVigente,
} from '../src/domain/core.mjs';

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

console.log('domain module: 12/12');
