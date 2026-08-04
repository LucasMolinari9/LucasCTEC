'use strict';
/* Classificador de prazo — o núcleo do scripts/check_prazos.mjs.
   Rode: node prazos.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: um gate que depende da data de hoje só é confiável se a data for
   injetável. Todo caso aqui fixa `hoje` explicitamente — nenhum depende do relógio. */

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}

(async () => {
  const { classificar, hojeISO } = await import('../scripts/lib/prazos.mjs');

  const base = { id: 'cred', descricao: 'credencial auditora', vence_em: '2026-10-31',
                 aviso_dias: 30, erro_dias: 7, referencia: 'docs/planos/fase-3-hardening-moderado.md' };

  console.log('classificar — níveis por distância até o vencimento');
  ok(classificar(base, '2026-08-04').nivel === 'ok',    'longe do prazo → ok');
  ok(classificar(base, '2026-10-01').nivel === 'aviso', '30 dias exatos → aviso');
  ok(classificar(base, '2026-10-20').nivel === 'aviso', 'dentro do aviso → aviso');
  ok(classificar(base, '2026-10-24').nivel === 'erro',  '7 dias exatos → erro');
  ok(classificar(base, '2026-10-30').nivel === 'erro',  'véspera → erro');
  ok(classificar(base, '2026-10-31').nivel === 'erro',  'no dia → erro');
  ok(classificar(base, '2026-11-05').nivel === 'erro',  'vencido → erro');

  console.log('classificar — a contagem de dias');
  ok(classificar(base, '2026-10-31').dias === 0,  'no dia → 0 dias');
  ok(classificar(base, '2026-11-05').dias === -5, 'vencido → dias negativo');
  ok(classificar(base, '2026-10-01').dias === 30, '30 dias antes → 30');

  console.log('classificar — fail-closed em dado inválido');
  ok(classificar({ ...base, vence_em: 'ontem' }, '2026-08-04').nivel === 'erro',
     'data ilegível → erro, não ok');
  ok(classificar({ ...base, vence_em: '' }, '2026-08-04').nivel === 'erro',
     'data vazia → erro, não ok');

  console.log('hojeISO — injetável');
  process.env.DIVAT_HOJE = '2030-01-02';
  ok(hojeISO() === '2030-01-02', 'DIVAT_HOJE manda em hojeISO()');
  delete process.env.DIVAT_HOJE;
  ok(/^\d{4}-\d{2}-\d{2}$/.test(hojeISO()), 'sem DIVAT_HOJE devolve data no formato ISO curto');

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
