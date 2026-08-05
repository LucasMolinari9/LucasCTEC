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
// docs/handoff-2026-07-27-auditoria-externa.md — a rede até o Supabase é bloqueada no ambiente
// do Claude, então a alternativa seria não testar. Desde o modo duplo (04/08/2026), o alvo do
// script vem de scripts/ambientes.json + DIVAT_ALVO (issue #74), não mais de um app.js falso —
// veja os casos `[digest]` e `[fallback]` abaixo, que exercitam a rota nova (divat_security_digest)
// e o caminho antigo (divat_security_shape) lado a lado.
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

const baselineDigest = { ...baseline, digest: 'a'.repeat(64), anon_rpcs: 5,
                         defaults_permissivos: 3, funcoes_sem_search_path: 0 };

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
const okPreserva = depois.digest === 'c'.repeat(64) && depois.achados.length === baseline.achados.length;
if (!okPreserva) falhas++;
console.log(`${okPreserva ? '  ✓' : '  ✗'} [digest] --atualizar-baseline atualiza o digest e PRESERVA os achados`);

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
