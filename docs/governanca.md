# Governança e critério de parada

Esta é a fonte normativa para controlar o custo de documentação, gates e modularização. Os
limites técnicos da refatoração permanecem no
[`plano de modularização`](planos/2026-08-14-modularizacao-fatias-3-4.md).

## Princípios

1. **Reduzir custo de leitura, não apenas bytes ou linhas.** Índices e fontes canônicas têm
   prioridade sobre duplicação, ZIP ou fragmentação arbitrária.
2. **Preservar conhecimento, não narrativas.** Antes de remover um registro, transfira fatos
   duráveis para a fonte vigente; o Git preserva a narrativa e o texto integral.
3. **Uma autoridade por fato.** Outras páginas apontam para a fonte canônica em vez de copiar sua
   regra.
4. **Mudança pequena e reversível.** Documentação, processo e código são tratados em PRs
   independentes; nenhuma limpeza documental justifica alterar comportamento, banco ou produção.

## Admissão e saída da documentação

- `CLAUDE.md` tem teto-alvo de **550 linhas**. Como esta política nasce com o arquivo acima do
  teto, não aumente sua contagem líquida: para adicionar uma regra, mova ao menos o mesmo volume
  de detalhes para a fonte especializada e deixe apenas a regra operacional e o link necessários
  em toda sessão. A redução até 550 deve ser reversível e ocorrer em entrega própria.
- Um fato permanente pertence à fonte especializada; um trabalho incompleto, a um plano vivo; um
  fato datado e encerrado pertence ao histórico do Git, não à árvore de trabalho.
- Um plano novo deve apontar para sua especificação ou motivação e declarar quando termina ou é
  abandonado.
- Handoffs, transcrições de sessão, auditorias encerradas e planos concluídos não ficam
  versionados como arquivos ativos. Migre conclusões duráveis e remova o original no mesmo PR.
- Documento novo só é admitido quando não houver uma fonte existente adequada. Se houver, amplie
  a fonte canônica em vez de criar uma concorrente.

**Parar a organização documental quando:** uma sessão nova encontra o estado vigente a partir de
[`docs/README.md`](README.md), seguindo apenas o documento especializado da tarefa, e todo
documento novo tem lugar, autoridade e condição de saída claros.

## Admissão e aposentadoria de gates

Um gate novo só entra quando todas as condições forem satisfeitas:

1. cobre um modo de falha **silencioso e documentado**, observado antes ou registrado como
   armadilha concreta;
2. a falha não cabe como uma asserção adicional em gate existente;
3. o custo por rodada é medido e cabe no ciclo; se dobrar a referência offline registrada de
   aproximadamente **32 segundos mais Semgrep**, o PR precisa justificar explicitamente;
4. se o gate cobrir migração, fase ou incidente específico, seu cabeçalho declara a condição de
   aposentadoria.

Gate temporário é removido quando sua condição de aposentadoria ocorre e a proteção permanente
equivalente está comprovada. Gate permanente só é removido com evidência de cobertura substituta.

## Admissão e parada da modularização

Uma extração só entra se remover uma responsabilidade completa, criar uma interface explícita e
permitir proteção estática ou comportamental capaz de falhar quando o módulo quebrar. Não criar
módulo apenas para reduzir linhas.

Pare e registre a responsabilidade restante quando qualquer condição ocorrer:

- o módulo precisar receber mais de aproximadamente **seis dependências mutáveis injetadas**;
- for necessário exportar estado mutável interno do IIFE de `app.js`;
- a extração exigir mudança de query, chave, schema ou comportamento;
- o que resta for majoritariamente wiring: bootstrap, DOM, listeners, rotas e composição;
- a próxima extração aumentar dependências ou risco mais do que reduzir acoplamento.

A infraestrutura do modal permanece opcional. Ela só deve sair se uma análise demonstrar redução
real de acoplamento e todos os critérios acima continuarem satisfeitos.

## Condição global de encerramento

Encerre o programa de redução quando a rota documental curta funcionar, o histórico estiver fora
do contexto padrão, gates temporários tiverem saída declarada e as responsabilidades de negócio
restantes em `app.js` tiverem sido extraídas ou justificadas. Não reabra o programa por uma meta
arbitrária de tamanho; reabra apenas diante de custo ou acoplamento novo e mensurável.
