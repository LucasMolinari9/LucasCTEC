'use strict';
/* Ponte CommonJS para os módulos de `src/domain/` — o que o `pure.test.js` exercita é a MESMA
   implementação que o navegador executa, não uma cópia dela.

   Este arquivo já foi o contrário disso: 30 cópias verbatim de funções do app.js (305 linhas),
   guardadas uma a uma pelo mecanismo `@canon` (`tests/canon.js` + `tests/drift.test.js` + §[2] do
   `check.js`). As cópias existiam só porque o código não era modular; cada extração para
   `src/domain/` apagou a cópia e a guarda junto. A última saiu na Sessão 4 do plano de 6, com o
   `view-state.mjs` — por isso não há mais nenhum bloco `@canon` aqui.

   REGRA, se alguém precisar testar função nova: extraia-a para `src/domain/` e faça `require`
   dela aqui. Recolar uma cópia local reprova o §[2] do `check.js` (símbolo exportado sem
   marcador `@canon`), e é regressão, não atalho.

   O `tests/harness.js` — irmão deste — ainda tem cópias `@canon`, das funções que dependem de
   rede/estado do IIFE (`sbFetch` e companhia). Elas saem na Fase B do plano das fatias 3-4, e é
   quando `canon.js`/`drift.test.js` se aposentam. */
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
