/* As listas de colunas (`select=`) que os documentos pedem ao PostgREST.

   São DADO, não estado: nenhuma delas depende de view, linha ou DOM. Moraram para cá na Fase C1
   porque um documento que sai do `app.js` leva junto o seu `select=` — e a alternativa (uma cópia
   no módulo e outra no `app.js`) é justamente o modo de falha que o comentário abaixo descreve.

   Quem lê daqui hoje: o `app.js` (busca de linha, rota, banner, e os documentos que ainda não
   saíram) e `src/documentos/*.mjs`. Definição única, um endereço só. */

export const LINE_FIELDS = 'codlinha,numero_ligacao,nome_ligacao,nome_lig_cresc,via,codempresa,tipo,caracteristica,licitado,cancelado,paralisado,sub_judice,transferido,data_criacao,processo_criacao';

/* Listas de colunas pedidas por MAIS DE UM documento — o segundo é sempre a Estrutura
   Operacional, que consolida os outros. Mantê-las em definição única é o que impede a
   divergência silenciosa: coluna que muda num `select=` e não no gêmeo chega `undefined`
   no render e a tela fica VAZIA SEM ERRO (o modo de falha que o CLAUDE.md chama de pior
   possível). Desde 08/08/2026 a bancada headless também responde 400 para coluna que não
   existe, então divergir passou a doer no gate em vez de doer no usuário.
   NÃO use estas constantes em consultas que pedem MENOS colunas de propósito —
   `getTerminais` (3 colunas de itinerario_teste) e `filtrarFrotaEmpresas` (4 de qh_teste)
   são consultas de listagem, não de documento: pedir coluna a mais ali é regressão. */
export const ITINERARIO_FIELDS     = 'id,sentido,tipo_logradouro,nome_logradouro,cod_municipio_origem,codempresa';
export const QH_INTERVALO_FIELDS   = 'cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo';
export const QH_PREDET_FIELDS      = 'cod_origem,nome_origem,dia_semana,saida';
export const TARIFA_LINHA_FIELDS   = 'secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia';
export const FROTA_FIELDS          = 'codempresa,hierarquia,ultima_alteracao,frota_operacional,reserva,frota_a,frota_sa,frota_ac,frota_sac,frota_e,frota_micro_a,frota_micro_sa,frota_micro_ac,frota_micro_sac,frota_micro_e';
export const EVENTO_FIELDS         = 'data_registro,codlinha,numero_processo,evento_linha,evento_empresa,data_publicacao,descricao,observacao';
