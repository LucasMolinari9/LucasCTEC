// Bancada offline do check_migrations.mjs — prova que o gate de migracoes RECUSA o que deve.
//
// Por que existe: o repositorio ja aprendeu que "um gate de seguranca que nunca foi visto
// falhando e fe, nao garantia" (tests/check_grants.rig.mjs). Este gate decide quem pode ser RPC
// anonima; ate 04/08/2026 ele nao tinha bancada nenhuma.
//
// Tecnica: escreve migracoes sinteticas num diretorio temporario e roda o gate contra ele.
// Rode:  node tests/check_migrations.rig.mjs

import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = '/tmp/divat-rig-migrations';
const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

await rm(RAIZ, { recursive: true, force: true });
await mkdir(`${RAIZ}/scripts`, { recursive: true });
await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
await copyFile(`${REAL}/scripts/check_migrations.mjs`, `${RAIZ}/scripts/check_migrations.mjs`);

function rodar() {
  return new Promise(res => {
    const p = spawn('node', [`${RAIZ}/scripts/check_migrations.mjs`], { cwd: RAIZ });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

const casos = [];
const caso = (nome, sql, esperado) => casos.push({ nome, sql, esperado });

// --- faixa PRODUTO: as duas de sempre continuam passando ------------------------------------
// ATENCAO ao escrever caso novo: o gate (check_migrations.mjs:53) exige literalmente
// `revoke execute on function ... from public`. Com `revoke all` ele acusa "sem REVOKE EXECUTE
// de PUBLIC" e o caso sai 1 por um motivo diferente do que se pretendia testar — falso vermelho.
caso('RPC de produto na allowlist', `
  create or replace function public.divat_linhas_regiao(a text, b text) returns void language sql as $$ select $$;
  revoke execute on function public.divat_linhas_regiao(text, text) from public;
  grant execute on function public.divat_linhas_regiao(text, text) to anon;
`, 0);

// --- faixa DIAGNOSTICO: as tres novas passam -------------------------------------------------
caso('RPC de diagnostico na allowlist', `
  create or replace function public.divat_security_digest() returns jsonb language sql as $$ select '{}'::jsonb $$;
  revoke execute on function public.divat_security_digest() from public;
  grant execute on function public.divat_security_digest() to anon;
`, 0);

// --- fora das duas faixas: recusa -----------------------------------------------------------
caso('RPC anonima fora da allowlist', `
  create or replace function public.divat_qualquer_coisa() returns void language sql as $$ select $$;
  revoke execute on function public.divat_qualquer_coisa() from public;
  grant execute on function public.divat_qualquer_coisa() to anon;
`, 1);

caso('a mesma RPC concedida tambem a authenticated', `
  create or replace function public.divat_security_digest() returns jsonb language sql as $$ select '{}'::jsonb $$;
  revoke execute on function public.divat_security_digest() from public;
  grant execute on function public.divat_security_digest() to anon, authenticated;
`, 1);

caso('funcao public sem revoke execute de PUBLIC', `
  create or replace function public.divat_security_digest() returns jsonb language sql as $$ select '{}'::jsonb $$;
  grant execute on function public.divat_security_digest() to anon;
`, 1);

caso('tabela publica nova sem RLS', `
  create table public.tabela_nova (id int primary key);
`, 1);

caso('senha versionada em migracao', `
  create role alguem login password 'segredo123';
`, 1);

let falhas = 0;
for (const c of casos) {
  await rm(`${RAIZ}/supabase/migrations`, { recursive: true, force: true });
  await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
  await writeFile(`${RAIZ}/supabase/migrations/20260101000000_caso.sql`, c.sql);
  const { code, out } = await rodar();
  const ok = code === c.esperado;
  if (!ok) falhas++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${c.nome} → saiu ${code}, esperado ${c.esperado}`);
  if (!ok) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
}

// A migracao REAL do repositorio tem que passar pelo gate.
await rm(`${RAIZ}/supabase/migrations`, { recursive: true, force: true });
await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
for (const f of ['20260729034018_phase3_moderate_hardening.sql',
                 '20260805000000_phase3_diagnosticos_anonimos.sql']) {
  await copyFile(`${REAL}/supabase/migrations/${f}`, `${RAIZ}/supabase/migrations/${f}`);
}
const real = await rodar();
const okReal = real.code === 0;
if (!okReal) { falhas++; console.log(real.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okReal ? '  ✓' : '  ✗'} migracoes reais do repositorio → saiu ${real.code}, esperado 0`);

await rm(RAIZ, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada: todos os casos passaram');
process.exit(falhas ? 1 : 0);
