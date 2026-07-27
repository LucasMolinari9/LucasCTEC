# Portal DIVAT — Cadastro de Linhas Regulares

Portal **público de consulta (somente leitura)** do **DETRO/RJ · DIVAT**. Os usuários buscam
linhas de ônibus e abrem os documentos oficiais — itinerários, quadro de horários, tarifas, frota,
histórico/eventos, empresas e relatórios. Os dados são mantidos pelo dono direto no banco
(Supabase) e o site apenas **exibe e atualiza ao vivo** (Realtime).

## Como funciona (resumo)

- **Frontend = três arquivos estáticos:** [`index.html`](index.html) (HTML),
  [`styles.css`](styles.css) (todo o CSS) e [`app.js`](app.js) (todo o JS, ~3,2k linhas num
  IIFE). Não há build, framework nem `package.json`: é só servir a pasta. O JS entra por
  `<script src>` clássico no fim do `<body>` — **nada de `<script>` inline**, porque a CSP
  publica `script-src 'self'` e bloquearia.
- As consultas vão direto ao **Supabase via REST** (PostgREST) com `fetch`. O `supabase-js`
  entra **só** para o canal **Realtime**, é **vendorado** em
  [`vendor/`](vendor/) (versão fixa, mesma origem) e é injetado dinamicamente pelo `app.js`.
  **Nenhum terceiro externo em runtime** — as fontes também são vendoradas.
- O botão **PDF** usa a impressão nativa do navegador (`window.print()`) — sem dependência externa.
- **Somente leitura de verdade:** a chave usada no site é a `anon` (pública por design); a
  segurança vem do **RLS + privilégio mínimo** no banco (o público só faz `SELECT`).

## Rodar localmente

São arquivos estáticos — basta servir a pasta:

```bash
python3 -m http.server 8000   # depois abra http://localhost:8000
```

## Testes (gate de pré-publicação)

A lógica pura do `app.js` tem testes em [`tests/`](tests/) (Node puro, sem dependências).
**Antes de publicar, rode:**

```bash
node tests/check.js
```

Ele valida a sintaxe do `app.js`, garante que **não** voltou `<script>` inline no `index.html`,
confere as cópias de teste (guarda anti-drift) e roda todos os testes. Só publique se sair
**tudo verde**.

Esse gate é **offline e sem dependências** de propósito. As checagens que precisam de navegador
ou de rede ficam de fora dele e rodam no CI:

| Comando | O que cobre | Precisa de |
|---|---|---|
| `node tests/check.js` | sintaxe, anti-drift, lógica pura | nada |
| `node scripts/check_views.mjs` | abre as 23 views num navegador headless | Chromium |
| `node scripts/check_abas.mjs` | regressão das abas do modal | Chromium |
| `./scripts/semgrep.sh` | padrões proibidos (`eval`, CDN em runtime, `pdfHTML` fora do seam) | Semgrep |
| `node scripts/check_realtime.mjs` | publicação Realtime × `RT_TABLES` | rede |
| `node scripts/check_deriva.mjs` | deriva docs × banco | rede |
| `node scripts/check_data_quality.mjs` | órfãos referenciais e `U+FFFD` no banco (pós-ETL) | rede |

O CI roda esses em workflows **separados de propósito**, para que um vermelho não esconda o
outro: [`ci.yml`](.github/workflows/ci.yml) (gate leve),
[`views.yml`](.github/workflows/views.yml) (navegador),
[`semgrep.yml`](.github/workflows/semgrep.yml) (estático),
[`deriva.yml`](.github/workflows/deriva.yml) (semanal + sob demanda),
[`db-checks.yml`](.github/workflows/db-checks.yml) (semanal — Realtime e qualidade dos dados) e
[`backup.yml`](.github/workflows/backup.yml) (backup semanal).

## Publicação

- **Host: Vercel** (config em [`vercel.json`](vercel.json)) — cabeçalhos de segurança (CSP) e cache.
- Com o auto-deploy conectado, **push na `main` = deploy automático**. As telas dos usuários se
  atualizam sozinhas (detector de versão por ETag no próprio JS).
- Mudanças **de dados** não exigem deploy — o site lê o Supabase ao vivo.

## Estrutura do repositório

| Caminho | O que é |
|---|---|
| `index.html` | A marcação do portal (+ os `@font-face` das fontes vendoradas). |
| `app.js` | Todo o JS, num IIFE. Dividido em seções com marcas `/* ===== TÍTULO ===== */`. |
| `styles.css` | Todo o CSS. |
| `vendor/` | `supabase-js` (versão fixa), fontes (Archivo, IBM Plex Mono/Sans) e o ícone. Nada disso vem de CDN em runtime. |
| `manifest.webmanifest` | Manifest do PWA. |
| `vercel.json` | Cabeçalhos de segurança (CSP) e cache do host (Vercel). |
| `tests/` | Testes da lógica pura + o gate `check.js`. Ver [`tests/README.md`](tests/README.md). |
| `scripts/` | Checagens que não cabem no gate offline (navegador, rede) + backup + snapshot de segurança. |
| `docs/` | Documentação técnica (abaixo). |
| `CLAUDE.md` | Contexto detalhado do projeto para sessões de IA (mapa do código, banco, armadilhas). |
| `CONTEXT.md` | Glossário do domínio (termos do cadastro de linhas). |
| `.github/workflows/` | Os 6 workflows de CI (ver a tabela de testes acima). |

### Documentação (`docs/`)

| Arquivo | Conteúdo |
|---|---|
| [`docs/estrutura-frontend.md`](docs/estrutura-frontend.md) | Como navegar o `app.js`, regras de rota/modal e as regras de segurança para reorganizar o JS. |
| [`docs/schema.md`](docs/schema.md) | Mapa **relacional** das tabelas (como se ligam, por qual chave) + funções e trigger. |
| [`docs/seguranca.md`](docs/seguranca.md) | Manual de segurança do dono: modelo de ameaça, checklist e resposta a incidente. |
| [`docs/backup.md`](docs/backup.md) | Runbook de backup e recuperação do banco. |
| [`docs/backup_schema.sql`](docs/backup_schema.sql) | Script que recria a estrutura do banco (tabelas, PK/FK, índices, RLS, grants, funções). |
| [`docs/semgrep.md`](docs/semgrep.md) | Runbook da análise estática e como escrever regra nova. |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | Cronologia do projeto — como se chegou ao estado atual. |
| [`docs/adr/`](docs/adr/) | Decisões arquiteturais registradas (ADRs). |
| [`docs/agents/`](docs/agents/) | Convenções para agentes: issue tracker, labels de triagem, docs de domínio. |
| [`docs/analise-duplicacao.md`](docs/analise-duplicacao.md) | Relatório histórico: análise de duplicação de código. |
| [`docs/analise-separacao.md`](docs/analise-separacao.md) | Relatório histórico: separação lógica × apresentação. |
| `docs/revisao-externa-*.md`, `docs/plano-endurecimento-*.md` | Relatórios históricos de revisão externa e o plano de endurecimento de 21/07. |

> **Dados nunca vão para o git.** Os backups de dados (CSVs) ficam fora do repositório — ver
> `docs/backup.md`. O `.gitignore` barra `*.csv` como rede de segurança.
