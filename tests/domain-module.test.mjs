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
import * as busca from '../src/domain/busca.mjs';
import * as viewState from '../src/domain/view-state.mjs';

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

// busca.mjs: mesmo critério — o CONTRATO que o app.js importa, escrito à mão.
const BUSCA_ESPERADOS = ['yearOf', 'matchEvent', 'localidadesQueCasam', 'orIlike', 'municipiosExatos'];
for (const nome of BUSCA_ESPERADOS) assert.equal(typeof busca[nome], 'function', `busca.${nome} ausente`);
assert.equal(busca.yearOf('1974-03-01'), 1974);
// as DUAS dependências que este módulo resolve no core pelo caminho ESM, uma por família:
// `norm` (acento/caixa) no filtro de evento e na busca de localidade, e `ilikeTerm` no or=()
// — sem ele o `)` e o `*` do termo digitado iriam crus para a sintaxe de filtro do PostgREST.
assert.equal(busca.matchEvent({ descricao: 'REFORMULAÇÃO', data_registro: '2020-06-19' },
  { text: 'reformulacao', proc: '', ano: 2020 }), true);
assert.deepEqual(busca.localidadesQueCasam(['SÃO GONÇALO', 'Maricá'], 'sao goncalo'), ['SÃO GONÇALO']);
assert.equal(busca.orIlike(['via'], ['p)q*']), 'or=(via.ilike.*p%20q%20*)');
assert.deepEqual(busca.municipiosExatos({ 3303302: { nome: 'Niterói' } }, ['niteroi']), ['3303302']);

// view-state.mjs: mesmo critério. `MAX_TABS` é constante, não função — entra separado, e é
// justamente o símbolo que a auditoria de 27/07/2026 achou exportado sem guarda nenhuma.
const VS_ESPERADOS = ['beginGen', 'isCurrentGen', 'commitViewResult', 'pushDetail', 'popDetail',
  'makeCtx', 'withLine', 'withHost', 'nextGen',
  'makeTab', 'openTabState', 'closeTabState', 'tabMatchesEvent', 'dispatchRealtime',
  'pageBounds', 'filtrarSituacao'];
for (const nome of VS_ESPERADOS) assert.equal(typeof viewState[nome], 'function', `view-state.${nome} ausente`);
assert.equal(viewState.MAX_TABS, 5);
// o seam em uma linha: geração nova invalida a anterior, e o commit velho é descartado
{
  const view = { pdfHTML: null };
  const gen1 = viewState.beginGen(view), gen2 = viewState.beginGen(view);
  assert.equal(viewState.commitViewResult(view, gen1, { pdfHTML: 'velho' }), false);
  assert.equal(viewState.commitViewResult(view, gen2, { pdfHTML: 'novo' }), true);
  assert.equal(view.pdfHTML, 'novo');
}
// o CONTEXTO (Fase A): `makeCtx` cunha a geração; `withLine`/`withHost` PRESERVAM view+gen.
// A preservação é o invariante da fase, não detalhe: derivar com geração nova devolveria a
// corrida — a busca velha, que resolve depois, voltaria a poder escrever por cima da nova.
{
  const view = { pdfHTML: null };
  const pane = { id: 'pane1' }, host = { id: 'host1' };
  const ctx = viewState.makeCtx(view, { pane, line: { codlinha: '1' } });
  assert.deepEqual(ctx, { view, gen: 1, pane, host: null, line: { codlinha: '1' } });
  const comLinha = viewState.withLine(ctx, { codlinha: '2' });
  assert.equal(comLinha.gen, ctx.gen);          // MESMA geração
  assert.equal(comLinha.view, view);
  assert.equal(comLinha.pane, pane);
  assert.equal(comLinha.line.codlinha, '2');
  const comHost = viewState.withHost(ctx, host);
  assert.equal(comHost.gen, ctx.gen);
  assert.equal(comHost.host, host);
  // as derivações não mutam o ctx de origem
  assert.equal(ctx.host, null);
  assert.equal(ctx.line.codlinha, '1');
  // `nextGen` é o oposto: MESMA view/pane/host, geração NOVA — e a anterior deixa de valer
  const novo = viewState.nextGen(ctx);
  assert.equal(novo.gen, ctx.gen + 1);
  assert.equal(novo.pane, pane);
  assert.equal(viewState.commitViewResult(ctx.view, ctx.gen, { pdfHTML: 'velho' }), false);
  assert.equal(viewState.commitViewResult(novo.view, novo.gen, { pdfHTML: 'novo' }), true);
  // com a geração preservada, o commit de um ctx derivado por withLine ainda vence
  const derivado = viewState.withLine(novo, { codlinha: '3' });
  assert.equal(viewState.commitViewResult(derivado.view, derivado.gen, { pdfHTML: 'derivado' }), true);
  assert.equal(view.pdfHTML, 'derivado');
  // modal já fechado: makeCtx não explode, e o commit é no-op
  const semView = viewState.makeCtx(null, {});
  assert.equal(semView.gen, null);
  assert.equal(viewState.commitViewResult(semView.view, semView.gen, { pdfHTML: 'x' }), false);
}
assert.deepEqual(viewState.pageBounds(0, 25, 9), { page: 1, totalPages: 1, start: 0, end: 0 });
assert.deepEqual(viewState.dispatchRealtime(
  [{ id: 1, view: { tables: ['qh_teste'] } }, { id: 2, view: { tables: ['qh_teste'] } }],
  1, 'qh_teste', {}), { reload: 1, stale: [2] });
// prova que ESTE módulo resolve a própria dependência (isLinhaAtiva vem do core) pelo caminho ESM
assert.deepEqual(viewState.filtrarSituacao(
  [{ cancelado: false, paralisado: false }, { cancelado: true }], 'ativas'),
  [{ cancelado: false, paralisado: false }]);

const TOTAL = 13 + ESPERADOS.length + 3 + BUSCA_ESPERADOS.length + 5 + VS_ESPERADOS.length + 6 + 17;
console.log(`domain module: ${TOTAL}/${TOTAL}`);
