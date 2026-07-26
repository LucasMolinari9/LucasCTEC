# 04 — schema.md não documenta as funções/RPCs nem o trigger do banco

Ticket de correção de deriva docs×banco (auditoria de 26/07/2026, banco vivo
`lwzsxuaqqeoamukduhev`). Só documentação.

## Fatos verificados (banco vivo, 26/07/2026)

O schema `public` tem **0 views** e **6 funções** — o `docs/schema.md` (mapa relacional)
não menciona nenhuma delas:

| Função | Segurança | search_path | Chamada por |
|---|---|---|---|
| `divat_busca_logradouro(termo text, p_ibge int DEFAULT NULL)` | INVOKER | **NÃO fixado** (ver ticket 05) | **front**: `app.js:1935` (`rpc/divat_busca_logradouro`) |
| `divat_linhas_regiao(p_regiao text, p_modo text)` | INVOKER | fixado | **front**: `app.js:1983` (`rpc/divat_linhas_regiao`) |
| `divat_data_quality` | INVOKER | fixado | ninguém no repo (diagnóstico do dono?) |
| `f_unaccent(text)` | INVOKER | fixado | `divat_busca_logradouro` + índice de expressão `trgm_itin_logr_tipo_nome_norm` |
| `fn_vigor_auto()` | INVOKER | fixado | trigger `trg_vigor_auto` |
| `realtime_tables()` | INVOKER (a baseline diz DEFINER — ver ticket 07) | fixado | `scripts/check_realtime.mjs` (como anon) |

E **1 trigger** não documentado no schema.md:
- `trg_vigor_auto` em `portaria_teste`, BEFORE INSERT OR UPDATE, executa `fn_vigor_auto()`.

Contexto que já existe em outros docs (aproveitar, não duplicar): o CHANGELOG menciona as
2 RPCs do front (stub no rig de testes); `docs/backup_schema.sql` tem o DDL de 5 delas
(`divat_data_quality` está faltando lá — ticket 07).

## O que fazer

Acrescentar ao `docs/schema.md` uma seção curta "Funções e trigger" (no espírito do doc:
mapa, não DDL) com: nome, papel, quem chama, e a distinção "chamada pelo front via RPC"
× "interna/diagnóstico". Incluir o trigger `trg_vigor_auto` na parte de `portaria_teste`.

## Como verificar

- Cross-check com o banco: nomes/assinaturas conferem com `pg_proc` (ou com
  `docs/backup_schema.sql` seções 5–6, exceto `divat_data_quality`).
- `node tests/check.js` verde.

## Regras do repo

- Branch → preview → merge com CI verde. Sem bump de `#verTag` (só docs).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
