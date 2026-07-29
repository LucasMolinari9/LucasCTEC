# Fase 4 — manutenção incremental

## Estado

Implementação na branch `agent/fase-4-manutencao-incremental`, baseada no head da Fase 3
`13c897a8186ba005d27b63fabc0eff90585e0dba`. A PR #73 não foi alterada.

A publicação da PR da Fase 4 permanece bloqueada pela issue
[#74](https://github.com/LucasMolinari9/LucasCTEC/issues/74): os gates de banco atuais derivam o
alvo dos literais de produção em `app.js`. A Fase 4 não corrige esse problema da Fase 3 e não
executa validações contra produção.

## Extrações

- `shared/environment.js`: seleção fail-closed entre produção e teste.
- `shared/domain.js`: formatação, saneamento, regras de linhas, agrupamentos, resumos e
  `dedupEmpresasPorRJ`.
- `shared/view-state.js`: estado puro de abas, geração de views, detalhe, paginação e despacho
  Realtime.
- `tests/pure.harness.js` importa os módulos reais; não mantém cópias.
- `index.html`, a allowlist da Vercel e o detector de versão incluem os módulos.

Paridade disponível: 208/208 testes puros, incluindo duplicatas, chaves RJ numéricas/textuais,
prioridade REGULAR/não cassada, empate e imutabilidade da entrada.

## Métricas

Coleta: cinco execuções frias e cinco quentes por cenário, somente em
`gontnlfmothfglssbyyk`. Script: [measure_phase4.mjs](../../scripts/measure_phase4.mjs).
Dados: [baseline e comparação](../metricas/fase-4-baseline-e-comparacao.json).

| Cenário frio | Antes: req / ms / bytes | Depois: req / ms / bytes | Decisão |
|---|---:|---:|---|
| Busca hero — NITERÓI | 1 / 49,1 / 15.265 | sem mudança | não é hotspot |
| Rio de Janeiro → Niterói | 5 / 243,9 / 1.232.598 | 5 / 229,5 / 1.232.598 | payload alto; adiado |
| Rio → São | 18 / 457,8 / 381.002 | 13 / 327,6 / 306.102 | otimizado |
| Centro × Niterói | 9 / 197,1 / 181.390 | sem mudança | cache já reduz para 6 req quente |

No hotspot otimizado, o cenário frio reduziu 27,8% das requisições, 28,4% da duração e 19,7% do
payload; o quente reduziu 29,4%, 25,6% e 20,3%. O caso exato não regrediu.

## Índices

Nenhum índice foi criado, removido ou modificado. O caso de maior payload respondeu em cerca de
244 ms e transfere mais de 1,2 MB; a evidência aponta primeiro para volume de resposta, não para
um índice ausente. Os avisos `unused_index` do projeto de teste não são representativos de
produção e não justificam remoção.

## Gates

Concluído nesta branch:

- compilação isolada de `app.js` e dos três módulos;
- ordem dos scripts e allowlist de publicação;
- 208/208 testes puros;
- coleta anterior/posterior no Supabase de teste, sem erros;
- rejeição explícita do project ref de produção no script de métricas;
- smoke em preview local com hostname fail-closed: 8 cards renderizados, busca `NITERÓI`
  retornando dados, Empresas Regulares com 132 empresas e nenhum erro/warning da aplicação;
- advisors test-only: somente 4 INFO conhecidos de staging sem policy e 7 INFO de índices ainda
  não usados; nenhuma alteração aplicada.

Pendentes antes da PR em rascunho:

- gates test-only da issue #74;
- suíte completa `tests/check.js` no runner oficial (a execução estrutural local ficou verde e
  detectou/corrigiu uma ordem de inicialização no próprio gate);
- views e abas em Chromium;
- DB checks, Deriva, Realtime, qualidade e grants;
- Semgrep e demais workflows aplicáveis.

## Trabalho adiado

- Investigar o payload de `Rio de Janeiro → Niterói` no banco de teste, com
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` somente se uma consulta candidata for definida.
- Avaliar extração futura de `sbFetch` por injeção de dependência; hoje o timeout mutável do
  harness e o I/O tornam a mudança maior que uma extração pura.
- Resolver a issue #74 em PR separada, sem misturar correções da Fase 3.
