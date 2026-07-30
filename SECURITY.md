# Política de segurança

Este repositório é **público**. O portal que ele publica
(<https://divatdetro.vercel.app>) é um serviço de consulta **somente leitura** do DETRO/RJ · DIVAT.

O manual completo (modelo de ameaça, auditorias, riscos residuais aceitos) está em
[`docs/seguranca.md`](docs/seguranca.md). Este arquivo é só o canal de contato.

## Como relatar uma vulnerabilidade

**Não abra issue pública.** Use o canal privado do próprio GitHub:

> aba **Security** do repositório → **Report a vulnerability** → *Private vulnerability reporting*

Só o dono do repositório enxerga o relato. Se o botão não aparecer, o recurso está desligado —
avise por qualquer canal público **sem descrever a falha** ("preciso de um canal privado") e ele
será ligado.

O que ajuda no relato: o que você fez, o que aconteceu, o que deveria ter acontecido, e o
mínimo de evidência que prova o ponto (uma requisição, um `curl`, um trecho de resposta).

**Prazo:** primeira resposta em até **7 dias**; posição sobre correção em até **30 dias**.
Não há recompensa financeira — é um portal de órgão público, sem orçamento para isso. Há
crédito no `docs/CHANGELOG.md` para quem quiser.

## Regras do teste (leia antes de testar)

O banco atende ao público real e **o plano é Free, sem PITR** — não existe "desfazer" barato.

**Permitido:** requisições de leitura ao PostgREST, inspeção do JS/CSP/headers, análise do
código e do histórico do git, tentativas de escrita que você **espera que sejam recusadas**
(um `401`/`403` é a prova que se busca).

**Proibido:** `DELETE`, `UPDATE`, `TRUNCATE` ou qualquer escrita que **tenha sucesso** — se
achar um caminho de escrita aberto, **pare e relate**, não demonstre apagando; teste de carga,
stress ou negação de serviço; engenharia social com o dono ou com o DETRO; acessar dado de
terceiro além do necessário para provar o ponto.

## Dentro do escopo

- Qualquer **caminho de escrita** pela API pública (`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`
  com a chave `anon`) — é a regra número um do projeto que isso não exista.
- Leitura de tabela que **não deveria** ser pública — em especial as de staging do ETL
  (`evento_dados`, `evento_textos`, `portaria_data`, `portaria_texto_teste`), que são fechadas
  de propósito.
- Contornar RLS, ler dado que nenhuma policy autoriza, ou escalar de `anon` para outro role.
- XSS, injeção de HTML ou contorno da CSP no portal.
- Segredo de verdade versionado no git (ver a seção abaixo sobre o que **não** conta).
- Falha na cadeia de publicação: workflow do GitHub Actions que possa ser abusado por um PR de
  fork, exfiltração de secret do CI, comprometimento do deploy da Vercel.

## Fora do escopo (conhecido e por design)

Estas coisas já foram avaliadas e **não** são vulnerabilidade — relatá-las não terá resposta
além deste texto:

- **A chave `anon` do Supabase estar no `app.js` e neste repositório.** Ela é pública por
  design: é servida a todo visitante do site, como em qualquer projeto Supabase client-side. A
  segurança vem do **RLS + privilégio mínimo** (o público só faz `SELECT`), não do sigilo da
  chave. Chave que seria segredo — a `service_role` — **nunca** entrou neste repositório.
- **Ausência de rate limit na API pública.** O navegador fala direto com o Supabase; a Vercel
  não está no caminho da requisição. É risco de disponibilidade e custo, já registrado e aceito
  em `docs/seguranca.md` §9.2, com `statement_timeout` e teto de linhas como controles.
- **Os `project_ref` do Supabase, o schema do banco e os nomes das tabelas** estarem
  documentados. São públicos junto com o resto do código; a proteção é o RLS.
- Falta de SPF/DMARC, versões de biblioteca sem exploit demonstrado, relatórios de scanner
  automático sem impacto provado, e clickjacking em página sem ação de estado.
