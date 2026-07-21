// backup_rest.mjs — Backup lógico (só DADOS) das tabelas do portal DIVAT.
//
// Para quem NÃO tem pg_dump instalado. Usa a REST do Supabase (PostgREST) e pagina
// pela PRIMARY KEY de cada tabela. Gera 1 arquivo NDJSON por tabela + manifest.json.
//
// DOIS MODOS (decidido pela chave presente no ambiente):
//   COMPLETO — SUPABASE_SERVICE_KEY (ignora RLS): baixa TUDO, inclusive as 4 tabelas
//              de staging do ETL. Rodar só na SUA máquina; a service key jamais sai dela.
//   PÚBLICO  — SUPABASE_ANON_KEY (só o que o RLS deixa): baixa as 14 tabelas públicas
//              do portal (sem staging). É o modo do workflow do GitHub Actions
//              (.github/workflows/backup.yml) — o repo é público e a anon key também,
//              então o artifact não expõe nada além do que a API pública já expõe.
//
// NÃO substitui o pg_dump (que também salva schema/policies/índices). Ver docs/backup.md.
//
// Uso (modo completo, na SUA máquina):
//   SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
//   SUPABASE_SERVICE_KEY="<service_role key: Dashboard → Settings → API>" \
//   node scripts/backup_rest.mjs ./backup_$(date +%Y-%m-%d)
//
// Uso (modo público — mesmo comando, com SUPABASE_ANON_KEY no lugar da service key).
//
// Requer apenas Node 18+ (usa fetch nativo). Nenhuma dependência.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const KEY = SERVICE_KEY || ANON_KEY;
const PUBLICO = !SERVICE_KEY; // sem service key → modo público (só tabelas com anon_read_*)
const OUT = process.argv[2] || `./backup_${new Date().toISOString().slice(0, 10)}`;
const PAGE = 1000; // linhas por requisição (abaixo de qualquer max-rows do PostgREST)

if (!URL || !KEY) {
  console.error('Faltou SUPABASE_URL e/ou uma chave (SUPABASE_SERVICE_KEY ou SUPABASE_ANON_KEY) no ambiente. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

// Staging do ETL: sem grant para anon (invisíveis pela API pública) → só entram no modo completo.
const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);

// tabela -> coluna de PK usada para ordenar a paginação (todas têm PK desde 15/07/2026).
const TABELAS = {
  tabela_vista_teste: 'codlinha,codempresa', // PK composta; ordenar pelas duas colunas (codlinha repete → offset instável)
  tarifa_atual_teste: 'ordem_importacao',
  itinerario_teste: 'row_id',
  qh_teste: 'id',
  qh_intervalo_teste: 'row_id',
  qh_predeterminado_teste: 'row_id',
  evento_teste: 'id',
  evento_dados: 'id',
  evento_textos: 'id',
  evento_empresa_teste: 'row_id',
  evento_linha_teste: 'row_id',
  codempresa_teste: 'id',
  portaria_teste: 'id',
  portaria_data: 'id',
  portaria_texto_teste: 'id',
  municipio_teste: 'cod_ibge',
  localidades_teste: 'ordem_importacao',
  origem_teste: 'cod_origem',
};

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function dumpTabela(tabela, pk) {
  const linhas = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${URL}/rest/v1/${tabela}?select=*&order=${pk}.asc&limit=${PAGE}&offset=${offset}`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} — ${await r.text()}`);
    const page = await r.json();
    linhas.push(...page);
    if (page.length < PAGE) break; // última página
  }
  const arquivo = join(OUT, `${tabela}.ndjson`);
  await writeFile(arquivo, linhas.map((x) => JSON.stringify(x)).join('\n') + (linhas.length ? '\n' : ''));
  return linhas.length;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const alvo = Object.entries(TABELAS).filter(([t]) => !PUBLICO || !STAGING.has(t));
  console.log(`Modo: ${PUBLICO ? 'PÚBLICO (anon key — sem staging)' : 'COMPLETO (service key)'} — ${alvo.length} tabelas`);
  const manifest = { gerado_em: new Date().toISOString(), url: URL, modo: PUBLICO ? 'publico' : 'completo', tabelas: {} };
  let total = 0;
  for (const [tabela, pk] of alvo) {
    process.stdout.write(`  ${tabela} … `);
    const n = await dumpTabela(tabela, pk);
    manifest.tabelas[tabela] = n;
    total += n;
    console.log(`${n} linhas`);
  }
  manifest.total_linhas = total;
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nOK — ${total} linhas em ${alvo.length} tabelas → ${OUT}/`);
  console.log('Guarde essa pasta FORA do git (o .gitignore já ignora backup_*/).');
}

main().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
