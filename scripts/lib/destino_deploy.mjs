// destino_deploy.mjs — a quem o smoke de deploy pode falar, e a quem pode entregar o segredo
// de bypass da Vercel.
//
// Achado SEC-03 (auditoria de 26/08/2026): `scripts/check_deploy.mjs` mandava
// `x-vercel-protection-bypass` em toda requisição validando apenas `https:`, e seguia redirect.
// A URL vem do `inputs.url` do `workflow_dispatch` e do `environment_url` do
// `deployment_status` — nenhum dos dois é constante do repositório.
//
// A allowlist não pode sair do `HOSTS_PROD` baixado do alvo: no momento da primeira requisição
// ele ainda não foi lido, e perguntar ao alvo se pode falar com o alvo é circular. As duas
// fontes confiáveis são o `app.js` LOCAL (que veio do checkout) e o domínio da Vercel — que é
// para onde um segredo DA VERCEL pode ir.
//
// Testes: tests/destino_deploy.test.mjs (roda no tests/check.js).

const DOMINIO_VERCEL = '.vercel.app';

/* Lê a allowlist de produção do FONTE do app.js (o local, não o publicado).
 * Devolve [] quando não encontra: lista vazia só restringe (sobra o domínio da Vercel), enquanto
 * inventar um host abriria destino. */
export function hostsProdDe(fonteAppJs) {
  const m = String(fonteAppJs).match(/const HOSTS_PROD\s*=\s*\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1].toLowerCase());
}

/* Valida o alvo do smoke ANTES de qualquer requisição sair.
 *
 * O casamento com a Vercel é por SUFIXO COM PONTO (`.vercel.app`), o que recusa os dois enganos
 * clássicos de uma vez: `vercel.app.evil.com` (não termina com o sufixo) e `naovercel.app`
 * (termina com `vercel.app`, mas sem o ponto — seria aceito por um `endsWith('vercel.app')`).
 *
 * Devolve a URL já normalizada em `/`: path e query do alvo não interessam ao smoke, e não
 * carregam nada para o outro lado. */
export function validarDestinoDeploy(rawUrl, { hostsProd = [] } = {}) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw new Error(`destino não é uma URL válida: ${rawUrl}`); }
  if (u.protocol !== 'https:') throw new Error(`Deploy precisa usar HTTPS: ${u.href}`);

  const host = u.hostname.toLowerCase();
  const permitido = hostsProd.map(h => h.toLowerCase()).includes(host)
    || host.endsWith(DOMINIO_VERCEL);
  if (!permitido) {
    throw new Error(
      `${host} não é um destino de deploy conhecido (esperado *${DOMINIO_VERCEL} ou um host de HOSTS_PROD); `
      + 'nenhuma requisição foi feita e o segredo de bypass não saiu da máquina',
    );
  }

  u.pathname = '/';
  u.search = '';
  u.hash = '';
  return u;
}
