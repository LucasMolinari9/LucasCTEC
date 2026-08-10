// prazos.mjs — núcleo do gate de prazo. Puro: sem rede, sem process.exit, sem console.
//
// Por que existe: neste repositório, o que cabe num `git push` acontece e o que depende de
// lembrar não acontece. Um compromisso com data (rotação de credencial, remoção de caminho
// temporário, revisão trimestral) só é real se um gate o cobrar ANTES do vencimento, num canal
// que já se lê. Ver docs/planos/2026-08-04-fase3-diagnosticos-anonimos-design.md §6.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIA_MS = 86400000;

// Data de hoje em AAAA-MM-DD. `DIVAT_HOJE` existe para que teste e bancada sejam
// determinísticos — sem isso, um caso que passa hoje falha em novembro.
export function hojeISO() {
  const bruto = process.env.DIVAT_HOJE;
  if (bruto && /^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  return new Date().toISOString().slice(0, 10);
}

// A ida-e-volta NÃO é redundante com o `Date.parse`. Data de calendário impossível mas de forma
// válida — `2026-02-30`, `2026-04-31` — não vira NaN: o `Date` NORMALIZA para o dia seguinte ao
// fim do mês (02/03, 01/05). Sem conferir a volta, um erro de digitação no prazos.json passa como
// prazo legítimo e desloca a cobrança em dias, dizendo "60 dias de folga" para uma data que não
// existe. O regex sozinho não pega: a forma está certa, o calendário é que não. (Codex, P2.)
const ehData = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

// Dias inteiros de `hoje` até `vence_em`. Ambos em UTC para não escorregar por fuso.
function diasAte(vence_em, hoje) {
  return Math.round((Date.parse(`${vence_em}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / DIA_MS);
}

// FAIL-CLOSED: data ilegível vira `erro`, nunca `ok`. Um prazo que o gate não consegue ler é
// exatamente o caso em que ele não pode dizer "está tudo bem".
export function classificar(prazo, hoje) {
  const id = prazo?.id ?? '(sem id)';
  if (!ehData(prazo?.vence_em)) {
    return { id, dias: NaN, nivel: 'erro',
      mensagem: `${id}: 'vence_em' ausente ou ilegível (${JSON.stringify(prazo?.vence_em)}) — corrija scripts/prazos.json` };
  }
  if (!ehData(hoje)) {
    return { id, dias: NaN, nivel: 'erro', mensagem: `${id}: data de referência ilegível (${hoje})` };
  }
  const dias = diasAte(prazo.vence_em, hoje);
  // FAIL-CLOSED também aqui, não só em lerPrazos: um `aviso_dias`/`erro_dias` NEGATIVO empurra a
  // cobrança para DEPOIS do vencimento real (com erro_dias=-1, o gate só fica vermelho um dia
  // depois de vencido) — e classificar() é chamado de fora com objetos que podem não ter passado
  // por lerPrazos (defesa em profundidade, não redundância). Ausência do campo continua usando o
  // default (30/7); presente e INVÁLIDO (não-inteiro ou negativo) vira `erro`, nunca o default
  // silencioso — que era exatamente o caminho por onde `erro_dias:'0'` (string) escapava antes de
  // lerPrazos ganhar a checagem de tipo (Codex, P2).
  const limite = (valor, nome, def) => {
    if (valor === undefined) return { ok: true, valor: def };
    if (!Number.isInteger(valor) || valor < 0) {
      return { ok: false, mensagem: `${id}: '${nome}' precisa ser inteiro não-negativo (veio ${JSON.stringify(valor)}) — corrija scripts/prazos.json` };
    }
    return { ok: true, valor };
  };
  const rAviso = limite(prazo.aviso_dias, 'aviso_dias', 30);
  if (!rAviso.ok) return { id, dias: NaN, nivel: 'erro', mensagem: rAviso.mensagem };
  const rErro = limite(prazo.erro_dias, 'erro_dias', 7);
  if (!rErro.ok) return { id, dias: NaN, nivel: 'erro', mensagem: rErro.mensagem };
  const aviso = rAviso.valor;
  const erro = rErro.valor;

  if (dias <= erro) {
    return { id, dias, nivel: 'erro',
      mensagem: dias < 0
        ? `${id}: VENCEU há ${-dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}`
        : `${id}: vence em ${dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}` };
  }
  if (dias <= aviso) {
    return { id, dias, nivel: 'aviso',
      mensagem: `${id}: vence em ${dias} dia(s) (${prazo.vence_em}) — ${prazo.descricao}. Ver ${prazo.referencia}` };
  }
  return { id, dias, nivel: 'ok', mensagem: `${id}: ${dias} dia(s) de folga` };
}

const CAMPOS = ['id', 'descricao', 'vence_em', 'aviso_dias', 'erro_dias', 'referencia'];
const CAMPOS_TEXTO = ['id', 'descricao', 'vence_em', 'referencia'];
const CAMPOS_INTEIRO = ['aviso_dias', 'erro_dias'];

export async function lerPrazos(root) {
  const caminho = join(root, 'scripts', 'prazos.json');
  let bruto;
  try {
    bruto = JSON.parse(await readFile(caminho, 'utf8'));
  } catch (e) {
    throw new Error(`Não consegui ler ${caminho}: ${e.message}`);
  }
  if (!Array.isArray(bruto?.prazos)) {
    throw new Error(`${caminho} não tem a lista 'prazos' — abortando em vez de assumir vazio.`);
  }
  for (const p of bruto.prazos) {
    for (const c of CAMPOS) {
      if (p?.[c] === undefined) throw new Error(`Prazo '${p?.id ?? '?'}' sem o campo '${c}' em ${caminho}`);
    }
    // Presença não basta: 'erro_dias':'0' (string) passaria pela checagem acima, cairia no
    // default silencioso do classificar() (Number.isInteger('0') é falso) e o gate quebraria
    // no dia ERRADO, sem erro nenhum. lerPrazos promete lançar em item inválido — cumpra.
    for (const c of CAMPOS_TEXTO) {
      if (typeof p[c] !== 'string') {
        throw new Error(`Prazo '${p.id ?? '?'}' campo '${c}' devia ser string, veio ${typeof p[c]} (${JSON.stringify(p[c])}) em ${caminho}`);
      }
    }
    for (const c of CAMPOS_INTEIRO) {
      if (!Number.isInteger(p[c])) {
        throw new Error(`Prazo '${p.id ?? '?'}' campo '${c}' devia ser inteiro, veio ${typeof p[c]} (${JSON.stringify(p[c])}) em ${caminho}`);
      }
      // Negativo é o mesmo defeito do `erro_dias:'0'` (string) que motivou a checagem de tipo
      // acima, só que passa por ELA: é um inteiro de verdade. Com `erro_dias: -1`, `dias <= erro`
      // só fica verdadeiro um dia DEPOIS do vencimento — o gate concede um dia de graça exatamente
      // no dia em que prometeu ficar vermelho (Codex, P2). Fail-closed: rejeita aqui, não deixa
      // classificar() decidir sozinho (defesa em profundidade — classificar() também rejeita).
      if (p[c] < 0) {
        throw new Error(`Prazo '${p.id ?? '?'}' campo '${c}' não pode ser negativo (veio ${p[c]}) em ${caminho} — negativo adiaria a cobrança para DEPOIS do vencimento.`);
      }
    }
  }
  return bruto.prazos;
}

// Conveniência para quem só precisa de UM prazo (ex.: check_grants.mjs e o seu fallback).
export async function prazoPorId(root, id) {
  const achado = (await lerPrazos(root)).find(p => p.id === id);
  if (!achado) throw new Error(`Prazo '${id}' não existe em scripts/prazos.json`);
  return achado;
}
