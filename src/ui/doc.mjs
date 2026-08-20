// Markup de DOCUMENTO — cabeçalho institucional, meta, tabela e os estados de tela
// (carregando / vazio / erro). Nenhuma função aqui toca rede, estado do app ou o DOM: todas
// recebem dado e devolvem string de HTML. Quem escreve essa string em algum lugar é o app.js.
//
// A única dependência externa é o SVG do logo, que mora no `index.html` (`#brandLogo`). Ele
// chega por `configurarDoc({ logoSVG })`, uma vez, no bootstrap do app.js — e não por leitura
// de `document` aqui dentro. A escolha não é estilo: injetado, o módulo carrega e é testável
// em Node puro (é o que `tests/ui-data-module.test.mjs` faz); lendo o DOM, ele exigiria
// navegador para qualquer teste, e passaria a ter uma dependência que a assinatura não declara.

import { esc } from '../domain/core.mjs';

// `null` = ninguém configurou ainda. Distinto de `''`, que é configuração explícita de "sem
// logo" — o teste usa isso.
let logoSVG = null;

/* Liga o módulo ao SVG do logo servido pelo index.html. Chamar UMA vez, no bootstrap. */
export function configurarDoc({ logoSVG: svg } = {}){
  logoSVG = String(svg ?? '');
}

// Cabeçalho institucional reutilizável — o SVG do logo vive no index.html (header #brandLogo);
// aqui só reaproveitamos o markup (recolorável via currentColor + classe .brand-logo-doc).
// Sem `configurarDoc`, LANÇA em vez de sair sem logo: cabeçalho mudo é regressão silenciosa —
// nenhuma checagem de view olha para o logo, e o documento continuaria "funcionando".
export function docHead(subtitle){
  if (logoSVG === null){
    throw new Error('src/ui/doc.mjs: configurarDoc({ logoSVG }) não foi chamado antes de docHead()');
  }
  return `<div class="doc-head">
    <span class="brand-logo brand-logo-doc" role="img" aria-label="DETRO — Departamento de Transportes Rodoviários do RJ">${logoSVG}</span>
    <div class="doc-head-titles"><div class="sub">DIVAT · ${esc(subtitle)}</div></div></div>`;
}

export function metaRows(pairs){
  return `<div class="doc-meta">${pairs.map(([k,v,full])=> k===''? '<div class="row"></div>' : `<div class="row${full?' full':''}"><b>${esc(k)}:</b><span>${v}</span></div>`).join('')}</div>`;
}

// Largura de coluna vira CLASSE, não `style="width:…"`: a CSP publica `style-src-attr 'none'`
// e atributo style em markup é ignorado pelo navegador (verificado em Chromium headless).
// `c.w` é sempre constante do próprio código — nunca dado do usuário —, então o conjunto é
// FECHADO e cabe numa allowlist. Valor sem classe correspondente em styles.css derruba o
// gate (tests/check.js, seção [2b]): sem essa guarda, uma largura nova viraria classe
// inexistente e a coluna sairia torta EM SILÊNCIO.
export const colClass = w => (w ? ` class="w-${String(w).replace('px','').replace('%','p')}"` : '');

export function tableHTML(cols, bodyRows, foot, cls=''){
  return `<div class="doc-table-wrap"><table class="doc-table${cls?' '+cls:''}"><thead><tr>${cols.map(c=>`<th${colClass(c.w)}>${esc(c.t)}</th>`).join('')}</tr></thead>
    <tbody>${bodyRows}</tbody></table></div>${foot?`<div class="doc-foot">${esc(foot)}</div>`:''}`;
}

export function loading(msg='Carregando…'){ return `<div class="m-loading"><div class="spin"></div>${esc(msg)}</div>`; }
export function emptyBox(msg){ return `<div class="m-loading">${esc(msg)}</div>`; }
/* Estado vazio de DOCUMENTO DE LINHA: o usuário já escolheu a linha e a consulta voltou vazia.
   O texto não pode afirmar que o dado NÃO EXISTE, porque o portal não sabe disso. As codlinhas
   órfãs medidas contra o banco em 27/07/2026 (filhos em itinerario_teste, qh_teste,
   qh_predeterminado_teste e evento_teste apontando para codlinha ausente do cadastro) fazem a
   view renderizar vazia SEM erro nenhum — e "nenhum itinerário cadastrado para esta linha" é,
   para o cidadão, indistinguível de linha que realmente não tem itinerário. Definição única
   para não divergir mensagem a mensagem; use em toda tela que responde por linha já escolhida.
   Ver docs/planos/2026-08-08-correcoes-auditoria.md (Task 13) e CLAUDE.md (2e). */
export function emptyLinha(oQue){ return emptyBox(`Nenhum registro de ${oQue} foi localizado para esta linha.`); }
export function errorBox(msg){ return `<div class="m-loading err">Erro ao carregar: ${esc(msg)}</div>`; }

// Banner de aviso quando a lista foi truncada (atingiu o limite da consulta).
// Ele mora AQUI, e não junto do `marcarTrunc` que põe a marca: marcar é trabalho da camada de
// dado (ela conhece o `limit` e o teto do PostgREST), pintar é trabalho da camada de markup. O
// contrato entre as duas são os campos não-enumeráveis `_trunc`/`_limite` do array de
// resultados — quem mexer num lado, leia o outro (`marcarTrunc`, seção SUPABASE CONFIG do
// app.js, até a Fase B do plano das fatias 3-4 mudá-lo de lugar).
export function bannerTrunc(rows){
  return (rows && rows._trunc)
    ? `<div class="trunc-aviso"><b>Resultado parcial:</b> mostrando os primeiros ${rows._limite}. Refine a busca para encontrar itens mais específicos.</div>`
    : '';
}
