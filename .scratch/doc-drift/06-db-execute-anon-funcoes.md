# 06 — EXECUTE de `anon` em funções que o portal não chama (+ frase do seguranca.md)

Ticket de correção com **mudança no banco** (auditoria de 26/07/2026, banco vivo
`lwzsxuaqqeoamukduhev`). **Usar a skill `db-change`.** Envolve REVOKE ⇒ pela regra do
`CLAUDE.md`, **backup fresco antes** (`docs/backup.md`).

## Fatos verificados (banco vivo, 26/07/2026)

- `docs/seguranca.md` diz: "A **única** função SQL pública (`divat_busca_logradouro`)…".
- Banco: **as 6 funções** do schema `public` têm `EXECUTE` para `anon` E `authenticated`:
  `divat_busca_logradouro`, `divat_linhas_regiao`, `divat_data_quality`, `f_unaccent`,
  `fn_vigor_auto`, `realtime_tables`.
- Quem realmente precisa ser executável por `anon`:
  - `divat_busca_logradouro` e `divat_linhas_regiao` — **SIM** (o front chama via RPC:
    `app.js:1935` e `app.js:1983`).
  - `f_unaccent` — **SIM** (a `divat_busca_logradouro` é SECURITY INVOKER: roda COMO
    `anon`, e chama `public.f_unaccent`; além do índice de expressão
    `trgm_itin_logr_tipo_nome_norm`). **NÃO revogar.**
  - `realtime_tables` — **SIM, por design** (`scripts/check_realtime.mjs` chama como
    `anon`; grant explícito documentado em `docs/backup_schema.sql` ~linha 375-376).
    **NÃO revogar.** Testado 26/07 como `anon`: retorna as 14 tabelas.
  - `divat_data_quality` — **NÃO precisa**: nada no repo a chama; parece diagnóstico
    do dono (que usa service role, que ignora grants de anon). Candidata a REVOKE.
  - `fn_vigor_auto` — **NÃO precisa**: é função de trigger (`trg_vigor_auto` em
    `portaria_teste`); trigger roda com os privilégios de quem faz o INSERT/UPDATE
    (service role do dono), e `anon` não tem escrita em `portaria_teste` — o EXECUTE
    de `anon` nela é inútil. Candidata a REVOKE.

## Armadilhas (importantes)

- **Postgres concede EXECUTE a PUBLIC por default** em toda função nova. Revogar só de
  `anon` não basta se PUBLIC ainda tiver — revogar de PUBLIC:
  `REVOKE ALL ON FUNCTION public.divat_data_quality(...) FROM PUBLIC, anon, authenticated;`
  (conferir a assinatura exata em `pg_proc` antes; `divat_data_quality` não está no
  `backup_schema.sql`, ver ticket 07).
- Avaliar `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` para
  funções futuras nascerem fechadas (mesmo espírito do que já foi feito para tabelas em
  26/06) — decisão do dono, registrar no CHANGELOG se fizer.
- Depois do REVOKE, **testar o portal**: buscar logradouro e abrir "Linhas por Região"
  no preview (as 2 RPCs do front têm que continuar respondendo para `anon`).

## O que fazer

1. Backup fresco (regra para REVOKE) + skill `db-change`.
2. REVOKE de `PUBLIC/anon/authenticated` em `divat_data_quality` e `fn_vigor_auto`.
3. Atualizar `docs/seguranca.md`: trocar "a única função SQL pública" pela lista real
   das funções expostas a `anon` e por quê (busca_logradouro, linhas_regiao, f_unaccent,
   realtime_tables).
4. Atualizar `docs/backup_schema.sql` com os REVOKEs (baseline reconstruível) — coordenar
   com o ticket 07.
5. Registrar no `docs/CHANGELOG.md`.

## Como verificar

- `aclexplode` em `pg_proc` → só as 4 funções necessárias com EXECUTE para `anon`.
- Como `anon` (`begin; set local role anon; …; rollback;`):
  `select public.divat_data_quality(...)` deve dar **permission denied**;
  `select count(*) from public.realtime_tables()` deve continuar retornando 14.
- Preview do portal: busca por logradouro e por região funcionando.
- `node tests/check.js` e `node scripts/check_realtime.mjs` verdes.

## Regras do repo

- REVOKE = categoria destrutiva ⇒ **backup fresco antes** (`docs/backup.md`).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
