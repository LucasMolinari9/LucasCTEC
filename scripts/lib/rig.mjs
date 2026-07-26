// rig.mjs — bancada compartilhada das checagens de NAVEGADOR (scripts/check_*.mjs).
//
// Por que existe: `check_abas.mjs` e `check_views.mjs` precisam exatamente da mesma
// montagem — servidor estático do portal + PostgREST stubado + Chromium headless. Manter
// duas cópias faria as fixtures divergirem em silêncio (o modo de falha que o CLAUDE.md
// chama de "cópias que divergem"), então servidor, fixtures e stub moram AQUI, em
// definição única, e os scripts só escrevem as asserções deles.
//
// NÃO fala com o Supabase: toda resposta do PostgREST é servida das fixtures abaixo, o que
// deixa as checagens determinísticas e executáveis em ambiente sem acesso ao banco.
//
// Requer Playwright + Chromium (global ou local):
//   npm i -g playwright && npx playwright install chromium

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ================================================================
   CHROMIUM
   ================================================================ */
const req = createRequire(import.meta.url);
export function getChromium() {
  try {
    let mod;
    try { mod = req('playwright'); }
    catch {
      const globalRoot = req('node:child_process').execSync('npm root -g', { encoding: 'utf8' }).trim();
      mod = req(path.join(globalRoot, 'playwright'));
    }
    return mod.chromium;
  } catch {
    console.error('Playwright não encontrado. Instale com: npm i -g playwright && npx playwright install chromium');
    process.exit(2);
  }
}

/* ================================================================
   SERVIDOR ESTÁTICO
   ================================================================ */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

export async function startServer(port) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return server;
}

/* ================================================================
   FIXTURES — uma linha plausível por tabela lida pelo portal
   ----------------------------------------------------------------
   Os nomes de coluna seguem os `select=` reais do app.js: se um nome
   divergir, a coluna chega `undefined` no render e a tela fica vazia
   SEM erro — falso verde. Ao mudar um `select=` no app.js, ajuste aqui.
   ================================================================ */
const linha = (codlinha, numero_ligacao, nome_ligacao, codempresa, via) => ({
  codlinha, numero_ligacao, nome_ligacao, nome_lig_cresc: nome_ligacao, via, codempresa,
  tipo: 'REGULAR', caracteristica: 'CONVENCIONAL', licitado: null, cancelado: null, paralisado: null,
  sub_judice: null, transferido: null, data_criacao: '2001-05-10', processo_criacao: 'E-10/001/2001',
});

const frotaCols = cod => ({
  codlinha: cod, codempresa: cod === '549000001' ? '101' : '102', hierarquia: 'PRINCIPAL',
  ultima_alteracao: '2025-11-02', frota_operacional: 12, reserva: 2,
  frota_a: 4, frota_sa: 3, frota_ac: 2, frota_sac: 1, frota_e: 2,
  frota_micro_a: 0, frota_micro_sa: 0, frota_micro_ac: 0, frota_micro_sac: 0, frota_micro_e: 0,
});

const tarifa = (codlinha, codempresa, secao, tarifa_v) => ({
  codlinha, codempresa, secao, numero_linha: codlinha === '549000001' ? '549M' : '740D',
  nome_ligacao: codlinha === '549000001' ? 'RIO DE JANEIRO X NITEROI' : 'PETROPOLIS X TERESOPOLIS',
  via: codlinha === '549000001' ? 'PONTE' : 'BR-495', caracteristica: 'CONVENCIONAL',
  tipo_ligacao: 'INTERMUNICIPAL', rm: codlinha === '549000001' ? 'SIM' : 'NAO',
  tarifa: tarifa_v, piso_i: null, situacao: 'REGULAR',
  cancelado: null, paralisado: null, sub_judice: null, transferido: null,
  data_criacao: '2001-05-10', data_cancelamento: null, data_paralisacao: null,
  data_sub_judice: null, data_transferencia: null,
});

export const FIXTURES = {
  tabela_vista_teste: [
    linha('549000001', '549M', 'RIO DE JANEIRO X NITEROI', '101', 'PONTE'),
    linha('740000001', '740D', 'PETROPOLIS X TERESOPOLIS', '102', 'BR-495'),
  ],
  codempresa_teste: [
    { codempresa: '101', nome_empresa: 'VIACAO ALFA', situacao: 'REGULAR', cassada: false, sob_intervencao: false },
    { codempresa: '102', nome_empresa: 'VIACAO BETA', situacao: 'REGULAR', cassada: false, sob_intervencao: false },
  ],
  // `dia_semana` (não `dia`) — é o nome que o select= do app.js pede.
  qh_intervalo_teste: [
    { id: 1, codlinha: '549000001', cod_origem: '1', nome_origem: 'RIO DE JANEIRO', dia_semana: 'UTEIS', hora_inicio: '05:00', hora_fim: '23:00', intervalo: '30' },
    { id: 2, codlinha: '549000001', cod_origem: '2', nome_origem: 'NITEROI', dia_semana: 'SABADO', hora_inicio: '06:00', hora_fim: '22:00', intervalo: '60' },
    { id: 3, codlinha: '740000001', cod_origem: '3', nome_origem: 'PETROPOLIS', dia_semana: 'UTEIS', hora_inicio: '06:00', hora_fim: '20:00', intervalo: '60' },
  ],
  qh_predeterminado_teste: [
    { id: 1, codlinha: '549000001', cod_origem: '1', nome_origem: 'RIO DE JANEIRO', dia_semana: 'DOMINGO', saida: '07:30' },
    { id: 2, codlinha: '740000001', cod_origem: '3', nome_origem: 'PETROPOLIS', dia_semana: 'DOMINGO', saida: '08:00' },
  ],
  qh_teste: [frotaCols('549000001'), frotaCols('740000001')],
  tarifa_atual_teste: [
    tarifa('549000001', '101', 1, 7.5),
    tarifa('549000001', '101', 2, 4.25),
    tarifa('740000001', '102', 1, 19.9),
  ],
  itinerario_teste: [
    { id: 1, codlinha: '549000001', codempresa: '101', sentido: 'IDA', tipo_logradouro: 'Terminal', nome_logradouro: 'TERMINAL MENEZES CORTES', cod_municipio_origem: '3304557' },
    { id: 2, codlinha: '549000001', codempresa: '101', sentido: 'IDA', tipo_logradouro: 'Avenida', nome_logradouro: 'AVENIDA PRESIDENTE VARGAS', cod_municipio_origem: '3304557' },
    { id: 3, codlinha: '549000001', codempresa: '101', sentido: 'VOLTA', tipo_logradouro: 'Terminal', nome_logradouro: 'TERMINAL RODOVIARIO DE NITEROI', cod_municipio_origem: '3303302' },
    { id: 4, codlinha: '740000001', codempresa: '102', sentido: 'IDA', tipo_logradouro: 'Rodovia', nome_logradouro: 'BR-495', cod_municipio_origem: '3303906' },
  ],
  municipio_teste: [
    { cod_ibge: '3304557', nome_municipio: 'RIO DE JANEIRO', regiao_municipio: 'METROPOLITANA', regiao_novo: 'METROPOLITANA' },
    { cod_ibge: '3303302', nome_municipio: 'NITEROI', regiao_municipio: 'METROPOLITANA', regiao_novo: 'METROPOLITANA' },
    { cod_ibge: '3303906', nome_municipio: 'PETROPOLIS', regiao_municipio: 'SERRANA', regiao_novo: 'SERRANA' },
  ],
  origem_teste: [
    { cod_origem: '1', nome_origem: 'RIO DE JANEIRO' },
    { cod_origem: '2', nome_origem: 'NITEROI' },
    { cod_origem: '3', nome_origem: 'PETROPOLIS' },
  ],
  localidades_teste: [
    { localidade: 'CENTRO', ordem_importacao: 1 },
    { localidade: 'ITAIPU', ordem_importacao: 2 },
  ],
  evento_teste: [
    { data_registro: '2024-03-12', data_publicacao: '2024-03-15', codlinha: '549000001', codempresa: '101', numero_processo: 'E-10/002/2024', evento_linha: '1', evento_empresa: '1', descricao: 'ALTERACAO DE ITINERARIO', observacao: 'Trecho da Av. Brasil.' },
    { data_registro: '2023-08-01', data_publicacao: '2023-08-04', codlinha: '740000001', codempresa: '102', numero_processo: 'E-10/003/2023', evento_linha: '2', evento_empresa: '1', descricao: 'REAJUSTE TARIFARIO', observacao: null },
  ],
  evento_empresa_teste: [{ id: '1', evento_empresa: 'ALTERACAO CADASTRAL' }],
  evento_linha_teste: [
    { id: '1', evento_linha: 'ITINERARIO' },
    { id: '2', evento_linha: 'TARIFA' },
  ],
  portaria_teste: [
    { numero_portaria: 'DETRO/PRES Nº 1234', data_portaria: '2024-06-01', data_publicacao: '2024-06-03', tipo_portaria: 'PORTARIA', tipo_legislacao: 'ATO', assunto: 'Fixa tarifas das linhas regulares', conteudo: 'O DIRETOR-PRESIDENTE DO DETRO/RJ resolve fixar as tarifas...', vigor: 'SIM', portaria_anterior: null },
    { numero_portaria: 'DETRO/PRES Nº 1100', data_portaria: '2023-02-10', data_publicacao: '2023-02-12', tipo_portaria: 'PORTARIA', tipo_legislacao: 'ATO', assunto: 'Autoriza alteracao de itinerario', conteudo: 'Fica autorizada a alteracao do itinerario da linha 549M...', vigor: 'NAO', portaria_anterior: null },
  ],
};

/* ================================================================
   STUB DO POSTGREST
   ----------------------------------------------------------------
   Entende o subconjunto de PostgREST que o app.js realmente emite:
   `col=eq.v`, `col=in.(a,b)`, `col=not.is.null`, `or=(col.ilike.*t*,…)`
   e `limit=`. Filtro desconhecido é IGNORADO (devolve a mais, nunca a
   menos) — a checagem existe para achar tela que explode, e devolver
   linha demais nunca esconde uma explosão.
   ================================================================ */
const txt = v => String(v ?? '').toLowerCase();
const semPontos = v => txt(v).replace(/[-.\s]/g, '');

/* Nem todo dado do portal vem de tabela: dois caminhos passam por FUNÇÃO no Postgres
   (busca de logradouro sem acento; linhas por região). Sem stub delas a view responde
   vazio e o laço acusaria "sem resultado" onde o defeito seria da bancada. */
function serveRpc(fn, params) {
  if (fn === 'divat_busca_logradouro') {
    const termo = txt(params.get('termo')).replace(/\*/g, '');
    const ibge = params.get('p_ibge');
    return FIXTURES.itinerario_teste.filter(r =>
      (!termo || txt(`${r.tipo_logradouro} ${r.nome_logradouro}`).includes(termo)) &&
      (!ibge || String(r.cod_municipio_origem) === ibge));
  }
  if (fn === 'divat_linhas_regiao') {
    const regiao = txt(params.get('p_regiao'));
    const ibges = FIXTURES.municipio_teste
      .filter(m => !regiao || txt(m.regiao_municipio) === regiao || txt(m.regiao_novo) === regiao)
      .map(m => String(m.cod_ibge));
    return FIXTURES.itinerario_teste.filter(r => ibges.includes(String(r.cod_municipio_origem)));
  }
  return [];
}

export function serve(table, qs) {
  const params = new URLSearchParams(qs);
  if (table.startsWith('rpc/')) return serveRpc(table.slice(4), params);
  let rows = FIXTURES[table] || [];

  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'or'].includes(key)) continue;
    const val = decodeURIComponent(raw);
    if (val.startsWith('eq.')) {
      const alvo = val.slice(3);
      rows = rows.filter(r => String(r[key] ?? '') === alvo);
    } else if (val.startsWith('in.(')) {
      const lista = val.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
      rows = rows.filter(r => lista.includes(String(r[key] ?? '')));
    } else if (val === 'not.is.null') {
      rows = rows.filter(r => r[key] != null);
    } else if (val.startsWith('ilike.')) {
      const t = val.slice(6).replace(/\*/g, '').toLowerCase();
      rows = rows.filter(r => txt(r[key]).includes(t));
    }
  }

  const or = params.get('or');
  if (or) {
    const pares = [...decodeURIComponent(or).matchAll(/([a-z_]+)\.ilike\.\*([^*,)]*)\*/g)];
    if (pares.length) {
      rows = rows.filter(r => pares.some(([, col, termo]) => {
        const t = termo.toLowerCase();
        if (!t) return true;
        // `codlinha` é buscado sem pontuação pelo app.js — compare do mesmo jeito.
        return col === 'codlinha' ? semPontos(r[col]).includes(semPontos(termo)) : txt(r[col]).includes(t);
      }));
    }
  }

  const limit = Number(params.get('limit'));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

/* ================================================================
   NAVEGADOR
   ================================================================ */
export async function launchPage(chromium) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.route('**/rest/v1/**', route => {
    const u = new URL(route.request().url());
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(serve(u.pathname.split('/rest/v1/')[1], u.search.slice(1))),
    });
  });
  return { browser, page };
}

/* ================================================================
   PLACAR
   ================================================================ */
export function makeReporter() {
  const falhas = [];
  const check = (ok, nome, detalhe = '') => {
    console.log(`${ok ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
    if (!ok) falhas.push(nome);
  };
  return { falhas, check };
}
