# Rascunho do comentário para a issue #74 — NÃO POSTADO

> Texto pronto e revisado, versionado aqui para sobreviver ao fim da sessão.
> **Não foi postado**: publicar é ação para fora e depende do dono.
> **Não fechar a issue** — o desenho não cumpre duas cláusulas dela (ver abaixo), e quem
> aceita ou recusa essa troca é quem a escreveu.

---

**Implementado (branch `claude/divat-fase3-diagnosticos-y7ry57`, Fase 3 — diagnósticos anônimos).**

**O que passou a valer.** Os quatro gates de banco (`check_grants`, `check_deriva`,
`check_realtime`, `check_data_quality`) **não derivam mais `SB_URL`/`SB_KEY` dos literais do
`app.js`**. O alvo é configuração explícita: `DIVAT_ALVO` (`teste` | `producao`), resolvido por
`scripts/lib/ambiente.mjs` contra `scripts/ambientes.json`. Não há default — ausência da variável
é erro no topo do script, antes de tocar rede. Cada gate imprime `· Alvo: <alvo>` como evidência.

Quem decide `DIVAT_ALVO` é o **gatilho do workflow**, num `env:` por passo (`db-checks.yml`,
`deriva.yml`):

```yaml
env:
  DIVAT_ALVO: ${{ (github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && 'producao' || 'teste' }}
```

Ou seja: **`pull_request` e `push` falam com teste; o cron e o dispatch falam com produção.** O
dispatch entra junto porque é o único caminho de conferir produção sob demanda — alimentar o banco
pelo painel do Supabase não gera push nenhum.

## O que esta implementação NÃO cumpre da #74

Duas coisas, ditas sem rodeio para não virarem descoberta de auditoria depois:

**1. "Os scripts devem falhar de forma fechada se receberem o project ref/URL de produção."** Não
cumprido como está escrito. Os scripts aceitam o ref de produção quando `DIVAT_ALVO=producao`, o
que acontece no cron e no dispatch. A metade seguinte da cláusula — falhar fechado se a
configuração estiver **ausente** — essa sim está cumprida, e é o comportamento padrão: sem
`DIVAT_ALVO` o script morre no topo, antes de qualquer rede.

**2. "Evidência no log ... de rejeição explícita do ref de produção."** Não existe esse artefato.
No desenho atual produção não é *rejeitada*, é *não escolhida* pelo gatilho. O log mostra
`· Alvo: teste`; não há linha mostrando produção sendo recusada, porque não há recusa a mostrar.

**Por que assim.** A leitura literal — recusar produção em qualquer circunstância — apagaria o
alarme diário de grants, que é o controle que `docs/seguranca.md` § 9.1 nomeia como compensação do
default não-fechável do `supabase_admin` (aquele que concede escrita a `anon` e que o `postgres`
não consegue fechar por não ser superusuário). Seria trocar um risco — gate de PR falando com
produção — por outro: produção sem alarme de grants. O segundo é o pior dos dois, e o primeiro é o
que a #74 realmente quer barrar.

Se essa troca não for aceitável, o caminho alternativo existe e é conhecido: separar o
monitoramento de produção num workflow próprio, com credencial própria, e aí sim fazer os gates de
PR recusarem o ref de produção incondicionalmente. É mais superfície e mais uma credencial para
rotacionar — foi por isso que não foi o escolhido, não por ser inviável.

## O que está medido, não afirmado

Nenhum caminho de **PR** alcança produção, nem por herança de credencial. Provado em
`tests/check_data_quality.test.js`: com `DIVAT_ALVO=teste` e a credencial de **produção** presente
no ambiente (a armadilha), o `psql` não é chamado e o gate cai no fallback anônimo contra teste. E
`tests/check_grants.rig.mjs` prova que, sem `DIVAT_ALVO`, o gate sai 1 **sem emitir requisição
nenhuma**.

O escopo dessa garantia: ela cobre o comportamento dos scripts e a fiação atual dos dois workflows
(`db-checks.yml`, `deriva.yml`). Não há guarda automatizada impedindo que um workflow **futuro**
declare `DIVAT_ALVO: producao` num passo de `pull_request` — isso hoje depende de revisão humana.

**Ponteiro:** `docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md` § 3.3
(regra do alvo) e § 4 (onde cada gate fica, com a cadência real de cada um). O código está no
PR #98.

**Os demais itens da #74**, para o registro: config explícita de teste nos gates de PR ✅; nenhum
gate de PR derivando do `app.js` ✅; verificações de Deriva/Realtime/qualidade/grants preservadas
✅; nada de segredo commitado ✅ — o `scripts/ambientes.json` versiona só as duas anon keys, que
já eram públicas e já estavam no `app.js`; fluxo demonstrado em PR separada ✅ (#98).

**Pendência conhecida, não é bug:** só existe hoje o secret `SUPABASE_PROD_AUDIT_DATABASE_URL`.
Em PR, com `DIVAT_ALVO=teste`, o `check_data_quality` procura `SUPABASE_TEST_AUDIT_DATABASE_URL`,
não acha, e cai no fallback anônimo datado — imprimindo `⚠ Auditor indisponível (…)`. É o
comportamento correto: a credencial de produção não pode virar atalho para um gate de PR falar com
produção. A explicação está no comentário do passo, no próprio `db-checks.yml`.

**Não fechei a issue** — quem fecha é o dono.
