// check_data_quality.mjs — Checagem VIVA de qualidade dos dados pós-ETL (issue #63).
//
// Por que existe: o banco é "hub-and-spoke" — quase tudo se liga a tabela_vista_teste por
// codlinha, mas a ÚNICA foreign key real é a fk_tarifa_linha. Os outros joins são convenção,
// feitos no JavaScript, e o Postgres não os garante. Logo a integridade depende da disciplina
// do ETL, não do banco. Quando um filho aponta para codlinha/cod_origem que não existe no pai,
// o portal NÃO avisa: a tela simplesmente aparece vazia, sem erro. Este script é o alarme.
//
// Irmão do check_realtime.mjs e do check_deriva.mjs: mesma forma (função read-only no banco +
// runner fino aqui).
//
// MODO DUPLO (desde 04/08/2026), pela mesma razão do check_grants.mjs: a Fase 3 move
// divat_data_quality para o schema `audit`, fora do alcance de anon — e ainda bem, porque como
// RPC anônima ela é uma alavanca de indisponibilidade (59 varreduras completas sobre ~116 mil
// linhas por chamada, medido em 04/08/2026, acionável por qualquer um com a anon key, que é
// pública). Enquanto produção não recebe a migração, o caminho antigo continua valendo:
//   1. tenta audit.divat_data_quality() pelo login auditor (scripts/lib/auditor.mjs);
//   2. se ele não estiver disponível, cai na RPC anônima e AVISA — dizendo POR QUE o auditor
//      não respondeu e ATÉ QUANDO o fallback vale;
//   3. o fallback tem validade em scripts/prazos.json (id `check_data_quality_fallback`), e a
//      validade é consultada ANTES de tocar a rede: passada a data, o gate morre ali. Um gate
//      que só descobrisse a expiração depois de falhar no fetch daria a mensagem errada
//      justamente no dia em que a rede também estivesse ruim.
//   4. resposta que não seja uma LISTA aborta — perder a visão do banco nunca vira "nenhum
//      achado". É a pior falha possível aqui: gate verde por engano.
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_data_quality.mjs                  # respeita o baseline
//   node scripts/check_data_quality.mjs --sem-baseline    # estado cru do banco
//   node scripts/check_data_quality.mjs --atualizar-baseline
//
// Requer Node 18+ (fetch nativo) e, para o caminho do auditor, o cliente `psql` no PATH mais a
// variável SUPABASE_PROD_AUDIT_DATABASE_URL. Nenhuma dependência de npm. Sai 1 se houver achado
// de severidade `erro` além do baseline; avisos nunca derrubam.
//
// SOBRE O BASELINE (leia antes de mexer): quando este script nasceu, o banco JÁ tinha 5
// achados de erro (17 codlinhas órfãs em 4 tabelas + 4 linhas com cod_origem inválido) — a
// integridade hub-and-spoke já estava violada, sem ninguém saber. Um gate vermelho desde o
// primeiro dia é um gate que se aprende a ignorar, e apagar os achados seria mentir. Então o
// estado conhecido fica registrado em data_quality_baseline.json: o script passa hoje e falha
// no instante em que aparecer um achado NOVO ou um conhecido PIORAR. O baseline é dívida
// registrada, não perdão — cada linha dele é dado para consertar, e ao consertar rode
// --atualizar-baseline para o gate voltar a apertar.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { conectarAuditor } from './lib/auditor.mjs';
import { prazoPorId, classificar, hojeISO } from './lib/prazos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'data_quality_baseline.json');

const args = new Set(process.argv.slice(2));
const semBaseline = args.has('--sem-baseline') || args.has('--all');
const atualizar = args.has('--atualizar-baseline');

function extrair(js, re, oquê) {
  const m = re.exec(js);
  if (!m) { console.error(`Não achei ${oquê} no app.js.`); process.exit(1); }
  return m[1];
}

const js = await readFile(join(ROOT, 'app.js'), 'utf8');
const SB_URL = extrair(js, /const SB_URL\s*=\s*'([^']+)'/, 'SB_URL');
const SB_KEY = extrair(js, /const SB_KEY\s*=\s*'([^']+)'/, 'SB_KEY');

// MODO DUPLO (desde 04/08/2026), pela mesma razao do check_grants.mjs: a Fase 3 move
// divat_data_quality para o schema `audit`, fora do alcance de anon — e ainda bem, porque como
// RPC anonima ela e uma alavanca de indisponibilidade (59 varreduras completas sobre ~116 mil
// linhas por chamada, medido em 04/08/2026). Enquanto producao nao recebe a migracao, o caminho
// antigo continua valendo, com validade em scripts/prazos.json.
const SQL_ACHADOS = `select coalesce(jsonb_agg(t), '[]'::jsonb) from audit.divat_data_quality() t;`;

let achados = null;
try {
  const auditor = conectarAuditor({ ambiente: 'producao' });
  achados = JSON.parse(auditor.consultar(SQL_ACHADOS).trim().split(/\r?\n/).filter(Boolean).at(-1));
} catch (e) {
  const prazo = await prazoPorId(ROOT, 'check_data_quality_fallback');
  const v = classificar(prazo, hojeISO());
  if (v.nivel === 'erro') {
    console.error(`✗ Caminho do auditor indisponível (${e.message}) e o fallback anônimo EXPIROU: ${v.mensagem}`);
    process.exit(1);
  }
  console.log(`⚠ Auditor indisponível (${e.message}); usando a RPC anônima (${v.mensagem}).`);
  const resp = await fetch(`${SB_URL}/rest/v1/rpc/divat_data_quality`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    console.error(`RPC divat_data_quality falhou (HTTP ${resp.status}): ${await resp.text()}`);
    console.error('Nem o auditor nem a RPC anônima responderam — abortando.');
    process.exit(1);
  }
  achados = await resp.json();
}

if (!Array.isArray(achados)) {
  console.error('A verificação não devolveu uma lista de achados — abortando em vez de assumir vazio.');
  process.exit(1);
}

// `qtd` NÃO tem unidade única: em codlinha_orfa é count(distinct codlinha), nas outras é
// count(*) de linhas. Rotulado na saída para ninguém somar peras com maçãs.
const unidade = v => (v === 'codlinha_orfa' ? 'codlinha(s) distinta(s)' : 'linha(s)');
// Separador NUL: o `detalhe` contém espaços, então espaço não serve de delimitador.
// Escrito como escape para não deixar byte invisível no fonte — com NUL cru o grep passa a
// tratar o arquivo como binário, o diff fica ilegível e um editor distraído come o byte.
const SEP = '\u0000';
const chave = a => `${a.verificacao}${SEP}${a.detalhe}`;

// --- Reclassificação de severidade por NATUREZA da tabela ---------------------------------
//
// Mora aqui, e não na função do banco, de propósito: a RPC MEDE um fato ("este filho aponta
// para codlinha que não existe no pai"); se aquele fato é DEFEITO é POLÍTICA de cadastro. Fato
// no banco, política no repo — versionada, diffável e revisável em PR, em vez de invisível
// dentro de um CREATE OR REPLACE FUNCTION que o git nunca vê.
//
// evento_teste é a única rebaixada, e o motivo é o que o banco mostra (medido em 27/07/2026):
//   1. É tabela de HISTÓRICO. As órfãs de lá são atos reais de 1974–1996, da época do DTC/RJ,
//      anteriores ao próprio DETRO (ex.: CAMPOS–CONCEIÇÃO DE MACABÚ e RIO–MACAÉ, da RÁPIDO
//      MACAENSE). O cadastro atual não pretende ter linha-pai para ato de 1974.
//   2. Linha extinta NÃO some do cadastro: o hub tem a coluna `cancelado`, e 500 linhas estão
//      lá marcadas assim. Ou seja, órfã em evento não é rastro de exclusão do pai — é história
//      mais velha que o cadastro.
//   3. A "correção" óbvia (apagar o filho órfão) destruiria arquivo institucional
//      insubstituível. Gate que só pode ser fechado destruindo dado é gate mal calibrado.
//
// As demais continuam ERRO: itinerario_teste/qh_teste/qh_predeterminado_teste são o estado
// OPERACIONAL. Itinerário e quadro de horários de linha que a busca não acha é defeito de
// verdade — e é o modo de falha da issue #63 (tela vazia, sem erro).
//
// Isto REBAIXA, nunca silencia: as rebaixadas continuam impressas como aviso a cada rodada.
// Cuidado ao ampliar esta lista: rebaixar uma tabela inteira também rebaixa achado NOVO nela.
// `186006400` (evento de 2021 com sufixo anômalo — o hub tem 186006000/186006001) é um
// suspeito de digitação que passa a sair como aviso; está registrado no baseline e na issue.
const REBAIXADOS_A_AVISO = new Set([
  `codlinha_orfa${SEP}evento_teste sem match em tabela_vista_teste`,
]);
const severidadeDe = a => (REBAIXADOS_A_AVISO.has(chave(a)) ? 'aviso' : a.severidade);
const foiRebaixado = a => REBAIXADOS_A_AVISO.has(chave(a)) && a.severidade === 'erro';

if (atualizar) {
  // `orfaos_conhecidos` é escrito À MÃO (a RPC agrega e não devolve QUAIS codlinhas). Sem este
  // resgate, o primeiro --atualizar-baseline montaria um objeto novo e apagaria em silêncio o
  // levantamento inteiro — que custou uma sessão para reconstruir.
  let herdado = null;
  try {
    herdado = JSON.parse(await readFile(BASELINE, 'utf8')).orfaos_conhecidos ?? null;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Aviso: não consegui reler o baseline atual (${e.message}); orfaos_conhecidos não será preservado.`);
  }
  const registro = {
    gerado_em: new Date().toISOString().slice(0, 10),
    nota: 'Dívida de integridade conhecida. Cada entrada é dado para consertar; ao consertar, rode --atualizar-baseline. Só entra aqui o que pode DERRUBAR o gate — erro DEPOIS da reclassificação por natureza feita no check_data_quality.mjs (evento_teste órfã é aviso, não erro; o porquê está no comentário REBAIXADOS_A_AVISO do script).',
    // A função agrega. Para agir é preciso saber QUAIS codlinhas — esta query devolve as
    // órfãs uma por uma, e fica aqui para não se perder a cada regeneração do baseline.
    como_listar_os_orfaos:
      "select 'itinerario_teste' as tabela, codlinha, count(*) as linhas from itinerario_teste i " +
      'where codlinha is not null and not exists (select 1 from tabela_vista_teste t where t.codlinha = i.codlinha) ' +
      'group by 1,2 -- repita o padrão para qh_teste, qh_predeterminado_teste, evento_teste',
    // Reinserido AQUI, e não no fim, para a regeneração não reordenar o arquivo e produzir um
    // diff gigante que esconde a única linha que de fato mudou.
    ...(herdado ? { orfaos_conhecidos: herdado } : {}),
    // Só entra no baseline o que pode DERRUBAR o gate, isto é, erro DEPOIS da reclassificação
    // por natureza. Sem este filtro, o primeiro `--atualizar-baseline` reintroduziria as
    // rebaixadas (a RPC continua devolvendo `erro` para elas) e o arquivo passaria a carregar
    // entradas que nunca são consultadas — dívida de mentira, ruído no diff.
    achados: achados
      .filter(a => severidadeDe(a) === 'erro')
      .map(a => ({ verificacao: a.verificacao, severidade: severidadeDe(a), qtd: Number(a.qtd), detalhe: a.detalhe })),
  };
  await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n', 'utf8');
  console.log(`✓ Baseline reescrito com ${registro.achados.length} achado(s) → scripts/data_quality_baseline.json`);
  if (herdado) console.log('  · `orfaos_conhecidos` preservado do arquivo anterior — é MANTIDO À MÃO. Se você acabou de corrigir dado, atualize a lista também; a contagem sozinha não denuncia órfã trocada por outra.');
  process.exit(0);
}

let base = new Map();
if (!semBaseline) {
  try {
    const b = JSON.parse(await readFile(BASELINE, 'utf8'));
    base = new Map((b.achados || []).map(a => [chave(a), Number(a.qtd)]));
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`Baseline ilegível (${BASELINE}): ${e.message}`); process.exit(1); }
  }
}

const novos = [], piorados = [], conhecidos = [], avisos = [];
for (const a of achados) {
  const qtd = Number(a.qtd);
  if (severidadeDe(a) !== 'erro') { avisos.push({ ...a, qtd, rebaixado: foiRebaixado(a) }); continue; }
  if (!base.has(chave(a))) { novos.push({ ...a, qtd }); continue; }
  const antes = base.get(chave(a));
  if (qtd > antes) piorados.push({ ...a, qtd, antes });
  else conhecidos.push({ ...a, qtd, antes });
}
const resolvidos = [...base.keys()].filter(k => !achados.some(a => chave(a) === k));

const linha = a => `    ${a.detalhe} — ${a.qtd} ${unidade(a.verificacao)}${a.antes !== undefined ? ` (baseline: ${a.antes})` : ''}`;

if (avisos.length) {
  console.log(`\n⚠ Avisos (${avisos.length}) — não derrubam o gate:`);
  for (const a of avisos) {
    // O sufixo é o que impede o rebaixamento de virar silêncio: quem lê a saída vê que a
    // severidade foi decidida AQUI, não pelo banco, e sabe onde ir discutir.
    const nota = a.rebaixado ? ' [rebaixado por natureza — ver REBAIXADOS_A_AVISO]' : '';
    console.log(`    [${a.verificacao}] ${a.detalhe} — ${a.qtd} ${unidade(a.verificacao)}${nota}`);
  }
}
if (conhecidos.length) {
  console.log(`\n· Dívida conhecida, dentro do baseline (${conhecidos.length}):`);
  for (const a of conhecidos) console.log(linha(a));
}
if (resolvidos.length) {
  console.log(`\n✓ Resolvido desde o baseline (${resolvidos.length}) — rode --atualizar-baseline para apertar o gate:`);
  for (const k of resolvidos) console.log(`    ${k.split(SEP)[1]}`);
}

if (!novos.length && !piorados.length) {
  const total = conhecidos.reduce((s, a) => s + a.qtd, 0);
  console.log(`\n✓ Qualidade dos dados: nenhum achado de erro${base.size ? ' novo' : ''}.${total ? ` (${total} item(ns) de dívida conhecida — ver acima.)` : ''}`);
  process.exit(0);
}

console.error(semBaseline
  ? '\n✗ ESTADO CRU DO BANCO (baseline ignorado) — achados de erro:'
  : '\n✗ QUALIDADE DOS DADOS PIOROU desde o baseline:');
if (novos.length) {
  console.error(`  ${semBaseline ? `Achado(s) (${novos.length})` : `Achado(s) NOVO(s) (${novos.length})`}:`);
  for (const a of novos) console.error(`    [${a.verificacao}] ${a.detalhe} — ${a.qtd} ${unidade(a.verificacao)}`);
}
if (piorados.length) {
  console.error(`  Achado(s) que PIORARAM (${piorados.length}):`);
  for (const a of piorados) console.error(`    [${a.verificacao}] ${a.detalhe} — era ${a.antes}, agora ${a.qtd} ${unidade(a.verificacao)}`);
}
console.error('\nCausa provável: import do ETL escreveu codlinha/cod_origem que não existe no pai,');
console.error('ou uma linha foi apagada da tabela_vista_teste deixando os filhos órfãos.');
console.error('Para ver o estado cru do banco: node scripts/check_data_quality.mjs --sem-baseline');
process.exit(1);
