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
2. **Ligar Leaked Password Protection:** Supabase Dashboard → Authentication → Passwords → ativar.
   (Fecha o único WARN dos advisors.)
3. **Manter signup fechado:** Dashboard → Authentication → "Allow new users to sign up" = OFF.
4. **Repositório GitHub — ele é PÚBLICO desde 30/07/2026.** Até essa data este item mandava o
   contrário ("Change visibility → Private", pelo mapa de arquitetura que um repo público
   entrega). A decisão mudou; o que ela exige está inteiro na **seção 10**, que é o item de
   maior impacto pendente hoje. Não deixe este item como "feito" sem ter percorrido aquela
   lista.
5. **Rotacionar a `service_role`** se ela já foi colada fora do painel (chat, e-mail, arquivo):
   Dashboard → Settings → API.
6. **GitHub — branch protection na `main`:** bloquear force-push e exigir o CI verde antes de
   merge; confirmar que *secret scanning / push protection* está ativo. Detalhado na seção 10.

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

Três coisas não estão fechadas. Estão aqui para não serem redescobertas como "achado novo" a cada
auditoria — e para que a decisão de conviver com elas seja explícita, não esquecimento.

**9.1 — Defaults do role `supabase_admin` (SEC-01, parcial).** Existe um segundo conjunto de
default privileges, dono `supabase_admin`, concedendo `arwdDxtm` (inclui INSERT/UPDATE/DELETE/
TRUNCATE) a `anon` e `authenticated` em tabelas de `public`. **Não é fechável:** `postgres` não é
superusuário no Supabase e o `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` responde
`42501: permission denied to change default privileges`.

> **Correção de 28/07/2026 — este parágrafo dizia menos do que o risco real, e a versão errada
> ficou aqui até 30/07.** O texto afirmava que o default "só atinge objetos criados **por esse
> role**; o painel do Supabase cria como `postgres`, que já está fechado" — ou seja, que na
> prática não pegava. **A medição desmentiu:** rodar o `backup_schema.sql` num projeto novo pelo
> SQL Editor (portanto **como `postgres`**) fez as 18 tabelas nascerem com TRUNCATE/REFERENCES/
> TRIGGER para `anon` e `authenticated` — **108 grants**. Como **RLS não bloqueia TRUNCATE** e a
> anon key é pública, isso era caminho aberto para esvaziar o banco. O `CLAUDE.md` já registrava
> a versão corrigida desde 28/07; este documento continuou com a antiga — exatamente o tipo de
> deriva que o gate `[2b]` do `tests/check.js` existe para pegar, e que ele não pega porque é
> prosa, não número. **Num repositório público, um parágrafo que subestima um risco vivo é lido
> por quem procura o risco.**

**Mitigações, hoje:** o `docs/backup_schema.sql` revoga tudo que não é SELECT (não só `MAINTAIN`)
na reconstrução, e o gate `check_grants.mjs` roda **diariamente** enquanto esse default existir,
pegando qualquer tabela que apareça com grant de escrita.

**9.2 — Abuso da API pública (SEC-02).** A chave `anon` é pública por design e o navegador fala
**direto** com o Supabase — a Vercel não está no caminho da requisição, então não há onde aplicar
rate limit sem mudar a arquitetura (Edge Function, gateway ou RPC agregadora com quota). Um
atacante pode ignorar o `app.js` e enumerar o PostgREST até os tetos do servidor. **Risco de
integridade permanece baixo** (o banco é só-leitura para `anon`); o risco é de disponibilidade e
custo. **Controles que existem hoje:** `statement_timeout=3s` no role `anon`,
`pgrst.db_max_rows=30000` no `authenticator`, e os limites do plano. As otimizações do `app.js`
(memoização e cancelamento de busca obsoleta) reduzem a carga que o **portal legítimo** gera —
não são rate limiting e não devem ser contadas como tal.

**9.3 — Restore exercitado, não concluído (SEC-06).** Plano Free, sem PITR. Há backup semanal
automático, checksum e conferência de contagem. Em 28/07/2026 o runbook de `docs/backup.md` foi
executado pela primeira vez contra um projeto Supabase descartável e **achou dois defeitos reais**,
ambos corrigidos: grants mais abertos que os da produção (`anon` com TRUNCATE) e `row_id` recusando
os valores dos CSVs. Mas a restauração **não foi levada até o fim**, o portal **nunca foi apontado
para o banco restaurado** e **RTO/RPO seguem sem medição** — por isso SEC-06 continua **mitigado**,
não encerrado. O que falta está listado em `docs/backup.md`.

## 10. O repositório é público (desde 30/07/2026)

Até esta data o repo era privado, e boa parte das decisões registradas neste documento se
apoiava nisso — inclusive a seção 5, que **mandava mantê-lo privado**. A visibilidade mudou;
esta seção é o que a mudança custa, o que ela paga, e o que ainda falta o dono fazer no
navegador (o que não dá para fazer por commit).

### 10.1 O que muda no modelo de ameaça

O que **não** muda: a segurança do banco nunca dependeu do sigilo do código. Ela vem de **RLS +
privilégio mínimo**, e a chave `anon` sempre foi pública — está no `app.js` servido a todo
visitante. Um atacante decidido já podia ler o portal inteiro pelo *view-source*.

O que **muda de verdade** são quatro coisas:

1. **O histórico do git virou público, inteiro e para sempre.** Não só o `HEAD`: todo commit,
   toda branch, todo arquivo já apagado. Segredo que passou por aqui um dia está publicado —
   apagar depois não desfaz.
2. **Os workflows executam código de estranho.** `ci.yml`, `views.yml`, `semgrep.yml` e
   `codeql.yml` rodam em `pull_request`; um PR de fork faz o runner executar o que veio no PR.
   A configuração certa já estava no lugar (`pull_request`, **nunca** `pull_request_target`;
   `permissions: contents: read`; `persist-credentials: false`; nenhum secret nesses jobs), e é
   por isso que a superfície aqui é pequena. A exceção é o `deploy-smoke.yml` — o único com
   secret — endurecido junto com esta seção (allowlist de host e secret escopado ao passo).
3. **Logs e artifacts do Actions são públicos.** O `backup.yml` publica um dump como artifact:
   hoje ele traz só as 14 tabelas que a API pública já serve, então não vaza nada — mas passou
   a existir a trava do `scripts/backup_rest.mjs` que **recusa o modo completo dentro do
   Actions**, porque bastaria acrescentar a service key ao `env:` para o artifact público
   passar a incluir as tabelas de staging, em silêncio.
4. **Esta documentação virou leitura do atacante.** O `CLAUDE.md` e este arquivo descrevem o
   schema, os `project_ref`, os gates e — na seção 9 — as fraquezas ainda abertas. É uma troca
   consciente: documentar risco residual continua valendo mais do que escondê-lo (segurança por
   obscuridade não sobrevive a um *view-source*). Mas o preço é real, e cobra uma coisa:
   **parágrafo desatualizado que subestima risco vivo agora é um convite.** Foi por isso que a
   §9.1 foi corrigida na mesma leva.

### 10.2 O que foi conferido antes (30/07/2026)

- **Varredura de segredo em TODO o histórico** (`git log --all -p`), procurando JWT do Supabase,
  `ghp_`/`gho_`/`github_pat_`, `AKIA…` (AWS), `sk-…`, `nvapi-…`, tokens do Slack e blocos
  `BEGIN … PRIVATE KEY`. **Resultado: nenhum achado.** Os únicos JWTs no repositório são as duas
  chaves **`anon`** (produção e teste) — públicas por design. **Nenhuma `service_role` jamais
  entrou no git.** É o motivo de não haver rotação de chave pendente nesta seção.
- **Nenhum arquivo de dado versionado.** Nada de `.csv`, `.env`, `.dump` ou chave em nenhum
  commit do histórico — o `.gitignore` segurou desde o começo.

### 10.3 O que passou a existir no repositório

| Arquivo | Para quê |
|---|---|
| [`SECURITY.md`](../SECURITY.md) | Canal privado de relato, regras do teste, e a lista do que **não** é vulnerabilidade (a chave `anon` no código encabeça). Sem isso, quem achar algo abre issue pública — ou não avisa. |
| [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | Code Scanning, **gratuito em repo público**. É o ganho direto da mudança: análise de fluxo de dados, que nenhuma regra por padrão textual enxerga. |
| [`.github/dependabot.yml`](../.github/dependabot.yml) | As actions estão presas ao SHA — sem isso, "preso ao SHA" vira "preso numa versão vulnerável para sempre". |
| [`.github/CODEOWNERS`](../.github/CODEOWNERS) | PR de fora não toca em `.github/`, `scripts/`, `tests/`, `vercel.json` nem na config de agente sem revisão explícita. **Só vale com a proteção da branch ligada** (10.4). |

E três endurecimentos em código já existente: a allowlist de host + escopo do secret no
`deploy-smoke.yml`, a trava de CI no `backup_rest.mjs`, e a §9.1 deste documento.

### 10.4 O que SÓ O DONO pode fazer — checklist (nada disto sai por commit)

São ajustes de painel. Enquanto não forem feitos, os arquivos acima são intenção, não controle.

**GitHub → Settings → Code security**
1. **Private vulnerability reporting: ON.** É o canal que o `SECURITY.md` promete — desligado,
   o botão "Report a vulnerability" não existe e a promessa é falsa.
2. **Secret scanning: ON** e **Push protection: ON.** Grátis em repo público. A push protection
   é a que importa: barra o commit **antes** de ele existir. Dado o que a 10.1 diz sobre o
   histórico ser eterno, é o controle de maior valor desta lista.
3. **Dependabot alerts** e **security updates: ON.**

**GitHub → Settings → Actions → General**
4. **"Fork pull request workflows from outside collaborators" → *Require approval for all
   outside collaborators*.** O padrão só exige aprovação de quem contribui pela primeira vez;
   em repo público, isso significa que a segunda tentativa roda sozinha.
5. **Workflow permissions → *Read repository contents and packages permissions*.** Os workflows
   já declaram `permissions:` cada um, mas o default do repo é a rede embaixo.
6. **Desmarcar "Allow GitHub Actions to create and approve pull requests".** Nenhum workflow
   daqui faz isso; ligado, é só superfície.

**GitHub → Settings → Rules/Branches → proteger a `main`**
7. Exigir **PR antes do merge** e **revisão de Code Owner** (é o que liga o `CODEOWNERS`).
8. Exigir verdes: **CI**, **Views**, **Semgrep**, **CodeQL**.
9. **Bloquear force-push e exclusão da branch.** Mesmo com um só mantenedor: protege contra o
   próprio erro, e é o que impede reescrever o histórico depois de um vazamento.

**Vercel**
10. Confirmar que **preview de PR de fork exige autorização** (o padrão da Vercel para repo
    público). Sem isso, um PR de estranho vira um deploy no domínio do projeto — e o
    `deployment_status` dele chega ao `deploy-smoke.yml`. A allowlist de host limita o estrago;
    a autorização é que evita a situação.

**Higiene**
11. **Apagar as branches já mergeadas.** Num repo público cada branch parada é código antigo —
    com workflows antigos, sem os endurecimentos desta seção — publicado e navegável.
12. Continua valendo, e agora com mais peso: **MFA nas três contas** (GitHub, Supabase, Vercel),
    itens 1 a 3 da seção 5.
