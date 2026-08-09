'use strict';
/* Contrato da bancada headless (scripts/lib/rig.mjs): projeção de `select=` e 400 para
   coluna inexistente. Rode: node rig.test.js  (ou, melhor, node check.js para rodar tudo).

   Por que este teste existe: até 08/08/2026 o `serve()` PULAVA o parâmetro `select` e
   devolvia a fixture inteira. Coluna inexistente não produzia erro nenhum — enquanto o
   PostgREST responde HTTP 400 em produção. Medido: trocar um nome de coluna no `select=`
   do app.js mantinha as 17 views verdes, e a quebra só aparecia para o usuário. É o modo
   de falha que o CLAUDE.md chama de "o pior possível: dado errado na tela, sem erro nenhum".

   FORMATO: CommonJS com import() dinâmico. O repo não tem package.json, então `.js` é
   CommonJS e um `import` estático quebraria; e o check.js só descobre `*.test.js`. */

(async () => {
  const { serve } = await import('../scripts/lib/rig.mjs');

  let pass = 0;
  const fails = [];
  const t = (nome, cond) => cond ? pass++ : fails.push(nome);

  /* --- projeção --- */
  const r1 = serve('municipio_teste', 'select=cod_ibge,nome_municipio');
  t('status 200 em consulta válida', r1.status === 200);
  t('devolve linhas',                Array.isArray(r1.body) && r1.body.length > 0);
  t('projeta SÓ as colunas pedidas', Object.keys(r1.body[0]).join(',') === 'cod_ibge,nome_municipio');

  /* --- coluna inexistente: o caso que passava verde --- */
  const r2 = serve('municipio_teste', 'select=cod_ibge,coluna_que_nao_existe');
  t('coluna ausente → 400',          r2.status === 400);
  t('mensagem nomeia a coluna',      String(r2.body.message).includes('coluna_que_nao_existe'));
  t('dica nomeia a tabela',          String(r2.body.hint).includes('municipio_teste'));

  /* --- sem select: comportamento antigo preservado --- */
  const r3 = serve('municipio_teste', '');
  t('sem select devolve tudo',       r3.status === 200 && r3.body.length > 0);
  t('sem select não projeta',        Object.keys(r3.body[0]).length > 2);

  /* --- filtro + projeção juntos --- */
  const r4 = serve('codempresa_teste', 'codempresa=eq.101&select=nome_empresa');
  t('filtro segue funcionando',      r4.status === 200 && r4.body.length === 1);
  t('projeção depois do filtro',     Object.keys(r4.body[0]).join(',') === 'nome_empresa');

  /* --- as 3 colunas que produção pede e a fixture não tinha (Task 3) --- */
  const r5 = serve('codempresa_teste', 'select=nome_empresa,situacao,processo,data_publicacao,cassada,sob_intervencao');
  t('historicoEmpresa: select real passa', r5.status === 200);
  const r6 = serve('tarifa_atual_teste', 'select=codlinha,nome_ligacao_cresc');
  t('localidades: nome_ligacao_cresc existe', r6.status === 200);

  /* --- RPC continua no mesmo contrato --- */
  const r7 = serve('rpc/divat_busca_logradouro', 'p_termo=vargas&p_limite=10');
  t('rpc devolve {status,body}',     r7.status === 200 && Array.isArray(r7.body));

  console.log('\n==== PLACAR:', pass + '/' + (pass + fails.length), '====');
  if (fails.length){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
