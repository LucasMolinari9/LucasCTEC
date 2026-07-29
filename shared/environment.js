/* Módulo compartilhado sem etapa de build: navegador (DIVAT.environment) e Node (CommonJS). */
(function(root, factory){
  'use strict';
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  const namespace = root.DIVAT || (root.DIVAT = {});
  namespace.environment = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  function selecionarSupabase(hostname, config){
    const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
    const hostsProd = (config.hostsProd || []).map(h => String(h).trim().toLowerCase().replace(/\.$/, ''));
    const producao = hostsProd.includes(host);
    const alvo = producao
      ? { url: config.prodUrl,  key: config.prodKey,  ambiente: 'producao' }
      : { url: config.testeUrl, key: config.testeKey, ambiente: 'teste' };
    if (!alvo.url || !alvo.key) {
      throw new Error(`Configuração Supabase ausente para o ambiente de ${alvo.ambiente}.`);
    }
    return Object.freeze({ ...alvo, hostname: host });
  }

  return Object.freeze({ selecionarSupabase });
});
