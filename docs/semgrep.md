# Semgrep — análise estática (SAST)

Instalado em 25/07/2026. Este documento é o runbook: **o que é, por que existe assim, como
rodar, como escrever regra nova.** O estado resumido está no `CLAUDE.md`; a cronologia, no
`docs/CHANGELOG.md`.

## O que é

[Semgrep](https://github.com/semgrep/semgrep) casa **padrões sintáticos** no código — a
regra se parece com o próprio código, não com uma regex sobre texto (ele entende a árvore
sintática, então `eval( x )` e `eval(x)` são o mesmo padrão, e um `eval` dentro de uma
string ou comentário não é achado).

## Por que, se já existe o `node tests/check.js`

Os dois gates respondem perguntas diferentes e **nenhum substitui o outro**:

| | `tests/check.js` | Semgrep |
|---|---|---|
| Pergunta | o código **faz** o que deve? | o código **contém** padrão proibido? |
| Método | compila o `app.js` + roda a lógica pura | casa padrão na árvore sintática |
| Dependências | **nenhuma** (Node puro) | binário Python à parte |

O `check.js` compila o `app.js` mas **não o executa** — um `new Function(...)` passa liso por
ele e só morre no navegador do usuário (a CSP de produção é `script-src 'self'`, sem
`'unsafe-eval'`). É exatamente essa faixa que o Semgrep cobre.

Por isso o Semgrep **não entrou no `check.js`**: aquele gate é Node puro e sem dependências
de propósito (roda em qualquer lugar, em segundos), e é uma propriedade que vale manter. Os
dois rodam separados — `ci.yml` e `semgrep.yml` — e um pode ficar vermelho sem esconder o
resultado do outro.

## As duas metades do scan

Isto é o que mais confunde na hora de rodar:

1. **Regras locais** — `.semgrep/rules/divat.yml`, versionadas neste repo. Invariantes
   **deste** portal, que ruleset genérico nenhum conhece. Rodam **offline**, sempre.
2. **Rulesets públicos** — `p/javascript`, `p/xss`, `p/secrets`, `p/github-actions`,
   baixados do registry `semgrep.dev` a cada execução. **Precisam de rede.**

A metade (2) **não roda no ambiente do agente Claude** (a saída para `semgrep.dev` é
bloqueada pela política de rede, mesma situação do `vercel` CLI — ver `CLAUDE.md` §
Publicação). Roda no CI e na máquina do dono. A metade (1) roda em qualquer lugar — por isso
ela é o padrão do wrapper, e é a que abre o job no CI.

## Instalar

O binário **não** é dependência do projeto (o `check.js` continua sem dependência alguma):

```sh
pipx install semgrep                                    # recomendado
python3 -m venv .venv-semgrep && .venv-semgrep/bin/pip install semgrep   # sem pipx
```

O `.venv-semgrep/` está no `.gitignore`; o `scripts/semgrep.sh` acha o binário sozinho (PATH
primeiro, depois a venv local).

## Rodar

```sh
./scripts/semgrep.sh                   # só regras locais (offline) — o padrão
./scripts/semgrep.sh --full            # locais + rulesets do registry (precisa de rede)
./scripts/semgrep.sh --test            # testa as REGRAS contra .semgrep/tests/
./scripts/semgrep.sh --baseline origin/main   # só o que a sua branch introduziu
```

Sai com código != 0 quando há achado (`--error`), então serve de gate em script.

**Antes de publicar**, o par completo é:

```sh
node tests/check.js && ./scripts/semgrep.sh
```

(`--full` quando você tiver rede; o CI roda de qualquer jeito no push.)

> **Pegadinha:** o Semgrep só escaneia **arquivos rastreados pelo git**. Arquivo novo ainda
> não adicionado passa despercebido — dê `git add` antes de confiar no scan.

## O que está ignorado (`.semgrepignore`)

- `vendor/` — supabase-js minificado (uma linha de ~200 KB) e fontes `.woff2`. A garantia
  desses arquivos é a **integridade** conferida contra o registro do npm ao trocar de versão,
  não o lint.
- `tests/*.harness.js` — cópias verbatim de funções do `app.js`. Achado ali seria duplicata
  do achado no original, e "consertar" a cópia quebraria o anti-drift do `check.js`.
- `.semgrep/tests/` — contém violações **de propósito** (é o que prova que a regra pega).

**Atenção:** quando existe, este arquivo **substitui** o `.semgrepignore` padrão do Semgrep
em vez de somar — por isso ele repete `node_modules/` e companhia.

## As regras locais

Todas em `.semgrep/rules/divat.yml`, com o racional completo em comentário no próprio
arquivo.

| Regra | Pega | Por que dói |
|---|---|---|
| `divat-pdfhtml-fora-do-seam` | `currentView.pdfHTML = …` direto | Escrita depois de um `await` pode acertar a view ERRADA (buscar "101", trocar pra "202", 1ª resposta chega atrasada → PDF da linha errada). O seam `beginGen`/`commitViewResult` descarta a escrita velha. Ver `CLAUDE.md` § Armadilhas. |
| `divat-eval-quebra-csp` | `eval`, `new Function` | Bloqueados pela CSP de produção (`script-src 'self'`, sem `'unsafe-eval'`). O `check.js` não pega: ele compila, não executa. |
| `divat-timer-com-string-quebra-csp` | `setTimeout('código', …)` | Mesma proibição — string em timer é `eval` disfarçado. Com função não casa. |
| `divat-cdn-externo-em-runtime` | jsDelivr, unpkg, Google Fonts… | O portal não usa terceiro em runtime (tudo vendorado) e a CSP bloquearia a requisição. |

### Exceção pontual

Quando o padrão casa mas o caso é legítimo, anote **com justificativa** na linha anterior:

```js
// nosemgrep: divat-eval-quebra-csp
```

Só existe uma hoje, em `tests/realtime.test.js` (roda no Node, não é servido ao navegador,
e o alvo é um literal puro recortado do `app.js`). Um `nosemgrep` sem justificativa escrita
é dívida — a próxima pessoa não vai saber se ainda vale.

### Escrever regra nova

1. Adicione a regra em `.semgrep/rules/divat.yml` (com o **porquê** em comentário — a regra
   sem racional vira ruído que todo mundo aprende a ignorar).
2. Adicione em `.semgrep/tests/divat.js` **os dois** casos: o ruim e o bom. O teste falha nos
   dois sentidos — achado esperado que sumiu (regra quebrou) e caso bom que disparou (falso
   positivo).
3. `./scripts/semgrep.sh --test` e depois `./scripts/semgrep.sh` (o repo inteiro tem de
   continuar limpo).

O cabeçalho de `.semgrep/tests/divat.js` evita escrever as anotações de teste por extenso —
o próprio Semgrep as leria como anotação e o teste quebraria.

## CI

`.github/workflows/semgrep.yml`, em todo push e PR: regras locais → rulesets do registry →
teste das regras. A versão do Semgrep é **fixa** (`semgrep==1.171.0`), mesma disciplina do
supabase-js vendorado: atualizar é uma decisão, não efeito colateral de um push qualquer —
versão nova traz regra nova e deixaria vermelho um PR que não mexeu em nada disso. Para
subir: troque o número no workflow, rode `./scripts/semgrep.sh --full` local e resolva os
achados **no mesmo commit**.

Não há upload SARIF / Code Scanning: exige GitHub Advanced Security, que este repo (privado,
plano free) não tem. O resultado vive no log do job.
