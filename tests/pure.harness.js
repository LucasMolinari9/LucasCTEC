'use strict';
/* As funções puras são importadas dos módulos usados pelo navegador.
   Assim os testes exercitam a implementação real, sem cópias sujeitas a deriva. */
const domain = require('../shared/domain.js');
const viewState = require('../shared/view-state.js');

const { fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, localidadesQueCasam, orIlike, municipiosExatos, resumoRelatorio, resumoFrota, dedupEmpresasPorRJ } = domain;
const { tabMatchesEvent, dispatchRealtime, pageBounds, beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail, MAX_TABS, makeTab, openTabState, closeTabState } = viewState;

module.exports = {
  fmtCode, fmtTime, fmtDate, esc, enc, ilikeTerm, orDash, fmtLineName, byCodlinha, boolChip, situacaoHTML, isLinhaAtiva, isVigente, norm, yearOf, matchEvent, groupBy, countBy, fmtMoney, classifyMunLines, localidadesQueCasam, orIlike, municipiosExatos, resumoRelatorio, resumoFrota, dedupEmpresasPorRJ,
  tabMatchesEvent, dispatchRealtime, pageBounds, beginGen, isCurrentGen, commitViewResult, pushDetail, popDetail, MAX_TABS, makeTab, openTabState, closeTabState,
};
