// prazos.mjs — núcleo do gate de prazo. Puro: sem rede, sem process.exit, sem console.
//
// Por que existe: neste repositório, o que cabe num `git push` acontece e o que depende de
// lembrar não acontece. Um compromisso com data (rotação de credencial, remoção de caminho
// temporário, revisão trimestral) só é real se um gate o cobrar ANTES do vencimento, num canal
// que já se lê. Ver docs/superpowers/specs/2026-08-04-fase3-diagnosticos-anonimos-design.md §6.

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

const ehData = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

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
  const aviso = Number.isInteger(prazo.aviso_dias) ? prazo.aviso_dias : 30;
  const erro = Number.isInteger(prazo.erro_dias) ? prazo.erro_dias : 7;

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
