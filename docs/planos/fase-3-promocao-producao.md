# Fase 3 — dossiê de promoção para produção

> Estado: **pré-promoção**. Este documento não autoriza nem executa DDL. A aplicação no projeto
> de produção `lwzsxuaqqeoamukduhev` depende de autorização humana explícita e separada, solicitada
> somente depois que a PR em rascunho estiver verde.

## Escopo desta PR

Esta PR é dedicada à promoção da Fase 3. Ela registra evidências e o roteiro operacional; não
altera frontend, modularização, dados nem schema. O DDL versionado que poderá ser promovido já
está em `supabase/migrations/`. Nenhuma migração deve ser reaplicada às cegas se um diagnóstico
voltar a aparecer em `public`.

**As quatro migrações a aplicar em produção, nesta ordem** (conferidas contra as precondições de
`lwzsxuaqqeoamukduhev` em 24/08/2026 — ver "Verificação de precondições" abaixo):

1. `20260729034018_phase3_moderate_hardening.sql` — move as 4 RPCs diagnósticas para `audit`,
   fecha o `EXECUTE` de `anon`/`authenticated` no schema `public` e cria os papéis de auditoria.
2. `20260822144441_phase3_repara_funcoes_publicas.sql` — idempotente; reconfirma as 4 funções em
   `audit` (não faz nada de novo se a migração 1 já as deixou corretas, que é o caso esperado numa
   primeira aplicação em produção).
3. `20260822151652_phase3_fecha_security_digest.sql` — fecha `divat_security_digest()`, achado
   separado do `check_deriva.mjs` em 22/08/2026 (ver `fase-3-hardening-moderado.md`, seção
   "Achado adicional"). Essa função **nunca existiu em produção** (medido em 24/08/2026); a
   migração falha com "function does not exist" se rodada sozinha contra um banco onde a função
   nunca existiu — por isso a migração 4 é obrigatória junto.
4. `20260824015658_phase3_guarda_fecha_security_digest.sql` — corrige o problema da migração 3
   para bancos onde `divat_security_digest()` nunca existiu (produção): idempotente em qualquer
   estado, não edita a migração já aplicada em teste.

## Evidências prévias

Todos os runs abaixo terminaram com sucesso em 22/08/2026:

| Evidência | Resultado | Run |
|---|---|---|
| Fase 3 — contrato e quatro diagnósticos pelo auditor mínimo | `migration-contract` e `test-auditor` verdes | [Phase 3 database security 32585853817](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585853817) |
| Gates vivos contra teste | `realtime`, `qualidade` e `seguranca` verdes | [DB checks 32585854923](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585854923) |
| Deriva docs × banco de teste | `deriva` verde | [Deriva 32585856069](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585856069) |
| Gate offline da `main` atual | `check` verde | [CI 32596046274](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32596046274) |
| Views da `main` atual | 20 cenários + regressões de abas, seleção e corrida verdes | [Views 32596046278](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32596046278) |
| Análise estática da `main` atual | regras locais, vendorizadas, públicas e testes verdes | [Semgrep 32596046264](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32596046264) |
| Deriva da `main` atual | `deriva` verde | [Deriva 32596046267](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32596046267) |
| Preview protegido da alteração da Fase 3 | smoke verde em deployment `Preview` | [Deploy smoke 32581709197](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32581709197) |

O smoke de preview recebe `VERCEL_AUTOMATION_BYPASS_SECRET` pelo secret homônimo do GitHub e
envia seu valor exclusivamente no header `x-vercel-protection-bypass`. O script falha com status
próprio se receber a tela de autenticação da Vercel, em vez do portal. O run verde acima é,
portanto, evidência de que o preview protegido foi alcançado pelo caminho de automação, sem
confundir a tela de login com a aplicação.

Os três primeiros workflows usam `SUPABASE_TEST_AUDIT_DATABASE_URL`. O transporte compartilhado
aceita exclusivamente o project ref `gontnlfmothfglssbyyk`, com login
`divat_auditor_ci` (direto) ou `divat_auditor_ci.gontnlfmothfglssbyyk` (pooler), senha não vazia
e TLS obrigatório. Esse login é apenas membro de `divat_auditor`, não tem `SELECT` direto nas
tabelas e é a credencial auditora mínima definida para a fase.

## Proteção da `main`

O ruleset ativo [Proteção da main](https://github.com/LucasMolinari9/LucasCTEC/rules/21211640)
atinge `~DEFAULT_BRANCH`, exige PR atualizada e bloqueia merge até estes oito checks passarem:

- `check`;
- `views`;
- `semgrep`;
- `deriva`;
- `realtime`;
- `qualidade`;
- `seguranca`;
- `migration-contract`.

O ruleset também bloqueia exclusão e force push, exige resolução das conversas e não possui lista
de bypass. Como os runs acima são anteriores a esta PR documental, os oito checks da própria PR
também precisam terminar verdes antes de solicitar autorização de produção.

## Verificação de precondições contra produção (24/08/2026)

A migração 1 tem seu próprio bloco de precondição (aborta com `raise exception` se o banco não
bater com o formato esperado — ver o arquivo). Antes de solicitar autorização, essas precondições
foram conferidas **ao vivo** contra `lwzsxuaqqeoamukduhev`, só leitura:

| Precondição | Esperado | Medido em produção |
|---|---|---|
| Tabelas em `public` | 18 | 18 ✓ |
| Schema `private` já existe | não | não ✓ |
| Schema `audit` já existe | não | não ✓ |
| Papéis `divat_audit_owner`/`divat_auditor` já existem | não | não ✓ |
| `divat_busca_logradouro(text,integer)` existe em `public` | sim | sim ✓ |
| `divat_linhas_regiao(text,text)` existe em `public` | sim | sim ✓ |
| `divat_api_shape()` existe em `public`, `anon`/`authenticated` conseguem executar | sim | sim ✓ |
| `divat_security_shape()` idem | sim | sim ✓ |
| `divat_data_quality()` idem | sim | sim ✓ |
| `realtime_tables()` idem | sim | sim ✓ |
| `f_unaccent(text)` existe em `public` | sim | sim ✓ |
| `fn_vigor_auto()` existe em `public` | sim | sim ✓ |
| `divat_security_digest()` existe em algum schema | não (nunca existiu em produção) | não ✓ |

Todas as precondições batem — a migração 1 deve passar seu próprio bloco de guarda sem abortar.

## Gate de autorização para produção

Depois que a PR estiver verde, solicitar ao proprietário uma resposta inequívoca que autorize
**separadamente** executar o DDL da Fase 3 em `lwzsxuaqqeoamukduhev`. Ausência de resposta,
aprovação da PR ou autorização para merge não substituem essa autorização operacional. Antes do
DDL, confirmar backup fresco conforme `docs/backup.md`.

## Validação imediata depois da promoção autorizada

Sem encerrar a janela operacional, executar e anexar os resultados destas verificações contra
produção:

1. confirmar que as quatro funções diagnósticas existem em `audit` e nenhuma delas existe em
   `public`: `divat_security_shape`, `divat_api_shape`, `divat_data_quality` e
   `realtime_tables`;
2. executar os quatro diagnósticos como o auditor mínimo, provando também que ele não ganhou
   `SELECT` direto em tabela;
3. confirmar a allowlist anônima exata das RPCs de produto:
   `divat_busca_logradouro(text,integer)` e `divat_linhas_regiao(text,text)`;
4. confirmar `authenticated` sem funções executáveis e sem privilégios nas tabelas;
5. confirmar as 14 tabelas públicas legíveis por `anon`, sem `INSERT`, `UPDATE`, `DELETE` ou
   `TRUNCATE`, e com RLS ligado;
6. confirmar as 14 tabelas esperadas na publicação `supabase_realtime`;
7. configurar a credencial auditora de produção sem reutilizar nem ampliar a credencial de teste;
8. apontar o gate diário de grants para a credencial auditora mínima de produção e comprovar uma
   execução verde de `seguranca`, preservando os demais gates independentes.

## Parada obrigatória em caso de drift

Se qualquer uma das quatro funções reaparecer em `public`, ou se `anon`/`authenticated` recuperar
`EXECUTE`, interromper a promoção. Não reaplicar a migração de reparo automaticamente. Preservar
as evidências do catálogo, comparar histórico de migrações, event triggers, funções, cron e
associações de roles com o drift documentado em
`docs/planos/fase-3-hardening-moderado.md` e determinar a causa antes de escolher uma correção.

## Critério de encerramento

A promoção só pode ser declarada concluída depois que todas as validações pós-promoção estiverem
verdes, seus links estiverem anexados à PR e o próximo disparo diário de `seguranca` estiver
confirmado. Até lá, esta PR permanece como registro de uma operação em andamento.
