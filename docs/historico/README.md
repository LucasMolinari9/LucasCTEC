# Índice do arquivo histórico

Este diretório contém snapshots preservados. **Não use este índice como fonte do estado atual**:
comece por [`docs/README.md`](../README.md) e consulte aqui somente a origem de uma decisão. A
[`síntese temática`](resumo-tematico.md) reduz a leitura quando o assunto atravessa várias datas.

“Situação atual” abaixo descreve a **posição documental** do arquivo em 22/08/2026. Ela não afirma
que uma issue, banco, deploy ou branch ainda esteja no estado retratado. Para isso, consulte a fonte
vigente indicada.

## Auditorias e estudos

| Data do retrato | Assunto | Resultado registrado | Situação atual | Registro integral |
|---|---|---|---|---|
| Pré-21/07 (adicionado em 30/06) | Duplicação no frontend ainda inline | Recomendou apenas D1–D5, de alto valor e baixo risco; deixou D6–D10 fora | Pré-split e superado como mapa de código; preserva o raciocínio de escopo | [`analise-duplicacao.md`](analise-duplicacao.md) |
| Pré-17/07 (adicionado em 01/07) | Separação lógica × apresentação | Concluiu que quase todo acoplamento restante era glue de uso único; S1 foi corrigido e S2 era a única extração isolada recomendada | Pré-split; referências de linha não são vigentes, mas o critério contra abstração especulativa permanece como evidência | [`analise-separacao.md`](analise-separacao.md) |
| 16/07/2026 | Revisão externa Kimi K3 | Corrigiu truncagem, Realtime aninhado, paginação de backup e deriva; registrou itens adiados | Rodada encerrada; o follow-up de 17/07 resolveu parte dos adiamentos | [`revisao-externa-2026-07-16.md`](revisao-externa-2026-07-16.md) |
| 17/07/2026 | Revisão externa Qwen | Todos os achados considerados válidos foram resolvidos e os exageros/refutações foram registrados | Rodada encerrada; notas operacionais posteriores pertencem às fontes vigentes | [`revisao-externa-2026-07-17.md`](revisao-externa-2026-07-17.md) |
| 27/07/2026 | Verificação de auditoria externa | Reconferiu achados e identificou lacunas em anti-drift e integridade hub-and-spoke | Handoff superado pelas consolidações de 30–31/07 | [`handoff-2026-07-27-auditoria-externa.md`](handoff-2026-07-27-auditoria-externa.md) |
| 30/07/2026 | Auditoria preliminar e plano de correção | Confirmou falhas de smoke/restore, separou riscos e acordou quatro PRs pequenos | Plano executado e corrigido pelos handoffs de 31/07 | [`handoff-2026-07-30-auditoria-verificacao.md`](handoff-2026-07-30-auditoria-verificacao.md) |
| 08/08/2026 | Auditoria completa do repositório | Encontrou falsos verdes centrais, deriva de schema/docs e bugs pontuais; propôs blocos de correção | Medição histórica; as fontes vivas e o changelog dizem o que foi corrigido depois | [`analise-2026-08-08-auditoria-completa.md`](analise-2026-08-08-auditoria-completa.md) |
| 10/08/2026 | Estudo de modularização segura | Escolheu módulos ES nativos sem build e fatias por responsabilidade, preservando CSP, fail-closed e testes | Incorporado ao [`plano vivo de modularização`](../planos/2026-08-14-modularizacao-fatias-3-4.md) | [`estudo-modularizacao-frontend-2026-08-10.md`](estudo-modularizacao-frontend-2026-08-10.md) |

## Ambiente de teste, hardening e operação

| Data do retrato | Assunto | Resultado registrado | Situação atual | Registro integral |
|---|---|---|---|---|
| 21/07/2026 | Endurecimento do portal em seis fases | Planejou backup, assets locais, CSP, teto PostgREST, saneamento de dados e redução do contexto | Plano histórico; confirme resultados no [`CHANGELOG`](../CHANGELOG.md) e nas fontes especializadas | [`plano-endurecimento-2026-07-21.md`](plano-endurecimento-2026-07-21.md) |
| 28/07/2026 | Desenho do ambiente de teste isolado | Implementou seleção fail-closed por hostname e registrou limites operacionais | Executado; decisão vigente no [`ADR-0002`](../adr/0002-ambiente-de-teste-isolado.md) | [`plano-ambiente-teste-2026-07-28.md`](plano-ambiente-teste-2026-07-28.md) |
| 29/07/2026 | Verificação do ambiente isolado | Código estava verde, mas smoke nunca passara e a branch de teste apontava para produção | Diagnóstico superado por entregas posteriores; desenho vigente no ADR-0002 | [`plano-verificacao-ambiente-2026-07-29.md`](plano-verificacao-ambiente-2026-07-29.md) |
| 29/07/2026 | Roteiro Codex para ambiente de teste | Separou gates por alvo, workflow de auditoria, conserto do smoke e dependências do dono | Roteiro histórico; hardening vigente em [`fase-3-hardening-moderado.md`](../planos/fase-3-hardening-moderado.md) | [`plano-codex-ambiente-teste-2026-07-29.md`](plano-codex-ambiente-teste-2026-07-29.md) |
| 31/07/2026 | Execução operacional da Fase 3 e painel | Preparou passos do dono para auditor, secret, branch protection e configurações de painel | Briefing datado; não usar como prova do estado externo atual | [`execucao-pr73-e-painel.md`](execucao-pr73-e-painel.md) |

## Handoffs, planos executados e consolidações

| Data do retrato | Assunto | Resultado registrado | Situação atual | Registro integral |
|---|---|---|---|---|
| 30/07/2026 | Renomeação dos tópicos da sidebar | PR #80 executou o mapeamento errado; PR #81 corrigiu para os nomes finais registrados | Encerrado; preservado porque documenta a correção e os riscos | [`plano-codex-renomear-topicos-2026-07-30.md`](plano-codex-renomear-topicos-2026-07-30.md) |
| 31/07/2026 | Execução dos PRs de auditoria e smoke | Registrou PRs #85–#87 e o primeiro funcionamento do `deploy-smoke` | Corrigido/complementado pelo handoff de visibilidade do mesmo dia | [`handoff-2026-07-31-prs-e-smoke.md`](handoff-2026-07-31-prs-e-smoke.md) |
| 31/07/2026 | PR 4 de visibilidade | Fechou a fila dos quatro PRs, corrigiu o handoff anterior e preservou o `CLAUDE.md` como fonte operacional | Superado pela consolidação e pelo contexto final de 31/07 | [`handoff-2026-07-31-pr4-visibilidade.md`](handoff-2026-07-31-pr4-visibilidade.md) |
| 31/07/2026 | Consolidação das pendências | Reuniu achados, separou trabalho do dono e de código e registrou o risco de promoção do PR #73 | Placar daquela data; não é backlog vigente | [`pendencias-2026-07-31-consolidado.md`](pendencias-2026-07-31-consolidado.md) |
| 31/07/2026 | Contexto detalhado da próxima sessão | Atualizou o PR #73 como mergeado e ordenou validação, restore e itens do dono | Handoff encerrado; consultar fontes vivas antes de retomar qualquer item | [`contexto-proxima-sessao-2026-07-31.md`](contexto-proxima-sessao-2026-07-31.md) |
| 09/08/2026 | Baselines por ambiente e PR #98 | Código estava pronto; baseline e login auditor dependiam de ações do dono | Superado como handoff; plano vivo de hardening é a autoridade atual | [`contexto-proxima-sessao-2026-08-09.md`](contexto-proxima-sessao-2026-08-09.md) |
| 14/08/2026 | Resposta em seis sessões ao custo do processo | Mediu excesso de processo, diferença Semgrep local/CI e monólito; especificou modularização e auditoria de custo | Originou os dois planos vivos apontados em [`docs/governanca.md`](../governanca.md) | [`contexto-proxima-sessao-2026-08-14.md`](contexto-proxima-sessao-2026-08-14.md) |

## Como manter este índice

- Adicione exatamente uma linha quando um novo snapshot for admitido pela
  [`governança`](../governanca.md).
- Descreva o resultado **à época** e a posição documental atual; não tente atualizar o conteúdo do
  original.
- Se a situação externa não puder ser provada por fonte vigente, escreva “não verificado”, nunca
  “pendente” ou “resolvido”.
- Não remova originais por causa deste índice. Qualquer remoção exige inventário, aprovação do dono
  e entrega separada.
