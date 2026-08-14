// Agregação, ordenação e filtros de CONJUNTO — as regras que respondem "como estes registros
// se agrupam, se ordenam e quais deles ficam". Compartilhadas pelo navegador e pelos testes.
// Como o core.mjs, este módulo não acessa DOM, rede, storage ou estado global: recebe as linhas
// já buscadas e devolve estrutura nova, sem mutar a lista de entrada.
import { norm } from './core.mjs';

// --- primitivas de agrupamento (usadas por quase todo relatório) ---
export function groupBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); if(!m.has(k))m.set(k,[]); m.get(k).push(x); } return m; }
export function countBy(arr, keyFn){ const m=new Map(); for(const x of arr){ const k=keyFn(x); m.set(k,(m.get(k)||0)+1); } return m; }
export function fmtMoney(v){ if(v===null||v===undefined||v==='') return '—'; const n=Number(v); return isNaN(n)?String(v):n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

// --- ordenações ---
// ordenação padrão de qualquer listagem de linhas: pelo código da ligação (codlinha),
// natural/numérico (108-003 antes de 108-029). Usado em toda exibição de várias linhas.
export const byCodlinha = (a, b) => String(a.codlinha||'').localeCompare(String(b.codlinha||''), undefined, { numeric:true });
// ordena grupos de empresa pelo RJ (codempresa) numérico; sem código vai pro fim
export function rjOrder(a, b){
  const na=parseInt(a,10), nb=parseInt(b,10);
  if(isNaN(na)&&isNaN(nb)) return String(a).localeCompare(String(b));
  if(isNaN(na)) return 1; if(isNaN(nb)) return -1;
  return na-nb;
}

/* --- desempate do cadastro de empresas ---
   Alguns RJ aparecem DUPLICADOS no cadastro (o caso conhecido é o 103). Estas duas funções
   decidem qual das entradas o portal exibe: score 2 = REGULAR e não-cassada, 1 = não-cassada,
   0 = cassada; vence o maior, e EMPATE MANTÉM A PRIMEIRA VISTA (a comparação é `>`, não `>=`).
   É definição ÚNICA de propósito. Até 08/08/2026 a mesma regra estava escrita duas vezes — no
   getEmpresas e no LOADERS.empresasRegulares — e mudar uma sem a outra faria a razão social do
   BANNER discordar da linha do CARD, para o mesmo RJ, na mesma tela e sem erro nenhum (issue
   #111). Heurística de desempate quebra em silêncio: por isso tem teste em tests/pure.test.js. */
export function scoreEmpresa(e){
  if (!e || e.cassada) return 0;
  return String(e.situacao||'').toUpperCase()==='REGULAR' ? 2 : 1;
}
/* Uma entrada por codempresa. Devolve as linhas VENCEDORAS, sem mutar a lista recebida.
   `hasOwnProperty` em vez de `in`: com `in`, um codempresa que colidisse com nome herdado de
   Object.prototype ('constructor') pareceria "já visto" e a empresa sumiria da lista. */
export function dedupEmpresasPorRJ(lista){
  const best = {};
  (lista||[]).forEach(e => {
    const k = e && e.codempresa;
    if (k == null) return;
    if (!Object.prototype.hasOwnProperty.call(best, k) || scoreEmpresa(e) > scoreEmpresa(best[k])) best[k] = e;
  });
  return Object.values(best);
}

// --- recortes por município (cards de Localidade / Município) ---
// classifica linhas por município (dentro × intermunicipal) a partir das linhas de
// itinerário (codlinha, cod_municipio_origem). "dentro" = todos os trechos no próprio município (M);
// "inter" = tem ao menos um trecho em OUTRO município (cod_municipio_origem não-vazio e != M).
export function classifyMunLines(itRows, codibge){
  const M = String(codibge);
  const bySet = new Map();                       // codlinha(String) → Set de cod_municipio_origem (não vazios)
  for(const r of itRows){
    if(r.codlinha==null || r.codlinha==='') continue;
    const cl = String(r.codlinha);
    let s = bySet.get(cl); if(!s){ s = new Set(); bySet.set(cl, s); }
    const co = r.cod_municipio_origem==null ? '' : String(r.cod_municipio_origem);
    if(co) s.add(co);
  }
  const dentro = new Set(), inter = new Set();
  for(const [cl, s] of bySet){
    let outro = false;
    for(const co of s){ if(co !== M){ outro = true; break; } }
    (outro ? inter : dentro).add(cl);
  }
  return { dentro, inter };
}
// terminais de um município, agrupando grafias que só diferem em acento/caixa e escolhendo a
// mais frequente como nome exibido; nLinhas conta codlinha DISTINTO.
export function terminaisDoMunicipio(itRows, codibge){
  const grupos = new Map();
  for(const r of itRows){
    if(String(r.cod_municipio_origem) !== String(codibge)) continue;
    const nome = r.nome_logradouro==null ? '' : String(r.nome_logradouro).trim();
    if(!nome) continue;
    const chave = norm(nome);
    let grupo = grupos.get(chave);
    if(!grupo){ grupo = { grafias:new Map(), linhas:new Set() }; grupos.set(chave, grupo); }
    grupo.grafias.set(nome, (grupo.grafias.get(nome)||0)+1);
    if(r.codlinha!=null && r.codlinha!=='') grupo.linhas.add(String(r.codlinha));
  }
  return [...grupos.values()].map(grupo=>{
    let nome = '', maior = 0;
    for(const [grafia, total] of grupo.grafias){
      if(total>maior){ nome=grafia; maior=total; }
    }
    return { nome, nLinhas:grupo.linhas.size };
  }).sort((a,b)=>a.nome.localeCompare(b.nome));
}

// --- frota ---
// Agregação da Frota por Empresa: total geral + quebra por empresa e por hierarquia.
// num() trata vazio/inválido como 0; empresas ficam em RJ numérico crescente.
export function resumoFrota(rows){
  const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
  const sum = (arr,f) => arr.reduce((s,r)=>s+num(r[f]),0);
  return {
    totOp: sum(rows,'frota_operacional'),
    totRes: sum(rows,'reserva'),
    porEmp: [...groupBy(rows, r=>r.codempresa||'—')]
      .map(([cod,rs])=>({cod, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>rjOrder(a.cod,b.cod)),
    porHier: [...groupBy(rows, r=>r.hierarquia||'—')]
      .map(([h,rs])=>({h, n:rs.length, op:sum(rs,'frota_operacional'), res:sum(rs,'reserva')}))
      .sort((a,b)=>b.op-a.op),
  };
}
// Filtro da tabela de frota. REGULAR = ativa; CANCELADO = cancelada; os demais estados
// aparecem apenas em "Todas". A busca única casa nome normalizado ou trecho do RJ.
export function filtrarFrotaEmpresas(items, status='ativas', termo=''){
  const raw = String(termo||'').trim(), q = norm(raw);
  return (items||[]).filter(e=>{
    const situacao = norm(e.situacao||'');
    if(status==='ativas' && situacao!=='regular') return false;
    if(status==='canceladas' && situacao!=='cancelado') return false;
    if(q && !(norm(e.nome_empresa||'').includes(q) || String(e.cod||'').includes(raw))) return false;
    return true;
  });
}
