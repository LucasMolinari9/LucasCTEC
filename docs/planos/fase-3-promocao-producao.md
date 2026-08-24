# Fase 3 — dossiê de promoção para produção

> **Estado: DDL aplicado em produção em 24/08/2026.** As migrações 1, 2 e 4 (ver lista abaixo)
> rodaram contra `lwzsxuaqqeoamukduhev` e as validações pós-promoção 1, 3, 4, 5 e 6 foram
> confirmadas ao vivo — ver "Resultado da promoção" abaixo. **A promoção não está encerrada:** os
> itens 7 e 8 (credencial de auditor de produção + apontar o gate diário para ela) ainda não
> foram feitos, então produção segue sem o gate automático diário de grants (o mesmo estado
> descrito em `docs/seguranca.md` §9.1) até esses dois itens saírem.

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
   "Achado adicional"). **NÃO aplicada em produção**: essa função nunca existiu lá (medido em
   24/08/2026), e a migração falha com "function does not exist" se rodada contra um banco onde
   a função nunca existiu em lugar nenhum — aplicá-la teria só abortado sem efeito.
4. `20260824015658_phase3_guarda_fecha_security_digest.sql` — substitui a migração 3 para
   produção: mesmo efeito onde a função existe, no-op seguro onde nunca existiu. Idempotente em
   qualquer estado, não edita a migração já aplicada em teste. **Esta é a que rodou em produção**
   no lugar da 3.

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

Autorização concedida pelo dono no chat em 24/08/2026 ("tente fazer você", em resposta direta à
pergunta se deveria autenticar/usar o MCP do Supabase para aplicar o DDL). Backup automatizado
(`backup.yml`, modo público/dados) **não pôde ser disparado** nesta sessão — o token do MCP do
GitHub recebeu 403 ao tentar `workflow_dispatch`. Como as quatro migrações não tocam dado nenhum
(só schema/função/role/grant), a mitigação usada foi capturar, antes de aplicar, a definição
exata de cada uma das 8 funções afetadas (via `pg_get_functiondef`, só leitura) — rollback
preciso disponível sem depender do backup de dados. Recomendado ao dono rodar o backup manual em
paralelo (aba Actions → Backup → Run workflow) por redundância.

## Resultado da promoção (24/08/2026)

Migrações 1, 2 e 4 aplicadas nesta ordem contra `lwzsxuaqqeoamukduhev` via MCP do Supabase, cada
uma com sucesso e sem precisar de `force`/retry — os blocos de precondição e assert de cada
arquivo passaram (teriam abortado a transação com `raise exception` em caso de divergência). A
migração 3 foi deliberadamente **não aplicada** em produção (ver lista de migrações acima).

## Validação pós-promoção — o que foi conferido ao vivo (só leitura)

1. ✅ **Confirmado.** As quatro funções diagnósticas existem em `audit`; nenhuma delas, nem
   `divat_security_digest`, existe em `public`.
2. ⚠️ **Coberto indiretamente, não reverificável isoladamente por enquanto.** Cada migração já
   prova, dentro da própria transação, que `divat_auditor` consegue chamar as quatro funções
   (`set local role divat_auditor; perform ...;`) — isso rodou e passou nas três migrações. Uma
   segunda checagem independente, fora de uma migração, falhou com `permission denied to set
   role "divat_auditor"` — **esperado**: as migrações revogam a associação de `postgres` a
   `divat_auditor`/`divat_audit_owner` na última linha, de propósito, então nenhuma sessão tem
   acesso parado a esse papel. Reverificar isso de fora de uma migração exige a credencial de
   auditor de produção (item 7), que ainda não existe.
3. ✅ **Confirmado.** Allowlist anônima de `public` é exatamente
   `{divat_busca_logradouro, divat_linhas_regiao}`; smoke ao vivo de
   `divat_busca_logradouro('silva', null)` como `anon` devolveu 469 linhas.
4. ✅ **Confirmado.** `authenticated` sem nenhum privilégio (`select`/`insert`/`update`/`delete`/
   `truncate`) nas 18 tabelas de `public`, e sem `EXECUTE` em nenhuma função de `public`/`audit`.
5. ✅ **Confirmado.** As 14 tabelas de produto legíveis por `anon`, RLS ligado nas 18 (as 14 +
   as 4 de staging do ETL), zero escrita de `anon` em qualquer uma; as 4 de staging
   (`evento_dados`, `evento_textos`, `portaria_data`, `portaria_texto_teste`) continuam
   invisíveis para `anon`.
6. ✅ **Confirmado.** 14 tabelas na publicação `supabase_realtime`, mesma lista das 14 tabelas de
   produto.
7. ❌ **Pendente.** Credencial de auditor de produção (separada da de teste) não foi criada —
   exige gerar senha e decidir onde guardar o secret; não é decisão que se toma sozinha no meio
   de uma sessão.
8. ❌ **Pendente**, depende do item 7. Enquanto isso, o gate diário de grants continua observando
   só o projeto de teste (mesmo estado de `docs/seguranca.md` §9.1).

## Parada obrigatória em caso de drift

Se qualquer uma das quatro funções reaparecer em `public`, ou se `anon`/`authenticated` recuperar
`EXECUTE`, interromper a promoção. Não reaplicar a migração de reparo automaticamente. Preservar
as evidências do catálogo, comparar histórico de migrações, event triggers, funções, cron e
associações de roles com o drift documentado em
`docs/planos/fase-3-hardening-moderado.md` e determinar a causa antes de escolher uma correção.

## Critério de encerramento

A promoção só pode ser declarada concluída depois que todas as validações pós-promoção estiverem
verdes, seus links estiverem anexados à PR e o próximo disparo diário de `seguranca` estiver
confirmado. **Ainda não está concluída**: itens 7 e 8 seguem pendentes (credencial de auditor de
produção + apontar o gate diário). Até lá, este documento permanece como registro de uma operação
em andamento, não de um trabalho encerrado.
