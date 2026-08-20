'use strict';
/* Harness reproducing the SUPABASE CONFIG functions from app.js.
   SB_TIMEOUT_MS is made mutable (let) so the timeout test can shrink it.
   Everything else marcado com @canon é copiado verbatim; o resto vem dos módulos reais. */

// Estes dois NÃO são cópias: saíram do app.js na Fase B2 e o `sbFetch.test.js` exercita o módulo
// real por esta ponte.
//   `bannerTrunc` → `src/ui/doc.mjs`: é markup, não infraestrutura. O par marcar/pintar continua
//     testado junto, que é o que importa — `marcarTrunc` (cópia @canon, ainda no app.js) põe
//     `_trunc`/`_limite`, e o banner os lê.
//   `preencherLookup` → `src/data/lookups.mjs`: o cache de lookup precisa de teste porque o bug
//     que ele corrige é silencioso (cachear a FALHA em vez do resultado).
const { bannerTrunc } = require('../src/ui/doc.mjs');
const { preencherLookup } = require('../src/data/lookups.mjs');

const SB_URL = 'https://example.invalid';
const SB_KEY = 'fake-anon-key';
const SB = { url: SB_URL, key: SB_KEY };

/* @canon selecionarSupabase */
function selecionarSupabase(hostname, config){
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  const hostsProd = (config.hostsProd || []).map(h => String(h).trim().toLowerCase().replace(/\.$/, ''));
  const producao = hostsProd.includes(host);
  const alvo = producao
    ? { url: config.prodUrl,  key: config.prodKey,  ambiente: 'producao' }
    : { url: config.testeUrl, key: config.testeKey, ambiente: 'teste' };
  if (!alvo.url || !alvo.key) {
    throw new Error(`Configuração Supabase ausente para o ambiente de ${alvo.ambiente}.`);
  }
  return Object.freeze({ ...alvo, hostname: host });
}
/* @endcanon */

/* @canon esperar */
const esperar = ms => new Promise(r => setTimeout(r, ms));
/* @endcanon */

/* @canon-adaptado SB_TIMEOUT_MS — `let` em vez de `const`: o teste de timeout precisa encurtá-lo */
let SB_TIMEOUT_MS = 20000;   // copied; made `let` to allow shrinking in timeout test
/* @endcanon */
/* @canon SB_RETRIES */
const SB_RETRIES    = 2;
/* @endcanon */

/* @canon CANCELADO */
const CANCELADO = 'RequisicaoCancelada';
/* @endcanon */
/* @canon ehCancelamento */
const ehCancelamento = e => e && e.name === CANCELADO;
/* @endcanon */

// fetch com timeout via AbortController — cancela a requisição se passar do teto.
// `sinal` (opcional) é um AbortSignal EXTERNO, de quem quer cancelar antes disso (busca obsoleta).
// Os dois são compostos, e a distinção entre eles é preservada: timeout vira mensagem para o
// usuário, cancelamento externo é engolido. Sem essa distinção, trocar de termo de busca pintaria
// "Tempo de resposta esgotado" na tela.
/* @canon fetchComTimeout */
async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS, sinal){
  if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const repassar = () => ctrl.abort();
  if (sinal) sinal.addEventListener('abort', repassar, { once: true });
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    // o abort veio de fora, não do relógio
    if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
    throw e;
  } finally {
    clearTimeout(t);
    if (sinal) sinal.removeEventListener('abort', repassar);
  }
}
/* @endcanon */

/* @canon sbFetch */
async function sbFetch(table, qs = '', sinal) {
  const url = `${SB.url}/rest/v1/${table}?${qs}`;
  let ultimoErro;
  for (let tentativa = 0; tentativa <= SB_RETRIES; tentativa++) {
    try {
      const res = await fetchComTimeout(url, {
        headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}` }
      }, SB_TIMEOUT_MS, sinal);
      if (!res.ok) {
        // 5xx/429 são transitórios → vale repetir; demais 4xx são definitivos
        if ((res.status >= 500 || res.status === 429) && tentativa < SB_RETRIES) {
          ultimoErro = new Error(`HTTP ${res.status}`);
          await esperar(400 * 2 ** tentativa);          // backoff: 400ms, 800ms
          // o cancelamento pode chegar DURANTE o backoff: sem esta conferência, a tentativa
          // seguinte sairia para a rede depois de a busca já ter sido abandonada.
          if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
          continue;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return marcarTrunc(await res.json(), qs);
    } catch (e) {
      // cancelamento nunca repete: foi pedido, não é falha.
      if (ehCancelamento(e)) throw e;
      ultimoErro = e;
      const transitorio = (e.name === 'AbortError') || (e instanceof TypeError); // timeout ou falha de rede
      if (transitorio && tentativa < SB_RETRIES) {
        await esperar(400 * 2 ** tentativa);
        if (sinal && sinal.aborted) throw Object.assign(new Error('cancelado'), { name: CANCELADO });
        continue;
      }
      if (e.name === 'AbortError') throw new Error('Tempo de resposta esgotado — verifique a conexão e tente novamente.');
      throw ultimoErro;
    }
  }
  throw ultimoErro;
}
/* @endcanon */

/* @canon SB_MAX_ROWS */
const SB_MAX_ROWS = 30000;
/* @endcanon */
/* @canon marcarTrunc */
function marcarTrunc(data, qs){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (m){
    const teto = Math.min(+m[1], SB_MAX_ROWS);
    if (teto >= 50 && data.length >= teto){
      Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
      Object.defineProperty(data, '_limite', { value:teto, enumerable:false });
    }
  }
  return data;
}
/* @endcanon */
module.exports = {
  get SB_TIMEOUT_MS(){ return SB_TIMEOUT_MS; },
  set SB_TIMEOUT_MS(v){ SB_TIMEOUT_MS = v; },
  SB_RETRIES, SB_MAX_ROWS, selecionarSupabase, esperar, fetchComTimeout, sbFetch, marcarTrunc, bannerTrunc,
  CANCELADO, ehCancelamento, preencherLookup,
};
