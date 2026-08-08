# Contexto para a próxima sessão — 08/08/2026

Sucessor do [handoff de 06/08](contexto-proxima-sessao-2026-08-06.md), que ficou desatualizado
assim que a migração 2 entrou no banco de teste. Não é doc vivo: é um instantâneo datado.

**Leia o de 06/08 só para o histórico.** Duas coisas dele estão erradas hoje, e estão corrigidas
aqui: a previsão de que o gate `qualidade` ficaria "verde com um `⚠`", e a lista de dívida (o item
mais urgente foi corrigido, o resto virou issue).

---

## Onde as coisas estão

- **Branch:** `claude/divat-fase3-diagnosticos-y7ry57`. **PR [#98](https://github.com/LucasMolinari9/LucasCTEC/pull/98), aberto.**
- **Migração 2 (`20260805000000`): APLICADA no banco de teste** em 07/08, pelo SQL Editor, dentro
  de `begin`/`commit`, com `Success. No rows returned`. Produção **não** recebeu nenhuma das duas.
- **Issue #74: comentada** ([comment](https://github.com/LucasMolinari9/LucasCTEC/issues/74#issuecomment-5223486677)),
  **continua aberta** de propósito — o desenho reinterpreta duas cláusulas dela e quem decide é
  quem a escreveu.
- **Branch `claude/divat-fase3-diagnosticos-k6izmc`**: contém o mesmo que a `y7ry57` até
  `7cae926`; já dobrada no PR por fast-forward. Pode ser descartada depois do merge.

## Placar do #98: 10 de 12 verdes

Verdes: `check`, `views`, `semgrep`, `migration-contract`, `prazos`, `smoke`, Vercel, **`realtime`**
e **`deriva`** — estes dois contra o banco de teste já migrado.

Vermelhos, os dois por credencial/medição, **nenhum por código**:

| Gate | Erro | O que falta |
|---|---|---|
| `seguranca` | `✗ Baseline sem 'digest'` | rodar `DIVAT_ALVO=teste node scripts/check_grants.mjs --atualizar-baseline` com rede e commitar `scripts/security_baseline.json` |
| `qualidade` | 404 em `public.divat_data_quality` | criar `divat_auditor_ci` no teste (`scripts/bootstrap_phase3_auditor.sql`) e gravar o secret `SUPABASE_TEST_AUDIT_DATABASE_URL` |

### O 404 do `qualidade` é o desenho funcionando

O handoff de 06/08 previa fallback anônimo com aviso. **Não vale mais.** A migração 2 tira
`divat_data_quality()` do alcance de `anon` — é o objetivo dela (59 varreduras sobre ~116 mil
linhas por chamada, acionável com uma chave pública). No banco migrado não existe caminho anônimo;
o gate exige a credencial auditora do alvo. Vermelho por falta dela não é regressão.

### O `seguranca` chega no digest sem problema

O `divat_security_digest()` responde. O que falta é a primeira medição: `security_baseline.json`
tem `"digest": null`, placeholder desde 27/07. Se o `--atualizar-baseline` reclamar de algum dos
**seis indicadores graves**, pare — isso não é baseline faltando, é postura de segurança errada no
banco, e não se resolve atualizando arquivo.

## O ambiente do Claude não alcança o Supabase — medido, não suposto

`DIVAT_ALVO=teste node scripts/check_grants.mjs` daqui devolve:

```
RPC divat_security_digest falhou (HTTP 403): Host not in allowlist: gontnlfmothfglssbyyk.supabase.co.
```

É a **política de egresso do ambiente de execução remota**, não firewall do Supabase nem chave
faltando. `curl "$HTTPS_PROXY/__agentproxy/status"` mostra o mesmo veredito para `mcp.supabase.com`
e `semgrep.dev`.

Consequência prática, para não se perder tempo de novo: **autorizar o conector MCP do Supabase não
basta** — são duas travas em série (autorização do conector + allowlist de egresso). Com o host
liberado na configuração de rede do ambiente, o passo do `seguranca` passa a ser fazível pelo
Claude; o do `qualidade` **não**, porque depende de credencial administrativa do banco e de escrita
em Actions Secrets, que nenhum token da sessão alcança.

## O que esta sessão fez

1. **Corrigiu a cegueira silenciosa do `check_data_quality`** (`7cae926`), item mais urgente da
   dívida do handoff anterior. A verificação só emite linha quando a contagem é > 0, então `[]`
   significa "dívida corrigida" **e** "fonte cega sobre banco sujo" — e o script escolhia sozinho a
   leitura otimista: imprimia `✓ Resolvido desde o baseline` e saía **0**. Agora zero achados com
   baseline não vazio aborta; e o `--atualizar-baseline`, que é a saída de emergência, avisa alto
   quando a dívida vai de N para zero (senão a própria saída seria cega). Dois casos novos na
   bancada, os dois vistos vermelhos antes do conserto.
2. **Corrigiu a deriva do `docs/schema.md`** (`7916427`) que o gate acusou assim que a migração
   entrou. Foi além da linha reclamada: o gate confere **presença** da RPC no doc, não o schema
   declarado, então `divat_api_shape` e `realtime_tables` estavam documentadas no lugar errado com
   o gate verde.
3. **Abriu 6 issues** com o resto da dívida (abaixo) e **comentou a #74**.

## Issues abertas nesta sessão

| # | Assunto |
|---|---|
| [#99](https://github.com/LucasMolinari9/LucasCTEC/issues/99) | `security_baseline.json` é um arquivo só para dois bancos, e o digest é por banco |
| [#100](https://github.com/LucasMolinari9/LucasCTEC/issues/100) | lista vazia continua indistinguível de banco limpo quando o baseline está zerado |
| [#101](https://github.com/LucasMolinari9/LucasCTEC/issues/101) | `lib/auditor.mjs`: prefixo do login aceita nome mais longo; `sslmode` sem piso |
| [#102](https://github.com/LucasMolinari9/LucasCTEC/issues/102) | bancada do `check_data_quality`: `psql` falso não confere o SQL; falta caso de `!Array.isArray` |
| [#103](https://github.com/LucasMolinari9/LucasCTEC/issues/103) | `db-checks.yml`: `apt-get install postgresql-client` provavelmente redundante |
| [#104](https://github.com/LucasMolinari9/LucasCTEC/issues/104) | `tests/README.md`: cabeçalho promete menos do que a pasta contém |

A **#99 é a mais urgente**: ela morde no dia em que produção receber as migrações, que é o próximo
passo grande do plano.

A #105 foi criada por engano (chamada de ferramenta malformada) e está fechada como `not planned`.

## Ordem daqui

1. Os dois pendentes acima → gates verdes.
2. Squash merge do #98.
3. Só então produção, na ordem obrigatória do `docs/planos/fase-3-hardening-moderado.md`: criar
   `divat_auditor_ci` em produção e gravar o secret (atualizando `vence_em` em
   `scripts/prazos.json`); janela única aplicando `20260729034018` **e** `20260805000000` em
   sequência, nada entre as duas, com dry-run transacional antes de cada; preencher o baseline;
   confirmar `check_deriva` e `check_realtime` verdes. **Resolver a #99 antes desse passo**, senão
   os dois bancos passam a disputar o mesmo campo `digest`.

## Ideia que ficou na mesa, não implementada

Um workflow que aplique migração pendente no banco de **teste** sozinho (`supabase db push` com
secret de conexão), para "aplicar migração no teste" deixar de ser tarefa de humano. Não foi feito
por três motivos: a necessidade aguda passou (a migração 2 já entrou); guarda uma credencial com
poder de DDL no CI, o que é decisão de segurança e não detalhe de encanamento; e há uma armadilha
concreta — as migrações 1 e 2 foram aplicadas **à mão**, então `supabase_migrations.schema_migrations`
não as conhece, e um `db push` tentaria reaplicá-las (a migração 1 abortaria na pré-condição).
Precisaria de `supabase migration repair --status applied` antes. Nunca automatizar produção do
mesmo jeito: lá o gargalo é deliberado, num banco sem PITR.
