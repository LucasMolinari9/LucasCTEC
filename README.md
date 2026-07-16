# Portal DIVAT — Cadastro de Linhas Regulares

Portal **público de consulta (somente leitura)** do **DETRO/RJ · DIVAT**. Os usuários buscam
linhas de ônibus e abrem os documentos oficiais — itinerários, quadro de horários, tarifas, frota,
histórico/eventos, empresas e relatórios. Os dados são mantidos pelo dono direto no banco
(Supabase) e o site apenas **exibe e atualiza ao vivo** (Realtime).

## Como funciona (resumo)

- **Frontend = um único arquivo: [`index.html`](index.html)** — auto-contido, com **CSS e JS
  embutidos**. Não há build, framework nem `package.json`: é só servir o arquivo estático.
- As consultas vão direto ao **Supabase via REST** (PostgREST) com `fetch`. O `supabase-js` (CDN)
  entra **só** para o canal **Realtime**.
- O botão **PDF** usa a impressão nativa do navegador (`window.print()`) — sem dependência externa.
- **Somente leitura de verdade:** a chave usada no site é a `anon` (pública por design); a
  segurança vem do **RLS + privilégio mínimo** no banco (o público só faz `SELECT`).

## Rodar localmente

Como é um arquivo estático, basta abrir o `index.html` no navegador ou servir a pasta:

```bash
python3 -m http.server 8000   # depois abra http://localhost:8000
```

## Testes (gate de pré-publicação)

A lógica pura do `index.html` tem testes em [`tests/`](tests/) (Node puro, sem dependências).
**Antes de publicar, rode:**

```bash
node tests/check.js
```

Ele valida a sintaxe do `<script>` inline, confere as cópias de teste (guarda anti-drift) e roda
todos os testes. Só publique se sair **tudo verde**. O mesmo gate roda no CI a cada push/PR
(ver [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Publicação

- **Host: Vercel** (config em [`vercel.json`](vercel.json)) — cabeçalhos de segurança (CSP) e cache.
- Com o auto-deploy conectado, **push na `main` = deploy automático**. As telas dos usuários se
  atualizam sozinhas (detector de versão por ETag no próprio JS).
- Mudanças **de dados** não exigem deploy — o site lê o Supabase ao vivo.

## Estrutura do repositório

| Caminho | O que é |
|---|---|
| `index.html` | O portal inteiro (HTML + CSS + JS). |
| `vercel.json` | Cabeçalhos de segurança (CSP) e cache do host (Vercel). |
| `tests/` | Testes da lógica pura + o gate `check.js`. Ver [`tests/README.md`](tests/README.md). |
| `docs/` | Documentação técnica (abaixo). |
| `CLAUDE.md` | Contexto detalhado do projeto para sessões de IA (mapa do código, banco, armadilhas). |
| `.github/workflows/ci.yml` | CI que roda o gate de testes. |

### Documentação (`docs/`)

| Arquivo | Conteúdo |
|---|---|
| [`docs/schema.md`](docs/schema.md) | Mapa **relacional** das tabelas (como se ligam, por qual chave). |
| [`docs/backup.md`](docs/backup.md) | Runbook de backup e recuperação do banco. |
| [`docs/backup_schema.sql`](docs/backup_schema.sql) | Script que recria a estrutura do banco (tabelas, PK/FK, índices, RLS, grants). |
| [`docs/analise-duplicacao.md`](docs/analise-duplicacao.md) | Relatório histórico: análise de duplicação de código. |
| [`docs/analise-separacao.md`](docs/analise-separacao.md) | Relatório histórico: separação lógica × apresentação. |

> **Dados nunca vão para o git.** Os backups de dados (CSVs) ficam fora do repositório — ver
> `docs/backup.md`. O `.gitignore` barra `*.csv` como rede de segurança.
