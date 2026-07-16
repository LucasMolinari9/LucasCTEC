// backup_rest.mjs — Backup lógico (só DADOS) das tabelas do portal DIVAT.
//
// Para quem NÃO tem pg_dump instalado. Usa a REST do Supabase (PostgREST) com a
// SERVICE KEY (ignora RLS → baixa tudo, inclusive as tabelas de staging) e pagina
// pela PRIMARY KEY de cada tabela. Gera 1 arquivo NDJSON por tabela + manifest.json.
//
// NÃO substitui o pg_dump (que também salva schema/policies/índices). Ver BACKUP.md.
//
// Uso (na SUA máquina — daqui o ambiente do Claude não alcança o Supabase):
//   SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
//   SUPABASE_SERVICE_KEY="<service_role key: Dashboard → Settings → API>" \
//   node scripts/backup_rest.mjs ./backup_$(date +%Y-%m-%d)
//
// Requer apenas Node 18+ (usa fetch nativo). Nenhuma dependência.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
const OUT = process.argv[2] || `./backup_${new Date().toISOString().slice(0, 10)}`;
const PAGE = 1000; // linhas por requisição (abaixo de qualquer max-rows do PostgREST)

if (!URL || !KEY) {
  console.error('Faltou SUPABASE_URL e/ou SUPABASE_SERVICE_KEY no ambiente. Veja o cabeçalho do arquivo.');
  process.exit(1);
}

// tabela -> coluna de PK usada para ordenar a paginação (todas têm PK desde 15/07/2026).
const TABELAS = {
  tabela_vista_teste: 'codlinha',      // PK composta (codlinha,codempresa); ordenar por codlinha basta
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
  const manifest = { gerado_em: new Date().toISOString(), url: URL, tabelas: {} };
  let total = 0;
  for (const [tabela, pk] of Object.entries(TABELAS)) {
    process.stdout.write(`  ${tabela} … `);
    const n = await dumpTabela(tabela, pk);
    manifest.tabelas[tabela] = n;
    total += n;
    console.log(`${n} linhas`);
  }
  manifest.total_linhas = total;
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nOK — ${total} linhas em ${Object.keys(TABELAS).length} tabelas → ${OUT}/`);
  console.log('Guarde essa pasta FORA do git (o .gitignore já ignora backup_*/).');
}

main().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
