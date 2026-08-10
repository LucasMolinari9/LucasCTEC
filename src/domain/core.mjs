// Regras puras compartilhadas pelo navegador e pelos testes.
// Este módulo não acessa DOM, rede, storage ou estado global.

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
export const orDash = v => (v===null||v===undefined||v==='') ? '—' : v;
export const fmtLineName = nome => nome ? esc(nome).split(' - ').map(p => p.replace(/ /g, '&nbsp;')).join(' - ') : '—';
export const boolChip = (v,label) => v ? `<span class="chip chip-on">${label}</span>` : '';
export const situacaoHTML = r => r.cancelado ? '<span class="chip chip-on">Cancelada</span>'
  : r.paralisado ? '<span class="chip chip-on">Paralisada</span>'
  : '<span class="chip chip-off">Ativa</span>';
export const isLinhaAtiva = r => !r.cancelado && !r.paralisado;
export const isVigente = r => isLinhaAtiva(r) && !r.sub_judice && !r.transferido;
