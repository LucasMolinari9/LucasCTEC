'use strict';
/* Harness reproducing the SUPABASE CONFIG functions from index.html (lines 618-684).
   SB_TIMEOUT_MS is made mutable (let) so the timeout test can shrink it.
   Everything else is copied verbatim. */

const SB_URL = 'https://example.invalid';
const SB_KEY = 'fake-anon-key';

const esperar = ms => new Promise(r => setTimeout(r, ms));

let SB_TIMEOUT_MS = 20000;   // copied; made `let` to allow shrinking in timeout test
const SB_RETRIES    = 2;

async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function sbFetch(table, qs = '') {
  const url = `${SB_URL}/rest/v1/${table}?${qs}`;
  let ultimoErro;
  for (let tentativa = 0; tentativa <= SB_RETRIES; tentativa++) {
    try {
      const res = await fetchComTimeout(url, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
      });
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && tentativa < SB_RETRIES) {
          ultimoErro = new Error(`HTTP ${res.status}`);
          await esperar(400 * 2 ** tentativa);
          continue;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return marcarTrunc(await res.json(), qs);
    } catch (e) {
      ultimoErro = e;
      const transitorio = (e.name === 'AbortError') || (e instanceof TypeError);
      if (transitorio && tentativa < SB_RETRIES) { await esperar(400 * 2 ** tentativa); continue; }
      if (e.name === 'AbortError') throw new Error('Tempo de resposta esgotado — verifique a conexão e tente novamente.');
      throw ultimoErro;
    }
  }
  throw ultimoErro;
}

function marcarTrunc(data, qs){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (m){
    const lim = +m[1];
    if (lim >= 50 && data.length >= lim){
      Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
      Object.defineProperty(data, '_limite', { value:lim,  enumerable:false });
    }
  }
  return data;
}
function bannerTrunc(rows){
  return (rows && rows._trunc)
    ? `<div class="trunc-aviso"><b>Resultado parcial:</b> mostrando os primeiros ${rows._limite}. Refine a busca para encontrar itens mais específicos.</div>`
    : '';
}

module.exports = {
  get SB_TIMEOUT_MS(){ return SB_TIMEOUT_MS; },
  set SB_TIMEOUT_MS(v){ SB_TIMEOUT_MS = v; },
  SB_RETRIES, esperar, fetchComTimeout, sbFetch, marcarTrunc, bannerTrunc,
};
