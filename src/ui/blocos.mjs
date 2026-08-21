/* Blocos de documento COMPARTILHADOS por mais de uma família da Fase C.

   Por que existe um módulo só para isto, em vez de cada bloco morar na família que o batiza:
   `renderEstrutura` (o documento consolidado) consome markup de três famílias diferentes, e o
   grafo de consumo tem uma aresta PARA TRÁS. Medido na `main` de 21/08/2026, antes desta fase:

     evBandHTML/evBlocksHTML  → Histórico da linha (C1) e Histórico da empresa (C3)
     itinerarioTableHTML      → Itinerários (C1) e Estrutura (C2)
     frotaBlockHTML           → Frota (C1) e Estrutura (C2)
     quadroHorariosBodyHTML   → Quadro (C3, app.js:1354) e Estrutura (C2, app.js:1639)
     secoesTarifasHTML        → Tarifas (C2, app.js:1521) e Quadro (C3, app.js:1390)

   Se cada família exportasse o seu bloco para as irmãs, o módulo de C3 (Quadro) importaria o de
   C2 (`secoesTarifasHTML`) e o de C2 (Estrutura) importaria o de C3 (`quadroHorariosBodyHTML`):
   um CICLO entre dois módulos de família, com TDZ à espreita no primeiro `const` que alguém
   escrevesse ali. Um módulo que a irmã importa também deixa de ser "a família": vira helper com
   nome de família, e a partição "uma família por PR" passa a mentir.

   CRITÉRIO DE ENTRADA, e ele é estreito: um bloco só desce para cá quando DUAS famílias o usam.
   Bloco de uma família só mora na família — trazê-lo para cá por simetria transformaria este
   arquivo no depósito que o `src/ui/doc.mjs` (markup genérico, sem assunto) não é.

   Nada aqui conhece DOM, rede ou estado: entra dado, sai string de HTML. Por isso tudo aqui é
   exercitado em Node puro, em `tests/ui-data-module.test.mjs`. */
import { esc, fmtCode, fmtDate, orDash } from '../domain/core.mjs';
import { emptyLinha, tableHTML } from './doc.mjs';

/* ---- Evento (histórico da linha e da empresa) ----
   Um evento por página: a faixa de campos em cima, descrição/observação por extenso embaixo.
   O PAGINADOR que os consome (`paginateEvents`, com a barra de filtros e o pager) mora em
   `./paginacao.mjs`; aqui é só o MARKUP de um evento. */
export function evBlocksHTML(r){
  return `<div class="ev-block"><div class="ev-label">Descrição:</div><div class="ev-text${r.descricao?'':' empty'}">${r.descricao?esc(r.descricao):'—'}</div></div>
    <div class="ev-block"><div class="ev-label">Observação:</div><div class="ev-text${r.observacao?'':' empty'}">${r.observacao?esc(r.observacao):'—'}</div></div>`;
}
export function evBandHTML(r, tipoLabel, tipoVal, showLine){
  return `<div class="ev-grid${showLine?' ev5':''}">
    <div class="ev-cell"><span class="ev-h">Data do Registro</span><span class="ev-v mono">${esc(fmtDate(r.data_registro))}</span></div>
    ${showLine?`<div class="ev-cell"><span class="ev-h">Linha</span><span class="ev-v mono">${esc(fmtCode(r.codlinha))}</span></div>`:''}
    <div class="ev-cell"><span class="ev-h">Nº do Processo/Doc.</span><span class="ev-v mono">${esc(orDash(r.numero_processo))}</span></div>
    <div class="ev-cell"><span class="ev-h">${esc(tipoLabel)}</span><span class="ev-v">${esc(tipoVal)}</span></div>
    <div class="ev-cell"><span class="ev-h">Data da Publicação</span><span class="ev-v mono">${esc(fmtDate(r.data_publicacao))}</span></div></div>`;
}

/* ---- Itinerário ----
   `SENTIDO_ORDER`/`normSentido` saem junto com a tabela porque o documento de Itinerários os usa
   por fora dela, para montar o filtro de sentido — deixá-los privados aqui obrigaria a uma
   segunda cópia da normalização lá, que é exatamente a divergência silenciosa que o repo já
   pagou uma vez (o filtro mostraria "IDA" e a tabela agruparia "Ida"). */
export const SENTIDO_ORDER = { 'Ida':1, 'Volta':2, 'Circular':3 };
export const normSentido = s => { const t=String(s||'').trim().toLowerCase(); if(t.startsWith('ida'))return'Ida'; if(t.startsWith('volta'))return'Volta'; if(t.startsWith('circ'))return'Circular'; return s?String(s):'—'; };

export function itinerarioTableHTML(rows, ibge){
  if(!rows.length) return emptyLinha('itinerário');
  rows.forEach(r=>r._sn=normSentido(r.sentido));
  rows.sort((a,b)=>{ const oa=SENTIDO_ORDER[a._sn]||9, ob=SENTIDO_ORDER[b._sn]||9; return oa!==ob?oa-ob:(a.id-b.id); });
  let last=null;
  const body = rows.map(r=>{
    let sep=''; if(r._sn!==last){ sep=`<tr class="sentido-sep"><td colspan="4">Sentido: ${esc(r._sn)}</td></tr>`; last=r._sn; }
    const mun = (ibge[r.cod_municipio_origem]?.nome) || (r.cod_municipio_origem?String(r.cod_municipio_origem):'');
    return sep+`<tr><td class="td-sentido">${esc(r._sn||'')}</td><td class="td-tipo">${esc(r.tipo_logradouro||'')}</td>
      <td class="td-logr">${esc(r.nome_logradouro||'—')}</td><td class="td-mun">${esc(mun)}</td></tr>`;
  }).join('');
  return tableHTML([{t:'Sentido',w:'62px'},{t:'Tipo',w:'84px'},{t:'Nome do Logradouro'},{t:'Município',w:'110px'}], body, `${rows.length} logradouro(s) · cadastro DETRO-RJ`);
}

/* ---- Frota ----
   A grade de KPIs por tipo de veículo. O `check_views.mjs` conta `.kpi` na view `frota` e exige
   >= 12 — é a asserção que morde se este bloco esvaziar. */
export function frotaBlockHTML(f){
  return `<div class="kpi-grid">
      <div class="kpi"><b>${esc(orDash(f.frota_operacional))}</b><span>Operacional</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_a))}</b><span>Comum (A)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_sa))}</b><span>Comum (SA)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_ac))}</b><span>Ar cond. (AC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_sac))}</b><span>Ar cond. (SAC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_a))}</b><span>Micro (A)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_sa))}</b><span>Micro (SA)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_ac))}</b><span>Micro (AC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_sac))}</b><span>Micro (SAC)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_micro_e))}</b><span>Micro (E)</span></div>
      <div class="kpi"><b>${esc(orDash(f.frota_e))}</b><span>Especial (E)</span></div>
      <div class="kpi"><b>${esc(orDash(f.reserva))}</b><span>Reserva</span></div>
    </div>`;
}
