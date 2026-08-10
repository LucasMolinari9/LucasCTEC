# Modularização segura do frontend — design

## Objetivo

Reduzir o `app.js` incrementalmente sem framework, bundler ou alteração do banco. A primeira entrega cria um seam real para regras puras: o navegador e os testes passam a consumir a mesma implementação, enquanto inicialização, DOM, rede, Realtime e loaders continuam no `app.js`.

## Decisão

Usar ES modules nativos. Scripts clássicos exigiriam globais e ordem manual; um bundler ampliaria demais a mudança. O `index.html` carregará `app.js` como módulo, e `app.js` continuará encapsulado em IIFE, importando apenas `src/domain/core.mjs`.

O módulo `core.mjs` será profundo: uma interface de funções puras já existentes esconde regras de formatação, segurança de texto, situação de linha e coleções. Não terá acesso a `window`, DOM, `fetch` ou Supabase. Esta etapa não extrai loaders nem estado.

## Segurança e dados

- Nenhuma migration, SQL ou escrita no Supabase.
- URLs, chaves, seleção produção/teste, queries e funções de rede permanecem no lugar.
- As funções serão movidas sem mudança semântica.
- O navegador continuará sujeito à CSP `script-src 'self'`; imports relativos são same-origin.
- O auto-update observará um manifesto estático de versão, evitando enumerar indefinidamente cada módulo futuro.
- Falha ao carregar qualquer import impede a inicialização inteira, em vez de executar parcialmente.

## Testes

Os testes de domínio importarão `core.mjs` diretamente, eliminando cópias manuais dessas funções. O gate validará sintaxe de módulos, ausência de script inline, CSP, service-role, testes unitários e smoke tests existentes. A comparação comportamental será feita antes/depois pelos testes atuais e pelo Chromium com fixtures.

## Escopo da primeira entrega

1. Criar `src/domain/core.mjs` com funções puras já cobertas.
2. Converter o entrypoint para módulo sem remover seu IIFE.
3. Substituir as definições movidas por imports.
4. Migrar o harness puro para reexportar a implementação real.
5. Criar `version.json` e fazer a verificação de deploy observar esse único recurso.
6. Atualizar documentação e guardas.

Ficam fora: decompor os 18 loaders, alterar telas, mudar consultas, introduzir dependências e tocar no banco.
