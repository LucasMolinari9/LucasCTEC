// backup_rest.mjs — Backup lógico (só DADOS) das tabelas do portal DIVAT.
//
// Para quem NÃO tem pg_dump instalado. Usa a REST do Supabase (PostgREST) e pagina por KEYSET
// sobre a PRIMARY KEY de cada tabela ("traga o que vem depois desta chave"), não por OFFSET.
// Gera 1 arquivo NDJSON por tabela + manifest.json com contagem e SHA-256 por tabela.
//
// (Até 27/07/2026 este cabeçalho dizia "pagina pela PRIMARY KEY" enquanto o código fazia
// `order=PK` + `offset` — que é outra coisa, e vulnerável a pular/duplicar linha sob escrita
// concorrente. Achado da revisão externa.)
//
// DOIS MODOS (decidido pela chave presente no ambiente):
//   COMPLETO — SUPABASE_SECRET_KEY (preferida) ou SUPABASE_SERVICE_KEY legada: baixa TUDO,
//              inclusive as 4 tabelas de staging do ETL. Rodar só na SUA máquina.
//   PÚBLICO  — SUPABASE_PUBLISHABLE_KEY (preferida) ou SUPABASE_ANON_KEY legada: baixa as 14 tabelas públicas
//              do portal (sem staging). É o modo do workflow do GitHub Actions
//              (.github/workflows/backup.yml) — a anon key é pública por design, então o
//              artifact não expõe nada além do que a API pública já expõe.
//
// NÃO substitui o pg_dump (que também salva schema/policies/índices). Ver docs/backup.md.
//
// Uso (modo completo, na SUA máquina):
//   SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
//   SUPABASE_SECRET_KEY="<sb_secret_...: Dashboard → Settings → API Keys>" \
//   node scripts/backup_rest.mjs ./backup_$(date +%Y-%m-%d)
//
// Uso público: mesmo comando, com SUPABASE_PUBLISHABLE_KEY (ou SUPABASE_ANON_KEY legada).
//
// Requer apenas Node 18+ (usa fetch nativo). Nenhuma dependência.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validarOrigem, pastaNova } from './lib/guardas_backup.mjs';

const URL_BRUTA = process.env.SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const KEY = SECRET_KEY || SERVICE_KEY || PUBLISHABLE_KEY || ANON_KEY;
const PUBLICO = !SECRET_KEY && !SERVICE_KEY; // sem chave administrativa → só o que o RLS público permite
const OUT = process.argv[2] || `./backup_${new Date().toISOString().slice(0, 10)}`;
const PAGE = 1000; // linhas por requisição (abaixo de qualquer max-rows do PostgREST)

if (!URL_BRUTA || !KEY) {
  console.error('Faltou SUPABASE_URL e/ou uma chave (SECRET/SERVICE para completo; PUBLISHABLE/ANON para público). Veja o cabeçalho do arquivo.');
  process.exit(1);
}

// Achado SEC-04 (auditoria de 26/08/2026): até aqui o script mandava a chave secret/service para
// o que estivesse em SUPABASE_URL, sem validar protocolo, host nem redirect — o `restore_rest.mjs`
// já validava, o backup não. A regra agora é uma só, em scripts/lib/guardas_backup.mjs.
// `permitirLocal` fica com a bancada offline (tests/backup_rest.rig.mjs sobe HTTP em 127.0.0.1),
// e ali a chave é sempre publishable falsa — daí `chaveAdmin` recusar o par local+administrativa.
let URL;
try {
  ({ origem: URL } = validarOrigem(URL_BRUTA, {
    nome: 'SUPABASE_URL',
    permitirLocal: true,
    chaveAdmin: !PUBLICO,
  }));
} catch (e) {
  console.error(`ERRO: ${e.message}`);
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

// Chaves novas sb_publishable_*/sb_secret_* são opacas: vão no header apikey, mas não são JWTs
// e não podem ser tratadas como `Authorization: Bearer`. O Bearer fica só para as JWTs legadas.
const headers = { apikey: KEY };
if (/^[^.]+\.[^.]+\.[^.]+$/.test(KEY)) headers.Authorization = `Bearer ${KEY}`;

// Filtro keyset: "traga o que vem DEPOIS desta chave". Para PK de uma coluna é um `gt` simples;
// para PK composta é a comparação lexicográfica escrita à mão, porque o PostgREST não expõe
// comparação de tupla: (a,b) > (x,y)  ⇔  a > x OR (a = x AND b > y).
function filtroKeyset(cols, ultimo) {
  const v = c => encodeURIComponent(String(ultimo[c]));
  if (cols.length === 1) return `&${cols[0]}=gt.${v(cols[0])}`;
  const termos = [];
  for (let i = 0; i < cols.length; i++) {
    const iguais = cols.slice(0, i).map(c => `${c}.eq.${v(c)}`);
    const maior = `${cols[i]}.gt.${v(cols[i])}`;
    termos.push(iguais.length ? `and(${[...iguais, maior].join(',')})` : maior);
  }
  return `&or=(${termos.join(',')})`;
}

// Paginação KEYSET, não OFFSET. Com offset, uma escrita concorrente que insere ou apaga uma linha
// antes da página atual desloca a janela: linhas são PULADAS ou DUPLICADAS silenciosamente, e o
// dump sai plausível e errado. O keyset ancora na última chave lida, então uma escrita concorrente
// pode fazer faltar/sobrar dado novo, mas nunca embaralha o que já passou.
// (O cabeçalho deste arquivo dizia "pagina pela PRIMARY KEY" desde sempre; era `order=PK` +
// `offset`, que é outra coisa. Achado da revisão externa de 27/07/2026.)
async function dumpTabela(tabela, pk) {
  const cols = pk.split(',');
  const linhas = [];
  let ultimo = null;

  // count=exact na primeira requisição: o total do servidor, para conferir no fim se o que desceu
  // é o que existia. Sem isso, uma página curta espúria encerra o laço e o dump termina "com
  // sucesso" faltando dado — falha silenciosa, a pior espécie num backup.
  let esperado = null;

  for (;;) {
    const url = `${URL}/rest/v1/${tabela}?select=*&order=${cols.map(c => `${c}.asc`).join(',')}&limit=${PAGE}`
      + (ultimo ? filtroKeyset(cols, ultimo) : '');
    // redirect:'error' — sem isso um 302 na resposta levaria a chave administrativa para outro
    // host, que é o mesmo buraco do SEC-04 pelo lado da RESPOSTA em vez da variável de ambiente.
    const r = await fetch(url, {
      headers: ultimo ? headers : { ...headers, Prefer: 'count=exact' },
      redirect: 'error',
    });
    if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status} — ${await r.text()}`);
    if (esperado === null) {
      // Content-Range: "0-999/52146" — o que vem depois da barra é o total.
      const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
      if (m) esperado = Number(m[1]);
    }
    const page = await r.json();
    linhas.push(...page);
    if (page.length < PAGE) break; // última página
    ultimo = page[page.length - 1];
  }

  const arquivo = join(OUT, `${tabela}.ndjson`);
  const conteudo = linhas.map((x) => JSON.stringify(x)).join('\n') + (linhas.length ? '\n' : '');
  // flag 'wx': falha se o arquivo já existe, em vez de truncar (SEC-05).
  await writeFile(arquivo, conteudo, { flag: 'wx' });

  // SHA-256 do arquivo: detecta corrupção em trânsito e no armazenamento. NÃO prova consistência
  // lógica — um dump internamente incoerente tem hash tão válido quanto um bom. Está aqui para
  // responder "este arquivo é o mesmo que eu gerei?", não "este dump presta?".
  const sha256 = createHash('sha256').update(conteudo).digest('hex');
  return { linhas: linhas.length, esperado, sha256 };
}

async function main() {
  await pastaNova(OUT);
  const alvo = Object.entries(TABELAS).filter(([t]) => !PUBLICO || !STAGING.has(t));
  console.log(`Modo: ${PUBLICO ? 'PÚBLICO (publishable/anon — sem staging)' : 'COMPLETO (secret/service)'} — ${alvo.length} tabelas`);
  const manifest = { formato: 1, gerado_em: new Date().toISOString(), url: URL, modo: PUBLICO ? 'publico' : 'completo', tabelas: {} };
  let total = 0;
  const faltando = [], sobrando = [];
  for (const [tabela, pk] of alvo) {
    process.stdout.write(`  ${tabela} … `);
    const { linhas, esperado, sha256 } = await dumpTabela(tabela, pk);
    manifest.tabelas[tabela] = { linhas, esperado, sha256 };
    total += linhas;
    // Assimetria deliberada: baixar MENOS que o servidor contou é dado faltando — backup corrompido,
    // aborta. Baixar MAIS é linha inserida durante a corrida — benigno, só avisa. Falhar nos dois
    // casos jogaria fora um backup bom por causa de uma escrita concorrente; não falhar no primeiro
    // entregaria um backup incompleto com cara de sucesso.
    if (esperado !== null && linhas < esperado) faltando.push(`${tabela}: baixou ${linhas}, servidor contou ${esperado}`);
    if (esperado !== null && linhas > esperado) sobrando.push(`${tabela}: baixou ${linhas}, servidor contou ${esperado}`);
    console.log(`${linhas} linhas${esperado !== null && linhas !== esperado ? ` (servidor: ${esperado})` : ''}`);
  }
  manifest.total_linhas = total;
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });

  if (sobrando.length) {
    console.log(`\n⚠ Mais linhas que a contagem inicial (provável escrita durante o dump) — não invalida:`);
    for (const s of sobrando) console.log(`    ${s}`);
  }
  if (faltando.length) {
    console.error(`\n✗ BACKUP INCOMPLETO — desceu menos do que o servidor contou:`);
    for (const s of faltando) console.error(`    ${s}`);
    console.error('\nNão use este dump. Rode de novo; se repetir, investigue antes de confiar.');
    process.exit(1);
  }

  console.log(`\nOK — ${total} linhas em ${alvo.length} tabelas → ${OUT}/`);
  console.log('Guarde essa pasta FORA do git (o .gitignore já ignora backup_*/).');
  console.log('SHA-256 por tabela está no manifest.json — confere BYTES, não consistência lógica.');
}

main().catch((e) => {
  console.error('\nFALHOU:', e.message);
  process.exit(1);
});
