# Fase 3 — endurecimento moderado

## Decisões formais

- O portal permanece público e sem Supabase Auth/sessões. Em 29/07/2026 o projeto de teste tinha
  zero usuários em `auth.users`; introduzir sessão não protege dados públicos e aumentaria a
  superfície operacional sem requisito de produto.
- `authenticated` não tem acesso a tabelas nem funções do portal.
- Somente `divat_busca_logradouro(text, integer)` e `divat_linhas_regiao(text, text)` permanecem
  como RPCs anônimas.
- Helpers internos ficam em `private`; diagnósticos ficam em `audit`, schema não exposto pela Data
  API.
- `divat_audit_owner` é `NOLOGIN`, herda somente `anon` e limita o poder das quatro funções
  `SECURITY DEFINER`. `divat_auditor` é `NOLOGIN`, não lê tabelas diretamente e só executa as
  funções de `audit`.
- O CI de auditoria usa um login PostgreSQL separado, `divat_auditor_ci`, membro apenas de
  `divat_auditor`. A senha nunca entra no Git.
- A primeira migração da Fase 3 pressupõe o schema existente; a Fase 2 reconciliará a baseline
  anterior e o histórico de reconstrução.

## Escopo e estado

Esta fase foi aplicada somente em `gontnlfmothfglssbyyk` pela migração
`20260729034018_phase3_moderate_hardening.sql`. Produção (`lwzsxuaqqeoamukduhev`) não recebeu DDL,
credencial ou alteração de configuração.

Validações já concluídas no teste:

- dry-run transacional da migração: passou;
- migração remota: registrada como `20260729034018`;
- allowlist anônima: exatamente duas RPCs de produto;
- `authenticated`: zero funções executáveis e zero privilégios de tabela;
- 14 tabelas continuam legíveis por `anon`, sem escrita;
- smoke das duas RPCs de produto e da leitura pública: passou;
- quatro diagnósticos em `audit`: todos executaram como `divat_auditor`, sem `SELECT` direto;
- papéis de auditoria sem login, superuser, bypass RLS, criação de DB/role ou replicação;
- rollback completo executado dentro de transação e revertido: passou;
- advisors de segurança: somente os quatro avisos `INFO` já esperados para staging com RLS e sem
  policy (`evento_dados`, `evento_textos`, `portaria_data`, `portaria_texto_teste`).

## Drift descoberto e reparado em 22/08/2026

Medido contra o banco de teste vivo, não suposto a partir da documentação: apesar de
`20260729034018_phase3_moderate_hardening.sql` estar registrada como aplicada — e o próprio
arquivo mover as **quatro** funções diagnósticas para `audit` com asserts que abortariam a
transação se alguma ficasse para trás — o banco vivo só tinha **duas** em `audit`
(`divat_security_shape`, `divat_data_quality`). `divat_api_shape` e `realtime_tables` estavam de
volta em `public`, ainda executáveis por `anon`. Também foi medido que `postgres` havia
recuperado a associação a `divat_audit_owner`/`divat_auditor`, que a migração original revogava
na última linha. **A causa do drift não foi determinada** — não há gatilho, função, cron ou
script neste repo que explique o reaparecimento; fica registrado como fato observado, não
escondido atrás de um reparo silencioso.

Reparado pela migração `20260822144441_phase3_repara_funcoes_publicas.sql` (idempotente, com o
mesmo padrão de asserts + prova viva da migração original, reconfirmando as quatro funções, não
só as duas que regrediram) — verificado independentemente depois de aplicar: as quatro em
`audit`, `anon`/`authenticated` sem `EXECUTE`, `divat_auditor_ci` com `EXECUTE` nas quatro.
**Isto não descarta a possibilidade do mesmo drift acontecer de novo** — sem causa identificada,
não há como garantir que não volte. Se os gates `deriva`/`realtime` (que dependem de
`divat_api_shape`/`realtime_tables`) começarem a falhar depois de terem passado, o primeiro
lugar a olhar é se essas duas funções voltaram para `public`.

## Credencial auditora e secret

**Estado verificado em 22/08/2026: login ativo e secret configurado.** O secret de Actions
`SUPABASE_TEST_AUDIT_DATABASE_URL` existe, e os runs manuais abaixo provaram seu conteúdo sem
expô-lo: os validadores aceitaram exclusivamente o projeto de teste `gontnlfmothfglssbyyk` e o
login `divat_auditor_ci`, conectaram ao banco e concluíram as consultas. Como a credencial estava
válida, não foi necessário rotacioná-la. A criação/rotação do login é deliberadamente separada da
migração, para impedir senha em SQL versionado — por isso ela não mora em `supabase/migrations/`,
só o resultado (grants, schema) mora. Runbook para uma próxima rotação, com `psql`:

```bash
psql "$ADMIN_DATABASE_URL" \
  --set=auditor_password="$AUDITOR_PASSWORD" \
  --set=valid_until="2026-10-31 23:59:59+00" \
  --file=scripts/bootstrap_phase3_auditor.sql
```

(Sem `psql` à mão — ex.: pelo celular — o mesmo efeito sai de um `DO $$ ... $$` colado direto no
SQL Editor do painel, sem os comandos exclusivos de `psql`; mesmas regras de atributo do role,
sem variável de sessão nenhuma.)

Grave a URL de conexão no secret de Actions `SUPABASE_TEST_AUDIT_DATABASE_URL`. A URL deve usar o
projeto `gontnlfmothfglssbyyk` e o login `divat_auditor_ci`; o runner recusa qualquer outro
project ref, inclusive produção. Em 22/08/2026, três execuções `workflow_dispatch` na `main`
(commit `652394995801f80c65c456bfdf0589c819bd42da`) forneceram a evidência operacional:

- [`Phase 3 database security` #32585853817](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585853817):
  `test-auditor` executado, não pulado, e verde; `check_phase3_audit.mjs` concluiu os diagnósticos
  pelo auditor mínimo;
- [`DB checks` #32585854923](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585854923):
  jobs `seguranca`, `qualidade` e `realtime` executados, não pulados, e verdes, comprovando
  respectivamente `check_grants.mjs`, `check_data_quality.mjs` e `check_realtime.mjs`;
- [`Deriva` #32585856069](https://github.com/LucasMolinari9/LucasCTEC/actions/runs/32585856069):
  job `deriva` executado, não pulado, e verde, comprovando `check_deriva.mjs`.

Os logs mantiveram a URL mascarada e mostraram somente os comandos e seus veredictos. A passagem
dos cinco validadores também é a prova de que a URL satisfez as travas de projeto/login antes das
consultas; presença do secret ou job verde sem essas travas não seria evidência suficiente.

## Objetos novos

`scripts/check_migrations.mjs` falha quando uma migração:

- cria tabela em `public` sem RLS e revokes na mesma migração;
- cria função pública sem remover o EXECUTE implícito de `PUBLIC`;
- concede RPC anônima fora da allowlist de produto;
- concede a mesma RPC a `anon` e `authenticated`;
- versiona senha de role.

Os default privileges de `postgres` também foram fechados. Os defaults de `supabase_admin` não
podem ser alterados pelo `postgres` gerenciado (erro 42501 já reproduzido); por isso o gate de
migração é obrigatório e não substituível por essa configuração de plataforma.

## Rollback

`scripts/rollback_phase3_test.sql` começa desabilitando o login externo, restaura funções, schemas
e ACLs anteriores e remove os papéis. Seu dry-run passou em 29/07/2026. Ele é exclusivo do projeto
de teste e requer confirmação do snapshot pré-migração; não executar em produção.

## Pré-requisito da promoção a produção — os quatro gates vivos param

⚠️ **Ler antes de aplicar esta migração em `lwzsxuaqqeoamukduhev`.** Não é risco atual: a migração
vive só no teste e produção não tem o schema `audit`. Mas no dia em que ela for aplicada em
produção, **quatro gates param de funcionar de uma vez** se ainda estiverem no caminho anterior —
por isso este pré-requisito teve que vir primeiro.

A migração de teste move as quatro RPCs diagnósticas de `public` para `audit` e revoga o
`execute` de `anon`. Até esta migração dos gates, eles chamavam essas RPCs por
`POST /rest/v1/rpc/<nome>` com a chave anon lida do `app.js` — e, por lerem essa chave, sempre
apontavam para **produção** (`docs/adr/0002-ambiente-de-teste-isolado.md`), nunca para o projeto
de teste. Hoje os quatro chamam `audit.<nome>()` pelo login mínimo `divat_auditor_ci`
(`scripts/lib/audit-database.mjs`), contra o projeto de **teste**:

| Gate | Função (schema `audit`) | Frequência hoje |
|---|---|---|
| `scripts/check_grants.mjs` | `divat_security_shape` | **diária** (`db-checks.yml`) |
| `scripts/check_deriva.mjs` | `divat_api_shape` | semanal + push/PR (`deriva.yml`) |
| `scripts/check_data_quality.mjs` | `divat_data_quality` | semanal (`db-checks.yml`) |
| `scripts/check_realtime.mjs` | `realtime_tables` | semanal (`db-checks.yml`) |

O mais grave é o **diário**: o `check_grants.mjs` é o controle que `docs/seguranca.md` § 9.1 nomeia
como compensação do default não-fechável do `supabase_admin` **em produção**. Migrar o transporte
não devolve essa cobertura sozinho — produção só volta a ser auditada automaticamente quando a
Fase 3 (schema `audit` + credencial auditora) for promovida para lá; até então, o item §9.1 em
produção depende só do checklist trimestral manual, como antes deste gate existir. Isso é
esperado, não um efeito colateral não previsto: era exatamente o preço de fazer a migração dos
gates ANTES da promoção, para não ficar sem gate NENHUM (nem em teste, nem em produção) durante a
janela entre as duas.

**Ordem cumprida:** os quatro gates foram migrados para a credencial de auditor (o mesmo caminho
do job `test-auditor`, via `divat_auditor_ci`) antes de qualquer DDL em produção — isto valia
como bloqueio para aplicar a migração de Fase 3 em produção, e agora está feito no código e
comprovado operacionalmente pelos runs de 22/08/2026 registrados em "Credencial auditora e
secret". O mesmo secret configurado alimentou `test-auditor`, `db-checks.yml` e `deriva.yml`; os
cinco validadores executaram e passaram. Se o secret for removido ou deixar de satisfazer as
travas de projeto/login, os quatro gates vivos continuam falhando fechado (saem 1) em vez de
rodar cegos.

Consequência para os scripts, já aplicada: os quatro deixaram de derivar `SB_URL`/`SB_KEY` do
`app.js` por regex (`check_deriva.mjs` e `check_realtime.mjs` continuam lendo o `app.js`, mas só
para conferir RPCs citadas e `RT_TABLES` — conteúdo do repo, não credencial). Um gate que fale por
credencial de auditor não podia continuar fazendo isso — passou a depender de secret, e portanto
deixou de rodar em PR de fora do repositório, igual ao `test-auditor` (o job é pulado, nunca tenta
usar o secret). Essa perda de alcance é parte da decisão, não um detalhe de implementação.

## Critérios antes de qualquer promoção

1. Criar/rotacionar `divat_auditor_ci` e configurar o secret sem expô-lo. **Cumprido e verificado
   em 22/08/2026.**
2. Executar os workflows manuais e anexar os resultados à PR. **Cumprido em 22/08/2026; ver os
   três runs na seção "Credencial auditora e secret".**
3. Rodar todos os testes, 17 views e gates existentes da PR.
4. Fazer smoke do preview protegido; configurar `VERCEL_AUTOMATION_BYPASS_SECRET` se ainda faltar.
5. Confirmar no GitHub que os checks obrigatórios bloqueiam alteração da `main`.
6. Manter a PR em rascunho e solicitar autorização separada para qualquer ação em produção.
7. **Antes de tocar produção:** migrar os quatro gates vivos para a credencial de auditor — ver a
   seção acima. **Feito no código e comprovado em 22/08/2026:** o secret estava configurado, e os
   runs verdes de `db-checks.yml` e `deriva.yml` executaram contra o projeto de teste. Essa
   evidência deve ser renovada depois de qualquer rotação da credencial ou mudança nesses gates;
   promover sem evidência vigente arrisca cegar o gate diário de grants nos dois projetos ao
   mesmo tempo.
