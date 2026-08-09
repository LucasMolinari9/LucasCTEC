// Gate estrutural para migrações: novos objetos públicos precisam nascer fechados.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase', 'migrations');
// A superficie anonima e definida por CRITERIO, nao por numero (spec de 04/08/2026, secao 8).
// Duas faixas, com criterios de admissao diferentes:
//
//   PRODUTO     — chamada pelo portal em runtime. Entrada aqui e decisao de produto.
//   DIAGNOSTICO — chamada so por gate. Para entrar precisa satisfazer TRES coisas:
//                 (a) le apenas catalogo (pg_class/pg_policy/pg_proc/information_schema),
//                     nunca dado de tabela — senao vira alavanca de indisponibilidade, que foi
//                     exatamente o caso de divat_data_quality (59 varreduras completas sobre
//                     ~116 mil linhas por chamada, medido em 04/08/2026);
//                 (b) nao revela nada alem do que o repositorio ja publica por ADR-0003;
//                 (c) e SECURITY INVOKER — DEFINER anonima nao entra nesta faixa nunca.
//
// Acrescentar nome aqui sem satisfazer o criterio e erosao, nao manutencao.
const ANON_EXECUTE_PRODUTO = new Set([
  'public.divat_busca_logradouro',
  'public.divat_linhas_regiao',
]);
const ANON_EXECUTE_DIAGNOSTICO = new Set([
  'public.divat_api_shape',
  'public.realtime_tables',
  'public.divat_security_digest',
]);
const ALLOWED_ANON_EXECUTE = new Set([
  ...ANON_EXECUTE_PRODUTO,
  ...ANON_EXECUTE_DIAGNOSTICO,
  // Helper necessário à função INVOKER, mas invisível na Data API porque private não é exposto.
  'private.f_unaccent',
]);

const failures = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);
const compact = sql => sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();

let files;
try {
  files = (await readdir(DIR)).filter(name => name.endsWith('.sql')).sort();
} catch (error) {
  console.error(`Não foi possível ler ${DIR}: ${error.message}`);
  process.exit(1);
}

if (!files.length) {
  console.error('Nenhuma migração SQL encontrada; abortando em vez de passar sem cobertura.');
  process.exit(1);
}

for (const file of files) {
  const sql = compact(await readFile(join(DIR, file), 'utf8'));

  if (/\bcreate\s+role\b[\s\S]*?\bpassword\b/i.test(sql) || /\balter\s+role\b[\s\S]*?\bpassword\b/i.test(sql)) {
    fail(file, 'credenciais/senhas não podem ser versionadas em migrações');
  }

  const tables = [...sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)]
    .map(match => match[1]);
  for (const table of tables) {
    const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rls = new RegExp(`alter table(?: if exists)? public\\.${escaped} enable row level security`, 'i');
    const revokeObject = new RegExp(`revoke [^;]+ on (?:table )?public\\.${escaped}[^;]+ from anon\\s*,\\s*authenticated`, 'i');
    const revokeAll = /revoke [^;]+ on all tables in schema public from anon\s*,\s*authenticated/i;
    if (!rls.test(sql)) fail(file, `public.${table} é criada sem ENABLE ROW LEVEL SECURITY na mesma migração`);
    if (!revokeObject.test(sql) && !revokeAll.test(sql)) {
      fail(file, `public.${table} é criada sem REVOKE explícito de anon/authenticated na mesma migração`);
    }
  }

  const createsPublicFunction = /\bcreate\s+(?:or\s+replace\s+)?function\s+public\./i.test(sql);
  const closesFunctionDefaults = /revoke\s+execute\s+on\s+(?:all\s+functions\s+in\s+schema\s+public|function\s+[^;]+)\s+from\s+public/i.test(sql);
  if (createsPublicFunction && !closesFunctionDefaults) {
    fail(file, 'função public é criada sem REVOKE EXECUTE de PUBLIC na mesma migração');
  }

  for (const match of sql.matchAll(/grant\s+execute\s+on\s+function\s+([^;]*?)\s+to\s+anon\s*;/gi)) {
    const targets = [...match[1].matchAll(/((?:public|audit|private)\.[a-z0-9_]+)\s*\(/gi)]
      .map(target => target[1].toLowerCase());
    if (!targets.length) fail(file, 'GRANT EXECUTE TO anon não pôde ser interpretado de forma segura');
    for (const target of targets) {
      if (!ALLOWED_ANON_EXECUTE.has(target)) {
        fail(file, `${target} não está na allowlist anônima. Para entrar como PRODUTO, precisa ser `
          + `chamada pelo portal em runtime; como DIAGNÓSTICO, precisa ler só catálogo, ser `
          + `SECURITY INVOKER e não revelar além do que o repositório já publica (ADR-0003). `
          + `Ver docs/planos/2026-08-04-fase3-diagnosticos-anonimos-design.md §8.`);
      }
    }
  }

  if (/grant\s+execute\s+on\s+function[^;]*?to\s+(?:anon\s*,\s*authenticated|authenticated\s*,\s*anon)/i.test(sql)) {
    fail(file, 'authenticated não pode acompanhar anon em GRANT EXECUTE');
  }
}

if (failures.length) {
  console.error('✗ Migrações violam o contrato de segurança:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`✓ ${files.length} migração(ões): RLS/revokes e allowlist de RPC validados.`);
