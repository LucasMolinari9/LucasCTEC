// Regras puras da BUSCA — como um termo digitado vira filtro, e quais registros um filtro casa.
// Duas famílias convivem aqui: o filtro do histórico de eventos, aplicado no cliente sobre linhas
// já buscadas (`yearOf`/`matchEvent`), e a preparação do termo que vai ao servidor
// (`localidadesQueCasam`/`orIlike`/`municipiosExatos`), que monta o `or=()` do PostgREST.
// Como o core.mjs e o agrupamento.mjs, este módulo não acessa DOM, rede, storage ou estado
// global: recebe o termo e os dados já buscados, e devolve string ou lista nova.
// O I/O fica de fora de propósito — `termosLocalidade` continua no app.js porque faz
// `await getLocalidades()`; é ela que importa o `localidadesQueCasam` daqui, não o contrário.
import { norm, ilikeTerm } from './core.mjs';

// --- filtro do histórico de eventos (sobre linhas já carregadas) ---
export const yearOf = d => d ? parseInt(String(d).slice(0,4),10) : null;
// Critérios já vêm normalizados por quem lê o formulário (o `readCriteria` do app.js), por isso
// `c.text`/`c.proc` são comparados direto contra `norm(...)` — normalizar aqui de novo esconderia
// um chamador que esqueceu de normalizar, e o filtro passaria a não casar nada em silêncio.
export function matchEvent(r, c){
  if (c.text && !norm((r.descricao||'')+' '+(r.observacao||'')).includes(c.text)) return false;
  if (c.proc && !norm(r.numero_processo||'').includes(c.proc)) return false;
  if (c.ano!=null){
    // usa o ano do Registro (campo que ordena); sem registro, cai p/ a publicação
    const reg = yearOf(r.data_registro);
    const y = reg!=null ? reg : yearOf(r.data_publicacao);
    if (y !== c.ano) return false;
  }
  return true;
}

// --- preparação do termo de busca que vai ao servidor ---
// nomes canônicos da lista de localidades que casam o termo (insensível a acento/caixa) —
// permite digitar "sao goncalo" e buscar no servidor por "SÃO GONÇALO" (o ilike do PostgREST
// NÃO ignora acento)
export function localidadesQueCasam(lista, term){
  const nt = norm(term);
  return nt ? lista.filter(n => norm(n).includes(nt)).slice(0, 5) : [];
}
// filtro or=() do PostgREST: cada coluna ilike cada termo
export const orIlike = (cols, termos) => 'or=(' + termos.map(t => { const e = ilikeTerm(t); return cols.map(c => `${c}.ilike.*${e}*`).join(','); }).join(',') + ')';
// cod_ibge cujo nome de município é EXATAMENTE um dos termos (insens. a acento/caixa) —
// exato de propósito: "rio" não pode puxar Rio de Janeiro/Rio Bonito/Rio Claro inteiros
export function municipiosExatos(ibge, termos){
  const nts = new Set(termos.map(norm).filter(Boolean));
  return Object.entries(ibge).filter(([,v])=>nts.has(norm(v.nome))).map(([c])=>c);
}
