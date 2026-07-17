# Análise de Separação Lógica × Apresentação — Portal DIVAT

> **Tipo:** relatório de análise. O diagnóstico é somente leitura; a **única exceção é o S1**, que
> foi **corrigido a pedido do dono** (ver a marca ✅ na seção) — os demais itens seguem apenas
> diagnóstico. Nenhuma operação de banco foi executada. As referências `index.html:NNN` são de antes
> da correção do S1; como o JS é um único bloco, os números deslocam a cada edição — confira sempre
> pelo **trecho de código citado**, não só pela linha.

## Contexto e escopo

O frontend é **um único `index.html`** com JS embutido (~2,7k linhas). **Não é React** — não há
componentes, hooks nem "container/presentational" no sentido literal. A fronteira equivalente aqui é
**"função pura (lógica/dados) × código de render/DOM (apresentação)"**, que também é a fronteira de
**testabilidade**: só o que é puro tem teste em `tests/` (via cópia verbatim no `*.harness.js`).

A **deduplicação já foi feita** numa sessão anterior (D1–D5 do `analise-duplicacao.md`). Os helpers
estão no código: `searchLines` (1466), `lineSearchRun` (1472), `searchEmpresas` (898),
`empresaChooserHTML` (2591), `bindEmpresaRows` (2597), `distinctCods` (2523), `fetchLinesByCods`
(2525). Portanto **este documento não repete aquela análise** — foca no que sobra: **regras de
negócio embutidas no render**.

**Conclusão antecipada:** a camada de reuso está boa. O acoplamento que resta é, na **grande
maioria, glue de uso único** — extrair seria criar abstração para um único chamador (contra
`CLAUDE.md` §2 "Simplicity First") e/ou adicionar cópia no harness (a duplicação que o dono **não
quer**). Há **dois achados reais** que valem decisão, destacados abaixo com ★.

---

## Como o portal já está bem separado (para não mexer)

| Camada | Papel | Onde |
|---|---|---|
| **Dados / fetch** | busca isolada do render | `sbFetch`, `fetchLinesByCods` (2525), `fetchQHByLines` (1725), caches `getEmpresas`/`getIbge`/`getOrigem`/`getEvLookups` |
| **Busca/listagem** | resolvedores reutilizáveis | `searchLines`, `lineSearchRun`, `searchEmpresas`, `empresaChooserHTML`, `bindEmpresaRows`, `distinctCods`, `lineResults` |
| **Builders de HTML puros** | linhas → string | `secoesTarifasHTML` (1656), `itinerarioTableHTML` (1669), `quadroHorariosBodyHTML` (1682), `frotaBlockHTML` (1734), `evBandHTML`/`evBlocksHTML` (1544/1540), `tableHTML`, `metaRows` |
| **Utils puros testados** | formatação/escape/filtro | `fmtCode`, `fmtTime`, `fmtDate`, `esc`, `norm`, `orDash`, `boolChip`, `matchEvent`, `groupBy`, `countBy`, `fmtMoney`, `yearOf`, `rowMatchesActiveLine`, `sbFetch` |

Estas **não devem ser mexidas**: já são definição única e as puras são guardadas pelo `check.js`.

---

## Sumário dos achados residuais

| ID | Padrão (regra embutida no render) | Onde | Vale extrair? |
|----|-----------------------------------|------|:-------------:|
| **S1 ★** | "Linha ativa" com **3 definições divergentes** — regra agora decidida | folhaRosto / relatórios / empresasRegulares | ✅ **Corrigir** contagem de `empresasRegulares` |
| **S2 ★** | Dedup de empresa por RJ (heurística de "score") | `empresasRegulares` 1977-1982 | ✅ **Sim** (sutil + consequente) |
| S3 | Agregações de relatório inline (count/sum/sort) | `relatoriosGerenciais`, `frotaPorEmpresa` | 🟡 Opcional (uso único) |
| S4 | Regra `vigente` de tarifa | `renderTarifas` 1902 | ➖ Não (uso único) |
| S5 | Ordenação/normalização de sentido | `itinerarioTableHTML` 1671-1672 | ➖ Não (já num builder) |
| S6 | Predicados de filtro dentro de `paint()` | ~8 cards | ➖ Não (triviais, uso único) |
| S7 | Formatação de tarifa reinventada (não usa `fmtMoney`) | `renderFolhaRosto` 1502 | ➖ Trivial (reuse-miss) |

---

## S1 ★ — "Linha ativa": regra decidida (o achado principal)

A pergunta "esta linha está ativa?" é uma **regra de negócio** e estava escrita **inline em cada
card, com critérios divergentes** — cada tela olhava um conjunto diferente de flags:

| Local | Código atual | Flags | Bate com a regra? |
|---|---|:--:|:--:|
| `relatoriosGerenciais` (2303) | `!r.cancelado && !r.paralisado` | 2 (canc, paral) | ✅ já correto |
| `renderFolhaRosto` (1503) | chips dos 4 status, senão "Ativa" | 4 | ⚠️ é rótulo, ver abaixo |
| `empresasRegulares` (1975) | `if(!r.cancelado)` | 1 (só canc) | ❌ conta paralisadas como ativas |

**Regra canônica (confirmada pelo dono, 2026):**

> **Uma linha está ATIVA quando está operando: `ativa = não cancelada e não paralisada`.**
> **Sub judice** (pendência só na Justiça — a linha continua rodando) e **transferida** (mudou de
> operadora, mas continua rodando) **contam como ATIVAS**. Só **cancelada** (extinta) e
> **paralisada** (parada) tiram a linha de "ativa".

**O que isso resolve, tela por tela:**
- **Relatórios Gerenciais** (2303): já usa `!cancelado && !paralisado` → **já está correto**, nada muda.
- **Empresas Regulares** (1975): hoje conta como ativa qualquer linha `!cancelado`, **ignorando a
  paralisada**. Pela regra, **paralisada não é ativa** → a contagem "Linhas ativas" da empresa está
  **inflada** hoje (paralisadas entram na conta). É o **único ponto que precisa mudar de fato**:
  `if(!r.cancelado && !r.paralisado)`.
- **Folha de Rosto** (1503): não é a mesma pergunta — é um **rótulo de status detalhado** que mostra
  qual dos 4 status a linha tem. Pela regra, uma linha só `sub_judice` (ou só `transferida`) **é
  ativa**, mas a Folha mostra só o chip "Sub judice"/"Transferida" e esconde o "Ativa". Isso é uma
  **escolha de exibição** (informar o status jurídico), não erro de contagem — se quiser consistência
  visual, poderia mostrar **"Ativa · Sub judice"** (as duas coisas). Decisão de UX, opcional.

**Por que agora vale extrair:** com a regra **decidida**, `isLinhaAtiva(r)` (= `!r.cancelado &&
!r.paralisado`) deixa de ser abstração especulativa — ela **corrige a contagem das Empresas**,
separa a lógica do render e vira teste (o critério fica num lugar só). É o caso em que a extração
paga o próprio custo: **Relatórios e Empresas passam a chamar a mesma função**, e a Folha de Rosto
pode reusá-la só para decidir se acrescenta o "Ativa".

**✅ Status: CORRIGIDO.** Foi extraída a função pura `const isLinhaAtiva = r => !r.cancelado &&
!r.paralisado;` (junto aos utils, logo após `boolChip`), com teste em `tests/pure.test.js` (8 casos,
incluindo sub judice/transferida = ativas) e cópia guardada pelo anti-drift do `check.js`.
`empresasRegulares` passou a usá-la — **e o SELECT agora traz `paralisado`, que antes não era
buscado** (sem isso a correção seria um no-op) — e `relatoriosGerenciais` também aponta para a mesma
função. `node tests/check.js` verde. A **Folha de Rosto não foi tocada** (segue com o rótulo
de status detalhado; ajustar para exibir "Ativa · Sub judice" fica como decisão de UX futura).

---

## S2 ★ — Dedup de empresa por RJ (`empresasRegulares` 1977-1982)

Único trecho de lógica **algorítmica e consequente** ainda inline no render:

```js
const best = {};
(empresaList||[]).forEach(e=>{ const k=e.codempresa; if(k==null) return;
  const sc = (!e.cassada && String(e.situacao||'').toUpperCase()==='REGULAR')?2:(!e.cassada?1:0);
  if(!(k in best) || sc>best[k]._s) best[k] = {...e, _s:sc}; });
```

Escolhe **uma** entrada por RJ quando o cadastro tem duplicatas, priorizando REGULAR/não-cassada
(é o que "resolve o RJ 103", conforme o comentário do código). É **sutil** (heurística de score),
**fácil de quebrar sem perceber** e tem **efeito visível** (qual empresa aparece na lista).

**Veredito: ✅ vale extrair** — `dedupEmpresasPorRJ(empresaList)` puro + teste. É o único ponto onde
a testabilidade compensa a cópia no harness, porque a regra é não-óbvia e o erro é silencioso. O
resto do loader (contagem de linhas, filtro situação+texto, HTML) continua sendo glue de uso único
e **não** precisa sair.

---

## S3 — Agregações de relatório inline (opcional)

`relatoriosGerenciais` (2302-2306) e `frotaPorEmpresa` (2327-2336) fazem **transformação pura de
dados** (contagem, soma, `groupBy`, `sort`, top-15) escrita **no meio da montagem do HTML dos KPIs**:

```js
const total=rows.length;
const ativas=rows.filter(r=>!r.cancelado&&!r.paralisado).length;   // ver S1
const porEmp = [...countBy(rows, r=>r.codempresa||'—')].sort((a,b)=>b[1]-a[1]).slice(0,15);
```

Dá para separar em `buildRelatorioKPIs(rows)` / `agregaFrotaPorEmpresa(rows)` puros → o loader só
pega os números e monta os cards. **Testável e limpo.** Mas cada um é **de uso único** (um relatório
só), então por `CLAUDE.md` §2 é **opcional / baixa prioridade** — só faça se quiser cobrir os
números dos relatórios com teste. (A parte `ativas` reusaria a decisão de **S1**.)

---

## S4 — Regra `vigente` da tarifa (não extrair)

`renderTarifas` (1902): `const vigente = r => !r.cancelado && !r.paralisado && !r.sub_judice && !r.transferido;`

Usada só dentro do próprio card (o filtro Todas/Vigentes/Inativas). **Uso único** — `renderEstrutura`
mostra as seções **sem** esse filtro (passa `secoesTarifasHTML(secoes)` cru, 1959). Extrair só
adicionaria cópia no harness para uma regra de um chamador. **Deixar como está.** (É a mesma fórmula
de 4 flags do S1, mas no nível **seção/tarifa**, não linha — por isso não se funde com o S1.)

---

## S5 — Ordenação/normalização de sentido (já está no lugar certo)

`normSentido` (1653) + `SENTIDO_ORDER` (1652) + o sort em `itinerarioTableHTML` (1671-1672) são
lógica de apresentação **já dentro de um builder puro** que recebe `rows` e devolve string. É
exatamente o padrão desejado. **Nada a fazer.**

---

## S6 — Predicados de filtro dentro de `paint()` (não extrair)

Quase todo card com filtro tem uma closure `paint()` que mistura **predicado + HTML + `.innerHTML`**.
Ex.: `secoesPorLigacao` (2287), `empresasRegulares` (1996), `renderTarifas` (1907), `renderItinerarios`
(1772), `secoesPorEmpresa`. Os predicados são **triviais e de uso único** — quase todos
`norm(campo).includes(q)`:

```js
const f = q ? rows.filter(r=>norm(`${orDash(r.secao)} ${r.nome_ligacao||''}`).includes(q)) : rows;
```

Já reusam o util puro `norm` (testado). Puxar cada predicado para função nomeada seria abstração
sem segundo chamador. **Deixar como está** — a apresentação (o `paint`) e a lógica (o `norm`) já
estão na granularidade certa. (O único filtro com regra de domínio é o de situação de empresa em
`empresasRegulares` 1999, que se liga ao **S1/S2**.)

---

## S7 — Formatação de tarifa reinventada (trivial)

`renderFolhaRosto` (1502) formata moeda à mão em vez de usar o `fmtMoney` que já existe e é testado:

```js
const tarifa = tv != null ? 'R$ '+Number(tv).toFixed(2).replace('.',',') : '—';   // ≈ 'R$ '+fmtMoney(tv)
```

É um **reuse-miss** minúsculo (não é regra de negócio, é formatação). Diferença de comportamento:
`fmtMoney` usa `toLocaleString('pt-BR')` (separador de milhar), o inline não. **Baixíssima
prioridade** — anotado só para completude; trocar exigiria conferir que o separador de milhar é
desejável na Folha de Rosto.

---

## Recomendação de escopo

1. **Não fazer refatoração especulativa.** Com a deduplicação já concluída, o acoplamento restante
   é majoritariamente glue de uso único; extrair violaria "Simplicity First" e/ou adicionaria a
   duplicação no harness que o dono não quer.
2. **S1 já está decidido:** `ativa = não cancelada e não paralisada` (sub judice e transferida
   contam como ativas). A ação concreta que sobra é **corrigir a contagem inflada** de "Linhas
   ativas" em `empresasRegulares` (hoje só olha `cancelado`, deixando paralisadas na conta) — de
   preferência via `isLinhaAtiva(r)` reusada por Relatórios e Empresas.
3. **Se (e só se) quiser uma extração com teste,** o único item que a justifica sozinho é o
   **S2** (`dedupEmpresasPorRJ`). Os demais (S3 opcional; S4–S7 não) não pagam o custo.
4. **Garantia de não-regressão:** qualquer um desses passos mexe apenas em render/DOM ou adiciona
   função pura nova; as funções guardadas ficam byte-idênticas, o HTML e as queries continuam
   iguais, e `node tests/check.js` deve seguir verde. **Nada aqui altera dados nem toca no banco.**

> **Este documento é só o diagnóstico. Nenhuma mudança foi aplicada ao `index.html`.**
