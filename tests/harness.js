'use strict';
/* Cópias das funções da seção SUPABASE CONFIG do app.js (dê grep na marca da seção;
   número de linha apodrece). SB_TIMEOUT_MS é `let` aqui, de propósito, para o teste de
   timeout poder encurtá-lo — o resto é verbatim.

   Cada cópia é delimitada pelos marcadores @fonte/@fim: o tests/check.js recorta o bloco
   entre eles e exige que o CORPO INTEIRO exista igual dentro do app.js (a comparação
   normaliza `const`→`let`, que é o que permite a adaptação do SB_TIMEOUT_MS passar).
   SB_URL/SB_KEY/SB abaixo são FIXTURES de teste, não cópias — por isso não têm marcador. */

const SB_URL = 'https://example.invalid';
const SB_KEY = 'fake-anon-key';
const SB = { url: SB_URL, key: SB_KEY };

/* @fonte selecionarSupabase */
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
/* @fim */

/* @fonte esperar */
const esperar = ms => new Promise(r => setTimeout(r, ms));
/* @fim */

/* @fonte SB_TIMEOUT_MS */
let SB_TIMEOUT_MS = 20000;
/* @fim */
/* @fonte SB_RETRIES */
const SB_RETRIES    = 2;
/* @fim */

/* @fonte CANCELADO */
const CANCELADO = 'RequisicaoCancelada';
/* @fim */
/* @fonte ehCancelamento */
const ehCancelamento = e => e && e.name === CANCELADO;
/* @fim */

// fetch com timeout via AbortController — cancela a requisição se passar do teto.
// `sinal` (opcional) é um AbortSignal EXTERNO, de quem quer cancelar antes disso (busca obsoleta).
// Os dois são compostos, e a distinção entre eles é preservada: timeout vira mensagem para o
// usuário, cancelamento externo é engolido. Sem essa distinção, trocar de termo de busca pintaria
// "Tempo de resposta esgotado" na tela.
/* @fonte fetchComTimeout */
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
/* @fim */

/* @fonte sbFetch */
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
/* @fim */

/* @fonte marcarTrunc */
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
/* @fim */
/* @fonte bannerTrunc */
function bannerTrunc(rows){
  return (rows && rows._trunc)
    ? `<div class="trunc-aviso"><b>Resultado parcial:</b> mostrando os primeiros ${rows._limite}. Refine a busca para encontrar itens mais específicos.</div>`
    : '';
}
/* @fim */

module.exports = {
  get SB_TIMEOUT_MS(){ return SB_TIMEOUT_MS; },
  set SB_TIMEOUT_MS(v){ SB_TIMEOUT_MS = v; },
  SB_RETRIES, selecionarSupabase, esperar, fetchComTimeout, sbFetch, marcarTrunc, bannerTrunc,
  CANCELADO, ehCancelamento,
};
