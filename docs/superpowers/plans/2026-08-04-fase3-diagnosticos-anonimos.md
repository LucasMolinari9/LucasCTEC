# Fase 3 — diagnósticos anônimos e transição dos gates vivos · Plano de Implementação

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `subagent-driven-development`
> (recomendado) ou `executing-plans` para executar tarefa a tarefa. Os passos usam checkbox
> (`- [ ]`) para acompanhamento.

**Spec:** `docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md`

**Goal:** Preparar o repositório para que a migração da Fase 3 possa ser aplicada em produção sem
cegar os quatro gates que hoje leem RPCs diagnósticas como `anon`.

**Architecture:** Uma RPC anônima nova (`divat_security_digest()`) devolve resumo em vez de matriz,
mantendo o alarme diário de grants sem credencial e sem prazo de validade. Duas diagnósticas
baratas (`divat_api_shape`, `realtime_tables`) voltam para `public` — dois gates não mudam uma
linha. As duas caras/sensíveis vão para `audit` e seus gates passam a falar por credencial de
auditor. Todo gate que muda de caminho ganha **modo duplo com data de expiração**, para nunca
nascer vermelho nem virar permanente por inércia.

**Tech Stack:** Node 20 (ESM nos `scripts/*.mjs`, CommonJS nos `tests/*.test.js`), PostgreSQL 15
(Supabase), PostgREST, GitHub Actions. Zero dependências de terceiros.

## Global Constraints

Valem para **todas** as tarefas. Copiadas do `CLAUDE.md` e da spec.

- **Zero-build, zero dependência.** Não existe `package.json`. Nada de `npm install`, nada de
  framework de teste. Só Node puro (`fetch` nativo, `node:*`).
- **`scripts/*.mjs` são ESM; `tests/*.test.js` são CommonJS.** Sem `package.json` não há
  `"type": "module"`: `.js` é CJS e `.mjs` é ESM. Um teste CJS que precise de um módulo ESM usa
  `await import(...)` dentro de função `async`.
- **`tests/check.js` é offline e determinístico.** Nada que dependa de rede, relógio ou estado
  externo entra nele. Gate com data vai para workflow, não para o `check.js`.
- **Todo `*.test.js` termina imprimindo** `\n==== PLACAR: <pass>/<total> ====` e sai 1 se houver
  falha. É assim que o `check.js` lê o placar.
- **Toda cópia exportada por um harness precisa de entrada no `canon`** do `tests/check.js`. Este
  plano não cria harness novo; se você criar um, adicione a guarda.
- **Nunca editar migração já aplicada.** `20260729034018_phase3_moderate_hardening.sql` está
  aplicada no projeto de teste. Ela não se toca.
- **Nenhuma tarefa aplica DDL.** Aplicar migração é ato manual do dono. O plano entrega SQL
  versionado e verificado, não banco alterado.
- **Este ambiente não alcança o Supabase** (proxy bloqueia). Todo gate vivo é verificado por
  bancada offline com PostgREST stubado; a verificação contra banco real é do dono/CI.
- **Rigs precisam de `NO_PROXY=127.0.0.1`.** No `ci.yml` isso já está declarado no passo das
  bancadas — nunca declare `NO_PROXY` e `no_proxy` como duas chaves do mesmo `env:` (o GitHub
  trata nome de variável como case-insensitive e **rejeita o workflow**, que morre com zero jobs).
- **Data injetável para teste:** todo código que compara com "hoje" lê `process.env.DIVAT_HOJE`
  (ISO `AAAA-MM-DD`) quando presente. Sem isso os testes de prazo não são determinísticos.
- **Commits:** mensagem em português, prefixo convencional (`feat:`, `fix:`, `docs:`, `test:`),
  e os trailers que o repositório usa (`Co-Authored-By:` e `Claude-Session:`) ao final.
- **Gate de saída de toda tarefa:** `node tests/check.js` verde antes de commitar.

---

## Estrutura de arquivos

**Criar**

| Arquivo | Responsabilidade única |
|---|---|
| `scripts/lib/prazos.mjs` | Ler `prazos.json` e classificar um prazo em ok/aviso/erro. Pura, sem I/O de rede, sem `process.exit`. |
| `scripts/prazos.json` | Os prazos, como dado versionado. Fonte única das datas. |
| `scripts/check_prazos.mjs` | CLI fina sobre `lib/prazos.mjs`. Sai 1 se algum prazo estourou. |
| `scripts/lib/auditor.mjs` | Conexão pelo login auditor: guarda de project ref (dois refs conhecidos) + execução de SQL por `psql`. |
| `supabase/migrations/<ts>_phase3_diagnosticos_anonimos.sql` | Migração 2: traz duas diagnósticas de volta, cria a RPC de digest. |
| `scripts/rollback_phase3_diagnosticos.sql` | Desfaz a migração 2. |
| `tests/prazos.test.js` | Teste unitário do classificador de prazo. |
| `tests/check_migrations.rig.mjs` | Bancada do gate de migrações: prova que ele recusa o que deve recusar. |

**Modificar**

| Arquivo | O que muda |
|---|---|
| `scripts/check_grants.mjs` | Modo duplo (digest → fallback datado), expectativas fixas, `SEP` como escape. |
| `scripts/security_baseline.json` | Ganha `digest` e `anon_rpcs`. |
| `scripts/check_migrations.mjs` | Allowlist vira duas faixas com critério. |
| `scripts/check_phase3_audit.mjs` | Passa a usar `lib/auditor.mjs` e aceitar dois refs. |
| `scripts/check_data_quality.mjs` | Modo duplo: auditor → fallback anon datado. |
| `tests/check_grants.rig.mjs` | Casos do caminho digest, do fallback e da expiração. |
| `.github/workflows/ci.yml` | Passa a rodar `check_grants.rig.mjs` e `check_migrations.rig.mjs`. |
| `.github/workflows/db-checks.yml` | Passa a rodar `check_prazos.mjs` diariamente. |
| `CLAUDE.md`, `docs/seguranca.md`, `docs/planos/fase-3-hardening-moderado.md`, `tests/README.md` | Prosa alinhada ao novo desenho. |

**Ordem e porquê:** Tarefa 1 primeiro porque a data de expiração do fallback vive no
`prazos.json` e a Tarefa 5 depende dela. Tarefa 2 antes da 5 para provar a fiação do rig
**enquanto ele ainda está verde**, separando "a fiação funciona" de "o gate mudou".

---

## Task 1: Gate de prazo

**Files:**
- Create: `scripts/lib/prazos.mjs`
- Create: `scripts/prazos.json`
- Create: `scripts/check_prazos.mjs`
- Create: `tests/prazos.test.js`
- Modify: `.github/workflows/db-checks.yml`

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `hojeISO(): string` — data de hoje `AAAA-MM-DD`, respeitando `process.env.DIVAT_HOJE`.
  - `lerPrazos(root: string): Promise<Prazo[]>` — lê e valida `scripts/prazos.json`. Lança `Error`
    se o arquivo faltar ou um item for inválido.
  - `classificar(prazo: Prazo, hoje: string): { id, dias, nivel, mensagem }` onde
    `nivel ∈ 'ok'|'aviso'|'erro'` e `dias` é inteiro (negativo se vencido).
  - `Prazo = { id: string, descricao: string, vence_em: string, aviso_dias: number, erro_dias: number, referencia: string }`

- [ ] **Step 1: Escreva o teste que falha**

Crie `tests/prazos.test.js`:

```js
'use strict';
/* Classificador de prazo — o núcleo do scripts/check_prazos.mjs.
   Rode: node prazos.test.js   (ou, melhor, node check.js para rodar tudo).

   Por que existe: um gate que depende da data de hoje só é confiável se a data for
   injetável. Todo caso aqui fixa `hoje` explicitamente — nenhum depende do relógio. */

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, detail){
  if (cond){ pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail?(' — '+detail):'')); console.log('  FAIL', name, detail||''); }
}

(async () => {
  const { classificar, hojeISO } = await import('../scripts/lib/prazos.mjs');

  const base = { id: 'cred', descricao: 'credencial auditora', vence_em: '2026-10-31',
                 aviso_dias: 30, erro_dias: 7, referencia: 'docs/planos/fase-3-hardening-moderado.md' };

  console.log('classificar — níveis por distância até o vencimento');
  ok(classificar(base, '2026-08-04').nivel === 'ok',    'longe do prazo → ok');
  ok(classificar(base, '2026-10-01').nivel === 'aviso', '30 dias exatos → aviso');
  ok(classificar(base, '2026-10-20').nivel === 'aviso', 'dentro do aviso → aviso');
  ok(classificar(base, '2026-10-24').nivel === 'erro',  '7 dias exatos → erro');
  ok(classificar(base, '2026-10-30').nivel === 'erro',  'véspera → erro');
  ok(classificar(base, '2026-10-31').nivel === 'erro',  'no dia → erro');
  ok(classificar(base, '2026-11-05').nivel === 'erro',  'vencido → erro');

  console.log('classificar — a contagem de dias');
  ok(classificar(base, '2026-10-31').dias === 0,  'no dia → 0 dias');
  ok(classificar(base, '2026-11-05').dias === -5, 'vencido → dias negativo');
  ok(classificar(base, '2026-10-01').dias === 30, '30 dias antes → 30');

  console.log('classificar — fail-closed em dado inválido');
  ok(classificar({ ...base, vence_em: 'ontem' }, '2026-08-04').nivel === 'erro',
     'data ilegível → erro, não ok');
  ok(classificar({ ...base, vence_em: '' }, '2026-08-04').nivel === 'erro',
     'data vazia → erro, não ok');

  console.log('hojeISO — injetável');
  process.env.DIVAT_HOJE = '2030-01-02';
  ok(hojeISO() === '2030-01-02', 'DIVAT_HOJE manda em hojeISO()');
  delete process.env.DIVAT_HOJE;
  ok(/^\d{4}-\d{2}-\d{2}$/.test(hojeISO()), 'sem DIVAT_HOJE devolve data no formato ISO curto');

  console.log('\n==== PLACAR:', pass + '/' + (pass + fail), '====');
  if (fail){ console.log('FALHAS:'); fails.forEach(f => console.log('  -', f)); process.exit(1); }
})();
```

- [ ] **Step 2: Rode para ver falhar**

```bash
node tests/prazos.test.js
```

Esperado: falha com `Cannot find module` apontando para `scripts/lib/prazos.mjs`.

- [ ] **Step 3: Implemente `scripts/lib/prazos.mjs`**

```js
// prazos.mjs — núcleo do gate de prazo. Puro: sem rede, sem process.exit, sem console.
//
// Por que existe: neste repositório, o que cabe num `git push` acontece e o que depende de
// lembrar não acontece. Um compromisso com data (rotação de credencial, remoção de caminho
// temporário, revisão trimestral) só é real se um gate o cobrar ANTES do vencimento, num canal
// que já se lê. Ver docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md §6.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIA_MS = 86400000;

// Data de hoje em AAAA-MM-DD. `DIVAT_HOJE` existe para que teste e bancada sejam
// determinísticos — sem isso, um caso que passa hoje falha em novembro.
export function hojeISO() {
  const bruto = process.env.DIVAT_HOJE;
  if (bruto && /^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  return new Date().toISOString().slice(0, 10);
}

const ehData = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Dias inteiros de `hoje` até `vence_em`. Ambos em UTC para não escorregar por fuso.
function diasAte(vence_em, hoje) {
  return Math.round((Date.parse(`${vence_em}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA_MS);
}

// FAIL-CLOSED: data ilegível vira `erro`, nunca `ok`. Um prazo que o gate não consegue ler é
// exatamente o caso em que ele não pode dizer "está tudo bem".
export function classificar(prazo, hoje) {
  const id = prazo?.id ?? '(sem id)';
  if (!ehData(prazo?.vence_em)) {
    return { id, dias: NaN, nivel: 'erro',
      mensagem: `${id}: 'vence_em' ausente ou ilegível (${JSON.stringify(prazo?.vence_em)}) — corrija scripts/prazos.json` };
  }
  if (!ehData(hoje)) {
    return { id, dias: NaN, nivel: 'erro', mensagem: `${id}: data de referência ilegível (${hoje})` };
  }
  const dias = diasAte(prazo.vence_em, hoje);
  const aviso = Number.isInteger(prazo.aviso_dias) ? prazo.aviso_dias : 30;
  const erro = Number.isInteger(prazo.erro_dias) ? prazo.erro_dias : 7;

  if (dias <= erro) {
    return { id, dias, nivel: 'erro',
      mensagem: dias < 0
        ? `${id}: VENCEU há ${-dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}`
        : `${id}: vence em ${dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}` };
  }
  if (dias <= aviso) {
    return { id, dias, nivel: 'aviso',
      mensagem: `${id}: vence em ${dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}` };
  }
  return { id, dias, nivel: 'ok', mensagem: `${id}: ${dias} dia(s) de folga` };
}

const CAMPOS = ['id', 'descricao', 'vence_em', 'aviso_dias', 'erro_dias', 'referencia'];

export async function lerPrazos(root) {
  const caminho = join(root, 'scripts', 'prazos.json');
  let bruto;
  try {
    bruto = JSON.parse(await readFile(caminho, 'utf8'));
  } catch (e) {
    throw new Error(`Não consegui ler ${caminho}: ${e.message}`);
  }
  if (!Array.isArray(bruto?.prazos)) {
    throw new Error(`${caminho} não tem a lista 'prazos' — abortando em vez de assumir vazio.`);
  }
  for (const p of bruto.prazos) {
    for (const c of CAMPOS) {
      if (p?.[c] === undefined) throw new Error(`Prazo '${p?.id ?? '?'}' sem o campo '${c}' em ${caminho}`);
    }
  }
  return bruto.prazos;
}

// Conveniência para quem só precisa de UM prazo (ex.: check_grants.mjs e o seu fallback).
export async function prazoPorId(root, id) {
  const achado = (await lerPrazos(root)).find(p => p.id === id);
  if (!achado) throw new Error(`Prazo '${id}' não existe em scripts/prazos.json`);
  return achado;
}
```

- [ ] **Step 4: Rode o teste — tem que passar**

```bash
node tests/prazos.test.js
```

Esperado: `==== PLACAR: 14/14 ====`, saída 0.

- [ ] **Step 5: Crie `scripts/prazos.json`**

```json
{
  "nota": "Compromissos com data. Um item aqui é cobrado pelo scripts/check_prazos.mjs ANTES de vencer. Remover uma entrada é decisão consciente e aparece no diff — não faça por reflexo quando o gate ficar amarelo.",
  "prazos": [
    {
      "id": "credencial_auditor_ci",
      "descricao": "rotacionar a senha do login divat_auditor_ci (VALID UNTIL)",
      "vence_em": "2026-10-31",
      "aviso_dias": 30,
      "erro_dias": 7,
      "referencia": "docs/planos/fase-3-hardening-moderado.md secao 'Credencial auditora e secret'"
    },
    {
      "id": "check_grants_fallback",
      "descricao": "remover o fallback para divat_security_shape do check_grants.mjs (so vale ate a Fase 3 estar aplicada em producao)",
      "vence_em": "2026-11-30",
      "aviso_dias": 30,
      "erro_dias": 0,
      "referencia": "docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md secao 5"
    },
    {
      "id": "check_data_quality_fallback",
      "descricao": "remover o fallback anonimo do check_data_quality.mjs (so vale ate a Fase 3 estar aplicada em producao)",
      "vence_em": "2026-11-30",
      "aviso_dias": 30,
      "erro_dias": 0,
      "referencia": "docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md secao 9.3"
    },
    {
      "id": "revisao_seguranca_trimestral",
      "descricao": "revisao trimestral do checklist de seguranca",
      "vence_em": "2026-10-23",
      "aviso_dias": 21,
      "erro_dias": 0,
      "referencia": "docs/seguranca.md"
    }
  ]
}
```

`erro_dias: 0` nos fallbacks é deliberado: eles avisam por 30 dias e só quebram o build **no dia**
do vencimento, não antes — remover um caminho de transição cedo demais é pior que tarde.

- [ ] **Step 6: Implemente `scripts/check_prazos.mjs`**

```js
// check_prazos.mjs — cobra os compromissos com data de scripts/prazos.json.
//
// Roda DIARIAMENTE no db-checks.yml. Acima de `aviso_dias`: silencioso. Abaixo: imprime.
// Abaixo de `erro_dias`: sai 1 e quebra o build.
//
// Por que NÃO está no tests/check.js: o contrato do check.js é ser offline E determinístico.
// Um gate cujo veredito muda com o calendário quebraria essa propriedade — e um `check.js` que
// falha sozinho numa terça de novembro é um gate que se aprende a ignorar.
//
// Uso:  node scripts/check_prazos.mjs
//       DIVAT_HOJE=2026-10-25 node scripts/check_prazos.mjs   # simula uma data

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lerPrazos, classificar, hojeISO } from './lib/prazos.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let prazos;
try {
  prazos = await lerPrazos(ROOT);
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

const hoje = hojeISO();
const vereditos = prazos.map(p => classificar(p, hoje));
const erros = vereditos.filter(v => v.nivel === 'erro');
const avisos = vereditos.filter(v => v.nivel === 'aviso');

for (const v of avisos) console.log(`  ⚠ ${v.mensagem}`);
for (const v of erros) console.error(`  ✗ ${v.mensagem}`);

if (erros.length) {
  console.error(`\n✗ ${erros.length} prazo(s) estourado(s) ou a ponto de estourar (hoje: ${hoje}).`);
  console.error('  Aja no compromisso e atualize `vence_em` em scripts/prazos.json.');
  console.error('  Apagar a entrada também silencia — mas aparece no diff, e é decisão sua assumir.');
  process.exit(1);
}
console.log(`✓ Prazos: ${prazos.length} conferido(s), ${avisos.length} em aviso, nenhum estourado (hoje: ${hoje}).`);
```

- [ ] **Step 7: Prove os três níveis à mão**

```bash
node scripts/check_prazos.mjs                                   # hoje: tudo ok
DIVAT_HOJE=2026-10-15 node scripts/check_prazos.mjs            # aviso da credencial
DIVAT_HOJE=2026-12-01 node scripts/check_prazos.mjs; echo "saida=$?"
```

Esperado, em ordem: saída 0 silenciosa; saída 0 com `⚠ credencial_auditor_ci`; **saída 1** com os
três fallbacks/credencial estourados.

- [ ] **Step 8: Ligue no `db-checks.yml`**

Acrescente um job novo, irmão dos que já existem (`realtime`, `qualidade`, `seguranca`). Ele não
fala com o banco, então não precisa de rede nem secret:

```yaml
  prazos:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: '20'
      - name: Compromissos com data (credenciais, caminhos de transicao)
        run: node scripts/check_prazos.mjs
```

Copie os SHAs das actions dos jobs vizinhos do mesmo arquivo — **não** use tags flutuantes
(`@v4`), que o repositório proíbe.

- [ ] **Step 9: Gate e commit**

```bash
node tests/check.js
git add scripts/lib/prazos.mjs scripts/prazos.json scripts/check_prazos.mjs \
        tests/prazos.test.js .github/workflows/db-checks.yml
git commit -m "feat: gate de prazo para compromissos com data"
```

---

## Task 2: Ligar o rig órfão do check_grants no CI

**Files:**
- Modify: `.github/workflows/ci.yml` (passo "Bancadas offline de backup e restauração")

**Interfaces:**
- Consumes: nada.
- Produces: nada consumido por outra tarefa. É a rede de segurança sob a Tarefa 5.

**Por que agora e não junto da Tarefa 5:** ligar a bancada **enquanto ela ainda está verde** separa
"a fiação funciona" de "o gate mudou". Se as duas coisas entrarem juntas e o CI ficar vermelho,
você não sabe qual das duas quebrou.

- [ ] **Step 1: Prove que o rig passa hoje, sem tocar em nada**

```bash
NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 node tests/check_grants.rig.mjs
```

Esperado: `✓ bancada: todos os casos passaram`, saída 0.

- [ ] **Step 2: Acrescente a linha no `ci.yml`**

No passo que já existe, some a terceira bancada e renomeie o passo:

```yaml
      - name: Bancadas offline de backup, restauração e grants
        env:
          NO_PROXY: 127.0.0.1
        run: |
          export no_proxy="$NO_PROXY"
          node tests/backup_rest.rig.mjs
          node tests/restore_rest.rig.mjs
          node tests/check_grants.rig.mjs
```

**Não** acrescente uma chave `no_proxy:` ao `env:` — o GitHub trata nome de variável como
case-insensitive e rejeita o workflow inteiro (`tests/check.js` §[1c] cobra isso).

- [ ] **Step 3: Rode o gate, que valida o YAML**

```bash
node tests/check.js
```

Esperado: `[1c] Workflows: nenhum env: com chave duplicada` verde, tudo verde.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "test: roda a bancada do check_grants no CI

Dos tres rigs offline, dois rodavam no ci.yml e o check_grants.rig.mjs nao
rodava em workflow nenhum — justamente a bancada que prova que o gate diario
de seguranca aperta. Mesmo modo de falha do check_realtime.mjs antes de entrar
no db-checks.yml."
```

---

## Task 3: A RPC de digest e a migração 2

**Files:**
- Create: `supabase/migrations/20260805000000_phase3_diagnosticos_anonimos.sql`
- Create: `scripts/rollback_phase3_diagnosticos.sql`

**Interfaces:**
- Consumes: nada do repositório; **pressupõe** a migração `20260729034018` aplicada.
- Produces: `public.divat_security_digest()` retornando `jsonb` com exatamente estas chaves —
  `digest` (string hex de 64 caracteres), `tabelas_publicas` (número), `todas_com_rls` (booleano),
  `anon_escreve` (booleano), `authenticated_tem_privilegio` (booleano), `anon_rpcs` (número).
  A Tarefa 5 depende desses nomes e tipos.

**Nota sobre o timestamp do nome:** use um timestamp posterior a `20260729034018` e anterior à data
de execução. `20260805000000` serve; se você executar em outro dia, ajuste — o que importa é a
ordem lexicográfica.

- [ ] **Step 1: Escreva a migração**

Crie `supabase/migrations/20260805000000_phase3_diagnosticos_anonimos.sql`:

```sql
-- Fase 3, migracao 2 — diagnosticos anonimos.
--
-- A migracao 1 (20260729034018) moveu as QUATRO RPCs diagnosticas para o schema `audit` e
-- revogou o execute de anon. Medido em 04/08/2026, isso cega quatro gates vivos de uma vez,
-- incluindo o DIARIO (check_grants.mjs), que é a compensacao do default nao-fechavel do
-- supabase_admin descrita em docs/seguranca.md 9.1.
--
-- Esta migracao reparte os quatro por CRITERIO, nao por numero (spec secao 2):
--   * divat_api_shape e realtime_tables voltam para `public` e continuam anonimas — o que elas
--     revelam ja esta publicado a mao em docs/schema.md e no CLAUDE.md (ADR-0003), e sao de
--     catalogo, sem varredura. Dois gates seguem sem mudar uma linha.
--   * divat_security_shape (matriz de grants — recon real) e divat_data_quality (59 varreduras
--     completas sobre ~116 mil linhas — alavanca de indisponibilidade) FICAM em `audit`.
--   * divat_security_digest() nasce aqui: resumo em vez de matriz, para o alarme diario
--     sobreviver sem credencial e sem prazo de validade.

do $$
begin
  if to_regnamespace('private') is null or to_regnamespace('audit') is null then
    raise exception 'Precondicao falhou: schemas private/audit ausentes — a migracao 20260729034018 nao foi aplicada aqui';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'divat_audit_owner')
     or not exists (select 1 from pg_roles where rolname = 'divat_auditor') then
    raise exception 'Precondicao falhou: papeis de auditoria ausentes';
  end if;

  if to_regprocedure('audit.divat_api_shape()') is null
     or to_regprocedure('audit.realtime_tables()') is null
     or to_regprocedure('audit.divat_security_shape()') is null
     or to_regprocedure('audit.divat_data_quality()') is null then
    raise exception 'Precondicao falhou: as quatro diagnosticas nao estao todas em audit';
  end if;

  if to_regprocedure('public.divat_security_digest()') is not null then
    raise exception 'Precondicao falhou: public.divat_security_digest() ja existe';
  end if;
end $$;

-- As quatro funcoes de `audit` pertencem a divat_audit_owner, e a migracao 1 termina com
-- `revoke divat_audit_owner, divat_auditor from postgres`. Sem re-conceder, o ALTER FUNCTION
-- ... OWNER TO abaixo falha com 42501 (permissao negada). Revogado de novo no fim.
grant divat_audit_owner to postgres;

-- --- as duas baratas voltam para public, anonimas e INVOKER --------------------------------
alter function audit.divat_api_shape()  security invoker;
alter function audit.realtime_tables()  security invoker;
alter function audit.divat_api_shape()  owner to postgres;
alter function audit.realtime_tables()  owner to postgres;
alter function audit.divat_api_shape()  set schema public;
alter function audit.realtime_tables()  set schema public;

revoke all on function public.divat_api_shape(), public.realtime_tables() from public, authenticated, service_role;
grant execute on function public.divat_api_shape(), public.realtime_tables() to anon;

-- --- o objeto novo: resumo, nunca matriz ----------------------------------------------------
-- SECURITY INVOKER de proposito: has_table_privilege aceita o papel como argumento e os
-- catalogos pg_class/pg_policy/pg_proc sao legiveis por qualquer papel, entao esta funcao NAO
-- concede poder nenhum a anon. Ela e a ponte estreita — o PostgREST nao expoe pg_catalog, entao
-- sem ela anon nao alcanca catalogo. Nao ha escalada de privilegio a revisar.
--
-- O digest NAO inclui timestamp: divat_security_shape() embute now(), e hashear a saida dele
-- daria digest novo a cada chamada — um gate que grita todo dia e um gate que se ignora.
create or replace function public.divat_security_digest()
returns jsonb
language sql
stable
security invoker
set search_path to 'pg_catalog', 'public'
as $function$
with tabelas as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
),
priv as (
  select t.relname, t.relrowsecurity,
         has_table_privilege('anon', t.oid, 'SELECT')            as anon_select,
         has_table_privilege('anon', t.oid, 'INSERT')            as anon_insert,
         has_table_privilege('anon', t.oid, 'UPDATE')            as anon_update,
         has_table_privilege('anon', t.oid, 'DELETE')            as anon_delete,
         has_table_privilege('anon', t.oid, 'TRUNCATE')          as anon_truncate,
         has_table_privilege('authenticated', t.oid, 'SELECT')   as auth_select,
         has_table_privilege('authenticated', t.oid, 'INSERT')   as auth_insert,
         has_table_privilege('authenticated', t.oid, 'UPDATE')   as auth_update,
         has_table_privilege('authenticated', t.oid, 'DELETE')   as auth_delete,
         has_table_privilege('authenticated', t.oid, 'TRUNCATE') as auth_truncate
  from tabelas t
),
pols as (
  select c.relname, p.polname, p.polcmd::text as polcmd
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
funcs as (
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as assinatura,
         has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
),
canonico as (
  select
    coalesce((select string_agg(
        relname || '|' || relrowsecurity::int
          || '|a' || anon_select::int || anon_insert::int || anon_update::int
                  || anon_delete::int || anon_truncate::int
          || '|u' || auth_select::int || auth_insert::int || auth_update::int
                  || auth_delete::int || auth_truncate::int,
        E'\n' order by relname) from priv), '')
    || E'\n==\n' ||
    coalesce((select string_agg(relname || '|' || polname || '|' || polcmd,
        E'\n' order by relname, polname) from pols), '')
    || E'\n==\n' ||
    coalesce((select string_agg(assinatura || '|' || anon_exec::int || auth_exec::int || prosecdef::int,
        E'\n' order by assinatura) from funcs), '')
    as texto
)
select jsonb_build_object(
  'digest', encode(sha256(convert_to((select texto from canonico), 'UTF8')), 'hex'),
  'tabelas_publicas', (select count(*) from priv),
  'todas_com_rls', (select bool_and(relrowsecurity) from priv),
  'anon_escreve', (select bool_or(anon_insert or anon_update or anon_delete or anon_truncate) from priv),
  'authenticated_tem_privilegio',
      (select bool_or(auth_select or auth_insert or auth_update or auth_delete or auth_truncate) from priv),
  'anon_rpcs', (select count(*) from funcs where anon_exec)
);
$function$;

revoke all on function public.divat_security_digest() from public, authenticated, service_role;
grant execute on function public.divat_security_digest() to anon;

-- --- assercoes: a superficie anonima e EXATAMENTE a esperada -------------------------------
do $$
declare
  anon_rpc_names text[];
  d jsonb;
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[]) into anon_rpc_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

  if anon_rpc_names <> array['divat_api_shape','divat_busca_logradouro','divat_linhas_regiao',
                             'divat_security_digest','realtime_tables']::text[] then
    raise exception 'Assercao falhou: RPCs anonimas sao %', anon_rpc_names;
  end if;

  if has_function_privilege('anon', 'audit.divat_security_shape()', 'execute')
     or has_function_privilege('anon', 'audit.divat_data_quality()', 'execute') then
    raise exception 'Assercao falhou: uma diagnostica sensivel continua alcancavel por anon';
  end if;

  -- Auto-teste: anon precisa CONSEGUIR chamar o digest, e a resposta precisa ter forma util.
  set local role anon;
  d := public.divat_security_digest();
  reset role;

  if jsonb_typeof(d->'digest') <> 'string' or length(d->>'digest') <> 64 then
    raise exception 'Assercao falhou: digest nao e um sha256 hex de 64 caracteres';
  end if;
  if jsonb_typeof(d->'todas_com_rls') <> 'boolean'
     or jsonb_typeof(d->'anon_escreve') <> 'boolean'
     or jsonb_typeof(d->'authenticated_tem_privilegio') <> 'boolean' then
    raise exception 'Assercao falhou: um dos booleanos nao veio como boolean';
  end if;
  if (d->>'anon_escreve')::boolean or not (d->>'todas_com_rls')::boolean then
    raise exception 'Assercao falhou: postura de seguranca ja esta errada antes do commit — %', d;
  end if;
end $$;

revoke divat_audit_owner from postgres;
```

- [ ] **Step 2: Escreva o rollback**

Crie `scripts/rollback_phase3_diagnosticos.sql`:

```sql
-- Desfaz a migracao 2 da Fase 3 (diagnosticos anonimos), devolvendo o estado que a migracao 1
-- deixou: as quatro diagnosticas em `audit`, SECURITY DEFINER, so para divat_auditor.
--
-- Rode dentro de transacao e confira o resultado ANTES do commit:
--   begin; \i scripts/rollback_phase3_diagnosticos.sql   -- confira; depois commit; ou rollback;

grant divat_audit_owner to postgres;

drop function if exists public.divat_security_digest();

alter function public.divat_api_shape() set schema audit;
alter function public.realtime_tables() set schema audit;
alter function audit.divat_api_shape() security definer;
alter function audit.realtime_tables() security definer;
alter function audit.divat_api_shape() owner to divat_audit_owner;
alter function audit.realtime_tables() owner to divat_audit_owner;

revoke all on function audit.divat_api_shape(), audit.realtime_tables()
  from public, anon, authenticated, service_role;
grant execute on function audit.divat_api_shape(), audit.realtime_tables() to divat_auditor;

do $$
declare anon_rpc_names text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), '{}'::text[]) into anon_rpc_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

  if anon_rpc_names <> array['divat_busca_logradouro','divat_linhas_regiao']::text[] then
    raise exception 'Rollback incompleto: RPCs anonimas sao %', anon_rpc_names;
  end if;
end $$;

revoke divat_audit_owner from postgres;
```

- [ ] **Step 3: Rode o gate de migrações contra o arquivo novo**

```bash
node scripts/check_migrations.mjs
```

Esperado **neste momento**: **FALHA**, com `public.divat_api_shape não está na allowlist anônima de
execução` (e o mesmo para `realtime_tables` e `divat_security_digest`). Isso é o comportamento
correto do gate atual — a Tarefa 4 é que abre a faixa. Anote a mensagem exata; ela é o teste que a
Tarefa 4 tem de virar verde.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260805000000_phase3_diagnosticos_anonimos.sql \
        scripts/rollback_phase3_diagnosticos.sql
git commit -m "feat: migracao 2 da Fase 3 — diagnosticos anonimos e RPC de digest"
```

O `check_migrations.mjs` fica vermelho entre esta tarefa e a próxima. É esperado e é o teste que
falha antes da implementação — **não** ajuste a allowlist aqui.

---

## Task 4: Allowlist em duas faixas

**Files:**
- Modify: `scripts/check_migrations.mjs:8-13` (a constante `ALLOWED_ANON_EXECUTE`) e a validação
  que a usa (`:63`)
- Create: `tests/check_migrations.rig.mjs`
- Modify: `.github/workflows/ci.yml` (o mesmo passo da Tarefa 2)

**Interfaces:**
- Consumes: a migração da Tarefa 3 (é o insumo verde do rig).
- Produces: nada consumido por tarefas seguintes.

- [ ] **Step 1: Escreva a bancada que falha**

Crie `tests/check_migrations.rig.mjs`:

```js
// Bancada offline do check_migrations.mjs — prova que o gate de migracoes RECUSA o que deve.
//
// Por que existe: o repositorio ja aprendeu que "um gate de seguranca que nunca foi visto
// falhando e fe, nao garantia" (tests/check_grants.rig.mjs). Este gate decide quem pode ser RPC
// anonima; ate 04/08/2026 ele nao tinha bancada nenhuma.
//
// Tecnica: escreve migracoes sinteticas num diretorio temporario e roda o gate contra ele.
// Rode:  node tests/check_migrations.rig.mjs

import { mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = '/tmp/divat-rig-migrations';
const REAL = join(dirname(fileURLToPath(import.meta.url)), '..');

await rm(RAIZ, { recursive: true, force: true });
await mkdir(`${RAIZ}/scripts`, { recursive: true });
await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
await copyFile(`${REAL}/scripts/check_migrations.mjs`, `${RAIZ}/scripts/check_migrations.mjs`);

function rodar() {
  return new Promise(res => {
    const p = spawn('node', [`${RAIZ}/scripts/check_migrations.mjs`], { cwd: RAIZ });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}

const casos = [];
const caso = (nome, sql, esperado) => casos.push({ nome, sql, esperado });

// --- faixa PRODUTO: as duas de sempre continuam passando ------------------------------------
caso('RPC de produto na allowlist', `
  create or replace function public.divat_linhas_regiao(a text, b text) returns void language sql as $$ select $$;
  revoke all on function public.divat_linhas_regiao(text, text) from public;
  grant execute on function public.divat_linhas_regiao(text, text) to anon;
`, 0);

// --- faixa DIAGNOSTICO: as tres novas passam -------------------------------------------------
caso('RPC de diagnostico na allowlist', `
  create or replace function public.divat_security_digest() returns jsonb language sql as $$ select '{}'::jsonb $$;
  revoke all on function public.divat_security_digest() from public;
  grant execute on function public.divat_security_digest() to anon;
`, 0);

// --- fora das duas faixas: recusa -----------------------------------------------------------
caso('RPC anonima fora da allowlist', `
  create or replace function public.divat_qualquer_coisa() returns void language sql as $$ select $$;
  revoke all on function public.divat_qualquer_coisa() from public;
  grant execute on function public.divat_qualquer_coisa() to anon;
`, 1);

caso('a mesma RPC concedida tambem a authenticated', `
  create or replace function public.divat_security_digest() returns jsonb language sql as $$ select '{}'::jsonb $$;
  revoke all on function public.divat_security_digest() from public;
  grant execute on function public.divat_security_digest() to anon, authenticated;
`, 1);

caso('tabela publica nova sem RLS', `
  create table public.tabela_nova (id int primary key);
`, 1);

caso('senha versionada em migracao', `
  create role alguem login password 'segredo123';
`, 1);

let falhas = 0;
for (const c of casos) {
  await rm(`${RAIZ}/supabase/migrations`, { recursive: true, force: true });
  await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
  await writeFile(`${RAIZ}/supabase/migrations/20260101000000_caso.sql`, c.sql);
  const { code, out } = await rodar();
  const ok = code === c.esperado;
  if (!ok) falhas++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${c.nome} → saiu ${code}, esperado ${c.esperado}`);
  if (!ok) console.log(out.split('\n').map(l => '      ' + l).join('\n'));
}

// A migracao REAL do repositorio tem que passar pelo gate.
await rm(`${RAIZ}/supabase/migrations`, { recursive: true, force: true });
await mkdir(`${RAIZ}/supabase/migrations`, { recursive: true });
for (const f of ['20260729034018_phase3_moderate_hardening.sql',
                 '20260805000000_phase3_diagnosticos_anonimos.sql']) {
  await copyFile(`${REAL}/supabase/migrations/${f}`, `${RAIZ}/supabase/migrations/${f}`);
}
const real = await rodar();
const okReal = real.code === 0;
if (!okReal) { falhas++; console.log(real.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okReal ? '  ✓' : '  ✗'} migracoes reais do repositorio → saiu ${real.code}, esperado 0`);

await rm(RAIZ, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} caso(s) falharam` : '\n✓ bancada: todos os casos passaram');
process.exit(falhas ? 1 : 0);
```

- [ ] **Step 2: Rode para ver falhar**

```bash
node tests/check_migrations.rig.mjs
```

Esperado: falham "RPC de diagnostico na allowlist" (saiu 1, esperado 0) e "migracoes reais do
repositorio" (saiu 1, esperado 0).

- [ ] **Step 3: Abra a faixa de diagnóstico no `check_migrations.mjs`**

Substitua a constante `ALLOWED_ANON_EXECUTE` (linhas 8-13) por duas faixas nomeadas:

```js
// A superficie anonima e definida por CRITERIO, nao por numero (spec de 04/08/2026, secao 8).
// Duas faixas, com criterios de admissao diferentes:
//
//   PRODUTO     — chamada pelo portal em runtime. Entrada aqui e decisao de produto.
//   DIAGNOSTICO — chamada so por gate. Para entrar precisa satisfazer TRES coisas:
//                 (a) le apenas catalogo (pg_class/pg_policy/pg_proc/information_schema),
//                     nunca dado de tabela — senao vira alavanca de indisponibilidade, que foi
//                     exatamente o caso de divat_data_quality (59 varreduras completas sobre
//                     ~116 mil linhas por chamada, medido em 04/08/2026);
//                 (b) nao revela nada alem do que o repositorio ja publica por ADR-0003;
//                 (c) e SECURITY INVOKER — DEFINER anonima nao entra nesta faixa nunca.
//
// Acrescentar nome aqui sem satisfazer o criterio e erosao, nao manutencao.
const ANON_EXECUTE_PRODUTO = new Set([
  'public.divat_busca_logradouro',
  'public.divat_linhas_regiao',
]);
const ANON_EXECUTE_DIAGNOSTICO = new Set([
  'public.divat_api_shape',
  'public.realtime_tables',
  'public.divat_security_digest',
]);
const ALLOWED_ANON_EXECUTE = new Set([
  ...ANON_EXECUTE_PRODUTO,
  ...ANON_EXECUTE_DIAGNOSTICO,
  // Helper necessário à função INVOKER, mas invisível na Data API porque private não é exposto.
  'private.f_unaccent',
]);
```

Depois, na validação que hoje diz apenas `não está na allowlist anônima de execução` (linha 63),
troque a mensagem para dizer **qual faixa** o candidato teria de satisfazer:

```js
      if (!ALLOWED_ANON_EXECUTE.has(target)) {
        fail(file, `${target} não está na allowlist anônima. Para entrar como PRODUTO, precisa ser `
          + `chamada pelo portal em runtime; como DIAGNÓSTICO, precisa ler só catálogo, ser `
          + `SECURITY INVOKER e não revelar além do que o repositório já publica (ADR-0003). `
          + `Ver docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md §8.`);
      }
```

- [ ] **Step 4: Rode a bancada — tem que passar inteira**

```bash
node tests/check_migrations.rig.mjs
node scripts/check_migrations.mjs
```

Esperado: `✓ bancada: todos os casos passaram` e `✓ 2 migração(ões): RLS/revokes e allowlist de RPC
validados.`

- [ ] **Step 5: Ligue a bancada nova no `ci.yml`**

No mesmo passo da Tarefa 2, acrescente a quarta linha e atualize o nome:

```yaml
      - name: Bancadas offline (backup, restauração, grants, migrações)
        env:
          NO_PROXY: 127.0.0.1
        run: |
          export no_proxy="$NO_PROXY"
          node tests/backup_rest.rig.mjs
          node tests/restore_rest.rig.mjs
          node tests/check_grants.rig.mjs
          node tests/check_migrations.rig.mjs
```

- [ ] **Step 6: Gate e commit**

```bash
node tests/check.js
git add scripts/check_migrations.mjs tests/check_migrations.rig.mjs .github/workflows/ci.yml
git commit -m "feat: allowlist anonima em duas faixas, com bancada"
```

---

## Task 5: `check_grants.mjs` em modo duplo

**Files:**
- Modify: `scripts/check_grants.mjs` (cabeçalho, chamada da RPC, `SEP`, baseline)
- Modify: `scripts/security_baseline.json`
- Modify: `tests/check_grants.rig.mjs`

**Interfaces:**
- Consumes: `prazoPorId(root, 'check_grants_fallback')` de `scripts/lib/prazos.mjs` (Tarefa 1);
  `public.divat_security_digest()` da Tarefa 3.
- Produces: nada consumido por tarefas seguintes.

**Cuidado com bytes invisíveis:** as linhas 140 e 178 do `check_grants.mjs` contêm hoje um byte
**NUL literal** como separador de chave composta. Um editor mostra isso como espaço em branco.
`scripts/check_data_quality.mjs:76` já resolveu o mesmo problema com
`const SEP = '\u0000';` e deixou a justificativa escrita. Aplique o mesmo aqui — **não** deixe o
NUL cru sobreviver a uma edição, e **não** o troque por espaço.

- [ ] **Step 1: Acrescente os casos novos à bancada (que vão falhar)**

Em `tests/check_grants.rig.mjs`, troque o servidor stub para responder às **duas** rotas, com o
digest controlável e desligável:

```js
let respostaAtual = null;    // divat_security_shape
let digestAtual = null;      // divat_security_digest — null = função não existe (404)
const srv = createServer((req, res) => {
  if (req.url === '/rest/v1/rpc/divat_security_shape') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(respostaAtual));
  } else if (req.url === '/rest/v1/rpc/divat_security_digest') {
    if (digestAtual === null) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(digestAtual));
  } else { res.writeHead(404); res.end('{}'); }
});
```

O `prazos.json` também precisa existir no fakeroot — o script vai lê-lo para saber a validade do
fallback. Acrescente, junto dos outros `writeFile` de preparação:

```js
await mkdir(`${RAIZ}/scripts/lib`, { recursive: true });
await copyFile(`${REAL}/scripts/lib/prazos.mjs`, `${RAIZ}/scripts/lib/prazos.mjs`);
await writeFile(`${RAIZ}/scripts/prazos.json`, JSON.stringify({
  nota: 'teste',
  prazos: [{ id: 'check_grants_fallback', descricao: 'fallback', vence_em: '2026-11-30',
             aviso_dias: 30, erro_dias: 0, referencia: 'spec' }],
}, null, 2));
```

E `rodar()` passa a aceitar a data simulada:

```js
function rodar(extraArgs = [], hoje = '2026-08-04') {
  return new Promise(res => {
    const p = spawn('node', [`${RAIZ}/scripts/check_grants.mjs`, ...extraArgs],
      { cwd: RAIZ, env: { ...process.env, DIVAT_HOJE: hoje } });
    let out = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => res({ code, out }));
  });
}
```

Agora acrescente, **depois** do bloco de casos existente e antes do `srv.close()`:

```js
// ---------------------------------------------------------------------------------------------
// Caminho DIGEST (pos-Fase 3). Os casos acima cobrem o FALLBACK, porque digestAtual e null.
// ---------------------------------------------------------------------------------------------
const digestSao = () => ({
  digest: 'a'.repeat(64),
  tabelas_publicas: 18,
  todas_com_rls: true,
  anon_escreve: false,
  authenticated_tem_privilegio: false,
  anon_rpcs: 5,
});

const baselineDigest = { ...baseline, digest: 'a'.repeat(64), anon_rpcs: 5 };

async function casoDigest(nome, mutarDigest, esperado, args = [], hoje = '2026-08-04') {
  await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
  digestAtual = mutarDigest(digestSao());
  const { code, out } = await rodar(args, hoje);
  const ok = code === esperado;
  if (!ok) { falhas++; console.log(out.split('\n').map(l => '      ' + l).join('\n')); }
  console.log(`${ok ? '  ✓' : '  ✗'} [digest] ${nome} → saiu ${code}, esperado ${esperado}`);
}

await casoDigest('estado são', d => d, 0);
await casoDigest('anon ganhou escrita', d => { d.anon_escreve = true; return d; }, 1);
await casoDigest('RLS caiu em alguma tabela', d => { d.todas_com_rls = false; return d; }, 1);
await casoDigest('authenticated ganhou privilegio', d => { d.authenticated_tem_privilegio = true; return d; }, 1);
await casoDigest('digest mudou, booleanos sãos', d => { d.digest = 'b'.repeat(64); return d; }, 1);
await casoDigest('RPC anonima a mais', d => { d.anon_rpcs = 6; return d; }, 1);
await casoDigest('booleano veio como string (forma inesperada)', d => { d.anon_escreve = 'false'; return d; }, 1);
await casoDigest('campo faltando', d => { delete d.todas_com_rls; return d; }, 1);
await casoDigest('poucas tabelas (visão perdida)', d => { d.tabelas_publicas = 0; return d; }, 1);

// --atualizar-baseline NAO pode silenciar a classe perigosa: os booleanos sao expectativa fixa
// no codigo, nao dado de baseline.
digestAtual = { ...digestSao(), anon_escreve: true };
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const tentouSilenciar = await rodar(['--atualizar-baseline']);
const okSilenciar = tentouSilenciar.code === 1;
if (!okSilenciar) falhas++;
console.log(`${okSilenciar ? '  ✓' : '  ✗'} [digest] --atualizar-baseline recusa baselinar anon_escreve → saiu ${tentouSilenciar.code}, esperado 1`);

// --atualizar-baseline preserva os achados documentados (as 3 excecoes do supabase_admin).
digestAtual = { ...digestSao(), digest: 'c'.repeat(64) };
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
await rodar(['--atualizar-baseline']);
const depois = JSON.parse(await readFile(`${RAIZ}/scripts/security_baseline.json`, 'utf8'));
const okPreserva = depois.digest === 'c'.repeat(64) && depois.achados.length === baseline.achados.length;
if (!okPreserva) falhas++;
console.log(`${okPreserva ? '  ✓' : '  ✗'} [digest] --atualizar-baseline atualiza o digest e PRESERVA os achados`);

// O fallback tem validade: passada a data, usa-lo e vermelho.
digestAtual = null;
await writeFile(`${RAIZ}/scripts/security_baseline.json`, JSON.stringify(baselineDigest, null, 2));
const expirado = await rodar([], '2026-12-01');
const okExpirado = expirado.code === 1 && /fallback/i.test(expirado.out);
if (!okExpirado) { falhas++; console.log(expirado.out.split('\n').map(l => '      ' + l).join('\n')); }
console.log(`${okExpirado ? '  ✓' : '  ✗'} [fallback] expirado derruba o gate → saiu ${expirado.code}, esperado 1`);
```

Acrescente `readFile` ao import de `node:fs/promises` no topo do arquivo.

- [ ] **Step 2: Rode a bancada para ver falhar**

```bash
NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 node tests/check_grants.rig.mjs
```

Esperado: os 13 casos antigos continuam passando (eles agora exercitam o fallback, porque
`digestAtual` começa `null`) e **todos os casos `[digest]` falham**, porque o script ainda nem
tenta a rota nova.

- [ ] **Step 3: Implemente o modo duplo**

No `scripts/check_grants.mjs`:

**(a)** acrescente ao cabeçalho, depois do parágrafo do baseline:

```js
// MODO DUPLO (desde 04/08/2026): a Fase 3 move divat_security_shape para o schema `audit`, fora
// do alcance de anon. Enquanto produção não recebe essa migração, este gate precisa funcionar nos
// DOIS mundos — senão nasceria vermelho na main e viraria alarme que se ignora.
//   1. tenta rpc/divat_security_digest (o mundo pos-Fase 3): resumo, nao matriz;
//   2. se a funcao nao existe (404/PGRST202), usa rpc/divat_security_shape e AVISA;
//   3. qualquer outro erro ABORTA — perder a visao do banco nunca vira "nenhum achado";
//   4. o fallback tem validade em scripts/prazos.json (id `check_grants_fallback`). Passada a
//      data, usa-lo e vermelho: caminho temporario sem prazo vira permanente por inercia.
```

**(b)** troque o import e acrescente a leitura do prazo:

```js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prazoPorId, classificar, hojeISO } from './lib/prazos.mjs';
```

**(c)** substitua o bloco que chama a RPC (linhas 55-86 do arquivo atual) por:

```js
async function chamarRpc(nome) {
  return fetch(`${SB_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

let digest = null, forma = null;
try {
  const resp = await chamarRpc('divat_security_digest');
  if (resp.ok) {
    digest = await resp.json();
  } else if (resp.status === 404) {
    // A funcao ainda nao existe neste banco: mundo pre-Fase 3. Cai no caminho antigo.
    const prazo = await prazoPorId(ROOT, 'check_grants_fallback');
    const v = classificar(prazo, hojeISO());
    if (v.nivel === 'erro') {
      console.error(`✗ O fallback para divat_security_shape EXPIROU: ${v.mensagem}`);
      console.error('  Se a Fase 3 já está em produção, remova o fallback (é o trabalho que venceu).');
      console.error('  Se ainda não está, aplique a migração ou mova a data em scripts/prazos.json — conscientemente.');
      process.exit(1);
    }
    console.log(`⚠ divat_security_digest não existe neste banco; usando o caminho antigo (${v.mensagem}).`);
    const antigo = await chamarRpc('divat_security_shape');
    if (!antigo.ok) {
      console.error(`RPC divat_security_shape falhou (HTTP ${antigo.status}): ${await antigo.text()}`);
      console.error('Nem o digest nem a forma completa responderam — abortando.');
      process.exit(1);
    }
    forma = await antigo.json();
  } else {
    console.error(`RPC divat_security_digest falhou (HTTP ${resp.status}): ${await resp.text()}`);
    console.error('Só 404 significa "função ainda não existe". Qualquer outro erro aborta.');
    process.exit(1);
  }
} catch (e) {
  console.error('Erro ao consultar o Supabase (este script precisa de rede):', e.message);
  process.exit(1);
}
```

**(d)** logo abaixo, acrescente o caminho digest **inteiro**, antes do bloco de regras existente.
Ele termina com `process.exit`, então o código antigo só roda no fallback:

```js
if (digest) {
  // FAIL-CLOSED sobre a FORMA: um campo com tipo errado e visao perdida, nao "tudo certo".
  const bools = ['todas_com_rls', 'anon_escreve', 'authenticated_tem_privilegio'];
  for (const campo of bools) {
    if (typeof digest[campo] !== 'boolean') {
      console.error(`✗ Digest sem o booleano '${campo}' — abortando em vez de assumir seguro.`);
      process.exit(1);
    }
  }
  if (typeof digest.digest !== 'string' || digest.digest.length !== 64) {
    console.error('✗ Digest não é um sha256 hex de 64 caracteres — abortando.');
    process.exit(1);
  }
  if (!Number.isInteger(digest.tabelas_publicas) || digest.tabelas_publicas < 18) {
    console.error(`✗ Digest reporta ${digest.tabelas_publicas} tabelas públicas (esperado ≥ 18) — visão perdida, abortando.`);
    process.exit(1);
  }
  if (!Number.isInteger(digest.anon_rpcs)) {
    console.error('✗ Digest sem anon_rpcs numérico — abortando.');
    process.exit(1);
  }

  // EXPECTATIVAS FIXAS. Ficam no CODIGO, nunca no baseline: um gate cujo conserto habitual e
  // `--atualizar-baseline` ensina o reflexo de apagar o alarme. O reflexo continua possivel para
  // mudanca estrutural benigna (o digest) e NUNCA alcanca a classe perigosa (estes tres).
  const graves = [];
  if (digest.anon_escreve) graves.push('anon tem INSERT/UPDATE/DELETE/TRUNCATE em alguma tabela de public');
  if (!digest.todas_com_rls) graves.push('alguma tabela de public está sem RLS');
  if (digest.authenticated_tem_privilegio) graves.push('authenticated voltou a ter privilégio de tabela em public');

  const b = JSON.parse(await readFile(BASELINE, 'utf8').catch(() => '{}'));

  if (atualizar) {
    if (graves.length) {
      console.error('✗ Há achado GRAVE — não existe caminho para baseliná-lo:');
      for (const g of graves) console.error(`    ${g}`);
      console.error('\n  A resposta certa é REVOGAR o privilégio, não registrar a exceção.');
      process.exit(1);
    }
    // Atualiza SO o digest e a contagem. `achados` (as excecoes do supabase_admin, documentadas
    // em docs/seguranca.md §9.1) e mantido a mao — mesma disciplina do orfaos_conhecidos do
    // data_quality_baseline.json.
    const registro = { ...b, digest: digest.digest, anon_rpcs: digest.anon_rpcs,
                       gerado_em: new Date().toISOString().slice(0, 10) };
    await writeFile(BASELINE, JSON.stringify(registro, null, 2) + '\n', 'utf8');
    console.log(`✓ Baseline: digest ${digest.digest.slice(0, 12)}… e anon_rpcs=${digest.anon_rpcs} registrados.`);
    console.log('  · `achados` foi PRESERVADO. Confira o diff antes de commitar.');
    process.exit(0);
  }

  if (graves.length) {
    console.error('\n✗ POSTURA DE SEGURANÇA REGREDIU — achado GRAVE:');
    for (const g of graves) console.error(`    ${g}`);
    console.error('\nREVOGUE o privilégio. Não existe --atualizar-baseline para isto.');
    process.exit(1);
  }

  if (!semBaseline && !b.digest) {
    console.error('✗ Baseline sem `digest`. Confira o estado do banco e rode --atualizar-baseline.');
    process.exit(1);
  }
  if (!semBaseline && digest.anon_rpcs > (b.anon_rpcs ?? 0)) {
    console.error(`\n✗ Apareceu RPC anônima nova: ${b.anon_rpcs} → ${digest.anon_rpcs}.`);
    console.error('  Objeto novo em public nasce com EXECUTE para anon pelo default do supabase_admin.');
    console.error('  Confira se é deliberada e satisfaz uma das faixas de scripts/check_migrations.mjs.');
    process.exit(1);
  }
  if (!semBaseline && digest.digest !== b.digest) {
    console.error('\n✗ A superfície de segurança MUDOU (digest diferente do baseline).');
    console.error('  Os três indicadores graves estão sãos, então isto é mudança estrutural —');
    console.error('  tabela nova, policy renomeada, função nova. Confira o que mudou pelo painel');
    console.error('  ou pelo auditor (node scripts/check_phase3_audit.mjs) e, se for esperado,');
    console.error('  registre com --atualizar-baseline.');
    process.exit(1);
  }

  console.log(`✓ Postura de segurança: digest bate com o baseline. `
    + `(${digest.tabelas_publicas} tabelas públicas, ${digest.anon_rpcs} RPCs anônimas, RLS em todas.)`);
  process.exit(0);
}
```

**(e)** troque a chave composta (linha ~140) para não deixar byte cru:

```js
// Separador NUL: `alvo` pode conter ':' mas nunca NUL. Escrito como escape para nao deixar byte
// invisivel no fonte — com NUL cru o grep trata o arquivo como binario e um editor distraido come
// o byte. Mesma decisao, e mesma justificativa, de scripts/check_data_quality.mjs.
const SEP = '\u0000';
const chave = a => `${a.tipo}${SEP}${a.alvo}`;
```

E, mais abaixo (linha ~178), `k.split(' ').join(' → ')` vira `k.split(SEP).join(' → ')`.

- [ ] **Step 4: Rode a bancada — tudo tem que passar**

```bash
NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 node tests/check_grants.rig.mjs
```

Esperado: `✓ bancada: todos os casos passaram` — os 13 antigos (fallback) e os 13 novos (digest,
baseline e expiração).

- [ ] **Step 5: Confirme que nenhum NUL cru sobrou**

```bash
python3 -c "d=open('scripts/check_grants.mjs','rb').read(); print('NUL:', d.count(b'\x00'))"
file scripts/check_grants.mjs
```

Esperado: `NUL: 0` e `JavaScript source, Unicode text, UTF-8 text` (não mais `data`).

- [ ] **Step 6: Acrescente os campos ao baseline**

Em `scripts/security_baseline.json`, acrescente `digest` e `anon_rpcs` como `null`, logo depois de
`nota`. Ficam nulos até o passo 5 da spec (depois da migração em produção):

```json
  "digest": null,
  "anon_rpcs": null,
```

- [ ] **Step 7: Gate e commit**

```bash
node tests/check.js
git add scripts/check_grants.mjs scripts/security_baseline.json tests/check_grants.rig.mjs
git commit -m "feat: check_grants em modo duplo (digest + fallback datado)"
```

---

## Task 6: Credencial auditora reutilizável e com dois refs

**Files:**
- Create: `scripts/lib/auditor.mjs`
- Modify: `scripts/check_phase3_audit.mjs:1-35` (guarda de ref e execução do `psql`)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `REFS: { producao: 'lwzsxuaqqeoamukduhev', teste: 'gontnlfmothfglssbyyk' }`
  - `conectarAuditor({ ambiente }): { consultar(sql: string): string }` — valida a URL e devolve um
    executor. Lança `Error` com mensagem pronta se a variável faltar, a URL não for do ref
    esperado, o login não começar com `divat_auditor_ci` ou não houver senha.
  - A Tarefa 7 usa `conectarAuditor` e `REFS`.

- [ ] **Step 1: Extraia a guarda para `scripts/lib/auditor.mjs`**

```js
// auditor.mjs — conexao PostgreSQL pelo login minimo da Fase 3.
//
// Existe porque DOIS gates precisam dela (check_phase3_audit.mjs e check_data_quality.mjs) e a
// guarda de project ref e a parte que nao pode divergir entre eles: e ela que impede um secret
// mal colado apontar um gate de teste para produção, ou vice-versa.
//
// A URL nunca e passada na linha de comando nem impressa — vai por variavel de ambiente do
// processo filho, para nao aparecer em `ps` nem em log de CI.

import { spawnSync } from 'node:child_process';

export const REFS = {
  producao: 'lwzsxuaqqeoamukduhev',
  teste: 'gontnlfmothfglssbyyk',
};

const VARIAVEL = {
  producao: 'SUPABASE_PROD_AUDIT_DATABASE_URL',
  teste: 'SUPABASE_TEST_AUDIT_DATABASE_URL',
};

const LOGIN_PREFIX = 'divat_auditor_ci';

export function conectarAuditor({ ambiente }) {
  const ref = REFS[ambiente];
  const variavel = VARIAVEL[ambiente];
  if (!ref) throw new Error(`Ambiente desconhecido: '${ambiente}'. Use 'producao' ou 'teste'.`);

  const bruto = process.env[variavel];
  if (!bruto) {
    throw new Error(`${variavel} não configurado. Consulte docs/planos/fase-3-hardening-moderado.md.`);
  }

  let url;
  try { url = new URL(bruto); }
  catch { throw new Error(`${variavel} não é uma URL PostgreSQL válida.`); }

  // Aceita a conexao direta OU o pooler. Runner do GitHub e IPv4, e a conexao direta do Supabase
  // e IPv6 — na pratica o caminho que funciona no CI e o pooler.
  const direto = url.hostname === `db.${ref}.supabase.co`;
  const pooler = url.hostname.endsWith('.pooler.supabase.com') && url.username.endsWith(`.${ref}`);
  if ((!direto && !pooler) || !url.username.startsWith(LOGIN_PREFIX)) {
    throw new Error(`Conexão recusada: host/project ref ou login não pertence ao auditor de ${ambiente}.`);
  }
  if (!url.password) {
    throw new Error('Conexão recusada: a credencial auditora não contém senha.');
  }

  return {
    ambiente, ref,
    consultar(sql) {
      const child = spawnSync('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          PGHOST: url.hostname,
          PGPORT: url.port || '5432',
          PGDATABASE: url.pathname.slice(1) || 'postgres',
          PGUSER: decodeURIComponent(url.username),
          PGPASSWORD: decodeURIComponent(url.password),
          PGSSLMODE: url.searchParams.get('sslmode') || 'require',
        },
      });
      if (child.error) throw new Error(`Não foi possível executar psql: ${child.error.message}`);
      if (child.status !== 0) throw new Error(child.stderr.trim() || `psql terminou com status ${child.status}`);
      return child.stdout;
    },
  };
}
```

- [ ] **Step 2: Faça o `check_phase3_audit.mjs` usar a biblioteca**

Substitua as linhas 1-35 do arquivo (`PROJECT_REF`, `LOGIN_PREFIX`, leitura e validação da URL) por:

```js
// Executa as RPCs diagnosticas pelo login PostgreSQL minimo da Fase 3.
//
// Ambiente por argumento: `node scripts/check_phase3_audit.mjs teste` (padrao) ou `... producao`.
// Ate 04/08/2026 este script travava o ref de TESTE e recusava producao de proposito. Isso
// deixou de servir quando a Fase 3 passou a ser aplicavel em producao — e check_data_quality
// depende deste mesmo caminho la. A recusa de ref DESCONHECIDO continua, que e o que protege.
import { conectarAuditor } from './lib/auditor.mjs';

const ambiente = process.argv[2] || 'teste';
let auditor;
try {
  auditor = conectarAuditor({ ambiente });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
```

Depois, troque o bloco do `spawnSync` (que hoje monta o `psql` à mão) por:

```js
let saida;
try {
  saida = auditor.consultar(query);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

let shape;
try {
  const line = saida.trim().split(/\r?\n/).filter(Boolean).at(-1);
  shape = JSON.parse(line);
} catch {
  console.error('Saída do auditor não é JSON válido; abortando em vez de assumir sucesso.');
  process.exit(1);
}
```

A verificação `String(shape.session_user || '').startsWith(LOGIN_PREFIX)` no fim do arquivo precisa
do prefixo: troque por `startsWith('divat_auditor_ci')`.

- [ ] **Step 3: Prove as recusas, sem banco**

```bash
node scripts/check_phase3_audit.mjs teste; echo "sem secret → $?"
SUPABASE_TEST_AUDIT_DATABASE_URL='postgres://divat_auditor_ci:x@db.lwzsxuaqqeoamukduhev.supabase.co/postgres' \
  node scripts/check_phase3_audit.mjs teste; echo "ref trocado → $?"
SUPABASE_TEST_AUDIT_DATABASE_URL='postgres://postgres:x@db.gontnlfmothfglssbyyk.supabase.co/postgres' \
  node scripts/check_phase3_audit.mjs teste; echo "login errado → $?"
node scripts/check_phase3_audit.mjs marte; echo "ambiente inexistente → $?"
```

Esperado: os quatro saem **1**, com a mensagem específica de cada caso. Nenhum tenta conectar.

- [ ] **Step 4: Gate e commit**

```bash
node tests/check.js
git add scripts/lib/auditor.mjs scripts/check_phase3_audit.mjs
git commit -m "refactor: extrai a conexao auditora e passa a aceitar dois refs"
```

---

## Task 7: `check_data_quality.mjs` pelo auditor, com fallback datado

**Files:**
- Modify: `scripts/check_data_quality.mjs` (cabeçalho e o bloco que chama a RPC, linhas ~50-67)
- Modify: `.github/workflows/db-checks.yml` (job `qualidade`)

**Interfaces:**
- Consumes: `conectarAuditor` de `scripts/lib/auditor.mjs` (Tarefa 6);
  `prazoPorId(root, 'check_data_quality_fallback')` de `scripts/lib/prazos.mjs` (Tarefa 1).
- Produces: nada.

**Invariante a preservar:** o resto do script (baseline, `REBAIXADOS_A_AVISO`, `chave`, unidades)
**não muda**. Só a origem dos `achados` muda. A lista de achados tem a mesma forma nos dois
caminhos: `[{ verificacao, severidade, qtd, detalhe }]`.

- [ ] **Step 1: Troque o bloco de obtenção dos achados**

Substitua o `try/catch` que faz `fetch(...rpc/divat_data_quality)` por:

```js
// MODO DUPLO (desde 04/08/2026), pela mesma razao do check_grants.mjs: a Fase 3 move
// divat_data_quality para o schema `audit`, fora do alcance de anon — e ainda bem, porque como
// RPC anonima ela e uma alavanca de indisponibilidade (59 varreduras completas sobre ~116 mil
// linhas por chamada, medido em 04/08/2026). Enquanto producao nao recebe a migracao, o caminho
// antigo continua valendo, com validade em scripts/prazos.json.
const SQL_ACHADOS = `select coalesce(jsonb_agg(t), '[]'::jsonb) from audit.divat_data_quality() t;`;

let achados = null;
try {
  const auditor = conectarAuditor({ ambiente: 'producao' });
  achados = JSON.parse(auditor.consultar(SQL_ACHADOS).trim().split(/\r?\n/).filter(Boolean).at(-1));
} catch (e) {
  const prazo = await prazoPorId(ROOT, 'check_data_quality_fallback');
  const v = classificar(prazo, hojeISO());
  if (v.nivel === 'erro') {
    console.error(`✗ Caminho do auditor indisponível (${e.message}) e o fallback anônimo EXPIROU: ${v.mensagem}`);
    process.exit(1);
  }
  console.log(`⚠ Auditor indisponível (${e.message}); usando a RPC anônima (${v.mensagem}).`);
  const resp = await fetch(`${SB_URL}/rest/v1/rpc/divat_data_quality`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!resp.ok) {
    console.error(`RPC divat_data_quality falhou (HTTP ${resp.status}): ${await resp.text()}`);
    console.error('Nem o auditor nem a RPC anônima responderam — abortando.');
    process.exit(1);
  }
  achados = await resp.json();
}

if (!Array.isArray(achados)) {
  console.error('A verificação não devolveu uma lista de achados — abortando em vez de assumir vazio.');
  process.exit(1);
}
```

Acrescente aos imports do topo:

```js
import { conectarAuditor } from './lib/auditor.mjs';
import { prazoPorId, classificar, hojeISO } from './lib/prazos.mjs';
```

- [ ] **Step 2: Passe o secret no `db-checks.yml`**

No job `qualidade`, acrescente o `env:` e o `psql`:

```yaml
      - name: Instalar cliente PostgreSQL
        run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Qualidade dos dados pos-ETL (orfaos referenciais, U+FFFD)
        env:
          SUPABASE_PROD_AUDIT_DATABASE_URL: ${{ secrets.SUPABASE_PROD_AUDIT_DATABASE_URL }}
        run: node scripts/check_data_quality.mjs
```

Enquanto o secret não existir, a variável chega vazia, `conectarAuditor` lança, e o script cai no
fallback anônimo — que é exatamente o comportamento desejado antes do passo 2 da spec.

- [ ] **Step 3: Prove o fallback e a expiração sem banco**

```bash
node -e "process.env.SUPABASE_PROD_AUDIT_DATABASE_URL='';" # (só para lembrar que vazio = fallback)
DIVAT_HOJE=2026-12-01 node scripts/check_data_quality.mjs; echo "fallback expirado → $?"
```

Esperado: saída **1**, com `o fallback anônimo EXPIROU`. (Sem rede, o caminho anônimo também
falharia — o ponto do caso é que a expiração é verificada **antes** de tentar a rede.)

- [ ] **Step 4: Gate e commit**

```bash
node tests/check.js
git add scripts/check_data_quality.mjs .github/workflows/db-checks.yml
git commit -m "feat: check_data_quality pelo auditor, com fallback anonimo datado"
```

---

## Task 8: Documentação e fechamento

**Files:**
- Modify: `CLAUDE.md` (seções "Supabase → RLS/segurança" e "Como fazer mudanças" itens 2c/2e)
- Modify: `docs/seguranca.md` (§ 9.1, onde o `check_grants.mjs` diário é nomeado)
- Modify: `docs/planos/fase-3-hardening-moderado.md` (seção "Pré-requisito da promoção a produção")
- Modify: `tests/README.md` (as bancadas novas)

**Interfaces:**
- Consumes: tudo das tarefas 1-7.
- Produces: nada.

**Atenção ao gate `[2b]`:** `CLAUDE.md`, `docs/seguranca.md` e `tests/README.md` são **docs vivos** —
o `tests/check.js` §[2b] confere os números que a prosa afirma. Se você escrever um número novo,
ele será cobrado. `docs/planos/*.md` não está na lista de docs vivos.

- [ ] **Step 1: `docs/planos/fase-3-hardening-moderado.md`**

Na seção "Pré-requisito da promoção a produção — os quatro gates vivos param", acrescente ao final,
**sem apagar o diagnóstico** (ele continua correto e é o registro de como se chegou aqui):

```markdown
> **Atualização de 04/08/2026 — o remédio mudou.** O diagnóstico acima continua válido, mas a
> direção "migrar os quatro gates para a credencial" foi substituída. Três fatos medidos
> mudaram a conta: `divat_data_quality()` é cara o bastante para ser alavanca de
> indisponibilidade como RPC anônima; `check_phase3_audit.mjs` confere forma, não substância, e
> portanto não é substituto dos quatro; e a credencial vence em 31/10/2026, o que daria ao
> alarme diário uma data de validade. O desenho vigente está em
> `docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md`.
```

Na lista "Critérios antes de qualquer promoção", troque o item 7 por:

```markdown
7. **Antes de tocar produção:** ter aplicado o plano
   `docs/superpowers/plans/2026-08-04-fase3-diagnosticos-anonimos.md` — em especial a migração 2
   e o modo duplo dos gates. Aplicar a migração 1 sozinha em produção cega o gate diário.
```

- [ ] **Step 2: `CLAUDE.md`**

Na seção **Supabase → RLS / segurança**, depois do parágrafo sobre objeto novo nascer fechado:

```markdown
  - **Superfície anônima: duas faixas, não um número.** `scripts/check_migrations.mjs` separa RPC
    de **produto** (`divat_busca_logradouro`, `divat_linhas_regiao` — chamadas pelo portal) de RPC
    de **diagnóstico** (`divat_api_shape`, `realtime_tables`, `divat_security_digest` — chamadas só
    por gate). Diagnóstico novo só entra se ler apenas catálogo, for `SECURITY INVOKER` e não
    revelar além do que o repositório já publica (ADR-0003). `divat_security_shape` e
    `divat_data_quality` **não** satisfazem isso e vivem em `audit`: a primeira é matriz de grants
    (recon), a segunda varre 59 colunas `text` sobre ~116 mil linhas por chamada.
```

Na seção **Como fazer mudanças**, acrescente um item novo depois do 2e:

```markdown
2f. **Compromissos com data — `node scripts/check_prazos.mjs`** (offline, diário no `db-checks.yml`).
   Cobra `scripts/prazos.json`: rotação da credencial auditora, remoção dos caminhos de fallback e
   a revisão trimestral de segurança. Fica **fora** do `tests/check.js` porque o contrato dele é ser
   determinístico, e um gate que muda de veredito com o calendário não é. Nasceu da constatação de
   que, neste repo, o que cabe num `git push` acontece e o que depende de lembrar não acontece.
```

- [ ] **Step 3: `docs/seguranca.md` § 9.1**

Onde o texto nomeia o `check_grants.mjs` diário, acrescente:

```markdown
Desde 04/08/2026 esse gate fala por `public.divat_security_digest()` — resumo, não matriz — para
continuar diário **sem credencial e sem prazo de validade**. Os três indicadores graves
(`anon_escreve`, `todas_com_rls`, `authenticated_tem_privilegio`) são expectativa fixa no código:
não existe `--atualizar-baseline` que os silencie. O digest, sim, é baselinado — é ele que detecta
mudança estrutural benigna.
```

- [ ] **Step 4: `tests/README.md`**

Acrescente as duas bancadas à lista existente, no mesmo formato das outras:

```markdown
- `check_grants.rig.mjs` — bancada do gate diário de segurança. Cobre os dois caminhos (digest e
  fallback), a expiração do fallback e a recusa de baselinar achado grave. Roda no `ci.yml`.
- `check_migrations.rig.mjs` — bancada do gate de migrações: prova que ele recusa RPC anônima fora
  das duas faixas, tabela pública sem RLS e senha versionada. Roda no `ci.yml`.
```

- [ ] **Step 5: Rode o gate e conserte os números que ele cobrar**

```bash
node tests/check.js
```

Se `[2b]` reclamar de um número (contagem de workflows, de views, de tabelas), **atualize o
número, não apague a guarda**. Se a frase mudou de forma e o regex não a encontra mais, ajuste o
regex na tabela `FATOS` do `tests/check.js`.

- [ ] **Step 6: Verificação final completa**

```bash
node tests/check.js
node scripts/check_migrations.mjs
NO_PROXY=127.0.0.1 no_proxy=127.0.0.1 node tests/check_grants.rig.mjs
node tests/check_migrations.rig.mjs
node scripts/check_prazos.mjs
./scripts/semgrep.sh
```

Todos verdes. `scripts/check_views.mjs` e `check_abas.mjs` só valem a pena se você tiver tocado o
`app.js` — este plano não toca, mas rodar `node scripts/check_views.mjs` é barato e prova.

- [ ] **Step 7: Commit e push**

```bash
git add CLAUDE.md docs/seguranca.md docs/planos/fase-3-hardening-moderado.md tests/README.md
git commit -m "docs: alinha a prosa ao desenho dos diagnosticos anonimos"
git push -u origin claude/chame-brainstorming-1ry9a7
```

---

## Depois deste plano — o que só o dono faz

Estas etapas **não são tarefas de código** e não pertencem a nenhum agente. Estão aqui para o plano
não terminar no meio da spec. Ordem obrigatória (spec § 9.4):

1. **Criar `divat_auditor_ci` em produção** e gravar `SUPABASE_PROD_AUDIT_DATABASE_URL` nos Actions
   Secrets. Use `scripts/bootstrap_phase3_auditor.sql`, com senha de gerenciador de segredos.
   Ao definir o novo `VALID UNTIL`, **atualize `vence_em` do `credencial_auditor_ci` em
   `scripts/prazos.json`** — senão o gate de prazo estará cobrando uma data que não existe mais.
2. **Aplicar a migração 2 no teste** e rodar `phase3-security` por dispatch.
3. **Janela única em produção:** aplicar `20260729034018` **e** `20260805000000` em sequência.
   Nada roda entre as duas. Faça o dry-run transacional antes de cada uma:
   ```
   begin;
   \i supabase/migrations/20260805000000_phase3_diagnosticos_anonimos.sql
   -- confira a saída; depois:
   rollback;
   ```
4. **Preencher o baseline:** `node scripts/check_grants.mjs --atualizar-baseline`, conferir o diff
   (só `digest`, `anon_rpcs` e `gerado_em` devem mudar; `achados` fica intacto) e commitar.
5. **Confirmar a prova do desenho:** `node scripts/check_deriva.mjs` e
   `node scripts/check_realtime.mjs` verdes **sem terem sido modificados**. Se um deles falhar, a
   repartição da spec § 2 errou — reverta pela `scripts/rollback_phase3_diagnosticos.sql`.
6. **Remover os fallbacks** (PR de limpeza) antes de 30/11/2026, e apagar as duas entradas
   correspondentes do `prazos.json`.

---

## Auto-revisão

**Cobertura da spec.** Percorridas as seções: § 2 (critério) → Tarefa 4; § 3 (a RPC, o hash sem
timestamp, INVOKER) → Tarefa 3; § 3.1 (dois canais de severidade) e § 3.2 (baseline não silencia)
→ Tarefa 5; § 4 (repartição) → Tarefas 3, 5, 7; § 5 (modo duplo com validade) → Tarefas 1 e 5;
§ 6 (`check_prazos`) → Tarefa 1; § 7 (rig órfão) → Tarefa 2; § 8 (duas faixas) → Tarefa 4;
§ 9.2 (migração 2, incluindo o `grant divat_audit_owner to postgres`) → Tarefa 3; § 9.3 (dois refs)
→ Tarefa 6; § 9.4 passos 2-6 → seção "o que só o dono faz"; § 10 (verificação) → passos finais de
cada tarefa e Tarefa 8 passo 6.

**Duas correções que a revisão obrigou:**

1. **A spec § 9.4 passo 1 não enumera o porte do `check_data_quality.mjs`**, embora § 4 e § 9.3 o
   exijam. Sem ele, o gate semanal de qualidade quebra no passo 4 da spec. Virou a Tarefa 7.
2. **A spec § 11 classifica o NUL cru do `check_grants.mjs` como cosmético e fora de escopo.** Este
   plano o corrige mesmo assim (Tarefa 5, passo 3e), porque a Tarefa 5 edita exatamente aquelas
   linhas e uma normalização acidental para espaço seria silenciosa. `check_data_quality.mjs` já
   usa `const SEP = '\u0000'` com a justificativa escrita — é consistência, não escopo novo.

**Consistência de tipos.** `classificar()` devolve `{ id, dias, nivel, mensagem }` na Tarefa 1 e é
consumida com `.nivel` e `.mensagem` nas Tarefas 5 e 7. `conectarAuditor({ ambiente })` devolve
`{ ambiente, ref, consultar }` na Tarefa 6 e é usada como `auditor.consultar(sql)` nas Tarefas 6 e
7. As seis chaves do `divat_security_digest()` (Tarefa 3) são exatamente as lidas na Tarefa 5 e as
mesmas do stub `digestSao()` do rig.

**Sem placeholders.** Nenhum passo diz "implemente adequadamente" ou "trate os erros". Todo passo
de código tem o código.
