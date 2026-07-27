/* Casos de teste das regras de .semgrep/rules/divat.yml — rodados por
   `./scripts/semgrep.sh --test`. NÃO é código do portal: nada aqui é carregado pelo
   index.html, e o arquivo está no .semgrepignore (senão os casos ruins de propósito
   apareceriam como achado no scan normal).

   Convenção do Semgrep: um comentário de anotação marca a linha SEGUINTE — ou como achado
   esperado, ou como caso que não pode disparar. O teste falha nos dois sentidos: se um
   achado esperado sumir (a regra quebrou) e se um caso bom disparar (falso positivo) — é o
   que impede a regra de virar ruído que todo mundo aprende a ignorar.
   (Este cabeçalho evita escrever as anotações por extenso: o próprio Semgrep as leria.) */

/* ===== 1) seam do ciclo de vida da view ===== */

async function ruim() {
  const rows = await sbFetch('tabela_vista_teste');
  // ruleid: divat-pdfhtml-fora-do-seam
  currentView.pdfHTML = () => tableHTML(rows);
}

async function bom() {
  const view = currentView, gen = beginGen(view);
  const rows = await sbFetch('tabela_vista_teste');
  // ok: divat-pdfhtml-fora-do-seam
  commitViewResult(view, gen, { pdfHTML: () => tableHTML(rows) });
}

// as escrituras de DENTRO do seam usam a view capturada — não podem disparar
function commitViewResultFake(view, gen, patch) {
  if (!isCurrentGen(view, gen)) return false;
  // ok: divat-pdfhtml-fora-do-seam
  if ('pdfHTML' in patch) view.pdfHTML = patch.pdfHTML;
  return true;
}

/* ===== 2) sinks bloqueados pela CSP ===== */

function evalRuim(src) {
  // ruleid: divat-eval-quebra-csp
  return eval(src);
}

function functionRuim(corpo) {
  // ruleid: divat-eval-quebra-csp
  return new Function('r', corpo);
}

function timerRuim() {
  // ruleid: divat-timer-com-string-quebra-csp
  setTimeout('recarrega()', 1000);
  // ruleid: divat-timer-com-string-quebra-csp
  setInterval('checarNovaVersao()', 180000);
}

function timerBom() {
  // ok: divat-timer-com-string-quebra-csp
  setTimeout(() => recarrega(), 1000);
  // ok: divat-timer-com-string-quebra-csp
  setInterval(checarNovaVersao, 180000);
}

/* ===== 3) terceiro externo em runtime ===== */

function cdnRuim() {
  // ruleid: divat-cdn-externo-em-runtime
  const s = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  return s;
}

function cdnBom() {
  // ok: divat-cdn-externo-em-runtime
  const s = 'vendor/supabase-js-2.110.7.min.js';
  // ok: divat-cdn-externo-em-runtime
  const api = 'https://lwzsxuaqqeoamukduhev.supabase.co/rest/v1/';
  return [s, api];
}

function styleAttrRuim() {
  // ruleid: divat-style-attr-quebra-csp
  return `<div class="sec-head" style="--accent:var(--c-doc)"><h2>x</h2></div>`;
}

function styleAttrBom() {
  // ok: divat-style-attr-quebra-csp
  const markup = `<th class="w-90">Código</th>`;
  // ok: divat-style-attr-quebra-csp
  document.body.style.display = 'none';
  return markup;
}
