# O repositório fica público

O `LucasMolinari9/LucasCTEC` já foi privado. O `docs/seguranca.md` chegou a listar "tornar o
repositório privado" entre as ações de maior ganho para o dono, com o passo a passo do painel do
GitHub — uma instrução acionável, escrita quando essa era a postura vigente. A postura mudou e a
instrução ficou; o manual de segurança passou a mandar fazer o oposto da decisão em vigor. Esta
ADR existe para que a decisão tenha um lugar próprio, em vez de sobreviver como ausência de
instrução contrária.

**Decisão:** o repositório é **público** e permanece público. Nenhum documento do repo deve
instruir a torná-lo privado; quem quiser reverter a decisão reabre esta ADR.

**Por quê:** a segurança do portal nunca dependeu do sigilo do código. Ela está no banco — RLS
ligado em todas as tabelas, `anon` com SELECT e nada além, objeto novo nascendo fechado — e isso
é verificado contra o banco vivo **de produção** pelos gates, não presumido (eles não alcançam o
projeto de teste — ver `CLAUDE.md` § Supabase). A chave `anon` é pública por
projeto, e o `app.js` é servido a todo visitante: o código já era legível por qualquer um antes
da mudança de visibilidade. O que um repo privado escondia era a **prosa**, não a superfície de
ataque.

O ganho concreto de ser público é operacional: minutos de Actions ilimitados (os sete workflows,
incluindo os dois crons diários, deixam de consumir cota) e Code Scanning / SARIF sem custo.

**O que a decisão custa, e é aceito:** documentação de arquitetura, runbooks e a lista de riscos
residuais passam a ser legíveis por qualquer pessoa.

Na maior parte isso não entrega nada — a documentação descreve controles que já são observáveis de
fora (a chave `anon` e o `app.js` são servidos a todo visitante) ou comportamento público do
Postgres e do Supabase. **A exceção é a capacidade de resposta a incidente:** que não há como
aplicar rate limit sem mudar a arquitetura (§ 9.2) e que o restore nunca foi concluído, com RTO/RPO
sem medição (§ 9.3), não são fatos deriváveis de fora. **A resposta certa a isso não é redigir a
prosa — é fechar o SEC-06.** Enquanto o RTO for desconhecido, a frase é verdadeira esteja ela no
git ou na pasta de backups; tirá-la do git protegeria o texto, não o portal.

**O que a decisão NÃO justifica:** apagar do repositório a explicação de por que um controle
existe. O `CLAUDE.md` continua registrando, por inteiro e com a medição que o originou, o motivo de
o gate `check_grants.mjs` rodar diariamente e de o `backup_schema.sql` revogar tudo que não é
SELECT. Regra sem lastro é regra que a próxima faxina apaga por parecer redundante — foi assim que
a versão anterior daquele parágrafo pôde afirmar o oposto do medido por dois dias. Sigilo não é o
que protege produção aqui; o gate diário é.

## Consequências verificáveis

- `docs/seguranca.md` § 5 não pede mais visibilidade privada.
- Comentário que justifique uma escolha técnica "porque o repo é privado" está com a premissa
  errada — `--metrics=off` do Semgrep, por exemplo, continua certo, mas pelo motivo de não mandar
  telemetria de código para terceiro, não pela visibilidade.
- `LICENSE` segue **proprietária** (todos os direitos reservados). Público não é open source:
  qualquer pessoa pode ler, ninguém recebe licença de uso, cópia ou obra derivada.

## Status

Accepted em 31/07/2026. Substitui a recomendação de repositório privado que constava do
`docs/seguranca.md` § 5 item 4 desde 27/07/2026.
