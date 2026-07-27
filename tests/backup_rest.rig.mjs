// Bancada offline do backup_rest.mjs.
//
// Por que não está no tests/check.js: sobe servidor HTTP e processo filho; o contrato do check.js
// é ser offline e sem efeitos. Rode à mão:  NO_PROXY=127.0.0.1 node tests/backup_rest.rig.mjs
//
// O que prova, e por quê:
//  - KEYSET de verdade (o script pede `pk=gt.<último>`, não `offset=`). Era a correção principal:
//    com offset, uma escrita concorrente desloca a janela e o dump pula ou duplica linha em
//    silêncio. Aqui o stub REJEITA qualquer requisição com `offset=`, então uma regressão para
//    offset derruba a bancada em vez de passar despercebida.
//  - PK COMPOSTA (tabela_vista_teste) monta a comparação lexicográfica correta — é a parte que
//    mais tem chance de estar sutilmente errada, porque o PostgREST não compara tupla.
//  - Contagem MENOR que o Content-Range aborta (backup incompleto não pode sair com cara de
//    sucesso); contagem MAIOR só avisa (linha inserida durante a corrida é benigna).
//  - SHA-256 no manifest é determinístico.

import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

// O stub descobre a(s) coluna(s) de PK pelo próprio `order=` da requisição, em vez de assumir
// um nome fixo — cada tabela do backup_rest.mjs tem PK diferente (row_id, id, cod_ibge,
// ordem_importacao, e a composta codlinha+codempresa).
//
// COMPARAÇÃO NUMÉRICA quando os dois lados são numéricos. A primeira versão desta bancada
// comparava tudo como texto e '999' > '1000' dava verdadeiro, fazendo o stub reenviar linhas para
// sempre (38981 "linhas" de um conjunto de 2500). O Postgres compara integer como integer; um
// stub que compara como string não está emulando o servidor, está inventando outro.
const cmp = (a, b) => {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a !== '' && b !== '') return na < nb ? -1 : na > nb ? 1 : 0;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

// 2500 linhas força 3 páginas de 1000; a composta com 1500 força 2 — sem passar de uma página o
// keyset nunca seria exercitado e a bancada passaria sem testar nada.
const linhasSimples = pk => Array.from({ length: 2500 }, (_, i) => ({ [pk]: i + 1, texto: `linha ${i + 1}` }));
const COMPOSTA = Array.from({ length: 1500 }, (_, i) => ({
  codlinha: String(100000 + Math.floor(i / 2)),
  codempresa: i % 2 ? 'B' : 'A',
  v: i,
}));

let mentirContagem = 0;   // soma ao total anunciado no Content-Range
let pedidos = [];

const srv = createServer((req, res) => {
  pedidos.push(req.url);
  if (req.url.includes('offset=')) { // regressão para offset: derruba a bancada
    res.writeHead(400); res.end(JSON.stringify({ message: 'offset proibido nesta bancada' })); return;
  }
  const u = new global.URL(req.url, 'http://x');
  const cols = (u.searchParams.get('order') || '').split(',').map(s => s.replace(/\.asc$/, '')).filter(Boolean);
  const composta = cols.length > 1;
  const dados = composta ? COMPOSTA : linhasSimples(cols[0]);
  let restantes = dados;

  const gt = [...u.searchParams.keys()].find(k => u.searchParams.get(k)?.startsWith('gt.'));
  if (gt) {
    const alvo = u.searchParams.get(gt).slice(3);
    restantes = dados.filter(r => cmp(r[gt], alvo) > 0);
  }
  const or = u.searchParams.get('or');
  if (or) {
    // or=(codlinha.gt.100,and(codlinha.eq.100,codempresa.gt.B))
    const m = /^\(([a-z_]+)\.gt\.([^,]+),and\(([a-z_]+)\.eq\.([^,]+),([a-z_]+)\.gt\.([^)]+)\)\)$/.exec(or);
    if (!m) { res.writeHead(400); res.end(JSON.stringify({ message: `or malformado: ${or}` })); return; }
    const [, c1, v1, , v2, c2, v3] = m;
    restantes = dados.filter(r => cmp(r[c1], v1) > 0 || (String(r[c1]) === v2 && cmp(r[c2], v3) > 0));
  }

  const limite = Number(u.searchParams.get('limit') || 1000);
  const pagina = restantes.slice(0, limite);
  const cab = { 'Content-Type': 'application/json' };
  if (req.headers.prefer === 'count=exact') cab['Content-Range'] = `0-${pagina.length - 1}/${dados.length + mentirContagem}`;
  res.writeHead(200, cab);
  res.end(JSON.stringify(pagina));
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORTA = srv.address().port;

function rodar(saida) {
  return new Promise(res => {
    const p = spawn('node', [join(REAL, 'scripts/backup_rest.mjs'), saida], {
      env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${PORTA}`, SUPABASE_ANON_KEY: 'fake', NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' },
    });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

let falhas = 0;
const checar = (ok, nome, extra = '') => { if (!ok) falhas++; console.log(`${ok ? '  ✓' : '  ✗'} ${nome}${ok ? '' : ' — ' + extra}`); };

// --- caso 1: dump são -------------------------------------------------------------------------
let dir = await mkdtemp(join(tmpdir(), 'divat-bk-'));
pedidos = [];
let r = await rodar(dir);
checar(r.code === 0, 'dump são termina com sucesso', `saiu ${r.code}\n${r.out}`);
const man = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
checar(man.tabelas.itinerario_teste?.linhas === 2500, 'paginou as 2500 linhas (PK simples)', JSON.stringify(man.tabelas.itinerario_teste));
checar(man.tabelas.tabela_vista_teste?.linhas === 1500, 'paginou as 1500 linhas (PK composta)', JSON.stringify(man.tabelas.tabela_vista_teste));
checar(/^[0-9a-f]{64}$/.test(man.tabelas.itinerario_teste?.sha256 || ''), 'SHA-256 gravado no manifest');
checar(pedidos.some(u => u.includes('row_id=gt.1000')), 'usou keyset (row_id=gt.1000), não offset');
checar(pedidos.some(u => u.includes('or=')), 'PK composta usou comparação lexicográfica (or=)');
const sha1 = man.tabelas.itinerario_teste.sha256;

// --- caso 2: determinismo do hash -------------------------------------------------------------
const dir2 = await mkdtemp(join(tmpdir(), 'divat-bk-'));
await rodar(dir2);
const man2 = JSON.parse(await readFile(join(dir2, 'manifest.json'), 'utf8'));
checar(man2.tabelas.itinerario_teste.sha256 === sha1, 'SHA-256 é determinístico entre execuções');

// --- caso 3: servidor conta MAIS do que desceu → aborta ---------------------------------------
mentirContagem = 5;
const dir3 = await mkdtemp(join(tmpdir(), 'divat-bk-'));
r = await rodar(dir3);
checar(r.code === 1, 'backup incompleto (desceu menos que a contagem) ABORTA', `saiu ${r.code}`);
checar(/BACKUP INCOMPLETO/.test(r.out), 'e diz por quê');

// --- caso 4: servidor conta MENOS do que desceu → só avisa ------------------------------------
mentirContagem = -5;
const dir4 = await mkdtemp(join(tmpdir(), 'divat-bk-'));
r = await rodar(dir4);
checar(r.code === 0, 'linha inserida durante o dump apenas AVISA', `saiu ${r.code}\n${r.out}`);
checar(/não invalida/.test(r.out), 'e o aviso explica que não invalida');

srv.close();
for (const d of [dir, dir2, dir3, dir4]) await rm(d, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada do backup: todos os casos passaram');
process.exit(falhas ? 1 : 0);
