---
name: db-change
description: Use whenever a mudança envolve estrutura do banco Supabase do Portal DIVAT — tabela nova, coluna nova, policy/RLS, GRANT, Realtime, índice, staging do ETL, ou qualquer coisa que o front (app.js) precise ler de uma tabela nova ou alterada. Também acionar para "cadastro de linha nova tipo X", "quero um card novo que lê tabela Y", "preciso adicionar coluna Z". NÃO usar para ajuste isolado de CSS/texto/UI que não toca schema nem loaders de dado.
---

# Mudança estrutural no banco (Portal DIVAT)

Pipeline de 4 etapas para qualquer mudança que toque **schema, RLS/GRANT, Realtime ou índices**
do Supabase deste projeto. O objetivo é não perder nenhum dos passos documentados em
`CLAUDE.md` (seção Supabase / Armadilhas) — que é exatamente onde os bugs desse tipo de mudança
costumam aparecer, silenciosamente, semanas depois.

Para mudanças que **não** tocam schema/loaders (CSS, texto, UI pura), pule este pipeline e vá
direto para implementar + `node tests/check.js` + `/code-review`.

## Etapa 1 — Grill (perguntas antes de escrever qualquer SQL ou JS)

Releia `CLAUDE.md` (seção "Supabase") e `docs/schema.md` e responda, para a mudança pedida:

1. **Tabela é nova ou é alteração de existente?**
   - Nova → precisa de PK própria (surrogate `row_id` se for tabela grande com `id` repetido),
     RLS ligado + policy `anon_read_*` (SELECT only) **e `GRANT SELECT ... TO anon, authenticated`
     EXPLÍCITO**. Desde 27/07/2026 os default privileges são **deny** (achado SEC-01): tabela nova
     **não** nasce mais legível. Esquecer o GRANT dá 401/404 no portal e parece bug de front.
     Mesma regra para RPC nova: **`GRANT EXECUTE` explícito**, senão o `anon` não chama.
   - Alteração → a coluna nova muda algum nome que o ETL escreve? (ver armadilha
     `cod_origem`/`cod_municipio_origem` — nomes errados recriam colunas velhas.)
2. **Essa tabela vai ser lida por algum card/view do `app.js`?**
   - Se sim → precisa entrar em `RT_TABLES` **e** no `VIEW_TABLES` da(s) view(s) que a usam,
     incluindo lookups indiretos (`getEmpresas`, `getIbge`, `getOrigem`, `getEvLookups`).
   - Precisa de `alter publication supabase_realtime add table public.<tabela>;`.
3. **Alguma coluna nova vai ser filtrada (`ilike`, `eq`, join) por um loader?**
   - Se sim → precisa de índice (btree; `pg_trgm`+GIN se for `ilike`).
4. **A query vai usar `limit` > 30000?**
   - Se sim → precisa subir `pgrst.db_max_rows` no role `authenticator` e `NOTIFY pgrst,
     'reload config'`.
5. **Existe staging de ETL correspondente** (`evento_dados`/`evento_textos`,
   `portaria_data`/`portaria_texto_teste`)?
   - Se a correção é num dado já publicado, ela precisa ser replicada na staging (senão o
     rebuild do ETL desfaz). Staging não recebe policy nem grant — isso é esperado.
6. **Existe backup fresco antes de qualquer DROP/ALTER destrutivo?** (ver `docs/backup.md`).

Não avance para a Etapa 2 sem ter resposta para as 6 perguntas.

## Etapa 2 — Spec

Escreva um mini-spec curto (pode ser só no chat, não precisa virar arquivo) cobrindo:

- DDL da tabela/coluna (nomes exatos, tipos, PK/FK).
- Policies e grants exatos (`anon_read_<tabela>` SELECT-only — nunca `ALL USING(true)`).
- Índice(s) necessários e seu tipo.
- Entrada em `RT_TABLES` e em qual(is) `VIEW_TABLES[view]` a tabela entra.
- Qual card/seção do `app.js` consome isso (ver tabela "Tabelas → onde aparecem" no
  `CLAUDE.md`) — card novo ou existente?
- Se afeta `docs/backup_schema.sql` (baseline versionada) ou `docs/schema.md` (mapa relacional).

## Etapa 3 — Tickets (ordem de execução)

Quebre a spec nesta ordem — cada item é um passo verificável:

> **EM QUAL BANCO?** São **dois** projetos Supabase — produção (`Banco - Divat`,
> `lwzsxuaqqeoamukduhev`) e teste (`divat - TESTE`, `gontnlfmothfglssbyyk`). Este checklist tem
> como alvo **produção**, que é o que o portal publicado lê e o único que os gates vigiam. Se a
> mudança for para o teste, diga isso explicitamente: os passos 8 e o `check_deriva.mjs` **não
> alcançam o teste** e vão continuar verdes sem terem olhado para o que você mudou.
> Ver `CLAUDE.md` § Supabase.

1. [ ] **Migração versionada em `supabase/migrations/`** — desde o PR #73 (31/07/2026), toda
   alteração de schema é migração, não DDL solta no painel. Tabela pública nova liga RLS e
   revoga `anon`/`authenticated` na **mesma** migração; RPC anônima nova é proibida por padrão
   (allowlist em `scripts/check_migrations.mjs`). Aplicar continua sendo ato manual do dono.
2. [ ] Policy `anon_read_*` (SELECT only) + conferir RLS ligado.
3. [ ] Índice(s).
4. [ ] `alter publication supabase_realtime add table public.<tabela>;`
5. [ ] `app.js`: loader/card + `RT_TABLES` + `VIEW_TABLES` da(s) view(s) + lookups indiretos.
6. [ ] Atualizar `docs/backup_schema.sql` e `docs/schema.md` se a estrutura mudou.
7. [ ] `node tests/check.js` (sintaxe, cópias `*.harness.js`, anti-drift, `<script>` inline)
   **e `node scripts/check_migrations.mjs`** (contrato da migração, offline).
8. [ ] `scripts/check_realtime.mjs` (checagem viva do Realtime — **contra produção**).
9. [ ] Push em branch (não `main`) → preview deploy → conferir manualmente no preview.
10. [ ] `/code-review` antes do merge.
11. [ ] Merge na `main` → bump do carimbo de versão (`#verTag`) se for algo que o usuário
    precisa perceber.

## Etapa 4 — Implement + Review

Só depois dos tickets prontos, implemente e rode `/code-review` normalmente. Este pipeline não
substitui o `/code-review` — ele garante que, quando o review acontecer, os passos de schema já
estão todos cobertos (o review não vai pegar "esqueceu de adicionar em RT_TABLES", porque isso é
uma decisão de infraestrutura, não um bug de código).
