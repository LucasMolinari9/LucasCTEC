# Handoff — verificação da auditoria externa de 27/07/2026

> **Para a sessão nova:** leia este arquivo e o `CLAUDE.md`. Este descreve **o que aconteceu numa
> sessão específica e o que ficou aberto**; o `CLAUDE.md` é a fonte das regras do projeto. Se os
> dois divergirem, o `CLAUDE.md` manda.

## Estado

- **Branch:** `claude/ask-matt-sv1adq` (3 commits, tudo empurrado, árvore limpa).
- **CI:** `CI`, `Deriva`, `DB checks`, `Semgrep` verdes em `3201b79`. `Views` estava rodando ao
  fim da sessão — **conferir**. Nenhuma linha do `app.js` foi tocada, e `Views` passou no commit
  anterior, então a expectativa é verde.
- **Sem PR aberto** (não foi pedido).

| Commit | O que é |
|---|---|
| `3bd1345` | Corrige as 6 derivas de doc que a auditoria achou (README, contagens, `SB_KEY`, tags vazadas, manifest) |
| `475aa0c` | Guardas: cobertura do canon anti-drift + nova seção `[2b]` do `check.js` (deriva docs×código) |
| `3201b79` | Issue #63: `check_data_quality.mjs` + baseline + workflow `db-checks.yml` |

## O que a sessão fez

Chegou um relatório de auditoria externa (3ª rodada, depois de Kimi K3 em 16/07 e Qwen em 17/07).
A tarefa foi **verificar** o relatório e agir. **11 de 11 afirmações confirmadas** contra o repo e
o banco vivo. O relatório é sólido nos fatos; errou o **peso** em três pontos:

1. **Os 3 `style="display:none"` inline** — disse "todos estáticos, nenhum gerado por JS". Errado:
   os três são acionados pelo `app.js` em **11 sites** de `.style.display`. A conclusão dele
   (remover fecha o `unsafe-inline`) sobrevive; a execução é bem maior que "trocar por classe".
2. **Restore nunca testado** — o relatório escreveu "não achei marca"; eu endureci para
   "confirmado" sem endurecer a evidência, e depois rebaixei. A formulação dele era a correta.
3. **Sem LICENSE** — listado como pendência. **O repositório é privado**, então um `LICENSE` hoje
   não faz nada. Só passa a importar se o repo virar público. Peso: quase zero.

E achou coisas que ele não viu: README errado em **4** lugares (não 1) e com dois pontos
não-cosméticos (anunciava `supabase-js` vindo de **CDN**, e dizia que o `check.js` *valida*
`<script>` inline quando ele **proíbe**); `backup.md` errado em 2 lugares; uma **segunda** deriva
de contagem em `estrutura-frontend.md:66`; e o item abaixo.

## Achado novo nº 1 — `ilikeTerm` sem guarda anti-drift

O `pure.harness.js` exportava **37** cópias verbatim e o `canon` do `check.js` tinha **36**
guardas. A cópia descoberta era **`ilikeTerm`** (`app.js:114`) — o saneador que neutraliza
`( ) *` contra injeção no filtro `or=()` do PostgREST. Tinha 5 testes unitários, **todos rodando
contra a cópia**, sem nenhuma guarda de que a cópia ainda batia com o `app.js`: mexer no saneador
deixava os testes verdes. `MAX_TABS` estava no mesmo caso.

Corrigido. A guarda do `ilikeTerm` vigia a **declaração inteira** (em função com consequência de
segurança, qualquer alteração deve derrubar o gate, não só o desaparecimento). E o `check.js`
agora **se autoverifica**: símbolo exportado pelo harness sem entrada no `canon` derruba o gate.

## Achado novo nº 2 (o mais importante) — a integridade hub-and-spoke já está violada

Rodei `divat_data_quality()` pela primeira vez. O banco tem **17 `codlinha` órfãs** e **4 linhas**
com `cod_origem` inexistente:

| Tabela | Órfãs | Códigos |
|---|--:|---|
| `evento_teste` | 7 | `116000000`, `122000000`, `150004000`, `150006000`, `150008000`, `150009000`, `186006400` |
| `qh_predeterminado_teste` | 5 | `116000001`, `121003000`, `146016000`, `150006000`, `191020001` |
| `qh_teste` | 3 | `146016000`, `156002003`, `191020001` |
| `itinerario_teste` | 2 | `146016000`, `191020001` |
| `qh_predeterminado_teste.cod_origem` | 4 linhas | — |

`146016000` e `191020001` estão órfãs em **três** tabelas cada, com itinerário e quadro de
horários completos: cara de linha apagada do cadastro deixando os filhos atrás.

`U+FFFD` e `codempresa` inválida: **zero achados** — os dois limpos, confirma o `CLAUDE.md`.

**Isso invalidou um critério de aceite da issue #63** ("ambos os scripts passam no estado atual do
banco"). Não passam. Daí o **baseline** (`scripts/data_quality_baseline.json`): o gate passa com a
dívida de hoje e falha em achado **novo** ou conhecido que **piora**. Baseline é dívida
registrada, não perdão.

### O que isso muda na busca do portal (perguntado pelo dono, verificado)

- **A busca do topo não é afetada por nada disso.** Ela lê `tabela_vista_teste`, e as 12 codlinhas
  órfãs **não estão lá** (`no_hub = 0` nas 12). Já são inalcançáveis hoje.
- **Buscas que partem do filho** (Logradouro, Localidade, Terminais, Pesquisa de Evento) já
  descartam essas codlinhas **em silêncio**: `fetchLinesByCods` (`app.js:2597`) faz
  `codlinha=in.(…)` no hub e não volta linha nenhuma para elas.
- **Um único número visível seria afetado:** `frotaPorEmpresa` (`app.js:2248`) lê `qh_teste`
  **direto, sem passar pelo hub**, então soma as 3 órfãs hoje. Apagar levaria a frota operacional
  de **6.176 → 6.175** (1 veículo; reserva inalterada em 605). Ou seja: hoje o relatório conta
  frota de linha que não está no cadastro — apagar deixa **mais** correto.
- **Restaurar os pais** faria 12 linhas **aparecerem** na busca. Acréscimo, não perda.

## Decisões abertas — são do dono, nenhuma urgente

1. **Os 21 itens de dívida:** apagar os filhos órfãos ou restaurar as linhas-pai em
   `tabela_vista_teste`? É pergunta de **cadastro**, não técnica. O risco não está na escolha,
   está na execução (um `WHERE` errado apaga dado bom) — **backup fresco antes**, e a correção
   **replicada na staging**, senão o rebuild do ETL desfaz.
2. **LICENSE:** deixar de lado. Repo privado ⇒ efeito nulo. Se virar público, a escolha num
   trabalho de órgão público é institucional, não técnica.

## Próximo trabalho candidato (mapeado, não feito)

**Fechar o `unsafe-inline` do `style-src` na CSP.** Só frontend — não toca banco nem busca.
Restam 3 atributos `style=` inline no `index.html` (linhas **326** `.selector`, **340** `#btnBack`,
**370** `#lineBanner`), os únicos motivos do `'unsafe-inline'` em `style-src`.

Armadilhas já levantadas, para não re-derivar:

- Os três são acionados pelo JS em **11 sites** de `.style.display`: `app.js:304` (`.selector`);
  `790`, `1034`, `1035`, `1036` (`#btnBack`); `600`, `601`, `610`, `3162` (`#lineBanner`, que
  recebe `'flex'`, não `''`); mais `2549`/`2551` (`BLbl`, outro elemento).
- Trocar por `.hidden{display:none}` **exige mudar o JS**: com a classe aplicada,
  `el.style.display=''` não desliga mais nada. Os sites viram `classList.toggle`.
- `.selector` (`styles.css:116`) e `.line-banner` (`:327`) são `display:flex`. Uma classe
  `.hidden` tem a **mesma especificidade**, então precisa vir **depois** na ordem do fonte (ou
  `!important`).
- `index.html:370` não é só `display:none`, é `display:none;margin-top:20px` — o `margin-top`
  vai junto para a classe.
- **Não verificado:** a afirmação de que a CSP `style-src` não bloqueia escrita via CSSOM
  (`el.style.x = …`, ao contrário de `style=` no markup e `setAttribute('style')`). Isso foi dito
  de memória na sessão e **não foi conferido em navegador**. É a premissa que sustenta o ticket
  inteiro — **confira antes de confiar**, testando com o header apertado.

## Fora do alcance de agente

**Testar o restore ponta a ponta.** A maior lacuna real do relatório (plano Free, sem PITR) e a
única que nenhum agente fecha: é executar o runbook do `docs/backup.md` contra um projeto Supabase
novo, na máquina do dono. Já apontada pela revisão do Kimi em 16/07 e ainda sem evidência de ter
sido feita.

## Técnicas úteis descobertas nesta sessão

- **Rasterizar SVG sem ImageMagick/PIL/rsvg** (nenhum existe no ambiente): o binário do Chromium
  está em `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. `--headless --no-sandbox
  --screenshot --window-size=N,N` **corta ~45px da base** — renderize com folga (`N+200`) e
  recorte. Foi preciso escrever decoder/encoder de PNG em Python puro (zlib + CRC) para recortar
  e para **conferir os pixels** (margens simétricas) em vez de confiar no olho.
- **Testar script que precisa de rede até o Supabase** (bloqueada aqui): monte um "fakeroot" no
  scratchpad com um `app.js` falso apontando `SB_URL` para `127.0.0.1`, suba um stub HTTP do
  PostgREST e rode o script real contra ele. Foram 6 cenários no `check_data_quality.mjs`. Use
  `NO_PROXY=127.0.0.1`.
- **A rede até o Supabase está bloqueada para `fetch`/Node, mas o MCP do Supabase funciona** — foi
  por ele que toda a medição do banco foi feita.

## Armadilhas em que a sessão caiu (não repita)

- **Verificar fato do banco lendo documento.** Confirmei "existe só uma FK" lendo
  `docs/backup_schema.sql` — que é baseline versionada, ou seja, **um doc**, numa auditoria cujo
  tema é doc divergir da realidade. Depois refiz contra o banco (bateu). **Pergunte ao banco.**
- **`git checkout -- <arquivo>` não restaura arquivo NÃO rastreado** e falha em silêncio. Perdi o
  baseline recém-criado assim, e o backup seguinte copiou a versão já mutilada. Para arquivo novo,
  copie antes de mutar.
- **`python3 json.dumps` sem `ensure_ascii=False`** escapa os acentos (`í`) e suja doc em
  português.
- **Guarda genérica sobre prosa não funciona.** A 1ª versão da checagem de caminhos varria todo
  token em backtick e deu **61 falsos positivos contra 0 verdadeiros** (confundia nome de função,
  ruleset do Semgrep, slash command, caminho de sistema, diretório gerado, e o próprio
  `package.json` citado para dizer que NÃO existe). Ficou só **link markdown**. Gate que grita à
  toa é gate que alguém desliga.
- **Byte NUL invisível no fonte.** Um `Write` plantou NUL literal no separador de chave do
  `check_data_quality.mjs`. Funcionava, mas o `grep` passa a tratar o arquivo como binário. Agora
  é `const SEP` com escape explícito. **Se `grep` disser "binary file matches" num `.js`,
  investigue.**
- **Não verificado nesta sessão:** `./scripts/semgrep.sh` local (Semgrep não instalado, instalar
  exige rede) e `scripts/check_views.mjs` / `check_abas.mjs` local (rodaram no CI). O `app.js` não
  foi tocado.
