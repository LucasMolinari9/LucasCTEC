# Revisão externa do projeto — 16/07/2026

Registro de uma **avaliação externa** do portal DIVAT (feita pelo modelo **Kimi K3**) e do que
foi decidido a partir dela. Serve de histórico: cada apontamento foi **conferido contra o código
real** antes de virar (ou não) uma mudança. Não é uma lista de tarefas em aberto — é o placar do
que entrou, do que ficou para depois e **por quê**.

> **Como ler:** ✅ corrigido nesta rodada · ⏳ adiado (válido, fora do escopo escolhido) ·
> 💤 P2 / "quando crescer". A coluna "Confere?" diz se a afirmação bateu com o código.

## Placar

| # | Apontamento | Confere? | Status | Onde |
|---|---|---|---|---|
| 1 | `supabase-js` da CDN sem versão fixa nem SRI | Sim | ⏳ adiado | `index.html` (`<script src>` jsDelivr) |
| 2 | CSP ainda com `'unsafe-inline'` | Sim (intrínseco) | 💤 quando crescer | `vercel.json` |
| 3 | Truncagem silenciosa em `openLinhasPorIbge` (total cortado em 150) | Sim | ✅ corrigido | `index.html` |
| 4 | Realtime de views aninhadas não lista lookups | Sim | ✅ corrigido | `index.html` |
| 5a | Backup: paginação de `tabela_vista_teste` só por `codlinha` (PK é composta) | Sim | ✅ corrigido | `scripts/backup_rest.mjs` |
| 5b | Backup recorrente + restore drill | — (operacional) | ⏳ adiado | `docs/backup.md` |
| 6 | Drift: contagem de linhas no CLAUDE.md e carimbo de versão | Sim | ✅ corrigido | `CLAUDE.md`, `index.html` |
| P1 | Checks de qualidade de dados pós-ETL | — (novo script) | ⏳ adiado | — |
| P2 | Módulo compartilhado / smoke test em navegador / higiene GitHub | — | 💤 quando crescer | — |

## O que foi corrigido nesta rodada

Commit único na branch de review, mesclado na `main`. Todos os testes verdes (`node tests/check.js`).

### ✅ 3 · Truncagem silenciosa em "Linhas no Município"
`openLinhasPorIbge` fazia `distinctCods(it, 150)` e exibia `cods.length` como **Total** — um
município com mais de 150 linhas mostrava "150 linha(s)" sem aviso (o número visível era o cortado).
Agora: o Total usa a contagem **real** (`allCods.length`, sem corte); o teto de listagem subiu para
500 (alinhado com as views irmãs); e aparece um aviso `.trunc-aviso` de **lista parcial** quando há
corte — na tela e no PDF. Reusa a estética de truncagem já existente (`bannerTrunc`).

### ✅ 4 · Realtime de views aninhadas
`openEmpresaLigacoes` e `openLinhasPorIbge` chamam `runView` **direto** com `tables` explícito, mas
liam lookups fora dele (`codempresa_teste` via `getEmpresas()`; `tabela_vista_teste` via
`fetchLinesByCods()`). Como o `onRealtime` filtra por `currentView.tables`, a tela aberta **não
recarregava** quando o lookup mudava — violando a regra do `CLAUDE.md` ("liste TODAS as tabelas que o
loader lê, inclusive lookups"). Agora `tables` inclui todos os lookups (todos já em `RT_TABLES`).
Foram só essas 2 views — as demais passam por `VIEW_TABLES`.

### ✅ 5a · Paginação do backup pela PK completa
`tabela_vista_teste` tem PK composta `(codlinha, codempresa)`, mas `scripts/backup_rest.mjs` paginava
ordenando só por `codlinha`. Com `offset` e `codlinha` repetida, a ordem entre páginas é indefinida →
pode pular ou duplicar linha no dump. Corrigido para ordenar por `codlinha,codempresa`. As outras 17
tabelas já ordenam por coluna única.

### ✅ 6 · Drift de doc/versão
Contagem de linhas no `CLAUDE.md` (~1.800 → ~2.360) e carimbo de versão (`build 15/07-A` → `16/07-A`).

## O que ficou para depois (válido, fora do escopo desta rodada)

- **⏳ 1 · Pin + SRI do `supabase-js`.** Apontamento correto de supply-chain. Exige buscar o arquivo
  pinado da CDN e calcular o hash **real** — SRI errado **quebra o carregamento** do site (ver
  `CLAUDE.md`). Fazer com o hash verificado, não de memória.
- **⏳ 5b · Backup recorrente + restore drill.** O backup é manual **por design** (roda na máquina do
  dono com a `service_role` key; o ambiente do Claude não alcança o Supabase). Automatizar implicaria
  colocar a service key num CI/cron — tradeoff de segurança, não um quick win. Um **restore drill**
  ocasional é a maior lacuna: hoje o runbook descreve como restaurar, mas isso nunca foi **provado**
  ponta a ponta.
- **⏳ P1 · Checks de qualidade de dados pós-ETL.** Script novo: órfãos de `codlinha`, `cod_origem`
  fora de `municipio_teste`/`origem_teste`, duplicidades, contagem de `U+FFFD`, inconsistência de
  empresa. Valioso, mas é feature — separado das correções cirúrgicas.

## Fora de escopo (P2 — "quando crescer")

Remover `'unsafe-inline'` da CSP (intrínseco ao arquivo único; só sai com refatoração grande) ·
extrair funções puras para módulo compartilhado (hoje cópias verbatim nos harnesses) · smoke test
em navegador para fluxos críticos · higiene do GitHub (descrição, README com link/screenshot, topics,
licença).

## Veredito do revisor

> "Confiaria na base atual como MVP público sério, principalmente pela documentação e pelos testes.
> Os pontos que mais merecem atenção não são reformar para framework; são travar a dependência
> externa, fechar os avisos de truncagem, alinhar o Realtime das views aninhadas e provar que o
> backup restaura."

Desses quatro, **truncagem** e **Realtime aninhado** foram fechados aqui; **travar a dependência**
(pin+SRI) e **provar o restore** seguem como as próximas duas frentes recomendadas.
