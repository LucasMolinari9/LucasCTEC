'use strict';
/* Ponte CommonJS para `src/data/` — irmã do `pure.harness.js`, e pelo mesmo motivo: o que o
   `sbFetch.test.js` e o `environment.test.js` exercitam é a MESMA implementação que o navegador
   executa, não uma cópia dela.

   Este arquivo já foi 153 linhas com DOZE blocos `@canon` — cópias verbatim da seção
   `SUPABASE CONFIG` do `app.js` mais o `preencherLookup`, cada uma guardada contra deriva pelo
   mecanismo `tests/canon.js` + `tests/drift.test.js` + §[2] do `check.js`. As cópias existiam só
   porque a camada de dado morava dentro do IIFE. A Fase B do plano das fatias 3-4 a extraiu para
   `src/data/rest.mjs` e `src/data/lookups.mjs`, e com a última cópia foi embora o mecanismo
   inteiro: `canon.js`, `drift.test.js` e a §[2] se aposentaram por PERDER O OBJETO, não por corte
   de rigor. Processo que existia para compensar código não-modular morre quando o código vira
   módulo — é o único jeito de a conta de processo cair de verdade.

   REGRA, se alguém precisar testar função nova de acesso a dado: extraia-a para `src/data/` e
   faça `require` dela aqui. Recolar uma cópia local é regressão, não atalho.

   `SB_TIMEOUT_MS` continua settable porque o teste de timeout precisa encurtá-lo — mas agora a
   escrita RECRIA o cliente com o teto novo, em vez de mutar uma variável de módulo. É a diferença
   que a injeção de config comprou. */
const rest = require('../src/data/rest.mjs');
const { preencherLookup } = require('../src/data/lookups.mjs');

const SB = { url: 'https://example.invalid', key: 'fake-anon-key' };
let timeoutMs = rest.SB_TIMEOUT_MS;
let cliente = rest.criarRest({ url: SB.url, key: SB.key, timeoutMs });

module.exports = {
  get SB_TIMEOUT_MS(){ return timeoutMs; },
  set SB_TIMEOUT_MS(v){
    timeoutMs = v;
    cliente = rest.criarRest({ url: SB.url, key: SB.key, timeoutMs });
  },
  SB_RETRIES: rest.SB_RETRIES,
  SB_MAX_ROWS: rest.SB_MAX_ROWS,
  selecionarSupabase: rest.selecionarSupabase,
  esperar: rest.esperar,
  fetchComTimeout: rest.fetchComTimeout,
  // delega no cliente ATUAL (o setter acima pode tê-lo trocado), não numa referência congelada
  sbFetch: (...args) => cliente.sbFetch(...args),
  marcarTrunc: rest.marcarTrunc,
  bannerTrunc: rest.bannerTrunc,
  CANCELADO: rest.CANCELADO,
  ehCancelamento: rest.ehCancelamento,
  preencherLookup,
};
