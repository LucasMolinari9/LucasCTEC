// check_realtime.mjs — Checagem VIVA da sincronização do Realtime (RT_TABLES ↔ banco).
//
// O teste offline tests/realtime.test.js garante que o lado do JS é consistente
// (VIEW_TABLES ⊆ RT_TABLES e RT_TABLES == a lista esperada), mas essa lista esperada é
// mantida À MÃO — pode driftar da publicação real do Postgres. Este script fecha essa
// lacuna: pergunta ao BANCO quais tabelas estão na publicação supabase_realtime e compara
// com RT_TABLES do app.js. Roda depois de mexer no Realtime (e vale como passo de CI).
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_realtime.mjs
//
// Requer apenas Node 18+ (fetch nativo). Nenhuma dependência. O ALVO (de qual banco se
// pergunta) vem da variável DIVAT_ALVO — ver abaixo —, e a RPC consultada é a
// public.realtime_tables() (SECURITY DEFINER, EXECUTE p/ anon), que lista a publicação.
// Sai com código 0 se bate, 1 se há divergência (ou erro).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { carregarAmbiente } from './lib/ambiente.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function extrair(html, re, oquê) {
  const m = re.exec(html);
  if (!m) { console.error(`Não achei ${oquê} no app.js.`); process.exit(1); }
  return m[1];
}

// O alvo vem de DIVAT_ALVO, decidido pelo gatilho do workflow — nunca do app.js (issue #74).
// Ler o host de produção de um literal do frontend fazia uma edição no app.js redirecionar
// este gate; e um gate de PR podia falar com produção sem ninguém pedir.
let SB_URL, SB_KEY, ALVO;
try {
  ({ url: SB_URL, key: SB_KEY, alvo: ALVO } = await carregarAmbiente(ROOT));
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
console.log(`· Alvo: ${ALVO}`);

// O app.js continua sendo lido — mas só pelo LADO DO REPOSITÓRIO da comparação (RT_TABLES),
// nunca mais pelo endereço do banco.
const html = await readFile(join(ROOT, 'app.js'), 'utf8');

// RT_TABLES é um array de string literais; pega o bloco e extrai os nomes entre aspas.
const bloco = extrair(html, /const RT_TABLES\s*=\s*\[([\s\S]*?)\]/, 'RT_TABLES');
const rtTables = [...bloco.matchAll(/'([^']+)'/g)].map(m => m[1]).sort();

// Pergunta ao banco a publicação real via RPC.
let doBanco;
try {
  const resp = await fetch(`${SB_URL}/rest/v1/rpc/realtime_tables`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`RPC realtime_tables falhou (HTTP ${resp.status}): ${txt}`);
    console.error('A função public.realtime_tables() existe e tem GRANT EXECUTE para anon?');
    process.exit(1);
  }
  doBanco = (await resp.json()).sort();
} catch (e) {
  console.error('Erro de rede ao chamar o Supabase (este script precisa de rede):', e.message);
  process.exit(1);
}

const soNoCodigo = rtTables.filter(t => !doBanco.includes(t));
const soNoBanco = doBanco.filter(t => !rtTables.includes(t));

if (soNoCodigo.length === 0 && soNoBanco.length === 0) {
  console.log(`✓ Realtime em sincronia: ${rtTables.length} tabelas (RT_TABLES == publicação supabase_realtime).`);
  process.exit(0);
}

console.error('✗ DRIFT entre RT_TABLES (app.js) e a publicação supabase_realtime do banco:');
if (soNoCodigo.length) console.error(`  Em RT_TABLES mas NÃO na publicação: ${soNoCodigo.join(', ')}`);
if (soNoBanco.length) console.error(`  Na publicação mas NÃO em RT_TABLES: ${soNoBanco.join(', ')}`);
console.error('Corrija: alter publication supabase_realtime add/drop table ...  e/ou ajuste RT_TABLES.');
process.exit(1);
