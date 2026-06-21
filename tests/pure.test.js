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

// --- orDash ---
console.log('orDash');
eq(P.orDash(''),        '—', 'orDash vazio → travessão');
eq(P.orDash(null),      '—', 'orDash null → travessão');
eq(P.orDash(undefined), '—', 'orDash undefined → travessão');
eq(P.orDash(0),         0,   'orDash 0 preservado (não vira travessão)');
eq(P.orDash('x'),       'x', 'orDash valor');

// --- boolChip ---
console.log('boolChip');
ok(P.boolChip(true,'X').includes('chip-on') && P.boolChip(true,'X').includes('X'), 'boolChip true → chip');
eq(P.boolChip(false,'X'), '', 'boolChip false → vazio');

// --- norm ---
console.log('norm');
eq(P.norm('Niterói '),    'niteroi',     'norm acento + caixa + trim');
eq(P.norm('SÃO GONÇALO'), 'sao goncalo', 'norm maiúsculas + cedilha');
eq(P.norm(P.norm('Açaí')), P.norm('Açaí'), 'norm idempotente');
eq(P.norm(null),          '',            'norm null');

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
  ok(P.matchEvent(r, {text:'', proc:'', ano:2021}),               'matchEvent ano casa a publicação');
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

console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
