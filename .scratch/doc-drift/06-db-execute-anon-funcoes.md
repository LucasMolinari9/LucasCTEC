# 06 — REVOKE pendente: EXECUTE de `anon` em `fn_vigor_auto` (só falta o passo do dono)

Ticket da auditoria de 26/07/2026, **parcialmente concluído em 26/07** (sessão doc-drift).
O que resta é UMA linha de SQL, bloqueada pela regra de backup — passo do dono, abaixo.

## O que já foi feito (26/07, banco vivo conferido)

- `docs/seguranca.md` atualizado: a frase "a única função SQL pública" virou a lista real
  das funções executáveis por `anon` e o porquê de cada uma (seção "SQL injection").
- **Decisão registrada — `divat_data_quality` NÃO será revogada**, ao contrário do que a
  auditoria propôs: a issue **#63** (aberta antes da auditoria, no mesmo dia) planeja o
  runner semanal `check_data_quality.mjs` chamando exatamente essa função **como `anon`**.
  Os grants atuais dela no banco (sem PUBLIC; EXECUTE explícito para `anon`/`authenticated`)
  já são o estado final que a #63 prescreve. Revogar agora seria desfazido pela #63.
- `f_unaccent` e `realtime_tables`: confirmado que **não podem** ser revogadas (a busca por
  logradouro roda como `anon` e chama `f_unaccent`; o `check_realtime.mjs` roda como `anon`).

## O que falta (passo do dono — não dá para fazer do ambiente do Claude)

O REVOKE de `fn_vigor_auto` (função de trigger; o EXECUTE de `anon` é herança do default
PUBLIC do Postgres e é inútil — `anon` não escreve em `portaria_teste`, então o trigger
nunca roda como ele). A regra do `CLAUDE.md` exige **backup fresco antes de REVOKE**, e do
ambiente do Claude não dá: o dispatch do workflow retorna 403 para a integração e a rede
até `*.supabase.co` é bloqueada (nenhum run do `backup.yml` existe ainda — o cron semanal
não disparou desde o merge).

1. GitHub → Actions → **Backup** → *Run workflow* (ou `pg_dump` — `docs/backup.md`);
   esperar o verde.
2. No SQL editor do Supabase:
   `REVOKE ALL ON FUNCTION public.fn_vigor_auto() FROM PUBLIC, anon, authenticated;`
3. Conferir: `aclexplode` em `pg_proc` não deve mais listar `anon` para `fn_vigor_auto`;
   um `UPDATE` de teste em `portaria_teste` (service role, em transação com rollback)
   confirma que o trigger continua disparando.
4. Refletir na baseline `docs/backup_schema.sql` (uma linha de REVOKE junto ao
   `CREATE FUNCTION public.fn_vigor_auto`) e atualizar a menção "REVOKE pendente" no
   `docs/seguranca.md`; registrar no `docs/CHANGELOG.md`.
5. **Apagar este arquivo** no mesmo commit.
