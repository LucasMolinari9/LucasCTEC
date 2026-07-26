# Handoff — Fatia 2: pôr o `check_views.mjs` no CI

> **Tipo:** handoff entre sessões. Documento **transitório** — quando a fatia 2 estiver
> mergeada na `main`, apague este arquivo; a memória permanente do que foi feito vive no
> `docs/CHANGELOG.md` e as regras no `CLAUDE.md`.
>
> **Como usar:** abra uma sessão nova no repo e diga *"leia `docs/handoff-fatia2-ci.md` e
> execute a fatia 2"*.

## Contexto: de onde isso vem

O dono levantou um medo — *"tenho medo do meu projeto estar todo bonito por fora e podre por
dentro, e eu não sei como resolver"*. A conversa concluiu que o medo era **epistêmico** (falta
de visibilidade), não estrutural, e que laudo não resolve pergunta contínua: **só instrumento
resolve**. O plano foi partido em três fatias:

| Fatia | O que | Estado |
|---|---|---|
| **0** | Laço de fumaça sobre as 23 views | ✅ **feito** — commit `73f0d37`, branch `claude/ask-matt-toyp43` |
| **2** | Pôr esse laço no CI, rodando sozinho a cada push | ⬅️ **esta sessão** |
| 1 | Asserções de conteúdo por view ("está certo?", não só "está de pé?") | adiado por decisão do dono — só se algum dia pegar erro de conteúdo na mão |

## O que a fatia 0 deixou pronto

- **`scripts/lib/rig.mjs`** — bancada compartilhada: servidor estático, Chromium headless via
  Playwright, placar, e as fixtures do PostgREST em **definição única** (uma linha plausível por
  tabela das 14 lidas pelo portal + `serveRpc` com as 2 RPCs: `divat_busca_logradouro` e
  `divat_linhas_regiao`).
- **`scripts/check_views.mjs`** — abre as 23 views por deep link
  (`#/linha/549000001/consulta/<key>`), digita um termo que casa as fixtures quando há painel de
  busca, e falha se a view lançar erro (`errorBox` = `.m-loading.err`), ficar presa no spinner,
  pintar **só a moldura** ou não achar nada. Fecha com anti-drift contra os `data-view` do
  seletor. Aceita filtro: `node scripts/check_views.mjs frota`. Sai 0 = verde.
- **`scripts/check_abas.mjs`** — migrado para o rig, asserções inalteradas, verde.
- Documentação: `CLAUDE.md` passo **2a**; `docs/CHANGELOG.md` entrada de 26/07/2026.

Estado ao fim da fatia 0: **23/23 verdes, nenhum defeito no `app.js`** (os 4 vermelhos da
primeira execução eram defeito do teste). Validado por mutação — ver o CHANGELOG.

## A tarefa desta sessão

Fazer o `check_views.mjs` rodar **sozinho a cada push**, para não depender de alguém lembrar de
rodá-lo. Hoje ele é manual, igual `check_abas.mjs` e `check_realtime.mjs`.

### Decisão de projeto já tomada (não relitigar)

`ci.yml` roda `node tests/check.js` — **Node puro, sem dependências, segundos**. Essa leveza é
uma propriedade que o repo valoriza (está escrita no cabeçalho do próprio `ci.yml`). O
`check_views.mjs` exige **Playwright + Chromium**, que é pesado.

→ **Portanto: job SEPARADO**, não um passo dentro do `check`. O gate leve continua leve e
continua sendo o que dá o veredito rápido; o job de navegador roda ao lado. Se preferir arquivo
próprio (`.github/workflows/views.yml`) em vez de um segundo job no `ci.yml`, tudo bem — o que
**não** pode é pendurar Playwright no job `check`.

### Pontos de atenção

1. **`uses:` presos ao SHA de 40 caracteres**, com a tag como legenda ao lado (`# v4`). É regra
   do repo, achada pelo próprio Semgrep — ver `docs/semgrep.md` § "Actions presas ao SHA".
   Copie os SHAs que já estão no `ci.yml`/`semgrep.yml` em vez de inventar.
2. **Instalar Chromium no CI**: `npx playwright install --with-deps chromium`. Vale cachear.
   Sem `--with-deps` o Chromium não sobe no runner do GitHub.
3. **Levar o `check_abas.mjs` junto** — ele usa o mesmo rig e o mesmo Chromium; se o navegador
   já está instalado no job, rodar os dois sai quase de graça. Considere fazê-lo.
4. **Tempo**: o laço leva ~1–2 min (23 views × navegação). Aceitável para job paralelo.
5. **Não mexer no `app.js`.** Esta fatia é só de CI.

### Ao terminar

- Atualize o `CLAUDE.md`: hoje o passo **2a** diz que o `check_views.mjs` fica **fora do CI** —
  isso deixa de ser verdade. Ajuste também a menção em "Publicação (Vercel)" se citar os
  workflows.
- Entrada no `docs/CHANGELOG.md`.
- Rode o gate local antes de commitar: `node tests/check.js`, `node scripts/check_views.mjs`,
  `node scripts/check_abas.mjs`.
- **Confira o resultado real no GitHub Actions** depois do push — CI que ninguém olhou verde
  não está provado. Um workflow que passa por não ter rodado nada é o falso verde clássico:
  confirme nos logs que as 23 views apareceram.
- **Branch: parta da `main`** e abra uma branch nova. A fatia 0 já foi mergeada na `main` — não
  empilhe commits sobre a `claude/ask-matt-toyp43`, que é história já mergeada. Não abra PR sem
  pedirem.

### Pendência herdada (não é bloqueio)

`./scripts/semgrep.sh` **não pôde rodar** na sessão da fatia 0: instalar o Semgrep exige rede,
bloqueada no ambiente do Claude. O `semgrep.yml` roda no CI — vale conferir se ficou verde
depois do push da fatia 0.
