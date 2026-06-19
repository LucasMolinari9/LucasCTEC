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
- O **html2pdf** (CDN jsDelivr) gera o PDF do documento aberto (botão **PDF** na barra do modal,
  ao lado de Imprimir; com fallback para `window.print()`).
- `netlify.toml` define os cabeçalhos de segurança (CSP etc.), `Cache-Control: must-revalidate`
  e `publish = "."`.

## Supabase
- Projeto: **`bd_teste`** · ref **`lwzsxuaqqeoamukduhev`** · região sa-east-1.
- `SB_URL` e `SB_KEY` ficam no topo do `<script>` em `index.html`. A chave é a **anon
  (publishable)** — pública por design; a segurança vem do **RLS**.
- **RLS / segurança (LER COM ATENÇÃO — não dá pra confiar só no "é só leitura"):**
  - Todas as tabelas têm RLS ligado. Cada tabela de consulta tem policy `anon_read_*` (SELECT) para `anon`.
  - **ATENÇÃO 1 — grants perigosos:** a role `anon` recebeu GRANT de **INSERT/UPDATE/DELETE em todas as
    tabelas** do schema `public` (idem `authenticated`). Hoje o `anon` **não escreve** só porque não há
    policy de escrita pra ele (RLS sem policy = negado). **Isso é proteção de camada única:** se o RLS de
    uma tabela for desligado por engano, os grants tornam os dados **publicamente apagáveis na hora**.
    Os grants de escrita do `anon` deveriam ser **revogados** (`REVOKE INSERT,UPDATE,DELETE ... FROM anon`).
    **NUNCA desligar RLS de uma tabela** enquanto esses grants existirem.
  - **ATENÇÃO 2 — escrita total p/ `authenticated`:** existem policies `auth_all_*` (comando ALL,
    `USING(true) WITH CHECK(true)`) em todas as tabelas. Logo, **qualquer usuário logado pode alterar/APAGAR
    tudo**. Isso só é seguro porque o **signup do Auth deve ficar FECHADO** (Dashboard → Authentication →
    Sign In/Providers → "Allow new users to sign up" = OFF). Há 1 usuário no Auth (o do dono). **Manter o
    signup fechado é o item nº1 de segurança.**
  - **Como o dono alimenta:** direto pelo **painel do Supabase** (service role, ignora RLS) — esse é o fluxo
    real. Existe também um frontend logado (`authenticated`) que o dono **não usa** para alimentar; por isso
    as policies `auth_all_*` estão dormentes no fluxo do dia a dia.
  - **Nunca** adicionar política de INSERT/UPDATE/DELETE para `anon`.
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

## Publicação (Vercel) e atualização automática
- **Host oficial: Vercel.** A migração veio do Netlify, que **ficou sem créditos de build**
  (plano Free) e parou de publicar — deploys ficavam pausados. O Vercel serve o site estático
  sem esse limite. A ligação com o Supabase **não muda** com a troca de host (toda a comunicação
  REST/Realtime é client-side, via `SB_URL`/`SB_KEY` no `index.html`; o host só serve o arquivo).
- **Config do Vercel:** `vercel.json` (na raiz) replica os cabeçalhos de segurança que antes
  viviam no `netlify.toml` — em especial a **CSP**, cujo `connect-src` **autoriza** o navegador a
  falar com `lwzsxuaqqeoamukduhev.supabase.co` (REST) e `wss://…` (Realtime). Mexeu na CSP do
  `vercel.json`? Replique a mesma mudança no `netlify.toml` (mantido só como fallback).
- **Auto-deploy:** conectar o repo GitHub `LucasMolinari9/LucasCTEC` ao projeto Vercel pelo
  **dashboard** (OAuth GitHub, ação única) → **push na `main` = deploy automático**, igual era no
  Netlify. Sem essa conexão, publica-se rodando o MCP `deploy_to_vercel` (deploya o diretório atual)
  após o push.
- **Atualização automática para todos os usuários** (sem limpar cache):
  1. `Cache-Control: public, max-age=0, must-revalidate` (no `vercel.json`) → cada visita revalida.
  2. Detector de versão no JS (`checarNovaVersao`): compara o **ETag** do `index.html` a cada
     ~3 min e ao focar a aba; se mudou, recarrega sozinho (espera fechar o modal aberto). O Vercel
     devolve ETag em `HEAD /index.html`, então o detector continua funcionando.
- **Carimbo de versão** no rodapé (`#verTag`, ex.: `build 19/06-A`). Ao publicar algo que o
  usuário precisa confirmar, **incremente esse texto** — serve para checar qual versão está no ar.
- O `npx netlify deploy`/`vercel` CLI **não** funciona pelo ambiente do Claude (rede de saída
  bloqueia upload e `WebFetch`/`curl` ao site/Supabase). Os caminhos são: **push na `main`**
  (se o auto-deploy git estiver conectado) ou o MCP **`deploy_to_vercel`**.

## Como fazer mudanças
1. Edite **`index.html`** (todo o código está nele). Trabalhe na branch **`main`** (é a publicada).
2. Valide a sintaxe do JS antes de publicar (extrair o `<script>` inline e rodar `node --check`).
3. Commit e **push na `main`** → se o auto-deploy git do Vercel estiver conectado, republica sozinho;
   senão, rode o MCP `deploy_to_vercel`. As telas dos usuários se atualizam (via detector de versão).
   Bumpe o carimbo de versão se quiser confirmar a chegada.
4. Mudanças de **dados** NÃO exigem deploy — o site lê o Supabase ao vivo.

## Armadilhas / observações
- **CSS — dropdown da busca:** o dropdown de resultados é inserido **dentro de `.selector`**.
  A regra do botão verde usa **`.selector > button`** (filho direto) de propósito — **não** use
  `.selector button`, senão os `<button>` dos resultados herdam o fundo verde do "Abrir linha".
- **Encoding dos dados**: há acentos corrompidos na origem (ex.: "Niter�i"). É problema da
  importação no banco (caractere U+FFFD, irrecuperável pelo banco); só some reimportando os
  dados em UTF-8 no Supabase.
- **Estética:** topo navy + faixa verde fina (identidade DETRO/DIVAT); banner da linha em navy
  com faixa verde inferior. Manter esse idioma visual ao criar telas novas.
- **Banco sem PK/índices (escalabilidade):** ~14 tabelas estão **sem chave primária e sem índice**, sendo
  `itinerario_teste` a maior (~52k linhas). O front faz `ilike`/`eq`/`in.()` com `limit` alto (até 30000)
  sobre elas → hoje são **varreduras completas**. Funciona porque o volume é pequeno; ao crescer, fica lento.
  Antes de criar telas que filtram tabelas grandes, **criar índices** nas colunas filtradas (codlinha,
  cod_origem, nome_logradouro, codempresa). Considerar `pg_trgm`+GIN para as buscas `ilike`.
- **SEM BACKUP (risco máximo):** o projeto **não tem backup/PITR confirmado**. O git versiona só o CÓDIGO,
  nunca os DADOS. **Não rodar nada destrutivo no banco (DROP/DELETE/TRUNCATE/REVOKE/migração)** sem antes
  ligar backup (Dashboard → Database → Backups).
- **Truncagem silenciosa:** vários loaders cortam resultados com `limit` e `slice(0,N)` **sem avisar**.
  Ao crescer os dados, o portal pode mostrar listas incompletas sem erro visível. Ao mexer numa view,
  considerar avisar o usuário quando o limite for atingido.
- **Dependências CDN sem trava:** `@supabase/supabase-js@2` (qualquer 2.x) e html2pdf vêm da jsDelivr **sem
  versão fixa nem SRI** (`integrity`). Ideal fixar versão exata + SRI (hash) ou fazer vendoring — mas só com
  o hash REAL verificado, pois SRI errado **quebra o carregamento** do site.
- **`sbFetch` tem timeout (20s) + retry** (backoff) para erros transitórios; erros definitivos (4xx) não
  repetem. Não remover isso ao refatorar.
