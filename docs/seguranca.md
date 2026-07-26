# Segurança do Portal DIVAT — manual do dono

Manual em linguagem direta sobre a segurança deste portal: o que protege o banco, o resultado
da auditoria de 23/07/2026 (com o teste de invasão real), o que só o dono pode fazer, e o
checklist para revisar de tempos em tempos. Complementa a seção **RLS / segurança** do
`CLAUDE.md` (regras técnicas) e o `docs/backup.md` (rede de segurança de dados).

## 1. Em uma frase
O portal é **somente leitura de verdade**: a chave que vai ao navegador (`anon`) só consegue
**ler** dados que já são públicos. Não existe caminho pela API pública para escrever, alterar ou
apagar nada — isso foi **testado ao vivo** (seção 4), não apenas presumido.

## 2. O modelo de ameaça, sem jargão
- **A chave `anon` é pública de propósito.** Ela aparece no `app.js` e no `index.html` porque o
  navegador de todo visitante precisa dela. Isso **não** é um vazamento. A proteção nunca
  dependeu de escondê-la — depende do **RLS** (Row Level Security) do banco, que dá à `anon`
  apenas permissão de SELECT.
- **O que a `anon` NÃO pode fazer:** INSERT, UPDATE, DELETE, ler tabelas de staging, chamar
  funções privilegiadas. Tudo negado pelo banco.
- **A chave `service_role`** (que ignora o RLS) **nunca** pode ir para o código, o site ou o
  Git. O dono só a usa no **painel do Supabase**. O gate `tests/check.js` [1b] falha o CI se
  alguém colar uma `service_role` num arquivo servido.
- **O ponto fraco real não é o banco — são as CONTAS.** Quem rouba a senha do Supabase, do
  GitHub ou da Vercel entra como o dono e contorna toda proteção técnica. Por isso a seção 5
  (MFA) é a de maior impacto.

## 3. Resultado da auditoria (23/07/2026)
Auditoria de código + banco ao vivo + histórico do Git.

**Banco:** zero grants de escrita para `anon`/`authenticated`; zero policies além de SELECT; RLS
ligado em 100% das tabelas. Advisors de segurança do Supabase: só os 4 INFO esperados (staging
do ETL sem policy, de propósito) e 1 WARN — *Leaked Password Protection* desligado (ação 5).

**Código / exposição:** nenhuma `service_role` no código, no site ou em **todo o histórico do
Git** (checado commit a commit — só existe a `anon`); nenhum segredo, senha ou chave privada;
nenhum e-mail/IP real vazado. `.gitignore` bloqueia `.env`, `.csv`, dumps. A CSP e os cabeçalhos
de segurança do `vercel.json` estão restritivos. Escape de HTML (`esc()`) aplicado
consistentemente. **Zero achados de segredo exposto.**

**SQL injection / blind SQL injection:** sem superfície. O front nunca monta SQL — manda filtros
para o PostgREST, que trata a entrada como **valor de parâmetro** (equivalente a prepared
statement). Camada extra: `ilikeTerm` (`app.js`) remove `( ) *` e faz URL-encode. As funções SQL
que o `anon` consegue executar (estado conferido no catálogo em 26/07/2026) são todas
`SECURITY INVOKER`, com parâmetros tipados e `search_path` fixado, e cada uma tem motivo:
`divat_busca_logradouro` e `divat_linhas_regiao` (as 2 RPCs que o front chama),
`f_unaccent` (chamada por dentro da busca, que roda COMO `anon`, e usada no índice de
expressão), `realtime_tables` (o `scripts/check_realtime.mjs` roda como `anon`) e
`divat_data_quality` (o runner semanal planejado na issue #63 rodará como `anon`).
Sobra um EXECUTE inútil de `anon` em `fn_vigor_auto` (função de trigger; herdou o default
PUBLIC do Postgres) — inócuo (`anon` não escreve em `portaria_teste`, então o trigger nunca
roda como ele), com REVOKE pendente: rodar o workflow **Backup** primeiro (regra do
`CLAUDE.md` para REVOKE) e então
`REVOKE ALL ON FUNCTION public.fn_vigor_auto() FROM PUBLIC, anon, authenticated;`.
Confirmado pelo teste da seção 4.

## 4. Teste de invasão executado (evidência datada — 23/07/2026)
Ataque real rodado **como a role `anon`** (a mesma identidade de qualquer visitante/atacante).
Cada tentativa foi feita dentro de uma transação e revertida — nada foi modificado.

| Cenário (como `anon`) | Resultado real |
|---|---|
| **1. SQL injection** na busca (`'; DROP TABLE tabela_vista_teste; --`) | **INÓCUO** — payload tratado como texto literal (0 linhas); nenhum comando executado, tabela intacta |
| **2. INSERT** (gravar linha nova) | **NEGADO** — `permission denied for table tabela_vista_teste` |
| **3. UPDATE** (alterar dados) | **NEGADO** — `permission denied for table tabela_vista_teste` |
| **4. DELETE** (apagar tudo) | **NEGADO** — `permission denied for table tabela_vista_teste` |
| **5. LER staging** `evento_dados` | **NEGADO/INVISÍVEL** — `permission denied for table evento_dados` |

Interpretação: mesmo que um dia surgisse alguma falha nova de SQLi, os cenários 2–4 mostram que a
`anon` não tem permissão de escrita — uma segunda muralha independente. No pior caso, um invasor
lê o que já é público. Não há segredo para *blind*-extrair.

Como reproduzir (numa sessão do Claude com o MCP do Supabase, ou pedir ao Claude): rodar o mesmo
bloco `SET ROLE anon` + tentativas de INSERT/UPDATE/DELETE/SELECT em transação revertida.

## 5. O que SÓ O DONO pode fazer (maior ganho de segurança)
1. **MFA / verificação em 2 etapas nas TRÊS contas:** Supabase, GitHub e Vercel. Senhas fortes e
   únicas em cada uma. *(É a ação de maior impacto de todo o plano.)*
2. **Ligar Leaked Password Protection:** Supabase Dashboard → Authentication → Passwords → ativar.
   (Fecha o único WARN dos advisors.)
3. **Manter signup fechado:** Dashboard → Authentication → "Allow new users to sign up" = OFF.
4. **Repositório GitHub privado:** Settings → Danger Zone → Change visibility → Private. Não
   afeta o site na Vercel (deploy segue por OAuth) nem o backup semanal. Remove o "mapa" de
   arquitetura que um repo público entrega a um atacante.
5. **Rotacionar a `service_role`** se ela já foi colada fora do painel (chat, e-mail, arquivo):
   Dashboard → Settings → API.
6. **GitHub — branch protection na `main`:** bloquear force-push e exigir o CI verde antes de
   merge; confirmar que *secret scanning / push protection* está ativo.

## 6. Checklist trimestral (5 min numa sessão do Claude)
1. Rodar os **advisors de segurança** do Supabase → esperado: só os 4 INFO de staging, zero WARN.
2. Reexecutar a **query de grants/policies** (esperado: vazio = sem caminho de escrita):
   ```sql
   select 'grant_escrita' t, table_name, grantee, privilege_type
   from information_schema.role_table_grants
   where grantee in ('anon','authenticated') and table_schema='public' and privilege_type<>'SELECT'
   union all
   select 'policy_nao_select', tablename, roles::text, cmd from pg_policies
   where schemaname='public' and cmd<>'SELECT'
   union all
   select 'rls_off', c.relname,'','' from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;
   ```
3. Rodar `scripts/gen_security_snapshot.sql` e comparar com `docs/backup_schema.sql` (desvio =
   investigar).
4. Conferir que o workflow `.github/workflows/backup.yml` rodou (aba Actions) e tem artifact
   recente.
5. Repetir o teste de invasão da seção 4 (opcional, mas tranquilizador).

## 7. Em caso de suspeita de invasão
1. **Rotacionar imediatamente** a `service_role` e a `anon` (Dashboard → Settings → API) e
   trocar as senhas das três contas; ativar MFA se ainda não estiver.
2. Verificar os **logs** do Supabase (Dashboard → Logs) e o histórico de deploys da Vercel.
3. Rodar os advisors e a query da seção 6 para checar se algum grant/policy foi alterado.
4. Se houver dado corrompido, **restaurar do backup** conforme `docs/backup.md` (nunca rodar nada
   destrutivo sem backup fresco).

## 8. Regras permanentes (não quebrar)
- **Nunca** conceder escrita (GRANT ou policy de INSERT/UPDATE/DELETE) a `anon`/`authenticated`.
- Toda mudança de estrutura do banco passa pela skill `db-change`.
- Nada destrutivo (DROP/DELETE/TRUNCATE/REVOKE/migração) sem backup fresco.
- `service_role` só no painel — jamais em código, site ou Git.
