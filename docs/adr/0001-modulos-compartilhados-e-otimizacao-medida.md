# ADR 0001 — Módulos compartilhados e otimização orientada por métricas

- Status: aceita na branch da Fase 4
- Data: 29/07/2026
- Escopo: frontend estático; nenhum schema, dado ou privilégio de banco

## Contexto

O `app.js` concentrava lógica pura, estado de views e integração de UI. O harness mantinha 37
cópias verbatim dessas funções. A regra de deduplicação de empresas por RJ também existia em dois
call sites. Isso criava acoplamento e risco de testes verdes contra uma cópia desatualizada.

O fluxo direcional de municípios fazia uma consulta de itinerário por par ambíguo. A medição no
Supabase de teste mostrou 18 requisições no cenário `Rio → São`.

## Decisão

1. Manter zero-build e scripts clássicos, com três módulos UMD/CommonJS carregados antes do app:
   `shared/environment.js`, `shared/domain.js` e `shared/view-state.js`.
2. Expor apenas APIs congeladas em `globalThis.DIVAT`; os testes Node importam os mesmos arquivos.
3. Consolidar a deduplicação de empresas em `dedupEmpresasPorRJ`, preservando prioridade e empate.
4. No hotspot medido, calcular primeiro os pares candidatos e baixar os itinerários pelo conjunto
   de linhas em lotes de até 200. A decisão A→B continua local, separada por sentido.
5. Não alterar índices, RPCs, schema, RLS ou grants. O alto payload do caso exato será investigado
   separadamente, com evidência de plano de execução no Supabase de teste.

## Consequências

- O harness deixa de duplicar lógica e passa a testar a implementação entregue ao navegador.
- A ordem dos quatro scripts passa a ser contrato verificado pelo gate.
- O auto-update passa a vigiar também os três módulos.
- O cenário ambíguo medido reduz requisições e duração acima dos limiares de aceitação.
- Há três arquivos públicos adicionais; a allowlist da Vercel foi atualizada explicitamente.
- O namespace global `DIVAT` é deliberado e restrito às APIs compartilhadas congeladas.

Evidência: [baseline e comparação](../metricas/fase-4-baseline-e-comparacao.json).
