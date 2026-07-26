# 05 — Fixar o `search_path` de `divat_busca_logradouro` (banco + seguranca.md)

Ticket de correção de deriva docs×banco com **mudança no banco** (auditoria de
26/07/2026, banco vivo `lwzsxuaqqeoamukduhev`). **Usar a skill `db-change`.**

## Fatos verificados (banco vivo, 26/07/2026)

- `docs/seguranca.md` (seção "SQL injection", ~linha 43) afirma que
  `divat_busca_logradouro` é "SECURITY INVOKER, parâmetro tipado, **search_path fixo**".
- Banco: `SECURITY INVOKER` ✓ e parâmetros tipados ✓, mas **`proconfig = NULL`** —
  o `search_path` **NÃO está fixado**. É a **única das 6 funções** do schema sem o pino
  (as outras 5 têm `SET search_path`). É exatamente o alerta
  `function_search_path_mutable` do linter do Supabase.
- Assinatura real (confere com `docs/backup_schema.sql` linha ~310):
  `public.divat_busca_logradouro(termo text, p_ibge integer DEFAULT NULL)`.
- A função referencia `public.f_unaccent` e `public.itinerario_teste` já com schema
  qualificado no corpo — o risco prático é baixo, mas a alegação do doc está errada e a
  higiene é fixar.

## O que fazer

1. **Skill `db-change`** (checklist de armadilhas antes de SQL).
2. No banco:
   `ALTER FUNCTION public.divat_busca_logradouro(text, integer) SET search_path = pg_catalog, public;`
   (não destrutivo, reversível, não muda comportamento — mas conferir a assinatura no
   `pg_proc` antes de rodar).
3. Atualizar `docs/backup_schema.sql`: acrescentar o `SET search_path` no
   `CREATE OR REPLACE FUNCTION public.divat_busca_logradouro` (linha ~310), pra baseline
   não recriar a função sem o pino.
4. `docs/seguranca.md` passa a estar CORRETO (a frase "search_path fixo" vira verdade) —
   conferir que não há mais nada ali afirmando o estado antigo.

## Como verificar

- `select proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='divat_busca_logradouro';`
  → deve mostrar `search_path=pg_catalog, public`.
- `mcp get_advisors` (security) → o alerta de search_path da função deve sumir.
- **A busca por logradouro continua funcionando**: `node scripts/check_views.mjs`
  (a view de Ligações por Logradouro usa a RPC; o rig tem stub, então o teste vivo é
  abrir o preview e buscar um logradouro).
- `node tests/check.js` verde.

## Regras do repo

- Mudança de banco NÃO exige deploy do front; a parte de docs segue branch → preview → merge.
- Não é destrutivo (sem DROP/DELETE/REVOKE), mas se bater dúvida: backup fresco antes
  (`docs/backup.md`).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
