# CLAUDE.md — Portal DIVAT (Cadastro de Linhas Regulares)

Contexto para qualquer sessão futura do Claude trabalhar neste projeto.

## O que é
Portal **público de consulta (somente leitura)** do DETRO/RJ · DIVAT. Os usuários
buscam linhas de ônibus e abrem documentos (itinerários, quadro de horários, tarifas,
frota, histórico/eventos, empresas, relatórios). Os dados são **alimentados pelo dono
direto no Supabase**; o site apenas exibe e **atualiza ao vivo** (Realtime).

## Arquitetura (importante)
- **Frontend = um único arquivo: `index.html`** — auto-contido, com **CSS e JS embutidos**.
  Não há build, nem framework, nem `package.json`. É só servir o arquivo estático.
- As consultas usam **REST do Supabase via `fetch`** (PostgREST). O **supabase-js** (CDN) é
  usado **só** para o canal **Realtime**.
- `netlify.toml` define os cabeçalhos de segurança (CSP etc.) e `publish = "."`.

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `<script>` em `index.html`. A chave é a **anon
  (publishable)** — pública por design; a segurança vem do **RLS**.
- **RLS**: todas as tabelas têm RLS ligado. Há políticas **SELECT para `anon`** nas tabelas
  de consulta. **NÃO existe nenhuma política de escrita para `anon`** → o público só lê.
  Quem alimenta usa o painel do Supabase (service role, ignora RLS). **Nunca** adicionar
  política de INSERT/UPDATE/DELETE para `anon`.
- **Realtime**: as tabelas usadas estão na publicação `supabase_realtime` e as tabelas sem
  PK têm `REPLICA IDENTITY FULL`. Ao criar um card que lê uma tabela nova, **adicione-a à
  publicação** (`alter publication supabase_realtime add table public.<tabela>;`).

## Tabelas → onde aparecem (cards)
- `tabela_vista_teste` (cadastro de linhas) → busca, Folha de Rosto, Ligações por Empresa/
  Nome/Número, Empresas Regulares, Relatórios.
- `itinerario_teste` (+ `cod_ibge_teste`) → Itinerários, Ligações por Logradouro/Município.
- `qh_intervalo_teste` / `qh_predeterminado_teste` (+ `tab_origem_teste`) → Quadro de
  Horários, Ligações por Terminais.
- `qh_teste` (frota_*) → Frota, Estrutura.
- `tarifa_atual_teste` → Tarifas, Seções por Ligação/Empresa.
- `evento_teste` (+ `evento_empresa_teste`, `evento_linha_teste`) → Histórico, Pesquisa de
  Evento.
- `localidades_teste` → Entre Localidades.

## Como o Realtime funciona no código
- Cada card abre uma "view": `runView({ title, tables:[...], lineFilter, loader })`.
- Um canal assina `postgres_changes` de todas as tabelas (`RT_TABLES`). Quando chega um
  evento de uma tabela que a view aberta usa (`VIEW_TABLES`/`tables`) e bate o filtro de
  linha ativa, o `loader()` (ou `_panelRun` dos painéis de busca) roda de novo, com debounce.
- Atualiza **a tela aberta**. Quem não está com o card aberto vê o dado novo na próxima busca.

## Como fazer mudanças
1. Edite **`index.html`** (todo o código está nele).
2. Faça commit e **push na branch `main`** (é a branch publicada).
3. Se o Netlify estiver conectado ao GitHub (branch `main`, publish `.`), o deploy é
   automático. Senão, gere um zip com `index.html` + `netlify.toml` e suba em
   app.netlify.com/drop.
4. Mudanças de **dados** NÃO exigem deploy — o site lê o Supabase ao vivo. Só mudanças de
   **código** precisam republicar.

## Observações
- **Encoding dos dados**: há acentos corrompidos na origem (ex.: "Niter�i"). É problema da
  importação no banco, não do frontend; só some reimportando os dados em UTF-8.
- Validar sintaxe do JS antes de publicar (extrair o `<script>` inline e rodar
  `node --check`).
- A partir daqui, deploy não pode ser feito pelo ambiente do Claude (a rede de saída
  bloqueia o upload do Netlify); por isso o caminho é GitHub conectado ou zip.
