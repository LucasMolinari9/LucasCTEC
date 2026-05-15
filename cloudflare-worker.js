// ────────────────────────────────────────────────────────────────
// ORION — Proxy CORS para a API da NVIDIA (Cloudflare Worker)
//
// Por quê: a API da NVIDIA (integrate.api.nvidia.com) não envia
// cabeçalhos CORS, então o navegador bloqueia chamadas feitas
// diretamente do app — pior ainda quando ele roda como arquivo
// local no celular. Este Worker recebe a chamada do app, repassa
// para a NVIDIA do lado do servidor e devolve com CORS liberado.
//
// Como usar:
//   1. dash.cloudflare.com → Workers & Pages → Create → Create Worker
//   2. Edit code → apague tudo → cole este arquivo → Deploy
//   3. Copie a URL gerada (ex.: https://orion-proxy.SEU.workers.dev)
//   4. Cole essa URL no campo "Endpoint" do app ORION e salve
//
// Opcional (mais seguro): em Settings → Variables, crie a variável
// NVIDIA_API_KEY com sua chave. Assim a chave fica só na Cloudflare
// e nem precisa ser digitada no celular.
// ────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST')
      return new Response('Use POST', { status: 405, headers: cors });

    const auth = env.NVIDIA_API_KEY
      ? 'Bearer ' + env.NVIDIA_API_KEY
      : (request.headers.get('Authorization') || '');

    const upstream = await fetch(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: await request.text()
      }
    );

    const out = await upstream.text();
    return new Response(out, {
      status: upstream.status,
      headers: Object.assign({}, cors, {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json'
      })
    });
  }
};
