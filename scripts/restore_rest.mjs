// restore_rest.mjs — Restaura os DADOS de um backup NDJSON gerado pelo backup_rest.mjs.
//
// Fecha o achado 2 da auditoria cruzada de 31/07/2026: o workflow semanal
// (.github/workflows/backup.yml) produzia NDJSON desde 21/07/2026, mas o repositório não tinha
// nem script nem procedimento para LER esse formato de volta. Um backup sem caminho de volta é
// uma cópia de dados, não uma capacidade de recuperação — e a única camada AUTOMÁTICA do
// projeto era justamente a que não tinha volta.
//
// ⚠️ ESTE É O ÚNICO SCRIPT DO REPO QUE ESCREVE NO BANCO. Todos os outros são leitura.
// Por isso o padrão é CONFERIR e não escrever: sem `--executar` ele valida o backup, diz
// exatamente o que faria e sai. Escrever exige a flag, e sobrescrever tabela com conteúdo
// exige outra (`--sobrescrever`).
//
// ⚠️ SÓ DADOS. Restaure a ESTRUTURA antes, com docs/backup_schema.sql (tabelas, PK/FK, índices,
// RLS, policies, grants, funções, trigger). Este script não cria nada; se a tabela não existir,
// ele falha.
//
// ⚠️ EXIGE SERVICE KEY. `anon` só tem SELECT (postura read-only do portal, e é para continuar
// assim — ver CLAUDE.md). Não existe caminho de escrita pela chave pública, então também não
// existe restore pela chave pública. A service key roda na SUA máquina e não sai dela.
//
// LIMITAÇÃO DO ARTIFACT AUTOMÁTICO: o backup.yml roda em modo PÚBLICO (anon key), então o
// artifact do Actions tem só as 14 tabelas públicas — sem as 4 de staging do ETL
// (evento_dados, evento_textos, portaria_data, portaria_texto_teste). Restaurar a partir dele
// devolve o portal ao ar, mas deixa a staging vazia, e um rebuild do ETL desfaz correções
// feitas só nas tabelas finais. Para restore completo use um backup em modo COMPLETO
// (service key) ou o pg_dump. Ver docs/backup.md.
//
// Uso:
//   # 1) conferir o backup (não escreve nada — é o padrão)
//   SUPABASE_URL="https://<ref>.supabase.co" \
//   SUPABASE_SERVICE_KEY="<service_role key>" \
//   node scripts/restore_rest.mjs ./backup_2026-07-31
//
//   # 2) restaurar de verdade, em banco com as tabelas VAZIAS
//   … node scripts/restore_rest.mjs ./backup_2026-07-31 --executar
//
//   # 3) restaurar por cima de tabelas com conteúdo (APAGA o conteúdo atual delas)
//   … node scripts/restore_rest.mjs ./backup_2026-07-31 --executar --sobrescrever
//
// Requer apenas Node 18+ (fetch nativo). Nenhuma dependência.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PK, ORDEM_INSERCAO as ORDEM, COM_IDENTITY } from './lib/tabelas.mjs';
import { cabecalhosSB } from './lib/sb.mjs';

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DIR = process.argv[2];
const EXECUTAR = process.argv.includes('--executar');
const SOBRESCREVER = process.argv.includes('--sobrescrever');
const LOTE = 500; // linhas por POST

if (!DIR) {
  console.error('Uso: node scripts/restore_rest.mjs <pasta-do-backup> [--executar] [--sobrescrever]');
  console.error('Veja o cabeçalho do arquivo.');
  process.exit(1);
}
if (!URL || !SERVICE_KEY) {
  console.error('Faltou SUPABASE_URL e/ou SUPABASE_SERVICE_KEY no ambiente.');
  console.error('O restore EXIGE service key: anon só tem SELECT, por desenho. Ver o cabeçalho.');
  process.exit(1);
}

const headers = cabecalhosSB(SERVICE_KEY);

// Conta as linhas que a tabela tem AGORA, pelo Content-Range do PostgREST ("0-0/52146").
async function contar(tabela) {
  const r = await fetch(`${URL}/rest/v1/${tabela}?select=*&limit=1`, {
    headers: { ...headers, Prefer: 'count=exact' },
  });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ao contar — ${await r.text()}`);
  const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
  if (!m) throw new Error(`${tabela}: PostgREST não devolveu contagem (Content-Range ausente)`);
  return Number(m[1]);
}

async function apagar(tabela) {
  // Filtro explícito `<pk>=not.is.null` em vez de DELETE sem filtro. A PK é NOT NULL, então
  // isto casa TODAS as linhas — o alvo é mesmo a tabela inteira. O filtro está aqui por dois
  // motivos: deixa a intenção legível na própria URL, e não depende de o PostgREST aceitar
  // DELETE sem filtro (comportamento que já variou entre versões e que, se um dia for
  // bloqueado, quebraria isto em silêncio no meio de um restore).
  const pk = PK[tabela].split(',')[0];
  const r = await fetch(`${URL}/rest/v1/${tabela}?${pk}=not.is.null`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} ao apagar — ${await r.text()}`);
}

async function inserir(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    const r = await fetch(`${URL}/rest/v1/${tabela}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) {
      throw new Error(`${tabela}: HTTP ${r.status} no lote ${i}-${i + lote.length} — ${await r.text()}`);
    }
    process.stdout.write(`\r  ${tabela} … ${Math.min(i + LOTE, linhas.length)}/${linhas.length}`);
  }
}

async function main() {
  const manifest = JSON.parse(await readFile(join(DIR, 'manifest.json'), 'utf8'));
  const doManifest = Object.keys(manifest.tabelas || {});
  console.log(`Backup: ${DIR}`);
  console.log(`Gerado em: ${manifest.gerado_em} · modo: ${manifest.modo} · origem: ${manifest.url}`);
  console.log(`Destino:  ${URL}`);
  if (manifest.url === URL) {
    console.log('  (origem e destino são o MESMO projeto — restore no lugar)');
  }
  console.log('');

  // ---- Fase 1: conferir o backup ANTES de tocar no banco -------------------------------------
  // Os SHA-256 estavam no manifest.json desde 21/07/2026 e nada os consumia. Conferir aqui é o
  // que separa "restaurei o backup" de "escrevi no banco um arquivo que eu não sei se está
  // íntegro" — e um restore é exatamente o momento em que ninguém tem uma segunda cópia.
  console.log('Conferindo integridade dos arquivos (SHA-256 do manifest):');
  const dados = new Map();
  const problemas = [];
  for (const tabela of doManifest) {
    const esperado = manifest.tabelas[tabela];
    let conteudo;
    try {
      conteudo = await readFile(join(DIR, `${tabela}.ndjson`), 'utf8');
    } catch {
      problemas.push(`${tabela}: arquivo ${tabela}.ndjson não encontrado`);
      continue;
    }
    const sha = createHash('sha256').update(conteudo).digest('hex');
    const linhas = conteudo.split('\n').filter(Boolean).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`${tabela}.ndjson linha ${i + 1}: JSON inválido`); }
    });
    if (sha !== esperado.sha256) problemas.push(`${tabela}: SHA-256 não confere (arquivo corrompido ou editado)`);
    if (linhas.length !== esperado.linhas) problemas.push(`${tabela}: ${linhas.length} linhas no arquivo, ${esperado.linhas} no manifest`);
    dados.set(tabela, linhas);
    console.log(`  ${sha === esperado.sha256 && linhas.length === esperado.linhas ? '✓' : '✗'} ${tabela} — ${linhas.length} linhas`);
  }

  // Arquivo .ndjson na pasta que o manifest não menciona: ou o manifest está errado, ou alguém
  // acrescentou arquivo à mão. Nos dois casos o operador precisa saber antes de escrever.
  const naPasta = (await readdir(DIR)).filter(f => f.endsWith('.ndjson')).map(f => f.replace(/\.ndjson$/, ''));
  for (const f of naPasta) if (!doManifest.includes(f)) problemas.push(`${f}.ndjson está na pasta mas não no manifest`);

  if (problemas.length) {
    console.error('\n✗ BACKUP NÃO CONFIÁVEL — não vou escrever nada:');
    for (const p of problemas) console.error(`    ${p}`);
    process.exit(1);
  }
  const totalLinhas = [...dados.values()].reduce((s, l) => s + l.length, 0);
  console.log(`\n✓ Integridade OK — ${totalLinhas} linhas em ${dados.size} tabelas.`);

  if (manifest.modo === 'publico') {
    console.log('\n⚠ Backup em modo PÚBLICO: as 4 tabelas de staging do ETL NÃO estão aqui.');
    console.log('  O portal volta ao ar, mas um rebuild do ETL desfaz correções feitas só nas');
    console.log('  tabelas finais. Ver docs/backup.md.');
  }

  // ---- Fase 2: estado atual do destino -------------------------------------------------------
  console.log('\nEstado atual do destino:');
  const ordenadas = ORDEM.filter(t => dados.has(t));
  const fora = [...dados.keys()].filter(t => !ORDEM.includes(t));
  if (fora.length) {
    console.error(`\n✗ Tabela fora da ordem conhecida: ${fora.join(', ')}`);
    console.error('  Acrescente-a a ORDEM neste script, no lugar certo em relação às FKs.');
    process.exit(1);
  }
  const naoVazias = [];
  for (const tabela of ordenadas) {
    const atual = await contar(tabela);
    if (atual > 0) naoVazias.push(`${tabela} (${atual} linhas)`);
    console.log(`  ${tabela} — ${atual} linhas${atual > 0 ? '  ⚠ não está vazia' : ''}`);
  }

  if (naoVazias.length && !SOBRESCREVER) {
    console.error('\n✗ Estas tabelas têm conteúdo:');
    for (const t of naoVazias) console.error(`    ${t}`);
    console.error('\nRestaurar por cima duplicaria ou colidiria com as chaves existentes.');
    console.error('Se a intenção é APAGAR o conteúdo atual e pôr o do backup, repita com --sobrescrever.');
    process.exit(1);
  }

  // ---- Fase 3: escrever ----------------------------------------------------------------------
  if (!EXECUTAR) {
    console.log('\n— CONFERÊNCIA APENAS (nada foi escrito) —');
    console.log(`Com --executar, este comando ${SOBRESCREVER ? 'APAGARIA o conteúdo atual e inseriria' : 'inseriria'} ${totalLinhas} linhas em ${ordenadas.length} tabelas.`);
    console.log('Ordem:', ordenadas.join(' → '));
    return;
  }

  console.log(`\nRestaurando${SOBRESCREVER ? ' (com --sobrescrever: apaga antes de inserir)' : ''}:`);
  // Apagar na ordem INVERSA da inserção: a FK tem ON DELETE CASCADE, então apagar o hub primeiro
  // levaria junto as tarifas — que já estariam apagadas de qualquer forma, mas a ordem inversa
  // deixa a intenção explícita e não depende do CASCADE para dar certo.
  if (SOBRESCREVER) {
    for (const tabela of [...ordenadas].reverse()) {
      process.stdout.write(`  apagando ${tabela} … `);
      await apagar(tabela);
      console.log('ok');
    }
  }
  for (const tabela of ordenadas) {
    const linhas = dados.get(tabela);
    if (!linhas.length) { console.log(`  ${tabela} … vazia, nada a inserir`); continue; }
    await inserir(tabela, linhas);
    console.log('');
  }

  // ---- Fase 4: conferir o que ficou no banco -------------------------------------------------
  console.log('\nConferindo contagens no destino:');
  const divergentes = [];
  for (const tabela of ordenadas) {
    const atual = await contar(tabela);
    const esperado = dados.get(tabela).length;
    if (atual !== esperado) divergentes.push(`${tabela}: ${atual} no banco, ${esperado} no backup`);
    console.log(`  ${atual === esperado ? '✓' : '✗'} ${tabela} — ${atual}/${esperado}`);
  }
  if (divergentes.length) {
    console.error('\n✗ RESTORE INCOMPLETO:');
    for (const d of divergentes) console.error(`    ${d}`);
    process.exit(1);
  }

  console.log(`\n✓ ${totalLinhas} linhas restauradas em ${ordenadas.length} tabelas.`);
  console.log('\nFALTA FAZER À MÃO (o PostgREST não executa SQL arbitrário):');
  console.log('  1. Reposicionar as sequências de row_id — SQL Editor:');
  for (const t of COM_IDENTITY.filter(t => dados.has(t))) {
    console.log(`     select setval(pg_get_serial_sequence('public.${t}','row_id'),`);
    console.log(`                   coalesce((select max(row_id) from public.${t}), 1));`);
  }
  console.log('  2. Conferir estrutura e segurança: rode docs/backup_schema.sql (é idempotente).');
  console.log('  3. Passo 8 do docs/backup.md — conferir que o restore prestou.');
}

main().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
