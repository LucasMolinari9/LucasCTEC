# Plano — ambiente de teste isolado (handoff para agente com acesso ao git)

> **Status em 28/07/2026: executado.** O projeto `divat - TESTE`
> (`gontnlfmothfglssbyyk`) está ativo, `divatdetro.vercel.app` é a allowlist de produção e
> hostnames de preview usam teste. O fallback inerte descrito abaixo foi substituído por
> fail-closed: configuração ausente interrompe a aplicação e nunca redireciona preview para
> produção. Este documento permanece como histórico do desenho; a decisão vigente está em
> `docs/adr/0002-ambiente-de-teste-isolado.md`.

Objetivo: um **segundo banco Supabase** para experimentar sem tocar em produção, e o `app.js`
escolhendo entre os dois pelo hostname. Escrito para ser executado por um agente que tem
**acesso ao repositório e nada mais** — sem painel do Supabase, sem painel do Vercel.

## Por que o trabalho está partido em duas tarefas

Branch do git **não** é banco separado. Uma branch `teste` cujo preview aponte para o mesmo
Supabase da `main` dá isolamento de código e **zero** isolamento de dado — o pior dos mundos,
porque parece seguro. O isolamento real exige um segundo projeto Supabase, que só o dono cria,
no painel.

Isso criaria um bloqueio: o agente não pode escrever a config de teste sem conhecer o ref e a
anon key do projeto novo. A saída é a **Tarefa A ser inerte**: ela instala todo o encanamento
com os valores vazios, e enquanto estiverem vazios **tudo continua indo para produção**. Ela é
segura de mergear na `main` hoje, antes de o banco de teste existir. A **Tarefa B** é o
preenchimento de quatro valores, depois.

| Quem | O quê |
|---|---|
| **Agente (git)** | Tarefa A — encanamento inerte. Tarefa B — preencher valores. Tarefa C — ADR. |
| **Dono (painel)** | Criar projeto Supabase, aplicar schema/RLS/grants, popular, conferir domínio no Vercel. |

---

## A restrição que manda no desenho inteiro

Quatro scripts extraem a config do `app.js` **por regex**:

- `scripts/check_deriva.mjs:51`
- `scripts/check_realtime.mjs:31`
- `scripts/check_data_quality.mjs:48`
- `scripts/check_grants.mjs`

Todos com a mesma forma:

```js
/const SB_URL\s*=\s*'([^']+)'/
```

**Consequência:** as linhas 24 e 25 do `app.js` precisam continuar literais — uma por linha, com
`const`, com aspas simples, com a URL/chave de produção crua. Trocar `const` por `let`, quebrar
em várias linhas, ou transformar num ternário **mata os quatro gates de uma vez**, e a mensagem
de erro (`Não achei SB_URL no app.js`) parece defeito do script, não consequência da mudança.

Esse acoplamento é útil, não só um obstáculo: como os gates leem a linha de produção, eles
**continuam auditando produção** sem precisar de nenhuma alteração. Produção é a verdade; os
gates já apontam para lá por construção.

---

## TAREFA A — encanamento inerte (fazer agora)

Branch: `teste-ambiente-encanamento`, a partir de `main`.

### A.1 — `app.js`: inserir bloco após a linha 25

Logo depois de `const SB_KEY = '…';` e antes de `const esperar = …`, inserir:

```js

/* --- Seleção de ambiente (produção × teste) ---
   As duas constantes ACIMA são de produção e devem permanecer literais, uma por linha, com
   `const` e aspas simples: check_deriva.mjs, check_realtime.mjs, check_data_quality.mjs e
   check_grants.mjs extraem as duas por regex (/const SB_URL\s*=\s*'([^']+)'/) para saber qual
   banco auditar. Virar `let`, quebrar em linhas ou virar ternário cega os quatro de uma vez.

   Produção é ALLOWLIST, não o contrário: URL de preview do Vercel carrega hash gerado por
   deploy e é impossível de listar. Todo host fora de HOSTS_PROD cai no banco de teste, então
   uma branch nova nasce apontando para teste — nunca para produção. Mesma doutrina do
   .vercelignore e do default-deny do banco: o objeto novo nasce fechado.

   Enquanto SB_TESTE_URL/SB_TESTE_KEY estiverem vazias, ou HOSTS_PROD vazia, não existe
   ambiente de teste e TUDO cai em produção — este bloco é inerte de propósito até a Tarefa B. */
const HOSTS_PROD   = [];   // TAREFA B: hostnames de produção, ex. 'exemplo.com.br'
const SB_TESTE_URL = '';   // TAREFA B: https://<ref-do-projeto-de-teste>.supabase.co
const SB_TESTE_KEY = '';   // TAREFA B: anon key do projeto de teste (pública por desenho)

const SB_TESTE_ATIVO = !!(SB_TESTE_URL && SB_TESTE_KEY) && HOSTS_PROD.length > 0 &&
                       !HOSTS_PROD.includes(location.hostname);
const SB = SB_TESTE_ATIVO ? { url: SB_TESTE_URL, key: SB_TESTE_KEY }
                          : { url: SB_URL,       key: SB_KEY       };
```

O `HOSTS_PROD.length > 0` não é redundante: sem ele, uma lista vazia faria *nenhum* host ser
produção e tudo cairia em teste — exatamente o contrário do estado inerte que se quer.

### A.2 — `app.js`: trocar os três (e só três) pontos de uso

| Local | De | Para |
|---|---|---|
| `sbFetch`, montagem da URL | `` `${SB_URL}/rest/v1/${table}?${qs}` `` | `` `${SB.url}/rest/v1/${table}?${qs}` `` |
| `sbFetch`, headers | `apikey: SB_KEY, Authorization: \`Bearer ${SB_KEY}\`` | `apikey: SB.key, Authorization: \`Bearer ${SB.key}\`` |
| `initRealtime` | `supabase.createClient(SB_URL, SB_KEY, …)` | `supabase.createClient(SB.url, SB.key, …)` |

Confirmar com `grep -n 'SB_URL\|SB_KEY' app.js` que sobraram **exatamente** as duas declarações
originais, as três novas constantes e as duas referências dentro do ternário `SB`. Qualquer
`SB_URL`/`SB_KEY` remanescente em código executável é um ponto de uso esquecido.

### A.2b — `tests/harness.js`: atualizar a cópia do `sbFetch`

O `sbFetch` tem **cópia verbatim** em `tests/harness.js` (linha ~40), e o `tests/check.js`
cobra que a cópia bata com o `app.js` — sem este passo, o gate da A.3 fica vermelho com erro
de anti-drift. Duas edições no harness:

1. Atualizar o corpo do `sbFetch` copiado para usar `SB.url`/`SB.key`, idêntico ao novo
   `app.js`.
2. O harness define `SB_URL`/`SB_KEY` falsos no topo (`https://example.invalid`); acrescentar
   logo abaixo deles um `const SB = { url: SB_URL, key: SB_KEY };` para a cópia compilar e o
   `sbFetch.test.js` continuar passando. **Não** copiar o ternário real (ele lê
   `location.hostname`, que não existe no Node).

### A.3 — verificação (o que dá para rodar sem rede)

```bash
node tests/check.js          # sintaxe do app.js, cópias de teste, deriva docs×código
./scripts/semgrep.sh         # sem --full (o modo registry exige rede)
node scripts/check_views.mjs # 23 views em Chromium headless — exige Playwright instalado
```

Os três **precisam passar**. Observações:

- O `check_views.mjs` funciona porque `scripts/lib/rig.mjs:250` intercepta `**/rest/v1/**` sem
  olhar o host — o stub casa qualquer projeto Supabase. Isso vale também depois da Tarefa B.
- O `tests/check.js` confere fatos numéricos declarados nos docs contra o código, incluindo a
  contagem de linhas do `app.js`. O bloco acima soma ~20 linhas; a tolerância é de 8% nos "~Nk",
  então não deve disparar. **Se disparar, atualizar o número no `CLAUDE.md` — nunca apagar a
  guarda.**
- **Não** rodar `check_deriva.mjs`, `check_realtime.mjs`, `check_data_quality.mjs` nem
  `check_grants.mjs`: exigem rede até o Supabase. Ficam para o dono e para o CI.

### A.4 — o que a Tarefa A NÃO faz

Não mexe no `vercel.json`. O `connect-src` só pode ganhar o host de teste quando esse host
existir (Tarefa B). Mexer antes seria ampliar a CSP em troca de nada.

---

## TAREFA B — ativar (depois que o dono entregar os valores)

Entradas necessárias, todas do painel:

1. `ref` do projeto de teste → `https://<ref>.supabase.co`
2. `anon key` do projeto de teste
3. hostname(s) de produção do Vercel (domínio custom, se houver, **mais** o `.vercel.app`
   canônico — se faltar um, produção passa a ler o banco de teste)

### B.1 — preencher as três constantes do `app.js`

```js
const HOSTS_PROD   = ['exemplo.com.br', 'lucasctec.vercel.app'];
const SB_TESTE_URL = 'https://<ref>.supabase.co';
const SB_TESTE_KEY = 'eyJhbGci…';
```

A anon key de teste no repo é segura: ela é pública por desenho, igual à de produção. A
segurança vem do RLS aplicado no projeto de teste, não do sigilo da chave.

### B.2 — `vercel.json`: liberar o host de teste na CSP

No `connect-src`, acrescentar os dois esquemas do projeto de teste, preservando os de produção:

```
connect-src 'self'
  https://lwzsxuaqqeoamukduhev.supabase.co wss://lwzsxuaqqeoamukduhev.supabase.co
  https://<ref>.supabase.co wss://<ref>.supabase.co
```

Sem isso o preview abre, pinta a moldura e **todo fetch morre bloqueado pela CSP** — sem
`errorBox`, sem spinner, só erro no console. É o modo de falha mais caro de diagnosticar do
projeto inteiro.

Como o `vercel.json` é único para todos os ambientes, produção passa a *permitir* conexão ao
host de teste. Nenhum código em produção aponta para lá, então não há efeito prático — mas fica
registrado que a ampliação existe.

### B.3 — rodar de novo os três gates offline da A.3

---

## TAREFA C — registrar a decisão

Criar `docs/adr/0002-ambiente-de-teste-isolado.md`, seguindo o formato do
`docs/adr/0001-areas-autenticadas-separadas-da-area-publica.md`. Precisa conter, no mínimo:

- por que branch do git não é banco separado;
- por que produção é allowlist e não o contrário;
- por que as linhas 24-25 do `app.js` são intocáveis (os quatro gates);
- a dívida assumida: duas cópias de schema mantidas à mão, sem nada vigiando a divergência.

---

## O que só o dono pode fazer (painel — o agente não tem acesso)

1. **Confirmar** o limite de projetos Free da organização.
2. **Criar** o projeto de teste, região `sa-east-1`.
3. **Estrutura:** rodar `docs/backup_schema.sql` nele.
4. **Conferir o default-deny:** os `ALTER DEFAULT PRIVILEGES` que revogam de `anon`/
   `authenticated`, e o `REVOKE MAINTAIN ON ALL TABLES` — fechar o default não conserta o que
   já existe.
5. `ALTER ROLE authenticator SET pgrst.db_max_rows = '30000'; NOTIFY pgrst, 'reload config';`
   Sem isso as listas longas truncam diferente de produção e viram caça a bug inexistente.
6. **Realtime:** `alter publication supabase_realtime add table public.<tabela>;` para as 14.
7. **Dados:** `SUPABASE_URL=<prod> SUPABASE_ANON_KEY=<prod> node scripts/backup_rest.mjs` gera o
   dump das 14 tabelas públicas; importar no de teste. Os dados são públicos (linhas de ônibus),
   então copiar produção para teste não cria problema de privacidade.
8. **Vercel:** anotar os hostnames de produção e criar a branch longa `teste`, que ganha URL de
   preview estável.

### Verificação final, que exige olho humano

- Abrir o preview da `teste` e confirmar no DevTools que as requisições vão para o ref **de teste**.
- Abrir produção e confirmar que vão para `lwzsxuaqqeoamukduhev`.

Este segundo passo não é formalidade: é o que separa isolamento de achar que está isolado.

---

## Custos e limites, sem maquiagem

- **Duas cópias de schema mantidas à mão.** Não há ferramenta de migration aqui. Elas vão
  divergir; é questão de quando. O `check_deriva.mjs` vigia docs×produção, e **nada** vigia
  teste×produção. É o ponto fraco real do plano.
- **Projeto Free pausa após ~7 dias de inatividade.** Um banco de teste usado de vez em quando
  vive pausado, e despausar leva minutos.
- **Ordem obrigatória:** mudança de schema vai para produção **antes ou junto** com o merge do
  código que a usa. Se uma RPC nova existir só no banco de teste, o `check_deriva.mjs` fica
  vermelho assim que o código entrar na `main` — corretamente, avisando que há código no ar
  chamando o que não existe.
- **Banco de teste não reproduz os defeitos do dado real** (as codlinhas órfãs, o `186006400`
  suspeito) se for mantido limpo. Copiar produção resolve no dia zero; a cópia envelhece.
