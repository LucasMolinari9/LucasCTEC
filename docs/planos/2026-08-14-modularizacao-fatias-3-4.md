# Plano — desmontar o monólito do `app.js` (fatias 3 e 4 do estudo)

Escrito em 14/08/2026. Diferente dos arquivos de `docs/historico/`, este é um plano **vivo**:
atualize-o conforme as fases forem entrando, e apague-o quando a última fechar.

**Linha de base:** todos os números abaixo valem para o `app.js` **depois da Sessão 2** (PR #125,
`src/domain/agrupamento.mjs`), ou seja **3.352 linhas**. Na `main` de hoje são 3.447.

## Por que

Uma crítica externa disse que o `app.js` é "um monólito de 3.500 linhas". Procede. As Sessões 1 e 2
do plano de 6 ([`../historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md))
responderam à crítica **irmã** — a de que o processo virou projeto paralelo — com ganho medível.
Mas o monólito mal foi arranhado: 3.447 → 3.352 linhas, **2,8%**. As Sessões 3 e 4, já
especificadas, movem mais funções puras pequenas: outras ~150 linhas. Terminadas as três, o
`app.js` fica perto de **3.200**. Continua monólito.

A massa está onde nenhuma sessão planejada toca:

| bloco (grep a marca da seção) | linhas | % do `app.js` |
|---|---|---|
| `MODAL / SISTEMA DE VIEWS` | 1.956 | 58,3% |
| `COMPONENTES AUXILIARES` | 299 | 8,9% |
| `SUPABASE CONFIG` | 171 | 5,1% |

Dois terços do arquivo. O estudo de 10/08
([`../historico/estudo-modularizacao-frontend-2026-08-10.md`](../historico/estudo-modularizacao-frontend-2026-08-10.md))
chama isso de fatias 3 e 4 e as **condiciona**, com razão: separar documentos "somente após injetar
explicitamente estado e render target; não exportar dezenas de variáveis do IIFE".

O diagnóstico concreto: um documento típico (`renderFrota`, seção `MODAL`) depende de 4 funções
puras, 4 helpers de DOM, 4 de I/O e — o problema — **lê `currentView`**, estado mutável de módulo.
Enquanto isso for verdade, mover o arquivo só troca um monólito por módulos rasos acoplados por
variável global. Seria piorar com aparência de melhorar.

## O que torna isto executável agora

**O padrão de injeção já existe no repo e está provado em produção.** O seam do `pdfHTML` fez
`paginate`, `paginateTable`, `paginateLines`, `lineResults` e `paginateEvents` receberem `view` e
`gen` **por parâmetro**, em vez de relerem `currentView`. As fases abaixo estendem essa mesma
disciplina ao resto — não é desenho novo.

**A leitura de estado global é estereotipada, não difusa.** `const view = currentView, gen =
beginGen(view)` aparece ~30 vezes, quase sempre como **primeira linha** do loader/render. Isso faz
da Fase A um trabalho mecânico e revisável, não uma cirurgia.

## Ordem — uma fase por sessão, um PR por sessão

| ordem | fase | entrega | risco |
|---|---|---|---|
| 1 | Sessão 3 (já especificada) | `src/domain/busca.mjs` | baixo |
| 2 | Sessão 4 (já especificada) | `src/domain/view-state.mjs` | médio (seam + Realtime) |
| 3 | **A** | contexto explícito — nenhum arquivo muda de lugar | médio |
| 4 | **B** | `src/data/rest.mjs` — **encerra o mecanismo `@canon`** | baixo |
| 5–8 | **C1…C4** | documentos por família | cresce a cada uma |
| 9 | **D** | `LOADERS` em composição explícita | médio |
| 10 | **E** | infra do modal (opcional) | médio |

**Por que a Sessão 4 antes da Fase A:** ela extrai `beginGen`/`isCurrentGen`/`commitViewResult`
como módulo puro sobre um objeto `view`. É exatamente o seam que a Fase A injeta — fazer A antes
seria injetar um contrato que ainda mora dentro do IIFE.

**Por que A antes de B, e por que a ordem quase não importa:** o `ctx` da Fase A carrega **só ciclo
de vida da view** (`view`, `gen`, `pane`) — não carrega acesso a dado. Logo A mexe na *primeira
linha* de cada render e B mexe nas *chamadas de `sbFetch`*: linhas diferentes, sem retrabalho. A vem
antes porque é a precondição declarada pelo estudo, e porque, se correr mal, descobrimos barato.

As Sessões 5 (custo do processo) e 6 (retomada do PR #98) do plano vigente não conflitam e podem
entrar em qualquer ponto desta fila.

---

## Fase A — contexto explícito (precondição de tudo)

Nenhum arquivo muda de lugar. Muda o **contrato**.

- Cada `render*`/loader passa a **receber** `ctx = { view, gen, pane, host }` de quem o chama, em
  vez de abrir com `const view = currentView, …`. Quem monta o `ctx` são os pontos que já conhecem
  a view: `runView`, `lineDocView`, `lineDocRun`, `lineSearchRun` e `searchPanel`.
- `currentView` continua existindo e continua sendo escrito só por `setCurrentView`. O que acaba é
  **ler** essa variável de dentro de um documento.
- Duas exceções ficam como estão, e por motivo documentado: `_panelRun` está fora do seam de
  propósito (é atribuído antes de qualquer `await`, então não há corrida a proteger), e os 4 call
  sites com `pdf:false` seguem passando `view`/`gen`.

**Como se sabe que deu certo:** `check_views.mjs`, `check_abas.mjs` e `check_selecao_linha.mjs`.
Os três existem exatamente para a classe de bug que esta fase pode introduzir — resposta atrasada
pintando a aba errada.

## Fase B — módulo profundo de acesso REST

`src/data/rest.mjs`: `sbFetch`, `fetchComTimeout`, timeout/retry, `marcarTrunc`/`bannerTrunc`,
`SB_MAX_ROWS`, `selecionarSupabase`. Só entra se a interface **esconder** timeout, retry e
truncagem — condição literal do estudo. Config (URL, chave, `fetch`) injetada, não lida de global.

**O marco que esta fase fecha:** [`../../tests/harness.js`](../../tests/harness.js) guarda as **12
últimas cópias `@canon`** do repositório. Depois das Sessões 3 e 4, o `pure.harness.js` fica com
**zero**. Portanto, ao fim da Fase B **não sobra nenhuma cópia verbatim** — e
[`../../tests/canon.js`](../../tests/canon.js) (56 linhas) e
[`../../tests/drift.test.js`](../../tests/drift.test.js) (72) se aposentam, junto com a §[2] do
`check.js`. São ~430 linhas de processo apagadas por terem **perdido o objeto**, não por corte de
rigor. É a resposta definitiva à crítica nº 1.

## Fase C — documentos por família (4 sessões)

1.280 linhas em 10 famílias, do mais isolado para o mais acoplado:

| # | famílias | linhas |
|---|---|---|
| C1 | Frota (37) · Histórico da linha (24) · Itinerários (51) | 112 |
| C2 | Estrutura (87) · Tarifas (109) · Portaria (77) | 273 |
| C3 | Quadro de Horários (185) · Empresas (172) | 357 |
| C4 | Municípios (310) · Localidades (228) | 538 |

C4 por último: são os únicos com filtro de escopo, dois ramos de PDF e o bloco secundário cujo PDF
cobre os dois blocos — logo não pode ser sobrescrito pelo paginador.

## Fase D — `LOADERS` em composição explícita

Cada módulo de família exporta seus loaders; o `app.js` compõe o registro. O estudo é explícito:
**não migrar todos de uma vez** — por isso vem depois da C, quando todos já estarão em módulos.

## Fase E — infra do modal (opcional)

Chrome do modal (95) + faixa de abas (346) = 441 linhas para `src/ui/`. É a área mais exercitada
pelo `check_abas.mjs` e o ganho é menor que o das anteriores. **Só fazer se A–D correrem sem
sustos** — é a primeira candidata a ser cortada.

---

## Projeção honesta

| etapa | `app.js` |
|---|---|
| após a Sessão 2 | 3.352 |
| após as Sessões 3–4 | ~3.200 |
| após a Fase B | ~3.030 |
| após a Fase C | ~1.750 |
| após D+E | **~1.250** |

Não vai a zero, e não deve: o que sobra é wiring de verdade — bootstrap, referências de DOM,
listeners, rotas, composição. Um arquivo de 1.250 linhas de ligação não é o defeito que a crítica
apontou.

## Critério de parada

Este plano tem fim declarado, de propósito — refatoração sem critério de parada é a mesma doença da
crítica nº 1 por outra porta.

Uma fase só se justifica se **reduzir acoplamento**, não linhas. Sinais de parar e registrar em vez
de empurrar:

- a interface do módulo novo precisar receber mais de ~6 dependências;
- o `app.js` passar a **exportar estado do IIFE** para alimentar o módulo;
- a fase exigir mudar query, chave ou schema (nenhuma delas exige — se exigir, o plano está errado).

## Riscos, todos já conhecidos por acidente deste repo

1. **`.vercelignore`** — uma linha por módulo novo, **sempre**. Import ES é atômico: um 404 mata o
   `app.js` inteiro e a tela fica vazia sem erro no console (10/08/2026). O `check.js` §[1] reprova
   nomeando o arquivo que ficou de fora.
2. **Hoisting/TDZ e ordem do `LOADERS`** — regras em [`../estrutura-frontend.md`](../estrutura-frontend.md).
3. **Fixtures do `check_views.mjs`** (`scripts/lib/rig.mjs`) — nome de coluna divergente chega
   `undefined` no render e a tela sai vazia **sem erro**: falso verde.
4. **`version.json` + `#verTag`** a cada fase, porque todas mexem em arquivo servido.

## Por que o site não corre risco enquanto nada entra na `main`

Registrado aqui porque o dono perguntou explicitamente. São três camadas independentes, conferidas
contra o repo:

1. **Produção sai apenas da `main`.** Push em branch gera *preview deploy*, em domínio próprio; o
   domínio canônico segue servindo o último build da `main`. Os únicos caminhos para produção são o
   merge (auto-deploy) e a promoção manual pelo painel da Vercel.
2. **Preview não alcança o banco de produção.** `HOSTS_PROD` é allowlist; host fora dela cai no
   banco de **teste**. Branch nova nasce apontando para teste, por desenho fail-closed.
3. **Zero SQL neste plano.** Nenhuma migração, query, chave ou policy. Só JavaScript mudando de
   arquivo.

A ressalva que mantém isso honesto: não mergear protege o **site**, não o **repositório** — e é a
proteção certa, porque commit ruim em branch é reversível e invisível para o usuário. O que essa
regra **não** cobriria seria mudança de banco, que é compartilhado e lido ao vivo; não é o caso
aqui. O único risco real mora no **merge**, não na branch: a falha do `.vercelignore` é invisível
no CI e só aparece na tela. Daí a conferência do preview ser condição de merge, não formalidade.

## Protocolo, inalterado

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
