# Renomear os tópicos da sidebar — plano para o Codex (30/07/2026)

> **EXECUTADO E CORRIGIDO — leia isto antes do resto.** O plano abaixo foi cumprido pelo PR #80,
> mas com o **mapeamento errado**: ele pôs `Itinerários` no tópico `doc` e `Ligações` no `lig`,
> invertendo os dois. O dono corrigiu no PR #81. **Os nomes finais são:**
>
> | `key` | `name` final |
> |---|---|
> | `doc` | **Linhas** |
> | `emp` | **Empresa** |
> | `lig` | **Itinerários** |
> | `ger` | **Portarias** |
> | (botão de busca) | **Buscar** |
>
> A seção "O mapeamento — e a única ambiguidade real" abaixo está **superada**: com `doc` =
> "Linhas", a colisão que ela previa (tópico e card com o mesmo nome) deixou de existir. O resto
> do documento — onde os rótulos vivem no código, o que não pode mudar, quais gates cobrem o quê
> — continua correto e é o motivo de ele ficar no repo.

Pedido do dono: trocar os rótulos dos tópicos do painel lateral para **Buscar, Ligações,
Empresa, Portarias, Itinerários**.

## O que a mudança realmente é

Os rótulos vivem em **um lugar só**: o array `SECTIONS` no `app.js` (seção `SEÇÕES / CARDS`,
~linha 240), no campo `name` de cada tópico — mais o rótulo fixo do botão de busca, que **não**
está em `SECTIONS` (é HTML literal dentro de `renderSideNav`, `app.js:362`).

Tudo o que mostra nome de tópico deriva desses dois pontos:

| Onde aparece | Código | Deriva de |
|---|---|---|
| Botão da sidebar | `app.js:366` — `${sec.name}` | `SECTIONS[].name` |
| Título do painel de conteúdo | `app.js:389` — `<h2>${sec.name}</h2>` | `SECTIONS[].name` |
| Cabeçalho de seção no seletor de documentos da aba ("+") | `app.js:1006` — `<h3>${esc(sec.name)}</h3>` | `SECTIONS[].name` |
| Botão "Buscar Linha" da sidebar | `app.js:362` (literal) | — |

Ou seja: **quatro strings em `SECTIONS` + uma string literal**. Não há tabela de tradução, não
há rótulo duplicado em `index.html`, e `docs/`, `tests/` e `scripts/` **não** contêm nenhum
desses rótulos (conferido por grep em todo o repo em 30/07/2026 — só há menções em comentários
de código, em `styles.css`, e no `docs/CHANGELOG.md`, que é snapshot datado e fica como está).

**O que NÃO muda, e não pode mudar:** as `key` dos tópicos (`doc`, `emp`, `lig`, `ger`). Elas
são o identificador de rota — `#/topico/<key>` — e alimentam `VIEW_TOPIC`, `DEFAULT_TOPIC` e as
comparações literais espalhadas pelo `app.js` (`key === 'doc'`, `currentTopicKey === 'doc'`,
`activeKey==='doc'`). Renomear `key` quebraria deep links já salvos por usuários e daria muito
mais trabalho, sem nenhum ganho visível. **Só o `name` muda.**

## O mapeamento — e a única ambiguidade real

A lista do pedido (`Buscar, Ligações, Empresa, Portarias, Itinerários`) não está na ordem da
tela. Por semântica, o mapeamento é:

| Hoje | Vira | Confiança |
|---|---|---|
| `Buscar Linha` (botão) | **Buscar** | alta |
| `Consultas de Ligações` (`lig`) | **Ligações** | alta |
| `Empresas` (`emp`) | **Empresa** | alta (singular, como pedido) |
| `Portarias` (`ger`) | **Portarias** | inalterado |
| `Documentos da Linha` (`doc`) | **Itinerários** | **baixa — ver abaixo** |

**A ambiguidade:** "Itinerários" já é o nome de um **card dentro** do tópico `doc`
(`app.js:246` — `['route','Itinerários',…,'itinerarios',false]`). Renomear o tópico para
"Itinerários" cria dois elementos com o mesmo nome na mesma tela, e no seletor de documentos da
aba fica literalmente um `<h3>Itinerários</h3>` sobre uma grade cujo primeiro card é
"Itinerários". Além disso o tópico `doc` contém Quadro de Horários, Tarifas, Frota, Histórico e
Estrutura Operacional — "Itinerários" descreve 1 dos 6 cards, não o conjunto.

**Decisão registrada:** o plano abaixo executa o que foi pedido (`doc` → **Itinerários**), com a
colisão sinalizada. Se o dono preferir, as saídas naturais são: (a) manter o tópico como
"Documentos" e não mexer; (b) chamar o tópico de "Linha" ou "Linhas"; (c) renomear o **card**
interno para "Itinerário por sentido" e deixar o tópico com o nome pedido. **Confirmar antes de
mergear** — é troca de uma string, reversível em 30 segundos em qualquer direção.

**Consequência secundária:** a `desc` do tópico `doc` (`app.js:244`) hoje começa com
"Itinerário, quadro de horários, tarifas…". Com o tópico chamado "Itinerários", a descrição
passa a repetir o título na primeira palavra. Vale reescrevê-la — proposta no prompt.

## Riscos e o que verificar

- **Nenhum teste do repo casa esses rótulos.** `tests/check.js`, `check_views.mjs` e
  `check_abas.mjs` navegam por `data-view` e por `key`, não por texto de tópico. A mudança
  **não deve** quebrar nada; se quebrar, é sinal de acoplamento que ninguém sabia que existia —
  relatar em vez de contornar.
- **CSS:** `styles.css` menciona os nomes antigos só em **comentários** (linhas ~199, ~212-213,
  ~868, ~873). Nenhum seletor depende de texto. Atualizar os comentários faz parte da entrega —
  este repo trata deriva docs×código como defeito (`tests/check.js` §[2b]).
- **Layout da sidebar:** os nomes novos são **mais curtos** que os atuais, então não há risco de
  quebra de linha nova. Ainda assim, conferir no `check_abas.mjs` e, se possível, no preview.
- **Carimbo de versão:** é mudança visível ao usuário → **bumpar `#verTag`** em
  `index.html:379` (hoje `build 28/07-A` → `build 30/07-A`).

---

# PROMPT PARA O CODEX

> Copie daqui para baixo. É autocontido.

Você trabalha no repositório `LucasMolinari9/LucasCTEC` (Portal DIVAT · DETRO/RJ — portal
público de consulta, **zero-build**: `index.html` + `styles.css` + `app.js`, sem framework e sem
`package.json`). **Leia o `CLAUDE.md` na raiz antes de começar** — ele tem regras que sobrepõem
seus padrões (CSP sem `unsafe-inline`, nada de `<script>` inline, todo CSS em classe).

Trabalhe numa branch, **nunca direto na `main`**.

## Tarefa

Renomear os rótulos dos tópicos do painel lateral. **Só os rótulos visíveis** — as `key` dos
tópicos (`doc`, `emp`, `lig`, `ger`) **não mudam**, porque são a rota `#/topico/<key>` e estão
comparadas literalmente em vários pontos do `app.js`. Se você se pegar editando uma `key`, parou
no lugar errado.

### T1 — Os quatro nomes em `SECTIONS` (`app.js`, seção `SEÇÕES / CARDS`, ~linha 240)

| `key` | `name` atual | `name` novo |
|---|---|---|
| `doc` | `Documentos da Linha` | `Itinerários` |
| `emp` | `Empresas` | `Empresa` |
| `lig` | `Consultas de Ligações` | `Ligações` |
| `ger` | `Portarias` | `Portarias` (sem mudança) |

Ao editar `doc`, reescreva também a `desc` dele — a atual começa com "Itinerário, quadro de
horários, tarifas, frota e histórico de cada linha regular." e passaria a repetir o título na
primeira palavra. Sugestão: `'Percurso, quadro de horários, tarifas, frota e histórico de cada
linha regular.'` (mantendo o padrão das outras: uma frase, o que o documento contém).

### T2 — O botão "Buscar Linha" (`app.js:362`, dentro de `renderSideNav`)

Ele **não** está em `SECTIONS` — é HTML literal:

```
<span class="t-ico">${svg(I.search)}</span>Buscar Linha
```

Trocar o texto para **`Buscar`**. Não mexa na classe `.side-search-btn` nem na lógica de
`searchOpen` / `toggleSearchCard`.

### T3 — Comentários que citam os nomes antigos

O repo trata deriva docs×código como defeito. Atualize as menções em **comentário** aos rótulos
antigos, preservando o sentido de cada explicação (várias delas explicam bugs reais já
corrigidos — **não apague a explicação, só corrija o rótulo**):

- `app.js`: linhas ~286, ~351-352, ~394, ~406-408, ~996, ~3019-3021 e o comentário de bloco em
  ~1224 (`/* ---- Documentos da Linha — busca embutida no card ---- */`).
- `styles.css`: linhas ~199, ~212-213, ~868, ~873.
- `index.html`: linha ~323.

Cuidado com dois pontos que **não** são o mesmo texto e podem confundir um find-and-replace cego:

1. `app.js:1019` — `searchPanel({ title:'Documentos da Linha', … })` dentro de `renderBlankTab`.
   Esse é o **título do painel de busca da aba em branco**, string de UI de verdade, não
   comentário. Troque para `'Buscar linha'` — ele rotula o campo de busca, não o tópico; deixar
   "Itinerários" ali seria errado, porque a aba em branco leva a **qualquer** documento.
2. `docs/CHANGELOG.md` cita os nomes antigos em entradas datadas. **Não toque** — CHANGELOG é
   snapshot histórico, e reescrever o passado é pior que a deriva.

### T4 — Carimbo de versão

`index.html`, `#verTag` (~linha 379): `build 28/07-A` → `build 30/07-A`.

### T5 — CHANGELOG

Adicione uma entrada nova no topo da cronologia de `docs/CHANGELOG.md` (data 30/07/2026),
curta: o que mudou, que as `key`/rotas ficaram intactas, e a colisão de nome descrita abaixo.

## O que você precisa reportar (não silenciar)

O nome novo do tópico `doc` — **Itinerários** — **colide com um card dentro dele mesmo**:
`['route','Itinerários',…,'itinerarios',false]`, o primeiro item de `SECTIONS.doc.items`. Depois
da sua mudança, o seletor de documentos da aba ("+") mostra um `<h3>Itinerários</h3>` sobre uma
grade cujo primeiro card também se chama "Itinerários", e a sidebar tem o mesmo nome em dois
níveis.

Isso foi **pedido explicitamente** pelo dono, então **execute assim**. Mas registre a colisão no
corpo do PR, com as três saídas possíveis, para ele decidir: (a) manter; (b) renomear o card
interno para "Itinerário por sentido"; (c) usar outro nome de tópico ("Linha" / "Documentos").
Não escolha por conta própria.

## Verificação antes de abrir o PR

Rode, nesta ordem, e só abra o PR com tudo verde:

1. `node tests/check.js` — gate de sempre (sintaxe do `app.js`, `<script>` inline, anti-drift
   dos harnesses, deriva docs×código §[2b], testes puros).
2. `node scripts/check_views.mjs` — abre as 17 views num navegador headless.
3. `node scripts/check_abas.mjs` — abas do modal + seletor de documentos; **é o que mais importa
   aqui**, porque o seletor renderiza `sec.name` diretamente.
4. `./scripts/semgrep.sh` — sem `--full` (o modo `--full` precisa de rede).

Nenhum desses gates casa os rótulos por texto (eles navegam por `data-view` e por `key`), então
a expectativa é que **todos passem sem ajuste**. Se algum quebrar, você encontrou um acoplamento
que ninguém documentou: **relate no PR em vez de contornar**.

Confira também, visualmente ou pelo HTML gerado, que a sidebar não ganhou quebra de linha nova
— os nomes novos são mais curtos que os antigos, então não deveria acontecer.

## O que vai ficar vermelho e NÃO é culpa sua

**Você não tem acesso à Vercel.** No PR, o workflow **`deploy-smoke.yml`** vai falhar ou nem
chegar a rodar, e isso é esperado — ele dispara no evento `deployment_status` da Vercel e
verifica headers, allowlist de arquivos e o isolamento do Supabase **na URL publicada**.
Depende de coisas que só o dono controla: a conexão do repo com o projeto Vercel e o secret
`VERCEL_AUTOMATION_BYPASS_SECRET` (hoje ausente — sem ele o smoke recebe a tela de login em vez
do portal e reprova de propósito).

**Não tente consertar esse vermelho.** Não mexa em `vercel.json`, não mexa no
`.github/workflows/deploy-smoke.yml`, não desabilite gate nenhum, não invente workaround. Nada
neste trabalho toca deploy, headers ou CSP — é troca de rótulo de UI. Se o `deploy-smoke` ficar
vermelho, escreva no corpo do PR uma linha dizendo que ele reprovou por falta de acesso/secret
da Vercel, sem relação com o diff, e siga.

Os quatro gates que **são seus** e precisam ficar verdes são os da seção acima: `check.js`,
`check_views.mjs`, `check_abas.mjs` e `semgrep.sh` (sem `--full`). Dois avisos sobre eles:

- `check_views.mjs` e `check_abas.mjs` precisam de **Chromium via Playwright** (versão fixa no
  repo). Se sua máquina não conseguir baixá-lo, diga isso no PR e deixe que o workflow
  `views.yml` rode por você no CI — mas **não** troque a versão do Playwright para contornar.
- `semgrep.sh --full` e os verificadores de banco (`check_deriva.mjs`, `check_realtime.mjs`,
  `check_data_quality.mjs`, `check_grants.mjs`) precisam de **rede até o Supabase**. Não são
  parte desta tarefa e você não deve rodá-los.

## Entrega

Commit descritivo, push com `git push -u origin <branch>`, e abra o PR **só se o dono pedir**.
No corpo do PR: a tabela de-para dos rótulos, a confirmação de que as `key`/rotas não mudaram,
o resultado dos quatro gates, e a colisão "Itinerários" com as três saídas.
