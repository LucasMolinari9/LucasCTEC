# Handoff — execução dos PRs do plano de 30/07 + o `deploy-smoke` funcionando

> **Para a sessão nova:** leia este arquivo e o `CLAUDE.md`. Este descreve **o que aconteceu numa
> sessão específica e o que ficou aberto**; o `CLAUDE.md` é a fonte das regras do projeto. Se os
> dois divergirem, o `CLAUDE.md` manda.

## Estado

- **`main`:** `d0d0716` (PRs #85 e #86 mergeados, gate verde contra ela).
- **Branch:** `claude/auditoria-verificacao-prs-pr1at9` — **PR #87 aberto, 5/5 checks verdes,
  NÃO mergeado**. É a única decisão de merge pendente.
- **Repositório: PÚBLICO.**

| PR | O que é | Estado |
|---|---|---|
| #85 | PR 3 (guarda `[2b]` varre workflows) + PR 2 (as duas derivas do achado D) | ✅ na `main` |
| #86 | PR 1 (cada gate roda uma vez, não duas) | ✅ na `main` |
| #87 | `deploy-smoke`: expõe a causa da falha de rede + conserta o loop de redirect | 🟡 **verde, aguardando merge** |

## O que a sessão fez

Executou os PRs **3, 2 e 1** do plano acordado no handoff de 30/07 (`docs/handoff-2026-07-30-
auditoria-verificacao.md`, que **só existe na branch `claude/ask-matt-u6cwf8`, nunca mergeada** —
ver Pendências). Depois, o dono configurou o Protection Bypass da Vercel e o trabalho virou
diagnóstico do `deploy-smoke`.

### O marco: o ADR-0002 saiu do papel

O achado **A** do handoff de 30/07 era que o `deploy-smoke` falhava em **todo** preview, e por
isso a propriedade central do ADR-0002 — preview nunca lê o banco de produção — **nunca tinha sido
exercitada**. Isso acabou em 31/07/2026, 01:03 UTC. O log do run que passou:

```
✓ divatdetro-4ghtjqif8-…vercel.app está fora da allowlist e seleciona teste
✓ URL de produção preservada
✓ URL de teste isolada
✓ teste: anon key do projeto esperado
✓ guarda fail-closed publicada
Deploy aprovado: headers, allowlist e isolamento de ambiente estão coerentes.
```

### A armadilha do diagnóstico (não repita)

O caminho do `deploy-smoke`, em ordem:

| Run | Exit | Mensagem | O que era de fato |
|---|--:|---|---|
| #78–#82 | 3 | `preview protegido pela Vercel` | faltava mesmo o segredo |
| #83, #84 | 1 | `fetch failed` × 18 | **o segredo JÁ funcionava** |
| #87 c1 | 1 | `fetch failed (causa: redirect count exceeded)` | a causa, enfim visível |
| #87 c2 | 0 | `Deploy aprovado` | resolvido |

**Os runs #83 e #84 pareciam uma piora e eram o oposto.** Com o segredo ERRADO, a Vercel devolvia
a tela de login com 200 e o gate reprovava limpo. O loop de redirect só começou **porque** o
bypass passou a valer: o script mandava `x-vercel-set-bypass-cookie: true`, que pede à Vercel um
**redirect + Set-Cookie** — receita da documentação para **Playwright/Cypress, que rodam em
navegador e têm cookie jar**. O `fetch` do Node não guarda cookie: segue o redirect sem ele, a
Vercel redireciona de novo, até estourar o limite de 20.

Ler aquilo como "o bypass quebrou" teria mandado o dono mexer no lado que já estava certo.

### Técnicas que funcionaram

- **`error.cause` é obrigatório em gate de rede.** O `fetch` do Node põe toda falha sob a mesma
  frase `fetch failed`. Sem a causa, três execuções seguidas não disseram nada. Uma linha de log
  resolveu o que a inspeção da API da Vercel (deployment `READY`, proteção inalterada) não
  resolvia.
- **Reproduzir o sintoma com servidor local** em vez de teorizar: 21 voltas, cookie nunca
  reenviado, mesmo `redirect count exceeded`. E com o header removido, HTTP 200 na primeira.
- **Testar hipótese antes de mandar o dono agir.** A hipótese "caractere inválido no header" foi
  medida e **caiu** (`\n` no fim é removido pelo Node; acento e aspas passam). Teria custado uma
  rodada de retrabalho no valor do segredo.

## Pendências — as duas primeiras são decisão do dono

### 1. Mergear o PR #87

5/5 checks verdes, incluindo o `smoke` contra preview real. É ele que mantém o gate funcionando em
todo preview daqui pra frente.

### 2. PR 4 — visibilidade (destravado)

O bloqueio era a decisão sobre o §9 do `docs/seguranca.md`. **O dono decidiu: reescrever sem o
roteiro** — o §9 fica no git registrando QUE os riscos foram avaliados e aceitos, sem detalhar
qual controle falta onde; o detalhe operacional vai para a pasta dos backups, fora do git.

Escopo do PR 4:
- **`docs/seguranca.md:81` é o item mais perigoso da lista** — não é premissa velha, é uma
  **instrução acionável** (“Repositório GitHub privado: Settings → Danger Zone → Change
  visibility → Private”) mandando fazer o oposto da decisão tomada. Um agente futuro lendo o
  manual de segurança executa.
- §9 reescrito conforme a decisão acima.
- **ADR-0003** com a decisão de visibilidade e o raciocínio.
- Comentários com premissa velha: `semgrep.yml:55` (`--metrics=off` “porque o repo é privado”) e
  `CHANGELOG:254`. **O comentário do `backup.yml` NÃO é perigoso** — foi verificado nesta sessão:
  ele diz “nada de service key aqui — não porque o repo seja público (ele é PRIVADO), mas porque
  service key em variável de workflow amplia a superfície”. A premissa entre parênteses está
  velha, mas a conclusão está certa e independe da visibilidade. O handoff de 30/07 superestimou
  esse item.
- Conferir se o `LICENSE` (proprietário) segue adequado.

### 3. Deriva criada HOJE, ainda não corrigida

`docs/seguranca.md` §9.3 e `docs/backup.md` afirmam que o isolamento de preview nunca foi
exercitado. **Isso deixou de ser verdade em 31/07/2026.** Este repositório trata deriva de
documentação como defeito — candidato natural a entrar junto do PR 4.

### 4. O handoff de 30/07 está preso numa branch

`docs/handoff-2026-07-30-auditoria-verificacao.md` só existe em `claude/ask-matt-u6cwf8`, sem PR.
O `docs/CHANGELOG.md` desta sessão **cita esse caminho**: enquanto aquela branch não entrar na
`main`, a referência aponta para arquivo ausente.

## Consequência prática do PR 1 (não esqueça)

**Push numa branch SEM PR aberto não dispara gate nenhum.** Antes disparava. Rode
`node tests/check.js` local, ou use a aba Actions → Run workflow (`workflow_dispatch`, que os
cinco gates agora têm). Está registrado no cabeçalho do `ci.yml` e no `CLAUDE.md`, passo 1.

## O que continua sendo só do dono

| Item | Onde | Peso |
|---|---|---|
| Terminar o restore e **medir RTO/RPO** (SEC-06) | máquina do dono + projeto Supabase descartável | **o maior aberto**; apontado em 16/07 e 27/07, ainda sem número |
| Conferir as 6 codlinhas órfãs | processo original do DETRO | baixo — já medido: não afetam a busca; só a frota muda (6.176 → 6.175) |
| “Only notify for failed workflows” | GitHub → Settings → Notifications | baixo |

⚠️ Armadilha do restore, já mapeada: se os dados faltantes vieram de CSV do Table Editor, é
exportação parcial — use `pg_dump`/`pg_restore`. Contagens de referência em `docs/backup.md`.

## Fora de escopo, oportunidade de custo zero

Em repo público o **GitHub Code Scanning / SARIF** é gratuito, então o comentário do `semgrep.yml`
que o descarta por “exigir Advanced Security” está com premissa falsa. Ganho é ergonomia (achados
viram anotação no diff), não segurança nova.

## Limitações do ambiente de agente (calibra o que dá para pedir)

1. **Sem rede até o Supabase e até a Vercel** (403 do proxy). `check_deriva.mjs`,
   `check_realtime.mjs` e `check_data_quality.mjs` não rodam aqui — só no CI ou na máquina do dono.
2. **Semgrep não instalado** — SAST local não roda; o CI cobre.
3. **Sem permissão para disparar workflows** pela API (403 em `actions_run_trigger`) e **sem
   ferramenta para listar secrets**. Rodar o `Run workflow` é sempre do dono; ler o log é do agente.
4. **A API da Vercel não expõe o Protection Bypass** — `get_project_deployment_protection` só
   reporta password, SSO e trusted IPs. Não dá para verificar por lá se o segredo existe.
