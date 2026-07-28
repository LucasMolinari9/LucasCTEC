# Ambiente de teste usa um projeto Supabase isolado

Uma branch do Git separa versões do código, mas não separa os dados. Se um preview de uma
branch apontar para o mesmo projeto Supabase da produção, qualquer experimento ainda consulta o
mesmo banco e pode afetar o ambiente real. A aparência de isolamento sem isolamento de dados é
especialmente arriscada porque induz quem testa a acreditar que produção está protegida.

**Decisão:** o Portal DIVAT terá um segundo projeto Supabase para teste. O `app.js` escolhe o
projeto pelo hostname: somente os hosts explicitamente registrados em `HOSTS_PROD` usam
produção; qualquer outro host usa teste quando a configuração de teste estiver completa. A
seleção permanece inerte e aponta tudo para produção enquanto a allowlist ou as credenciais de
teste estiverem vazias.

**Por quê:** produção é uma allowlist porque os endereços de preview do Vercel incluem valores
gerados a cada deploy e não podem ser enumerados antecipadamente. Tratar como produção somente
os hosts conhecidos aplica default-deny aos previews: uma branch nova nasce direcionada ao
banco de teste, nunca ao banco de produção.

As declarações literais `const SB_URL` e `const SB_KEY` nas linhas 24–25 do `app.js` são parte
de uma interface de automação e devem permanecer intocáveis. `check_deriva.mjs`,
`check_realtime.mjs`, `check_data_quality.mjs` e `check_grants.mjs` extraem esses valores por
regex para auditar sempre o banco de produção. Alterar o formato, o tipo da declaração ou
substituí-las por uma expressão impediria os quatro gates de localizar a configuração.

## Dívida assumida

Os projetos de teste e produção mantêm duas cópias do schema manualmente. Não existe hoje um
gate que detecte divergência entre elas. Mudanças de schema precisam ser aplicadas em produção
antes ou junto do merge do código que depende delas, e o projeto Supabase Free de teste pode
pausar após um período de inatividade.

## Status

Accepted — o encanamento pode entrar de forma inerte antes da criação do projeto de teste. Os
hosts de produção, a URL e a anon key de teste só serão preenchidos quando esse projeto existir;
até lá, todos os hosts continuam usando produção.
