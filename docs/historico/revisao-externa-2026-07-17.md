# Revisão externa do projeto — 17/07/2026

> **Snapshot de 17/07/2026 — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`;
> a cronologia, no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma sessão e envelhece
> de propósito.

Registro de uma **avaliação externa** do portal DIVAT (banco + repositório, feita pelo modelo
**Qwen**) e do que foi decidido a partir dela. Segue o mesmo espírito do registro anterior
(`revisao-externa-2026-07-16.md`, do Kimi K3): cada apontamento foi **conferido contra o código e o
banco reais** antes de virar mudança. Diferente da rodada anterior, **todos os pontos válidos foram
resolvidos nesta** (o dono pediu explicitamente "resolver tudo, não só documentar").

> **Como ler:** ✅ resolvido nesta rodada · a coluna "Confere?" diz se a afirmação bateu com a
> realidade (✅ confirmado · 🟡 parcial/exagerado · ❌ refutado).

## Placar

| # | Apontamento | Confere? | Status | Onde |
|---|---|---|---|---|
| 1 | `cod_origem` com 2 significados (e 2 tipos) | ✅ (pior: +2 tipos) | ✅ resolvido | banco + `index.html` + docs |
| 2 | Placares de teste desatualizados na doc | ✅ | ✅ resolvido | `tests/README.md`, `docs/historico/analise-separacao.md` |
| 3 | `tables:[]` ignorado pelo `searchPanel` (API enganosa) | ✅ | ✅ resolvido | `index.html` |
| 4 | `supabase-js` da CDN sem versão fixa/SRI | ✅ | ✅ resolvido | `vendor/`, `index.html`, `vercel.json` |
| 5 | Truncagem silenciosa | 🟡 (1 furo, não "vários") | ✅ resolvido | `index.html` |
| 6 | `RT_TABLES` × `VIEW_TABLES` sem teste | 🟡 (teste existe; faltava check vivo) | ✅ resolvido | `scripts/check_realtime.mjs`, banco |
| 7 | Typo `cod_origen` no banco | ✅ | ✅ resolvido | banco + `index.html` + docs |
| 8 | Snapshot de rollback inacessível/sem local | 🟡 (parcial) | ✅ resolvido | `scripts/gen_security_snapshot.sql`, `CLAUDE.md` |
| 9 | Comentário RLS staging só no CLAUDE.md | ❌ (já estava no SQL) | ✅ lacuna fechada | `docs/backup_schema.sql` |
| 10 | `ativa` vs `vigente` (regras diferentes) | ✅ | ✅ resolvido | `index.html`, `tests/` |

**Precisão do Qwen:** forte no geral (6 confirmados). Exagerou no **#5** (é 1 furo isolado, não
"vários loaders"), errou no **#6** (o teste `realtime.test.js` já existe e guarda `VIEW_TABLES ⊆
RT_TABLES`) e no **#9** (a intenção do RLS-sem-policy já estava comentada no `backup_schema.sql` e no
`schema.md`, não só no `CLAUDE.md`). Vários outros itens o `CLAUDE.md` já registrava como tradeoff
conhecido — o que muda a prioridade, não a validade.

## O que foi resolvido

Dois commits na branch de review (`claude/qwen-bank-repo-review-*`), mesclados na `main`. Todos os
testes verdes (`node tests/check.js` — pure 122 / realtime 94 / sbFetch 28).

### ✅ 1 · `cod_origem` desambiguado (banco + código)
O mesmo nome carregava **dois significados** e **dois tipos**: em `itinerario_teste`, `cod_origem`
(`int`) é **código IBGE de município** (o código faz `ibge[r.cod_origem]`, e filtra por `codibge`);
em `origem_teste`/`qh_*` é **terminal/origem** (`origemMap`). Renomeada a coluna do itinerário para
**`cod_municipio_origem`**; assim `cod_origem` = terminal em todo lugar. Acompanharam o rename: o
índice (`idx_itinerario_cod_municipio_origem`), a **função viva `divat_linhas_regiao`** (o front a
chama via RPC — recriada com o nome novo) e o harness/testes de `classifyMunLines`. O tipo `varchar`
vs `int` (dados 100% numéricos) foi deixado como está — o JS usa como chave de objeto (string dos
dois jeitos); unificar tipo teria risco de ETL sem ganho funcional.

### ✅ 7 · Typo `cod_origen` corrigido
A coluna existia grafada com **N** (`cod_origen`) só em `qh_intervalo_teste` (todas as irmãs usam
`cod_origem`). Renomeada para `cod_origem` no banco (+ índice `idx_qh_intervalo_cod_origem`) e nos 7
pontos do `index.html`. Depois de #1 e #7, `cod_origem` = terminal e `cod_municipio_origem` = município.

> **Cutover (#1 e #7):** renomear coluna quebra o site publicado até o redeploy (o código antigo pede
> os nomes antigos). Sequência usada: backup fresco → código/docs/testes na branch → migração no banco
> → merge na `main` (Vercel republica) → **o dono atualiza o mapeamento do ETL** para os nomes novos
> (senão a próxima carga recria as colunas velhas). Migração aplicada e verificada (colunas, índices,
> função, realtime). Reversível por rename de volta.

### ✅ 2 · Placares de teste
`tests/README.md` dizia `56/56` (real 115) e `docs/historico/analise-separacao.md` dizia `69/69` (real 237).
Em vez de só corrigir os números (que voltam a driftar a cada teste novo), **removeram-se as contagens
fixas da prosa** — a contagem autoritativa sai de `node tests/check.js`. `realtime.test.js` passou a
ser citado no README.

### ✅ 3 · `tables:[]` morto no `searchPanel`
`searchPanel({...})` nunca desestruturou `tables` — o arg ficava morto em ~10 chamadas (quem controla
o Realtime é `VIEW_TABLES[view]` via `runView`). Removidos os args mortos; as chamadas de `runView`
(que **usam** `tables`) ficaram intactas.

### ✅ 4 · `supabase-js` vendorado (fecha o item ⏳1 do Kimi, 16/07)
Era `@supabase/supabase-js@2` (major flutuante) da jsDelivr, sem SRI. Como o ambiente do Claude
bloqueia a jsDelivr mas libera o **npm**, baixou-se o pacote via `npm pack`, **conferiu-se a
integridade sha512** contra o registro, e o build UMD (`dist/umd/supabase.js`) foi **vendorado** em
`vendor/supabase-js-2.110.7.min.js` (mesma origem, versão fixa, sem terceiro em runtime). O
`script-src` da CSP (`vercel.json`) não lista mais o jsDelivr. Resolve de vez o supply-chain que o
Kimi apontou e o dono adiara.

### ✅ 5 · Truncagem silenciosa (1 furo real)
O sistema de aviso (`marcarTrunc`/`bannerTrunc`) já cobria a maioria dos loaders. O furo era o corte
`linhasTable(f.slice(0,300))`: `slice` cria array novo e **não copia** a flag não-enumerável `_trunc`,
então 300+ linhas sumiam sem aviso. Agora repõe `_trunc`/`_limite` à mão quando corta.

### ✅ 6 · Checagem viva do Realtime
O offline `realtime.test.js` já garantia `VIEW_TABLES ⊆ RT_TABLES` — o que faltava era comparar com a
**publicação real do Postgres** (hoje uma lista hardcoded que pode driftar). Criados: a função RPC
`public.realtime_tables()` (SECURITY DEFINER, read-only, EXECUTE p/ anon — não vaza nada, `RT_TABLES`
já é público) e `scripts/check_realtime.mjs` (Node, sem deps, compara `RT_TABLES` do `index.html` com
a publicação e sai ≠ 0 em divergência). Estado atual: **14 = 14, em sincronia**.

### ✅ 8 · Snapshot de segurança reproduzível
O `divat_security_snapshot_2026-06-26.sql` ficava fora do git (correto) e "se perdeu", sem apontador —
e era o estado **pré-endurecimento** (inseguro), que ninguém quer restaurar. Em vez de um arquivo
solto, criou-se `scripts/gen_security_snapshot.sql`: uma query que **emite** o SQL de reconstrução dos
grants/policies do estado ATUAL → snapshot sempre regenerável. O `CLAUDE.md` foi corrigido para apontar
a baseline segura (`docs/backup_schema.sql`, versionada) e marcar o snapshot antigo como obsoleto.

### ✅ 9 · Comentário RLS staging (lacuna fechada)
Refutado como "só no CLAUDE.md" — a intenção já estava comentada no `backup_schema.sql` (bloco de
`evento_dados` e o bloco `ENABLE RLS`) e no `schema.md`. Única lacuna real: o bloco `portaria_data` não
repetia a nota. Comentário adicionado, por paridade com o bloco de evento.

### ✅ 10 · `ativa` vs `vigente` unificados
Duas noções sobre os mesmos 4 flags, com `sub_judice`/`transferido` tratados de forma **oposta**:
`isLinhaAtiva` = 2 flags (linha operando); `vigente` = 4 flags (seção/tarifa, critério estrito),
definido solto dentro de `renderTarifas`. Unificados: `isVigente` agora deriva de `isLinhaAtiva`
(`isVigente = isLinhaAtiva(r) && !sub_judice && !transferido`), num único ponto e com nomes explícitos.
Cópia no harness + 7 casos novos em `pure.test.js` (incluindo o contraste: sub judice/transferida =
ativa **mas não** vigente).

## Notas de acompanhamento (do lado do dono)

- **ETL:** ajustar o mapeamento do import para `cod_origem` (em `qh_intervalo_teste`) e
  `cod_municipio_origem` (em `itinerario_teste`) antes da próxima carga.
- **`check_realtime.mjs`:** roda na máquina do dono / CI (precisa de rede ao Supabase, que o ambiente
  do Claude não alcança). Já confirmado via banco que passa.
- **Auto-deploy Vercel:** o repo tem **dois** projetos ligados (`lucas-ctec` e `lucasctec`). O push na
  `main` republicou; confirmar qual é a URL pública canônica.
