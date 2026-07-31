// check_selecao_linha.mjs — Checagem de REGRESSÃO do "clicar na linha seleciona a linha"
// (navegador headless).
//
// Guarda três consertos do card "Linhas por Localidade e Município":
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
// 3. LISTA SEM PAGINAÇÃO. Os dois blocos despejavam tudo no DOM de uma vez — até 400 linhas,
//    cada uma com sua tabela de seções — enquanto as demais listas do portal paginam a
//    25/página. Paginado, o `pdfHTML` passou a ser obrigatório: sem ele o fallback do
//    `baixarPdf` exportaria só a página aberta. As checagens cobrem as duas metades (a tela
//    pagina, o PDF sai inteiro).
//
// Por que aqui e não em tests/: os três são de DOM/histórico do navegador — só um navegador
// os reproduz, e tests/check.js é offline e sem dependências, de propósito. Mesmo contrato do
// check_abas.mjs. A regra PURA do filtro (filtrarSituacao) tem teste unitário em tests/.
//
// Uso:
//   node scripts/check_selecao_linha.mjs
//
// Servidor, fixtures do PostgREST e Chromium vêm de scripts/lib/rig.mjs. Sai 0 = tudo verde.

import { startServer, getChromium, launchPage, makeReporter, FIXTURES } from './lib/rig.mjs';

/* Fixtures EXTRAS, locais a este processo (o rig é um módulo; mutá-lo aqui não vaza para os
   outros gates). Existem para exercitar a PAGINAÇÃO: o rig compartilhado tem 3 linhas de
   propósito — enxuto o bastante para as outras checagens lerem — e com 3 linhas nenhum
   paginador aparece. Estas 30 casam um termo próprio ("ALDEIA") e têm seção de tarifa, então
   caem todas no bloco "com seção", que é o paginador escrito à mão deste documento. */
const EXTRAS = 30;
for (let i = 1; i <= EXTRAS; i++) {
  const cod = `88800${String(i).padStart(4, '0')}`;
  FIXTURES.tabela_vista_teste.push({
    codlinha: cod, numero_ligacao: `88${i}A`, nome_ligacao: `ALDEIA X DESTINO ${i}`,
    nome_lig_cresc: `DESTINO ${i} X ALDEIA`, via: 'ESTRADA DA ALDEIA', codempresa: '101',
    tipo: 'REGULAR', caracteristica: 'CONVENCIONAL', licitado: null,
    cancelado: null, paralisado: null, sub_judice: null, transferido: null,
    data_criacao: '2001-05-10', processo_criacao: 'E-10/001/2001',
  });
  FIXTURES.tarifa_atual_teste.push({
    codlinha: cod, codempresa: '101', secao: 1, numero_linha: `88${i}A`,
    nome_ligacao: `ALDEIA X DESTINO ${i}`, nome_ligacao_cresc: `DESTINO ${i} X ALDEIA`,
    via: 'ESTRADA DA ALDEIA', caracteristica: 'CONVENCIONAL', tipo_ligacao: 'INTERMUNICIPAL',
    rm: 'NAO', tarifa: 5.5, piso_i: null, situacao: 'REGULAR',
    cancelado: null, paralisado: null, sub_judice: null, transferido: null,
    data_criacao: '2001-05-10', data_cancelamento: null, data_paralisacao: null,
    data_sub_judice: null, data_transferencia: null,
  });
}

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
  // O chip "Linha X" só existe no card que EXIGE linha — e ele não mora no tópico onde a busca
  // começou. A checagem entra no tópico dono desses cards (clicando na sidebar, como o usuário
  // faria: trocar de tópico por `location.hash` à mão passaria por uma rota sem `linha/` e
  // apagaria justamente a seleção que estamos conferindo). Se um dia o card needs-line mudar de
  // tópico de novo, é este seletor que muda — o resto da asserção segue valendo.
  await page.click('.topic-btn[data-topic="doc"]');
  await page.waitForSelector('.card.needs-line .need-chip');
  const { chip } = await estado();
  check(/^Linha /.test(chip), 'a linha selecionada fica disponível para os cards que a exigem',
    chip || '(sem chip)');
  check(/linha\//.test(dep.hash), 'o hash conserva a linha selecionada (deep link continua válido)', dep.hash);
}

// --- 3. PAGINAÇÃO: 25/página nos dois blocos, como as demais listas de linha ---
await abrirLocalidadesEBuscar('ALDEIA');
const pager = await page.locator('.modal-body.active #locComSecao .doc-pager').count();
check(pager > 0, 'bloco "com seção" pagina quando passa de 25 linhas');

if (pager) {
  const naPagina = () => page.locator('.modal-body.active #locComSecao .loc-linha-sec').count();
  const p1 = await naPagina();
  check(p1 === 25, 'página 1 mostra 25 linhas', `${p1} linha(s)`);
  const info1 = await page.textContent('.modal-body.active #locComSecao .pg-info');
  check(/de 2\b/.test(info1 || '') && new RegExp(`${EXTRAS} linhas`).test(info1 || ''),
    'o rodapé conta o total, não a página', (info1 || '').trim());

  await page.click('.modal-body.active #locComSecao [data-pg="next"]');
  await page.waitForTimeout(200);
  const p2 = await naPagina();
  check(p2 === EXTRAS - 25, 'página 2 mostra o resto', `${p2} linha(s)`);
  // REGRESSÃO: `afterPaint: bindLineRows` — trocar de página não pode matar o clique.
  const clicaveisP2 = await page.locator('.modal-body.active #locComSecao [data-row]').count();
  check(clicaveisP2 === p2, 'linhas da página 2 continuam clicáveis', `${clicaveisP2} clicável(is)`);

  // REGRESSÃO: paginação é SÓ de tela — o PDF sai INTEIRO (pdfHTML escrito pelo seam).
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#btnPdf');
  await page.waitForTimeout(400);
  const noPdf = await page.locator('.pdf-export .loc-linha-sec').count();
  check(noPdf === EXTRAS, 'o PDF sai com todas as linhas, não só a página aberta',
    `${noPdf} de ${EXTRAS} no .pdf-export`);
}

// --- 4. o conserto não pode ter quebrado o "Voltar fecha o modal" ---
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

// --- 5. Voltar do navegador ainda fecha o modal ---
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
