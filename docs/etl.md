# Como o dono alimenta o banco (ETL)

> **Doc vivo.** Descreve o processo real de alimentação do Supabase do Portal DIVAT. O portal é
> **somente leitura**: nada aqui passa pela API pública — tudo acontece pelo painel do Supabase,
> com a *service role*, que ignora RLS.

**Leia antes:** [`../CLAUDE.md`](../CLAUDE.md) (regras do projeto) e
[`backup.md`](backup.md) (**nada destrutivo sem backup fresco** — vale para cada passo deste
arquivo).

---

## 1. O caminho do dado, de ponta a ponta

```
banco do DETRO  ──exporta──▶  CSV  ──Table Editor──▶  Supabase (bd_teste)  ──lê ao vivo──▶  portal
   (fonte)                                             lwzsxuaqqeoamukduhev
```

1. A equipe atualiza o **banco do DETRO** — é ele a fonte da verdade, não o Supabase.
2. O dono exporta o que mudou em **CSV**.
3. O dono importa o CSV pelo **Table Editor** do painel do Supabase.
4. O portal **não precisa de deploy**: ele lê o Supabase ao vivo, e o Realtime atualiza a tela de
   quem estiver com o card aberto. Mudança de **dado** nunca exige publicar.

Consequência prática: **o Supabase é uma cópia**. Se ele for perdido e o banco do DETRO estiver
íntegro, o caminho de recuperação mais curto é reexportar e reimportar — não necessariamente o
restore de [`backup.md`](backup.md). O restore continua sendo a rede de segurança para o caso
inverso (dado que só existe no Supabase, ou perda com o DETRO indisponível).

---

## 2. UTF-8 é obrigatório — não é preferência

Em 21/07/2026 o banco foi limpo de **U+FFFD** (o caractere `�`, resultado de ler bytes numa
codificação e gravar em outra). Ver o `CHANGELOG.md`.

**Um import com encoding errado recria o problema inteiro**, e ele não aparece como erro: aparece
como acento quebrado no nome de um logradouro, meses depois, quando alguém abrir aquele
itinerário.

Antes de subir um CSV:

- salve o arquivo como **UTF-8** (no Excel: *Salvar como → CSV UTF-8*; num editor de texto,
  confira a codificação na barra de status);
- se o CSV veio de exportação automática, **abra e olhe uma linha com acento** antes de importar —
  `CANDELÁRIA` tem de aparecer assim, não `CANDELÃRIA` nem `CANDEL�RIA`;
- depois de importar, o gate `node scripts/check_data_quality.mjs` mede U+FFFD e acusa (hoje: zero
  achados; ver §5).

---

## 3. As tabelas de staging

Quatro tabelas do schema `public` **não são lidas pelo portal**:

| Staging | + Staging | chave de junção | tabela final |
|---|---|---|---|
| `evento_dados` | `evento_textos` | `id` | `evento_teste` |
| `portaria_data` | `portaria_texto_teste` | `id` | `portaria_teste` |

A divisão é **metadado × texto longo**: `evento_dados` carrega `codempresa`, `codlinha`,
`data_registro`, `evento_linha`, `evento_empresa` e `data_publicacao`; `evento_textos` carrega
`numero_processo`, `descricao` e `observacao`. O mesmo corte vale para as portarias
(`portaria_data` com número/datas/vigor/tipo, `portaria_texto_teste` com `tipo_legislacao`,
`assunto` e `conteudo`).

As quatro têm **RLS ligado, sem policy e sem grant** — invisíveis pela API pública, de propósito.
O lint `rls_enabled_no_policy` nelas é **esperado**, não é achado.

### O rebuild: medido em 09/08/2026

A pergunta em aberto era se algum objeto do banco monta as tabelas finais a partir da staging.
**Medido, contra o banco vivo:**

| Verificação | Resultado |
|---|---|
| Funções que mencionam `evento_dados`/`evento_textos`/`portaria_data`/`portaria_texto_teste` | **nenhuma** |
| Triggers do projeto | **um só** — `trg_vigor_auto` em `portaria_teste` (regra de `vigor`, nada a ver com staging) |
| Event triggers | 6, **todos do Supabase** (`pgrst_ddl_watch`, `grant_pg_cron_access`, …) |

| Tabela | Linhas |
|---|---|
| `evento_dados` (staging) · `evento_textos` (staging) · `evento_teste` (**final**) | **20.753** cada |
| `portaria_data` (staging) · `portaria_texto_teste` (staging) · `portaria_teste` (**final**) | **2.100** cada |

**Conclusão: não existe rebuild automatizado — e a staging não é resíduo.** As contagens batem
exatamente, ou seja, staging e final são mantidas **em paralelo, pelo import de CSV**. O "rebuild"
é manual: é você, na etapa 3 do §1.

Isso tem duas consequências que valem mais que a curiosidade:

1. **A regra do §4 (replicar correção na staging) está certa e é necessária** — não por causa de um
   automatismo que desfaria a correção, mas porque as duas cópias precisam continuar concordando.
   Se elas divergirem, a próxima vez que alguém reconstruir a final a partir da staging (à mão,
   sem saber da correção) reintroduz o dado velho.
2. **A junção `id ⋈ id` da tabela acima continua sendo dedução do schema**, não procedimento
   observado — as colunas de cada par somam exatamente as da final, mas ninguém no projeto
   descreveu o comando. **Se um dia for automatizar, escreva o SQL do zero e teste num projeto de
   teste antes.** Um `TRUNCATE` errado aqui apaga arquivo institucional insubstituível (ver §5).

---

## 4. Correção de dado: replicar na staging

> Corrigiu uma linha em `evento_teste` ou `portaria_teste`? **Faça a mesma correção na staging
> correspondente**, casando pelo `id`.

Staging e final são **duas cópias do mesmo fato**, mantidas em dia pelo mesmo import (§3). Corrigir
só uma deixa as duas discordando — e a discordância é invisível, porque o portal lê apenas a final.
O preço aparece depois: na próxima vez que alguém reconstruir a final a partir da staging, o dado
velho volta.

O inverso também vale: dado que entre só na staging **não aparece no portal**, porque nenhum card
lê essas tabelas.

---

## 5. O que rodar depois de alimentar

```bash
node scripts/check_data_quality.mjs
```

Precisa de rede até o Supabase (não roda do ambiente do Claude; roda na máquina do dono e semanal
no workflow `db-checks.yml`) e de `SUPABASE_TEST_AUDIT_DATABASE_URL` no ambiente. Chama
`audit.divat_data_quality()` pelo login mínimo `divat_auditor_ci`
(`scripts/lib/audit-database.mjs`) e mede a integridade *hub-and-spoke* — quase tudo se liga a
`tabela_vista_teste` por `codlinha`, mas a única foreign key real é a `fk_tarifa_linha`; os outros
joins são convenção, feitos no JavaScript, e o Postgres não os garante.

> ⚠️ **Este passo agora audita o projeto de TESTE (`gontnlfmothfglssbyyk`), não mais o de
> PRODUÇÃO (`lwzsxuaqqeoamukduhev`, o "Supabase (bd_teste)" do diagrama do §1) — o mesmo onde o
> ETL de verdade importa.** A migração dos quatro gates para o auditor PostgreSQL (ver
> docs/seguranca.md § 10) trocou de banco porque só o projeto de teste tem o schema `audit`
> aplicado hoje. **Consequência prática: rodar este comando depois de um import real não
> confere mais os dados que você acabou de importar** — confere o projeto de teste, que pode
> estar desatualizado ou ter dados diferentes. Até a Fase 3 chegar a produção (pré-requisito
> documentado em `docs/planos/fase-3-hardening-moderado.md`), a conferência pós-ETL de produção
> volta a depender de consulta manual pelo SQL Editor do painel — não há checagem automática
> equivalente por enquanto.

**Quando um filho aponta para `codlinha` que não existe no pai, o portal não avisa: a tela
simplesmente aparece vazia, sem erro.** É por isso que este passo existe.

Duas coisas ao ler a saída:

- **Confira `orfaos_conhecidos` item a item, não só o número.** O gate compara **contagem** contra
  `scripts/data_quality_baseline.json` — uma órfã corrigida e outra criada mantêm o número e passam
  despercebidas.
- **Consertou dado? Rode `--atualizar-baseline`**, senão o gate segue frouxo com dívida que já não
  existe. Para ver o estado cru, sem baseline nenhum: `--sem-baseline`.

> 🚫 **NÃO apague os filhos órfãos de `evento_teste`.** As 7 órfãs de lá são atos reais de
> **1974–1996**, da época do DTC/RJ, de linhas anteriores ao cadastro atual — arquivo institucional
> insubstituível. Linha extinta **não some** do cadastro (o hub tem a coluna `cancelado`, com 500
> linhas marcadas assim), então órfã em `evento_teste` não é rastro de exclusão: é história mais
> velha que o cadastro. Por isso o script as **rebaixa a aviso** em vez de erro.

Se o import mexeu em **Realtime** (tabela nova entrando na publicação) ou em **schema**, rode também
`node scripts/check_realtime.mjs` e `node scripts/check_deriva.mjs` — mesma ressalva do aviso
acima: os dois também migraram para o auditor PostgreSQL e hoje auditam o projeto de TESTE, não
produção. Mudança estrutural de banco não é ETL: passa pela skill `db-change` e por uma migração
em `supabase/migrations/`.

---

## 6. Armadilhas com nome próprio

- **`cod_origem` × `cod_municipio_origem`.** São coisas diferentes: `cod_origem` é
  **terminal/origem** (`origem_teste`, `qh_intervalo_teste`, `qh_predeterminado_teste`);
  `cod_municipio_origem` é **código IBGE de município** (`itinerario_teste`). O import precisa
  escrever nesses nomes — escrever nos antigos (`cod_origen`, ou `cod_origem` em
  `itinerario_teste`) **recria as colunas velhas**, e aí o portal lê a coluna certa, vazia.
  Diagrama em [`schema.md`](schema.md).
- **Coluna nova numa tabela grande que o portal vá filtrar precisa de índice** (btree; `pg_trgm`
  + GIN para `ilike`). Sem ele a consulta degrada silenciosamente conforme a tabela cresce.
- **`limit` maior que 30000** exige subir o teto do PostgREST **e** a constante `SB_MAX_ROWS` do
  `app.js` na mesma tarefa — ver a seção Supabase do [`../CLAUDE.md`](../CLAUDE.md).
- **Nada de dado no git.** CSVs e dumps ficam **fora** do repositório; o `.gitignore` barra `*.csv`
  como rede de segurança. O git versiona só código.
