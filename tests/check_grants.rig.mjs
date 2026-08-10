// Bancada offline do check_grants.mjs — prova que o gate APERTA.
//
// Por que não está no tests/check.js: sobe um servidor HTTP e um processo filho; o contrato do
// check.js é ser offline e sem efeitos. Rode à mão:  NO_PROXY=127.0.0.1 node tests/check_grants.rig.mjs
//
// Por que existe: um gate de segurança que nunca foi visto falhando é fé, não garantia. Os dois
// últimos casos da lista `casos` (caminho FALLBACK) são os que mais importam — eles cobrem
// FAIL-OPEN: se a RPC devolver lista vazia ou faltando um campo, o gate tem que ABORTAR, não
// relatar "nenhum achado". Foi o modo de falha que quase entrou (tratar `undefined` como `[]` e
// sair 0 exatamente ao perder a visão do banco).
//
// Técnica do stub (fakeroot + servidor HTTP local) registrada em
// docs/historico/handoff-2026-07-27-auditoria-externa.md — a rede até o Supabase é bloqueada no
// ambiente do Claude, então a alternativa seria não testar. Desde o modo duplo (04/08/2026), o
// alvo do script vem de scripts/ambientes.json + DIVAT_ALVO (issue #74), não mais de um app.js
// falso — veja os casos `[digest]` e `[fallback]` abaixo, que exercitam a rota nova
// (divat_security_digest) e o caminho antigo (divat_security_shape) lado a lado.
import { createServer } from 'node:http';
import { mkdir, writeFile, copyFile, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = '/tmp/divat-rig-grants';
const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

let requisicoes = 0;      // conta toda requisição que chega ao stub — usado pelo caso "sem DIVAT_ALVO"
let respostaAtual = null;    // divat_security_shape
let digestAtual = null;      // divat_security_digest — null = função não existe (404)
const srv = createServer((req, res) => {
  requisicoes++;
  if (req.url === '/rest/v1/rpc/divat_security_shape') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respostaAtual));
  } else if (req.url === '/rest/v1/rpc/divat_security_digest') {
    if (digestAtual === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(digestAtual));
  } else { res.writeHead(404); res.end('{}'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORTA = srv.address().port;

await mkdir(`${RAIZ}/scripts`, { recursive: true });
await copyFile(`${REAL}/scripts/check_grants.mjs`, `${RAIZ}/scripts/check_grants.mjs`);

await mkdir(`${RAIZ}/scripts/lib`, { recursive: true });
await copyFile(`${REAL}/scripts/lib/prazos.mjs`, `${RAIZ}/scripts/lib/prazos.mjs`);
await copyFile(`${REAL}/scripts/lib/ambiente.mjs`, `${RAIZ}/scripts/lib/ambiente.mjs`);
await writeFile(`${RAIZ}/scripts/prazos.json`, JSON.stringify({
  nota: 'teste',
  prazos: [{ id: 'check_grants_fallback', descricao: 'fallback', vence_em: '2026-11-30',
             aviso_dias: 30, erro_dias: 0, referencia: 'spec' }],
}, null, 2));
// Alvo vem de DIVAT_ALVO + scripts/ambientes.json (issue #74), não mais do app.js — nada mais
// lê o app.js falso, por isso ele sai do fakeroot.
await writeFile(`${RAIZ}/scripts/ambientes.json`, JSON.stringify({
  nota: 'teste',
  ambientes: {
    teste:    { ref: 'rig', url: `http://127.0.0.1:${PORTA}`, key: 'fake-anon-key' },
    producao: { ref: 'rig-prod', url: 'http://127.0.0.1:1', key: 'fake-prod-key' },
  },
}, null, 2));

// Estado SÃO: espelha o banco de verdade depois das correções do Bloco 1.
const sao = () => ({
  gerado_em: '2026-07-27',
  tabelas: [
    { nome: 'tabela_vista_teste', rls: true, force_rls: false,
      anon: { select: true, insert: false, update: false, delete: false, truncate: false, maintain: false },
      authenticated: { select: true, insert: false, update: false, delete: false, truncate: false, maintain: false },
      policies: [{ nome: 'anon_read_tabela_vista', cmd: 'r' }] },
    { nome: 'evento_dados', rls: true, force_rls: false,
      anon: { select: false, insert: false, update: false, delete: false, truncate: false, maintain: false },
      authenticated: { select: false, insert: false, update: false, delete: false, truncate: false, maintain: false },
      policies: [] },
  ],
  funcoes: [
    { assinatura: 'divat_api_shape()', security_definer: false, search_path_fixo: true,
      public_execute: false, anon_execute: true, authenticated_execute: true },
  ],
  default_privileges: [
    { dono: 'postgres', schema: 'public', tipo: 'r', anon_privs: [], authenticated_privs: [], public_privs: [] },
    { dono: 'supabase_admin', schema: 'public', tipo: 'r',
      anon_privs: ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
      authenticated_privs: ['DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'],
      public_privs: [] },
  ],
});

const baseline = {
  gerado_em: '2026-07-27',
  nota: 'teste',
  achados: [
    { tipo: 'default_privilege_permissivo', alvo: 'supabase_admin:public:r', detalhe: 'limitação de plataforma' },
  ],
};

function rodar(extraArgs = [], hoje = '2026-08-04', alvo = 'teste') {
  return new Promise(res => {
    const env = { ...process.env, DIVAT_HOJE: hoje };
    if (alvo === null) delete env.DIVAT_ALVO; else env.DIVAT_ALVO = alvo;
    const p = spawn('node', [`${RAIZ}/scripts/check_grants.mjs`, ...extraArgs], { cwd: RAIZ, env });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

const casos = [];
const caso = (nome, mutar, esperado) => casos.push({ nome, mutar, esperado });

caso('estado são (só a exceção conhecida)', f => f, 0);
caso('RLS desligada', f => { f.tabelas[0].rls = false; return f; }, 1);
caso('grant de INSERT para anon', f => { f.tabelas[0].anon.insert = true; return f; }, 1);
caso('grant de DELETE para authenticated', f => { f.tabelas[0].authenticated.delete = true; return f; }, 1);
caso('MAINTAIN escondido no ACL', f => { f.tabelas[0].anon.maintain = true; return f; }, 1);
caso('policy de escrita', f => { f.tabelas[0].policies.push({ nome: 'x', cmd: 'w' }); return f; }, 1);
caso('função executável por PUBLIC', f => { f.funcoes[0].public_execute = true; return f; }, 1);
caso('função SECURITY DEFINER', f => { f.funcoes[0].security_definer = true; return f; }, 1);
caso('função sem search_path fixo', f => { f.funcoes[0].search_path_fixo = false; return f; }, 1);
caso('default do postgres reaberto', f => { f.default_privileges[0].anon_privs = ['SELECT']; return f; }, 1);
caso('RPC devolve lista vazia (visão perdida)', f => { f.tabelas = []; return f; }, 1);
caso('RPC sem o campo funcoes', f => { delete f.funcoes; return f; }, 1);
// Os dois abaixo são o achado E da auditoria de 08/08/2026: o guard de "lista vazia não é
// tudo certo, é visão perdida" existia SÓ para `tabelas`. Lista vazia em `funcoes` ou em
// `default_privileges` passava no Array.isArray, o laço simplesmente não iterava, e o gate
// imprimia "nenhum achado" — justo nos dois eixos onde mora o risco 9.1 (os defaults do
// supabase_admin, que não são fecháveis). Perder visão ali e sair 0 é o pior resultado.
caso('funcoes vem vazia (visão perdida)', f => { f.funcoes = []; return f; }, 1);
caso('default_privileges vem vazio (visão perdida)', f => { f.default_privileges = []; return f; }, 1);

await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baseline, null, 2));

let falhas = 0;
for (const c of casos) {
  respostaAtual = c.mutar(sao());
  const { code, out } = await rodar();
  const ok = code === c.esperado;
  if (!ok) falhas++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${c.nome} → saiu ${code}, esperado ${c.esperado}`);
  if (!ok) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
}

// A exceção conhecida DEVE derrubar o gate quando o baseline é ignorado — senão o baseline
// estaria escondendo, não registrando.
respostaAtual = sao();
const cru = await rodar(['--sem-baseline']);
const okCru = cru.code === 1;
if (!okCru) falhas++;
console.log(`${okCru ? '  ✓' : '  ✗'} --sem-baseline expõe a exceção conhecida → saiu ${cru.code}, esperado 1`);

// ---------------------------------------------------------------------------------------------
// Caminho DIGEST (pos-Fase 3). Os casos acima cobrem o FALLBACK, porque digestAtual e null.
// ---------------------------------------------------------------------------------------------
const digestSao = () => ({
  digest: 'a'.repeat(64),
  tabelas_publicas: 18,
  todas_com_rls: true,
  anon_escreve: false,
  anon_maintain: false,
  anon_le_view: false,
  authenticated_tem_privilegio: false,
  funcoes_definer_anon: 0,
  funcoes_sem_search_path: 0,
  defaults_permissivos: 3,
  anon_rpcs: 5,
});

// Baseline na forma da issue #99: `achados` (política) no topo, medição por ambiente. Os dois
// slots são preenchidos e DIFERENTES de propósito — um baseline em que teste e produção têm o
// mesmo valor não distingue "leu o slot certo" de "leu qualquer slot".
const medicaoTeste = { digest: 'a'.repeat(64), anon_rpcs: 5, defaults_permissivos: 3,
                       funcoes_sem_search_path: 0, gerado_em: '2026-08-09' };
const medicaoProducao = { digest: 'f'.repeat(64), anon_rpcs: 5, defaults_permissivos: 3,
                          funcoes_sem_search_path: 0, gerado_em: '2026-08-09' };
const baselineDigest = { ...baseline, ambientes: { teste: medicaoTeste, producao: medicaoProducao } };

async function casoDigest(nome, mutarDigest, esperado, args = [], hoje = '2026-08-04') {
  await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
  digestAtual = mutarDigest(digestSao());
  const { code, out } = await rodar(args, hoje);
  const ok = code === esperado;
  if (!ok) { falhas++; console.log(out.split('\n').map(l => '      ' + l).join('\n')); }
  console.log(`${ok ? '  ✓' : '  ✗'} [digest] ${nome} → saiu ${code}, esperado ${esperado}`);
}

await casoDigest('estado são', d => d, 0);
// --- os CINCO indicadores graves: expectativa fixa no código, nunca baselináveis ---
await casoDigest('anon ganhou escrita', d => { d.anon_escreve = true; return d; }, 1);
await casoDigest('anon ganhou MAINTAIN', d => { d.anon_maintain = true; return d; }, 1);
await casoDigest('anon passou a ler uma view', d => { d.anon_le_view = true; return d; }, 1);
await casoDigest('RLS caiu em alguma tabela', d => { d.todas_com_rls = false; return d; }, 1);
await casoDigest('authenticated ganhou privilegio', d => { d.authenticated_tem_privilegio = true; return d; }, 1);
await casoDigest('funcao SECURITY DEFINER executavel por anon', d => { d.funcoes_definer_anon = 1; return d; }, 1);
// --- as TRÊS contagens: comparadas com o baseline; subir é erro, descer é dívida resolvida ---
await casoDigest('RPC anonima a mais', d => { d.anon_rpcs = 6; return d; }, 1);
await casoDigest('default permissivo novo (o sinal do SEC-01)', d => { d.defaults_permissivos = 4; return d; }, 1);
await casoDigest('funcao perdeu o search_path fixo', d => { d.funcoes_sem_search_path = 1; return d; }, 1);
await casoDigest('contagem DESCEU (dívida resolvida)', d => { d.defaults_permissivos = 2; return d; }, 1);
// --- o digest e a forma ---
await casoDigest('digest mudou, o resto são', d => { d.digest = 'b'.repeat(64); return d; }, 1);
await casoDigest('booleano veio como string (forma inesperada)', d => { d.anon_escreve = 'false'; return d; }, 1);
await casoDigest('booleano veio null (bool_and sobre conjunto vazio)', d => { d.todas_com_rls = null; return d; }, 1);
await casoDigest('contagem veio como string', d => { d.defaults_permissivos = '3'; return d; }, 1);
await casoDigest('campo faltando', d => { delete d.anon_maintain; return d; }, 1);
await casoDigest('poucas tabelas (visão perdida)', d => { d.tabelas_publicas = 0; return d; }, 1);

// --sem-baseline no caminho digest: NÃO pode alegar "bate com o baseline" sobre um baseline que
// nunca leu. Contagens bem longe do baseline gravado (99) provam que a comparação não rolou —
// se o gate as tivesse consultado, teria saído 1 (achado 2 da revisão: antes saía 0 com a
// mensagem de "bate com o baseline", sem ter comparado nada).
digestAtual = { ...digestSao(), defaults_permissivos: 99, anon_rpcs: 99, funcoes_sem_search_path: 99 };
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const cruDigest = await rodar(['--sem-baseline']);
const okCruDigest = cruDigest.code === 0
  && !/bate com o baseline/i.test(cruDigest.out)
  && /não foram comparad/i.test(cruDigest.out);
if (!okCruDigest) { falhas++; console.log(cruDigest.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okCruDigest ? '  ✓' : '  ✗'} [digest] --sem-baseline relata estado cru sem alegar baseline → saiu ${cruDigest.code}, esperado 0`);

// --sem-baseline NÃO PODE ler o baseline — nem para tentar. Até 10/08/2026 a leitura era
// incondicional (rodava ANTES deste `if`), então um security_baseline.json malformado estourava
// o JSON.parse antes do modo cru ter a chance de decidir, e o comando anunciado para inspecionar
// o banco justamente quando o baseline está quebrado ficava inutilizável (Codex, P2).
digestAtual = digestSao();
await writeFile(`${RAIZ}/scripts/security_baseline.json`, '{ isto não é JSON válido');
const cruBaselineRuim = await rodar(['--sem-baseline']);
const okCruBaselineRuim = cruBaselineRuim.code === 0 && !/bate com o baseline/i.test(cruBaselineRuim.out);
if (!okCruBaselineRuim) { falhas++; console.log(cruBaselineRuim.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okCruBaselineRuim ? '  ✓' : '  ✗'} --sem-baseline funciona mesmo com security_baseline.json malformado → saiu ${cruBaselineRuim.code}, esperado 0`);
// O caminho QUE compara (sem --sem-baseline) continua exigindo o arquivo — falha CONTROLADA
// (mensagem, não stack trace) com o mesmo baseline malformado.
const comparaBaselineRuim = await rodar([]);
const okComparaBaselineRuim = comparaBaselineRuim.code === 1 && /ilegível/i.test(comparaBaselineRuim.out);
if (!okComparaBaselineRuim) { falhas++; console.log(comparaBaselineRuim.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okComparaBaselineRuim ? '  ✓' : '  ✗'} sem --sem-baseline, baseline malformado falha com mensagem clara → saiu ${comparaBaselineRuim.code}, esperado 1`);
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));

// --atualizar-baseline NAO pode silenciar a classe perigosa: os booleanos sao expectativa fixa
// no codigo, nao dado de baseline.
digestAtual = { ...digestSao(), anon_escreve: true };
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const tentouSilenciar = await rodar(['--atualizar-baseline']);
const okSilenciar = tentouSilenciar.code === 1;
if (!okSilenciar) falhas++;
console.log(`${okSilenciar ? '  ✓' : '  ✗'} [digest] --atualizar-baseline recusa baselinar anon_escreve → saiu ${tentouSilenciar.code}, esperado 1`);

// --atualizar-baseline preserva os achados documentados (as 3 excecoes do supabase_admin).
digestAtual = { ...digestSao(), digest: 'c'.repeat(64) };
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
await rodar(['--atualizar-baseline']);
const depois = JSON.parse(await readFile(`${RAIZ}/scripts/security_baseline.json`, 'utf8'));
const okPreserva = depois.ambientes.teste.digest === 'c'.repeat(64)
  && depois.achados.length === baseline.achados.length;
if (!okPreserva) falhas++;
console.log(`${okPreserva ? '  ✓' : '  ✗'} [digest] --atualizar-baseline atualiza o digest e PRESERVA os achados`);

// Fecha o ciclo que o achado Critical 1 da revisão mordeu: --atualizar-baseline rodado sobre um
// baseline SEM as três contagens (o formato de antes desta correção, só com `achados`) tem que
// produzir um baseline que a execução NORMAL seguinte aceita de primeira. Gravar só duas das três
// contagens fechava um laço: a execução normal abortava pedindo pra rodar --atualizar-baseline —
// o comando que tinha acabado de rodar e não tinha corrigido nada.
digestAtual = digestSao();
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baseline, null, 2));
await rodar(['--atualizar-baseline']);
const cicloFechado = await rodar();
const okCicloFechado = cicloFechado.code === 0;
if (!okCicloFechado) { falhas++; console.log(cicloFechado.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okCicloFechado ? '  ✓' : '  ✗'} [digest] --atualizar-baseline → execução normal fecha o ciclo → saiu ${cicloFechado.code}, esperado 0`);

// ---------------------------------------------------------------------------------------------
// AMBIENTE (issue #99). A medição — digest e as três contagens — é propriedade DE UM BANCO, e
// este script roda contra dois. Antes da #99 havia um campo só no topo: no dia em que produção
// receber as migrações da Fase 3, os dois passariam a produzir digest e a disputá-lo.
//
// Os casos abaixo só provam alguma coisa porque `medicaoTeste` e `medicaoProducao` DIFEREM.
// ---------------------------------------------------------------------------------------------
const escreverBaseline = obj => writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(obj, null, 2));
async function casoAmbiente(nome, { baseline: b, digest: d, alvo = 'teste', esperado, contem }) {
  await escreverBaseline(b);
  digestAtual = d;
  const { code, out } = await rodar([], '2026-08-04', alvo);
  const ok = code === esperado && (!contem || contem.every(re => re.test(out)));
  if (!ok) { falhas++; console.log(out.split('\n').map(l => '      ' + l).join('\n')); }
  console.log(`${ok ? '  ✓' : '  ✗'} [ambiente] ${nome} → saiu ${code}, esperado ${esperado}`);
}

// O caso que prova que o bug da #99 morreu: o banco devolve exatamente o digest gravado no slot
// de PRODUÇÃO, e o alvo é `teste`. Tem que dar vermelho. Se o script lesse um campo comum — ou
// caísse no primeiro slot que encontrasse —, isto passaria, e um PR seria carimbado com a
// postura do banco errado.
await casoAmbiente('digest de produção NÃO satisfaz o alvo teste', {
  baseline: baselineDigest,
  digest: { ...digestSao(), digest: 'f'.repeat(64) },
  esperado: 1,
  contem: [/superfície de segurança MUDOU/i, /'teste'/],
});
// O outro lado da mesma moeda: com o digest do slot de teste, passa — mesmo com o slot de
// produção ali do lado, divergente.
await casoAmbiente('digest de teste satisfaz o alvo teste, com produção divergente ao lado', {
  baseline: baselineDigest,
  digest: digestSao(),
  esperado: 0,
  contem: [/\[teste\]/],
});
// Slot ausente é ERRO, nunca "primeiro run". Criá-lo em silêncio é como um gate passa a comparar
// contra nada — e a mensagem tem que NOMEAR o ambiente, senão o operador roda
// --atualizar-baseline no alvo errado e sobrescreve a medição boa do outro.
await casoAmbiente('slot do alvo ausente sai 1 nomeando o ambiente', {
  baseline: { ...baseline, ambientes: { producao: medicaoProducao } },
  digest: digestSao(),
  esperado: 1,
  contem: [/slot do ambiente 'teste'/],
});
// Formato ANTIGO (medição no topo, sem `ambientes`): tem que pedir a migração da forma, não
// comparar contra `undefined` e passar.
await casoAmbiente('formato antigo sai 1 pedindo a migração da forma', {
  baseline: { ...baseline, digest: 'a'.repeat(64), anon_rpcs: 5,
              defaults_permissivos: 3, funcoes_sem_search_path: 0 },
  digest: digestSao(),
  esperado: 1,
  contem: [/formato ANTIGO/, /ambientes/],
});

// --atualizar-baseline no alvo `teste` não pode encostar no slot de produção nem no `achados`.
// Sem isso a correção da #99 seria só meia: os dois ambientes deixariam de disputar na LEITURA e
// continuariam se sobrescrevendo na ESCRITA.
await escreverBaseline(baselineDigest);
digestAtual = { ...digestSao(), digest: 'd'.repeat(64), anon_rpcs: 7 };
await rodar(['--atualizar-baseline'], '2026-08-04', 'teste');
const isolado = JSON.parse(await readFile(`${RAIZ}/scripts/security_baseline.json`, 'utf8'));
const okIsolado = isolado.ambientes.teste.digest === 'd'.repeat(64)
  && isolado.ambientes.teste.anon_rpcs === 7
  && JSON.stringify(isolado.ambientes.producao) === JSON.stringify(medicaoProducao)
  && JSON.stringify(isolado.achados) === JSON.stringify(baseline.achados);
if (!okIsolado) { falhas++; console.log('      ' + JSON.stringify(isolado, null, 2).split('\n').join('\n      ')); }
console.log(`${okIsolado ? '  ✓' : '  ✗'} [ambiente] --atualizar-baseline em teste preserva producao e achados`);

// Rodar --atualizar-baseline sobre o formato ANTIGO tem que produzir a forma nova E retirar a
// medição do topo. Deixar as duas cópias vivas é a deriva que nenhum gate enxerga: o script leria
// o slot, o humano leria o topo, e os dois discordariam em silêncio.
await escreverBaseline({ ...baseline, digest: 'a'.repeat(64), anon_rpcs: 5,
                         defaults_permissivos: 3, funcoes_sem_search_path: 0 });
digestAtual = { ...digestSao(), digest: 'e'.repeat(64) };
await rodar(['--atualizar-baseline'], '2026-08-04', 'teste');
const migrado = JSON.parse(await readFile(`${RAIZ}/scripts/security_baseline.json`, 'utf8'));
const normalDepois = await rodar([], '2026-08-04', 'teste');
const okMigrado = migrado.ambientes?.teste?.digest === 'e'.repeat(64)
  && !('digest' in migrado) && !('anon_rpcs' in migrado)
  && !('defaults_permissivos' in migrado) && !('funcoes_sem_search_path' in migrado)
  && normalDepois.code === 0;
if (!okMigrado) { falhas++; console.log('      ' + JSON.stringify(migrado, null, 2).split('\n').join('\n      ')); }
console.log(`${okMigrado ? '  ✓' : '  ✗'} [ambiente] --atualizar-baseline migra a forma antiga e não deixa medição no topo`);

// O ramo --atualizar-baseline do caminho ANTIGO (divat_security_shape) regenera o arquivo
// inteiro. Ele só tem assunto com `achados`, mas escrevia o registro do zero: rodá-lo contra um
// banco pré-Fase 3 (produção, hoje) apagaria os slots de medição já registrados. Dano cruzado
// pela porta dos fundos, exatamente o que a #99 fecha. (O alvo aqui é `teste` só porque é o
// único endereço que o stub atende; o que se mede é o ramo, não o alvo.)
digestAtual = null;
respostaAtual = sao();
await escreverBaseline(baselineDigest);
await rodar(['--atualizar-baseline'], '2026-08-04', 'teste');
const posFallback = JSON.parse(await readFile(`${RAIZ}/scripts/security_baseline.json`, 'utf8'));
const okPosFallback = JSON.stringify(posFallback.ambientes?.teste) === JSON.stringify(medicaoTeste)
  && JSON.stringify(posFallback.ambientes?.producao) === JSON.stringify(medicaoProducao);
if (!okPosFallback) { falhas++; console.log('      ' + JSON.stringify(posFallback, null, 2).split('\n').join('\n      ')); }
console.log(`${okPosFallback ? '  ✓' : '  ✗'} [ambiente] --atualizar-baseline do caminho antigo PRESERVA a medição por ambiente`);

// O fallback tem validade: passada a data, usa-lo e vermelho.
digestAtual = null;
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const expirado = await rodar([], '2026-12-01');
const okExpirado = expirado.code === 1 && /fallback/i.test(expirado.out);
if (!okExpirado) { falhas++; console.log(expirado.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okExpirado ? '  ✓' : '  ✗'} [fallback] expirado derruba o gate → saiu ${expirado.code}, esperado 1`);

// Sem DIVAT_ALVO, o script tem que falhar fechado SEM tocar a rede (issue #74, spec §3.3) — não
// existe default silencioso que decida sozinho se fala com teste ou produção.
digestAtual = digestSao();
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const antesReq = requisicoes;
const semAlvo = await rodar([], '2026-08-04', null);
const okSemAlvo = semAlvo.code === 1 && requisicoes === antesReq;
if (!okSemAlvo) { falhas++; console.log(semAlvo.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okSemAlvo ? '  ✓' : '  ✗'} [alvo] sem DIVAT_ALVO sai 1 sem tocar a rede → saiu ${semAlvo.code}, esperado 1 (requisições: ${requisicoes - antesReq})`);

srv.close();
await rm(RAIZ, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada: todos os casos passaram');
process.exit(falhas ? 1 : 0);
