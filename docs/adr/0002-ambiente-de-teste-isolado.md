# Ambiente de teste usa um projeto Supabase isolado

Uma branch do Git separa versões do código, mas não separa os dados. Se um preview de uma
branch apontar para o mesmo projeto Supabase da produção, qualquer experimento ainda consulta o
mesmo banco e pode afetar o ambiente real. A aparência de isolamento sem isolamento de dados é
especialmente arriscada porque induz quem testa a acreditar que produção está protegida.

**Decisão:** o Portal DIVAT usa o projeto Supabase `divat - TESTE`
(`gontnlfmothfglssbyyk`) para previews e desenvolvimento. O `app.js` escolhe o projeto pelo
hostname: os 3 domínios de produção registrados em `HOSTS_PROD` — o canônico
`divatdetro.vercel.app`, o alias do time e o alias da branch `main` — usam produção; qualquer
outro host usa teste. A seleção é fail-closed: se a configuração do ambiente escolhido estiver
incompleta, a aplicação interrompe a inicialização em vez de recorrer ao banco de produção.

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
pausar após um período de inatividade. Como o `vercel.json` é comum a todos os deploys, a CSP de
produção permite conexão com os dois projetos; a seleção de hostname impede que o código de
produção escolha o projeto de teste.

## Status

Accepted e ativado em 28/07/2026. Produção permanece em
`lwzsxuaqqeoamukduhev`; previews, `localhost` e hostnames não reconhecidos usam
`gontnlfmothfglssbyyk`.

**Verificado contra um preview real em 31/07/2026** (01:03 UTC). Entre 28/07 e essa data a
decisão estava implementada e testada offline, mas o gate que a exerceria no ambiente para o qual
ela foi escrita — `deploy-smoke.yml` → `scripts/check_deploy.mjs` — falhava em **todo** preview,
primeiro por falta do `VERCEL_AUTOMATION_BYPASS_SECRET` e depois por um laço de redirect no
próprio script. Só produção era verificada, que é justamente o caso **sem** risco: a propriedade
central desta ADR — preview nunca lê o banco de produção — nunca tinha sido medida em produção do
gate. Com o segredo configurado pelo dono e o script corrigido (PR #87), o run passou afirmando
que um hostname de preview fica fora da allowlist e seleciona teste, que a URL de teste está
isolada e que a guarda fail-closed está publicada. **A partir daqui isso é regressão vigiada, não
promessa de documento** — todo deploy repete a verificação.
