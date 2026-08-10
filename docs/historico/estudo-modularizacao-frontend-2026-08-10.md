# Estudo de modularização segura do frontend — 10/08/2026

## Diagnóstico medido

O gargalo é `app.js`, não `index.html`: antes desta etapa eram 3.479 linhas, 165 declarações de função e 18 registros em `LOADERS`. O maior acoplamento está no sistema de views, que combina estado, DOM e I/O. Separar arquivos arbitrariamente não reduziria esse acoplamento; criaria módulos rasos e dependência de ordem.

O projeto já tinha três proteções que precisavam sobreviver: CSP sem script inline, seleção fail-closed do banco (host desconhecido usa teste) e testes sem dependências. Nenhuma etapa segura poderia alterar queries, chaves, migrations ou loaders junto com a troca do mecanismo de módulos.

## Evidência primária

- Scripts `type="module"` suportam imports nativos, são diferidos automaticamente e usam modo estrito. Isso permite manter zero-build sem criar globais: [MDN — JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) e [MDN — elemento script](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script).
- `script-src 'self'` permite scripts da própria origem; os módulos extraídos permanecem same-origin e não exigem `unsafe-inline`: [MDN — CSP script-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).
- O cache do navegador e de CDN pode distinguir recursos por seus validadores HTTP. Um marcador único evita manter manualmente uma lista de cada módulo: [MDN — ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) e [Vercel — Cache-Control headers](https://vercel.com/docs/headers/cache-control-headers).

## Alternativas avaliadas

1. **Scripts clássicos múltiplos:** rejeitado porque exigiria ordem textual e símbolos globais.
2. **Bundler/framework:** adiado porque mudaria build, deploy e debugging simultaneamente.
3. **ESM nativo incremental:** escolhido porque cria um seam explícito, mantém deploy estático e permite que Node e navegador importem a mesma implementação.

## Estratégia de risco

A primeira fatia move apenas funções puras já cobertas. `app.js` mantém o IIFE, todos os efeitos colaterais, seleção Supabase, REST, Realtime, DOM e loaders. O teste importa o módulo real, portanto deixa de validar uma cópia que poderia divergir. `version.json` passa a representar atomicamente o conjunto publicado; ele deve ser incrementado em qualquer mudança de recurso servido.

## Próximas fatias recomendadas

1. Extrair as demais transformações puras, agrupadas por domínio e acompanhadas de testes que importem produção.
2. Criar um módulo profundo de acesso REST somente quando sua interface puder esconder timeout, retry e truncagem sem expor detalhes do PostgREST.
3. Separar documentos por família somente após injetar explicitamente estado e render target; não exportar dezenas de variáveis do IIFE.
4. Por último, transformar o registro `LOADERS` em composição explícita. Não migrar todos os loaders de uma vez.

Essa ordem mantém cada commit reversível, evita qualquer escrita no banco e concentra a verificação na interface realmente movida.
