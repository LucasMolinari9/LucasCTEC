'use strict';
/* Extrator e conferidor das cópias verbatim dos harness.
   Usado pelo `check.js` (seção [1]) e pelo `drift.test.js`.

   MÓDULO PRÓPRIO de propósito: o `check.js` roda o gate inteiro no topo do arquivo,
   então um `require('./check.js')` a partir do teste executaria o gate como efeito
   colateral. Este arquivo não faz nada ao ser importado.

   ── O problema que isto resolve ────────────────────────────────────────────────
   Os testes de lógica pura rodam sobre CÓPIAS das funções do `app.js`, mantidas nos
   `*.harness.js`. A guarda que garantia que a cópia seguia igual ao original era
   `js.includes(snippet)`, com o `snippet` escrito à mão — e em 15 dos 50 casos o
   snippet era só a assinatura da função. Ou seja: a guarda perguntava se existia uma
   linha `function matchEvent(r, c){` no `app.js`, e o corpo era irrelevante. Medido em
   08/08/2026: trocando o corpo de `matchEvent` por `return false`, o gate saía "tudo
   verde", os 213 testes puros passavam e as 17 views também.

   ── Por que marcador e não parser ─────────────────────────────────────────────
   A alternativa óbvia — extrair o bloco da função do `app.js` contando chaves — é
   justamente a armadilha: ao sondar isto, um extrator ingênuo deu 6 falsos negativos
   só em funções de uma linha (`groupBy`, `fmtMoney`, …), porque procurava `\n}\n` e
   elas fecham na mesma linha. Com marcador, a fronteira é declarada, não inferida:
   funciona igual para função de uma linha e de trinta, e aparece no diff. */

/* Fronteira de uma cópia:
     /* @canon <nome> [comentário opcional] *\/
     …texto copiado verbatim do app.js…
     /* @endcanon *\/
   A variante `@canon-adaptado <nome> — <por quê>` marca cópia que MUDA de propósito
   (as constantes de conexão do harness.js apontam para host falso; o SB_TIMEOUT_MS é
   `let` para o teste de timeout poder encurtá-lo). Adaptada não é cobrada — mas o
   motivo fica escrito no marcador, visível no diff, em vez de virar exceção silenciosa. */
const RE_CANON = /\/\*\s*@canon(-adaptado)?\s+([A-Za-z_$][\w$]*)[^\n]*?\*\/\n([\s\S]*?)\n\/\*\s*@endcanon\s*\*\//g;

/** Lê um harness e devolve Map<nome, { texto, adaptado }>. */
function extrairCanon(src){
  const mapa = new Map();
  RE_CANON.lastIndex = 0;                     // regex global é stateful entre chamadas
  let m;
  while ((m = RE_CANON.exec(src)) !== null){
    mapa.set(m[2], { texto: m[3], adaptado: !!m[1] });
  }
  return mapa;
}

/** Devolve os nomes cuja cópia NÃO aparece no `js`. Adaptadas são puladas. */
function conferirCanon(mapa, js){
  const fora = [];
  for (const [nome, { texto, adaptado }] of mapa){
    if (adaptado) continue;
    if (!js.includes(texto)) fora.push(nome);
  }
  return fora;
}

module.exports = { extrairCanon, conferirCanon };
