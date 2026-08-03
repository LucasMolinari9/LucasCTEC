# Como os dados se ligam — Portal DIVAT

Explicação do modelo de dados para quem vai mexer nele pela primeira vez. Não pressupõe
conhecimento do banco nem do código: começa pela ideia e só depois desce ao detalhe.

Se você já entendeu o modelo e quer **procurar** uma coluna ou uma chave, o lugar é o
[dicionário de dados](dicionario-dados.md) (lista completa de tabelas e colunas) ou o
[mapa relacional](schema.md) (o diagrama). Este arquivo aqui é o que se lê **antes** dos
outros dois.

---

## 1. A ideia inteira, em uma frase

> **Uma linha de ônibus é uma pasta. O código da linha é o número da pasta. Todo o resto do
> banco são papéis diferentes guardados nessa pasta — e cada papel traz o número da pasta
> escrito no cabeçalho.**

É só isso. Se você entendeu essa frase, entendeu o desenho do banco. O resto deste documento é
detalhar quais são os papéis e o que fazer quando o número no cabeçalho está errado.

Um exemplo do que "papéis diferentes" quer dizer. Para a linha `132-004-001`, existem:

- **um** papel de cadastro (o nome dela, a empresa que opera, se está ativa);
- **dezenas** de papéis de itinerário (um por rua percorrida);
- **dezenas** de papéis de horário (um por saída, ou por faixa de intervalo);
- **alguns** papéis de tarifa (um por seção do trajeto);
- **um** papel de frota (quantos ônibus ela tem);
- **vários** papéis de histórico (cada ato administrativo que ela sofreu desde que existe).

Cada tipo de papel mora em uma tabela diferente. E todos trazem `132004001` no cabeçalho.

---

## 2. O formato é uma estrela, não uma corrente

Isso importa mais do que parece.

Se o banco fosse uma **corrente**, para chegar na tarifa você teria que passar pela linha,
depois pelo itinerário, depois pela seção — um elo puxando o outro. Não é assim.

O banco é uma **estrela**: o cadastro de linhas fica no centro, e cada tabela se liga
**direto** nele, sem passar pelas outras.

```
                    itinerário          horários
                   (por onde passa)    (que horas sai)
                          \                /
                           \              /
        histórico  ──────  CADASTRO DE LINHAS  ────── tarifas
       (o que já              (o centro)              (quanto custa)
        aconteceu)            /        \
                             /          \
                          frota        empresa
                     (quantos ônibus)  (quem opera)
```

**A consequência prática** é a que interessa: para montar a ficha completa de uma linha, você
não percorre um caminho. Você faz a **mesma pergunta a cada tabela, em paralelo**: *"o que você
tem para o código 132004001?"* — e cada uma responde por conta própria, sem depender das
outras.

É literalmente o que o portal faz. Cada card na tela (Itinerários, Quadro de Horários, Tarifas,
Frota, Histórico) é **uma pergunta a uma tabela**. É por isso que os cards são independentes:
se a tabela de horários estiver vazia para aquela linha, o card de tarifa continua funcionando
normalmente.

---

## 3. Cada tabela responde a uma pergunta

A maneira mais rápida de decorar as tabelas não é pelo nome delas — é pela **pergunta que cada
uma responde** sobre a linha.

| A pergunta | Quem responde | Quantos papéis por linha |
|---|---|---|
| "Que linha é essa? De quem é? Está ativa?" | `tabela_vista_teste` — **o cadastro** | 1 |
| "Por onde ela passa?" | `itinerario_teste` | dezenas (uma por logradouro) |
| "Que horas ela sai?" | `qh_predeterminado_teste` (saídas fixas) e `qh_intervalo_teste` (de X em X minutos) | dezenas |
| "Quanto custa?" | `tarifa_atual_teste` | uma por seção do trajeto |
| "Quantos ônibus ela tem?" | `qh_teste` — apesar do nome, é **frota** | 1 |
| "O que já aconteceu com ela?" | `evento_teste` — o histórico | várias, uma por ato |

Essas seis são as tabelas que **falam de linha**. Todas trazem a coluna `codlinha`.

Existem outras, que não falam de linha nenhuma — são os **dicionários**. Chego nelas na seção 6.

---

## 4. Seguindo uma linha pelo banco

Vamos acompanhar uma consulta do começo ao fim. É o que acontece quando alguém digita uma linha
no portal.

> ⚠️ **Os valores abaixo são inventados para ilustrar.** A estrutura (nomes de tabela, de
> coluna, e como elas se ligam) é real; os dados não foram lidos do banco. Não use esta seção
> como fonte de dado.

### Passo 1 — achar a linha no cadastro

Alguém digita `132004001` (ou o nome da ligação). O portal pergunta ao cadastro:

**`tabela_vista_teste`**

| codlinha | numero_ligacao | nome_ligacao | codempresa | cancelado | paralisado |
|---|---|---|---|---|---|
| 132004001 | 750D | RIO × TERESÓPOLIS | 044 | false | false |

Pronto — a linha existe, se chama RIO × TERESÓPOLIS, é operada pela empresa de registro `044`,
e está ativa (nem cancelada nem paralisada).

**Agora o portal tem o número da pasta: `132004001`.** Tudo daqui em diante é ir a cada tabela
com esse número na mão.

### Passo 2 — por onde ela passa

**`itinerario_teste`** — pergunta: `codlinha = 132004001`

| codlinha | sentido | tipo_logradouro | nome_logradouro | cod_municipio_origem |
|---|---|---|---|---|
| 132004001 | IDA | Terminal | RODOVIÁRIA NOVO RIO | 3304557 |
| 132004001 | IDA | Avenida | BRASIL | 3304557 |
| 132004001 | IDA | Rodovia | BR-116 | 3305802 |
| 132004001 | VOLTA | Rodovia | BR-116 | 3305802 |

Uma linha por logradouro. Repare que o `codlinha` **se repete** em todas — é o cabeçalho da
pasta. E repare no `cod_municipio_origem`: ele não diz o nome do município, diz um **código**.
Voltamos nele no passo 5.

### Passo 3 — que horas ela sai

**`qh_predeterminado_teste`** — pergunta: `codlinha = 132004001`

| codlinha | dia_semana | cod_origem | saida |
|---|---|---|---|
| 132004001 | SEGUNDA A SEXTA | 018 | 05:15:00 |
| 132004001 | SEGUNDA A SEXTA | 018 | 06:00:00 |
| 132004001 | SEGUNDA A SEXTA | 227 | 05:40:00 |
| 132004001 | SÁBADO | 018 | 06:30:00 |

Cada linha é **uma saída**. Repare que para saber de que saída se trata você precisa de **três**
coisas, não duas: a linha, o **dia da semana** e o **`cod_origem`** — que é o terminal de onde o
ônibus parte, ou seja, **é ele que diz se é ida ou volta**. `018` e `227` são as duas pontas do
trajeto.

Filtrar só por linha e dia mistura os dois sentidos numa lista só. Esse é o erro mais comum de
quem mexe nessa tabela pela primeira vez.

### Passo 4 — quanto custa

**`tarifa_atual_teste`** — pergunta: `codlinha = 132004001`

| codlinha | secao | nome_ligacao | tarifa | situacao |
|---|---|---|---|---|
| 132004001 | 1 | RIO × TERESÓPOLIS | 32,50 | VIGENTE |
| 132004001 | 2 | RIO × GUAPIMIRIM | 21,80 | VIGENTE |

Uma tarifa por **seção** — trechos parciais do trajeto têm preço próprio.

### Passo 5 — traduzir os códigos

Repare no que temos até aqui: a empresa é `044`, o município é `3304557`, o terminal é `018`.
São todos **códigos**, não nomes. Ninguém quer ler isso na tela.

Então o portal vai a mais três tabelas, que existem só para **traduzir código em nome**:

| Código na mão | Tabela que traduz | Vira |
|---|---|---|
| `codempresa = 044` | `codempresa_teste` | "VIAÇÃO TAL LTDA" |
| `cod_municipio_origem = 3304557` | `municipio_teste` | "Rio de Janeiro" |
| `cod_origem = 018` | `origem_teste` | "Rodoviária Novo Rio" |

Feito isso, a tela pode ser montada com nomes em vez de números. Essas tabelas-tradutoras são o
assunto da seção 6.

---

## 5. Por que o `codlinha` é o identificador (e a pegadinha dele)

O `codlinha` é aquele código de 9 dígitos: `132004001`. O portal mostra ele com hífens —
`132-004-001` — que é o formato do PDF oficial, mas no banco ele é gravado sem hífen.

**Duas coisas que causam bug e valem saber de cor:**

**(a) Ele é texto, não número.** No banco o tipo é `varchar`. Se alguém tratar como número em
alguma planilha ou script de importação, um código que comece com zero perde o zero — e aí ele
não encontra mais nada, porque `"095001000"` e `95001000` não são iguais.

**(b) Sozinho, ele não é a chave primária.** A chave do cadastro é o **par** (empresa + linha).
O portal, na prática, assume que `codlinha` é único e pega o primeiro resultado que vier. Isso
funciona hoje. Mas se o ETL um dia cadastrar o mesmo `codlinha` para duas empresas, o portal
vai escolher um dos dois **em silêncio, sem erro nenhum** — e a tela vai mostrar a linha errada
sem avisar. Manter `codlinha` único é responsabilidade de quem alimenta o banco.

**E os outros números que aparecem?**

- **`numero_ligacao`** (ex.: `750D`) — é o número **público**, o do letreiro. Serve para exibir
  e para buscar, mas não liga nada a nada. Pode estar vazio.
- **`codempresa`** (ex.: `044`) — identifica a **empresa**, não a linha. É o "RJ-044" que
  aparece na tela.
- **`id`** — coluna que veio da importação. **Não confie nela**: nas tabelas grandes ela se
  repete, e foi por isso que essas tabelas ganharam uma coluna técnica separada (`row_id`) só
  para o banco ter uma chave própria.

---

## 6. Os "dicionários" (e por que eles existem)

Você viu no passo 5 que o banco guarda `044` em vez de "VIAÇÃO TAL LTDA". Isso não é preguiça —
é a decisão certa, por dois motivos:

1. **Espaço e repetição.** A tabela de itinerários tem 52 mil linhas. Se cada uma guardasse o
   nome do município por extenso, o mesmo "Rio de Janeiro" estaria escrito milhares de vezes.
2. **Correção em um lugar só.** Se o nome de uma empresa mudar (ou estiver com erro de
   digitação), você corrige **uma** linha na tabela de empresas e a mudança aparece em todas as
   telas. Se o nome estivesse copiado em 52 mil lugares, você teria 52 mil correções a fazer —
   e ia esquecer algumas.

São seis dicionários:

| Dicionário | Traduz | Usado por |
|---|---|---|
| `codempresa_teste` | código da empresa → nome da empresa | cadastro, frota, eventos, itinerário |
| `municipio_teste` | código IBGE → nome do município | itinerário |
| `origem_teste` | código do terminal → nome do terminal | as duas tabelas de horário |
| `evento_linha_teste` | código do tipo de evento → descrição | histórico |
| `evento_empresa_teste` | código do tipo de evento de empresa → descrição | histórico |
| `localidades_teste` | lista de localidades de referência | card de Localidade |

> ⚠️ **Uma armadilha nos dois últimos.** A coluna `evento_linha` existe em **duas** tabelas com
> significados **opostos**: em `evento_teste` (o fato) ela guarda o **código**; em
> `evento_linha_teste` (o dicionário) ela guarda o **texto**. Mesmo nome, conteúdo inverso.
> Quem lê o código pela primeira vez tropeça nisso.

---

## 7. Duas coisas que confundem quase todo mundo

### "Por que tem duas tabelas de horário?"

Porque existem **dois jeitos** de programar um ônibus, e eles não cabem no mesmo formato:

- **Saída fixa** — "sai 05:15, 05:40, 06:20". Cada saída é uma linha da tabela
  `qh_predeterminado_teste`, com uma coluna `saida` que é uma hora.
- **Intervalo** — "das 05:00 às 09:00, de 20 em 20 minutos". Não dá para listar cada saída;
  o que se guarda é a **faixa**. Fica em `qh_intervalo_teste`, com `hora_inicio`, `hora_fim` e
  `intervalo` (em minutos).

Uma mesma linha pode ter as duas coisas ao mesmo tempo — intervalo no horário de pico, saídas
fixas fora dele. Por isso o portal sempre lê as duas tabelas e junta na mesma tela.

### "E `qh_teste`, é horário também?"

**Não.** Apesar do nome (`qh` = quadro de horários), `qh_teste` é a tabela de **frota**: quantos
ônibus a linha tem, por tipo (comum, micro, com ar, sem ar, etc.). É um registro por linha. O
nome é herança do sistema antigo e engana todo mundo na primeira vez.

---

## 8. A pergunta que o banco não responde: "e as portarias dessa linha?"

Essa é a expectativa mais comum de quem chega ao modelo — e a resposta é que **essa ligação não
existe**.

A tabela `portaria_teste` tem 2.100 portarias, com número, data, assunto e o texto integral.
Mas ela **não tem `codlinha`**. Nem `codempresa`. Não há nenhuma coluna ligando uma portaria a
uma linha específica: é um **acervo de legislação**, consultado por número, data ou busca no
texto — como um arquivo de leis, não como um papel dentro da pasta da linha.

**O que de fato cumpre esse papel é o histórico (`evento_teste`).** É lá que estão os atos que
afetam uma linha: número do processo, data de registro, data de publicação, o tipo do evento e
a descrição. É essa tabela que o card **Histórico** lê.

Se um dia a ligação linha↔portaria for necessária de verdade, ela precisa ser **construída** —
não é questão de "descobrir onde está". Seria preciso decidir onde guardar o vínculo e, o mais
trabalhoso, **extrair do texto de cada portaria quais linhas ela atinge**, porque hoje essa
informação só existe em prosa, dentro do campo de conteúdo.

---

## 9. O ponto mais importante: quase nenhuma ligação é verificada

Aqui está a coisa que mais gera problema neste banco, e ela merece ser entendida direito.

Um banco de dados **pode** ser configurado para recusar dado inconsistente. Você declara "esta
coluna tem que apontar para uma linha que existe", e o banco passa a rejeitar qualquer gravação
que desobedeça. É uma trava.

**Neste banco, essa trava está ligada em uma única ligação** — a de tarifa com o cadastro. Todas
as outras (itinerário, horários, frota, histórico, empresa, município, terminal) são
**combinadas, não verificadas**: o banco aceita qualquer valor e confia que quem importou os
dados acertou.

### O que acontece quando o acerto falha

Se um itinerário for gravado com o código `999999999`, que não existe no cadastro:

- o banco **aceita** sem reclamar;
- nenhum aviso aparece em lugar nenhum;
- é um papel guardado numa pasta que não existe.

E o sintoma no portal é o pior possível: **a tela abre vazia, sem mensagem de erro.** Parece um
defeito do site. Não é — é o dado apontando para o nada.

### Isso não é hipótese, já aconteceu

Numa medição feita em 27/07/2026 foram encontrados **17 códigos de linha órfãos** — itinerários,
horários e eventos apontando para linhas que não existem no cadastro — e mais 4 registros com
terminal inexistente. Dois códigos (`146016000` e `191020001`) aparecem órfãos em três tabelas
diferentes cada um.

Nem todo órfão é erro, aliás: sete deles são atos reais de 1974 a 1996, de linhas anteriores ao
cadastro atual — história mais antiga que o próprio sistema, e que **não deve ser apagada**.

Por isso existe uma verificação automática semanal (`scripts/check_data_quality.mjs`), que
compara o estado atual com uma lista da dívida já conhecida (`scripts/data_quality_baseline.json`)
e só dispara alarme quando aparece problema **novo**.

**A lição prática, para quem for mexer nos dados:** o banco não vai te avisar se você errar um
código. Confira o vínculo antes de importar, não depois — depois, o único sintoma é uma tela
vazia que ninguém sabe explicar.

---

## 10. Glossário

Termos que aparecem no código, nos outros documentos e nas conversas sobre este banco.

| Termo | O que quer dizer aqui |
|---|---|
| **Linha** / **ligação** | O serviço de ônibus entre dois pontos. É a unidade central do sistema. |
| **`codlinha`** | O código de 9 dígitos que identifica a linha. O "número da pasta". |
| **`numero_ligacao`** | O número público da linha (o do letreiro). Serve para exibir, não para ligar tabelas. |
| **`codempresa`** | Código de registro da empresa operadora — exibido como `RJ-044`. |
| **Seção** | Trecho parcial do trajeto, com tarifa própria. Uma linha tem várias. |
| **Origem** (`cod_origem`) | O **terminal** de onde o ônibus parte. É o que distingue ida de volta. |
| **`cod_municipio_origem`** | Apesar do nome parecido com o de cima, é o **código IBGE do município** — não é terminal. Os dois nomes já foram confundidos antes; foi por isso que a coluna foi renomeada. |
| **Ativa × vigente** | Duas noções diferentes de "em funcionamento". **Ativa** = não cancelada e não paralisada. **Vigente** é mais estrito: ativa **e** não sub judice **e** não transferida. Não são sinônimos. |
| **Cadastro** / **hub** | A tabela central, `tabela_vista_teste`. |
| **Fato** | Tabela que guarda muitos registros por linha (itinerário, horários, tarifa, histórico). |
| **Dicionário** / **lookup** | Tabela pequena que traduz código em nome (empresa, município, terminal). |
| **ETL** | O processo de importação que alimenta o banco a partir dos arquivos de origem. |
| **Órfão** | Registro que aponta para um código que não existe no cadastro. Sintoma: tela vazia sem erro. |
| **Staging** | Tabelas intermediárias da importação, que o portal não lê. Uma correção feita só na tabela final é desfeita na próxima importação — tem que corrigir na staging também. |

---

## Para onde ir depois

- Precisa da lista de **colunas** de uma tabela → [`dicionario-dados.md`](dicionario-dados.md)
- Precisa do **diagrama** e do detalhe de quais ligações são verificadas → [`schema.md`](schema.md)
- Vai **mudar** alguma coisa no banco (tabela, coluna, permissão) → skill `db-change`, que tem
  o checklist das armadilhas antes de escrever qualquer SQL
