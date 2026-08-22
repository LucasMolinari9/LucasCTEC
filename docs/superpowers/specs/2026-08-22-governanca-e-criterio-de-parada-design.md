# Governança e critério de parada — design

## Objetivo

Reduzir o custo recorrente de contexto e impedir refatorações sem fim, sem apagar histórico nem
alterar código, banco, publicação ou comportamento do portal.

## Decisão

Esta entrega cria duas entradas curtas:

- `docs/README.md` orienta qual documento consultar e separa fonte vigente, plano e snapshot;
- `docs/governanca.md` é a política normativa de admissão e encerramento para documentação,
  gates e modularização.

Os documentos existentes continuam intactos como evidência. Os dois planos que originaram as
regras recebem somente um ponteiro para a política canônica, evitando duas fontes normativas.

## Limites de segurança

- Nenhum arquivo servido, teste, script, workflow, SQL ou configuração é alterado.
- Nenhum documento histórico é removido, condensado ou reclassificado nesta entrega.
- Nenhuma fase de modularização é iniciada.
- Não há merge na `main` nem operação em serviço externo.

## Critério de aceitação

Uma sessão nova deve conseguir partir de `README.md`, chegar ao índice de `docs/` e encontrar a
fonte vigente sem abrir `docs/historico/`. A política deve declarar critérios objetivos de entrada,
saída e parada e preservar links para as medições e planos que a fundamentam.

