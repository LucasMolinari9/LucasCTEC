/* ============================================================================
   PAINEL DE ADMINISTRAÇÃO — DIVAT · PREVIEW
   ----------------------------------------------------------------------------
   ESTE ARQUIVO É UM PREVIEW NAVEGÁVEL, NÃO A IMPLEMENTAÇÃO.

   O que ele faz de verdade:
     · LÊ o banco (leitura anônima, que já existe hoje) e mostra dado real;
     · quando o banco não responde ou vem vazio, cai para dados de demonstração,
       para o painel ser avaliável de qualquer jeito;
     · roda a VALIDAÇÃO DE INTEGRIDADE de verdade, sobre os dados carregados —
       é a parte que mais importa avaliar, e é lógica pura, não depende de escrita.

   O que ele NÃO faz, de propósito:
     · não grava nada. Não existe INSERT/UPDATE/DELETE aqui, nem poderia haver:
       o banco não concede escrita a `anon` nem a `authenticated`. Toda "edição"
       vive num armazém em memória (`loja`) e morre no F5.
     · não autentica. A tela de login é maquete.

   Por que assim: avaliar o desenho do painel não deve custar uma mudança
   irreversível de privilégio no banco. Primeiro se olha, depois se decide, e só
   então se mexe em GRANT/policy — que é a parte perigosa e a que exige migração,
   atualização de baseline e revisão.

   SEÇÕES (dê grep na marca):
     [1] AMBIENTE           — para qual banco este preview aponta
     [2] DEMONSTRAÇÃO       — fixtures usadas quando o banco não responde
     [3] LOJA               — estado em memória + trilha de auditoria
     [4] LEITURA            — REST do Supabase, com degradação graciosa
     [5] VALIDAÇÃO          — as regras que o banco NÃO tem (a parte séria)
     [6] ÍCONES / UI BASE   — toast, modal, tabela, etiquetas
     [7] TELAS              — saúde, linhas, empresas, portarias, apoio, CSV, log
     [8] REALTIME           — assinatura ao vivo + presença
     [9] ARRANQUE           — login, navegação, rota
   ============================================================================ */

import { esc, fmtDate, norm, fmtCode } from '../src/domain/core.mjs';

/* ===== [1] AMBIENTE ===== */
/* Mesma doutrina do app.js: produção é ALLOWLIST. Todo host fora dela — inclusive
   toda URL de preview da Vercel, que carrega hash gerado por deploy — cai no banco
   de TESTE. Um preview jamais lê produção; é o que torna esta página segura de
   publicar numa branch. */
const HOSTS_PROD = ['divatdetro.vercel.app',
                    'divatdetro-lucas-molinari-s-projects.vercel.app',
                    'divatdetro-git-main-lucas-molinari-s-projects.vercel.app'];
const SB_TESTE_URL = 'https://gontnlfmothfglssbyyk.supabase.co';
const SB_TESTE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvbnRubGZtb3RoZmdsc3NieXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNTU0OTAsImV4cCI6MjEwMDgzMTQ5MH0.NMEaXXeWxI6A50KuA1euHpSH3Mi53CXU71N16zrjhH4';

const ehProducao = HOSTS_PROD.includes(location.hostname.toLowerCase());
/* Em produção o preview NÃO se conecta a banco nenhum — roda 100% em demonstração.
   Preview é coisa de branch; se este arquivo um dia aparecer no domínio de produção,
   que apareça inerte. */
const SB = ehProducao ? null : { url: SB_TESTE_URL, key: SB_TESTE_KEY };

const RT_TABLES = ['tabela_vista_teste','itinerario_teste','qh_teste','qh_intervalo_teste',
  'qh_predeterminado_teste','tarifa_atual_teste','municipio_teste','origem_teste',
  'localidades_teste','evento_teste','evento_empresa_teste','evento_linha_teste',
  'codempresa_teste','portaria_teste'];

/* ===== [2] DEMONSTRAÇÃO ===== */
/* Fixtures com a MESMA FORMA do banco real. Os nomes de coluna NÃO foram inventados:
   foram tirados de `scripts/lib/rig.mjs` (a bancada dos gates de navegador, que os
   deriva dos `select=` reais do app.js) e de `docs/schema.md`. Isso importa mais do
   que parece — se um nome divergir, ao conectar no banco de verdade a coluna chega
   `undefined` e a tela fica vazia SEM ERRO, que é o modo de falha mais caro deste
   projeto inteiro.

   Duas convenções do banco real que se veem aqui e surpreendem quem espera booleano:
     · `cancelado`/`paralisado`/`sub_judice`/`transferido` guardam DATA (ou vazio), não
       true/false — `isLinhaAtiva` do core.mjs só testa se tem conteúdo;
     · `vigor` em portaria_teste é o texto 'SIM'/'NAO'.

   As fixtures trazem defeitos PLANTADOS — órfãs e acento quebrado — porque é
   exatamente isso que a conferência precisa saber pegar. */
const DEMO = {
  codempresa_teste: [
    { id:1, codempresa:'0142', nome_empresa:'VIAÇÃO SERRA AZUL LTDA',    situacao:'REGULAR', cassada:false, sob_intervencao:false, processo:'E-17/003.114/2019', data_publicacao:'2019-04-12' },
    { id:2, codempresa:'0207', nome_empresa:'EXPRESSO BAIXADA S.A.',     situacao:'REGULAR', cassada:false, sob_intervencao:false, processo:'E-17/001.882/2021', data_publicacao:'2021-08-03' },
    { id:3, codempresa:'0318', nome_empresa:'RÁPIDO NITERÓI TRANSPORTES',situacao:'REGULAR', cassada:false, sob_intervencao:true,  processo:'E-17/002.640/2018', data_publicacao:'2018-11-27' },
    { id:4, codempresa:'0455', nome_empresa:'VIAÇÃO COSTA VERDE LTDA',   situacao:'REGULAR', cassada:false, sob_intervencao:false, processo:'E-17/004.221/2022', data_publicacao:'2022-02-15' },
    { id:5, codempresa:'0512', nome_empresa:'TRANSPORTES REGIÃO SERRANA',situacao:'REGULAR', cassada:false, sob_intervencao:false, processo:'E-17/000.917/2020', data_publicacao:'2020-06-30' },
  ],
  municipio_teste: [
    { cod_ibge:'3304557', nome_municipio:'RIO DE JANEIRO',  regiao_municipio:'METROPOLITANA', regiao_novo:'METROPOLITANA' },
    { cod_ibge:'3303302', nome_municipio:'NITERÓI',         regiao_municipio:'METROPOLITANA', regiao_novo:'METROPOLITANA' },
    { cod_ibge:'3301702', nome_municipio:'DUQUE DE CAXIAS', regiao_municipio:'METROPOLITANA', regiao_novo:'METROPOLITANA' },
    { cod_ibge:'3304904', nome_municipio:'SÃO GONÇALO',     regiao_municipio:'METROPOLITANA', regiao_novo:'METROPOLITANA' },
    { cod_ibge:'3303500', nome_municipio:'NOVA IGUAÇU',     regiao_municipio:'METROPOLITANA', regiao_novo:'METROPOLITANA' },
    { cod_ibge:'3304144', nome_municipio:'PETRÓPOLIS',      regiao_municipio:'SERRANA',       regiao_novo:'SERRANA' },
    { cod_ibge:'3303906', nome_municipio:'NOVA FRIBURGO',   regiao_municipio:'SERRANA',       regiao_novo:'SERRANA' },
    { cod_ibge:'3300456', nome_municipio:'ANGRA DOS REIS',  regiao_municipio:'COSTA VERDE',   regiao_novo:'COSTA VERDE' },
  ],
  origem_teste: [
    { cod_origem:'101', nome_origem:'TERMINAL RODOVIÁRIO NOVO RIO' },
    { cod_origem:'118', nome_origem:'TERMINAL ALVORADA — BARRA' },
    { cod_origem:'204', nome_origem:'TERMINAL RODOVIÁRIO DE NITERÓI' },
    { cod_origem:'305', nome_origem:'TERMINAL DE PETRÓPOLIS' },
    { cod_origem:'412', nome_origem:'TERMINAL DE ANGRA DOS REIS' },
  ],
  tabela_vista_teste: [
    { codlinha:'132004001', codempresa:'0142', numero_ligacao:'105M', nome_ligacao:'RIO DE JANEIRO X PETRÓPOLIS',            nome_lig_cresc:'PETRÓPOLIS X RIO DE JANEIRO',    via:'BR-040',   tipo:'REGULAR', caracteristica:'CONVENCIONAL', cancelado:null, paralisado:null, sub_judice:null, transferido:null, data_criacao:'1998-04-21', processo_criacao:'E-10/117/1998' },
    { codlinha:'132004002', codempresa:'0142', numero_ligacao:'105E', nome_ligacao:'RIO DE JANEIRO X PETRÓPOLIS',            nome_lig_cresc:'PETRÓPOLIS X RIO DE JANEIRO',    via:'BR-040',   tipo:'REGULAR', caracteristica:'EXECUTIVO',    cancelado:null, paralisado:null, sub_judice:null, transferido:null, data_criacao:'2004-09-02', processo_criacao:'E-10/882/2004' },
    { codlinha:'118002015', codempresa:'0207', numero_ligacao:'321D', nome_ligacao:'NOVA IGUAÇU X RIO DE JANEIRO',           nome_lig_cresc:'RIO DE JANEIRO X NOVA IGUAÇU',   via:'DUTRA',    tipo:'REGULAR', caracteristica:'CONVENCIONAL', cancelado:null, paralisado:'2023-11-02', sub_judice:null, transferido:null, data_criacao:'1991-02-14', processo_criacao:'E-10/044/1991' },
    { codlinha:'140007003', codempresa:'0318', numero_ligacao:'412A', nome_ligacao:'NITERÓI X SÃO GONÇALO',                  nome_lig_cresc:'SÃO GONÇALO X NITERÓI',          via:'ALAMEDA',  tipo:'REGULAR', caracteristica:'CONVENCIONAL', cancelado:null, paralisado:null, sub_judice:'2025-01-30', transferido:null, data_criacao:'1987-06-30', processo_criacao:'E-10/210/1987' },
    { codlinha:'155001008', codempresa:'0455', numero_ligacao:'620E', nome_ligacao:'ANGRA DOS REIS X RIO DE JANEIRO',        nome_lig_cresc:'RIO DE JANEIRO X ANGRA DOS REIS',via:'RIO-SANTOS',tipo:'REGULAR',caracteristica:'EXECUTIVO',    cancelado:null, paralisado:null, sub_judice:null, transferido:null, data_criacao:'2009-11-11', processo_criacao:'E-10/551/2009' },
    { codlinha:'163009001', codempresa:'0512', numero_ligacao:'741M', nome_ligacao:'NOVA FRIBURGO X RIO DE JANEIRO',         nome_lig_cresc:'RIO DE JANEIRO X NOVA FRIBURGO', via:'RJ-116',   tipo:'REGULAR', caracteristica:'CONVENCIONAL', cancelado:'2022-05-20', paralisado:null, sub_judice:null, transferido:null, data_criacao:'1979-03-08', processo_criacao:'DTC/1.204/79' },
    { codlinha:'163009004', codempresa:'0512', numero_ligacao:'748M', nome_ligacao:'NOVA FRIBURGO X TERESÓPOLIS',            nome_lig_cresc:'TERESÓPOLIS X NOVA FRIBURGO',    via:'RJ-130',   tipo:'REGULAR', caracteristica:'CONVENCIONAL', cancelado:null, paralisado:null, sub_judice:null, transferido:'2024-08-19', data_criacao:'1995-12-01', processo_criacao:'E-10/703/1995' },
  ],
  itinerario_teste: [
    { id:1, codlinha:'132004001', codempresa:'0142', sentido:'IDA',   tipo_logradouro:'Avenida', nome_logradouro:'AVENIDA BRASIL',                       cod_municipio_origem:'3304557' },
    { id:2, codlinha:'132004001', codempresa:'0142', sentido:'IDA',   tipo_logradouro:'Rodovia', nome_logradouro:'RODOVIA WASHINGTON LUÍS',              cod_municipio_origem:'3304557' },
    { id:3, codlinha:'132004001', codempresa:'0142', sentido:'VOLTA', tipo_logradouro:'Rua',     nome_logradouro:'RUA DO IMPERADOR',                     cod_municipio_origem:'3304144' },
    { id:4, codlinha:'118002015', codempresa:'0207', sentido:'IDA',   tipo_logradouro:'Avenida', nome_logradouro:'AVENIDA GOVERNADOR ROBERTO SILVEIRA', cod_municipio_origem:'3303500' },
    { id:5, codlinha:'155001008', codempresa:'0455', sentido:'IDA',   tipo_logradouro:'Rodovia', nome_logradouro:'RODOVIA RIO-SANTOS',                   cod_municipio_origem:'3300456' },
    /* DEFEITO PLANTADO 1 — codlinha 999999999 não existe no hub: órfã.
       DEFEITO PLANTADO 2 — o `` no nome é U+FFFD, marca de import fora de UTF-8. */
    { id:6, codlinha:'999999999', codempresa:'0142', sentido:'IDA',   tipo_logradouro:'Rua',     nome_logradouro:'RUA CANDEL�RIA',                       cod_municipio_origem:'3304557' },
  ],
  tarifa_atual_teste: [
    { id:1, codlinha:'132004001', codempresa:'0142', secao:1, numero_linha:'105M', nome_ligacao:'RIO DE JANEIRO X PETRÓPOLIS', via:'BR-040', caracteristica:'CONVENCIONAL', tipo_ligacao:'INTERMUNICIPAL', rm:'NAO', tarifa:28.65, situacao:'REGULAR' },
    { id:2, codlinha:'132004001', codempresa:'0142', secao:2, numero_linha:'105M', nome_ligacao:'RIO DE JANEIRO X PETRÓPOLIS', via:'BR-040', caracteristica:'CONVENCIONAL', tipo_ligacao:'INTERMUNICIPAL', rm:'NAO', tarifa:19.10, situacao:'REGULAR' },
    { id:3, codlinha:'132004002', codempresa:'0142', secao:1, numero_linha:'105E', nome_ligacao:'RIO DE JANEIRO X PETRÓPOLIS', via:'BR-040', caracteristica:'EXECUTIVO',    tipo_ligacao:'INTERMUNICIPAL', rm:'NAO', tarifa:41.20, situacao:'REGULAR' },
    { id:4, codlinha:'155001008', codempresa:'0455', secao:1, numero_linha:'620E', nome_ligacao:'ANGRA DOS REIS X RIO DE JANEIRO', via:'RIO-SANTOS', caracteristica:'EXECUTIVO', tipo_ligacao:'INTERMUNICIPAL', rm:'NAO', tarifa:87.35, situacao:'REGULAR' },
    { id:5, codlinha:'140007003', codempresa:'0318', secao:1, numero_linha:'412A', nome_ligacao:'NITERÓI X SÃO GONÇALO', via:'ALAMEDA', caracteristica:'CONVENCIONAL', tipo_ligacao:'INTERMUNICIPAL', rm:'SIM', tarifa:6.90, situacao:'REGULAR' },
  ],
  qh_teste: [
    { id:1, codlinha:'132004001', codempresa:'0142', hierarquia:'PRINCIPAL', ultima_alteracao:'2025-11-02', frota_operacional:12, reserva:2 },
    { id:2, codlinha:'132004002', codempresa:'0142', hierarquia:'PRINCIPAL', ultima_alteracao:'2025-06-18', frota_operacional:6,  reserva:1 },
    { id:3, codlinha:'155001008', codempresa:'0455', hierarquia:'PRINCIPAL', ultima_alteracao:'2024-12-05', frota_operacional:9,  reserva:2 },
    { id:4, codlinha:'140007003', codempresa:'0318', hierarquia:'PRINCIPAL', ultima_alteracao:'2025-03-21', frota_operacional:21, reserva:3 },
  ],
  qh_intervalo_teste: [
    { id:1, codlinha:'132004001', cod_origem:'101', nome_origem:'TERMINAL RODOVIÁRIO NOVO RIO', dia_semana:'UTEIS',  hora_inicio:'05:00', hora_fim:'23:00', intervalo:'30' },
    { id:2, codlinha:'132004001', cod_origem:'305', nome_origem:'TERMINAL DE PETRÓPOLIS',       dia_semana:'UTEIS',  hora_inicio:'05:30', hora_fim:'22:30', intervalo:'30' },
    /* DEFEITO PLANTADO 3 — cod_origem 777 não existe em origem_teste. */
    { id:3, codlinha:'155001008', cod_origem:'777', nome_origem:'TERMINAL DESCONHECIDO',        dia_semana:'SABADO', hora_inicio:'06:00', hora_fim:'20:00', intervalo:'120' },
  ],
  qh_predeterminado_teste: [
    { id:1, codlinha:'132004002', cod_origem:'101', nome_origem:'TERMINAL RODOVIÁRIO NOVO RIO', dia_semana:'UTEIS',   saida:'06:00' },
    { id:2, codlinha:'132004002', cod_origem:'101', nome_origem:'TERMINAL RODOVIÁRIO NOVO RIO', dia_semana:'UTEIS',   saida:'08:30' },
    { id:3, codlinha:'132004002', cod_origem:'305', nome_origem:'TERMINAL DE PETRÓPOLIS',       dia_semana:'DOMINGO', saida:'17:00' },
  ],
  evento_teste: [
    { id:1, codlinha:'132004001', codempresa:'0142', data_registro:'2024-03-18', data_publicacao:'2024-03-21', evento_linha:'2', evento_empresa:null, numero_processo:'E-17/001.204/2024', descricao:'ALTERAÇÃO DE ITINERÁRIO', observacao:'Trecho da Av. Brasil.' },
    { id:2, codlinha:'118002015', codempresa:'0207', data_registro:'2023-11-02', data_publicacao:'2023-11-06', evento_linha:'3', evento_empresa:null, numero_processo:'E-17/003.881/2023', descricao:'PARALISAÇÃO TEMPORÁRIA', observacao:null },
    { id:3, codlinha:'163009001', codempresa:'0512', data_registro:'2022-05-20', data_publicacao:'2022-05-24', evento_linha:'4', evento_empresa:null, numero_processo:'E-17/002.117/2022', descricao:'CANCELAMENTO DA LINHA', observacao:null },
    /* DEFEITO PLANTADO 4 — órfã LEGÍTIMA: ato de 1981, de linha anterior ao cadastro
       atual. Arquivo institucional. Por isso a regra de evento_teste é AVISO, não erro. */
    { id:4, codlinha:'874112003', codempresa:'0142', data_registro:'1981-07-14', data_publicacao:'1981-07-20', evento_linha:'1', evento_empresa:null, numero_processo:'DTC/2.114/81', descricao:'CONCESSÃO ORIGINAL', observacao:'Linha anterior ao cadastro atual (DTC/RJ).' },
  ],
  evento_linha_teste: [
    { id:'1', evento_linha:'CONCESSÃO' },
    { id:'2', evento_linha:'ITINERÁRIO' },
    { id:'3', evento_linha:'PARALISAÇÃO' },
    { id:'4', evento_linha:'CANCELAMENTO' },
  ],
  evento_empresa_teste: [
    { id:'1', evento_empresa:'ALTERAÇÃO CADASTRAL' },
    { id:'2', evento_empresa:'TRANSFERÊNCIA DE CONTROLE' },
  ],
  localidades_teste: [
    { ordem_importacao:1, localidade:'CENTRO' },
    { ordem_importacao:2, localidade:'ITAIPAVA' },
    { ordem_importacao:3, localidade:'MURIQUI' },
    { ordem_importacao:4, localidade:'CONSELHEIRO PAULINO' },
  ],
  portaria_teste: [
    { id:1, numero_portaria:'DETRO/PRES Nº 1.442',    data_portaria:'2024-06-11', data_publicacao:'2024-06-13', tipo_portaria:'PORTARIA', tipo_legislacao:'ATO', vigor:'SIM', assunto:'Reajuste tarifário das linhas regulares intermunicipais.', conteudo:'O DIRETOR-PRESIDENTE DO DETRO/RJ, no uso de suas atribuições…' },
    { id:2, numero_portaria:'DETRO/PRES Nº 1.398',    data_portaria:'2023-12-04', data_publicacao:'2023-12-06', tipo_portaria:'PORTARIA', tipo_legislacao:'ATO', vigor:'NAO', assunto:'Fixação de quadro de horários — ligação 105M.',           conteudo:'Fica estabelecido o quadro de horários…' },
    { id:3, numero_portaria:'RESOLUÇÃO SETRANS Nº 88',data_portaria:'2025-02-19', data_publicacao:'2025-02-21', tipo_portaria:'RESOLUÇÃO',tipo_legislacao:'ATO', vigor:'SIM', assunto:'Critérios de renovação de frota.',                       conteudo:'Considerando a necessidade de modernização…' },
  ],
};

/* Perfis de administrador — no painel real isto é a tabela `admin.perfis`, e é ela
   (não o simples fato de estar logado) que as policies consultam. */
const PERFIS = [
  { id:'u1', nome:'Lucas Molinari',  email:'lucas@detro.rj.gov.br',   iniciais:'LM', ativo:true },
  { id:'u2', nome:'Colega 2',        email:'colega2@detro.rj.gov.br', iniciais:'C2', ativo:true },
  { id:'u3', nome:'Colega 3',        email:'colega3@detro.rj.gov.br', iniciais:'C3', ativo:true },
];
const EU = PERFIS[0];

/* ===== [3] LOJA ===== */
/* Armazém em memória. É a fronteira honesta do preview: tudo que "grava" para
   aqui e morre no recarregamento. No painel real este objeto some e o lugar dele
   é o PostgREST + as policies. */
const loja = {
  dados: {},          // tabela → array de registros
  fonte: 'demo',      // 'banco' | 'demo'
  log: [],            // trilha de auditoria
  proxLog: 1,
  editando: new Map(),// chave do registro → perfil que está editando (presença)
};

function tabela(nome){ return loja.dados[nome] || (loja.dados[nome] = []); }

/* Registra na trilha. No painel real isto é um TRIGGER, não uma chamada — é o que
   impede alguém de escrever sem deixar rastro, inclusive pelo console do navegador. */
function registrarLog({ tabela:tb, operacao, chave, antes, depois }){
  loja.log.unshift({
    id: loja.proxLog++,
    quando: new Date(),
    quem: EU,
    tabela: tb, operacao, chave,
    antes: antes ? { ...antes } : null,
    depois: depois ? { ...depois } : null,
    desfeito: false,
  });
  atualizarAlertaNav();
}

function chaveDe(nomeTabela, reg){
  const k = CHAVES[nomeTabela] || ['id'];
  return k.map(c => reg[c]).join('·');
}

/* Chave primária de cada tabela, conforme docs/schema.md. As três grandes com `id`
   repetido têm surrogate `row_id` no banco, que o front nunca seleciona — aqui o
   `id` basta para identificar a linha na tela. */
const CHAVES = {
  tabela_vista_teste: ['codlinha','codempresa'],
  codempresa_teste: ['id'],
  municipio_teste: ['cod_ibge'],
  origem_teste: ['cod_origem'],
  localidades_teste: ['ordem_importacao'],
  portaria_teste: ['id'],
  evento_teste: ['id'],
  evento_linha_teste: ['id'],
  evento_empresa_teste: ['id'],
  itinerario_teste: ['id'],
  tarifa_atual_teste: ['id'],
  qh_teste: ['id'],
  qh_intervalo_teste: ['id'],
  qh_predeterminado_teste: ['id'],
};

/* ===== [4] LEITURA ===== */
/* Leitura anônima, que é o privilégio que JÁ EXISTE. Nenhuma escrita, em lugar
   nenhum deste arquivo. Se o banco não responder, o preview segue em demonstração:
   a avaliação do desenho não pode depender de rede. */
async function lerTabela(nome, limite = 400){
  if (!SB) return null;
  const url = `${SB.url}/rest/v1/${nome}?select=*&limit=${limite}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { apikey: SB.key, Authorization: `Bearer ${SB.key}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const linhas = await res.json();
    return Array.isArray(linhas) && linhas.length ? linhas : null;
  } catch { return null; }
  finally { clearTimeout(t); }
}

async function carregarTudo(){
  const nomes = Object.keys(DEMO);
  const vindos = await Promise.all(nomes.map(n => lerTabela(n)));
  let doBanco = 0;
  nomes.forEach((n, i) => {
    if (vindos[i]) { loja.dados[n] = vindos[i]; doBanco++; }
    else { loja.dados[n] = DEMO[n].map(r => ({ ...r })); }
  });
  loja.fonte = doBanco > 0 ? 'banco' : 'demo';
  return loja.fonte;
}

/* ===== [5] VALIDAÇÃO ===== */
/* O CORAÇÃO DO PAINEL, e a razão de ele valer mais que o Table Editor do Supabase.

   Este banco tem UMA ÚNICA foreign key real (`fk_tarifa_linha`). Todo o resto das
   ligações é convenção mantida à mão pelo ETL — e já falhou: 17 codlinhas órfãs
   medidas em 27/07/2026. Quando uma órfã existe, o portal NÃO dá erro: a tela do
   usuário sai VAZIA, em silêncio.

   As funções abaixo são o que o Postgres não faz por você. No painel real elas
   viram DUAS coisas: estas mesmas regras num módulo puro (feedback instantâneo no
   formulário) e triggers BEFORE INSERT/UPDATE no banco (a palavra final, que vale
   inclusive para importação em massa). O módulo dá a experiência; o trigger dá a
   garantia. Nenhum dos dois sozinho basta. */

const REGRAS = {
  /* Cada regra: onde olhar, para onde aponta, e o que dizer quando quebra. */
  itinerario_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha',
      msg:'Não existe linha com este código no cadastro. Salvar assim cria uma órfã: o itinerário some da tela do portal, sem mensagem de erro.' },
    { campo:'cod_municipio_origem', alvo:'municipio_teste', alvoCampo:'cod_ibge',
      msg:'Código IBGE de município não encontrado. Atenção: aqui é MUNICÍPIO (cod_municipio_origem), não terminal.' },
  ],
  tarifa_atual_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha',
      msg:'Linha inexistente. Esta é a única ligação que o banco garante por foreign key — o INSERT seria recusado pelo Postgres.' },
    { campo:'codempresa', alvo:'codempresa_teste', alvoCampo:'codempresa',
      msg:'Empresa não cadastrada.' },
  ],
  qh_intervalo_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha',
      msg:'Linha inexistente — o quadro de horários sairia vazio no portal.' },
    { campo:'cod_origem', alvo:'origem_teste', alvoCampo:'cod_origem',
      msg:'Terminal/origem não cadastrado. Aqui é TERMINAL (cod_origem), não município.' },
  ],
  qh_predeterminado_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha', msg:'Linha inexistente.' },
    { campo:'cod_origem', alvo:'origem_teste', alvoCampo:'cod_origem', msg:'Terminal/origem não cadastrado.' },
  ],
  qh_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha', msg:'Linha inexistente — a frota não apareceria.' },
    { campo:'codempresa', alvo:'codempresa_teste', alvoCampo:'codempresa', msg:'Empresa não cadastrada.' },
  ],
  evento_teste: [
    { campo:'codlinha', alvo:'tabela_vista_teste', alvoCampo:'codlinha',
      msg:'Linha inexistente.', gravidade:'aviso',
      nota:'Aviso, não erro: há eventos reais de 1974–1996 de linhas anteriores ao cadastro atual. É arquivo institucional — não se apaga.' },
  ],
  tabela_vista_teste: [
    { campo:'codempresa', alvo:'codempresa_teste', alvoCampo:'codempresa',
      msg:'Empresa não cadastrada — o nome da empresa sairia em branco no banner e nas listas.' },
  ],
};

function existeEm(nomeTabela, campo, valor){
  if (valor === null || valor === undefined || valor === '') return true; // vazio é outra regra
  const alvo = tabela(nomeTabela);
  return alvo.some(r => String(r[campo]) === String(valor));
}

/* Verifica um registro contra as regras da sua tabela. Devolve lista de achados. */
function validarRegistro(nomeTabela, reg){
  const achados = [];
  for (const regra of (REGRAS[nomeTabela] || [])) {
    const valor = reg[regra.campo];
    if (valor === null || valor === undefined || valor === '') continue;
    if (!existeEm(regra.alvo, regra.alvoCampo, valor)) {
      achados.push({
        campo: regra.campo,
        gravidade: regra.gravidade || 'erro',
        msg: regra.msg,
        nota: regra.nota || '',
      });
    }
  }
  // U+FFFD: o caractere que aparece quando um CSV entra com encoding errado.
  for (const [k, v] of Object.entries(reg)) {
    if (typeof v === 'string' && v.includes('�')) {
      achados.push({
        campo: k, gravidade: 'erro',
        msg: 'Texto com caractere corrompido (�). Isso é sinal de importação fora de UTF-8 — o banco foi limpo disso em 21/07/2026 e não deve regredir.',
        nota: '',
      });
    }
  }
  return achados;
}

/* Filhos de uma linha, tabela por tabela. Usado para BLOQUEAR exclusão que criaria
   órfã — a regra que transforma "apagar" em "cancelar", que é o certo no domínio:
   linha extinta não some do cadastro, ganha `cancelado`. */
const FILHOS_DE_LINHA = ['itinerario_teste','tarifa_atual_teste','qh_teste',
                         'qh_intervalo_teste','qh_predeterminado_teste','evento_teste'];

function filhosDaLinha(codlinha){
  const fora = [];
  for (const t of FILHOS_DE_LINHA) {
    const n = tabela(t).filter(r => String(r.codlinha) === String(codlinha)).length;
    if (n) fora.push({ tabela:t, qtd:n });
  }
  return fora;
}

/* Varredura completa — é o relatório que hoje só existe como
   `node scripts/check_data_quality.mjs`, que o dono NÃO consegue rodar do celular. */
function varrerIntegridade(){
  const orfaos = [];
  const corrompidos = [];
  for (const nomeTabela of Object.keys(REGRAS)) {
    for (const reg of tabela(nomeTabela)) {
      for (const a of validarRegistro(nomeTabela, reg)) {
        const item = { tabela:nomeTabela, chave:chaveDe(nomeTabela, reg), ...a, reg };
        if (a.msg.includes('�')) corrompidos.push(item); else orfaos.push(item);
      }
    }
  }
  return { orfaos, corrompidos };
}

/* ===== [6] ÍCONES / UI BASE ===== */
const I = {
  saude:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  linha:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="14" rx="3"/><path d="M3 9h18M7 21h2M15 21h2M7 17v4M17 17v4"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/></svg>',
  empresa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5"/></svg>',
  portaria:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  apoio:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  csv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>',
  log:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  gente:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  busca:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  mais:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  alerta:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  ok:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  voltar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
};

const $  = s => document.querySelector(s);
const el = (id) => document.getElementById(id);

/* --- Toast --- */
let toastT = null;
function toast(msg, tipo = ''){
  const caixa = el('admToast');
  caixa.innerHTML = `<div class="adm-toast-item ${tipo}">${esc(msg)}</div>`;
  caixa.classList.add('vivo');
  clearTimeout(toastT);
  toastT = setTimeout(() => caixa.classList.remove('vivo'), 3200);
}

/* --- Modal --- */
let modalOk = null;
function abrirModal({ titulo, corpo, pe }){
  el('admModalTit').textContent = titulo;
  el('admModalCorpo').innerHTML = corpo;
  el('admModalPe').innerHTML = pe || '';
  el('admModal').classList.remove('oculto');
}
function fecharModal(){ el('admModal').classList.add('oculto'); modalOk = null; }

function confirmar({ titulo, corpo, rotuloOk = 'Confirmar', perigo = false }){
  return new Promise(resolve => {
    abrirModal({
      titulo, corpo,
      pe: `<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
           <button type="button" class="btn ${perigo ? 'btn-perigo-cheio' : 'btn-primario'}" data-modal="sim">${esc(rotuloOk)}</button>`,
    });
    modalOk = resolve;
  });
}

/* --- Etiquetas e formatos --- */
function etiSituacao(r){
  if (r.cancelado)  return '<span class="eti eti-erro">Cancelada</span>';
  if (r.paralisado) return '<span class="eti eti-aviso">Paralisada</span>';
  if (r.sub_judice) return '<span class="eti eti-roxa">Sub judice</span>';
  if (r.transferido)return '<span class="eti eti-info">Transferida</span>';
  return '<span class="eti eti-ok">Ativa</span>';
}
const num = n => Number(n || 0).toLocaleString('pt-BR');
const moeda = v => (v === null || v === undefined || v === '') ? '—'
  : Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });

function empNome(cod){
  const e = tabela('codempresa_teste').find(x => String(x.codempresa) === String(cod));
  return e ? e.nome_empresa : null;
}

/* ===== [7] TELAS ===== */
const SECOES = [
  { grupo:'Acompanhar' },
  { key:'saude',     rot:'Saúde do dado', icone:I.saude },
  { key:'log',       rot:'Auditoria',     icone:I.log },
  { grupo:'Cadastros' },
  { key:'linhas',    rot:'Linhas',        icone:I.linha,    tab:'tabela_vista_teste' },
  { key:'empresas',  rot:'Empresas',      icone:I.empresa,  tab:'codempresa_teste' },
  { key:'portarias', rot:'Portarias',     icone:I.portaria, tab:'portaria_teste' },
  { key:'apoio',     rot:'Tabelas de apoio', icone:I.apoio },
  { grupo:'Ferramentas' },
  { key:'importar',  rot:'Importar CSV',  icone:I.csv },
  { key:'usuarios',  rot:'Administradores', icone:I.gente },
];

let secaoAtual = 'saude';
let ctx = {};   // contexto da tela (linha aberta, aba, busca…)

function renderNav(){
  const nav = el('admNav');
  const { orfaos, corrompidos } = varrerIntegridade();
  const problemas = orfaos.filter(o => o.gravidade === 'erro').length + corrompidos.length;
  nav.innerHTML = SECOES.map(s => {
    if (s.grupo) return `<div class="adm-nav-tit">${esc(s.grupo)}</div>`;
    const cont = s.tab ? `<span class="adm-nav-cont">${num(tabela(s.tab).length)}</span>` : '';
    const alerta = (s.key === 'saude' && problemas) ? `<span class="adm-nav-alerta">${problemas}</span>` : '';
    return `<button type="button" class="adm-nav-item ${s.key === secaoAtual ? 'ativo' : ''}" data-secao="${s.key}">
      ${s.icone}<span>${esc(s.rot)}</span>${alerta || cont}
    </button>`;
  }).join('');
}

function atualizarAlertaNav(){ if (el('admNav').children.length) renderNav(); }

function irPara(key, novoCtx = {}){
  secaoAtual = key;
  ctx = novoCtx;
  location.hash = '#/' + key;
  renderNav();
  renderMain();
  el('admNav').classList.remove('aberto');
  el('admMain').scrollTop = 0;
}

function renderMain(){
  const m = el('admMain');
  const telas = { saude:telaSaude, linhas:telaLinhas, empresas:telaEmpresas,
                  portarias:telaPortarias, apoio:telaApoio, importar:telaImportar,
                  log:telaLog, usuarios:telaUsuarios };
  m.innerHTML = (telas[secaoAtual] || telaSaude)();
  ligarEventos();
}

/* --- 7.1 Saúde do dado ------------------------------------------------------
   A tela que hoje NÃO EXISTE em lugar nenhum acessível. O equivalente é um script
   de terminal que o dono não roda, porque opera pelo celular. Trazer isso para o
   navegador é meio caminho do valor do painel inteiro. */
function telaSaude(){
  const { orfaos, corrompidos } = varrerIntegridade();
  const erros  = orfaos.filter(o => o.gravidade === 'erro');
  const avisos = orfaos.filter(o => o.gravidade === 'aviso');
  const totalLinhas = tabela('tabela_vista_teste').length;
  const ativas = tabela('tabela_vista_teste').filter(r => !r.cancelado && !r.paralisado).length;

  const grupos = {};
  for (const o of [...erros, ...avisos]) (grupos[o.tabela] = grupos[o.tabela] || []).push(o);

  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Saúde do dado</h1>
      <p class="pg-sub">Integridade entre tabelas, medida agora sobre ${loja.fonte === 'banco' ? 'os dados carregados do banco' : 'os dados de demonstração'}.
      Este banco tem <b>uma única</b> chave estrangeira real — todo o resto é convenção, e quando quebra o portal mostra
      <b>tela vazia sem erro</b>.</p>
    </div>
    <div class="pg-acoes">
      <button type="button" class="btn btn-secundario" data-acao="revarrer">Verificar de novo</button>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi ${erros.length ? 'kpi-alerta' : 'kpi-ok'}">
      <div class="kpi-rot">Órfãs (erro)</div>
      <div class="kpi-val">${num(erros.length)}</div>
      <div class="kpi-nota">${erros.length ? 'telas do portal saem vazias' : 'nenhuma ligação quebrada'}</div>
    </div>
    <div class="kpi ${corrompidos.length ? 'kpi-alerta' : 'kpi-ok'}">
      <div class="kpi-rot">Texto corrompido</div>
      <div class="kpi-val">${num(corrompidos.length)}</div>
      <div class="kpi-nota">caractere � — importação fora de UTF-8</div>
    </div>
    <div class="kpi ${avisos.length ? 'kpi-aviso' : ''}">
      <div class="kpi-rot">Avisos</div>
      <div class="kpi-val">${num(avisos.length)}</div>
      <div class="kpi-nota">arquivo histórico, não se apaga</div>
    </div>
    <div class="kpi">
      <div class="kpi-rot">Linhas cadastradas</div>
      <div class="kpi-val">${num(totalLinhas)}</div>
      <div class="kpi-nota">${num(ativas)} ativas</div>
    </div>
  </div>

  ${erros.length ? `
  <div class="aviso aviso-erro">
    ${I.alerta}
    <div>
      <p><b>${erros.length} registro(s) apontam para algo que não existe.</b></p>
      <p>Cada um destes é uma tela que o usuário abre e vê em branco, sem mensagem. O portal não tem
      como avisar — ele pede o filho, o banco devolve zero linhas, e a página renderiza o vazio.</p>
    </div>
  </div>` : `
  <div class="aviso aviso-ok">${I.ok}<div><p><b>Nenhuma ligação quebrada nos dados carregados.</b></p></div></div>`}

  ${Object.entries(grupos).map(([tb, itens]) => `
    <div class="cartao">
      <div class="cartao-topo">
        <span class="cartao-tit mono">${esc(tb)}</span>
        <span class="eti ${itens[0].gravidade === 'aviso' ? 'eti-aviso' : 'eti-erro'}">${itens.length} achado(s)</span>
      </div>
      <div class="cartao-corpo cartao-corpo-liso">
        <div class="tab-rolo"><table class="tab">
          <thead><tr><th>Registro</th><th>Campo</th><th>Valor</th><th>O que acontece</th></tr></thead>
          <tbody>${itens.map(o => `
            <tr>
              <td class="mono">${esc(o.chave)}</td>
              <td class="mono">${esc(o.campo)}</td>
              <td class="mono"><b>${esc(String(o.reg[o.campo] ?? '')).slice(0, 40)}</b></td>
              <td>${esc(o.msg)}${o.nota ? `<div class="hint espaco-topo">${esc(o.nota)}</div>` : ''}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
      </div>
    </div>`).join('')}

  <div class="cartao">
    <div class="cartao-topo"><span class="cartao-tit">Volume por tabela</span></div>
    <div class="cartao-corpo cartao-corpo-liso">
      <div class="tab-rolo"><table class="tab">
        <thead><tr><th>Tabela</th><th class="num">Registros</th><th>Papel</th></tr></thead>
        <tbody>${Object.keys(DEMO).map(t => `
          <tr>
            <td class="mono">${esc(t)}</td>
            <td class="num">${num(tabela(t).length)}</td>
            <td class="hint">${esc(PAPEL[t] || '')}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

const PAPEL = {
  tabela_vista_teste:'Hub — tudo se liga aqui por codlinha',
  codempresa_teste:'Dimensão — nome da empresa em quase todo card',
  municipio_teste:'Dimensão — código IBGE',
  origem_teste:'Dimensão — terminais/origens',
  localidades_teste:'Referência — Linhas por Localidade',
  portaria_teste:'Documento independente',
  evento_teste:'Fato — histórico da linha',
  evento_linha_teste:'Lookup — descrição do evento de linha',
  evento_empresa_teste:'Lookup — descrição do evento de empresa',
  itinerario_teste:'Fato — maior tabela do banco',
  tarifa_atual_teste:'Fato — única com FK real',
  qh_teste:'Fato — frota',
  qh_intervalo_teste:'Fato — quadro por intervalo',
  qh_predeterminado_teste:'Fato — quadro por horário fixo',
};

/* --- 7.2 Linhas -------------------------------------------------------------
   Editor por DOCUMENTO, não grade crua: uma linha, com abas espelhando o portal.
   É o formato em que o dono já pensa o domínio. */
function telaLinhas(){
  if (ctx.codlinha) return editorLinha();

  const termo = norm(ctx.busca || '');
  const sit = ctx.sit || 'todas';
  let linhas = tabela('tabela_vista_teste');
  if (sit === 'ativas')     linhas = linhas.filter(r => !r.cancelado && !r.paralisado);
  if (sit === 'canceladas') linhas = linhas.filter(r => r.cancelado);
  if (termo) linhas = linhas.filter(r =>
    norm(r.codlinha).includes(termo) || norm(r.nome_ligacao).includes(termo) ||
    norm(r.numero_ligacao).includes(termo) || norm(empNome(r.codempresa) || '').includes(termo));

  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Linhas</h1>
      <p class="pg-sub">Cadastro de linhas regulares — o hub do banco. Editar aqui repercute em todos os documentos da linha.</p>
    </div>
    <div class="pg-acoes">
      <button type="button" class="btn btn-primario" data-acao="nova-linha">${I.mais} Nova linha</button>
    </div>
  </div>

  <div class="cartao">
    <div class="cartao-topo">
      <div class="filtros">
        <div class="busca-caixa">
          <span class="busca-icone">${I.busca}</span>
          <input type="search" class="campo-in" id="buscaLinha" placeholder="Código, ligação, nome ou empresa…" value="${esc(ctx.busca || '')}">
        </div>
        <select class="campo-in" id="filtroSit">
          <option value="todas"      ${sit === 'todas' ? 'selected' : ''}>Todas</option>
          <option value="ativas"     ${sit === 'ativas' ? 'selected' : ''}>Ativas</option>
          <option value="canceladas" ${sit === 'canceladas' ? 'selected' : ''}>Canceladas</option>
        </select>
      </div>
      <span class="eti eti-neutra">${num(linhas.length)} de ${num(tabela('tabela_vista_teste').length)}</span>
    </div>
    <div class="cartao-corpo cartao-corpo-liso">
      ${linhas.length ? `<div class="tab-rolo"><table class="tab">
        <thead><tr><th>Código</th><th>Ligação</th><th>Nome</th><th>Empresa</th><th>Situação</th><th></th></tr></thead>
        <tbody>${linhas.map(r => {
          const emp = empNome(r.codempresa);
          return `<tr data-abrir="${esc(r.codlinha)}">
            <td class="mono"><b>${esc(r.codlinha)}</b></td>
            <td class="mono">${esc(r.numero_ligacao || '—')}</td>
            <td>${esc(r.nome_ligacao || '—')}</td>
            <td>${emp ? esc(emp) : `<span class="eti eti-erro">empresa ${esc(r.codempresa)} não cadastrada</span>`}</td>
            <td>${etiSituacao(r)}</td>
            <td class="col-acoes"><button type="button" class="btn btn-secundario btn-mini" data-abrir="${esc(r.codlinha)}">Abrir</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : `<div class="tab-vazia">Nenhuma linha encontrada para este filtro.</div>`}
    </div>
  </div>`;
}

const ABAS_LINHA = [
  { key:'cadastro',  rot:'Cadastro' },
  { key:'itinerario',rot:'Itinerário', tab:'itinerario_teste' },
  { key:'quadro',    rot:'Quadro de horários', tab:'qh_predeterminado_teste' },
  { key:'tarifa',    rot:'Tarifas', tab:'tarifa_atual_teste' },
  { key:'frota',     rot:'Frota', tab:'qh_teste' },
  { key:'eventos',   rot:'Histórico', tab:'evento_teste' },
];

function editorLinha(){
  const linha = tabela('tabela_vista_teste').find(r => String(r.codlinha) === String(ctx.codlinha));
  if (!linha) return `<div class="aviso aviso-erro">${I.alerta}<div>Linha não encontrada.</div></div>`;
  const aba = ctx.aba || 'cadastro';
  const editor = loja.editando.get('linha:' + linha.codlinha);

  return `
  <div class="pg-topo">
    <div>
      <button type="button" class="btn btn-secundario btn-mini" data-acao="voltar-linhas">${I.voltar} Linhas</button>
      <h1 class="pg-tit espaco-topo"><span class="mono">${esc(linha.codlinha)}</span></h1>
      <p class="pg-sub">${esc(linha.nome_ligacao || '')} · ${esc(linha.numero_ligacao || '')} · ${esc(empNome(linha.codempresa) || 'empresa não cadastrada')}</p>
    </div>
    <div class="pg-acoes">
      ${etiSituacao(linha)}
      <button type="button" class="btn btn-perigo btn-mini" data-acao="excluir-linha">Excluir linha</button>
    </div>
  </div>

  ${editor ? `<div class="presenca espaco-topo">
      <span class="presenca-bola">${esc(editor.iniciais)}</span>
      <span><b>${esc(editor.nome)}</b> está editando esta linha agora. Salvar por cima sobrescreve o trabalho dele.</span>
    </div><div class="espaco-topo"></div>` : ''}

  <div class="cartao">
    <div class="abas">
      ${ABAS_LINHA.map(a => {
        const n = a.tab ? tabela(a.tab).filter(r => String(r.codlinha) === String(linha.codlinha)).length : null;
        return `<button type="button" class="aba ${a.key === aba ? 'ativa' : ''}" data-aba="${a.key}">
          ${esc(a.rot)}${n !== null ? `<span class="aba-cont">${n}</span>` : ''}
        </button>`;
      }).join('')}
    </div>
    <div class="cartao-corpo ${aba === 'cadastro' ? '' : 'cartao-corpo-liso'}">
      ${aba === 'cadastro' ? formCadastroLinha(linha) : listaFilhos(aba, linha)}
    </div>
  </div>`;
}

function formCadastroLinha(l){
  const empresas = tabela('codempresa_teste');
  return `
  <form id="formLinha" class="form-grade">
    <label class="campo">
      <span class="campo-rot">Código da linha</span>
      <input class="campo-in mono" name="codlinha" value="${esc(l.codlinha)}" readonly>
      <span class="hint">Chave primária — não editável. Trocar o código é criar outra linha.</span>
    </label>
    <label class="campo" id="campoEmp">
      <span class="campo-rot">Empresa</span>
      <select class="campo-in" name="codempresa">
        ${empresas.map(e => `<option value="${esc(e.codempresa)}" ${String(e.codempresa) === String(l.codempresa) ? 'selected' : ''}>${esc(e.codempresa)} — ${esc(e.nome_empresa)}</option>`).join('')}
        ${empNome(l.codempresa) ? '' : `<option value="${esc(l.codempresa)}" selected>${esc(l.codempresa)} — (não cadastrada)</option>`}
      </select>
    </label>
    <label class="campo">
      <span class="campo-rot">Número da ligação</span>
      <input class="campo-in mono" name="numero_ligacao" value="${esc(l.numero_ligacao || '')}" placeholder="105M">
    </label>
    <label class="campo">
      <span class="campo-rot">Característica</span>
      <input class="campo-in" name="caracteristica" value="${esc(l.caracteristica || '')}">
    </label>
    <label class="campo">
      <span class="campo-rot">Via</span>
      <input class="campo-in" name="via" value="${esc(l.via || '')}">
    </label>
    <label class="campo">
      <span class="campo-rot">Tipo</span>
      <input class="campo-in" name="tipo" value="${esc(l.tipo || '')}">
    </label>
    <label class="campo campo-largo">
      <span class="campo-rot">Nome da ligação</span>
      <input class="campo-in" name="nome_ligacao" value="${esc(l.nome_ligacao || '')}">
    </label>
    <label class="campo campo-largo">
      <span class="campo-rot">Nome no sentido crescente</span>
      <input class="campo-in" name="nome_lig_cresc" value="${esc(l.nome_lig_cresc || '')}">
    </label>
    <div class="campo campo-largo">
      <span class="campo-rot">Situação</span>
      <div class="fileira">
        ${[['cancelado','Cancelada'],['paralisado','Paralisada'],['sub_judice','Sub judice'],['transferido','Transferida']]
          .map(([c, r]) => `<label class="fileira"><input type="checkbox" name="${c}" ${l[c] ? 'checked' : ''}> ${esc(r)}${l[c] ? ` <span class="hint">(${fmtDate(l[c])})</span>` : ''}</label>`).join('')}
      </div>
      <span class="hint">Estas quatro colunas guardam <b>a data do ato</b>, não sim/não — marcar grava a data de hoje.
      E linha extinta recebe <b>Cancelada</b>: não se apaga do cadastro, porque o histórico dela precisa continuar existindo.</span>
    </div>
    <div class="form-pe campo-largo">
      <span class="hint" id="statusForm">Nenhuma alteração.</span>
      <div class="form-pe-dir">
        <button type="button" class="btn btn-secundario" data-acao="voltar-linhas">Cancelar</button>
        <button type="submit" class="btn btn-primario">Salvar alterações</button>
      </div>
    </div>
  </form>`;
}

function listaFilhos(aba, linha){
  const cfg = ABAS_LINHA.find(a => a.key === aba);
  const tb = cfg.tab;
  const regs = tabela(tb).filter(r => String(r.codlinha) === String(linha.codlinha));
  if (!regs.length) return `<div class="tab-vazia">
    Nenhum registro de <b>${esc(cfg.rot.toLowerCase())}</b> para esta linha.<br>
    <span class="hint">No portal, isto é exatamente uma tela em branco para o usuário.</span>
  </div>`;
  const cols = Object.keys(regs[0]).filter(c => c !== 'id' && c !== 'row_id' && c !== 'codlinha');
  return `<div class="tab-rolo"><table class="tab">
    <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${regs.map(r => {
      const problemas = validarRegistro(tb, r);
      return `<tr>
        ${cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${
          c === 'tarifa' ? moeda(r[c]) : esc(String(r[c] ?? '—'))
        }</td>`).join('')}
        <td class="col-acoes">${problemas.length
          ? `<span class="eti eti-erro">${problemas.length} problema(s)</span>`
          : `<button type="button" class="btn btn-secundario btn-mini" data-acao="editar-filho" data-tab="${esc(tb)}" data-chave="${esc(chaveDe(tb, r))}">Editar</button>`}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

/* --- 7.3 Empresas ---------------------------------------------------------- */
function telaEmpresas(){
  const termo = norm(ctx.busca || '');
  let regs = tabela('codempresa_teste');
  if (termo) regs = regs.filter(r => norm(r.nome_empresa).includes(termo) || norm(r.codempresa).includes(termo));
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Empresas</h1>
      <p class="pg-sub">Cadastro de operadoras. É lido por quase todo card do portal — o nome que aparece no banner e nas listas vem daqui.</p>
    </div>
    <div class="pg-acoes"><button type="button" class="btn btn-primario" data-acao="nova-empresa">${I.mais} Nova empresa</button></div>
  </div>
  <div class="cartao">
    <div class="cartao-topo">
      <div class="filtros"><div class="busca-caixa">
        <span class="busca-icone">${I.busca}</span>
        <input type="search" class="campo-in" id="buscaGen" placeholder="Nome ou código…" value="${esc(ctx.busca || '')}">
      </div></div>
      <span class="eti eti-neutra">${num(regs.length)} registro(s)</span>
    </div>
    <div class="cartao-corpo cartao-corpo-liso">
      <div class="tab-rolo"><table class="tab">
        <thead><tr><th>Código</th><th>Razão social</th><th>Situação</th><th>Processo</th><th class="num">Linhas</th><th></th></tr></thead>
        <tbody>${regs.map(r => {
          const nLinhas = tabela('tabela_vista_teste').filter(x => String(x.codempresa) === String(r.codempresa)).length;
          return `<tr>
            <td class="mono"><b>${esc(r.codempresa)}</b></td>
            <td>${esc(r.nome_empresa)}</td>
            <td>${r.cassada ? '<span class="eti eti-erro">cassada</span>'
                 : r.sob_intervencao ? '<span class="eti eti-aviso">sob intervenção</span>'
                 : `<span class="eti eti-ok">${esc(r.situacao || 'regular')}</span>`}</td>
            <td class="mono">${esc(r.processo || '—')}</td>
            <td class="num">${num(nLinhas)}</td>
            <td class="col-acoes">
              <button type="button" class="btn btn-secundario btn-mini" data-acao="editar-empresa" data-id="${esc(r.id)}">Editar</button>
              <button type="button" class="btn btn-perigo btn-mini" data-acao="excluir-empresa" data-id="${esc(r.id)}">Excluir</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* --- 7.4 Portarias --------------------------------------------------------- */
function telaPortarias(){
  const termo = norm(ctx.busca || '');
  let regs = tabela('portaria_teste');
  if (termo) regs = regs.filter(r => norm(r.numero_portaria).includes(termo) || norm(r.assunto).includes(termo));
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Portarias</h1>
      <p class="pg-sub">Legislação. É o cadastro que mais se parece com "digitar uma coisa nova por vez" — e por isso o melhor
      candidato a sair do CSV e virar formulário.</p>
    </div>
    <div class="pg-acoes"><button type="button" class="btn btn-primario" data-acao="nova-portaria">${I.mais} Nova portaria</button></div>
  </div>
  <div class="aviso aviso-info">${I.info}<div>
    <p><b>Esta tabela tem par de staging.</b> O <code>docs/etl.md</code> pede que toda correção em
    <span class="mono">portaria_teste</span> seja repetida em <span class="mono">portaria_data</span> e
    <span class="mono">portaria_texto_teste</span>, casando pelo <span class="mono">id</span>.
    No painel real isso vira um gatilho no banco — deixa de depender de alguém lembrar.</p>
  </div></div>
  <div class="cartao">
    <div class="cartao-topo">
      <div class="filtros"><div class="busca-caixa">
        <span class="busca-icone">${I.busca}</span>
        <input type="search" class="campo-in" id="buscaGen" placeholder="Número ou assunto…" value="${esc(ctx.busca || '')}">
      </div></div>
      <span class="eti eti-neutra">${num(regs.length)} registro(s)</span>
    </div>
    <div class="cartao-corpo cartao-corpo-liso">
      <div class="tab-rolo"><table class="tab">
        <thead><tr><th>Número</th><th>Tipo</th><th>Data</th><th>Publicação</th><th>Vigor</th><th>Assunto</th><th></th></tr></thead>
        <tbody>${regs.map(r => `<tr>
          <td class="mono"><b>${esc(r.numero_portaria)}</b></td>
          <td>${esc(r.tipo_legislacao || '—')}</td>
          <td class="mono">${fmtDate(r.data_portaria)}</td>
          <td class="mono">${fmtDate(r.data_publicacao)}</td>
          <td>${String(r.vigor).toUpperCase() === 'SIM' ? '<span class="eti eti-ok">Em vigor</span>' : '<span class="eti eti-neutra">Sem vigor</span>'}</td>
          <td>${esc(r.assunto || '—')}</td>
          <td class="col-acoes">
            <button type="button" class="btn btn-secundario btn-mini" data-acao="editar-portaria" data-id="${esc(r.id)}">Editar</button>
            <button type="button" class="btn btn-perigo btn-mini" data-acao="excluir-portaria" data-id="${esc(r.id)}">Excluir</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* --- 7.5 Tabelas de apoio -------------------------------------------------- */
const APOIO = [
  { tab:'municipio_teste',      rot:'Municípios',            cols:['cod_ibge','nome_municipio'] },
  { tab:'origem_teste',         rot:'Terminais / origens',   cols:['cod_origem','nome_origem'] },
  { tab:'localidades_teste',    rot:'Localidades',           cols:['ordem_importacao','localidade'] },
  { tab:'evento_linha_teste',   rot:'Tipos de evento — linha',   cols:['id','evento_linha'] },
  { tab:'evento_empresa_teste', rot:'Tipos de evento — empresa', cols:['id','evento_empresa'] },
];

function telaApoio(){
  const alvo = ctx.tab || APOIO[0].tab;
  const cfg = APOIO.find(a => a.tab === alvo);
  const regs = tabela(cfg.tab);
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Tabelas de apoio</h1>
      <p class="pg-sub">As dimensões pequenas. São elas que dão nome ao que as tabelas grandes só guardam como código —
      e é aqui que um código errado vira "—" na tela do usuário.</p>
    </div>
  </div>
  <div class="cartao">
    <div class="abas">
      ${APOIO.map(a => `<button type="button" class="aba ${a.tab === alvo ? 'ativa' : ''}" data-apoio="${esc(a.tab)}">
        ${esc(a.rot)}<span class="aba-cont">${num(tabela(a.tab).length)}</span></button>`).join('')}
    </div>
    <div class="cartao-topo">
      <span class="cartao-tit mono">${esc(cfg.tab)}</span>
      <div class="pg-acoes"><button type="button" class="btn btn-primario btn-mini" data-acao="novo-apoio" data-tab="${esc(cfg.tab)}">${I.mais} Novo registro</button></div>
    </div>
    <div class="cartao-corpo cartao-corpo-liso">
      <div class="tab-rolo"><table class="tab">
        <thead><tr>${cfg.cols.map(c => `<th>${esc(c)}</th>`).join('')}<th class="num">Usos</th><th></th></tr></thead>
        <tbody>${regs.map(r => `<tr>
          ${cfg.cols.map(c => `<td class="${typeof r[c] === 'number' ? 'num' : ''}">${esc(String(r[c] ?? '—'))}</td>`).join('')}
          <td class="num">${num(contarUsos(cfg.tab, r))}</td>
          <td class="col-acoes">
            <button type="button" class="btn btn-secundario btn-mini" data-acao="editar-apoio" data-tab="${esc(cfg.tab)}" data-chave="${esc(chaveDe(cfg.tab, r))}">Editar</button>
            <button type="button" class="btn btn-perigo btn-mini" data-acao="excluir-apoio" data-tab="${esc(cfg.tab)}" data-chave="${esc(chaveDe(cfg.tab, r))}">Excluir</button>
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* Quantos registros dependem desta dimensão — o número que decide se excluir é seguro. */
function contarUsos(nomeTabela, reg){
  let n = 0;
  for (const [tb, regras] of Object.entries(REGRAS)) {
    for (const regra of regras) {
      if (regra.alvo !== nomeTabela) continue;
      n += tabela(tb).filter(r => String(r[regra.campo]) === String(reg[regra.alvoCampo])).length;
    }
  }
  return n;
}

/* --- 7.6 Importar CSV -------------------------------------------------------
   O passo mais perigoso do processo atual vira uma tela que MOSTRA o estrago antes
   de cometê-lo. Hoje o CSV entra pelo Table Editor e o erro só aparece meses depois,
   como acento torto no itinerário de alguém. */
function telaImportar(){
  const d = ctx.diff;
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Importar CSV</h1>
      <p class="pg-sub">O caminho para as tabelas grandes — ninguém vai digitar 52 mil itinerários num formulário.
      A diferença para o Table Editor é esta tela: você vê o que vai acontecer <b>antes</b> de acontecer.</p>
    </div>
  </div>

  <div class="cartao">
    <div class="cartao-topo"><span class="cartao-tit">1 · Escolher destino e conteúdo</span></div>
    <div class="cartao-corpo">
      <div class="form-grade">
        <label class="campo">
          <span class="campo-rot">Tabela de destino</span>
          <select class="campo-in" id="csvTab">
            ${Object.keys(DEMO).map(t => `<option value="${esc(t)}" ${ctx.csvTab === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>
        </label>
        <label class="campo">
          <span class="campo-rot">Modo</span>
          <select class="campo-in" id="csvModo">
            <option value="upsert">Inserir novos e atualizar existentes</option>
            <option value="insert">Somente inserir novos</option>
          </select>
        </label>
        <label class="campo campo-largo">
          <span class="campo-rot">Conteúdo do CSV <em class="campo-nota">(cole aqui, com o cabeçalho na primeira linha)</em></span>
          <textarea class="campo-in mono" id="csvTexto" spellcheck="false">${esc(ctx.csvTexto || CSV_EXEMPLO)}</textarea>
        </label>
      </div>
      <div class="form-pe">
        <span class="hint">O exemplo já vem com defeitos plantados, para você ver a conferência trabalhar.</span>
        <div class="form-pe-dir">
          <button type="button" class="btn btn-primario" data-acao="analisar-csv">Analisar</button>
        </div>
      </div>
    </div>
  </div>

  ${d ? `
  <div class="kpis">
    <div class="kpi kpi-ok"><div class="kpi-rot">Inserções</div><div class="kpi-val">${num(d.novos.length)}</div></div>
    <div class="kpi"><div class="kpi-rot">Atualizações</div><div class="kpi-val">${num(d.alterados.length)}</div></div>
    <div class="kpi ${d.recusados.length ? 'kpi-alerta' : 'kpi-ok'}"><div class="kpi-rot">Recusados</div><div class="kpi-val">${num(d.recusados.length)}</div>
      <div class="kpi-nota">criariam órfã ou têm texto corrompido</div></div>
    <div class="kpi"><div class="kpi-rot">Sem mudança</div><div class="kpi-val">${num(d.iguais)}</div></div>
  </div>

  ${d.recusados.length ? `<div class="aviso aviso-erro">${I.alerta}<div>
    <p><b>${d.recusados.length} linha(s) do arquivo seriam recusadas.</b></p>
    <p>Hoje, pelo Table Editor, elas entrariam sem reclamação — e o defeito só apareceria quando alguém
    abrisse a tela e a encontrasse vazia, ou com o acento quebrado.</p>
  </div></div>` : ''}

  <div class="cartao">
    <div class="cartao-topo"><span class="cartao-tit">2 · Conferir o que vai acontecer</span>
      <span class="eti eti-neutra">${esc(d.tabela)}</span></div>
    <div class="cartao-corpo cartao-corpo-liso">
      ${[...d.recusados, ...d.novos, ...d.alterados].map(l => `
        <div class="diff-linha diff-${l.tipo}">
          <span class="diff-sinal">${l.tipo === 'novo' ? '+' : l.tipo === 'alt' ? '~' : '!'}</span>
          <div class="diff-corpo">
            <div class="diff-tit">${esc(l.rotulo)}</div>
            <div class="diff-det">${l.detalhe}</div>
          </div>
        </div>`).join('')}
    </div>
    <div class="cartao-topo">
      <span class="hint">No preview o botão de gravar não existe — é justamente a parte que exige escrita no banco.</span>
      <div class="pg-acoes"><button type="button" class="btn btn-primario" disabled>Gravar ${num(d.novos.length + d.alterados.length)} registro(s)</button></div>
    </div>
  </div>` : ''}`;
}

/* Exemplo com defeitos PLANTADOS, para a conferência ter o que pegar:
   linha 4 aponta para uma codlinha que não existe; linha 5, para um IBGE que não existe. */
const CSV_EXEMPLO = `id,codlinha,codempresa,sentido,tipo_logradouro,nome_logradouro,cod_municipio_origem
1,132004001,0142,IDA,Avenida,AVENIDA BRASIL,3304557
7,132004001,0142,VOLTA,Rua,RUA TERESA,3304144
8,132004002,0142,IDA,Rodovia,RODOVIA WASHINGTON LUÍS,3304557
9,888888888,0142,IDA,Rua,RUA QUE NAO EXISTE,3304557
10,155001008,0455,IDA,Praça,PRAÇA CENTRAL,9999999`;

function analisarCsv(texto, nomeTabela){
  const linhas = texto.trim().split(/\r?\n/).filter(Boolean);
  if (linhas.length < 2) return null;
  const cols = linhas[0].split(',').map(s => s.trim());
  const chave = CHAVES[nomeTabela] || ['id'];
  const atuais = tabela(nomeTabela);
  const out = { tabela:nomeTabela, novos:[], alterados:[], recusados:[], iguais:0 };

  for (const bruta of linhas.slice(1)) {
    const vals = bruta.split(',');
    const reg = {};
    cols.forEach((c, i) => {
      const v = (vals[i] ?? '').trim();
      reg[c] = v !== '' && !isNaN(Number(v)) && !/^0\d/.test(v) ? Number(v) : v;
    });

    const problemas = validarRegistro(nomeTabela, reg).filter(p => p.gravidade === 'erro');
    if (problemas.length) {
      out.recusados.push({
        tipo:'erro',
        rotulo: cols.map(c => reg[c]).join(' · ').slice(0, 70),
        detalhe: problemas.map(p => `<b>${esc(p.campo)}</b>: ${esc(p.msg)}`).join('<br>'),
      });
      continue;
    }

    const igual = atuais.find(r => chave.every(k => String(r[k]) === String(reg[k])));
    if (!igual) {
      out.novos.push({ tipo:'novo', rotulo:cols.map(c => reg[c]).join(' · ').slice(0, 70), detalhe:'Registro novo.' });
    } else {
      const mudou = cols.filter(c => c in igual && String(igual[c]) !== String(reg[c]));
      if (!mudou.length) { out.iguais++; continue; }
      out.alterados.push({
        tipo:'alt',
        rotulo: chave.map(k => reg[k]).join(' · '),
        detalhe: mudou.map(c => `<b>${esc(c)}</b>: <del>${esc(String(igual[c]))}</del> <ins>${esc(String(reg[c]))}</ins>`).join('<br>'),
      });
    }
  }
  return out;
}

/* --- 7.7 Auditoria --------------------------------------------------------- */
function telaLog(){
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Auditoria</h1>
      <p class="pg-sub">Tudo que foi alterado, por quem, quando, e como estava antes.
      Com o plano Free do Supabase <b>não há restauração a um ponto no tempo</b> — esta trilha é a rede de segurança
      que sobra, e é o que torna "poder apagar" uma decisão aceitável.</p>
    </div>
  </div>

  ${loja.log.length ? '' : `<div class="aviso aviso-info">${I.info}<div>
    <p><b>Nada registrado ainda nesta sessão.</b></p>
    <p>Edite uma linha, empresa ou portaria e volte aqui — cada alteração aparece com o valor anterior e um botão de desfazer.</p>
  </div></div>`}

  ${loja.log.length ? `<div class="cartao"><div class="cartao-corpo cartao-corpo-liso">
    ${loja.log.map(l => `
      <div class="log-item ${l.desfeito ? 'desfeito' : ''}">
        <span class="log-op log-op-${l.operacao[0].toLowerCase()}">${l.operacao === 'INSERT' ? '+' : l.operacao === 'UPDATE' ? '~' : '−'}</span>
        <div class="log-corpo">
          <div class="log-tit">${esc(rotuloOp(l))}</div>
          <div class="log-meta">${esc(l.quem.nome)} · ${l.quando.toLocaleString('pt-BR')} · <span class="mono">${esc(l.tabela)}</span></div>
          ${diffCampos(l)}
        </div>
        <div class="log-dir">
          ${l.desfeito ? '<span class="eti eti-neutra">desfeito</span>'
            : `<button type="button" class="btn btn-secundario btn-mini" data-acao="desfazer" data-log="${l.id}">Desfazer</button>`}
        </div>
      </div>`).join('')}
  </div></div>` : ''}`;
}

function rotuloOp(l){
  const verbo = { INSERT:'Criou', UPDATE:'Alterou', DELETE:'Excluiu' }[l.operacao];
  return `${verbo} ${NOME_TABELA[l.tabela] || l.tabela} ${l.chave}`;
}
const NOME_TABELA = {
  tabela_vista_teste:'a linha', codempresa_teste:'a empresa', portaria_teste:'a portaria',
  municipio_teste:'o município', origem_teste:'o terminal', localidades_teste:'a localidade',
  evento_linha_teste:'o tipo de evento', evento_empresa_teste:'o tipo de evento',
};

function diffCampos(l){
  if (!l.antes || !l.depois) return '';
  const mudou = Object.keys(l.depois).filter(k => String(l.antes[k]) !== String(l.depois[k]));
  if (!mudou.length) return '';
  return `<div class="log-campos">${mudou.map(k =>
    `<code>${esc(k)}</code> ${esc(String(l.antes[k] ?? '—'))} → <b>${esc(String(l.depois[k] ?? '—'))}</b>`).join('<br>')}</div>`;
}

/* --- 7.8 Administradores --------------------------------------------------- */
function telaUsuarios(){
  return `
  <div class="pg-topo">
    <div>
      <h1 class="pg-tit">Administradores</h1>
      <p class="pg-sub">Quem pode escrever no banco. Esta lista não é decoração: no painel real ela é a tabela
      <span class="mono">admin.perfis</span>, e é ela que as policies do Postgres consultam.</p>
    </div>
  </div>

  <div class="aviso aviso-info">${I.info}<div>
    <p><b>Por que a policy pergunta pela lista, e não por "está logado".</b></p>
    <p><span class="mono">authenticated</span> é um papel, não uma pessoa. Se o auto-cadastro do Supabase Auth
    for ligado por engano — é um botão no painel — qualquer pessoa do mundo passa a ser
    <span class="mono">authenticated</span>. Conferindo esta lista, esse estranho continua sem escrever nada.</p>
    <p>Tirar alguém do time é marcar <b>inativo</b> aqui. Sem migração, sem deploy, efeito imediato.</p>
  </div></div>

  <div class="cartao">
    <div class="cartao-corpo cartao-corpo-liso">
      <div class="tab-rolo"><table class="tab">
        <thead><tr><th>Nome</th><th>E-mail</th><th>2 fatores</th><th>Situação</th></tr></thead>
        <tbody>${PERFIS.map(p => `<tr>
          <td><b>${esc(p.nome)}</b></td>
          <td class="mono">${esc(p.email)}</td>
          <td>${p.id === 'u1' ? '<span class="eti eti-ok">ativo</span>' : '<span class="eti eti-aviso">não configurado</span>'}</td>
          <td>${p.ativo ? '<span class="eti eti-ok">ativo</span>' : '<span class="eti eti-neutra">inativo</span>'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ===== [8] REALTIME ===== */
/* Assinatura real. A leitura anônima já está publicada nas 14 tabelas, então o
   canal funciona sem nenhum privilégio novo: é a parte do "tempo real" que sai de
   graça, exatamente como no portal público. */
function iniciarRealtime(){
  const dot = el('admRtDot'), txt = el('admRtTxt');
  if (!SB) { dot.classList.add('morto'); txt.textContent = 'sem banco'; return; }
  const s = document.createElement('script');
  s.src = '../vendor/supabase-js-2.110.7.min.js';
  s.onload = () => {
    try {
      const cli = window.supabase.createClient(SB.url, SB.key, { realtime:{ params:{ eventsPerSecond:5 } } });
      const canal = cli.channel('adm-preview');
      RT_TABLES.forEach(t => canal.on('postgres_changes', { event:'*', schema:'public', table:t }, ev => {
        toast(`Alteração recebida em ${t}`, 'ok');
        if (ev.eventType && loja.fonte === 'banco') carregarTudo().then(renderMain);
      }));
      canal.subscribe(st => {
        const vivo = st === 'SUBSCRIBED';
        dot.classList.toggle('vivo', vivo);
        dot.classList.toggle('morto', !vivo);
        txt.textContent = vivo ? 'ao vivo' : 'sem conexão';
      });
    } catch { dot.classList.add('morto'); txt.textContent = 'indisponível'; }
  };
  s.onerror = () => { dot.classList.add('morto'); txt.textContent = 'indisponível'; };
  document.head.appendChild(s);
}

/* Presença simulada: no painel real vem do canal de Presence do Supabase, que já
   está disponível — com 3 administradores, saber que o outro está na mesma tela
   antes de salvar por cima vale o pouco que custa. */
function simularPresenca(){
  setTimeout(() => {
    loja.editando.set('linha:132004001', PERFIS[1]);
    if (secaoAtual === 'linhas' && ctx.codlinha === '132004001') renderMain();
  }, 4000);
}

/* ===== [9] ARRANQUE ===== */
function ligarEventos(){
  const main = el('admMain');

  main.querySelectorAll('[data-abrir]').forEach(n => n.addEventListener('click', e => {
    e.stopPropagation();
    irPara('linhas', { codlinha: n.dataset.abrir, aba:'cadastro' });
  }));
  main.querySelectorAll('[data-aba]').forEach(n => n.addEventListener('click', () => {
    ctx.aba = n.dataset.aba; renderMain();
  }));
  main.querySelectorAll('[data-apoio]').forEach(n => n.addEventListener('click', () => {
    ctx.tab = n.dataset.apoio; renderMain();
  }));

  const bl = el('buscaLinha');
  if (bl) bl.addEventListener('input', () => { ctx.busca = bl.value; const p = bl.selectionStart; renderMain();
    const novo = el('buscaLinha'); if (novo) { novo.focus(); novo.setSelectionRange(p, p); } });
  const bg = el('buscaGen');
  if (bg) bg.addEventListener('input', () => { ctx.busca = bg.value; const p = bg.selectionStart; renderMain();
    const novo = el('buscaGen'); if (novo) { novo.focus(); novo.setSelectionRange(p, p); } });
  const fs = el('filtroSit');
  if (fs) fs.addEventListener('change', () => { ctx.sit = fs.value; renderMain(); });

  const fl = el('formLinha');
  if (fl) {
    fl.addEventListener('submit', e => { e.preventDefault(); salvarLinha(fl); });
    fl.addEventListener('input', () => {
      const st = el('statusForm');
      if (st) { st.textContent = 'Alterações não salvas.'; }
    });
  }

  main.querySelectorAll('[data-acao]').forEach(n => n.addEventListener('click', () => acao(n.dataset.acao, n.dataset)));
}

async function acao(nome, d){
  switch (nome) {
    case 'voltar-linhas': irPara('linhas', { busca: ctx.busca }); break;
    case 'revarrer': renderMain(); toast('Verificação refeita.', 'ok'); break;

    case 'excluir-linha': {
      const l = tabela('tabela_vista_teste').find(r => String(r.codlinha) === String(ctx.codlinha));
      const filhos = filhosDaLinha(l.codlinha);
      if (filhos.length) {
        /* A regra que separa um painel bom de um Table Editor: recusar a exclusão que
           criaria órfã, e oferecer a ação que o domínio realmente quer. */
        abrirModal({
          titulo:'Exclusão bloqueada',
          corpo:`<div class="aviso aviso-erro">${I.alerta}<div>
              <p><b>Esta linha tem ${filhos.reduce((a, f) => a + f.qtd, 0)} registro(s) dependentes.</b></p>
              <p>Apagá-la deixaria todos eles apontando para o vazio — e as telas correspondentes do portal
              passariam a abrir em branco, sem erro.</p>
            </div>
            <ul>${filhos.map(f => `<li><span class="mono">${esc(f.tabela)}</span> — ${f.qtd} registro(s)</li>`).join('')}</ul>
            <p>No domínio, linha extinta <b>não some do cadastro</b>: ela recebe a marca <b>Cancelada</b>.
            O histórico dela precisa continuar existindo.</p>`,
          pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Entendi</button>
              <button type="button" class="btn btn-primario" data-modal="sim">Marcar como cancelada</button>`,
        });
        modalOk = ok => { if (ok) { const antes = { ...l }; l.cancelado = true;
          registrarLog({ tabela:'tabela_vista_teste', operacao:'UPDATE', chave:l.codlinha, antes, depois:{ ...l } });
          toast('Linha marcada como cancelada.', 'ok'); renderMain(); } };
        break;
      }
      const ok = await confirmar({ titulo:'Excluir linha', perigo:true, rotuloOk:'Excluir',
        corpo:`<p>Excluir a linha <b class="mono">${esc(l.codlinha)}</b>?</p>
               <p class="hint">Nenhum registro depende dela. A ação fica na auditoria e pode ser desfeita.</p>` });
      if (ok) {
        const arr = tabela('tabela_vista_teste');
        arr.splice(arr.indexOf(l), 1);
        registrarLog({ tabela:'tabela_vista_teste', operacao:'DELETE', chave:l.codlinha, antes:l, depois:null });
        toast('Linha excluída.', 'ok');
        irPara('linhas');
      }
      break;
    }

    case 'nova-linha':
      abrirModal({ titulo:'Nova linha', corpo:formNovoRegistro('tabela_vista_teste'),
        pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
            <button type="button" class="btn btn-primario" data-modal="sim">Criar</button>` });
      modalOk = ok => { if (ok) criarDoModal('tabela_vista_teste'); };
      break;

    case 'nova-empresa':
      abrirModal({ titulo:'Nova empresa', corpo:formNovoRegistro('codempresa_teste'),
        pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
            <button type="button" class="btn btn-primario" data-modal="sim">Criar</button>` });
      modalOk = ok => { if (ok) criarDoModal('codempresa_teste'); };
      break;

    case 'nova-portaria':
      abrirModal({ titulo:'Nova portaria', corpo:formNovoRegistro('portaria_teste'),
        pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
            <button type="button" class="btn btn-primario" data-modal="sim">Criar</button>` });
      modalOk = ok => { if (ok) criarDoModal('portaria_teste'); };
      break;

    case 'novo-apoio':
      abrirModal({ titulo:'Novo registro', corpo:formNovoRegistro(d.tab),
        pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
            <button type="button" class="btn btn-primario" data-modal="sim">Criar</button>` });
      modalOk = ok => { if (ok) criarDoModal(d.tab); };
      break;

    case 'editar-empresa':  abrirEdicao('codempresa_teste', r => String(r.id) === d.id); break;
    case 'editar-portaria': abrirEdicao('portaria_teste',  r => String(r.id) === d.id); break;
    case 'editar-apoio':    abrirEdicao(d.tab, r => chaveDe(d.tab, r) === d.chave); break;
    case 'editar-filho':    abrirEdicao(d.tab, r => chaveDe(d.tab, r) === d.chave); break;

    case 'excluir-empresa':  await excluirGenerico('codempresa_teste', r => String(r.id) === d.id); break;
    case 'excluir-portaria': await excluirGenerico('portaria_teste',  r => String(r.id) === d.id); break;
    case 'excluir-apoio':    await excluirGenerico(d.tab, r => chaveDe(d.tab, r) === d.chave); break;

    case 'analisar-csv': {
      const t = el('csvTab').value, txt = el('csvTexto').value;
      ctx.csvTab = t; ctx.csvTexto = txt;
      ctx.diff = analisarCsv(txt, t);
      renderMain();
      if (!ctx.diff) toast('Não consegui ler o CSV — falta cabeçalho?', 'erro');
      break;
    }

    case 'desfazer': {
      const l = loja.log.find(x => String(x.id) === d.log);
      if (!l) break;
      const arr = tabela(l.tabela);
      if (l.operacao === 'DELETE') arr.push({ ...l.antes });
      else if (l.operacao === 'INSERT') {
        const i = arr.findIndex(r => chaveDe(l.tabela, r) === chaveDe(l.tabela, l.depois));
        if (i >= 0) arr.splice(i, 1);
      } else {
        const alvo = arr.find(r => chaveDe(l.tabela, r) === chaveDe(l.tabela, l.depois));
        if (alvo) Object.assign(alvo, l.antes);
      }
      l.desfeito = true;
      toast('Alteração desfeita.', 'ok');
      renderNav(); renderMain();
      break;
    }
  }
}

/* Campos editáveis por tabela, na ordem em que fazem sentido para quem digita. */
const CAMPOS = {
  tabela_vista_teste:['codlinha','codempresa','numero_ligacao','nome_ligacao','nome_lig_cresc','via','tipo','caracteristica'],
  codempresa_teste:['codempresa','nome_empresa','situacao','processo','data_publicacao'],
  portaria_teste:['numero_portaria','tipo_portaria','tipo_legislacao','data_portaria','data_publicacao','vigor','assunto','conteudo'],
  municipio_teste:['cod_ibge','nome_municipio','regiao_municipio','regiao_novo'],
  origem_teste:['cod_origem','nome_origem'],
  localidades_teste:['ordem_importacao','localidade'],
  evento_linha_teste:['id','evento_linha'],
  evento_empresa_teste:['id','evento_empresa'],
  itinerario_teste:['codlinha','codempresa','sentido','tipo_logradouro','nome_logradouro','cod_municipio_origem'],
  tarifa_atual_teste:['codlinha','codempresa','secao','numero_linha','nome_ligacao','tarifa','situacao'],
  qh_teste:['codlinha','codempresa','hierarquia','frota_operacional','reserva','ultima_alteracao'],
  qh_intervalo_teste:['codlinha','cod_origem','nome_origem','dia_semana','hora_inicio','hora_fim','intervalo'],
  qh_predeterminado_teste:['codlinha','cod_origem','nome_origem','dia_semana','saida'],
  evento_teste:['codlinha','codempresa','data_registro','data_publicacao','numero_processo','descricao','observacao'],
};

function formNovoRegistro(nomeTabela, valores = {}){
  const campos = CAMPOS[nomeTabela] || [];
  return `<form id="formModal" class="pilha">
    ${campos.map(c => `<label class="campo" data-campo="${esc(c)}">
      <span class="campo-rot">${esc(c)}</span>
      ${c === 'conteudo' || c === 'descricao'
        ? `<textarea class="campo-in" name="${esc(c)}">${esc(valores[c] ?? '')}</textarea>`
        : `<input class="campo-in ${/cod|id|data|tarifa|km|ordem|secao|frota|intervalo/.test(c) ? 'mono' : ''}" name="${esc(c)}" value="${esc(valores[c] ?? '')}">`}
      <span class="campo-msg oculto"></span>
    </label>`).join('')}
    <div class="hint">A conferência de integridade roda enquanto você digita.</div>
  </form>`;
}

/* Validação ao vivo dentro do modal — o feedback que evita o erro em vez de relatá-lo depois. */
function ligarValidacaoModal(nomeTabela){
  const f = el('formModal');
  if (!f) return;
  const conferir = () => {
    const reg = Object.fromEntries(new FormData(f).entries());
    const achados = validarRegistro(nomeTabela, reg);
    f.querySelectorAll('[data-campo]').forEach(lab => {
      const c = lab.dataset.campo;
      const a = achados.find(x => x.campo === c);
      const msg = lab.querySelector('.campo-msg');
      lab.classList.toggle('campo-erro', !!a && a.gravidade === 'erro');
      msg.classList.toggle('oculto', !a);
      if (a) msg.innerHTML = `${a.gravidade === 'aviso' ? '⚠' : '✕'} ${esc(a.msg)}`;
    });
    const btn = el('admModalPe').querySelector('[data-modal="sim"]');
    if (btn) btn.disabled = achados.some(a => a.gravidade === 'erro');
  };
  f.addEventListener('input', conferir);
  conferir();
}

function criarDoModal(nomeTabela){
  const f = el('formModal');
  const reg = Object.fromEntries(new FormData(f).entries());
  for (const [k, v] of Object.entries(reg)) if (v !== '' && !isNaN(Number(v)) && !/^0\d/.test(v)) reg[k] = Number(v);
  const chavePk = (CHAVES[nomeTabela] || ['id'])[0];
  if (!reg[chavePk]) reg[chavePk] = Math.max(0, ...tabela(nomeTabela).map(r => Number(r[chavePk]) || 0)) + 1;
  tabela(nomeTabela).push(reg);
  registrarLog({ tabela:nomeTabela, operacao:'INSERT', chave:chaveDe(nomeTabela, reg), antes:null, depois:reg });
  toast('Registro criado (só nesta aba).', 'ok');
  renderNav(); renderMain();
}

function abrirEdicao(nomeTabela, achar){
  const reg = tabela(nomeTabela).find(achar);
  if (!reg) return;
  abrirModal({ titulo:'Editar registro', corpo:formNovoRegistro(nomeTabela, reg),
    pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Cancelar</button>
        <button type="button" class="btn btn-primario" data-modal="sim">Salvar</button>` });
  ligarValidacaoModal(nomeTabela);
  modalOk = ok => {
    if (!ok) return;
    const f = el('formModal');
    const novos = Object.fromEntries(new FormData(f).entries());
    for (const [k, v] of Object.entries(novos)) if (v !== '' && !isNaN(Number(v)) && !/^0\d/.test(v)) novos[k] = Number(v);
    const antes = { ...reg };
    Object.assign(reg, novos);
    registrarLog({ tabela:nomeTabela, operacao:'UPDATE', chave:chaveDe(nomeTabela, reg), antes, depois:{ ...reg } });
    toast('Alteração registrada (só nesta aba).', 'ok');
    renderNav(); renderMain();
  };
}

async function excluirGenerico(nomeTabela, achar){
  const arr = tabela(nomeTabela);
  const reg = arr.find(achar);
  if (!reg) return;
  const usos = contarUsos(nomeTabela, reg);
  if (usos) {
    abrirModal({ titulo:'Exclusão bloqueada',
      corpo:`<div class="aviso aviso-erro">${I.alerta}<div>
        <p><b>${usos} registro(s) apontam para este.</b></p>
        <p>Excluir deixaria todos eles órfãos — e o portal passaria a mostrar "—" ou tela vazia,
        sem nenhuma mensagem de erro.</p></div></div>
        <p class="hint">Corrija ou remova quem depende deste registro primeiro.</p>`,
      pe:`<button type="button" class="btn btn-secundario" data-modal="nao">Entendi</button>` });
    modalOk = () => {};
    return;
  }
  const ok = await confirmar({ titulo:'Excluir registro', perigo:true, rotuloOk:'Excluir',
    corpo:`<p>Excluir <b class="mono">${esc(chaveDe(nomeTabela, reg))}</b>?</p>
           <p class="hint">Nada depende dele. Fica na auditoria e pode ser desfeito.</p>` });
  if (ok) {
    arr.splice(arr.indexOf(reg), 1);
    registrarLog({ tabela:nomeTabela, operacao:'DELETE', chave:chaveDe(nomeTabela, reg), antes:reg, depois:null });
    toast('Registro excluído.', 'ok');
    renderNav(); renderMain();
  }
}

function salvarLinha(form){
  const l = tabela('tabela_vista_teste').find(r => String(r.codlinha) === String(ctx.codlinha));
  const antes = { ...l };
  const dados = new FormData(form);
  ['codempresa','numero_ligacao','nome_ligacao','nome_lig_cresc','via','tipo','caracteristica']
    .forEach(c => { l[c] = dados.get(c); });
  /* As quatro colunas de situação guardam DATA. Marcar grava hoje; desmarcar limpa —
     e desmarcar preserva a data original se ela já existia e a caixa continua marcada. */
  const hoje = new Date().toISOString().slice(0, 10);
  ['cancelado','paralisado','sub_judice','transferido'].forEach(c => {
    l[c] = dados.get(c) === 'on' ? (antes[c] || hoje) : null;
  });

  const achados = validarRegistro('tabela_vista_teste', l);
  if (achados.some(a => a.gravidade === 'erro')) {
    Object.assign(l, antes);
    toast(achados[0].msg, 'erro');
    return;
  }
  registrarLog({ tabela:'tabela_vista_teste', operacao:'UPDATE', chave:l.codlinha, antes, depois:{ ...l } });
  toast('Alterações registradas (só nesta aba).', 'ok');
  renderNav(); renderMain();
}

/* --- Ligações fixas da casca --- */
el('formLogin').addEventListener('submit', e => {
  e.preventDefault();
  el('telaLogin').classList.add('oculto');
  el('telaApp').classList.remove('oculto');
  el('admUser').textContent = EU.nome;
  arrancar();
});

el('btnSair').addEventListener('click', () => {
  el('telaApp').classList.add('oculto');
  el('telaLogin').classList.remove('oculto');
});

el('btnMenu').addEventListener('click', () => el('admNav').classList.toggle('aberto'));

/* A faixa de MODO PREVIEW é fixa (tem de continuar visível — é um aviso, não um
   enfeite), e todo o resto do layout se desloca pela altura dela. Essa altura NÃO é
   constante: em tela estreita o texto quebra em duas linhas. Com o valor cravado em
   38px no CSS, a faixa crescia por cima da topbar e ENGOLIA O CLIQUE do botão de menu
   no celular — o painel ficava sem navegação. Medido, não suposto; via CSSOM, que é o
   que a CSP permite (`style-src-attr 'none'` mataria um style="" em silêncio). */
function ajustarAlturaFaixa(){
  const faixa = document.querySelector('.preview-bar');
  if (faixa) document.documentElement.style.setProperty('--h-preview', faixa.offsetHeight + 'px');
}
window.addEventListener('resize', ajustarAlturaFaixa);
ajustarAlturaFaixa();

/* Navegação lateral: listener DELEGADO, ligado uma vez na casca. O `renderNav()`
   reescreve o innerHTML a cada mudança de estado, então ligar item por item depois
   de cada render perderia os handlers na re-pintura seguinte — e ligar dentro do
   `ligarEventos()`, que só varre `#admMain`, não alcança este elemento. */
el('admNav').addEventListener('click', e => {
  const b = e.target.closest('[data-secao]');
  if (b) irPara(b.dataset.secao);
});
el('admModalX').addEventListener('click', () => { if (modalOk) modalOk(false); fecharModal(); });
el('admModalFundo').addEventListener('click', () => { if (modalOk) modalOk(false); fecharModal(); });
el('admModalPe').addEventListener('click', e => {
  const b = e.target.closest('[data-modal]');
  if (!b) return;
  const r = modalOk;
  fecharModal();
  if (r) r(b.dataset.modal === 'sim');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !el('admModal').classList.contains('oculto')) {
    const r = modalOk; fecharModal(); if (r) r(false);
  }
});

el('btnSobrePreview').addEventListener('click', () => {
  abrirModal({
    titulo:'O que é este preview',
    corpo:`<p>Esta página é uma <b>maquete navegável</b> do painel de administração, publicada numa branch
      para ser avaliada antes de qualquer decisão irreversível.</p>
      <p><b>O que é real aqui:</b> o desenho das telas, a navegação, e — o mais importante — as
      <b>regras de integridade</b>. Elas rodam de verdade sobre os dados carregados: as órfãs que você vê
      na Saúde do dado foram encontradas agora, não estão escritas à mão.</p>
      <p><b>O que não é real:</b> o login (maquete) e a gravação. Nenhuma edição sai desta aba.
      Não existe INSERT, UPDATE ou DELETE em lugar nenhum deste código — e nem poderia haver:
      o banco não concede escrita à chave que esta página usa.</p>
      <p><b>Qual banco está lendo:</b> ${SB ? 'o de <b>teste</b>' : '<b>nenhum</b>'}
      (fonte atual: <b>${loja.fonte === 'banco' ? 'dados do banco' : 'dados de demonstração'}</b>).
      Produção é allowlist de domínio e nenhum preview alcança — é doutrina do projeto, não configuração desta página.</p>
      <p>Para o painel gravar de verdade é preciso um passo separado e deliberado: uma migração criando
      o schema <span class="mono">admin</span>, a tabela de perfis, as policies por tabela e os gatilhos de
      validação e auditoria. Nada disso foi feito.</p>`,
    pe:`<button type="button" class="btn btn-primario" data-modal="nao">Fechar</button>`,
  });
  modalOk = () => {};
});

window.addEventListener('hashchange', () => {
  const k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (k && k !== secaoAtual) irPara(k);
});

async function arrancar(){
  el('admAmbiente').textContent = 'carregando…';
  renderNav();
  el('admMain').innerHTML = `<div class="cartao"><div class="cartao-corpo texto-centro hint">Carregando dados…</div></div>`;
  const fonte = await carregarTudo();
  el('admAmbiente').textContent = fonte === 'banco'
    ? 'banco de teste · leitura'
    : 'dados de demonstração';
  const k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  secaoAtual = SECOES.some(s => s.key === k) ? k : 'saude';
  renderNav();
  renderMain();
  iniciarRealtime();
  simularPresenca();
}
