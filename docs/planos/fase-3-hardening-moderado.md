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

## Credencial auditora e secret

A criação/rotação do login é deliberadamente separada da migração, para impedir senha em SQL
versionado. Use uma senha aleatória entregue por gerenciador de segredos e uma validade curta:

```bash
psql "$ADMIN_DATABASE_URL" \
  --set=auditor_password="$AUDITOR_PASSWORD" \
  --set=valid_until="2026-10-31 23:59:59+00" \
  --file=scripts/bootstrap_phase3_auditor.sql
```

Depois, grave a URL de conexão no secret de Actions `SUPABASE_TEST_AUDIT_DATABASE_URL`. A URL deve
usar o projeto `gontnlfmothfglssbyyk` e o login `divat_auditor_ci`; o runner recusa qualquer outro
project ref, inclusive produção. Dispare manualmente o workflow `Phase 3 database security` e só
promova o job `test-auditor` a check obrigatório após ele passar.

O ambiente de automação que criou esta PR não possui acesso a Actions Secrets. Portanto o login e
o secret são o único passo operacional pendente; não devem ser improvisados em comentário, log ou
commit.

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

## Critérios antes de qualquer promoção

1. Criar/rotacionar `divat_auditor_ci` e configurar o secret sem expô-lo.
2. Executar o workflow manual e anexar o resultado à PR.
3. Rodar todos os testes, 23 views e gates existentes da PR.
4. Fazer smoke do preview protegido; configurar `VERCEL_AUTOMATION_BYPASS_SECRET` se ainda faltar.
5. Confirmar no GitHub que os checks obrigatórios bloqueiam alteração da `main`.
6. Manter a PR em rascunho e solicitar autorização separada para qualquer ação em produção.
