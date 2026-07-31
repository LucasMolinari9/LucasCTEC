// check_selecao_linha.mjs — Checagem de REGRESSÃO do "clicar na linha seleciona a linha"
// (navegador headless).
//
// Guarda dois conserto do card "Linhas por Localidade e Município":
//
// 1. SELEÇÃO APAGADA PELO history.back(). `bindLineRows` faz `selectLine(...)` e logo
//    `closeModal()`. O selectLine grava a linha nova por replaceState — na entrada de
//    histórico DO MODAL. O closeModal então dava `history.back()` para desfazer a entrada
//    criada na abertura, voltando para a entrada PRÉ-modal, que não conhece essa linha; o
//    `hashchange` chamava applyRoute e, sem `linha/` no hash, ela rodava `setActiveLine(null)`.
//    Resultado: abrindo um card que NÃO exige linha (Localidades, Ligações por Logradouro,
//    Município e Região…), clicar num resultado não selecionava nada — o usuário não
//    conseguia levar a linha para os outros cards. Com uma linha já ativa era pior de ver: a
//    seleção revertia em silêncio para a linha ANTIGA.
//
// 2. FILTRO DE SITUAÇÃO AUSENTE. O resultado do Localidades (renderLocalidadeSecoes) era o
//    único que listava linha sem a barra Todas/Ativas/Canceladas — e o cadastro real tem ~500
//    linhas canceladas misturadas no meio.
//
// Por que aqui e não em tests/: os dois são de DOM/histórico do navegador — só um navegador
// os reproduz, e tests/check.js é offline e sem dependências, de propósito. Mesmo contrato do
// check_abas.mjs. A regra PURA do filtro (filtrarSituacao) tem teste unitário em tests/.
//
// Uso:
//   node scripts/check_selecao_linha.mjs
//
// Servidor, fixtures do PostgREST e Chromium vêm de scripts/lib/rig.mjs. Sai 0 = tudo verde.

import { startServer, getChromium, launchPage, makeReporter } from './lib/rig.mjs';

const PORT = 8100;
const server = await startServer(PORT);
const { browser, page } = await launchPage(getChromium());
const { falhas, check } = makeReporter();

const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + e.message));

// `fmtLineName` troca espaço por &nbsp; (U+00A0) no nome da linha: comparar com espaço comum
// direto no innerText dá falso vermelho — a tela está certa e a asserção é que está errada.
const textoDoHost = () => page.evaluate(() =>
  (document.querySelector('.modal-body.active #locHost')?.innerText || '').replace(/ /g, ' '));

const estado = () => page.evaluate(() => ({
  banner: !document.querySelector('#lineBanner').classList.contains('is-hidden'),
  bannerTxt: (document.querySelector('#lineBanner').innerText || '').trim().split('\n')[0],
  chip: (document.querySelector('.card.needs-line .need-chip')?.textContent || '').trim(),
  hash: location.hash,
}));

/* Caminho do USUÁRIO: entra na home SEM linha ativa e abre o card pelo clique — é isso que
   empurra a entrada de histórico. Entrar por deep link (#/consulta/…) NÃO reproduz o bug,
   porque a abertura pela própria rota não empurra entrada nenhuma. */
async function abrirLocalidadesEBuscar(termo) {
  await page.goto('about:blank');
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('.card[data-view]');
  await page.evaluate(() => { location.hash = '#/topico/lig'; });
  await page.waitForSelector('.card[data-view="localidades"]');
  await page.click('.card[data-view="localidades"]');
  await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
  await page.waitForSelector('.modal-body.active #locGo');
  await page.fill('.modal-body.active #locA', termo);
  await page.click('.modal-body.active #locGo');
  await page.waitForFunction(() => {
    const h = document.querySelector('.modal-body.active #locHost');
    return h && !h.querySelector('.spin') && h.innerText.trim().length > 20;
  }, null, { timeout: 20000 });
}

await abrirLocalidadesEBuscar('NITEROI');

// --- 1. a barra de situação existe e FILTRA ---
const temBarra = await page.locator('.modal-body.active #locHost #lrStatus').count();
check(temBarra > 0, 'resultado por localidade tem a barra de situação (Todas/Ativas/Canceladas)');

const todas = await textoDoHost();
check(/NITEROI X SAO GONCALO/i.test(todas) && /RIO DE JANEIRO X NITEROI/i.test(todas),
  'busca traz a linha ativa E a cancelada quando o filtro é "Todas"');

if (temBarra) {
  const comFiltro = async v => {
    await page.selectOption('.modal-body.active #lrStatus', v);
    await page.waitForTimeout(200);
    return { txt: await textoDoHost(), clicaveis: await page.locator('.modal-body.active #locHost [data-row]').count() };
  };
  const ativas = await comFiltro('ativas');
  check(/RIO DE JANEIRO X NITEROI/i.test(ativas.txt) && !/SAO GONCALO/i.test(ativas.txt),
    '"Ativas" esconde a linha cancelada');
  const canceladas = await comFiltro('canceladas');
  check(/SAO GONCALO/i.test(canceladas.txt) && !/RIO DE JANEIRO X NITEROI/i.test(canceladas.txt),
    '"Canceladas" mostra só a linha cancelada');
  // REGRESSÃO: repintar o resultado tem que refazer o bindLineRows — filtrar não pode
  // transformar as linhas em texto morto.
  check(ativas.clicaveis > 0 && canceladas.clicaveis > 0,
    'linhas seguem clicáveis depois de filtrar', `ativas=${ativas.clicaveis} canceladas=${canceladas.clicaveis}`);
  await comFiltro('todas');
}

// --- 2. REGRESSÃO PRINCIPAL: clicar na linha a deixa selecionada ---
// Sem linha clicável não há o que checar — reportar isso é melhor que estourar um timeout de
// clique, que não diz qual é o defeito.
const clicaveis = await page.locator('.modal-body.active #locHost [data-row]').count();
check(clicaveis > 0, 'resultado tem linha clicável', `${clicaveis} elemento(s) [data-row]`);
if (clicaveis) {
  await page.click('.modal-body.active #locHost [data-row]');
  await page.waitForTimeout(1000);   // history.back()/hashchange/applyRoute são assíncronos
  const dep = await estado();
  check(dep.banner, 'clicar numa linha do resultado a deixa SELECIONADA (banner visível)',
    dep.banner ? dep.bannerTxt : `banner escondido · hash "${dep.hash}"`);
  check(/^Linha /.test(dep.chip), 'a linha selecionada fica disponível para os cards que a exigem',
    dep.chip || '(sem chip)');
  check(/linha\//.test(dep.hash), 'o hash conserva a linha selecionada (deep link continua válido)', dep.hash);
}

// --- 3. o conserto não pode ter quebrado o "Voltar fecha o modal" ---
// Sem trocar de linha, fechar pelo X ainda desfaz a entrada criada na abertura: uma única
// ida ao Voltar do navegador tem que sair do estado do modal, não empilhar entradas.
await page.goto('about:blank');
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.waitForSelector('.card[data-view]');
await page.evaluate(() => { location.hash = '#/topico/lig'; });
await page.waitForSelector('.card[data-view="localidades"]');
const hashAntes = await page.evaluate(() => location.hash);
await page.click('.card[data-view="localidades"]');
await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
await page.click('#modalClose');
await page.waitForTimeout(600);
const hashDepois = await page.evaluate(() => location.hash);
check(hashDepois === hashAntes,
  'fechar sem trocar de linha volta ao hash de antes (não empilha histórico)',
  `antes="${hashAntes}" depois="${hashDepois}"`);

// --- 4. Voltar do navegador ainda fecha o modal ---
await page.click('.card[data-view="localidades"]');
await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
await page.goBack();
await page.waitForTimeout(600);
const aindaAberto = await page.locator('#modalOverlay.open').count();
check(aindaAberto === 0, 'Voltar do navegador continua fechando o modal');

if (erros.length) check(false, 'sem erro de página', erros.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(falhas.length
  ? `\n${falhas.length} checagem(ns) com problema: ${falhas.join(', ')}`
  : '\nSeleção de linha e filtro de situação OK.');
process.exit(falhas.length ? 1 : 0);
