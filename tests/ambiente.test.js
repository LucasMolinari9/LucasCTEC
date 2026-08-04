'use strict';
/* Resolução do alvo dos gates de banco (issue #74).
   Rode: node ambiente.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: até 04/08/2026 os quatro gates derivavam SB_URL/SB_KEY dos literais do
   app.js — que são de PRODUÇÃO. Editar o frontend redirecionava um gate. Agora o alvo é
   configuração explícita, e a ausência dela é erro, nunca um default. */

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}
const lanca = fn => { try { fn(); return false; } catch { return true; } };

(async () => {
  const { resolverAlvo, ALVOS } = await import('../scripts/lib/ambiente.mjs');

  const cfg = {
    teste:    { ref: 'gontnlfmothfglssbyyk', url: 'https://gontnlfmothfglssbyyk.supabase.co', key: 'k-teste' },
    producao: { ref: 'lwzsxuaqqeoamukduhev', url: 'https://lwzsxuaqqeoamukduhev.supabase.co', key: 'k-prod' },
  };

  console.log('resolverAlvo — escolha explícita');
  ok(resolverAlvo(cfg, { DIVAT_ALVO: 'teste' }).ref === 'gontnlfmothfglssbyyk', 'teste devolve o ref de teste');
  ok(resolverAlvo(cfg, { DIVAT_ALVO: 'producao' }).ref === 'lwzsxuaqqeoamukduhev', 'producao devolve o ref de produção');
  ok(resolverAlvo(cfg, { DIVAT_ALVO: 'teste' }).key === 'k-teste', 'a chave acompanha o alvo');
  ok(resolverAlvo(cfg, { DIVAT_ALVO: 'teste' }).alvo === 'teste', 'o alvo escolhido vem no resultado');

  console.log('resolverAlvo — fail-closed');
  ok(lanca(() => resolverAlvo(cfg, {})), 'sem DIVAT_ALVO lança, não assume nada');
  ok(lanca(() => resolverAlvo(cfg, { DIVAT_ALVO: '' })), 'DIVAT_ALVO vazio lança');
  ok(lanca(() => resolverAlvo(cfg, { DIVAT_ALVO: 'marte' })), 'alvo desconhecido lança');
  ok(lanca(() => resolverAlvo(cfg, { DIVAT_ALVO: 'PRODUCAO' })), 'valor com caixa diferente lança (sem normalização silenciosa)');
  ok(lanca(() => resolverAlvo({ teste: cfg.teste }, { DIVAT_ALVO: 'producao' })), 'alvo ausente na config lança');
  ok(lanca(() => resolverAlvo({ teste: { ref: 'x' } }, { DIVAT_ALVO: 'teste' })), 'config sem url/key lança');

  console.log('ALVOS — o vocabulário é fechado');
  ok(Array.isArray(ALVOS) && ALVOS.length === 2, 'ALVOS tem exatamente dois valores');
  ok(ALVOS.includes('teste') && ALVOS.includes('producao'), 'ALVOS é teste e producao');

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
