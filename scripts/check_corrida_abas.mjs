// check_corrida_abas.mjs — a BANCADA DE CORRIDA entre abas do modal (navegador headless).
//
// O que ela guarda: o contrato `ctx = { view, gen, pane, host, line }`. Todo render/loader do
// modal recebe esse contexto no início da tentativa e escreve NELE — nunca em `currentView`/
// `activeLine`/`modalBody`, que apontam para a aba que está na tela AGORA. Sem isso, uma resposta
// que chega depois de o usuário trocar de aba pinta o documento na aba errada e sobrescreve o
// `pdfHTML` de um documento que não é o dela.
//
// Por que ela precisou existir: nenhum outro gate deste repo CRIA a ordenação que define o bug.
//   - check_views.mjs abre cada view numa página limpa, uma de cada vez;
//   - check_abas.mjs espera cada ação assentar (waitForTimeout) antes de trocar de aba;
//   - check_selecao_linha.mjs espera o pane parar de girar antes de seguir;
//   - e o stub do PostgREST respondia SÍNCRONO, sem atraso nenhum.
// Os três ficavam verdes enquanto um render atrasado pintava o pane errado. Aqui o stub segura a
// resposta (`segurar` em scripts/lib/rig.mjs) até a troca de aba ter acontecido, e só então
// libera — a ordenação passa a ser construída, não esperada.
//
// As três asserções, em cada ato:
//   (a) o pane da aba 2 NÃO foi pintado pelo trabalho atrasado da aba 1;
//   (b) o `pdfHTML` da aba 2 NÃO foi sobrescrito;
//   (c) o pane DA ABA 1 e o `pdfHTML` DELA recebem a resposta atrasada.
// A (c) não é decoração: sem ela, uma implementação que simplesmente DESCARTASSE toda resposta
// pós-troca-de-aba passaria em (a) e (b) e deixaria a aba 1 eternamente sem o seu resultado.
//
// Dois atos, porque são dois pontos de escrita diferentes:
//   ATO 1 — um RENDER de documento (Itinerários): cobre (a), (b) e (c).
//   ATO 2 — a CASCA de um loader (Ligações por Logradouro), que monta o painel de busca DEPOIS
//           de um await. Era o ponto que de fato sangrava antes do contexto explícito: o
//           `searchPanel` escrevia no `modalBody` ao vivo. Cobre (a) e (c).
//
// Uso:
//   node scripts/check_corrida_abas.mjs
// Servidor, fixtures e Chromium vêm de scripts/lib/rig.mjs. Sai 0 = tudo verde.

import { startServer, getChromium, launchPage, makeReporter } from './lib/rig.mjs';

const PORT = 8101;
// O título do documento de Itinerários — o que distingue o PDF dele de qualquer outro.
const MARCA_ITINERARIO = /Cadastro de Linhas: Itiner/i;
const server = await startServer(PORT);
const { falhas, check } = makeReporter();

// Um portão: as requisições que casam ficam presas até `liberar()`.
function portao(casa) {
  let liberar;
  const preso = new Promise(r => { liberar = r; });
  let presas = 0;
  return {
    segurar: (tabela, qs) => (casa(tabela, qs) ? (presas++, preso) : null),
    liberar: () => liberar(),
    get presas(){ return presas; },
  };
}

// Captura o HTML que o botão PDF montaria, sem abrir diálogo de impressão: o stub de
// `window.print` lê o container `.pdf-export` (que o baixarPdf acabou de criar) e dispara o
// `afterprint` que o próprio app.js escuta, para o cleanup rodar e o próximo clique não ser
// barrado pela trava de reentrância.
async function pdfDaAbaAtiva(page) {
  await page.evaluate(() => {
    window.__pdf = null;
    if (!window.__printStub) {
      window.__printStub = true;
      window.print = () => {
        const el = document.querySelector('.pdf-export');
        window.__pdf = el ? el.innerHTML : '';
        window.dispatchEvent(new Event('afterprint'));
      };
    }
  });
  await page.click('#btnPdf');
  await page.waitForFunction(() => window.__pdf !== null, null, { timeout: 15000 });
  return page.evaluate(() => window.__pdf);
}

// Abre uma aba nova pelo "+" e escolhe Portarias no seletor de documentos dela.
// Portarias é o vizinho ideal: não exige linha (nenhum acoplamento com a aba 1) e escreve
// `pdfHTML` próprio — sem isso a asserção (b) não teria o que proteger.
async function abrirPortariasEmAbaNova(page) {
  await page.click('#modalTabAdd');
  await page.waitForSelector('.modal-body.active #spHost', { timeout: 15000 });
  await page.click('.modal-body.active .card[data-view="portarias"]');
  await page.waitForSelector('.modal-body.active #pNum', { timeout: 15000 });
  await page.waitForSelector('.modal-body.active tbody tr', { timeout: 15000 });
}

/* ================================================================
   ATO 1 — render de documento (Itinerários)
   ================================================================ */
{
  const g = portao((tabela, qs) => tabela === 'itinerario_teste' && qs.includes('codlinha=eq.549000001'));
  const { browser, page } = await launchPage(getChromium(), { segurar: g.segurar });

  // aba 1: Itinerários da 549M — o fetch do itinerário fica PRESO no portão
  await page.goto(`http://127.0.0.1:${PORT}/#/linha/549000001/consulta/itinerarios`);
  await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
  await page.waitForSelector('.modal-body.active #spHost', { timeout: 15000 });
  check(g.presas > 0, 'ATO 1 · o portão prendeu o fetch do itinerário', `presas=${g.presas}`);
  check(await page.locator('.modal-body.active #itiResult').count() === 0,
    'ATO 1 · a aba 1 ainda NÃO tem o documento (a resposta está presa)');

  // aba 2: Portarias, aberta e concluída enquanto a aba 1 espera
  await abrirPortariasEmAbaNova(page);
  const pdfAba2Antes = await pdfDaAbaAtiva(page);
  // O marcador do documento de Itinerários é o TÍTULO dele, não a palavra "itinerário" solta: o
  // texto de uma das portarias da fixture fala em alteração de itinerário, e um teste que casasse
  // a palavra crua acusaria contaminação onde não há — falso vermelho é tão inútil quanto falso
  // verde.
  check(/portaria\(s\)/i.test(pdfAba2Antes) && !MARCA_ITINERARIO.test(pdfAba2Antes),
    'ATO 1 · a aba 2 tem o PDF dela antes da liberação', `${pdfAba2Antes.length}c`);

  // libera a resposta atrasada da aba 1 — a aba 2 é que está na tela
  g.liberar();
  await page.waitForTimeout(900);

  // (a) o pane da aba 2 não foi pintado pelo render da aba 1
  const aba2TemPortaria = await page.locator('.modal-body.active #pNum').count();
  const aba2TemItinerario = await page.locator('.modal-body.active #itiResult').count();
  check(aba2TemPortaria === 1 && aba2TemItinerario === 0,
    'ATO 1 · (a) o pane da aba 2 NÃO foi pintado pelo render da aba 1',
    `#pNum=${aba2TemPortaria} #itiResult=${aba2TemItinerario}`);

  // (b) o pdfHTML da aba 2 não foi sobrescrito
  const pdfAba2Depois = await pdfDaAbaAtiva(page);
  check(pdfAba2Depois === pdfAba2Antes && !MARCA_ITINERARIO.test(pdfAba2Depois),
    'ATO 1 · (b) o pdfHTML da aba 2 NÃO foi sobrescrito',
    `igual=${pdfAba2Depois === pdfAba2Antes}`);

  // (c) o pane DA ABA 1 e o pdfHTML DELA receberam a resposta atrasada
  await page.click('.modal-tab:first-child [data-select-tab]');
  await page.waitForTimeout(400);
  const linhasAba1 = await page.locator('.modal-body.active #itiResult tbody tr').count();
  check(linhasAba1 > 0, 'ATO 1 · (c) o pane da aba 1 recebeu a resposta atrasada',
    `linhas de itinerário=${linhasAba1}`);
  const pdfAba1 = await pdfDaAbaAtiva(page);
  check(MARCA_ITINERARIO.test(pdfAba1) && /TERMINAL MENEZES CORTES/i.test(pdfAba1),
    'ATO 1 · (c) o pdfHTML da aba 1 recebeu a resposta atrasada', `${pdfAba1.length}c`);

  await browser.close();
}

/* ================================================================
   ATO 2 — casca de loader que monta o painel DEPOIS de um await
   ================================================================ */
{
  // `getIbge()` (municipio_teste) é o await que o loader de Ligações por Logradouro faz ANTES de
  // montar o painel de busca. Página nova = cache de lookup vazio, então ele é um fetch de
  // verdade e o portão o alcança.
  const g = portao(tabela => tabela === 'municipio_teste');
  const { browser, page } = await launchPage(getChromium(), { segurar: g.segurar });

  await page.goto(`http://127.0.0.1:${PORT}/#/consulta/ligacoesPorLogradouro`);
  await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
  check(g.presas > 0, 'ATO 2 · o portão prendeu o lookup de municípios', `presas=${g.presas}`);

  await abrirPortariasEmAbaNova(page);
  const pdfAba2Antes = await pdfDaAbaAtiva(page);

  g.liberar();
  await page.waitForTimeout(900);

  // (a) a casca atrasada da aba 1 não pode ter montado o painel de busca sobre a aba 2
  const aba2TemPortaria = await page.locator('.modal-body.active #pNum').count();
  const aba2TemPainel = await page.locator('.modal-body.active #spInput').count();
  check(aba2TemPortaria === 1 && aba2TemPainel === 0,
    'ATO 2 · (a) o painel atrasado da aba 1 NÃO foi montado no pane da aba 2',
    `#pNum=${aba2TemPortaria} #spInput=${aba2TemPainel}`);
  const pdfAba2Depois = await pdfDaAbaAtiva(page);
  check(pdfAba2Depois === pdfAba2Antes,
    'ATO 2 · (b) o pdfHTML da aba 2 NÃO foi sobrescrito');

  // (c) o painel foi parar no pane da aba 1, que é quem o pediu
  await page.click('.modal-tab:first-child [data-select-tab]');
  await page.waitForTimeout(400);
  const aba1TemPainel = await page.locator('.modal-body.active #spInput').count();
  const tituloAba1 = (await page.textContent('#mtTitle')) || '';
  check(aba1TemPainel === 1 && /Logradouro/i.test(tituloAba1),
    'ATO 2 · (c) o pane da aba 1 recebeu o painel de busca', `título="${tituloAba1.trim()}"`);

  await browser.close();
}

server.close();
console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nCorrida entre abas OK.');
process.exit(falhas.length ? 1 : 0);
