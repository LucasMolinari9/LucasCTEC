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

## Trabalho em curso e registro

- [`planos/2026-08-14-modularizacao-fatias-3-4.md`](planos/2026-08-14-modularizacao-fatias-3-4.md)
  é o plano vivo de redução do `app.js`: C1–C3 estão concluídas; seguem C4, B e D. A fase E só
  entra se reduzir acoplamento de forma mensurável.
- [`planos/fase-3-hardening-moderado.md`](planos/fase-3-hardening-moderado.md) reúne o estado e as
  condições ainda abertas para promover o hardening do banco.
- [`CHANGELOG.md`](CHANGELOG.md) registra a cronologia do produto. Planos encerrados, handoffs e
  auditorias removidos da árvore continuam disponíveis no histórico do Git.

Se houver divergência, a fonte vigente especializada prevalece sobre um plano. Registros antigos
do Git explicam decisões passadas, mas não descrevem o estado atual.

## Rota curta para uma sessão nova

1. Leia `CLAUDE.md` para as regras operacionais que valem hoje.
2. Use este índice para abrir somente o documento especializado da tarefa.
3. Consulte um plano vivo apenas se a tarefa fizer parte dele.
4. Consulte `git log -- <arquivo>` somente quando precisar investigar a origem de uma decisão.
