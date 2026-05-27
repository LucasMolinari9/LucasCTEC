// ============================================================
//  Detro RJ — Gerenciamento de Linhas de Ônibus
// ============================================================

const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// Estado
let currentUser = null;
let isAdmin = false;
let allLinhas = [];
let currentLinha = null;
let currentSentido = 'ida';
let todosItinerarios = [];
let editingLinhaId = null;
let editingHorarioId = null;
let editingItinId = null;
let editingHistId = null;

// ============================================================
//  Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  registrarEventos();
  verificarSessao();
});

function registrarEventos() {
  // Auth
  $('login-form').addEventListener('submit', aoEntrar);
  $('logout-btn').addEventListener('click', aoSair);
  $('change-pass-btn').addEventListener('click', () => abrirModal('pass-modal'));
  $('pass-cancel').addEventListener('click', () => fecharModal('pass-modal'));
  $('pass-form').addEventListener('submit', aoTrocarSenha);

  // Busca e filtros
  $('search-input').addEventListener('input', renderLinhas);
  $('filter-empresa').addEventListener('change', renderLinhas);

  // Nova linha
  $('nova-linha-btn').addEventListener('click', () => abrirLinhaForm(null));
  $('linha-cancel').addEventListener('click', () => fecharModal('linha-modal'));
  $('linha-form').addEventListener('submit', aoSalvarLinha);

  // Detail modal
  $('detail-close').addEventListener('click', () => fecharModal('detail-modal'));
  $('detail-edit-btn').addEventListener('click', () => abrirLinhaForm(currentLinha));
  $('detail-del-btn').addEventListener('click', aoExcluirLinhaAtual);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => mudarTab(btn.dataset.tab));
  });

  // Sentido (ida / volta)
  document.querySelectorAll('.sentido-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sentido-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSentido = btn.dataset.sentido;
      renderItinerarios();
    });
  });

  // Horário
  $('novo-horario-btn').addEventListener('click', () => abrirHorarioForm(null));
  $('horario-cancel').addEventListener('click', () => fecharModal('horario-modal'));
  $('horario-form').addEventListener('submit', aoSalvarHorario);

  // Itinerário
  $('novo-itin-btn').addEventListener('click', () => abrirItinForm(null));
  $('itin-cancel').addEventListener('click', () => fecharModal('itin-modal'));
  $('itin-form').addEventListener('submit', aoSalvarItin);

  // Histórico
  $('novo-hist-btn').addEventListener('click', () => abrirHistForm(null));
  $('hist-cancel').addEventListener('click', () => fecharModal('hist-modal'));
  $('hist-form').addEventListener('submit', aoSalvarHist);

  // Fechar modal ao clicar no overlay
  ['detail-modal', 'linha-modal', 'horario-modal', 'itin-modal', 'hist-modal', 'pass-modal'].forEach(id => {
    $(id).addEventListener('click', (e) => { if (e.target === $(id)) fecharModal(id); });
  });
}

// ============================================================
//  Auth
// ============================================================
async function verificarSessao() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await carregarApp(data.session.user);
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  $('app-view').classList.add('hidden');
  $('login-view').classList.remove('hidden');
}

async function carregarApp(user) {
  currentUser = user;
  $('login-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  $('user-email').textContent = user.email;

  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
  isAdmin = !!(profile && profile.role === 'admin');
  aplicarRole();

  await carregarLinhas();
}

function aplicarRole() {
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !isAdmin);
  });
}

async function aoEntrar(e) {
  e.preventDefault();
  const btn = $('login-btn');
  const erro = $('login-error');
  erro.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const { data, error } = await sb.auth.signInWithPassword({
    email: $('login-email').value.trim(),
    password: $('login-password').value,
  });

  btn.disabled = false;
  btn.textContent = 'Entrar';

  if (error) {
    erro.textContent = 'E-mail ou senha incorretos.';
    erro.classList.remove('hidden');
    return;
  }
  $('login-password').value = '';
  await carregarApp(data.user);
}

async function aoSair() {
  await sb.auth.signOut();
  currentUser = null;
  isAdmin = false;
  allLinhas = [];
  mostrarLogin();
}

async function aoTrocarSenha(e) {
  e.preventDefault();
  const msg = $('pass-msg');
  msg.classList.add('hidden');
  msg.style.color = '';

  const nova = $('new-password').value;
  const conf = $('confirm-password').value;
  if (nova !== conf) {
    msg.textContent = 'As senhas não conferem.';
    msg.classList.remove('hidden');
    return;
  }

  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) {
    msg.textContent = 'Erro ao trocar senha: ' + error.message;
    msg.classList.remove('hidden');
    return;
  }
  msg.style.color = '#1aab40';
  msg.textContent = 'Senha alterada com sucesso!';
  msg.classList.remove('hidden');
  setTimeout(() => {
    fecharModal('pass-modal');
    $('pass-form').reset();
  }, 1200);
}

// ============================================================
//  Modais
// ============================================================
function abrirModal(id) { $(id).classList.remove('hidden'); }
function fecharModal(id) { $(id).classList.add('hidden'); }

// ============================================================
//  Linhas
// ============================================================
async function carregarLinhas() {
  const { data, error } = await sb.from('linhas').select('*').order('numero_linha');
  if (error) { console.error(error); return; }
  allLinhas = data || [];
  popularFiltroEmpresas();
  renderLinhas();
}

function popularFiltroEmpresas() {
  const sel = $('filter-empresa');
  while (sel.options.length > 1) sel.remove(1);
  const empresas = [...new Set(allLinhas.map(l => l.empresa).filter(Boolean))].sort();
  for (const e of empresas) {
    const opt = document.createElement('option');
    opt.value = e;
    opt.textContent = e;
    sel.appendChild(opt);
  }
}

function renderLinhas() {
  const busca = $('search-input').value.trim().toLowerCase();
  const empresa = $('filter-empresa').value;

  const filtradas = allLinhas.filter(l => {
    const okBusca = !busca ||
      (l.numero_linha && l.numero_linha.toLowerCase().includes(busca)) ||
      (l.nome_ligacao && l.nome_ligacao.toLowerCase().includes(busca));
    const okEmpresa = !empresa || l.empresa === empresa;
    return okBusca && okEmpresa;
  });

  const tbody = $('linhas-tbody');
  tbody.innerHTML = '';

  for (const l of filtradas) {
    const tr = document.createElement('tr');
    const acoesHtml = isAdmin
      ? `<td class="col-acao">
           <button class="btn-action btn-edit">Editar</button>
           <button class="btn-action btn-del">Excluir</button>
         </td>`
      : '';

    tr.innerHTML = `
      <td><strong>${esc(l.numero_linha)}</strong></td>
      <td>${esc(l.nome_ligacao)}</td>
      <td>${esc(l.empresa)}</td>
      <td>${esc(l.tipo) || '<span style="color:var(--muted)">—</span>'}</td>
      <td>${l.frota_operacional ?? '<span style="color:var(--muted)">—</span>'}</td>
      <td>${l.tarifa != null ? 'R$ ' + Number(l.tarifa).toFixed(2) : '<span style="color:var(--muted)">—</span>'}</td>
      ${acoesHtml}
    `;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.btn-action')) return;
      abrirDetail(l);
    });

    if (isAdmin) {
      tr.querySelector('.btn-edit').addEventListener('click', () => abrirLinhaForm(l));
      tr.querySelector('.btn-del').addEventListener('click', () => excluirLinha(l.id));
    }

    tbody.appendChild(tr);
  }

  $('linhas-empty').classList.toggle('hidden', filtradas.length > 0);
}

// ---- Detalhe da linha ----
async function abrirDetail(linha) {
  currentLinha = linha;
  currentSentido = 'ida';
  document.querySelectorAll('.sentido-btn').forEach(b => b.classList.toggle('active', b.dataset.sentido === 'ida'));
  $('detail-numero').textContent = 'Linha ' + (linha.numero_linha || '');
  $('detail-nome').textContent = [linha.nome_ligacao, linha.empresa].filter(Boolean).join(' · ');

  mudarTab('horarios');
  abrirModal('detail-modal');
  await Promise.all([carregarHorarios(), carregarItinerarios(), carregarHistorico()]);
}

// ---- Form Nova/Editar Linha ----
function abrirLinhaForm(linha) {
  editingLinhaId = linha ? linha.id : null;
  $('linha-modal-title').textContent = linha ? 'Editar Linha' : 'Nova Linha';
  $('linha-form-error').classList.add('hidden');
  $('f-numero-linha').value = linha?.numero_linha || '';
  $('f-registro').value = linha?.registro || '';
  $('f-codigo-ligacao').value = linha?.codigo_ligacao || '';
  $('f-nome-ligacao').value = linha?.nome_ligacao || '';
  $('f-empresa').value = linha?.empresa || '';
  $('f-tipo').value = linha?.tipo || '';
  $('f-caracteristica').value = linha?.caracteristica || '';
  $('f-via').value = linha?.via || '';
  $('f-hierarquizacao').value = linha?.hierarquizacao || '';
  $('f-frota-operacional').value = linha?.frota_operacional ?? '';
  $('f-frota-reserva').value = linha?.frota_reserva ?? '';
  $('f-tarifa').value = linha?.tarifa ?? '';
  $('f-data-alteracao').value = linha?.data_ultima_alteracao || '';
  abrirModal('linha-modal');
}

async function aoSalvarLinha(e) {
  e.preventDefault();
  const err = $('linha-form-error');
  err.classList.add('hidden');

  const payload = {
    numero_linha: $('f-numero-linha').value.trim(),
    registro: $('f-registro').value.trim() || null,
    codigo_ligacao: $('f-codigo-ligacao').value.trim(),
    nome_ligacao: $('f-nome-ligacao').value.trim(),
    empresa: $('f-empresa').value.trim(),
    tipo: $('f-tipo').value.trim() || null,
    caracteristica: $('f-caracteristica').value.trim() || null,
    via: $('f-via').value.trim() || null,
    hierarquizacao: $('f-hierarquizacao').value.trim() || null,
    frota_operacional: $('f-frota-operacional').value !== '' ? parseInt($('f-frota-operacional').value) : null,
    frota_reserva: $('f-frota-reserva').value !== '' ? parseInt($('f-frota-reserva').value) : null,
    tarifa: $('f-tarifa').value !== '' ? parseFloat($('f-tarifa').value) : null,
    data_ultima_alteracao: $('f-data-alteracao').value || null,
  };

  let error;
  if (editingLinhaId) {
    ({ error } = await sb.from('linhas').update(payload).eq('id', editingLinhaId));
  } else {
    ({ error } = await sb.from('linhas').insert(payload));
  }

  if (error) {
    err.textContent = 'Erro ao salvar: ' + error.message;
    err.classList.remove('hidden');
    return;
  }

  fecharModal('linha-modal');
  await carregarLinhas();

  if (editingLinhaId && currentLinha?.id === editingLinhaId) {
    const atualizada = allLinhas.find(l => l.id === editingLinhaId);
    if (atualizada) {
      currentLinha = atualizada;
      $('detail-numero').textContent = 'Linha ' + (atualizada.numero_linha || '');
      $('detail-nome').textContent = [atualizada.nome_ligacao, atualizada.empresa].filter(Boolean).join(' · ');
    }
  }
}

async function aoExcluirLinhaAtual() {
  if (!currentLinha) return;
  const id = currentLinha.id;
  fecharModal('detail-modal');
  await excluirLinha(id);
}

async function excluirLinha(id) {
  if (!confirm('Excluir esta linha e todos os seus dados (horários, itinerários, histórico)?')) return;
  const { error } = await sb.from('linhas').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarLinhas();
}

// ============================================================
//  Tabs
// ============================================================
function mudarTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['horarios', 'itinerarios', 'historico'].forEach(t => {
    $('tab-' + t).classList.toggle('hidden', t !== tab);
  });
}

// ============================================================
//  Horários
// ============================================================
async function carregarHorarios() {
  if (!currentLinha) return;
  const { data, error } = await sb.from('quadro_horarios')
    .select('*')
    .eq('linha_id', currentLinha.id)
    .order('dia_semana')
    .order('hora_inicio');
  if (error) { console.error(error); return; }
  renderHorarios(data || []);
}

function renderHorarios(horarios) {
  const tbody = $('horarios-tbody');
  tbody.innerHTML = '';
  $('horarios-count').textContent = `${horarios.length} registro(s)`;

  for (const h of horarios) {
    const tr = document.createElement('tr');
    const acoesHtml = isAdmin
      ? `<td class="col-acao">
           <button class="btn-action btn-edit">Editar</button>
           <button class="btn-action btn-del">Excluir</button>
         </td>`
      : '';

    tr.innerHTML = `
      <td>${esc(h.origem)}</td>
      <td>${esc(h.dia_semana)}</td>
      <td>${h.hora_inicio || '—'}</td>
      <td>${h.hora_fim || '—'}</td>
      <td>${h.intervalo_min ?? '—'}</td>
      ${acoesHtml}
    `;

    if (isAdmin) {
      tr.querySelector('.btn-edit').addEventListener('click', () => abrirHorarioForm(h));
      tr.querySelector('.btn-del').addEventListener('click', () => excluirHorario(h.id));
    }
    tbody.appendChild(tr);
  }
  $('horarios-empty').classList.toggle('hidden', horarios.length > 0);
}

function abrirHorarioForm(h) {
  editingHorarioId = h ? h.id : null;
  $('horario-modal-title').textContent = h ? 'Editar Horário' : 'Novo Horário';
  $('horario-form-error').classList.add('hidden');
  $('h-origem').value = h?.origem || '';
  $('h-dia-semana').value = h?.dia_semana || '';
  $('h-hora-inicio').value = h?.hora_inicio?.slice(0, 5) || '';
  $('h-hora-fim').value = h?.hora_fim?.slice(0, 5) || '';
  $('h-intervalo').value = h?.intervalo_min ?? '';
  abrirModal('horario-modal');
}

async function aoSalvarHorario(e) {
  e.preventDefault();
  const err = $('horario-form-error');
  err.classList.add('hidden');

  const payload = {
    linha_id: currentLinha.id,
    origem: $('h-origem').value.trim(),
    dia_semana: $('h-dia-semana').value,
    hora_inicio: $('h-hora-inicio').value,
    hora_fim: $('h-hora-fim').value,
    intervalo_min: parseInt($('h-intervalo').value),
  };

  let error;
  if (editingHorarioId) {
    ({ error } = await sb.from('quadro_horarios').update(payload).eq('id', editingHorarioId));
  } else {
    ({ error } = await sb.from('quadro_horarios').insert(payload));
  }

  if (error) {
    err.textContent = 'Erro ao salvar: ' + error.message;
    err.classList.remove('hidden');
    return;
  }
  fecharModal('horario-modal');
  await carregarHorarios();
}

async function excluirHorario(id) {
  if (!confirm('Excluir este horário?')) return;
  const { error } = await sb.from('quadro_horarios').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarHorarios();
}

// ============================================================
//  Itinerários
// ============================================================
async function carregarItinerarios() {
  if (!currentLinha) return;
  const { data, error } = await sb.from('itinerarios')
    .select('*')
    .eq('linha_id', currentLinha.id)
    .order('sentido')
    .order('ordem');
  if (error) { console.error(error); return; }
  todosItinerarios = data || [];
  renderItinerarios();
}

function renderItinerarios() {
  const filtrados = todosItinerarios.filter(i => i.sentido === currentSentido);
  const tbody = $('itin-tbody');
  tbody.innerHTML = '';

  for (const i of filtrados) {
    const tr = document.createElement('tr');
    const acoesHtml = isAdmin
      ? `<td class="col-acao">
           <button class="btn-action btn-edit">Editar</button>
           <button class="btn-action btn-del">Excluir</button>
         </td>`
      : '';

    tr.innerHTML = `
      <td>${i.ordem}</td>
      <td>${esc(i.ponto)}</td>
      <td><span class="badge-sentido badge-${i.sentido}">${i.sentido}</span></td>
      ${acoesHtml}
    `;

    if (isAdmin) {
      tr.querySelector('.btn-edit').addEventListener('click', () => abrirItinForm(i));
      tr.querySelector('.btn-del').addEventListener('click', () => excluirItin(i.id));
    }
    tbody.appendChild(tr);
  }
  $('itin-empty').classList.toggle('hidden', filtrados.length > 0);
}

function abrirItinForm(i) {
  editingItinId = i ? i.id : null;
  $('itin-modal-title').textContent = i ? 'Editar Parada' : 'Nova Parada';
  $('itin-form-error').classList.add('hidden');
  $('i-sentido').value = i?.sentido || currentSentido;
  $('i-ordem').value = i?.ordem ?? (todosItinerarios.filter(x => x.sentido === currentSentido).length + 1);
  $('i-ponto').value = i?.ponto || '';
  abrirModal('itin-modal');
}

async function aoSalvarItin(e) {
  e.preventDefault();
  const err = $('itin-form-error');
  err.classList.add('hidden');

  const payload = {
    linha_id: currentLinha.id,
    sentido: $('i-sentido').value,
    ordem: parseInt($('i-ordem').value),
    ponto: $('i-ponto').value.trim(),
  };

  let error;
  if (editingItinId) {
    ({ error } = await sb.from('itinerarios').update(payload).eq('id', editingItinId));
  } else {
    ({ error } = await sb.from('itinerarios').insert(payload));
  }

  if (error) {
    err.textContent = 'Erro ao salvar: ' + error.message;
    err.classList.remove('hidden');
    return;
  }
  fecharModal('itin-modal');
  await carregarItinerarios();
}

async function excluirItin(id) {
  if (!confirm('Excluir esta parada?')) return;
  const { error } = await sb.from('itinerarios').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarItinerarios();
}

// ============================================================
//  Histórico
// ============================================================
async function carregarHistorico() {
  if (!currentLinha) return;
  const { data, error } = await sb.from('historico_linha')
    .select('*')
    .eq('linha_id', currentLinha.id)
    .order('data_alteracao', { ascending: false });
  if (error) { console.error(error); return; }
  renderHistorico(data || []);
}

function renderHistorico(historico) {
  const tbody = $('historico-tbody');
  tbody.innerHTML = '';
  $('historico-count').textContent = `${historico.length} registro(s)`;

  for (const h of historico) {
    const tr = document.createElement('tr');
    const acoesHtml = isAdmin
      ? `<td class="col-acao">
           <button class="btn-action btn-edit">Editar</button>
           <button class="btn-action btn-del">Excluir</button>
         </td>`
      : '';

    tr.innerHTML = `
      <td>${formatarData(h.data_alteracao)}</td>
      <td><span class="badge-tipo">${esc(h.tipo_alteracao)}</span></td>
      <td>${esc(h.descricao) || '<span style="color:var(--muted)">—</span>'}</td>
      ${acoesHtml}
    `;

    if (isAdmin) {
      tr.querySelector('.btn-edit').addEventListener('click', () => abrirHistForm(h));
      tr.querySelector('.btn-del').addEventListener('click', () => excluirHist(h.id));
    }
    tbody.appendChild(tr);
  }
  $('historico-empty').classList.toggle('hidden', historico.length > 0);
}

function abrirHistForm(h) {
  editingHistId = h ? h.id : null;
  $('hist-modal-title').textContent = h ? 'Editar Registro' : 'Novo Registro Histórico';
  $('hist-form-error').classList.add('hidden');
  $('ht-data').value = h?.data_alteracao || new Date().toISOString().split('T')[0];
  $('ht-tipo').value = h?.tipo_alteracao || '';
  $('ht-descricao').value = h?.descricao || '';
  abrirModal('hist-modal');
}

async function aoSalvarHist(e) {
  e.preventDefault();
  const err = $('hist-form-error');
  err.classList.add('hidden');

  const payload = {
    linha_id: currentLinha.id,
    data_alteracao: $('ht-data').value,
    tipo_alteracao: $('ht-tipo').value,
    descricao: $('ht-descricao').value.trim() || null,
  };

  let error;
  if (editingHistId) {
    ({ error } = await sb.from('historico_linha').update(payload).eq('id', editingHistId));
  } else {
    ({ error } = await sb.from('historico_linha').insert(payload));
  }

  if (error) {
    err.textContent = 'Erro ao salvar: ' + error.message;
    err.classList.remove('hidden');
    return;
  }
  fecharModal('hist-modal');
  await carregarHistorico();
}

async function excluirHist(id) {
  if (!confirm('Excluir este registro histórico?')) return;
  const { error } = await sb.from('historico_linha').delete().eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  await carregarHistorico();
}

// ============================================================
//  Utilitários
// ============================================================
function formatarData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
