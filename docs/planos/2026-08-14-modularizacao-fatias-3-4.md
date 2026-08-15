# Plano — desmontar o monólito do `app.js` (fatias 3 e 4 do estudo)

Escrito em 14/08/2026, podado em 15/08/2026. Diferente dos arquivos de `docs/historico/`, este é um
plano **vivo**: atualize-o conforme as fases entrarem, e apague-o quando a última fechar.

## Como este plano é escrito (leia antes de editá-lo)

Este documento **declara restrições e mede o presente. Não prevê o futuro.**

Não é preferência de estilo. A 1ª versão previa: dizia quais funções seriam movíveis, quanto cada
fase encolheria o `app.js`, o que sobraria em cada registro. Foram **cinco rodadas de revisão e
~15 achados P1**, e nenhum deles sobre o código — todos sobre afirmações do plano a respeito do
código. O motivo é estrutural: a única forma de saber se `X` é movível é tentar mover `X`, e
nenhum gate deste repo distingue uma frase verdadeira de uma falsa sobre o `app.js` (`check.js`,
`semgrep`, `views` e `smoke` ficaram verdes nas cinco rodadas).

Duas regras, portanto:

1. **Toda afirmação sobre comportamento de código cita `arquivo:linha`** — e a linha é aberta antes
   de a frase ser escrita. Citação é falsificável; prosa afirmativa não é. Citar a seção em vez da
   linha não conta (já aconteceu, e passou).
2. **Onde a resposta depende de código que ainda não existe, escreva a restrição e quem decide —
   não a decisão.** Quem executar a fase terá o código na frente e medirá melhor do que este texto.

Se você for editar este plano e sentir vontade de acrescentar uma tabela de projeção ou um veredito
por função, é exatamente isso que foi removido daqui, e por quê.

## Por que

Uma crítica externa disse que o `app.js` é "um monólito de 3.500 linhas". Procede. As Sessões 1 e 2
do plano de 6 ([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md))
responderam à crítica **irmã** — a de que o processo virou projeto paralelo. O monólito mal foi
arranhado.

Medido hoje, no `app.js` de **3.352 linhas**:

| bloco | linhas | % |
|---|---|---|
| `MODAL / SISTEMA DE VIEWS` (`app.js:755`–`:2710`) | 1.956 | 58,3% |
| `COMPONENTES AUXILIARES` (`:2711`–`:3009`) | 299 | 8,9% |
| `SUPABASE CONFIG` (`:26`–`:196`) | 171 | 5,1% |

Dois terços do arquivo, e é onde nenhuma das sessões já planejadas toca. O estudo de 10/08
([`../historico/estudo-modularizacao-frontend-2026-08-10.md`](../historico/estudo-modularizacao-frontend-2026-08-10.md))
chama isso de fatias 3 e 4, e as **condiciona**: separar documentos "somente após injetar
explicitamente estado e render target; não exportar dezenas de variáveis do IIFE".

O diagnóstico que justifica a ordem abaixo: um documento típico lê `currentView` e `activeLine` —
estado mutável de módulo. Enquanto isso for verdade, mover o arquivo troca um monólito por módulos
rasos acoplados por variável global. Seria piorar com aparência de melhorar.

**O padrão de injeção já existe e está em produção.** O seam do `pdfHTML` fez `paginate`,
`paginateTable`, `paginateLines`, `lineResults` e `paginateEvents` receberem `view` e `gen` por
parâmetro. As fases abaixo estendem essa disciplina — não é desenho novo.

---

## ⚠️ PRECONDIÇÃO DE BLOQUEIO — travessia transitiva (PR #122)

**Nenhuma fase B, B2 ou C começa antes de o PR #122 entrar na `main`.** É o único item deste
documento que, se ignorado, quebra o portal em produção sem nenhum gate acusar.

Nem o `tests/check.js` §[1] nem o `scripts/check_deploy.mjs` seguiam import de módulo para módulo.
Com `app.js → familia.mjs → dep.mjs` e `dep.mjs` fora da allowlist, os dois ficavam **verdes** e o
portal morria — import ES é atômico, um 404 mata o grafo inteiro. O smoke foi corrigido no PR #128;
o `check.js` é o #122.

Estado medido em 14/08/2026 contra a `main` `761213d`, rodando os gates (não lendo o badge):

| | medida |
|---|---|
| #122 sobre a `main` de hoje | cherry-pick **limpo** — não precisa de rebase; GitHub reporta `mergeable_state: clean` |
| gates | `node tests/check.js` verde rebasado, e verde com o #128 empilhado |
| mutação | `dep.mjs` importado só por `agrupamento.mjs`: **acusa**, nomeando arquivo e importador |
| `main` sem #122 | a mesma mutação passa como `✓ allowlist … publica os 15 assets` — o buraco |

Falta **só o merge**. O CI verde exibido no #122 é de 10/08, contra uma base 15 commits e 5 merges
atrás (#123 a #127).

**Por que trava B/B2/C e não as Sessões 3–4.** A distinção não é "importa outro módulo", é **ser
alcançável só por outro módulo**. Hoje `app.js:1`–`:10` importa `core.mjs` e `agrupamento.mjs`
direto, e `src/domain/agrupamento.mjs:5` importa `./core.mjs` — a aresta módulo→módulo já existe,
mas é **redundante**: quem ela alcança, o `app.js` também alcança. A B2 nasce para ser importada
pelas famílias da C, e é ali que a redundância acaba.

---

## Ordem — uma fase por sessão, um PR por sessão

| ordem | fase | entrega |
|---|---|---|
| **0** | **merge do #122** | travessia transitiva no `check.js` — trava B/B2/C |
| 1 | Sessão 3 | `src/domain/busca.mjs` |
| 2 | Sessão 4 | `src/domain/view-state.mjs` |
| 3 | **A** | contexto explícito + bancada de corrida |
| 4 | **B** | `src/data/rest.mjs` — encerra o mecanismo `@canon` |
| 5 | **B2** | helpers compartilhados + o seam de seleção |
| 6–9 | **C1…C4** | documentos por família |
| 10 | **D** | `LOADERS` como composição explícita |
| 11 | **E** | infra do modal (opcional) |

**Sessão 4 antes da Fase A:** ela extrai `beginGen`/`isCurrentGen`/`commitViewResult` como módulo
puro sobre um objeto `view`. É o seam que a Fase A injeta — fazer A antes seria injetar um contrato
que ainda mora dentro do IIFE.

As Sessões 5 (custo do processo) e 6 (retomada do PR #98) não conflitam e entram em qualquer ponto.

---

## Fase A — contexto explícito (precondição de tudo)

Nenhum arquivo muda de lugar. Muda o **contrato**: cada `render*`/loader passa a **receber**
`ctx = { view, gen, pane, host, line }` em vez de abrir com `const view = currentView, …`.

Três coisas que a fase precisa acertar, todas conferidas no código:

**1. Há DUAS invocações de loader, não uma.** `await view.loader();` aparece em **`app.js:1253`**
(dentro de `runView`) e em **`app.js:3179`** (`reloadTab`, comentada como "views diretas"). Mudar só
a primeira faz o card funcionar ao abrir e o mesmo loader receber `undefined` no recarregamento por
Realtime — falha que só aparece com o portal aberto e o banco mudando. Ou as duas passam `ctx`, ou a
invocação é centralizada num ponto só.

**2. `line` precisa ser derivável depois do `await`.** Não basta capturar `activeLine` junto com
`view`/`gen`: no `lineSearchRun` a linha certa **só existe depois** da busca —
`if (lines.length === 1){ selectLine(lines[0]); return render(host, lines[0]); }` (`app.js:1322`) e
o clique da lista (`app.js:1325`). Um render que lesse só o `ctx.line` inicial receberia `null` ou
**a linha anterior**, pintando o documento da linha errada sem erro nenhum. Logo o contrato precisa
de `withLine(ctx, linha)` → `{ ...ctx, line: linha }`, **preservando `view` e `gen`**: derivar com
`gen` novo destruiria a proteção que esta fase existe para dar.

**3. `activeLine` tem mais de um escritor legítimo, e eles ficam.** A escrita não passa só por
`selectLine`: `setActiveLine` atribui em `app.js:452`, `activateTab` faz `activeLine = t.line` em
`app.js:959`, e há limpezas em `app.js:729` e `app.js:3330`. A regra desta fase vale para
**documentos**: um documento deixa de ler o global e passa a usar `ctx.line`. O wiring de troca e
limpeza de abas continua escrevendo — mexer nele é fora de escopo e quebraria a seleção.

**`currentView` tem exatamente o mesmo formato de problema**, e a versão anterior desta seção
consertou o `activeLine` e deixou a frase gêmea errada ao lado: `setCurrentView` atribui em
`app.js:1122`, **mas `activateTab` também escreve**, `currentView = t.view`, em `app.js:960`. Vale
a mesma regra: o que acaba é **ler** essas variáveis de dentro de um documento; o wiring de abas
continua escrevendo as duas.

**Exceções documentadas — e a razão da primeira estava errada.**

- **`_panelRun` fica fora do seam**, mas *não* porque seja "sempre atribuído antes de qualquer
  `await`". Isso vale para dois dos três: `LOADERS.localidades` (`app.js:2701`) e `searchPanel`
  (`app.js:3006`) atribuem antes de qualquer `await` do próprio corpo. **Portarias não**: o loader
  faz `await getPortariaAnos()` em `app.js:2422` e só atribui `_panelRun` em `app.js:2464`. O que
  protege ali é o guard explícito — `if (!isCurrentGen(view, gen)) return;` em `app.js:2423`. Quem
  mexer neste seam **preserva esse guard**: sem ele, uma tentativa velha religa o runner depois de
  uma troca de aba.
- Os **5** call sites com `pdf:false` seguem passando `view`/`gen`: `app.js:1672`, `:2137`,
  `:2141`, `:2396` e `:2946`. (Eram descritos como 4 — número herdado e nunca medido.)

### Entregável obrigatório: a bancada de corrida

Os gates de hoje **não cobrem** esta fase, e vale registrar por quê: nenhum dos três **cria a
ordenação** que define o bug. O `check_views.mjs` abre cada view numa página limpa, em sequência; o
`check_abas.mjs` dá `waitForTimeout` **depois** de cada ação, ou seja, espera a requisição assentar
antes de trocar de aba; o `check_selecao_linha.mjs` exercita seleção e paginação. O stub do
PostgREST responde instantaneamente. Os três podem ficar verdes enquanto um render atrasado pinta o
pane ATIVO em vez do pane que capturou.

O seam `beginGen`/`commitViewResult` nasceu de raciocínio, não de teste — e esta fase mexe nele.
**No mesmo PR:** uma bancada que force a ordenação (stub com atraso controlável, abrir documento na
aba 1, trocar para a aba 2 antes da resposta voltar) e afirme:

- **(a)** o pane da aba 2 não foi pintado pelo render da aba 1;
- **(b)** o `pdfHTML` da aba 2 não foi sobrescrito;
- **(c)** o pane **da aba 1** e o `pdfHTML` **dela** recebem a resposta atrasada.

A fase não fecha sem ela, e não fecha com (a) e (b) apenas: sem a asserção positiva a bancada
aprova uma implementação que **descarta** toda resposta pós-troca-de-aba, deixando a aba 1
eternamente sem o resultado do pane que capturou.

---

## Fase B — módulo profundo de acesso REST

`src/data/rest.mjs`: `sbFetch`, `fetchComTimeout`, `esperar`, `SB_TIMEOUT_MS`, `SB_RETRIES`,
`CANCELADO`, `ehCancelamento`, `marcarTrunc`/`bannerTrunc`, `SB_MAX_ROWS`, `selecionarSupabase`.
Só entra se a interface **esconder** timeout, retry e truncagem — condição literal do estudo.
Config (URL, chave, `fetch`) injetada, não lida de global.

**Mais `preencherLookup`**, que não é REST — pertence a `src/data/lookups.mjs`. Ele entra nesta
fase mesmo assim porque é uma das cópias `@canon` restantes, e deixá-lo para depois anula o marco
abaixo. Ou ele sai aqui, ou `canon.js`/`drift.test.js` permanecem até que saia.

**Também no mesmo PR:** os runbooks que mandam editar `SB_MAX_ROWS` no `app.js` — `CLAUDE.md`
(§ Supabase, o parágrafo dos "TRÊS lugares a mudar juntos") e o comentário do
`docs/backup_schema.sql`. Mover a constante sem mover a instrução deixa dois runbooks apontando
para onde ela não está, e a guarda docs×código **não** cobre esse caminho: a falha só apareceria
quando alguém subisse o teto do PostgREST e a truncagem ficasse no valor velho, em silêncio.

**O marco:** [`../../tests/harness.js`](../../tests/harness.js) tem hoje **12** cópias `@canon`
(medido). Quando a última sair, [`../../tests/canon.js`](../../tests/canon.js) (56 linhas) e
[`../../tests/drift.test.js`](../../tests/drift.test.js) (72) se aposentam junto com a §[2] do
`check.js` — processo apagado por ter **perdido o objeto**, não por corte de rigor.

---

## Fase B2 — helpers compartilhados e o seam de seleção

As Fases A e B não bastam para mover um documento: ao virar módulo nativo ele perde acesso a
helpers privados do IIFE (`loading`, `emptyLinha`, `metaRows`, `docHead`, `empNome`, `getEmpresas`,
os paginadores). Esta fase existe para resolver isso, e vem **antes** da C.

Alvos: `src/ui/doc.mjs` (`docHead`, `metaRows`, `tableHTML`, `colClass`, `loading`, `emptyBox`,
`emptyLinha` — markup, sem estado), `src/data/lookups.mjs` (`getEmpresas`/`empNome`/`getIbge`/
`getOrigem`/`getEvLookups` + `preencherLookup`, com o cache explicitado) e os paginadores.

`activeLine` **não** vira import: chega pelo campo `line` do `ctx` da Fase A.

### A restrição que esta fase TEM de resolver

Quem executar decide **como**; o que não é opcional é resolver. Os fatos, conferidos:

- `bindLineRows` (`app.js:2865`) chama `selectLine`, `closeModal`, `toast` e lê `activeLine` — é
  composição de seleção, fechamento de modal e rota. Não é paginação: é **ação de shell**.
- `paginateLines` fixa `afterPaint: bindLineRows` (`app.js:2798`).
- `lineResults` chama `paginateLines` nos dois ramos (`app.js:2841`, `:2843`), e
  `renderLocalidadeSecoes` o chama direto (`app.js:2946`).
- `lineResults` tem **9 call sites**, e eles **não permanecem no `app.js`**: pertencem a famílias
  que C3 e C4 movem — `:1935` (`openEmpresaLigacoes`), `:1954` (`LOADERS.ligacoesPorEmpresa`),
  `:2035` (`LOADERS.ligacoesPorLogradouro`), `:2086` (`LOADERS.municipioRegiao`), `:2137` `:2141`
  `:2179` (`openLinhasPorIbge`), `:2267` `:2311` (`LOADERS.ligacoesPorTerminal`).

**Portanto:** um render de C3/C4 que virou ESM não alcança `lineResults`, `paginateLines` nem
`bindLineRows` se eles continuarem privados. Duas saídas, e a escolha é de quem executa a B2 — com
a obrigação de **mexer nas duas pontas**:

1. **expor o seam de seleção** — mover a família de listas com a ação de seleção injetada como
   callback. Custo: encadear o callback por `lineResults` até os 9 call sites. Esquecer um deixa
   as linhas daquela tela **renderizadas e não clicáveis**, sem erro no console;
2. **manter a família no `app.js`** — e então **reduzir o escopo declarado de C3/C4** para os
   renders que não listam linha, e dizer explicitamente em qual fase esses renders saem.

Escolher um lado sem ajustar a outra ponta é o erro que este plano já cometeu duas vezes.

---

## Fase C — documentos por família (4 sessões)

Famílias, do mais isolado para o mais acoplado. **Os tamanhos vêm do estudo de 10/08 e não foram
reconferidos** — meça antes de dimensionar a sessão:

| # | famílias |
|---|---|
| C1 | Frota · Histórico da linha · Itinerários |
| C2 | Estrutura · Tarifas · Portaria |
| C3 | Quadro de Horários · Empresas |
| C4 | Municípios · Localidades |

C4 por último: são os únicos com filtro de escopo, dois ramos de PDF e o bloco secundário cujo PDF
cobre os dois blocos.

**Cada fase C move a SUA família, no mesmo PR.** Não junte numa fase final: migrar tudo de uma vez
é o que o estudo proíbe, e concentra num commit só a superfície de regressão de ordem/TDZ.

**O que cada família consegue exportar varia, e é a primeira coisa a medir na sessão.** Alguns
loaders já delegam a um `render*` — `LOADERS.historicoLinha` (`app.js:1448`) chama
`renderLineHistory`, `LOADERS.quadroHorarios` (`:1676`) chama `renderLinhaQuadro`, `LOADERS.tarifas`
(`:1782`) chama `renderTarifas`/`tarifaEmpresaRun`, e os one-liners `itinerarios` (`:1504`), `frota`
(`:1835`) e `estrutura` (`:1873`) delegam via `lineDocView`. Outros têm a implementação dentro do
próprio loader. **Não há partição limpa** — uma versão anterior deste plano afirmou "3 assim, 14
assado" e estava errada. Abra o loader da família antes de planejar a sessão.

O registro `LOADERS` guarda **loaders**, nunca renders: o valor é invocado como função de carga
(`app.js:1253`, `:3179`). Depois da Fase A ele recebe `ctx`, e aí um loader exportado por módulo
pode entrar no registro — é o que torna a Fase D possível.

---

## Fase D — `LOADERS` como composição explícita

Entrega o item 4 do estudo: *"transformar o registro `LOADERS` em composição explícita. Não migrar
todos os loaders de uma vez."*

O tamanho é **consequência**: cada fase C que puder compor o loader da sua família já compõe, e a D
fica com o resto.

**O critério de saída depende do ramo escolhido na B2, e tratá-lo como único estava errado:**

- **ramo da opção 1** (seam de seleção exposto) — se a D estiver grande, **alguma fase C não
  terminou o próprio trabalho**; o tamanho é sinal de falha;
- **ramo da opção 2** (família de listas fica no `app.js`) — C3 e C4 terminam legitimamente com
  escopo reduzido, e os loaders que dependem da família de listas ficam adiados. A D **pode** ser
  grande com todas as fases C tendo cumprido exatamente o que declararam. Aqui o critério é outro:
  a D fecha quando tiver composto tudo que **não** depende da família de listas, e o restante é
  declarado como herança da E — nominalmente, não por omissão.

Os wrappers (`lineDocView`, `lineDocRun`, `lineSearchRun`, `searchPanel`) não são trabalho da D:
são shell, e saem na E.

---

## Fase E — infra do modal (opcional)

Chrome do modal e faixa de abas para `src/ui/`, mais o shell de busca de linha (`lineDocView`,
`lineDocRun`, `lineSearchRun`, `searchPanel`) e — se a B2 tiver escolhido a opção 2 — a família de
listas e os renders que a C tiver adiado.

É a área mais exercitada pelo `check_abas.mjs` e o ganho é menor que o das anteriores.

**Se ela é opcional depende do ramo da B2, e dizer "opcional" sem qualificar estava errado:**

- **ramo da opção 1** — a E é de fato **opcional**. Cortá-la deixa no `app.js` o shell do modal e o
  de busca de linha: escolha de escopo declarada, não dívida escondida;
- **ramo da opção 2** — a E deixa de ser cosmética e passa a ser **obrigatória para o plano
  fechar**, porque é a única fase que ainda moveria os documentos que C3/C4 adiaram
  (`ligacoesPorEmpresa`, `ligacoesPorLogradouro`, `municipioRegiao`, `ligacoesPorTerminal` e os
  demais que listam linha). Cortá-la nesse ramo é decisão legítima, mas então **o estado de parada
  precisa declarar esses documentos por nome** como permanentes no `app.js` — senão o plano termina
  afirmando ter movido o que não moveu.

Em qualquer um dos dois: quem cortar a E escreve aqui o que ficou.

---

## Critério de parada

Refatoração sem critério de parada é a mesma doença da crítica que originou este plano.

Uma fase só se justifica se **reduzir acoplamento**, não linhas. Sinais de parar e registrar:

- o módulo novo precisar receber mais de ~6 dependências **injetadas** — estado passado em
  parâmetro. `import` de módulo declarado **não conta**: importar `docHead` de `src/ui/doc.mjs` é
  dependência resolvida, não acoplamento a estado. O que faz mal é depender de coisa que **muda por
  baixo**, não de coisa que a função declara;
- o `app.js` passar a **exportar estado do IIFE** para alimentar o módulo;
- a fase exigir mudar query, chave ou schema (nenhuma exige — se exigir, o plano está errado).

Não há meta de linhas, de propósito. O que sobra no fim é wiring — bootstrap, referências de DOM,
listeners, rotas, composição — e wiring não é o defeito que a crítica apontou.

---

## Riscos, todos conhecidos por acidente deste repo

1. **`.vercelignore`** — uma linha por módulo novo, **sempre**. Import ES é atômico: um 404 mata o
   `app.js` inteiro e a tela fica vazia sem erro no console (10/08/2026). O `check.js` §[1] reprova
   nomeando o arquivo que ficou de fora. O smoke deriva os módulos dos `import` desde a Sessão 2 —
   se alguém reintroduzir lista manual em qualquer gate, trate como defeito, não como estilo.
2. **Hoisting/TDZ e ordem do `LOADERS`** — regras em [`../estrutura-frontend.md`](../estrutura-frontend.md).
3. **Fixtures do `check_views.mjs`** (`scripts/lib/rig.mjs`) — nome de coluna divergente chega
   `undefined` no render e a tela sai vazia **sem erro**: falso verde.
4. **`version.json` + `#verTag`** a cada fase que mexa em arquivo servido.

## Por que o site não corre risco enquanto nada entra na `main`

1. **Produção sai apenas da `main`.** Push em branch gera *preview deploy*, em domínio próprio. Os
   únicos caminhos para produção são o merge (auto-deploy) e a promoção manual pelo painel.
2. **Preview não alcança o banco de produção.** `HOSTS_PROD` é allowlist; host fora dela cai no
   banco de teste. Branch nova nasce apontando para teste, por desenho fail-closed.
3. **Zero SQL neste plano.** Nenhuma migração, query, chave ou policy.

A ressalva que mantém isso honesto: não mergear protege o **site**, não o **repositório**. O único
risco real mora no **merge** — a falha do `.vercelignore` é invisível no CI e só aparece na tela.
Daí a conferência do preview ser condição de merge, não formalidade.

## Protocolo

Uma fase = um PR = `@codex review`, gates verdes antes de abrir, **sem merge por conta própria**, e
conferência do preview pelo dono — o agente não alcança o domínio da Vercel (HTTP 000 medido).

## Verificação, por fase

```bash
node tests/check.js                    # sintaxe, allowlist, @canon, deriva docs×código, testes
node scripts/check_views.mjs           # as views num navegador headless
node scripts/check_abas.mjs            # abas + seletor de documentos   (obrigatório em A, D, E)
node scripts/check_selecao_linha.mjs   # seleção dentro do modal        (obrigatório em A, C)
./scripts/semgrep.sh                   # análise estática
```

As Fases A e C ganham, além disso, uma **prova por mutação**: trocar o corpo de um render movido e
confirmar que algum gate fica vermelho. Verde que não morde não é evidência — foi assim que
`matchEvent` passou meses coberto por uma guarda que só olhava a assinatura.
