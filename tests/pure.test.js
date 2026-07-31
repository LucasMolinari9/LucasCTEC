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

// --- terminaisDoMunicipio ---
console.log('terminaisDoMunicipio');
{
  const rows = [
    {cod_municipio_origem:3304557, nome_logradouro:'Terminal João', codlinha:'1'},
    {cod_municipio_origem:'3304557', nome_logradouro:'TERMINAL JOAO', codlinha:'1'},
    {cod_municipio_origem:'3304557', nome_logradouro:'TERMINAL JOAO', codlinha:2},
    {cod_municipio_origem:'3304557', nome_logradouro:'Terminal Alfa', codlinha:null},
    {cod_municipio_origem:'3304557', nome_logradouro:'', codlinha:'3'},
    {cod_municipio_origem:'3303302', nome_logradouro:'Terminal Niterói', codlinha:'4'},
  ];
  const got = P.terminaisDoMunicipio(rows, '3304557');
  eq(JSON.stringify(got), JSON.stringify([{nome:'Terminal Alfa',nLinhas:0},{nome:'TERMINAL JOAO',nLinhas:2}]),
     'agrupa acento/caixa, escolhe grafia frequente e conta codlinha distinto');
  eq(P.terminaisDoMunicipio(rows, 3303302)[0].nome, 'Terminal Niterói', 'aceita município numérico contra código string');
  eq(P.terminaisDoMunicipio(rows, '9999999').length, 0, 'município sem terminal → []');
}

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
eq(P.esc("'x'"),   '&#39;x&#39;',     'esc apóstrofo (atributos single-quoted)');
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

// --- situacaoHTML (busca e documentos: Ativa/Cancelada/Paralisada; "Ativa" só quando operando) ---
console.log('situacaoHTML');
ok(P.situacaoHTML({}).includes('chip-off') && P.situacaoHTML({}).includes('Ativa'), 'situacaoHTML sem flags → Ativa (verde)');
ok(P.situacaoHTML({cancelado:true}).includes('Cancelada') && P.situacaoHTML({cancelado:true}).includes('chip-on'), 'situacaoHTML cancelada → chip vermelho');
ok(P.situacaoHTML({paralisado:true}).includes('Paralisada') && !P.situacaoHTML({paralisado:true}).includes('Ativa'), 'situacaoHTML paralisada → Paralisada (NÃO Ativa)');
eq(P.situacaoHTML({paralisado:true,transferido:true}), P.situacaoHTML({paralisado:true}), 'situacaoHTML paralisada+transferida → Paralisada (ex.: 458M)');
ok(P.situacaoHTML({transferido:true}) === P.situacaoHTML({}), 'situacaoHTML só transferida → igual a Ativa (sem Transferida)');
ok(!P.situacaoHTML({transferido:true}).includes('Transferida'), 'situacaoHTML nunca mostra Transferida');
eq(P.situacaoHTML({cancelado:true,paralisado:true}), P.situacaoHTML({cancelado:true}), 'situacaoHTML cancelada+paralisada → Cancelada (cancelada tem prioridade)');

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

// --- filtrarSituacao (barra Todas/Ativas/Canceladas; mesma regra nas duas telas que listam linha) ---
console.log('filtrarSituacao');
{
  const ativa = {codlinha:'1'}, canc = {codlinha:'2', cancelado:'2020-03-01'},
        paral = {codlinha:'3', paralisado:true}, cancEparal = {codlinha:'4', cancelado:'2019-01-01', paralisado:true};
  const todas = [ativa, canc, paral, cancEparal];
  const cods = rs => rs.map(r=>r.codlinha).join(',');
  ok(cods(P.filtrarSituacao(todas,'todas')) === '1,2,3,4',   'filtrarSituacao "todas" não filtra nada');
  ok(cods(P.filtrarSituacao(todas,'ativas')) === '1',        'filtrarSituacao "ativas" tira cancelada E paralisada');
  ok(cods(P.filtrarSituacao(todas,'canceladas')) === '2,4',  'filtrarSituacao "canceladas" pega toda cancelada, inclusive a também paralisada');
  // valor desconhecido cai no "todas" — barra nova com opção a mais não pode sumir com a lista
  ok(cods(P.filtrarSituacao(todas,'qualquer')) === '1,2,3,4','filtrarSituacao situação desconhecida → devolve tudo');
  ok(P.filtrarSituacao([],'ativas').length === 0,            'filtrarSituacao lista vazia → vazia');
  // paralisada NÃO é cancelada: some das "ativas" mas não aparece nas "canceladas"
  ok(!P.filtrarSituacao(todas,'canceladas').includes(paral), 'filtrarSituacao paralisada não vira cancelada');
}

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

// --- matchEvent (critérios já normalizados, como no readCriteria do app.js) ---
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

// --- tabMatchesEvent (#54 — filtro do Realtime, agora por ABA) ---
// mesmos casos de borda que o antigo rowMatchesActiveLine cobria, avaliados contra a
// linha/view DA ABA em vez de um `currentView`/`activeLine` global.
console.log('tabMatchesEvent');
{
  const aba = (id, view, line) => Object.assign(P.makeTab(id), { view, line });
  const T = 'qh_teste';
  const semLinha  = { tables:[T], lineFilter:false };
  const comLinha  = { tables:[T], lineFilter:true };

  ok(P.tabMatchesEvent(aba(1, null, null), T, {new:{codlinha:'1'}}) === false, 'tme aba em branco (sem view) → false');
  ok(P.tabMatchesEvent(aba(1, { tables:['tarifa_atual_teste'], lineFilter:false }), T, {new:{codlinha:'1'}}) === false,
     'tme view que não lê a tabela alterada → false');
  ok(P.tabMatchesEvent(aba(1, { lineFilter:false }), T, {new:{}}) === false, 'tme view sem `tables` → false');
  ok(P.tabMatchesEvent(aba(1, semLinha, {codlinha:'1'}), T, {new:{codlinha:'2'}}) === true, 'tme view sem lineFilter → true (qualquer linha)');
  ok(P.tabMatchesEvent(aba(1, comLinha, null), T, {new:{codlinha:'2'}}) === true, 'tme aba sem linha própria → true');
  ok(P.tabMatchesEvent(aba(1, comLinha, {codlinha:'101'}), T, {new:{codlinha:'101'}}) === true, 'tme mesma linha (new) → true');
  ok(P.tabMatchesEvent(aba(1, comLinha, {codlinha:'101'}), T, {old:{codlinha:'101'}}) === true, 'tme mesma linha (old) → true');
  ok(P.tabMatchesEvent(aba(1, comLinha, {codlinha:'101'}), T, {new:{codlinha:'202'}}) === false, 'tme linha diferente → false');
  ok(P.tabMatchesEvent(aba(1, comLinha, {codlinha:'101'}), T, {new:{}}) === true, 'tme payload sem codlinha → true');
  ok(P.tabMatchesEvent(null, T, {new:{}}) === false, 'tme aba inexistente → false');
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
  eq(r.porEmp.map(e=>e.cod).join(','), '10,20', 'resumoFrota porEmp ordenado por RJ crescente');
  {
    const hA = r.porHier.find(x=>x.h==='A');
    ok(hA.n===3 && hA.op===5 && hA.res===5, 'resumoFrota porHier hierarquia A consolidada');
  }
  ok(P.resumoFrota([]).totOp===0 && P.resumoFrota([]).porEmp.length===0, 'resumoFrota vazio');
}

// --- rjOrder / filtrarFrotaEmpresas ---
console.log('rjOrder / filtrarFrotaEmpresas');
{
  const cods = ['10','SEM RJ','2','101'].sort(P.rjOrder);
  eq(cods.join(','), '2,10,101,SEM RJ', 'rjOrder numérico crescente e código inválido no fim');

  const items = [
    { cod:'2',  nome_empresa:'Viação Águia', situacao:'REGULAR', op:10 },
    { cod:'10', nome_empresa:'Expresso Beta', situacao:'CANCELADO', op:20 },
    { cod:'20', nome_empresa:'Empresa Gama', situacao:'SOB INTERVENÇÃO', op:30 },
    { cod:'30', nome_empresa:'Sem Situação', situacao:null, op:40 },
  ];
  eq(P.filtrarFrotaEmpresas(items).map(e=>e.cod).join(','), '2',
     'filtro padrão mostra somente REGULAR');
  eq(P.filtrarFrotaEmpresas(items,'canceladas').map(e=>e.cod).join(','), '10',
     'filtro canceladas mostra somente CANCELADO');
  eq(P.filtrarFrotaEmpresas(items,'todas').length, 4,
     'filtro todas inclui intervenção e situação ausente');
  eq(P.filtrarFrotaEmpresas(items,'todas','viacao agu').map(e=>e.cod).join(','), '2',
     'busca por nome ignora acento e caixa');
  eq(P.filtrarFrotaEmpresas(items,'todas','0').map(e=>e.cod).join(','), '10,20,30',
     'busca por RJ aceita correspondência parcial');
  eq(P.filtrarFrotaEmpresas(items,'ativas','beta').length, 0,
     'situação e pesquisa são combinadas');
  eq(P.filtrarFrotaEmpresas(items,'todas','inexistente').length, 0,
     'busca sem correspondência devolve lista vazia');
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

// --- pageBounds (paginação das listagens de linha, 25/página) ---
console.log('pageBounds');
{
  const b0 = P.pageBounds(0, 25, 1);
  ok(b0.totalPages===1 && b0.start===0 && b0.end===0 && b0.page===1, 'pageBounds total 0 → 1 página vazia');
  const b25 = P.pageBounds(25, 25, 1);
  ok(b25.totalPages===1 && b25.start===0 && b25.end===25, 'pageBounds exatamente 25 → 1 página cheia');
  const b26 = P.pageBounds(26, 25, 1);
  ok(b26.totalPages===2, 'pageBounds 26 linhas → 2 páginas');
  const b26p2 = P.pageBounds(26, 25, 2);
  ok(b26p2.start===25 && b26p2.end===26, 'pageBounds última página parcial (25→26)');
  const over = P.pageBounds(26, 25, 99);
  ok(over.page===2 && over.start===25, 'pageBounds page acima do total clampa na última');
  const under = P.pageBounds(60, 25, 0);
  ok(under.page===1 && under.start===0, 'pageBounds page 0/inválida clampa em 1');
  const mid = P.pageBounds(60, 25, 2);
  ok(mid.start===25 && mid.end===50, 'pageBounds página do meio → fatia [25,50)');
}

// --- beginGen / commitViewResult (seam do ciclo de vida da view) ---
console.log('beginGen');
{
  const v = {};
  eq(P.beginGen(v), 1, 'beginGen 1ª chamada → 1');
  eq(v._gen, 1, 'beginGen grava em view._gen');
  eq(P.beginGen(v), 2, 'beginGen 2ª chamada → 2 (incrementa)');
  const v2 = {};
  eq(P.beginGen(v2), 1, 'beginGen view independente começa do 1');
  eq(P.beginGen(null), null, 'beginGen sem view → null, não lança (modal pode já ter fechado)');
}

console.log('commitViewResult');
{
  const v = {};
  const gen = P.beginGen(v);
  const fn = () => 'pdf';
  ok(P.commitViewResult(v, gen, { pdfHTML: fn }) === true, 'commit com gen atual → true');
  ok(v.pdfHTML === fn, 'commit com gen atual → escreve pdfHTML');

  const staleGen = gen; // geração antiga: view avança sem essa tentativa saber
  P.beginGen(v);        // simula uma tentativa mais nova começando
  const staleFn = () => 'velho';
  ok(P.commitViewResult(v, staleGen, { pdfHTML: staleFn }) === false, 'commit com gen velho → false');
  ok(v.pdfHTML === fn, 'commit com gen velho → NÃO sobrescreve o resultado mais novo');

  const v2 = {};
  const gen2 = P.beginGen(v2);
  ok(P.commitViewResult(v2, gen2, { pdfHTML: null }) === true, 'commit pdfHTML:null (caso "vazio") → true');
  ok(v2.pdfHTML === null, 'commit pdfHTML:null → limpa');

  ok(P.commitViewResult(null, 1, { pdfHTML: fn }) === false, 'commit sem view → false, não lança');
}

console.log('isCurrentGen');
{
  const v = {};
  const gen = P.beginGen(v);
  ok(P.isCurrentGen(v, gen) === true, 'isCurrentGen com gen atual → true');
  P.beginGen(v);
  ok(P.isCurrentGen(v, gen) === false, 'isCurrentGen com gen velho → false');
  ok(P.isCurrentGen(null, 1) === false, 'isCurrentGen sem view → false, não lança');
  ok(P.isCurrentGen(v, null) === false, 'isCurrentGen com gen null (view fechada) → false');
}

console.log('pushDetail / popDetail');
{
  const v = { pdfHTML: () => 'lista' };
  const listaFn = v.pdfHTML;
  const detFn = () => 'detalhe';
  P.pushDetail(v, { pdfHTML: detFn });
  ok(v.pdfHTML === detFn, 'pushDetail troca pdfHTML pro do item aberto');
  ok(typeof v._detail === 'object' && v._detail.pdfHTML === listaFn, 'pushDetail guarda o pdfHTML da lista em _detail');

  P.popDetail(v);
  ok(v.pdfHTML === listaFn, 'popDetail restaura o pdfHTML da lista');
  ok(v._detail == null, 'popDetail limpa o slot _detail');

  const v2 = { pdfHTML: null };
  P.popDetail(v2); // sem detalhe aberto: no-op, não lança
  ok(v2.pdfHTML === null, 'popDetail sem detalhe aberto não altera pdfHTML');
}

console.log('openTabState (#52 — abrir aba / teto de 5)');
{
  const t1 = P.makeTab(1);
  const r = P.openTabState([t1], 1);
  eq(r.blocked, false, 'openTabState abre normalmente abaixo do teto');
  eq(r.tabs.length, 2, 'openTabState acrescenta 1 aba');
  eq(r.tabs[0], t1, 'openTabState não mexe nas abas existentes (mesma referência)');
  const novo = r.tabs[1];
  eq(novo.id, 2, 'openTabState novo id = tabIdSeq + 1');
  eq(novo.line, null, 'openTabState nova aba sem linha');
  eq(novo.view, null, 'openTabState nova aba sem view');
  eq(novo.navStack.length, 0, 'openTabState nova aba com histórico de Voltar vazio');
  eq(novo.stale, false, 'openTabState nova aba stale:false');
  eq(r.activeTabId, 2, 'openTabState ativa a aba recém-criada');
  eq(r.tabIdSeq, 2, 'openTabState avança tabIdSeq');

  // teto de MAX_TABS (5): a 6ª tentativa é bloqueada, nada muda
  const cinco = [1,2,3,4,5].map(P.makeTab);
  const bloqueado = P.openTabState(cinco, 5);
  eq(bloqueado.blocked, true, 'openTabState bloqueia na 6ª aba');
  eq(bloqueado.tabs, cinco, 'openTabState bloqueado devolve as mesmas 5 abas (não substitui nenhuma)');
  eq(bloqueado.tabs.length, 5, 'openTabState bloqueado não passa de MAX_TABS');
  eq(bloqueado.activeTabId, null, 'openTabState bloqueado não define aba ativa nova');
}

console.log('closeTabState (#52 — fechar aba / ativar vizinha / fechar modal)');
{
  const abas = () => [1,2,3].map(P.makeTab);

  // fechar aba inexistente: no-op
  {
    const t = abas();
    const r = P.closeTabState(t, 2, 99);
    eq(r.tabs, t, 'closeTabState id inexistente devolve as mesmas abas');
    eq(r.activeTabId, 2, 'closeTabState id inexistente não muda a aba ativa');
    eq(r.closedModal, false, 'closeTabState id inexistente não fecha o modal');
  }

  // fechar uma aba em 2º plano (não é a ativa): a ativa continua a mesma
  {
    const r = P.closeTabState(abas(), 2, 1);
    eq(r.tabs.map(t=>t.id).join(','), '2,3', 'closeTabState remove só a aba fechada');
    eq(r.activeTabId, 2, 'closeTabState fechar aba em 2º plano mantém a ativa');
    eq(r.closedModal, false, 'closeTabState com abas restantes não fecha o modal');
  }

  // fechar a aba ATIVA com vizinha à direita → ativa a da direita
  {
    const r = P.closeTabState(abas(), 2, 2);
    eq(r.tabs.map(t=>t.id).join(','), '1,3', 'closeTabState remove a aba ativa (meio)');
    eq(r.activeTabId, 3, 'closeTabState ativa a vizinha da DIREITA quando existe');
  }

  // fechar a aba ATIVA que é a ÚLTIMA da faixa (sem vizinha à direita) → ativa a da esquerda
  {
    const r = P.closeTabState(abas(), 3, 3);
    eq(r.tabs.map(t=>t.id).join(','), '1,2', 'closeTabState remove a última aba');
    eq(r.activeTabId, 2, 'closeTabState sem vizinha à direita ativa a da ESQUERDA');
  }

  // fechar a ÚNICA aba restante → fecha o modal inteiro
  {
    const t = [P.makeTab(7)];
    const r = P.closeTabState(t, 7, 7);
    eq(r.tabs.length, 0, 'closeTabState fechar a última aba esvazia tabs');
    eq(r.activeTabId, null, 'closeTabState fechar a última aba não deixa aba ativa');
    eq(r.closedModal, true, 'closeTabState fechar a última aba sinaliza closedModal');
  }
}

console.log('dispatchRealtime (#54 — recarrega a aba ativa, marca as de 2º plano)');
{
  const T = 'qh_teste';
  const view = (lineFilter=true) => ({ tables:[T,'tabela_vista_teste'], lineFilter });
  const aba = (id, line, lineFilter) => Object.assign(P.makeTab(id), { view: view(lineFilter), line });
  const ids = r => r.stale.join(',');

  // evento da linha da aba ATIVA → recarrega ela; a aba de 2º plano (outra linha) não é tocada
  {
    const abas = [aba(1, {codlinha:'101'}), aba(2, {codlinha:'202'})];
    const r = P.dispatchRealtime(abas, 1, T, {new:{codlinha:'101'}});
    eq(r.reload, 1, 'dr evento da linha ativa → recarrega a aba ativa');
    eq(ids(r), '', 'dr evento da linha ativa não marca a aba de 2º plano de outra linha');
  }

  // evento da linha de uma aba em SEGUNDO PLANO → só marca stale, sem recarregar nada
  {
    const abas = [aba(1, {codlinha:'101'}), aba(2, {codlinha:'202'})];
    const r = P.dispatchRealtime(abas, 1, T, {new:{codlinha:'202'}});
    eq(r.reload, null, 'dr evento de aba em 2º plano não recarrega (sem requisição de rede)');
    eq(ids(r), '2', 'dr evento de aba em 2º plano marca só ela como desatualizada');
  }

  // evento que bate em VÁRIAS abas ao mesmo tempo (mesma linha em 3 abas)
  {
    const abas = [aba(1, {codlinha:'101'}), aba(2, {codlinha:'101'}), aba(3, {codlinha:'101'})];
    const r = P.dispatchRealtime(abas, 2, T, {new:{codlinha:'101'}});
    eq(r.reload, 2, 'dr com várias abas casando recarrega a ativa');
    eq(ids(r), '1,3', 'dr com várias abas casando marca todas as de 2º plano');
  }

  // payload sem codlinha (não dá pra filtrar) → bate em todas as abas que leem a tabela
  {
    const abas = [aba(1, {codlinha:'101'}), aba(2, {codlinha:'202'})];
    const r = P.dispatchRealtime(abas, 1, T, {new:{}});
    eq(r.reload, 1, 'dr payload sem codlinha recarrega a ativa');
    eq(ids(r), '2', 'dr payload sem codlinha marca as demais');
  }

  // nenhuma aba casa (tabela que ninguém lê) → nada acontece
  {
    const abas = [aba(1, {codlinha:'101'}), aba(2, {codlinha:'202'})];
    const r = P.dispatchRealtime(abas, 1, 'localidades_teste', {new:{codlinha:'101'}});
    eq(r.reload, null, 'dr tabela que nenhuma aba lê não recarrega');
    eq(ids(r), '', 'dr tabela que nenhuma aba lê não marca ninguém');
  }

  // aba ativa em branco (sem view) + aba de 2º plano que casa → só a stale
  {
    const abas = [P.makeTab(1), aba(2, {codlinha:'202'})];
    const r = P.dispatchRealtime(abas, 1, T, {new:{codlinha:'202'}});
    eq(r.reload, null, 'dr aba ativa em branco não recarrega');
    eq(ids(r), '2', 'dr aba ativa em branco não impede de marcar a de 2º plano');
  }

  // modal fechado / estado vazio → no-op sem crash
  {
    const r = P.dispatchRealtime([], null, T, {new:{codlinha:'101'}});
    eq(r.reload, null, 'dr sem abas não recarrega');
    eq(ids(r), '', 'dr sem abas não marca ninguém');
    const r2 = P.dispatchRealtime(null, null, T, {new:{codlinha:'101'}});
    eq(r2.reload, null, 'dr tabs nulo não recarrega');
  }

  // uma aba já marcada como desatualizada continua marcada (idempotente)
  {
    const bg = aba(2, {codlinha:'202'}); bg.stale = true;
    const r = P.dispatchRealtime([aba(1, {codlinha:'101'}), bg], 1, T, {new:{codlinha:'202'}});
    eq(ids(r), '2', 'dr aba já desatualizada segue na lista (marcação idempotente)');
  }
}

console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
