# Testes — lógica do `sbFetch` e aviso de truncagem

Testes unitários isolados (Node, sem dependências) da lógica adicionada no bloco
**SUPABASE CONFIG** do `index.html`. Não precisam de navegador nem de rede: o
`fetch` é mockado e o `AbortController` é o nativo do Node.

## Como rodar
```bash
cd tests
node sbFetch.test.js
```
Saída esperada: `==== PLACAR: 28/28 ====`

## O que é coberto
- **`sbFetch`** — sucesso; retry em 5xx e 429; 4xx que **não** repete (lança a
  mensagem do corpo); erro de rede (`TypeError`) que repete até o limite; e
  **timeout** via `AbortController` (não trava).
- **`marcarTrunc`** — marca arrays cortados (consulta com `limit>=50` que veio
  cheia) com a flag **não-enumerável** `_trunc`/`_limite`; não marca quando o
  limite é pequeno (<50), ausente, ou a lista não encheu; confirma que a flag
  **não vaza** em `JSON.stringify`/`Object.keys`/`spread`/`map`.
- **`bannerTrunc`** — gera o aviso "Resultado parcial…" só quando há truncagem.

## Arquivos
- `harness.js` — extrai as funções do `index.html` e injeta os mocks.
- `sbFetch.test.js` — os casos de teste e o placar.

> Observação: estes testes cobrem a camada de dados/utilitários. A renderização
> (DOM) e o PDF não são testados aqui — exigiriam um navegador headless.
