// Regras puras e primitivas compartilhadas pelo navegador e pelos testes.
// Este módulo não acessa DOM, rede, storage ou estado global. A única que sai da pureza estrita
// é `debounce` (no fim do arquivo), que agenda um timer — está aqui, e não numa camada acima,
// porque é primitiva de composição como `esc`/`norm`, e tanto o app.js quanto `src/ui/` a usam.

export function fmtCode(code) {
  if (!code) return '';
  const s = String(code);
  return s.length === 9 ? `${s.slice(0,3)}-${s.slice(3,6)}-${s.slice(6)}` : s;
}

export function fmtTime(t){ if(!t) return '—'; const m=String(t).match(/^(\d{2}):(\d{2})/); return m?`${m[1]}:${m[2]}`:t; }
export function fmtDate(d){ if(!d) return '—'; const m=String(d).match(/^(\d{4})-(\d{2})-(\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]}`:d; }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export const enc = s => encodeURIComponent(s);
export const ilikeTerm = s => enc(String(s ?? '').replace(/[()*]/g, ' '));
// Normaliza acento/caixa para comparação de texto ("São Gonçalo" → "sao goncalo"). Mora aqui,
// junto de esc/enc/ilikeTerm, por ser primitiva de string: os módulos de domínio dependem dela
// (agrupamento.mjs a usa em terminaisDoMunicipio/filtrarFrotaEmpresas), e duplicá-la em cada um
// recriaria a divergência silenciosa que a extração existe para acabar.
export const norm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
export const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
export const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
export const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
export const situacaoHTML = r => r.cancelado ? '<span class="chip chip-on">Cancelada</span>'
  : r.paralisado ? '<span class="chip chip-on">Paralisada</span>'
  : '<span class="chip chip-off">Ativa</span>';
export const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
export const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;

// Agrupa uma rajada de eventos numa chamada só (digitar no campo de busca, filtrar o histórico).
// Dois consumidores independentes: o app.js (busca do topo, filtros dos painéis) e o paginador
// de eventos em `src/ui/paginacao.mjs`. Uma cópia local em cada um recriaria a divergência
// silenciosa que este módulo existe para acabar — daí morar aqui e não em nenhum dos dois.
export function debounce(fn, ms=150){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
