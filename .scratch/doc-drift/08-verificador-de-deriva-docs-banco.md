# 08 — Verificador de deriva docs×banco (a causa raiz dos tickets 01–07)

Ticket de prevenção (auditoria de 26/07/2026). Os tickets 01–07 corrigem o **estoque**
de deriva; este cria o guarda que impede a **reincidência**. Código novo (script +
workflow), sem mudança no banco na opção recomendada.

**⚠️ Ordem: fazer DEPOIS dos tickets 01–07** — o verificador nasce conferindo docs já
corrigidos; se nascer antes, estreia vermelho por causa do estoque conhecido.

## Por que existe (fato, não opinião)

As 8 divergências achadas em 26/07 nasceram TODAS do mesmo jeito: um fato do banco
copiado à mão para um doc (`CLAUDE.md`, `schema.md`, `seguranca.md`,
`backup_schema.sql`) e nunca mais conferido. Hoje só o Realtime tem guarda viva
(`scripts/check_realtime.mjs`); o resto dos fatos não tem verificador nenhum.

## O que construir (recomendação)

`scripts/check_deriva.mjs` — irmão do `check_realtime.mjs`: roda com a **anon key**
(mesma do `app.js`), compara banco vivo × repo, sai com código ≠ 0 e mensagem clara
apontando doc e linha quando divergir.

**Fonte de fatos sem mudar o banco:** o PostgREST expõe o **OpenAPI** em
`GET ${SB_URL}/rest/v1/` (com `apikey`) — traz todas as tabelas, colunas e RPCs
visíveis para `anon`. Isso cobre as checagens abaixo sem criar RPC nova nem tocar
RLS/grants (se um dia precisar de fato que o OpenAPI não dá — p.ex. UNIQUE de índice —
aí sim considerar uma RPC read-only no espírito da `realtime_tables`, via `db-change`).

**Checagens (cada uma teria pegado uma divergência real de 26/07):**
1. **Nomes de tabela citados nos docs existem no banco** — extrair candidatos
   `\b\w+_teste\b` (+ `evento_dados`, `evento_textos`, `portaria_data`) de `CLAUDE.md`
   e `docs/schema.md`; cada um deve existir no OpenAPI (teria pego `cod_ibge_teste` e
   `tab_origem_teste` do ticket 01).
2. **Colunas do diagrama do `schema.md` existem nas tabelas** — parsear os blocos do
   mermaid `erDiagram`; coluna citada → coluna real (teria pego um rename tipo
   `cod_origem` → `cod_municipio_origem` no dia em que aconteceu).
3. **Toda RPC chamada no `app.js`** (`grep rpc/…`) **existe no banco** e responde a
   `anon` (paths `/rpc/…` do OpenAPI; teria pego remoção/rename de
   `divat_busca_logradouro`/`divat_linhas_regiao`).
4. **Toda RPC exposta a `anon` no banco está documentada** no `schema.md` (lado
   inverso da 3 — teria pego o ticket 04; conferir contra a seção "Funções e trigger"
   criada por ele).
5. **Contagem de linhas do `app.js`** citada nos docs, SE existir número exato —
   preferência: os tickets 01/03 trocam por ordem de grandeza e esta checagem vira
   desnecessária; não reintroduzir números exatos.

**Fora de escopo (não duplicar guardas existentes):** Realtime
(`check_realtime.mjs`), `VIEW_TABLES ⊆ RT_TABLES` (`tests/realtime.test.js`),
views renderizando (`check_views.mjs`), RLS/grants/policies (o OpenAPI de `anon` não
enxerga isso; a guarda é o snapshot `scripts/gen_security_snapshot.sql` + auditoria
periódica do `docs/seguranca.md` — se quiser automatizar isso um dia, é ticket próprio
com RPC dedicada).

## Onde roda

- **Local:** `node scripts/check_deriva.mjs` — mesma pegada do `check_realtime.mjs`.
  ATENÇÃO: o ambiente do Claude **não alcança** `*.supabase.co` (testado 26/07, igual
  ao `vercel` CLI) — o script é para a máquina do dono e para o CI, e deve falhar com
  mensagem explicando isso se a rede estiver bloqueada.
- **CI:** workflow próprio `.github/workflows/deriva.yml` (padrão do repo: um workflow
  por preocupação, um vermelho não esconde o outro), com `schedule` **semanal + 
  workflow_dispatch** — igual ao `backup.yml`, porque a deriva nasce de mudança NO
  BANCO (que não gera push) tanto quanto de mudança nos docs. Rodar também em push/PR
  que toque `CLAUDE.md`, `docs/schema.md` ou `app.js` (filtro `paths:`).
- **NÃO** entra no `tests/check.js` (contrato dele: offline e sem dependências).

## Como verificar (o verificador)

- Rodar contra o repo corrigido (pós 01–07) → verde.
- Teste de fumaça do próprio guarda: reintroduzir `cod_ibge_teste` num doc local →
  o script tem que ficar vermelho apontando doc/linha; reverter.
- `node tests/check.js` continua verde (o script novo não pode quebrá-lo).

## Regras do repo

- Documentar o script novo no `CLAUDE.md` (seção "Como fazer mudanças", ao lado dos
  irmãos `check_views`/`check_realtime`/`semgrep`) e registrar no `docs/CHANGELOG.md`.
- Workflow em versão fixa de runner/Node, sem dependências novas (fetch nativo do
  Node ≥18, como o `check_realtime.mjs`).
- **Ao concluir, apagar este arquivo** no mesmo commit/PR.
