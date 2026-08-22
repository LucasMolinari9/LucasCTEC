# Mapa da documentação

Comece por este arquivo. O objetivo é localizar a fonte vigente sem varrer o histórico.

## Fontes vigentes

| Preciso de | Fonte |
|---|---|
| Regras permanentes para agentes e estado atual do portal | [`../CLAUDE.md`](../CLAUDE.md) |
| Critérios para admitir ou encerrar docs, gates e módulos | [`governanca.md`](governanca.md) |
| Estrutura do frontend e navegação no `app.js` | [`estrutura-frontend.md`](estrutura-frontend.md) |
| Banco, segurança, operação e recuperação | [`schema.md`](schema.md), [`seguranca.md`](seguranca.md), [`etl.md`](etl.md) e [`backup.md`](backup.md) |
| Decisões arquiteturais duráveis | [`adr/`](adr/) |
| Vocabulário do domínio | [`../CONTEXT.md`](../CONTEXT.md) e [`agents/domain.md`](agents/domain.md) |

## Estado e registro

- [`planos/`](planos/) contém **planos vivos** e normativos enquanto o trabalho estiver aberto.
- [`superpowers/specs/`](superpowers/specs/) e [`superpowers/plans/`](superpowers/plans/) contêm
  especificações e planos produzidos pelo fluxo Superpowers; o plano vivo deve ser descobrível
  neste índice ou em `planos/`.
- [`CHANGELOG.md`](CHANGELOG.md) registra a cronologia do produto.
- [`historico/README.md`](historico/README.md) é o índice do **arquivo frio**: snapshots, auditorias
  e handoffs datados. Os originais preservam evidência, mas não são fonte vigente nem fazem parte
  do contexto normal de uma sessão.

Se houver divergência, a fonte vigente especializada prevalece sobre um plano antigo, e qualquer
fonte vigente prevalece sobre `historico/`. Não atualize um snapshot para fazê-lo parecer atual.

## Rota curta para uma sessão nova

1. Leia `CLAUDE.md` para as regras operacionais que valem hoje.
2. Use este índice para abrir somente o documento especializado da tarefa.
3. Consulte um plano vivo apenas se a tarefa fizer parte dele.
4. Abra `historico/` somente para investigar a origem de uma decisão.
