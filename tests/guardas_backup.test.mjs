/* Guardas de entrada/saída dos scripts de backup/restauração (`scripts/lib/guardas_backup.mjs`).

   Por que este arquivo existe: a auditoria de 26/08/2026 apontou três buracos nos utilitários
   administrativos, e os três foram MEDIDOS no código antes de virar teste:

   - SEC-04 — `scripts/backup_rest.mjs` lia `SUPABASE_URL` do ambiente e mandava a chave
     secret/service para lá sem validar NADA: nem protocolo, nem host, nem redirect. O
     `restore_rest.mjs` já tinha `origemNormalizada`/`projectRef`; o backup não tinha cópia
     nenhuma. Aqui a regra passa a ter definição ÚNICA e os dois a importam — o mesmo padrão
     que o CLAUDE.md cobra em "NÃO duplicar busca/listagem".
   - SEC-05 — o backup fazia `mkdir(OUT, { recursive: true })` e `writeFile` truncante, então
     apontar para uma pasta existente destruía o que estava lá. Pasta de backup é sempre nova.
   - SEC-06 — o restore hasheava o arquivo em `validarArquivos` e o RELIA depois, em
     `percorrerNdjson`, para montar os lotes do POST: duas leituras do mesmo caminho, com uma
     janela entre elas. `createReadStream` ainda segue symlink. `lerValidado` fecha as duas
     coisas lendo UMA vez, recusando symlink e conferindo o SHA sobre os bytes que vão ser
     usados — não sobre uma leitura anterior.

   Rode: node guardas_backup.test.mjs   (ou, melhor, node check.js para rodar tudo). */

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { validarOrigem, pastaNova, lerValidado } from '../scripts/lib/guardas_backup.mjs';

let pass = 0; const fails = [];
const t = async (nome, fn) => {
  try { await fn(); pass++; } catch (e) { fails.push(`${nome}: ${e.message}`); }
};
const lanca = async (fn, re, msg) => {
  let erro = null;
  try { await fn(); } catch (e) { erro = e; }
  assert.ok(erro, `${msg}: não lançou`);
  assert.match(erro.message, re, `${msg}: mensagem inesperada (${erro.message})`);
};

const base = await mkdtemp(join(tmpdir(), 'guardas-'));

/* ---------- SEC-04: origem do backup ---------- */

await t('validarOrigem recusa http em host remoto', () =>
  lanca(() => validarOrigem('http://lwzsxuaqqeoamukduhev.supabase.co', { nome: 'SUPABASE_URL' }),
    /HTTPS/, 'http remoto'));

await t('validarOrigem recusa host que não é <ref>.supabase.co', () =>
  lanca(() => validarOrigem('https://evil.example.com', { nome: 'SUPABASE_URL' }),
    /endpoint direto/, 'host arbitrário'));

await t('validarOrigem recusa subdomínio colado no domínio esperado', () =>
  lanca(() => validarOrigem('https://lwzsxuaqqeoamukduhev.supabase.co.evil.com', { nome: 'SUPABASE_URL' }),
    /endpoint direto/, 'sufixo enganoso'));

await t('validarOrigem recusa valor que nem é URL', () =>
  lanca(() => validarOrigem('nao-e-url', { nome: 'SUPABASE_URL' }), /URL válida/, 'lixo'));

await t('validarOrigem aceita o endpoint direto e devolve o ref', () => {
  const r = validarOrigem('https://lwzsxuaqqeoamukduhev.supabase.co', { nome: 'SUPABASE_URL' });
  assert.equal(r.origem, 'https://lwzsxuaqqeoamukduhev.supabase.co');
  assert.equal(r.ref, 'lwzsxuaqqeoamukduhev');
  assert.equal(r.local, false);
});

await t('validarOrigem descarta path, query e hash (não deixa a chave ir para /qualquer/coisa)', () => {
  const r = validarOrigem('https://lwzsxuaqqeoamukduhev.supabase.co/rest/v1?x=1#y', { nome: 'SUPABASE_URL' });
  assert.equal(r.origem, 'https://lwzsxuaqqeoamukduhev.supabase.co');
});

await t('validarOrigem só aceita host local quando permitirLocal', async () => {
  await lanca(() => validarOrigem('http://127.0.0.1:54321', { nome: 'SUPABASE_URL' }),
    /endpoint direto/, 'local sem permissão');
  const r = validarOrigem('http://127.0.0.1:54321', { nome: 'SUPABASE_URL', permitirLocal: true });
  assert.equal(r.local, true);
  assert.equal(r.origem, 'http://127.0.0.1:54321');
});

await t('validarOrigem recusa chave administrativa apontada para host local', () =>
  lanca(() => validarOrigem('http://127.0.0.1:54321',
    { nome: 'SUPABASE_URL', permitirLocal: true, chaveAdmin: true }),
  /administrativa/, 'admin em localhost'));

/* ---------- SEC-05: saída do backup ---------- */

await t('pastaNova recusa pasta que já existe', async () => {
  const alvo = join(base, 'ja-existe');
  await mkdir(alvo);
  await writeFile(join(alvo, 'importante.ndjson'), 'nao me apague\n');
  await lanca(() => pastaNova(alvo), /já existe/, 'pasta existente');
  assert.deepEqual(await readdir(alvo), ['importante.ndjson']);
});

await t('pastaNova cria a pasta quando o caminho está livre', async () => {
  const alvo = join(base, 'nova');
  await pastaNova(alvo);
  assert.deepEqual(await readdir(alvo), []);
});

/* ---------- SEC-06: leitura validada do restore ---------- */

const sha = b => createHash('sha256').update(b).digest('hex');

await t('lerValidado devolve os bytes quando o SHA-256 confere', async () => {
  const arq = join(base, 'ok.ndjson');
  const conteudo = '{"a":1}\n{"a":2}\n';
  await writeFile(arq, conteudo);
  const buf = await lerValidado(arq, sha(Buffer.from(conteudo)));
  assert.equal(buf.toString('utf8'), conteudo);
});

await t('lerValidado recusa quando o SHA-256 não confere', async () => {
  const arq = join(base, 'adulterado.ndjson');
  await writeFile(arq, '{"a":1}\n');
  await lanca(() => lerValidado(arq, sha(Buffer.from('{"a":999}\n'))), /SHA-256/, 'hash divergente');
});

await t('lerValidado recusa symlink (o alvo pode ser trocado depois da validação)', async () => {
  const real = join(base, 'real.ndjson');
  const link = join(base, 'link.ndjson');
  await writeFile(real, '{"a":1}\n');
  await symlink(real, link);
  await lanca(() => lerValidado(link, sha(Buffer.from('{"a":1}\n'))), /symlink/, 'symlink');
});

console.log('\n==== PLACAR:', pass + '/' + (pass + fails.length), '====');
if (fails.length) { console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
