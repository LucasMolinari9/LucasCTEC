// check_abas.mjs — Checagem de REGRESSÃO das abas do modal (navegador headless).
//
// Guarda o conserto do bug "aba nova é beco sem saída": o pane da aba em branco (o "+")
// mandava escolher o documento "no painel lateral", mas o painel vive no `#app` e o
// `.modal-overlay` (position:fixed; inset:0; z-index:1000) cobre a tela inteira enquanto o
// modal está aberto — nenhum clique chegava lá. Pelo mesmo motivo não dava pra ter dois
// assuntos (Quadro de Horários + Portarias) em abas diferentes. Hoje o seletor de documentos
// mora DENTRO do pane (renderTabChooser em app.js).
//
// Por que aqui e não em tests/: o bug é de DOM/interação — só um navegador o reproduz, e
// tests/check.js é offline e sem dependências, de propósito. Este script segue o mesmo
// contrato manual do check_realtime.mjs: roda sob demanda, fora do CI.
//
// Uso:
//   node scripts/check_abas.mjs
//
// Requer Playwright + Chromium instalados (global ou local): `npm i -g playwright && npx playwright install chromium`.
// NÃO fala com o Supabase: o PostgREST é stubado no browser com fixtures mínimas, o que deixa
// a checagem determinística (e roda em ambiente sem acesso ao banco). Sai 0 = tudo verde.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8099;

// Playwright pode estar instalado local ou globalmente — tenta os dois antes de desistir.
const req = createRequire(import.meta.url);
let chromium;
try {
  let mod;
  try { mod = req('playwright'); }
  catch {
    const globalRoot = req('node:child_process').execSync('npm root -g', { encoding:'utf8' }).trim();
    mod = req(path.join(globalRoot, 'playwright'));
  }
  chromium = mod.chromium;
} catch {
  console.error('Playwright não encontrado. Instale com: npm i -g playwright && npx playwright install chromium');
  process.exit(2);
}

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
  '.woff2':'font/woff2', '.webmanifest':'application/manifest+json', '.json':'application/json' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ---- fixtures mínimas do PostgREST (2 linhas, 2 empresas, 1 horário cada) ---- */
const linha = (codlinha, numero_ligacao, nome_ligacao, codempresa, via) => ({
  codlinha, numero_ligacao, nome_ligacao, nome_lig_cresc:null, via, codempresa,
  tipo:'REGULAR', caracteristica:'CONVENCIONAL', licitado:null, cancelado:null, paralisado:null,
  sub_judice:null, transferido:null, data_criacao:null, processo_criacao:null,
});
const LINES = [
  linha('549000001', '549M', 'RIO DE JANEIRO X NITEROI', '101', 'PONTE'),
  linha('740000001', '740D', 'PETROPOLIS X TERESOPOLIS', '102', 'BR-495'),
];
const EMPRESAS = [
  { codempresa:'101', nome_empresa:'VIACAO ALFA', situacao:'REGULAR', cassada:false, sob_intervencao:false },
  { codempresa:'102', nome_empresa:'VIACAO BETA', situacao:'REGULAR', cassada:false, sob_intervencao:false },
];
const QH_INTERVALO = [
  { codlinha:'549000001', cod_origem:'1', dia:'UTEIS', hora_inicio:'05:00', hora_fim:'23:00', intervalo:'30' },
  { codlinha:'740000001', cod_origem:'2', dia:'UTEIS', hora_inicio:'06:00', hora_fim:'20:00', intervalo:'60' },
];
const ORIGEM = [{ cod_origem:'1', nome_origem:'RIO DE JANEIRO' }, { cod_origem:'2', nome_origem:'PETROPOLIS' }];

function serve(table, qs) {
  const params = new URLSearchParams(qs);
  const eqCod = (qs.match(/codlinha=eq\.([^&]+)/) || [])[1];
  const filtra = rows => eqCod ? rows.filter(r => r.codlinha === decodeURIComponent(eqCod)) : rows;
  if (table === 'tabela_vista_teste') {
    const or = params.get('or');
    if (or) {
      const termo = ((or.match(/nome_ligacao\.ilike\.\*([^*]*)\*/) || [])[1] || '').toLowerCase();
      return LINES.filter(l => [l.nome_ligacao, l.numero_ligacao, l.codlinha]
        .some(v => String(v).toLowerCase().includes(termo)));
    }
    return filtra(LINES);
  }
  if (table === 'codempresa_teste')   return EMPRESAS;
  if (table === 'qh_intervalo_teste') return filtra(QH_INTERVALO);
  if (table === 'origem_teste')       return ORIGEM;
  return [];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.route('**/rest/v1/**', route => {
  const u = new URL(route.request().url());
  route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(serve(u.pathname.split('/rest/v1/')[1], u.search.slice(1))) });
});

const falhas = [];
const check = (ok, nome, detalhe = '') => {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
  if (!ok) falhas.push(nome);
};

// 1. deep link abre o Quadro de Horários da 549M na 1ª aba
await page.goto(`http://127.0.0.1:${PORT}/#/linha/549000001/consulta/quadroHorarios`);
await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
await page.waitForSelector('.modal-body.active .doc', { timeout: 15000 });
check(/Quadro/i.test(await page.textContent('#mtTitle')), 'aba 1 abre o Quadro de Horários');

// 2. "+" → aba nova; a busca resolve a 2ª linha
await page.click('#modalTabAdd');
await page.waitForSelector('.modal-body.active #spInput');
await page.fill('.modal-body.active #spInput', '740d');
await page.click('.modal-body.active #spBtn');
await page.waitForTimeout(600);
const rotuloNova = (await page.textContent('.modal-tab.active')) || '';
check(/740D/i.test(rotuloNova), 'aba nova resolve a linha 740D', `rótulo="${rotuloNova.trim().split('\n')[0]}"`);

// 3. REGRESSÃO: o seletor de documentos tem que estar DENTRO do pane da aba nova
const temSeletor = await page.locator('.modal-body.active .card[data-view="quadroHorarios"]').count();
check(temSeletor > 0, 'aba nova mostra o seletor de documentos dentro do pane');

if (temSeletor) {
  // 4. escolher o documento preenche ESTA aba (não a outra) e renderiza o documento
  await page.click('.modal-body.active .card[data-view="quadroHorarios"]');
  await page.waitForTimeout(800);
  const tabelas = await page.locator('.modal-body.active table').count();
  check(/Quadro/i.test(await page.textContent('#mtTitle')) && tabelas > 0,
    'escolher Quadro de Horários na aba nova abre o documento da 740D', `tabelas=${tabelas}`);
  const abas = await page.$$eval('.modal-tab', els => els.map(e => e.textContent.trim().split('\n')[0]));
  check(abas.filter(t => /Quadro/i.test(t)).length === 2 && abas.some(t => /740D/.test(t)),
    'mesma consulta, linhas diferentes, uma por aba', `abas=${JSON.stringify(abas)}`);
}

// 5. REGRESSÃO: dois ASSUNTOS diferentes ao mesmo tempo — Portarias não exige linha e
//    precisa ser alcançável do seletor sem fechar o modal
await page.click('#modalTabAdd');
await page.waitForSelector('.modal-body.active #spHost');
const cardPortaria = page.locator('.modal-body.active .card[data-view="portarias"]');
if (await cardPortaria.count()) {
  await cardPortaria.click();
  await page.waitForTimeout(800);
  const abas = await page.$$eval('.modal-tab', els => els.map(e => e.textContent.trim().split('\n')[0]));
  check(abas.some(t => /Portaria/i.test(t)) && abas.some(t => /Quadro/i.test(t)),
    'Quadro de Horários e Portarias abertos em abas diferentes', `abas=${JSON.stringify(abas)}`);
} else {
  check(false, 'seletor da aba alcança Portarias (card que não exige linha)');
}

await browser.close();
server.close();

console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nAbas OK.');
process.exit(falhas.length ? 1 : 0);
