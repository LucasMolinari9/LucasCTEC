// check_views.mjs — Laço de FUMAÇA sobre todas as views do portal (navegador headless).
//
// O que ele responde: "existe alguma tela que EXPLODE ou fica em branco, e eu não sei?"
//
// Por que existe: ~62% do app.js é a seção MODAL / SISTEMA DE VIEWS (render/DOM). O
// tests/check.js é offline e sem dependências de propósito, então só cobre a lógica PURA
// copiada nos *.harness.js — nada do render. Este script fecha esse buraco pela borda mais
// barata: em vez de 17 testes escritos à mão, UM laço genérico que abre cada view e falha se
// ela lançar erro, ficar presa no spinner ou pintar nada.
//
// O que ele NÃO faz: conferir se o conteúdo está CERTO (a tabela tem as colunas certas, o
// total bate). Isso é asserção por view, deliberadamente fora de escopo aqui.
//
// Uso:
//   node scripts/check_views.mjs            # todas as views
//   node scripts/check_views.mjs frota      # só as que casam com o termo
//
// Fora do CI, igual check_abas.mjs/check_realtime.mjs: exige Playwright. Sai 0 = tudo verde.

import { startServer, getChromium, launchPage, makeReporter } from './lib/rig.mjs';

const PORT = 8098;
const LINHA = '549000001';   // 549M — a linha das fixtures com dado em todas as tabelas

/* ----------------------------------------------------------------
   AS VIEWS
   ----------------------------------------------------------------
   Lista explícita (e não varrida do DOM) para que uma view NOVA que
   ninguém listou aqui apareça como falha de drift, no espírito das
   cópias verbatim guardadas pelo tests/check.js.

   `busca`: termo digitado quando a view abre com painel de busca —
   escolhido para casar as fixtures do rig e forçar o render do
   resultado, em vez de parar no "busque alguma coisa".
   ---------------------------------------------------------------- */
const VIEWS = [
  { key: 'quadroHorarios' },
  { key: 'tarifas' },
  { key: 'historicoLinha' },
  { key: 'frota' },
  { key: 'estrutura' },
  { key: 'empresasRegulares' },
  { key: 'historicoEmpresa',      busca: 'alfa' },
  { key: 'ligacoesPorEmpresa',    busca: 'alfa' },
  { key: 'secoesPorEmpresa',      busca: '101' },   // este card pede CÓDIGO, não nome
  { key: 'ligacoesPorLogradouro', busca: 'vargas' },
  { key: 'municipioRegiao',       busca: 'rio' },
  // Formulário próprio (#locA/#locGo), não o painel de busca padrão.
  { key: 'localidades', busca: 'rio', driver: async page => {
      await page.fill('.modal-body.active #locA', 'rio');
      await page.click('.modal-body.active #locGo');
    } },
  { key: 'ligacoesPorTerminal',   busca: 'terminal' },
  { key: 'secoesPorLigacao',      busca: '549' },
  { key: 'frotaPorEmpresa',       busca: 'alfa' },
  { key: 'portarias',             busca: 'tarifa' },
];

/* O portal fala com o Realtime por wss://…supabase.co, que num teste offline nunca conecta.
   Esse barulho é ESPERADO e não é defeito da view — filtra, para não virar falso vermelho. */
const RUIDO = /websocket|realtime|supabase\.co|net::ERR|Failed to load resource/i;

/* Depois de uma busca com termo que CASA as fixtures, a view tem que mostrar resultado.
   Contar <table> não serve: documentos como o Histórico renderizam blocos, não tabela —
   o sinal confiável é a AUSÊNCIA das mensagens de "nada aqui" / "faltou preencher". */
const SEM_RESULTADO = /nenhum[ao]?\s|preencha|digite o|digite a|informe o|informe a|busque a|busque o/i;

const filtro = process.argv[2];
const alvo = filtro ? VIEWS.filter(v => v.key.toLowerCase().includes(filtro.toLowerCase())) : VIEWS;
if (!alvo.length) { console.error(`Nenhuma view casa com "${filtro}".`); process.exit(2); }

const server = await startServer(PORT);
const { browser, page } = await launchPage(getChromium());
const { falhas, check } = makeReporter();

let erros = [];
page.on('pageerror', e => erros.push(`pageerror: ${e.message}`));
page.on('console', m => {
  if (m.type() === 'error' && !RUIDO.test(m.text())) erros.push(`console: ${m.text()}`);
});

/* Espera o pane ativo sair do estado de carregamento (spinner some). */
const esperarPintura = () => page.waitForFunction(
  () => {
    const pane = document.querySelector('.modal-body.active');
    return !!pane && !pane.querySelector('.spin');
  }, null, { timeout: 20000 });

async function estadoDoPane() {
  return page.evaluate(() => {
    const pane = document.querySelector('.modal-body.active');
    if (!pane) return { semPane: true };
    return {
      erro:    !!pane.querySelector('.m-loading.err'),
      msgErro: (pane.querySelector('.m-loading.err')?.textContent || '').trim(),
      spin:    !!pane.querySelector('.spin'),
      txt:     (pane.innerText || '').trim(),
      tabelas: pane.querySelectorAll('table').length,
      temBusca: !!pane.querySelector('#spInput'),
      // O CORPO do documento, sem a moldura (cabeçalho DIVAT + campo de busca): um render
      // que devolve vazio deixa o pane com ~30 caracteres de moldura e passaria despercebido
      // se medíssemos o pane. `#spHost`/`#locHost` são onde os loaders efetivamente pintam.
      corpo: (pane.querySelector('#spHost, #locHost') || pane).innerText.trim().length,
    };
  });
}

for (const { key, busca, driver } of alvo) {
  erros = [];
  let est;
  try {
    // about:blank entre as views: troca só de hash NÃO recarrega a página, e queremos cada
    // view partindo de um estado limpo (sem cache/aba/erro herdado da anterior).
    await page.goto('about:blank');
    await page.goto(`http://127.0.0.1:${PORT}/#/linha/${LINHA}/consulta/${key}`);
    await page.waitForSelector('#modalOverlay.open', { timeout: 20000 });
    await esperarPintura();

    // View com painel de busca: digita o termo para forçar o render do RESULTADO,
    // em vez de aceitar o "busque alguma coisa" como se fosse tela pintada.
    est = await estadoDoPane();
    if (driver) {
      await driver(page);
      await page.waitForTimeout(700);
      await esperarPintura();
    } else if (busca && est.temBusca) {
      await page.fill('.modal-body.active #spInput', busca);
      await page.click('.modal-body.active #spBtn');
      await page.waitForTimeout(700);
      await esperarPintura();
    }
    est = await estadoDoPane();
  } catch (e) {
    check(false, key, `não pintou em 20s — ${e.message.split('\n')[0]}`);
    continue;
  }

  const detalhes = [];
  if (est.semPane)         detalhes.push('sem pane ativo');
  if (est.erro)            detalhes.push(`errorBox: "${est.msgErro}"`);
  if (est.spin)            detalhes.push('preso no spinner');
  if (!est.txt?.length)    detalhes.push('pane vazio');
  else if (!est.corpo)     detalhes.push('documento em branco (só a moldura pintou)');
  if (busca && !est.erro && SEM_RESULTADO.test(est.txt || ''))
    detalhes.push(`busca "${busca}" não achou nada — "${(est.txt.match(SEM_RESULTADO) ? est.txt.split('\n').find(l => SEM_RESULTADO.test(l)) : '').trim()}"`);
  if (erros.length)        detalhes.push(...erros.slice(0, 3));

  check(!detalhes.length, key,
    detalhes.length ? detalhes.join(' | ') : `corpo=${est.corpo}c tabelas=${est.tabelas}`);
}

/* Anti-drift: view registrada no app.js que ninguém listou aqui passaria despercebida. */
if (!filtro) {
  await page.goto('about:blank');
  await page.goto(`http://127.0.0.1:${PORT}/#/linha/${LINHA}/consulta/quadroHorarios`);
  await page.waitForSelector('#modalOverlay.open', { timeout: 20000 });
  await page.click('#modalTabAdd');
  await page.waitForSelector('.modal-body.active .card[data-view]');
  const noDom = await page.$$eval('.modal-body.active .card[data-view]',
    els => [...new Set(els.map(e => e.dataset.view))]);
  const naoListadas = noDom.filter(v => !VIEWS.some(x => x.key === v));
  check(!naoListadas.length, 'toda view do seletor está coberta por este laço',
    naoListadas.length ? `faltando: ${naoListadas.join(', ')}` : `${noDom.length} views no seletor`);
}

await browser.close();
server.close();

console.log(falhas.length
  ? `\n${falhas.length} de ${alvo.length} view(s) com problema: ${falhas.join(', ')}`
  : `\n${alvo.length} view(s) OK.`);
process.exit(falhas.length ? 1 : 0);
