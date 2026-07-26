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
// Servidor, fixtures do PostgREST e Chromium vêm de scripts/lib/rig.mjs (definição única,
// compartilhada com check_views.mjs). Sai 0 = tudo verde.

import { startServer, getChromium, launchPage, makeReporter } from './lib/rig.mjs';

const PORT = 8099;
const server = await startServer(PORT);
const { browser, page } = await launchPage(getChromium());
const { falhas, check } = makeReporter();

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
