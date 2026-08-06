// check_grants.mjs — Checagem VIVA da postura de segurança do banco (achado SEC-04).
//
// Por que existe: até 27/07/2026 NADA verificava automaticamente RLS, grants, policies e
// privilégios de função. A conferência era um checklist TRIMESTRAL manual em docs/seguranca.md —
// ou seja, uma alteração perigosa feita no painel do Supabase (o dono trabalha lá com service
// role, que ignora RLS) podia ficar viva por meses sem ninguém notar. Este é o alarme.
//
// É o gate que sustenta as correções SEC-01 e SEC-05: sem ele, os default privileges que acabaram
// de ser fechados podem ser reabertos por um clique e nada avisa.
//
// Irmão do check_data_quality.mjs, check_realtime.mjs e check_deriva.mjs: mesma forma (função
// read-only no banco + runner fino aqui) e mesma resolução de alvo. Desde 04/08/2026 (issue #74)
// a chave NÃO vem mais de um regex sobre o app.js: o banco com quem se fala vem de DIVAT_ALVO
// ('teste' em PR/push, 'producao' no cron) resolvido contra scripts/ambientes.json por
// scripts/lib/ambiente.mjs. Sem a variável o script morre no topo, antes de tocar a rede.
// A RPC é SECURITY INVOKER com EXECUTE para anon, então o que este script enxerga é exatamente
// o que um visitante anônimo enxergaria.
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_grants.mjs                     # respeita o baseline
//   node scripts/check_grants.mjs --sem-baseline      # estado cru do banco
//   node scripts/check_grants.mjs --atualizar-baseline  # SÓ LOCAL, nunca no CI
//
// Requer apenas Node 18+ (fetch nativo). Nenhuma dependência. Sai 1 se houver achado de
// severidade `erro` fora do baseline.
//
// SOBRE O BASELINE: mesmo espírito do data_quality_baseline.json — dívida REGISTRADA, não perdão.
// Hoje ele carrega os defaults do role `supabase_admin`, que concedem escrita a anon/authenticated
// em tabelas de public e NÃO são fecháveis (postgres não é superusuário no Supabase; o comando
// responde 42501). Está no baseline porque é limitação de plataforma aceita e documentada em
// docs/seguranca.md §9.1 — não porque foi perdoado. Por causa dela este gate roda DIARIAMENTE.
//
// ATENÇÃO ao mexer: `--atualizar-baseline` é para registrar uma exceção que você DECIDIU aceitar,
// depois de entender. Rodar por reflexo quando o gate fica vermelho transforma o alarme em
// carimbo. Se o gate acusar grant de escrita novo, a resposta certa é revogar, não baselinar.
//
// MODO DUPLO (desde 04/08/2026): a Fase 3 move divat_security_shape para o schema `audit`, fora
// do alcance de anon. Enquanto produção não recebe essa migração, este gate precisa funcionar nos
// DOIS mundos — senão nasceria vermelho na main e viraria alarme que se ignora.
//   1. tenta rpc/divat_security_digest (o mundo pos-Fase 3): resumo, nao matriz;
//   2. se a funcao nao existe (404/PGRST202), usa rpc/divat_security_shape e AVISA;
//   3. qualquer outro erro ABORTA — perder a visao do banco nunca vira "nenhum achado";
//   4. o fallback tem validade em scripts/prazos.json (id `check_grants_fallback`). Passada a
//      data, usa-lo e vermelho: caminho temporario sem prazo vira permanente por inercia.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prazoPorId, classificar, hojeISO } from './lib/prazos.mjs';
import { carregarAmbiente } from './lib/ambiente.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'security_baseline.json');

const args = new Set(process.argv.slice(2));
const semBaseline = args.has('--sem-baseline') || args.has('--all');
const atualizar = args.has('--atualizar-baseline');

let SB_URL, SB_KEY, ALVO;
try {
  ({ url: SB_URL, key: SB_KEY, alvo: ALVO } = await carregarAmbiente(ROOT));
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
console.log(`· Alvo: ${ALVO}`);

async function chamarRpc(nome) {
  return fetch(`${SB_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

let digest = null, forma = null;
try {
  const resp = await chamarRpc('divat_security_digest');
  if (resp.ok) {
    digest = await resp.json();
  } else if (resp.status === 404) {
    // A funcao ainda nao existe neste banco: mundo pre-Fase 3. Cai no caminho antigo.
    // Catch PROPRIO para a leitura do prazo: ela nao e rede. Sem ele, um prazos.json ilegivel
    // (ou o id removido por engano) caia no catch de baixo e saia como "Erro ao consultar o
    // Supabase (este script precisa de rede)" — mensagem que manda investigar o lugar errado,
    // justamente quando o conserto e de uma linha num JSON versionado.
    let v;
    try {
      v = classificar(await prazoPorId(ROOT, 'check_grants_fallback'), hojeISO());
    } catch (ePrazo) {
      console.error(`✗ Não consegui ler o prazo 'check_grants_fallback': ${ePrazo.message}`);
      console.error('  O fallback só vale enquanto tem validade conferível — abortando.');
      process.exit(1);
    }
    if (v.nivel === 'erro') {
      console.error(`✗ O fallback para divat_security_shape EXPIROU: ${v.mensagem}`);
      console.error('  Se a Fase 3 já está em produção, remova o fallback (é o trabalho que venceu).');
      console.error('  Se ainda não está, aplique a migração ou mova a data em scripts/prazos.json — conscientemente.');
      process.exit(1);
    }
    console.log(`⚠ divat_security_digest não existe neste banco; usando o caminho antigo (${v.mensagem}).`);
    const antigo = await chamarRpc('divat_security_shape');
    if (!antigo.ok) {
      console.error(`RPC divat_security_shape falhou (HTTP ${antigo.status}): ${await antigo.text()}`);
      console.error('Nem o digest nem a forma completa responderam — abortando.');
      process.exit(1);
    }
    forma = await antigo.json();
  } else {
    console.error(`RPC divat_security_digest falhou (HTTP ${resp.status}): ${await resp.text()}`);
    console.error('Só 404 significa "função ainda não existe". Qualquer outro erro aborta.');
    process.exit(1);
  }
} catch (e) {
  console.error('Erro ao consultar o Supabase (este script precisa de rede):', e.message);
  process.exit(1);
}

if (digest) {
  // FAIL-CLOSED sobre a FORMA: um campo com tipo errado e visao perdida, nao "tudo certo".
  // `null` entra aqui de proposito — bool_and/bool_or sobre conjunto vazio devolvem NULL, e
  // `if (d.anon_escreve)` sobre null seria false: meio-alarme silencioso.
  const bools = ['todas_com_rls', 'anon_escreve', 'anon_maintain', 'anon_le_view', 'authenticated_tem_privilegio'];
  for (const campo of bools) {
    if (typeof digest[campo] !== 'boolean') {
      console.error(`✗ Digest sem o booleano '${campo}' (veio ${JSON.stringify(digest[campo])}) — abortando em vez de assumir seguro.`);
      process.exit(1);
    }
  }
  const contagens = ['anon_rpcs', 'defaults_permissivos', 'funcoes_sem_search_path', 'funcoes_definer_anon'];
  for (const campo of contagens) {
    if (!Number.isInteger(digest[campo])) {
      console.error(`✗ Digest sem a contagem '${campo}' como inteiro — abortando.`);
      process.exit(1);
    }
  }
  if (typeof digest.digest !== 'string' || digest.digest.length !== 64) {
    console.error('✗ Digest não é um sha256 hex de 64 caracteres — abortando.');
    process.exit(1);
  }
  if (!Number.isInteger(digest.tabelas_publicas) || digest.tabelas_publicas < 18) {
    console.error(`✗ Digest reporta ${digest.tabelas_publicas} tabelas públicas (esperado ≥ 18) — visão perdida, abortando.`);
    process.exit(1);
  }
  // (`anon_rpcs` já foi conferido como inteiro no laço de `contagens` acima — a segunda
  // conferência que existia aqui era código morto: nunca chegou a ser alcançada com valor
  // diferente do que aquele laço já tinha aprovado.)

  // EXPECTATIVAS FIXAS. Ficam no CODIGO, nunca no baseline: um gate cujo conserto habitual e
  // `--atualizar-baseline` ensina o reflexo de apagar o alarme. O reflexo continua possivel para
  // mudanca estrutural benigna (o digest) e NUNCA alcanca a classe perigosa (estes SEIS).
  const graves = [];
  if (digest.anon_escreve) graves.push('anon tem INSERT/UPDATE/DELETE/TRUNCATE em alguma tabela de public');
  if (digest.anon_maintain) graves.push('anon tem MAINTAIN em alguma tabela de public');
  if (digest.anon_le_view) graves.push('anon lê alguma VIEW/matview de public — rota clássica de bypass de RLS');
  if (!digest.todas_com_rls) graves.push('alguma tabela de public está sem RLS');
  if (digest.authenticated_tem_privilegio) graves.push('authenticated voltou a ter privilégio de tabela em public');
  if (digest.funcoes_definer_anon > 0) graves.push(`${digest.funcoes_definer_anon} função(ões) SECURITY DEFINER executável(is) por anon`);

  const b = JSON.parse(await readFile(BASELINE, 'utf8').catch(() => '{}'));

  if (atualizar) {
    if (graves.length) {
      console.error('✗ Há achado GRAVE — não existe caminho para baseliná-lo:');
      for (const g of graves) console.error(`    ${g}`);
      console.error('\n  A resposta certa é REVOGAR o privilégio, não registrar a exceção.');
      process.exit(1);
    }
    // Atualiza o digest e AS TRÊS contagens que a execução normal exige (`CONTAGENS`, abaixo:
    // anon_rpcs, defaults_permissivos, funcoes_sem_search_path) — gravar só duas fecharia um
    // laço: a 3ª ficaria ausente, a execução normal seguinte abortaria pedindo para rodar
    // --atualizar-baseline, e --atualizar-baseline já teria rodado e não teria corrigido nada.
    // `achados` (as excecoes do supabase_admin, documentadas em docs/seguranca.md §9.1) e
    // mantido a mao — mesma disciplina do orfaos_conhecidos do data_quality_baseline.json.
    const registro = { ...b, digest: digest.digest, anon_rpcs: digest.anon_rpcs,
                       defaults_permissivos: digest.defaults_permissivos,
                       funcoes_sem_search_path: digest.funcoes_sem_search_path,
                       gerado_em: new Date().toISOString().slice(0, 10) };
    await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n', 'utf8');
    console.log(`✓ Baseline: digest ${digest.digest.slice(0, 12)}…, anon_rpcs=${digest.anon_rpcs}, `
      + `defaults_permissivos=${digest.defaults_permissivos}, `
      + `funcoes_sem_search_path=${digest.funcoes_sem_search_path} registrados.`);
    console.log('  · `achados` foi PRESERVADO. Confira o diff antes de commitar.');
    process.exit(0);
  }

  if (graves.length) {
    console.error('\n✗ POSTURA DE SEGURANÇA REGREDIU — achado GRAVE:');
    for (const g of graves) console.error(`    ${g}`);
    console.error('\nREVOGUE o privilégio. Não existe --atualizar-baseline para isto.');
    process.exit(1);
  }

  // --sem-baseline SIGNIFICA não consultar baseline nenhum — os indicadores graves já foram
  // conferidos acima (incondicionalmente, sempre). Sem baseline não há valor "correto" de
  // contagem ou de digest para comparar (ao contrário do caminho antigo, que tem uma LISTA de
  // exceções conhecidas para expor); a resposta honesta é relatar o estado cru e dizer
  // explicitamente que nada foi comparado — nunca afirmar "bate com o baseline" sobre um
  // baseline que este branch nunca leu.
  if (semBaseline) {
    console.log(`\n✓ Estado CRU do banco (baseline ignorado) — nenhum achado grave. `
      + `(${digest.tabelas_publicas} tabelas públicas, ${digest.anon_rpcs} RPCs anônimas, `
      + `${digest.defaults_permissivos} default(s) permissivo(s) em public, `
      + `${digest.funcoes_sem_search_path} função(ões) sem search_path fixo, RLS em todas.)`);
    console.log('  · Contagens e digest NÃO foram comparados a nenhum baseline — é o propósito de --sem-baseline.');
    process.exit(0);
  }

  if (!b.digest) {
    console.error('✗ Baseline sem `digest`. Confira o estado do banco e rode --atualizar-baseline.');
    process.exit(1);
  }
  // As TRÊS contagens baselinadas. Subir é privilégio novo — o sinal do SEC-01. Descer é dívida
  // resolvida: também derruba o gate, mas com a instrução oposta (aperte o baseline), no mesmo
  // espírito do `resolvidos` que o caminho antigo já imprime.
  const CONTAGENS = {
    anon_rpcs: 'RPC anônima em public',
    defaults_permissivos: 'default privilege concedendo a PUBLIC/anon/authenticated',
    funcoes_sem_search_path: 'função sem search_path fixo',
  };
  for (const [campo, oquê] of Object.entries(CONTAGENS)) {
    const antes = b[campo];
    if (!Number.isInteger(antes)) {
      console.error(`✗ Baseline sem a contagem '${campo}'. Confira o banco e rode --atualizar-baseline.`);
      process.exit(1);
    }
    if (digest[campo] > antes) {
      console.error(`\n✗ Apareceu ${oquê}: ${antes} → ${digest[campo]}.`);
      console.error('  Objeto novo em public nasce com privilégio para anon pelo default do supabase_admin');
      console.error('  (docs/seguranca.md §9.1) — é exatamente o caso que este gate roda diariamente para pegar.');
      console.error('  REVOGUE, ou registre a exceção se for deliberada.');
      process.exit(1);
    }
    if (digest[campo] < antes) {
      console.error(`\n✗ ${oquê}: ${antes} → ${digest[campo]} — dívida RESOLVIDA.`);
      console.error('  Rode --atualizar-baseline para o gate voltar a apertar nesse número.');
      process.exit(1);
    }
  }
  if (digest.digest !== b.digest) {
    console.error('\n✗ A superfície de segurança MUDOU (digest diferente do baseline).');
    console.error('  Os seis indicadores graves estão sãos, então isto é mudança estrutural —');
    console.error('  tabela nova, policy renomeada, função nova. Confira o que mudou pelo painel');
    console.error('  ou pelo auditor (node scripts/check_phase3_audit.mjs) e, se for esperado,');
    console.error('  registre com --atualizar-baseline.');
    process.exit(1);
  }

  console.log(`✓ Postura de segurança: digest bate com o baseline. `
    + `(${digest.tabelas_publicas} tabelas públicas, ${digest.anon_rpcs} RPCs anônimas, RLS em todas.)`);
  process.exit(0);
}

// Se a RPC devolver forma inesperada, PARE. Tratar `undefined` como lista vazia faria o gate
// passar com zero achados exatamente quando perdeu a visão do banco — fail-open silencioso, que é
// o modo de falha que este script existe para não ter.
for (const campo of ['tabelas', 'funcoes', 'default_privileges']) {
  if (!Array.isArray(forma?.[campo])) {
    console.error(`Resposta da RPC sem o campo '${campo}' como lista — abortando em vez de assumir vazio.`);
    process.exit(1);
  }
}
if (!forma.tabelas.length) {
  console.error('A RPC não devolveu nenhuma tabela. Isso não é "tudo certo", é visão perdida — abortando.');
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Regras. Cada uma vira um achado {tipo, alvo, detalhe, severidade}.
// A chave (tipo + alvo) é o que o baseline indexa.
// ---------------------------------------------------------------------------------------------
const ESCRITA = ['insert', 'update', 'delete', 'truncate'];
const achados = [];
const add = (tipo, alvo, detalhe, severidade = 'erro') => achados.push({ tipo, alvo, detalhe, severidade });

for (const t of forma.tabelas) {
  if (!t.rls) add('rls_off', t.nome, `RLS desligada em ${t.nome}`);

  for (const papel of ['anon', 'authenticated']) {
    const p = t[papel] || {};
    const escrita = ESCRITA.filter(k => p[k]);
    if (escrita.length) {
      add('grant_escrita', `${t.nome}:${papel}`, `${papel} tem ${escrita.join('/').toUpperCase()} em ${t.nome}`);
    }
    // MAINTAIN (VACUUM/ANALYZE/CLUSTER/REINDEX/LOCK) não é escrita DML e não passa pelo PostgREST,
    // mas também não é leitura — foi o que sobrou escondido no ACL `anon=rm` até 27/07/2026.
    if (p.maintain) add('grant_maintain', `${t.nome}:${papel}`, `${papel} tem MAINTAIN em ${t.nome}`);
  }

  for (const pol of t.policies || []) {
    // polcmd: r=SELECT, a=INSERT, w=UPDATE, d=DELETE, *=ALL. O portal é só-leitura: só `r` passa.
    if (pol.cmd !== 'r') {
      add('policy_escrita', `${t.nome}:${pol.nome}`, `policy ${pol.nome} em ${t.nome} é '${pol.cmd}', não SELECT`);
    }
  }
}

for (const f of forma.funcoes) {
  if (f.public_execute) add('funcao_public_execute', f.assinatura, `${f.assinatura} é executável por PUBLIC`);
  if (f.security_definer) add('funcao_security_definer', f.assinatura, `${f.assinatura} é SECURITY DEFINER`);
  // search_path fixo é o que impede sequestro de resolução de nome. Numa função INVOKER importa
  // pouco; numa DEFINER é a diferença entre função e escalada de privilégio. Cobrado sempre,
  // porque a função de hoje é INVOKER e a de amanhã pode não ser.
  if (!f.search_path_fixo) add('funcao_sem_search_path', f.assinatura, `${f.assinatura} não fixa search_path`);
}

for (const d of forma.default_privileges) {
  const alvo = `${d.dono}:${d.schema}:${d.tipo}`;
  const partes = [];
  if (d.public_privs?.length) partes.push(`PUBLIC=${d.public_privs.join(',')}`);
  if (d.anon_privs?.length) partes.push(`anon=${d.anon_privs.join(',')}`);
  if (d.authenticated_privs?.length) partes.push(`authenticated=${d.authenticated_privs.join(',')}`);
  if (partes.length) {
    add('default_privilege_permissivo', alvo,
      `objeto novo (${d.tipo}) criado por ${d.dono} em ${d.schema} já nasce com ${partes.join(' ')}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Separador NUL: `alvo` pode conter ':' mas nunca NUL. Escrito como escape para nao deixar byte
// invisivel no fonte — com NUL cru o grep trata o arquivo como binario e um editor distraido come
// o byte. Mesma decisao, e mesma justificativa, de scripts/check_data_quality.mjs.
const SEP = '\u0000';
const chave = a => `${a.tipo}${SEP}${a.alvo}`;

if (atualizar) {
  const registro = {
    gerado_em: new Date().toISOString().slice(0, 10),
    nota: 'Exceções de segurança CONHECIDAS e aceitas. Cada entrada precisa de justificativa em docs/seguranca.md §9. Isto não é perdão: se um achado NOVO aparecer, revogue — não baseline.',
    achados: achados
      .filter(a => a.severidade === 'erro')
      .map(a => ({ tipo: a.tipo, alvo: a.alvo, detalhe: a.detalhe }))
      .sort((x, y) => chave(x).localeCompare(chave(y))),
  };
  await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n', 'utf8');
  console.log(`✓ Baseline reescrito com ${registro.achados.length} exceção(ões) → scripts/security_baseline.json`);
  console.log('  · Confira o diff antes de commitar. Toda entrada nova precisa de justificativa em docs/seguranca.md §9.');
  process.exit(0);
}

let base = new Set();
if (!semBaseline) {
  try {
    const b = JSON.parse(await readFile(BASELINE, 'utf8'));
    base = new Set((b.achados || []).map(chave));
  } catch (e) {
    if (e.code !== 'ENOENT') { console.error(`Baseline ilegível (${BASELINE}): ${e.message}`); process.exit(1); }
  }
}

const erros = achados.filter(a => a.severidade === 'erro');
const novos = erros.filter(a => !base.has(chave(a)));
const conhecidos = erros.filter(a => base.has(chave(a)));
const resolvidos = [...base].filter(k => !erros.some(a => chave(a) === k));

if (conhecidos.length) {
  console.log(`\n· Exceção conhecida, dentro do baseline (${conhecidos.length}) — ver docs/seguranca.md §9:`);
  for (const a of conhecidos) console.log(`    [${a.tipo}] ${a.detalhe}`);
}
if (resolvidos.length) {
  console.log(`\n✓ Resolvido desde o baseline (${resolvidos.length}) — rode --atualizar-baseline para apertar o gate:`);
  for (const k of resolvidos) console.log(`    ${k.split(SEP).join(' → ')}`);
}

if (!novos.length) {
  console.log(`\n✓ Postura de segurança: nenhum achado${base.size ? ' novo' : ''}. ` +
    `(${forma.tabelas.length} tabelas, ${forma.funcoes.length} funções conferidas.)`);
  process.exit(0);
}

console.error(semBaseline
  ? '\n✗ ESTADO CRU DO BANCO (baseline ignorado):'
  : '\n✗ POSTURA DE SEGURANÇA REGREDIU — achado(s) fora do baseline:');
for (const a of novos) console.error(`    [${a.tipo}] ${a.detalhe}`);
console.error('\nO que fazer: REVOGUE o privilégio. Só use --atualizar-baseline se a exceção for');
console.error('deliberada e você a documentar em docs/seguranca.md §9.');
console.error('Para ver o estado cru do banco: node scripts/check_grants.mjs --sem-baseline');
process.exit(1);
