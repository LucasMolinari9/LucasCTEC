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

// O project ref de cada alvo mora AQUI, no código — não no JSON que este módulo lê. É o que
// impede o arquivo de dados remapear um alvo para outro projeto. `scripts/lib/auditor.mjs`
// importa daqui para não haver duas listas (era uma cópia até 10/08/2026).
export const REFS = { teste: 'gontnlfmothfglssbyyk', producao: 'lwzsxuaqqeoamukduhev' };

// A anon key legada é um JWT cujo payload traz `ref` e `role`. Devolve o payload decodificado, ou
// `null` quando a chave não é um JWT legível — caso das `sb_publishable_...`, para as quais o
// CLAUDE.md prevê migração e que documentadamente não oferecem payload local legível. LIMITE
// CONHECIDO: com chave sem payload legível, o ref e a URL seguem amarrados pelas checagens abaixo,
// mas a CHAVE em si (`ref` e `role` dela) não é conferida.
function payloadDeChave(key) {
  const partes = String(key || '').split('.');
  if (partes.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
  } catch { return null; }
}

function refDeChave(key) {
  const payload = payloadDeChave(key);
  return typeof payload?.ref === 'string' ? payload.ref : null;
}

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
  // As checagens acima olham só PRESENÇA. O que vem abaixo é COERÊNCIA INTERNA: url e key têm de
  // falar do mesmo projeto que o `ref` declarado. Pega a edição pela metade — trocar o ref e
  // esquecer a chave, ou o contrário —, que é o acidente provável.
  //
  // O que este nível deliberadamente NÃO faz é amarrar `teste` ao ref de teste. Isso é invariante
  // do ARQUIVO VERSIONADO, e vive no gate offline (tests/check.js §[2b], `validarAmbientes`), por
  // uma razão de desenho: as bancadas montam um `ambientes.json` FALSO, com ref fictício apontando
  // para 127.0.0.1, e é assim que elas garantem que teste nenhum alcança o Supabase nem em
  // regressão. Amarrar aqui obrigaria as fixtures a carregar ref e URL reais — trocaria uma
  // proteção por outra. Separado assim, as duas valem. (Codex, P1.)
  const host = (() => {
    try { return new URL(escolhido.url).hostname; }
    catch { throw new Error(`Ambiente '${alvo}' com 'url' ilegível: ${escolhido.url}`); }
  })();
  if (host.endsWith('.supabase.co') && host !== `${escolhido.ref}.supabase.co`) {
    throw new Error(`Ambiente '${alvo}': 'url' aponta para '${host}', mas 'ref' diz `
      + `'${escolhido.ref}'. Os dois têm de falar do mesmo projeto.`);
  }
  const refDaChave = refDeChave(escolhido.key);
  if (refDaChave && refDaChave !== escolhido.ref) {
    throw new Error(`Ambiente '${alvo}': 'key' é do projeto '${refDaChave}', mas 'ref' diz `
      + `'${escolhido.ref}'. Os dois têm de falar do mesmo projeto.`);
  }
  // O ROLE do payload, não só o ref: uma `service_role` do MESMO projeto passaria pela checagem
  // acima — ela É uma chave válida daquele projeto — mas ignora RLS. Colada aqui por engano (ex.:
  // copiar a chave errada do painel), ela vira, no papel, "a chave pública" e vaza para todo gate
  // REST que ler scripts/ambientes.json, com a chave mais poderosa que existe. Configuração
  // VERSIONADA só aceita `anon` — nunca `service_role`, mesmo com ref/url corretos (Codex, P1).
  const payload = payloadDeChave(escolhido.key);
  if (payload && payload.role !== 'anon') {
    throw new Error(`Ambiente '${alvo}': 'key' tem role '${payload.role ?? '(ausente)'}' — só `
      + `'anon' é aceito em configuração versionada, mesmo quando 'ref' pertence ao projeto certo. `
      + `Nunca cole uma service_role (ou qualquer role que não seja anon) aqui.`);
  }
  return { alvo, ref: escolhido.ref, url: escolhido.url, key: escolhido.key };
}

// Invariante do ARQUIVO VERSIONADO: cada alvo declara o projeto que lhe pertence. Vive aqui, e é
// chamada pelo gate offline (tests/check.js) contra o `scripts/ambientes.json` de verdade — não
// pelo `resolverAlvo`, para não obrigar as bancadas a usar ref e URL reais nas fixtures.
// Devolve a lista de problemas; vazia significa em ordem.
export function validarAmbientes(config) {
  const problemas = [];
  for (const alvo of ALVOS) {
    const a = config?.[alvo];
    if (!a) { problemas.push(`ambientes.${alvo} ausente`); continue; }
    if (a.ref !== REFS[alvo]) {
      problemas.push(`ambientes.${alvo}.ref = '${a.ref}', esperado '${REFS[alvo]}' — `
        + 'um alvo não pode ser remapeado para outro projeto');
    }
    if (a.url !== `https://${REFS[alvo]}.supabase.co`) {
      problemas.push(`ambientes.${alvo}.url = '${a.url}', esperado 'https://${REFS[alvo]}.supabase.co'`);
    }
    const refChave = refDeChave(a.key);
    if (refChave && refChave !== REFS[alvo]) {
      problemas.push(`ambientes.${alvo}.key é do projeto '${refChave}', esperado '${REFS[alvo]}'`);
    }
    // Mesma amarração de `resolverAlvo`, aqui sobre o ARQUIVO VERSIONADO: só `anon` é aceito.
    // service_role do projeto CERTO passaria pelo `refChave` acima — é chave válida daquele
    // projeto — e só esta checagem de role a reprova.
    const payloadChave = payloadDeChave(a.key);
    if (payloadChave && payloadChave.role !== 'anon') {
      problemas.push(`ambientes.${alvo}.key tem role '${payloadChave.role ?? '(ausente)'}', esperado 'anon'`);
    }
  }
  return problemas;
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
