# Rodada "resolver as pendências" — 17/07/2026

Varredura das pendências que estavam **registradas mas não resolvidas** no `CLAUDE.md` e nos docs
de revisão (16/07 Kimi, 17/07 Qwen, `analise-duplicacao.md`), cruzadas com o **estado vivo** do
banco (`get_advisors`) e do código. O dono pediu "resolver tudo, agora". Este é o placar do que
foi fechado, do que só o dono consegue fechar (dashboard/billing/dados) e por quê.

## Placar

| # | Pendência | Origem | Status | Onde |
|---|---|---|---|---|
| 1 | Código duplicado (D1–D5) já estava aplicado, doc dizia o contrário | `analise-duplicacao.md` | ✅ doc corrigido | `docs/analise-duplicacao.md` |
| 2 | `function_search_path_mutable` (3 funções) — não registrado | advisor 0011 | ✅ resolvido (banco) | migração + `backup_schema.sql` |
| 3 | `realtime_tables()` SECURITY DEFINER executável por anon/auth | advisor 0028/0029 | ✅ resolvido → INVOKER | migração + `backup_schema.sql` |
| 4 | Checks de qualidade de dados pós-ETL (P1) | revisão 16/07 | ✅ resolvido | `scripts/check_data_quality.mjs` + função |
| 5 | `check_realtime.mjs` / checks vivos sem CI (H) | revisão 17/07 | ✅ resolvido | `.github/workflows/db-checks.yml` |
| 6 | `extension_in_public` (pg_trgm/unaccent) | advisor 0014 | 🟡 aceito/adiado (recipe) | `CLAUDE.md` (bloco advisors) |
| 7 | Leaked Password Protection = OFF | `CLAUDE.md` | ⛔ bloqueado por plano (Pro) — tentado e rejeitado | Authentication → Sign In/Providers → Email |
| 8 | Restore drill nunca provado + sem PITR | revisão 16/07 (5b) | ⛔ só dono (service role/billing) | `docs/backup.md` |
| 9 | Dados: órfãos, `cod_origem` inválido, U+FFFD | achado pelo #4 | ⛔ só dono (service role) | ver abaixo |
| 10 | ETL: mapear nomes novos `cod_origem`/`cod_municipio_origem` | revisão 17/07 | ⛔ só dono (ETL) | Armadilhas do `CLAUDE.md` |
| 11 | **Signup do Auth estava ABERTO** (drift: doc exigia OFF, dashboard tinha ON) | achado nesta rodada, via dashboard | ✅ resolvido | Authentication → Sign In/Providers |
| 12 | Password policy fraca (min 6, sem exigência de complexidade) | achado nesta rodada, via dashboard | ✅ resolvido | Authentication → Sign In/Providers → Email |

## O que foi resolvido nesta rodada (código + banco)

Duas migrações não-destrutivas no Supabase (`ALTER FUNCTION` / `CREATE OR REPLACE`), refletidas em
`docs/backup_schema.sql` para não voltarem num rebuild:

- **#2 · `search_path` fixado** em `f_unaccent`, `divat_busca_logradouro`, `divat_linhas_regiao`
  (`SET search_path = pg_catalog, public`). Refs já eram `public.`-qualificadas → **comportamento
  idêntico**, só fecha o vetor de sequestro por `search_path`.
- **#3 · `realtime_tables()` → `SECURITY INVOKER`.** Confirmado (via `set role anon`) que o `anon`
  lê `pg_publication_tables` direto e a RPC devolve as 14 tabelas — o DEFINER era desnecessário. O
  `check_realtime.mjs` continua funcionando. Removeu 2 WARNs de advisor.
- **#4 · `public.divat_data_quality()`** (plpgsql, STABLE, **INVOKER**, `search_path` fixo): relatório
  read-only que varre dinamicamente as colunas de texto do portal por `U+FFFD` e checa integridade
  referencial (`codlinha`/`cod_origem`/`cod_municipio_origem`/`codempresa`). `EXECUTE` só p/ `anon`.
- **#4/#5 · runner + CI:** `scripts/check_data_quality.mjs` (Node, sem deps, usa a anon key pública)
  e o workflow `db-checks.yml` (semanal + `workflow_dispatch`) que roda **os dois** checks vivos
  (`check_realtime` + `check_data_quality`). Ficaram **fora** do gate de push (`ci.yml`) de propósito:
  dependem de rede ao Supabase; o gate de push segue puro/offline.
- **#1 · doc de duplicação:** cabeçalho novo deixando claro que **D1–D5 já foram aplicados** (os
  helpers existem no `index.html`) e que D6–D10 seguem fora de escopo.

Advisors de segurança **depois** da rodada: só restam `extension_in_public` (×2, aceito) e
`auth_leaked_password_protection` (dashboard). Os 4 `rls_enabled_no_policy` são as staging (esperado).

## O que foi resolvido no dashboard (feito junto com o dono, fora do meu ambiente)

O `get_advisors` e o código não enxergam configuração do Supabase Auth (é outro serviço, sem
tabela/SQL) — só apareceu ao navegar o dashboard manualmente:

- **#11 · Signup estava aberto.** O `CLAUDE.md` já **exigia** "Allow new users to sign up" = OFF
  havia rodadas, mas ninguém tinha confirmado o valor real no dashboard — estava **ON**. Corrigido
  e salvo. Isso é o tipo de pendência que `get_advisors`/testes não capturam: **drift entre o que o
  doc manda e o que está configurado de fato**. Vale checar Auth Settings manualmente de tempos em
  tempos, não só confiar no que o `CLAUDE.md` descreve.
- **#12 · Password policy endurecida** (Authentication → Sign In/Providers → Email):
  `Minimum password length` 6→8; `Password requirements` "nenhum"→minúscula+maiúscula+dígito+símbolo;
  `Secure password change` e `Require current password when updating` ligados. Compensa parcialmente
  o item #7 (leaked-password check é Pro-only).
- **#7 · Confirmado, não só suposto:** tentei ligar `Prevent use of leaked passwords` e o Supabase
  **rejeitou o save** com a mensagem "disponível nos planos Pro e superiores". Não é mais um "pendente,
  1 clique" — é bloqueio de plano confirmado. Junta com o #8: **um único upgrade para o Pro resolveria
  tanto o #7 quanto o #8** (PITR).

## Por que #6 (extension_in_public) NÃO foi executado

Mover `unaccent` de schema quebra `f_unaccent` (que chama `public.unaccent`) e exige recriar a
função + revalidar os índices trigram — é **migração**, e a regra do projeto é **não migrar sem
backup fresco** (sem PITR no plano Free). É WARN de boa prática, não vulnerabilidade, e o risco caiu
porque o `search_path` das funções agora é fixo. Recipe completa no `CLAUDE.md` (bloco advisors),
para rodar quando houver backup.

## Só o dono consegue fechar (ação fora do ambiente do Claude)

- **#7 Leaked Password Protection:** Dashboard → Authentication → Password → habilitar. 1 clique.
- **#8 Restore drill + PITR:** provar um restore ponta-a-ponta (runbook em `docs/backup.md`) e avaliar
  migrar para o **Pro** (liga PITR automático e aposenta o backup manual). É o maior ponto único de
  falha hoje.
- **#9 Correção dos dados (service role):** o `check_data_quality` achou, em 17/07:
  `codlinha_orfa` — itinerario 2, qh_teste 3, qh_predeterminado 5, evento 7;
  `cod_origem_invalido` — qh_predeterminado 4;
  `encoding_ufffd` — ~50 células (evento_empresa 41, evento/portaria/tarifa/qh o resto).
  Os órfãos e `cod_origem` são corrigíveis reimportando/limpando; o `U+FFFD` só some reimportando a
  origem em UTF-8 (irrecuperável pelo banco).
- **#10 ETL:** ajustar o mapeamento do import para os nomes novos (`cod_origem` em `qh_intervalo_teste`,
  `cod_municipio_origem` em `itinerario_teste`) antes da próxima carga.

## Observação de modelagem (achada pelo #4)

`cod_origem` tem **tipos diferentes** entre tabelas: `integer` em `qh_*`, `varchar` em `origem_teste`.
O `divat_data_quality` compara com cast `::text`. Unificar o tipo é possível, mas tem risco de ETL
sem ganho funcional (o front usa como chave string) — deixado como está, coerente com a nota de
`cod_origem` nas Armadilhas do `CLAUDE.md`.
