const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const loginForm = document.getElementById('login-form');
const loginMessage = document.getElementById('login-message');
const logoutBtn = document.getElementById('logout-btn');
const apiStatus = document.getElementById('api-status');

const API = {
  login: '/api/auth/login',
  dashboard: '/api/dashboard/summary',
};

function setView(view) {
  loginView.classList.remove('active');
  dashboardView.classList.remove('active');
  view.classList.add('active');
}

function saveSession(data) {
  localStorage.setItem('agenda_token', data.token);
  localStorage.setItem('agenda_user', JSON.stringify(data.user));
  localStorage.setItem('agenda_license', JSON.stringify(data.license));
}

function clearSession() {
  localStorage.removeItem('agenda_token');
  localStorage.removeItem('agenda_user');
  localStorage.removeItem('agenda_license');
}

function getToken() {
  return localStorage.getItem('agenda_token');
}

function getUser() {
  const raw = localStorage.getItem('agenda_user');
  return raw ? JSON.parse(raw) : null;
}

function getLicense() {
  const raw = localStorage.getItem('agenda_license');
  return raw ? JSON.parse(raw) : null;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function fillUserAndLicense() {
  const user = getUser();
  const license = getLicense();

  document.getElementById('user-name').textContent = user?.name || '-';
  document.getElementById('user-email').textContent = user?.email || '-';
  document.getElementById('user-role').textContent = user?.role || '-';

  document.getElementById('license-status').textContent = license?.status || '-';
  document.getElementById('license-plan').textContent = license?.plan_name || '-';
  document.getElementById('license-company').textContent = license?.company_name || '-';
  document.getElementById('license-expires').textContent = license?.expires_at || '-';

  document.getElementById('welcome-text').textContent =
    user ? `Bem-vindo, ${user.name}` : 'Bem-vindo';
}

async function loadDashboard() {
  const token = getToken();
  if (!token) {
    setView(loginView);
    return;
  }

  try {
    const response = await fetch(API.dashboard, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Não foi possível carregar o dashboard.');
    }

    const data = await response.json();

    document.getElementById('card-clinics').textContent = data.clinics ?? 0;
    document.getElementById('card-professionals').textContent = data.professionals ?? 0;
    document.getElementById('card-patients').textContent = data.patients ?? 0;
    document.getElementById('card-appointments').textContent = data.appointments ?? 0;
    document.getElementById('card-sessions').textContent = data.sessions ?? 0;
    document.getElementById('card-audits').textContent = data.audits ?? 0;
    document.getElementById('card-receivables-open').textContent = formatMoney(data.receivables_open);
    document.getElementById('card-payables-open').textContent = formatMoney(data.payables_open);

    apiStatus.textContent = 'API conectada com sucesso.';
    setView(dashboardView);
  } catch (error) {
    apiStatus.textContent = error.message;
    clearSession();
    setView(loginView);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = 'Entrando...';

  const formData = new FormData(loginForm);
  const payload = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  try {
    const response = await fetch(API.login, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Falha no login.');
    }

    saveSession(data);
    fillUserAndLicense();
    await loadDashboard();
    loginMessage.textContent = '';
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', () => {
  clearSession();
  loginForm.reset();
  loginMessage.textContent = '';
  setView(loginView);
});

window.addEventListener('load', async () => {
  if (getToken()) {
    fillUserAndLicense();
    await loadDashboard();
  } else {
    setView(loginView);
  }
});
