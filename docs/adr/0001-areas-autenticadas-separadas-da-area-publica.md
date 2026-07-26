# Áreas autenticadas ficam separadas da área pública

Hoje toda a arquitetura do Portal DIVAT assume um único nível de acesso: consulta pública,
somente leitura, mesma chave anon pra todo mundo, RLS com policy `anon_read_*` por tabela e
nenhum caminho de escrita pela API (ver `CLAUDE.md` § Supabase). O dono confirmou que o portal
vai se estender pra outros setores/domínios (ex.: fretamento) e que parte dessas novas
funcionalidades vai exigir usuário logado e pode envolver dados sensíveis — algo que a
arquitetura atual não foi desenhada pra suportar.

**Decisão:** quando essas áreas autenticadas/sensíveis forem construídas, elas nascem
**estruturalmente separadas** da área pública atual — não entram como "mais telas" dentro do
mesmo `app.js`/IIFE público, nem reusam a chave anon / RLS-só-leitura pensada pra consulta
pública. A separação vale pro código (frontend) e, na medida do necessário, pro modelo de acesso
ao Supabase (chave, policies, sessão).

**Por quê:** misturar lógica pública sem login com lógica autenticada sensível no mesmo
bundle/IIFE aumenta o risco de vazar por engano um card sensível pro público e complica o RLS
que hoje é propositalmente simples ("anon só lê"). O ganho de conveniência de "é só mais um
arquivo" não paga esse risco de segurança.

## Status

Accepted — decisão preventiva. Ainda não há timeline nem escopo concreto pra fretamento/outros
setores, e nenhuma área autenticada existe hoje; esta ADR só fixa **que** deve nascer separada,
não **como** (app à parte? projeto Supabase separado? rota protegida com auth check? fica pra
quando o trabalho concreto começar).
