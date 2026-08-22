// Fronteira única do PostgREST. Consumidores conhecem apenas configuração, consulta e
// cancelamento; timeout, retry, backoff e marcação de truncagem são detalhes deste módulo.

const SB_TIMEOUT_MS = 20000;
const SB_RETRIES = 2;
const SB_MAX_ROWS = 30000;
const CANCELADO = 'RequisicaoCancelada';

let configuracao = null;

export function selecionarSupabase(hostname, config){
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

export function configurarRest({ url, key, fetch: fetchImpl } = {}){
  if (!url || !key || typeof fetchImpl !== 'function') {
    throw new Error('src/data/rest.mjs: configurarRest requer url, key e fetch');
  }
  configuracao = Object.freeze({ url, key, fetch: fetchImpl });
}

const esperar = ms => new Promise(r => setTimeout(r, ms));
export const ehCancelamento = e => e && e.name === CANCELADO;
const cancelar = () => Object.assign(new Error('cancelado'), { name: CANCELADO });

async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS, sinal){
  if (sinal && sinal.aborted) throw cancelar();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const repassar = () => ctrl.abort();
  if (sinal) sinal.addEventListener('abort', repassar, { once: true });
  try {
    return await configuracao.fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (sinal && sinal.aborted) throw cancelar();
    throw e;
  } finally {
    clearTimeout(t);
    if (sinal) sinal.removeEventListener('abort', repassar);
  }
}

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

export async function sbFetch(table, qs = '', sinal) {
  if (!configuracao) throw new Error('src/data/rest.mjs: configurarRest não foi chamado');
  const url = `${configuracao.url}/rest/v1/${table}?${qs}`;
  let ultimoErro;
  for (let tentativa = 0; tentativa <= SB_RETRIES; tentativa++) {
    try {
      const res = await fetchComTimeout(url, {
        headers: { apikey: configuracao.key, Authorization: `Bearer ${configuracao.key}` }
      }, SB_TIMEOUT_MS, sinal);
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && tentativa < SB_RETRIES) {
          ultimoErro = new Error(`HTTP ${res.status}`);
          await esperar(400 * 2 ** tentativa);
          if (sinal && sinal.aborted) throw cancelar();
          continue;
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      return marcarTrunc(await res.json(), qs);
    } catch (e) {
      if (ehCancelamento(e)) throw e;
      ultimoErro = e;
      const transitorio = (e.name === 'AbortError') || (e instanceof TypeError);
      if (transitorio && tentativa < SB_RETRIES) {
        await esperar(400 * 2 ** tentativa);
        if (sinal && sinal.aborted) throw cancelar();
        continue;
      }
      if (e.name === 'AbortError') throw new Error('Tempo de resposta esgotado — verifique a conexão e tente novamente.');
      throw ultimoErro;
    }
  }
  throw ultimoErro;
}
