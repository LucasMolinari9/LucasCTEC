// Bancada offline do restore_rest.mjs. Sobe uma Data API falsa em 127.0.0.1 e prova as travas
// que evitam restaurar arquivo corrompido, projeto errado ou tabelas já ocupadas.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TODAS = [
  'tabela_vista_teste', 'tarifa_atual_teste', 'itinerario_teste', 'qh_teste',
  'qh_intervalo_teste', 'qh_predeterminado_teste', 'evento_teste', 'evento_dados',
  'evento_textos', 'evento_empresa_teste', 'evento_linha_teste', 'codempresa_teste',
  'portaria_teste', 'portaria_data', 'portaria_texto_teste', 'municipio_teste',
  'localidades_teste', 'origem_teste',
];
const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);
const PUBLICAS = TODAS.filter(t => !STAGING.has(t));

const sha = s => createHash('sha256').update(s).digest('hex');

async function criarFixture(pasta, origem = 'https://origem.supabase.co') {
  const manifest = { gerado_em: '2026-07-31T00:00:00.000Z', url: origem, modo: 'publico', tabelas: {}, total_linhas: 0 };
  for (const tabela of PUBLICAS) {
    let linhas = [];
    if (tabela === 'tabela_vista_teste') linhas = [{ codlinha: '001', codempresa: 'A' }];
    if (tabela === 'tarifa_atual_teste') linhas = [{ ordem_importacao: 1, codlinha: '001', codempresa: 'A' }];
    if (tabela === 'itinerario_teste') linhas = [{ row_id: 1 }, { row_id: 2 }];
    const conteudo = linhas.map(x => JSON.stringify(x)).join('\n') + (linhas.length ? '\n' : '');
    await writeFile(join(pasta, `${tabela}.ndjson`), conteudo);
    manifest.tabelas[tabela] = { linhas: linhas.length, esperado: linhas.length, sha256: sha(conteudo) };
    manifest.total_linhas += linhas.length;
  }
  await writeFile(join(pasta, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

function rodar(pasta, args = [], env = {}) {
  return new Promise(resolve => {
    const p = spawn('node', [join(RAIZ, 'scripts/restore_rest.mjs'), pasta, ...args], {
      env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1', ...env },
    });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
}

let falhas = 0;
const checar = (cond, nome, extra = '') => {
  if (!cond) falhas++;
  console.log(`${cond ? '  ✓' : '  ✗'} ${nome}${cond ? '' : ` — ${extra}`}`);
};

const dir = await mkdtemp(join(tmpdir(), 'divat-restore-'));
await criarFixture(dir);

// 1. Dry-run: valida bytes e JSON sem exigir segredo ou tocar em rede.
let r = await rodar(dir);
checar(r.code === 0, 'dry-run válido termina verde', r.out);
checar(/nenhum acesso ao banco e nenhuma escrita/.test(r.out), 'dry-run declara que não escreveu');

// 2. Corrupção: qualquer byte alterado derruba o SHA antes da rede.
const alvoCorrupto = join(dir, 'itinerario_teste.ndjson');
const original = await readFile(alvoCorrupto, 'utf8');
await writeFile(alvoCorrupto, original + '{"row_id":3}\n');
r = await rodar(dir);
checar(r.code === 1, 'arquivo alterado aborta', r.out);
checar(/SHA-256 não confere/.test(r.out), 'erro identifica o SHA-256');
await writeFile(alvoCorrupto, original);

const banco = new Map(PUBLICAS.map(t => [t, []]));
const posts = [];
let authOpacaCorreta = true;
const servidor = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const tabela = u.pathname.split('/').filter(Boolean).at(-1);
  if (!banco.has(tabela)) { res.writeHead(404); res.end(); return; }
  if (req.headers.apikey !== 'sb_secret_teste' || req.headers.authorization) authOpacaCorreta = false;
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'Content-Range': `*/${banco.get(tabela).length}` });
    res.end();
    return;
  }
  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
  let corpo = '';
  req.on('data', d => corpo += d);
  req.on('end', () => {
    const lote = JSON.parse(corpo);
    posts.push(tabela);
    if (tabela === 'tarifa_atual_teste' && banco.get('tabela_vista_teste').length === 0) {
      res.writeHead(409); res.end('FK sem pai'); return;
    }
    banco.get(tabela).push(...lote);
    res.writeHead(201); res.end();
  });
});
await new Promise(resolve => servidor.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${servidor.address().port}`;
const env = { SUPABASE_RESTORE_URL: url, SUPABASE_RESTORE_SECRET_KEY: 'sb_secret_teste' };

// 3. Aplicação exige confirmação exata do destino.
r = await rodar(dir, ['--apply'], env);
checar(r.code === 1 && /--confirm-ref=127\.0\.0\.1/.test(r.out), 'apply sem confirmação aborta antes de escrever', r.out);
checar(posts.length === 0, 'nenhum POST ocorreu sem confirmação');

// Chave pública em variável errada continua sendo recusada antes da rede.
r = await rodar(dir, ['--apply', '--confirm-ref=127.0.0.1'], { ...env, SUPABASE_RESTORE_SECRET_KEY: 'sb_publishable_teste' });
checar(r.code === 1 && /chave publishable/.test(r.out), 'chave publishable nunca é aceita para escrita', r.out);
checar(posts.length === 0, 'nenhum POST ocorreu com chave publishable');

// 4. Aplicação íntegra, com pai antes da filha e chave opaca apenas no header apikey.
r = await rodar(dir, ['--apply', '--confirm-ref=127.0.0.1', '--batch=1'], env);
checar(r.code === 0, 'restore em destino vazio termina verde', r.out);
checar(posts.indexOf('tabela_vista_teste') < posts.indexOf('tarifa_atual_teste'), 'tabela-pai vem antes da filha com FK');
checar(banco.get('itinerario_teste').length === 2, 'todos os lotes foram inseridos');
checar(authOpacaCorreta, 'sb_secret_* vai em apikey, nunca como Bearer JWT');

// 5. Segunda execução recusa destino ocupado antes de qualquer novo POST.
const postsAntes = posts.length;
r = await rodar(dir, ['--apply', '--confirm-ref=127.0.0.1'], env);
checar(r.code === 1 && /destino não está vazio/.test(r.out), 'destino ocupado é recusado', r.out);
checar(posts.length === postsAntes, 'recusa acontece antes de qualquer escrita nova');

// 6. O projeto que gerou o backup nunca pode ser o destino.
const dirMesmo = await mkdtemp(join(tmpdir(), 'divat-restore-'));
await criarFixture(dirMesmo, url);
r = await rodar(dirMesmo, ['--apply', '--confirm-ref=127.0.0.1'], env);
checar(r.code === 1 && /mesmo projeto que gerou o backup/.test(r.out), 'projeto de origem não pode ser destino', r.out);

servidor.close();
await rm(dir, { recursive: true, force: true });
await rm(dirMesmo, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada do restore: todos os casos passaram');
process.exit(falhas ? 1 : 0);
