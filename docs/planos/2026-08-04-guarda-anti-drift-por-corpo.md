# Guarda anti-drift por corpo inteiro — Plano de Implementação

> **STATUS: EXECUTADO em 04/08/2026**, na branch `claude/chame-brainstorming-86sjad`.
> As 4 tarefas foram concluídas e o gate está verde (50 cópias conferidas, Semgrep sem achados).
> A Tarefa 2 (teste de mutação) confirmou o buraco: uma mutação em `resumoFrota` passou pelo
> `canon` antigo E pelos 213 testes do `pure.test.js`; só a guarda nova acusou.
> Mantido no repo como registro da decisão e das alternativas descartadas.

**Objetivo:** fazer o `tests/check.js` comparar o **corpo inteiro** de cada cópia dos harness
contra o `app.js`, em vez de um trecho escolhido à mão — eliminando a possibilidade de uma cópia
divergir em silêncio.

**Arquitetura:** cada declaração copiada nos harness passa a ser delimitada por marcadores
`/* @fonte <nome> */ … /* @fim */`. O gate recorta o bloco **por marcador** (sem parsear código),
normaliza e exige que o texto exista igual dentro do `app.js` normalizado. A tabela `canon` de 54
trechos escritos à mão e a guarda de cobertura dela são apagadas — a cobertura passa a ser
"todo símbolo exportado tem marcador".

**Stack:** Node puro (`fs`, `path`), sem dependências. O `tests/check.js` é offline por contrato —
este plano não muda isso.

## Restrições globais

- **Não editar `app.js`.** Nenhuma linha. Se um passo parecer exigir isso, pare e reporte.
- `tests/check.js` continua **offline e sem dependências** (nada de rede, nada de `npm install`).
- Não usar `eval` nem `new Function` — a regra Semgrep `divat-eval-quebra-csp` varre o repo
  inteiro (`.semgrep/rules/`, sem filtro de `paths`). Este plano não precisa de nenhum dos dois.
- Nada aqui toca produção: `index.html`, `styles.css`, `vercel.json`, `.vercelignore`, `vendor/`
  e o Supabase ficam intocados. O pior caso é gate vermelho, nunca site fora do ar.
- Branch de trabalho: `claude/chame-brainstorming-86sjad`.

## Fatos medidos nesta investigação (não remedir)

- As cópias **não estão divergentes hoje**: 49 de 50 exports conferidos por corpo inteiro batem
  byte-a-byte (normalizado); a 50ª (`esc`) não pôde ser conferida por limitação do recortador,
  não por divergência — verificada à parte e também idêntica.
- **16 das 54 entradas do `canon` vigiam apenas a linha de assinatura**, e são justamente as
  funções complexas: `matchEvent`, `classifyMunLines`, `terminaisDoMunicipio`,
  `localidadesQueCasam`, `municipiosExatos`, `tabMatchesEvent`, `dispatchRealtime`, `sbFetch`,
  `fetchComTimeout`, `marcarTrunc`, `bannerTrunc`, `rjOrder`, `resumoFrota`,
  `filtrarFrotaEmpresas`, `openTabState`, `closeTabState`. É o buraco que este plano fecha.
- **Recortar código do `app.js` por contagem de chaves NÃO funciona.** O literal de regex
  `/[&<>"']/g` dentro de `esc` (app.js:183) contém aspas e engana qualquer varredura que entre
  em "modo string". Por isso o desenho **não parseia**: recorta por marcador literal no harness
  e faz busca de substring no `app.js`.
- `tests/harness.js` tem **uma adaptação deliberada**: `SB_TIMEOUT_MS` é `let` (com getter/setter
  no `module.exports`) para o teste de timeout poder encurtá-lo. No `app.js` é `const`. Por isso
  a normalização troca `const`→`let` antes de comparar.
- `tests/harness.js:2` diz "from app.js (lines 618-684)" — referência **já defasada** (a seção
  `SUPABASE CONFIG` está em app.js:15-209). Corrigida na Tarefa 4.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `tests/check.js` | Gate offline. Seção `[2]` passa a comparar corpo inteiro. | Modificar (`:142-243`) |
| `tests/pure.harness.js` | ~40 cópias puras. Ganha marcadores. | Modificar |
| `tests/harness.js` | ~10 cópias da seção `SUPABASE CONFIG`. Ganha marcadores. | Modificar |
| `CLAUDE.md` | Instrução `:195` manda "adicionar ao `canon`" — deixa de existir. | Modificar |

Nenhum arquivo criado. Nenhum apagado.

---

### Tarefa 1: Guarda nova convivendo com a antiga

Adiciona a comparação por corpo **sem remover** o `canon`. As duas rodam juntas nesta tarefa —
se a nova tiver defeito, a antiga ainda protege.

**Arquivos:**
- Modificar: `tests/check.js` (inserir bloco novo logo após o loop do `canon`, ~`:214`)
- Modificar: `tests/pure.harness.js` (marcadores)
- Modificar: `tests/harness.js` (marcadores)

**Interfaces:**
- Consome: `js` (conteúdo do `app.js`, já lido em `tests/check.js:19-20`), `fs`, `path`,
  `TESTS_DIR`, `okline()`, `fail()` — todos já existentes no arquivo.
- Produz: nada importado por outras tarefas. A Tarefa 3 apaga o `canon` contando com esta pronta.

- [ ] **Passo 1: escrever a guarda nova (vai falhar — ainda não há marcadores)**

Inserir em `tests/check.js`, imediatamente depois do bloco de cobertura do `canon`
(depois da linha `}` que fecha o bloco iniciado em `:223`, antes de `// ---------- [2b]`):

```js
// ---------- [2c] anti-drift por CORPO INTEIRO ----------
// O `canon` acima vigia um TRECHO escolhido à mão. Em 16 das 54 entradas esse trecho é só a
// linha de assinatura — mudar o corpo no app.js e esquecer a cópia passa batido, e são
// justamente as funções complexas (sbFetch, dispatchRealtime, classifyMunLines...).
// Aqui a comparação é do bloco INTEIRO, delimitado por marcador no harness.
//
// Por que marcador e não parser: `esc` (app.js:183) contém o literal de regex /[&<>"']/g, com
// aspas dentro. Qualquer varredura que entre em "modo string" se perde nele. Marcador literal
// + busca de substring não tem esse problema, e falha alto quando falha.
{
  const normFonte = s => s
    .replace(/\/\/[^\n]*/g, '')        // comentário de linha
    .replace(/\/\*[\s\S]*?\*\//g, '')  // comentário de bloco
    .replace(/\bconst\b/g, 'let')      // harness usa `let SB_TIMEOUT_MS` de propósito
    .replace(/\s+/g, ' ')
    .trim();

  const MARCA_FIM = '/* @fim */';
  const appNorm = normFonte(js);
  const HARNESSES = ['pure.harness.js', 'harness.js'];
  let total = 0, falhou = false;

  for (const arquivo of HARNESSES){
    const src = fs.readFileSync(path.join(TESTS_DIR, arquivo), 'utf8');

    const me = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}\s*;/);
    if (!me){ fail(`não achei o module.exports do ${arquivo}`); falhou = true; continue; }
    const exportados = [...new Set(
      me[1].split(',').map(s => s.trim()).filter(Boolean)
        .map(s => s.replace(/^(?:get|set)\s+/, '').split(/[:(]/)[0].trim())
        .filter(Boolean)
    )];

    const marcados = new Map();
    const re = /\/\*\s*@fonte\s+([A-Za-z_$][\w$]*)\s*\*\//g;
    let m;
    while ((m = re.exec(src))){
      const nome = m[1], ini = m.index + m[0].length;
      const fim = src.indexOf(MARCA_FIM, ini);
      if (fim < 0){ fail(`[${arquivo}] @fonte ${nome} sem ${MARCA_FIM}`); falhou = true; continue; }
      marcados.set(nome, src.slice(ini, fim));
    }

    const semMarca = exportados.filter(n => !marcados.has(n));
    if (semMarca.length){
      fail(`[${arquivo}] cópia exportada sem marcador @fonte: ${semMarca.join(', ')}`);
      falhou = true;
    }

    for (const [nome, trecho] of marcados){
      const alvo = normFonte(trecho);
      if (!alvo){ fail(`[${arquivo}] bloco @fonte ${nome} está vazio`); falhou = true; continue; }
      if (appNorm.includes(alvo)) total++;
      else {
        fail(`cópia DIVERGIU do app.js: "${nome}" (${arquivo}) — o corpo no harness não existe mais igual no app.js`);
        falhou = true;
      }
    }
  }
  if (!falhou) okline(`anti-drift por corpo inteiro (${total} cópias conferidas nos ${HARNESSES.length} harness)`);
}
```

- [ ] **Passo 2: rodar e confirmar que FALHA**

Executar: `node tests/check.js`

Esperado: falhas do tipo `cópia exportada sem marcador @fonte: fmtCode, fmtTime, …` para os dois
harness. Se passar de primeira, a guarda não está sendo executada — investigar antes de seguir.

- [ ] **Passo 3: marcar as cópias no `tests/pure.harness.js`**

Envolver **cada declaração exportada** com os marcadores. O bloco entre eles deve conter a
declaração e nada mais (comentários explicativos podem ficar dentro — a normalização os remove).

Exemplo, para `esc` (hoje em `tests/pure.harness.js:19-20`):

```js
/* @fonte esc */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
/* @fim */
```

Exemplo, para uma função de várias linhas:

```js
/* @fonte matchEvent */
function matchEvent(r, c){
  // …corpo existente, inalterado…
}
/* @fim */
```

Os 40 nomes exportados por este arquivo estão no `module.exports` ao final dele. **Não alterar
o corpo de nenhuma cópia** nesta tarefa — só envolver.

- [ ] **Passo 4: marcar as cópias no `tests/harness.js`**

Mesmos marcadores, para os 10 nomes do `module.exports`:
`SB_TIMEOUT_MS`, `SB_RETRIES`, `selecionarSupabase`, `esperar`, `fetchComTimeout`, `sbFetch`,
`marcarTrunc`, `bannerTrunc`, `CANCELADO`, `ehCancelamento`.

Atenção: `SB_URL`, `SB_KEY` e `SB` (`tests/harness.js:6-8`) são **fixtures de teste**, não cópias
do `app.js` — **não marcar**. Não são exportados, então a cobertura não os cobra.

- [ ] **Passo 5: rodar e confirmar que PASSA**

Executar: `node tests/check.js`

Esperado: linha `✓ anti-drift por corpo inteiro (50 cópias conferidas nos 2 harness)` e o gate
inteiro verde, com o `canon` antigo também verde. Se algum nome acusar `DIVERGIU`, **não ajuste o
harness para calar o gate** — significa que aquela cópia realmente difere do `app.js`; investigue
e reporte antes de continuar.

- [ ] **Passo 6: commit**

```bash
git add tests/check.js tests/pure.harness.js tests/harness.js
git commit -m "test: guarda anti-drift compara corpo inteiro das cópias, não trecho"
```

---

### Tarefa 2: Provar que a guarda pega deriva de verdade

Uma guarda que nunca falhou não é guarda — é decoração. Esta tarefa é um teste de mutação manual.

**Arquivos:** nenhum modificado ao final (a mutação é revertida).

- [ ] **Passo 1: introduzir deriva deliberada**

Em `tests/pure.harness.js`, dentro do bloco `/* @fonte resumoFrota */`, alterar **um** operador ou
literal do corpo (exemplo: trocar um `>=` por `>`). Escolher `resumoFrota` de propósito: no
`canon` antigo ela é vigiada só por `'function resumoFrota(rows){'`, então a guarda velha **não
vai** reclamar.

- [ ] **Passo 2: rodar e confirmar que a guarda NOVA acusa**

Executar: `node tests/check.js`

Esperado: `✗ cópia DIVERGIU do app.js: "resumoFrota" (pure.harness.js) …` e saída não-zero.
Confirmar também que a seção `[2]` (canon antigo) **passou** — é a demonstração do buraco.

- [ ] **Passo 3: reverter a mutação**

```bash
git checkout -- tests/pure.harness.js
```

- [ ] **Passo 4: confirmar que voltou ao verde**

Executar: `node tests/check.js` — esperado: tudo verde, sem alterações pendentes
(`git status --short` vazio).

---

### Tarefa 3: Apagar o `canon` e a guarda de cobertura dele

Só depois da Tarefa 2 ter provado a nova.

**Arquivos:**
- Modificar: `tests/check.js` (remover `:142-243` aproximadamente — do comentário
  `// trecho distintivo de cada função copiada nos harness` até o fecha-chaves do bloco de
  cobertura, inclusive)

- [ ] **Passo 1: remover a tabela `canon` e o loop dela**

Apagar o array `const canon = [ … ];` inteiro (54 entradas) e o `for (const [name, snippet] of canon)`
logo abaixo.

- [ ] **Passo 2: remover a guarda de cobertura do `canon`**

Apagar o bloco `{ const HARNESSES = ['pure.harness.js', 'harness.js']; const guardados = new Set(canon.map(…)); … }`
inteiro, incluindo o comentário que o precede. A cobertura agora é feita pela checagem
`semMarca` da Tarefa 1.

- [ ] **Passo 3: renomear a seção nova de `[2c]` para `[2]`**

Trocar o cabeçalho `// ---------- [2c] anti-drift por CORPO INTEIRO ----------` por
`// ---------- [2] guarda anti-drift (cópias batem com o app.js, corpo inteiro) ----------`
e ajustar o `console.log('\n[2] …')` correspondente para descrever a checagem nova.

- [ ] **Passo 4: atualizar o cabeçalho do arquivo**

Em `tests/check.js:9`, a descrição da seção `[2]` diz que confere se as cópias "existem iguais no
app.js (avisa se a original mudou e a cópia ficou velha)". Reescrever para deixar explícito que a
comparação é do **corpo inteiro, por marcador `@fonte`**, e não mais de um trecho.

- [ ] **Passo 5: rodar o gate completo**

Executar: `node tests/check.js`

Esperado: verde, sem nenhuma menção a `canon`. Conferir que o total de asserções dos testes
unitários **não caiu** (a saída imprime as contagens).

- [ ] **Passo 6: commit**

```bash
git add tests/check.js
git commit -m "test: remove tabela canon, substituída pela comparação de corpo inteiro"
```

---

### Tarefa 4: Atualizar a prosa que manda usar o `canon`

**Arquivos:**
- Modificar: `CLAUDE.md:195`
- Modificar: `tests/harness.js:2`

- [ ] **Passo 1: corrigir a instrução no `CLAUDE.md`**

O trecho atual (`:193-196`) diz:

> (Ao alterar função com cópia em `tests/*.harness.js`, atualize a cópia — e se criar cópia nova,
> **adicione a guarda no `canon`**: o `check.js` agora falha se um símbolo exportado pelo harness
> não tiver guarda, porque foi assim que `ilikeTerm` e `MAX_TABS` ficaram descobertos.)

Reescrever para: ao alterar função com cópia, atualize a cópia — o `check.js` compara o **corpo
inteiro** e falha nomeando a função que divergiu; cópia nova precisa dos marcadores
`/* @fonte <nome> */ … /* @fim */`, sem os quais o gate falha por cobertura.

- [ ] **Passo 2: corrigir a referência defasada no `tests/harness.js`**

A linha 2 diz `from app.js (lines 618-684)`. A seção `SUPABASE CONFIG` está hoje em
`app.js:15-209`. Trocar o intervalo por uma referência que não apodrece: "da seção
`SUPABASE CONFIG` do `app.js`" (o repo já usa marca de seção em vez de número de linha
justamente por isso — ver `CLAUDE.md`, "Mapa do código").

- [ ] **Passo 3: rodar o gate (a seção `[2b]` confere deriva docs×código)**

Executar: `node tests/check.js`

Esperado: verde. Se a seção `[2b]` reclamar de algum fato numérico, é porque a prosa editada
carregava um número — **atualize o número, não apague a guarda** (regra do `CLAUDE.md`).

- [ ] **Passo 4: rodar a análise estática**

Executar: `./scripts/semgrep.sh`

Esperado: sem achados. (Sem `--full`: o modo com registry precisa de rede, bloqueada no ambiente
do Claude.)

- [ ] **Passo 5: commit e push**

```bash
git add CLAUDE.md tests/harness.js
git commit -m "docs: instrução anti-drift passa a citar marcadores @fonte"
git push -u origin claude/chame-brainstorming-86sjad
```

---

## O que este plano NÃO faz (decidido, não esquecido)

- **Não elimina as cópias.** Você continua copiando a função para o harness ao editá-la. O que
  muda é que o gate cobra e **diz qual**. Isso deixa de ser risco e vira tarefa mecânica.
  Eliminar as cópias exigiria extrair o código em tempo de teste com `node:vm` — descartado por
  criar máquina nova, piorar stack trace e acoplar os testes ao formato do `app.js`.
- **Não quebra o `app.js` em módulos ESM.** Avaliado e descartado: exigiria reabrir o
  `.vercelignore` (allowlist — erro ali derruba o site inteiro com 404), ensinar o detector de
  auto-atualização a vigiar os arquivos novos, alargar três guardas do `check.js` que hoje só
  varrem `index.html`+`app.js` (incluindo a de segredo `service_role`), trocar o gate de sintaxe
  (`new vm.Script` não compila ESM) e reescrever 4 fatos numéricos na prosa. Além disso o CI pina
  Node 20 enquanto o ambiente local é 22, e `require()` de ESM difere entre eles — risco não
  verificável no ambiente do Claude.
- **Não encolhe o `app.js`** (3.377 linhas) nem mexe na navegação dele.

## Buracos conhecidos e aceitos

1. A normalização troca `const`→`let`, então **trocar `const` por `let` no `app.js` não é
   detectado**. Sem efeito prático nestas puras; é o preço de suportar a adaptação deliberada do
   `SB_TIMEOUT_MS`.
2. A normalização remove `//` até o fim da linha, inclusive dentro de string (ex.: uma URL
   `https://…`). Como o mesmo corte é aplicado aos **dois** lados, a comparação continua válida;
   o efeito é só perda de precisão, nunca falso verde por divergência real.
3. A guarda confere que a cópia **existe** no `app.js`, não que seja a **única** ocorrência. Duas
   funções idênticas em lugares diferentes passariam. Improvável e sem consequência.
