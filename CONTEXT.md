# Portal DIVAT

Portal público de consulta (somente leitura) do DETRO/RJ · DIVAT. Ver `CLAUDE.md` para arquitetura
e regras técnicas — este arquivo é só o glossário do domínio.

## Language

**Aba** (tab):
Um documento aberto na faixa de abas do modal, com sua própria linha ativa e seu próprio ciclo
de vida de Realtime. Não é uma segunda instância do portal — o painel lateral, o banner da linha
e a busca do topo continuam existindo uma vez só, compartilhados por todas as abas. Máximo de
**5 abas** simultâneas.
_Avoid_: janela, view (view é o termo técnico interno do `app.js`; aba é o conceito de produto)

**Aba em segundo plano** (background tab):
Uma aba que não é a aba ativa no momento. Não recarrega sozinha quando o Realtime avisa que os
dados dela mudaram — fica marcada como desatualizada e só recarrega quando volta a ser a aba
ativa. Reflete o mesmo princípio que já vale pra quem está com o modal fechado: "quem não está
com o card aberto vê o dado novo na próxima busca" (ver `CLAUDE.md`).
_Avoid_: aba inativa (ambíguo com "fechada")
