# 01 — CLAUDE.md cita tabelas que não existem no banco

Ticket de correção de deriva docs×banco (auditoria de 26/07/2026, banco vivo
`lwzsxuaqqeoamukduhev` consultado via catálogo do Postgres). Só documentação —
**não toca código nem banco**.

## Fatos verificados

- `CLAUDE.md`, seção "Tabelas → onde aparecem (cards)":
  - linha 69: `itinerario_teste (+ cod_ibge_teste)` → **`cod_ibge_teste` não existe** no banco.
    A tabela real é **`municipio_teste`** (PK `cod_ibge`), e é ela que o `app.js` consulta
    (9 referências; zero a `cod_ibge_teste`).
  - linha 70: `qh_intervalo_teste / qh_predeterminado_teste (+ tab_origem_teste)` →
    **`tab_origem_teste` não existe**. A tabela real é **`origem_teste`** (PK `cod_origem`),
    consultada pelo `app.js` (10 referências; zero a `tab_origem_teste`).
- `CLAUDE.md`, seção "Arquitetura": diz que o `app.js` tem "~2,3k linhas" — hoje são
  **3.177 linhas** (`wc -l`).
- O próprio `CLAUDE.md` usa os nomes CERTOS em outros lugares (`getIbge→municipio_teste`,
  `getOrigem→origem_teste` na seção do Realtime) — a deriva é só na tabela de cards.

## O que fazer

1. Trocar `cod_ibge_teste` → `municipio_teste` e `tab_origem_teste` → `origem_teste` na
   seção "Tabelas → onde aparecem (cards)".
2. Atualizar a contagem de linhas do `app.js` na seção "Arquitetura" (usar "~3,2k" ou
   similar aproximado, para não envelhecer de novo a cada commit).

## Como verificar

- `grep -n "cod_ibge_teste\|tab_origem_teste" CLAUDE.md` → deve retornar vazio.
- `node tests/check.js` → verde (não deve ser afetado, mas é o gate de publicação).

## Regras do repo

- Trabalhar nesta branch; push → preview; merge na `main` só depois do CI verde.
- Mudança só de docs: não precisa bump do carimbo `#verTag`.
- **Ao concluir, apagar este arquivo** (`.scratch/doc-drift/…`) no mesmo commit/PR.
