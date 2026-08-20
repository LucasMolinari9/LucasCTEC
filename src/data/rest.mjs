// Acesso REST ao PostgREST do Supabase — o ÚNICO ponto do portal que fala com a rede.
//
// Nada aqui conhece view, DOM ou regra de negócio: só HTTP, timeout/retry e o formato cru do
// PostgREST. É o limite Domain→Infrastructure que o `app.js` já descrevia em prosa e agora tem
// arquivo próprio, saído da seção `SUPABASE CONFIG` na Fase B do plano das fatias 3-4.
//
// A INTERFACE ESCONDE timeout, retry e truncagem — condição literal do estudo de modularização,
// e o motivo de o módulo existir. Quem chama escreve `sbFetch('tabela', 'query')` e não decide
// nada sobre AbortController, backoff ou teto de linhas; se um dia o backend mudar, muda aqui.
//
// CONFIG É INJETADA, não lida de global: `criarRest({ url, key, fetch })`. Isso é o que torna o
// módulo testável sem navegador e sem rede — e o que impede que ele volte a depender de um
// `SB` de módulo, que era exatamente o acoplamento que a extração veio desfazer.
//
// O QUE **NÃO** VEIO JUNTO, e por quê: `SB_URL`, `SB_KEY`, `SB_TESTE_URL`, `SB_TESTE_KEY` e
// `HOSTS_PROD` continuam literais no topo do `app.js`. Não é esquecimento: `check_deriva.mjs`,
// `check_realtime.mjs`, `check_data_quality.mjs` e `check_grants.mjs` extraem as duas primeiras
// de lá por regex (`/const SB_URL\s*=\s*'([^']+)'/`) para saber qual banco auditar. Movê-las
// cegaria os quatro de uma vez, e em silêncio.

/** Erro de requisição CANCELADA de propósito (a busca ficou obsoleta) — distinto de timeout e de
 *  falha de rede. Quem chama trata isto como "ignore em silêncio", não como erro para exibir. */
export const CANCELADO = 'RequisicaoCancelada';
export const ehCancelamento = e => e && e.name === CANCELADO;

export const SB_TIMEOUT_MS = 20000;   // teto por requisição: evita a tela presa em "Carregando…" pra sempre
export const SB_RETRIES    = 2;       // tentativas extras só p/ erros transitórios (rede / 5xx / 429)

// Teto do PostgREST: `pgrst.db_max_rows` do role `authenticator`. Confirmado contra o banco vivo
// em 09/08/2026 e versionado em docs/backup_schema.sql (bloco LIMITES DE ROLE), além de descrito
// no CLAUDE.md (seção Supabase). Subir o teto exige mudar os TRÊS na mesma tarefa: o banco, esta
// constante e a baseline — a baseline porque um restore sem ela devolve o banco sem teto nenhum,
// e sem sintoma; esta constante porque o `marcarTrunc` a usa como segundo critério de truncagem.
export const SB_MAX_ROWS = 30000;

export const esperar = ms => new Promise(r => setTimeout(r, ms));

const cancelado = () => Object.assign(new Error('cancelado'), { name: CANCELADO });

/** Escolhe produção × teste por ALLOWLIST de hostname.
 *
 *  Produção é allowlist, não o contrário: URL de preview do Vercel carrega hash gerado por deploy
 *  e é impossível de listar. Todo host fora de `hostsProd` cai no banco de teste, então uma branch
 *  nova nasce apontando para teste — nunca para produção. Mesma doutrina do `.vercelignore` e do
 *  default-deny do banco: o objeto novo nasce fechado. Configuração ausente LANÇA; preview jamais
 *  pode usar produção como fallback. */
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

/** `fetch` com timeout via AbortController — cancela a requisição se passar do teto.
 *
 *  `sinal` (opcional) é um AbortSignal EXTERNO, de quem quer cancelar antes disso (busca
 *  obsoleta). Os dois são compostos, e a distinção entre eles é preservada: timeout vira mensagem
 *  para o usuário, cancelamento externo é engolido. Sem essa distinção, trocar de termo de busca
 *  pintaria "Tempo de resposta esgotado" na tela.
 *
 *  `fetchFn` é resolvido na CHAMADA, não na importação: um teste que troca `globalThis.fetch`
 *  depois de importar o módulo continua sendo obedecido. */
export async function fetchComTimeout(url, opts = {}, timeoutMs = SB_TIMEOUT_MS, sinal, fetchFn){
  if (sinal && sinal.aborted) throw cancelado();
  const executar = fetchFn || globalThis.fetch;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const repassar = () => ctrl.abort();
  if (sinal) sinal.addEventListener('abort', repassar, { once: true });
  try {
    return await executar(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    // o abort veio de fora, não do relógio
    if (sinal && sinal.aborted) throw cancelado();
    throw e;
  } finally {
    clearTimeout(t);
    if (sinal) sinal.removeEventListener('abort', repassar);
  }
}

/** Marca (sem alterar o conteúdo) um array de resultados que provavelmente foi CORTADO:
 *  só sinaliza quando a consulta tinha um limit "de lista" (>=50) e veio cheio até o teto.
 *  A flag é não-enumerável → JSON.stringify/map/spread ignoram; só quem checa `rows._trunc` vê.
 *
 *  O teto efetivo é o MENOR entre o limit pedido e o do servidor: um `limit` maior que
 *  `SB_MAX_ROWS` sairia cortado em silêncio pelo critério antigo, porque `data.length` (30000)
 *  nunca alcança `lim` (50000) — sem banner e sem toast. Hoje não dispara (os maiores limits do
 *  app.js são exatamente 30000); é armadilha armada para a próxima consulta grande. */
export function marcarTrunc(data, qs, maxRows = SB_MAX_ROWS){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (m){
    const teto = Math.min(+m[1], maxRows);
    if (teto >= 50 && data.length >= teto){
      Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
      Object.defineProperty(data, '_limite', { value:teto, enumerable:false });
    }
  }
  return data;
}

/** Banner de aviso quando a lista foi truncada (atingiu o limite da consulta).
 *  Devolve HTML de propósito: a flag `_trunc` é um conceito DESTE módulo (só ele a põe), e um
 *  chamador que tivesse de traduzi-la em texto acabaria com a regra duplicada em cada tela. */
export function bannerTrunc(rows){
  return (rows && rows._trunc)
    ? `<div class="trunc-aviso"><b>Resultado parcial:</b> mostrando os primeiros ${rows._limite}. Refine a busca para encontrar itens mais específicos.</div>`
    : '';
}

/** Cria o cliente REST. É a interface profunda do módulo: devolve `sbFetch(table, qs, sinal)` e
 *  mais nada — timeout, backoff e truncagem ficam do lado de dentro.
 *
 *  @param url      base do projeto Supabase (sem barra final)
 *  @param key      chave pública (anon) — vai em `apikey` e `Authorization`
 *  @param fetch    implementação de fetch (opcional; default resolve `globalThis.fetch` na chamada)
 *  @param timeoutMs/retries/maxRows  tetos; existem como parâmetro para o teste poder encurtá-los
 *                  sem mexer em variável de módulo, que era como o harness antigo fazia. */
export function criarRest({ url, key, fetch: fetchFn, timeoutMs = SB_TIMEOUT_MS, retries = SB_RETRIES, maxRows = SB_MAX_ROWS } = {}){
  if (!url || !key) throw new Error('criarRest exige `url` e `key`.');

  async function sbFetch(table, qs = '', sinal){
    const alvo = `${url}/rest/v1/${table}?${qs}`;
    let ultimoErro;
    for (let tentativa = 0; tentativa <= retries; tentativa++) {
      try {
        const res = await fetchComTimeout(alvo, {
          headers: { apikey: key, Authorization: `Bearer ${key}` }
        }, timeoutMs, sinal, fetchFn);
        if (!res.ok) {
          // 5xx/429 são transitórios → vale repetir; demais 4xx são definitivos
          if ((res.status >= 500 || res.status === 429) && tentativa < retries) {
            ultimoErro = new Error(`HTTP ${res.status}`);
            await esperar(400 * 2 ** tentativa);          // backoff: 400ms, 800ms
            // o cancelamento pode chegar DURANTE o backoff: sem esta conferência, a tentativa
            // seguinte sairia para a rede depois de a busca já ter sido abandonada.
            if (sinal && sinal.aborted) throw cancelado();
            continue;
          }
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        return marcarTrunc(await res.json(), qs, maxRows);
      } catch (e) {
        // cancelamento nunca repete: foi pedido, não é falha.
        if (ehCancelamento(e)) throw e;
        ultimoErro = e;
        const transitorio = (e.name === 'AbortError') || (e instanceof TypeError); // timeout ou falha de rede
        if (transitorio && tentativa < retries) {
          await esperar(400 * 2 ** tentativa);
          if (sinal && sinal.aborted) throw cancelado();
          continue;
        }
        if (e.name === 'AbortError') throw new Error('Tempo de resposta esgotado — verifique a conexão e tente novamente.');
        throw ultimoErro;
      }
    }
    throw ultimoErro;
  }

  return { sbFetch };
}
