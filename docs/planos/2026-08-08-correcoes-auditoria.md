# Correções da auditoria de 08/08/2026 — Plano de implementação

> **Para quem executa (humano ou agente):** os passos usam checkbox (`- [ ]`). Cada tarefa termina
> num commit e num entregável testável sozinho. Execute na ordem: a Fase 1 vem primeiro porque
> **enquanto ela não estiver pronta, o verde das outras é inconclusivo.**

---

## Estado da execução (atualizado em 08/08/2026, 3ª rodada)

| Tarefa | Estado | Onde |
|---|---|---|
| 1 — guarda anti-drift compara de verdade | ✅ **na `main`** | PR #106 |
| 2 — bancada projeta `select=` | ✅ **na `main`** | PR #106 (junto com a 3) |
| 3 — três fixtures faltantes | ✅ **na `main`** | PR #106 |
| 4 — `check_grants` e a visão perdida | ✅ **na `main`** | PR #106 |
| 5 a 8 — Fase 2 (baseline de restauração, ADR-0002) | ✅ **na `main`** | PR #113 — desbloqueada pelas medições de 09/08 |
| 9 — cache envenenado em `getEvLookups` | ✅ **na `main`** | PR #107 |
| 10 — três bypasses do seam | ✅ **na `main`** | PR #107 |
| 11 — seis listas `select=` duplicadas | ✅ **na `main`** | PR #107 |
| 12 — acessibilidade | ✅ **na `main`** | PR #107 |
| 13 — estado vazio ("não localizado") | ✅ **na `main`** | PR #107 |
| 21 — `marcarTrunc` e o teto do servidor | ✅ **na `main`** | PR #107 |
| 22 — contrato mínimo de conteúdo por view | ✅ **na `main`** | PR #108 |
| 14, 15, 16, 17, 19, 20 — Fase 4 | ✅ **na `main`** | PR #110 |
| 18 — runbook de ETL | ✅ **na `main`** | PR #110 criou o `docs/etl.md`; o vazio do §3 foi fechado pelo #113 |

> **Plano encerrado em 09/08/2026 — 22 de 22 tarefas na `main`.** Este arquivo deixa de ser
> normativo: o que continua valendo é a tabela de **backlog** no fim. Quando quiser saber o estado
> atual do projeto, leia o `CLAUDE.md`; a cronologia está em `docs/CHANGELOG.md`.

O PR **#109** não é tarefa deste plano: sincronizou o `CLAUDE.md` com o que os #107 e #108
mudaram.

**Para retomar:** **este plano acabou.** Todas as 22 tarefas estão entregues — as Fases 1, 3 e 4 e
a Task 22 na `main`; a Fase 2 no PR #113, desbloqueada pelas medições que o dono rodou no SQL
Editor em 09/08/2026. O que sobrou está na tabela de **backlog** no fim do arquivo, não aqui.

**O que as medições revelaram, e que nenhum rascunho tinha acertado:**

1. **O `anon` roda com `statement_timeout = 3s`, não 8s.** O rascunho da Task 5 propunha versionar
   `8s` — que é o valor do `authenticated`. Versionar o palpite teria triplicado, num restore, o
   tempo que uma consulta anônima pode segurar o banco, sem sintoma nenhum. A ordem do plano
   ("confirme os dois valores contra o banco vivo antes de commitar") é o que evitou isso.
2. **`rls_auto_enable()` simplesmente não existe.** A Task 7 previa dois desfechos — colar o DDL
   ou marcar como objeto de plataforma. Nenhum dos dois: não há função com esse nome, e nenhum dos
   6 event triggers do banco (todos do Supabase) tem relação com RLS. **Consequência real: não há
   automatismo ligando RLS em tabela nova** — quem lesse o `schema.md` concluiria o contrário.
3. **A staging NÃO é resíduo.** Contagens idênticas (20.753 nos três de evento, 2.100 nos três de
   portaria) com zero funções ou triggers mencionando-a: não existe rebuild automatizado, mas as
   duas cópias são mantidas em paralelo **pelo próprio import de CSV**. Ou seja, a regra do
   `CLAUDE.md` sobre replicar correção na staging está certa — só que o mecanismo é o dono, não
   uma função. Isso fecha o vazio declarado da Task 18.
4. **`tr_check_filters` é do Supabase** (`realtime.subscription`), não nosso. O único trigger do
   projeto é o `trg_vigor_auto`, já versionado.

O que a execução da Fase 4 apurou, e que contradiz o texto das tarefas:

- **O Step 4 da Task 14 já estava feito** (o `~62%` virou `~59%` no PR #108). Medido de novo:
  2.024/3.467 = **58,4%**.
- **A Task 16 destapou um fail-open real.** A guarda do PR #73 no `tests/check.js` cita dois dos
  arquivos movidos **pelo caminho** e pulava com `if (!existe(doc)) continue` — ao mover, ela
  parou de imprimir sem uma linha de aviso, e o gate seguiu verde com dois checks a menos.
  Corrigido junto: arquivo citado que some agora é falha.
- **A Task 15 mediu certo:** 36 entradas em `.claude/skills/` (15 diretórios + 21 symlinks).

**As medições, para quem quiser repetir** (somente leitura; rodadas em 09/08/2026 pelo dono):

```sql
select rolname, unnest(rolconfig) from pg_roles
  where rolname in ('authenticator','anon','authenticated');   -- Task 5
select proname, prokind, pronamespace::regnamespace from pg_proc
  where proname ilike '%rls%';                                  -- Task 7
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prokind = 'f'
    and pg_get_functiondef(p.oid) ilike any (array['%evento_dados%','%portaria_data%']);
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal;  -- Task 18
```

### Divergências entre o plano e o que a execução apurou

Registradas porque contradizem o texto das tarefas abaixo — **acredite nesta lista, não no
texto original** quando os dois discordarem:

1. **Task 1 — são 4 adaptações declaradas, não 3, e só 1 importa.** `SB_TIMEOUT_MS` é `let` no
   harness e `const` no `app.js` (o teste de timeout precisa encurtá-lo) — o levantamento não a
   viu porque o regex só olhava `function` e `const`. Em compensação, `SB_URL`/`SB_KEY`/`SB`
   **não são exportados** pelo harness, e a regra vale para exports: sobrou **uma** adaptação.
2. **Task 1 — o inseridor de marcadores erra em dois casos**, e os dois falham alto (nunca em
   silêncio): declaração sem nenhum bracket (`const MAX_TABS = 5;`) e declaração que termina com
   comentário na mesma linha (`let SB_TIMEOUT_MS = 20000;   // …`). O literal de regex do `esc`
   (`/[&<>"']/g`, com aspas dentro) quebra qualquer scanner ingênuo — marque à mão.
3. **Tasks 2 e 3 foram um commit só.** Separadas, a Task 2 deixa o `check_views` vermelho até a 3
   entrar — a ausência das 3 colunas era justamente o que passava invisível. O repo tem a regra
   "só publique tudo verde"; commit que quebra a árvore a contraria.
4. **Task 11 — as constantes do texto original estavam ERRADAS.** Foram escritas a partir da
   tabela do relatório, não do código. Os valores corretos estão na versão atual da tarefa, e a
   armadilha é real: as mesmas tabelas têm call sites com listas **deliberadamente menores**
   (`getTerminais`, `filtrarFrotaEmpresas`) que **não** podem ser colapsadas.
5. **O `deploy-smoke` roda de fato.** O backlog registrava como hipótese que ele talvez nunca
   disparasse; um run verde em 08/08 às 10:13 desmentiu. Item encerrado.
6. **O fail-open do `check_grants` era pior que o descrito.** Com `default_privileges` vazio, o
   gate não passava só em silêncio: anunciava *"Resolvido desde o baseline — rode
   `--atualizar-baseline`"*. Perder a visão do banco **parecia progresso**, e seguir a sugestão
   apagaria o registro da exceção 9.1.
7. **Task 12 — `.side-eyebrow` NÃO reprovava; a auditoria mediu contra o fundo errado.** O texto
   `#7d93ab` mede **4,62:1** sobre o fundo real da coluna (`--navy-deep`, `#072a49`) e passa no AA.
   Os 3,69:1 do relatório saem de medir contra `--navy` (`#0a3a63`), que não é o fundo dali. A cor
   ficou como estava — clareá-la seria mexer na identidade visual à toa — e a medição virou
   comentário no `styles.css`, para a próxima leitura do relatório não "consertar" de novo. **São
   dois contrastes a corrigir, não três.**
8. **Task 12 — `<select>` com label implícito é seguro.** A dúvida legítima era o nome acessível
   herdar o texto das `<option>` (o `textContent` do `<label>` herda). Medido com o
   `page.accessibility.snapshot()` do Chromium: `ANO` e `SITUAÇÃO`, limpos. Não foi preciso trocar
   por `for=`/`id`, que nesta faixa custaria ids únicos por aba (os panes de segundo plano têm os
   ids recolhidos por `stripIds`).
9. **Task 13 — a segunda frase ficou de fora, e o escopo cresceu de 5 mensagens para 9.** A frase
   proposta (*"informe o código da linha ao DIVAT"*) promete um canal de retorno que o **próprio
   backlog deste plano** lista como decisão pendente de endereço/processo — escrevê-la seria
   apontar o cidadão para uma porta que não existe. Em compensação, o critério "toda mensagem que
   responde por linha **já escolhida**" pega 9 sites, não 5: entrou o **Histórico**, e
   `evento_teste` é justamente a tabela com mais órfãs (7). As mensagens por **empresa** ficaram
   de fora de propósito — `codempresa` órfã não é medida por gate nenhum hoje (está no backlog).
10. **Task 21 — o comentário prescrito apontava para um arquivo que ainda não tem o valor.** O
    texto manda `SB_MAX_ROWS` "bater com o valor versionado em `docs/backup_schema.sql`", mas
    versionar esse valor **é a Task 5**, que está bloqueada. O comentário no `app.js` aponta para o
    `CLAUDE.md` (onde o teto está documentado) e registra a pendência. **Ao executar a Task 5,
    volte no `marcarTrunc` e acrescente o `backup_schema.sql` ao comentário.**
11. **Task 22 — duas das três views que ela acusa NÃO estão vazias, e `<tbody> <tr>` é a régua
    errada para elas.** Medido no navegador em 08/08/2026, contra as fixtures da bancada:
    `historicoLinha` renderiza **4 `.ev-block`** (o Histórico não usa tabela, usa blocos) e `frota`
    renderiza os **KPIs** da linha (`12 OPERACIONAL`, `4 COMUM (A)`, …), que também não são tabela.
    As duas têm conteúdo de verdade; o `tabelas=0` do laço é a unidade de medida errada, não
    defeito. Só `historicoEmpresa` está de fato só com a moldura (`DIVAT · HISTÓRICO DA EMPRESA` +
    o campo Buscar), e por ser painel de busca — precisa de termo antes de mostrar qualquer coisa,
    que é o que o campo `busca` da tarefa já prevê. **Consequência para quem executar: o mínimo por
    view tem de ser expresso na unidade de cada uma** (linhas de tabela, blocos de evento, KPIs) —
    uma contagem única de `<tbody> <tr>` reprovaria `historicoLinha` e `frota` por um defeito
    inexistente, que é exatamente o tipo de vermelho que ensina a ignorar gate.

---

**Origem:** `docs/historico/analise-2026-08-08-auditoria-completa.md` (snapshot da auditoria).

**Objetivo:** fechar os dois furos no centro da rede de testes, tirar da baseline de restauração as
três derivas que só doem no dia do desastre, corrigir os bugs confirmados do frontend e alinhar a
documentação ao código.

**Arquitetura da correção:** nenhuma mudança de arquitetura. O projeto continua zero-build, três
arquivos de frontend, testes em Node puro sem dependências. Duas asserções mal desenhadas são
substituídas por asserções que de fato comparam; o resto é conserto pontual e texto.

**Tech stack:** Node 20 (sem `package.json`), Playwright fixo (só no CI e nos scripts de navegador),
Semgrep, Supabase/PostgREST, Vercel.

## Restrições globais (valem para toda tarefa)

- **Zero-build.** Não criar `package.json`, não adicionar dependência, não fatiar `app.js` em módulos.
- **`tests/check.js` é offline e sem dependências.** Nada que precise de rede entra nele.
- **CSP:** proibido `<script>` inline no `index.html` e atributo `style=` em markup. Estilo novo é
  classe no `styles.css`; o que for dinâmico usa CSSOM (`el.style.x`, `setProperty`).
- **JS novo vai no `app.js`; CSS novo vai no `styles.css`.**
- **Banco:** nunca conceder escrita a `anon`/`authenticated`. Nenhuma tarefa aqui altera dado nem
  estrutura do banco vivo — as tarefas de banco mexem só em **arquivo versionado**.
- **Branch:** trabalhar em branch, nunca direto na `main`. Push na branch gera preview.
- **Gate de saída de toda tarefa:** `node tests/check.js` verde. Tarefas que tocam render/loader
  também rodam `node scripts/check_views.mjs`.
- **Não fechar issue sem o gate correspondente verde.**

## Estrutura de arquivos

| Arquivo | Responsabilidade | Fases que tocam |
|---|---|---|
| `tests/check.js` | gate offline; passa a comparar cópias de verdade | 1, 4 |
| `tests/pure.harness.js`, `tests/harness.js` | cópias verbatim; ganham marcadores | 1 |
| `scripts/lib/rig.mjs` | bancada headless; passa a projetar `select=` | 1 |
| `scripts/check_grants.mjs` | gate de grants; ganha guard de visão perdida | 1 |
| `docs/backup_schema.sql` | baseline de reconstrução | 2 |
| `docs/adr/0002-ambiente-de-teste-isolado.md` | ADR normativo errado | 2 |
| `app.js` | bugs do frontend, acessibilidade, `select=` duplicados | 3 |
| `index.html`, `styles.css` | acessibilidade e contraste | 3 |
| `CLAUDE.md`, `docs/*.md` | derivas e reorganização | 4 |

---

# FASE 1 — Devolver sentido ao verde

Quatro tarefas, todas de esforço P. É a fase com maior retorno do projeto.

---

### Task 1: Guarda anti-drift que compara de verdade

**O problema.** `tests/check.js:211` é `js.includes(snippet)` com trechos escritos à mão, e 15 dos 50
trechos são só a assinatura da função. Medido: com o corpo de `matchEvent` trocado por `return
false`, o gate imprime "tudo verde".

**A solução.** Marcar cada cópia no harness e comparar **o texto inteiro da cópia** contra o
`app.js`. Sem parser, sem contagem de chaves — a contagem de chaves é justamente a armadilha (ao
sondar isto na auditoria, um extrator ingênuo deu 6 falsos negativos em funções de uma linha).

**Ponto de partida medido:** 48 das 52 cópias já são byte a byte idênticas ao `app.js`. As 4
restantes são `situacaoHTML` (idêntica; falso negativo de extrator ingênuo) e `SB_URL`/`SB_KEY`/`SB`,
que são **adaptações deliberadas** já documentadas em `tests/harness.js:1-4`. Por isso o desenho
precisa de uma forma explícita de declarar adaptação.

**Files:**
- Create: `tests/canon.js` (extrator + conferidor, módulo próprio)
- Modify: `tests/pure.harness.js` (marcadores em volta de cada cópia)
- Modify: `tests/harness.js` (idem, + 3 adaptações declaradas)
- Modify: `tests/check.js:140-230` (substituir a lista `canon` e o laço)

**Interfaces:**
- Produz: `tests/canon.js` exportando `extrairCanon(src) -> Map<nome, { texto, adaptado }>` e
  `conferirCanon(mapa, js) -> string[]` (nomes fora de sincronia).

> **Por que módulo próprio e não dentro do `check.js`:** o `check.js` roda o gate inteiro no topo do
> arquivo. Um `require('./check.js')` a partir do teste executaria o gate como efeito colateral.
> `tests/canon.js` não faz nada ao ser importado.

- [ ] **Step 1: Escrever o teste que falha — sabotagem detectada**

Criar `tests/drift.test.js` (CommonJS, como todos os `*.test.js` deste repo — o `check.js:560`
descobre por `endsWith('.test.js')` e roda com `spawnSync(node, arquivo)`):

```js
'use strict';
/* Prova que a guarda anti-drift detecta corpo divergente, não só assinatura.
   Roda sobre CÓPIAS em memória: não toca os arquivos do repo. */
const { extrairCanon, conferirCanon } = require('./canon.js');

let ok = 0, falhas = [];
const t = (nome, cond) => cond ? ok++ : falhas.push(nome);

const harness = `
/* @canon matchEvent */
function matchEvent(r, c){
  return r.ano === c.ano;
}
/* @endcanon */
`;
const appIgual   = 'function matchEvent(r, c){\n  return r.ano === c.ano;\n}';
const appMutado  = 'function matchEvent(r, c){\n  return false;\n}';

const mapa = extrairCanon(harness);
t('extrai 1 cópia',            mapa.size === 1);
t('extrai o corpo inteiro',    mapa.get('matchEvent').texto.includes('return r.ano === c.ano;'));
t('cópia igual passa',         conferirCanon(mapa, appIgual).length === 0);
t('corpo mutado é PEGO',       conferirCanon(mapa, appMutado).length === 1);

const adaptado = `
/* @canon-adaptado SB_URL — aponta para host falso para o teste não bater no projeto real */
const SB_URL = 'https://example.invalid';
/* @endcanon */
`;
t('adaptação não é cobrada', conferirCanon(extrairCanon(adaptado), 'const SB_URL = "outra";').length === 0);

console.log(falhas.length ? `drift.test.js — FALHAS: ${falhas.join(', ')}` : `drift.test.js — placar ${ok}/${ok}`);
process.exit(falhas.length ? 1 : 0);
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node tests/drift.test.js
```

Esperado: `Error: ... extrairCanon is not a function` — as funções ainda não existem.

- [ ] **Step 3: Implementar o extrator e o conferidor em `tests/canon.js`**

Criar `tests/canon.js`:

```js
'use strict';
/* Extrai as cópias marcadas de um harness.
   Marcadores: `/* @canon <nome> */` … `/* @endcanon */` — e a variante
   `@canon-adaptado <nome> — <por quê>` para cópia que MUDA de propósito
   (as constantes de conexão do harness.js apontam para host falso).
   Sem parser e sem contagem de chaves: a fronteira é o marcador, que não
   depende de a função ser de uma linha ou de trinta. */
function extrairCanon(src){
  const mapa = new Map();
  const re = /\/\*\s*@canon(-adaptado)?\s+([A-Za-z_$][\w$]*)[^*]*\*\/\n([\s\S]*?)\n\/\*\s*@endcanon\s*\*\//g;
  let m;
  while ((m = re.exec(src)) !== null){
    mapa.set(m[2], { texto: m[3], adaptado: !!m[1] });
  }
  return mapa;
}

/* Devolve a lista de nomes cuja cópia NÃO aparece no app.js. Adaptadas são puladas. */
function conferirCanon(mapa, js){
  const fora = [];
  for (const [nome, { texto, adaptado }] of mapa){
    if (adaptado) continue;
    if (!js.includes(texto)) fora.push(nome);
  }
  return fora;
}

module.exports = { extrairCanon, conferirCanon };
```

E no `tests/check.js`, junto dos outros `require` do topo:

```js
const { extrairCanon, conferirCanon } = require('./canon.js');
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
node tests/drift.test.js
```

Esperado: `drift.test.js — placar 5/5`.

- [ ] **Step 5: Marcar as cópias nos dois harness**

Em `tests/pure.harness.js` e `tests/harness.js`, envolver **cada** bloco copiado:

```js
/* @canon matchEvent */
function matchEvent(r, c){
  …corpo verbatim…
}
/* @endcanon */
```

As três adaptações de `tests/harness.js:6-8` usam a variante e dizem por quê:

```js
/* @canon-adaptado SB_URL — host falso: o teste não pode alcançar o projeto real */
const SB_URL = 'https://example.invalid';
/* @endcanon */
/* @canon-adaptado SB_KEY — chave falsa, mesmo motivo */
const SB_KEY = 'fake-anon-key';
/* @endcanon */
/* @canon-adaptado SB — derivada das duas acima */
const SB = { url: SB_URL, key: SB_KEY };
/* @endcanon */
```

- [ ] **Step 6: Trocar o laço do `canon` pelo novo**

Substituir `tests/check.js:210-213` por:

```js
const copias = new Map([...extrairCanon(pureHarnessSrc), ...extrairCanon(harnessSrc)]);
const foraDeSincronia = conferirCanon(copias, js);
for (const [nome, { adaptado }] of copias){
  if (foraDeSincronia.includes(nome)) fail(`cópia DIVERGE do app.js: "${nome}" — o harness testa código que o app.js não tem mais`);
  else okline(adaptado ? `${nome} (adaptada de propósito)` : nome);
}
```

Manter a meta-guarda logo abaixo, trocando o critério: **todo símbolo exportado pelo harness precisa
ter marcador** (antes era "precisa ter entrada no `canon`"). Remover a lista `canon` inteira
(`tests/check.js:140-209`) — ela deixa de existir.

- [ ] **Step 7: Rodar o gate inteiro**

```bash
node tests/check.js
```

Esperado: verde, com ~52 linhas de cópia conferida (3 marcadas "adaptada de propósito").
**Se alguma acusar divergência, é achado real** — decida caso a caso: ou o `app.js` mudou e a cópia
ficou para trás (atualize a cópia e confira se o teste dela ainda faz sentido), ou a cópia foi
editada indevidamente (reponha o texto do `app.js`).

- [ ] **Step 8: Provar que a sabotagem original agora é pega**

```bash
cp -r . /tmp/prova && cd /tmp/prova
python3 - <<'PY'
src=open('app.js').read()
i=src.index('function matchEvent(r, c){'); f=src.index('\n}\n', i)+3
open('app.js','w').write(src[:i] + 'function matchEvent(r, c){\n  return false;\n}\n' + src[f:])
PY
node tests/check.js; echo "EXIT=$?"
cd - && rm -rf /tmp/prova
```

Esperado: `EXIT=1` com `cópia DIVERGE do app.js: "matchEvent"`. **Antes desta tarefa isso saía
`EXIT=0` e "tudo verde".**

- [ ] **Step 9: Commit**

```bash
git add tests/check.js tests/pure.harness.js tests/harness.js tests/drift.test.js
git commit -m "test: guarda anti-drift compara a cópia inteira, não a assinatura

js.includes(snippet) com trecho escrito à mão sondava só a assinatura em 15
das 50 entradas. Com o corpo de matchEvent trocado por 'return false' o gate
saía verde. Marcadores @canon delimitam a cópia; a comparação passa a ser do
texto inteiro. Três constantes de conexão são @canon-adaptado, com o motivo
declarado no próprio marcador."
```

---

### Task 2: A bancada headless projeta `select=` e recusa coluna inexistente

**O problema.** `scripts/lib/rig.mjs:215` pula `select` — a fixture volta inteira e coluna
inexistente não dá erro. Em produção o PostgREST responde `400`. Medido na auditoria: trocar um nome
de coluna no `select=` mantém as 17 views verdes.

**Fato que simplifica:** todo `select=` do `app.js` é lista simples de colunas — zero `select=*`,
zero agregação, zero embed (`grep` conferido).

**Files:**
- Modify: `scripts/lib/rig.mjs:209-246` (`serve`)
- Modify: `scripts/lib/rig.mjs:251-260` (`launchPage`, para propagar o 400)
- Test: `tests/rig.test.js` (novo)

**Interfaces:**
- Consome: `FIXTURES` (mesmo módulo).
- Produz: `serve(table, qs)` passa a devolver `{ status, body }` em vez de array cru.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/rig.test.js`. **Atenção ao formato:** o repo não tem `package.json`, então `.js` é
CommonJS e um `import` estático quebraria; e o `check.js:560` só descobre arquivos terminados em
`.test.js`. A saída é `import()` dinâmico dentro de uma IIFE assíncrona — CJS consegue carregar o
`rig.mjs` (que é ESM) assim.

```js
'use strict';
/* Contrato da bancada headless: projeção de select= e 400 para coluna inexistente.
   Rode: node rig.test.js   (ou, melhor, node check.js para rodar tudo). */
(async () => {
  const { serve } = await import('../scripts/lib/rig.mjs');

  let ok = 0; const falhas = [];
  const t = (nome, cond) => cond ? ok++ : falhas.push(nome);

  const r1 = serve('municipio_teste', 'select=cod_ibge,nome_municipio');
  t('status 200',               r1.status === 200);
  t('projeta só o pedido',      Object.keys(r1.body[0]).join(',') === 'cod_ibge,nome_municipio');

  const r2 = serve('municipio_teste', 'select=cod_ibge,coluna_que_nao_existe');
  t('coluna ausente → 400',     r2.status === 400);
  t('mensagem nomeia a coluna', String(r2.body.message).includes('coluna_que_nao_existe'));

  const r3 = serve('municipio_teste', '');
  t('sem select devolve tudo',  r3.status === 200 && r3.body.length > 0);

  console.log(falhas.length ? `rig.test.js — FALHAS: ${falhas.join(', ')}` : `rig.test.js — placar ${ok}/${ok}`);
  process.exit(falhas.length ? 1 : 0);
})();
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node tests/rig.test.js
```

Esperado: falha em `status 200` (hoje `serve` devolve array, e `r1.status` é `undefined`).

- [ ] **Step 3: Implementar a projeção**

Substituir o fim de `serve` (`scripts/lib/rig.mjs:244-246`) por:

```js
  const limit = Number(params.get('limit'));
  if (limit > 0) rows = rows.slice(0, limit);

  /* Projeção do `select=`. O PostgREST responde 400 para coluna inexistente; a bancada
     precisa fazer o mesmo, senão um rename no app.js passa verde pelas 17 views e só
     quebra em produção — o modo de falha que o CLAUDE.md chama de "o pior possível".
     Todo `select=` do app.js é lista simples de colunas (sem *, sem agregação, sem embed). */
  const select = params.get('select');
  if (!select) return { status: 200, body: rows };

  const pedidas = decodeURIComponent(select).split(',').map(s => s.trim()).filter(Boolean);
  const conhecidas = new Set(Object.keys((FIXTURES[table] || [{}])[0] || {}));
  const ausentes = pedidas.filter(c => !conhecidas.has(c));
  if (ausentes.length) {
    return {
      status: 400,
      body: { code: '42703', message: `column "${ausentes[0]}" does not exist`,
              hint: `fixture de ${table} não tem: ${ausentes.join(', ')}` },
    };
  }
  return { status: 200, body: rows.map(r => Object.fromEntries(pedidas.map(c => [c, r[c]]))) };
```

- [ ] **Step 4: Propagar o status no `launchPage`**

Em `scripts/lib/rig.mjs`, dentro de `page.route('**/rest/v1/**', …)`:

```js
  await page.route('**/rest/v1/**', route => {
    const u = new URL(route.request().url());
    const res = serve(u.pathname.split('/rest/v1/')[1], u.search.slice(1));
    route.fulfill({
      status: res.status, contentType: 'application/json',
      body: JSON.stringify(res.body),
    });
  });
```

Ajustar `serveRpc` para também devolver `{ status: 200, body: … }`, e o `return []` final de
`serveRpc` para `{ status: 200, body: [] }`.

- [ ] **Step 5: Rodar os testes**

```bash
node tests/rig.test.js && node scripts/check_views.mjs
```

Esperado: `rig.test.js — placar 5/5`. O `check_views` **vai ficar vermelho** em `historicoEmpresa`
e `localidades` — é a Task 3 aparecendo. Registre quais falharam e siga.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/rig.mjs tests/rig.test.js
git commit -m "test: bancada headless projeta select= e recusa coluna inexistente

rig.mjs pulava 'select' e devolvia a fixture inteira, então trocar um nome de
coluna no app.js mantinha as 17 views verdes enquanto o PostgREST responderia
400 em produção. serve() passa a projetar as colunas pedidas e a devolver
{status,body}, com 400 para coluna ausente na fixture."
```

---

### Task 3: Completar as três fixtures que faltam

**O problema.** Três colunas pedidas em produção não existem nas fixtures. Depois da Task 2 elas
viram 400 e derrubam o `check_views` — que é o comportamento certo, e agora precisa de dado.

| Coluna | Pedida em | Fixture |
|---|---|---|
| `codempresa_teste.processo` | `app.js:1943` <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram --> | `rig.mjs:121-124` |
| `codempresa_teste.data_publicacao` | `app.js:1943` <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram --> | idem |
| `tarifa_atual_teste.nome_ligacao_cresc` | `app.js:2609` <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram --> | fixture de tarifa |

**Files:**
- Modify: `scripts/lib/rig.mjs:121-124` e a fixture de `tarifa_atual_teste`

- [ ] **Step 1: Confirmar que hoje falha**

```bash
node scripts/check_views.mjs historicoEmpresa
```

Esperado (após Task 2): FALHA com `column "processo" does not exist`.

- [ ] **Step 2: Acrescentar as colunas**

Em `scripts/lib/rig.mjs`, substituir a fixture de `codempresa_teste`:

```js
  codempresa_teste: [
    { codempresa: '101', nome_empresa: 'VIACAO ALFA', situacao: 'REGULAR', cassada: false, sob_intervencao: false,
      processo: 'E-10/004/1998', data_publicacao: '1998-11-20' },
    { codempresa: '102', nome_empresa: 'VIACAO BETA', situacao: 'REGULAR', cassada: false, sob_intervencao: false,
      processo: 'E-10/005/2005', data_publicacao: '2005-03-14' },
  ],
```

Em cada linha da fixture de `tarifa_atual_teste`, acrescentar `nome_ligacao_cresc` com o nome no
sentido crescente (ex.: para `nome_ligacao: 'RIO DE JANEIRO - NITEROI'`, usar
`nome_ligacao_cresc: 'NITEROI - RIO DE JANEIRO'`).

- [ ] **Step 3: Rodar as 17 views**

```bash
node scripts/check_views.mjs && node scripts/check_abas.mjs && node scripts/check_selecao_linha.mjs
```

Esperado: os três verdes.

- [ ] **Step 4: Provar que o rename agora é pego**

```bash
cp -r . /tmp/prova2 && cd /tmp/prova2
sed -i 's/select=nome_empresa,situacao,processo,/select=nome_empresa,situacao,processo_XX,/' app.js
node scripts/check_views.mjs historicoEmpresa; echo "EXIT=$?"
cd - && rm -rf /tmp/prova2
```

Esperado: `EXIT=1`. **Antes da Task 2 isso saía verde.**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/rig.mjs
git commit -m "test: fixtures ganham as 3 colunas que produção pede e a bancada não tinha

codempresa_teste.processo/.data_publicacao (historicoEmpresa) e
tarifa_atual_teste.nome_ligacao_cresc (localidades) eram selecionadas em
produção e ausentes da fixture: as views renderizavam undefined e passavam."
```

---

### Task 4: `check_grants.mjs` para de aceitar visão perdida em funções e defaults

**O problema.** `scripts/check_grants.mjs:83-86` aborta quando a RPC devolve zero tabelas, com o
raciocínio certo escrito no código — *"Isso não é 'tudo certo', é visão perdida"*. O mesmo não vale
para `funcoes` e `default_privileges`: lista vazia passa como "nenhum achado", justamente nos dois
eixos onde mora o risco 9.1 (defaults do `supabase_admin`, não fecháveis).

**Files:**
- Modify: `scripts/check_grants.mjs:83-86`
- Test: `tests/check_grants.rig.mjs` (bancada já existe)

- [ ] **Step 1: Escrever o caso na bancada existente**

Em `tests/check_grants.rig.mjs`, acrescentar um cenário com `funcoes: []` e
`default_privileges: []` (e `tabelas` populada), esperando `EXIT=1`.

- [ ] **Step 2: Rodar e ver falhar**

```bash
node tests/check_grants.rig.mjs
```

Esperado: o cenário novo falha — hoje o script sai `0`.

- [ ] **Step 3: Estender o guard**

Substituir `scripts/check_grants.mjs:83-86` por:

```js
/* Lista vazia não é "tudo certo", é visão perdida — vale para os TRÊS eixos, não só
   para tabelas. `funcoes` e `default_privileges` são exatamente onde mora o risco 9.1
   (os defaults do supabase_admin, que não são fecháveis): perder visão ali e imprimir
   "nenhum achado" é o pior resultado possível. */
for (const campo of ['tabelas', 'funcoes', 'default_privileges']) {
  if (!forma[campo].length) {
    console.error(`A RPC não devolveu nenhum item em '${campo}'. Isso não é "tudo certo", é visão perdida — abortando.`);
    process.exit(1);
  }
}
```

- [ ] **Step 4: Rodar a bancada**

```bash
node tests/check_grants.rig.mjs
```

Esperado: verde, incluindo o cenário novo.

- [ ] **Step 5: Commit**

```bash
git add scripts/check_grants.mjs tests/check_grants.rig.mjs
git commit -m "fix(gate): visão perdida em funcoes/default_privileges também aborta

O guard de 'lista vazia não é tudo certo' existia só para tabelas. Funções e
default privileges são os dois eixos do risco 9.1 — perder visão ali e
imprimir 'nenhum achado' era o pior resultado possível."
```

- [ ] **Step 6: Abrir PR da Fase 1 e conferir os gates**

```bash
git push -u origin <branch>
```

Conferir na aba Actions: `ci`, `views`, `semgrep` verdes.

---

# FASE 2 — Fechar o que dói no dia do restore

Nenhuma tarefa desta fase muda o comportamento do portal. Todas mexem em **arquivo versionado**, não
no banco vivo.

---

### Task 5: Versionar os `ALTER ROLE` que a baseline esqueceu

**O problema.** `grep` por `db_max_rows|statement_timeout|ALTER ROLE|authenticator` em
`docs/backup_schema.sql` devolve **0 ocorrências**. `pgrst.db_max_rows = 30000` é citado no
`CLAUDE.md:80` como controle ativo e é o teto que impede varredura pela chave pública. Restaurar
pela baseline devolve o banco **sem teto**, e o portal continua normal — a perda é silenciosa.

**Files:** Modify: `docs/backup_schema.sql` (fim do arquivo, junto dos outros `REVOKE`/`GRANT`)

- [ ] **Step 1: Acrescentar o bloco**

```sql
-- ============================================================================
-- LIMITES DE ROLE (PostgREST + timeout)
-- Não são objetos de schema, então não vinham no dump — e por isso sumiam num
-- restore, sem sintoma nenhum: o portal continua funcionando (todo `limit` do
-- app.js é <= 30000) e o que se perde é a proteção contra varredura da base
-- pela chave pública, que é o item SEC-02 de docs/seguranca.md.
-- Ao criar consulta com `limit` maior, suba este teto NA MESMA TAREFA.
-- ============================================================================
ALTER ROLE authenticator SET pgrst.db_max_rows = '30000';
ALTER ROLE anon SET statement_timeout = '8s';
NOTIFY pgrst, 'reload config';
```

> ⚠️ **Confirme os dois valores contra o banco vivo antes de commitar** — o ambiente do agente não
> alcança o Supabase. No SQL Editor: `select rolname, rolconfig from pg_roles where rolname in
> ('authenticator','anon');`. Se o `statement_timeout` do `anon` for diferente de `8s`, use o valor
> real; se não existir, remova a linha em vez de inventar um.

- [ ] **Step 2: Conferir que o gate segue verde**

```bash
node tests/check.js
```

- [ ] **Step 3: Commit**

```bash
git add docs/backup_schema.sql
git commit -m "fix(dr): baseline versiona db_max_rows e statement_timeout

Nenhum dos dois vinha no dump por não serem objetos de schema. Um restore
devolvia o banco sem teto de linhas, e sem sintoma: o portal continua normal
porque todo limit do app.js é <= 30000. O que se perdia era o SEC-02."
```

---

### Task 6: Alinhar os 7 `GRANT EXECUTE` da baseline ao contrato de migração

**O problema.** `docs/backup_schema.sql` tem 7 `GRANT EXECUTE … TO anon, authenticated` (linhas 316,
341, 364, 470, 504, 522, 602) — padrão que a regra (e) do `check_migrations.mjs:67-69` **reprova**
numa migração. Quatro deles são RPCs de auditoria que a fase 3 move para `audit`.

**Por que isso não quebra nada:** `anon` continua executando as duas funções de produto; o que sai é
`authenticated`, que não tem policy nenhuma `TO authenticated` e cujo signup está fechado.

**Files:** Modify: `docs/backup_schema.sql:316,341,364,470,504,522,602`

- [ ] **Step 1: Trocar as duas funções de produto**

```sql
GRANT EXECUTE ON FUNCTION public.f_unaccent(text) TO anon;
GRANT EXECUTE ON FUNCTION public.divat_busca_logradouro(text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.divat_linhas_regiao(text, text) TO anon;
```

- [ ] **Step 2: Marcar as 4 de auditoria como transitórias**

Nas linhas 470, 504, 522 e 602, manter o `GRANT` (a produção ainda depende delas para os gates
diários) e acrescentar acima de cada uma:

```sql
-- TRANSITÓRIO: esta RPC de diagnóstico sai de `public` quando a fase 3 for promovida
-- (ver docs/planos/fase-3-hardening-moderado.md). Enquanto os quatro gates diários a
-- chamarem como anon, ela precisa continuar aqui. Remover JUNTO com a migração dos gates.
```

- [ ] **Step 3: Commit**

```bash
git add docs/backup_schema.sql
git commit -m "fix(dr): baseline para de conceder EXECUTE a authenticated

Sete GRANT EXECUTE ... TO anon, authenticated contrariavam a regra (e) do
check_migrations.mjs, que o próprio repo aplica a migrações. As duas funções
de produto passam a conceder só a anon; as quatro de diagnóstico ficam
marcadas como transitórias até a fase 3 ser promovida."
```

---

### Task 7: Registrar `rls_auto_enable()`

**O problema.** `docs/schema.md:161,179` documenta a função como parte de `public` e **não há DDL
dela em lugar nenhum do repo**. Numa reconstrução ela some.

**Files:** Modify: `docs/backup_schema.sql` ou `docs/schema.md`

- [ ] **Step 1: Descobrir o que ela é** — no SQL Editor:

```sql
select prosrc, proowner::regrole from pg_proc where proname = 'rls_auto_enable';
select evtname, evtevent from pg_event_trigger;
```

- [ ] **Step 2: Decidir e registrar** — se for função do projeto, colar o DDL no
`backup_schema.sql` junto das demais funções; se for objeto de plataforma, trocar a menção em
`docs/schema.md:161` por uma nota dizendo que é gerenciada pelo Supabase e não é reconstruída pela
baseline.

- [ ] **Step 3: Commit**

```bash
git add docs/backup_schema.sql docs/schema.md
git commit -m "docs(dr): rls_auto_enable deixa de ser função fantasma na baseline"
```

---

### Task 8: Corrigir o ADR-0002 (o achado de documentação mais perigoso)

**O problema.** `docs/adr/0002-ambiente-de-teste-isolado.md:9-10` afirma que "somente
`divatdetro.vercel.app` … usa produção". `app.js:42-44` tem **três hosts**, e o comentário logo acima
(`app.js:38-41`) explica que até 29/07 só o canônico estava lá e **os outros dois serviam conteúdo de
produção lendo o banco de teste** — "o sintoma é o pior possível: dado errado na tela, sem erro
nenhum". É um ADR normativo: quem o seguir recria o bug.

**Files:** Modify: `docs/adr/0002-ambiente-de-teste-isolado.md:9-10`

- [ ] **Step 1: Reescrever a decisão**

```markdown
**Decisão:** o Portal DIVAT usa o projeto Supabase `divat - TESTE`
(`gontnlfmothfglssbyyk`) para previews e desenvolvimento. O `app.js` escolhe o projeto pelo
hostname: os **três** domínios de produção registrados em `HOSTS_PROD` — o canônico
(`divatdetro.vercel.app`), o alias do time e o alias da branch `main` — usam produção;
qualquer outro host usa teste. **Ao adicionar domínio no painel da Vercel, adicione-o a
`HOSTS_PROD` na mesma tarefa:** até 29/07/2026 só o canônico estava lá, e os outros dois
serviam conteúdo de produção lendo o banco de TESTE, sem erro visível. A seleção é
fail-closed: configuração incompleta interrompe a inicialização em vez de recorrer ao
banco de produção.
```

- [ ] **Step 2: Conferir contra o código**

```bash
sed -n '42,44p' app.js   # confirmar que continuam 3 e que os nomes batem
node tests/check.js && node tests/environment.test.js
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0002-ambiente-de-teste-isolado.md
git commit -m "docs(adr): ADR-0002 passa a descrever os 3 hosts de produção

O ADR ficou congelado na versão anterior ao achado de 29/07 e afirmava que só
o canônico usa produção. É normativo: quem o seguisse removeria os outros dois
de HOSTS_PROD e recriaria o bug de produção lendo o banco de teste."
```

---

# FASE 3 — Bugs confirmados e acessibilidade

---

### Task 9: Cache envenenado em `getEvLookups`

**O problema.** `app.js:551-552` grava `evLookups.emp = {}` **depois** do `.catch(()=>[])`. Objeto
vazio é *truthy*, então `if (!evLookups.emp)` nunca mais dispara: uma falha transitória de rede
deixa os lookups **permanentemente vazios naquela sessão**, e o Histórico passa a mostrar ids crus
em vez de nomes de evento — sem erro na tela.

**Files:**
- Modify: `app.js:550-553`
- Test: `tests/pure.test.js` (a lógica precisa virar função pura testável)

- [ ] **Step 1: Escrever o teste que falha**

Em `tests/pure.harness.js`, copiar (com marcadores `@canon`) a função nova; em `tests/pure.test.js`:

```js
// Falha transitória não pode envenenar o cache: a próxima chamada tem de tentar de novo.
let chamadas = 0;
const falhaUmaVez = async () => { chamadas++; if (chamadas === 1) throw new Error('rede'); return [{ id:'1', evento_linha:'ALTERACAO' }]; };
const cache = {};
await preencherLookup(cache, 'lin', falhaUmaVez, 'evento_linha');
t('falha não grava cache', cache.lin === undefined);
await preencherLookup(cache, 'lin', falhaUmaVez, 'evento_linha');
t('segunda tentativa preenche', cache.lin && cache.lin['1'] === 'ALTERACAO');
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node tests/pure.test.js
```

- [ ] **Step 3: Implementar**

Substituir `app.js:550-553` por:

```js
/* Só grava o cache quando o fetch DEU CERTO. A forma anterior fazia
   `evLookups.emp={}` depois do `.catch(()=>[])`, e objeto vazio é truthy:
   uma falha transitória de rede deixava os lookups vazios pela sessão inteira,
   e o Histórico passava a mostrar ids crus em vez de nomes — sem erro na tela. */
async function preencherLookup(cache, chave, buscar, coluna){
  if (cache[chave]) return cache[chave];
  const r = await buscar();
  const m = {};
  r.forEach(x => { m[x.id] = x[coluna]; });
  cache[chave] = m;
  return m;
}

async function getEvLookups() {
  await Promise.all([
    preencherLookup(evLookups, 'emp', () => sbFetch('evento_empresa_teste','select=id,evento_empresa'), 'evento_empresa').catch(()=>{}),
    preencherLookup(evLookups, 'lin', () => sbFetch('evento_linha_teste','select=id,evento_linha'), 'evento_linha').catch(()=>{}),
  ]);
  return evLookups;
}
```

> Os consumidores leem `evLookups.emp?.[id]`; confira os call sites (`grep -n "evLookups" app.js`) e
> acrescente o `?.` onde faltar, já que agora o campo pode estar ausente após falha.

- [ ] **Step 4: Rodar tudo**

```bash
node tests/pure.test.js && node tests/check.js && node scripts/check_views.mjs historico
```

- [ ] **Step 5: Commit**

```bash
git add app.js tests/pure.harness.js tests/pure.test.js
git commit -m "fix: falha de rede não envenena mais o cache de lookups de evento

evLookups.emp={} era gravado depois do .catch, e objeto vazio é truthy: o
guard if(!evLookups.emp) nunca mais disparava e o Histórico mostrava ids crus
pela sessão inteira, sem erro."
```

---

### Task 10: Três bypasses do seam do ciclo de vida

**O problema.** `LOADERS.secoesPorLigacao` (`app.js:2307-2314`), `LOADERS.portarias`
(`2432-2442`) e `mostrarLinhasEntreMunicipios` (`2182-2232`) escrevem `innerHTML` depois de um
`await` sem chamar `beginGen`. O caso mais claro é o terceiro: a irmã `mostrarLinhasPorLocalidade`
captura corretamente (`2555`) e **as duas são chamadas do mesmo `run()`**.

**Files:** Modify: `app.js:2307`, `app.js:2432`, `app.js:2182`

- [ ] **Step 1: Aplicar o padrão nos três**

Em cada um, no topo da função e **antes de qualquer `await`**:

```js
const view = currentView, gen = beginGen(view);
```

Trocar cada escrita pós-`await` por uma que confira a geração, seguindo o padrão já usado em
`mostrarLinhasPorLocalidade`: pintura de tela guardada por `isCurrentGen(view, gen)`, e resultado
com `commitViewResult(view, gen, { pdfHTML: … })`. Não reler `currentView` no fim.

- [ ] **Step 2: Conferir que o Semgrep aprova**

```bash
./scripts/semgrep.sh && node scripts/check_views.mjs secoesPorLigacao portarias municipioRegiao
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "fix: três loaders passam a usar o seam do ciclo de vida da view

secoesPorLigacao, portarias e mostrarLinhasEntreMunicipios escreviam innerHTML
pós-await sem beginGen. A irmã mostrarLinhasPorLocalidade já capturava, e as
duas são chamadas do mesmo run()."
```

---

### Task 11: Extrair as seis listas `select=` duplicadas

**O problema.** `renderEstrutura` (`app.js:1794-1825`) refaz as colunas de cinco outros documentos
(`1433↔1801`, `1531↔1802`, `1532↔1803`, `1534/1668↔1800`, `1778↔1804`), e `1392↔1941` repete as de
evento. É o combustível do modo de falha silencioso: a coluna diverge num lugar e não no outro.

**Files:** Modify: `app.js` (seção `SUPABASE CONFIG`, junto de `LINE_FIELDS`)

> ⚠️ **Extraia SÓ os 7 pares abaixo.** As mesmas tabelas têm outros call sites com listas
> **deliberadamente diferentes** — `getTerminais` (`app.js:516`) pede 3 colunas de <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram -->
> `itinerario_teste`; `filtrarFrotaEmpresas` (`app.js:2359`) pede 4 de `qh_teste`. Colapsar esses <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram -->
> nas constantes faria o portal pedir colunas que não precisa e, depois da Task 2, **derrubaria a
> bancada com 400**. Foram conferidos par a par: os 7 são idênticos hoje; os demais não são.

- [ ] **Step 1: Declarar as constantes** ao lado de `LINE_FIELDS` (`app.js:574`). <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram --> Os valores abaixo
  foram **extraídos do `app.js` atual**, não escritos de memória:

```js
/* Listas de colunas usadas por MAIS DE UM documento (o segundo é sempre a Estrutura
   Operacional, que consolida os outros). Mantê-las aqui é o que impede a divergência
   silenciosa: coluna que muda num select= e não no outro chega `undefined` no render
   e a tela fica vazia SEM erro.
   NÃO use estas constantes em call sites que pedem uma lista menor de propósito
   (getTerminais, filtrarFrotaEmpresas) — pedir coluna a mais é regressão. */
const ITINERARIO_FIELDS   = 'id,sentido,tipo_logradouro,nome_logradouro,cod_municipio_origem,codempresa';
const QH_INTERVALO_FIELDS = 'cod_origem,nome_origem,dia_semana,hora_inicio,hora_fim,intervalo';
const QH_PREDET_FIELDS    = 'cod_origem,nome_origem,dia_semana,saida';
const TARIFA_LINHA_FIELDS = 'secao,numero_linha,nome_ligacao,via,caracteristica,tipo_ligacao,rm,tarifa,piso_i,situacao,cancelado,paralisado,sub_judice,transferido,data_criacao,data_cancelamento,data_paralisacao,data_sub_judice,data_transferencia';
const FROTA_FIELDS        = 'codempresa,hierarquia,ultima_alteracao,frota_operacional,reserva,frota_a,frota_sa,frota_ac,frota_sac,frota_e,frota_micro_a,frota_micro_sa,frota_micro_ac,frota_micro_sac,frota_micro_e';
const EVENTO_FIELDS       = 'data_registro,codlinha,numero_processo,evento_linha,evento_empresa,data_publicacao,descricao,observacao';
```

- [ ] **Step 2: Trocar os 7 pares** (14 call sites) pelos `${…}` correspondentes:

| Constante | Call sites |
|---|---|
| `ITINERARIO_FIELDS` | `app.js:1433` <!-- deriva-ok: plano encerrado em 09/08/2026 (22/22 na main, não normativo) — as citações são do app.js daquela data e não se re-ancoram --> ↔ `1801` |
| `QH_INTERVALO_FIELDS` | `1531` ↔ `1802` |
| `QH_PREDET_FIELDS` | `1532` ↔ `1803` |
| `TARIFA_LINHA_FIELDS` | `1534` ↔ `1800`, e `1668` ↔ `1800` |
| `FROTA_FIELDS` | `1778` ↔ `1804` |
| `EVENTO_FIELDS` | `1392` ↔ `1941` |

- [ ] **Step 2b: Provar que a substituição foi neutra**

```bash
git diff -U0 app.js | grep '^[-+].*select=' | sort | uniq -c
```

Cada coluna que sai tem de voltar. Se o diff mostrar coluna a mais ou a menos, a constante não
reproduziu a lista original.

- [ ] **Step 3: Provar que nada mudou**

```bash
node scripts/check_views.mjs && node tests/check.js
```

Esperado: verde. Se alguma view quebrar, a constante não reproduziu a lista original — compare.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "refactor: seis listas select= duplicadas viram constantes

renderEstrutura refazia as colunas de cinco documentos e o histórico de
empresa repetia as de evento. Divergir num lugar e não no outro produz tela
vazia sem erro — o modo de falha que o CLAUDE.md chama de pior possível."
```

---

### Task 12: Acessibilidade

**Files:** Modify: `app.js:2436-2439`, `app.js:798`, `app.js:903` + panes, `styles.css`

- [ ] **Step 1: `for=` nos quatro controles de Portarias** (`app.js:2436-2439`) — usar label
  implícito, como a barra irmã `eventFilterBarHTML` (`app.js:1314-1319`) já faz:

```js
<div class="evf"><label>Número <input id="pNum" type="text" placeholder="ex.: 1975" autocomplete="off"></label></div>
```

Aplicar aos quatro (`#pNum`, `#pAno`, `#pVig`, `#pTxt`).

- [ ] **Step 2: `role="tabpanel"` nos panes** — onde o pane é criado, acrescentar
  `role="tabpanel"` e `aria-labelledby` apontando para o `id` do `role="tab"` correspondente
  (`app.js:903`), e `aria-controls` no tab apontando para o pane.

- [ ] **Step 3: Focus trap ignora pane oculto** — em `app.js:798`, filtrar o que não é visível:

```js
const focaveis = [...overlay.querySelectorAll(SELETOR_FOCAVEL)].filter(el => el.offsetParent !== null);
```

- [ ] **Step 4: Três contrastes** em `styles.css` — `.doc-head .sub` (3,49), `.doc-foot` (3,54),
  `.side-eyebrow` (3,69) precisam chegar a 4,5:1. Escurecer o verde de `#1f9d57` para `#177a43` e o
  cinza de `#888` para `#6b6b6b`; para `.side-eyebrow` sobre navy, clarear `#7d93ab` para `#a8bccd`.
  **Recalcule após escolher** — não confie nos valores sem conferir.

- [ ] **Step 5: Verificar**

```bash
node scripts/check_views.mjs && node scripts/check_abas.mjs && node tests/check.js
```

- [ ] **Step 6: Commit**

```bash
git add app.js styles.css
git commit -m "a11y: labels associados, tabpanel, focus trap e três contrastes

Os quatro controles de Portarias tinham <label> irmão sem for=, sem nome
acessível. O focus trap não filtrava panes ocultos. Três textos ficavam
abaixo de 4,5:1."
```

---

### Task 13: Distinguir "não cadastrado" de "não localizado"

**O problema.** As codlinhas órfãs fazem a view renderizar vazia, e o `emptyBox` responde *"Nenhum
itinerário cadastrado para esta linha"* (`app.js:1416`). Para o cidadão, **dado corrompido e linha
genuinamente sem itinerário são a mesma tela** — o portal afirma com confiança algo que não sabe.

**Files:** Modify: `app.js` (os `emptyBox` de documento de linha)

- [ ] **Step 1: Trocar o texto** nos `emptyBox` que respondem por linha existente:

```js
emptyBox('Nenhum registro de itinerário foi localizado para esta linha. '
       + 'Se você esperava encontrar um, informe o código da linha ao DIVAT.')
```

Aplicar ao mesmo padrão em Quadro de Horários, Frota, Tarifas e Seções.

- [ ] **Step 2: Verificar**

```bash
node scripts/check_views.mjs
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "fix(ux): estado vazio para de afirmar que o dado não existe

As codlinhas órfãs produzem view vazia, e a mensagem dizia 'nenhum itinerário
cadastrado' — indistinguível de linha que realmente não tem itinerário."
```

---

# FASE 4 — Documentação e operação

---

### Task 14: Corrigir as derivas de documentação

**Files:** `docs/estrutura-frontend.md:160,161-163,170-172`, `CLAUDE.md:93-101,351`,
`scripts/check_views.mjs:5`, `docs/historico/analise-duplicacao.md:1`

- [ ] **Step 1: D1** — `estrutura-frontend.md:160`: Frota por Empresa **é** paginada
  (`app.js:2407-2410`). Mover para a lista de paginados com `pdf:false`.
- [ ] **Step 2: D2** — `estrutura-frontend.md:161-163`: `localidades`/`renderLocalidadeSecoes` já
  paginam (`app.js:2960-2967`, commit `dfb96b0`). Tirar de "deixado para depois".
- [ ] **Step 3: D5** — `pdf:false` tem **4** call sites (`app.js:1628`, `2096`/`2100`, `2409`,
  `2966`). Corrigir `estrutura-frontend.md:170-172` (diz 2) e `CLAUDE.md:351` (diz 3).
- [ ] **Step 4: D6** — `check_views.mjs:5` diz "~62%"; medido **58,6%** (`app.js:740-2720`,
  1.981/3.377).
- [ ] **Step 5: D4** — `CLAUDE.md:93-101` lista 12 tabelas; `RT_TABLES` tem 14. Acrescentar
  `codempresa_teste` e `portaria_teste`, **e o tópico Portarias**, que sumiu do mapa.
- [ ] **Step 6: D7** — cabeçalho de `docs/historico/analise-duplicacao.md`:

```markdown
> ⚠️ **Snapshot pré-split (anterior a 21-22/07/2026).** Descreve o frontend quando era um único
> `index.html` com JS embutido; as ~50 citações `index.html:NNNN` não se traduzem direto para o
> `app.js` atual. Mantido como registro do diagnóstico, não como guia.
```

- [ ] **Step 7: Verificar e commitar**

```bash
node tests/check.js
git add docs/ CLAUDE.md scripts/check_views.mjs
git commit -m "docs: corrige seis derivas apontadas pela auditoria de 08/08"
```

---

### Task 15: Documentar `.agents/skills/` e o `skills-lock.json`

**O problema.** `CLAUDE.md:428-432` descreve `.claude/skills/` como "14 skills + `db-change`".
Medido: **36 entradas** — 15 diretórios reais e **21 symlinks** para `.agents/skills/`, um segundo
conjunto vindo de `mattpocock/skills` e travado em `skills-lock.json` (95 arquivos no git). É desenho
limpo; o problema é que **nenhum `.md` menciona `.agents/`, o lockfile ou a origem**.

**Files:** Modify: `CLAUDE.md:428-432`

- [ ] **Step 1: Acrescentar o parágrafo**

```markdown
- **Há um segundo conjunto de skills, de outra origem.** Além das 14 do Superpowers e da
  `db-change`, `.claude/skills/` contém **21 symlinks** para `.agents/skills/`, que hospeda
  skills vindas de `mattpocock/skills` e travadas por hash em `skills-lock.json` (raiz).
  Os dois conjuntos são independentes: o `update_superpowers.sh` remove só o que o manifesto
  do Superpowers lista, então nunca toca nestas. `.claude/skills/` tem, no total, **15
  diretórios reais + 21 symlinks = 36 entradas**.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: registra as 21 skills de .agents/skills e o skills-lock.json"
```

---

### Task 16: Separar snapshot de doc vivo

**O problema.** 33 `.md`, 6.407 linhas: 16 vivos e **17 snapshots**. Quatro snapshots (896 linhas)
não são citados por doc nenhum, e 12 arquivos/2.637 linhas não aparecem no README — incluindo
`docs/planos/fase-3-hardening-moderado.md`, que é **vivo e normativo**.

**Files:** mover 17 arquivos; `README.md`; `tests/check.js` (lista `DOCS_VIVOS`)

- [ ] **Step 1: Criar `docs/historico/`** e mover para lá os 17 snapshots (os 5 `plano-*` da raiz de
  `docs/`, os 4 `handoff-*`, as 2 `revisao-externa-*`, as 2 `analise-*`,
  `contexto-proxima-sessao-2026-07-31.md`, `pendencias-2026-07-31-consolidado.md`,
  `execucao-pr73-e-painel.md`). **Não mover** o `CHANGELOG.md` nem
  `docs/planos/fase-3-hardening-moderado.md`.

```bash
git mv docs/plano-*.md docs/handoff-*.md docs/revisao-externa-*.md docs/analise-*.md \
       docs/contexto-proxima-sessao-2026-07-31.md docs/pendencias-2026-07-31-consolidado.md \
       docs/execucao-pr73-e-painel.md docs/historico/
```

- [ ] **Step 2: Cabeçalho em cada um**

```markdown
> **Snapshot de DD/MM/2026 — não atualizar.** O estado atual está no `CLAUDE.md`.
```

- [ ] **Step 3: Consertar os links** que apontavam para os caminhos antigos

```bash
grep -rn "docs/plano-\|docs/handoff-\|docs/revisao-externa-\|docs/analise-" --include="*.md" . | grep -v docs/historico
```

- [ ] **Step 4: Acrescentar ao README** uma linha para `docs/historico/` e outra para
  `docs/planos/`, com o critério: *plano vivo em `docs/planos/`, retrato datado em
  `docs/historico/`*.

- [ ] **Step 5: Verificar e commitar**

```bash
node tests/check.js     # a guarda [2b] confere os links dos docs vivos
git commit -am "docs: snapshots datados vão para docs/historico/, planos vivos para docs/planos/"
```

---

### Task 17: Enxugar o bloco 2a-2e do `CLAUDE.md`

**O problema.** `CLAUDE.md:189-307` (~119 linhas) é runbook de gates, não contexto — descreve órfãs
individuais e unidades de `qtd` que **já estão** no `data_quality_baseline.json` (o campo `nota`
repete quase palavra por palavra). O arquivo é lido no início de toda sessão.

**Files:** Modify: `CLAUDE.md:189-307`; `scripts/check_data_quality.mjs` (cabeçalho)

- [ ] **Step 1: Mover o detalhe** para o cabeçalho do `check_data_quality.mjs` (o `[2b]` varre
  `scripts/*.mjs` depois da Task 20 — o fato fica sob guarda lá).
- [ ] **Step 2: Reduzir o `CLAUDE.md`** a ponteiro de ~3 linhas por gate, mantendo **a consequência
  prática** (o que quebra se você esquecer) e cortando a enumeração de dívida.
- [ ] **Step 3: Conferir os fatos numéricos** — o `[2b]` cobra números na prosa; se você mudou a
  frase que carrega um número, ajuste o regex da tabela `FATOS` em `tests/check.js`.

```bash
node tests/check.js
git commit -am "docs: bloco de gates do CLAUDE.md vira ponteiro (-70 linhas)"
```

---

### Task 18: Escrever o runbook de ETL do dono

**O problema.** Todo o assunto cabe em `CLAUDE.md:79` ("direto pelo painel"), e o próprio
`CLAUDE.md:337-340` manda replicar correção na staging "senão o rebuild do ETL desfaz" — **sem que
nenhum doc descreva o rebuild**.

**Files:** Create: `docs/etl.md`; Modify: `CLAUDE.md`, `README.md`

- [ ] **Step 1: Escrever `docs/etl.md`** cobrindo, com o dono ao lado: de onde vem o dado bruto;
  encoding obrigatório (**UTF-8** — importar errado recria o U+FFFD); como `evento_dados` +
  `evento_textos` viram `evento_teste` e `portaria_data` + `portaria_texto_teste` viram
  `portaria_teste`; **o comando/consulta do rebuild**; por que correção em tabela final precisa ser
  replicada na staging; e o que rodar depois (`node scripts/check_data_quality.mjs`, conferindo
  `orfaos_conhecidos` **item a item**, não só o número).
- [ ] **Step 2: Linkar** de `CLAUDE.md` (seção Supabase) e do `README.md`.
- [ ] **Step 3: Commit**

```bash
git add docs/etl.md CLAUDE.md README.md
git commit -m "docs: runbook de ETL — o rebuild da staging deixa de ser conhecimento oral"
```

---

### Task 19: Fechar as issues entregues

- [ ] **Step 1:** Confirmar **#50** — `MAX_TABS = 5` em `app.js:459`, `scripts/check_abas.mjs` verde.
- [ ] **Step 2:** Confirmar **#63** — `scripts/check_data_quality.mjs` roda em `db-checks.yml:98`.
- [ ] **Step 3:** Fechar as duas com comentário apontando o commit e o gate que as guarda.

---

### Task 20: Guardas novas — transformar prosa em gate

Cada uma custa P e mata uma classe de deriva desta auditoria.

**Files:** Modify: `tests/check.js`

- [ ] **Step 1: `docs/adr/` e `docs/planos/` entram em `DOCS_VIVOS`** (`tests/check.js:261-264`) —
  mataria a deriva do ADR-0002 (Task 8), que sobreviveu por estar fora do alcance.
- [ ] **Step 2: `scripts/*.mjs` entram na varredura de fatos numéricos** (a lista `WORKFLOWS`,
  `tests/check.js:271-274`, passa a incluir os scripts) — mataria a deriva dos "~62%" (Task 14).
- [ ] **Step 3: Fato novo — toda tabela de `RT_TABLES` aparece no mapa tabela→card do `CLAUDE.md`**
  — mataria a deriva das 12 vs 14 tabelas (Task 14).
- [ ] **Step 4: Fato novo — contar entradas de `.claude/skills/` e cobrar o número no `CLAUDE.md`**
  — mataria a deriva das skills (Task 15).
- [ ] **Step 5: Verificar** que cada guarda nova **falha** quando você reintroduz a deriva de
  propósito, e só depois que ela passa.

```bash
node tests/check.js
git commit -am "test: quatro guardas novas cobrem os eixos onde a [2b] era cega"
```

---

### Task 21: `marcarTrunc` também detecta corte feito pelo servidor

**O problema.** `app.js:147-155` só marca truncagem quando `data.length >= lim`, sendo `lim` o
`limit` **pedido**. Se um dia sair um `limit=50000` sem subir o `db_max_rows`, o PostgREST devolve
30.000, `30000 >= 50000` é falso, e **a lista sai cortada sem banner e sem toast**. Hoje não dispara
— os 5 maiores `limit` são exatamente 30000 (`app.js:516,1513,2085,2162,2219`). É armadilha armada,
não bug ativo.

**Files:** Modify: `app.js:147-155`; `tests/harness.js` (cópia `@canon`); `tests/sbFetch.test.js`

- [ ] **Step 1: Teste que falha** — em `tests/sbFetch.test.js`:

```js
// Corte do SERVIDOR: pedimos 50000, o PostgREST devolveu o teto dele (30000).
// Sem esta guarda a lista sai truncada sem aviso nenhum ao usuário.
const cortado = marcarTrunc(new Array(30000).fill({}), 'limit=50000');
t('corte do servidor é marcado', cortado._trunc === true);
t('limite relatado é o do servidor', cortado._limite === 30000);
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
node tests/sbFetch.test.js
```

- [ ] **Step 3: Implementar** — acrescentar o teto do servidor como segundo critério:

```js
// Teto do PostgREST (pgrst.db_max_rows do role `authenticator`). Precisa bater com o
// valor versionado em docs/backup_schema.sql. Sem este segundo critério, um `limit`
// MAIOR que o teto sai cortado em silêncio: data.length (30000) nunca alcança lim (50000).
const SB_MAX_ROWS = 30000;

function marcarTrunc(data, qs){
  if (!Array.isArray(data)) return data;
  const m = /(?:^|&)limit=(\d+)/.exec(qs || '');
  if (!m) return data;
  const lim = +m[1];
  const teto = Math.min(lim, SB_MAX_ROWS);
  if (teto >= 50 && data.length >= teto){
    Object.defineProperty(data, '_trunc',  { value:true, enumerable:false });
    Object.defineProperty(data, '_limite', { value:teto, enumerable:false });
  }
  return data;
}
```

- [ ] **Step 4: Atualizar a cópia no `tests/harness.js`** (entre os marcadores `@canon`) e rodar

```bash
node tests/check.js
```

- [ ] **Step 5: Commit**

```bash
git add app.js tests/harness.js tests/sbFetch.test.js
git commit -m "fix: marcarTrunc detecta corte feito pelo servidor, não só o pedido

Só marcava quando data.length >= limit PEDIDO. Um limit maior que o
db_max_rows sairia cortado em silêncio, porque 30000 nunca alcança 50000."
```

---

### Task 22: Contrato mínimo de conteúdo por view

**O problema.** `scripts/check_views.mjs:143-144` exige apenas `corpo ≠ 0` — **um caractere passa**.
`historicoLinha`, `frota` e `historicoEmpresa` passam hoje com **zero linhas de tabela**. O escopo
está declarado no cabeçalho do script, então não é engano; é limite que agora vale apertar, porque
depois da Task 2 a bancada finalmente serve dado fiel ao contrato.

**Files:** Modify: `scripts/check_views.mjs` (lista `VIEWS` e a asserção)

- [ ] **Step 1: Acrescentar o mínimo esperado** a cada entrada de `VIEWS`, derivado das fixtures:

```js
{ key: 'itinerarios', minLinhas: 2 },
{ key: 'historicoEmpresa', busca: 'alfa', minLinhas: 2 },
```

- [ ] **Step 2: Trocar a asserção** de `corpo ≠ 0` por contagem de `<tbody> <tr>` no pane ativo,
  exigindo `>= minLinhas` para as views que declararem o campo (as que não declararem seguem no
  critério antigo, para a mudança poder entrar view a view).

- [ ] **Step 3: Provar que aperta** — zerar uma fixture de propósito e conferir que a view
  correspondente fica vermelha; repor a fixture.

- [ ] **Step 4: Commit**

```bash
git add scripts/check_views.mjs
git commit -m "test: laço de views passa a exigir conteúdo, não só 'corpo != 0'

Três views passavam com zero linhas de tabela. Com a bancada servindo dado
fiel ao select= (Task 2), dá para cobrar o mínimo por view."
```

---

## Backlog registrado (achado real, sem tarefa neste plano)

Itens da auditoria que não viraram tarefa aqui, para não sumirem:

| Achado | Onde | Por que ficou fora |
|---|---|---|
| `check_data_quality` não mede `codempresa` órfã em `qh_teste`/`itinerario_teste`/`evento_teste`, nem `cod_municipio_origem` órfão | §2.4 | Exige mexer na RPC `divat_data_quality()` no banco — pertence à skill `db-change`, com migração própria |
| `check_grants` detecta privilégio **a mais**, nunca **a menos**; não olha `USING`/`WITH CHECK` | §2.5 | Mesma razão: depende do que a RPC devolve |
| Cinco decisões grandes sem ADR (zero-build, CSP sem `unsafe-inline`, o seam, default deny, baseline como política) | §4 | Trabalho de escrita que merece sessão própria, um ADR por vez |
| `CONTEXT.md` tem 2 termos; faltam `linha`, `ligação`, `seção`, `codlinha`, `vigente`, `cancelado` | §4 | Idem — e o vocabulário deve sair de conversa com o dono, não de inferência |
| 13 seletores CSS órfãos; `.fd-*` é resíduo de código removido | §3 | BAIXA; limpeza sem risco, faça junto da próxima mexida em `styles.css` |
| Canal de retorno para o usuário relatar dado errado | §5.3 | Precisa de decisão de endereço/processo do DIVAT |
| **S2** — a heurística de dedup de empresa por RJ está **duplicada** e sem teste: `getEmpresas` (`app.js:536-546`) e `empresasRegulares` (`app.js:1918-1921`) implementam a MESMA regra de score (REGULAR/não-cassada) em código separado | `docs/historico/analise-separacao.md` §S2 | Virou a **issue #111** (o veredito lá era "✅ vale extrair" e nunca foi executado). Só o achado ficou fora deste plano — não é deriva de auditoria, é dívida de código anterior a ela |
| **D7** — a closure `sentidoKey` continua duplicada em `app.js:1544` e `app.js:1620`, idênticas | `docs/historico/analise-duplicacao.md` §D7 | BAIXA; o próprio relatório a classifica como "Trivial" e a põe no tier "não recomendado — churn cosmético". Faça junto da próxima mexida no Quadro de Horários |
| **`searchEmpresas` busca sobre a lista CRUA** (`app.js:567`, sobre `empresas.list`), então um RJ duplicado pode aparecer **duas vezes no seletor de empresa** — enquanto o banner e o card Empresas Regulares mostram só a vencedora do `dedupEmpresasPorRJ` | notado ao revisar o PR #112 | **Precisa de decisão do dono, não de conserto.** Pré-existente; ficou visível quando a dedup ganhou nome. A pergunta é de produto: na busca, ver as duas entradas de um RJ duplicado é ruído ou é informação útil (sinal de que o cadastro tem duplicata)? Deduplicar sem essa resposta seria o agente decidir pelo dono |
| Confirmar se o `deploy-smoke` roda de fato | §5.7 | Checagem de 2 minutos na aba Actions: se não houve run recente com `deployment_status`, incluir `workflow_dispatch` no runbook de deploy |

## Fora deste plano (decisão do dono, não execução)

Três itens da auditoria **não** viraram tarefa porque são decisão de produto, não conserto:

- **Telemetria** (§Tópico 5.1) — hoje, se uma view quebrar para um usuário real, ninguém fica
  sabendo. Qualquer solução mexe na CSP (`connect-src`) e envolve escolher se entra terceiro num
  projeto que hoje tem **zero** terceiros em runtime. Precisa de decisão antes de plano.
- **SEO** (§Tópico 5.5) — a arquitetura SPA com rota por hash não é indexável, e as tags Open Graph
  prometem o que ela não entrega. Ou se aceita que a descoberta é por link direto (e removem-se as
  tags que prometem outra coisa), ou muda a arquitetura — o que contraria o zero-build.
- **Service worker** (§Tópico 5.4) — o `manifest.webmanifest` declara `display: standalone` e não há
  SW: instalado, o app morre offline. Ou entra um SW mínimo (a CSP permite; o `.vercelignore` é
  allowlist e precisaria abrir o arquivo), ou sai o `display: standalone`.

## Ordem dos PRs — planejada × executada

A ordem planejada foi respeitada em espírito, com **uma inversão**: a Fase 2 dependia de medição
no banco e por isso saiu **por último**, não em segundo. As demais mantiveram a sequência.

| PR real | Tarefas | Planejado como |
|---|---|---|
| **#106** | 1–4 | PR 1 — a rede de testes. Foi primeiro mesmo: sem ela, o verde das outras não significa nada. |
| **#107** | 9–13, 21 | PRs 3 e 4 juntos (bugs do `app.js`, a11y e estado vazio) |
| **#108** | 22 | parte do PR 4 — o aperto do laço de views |
| **#110** | 14–20 | PR 5 — documentação, operação e as guardas novas |
| **#112** | — | não estava no plano: fecha a issue #111, saída do backlog |
| **#113** | 5–8 | PR 2 — **saiu por último**, porque dependia de duas medições no SQL Editor que só o dono podia rodar |

O #109 sincronizou o `CLAUDE.md` com o que os #107 e #108 mudaram; o #114 fechou o plano.

## Registro da auto-revisão

Três defeitos foram encontrados **no próprio plano** ao conferi-lo contra o código, e corrigidos
antes da entrega. Ficam registrados porque são o tipo de erro que um plano bonito esconde:

1. **`require('./check.js')` executaria o gate inteiro** como efeito colateral do teste. Por isso o
   extrator virou módulo próprio (`tests/canon.js`).
2. **`tests/rig.test.js` com `import` estático não rodaria** — sem `package.json`, `.js` é CommonJS,
   e o `check.js` descobre testes por `.test.js`. Virou `import()` dinâmico dentro de IIFE assíncrona.
3. **As constantes da Task 11 estavam erradas.** Foram escritas a partir da tabela do relatório, e
   não do código; conferidas contra o `app.js`, as listas reais são outras. Pior: as mesmas tabelas
   têm call sites com listas **deliberadamente diferentes** (`getTerminais`, `filtrarFrotaEmpresas`),
   e colapsá-los teria sido regressão — que depois da Task 2 apareceria como 400 na bancada.
