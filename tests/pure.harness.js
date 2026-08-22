'use strict';
/* Ponte CommonJS para os módulos de `src/domain/`. O `pure.test.js` exercita a mesma
   implementação usada pelo navegador, sem cópias locais de código de produção. */
const { fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm } = require('../src/domain/core.mjs');
const { groupBy, countBy, fmtMoney, byCodlinha, rjOrder, scoreEmpresa, dedupEmpresasPorRJ,
        classifyMunLines, terminaisDoMunicipio, resumoFrota, filtrarFrotaEmpresas } = require('../src/domain/agrupamento.mjs');
const { yearOf, matchEvent, localidadesQueCasam, orIlike, municipiosExatos } = require('../src/domain/busca.mjs');
const { beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail,
        MAX_TABS, makeTab, openTabState, closeTabState,
        tabMatchesEvent, dispatchRealtime, pageBounds, filtrarSituacao } = require('../src/domain/view-state.mjs');

module.exports = {
  filtrarSituacao, scoreEmpresa, dedupEmpresasPorRJ,
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm,
  yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, terminaisDoMunicipio, localidadesQueCasam, orIlike, municipiosExatos,
  tabMatchesEvent, dispatchRealtime,
  rjOrder, resumoFrota, filtrarFrotaEmpresas, pageBounds,
  beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail,
  MAX_TABS, makeTab, openTabState, closeTabState,
};
