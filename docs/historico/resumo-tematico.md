# Síntese temática do arquivo histórico

Esta síntese contém somente lições que atravessam os snapshots. Ela **não substitui fontes
vigentes** nem transforma pendências antigas em backlog atual. Cada item aponta para o registro
integral que o sustenta.

## Método de verificação

- Afirmação externa deve ser reconferida contra a fonte primária disponível; os snapshots registram
  tanto achados confirmados quanto exageros e refutações. Isso aparece nas revisões de
  [16/07](revisao-externa-2026-07-16.md) e [17/07](revisao-externa-2026-07-17.md).
- Ausência no clone, cache ou ferramenta do agente não prova ausência na origem. O handoff de
  [31/07](contexto-proxima-sessao-2026-07-31.md) preserva os casos em que foi necessário consultar a
  fonte remota ou reconhecer o estado como não verificável.
- Um gate verde só é evidência forte quando a asserção consegue falhar diante da mutação relevante.
  A auditoria de [08/08](analise-2026-08-08-auditoria-completa.md) documenta falsos verdes causados
  por guardas que verificavam menos do que afirmavam.

## Arquitetura e modularização

- Extrair por responsabilidade e redução de acoplamento, não por contagem de linhas. A análise de
  [separação](analise-separacao.md) desaconselhou abstrair glue de uso único, e o estudo de
  [10/08](estudo-modularizacao-frontend-2026-08-10.md) converteu a mesma ideia em fatias profundas.
  A regra vigente está em [`docs/governanca.md`](../governanca.md).
- Mudanças de módulo devem preservar, em etapas separadas, CSP same-origin, seleção fail-closed do
  ambiente e proteção comportamental. O estudo de [10/08](estudo-modularizacao-frontend-2026-08-10.md)
  registra por que arquivos menores, sozinhos, não resolvem acoplamento.

## Ambiente de teste e operação

- Isolamento precisa ser provado no deploy, não apenas inferido do código. O plano de
  [28/07](plano-ambiente-teste-2026-07-28.md) separou encanamento e ativação, e a verificação de
  [29/07](plano-verificacao-ambiente-2026-07-29.md) mostrou que código verde podia coexistir com um
  preview apontando para produção. A decisão vigente está no
  [`ADR-0002`](../adr/0002-ambiente-de-teste-isolado.md).
- Credenciais, painéis e observação humana são limites reais do ambiente de agente; não devem ser
  convertidos em alegação de sucesso. O briefing de [31/07](execucao-pr73-e-painel.md) separa os
  passos automatizáveis daqueles que pertencem ao dono.

## Segurança, backup e dados

- Backup só se completa quando a restauração é exercitada e medida. Essa lacuna reaparece na revisão
  de [16/07](revisao-externa-2026-07-16.md), no hardening de
  [21/07](plano-endurecimento-2026-07-21.md) e na consolidação de
  [31/07](pendencias-2026-07-31-consolidado.md). O procedimento vigente está em
  [`docs/backup.md`](../backup.md).
- Alterações de banco, credenciais e produção exigem autorização e janela próprias; não devem ser
  acopladas a limpeza documental ou modularização. A separação de riscos foi registrada no handoff
  de [30/07](handoff-2026-07-30-auditoria-verificacao.md) e hoje é norma em
  [`docs/governanca.md`](../governanca.md).

## Custo de processo e documentação

- Histórico datado deve preservar evidência sem entrar no contexto padrão. O handoff de
  [14/08](contexto-proxima-sessao-2026-08-14.md) mediu o custo recorrente da documentação e originou
  a auditoria viva de [`custo do processo`](../planos/2026-08-19-custo-do-processo.md).
- Adicionar proteção sem condição de saída faz o processo crescer mesmo quando a implementação
  melhora. O critério vigente para documentação, gates e modularização está centralizado em
  [`docs/governanca.md`](../governanca.md), não neste arquivo histórico.
