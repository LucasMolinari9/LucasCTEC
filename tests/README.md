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
- `environment.test.js` — matriz produção × teste (`HOSTS_PROD`, falha fechado).

### Bancadas (`*.rig.mjs`) — fora do `check.js`, rodadas à mão
Sobem um **stub de PostgREST** (servidor HTTP local) e um processo filho. Ficam fora do
`check.js` porque o contrato dele é ser offline **e sem efeitos**; elas são offline, mas têm
efeitos. Rode com `NO_PROXY=127.0.0.1 node tests/<arquivo>`.

- `backup_rest.rig.mjs` — prova que o backup pagina por **keyset** (não offset), monta a
  comparação lexicográfica da PK composta, e que dump incompleto **aborta** em vez de sair
  com cara de sucesso.
- `restore_rest.rig.mjs` — prova que o restore **não escreve** sem `--executar`, que SHA-256
  divergente / arquivo truncado / arquivo fora do manifest abortam **antes** de qualquer
  escrita, que a ordem de inserção respeita a FK (`tabela_vista_teste` antes de
  `tarifa_atual_teste`) e que contagem final divergente derruba o restore. É a bancada mais
  importante das duas: `restore_rest.mjs` é o **único script do repo que escreve no banco**.

## ⚠️ Regra de ouro (anti-drift)
Os harness **copiam o código do `app.js` à mão**. Ao **editar uma dessas funções
no `app.js`, atualize a cópia** no harness correspondente. O `check.js` tem uma
guarda que falha avisando "harness DESATUALIZADO" se um trecho canônico sumir do
`app.js` — mas ela cobre só os trechos listados; mantenha a disciplina.

> Observação: estes testes cobrem a camada de dados/lógica pura. A renderização (DOM)
> e o PDF não são testados aqui — exigiriam um navegador headless.
