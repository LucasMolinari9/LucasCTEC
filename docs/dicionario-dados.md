# Dicionário de dados — Portal DIVAT (`bd_teste`)

Resposta em linguagem direta a três perguntas: **quais tabelas existem e com que colunas**,
**o que liga uma na outra**, e **qual é o identificador de uma linha**.

> **Nunca mexeu neste banco?** Comece por [`docs/como-os-dados-se-ligam.md`](como-os-dados-se-ligam.md),
> que explica o modelo do zero, com exemplo passo a passo. Este arquivo aqui é **material de
> consulta** — pressupõe que você já entendeu o desenho e quer procurar uma coluna ou uma chave.

Complementa os outros dois mapas do repo, sem substituir nenhum:

- [`docs/schema.md`](schema.md) — mapa **relacional** (o diagrama, quais joins são FK real e
  quais são convenção do ETL).
- `CLAUDE.md` §"Tabelas → onde aparecem (cards)" — mapa **funcional** (qual tela lê qual tabela).
- Este arquivo — o **dicionário**: a lista de colunas, tabela por tabela.

Fonte: o DDL versionado em [`docs/backup_schema.sql`](backup_schema.sql) (estrutura) + os
`select=` reais do `app.js` (o que o portal de fato lê). Contagens de linha: snapshot de
15/07/2026.

---

## Resposta curta

**1. O identificador de uma linha é o `codlinha`** — sim, é aquele código de 9 dígitos tipo
`132004001`. Ele é `varchar` (texto, não número) e o portal o exibe formatado como
`132-004-001`. **Ressalva importante:** a chave primária do cadastro é o **par
`(codempresa, codlinha)`**, não o `codlinha` sozinho — ver a seção "O identificador de uma
linha" abaixo, que explica quando essa diferença morde.

**2. São 18 tabelas** — 14 que o portal lê, mais `portaria_teste` e 4 de staging do ETL.

**3. Duas das três ligações que você citou estão certas; uma não existe:**

| Sua frase | Veredito |
|---|---|
| "itinerário pertence a uma linha" | ✅ **Certo** — `itinerario_teste.codlinha` → `tabela_vista_teste.codlinha`. |
| "horário pertence a uma linha e a um dia da semana" | ✅ **Quase** — pertence a uma linha, a um **dia da semana** *e* a uma **origem/terminal** (o sentido). E há **duas** tabelas de horário, não uma. |
| "linha tem várias portarias" | ❌ **Não existe no banco.** `portaria_teste` **não tem** `codlinha` nem `codempresa` — é um acervo de legislação independente, sem nenhum vínculo com linha. O que faz esse papel é `evento_teste`. Detalhe na seção "A ligação que você esperava e não existe". |

---

## O identificador de uma linha

### É o `codlinha`

- **Tipo:** `character varying` — **texto**, não inteiro. Nas queries ele é comparado e
  codificado como string; tratar como número perde zero à esquerda e quebra o join.
- **Formato:** 9 dígitos. O portal formata para exibição com `fmtCode()` (`app.js:174`):
  `132004001` → **`132-004-001`**, o formato do PDF oficial. A função só formata quando o
  código tem exatamente 9 caracteres; qualquer outro tamanho sai cru.
- **Onde nasce:** `tabela_vista_teste`, o cadastro de linhas — o **hub** do banco. Todo o
  resto (itinerário, horários, tarifa, frota, eventos) aponta de volta para lá por `codlinha`.
- **O que o usuário digita na busca:** o portal aceita `codlinha` com ou sem os hífens, o
  `numero_ligacao` ou o nome da ligação (`lineMatchesTerm`, `app.js:1260`).

### A ressalva: a PK é composta

```sql
CONSTRAINT pk_tabela_vista PRIMARY KEY (codempresa, codlinha)
```

O banco garante unicidade do **par**, não do `codlinha` sozinho — o índice `codlinha` isolado
(`idx_tabela_vista_codlinha`) é btree **não-UNIQUE**. Na prática o portal trata `codlinha`
como se fosse único: busca linha com `codlinha=eq.<cod>&limit=1` e fica com a primeira que
vier. Isso funciona enquanto o ETL não cadastrar o mesmo `codlinha` para duas empresas — se
cadastrar, o portal escolhe uma em silêncio, sem erro. **Ao mexer no ETL, mantenha `codlinha`
único de fato.**

A **única FK real do banco**, `fk_tarifa_linha`, usa o par completo (`codempresa`, `codlinha`)
justamente porque é ele que é a PK. Todos os outros joins são convenção — o Postgres não os
valida (ver o aviso de linhas órfãs em [`docs/schema.md`](schema.md)).

### Os outros códigos, que **não** são o identificador

| Campo | O que é | Por que não serve de identificador |
|---|---|---|
| `numero_ligacao` | O número **público** da linha (o que vai no letreiro/no PDF). O portal prefere ele na exibição e cai para `fmtCode(codlinha)` quando está vazio. | Pode estar nulo, e não é usado em nenhum join. |
| `codempresa` | O **registro da empresa** — exibido como `RJ-<codempresa>`. | Identifica a empresa, não a linha; uma empresa tem centenas de linhas. |
| `id` | Coluna de importação, presente em quase toda tabela. | Não é global nem estável entre tabelas; nas 3 tabelas grandes ele **se repete**, e por isso essas tabelas ganharam um `row_id` surrogate. |
| `row_id` | PK técnica (`bigint` identity) das tabelas cujo `id` repete. | Existe só para o Postgres ter PK; o front nem seleciona. |

---

## As 18 tabelas e suas colunas

### O hub

#### `tabela_vista_teste` — cadastro de linhas · 1.869 linhas
PK `(codempresa, codlinha)`. É daqui que sai o `codlinha` que amarra tudo.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | integer | da importação; não é PK |
| `codlinha` | varchar **NOT NULL** | **o identificador da linha** |
| `numero_ligacao` | text | número público exibido |
| `nome_ligacao` | text | ex.: "Rio × Niterói" |
| `nome_lig_cresc` | text | nome no sentido crescente |
| `via` | text | via/itinerário resumido |
| `codempresa` | varchar **NOT NULL** | registro da empresa (RJ-…) |
| `tipo` | text | |
| `licitado` | boolean | |
| `caracteristica` | text | |
| `data_criacao` | date | |
| `processo_criacao` | text | |
| `cancelado` | boolean | ⟵ situação |
| `paralisado` | boolean | ⟵ situação |
| `sub_judice` | boolean | ⟵ situação |
| `transferido` | boolean | ⟵ situação |

> **Situação da linha** sai desses 4 booleanos, por duas regras distintas (`app.js:204`):
> **ativa** = `!cancelado && !paralisado`; **vigente** (critério estrito, usado em seção/tarifa)
> = ativa **e** `!sub_judice && !transferido`. Repare que `sub_judice`/`transferido` têm efeito
> oposto nas duas. Não confundir uma com a outra.

### Os fatos (ligam ao hub por `codlinha`)

#### `tarifa_atual_teste` — tarifas por seção · 3.488 linhas
PK `ordem_importacao`. **A única com FK real** (`fk_tarifa_linha` → hub, com `ON DELETE CASCADE`).

`codempresa`, `codlinha`, `secao` (int), `numero_linha`, `nome_ligacao`, `nome_ligacao_cresc`,
`via`, `caracteristica`, `tipo_ligacao`, `rm`, `tarifa` (numeric), `piso_i` (numeric),
`data_criacao`, `cancelado`, `data_cancelamento`, `transferido`, `data_transferencia`,
`paralisado`, `data_paralisacao`, `sub_judice`, `data_sub_judice`, `situacao`,
`ordem_importacao`.

> ⚠️ O `ON DELETE CASCADE` é real: apagar uma linha do hub apaga as tarifas dela junto.

#### `itinerario_teste` — logradouros percorridos · 52.146 linhas (a maior)
PK `row_id`.

`id` (numeric, repete), `codlinha`, `tipo_logradouro`, `nome_logradouro`,
**`cod_municipio_origem`** (int), `sentido`, `codempresa`, `row_id`.

> ⚠️ `cod_municipio_origem` é **código IBGE de município** → `municipio_teste`. **Não** é
> terminal. Chamava-se `cod_origem` e foi renomeada justamente para não confundir com o
> `cod_origem` das tabelas de horário.

#### `qh_intervalo_teste` — horários por intervalo ("de X em X min") · 9.598 linhas
PK `row_id`.

`id`, `codlinha`, `dia_semana` (text), `cod_origem` (varchar), `nome_origem` (text),
`hora_inicio` (time), `hora_fim` (time), `intervalo` (int), `row_id`.

#### `qh_predeterminado_teste` — horários com saída fixa · 23.838 linhas
PK `row_id`.

`id`, `codlinha`, `dia_semana` (text), `cod_origem` (varchar), `nome_origem` (text),
`saida` (time), `row_id`.

#### `qh_teste` — frota da linha · 1.490 linhas
PK `id`. Apesar do nome "qh", é a tabela de **frota**, não de horário — o portal lê 1 linha por
`codlinha`.

`id`, `codlinha`, `codempresa`, `ultima_alteracao` (date), `frota_micro_a`, `frota_micro_sa`,
`frota_micro_ac`, `frota_micro_e`, `frota_micro_sac`, `frota_a`, `frota_sa`, `frota_ac`,
`frota_sac`, `frota_e`, `frota_operacional`, `reserva` (todos int), `hierarquia` (text).

#### `evento_teste` — histórico de atos por linha/empresa · 20.753 linhas
PK `id`. **É esta que carrega o histórico jurídico-administrativo da linha** (o papel que você
imaginou para "portarias").

`id`, `codempresa` (text), `codlinha` (text), `data_registro` (date), `numero_processo` (text),
`evento_empresa` (text), `data_publicacao` (date), `evento_linha` (text), `descricao` (text),
`observacao` (text).

> ⚠️ **`evento_linha` e `evento_empresa` aqui guardam um CÓDIGO, não o texto** — o texto vem
> das tabelas de lookup de mesmo nome (ver abaixo). Nome de coluna igual, conteúdo oposto.

### Dimensões / lookups

#### `codempresa_teste` — empresas · 133 linhas
PK `id`. `codempresa` é único **por convenção do ETL** — o índice é btree **não**-UNIQUE, o
banco não garante.

`id`, `codempresa` (varchar), `nome_empresa`, `situacao`, `processo`, `data_publicacao` (date),
`cassada` (boolean), `sob_intervencao` (boolean).

#### `origem_teste` — terminais/origens · 548 linhas
PK `cod_origem`. → `cod_origem` (integer), `nome_origem` (text).

> ⚠️ PK é `integer`, mas o `cod_origem` das tabelas de horário é `varchar`. O join atravessa
> tipos diferentes — é feito no JS, então passa despercebido; num SQL exigiria cast.

#### `municipio_teste` — municípios · 92 linhas
PK `cod_ibge`. → `cod_ibge` (integer), `nome_municipio`, `regiao_municipio`, `regiao_novo`.

#### `evento_empresa_teste` — tipos de evento de empresa · 51 linhas
PK `row_id`. → `id` (integer — **o código referenciado por `evento_teste.evento_empresa`**),
`evento_empresa` (text — a descrição), `row_id`.

#### `evento_linha_teste` — tipos de evento de linha · 82 linhas
PK `row_id`. → `id` (integer — **o código referenciado por `evento_teste.evento_linha`**),
`evento_linha` (text — a descrição), `row_id`.

#### `localidades_teste` — lista de localidades · 752 linhas
PK `ordem_importacao`. → `localidade` (text), `ordem_importacao` (integer).
Lista de referência solta — **não** se liga a linha por chave; o cruzamento é por texto.

### Documento independente

#### `portaria_teste` — legislação · 2.100 linhas
PK `id`.

`id`, `numero_portaria` (varchar), `data_portaria` (date), `data_publicacao` (date),
`tipo_portaria`, `tipo_legislacao`, `assunto`, `conteudo`, `vigor` (boolean),
`portaria_anterior` (text).

> **Sem `codlinha` e sem `codempresa`.** A única ligação que ela tem é consigo mesma:
> `portaria_anterior` aponta (por texto livre) para a portaria que a antecede. Tem o trigger
> `trg_vigor_auto` (`BEFORE INSERT OR UPDATE`) que mantém o campo `vigor`.

### Staging do ETL (o portal **não** lê)

RLS ligado **sem policy** e sem grant para `anon` — invisíveis pela API pública, de propósito.
Alimentadas via service role pelo painel do Supabase.

| Tabela | Colunas | Junta com | Monta |
|---|---|---|---|
| `evento_dados` | `id`, `codempresa`, `codlinha`, `data_registro`, `evento_linha`, `evento_empresa`, `data_publicacao` | `evento_textos` por `id` | `evento_teste` |
| `evento_textos` | `id`, `numero_processo`, `descricao`, `observacao` | `evento_dados` por `id` | `evento_teste` |
| `portaria_data` | `id`, `numero_portaria`, `data_portaria`, `data_publicacao`, `vigor`, `tipo_portaria`, `portaria_anterior` | `portaria_texto_teste` por `id` | `portaria_teste` |
| `portaria_texto_teste` | `id`, `tipo_legislacao`, `assunto`, `conteudo` | `portaria_data` por `id` | `portaria_teste` |

> ⚠️ **Correção de dado na tabela final tem de ser replicada na staging** — senão o próximo
> rebuild do ETL desfaz a correção.

---

## O que liga em quê

Modelo **hub-and-spoke**: `tabela_vista_teste` no centro, tudo pendurado por `codlinha`.

### Em uma frase cada

- **Uma linha tem N trechos de itinerário** — `itinerario_teste.codlinha`. Cada trecho é um
  logradouro, com sentido e município (IBGE).
- **Uma linha tem N faixas de horário por intervalo** — `qh_intervalo_teste.codlinha`. Cada
  faixa é (linha + dia da semana + origem/terminal) → de `hora_inicio` a `hora_fim`, a cada
  `intervalo` minutos.
- **Uma linha tem N saídas predeterminadas** — `qh_predeterminado_teste.codlinha`. Cada saída é
  (linha + dia da semana + origem/terminal) → uma hora fixa.
- **Uma linha tem 1 registro de frota** — `qh_teste.codlinha` (o portal lê com `limit=1`).
- **Uma linha tem N seções tarifárias** — `tarifa_atual_teste`, uma por `secao`. **Única FK real.**
- **Uma linha tem N eventos** — `evento_teste.codlinha`, o histórico de atos administrativos.
- **Uma linha pertence a 1 empresa** — `codempresa` → `codempresa_teste`.
- **Um trecho de itinerário fica em 1 município** — `cod_municipio_origem` → `municipio_teste.cod_ibge`.
- **Um horário parte de 1 origem/terminal** — `cod_origem` → `origem_teste.cod_origem`.
- **Um evento tem 1 tipo** — `evento_teste.evento_linha` → `evento_linha_teste.id` (e o mesmo
  para empresa).

### Tabela de joins

| De (filho) | Coluna | Para (pai) | Coluna | Cardinalidade | Garantia |
|---|---|---|---|---|---|
| `tarifa_atual_teste` | `codempresa`+`codlinha` | `tabela_vista_teste` | PK | N:1 | **FK real** (`fk_tarifa_linha`, CASCADE) |
| `itinerario_teste` | `codlinha` | `tabela_vista_teste` | `codlinha` | N:1 | convenção |
| `qh_intervalo_teste` | `codlinha` | `tabela_vista_teste` | `codlinha` | N:1 | convenção |
| `qh_predeterminado_teste` | `codlinha` | `tabela_vista_teste` | `codlinha` | N:1 | convenção |
| `qh_teste` | `codlinha` | `tabela_vista_teste` | `codlinha` | 1:1 na prática | convenção |
| `evento_teste` | `codlinha` | `tabela_vista_teste` | `codlinha` | N:1 | convenção |
| `tabela_vista_teste` | `codempresa` | `codempresa_teste` | `codempresa` | N:1 | convenção |
| `itinerario_teste` | `cod_municipio_origem` | `municipio_teste` | `cod_ibge` | N:1 | convenção |
| `qh_intervalo_teste` | `cod_origem` | `origem_teste` | `cod_origem` | N:1 | convenção |
| `qh_predeterminado_teste` | `cod_origem` | `origem_teste` | `cod_origem` | N:1 | convenção |
| `evento_teste` | `evento_linha` | `evento_linha_teste` | `id` | N:1 | convenção |
| `evento_teste` | `evento_empresa` | `evento_empresa_teste` | `id` | N:1 | convenção |
| `portaria_teste` | `portaria_anterior` | `portaria_teste` | `numero_portaria` | N:1 | texto livre |
| `localidades_teste` | — | — | — | — | sem chave; cruzamento por texto |

**"Convenção" quer dizer: o Postgres não valida.** A integridade depende só da disciplina do
ETL — e **já falhou**: há 17 `codlinha` órfãs e 4 `cod_origem` inexistentes medidos em
27/07/2026. Quando isso acontece **a tela sai vazia, sem erro**. O alarme é
`scripts/check_data_quality.mjs`; a dívida conhecida está em
`scripts/data_quality_baseline.json`. Contexto completo em [`docs/schema.md`](schema.md).

### "Horário pertence a uma linha e a um dia da semana" — o detalhe

Está certo, com dois ajustes:

1. **São duas tabelas de horário, não uma.** Uma linha pode ter as duas ao mesmo tempo:
   - `qh_intervalo_teste` — "de 20 em 20 min, das 05:00 às 09:00";
   - `qh_predeterminado_teste` — "sai 05:12, 05:40, 06:15".
2. **A chave lógica tem três partes, não duas:** `codlinha` + `dia_semana` + `cod_origem`.
   O `cod_origem` é o terminal de partida — é ele que define o **sentido** do horário (ida
   vs. volta são origens diferentes). Um quadro de horários filtrado só por linha e dia mistura
   os dois sentidos.

E `dia_semana` é uma **coluna de texto livre**, não uma tabela de dimensão: não há
`dia_semana_teste`. O portal agrupa pelo valor cru da coluna (`groupBy(list, r=>r.dia_semana)`),
ou seja, "SEGUNDA" e "Segunda" seriam dois grupos distintos.

### A ligação que você esperava e não existe

**"Linha tem várias portarias" não é representável neste banco.** `portaria_teste` não tem
`codlinha` nem `codempresa` — é um acervo de legislação consultado por número, data, assunto e
conteúdo (tem índices trigram nesses campos justamente para busca textual), e o portal a expõe
como um documento independente, não como filho da linha.

O que de fato cumpre o papel de "os atos que afetam esta linha" é **`evento_teste`**: tem
`codlinha`, `numero_processo`, `data_registro`, `data_publicacao`, `descricao`, `observacao` e o
tipo do evento. É ela que o card **Histórico** lê.

Se um dia você quiser a ligação real linha↔portaria, ela precisa ser **criada** (coluna de
vínculo ou tabela de junção `portaria_linha`), passando pela skill `db-change` — e o vínculo
teria de ser extraído do texto das portarias, que hoje é a única pista de qual linha cada uma
atinge.

---

## Armadilhas de nomenclatura (o resumo que evita bug)

1. **`cod_origem` ≠ `cod_municipio_origem`.** O primeiro é **terminal** (tabelas de horário →
   `origem_teste`); o segundo é **município IBGE** (`itinerario_teste` → `municipio_teste`).
2. **`codlinha` e `codempresa` são texto**, não inteiro. Comparar como número quebra o join.
3. **`evento_linha`/`evento_empresa` mudam de significado conforme a tabela:** em
   `evento_teste` é o **código**; em `evento_linha_teste`/`evento_empresa_teste` é a
   **descrição**.
4. **`nome_origem` vem denormalizado** nas tabelas de horário e às vezes está trocado — o nome
   autoritativo é o de `origem_teste`, e é ele que o código prioriza.
5. **`qh_teste` é frota, não horário.** Os horários são `qh_intervalo_teste` e
   `qh_predeterminado_teste`.
6. **`id` não é identificador confiável.** Nas tabelas grandes ele repete; a PK de verdade é o
   `row_id`.
