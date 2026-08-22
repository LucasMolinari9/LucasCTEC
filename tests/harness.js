'use strict';
/* Ponte CommonJS para os módulos reais exercitados por sbFetch.test.js. */

// A ponte importa a fronteira REST e seus consumidores reais; não replica código de produção.
const { bannerTrunc } = require('../src/ui/doc.mjs');
const { preencherLookup } = require('../src/data/lookups.mjs');
const {
  configurarRest, selecionarSupabase, sbFetch, ehCancelamento,
} = require('../src/data/rest.mjs');

const SB_URL = 'https://example.invalid';
const SB_KEY = 'fake-anon-key';
let fetchImpl = global.fetch;

function configurarFetch(fn){
  fetchImpl = fn;
  configurarRest({ url: SB_URL, key: SB_KEY, fetch: fetchImpl });
}

module.exports = {
  selecionarSupabase, sbFetch, bannerTrunc, ehCancelamento, preencherLookup,
  configurarFetch,
};
