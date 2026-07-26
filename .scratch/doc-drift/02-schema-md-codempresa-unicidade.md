# 02 — schema.md afirma "codempresa único", mas o banco não garante unicidade

Ticket de correção de deriva docs×banco (auditoria de 26/07/2026, banco vivo
`lwzsxuaqqeoamukduhev`). Correção padrão é **só documentação**; há uma alternativa
que toca o banco (decisão registrada abaixo).

## Fatos verificados

- `docs/schema.md`, tabela "Dimensões / lookups": `codempresa_teste | id (codempresa único)`.
- Banco vivo: o índice sobre a coluna é
  `CREATE INDEX idx_codempresa_codempresa ON public.codempresa_teste USING btree (codempresa)`
  — **btree comum, SEM `UNIQUE`**. Não existe constraint UNIQUE nem PK sobre `codempresa`
  (a PK é `id`).
- Ou seja: a unicidade de `codempresa` é **convenção do ETL do dono**, não garantia do banco
  — mesma categoria das ligações "convenção" que o próprio `schema.md` descreve.

## O que fazer (opção padrão — só doc)

Ajustar a linha no `schema.md` para deixar explícito: algo como
`id` PK; `codempresa` único **por convenção do ETL** (índice btree não-UNIQUE
`idx_codempresa_codempresa`).

## Alternativa (só se o dono preferir — vira mudança de banco)

Promover a unicidade real: `CREATE UNIQUE INDEX ... ON codempresa_teste(codempresa)`.
Nesse caso: usar a skill **`db-change`**, conferir duplicatas antes
(`select codempresa, count(*) from codempresa_teste group by 1 having count(*)>1`),
e atualizar `docs/backup_schema.sql` junto. NÃO fazer sem decisão explícita do dono.

## Como verificar

- Releitura da linha corrigida contra o `indexdef` acima.
- `node tests/check.js` verde.

## Regras do repo

- Branch → preview → merge com CI verde. Sem bump de `#verTag` (só docs).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
