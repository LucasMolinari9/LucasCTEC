// ============================================================
//  Controle de Processos CTEC
//  Frontend estatico que conversa com o Supabase (auth + dados)
// ============================================================

// Lista de temas. Para adicionar um tema novo no futuro, basta
// incluir mais um item neste array (nome + cor para os graficos).
const TEMAS = [
  { nome: "Quadro de horários", cor: "#118dff" },
  { nome: "Itinerários", cor: "#12239e" },
  { nome: "Ofícios", cor: "#e66c37" },
  { nome: "Reclamação", cor: "#d13438" },
  { nome: "Criação de seção", cor: "#6b007b" },
  { nome: "Criação de linha", cor: "#1aab40" },
  { nome: "Registro GPS", cor: "#13a4b4" },
  { nome: "Suspensão de linha", cor: "#f2c811" },
];

const corDoTema = (nome) => (TEMAS.find((t) => t.nome === nome) || {}).cor || "#9aa0a6";

// Cliente Supabase (o global "supabase" vem da biblioteca via CDN).
const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// Estado em memoria
let allRecords = [];
let barChart = null;
let doughnutChart = null;

// Atalho para pegar elementos
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------
//  Tema escuro / claro
// ------------------------------------------------------------
function aplicarTema(escuro) {
  document.documentElement.setAttribute("data-theme", escuro ? "dark" : "light");
  const btn = $("theme-toggle");
  if (btn) btn.title = escuro ? "Mudar para tema claro" : "Mudar para tema escuro";
  localStorage.setItem("tema-escuro", escuro ? "1" : "0");
  if (barChart || doughnutChart) atualizarGraficos();
}

function toggleTema() {
  const escuroAtual = document.documentElement.getAttribute("data-theme") === "dark";
  aplicarTema(!escuroAtual);
}

// ------------------------------------------------------------
//  Inicializacao
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Restaurar preferência de tema salva
  const temaSalvo = localStorage.getItem("tema-escuro");
  const prefereEscuro = temaSalvo === "1" || (temaSalvo === null && window.matchMedia("(prefers-color-scheme: dark)").matches);
  aplicarTema(prefereEscuro);

  popularSelectsDeTema();
  registrarEventos();
  verificarSessao();
});

function popularSelectsDeTema() {
  const addSelect = $("tema-input");
  const filterSelect = $("filter-tema");
  for (const t of TEMAS) {
    const o1 = document.createElement("option");
    o1.value = t.nome;
    o1.textContent = t.nome;
    addSelect.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = t.nome;
    o2.textContent = t.nome;
    filterSelect.appendChild(o2);
  }
}

function registrarEventos() {
  $("login-form").addEventListener("submit", aoEntrar);
  $("logout-btn").addEventListener("click", aoSair);
  $("add-form").addEventListener("submit", aoAdicionar);
  $("search-input").addEventListener("input", renderizarTabela);
  $("filter-tema").addEventListener("change", renderizarTabela);

  // Alternar tema escuro/claro
  $("theme-toggle").addEventListener("click", toggleTema);

  // Modal trocar senha
  $("change-pass-btn").addEventListener("click", () => abrirModalSenha(true));
  $("pass-cancel").addEventListener("click", () => abrirModalSenha(false));
  $("pass-form").addEventListener("submit", aoTrocarSenha);
}

// ------------------------------------------------------------
//  Autenticacao
// ------------------------------------------------------------
async function verificarSessao() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    mostrarApp(data.session.user);
  } else {
    mostrarLogin();
  }
}

function mostrarLogin() {
  $("app-view").classList.add("hidden");
  $("login-view").classList.remove("hidden");
}

async function mostrarApp(user) {
  $("login-view").classList.add("hidden");
  $("app-view").classList.remove("hidden");
  $("user-email").textContent = user.email;
  await carregarProcessos();
}

async function aoEntrar(e) {
  e.preventDefault();
  const btn = $("login-btn");
  const erro = $("login-error");
  erro.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Entrando...";

  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.textContent = "Entrar";

  if (error) {
    erro.textContent = "E-mail ou senha incorretos.";
    erro.classList.remove("hidden");
    return;
  }
  $("login-password").value = "";
  mostrarApp(data.user);
}

async function aoSair() {
  await sb.auth.signOut();
  allRecords = [];
  mostrarLogin();
}

// ------------------------------------------------------------
//  Trocar senha
// ------------------------------------------------------------
function abrirModalSenha(abrir) {
  const modal = $("pass-modal");
  $("pass-msg").classList.add("hidden");
  $("pass-form").reset();
  modal.classList.toggle("hidden", !abrir);
}

async function aoTrocarSenha(e) {
  e.preventDefault();
  const msg = $("pass-msg");
  msg.classList.add("hidden");
  msg.style.color = "";

  const nova = $("new-password").value;
  const conf = $("confirm-password").value;
  if (nova !== conf) {
    msg.textContent = "As senhas não conferem.";
    msg.classList.remove("hidden");
    return;
  }

  const { error } = await sb.auth.updateUser({ password: nova });
  if (error) {
    msg.textContent = "Não foi possível trocar a senha: " + error.message;
    msg.classList.remove("hidden");
    return;
  }
  msg.style.color = "#1aab40";
  msg.textContent = "Senha alterada com sucesso!";
  msg.classList.remove("hidden");
  setTimeout(() => abrirModalSenha(false), 1200);
}

// ------------------------------------------------------------
//  Dados (CRUD)
// ------------------------------------------------------------
async function carregarProcessos() {
  const { data, error } = await sb
    .from("processos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    allRecords = [];
  } else {
    allRecords = data || [];
  }
  atualizarDashboard();
}

async function aoAdicionar(e) {
  e.preventDefault();
  const erro = $("add-error");
  erro.classList.add("hidden");

  const numero = $("numero-input").value.trim();
  const tema = $("tema-input").value;
  if (!numero || !tema) return;

  const { data: sessionData } = await sb.auth.getSession();
  const userId = sessionData.session && sessionData.session.user.id;

  const { error } = await sb
    .from("processos")
    .insert({ numero_processo: numero, tema, user_id: userId });

  if (error) {
    erro.textContent = "Erro ao salvar: " + error.message;
    erro.classList.remove("hidden");
    return;
  }
  $("numero-input").value = "";
  $("tema-input").selectedIndex = 0;
  await carregarProcessos();
}

async function excluirProcesso(id) {
  if (!confirm("Excluir este registro?")) return;
  const { error } = await sb.from("processos").delete().eq("id", id);
  if (error) {
    alert("Erro ao excluir: " + error.message);
    return;
  }
  await carregarProcessos();
}

// ------------------------------------------------------------
//  Renderizacao do dashboard
// ------------------------------------------------------------
function atualizarDashboard() {
  atualizarKpis();
  atualizarGraficos();
  renderizarTabela();
}

function contagemPorTema() {
  const contagem = {};
  for (const t of TEMAS) contagem[t.nome] = 0;
  for (const r of allRecords) {
    contagem[r.tema] = (contagem[r.tema] || 0) + 1;
  }
  return contagem;
}

function atualizarKpis() {
  const total = allRecords.length;
  const contagem = contagemPorTema();
  const temasComRegistro = Object.values(contagem).filter((n) => n > 0).length;

  let topTema = "—";
  let topQtd = 0;
  for (const [nome, qtd] of Object.entries(contagem)) {
    if (qtd > topQtd) {
      topQtd = qtd;
      topTema = nome;
    }
  }

  const agora = new Date();
  const esteMes = allRecords.filter((r) => {
    const d = new Date(r.created_at);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  }).length;

  $("kpi-total").textContent = total;
  $("kpi-temas").textContent = temasComRegistro;
  $("kpi-top").textContent = topQtd > 0 ? `${topTema} (${topQtd})` : "—";
  $("kpi-mes").textContent = esteMes;
}

function atualizarGraficos() {
  const contagem = contagemPorTema();
  const labels = TEMAS.map((t) => t.nome);
  const valores = labels.map((l) => contagem[l]);
  const cores = TEMAS.map((t) => t.cor);

  // Grafico de barras
  if (barChart) barChart.destroy();
  barChart = new Chart($("bar-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Processos", data: valores, backgroundColor: cores, borderRadius: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0, font: { size: 10 } } },
      },
    },
  });

  // Grafico de rosca
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = new Chart($("doughnut-chart"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: valores, backgroundColor: cores }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });
}

function renderizarTabela() {
  const busca = $("search-input").value.trim().toLowerCase();
  const temaFiltro = $("filter-tema").value;

  const filtrados = allRecords.filter((r) => {
    const okBusca = !busca || r.numero_processo.toLowerCase().includes(busca);
    const okTema = !temaFiltro || r.tema === temaFiltro;
    return okBusca && okTema;
  });

  const tbody = $("table-body");
  tbody.innerHTML = "";

  for (const r of filtrados) {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = r.numero_processo;

    const tdTema = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "tema-badge";
    badge.style.background = corDoTema(r.tema);
    badge.textContent = r.tema;
    tdTema.appendChild(badge);

    const tdData = document.createElement("td");
    tdData.textContent = formatarData(r.created_at);

    const tdAcao = document.createElement("td");
    tdAcao.className = "col-acao";
    const del = document.createElement("button");
    del.className = "btn-del";
    del.textContent = "Excluir";
    del.addEventListener("click", () => excluirProcesso(r.id));
    tdAcao.appendChild(del);

    tr.append(tdNum, tdTema, tdData, tdAcao);
    tbody.appendChild(tr);
  }

  $("empty-msg").classList.toggle("hidden", filtrados.length > 0);
}

function formatarData(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
