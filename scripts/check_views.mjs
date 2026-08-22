// check_views.mjs — Laço de FUMAÇA sobre todas as views do portal (navegador headless).
//
// O que ele responde: "existe alguma tela que EXPLODE, fica em branco ou renderiza MENOS do que
// as fixtures dão, e eu não sei?"
//
// Por que existe: ~39,5% do app.js é a seção MODAL / SISTEMA DE VIEWS (render/DOM). O
// tests/check.js é offline e sem dependências de propósito, então só cobre a lógica PURA
// copiada nos *.harness.js — nada do render. Este script fecha esse buraco pela borda mais
// barata: em vez de 17 testes escritos à mão, UM laço genérico que abre cada view e falha se
// ela lançar erro, ficar presa no spinner, pintar nada ou pintar menos que o contrato.
//
// O que ele NÃO faz: conferir se o conteúdo está CERTO (a coluna traz o valor certo, o total
// bate). Ele cobra QUANTIDADE mínima, não correção — asserção de valor por view continua fora
// de escopo. Quem pega coluna trocada é o 400 da bancada (scripts/lib/rig.mjs).
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

   `minimo`: contrato de CONTEÚDO — quantos elementos de cada tipo o
   documento precisa ter depois de pintar. Sem ele o laço aceitava
   `corpo != 0`, e UM CARACTERE passava: três views passavam com zero
   linha de tabela. Os números saem de MEDIÇÃO contra as fixtures
   atuais, não de estimativa; a comparação é `>=`, então acrescentar
   fixture não derruba o gate — só encolher o que a view renderiza.

   A UNIDADE muda de documento para documento, e isso é o ponto: o
   Histórico renderiza `.ev-block` (não usa tabela) e a Frota renderiza
   `.kpi`. Uma contagem única de `tbody tr` reprovaria as duas por um
   defeito que não existe — que é o tipo de vermelho que ensina a
   ignorar gate. Quem consolida vários documentos declara as duas
   unidades (Estrutura, Frota por Empresa, Localidade).

   View sem `minimo` continua no critério antigo, de propósito: assim
   uma view nova entra no laço antes de alguém medir o mínimo dela.
   ---------------------------------------------------------------- */
const VIEWS = [
  { key: 'itinerarios',                              minimo: { 'tbody tr': 5 } },
  { key: 'quadroHorarios',                           minimo: { 'tbody tr': 4 } },
  { key: 'tarifas',                                  minimo: { 'tbody tr': 2 } },
  { key: 'historicoLinha',                           minimo: { '.ev-block': 2 } },
  { key: 'frota',                                    minimo: { '.kpi': 12 } },
  { key: 'estrutura',                                minimo: { 'tbody tr': 9, '.kpi': 12 } },
  { key: 'empresasRegulares',                        minimo: { 'tbody tr': 2 } },
  { key: 'historicoEmpresa',      busca: 'alfa',     minimo: { '.ev-block': 2 } },
  { key: 'ligacoesPorEmpresa',    busca: 'alfa',     minimo: { 'tbody tr': 1 } },
  { key: 'secoesPorEmpresa',      busca: '101',      minimo: { 'tbody tr': 2 } },   // pede CÓDIGO, não nome
  { key: 'ligacoesPorLogradouro', busca: 'vargas',   minimo: { 'tbody tr': 1 } },
  { key: 'municipioRegiao',       busca: 'rio',      minimo: { 'tbody tr': 1 } },
  // Reexecutar o painel da mesma view não pode devolver #regScope ao padrão.
  { key: 'municipioRegiao', minimo: { 'tbody tr': 1 },
    driver: async page => {
      await page.selectOption('.modal-body.active #spSel', 'METROPOLITANA');
      await page.waitForSelector('.modal-body.active #regScope');
      await page.selectOption('.modal-body.active #regScope', 'dentro');
      await page.waitForTimeout(500);
      await page.click('.modal-body.active #spBtn');
      await page.waitForSelector('.modal-body.active #regScope');
      const valor = await page.inputValue('.modal-body.active #regScope');
      if(valor !== 'dentro') throw new Error(`#regScope voltou para "${valor}" após recarregar`);
    } },
  // O filtro municipal também deve sobreviver ao await da classificação/repaint.
  { key: 'municipioRegiao',
    driver: async page => {
      await page.fill('.modal-body.active #spInput', 'Rio de Janeiro');
      await page.click('.modal-body.active #spBtn');
      await page.waitForSelector('.modal-body.active #munScope');
      await page.selectOption('.modal-body.active #munScope', 'inter');
      await page.waitForTimeout(500);
      const valor = await page.inputValue('.modal-body.active #munScope');
      if(valor !== 'inter') throw new Error(`#munScope voltou para "${valor}" durante o recarregamento`);
    } },
  // Formulário próprio (#locA/#locGo), não o painel de busca padrão. Os dois blocos do card
  // (a tabela e a lista "com seção") entram no mínimo: se um sumir, o outro não disfarça.
  { key: 'localidades', busca: 'rio', minimo: { 'tbody tr': 2, '.loc-linha-head': 1 },
    driver: async page => {
      await page.fill('.modal-body.active #locA', 'rio');
      await page.click('.modal-body.active #locGo');
    } },
  // Mesma view do card acima, mas exercitando um dos 2 modos por MUNICÍPIO (idx 4 de
  // LOC_FILTERS = "Trafegam nos municípios A e B") — cobre o caminho de render que passou a
  // usar renderLocalidadeSecoes (seções/tarifa por linha) em vez de lineResults.
  { key: 'localidades', minimo: { '.loc-linha-sec': 1, '.loc-emp-head': 1, 'tbody tr': 2 },
    driver: async page => {
      await page.click('.modal-body.active .loc-filter-btn[data-idx="4"]');
      await page.fill('.modal-body.active #locA', 'Rio de Janeiro');
      await page.fill('.modal-body.active #locB', 'Niteroi');
      await page.click('.modal-body.active #locGo');
    } },
  { key: 'ligacoesPorTerminal',   busca: 'terminal', minimo: { 'tbody tr': 1 } },
  { key: 'secoesPorLigacao',      busca: '549',      minimo: { 'tbody tr': 2 } },
  { key: 'frotaPorEmpresa',       busca: 'alfa',     minimo: { 'tbody tr': 3, '.kpi': 5 } },
  { key: 'portarias',             busca: 'tarifa',   minimo: { 'tbody tr': 2 } },
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

async function estadoDoPane(seletores = []) {
  return page.evaluate((sels) => {
    const pane = document.querySelector('.modal-body.active');
    if (!pane) return { semPane: true };
    // O CORPO do documento, sem a moldura (cabeçalho DIVAT + campo de busca): um render
    // que devolve vazio deixa o pane com ~30 caracteres de moldura e passaria despercebido
    // se medíssemos o pane. `#spHost`/`#locHost` são onde os loaders efetivamente pintam.
    // As unidades do `minimo` são contadas no MESMO host, pelo mesmo motivo.
    const host = pane.querySelector('#spHost, #locHost') || pane;
    return {
      erro:    !!pane.querySelector('.m-loading.err'),
      msgErro: (pane.querySelector('.m-loading.err')?.textContent || '').trim(),
      spin:    !!pane.querySelector('.spin'),
      txt:     (pane.innerText || '').trim(),
      temBusca: !!pane.querySelector('#spInput'),
      corpo: host.innerText.trim().length,
      unidades: Object.fromEntries(sels.map(s => [s, host.querySelectorAll(s).length])),
    };
  }, seletores);
}

for (const { key, busca, driver, minimo } of alvo) {
  erros = [];
  const seletores = Object.keys(minimo || {});
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
    est = await estadoDoPane(seletores);
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
    est = await estadoDoPane(seletores);
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
  // Contrato de conteúdo. Só cobrado quando a view chegou a pintar: com errorBox ou spinner
  // preso as unidades são 0 por consequência, e repetir isso como "conteúdo abaixo do mínimo"
  // só afogaria a causa real no meio da mensagem.
  if (!est.semPane && !est.erro && !est.spin) {
    for (const [sel, n] of Object.entries(minimo || {})) {
      const achou = est.unidades[sel] ?? 0;
      if (achou < n) detalhes.push(`conteúdo abaixo do contrato: ${achou} "${sel}", esperado >= ${n}`);
    }
  }
  if (erros.length)        detalhes.push(...erros.slice(0, 3));

  const medido = Object.entries(est.unidades || {}).map(([s, n]) => `${s}=${n}`).join(' ');
  check(!detalhes.length, key,
    detalhes.length ? detalhes.join(' | ') : `corpo=${est.corpo}c ${medido || 'sem contrato'}`);
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
