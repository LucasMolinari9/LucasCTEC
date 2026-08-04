# Fase 3 — diagnósticos anônimos e a transição dos gates vivos

> **Estado:** desenho aprovado, aguardando plano de implementação.
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
  "authenticated_tem_privilegio": false,
  "anon_rpcs": 5 }
```

Os campos, sem ambiguidade: `tabelas_publicas` conta **todas** as tabelas de `public` (18 —
inclui as 4 de staging), não as 14 legíveis por `anon`; `anon_rpcs` conta as funções de `public`
executáveis por `anon` (5 depois desta mudança); `anon_escreve` é verdadeiro se **qualquer** tabela
de `public` conceder `INSERT`, `UPDATE`, `DELETE` ou `TRUNCATE` a `anon`.

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
| Booleano vermelho (`anon_escreve`, `!todas_com_rls`, `authenticated_tem_privilegio`) | emergência, classe conhecida na hora | revogar; **nunca** baselinar |
| Só o digest mudou, booleanos sãos | mudança estrutural benigna (tabela nova, policy renomeada) | investigar com a credencial ou pelo painel; re-baselinar |

**Detecção fica no canal barato e perene; diagnóstico fica no canal caro.**

### 3.2 O baseline não pode silenciar a classe perigosa

`--atualizar-baseline` atualiza **o digest, e só o digest**. Os três booleanos são expectativas
**fixas no código do `check_grants.mjs`**, não dado de `security_baseline.json`. Não existe caminho
para baselinar `anon_escreve: true`.

Razão: um gate cujo conserto habitual é rodar `--atualizar-baseline` ensina o reflexo de apagar o
alarme. O reflexo continua possível para mudança benigna e **nunca** alcança a classe perigosa.

## 4. Onde cada gate fica depois

| Gate | Cadência | Precisa de segredo? | Mudança |
|---|---|---|---|
| `check_grants` (digest) | **diária** | **não** | adaptado ao digest, modo duplo (§ 5) |
| `check_deriva` | semanal + PR | não | **nenhuma** |
| `check_realtime` | semanal | não | **nenhuma** |
| `check_data_quality` | semanal | sim | portado para o auditor |
| `check_phase3_audit` | semanal / dispatch | sim | ganha a matriz completa e aceita 2 refs |

Dos quatro gates que o plano dava como perdidos, **dois não mudam uma linha e um continua diário
sem credencial**. Só o semanal de qualidade herda o segredo — e para ele isso é aceitável: se
atrasar um ciclo, não há alarme apagado, há relatório adiado.

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

1. **Pré-condição:** `private` e `audit` existem e os dois papéis existem (isto é, a migração 1
   rodou). Aborta se não.
2. **`grant divat_audit_owner to postgres;`** — a migração 1 termina com
   `revoke divat_audit_owner, divat_auditor from postgres`, e as quatro funções de `audit` são
   **propriedade de `divat_audit_owner`**. Sem re-conceder, `alter function ... owner to` falha com
   permissão negada. Revoga de novo no fim.
3. Traz `divat_api_shape` e `realtime_tables` de volta: `security invoker`, `owner to postgres`,
   `set schema public`, `grant execute to anon`.
4. Cria `public.divat_security_digest()` — `security invoker`, `revoke all from public`,
   `grant execute to anon`.
5. **Asserção final:** o conjunto de funções executáveis por `anon` em `public` é exatamente os 5
   nomes esperados. Mesma forma da asserção da migração 1, com a lista nova.
6. **Auto-teste:** `set local role anon; perform public.divat_security_digest(); reset role;` —
   prova que `anon` alcança, dentro da transação, antes do commit.
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
