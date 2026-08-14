# Testes — lógica pura do `app.js` (sem navegador, sem rede)

Testes unitários isolados (Node, **sem dependências**) da lógica do `app.js`.
Não precisam de navegador nem de rede: o `fetch` é mockado, o `AbortController` é o
nativo do Node, e as funções puras (formatação, busca, filtros) são copiadas
**verbatim** dos respectivos blocos do `app.js`.

## Como rodar

**Recomendado — roda tudo de uma vez (é o gate de pré-publicação):**
```bash
node tests/check.js
```
Esse comando: (1) valida a **sintaxe** do `app.js` sem
executá-lo; (2) confere que as cópias verbatim ainda batem com o `app.js`
(**guarda anti-drift**); (3) roda todos os `*.test.js`. Sai com código ≠ 0 se algo
falhar — **rode-o antes de cada publicação**.

As bancadas com servidor/processo filho ficam separadas e também rodam no workflow `ci.yml`:

```bash
NO_PROXY=127.0.0.1 node tests/backup_rest.rig.mjs
NO_PROXY=127.0.0.1 node tests/restore_rest.rig.mjs
```

Avulso (um arquivo só), se quiser:
```bash
cd tests
node sbFetch.test.js    # casos de sbFetch / marcarTrunc / bannerTrunc
node pure.test.js       # lógica pura (formatação, busca, filtros de negócio)
node realtime.test.js   # VIEW_TABLES ⊆ RT_TABLES + mapa canônico
```
Cada arquivo imprime seu próprio `==== PLACAR: N/N ====`; o total **autoritativo** sai do
`node tests/check.js` (não fixamos o número aqui de propósito — pinar contagem em prosa drifta a
cada teste novo).

## O que é coberto
- **`sbFetch`** — sucesso; retry em 5xx e 429; 4xx que **não** repete (lança a
  mensagem do corpo); erro de rede (`TypeError`) que repete até o limite; e
  **timeout** via `AbortController` (não trava).
- **`marcarTrunc`** — marca arrays cortados (`limit>=50` que veio cheia) com a flag
  **não-enumerável** `_trunc`/`_limite`; não marca quando o limite é pequeno (<50),
  ausente, ou a lista não encheu; confirma que a flag **não vaza** em
  `JSON.stringify`/`Object.keys`/`spread`/`map`.
- **`bannerTrunc`** — gera o aviso "Resultado parcial…" só quando há truncagem.
- **Formatação:** `fmtCode`, `fmtTime`, `fmtDate`, `fmtMoney`, `orDash`, `boolChip`.
- **Segurança/busca:** `esc` (escape HTML / XSS), `enc`, `norm` (acento+caixa).
- **Lógica de negócio:** `matchEvent` (filtro do histórico por texto/processo/ano),
  `groupBy`/`countBy` (agregação dos relatórios), `tabMatchesEvent`/`dispatchRealtime`
  (dispatch do Realtime por aba: a aba ativa recarrega ao vivo, as de segundo plano só
  ficam marcadas como desatualizadas).
- **Sincronização do Realtime** (`realtime.test.js`): `VIEW_TABLES` bate com o mapa canônico,
  toda tabela citada em `VIEW_TABLES` está em `RT_TABLES`, e `RT_TABLES` == a publicação esperada
  (a checagem **viva** contra o banco fica em `scripts/check_realtime.mjs`, que precisa de rede).

## Arquivos
- `check.js` — **runner / gate de pré-publicação** (sintaxe + anti-drift + testes).
- `harness.js` — cópia das funções do bloco SUPABASE CONFIG + mocks; usado por `sbFetch.test.js`.
- `sbFetch.test.js` — casos de `sbFetch`/`marcarTrunc`/`bannerTrunc`.
- `pure.harness.js` — cópia **verbatim** das funções puras (com a linha de origem citada).
- `pure.test.js` — casos das funções puras.
- `realtime.test.js` — guarda a sincronização `VIEW_TABLES`/`RT_TABLES` (extrai os literais do `app.js`).
- `backup_rest.rig.mjs` — paginação keyset, contagem, SHA-256 e headers das chaves opacas.
- `restore_rest.rig.mjs` — corrupção, confirmação do ref, destino vazio, ordem da FK e contagem final.

> `scripts/check_views.mjs` e `check_abas.mjs` também usam fixtures locais por desenho. Eles
> validam renderização determinística, não substituem um preview ligado a um banco restaurado.

## ⚠️ Regra de ouro (anti-drift)
Os harness ainda copiam à mão o código que continua dentro do `app.js`. **Ao editar uma função
que ainda estiver copiada, atualize a cópia** no harness correspondente, entre os marcadores
`/* @canon <nome> */ … /* @endcanon */`. O `check.js` §[2] compara o texto INTEIRO da cópia com o
`app.js` e falha nomeando quem divergiu.

O que já foi extraído para `src/domain/*.mjs` (hoje `core.mjs` e `agrupamento.mjs`) **não tem
cópia**: o `pure.harness.js` faz `require` do módulo real, que é a mesma implementação que o
navegador executa. **Extrair uma função é, portanto, apagar o bloco `@canon` dela** — não
atualizá-lo. A checagem de cobertura do `check.js` deriva sozinha os `export` de `src/domain/`
para distinguir import legítimo de cópia sem guarda, então não há lista a manter à mão; um
símbolo exportado pelo harness que não venha de um módulo e não esteja marcado reprova o gate.

> Observação: estes testes cobrem a camada de dados/lógica pura. A renderização (DOM)
> e o PDF não são testados aqui — exigiriam um navegador headless.
