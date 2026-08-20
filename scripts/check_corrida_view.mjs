// check_corrida_view.mjs — BANCADA DE CORRIDA do seam do ciclo de vida da view.
//
// Guarda o que `beginGen`/`isCurrentGen`/`commitViewResult` (src/domain/view-state.mjs) existem
// para impedir: uma resposta ATRASADA de uma aba escrever no pane e no `pdfHTML` da aba que está
// em foco AGORA. O sintoma registrado no CLAUDE.md é "digitar 101, trocar pra 202 antes da 1ª
// resposta voltar → o PDF sai da linha errada", e ele é invisível: nada estoura, nada fica
// vermelho, o documento só está errado.
//
// POR QUE ESTA BANCADA PRECISOU EXISTIR. O seam nasceu de raciocínio, não de teste, e nenhum dos
// três gates de navegador deste repo consegue sequer CRIAR a ordenação que define o bug — as
// citações abaixo são cobradas pelo tests/check.js §[2b], então envelhecem em vermelho, não em
// silêncio:
//   - o check_views.mjs abre cada view numa página limpa e em sequência:
//     `about:blank` (`scripts/check_views.mjs:149`), dentro do laço de `alvo` (`:142`);
//   - o check_abas.mjs dá `waitForTimeout` (`scripts/check_abas.mjs:38`) depois de cada ação, ou
//     seja, espera a requisição assentar antes de trocar de aba;
//   - o check_selecao_linha.mjs espera o pane parar de girar antes de seguir:
//     `waitForFunction` (`scripts/check_selecao_linha.mjs:97`–`:100`), que exige `.spin` ausente.
// E o stub do PostgREST respondia na hora, sem atraso nenhum. Os três podiam ficar verdes com o
// seam quebrado. A trava de rede que este arquivo usa — `criarControleDeRede`
// (`scripts/lib/rig.mjs:304`) — foi acrescentada junto com ele, para fechar esse buraco.
//
// AS TRÊS ASSERÇÕES, e por que a terceira não é opcional. Com o render da aba 1 preso e a aba 2
// em foco, exige-se:
//   (a) o pane da aba 2 NÃO foi pintado pelo render da aba 1;
//   (b) o pdfHTML da aba 2 NÃO foi sobrescrito;
//   (c) o pane da aba 1 E o pdfHTML DELA recebem a resposta atrasada.
// Sem (c), a bancada aprovaria uma implementação que simplesmente DESCARTA toda resposta que
// chegue depois de uma troca de aba — a aba 1 ficaria eternamente sem o resultado que pediu, e
// o gate diria que está tudo bem.
//
// O pdfHTML não é lido por dentro: ele mora no IIFE e não vai para `window`. A bancada clica o
// botão de PDF com a aba em foco e captura o container `.pdf-export` que o `baixarPdf` monta,
// substituindo `window.print`. É a consequência observável — a mesma que o usuário vê.
//
// CONDIÇÃO DE APOSENTADORIA: esta bancada é do CONTRATO, não da implementação de hoje. Ela
// sobrevive à Fase A do plano de modularização (documentos passando a receber `ctx` em vez de
// lerem `currentView`) e é o que prova que a fase não regrediu. Só se aposenta se o modelo de
// abas com panes simultâneos deixar de existir.
//
// Uso:
//   node scripts/check_corrida_view.mjs
// Sai 0 = verde. Servidor, fixtures e Chromium vêm de scripts/lib/rig.mjs.

import { startServer, getChromium, launchPage, makeReporter, criarControleDeRede } from './lib/rig.mjs';

const PORT = 8101;
const A = { cod: '549000001', fmt: '549-000-001', numero: '549M', itinerario: 'MENEZES CORTES' };
const B = { cod: '740000001', fmt: '740-000-001', numero: '740D', itinerario: 'BR-495' };

const server = await startServer(PORT);
const rede = criarControleDeRede();
const { browser, page } = await launchPage(getChromium(), { rede });
const { falhas, check } = makeReporter();

// `window.print` vira captura: o baixarPdf monta o documento completo em `.pdf-export` logo
// antes de imprimir, então é ali que o pdfHTML da view em foco fica observável. O 'afterprint'
// disparado à mão deixa o cleanup do app.js rodar normalmente (ele remove o container).
await page.addInitScript(() => {
  window.__pdf = null;
  window.print = () => {
    const el = document.querySelector('.pdf-export');
    window.__pdf = el ? el.innerHTML : null;
    window.dispatchEvent(new Event('afterprint'));
  };
});

const paneHTML = id => page.evaluate(i => (document.getElementById(`pane-${i}`) || {}).innerHTML || '', id);
const trocarPara = async id => {
  await page.click(`.modal-tab [data-select-tab="${id}"], [data-select-tab="${id}"]`);
  await page.waitForSelector(`#pane-${id}.active`, { timeout: 10000 });
};
async function pdfDaAbaEmFoco() {
  await page.evaluate(() => { window.__pdf = null; });
  await page.click('#btnPdf');
  await page.waitForFunction(() => window.__pdf !== null, null, { timeout: 15000 });
  return page.evaluate(() => window.__pdf);
}

try {
  // ---- montagem: aba 1 = Itinerários da linha A; aba 2 = Frota (outra tabela, outro documento)
  await page.goto(`http://127.0.0.1:${PORT}/#/linha/${A.cod}/consulta/itinerarios`);
  await page.waitForSelector('#modalOverlay.open', { timeout: 15000 });
  await page.waitForFunction(t => (document.getElementById('pane-1') || {}).innerHTML?.includes(t),
    A.itinerario, { timeout: 15000 });
  check(true, `aba 1 abre os Itinerários da linha ${A.fmt}`);

  // aba nova nasce EM BRANCO (openTabState/makeTab dão line:null), então o documento dela só
  // aparece depois de a busca do próprio pane resolver a linha — não basta clicar no card.
  await page.click('#modalTabAdd');
  await page.waitForSelector('.modal-body.active .card[data-view="frota"]', { timeout: 10000 });
  await page.click('.modal-body.active .card[data-view="frota"]');
  await page.waitForSelector('.modal-body.active #spInput', { timeout: 10000 });
  await page.fill('.modal-body.active #spInput', A.numero);
  await page.click('.modal-body.active #spBtn');
  await page.waitForFunction(() => (document.getElementById('pane-2') || {}).innerHTML?.includes('Hierarquia'),
    null, { timeout: 15000 });
  check(true, `aba 2 abre a Frota da linha ${A.fmt} (documento e tabela diferentes da aba 1)`);

  // ---- a corrida: aba 1 dispara um render que fica PRESO, e o foco vai para a aba 2
  await trocarPara(1);
  rede.segurar('itinerario_teste');
  await page.fill('.modal-body.active #spInput', B.numero);
  await page.click('.modal-body.active #spBtn');
  await rede.esperarPresos(1);                    // o fetch saiu de verdade — só então trocamos
  check(true, `render da linha ${B.numero} disparado na aba 1 e preso na rede`);

  await trocarPara(2);
  const pane2Antes = await paneHTML(2);
  const pdf2Antes = await pdfDaAbaEmFoco();
  rede.soltar();

  // Espera a resposta atrasada ATERRISSAR — no pane certo OU no errado. Esperar só pelo certo
  // faz um render que escreve no pane ativo falhar por timeout genérico, sem dizer onde ele foi
  // parar; assim quem discrimina são as asserções (a) e (c), que nomeiam o defeito.
  await page.waitForFunction(t => ['pane-1', 'pane-2']
    .some(id => (document.getElementById(id) || {}).innerHTML?.includes(t)),
    B.itinerario, { timeout: 15000 });

  // ---- (a) o pane da aba 2 não foi pintado pelo render da aba 1
  const pane2Depois = await paneHTML(2);
  check(!pane2Depois.includes(B.itinerario) && !pane2Depois.includes(B.fmt),
    '(a) o pane da aba 2 NÃO recebeu o render atrasado da aba 1');
  check(pane2Depois.includes('Hierarquia') && pane2Depois === pane2Antes,
    '(a2) o pane da aba 2 continua exatamente a Frota que ele mesmo carregou');

  // ---- (b) o pdfHTML da aba 2 não foi sobrescrito
  const pdf2Depois = await pdfDaAbaEmFoco();
  check(/Frota da Linha/.test(pdf2Depois) && !/Itiner/.test(pdf2Depois),
    '(b) o PDF da aba 2 continua sendo a Frota dela');
  check(pdf2Depois === pdf2Antes, '(b2) o PDF da aba 2 é byte a byte o de antes da resposta atrasada');

  // ---- (c) a aba 1 RECEBE o resultado que pediu — pane e PDF
  const pane1 = await paneHTML(1);
  check(pane1.includes(B.itinerario) && pane1.includes(B.fmt) && !pane1.includes(A.itinerario),
    `(c) o pane da aba 1 recebeu os Itinerários da linha ${B.fmt}`);

  await trocarPara(1);
  const pdf1 = await pdfDaAbaEmFoco();
  check(/Itiner/.test(pdf1) && pdf1.includes(B.itinerario) && !pdf1.includes(A.itinerario),
    `(c2) o PDF da aba 1 é o documento da linha ${B.fmt}, não o da anterior`);
} catch (e) {
  check(false, 'bancada concluiu sem erro', e.message);
} finally {
  await browser.close();
  server.close();
}

console.log(falhas.length ? `\n${falhas.length} falha(s).` : '\nCorrida de views OK.');
process.exit(falhas.length ? 1 : 0);
