# Backup & Recuperação — Portal DIVAT (`bd_teste`)

Runbook do backup do banco. Nasceu de uma sessão de **diagnóstico + proteção contra perda de
dados** em **16/07/2026**. Antes disso o projeto estava marcado como *"SEM BACKUP (risco
máximo)"* no `CLAUDE.md` — este documento é a rede de segurança que fechou esse buraco.

## TL;DR — o que existe hoje

O backup é feito de **duas peças** que se completam:

| Peça | O que é | Onde fica | Como refazer |
|---|---|---|---|
| **Estrutura** | `docs/backup_schema.sql` — recria tabelas, PK/FK, índices, RLS, grants, funções, trigger | **versionada no git** | regenerar do banco (ver abaixo) |
| **Dados** | dump do banco (`pg_dump`, script Node ou 18 CSVs) | **fora do git** (Drive/local do dono) | 3 formas — ver "Formas de fazer o backup" |

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

## Por que não há backup automático

O projeto está no **plano Free (NANO)** do Supabase. Backup diário automático e PITR são
recursos **exclusivos do plano Pro** (US$25/mês) — no Free não existe botão de "ativar", a
seção Database → Backups só oferece upgrade. Enquanto o projeto ficar no Free, o backup é
**manual** (este runbook). Migrar para o Pro tornaria o backup automático e tornaria este
processo manual desnecessário.

## Formas de fazer o backup dos DADOS

Há três formas de tirar os dados do banco, da mais completa à mais simples. **Todas rodam na sua
máquina** (o ambiente do Claude não alcança o Supabase) e o resultado vai **fora do git**.

### Opção 1 — `pg_dump` (padrão-ouro: dados + estrutura + policies + índices)
Precisa do `pg_dump` (vem com o Postgres client) e da **senha do banco** (Dashboard → Project
Settings → Database → Connection string).
```bash
pg_dump "postgresql://postgres:[SUA-SENHA]@db.lwzsxuaqqeoamukduhev.supabase.co:5432/postgres" \
  --schema=public --no-owner --no-privileges -Fc \
  -f "divat_backup_$(date +%Y-%m-%d).dump"
```
Restaurar num projeto vazio: `pg_restore --no-owner --no-privileges -d "postgresql://…" arquivo.dump`.
Variações: `--schema-only` (só estrutura) e `--data-only` (só dados).

### Opção 2 — Script Node `scripts/backup_rest.mjs` (sem `pg_dump`; só DADOS)
Para quando não há `pg_dump` instalado. Baixa as tabelas em NDJSON via REST, paginando pela PK.
Requer só **Node 18+** (nenhuma dependência). Tem **dois modos**, decididos pela chave no ambiente:

- **Completo** (`SUPABASE_SERVICE_KEY`): as **18 tabelas**, inclusive staging. A `service_role` key
  fica em Dashboard → Settings → API (é **SECRETA** — não commite, não cole em lugar público).
- **Público** (`SUPABASE_ANON_KEY`): as **14 tabelas públicas** (sem staging). É o modo usado pelo
  workflow automático do Actions — a anon key é a mesma pública do `app.js`.

```bash
SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
SUPABASE_SERVICE_KEY="<service_role key>" \
node scripts/backup_rest.mjs "./backup_$(date +%Y-%m-%d)"
```
Saída: pasta `backup_AAAA-MM-DD/` com um `.ndjson` por tabela + `manifest.json` (confira a contagem
de linhas e o campo `modo`). O `.gitignore` já ignora `backup_*/`. Limitação: só dados — a estrutura
vem da Opção 1 (`--schema-only`) ou de `docs/backup_schema.sql`.

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

1. **Ligue backup antes de qualquer coisa** se for reusar o projeto atual (evita repetir o erro).
2. Crie um projeto Supabase novo (ou zere o atual, com cuidado).
3. **SQL Editor** → cole `backup_schema.sql` inteiro → **Run**. Isso recria as 18 tabelas
   vazias já com PK/FK, índices, RLS, grants, funções e o trigger.
4. **Table Editor** → em cada tabela → **Import data from CSV**, usando os CSVs guardados.
   - **Ordem importa:** `tabela_vista_teste` **antes** de `tarifa_atual_teste` (por causa da
     FK `fk_tarifa_linha`). As demais podem entrar em qualquer ordem.
   - Os CSVs incluem `row_id`; a importação só funciona porque `backup_schema.sql` declara essas
     colunas como `GENERATED BY DEFAULT AS IDENTITY`.
5. **SQL Editor** → depois de importar todos os CSVs, reposicione as sequências de `row_id`.
   Sem isso, o próximo `INSERT` que omitir `row_id` pode colidir com as chaves importadas:

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
6. Se o projeto for **novo**, atualize `SB_URL` e `SB_KEY` no topo do `app.js` (a chave anon muda
   de projeto para projeto) e confira a CSP (`vercel.json` → `connect-src` apontando para o
   novo host `*.supabase.co`).
7. Recrie o **usuário do Auth** do dono (1 login) manualmente no Dashboard — não vai nos CSVs.

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
> **O que ficou provado:** os passos 1-3 (projeto novo + `backup_schema.sql`) reconstroem a
> estrutura inteira — 18 tabelas, 14 policies, RLS, 44 índices, Realtime, extensões — e o passo 4
> passa a funcionar depois da correção do `row_id`.
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
> Lição que já vale: nenhum gate do repositório detecta esse tipo de defeito. Todos conferem um
> banco que já está de pé; nenhum tenta reconstruir um do zero.

## O que este backup NÃO cobre

- **Auth** (usuário logado do dono) — recriar manualmente; é 1 login.
- **Storage** — hoje está zerado (0 GB), nada a salvar.
- **Extensões padrão do Supabase** (`pg_stat_statements`, `uuid-ossp`, `pgcrypto`,
  `supabase_vault`) — já vêm em qualquer projeto novo; o `.sql` só recria `pg_trgm` e `unaccent`.
