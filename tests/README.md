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
- `check.js` — **runner / gate de pré-publicação** (sintaxe + allowlist + deriva docs×código + testes).
- `harness.js` — ponte CommonJS para `src/data/*.mjs`; usado por `sbFetch.test.js` e
  `environment.test.js`. Era cópia verbatim da seção SUPABASE CONFIG (153 linhas, 12 `@canon`).
- `sbFetch.test.js` — casos de `sbFetch`/`marcarTrunc`/`bannerTrunc`.
- `pure.harness.js` — ponte CommonJS para `src/domain/*.mjs`: desde a Sessão 4 não copia mais
  nada (era cópia verbatim de 30 funções, 305 linhas).
- `pure.test.js` — casos das funções puras.
- `realtime.test.js` — guarda a sincronização `VIEW_TABLES`/`RT_TABLES` (extrai os literais do `app.js`).
- `backup_rest.rig.mjs` — paginação keyset, contagem, SHA-256 e headers das chaves opacas.
- `restore_rest.rig.mjs` — corrupção, confirmação do ref, destino vazio, ordem da FK e contagem final.

> `scripts/check_views.mjs` e `check_abas.mjs` também usam fixtures locais por desenho. Eles
> validam renderização determinística, não substituem um preview ligado a um banco restaurado.

## ⚠️ Regra de ouro: NÃO copie — extraia

Não há mais nenhuma cópia verbatim aqui. Os dois harness são **pontes**: `pure.harness.js` faz
`require` de `src/domain/*.mjs` e `harness.js` de `src/data/*.mjs`. O que os testes exercitam é,
literalmente, o mesmo código que o navegador executa.

**Precisa testar função que ainda mora no `app.js`? Extraia-a** para `src/domain/` (se for pura)
ou `src/data/` (se falar com a rede ou guardar cache), importe-a no `app.js`, faça `require` dela
no harness — e **reabra o arquivo no `.vercelignore`**, senão o portal inteiro para de executar
(import ES é atômico). Recolar uma cópia local é regressão, não atalho.

### O mecanismo `@canon`, e por que ele não existe mais

Enquanto o código não era modular, cada função testada tinha uma cópia à mão no harness, guardada
contra deriva por marcadores `/* @canon <nome> */` que o `tests/canon.js` extraía, o
`tests/drift.test.js` comparava e a §[2] do `check.js` cobrava. Funcionou: pegou deriva de
verdade, e a versão dele que só olhava a assinatura (e por isso deixava `matchEvent` passar com o
corpo trocado por `return false`) foi consertada depois de medida.

Ele foi **aposentado na Fase B do plano das fatias 3-4**, quando a última das 12 cópias saiu para
`src/data/`. Não foi corte de rigor — foi perda de objeto: `canon.js` (56 linhas),
`drift.test.js` (72), a §[2] do `check.js` (141) e 107 linhas do `harness.js` sumiram no mesmo
commit, **−376 no total**, sem que um único caso de teste deixasse de rodar. Fica registrado aqui
porque é o argumento central a favor de extrair em vez de podar: processo que existe para
compensar código não-modular morre quando o código vira módulo.

> Observação: estes testes cobrem a camada de dados/lógica pura. A renderização (DOM)
> e o PDF não são testados aqui — exigiriam um navegador headless.
