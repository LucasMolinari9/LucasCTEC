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

  console.log('resolverAlvo — o alvo é amarrado ao PROJETO, não só à presença dos campos');
  // O defeito que isto fecha: `ambientes.teste` preenchido com a configuração de PRODUÇÃO passava,
  // porque as checagens só olhavam se ref/url/key existiam. Todo gate de PR falaria com produção
  // imprimindo `· Alvo: teste` (Codex, P1).
  const prodRef = 'lwzsxuaqqeoamukduhev', testeRef = 'gontnlfmothfglssbyyk';
  // A config de produção INTEIRA no slot de teste é internamente coerente — ref, url e key falam
  // do mesmo projeto. Este nível não a pega, e não é omissão: quem a pega é `validarAmbientes`,
  // logo abaixo, sobre o arquivo versionado. O caso vive lá.
  ok(!lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.producao } }, { DIVAT_ALVO: 'teste' })),
     'config de produção inteira PASSA aqui (é coerente) — a recusa é da outra camada');
  ok(lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, ref: prodRef } }, { DIVAT_ALVO: 'teste' })),
     'ref de produção sob o alvo teste lança');
  ok(lanca(() => resolverAlvo({ ...cfg, producao: { ...cfg.producao, ref: testeRef } }, { DIVAT_ALVO: 'producao' })),
     'ref de teste sob o alvo produção lança (a recusa vale nos dois sentidos)');
  ok(lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, url: `https://${prodRef}.supabase.co` } },
                              { DIVAT_ALVO: 'teste' })),
     'ref certo mas URL do outro projeto lança');
  // Host que não é `.supabase.co` passa aqui DE PROPÓSITO: é o que as bancadas usam
  // (`http://127.0.0.1:<porta>`) para que nenhum teste alcance o Supabase. Num arquivo versionado
  // isso é erro, e `validarAmbientes` o reprova.
  ok(!lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, url: 'http://127.0.0.1:9' } },
                               { DIVAT_ALVO: 'teste' })),
     'host fora de supabase.co passa aqui (é o que a fixture offline usa)');
  ok(lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, url: 'nao-e-url' } }, { DIVAT_ALVO: 'teste' })),
     'URL ilegível lança');
  // A chave é conferida quando dá para lê-la: a anon legada é um JWT com `ref` no payload.
  const jwtCom = ref => 'x.' + Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'anon' }))
    .toString('base64url') + '.y';
  ok(lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, key: jwtCom(prodRef) } }, { DIVAT_ALVO: 'teste' })),
     'chave JWT do projeto ERRADO lança, mesmo com ref e url certos');
  ok(!lanca(() => resolverAlvo({ ...cfg, teste: { ...cfg.teste, key: jwtCom(testeRef) } }, { DIVAT_ALVO: 'teste' })),
     'chave JWT do projeto certo passa');
  ok(!lanca(() => resolverAlvo(cfg, { DIVAT_ALVO: 'teste' })),
     'chave que não é JWT continua aceita (limite documentado: sb_publishable_… não traz ref legível)');

  console.log('validarAmbientes — o ambientes.json VERSIONADO aponta para os projetos certos');
  // Esta é a outra metade da guarda, e a divisão é deliberada. `resolverAlvo` confere COERÊNCIA
  // INTERNA (url e key falando do mesmo projeto que o `ref`) — e uma configuração inteiramente
  // trocada É internamente coerente, então ele sozinho não pega o caso da #74. Amarrar o alvo ao
  // ref real dentro do módulo obrigaria as bancadas a usar ref e URL de verdade nas fixtures, e é
  // justamente o ref fictício apontando para 127.0.0.1 que garante que teste nenhum alcança o
  // Supabase. Então a amarração é cobrada aqui, sobre o ARQUIVO VERSIONADO, que é a única via
  // pela qual ele muda — e o desvio aparece no diff de um PR.
  const { validarAmbientes } = await import('../scripts/lib/ambiente.mjs');
  const fs = require('fs'), path = require('path');
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ambientes.json'), 'utf8'));
  const problemas = validarAmbientes(real.ambientes);
  ok(problemas.length === 0, 'scripts/ambientes.json em ordem', problemas.join(' | '));
  ok(validarAmbientes({ ...real.ambientes, teste: { ...real.ambientes.producao } }).length > 0,
     'config de produção no slot de teste é reprovada');
  ok(validarAmbientes({ ...real.ambientes, teste: { ...real.ambientes.teste, ref: prodRef } }).length > 0,
     'ref trocado é reprovado');
  ok(validarAmbientes({ ...real.ambientes, producao: undefined }).length > 0,
     'alvo ausente é reprovado');
  ok(validarAmbientes({ ...real.ambientes, teste: { ...real.ambientes.teste, url: 'https://evil.example.com' } }).length > 0,
     'URL de host de terceiro é reprovada no arquivo versionado');
  ok(validarAmbientes({ ...real.ambientes, teste: { ...real.ambientes.teste, url: 'http://127.0.0.1:9' } }).length > 0,
     'a URL de fixture, legítima na bancada, é reprovada no arquivo versionado');

  console.log('REFS — uma lista só, compartilhada com o auditor');
  const { REFS: refsAmbiente } = await import('../scripts/lib/ambiente.mjs');
  const { REFS: refsAuditor } = await import('../scripts/lib/auditor.mjs');
  ok(refsAmbiente === refsAuditor,
     'lib/auditor.mjs reexporta o MESMO objeto, não uma cópia que pode divergir');

  console.log('ALVOS — o vocabulário é fechado');
  ok(Array.isArray(ALVOS) && ALVOS.length === 2, 'ALVOS tem exatamente dois valores');
  ok(ALVOS.includes('teste') && ALVOS.includes('producao'), 'ALVOS é teste e producao');

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
