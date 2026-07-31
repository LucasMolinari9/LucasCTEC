// Bancada offline do check_ambientes.mjs (gate de divergência teste × produção).
//
// Rode à mão:  NO_PROXY=127.0.0.1 node tests/ambientes.rig.mjs
//
// Como ela isola o script sem gancho de teste no código de produção: o check_ambientes.mjs deriva
// o ROOT da própria localização e lê `<ROOT>/app.js`. A bancada COPIA o script para um diretório
// temporário e escreve um `app.js` falso ao lado, apontando para dois stubs de PostgREST em
// portas locais. Nada no script de produção sabe que está sendo testado — nenhuma env var de
// teste, nenhum branch "if (TESTE)". O baseline também cai no temporário, então uma execução não
// contamina a outra nem o repo.
//
// O que ela prova, e por quê: este gate existe para pegar UMA coisa — o teste ter MENOS do que o
// portal usa, cujo sintoma é tela vazia sem erro. Então quase todo caso aqui é sobre a assimetria
// estar certa: falta no teste é ERRO, sobra no teste é aviso. Um gate que tratasse os dois como
// iguais ficaria vermelho para sempre (os ambientes divergem de propósito) e seria ignorado.

import { createServer } from 'node:http';
import { mkdtemp, writeFile, mkdir, copyFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

const TABELAS = ['tabela_vista_teste', 'itinerario_teste', 'municipio_teste'];

// Cada stub é um "projeto Supabase". `estado` descreve o que anon enxerga nele.
function subirStub(estado) {
  const srv = createServer(async (req, res) => {
    const u = new global.URL(req.url, 'http://x');
    const caminho = u.pathname.replace('/rest/v1/', '');
    const json = (status, corpo, total) => {
      const cab = { 'Content-Type': 'application/json' };
      if (total != null) cab['Content-Range'] = `0-0/${total}`;
      res.writeHead(status, cab);
      res.end(JSON.stringify(corpo));
    };

    if (caminho.startsWith('rpc/')) {
      const nome = caminho.slice(4);
      if (!estado.rpcs.includes(nome)) return json(404, { message: `function ${nome} does not exist` });
      return json(200, [], 0);
    }
    const t = caminho;
    if (!(t in estado.tabelas)) return json(401, { message: 'permission denied' });
    const linhas = estado.tabelas[t];
    if (linhas === null) return json(401, { message: 'permission denied' });
    return json(200, linhas.slice(0, 1), linhas.length);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, porta: srv.address().port })));
}

// Estado "são": os dois ambientes cobrem o que o portal usa.
const SAO = () => ({
  tabelas: {
    tabela_vista_teste: [{ codlinha: '1', codempresa: 'A', nome_ligacao: 'X' }],
    itinerario_teste: [{ row_id: 1, codlinha: '1', nome_logradouro: 'R' }],
    municipio_teste: [{ cod_ibge: 3304557, nome: 'Rio' }],
  },
  rpcs: ['divat_busca_logradouro', 'divat_linhas_regiao'],
});

async function montarCaso(estadoProd, estadoTeste) {
  const p = await subirStub(estadoProd);
  const s = await subirStub(estadoTeste);
  const dir = await mkdtemp(join(tmpdir(), 'divat-amb-'));
  await mkdir(join(dir, 'scripts'), { recursive: true });
  await copyFile(join(REAL, 'scripts/check_ambientes.mjs'), join(dir, 'scripts/check_ambientes.mjs'));
  // app.js falso com a MESMA forma que o script espera por regex.
  await writeFile(join(dir, 'app.js'), `
const SB_URL = 'http://127.0.0.1:${p.porta}';
const SB_KEY = 'fake-prod';
const SB_TESTE_URL = 'http://127.0.0.1:${s.porta}';
const SB_TESTE_KEY = 'fake-teste';
const RT_TABLES = [${TABELAS.map(t => `'${t}'`).join(',')}];
sbFetch('rpc/divat_busca_logradouro', '');
sbFetch('rpc/divat_linhas_regiao', '');
`);
  return { dir, fechar: () => { p.srv.close(); s.srv.close(); } };
}

function rodar(dir, ...flags) {
  return new Promise(res => {
    const proc = spawn('node', [join(dir, 'scripts/check_ambientes.mjs'), ...flags], {
      env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' },
    });
    let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
    proc.on('close', code => res({ code, out }));
  });
}

let falhas = 0;
const checar = (ok, nome, extra = '') => { if (!ok) falhas++; console.log(`${ok ? '  ✓' : '  ✗'} ${nome}${ok ? '' : ' — ' + extra}`); };
const lixo = [];
async function caso(prod, teste, ...flags) {
  const c = await montarCaso(prod, teste);
  lixo.push(c);
  const r = await rodar(c.dir, ...flags);
  return { ...r, dir: c.dir };
}

// --- 1: ambientes cobrindo o portal --------------------------------------------------------
let r = await caso(SAO(), SAO());
checar(r.code === 0, 'ambientes equivalentes passam', `saiu ${r.code}\n${r.out}`);
checar(/cobre tudo que o portal usa/.test(r.out), 'e diz que o teste cobre o portal');

// --- 2: tabela ilegível no teste (o caso central) -------------------------------------------
let t = SAO(); t.tabelas.itinerario_teste = null;
r = await caso(SAO(), t);
checar(r.code === 1, 'tabela legível em produção e não no teste FALHA', `saiu ${r.code}`);
checar(/tabela_ilegivel_no_teste/.test(r.out), 'e classifica o achado');
checar(/TELA VAZIA SEM ERRO/.test(r.out), 'e nomeia o sintoma que isso causa no preview');

// --- 3: coluna faltando no teste ------------------------------------------------------------
t = SAO(); t.tabelas.tabela_vista_teste = [{ codlinha: '1', codempresa: 'A' }]; // sem nome_ligacao
r = await caso(SAO(), t);
checar(r.code === 1, 'coluna presente em produção e ausente no teste FALHA', `saiu ${r.code}`);
checar(/coluna_faltando_no_teste/.test(r.out) && /nome_ligacao/.test(r.out), 'e diz qual coluna');

// --- 4: RPC indisponível no teste -----------------------------------------------------------
t = SAO(); t.rpcs = ['divat_busca_logradouro'];
r = await caso(SAO(), t);
checar(r.code === 1, 'RPC que o app.js chama e o teste não expõe FALHA', `saiu ${r.code}`);
checar(/rpc_indisponivel_no_teste/.test(r.out) && /divat_linhas_regiao/.test(r.out), 'e diz qual RPC');

// --- 5: a assimetria — sobra no teste é AVISO, não erro -------------------------------------
t = SAO(); t.tabelas.municipio_teste = [{ cod_ibge: 1, nome: 'Rio', extra: 'nova' }];
r = await caso(SAO(), t);
checar(r.code === 0, 'coluna a MAIS no teste não derruba o gate', `saiu ${r.code}\n${r.out}`);
checar(/coluna_so_no_teste/.test(r.out), 'e aparece como aviso');

// --- 6: tabela vazia no teste não vira achado de coluna --------------------------------------
t = SAO(); t.tabelas.municipio_teste = [];
r = await caso(SAO(), t);
checar(r.code === 0, 'tabela vazia no teste não inventa achado de coluna', `saiu ${r.code}\n${r.out}`);
checar(/tabela_vazia_no_teste/.test(r.out), 'e avisa que as colunas não foram conferidas');

// --- 7: baseline perdoa o conhecido, --sem-baseline mostra cru -------------------------------
t = SAO(); t.rpcs = ['divat_busca_logradouro'];
const c7 = await montarCaso(SAO(), t); lixo.push(c7);
let r7 = await rodar(c7.dir, '--atualizar-baseline');
checar(r7.code === 0, '--atualizar-baseline grava e sai 0', `saiu ${r7.code}\n${r7.out}`);
const base = JSON.parse(await readFile(join(c7.dir, 'scripts/ambientes_baseline.json'), 'utf8'));
checar(base.achados?.length === 1, 'baseline registrou o achado', JSON.stringify(base.achados));
checar(/preencha à mão/.test(base.achados[0].motivo), 'e exige motivo escrito à mão');
r7 = await rodar(c7.dir);
checar(r7.code === 0, 'com baseline, a divergência conhecida passa', `saiu ${r7.code}\n${r7.out}`);
checar(/conhecida\(s\), no baseline/.test(r7.out), 'e é relatada como conhecida, não escondida');
r7 = await rodar(c7.dir, '--sem-baseline');
checar(r7.code === 1, '--sem-baseline volta a falhar (estado cru)', `saiu ${r7.code}`);

// --- 8: ambiente INALCANÇÁVEL não é divergência ---------------------------------------------
// Regressão da 1ª execução real: com a rede bloqueada, o proxy devolve HTTP 403 — que não é
// exceção e portanto não caía no catch — e o gate reportou 16 "divergências" em vez de dizer
// que não falou com o banco. Confundir "não medi" com "medi e está ruim" é como um gate perde
// a confiança de quem o lê.
let vazio = { tabelas: {}, rpcs: [] }; // nenhuma tabela responde
r = await caso(SAO(), vazio);
checar(r.code === 1, 'ambiente inalcançável FALHA', `saiu ${r.code}`);
checar(/NÃO CONSEGUI FALAR COM TESTE/.test(r.out), 'e diz que não falou com o ambiente');
checar(!/divergência\(s\) NOVA/.test(r.out), 'e NÃO reporta como divergência', r.out.slice(0, 300));

// --- 9: divergência NOVA fura o baseline ----------------------------------------------------
let t8 = SAO(); t8.rpcs = []; // a conhecida + uma nova
const c8 = await montarCaso(SAO(), t8); lixo.push(c8);
await writeFile(join(c8.dir, 'scripts/ambientes_baseline.json'), JSON.stringify({
  achados: [{ tipo: 'rpc_indisponivel_no_teste', alvo: 'divat_linhas_regiao' }],
}, null, 2));
const r8 = await rodar(c8.dir);
checar(r8.code === 1, 'divergência NOVA derruba o gate mesmo com baseline', `saiu ${r8.code}`);
checar(/divat_busca_logradouro/.test(r8.out), 'e aponta só a nova');

for (const c of lixo) { c.fechar(); await rm(c.dir, { recursive: true, force: true }); }
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada de ambientes: todos os casos passaram');
process.exit(falhas ? 1 : 0);
