// Bancada offline do check_grants.mjs — prova que o gate APERTA.
//
// Por que não está no tests/check.js: sobe um servidor HTTP e um processo filho; o contrato do
// check.js é ser offline e sem efeitos. Rode à mão:  NO_PROXY=127.0.0.1 node tests/check_grants.rig.mjs
//
// Por que existe: um gate de segurança que nunca foi visto falhando é fé, não garantia. Os dois
// últimos casos são os que mais importam — eles cobrem FAIL-OPEN: se a RPC devolver lista vazia
// ou faltando um campo, o gate tem que ABORTAR, não relatar "nenhum achado". Foi o modo de falha
// que quase entrou (tratar `undefined` como `[]` e sair 0 exatamente ao perder a visão do banco).
//
// Técnica do stub (fakeroot + app.js falso apontando para 127.0.0.1) registrada em
// docs/handoff-2026-07-27-auditoria-externa.md — a rede até o Supabase é bloqueada no ambiente
// do Claude, então a alternativa seria não testar.
import { createServer } from 'node:http';
import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = '/tmp/divat-rig-grants';
const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

let respostaAtual = null;
const srv = createServer((req, res) => {
  if (req.url === '/rest/v1/rpc/divat_security_shape') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respostaAtual));
  } else { res.writeHead(404); res.end('{}'); }
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORTA = srv.address().port;

await mkdir(`${RAIZ}/scripts`, { recursive: true });
await writeFile(`${RAIZ}/app.js`,
  `const SB_URL = 'http://127.0.0.1:${PORTA}';\nconst SB_KEY = 'fake-anon-key';\n`);
await copyFile(`${REAL}/scripts/check_grants.mjs`, `${RAIZ}/scripts/check_grants.mjs`);
// O gate importa ./lib/sb.mjs (cabeçalhos de auth dependentes do formato da chave) desde
// 31/07/2026 — sem copiar a lib junto, o script morre com ERR_MODULE_NOT_FOUND aqui dentro.
await mkdir(`${RAIZ}/scripts/lib`, { recursive: true });
await copyFile(`${REAL}/scripts/lib/sb.mjs`, `${RAIZ}/scripts/lib/sb.mjs`);

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

function rodar(extraArgs = []) {
  return new Promise(res => {
    const p = spawn('node', [`${RAIZ}/scripts/check_grants.mjs`, ...extraArgs], { cwd: RAIZ });
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

srv.close();
await rm(RAIZ, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada: todos os casos passaram');
process.exit(falhas ? 1 : 0);
