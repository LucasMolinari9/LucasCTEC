# Fase 3 — endurecimento moderado

## Decisões

- O portal permanece público e sem Supabase Auth/sessões.
- `authenticated` não terá acesso a tabelas nem funções do portal.
- Somente `divat_busca_logradouro(text, integer)` e `divat_linhas_regiao(text, text)` continuam como RPCs anônimas.
- Helpers internos ficam em `private`; diagnósticos ficam em `audit`.
- O CI de auditoria usa uma credencial PostgreSQL dedicada, somente leitura e sem acesso direto às tabelas.
- A primeira migração da Fase 3 pressupõe o schema existente; a Fase 2 reconciliará a baseline anterior e o histórico.

## Limites operacionais

Esta fase é aplicada somente em `gontnlfmothfglssbyyk`. Produção
(`lwzsxuaqqeoamukduhev`) não recebe DDL, credencial ou alteração de configuração.
A PR permanece em rascunho até uma autorização separada para produção.

## Ordem

1. Versionar e revisar a migração e o rollback.
2. Abrir a PR em rascunho.
3. Executar dry-run transacional no projeto de teste.
4. Aplicar a migração no projeto de teste.
5. Criar a credencial `divat_auditor_ci` fora do Git e armazenar sua URL no secret
   `SUPABASE_TEST_AUDIT_DATABASE_URL`.
6. Rodar catálogo, tentativas negativas, advisors, testes, views e preview smoke.
7. Anexar evidências e riscos residuais à PR.

## Rollback

O rollback começa desabilitando o login auditor, restaura as funções e ACLs anteriores no banco
de teste e termina com a reversão dos commits. O snapshot gerado antes da migração é a fonte de
verdade; nenhuma etapa de rollback é executada em produção.
