/* Módulos de `src/ui/` e `src/data/` pelo caminho ESM — o mesmo `import` que o NAVEGADOR usa.
   Eles nasceram na Fase B2 do plano das fatias 3-4, e são a primeira leva que NÃO é de domínio
   puro: dois deles dependem de algo que só o app.js tem (o SVG do logo, a função de rede). Essa
   dependência chega por injeção (`configurarDoc`/`configurarLookups`/`configurarListas`), e é
   justamente o que torna possível testá-los aqui, em Node puro, sem navegador.

   A Fase C1 acrescentou três: `src/ui/blocos.mjs` (o markup que MAIS DE UMA família usa),
   `src/data/campos.mjs` (as listas de coluna do `select=`) e `src/documentos/shell.mjs` (o seam
   único de injeção dos documentos, e o lugar onde o critério de parada do plano vira asserção).
   Os RENDERS da C1 não entram aqui — escrevem no DOM, e ficam com os gates de navegador.

   O que NÃO cabe neste arquivo: tudo que escreve no DOM (paginate, paginateTable,
   paginateEvents, paginateLines, lineResults, bindLineRows). Node não tem `document`, e o repo é
   zero-dependência (não há jsdom). Esses ficam com os gates de navegador — `check_views.mjs`,
   `check_selecao_linha.mjs` e `check_abas.mjs`. Aqui eles entram só pelo contrato: carregam como
   ESM e exportam o que prometem.

   Rode: node ui-data-module.test.mjs   (ou, melhor, node check.js para rodar tudo). */
import assert from 'node:assert/strict';
import * as doc from '../src/ui/doc.mjs';
import * as lookups from '../src/data/lookups.mjs';
import * as paginacao from '../src/ui/paginacao.mjs';
import * as listas from '../src/ui/listas.mjs';
import * as blocos from '../src/ui/blocos.mjs';
import * as campos from '../src/data/campos.mjs';
import * as shell from '../src/documentos/shell.mjs';

let pass = 0, fail = 0;
const fails = [];
const t = (nome, fn) => {
  try { fn(); pass++; } catch (e){ fail++; fails.push(`${nome}: ${e.message}`); }
};
const tAsync = async (nome, fn) => {
  try { await fn(); pass++; } catch (e){ fail++; fails.push(`${nome}: ${e.message}`); }
};

/* ================================================================
   src/ui/doc.mjs
   ================================================================ */
// ANTES de configurar: precisa LANÇAR. Um cabeçalho sem logo não quebra nenhuma view e nenhum
// gate olha para o SVG — sair em silêncio seria a regressão invisível que a injeção evita.
t('docHead lança antes de configurarDoc', () => {
  assert.throws(() => doc.docHead('Frota'), /configurarDoc/);
});

doc.configurarDoc({ logoSVG: '<svg id="l"></svg>' });

t('docHead traz o logo injetado e escapa o subtítulo', () => {
  const h = doc.docHead('Frota & <Cia>');
  assert.match(h, /<svg id="l"><\/svg>/);
  assert.match(h, /DIVAT · Frota &amp; &lt;Cia&gt;/);
});
t('configurarDoc aceita "sem logo" explícito', () => {
  const noutro = doc.docHead('x');
  assert.equal(typeof noutro, 'string');
});
t('metaRows: par vazio vira linha vazia; `full` marca a classe', () => {
  const m = doc.metaRows([['', ''], ['Empresa', 'X', true], ['RJ', '101']]);
  assert.match(m, /<div class="row"><\/div>/);
  assert.match(m, /<div class="row full"><b>Empresa:<\/b><span>X<\/span><\/div>/);
  assert.match(m, /<div class="row"><b>RJ:<\/b><span>101<\/span><\/div>/);
});
t('colClass: px e % viram classe; sem largura, string vazia', () => {
  assert.equal(doc.colClass('150px'), ' class="w-150"');
  assert.equal(doc.colClass('40%'), ' class="w-40p"');
  assert.equal(doc.colClass(undefined), '');
});
t('tableHTML: cabeçalho escapado, rodapé opcional, classe extra', () => {
  const semFoot = doc.tableHTML([{ t:'A' }], '<tr></tr>');
  assert.equal(semFoot.includes('doc-foot'), false);
  const comFoot = doc.tableHTML([{ t:'A & B', w:'52px' }], '<tr></tr>', '2 itens', 'stack');
  assert.match(comFoot, /<table class="doc-table stack">/);
  assert.match(comFoot, /<th class="w-52">A &amp; B<\/th>/);
  assert.match(comFoot, /<div class="doc-foot">2 itens<\/div>/);
});
t('estados de tela: carregando, vazio, vazio-de-linha e erro', () => {
  assert.match(doc.loading(), /class="spin"/);
  assert.match(doc.loading('Atualizando…'), /Atualizando…/);
  assert.match(doc.emptyBox('nada <aqui>'), /nada &lt;aqui&gt;/);
  // o texto não pode AFIRMAR que o dado não existe — o portal não sabe disso (codlinhas órfãs)
  assert.match(doc.emptyLinha('itinerário'), /Nenhum registro de itinerário foi localizado para esta linha\./);
  assert.match(doc.errorBox('HTTP 500'), /class="m-loading err"/);
});
t('bannerTrunc só aparece com a marca não-enumerável do marcarTrunc', () => {
  assert.equal(doc.bannerTrunc([]), '');
  assert.equal(doc.bannerTrunc(null), '');
  const rows = [1, 2];
  Object.defineProperty(rows, '_trunc',  { value:true, enumerable:false });
  Object.defineProperty(rows, '_limite', { value:500, enumerable:false });
  assert.match(doc.bannerTrunc(rows), /mostrando os primeiros 500/);
});

/* ================================================================
   src/data/lookups.mjs
   ================================================================ */
await tAsync('getEmpresas rejeita antes de configurarLookups', async () => {
  await assert.rejects(() => lookups.getEmpresas(), /configurarLookups/);
});

// `sbFetch` de mentira: conta as chamadas por tabela, para provar que o cache é cache.
const chamadas = {};
const RESPOSTAS = {
  codempresa_teste: [
    { codempresa:'101', nome_empresa:'VIAÇÃO A', situacao:'REGULAR' },
    { codempresa:'101', nome_empresa:'VIAÇÃO A (BAIXADA)', situacao:'' },
    { codempresa:'102', nome_empresa:'VIAÇÃO B', situacao:'REGULAR' },
  ],
  municipio_teste: [{ cod_ibge:3303302, nome_municipio:'Niterói', regiao_municipio:'Metropolitana', regiao_novo:'Metrô' }],
  origem_teste:    [{ cod_origem:7, nome_origem:'NITERÓI' }],
  itinerario_teste:[{ nome_logradouro:'TERMINAL X', codlinha:'1', cod_municipio_origem:3303302 }],
  evento_empresa_teste: [{ id:1, evento_empresa:'CRIAÇÃO' }],
  evento_linha_teste:   [{ id:2, evento_linha:'PRORROGAÇÃO' }],
};
lookups.configurarLookups({ sbFetch: async (tabela) => {
  chamadas[tabela] = (chamadas[tabela] || 0) + 1;
  return RESPOSTAS[tabela] ?? [];
}});

await tAsync('getEmpresas: dedup por RJ, cache de verdade e acessos derivados', async () => {
  const map1 = await lookups.getEmpresas();
  const map2 = await lookups.getEmpresas();
  assert.equal(chamadas.codempresa_teste, 1, 'a 2ª chamada não pode ir à rede');
  assert.equal(map1, map2);
  // o desempate (dedupEmpresasPorRJ, em src/domain/agrupamento.mjs) resolve o RJ duplicado:
  // uma entrada por codempresa. Prova que o módulo resolve a dependência pelo caminho ESM.
  assert.deepEqual(Object.keys(map1).sort(), ['101', '102']);
  assert.equal(lookups.empNome('101'), 'VIAÇÃO A');
  assert.equal(lookups.empresasMap(), map1);
  assert.equal(lookups.empresasList().length, 3, 'a lista CRUA mantém a duplicata por RJ');
  assert.equal(lookups.empresaPorCod('102').situacao, 'REGULAR');
});
t('empNome cai no próprio código quando não conhece a empresa', () => {
  assert.equal(lookups.empNome('999'), '999');
  assert.equal(lookups.empNome(null), '—');
});
await tAsync('getIbge/getOrigem/getTerminais: formato e cache', async () => {
  const ibge = await lookups.getIbge();
  assert.deepEqual(ibge[3303302], { nome:'Niterói', regiao:'Metrô', regiaoPrograma:'Metropolitana' });
  const orig = await lookups.getOrigem();
  assert.equal(orig[7], 'NITERÓI');
  const term = await lookups.getTerminais();
  assert.equal(term[0].nome_logradouro, 'TERMINAL X');
  await lookups.getIbge(); await lookups.getOrigem(); await lookups.getTerminais();
  assert.equal(chamadas.municipio_teste, 1);
  assert.equal(chamadas.origem_teste, 1);
  assert.equal(chamadas.itinerario_teste, 1);
});
await tAsync('getEvLookups devolve os dois dicionários de tipo de evento', async () => {
  const lk = await lookups.getEvLookups();
  assert.equal(lk.emp[1], 'CRIAÇÃO');
  assert.equal(lk.lin[2], 'PRORROGAÇÃO');
});
// O bug que esta função existe para impedir: cachear a FALHA. Objeto vazio é TRUTHY, então uma
// versão que gravasse `{}` no erro deixaria o Histórico com ids crus pela sessão inteira.
await tAsync('preencherLookup não cacheia falha, mas cacheia vazio de verdade', async () => {
  const cache = {};
  let n = 0;
  const falhaUmaVez = async () => { n++; if (n === 1) throw new Error('rede'); return [{ id:9, ev:'OK' }]; };
  assert.equal(await lookups.preencherLookup(cache, 'lin', falhaUmaVez, 'ev'), null);
  assert.equal('lin' in cache, false, 'falha não pode virar entrada no cache');
  assert.deepEqual(await lookups.preencherLookup(cache, 'lin', falhaUmaVez, 'ev'), { 9:'OK' });
  assert.equal(n, 2);
  await lookups.preencherLookup(cache, 'lin', falhaUmaVez, 'ev');
  assert.equal(n, 2, 'depois de gravado, não vai mais à rede');

  const vazio = {};
  await lookups.preencherLookup(vazio, 'emp', async () => [], 'ev');
  assert.deepEqual(vazio.emp, {}, 'vazio de verdade É resultado, e fica cacheado');
});
await tAsync('INVALIDADORES_LOOKUP limpa o cache certo e recarrega o cadastro', async () => {
  // toda chave tem de ser tabela do Realtime — o app.js espalha este objeto no CACHE_INVALIDATORS
  const chaves = Object.keys(lookups.INVALIDADORES_LOOKUP).sort();
  assert.deepEqual(chaves, ['codempresa_teste', 'evento_empresa_teste', 'evento_linha_teste',
    'itinerario_teste', 'municipio_teste', 'origem_teste']);
  const antes = chamadas.municipio_teste;
  lookups.INVALIDADORES_LOOKUP.municipio_teste();
  await lookups.getIbge();
  assert.equal(chamadas.municipio_teste, antes + 1, 'invalidado, o próximo get vai à rede');
  // codempresa recarrega SOZINHO: o nome da empresa é lido por renderizadores síncronos
  const antesEmp = chamadas.codempresa_teste;
  lookups.INVALIDADORES_LOOKUP.codempresa_teste();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(chamadas.codempresa_teste, antesEmp + 1, 'invalidação do cadastro já dispara o recarregamento');
});

/* ================================================================
   src/ui/paginacao.mjs e src/ui/listas.mjs — contrato + o que é markup puro
   ================================================================ */
t('paginacao.mjs exporta os três paginadores agnósticos de conteúdo', () => {
  for (const nome of ['paginate', 'paginateTable', 'paginateEvents']){
    assert.equal(typeof paginacao[nome], 'function', `paginacao.${nome} ausente`);
  }
});
t('listas.mjs exporta a família de listas de linha e o seam de seleção', () => {
  for (const nome of ['configurarListas', 'situacaoSelectHTML', 'linhasTable', 'bindLineRows',
                      'paginateLines', 'lineResults']){
    assert.equal(typeof listas[nome], 'function', `listas.${nome} ausente`);
  }
});
t('situacaoSelectHTML: as três opções, com o id que a CSS e o lineResults esperam', () => {
  const h = listas.situacaoSelectHTML();
  assert.match(h, /<select id="lrStatus">/);
  for (const v of ['todas', 'ativas', 'canceladas']) assert.match(h, new RegExp(`value="${v}"`));
});
t('linhasTable: vazio vira caixa vazia; com linha, traz data-row e o nome da empresa', () => {
  assert.match(listas.linhasTable([]), /Nenhuma ligação\./);
  const html = listas.linhasTable([{ codlinha:'101001001', numero_ligacao:'1A', nome_ligacao:'A - B',
    codempresa:'101', tipo:'Regular', cancelado:true }]);
  assert.match(html, /data-row='/);                       // é o que o bindLineRows liga ao clique
  assert.match(html, /101-001-001/);                      // fmtCode, via src/domain/core.mjs
  assert.match(html, /VIAÇÃO A/);                         // empNome, via src/data/lookups.mjs
  assert.match(html, /<span class="chip chip-on">canc\.<\/span>/);
  assert.match(html, /1 ligação\(ões\) · clique para abrir/);
});
t('bindLineRows exige o host e recusa rodar sem o seam de seleção configurado', () => {
  // sem `configurarListas`, LANÇA na hora de LIGAR (não na hora do clique): linha renderizada e
  // não clicável é o modo de falha que o plano da Fase B2 aponta — silencioso no console.
  assert.throws(() => listas.bindLineRows({ querySelectorAll: () => [] }), /configurarListas/);
});
t('configurarListas liga a ação de seleção, e o bind passa a funcionar', () => {
  const escolhidas = [];
  listas.configurarListas({ aoSelecionarLinha: row => escolhidas.push(row) });
  // host de mentira: só o que o bindLineRows usa (querySelectorAll + addEventListener)
  const el = { dataset:{ row:'{"codlinha":"1"}' }, _ouvintes:{},
    addEventListener(ev, fn){ this._ouvintes[ev] = fn; } };
  listas.bindLineRows({ querySelectorAll: () => [el] });
  el._ouvintes.click();
  assert.deepEqual(escolhidas, [{ codlinha:'1' }]);
});

/* ================================================================
   src/ui/blocos.mjs  (Fase C1)
   ================================================================ */
// Markup puro compartilhado por MAIS DE UMA família: entra dado, sai string. Não depende de
// injeção — só do `configurarDoc` acima, que o `itinerarioTableHTML` usa via `emptyLinha`.
t('evBandHTML: 4 células sem a da linha; 5 e a classe ev5 quando showLine', () => {
  const r = { data_registro:'2026-01-15', codlinha:'101001001', numero_processo:'E-99/2026',
    data_publicacao:'2026-02-01' };
  const sem = blocos.evBandHTML(r, 'Tipo Evento da Linha', 'Criação', false);
  assert.equal((sem.match(/class="ev-cell"/g) || []).length, 4);
  assert.doesNotMatch(sem, /ev5/);
  const com = blocos.evBandHTML(r, 'Tipo Evento Empresa', 'Transferência', true);
  assert.equal((com.match(/class="ev-cell"/g) || []).length, 5);
  assert.match(com, /ev-grid ev5/);
  assert.match(com, /101-001-001/);                       // fmtCode, via src/domain/core.mjs
});
t('evBandHTML escapa o rótulo e o valor do tipo (vêm de lookup, não de literal)', () => {
  const h = blocos.evBandHTML({}, '<b>rot</b>', '<img src=x onerror=1>', false);
  assert.doesNotMatch(h, /<b>rot<\/b>/);
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /&lt;b&gt;rot/);
});
t('evBlocksHTML: campo vazio ganha a classe empty e o travessão', () => {
  const vazio = blocos.evBlocksHTML({});
  assert.equal((vazio.match(/ev-text empty/g) || []).length, 2);
  assert.equal((vazio.match(/—/g) || []).length, 2);
  const cheio = blocos.evBlocksHTML({ descricao:'Criada', observacao:'Sem ônus' });
  assert.doesNotMatch(cheio, /ev-text empty/);
  assert.match(cheio, /Criada/);
});
t('normSentido normaliza os três sentidos por prefixo, e preserva o desconhecido', () => {
  assert.equal(blocos.normSentido('IDA'), 'Ida');
  assert.equal(blocos.normSentido(' voltando '), 'Volta');
  assert.equal(blocos.normSentido('Circular 1'), 'Circular');
  assert.equal(blocos.normSentido('Retorno'), 'Retorno');   // não inventa: devolve o que veio
  assert.equal(blocos.normSentido(null), '—');
});
t('itinerarioTableHTML: vazio vira caixa vazia de LINHA', () => {
  assert.match(blocos.itinerarioTableHTML([], {}), /itinerário/);
});
t('itinerarioTableHTML ordena por sentido (Ida→Volta→Circular) e separa em faixas', () => {
  const rows = [
    { id:3, sentido:'volta', tipo_logradouro:'RUA', nome_logradouro:'B', cod_municipio_origem:'3304557' },
    { id:1, sentido:'IDA',   tipo_logradouro:'AV',  nome_logradouro:'A', cod_municipio_origem:'3304557' },
    { id:2, sentido:'circ',  tipo_logradouro:'RUA', nome_logradouro:'C', cod_municipio_origem:'0000000' },
  ];
  const h = blocos.itinerarioTableHTML(rows, { '3304557': { nome:'Rio de Janeiro' } });
  const faixas = [...h.matchAll(/Sentido: ([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(faixas, ['Ida', 'Volta', 'Circular']);
  assert.ok(h.indexOf('>A<') < h.indexOf('>B<'), 'a Ida vem antes da Volta');
  assert.match(h, /Rio de Janeiro/);                       // resolveu pelo lookup do IBGE
  assert.match(h, /<td class="td-mun">0000000<\/td>/);      // sem lookup, cai no código cru
  assert.match(h, /3 logradouro\(s\)/);
});
t('itinerarioTableHTML escapa o nome do logradouro (vem do banco)', () => {
  const h = blocos.itinerarioTableHTML([{ id:1, sentido:'Ida', tipo_logradouro:'RUA',
    nome_logradouro:'<script>x</script>', cod_municipio_origem:null }], {});
  assert.doesNotMatch(h, /<script>/);
});
t('frotaBlockHTML traz as 12 KPIs que o check_views.mjs exige, com — no ausente', () => {
  const h = blocos.frotaBlockHTML({ frota_operacional:40, frota_a:10 });
  assert.equal((h.match(/class="kpi"/g) || []).length, 12);
  assert.match(h, /<b>40<\/b><span>Operacional<\/span>/);
  assert.match(h, /<b>—<\/b><span>Reserva<\/span>/);
});

/* ================================================================
   src/data/campos.mjs  (Fase C1)
   ================================================================ */
// A razão de a constante existir é ser ÚNICA: a Estrutura Operacional consolida os outros
// documentos e pede as mesmas colunas. Uma coluna que se perca aqui chega `undefined` no render
// e a tela sai vazia SEM ERRO — daí conferir a presença, não só que a string não é vazia.
t('campos: toda lista de select é string não-vazia, sem espaço e sem item repetido', () => {
  for (const [nome, v] of Object.entries(campos)){
    assert.equal(typeof v, 'string', nome + ' deveria ser string');
    assert.ok(v.length, nome + ' está vazia');
    assert.doesNotMatch(v, /\s/, nome + ' tem espaço (o PostgREST rejeita)');
    const cols = v.split(',');
    assert.equal(new Set(cols).size, cols.length, nome + ' repete coluna');
  }
});
t('campos: as colunas que a Estrutura consolida estão nas listas gêmeas', () => {
  // cada par abaixo é (constante, coluna que um render lê por nome) — o elo que some em silêncio
  assert.ok(campos.ITINERARIO_FIELDS.split(',').includes('cod_municipio_origem'));
  assert.ok(campos.FROTA_FIELDS.split(',').includes('frota_micro_sac'));
  assert.ok(campos.EVENTO_FIELDS.split(',').includes('evento_empresa'));
  assert.ok(campos.LINE_FIELDS.split(',').includes('nome_lig_cresc'));
  assert.ok(campos.TARIFA_LINHA_FIELDS.split(',').includes('piso_i'));
});

/* ================================================================
   src/documentos/shell.mjs  (Fase C1)
   ================================================================ */
// O seam ÚNICO de src/documentos/. Como os três `configurar*` da B2, ele falha FECHADO: um
// documento sem rede pintaria tela vazia sem erro — invisível para todo gate deste repo.
t('sbFetch e selecionarLinha lançam antes de configurarDocumentos', () => {
  assert.throws(() => shell.sbFetch('evento_teste', ''), /configurarDocumentos/);
  assert.throws(() => shell.selecionarLinha({}), /configurarDocumentos/);
});
t('configurarDocumentos liga os dois slots, e ambos repassam os argumentos', () => {
  const chamadas = [];
  shell.configurarDocumentos({
    sbFetch: (tabela, qs) => { chamadas.push(['fetch', tabela, qs]); return 'ROWS'; },
    selecionarLinha: row => { chamadas.push(['linha', row]); },
  });
  assert.equal(shell.sbFetch('qh_teste', 'codlinha=eq.1'), 'ROWS');
  shell.selecionarLinha({ codlinha:'1' });
  assert.deepEqual(chamadas, [['fetch', 'qh_teste', 'codlinha=eq.1'], ['linha', { codlinha:'1' }]]);
});
t('src/documentos/shell.mjs tem no máximo 6 slots injetados (critério de parada do plano)', () => {
  // O plano vivo manda PARAR quando um módulo passa de ~6 dependências injetadas. Como todas as
  // famílias da Fase C passam por este seam, a conta é o número de slots dele — e esta asserção
  // é o lugar em que o critério deixa de ser prosa. Hoje são 2.
  const slots = Object.keys(shell).filter(k => k !== 'configurarDocumentos');
  assert.ok(slots.length <= 6, `slots injetados: ${slots.join(', ')} — o plano manda parar acima de ~6`);
});

console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
