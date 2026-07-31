// tabelas.mjs — fonte única do inventário de tabelas do banco DIVAT, para os scripts que
// precisam percorrê-lo (backup_rest.mjs e restore_rest.mjs).
//
// Por que existe: até 31/07/2026 o mapa tabela→PK vivia só dentro do backup_rest.mjs. Quando o
// restore_rest.mjs nasceu (achado 2 da auditoria cruzada de 31/07/2026) ele precisava do MESMO
// mapa — para paginar na volta e para filtrar o DELETE do --sobrescrever. Copiar seria criar
// duas listas que divergem no dia em que uma tabela ganhar PK diferente, e a divergência só
// apareceria durante um restore, que é quando ninguém tem segunda cópia.
//
// Ao mexer aqui, confira também docs/backup_schema.sql (as PKs de verdade) e docs/schema.md.

// tabela -> coluna(s) de PK, usada(s) para ordenar a paginação keyset do backup e para filtrar
// o DELETE do restore. Todas as tabelas têm PK desde 15/07/2026.
export const PK = {
  tabela_vista_teste: 'codlinha,codempresa', // PK composta; ordenar pelas duas (codlinha repete)
  tarifa_atual_teste: 'ordem_importacao',
  itinerario_teste: 'row_id',
  qh_teste: 'id',
  qh_intervalo_teste: 'row_id',
  qh_predeterminado_teste: 'row_id',
  evento_teste: 'id',
  evento_dados: 'id',
  evento_textos: 'id',
  evento_empresa_teste: 'row_id',
  evento_linha_teste: 'row_id',
  codempresa_teste: 'id',
  portaria_teste: 'id',
  portaria_data: 'id',
  portaria_texto_teste: 'id',
  municipio_teste: 'cod_ibge',
  localidades_teste: 'ordem_importacao',
  origem_teste: 'cod_origem',
};

// Staging do ETL: RLS ligado SEM policy e sem grant → invisíveis pela API pública, de propósito.
// Só entram em backup de modo COMPLETO (service key).
export const STAGING = new Set(['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste']);

// Ordem de INSERÇÃO no restore. Importa por causa da única FK do banco (fk_tarifa_linha,
// composta, ON DELETE CASCADE): tarifa_atual_teste referencia tabela_vista_teste, então o hub
// entra antes. As demais não têm dependência entre si — a ordem delas é só estética.
// O restore apaga na ordem INVERSA desta.
export const ORDEM_INSERCAO = [
  'tabela_vista_teste',   // hub — antes de tarifa_atual_teste (FK)
  'tarifa_atual_teste',
  'codempresa_teste', 'municipio_teste', 'origem_teste', 'localidades_teste',
  'itinerario_teste', 'qh_teste', 'qh_intervalo_teste', 'qh_predeterminado_teste',
  'evento_teste', 'evento_empresa_teste', 'evento_linha_teste', 'portaria_teste',
  ...['evento_dados', 'evento_textos', 'portaria_data', 'portaria_texto_teste'], // staging
];

// Tabelas com identity `row_id`: depois de inserir linhas que já trazem row_id, a sequência fica
// atrasada e o próximo INSERT que omitir row_id colide. Ver o passo 5 do caminho B em
// docs/backup.md — o restore imprime o SQL de setval para estas.
export const COM_IDENTITY = [
  'evento_empresa_teste', 'evento_linha_teste', 'itinerario_teste',
  'qh_intervalo_teste', 'qh_predeterminado_teste',
];
