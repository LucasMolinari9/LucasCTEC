'use strict';
/* Testes das funções puras (formatação, busca, filtros) copiadas em pure.harness.js.
   Rode: node pure.test.js   (ou, melhor, node check.js para rodar tudo). */
const P = require('./pure.harness.js');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}
const eq = (got, want, name) => ok(Object.is(got, want), name, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);

// --- fmtCode ---
console.log('fmtCode');
eq(P.fmtCode('101001001'), '101-001-001', 'fmtCode 9 dígitos');
eq(P.fmtCode(101001001),   '101-001-001', 'fmtCode aceita número');
eq(P.fmtCode('123'),       '123',         'fmtCode tamanho != 9 inalterado');
eq(P.fmtCode(''),          '',            'fmtCode vazio');
eq(P.fmtCode(null),        '',            'fmtCode null');

// --- fmtTime ---
console.log('fmtTime');
eq(P.fmtTime('08:30:00'), '08:30', 'fmtTime HH:MM:SS → HH:MM');
eq(P.fmtTime('08:30'),    '08:30', 'fmtTime HH:MM');
eq(P.fmtTime(''),         '—',     'fmtTime vazio → travessão');
eq(P.fmtTime('abc'),      'abc',   'fmtTime fora do padrão passthrough');

// --- fmtDate ---
console.log('fmtDate');
eq(P.fmtDate('2020-06-19'),          '19/06/2020', 'fmtDate ISO');
eq(P.fmtDate('2020-06-19T10:00:00'), '19/06/2020', 'fmtDate ISO com hora');
eq(P.fmtDate(''),                    '—',          'fmtDate vazio → travessão');
eq(P.fmtDate('19/06/2020'),          '19/06/2020', 'fmtDate fora do padrão passthrough');

// --- esc ---
console.log('esc');
eq(P.esc('<b>'),   '&lt;b&gt;',       'esc < >');
eq(P.esc('a&b'),   'a&amp;b',         'esc &');
eq(P.esc('"x"'),   '&quot;x&quot;',   'esc aspas');
eq(P.esc(null),    '',                'esc null');
eq(P.esc(undefined),'',               'esc undefined');
ok(P.esc('<img src=x onerror=alert(1)>').indexOf('<') === -1, 'esc neutraliza tag (XSS)');

// --- enc ---
eq(P.enc('a b/c'), 'a%20b%2Fc', 'enc encodeURIComponent');

// --- ilikeTerm (saneamento p/ filtro PostgREST) ---
eq(P.ilikeTerm('500'),        '500',        'ilikeTerm termo simples inalterado');
eq(P.ilikeTerm('a)*b'),       'a%20%20b',   'ilikeTerm neutraliza ) e * (sem quebrar or=())');
eq(P.ilikeTerm('x(y)'),       'x%20y%20',   'ilikeTerm neutraliza parênteses');
ok(P.ilikeTerm('*),(.ilike.*').indexOf('(') === -1 && P.ilikeTerm('*),(.ilike.*').indexOf(')') === -1 && P.ilikeTerm('*),(.ilike.*').indexOf('*') === -1, 'ilikeTerm remove ( ) * de payload de injeção');
eq(P.ilikeTerm(null),         '',           'ilikeTerm null → vazio');

// --- orDash ---
console.log('orDash');
eq(P.orDash(''),        '—', 'orDash vazio → travessão');
eq(P.orDash(null),      '—', 'orDash null → travessão');
eq(P.orDash(undefined), '—', 'orDash undefined → travessão');
eq(P.orDash(0),         0,   'orDash 0 preservado (não vira travessão)');
eq(P.orDash('x'),       'x', 'orDash valor');

// --- fmtLineName ---
console.log('fmtLineName');
eq(P.fmtLineName('Armação dos Búzios - Rio de Janeiro'),
   'Armação&nbsp;dos&nbsp;Búzios - Rio&nbsp;de&nbsp;Janeiro',
   'fmtLineName quebra só no " - ", lados inteiros');
eq(P.fmtLineName('Porciúncula - Rio de Janeiro (via Niterói/BR-101)'),
   'Porciúncula - Rio&nbsp;de&nbsp;Janeiro&nbsp;(via&nbsp;Niterói/BR-101)',
   'fmtLineName não quebra em "-" sem espaços (BR-101)');
eq(P.fmtLineName('Circular'),      'Circular', 'fmtLineName palavra única');
eq(P.fmtLineName(''),              '—',        'fmtLineName vazio → travessão');
eq(P.fmtLineName(null),            '—',        'fmtLineName null → travessão');
eq(P.fmtLineName('<b> - </b>'),    '&lt;b&gt; - &lt;/b&gt;', 'fmtLineName escapa HTML (XSS)');

// --- byCodlinha ---
console.log('byCodlinha');
{
  const linhas = [{codlinha:'108029009'},{codlinha:'108003000'},{codlinha:'108034000'},{codlinha:'108029001'}];
  const ord = [...linhas].sort(P.byCodlinha).map(l=>l.codlinha);
  eq(ord.join(','), '108003000,108029001,108029009,108034000', 'byCodlinha ordena por código crescente');
}
eq([{codlinha:'2'},{codlinha:'10'}].sort(P.byCodlinha).map(l=>l.codlinha).join(','), '2,10', 'byCodlinha é numérico (10 depois de 2)');
eq([{codlinha:'5'},{}].sort(P.byCodlinha).map(l=>l.codlinha||'—').join(','), '—,5', 'byCodlinha trata codlinha ausente');

// --- boolChip ---
console.log('boolChip');
ok(P.boolChip(true,'X').includes('chip-on') && P.boolChip(true,'X').includes('X'), 'boolChip true → chip');
eq(P.boolChip(false,'X'), '', 'boolChip false → vazio');

// --- isLinhaAtiva (ativa = não cancelada e não paralisada; sub judice/transferida contam como ativas) ---
console.log('isLinhaAtiva');
ok(P.isLinhaAtiva({}) === true,                                    'isLinhaAtiva sem flags → ativa');
ok(P.isLinhaAtiva({cancelado:true}) === false,                     'isLinhaAtiva cancelada → inativa');
ok(P.isLinhaAtiva({paralisado:true}) === false,                    'isLinhaAtiva paralisada → inativa');
ok(P.isLinhaAtiva({sub_judice:true}) === true,                     'isLinhaAtiva sub judice → ativa');
ok(P.isLinhaAtiva({transferido:true}) === true,                    'isLinhaAtiva transferida → ativa');
ok(P.isLinhaAtiva({sub_judice:true,transferido:true}) === true,    'isLinhaAtiva sub judice + transferida → ativa');
ok(P.isLinhaAtiva({cancelado:true,paralisado:true}) === false,     'isLinhaAtiva cancelada + paralisada → inativa');
ok(P.isLinhaAtiva({paralisado:true,sub_judice:true}) === false,    'isLinhaAtiva paralisada vence sub judice → inativa');

// --- isVigente (estrito: ativa E não sub judice E não transferida; usado no filtro das tarifas) ---
console.log('isVigente');
ok(P.isVigente({}) === true,                                       'isVigente sem flags → vigente');
ok(P.isVigente({cancelado:true}) === false,                        'isVigente cancelada → não vigente');
ok(P.isVigente({paralisado:true}) === false,                       'isVigente paralisada → não vigente');
ok(P.isVigente({sub_judice:true}) === false,                       'isVigente sub judice → não vigente (oposto de ativa)');
ok(P.isVigente({transferido:true}) === false,                      'isVigente transferida → não vigente (oposto de ativa)');
// contraste explícito: os mesmos flags dão resultados opostos nas duas noções
ok(P.isLinhaAtiva({sub_judice:true}) === true && P.isVigente({sub_judice:true}) === false, 'sub judice: ativa mas NÃO vigente');
ok(P.isLinhaAtiva({transferido:true}) === true && P.isVigente({transferido:true}) === false, 'transferida: ativa mas NÃO vigente');

// --- norm ---
console.log('norm');
eq(P.norm('Niterói '),    'niteroi',     'norm acento + caixa + trim');
eq(P.norm('SÃO GONÇALO'), 'sao goncalo', 'norm maiúsculas + cedilha');
eq(P.norm(P.norm('Açaí')), P.norm('Açaí'), 'norm idempotente');
eq(P.norm(null),          '',            'norm null');

// --- localidadesQueCasam / orIlike (busca de localidade insensível a acento) ---
console.log('localidadesQueCasam / orIlike');
{
  const lista = ['ALCÂNTARA', 'Maricá', 'SÃO GONÇALO', 'São João de Meriti', 'São José do Turvo', 'São Luis do Mutuca', 'São Miguel', 'Centro'];
  eq(P.localidadesQueCasam(lista, 'sao goncalo').join('|'), 'SÃO GONÇALO', 'localidadesQueCasam acha canônico sem acento');
  eq(P.localidadesQueCasam(lista, 'marica').join('|'),      'Maricá',      'localidadesQueCasam acento + caixa');
  eq(P.localidadesQueCasam(lista, 'alcantara').join('|'),   'ALCÂNTARA',   'localidadesQueCasam circunflexo');
  eq(P.localidadesQueCasam(lista, '').length,  0, 'localidadesQueCasam termo vazio → []');
  eq(P.localidadesQueCasam(lista, 'sao').length, 5, 'localidadesQueCasam corta em 5 resultados');
  eq(P.localidadesQueCasam(lista, 'xyz').length, 0, 'localidadesQueCasam sem match → []');
  eq(P.orIlike(['a','b'], ['x']),        'or=(a.ilike.*x*,b.ilike.*x*)',              'orIlike 2 colunas × 1 termo');
  eq(P.orIlike(['a'], ['x','y']),        'or=(a.ilike.*x*,a.ilike.*y*)',              'orIlike 1 coluna × 2 termos');
  eq(P.orIlike(['a'], ['p)q*']),         'or=(a.ilike.*p%20q%20*)',                   'orIlike sanitiza termos via ilikeTerm');
}

// --- municipiosExatos (localidade que também é município → via geográfica na busca) ---
console.log('municipiosExatos');
{
  const ibge = { '3304557':{nome:'RIO DE JANEIRO'}, '3300456':{nome:'RIO BONITO'}, '3303302':{nome:'NITERÓI'}, '3302700':{nome:'MARICÁ'} };
  eq(P.municipiosExatos(ibge, ['Niterói','niteroi']).join('|'), '3303302',   'casa sem acento/caixa (termo digitado + canônico)');
  eq(P.municipiosExatos(ibge, ['rio']).length, 0,                            'é EXATO: "rio" não puxa Rio de Janeiro/Rio Bonito');
  eq(P.municipiosExatos(ibge, ['rio de janeiro']).join('|'), '3304557',      'nome composto');
  eq(P.municipiosExatos(ibge, ['Icaraí']).length, 0,                         'localidade que não é município → []');
  eq(P.municipiosExatos(ibge, ['']).length, 0,                               'termo vazio → []');
}

// --- fmtMoney ---
console.log('fmtMoney');
eq(P.fmtMoney(null),      '—',   'fmtMoney null → travessão');
eq(P.fmtMoney(''),        '—',   'fmtMoney vazio → travessão');
eq(P.fmtMoney(undefined), '—',   'fmtMoney undefined → travessão');
eq(P.fmtMoney('abc'),     'abc', 'fmtMoney não-número passthrough');
{
  const r = P.fmtMoney(1234.5);
  // tolerante ao separador de milhar do ICU; valida só os dígitos e a vírgula decimal
  ok(r.includes(',') && r.replace(/\D/g,'') === '123450', 'fmtMoney número em pt-BR', r);
}

// --- groupBy / countBy ---
console.log('groupBy / countBy');
{
  const data = [{t:'a',v:1},{t:'b',v:2},{t:'a',v:3}];
  const g = P.groupBy(data, x => x.t);
  ok(g instanceof Map && g.get('a').length === 2 && g.get('b').length === 1, 'groupBy agrupa por chave');
  const c = P.countBy(data, x => x.t);
  ok(c.get('a') === 2 && c.get('b') === 1, 'countBy conta por chave');
  ok(P.groupBy([], x => x).size === 0 && P.countBy([], x => x).size === 0, 'groupBy/countBy array vazio → Map vazio');
}

// --- yearOf ---
console.log('yearOf');
eq(P.yearOf('2020-06-19'), 2020, 'yearOf extrai o ano');
eq(P.yearOf(null),         null, 'yearOf null');

// --- matchEvent (critérios já normalizados, como no readCriteria do index.html) ---
console.log('matchEvent');
{
  const r = { descricao:'Reformulação do itinerário', observacao:'trecho novo',
              numero_processo:'2.599/46', data_registro:'2020-05-01', data_publicacao:'2021-06-02' };
  ok(P.matchEvent(r, {text:'', proc:'', ano:null}),               'matchEvent critério vazio → passa');
  ok(P.matchEvent(r, {text:P.norm('reformula'), proc:'', ano:null}), 'matchEvent por texto (descrição)');
  ok(P.matchEvent(r, {text:P.norm('trecho'), proc:'', ano:null}),    'matchEvent por texto (observação)');
  ok(!P.matchEvent(r, {text:P.norm('inexistente'), proc:'', ano:null}), 'matchEvent texto sem match → false');
  ok(P.matchEvent(r, {text:'', proc:P.norm('2.599'), ano:null}),  'matchEvent por nº do processo');
  ok(P.matchEvent(r, {text:'', proc:'', ano:2020}),               'matchEvent ano casa o registro');
  ok(!P.matchEvent(r, {text:'', proc:'', ano:2021}),              'matchEvent ano usa o registro, não a publicação → false');
  ok(!P.matchEvent(r, {text:'', proc:'', ano:1999}),              'matchEvent ano sem match → false');
}

// --- rowMatchesActiveLine ---
console.log('rowMatchesActiveLine');
{
  P.setRTState({ currentView:null });
  ok(P.rowMatchesActiveLine({new:{codlinha:'1'}}) === true,  'rmal sem view → true');
  P.setRTState({ currentView:{lineFilter:false}, activeLine:{codlinha:'1'} });
  ok(P.rowMatchesActiveLine({new:{codlinha:'2'}}) === true,  'rmal view sem lineFilter → true');
  P.setRTState({ currentView:{lineFilter:true}, activeLine:null });
  ok(P.rowMatchesActiveLine({new:{codlinha:'2'}}) === true,  'rmal sem activeLine → true');
  P.setRTState({ currentView:{lineFilter:true}, activeLine:{codlinha:'101'} });
  ok(P.rowMatchesActiveLine({new:{codlinha:'101'}}) === true,  'rmal mesma linha (new) → true');
  ok(P.rowMatchesActiveLine({old:{codlinha:'101'}}) === true,  'rmal mesma linha (old) → true');
  ok(P.rowMatchesActiveLine({new:{codlinha:'202'}}) === false, 'rmal linha diferente → false');
  ok(P.rowMatchesActiveLine({new:{}}) === true,                'rmal payload sem codlinha → true');
}

// --- resumoRelatorio (agregação do Relatório Gerencial) ---
console.log('resumoRelatorio');
{
  const rows = [
    { codempresa:'10', cancelado:false, paralisado:false, sub_judice:false },  // ativa
    { codempresa:'10', cancelado:true,  paralisado:false, sub_judice:false },  // cancelada → inativa
    { codempresa:'10', cancelado:false, paralisado:true,  sub_judice:false },  // paralisada → inativa
    { codempresa:'20', cancelado:false, paralisado:false, sub_judice:true  },  // sub judice → ativa
    { codempresa:'20', cancelado:false, paralisado:false, sub_judice:false },  // ativa
  ];
  const r = P.resumoRelatorio(rows);
  eq(r.total, 5,    'resumoRelatorio total');
  eq(r.ativas, 3,   'resumoRelatorio ativas (sub judice conta como ativa)');
  eq(r.canc, 1,     'resumoRelatorio canceladas');
  eq(r.paral, 1,    'resumoRelatorio paralisadas');
  eq(r.sj, 1,       'resumoRelatorio sub judice');
  eq(r.empCount, 2, 'resumoRelatorio nº de empresas distintas');
  ok(r.porEmp[0][0]==='10' && r.porEmp[0][1]===3 && r.porEmp[1][0]==='20' && r.porEmp[1][1]===2,
     'resumoRelatorio porEmp ordenado por nº de linhas desc');
  ok(P.resumoRelatorio([]).total===0 && P.resumoRelatorio([]).porEmp.length===0, 'resumoRelatorio vazio');
}

// --- resumoFrota (agregação da Frota por Empresa) ---
console.log('resumoFrota');
{
  const rows = [
    { codempresa:'10', hierarquia:'A', frota_operacional:'5', reserva:'1' },
    { codempresa:'10', hierarquia:'B', frota_operacional:3,   reserva:2   },
    { codempresa:'20', hierarquia:'A', frota_operacional:'',  reserva:null },  // vazio/null → 0
    { codempresa:'20', hierarquia:'A', frota_operacional:'x', reserva:'4' },   // inválido → 0
  ];
  const r = P.resumoFrota(rows);
  eq(r.totOp, 8,  'resumoFrota total operacional (vazio/inválido = 0)');
  eq(r.totRes, 7, 'resumoFrota total reserva');
  ok(r.porEmp[0].cod==='10' && r.porEmp[0].op===8 && r.porEmp[0].res===3 && r.porEmp[0].n===2,
     'resumoFrota porEmp empresa 10 consolidada');
  ok(r.porEmp[1].cod==='20' && r.porEmp[1].op===0 && r.porEmp[1].res===4 && r.porEmp[1].n===2,
     'resumoFrota porEmp empresa 20 consolidada');
  ok(r.porEmp[0].op >= r.porEmp[1].op, 'resumoFrota porEmp ordenado por operacional desc');
  {
    const hA = r.porHier.find(x=>x.h==='A');
    ok(hA.n===3 && hA.op===5 && hA.res===5, 'resumoFrota porHier hierarquia A consolidada');
  }
  ok(P.resumoFrota([]).totOp===0 && P.resumoFrota([]).porEmp.length===0, 'resumoFrota vazio');
}

// --- classifyMunLines ---
console.log('classifyMunLines');
{
  // M = município pesquisado; cada linha vira "dentro" (só M) ou "inter" (tem outro cod_municipio_origem).
  const rows = [
    { codlinha:'A', cod_municipio_origem:'33' },                 // só M
    { codlinha:'A', cod_municipio_origem:'33' },
    { codlinha:'B', cod_municipio_origem:'33' },                 // M + outro → inter
    { codlinha:'B', cod_municipio_origem:'44' },
    { codlinha:'C', cod_municipio_origem:'33' },                 // M + trecho vazio/null → ainda dentro
    { codlinha:'C', cod_municipio_origem:'' },
    { codlinha:'C', cod_municipio_origem:null },
    { codlinha:null, cod_municipio_origem:'33' },                // sem codlinha → ignorado
  ];
  const r = P.classifyMunLines(rows, '33');
  ok(r.dentro.has('A') && !r.inter.has('A'), 'classifyMunLines linha só no município → dentro');
  ok(r.inter.has('B') && !r.dentro.has('B'), 'classifyMunLines linha com outro município → inter');
  ok(r.dentro.has('C') && !r.inter.has('C'), 'classifyMunLines cod_municipio_origem vazio/null não conta como outro');
  ok(!r.dentro.has('null') && !r.inter.has('null'), 'classifyMunLines linha sem codlinha é ignorada');
  ok(r.dentro.size===2 && r.inter.size===1, 'classifyMunLines conta dentro=2, inter=1');
}
{
  // codibge numérico vs cod_municipio_origem string: a comparação normaliza tudo com String().
  const r = P.classifyMunLines([
    { codlinha:1, cod_municipio_origem:33 },
    { codlinha:1, cod_municipio_origem:'44' },
    { codlinha:2, cod_municipio_origem:'33' },
  ], 33);
  ok(r.inter.has('1'), 'classifyMunLines compara número×string (inter)');
  ok(r.dentro.has('2'), 'classifyMunLines compara número×string (dentro)');
}
ok((()=>{ const r=P.classifyMunLines([],'33'); return r.dentro.size===0 && r.inter.size===0; })(),
   'classifyMunLines lista vazia');

console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
