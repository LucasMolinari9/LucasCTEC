# Backup & Recuperação — Portal DIVAT (`bd_teste`)

Runbook do backup do banco. Nasceu de uma sessão de **diagnóstico + proteção contra perda de
dados** em **16/07/2026**. Antes disso o projeto estava marcado como *"SEM BACKUP (risco
máximo)"* no `CLAUDE.md` — este documento é a rede de segurança que fechou esse buraco.

## TL;DR — o que existe hoje

O backup é feito de **duas peças** que se completam:

| Peça | O que é | Onde fica | Como refazer |
|---|---|---|---|
| **Estrutura** | `docs/backup_schema.sql` — recria tabelas, PK/FK, índices, RLS, grants, funções, trigger | **versionada no git** | regenerar do banco (ver abaixo) |
| **Dados** | dump do banco (`pg_dump`, NDJSON ou 18 CSVs) | **fora do git** (Drive/local do dono) | 3 formas — ver "Formas de fazer o backup" |

Além das rotinas manuais acima, existe uma **camada automática** (21/07/2026): o workflow
**`.github/workflows/backup.yml`** roda o `backup_rest.mjs` em **modo público** toda segunda
06:00 UTC (e sob demanda, botão *Run workflow*), guardando o dump como **artifact do Actions
por 90 dias** (aba Actions → run → Artifacts). Ele usa a **anon key** (pública por design):
cobre as **14 tabelas públicas do portal** — **não** cobre as 4 de staging do ETL
(`evento_dados`, `evento_textos`, `portaria_data`, `portaria_texto_teste`) nem a estrutura.
É a rede que garante que sempre existe *algum* dump recente mesmo se a rotina manual atrasar;
o dump **completo** continua sendo o manual abaixo.

> **Por que separado:** o CSV carrega só as **linhas**; não carrega estrutura, índices, RLS
> nem funções. O `backup_schema.sql` carrega só a **estrutura**; não carrega dados. Juntos =
> banco completo. Nenhum dos dois sozinho recupera o portal.

> **⚠️ Os CSVs NÃO vão para o git.** Dados no repositório = vazamento. Só o `.sql` e os `.md`
> (estrutura e docs) são versionados. Os CSVs ficam numa pasta do dono (Google Drive etc.).

## O que é automático — e o que o plano Free não oferece

O projeto **tem backup automático próprio**: o `backup.yml` exporta semanalmente as 14 tabelas
públicas em NDJSON e guarda o artifact por 90 dias. Isso reduz o risco de ficar sem nenhuma cópia,
mas não equivale a um backup gerenciado da plataforma: não inclui staging, Auth, estrutura nem
PITR (*point-in-time recovery*).

No plano Free, a proteção completa continua dependendo do dump manual fora do Git. Um plano com
backup gerenciado/PITR acrescentaria outra camada; não tornaria desnecessários o teste de restore,
o controle de acesso nem uma cópia independente.

## Formas de fazer o backup dos DADOS

Há três formas de tirar os dados do banco, da mais completa à mais simples. **Todas rodam na sua
máquina** (o ambiente do Claude não alcança o Supabase) e o resultado vai **fora do git**.

### Opção 1 — `pg_dump` (padrão-ouro: dados + estrutura + policies + índices)
Precisa do `pg_dump` (vem com o Postgres client) e da **senha do banco**. Para dump/restore, copie
no Dashboard a conexão direta ou o **Session pooler na porta 5432**; não use o pooler em modo
Transaction.
```bash
pg_dump "$SUPABASE_DB_URL" \
  --schema=public --no-owner --no-privileges -Fc \
  -f "divat_backup_$(date +%Y-%m-%d).dump"
```
O arquivo é completo. Na recuperação documentada abaixo, porém, a estrutura vem da baseline
versionada e o dump entra com `pg_restore --data-only`; isso evita executar dois DDLs concorrentes
e é exatamente o conflito que a versão anterior deste runbook provocava.

### Opção 2 — Scripts Node NDJSON (sem `pg_dump`; só DADOS)
Para quando não há `pg_dump` instalado. Baixa as tabelas em NDJSON via REST, paginando pela PK.
Requer só **Node 18+** (nenhuma dependência). Tem **dois modos**, decididos pela chave no ambiente:

- **Completo** (`SUPABASE_SECRET_KEY`, preferida, ou `SUPABASE_SERVICE_KEY` legada): as **18
  tabelas**, inclusive staging. A chave é **SECRETA** — não commite nem cole em lugar público.
- **Público** (`SUPABASE_PUBLISHABLE_KEY`, preferida, ou `SUPABASE_ANON_KEY` legada): as **14
  tabelas públicas** (sem staging). É o modo usado pelo workflow automático do Actions.

```bash
SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
SUPABASE_SECRET_KEY="<sb_secret_...>" \
node scripts/backup_rest.mjs "./backup_$(date +%Y-%m-%d)"
```
Saída: pasta `backup_AAAA-MM-DD/` com um `.ndjson` por tabela + `manifest.json` (confira a contagem
de linhas e o campo `modo`). O `.gitignore` já ignora `backup_*/`. Limitação: só dados — a estrutura
da restauração documentada vem de `docs/backup_schema.sql`.

O caminho inverso agora é executável e testado offline:

```bash
node scripts/restore_rest.mjs ./backup_AAAA-MM-DD
```

Sem `--apply`, ele apenas valida JSON, contagens e SHA-256. A gravação real exige projeto vazio,
chave administrativa e confirmação explícita do project ref; veja o Caminho B.

### Opção 3 — Table Editor → CSV (sem terminal)
A forma manual pelo painel, detalhada abaixo. Não precisa instalar nada, mas é a mais trabalhosa
(18 exportações à mão).

## Opção 3 em detalhe — CSV pelo Table Editor

Fazer periodicamente (semanal é um bom ritmo para o volume atual). Dados mudam → refazer os
CSVs; estrutura muda → regenerar o `.sql`.

### 1. Exportar os dados (CSV)
No **Dashboard do Supabase → Table Editor**, para **cada uma das 18 tabelas**:
`⋮` (menu da tabela) → **Export data** → **Export table as CSV**.

As 18 tabelas:
```
codempresa_teste          evento_dados              evento_empresa_teste
evento_linha_teste        evento_teste              evento_textos
itinerario_teste          localidades_teste         municipio_teste
origem_teste              portaria_data             portaria_teste
portaria_texto_teste      qh_intervalo_teste        qh_predeterminado_teste
qh_teste                  tabela_vista_teste        tarifa_atual_teste
```

**Confira as tabelas grandes** — se o CSV vier com poucos KB/linhas, foi exportação parcial
(só a página visível); refaça. Tamanhos de referência (16/07/2026):

| Tabela | Linhas | CSV aprox. |
|---|--:|--:|
| `evento_teste` | 20.753 | ~19 MB |
| `evento_textos` | 20.753 | ~18 MB |
| `portaria_teste` | 2.100 | ~5 MB |
| `portaria_texto_teste` | 2.100 | ~5 MB |
| `itinerario_teste` | 52.146 | ~3 MB |
| `qh_predeterminado_teste` | 23.838 | ~1 MB |
| `evento_dados` | 20.753 | ~869 KB |
| `qh_intervalo_teste` | 9.598 | ~532 KB |
| `tarifa_atual_teste` | 3.488 | ~486 KB |
| `tabela_vista_teste` | 1.869 | ~288 KB |
| `portaria_data` | 2.100 | ~88 KB |
| `qh_teste` | 1.490 | ~85 KB |
| `localidades_teste` | 752 | ~18 KB |
| `codempresa_teste` / `origem_teste` | 133 / 548 | ~10 KB |
| `municipio_teste` | 92 | ~5 KB |
| `evento_linha_teste` / `evento_empresa_teste` | 82 / 51 | ~4 / 2 KB |

### 2. Guardar
Numa pasta datada (ex.: `backup_divat_2026-07-16/`) contendo os **18 CSVs** + uma cópia do
`backup_schema.sql`. Subir para Google Drive ou outro armazenamento durável.

### 3. Regenerar o `backup_schema.sql` (só quando a estrutura mudar)
O arquivo foi gerado consultando o banco ao vivo (via MCP Supabase / SQL Editor). Se você
criar/alterar tabela, índice, policy ou função, atualize-o. As consultas-fonte foram:
`pg_constraint` (PK/FK), `pg_indexes` (índices), `pg_policies` (RLS), `pg_proc` +
`pg_get_functiondef` (funções), `pg_trigger` (triggers), `information_schema.role_table_grants`
(grants), `pg_publication_tables` (Realtime).

## Como RESTAURAR (em caso de perda total)

> ### ⚠️ Regra de ouro
>
> Restaure **somente num projeto novo/descartável**. `backup_schema.sql` é DDL de criação para banco
> vazio, não script idempotente de reconciliação. Nunca execute o arquivo por cima de uma estrutura
> já criada por `pg_restore`: a primeira `CREATE TABLE` existente encerra o processo.

| Caminho | Quando usar | O que restaura |
|---|---|---|
| **A — baseline + `pg_restore --data-only`** | existe `.dump` da Opção 1 | 18 tabelas; recomendado |
| **B — baseline + `restore_rest.mjs`** | existe pasta NDJSON | 18 tabelas no modo completo ou 14 no público |
| **C — baseline + CSV** | último recurso | depende de cada CSV; risco de exportação parcial silenciosa |

### Passo comum 1 — escolher o estado do schema

O alvo padrão de recuperação é o **estado atual de produção**, que ainda é **pré-Fase 3**. Nesse
caso, execute apenas `docs/backup_schema.sql`. Para reproduzir deliberadamente o projeto de teste
pós-Fase 3, execute a baseline e depois as migrations de `supabase/migrations/`, em ordem. Não
misture os dois estados nem aplique a Fase 3 em produção como efeito colateral de um restore.

Em projeto novo, confirme também em **Data API settings** que o schema `public` está exposto. Em
projetos novos, tabelas podem não ser expostas automaticamente; RLS e grants continuam sendo
obrigatórios e são controles separados.

### Caminho A — restaurar de um dump (`pg_restore`)

1. Crie um projeto Supabase novo.
2. No SQL Editor, execute `docs/backup_schema.sql` **uma vez**. Se o estado-alvo for pós-Fase 3,
   aplique depois as migrations versionadas.
3. Restaure **somente os dados** do dump completo:

   ```bash
   pg_restore --data-only --no-owner --no-privileges --exit-on-error \
     -d "$SUPABASE_RESTORE_DB_URL" \
     backup_AAAA-MM-DD.dump
   ```

   `--exit-on-error` impede que um restore parcial pareça concluído. A estrutura fica sob uma única
   fonte de verdade: a baseline versionada, em vez de um DDL do dump seguido por outro DDL
   incompatível.

### Caminho B — restaurar NDJSON com validação automática

1. Crie um projeto novo e prepare a estrutura conforme o passo comum.
2. Valide o backup **sem credencial e sem rede**:

   ```bash
   node scripts/restore_rest.mjs ./backup_AAAA-MM-DD
   ```

   O comando aborta se faltar tabela, houver JSON inválido, contagem diferente ou SHA-256
   divergente.
3. Só depois, aplique no projeto-alvo. Copie a chave **secret** do novo projeto; a service role JWT
   legada continua aceita apenas durante a transição:

   ```bash
   SUPABASE_RESTORE_URL="https://<novo-ref>.supabase.co" \
   SUPABASE_RESTORE_SECRET_KEY="<sb_secret_...>" \
   node scripts/restore_rest.mjs ./backup_AAAA-MM-DD \
     --apply --confirm-ref=<novo-ref>
   ```

4. **Reposicione as sequências de `row_id`** conforme o **Passo comum 2**. O importador grava
   `row_id` explícito e não avança as sequências; sem este passo a próxima carga do ETL colide.

O script verifica todas as tabelas antes do primeiro `INSERT` e recusa qualquer destino não vazio.
Também restaura a tabela-pai antes da filha, trabalha em lotes e confere a contagem de cada tabela
depois da escrita. Ele **nunca apaga dados**; se falhar depois de começar, descarte e recrie o
projeto-alvo antes de repetir.

### Caminho C — restaurar de CSVs (último recurso)

1. Prepare a estrutura conforme o passo comum.
2. No Table Editor, importe cada CSV.
   - **Ordem importa:** `tabela_vista_teste` **antes** de `tarifa_atual_teste` (por causa da
     FK `fk_tarifa_linha`). As demais podem entrar em qualquer ordem.
   - Os CSVs incluem `row_id`; a importação só funciona porque `backup_schema.sql` declara essas
     colunas como `GENERATED BY DEFAULT AS IDENTITY`.
3. Depois de importar, **reposicione as sequências de `row_id`** conforme o **Passo comum 2**
   abaixo. Não é opcional.

O Table Editor pode exportar apenas a página visível sem acusar erro. Por isso o CSV permanece
último recurso e a conferência de contagens abaixo é obrigatória.

### Passo comum 2 — reposicionar as sequências de `row_id`

Obrigatório nos Caminhos **B e C**. Cinco tabelas declaram
`row_id bigint GENERATED BY DEFAULT AS IDENTITY` no `backup_schema.sql`, e tanto o importador
NDJSON quanto o Table Editor gravam `row_id` **explícito**. Inserir valor explícito numa coluna
`GENERATED BY DEFAULT` **não avança a sequência** — ela continua onde estava. O portal não percebe
(é somente leitura), mas a próxima carga do ETL que omitir `row_id` colide com as chaves
restauradas, e num cenário de recuperação esse é o pior momento para descobrir.

```sql
select setval(pg_get_serial_sequence('public.evento_empresa_teste','row_id'),
              coalesce((select max(row_id) from public.evento_empresa_teste), 1));
select setval(pg_get_serial_sequence('public.evento_linha_teste','row_id'),
              coalesce((select max(row_id) from public.evento_linha_teste), 1));
select setval(pg_get_serial_sequence('public.itinerario_teste','row_id'),
              coalesce((select max(row_id) from public.itinerario_teste), 1));
select setval(pg_get_serial_sequence('public.qh_intervalo_teste','row_id'),
              coalesce((select max(row_id) from public.qh_intervalo_teste), 1));
select setval(pg_get_serial_sequence('public.qh_predeterminado_teste','row_id'),
              coalesce((select max(row_id) from public.qh_predeterminado_teste), 1));
```

O **Caminho A não precisa** deste passo: o `pg_dump` já emite os `setval` e o
`pg_restore --data-only` os aplica. Rodar mesmo assim é inofensivo — o bloco é idempotente.

O `restore_rest.mjs` não faz isso sozinho **de propósito**: `setval` é SQL, e o script fala apenas
PostgREST. Este passo é do SQL Editor, e por isso mora no runbook em vez do código.

### Passo comum 3 — conferir que o restore prestou

Nenhum caminho termina quando o import termina:

1. **Contagem por tabela.** Para NDJSON, o manifest é a referência e o importador já compara cada
   tabela. Para dump/CSV, registre as contagens da origem no momento do backup e compare com
   `count(*)`; os números históricos deste documento são apenas uma verificação de plausibilidade,
   não verdade eterna.

   ```sql
   create temp table restore_counts (tabela text, linhas bigint);
   do $$
   declare r record;
   begin
     for r in select tablename from pg_tables where schemaname = 'public' loop
       execute format(
         'insert into restore_counts select %L, count(*) from public.%I',
         r.tablename, r.tablename
       );
     end loop;
   end $$;
   select * from restore_counts order by tabela;
   ```

2. **Grants, RLS, funções e Realtime:** execute `scripts/gen_security_snapshot.sql` no alvo e
   compare com o estado-alvo escolhido. Confirme 14 tabelas públicas legíveis, quatro tabelas de
   staging invisíveis e nenhuma escrita para `anon`/`authenticated`.
3. **Auth:** recrie manualmente o login do dono; Auth não está nos dumps do schema `public`.
4. **Portal contra o restaurado:** faça um preview temporário com `SB_TESTE_URL`/`SB_TESTE_KEY`
   apontando para o projeto restaurado e confira busca, linha, horários, tarifa, histórico e
   Realtime. Não altere as constantes de produção.

> `node scripts/check_views.mjs` **não** prova este passo: ele intercepta o PostgREST e usa fixtures
> locais por desenho. A versão anterior do runbook dizia “sem stub”, mas o código nunca teve esse
> modo. Enquanto o preview real não for exercitado, SEC-06 continua aberto.

### Passo comum 4 — medir RTO e RPO

O item que falta há mais tempo no projeto. **RTO** = quanto tempo, do "percebi a perda" ao "portal
de pé"; **RPO** = quanto dado se perde, na prática, entre o último backup e a falha (com o backup
semanal do `backup.yml`, o teto teórico é 7 dias — a medição serve para confirmar que não é pior).

Cronometre o exercício inteiro e preencha:

| Métrica | Medido em | Valor | Caminho usado |
|---|---|---|---|
| **RTO** | — | *(não medido)* | — |
| **RPO** | — | *(não medido)* | — |

Com os dois preenchidos e a validação comum verde, o SEC-06 se encerra: atualize também `docs/seguranca.md`
§ 9.3, que hoje o descreve como **mitigado**.

## Encoding dos CSVs (não é bug)

Ao abrir um CSV no Excel por duplo-clique, acentos podem aparecer trocados (ex.: `VIAÃ‡ÃO` em
vez de `VIAÇÃO`). Isso é o **Excel lendo um arquivo UTF-8 como se fosse Windows-1252** — os
bytes no arquivo estão corretos. **Não "conserte" e salve por cima pelo Excel** (ele pode
regravar em encoding errado e aí sim corromper). Reimportado no Supabase (UTF-8), os acentos
voltam certos. Para só visualizar certo: Excel → Dados → De Texto/CSV → origem **65001 (UTF-8)**.

(Obs.: isto é diferente da corrupção `U+FFFD` "�" já documentada no `CLAUDE.md`, que é perda
real na origem da importação — essa não volta reimportando, só reimportando o dado original em UTF-8.)

## O que a integridade do dump garante (e o que NÃO garante)

Desde 27/07/2026 (achado SEC-06 da auditoria externa), o `backup_rest.mjs`:

- **Pagina por KEYSET**, não por `OFFSET`. O cabeçalho do script sempre afirmou "pagina pela
  PRIMARY KEY", mas o código fazia `order=PK` + `offset` — que é outra coisa: sob escrita
  concorrente, o offset desloca a janela e o dump **pula ou duplica** linhas em silêncio.
- **Confere a contagem** contra o `Content-Range` (`count=exact`) do próprio servidor. Se descer
  **menos** do que o servidor contou, o backup **aborta** — dump incompleto não pode terminar com
  cara de sucesso. Se descer **mais**, apenas avisa (linha inserida durante a corrida é benigna).
- **Grava SHA-256 por tabela** no `manifest.json`.
- O `restore_rest.mjs` refaz a validação antes de escrever, recusa destino ocupado/origem e confere
  as contagens depois de cada tabela. As bancadas de backup e restore rodam no CI.

**O que isso NÃO prova:** o SHA-256 responde "este arquivo é o mesmo que eu gerei?", não "este
dump presta?". Um dump internamente incoerente tem hash tão válido quanto um bom. E nenhuma dessas
verificações substitui o item abaixo.

> ### 🟡 Pendência PARCIAL: restore exercitado pela primeira vez, não concluído
>
> Em 28/07/2026 o roteiro foi executado contra um projeto Supabase novo e descartável
> (`divat - TESTE`). O exercício encontrou **dois defeitos reais**, ambos já corrigidos: grants
> mais abertos que os da produção (`anon` com TRUNCATE nas 18 tabelas, e **RLS não bloqueia
> TRUNCATE**) e a recusa dos valores de `row_id` trazidos pelos CSVs, que travava o passo 4 em 5
> das 18 tabelas. Os dois só apareceriam durante uma perda real de dados — o pior momento
> possível — e em silêncio, porque estrutura, policies e portal continuam parecendo corretos.
>
> A revisão de 31/07 encontrou mais duas falhas no próprio texto: o Caminho A mandava criar todo o
> schema pelo dump e depois executar 18 `CREATE TABLE` não idempotentes; e o passo de validação
> dizia que `check_views.mjs` rodaria “sem stub”, embora esse script sempre use fixtures. O runbook
> agora usa uma única fonte de DDL, restaura dados separadamente e descreve o teste do portal com
> honestidade.
>
> **O que ficou provado:** `backup_schema.sql` reconstitui a estrutura; os scripts NDJSON validam
> bytes, JSON, contagens, ordem da FK, destino vazio e chaves opacas numa bancada offline. Isso
> protege a mecânica local, mas ainda não substitui um ensaio contra Supabase real.
>
> **O que NÃO ficou provado — e por isso a pendência não está encerrada:**
> - a restauração não foi levada até o fim: na medição, `tabela_vista_teste` seguia **vazia** e
>   `itinerario_teste` tinha **5.298 das 52.146** linhas — exportação parcial do CSV, exatamente o
>   caso que a seção "Exportar os dados" acima manda conferir;
> - o portal **nunca foi apontado para o banco restaurado**, então não se sabe se ele funciona
>   contra o resultado do restore;
> - **RTO e RPO seguem sem medição.**
>
> Enquanto esses três itens não forem cumpridos, **SEC-06 continua "mitigado", não "encerrado"**.
>
> Lição que já vale: o CI agora detecta regressões na mecânica do backup/importador, mas nenhum gate
> consegue criar sozinho um projeto Supabase e provar a recuperação completa. O drill real segue
> sendo o fechamento do item.

## O que este backup NÃO cobre

- **Auth** (usuário logado do dono) — recriar manualmente; é 1 login.
- **Storage** — hoje está zerado (0 GB), nada a salvar.
- **Extensões padrão do Supabase** (`pg_stat_statements`, `uuid-ossp`, `pgcrypto`,
  `supabase_vault`) — já vêm em qualquer projeto novo; o `.sql` só recria `pg_trgm` e `unaccent`.
