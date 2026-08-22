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
- **A JWT `anon` legada é pública de propósito.** Ela aparece no `app.js` porque o navegador de
  todo visitante precisa dela. Isso **não** é um vazamento. A proteção nunca
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
do ETL sem policy, de propósito) e 1 WARN — *Leaked Password Protection* desligado (seção 5,
item 2).

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
expressão), `realtime_tables` (o `scripts/check_realtime.mjs` roda como `anon`),
`divat_data_quality` (o runner semanal planejado na issue #63 rodará como `anon`) e
`divat_api_shape` (o `scripts/check_deriva.mjs` roda como `anon`; devolve só o que a API
pública já mostra).
A única exceção, `fn_vigor_auto` (função de trigger), teve o EXECUTE de `anon` revogado em
26/07/2026 (era herança inútil do default PUBLIC do Postgres; REVOKE aplicado após backup
fresco, com o trigger conferido disparando e as RPCs do portal intactas).
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
2. **Leaked Password Protection:** manter como controle desejável se o projeto migrar para Pro ou
   superior. O recurso não está disponível no plano Free; não fazer upgrade nem introduzir Auth
   apenas para fechar esse WARN dos advisors.
3. **Manter signup fechado:** Dashboard → Authentication → "Allow new users to sign up" = OFF.
4. **Rotacionar a `service_role`** se ela já foi colada fora do painel (chat, e-mail, arquivo):
   Dashboard → Settings → API.
5. **GitHub — branch protection na `main`:** bloquear force-push e exigir o CI verde antes de
   merge; confirmar que *secret scanning / push protection* está ativo.

> **Sobre a visibilidade do repositório:** até 31/07/2026 esta lista trazia "tornar o repositório
> privado" como item 4, com o caminho do painel. **O repositório é público por decisão** — ver
> `docs/adr/0003-repositorio-publico.md`. A instrução saiu daqui porque mandava fazer o oposto da
> decisão em vigor, e este documento é lido por agentes que executam o que leem. A segurança do
> portal nunca dependeu do sigilo do código: o `app.js` e a chave `anon` são servidos a todo
> visitante desde sempre.

### Confirmação operacional — 22/08/2026

No Dashboard do projeto de produção **Banco - Divat** (`lwzsxuaqqeoamukduhev`), plano **Free**,
foi confirmado que **Allow new users to sign up** e **Allow anonymous sign-ins** permanecem
desativados. A tela do provedor Email confirmou também que **Prevent use of leaked passwords** é
exclusivo do plano Pro ou superior e, por isso, permanece indisponível neste projeto. Nenhuma
configuração foi alterada: o portal continua público, sem Supabase Auth/sessões e sem acesso para
`authenticated`, conforme `docs/planos/fase-3-hardening-moderado.md`.

## 6. Checklist trimestral (5 min numa sessão do Claude)

> **Os itens 2 e 3 viraram automáticos em 27/07/2026.** O gate `scripts/check_grants.mjs` roda no
> workflow `db-checks.yml` e falha sozinho se RLS cair, aparecer grant/policy de escrita, ou surgir
> função executável por `PUBLIC`/`anon` fora da baseline. Era o achado SEC-04: um checklist
> trimestral manual deixava uma alteração perigosa feita no painel viva por meses. O que sobrou
> aqui é conferência de olho — se o gate estiver verde, os itens 2 e 3 são redundância barata.
>
> **Frequência: DIÁRIA**, não semanal, enquanto existir o default de `supabase_admin` descrito na
> seção 9. Quando ele deixar de existir, pode voltar a semanal.

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
- **Tabela nova precisa de `GRANT SELECT` + policy explícitos; RPC nova precisa de `GRANT EXECUTE`
  explícito.** Desde 27/07/2026 nada nasce acessível sozinho.

## 9. Riscos residuais conhecidos e ACEITOS

Quatro coisas não estão fechadas. Estão aqui para não serem redescobertas como "achado novo" a
cada auditoria — e para que a decisão de conviver com elas seja explícita, não esquecimento.

> **Por que esta seção é curta.** Ela registra **que** cada risco foi avaliado, **qual controle o
> compensa** e **por que a convivência foi aceita** — é registro de decisão, não log de auditoria.
> A versão anterior trazia dump de medição e hash de commit no meio do manual do dono, e ficava
> ilegível para a pessoa que precisa decidir. A medição que originou cada item continua registrada
> onde ela serve: o § 9.1 no `CLAUDE.md` (seção **Supabase → RLS / segurança**), o § 9.3 no
> `docs/backup.md`. **Encurtar aqui não é esconder nada** — o repositório é público por decisão
> (`docs/adr/0003-repositorio-publico.md`) e o que protege o banco é o gate diário, não o sigilo.

**9.1 — Defaults de privilégio herdados do Supabase (SEC-01, parcial).** O projeto tem um conjunto
de default privileges que **não pertence ao `postgres`** e por isso **não é fechável** por nós —
`postgres` não é superusuário no Supabase. Consequência: a garantia "objeto novo nasce fechado",
que vale para os defaults que controlamos, **não é completa**.

**Controle que compensava, e que hoje NÃO cobre mais produção automaticamente:** o
`docs/backup_schema.sql` revoga explicitamente tudo que não é SELECT — isto continua valendo,
independente do que segue. O gate `scripts/check_grants.mjs` rodava **diariamente**
(workflow `db-checks.yml`) contra **produção**, falhando se qualquer tabela aparecesse com grant
ou policy de escrita para `anon`/`authenticated`. Desde a migração para o auditor PostgreSQL
(§ 10), ele passou a rodar pelo login `divat_auditor_ci` contra o projeto de **TESTE** — produção
ainda não tem o schema `audit`. **Efeito colateral aceito, não escondido:** enquanto a Fase 3 não
chegar a produção, este risco em produção volta a depender só do checklist **trimestral manual**,
o mesmo que este gate foi criado para substituir (achado SEC-04). A frequência diária do workflow
continua — protegendo o projeto de teste hoje — pela mesma razão histórica: quando o gate
recuperar alcance de produção (Fase 3 promovida), a cadência não deve regredir para semanal antes
de fechar este item lá. Regras técnicas: `CLAUDE.md`, seção **Supabase → RLS / segurança**.

**Segundo controle, pelo outro lado (Fase 3, § 10):** toda migração que cria tabela pública precisa
**revogar `anon`/`authenticated` e ligar RLS na mesma transação**, e o gate
`scripts/check_migrations.mjs` cobra isso **no diff**, offline. Os dois são complementares e nenhum
substitui o outro: o `check_migrations.mjs` fecha **pelo código**, antes de a tabela existir; o
`check_grants.mjs` detecta **drift vivo**, inclusive o que nasce fora de migração (um clique no
painel). Só o par cobre um default que não podemos fechar.

**9.2 — Abuso da API pública (SEC-02).** A chave `anon` é pública por design e o navegador fala
**direto** com o Supabase — a Vercel não está no caminho da requisição, então **não há onde aplicar
rate limit sem mudar a arquitetura** (Edge Function, gateway ou RPC agregadora com quota). Avaliado
e aceito: o risco é de **disponibilidade e custo**, não de integridade — o banco é só-leitura para
`anon`, e isso é verificado contra o banco vivo pelo gate diário, não presumido.

**Controles que existem hoje:** `statement_timeout` no role `anon`, teto de linhas do PostgREST e
os limites do plano. ⚠️ As otimizações do `app.js` (memoização, cancelamento de busca obsoleta)
reduzem a carga do **portal legítimo** — **não são rate limiting** e não devem ser contadas como
tal em auditoria futura.

**9.3 — Restore exercitado, não concluído (SEC-06).** Plano Free, sem PITR. Há backup semanal
automático, checksum e conferência de contagem. Em 28/07/2026 o runbook de `docs/backup.md` foi
executado pela primeira vez contra um projeto Supabase descartável e **achou dois defeitos reais**,
ambos já corrigidos — prova de que o exercício valeu. Mas o exercício **não foi levado até o fim** e
**RTO/RPO seguem sem medição**: não se sabe quanto tempo uma recuperação real levaria. Por isso
SEC-06 continua **mitigado**, não encerrado.

É o maior item aberto do projeto, apontado em 16/07 e de novo em 27/07. Só o dono pode fechá-lo
(exige a máquina dele e um projeto Supabase descartável); o checklist do que falta está no
`docs/backup.md`, seção **O que a integridade do dump garante (e o que NÃO garante)**.

**9.4 — `rls_auto_enable()` é `SECURITY DEFINER` (aceito em 22/08/2026).** Medido contra o
projeto de TESTE ao configurar o auditor desta PR: existe um event trigger `ensure_rls`
(`ddl_command_end`), instalado depois de 09/08/2026 — quando `docs/schema.md` chegou a afirmar,
medido, que a função **não existia** e que não havia automatismo ligando RLS. A provisão não é
mais verdadeira para o projeto de teste; a origem exata (quem/quando instalou) não foi
determinada. A função está registrada como exceção aceita em `scripts/security_baseline.json`
(achado `funcao_security_definer`), depois de ler o corpo dela.

**Por que é aceito, não revogado:** o corpo só faz `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
em tabela nova de `public` — nunca concede privilégio a `anon`/`authenticated`, nunca lê dado.
`SECURITY DEFINER` é necessário aqui por desenho: um event trigger roda com os direitos de quem
emitiu o DDL, e a ideia é ligar RLS **mesmo que** quem criou a tabela não tivesse esse privilégio
— exatamente o oposto de escalação perigosa. Não substitui a disciplina da skill `db-change`
(`ENABLE ROW LEVEL SECURITY` explícito continua sendo o contrato, não este trigger de rede de
segurança) — **produção não foi conferida** e não se deve presumir que ela tem o mesmo trigger.

## 10. Fase 3 — RPCs diagnósticas e auditor mínimo

No projeto de teste, a migração `20260729034018_phase3_moderate_hardening.sql` removeu as quatro
RPCs diagnósticas da Data API e as colocou em `audit`. Somente
`divat_busca_logradouro(text,integer)` e `divat_linhas_regiao(text,text)` seguem executáveis por
`anon`; `authenticated` ficou sem grants porque o produto não usa Auth nem sessões.

O owner `divat_audit_owner` é `NOLOGIN`, sem privilégios administrativos e herda somente
`anon`. As funções diagnósticas são `SECURITY DEFINER` sob esse owner limitado e só
`divat_auditor` pode executá-las. O login externo `divat_auditor_ci`, quando criado pelo runbook,
é apenas membro desse papel e não tem `SELECT` direto nas tabelas.

A aplicação em produção exige autorização separada. Os quatro gates vivos (`check_grants.mjs`,
`check_deriva.mjs`, `check_data_quality.mjs`, `check_realtime.mjs`) migraram para este caminho —
`scripts/lib/audit-database.mjs`, login `divat_auditor_ci` — e por isso passaram a auditar o
projeto de **TESTE**, não mais produção pelo caminho anterior (anon/PostgREST). Não é meio-termo:
até a Fase 3 chegar a produção, produção não tem mais nenhum dos quatro gates automatizados a
observá-la (ver § 9.1 para o item que isso mais afeta). Decisões, evidências e rollback:
`docs/planos/fase-3-hardening-moderado.md`.
