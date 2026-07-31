// check_ambientes.mjs — Checagem VIVA de divergência TESTE × PRODUÇÃO.
//
// A dívida que este script paga estava registrada em QUATRO documentos e em nenhum código:
//   docs/adr/0002-ambiente-de-teste-isolado.md — "Os projetos de teste e produção mantêm duas
//     cópias do schema manualmente. Não existe hoje um gate que detecte divergência entre elas."
//   docs/plano-ambiente-teste-2026-07-28.md — "Elas vão divergir; é questão de quando. […] nada
//     vigia teste×produção. É o ponto fraco real do plano."
//   docs/plano-verificacao-ambiente-2026-07-29.md — "o primeiro sintoma será uma view vazia no
//     preview, sem erro."
//   docs/plano-codex-ambiente-teste-2026-07-29.md — "um card que funciona em produção pode falhar
//     no preview por falta de RPC, e o sintoma será tela vazia sem erro."
// Escrito em 31/07/2026, depois de a auditoria cruzada apontar o achado 3 (banco de teste à frente
// da main). Registrar a mesma dívida quatro vezes não a paga.
//
// ---------------------------------------------------------------------------------------------
// O INVARIANTE (leia antes de mexer): este gate NÃO exige que os dois bancos sejam iguais.
//
// Eles divergem DE PROPÓSITO — a Fase 3 (supabase/migrations/) está aplicada só no teste, que por
// isso é MAIS restrito. Um gate de igualdade ficaria vermelho para sempre, e gate vermelho desde
// o primeiro dia é gate que se aprende a ignorar (mesma lição do baseline do check_data_quality).
//
// O que ele exige é: **tudo que o PORTAL precisa em produção também funciona no teste.**
// É uma relação de cobertura, não de igualdade. Divergência na direção "teste tem a mais" é
// aviso; na direção "teste tem a menos do que o app.js usa" é ERRO — porque essa é a que produz
// o modo de falha que os quatro documentos descrevem: preview com tela vazia e SEM erro, que
// ninguém depura porque não parece defeito.
// ---------------------------------------------------------------------------------------------
//
// ESCOPO: é o ÚNICO script do repo que fala com os DOIS projetos. Os outros quatro gates vivos
// (check_deriva, check_realtime, check_data_quality, check_grants) só enxergam produção.
//
// Usa as duas anon keys que já estão públicas no app.js — nenhum segredo, nada a configurar.
// Como anon, ele vê exatamente o que o navegador de um visitante veria em cada ambiente, que é
// precisamente a pergunta que interessa.
//
// Uso (na SUA máquina / CI — daqui o ambiente do Claude não alcança o Supabase):
//   node scripts/check_ambientes.mjs
//   node scripts/check_ambientes.mjs --sem-baseline      # estado cru, sem perdoar o conhecido
//   node scripts/check_ambientes.mjs --atualizar-baseline # ao aceitar uma divergência nova
//
// Requer apenas Node 18+ (fetch nativo). Nenhuma dependência.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cabecalhosSB } from './lib/sb.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'ambientes_baseline.json');
const SEM_BASELINE = process.argv.includes('--sem-baseline');
const ATUALIZAR = process.argv.includes('--atualizar-baseline');

function extrair(src, re, oquê) {
  const m = re.exec(src);
  if (!m) { console.error(`Não achei ${oquê} no app.js.`); process.exit(1); }
  return m[1];
}

const appjs = await readFile(join(ROOT, 'app.js'), 'utf8');

// As quatro constantes são lidas por regex do app.js, como fazem os outros gates. A ADR-0002
// declara as declarações literais `const SB_URL`/`const SB_KEY` intocáveis por causa disso;
// as duas de teste entram na mesma regra a partir daqui.
const AMBIENTES = [
  { nome: 'produção', url: extrair(appjs, /const SB_URL\s*=\s*'([^']+)'/, 'SB_URL'),
                      key: extrair(appjs, /const SB_KEY\s*=\s*'([^']+)'/, 'SB_KEY') },
  { nome: 'teste',    url: extrair(appjs, /const SB_TESTE_URL\s*=\s*'([^']+)'/, 'SB_TESTE_URL'),
                      key: extrair(appjs, /const SB_TESTE_KEY\s*=\s*'([^']+)'/, 'SB_TESTE_KEY') },
];

// O que o PORTAL precisa, extraído do próprio app.js — não de uma lista à mão, que driftaria.
const TABELAS = [...extrair(appjs, /RT_TABLES\s*=\s*\[([\s\S]*?)\]/, 'RT_TABLES')
  .matchAll(/'([a-z_]+)'/g)].map(m => m[1]);

// RPCs chamadas pelo front. O portal as chama por GET com query params (o PostgREST permite para
// função STABLE), e a sonda faz igual — sondar por POST testaria um caminho que o portal não usa.
// Os argumentos são valores sem sentido de propósito: interessa se a função RESPONDE, não o que
// devolve. `select=` e `limit=1` mantêm a resposta minúscula.
const SONDA_RPC = {
  divat_busca_logradouro: 'termo=zzzz&select=codlinha&limit=1',
  divat_linhas_regiao: 'p_regiao=zzzz&p_modo=zzzz&select=codlinha&limit=1',
};
const RPCS = [...new Set([...appjs.matchAll(/['"`]rpc\/(\w+)/g)].map(m => m[1]))];

const rpcSemSonda = RPCS.filter(r => !SONDA_RPC[r]);
if (rpcSemSonda.length) {
  console.error(`RPC sem sonda declarada: ${rpcSemSonda.join(', ')}`);
  console.error('Acrescente a query de sonda em SONDA_RPC neste script — sem ela a RPC nova ficaria');
  console.error('fora da comparação e o gate passaria verde sem tê-la olhado.');
  process.exit(1);
}

console.log(`Comparando ${AMBIENTES[1].nome} × ${AMBIENTES[0].nome}`);
console.log(`O portal usa: ${TABELAS.length} tabelas, ${RPCS.length} RPCs.\n`);

// ---------- coleta ----------

async function pedir(amb, caminho) {
  const url = `${amb.url}/rest/v1/${caminho}`;
  try {
    const r = await fetch(url, {
      headers: cabecalhosSB(amb.key, { Prefer: 'count=exact' }),
    });
    const corpo = r.ok ? await r.json() : await r.text();
    const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || '');
    return { ok: r.ok, status: r.status, corpo, total: m ? Number(m[1]) : null };
  } catch (e) {
    return { erroRede: e.message };
  }
}

async function inventariar(amb) {
  const inv = { tabelas: {}, rpcs: {} };
  for (const t of TABELAS) {
    const r = await pedir(amb, `${t}?select=*&limit=1`);
    if (r.erroRede) {
      console.error(`Erro de rede falando com ${amb.nome} (${amb.url}): ${r.erroRede}`);
      console.error('Este script precisa de rede. O ambiente do Claude não alcança *.supabase.co —');
      console.error('rode na sua máquina ou no CI (workflow db-checks.yml).');
      process.exit(1);
    }
    inv.tabelas[t] = {
      legivel: r.ok,
      status: r.status,
      // Colunas só são observáveis por anon se houver ao menos uma linha: o PostgREST devolve
      // objetos, não metadados. Tabela vazia entra como colunas=null e a comparação de coluna
      // é PULADA para ela — dizer "sem colunas" seria inventar um achado.
      colunas: r.ok && Array.isArray(r.corpo) && r.corpo.length ? Object.keys(r.corpo[0]).sort() : null,
      linhas: r.total,
    };
  }
  for (const nome of RPCS) {
    const r = await pedir(amb, `rpc/${nome}?${SONDA_RPC[nome]}`);
    if (r.erroRede) { console.error(`Erro de rede: ${r.erroRede}`); process.exit(1); }
    inv.rpcs[nome] = { executavel: r.ok, status: r.status };
  }
  return inv;
}

// Antes de comparar, conferir que o INSTRUMENTO funciona. Um ambiente em que NENHUMA tabela
// responde não está divergente — está inalcançável, e tratar as duas coisas como a mesma faz o
// gate cuspir 16 "divergências" quando o que houve foi rede bloqueada ou chave errada. Foi
// exatamente o que ele fez na primeira execução real, do ambiente do Claude: o proxy devolve
// HTTP 403, que não é exceção de rede e portanto não caía no catch do `pedir`.
// Gate que confunde "não medi" com "medi e está ruim" é gate que se aprende a ignorar.
function conferirAlcance(amb, inv) {
  const legiveis = Object.values(inv.tabelas).filter(t => t.legivel).length;
  if (legiveis > 0) return;
  const status = [...new Set(Object.values(inv.tabelas).map(t => t.status))].join(', ');
  console.error(`\n✗ NÃO CONSEGUI FALAR COM ${amb.nome.toUpperCase()} (${amb.url})`);
  console.error(`  Nenhuma das ${TABELAS.length} tabelas respondeu — HTTP ${status}.`);
  console.error('  Isto NÃO é divergência entre ambientes: é o instrumento sem alcance.');
  if (/403/.test(status)) {
    console.error('  HTTP 403 costuma ser o proxy, não o Supabase: o ambiente do Claude não alcança');
    console.error('  *.supabase.co. Rode na sua máquina ou no CI (workflow db-checks.yml).');
  } else if (/401/.test(status)) {
    console.error('  HTTP 401 sugere anon key inválida ou expirada para este projeto — confira as');
    console.error('  constantes no topo do app.js.');
  }
  process.exit(1);
}

const [prod, teste] = [await inventariar(AMBIENTES[0]), await inventariar(AMBIENTES[1])];
conferirAlcance(AMBIENTES[0], prod);
conferirAlcance(AMBIENTES[1], teste);

// ---------- comparação ----------

const erros = [];   // teste tem MENOS do que o portal precisa → quebra o preview, em silêncio
const avisos = [];  // divergência que não quebra o portal

for (const t of TABELAS) {
  const p = prod.tabelas[t], s = teste.tabelas[t];

  if (p.legivel && !s.legivel) {
    erros.push({ tipo: 'tabela_ilegivel_no_teste', alvo: t,
      detalhe: `anon lê "${t}" em produção mas recebe HTTP ${s.status} no teste — a view que usa essa tabela renderiza VAZIA no preview, sem erro` });
    continue;
  }
  if (!p.legivel && s.legivel) {
    avisos.push({ tipo: 'tabela_so_no_teste', alvo: t,
      detalhe: `anon lê "${t}" no teste mas recebe HTTP ${p.status} em produção` });
    continue;
  }
  if (!p.legivel && !s.legivel) {
    erros.push({ tipo: 'tabela_ilegivel_nos_dois', alvo: t,
      detalhe: `"${t}" está em RT_TABLES mas anon não a lê em NENHUM dos dois (HTTP ${p.status}) — ou o app.js pede tabela que não existe, ou os dois ambientes perderam o grant` });
    continue;
  }

  if (p.colunas && s.colunas) {
    const faltando = p.colunas.filter(c => !s.colunas.includes(c));
    const sobrando = s.colunas.filter(c => !p.colunas.includes(c));
    // Coluna faltando é o modo de falha mais traiçoeiro do repo: o CLAUDE.md já registra que
    // nome de coluna divergente chega `undefined` no render e a tela fica vazia SEM erro.
    if (faltando.length) {
      erros.push({ tipo: 'coluna_faltando_no_teste', alvo: `${t}.${faltando.join(',')}`,
        detalhe: `"${t}" tem ${faltando.join(', ')} em produção e não no teste — chega undefined no render, tela vazia sem erro` });
    }
    if (sobrando.length) {
      avisos.push({ tipo: 'coluna_so_no_teste', alvo: `${t}.${sobrando.join(',')}`,
        detalhe: `"${t}" tem ${sobrando.join(', ')} no teste e não em produção` });
    }
  } else if (p.colunas && !s.colunas) {
    avisos.push({ tipo: 'tabela_vazia_no_teste', alvo: t,
      detalhe: `"${t}" tem ${p.linhas} linha(s) em produção e ${s.linhas} no teste — colunas não conferidas (o PostgREST só as revela quando há linha)` });
  }
}

for (const nome of RPCS) {
  const p = prod.rpcs[nome], s = teste.rpcs[nome];
  if (p.executavel && !s.executavel) {
    erros.push({ tipo: 'rpc_indisponivel_no_teste', alvo: nome,
      detalhe: `anon executa ${nome}() em produção mas recebe HTTP ${s.status} no teste — o card que a usa fica vazio no preview, sem erro` });
  } else if (!p.executavel && s.executavel) {
    avisos.push({ tipo: 'rpc_so_no_teste', alvo: nome,
      detalhe: `anon executa ${nome}() no teste mas recebe HTTP ${p.status} em produção` });
  } else if (!p.executavel && !s.executavel) {
    erros.push({ tipo: 'rpc_indisponivel_nos_dois', alvo: nome,
      detalhe: `o app.js chama ${nome}() e anon não a executa em nenhum dos dois (HTTP ${p.status})` });
  }
}

// ---------- baseline ----------
// Mesma filosofia do check_data_quality.mjs: o baseline é dívida REGISTRADA, não perdão. O gate
// passa com o que já se sabe e falha no instante em que aparece divergência NOVA.
let baseline = { achados: [] };
try { baseline = JSON.parse(await readFile(BASELINE, 'utf8')); } catch { /* primeira execução */ }

const chave = a => `${a.tipo} ${a.alvo}`;
const conhecidos = new Set((baseline.achados || []).map(chave));
const novos = SEM_BASELINE ? erros : erros.filter(a => !conhecidos.has(chave(a)));
const perdoados = SEM_BASELINE ? [] : erros.filter(a => conhecidos.has(chave(a)));

// ---------- relato ----------

const linha = a => `    [${a.tipo}] ${a.alvo}\n      ${a.detalhe}`;

console.log(`Tabelas legíveis por anon — produção: ${Object.values(prod.tabelas).filter(t => t.legivel).length}/${TABELAS.length}` +
            ` · teste: ${Object.values(teste.tabelas).filter(t => t.legivel).length}/${TABELAS.length}`);
console.log(`RPCs executáveis por anon — produção: ${Object.values(prod.rpcs).filter(r => r.executavel).length}/${RPCS.length}` +
            ` · teste: ${Object.values(teste.rpcs).filter(r => r.executavel).length}/${RPCS.length}\n`);

if (avisos.length) {
  console.log(`⚠ ${avisos.length} divergência(s) que NÃO quebram o portal:`);
  for (const a of avisos) console.log(linha(a));
  console.log('');
}
if (perdoados.length) {
  console.log(`· ${perdoados.length} divergência(s) conhecida(s), no baseline:`);
  for (const a of perdoados) console.log(linha(a));
  console.log('');
}

if (ATUALIZAR) {
  const registro = {
    gerado_em: new Date().toISOString().slice(0, 10),
    nota: 'Divergências teste × produção CONHECIDAS e aceitas. Cada entrada precisa de motivo. Isto não é perdão: divergência nova derruba o gate. Ao alinhar os ambientes, rode --atualizar-baseline de novo para o gate voltar a apertar.',
    achados: erros.map(a => ({ tipo: a.tipo, alvo: a.alvo, detalhe: a.detalhe, motivo: '(preencha à mão: por que esta divergência é aceitável)' })),
  };
  await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n');
  console.log(`Baseline reescrito com ${registro.achados.length} achado(s) → scripts/ambientes_baseline.json`);
  console.log('Preencha o campo "motivo" de cada entrada nova — entrada sem motivo é dívida anônima.');
  process.exit(0);
}

if (novos.length) {
  console.error(`✗ ${novos.length} divergência(s) NOVA(s) — o teste não cobre o que o portal usa:`);
  for (const a of novos) console.error(linha(a));
  console.error('\nO sintoma disto no preview é TELA VAZIA SEM ERRO, que ninguém depura porque não');
  console.error('parece defeito. Alinhe o ambiente de teste, ou registre a divergência com');
  console.error('--atualizar-baseline se ela for deliberada (e escreva o motivo).');
  process.exit(1);
}

console.log(`✓ o ambiente de teste cobre tudo que o portal usa (${TABELAS.length} tabelas, ${RPCS.length} RPCs).`);
if (perdoados.length) console.log(`  (${perdoados.length} divergência(s) conhecida(s) perdoada(s) pelo baseline.)`);
