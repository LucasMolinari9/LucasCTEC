'use strict';
const H = require("./harness.js");

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}

// --- Mock fetch infra ---
let calls = 0;
function setFetch(fn){ calls = 0; global.fetch = async (url, opts) => { calls++; return fn(calls, url, opts); }; }
function jsonResp(status, body){
  return { ok: status>=200 && status<300, status, json: async () => body };
}
// a Response whose json() throws (to test 4xx with non-json body via .catch)
function jsonRespBadBody(status){
  return { ok:false, status, json: async () => { throw new Error('not json'); } };
}

(async () => {
  // a) success
  console.log('a) sucesso simples');
  setFetch(() => jsonResp(200, [{id:1},{id:2}]));
  let r = await H.sbFetch('t','select=*');
  ok(Array.isArray(r) && r.length===2 && r[0].id===1, 'a returns array', JSON.stringify(r));
  ok(calls===1, 'a one call', 'calls='+calls);

  // b) retry on 503 then 200
  console.log('b) retry em 5xx');
  setFetch((n) => n===1 ? jsonResp(503,{}) : jsonResp(200,[{ok:true}]));
  r = await H.sbFetch('t','select=*');
  ok(Array.isArray(r) && r.length===1 && r[0].ok===true, 'b returns ok', JSON.stringify(r));
  ok(calls===2, 'b two calls', 'calls='+calls);

  // c) retry on 429 then 200
  console.log('c) retry em 429');
  setFetch((n) => n===1 ? jsonResp(429,{}) : jsonResp(200,[1,2,3]));
  r = await H.sbFetch('t','select=*');
  ok(Array.isArray(r) && r.length===3, 'c returns ok', JSON.stringify(r));
  ok(calls===2, 'c two calls', 'calls='+calls);

  // d) 4xx definitive (400) does not retry, throws body message
  console.log('d) 4xx definitivo (400)');
  setFetch(() => jsonResp(400, {message:'coluna inexistente'}));
  let threw=null;
  try { await H.sbFetch('t','select=*'); } catch(e){ threw=e; }
  ok(threw && threw.message==='coluna inexistente', 'd throws body message', threw && threw.message);
  ok(calls===1, 'd one call (no retry)', 'calls='+calls);

  // d2) 4xx with non-json body -> falls back to HTTP status
  console.log('d2) 4xx corpo não-json');
  setFetch(() => jsonRespBadBody(404));
  threw=null;
  try { await H.sbFetch('t',''); } catch(e){ threw=e; }
  ok(threw && threw.message==='HTTP 404', 'd2 fallback HTTP 404', threw && threw.message);
  ok(calls===1, 'd2 one call', 'calls='+calls);

  // e) network error (TypeError) retries then throws after SB_RETRIES+1 attempts
  console.log('e) erro de rede (TypeError) repete');
  setFetch(() => { throw new TypeError('Failed to fetch'); });
  threw=null;
  try { await H.sbFetch('t','select=*'); } catch(e){ threw=e; }
  ok(threw instanceof TypeError, 'e throws TypeError eventually', threw && threw.name);
  ok(calls === H.SB_RETRIES+1, 'e attempts = SB_RETRIES+1', 'calls='+calls+' expected='+(H.SB_RETRIES+1));

  // f) timeout: fetch never resolves but honors abort signal
  console.log('f) timeout');
  H.SB_TIMEOUT_MS = 50; // shrink
  setFetch((n, url, opts) => new Promise((resolve, reject) => {
    const sig = opts && opts.signal;
    if (sig){
      sig.addEventListener('abort', () => {
        const err = new DOMException('Aborted','AbortError');
        reject(err);
      });
    }
    // never resolves otherwise
  }));
  threw=null;
  const tStart = Date.now();
  try { await H.sbFetch('t','select=*'); } catch(e){ threw=e; }
  const elapsed = Date.now()-tStart;
  ok(threw && /Tempo de resposta esgotado/.test(threw.message), 'f throws timeout message', threw && threw.message);
  ok(elapsed < 5000, 'f did not hang', 'elapsed='+elapsed+'ms');
  // with retries: 3 attempts each ~50ms timeout + backoff 400+800; just sanity that it tried >1
  ok(calls === H.SB_RETRIES+1, 'f attempts = SB_RETRIES+1', 'calls='+calls);
  H.SB_TIMEOUT_MS = 20000; // restore

  // g) marcarTrunc
  console.log('g) marcarTrunc');
  const a80 = Array.from({length:80}, (_,i)=>({i}));
  const r80 = H.marcarTrunc(a80, 'select=*&limit=80');
  ok(r80._trunc===true && r80._limite===80, 'g limit=80 len80 marked', '_trunc='+r80._trunc+' _limite='+r80._limite);

  const a79 = Array.from({length:79}, (_,i)=>({i}));
  const r79 = H.marcarTrunc(a79, 'select=*&limit=80');
  ok(r79._trunc===undefined, 'g len79 not marked', '_trunc='+r79._trunc);

  const a15 = Array.from({length:15}, (_,i)=>({i}));
  const r15 = H.marcarTrunc(a15, 'limit=15');
  ok(r15._trunc===undefined, 'g limit=15 (N<50) not marked', '_trunc='+r15._trunc);

  const aNoLim = Array.from({length:100}, (_,i)=>({i}));
  const rNoLim = H.marcarTrunc(aNoLim, 'select=*');
  ok(rNoLim._trunc===undefined, 'g no limit not marked', '_trunc='+rNoLim._trunc);

  const notArr = {foo:1};
  const rNA = H.marcarTrunc(notArr, 'limit=80');
  ok(rNA===notArr, 'g non-array returned as-is');

  // non-enumerable checks
  ok(!JSON.stringify(r80).includes('_trunc'), 'g _trunc not in JSON.stringify', JSON.stringify(r80).slice(0,40));
  ok(!Object.keys(r80).includes('_trunc'), 'g _trunc not in Object.keys', JSON.stringify(Object.keys(r80).slice(0,3)));
  // extra: spread/map ignore it
  ok([...r80].length===80 && Object.keys(r80.map(x=>x)).includes('0'), 'g spread/map preserve length');

  // g3) limit exactly 50 boundary, full
  const a50 = Array.from({length:50},(_,i)=>i);
  const r50 = H.marcarTrunc(a50, 'limit=50');
  ok(r50._trunc===true && r50._limite===50, 'g limit=50 boundary marked', '_trunc='+r50._trunc);

  // g4) corte feito pelo SERVIDOR: pedimos 50000 e o PostgREST devolveu o teto dele
  // (pgrst.db_max_rows do role `authenticator`). Sem este segundo critério a lista sai
  // truncada sem banner e sem toast, porque data.length (30000) nunca alcança lim (50000).
  const aTeto = Array.from({length:H.SB_MAX_ROWS},(_,i)=>i);
  const rTeto = H.marcarTrunc(aTeto, 'limit=50000');
  ok(rTeto._trunc===true, 'g4 corte do servidor é marcado', '_trunc='+rTeto._trunc);
  ok(rTeto._limite===H.SB_MAX_ROWS, 'g4 limite relatado é o do servidor', '_limite='+rTeto._limite);

  // …e abaixo do teto continua sem marca: pedir mais do que o servidor dá não basta,
  // a resposta precisa ter CHEGADO no teto.
  const aQuase = Array.from({length:H.SB_MAX_ROWS-1},(_,i)=>i);
  ok(H.marcarTrunc(aQuase,'limit=50000')._trunc===undefined, 'g4 abaixo do teto não é marcado');

  // regressão: com limit MENOR que o teto, quem manda continua sendo o limit pedido.
  const a80b = Array.from({length:80},(_,i)=>i);
  const r80b = H.marcarTrunc(a80b, 'limit=80');
  ok(r80b._limite===80, 'g4 limit abaixo do teto reporta o limit pedido', '_limite='+r80b._limite);

  // h) bannerTrunc
  console.log('h) bannerTrunc');
  const banner = H.bannerTrunc(r80);
  ok(/Resultado parcial/.test(banner) && /80/.test(banner), 'h marked -> banner with number', banner);
  ok(H.bannerTrunc(r79)==='', 'h unmarked -> empty');
  ok(H.bannerTrunc(null)==='', 'h null -> empty');
  ok(H.bannerTrunc([])==='', 'h plain array -> empty');

  // i) cancelamento externo (busca obsoleta) — SEC-02
  // Cada caso aqui corresponde a um cuidado levantado na revisão de 27/07/2026. Sem eles o
  // AbortController "funciona" no caso feliz e erra exatamente onde importa.
  console.log('i) cancelamento por busca obsoleta');

  // i1) sinal JÁ abortado: nem chega a sair para a rede.
  {
    const c = new AbortController(); c.abort();
    setFetch(() => jsonResp(200, [{id:1}]));
    let threw = null;
    try { await H.sbFetch('t','select=*', c.signal); } catch(e){ threw = e; }
    ok(H.ehCancelamento(threw), 'i1 sinal ja abortado -> CANCELADO', threw && threw.name);
    ok(calls===0, 'i1 nao foi a rede', 'calls='+calls);
  }

  // i2) aborta DURANTE o voo: vira CANCELADO, não "Tempo de resposta esgotado".
  // A distinção importa: sem ela, trocar de termo pintava erro de timeout na tela.
  {
    const c = new AbortController();
    setFetch(() => new Promise((_res, rej) => {
      c.signal.addEventListener('abort', () => {
        const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
      });
    }));
    const p = H.sbFetch('t','select=*', c.signal);
    setTimeout(() => c.abort(), 10);
    let threw = null;
    try { await p; } catch(e){ threw = e; }
    ok(H.ehCancelamento(threw), 'i2 abort em voo -> CANCELADO', threw && (threw.name+'/'+threw.message));
    ok(!/Tempo de resposta/.test(threw ? threw.message : ''), 'i2 nao vira mensagem de timeout');
  }

  // i3) cancelamento NÃO repete. Um 503 normalmente geraria 3 tentativas; com o sinal abortado
  // durante o backoff, para na primeira.
  {
    const c = new AbortController();
    setFetch((n) => { if (n === 1) { setTimeout(()=>c.abort(), 0); return jsonResp(503, {}); } return jsonResp(200, [{id:9}]); });
    let threw = null;
    try { await H.sbFetch('t','select=*', c.signal); } catch(e){ threw = e; }
    ok(H.ehCancelamento(threw), 'i3 abort durante backoff -> CANCELADO', threw && threw.name);
    ok(calls===1, 'i3 nao tentou de novo depois de cancelado', 'calls='+calls);
  }

  // i4) sem sinal, o comportamento antigo continua igual (503 -> retry -> 200).
  {
    setFetch((n) => n < 3 ? jsonResp(503, {}) : jsonResp(200, [{id:7}]));
    const r4 = await H.sbFetch('t','select=*');
    ok(Array.isArray(r4) && r4[0].id===7, 'i4 sem sinal: retry segue funcionando');
    ok(calls===3, 'i4 tres tentativas', 'calls='+calls);
  }

  // i5) sinal que NUNCA aborta não atrapalha o caminho feliz.
  {
    const c = new AbortController();
    setFetch(() => jsonResp(200, [{id:5}]));
    const r5 = await H.sbFetch('t','select=*', c.signal);
    ok(Array.isArray(r5) && r5[0].id===5, 'i5 sinal ocioso nao interfere');
  }

  // --- j) preencherLookup: falha transitória NÃO pode envenenar o cache ---
  // Regressão do bug de 08/08/2026: `evLookups.emp={}` era gravado DEPOIS do `.catch(()=>[])`,
  // e objeto vazio é truthy — o guard `if(!evLookups.emp)` nunca mais disparava. Uma falha de
  // rede momentânea deixava o Histórico mostrando ids crus pela sessão inteira, sem erro.
  console.log('j) preencherLookup não cacheia falha');
  {
    let n = 0;
    const falhaUmaVez = async () => {
      n++;
      if (n === 1) throw new Error('rede caiu');
      return [{ id: '1', evento_linha: 'ALTERACAO DE ITINERARIO' }];
    };
    const cache = {};
    const r1 = await H.preencherLookup(cache, 'lin', falhaUmaVez, 'evento_linha');
    ok(r1 === null,                'j1 falha devolve null');
    ok(cache.lin === undefined,    'j2 falha NÃO grava no cache', 'cache='+JSON.stringify(cache.lin));
    const r2 = await H.preencherLookup(cache, 'lin', falhaUmaVez, 'evento_linha');
    ok(r2 && r2['1'] === 'ALTERACAO DE ITINERARIO', 'j3 segunda tentativa preenche');
    ok(cache.lin && cache.lin['1'] === 'ALTERACAO DE ITINERARIO', 'j4 sucesso grava no cache');
    ok(n === 2,                    'j5 refez o fetch depois da falha', 'chamadas='+n);
    const r3 = await H.preencherLookup(cache, 'lin', falhaUmaVez, 'evento_linha');
    ok(n === 2,                    'j6 cache quente não refaz o fetch', 'chamadas='+n);
    ok(r3 === cache.lin,           'j7 devolve o cache');
    // resposta vazia LEGÍTIMA (tabela sem linhas) é cacheável — não é falha
    const vazio = {};
    await H.preencherLookup(vazio, 'emp', async () => [], 'evento_empresa');
    ok(vazio.emp && Object.keys(vazio.emp).length === 0, 'j8 lista vazia legítima é cacheada');
  }

  console.log('\n==== PLACAR:', pass+'/'+(pass+fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f=>console.log('  -',f)); process.exit(1); }
})();
