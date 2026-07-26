# 03 — schema.md aponta para `index.html`, mas o código vive no `app.js`

Ticket de correção de deriva docs×código (auditoria de 26/07/2026). Só documentação.

## Fatos verificados

- `docs/schema.md` referencia `index.html` como onde vivem os joins/loaders:
  - linha ~5: "join feito no código do `index.html`";
  - linha ~11: "sem reler **1.800 linhas** de JS";
  - coluna "**Onde no código (`index.html`)**" na tabela de fatos (linhas ~97–104);
  - linha ~131: "(ver `renderItinerarios` / `classifyMunLines` no `index.html`)".
- Realidade: todo o JS vive em **`app.js`** (o `index.html` não tem script inline — o
  `tests/check.js` falha se tiver, e a CSP é `script-src 'self'`). O `app.js` tem hoje
  **3.177 linhas**.
- As funções citadas (`renderItinerarios`, `classifyMunLines`, `renderTarifas`,
  `folhaDeRosto`, `renderQuadro`, `fetchQHByLines`, `renderFrota`, `renderHistorico`,
  `empNome`/`empresaMap`, `origemMap`, `ibgeMap`/`getIbge`, `evEmpMap`, `evLinMap`,
  `quadroHorariosBodyHTML`) existem — só o ARQUIVO citado está errado.

## O que fazer

1. Trocar todas as referências de arquivo `index.html` → `app.js` no `schema.md`
   (só as que se referem a ONDE O CÓDIGO VIVE; o arquivo `index.html` em si continua
   existindo como HTML).
2. Atualizar "1.800 linhas" para a ordem de grandeza atual (~3,2k) ou remover o número
   (recomendado: aproximar, número exato envelhece a cada commit).
3. Conferir se os nomes de função da coluna "Onde no código" ainda batem com o `app.js`
   (grep em cada um) — corrigir os que tiverem mudado.

## Como verificar

- `grep -n "index.html" docs/schema.md` → só devem sobrar menções legítimas ao HTML
  (se houver alguma).
- Cada função citada existe no `app.js`: `grep -n "nomeDaFuncao" app.js`.
- `node tests/check.js` verde.

## Regras do repo

- Branch → preview → merge com CI verde. Sem bump de `#verTag` (só docs).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
