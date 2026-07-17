// check_data_quality.mjs — Checagem VIVA de qualidade dos dados pós-ETL (P1).
//
// O dono alimenta o banco direto pelo Supabase (service role). Este script confere, do lado
// de fora (anon, read-only), problemas que o ETL pode introduzir e que o portal não avisa:
//   - encoding_ufffd  ......  células com o caractere U+FFFD (corrupção de encoding na origem)
//   - codlinha_orfa   ......  codlinha em tabela filha sem correspondência em tabela_vista_teste
//   - cod_municipio_origem_invalido ..  itinerario aponta município que não existe
//   - cod_origem_invalido ..  qh_* aponta origem/terminal que não existe
//   - codempresa_invalida ..  linha aponta empresa que não existe
//
// A lógica mora numa função SQL read-only public.divat_data_quality() (SECURITY INVOKER,
// EXECUTE p/ anon) — assim este runner é fino e roda em qualquer lugar sem dependências.
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_data_quality.mjs
//
// Requer só Node 18+ (fetch nativo). Sem dependências, sem chave no ambiente (usa a URL e a
// anon key públicas do index.html). Sai 1 se houver problema de severidade "erro" (referencial),
// 0 caso contrário. Os "aviso" (ex.: U+FFFD, irrecuperável pelo banco) não derrubam o processo.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function extrair(html, re, oquê) {
  const m = re.exec(html);
  if (!m) { console.error(`Não achei ${oquê} no index.html.`); process.exit(1); }
  return m[1];
}

const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const SB_URL = extrair(html, /const SB_URL\s*=\s*'([^']+)'/, 'SB_URL');
const SB_KEY = extrair(html, /const SB_KEY\s*=\s*'([^']+)'/, 'SB_KEY');

let achados;
try {
  const resp = await fetch(`${SB_URL}/rest/v1/rpc/divat_data_quality`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`RPC divat_data_quality falhou (HTTP ${resp.status}): ${txt}`);
    console.error('A função public.divat_data_quality() existe e tem GRANT EXECUTE para anon?');
    process.exit(1);
  }
  achados = await resp.json();
} catch (e) {
  console.error('Erro de rede ao chamar o Supabase (este script precisa de rede):', e.message);
  process.exit(1);
}

if (!achados.length) {
  console.log('✓ Qualidade dos dados: nenhum problema encontrado.');
  process.exit(0);
}

const erros = achados.filter(a => a.severidade === 'erro');
const avisos = achados.filter(a => a.severidade !== 'erro');

const linha = a => `  [${a.severidade}] ${a.verificacao} (${a.qtd}): ${a.detalhe}`;
if (erros.length)  { console.error('✗ Problemas referenciais (erro):'); erros.forEach(a => console.error(linha(a))); }
if (avisos.length) { console.log('⚠ Avisos (não bloqueiam):'); avisos.forEach(a => console.log(linha(a))); }

process.exit(erros.length ? 1 : 0);
