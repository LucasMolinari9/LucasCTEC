// Cache de lookup (id → rótulo) das tabelas auxiliares — municípios, origens, empresas e os dois
// dicionários de evento. Saiu da seção `STATE + CACHES` do `app.js` na Fase B do plano das fatias
// 3-4, junto com o `rest.mjs`: era a última cópia `@canon` do `tests/harness.js`, e enquanto ela
// morasse no IIFE o mecanismo `canon.js`/`drift.test.js` não podia se aposentar.
//
// O cache é passado por PARÂMETRO, não guardado aqui: quem decide o tempo de vida dele é o
// `app.js` (o Realtime o invalida em `invalidateCaches`). Um cache de módulo daria a este arquivo
// um estado global escondido — o oposto do que a extração veio fazer.

/** Preenche `cache[chave]` com o mapa `{ id: linha[coluna] }` devolvido por `buscar()`.
 *
 *  A regra que justifica o teste: **falha NÃO é cacheada.** `buscar()` que rejeita vira `null`, e
 *  `null` sai sem gravar — a próxima chamada tenta de novo. Sem isso, uma falha de rede
 *  transitória envenenava o cache pelo resto da sessão e o Histórico passava a renderizar o
 *  código cru no lugar do nome do evento, para sempre e sem erro no console. Repare que `[]` (veio
 *  vazio de verdade) é resposta legítima e É cacheada: a distinção entre "falhou" e "não tem" é o
 *  ponto inteiro desta função. */
export async function preencherLookup(cache, chave, buscar, coluna){
  if (cache[chave]) return cache[chave];
  const rows = await buscar().catch(() => null);   // null = falhou; [] = veio vazio de verdade
  if (!rows) return null;                          // não cacheia falha
  const m = {};
  rows.forEach(x => { m[x.id] = x[coluna]; });
  cache[chave] = m;
  return m;
}
