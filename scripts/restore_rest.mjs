// restore_rest.mjs — restauração dos backups NDJSON gerados por backup_rest.mjs.
//
// Segurança por padrão:
//   1. sem `--apply`, apenas valida manifest, contagens, JSON e SHA-256;
//   2. com `--apply`, exige projeto-alvo explícito e confirmação do project ref;
//   3. recusa restaurar sobre o projeto que gerou o backup;
//   4. confere que TODAS as tabelas-alvo estão vazias antes do primeiro INSERT;
//   5. restaura a tabela-pai antes da única filha com FK e confere a contagem final.
//
// O script não cria estrutura. Antes dele, execute docs/backup_schema.sql num projeto vazio e,
// se o alvo pretendido for pós-Fase 3, aplique também as migrations versionadas. Veja
// docs/backup.md.
//
// Validação local, sem rede e sem credencial:
//   node scripts/restore_rest.mjs ./backup_AAAA-MM-DD
//
// Restauração real (somente projeto novo/descartável):
//   SUPABASE_RESTORE_URL="https://<ref>.supabase.co" \
//   SUPABASE_RESTORE_SECRET_KEY="<sb_secret_...>" \
//   node scripts/restore_rest.mjs ./backup_AAAA-MM-DD --apply --confirm-ref=<ref>
//
// Compatibilidade temporária: SUPABASE_RESTORE_SERVICE_KEY aceita a service_role JWT legada.
// Nunca use chave anon/publishable aqui: restauração é escrita administrativa.

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validarOrigem, lerValidado } from './lib/guardas_backup.mjs';

const TODAS = [
  'tabela_vista_teste', // pai da única FK — precisa vir antes de tarifa_atual_teste
  'tarifa_atual_teste',
  'itinerario_teste',
  'qh_teste',
  'qh_intervalo_teste',
  'qh_predeterminado_teste',
  'evento_teste',
  'evento_dados',
  'evento_textos',
  'evento_empresa_teste',
  'evento_linha_teste',
  'codempresa_teste',
  'portaria_teste',
  'portaria_data',
  'portaria_texto_teste',
  'municipio_teste',
  'localidades_teste',
  'origem_teste',
];
const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);
const PUBLICAS = TODAS.filter(t => !STAGING.has(t));
const PERMITIDAS = new Set(TODAS);

function uso(erro) {
  if (erro) console.error(`\nERRO: ${erro}\n`);
  console.error('Uso: node scripts/restore_rest.mjs <pasta-backup> [--apply --confirm-ref=<ref>] [--batch=<1..1000>]');
  process.exitCode = 1;
}

function argumentos(argv) {
  const pasta = argv.find(a => !a.startsWith('--'));
  const desconhecidos = argv.filter(a => a.startsWith('--')
    && a !== '--apply' && !a.startsWith('--confirm-ref=') && !a.startsWith('--batch='));
  if (desconhecidos.length) throw new Error(`opção desconhecida: ${desconhecidos.join(', ')}`);
  const batchArg = argv.find(a => a.startsWith('--batch='));
  const batch = batchArg ? Number(batchArg.slice('--batch='.length)) : 500;
  if (!Number.isInteger(batch) || batch < 1 || batch > 1000) throw new Error('--batch deve ser inteiro entre 1 e 1000');
  return {
    pasta: pasta ? resolve(pasta) : null,
    aplicar: argv.includes('--apply'),
    confirmarRef: (argv.find(a => a.startsWith('--confirm-ref=')) || '').slice('--confirm-ref='.length),
    batch,
  };
}

function mesmoConjunto(a, b) {
  return a.length === b.length && a.every(x => b.includes(x));
}

async function carregarManifest(pasta) {
  let manifest;
  try { manifest = JSON.parse(await readFile(join(pasta, 'manifest.json'), 'utf8')); }
  catch (e) { throw new Error(`manifest.json ausente ou inválido: ${e.message}`); }

  if (!manifest || typeof manifest !== 'object' || !manifest.tabelas || typeof manifest.tabelas !== 'object') {
    throw new Error('manifest.json sem o objeto "tabelas"');
  }
  if (!['publico', 'completo'].includes(manifest.modo)) throw new Error('manifest.json com "modo" inválido');
  const nomes = Object.keys(manifest.tabelas);
  const esperado = manifest.modo === 'publico' ? PUBLICAS : TODAS;
  const extras = nomes.filter(t => !PERMITIDAS.has(t));
  if (extras.length) throw new Error(`manifest contém tabela fora da allowlist: ${extras.join(', ')}`);
  if (!mesmoConjunto(nomes, esperado)) {
    const faltam = esperado.filter(t => !nomes.includes(t));
    throw new Error(`manifest ${manifest.modo} incompleto${faltam.length ? `; faltam: ${faltam.join(', ')}` : ''}`);
  }
  for (const tabela of nomes) {
    const m = manifest.tabelas[tabela];
    if (!m || !Number.isInteger(m.linhas) || m.linhas < 0 || !/^[0-9a-f]{64}$/.test(m.sha256 || '')) {
      throw new Error(`metadados inválidos de ${tabela} no manifest`);
    }
  }
  const soma = nomes.reduce((n, t) => n + manifest.tabelas[t].linhas, 0);
  if (Number.isFinite(manifest.total_linhas) && manifest.total_linhas !== soma) {
    throw new Error(`manifest total_linhas=${manifest.total_linhas}, mas as tabelas somam ${soma}`);
  }
  if (manifest.url) validarOrigem(manifest.url, { nome: 'url de origem do manifest', permitirLocal: true });
  return manifest;
}

// Parse do NDJSON a partir do TEXTO já validado — nunca a partir do caminho.
//
// Achado SEC-06 (auditoria de 26/08/2026): antes havia DUAS leituras do mesmo caminho — uma em
// `validarArquivos` (para o SHA-256) e outra aqui, já com `aoLote`, para montar os POSTs. Entre
// as duas cabia uma troca do arquivo, e o que ia para o banco não era o que tinha sido conferido.
// A bancada `tests/restore_rest.rig.mjs` (caso 7) CRIA essa janela e mediu o resultado antes da
// correção: as linhas trocadas (`row_id` 666/667) entraram no banco no lugar das validadas.
function linhasDoTexto(rotulo, texto) {
  const linhas = [];
  let numero = 0;
  for (const linha of texto.split('\n')) {
    if (!linha.trim()) continue;
    numero++;
    let dado;
    try { dado = JSON.parse(linha); }
    catch (e) { throw new Error(`${rotulo}:${numero}: JSON inválido (${e.message})`); }
    if (!dado || typeof dado !== 'object' || Array.isArray(dado)) {
      throw new Error(`${rotulo}:${numero}: cada linha precisa ser um objeto JSON`);
    }
    linhas.push(dado);
  }
  return linhas;
}

// Lê UMA vez por tabela, confere o SHA-256 sobre esses bytes e DEVOLVE as linhas já parseadas.
// Quem restaura usa este resultado; não há segundo `open` do mesmo caminho em lugar nenhum.
async function validarArquivos(pasta, manifest) {
  let total = 0;
  const conteudos = new Map();
  for (const tabela of TODAS.filter(t => manifest.tabelas[t])) {
    const arquivo = join(pasta, `${tabela}.ndjson`);
    const meta = manifest.tabelas[tabela];
    const bytes = await lerValidado(arquivo, meta.sha256);
    const linhas = linhasDoTexto(arquivo, bytes.toString('utf8'));
    if (linhas.length !== meta.linhas) {
      throw new Error(`${tabela}: arquivo tem ${linhas.length} linhas; manifest declara ${meta.linhas}`);
    }
    conteudos.set(tabela, linhas);
    total += linhas.length;
    console.log(`  ✓ ${tabela}: ${linhas.length} linhas, SHA-256 confere`);
  }
  return { total, conteudos };
}

function cabecalhos(chave, extras = {}) {
  const h = { apikey: chave, ...extras };
  // Chaves novas sb_secret_* são opacas e não podem ser usadas como Bearer JWT. A linha abaixo
  // mantém compatibilidade apenas com a service_role legada durante a transição.
  if (/^[^.]+\.[^.]+\.[^.]+$/.test(chave)) h.Authorization = `Bearer ${chave}`;
  return h;
}

function exigirChaveAdministrativa(chave) {
  if (chave.startsWith('sb_publishable_')) {
    throw new Error('foi fornecida uma chave publishable; use a sb_secret_* do projeto-alvo');
  }
  if (chave.startsWith('sb_secret_')) return;
  if (/^[^.]+\.[^.]+\.[^.]+$/.test(chave)) {
    // O try cobre só a DECODIFICAÇÃO. A recusa por role errada fica fora dele: dentro, o próprio
    // catch reembrulhava o throw e a mensagem saía aninhada ("legada inválida: JWT tem role=anon"),
    // escondendo o motivo real atrás de um diagnóstico de formato.
    let payload;
    try {
      const b64 = chave.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch (e) {
      throw new Error(`chave administrativa legada inválida: ${e.message}`);
    }
    if (payload?.role === 'service_role') return;
    throw new Error(`JWT tem role=${payload?.role || '(ausente)'}, não service_role`);
  }
  throw new Error('formato de chave administrativa desconhecido; use sb_secret_* ou service_role JWT legada');
}

async function contar(url, chave, tabela) {
  const r = await fetch(`${url}/rest/v1/${tabela}?select=*&limit=1`, {
    method: 'HEAD',
    headers: cabecalhos(chave, { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' }),
    redirect: 'error',
  });
  if (!r.ok) {
    throw new Error(`${tabela}: Data API respondeu HTTP ${r.status}. Confirme schema public exposto, grants e RLS antes de restaurar.`);
  }
  const faixa = r.headers.get('content-range') || '';
  const m = /\/(\d+)\s*$/.exec(faixa);
  if (!m) throw new Error(`${tabela}: resposta sem Content-Range exato (${faixa || 'vazio'})`);
  return Number(m[1]);
}

async function inserir(url, chave, tabela, lote) {
  // redirect:'error' — um 302 levaria a chave administrativa E os dados para outro host.
  const r = await fetch(`${url}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: cabecalhos(chave, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(lote),
    redirect: 'error',
  });
  if (!r.ok) throw new Error(`${tabela}: INSERT HTTP ${r.status} — ${await r.text()}`);
}

async function restaurar(manifest, conteudos, opts) {
  const urlBruta = process.env.SUPABASE_RESTORE_URL;
  const chave = process.env.SUPABASE_RESTORE_SECRET_KEY || process.env.SUPABASE_RESTORE_SERVICE_KEY;
  if (!urlBruta || !chave) {
    throw new Error('com --apply, defina SUPABASE_RESTORE_URL e SUPABASE_RESTORE_SECRET_KEY (ou a SERVICE_KEY legada)');
  }
  exigirChaveAdministrativa(chave);
  const { origem: url, ref } = validarOrigem(urlBruta, {
    nome: 'SUPABASE_RESTORE_URL',
    permitirLocal: true,
  });
  if (!opts.confirmarRef || opts.confirmarRef !== ref) {
    throw new Error(`confirmação ausente/incorreta: use --confirm-ref=${ref}`);
  }
  if (manifest.url && validarOrigem(manifest.url, { nome: 'url de origem do manifest', permitirLocal: true }).origem === url) {
    throw new Error('o destino é o mesmo projeto que gerou o backup; restaure somente em projeto novo/descartável');
  }

  const ordem = TODAS.filter(t => manifest.tabelas[t]);
  console.log(`\nPré-voo do destino ${ref}: todas as ${ordem.length} tabelas precisam estar vazias.`);
  const ocupadas = [];
  for (const tabela of ordem) {
    const n = await contar(url, chave, tabela);
    if (n !== 0) ocupadas.push(`${tabela}=${n}`);
  }
  if (ocupadas.length) throw new Error(`destino não está vazio (${ocupadas.join(', ')}); nenhum dado foi escrito`);

  console.log('\nAplicando dados:');
  for (const tabela of ordem) {
    let enviados = 0;
    const linhas = conteudos.get(tabela) || [];
    for (let i = 0; i < linhas.length; i += opts.batch) {
      const lote = linhas.slice(i, i + opts.batch);
      await inserir(url, chave, tabela, lote);
      enviados += lote.length;
    }
    const final = await contar(url, chave, tabela);
    const esperado = manifest.tabelas[tabela].linhas;
    if (enviados !== esperado || final !== esperado) {
      throw new Error(`${tabela}: restore parcial (enviadas=${enviados}, destino=${final}, esperado=${esperado})`);
    }
    console.log(`  ✓ ${tabela}: ${final}/${esperado}`);
  }
  console.log(`\n✓ RESTAURAÇÃO CONCLUÍDA — ${manifest.total_linhas ?? ordem.reduce((n, t) => n + manifest.tabelas[t].linhas, 0)} linhas no projeto ${ref}.`);
  console.log('Ainda falta validar segurança, qualidade, Realtime e um preview real contra o projeto restaurado; veja docs/backup.md.');
}

async function main() {
  let opts;
  try { opts = argumentos(process.argv.slice(2)); }
  catch (e) { uso(e.message); return; }
  if (!opts.pasta) { uso('informe a pasta do backup'); return; }

  console.log(`Validando backup em ${opts.pasta}:`);
  const manifest = await carregarManifest(opts.pasta);
  const { total, conteudos } = await validarArquivos(opts.pasta, manifest);
  console.log(`\n✓ BACKUP VÁLIDO — modo ${manifest.modo}, ${Object.keys(manifest.tabelas).length} tabelas, ${total} linhas.`);

  if (!opts.aplicar) {
    console.log('Simulação concluída: nenhum acesso ao banco e nenhuma escrita. Use --apply somente após preparar um projeto vazio.');
    return;
  }
  await restaurar(manifest, conteudos, opts);
}

main().catch(e => {
  console.error(`\n✗ RESTORE ABORTADO: ${e.message}`);
  console.error('Se algum lote já havia sido inserido, descarte/recrie o projeto-alvo antes de tentar novamente; o script nunca apaga dados.');
  process.exitCode = 1;
});
