# Fase D — Registro explícito de loaders

## Objetivo

Concluir a Fase D do plano vivo depois do merge de C4: inventariar o registro `LOADERS`, ligar
diretamente os loaders documentais exportados pelas famílias e remover wrappers que apenas
repassam `ctx`, sem reextrair os corpos documentais já movidos nas fases C.

## Limite arquitetural

`app.js` continua sendo o shell. `lineDocView`, `lineDocRun`, `lineSearchRun` e `searchPanel`
permanecem nele porque pertencem à Fase E opcional. A Fase D não cria container global, service
locator nem objeto genérico de dependências.

Cada família documental pode receber, por configuração própria e fail-closed, somente as ações
de shell necessárias para compor seus loaders. Assim, os módulos exportam funções com a assinatura
final `loader(ctx)`, e o registro do `app.js` associa esses exports diretamente. Isso evita ampliar
o seam compartilhado de `src/documentos/shell.mjs`, que já chegou ao limite de seis slots na C4.

## Classificação do inventário

As entradas pós-C4 serão classificadas em três grupos:

1. **Loader documental exportado:** associação direta a uma função importada de
   `src/documentos/`.
2. **Composição fina de busca:** função curta que escolhe modo, prepara o painel ou encaminha a
   busca usando os quatro helpers preservados no shell.
3. **Infraestrutura do modal:** loader que depende de `runView`, estado do modal ou navegação e,
   portanto, permanece no `app.js`.

O inventário é registrado no plano vivo com o motivo exato de cada wiring remanescente. Um corpo
documental extenso encontrado dentro de `LOADERS.*` é tratado como falha da família C responsável,
não como escopo adicional da D.

## Fluxo de composição

No bootstrap do IIFE, o shell configura cada família com suas ações estreitas. Depois, o registro
faz associações nominais, como `LOADERS.portarias = renderPortarias`, sem mapas mesclados e sem
resolução indireta. As queries, renders e regras de documento continuam nos módulos em que C1–C4
os colocaram.

## Verificação e encerramento

Um gate estrutural falha antes da implementação e passa somente quando:

- loaders documentais são exports reais e associações diretas;
- wrappers triviais `(ctx) => importado(ctx)` não existem;
- os quatro helpers da Fase E continuam no `app.js`.

Depois serão executados `check.js`, `check_views`, `check_abas`, `check_selecao_linha`,
`check_corrida_abas` e Semgrep. O plano vivo e `CLAUDE.md` marcarão B, C4 e D como concluídas e
declararão exatamente o wiring restante. A avaliação final decide se a Fase E reduziria
acoplamento de modo mensurável; nenhuma nova extração é aberta automaticamente.
