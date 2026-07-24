# Issue tracker: GitHub

Issues e PRDs deste repo vivem como GitHub issues (`LucasMolinari9/LucasCTEC`). Use a CLI `gh`
para todas as operações.

## Convenções

- **Criar issue**: `gh issue create --title "..." --body "..."`. Use heredoc para corpos
  multi-linha.
- **Ler issue**: `gh issue view <number> --comments`, filtrando comentários com `jq` e também
  buscando labels.
- **Listar issues**: `gh issue list --state open --json number,title,body,labels,comments --jq
  '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` com
  os filtros `--label` e `--state` apropriados.
- **Comentar numa issue**: `gh issue comment <number> --body "..."`
- **Aplicar / remover labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Fechar**: `gh issue close <number> --comment "..."`

O repo é inferido de `git remote -v` — o `gh` faz isso automaticamente dentro de um clone.

## PRs como superfície de triagem

**PRs como superfície de pedido: não.** _(Ligar para `sim` se este repo tratar PRs externos como
pedidos de feature; o `/triage` lê essa flag.)_

Quando ligado (`sim`), PRs passam pelos mesmos labels e estados que issues, usando os
equivalentes `gh pr`:

- **Ler um PR**: `gh pr view <number> --comments` e `gh pr diff <number>` para o diff.
- **Listar PRs externos para triagem**: `gh pr list --state open --json
  number,title,body,labels,author,authorAssociation,comments` mantendo só `authorAssociation`
  igual a `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` ou `NONE` (descartar `OWNER`/`MEMBER`/
  `COLLABORATOR`).
- **Comentar / rotular / fechar**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`,
  `gh pr close`.

O GitHub compartilha um único espaço de números entre issues e PRs, então um `#42` isolado pode
ser qualquer um dos dois — resolva com `gh pr view 42`, com fallback para `gh issue view 42`.

## Quando uma skill disser "publicar no rastreador de issues"

Criar uma issue no GitHub.

## Quando uma skill disser "buscar o ticket relevante"

Rodar `gh issue view <number> --comments`.

## Operações do wayfinder

Usadas por `/wayfinder`. O **mapa** é uma issue única com issues **filhas** como tickets.

- **Mapa**: uma issue com label `wayfinder:map`, contendo o corpo Notes / Decisions-so-far /
  Fog. `gh issue create --label wayfinder:map`.
- **Ticket filho**: uma issue linkada ao mapa como GitHub sub-issue (`gh api` no endpoint de
  sub-issues). Onde sub-issues não estiverem habilitadas, adicionar o filho a uma task list no
  corpo do mapa e colocar `Part of #<map>` no topo do corpo do filho. Labels:
  `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Uma vez reivindicado, o ticket
  é atribuído ao dev que está conduzindo.
- **Bloqueio**: **dependências nativas de issue** do GitHub — a representação canônica, visível
  na UI. Adicionar uma aresta com `gh api --method POST
  repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, onde
  `<blocker-db-id>` é o **database id** numérico do bloqueador (`gh api
  repos/<owner>/<repo>/issues/<n> --jq .id`, _não_ o `#number` nem o `node_id`). O GitHub reporta
  `issue_dependencies_summary.blocked_by` (só bloqueadores abertos — o gate ao vivo). Onde
  dependências não estiverem disponíveis, cair para uma linha `Blocked by: #<n>, #<n>` no topo
  do corpo do filho. Um ticket é desbloqueado quando todo bloqueador estiver fechado.
- **Query de fronteira**: listar os filhos abertos do mapa (`gh issue list --state open`,
  restrito às sub-issues/task list do mapa), descartar qualquer um com bloqueador aberto
  (`issue_dependencies_summary.blocked_by > 0`, ou uma issue aberta na linha `Blocked by`) ou
  com assignee; o primeiro na ordem do mapa vence.
- **Reivindicar**: `gh issue edit <n> --add-assignee @me` — a primeira escrita da sessão.
- **Resolver**: `gh issue comment <n> --body "<resposta>"`, depois `gh issue close <n>`, depois
  anexar um ponteiro de contexto (gist + link) ao Decisions-so-far do mapa.
