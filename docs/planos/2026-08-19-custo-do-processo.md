# Custo do processo — auditoria medida

> **Autoridade:** este documento preserva as medições e recomendações de 19/08/2026. A política
> normativa aprovada depois dele está em [`docs/governanca.md`](../governanca.md); mudanças futuras
> devem seguir essa fonte, sem reescrever esta auditoria.

**Sessão 5** do plano de 6 aberto em
[`docs/historico/contexto-proxima-sessao-2026-08-14.md`](../historico/contexto-proxima-sessao-2026-08-14.md).
Sem mudança de código: este documento **mede e recomenda**, não executa. As decisões de
manter/fundir/aposentar são do dono.

Origem: uma crítica externa disse que "o processo virou um projeto paralelo". O handoff de 14/08
apurou que **procede** e mediu 2,8 : 1. Esta sessão refaz a conta com método declarado, estende-a a
custo por rodada e evidência de captura, e responde à pergunta que faltava: **quando um gate novo
se justifica.**

## Resumo

1. A razão processo : produto **subiu** de 3,03 para 3,20 entre 14/08 e hoje — apesar das Sessões
   2 a 4, que existiam para baixá-la.
2. O motivo não é desleixo: **extração converte cópia em guarda, não reduz o total.** As 271 linhas
   apagadas do `pure.harness.js` voltaram quase exatamente como guarda e teste novo. Redução real
   só vem de **aposentadoria**, e a única disponível hoje (128 linhas) está bloqueada.
3. O gate local mais caro do repo gasta **~98% do tempo num timeout de rede** — e a correção de uma
   linha já existe, parada no PR #98.
4. Os dois workflows fantasma previstos pelo plano **existem e estão confirmados**.
5. O `CLAUDE.md` cresce ~13 linhas/dia e é lido em **toda** sessão. É o item de custo recorrente
   mais caro do projeto e o único sem teto declarado.

## Método

Tudo abaixo é medido contra o repo, com comando reproduzível. Onde não consegui medir, está dito.

- **Contagem de linhas:** via `git ls-tree -r --name-only <rev>` + `git show <rev>:<arquivo> | wc -l`,
  para que a mesma régua valha nas duas datas. Recortes:
  - **produto servido** = `app.js` + `styles.css` + `index.html` + `src/domain/*.mjs`
    (o que a allowlist do `.vercelignore` publica e foi escrito aqui; `vendor/` fica fora por ser
    terceiro vendorizado, não autoria).
  - **gates/testes** = tudo sob `tests/` e `scripts/`.
  - **docs** = `docs/**/*.md` + `CLAUDE.md` + `README.md`.
  - **workflows** = `.github/workflows/*.yml`, contados à parte porque o handoff de 14/08 não os
    incluiu.
- **Tempo por gate:** relógio de parede neste ambiente (container do agente), rodando o gate
  isolado. Serve para comparar gates entre si; **não** vale como tempo de CI, que roda noutra
  máquina.
- **Evidência de captura:** citação do [`CHANGELOG`](../CHANGELOG.md) com número de linha. Onde não
  há citação, a coluna diz "sem registro" — e isso é um dado, não uma omissão.

> **Ressalva de reconciliação, para quem comparar com o handoff.** O handoff de 14/08 registrou
> "4.480 de gates/testes"; a régua acima aplicada ao mesmo commit (`c3b0627`) dá **5.506**, e nenhum
> recorte óbvio (`tests/` sozinho = 2.904; `tests/` + código de `scripts/` = 5.584) reproduz 4.480.
> Não consegui recuperar o critério original. Por isso **a comparação abaixo usa a régua desta
> sessão nas duas datas**, e o número de 14/08 aqui é 3,03, não 2,8. Os dois medem coisas
> ligeiramente diferentes; o que importa é que a comparação interna é honesta.

## 1. A razão, medida nas duas datas

| | produto servido | gates/testes | docs | workflows | processo (g+d) | razão |
|---|---:|---:|---:|---:|---:|---:|
| 14/08 (`c3b0627`, pós-Sessão 1) | 4.773 | 5.506 | 8.973 | 1.108 | 14.479 | **3,03 : 1** |
| 19/08 (hoje) | 4.880 | 5.491 | 10.145 | 1.108 | 15.636 | **3,20 : 1** |
| delta | +107 | **−15** | **+1.172** | 0 | +1.157 | +0,17 |

Incluindo workflows no processo, a razão vai de 3,26 para **3,43 : 1**.

**As Sessões 2 a 4 fizeram o que prometeram** — e mesmo assim a razão subiu, porque o que elas
cortaram (15 linhas líquidas de gates/testes) é uma fração do que a documentação **delas** custou.

## 2. Por que subiu: o custo se conserva

O ganho prometido pelo handoff era: `pure.harness.js` de 305 linhas para perto de zero, e depois a
aposentadoria de `canon.js` (56) + `drift.test.js` (72). A primeira metade **aconteceu**:

| arquivo | 14/08 | hoje | delta |
|---|---:|---:|---:|
| `tests/pure.harness.js` | 305 | 34 | **−271** |
| `tests/canon.js` | 56 | 56 | 0 |
| `tests/drift.test.js` | 72 | 72 | 0 |

O `pure.harness.js` virou ponte pura: **zero blocos `@canon`**, só `require` dos quatro módulos de
`src/domain/`. Mas o total de `tests/` + `scripts/` andou **+4 linhas**. Para onde foram as 271:

| arquivo | linhas | delta |
|---|---:|---:|
| `tests/pure.harness.js` | 305 → 34 | **−271** |
| `tests/check.js` | 720 → 846 | **+126** |
| `tests/domain-module.test.mjs` | 20 → 82 | +62 |
| `scripts/check_deploy.mjs` | 275 → 333 | +58 |
| `tests/README.md` | 78 → 97 | +19 |
| `scripts/check_views.mjs` | 207 → 217 | +10 |

Duas naturezas diferentes, e a distinção decide o veredito:

- **`domain-module.test.mjs` (+62) é troca boa:** cópia verbatim virou asserção real, executada
  pelo mesmo caminho `import` que o navegador usa. Menos processo, mais teste.
- **`check.js` (+126) é o custo estrutural:** é a guarda que policia a modularização. Cada módulo
  novo que se publica exige que a guarda §[1] saiba resolvê-lo. **Modularizar compra segurança
  pagando em guarda** — o que é um bom negócio, mas não é redução de linhas.

**Conclusão que organiza o resto deste documento:** extrair código não baixa o custo do processo.
Só **aposentar** baixa. E hoje a única aposentadoria disponível está bloqueada:

> `canon.js` + `drift.test.js` (**128 linhas**) só saem quando o último `@canon` sair. Restam
> **12**, todos em `tests/harness.js`: `selecionarSupabase`, `esperar`, `SB_TIMEOUT_MS`,
> `SB_RETRIES`, `CANCELADO`, `ehCancelamento`, `fetchComTimeout`, `sbFetch`, `SB_MAX_ROWS`,
> `marcarTrunc`, `bannerTrunc`, `preencherLookup`. São as funções que dependem de rede ou do estado
> do IIFE — a Fase B do plano
> [`2026-08-14-modularizacao-fatias-3-4.md`](2026-08-14-modularizacao-fatias-3-4.md).

## 3. Gates offline — o que pegou, quanto custa, veredito

Tempo medido neste container, gate isolado. Todos verdes na medição.

| Gate | O que já pegou de verdade | Custo/rodada | Veredito |
|---|---|---:|---|
| `tests/check.js` §[1] allowlist | **O melhor histórico do repo.** Pegou o `.vercelignore` esquecido **duas vezes**: Sessão 2 (`CHANGELOG:78`, *"pegou o esquecimento na primeira rodada… o cenário exato que derrubou o portal em 10/08"*) e Sessão 3 (`CHANGELOG:29`, *"reprovou de verdade na primeira rodada"*). É o único gate que impede a repetição de uma queda real de produção. | 5,6s (todo o `check.js`) | **manter** — intocável |
| `tests/check.js` §[2b] deriva docs×código | `CHANGELOG:37`: o `views.yml` afirmava "~59,5% do app.js"; com 20 linhas a menos o real virou 57,9% e a guarda reprovou. | incluso | **manter** |
| `tests/check.js` §[2] anti-drift `@canon` | Sem registro de captura autônoma. Seu valor hoje é guardar as 12 cópias restantes. | incluso | **manter até a Fase B, aposentar junto** |
| `tests/check.js` §[3] testes unitários | 232 puros + 80 realtime + 49 sbFetch + 13 drift + 13 rig. | incluso | **manter** |
| `scripts/check_views.mjs` | Cobre a seção `MODAL` (~58% do `app.js`), que o `check.js` não vê. 18 views verdes na medição. | 12s | **manter** |
| `scripts/check_abas.mjs` | Regressão do seletor de documentos e das abas. | 6s | **manter** |
| `scripts/check_selecao_linha.mjs` | Guarda o bug do `history.back()` apagando a linha recém-selecionada — bug real e sutil, documentado no `CLAUDE.md`. | 8s | **manter** |
| `scripts/semgrep.sh` | `CHANGELOG:113-118`: **3 achados reais de `run-shell-injection`** vazaram do local para o CI em 09/08, porque o local rodava 5 regras e o CI 116. Hoje o local roda **121** — o gap fechou. (Os dois números do repo não se contradizem: `.semgrep/` guarda **178** regras (5 locais + 173 vendorizadas), e o semgrep executa as **121** aplicáveis às linguagens presentes.) | **>10 min** — ver §4 | **manter, mas consertar** |
| `scripts/check_migrations.mjs` | Sem registro de captura. Valida 3 migrações. | rápido | **manter** (barato) |

**Custo total do ciclo offline hoje: ~32s + semgrep.** Sem o semgrep, o ciclo completo de
pré-publicação cabe em meio minuto — barato para o que cobre.

## 4. O achado de maior retorno: o semgrep gasta 98% do tempo esperando a rede

Medido, não suposto:

| Comando | Tempo |
|---|---|
| `./scripts/semgrep.sh` (como está na `main`) | **>10 min**; o scan termina (*"Ran 121 rules on 110 files: 0 findings"*) e o wrapper **continua preso depois disso** |
| Mesmo scan com `SEMGREP_ENABLE_VERSION_CHECK=0` | **12 s** |

**Causa.** O `scripts/semgrep.sh` da `main` passa `--metrics=off`, que desliga a **telemetria** —
mas não o **version check**, que é outra coisa e continua tentando alcançar `semgrep.dev`. Nesse
ambiente `semgrep.dev` responde **HTTP 000** (limite já medido e registrado no handoff de 14/08),
então o processo fica no timeout depois de já ter terminado o trabalho.

**A correção já existe e não está na `main`.** O `scripts/semgrep.sh` da branch do **PR #98**
exporta `SEMGREP_ENABLE_VERSION_CHECK=0` nos dois modos offline (padrão e `--test`), com o
comentário explicando exatamente isto. A `main` não tem essa linha.

**Consequência prática, e é o que torna isto grave:** o `CLAUDE.md` §2b manda rodar
`./scripts/semgrep.sh` antes de publicar. Um gate que leva 10 minutos por causa de um timeout é um
gate que as pessoas param de rodar — e foi justamente **não rodar o semgrep completo localmente**
que deixou 3 achados de shell-injection chegarem ao CI em 09/08. O custo do timeout não é o tempo:
é a probabilidade de o gate ser pulado.

**Recomendação:** portar essa única linha para a `main`, **fora** do PR #98 e antes dele. Não o fiz
nesta sessão porque a Sessão 5 é documental por acordo (§"O que este documento NÃO faz"), mas é o
item de melhor retorno da lista inteira: uma linha, 50× mais rápido, no gate mais caro.

## 5. Workflows

Dez arquivos em disco. Gatilhos lidos do próprio `yml`.

| Workflow | linhas | gatilhos | O que já pegou | Veredito |
|---|---:|---|---|---|
| `ci.yml` | 63 | push, PR, dispatch | roda o `check.js` no CI | **manter** |
| `views.yml` | 91 | push, PR, dispatch | `check_views` + `check_abas` | **manter** |
| `semgrep.yml` | 98 | push, PR, dispatch | os 3 achados de 09/08 chegaram por aqui — o gate funcionou; o que falhou foi o local | **manter** |
| `deriva.yml` | 61 | push, PR, dispatch, **cron semanal** | o cron existe porque deriva nasce de mudança **no banco**, que não gera push | **manter** |
| `db-checks.yml` | 120 | push, PR, dispatch, **cron diário** | o cron diário compensa a "limitação ATIVA" do default do `supabase_admin` (`docs/seguranca.md` §9.1) | **manter enquanto a limitação existir** |
| `deploy-smoke.yml` | 81 | deployment_status, dispatch | `CHANGELOG:420`: reprovava em **todo** preview, de modo que a propriedade central do ADR-0002 (preview nunca lê produção) **nunca tinha sido exercitada**. Consertado em 31/07 | **manter** |
| `backup.yml` | 51 | cron, dispatch | rede de segurança do plano Free (sem PITR) | **manter** |
| `phase3-security.yml` | 79 | push, PR, dispatch | contrato offline da Fase 3 | **aposentar quando a Fase 3 entrar** — temporário por construção |
| `atualizar-baseline.yml` | 163 | **só** dispatch | existe para o dono fazer pelo navegador o que exigiria terminal | **manter** |
| `atualizar-semgrep-rulesets.yml` | 301 | **só** dispatch | rodado em 14/08 (`run 31845142284`); trouxe **173 regras** vendorizadas | **manter** |

Os dois de `dispatch` puro somam **464 linhas — 42% de todo o YAML do repo**. É caro, e é
justificado: o dono opera pelo celular, e sem eles as duas operações seriam impossíveis para ele.
Registre-se o custo, não se corte o mecanismo.

### 5.1 Os dois workflows fantasma — confirmados

O plano previa: "a API do GitHub lista 12 workflows; o disco tem 10". **Confere.** A API
(`actions_list`, hoje) devolve `total_count: 12`, com dois cujos arquivos não existem na `main`:

| Workflow registrado | id | criado | arquivo na `main`? |
|---|---:|---|---|
| Backup pré-REVOKE (temporário) | 320886214 | 26/07/2026 | **não existe** |
| Deploy to GitHub Pages | 295332914 | 13/06/2026 | **não existe** |

Ambos aparecem como `state: "active"`, o que é enganoso: um workflow roda a partir do arquivo no
ref, e o arquivo não está lá. O registro persiste por causa do histórico de execuções. O
`html_url` que a API devolve aponta para `blob/main/...` e responde 404 — sintoma do mesmo fato.

**Não consegui filtrar execuções por esses dois ids** com a ferramenta disponível nesta sessão (o
parâmetro de workflow foi ignorado e vieram as 1.876 execuções do repo inteiro). Então a afirmação
que sustento é a verificável: **os arquivos não existem na `main`, logo não há o que executar.**
Quem quiser fechar a última fresta confirma pela aba Actions, na barra lateral.

Vale registrar por que o segundo incomoda mais que o primeiro: "Deploy to GitHub Pages" seria um
**segundo host** servindo o portal. O `CLAUDE.md` afirma "Host: Vercel (único host em uso)", e essa
afirmação continua verdadeira — mas o registro órfão é a pegada de quando não era.

> **Isto é para não ser "descoberto" de novo.** A discrepância 12 × 10 já apareceu ao menos duas
> vezes. Ela é permanente: o GitHub não remove o registro. Da próxima vez que alguém contar 12,
> a resposta está aqui.

## 6. Documentação — o custo recorrente

10.145 linhas, distribuídas assim:

| Pasta | arquivos | linhas | Lida quando? |
|---|---:|---:|---|
| `docs/historico/` | 20 | 4.157 | quase nunca — snapshots datados, já fora da checagem de deriva |
| `docs/` (raiz) | 7 | 2.524 | sob demanda (`seguranca`, `etl`, `backup`, `schema`, `semgrep`, `estrutura-frontend`, `CHANGELOG`) |
| `docs/planos/` | 3 | 2.031 | sob demanda |
| `docs/superpowers/` | 4 | 482 | sob demanda |
| `docs/agents/` | 3 | 151 | sob demanda |
| `docs/adr/` | 3 | 141 | sob demanda |
| **`CLAUDE.md`** | 1 | **536** | **em TODA sessão** |

### 6.1 O `CLAUDE.md` é o item mais caro do projeto

Não pelo tamanho absoluto, mas por ser o único cobrado **toda vez**. Crescimento medido:

| data | linhas |
|---|---:|
| 10/08 | 470 |
| 14/08 | 502 |
| 15/08 | 536 |

**+66 linhas em 5 dias (~13/dia, +14%).** Nenhuma delas é supérflua isoladamente — cada uma
registra uma armadilha real que custou caro. O problema é estrutural: o arquivo só cresce, porque
nada nele tem critério de saída.

**Recomendação — teto declarado de 550 linhas**, com a regra: ao ultrapassar, não se apaga
conteúdo; **move-se** o detalhe para o documento especializado (`docs/estrutura-frontend.md`,
`docs/seguranca.md`, `docs/etl.md`) e no `CLAUDE.md` fica o ponteiro. O critério de permanência é
"quem lê isto no início de **toda** sessão precisa disto para não quebrar algo hoje?". Runbook de
gate já mora no cabeçalho do próprio script, por decisão registrada — é o mesmo princípio.

Com 536 hoje, o teto é alcançado em ~1 semana no ritmo atual. Isso é intencional: força a decisão
agora, enquanto é barata.

### 6.2 Duas convenções para o mesmo artefato

Planos vivem em **dois** lugares, com nomes diferentes:

- `docs/planos/` — 3 arquivos (este inclusive)
- `docs/superpowers/plans/` + `docs/superpowers/specs/` — dos fluxos `writing-plans` / `brainstorming`

Não é defeito e nada quebra. É deriva de convenção: quem procurar "o plano de X" precisa saber
olhar em dois lugares, e nada diz isso. **Recomendação:** uma linha no `README.md` de `docs/`
declarando qual pasta é a canônica e por que a outra existe. Custo ~3 linhas; evita a próxima
pergunta.

## 7. Achado menor: dois testes com placar ilegível

O `check.js` §[3] imprime `placar ?` para `domain-module.test.mjs` e `environment.test.js`.
Verifiquei: **não é defeito de correção** — o veredito vem do `res.status` (exit code), e os dois
usam `assert` do Node, que lança e sai ≠ 0. Falha **é** detectada.

O que se perde é legibilidade: a saída do gate não mostra a cobertura desses dois. Conserto: fazer
os dois imprimirem `==== PLACAR: n/n ====`, que é o formato que o §[3] já procura. Duas linhas.
**Prioridade baixa** — anotado para não ser rediagnosticado.

## 8. Critério de parada — a regra que faltava

O handoff apontou o buraco central: *"quando um gate novo se justifica. Sem essa regra, a razão só
sobe."* Proposta, derivada do que os gates deste repo de fato pegaram:

**Um gate novo só se justifica se as três forem verdadeiras:**

1. **Tem um modo de falha SILENCIOSO documentado.** Não hipotético: um episódio real, ou uma
   armadilha registrada no `CLAUDE.md`. O critério é o dano ser *invisível* — tela vazia sem erro,
   dado errado sem aviso, permissão aberta sem alarme. Bug que grita já é pego pelo uso.
2. **Nenhum gate existente o cobriria com uma asserção a mais.** Preferir sempre estender a
   ampliar. `check.js` tem cinco seções; `check_views` aceita view nova sem código novo.
3. **O custo por rodada cabe no ciclo.** Referência medida: o ciclo offline inteiro é ~32s + o
   semgrep. Gate que dobre isso precisa de justificativa explícita no PR.

**E uma regra de saída, que hoje não existe para nada:** todo gate criado para uma **migração,
fase ou incidente específico** nasce com condição de aposentadoria escrita no próprio cabeçalho.
`phase3-security.yml` é o exemplo vivo — é temporário por construção e ninguém escreveu onde isso
está registrado além do plano da fase.

**Regra de documentação, simétrica:** fato que vale para toda sessão vai no `CLAUDE.md` (sob o teto
do §6.1); fato que vale para uma tarefa vai no documento especializado; fato datado vai para
`docs/historico/` e **sai** da checagem de deriva. Um fato não mora em dois lugares — foi assim que
o `views.yml` pôde afirmar "23 views" em três linhas ao mesmo tempo.

## 9. Recomendações, por retorno

| # | Ação | Custo | Retorno | Depende de |
|---|---|---|---|---|
| 1 | Portar `SEMGREP_ENABLE_VERSION_CHECK=0` do PR #98 para a `main` | 1 linha | gate mais caro: 10 min → 12 s | decisão do dono |
| 2 | Adotar o critério de parada (§8) | 0 | trava o crescimento na origem | decisão do dono |
| 3 | Teto de 550 linhas no `CLAUDE.md` (§6.1) | 0 agora | protege o custo recorrente | decisão do dono |
| 4 | Fase B da modularização → aposentar `canon.js` + `drift.test.js` | uma sessão | **−128 linhas** reais | plano das fatias 3-4 |
| 5 | Aposentar `phase3-security.yml` | remoção | −79 linhas | Fase 3 entrar (PR #98) |
| 6 | Declarar a pasta canônica de planos (§6.2) | ~3 linhas | fim da ambiguidade | — |
| 7 | `==== PLACAR: n/n ====` nos dois testes (§7) | 2 linhas | legibilidade do gate | — |

Somadas as aposentadorias possíveis (4 e 5): **207 linhas**, contra as +1.157 dos últimos cinco
dias. **Isto é o achado mais desconfortável do documento e merece ser dito sem rodeio:** o processo
cresce mais rápido do que qualquer poda disponível. A alavanca que funciona não é podar — é o
critério de parada do §8, aplicado antes de a linha ser escrita.

## O que este documento NÃO faz

- **Zero mudança de código, zero SQL, zero mudança em arquivo servido.** O site não é tocado. Não
  há risco para o portal nem para o banco.
- **Não aplica nenhuma das 7 recomendações.** Todas são decisão do dono.
- **Não mexe no PR #98 nem duplica o que já está nele.** As issues #101, #102, #103 e #104 foram
  conferidas e **já estão corrigidas naquela branch**; três delas tratam de arquivos que sequer
  existem na `main` (`scripts/lib/auditor.mjs`, `tests/check_data_quality.test.js`). Corrigi-las
  aqui criaria conflito no rebase da Sessão 6.
- **Não fecha issue nem faz merge.**
