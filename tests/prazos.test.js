'use strict';
/* Classificador de prazo — o núcleo do scripts/check_prazos.mjs.
   Rode: node prazos.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: um gate que depende da data de hoje só é confiável se a data for
   injetável. Todo caso aqui fixa `hoje` explicitamente — nenhum depende do relógio. */

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}

// Cria um root temporário com scripts/prazos.json contendo `prazosArr`, roda `fn(root)` e
// apaga tudo ao final (mesmo se `fn` lançar) — lerPrazos/prazoPorId leem arquivo, então o
// teste precisa de um arquivo de verdade, não de um mock.
async function comRootTemp(prazosArr, fn) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'prazos-test-'));
  await fsp.mkdir(path.join(root, 'scripts'), { recursive: true });
  await fsp.writeFile(path.join(root, 'scripts', 'prazos.json'),
    JSON.stringify({ prazos: prazosArr }), 'utf8');
  try { return await fn(root); }
  finally { await fsp.rm(root, { recursive: true, force: true }); }
}

(async () => {
  const { classificar, hojeISO, lerPrazos, prazoPorId } = await import('../scripts/lib/prazos.mjs');

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
  // Data com FORMA válida e CALENDÁRIO impossível. `Date.parse('2026-02-30T00:00:00Z')` não
  // devolve NaN — normaliza para 02/03, silenciosamente. Sem conferir a volta, um erro de
  // digitação no prazos.json desloca a cobrança em dias sem ninguém ver (achado do Codex, P2).
  //
  // A referência é 2026-01-01 e as datas estão TODAS no futuro dela, de propósito: com uma data
  // passada, `erro` sairia por vencimento e o caso passaria sem exercitar guarda nenhuma —
  // exatamente o falso verde que esta bancada existe para não produzir.
  const REF = '2026-01-01';
  for (const impossivel of ['2026-02-30', '2026-04-31', '2026-06-31', '2027-02-29']) {
    const r = classificar({ ...base, vence_em: impossivel }, REF);
    ok(r.nivel === 'erro' && /ilegível/.test(r.mensagem),
       `data impossível '${impossivel}' → erro de leitura, não normalização silenciosa`,
       `${r.nivel}: ${r.mensagem}`);
  }
  // O outro lado: data real de calendário no futuro continua passando, inclusive 29/02 bissexto.
  for (const real of ['2026-02-28', '2028-02-29', '2026-12-31']) {
    const r = classificar({ ...base, vence_em: real }, REF);
    ok(r.nivel !== 'erro', `data real '${real}' continua aceita`, `${r.nivel}: ${r.mensagem}`);
  }

  console.log('hojeISO — injetável');
  process.env.DIVAT_HOJE = '2030-01-02';
  ok(hojeISO() === '2030-01-02', 'DIVAT_HOJE manda em hojeISO()');
  delete process.env.DIVAT_HOJE;
  ok(/^\d{4}-\d{2}-\d{2}$/.test(hojeISO()), 'sem DIVAT_HOJE devolve data no formato ISO curto');

  console.log('lerPrazos — valida TIPO além de presença (não só ausência do campo)');
  const prazoOK = { id: 'x', descricao: 'desc', vence_em: '2026-01-01',
                    aviso_dias: 30, erro_dias: 7, referencia: 'docs/ref.md' };

  await comRootTemp([{ ...prazoOK, aviso_dias: '30' }], async root => {
    try { await lerPrazos(root); ok(false, "aviso_dias como string → lança Error"); }
    catch (e) { ok(e instanceof Error, "aviso_dias como string → lança Error", e.message); }
  });

  // Este é o caso que motivou o achado: erro_dias:'0' (string) passava pela validação de
  // presença, caía no default 7 do classificar() e o gate quebrava 7 dias antes do prometido.
  await comRootTemp([{ ...prazoOK, erro_dias: '0' }], async root => {
    try { await lerPrazos(root); ok(false, "erro_dias como string → lança Error (caso do achado)"); }
    catch (e) { ok(e instanceof Error, "erro_dias como string → lança Error (caso do achado)", e.message); }
  });

  await comRootTemp([{ ...prazoOK, vence_em: 20260101 }], async root => {
    try { await lerPrazos(root); ok(false, "vence_em como número → lança Error"); }
    catch (e) { ok(e instanceof Error, "vence_em como número → lança Error", e.message); }
  });

  await comRootTemp([prazoOK], async root => {
    try {
      const lista = await lerPrazos(root);
      ok(Array.isArray(lista) && lista.length === 1 && lista[0].id === 'x',
         'arquivo válido → devolve a lista, sem lançar');
    } catch (e) { ok(false, 'arquivo válido → devolve a lista, sem lançar', e.message); }
  });

  console.log('prazoPorId');
  await comRootTemp([prazoOK], async root => {
    try { await prazoPorId(root, 'nao-existe'); ok(false, 'id inexistente → lança Error'); }
    catch (e) { ok(e instanceof Error, 'id inexistente → lança Error', e.message); }
  });

  await comRootTemp([prazoOK], async root => {
    const achado = await prazoPorId(root, 'x');
    ok(achado && achado.id === 'x' && achado.descricao === 'desc', 'id existente → devolve o prazo certo');
  });

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
