# Handoff — Fase 3, diagnósticos anônimos (04/08/2026)

> **Snapshot de 04/08/2026 — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`;
> a cronologia, no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma sessão e envelhece
> de propósito.

> **Para quem retoma numa sessão nova.** Leia este arquivo e depois a spec. O ledger de execução
> vivia em `.superpowers/sdd/…`, que é **git-ignored** e morre com o container — por isso tudo que
> importa está aqui.

## Onde parou

Branch **`claude/chame-brainstorming-1ry9a7`**, HEAD **`9e6f43a`**, árvore limpa, `node tests/check.js`
verde. Nenhum DDL foi aplicado em banco nenhum.

| # | Tarefa | Estado | Commits |
|---|---|---|---|
| T1 | Gate de prazo (`lib/prazos.mjs`, `prazos.json`, `check_prazos.mjs`) | ✅ construída e revisada | `c6a4c68..56432c6` |
| T2 | `check_grants.rig.mjs` ligado no `ci.yml` | ✅ construída e revisada | `aa6e246` |
| T3 | `lib/ambiente.mjs` — alvo por gatilho (issue #74) | ✅ construída e revisada | `f6c950d` |
| T4 | Migração 2 + `divat_security_digest()` | ⚠️ construída, **falta re-revisão** | `0574df4`, `9e6f43a` |
| T5–T10 | allowlist, `check_grants`, auditor, `check_data_quality`, deriva/realtime, docs | ⬜ planejadas | — |

**Documentos que mandam:**
- Desenho: `docs/planos/2026-08-04-fase3-diagnosticos-anonimos-design.md`
- Plano executável, 10 tarefas: `docs/planos/2026-08-04-fase3-diagnosticos-anonimos.md`

## O próximo passo, exatamente

**Re-revisar a T4** sobre o diff `0574df4..9e6f43a`, antes de qualquer outra coisa. A T4 já teve
uma versão reprovada e uma rodada de correção; a correção foi verificada **mecanicamente** (forma),
não semanticamente (SQL). Os defeitos anteriores dessa migração eram todos semânticos, e dois deles
só apareceriam ao aplicar — um em silêncio.

O que a re-revisão precisa verdictar:

1. A CTE `vis` é referenciada nos dois lugares (material hasheado e campo `anon_le_view`)?
2. O `coalesce` de `anon_le_view` escolheu o default certo? (Argumento usado: aqui conjunto vazio
   significa "não existe view", estado normal deste banco, e não "perdi a visão" — diferente dos
   outros booleanos. **Vale contestar.**)
3. A ordenação continua total depois do `collate "C"` (5 ordenações)?
4. O SQL é válido? Determinismo do digest? Fail-closed na direção certa?

Verificado por mim, mecanicamente, e todo positivo: `vis` definida 1× e referenciada 2×;
`has_any_column_privilege` presente; asserção citando `anon_le_view` e
`authenticated_tem_privilegio`; 5 `collate "C"`; 11 chaves no contrato; rollback com 0 linhas de
diff; migração 1 e `check_migrations.mjs` intocados; gate com **exatamente** os 3 erros de allowlist
esperados; `check.js` verde.

Depois: T5, T6, T7, T8, T9, T10, na ordem do plano.

## Decisões já tomadas — não reabrir

1. **Superfície anônima é definida por CRITÉRIO, não por número.** Duas faixas: *produto*
   (`divat_busca_logradouro`, `divat_linhas_regiao`) e *diagnóstico* (`divat_api_shape`,
   `realtime_tables`, `divat_security_digest`). Diagnóstico novo só entra se ler apenas catálogo,
   for `SECURITY INVOKER` e não revelar além do que o repo já publica (ADR-0003). Isso **substitui**
   a decisão anterior de "somente 2 RPCs anônimas". Spec § 2 e § 8.
2. **O alvo de todo gate de banco vem de `DIVAT_ALVO`, decidido pelo gatilho** — `teste` em
   PR/push, `producao` no cron — resolvido por `scripts/lib/ambiente.mjs`. Nenhum gate deriva alvo
   do `app.js`. Spec § 3.3. É reinterpretação da issue **#74**, que precisa de comentário na issue
   (passo 0b da T10) e **não** deve ser fechada por um agente.
3. **O digest tem 11 campos**, não 6 nem 10. Os campos extras existem porque o gate diário confere
   `MAINTAIN`, `search_path`, `default_privileges`, schemas `audit`/`private`, views e privilégio de
   coluna — e `default_privileges` é *a razão* de a cadência ser diária. Spec § 3.
4. **O baseline nunca silencia os indicadores graves.** `--atualizar-baseline` mexe só no digest e
   nas três contagens; os cinco booleanos graves são expectativa fixa no código. Spec § 3.2.
5. **A migração 1 (`20260729034018`) está aplicada no teste e não se toca.** Migração nova para
   qualquer coisa.

## Armadilhas que já morderam aqui

- **`check_migrations.mjs:53` exige literalmente `revoke execute on function … from public`.**
  `revoke all` não casa com o regex e produz vermelho por motivo errado.
- **A T4 deixa `check_migrations.mjs` VERMELHO de propósito** até a T5 abrir a allowlist. São
  exatamente 3 erros. Um quarto erro = defeito de transcrição. **Não conserte editando a allowlist
  na T4.**
- **`grant divat_audit_owner to postgres` é a primeira instrução da migração 2, antes da
  pré-condição.** `postgres` não tem USAGE em `audit`, e `to_regprocedure('audit.…')` faz aclcheck.
  Mover para baixo faz a migração abortar na própria pré-condição.
- **`set local role anon` fora de `BEGIN/COMMIT` só emite WARNING.** Por isso o auto-teste tem
  guarda de `current_user`. Rodar sem transação deixa a migração meio aplicada.
- **Escrever `\u0000` num arquivo tende a virar byte NUL cru.** Aconteceu duas vezes (spec e plano).
  Confira com `python3 -c "print(open(F,'rb').read().count(b'\x00'))"` antes de commitar.
- **O clone local retrocedeu sozinho uma vez** (de `9e6f43a` para `0574df4`, árvore limpa). O
  remoto estava certo. Ao retomar: `git fetch` e confira `git log --oneline -1` contra este
  documento antes de confiar no que está em disco.

## Erros de método registrados

1. **A spec foi desenhada sem ler as issues abertas.** Custou o replanejamento de três tarefas,
   porque a **#74** contradizia o desenho. Regra que fica: desenho novo lê o rastreador antes de
   começar, não depois. Spec § 14.
2. A label `ready-for-agent` do `docs/agents/triage-labels.md` **não existe** no rastreador — só
   `ready-for-human`. O doc descreve vocabulário que o repo não tem inteiro.

## Resíduo que ainda não virou issue

O dono autorizou abrir issues para estes, e elas **não foram criadas** (limite de sessão). Cada um
tem evidência medida na conversa de 04/08:

1. **Guarda anti-drift confere trecho, não equivalência.** `tests/check.js` faz
   `if (js.includes(snippet))`. Demonstrado: mudar `fmtCode` de `s.length === 9` para `>= 9`,
   preservando o trecho vigiado, mantém o gate **verde** com a cópia testando o comportamento
   antigo. Estado medido: 50 das 53 declarações dos harness batem verbatim.
2. **Placar dos testes é exibido, nunca cobrado.** Se `pure.test.js` caísse de 213 asserções para
   3, o gate seguiria verde. `environment.test.js` não emite placar.
3. **Duas fontes de verdade do schema.** `docs/backup_schema.sql` e `supabase/migrations/`
   descrevem bancos diferentes e nada os compara; contêm definições divergentes de
   `divat_busca_logradouro` (`public.f_unaccent` × `private.f_unaccent`). O runbook de DR
   reconstrói um banco pré-endurecimento, em silêncio.
4. **Vendor sem impressão digital.** `vendor/supabase-js-2.110.7.min.js` é injetado em runtime sem
   SHA-256 registrado nem gate que o confira.

Menores adiados, para a revisão final triar: mensagem de erro do `ambiente.mjs` trata
`DIVAT_ALVO=''` como "não definido"; helper `lanca` dos testes não confere que o lançado é `Error`;
`prokind = 'f'` deixa procedures fora do digest; `pols` não hasheia `polqual`; `check_grants.mjs`
usa dois bytes NUL literais como separador (o irmão `check_data_quality.mjs:76` já usa `'\u0000'`
escapado, com a justificativa escrita).

## O que só o dono faz, depois que o código estiver pronto

Ordem obrigatória, spec § 9.4. Nenhum agente fecha estes.

1. Criar `divat_auditor_ci` em produção e gravar `SUPABASE_PROD_AUDIT_DATABASE_URL` nos secrets.
   **Ao definir o novo `VALID UNTIL`, atualize `vence_em` em `scripts/prazos.json`** — senão o gate
   de prazo cobra uma data que não existe mais.
2. Aplicar a migração 2 no teste e rodar `phase3-security` por dispatch.
3. **Janela única em produção:** aplicar `20260729034018` e `20260805000000` em sequência, dentro de
   `BEGIN/COMMIT`, sem rodar nada entre as duas.
4. `node scripts/check_grants.mjs --atualizar-baseline`, conferindo que só `digest`, as contagens e
   `gerado_em` mudaram — `achados` fica intacto.
5. **A prova do desenho:** `check_deriva.mjs` e `check_realtime.mjs` verdes **sem terem sido
   modificados por causa da repartição**. Se falharem ali, a spec § 2 errou e a janela reverte pelo
   `scripts/rollback_phase3_diagnosticos.sql`.
6. Remover os fallbacks antes de 30/11/2026 e apagar as entradas correspondentes do `prazos.json`.
