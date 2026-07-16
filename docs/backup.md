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
Para quando não há `pg_dump` instalado. Baixa as **18 tabelas** em NDJSON via REST, paginando pela
PK. Requer só **Node 18+** (nenhuma dependência). A `service_role` key fica em Dashboard → Settings
→ API (é **SECRETA** — não commite, não cole em lugar público).
```bash
SUPABASE_URL="https://lwzsxuaqqeoamukduhev.supabase.co" \
SUPABASE_SERVICE_KEY="<service_role key>" \
node scripts/backup_rest.mjs "./backup_$(date +%Y-%m-%d)"
```
Saída: pasta `backup_AAAA-MM-DD/` com um `.ndjson` por tabela + `manifest.json` (confira a contagem
de linhas). O `.gitignore` já ignora `backup_*/`. Limitação: só dados — a estrutura vem da Opção 1
(`--schema-only`) ou de `docs/backup_schema.sql`.

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
5. Se o projeto for **novo**, atualize `SB_URL` e `SB_KEY` no `index.html` (a chave anon muda
   de projeto para projeto) e confira a CSP (`vercel.json` → `connect-src` apontando para o
   novo host `*.supabase.co`).
6. Recrie o **usuário do Auth** do dono (1 login) manualmente no Dashboard — não vai nos CSVs.

## Encoding dos CSVs (não é bug)

Ao abrir um CSV no Excel por duplo-clique, acentos podem aparecer trocados (ex.: `VIAÃ‡ÃO` em
vez de `VIAÇÃO`). Isso é o **Excel lendo um arquivo UTF-8 como se fosse Windows-1252** — os
bytes no arquivo estão corretos. **Não "conserte" e salve por cima pelo Excel** (ele pode
regravar em encoding errado e aí sim corromper). Reimportado no Supabase (UTF-8), os acentos
voltam certos. Para só visualizar certo: Excel → Dados → De Texto/CSV → origem **65001 (UTF-8)**.

(Obs.: isto é diferente da corrupção `U+FFFD` "�" já documentada no `CLAUDE.md`, que é perda
real na origem da importação — essa não volta reimportando, só reimportando o dado original em UTF-8.)

## O que este backup NÃO cobre

- **Auth** (usuário logado do dono) — recriar manualmente; é 1 login.
- **Storage** — hoje está zerado (0 GB), nada a salvar.
- **Extensões padrão do Supabase** (`pg_stat_statements`, `uuid-ossp`, `pgcrypto`,
  `supabase_vault`) — já vêm em qualquer projeto novo; o `.sql` só recria `pg_trgm` e `unaccent`.
</content>
