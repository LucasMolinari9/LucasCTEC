# Handoff — verificação da auditoria preliminar de 30/07/2026

> **Snapshot de 30/07/2026 — não atualizar.** O estado atual do projeto vive no `CLAUDE.md`;
> a cronologia, no `docs/CHANGELOG.md`. Este arquivo é o retrato de uma sessão e envelhece
> de propósito.

> **Para a sessão nova:** leia este arquivo e o `CLAUDE.md`. Este descreve **o que aconteceu numa
> sessão específica e o que ficou combinado**; o `CLAUDE.md` é a fonte das regras do projeto. Se os
> dois divergirem, o `CLAUDE.md` manda.

## Estado

- **Branch:** `claude/ask-matt-u6cwf8` (só este documento; nenhum executável tocado).
- **Nenhuma alteração foi feita** em `app.js`, `index.html`, `styles.css`, schema, dado, Vercel,
  Supabase ou configuração externa. A sessão foi **somente leitura** por decisão explícita.
- **Sem PR aberto.**
- **Visibilidade do repositório: PÚBLICO** (o dono tornou privado durante a sessão e voltou a
  público ao fim — decisão tomada, ver abaixo).

## O que a sessão fez

Chegou um relatório de auditoria preliminar (gerado por outro modelo) com 4 achados de alta
prioridade, 7 de média, 3 de baixa e uma matriz de ameaças. A tarefa foi **verificar** o relatório
contra o repositório real, sem alterar nada.

O relatório acertou o diagnóstico de fundo — esta arquitetura está bem acima da média de um portal
estático pequeno, e as proteções que ele lista são reais. Mas ele só podia ver o repositório, e é
por isso que **os dois achados mais graves não estavam nele**: ambos são sobre defesas construídas
que não estão operando.

### Gates executados nesta sessão

| Gate | Resultado |
|---|---|
| `node tests/check.js` | ✅ verde (207 + 80 + 37 asserções; canon 49/49 com guarda; 11/11 fatos) |
| `node scripts/check_views.mjs` | ✅ **17/17 views**, anti-drift confirma 17 no seletor |
| `node scripts/check_abas.mjs` | ✅ 6/6 |
| `node scripts/check_deriva.mjs` | ⛔ HTTP 403 — proxy bloqueia `*.supabase.co` |
| `./scripts/semgrep.sh` | ⛔ `semgrep` não instalado neste ambiente |

### Estado vivo do CI (via API do GitHub)

- **`db-checks`:** 69 execuções; os **4 crons diários (27, 28, 29, 30/07) passaram**. É evidência
  forte de que RLS, grants, policies, qualidade e Realtime estão como o repositório afirma.
- **`views`:** 174 execuções, média **0,9 min**, todas verdes na amostra.
- **`backup`:** 1 execução (27/07) — cron semanal recém-criado, sem anomalia.
- **`deploy-smoke`:** 76 execuções, **21 falhas contra 9 sucessos** na amostra recente.

## Achados que importam para a próxima sessão

### 🔴 A — `deploy-smoke` vermelho em todo preview (o isolamento nunca é verificado)

Padrão sistemático: **`main` passa, preview falha.** Log do run `30575915728`:

```
DEPLOY_ENVIRONMENT: Preview
VERCEL_AUTOMATION_BYPASS_SECRET:            ← vazio
✓ / → 200
✗ preview protegido pela Vercel; configure o mesmo Protection Bypass for Automation…
Deploy não testado: a resposta é a tela de autenticação da Vercel, não o portal.
exit code 3
```

O script se comporta como projetado (falha fechado, diagnóstico explícito). A consequência é que a
propriedade central do **ADR-0002** — preview nunca lê o banco de produção — **nunca é exercitada no
ambiente para o qual foi escrita**. Só produção é verificada, e produção é justamente o caso que
não corre esse risco.

**Não é problema do Codex nem da integração Vercel↔GitHub**, que funciona: os eventos são
`deployment_status` vindos da Vercel, e a URL testada foi um preview real
(`divatdetro-5iph05cfl-…vercel.app`) gerado por push numa branch `claude/*`.

**Correção (só o dono):** Vercel → projeto `divatdetro` → Settings → Deployment Protection →
Protection Bypass for Automation → gerar; GitHub → Settings → Secrets → Actions →
`VERCEL_AUTOMATION_BYPASS_SECRET` com o **mesmo valor**. Nenhuma linha de código muda.

### 🔴 B — Restore ainda não concluído (SEC-06)

`docs/backup.md` e `docs/seguranca.md` §9.3 registram: exercício de 28/07 achou dois defeitos reais
(grants mais abertos que produção; `row_id` recusando valores dos CSVs), mas a restauração **não foi
levada até o fim**, o portal **nunca foi apontado ao banco restaurado** e **RTO/RPO seguem sem
medição**.

**Atualização do dono nesta sessão:** ele já fez parte do restore; faltavam dados em algumas
tabelas e a importação ainda estava em curso. Ou seja, está mais adiantado do que a doc registra.

Faltam três coisas, e a terceira é a que dá valor às outras duas:
1. terminar a importação;
2. apontar o portal ao banco restaurado e rodar `check_views.mjs` contra ele;
3. **medir RTO e RPO** e escrevê-los em `docs/backup.md`.

⚠️ **Armadilha conhecida:** se a importação for por CSV do Table Editor, a exportação parcial é
provavelmente a causa dos dados faltantes — foi exatamente o que travou a tentativa de 28/07
(`tabela_vista_teste` vazia, `itinerario_teste` com 5.298 de 52.146). Use `pg_dump`/`pg_restore`.
Contagens de referência estão em `docs/backup.md`.

### 🟡 C — Consumo de Actions (só importa se voltar a privado)

`ci`, `views`, `semgrep`, `deriva` e `db-checks` rodam em **`push` e em `pull_request`** — ou seja,
dobrado quando se empurra numa branch com PR aberto. Em repo **público** isso é desperdício de tempo,
não de dinheiro (minutos ilimitados). Em **privado** no plano Free (2.000 min/mês, faturados
arredondando para cima **por job**), no ritmo observado a cota se esgotaria em 2–3 semanas.

Como o repositório ficou público, **o PR 1 perde urgência mas mantém o valor** — continua sendo
higiene boa e reduz ruído.

### 🟡 D — Derivas de documentação

- **`docs/seguranca.md` §9.1** afirma que os defaults do `supabase_admin` "só atingem objetos
  criados por esse role; o painel cria como `postgres`, que já está fechado". **A medição
  desmentiu** — o `CLAUDE.md` registra que as 18 tabelas nasceram com TRUNCATE/REFERENCES/TRIGGER
  para `anon` (108 grants). O commit `ead1d67` atualizou o §9.3 do mesmo arquivo e deixou o §9.1
  intacto. O documento que o dono lê **subestima** o risco que motiva o gate diário.
- **`.github/workflows/views.yml`** diz "**23 views**" (linhas 1 e 71) e "**~62%** do app.js"
  (linha 14). O medido é **17** e **~58,8%**. Passou porque `DOCS_VIVOS` em `tests/check.js:213`
  só lista `.md` — comentário de workflow não é varrido.

### 🟡 E — Lacunas no `check_grants.mjs` (não urgentes, mas reais)

- **`security_invoker` não é verificado.** `divat_security_shape()` varre `relkind in ('r','p','v','m')`
  mas não lê `reloptions`. Uma view futura sem `security_invoker` contorna a RLS das tabelas de
  baixo; o gate só diria `rls_off` genérico — que convida a baselinar, o gesto errado.
- **A checagem de policy olha só `polcmd`**, não `polroles`/`polqual`. Hoje inofensivo (as 14
  policies são `FOR SELECT TO anon USING (true)` sobre dado público, correto por desenho). Vira IDOR
  no dia em que existir a área autenticada do **ADR-0001**.

### O que foi verificado e está CERTO (não mexer)

- **Zero** chave `service_role` na árvore e em todo o histórico do git.
- CSP sem `unsafe-inline`/`unsafe-eval`, com `style-src-attr 'none'`.
- `.vercelignore` allowlist; `permissions: contents: read` e `persist-credentials: false` em **7/7**
  workflows; Actions presas a SHA de 40 caracteres.
- `selecionarSupabase` falha fechado; `HOSTS_PROD` com 3 domínios.
- Seam `beginGen`/`commitViewResult` guardado em três camadas (canon, Semgrep, testes).
- `esc`/`enc`/`ilikeTerm` corretos; nenhuma interpolação crua de campo do banco encontrada.
- `data_quality_baseline.json` **já traz a lista nominal** das 12 órfãs classificadas por natureza —
  o pedido "não use só contagem" já estava atendido. O que falta é o gate comparar a lista.

## Decisões do dono nesta sessão

1. **Repositório fica PÚBLICO.** (Foi tornado privado no meio da sessão e revertido ao fim.)
2. **Fazer os PRs 1 a 4** abaixo.
3. Vai ligar a notificação "only notify for failed workflows" no GitHub.
4. Vai conferir as codlinhas órfãs (itens abertos no fim deste arquivo).

## Plano acordado — 4 PRs pequenos, um risco cada

Seguem o protocolo do repo: aditivos, reversíveis, sem misturar refatoração com mudança funcional.
Nenhum toca `app.js`, `index.html`, `styles.css`, schema ou dado.

**PR 1 — parar de rodar duas vezes a mesma verificação**
Trocar `on: push` (todas as branches) por `on: push: branches: [main]` em `ci.yml`, `views.yml`,
`semgrep.yml`, `deriva.yml` e `db-checks.yml`. Os cinco já rodam em `pull_request`.
*Invariante:* toda mudança continua verificada antes do merge; push direto na `main` segue coberto.
*Teste:* abrir PR trivial e conferir que cada workflow aparece uma vez, não duas.
*Aceite:* nenhum gate perde cobertura; execuções por mudança caem ~metade.

**PR 2 — corrigir as duas derivas factuais (achado D)**
`docs/seguranca.md` §9.1 alinhado ao `CLAUDE.md`; `views.yml` 23 → 17 e ~62% → ~58,8%.
Só prosa e comentário. *Aceite:* `node tests/check.js` verde.

**PR 3 — impedir que a deriva do PR 2 volte**
Estender a seção `[2b]` do `tests/check.js` para varrer também `.github/workflows/*.yml` na
conferência de fatos numéricos.
*Teste:* o gate acusa a divergência **antes** do PR 2 e passa **depois**.
*Ordem:* fazer PR 3 antes ou junto do PR 2, para provar que a guarda pega o caso real.

**PR 4 — registrar a decisão de visibilidade**
Como o repositório é público:
- criar **ADR-0003** com a decisão e o raciocínio (é hard-to-reverse — é exatamente o que ADR serve);
- `docs/seguranca.md` §5 item 4 hoje **recomenda tornar privado** — precisa virar decisão registrada,
  não ação pendente;
- ⚠️ **`docs/seguranca.md` §9 precisa de tratamento.** Não é o schema que preocupa — é o §9, que
  lista nominalmente os riscos residuais *aceitos* (defaults do `supabase_admin` não fecháveis; não
  há como aplicar rate limit; quais controles existem no lugar). Isso é um mapa de onde apertar,
  escrito pelo próprio dono. Duas saídas boas: **mover o §9 para fora do git** (mesma pasta dos
  backups) ou **reescrevê-lo** registrando a decisão sem entregar o roteiro. **Isto bloqueia o PR 4
  — precisa da escolha do dono.**
- Conferir se `LICENSE` (proprietário) segue adequado agora que o código é legível publicamente. O
  handoff de 27/07 registrou que LICENSE "só passa a importar se o repo virar público" — virou.

Os comentários de `backup.yml:5`, `semgrep.yml:51` e `CHANGELOG:254` afirmam que o repo é privado.
**Com a volta a público, os três ficaram errados de novo e entram no PR 4.** O comentário do
`backup.yml` é o mais sensível: é o arquivo que decide qual chave o backup usa, e alguém que o leia
pode concluir que pode colar a `service_role` ali.

Nota: em repo público o GitHub Code Scanning / SARIF passa a ser gratuito — o comentário do
`semgrep.yml` que o descarta por "exige Advanced Security" volta a ter premissa falsa. Oportunidade
de custo zero, **fora do escopo dos 4 PRs**.

## O que é do dono (não dá para eu fazer)

| Item | Onde |
|---|---|
| Protection Bypass + secret (achado A) | Vercel + GitHub Settings |
| "Only notify for failed workflows" | GitHub → Settings → Notifications → Actions |
| Terminar restore, medir RTO/RPO (achado B) | máquina do dono + projeto Supabase descartável |
| Decisão sobre o §9 do `seguranca.md` | bloqueia o PR 4 |
| Conferir codlinhas órfãs | processo original do DETRO |

⚠️ **Nunca colar valor de secret no chat.**

## Perguntas abertas

**As 6 codlinhas operacionais sem linha-pai** — em cada uma: a linha existe no cadastro e faltou
importar, ou o código está errado no filho?

| codlinha | Empresa | Pista |
|---|---|---|
| `146016000` | LINAVE | o hub vai só até `146015000` |
| `191020001` | VIAÇÃO PROGRESSO E TURISMO | o hub tem `191020000`; falta a variante `001` |
| `156002003` | TRANSPORTADORA TINGUÁ | o hub tem `000`/`001`/`002` |
| `121003000` | indeterminada | o hub vai só até `121002001` |
| `116000001` | indeterminada | só existe em `qh_predeterminado_teste` |
| `150006000` | RÁPIDO MACAENSE | **caso duplo**: histórico 1983–1996 *e* quadro vivo |

**`186006400`** (VIAÇÃO NOSSA SENHORA DO AMPARO) — evento de **2021**, recente demais para acervo
histórico, e o hub tem `186006000`/`186006001`. Se o processo original disser `186006000`, é
digitação — e a correção precisa ir **também na staging** (`evento_dados`/`evento_textos`), senão o
próximo rebuild do ETL desfaz.

## Limitações do ambiente (calibra a confiança do que está aqui)

1. **Sem rede até o Supabase** (403 do proxy). **Nada** sobre o banco vivo foi medido nesta sessão:
   grants, RLS, policies, órfãos, Realtime e deriva vêm do SQL versionado, dos baselines e do
   histórico verde do `db-checks` — não de medição própria.
2. **Semgrep ausente** — SAST não foi executado; as regras locais foram lidas.
3. **Painéis Vercel e Supabase não inspecionados.** MFA, branch protection, signup e
   leaked-password protection seguem **não verificados**. A ausência do
   `VERCEL_AUTOMATION_BYPASS_SECRET` foi inferida do log (campo vazio) — nenhum segredo foi exposto.
4. A verificação de XSS foi por leitura e grep, não por fuzzing.
