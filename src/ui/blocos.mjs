/* Blocos de documento COMPARTILHADOS por mais de uma família da Fase C.

   Por que existe um módulo só para isto, em vez de cada bloco morar na família que o batiza:
   `renderEstrutura` (o documento consolidado) consome markup de três famílias diferentes, e o
   grafo de consumo tem uma aresta PARA TRÁS. Medido na `main` de 21/08/2026, antes da C2:

     evBandHTML/evBlocksHTML  → Histórico da linha (C1) e Histórico da empresa (C3)
     itinerarioTableHTML      → Itinerários (C1) e Estrutura (C2)
     frotaBlockHTML           → Frota (C1) e Estrutura (C2)
     quadroHorariosBodyHTML   → Quadro (C3, app.js:1354) e Estrutura (C2, app.js:1639)
     secoesTarifasHTML        → Tarifas (C2, app.js:1521) e Quadro (C3, app.js:1390)

   A Fase C2 moveu os dois últimos — eram os que faltavam para fechar o grafo. Se cada família
   exportasse o seu bloco para as irmãs, o módulo de C3 (Quadro) importaria o de C2
   (`secoesTarifasHTML`) e o de C2 (Estrutura) importaria o de C3 (`quadroHorariosBodyHTML`):
   um CICLO entre dois módulos de família, com TDZ à espreita no primeiro `const` que alguém
   escrevesse ali. Um módulo que a irmã importa também deixa de ser "a família": vira helper com
   nome de família, e a partição "uma família por PR" passa a mentir.

   CRITÉRIO DE ENTRADA, e ele é estreito: um bloco só desce para cá quando DUAS famílias o usam.
   Bloco de uma família só mora na família — trazê-lo para cá por simetria transformaria este
   arquivo no depósito que o `src/ui/doc.mjs` (markup genérico, sem assunto) não é.
   `tarifaRowHTML`/`TARIFA_COLS` vieram junto com `secoesTarifasHTML` pelo mesmo motivo que
   `SENTIDO_ORDER`/`normSentido` vieram com `itinerarioTableHTML` na C1: são dependência direta
   dela, e deixá-los privados na família de Tarifas obrigaria a uma segunda cópia aqui.

   Nada aqui conhece DOM, rede ou estado: entra dado, sai string de HTML. Por isso tudo aqui é
   exercitado em Node puro, em `tests/ui-data-module.test.mjs`. */
import { esc, fmtCode, fmtDate, fmtTime, orDash } from '../domain/core.mjs';
import { fmtMoney, groupBy } from '../domain/agrupamento.mjs';
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

/* ---- Quadro de Horários (o CORPO — meta e wrapper ficam com quem chama) ----
   Usado pelo Quadro de Horários (C3, ainda no `app.js`) e pela Estrutura Operacional (C2,
   `src/documentos/estrutura-tarifas-portaria.mjs`). Agrupa por sentido (a origem AUTORITATIVA,
   `orig`, tem prioridade sobre o nome denormalizado das tabelas de QH) e depois por dia. */
export function quadroHorariosBodyHTML(interv, predet, orig){
  if(!interv.length && !predet.length) return emptyLinha('quadro de horários');
  const sentidoKey = (cod, nome) => orig[cod] || nome || ('Origem '+orDash(cod));
  let html='';
  if (interv.length){
    html += `<h3 class="doc-h3">Por intervalo / frequência</h3>`;
    for (const [label, list] of groupBy(interv, r=>sentidoKey(r.cod_origem, r.nome_origem))){
      html += `<div class="qh-sentido">Sentido · partidas de ${esc(label)}</div>`;
      for (const [dia, rows] of groupBy(list, r=>r.dia_semana||'—')){
        const body = rows.map(r=>`<tr><td class="td-num">${esc(fmtTime(r.hora_inicio))}</td>
          <td class="td-num">${esc(fmtTime(r.hora_fim))}</td><td class="td-tipo">${esc(orDash(r.intervalo))} min</td></tr>`).join('');
        html += `<div class="mt6"><div class="sentido-sep sm">${esc(dia)}</div>
          <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th class="w-33p">Início</th><th class="w-33p">Fim</th><th>Intervalo</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
      }
    }
  }
  if (predet.length){
    html += `<h3 class="doc-h3">Horários predeterminados</h3>`;
    for (const [label, list] of groupBy(predet, r=>sentidoKey(r.cod_origem, r.nome_origem))){
      html += `<div class="qh-sentido">Sentido · partidas de ${esc(label)}</div>`;
      for (const [dia, rows] of groupBy(list, r=>r.dia_semana||'—')){
        const horas = rows.map(r=>`<span class="mono qh-hora">${esc(fmtTime(r.saida))}</span>`).join('');
        html += `<div class="mt6"><div class="sentido-sep sm">${esc(dia)} · ${rows.length} partida(s)</div><div class="qh-horas">${horas}</div></div>`;
      }
    }
  }
  return html;
}

/* ---- Seções e Tarifas ----
   Usado por Tarifas (C2, `src/documentos/estrutura-tarifas-portaria.mjs`) e pelo Quadro de
   Horários (C3, ainda no `app.js`, no bloco "Seções e Tarifas" acima do quadro em si). */
export const TARIFA_COLS = [{t:'Seção',w:'60px'},{t:'Nº Linha',w:'80px'},{t:'Ligação'},{t:'Via',w:'90px'},{t:'Caract.',w:'90px'},{t:'Tipo',w:'90px'},{t:'RM',w:'55px'},{t:'Tarifa',w:'80px'},{t:'Piso I (km)',w:'90px'},{t:'Situação',w:'90px'},{t:'Criação',w:'90px'},{t:'Status',w:'150px'}];
export function tarifaRowHTML(r){
  // chip de status com a data do evento ao lado (quando a coluna de data está disponível)
  const dChip = (v,label,date) => v ? `<span class="chip chip-on">${label}${date?' '+fmtDate(date):''}</span>` : '';
  const st = [ dChip(r.cancelado,'Canc.',r.data_cancelamento), dChip(r.paralisado,'Paral.',r.data_paralisacao), dChip(r.sub_judice,'Sub jud.',r.data_sub_judice), dChip(r.transferido,'Transf.',r.data_transferencia) ].filter(Boolean).join(' ') || '<span class="chip chip-off">OK</span>';
  // "Piso I" é quilometragem (extensão da seção), não valor monetário — sem "R$"
  const pisoTxt = (r.piso_i===null||r.piso_i===undefined||r.piso_i==='') ? '—' : `${fmtMoney(r.piso_i)} km`;
  return `<tr><td class="td-num">${esc(orDash(r.secao))}</td><td class="td-num">${esc(orDash(r.numero_linha))}</td><td class="td-logr">${esc(orDash(r.nome_ligacao))}</td>
  <td class="td-tipo">${esc(orDash(r.via))}</td><td class="td-tipo">${esc(orDash(r.caracteristica))}</td><td class="td-tipo">${esc(orDash(r.tipo_ligacao))}</td><td class="td-num">${esc(orDash(r.rm))}</td>
  <td class="td-sentido">R$ ${esc(fmtMoney(r.tarifa))}</td><td class="td-num">${esc(pisoTxt)}</td>
  <td class="td-tipo">${esc(orDash(r.situacao))}</td><td class="td-num">${fmtDate(r.data_criacao)}</td><td>${st}</td></tr>`;
}
export function secoesTarifasHTML(rows){
  if(!rows.length) return emptyLinha('seção ou tarifa');
  return tableHTML(TARIFA_COLS, rows.map(tarifaRowHTML).join(''), rows.length+' seção(ões)');
}
