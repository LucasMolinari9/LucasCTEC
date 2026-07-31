// Bancada offline do restore_rest.mjs.
//
// Por que não está no tests/check.js: sobe servidor HTTP e processo filho; o contrato do check.js
// é ser offline e sem efeitos. Rode à mão:  NO_PROXY=127.0.0.1 node tests/restore_rest.rig.mjs
//
// Irmã da tests/backup_rest.rig.mjs. Nasceu junto com o restore (achado 2 da auditoria cruzada de
// 31/07/2026): o formato NDJSON não tinha caminho de volta, e um importador não testado é uma
// promessa de recuperação, não uma recuperação.
//
// O que prova, e por quê — todos os casos são o script recusando escrever quando deveria recusar,
// porque este é o ÚNICO script do repo que escreve no banco e o modo de falha caro não é ele
// quebrar, é ele escrever coisa errada com cara de sucesso:
//  - Sem --executar não sai UMA requisição de escrita. O padrão precisa ser inofensivo.
//  - SHA-256 divergente aborta ANTES de qualquer escrita. Os hashes estavam no manifest desde
//    21/07/2026 e nada os consumia; se o restore os ignorasse, continuariam decorativos.
//  - Contagem do arquivo diferente da do manifest aborta (arquivo truncado).
//  - .ndjson na pasta que o manifest não menciona aborta (pasta remendada à mão).
//  - Tabela de destino com conteúdo aborta SEM --sobrescrever, e com a flag apaga antes.
//  - A ORDEM de inserção respeita a FK: tabela_vista_teste (hub) antes de tarifa_atual_teste.
//    É a única dependência real do banco e a que quebraria um restore de verdade.
//  - A ordem de APAGAR é a inversa da de inserir.
//  - Divergência de contagem no fim aborta com exit≠0 (restore incompleto não sai "ok").

import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- estado do banco falso --------------------------------------------------------------------
// tabela -> array de linhas. O stub é um PostgREST mínimo: conta, apaga e insere.
let banco = {};
let pedidos = [];        // toda requisição, na ordem — é como a bancada afere ORDEM
let engolirInsercao = 0; // nº de linhas a "perder" na inserção, para forjar restore incompleto

const TABELAS = ['tabela_vista_teste', 'tarifa_atual_teste', 'itinerario_teste', 'municipio_teste'];

function zerar() {
  banco = Object.fromEntries(TABELAS.map(t => [t, []]));
  pedidos = [];
  engolirInsercao = 0;
}

const srv = createServer(async (req, res) => {
  const u = new global.URL(req.url, 'http://x');
  const tabela = u.pathname.replace('/rest/v1/', '');
  pedidos.push(`${req.method} ${req.url}`);

  if (!(tabela in banco)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `tabela ${tabela} não existe` }));
    return;
  }

  if (req.method === 'GET') {
    const cab = { 'Content-Type': 'application/json' };
    // O restore conta com Prefer: count=exact e lê o total do Content-Range.
    if (req.headers.prefer === 'count=exact') cab['Content-Range'] = `0-0/${banco[tabela].length}`;
    res.writeHead(200, cab);
    res.end(JSON.stringify(banco[tabela].slice(0, Number(u.searchParams.get('limit') || 1000))));
    return;
  }

  if (req.method === 'DELETE') {
    // O script precisa mandar um filtro explícito; DELETE pelado aqui é erro de propósito,
    // para que uma regressão para "apaga tudo sem filtro" derrube a bancada.
    if (![...u.searchParams.keys()].length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'DELETE sem filtro proibido nesta bancada' }));
      return;
    }
    banco[tabela] = [];
    res.writeHead(204); res.end();
    return;
  }

  if (req.method === 'POST') {
    const corpo = await new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
    const linhas = JSON.parse(corpo);
    const aceitas = engolirInsercao > 0 ? linhas.slice(0, Math.max(0, linhas.length - engolirInsercao)) : linhas;
    banco[tabela].push(...aceitas);
    res.writeHead(201); res.end();
    return;
  }

  res.writeHead(405); res.end();
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORTA = srv.address().port;

// --- fixture: uma pasta de backup igual à que o backup_rest.mjs produz ------------------------
async function montarBackup({ corromperSha = null, truncar = null, arquivoExtra = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'divat-rs-'));
  const conteudos = {
    // hub primeiro no manifest é irrelevante — quem manda na ordem é ORDEM_INSERCAO no script.
    // Aqui o manifest lista fora de ordem DE PROPÓSITO, para provar que o script não depende dele.
    tarifa_atual_teste: [{ ordem_importacao: 1, codlinha: '100', codempresa: 'A', valor: 5.5 },
                         { ordem_importacao: 2, codlinha: '101', codempresa: 'A', valor: 6.0 }],
    tabela_vista_teste: [{ codlinha: '100', codempresa: 'A', nome_ligacao: 'X' },
                         { codlinha: '101', codempresa: 'A', nome_ligacao: 'Y' }],
    municipio_teste: [{ cod_ibge: 3304557, nome: 'Rio de Janeiro' }],
    itinerario_teste: [],  // tabela vazia no backup: o script deve dizer "nada a inserir"
  };
  const manifest = { gerado_em: new Date().toISOString(), url: 'http://origem-falsa', modo: 'completo', tabelas: {} };
  let total = 0;
  for (const [tabela, linhas] of Object.entries(conteudos)) {
    let texto = linhas.map(x => JSON.stringify(x)).join('\n') + (linhas.length ? '\n' : '');
    const sha = createHash('sha256').update(texto).digest('hex');
    if (truncar === tabela) texto = texto.split('\n').slice(1).join('\n'); // some uma linha
    await writeFile(join(dir, `${tabela}.ndjson`), texto);
    manifest.tabelas[tabela] = {
      linhas: linhas.length,
      esperado: linhas.length,
      sha256: corromperSha === tabela ? 'f'.repeat(64) : sha,
    };
    total += linhas.length;
  }
  manifest.total_linhas = total;
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (arquivoExtra) await writeFile(join(dir, 'tabela_fantasma.ndjson'), '{"id":1}\n');
  return dir;
}

function rodar(dir, ...flags) {
  return new Promise(res => {
    const p = spawn('node', [join(REAL, 'scripts/restore_rest.mjs'), dir, ...flags], {
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${PORTA}`,
        SUPABASE_SERVICE_KEY: 'fake-service',
        NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1',
      },
    });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

let falhas = 0;
const checar = (ok, nome, extra = '') => { if (!ok) falhas++; console.log(`${ok ? '  ✓' : '  ✗'} ${nome}${ok ? '' : ' — ' + extra}`); };
const escritas = () => pedidos.filter(p => p.startsWith('POST') || p.startsWith('DELETE'));
const sujar = () => { banco.tabela_vista_teste.push({ codlinha: '999', codempresa: 'Z', nome_ligacao: 'lixo' }); };

const lixo = [];

// --- caso 1: sem --executar não escreve nada --------------------------------------------------
zerar();
let dir = await montarBackup(); lixo.push(dir);
let r = await rodar(dir);
checar(r.code === 0, 'conferência sem --executar termina com sucesso', `saiu ${r.code}\n${r.out}`);
checar(escritas().length === 0, 'e NÃO fez nenhuma escrita', escritas().join(' | '));
checar(/CONFERÊNCIA APENAS/.test(r.out), 'e avisa que nada foi escrito');
checar(/Integridade OK/.test(r.out), 'e confirma a integridade do backup');

// --- caso 2: SHA-256 divergente aborta antes de escrever --------------------------------------
zerar();
dir = await montarBackup({ corromperSha: 'tabela_vista_teste' }); lixo.push(dir);
r = await rodar(dir, '--executar');
checar(r.code === 1, 'SHA-256 divergente ABORTA', `saiu ${r.code}`);
checar(/SHA-256 não confere/.test(r.out), 'e diz que o hash não confere');
checar(escritas().length === 0, 'e não escreveu nada antes de abortar', escritas().join(' | '));

// --- caso 3: arquivo truncado (contagem diverge do manifest) ----------------------------------
zerar();
dir = await montarBackup({ truncar: 'tabela_vista_teste' }); lixo.push(dir);
r = await rodar(dir, '--executar');
checar(r.code === 1, 'arquivo truncado ABORTA', `saiu ${r.code}`);
checar(escritas().length === 0, 'e não escreveu nada', escritas().join(' | '));

// --- caso 4: .ndjson que o manifest não menciona ----------------------------------------------
zerar();
dir = await montarBackup({ arquivoExtra: true }); lixo.push(dir);
r = await rodar(dir, '--executar');
checar(r.code === 1, 'arquivo fora do manifest ABORTA', `saiu ${r.code}`);
checar(/não está no manifest|não no manifest/.test(r.out), 'e diz qual arquivo sobrou');

// --- caso 5: destino com conteúdo, sem --sobrescrever -----------------------------------------
zerar();
sujar();
dir = await montarBackup(); lixo.push(dir);
r = await rodar(dir, '--executar');
checar(r.code === 1, 'tabela de destino não-vazia ABORTA sem --sobrescrever', `saiu ${r.code}`);
checar(escritas().length === 0, 'e não escreveu nada', escritas().join(' | '));
checar(/--sobrescrever/.test(r.out), 'e ensina a flag que autoriza');

// --- caso 6: restore feliz em banco vazio -----------------------------------------------------
zerar();
dir = await montarBackup(); lixo.push(dir);
r = await rodar(dir, '--executar');
checar(r.code === 0, 'restore em banco vazio termina com sucesso', `saiu ${r.code}\n${r.out}`);
checar(banco.tabela_vista_teste.length === 2, 'inseriu as 2 linhas do hub', String(banco.tabela_vista_teste.length));
checar(banco.tarifa_atual_teste.length === 2, 'inseriu as 2 tarifas', String(banco.tarifa_atual_teste.length));
checar(banco.municipio_teste.length === 1, 'inseriu o município', String(banco.municipio_teste.length));
const posts = pedidos.filter(p => p.startsWith('POST'));
const iHub = posts.findIndex(p => p.includes('tabela_vista_teste'));
const iTar = posts.findIndex(p => p.includes('tarifa_atual_teste'));
checar(iHub >= 0 && iTar >= 0 && iHub < iTar, 'hub inserido ANTES da tarifa (respeita a FK)', posts.join(' | '));
checar(!posts.some(p => p.includes('itinerario_teste')), 'tabela vazia no backup não gera POST');
checar(/nada a inserir/.test(r.out), 'e o relato diz que ela estava vazia');
checar(/setval/.test(r.out), 'imprime o SQL de setval das sequências identity');
checar(/backup_schema\.sql/.test(r.out), 'e lembra de rodar a baseline de estrutura');

// --- caso 7: --sobrescrever apaga antes, na ordem inversa --------------------------------------
zerar();
sujar();
dir = await montarBackup(); lixo.push(dir);
r = await rodar(dir, '--executar', '--sobrescrever');
checar(r.code === 0, 'restore com --sobrescrever termina com sucesso', `saiu ${r.code}\n${r.out}`);
checar(banco.tabela_vista_teste.length === 2, 'o lixo anterior sumiu e ficaram só as 2 do backup', String(banco.tabela_vista_teste.length));
const dels = pedidos.filter(p => p.startsWith('DELETE'));
const dHub = dels.findIndex(p => p.includes('tabela_vista_teste'));
const dTar = dels.findIndex(p => p.includes('tarifa_atual_teste'));
checar(dHub >= 0 && dTar >= 0 && dTar < dHub, 'apagou na ordem INVERSA (tarifa antes do hub)', dels.join(' | '));
checar(dels.every(p => /\?[a-z_]+=not\.is\.null/.test(p)), 'todo DELETE levou filtro explícito', dels.join(' | '));

// --- caso 8: inserção que perde linhas → restore incompleto aborta -----------------------------
zerar();
dir = await montarBackup(); lixo.push(dir);
engolirInsercao = 1; // o "servidor" aceita uma linha a menos por lote
r = await rodar(dir, '--executar');
checar(r.code === 1, 'contagem final divergente ABORTA', `saiu ${r.code}`);
checar(/RESTORE INCOMPLETO/.test(r.out), 'e diz que o restore ficou incompleto');

srv.close();
for (const d of lixo) await rm(d, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada do restore: todos os casos passaram');
process.exit(falhas ? 1 : 0);
