const STORAGE_KEY = 'agenda-clinica-session-v3';
const app = document.getElementById('app');
const toastRoot = document.getElementById('toast-root');

const state = {
  token: null,
  user: null,
  license: null,
  dashboard: null,
  cache: {},
};

const resourceModules = {
  clinics: {
    label: 'Clínicas',
    resource: 'clinics',
    adminOnly: false,
    listColumns: ['code', 'name', 'manager', 'phone', 'email', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'name', label: 'Nome', type: 'text', col: 8, required: true },
      { name: 'cnpj', label: 'CNPJ', type: 'text', col: 4 },
      { name: 'manager', label: 'Responsável', type: 'text', col: 4 },
      { name: 'phone', label: 'Telefone', type: 'text', col: 4 },
      { name: 'email', label: 'E-mail', type: 'email', col: 6 },
      { name: 'status', label: 'Status', type: 'select', col: 3, options: statusOptions(['Ativa', 'Inativa']) },
      { name: 'address', label: 'Endereço', type: 'textarea', col: 12 },
    ],
  },
  professionals: {
    label: 'Profissionais',
    resource: 'professionals',
    adminOnly: false,
    listColumns: ['code', 'name', 'specialty', 'registry', 'clinic_id', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'name', label: 'Nome', type: 'text', col: 8, required: true },
      { name: 'specialty', label: 'Especialidade', type: 'text', col: 4 },
      { name: 'registry', label: 'Registro', type: 'text', col: 4 },
      { name: 'phone', label: 'Telefone', type: 'text', col: 4 },
      { name: 'email', label: 'E-mail', type: 'email', col: 6 },
      { name: 'clinic_id', label: 'Clínica', type: 'relation', relation: 'clinics', col: 3, required: true },
      { name: 'status', label: 'Status', type: 'select', col: 3, options: statusOptions(['Ativo', 'Inativo']) },
    ],
  },
  patients: {
    label: 'Pacientes',
    resource: 'patients',
    adminOnly: false,
    listColumns: ['code', 'name', 'cpf', 'professional_id', 'clinic_id', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'name', label: 'Nome', type: 'text', col: 8, required: true },
      { name: 'cpf', label: 'CPF', type: 'text', col: 4 },
      { name: 'phone', label: 'Telefone', type: 'text', col: 4 },
      { name: 'email', label: 'E-mail', type: 'email', col: 4 },
      { name: 'professional_id', label: 'Profissional', type: 'relation', relation: 'professionals', col: 4, required: true },
      { name: 'clinic_id', label: 'Clínica', type: 'relation', relation: 'clinics', col: 4, required: true },
      { name: 'frequency', label: 'Frequência', type: 'text', col: 4 },
      { name: 'weekday', label: 'Dia da semana', type: 'text', col: 4 },
      { name: 'time', label: 'Horário', type: 'time', col: 4 },
      { name: 'monthly_fee', label: 'Mensalidade', type: 'number', step: '0.01', col: 4 },
      { name: 'payment_day', label: 'Dia de pagamento', type: 'number', col: 4 },
      { name: 'billing_type', label: 'Tipo cobrança', type: 'text', col: 4 },
      { name: 'status', label: 'Status', type: 'select', col: 3, options: statusOptions(['Ativo', 'Inativo']) },
      { name: 'registration_date', label: 'Cadastro', type: 'date', col: 3 },
      { name: 'consent_signed_at', label: 'Consentimento assinado em', type: 'datetime-local', col: 6 },
      { name: 'consent_recording', label: 'Consentimento de gravação', type: 'checkbox', col: 6 },
      { name: 'consent_text', label: 'Texto de consentimento', type: 'textarea', col: 12 },
      { name: 'clinical_alerts', label: 'Alertas clínicos', type: 'textarea', col: 12 },
    ],
  },
  appointments: {
    label: 'Agendamentos',
    resource: 'appointments',
    adminOnly: false,
    listColumns: ['code', 'patient_id', 'professional_id', 'date', 'time', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'patient_id', label: 'Paciente', type: 'relation', relation: 'patients', col: 4, required: true },
      { name: 'professional_id', label: 'Profissional', type: 'relation', relation: 'professionals', col: 4, required: true },
      { name: 'clinic_id', label: 'Clínica', type: 'relation', relation: 'clinics', col: 4, required: true },
      { name: 'date', label: 'Data', type: 'date', col: 4, required: true },
      { name: 'time', label: 'Hora', type: 'time', col: 4, required: true },
      { name: 'frequency', label: 'Frequência', type: 'text', col: 4 },
      { name: 'status', label: 'Status', type: 'select', col: 4, options: statusOptions(['Agendado', 'Concluído', 'Cancelado']) },
      { name: 'month_name', label: 'Mês referência', type: 'text', col: 4 },
      { name: 'note', label: 'Observação', type: 'textarea', col: 12 },
    ],
  },
  receivables: {
    label: 'Recebíveis',
    resource: 'receivables',
    adminOnly: false,
    listColumns: ['code', 'patient_id', 'amount_planned', 'amount_paid', 'due_date', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'patient_id', label: 'Paciente', type: 'relation', relation: 'patients', col: 4, required: true },
      { name: 'professional_id', label: 'Profissional', type: 'relation', relation: 'professionals', col: 4, required: true },
      { name: 'clinic_id', label: 'Clínica', type: 'relation', relation: 'clinics', col: 4, required: true },
      { name: 'amount_planned', label: 'Valor previsto', type: 'number', step: '0.01', col: 4, required: true },
      { name: 'amount_paid', label: 'Valor pago', type: 'number', step: '0.01', col: 4 },
      { name: 'due_date', label: 'Vencimento', type: 'date', col: 4 },
      { name: 'payment_date', label: 'Pagamento', type: 'date', col: 4 },
      { name: 'competence', label: 'Competência', type: 'text', col: 4 },
      { name: 'month_name', label: 'Mês', type: 'text', col: 4 },
      { name: 'status', label: 'Status', type: 'select', col: 4, options: statusOptions(['Em Aberto', 'Parcial', 'Pago', 'Atrasado']) },
    ],
  },
  payables: {
    label: 'Pagáveis',
    resource: 'payables',
    adminOnly: false,
    listColumns: ['code', 'category', 'description', 'amount_planned', 'amount_paid', 'status'],
    fields: [
      { name: 'code', label: 'Código', type: 'text', col: 4, required: true },
      { name: 'clinic_id', label: 'Clínica', type: 'relation', relation: 'clinics', col: 4, required: true },
      { name: 'category', label: 'Categoria', type: 'text', col: 4 },
      { name: 'description', label: 'Descrição', type: 'text', col: 8 },
      { name: 'amount_planned', label: 'Valor previsto', type: 'number', step: '0.01', col: 4, required: true },
      { name: 'amount_paid', label: 'Valor pago', type: 'number', step: '0.01', col: 4 },
      { name: 'due_date', label: 'Vencimento', type: 'date', col: 4 },
      { name: 'payment_date', label: 'Pagamento', type: 'date', col: 4 },
      { name: 'month_name', label: 'Mês', type: 'text', col: 4 },
      { name: 'status', label: 'Status', type: 'select', col: 4, options: statusOptions(['Em Aberto', 'Parcial', 'Pago', 'Atrasado']) },
    ],
  },
};

const navSections = [
  {
    title: 'Geral',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'clinics', label: 'Clínicas' },
      { key: 'professionals', label: 'Profissionais' },
      { key: 'patients', label: 'Pacientes' },
      { key: 'appointments', label: 'Agendamentos' },
      { key: 'sessions', label: 'Sessões' },
    ],
  },
  {
    title: 'Financeiro',
    items: [
      { key: 'receivables', label: 'Recebíveis' },
      { key: 'payables', label: 'Pagáveis' },
    ],
  },
  {
    title: 'Administração',
    items: [
      { key: 'users', label: 'Usuários', adminOnly: true },
      { key: 'license', label: 'Licença' },
      { key: 'audits', label: 'Auditoria', adminOnly: true },
      { key: 'backup', label: 'Backup', adminOnly: true },
    ],
  },
];

function statusOptions(list) {
  return list.map((value) => ({ value, label: value }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.token = parsed.token || null;
    state.user = parsed.user || null;
    state.license = parsed.license || null;
  } catch (_) {}
}

function persistSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    token: state.token,
    user: state.user,
    license: state.license,
  }));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.license = null;
  state.dashboard = null;
  state.cache = {};
  localStorage.removeItem(STORAGE_KEY);
}

function isAdmin() {
  return state.user && state.user.role === 'ADMIN';
}

function getRoute() {
  const route = window.location.hash.replace(/^#\/?/, '').trim();
  return route || 'dashboard';
}

function setRoute(route) {
  window.location.hash = route;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR');
}

function friendlyFieldLabel(field) {
  return field.replaceAll('_', ' ');
}

function statusBadge(status) {
  const text = status || 'Sem status';
  const normalized = text.toLowerCase();
  let cls = 'badge-gray';
  if (normalized.includes('ativo') || normalized.includes('conclu') || normalized.includes('pago') || normalized.includes('final')) cls = 'badge-green';
  else if (normalized.includes('atras') || normalized.includes('cancel')) cls = 'badge-red';
  else if (normalized.includes('aberto') || normalized.includes('parcial') || normalized.includes('trial') || normalized.includes('agend')) cls = 'badge-yellow';
  else if (normalized.includes('admin')) cls = 'badge-blue';
  return `<span class="badge ${cls}">${escapeHtml(text)}</span>`;
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

async function api(path, options = {}) {
  const config = { method: 'GET', headers: {}, ...options };
  if (state.token) config.headers.Authorization = `Bearer ${state.token}`;
  if (config.body && !(config.body instanceof FormData)) {
    config.headers['Content-Type'] = 'application/json';
    config.body = JSON.stringify(config.body);
  }
  const response = await fetch(path, config);
  const contentType = response.headers.get('content-type') || '';
  if (options.raw) return response;
  let payload = null;
  if (contentType.includes('application/json')) payload = await response.json();
  else payload = await response.text();
  if (!response.ok) {
    const error = new Error((payload && payload.error) || 'Erro na API');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function preload(resource) {
  if (!state.cache[resource]) {
    state.cache[resource] = await api(`/api/${resource}`);
  }
  return state.cache[resource];
}

function invalidate(resource) {
  if (resource) delete state.cache[resource];
  else state.cache = {};
  state.dashboard = null;
}

function routeAllowed(route) {
  if (['dashboard', 'sessions', 'license'].includes(route)) return true;
  if (['users', 'audits', 'backup'].includes(route)) return isAdmin();
  if (resourceModules[route]) return true;
  return true;
}

function shellHtml(activeRoute) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <h1>Agenda Clínica</h1>
        <p>Interface operacional pronta para uso</p>
        ${navSections.map((section) => `
          <div class="nav-section">
            <div class="nav-title">${section.title}</div>
            ${section.items.filter((item) => !item.adminOnly || isAdmin()).map((item) => `
              <a class="nav-link ${activeRoute === item.key ? 'active' : ''}" href="#${item.key}">${item.label}</a>
            `).join('')}
          </div>
        `).join('')}
        <div class="sidebar-footer">
          <div><strong>${escapeHtml(state.user?.name || '')}</strong></div>
          <div>${escapeHtml(state.user?.email || '')}</div>
          <div style="margin-top:8px;">Perfil: ${escapeHtml(state.user?.role || '-')}</div>
        </div>
      </aside>
      <main class="main-area">
        <div class="topbar">
          <div class="topbar-title">
            <h2>${pageTitle(activeRoute)}</h2>
            <p>${pageDescription(activeRoute)}</p>
          </div>
          <div class="topbar-actions">
            <div class="topbar-user">${escapeHtml(state.user?.name || '')} • ${escapeHtml(state.user?.role || '')}</div>
            <button class="btn btn-dark" id="logout-btn">Sair</button>
          </div>
        </div>
        <div id="page-content"></div>
      </main>
    </div>
  `;
}

function pageTitle(route) {
  if (route === 'dashboard') return 'Painel Agenda Clínica';
  if (route === 'sessions') return 'Sessões clínicas';
  if (route === 'users') return 'Usuários';
  if (route === 'license') return 'Licença';
  if (route === 'audits') return 'Auditoria';
  if (route === 'backup') return 'Backup';
  return resourceModules[route]?.label || 'Agenda Clínica';
}

function pageDescription(route) {
  const descriptions = {
    dashboard: 'Visão geral da operação, licença e atalhos rápidos.',
    sessions: 'Inicie, finalize e acompanhe sessões clínicas.',
    users: 'Gestão administrativa de usuários do sistema.',
    license: 'Consulta e atualização do licenciamento.',
    audits: 'Rastreabilidade das ações realizadas no sistema.',
    backup: 'Exportação administrativa da base completa.',
  };
  return descriptions[route] || `Gestão do módulo de ${pageTitle(route).toLowerCase()}.`;
}

function loginHtml() {
  return `
    <div class="auth-shell">
      <section class="auth-brand">
        <h1>Agenda Clínica</h1>
        <p>Nova interface operacional pronta para usar no navegador, conectada às rotas já homologadas do backend.</p>
        <div class="brand-badges">
          <span class="brand-badge">Dashboard</span>
          <span class="brand-badge">Cadastros</span>
          <span class="brand-badge">Sessões</span>
          <span class="brand-badge">Financeiro</span>
          <span class="brand-badge">Administração</span>
        </div>
      </section>
      <section class="auth-panel">
        <div class="auth-card">
          <h2>Entrar</h2>
          <p>Use o e-mail e a senha cadastrados no backend.</p>
          <form id="login-form" class="form-grid">
            <div class="field">
              <label for="email">E-mail</label>
              <input id="email" name="email" type="email" placeholder="admin@agenda-clinica.local" required />
            </div>
            <div class="field">
              <label for="password">Senha</label>
              <input id="password" name="password" type="password" placeholder="Digite sua senha" required />
            </div>
            <div class="auth-actions">
              <button class="btn btn-primary btn-block" type="submit">Entrar no sistema</button>
              <div class="helper-text">Se a autenticação funcionar no terminal, ela também deve funcionar aqui.</div>
            </div>
            <div id="login-feedback"></div>
          </form>
        </div>
      </section>
    </div>
  `;
}

async function render() {
  const route = getRoute();
  if (!state.token) {
    app.innerHTML = loginHtml();
    bindLogin();
    return;
  }
  const allowedRoute = routeAllowed(route) ? route : 'dashboard';
  app.innerHTML = shellHtml(allowedRoute);
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    render();
  });
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="card"><div class="card-body">Carregando...</div></div>';
  try {
    await renderRoute(allowedRoute, content);
  } catch (error) {
    content.innerHTML = `<div class="card"><div class="card-body"><div class="error-box">${escapeHtml(error.message || 'Erro ao carregar página')}</div></div></div>`;
  }
}

function bindLogin() {
  const form = document.getElementById('login-form');
  const feedback = document.getElementById('login-feedback');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.innerHTML = '<div class="info-box">Autenticando...</div>';
    const formData = new FormData(form);
    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: {
          email: String(formData.get('email') || '').trim(),
          password: String(formData.get('password') || ''),
        },
      });
      state.token = result.token;
      state.user = result.user;
      state.license = result.license || null;
      persistSession();
      toast('Login realizado com sucesso.', 'success');
      setRoute('dashboard');
      render();
    } catch (error) {
      feedback.innerHTML = `<div class="error-box">${escapeHtml(error.message || 'Credenciais inválidas')}</div>`;
    }
  });
}

async function renderRoute(route, content) {
  if (route === 'dashboard') return renderDashboard(content);
  if (resourceModules[route]) return renderResourcePage(route, content);
  if (route === 'sessions') return renderSessionsPage(content);
  if (route === 'users') return renderUsersPage(content);
  if (route === 'license') return renderLicensePage(content);
  if (route === 'audits') return renderAuditsPage(content);
  if (route === 'backup') return renderBackupPage(content);
  content.innerHTML = '<div class="card"><div class="card-body">Página não encontrada.</div></div>';
}

async function renderDashboard(content) {
  state.dashboard = await api('/api/dashboard/summary');
  state.license = await api('/api/license');
  persistSession();
  const cards = [
    ['Clínicas', state.dashboard.clinics],
    ['Profissionais', state.dashboard.professionals],
    ['Pacientes', state.dashboard.patients],
    ['Agendamentos', state.dashboard.appointments],
    ['Sessões', state.dashboard.sessions],
    ['Auditorias', state.dashboard.audits],
    ['Recebíveis em aberto', formatMoney(state.dashboard.receivables_open)],
    ['Pagáveis em aberto', formatMoney(state.dashboard.payables_open)],
  ];
  content.innerHTML = `
    <div class="page-grid">
      <div class="metrics-grid">
        ${cards.map(([label, value]) => `
          <div class="metric-card">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `).join('')}
      </div>
      <div class="two-col">
        <section class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Ações rápidas</h3>
              <p class="card-subtitle">Acesse os módulos mais usados.</p>
            </div>
          </div>
          <div class="card-body">
            <div class="toolbar">
              <div class="left">
                <button class="btn btn-primary" data-nav="patients">Pacientes</button>
                <button class="btn btn-secondary" data-nav="appointments">Agendamentos</button>
                <button class="btn btn-secondary" data-nav="sessions">Sessões</button>
              </div>
              <div class="right">
                <button class="btn btn-ghost" data-nav="receivables">Recebíveis</button>
                <button class="btn btn-ghost" data-nav="payables">Pagáveis</button>
              </div>
            </div>
            <div class="panel-list">
              <div class="panel-item"><strong>Usuário logado</strong><span>${escapeHtml(state.user?.name || '-')} • ${escapeHtml(state.user?.email || '-')}</span></div>
              <div class="panel-item"><strong>Perfil</strong><span>${escapeHtml(state.user?.role || '-')}</span></div>
              <div class="panel-item"><strong>Status da API</strong><span>API conectada com sucesso.</span></div>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Licença</h3>
              <p class="card-subtitle">Resumo do licenciamento atual.</p>
            </div>
          </div>
          <div class="card-body">
            <div class="panel-list">
              <div class="panel-item"><strong>Status</strong><span>${statusBadge(state.license?.status || 'TRIAL')}</span></div>
              <div class="panel-item"><strong>Plano</strong><span>${escapeHtml(state.license?.plan_name || '-')}</span></div>
              <div class="panel-item"><strong>Empresa</strong><span>${escapeHtml(state.license?.company_name || '-')}</span></div>
              <div class="panel-item"><strong>Expira em</strong><span>${formatDateTime(state.license?.expires_at)}</span></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
  content.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => setRoute(button.dataset.nav));
  });
}

async function renderResourcePage(moduleKey, content) {
  const module = resourceModules[moduleKey];
  const rows = await preload(module.resource);
  const relations = await buildRelationsMap();
  content.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <div class="left">
            <input id="search-${moduleKey}" class="search-input" placeholder="Buscar em ${module.label.toLowerCase()}" />
          </div>
          <div class="right">
            <button class="btn btn-primary" id="new-${moduleKey}">Novo registro</button>
          </div>
        </div>
        <div id="table-${moduleKey}"></div>
      </div>
    </div>
  `;
  const tableHost = document.getElementById(`table-${moduleKey}`);
  const searchInput = document.getElementById(`search-${moduleKey}`);

  const renderTable = () => {
    const term = String(searchInput.value || '').trim().toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
    tableHost.innerHTML = filtered.length
      ? `<div class="table-wrap"><table>
          <thead><tr>${module.listColumns.map((column) => `<th>${escapeHtml(friendlyFieldLabel(column))}</th>`).join('')}<th>Ações</th></tr></thead>
          <tbody>
            ${filtered.map((row) => `
              <tr>
                ${module.listColumns.map((column) => `<td>${renderCellValue(column, row[column], relations)}</td>`).join('')}
                <td>
                  <div class="table-actions">
                    <button class="btn btn-secondary btn-sm" data-edit="${row.id}">Editar</button>
                    <button class="btn btn-danger btn-sm" data-delete="${row.id}">Excluir</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`
      : '<div class="empty-state">Nenhum registro encontrado neste módulo.</div>';

    tableHost.querySelectorAll('[data-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = rows.find((item) => String(item.id) === String(button.dataset.edit));
        openResourceModal(moduleKey, row);
      });
    });

    tableHost.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const row = rows.find((item) => String(item.id) === String(button.dataset.delete));
        if (!confirm(`Excluir registro ${row?.code || row?.name || row?.id}?`)) return;
        try {
          await api(`/api/${module.resource}/${row.id}`, { method: 'DELETE' });
          toast('Registro excluído com sucesso.', 'success');
          invalidate(module.resource);
          await render();
        } catch (error) {
          toast(error.message || 'Erro ao excluir.', 'error');
        }
      });
    });
  };

  searchInput.addEventListener('input', renderTable);
  document.getElementById(`new-${moduleKey}`).addEventListener('click', () => openResourceModal(moduleKey));
  renderTable();
}

async function buildRelationsMap() {
  const [clinics, professionals, patients, appointments] = await Promise.all([
    preload('clinics').catch(() => []),
    preload('professionals').catch(() => []),
    preload('patients').catch(() => []),
    preload('appointments').catch(() => []),
  ]);
  return {
    clinics: Object.fromEntries(clinics.map((item) => [String(item.id), item.name || item.code || `#${item.id}`])),
    professionals: Object.fromEntries(professionals.map((item) => [String(item.id), item.name || item.code || `#${item.id}`])),
    patients: Object.fromEntries(patients.map((item) => [String(item.id), item.name || item.code || `#${item.id}`])),
    appointments: Object.fromEntries(appointments.map((item) => [String(item.id), item.code || item.note || `#${item.id}`])),
  };
}

function renderCellValue(column, value, relations) {
  if (column.endsWith('_id')) {
    const relationName = column.replace('_id', 's');
    if (relations[relationName]) return escapeHtml(relations[relationName][String(value)] || `#${value ?? '-'}`);
  }
  if (column.includes('amount')) return formatMoney(value);
  if (column === 'status' || column === 'role') return statusBadge(value);
  if (column.includes('date') || column.endsWith('_at')) return escapeHtml(formatDate(value));
  return escapeHtml(value ?? '-');
}

async function openResourceModal(moduleKey, row = null) {
  const module = resourceModules[moduleKey];
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  const relationOptions = {};
  for (const field of module.fields) {
    if (field.type === 'relation') {
      const list = await preload(field.relation).catch(() => []);
      relationOptions[field.name] = list.map((item) => ({ value: item.id, label: item.name || item.code || `#${item.id}` }));
    }
  }
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <h3>${row ? 'Editar' : 'Novo'} ${module.label.slice(0, -1) || module.label}</h3>
          <p class="card-subtitle">Preencha os campos e salve na API.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal>Fechar</button>
      </div>
      <div class="card-body">
        <form id="resource-form" class="form-grid">
          ${module.fields.map((field) => renderField(field, row?.[field.name], relationOptions[field.name])).join('')}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="save-resource">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => overlay.remove()));
  document.getElementById('save-resource').addEventListener('click', async () => {
    try {
      const form = document.getElementById('resource-form');
      const payload = buildPayloadFromFields(module.fields, form, row);
      const method = row ? 'PUT' : 'POST';
      const url = row ? `/api/${module.resource}/${row.id}` : `/api/${module.resource}`;
      await api(url, { method, body: payload });
      overlay.remove();
      invalidate(module.resource);
      toast('Registro salvo com sucesso.', 'success');
      await render();
    } catch (error) {
      toast(error.message || 'Erro ao salvar registro.', 'error');
    }
  });
}

function renderField(field, value, options = []) {
  const col = field.col || 12;
  const fieldId = `field-${field.name}`;
  if (field.type === 'checkbox') {
    return `
      <div class="field col-${col}">
        <label>${field.label}</label>
        <label class="checkbox-row">
          <input id="${fieldId}" name="${field.name}" type="checkbox" ${Number(value) === 1 || value === true ? 'checked' : ''} />
          <span>Ativo</span>
        </label>
      </div>
    `;
  }
  if (field.type === 'textarea') {
    return `
      <div class="field col-${col}">
        <label for="${fieldId}">${field.label}</label>
        <textarea id="${fieldId}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value ?? '')}</textarea>
      </div>
    `;
  }
  if (field.type === 'select' || field.type === 'relation') {
    const selectOptions = options.length ? options : field.options || [];
    return `
      <div class="field col-${col}">
        <label for="${fieldId}">${field.label}</label>
        <select id="${fieldId}" name="${field.name}" ${field.required ? 'required' : ''}>
          <option value="">Selecione</option>
          ${selectOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value ?? '') ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }
  return `
    <div class="field col-${col}">
      <label for="${fieldId}">${field.label}</label>
      <input id="${fieldId}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(normalizeInputValue(field, value))}" ${field.step ? `step="${field.step}"` : ''} ${field.required ? 'required' : ''} />
    </div>
  `;
}

function normalizeInputValue(field, value) {
  if (!value && value !== 0) return '';
  if (field.type === 'datetime-local') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return value;
}

function buildPayloadFromFields(fields, form, existingRow = null) {
  const payload = {};
  fields.forEach((field) => {
    const element = form.elements[field.name];
    if (!element) return;
    if (field.type === 'checkbox') {
      payload[field.name] = element.checked ? 1 : 0;
      return;
    }
    let value = element.value;
    if (field.type === 'number') value = value === '' ? 0 : Number(value);
    if (field.type === 'relation') value = value === '' ? null : Number(value);
    if (field.type === 'datetime-local' && value) value = new Date(value).toISOString();
    payload[field.name] = value;
  });
  if (existingRow) {
    Object.keys(existingRow).forEach((key) => {
      if (payload[key] === undefined && key !== 'id') payload[key] = existingRow[key];
    });
  }
  return payload;
}

async function renderSessionsPage(content) {
  const [rows, relations] = await Promise.all([preload('sessions').catch(() => []), buildRelationsMap()]);
  content.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <div class="left">
            <input id="search-sessions" class="search-input" placeholder="Buscar em sessões" />
          </div>
          <div class="right">
            <button class="btn btn-primary" id="start-session-btn">Iniciar sessão</button>
          </div>
        </div>
        <div id="sessions-table"></div>
      </div>
    </div>
  `;
  const host = document.getElementById('sessions-table');
  const search = document.getElementById('search-sessions');

  const renderTable = () => {
    const term = String(search.value || '').toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
    host.innerHTML = filtered.length ? `
      <div class="table-wrap"><table>
        <thead>
          <tr>
            <th>Código</th><th>Paciente</th><th>Agendamento</th><th>Data</th><th>Status</th><th>Duração</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map((row) => `
            <tr>
              <td>${escapeHtml(row.code || '-')}</td>
              <td>${escapeHtml(relations.patients[String(row.patient_id)] || `#${row.patient_id}`)}</td>
              <td>${escapeHtml(relations.appointments[String(row.appointment_id)] || `#${row.appointment_id || '-'}`)}</td>
              <td>${escapeHtml(formatDate(row.scheduled_date))}</td>
              <td>${statusBadge(row.status || row.call_status || 'manual')}</td>
              <td>${escapeHtml(row.duration_minutes || '-')}</td>
              <td>
                <div class="table-actions">
                  <button class="btn btn-secondary btn-sm" data-complete="${row.id}">Finalizar</button>
                  <button class="btn btn-danger btn-sm" data-delete="${row.id}">Excluir</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    ` : '<div class="empty-state">Nenhuma sessão encontrada.</div>';

    host.querySelectorAll('[data-complete]').forEach((button) => {
      button.addEventListener('click', () => {
        const row = rows.find((item) => String(item.id) === String(button.dataset.complete));
        openCompleteSessionModal(row);
      });
    });

    host.querySelectorAll('[data-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Excluir esta sessão?')) return;
        try {
          await api(`/api/sessions/${button.dataset.delete}`, { method: 'DELETE' });
          invalidate('sessions');
          toast('Sessão excluída com sucesso.', 'success');
          await render();
        } catch (error) {
          toast(error.message || 'Erro ao excluir sessão.', 'error');
        }
      });
    });
  };

  search.addEventListener('input', renderTable);
  document.getElementById('start-session-btn').addEventListener('click', openStartSessionModal);
  renderTable();
}

async function openStartSessionModal() {
  const [patients, appointments] = await Promise.all([preload('patients'), preload('appointments')]);
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <h3>Iniciar sessão clínica</h3>
          <p class="card-subtitle">Use a rota específica de início de sessão.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal>Fechar</button>
      </div>
      <div class="card-body">
        <form id="start-session-form" class="form-grid">
          ${renderField({ name: 'patient_id', label: 'Paciente', type: 'relation', col: 6, required: true }, '', patients.map((item) => ({ value: item.id, label: item.name || item.code || `#${item.id}` })))}
          ${renderField({ name: 'appointment_id', label: 'Agendamento', type: 'relation', col: 6 }, '', appointments.map((item) => ({ value: item.id, label: item.code || item.note || `#${item.id}` })))}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="start-session-save">Iniciar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => overlay.remove()));
  document.getElementById('start-session-save').addEventListener('click', async () => {
    try {
      const form = document.getElementById('start-session-form');
      const payload = {
        patient_id: Number(form.elements.patient_id.value),
        appointment_id: form.elements.appointment_id.value ? Number(form.elements.appointment_id.value) : null,
      };
      await api('/api/clinical-sessions/start', { method: 'POST', body: payload });
      overlay.remove();
      invalidate('sessions');
      toast('Sessão iniciada com sucesso.', 'success');
      await render();
    } catch (error) {
      toast(error.message || 'Erro ao iniciar sessão.', 'error');
    }
  });
}

function openCompleteSessionModal(row) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <h3>Finalizar sessão ${escapeHtml(row.code || '')}</h3>
          <p class="card-subtitle">Grave evolução clínica, SOAP e resumo final.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal>Fechar</button>
      </div>
      <div class="card-body">
        <form id="complete-session-form" class="form-grid">
          ${renderField({ name: 'started_at', label: 'Início', type: 'datetime-local', col: 6 }, row.started_at || '')}
          ${renderField({ name: 'ended_at', label: 'Fim', type: 'datetime-local', col: 6 }, row.ended_at || '')}
          ${renderField({ name: 'call_status', label: 'Call status', type: 'select', col: 4, options: statusOptions(['manual', 'daily']) }, row.call_status || 'manual')}
          ${renderField({ name: 'status', label: 'Status', type: 'select', col: 4, options: statusOptions(['FINALIZADO', 'EM ANDAMENTO']) }, row.status || 'FINALIZADO')}
          ${renderField({ name: 'soap_subjective', label: 'SOAP subjetivo', type: 'textarea', col: 12 }, row.soap_subjective || '')}
          ${renderField({ name: 'soap_objective', label: 'SOAP objetivo', type: 'textarea', col: 12 }, row.soap_objective || '')}
          ${renderField({ name: 'soap_assessment', label: 'SOAP avaliação', type: 'textarea', col: 12 }, row.soap_assessment || '')}
          ${renderField({ name: 'soap_plan', label: 'SOAP plano', type: 'textarea', col: 12 }, row.soap_plan || '')}
          ${renderField({ name: 'summary', label: 'Resumo', type: 'textarea', col: 12 }, row.summary || '')}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="complete-session-save">Salvar finalização</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => overlay.remove()));
  document.getElementById('complete-session-save').addEventListener('click', async () => {
    try {
      const form = document.getElementById('complete-session-form');
      const payload = {
        started_at: form.elements.started_at.value ? new Date(form.elements.started_at.value).toISOString() : row.started_at,
        ended_at: form.elements.ended_at.value ? new Date(form.elements.ended_at.value).toISOString() : row.ended_at,
        call_status: form.elements.call_status.value,
        soap_subjective: form.elements.soap_subjective.value,
        soap_objective: form.elements.soap_objective.value,
        soap_assessment: form.elements.soap_assessment.value,
        soap_plan: form.elements.soap_plan.value,
        summary: form.elements.summary.value,
        status: form.elements.status.value,
      };
      await api(`/api/clinical-sessions/${row.id}/complete`, { method: 'POST', body: payload });
      overlay.remove();
      invalidate('sessions');
      toast('Sessão finalizada com sucesso.', 'success');
      await render();
    } catch (error) {
      toast(error.message || 'Erro ao finalizar sessão.', 'error');
    }
  });
}

async function renderUsersPage(content) {
  const rows = await api('/api/users');
  const clinics = await preload('clinics').catch(() => []);
  const clinicMap = Object.fromEntries(clinics.map((item) => [String(item.id), item.name || item.code]));
  content.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <div class="left"><input id="search-users" class="search-input" placeholder="Buscar usuários" /></div>
          <div class="right"><button class="btn btn-primary" id="new-user-btn">Novo usuário</button></div>
        </div>
        <div id="users-table"></div>
      </div>
    </div>
  `;
  const host = document.getElementById('users-table');
  const search = document.getElementById('search-users');
  const renderTable = () => {
    const term = String(search.value || '').toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
    host.innerHTML = filtered.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Clínica</th><th>Ativo</th><th>Criado em</th></tr></thead>
        <tbody>
          ${filtered.map((row) => `
            <tr>
              <td>${escapeHtml(row.name || '-')}</td>
              <td>${escapeHtml(row.email || '-')}</td>
              <td>${statusBadge(row.role || '-')}</td>
              <td>${escapeHtml(clinicMap[String(row.clinic_id)] || '-')}</td>
              <td>${row.active ? statusBadge('Ativo') : statusBadge('Inativo')}</td>
              <td>${escapeHtml(formatDateTime(row.created_at))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    ` : '<div class="empty-state">Nenhum usuário cadastrado.</div>';
  };
  search.addEventListener('input', renderTable);
  document.getElementById('new-user-btn').addEventListener('click', () => openUserModal(clinics));
  renderTable();
}

function openUserModal(clinics) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div>
          <h3>Novo usuário</h3>
          <p class="card-subtitle">Somente ADMIN pode criar usuários.</p>
        </div>
        <button class="btn btn-ghost" data-close-modal>Fechar</button>
      </div>
      <div class="card-body">
        <form id="user-form" class="form-grid">
          ${renderField({ name: 'name', label: 'Nome', type: 'text', col: 6, required: true }, '')}
          ${renderField({ name: 'email', label: 'E-mail', type: 'email', col: 6, required: true }, '')}
          ${renderField({ name: 'password', label: 'Senha', type: 'text', col: 4, required: true }, '123456')}
          ${renderField({ name: 'role', label: 'Perfil', type: 'select', col: 4, options: statusOptions(['OPERADOR', 'ADMIN']) }, 'OPERADOR')}
          ${renderField({ name: 'clinic_id', label: 'Clínica', type: 'relation', col: 4 }, '', clinics.map((item) => ({ value: item.id, label: item.name || item.code })))}
          ${renderField({ name: 'active', label: 'Ativo', type: 'checkbox', col: 6 }, true)}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>Cancelar</button>
        <button class="btn btn-primary" id="save-user-btn">Criar usuário</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => overlay.remove()));
  document.getElementById('save-user-btn').addEventListener('click', async () => {
    try {
      const form = document.getElementById('user-form');
      await api('/api/users', {
        method: 'POST',
        body: {
          name: form.elements.name.value,
          email: form.elements.email.value,
          password: form.elements.password.value,
          role: form.elements.role.value,
          clinic_id: form.elements.clinic_id.value ? Number(form.elements.clinic_id.value) : null,
          active: form.elements.active.checked,
        },
      });
      overlay.remove();
      toast('Usuário criado com sucesso.', 'success');
      await render();
    } catch (error) {
      toast(error.message || 'Erro ao criar usuário.', 'error');
    }
  });
}

async function renderLicensePage(content) {
  state.license = await api('/api/license');
  persistSession();
  content.innerHTML = `
    <div class="two-col">
      <section class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Dados da licença</h3>
            <p class="card-subtitle">Consulta disponível para todos os perfis.</p>
          </div>
        </div>
        <div class="card-body">
          <form id="license-form" class="form-grid">
            ${renderField({ name: 'company_name', label: 'Empresa', type: 'text', col: 6 }, state.license.company_name)}
            ${renderField({ name: 'plan_name', label: 'Plano', type: 'text', col: 6 }, state.license.plan_name)}
            ${renderField({ name: 'status', label: 'Status', type: 'select', col: 4, options: statusOptions(['TRIAL', 'ATIVA', 'EXPIRADA']) }, state.license.status)}
            ${renderField({ name: 'activation_code', label: 'Código ativação', type: 'text', col: 4 }, state.license.activation_code)}
            ${renderField({ name: 'max_users', label: 'Máx. usuários', type: 'number', col: 4 }, state.license.max_users)}
            ${renderField({ name: 'expires_at', label: 'Expira em', type: 'datetime-local', col: 6 }, state.license.expires_at)}
            ${renderField({ name: 'grace_days', label: 'Dias carência', type: 'number', col: 3 }, state.license.grace_days)}
          </form>
          ${isAdmin() ? '<div style="margin-top:16px;"><button class="btn btn-primary" id="save-license-btn">Salvar licença</button></div>' : '<div class="info-box">Você pode visualizar a licença, mas apenas ADMIN pode editar.</div>'}
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h3 class="card-title">Resumo</h3><p class="card-subtitle">Situação atual do licenciamento.</p></div></div>
        <div class="card-body">
          <div class="panel-list">
            <div class="panel-item"><strong>Status</strong><span>${statusBadge(state.license.status)}</span></div>
            <div class="panel-item"><strong>Empresa</strong><span>${escapeHtml(state.license.company_name || '-')}</span></div>
            <div class="panel-item"><strong>Plano</strong><span>${escapeHtml(state.license.plan_name || '-')}</span></div>
            <div class="panel-item"><strong>Expira em</strong><span>${formatDateTime(state.license.expires_at)}</span></div>
            <div class="panel-item"><strong>Usuários máximos</strong><span>${escapeHtml(state.license.max_users || '-')}</span></div>
            <div class="panel-item"><strong>Dias restantes</strong><span>${escapeHtml(state.license.days_left || '-')}</span></div>
          </div>
        </div>
      </section>
    </div>
  `;
  if (isAdmin()) {
    document.getElementById('save-license-btn').addEventListener('click', async () => {
      try {
        const form = document.getElementById('license-form');
        await api('/api/license', {
          method: 'PUT',
          body: {
            company_name: form.elements.company_name.value,
            plan_name: form.elements.plan_name.value,
            status: form.elements.status.value,
            activation_code: form.elements.activation_code.value,
            max_users: Number(form.elements.max_users.value || 0),
            expires_at: form.elements.expires_at.value ? new Date(form.elements.expires_at.value).toISOString() : '',
            grace_days: Number(form.elements.grace_days.value || 0),
          },
        });
        toast('Licença atualizada com sucesso.', 'success');
        await render();
      } catch (error) {
        toast(error.message || 'Erro ao atualizar licença.', 'error');
      }
    });
  }
}

async function renderAuditsPage(content) {
  const rows = await api('/api/audits');
  content.innerHTML = `
    <div class="card">
      <div class="card-body">
        <div class="toolbar">
          <div class="left"><input id="search-audits" class="search-input" placeholder="Buscar por ator, ação ou entidade" /></div>
        </div>
        <div id="audits-table"></div>
      </div>
    </div>
  `;
  const host = document.getElementById('audits-table');
  const search = document.getElementById('search-audits');
  const renderTable = () => {
    const term = String(search.value || '').toLowerCase();
    const filtered = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
    host.innerHTML = filtered.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>Data</th><th>Ator</th><th>Ação</th><th>Entidade</th><th>Detalhe</th></tr></thead>
        <tbody>
          ${filtered.slice(0, 500).map((row) => `
            <tr>
              <td>${escapeHtml(formatDateTime(row.created_at))}</td>
              <td>${escapeHtml(row.actor || '-')}</td>
              <td>${statusBadge(row.action || '-')}</td>
              <td>${escapeHtml(row.entity || '-')}</td>
              <td>${escapeHtml(row.detail || '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    ` : '<div class="empty-state">Nenhuma auditoria encontrada.</div>';
  };
  search.addEventListener('input', renderTable);
  renderTable();
}

async function renderBackupPage(content) {
  content.innerHTML = `
    <div class="two-col">
      <section class="card">
        <div class="card-header"><div><h3 class="card-title">Exportação completa</h3><p class="card-subtitle">Baixe um JSON com recursos, usuários, auditorias e licença.</p></div></div>
        <div class="card-body">
          <button class="btn btn-primary" id="download-backup-btn">Baixar backup JSON</button>
          <div class="helper-text" style="margin-top:12px;">O arquivo será gerado pelo endpoint administrativo do backend.</div>
        </div>
      </section>
      <section class="card">
        <div class="card-header"><div><h3 class="card-title">Boas práticas</h3><p class="card-subtitle">Sugestões para uso seguro.</p></div></div>
        <div class="card-body">
          <div class="panel-list">
            <div class="panel-item"><strong>Periodicidade</strong><span>Faça exportações regulares antes de alterações grandes.</span></div>
            <div class="panel-item"><strong>Armazenamento</strong><span>Guarde o JSON em local seguro fora do VPS.</span></div>
            <div class="panel-item"><strong>Auditoria</strong><span>Combine backup com a tela de auditoria para rastreabilidade.</span></div>
          </div>
        </div>
      </section>
    </div>
  `;
  document.getElementById('download-backup-btn').addEventListener('click', async () => {
    try {
      const response = await api('/api/export/full-backup', { raw: true });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `agenda-clinica-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('Backup baixado com sucesso.', 'success');
    } catch (error) {
      toast(error.message || 'Erro ao baixar backup.', 'error');
    }
  });
}

window.addEventListener('hashchange', render);
loadSession();
render();
