# C4 — Municípios e Localidades

## Objetivo

Extrair do `app.js` as famílias completas de Municípios e Localidades para um módulo focado em
`src/documentos/`, sem antecipar a composição global da Fase D e sem expor estado mutável do IIFE.

## Limite e interface

O módulo novo será `src/documentos/municipios-localidades.mjs`. Suas entradas de render recebem
explicitamente `ctx = { view, gen, pane, host, line }`; nenhum export acessa `currentView`,
`activeLine` ou `modalBody`. A medição dos símbolos e dependências será refeita sobre o `app.js`
vigente antes da movimentação e registrada na documentação estrutural.

Dependências estáveis chegam por imports existentes. Dependências mutáveis passam pelo seam já
existente apenas se forem responsabilidades inevitáveis dos documentos. Se forem necessárias mais
de aproximadamente seis dependências mutáveis, a responsabilidade causadora permanece no
`app.js`, com justificativa, em vez de alargar a interface.

## Famílias movidas

O módulo reúne os fluxos completos acionados por `LOADERS.ligacoesPorLogradouro`,
`LOADERS.municipioRegiao`, `LOADERS.ligacoesPorTerminal` e `LOADERS.localidades`, incluindo runners,
renders e helpers privados exclusivos. `app.js` conserva somente responsabilidades genuínas de
shell/composição que não possam atravessar o limite estreito.

Tabelas, paginação e seleção de linhas reutilizam `src/ui/listas.mjs`. Markup só entra em
`src/ui/blocos.mjs` quando for realmente compartilhado por pelo menos duas famílias; markup
específico permanece privado no módulo.

## Estado, PDF e concorrência

- `#regScope` e `#munScope` preservam a seleção durante recarregamentos assíncronos.
- A tela de Municípios mantém separados seus dois ramos de PDF; listas de tela usam `pdf:false`.
- Localidades mantém `paginateLines(..., { pdf:false })` no bloco secundário e realiza somente um
  `commitViewResult` depois que os dois blocos estiverem prontos.
- `nextGen`/`isCurrentGen` continuam protegendo repinturas contra buscas e abas obsoletas.

## Integração e provas

O módulo é importado pelo `app.js`, liberado individualmente na `.vercelignore` e descrito em
`docs/estrutura-frontend.md` e no changelog. O teste contratual de módulos deve falhar antes da
criação do módulo e passar depois. A validação inclui `tests/check.js`, os testes de módulo, os
gates `check_views`, `check_selecao_linha` e `check_corrida_abas`, além dos gates gerais aplicáveis.
Uma mutação temporária quebra um render movido, prova a falha do gate e é revertida antes do commit.

## Fora de escopo

A composição global do registro `LOADERS` prevista para a Fase D não faz parte desta entrega.

