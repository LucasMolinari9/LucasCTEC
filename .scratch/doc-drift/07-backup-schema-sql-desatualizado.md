# 07 — `docs/backup_schema.sql` (baseline de reconstrução) divergiu do banco vivo

Ticket de correção de deriva baseline×banco (auditoria de 26/07/2026, banco vivo
`lwzsxuaqqeoamukduhev`). Só documentação/SQL versionado — não roda nada no banco.

**⚠️ Ordem: fazer DEPOIS dos tickets 05 e 06** (eles mudam o banco; esta baseline deve
retratar o estado FINAL, senão diverge de novo na semana seguinte).

## Fatos verificados (banco vivo, 26/07/2026)

1. **`divat_data_quality` não existe na baseline** (`grep -c divat_data_quality
   docs/backup_schema.sql` → 0), mas existe no banco (plpgsql, INVOKER, search_path
   fixado). Uma reconstrução a partir da baseline perderia a função.
2. **`realtime_tables` está na baseline como `SECURITY DEFINER`** (linha ~365, com
   comentário explicando "o anon não enxerga pg_publication_tables direto") — mas no
   banco vivo ela é **`SECURITY INVOKER`**. Testado 26/07 como `anon`: funciona e
   retorna as 14 tabelas (ou seja, INVOKER basta e é mais seguro; o comentário da
   baseline está defasado).
3. Após os tickets 05/06, também divergem: o `SET search_path` da
   `divat_busca_logradouro` (05) e os REVOKEs de EXECUTE (06).

## O que fazer

1. Extrair do banco vivo o DDL atual das 6 funções (via `pg_get_functiondef`) e
   sincronizar a seção de funções da baseline:
   - adicionar `divat_data_quality`;
   - trocar `realtime_tables` para INVOKER e corrigir o comentário;
   - incorporar o que 05/06 mudaram (search_path + grants/revokes).
2. Conferir de passagem o resto da baseline contra o vivo (policies, grants, índices,
   trigger) — a auditoria de 26/07 já validou policies/grants/índices/trigger contra os
   docs, então o foco aqui é a seção de funções.
3. Registrar no `docs/CHANGELOG.md` que a baseline foi ressincronizada.

## Como verificar

- Para cada função: `select pg_get_functiondef(oid)` no vivo × bloco correspondente da
  baseline — sem diferença semântica (whitespace ok).
- `grep -c divat_data_quality docs/backup_schema.sql` → ≥ 1.
- `node tests/check.js` verde.

## Regras do repo

- A baseline versiona SÓ estrutura — nenhum dado no git (`.gitignore` bloqueia dumps).
- Snapshot vivo para conferência: `scripts/gen_security_snapshot.sql` (salvar a saída
  FORA do git).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
