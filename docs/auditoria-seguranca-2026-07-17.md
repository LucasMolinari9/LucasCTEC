# Auditoria de Segurança — Portal DIVAT (17/07/2026)

Auditoria das vulnerabilidades web clássicas no **frontend** (`index.html`) e na
**configuração de borda** (`vercel.json`): SQL injection, XSS, CSRF, validação de input e
headers de segurança. Complementa (não substitui) as auditorias anteriores de banco/RLS
registradas no `CLAUDE.md` (26/06, 15/07, 16/07, 17/07).

## Veredito geral

**O portal está bem protegido. Nenhuma vulnerabilidade explorável foi encontrada.** Como é
um portal **público, somente leitura**, que fala com o Supabase via PostgREST (REST) sem
backend próprio e sem sessão por cookie, várias categorias clássicas **não se aplicam** — e
onde se aplicam, as defesas corretas já estão no lugar.

Ação desta auditoria: **retoques de baixo risco em headers** (`vercel.json`) e
**documentação** do racional. As demais categorias foram confirmadas seguras, sem correção.

| # | Categoria | Situação | Ação |
|---|---|---|---|
| 1 | SQL Injection | Seguro | Nenhuma |
| 2 | XSS | Seguro (com ressalva estrutural) | Documentar |
| 3 | CSRF | Não se aplica | Documentar |
| 4 | Validação de input | Adequada p/ read-only | Nenhuma (opcional) |
| 5 | Headers de segurança | Fortes | Retoques menores |

---

## 1) SQL Injection — SEGURO

Não há SQL cru montado no cliente. Toda consulta vai pela **API REST do PostgREST**
(`sbFetch`, `index.html:717`) e por 2 funções RPC. Os termos do usuário são sanitizados no
contexto correto **antes** de entrarem na URL:

- **Filtros de igualdade / lista** (`eq.`, `in.(...)`): `enc()` = `encodeURIComponent`
  (`index.html:780`). Ex.: `codlinha=eq.${enc(line.codlinha)}` (`index.html:1547`);
  `codempresa=in.(${cods.map(enc).join(',')})` (`index.html:2114`).
- **Filtros `ilike`**: `ilikeTerm()` (`index.html:784`) primeiro **neutraliza `( ) *`** —
  que delimitam o grupo `or=(...)` e são curingas do `ilike` — e depois codifica. Isso
  impede que o termo quebre o filtro ou injete curingas. Usado em toda busca textual
  (`index.html:967`, `1518`, `2179`).
- **RPCs** `divat_busca_logradouro` / `divat_linhas_regiao`
  (`docs/backup_schema.sql:304`, `315`) são `LANGUAGE sql`: o parâmetro é **vinculado
  (bind)** e concatenado apenas no **valor** do `ILIKE` (`'%' || termo || '%'`), nunca no
  texto do comando. **Não há `EXECUTE`/`format()` dinâmico.** As chamadas passam
  `ilikeTerm`/`enc` (`index.html:2203`, `2249`).

Defesa em profundidade no banco: `anon` só tem **SELECT** (escrita revogada — ver
`CLAUDE.md`), então mesmo uma consulta hostil não escreveria nada.

**Correção necessária:** nenhuma.

## 2) XSS — SEGURO (com ressalva estrutural)

O portal renderiza dados do banco via `innerHTML` em ~100 pontos, mas **todo valor dinâmico
passa por `esc()`** (`index.html:779`), que escapa `& < > "`. Isso vale inclusive em:

- **Atributos**: `data-row` também escapa a aspa simples
  (`esc(JSON.stringify(r)).replace(/'/g,"&#39;")`, `index.html:977`).
- **Mensagens de erro**: `Erro: ${esc(e.message)}` (`index.html:986`).
- **Nomes com formatação especial**: `fmtLineName` escapa antes de inserir `&nbsp;`
  (`index.html:789`).

Não há vetores perigosos: **sem** `eval`, `new Function`, `document.write`, e **sem
handlers inline** (`onclick=`, `onerror=`…) — o código usa exclusivamente
`addEventListener`. O único `outerHTML` (`index.html:1118`) serializa um nó que o próprio
app construiu para o PDF, não uma string vinda do usuário.

**Ressalva estrutural (não é bug):** a proteção depende de **disciplina** — chamar `esc()`
em toda interpolação. Não há auto-escape de framework. Hoje, o que impediria um `esc()`
esquecido no futuro de virar XSS explorável seria o CSP — mas o CSP usa `'unsafe-inline'`
em `script-src` (ver item 5). Por isso a postura de CSP é relevante como **rede de
segurança**. Mitigações já existentes: a regra "reusar helpers / sempre escapar" está no
`CLAUDE.md`, e `node tests/check.js` valida a sintaxe do `<script>`.

**Correção necessária:** nenhuma no render. Recomendação de processo: manter a regra do
`esc()` e revisá-la ao criar novas views.

## 3) CSRF — NÃO SE APLICA (corretamente)

CSRF explora **credencial ambiente** (cookie de sessão) enviada automaticamente pelo
navegador em requisições cross-site. Aqui isso não existe:

- O portal faz **apenas requisições GET** (leitura). Não há formulário nem endpoint que
  **altere** dados.
- A autenticação é a **anon key em header** (`apikey` + `Authorization: Bearer`,
  `index.html:723`), **não** um cookie. Uma página maliciosa de terceiros **não** consegue
  forçar o navegador a anexar essa chave — ela é injetada por código da própria origem.
- Defesa em profundidade: `anon`/`authenticated` têm **só SELECT** (escrita revogada,
  `CLAUDE.md`), e o CSP já traz `form-action 'self'`.

**Correção necessária:** nenhuma. **Token CSRF seria inócuo** neste modelo (não há estado a
proteger nem credencial de cookie a falsificar). Adicioná-lo daria falsa sensação de
segurança sem reduzir risco.

## 4) Validação de input — ADEQUADA para read-only

- **Frontend**: a entrada do usuário é livre (campo de busca), o que é apropriado para
  busca textual; a segurança vem da **sanitização no ponto de uso** (`enc`/`ilikeTerm`,
  item 1), não de uma allowlist de caracteres. A paginação numérica valida com
  `parseInt` + `isNaN` antes de usar (`index.html:1662`).
- **"Backend"**: não há backend próprio; o "servidor" é o Postgres via PostgREST. A
  validação efetiva é **RLS + privilégio SELECT-only + tipagem das colunas** — um valor com
  tipo incompatível é rejeitado pelo próprio banco.

**Correção necessária:** nenhuma. **Opcional** (baixo valor): `maxlength` nos campos de
busca, como limite cosmético / anti-DoS leve.

## 5) Headers de segurança — FORTES (retoques menores aplicados)

O `vercel.json` já entrega um conjunto forte, incluindo **os três headers citados no
pedido**:

- `Content-Security-Policy` (com `default-src 'self'`, `frame-ancestors 'none'`,
  `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`, `connect-src` restrito ao
  Supabase);
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- além de `Strict-Transport-Security`, `Referrer-Policy` e `Permissions-Policy`.

### Achado principal (defesa-em-profundidade, severidade média)

`script-src 'self' 'unsafe-inline'` — o `'unsafe-inline'` **anula o CSP como rede de
segurança contra XSS**. Como o app não usa handlers inline, o único motivo do
`'unsafe-inline'` é o `<script>` embutido no `index.html`.

**Decisão (dono): manter `'unsafe-inline'` e aceitar o risco residual**, pelos motivos:
o XSS já é mitigado na fonte pelo `esc()` consistente; remover o inline conflita com o
princípio arquitetural de **arquivo único** e traz efeitos colaterais concretos (abaixo).
Alternativas registradas caso se queira CSP estrito no futuro:

- **(a) Externalizar o JS** para `app.js` de mesma origem e usar `script-src 'self'`.
  Custo: quebra o single-file **e** o auto-update — `checarNovaVersao` observa o **ETag do
  `index.html`**; uma mudança só no `app.js` **não** dispararia o reload automático dos
  usuários.
- **(b) CSP por hash** (`'sha256-...'` do bloco inline). Mantém o arquivo único, mas o hash
  muda a cada edição do `<script>` → exige um passo de deploy que o regenere (contra o
  ethos "sem build"; se esquecido, o site quebra por CSP).

`style-src 'unsafe-inline'` é usado intensamente (`style="..."` embutido em quase toda
view); removê-lo exigiria refatoração grande e o risco é bem menor → **mantido**.

### Retoques de baixo risco aplicados nesta auditoria

- **CSP**: adicionado `upgrade-insecure-requests` (seguro — todo tráfego já é `https`/`wss`).
- **HSTS**: `max-age=31536000; includeSubDomains`. **`preload` não foi adicionado** de
  propósito: é um compromisso difícil de reverter e depende do domínio ápice sob controle
  do dono; adicionar só após decisão explícita.

---

## Resumo das correções

| Correção | Arquivo | Status |
|---|---|---|
| `upgrade-insecure-requests` no CSP | `vercel.json` | Aplicado |
| HSTS `includeSubDomains` | `vercel.json` | Aplicado |
| Manter `script-src 'unsafe-inline'` (risco residual aceito) | `vercel.json` | Documentado |
| SQL injection / XSS / CSRF / validação | `index.html` | Confirmado seguro, sem ação |
| `maxlength` nos inputs de busca | `index.html` | Opcional, não aplicado |
