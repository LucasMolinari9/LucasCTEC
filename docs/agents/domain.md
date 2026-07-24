# Domain Docs

Como as engineering skills devem consumir a documentação de domínio deste repo ao explorar o
código.

## Antes de explorar, leia estes

- **`CONTEXT.md`** na raiz do repo, ou
- **`CONTEXT-MAP.md`** na raiz do repo, se existir — aponta para um `CONTEXT.md` por contexto.
  Leia cada um relevante ao tópico.
- **`docs/adr/`** — leia ADRs que tocam a área em que você vai trabalhar. Em repos
  multi-contexto, cheque também `src/<context>/docs/adr/` para decisões específicas do contexto.

Se algum desses arquivos não existir, **prossiga em silêncio**. Não sinalize a ausência; não
sugira criá-los de antemão. A skill `/domain-modeling` (acessada via `/grill-with-docs` e
`/improve-codebase-architecture`) os cria de forma preguiçosa quando termos ou decisões são
realmente resolvidos.

## Estrutura de arquivos

Repo single-context (a maioria dos repos — inclui este):

```
/
├── CONTEXT.md
├── docs/adr/
│   └── 0001-....md
└── (app.js / index.html / styles.css — sem src/)
```

Repo multi-context (presença de `CONTEXT-MAP.md` na raiz) — não se aplica a este repo hoje:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← decisões de sistema inteiro
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← decisões específicas do contexto
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use o vocabulário do glossário

Quando sua saída nomear um conceito de domínio (num título de issue, numa proposta de refactor,
numa hipótese, num nome de teste), use o termo como definido em `CONTEXT.md`. Não desvie para
sinônimos que o glossário evita explicitamente.

Se o conceito de que você precisa ainda não estiver no glossário, isso é um sinal — ou você está
inventando linguagem que o projeto não usa (reconsidere) ou há uma lacuna real (anote para o
`/domain-modeling`).

## Sinalize conflitos com ADR

Se sua saída contradiz um ADR existente, sinalize isso explicitamente em vez de sobrepor em
silêncio:

> _Contradiz ADR-0007 (nome da decisão) — mas vale reabrir porque…_
