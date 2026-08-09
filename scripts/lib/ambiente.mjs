// ambiente.mjs — de qual banco um gate fala. Puro no núcleo, sem rede.
//
// Nasce da issue #74: até 04/08/2026 check_deriva, check_realtime, check_data_quality e
// check_grants derivavam SB_URL/SB_KEY dos literais do app.js — que são de PRODUÇÃO. Uma edição
// no frontend redirecionava um gate, e um gate de PR podia falar com produção sem ninguém pedir.
//
// Agora o alvo é configuração explícita, decidida pelo GATILHO do workflow:
//   pull_request / push        → DIVAT_ALVO=teste     (requisito da #74)
//   schedule (cron) / dispatch → DIVAT_ALVO=producao  (o monitoramento)
//
// NÃO existe default. Ausência de DIVAT_ALVO é erro, porque um default silencioso é exatamente
// como um gate de PR acaba falando com produção. Ver docs/planos/
// 2026-08-04-fase3-diagnosticos-anonimos-design.md § 3.3.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ALVOS = ['teste', 'producao'];

// Sem normalização de caixa de propósito: 'PRODUCAO' num workflow é quase sempre um engano de
// quem escreveu o YAML, e aceitar em silêncio esconde o engano.
export function resolverAlvo(config, env) {
  const alvo = env?.DIVAT_ALVO;
  if (!alvo) {
    throw new Error(
      'DIVAT_ALVO não definido. Todo gate de banco precisa dizer explicitamente de qual banco fala: '
      + `'teste' em PR/push, 'producao' no cron. Não há default (issue #74).`);
  }
  if (!ALVOS.includes(alvo)) {
    throw new Error(`DIVAT_ALVO='${alvo}' desconhecido. Valores aceitos: ${ALVOS.join(', ')}.`);
  }
  const escolhido = config?.[alvo];
  if (!escolhido) throw new Error(`scripts/ambientes.json não descreve o ambiente '${alvo}'.`);
  for (const campo of ['ref', 'url', 'key']) {
    if (typeof escolhido[campo] !== 'string' || !escolhido[campo]) {
      throw new Error(`Ambiente '${alvo}' sem o campo '${campo}' em scripts/ambientes.json.`);
    }
  }
  return { alvo, ref: escolhido.ref, url: escolhido.url, key: escolhido.key };
}

export async function carregarAmbiente(root, env = process.env) {
  const caminho = join(root, 'scripts', 'ambientes.json');
  let config;
  try {
    config = JSON.parse(await readFile(caminho, 'utf8'));
  } catch (e) {
    throw new Error(`Não consegui ler ${caminho}: ${e.message}`);
  }
  return resolverAlvo(config.ambientes, env);
}
