# Contexto para a próxima sessão — 06/08/2026

Handoff da sessão que implementou as tarefas 4–10 da **Fase 3 — diagnósticos anônimos**.
Não é doc vivo (fica fora do `DOCS_VIVOS` do `tests/check.js`): é um instantâneo datado.

---

## Onde as coisas estão

- **Branch:** `claude/divat-fase3-diagnosticos-y7ry57`, empurrada. HEAD em `157f9f8`.
- **PR:** [#98](https://github.com/LucasMolinari9/LucasCTEC/pull/98), **aberto**, não mergeado.
- **Issue #74:** **aberta**, **não comentada**. Rascunho pronto e revisado, **versionado** em
  [`docs/issue-74-comentario-rascunho.md`](issue-74-comentario-rascunho.md).
- **Plano:** `docs/superpowers/plans/2026-08-04-fase3-diagnosticos-anonimos.md`
- **Spec:** `docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md`

## Estado do CI no PR #98

Offline verde: `check`, `views`, `semgrep`, `migration-contract`, `prazos`, `smoke`.

**Quatro gates de banco vermelhos** — `seguranca`, `realtime`, `qualidade`, `deriva` — todos com
404 nas RPCs. **Não é defeito do código.** É consequência correta da issue #74: os gates deixaram
de ler o alvo do `app.js` (que apontava para produção) e passaram a conferir **teste**, onde a
migração 2 ainda não foi aplicada.

## O que foi medido no banco de TESTE (`gontnlfmothfglssbyyk`), em 06/08

Contra o banco vivo, pelo SQL Editor:

| Item | Estado |
|---|---|
| 18 tabelas esperadas | todas presentes, nenhuma sobrando |
| RLS | ligado em todas |
| publicação `supabase_realtime` | 14 tabelas |
| `tabela_vista_teste` | **1869 linhas** — tem dados, não é casco vazio |
| schemas `private` / `audit` | **existem** |
| roles `divat_audit_owner` / `divat_auditor` | **existem** |
| `divat_api_shape`, `realtime_tables`, `divat_security_shape`, `divat_data_quality` | em **`audit`**, sem execute para `anon` |
| `divat_busca_logradouro`, `divat_linhas_regiao` | em `public`, anônimas |
| `f_unaccent` | em `private` |
| `public.divat_security_digest()` | **não existe** |

**Conclusão: o teste já tem a migração 1 (`20260729034018`) aplicada. Falta a migração 2
(`20260805000000`).** As quatro pré-condições da migração 2 foram conferidas uma a uma contra
esse estado — **todas passam**.

### Ensaio já feito

A migração 2 foi rodada com `begin; … rollback;` no SQL Editor: **executou até o fim sem erro**,
incluindo o auto-teste interno que assume o papel `anon`. Verificação posterior confirmou
`aplicada = false` — o rollback funcionou, não há meia-aplicação.

### Uma ponta solta, conhecida e inofensiva

`postgres` está como membro do papel `divat_audit_owner` (`postgres_no_papel = 1`). Origem não
determinada — **não inventar explicação**. Não bloqueia nada: a primeira instrução da migração 2 é
`grant divat_audit_owner to postgres;` (conceder de novo não dá erro) e a última é
`revoke divat_audit_owner from postgres;`, que limpa a ponta ao commitar.

---

## O que fazer amanhã, na ordem

### 1. Aplicar a migração 2 no teste

No SQL Editor do projeto **divat - TESTE**, com o conteúdo de
`supabase/migrations/20260805000000_phase3_diagnosticos_anonimos.sql`:

```
begin;
<as 269 linhas do arquivo>
commit;
```

O `begin;`/`commit;` **não é preferência**: o auto-teste usa `set local role anon`, que fora de
bloco de transação só emite aviso; e sem transação o `revoke` final não roda, deixando a migração
pela metade. O arquivo não traz `begin`/`commit` dentro dele.

Se o Chrome oferecer traduzir a página, **recuse** — ele reescreve nomes de função na tela
(`realtime_tables` virou "tabelas_em_tempo_real" no painel).

### 2. Conferir que aplicou

```sql
select to_regprocedure('public.divat_security_digest()') is not null as aplicada,
       (select count(*) from pg_auth_members m
        join pg_roles r on r.oid=m.roleid
        join pg_roles g on g.oid=m.member
        where r.rolname='divat_audit_owner' and g.rolname='postgres') as postgres_no_papel;
```

Esperado: `aplicada = true`, `postgres_no_papel = 0`.

### 3. Rodar os gates contra teste

Actions → **DB checks** → Run workflow, e **Deriva** → Run workflow.

⚠️ **Atenção — mudança de 06/08:** `workflow_dispatch` agora resolve `DIVAT_ALVO=producao`, igual
ao cron. Para exercitar **teste**, o caminho é o próprio PR #98 (push/PR resolvem `teste`), não o
dispatch. Basta um push qualquer na branch, ou re-executar os jobs do PR pela aba Actions.

Esperado depois da migração 2: `realtime`, `deriva` e `seguranca` verdes. O `qualidade` deve ficar
**verde com um `⚠`** — ver item 4.

### 4. O `⚠` esperado no job `qualidade` (não é bug)

Só existe o secret `SUPABASE_PROD_AUDIT_DATABASE_URL`. Em PR (`DIVAT_ALVO=teste`) o auditor
procura `SUPABASE_TEST_AUDIT_DATABASE_URL`, não acha, e cai no fallback anônimo contra teste,
imprimindo `⚠ Auditor indisponível (…)`. **É o comportamento correto** — a credencial de produção
não pode virar atalho para um gate de PR falar com produção. Explicado em comentário no próprio
`db-checks.yml`.

**Ponto de atenção real:** o `data_quality_baseline.json` registra dívida medida em **produção**
(4 achados, 17 codlinhas órfãs). O teste tem 1869 linhas, mas não se sabe se é cópia fiel. Se os
números não baterem, **isso não é defeito do gate** — é o baseline falando de outro banco. Decidir
então: cópia dos dados de produção para teste, ou baseline próprio por ambiente. **Essa decisão é
do dono.**

### 5. Merge do PR #98

Só depois dos gates verdes.

### 6. Comentar na issue #74 (decisão do dono)

O rascunho está pronto e diz, sem suavizar, o que **não** foi cumprido:
- *"os scripts devem falhar de forma fechada se receberem o ref de produção"* — não cumprido: eles
  aceitam produção quando `DIVAT_ALVO=producao` (cron e dispatch);
- *"evidência no log de rejeição explícita do ref de produção"* — não existe esse artefato, porque
  produção não é rejeitada, é não-escolhida pelo gatilho.

**Não fechar a issue** — quem aceita ou recusa essa troca é quem a escreveu.

### 7. Só depois de tudo isso: produção

Ordem obrigatória em `docs/planos/fase-3-hardening-moderado.md`: criar `divat_auditor_ci` em
produção e gravar o secret (atualizando `vence_em` em `scripts/prazos.json`); janela única
aplicando `20260729034018` **e** `20260805000000` em sequência, nada entre as duas, com dry-run
transacional antes de cada; preencher o baseline com `--atualizar-baseline`; confirmar
`check_deriva` e `check_realtime` verdes.

---

## Decisões tomadas nesta sessão que a próxima deve conhecer

1. **`workflow_dispatch` → produção.** A expressão dizia `teste` enquanto a prosa, o
   `scripts/lib/ambiente.mjs` e a spec §3.3 diziam `produção`. Alinhado ao desenho (commit
   `157f9f8`), a pedido do dono. Consequência no item 3 acima.
2. **Escopo da Tarefa 9 estendido** ao `check_data_quality.mjs`, que o plano não listava. Motivo: o
   script ainda derivava `SB_URL`/`SB_KEY` do `app.js`, o gate roda em `pull_request` (medido em
   `db-checks.yml:58-70`), e o Step 0 da Tarefa 10 já o nomeava. Reversível.
3. **Guarda nova no `[2b]`** para a contagem de indicadores graves — são **seis**, e o plano mandava
   escrever "três". Provada por mutação.

## Dívida registrada (candidatos a issue, com file:line no relatório da T10)

- **Cegueira silenciosa** — fonte devolvendo `[]` com o banco sujo faz o `check_data_quality`
  imprimir "✓ Resolvido desde o baseline" e sair **0**. Pré-existente; o `Array.isArray` não cobre.
  **É o mais urgente dos seis.**
- `apt-get install postgresql-client` provavelmente redundante no `ubuntu-latest`.
- O `psql` falso da bancada não confere que o SQL usa `audit.divat_data_quality()`.
- Falta caso de teste para `!Array.isArray` pelo caminho do auditor.
- `startsWith` no login do auditor aceita `divat_auditor_civil`; `sslmode` vem da URL sem piso.
- `tests/README.md` tem cabeçalho mais estreito que o conteúdo (fala só de lógica pura do `app.js`).
