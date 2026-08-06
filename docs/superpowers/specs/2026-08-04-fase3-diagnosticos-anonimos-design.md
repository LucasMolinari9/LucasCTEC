# Fase 3 — diagnósticos anônimos e a transição dos gates vivos

> **Estado:** desenho **revisado em 04/08/2026**, depois da execução parcial (T1 e T2 concluídas,
> T3 reprovada em revisão). Duas coisas forçaram a revisão e estão registradas em § 14 e § 15:
> a auditoria das issues abertas, que eu deveria ter feito antes de desenhar, e três defeitos
> técnicos achados na revisão da migração.
> **Data:** 04/08/2026 · **Base:** `e09893d` (merge do #97)
> **Substitui a direção** registrada em `docs/planos/fase-3-hardening-moderado.md`, seção
> "Pré-requisito da promoção a produção — os quatro gates vivos param". O diagnóstico daquela
> seção continua correto; o que muda é o **remédio**.

## 1. Por que agora

A migração `20260729034018_phase3_moderate_hardening.sql` está aplicada **somente no projeto de
teste** (`gontnlfmothfglssbyyk`). Produção (`lwzsxuaqqeoamukduhev`) não recebeu DDL nenhum.

No dia em que ela for aplicada em produção, quatro gates vivos param juntos. Isso já está
documentado no plano da Fase 3 e não é achado novo. O que este desenho acrescenta são três fatos
medidos em 04/08/2026 que mudam qual remédio é o certo.

### 1.1 `divat_data_quality()` é uma alavanca de indisponibilidade aberta hoje

A função varre **59 colunas** `text`/`varchar` das 14 tabelas do portal com
`LIKE '%<U+FFFD>%'` — curinga à esquerda, não indexável, varredura completa — sobre **~116 mil
linhas** (`itinerario_teste` 52.146, `qh_predeterminado_teste` 23.838, `evento_teste` 20.753),
mais os anti-joins de órfãos. Ela é executável por `anon`, com a chave pública que está no
`app.js` de um repositório público, sem throttle, numa instância Free/NANO.

Severidade: **degradação, não vazamento**. Não há perda de dado nem escrita. Mas qualquer pessoa
pode pedir isso em laço, e o pool de conexões de uma NANO é pequeno.

Consequência para o desenho: mover essa função para fora do alcance de `anon` é ganho de
**disponibilidade**, não só de higiene — um benefício que o plano da Fase 3 não reivindica.

### 1.2 `check_phase3_audit.mjs` não é substituto dos quatro gates

O plano diz "migrar os quatro gates para a credencial de auditor". Medido, isso não é trocar
transporte: é **portar lógica de comparação**. O auditor confere forma; os gates conferem
substância contra baselines.

| Gate | O que compara hoje | O que o auditor confere |
|---|---|---|
| `check_grants` | matriz completa de grants/policies × `security_baseline.json`, 3 exceções aceitas | `all_rls === true` + listas de grant de função |
| `check_data_quality` | achados × `data_quality_baseline.json`, com política `REBAIXADOS_A_AVISO` | `typeof data_quality_rows === 'number'` |
| `check_realtime` | *quais* tabelas na publicação × `RT_TABLES` do `app.js` | `realtime_count === 14` |
| `check_deriva` | docs × banco (tabelas, colunas do mermaid, RPCs) | só a allowlist de RPCs |

### 1.3 O alarme diário herdaria um prazo de validade

`docs/planos/fase-3-hardening-moderado.md` cria `divat_auditor_ci` com
`valid_until="2026-10-31 23:59:59+00"`. Se o gate diário de grants passar a depender dessa
credencial, **o alarme tem data de vencimento**: em 1º de novembro ele apaga sozinho. A falha é de
leitura — o portal continua normal e nada aparece na tela.

O `check_grants.mjs` é o controle que `docs/seguranca.md` § 9.1 nomeia como compensação do default
não-fechável do `supabase_admin`. Trocar um buraco fechado por um alarme com prazo é o oposto do
objetivo da Fase 3.

## 2. Decisão

A superfície anônima passa a ser definida por **um critério**, não por um número:

> É admissível como RPC anônima **de diagnóstico** o que já é público por decisão do ADR-0003,
> desde que seja barato (só catálogo) e não enumerável além do que o repositório já publica.

Isso separa duas coisas que o plano tratava como uma só:

| Diagnóstico | O que revela | Já é público? | Custo | Destino |
|---|---|---|---|---|
| `divat_api_shape` | tabelas, colunas, nomes de RPC | sim — `docs/schema.md` | catálogo | fica anônima em `public` |
| `realtime_tables` | membros da publicação | sim — `CLAUDE.md` lista as 14 | catálogo | fica anônima em `public` |
| `divat_security_shape` | matriz de grants e policies | **não** | catálogo | → `audit` |
| `divat_data_quality` | contagens de dívida | sim, mas custa 59 varreduras | **caro** | → `audit` |

Esconder as duas primeiras custaria dois gates e não compraria confidencialidade: o mesmo conteúdo
está escrito à mão no repositório público. Esconder as duas últimas compra coisas reais — recon no
caso da matriz, disponibilidade no caso do scan.

**Custo aceito:** a allowlist anônima vai de 2 para 5 RPCs. Ver § 8.

## 3. O objeto novo — `public.divat_security_digest()`

`SECURITY INVOKER`, só catálogo, sem varredura de tabela. Devolve resumo, não matriz:

```json
{ "digest": "<sha256 hex de serialização canônica>",
  "tabelas_publicas": 18,
  "todas_com_rls": true,
  "anon_escreve": false,
  "anon_maintain": false,
  "anon_le_view": false,
  "authenticated_tem_privilegio": false,
  "funcoes_definer_anon": 0,
  "funcoes_sem_search_path": 0,
  "defaults_permissivos": 3,
  "anon_rpcs": 5 }
```

Os campos, sem ambiguidade:

| Campo | O que é | Escopo |
|---|---|---|
| `digest` | sha256 hex da serialização canônica (ver § 3.1) | tudo abaixo |
| `tabelas_publicas` | **todas** as tabelas de `public` (18 — inclui as 4 de staging), não as 14 legíveis por `anon` | `public` |
| `todas_com_rls` | falso se **qualquer** tabela de `public` estiver sem RLS | `public` |
| `anon_escreve` | verdadeiro se qualquer tabela conceder `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` a `anon` — **por tabela ou por coluna** | `public` |
| `anon_maintain` | verdadeiro se qualquer tabela conceder `MAINTAIN` a `anon` | `public` |
| `anon_le_view` | verdadeiro se `anon` puder ler qualquer view/matview | `public` |
| `authenticated_tem_privilegio` | verdadeiro se `authenticated` tiver qualquer privilégio de tabela | `public` |
| `funcoes_definer_anon` | funções `SECURITY DEFINER` executáveis por `anon` | `public`+`audit`+`private` |
| `funcoes_sem_search_path` | funções que não fixam `search_path` | `public`+`audit`+`private` |
| `defaults_permissivos` | entradas de `pg_default_acl` que concedem a `PUBLIC`/`anon`/`authenticated` | todos os schemas |
| `anon_rpcs` | funções de `public` executáveis por `anon` | `public` |

**`anon_le_view` e a cobertura de privilégio por coluna vêm da revisão da T4 (§ 15, I4).** Duas
lacunas da mesma classe: `relkind in ('r','p')` excluía views — e view não-`security_invoker` roda
com os direitos do dono, então uma view sobre as tabelas de staging concedida a `anon` saía com
digest **byte-idêntico** —, e `has_table_privilege` ignora grant por coluna, então um
`grant update (col) on … to anon` deixava `anon_escreve` em `false` com escrita real aberta,
contra a garantia central do repositório. Ambas fechadas: bloco hasheado próprio para `('v','m')`
e `has_any_column_privilege` somado aos termos de escrita.

**Os quatro campos de contagem existem por causa de um achado da revisão da migração (§ 15, I2).** A
primeira versão deste desenho tinha só seis campos e era **cega** para `MAINTAIN`, `search_path`
fixo, `default_privileges` e os schemas `audit`/`private` — quatro coisas que o
`scripts/check_grants.mjs` confere hoje. Como `default_privileges` é justamente a compensação do
default não-fechável do `supabase_admin` (`docs/seguranca.md` § 9.1), a versão de seis campos
teria trocado o alarme diário por um alarme diário **sem a checagem que justifica a cadência
diária** — um `MAINTAIN` reconcedido a `anon` deixaria o digest byte-idêntico. Nenhum dos quatro
campos novos é enumerável: são contagens e booleanos.

Três decisões dentro dela:

**Sem timestamp no material do hash.** `divat_security_shape()` embute `'gerado_em', now()`.
Hashear a saída dele direto produziria digest novo a cada chamada e um gate que grita todo dia. O
digest é calculado sobre uma serialização canônica, **ordenada por nome, com o timestamp fora**.

**Nada enumerável.** Contagens e booleanos. Quem chama não aprende *quais* tabelas, *quais*
policies, nem *quais* privilégios — só que o conjunto mudou.

**`INVOKER`, não `DEFINER`.** Não concede a `anon` poder nenhum: `has_table_privilege` aceita o
papel como argumento e `pg_class`/`pg_policy` são legíveis por qualquer papel. O que a função faz é
ser a **ponte estreita** — o PostgREST não expõe `pg_catalog`, então sem ela `anon` não alcança
catálogo nenhum. Não há escalação de privilégio a revisar.

Hash: `encode(sha256(convert_to(texto,'UTF8')),'hex')` — embutido no PostgreSQL desde a 11, sem
`pgcrypto`, sem extensão nova.

### 3.1 Severidade em dois canais

A perda óbvia de um digest é diagnóstico: ele diz *que* mudou, não *o que*. Os booleanos compram
isso de volta cobrindo as classes perigosas diretamente.

| Sinal | Significado | Ação |
|---|---|---|
| **Indicador grave** — `anon_escreve`, `anon_maintain`, `!todas_com_rls`, `authenticated_tem_privilegio`, `funcoes_definer_anon > 0` | emergência, classe conhecida na hora | revogar; **nunca** baselinar |
| **Contagem subiu** — `anon_rpcs`, `defaults_permissivos` ou `funcoes_sem_search_path` acima do baseline | privilégio novo apareceu; é o sinal do SEC-01 | conferir se é deliberado; revogar ou registrar |
| **Só o digest mudou**, o resto são | mudança estrutural benigna (tabela nova, policy renomeada) | investigar com a credencial ou pelo painel; re-baselinar |

**Detecção fica no canal barato e perene; diagnóstico fica no canal caro.**

Contagem **que sobe** é erro; contagem que **desce** é dívida resolvida — o gate diz para apertar
o baseline, no mesmo espírito do `resolvidos` que o `check_grants.mjs` já imprime hoje.

### 3.2 O baseline não pode silenciar a classe perigosa

`--atualizar-baseline` atualiza **o digest e as três contagens** (`anon_rpcs`,
`defaults_permissivos`, `funcoes_sem_search_path`) — e nada mais. Os **cinco indicadores graves**
(`anon_escreve`, `anon_maintain`, `todas_com_rls`, `authenticated_tem_privilegio`,
`funcoes_definer_anon`) são expectativas **fixas no código do `check_grants.mjs`**, não dado de
`security_baseline.json`. Não existe caminho para baselinar `anon_escreve: true`.

O campo `achados` do baseline — as três exceções documentadas do `supabase_admin` — é **preservado
intacto** por `--atualizar-baseline`, nunca reescrito a partir do digest. Mesma disciplina do
`orfaos_conhecidos` do `data_quality_baseline.json`.

Razão: um gate cujo conserto habitual é rodar `--atualizar-baseline` ensina o reflexo de apagar o
alarme. O reflexo continua possível para mudança benigna e **nunca** alcança a classe perigosa.

### 3.3 O alvo vem do gatilho, nunca do `app.js` (issue #74)

A issue **#74** ("Gates de banco devem validar exclusivamente o Supabase de teste") exige, em
texto: configuração explícita do projeto de teste, falha fechada ao receber o ref de produção, e
**nenhum gate de PR derivando o alvo do `app.js`**. Hoje os quatro gates derivam `SB_URL`/`SB_KEY`
dos literais do `app.js` — que são de **produção**.

Isso colide com a premissa deste desenho, que precisa de um alarme **de produção**. As duas coisas
se reconciliam separando *quem pergunta* de *sobre qual banco*:

> **O alvo de um gate é configuração explícita, resolvida por `scripts/lib/ambiente.mjs` a partir
> da variável `DIVAT_ALVO` (`teste` | `producao`) e do arquivo `scripts/ambientes.json`. Nenhum
> gate deriva alvo do `app.js`. Sem `DIVAT_ALVO`, o script falha fechado — não existe default.**

Quem decide o valor é o **gatilho do workflow**:

| Gatilho | `DIVAT_ALVO` | Porquê |
|---|---|---|
| `pull_request`, `push` | `teste` | é o requisito da #74: PR jamais toca produção, nem por acidente |
| `schedule` (cron), `workflow_dispatch` | `producao` | é o monitoramento; sem ele produção fica sem alarme |

**O que isso custa a este desenho:** a versão anterior anunciava que `check_deriva` e
`check_realtime` "não mudam uma linha". Deixa de ser verdade — os dois passam a resolver o alvo
pelo `ambiente.mjs` como os demais. É um arquivo a mais tocado em cada um, e a troca vale: fecha
a #74 e elimina a classe inteira de acidente em que editar o `app.js` redireciona um gate.

**O que isso NÃO faz:** não satisfaz a #74 ao pé da letra. A cláusula "os scripts devem falhar de
forma fechada se receberem o ref de produção" passa a valer **por gatilho**, não sempre — o cron
recebe produção de propósito. Essa reinterpretação precisa ser registrada como comentário na #74
antes de a mudança ser mergeada; se o dono discordar, a alternativa é gates test-only e produção
sem alarme de grants, e aí o `docs/seguranca.md` § 9.1 precisa parar de afirmar um controle que
não existe mais.

## 4. Onde cada gate fica depois

| Gate | Cadência | Alvo | Precisa de segredo? | Mudança |
|---|---|---|---|---|
| `check_grants` (digest) | **diária** (cron) | produção | **não** | digest + modo duplo (§ 5) + `ambiente.mjs` |
| `check_grants` (digest) | PR / push | teste | **não** | mesmo script, `DIVAT_ALVO=teste` |
| `check_deriva` | semanal (cron) + dispatch + PR / push | cron e dispatch: produção · PR/push: teste | não | só `ambiente.mjs` |
| `check_realtime` | **diária** (cron) + PR / push | cron: produção · PR: teste | não | só `ambiente.mjs` |
| `check_data_quality` | **diária** (cron) + PR / push | cron: produção · PR: teste | sim, no cron | portado para o auditor + `ambiente.mjs` |
| `check_phase3_audit` | semanal / dispatch | por argumento | sim | matriz completa, aceita 2 refs |

⚠️ **A cadência do `check_data_quality` não é "semanal, só no cron".** Ele mora no `db-checks.yml`,
cujo cron é **diário** e que também dispara em `pull_request` e em `push` na `main` pelo filtro de
`paths`. Uma versão anterior desta tabela dizia "semanal (cron) · produção", e foi essa premissa
falsa que gerou o defeito da Tarefa 9: um gate que também roda em PR **não** pode ter o ambiente do
auditor fixado em `producao`. Quem for mexer neste gate leia a cadência no workflow, não aqui.

O alarme que importa — o **diário de grants** — continua **sem credencial e sem prazo de
validade**, que era o ponto de partida deste desenho. Só o gate de qualidade herda o segredo, e só
no cron: em PR ele fala com teste, e sem a credencial de teste cai no fallback anônimo datado.

Comparado à versão anterior desta spec, `check_deriva` e `check_realtime` deixam de ser
"nenhuma mudança" e passam a tocar um arquivo cada — o preço de fechar a #74 (§ 3.3).

## 5. Modo duplo, com validade — o ponto mais perigoso

`check_grants.mjs` aponta para **produção** (deriva `SB_URL` do `app.js` por regex) e roda
diariamente. Ele entra na `main` dias antes de produção ter a função nova. Um gate que nasce
vermelho é um gate que se aprende a ignorar.

Comportamento exigido:

1. tenta `rpc/divat_security_digest`;
2. se a função não existe (`PGRST202` / 404) → usa `rpc/divat_security_shape`, o caminho atual, e
   **avisa** que está no fallback;
3. **qualquer outro erro aborta** — herda a doutrina que o rig já cobra: perder a visão do banco
   nunca vira "nenhum achado";
4. o fallback tem **data de expiração** em `scripts/prazos.json`. Passada a data, usá-lo é vermelho.

O item 4 existe porque caminho temporário sem prazo vira permanente por inércia.

## 6. Componente novo — `scripts/check_prazos.mjs`

Genérico e dirigido por dados. `scripts/prazos.json`:

```json
{ "id": "...", "descricao": "...", "vence_em": "AAAA-MM-DD",
  "aviso_dias": 30, "erro_dias": 7, "referencia": "docs/..." }
```

Roda diariamente no `db-checks.yml`. Acima de `aviso_dias`: silencioso. Abaixo: imprime o prazo.
Abaixo de `erro_dias`: **quebra o build**.

Entradas iniciais: credencial `divat_auditor_ci` (31/10/2026), fallback do `check_grants`, revisão
trimestral do `docs/seguranca.md`.

Fica **fora** do `tests/check.js` de propósito: o contrato dele é ser offline e determinístico, e
um gate que depende da data de hoje não é.

**Por que este componente pertence a esta spec:** ele protege exatamente a credencial que esta
mudança introduz no caminho semanal, e nasce do mesmo defeito que o resto — compromisso que vive
só em prosa.

## 7. Fiação do rig órfão

Dos três rigs offline, `ci.yml` roda `backup_rest.rig.mjs` e `restore_rest.rig.mjs`.
**`tests/check_grants.rig.mjs` não roda em workflow nenhum** — a bancada que prova que o gate
diário de segurança aperta só executa se alguém lembrar. Mesmo modo de falha do `check_realtime.mjs`
antes de entrar no `db-checks.yml`.

Correção: acrescentar `node tests/check_grants.rig.mjs` ao passo que já existe no `ci.yml` (ele já
exporta `NO_PROXY=127.0.0.1`, que o rig precisa) e renomear o passo para refletir os três.

## 8. Allowlist em duas faixas

A allowlist anônima vai de 2 para 5. Para isso não virar erosão silenciosa,
`scripts/check_migrations.mjs` passa a distinguir duas faixas com critérios de admissão diferentes:

| Faixa | Membros | Critério de admissão |
|---|---|---|
| **Produto** | `divat_busca_logradouro`, `divat_linhas_regiao` | chamada pelo portal em runtime; entrada é decisão de produto |
| **Diagnóstico** | `divat_api_shape`, `realtime_tables`, `divat_security_digest` | só catálogo, barata, e não revela além do que o repositório já publica |

O gate cobra a faixa, não só o nome: uma RPC de diagnóstico nova precisa satisfazer o critério
escrito, não apenas ser adicionada à lista.

## 9. Migração e sequenciamento

### 9.1 Regra de ouro

**Nunca editar migração já aplicada.** A `20260729034018` está aplicada no teste; não se toca.
Tudo entra numa **migração 2**, e produção aplica **1 e 2 na mesma janela**, para que os dois
ambientes tenham histórico idêntico e linear. O DDL redundante (mover para `audit`, depois trazer
duas de volta) é o preço da auditabilidade.

### 9.2 Migração 2 — `..._phase3_diagnosticos_anonimos.sql`

Mesmo molde da 1: pré-condições, DDL, asserções, auto-teste, tudo numa transação.

1. **`grant divat_audit_owner to postgres;` VEM PRIMEIRO, antes de qualquer pré-condição.** A
   migração 1 termina com `revoke divat_audit_owner, divat_auditor from postgres`, e as quatro
   funções de `audit` são **propriedade de `divat_audit_owner`**. Sem re-conceder, `alter function
   ... owner to` falha com permissão negada. Revoga de novo no fim.
   **A ordem não é estética (achado I1, § 15).** A migração 1 passa o dono do schema `audit` para
   `divat_audit_owner` e concede `USAGE` só a `divat_auditor`, então `postgres` **não tem USAGE em
   `audit`**. Um `to_regprocedure('audit.divat_api_shape()')` com nome qualificado por schema faz
   verificação de ACL e levanta `permission denied for schema audit` — ou seja, a pré-condição
   aborta a migração antes de o `grant` acontecer, com um erro que parece dizer que a pré-condição
   está errada. Alternativa aceitável, se preferir não mexer na ordem: trocar a pré-condição por
   consulta direta a `pg_proc`/`pg_namespace`, que não faz verificação de schema.
2. **Pré-condição:** `private` e `audit` existem, os dois papéis existem e as quatro diagnósticas
   estão todas em `audit` (isto é, a migração 1 rodou e nada a desfez). Aborta se não.
3. Traz `divat_api_shape` e `realtime_tables` de volta: `security invoker`, `owner to postgres`,
   `set schema public`, `grant execute to anon`.
4. Cria `public.divat_security_digest()` — `security invoker`, `revoke all from public`,
   `grant execute to anon`.
5. **Asserção final:** o conjunto de funções executáveis por `anon` em `public` é exatamente os 5
   nomes esperados. Mesma forma da asserção da migração 1, com a lista nova.
6. **Auto-teste, com guarda contra falha aberta (achado I3, § 15):**

   ```sql
   set local role anon;
   if current_user <> 'anon' then
     raise exception 'SET LOCAL ROLE nao pegou — rode a migracao dentro de BEGIN/COMMIT';
   end if;
   d := public.divat_security_digest();
   reset role;
   ```

   Sem a guarda, o auto-teste **falha aberto**: `SET LOCAL` fora de bloco de transação emite um
   `WARNING` e não faz nada, a asserção roda como `postgres` — que executa a função de qualquer
   forma, tenha `anon` o `EXECUTE` ou não — e passa tautologicamente. A única asserção cujo
   trabalho é provar que `anon` alcança o digest era a que degradava em silêncio.
7. Script de rollback próprio, no molde do `scripts/rollback_phase3_test.sql`.

### 9.3 Pré-requisito que quase passou batido

`check_data_quality.mjs` migra para a credencial. Se a credencial de **produção** não existir antes
da janela, ele fica cego no dia da aplicação. E `check_phase3_audit.mjs` hoje trava
`PROJECT_REF = 'gontnlfmothfglssbyyk'` e recusa qualquer outro ref, explicitamente inclusive
produção.

Portanto, ainda no PR de código: ele passa a aceitar **dois refs conhecidos**, escolhidos por
variável explícita, mantendo a recusa de qualquer ref desconhecido.

### 9.4 Ordem de execução

| # | O quê | Onde | Prova de que não quebrou |
|---|---|---|---|
| 1 | PR de código: migração 2 escrita (não aplicada), `check_grants` em modo duplo, `check_prazos` + `prazos.json`, allowlist em duas faixas, `check_phase3_audit` com dois refs, rig no `ci.yml`, casos novos no rig, docs | repo | **gates verdes contra produção não-migrada, pelo fallback** |
| 2 | Criar `divat_auditor_ci` em produção; gravar `SUPABASE_PROD_AUDIT_DATABASE_URL` | painéis | `phase3-security` por dispatch, verde |
| 3 | Aplicar migração 2 no teste | teste | dispatch verde; digest do teste conferido |
| 4 | **Janela única:** aplicar 1 **e** 2 em produção, em sequência | produção | nada roda entre as duas |
| 5 | Preencher o `digest` do baseline; rodar todos os gates | repo | `check_grants` no caminho digest; `check_deriva` e `check_realtime` **verdes sem terem mudado** |
| 6 | PR de limpeza: remover o fallback | repo | `prazos.json` cobra a data |

O passo 5 é o mais importante: **`check_deriva` e `check_realtime` passarem sem terem sido tocados
é a prova empírica** de que a repartição do § 2 estava certa. Se algum falhar ali, o desenho errou e
a janela reverte pelo rollback.

## 10. Verificação

Antes do merge do PR de código:

- `node tests/check.js`
- `node tests/check_grants.rig.mjs`
- `node scripts/check_migrations.mjs`
- dry-run transacional da migração 2 (`begin` … `rollback`), como a migração 1 recebeu
- `node scripts/check_views.mjs` — as 17 views não tocam nada disto; provar que continuam de pé é
  barato

Casos novos no rig, todos offline com o PostgREST stubado:

| Caso | Esperado |
|---|---|
| digest são | verde |
| `anon_escreve: true` | vermelho, **e `--atualizar-baseline` não silencia** |
| digest diferente, booleanos sãos | vermelho, mensagem de mudança estrutural |
| função ausente (404) | cai no fallback, verde, com aviso |
| fallback depois da data de expiração | vermelho |
| resposta sem campo | **aborta** (fail-closed), como os dois casos que já existem |

## 11. Fora de escopo

Esta mudança **não toca** `app.js`, `index.html`, `styles.css`, nenhuma view, nenhum loader,
nenhuma tabela de dado. Não altera policy nem grant de tabela. Não mexe nas duas RPCs de produto.

Os quatro achados levantados na análise de 04/08/2026 que **não** são a Fase 3 ficam fora e viram
issues, com o vocabulário de `docs/agents/triage-labels.md`:

1. **Guarda anti-drift confere trecho, não equivalência.** `tests/check.js` faz
   `if (js.includes(snippet))`. Demonstrado num clone descartável: mudar `fmtCode` de
   `s.length === 9` para `>= 9`, preservando o trecho vigiado `s.slice(3,6)`, mantém o gate
   **verde** com a cópia testando o comportamento antigo. Estado atual medido: 50 das 53
   declarações de topo dos dois harness batem verbatim (as 3 divergências são dublês intencionais).
2. **Placar dos testes é exibido, nunca cobrado.** O veredito é só `res.status === 0`. Se
   `pure.test.js` caísse de 213 asserções para 3, o gate seguiria verde. `environment.test.js` não
   emite placar (`placar ?`).
3. **Duas fontes de verdade do schema.** `docs/backup_schema.sql` e `supabase/migrations/`
   descrevem bancos diferentes e nada os compara. O baseline tem zero ocorrências de
   `schema private`, `schema audit`, `private.f_unaccent` e `divat_auditor`; as duas fontes
   contêm definições divergentes de `divat_busca_logradouro` (uma usa `public.f_unaccent`, a outra
   `private.f_unaccent`). Executar o runbook de DR reconstrói um banco pré-endurecimento, em
   silêncio.
4. **Vendor sem impressão digital.** `vendor/supabase-js-2.110.7.min.js` é injetado em runtime sem
   SHA-256 registrado nem gate que o confira.

Cosmético, sem urgência: `scripts/check_grants.mjs` usa dois bytes NUL literais como separador de
chave composta. É intencional e o Semgrep lê o arquivo normalmente (medido); só `grep` e `file` o
tratam como binário. Trocar por `'\\u0000'` resolve.

## 12. Riscos aceitos

**Superfície permanente.** Uma função anônima nova é permanente. Hoje é barata e só lê catálogo;
o critério do § 8 reduz, mas não elimina, o risco de alguém ampliá-la no futuro.

**Critério em vez de número.** "Exatamente 2" é inegociável; um critério se interpreta. A troca é
deliberada: compra um alarme diário sem credencial e sem prazo de validade.

**Janela com os gates cegos.** Entre a migração 1 e a 2 em produção, os quatro gates estão
quebrados por minutos. Mitigação: aplicar as duas na mesma janela e não rodar nada no intervalo.

## 13. Alternativa rejeitada

**Seguir o plano à risca** — mover os quatro diagnósticos para `audit` e portar os quatro gates
para a credencial. Rejeitada por três razões, nesta ordem de peso:

1. **Dá mais trabalho, não menos.** Exige portar a lógica de comparação dos quatro gates para SQL
   do auditor (§ 1.2). O desenho escolhido porta um.
2. **Põe o alarme diário atrás de uma credencial com prazo** (§ 1.3).
3. **Depende de ação humana recorrente.** Fato medido sobre este projeto: o que cabe num
   `git push` acontece; o que exige painel ou credencial fora do CI estagna — restore/RTO-RPO
   aberto desde 16/07 e reapontado em 27/07, 30/07 e 31/07;
   `SUPABASE_TEST_AUDIT_DATABASE_URL` ainda não configurado; Leaked Password Protection aberto
   desde 23/07. Não é crítica ao mantenedor: é topologia do sistema, e o desenho deve respeitá-la.

A alternativa continua defensável se a prioridade for **regra rígida acima de operacionalidade** —
"2 RPCs anônimas, sem exceção" tem valor por ser inegociável. Nesse caso o conserto do § 1.3 é
outro: um gate que falha quando a credencial está a menos de 30 dias do vencimento — ou seja, o
`check_prazos.mjs` do § 6, que vale nos dois caminhos.

## 14. Auditoria das issues abertas (feita em 04/08, tarde demais)

A primeira versão desta spec foi escrita sem ler as issues abertas do repositório. Foi erro de
método: explorei código, docs, workflows e banco, e não o rastreador. A auditoria posterior achou
uma colisão real e uma branda.

| Issue | Estado | Relação |
|---|---|---|
| **#74** — gates de banco test-only | aberta | **colisão real.** Resolvida pelo § 3.3 (alvo por gatilho). Precisa de comentário na issue registrando a reinterpretação. |
| **#63** — checagem semanal de qualidade | aberta, já implementada | **colisão branda.** Os critérios de aceite dela especificam `divat_data_quality()` como `SECURITY INVOKER` com `EXECUTE` para `anon` — exatamente o que § 2 remove. Foi esse desenho que criou a alavanca de indisponibilidade medida em § 1.1. A issue é que precisa ser atualizada, não este desenho. |
| **#75** — payload alto entre municípios | aberta | **sem colisão.** As restrições dela ("não criar nova RPC anônima", "não alterar RLS/grants/schemas") são escopo daquela investigação de desempenho, não política global. Levantei isso como possível conflito e estava errado. |
| **#65** — 6 codlinhas órfãs | aberta | sem relação (dado, não estrutura) |
| **#50** — abas no modal | implementada | sem relação |

**Regra que fica:** desenho novo neste repositório lê as issues abertas antes de começar, não
depois. Está registrada aqui porque `docs/agents/issue-tracker.md` descreve *como* usar o
rastreador, e não *quando* consultá-lo.

*(À parte, achado da mesma auditoria: a label `ready-for-agent` do `docs/agents/triage-labels.md`
não existe no rastreador — só `ready-for-human`. O doc descreve um vocabulário que o repo não tem
inteiro.)*

## 15. Defeitos achados na revisão da migração

A T3 foi implementada, commitada e **reprovada** em revisão. A transcrição estava fiel linha a
linha; os três defeitos eram do desenho, não da execução.

**I1 — a migração abortava na própria pré-condição.** Corrigido em § 9.2 item 1.

**I2 — o digest era cego para quatro checagens do gate diário.** `MAINTAIN`, `search_path` fixo,
`default_privileges` e os schemas `audit`/`private`. Como `default_privileges` é a razão de a
cadência ser diária, a versão de seis campos teria entregue um alarme diário sem o motivo de ser
diário — e um `MAINTAIN` reconcedido a `anon` deixaria o digest byte-idêntico. Corrigido em § 3
(dez campos) e § 3.1.

**I3 — o auto-teste falhava aberto.** Corrigido em § 9.2 item 6.

Minors registrados e ainda abertos, para a revisão final triar: `bool_and`/`bool_or` sobre conjunto
vazio devolvem `NULL` (o consumidor precisa recusar não-booleano, não testar veracidade);
`divat_auditor` mantém `EXECUTE` nas duas funções que voltam para `public`; nada emite
`notify pgrst, 'reload schema'` depois do DDL; o `create or replace` da função nova é
desnecessário dado que a pré-condição já prova que ela não existe; o rollback não tem pré-condição
própria nem abre transação.

**O que a revisão da T3 provou sobre o método:** dois dos três defeitos (I1 e I3) são invisíveis
para qualquer verificação offline — só apareceriam ao aplicar o SQL, um deles em silêncio. Foram
achados por leitura estática cuidadosa contra a migração 1. Vale como precedente: SQL destinado a
produção merece revisor em modelo mais capaz e riscos nomeados um a um, não revisão genérica.

**I4 — o digest era cego para views e para privilégio de coluna.** Achado na revisão da T4
reescrita, mesma classe do I2: cobertura que faltava no objeto cuja razão de existir é cobrir.
Corrigido em § 3 (11 campos). A asserção da migração também passou a conferir
`authenticated_tem_privilegio`, que ela calculava e não checava.

Ainda abertos, rebaixados a Menor e registrados para a revisão final: `prokind = 'f'` deixa
procedures fora do digest e de `anon_rpcs` (divergência de escopo entre a asserção de uma vez e a
verificação contínua); `pols` não hasheia `polqual`, então reescrever a expressão de uma policy não
muda o digest (risco residual baixo — sem GRANT de escrita, policy sozinha não abre escrita).
