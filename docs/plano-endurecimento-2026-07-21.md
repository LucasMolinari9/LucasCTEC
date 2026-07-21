# Plano — Endurecimento final do Portal DIVAT

> **Para o agente executor:** este plano foi elaborado e aprovado pelo dono em 21/07/2026, a partir
> de uma revisão de arquitetura. Antes de começar, leia o `CLAUDE.md` (regras do projeto) e
> `docs/estrutura-frontend.md` (regras de segurança para mexer no JS). Execute as fases **na ordem**,
> um commit por fase, na branch indicada em "Entrega". Os "fatos verificados" abaixo já foram
> checados no código e no banco em 21/07/2026 — reconfira rapidamente se algo mudou desde então.

## Contexto

Revisão de arquitetura (21/07/2026) identificou os últimos pontos fracos de um projeto já bem
endurecido. Este plano corrige, em 6 fases independentes e ordenadas por risco/dependência:

1. **Backup automático** — hoje é manual (disciplina humana); automatizar via GitHub Actions.
2. **Fontes do Google em runtime** — último terceiro externo; vendorar (mesma filosofia do supabase-js).
3. **CSP com `script-src 'unsafe-inline'`** — maior buraco restante; extrair o JS para `app.js` e
   passar a `script-src 'self'`.
4. **PostgREST sem teto de linhas** — qualquer um pode pedir tabelas inteiras sem limite; setar `db_max_rows`.
5. **Resíduo de U+FFFD** — ~55 linhas com acentos corrompidos (verificado ao vivo em 21/07; as tabelas
   grandes já estão limpas): `evento_empresa_teste.evento_empresa` (41), `evento_teste/evento_textos`
   `.descricao` (3+3) e `.observacao` (1+1), `portaria_teste/portaria_texto_teste.conteudo` (2+2),
   `tarifa_atual_teste.nome_ligacao_cresc` (1), `qh_predeterminado_teste.dia_semana` (1).
6. **CLAUDE.md virando changelog** + fluxo de trabalho direto na `main` — enxugar doc e adotar branch+preview.

**Fatos verificados que moldam o plano:**
- Nenhum handler inline (`onclick=` etc.) nem `javascript:` no `index.html` → extração do JS não exige
  refatorar handlers (tudo já usa `addEventListener`).
- Maior `limit` usado pelo front: **30000** → teto do PostgREST pode ser 30000 sem quebrar nada.
- `checarNovaVersao` (index.html:3195) compara só o ETag do `index.html` → precisa passar a cobrir o
  `app.js` também, senão deploy que só muda JS não recarrega os usuários.
- `tests/check.js` extrai o `<script>` inline por regex (linha 26) e confere snippets anti-drift contra
  o `html` → precisa ser repontado para `app.js`.
- Repo GitHub é **PÚBLICO** → o workflow de backup NÃO pode usar a service key com artifacts (exporia
  as tabelas de staging, invisíveis pela API pública). Usar a **anon key** (já pública) e dumpar só as
  tabelas públicas. Dump completo (com staging) continua sendo a rotina manual do dono (`docs/backup.md`).

**Branch de trabalho:** `claude/project-architecture-review-4d0p2n`. Um commit por fase.
**Gate obrigatório após cada fase:** `node tests/check.js` verde.

---

## Fase 1 — Backup automático (GitHub Actions + anon key)

*Primeiro porque cria a rede de segurança antes de qualquer outra mudança (regra do CLAUDE.md: nada
destrutivo sem backup fresco — a Fase 5 faz UPDATEs).*

1. **Adaptar `scripts/backup_rest.mjs`** para um modo público: aceitar `SUPABASE_ANON_KEY` como
   alternativa (flag `--public-only` ou detectar pela env). Nesse modo, dumpar **somente** as tabelas
   com policy `anon_read_*` (excluir as 4 de staging: `evento_dados`, `evento_textos`,
   `portaria_data`, `portaria_texto_teste`). A paginação por PK existente serve como está (PAGE=1000
   fica abaixo do teto da Fase 4). Atualizar o cabeçalho de uso do script.
2. **Criar `.github/workflows/backup.yml`**: `schedule` semanal (ex.: `0 6 * * 1`) + `workflow_dispatch`;
   Node 20; roda o script em modo público (a anon key pode ficar em env do workflow — é pública por
   design, já está no `index.html`); `actions/upload-artifact@v4` com `retention-days: 90`.
3. **Atualizar `docs/backup.md`**: nova camada automática (o que cobre e o que NÃO cobre — staging e
   schema continuam na rotina manual/`pg_dump`); onde baixar o artifact.

**Verificação:** rodar o script localmente em modo público apontando para o Supabase (a rede do
ambiente alcança via proxy; se falhar, validar com dry-run/mocks) e conferir o NDJSON + manifest.
Após o push, disparar o `workflow_dispatch` e conferir o artifact.

## Fase 2 — Vendorar as fontes (remover Google Fonts do runtime)

Fontes usadas (index.html:19): **Archivo** 600/700/800, **IBM Plex Mono** 500/600,
**IBM Plex Sans** 400/500/600 — subset **latin** basta para pt-BR.

1. Obter os `.woff2` via npm (mesmo precedente do supabase-js): `npm pack @fontsource/archivo`
   `@fontsource/ibm-plex-mono` `@fontsource/ibm-plex-sans`, extrair só os pesos/subset latin para
   `vendor/fonts/`.
2. No `<style>` do `index.html`: adicionar os `@font-face` (com `font-display:swap`) e remover os
   3 `<link>` de fonts (linhas 17–19).
3. No `vercel.json` (CSP): `style-src` perde `https://fonts.googleapis.com`; `font-src` vira `'self'`.
4. Documentar em `vendor/` (ou no CLAUDE.md, Fase 6) como atualizar as fontes.

**Verificação:** `node tests/check.js`; abrir preview e conferir que Archivo/Plex renderizam (DevTools
→ Network sem nenhuma request a `fonts.g*`).

## Fase 3 — Extrair o JS para `app.js` e derrubar `unsafe-inline` (a fase grande)

1. **Mover o bloco `<script>` inline inteiro** (do índice do topo até `checarNovaVersao()`) para
   **`app.js` na raiz**, byte a byte (sem reorganizar nada — regras de hoisting/TDZ de
   `docs/estrutura-frontend.md` valem). No `index.html` fica:
   `<script src="vendor/supabase-js-2.110.7.min.js"></script>` seguido de `<script src="/app.js"></script>`
   (mesma posição no fim do `<body>`; sem `defer`, preservando a ordem de execução atual).
   *Sem cache-busting `?v=`:* o `Cache-Control: max-age=0, must-revalidate` do `vercel.json` já cobre
   todos os paths — o navegador revalida `app.js` a cada carga.
2. **`checarNovaVersao`**: passar a comparar os ETags de `index.html` **e** `/app.js`
   (dois HEADs; `tag = etagIndex + '|' + etagApp`) — senão deploy só-de-JS não dispara reload.
3. **`vercel.json`**: `script-src 'self'` (remover `'unsafe-inline'` do script-src; o `style-src`
   mantém `'unsafe-inline'` — CSS continua inline, risco menor, fora do escopo).
4. **`tests/check.js`**:
   - [1] compilar `app.js` lido direto do disco (não mais regex no HTML); **novo guard**: falhar se o
     `index.html` voltar a ter `<script>` inline sem `src` (anti-regressão da CSP).
   - [1b] varrer JWTs em **ambos** os arquivos (`index.html` e `app.js`).
   - [2] snippets anti-drift conferidos contra `app.js`. (Os `tests/*.harness.js` não mudam.)
5. **Docs**: `docs/estrutura-frontend.md` e CLAUDE.md (Fase 6) passam a dizer "frontend =
   `index.html` + `app.js`"; o guia de navegação por marcas `/* ===== */` continua válido (agora em `app.js`).
6. **Bump do carimbo** `#verTag` (ex.: `build 21/07-A`).

**Verificação:** `node tests/check.js` verde; preview deploy: smoke test manual — busca de linha,
abrir 3–4 cards (Itinerário, Quadro, Tarifas, Histórico), PDF de um documento, e conferir no console
que não há erro de CSP; testar o detector de versão (publicar mudança trivial no `app.js` e ver o toast/reload).

## Fase 4 — Teto de linhas do PostgREST (`db_max_rows`)

1. Via Supabase (MCP `execute_sql`):
   `ALTER ROLE authenticator SET pgrst.db_max_rows = '30000'; NOTIFY pgrst, 'reload config';`
   (30000 = maior `limit` do front, verificado; nenhuma query legítima é afetada).
2. Conferir que os loaders com `limit=30000` continuam recebendo tudo e que a lógica de truncagem
   (`marcarTrunc`/`bannerTrunc`) segue funcionando (o teto do servidor coincide com o teto da query).
3. Registrar no CLAUDE.md (Fase 6): ao criar query com `limit` > 30000, subir o `db_max_rows` junto.

**Verificação:** `curl` REST com um select sem `limit` numa tabela grande → deve vir no máximo 30000
linhas; smoke test do portal no preview.

## Fase 5 — Resíduo U+FFFD (~55 linhas)

*Pré-requisito: Fase 1 concluída + rodar um backup fresco antes dos UPDATEs (regra do projeto).*

1. Rodar o diagnóstico detalhado (SQL por tabela/coluna listando PK + trecho corrompido) e **entregar a
   lista no chat/PR** (dados não vão para o git).
2. **`evento_empresa_teste.evento_empresa` (41 linhas):** os nomes de empresa existem limpos em
   `codempresa_teste` — onde o match por código/nome for **inequívoco**, propor os UPDATEs, mostrar ao
   dono e aplicar via MCP (service role). Match ambíguo → fica na lista manual.
3. Demais ~14 linhas (descrições/observações/conteúdos livres): **não adivinhar texto oficial** —
   entregar a lista de PKs para o dono corrigir no painel.

**Verificação:** re-rodar o scan de U+FFFD → contagem deve cair para só as linhas deixadas ao dono.

## Fase 6 — Documentação: CLAUDE.md enxuto + fluxo de branch

1. **Criar `docs/CHANGELOG.md`** e mover para lá toda a narrativa histórica do CLAUDE.md (os
   "endurecido em 26/06", "corrigido em 16/07", etc. — manter a cronologia, com links para os docs de
   auditoria). O CLAUDE.md mantém **só estado atual + regras**, apontando para o changelog. Meta: cair
   de ~20KB para ~10–12KB sem perder nenhuma REGRA.
2. **Atualizar o CLAUDE.md** com o novo estado: `app.js` separado, CSP sem `unsafe-inline`, fontes
   vendoradas, backup automático (workflow), `db_max_rows=30000`.
3. **Trocar o fluxo em "Como fazer mudanças"**: trabalhar em **branch → preview deploy do Vercel →
   conferir → merge na `main`** (em vez de editar a `main` direto). Manter a regra do gate
   `node tests/check.js` (o CI já roda em todo push).

**Verificação:** revisão de leitura — nenhuma regra viva sumiu do CLAUDE.md; links do changelog funcionam.

---

## Entrega

- Branch `claude/project-architecture-review-4d0p2n`, 1 commit por fase, push com `-u origin`.
- Fases 4 e 5 tocam o banco (MCP Supabase) — não geram commit de código além de docs/scripts.
- **Não criar PR** a menos que o dono peça; ao final, resumo do que mudou + o que ficou pendente para
  o dono (lista U+FFFD manual; conectar auto-deploy do Vercel se ainda não estiver; Leaked Password
  Protection no dashboard — item de 1 clique já documentado).

## Ordem de execução e independência

1 → 2 → 3 → 4 → 5 → 6. As fases 1, 2 e 4 são independentes entre si; a 3 é a mais arriscada (fazer
com calma, `check.js` a cada passo); a 5 depende da 1; a 6 consolida tudo e vai por último.
