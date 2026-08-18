# Seções de tarifa nos modos por Município — design

Data: 2026-08-18

## Contexto

O card **Linhas por Localidade e Município** tem 5 modos de busca (`LOC_FILTERS`, `app.js`).
Os 3 modos por **Localidade** (`kind:'localidade'`) já mostram, para cada linha do resultado,
a tabela de seções de tarifa (Nome da Seção / Tipo / Tarifa) daquela linha, via
`renderLocalidadeSecoes`/`pintarLocalidadeSecoes` — a seção mostrada é filtrada: só entra a
seção de `tarifa_atual_teste` cujo `nome_ligacao`/`nome_ligacao_cresc` casa o termo digitado.

Os 2 modos por **Município** (`kind:'municipio'`: "Do Município A para o Município B" e
"Trafegam nos municípios A e B") usam `mostrarLinhasEntreMunicipios` →
`mostrarLinhasResultado`, que pinta o resultado com `lineResults` — uma tabela simples de
linhas (Empresa/RJ/Código/Número/Nome/Via/Característica/Tipo), sem seção nem tarifa.

## Pedido

Nos modos por Município, mostrar também a seção de tarifa e o valor de cada linha do
resultado, no mesmo formato visual do modo Localidade (agrupado por empresa, cabeçalho
clicável por linha + tabela de seções embaixo).

## Decisão: quais seções aparecem

Ao contrário do modo Localidade, a busca por Município não tem um "nome" para filtrar seção
por texto — é uma busca geográfica pelo itinerário. Decisão (confirmada com o usuário): mostrar
**todas as seções cadastradas de cada linha** (a tabela de tarifa inteira daquele `codlinha`),
sem tentar casar nome de seção com nome de município.

## Mudanças

### 1. `mostrarLinhasResultado(host, cods, titulo)`

Depois de buscar as linhas (`fetchLinesByCods`, já existe), busca em `tarifa_atual_teste`
**todas** as seções dos `codlinha` encontrados (mesmo padrão de query que
`mostrarLinhasPorLocalidade` já faz, mas **sem** o filtro `orIlike` por nome):

```
sbFetch('tarifa_atual_teste',
  `codlinha=in.(${cods.map(enc).join(',')})&select=codlinha,secao,nome_ligacao,nome_ligacao_cresc,tipo_ligacao,tarifa,situacao&order=codlinha,secao&limit=5000`)
```

Agrupa por `codlinha` (`groupBy`, já existe) → `secByLine`. Troca a chamada final de
`lineResults(...)` para `renderLocalidadeSecoes(host, rows, secByLine, { prefixHTML, view, gen, ... })`
(ver item 2 para os parâmetros novos de texto).

O contador do `prefixHTML` ganha quantas linhas têm seção cadastrada (mesmo padrão do modo
Localidade: `${comSecaoN} com tarifa cadastrada`).

### 2. `renderLocalidadeSecoes` / `pintarLocalidadeSecoes` — parametrizar o texto do bloco "sem seção"

Hoje o bloco de linhas sem seção usa texto fixo (`LOC_SEM_SECAO_OBS` e o subtítulo
`"por itinerário ou nome"`), que descreve o motivo específico do modo Localidade (a linha
entrou pela busca ampla — nome/itinerário/município — mas nenhuma seção bateu o NOME
buscado). Isso não se aplica ao modo Município (lá a linha pode simplesmente não ter nenhuma
seção cadastrada).

Adicionar opções (com o comportamento atual como padrão, para não mudar o modo Localidade):

- `semSecaoSub` (default `'por itinerário ou nome'`) — texto entre o título "Outras linhas" e
  a contagem; vazio omite o "· " que o precede.
- `semSecaoObs` (default `LOC_SEM_SECAO_OBS`) — frase abaixo do cabeçalho.

`renderLocalidadeSecoes` repassa as duas para `pintarLocalidadeSecoes`, que usa nelas em vez
das constantes fixas.

Chamada do modo Município passa:
- `semSecaoSub: ''`
- `semSecaoObs: 'Ligam os municípios buscados, mas não têm seção de tarifa cadastrada.'`

### Fora de escopo

- `mostrarLinhasPorLocalidade` (modo Localidade): sem mudança de comportamento (usa os
  defaults dos novos parâmetros).
- `openLinhasPorIbge` ("Linhas no Município", quando só o campo A é preenchido): tela
  separada, não tocada.
- `VIEW_TABLES.localidades` já inclui `tarifa_atual_teste` — Realtime já cobre a mudança, sem
  necessidade de mexer nisso.

## Efeito colateral esperado (aceito)

O checkbox "Agrupar por empresa" desaparece nesses dois modos — a lista de seções sempre
agrupa por empresa (mesmo comportamento do modo Localidade hoje).

## Verificação

- `node tests/check.js` (gate padrão).
- `node scripts/check_views.mjs localidades` — cobre hoje só o modo Localidade padrão
  (filtro índice 0, busca "rio"); avaliar na hora de implementar se vale adicionar um caso para
  um dos modos por Município (índice 3 ou 4) no mesmo script, já que o caminho de render mudou
  de `lineResults` para `renderLocalidadeSecoes` — se a fixture do `rig.mjs` não cobrir dois
  municípios com itinerário cruzando, pode precisar de um ajuste pontual na fixture.
- Conferência manual no preview (deploy de branch): rodar os dois modos de Município com os
  mesmos municípios do exemplo do usuário e comparar visualmente com o modo Localidade.
