# Baseline por ambiente — plano de implementação (issue #99)

> **Plano vivo — as cinco tarefas estão feitas** (commits `f423c78` e `6bb7123`, na branch do
> PR #98). O que resta são os **dois passos do dono**, listados no fim: eles precisam de rede e de
> secrets, e é o primeiro deles que acende o `seguranca`. Quando isso fechar, este arquivo migra
> para `docs/historico/`. Escrito em 09/08/2026, ao fim da sessão que destravou o PR #98.

> **Correção de rumo na Task 4.** O texto dela pedia "`orfaos_conhecidos` (política) e `achados`
> no topo; as **contagens** por ambiente" — mas no `data_quality_baseline.json` quem carrega as
> contagens É o `achados` (cada entrada tem `qtd`, e o `--atualizar-baseline` o reescreve). Não
> havia terceiro campo para mover. Confirmado com o dono: **`achados` desce para
> `ambientes.<alvo>`**, e `orfaos_conhecidos` + `como_listar_os_orfaos` + `nota` ficam no topo. A
> anatomia é a mesma do arquivo de segurança, com os papéis trocados — lá o `achados` é política,
> aqui é medição.

**Para quem executa:** os passos usam checkbox (`- [ ]`). Cada tarefa termina num commit e num
entregável testável sozinho.

---

## Estado ao começar

**Trabalhe sobre a branch `claude/divat-fase3-diagnosticos-y7ry57`** (o head do **PR #98**), não
sobre a `main`. O campo `digest` só existe lá — ele nasce na migração 2, que é do #98.

| | |
|---|---|
| `main` | `307473f` — plano de 08/08 encerrado, 22/22 tarefas |
| PR #98 | aberto, head `c7516f6`, **sem conflitos**, base na `main` atual |
| CI do #98 | 10 verdes · `seguranca` ❌ · `qualidade` ❌ · `test-auditor` ⏭️ |

**Os dois vermelhos não são bug de código.** A migração 2 já está aplicada **no teste** e move
`divat_data_quality` para o schema `audit` de propósito, então o gate só volta a enxergar por
credencial de auditor — que ainda não existe como secret. E o `digest` nasceu na mesma migração,
deixando o baseline com `digest: null`.

> ⚠️ **Nunca force-push nesta branch.** Ela é o head de um PR aberto com histórico de revisão
> ligado às issues #99–#104. Commits novos por cima, sempre.

---

## O problema (issue #99)

`scripts/security_baseline.json` tem **um** conjunto de campos medidos — `digest`, `anon_rpcs`,
`defaults_permissivos`, `funcoes_sem_search_path` — mas o `check_grants.mjs` roda contra **dois
bancos**, decididos por `DIVAT_ALVO`: `teste` em PR/push, `producao` no cron.

**Hoje não dói** porque produção não tem nenhuma das duas migrações, então lá o gate cai no caminho
antigo (`divat_security_shape`), que nem lê o `digest`. **Dói no dia da promoção**: a partir daí os
dois bancos produzem digest e disputam o mesmo campo — se o valor for o do teste, o cron de
produção acusa mudança estrutural que não houve; se for o de produção, todo PR fica vermelho pelo
motivo invertido. E os digests **não convergem sozinhos**: qualquer diferença de postura muda o
hash.

### Por que a opção 2 da issue não serve

A issue oferece *"comparar digest só no alvo de produção, e no teste conferir apenas os seis
indicadores graves"*. Não resolve: **o digest não é o único campo por banco**. As três contagens
também são, e `anon_rpcs` já diverge hoje por desenho — a migração 2 tira `divat_data_quality` e
`divat_security_shape` de `public` e acrescenta `divat_security_digest`, e produção não tem
nenhuma das duas migrações. Contagem diferente não cabe num campo só.

### A forma escolhida, e por quê

O baseline mistura **duas naturezas**, e é nessa costura que ele deve ser partido:

| Campo | Natureza | Varia por banco? |
|---|---|---|
| `achados` (segurança) · `orfaos_conhecidos` (dados) | **política** — exceções aceitas / dívida classificada, mantidas **à mão** | **não** |
| `digest` + as 3 contagens · as contagens de qualidade | **medição** — escritas pela máquina no `--atualizar-baseline` | **sim** |

Dois arquivos (`security_baseline.teste.json` / `.producao.json`) duplicariam a metade mantida à
mão — e lista mantida à mão e duplicada é lista que diverge, que é a classe de bug que o plano de
08/08 passou inteiro combatendo. A chave por alvo duplica **só** o que é genuinamente por banco:

```json
{
  "gerado_em": "…",
  "nota": "…",
  "achados": [ … as 3 exceções aceitas, uma vez só … ],
  "ambientes": {
    "teste":    { "digest": null, "anon_rpcs": null, "defaults_permissivos": null, "funcoes_sem_search_path": null, "gerado_em": null },
    "producao": { "digest": null, "anon_rpcs": null, "defaults_permissivos": null, "funcoes_sem_search_path": null, "gerado_em": null }
  }
}
```

Três razões a mais:

1. **Espelha `scripts/ambientes.json`**, que o #98 criou com exatamente essa forma
   (`ambientes: { teste, producao }`). Quem entende um entende o outro.
2. **A guarda offline do `tests/check.js` continua valendo sem mudança** — ela valida
   `b.achados`, que permanece no topo.
3. **Não toca a fronteira que importa.** Os seis indicadores graves ficam no *código*, nunca no
   baseline, de propósito: *"um gate cujo conserto habitual é `--atualizar-baseline` ensina o
   reflexo de apagar o alarme"*. Esta mudança é só sobre onde a **medição** mora.

---

## Restrições

- **Offline.** Nada aqui precisa de rede. O `--atualizar-baseline` (que precisa) é o passo do
  dono, no fim.
- **A entrega NÃO deixa o `seguranca` verde.** Depois dela o baseline tem `digest: null` nos dois
  ambientes e o gate segue dizendo *"Baseline sem `digest`"* — só que no slot certo. O verde vem
  do passo do dono.
- **Não mexer no banco.** Nenhuma migração, nenhum grant, nenhum dado.
- **Gate de saída:** `node tests/check.js` verde + `node tests/check_grants.rig.mjs` verde.

---

## Task 1: `check_grants.mjs` lê e escreve por ambiente

**Files:** `scripts/check_grants.mjs`, `scripts/security_baseline.json`

- [x] **Step 1: Reformar o JSON.** Mover `digest`, `anon_rpcs`, `defaults_permissivos`,
  `funcoes_sem_search_path` para `ambientes.teste` e `ambientes.producao`, com `null` nos dois.
  `achados`, `nota` e `gerado_em` de topo ficam onde estão.

- [x] **Step 2: Ler do slot.** No caminho `if (digest)`, trocar `b.digest` e `b[campo]` por
  `b.ambientes?.[alvo]?.digest` e `…?.[campo]`. O nome do alvo já está em memória — é o mesmo que
  o script imprime em `· Alvo: …` (vem de `scripts/lib/ambiente.mjs`).

- [x] **Step 3: Mensagem de erro que ensina.** Slot ausente ou `digest` nulo deve dizer **de qual
  ambiente** se trata, senão o operador roda `--atualizar-baseline` no alvo errado:

```
✗ Baseline sem `digest` para o ambiente 'teste'. Rode com DIVAT_ALVO=teste --atualizar-baseline.
```

- [x] **Step 4: Escrever no slot.** No ramo `atualizar`, gravar em `b.ambientes[alvo]` preservando
  o outro ambiente **e** o `achados` de topo. O comentário atual já avisa que gravar só parte dos
  campos fecha um laço (a execução seguinte pede `--atualizar-baseline`, que já rodou) — a mesma
  armadilha existe agora por ambiente.

- [x] **Step 5: Falhar fechado em alvo desconhecido.** `b.ambientes` sem a chave do alvo é erro,
  nunca "primeiro run" — criar o slot em silêncio é como um gate passa a comparar contra nada.

---

## Task 2: A bancada cobra os dois ambientes

**Files:** `tests/check_grants.rig.mjs`

A bancada é **offline de verdade**: `psql` falso em diretório temporário e fixtures numa porta que
o `fetch` recusa antes de abrir socket. Nenhum caso alcança o Supabase, nem em regressão.

- [x] **Step 1:** caso `[ambiente]` — baseline com os dois slots preenchidos e valores
  **diferentes**; rodar com `DIVAT_ALVO=teste` deve comparar contra o slot do teste e **ignorar** o
  de produção. É o caso que prova que o bug da #99 morreu.
- [x] **Step 2:** caso — `--atualizar-baseline` com `DIVAT_ALVO=teste` **não pode** alterar o slot
  `producao` nem o `achados`.
- [x] **Step 3:** caso — slot do alvo ausente → sai 1 com mensagem que nomeia o ambiente.
- [x] **Step 4:** caso — formato **antigo** (campos no topo, sem `ambientes`) → sai 1 pedindo a
  migração da forma, em vez de comparar contra `undefined` e passar.

---

## Task 3: A guarda offline cobra a forma nova

**Files:** `tests/check.js` (seção `[2b]`, bloco "o baseline de segurança é legível offline")

- [x] **Step 1:** além de `achados`, exigir `ambientes` com as chaves `teste` e `producao`.
- [x] **Step 2: Provar que ela reprova** — reintroduzir o formato antigo de propósito e conferir
  que o `check.js` fica vermelho; só então repor. **Guarda que nunca se viu falhar não é guarda.**

---

## Task 4: A mesma forma no baseline de qualidade de dados

> Recomendação da sessão, **não** pedido da issue #99. Se o escopo precisar encolher, corte esta
> tarefa e abra issue — mas a conversa volta no dia da promoção, porque o problema é idêntico.

**Files:** `scripts/check_data_quality.mjs`, `scripts/data_quality_baseline.json`

Mesma anatomia: `orfaos_conhecidos` (política, mantida à mão) e `achados` no topo; as **contagens**
por ambiente. Hoje o arquivo registra dívida medida em **produção** e é comparado contra **teste**
em PR — o mesmo defeito, ainda sem sintoma.

- [x] **Step 1:** reformar o JSON na mesma forma da Task 1.
- [x] **Step 2:** `check_data_quality.mjs` lê e escreve o slot do alvo.
- [x] **Step 3:** casos na bancada `tests/check_data_quality.test.js`.
- [x] **Step 4:** cobrar a forma na guarda offline do `check.js`.

---

## Task 5: Documentar e fechar

- [x] **Step 1:** `CLAUDE.md` — a seção que descreve os baselines passa a dizer que a medição é por
  ambiente e a política é única. Uma frase, não um parágrafo (o bloco de gates virou ponteiro na
  Task 17 do plano de 08/08; respeite isso).
- [x] **Step 2:** comentar na **issue #99** qual das duas opções foi escolhida **e por quê a outra
  não servia** (o `anon_rpcs` divergente). Fechar só depois do gate verde.
- [x] **Step 3:** commit e push na branch do #98. **Sem force.**

---

## O que só o dono faz (não tente, não bloqueie)

Estes dois passos precisam de rede e de acesso a secrets. Peça e siga em frente com o resto.

1. **`DIVAT_ALVO=teste node scripts/check_grants.mjs --atualizar-baseline`** — preenche o slot do
   teste. Só rodar **depois** da Task 1, senão grava no formato velho e o trabalho se repete.
2. **`scripts/bootstrap_phase3_auditor.sql` no projeto de teste + secret
   `SUPABASE_TEST_AUDIT_DATABASE_URL`** — isso acende `qualidade` e `test-auditor`. É de outra
   issue, mas é o que falta para o #98 poder ser mergeado.

O slot de `producao` fica `null` de propósito até a janela de promoção descrita em
[`fase-3-hardening-moderado.md`](fase-3-hardening-moderado.md).

---

## O que a execução acrescentou ao plano

Três coisas que o plano não previa e que a implementação cobrou. Ficam registradas porque quem
reler o diff vai encontrá-las e merece saber que foram deliberadas.

1. **O `--atualizar-baseline` do caminho ANTIGO também precisava do resgate.** O plano cuidou do
   ramo do digest; o ramo do `divat_security_shape` — que é onde **produção** ainda está —
   reescreve o arquivo do zero, então apagaria os **dois** slots em silêncio. Ganhou o mesmo
   resgate explícito que o `orfaos_conhecidos` já tinha no `check_data_quality.mjs`, com caso
   próprio na bancada. É a mesma armadilha do Step 4, no ramo que o plano não olhou.
2. **`achados: null` ≠ `achados: []` no baseline de qualidade.** `null` é *ainda não medido aqui* e
   derruba o gate nomeando o ambiente; `[]` é *medido e limpo* e passa. Sem a distinção, o slot de
   `teste` — que nasce vazio — faria o gate sair verde sobre um banco que ninguém mediu.
3. **A `nota` de cada JSON virou constante única no script que a regrava,** conferida pelo
   `check.js`. Ela é a única explicação da forma para quem abre o arquivo sem abrir o script, e o
   `--atualizar-baseline` a reescreve: duas cópias divergem no primeiro uso, e passa a existir uma
   nota que descreve a forma anterior. Era a armadilha registrada no fim deste plano, resolvida
   por guarda em vez de por disciplina.
4. **A guarda offline cobra os nomes de ambiente contra `scripts/ambientes.json`,** não contra a
   dupla literal `teste`/`producao`. Escritos à mão, eles seriam uma **terceira** lista ao lado do
   `ambientes.json` e dos próprios baselines — e ambiente novo ali nasceria sem slot com os gates
   verdes, aparecendo só quando alguém rodasse contra ele. Cobrado nos dois sentidos: slot
   faltando e slot que o `ambientes.json` não conhece.

**Sobre a duplicação entre os dois scripts.** A resolução do slot ficou *inline* em cada um, não
extraída para `lib/`. São poucas linhas, os dois gates são deliberadamente autônomos (cada um roda
sozinho, com runbook no próprio cabeçalho) e a mensagem de erro de cada um fala do seu arquivo.
Extrair trocaria duplicação boba por acoplamento entre dois gates que precisam poder falhar
independentes. O que **não** pode duplicar — e por isso ganhou guarda — é a `nota`: aquela tem duas
cópias obrigatórias (JSON e script), e é o `check.js` que as mantém iguais.

> **Nota de procedência.** As Tasks 1–4 foram implementadas duas vezes, em paralelo, por duas
> sessões que não se viam — os commits `f423c78` e `6bb7123` de um lado, e uma implementação
> equivalente do outro. As duas convergiram na mesma forma de JSON, no mesmo resgate do caminho
> antigo e na mesma distinção `null` × `[]`, o que é alguma evidência de que o plano estava
> escrito com precisão suficiente. Ficou a primeira leva; da segunda foram aproveitados o item 4
> acima e este registro. Duas sessões na mesma branch é desperdício — vale conferir `git fetch`
> antes de começar.

## Armadilhas registradas

- **`scripts/check_grants.mjs` é tratado como binário pelo git** em merge — não gera marcadores de
  conflito. Se precisar mesclar de novo, compare as três versões à mão (`base`, `main`, branch).
- **`--sem-baseline` não pode passar a comparar nada.** Ele existe para relatar o estado cru; o
  ramo dele sai antes da leitura do baseline e deve continuar assim.
- **Os seis indicadores graves não entram no baseline, em ambiente nenhum.** Se algum aparecer, a
  resposta é revogar o privilégio — não registrar exceção.
- **A `nota` do JSON é lida por humano.** Ao reformar, atualize-a: uma nota que descreve a forma
  antiga é a mesma deriva docs×código que o plano de 08/08 combateu.
