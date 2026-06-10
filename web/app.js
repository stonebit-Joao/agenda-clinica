(() => {
  const STORAGE_KEY = 'agenda-clinica-pwa-state-v1';
  const app = document.getElementById('app');
  const timeSlots = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00'];
  const weekdayOrder = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const frequencyDays = { 'Semanal': 7, 'Quinzenal': 14, 'Mensal': 30 };
  let deferredPrompt = null;
  let dailyCallFrame = null;
  let dailyMountedSessionId = '';
  let dailyMountedRoomUrl = '';
  let dailyDraftSyncTimer = null;
  let dailyAutosaveTimer = null;
  let dailyConfigCache = null;
  let clinicalSpeechRecognition = null;
  let clinicalVoiceStream = null;
  let clinicalSpeechActive = false;
  let clinicalTimerInterval = null;
  let clinicalTimerSeconds = 0;
  let idleTimer = null;
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
  let patientSearchQuery = '';
  let patientProfessionalFilter = '';
  let autoBackupTimer = null;
  const AUTOBACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 min
  const AUTOBACKUP_KEY = 'agenda-clinica-autobackup';
  let communicationAutomationTimer = null;
  let sessionAlertTitleTimer = null;
  const COMMUNICATION_AUTOMATION_MS = 30000;
  const api = window.AgendaApi || null;
  const desktop = window.AgendaDesktop || null;
  const desktopInfo = desktop?.appInfo || {};
  const NAV_META = {
    dashboard: { label: 'Dashboard', icon: '📊' },
    clinicas: { label: 'Clínicas', icon: '🏥' },
    profissionais: { label: 'Profissionais', icon: '🧑‍⚕️' },
    pacientes: { label: 'Pacientes', icon: '🧾' },
    agendamentos: { label: 'Agendamentos', icon: '📅' },
    agenda: { label: 'Agenda Visual', icon: '🗓️' },
    atendimentos: { label: 'Atendimento Clínico', icon: '🩺' },
    recebimentos: { label: 'Contas a Receber', icon: '💰' },
    pagamentos: { label: 'Contas a Pagar', icon: '💸' },
    categorias: { label: 'Categorias de Despesa', icon: '🗂️' },
    caixa: { label: 'Caixa & Bancos', icon: '🏦' },
    relatorios: { label: 'Relatórios', icon: '📑' },
    auditoria: { label: 'Auditoria Real', icon: '🧷' },
    configuracoes: { label: 'Painel Admin', icon: '⚙️' }
  };
  function isDesktopApp() { return !!desktop?.isDesktop; }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsDataURL(file);
    });
  }
  function renderBrandLogo() {
    const logo = String(state?.settings?.logoDataUrl || '').trim();
    return logo
      ? `<div class="logo logo-image"><img src="${safe(logo)}" alt="Logo da clínica" /></div>`
      : `<div class="logo">AC</div>`;
  }
  function moduleHelpContent(route = state.meta?.route) {
    const content = {
      geral: {
        title: 'Ajuda Geral do Sistema',
        body: [
          '1. Cadastre a clínica e os profissionais.',
          '2. Cadastre os pacientes e vincule profissional + clínica.',
          '3. Gere os agendamentos e acompanhe pela Agenda Visual.',
          '4. Lance recebimentos, pagamentos e acompanhe Caixa & Bancos.',
          '5. Use o Atendimento Clínico para prontuário, SOAP e histórico.',
          '6. Faça backup frequente e revise a Auditoria Real.'
        ],
        required: 'Campos essenciais variam por módulo, mas clínica, profissional, paciente, data e valores financeiros precisam estar completos para o fluxo funcionar bem.'
      },
      dashboard: {
        title: 'Ajuda · Dashboard',
        body: ['Mostra visão executiva do sistema, indicadores financeiros e resumo operacional.', 'Use os filtros de clínica e mês para mudar o escopo global dos lançamentos.'],
        required: 'Para números corretos, mantenha pacientes, agendamentos, recebimentos e pagamentos atualizados.'
      },
      atendimentos: {
        title: 'Ajuda · Atendimento Clínico',
        body: ['Selecione uma sessão, registre resumo, gere SOAP e exporte prontuário.', 'As palavras-chave clínicas podem ser ajustadas diretamente nesta tela na biblioteca clínica.'],
        required: 'Paciente, sessão e resumo clínico são a base mínima para gerar evolução consistente.'
      },
      recebimentos: {
        title: 'Ajuda · Contas a Receber',
        body: ['Cadastre o título, depois use a baixa manual para registrar o valor efetivamente recebido.', 'Defina conta bancária e data do pagamento para manter Caixa & Bancos consistente.'],
        required: 'Paciente, clínica, valor previsto e vencimento não devem ficar em branco.'
      },
      pagamentos: {
        title: 'Ajuda · Contas a Pagar',
        body: ['Cadastre a despesa e use a baixa manual para registrar o pagamento real.', 'Escolha conta bancária e data do pagamento para refletir corretamente no caixa.'],
        required: 'Clínica, categoria, valor previsto e vencimento devem ser preenchidos.'
      },
      caixa: {
        title: 'Ajuda · Caixa & Bancos',
        body: ['Consolida entradas e saídas vindas de recebimentos, pagamentos e lançamentos.', 'Use esta área para acompanhar caixa total e saldos por conta.'],
        required: 'Os módulos financeiros precisam estar sendo alimentados corretamente.'
      },
      categorias: {
        title: 'Ajuda · Categorias de Despesa',
        body: ['Cadastre categorias padronizadas para usar em Contas a Pagar, Caixa & Bancos e Dashboard.', 'Mantenha nomes consistentes para evitar duplicidades e melhorar os relatórios.'],
        required: 'Informe pelo menos o nome da categoria. A descrição é opcional.'
      },
      relatorios: {
        title: 'Ajuda · Relatórios',
        body: ['Filtre por período, clínica e conta bancária para gerar relatórios financeiros e operacionais.', 'Você pode exportar CSV dos principais blocos para conferência externa.'],
        required: 'Defina o período desejado e, se necessário, refine por clínica e banco.'
      },
      configuracoes: {
        title: 'Ajuda · Painel Admin',
        body: ['Ajuste marca, senhas, logomarca, biblioteca clínica e ações administrativas.', 'Os botões de zerar dados foram separados por cor para reduzir risco operacional.'],
        required: 'Tenha cuidado ao usar ações de limpeza. Elas exigem perfil ADMIN.'
      }
    };
    return content[route] || content.geral;
  }
  function renderHelpModal() {
    if (!state.meta?.helpOpen) return '';
    const route = state.meta.helpOpen === 'geral' ? 'geral' : state.meta.route;
    const help = moduleHelpContent(route);
    return `
      <div class="overlay-modal-backdrop" id="help-backdrop">
        <div class="overlay-modal">
          <div class="spread"><h3>${safe(help.title)}</h3><button class="btn ghost" id="help-close-btn">Fechar</button></div>
          <div class="help-list">${help.body.map(item => `<div class="help-item">${safe(item)}</div>`).join('')}</div>
          <div class="notice"><strong>Campos essenciais:</strong> ${safe(help.required)}</div>
          <p class="footer-note">Atalho: pressione F1 para abrir ou fechar a ajuda do módulo atual.</p>
        </div>
      </div>`;
  }
  function renderOnboardingModal() {
    if (!state.meta?.onboardingOpen) return '';
    return `
      <div class="overlay-modal-backdrop" id="onboarding-backdrop">
        <div class="overlay-modal overlay-modal-lg">
          <div class="spread"><h3>Boas-vindas ao sistema</h3><button class="btn ghost" id="onboarding-skip-btn">Pular</button></div>
          <p>Esta é a primeira entrada no sistema. Configure a identidade da clínica e siga a ordem sugerida para começar certo.</p>
          <form id="onboarding-form" class="toolbar">
            <div class="field"><label>Nome comercial</label><input name="brandName" type="text" value="${safe(state.settings.brandName || 'Agenda Clínica')}" /></div>
            <div class="field"><label>Nome da clínica</label><input name="companyName" type="text" value="${safe(state.settings.companyName || '')}" /></div>
            <div class="field" style="grid-column:1/-1"><label>Logomarca da clínica</label><input name="logoFile" type="file" accept="image/*" />${state.settings.logoDataUrl ? '<div class="footer-note">Uma logomarca já está configurada.</div>' : ''}</div>
            <div class="notice" style="grid-column:1/-1"><strong>Ordem recomendada:</strong> 1. Clínica → 2. Profissionais → 3. Pacientes → 4. Agendamentos → 5. Financeiro → 6. Atendimento Clínico → 7. Relatórios / Auditoria.</div>
            <div class="flex" style="grid-column:1/-1"><button class="btn primary" type="submit">Salvar e continuar</button><button class="btn ghost" type="button" id="onboarding-open-admin-btn">Abrir Painel Admin</button></div>
          </form>
        </div>
      </div>`;
  }
  function renderAboutModal() {
    if (!state.meta?.aboutOpen) return '';
    const modeLabel = isDesktopApp() ? 'Desktop / offline' : (useBackend() ? 'Web / SaaS' : 'Web / local');
    const versionLabel = desktopInfo.version || 'web';
    const backupCount = listAutoBackups().length;
    const googleLabel = googleCalendarStatusText();
    return `
      <div class="overlay-modal-backdrop" id="about-backdrop">
        <div class="overlay-modal overlay-modal-lg">
          <div class="spread"><h3>Sobre o Agenda Clínica</h3><button class="btn ghost" id="about-close-btn">Fechar</button></div>
          <div class="help-list">
            <div class="help-item"><strong>Modo atual:</strong> ${safe(modeLabel)}</div>
            <div class="help-item"><strong>Versão:</strong> ${safe(versionLabel)}</div>
            <div class="help-item"><strong>Empresa:</strong> ${safe(state.settings.companyName || 'Sua Clínica')}</div>
            <div class="help-item"><strong>Plano:</strong> ${safe(state.settings.commercialPlan || 'Essentials')}</div>
            <div class="help-item"><strong>Google Calendar:</strong> ${safe(googleLabel)}</div>
            <div class="help-item"><strong>Backups automáticos locais:</strong> ${backupCount}</div>
          </div>
          <div class="notice">Esta tela resume o ambiente atual do sistema e deixa a versão web com o mesmo acabamento operacional da versão offline.</div>
          <p class="footer-note">No modo web, os backups automáticos ficam no navegador e podem ser restaurados pelo Painel Admin. No modo desktop, a persistência continua local na instalação.</p>
        </div>
      </div>`;
  }
  function renderGlobalOverlays() {
    return `${renderHelpModal()}${renderOnboardingModal()}${renderAboutModal()}`;
  }

  function todayIso() { return new Date().toISOString().slice(0,10); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function money(value) { return Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
  function safe(value) { return String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function toDate(value) { return value instanceof Date ? value : new Date(`${value}T00:00:00`); }
  function toIso(date) { return new Date(date).toISOString().slice(0,10); }
  function fmtDate(value) {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : value;
    return date.toLocaleDateString('pt-BR');
  }
  function fmtDateTime(date, time) { return `${fmtDate(date)} às ${time}`; }
  function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
  function startOfWeekMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return addDays(d, diff);
  }
  function endOfMonth(date) { return new Date(date.getFullYear(), date.getMonth()+1, 0); }
  function monthName(monthIndex) {
    return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][monthIndex];
  }
  function normalizeWeekday(name) {
    const n = String(name || '').trim().toLowerCase();
    const map = { domingo:0, segunda:1, 'terça':2, terca:2, quarta:3, quinta:4, sexta:5, 'sábado':6, sabado:6 };
    return map[n];
  }
  function uid(prefix) { return `${prefix}-${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`.toUpperCase(); }
  function nextCode(prefix, list) {
    const max = list.reduce((acc, item) => {
      const m = String(item.code || '').match(/(\d+)$/);
      return Math.max(acc, m ? Number(m[1]) : 0);
    }, 0) + 1;
    const len = prefix === 'AGD' || prefix === 'REC' ? 4 : 3;
    return `${prefix}-${String(max).padStart(len,'0')}`;
  }
  function appointmentConfigKey(patient) {
    return [patient.name, patient.professionalName, patient.clinicName, patient.frequency, patient.weekday, patient.time, Number(patient.monthlyFee||0).toFixed(2), patient.paymentDay].join('|').toUpperCase();
  }
  function receiveStatus(rec) {
    const paid = Number(rec.amountPaid || 0);
    const planned = Number(rec.amountPlanned || 0);
    if (paid >= planned && planned > 0) return 'Pago';
    if (paid > 0 && paid < planned) return 'Parcial';
    if (new Date(`${rec.dueDate}T00:00:00`) < new Date(`${todayIso()}T00:00:00`)) return 'Atrasado';
    return 'Em Aberto';
  }
  function whatsappLink(phone, text) {
    const digits = String(phone || '').replace(/\D/g,'');
    if (!digits) return '';
    return `https://wa.me/55${digits}?text=${encodeURIComponent(text)}`;
  }

  function normalizePhoneDigits(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('55') && digits.length >= 12) return digits.slice(2);
    return digits;
  }
  function formatSessionMode(value) {
    return /presencial/i.test(String(value || '')) ? 'Presencial' : 'Online';
  }
  function simpleHash(text) {
    let hash = 0;
    for (const ch of String(text || '')) {
      hash = ((hash << 5) - hash) + ch.charCodeAt(0);
      hash |= 0;
    }
    return Math.abs(hash);
  }
  function buildLicenseKey(settings = state?.settings || {}) {
    const clinic = String(settings.licenseClinicName || settings.companyName || 'Sua Clínica').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'CLINIC';
    const limit = String(Math.max(1, Number(settings.licenseOperatorLimit || 3))).padStart(2, '0');
    const expiry = String(settings.licenseExpiresAt || 'PERMANENTE').replace(/\D/g, '').slice(2) || 'PERMANENTE';
    const hash = simpleHash(`${clinic}|${limit}|${expiry}|AGENDA-CLINICA`).toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
    return `LIC-${clinic}-${limit}-${expiry}-${hash}`;
  }
  function ensureAccessSettings() {
    state ||= { meta: {}, settings: {} };
    state.meta ||= {};
    state.settings ||= {};
    state.meta.communication ||= { upcomingAlerted: {}, tomorrowAlerted: {}, pendingLinks: [] };
    state.settings.localUsers ||= [];
    state.settings.licenseClinicName = String(state.settings.licenseClinicName || state.settings.companyName || 'Sua Clínica').trim() || 'Sua Clínica';
    state.settings.licenseOperatorLimit = Math.max(1, Number(state.settings.licenseOperatorLimit || 3));
    state.settings.licenseExpiresAt = String(state.settings.licenseExpiresAt || '').trim();
    state.settings.licenseKey = String(state.settings.licenseKey || '').trim();
    state.settings.enableUpcomingSessionAlert = state.settings.enableUpcomingSessionAlert !== false;
    state.settings.enableProfessionalReminder = state.settings.enableProfessionalReminder !== false;
    state.settings.enablePatientReminder = state.settings.enablePatientReminder !== false;
    state.settings.sessionAlertLeadMinutes = Math.max(1, Number(state.settings.sessionAlertLeadMinutes || 10));
    state.settings.eveReminderHour = Math.min(23, Math.max(0, Number(state.settings.eveReminderHour ?? 19)));
    state.settings.whatsappApiEnabled = !!state.settings.whatsappApiEnabled;
    state.settings.whatsappApiVersion = String(state.settings.whatsappApiVersion || 'v22.0');
    state.settings.whatsappPhoneNumberId = String(state.settings.whatsappPhoneNumberId || '').trim();
    state.settings.whatsappAccessToken = String(state.settings.whatsappAccessToken || '').trim();
    state.settings.whatsappBusinessNumber = String(state.settings.whatsappBusinessNumber || '').trim();
    state.settings.licensePreviewKey = buildLicenseKey(state.settings);
    state.settings.localUsers = (state.settings.localUsers || []).map((user, index) => ({
      id: String(user.id || uid('USR')),
      name: String(user.name || (index === 0 ? 'Administrador' : `Operador ${index}`)).trim(),
      role: String(user.role || (index === 0 ? 'ADMIN' : 'OPERADOR')).toUpperCase(),
      password: String(user.password || (String(user.role || '').toUpperCase() === 'ADMIN' ? state.settings.adminPassword : state.settings.operatorPassword)).trim(),
      status: String(user.status || 'Ativo'),
      createdAt: user.createdAt || new Date().toISOString()
    }));
    let adminUser = state.settings.localUsers.find(user => user.role === 'ADMIN');
    if (!adminUser) {
      adminUser = { id: uid('USR'), name: 'Administrador', role: 'ADMIN', password: String(state.settings.adminPassword || 'Admin@2026').trim(), status: 'Ativo', createdAt: new Date().toISOString() };
      state.settings.localUsers.unshift(adminUser);
    }
    adminUser.password = String(state.settings.adminPassword || adminUser.password || 'Admin@2026').trim();
    adminUser.name = adminUser.name || 'Administrador';
    adminUser.status = 'Ativo';
    const activeOperators = state.settings.localUsers.filter(user => user.role === 'OPERADOR');
    if (!activeOperators.length) {
      state.settings.localUsers.push({ id: uid('USR'), name: 'Operador 1', role: 'OPERADOR', password: String(state.settings.operatorPassword || 'Operador@2026').trim(), status: 'Ativo', createdAt: new Date().toISOString() });
    }
    state.settings.localUsers = state.settings.localUsers.filter((user, index, list) => index === list.findIndex(item => String(item.id) === String(user.id)));
    const firstOperator = state.settings.localUsers.find(user => user.role === 'OPERADOR');
    if (firstOperator) state.settings.operatorPassword = String(firstOperator.password || state.settings.operatorPassword || 'Operador@2026').trim();
  }
  function activeLocalUsers() {
    ensureAccessSettings();
    return (state.settings.localUsers || []).filter(user => String(user.status || 'Ativo') !== 'Inativo');
  }
  function localUserById(id) {
    ensureAccessSettings();
    return (state.settings.localUsers || []).find(user => String(user.id) === String(id));
  }
  function licenseStatus() {
    ensureAccessSettings();
    const backendLicense = state.meta?.backendLicense || null;
    if (!isDesktopApp() && (useBackend() || state.session?.authMode === 'saas') && backendLicense) {
      if (backendLicense.active) return { valid: true, expected: backendLicense.activationCode || '', source: 'backend', status: backendLicense.status || 'ATIVA', daysLeft: backendLicense.daysLeft };
      return { valid: false, reason: backendLicense.status === 'EXPIRADA' ? 'A licença do backend está expirada.' : 'A licença do backend está suspensa ou inativa.', expected: backendLicense.activationCode || '', source: 'backend', status: backendLicense.status || '', daysLeft: backendLicense.daysLeft };
    }
    const expected = buildLicenseKey(state.settings);
    const configured = String(state.settings.licenseKey || '').trim();
    if (configured && configured !== expected) return { valid: false, reason: 'A chave da licença não confere com os dados configurados.', expected, source: 'local' };
    if (state.settings.licenseExpiresAt) {
      const end = new Date(`${state.settings.licenseExpiresAt}T23:59:59`);
      if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return { valid: false, reason: 'A licença local está expirada.', expected, source: 'local' };
    }
    return { valid: true, expected, source: 'local' };
  }
  async function sendWhatsAppMessage(phone, text, options = {}) {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return { status: 'skipped', reason: 'sem_telefone' };
    ensureAccessSettings();
    const link = whatsappLink(digits, text);
    const apiEnabled = !!(state.settings.whatsappApiEnabled && state.settings.whatsappPhoneNumberId && state.settings.whatsappAccessToken);
    if (apiEnabled) {
      const response = await fetch(`https://graph.facebook.com/${state.settings.whatsappApiVersion}/${state.settings.whatsappPhoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.settings.whatsappAccessToken}`
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: `55${digits}`, type: 'text', text: { body: String(text || '').slice(0, 4096) } })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || 'Falha ao enviar pelo WhatsApp oficial.');
      return { status: 'api', link, data };
    }
    state.meta.communication.pendingLinks ||= [];
    state.meta.communication.pendingLinks.unshift({ at: new Date().toISOString(), phone: digits, text, link });
    state.meta.communication.pendingLinks = state.meta.communication.pendingLinks.slice(0, 50);
    saveState();
    if (options.openFallback) window.open(link, '_blank');
    return { status: 'local', link };
  }
  function appointmentSessionMode(appointment) {
    const patient = patientById(appointment?.patientId);
    return formatSessionMode(appointment?.sessionMode || patient?.sessionMode || 'Online');
  }
  function appointmentStartsSoon(appointment, leadMinutes = Number(state.settings?.sessionAlertLeadMinutes || 10)) {
    if (!appointment || String(appointment.status || '').toUpperCase() !== 'AGENDADO' || appointment.date !== todayIso() || !appointment.time) return false;
    const startAt = new Date(`${appointment.date}T${appointment.time}:00`);
    const diff = Math.round((startAt.getTime() - Date.now()) / 60000);
    return diff >= 0 && diff <= Number(leadMinutes || 10);
  }
  async function notifyUpcomingAppointments(force = false) {
    ensureAccessSettings();
    if (!state.session || !state.settings.enableUpcomingSessionAlert) return 0;
    const soon = (state.appointments || []).filter(item => appointmentStartsSoon(item, state.settings.sessionAlertLeadMinutes));
    let sent = 0;
    for (const appointment of soon) {
      const key = `${appointment.id}|${appointment.date}|${appointment.time}`;
      if (!force && state.meta.communication.upcomingAlerted[key]) continue;
      const patient = patientById(appointment.patientId);
      const professional = professionalById(appointment.professionalId);
      const mode = appointmentSessionMode(appointment).toLowerCase();
      const patientText = `Olá ${appointment.patientName}, sua sessão ${mode} começa às ${appointment.time}. Se precisar de suporte, responda esta mensagem.`;
      const professionalText = `Lembrete: ${appointment.patientName} às ${appointment.time} (${mode})${appointment.clinicName ? ` · ${appointment.clinicName}` : ''}.`;
      if (state.settings.enablePatientReminder && (appointment.phone || patient?.phone)) {
        try { await sendWhatsAppMessage(appointment.phone || patient?.phone, patientText, { openFallback: false }); } catch (_) {}
      }
      if (state.settings.enableProfessionalReminder && professional?.phone) {
        try { await sendWhatsAppMessage(professional.phone, professionalText, { openFallback: false }); } catch (_) {}
      }
      state.meta.communication.upcomingAlerted[key] = new Date().toISOString();
      sent += 1;
    }
    if (soon.length) {
      document.body.classList.add('session-alert-active');
      clearTimeout(sessionAlertTitleTimer);
      const baseTitle = String(state.settings.brandName || 'Agenda Clínica');
      document.title = `⚠ Sessões próximas · ${baseTitle}`;
      sessionAlertTitleTimer = setTimeout(() => { document.title = baseTitle; document.body.classList.remove('session-alert-active'); }, 12000);
    } else {
      document.body.classList.remove('session-alert-active');
    }
    if (sent) saveState();
    return sent;
  }
  async function runTomorrowReminderBatch(force = false) {
    ensureAccessSettings();
    if (!state.session || !state.settings.enablePatientReminder) return 0;
    const now = new Date();
    const hour = now.getHours();
    const batchKey = `${todayIso()}|${hour}`;
    if (!force && hour !== Number(state.settings.eveReminderHour || 19)) return 0;
    if (!force && state.meta.communication.lastTomorrowBatchKey === batchKey) return 0;
    const tomorrow = toIso(addDays(new Date(), 1));
    const items = (state.appointments || []).filter(item => String(item.status || '').toUpperCase() === 'AGENDADO' && item.date === tomorrow);
    let sent = 0;
    for (const appointment of items) {
      const reminderKey = `${appointment.id}|${tomorrow}`;
      if (!force && state.meta.communication.tomorrowAlerted[reminderKey]) continue;
      const mode = appointmentSessionMode(appointment).toLowerCase();
      const text = `Olá ${appointment.patientName}, lembrete da sua sessão ${mode} amanhã, ${fmtDate(appointment.date)}, às ${appointment.time}.`;
      try {
        const result = await sendWhatsAppMessage(appointment.phone || patientById(appointment.patientId)?.phone, text, { openFallback: false });
        if (result.status !== 'skipped') {
          state.meta.communication.tomorrowAlerted[reminderKey] = new Date().toISOString();
          sent += 1;
        }
      } catch (_) {}
    }
    state.meta.communication.lastTomorrowBatchKey = batchKey;
    if (sent || force) saveState();
    return sent;
  }
  function renderAccessAutomationFields() {
    ensureAccessSettings();
    const license = licenseStatus();
    const backendManaged = !isDesktopApp() && useBackend() && Array.isArray(state.meta?.backendUsers);
    const managedUsers = backendManaged ? (state.meta.backendUsers || []) : (state.settings.localUsers || []);
    const operatorRows = managedUsers.map(user => `
      <tr>
        <td>${safe(user.name)}</td>
        <td>${safe(user.email || '—')}</td>
        <td>${safe(user.role)}</td>
        <td>${safe(user.status || (user.active === false ? 'Inativo' : 'Ativo'))}</td>
        <td>${(user.role === 'ADMIN') ? '<span class="badge info">Fixo</span>' : `<button class="btn ghost js-remove-local-user" type="button" data-user-id="${safe(user.id)}">Remover</button>`}</td>
      </tr>
    `).join('');
    const licenseKeyInput = backendManaged
      ? `<div class="field"><label>Chave da licença</label><input name="licenseKey" type="text" value="${safe(state.settings.licenseKey || license.expected || '')}" readonly /></div><div class="field" style="grid-column:1/-1"><label>Validação</label><input type="text" value="Gerada e validada pelo backend" readonly /></div>`
      : `<div class="field"><label>Chave da licença</label><input name="licenseKey" type="text" value="${safe(state.settings.licenseKey || state.settings.licensePreviewKey || '')}" /></div><div class="field" style="grid-column:1/-1"><label>Prévia da chave</label><input type="text" value="${safe(state.settings.licensePreviewKey || '')}" readonly /></div>`;
    return `
      <div class="field"><label>Nome da licença</label><input name="licenseClinicName" type="text" value="${safe(state.settings.licenseClinicName || '')}" required /></div>
      <div class="field"><label>Limite de operadores</label><input name="licenseOperatorLimit" type="number" min="1" max="99" value="${Number(state.settings.licenseOperatorLimit || 3)}" required /></div>
      <div class="field"><label>Licença válida até</label><input name="licenseExpiresAt" type="date" value="${safe(state.settings.licenseExpiresAt || '')}" /></div>
      ${licenseKeyInput}
      <div class="field"><label>Alerta de sessão próxima</label><select name="enableUpcomingSessionAlert"><option value="1" ${state.settings.enableUpcomingSessionAlert ? 'selected' : ''}>Ligado</option><option value="0" ${!state.settings.enableUpcomingSessionAlert ? 'selected' : ''}>Desligado</option></select></div>
      <div class="field"><label>Antecedência do alerta</label><input name="sessionAlertLeadMinutes" type="number" min="1" max="180" value="${Number(state.settings.sessionAlertLeadMinutes || 10)}" required /></div>
      <div class="field"><label>Lembrete para paciente</label><select name="enablePatientReminder"><option value="1" ${state.settings.enablePatientReminder ? 'selected' : ''}>Ligado</option><option value="0" ${!state.settings.enablePatientReminder ? 'selected' : ''}>Desligado</option></select></div>
      <div class="field"><label>Lembrete para profissional</label><select name="enableProfessionalReminder"><option value="1" ${state.settings.enableProfessionalReminder ? 'selected' : ''}>Ligado</option><option value="0" ${!state.settings.enableProfessionalReminder ? 'selected' : ''}>Desligado</option></select></div>
      <div class="field"><label>Hora do lembrete da véspera</label><input name="eveReminderHour" type="number" min="0" max="23" value="${Number(state.settings.eveReminderHour || 19)}" required /></div>
      <div class="field"><label>WhatsApp oficial</label><select name="whatsappApiEnabled"><option value="0" ${!state.settings.whatsappApiEnabled ? 'selected' : ''}>Desligado</option><option value="1" ${state.settings.whatsappApiEnabled ? 'selected' : ''}>Ligado</option></select></div>
      <div class="field"><label>Versão da API</label><input name="whatsappApiVersion" type="text" value="${safe(state.settings.whatsappApiVersion || 'v22.0')}" /></div>
      <div class="field"><label>Phone Number ID</label><input name="whatsappPhoneNumberId" type="text" value="${safe(state.settings.whatsappPhoneNumberId || '')}" /></div>
      <div class="field"><label>Token do WhatsApp</label><input name="whatsappAccessToken" type="password" value="${safe(state.settings.whatsappAccessToken || '')}" /></div>
      <div class="field"><label>Número comercial</label><input name="whatsappBusinessNumber" type="text" value="${safe(state.settings.whatsappBusinessNumber || '')}" placeholder="5511999999999" /></div>
      <div class="field" style="grid-column:1/-1">
        <label>${backendManaged ? 'Usuários do backend' : 'Usuários locais'}</label>
        <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead><tbody>${operatorRows}</tbody></table></div>
        <div class="footer-note">Status da licença: <strong>${license.valid ? 'Válida' : safe(license.reason || 'Inválida')}</strong>. ${backendManaged ? 'As senhas são gerenciadas no backend e não são exibidas no painel.' : `Links locais pendentes: ${(state.meta.communication.pendingLinks || []).length}.`}</div>
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>${backendManaged ? 'Novo operador do backend' : 'Novo operador local'}</label>
        <div id="local-user-form" class="form-grid four operator-inline-grid">
          <div class="field"><label>Nome</label><input id="new-local-user-name" type="text" placeholder="Operador" /></div>
          <div class="field"><label>Email</label><input id="new-local-user-email" type="email" placeholder="operador@clinica.com" /></div>
          <div class="field"><label>Senha</label><input id="new-local-user-password" type="password" placeholder="Senha do operador" /></div>
          <div class="field"><label>Status</label><select id="new-local-user-status"><option>Ativo</option><option>Inativo</option></select></div>
          <div class="field" style="grid-column:1/-1"><button class="btn ghost" id="js-add-operator" type="button">Adicionar operador</button></div>
        </div>
      </div>
      <div class="field" style="grid-column:1/-1">
        <label>Ações rápidas</label>
        <div class="flex"><button class="btn ghost" id="test-upcoming-alert-btn" type="button">Testar alerta de sessão</button><button class="btn ghost" id="run-tomorrow-reminders-btn" type="button">Rodar lembrete da véspera</button></div>
      </div>
    `;
  }
  function bindRequiredFieldUX(root = document) {
    root.querySelectorAll('input[required], select[required], textarea[required]').forEach(field => {
      const wrap = field.closest('.field');
      if (wrap) wrap.classList.add('required-field');
      const sync = () => {
        const invalid = !field.checkValidity();
        if (wrap) wrap.classList.toggle('field-error', invalid);
      };
      field.addEventListener('input', sync);
      field.addEventListener('change', sync);
      sync();
    });
  }
  function ensureRequiredGuard(root = document) {
    root.querySelectorAll('form').forEach(form => {
      if (form.dataset.requiredGuardBound === '1') return;
      form.dataset.requiredGuardBound = '1';
      bindRequiredFieldUX(form);
      form.addEventListener('submit', event => {
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) {
          event.preventDefault();
          event.stopPropagation();
          const firstInvalid = form.querySelector(':invalid');
          firstInvalid?.focus?.();
          alert('Preencha os campos obrigatórios destacados antes de salvar.');
        }
      }, true);
    });
  }
  function startCommunicationAutomation() {
    clearInterval(communicationAutomationTimer);
    notifyUpcomingAppointments().catch(() => {});
    runTomorrowReminderBatch().catch(() => {});
    communicationAutomationTimer = setInterval(() => {
      notifyUpcomingAppointments().catch(() => {});
      runTomorrowReminderBatch().catch(() => {});
    }, COMMUNICATION_AUTOMATION_MS);
  }
  function stopCommunicationAutomation() {
    clearInterval(communicationAutomationTimer);
    communicationAutomationTimer = null;
    clearTimeout(sessionAlertTitleTimer);
    sessionAlertTitleTimer = null;
    document.body.classList.remove('session-alert-active');
    document.title = String(state?.settings?.brandName || 'Agenda Clínica');
  }

  function generateInitialAnamnesisTemplate(patient = null) {
    return [
      `Queixa principal: ${patient?.clinicalAlerts || ''}`,
      'História da demanda atual:',
      'Início e evolução dos sintomas:',
      'Contexto familiar e social:',
      'Histórico de tratamentos anteriores:',
      `Medicações em uso: ${patient?.medications || ''}`,
      `Doenças / diagnósticos: ${patient?.diseases || ''}`,
      'Objetivos terapêuticos iniciais:',
      'Hipóteses clínicas / pontos de atenção:'
    ].join('\n');
  }
  function generateClinicalEvolution({ patientName = '', date = '', mainReason = '', summary = '', subjective = '', objective = '', assessment = '', plan = '' } = {}) {
    return [
      `Evolução clínica de ${patientName || 'paciente'} em ${date || fmtDate(todayIso())}.`,
      mainReason ? `Motivo principal relatado: ${mainReason}.` : '',
      summary ? `Resumo da sessão: ${summary}` : '',
      subjective ? `No campo subjetivo, observou-se: ${subjective}` : '',
      objective ? `No campo objetivo, registrou-se: ${objective}` : '',
      assessment ? `A avaliação clínica indica: ${assessment}` : '',
      plan ? `Conduta e plano: ${plan}` : '',
      'Registro gerado para continuidade do cuidado e acompanhamento terapêutico.'
    ].filter(Boolean).join(' ');
  }
  function buildSoapClipboardText(session) {
    const date = fmtDate(session?.scheduledDate || todayIso());
    return [
      `REGISTRO CLÍNICO — ${String(session?.patientName || '')} — ${date}`,
      session?.mainReason ? `\nMOTIVO PRINCIPAL: ${session.mainReason}` : '',
      session?.anamnesisInitial ? `\nANAMNESE INICIAL:\n${session.anamnesisInitial}` : '',
      session?.summary ? `\nRESUMO: ${session.summary}` : '',
      session?.fullEvolution ? `\nEVOLUÇÃO CLÍNICA COMPLETA:\n${session.fullEvolution}` : '',
      '\nSOAP',
      session?.soapSubjective ? `S (Subjetivo): ${session.soapSubjective}` : '',
      session?.soapObjective ? `O (Objetivo): ${session.soapObjective}` : '',
      session?.soapAssessment ? `A (Avaliação): ${session.soapAssessment}` : '',
      session?.soapPlan ? `P (Plano): ${session.soapPlan}` : '',
      (session?.keywords || []).length ? `\nPalavras-chave: ${(session.keywords || []).join(', ')}` : ''
    ].filter(Boolean).join('\n');
  }
  function buildPrintDocumentHtml(title, bodyHtml) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${safe(title)}</title><style>
      body{font-family:Inter,Arial,sans-serif;padding:24px;color:#132033;background:#eef3f9}
      .print-sheet{max-width:920px;margin:0 auto;background:#fff;border:1px solid #d8e1ec;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.08)}
      .print-header{padding:28px 34px;background:linear-gradient(135deg,#10325f,#1a73e8);color:#fff}
      .print-header h1{font-size:28px;margin:0 0 6px}
      .print-header .sub{opacity:.92;font-size:14px;line-height:1.6}
      .print-body{padding:28px 34px}
      .print-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:18px 0}
      .print-card{border:1px solid #d8e1ec;border-radius:14px;padding:14px 16px;background:#f8fbff}
      .print-card label{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#56708f;margin-bottom:6px}
      .print-card div,.print-card p{font-size:13px;line-height:1.65;margin:0;color:#132033}
      h2{font-size:17px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #e4eaf2;color:#10325f}
      p,div,pre,li{font-size:13px;line-height:1.7}
      pre{white-space:pre-wrap;background:#f7f9fc;padding:14px;border:1px solid #dde5ef;border-radius:12px}
      .meta{color:#4a5d75;margin-top:8px;font-size:13px}
      .soap-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px}
      .alert-box{background:#fff8e6;border:1px solid #f0d58a;color:#7a5a00;padding:12px 14px;border-radius:12px}
      .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e4eaf2;color:#6b7f96;font-size:11px}
      @media print{body{background:#fff;padding:0}.print-sheet{box-shadow:none;border:none;border-radius:0;max-width:none}button{display:none}.print-grid,.soap-grid{grid-template-columns:1fr 1fr}.print-header{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="print-sheet">${bodyHtml}</div></body></html>`;
  }
  function openPrintWindow(title, bodyHtml) {
    const html = buildPrintDocumentHtml(title, bodyHtml);
    try {
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.style.opacity = '0';
      const cleanup = () => { try { frame.remove(); } catch {} };
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      if (!doc) throw new Error('Documento de impressão indisponível.');
      doc.open();
      doc.write(html + `<script>window.onload=()=>setTimeout(()=>{document.title=${JSON.stringify('')};window.focus();window.print();},280)</script>`.replace(JSON.stringify(''), JSON.stringify(String(title || 'Relatório'))));
      doc.close();
      setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          setTimeout(cleanup, 2000);
        } catch (error) {
          cleanup();
          alert('Não foi possível abrir a impressão neste ambiente. Use o navegador padrão ou a exportação CSV enquanto finalizamos a exportação PDF nativa.');
        }
      }, 500);
      return;
    } catch (error) {
      const win = window.open('about:blank', '_blank', 'width=1100,height=920');
      if (!win) throw new Error('Não foi possível abrir a janela de impressão.');
      win.document.write(html + `<script>window.onload=()=>setTimeout(()=>{document.title=${JSON.stringify('')};window.print();},280)</script>`.replace(JSON.stringify(''), JSON.stringify(String(title || 'Relatório'))));
      win.document.close();
    }
  }
  /* ---- BACKUP AUTOMÁTICO ---- */
  function doAutoBackup(triggerDownload = false) {
    try {
      const now = new Date();
      const ts = now.toISOString().replace('T',' ').slice(0,16);
      const snapshot = JSON.parse(JSON.stringify(state));
      const entry = { ts, data: snapshot, patients: snapshot.patients?.length || 0, sessions: snapshot.sessions?.length || 0, appointments: snapshot.appointments?.length || 0 };
      const existing = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]');
      existing.unshift(entry);
      const trimmed = existing.slice(0, 10); // manter 10 backups
      localStorage.setItem(AUTOBACKUP_KEY, JSON.stringify(trimmed));
      // Atualizar timestamp do último backup visível no topo
      const badge = document.getElementById('last-autobackup-badge');
      if (badge) badge.textContent = `💾 Backup: ${ts}`;
      // Se solicitado (backup manual), baixar o arquivo .json
      if (triggerDownload) {
        const pad = n => String(n).padStart(2,'0');
        const fname = `agenda-clinica-backup-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fname;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch {}
  }
  function startAutoBackup() {
    clearInterval(autoBackupTimer);
    doAutoBackup(); // faz o primeiro imediatamente
    autoBackupTimer = setInterval(doAutoBackup, AUTOBACKUP_INTERVAL_MS);
  }
  function stopAutoBackup() {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  function listAutoBackups() {
    try { return JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]'); } catch { return []; }
  }
  function restoreAutoBackup(index) {
    const list = listAutoBackups();
    const entry = list[index];
    if (!entry) return false;
    const preserved = clone(state.settings);
    const preserved2 = clone(state.session);
    Object.assign(state, clone(entry.data));
    state.settings = { ...state.settings, ...preserved };
    state.session = preserved2;
    saveState();
    return true;
  }
  function downloadAutoBackup(index) {
    const list = listAutoBackups();
    const entry = list[index];
    if (!entry) return false;
    const safeTs = String(entry.ts || 'backup').replace(/[\/: ]/g, '-');
    const blob = new Blob([JSON.stringify(entry.data || {}, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `agenda-clinica-autobackup-${safeTs}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    return true;
  };
  function logoutSession(reason = 'Logout', detail = 'Sessão encerrada.') {
    if (!state.session) return;
    const previous = clone(state.session);
    try { audit(reason, detail, { entity: 'session', before: previous, after: null }); } catch {}
    state.session = null;
    stopClinicalTimer();
    stopClinicalVoiceCapture({ keepStatus: true });
    stopDailyAutomation();
    stopAutoBackup();
    clearTimeout(idleTimer);
    idleTimer = null;
    if (api) api.clearToken();
    saveState();
    render();
  }
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!state.session) return;
    idleTimer = setTimeout(() => {
      alert('Sistema bloqueado por inatividade. Faça login novamente para continuar.');
      logoutSession('Bloqueio automático', 'Sessão bloqueada após período de inatividade.');
    }, IDLE_TIMEOUT_MS);
  }
  function attachIdleActivityListeners() {
    ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(eventName => {
      window.addEventListener(eventName, () => { if (state.session) resetIdleTimer(); }, { passive: true });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.session) resetIdleTimer(); });
  }

  function defaultState() {
    const now = todayIso();
    return {
      meta: {
        appName: 'Agenda Clínica PWA',
        sourceWorkbook: 'Planilha_Agenda_Visual_Automatica_v22_agenda_visual_horarios_corrigidos_safe2.xlsm',
        createdAt: new Date().toISOString(),
        route: 'dashboard',
        agendaMode: 'Semana atual',
        agendaRefDate: now,
        clinicFilter: 'Todas as clínicas',
        monthFilter: 'Todos',
        reportClinicFilter: 'Todas as clínicas',
        reportBankFilter: 'Todas as contas',
        reportStartDate: `${new Date().getFullYear()}-01-01`,
        reportEndDate: now,
        reportType: 'summary',
        patientSearch: '',
        selectedClinicalSessionId: '',
        aboutOpen: false
      },
      settings: {
        adminPassword: 'Admin@2026',
        operatorPassword: 'Operador@2026',
        brandName: 'Agenda Clínica',
        companyName: 'Sua Clínica',
        supportEmail: 'suporte@clinica.local',
        commercialPlan: 'Essentials',
        authMode: 'local',
        backendUrl: 'http://127.0.0.1:8000',
        backendEmail: 'admin@agendaclinica.local',
        dailyDomain: '',
        dailyApiKey: '',
        consentTemplate: 'Autorizo o registro da sessão por gravação e transcrição exclusivamente para fins clínicos, prontuário, auditoria e continuidade terapêutica, conforme as políticas da clínica.',
        clinicalKeywordLibrary: 'DEPRESSÃO, ANSIEDADE, ANGÚSTIA, MEDO, INSEGURANÇA, FOBIA, PÂNICO, BURNOUT, BORDERLINE, BIPOLARIDADE, RAIVA, MÁGOA, ÓDIO',
        localUsers: [],
        licenseClinicName: 'Sua Clínica',
        licenseOperatorLimit: 3,
        licenseExpiresAt: '',
        licenseKey: '',
        enableUpcomingSessionAlert: true,
        enableProfessionalReminder: true,
        enablePatientReminder: true,
        sessionAlertLeadMinutes: 10,
        eveReminderHour: 19,
        whatsappApiEnabled: false,
        whatsappApiVersion: 'v22.0',
        whatsappPhoneNumberId: '',
        whatsappAccessToken: '',
        whatsappBusinessNumber: '',
        logoDataUrl: '',
        firstRunCompleted: false,
        googleCalendarSyncEnabled: false,
        googleCalendarClientId: '',
        googleCalendarClientSecret: '',
        googleCalendarProjectId: '',
        googleCalendarAuthUri: 'https://accounts.google.com/o/oauth2/v2/auth',
        googleCalendarTokenUri: 'https://oauth2.googleapis.com/token',
        googleCalendarCalendarId: 'primary',
        googleCalendarScopes: 'https://www.googleapis.com/auth/calendar',
        googleCalendarAccessToken: '',
        googleCalendarRefreshToken: '',
        googleCalendarTokenType: 'Bearer',
        googleCalendarTokenExpiresAt: 0,
        googleCalendarConnectedAt: '',
        googleCalendarLastSyncAt: '',
        googleCalendarLastValidatedAt: '',
        googleCalendarCalendarSummary: '',
        googleCalendarCalendarTimeZone: '',
        googleCalendarCalendarAccessRole: '',
        googleCalendarLastError: '',
        googleCalendarLastSyncSummary: ''
      },
      session: null,
      clinics: [
        { id: uid('CLI'), code: 'CLI-001', name: 'Clínica Saúde da Alma', cnpj: '', manager: '', phone: '', email: '', address: '', status: 'Ativo', createdAt: now }
      ],
      professionals: [
        { id: uid('PRO'), code: 'PRO-001', name: 'João Rocha', specialty: '', registry: '', phone: '', email: '', clinicName: 'Clínica Saúde da Alma', status: 'Ativo', createdAt: now }
      ],
      patients: [],
      appointments: [],
      receivables: [],
      payables: [],
      expenseCategories: [
        { id: uid('CAT'), code: 'CAT-001', name: 'Aluguel', description: 'Despesas fixas com locação', status: 'Ativa', createdAt: now },
        { id: uid('CAT'), code: 'CAT-002', name: 'Internet', description: 'Serviços de conectividade', status: 'Ativa', createdAt: now },
        { id: uid('CAT'), code: 'CAT-003', name: 'Salários', description: 'Folha e pagamentos da equipe', status: 'Ativa', createdAt: now }
      ],
      sessions: [],
      bankAccounts: [
        { id: uid('BAN'), code: 'BAN-001', name: 'Conta Principal', bankName: 'Banco Principal', branch: '', accountNumber: '', type: 'Conta Corrente', initialBalance: 0, status: 'Ativa', createdAt: now }
      ],
      cashEntries: [],
      audits: [
        { id: uid('AUD'), at: new Date().toISOString(), actor: 'Sistema', action: 'Inicialização', detail: 'App criado a partir da estrutura da planilha original.' }
      ]
    };
  }

  function loadState() {
    try {
      const raw = (isDesktopApp() && desktop?.loadStateSync ? desktop.loadStateSync() : localStorage.getItem(STORAGE_KEY)) || localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return {
        ...defaultState(),
        ...parsed,
        meta: { ...defaultState().meta, ...(parsed.meta || {}) },
        settings: { ...defaultState().settings, ...(parsed.settings || {}) }
      };
    } catch {
      return defaultState();
    }
  }

  let state = loadState();
  ensureAccessSettings();
  function saveState() {
    ensureAccessSettings();
    const serialized = JSON.stringify(state);
    try { localStorage.setItem(STORAGE_KEY, serialized); } catch {}
    if (isDesktopApp() && desktop?.saveStateSync) desktop.saveStateSync(serialized);
    if (api) {
      api.apiBase = state.settings?.backendUrl || '';
      if (state.session?.authMode === 'saas' && state.session?.token) api.token = state.session.token;
      else if (!useBackend()) api.clearToken?.();
    }
  }
  function backendConfigured() { return !isDesktopApp() && !!(api && String(state.settings?.backendUrl || '').trim()); }
  function apiBase() { return String(state.settings?.backendUrl || '').trim().replace(/\/$/, ''); }
  function useBackend() { return !isDesktopApp() && !!(backendConfigured() && state.session?.authMode === 'saas' && state.session?.token); }
  function googleCalendarEnabled() { return !!state.settings?.googleCalendarSyncEnabled; }
  function googleCalendarConfigured() { return !!String(state.settings?.googleCalendarClientId || '').trim(); }
  function googleCalendarConnected() { return !!(state.settings?.googleCalendarRefreshToken || state.settings?.googleCalendarAccessToken); }
  function googleCalendarReady() { return googleCalendarEnabled() && googleCalendarConfigured() && googleCalendarConnected() && (isDesktopApp() ? !!desktop : true); }
  function googleCalendarCalendarId() { return String(state.settings?.googleCalendarCalendarId || 'primary').trim() || 'primary'; }
  function googleCalendarExpirySoon() { return Number(state.settings?.googleCalendarTokenExpiresAt || 0) <= (Date.now() + 60000); }
  function setGoogleCalendarTokens(tokens = {}) {
    state.settings.googleCalendarAccessToken = String(tokens.access_token || tokens.accessToken || state.settings.googleCalendarAccessToken || '');
    state.settings.googleCalendarRefreshToken = String(tokens.refresh_token || tokens.refreshToken || state.settings.googleCalendarRefreshToken || '');
    state.settings.googleCalendarTokenType = String(tokens.token_type || tokens.tokenType || 'Bearer');
    const expiresIn = Number(tokens.expires_in || tokens.expiresIn || 3600);
    state.settings.googleCalendarTokenExpiresAt = Date.now() + (expiresIn * 1000);
    state.settings.googleCalendarConnectedAt = state.settings.googleCalendarConnectedAt || new Date().toISOString();
    state.settings.googleCalendarLastError = '';
    saveState();
  }
  function clearGoogleCalendarConnection() {
    state.settings.googleCalendarAccessToken = '';
    state.settings.googleCalendarRefreshToken = '';
    state.settings.googleCalendarTokenType = 'Bearer';
    state.settings.googleCalendarTokenExpiresAt = 0;
    state.settings.googleCalendarConnectedAt = '';
    state.settings.googleCalendarLastValidatedAt = '';
    state.settings.googleCalendarCalendarSummary = '';
    state.settings.googleCalendarCalendarTimeZone = '';
    state.settings.googleCalendarCalendarAccessRole = '';
    state.settings.googleCalendarLastError = '';
    state.settings.googleCalendarLastSyncSummary = '';
    saveState();
  }
  function addMinutes(date, minutes) {
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutes);
    return next;
  }
  function toRfc3339Local(date) {
    const d = new Date(date);
    const pad = value => String(Math.floor(Math.abs(value))).padStart(2, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = pad(offset / 60);
    const offsetMinutes = pad(offset % 60);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${offsetHours}:${offsetMinutes}`;
  }
  function appointmentGoogleCalendarPayload(appointment) {
    if (!appointment?.date || !appointment?.time) return null;
    const startAt = new Date(`${appointment.date}T${appointment.time}:00`);
    const endAt = addMinutes(startAt, 50);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    return {
      summary: `${appointment.patientName || 'Sessão'} — ${appointment.professionalName || 'Profissional'}`,
      description: [
        `Paciente: ${appointment.patientName || ''}`,
        `Profissional: ${appointment.professionalName || ''}`,
        `Clínica: ${appointment.clinicName || state.settings.companyName || state.settings.brandName || ''}`,
        `Status no sistema: ${appointment.status || 'AGENDADO'}`,
        `Código interno: ${appointment.code || ''}`
      ].filter(Boolean).join('\n'),
      location: appointment.clinicName || state.settings.companyName || state.settings.brandName || 'Clínica',
      start: { dateTime: toRfc3339Local(startAt), timeZone: timezone },
      end: { dateTime: toRfc3339Local(endAt), timeZone: timezone }
    };
  }
  async function ensureGoogleCalendarAccessToken() {
    if (state.settings.googleCalendarAccessToken && !googleCalendarExpirySoon()) return state.settings.googleCalendarAccessToken;
    if (!state.settings.googleCalendarRefreshToken) throw new Error('Conecte sua conta Google antes de sincronizar o calendário.');
    const refreshed = isDesktopApp() && desktop?.googleCalendarRefreshToken
      ? await desktop.googleCalendarRefreshToken({
          clientId: state.settings.googleCalendarClientId,
          clientSecret: state.settings.googleCalendarClientSecret,
          tokenUri: state.settings.googleCalendarTokenUri,
          refreshToken: state.settings.googleCalendarRefreshToken
        })
      : await browserGoogleCalendarRefreshToken();
    setGoogleCalendarTokens(refreshed || {});
    return state.settings.googleCalendarAccessToken;
  }
  async function googleCalendarApiRequest(method, path, body = null) {
    const accessToken = await ensureGoogleCalendarAccessToken();
    return isDesktopApp() && desktop?.googleCalendarApi
      ? desktop.googleCalendarApi({ method, path, accessToken, body })
      : browserGoogleCalendarApi({ method, path, accessToken, body });
  }
  async function syncAppointmentToGoogleCalendar(appointment, options = {}) {
    if (!googleCalendarReady()) return { status: 'skipped' };
    if (!appointment?.date || !appointment?.time) return { status: 'skipped' };
    const hadEvent = !!appointment.googleEventId;
    const calendarId = encodeURIComponent(googleCalendarCalendarId());
    try {
      if (String(appointment.status || '').toUpperCase() == 'CANCELADO') {
        if (hadEvent) {
          await googleCalendarApiRequest('DELETE', `/calendars/${calendarId}/events/${encodeURIComponent(appointment.googleEventId)}`);
        }
        appointment.googleEventId = '';
        appointment.googleEventHtmlLink = '';
        appointment.googleSyncAt = new Date().toISOString();
        appointment.googleSyncError = '';
        appointment.googleSyncFailedAt = '';
        appointment.googleSyncStatus = hadEvent ? 'deleted' : 'skipped';
        state.settings.googleCalendarLastSyncAt = new Date().toISOString();
        state.settings.googleCalendarLastError = '';
        saveState();
        return { status: hadEvent ? 'deleted' : 'skipped' };
      }
      const payload = appointmentGoogleCalendarPayload(appointment);
      if (!payload) return { status: 'skipped' };
      const result = hadEvent
        ? await googleCalendarApiRequest('PATCH', `/calendars/${calendarId}/events/${encodeURIComponent(appointment.googleEventId)}`, payload)
        : await googleCalendarApiRequest('POST', `/calendars/${calendarId}/events`, payload);
      if (result?.id) {
        appointment.googleEventId = result.id;
        appointment.googleEventHtmlLink = String(result.htmlLink || appointment.googleEventHtmlLink || '');
      }
      appointment.googleSyncAt = new Date().toISOString();
      appointment.googleSyncError = '';
      appointment.googleSyncFailedAt = '';
      appointment.googleSyncStatus = hadEvent ? 'updated' : 'created';
      state.settings.googleCalendarLastSyncAt = appointment.googleSyncAt;
      state.settings.googleCalendarLastError = '';
      saveState();
      return { status: hadEvent ? 'updated' : 'created' };
    } catch (error) {
      const message = String(error?.message || '');
      if (hadEvent && message.includes('404')) {
        appointment.googleEventId = '';
        appointment.googleEventHtmlLink = '';
        if (String(appointment.status || '').toUpperCase() !== 'CANCELADO' && !options?.retriedMissingRemote) {
          return syncAppointmentToGoogleCalendar(appointment, { ...options, retriedMissingRemote: true });
        }
        appointment.googleSyncError = '';
        appointment.googleSyncFailedAt = '';
        appointment.googleSyncStatus = 'missing_remote';
        state.settings.googleCalendarLastError = '';
        saveState();
        return { status: 'missing_remote' };
      }
      appointment.googleSyncError = String(error?.message || 'Falha ao sincronizar com o Google Calendar.');
      appointment.googleSyncFailedAt = new Date().toISOString();
      appointment.googleSyncStatus = 'failed';
      state.settings.googleCalendarLastError = appointment.googleSyncError;
      saveState();
      throw error;
    }
  }
  async function syncAppointmentsBatchToGoogleCalendar(appointments = [], options = {}) {
    const summary = { created: 0, updated: 0, deleted: 0, skipped: 0, failed: 0 };
    for (const appointment of appointments) {
      try {
        const result = await syncAppointmentToGoogleCalendar(appointment, options);
        if (result?.status === 'created') summary.created += 1;
        else if (result?.status === 'updated') summary.updated += 1;
        else if (result?.status === 'deleted') summary.deleted += 1;
        else summary.skipped += 1;
      } catch (error) {
        summary.failed += 1;
        if (!options.silent) console.error('Google Calendar sync error', error);
      }
    }
    if (summary.created || summary.updated || summary.deleted || summary.failed) {
      state.settings.googleCalendarLastSyncSummary = `Criados: ${summary.created} · Atualizados: ${summary.updated} · Cancelados: ${summary.deleted} · Falhas: ${summary.failed}`;
      saveState();
    }
    if (!options.silent && (summary.created || summary.updated || summary.deleted || summary.failed)) {
      alert(`Google Calendar: ${summary.created} criado(s), ${summary.updated} atualizado(s), ${summary.deleted} cancelado(s), ${summary.failed} falha(s).`);
    }
    return summary;
  }
  function googleCalendarStage() {
    if (!googleCalendarConfigured()) return 'missing_credentials';
    if (!googleCalendarConnected()) return 'ready_to_connect';
    if (!googleCalendarEnabled()) return 'connected_manual';
    return 'ready';
  }
  function googleCalendarPeriodItems() {
    const range = getAgendaRange();
    return filteredAppointments().filter(item => item.date >= toIso(range.start) && item.date <= toIso(range.end));
  }
  function googleCalendarPeriodMetrics() {
    const items = googleCalendarPeriodItems();
    const synced = items.filter(item => !!item.googleEventId || (String(item.status || '').toUpperCase() === 'CANCELADO' && item.googleSyncAt && !item.googleSyncError)).length;
    const failed = items.filter(item => !!item.googleSyncError).length;
    const canceled = items.filter(item => String(item.status || '').toUpperCase() === 'CANCELADO').length;
    const pending = items.filter(item => {
      const isCanceled = String(item.status || '').toUpperCase() === 'CANCELADO';
      if (item.googleSyncError) return false;
      if (isCanceled) return !!item.googleEventId;
      return !item.googleEventId;
    }).length;
    return { total: items.length, synced, pending, failed, canceled };
  }
  function googleCalendarPendingAppointments() {
    return (state.appointments || []).filter(item => {
      const isCanceled = String(item.status || '').toUpperCase() === 'CANCELADO';
      if (item.googleSyncError) return true;
      if (isCanceled) return !!item.googleEventId;
      return !item.googleEventId;
    });
  }
  function googleCalendarAppointmentMeta(appointment) {
    const isCanceled = String(appointment?.status || '').toUpperCase() === 'CANCELADO';
    if (appointment?.googleSyncError) {
      return {
        badgeClass: 'danger',
        label: 'Falha no Google',
        hint: `${appointment.googleSyncError}${appointment?.googleSyncFailedAt ? ` · ${new Date(appointment.googleSyncFailedAt).toLocaleString('pt-BR')}` : ''}`
      };
    }
    if (isCanceled && appointment?.googleEventId) {
      return {
        badgeClass: 'warn',
        label: 'Cancelar no Google',
        hint: 'Este agendamento já foi cancelado no sistema, mas o evento ainda precisa ser removido do Google Calendar.'
      };
    }
    if (appointment?.googleEventId) {
      return {
        badgeClass: 'ok',
        label: 'No Google',
        hint: appointment?.googleSyncAt ? `Último envio: ${new Date(appointment.googleSyncAt).toLocaleString('pt-BR')}` : 'Evento já vinculado ao Google Calendar.'
      };
    }
    if (isCanceled && appointment?.googleSyncAt) {
      return {
        badgeClass: 'ok',
        label: 'Cancelado no Google',
        hint: `Cancelamento sincronizado em ${new Date(appointment.googleSyncAt).toLocaleString('pt-BR')}`
      };
    }
    if (googleCalendarReady() && !isCanceled) {
      return {
        badgeClass: 'warn',
        label: 'Pendente no Google',
        hint: 'Use “Enviar agora” ou o botão de sincronizar todos os pendentes.'
      };
    }
    if (googleCalendarConnected() && !googleCalendarEnabled()) {
      return {
        badgeClass: 'warn',
        label: 'Google pausado',
        hint: 'A conta está conectada, mas a sincronização automática está desligada.'
      };
    }
    if (googleCalendarConnected()) {
      return {
        badgeClass: 'info',
        label: 'Conta conectada',
        hint: 'Conexão Google pronta. Falta concluir o envio deste agendamento.'
      };
    }
    if (googleCalendarConfigured()) {
      return {
        badgeClass: 'info',
        label: 'Falta conectar',
        hint: 'As credenciais já foram importadas, mas a conta Google ainda não foi conectada.'
      };
    }
    return {
      badgeClass: 'info',
      label: 'Google não configurado',
      hint: 'Importe as credenciais e conecte a conta para sincronizar automaticamente.'
    };
  }
  function googleCalendarAppointmentBadge(appointment) {
    const meta = googleCalendarAppointmentMeta(appointment);
    return `<span class="badge ${meta.badgeClass}" title="${safe(meta.hint)}">📅 ${safe(meta.label)}</span>`;
  }
  function googleCalendarAppointmentInline(appointment) {
    const meta = googleCalendarAppointmentMeta(appointment);
    const isCanceled = String(appointment?.status || '').toUpperCase() === 'CANCELADO';
    const openLink = appointment?.googleEventHtmlLink ? `<a href="${safe(appointment.googleEventHtmlLink)}" target="_blank" rel="noopener noreferrer" class="appt-google-link">Abrir no Google</a>` : '';
    const actionLabel = appointment?.googleSyncError ? 'Tentar novamente' : (isCanceled && appointment?.googleEventId ? 'Cancelar agora' : (appointment?.googleEventId ? 'Reenviar Google' : 'Enviar agora'));
    const canSync = googleCalendarReady() && (!isCanceled || !!appointment?.googleEventId || !!appointment?.googleSyncError);
    const syncButton = canSync ? `<button type="button" class="appt-google-link appt-google-button js-google-sync-one" data-id="${safe(appointment.id)}">${actionLabel}</button>` : '';
    const errorLine = appointment?.googleSyncError ? `<div class="appt-google-error" title="${safe(appointment.googleSyncError)}">⚠ ${safe(appointment.googleSyncError)}</div>` : '';
    return `<div class="appt-google-row"><span class="appt-google-status ${meta.badgeClass}">📅 ${safe(meta.label)}</span>${openLink}${syncButton}</div>${errorLine}`;
  }
  function googleCalendarStatusText() {
    const stage = googleCalendarStage();
    if (stage === 'missing_credentials') return 'Falta importar as credenciais OAuth do Google';
    if (stage === 'ready_to_connect') return 'Credenciais prontas · falta conectar a conta Google';
    if (stage === 'connected_manual') return 'Conta conectada · sincronização automática desligada';
    return 'Google Calendar conectado e sincronização automática ativa';
  }
  function parseGoogleOAuthConfigText(content) {
    const parsed = JSON.parse(String(content || '{}'));
    const root = parsed.installed || parsed.web || {};
    if (!root.client_id) throw new Error('Arquivo JSON OAuth inválido para Google Calendar.');
    return {
      clientId: String(root.client_id || ''),
      clientSecret: String(root.client_secret || ''),
      projectId: String(root.project_id || ''),
      authUri: String(root.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth'),
      tokenUri: String(root.token_uri || 'https://oauth2.googleapis.com/token')
    };
  }
  function googlePopupRedirectUri() {
    return `${window.location.origin}${window.location.pathname}?google_oauth_popup=1`;
  }
  function randomGoogleOauthString(size = 64) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = new Uint8Array(size);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
  }
  function base64UrlFromArrayBuffer(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  async function sha256Base64Url(value) {
    const encoded = new TextEncoder().encode(String(value || ''));
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return base64UrlFromArrayBuffer(digest);
  }
  async function postGoogleTokenForm(payload = {}) {
    const response = await fetch(String(state.settings.googleCalendarTokenUri || 'https://oauth2.googleapis.com/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload)
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) throw new Error(data?.error_description || data?.error || text || `Google OAuth falhou (${response.status}).`);
    return data || {};
  }
  async function browserGoogleCalendarRefreshToken() {
    if (!state.settings.googleCalendarRefreshToken) throw new Error('Conecte sua conta Google antes de sincronizar o calendário.');
    return postGoogleTokenForm({
      client_id: state.settings.googleCalendarClientId,
      refresh_token: state.settings.googleCalendarRefreshToken,
      grant_type: 'refresh_token'
    });
  }
  async function browserGoogleCalendarApi(payload = {}) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3${String(payload.path || '')}`, {
      method: String(payload.method || 'GET').toUpperCase(),
      headers: {
        Authorization: `Bearer ${String(payload.accessToken || '')}`,
        ...(payload.body != null ? { 'Content-Type': 'application/json' } : {})
      },
      body: payload.body != null ? JSON.stringify(payload.body) : undefined
    });
    if (response.status === 204) return {};
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
    if (!response.ok) throw new Error(data?.error?.message || text || `Google Calendar API (${response.status})`);
    return data || {};
  }
  async function importGoogleOAuthCredentialsFlow() {
    if (desktop?.importGoogleOAuthCredentials) return desktop.importGoogleOAuthCredentials();
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', async () => {
        try {
          const file = input.files?.[0];
          if (!file) { resolve({ canceled: true }); return; }
          const text = await file.text();
          resolve({ canceled: false, ...parseGoogleOAuthConfigText(text) });
        } catch (error) {
          resolve(Promise.reject(error));
        } finally {
          input.remove();
        }
      }, { once: true });
      input.click();
    });
  }
  async function browserGoogleCalendarConnect() {
    if (!googleCalendarConfigured()) throw new Error('Importe primeiro o arquivo JSON de credenciais OAuth do Google.');
    const verifier = randomGoogleOauthString(96);
    const challenge = await sha256Base64Url(verifier);
    const stateKey = randomGoogleOauthString(40);
    const redirectUri = googlePopupRedirectUri();
    const authUrl = new URL(String(state.settings.googleCalendarAuthUri || 'https://accounts.google.com/o/oauth2/v2/auth'));
    authUrl.searchParams.set('client_id', state.settings.googleCalendarClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', String(state.settings.googleCalendarScopes || 'https://www.googleapis.com/auth/calendar'));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', stateKey);
    const popup = window.open(authUrl.toString(), 'agenda_google_oauth', 'width=560,height=760,resizable=yes,scrollbars=yes');
    if (!popup) throw new Error('O navegador bloqueou a janela do Google. Libere pop-ups e tente novamente.');
    const authResult = await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('Tempo esgotado aguardando a autorização da conta Google.'));
      }, 180000);
      const interval = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          reject(new Error('A janela de autorização do Google foi fechada antes da conclusão.'));
        }
      }, 500);
      function cleanup() {
        window.clearTimeout(timeout);
        window.clearInterval(interval);
        window.removeEventListener('message', onMessage);
      }
      function onMessage(event) {
        if (event.origin !== window.location.origin) return;
        const data = event.data || {};
        if (data.type !== 'agenda-google-oauth') return;
        if (String(data.state || '') !== stateKey) return;
        cleanup();
        if (data.error) reject(new Error(`Google OAuth cancelado: ${data.error}`));
        else if (!data.code) reject(new Error('Código OAuth do Google não recebido.'));
        else resolve(data);
      }
      window.addEventListener('message', onMessage);
    });
    try { popup.close(); } catch (_) {}
    return postGoogleTokenForm({
      client_id: state.settings.googleCalendarClientId,
      code: authResult.code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });
  }
  function handleGoogleOAuthPopupCallback() {
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('google_oauth_popup') !== '1') return false;
    const payload = {
      type: 'agenda-google-oauth',
      code: params.get('code') || '',
      error: params.get('error') || '',
      state: params.get('state') || ''
    };
    app.innerHTML = `<div class="auth"><div class="auth-card"><div><h2>Google Calendar</h2><p>Conexão em andamento...</p><p class="footer-note">Esta janela pode ser fechada automaticamente.</p></div></div></div>`;
    try {
      if (window.opener && !window.opener.closed) window.opener.postMessage(payload, window.location.origin);
    } catch (_) {}
    window.setTimeout(() => { try { window.close(); } catch (_) {} }, 400);
    return true;
  }
  async function inspectGoogleCalendarConnection(options = {}) {
    if (!googleCalendarConfigured()) throw new Error('Importe primeiro o arquivo JSON de credenciais OAuth do Google.');
    if (!googleCalendarConnected()) throw new Error('Conecte primeiro sua conta Google.');
    const calendarId = encodeURIComponent(googleCalendarCalendarId());
    const info = await googleCalendarApiRequest('GET', `/users/me/calendarList/${calendarId}`);
    state.settings.googleCalendarLastValidatedAt = new Date().toISOString();
    state.settings.googleCalendarCalendarSummary = String(info?.summaryOverride || info?.summary || googleCalendarCalendarId());
    state.settings.googleCalendarCalendarTimeZone = String(info?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    state.settings.googleCalendarCalendarAccessRole = String(info?.accessRole || 'owner');
    state.settings.googleCalendarLastError = '';
    saveState();
    return info || {};
  }
  async function syncCurrentPeriodToGoogleCalendar(options = {}) {
    if (!googleCalendarReady()) throw new Error('Importe as credenciais, conecte a conta Google e deixe a sincronização automática ligada.');
    const items = googleCalendarPeriodItems();
    const summary = await syncAppointmentsBatchToGoogleCalendar(items, { silent: true, origin: options.origin || 'manual-current-period' });
    state.settings.googleCalendarLastSyncAt = new Date().toISOString();
    state.settings.googleCalendarLastError = '';
    saveState();
    return { items, summary };
  }
  function backendResourceForType(type) {
    return ({ clinic: 'clinics', professional: 'professionals', patient: 'patients', appointment: 'appointments', receivable: 'receivables', payable: 'payables', session: 'sessions' })[type] || type;
  }
  function normalizeId(value) { return value == null || value === '' ? '' : String(value); }
  function clinicById(id) { return state.clinics.find(c => String(c.id) === String(id)); }
  function professionalById(id) { return state.professionals.find(p => String(p.id) === String(id)); }
  function patientById(id) { return state.patients.find(p => String(p.id) === String(id)); }
  function findClinicIdByName(name) { return normalizeId(state.clinics.find(c => c.name === name)?.id); }
  function bankAccountById(id) { return (state.bankAccounts || []).find(a => String(a.id) === String(id)); }
  function normalizeExpenseCategory(value) {
    const text = String(value || '').trim();
    return text || 'Sem categoria';
  }
  function expenseCategoryRecord(value) {
    const normalized = normalizeExpenseCategory(value).toLocaleLowerCase('pt-BR');
    return (state.expenseCategories || []).find(item => normalizeExpenseCategory(item.name).toLocaleLowerCase('pt-BR') === normalized);
  }
  function ensureExpenseCategoryExists(value, extra = {}) {
    const name = normalizeExpenseCategory(value);
    if (name === 'Sem categoria') return null;
    state.expenseCategories ||= [];
    const existing = expenseCategoryRecord(name);
    if (existing) {
      if (extra.status && !existing.status) existing.status = extra.status;
      return existing;
    }
    const created = {
      id: uid('CAT'),
      code: nextCode('CAT', state.expenseCategories),
      name,
      description: String(extra.description || '').trim(),
      status: extra.status || 'Ativa',
      createdAt: new Date().toISOString()
    };
    state.expenseCategories.push(created);
    return created;
  }
  function expenseCategoryOptions(includeAll = false) {
    const items = [...(state.expenseCategories || [])]
      .filter(item => (item.status || 'Ativa') !== 'Inativa')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const base = includeAll ? ['<option value="">Selecione</option>'] : [];
    return base.concat(items.map(item => `<option value="${safe(item.name)}">${safe(item.name)}</option>`)).join('');
  }
  function accountBalance(accountId) {
    const account = bankAccountById(accountId);
    const initial = Number(account?.initialBalance || 0);
    const movements = (state.cashEntries || [])
      .filter(entry => String(entry.bankAccountId) === String(accountId))
      .reduce((sum, entry) => sum + (entry.direction === 'Saída' ? -Number(entry.amount || 0) : Number(entry.amount || 0)), 0);
    return initial + movements;
  }
  function removeCashEntriesForOrigin(originType, originId) {
    const before = (state.cashEntries || []).length;
    state.cashEntries = (state.cashEntries || []).filter(entry => !(entry.originType === originType && String(entry.originId) === String(originId)));
    return before - state.cashEntries.length;
  }
  function upsertCashEntryForOrigin(originType, originId, payload = {}) {
    state.cashEntries ||= [];
    const existing = state.cashEntries.find(entry => entry.originType === originType && String(entry.originId) === String(originId));
    const bank = bankAccountById(payload.bankAccountId);
    const movementDate = payload.movementDate || todayIso();
    const entry = {
      ...(existing || {}),
      id: existing?.id || uid('CAX'),
      code: existing?.code || nextCode('CAX', state.cashEntries),
      originType,
      originId: String(originId),
      bankAccountId: String(payload.bankAccountId || ''),
      bankAccountName: bank?.name || payload.bankAccountName || '',
      clinicId: String(payload.clinicId || ''),
      clinicName: payload.clinicName || clinicById(payload.clinicId)?.name || '',
      description: payload.description || '',
      category: normalizeExpenseCategory(payload.category),
      direction: payload.direction || 'Entrada',
      amount: Number(payload.amount || 0),
      movementDate,
      monthName: payload.monthName || monthName(new Date(`${movementDate}T00:00:00`).getMonth()),
      status: 'Efetivado',
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    if (existing) Object.assign(existing, entry);
    else state.cashEntries.push(entry);
    return entry;
  }
  function enrichCollections() {
    const clinicMap = Object.fromEntries(state.clinics.map(c => [String(c.id), c.name]));
    state.professionals = state.professionals.map(p => ({ ...p, id: normalizeId(p.id), clinicId: normalizeId(p.clinicId), clinicName: p.clinicName || clinicMap[String(p.clinicId)] || '' }));
    const professionalMap = Object.fromEntries(state.professionals.map(p => [String(p.id), p.name]));
    state.patients = state.patients.map(p => ({ ...p, id: normalizeId(p.id), professionalId: normalizeId(p.professionalId), clinicId: normalizeId(p.clinicId || findClinicIdByName(p.clinicName)), professionalName: p.professionalName || professionalMap[String(p.professionalId)] || '', clinicName: p.clinicName || clinicMap[String(p.clinicId)] || clinicMap[String(professionalById(p.professionalId)?.clinicId)] || '' }));
    const patientMap = Object.fromEntries(state.patients.map(p => [String(p.id), p.name]));
    state.appointments = state.appointments.map(a => ({ ...a, id: normalizeId(a.id), patientId: normalizeId(a.patientId), professionalId: normalizeId(a.professionalId), clinicId: normalizeId(a.clinicId), patientName: a.patientName || patientMap[String(a.patientId)] || '', professionalName: a.professionalName || professionalMap[String(a.professionalId)] || '', clinicName: a.clinicName || clinicMap[String(a.clinicId)] || '', phone: a.phone || patientById(a.patientId)?.phone || '' }));
    state.receivables = state.receivables.map(r => ({ ...r, id: normalizeId(r.id), patientId: normalizeId(r.patientId), professionalId: normalizeId(r.professionalId), clinicId: normalizeId(r.clinicId), patientName: r.patientName || patientMap[String(r.patientId)] || '', professionalName: r.professionalName || professionalMap[String(r.professionalId)] || '', clinicName: r.clinicName || clinicMap[String(r.clinicId)] || '', phone: r.phone || patientById(r.patientId)?.phone || '', status: r.status || receiveStatus(r) }));
    state.payables = state.payables.map(p => ({ ...p, id: normalizeId(p.id), clinicId: normalizeId(p.clinicId), clinicName: p.clinicName || clinicMap[String(p.clinicId)] || '', category: normalizeExpenseCategory(p.category), status: p.status || receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }) }));
    state.expenseCategories = (state.expenseCategories || []).map(item => ({ ...item, id: normalizeId(item.id), name: normalizeExpenseCategory(item.name), description: item.description || '', status: item.status || 'Ativa' }));
    state.sessions = (state.sessions || []).map(s => ({ ...s, id: normalizeId(s.id), patientId: normalizeId(s.patientId), professionalId: normalizeId(s.professionalId), clinicId: normalizeId(s.clinicId), appointmentId: normalizeId(s.appointmentId), patientName: s.patientName || patientMap[String(s.patientId)] || '', professionalName: s.professionalName || professionalMap[String(s.professionalId)] || '', clinicName: s.clinicName || clinicMap[String(s.clinicId)] || '', keywords: Array.isArray(s.keywords) ? s.keywords : (() => { try { return JSON.parse(s.keywords || '[]'); } catch { return []; } })(), transcriptSegments: Array.isArray(s.transcriptSegments) ? s.transcriptSegments : (() => { try { return JSON.parse(s.transcriptSegments || '[]'); } catch { return []; } })(), status: s.status || 'RASCUNHO' }));
    state.bankAccounts = (state.bankAccounts || []).map(a => ({ ...a, id: normalizeId(a.id), initialBalance: Number(a.initialBalance || 0), status: a.status || 'Ativa' }));
    const bankMap = Object.fromEntries((state.bankAccounts || []).map(a => [String(a.id), a.name]));
    state.cashEntries = (state.cashEntries || []).map(entry => ({ ...entry, id: normalizeId(entry.id), bankAccountId: normalizeId(entry.bankAccountId), clinicId: normalizeId(entry.clinicId || findClinicIdByName(entry.clinicName)), bankAccountName: entry.bankAccountName || bankMap[String(entry.bankAccountId)] || '', category: normalizeExpenseCategory(entry.category), amount: Number(entry.amount || 0), movementDate: entry.movementDate || todayIso(), monthName: entry.monthName || (entry.movementDate ? monthName(new Date(`${entry.movementDate}T00:00:00`).getMonth()) : monthName(new Date().getMonth())) }));
    state.audits = (state.audits || []).map(a => ({ ...a, id: normalizeId(a.id), at: a.at || a.createdAt || new Date().toISOString(), before: a.before ?? '', after: a.after ?? '' }));
  }
  function applyBackendDataset(dataset = {}) {
    state.meta.dashboardSummary = dataset.summary || null;
    state.meta.backendUsers = clone(dataset.users || []);
    state.meta.backendLicense = dataset.license ? clone(dataset.license) : null;
    if (dataset.license) {
      state.settings.licenseClinicName = String(dataset.license.companyName || state.settings.licenseClinicName || state.settings.companyName || 'Sua Clínica');
      state.settings.commercialPlan = String(dataset.license.planName || state.settings.commercialPlan || 'Essentials');
      state.settings.licenseOperatorLimit = Math.max(1, Number(dataset.license.maxUsers || state.settings.licenseOperatorLimit || 3));
      state.settings.licenseExpiresAt = String(dataset.license.expiresAt || state.settings.licenseExpiresAt || '').slice(0, 10);
      state.settings.licenseKey = String(dataset.license.activationCode || state.settings.licenseKey || '');
    }
    state.clinics = clone(dataset.clinics || []);
    state.professionals = clone(dataset.professionals || []);
    state.patients = clone(dataset.patients || []);
    state.appointments = clone(dataset.appointments || []);
    state.receivables = clone(dataset.receivables || []);
    state.payables = clone(dataset.payables || []);
    state.sessions = clone(dataset.sessions || state.sessions || []);
    state.audits = clone((dataset.audits && dataset.audits.length) ? dataset.audits : state.audits || []);
    state.meta.lastSyncAt = new Date().toISOString();
    enrichCollections();
    saveState();
  }
  async function testBackendConnection() {
    if (!backendConfigured()) throw new Error('Informe a URL do backend.');
    return api.health(apiBase());
  }
  async function syncStateFromBackend() {
    if (!useBackend()) return false;
    const dataset = await api.loadAll(apiBase(), state.session.token, isAdmin());
    applyBackendDataset(dataset);
    return true;
  }
  function backendPayloadFor(resource, item) {
    if (resource === 'clinics') return { code: item.code, name: item.name, cnpj: item.cnpj || '', manager: item.manager || '', phone: item.phone || '', email: item.email || '', address: item.address || '', status: item.status || 'Ativo' };
    if (resource === 'professionals') return { code: item.code, name: item.name, specialty: item.specialty || '', registry: item.registry || '', phone: item.phone || '', email: item.email || '', clinicId: item.clinicId || findClinicIdByName(item.clinicName), status: item.status || 'Ativo' };
    if (resource === 'patients') return { code: item.code, name: item.name, cpf: item.cpf || '', phone: item.phone || '', email: item.email || '', birthDate: item.birthDate || '', professionalId: item.professionalId || '', clinicId: item.clinicId || findClinicIdByName(item.clinicName), frequency: item.frequency || 'Semanal', weekday: item.weekday || 'Segunda', time: item.time || '08:00', monthlyFee: Number(item.monthlyFee || 0), paymentDay: Number(item.paymentDay || 1), billingType: item.billingType || 'Mensal', status: item.status || 'Ativo', registrationDate: item.registrationDate || todayIso(), consentRecording: item.consentRecording ? 1 : 0, consentSignedAt: item.consentSignedAt || '', consentText: item.consentText || state.settings.consentTemplate || '', clinicalAlerts: item.clinicalAlerts || '', medications: item.medications || '', diseases: item.diseases || '', observations: item.observations || '', anamnese: item.anamnese || '' };
    if (resource === 'appointments') return { code: item.code, patientId: item.patientId || '', professionalId: item.professionalId || patientById(item.patientId)?.professionalId || '', clinicId: item.clinicId || patientById(item.patientId)?.clinicId || '', date: item.date, time: item.time, frequency: item.frequency || '', status: item.status || 'AGENDADO', monthName: item.monthName || (item.date ? monthName(new Date(`${item.date}T00:00:00`).getMonth()) : ''), note: item.note || '' };
    if (resource === 'receivables') return { code: item.code, patientId: item.patientId || '', professionalId: item.professionalId || patientById(item.patientId)?.professionalId || '', clinicId: item.clinicId || patientById(item.patientId)?.clinicId || '', amountPlanned: Number(item.amountPlanned || 0), amountPaid: Number(item.amountPaid || 0), dueDate: item.dueDate || '', paymentDate: item.paymentDate || '', competence: item.competence || '', monthName: item.monthName || (item.dueDate ? monthName(new Date(`${item.dueDate}T00:00:00`).getMonth()) : ''), status: item.status || receiveStatus(item) };
    if (resource === 'payables') return { code: item.code, clinicId: item.clinicId || findClinicIdByName(item.clinicName), category: item.category || '', description: item.description || '', amountPlanned: Number(item.amountPlanned || 0), amountPaid: Number(item.amountPaid || 0), dueDate: item.dueDate || '', paymentDate: item.paymentDate || '', monthName: item.monthName || (item.dueDate ? monthName(new Date(`${item.dueDate}T00:00:00`).getMonth()) : ''), status: item.status || receiveStatus({ dueDate: item.dueDate, amountPaid: item.amountPaid, amountPlanned: item.amountPlanned }) };
    if (resource === 'sessions') return { code: item.code, patientId: item.patientId || '', professionalId: item.professionalId || patientById(item.patientId)?.professionalId || '', clinicId: item.clinicId || patientById(item.patientId)?.clinicId || '', appointmentId: item.appointmentId || '', scheduledDate: item.scheduledDate || item.date || todayIso(), startedAt: item.startedAt || '', endedAt: item.endedAt || '', durationMinutes: Number(item.durationMinutes || 0), callStatus: item.callStatus || 'manual', roomName: item.roomName || '', roomUrl: item.roomUrl || '', dailyRoomUrl: item.dailyRoomUrl || '', recordingId: item.recordingId || '', recordingUrl: item.recordingUrl || '', transcriptLive: item.transcriptLive || '', transcriptFinal: item.transcriptFinal || '', transcriptSegments: item.transcriptSegments || [], keywords: item.keywords || [], mainReason: item.mainReason || '', soapSubjective: item.soapSubjective || '', soapObjective: item.soapObjective || '', soapAssessment: item.soapAssessment || '', soapPlan: item.soapPlan || '', summary: item.summary || '', fullEvolution: item.fullEvolution || '', anamnesisInitial: item.anamnesisInitial || '', consentConfirmed: !!item.consentConfirmed, status: item.status || 'RASCUNHO' };
    return item;
  }
  async function createBackendRecord(resource, payload, { skipSync = false } = {}) {
    const created = await api.createResource(apiBase(), state.session.token, resource, backendPayloadFor(resource, payload));
    if (!skipSync) await syncStateFromBackend();
    return created;
  }
  async function updateBackendRecord(resource, id, payload, { skipSync = false } = {}) {
    const updated = await api.updateResource(apiBase(), state.session.token, resource, id, backendPayloadFor(resource, payload));
    if (!skipSync) await syncStateFromBackend();
    return updated;
  }
  async function deleteBackendRecord(resource, id, { skipSync = false } = {}) {
    const result = await api.deleteResource(apiBase(), state.session.token, resource, id);
    if (!skipSync) await syncStateFromBackend();
    return result;
  }
  async function clearBackendResource(resource, ids) {
    for (const id of ids) {
      await api.deleteResource(apiBase(), state.session.token, resource, id);
    }
  }
  async function clearBackendAll() {
    const snapshot = await api.loadAll(apiBase(), state.session.token, isAdmin());
    await clearBackendResource('appointments', snapshot.appointments.map(x => x.id));
    await clearBackendResource('receivables', snapshot.receivables.map(x => x.id));
    await clearBackendResource('payables', snapshot.payables.map(x => x.id));
    await clearBackendResource('sessions', (snapshot.sessions || []).map(x => x.id));
    await clearBackendResource('patients', snapshot.patients.map(x => x.id));
    await clearBackendResource('professionals', snapshot.professionals.map(x => x.id));
    await clearBackendResource('clinics', snapshot.clinics.map(x => x.id));
  }
  async function pushStateToBackend() {
    if (!useBackend()) throw new Error('Conecte-se ao backend SaaS para sincronizar.');
    const source = clone({ clinics: state.clinics, professionals: state.professionals, patients: state.patients, appointments: state.appointments, receivables: state.receivables, payables: state.payables, sessions: state.sessions || [] });
    await clearBackendAll();
    const clinicMap = new Map();
    for (const clinic of source.clinics) {
      const created = await createBackendRecord('clinics', clinic, { skipSync: true });
      clinicMap.set(String(clinic.id), String(created.id));
    }
    const professionalMap = new Map();
    for (const professional of source.professionals) {
      const created = await createBackendRecord('professionals', { ...professional, clinicId: clinicMap.get(String(professional.clinicId || findClinicIdByName(professional.clinicName))) || '' }, { skipSync: true });
      professionalMap.set(String(professional.id), String(created.id));
    }
    const patientMap = new Map();
    for (const patient of source.patients) {
      const created = await createBackendRecord('patients', { ...patient, clinicId: clinicMap.get(String(patient.clinicId || findClinicIdByName(patient.clinicName))) || '', professionalId: professionalMap.get(String(patient.professionalId)) || '' }, { skipSync: true });
      patientMap.set(String(patient.id), String(created.id));
    }
    for (const appointment of source.appointments) {
      await createBackendRecord('appointments', { ...appointment, patientId: patientMap.get(String(appointment.patientId)) || '', professionalId: professionalMap.get(String(appointment.professionalId)) || '', clinicId: clinicMap.get(String(appointment.clinicId || findClinicIdByName(appointment.clinicName))) || '' }, { skipSync: true });
    }
    for (const receivable of source.receivables) {
      await createBackendRecord('receivables', { ...receivable, patientId: patientMap.get(String(receivable.patientId)) || '', professionalId: professionalMap.get(String(receivable.professionalId)) || '', clinicId: clinicMap.get(String(receivable.clinicId || findClinicIdByName(receivable.clinicName))) || '' }, { skipSync: true });
    }
    for (const payable of source.payables) {
      await createBackendRecord('payables', { ...payable, clinicId: clinicMap.get(String(payable.clinicId || findClinicIdByName(payable.clinicName))) || '' }, { skipSync: true });
    }
    for (const session of source.sessions || []) {
      await createBackendRecord('sessions', { ...session, patientId: patientMap.get(String(session.patientId)) || '', professionalId: professionalMap.get(String(session.professionalId)) || '', clinicId: clinicMap.get(String(session.clinicId || findClinicIdByName(session.clinicName))) || '' }, { skipSync: true });
    }
    await syncStateFromBackend();
  }
  function summarizeAuditValue(value) {
    if (value == null) return '';
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    return raw.length > 180 ? raw.slice(0, 177) + '...' : raw;
  }
  function audit(action, detail, meta = {}) {
    state.audits.unshift({
      id: uid('AUD'),
      at: new Date().toISOString(),
      actor: state.session?.name || 'Sistema',
      role: currentRole() || 'SISTEMA',
      route: state.meta.route,
      action,
      detail,
      entity: meta.entity || '',
      before: summarizeAuditValue(meta.before),
      after: summarizeAuditValue(meta.after),
      origin: meta.origin || 'app'
    });
    state.audits = state.audits.slice(0, 500);
    saveState();
  }
  function actionButtons(type, id) {
    const histBtn = type === 'patient' ? `<button class="btn info js-history" data-id="${id}" title="Ver histórico de evoluções">📋 Histórico</button>` : '';
    return `<div class="flex">${histBtn}<button class="btn ghost js-edit" data-type="${type}" data-id="${id}">Editar</button><button class="btn danger js-delete" data-type="${type}" data-id="${id}">Excluir</button></div>`;
  }
  function setRoute(route) { state.meta.route = route; saveState(); render(); }
  function currentRole() { return state.session?.role || ''; }
  function isAdmin() { return currentRole() === 'ADMIN'; }
  function isOperator() { return currentRole() === 'OPERADOR'; }
  function requireAdmin() { if (!isAdmin()) throw new Error('Ação permitida apenas para ADMIN.'); }
  function listPatientsDetailed() {
    return state.patients.map(p => ({
      ...p,
      professionalName: p.professionalName || state.professionals.find(x => x.id === p.professionalId)?.name || '',
      clinicName: p.clinicName || state.professionals.find(x => x.id === p.professionalId)?.clinicName || ''
    }));
  }
  function clinicScopeBadge(label = 'Clínica global') {
    const scope = currentClinicScopeName();
    return scope ? `<span class="chip clinic-scope-chip">🏥 ${safe(label)}: ${safe(scope)}</span>` : '<span class="chip">🏥 Todas as clínicas</span>';
  }

  function generateScheduleAndReceivables(patientId, billingStart = 'current') {
    const patient = listPatientsDetailed().find(p => p.id === patientId);
    if (!patient) return { appointments: 0, receivables: 0, ignoredAppointments: 0, ignoredReceivables: 0 };
    const weekday = normalizeWeekday(patient.weekday);
    if (weekday === undefined) throw new Error('Dia da semana inválido.');
    if (!patient.time) throw new Error('Horário inválido.');
    if (!(Number(patient.monthlyFee) > 0)) throw new Error('Valor mensal inválido.');
    if (!(Number(patient.paymentDay) >= 1 && Number(patient.paymentDay) <= 31)) throw new Error('Dia de pagamento inválido.');

    const key = appointmentConfigKey(patient);
    const registration = toDate(patient.registrationDate || todayIso());
    let first = new Date(registration);
    let offset = (weekday - first.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    first = addDays(first, offset);
    const finish = new Date(registration.getFullYear(), 11, 31);
    const step = frequencyDays[patient.frequency] || 7;

    let createdA = 0, createdR = 0, ignoredA = 0, ignoredR = 0;
    for (let date = new Date(first); date <= finish; date = addDays(date, step)) {
      const iso = toIso(date);
      const exists = state.appointments.some(a => a.configKey === key && a.date === iso && a.time === patient.time);
      if (exists) { ignoredA++; continue; }
      state.appointments.push({
        id: uid('AGD'),
        code: nextCode('AGD', state.appointments),
        patientId: patient.id,
        patientName: patient.name,
        professionalId: patient.professionalId,
        professionalName: patient.professionalName,
        clinicName: patient.clinicName,
        frequency: patient.frequency,
        date: iso,
        time: patient.time,
        status: 'AGENDADO',
        monthName: monthName(date.getMonth()),
        note: `${patient.weekday} às ${patient.time}`,
        configKey: key,
        phone: patient.phone || ''
      });
      createdA++;
    }

    const startDate = new Date(registration.getFullYear(), registration.getMonth() + (billingStart === 'next' ? 1 : 0), 1);
    for (let year = startDate.getFullYear(), month = startDate.getMonth(); year <= registration.getFullYear();) {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const due = new Date(year, month, Math.min(Number(patient.paymentDay), lastDay));
      const competence = `${year}-${String(month + 1).padStart(2,'0')}`;
      const exists = state.receivables.some(r => r.configKey === key && r.competence === competence);
      if (!exists) {
        state.receivables.push({
          id: uid('REC'),
          code: nextCode('REC', state.receivables),
          patientId: patient.id,
          patientName: patient.name,
          professionalName: patient.professionalName,
          clinicName: patient.clinicName,
          amountPlanned: Number(patient.monthlyFee),
          amountPaid: 0,
          dueDate: toIso(due),
          paymentDate: '',
          competence,
          monthName: monthName(month),
          status: 'Em Aberto',
          configKey: key,
          phone: patient.phone || ''
        });
        createdR++;
      } else {
        ignoredR++;
      }
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      if (year > registration.getFullYear()) break;
    }

    state.receivables.forEach(r => r.status = receiveStatus(r));
    saveState();
    audit('Geração automática', `${patient.name}: ${createdA} agendamentos, ${createdR} recebimentos.`);
    return { appointments: createdA, receivables: createdR, ignoredAppointments: ignoredA, ignoredReceivables: ignoredR };
  }
  function excelValueToIso(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`;
    }
    if (value instanceof Date) return toIso(value);
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{2}[\/.-]\d{2}[\/.-]\d{4}$/.test(s)) {
      const [d,m,y] = s.replace(/\./g,'/').replace(/-/g,'/').split('/');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? '' : toIso(dt);
  }
  function excelValueToTime(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number') {
      const total = Math.round(value * 24 * 60);
      const hh = String(Math.floor(total / 60) % 24).padStart(2,'0');
      const mm = String(total % 60).padStart(2,'0');
      return `${hh}:${mm}`;
    }
    const s = String(value).trim();
    const match = s.match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2,'0')}:${match[2]}` : s;
  }
  function sheetRows(workbook, sheetName, headerRow, firstDataRow) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const headers = (rows[headerRow - 1] || []).map(v => String(v || '').trim());
    return rows.slice(firstDataRow - 1).map(row => Object.fromEntries(headers.map((h, idx) => [h || `COL_${idx+1}`, row[idx]])));
  }
  function importWorkbookFile(file) {
    return file.arrayBuffer().then(buffer => {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const next = defaultState();
      next.settings = clone(state.settings);
      next.meta = { ...next.meta, appName: state.meta.appName, sourceWorkbook: file.name };
      next.session = clone(state.session);
      const sistemaRows = sheetRows(workbook, 'Sistema', 1, 1);
      const adminLine = sistemaRows.find(r => String(r['SenhaAdmin'] || '').trim() === 'SenhaAdmin');
      const opLine = sistemaRows.find(r => String(r['SenhaAdmin'] || '').trim() === 'SenhaOperador');
      if (adminLine) next.settings.adminPassword = String(adminLine['COL_2'] || next.settings.adminPassword).trim();
      if (opLine) next.settings.operatorPassword = String(opLine['COL_2'] || next.settings.operatorPassword).trim();

      const clinicRows = sheetRows(workbook, 'Clínica', 3, 4).filter(r => String(r['Nome da Clínica'] || '').trim());
      next.clinics = clinicRows.map((r, i) => ({
        id: uid('CLI'), code: String(r['ID'] || `CLI-${String(i+1).padStart(3,'0')}`), name: String(r['Nome da Clínica'] || '').trim(), cnpj: String(r['CNPJ'] || ''), manager: String(r['Responsável'] || ''), phone: String(r['Telefone'] || ''), email: String(r['Email'] || ''), address: String(r['Endereço'] || ''), status: String(r['Status'] || 'Ativo'), createdAt: todayIso()
      }));
      if (!next.clinics.length) next.clinics = clone(defaultState().clinics);

      const profRows = sheetRows(workbook, 'Profissional', 3, 4).filter(r => String(r['Nome do Profissional'] || '').trim());
      next.professionals = profRows.map((r, i) => ({
        id: uid('PRO'), code: String(r['ID'] || `PRO-${String(i+1).padStart(3,'0')}`), name: String(r['Nome do Profissional'] || '').trim(), specialty: String(r['Especialidade'] || ''), registry: String(r['Conselho/Registro'] || ''), phone: String(r['Telefone'] || ''), email: String(r['Email'] || ''), clinicName: String(r['Clínica'] || next.clinics[0]?.name || ''), status: String(r['Status'] || 'Ativo'), createdAt: todayIso()
      }));
      if (!next.professionals.length) next.professionals = clone(defaultState().professionals);

      const patientsByName = {};
      const patientRows = sheetRows(workbook, 'Paciente', 4, 5).filter(r => String(r['Nome do Paciente'] || '').trim());
      next.patients = patientRows.map((r, i) => {
        const professional = next.professionals.find(p => p.name === String(r['Profissional'] || '').trim());
        const patient = {
          id: uid('PAC'), code: String(r['ID'] || `PAC-${String(i+1).padStart(3,'0')}`), name: String(r['Nome do Paciente'] || '').trim(), cpf: String(r['CPF'] || ''), phone: String(r['Telefone'] || ''), email: String(r['Email'] || ''), professionalId: professional?.id || '', professionalName: String(r['Profissional'] || professional?.name || ''), clinicName: String(r['Clínica (auto)'] || professional?.clinicName || ''), frequency: String(r['Frequência'] || 'Semanal'), weekday: String(r['Dia da Semana'] || 'Segunda'), time: excelValueToTime(r['Horário'] || ''), monthlyFee: Number(r['Valor Mensalidade'] || 0), paymentDay: Number(r['Dia Pagto'] || 1), billingType: String(r['Tipo de Cobrança'] || 'Mensal'), status: String(r['Status'] || 'Ativo'), registrationDate: excelValueToIso(r['Data Cadastro'] || todayIso()), createdAt: todayIso()
        };
        patientsByName[patient.name] = patient;
        return patient;
      });

      const agRows = sheetRows(workbook, 'Agendamentos', 3, 4).filter(r => String(r['Paciente'] || '').trim());
      next.appointments = agRows.map((r, i) => {
        const patient = patientsByName[String(r['Paciente'] || '').trim()];
        return {
          id: uid('AGD'), code: String(r['ID'] || `AGD-${String(i+1).padStart(4,'0')}`), patientId: patient?.id || '', patientName: String(r['Paciente'] || '').trim(), professionalId: patient?.professionalId || '', professionalName: String(r['Profissional'] || patient?.professionalName || ''), clinicName: String(r['Clínica'] || patient?.clinicName || ''), frequency: String(r['Frequência'] || patient?.frequency || ''), date: excelValueToIso(r['Data'] || ''), time: excelValueToTime(r['Hora'] || ''), status: String(r['Status'] || 'AGENDADO'), monthName: String(r['Mês'] || ''), note: String(r['Observação'] || ''), configKey: patient ? appointmentConfigKey(patient) : `${String(r['Paciente'] || '').trim()}|${excelValueToTime(r['Hora'] || '')}`, phone: patient?.phone || ''
        };
      });

      const recRows = sheetRows(workbook, 'Recebimentos', 3, 4).filter(r => String(r['Paciente'] || '').trim());
      next.receivables = recRows.map((r, i) => {
        const patient = patientsByName[String(r['Paciente'] || '').trim()];
        return {
          id: uid('REC'), code: String(r['ID'] || `REC-${String(i+1).padStart(4,'0')}`), patientId: patient?.id || '', patientName: String(r['Paciente'] || '').trim(), professionalName: String(r['Profissional'] || patient?.professionalName || ''), clinicName: String(r['Clínica'] || patient?.clinicName || ''), amountPlanned: Number(r['Valor Previsto'] || 0), amountPaid: Number(r['Valor Realizado'] || 0), dueDate: excelValueToIso(r['Data Prevista'] || ''), paymentDate: excelValueToIso(r['Data Pagamento'] || ''), competence: excelValueToIso(r['Data Prevista'] || '').slice(0,7), monthName: String(r['Mês'] || ''), status: String(r['Status'] || 'Em Aberto'), configKey: patient ? appointmentConfigKey(patient) : String(r['Paciente'] || '').trim(), phone: patient?.phone || ''
        };
      });

      const payRows = sheetRows(workbook, 'Pagamentos', 3, 4).filter(r => String(r['Categoria'] || r['Descrição'] || '').trim());
      next.payables = payRows.map((r, i) => ({
        id: uid('PAG'), code: String(r['ID'] || `PAG-${String(i+1).padStart(4,'0')}`), dueDate: excelValueToIso(r['Data Prevista'] || ''), monthName: String(r['Mês'] || ''), category: String(r['Categoria'] || ''), description: String(r['Descrição'] || ''), clinicName: String(r['Clínica'] || 'Todas as clínicas'), amountPlanned: Number(r['Valor Previsto'] || 0), amountPaid: Number(r['Valor Realizado'] || 0)
      }));

      next.receivables.forEach(r => r.status = receiveStatus(r));
      next.payables.forEach(p => p.status = receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }));
      next.audits.unshift({ id: uid('AUD'), at: new Date().toISOString(), actor: state.session?.name || 'Sistema', role: currentRole() || 'SISTEMA', route: state.meta.route, action: 'Importação de planilha', detail: `Workbook importado: ${file.name}`, entity: 'workbook', before: '', after: `${next.patients.length} pacientes, ${next.appointments.length} agendamentos`, origin: 'xlsm' });
      state = next;
      saveState();
    });
  }
  function filteredAppointments() {
    let items = [...state.appointments].sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    if (state.meta.clinicFilter !== 'Todas as clínicas') items = items.filter(a => a.clinicName === state.meta.clinicFilter);
    if (state.meta.monthFilter !== 'Todos') items = items.filter(a => a.monthName === state.meta.monthFilter);
    return items;
  }
  function filteredReceivables() {
    let items = [...state.receivables].map(r => ({ ...r, status: receiveStatus(r) })).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
    if (state.meta.clinicFilter !== 'Todas as clínicas') items = items.filter(r => r.clinicName === state.meta.clinicFilter);
    if (state.meta.monthFilter !== 'Todos') items = items.filter(r => r.monthName === state.meta.monthFilter);
    return items;
  }
  function filteredPayables() {
    let items = [...state.payables].map(p => ({ ...p, status: receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }) })).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
    if (state.meta.clinicFilter !== 'Todas as clínicas') items = items.filter(p => p.clinicName === state.meta.clinicFilter);
    if (state.meta.monthFilter !== 'Todos') items = items.filter(p => p.monthName === state.meta.monthFilter);
    return items;
  }
  function filteredCashEntries() {
    let items = [...(state.cashEntries || [])].sort((a,b) => `${b.movementDate} ${b.createdAt || ''}`.localeCompare(`${a.movementDate} ${a.createdAt || ''}`));
    if (state.meta.clinicFilter !== 'Todas as clínicas') items = items.filter(entry => !entry.clinicName || entry.clinicName === state.meta.clinicFilter);
    if (state.meta.monthFilter !== 'Todos') items = items.filter(entry => entry.monthName === state.meta.monthFilter);
    return items;
  }
  function withinPeriod(dateValue, startDate, endDate) {
    if (!dateValue) return false;
    if (startDate && dateValue < startDate) return false;
    if (endDate && dateValue > endDate) return false;
    return true;
  }
  function filteredReportPayables() {
    let items = [...(state.payables || [])].map(p => ({ ...p, status: receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }) }));
    if (state.meta.reportClinicFilter && state.meta.reportClinicFilter !== 'Todas as clínicas') items = items.filter(item => item.clinicName === state.meta.reportClinicFilter);
    if (state.meta.reportBankFilter && state.meta.reportBankFilter !== 'Todas as contas') items = items.filter(item => (item.bankAccountName || 'Sem conta') === state.meta.reportBankFilter);
    items = items.filter(item => withinPeriod(item.paymentDate || item.dueDate, state.meta.reportStartDate, state.meta.reportEndDate));
    return items.sort((a, b) => `${a.paymentDate || a.dueDate}`.localeCompare(`${b.paymentDate || b.dueDate}`));
  }
  function filteredReportReceivables() {
    let items = [...(state.receivables || [])].map(r => ({ ...r, status: receiveStatus(r) }));
    if (state.meta.reportClinicFilter && state.meta.reportClinicFilter !== 'Todas as clínicas') items = items.filter(item => item.clinicName === state.meta.reportClinicFilter);
    if (state.meta.reportBankFilter && state.meta.reportBankFilter !== 'Todas as contas') items = items.filter(item => (item.bankAccountName || 'Sem conta') === state.meta.reportBankFilter);
    items = items.filter(item => withinPeriod(item.paymentDate || item.dueDate, state.meta.reportStartDate, state.meta.reportEndDate));
    return items.sort((a, b) => `${a.paymentDate || a.dueDate}`.localeCompare(`${b.paymentDate || b.dueDate}`));
  }
  function filteredReportCashEntries() {
    let items = [...(state.cashEntries || [])];
    if (state.meta.reportClinicFilter && state.meta.reportClinicFilter !== 'Todas as clínicas') items = items.filter(item => !item.clinicName || item.clinicName === state.meta.reportClinicFilter);
    if (state.meta.reportBankFilter && state.meta.reportBankFilter !== 'Todas as contas') items = items.filter(item => (item.bankAccountName || 'Sem conta') === state.meta.reportBankFilter);
    items = items.filter(item => withinPeriod(item.movementDate, state.meta.reportStartDate, state.meta.reportEndDate));
    return items.sort((a, b) => `${a.movementDate}`.localeCompare(`${b.movementDate}`));
  }

  function filteredReportAppointments() {
    let items = [...(state.appointments || [])];
    if (state.meta.reportClinicFilter && state.meta.reportClinicFilter !== 'Todas as clínicas') items = items.filter(item => item.clinicName === state.meta.reportClinicFilter);
    items = items.filter(item => withinPeriod(item.date, state.meta.reportStartDate, state.meta.reportEndDate));
    return items.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }
  function filteredReportPatients() {
    let items = listPatientsDetailed();
    if (state.meta.reportClinicFilter && state.meta.reportClinicFilter !== 'Todas as clínicas') items = items.filter(item => item.clinicName === state.meta.reportClinicFilter);
    items = items.filter(item => {
      const dateValue = String(item.registrationDate || item.createdAt || '').slice(0,10);
      return !dateValue || withinPeriod(dateValue, state.meta.reportStartDate, state.meta.reportEndDate);
    });
    return items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }
  function reportTypeMeta(type = state.meta.reportType || 'summary') {
    const map = {
      summary: { label: 'Resumo executivo', subtitle: 'Visão consolidada financeira por período, clínica, banco e categoria.' },
      patients: { label: 'Pacientes cadastrados', subtitle: 'Relação cadastral de pacientes com vínculo clínico e financeiro.' },
      appointments: { label: 'Agendamentos', subtitle: 'Agenda operacional por período com status e profissionais.' },
      receivables: { label: 'Contas a receber', subtitle: 'Carteira financeira de recebimentos por paciente e clínica.' },
      payables: { label: 'Contas a pagar', subtitle: 'Despesas por categoria, clínica e situação de pagamento.' },
      cash: { label: 'Caixa & bancos', subtitle: 'Movimentações de caixa e posição por conta bancária.' }
    };
    return map[type] || map.summary;
  }
  function reportPrintTitle(type = state.meta.reportType || 'summary') {
    const meta = reportTypeMeta(type);
    const start = String(state.meta.reportStartDate || todayIso());
    const end = String(state.meta.reportEndDate || todayIso());
    const slug = String(meta.label || 'relatorio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return `${slug}-${start}-ate-${end}`;
  }
  function reportPrintFileName(type = state.meta.reportType || 'summary') {
    const meta = reportTypeMeta(type);
    const start = String(state.meta.reportStartDate || todayIso());
    const end = String(state.meta.reportEndDate || todayIso());
    const rawLabel = String(meta.label || 'Relatório');
    const safeLabel = rawLabel.replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return `Relatório ${safeLabel} - ${start} a ${end}.pdf`;
  }

  function buildReportCsvPayload(type = state.meta.reportType || 'summary') {
    const receivables = filteredReportReceivables();
    const payables = filteredReportPayables();
    const cashEntries = filteredReportCashEntries();
    const patients = filteredReportPatients();
    const appointments = filteredReportAppointments();
    if (type === 'patients') {
      const header = ['Paciente','Clínica','Profissional','Frequência','Dia/Horário','Mensalidade','Status','Data cadastro'];
      const rows = [header.join(';')].concat(patients.map(item => [item.name || '', item.clinicName || '', item.professionalName || '', item.frequency || '', `${item.weekday || ''} ${item.time || ''}`.trim(), Number(item.monthlyFee || 0).toFixed(2), item.status || '', String(item.registrationDate || item.createdAt || '').slice(0,10)].join(';')));
      return { filename: 'agenda-clinica-relatorio-pacientes.csv', title: 'Pacientes cadastrados', content: rows.join('\n') };
    }
    if (type === 'appointments') {
      const header = ['Codigo','Data','Hora','Paciente','Profissional','Clínica','Status'];
      const rows = [header.join(';')].concat(appointments.map(item => [item.code, item.date, item.time || '', item.patientName || '', item.professionalName || '', item.clinicName || '', item.status || ''].join(';')));
      return { filename: 'agenda-clinica-relatorio-agendamentos.csv', title: 'Agendamentos', content: rows.join('\n') };
    }
    if (type === 'receivables') {
      const header = ['Codigo','Vencimento','Paciente','Clínica','Previsto','Recebido','Status'];
      const rows = [header.join(';')].concat(receivables.map(item => [item.code, item.dueDate, item.patientName || '', item.clinicName || '', Number(item.amountPlanned || 0).toFixed(2), Number(item.amountPaid || 0).toFixed(2), item.status || ''].join(';')));
      return { filename: 'agenda-clinica-relatorio-contas-receber.csv', title: 'Contas a receber', content: rows.join('\n') };
    }
    if (type === 'payables') {
      const header = ['Codigo','Vencimento','Categoria','Descricao','Clínica','Previsto','Pago','Status'];
      const rows = [header.join(';')].concat(payables.map(item => [item.code, item.dueDate, normalizeExpenseCategory(item.category), item.description || '', item.clinicName || '', Number(item.amountPlanned || 0).toFixed(2), Number(item.amountPaid || 0).toFixed(2), item.status || ''].join(';')));
      return { filename: 'agenda-clinica-relatorio-contas-pagar.csv', title: 'Contas a pagar', content: rows.join('\n') };
    }
    if (type === 'cash') {
      const header = ['Codigo','Data','Tipo','Categoria','Descricao','Conta','Clínica','Valor','Origem'];
      const rows = [header.join(';')].concat(cashEntries.map(item => [item.code, item.movementDate, item.direction, normalizeExpenseCategory(item.category), item.description || '', item.bankAccountName || '', item.clinicName || '', Number(item.amount || 0).toFixed(2), item.originType || 'manual'].join(';')));
      return { filename: 'agenda-clinica-relatorio-caixa-bancos.csv', title: 'Caixa & bancos', content: rows.join('\n') };
    }
    const lines = ['Bloco;Previsto;Pago/Recebido;Observação'];
    lines.push(`Contas a Receber;${receivables.reduce((s,i)=>s+Number(i.amountPlanned||0),0).toFixed(2)};${receivables.reduce((s,i)=>s+Number(i.amountPaid||0),0).toFixed(2)};Inadimplência ${(receivables.filter(i=>i.status==='Atrasado').reduce((s,i)=>s+Math.max(Number(i.amountPlanned||0)-Number(i.amountPaid||0),0),0)).toFixed(2)}`);
    lines.push(`Contas a Pagar;${payables.reduce((s,i)=>s+Number(i.amountPlanned||0),0).toFixed(2)};${payables.reduce((s,i)=>s+Number(i.amountPaid||0),0).toFixed(2)};Em atraso ${(payables.filter(i=>i.status==='Atrasado').reduce((s,i)=>s+Math.max(Number(i.amountPlanned||0)-Number(i.amountPaid||0),0),0)).toFixed(2)}`);
    lines.push(`Caixa;${cashEntries.filter(i=>i.direction==='Entrada').reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2)};${cashEntries.filter(i=>i.direction==='Saída').reduce((s,i)=>s+Number(i.amount||0),0).toFixed(2)};Saldo ${(cashEntries.reduce((s,i)=>s+(i.direction==='Saída'?-Number(i.amount||0):Number(i.amount||0)),0)).toFixed(2)}`);
    return { filename: 'agenda-clinica-relatorio-resumo.csv', title: 'Resumo executivo', content: lines.join('\n') };
  }

  function downloadTextFile(filename, content, contentType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: contentType });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function cashMetrics() {
    const items = filteredCashEntries();
    const inflow = items.filter(entry => entry.direction === 'Entrada').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const outflow = items.filter(entry => entry.direction === 'Saída').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const balance = (state.bankAccounts || []).reduce((sum, account) => sum + accountBalance(account.id), 0);
    return { inflow, outflow, balance, entries: items.length, accounts: (state.bankAccounts || []).length };
  }

  function getAgendaRange() {
    const mode = state.meta.agendaMode;
    const ref = toDate(state.meta.agendaRefDate || todayIso());
    if (mode === 'Semana atual') return { mode, start: startOfWeekMonday(new Date()), end: addDays(startOfWeekMonday(new Date()), 6) };
    if (mode === 'Semana anterior') return { mode, start: addDays(startOfWeekMonday(new Date()), -7), end: addDays(startOfWeekMonday(new Date()), -1) };
    if (mode === 'Próxima semana') return { mode, start: addDays(startOfWeekMonday(new Date()), 7), end: addDays(startOfWeekMonday(new Date()), 13) };
    return { mode, start: new Date(ref.getFullYear(), ref.getMonth(), 1), end: endOfMonth(ref) };
  }
  const dashboardPalette = ['#4ea1ff', '#24c36a', '#ffb020', '#9a6bff', '#ff5d73', '#53d6ff', '#7dd3fc'];
  function compactMoney(value) {
    const num = Number(value || 0);
    const abs = Math.abs(num);
    const prefix = num < 0 ? '-' : '';
    if (abs >= 1000000) return `${prefix}R$ ${(abs / 1000000).toFixed(1).replace('.', ',')} mi`;
    if (abs >= 1000) return `${prefix}R$ ${(abs / 1000).toFixed(1).replace('.', ',')} mil`;
    return money(num);
  }
  function dashboardMonthKey(value) {
    if (!value) return '';
    const d = toDate(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
  }
  function dashboardMonthLabel(key) {
    if (!key) return '—';
    const [year, month] = key.split('-');
    return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][Number(month) - 1]}/${String(year).slice(-2)}`;
  }
  function matchesDashboardClinic(name) {
    return state.meta.clinicFilter === 'Todas as clínicas' || !name || name === state.meta.clinicFilter;
  }
  function currentClinicScopeName() {
    return state.meta.clinicFilter && state.meta.clinicFilter !== 'Todas as clínicas' ? state.meta.clinicFilter : '';
  }
  function currentClinicScopeId() {
    return findClinicIdByName(currentClinicScopeName()) || '';
  }
  function clinicScopedProfessionals() {
    const scope = currentClinicScopeName();
    return scope ? state.professionals.filter(p => (p.clinicName || clinicById(p.clinicId)?.name || '') === scope) : [...state.professionals];
  }
  function clinicScopedPatientsDetailed() {
    const scope = currentClinicScopeName();
    const items = listPatientsDetailed();
    return scope ? items.filter(p => (p.clinicName || professionalById(p.professionalId)?.clinicName || '') === scope) : items;
  }
  function matchesDashboardMonth(monthNameValue) {
    return state.meta.monthFilter === 'Todos' || monthNameValue === state.meta.monthFilter;
  }
  function scopedAppointments(respectMonth = true) {
    let items = [...(state.appointments || [])].sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    items = items.filter(a => matchesDashboardClinic(a.clinicName));
    if (respectMonth) items = items.filter(a => matchesDashboardMonth(a.monthName));
    return items;
  }
  function scopedReceivables(respectMonth = true) {
    let items = [...(state.receivables || [])].map(r => ({ ...r, status: receiveStatus(r) })).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
    items = items.filter(r => matchesDashboardClinic(r.clinicName));
    if (respectMonth) items = items.filter(r => matchesDashboardMonth(r.monthName));
    return items;
  }
  function scopedPayables(respectMonth = true) {
    let items = [...(state.payables || [])].map(p => ({ ...p, status: receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }) })).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
    items = items.filter(p => matchesDashboardClinic(p.clinicName));
    if (respectMonth) items = items.filter(p => matchesDashboardMonth(p.monthName));
    return items;
  }
  function lastDashboardMonths(total = 6) {
    const ref = toDate(todayIso());
    const list = [];
    for (let index = total - 1; index >= 0; index -= 1) {
      const d = new Date(ref.getFullYear(), ref.getMonth() - index, 1);
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`);
    }
    return list;
  }
  function dashboardMetrics() {
    const receivables = scopedReceivables(true);
    const payables = scopedPayables(true);
    const appointments = scopedAppointments(true);
    const today = todayIso();
    const planned = receivables.reduce((s, r) => s + Number(r.amountPlanned || 0), 0);
    const paid = receivables.reduce((s, r) => s + Number(r.amountPaid || 0), 0);
    const payablePlanned = payables.reduce((s, p) => s + Number(p.amountPlanned || 0), 0);
    const payablePaid = payables.reduce((s, p) => s + Number(p.amountPaid || 0), 0);
    const upcoming = appointments.filter(a => a.date >= today && a.status === 'AGENDADO').length;
    const done = appointments.filter(a => a.status === 'REALIZADO').length;
    const overdue = receivables.filter(r => receiveStatus(r) === 'Atrasado').length;
    const payableOverdue = payables.filter(p => receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned }) === 'Atrasado').length;
    return {
      planned,
      paid,
      payablePlanned,
      payablePaid,
      upcoming,
      done,
      overdue,
      payableOverdue,
      balance: paid - payablePaid,
      patients: state.patients.length,
      clinics: state.clinics.length,
      pros: state.professionals.length,
      receivableCount: receivables.length,
      payableCount: payables.length,
      toReceive: Math.max(planned - paid, 0),
      toPay: Math.max(payablePlanned - payablePaid, 0),
      collectionRate: planned > 0 ? (paid / planned) * 100 : 0,
      expenseRate: payablePlanned > 0 ? (payablePaid / payablePlanned) * 100 : 0
    };
  }
  function dashboardAnalytics() {
    const receivables = scopedReceivables(true);
    const payables = scopedPayables(true);
    const appointments = scopedAppointments(true);
    const historyReceivables = scopedReceivables(false);
    const historyPayables = scopedPayables(false);
    const monthKeys = lastDashboardMonths(6);
    const trend = monthKeys.map(key => {
      const planned = historyReceivables.filter(item => dashboardMonthKey(item.dueDate) === key).reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
      const received = historyReceivables.filter(item => dashboardMonthKey(item.paymentDate || item.dueDate) === key).reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      const payablePlanned = historyPayables.filter(item => dashboardMonthKey(item.dueDate) === key).reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
      const payablePaid = historyPayables.filter(item => dashboardMonthKey(item.paymentDate || item.dueDate) === key).reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      return { key, label: dashboardMonthLabel(key), planned, received, payablePlanned, payablePaid };
    });

    const receivableOutstanding = receivables.reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const receivableOverdueAmount = receivables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const receivableOpenAmount = Math.max(receivableOutstanding - receivableOverdueAmount, 0);
    const payableOutstanding = payables.reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const payableOverdueAmount = payables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const payableOpenAmount = Math.max(payableOutstanding - payableOverdueAmount, 0);

    const receivableMix = [
      { label: 'Recebido', value: receivables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0), color: dashboardPalette[1] },
      { label: 'Em aberto', value: receivableOpenAmount, color: dashboardPalette[0] },
      { label: 'Atrasado', value: receivableOverdueAmount, color: dashboardPalette[4] }
    ];
    const payableMix = [
      { label: 'Pago', value: payables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0), color: dashboardPalette[5] },
      { label: 'Em aberto', value: payableOpenAmount, color: dashboardPalette[2] },
      { label: 'Atrasado', value: payableOverdueAmount, color: dashboardPalette[4] }
    ];
    const appointmentMix = [
      { label: 'Agendado', value: appointments.filter(item => item.status === 'AGENDADO').length, color: dashboardPalette[0] },
      { label: 'Realizado', value: appointments.filter(item => item.status === 'REALIZADO').length, color: dashboardPalette[1] },
      { label: 'Faltou', value: appointments.filter(item => item.status === 'FALTOU').length, color: dashboardPalette[2] },
      { label: 'Cancelado', value: appointments.filter(item => item.status === 'CANCELADO').length, color: dashboardPalette[4] }
    ];

    const clinicStats = (state.clinics || []).map(clinic => {
      const items = receivables.filter(item => item.clinicName === clinic.name);
      const clinicAppointments = appointments.filter(item => item.clinicName === clinic.name);
      const planned = items.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
      const paid = items.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      return {
        label: clinic.name,
        planned,
        paid,
        pending: Math.max(planned - paid, 0),
        done: clinicAppointments.filter(item => item.status === 'REALIZADO').length,
        patients: new Set(items.map(item => item.patientId || item.patientName).filter(Boolean)).size
      };
    }).filter(item => item.planned > 0 || item.paid > 0 || item.done > 0).sort((a,b) => b.paid - a.paid || b.planned - a.planned).slice(0, 6);

    const professionalStats = (state.professionals || []).map(professional => {
      const items = receivables.filter(item => item.professionalId === professional.id || item.professionalName === professional.name);
      const professionalAppointments = appointments.filter(item => item.professionalId === professional.id || item.professionalName === professional.name);
      const planned = items.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
      const paid = items.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      return {
        label: professional.name,
        clinicName: professional.clinicName || '—',
        planned,
        paid,
        pending: Math.max(planned - paid, 0),
        done: professionalAppointments.filter(item => item.status === 'REALIZADO').length,
        upcoming: professionalAppointments.filter(item => item.status === 'AGENDADO').length
      };
    }).filter(item => item.planned > 0 || item.paid > 0 || item.done > 0 || item.upcoming > 0).sort((a,b) => b.paid - a.paid || b.planned - a.planned).slice(0, 6);

    const patientRanking = listPatientsDetailed().map(patient => {
      const items = receivables.filter(item => item.patientId === patient.id || item.patientName === patient.name);
      const planned = items.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
      const paid = items.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      const pending = Math.max(planned - paid, 0);
      return {
        name: patient.name,
        clinicName: patient.clinicName || '—',
        professionalName: patient.professionalName || '—',
        planned,
        paid,
        pending,
        ticket: items.length ? planned / items.length : 0,
        status: pending > 0 ? 'A receber' : 'Em dia'
      };
    }).filter(item => item.planned > 0 || item.paid > 0).sort((a,b) => b.paid - a.paid || b.planned - a.planned).slice(0, 10);

    const expenseCategoryBuckets = new Map();
    payables.forEach(item => {
      const label = normalizeExpenseCategory(item.category);
      const bucket = expenseCategoryBuckets.get(label) || { label, planned: 0, paid: 0, pending: 0, count: 0, overdue: 0 };
      bucket.planned += Number(item.amountPlanned || 0);
      bucket.paid += Number(item.amountPaid || 0);
      bucket.pending += Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0);
      bucket.count += 1;
      if (item.status === 'Atrasado') bucket.overdue += Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0);
      expenseCategoryBuckets.set(label, bucket);
    });
    const expenseCategoryStats = [...expenseCategoryBuckets.values()]
      .sort((a,b) => b.planned - a.planned || b.paid - a.paid || a.label.localeCompare(b.label, 'pt-BR'))
      .slice(0, 8);
    const expenseCategoryMixBase = [...expenseCategoryBuckets.values()]
      .sort((a,b) => b.planned - a.planned || b.paid - a.paid || a.label.localeCompare(b.label, 'pt-BR'));
    const expenseCategoryMix = expenseCategoryMixBase.slice(0, 5).map((item, index) => ({
      label: item.label,
      value: Number(item.planned || 0),
      color: dashboardPalette[index % dashboardPalette.length]
    }));
    const remainingExpenseMix = expenseCategoryMixBase.slice(5).reduce((sum, item) => sum + Number(item.planned || 0), 0);
    if (remainingExpenseMix > 0) expenseCategoryMix.push({ label: 'Outras', value: remainingExpenseMix, color: '#94a3b8' });

    const historyCategoryTotals = new Map();
    historyPayables.forEach(item => {
      const label = normalizeExpenseCategory(item.category);
      const base = Number(item.amountPaid || 0) > 0 ? Number(item.amountPaid || 0) : Number(item.amountPlanned || 0);
      historyCategoryTotals.set(label, (historyCategoryTotals.get(label) || 0) + base);
    });
    const topExpenseCategories = [...historyCategoryTotals.entries()]
      .sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
      .slice(0, 4)
      .map(([label]) => label);
    const expenseCategoryTrend = monthKeys.map(key => ({
      key,
      label: dashboardMonthLabel(key),
      categories: topExpenseCategories.map(label => {
        const monthlyItems = historyPayables.filter(item => dashboardMonthKey(item.paymentDate || item.dueDate) === key && normalizeExpenseCategory(item.category) === label);
        return {
          label,
          planned: monthlyItems.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0),
          paid: monthlyItems.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0)
        };
      })
    }));

    return { trend, receivableMix, payableMix, appointmentMix, clinicStats, professionalStats, patientRanking, expenseCategoryStats, expenseCategoryMix, expenseCategoryTrend, topExpenseCategories };
  }
  function donutBackground(segments) {
    const valid = segments.filter(item => Number(item.value || 0) > 0);
    if (!valid.length) return 'conic-gradient(#253657 0deg 360deg)';
    const total = valid.reduce((sum, item) => sum + Number(item.value || 0), 0) || 1;
    let cursor = 0;
    return `conic-gradient(${valid.map(item => {
      const start = cursor;
      cursor += (Number(item.value || 0) / total) * 360;
      return `${item.color} ${start}deg ${cursor}deg`;
    }).join(', ')})`;
  }
  function renderDonutCard(title, subtitle, segments, centerValue, centerLabel, badgeText = '') {
    const total = segments.reduce((sum, item) => sum + Number(item.value || 0), 0);
    return `
      <article class="card chart-card">
        <div class="spread chart-head"><div><h3>${title}</h3><div class="muted">${subtitle}</div></div>${badgeText ? `<span class="badge info">${badgeText}</span>` : ''}</div>
        <div class="donut-layout">
          <div class="donut-ring" style="background:${donutBackground(segments)}">
            <div class="donut-hole"><strong>${centerValue}</strong><span>${centerLabel}</span></div>
          </div>
          <div class="legend-list">
            ${segments.map(item => `<div class="legend-item"><span class="legend-dot" style="background:${item.color}"></span><div><strong>${item.label}</strong><small>${typeof item.value === 'number' && total > 12 ? compactMoney(item.value) : String(item.value)}</small></div></div>`).join('')}
          </div>
        </div>
      </article>`;
  }
  function renderTrendCard(series) {
    const max = Math.max(1, ...series.flatMap(item => [item.planned, item.received, item.payablePlanned, item.payablePaid]));
    const hasValues = series.some(item => item.planned || item.received || item.payablePlanned || item.payablePaid);
    if (!hasValues) {
      return `<article class="card chart-card"><h3>Evolução financeira</h3><div class="empty">Ainda não há valores suficientes para montar a evolução financeira.</div></article>`;
    }
    return `
      <article class="card chart-card">
        <div class="spread chart-head">
          <div>
            <h3>Evolução financeira</h3>
            <div class="muted">Últimos 6 meses com comparativo entre valores previstos, recebidos, a pagar e pagos.</div>
          </div>
          <div class="legend-inline">
            <span><i style="background:${dashboardPalette[0]}"></i>Previsto</span>
            <span><i style="background:${dashboardPalette[1]}"></i>Recebido</span>
            <span><i style="background:${dashboardPalette[2]}"></i>Despesa prevista</span>
            <span><i style="background:${dashboardPalette[5]}"></i>Despesa paga</span>
          </div>
        </div>
        <div class="trend-chart">
          ${series.map(item => `
            <div class="trend-month">
              <div class="trend-bars">
                <span class="trend-bar planned" style="height:${Math.max(item.planned ? 16 : 0, (item.planned / max) * 170)}px" title="Previsto ${money(item.planned)}"></span>
                <span class="trend-bar received" style="height:${Math.max(item.received ? 16 : 0, (item.received / max) * 170)}px" title="Recebido ${money(item.received)}"></span>
                <span class="trend-bar payable" style="height:${Math.max(item.payablePlanned ? 16 : 0, (item.payablePlanned / max) * 170)}px" title="Despesa prevista ${money(item.payablePlanned)}"></span>
                <span class="trend-bar paidout" style="height:${Math.max(item.payablePaid ? 16 : 0, (item.payablePaid / max) * 170)}px" title="Despesa paga ${money(item.payablePaid)}"></span>
              </div>
              <div class="trend-label">${item.label}</div>
              <div class="trend-note">${compactMoney(item.received)} receb.</div>
            </div>`).join('')}
        </div>
      </article>`;
  }
  function renderPerformanceCard(title, subtitle, items, badgeText, footerBuilder) {
    if (!items.length) {
      return `<article class="card chart-card"><div class="spread chart-head"><div><h3>${title}</h3><div class="muted">${subtitle}</div></div>${badgeText ? `<span class="badge info">${badgeText}</span>` : ''}</div><div class="empty">Sem dados suficientes para exibir este comparativo.</div></article>`;
    }
    const max = Math.max(1, ...items.map(item => Math.max(item.planned || 0, item.paid || 0)));
    return `
      <article class="card chart-card">
        <div class="spread chart-head"><div><h3>${title}</h3><div class="muted">${subtitle}</div></div>${badgeText ? `<span class="badge info">${badgeText}</span>` : ''}</div>
        <div class="performance-list">
          ${items.map(item => `
            <div class="performance-item">
              <div class="spread"><strong>${safe(item.label)}</strong><span>${money(item.paid || 0)}</span></div>
              <div class="progress-track"><span class="progress-planned" style="width:${((item.planned || 0) / max) * 100}%"></span><span class="progress-paid" style="width:${((item.paid || 0) / max) * 100}%"></span></div>
              <div class="metric-line">${footerBuilder(item)}</div>
            </div>`).join('')}
        </div>
      </article>`;
  }
  function renderExpenseCategoryTrendCard(series, categories) {
    if (!categories.length) {
      return `<article class="card chart-card"><h3>Evolução por categoria de despesa</h3><div class="empty">Cadastre despesas categorizadas para visualizar a evolução mensal.</div></article>`;
    }
    return `
      <article class="card chart-card">
        <div class="spread chart-head">
          <div>
            <h3>Evolução por categoria de despesa</h3>
            <div class="muted">Últimos 6 meses por categoria. Em cada célula: previsto e pago.</div>
          </div>
          <span class="badge info">${categories.length} categorias líderes</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Mês</th>${categories.map(label => `<th>${safe(label)}</th>`).join('')}</tr></thead>
            <tbody>
              ${series.map(row => `
                <tr>
                  <td><strong>${safe(row.label)}</strong></td>
                  ${categories.map(label => {
                    const cell = row.categories.find(item => item.label === label) || { planned: 0, paid: 0 };
                    return `<td><strong>${compactMoney(cell.planned)}</strong><br><small class="muted">Pago ${compactMoney(cell.paid)}</small></td>`;
                  }).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </article>`;
  }

  async function quickUpdateAppointmentStatus(id, requestedStatus = '') {
    const item = state.appointments.find(x => String(x.id) === String(id));
    if (!item) return;
    const before = clone(item);
    const statusMap = {
      '1': 'AGENDADO',
      '2': 'REALIZADO',
      '3': 'FALTOU',
      '4': 'CANCELADO',
      AGENDADO: 'AGENDADO',
      REALIZADO: 'REALIZADO',
      FALTOU: 'FALTOU',
      CANCELADO: 'CANCELADO'
    };
    let nextStatus = statusMap[String(requestedStatus || '').trim().toUpperCase()];
    if (!nextStatus) {
      const optionsText = ['AGENDADO', 'REALIZADO', 'FALTOU', 'CANCELADO'].map((status, index) => `${index + 1} - ${status}`).join('\n');
      const answer = prompt(`Alterar status do agendamento de ${item.patientName}\n\nStatus atual: ${item.status || 'AGENDADO'}\n\nEscolha digitando o nome ou número:\n${optionsText}`, item.status || 'AGENDADO');
      if (answer == null) return;
      nextStatus = statusMap[String(answer || '').trim().toUpperCase()];
    }
    if (!nextStatus) {
      alert('Status inválido. Use AGENDADO, REALIZADO, FALTOU, CANCELADO ou os números 1 a 4.');
      return;
    }
    if (nextStatus === item.status) return;
    item.status = nextStatus;
    try {
      if (useBackend()) await updateBackendRecord('appointments', item.id, item, { skipSync: true });
      saveState();
      await syncAppointmentToGoogleCalendar(item, { origin: 'quick-status' });
      audit('Agenda visual', `Status alterado rapidamente para ${nextStatus}: ${item.patientName} em ${fmtDateTime(item.date, item.time)}.`, { entity: 'appointment', before, after: item });
      render();
    } catch (error) {
      Object.assign(item, before);
      alert(error.message || 'Não foi possível atualizar o status do agendamento.');
    }
  }
  async function quickRescheduleAppointment(id) {
    const item = state.appointments.find(x => String(x.id) === String(id));
    if (!item) return;
    if (state.meta.agendaMode !== 'Semana atual') {
      alert('A remarcação rápida pela Agenda Visual está liberada apenas no modo Semana atual.');
      return;
    }
    const range = getAgendaRange();
    const before = clone(item);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:560px">
        <div class="spread"><h3>📅 Remarcar sessão</h3><button type="button" class="btn ghost" id="rm-close-btn">&times;</button></div>
        <div class="notice" style="margin-bottom:14px"><strong>${safe(item.patientName)}</strong><br>${safe(item.professionalName || '')}<br>Semana atual: ${fmtDate(range.start)} até ${fmtDate(range.end)}</div>
        <form id="rm-form" class="toolbar">
          <div class="field"><label>Nova data</label><input id="rm-date" name="date" type="date" min="${safe(toIso(range.start))}" max="${safe(toIso(range.end))}" value="${safe(item.date || toIso(range.start))}" required /></div>
          <div class="field"><label>Novo horário</label>
            <select id="rm-time" name="time">${timeSlots.map(slot => `<option value="${safe(slot)}" ${slot === String(item.time || '08:00') ? 'selected' : ''}>${safe(slot)}</option>`).join('')}</select>
          </div>
          <div class="footer-note" style="margin-top:2px">A remarcação rápida altera somente este agendamento da semana corrente.</div>
          <div class="flex" style="justify-content:flex-end;margin-top:8px">
            <button type="button" class="btn ghost" id="rm-cancel-btn">Cancelar</button>
            <button type="submit" class="btn primary">Salvar remarcação</button>
          </div>
        </form>
      </div>`;

    const close = () => { try { overlay.remove(); } catch {} };
    overlay.querySelector('#rm-close-btn')?.addEventListener('click', close);
    overlay.querySelector('#rm-cancel-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('#rm-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const newDate = String(overlay.querySelector('#rm-date')?.value || '').trim();
      const newTime = String(overlay.querySelector('#rm-time')?.value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
        alert('Data inválida. Use o formato YYYY-MM-DD.');
        return;
      }
      if (newDate < toIso(range.start) || newDate > toIso(range.end)) {
        alert(`A nova data deve estar dentro da semana atual: ${fmtDate(range.start)} até ${fmtDate(range.end)}.`);
        return;
      }
      if (!/^\d{2}:\d{2}$/.test(newTime)) {
        alert('Horário inválido. Use o formato HH:MM.');
        return;
      }
      const conflict = state.appointments.find(a => String(a.id) !== String(item.id) && a.date === newDate && a.time === newTime && (a.professionalId === item.professionalId || a.professionalName === item.professionalName));
      if (conflict && !confirm(`Já existe um agendamento de ${conflict.patientName} para ${fmtDate(conflict.date)} às ${conflict.time} com este profissional. Deseja remarcar mesmo assim?`)) return;
      item.date = newDate;
      item.time = newTime;
      item.monthName = monthName(new Date(`${newDate}T00:00:00`).getMonth());
      item.note = `${fmtDate(newDate)} às ${newTime}`;
      try {
        if (useBackend()) await updateBackendRecord('appointments', item.id, item, { skipSync: true });
        saveState();
        await syncAppointmentToGoogleCalendar(item, { origin: 'quick-reschedule' });
        audit('Agenda visual', `Sessão remarcada: ${item.patientName} para ${fmtDate(newDate)} às ${newTime}.`, { entity: 'appointment', before, after: item });
        close();
        render();
      } catch (error) {
        Object.assign(item, before);
        alert(error.message || 'Não foi possível remarcar o agendamento.');
      }
    });
    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('#rm-date')?.focus(), 30);
  }


  window.quickRescheduleAppointment = quickRescheduleAppointment;

  function clinicalKeywordList() {
    return String(state.settings?.clinicalKeywordLibrary || '')
      .split(',')
      .map(item => String(item || '').trim().toUpperCase())
      .filter(Boolean);
  }
  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function extractClinicalKeywords(transcript = '') {
    const content = String(transcript || '').toUpperCase();
    return clinicalKeywordList().filter(keyword => new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(content));
  }
  function buildSoapFromTranscript(transcript = '') {
    const raw = String(transcript || '').trim();
    const normalized = raw.replace(/\s+/g, ' ');
    const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
    const first = sentences.slice(0, 3).join(' ') || normalized;
    const middle = sentences.slice(3, 6).join(' ') || normalized;
    const last = sentences.slice(-3).join(' ') || normalized;
    const keywords = extractClinicalKeywords(normalized);
    return {
      subjective: first || 'Relato subjetivo não informado.',
      objective: middle || 'Sem observações objetivas registradas.',
      assessment: keywords.length ? `Temas centrais percebidos: ${keywords.join(', ')}.` : 'Sem palavras-chave clínicas predominantes detectadas automaticamente.',
      plan: last || 'Definir próximos passos terapêuticos e acompanhamento.'
    };
  }
  function summarizeTranscript(transcript = '') {
    const cleaned = String(transcript || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.length > 280 ? `${cleaned.slice(0, 277)}...` : cleaned;
  }

  function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function currentClinicalWhatsappUrl(session = currentClinicalSession()) {
    if (!session) return '';
    const patient = patientById(session.patientId);
    const patientName = session.patientName || patient?.name || 'paciente';
    return whatsappLink(patient?.phone || '', `Olá ${patientName}, podemos iniciar seu atendimento agora? Assim que abrir este chat, toque no ícone de vídeo do WhatsApp para começar a chamada.`);
  }
  function updateClinicalRecordButton() {
    const btn = document.getElementById('clinical-record-summary-btn');
    if (!btn) return;
    btn.textContent = clinicalSpeechActive ? 'Parar resumo' : 'Gravar resumo';
    btn.className = clinicalSpeechActive ? 'btn danger' : 'btn warn';
  }
  function updateClinicalTranscriptPreview(interimText = '') {
    const live = document.getElementById('clinical-transcript-live');
    const finalText = document.getElementById('clinical-transcript-final');
    const consolidated = String(finalText?.value || '').trim();
    if (live) live.value = [consolidated, String(interimText || '').trim()].filter(Boolean).join('\n');
    const session = currentClinicalSession();
    if (session) {
      const keywords = extractClinicalKeywords(consolidated);
      const keywordWrap = document.getElementById('clinical-keywords');
      if (keywordWrap) keywordWrap.innerHTML = keywords.length ? keywords.map(item => `<span class="chip">${safe(item)}</span>`).join('') : '<span class="muted">Nenhuma palavra-chave extraída.</span>';
      const summaryField = document.getElementById('clinical-summary');
      if (summaryField && !summaryField.value.trim()) summaryField.value = summarizeTranscript(consolidated);
    }
  }
  function stopClinicalVoiceCapture(options = {}) {
    const keepStatus = !!options.keepStatus;
    clinicalSpeechActive = false;
    if (clinicalSpeechRecognition) {
      const recognition = clinicalSpeechRecognition;
      clinicalSpeechRecognition = null;
      try { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.stop(); } catch {}
    }
    if (clinicalVoiceStream) {
      try { clinicalVoiceStream.getTracks().forEach(track => track.stop()); } catch {}
      clinicalVoiceStream = null;
    }
    updateClinicalRecordButton();
    updateClinicalTranscriptPreview('');
    const session = currentClinicalSession();
    if (session) queueClinicalDraftSync(session.id, 'manual');
    if (!keepStatus) setClinicalRuntimeStatus('Resumo por voz encerrado. Revise o texto e gere o SOAP.', 'info');
  }
  async function startClinicalVoiceCapture() {
    const session = currentClinicalSession();
    if (!session) throw new Error('Inicie ou selecione uma sessão antes de gravar o resumo.');
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) throw new Error('Ditado por voz não disponível neste computador. Você ainda pode colar ou digitar o resumo manualmente.');
    if (clinicalSpeechActive) return;
    if (navigator.mediaDevices?.getUserMedia) clinicalVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recognition = new SpeechRecognitionCtor();
    clinicalSpeechRecognition = recognition;
    clinicalSpeechActive = true;
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const finalField = document.getElementById('clinical-transcript-final');
      let finalChunk = '';
      let interimChunk = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const chunk = String(event.results[index]?.[0]?.transcript || '').trim();
        if (!chunk) continue;
        if (event.results[index].isFinal) finalChunk = [finalChunk, chunk].filter(Boolean).join(' ');
        else interimChunk = [interimChunk, chunk].filter(Boolean).join(' ');
      }
      if (finalChunk && finalField) finalField.value = [String(finalField.value || '').trim(), finalChunk].filter(Boolean).join('\n');
      updateClinicalTranscriptPreview(interimChunk);
    };
    recognition.onerror = event => {
      stopClinicalVoiceCapture({ keepStatus: true });
      const message = ({ 'not-allowed': 'Permissão do microfone negada.', 'service-not-allowed': 'Ditado por voz bloqueado neste dispositivo.', 'audio-capture': 'Nenhum microfone disponível.', network: 'Falha de rede no ditado por voz.' })[event?.error] || 'Não foi possível capturar o resumo por voz.';
      setClinicalRuntimeStatus(message, 'warn');
    };
    recognition.onend = () => {
      if (clinicalSpeechActive && clinicalSpeechRecognition === recognition) {
        try { recognition.start(); } catch {
          stopClinicalVoiceCapture({ keepStatus: true });
          setClinicalRuntimeStatus('Resumo por voz interrompido. Clique novamente para continuar.', 'warn');
        }
      }
    };
    recognition.start();
    updateClinicalRecordButton();
    setClinicalRuntimeStatus('Ouvindo seu resumo. Dite a evolução da sessão em voz alta.', 'ok');
  }
  async function toggleClinicalVoiceCapture() {
    if (clinicalSpeechActive) {
      stopClinicalVoiceCapture();
      return;
    }
    await startClinicalVoiceCapture();
  }
  async function openClinicalWhatsapp() {
    const session = currentClinicalSession();
    if (!session) throw new Error('Inicie uma sessão antes de abrir o WhatsApp.');
    const url = currentClinicalWhatsappUrl(session);
    if (!url) throw new Error('Cadastre o telefone do paciente para abrir o WhatsApp.');
    session.callStatus = 'whatsapp';
    session.roomUrl = url;
    session.dailyRoomUrl = '';
    saveState();
    if (useBackend()) await persistClinicalSession(session.id, { roomUrl: url, dailyRoomUrl: '', callStatus: 'whatsapp' }, false);
    else queueClinicalDraftSync(session.id, 'manual');
    window.open(url, '_blank', 'noopener');
    setClinicalRuntimeStatus('WhatsApp aberto. Faça a videochamada por lá e depois volte para ditar o resumo.', 'ok');
  }
  function currentClinicalDraftPayload() {
    const transcriptLive = document.getElementById('clinical-transcript-live')?.value || currentClinicalSession()?.transcriptLive || '';
    const transcriptFinal = document.getElementById('clinical-transcript-final')?.value || currentClinicalSession()?.transcriptFinal || transcriptLive;
    return {
      transcriptLive,
      transcriptFinal,
      roomUrl: document.getElementById('clinical-room-url')?.value || currentClinicalSession()?.roomUrl || currentClinicalSession()?.dailyRoomUrl || '',
      dailyRoomUrl: document.getElementById('clinical-room-url')?.value || currentClinicalSession()?.dailyRoomUrl || currentClinicalSession()?.roomUrl || '',
      mainReason: document.getElementById('clinical-main-reason')?.value || currentClinicalSession()?.mainReason || '',
      fullEvolution: document.getElementById('clinical-full-evolution')?.value || currentClinicalSession()?.fullEvolution || '',
      anamnesisInitial: document.getElementById('clinical-anamnesis')?.value || currentClinicalSession()?.anamnesisInitial || '',
      summary: document.getElementById('clinical-summary')?.value || summarizeTranscript(transcriptFinal),
      soapSubjective: document.getElementById('soap-subjective')?.value || currentClinicalSession()?.soapSubjective || '',
      soapObjective: document.getElementById('soap-objective')?.value || currentClinicalSession()?.soapObjective || '',
      soapAssessment: document.getElementById('soap-assessment')?.value || currentClinicalSession()?.soapAssessment || '',
      soapPlan: document.getElementById('soap-plan')?.value || currentClinicalSession()?.soapPlan || '',
      keywords: extractClinicalKeywords(transcriptFinal)
    };
  }
  function currentClinicalSession() {
    const selectedId = String(state.meta.selectedClinicalSessionId || '');
    const sessions = [...(state.sessions || [])].sort((a, b) => String(b.startedAt || b.createdAt || '').localeCompare(String(a.startedAt || a.createdAt || '')));
    return sessions.find(item => String(item.id) === selectedId) || sessions[0] || null;
  }
  function nextAppointmentForPatient(patientId) {
    return [...(state.appointments || [])]
      .filter(item => String(item.patientId) === String(patientId))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0] || null;
  }
  function clinicalStatusToneClass(tone = 'info') {
    return ({ ok: 'ok', success: 'ok', warn: 'warn', danger: 'danger', error: 'danger', info: 'info' })[tone] || 'info';
  }
  function setClinicalRuntimeStatus(message = '', tone = 'info') {
    const node = document.getElementById('clinical-runtime-status');
    if (!node) return;
    node.className = `badge ${clinicalStatusToneClass(tone)}`;
    node.textContent = message || 'Pronto';
  }
  function buildTranscriptFromSegments(segments = []) {
    return (segments || [])
      .filter(item => item && item.isFinal !== false)
      .map(item => String(item.text || '').trim())
      .filter(Boolean)
      .join('\n');
  }
  function parseDailyTranscriptMessage(event = {}) {
    const raw = event?.rawResponse || event?.raw_response || {};
    const rawAlt = raw?.channel?.alternatives?.[0] || raw?.alternatives?.[0] || {};
    const text = String(
      event?.text ||
      event?.transcript ||
      event?.message ||
      rawAlt?.transcript ||
      ''
    ).trim();
    const isFinal = Boolean(
      event?.is_final ||
      event?.isFinal ||
      raw?.is_final ||
      raw?.speech_final ||
      raw?.type === 'final'
    );
    const speaker = String(event?.participantName || event?.speaker || event?.participantId || 'Participante').trim();
    const timestamp = event?.timestamp || raw?.start || Date.now();
    const segmentId = String(event?.id || `${timestamp}-${speaker}-${text.slice(0, 24)}`);
    return { text, isFinal, speaker, timestamp, id: segmentId };
  }
  function syncClinicalTextareas(session) {
    const live = document.getElementById('clinical-transcript-live');
    const finalText = document.getElementById('clinical-transcript-final');
    const summary = document.getElementById('clinical-summary');
    const room = document.getElementById('clinical-room-url');
    const reason = document.getElementById('clinical-main-reason');
    const fullEvo = document.getElementById('clinical-full-evolution');
    const anamnesis = document.getElementById('clinical-anamnesis');
    const keywordWrap = document.getElementById('clinical-keywords');
    if (live) live.value = session?.transcriptLive || '';
    if (finalText) finalText.value = session?.transcriptFinal || '';
    if (reason && !reason.value.trim()) reason.value = session?.mainReason || '';
    if (fullEvo && !fullEvo.value.trim()) fullEvo.value = session?.fullEvolution || '';
    if (anamnesis && !anamnesis.value.trim()) anamnesis.value = session?.anamnesisInitial || '';
    if (summary && !summary.value.trim()) summary.value = session?.summary || summarizeTranscript(session?.transcriptFinal || session?.transcriptLive || '');
    if (room && !room.value.trim()) room.value = session?.roomUrl || session?.dailyRoomUrl || '';
    if (keywordWrap) keywordWrap.innerHTML = (session?.keywords || []).length ? session.keywords.map(item => `<span class="chip">${safe(item)}</span>`).join('') : '<span class="muted">Nenhuma palavra-chave extraída.</span>';
  }
  async function loadDailyRuntimeConfig(force = false) {
    if (!useBackend()) {
      dailyConfigCache = { enabled: false, domain: '', mode: 'offline' };
      return dailyConfigCache;
    }
    if (!force && dailyConfigCache) return dailyConfigCache;
    try {
      dailyConfigCache = await api.getDailyConfig(apiBase(), state.session.token);
    } catch {
      dailyConfigCache = { enabled: false, domain: '', mode: 'unavailable' };
    }
    return dailyConfigCache;
  }
  async function queueClinicalDraftSync(sessionId, reason = 'autosave') {
    clearTimeout(dailyDraftSyncTimer);
    dailyDraftSyncTimer = setTimeout(async () => {
      const session = (state.sessions || []).find(item => String(item.id) === String(sessionId || currentClinicalSession()?.id || ''));
      if (!session) return;
      try {
        const payload = currentClinicalDraftPayload();
        await persistClinicalSession(session.id, payload, false);
        setClinicalRuntimeStatus(reason === 'transcription' ? 'Legenda sincronizada automaticamente.' : 'Rascunho sincronizado automaticamente.', 'info');
      } catch (error) {
        setClinicalRuntimeStatus(error.message || 'Falha ao sincronizar rascunho.', 'warn');
      }
    }, 1200);
  }
  function handleDailyTranscriptionEvent(sessionId, event = {}) {
    const session = (state.sessions || []).find(item => String(item.id) === String(sessionId));
    if (!session) return;
    const parsed = parseDailyTranscriptMessage(event);
    if (!parsed.text) return;
    session.transcriptSegments ||= [];
    const existingIndex = session.transcriptSegments.findIndex(item => item.id === parsed.id);
    if (existingIndex >= 0) session.transcriptSegments[existingIndex] = { ...session.transcriptSegments[existingIndex], ...parsed };
    else session.transcriptSegments.push(parsed);
    session.transcriptFinal = buildTranscriptFromSegments(session.transcriptSegments);
    session.transcriptLive = parsed.isFinal ? session.transcriptFinal : [session.transcriptFinal, parsed.text].filter(Boolean).join('\n');
    session.keywords = extractClinicalKeywords(session.transcriptFinal || session.transcriptLive);
    session.summary = summarizeTranscript(session.transcriptFinal || session.transcriptLive);
    syncClinicalTextareas(session);
    queueClinicalDraftSync(session.id, 'transcription');
    setClinicalRuntimeStatus(parsed.isFinal ? 'Transcrição final parcial recebida.' : 'Legenda ao vivo recebida.', parsed.isFinal ? 'ok' : 'info');
  }
  function stopClinicalTimer() {
    clearInterval(clinicalTimerInterval);
    clinicalTimerInterval = null;
  }
  function startClinicalTimer(startedAtIso) {
    stopClinicalTimer();
    const base = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    function tick() {
      const elapsed = Math.floor((Date.now() - base) / 1000);
      clinicalTimerSeconds = elapsed;
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      const label = h > 0
        ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      const node = document.getElementById('clinical-timer-display');
      if (node) node.textContent = label;
    }
    tick();
    clinicalTimerInterval = setInterval(tick, 1000);
  }
  function stopDailyAutomation() {
    clearTimeout(dailyDraftSyncTimer);
    clearInterval(dailyAutosaveTimer);
    dailyDraftSyncTimer = null;
    dailyAutosaveTimer = null;
    dailyMountedSessionId = '';
    dailyMountedRoomUrl = '';
    if (dailyCallFrame?.destroy) {
      try { dailyCallFrame.destroy(); } catch {}
    }
    dailyCallFrame = null;
  }
  async function markAppointmentCompletedFromSession(session) {
    if (!session?.appointmentId) return;
    const appointment = (state.appointments || []).find(item => String(item.id) === String(session.appointmentId));
    if (!appointment || appointment.status === 'REALIZADO') return;
    const before = clone(appointment);
    appointment.status = 'REALIZADO';
    try {
      if (useBackend()) await updateBackendRecord('appointments', appointment.id, appointment, { skipSync: false });
      else {
        saveState();
        audit('Agenda visual', `Agendamento marcado como REALIZADO a partir da sessão ${session.code}.`, { entity: 'appointment', before, after: appointment });
      }
    } catch (error) {
      Object.assign(appointment, before);
      throw error;
    }
  }
  async function bootDailyForSelectedSession() {
    const selected = currentClinicalSession();
    const host = document.getElementById('daily-call-host');
    if (state.meta.route !== 'atendimentos' || !selected || !host) {
      stopDailyAutomation();
      return;
    }
    const roomUrl = String(document.getElementById('clinical-room-url')?.value || selected.roomUrl || selected.dailyRoomUrl || '').trim();
    if (!roomUrl) {
      stopDailyAutomation();
      setClinicalRuntimeStatus('Sessão pronta. Cole o link da sala Daily ou use o backend SaaS com Daily configurado.', 'warn');
      return;
    }
    if (!window.DailyIframe?.createFrame) {
      setClinicalRuntimeStatus('Biblioteca Daily não carregada. O sistema permanece no modo manual.', 'warn');
      return;
    }
    if (dailyCallFrame && dailyMountedSessionId === String(selected.id) && dailyMountedRoomUrl === roomUrl && host.childElementCount) {
      return;
    }
    stopDailyAutomation();
    host.innerHTML = '';
    setClinicalRuntimeStatus('Preparando chamada Daily plug-and-play...', 'info');
    const frame = window.DailyIframe.createFrame(host, {
      showLeaveButton: true,
      iframeStyle: { width: '100%', height: '100%', border: '0', borderRadius: '16px', background: '#0c1424' }
    });
    dailyCallFrame = frame;
    dailyMountedSessionId = String(selected.id);
    dailyMountedRoomUrl = roomUrl;
    frame.on?.('joined-meeting', async () => {
      setClinicalRuntimeStatus('Sala conectada. Tentando iniciar transcrição e gravação...', 'ok');
      try {
        await frame.startTranscription?.({ language: 'pt', punctuate: true, includeRawResponse: true });
        setClinicalRuntimeStatus('Transcrição quase em tempo real ativada.', 'ok');
      } catch (error) {
        setClinicalRuntimeStatus(error?.message ? `Chamada conectada. Transcrição não iniciou automaticamente: ${error.message}` : 'Chamada conectada. Transcrição automática indisponível nesta sala.', 'warn');
      }
      try {
        await frame.startRecording?.();
      } catch (_) {}
    });
    frame.on?.('left-meeting', () => setClinicalRuntimeStatus('Chamada encerrada. Você pode revisar e finalizar o SOAP.', 'warn'));
    frame.on?.('recording-started', () => setClinicalRuntimeStatus('Gravação Daily iniciada.', 'ok'));
    frame.on?.('recording-stopped', event => {
      const session = currentClinicalSession();
      if (!session) return;
      const candidateUrl = event?.download_link || event?.recording_url || event?.url || '';
      if (candidateUrl) {
        session.recordingUrl = candidateUrl;
        queueClinicalDraftSync(session.id, 'recording');
      }
      setClinicalRuntimeStatus('Gravação encerrada.', 'info');
    });
    frame.on?.('transcription-message', event => handleDailyTranscriptionEvent(selected.id, event));
    frame.on?.('error', event => setClinicalRuntimeStatus(event?.errorMsg || event?.message || 'Daily retornou um erro durante a chamada.', 'danger'));
    try {
      await frame.join({ url: roomUrl, userName: state.session?.name || 'Equipe clínica' });
      const session = currentClinicalSession();
      if (session) {
        session.callStatus = 'daily';
        session.roomUrl = roomUrl;
        session.dailyRoomUrl = roomUrl;
        queueClinicalDraftSync(session.id, 'join');
      }
      if (!dailyAutosaveTimer) {
        dailyAutosaveTimer = setInterval(() => {
          const current = currentClinicalSession();
          if (current) queueClinicalDraftSync(current.id, 'autosave');
        }, 30000);
      }
    } catch (error) {
      setClinicalRuntimeStatus(error.message || 'Não foi possível entrar na sala Daily.', 'danger');
    }
  }
  async function hydrateClinicalSessionPanel() {
    if (state.meta.route !== 'atendimentos') {
      stopDailyAutomation();
      stopClinicalVoiceCapture({ keepStatus: true });
      stopClinicalTimer();
      return;
    }
    const selected = currentClinicalSession();
    if (!selected) {
      stopClinicalTimer();
      setClinicalRuntimeStatus('Selecione ou inicie uma sessão para abrir o painel clínico.', 'info');
      return;
    }
    syncClinicalTextareas(selected);
    const configNode = document.getElementById('clinical-daily-config');
    if (configNode) configNode.innerHTML = '<span class="badge ok">Fluxo econômico</span><span class="chip">WhatsApp + resumo por voz</span>';
    document.querySelectorAll('#clinical-transcript-live, #clinical-transcript-final, #clinical-main-reason, #clinical-full-evolution, #clinical-anamnesis, #clinical-summary, #soap-subjective, #soap-objective, #soap-assessment, #soap-plan, #clinical-room-url').forEach(field => {
      field?.addEventListener('input', () => {
        const session = currentClinicalSession();
        if (session) queueClinicalDraftSync(session.id, 'manual');
      });
    });
    updateClinicalRecordButton();
    if (selected.status !== 'FINALIZADO') startClinicalTimer(selected.startedAt);
    setClinicalRuntimeStatus(clinicalSpeechActive ? 'Resumo por voz em andamento.' : 'Pronto para WhatsApp, ditado e SOAP.', clinicalSpeechActive ? 'warn' : 'info');
  }
  async function startClinicalSessionFlow(patientId) {
    const patient = patientById(patientId);
    if (!patient) throw new Error('Selecione um paciente válido.');
    if (!patient.consentRecording) {
      const consentText = state.settings.consentTemplate || 'Autorizo o registro da sessão por gravação e transcrição exclusivamente para fins clínicos.';
      const agreed = confirm(`CONSENTIMENTO INFORMADO\n\n${consentText}\n\nO paciente ${patient.name} confirma este consentimento para esta sessão?`);
      if (!agreed) throw new Error('Atendimento cancelado: consentimento não confirmado.');
      patient.consentRecording = true;
      patient.consentSignedAt = todayIso();
      patient.consentText = consentText;
      saveState();
      audit('Consentimento', `Consentimento registrado para ${patient.name} em ${todayIso()}.`, { entity: 'patient', after: patient });
    }
    const appointment = nextAppointmentForPatient(patientId);
    if (useBackend()) {
      const result = await api.startClinicalSession(apiBase(), state.session.token, { patientId, appointmentId: appointment?.id || '' });
      state.meta.selectedClinicalSessionId = String(result.session.id);
      await syncStateFromBackend();
      return result.session;
    }
    const session = {
      id: uid('SES'),
      code: nextCode('SES', state.sessions || []),
      patientId: String(patient.id),
      patientName: patient.name,
      professionalId: String(patient.professionalId || ''),
      professionalName: patient.professionalName || professionalById(patient.professionalId)?.name || '',
      clinicId: String(patient.clinicId || ''),
      clinicName: patient.clinicName || clinicById(patient.clinicId)?.name || '',
      appointmentId: String(appointment?.id || ''),
      scheduledDate: appointment?.date || todayIso(),
      startedAt: new Date().toISOString(),
      endedAt: '',
      durationMinutes: 0,
      callStatus: 'manual',
      roomName: '',
      roomUrl: '',
      dailyRoomUrl: '',
      recordingId: '',
      recordingUrl: '',
      transcriptLive: '',
      transcriptFinal: '',
      transcriptSegments: [],
      keywords: [],
      soapSubjective: '',
      soapObjective: '',
      soapAssessment: '',
      soapPlan: '',
      summary: '',
      fullEvolution: '',
      anamnesisInitial: '',
      mainReason: '',
      consentConfirmed: false,
      status: 'EM_ANDAMENTO',
      createdAt: new Date().toISOString()
    };
    state.sessions ||= [];
    state.sessions.unshift(session);
    state.meta.selectedClinicalSessionId = String(session.id);
    saveState();
    audit('Atendimento clínico', `Sessão iniciada para ${patient.name}.`, { entity: 'session', after: session });
    return session;
  }
  async function persistClinicalSession(sessionId, payload, finalize = false) {
    const session = (state.sessions || []).find(item => String(item.id) === String(sessionId));
    if (!session) throw new Error('Sessão não encontrada.');
    const before = clone(session);
    Object.assign(session, payload || {});
    const transcriptBase = session.transcriptFinal || session.transcriptLive || '';
    if (!session.keywords?.length) session.keywords = extractClinicalKeywords(transcriptBase);
    if (!session.summary) session.summary = summarizeTranscript(transcriptBase);
    if (finalize) {
      session.endedAt = session.endedAt || new Date().toISOString();
      if (session.startedAt && session.endedAt) session.durationMinutes = Math.max(0, Math.round(((new Date(session.endedAt) - new Date(session.startedAt)) / 60000) * 100) / 100);
      session.status = 'FINALIZADO';
    } else if (!session.status) {
      session.status = 'EM_ANDAMENTO';
    }
    if (useBackend()) {
      const saved = await api.completeClinicalSession(apiBase(), state.session.token, session.id, session);
      Object.assign(session, saved);
      await syncStateFromBackend();
    } else {
      saveState();
      audit(finalize ? 'Atendimento clínico finalizado' : 'Atendimento clínico atualizado', `Sessão ${session.code} salva para ${session.patientName}.`, { entity: 'session', before, after: session });
    }
    if (finalize) {
      await markAppointmentCompletedFromSession(session);
      stopDailyAutomation();
    }
    return session;
  }
  function clinicalSessionsView() {
    const selected = currentClinicalSession();
    const sessions = [...(state.sessions || [])].sort((a, b) => String(b.startedAt || b.createdAt || '').localeCompare(String(a.startedAt || a.createdAt || '')));
    const patient = selected ? patientById(selected.patientId) : null;
    const clinic = selected ? (clinicById(selected.clinicId) || state.clinics.find(c => c.name === selected.clinicName)) : (currentClinicScopeName() ? state.clinics.find(c => c.name === currentClinicScopeName()) : null);
    const patientSessions = selected ? sessions.filter(item => String(item.patientId) === String(selected.patientId)).sort((a, b) => String(b.startedAt || b.createdAt || '').localeCompare(String(a.startedAt || a.createdAt || ''))) : [];
    const keywordChips = (selected?.keywords || []).length ? selected.keywords.map(item => `<span class="chip">${safe(item)}</span>`).join('') : '<span class="muted">Nenhuma palavra-chave extraída.</span>';
    const patientOptions = clinicScopedPatientsDetailed().map(patient => `<option value="${patient.id}">${safe(patient.name)} — ${safe(patient.professionalName)} — ${safe(patient.clinicName)}</option>`).join('');
    const patientPhone = selected ? (patientById(selected.patientId)?.phone || '') : '';
    const whatsappUrl = selected ? currentClinicalWhatsappUrl(selected) : '';
    const patientSummaryCard = selected ? `
      <article class="card clinical-panel clinical-hero-card">
        <div class="clinical-hero-top">
          <div>
            <div class="clinical-hero-overline">Prontuário premium</div>
            <h3>${safe(selected.patientName)}</h3>
            <div class="clinical-hero-subtitle">${safe(selected.professionalName || 'Sem profissional')} · ${safe(selected.clinicName || currentClinicScopeName() || 'Sem clínica')}</div>
          </div>
          <div class="flex">
            <span class="badge ${selected.status === 'FINALIZADO' ? 'ok' : 'info'}">${safe(selected.status || 'EM_ANDAMENTO')}</span>
            <span class="chip">Sessão ${safe(selected.code || '—')}</span>
          </div>
        </div>
        <div class="clinical-hero-grid">
          <div class="clinical-hero-metric"><strong>${patientSessions.length}</strong><span>Sessões registradas</span></div>
          <div class="clinical-hero-metric"><strong>${selected.durationMinutes || '—'}</strong><span>Duração (min)</span></div>
          <div class="clinical-hero-metric"><strong>${patient?.birthDate ? fmtDate(patient.birthDate) : '—'}</strong><span>Nascimento</span></div>
          <div class="clinical-hero-metric"><strong>${patient?.phone ? safe(patient.phone) : '—'}</strong><span>Telefone</span></div>
        </div>
        <div class="clinical-summary-panels">
          <div class="clinical-summary-box"><label>Motivo principal</label><div>${safe(selected.mainReason || 'Ainda não preenchido')}</div></div>
          <div class="clinical-summary-box"><label>Resumo clínico</label><div>${safe(selected.summary || 'Ainda não preenchido')}</div></div>
          <div class="clinical-summary-box"><label>Alertas / medicações</label><div>${safe([patient?.clinicalAlerts, patient?.medications].filter(Boolean).join(' • ') || 'Sem alertas ou medicações registradas')}</div></div>
        </div>
      </article>` : '';
    const patientTimelineCard = selected ? `
      <article class="card clinical-panel clinical-timeline-card">
        <div class="spread"><h3>Timeline clínica</h3><span class="chip">${patientSessions.length} registros</span></div>
        <div class="clinical-timeline">
          ${patientSessions.length ? patientSessions.map((item, index) => `
            <div class="clinical-timeline-item ${String(item.id) === String(selected.id) ? 'is-current' : ''}">
              <div class="clinical-timeline-dot"></div>
              <div class="clinical-timeline-body">
                <div class="clinical-timeline-head">
                  <strong>${item.startedAt ? new Date(item.startedAt).toLocaleString('pt-BR') : fmtDate(item.scheduledDate || todayIso())}</strong>
                  <span class="badge ${item.status === 'FINALIZADO' ? 'ok' : 'info'}">${safe(item.status || 'RASCUNHO')}</span>
                </div>
                <div class="clinical-timeline-meta">${safe(item.code || '')} · ${safe(item.professionalName || 'Sem profissional')} · ${item.durationMinutes ? `${item.durationMinutes} min` : 'sem duração fechada'}</div>
                ${item.mainReason ? `<div class="clinical-timeline-text"><strong>Motivo:</strong> ${safe(item.mainReason)}</div>` : ''}
                ${item.summary ? `<div class="clinical-timeline-text"><strong>Resumo:</strong> ${safe(item.summary)}</div>` : ''}
                ${(item.keywords || []).length ? `<div class="flex">${item.keywords.slice(0, 5).map(k => `<span class="chip">${safe(k)}</span>`).join('')}</div>` : ''}
                ${index === 0 ? '<div class="clinical-timeline-tag">Mais recente</div>' : ''}
              </div>
            </div>`).join('') : '<div class="empty">Sem histórico clínico para este paciente.</div>'}
        </div>
      </article>` : '';
    return shell(`
      <section class="card clinical-panel clinical-stepper-panel">
        <div class="spread"><h3>Fluxo rápido do atendimento</h3><span class="badge ok">Modelo econômico</span></div>
        <div class="clinical-steps">
          <div class="clinical-step"><span class="clinical-step-index">1</span><div><strong>Iniciar atendimento</strong><small>Seleciona o paciente e abre a sessão clínica.</small></div></div>
          <div class="clinical-step"><span class="clinical-step-index">2</span><div><strong>Abrir WhatsApp</strong><small>Dispara a conversa com mensagem pronta para iniciar a chamada.</small></div></div>
          <div class="clinical-step"><span class="clinical-step-index">3</span><div><strong>Gravar resumo</strong><small>Usa ditado por voz do navegador para transformar sua fala em texto.</small></div></div>
          <div class="clinical-step"><span class="clinical-step-index">4</span><div><strong>Gerar SOAP</strong><small>Monta o registro clínico a partir do resumo consolidado.</small></div></div>
          <div class="clinical-step"><span class="clinical-step-index">5</span><div><strong>Salvar prontuário</strong><small>Salva o rascunho ou finaliza o atendimento com segurança.</small></div></div>
        </div>
        <p class="footer-note">A chamada continua externa no WhatsApp, mas o registro clínico fica centralizado dentro do sistema.</p>
      </section>
      <section class="layout-2 clinical-layout">
        <article class="card clinical-panel">
          <div class="spread"><h3>Iniciar atendimento</h3><div class="flex">${clinicScopeBadge('Clínica ativa')}<div id="clinical-daily-config" class="flex"></div></div></div>
          <form id="clinical-start-form" class="toolbar">
            <div class="field"><label>Paciente</label><select name="patientId">${patientOptions}</select></div>
            <button class="btn primary" type="submit">Iniciar atendimento</button>
          </form>
          ${selected ? `<div class="field section"><label class="clinical-reason-label">📋 Motivo principal da sessão</label><input id="clinical-main-reason" type="text" value="${safe(selected.mainReason || '')}" placeholder="Ex: ansiedade no trabalho, revisão de humor, crise de pânico..." maxlength="200" /></div>` : ''}
          <p class="footer-note">Fluxo econômico: faça a videochamada fora do sistema e traga para cá apenas o resumo estruturado da sessão. ${currentClinicScopeName() ? `Escopo global atual: ${safe(currentClinicScopeName())}.` : ''}</p>
        </article>
        <article class="card clinical-panel">
          <div class="spread"><h3>Sessão ativa</h3><span id="clinical-runtime-status" class="badge info">Pronto</span></div>
          ${selected ? `<div class="clinical-meta"><strong>${safe(selected.patientName)}</strong><span>${safe(selected.professionalName || 'Sem profissional')}</span><span>${fmtDate(selected.scheduledDate || todayIso())}</span><span class="badge ${selected.status === 'FINALIZADO' ? 'ok' : 'info'}">${safe(selected.status || 'EM_ANDAMENTO')}</span><span class="chip">${safe(selected.callStatus || 'manual')}</span>${selected.durationMinutes ? `<span class="chip">${safe(String(selected.durationMinutes))} min</span>` : ''}</div><div class="clinical-timer-row">${selected.status !== 'FINALIZADO' ? `<span class="clinical-timer-label">⏱ Duração</span><span id="clinical-timer-display" class="clinical-timer-value">00:00</span>` : `<span class="clinical-timer-label">✅ Duração total</span><span class="clinical-timer-value">${safe(String(selected.durationMinutes || 0))} min</span>`}</div>` : '<div class="empty">Inicie uma sessão para abrir o painel clínico.</div>'}
          ${selected ? `<div class="notice section">Passo a passo barato: 1) abrir o WhatsApp, 2) fazer a chamada por lá, 3) voltar ao sistema, 4) ditar o resumo, 5) gerar o SOAP, 6) salvar o prontuário.</div>` : ''}
        </article>
      </section>
      ${selected ? `<section class="layout-2 section clinical-layout clinical-premium-layout">${patientSummaryCard}${patientTimelineCard}</section>` : ''}
      ${selected ? `
      <section class="layout-2 section clinical-layout">
        <article class="card clinical-panel">
          <div class="spread"><h3>Abrir WhatsApp</h3><span class="chip">WhatsApp externo</span></div>
          <div class="field"><label>Telefone do paciente</label><input value="${safe(patientPhone || 'Sem telefone cadastrado') }" ${patientPhone ? 'readonly' : 'disabled'} /></div>
          <div class="field section"><label>Link de contato</label><input id="clinical-room-url" value="${safe(whatsappUrl)}" readonly placeholder="Cadastre o telefone do paciente para gerar o link do WhatsApp" /></div>
          <div class="clinical-consent-row section"><label class="clinical-consent-label"><input type="checkbox" id="clinical-consent-checkbox" ${selected.consentConfirmed ? 'checked' : ''} /><span>Consentimento confirmado pelo paciente nesta sessão</span></label></div>
          <div class="flex section">
            <button class="btn success" type="button" id="clinical-open-whatsapp-btn" ${whatsappUrl ? '' : 'disabled'}>Abrir WhatsApp</button>
            <button class="btn ghost" type="button" id="clinical-copy-link-btn" ${whatsappUrl ? '' : 'disabled'} title="Copiar link do WhatsApp">Copiar link</button>
            <button class="btn ghost" type="button" id="clinical-copy-phone-btn" ${patientPhone ? '' : 'disabled'} title="Copiar número do paciente">Copiar número</button>
          </div>
          ${whatsappUrl ? '<div class="footer-note">O botão abre a conversa com mensagem pronta. A videochamada é iniciada no próprio WhatsApp.</div>' : '<div class="notice">Cadastre o telefone do paciente para habilitar o botão de WhatsApp.</div>'}
        </article>
        <article class="card clinical-panel">
          <div class="spread"><h3>Gravar resumo</h3><span class="chip">Voz para texto</span></div>
          <div class="flex section"><button class="btn danger ghost" type="button" id="clinical-end-call-btn">&#128222; Voltei do WhatsApp</button></div>
          <div class="field"><label>Legenda do ditado</label><textarea id="clinical-transcript-live" placeholder="Enquanto você dita o resumo, o texto aparece aqui.">${safe(selected.transcriptLive || '')}</textarea></div>
          <div class="field"><label>Transcrição consolidada</label><textarea id="clinical-transcript-final" placeholder="Este campo guarda o texto final do resumo da sessão.">${safe(selected.transcriptFinal || '')}</textarea></div>
          <div class="flex section"><button class="btn warn" type="button" id="clinical-record-summary-btn">Gravar resumo</button><button class="btn ghost" type="button" id="clinical-generate-btn">Gerar SOAP</button><button class="btn success" type="button" id="clinical-save-btn">Salvar prontuário</button><button class="btn primary" type="button" id="clinical-complete-btn">Finalizar + marcar realizado</button></div>
          <p class="footer-note">Sugestão de ditado: queixa principal, evolução, intervenções, avaliação clínica e plano para a próxima sessão.</p>
          <div class="notice section">Se o computador não oferecer ditado por voz, você ainda pode colar ou digitar o resumo manualmente e usar o botão <strong>Gerar SOAP</strong>.</div>
        </article>
      </section>
      <section class="layout-2 section clinical-layout">
        <article class="card clinical-panel">
          <h3>Palavras-chave clínicas</h3>
          <div id="clinical-keywords" class="flex">${keywordChips}</div>
          <div class="field section"><label>Editar biblioteca clínica</label><textarea id="clinical-keyword-library-editor" rows="3" placeholder="Separe as palavras por vírgula">${safe(state.settings.clinicalKeywordLibrary || '')}</textarea></div>
          <div class="flex section"><button class="btn ghost" type="button" id="save-clinical-keywords-btn">Salvar palavras-chave clínicas</button></div>
          <p class="footer-note">Biblioteca atual: ${safe(clinicalKeywordList().join(', '))}</p>
        </article>
        <article class="card clinical-panel">
          <h3>Resumo da sessão</h3>
          <div class="field"><label>Resumo clínico</label><textarea id="clinical-summary">${safe(selected.summary || '')}</textarea></div>
        </article>
      </section>
      <section class="layout-2 section clinical-layout">
        <article class="card clinical-panel"><h3>SOAP · S</h3><div class="field"><label>Subjetivo</label><textarea id="soap-subjective">${safe(selected.soapSubjective || '')}</textarea></div></article>
        <article class="card clinical-panel"><h3>SOAP · O</h3><div class="field"><label>Objetivo</label><textarea id="soap-objective">${safe(selected.soapObjective || '')}</textarea></div></article>
      </section>
      <section class="layout-2 section clinical-layout">
        <article class="card clinical-panel"><h3>SOAP · A</h3><div class="field"><label>Avaliação</label><textarea id="soap-assessment">${safe(selected.soapAssessment || '')}</textarea></div></article>
        <article class="card clinical-panel"><h3>SOAP · P</h3><div class="field"><label>Plano</label><textarea id="soap-plan">${safe(selected.soapPlan || '')}</textarea></div></article>
      </section>
      <section class="layout-2 section clinical-layout">
        <article class="card clinical-panel">
          <div class="spread"><h3>Evolução clínica completa</h3><span class="chip">Narrativa</span></div>
          <div class="field"><textarea id="clinical-full-evolution" rows="6" placeholder="A evolução clínica completa será gerada aqui ou pode ser editada manualmente.">${safe(selected.fullEvolution || '')}</textarea></div>
          <div class="flex section"><button class="btn warn" type="button" id="clinical-gen-evolution-btn">✨ Gerar evolução clínica completa</button></div>
          <p class="footer-note">Combina motivo principal, resumo e SOAP numa narrativa fluida pronta para o prontuário.</p>
        </article>
        <article class="card clinical-panel">
          <div class="spread"><h3>Anamnese inicial</h3><span class="chip">Histórico</span></div>
          <div class="field"><textarea id="clinical-anamnesis" rows="6" placeholder="Preencha ou gere o modelo de anamnese inicial.">${safe(selected.anamnesisInitial || '')}</textarea></div>
          <div class="flex section"><button class="btn ghost" type="button" id="clinical-gen-anamnesis-btn">📋 Carregar modelo de anamnese</button></div>
          <p class="footer-note">Modelo inclui: queixa, história, família, tratamentos anteriores, medicações e objetivos.</p>
        </article>
      </section>
      <section class="card section clinical-panel">
        <div class="spread"><h3>Exportar prontuário premium</h3><span class="chip">PDF elegante / Impressão / Colar</span></div>
        <div class="flex section">
          <button class="btn ghost" type="button" id="clinical-copy-soap-btn">📋 Copiar SOAP completo</button>
          <button class="btn primary" type="button" id="clinical-print-pdf-btn">🖨️ Imprimir / Exportar PDF</button>
        </div>
        <div id="clinical-soap-copy-preview" class="clinical-soap-copy-preview"></div>
        <p class="footer-note">A exportação abre um layout refinado com cabeçalho da clínica, bloco do paciente, motivo, resumo, evolução, SOAP e rodapé técnico. Para salvar em PDF, escolha "Salvar como PDF" na impressão.</p>
      </section>` : ''}
      <section class="section card clinical-panel">
        <div class="spread"><h3>Histórico de evoluções</h3>${selected ? `<span class="chip">${sessions.filter(s=>String(s.patientId)===String(selected.patientId)).length} sessões do paciente</span>` : ''}</div>
        ${sessions.length ? `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Paciente</th><th>Data</th><th>Profissional</th><th>Motivo</th><th>Resumo</th><th>Palavras-chave</th><th>Status</th><th>Duração</th><th>Ação</th></tr></thead><tbody>${sessions.map(item => {
          const isCurrentPatient = selected && String(item.patientId) === String(selected.patientId);
          return `<tr class="${isCurrentPatient ? 'history-row-highlight' : ''}">
            <td>${safe(item.code)}</td>
            <td><strong>${safe(item.patientName)}</strong></td>
            <td>${fmtDate(item.scheduledDate || todayIso())}</td>
            <td>${safe(item.professionalName || '—')}</td>
            <td>${safe(item.mainReason || '—')}</td>
            <td class="history-summary-cell" title="${safe(item.summary || '')}"><span class="history-summary-text">${safe(item.summary ? item.summary.slice(0,80)+(item.summary.length>80?'…':'') : '—')}</span></td>
            <td><div class="flex" style="flex-wrap:wrap;gap:4px">${(item.keywords||[]).length ? item.keywords.slice(0,4).map(k=>`<span class="chip" style="font-size:.78rem">${safe(k)}</span>`).join('') : '—'}</div></td>
            <td><span class="badge ${item.status==='FINALIZADO'?'ok':'info'}">${safe(item.status||'EM_ANDAMENTO')}</span></td>
            <td>${item.durationMinutes ? `${item.durationMinutes} min` : '—'}</td>
            <td><button class="btn ghost js-open-session" data-id="${item.id}">Abrir</button></td>
          </tr>
          ${(item.fullEvolution||item.soapSubjective) ? `<tr class="${isCurrentPatient?'history-row-highlight':''}"><td colspan="10" class="history-evolution-row"><details><summary>Ver evolução</summary><pre class="history-evolution-content">${safe(item.fullEvolution || ['S: '+item.soapSubjective, 'O: '+item.soapObjective, 'A: '+item.soapAssessment, 'P: '+item.soapPlan].filter(Boolean).join('\n'))}</pre></details></td></tr>` : ''}`;
        }).join('')}</tbody></table></div>` : `<div class="empty">Nenhuma sessão registrada ainda.</div>`}
      </section>
    `, 'Atendimento Clínico', 'Fluxo econômico: WhatsApp para a chamada e prontuário inteligente dentro do sistema com ditado, resumo e SOAP.');
  }
  function authScreen() {
    if (isDesktopApp()) {
      return `
        <section class="auth">
          <div class="auth-card auth-card-desktop">
            <div class="hero">
              <div class="brand">${renderBrandLogo()}<div><strong>${safe(state.settings.brandName || 'Agenda Clínica')}</strong><br><small>${safe(state.settings.companyName || 'Gestão clínica local e segura')}</small></div></div>
              <p>Bem-vindo à versão desktop do Agenda Clínica. Seus dados ficam salvos automaticamente neste computador, com backup local, auditoria e operação offline.</p>
              <ul>
                <li>Abertura direta no Windows</li>
                <li>Persistência local automática</li>
                <li>Backup e restauração pelo próprio sistema</li>
                <li>Agenda, recebimentos, pagamentos e auditoria</li>
              </ul>
              <div class="notice">Versão comercial local/offline pronta para uso do cliente final.</div>
            </div>
            <div class="card">
              <h2>Entrar no sistema</h2>
              <form id="login-form" class="toolbar">
                <div class="field"><label>Usuário</label><select name="userId">${activeLocalUsers().map(user => `<option value="${safe(user.id)}">${safe(user.name)} — ${safe(user.role)}</option>`).join('')}</select></div>
                <div class="field"><label>Senha</label><input type="password" name="password" placeholder="Digite sua senha" required /></div>
                <button class="btn primary" type="submit">Abrir sistema</button>
              </form>
              <p class="footer-note">Os dados são gravados automaticamente nesta instalação do aplicativo.</p>
            </div>
          </div>
        </section>`;
    }
    return `
      <section class="auth">
        <div class="auth-card">
          <div class="hero">
            <div class="brand">${renderBrandLogo()}<div><strong>${safe(state.settings.brandName || 'Agenda Clínica')}</strong><br><small>${safe(state.settings.companyName || 'App web instalável inspirado na sua planilha')}</small></div></div>
            <p>Esta aplicação suporta operação local e online, com agenda, financeiro, auditoria e autenticação centralizada.</p>
            <ul>
              <li>Modo local/offline preservado</li>
              <li>Modo SaaS com autenticação por e-mail</li>
              <li>Sincronização de clínicas, pacientes, agenda e financeiro</li>
              <li>Empacotamento Windows e publicação web</li>
            </ul>
            <div class="notice">Escolha o modo de acesso de acordo com a sua implantação.</div>
          </div>
          <div class="card">
            <h2>Entrar</h2>
            <form id="login-form" class="toolbar">
              <div class="field"><label>Modo de acesso</label><select name="authMode"><option value="local" ${state.settings.authMode !== 'saas' ? 'selected' : ''}>Local / offline</option><option value="saas" ${state.settings.authMode === 'saas' ? 'selected' : ''}>Backend SaaS</option></select></div>
              <div class="field"><label>Usuário local</label><select name="userId">${activeLocalUsers().map(user => `<option value="${safe(user.id)}">${safe(user.name)} — ${safe(user.role)}</option>`).join('')}</select></div>
              <div class="field"><label>Email SaaS</label><input name="email" type="email" value="${safe(state.settings.backendEmail || 'admin@agendaclinica.local')}" placeholder="admin@agendaclinica.local" /></div>
              <div class="field"><label>URL do backend</label><input name="backendUrl" type="text" value="${safe(state.settings.backendUrl || 'http://127.0.0.1:8000')}" placeholder="http://127.0.0.1:8000" /></div>
              <div class="field"><label>Senha</label><input type="password" name="password" placeholder="Digite a senha" required /></div>
              <button class="btn primary" type="submit">Acessar aplicativo</button>
            </form>
            <p class="footer-note">No modo SaaS, use o backend em ${safe(state.settings.backendUrl || 'http://127.0.0.1:8000')} com e-mail e senha de usuário.</p>
          </div>
        </div>
      </section>`;
  }

  function shell(content, title, subtitle = '') {
    const role = currentRole();
    const installButton = !isDesktopApp() && deferredPrompt ? '<button class="btn success" id="install-app">Instalar app</button>' : '';
    const importControl = isDesktopApp()
      ? '<button class="btn ghost" id="import-backup-native">Restaurar backup</button>'
      : '<label class="btn ghost" for="import-json">Importar backup</label><input type="file" id="import-json" accept="application/json" hidden />';
    const desktopControls = isDesktopApp()
      ? '<button class="btn ghost" id="open-data-folder">Pasta de dados</button><button class="btn ghost" id="about-btn">Sobre</button>'
      : '<button class="btn ghost" id="about-btn">Sobre</button>';
    return `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="brand">${renderBrandLogo()}<div><strong>${safe(state.settings.brandName || 'Agenda Clínica')}</strong><br><small>${safe(role)} conectado · ${safe(state.settings.commercialPlan || 'Essentials')}</small></div></div>
          <div class="chip">Empresa: ${safe(state.settings.companyName || 'Sua Clínica')}</div>
          <div class="chip">Plano: ${safe(state.settings.commercialPlan || 'Essentials')}</div>
          <div class="chip">Versão: ${safe(desktopInfo.version || '1.0.0')}</div>
          <nav class="nav">
            ${Object.entries(NAV_META).map(([route, meta]) => `<button class="${state.meta.route===route?'active':''}" data-route="${route}"><span class="nav-icon">${meta.icon}</span><span>${meta.label}</span></button>`).join('')}
          </nav>
        </aside>
        <main class="main">
          <div class="topbar">
            <div><h1 style="margin:0">${title}</h1><div class="muted">${subtitle}</div></div>
            <div class="actions">
              ${installButton}
              ${(() => { const bk = listAutoBackups(); return bk.length ? `<span class="last-backup-indicator" id="last-autobackup-badge">💾 Backup: ${safe(bk[0].ts)}</span>` : '<span class="last-backup-indicator" id="last-autobackup-badge">💾 Sem backup</span>'; })()}
              <button class="btn info" id="help-btn">F1 · Ajuda do módulo</button>
              <button class="btn ghost" id="help-general-btn">Ajuda geral</button>
              <button class="btn" id="export-json">Exportar backup</button>
              <button class="btn ghost" id="export-audit-csv">Exportar auditoria CSV</button>
              ${importControl}
              ${desktopControls}
              <button class="btn danger" id="logout-btn">Sair</button>
            </div>
          </div>
          ${content}
          ${renderGlobalOverlays()}
        </main>
      </div>`;
  }

  function dashboardView() {
    const m = dashboardMetrics();
    const analytics = dashboardAnalytics();
    const cash = cashMetrics();
    const recent = state.audits.slice(0, 8);
    const collectionBadge = `${m.collectionRate.toFixed(1).replace('.', ',')}% da meta`;
    const expenseBadge = `${m.expenseRate.toFixed(1).replace('.', ',')}% pago`;
    const rankingRows = analytics.patientRanking.map((item, index) => `
      <tr>
        <td>#${index + 1}</td>
        <td><strong>${safe(item.name)}</strong><br><small class="muted">${safe(item.clinicName)} · ${safe(item.professionalName)}</small></td>
        <td>${money(item.planned)}</td>
        <td>${money(item.paid)}</td>
        <td>${money(item.pending)}</td>
        <td>${money(item.ticket)}</td>
        <td><span class="badge ${item.pending > 0 ? 'warn' : 'ok'}">${safe(item.status)}</span></td>
      </tr>`).join('');
    return shell(`
      <section class="card-grid dashboard-kpis">
        <article class="card"><div class="muted">Recebimentos previstos</div><div class="kpi">${money(m.planned)}</div><div class="kpi-sub">No filtro atual</div><span class="badge info">${m.receivableCount} títulos</span></article>
        <article class="card"><div class="muted">Recebido</div><div class="kpi">${money(m.paid)}</div><div class="kpi-sub">Conversão financeira</div><span class="badge ok">${collectionBadge}</span></article>
        <article class="card"><div class="muted">A receber</div><div class="kpi">${money(m.toReceive)}</div><div class="kpi-sub">Em aberto + atrasado</div><span class="badge ${m.overdue ? 'warn' : 'info'}">${m.overdue} atrasados</span></article>
        <article class="card"><div class="muted">Despesas previstas</div><div class="kpi">${money(m.payablePlanned)}</div><div class="kpi-sub">Contas a pagar</div><span class="badge warn">${m.payableCount} títulos</span></article>
        <article class="card"><div class="muted">Pago</div><div class="kpi">${money(m.payablePaid)}</div><div class="kpi-sub">Saída realizada</div><span class="badge info">${expenseBadge}</span></article>
        <article class="card"><div class="muted">Saldo líquido</div><div class="kpi">${money(m.balance)}</div><div class="kpi-sub">Recebido - pago</div><span class="badge ${m.balance >= 0 ? 'ok' : 'danger'}">Caixa ${money(cash.balance)}</span></article>
      </section>

      <section class="layout-2 section dashboard-layout-main">
        ${renderTrendCard(analytics.trend)}
        <div class="stack">
          <article class="card chart-card">
            <div class="spread chart-head"><div><h3>Resumo operacional</h3><div class="muted">Indicadores rápidos do período filtrado.</div></div><div class="flex"><span class="chip">Pacientes ${m.patients}</span><span class="chip">Profissionais ${m.pros}</span><span class="chip">Clínicas ${m.clinics}</span></div></div>
            <div class="stats-mini-grid">
              <div class="card inset"><div class="muted">Sessões realizadas</div><div class="kpi">${m.done}</div></div>
              <div class="card inset"><div class="muted">Agendamentos futuros</div><div class="kpi">${m.upcoming}</div></div>
              <div class="card inset"><div class="muted">Entradas de caixa</div><div class="kpi">${money(cash.inflow)}</div></div>
              <div class="card inset"><div class="muted">Saídas de caixa</div><div class="kpi">${money(cash.outflow)}</div></div>
            </div>
          </article>
          <article class="card chart-card dashboard-filter-card">
            <div class="spread"><h3>Filtros rápidos</h3>${clinicScopeBadge('Escopo global')}</div>
            <div class="form-grid">
              <div class="field"><label>Clínica</label><select id="clinic-filter"><option>Todas as clínicas</option>${state.clinics.map(c => `<option ${state.meta.clinicFilter===c.name?'selected':''}>${safe(c.name)}</option>`).join('')}</select></div>
              <div class="field"><label>Mês</label><select id="month-filter"><option ${state.meta.monthFilter==='Todos'?'selected':''}>Todos</option>${['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map(mes => `<option ${state.meta.monthFilter===mes?'selected':''}>${mes}</option>`).join('')}</select></div>
            </div>
            <div class="notice section">A clínica escolhida aqui passa a valer como escopo padrão para filtros e novos lançamentos em todos os módulos: profissionais, pacientes, atendimento clínico, contas a pagar e caixa.</div>
            <p class="footer-note">Os filtros atualizam indicadores, gráficos por clínica, profissional, agenda, caixa e ranking por paciente.</p>
          </article>
        </div>
      </section>

      <section class="layout-3 section">
        ${renderDonutCard('Carteira de recebimentos', 'Previstos x recebidos x atrasados', analytics.receivableMix, money(m.paid), 'Recebido', collectionBadge)}
        ${renderDonutCard('Contas a pagar', 'Despesa paga, aberta e atrasada', analytics.payableMix, money(m.payablePaid), 'Pago', `${m.payableOverdue} vencidos`) }
        ${renderDonutCard('Status da agenda', 'Distribuição dos atendimentos', analytics.appointmentMix, String(m.done), 'realizados', `${m.upcoming} futuros`) }
      </section>

      <section class="layout-2 section">
        ${renderPerformanceCard('Indicadores por clínica', 'Recebido com base no filtro aplicado.', analytics.clinicStats, `${analytics.clinicStats.length} clínicas`, item => `Previsto ${money(item.planned)} · Pendente ${money(item.pending)} · ${item.done} sessões realizadas · ${item.patients} pacientes`)}
        ${renderPerformanceCard('Indicadores por profissional', 'Comparativo financeiro e produtivo.', analytics.professionalStats, `${analytics.professionalStats.length} profissionais`, item => `Previsto ${money(item.planned)} · Pendente ${money(item.pending)} · ${item.done} sessões realizadas · ${item.upcoming} agendadas · ${safe(item.clinicName)}`)}
      </section>

      <section class="layout-2 section">
        ${renderDonutCard('Despesas por categoria', 'Distribuição das despesas previstas no filtro atual.', analytics.expenseCategoryMix, money(m.payablePlanned), 'Previsto', `${analytics.expenseCategoryStats.length} categorias`)}
        ${renderPerformanceCard('Categorias de despesa', 'Comparativo entre valor previsto, pago e pendente por categoria.', analytics.expenseCategoryStats, `${analytics.expenseCategoryStats.length} categorias`, item => `Previsto ${money(item.planned)} · Pago ${money(item.paid)} · Pendente ${money(item.pending)} · ${item.count} lançamento(s)`)}
      </section>

      <section class="section">
        ${renderExpenseCategoryTrendCard(analytics.expenseCategoryTrend, analytics.topExpenseCategories)}
      </section>

      <section class="section card chart-card">
        <div class="spread chart-head"><div><h3>Ranking por paciente</h3><div class="muted">Ordenado por valor recebido, com ticket médio por título.</div></div>${analytics.patientRanking.length ? `<span class="badge info">Top ${analytics.patientRanking.length}</span>` : ''}</div>
        ${analytics.patientRanking.length ? `<div class="table-wrap"><table><thead><tr><th>Posição</th><th>Paciente</th><th>Previsto</th><th>Recebido</th><th>Pendente</th><th>Ticket médio</th><th>Status</th></tr></thead><tbody>${rankingRows}</tbody></table></div>` : `<div class="empty">Cadastre pacientes e recebimentos para gerar o ranking automaticamente.</div>`}
      </section>

      <section class="section card chart-card">
        <h3>Auditoria recente</h3>
        <div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
          ${recent.map(item => `<tr><td>${new Date(item.at).toLocaleString('pt-BR')}</td><td>${safe(item.actor)}</td><td>${safe(item.action)}</td><td>${safe(item.detail)}</td></tr>`).join('')}
        </tbody></table></div>
      </section>
    `, 'Dashboard', 'Visão executiva com evolução financeira, gráficos circulares, cortes por clínica e profissional, e ranking por paciente.');
  }

  function simpleTableSection(title, columns, rows, emptyText = 'Nenhum registro encontrado.') {
    if (!rows.length) return `<section class="card section"><h3>${title}</h3><div class="empty">${emptyText}</div></section>`;
    return `<section class="card section"><h3>${title}</h3><div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div></section>`;
  }
  function clinicsView() {
    const rows = state.clinics.map(item => `<tr><td>${safe(item.code)}</td><td>${safe(item.name)}</td><td>${safe(item.status)}</td><td>${safe(item.phone || '—')}</td><td>${safe(item.email || '—')}</td><td>${actionButtons('clinic', item.id)}</td></tr>`);
    return shell(`
      <section class="card"><h3>Nova clínica</h3>
        <form id="clinic-form" class="form-grid four">
          <div class="field"><label>Nome da clínica</label><input name="name" required /></div>
          <div class="field"><label>Status</label><select name="status"><option>Ativo</option><option>Inativo</option></select></div>
          <div class="field"><label>Telefone</label><input name="phone" /></div>
          <div class="field"><label>Email</label><input name="email" type="email" /></div>
          <button id="clinic-save-btn" class="btn primary" type="submit">Salvar clínica</button>
        </form>
      </section>
      ${simpleTableSection('Clínicas cadastradas',['Código','Nome','Status','Telefone','Email','Ações'],rows,'Nenhuma clínica cadastrada.')}
    `, 'Clínicas', 'Cadastro base do sistema');
  }

  function professionalsView() {
    const scope = currentClinicScopeName();
    const scopedProfessionals = clinicScopedProfessionals();
    const rows = scopedProfessionals.map(item => `<tr><td>${safe(item.code)}</td><td>${safe(item.name)}</td><td>${safe(item.clinicName)}</td><td>${safe(item.specialty || '—')}</td><td>${safe(item.status)}</td><td>${actionButtons('professional', item.id)}</td></tr>`);
    return shell(`
      <section class="card"><div class="spread"><h3>Novo profissional</h3>${clinicScopeBadge('Clínica ativa')}</div>
        <form id="professional-form" class="form-grid four">
          <div class="field"><label>Nome</label><input name="name" required /></div>
          ${scope ? `<div class="field"><label>Clínica</label><input value="${safe(scope)}" readonly /><input type="hidden" name="clinicName" value="${safe(scope)}" /></div>` : `<div class="field"><label>Clínica</label><select name="clinicName">${state.clinics.map(c => `<option>${safe(c.name)}</option>`).join('')}</select></div>`}
          <div class="field"><label>Especialidade</label><input name="specialty" /></div>
          <div class="field"><label>Status</label><select name="status"><option>Ativo</option><option>Inativo</option></select></div>
          <button class="btn primary" type="submit">Salvar profissional</button>
        </form>
        <p class="footer-note">Quando uma clínica está selecionada no Dashboard, ela vira o escopo global dos novos lançamentos e filtros do sistema.</p>
      </section>
      ${simpleTableSection('Profissionais',['Código','Nome','Clínica','Especialidade','Status','Ações'],rows,scope ? 'Nenhum profissional cadastrado para a clínica ativa.' : 'Nenhum profissional cadastrado.')}
    `, 'Profissionais', 'Profissionais vinculados às clínicas, respeitando a clínica ativa do Dashboard.');
  }

  function openPatientEditModal(item) {
    const scopedProfessionals = clinicScopedProfessionals();
    const professionalPool = scopedProfessionals.some(p => String(p.id) === String(item.professionalId)) ? scopedProfessionals : [...scopedProfessionals, ...state.professionals.filter(p => String(p.id) === String(item.professionalId))];
    const profOptions = professionalPool.map(p => `<option value="${p.id}" ${String(p.id) === String(item.professionalId) ? 'selected' : ''}>${safe(p.name)} — ${safe(p.clinicName)}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="spread"><h3>✏ Editar paciente</h3><button id="modal-close-btn" class="btn ghost">&times;</button></div>
        <form id="patient-edit-form" class="form-grid four" style="max-height:72vh;overflow-y:auto;padding-right:8px">
          <div class="field" style="grid-column:1/3"><label>Nome completo *</label><input name="name" value="${safe(item.name)}" required /></div>
          <div class="field"><label>Telefone / WhatsApp</label><input name="phone" value="${safe(item.phone||'')}" /></div>
          <div class="field"><label>Data de nascimento</label><input name="birthDate" type="date" value="${safe(item.birthDate||'')}" /></div>
          <div class="field"><label>CPF</label><input name="cpf" value="${safe(item.cpf||'')}" /></div>
          <div class="field"><label>Email</label><input name="email" type="email" value="${safe(item.email||'')}" /></div>
          <div class="field"><label>Profissional</label><select name="professionalId">${profOptions}</select></div>
          <div class="field"><label>Frequência</label><select name="frequency">${['Semanal','Quinzenal','Mensal'].map(f=>`<option ${item.frequency===f?'selected':''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Dia da semana</label><select name="weekday">${['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(d=>`<option ${item.weekday===d?'selected':''}>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Horário</label><select name="time">${timeSlots.map(t=>`<option ${item.time===t?'selected':''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Valor mensalidade</label><input name="monthlyFee" type="number" step="0.01" value="${item.monthlyFee||0}" /></div>
          <div class="field"><label>Dia de pagamento</label><input name="paymentDay" type="number" min="1" max="31" value="${item.paymentDay||10}" /></div>
          <div class="field"><label>Tipo de cobrança</label><select name="billingType">${['Mensal','Avulsa'].map(b=>`<option ${item.billingType===b?'selected':''}>${b}</option>`).join('')}</select></div>
          <div class="field"><label>Status</label><select name="status">${['Ativo','Inativo'].map(s=>`<option ${item.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>Data de cadastro</label><input name="registrationDate" type="date" value="${safe(item.registrationDate||'')}" /></div>
          <div class="field"><label>Consentimento</label><select name="consentRecording"><option value="1" ${item.consentRecording?'selected':''}>Aceito</option><option value="0" ${!item.consentRecording?'selected':''}>Pendente</option></select></div>
          <div class="field"><label>Data do aceite</label><input name="consentSignedAt" type="date" value="${safe(item.consentSignedAt||'')}" /></div>
          <div class="field" style="grid-column:1/-1"><label>⚠ Alertas clínicos</label><input name="clinicalAlerts" value="${safe(item.clinicalAlerts||'')}" /></div>
          <div class="field" style="grid-column:1/-1"><label>Texto do consentimento</label><textarea name="consentText" rows="3">${safe(item.consentText || state.settings.consentTemplate || '')}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>💊 Medicações em uso</label><textarea name="medications" rows="2">${safe(item.medications||'')}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>🏥 Doenças / diagnósticos</label><textarea name="diseases" rows="2">${safe(item.diseases||'')}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>📝 Observações gerais</label><textarea name="observations" rows="2">${safe(item.observations||'')}</textarea></div>
          <div class="field" style="grid-column:1/-1"><label>📋 Anamnese inicial</label><textarea name="anamnese" rows="4">${safe(item.anamnese||'')}</textarea></div>
          <div class="field" style="grid-column:1/-1; display:flex; justify-content:flex-end; gap:10px">
            <button type="button" class="btn ghost" id="modal-cancel-btn">Cancelar</button>
            <button type="submit" class="btn primary">💾 Salvar alterações</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#modal-close-btn')?.addEventListener('click', close);
    overlay.querySelector('#modal-cancel-btn')?.addEventListener('click', close);
    overlay.querySelector('#patient-edit-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const before = clone(item);
      const fd = new FormData(event.target);
      const professional = state.professionals.find(p => String(p.id) === String(fd.get('professionalId')));
      Object.assign(item, {
        name: fd.get('name') || item.name,
        phone: fd.get('phone') || '',
        birthDate: fd.get('birthDate') || '',
        cpf: fd.get('cpf') || '',
        email: fd.get('email') || '',
        professionalId: String(fd.get('professionalId') || item.professionalId),
        professionalName: professional?.name || item.professionalName,
        clinicId: professional?.clinicId || item.clinicId,
        clinicName: professional?.clinicName || item.clinicName,
        frequency: fd.get('frequency') || item.frequency,
        weekday: fd.get('weekday') || item.weekday,
        time: fd.get('time') || item.time,
        monthlyFee: Number(fd.get('monthlyFee') || 0),
        paymentDay: Number(fd.get('paymentDay') || 1),
        billingType: fd.get('billingType') || item.billingType,
        status: fd.get('status') || item.status,
        registrationDate: fd.get('registrationDate') || item.registrationDate || '',
        consentRecording: String(fd.get('consentRecording')||'0') === '1',
        consentSignedAt: fd.get('consentSignedAt') || item.consentSignedAt || '',
        consentText: fd.get('consentText') || item.consentText || state.settings.consentTemplate || '',
        clinicalAlerts: fd.get('clinicalAlerts') || '',
        medications: fd.get('medications') || '',
        diseases: fd.get('diseases') || '',
        observations: fd.get('observations') || '',
        anamnese: fd.get('anamnese') || ''
      });
      try {
        if (useBackend() && backendResourceForType('patient')) {
          await updateBackendRecord('patients', item.id, item);
        } else {
          saveState();
          audit('Edição', `Paciente alterado: ${item.name}`, { entity: 'patient', before, after: item });
        }
        close();
        render();
      } catch (err) {
        Object.assign(item, before);
        alert(err.message || 'Falha ao salvar.');
      }
    });
  }

  /* ---- HISTÓRICO DE EVOLUÇÕES DO PACIENTE ---- */
  function openPatientHistoryModal(patientId) {
    const patient = state.patients.find(p => String(p.id) === String(patientId));
    if (!patient) return;
    const sessions = (state.sessions || [])
      .filter(s => String(s.patientId) === String(patientId))
      .sort((a, b) => (b.startedAt || b.scheduledDate || b.createdAt || '') > (a.startedAt || a.scheduledDate || a.createdAt || '') ? 1 : -1);
    const age = patient.birthDate ? Math.floor((Date.now() - new Date(patient.birthDate + 'T00:00:00').getTime()) / 31557600000) : null;

    const sessionCards = sessions.length ? sessions.map((s, i) => {
      const dateStr = s.startedAt ? new Date(s.startedAt).toLocaleString('pt-BR') : (s.scheduledDate ? fmtDate(s.scheduledDate) : '—');
      const dur = s.durationMinutes ? `${s.durationMinutes} min` : '—';
      const statusBadge = `<span class="badge ${s.status === 'FINALIZADO' ? 'ok' : s.status === 'EM_ANDAMENTO' ? 'info' : 'warn'}">${safe(s.status || 'RASCUNHO')}</span>`;
      const kws = (s.keywords || []).slice(0, 6).map(k => `<span class="chip" style="font-size:.75rem;padding:2px 7px">${safe(k)}</span>`).join(' ');
      const hasSoap = s.soapSubjective || s.soapObjective || s.soapAssessment || s.soapPlan;
      const soapBlock = hasSoap ? `
        <div class="history-soap">
          ${s.soapSubjective ? `<div><strong>S:</strong> ${safe(s.soapSubjective)}</div>` : ''}
          ${s.soapObjective ? `<div><strong>O:</strong> ${safe(s.soapObjective)}</div>` : ''}
          ${s.soapAssessment ? `<div><strong>A:</strong> ${safe(s.soapAssessment)}</div>` : ''}
          ${s.soapPlan ? `<div><strong>P:</strong> ${safe(s.soapPlan)}</div>` : ''}
        </div>` : '';
      const summaryBlock = s.summary ? `<div class="history-summary"><strong>📌 Resumo:</strong> ${safe(s.summary)}</div>` : '';
      const reasonBlock = s.mainReason ? `<div style="margin-bottom:6px"><strong>🎯 Motivo:</strong> ${safe(s.mainReason)}</div>` : '';
      return `
        <div class="history-card${i === 0 ? ' history-card-latest' : ''}">
          <div class="history-card-header">
            <div>
              <strong>${dateStr}</strong>
              <span style="color:#7a8fa6;margin-left:8px;font-size:.85rem">${safe(s.code || '')} &bull; ${dur}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              ${statusBadge}
              <button class="btn ghost" style="font-size:.75rem;padding:3px 8px" onclick="(function(){
                const text = [
                  'Data: ${dateStr}',
                  ${s.mainReason ? `'Motivo: ' + ${JSON.stringify(s.mainReason)},` : ''}
                  ${s.soapSubjective ? `'S: ' + ${JSON.stringify(s.soapSubjective)},` : ''}
                  ${s.soapObjective ? `'O: ' + ${JSON.stringify(s.soapObjective)},` : ''}
                  ${s.soapAssessment ? `'A: ' + ${JSON.stringify(s.soapAssessment)},` : ''}
                  ${s.soapPlan ? `'P: ' + ${JSON.stringify(s.soapPlan)},` : ''}
                  ${s.summary ? `'Resumo: ' + ${JSON.stringify(s.summary)},` : ''}
                ].filter(Boolean).join('\\n');
                navigator.clipboard?.writeText(text).then(()=>alert('SOAP copiado!')).catch(()=>prompt('Copie manualmente:',text));
              })()">Copiar SOAP</button>
            </div>
          </div>
          ${reasonBlock}
          ${kws ? `<div style="margin-bottom:6px">${kws}</div>` : ''}
          ${summaryBlock}
          ${soapBlock}
        </div>`;
    }).join('') : '<div class="empty">⚠️ Nenhuma sessão registrada para este paciente.</div>';

    const alertBlock = patient.clinicalAlerts ? `<div class="notice" style="background:#fff3cd;border-color:#ffc107;color:#856404;margin-bottom:14px"><strong>⚠️ Alerta clínico:</strong> ${safe(patient.clinicalAlerts)}</div>` : '';
    const medsBlock = patient.medications ? `<div style="margin-bottom:8px"><strong>💊 Medicações:</strong> ${safe(patient.medications)}</div>` : '';
    const diseasesBlock = patient.diseases ? `<div style="margin-bottom:8px"><strong>🏥 Diagnósticos:</strong> ${safe(patient.diseases)}</div>` : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box modal-box-wide">
        <div class="spread">
          <div>
            <h3 style="margin:0">📋 Histórico de Evoluções</h3>
            <div style="color:#7a8fa6;font-size:.9rem;margin-top:2px">
              <strong>${safe(patient.name)}</strong>${age != null ? ` &bull; ${age} anos` : ''}${patient.phone ? ` &bull; ${safe(patient.phone)}` : ''}
            </div>
          </div>
          <button id="modal-hist-close" class="btn ghost" style="font-size:1.2rem">&times;</button>
        </div>
        <div style="display:flex;gap:12px;margin:12px 0;flex-wrap:wrap">
          <span class="chip">${sessions.length} sessões registradas</span>
          <span class="chip" style="background:${patient.consentRecording ? '#e6f9f0' : '#fff3cd'}">${patient.consentRecording ? '✅ Consentimento OK' : '⚠️ Consentimento pendente'}</span>
          ${patient.status === 'Ativo' ? '<span class="chip" style="background:#e6f9f0">● Ativo</span>' : '<span class="chip" style="background:#fff3cd">○ Inativo</span>'}
        </div>
        ${alertBlock}
        ${medsBlock}
        ${diseasesBlock}
        <div class="history-cards-container">
          ${sessionCards}
        </div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
          <button class="btn warn" id="hist-print-btn">🖨 Imprimir prontuário</button>
          <button class="btn ghost" id="modal-hist-cancel">Fechar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#modal-hist-close')?.addEventListener('click', close);
    overlay.querySelector('#modal-hist-cancel')?.addEventListener('click', close);
    overlay.querySelector('#hist-print-btn')?.addEventListener('click', () => {
      const printSessions = sessions.map((s, i) => {
        const d = s.startedAt ? new Date(s.startedAt).toLocaleString('pt-BR') : (s.scheduledDate ? fmtDate(s.scheduledDate) : '—');
        return `<div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px;${i===0?'border-left:4px solid #1a73e8':''}">
          <h3 style="margin:0 0 4px">${d} &nbsp;<span style="font-size:.8em;color:#666">${s.code || ''} &bull; ${s.durationMinutes ? s.durationMinutes + ' min' : '—'} &bull; ${s.status || ''}</span></h3>
          ${s.mainReason ? `<p><strong>Motivo:</strong> ${safe(s.mainReason)}</p>` : ''}
          ${s.soapSubjective ? `<p><strong>S (Subjetivo):</strong> ${safe(s.soapSubjective)}</p>` : ''}
          ${s.soapObjective ? `<p><strong>O (Objetivo):</strong> ${safe(s.soapObjective)}</p>` : ''}
          ${s.soapAssessment ? `<p><strong>A (Avaliação):</strong> ${safe(s.soapAssessment)}</p>` : ''}
          ${s.soapPlan ? `<p><strong>P (Plano):</strong> ${safe(s.soapPlan)}</p>` : ''}
          ${s.summary ? `<p><strong>Resumo:</strong> ${safe(s.summary)}</p>` : ''}
          ${(s.keywords||[]).length ? `<p><strong>Palavras-chave:</strong> ${(s.keywords||[]).join(', ')}</p>` : ''}
        </div>`;
      }).join('');
      openPrintWindow(`Prontuário — ${patient.name}`, `
        <h1>${safe(patient.name)}</h1>
        <div class="meta">
          ${age != null ? `Idade: ${age} anos &nbsp;|&nbsp;` : ''}
          ${patient.birthDate ? `Nasc.: ${fmtDate(patient.birthDate)} &nbsp;|&nbsp;` : ''}
          ${patient.cpf ? `CPF: ${safe(patient.cpf)} &nbsp;|&nbsp;` : ''}
          ${patient.phone ? `Tel: ${safe(patient.phone)}` : ''}
        </div>
        ${patient.clinicalAlerts ? `<div style="background:#fff3cd;padding:10px;border-radius:6px;margin-bottom:12px"><strong>⚠️ Alerta clínico:</strong> ${safe(patient.clinicalAlerts)}</div>` : ''}
        ${patient.medications ? `<p><strong>Medicações em uso:</strong> ${safe(patient.medications)}</p>` : ''}
        ${patient.diseases ? `<p><strong>Diagnósticos:</strong> ${safe(patient.diseases)}</p>` : ''}
        ${patient.anamnese ? `<h2>Anamnese inicial</h2><pre>${safe(patient.anamnese)}</pre>` : ''}
        <h2>Evoluções clínicas (${sessions.length} sessões)</h2>
        ${printSessions || '<p>Sem sessões registradas.</p>'}
      `);
    });
  }

  function patientsView() {
    const scope = currentClinicScopeName();
    const allPatients = clinicScopedPatientsDetailed();
    const availableProfessionals = clinicScopedProfessionals();
    const q = String(patientSearchQuery || '').toLowerCase().trim();
    const pf = String(patientProfessionalFilter || '').toLowerCase().trim();
    let patients = allPatients;
    if (q) patients = patients.filter(p => p.name.toLowerCase().includes(q) || (p.phone||'').includes(q) || (p.cpf||'').includes(q));
    if (pf) patients = patients.filter(p => p.professionalName.toLowerCase().includes(pf));
    const rows = patients.map(p => {
      const age = p.birthDate ? Math.floor((Date.now() - new Date(p.birthDate+'T00:00:00').getTime()) / 31557600000) : null;
      const ageStr = age != null ? `${age} anos` : '—';
      const alerts = p.clinicalAlerts ? `<span class="badge warn" title="${safe(p.clinicalAlerts)}">⚠ Alerta</span>` : '';
      return `<tr><td>${safe(p.code)}</td><td><strong>${safe(p.name)}</strong>${alerts}</td><td>${safe(p.phone||'—')}</td><td>${ageStr}</td><td>${safe(p.professionalName)}</td><td>${safe(p.weekday)} ${safe(p.time)}</td><td>${money(p.monthlyFee)}</td><td><span class="badge ${p.consentRecording ? 'ok' : 'warn'}">${p.consentRecording ? 'OK' : 'Pendente'}</span></td><td>${safe(p.status)}</td><td>${actionButtons('patient', p.id)}</td></tr>`;
    });
    const profOptions = ['', ...new Set(allPatients.map(p => p.professionalName).filter(Boolean))].map(name => `<option value="${safe(name)}" ${patientProfessionalFilter === name ? 'selected' : ''}>${name || 'Todos os profissionais'}</option>`).join('');
    return shell(`
      <section class="card">
        <div class="spread"><h3>Novo paciente</h3><div class="flex"><span class="badge info">${allPatients.length} cadastrados</span>${clinicScopeBadge('Clínica ativa')}</div></div>
        <form id="patient-form" class="form-grid four">
          <div class="field" style="grid-column:1/3"><label>Nome completo *</label><input name="name" required placeholder="Nome do paciente" /></div>
          <div class="field"><label>Telefone / WhatsApp</label><input name="phone" placeholder="(11) 99999-9999" /></div>
          <div class="field"><label>Data de nascimento</label><input name="birthDate" type="date" /></div>
          <div class="field"><label>CPF</label><input name="cpf" placeholder="000.000.000-00" /></div>
          <div class="field"><label>Email</label><input name="email" type="email" /></div>
          <div class="field"><label>Profissional *</label><select name="professionalId">${availableProfessionals.map(p => `<option value="${p.id}">${safe(p.name)} — ${safe(p.clinicName)}</option>`).join('')}</select></div>
          <div class="field"><label>Frequência</label><select name="frequency"><option>Semanal</option><option>Quinzenal</option><option>Mensal</option></select></div>
          <div class="field"><label>Dia da semana</label><select name="weekday">${['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'].map(d => `<option>${d}</option>`).join('')}</select></div>
          <div class="field"><label>Horário</label><select name="time">${timeSlots.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div class="field"><label>Valor mensalidade *</label><input name="monthlyFee" type="number" step="0.01" placeholder="0.00" required /></div>
          <div class="field"><label>Dia de pagamento</label><input name="paymentDay" type="number" min="1" max="31" value="10" required /></div>
          <div class="field"><label>Tipo de cobrança</label><select name="billingType"><option>Mensal</option><option>Avulsa</option></select></div>
          <div class="field"><label>Status</label><select name="status"><option>Ativo</option><option>Inativo</option></select></div>
          <div class="field"><label>Data cadastro</label><input name="registrationDate" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Consentimento</label><select name="consentRecording"><option value="1">Aceito</option><option value="0">Pendente</option></select></div>
          <div class="field"><label>Data do aceite</label><input name="consentSignedAt" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Início da cobrança</label><select name="billingStart"><option value="current">Mês atual</option><option value="next">Próximo mês</option></select></div>
          <div class="field" style="grid-column:1/-1"><label>⚠ Alertas clínicos</label><input name="clinicalAlerts" placeholder="Ex.: risco de crise, gatilhos, alergias, observações de segurança" /></div>
          <div class="field" style="grid-column:1/-1"><label>💊 Medicações em uso</label><textarea name="medications" rows="2" placeholder="Ex.: Fluoxetina 20mg, Clonazepam 0,5mg..."></textarea></div>
          <div class="field" style="grid-column:1/-1"><label>🏥 Doenças / diagnósticos</label><textarea name="diseases" rows="2" placeholder="Ex.: TDA, Depressão, Ansiedade Generalizada, Hipotireoidismo..."></textarea></div>
          <div class="field" style="grid-column:1/-1"><label>📝 Observações gerais</label><textarea name="observations" rows="2" placeholder="Observações livres sobre o paciente"></textarea></div>
          <div class="field" style="grid-column:1/-1"><label>📋 Anamnese inicial</label><textarea name="anamnese" rows="4" placeholder="Queixa principal, história pregressa, família, histórico de tratamentos anteriores, expectativas..."></textarea></div>
          <div class="field" style="grid-column:1/-1"><label>Texto do consentimento</label><textarea name="consentText">${safe(state.settings.consentTemplate || '')}</textarea></div>
          <div class="field" style="grid-column:1/-1; display:flex; justify-content:flex-end"><button class="btn primary" type="submit">💾 Salvar paciente e gerar agenda</button></div>
        </form>
        <p class="footer-note">${scope ? `Novos pacientes serão vinculados automaticamente à clínica ativa: ${safe(scope)}.` : 'Selecione uma clínica no Dashboard para transformar esse vínculo em escopo global do sistema.'}</p>
      </section>
      <section class="card section">
        <div class="spread"><h3>Pacientes cadastrados</h3><div class="patient-filters">
          <input id="patient-search-input" type="search" placeholder="Buscar por nome, telefone, CPF..." value="${safe(patientSearchQuery)}" class="patient-filter-input" />
          <select id="patient-prof-filter" class="patient-filter-select">${profOptions}</select>
        </div></div>
        <p class="footer-note">${patients.length} paciente${patients.length !== 1 ? 's' : ''} exibido${patients.length !== 1 ? 's' : ''} de ${allPatients.length} cadastrados.${scope ? ` Escopo ativo: ${safe(scope)}.` : ''}</p>
        ${patients.length ? `<div class="table-wrap"><table><thead><tr><th>Cód.</th><th>Paciente</th><th>Telefone</th><th>Idade</th><th>Profissional</th><th>Agenda</th><th>Mensalidade</th><th>Consent.</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="empty">${(q||pf) ? 'Nenhum paciente encontrado com os filtros aplicados.' : 'Nenhum paciente cadastrado.'}</div>`}
      </section>
    `, 'Pacientes', 'Cadastro clínico completo com anamnese, medicações, doenças e busca rápida');
  }

  function appointmentsView() {
    const range = getAgendaRange();
    const items = filteredAppointments().filter(a => a.date >= toIso(range.start) && a.date <= toIso(range.end));
    const googleMetrics = googleCalendarPeriodMetrics();
    const rows = items.map(a => {
      const wa = whatsappLink(a.phone, `Olá ${a.patientName}, lembrando da sessão do dia ${fmtDate(a.date)} às ${a.time}.`);
      const googleMeta = googleCalendarAppointmentMeta(a);
      const isCanceled = String(a.status || '').toUpperCase() === 'CANCELADO';
      const actionLabel = a.googleSyncError ? 'Tentar novamente' : (isCanceled && a.googleEventId ? 'Cancelar agora' : (a.googleEventId ? 'Reenviar' : 'Enviar agora'));
      const allowSync = googleCalendarReady() && (!isCanceled || !!a.googleEventId || !!a.googleSyncError);
      const googleActions = `${a.googleEventHtmlLink ? `<a href="${a.googleEventHtmlLink}" target="_blank" rel="noopener noreferrer">Abrir no Google</a>` : '—'}${allowSync ? `${a.googleEventHtmlLink ? ' · ' : ''}<button type="button" class="table-link-button js-google-sync-one" data-id="${safe(a.id)}">${actionLabel}</button>` : ''}`;
      return `<tr class="${a.googleSyncError ? 'google-sync-row-failed' : ''}"><td>${safe(a.code)}</td><td>${fmtDate(a.date)}</td><td>${safe(a.time)}</td><td>${safe(a.patientName)}</td><td>${safe(a.professionalName)}</td><td>${safe(a.clinicName)}</td><td><span class="status-pill status-${safe(a.status)}">${safe(a.status)}</span></td><td><span class="badge ${googleMeta.badgeClass}" title="${safe(googleMeta.hint)}">${safe(googleMeta.label)}</span>${a.googleSyncAt ? `<div class="table-subnote">${safe(new Date(a.googleSyncAt).toLocaleString('pt-BR'))}</div>` : ''}${a.googleSyncError ? `<div class="table-subnote table-subnote-danger">${safe(a.googleSyncError)}</div>` : ''}</td><td>${googleActions}</td><td>${wa ? `<a href="${wa}" target="_blank">WhatsApp</a>` : '—'}</td><td>${actionButtons('appointment', a.id)}</td></tr>`;
    });
    return shell(`
      <section class="card">
        <div class="agenda-toolbar">
          <div class="field"><label>Modo</label><select id="agenda-mode"><option ${state.meta.agendaMode==='Semana atual'?'selected':''}>Semana atual</option><option ${state.meta.agendaMode==='Semana anterior'?'selected':''}>Semana anterior</option><option ${state.meta.agendaMode==='Próxima semana'?'selected':''}>Próxima semana</option><option ${state.meta.agendaMode==='Mês inteiro'?'selected':''}>Mês inteiro</option></select></div>
          <div class="field"><label>Data de referência</label><input id="agenda-ref" type="date" value="${safe(state.meta.agendaRefDate)}" /></div>
          <div class="field"><label>Período</label><div class="chip">${fmtDate(range.start)} → ${fmtDate(range.end)}</div></div>
        </div>
        <div class="google-ops-summary section">
          <span class="chip">📅 Google no período: ${googleMetrics.synced}/${googleMetrics.total}</span>
          <span class="chip">⏳ Pendentes: ${googleMetrics.pending}</span>
          <span class="chip">⚠ Falhas reais: ${googleMetrics.failed}</span>
          <span class="chip">🚫 Cancelados: ${googleMetrics.canceled}</span>
          <span class="chip">Última sincronização: ${safe(state.settings.googleCalendarLastSyncAt ? new Date(state.settings.googleCalendarLastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizado')}</span>
        </div>
        <div class="notice">A lista de agendamentos acompanha o mesmo recorte da Agenda Visual e agora também destaca falhas reais de sincronização com o Google Calendar, com opção de tentativa manual item a item.</div>
      </section>
      ${simpleTableSection('Agendamentos',['Código','Data','Hora','Paciente','Profissional','Clínica','Status','Google Calendar','Operação Google','WhatsApp','Ações'],rows,'Nenhum agendamento gerado para o período selecionado.')}
    `, 'Agendamentos', 'Visão operacional sincronizada com a Agenda Visual, Google Calendar e filtro por período');
  }

  function receivablesView() {
    const bankOptions = (state.bankAccounts || []).filter(a => a.status !== 'Inativa').map(a => `<option value="${a.id}">${safe(a.name)} · Saldo ${money(accountBalance(a.id))}</option>`).join('');
    const rows = filteredReceivables().map(r => {
      const wa = whatsappLink(r.phone, `Olá ${r.patientName}, lembrete da cobrança com vencimento em ${fmtDate(r.dueDate)}.`);
      return `<tr><td>${safe(r.code)}</td><td>${fmtDate(r.dueDate)}</td><td>${safe(r.patientName)}</td><td>${safe(r.clinicName)}</td><td>${money(r.amountPlanned)}</td><td>${money(r.amountPaid)}</td><td>${safe(r.bankAccountName || '—')}</td><td><span class="status-pill status-${safe(receiveStatus(r))}">${safe(receiveStatus(r))}</span></td><td>${wa ? `<a href="${wa}" target="_blank">Cobrar</a>` : '—'}</td><td>${actionButtons('receivable', r.id)}</td></tr>`;
    });
    return shell(`
      <section class="card">
        <h3>Baixa manual de recebimento</h3>
        <form id="payment-form" class="form-grid four">
          <div class="field"><label>Recebimento</label><select name="receivableId">${state.receivables.map(r => `<option value="${r.id}">${safe(r.code)} — ${safe(r.patientName)} — ${fmtDate(r.dueDate)}</option>`).join('')}</select></div>
          <div class="field"><label>Valor pago</label><input name="amountPaid" type="number" step="0.01" /></div>
          <div class="field"><label>Data pagamento</label><input name="paymentDate" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Conta bancária</label><select name="bankAccountId"><option value="">Selecione</option>${bankOptions}</select></div>
          <div class="field"><label>&nbsp;</label><button class="btn success" type="submit">Registrar pagamento</button></div>
        </form>
      </section>
      ${simpleTableSection('Recebimentos',['Código','Vencimento','Paciente','Clínica','Previsto','Pago','Conta','Status','Cobrança','Ações'],rows,'Nenhum recebimento gerado.')}
    `, 'Recebimentos', 'Ao receber um paciente, o valor pode ser lançado automaticamente no caixa e na conta bancária escolhida');
  }

  function payablesView() {
    const bankOptions = (state.bankAccounts || []).filter(a => a.status !== 'Inativa').map(a => `<option value="${a.id}">${safe(a.name)} · Saldo ${money(accountBalance(a.id))}</option>`).join('');
    const rows = filteredPayables().map(p => {
      const status = receiveStatus({ dueDate: p.dueDate, amountPaid: p.amountPaid, amountPlanned: p.amountPlanned });
      return `<tr><td>${safe(p.code)}</td><td>${fmtDate(p.dueDate)}</td><td>${safe(normalizeExpenseCategory(p.category))}</td><td>${safe(p.description)}</td><td>${safe(p.clinicName)}</td><td>${money(p.amountPlanned)}</td><td>${money(p.amountPaid)}</td><td>${safe(p.bankAccountName || '—')}</td><td><span class="status-pill status-${safe(status)}">${safe(status)}</span></td><td>${actionButtons('payable', p.id)}</td></tr>`;
    });
    return shell(`
      <section class="card">
        <div class="spread"><h3>Nova conta a pagar</h3>${clinicScopeBadge('Clínica ativa')}</div>
        <form id="payable-form" class="form-grid four">
          <datalist id="expense-categories-master">${expenseCategoryOptions(false)}</datalist>
          <div class="field"><label>Data prevista</label><input name="dueDate" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Categoria</label><input name="category" list="expense-categories-master" placeholder="Ex.: Aluguel, Internet" required /></div>
          <div class="field"><label>Descrição</label><input name="description" placeholder="Detalhe da despesa" required /></div>
          ${currentClinicScopeName() ? `<div class="field"><label>Clínica</label><input value="${safe(currentClinicScopeName())}" readonly /><input type="hidden" name="clinicName" value="${safe(currentClinicScopeName())}" /></div>` : `<div class="field"><label>Clínica</label><select name="clinicName"><option>Todas as clínicas</option>${state.clinics.map(c => `<option>${safe(c.name)}</option>`).join('')}</select></div>`}
          <div class="field"><label>Valor previsto</label><input name="amountPlanned" type="number" step="0.01" required /></div>
          <div class="field"><label>Valor pago no ato</label><input name="amountPaid" type="number" step="0.01" value="0" /></div>
          <div class="field"><label>Data pagamento</label><input name="paymentDate" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Conta bancária</label><select name="bankAccountId"><option value="">Selecione</option>${bankOptions}</select></div>
          <div class="field"><label>Tipo de lançamento</label><select name="recurrenceType"><option value="single">Único</option><option value="recurring">Recorrente</option></select></div>
          <div class="field"><label>Repetições</label><input name="recurrenceCount" type="number" min="1" max="60" value="1" /></div>
          <div class="field"><label>Intervalo</label><select name="recurrenceInterval"><option value="monthly">Mensal</option><option value="weekly">Semanal</option><option value="daily">Diário</option></select></div>
          <div class="field"><label>&nbsp;</label><button class="btn warn" type="submit">Salvar conta a pagar</button></div>
        </form>
        <p class="footer-note">Para lançamento recorrente, escolha “Recorrente” e informe a quantidade de repetições. Cada parcela é criada automaticamente.</p>
      </section>
      <section class="card">
        <h3>Baixa manual de pagamento</h3>
        <form id="payable-payment-form" class="form-grid four">
          <div class="field"><label>Conta</label><select name="payableId">${state.payables.map(p => `<option value="${p.id}">${safe(p.code)} — ${safe(p.description)} — ${fmtDate(p.dueDate)}</option>`).join('')}</select></div>
          <div class="field"><label>Valor pago</label><input name="amountPaid" type="number" step="0.01" /></div>
          <div class="field"><label>Data pagamento</label><input name="paymentDate" type="date" value="${todayIso()}" /></div>
          <div class="field"><label>Conta bancária</label><select name="bankAccountId"><option value="">Selecione</option>${bankOptions}</select></div>
          <div class="field"><label>&nbsp;</label><button class="btn success" type="submit">Registrar pagamento</button></div>
        </form>
      </section>
      ${simpleTableSection('Contas a pagar',['Código','Vencimento','Categoria','Descrição','Clínica','Previsto','Pago','Conta','Status','Ações'],rows,'Nenhuma conta a pagar lançada.')}
    `, 'Contas a Pagar', 'Ao pagar uma conta, o valor pode ser baixado automaticamente no caixa e na conta bancária escolhida');
  }

  function categoriesView() {
    const rows = [...(state.expenseCategories || [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(item => `<tr><td>${safe(item.code)}</td><td>${safe(item.name)}</td><td>${safe(item.description || '—')}</td><td>${safe(item.status || 'Ativa')}</td><td>${actionButtons('expenseCategory', item.id)}</td></tr>`);
    return shell(`
      <section class="card">
        <h3>Nova categoria de despesa</h3>
        <form id="expense-category-form" class="form-grid four">
          <div class="field"><label>Nome</label><input name="name" list="expense-categories-master-global" placeholder="Ex.: Aluguel" required /></div>
          <div class="field"><label>Descrição</label><input name="description" placeholder="Detalhe opcional da categoria" /></div>
          <div class="field"><label>Status</label><select name="status"><option>Ativa</option><option>Inativa</option></select></div>
          <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">Salvar categoria</button></div>
          <datalist id="expense-categories-master-global">${expenseCategoryOptions(false)}</datalist>
        </form>
        <p class="footer-note">As categorias cadastradas aqui ficam disponíveis em Contas a Pagar, Caixa & Bancos, Dashboard e Relatórios.</p>
      </section>
      ${simpleTableSection('Categorias de despesa',['Código','Categoria','Descrição','Status','Ações'],rows,'Nenhuma categoria cadastrada.')}
    `, 'Categorias de Despesa', 'Cadastro mestre para padronizar despesas e análises financeiras.');
  }

  function caixaView() {
    const summary = cashMetrics();
    const analytics = dashboardAnalytics();
    const categorySuggestions = Array.from(new Set([...(state.expenseCategories || []).map(item => normalizeExpenseCategory(item.name)), ...(state.payables || []).map(item => normalizeExpenseCategory(item.category))].filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(category => `<option value="${safe(category)}"></option>`).join('');
    const bankRows = (state.bankAccounts || []).map(account => `<tr><td>${safe(account.code)}</td><td>${safe(account.name)}</td><td>${safe(account.bankName || '—')}</td><td>${safe(account.type || '—')}</td><td>${money(account.initialBalance)}</td><td>${money(accountBalance(account.id))}</td><td>${safe(account.status || 'Ativa')}</td><td>${actionButtons('bankAccount', account.id)}</td></tr>`);
    const cashRows = filteredCashEntries().map(entry => `<tr><td>${safe(entry.code)}</td><td>${fmtDate(entry.movementDate)}</td><td>${safe(entry.direction)}</td><td>${safe(normalizeExpenseCategory(entry.category))}</td><td>${safe(entry.description)}</td><td>${safe(entry.bankAccountName || '—')}</td><td>${safe(entry.clinicName || '—')}</td><td>${money(entry.amount)}</td><td>${safe(entry.originType || 'manual')}</td><td>${actionButtons('cashEntry', entry.id)}</td></tr>`);
    return shell(`
      <section class="card-grid">
        <article class="card"><div class="muted">Saldo em contas</div><div class="kpi">${money(summary.balance)}</div><span class="badge ok">${summary.accounts} conta(s)</span></article>
        <article class="card"><div class="muted">Entradas</div><div class="kpi">${money(summary.inflow)}</div><span class="badge info">Recebimentos e lançamentos</span></article>
        <article class="card"><div class="muted">Saídas</div><div class="kpi">${money(summary.outflow)}</div><span class="badge warn">Pagamentos e despesas</span></article>
        <article class="card"><div class="muted">Movimentações</div><div class="kpi">${summary.entries}</div><span class="badge info">Caixa integrado</span></article>
      </section>
      <section class="layout-2 section">
        ${renderDonutCard('Despesas por categoria', 'Distribuição das despesas previstas por categoria no escopo atual.', analytics.expenseCategoryMix, money(analytics.expenseCategoryStats.reduce((sum, item) => sum + Number(item.planned || 0), 0)), 'Previsto', `${analytics.expenseCategoryStats.length} categorias`)}
        ${renderPerformanceCard('Categorias de despesa', 'Use o Caixa & Bancos para lançar e acompanhar despesas por categoria.', analytics.expenseCategoryStats, `${analytics.expenseCategoryStats.length} categorias`, item => `Previsto ${money(item.planned)} · Pago ${money(item.paid)} · Pendente ${money(item.pending)} · ${item.count} lançamento(s)`)}
      </section>

      <section class="section">
        ${renderExpenseCategoryTrendCard(analytics.expenseCategoryTrend, analytics.topExpenseCategories)}
      </section>

      <section class="layout-2 section">
        <article class="card">
          <h3>Nova conta bancária</h3>
          <form id="bank-account-form" class="form-grid four">
            <div class="field"><label>Nome da conta</label><input name="name" placeholder="Ex.: Conta Principal" required /></div>
            <div class="field"><label>Banco</label><input name="bankName" placeholder="Ex.: Banco do Brasil" required /></div>
            <div class="field"><label>Agência</label><input name="branch" /></div>
            <div class="field"><label>Número da conta</label><input name="accountNumber" /></div>
            <div class="field"><label>Tipo</label><select name="type"><option>Conta Corrente</option><option>Poupança</option><option>Caixa Interno</option></select></div>
            <div class="field"><label>Saldo inicial</label><input name="initialBalance" type="number" step="0.01" value="0" /></div>
            <div class="field"><label>Status</label><select name="status"><option>Ativa</option><option>Inativa</option></select></div>
            <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">Salvar conta bancária</button></div>
          </form>
        </article>
        <article class="card">
          <div class="spread"><h3>Lançamento manual no caixa</h3>${clinicScopeBadge('Clínica ativa')}</div>
          <form id="cash-entry-form" class="form-grid four">
            <datalist id="expense-categories-list">${categorySuggestions}</datalist>
            <div class="field"><label>Data</label><input name="movementDate" type="date" value="${todayIso()}" /></div>
            <div class="field"><label>Tipo</label><select name="direction"><option>Entrada</option><option>Saída</option></select></div>
            <div class="field"><label>Categoria</label><input name="category" list="expense-categories-list" placeholder="Ex.: Aluguel, Internet, Marketing" /></div>
            <div class="field"><label>Conta bancária</label><select name="bankAccountId">${(state.bankAccounts || []).map(a => `<option value="${a.id}">${safe(a.name)}</option>`).join('')}</select></div>
            ${currentClinicScopeName() ? `<div class="field"><label>Clínica</label><input value="${safe(currentClinicScopeName())}" readonly /><input type="hidden" name="clinicName" value="${safe(currentClinicScopeName())}" /></div>` : `<div class="field"><label>Clínica</label><select name="clinicName"><option>Todas as clínicas</option>${state.clinics.map(c => `<option>${safe(c.name)}</option>`).join('')}</select></div>`}
            <div class="field"><label>Descrição</label><input name="description" placeholder="Ex.: Transferência, retirada, depósito" required /></div>
            <div class="field"><label>Valor</label><input name="amount" type="number" step="0.01" required /></div>
            <div class="field"><label>&nbsp;</label><button class="btn success" type="submit">Lançar no caixa</button></div>
          </form>
          <p class="footer-note">Para despesas, informe a categoria. O Dashboard e o Caixa passam a classificar automaticamente as saídas por categoria, com gráfico e evolução mensal.</p>
        </article>
      </section>
      ${simpleTableSection('Contas bancárias',['Código','Conta','Banco','Tipo','Saldo inicial','Saldo atual','Status','Ações'],bankRows,'Nenhuma conta bancária cadastrada.')}
      ${simpleTableSection('Movimentações de caixa',['Código','Data','Tipo','Categoria','Descrição','Conta','Clínica','Valor','Origem','Ações'],cashRows,'Nenhuma movimentação de caixa registrada.')}
    `, 'Caixa & Bancos', 'Controle de caixa integrado com recebimentos, pagamentos e contas bancárias');
  }


  function buildReportsPdfBody() {
    const type = state.meta.reportType || 'summary';
    const meta = reportTypeMeta(type);
    const receivables = filteredReportReceivables();
    const payables = filteredReportPayables();
    const cashEntries = filteredReportCashEntries();
    const patients = filteredReportPatients();
    const appointments = filteredReportAppointments();
    const receivablePlanned = receivables.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
    const receivablePaid = receivables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const receivableOverdue = receivables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const payablePlanned = payables.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
    const payablePaid = payables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const payableOverdue = payables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const totalInflow = cashEntries.filter(item => item.direction === 'Entrada').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalOutflow = cashEntries.filter(item => item.direction === 'Saída').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const bankSummary = (state.bankAccounts || []).map(account => {
      const items = cashEntries.filter(entry => String(entry.bankAccountId || '') === String(account.id));
      return {
        name: account.name,
        inflow: items.filter(item => item.direction === 'Entrada').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        outflow: items.filter(item => item.direction === 'Saída').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        balance: items.reduce((sum, item) => sum + (item.direction === 'Saída' ? -Number(item.amount || 0) : Number(item.amount || 0)), Number(account.initialBalance || 0))
      };
    }).filter(item => item.inflow || item.outflow || item.balance);
    const clinicSummaryMap = new Map();
    [...receivables, ...payables].forEach(item => {
      const name = item.clinicName || 'Sem clínica';
      const bucket = clinicSummaryMap.get(name) || { clinicName: name, receivablePlanned: 0, receivablePaid: 0, payablePlanned: 0, payablePaid: 0 };
      if ('patientName' in item) {
        bucket.receivablePlanned += Number(item.amountPlanned || 0);
        bucket.receivablePaid += Number(item.amountPaid || 0);
      } else {
        bucket.payablePlanned += Number(item.amountPlanned || 0);
        bucket.payablePaid += Number(item.amountPaid || 0);
      }
      clinicSummaryMap.set(name, bucket);
    });
    const clinicSummary = [...clinicSummaryMap.values()].sort((a,b) => a.clinicName.localeCompare(b.clinicName, 'pt-BR'));
    const categorySummaryMap = new Map();
    payables.forEach(item => {
      const label = normalizeExpenseCategory(item.category);
      const bucket = categorySummaryMap.get(label) || { label, planned: 0, paid: 0, pending: 0, count: 0 };
      bucket.planned += Number(item.amountPlanned || 0);
      bucket.paid += Number(item.amountPaid || 0);
      bucket.pending += Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0);
      bucket.count += 1;
      categorySummaryMap.set(label, bucket);
    });
    const categorySummary = [...categorySummaryMap.values()].sort((a,b) => b.planned - a.planned || a.label.localeCompare(b.label, 'pt-BR'));
    const tableSection = (title, headers, rows, emptyText) => `
      <h2>${safe(title)}</h2>
      ${rows.length ? `<div class="table-wrap"><table style="width:100%;border-collapse:collapse"><thead><tr>${headers.map(head => `<th style="text-align:left;border-bottom:1px solid #d8e1ec;padding:8px">${safe(head)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : `<div class="alert-box">${safe(emptyText)}</div>`}`;
    const metricsByType = {
      summary: [
        { label: 'Contas a receber · previsto', value: money(receivablePlanned) },
        { label: 'Contas a receber · recebido', value: money(receivablePaid) },
        { label: 'Contas a pagar · previsto', value: money(payablePlanned) },
        { label: 'Contas a pagar · pago', value: money(payablePaid) },
        { label: 'Caixa · entradas', value: money(totalInflow) },
        { label: 'Caixa · saídas', value: money(totalOutflow) }
      ],
      patients: [
        { label: 'Pacientes no filtro', value: String(patients.length) },
        { label: 'Ativos', value: String(patients.filter(item => (item.status || '').toLowerCase() === 'ativo').length) },
        { label: 'Inativos', value: String(patients.filter(item => (item.status || '').toLowerCase() === 'inativo').length) },
        { label: 'Mensalidade total', value: money(patients.reduce((sum, item) => sum + Number(item.monthlyFee || 0), 0)) }
      ],
      appointments: [
        { label: 'Agendamentos no período', value: String(appointments.length) },
        { label: 'Agendados', value: String(appointments.filter(item => item.status === 'AGENDADO').length) },
        { label: 'Realizados', value: String(appointments.filter(item => item.status === 'REALIZADO').length) },
        { label: 'Faltou / Cancelado', value: String(appointments.filter(item => item.status === 'FALTOU' || item.status === 'CANCELADO').length) }
      ],
      receivables: [
        { label: 'Previsto', value: money(receivablePlanned) },
        { label: 'Recebido', value: money(receivablePaid) },
        { label: 'Em aberto', value: money(Math.max(receivablePlanned - receivablePaid, 0)) },
        { label: 'Atrasado', value: money(receivableOverdue) }
      ],
      payables: [
        { label: 'Previsto', value: money(payablePlanned) },
        { label: 'Pago', value: money(payablePaid) },
        { label: 'Pendente', value: money(Math.max(payablePlanned - payablePaid, 0)) },
        { label: 'Em atraso', value: money(payableOverdue) }
      ],
      cash: [
        { label: 'Entradas', value: money(totalInflow) },
        { label: 'Saídas', value: money(totalOutflow) },
        { label: 'Saldo do período', value: money(totalInflow - totalOutflow) },
        { label: 'Movimentações', value: String(cashEntries.length) }
      ]
    };
    const metrics = metricsByType[type] || metricsByType.summary;
    const sectionsByType = {
      summary: `
        ${tableSection('Resumo por clínica', ['Clínica','Receber previsto','Recebido','Pagar previsto','Pago','Saldo'], clinicSummary.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.receivablePlanned)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.receivablePaid)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.payablePlanned)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.payablePaid)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money((item.receivablePaid || 0) - (item.payablePaid || 0))}</td></tr>`), 'Sem dados por clínica no período selecionado.')}
        ${tableSection('Resumo por categoria de despesa', ['Categoria','Previsto','Pago','Pendente'], categorySummary.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.label)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.planned)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.paid)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.pending)}</td></tr>`), 'Sem categorias de despesa no período selecionado.')}
        ${tableSection('Resumo por banco', ['Conta bancária','Entradas','Saídas','Saldo'], bankSummary.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.name)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.inflow)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.outflow)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.balance)}</td></tr>`), 'Sem movimentações bancárias no período selecionado.')}`,
      patients: tableSection('Pacientes cadastrados', ['Paciente','Clínica','Profissional','Frequência','Dia/Horário','Mensalidade','Status','Cadastro'], patients.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.name)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.professionalName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.frequency || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(`${item.weekday || '—'} ${item.time || ''}`.trim())}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.monthlyFee || 0)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.status || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${fmtDate(String(item.registrationDate || item.createdAt || '').slice(0,10))}</td></tr>`), 'Sem pacientes para o filtro selecionado.'),
      appointments: tableSection('Agendamentos', ['Código','Data','Hora','Paciente','Profissional','Clínica','Status'], appointments.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.code)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${fmtDate(item.date)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.time || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.patientName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.professionalName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.status || '—')}</td></tr>`), 'Sem agendamentos no período selecionado.'),
      receivables: tableSection('Contas a receber', ['Código','Vencimento','Paciente','Clínica','Previsto','Recebido','Status'], receivables.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.code)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${fmtDate(item.dueDate)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.patientName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.amountPlanned)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.amountPaid)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.status)}</td></tr>`), 'Sem contas a receber no período selecionado.'),
      payables: tableSection('Contas a pagar', ['Código','Vencimento','Categoria','Descrição','Clínica','Previsto','Pago','Status'], payables.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.code)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${fmtDate(item.dueDate)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(normalizeExpenseCategory(item.category))}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.description || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.amountPlanned)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.amountPaid)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.status)}</td></tr>`), 'Sem contas a pagar no período selecionado.'),
      cash: `
        ${tableSection('Resumo por banco', ['Conta bancária','Entradas','Saídas','Saldo'], bankSummary.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.name)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.inflow)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.outflow)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.balance)}</td></tr>`), 'Sem movimentações bancárias no período selecionado.')}
        ${tableSection('Movimentações de caixa', ['Código','Data','Tipo','Categoria','Descrição','Conta','Clínica','Valor','Origem'], cashEntries.map(item => `<tr><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.code)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${fmtDate(item.movementDate)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.direction || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(normalizeExpenseCategory(item.category))}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.description || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.bankAccountName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.clinicName || '—')}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${money(item.amount || 0)}</td><td style="padding:8px;border-bottom:1px solid #edf2f7">${safe(item.originType || 'manual')}</td></tr>`), 'Sem movimentações de caixa no período selecionado.')}`
    };
    const headerSubtitle = `Tipo: ${meta.label} · Período: ${fmtDate(state.meta.reportStartDate || todayIso())} até ${fmtDate(state.meta.reportEndDate || todayIso())} · Clínica: ${safe(state.meta.reportClinicFilter || 'Todas as clínicas')} · Banco: ${safe(state.meta.reportBankFilter || 'Todas as contas')}`;
    return `
      <div class="print-header">${state.settings.logoDataUrl ? `<img src="${safe(state.settings.logoDataUrl)}" alt="Logo da clínica" style="width:68px;height:68px;object-fit:cover;border-radius:16px;border:2px solid rgba(255,255,255,.25);margin-bottom:12px" />` : ''}
        <h1>${safe(meta.label)}</h1>
        <div class="sub">${safe(state.settings.companyName || state.settings.brandName || 'Agenda Clínica')}<br>${headerSubtitle}</div>
      </div>
      <div class="print-body">
        <p class="meta">${safe(meta.subtitle)}</p>
        <div class="print-grid">
          ${metrics.map(item => `<div class="print-card"><label>${safe(item.label)}</label><div>${safe(item.value)}</div></div>`).join('')}
        </div>
        ${sectionsByType[type] || sectionsByType.summary}
        <div class="footer">Relatório gerado em ${new Date().toLocaleString('pt-BR')} · ${safe(state.settings.brandName || 'Agenda Clínica')}</div>
      </div>`;
  }
  function reportsView() {
    const type = state.meta.reportType || 'summary';
    const typeMeta = reportTypeMeta(type);
    const receivables = filteredReportReceivables();
    const payables = filteredReportPayables();
    const cashEntries = filteredReportCashEntries();
    const patients = filteredReportPatients();
    const appointments = filteredReportAppointments();
    const bankOptions = ['<option>Todas as contas</option>'].concat((state.bankAccounts || []).map(account => `<option ${state.meta.reportBankFilter===account.name?'selected':''}>${safe(account.name)}</option>`)).join('');
    const clinicOptions = ['<option>Todas as clínicas</option>'].concat((state.clinics || []).map(clinic => `<option ${state.meta.reportClinicFilter===clinic.name?'selected':''}>${safe(clinic.name)}</option>`)).join('');
    const reportTypeOptions = [
      ['summary', 'Resumo executivo'],
      ['patients', 'Pacientes cadastrados'],
      ['appointments', 'Agendamentos'],
      ['receivables', 'Contas a receber'],
      ['payables', 'Contas a pagar'],
      ['cash', 'Caixa & bancos']
    ].map(([value, label]) => `<option value="${value}" ${type===value?'selected':''}>${label}</option>`).join('');
    const receivablePlanned = receivables.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
    const receivablePaid = receivables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const receivableOverdue = receivables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const payablePlanned = payables.reduce((sum, item) => sum + Number(item.amountPlanned || 0), 0);
    const payablePaid = payables.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const payableOverdue = payables.filter(item => item.status === 'Atrasado').reduce((sum, item) => sum + Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0), 0);
    const totalInflow = cashEntries.filter(item => item.direction === 'Entrada').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalOutflow = cashEntries.filter(item => item.direction === 'Saída').reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const bankSummary = (state.bankAccounts || []).map(account => {
      const items = cashEntries.filter(entry => String(entry.bankAccountId || '') === String(account.id));
      return {
        name: account.name,
        inflow: items.filter(item => item.direction === 'Entrada').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        outflow: items.filter(item => item.direction === 'Saída').reduce((sum, item) => sum + Number(item.amount || 0), 0),
        balance: items.reduce((sum, item) => sum + (item.direction === 'Saída' ? -Number(item.amount || 0) : Number(item.amount || 0)), Number(account.initialBalance || 0))
      };
    }).filter(item => item.inflow || item.outflow || item.balance);
    const clinicSummaryMap = new Map();
    [...receivables, ...payables].forEach(item => {
      const name = item.clinicName || 'Sem clínica';
      const bucket = clinicSummaryMap.get(name) || { clinicName: name, receivablePlanned: 0, receivablePaid: 0, payablePlanned: 0, payablePaid: 0 };
      if ('patientName' in item) {
        bucket.receivablePlanned += Number(item.amountPlanned || 0);
        bucket.receivablePaid += Number(item.amountPaid || 0);
      } else {
        bucket.payablePlanned += Number(item.amountPlanned || 0);
        bucket.payablePaid += Number(item.amountPaid || 0);
      }
      clinicSummaryMap.set(name, bucket);
    });
    const clinicRows = [...clinicSummaryMap.values()].sort((a,b) => a.clinicName.localeCompare(b.clinicName, 'pt-BR')).map(item => `<tr><td>${safe(item.clinicName)}</td><td>${money(item.receivablePlanned)}</td><td>${money(item.receivablePaid)}</td><td>${money(item.payablePlanned)}</td><td>${money(item.payablePaid)}</td><td>${money((item.receivablePaid || 0) - (item.payablePaid || 0))}</td></tr>`);
    const categorySummaryMap = new Map();
    payables.forEach(item => {
      const label = normalizeExpenseCategory(item.category);
      const bucket = categorySummaryMap.get(label) || { label, planned: 0, paid: 0, pending: 0, count: 0 };
      bucket.planned += Number(item.amountPlanned || 0);
      bucket.paid += Number(item.amountPaid || 0);
      bucket.pending += Math.max(Number(item.amountPlanned || 0) - Number(item.amountPaid || 0), 0);
      bucket.count += 1;
      categorySummaryMap.set(label, bucket);
    });
    const categoryRows = [...categorySummaryMap.values()].sort((a,b) => b.planned - a.planned || a.label.localeCompare(b.label, 'pt-BR')).map(item => `<tr><td>${safe(item.label)}</td><td>${money(item.planned)}</td><td>${money(item.paid)}</td><td>${money(item.pending)}</td><td>${safe(String(item.count))}</td></tr>`);
    const bankRows = bankSummary.map(item => `<tr><td>${safe(item.name)}</td><td>${money(item.inflow)}</td><td>${money(item.outflow)}</td><td>${money(item.balance)}</td></tr>`);
    const patientRows = patients.map(item => `<tr><td>${safe(item.name)}</td><td>${safe(item.clinicName || '—')}</td><td>${safe(item.professionalName || '—')}</td><td>${safe(item.frequency || '—')}</td><td>${safe(`${item.weekday || '—'} ${item.time || ''}`.trim())}</td><td>${money(item.monthlyFee || 0)}</td><td>${safe(item.status || '—')}</td><td>${fmtDate(String(item.registrationDate || item.createdAt || '').slice(0,10))}</td></tr>`);
    const appointmentRows = appointments.map(item => `<tr><td>${safe(item.code)}</td><td>${fmtDate(item.date)}</td><td>${safe(item.time || '—')}</td><td>${safe(item.patientName || '—')}</td><td>${safe(item.professionalName || '—')}</td><td>${safe(item.clinicName || '—')}</td><td>${safe(item.status || '—')}</td></tr>`);
    const receivableRows = receivables.map(item => `<tr><td>${safe(item.code)}</td><td>${fmtDate(item.dueDate)}</td><td>${safe(item.patientName || '—')}</td><td>${safe(item.clinicName || '—')}</td><td>${money(item.amountPlanned)}</td><td>${money(item.amountPaid)}</td><td>${safe(item.status)}</td></tr>`);
    const payableRows = payables.map(item => `<tr><td>${safe(item.code)}</td><td>${fmtDate(item.dueDate)}</td><td>${safe(normalizeExpenseCategory(item.category))}</td><td>${safe(item.description || '—')}</td><td>${safe(item.clinicName || '—')}</td><td>${money(item.amountPlanned)}</td><td>${money(item.amountPaid)}</td><td>${safe(item.status)}</td></tr>`);
    const cashRows = cashEntries.map(item => `<tr><td>${safe(item.code)}</td><td>${fmtDate(item.movementDate)}</td><td>${safe(item.direction || '—')}</td><td>${safe(normalizeExpenseCategory(item.category))}</td><td>${safe(item.description || '—')}</td><td>${safe(item.bankAccountName || '—')}</td><td>${safe(item.clinicName || '—')}</td><td>${money(item.amount || 0)}</td><td>${safe(item.originType || 'manual')}</td></tr>`);
    const cardsByType = {
      summary: `
        <article class="card"><div class="muted">Contas a receber · previsto</div><div class="kpi">${money(receivablePlanned)}</div><span class="badge info">Período filtrado</span></article>
        <article class="card"><div class="muted">Contas a receber · recebido</div><div class="kpi">${money(receivablePaid)}</div><span class="badge ok">Inadimplência ${money(receivableOverdue)}</span></article>
        <article class="card"><div class="muted">Contas a pagar · previsto</div><div class="kpi">${money(payablePlanned)}</div><span class="badge warn">Período filtrado</span></article>
        <article class="card"><div class="muted">Contas a pagar · pago</div><div class="kpi">${money(payablePaid)}</div><span class="badge ${payableOverdue ? 'danger' : 'ok'}">Em atraso ${money(payableOverdue)}</span></article>
        <article class="card"><div class="muted">Caixa · entradas</div><div class="kpi">${money(totalInflow)}</div><span class="badge info">Movimentos filtrados</span></article>
        <article class="card"><div class="muted">Caixa · saídas</div><div class="kpi">${money(totalOutflow)}</div><span class="badge ${totalInflow-totalOutflow >= 0 ? 'ok' : 'danger'}">Saldo ${money(totalInflow-totalOutflow)}</span></article>`,
      patients: `
        <article class="card"><div class="muted">Pacientes no filtro</div><div class="kpi">${patients.length}</div><span class="badge info">Cadastro</span></article>
        <article class="card"><div class="muted">Ativos</div><div class="kpi">${patients.filter(item => (item.status || '').toLowerCase() === 'ativo').length}</div><span class="badge ok">Em acompanhamento</span></article>
        <article class="card"><div class="muted">Inativos</div><div class="kpi">${patients.filter(item => (item.status || '').toLowerCase() === 'inativo').length}</div><span class="badge warn">Base histórica</span></article>
        <article class="card"><div class="muted">Mensalidade total</div><div class="kpi">${money(patients.reduce((sum, item) => sum + Number(item.monthlyFee || 0), 0))}</div><span class="badge info">Valor cadastral</span></article>`,
      appointments: `
        <article class="card"><div class="muted">Agendamentos no período</div><div class="kpi">${appointments.length}</div><span class="badge info">Agenda operacional</span></article>
        <article class="card"><div class="muted">Agendados</div><div class="kpi">${appointments.filter(item => item.status === 'AGENDADO').length}</div><span class="badge info">Pendentes</span></article>
        <article class="card"><div class="muted">Realizados</div><div class="kpi">${appointments.filter(item => item.status === 'REALIZADO').length}</div><span class="badge ok">Concluídos</span></article>
        <article class="card"><div class="muted">Faltou / Cancelado</div><div class="kpi">${appointments.filter(item => item.status === 'FALTOU' || item.status === 'CANCELADO').length}</div><span class="badge warn">Atenção</span></article>`,
      receivables: `
        <article class="card"><div class="muted">Previsto</div><div class="kpi">${money(receivablePlanned)}</div><span class="badge info">Carteira</span></article>
        <article class="card"><div class="muted">Recebido</div><div class="kpi">${money(receivablePaid)}</div><span class="badge ok">Caixa</span></article>
        <article class="card"><div class="muted">Em aberto</div><div class="kpi">${money(Math.max(receivablePlanned - receivablePaid, 0))}</div><span class="badge warn">Pendente</span></article>
        <article class="card"><div class="muted">Atrasado</div><div class="kpi">${money(receivableOverdue)}</div><span class="badge danger">Cobrança</span></article>`,
      payables: `
        <article class="card"><div class="muted">Previsto</div><div class="kpi">${money(payablePlanned)}</div><span class="badge info">Despesas</span></article>
        <article class="card"><div class="muted">Pago</div><div class="kpi">${money(payablePaid)}</div><span class="badge ok">Baixado</span></article>
        <article class="card"><div class="muted">Pendente</div><div class="kpi">${money(Math.max(payablePlanned - payablePaid, 0))}</div><span class="badge warn">Aberto</span></article>
        <article class="card"><div class="muted">Em atraso</div><div class="kpi">${money(payableOverdue)}</div><span class="badge danger">Urgente</span></article>`,
      cash: `
        <article class="card"><div class="muted">Entradas</div><div class="kpi">${money(totalInflow)}</div><span class="badge info">Movimentos</span></article>
        <article class="card"><div class="muted">Saídas</div><div class="kpi">${money(totalOutflow)}</div><span class="badge warn">Despesas</span></article>
        <article class="card"><div class="muted">Saldo do período</div><div class="kpi">${money(totalInflow-totalOutflow)}</div><span class="badge ${(totalInflow-totalOutflow) >= 0 ? 'ok' : 'danger'}">Resultado</span></article>
        <article class="card"><div class="muted">Movimentações</div><div class="kpi">${cashEntries.length}</div><span class="badge info">Lançamentos</span></article>`
    };
    const sectionsByType = {
      summary: `
        <section class="layout-2 section">
          ${simpleTableSection('Resumo por clínica',['Clínica','Receber previsto','Recebido','Pagar previsto','Pago','Saldo'],clinicRows,'Sem dados por clínica no período selecionado.')}
          ${simpleTableSection('Resumo por banco',['Conta bancária','Entradas','Saídas','Saldo no período'],bankRows,'Sem movimentações bancárias no período selecionado.')}
        </section>
        <section class="layout-2 section">
          ${simpleTableSection('Resumo por categoria',['Categoria','Previsto','Pago','Pendente','Lançamentos'],categoryRows,'Sem categorias de despesa no período selecionado.')}
          ${simpleTableSection('Pacientes cadastrados',['Paciente','Clínica','Profissional','Frequência','Dia/Horário','Mensalidade','Status','Cadastro'],patientRows,'Sem pacientes para o filtro selecionado.')}
        </section>`,
      patients: simpleTableSection('Pacientes cadastrados',['Paciente','Clínica','Profissional','Frequência','Dia/Horário','Mensalidade','Status','Cadastro'],patientRows,'Sem pacientes para o filtro selecionado.'),
      appointments: simpleTableSection('Agendamentos',['Código','Data','Hora','Paciente','Profissional','Clínica','Status'],appointmentRows,'Sem agendamentos no período selecionado.'),
      receivables: simpleTableSection('Contas a receber',['Código','Vencimento','Paciente','Clínica','Previsto','Recebido','Status'],receivableRows,'Sem contas a receber no período selecionado.'),
      payables: simpleTableSection('Contas a pagar',['Código','Vencimento','Categoria','Descrição','Clínica','Previsto','Pago','Status'],payableRows,'Sem contas a pagar no período selecionado.'),
      cash: `
        ${simpleTableSection('Resumo por banco',['Conta bancária','Entradas','Saídas','Saldo no período'],bankRows,'Sem movimentações bancárias no período selecionado.')}
        ${simpleTableSection('Movimentações de caixa',['Código','Data','Tipo','Categoria','Descrição','Conta','Clínica','Valor','Origem'],cashRows,'Sem movimentações de caixa no período selecionado.')}`
    };
    return shell(`
      <section class="card">
        <div class="spread"><h3>Filtros dos relatórios</h3><span class="chip">${safe(typeMeta.label)}</span></div>
        <form id="report-filter-form" class="form-grid four">
          <div class="field"><label>Tipo de relatório</label><select name="reportType">${reportTypeOptions}</select></div>
          <div class="field"><label>Data inicial</label><input name="reportStartDate" type="date" value="${safe(state.meta.reportStartDate || '')}" /></div>
          <div class="field"><label>Data final</label><input name="reportEndDate" type="date" value="${safe(state.meta.reportEndDate || todayIso())}" /></div>
          <div class="field"><label>Clínica</label><select name="reportClinicFilter">${clinicOptions}</select></div>
          <div class="field"><label>Conta bancária</label><select name="reportBankFilter">${bankOptions}</select></div>
          <div class="field"><label>&nbsp;</label><button class="btn primary" type="submit">Atualizar relatório</button></div>
          <div class="field"><label>&nbsp;</label><button class="btn ghost" id="export-report-csv" type="button">Exportar CSV do tipo</button></div>
          <div class="field"><label>&nbsp;</label><button class="btn warn" id="report-print-pdf" type="button">🖨️ Imprimir / Exportar PDF</button></div>
        </form>
        <p class="footer-note">${safe(typeMeta.subtitle)} Use o seletor de tipo para alternar entre pacientes cadastrados, agendamentos, contas a receber, contas a pagar, caixa & bancos e resumo executivo. Observação: a geração de PDF usa a janela de impressão do sistema/navegador; ela não depende de detectar o Acrobat Reader.</p>
      </section>
      <section class="card-grid dashboard-kpis">
        ${cardsByType[type] || cardsByType.summary}
      </section>
      ${sectionsByType[type] || sectionsByType.summary}
    `, 'Relatórios', 'Relatórios separados por tipo, com CSV e PDF do bloco selecionado.');
  }

  function agendaView() {
    const range = getAgendaRange();
    const appts = filteredAppointments().filter(a => a.date >= toIso(range.start) && a.date <= toIso(range.end));
    const weekly = range.mode !== 'Mês inteiro';
    const headerDays = weekly ? Array.from({length:7}, (_, i) => addDays(range.start, i)) : [];
    const statusBadgeClass = status => ({ AGENDADO: 'info', REALIZADO: 'ok', FALTOU: 'warn', CANCELADO: 'danger' }[status] || 'info');
    const statusCardClass = status => ({ AGENDADO: 'status-agendado', REALIZADO: 'status-realizado', FALTOU: 'status-faltou', CANCELADO: 'status-cancelado' }[status] || 'status-agendado');
    const googleMetrics = googleCalendarPeriodMetrics();
    const actionButton = (appointment, status, shortLabel, fullLabel) => `<button type="button" class="appt-action appt-action-${status.toLowerCase()} ${appointment.status === status ? 'is-active' : ''} js-appointment-status-action" data-id="${safe(appointment.id)}" data-status="${status}" title="${fullLabel}" aria-label="${fullLabel}">${shortLabel}</button>`;
    const rescheduleButton = appointment => state.meta.agendaMode === 'Semana atual' ? `<button type="button" class="appt-action appt-action-agendado js-appointment-reschedule" data-id="${safe(appointment.id)}" onclick="event.preventDefault();event.stopPropagation();window.quickRescheduleAppointment && window.quickRescheduleAppointment(this.dataset.id);return false;" title="Remarcar sessão" aria-label="Remarcar sessão">Rm</button>` : '';
    const actionRow = appointment => `<div class="appt-actions">${rescheduleButton(appointment)}${actionButton(appointment, 'AGENDADO', 'Ag', 'Marcar como Agendado')}${actionButton(appointment, 'REALIZADO', 'Re', 'Marcar como Realizado')}${actionButton(appointment, 'FALTOU', 'Fa', 'Marcar como Faltou')}${actionButton(appointment, 'CANCELADO', 'Ca', 'Marcar como Cancelado')}</div>`;
    const appointmentCard = a => {
      const wa = whatsappLink(a.phone, `Olá ${a.patientName}, lembrando da sessão do dia ${fmtDate(a.date)} às ${a.time}.`);
      return `
      <div class="appt appt-card ${statusCardClass(a.status)} ${a.googleSyncError ? 'google-sync-failed' : ''}">
        <button type="button" class="appt-main js-appointment-whatsapp" data-id="${safe(a.id)}" title="Enviar lembrete no WhatsApp" aria-label="Enviar lembrete no WhatsApp" style="width:100%;background:none;border:0;padding:0;text-align:left;color:inherit;cursor:${wa ? 'pointer' : 'not-allowed'}">
          <strong>${safe(a.patientName)}</strong><br>
          ${safe(a.professionalName)}<br>
          <div class="appt-badges-row"><span class="badge ${statusBadgeClass(a.status)}">${safe(a.status)}</span>${googleCalendarAppointmentBadge(a)}</div>
          <small style="display:inline-block;margin-top:6px;color:#1a73e8;font-weight:700">${wa ? '📲 Enviar lembrete no WhatsApp' : 'Sem WhatsApp cadastrado'}</small>
        </button>
        ${googleCalendarAppointmentInline(a)}
        ${actionRow(a)}
      </div>`;
    };
    const appointmentCardMonth = a => {
      const wa = whatsappLink(a.phone, `Olá ${a.patientName}, lembrando da sessão do dia ${fmtDate(a.date)} às ${a.time}.`);
      return `
      <div class="appt appt-card appt-card-month ${statusCardClass(a.status)} ${a.googleSyncError ? 'google-sync-failed' : ''}">
        <button type="button" class="appt-main js-appointment-whatsapp" data-id="${safe(a.id)}" title="Enviar lembrete no WhatsApp" aria-label="Enviar lembrete no WhatsApp" style="width:100%;background:none;border:0;padding:0;text-align:left;color:inherit;cursor:${wa ? 'pointer' : 'not-allowed'}">
          <strong>${safe(a.time)}</strong> — ${safe(a.patientName)}<br>
          ${safe(a.professionalName)} · ${safe(a.clinicName)}<br>
          <div class="appt-badges-row"><span class="badge ${statusBadgeClass(a.status)}">${safe(a.status)}</span>${googleCalendarAppointmentBadge(a)}</div>
          <small style="display:inline-block;margin-top:6px;color:#1a73e8;font-weight:700">${wa ? '📲 Enviar lembrete no WhatsApp' : 'Sem WhatsApp cadastrado'}</small>
        </button>
        ${googleCalendarAppointmentInline(a)}
        ${actionRow(a)}
      </div>`;
    };
    const weekHtml = weekly ? `
      <div class="week-grid section">
        <div class="head">Horário</div>${headerDays.map(d => `<div class="head">${safe(d.toLocaleDateString('pt-BR',{weekday:'short', day:'2-digit', month:'2-digit'}))}</div>`).join('')}
        ${timeSlots.map(slot => `
          <div class="time">${slot}</div>
          ${headerDays.map(day => {
            const items = appts.filter(a => a.date === toIso(day) && a.time === slot);
            return `<div class="slot ${items.length ? 'busy' : ''}">${items.map(appointmentCard).join('')}</div>`;
          }).join('')}
        `).join('')}
      </div>` : '';
    const grouped = {};
    appts.forEach(a => { (grouped[a.date] ||= []).push(a); });
    const monthHtml = !weekly ? `<div class="month-list section">${Object.keys(grouped).sort().map(date => `<article class="month-day has-items"><h4>${fmtDate(date)}</h4>${grouped[date].map(appointmentCardMonth).join('')}</article>`).join('') || '<div class="empty">Nenhum agendamento no mês selecionado.</div>'}</div>` : '';
    return shell(`
      <section class="card">
        <div class="agenda-toolbar">
          <div class="field"><label>Modo</label><select id="agenda-mode"><option ${state.meta.agendaMode==='Semana atual'?'selected':''}>Semana atual</option><option ${state.meta.agendaMode==='Semana anterior'?'selected':''}>Semana anterior</option><option ${state.meta.agendaMode==='Próxima semana'?'selected':''}>Próxima semana</option><option ${state.meta.agendaMode==='Mês inteiro'?'selected':''}>Mês inteiro</option></select></div>
          <div class="field"><label>Data de referência</label><input id="agenda-ref" type="date" value="${safe(state.meta.agendaRefDate)}" /></div>
          <div class="field"><label>Período</label><div class="chip">${fmtDate(range.start)} → ${fmtDate(range.end)}</div></div>
        </div>
        <div class="google-ops-summary section">
          <span class="chip">📅 Sincronizados no Google: ${googleMetrics.synced}/${googleMetrics.total}</span>
          <span class="chip">⏳ Pendentes: ${googleMetrics.pending}</span>
          <span class="chip">⚠ Falhas reais: ${googleMetrics.failed}</span>
          <span class="chip">🚫 Cancelados: ${googleMetrics.canceled}</span>
          <span class="chip">Última sincronização: ${safe(state.settings.googleCalendarLastSyncAt ? new Date(state.settings.googleCalendarLastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizado')}</span>
        </div>
        <p class="footer-note">A Agenda Visual agora mostra também falha real de sincronização com destaque visual vermelho. Quando aparecer “Falha no Google” ou “Pendente no Google”, você pode usar “Tentar novamente” ou “Enviar agora” no próprio cartão. Semana atual, anterior e próxima sempre partem da data atual do computador. O modo mês inteiro usa a data de referência como base.</p>
      </section>
      ${weekHtml}
      ${monthHtml}
    `, 'Agenda Visual', 'Grade semanal e lista mensal com botões compactos de 1 clique e destaque visual por status');
  }

  function auditView() {
    const rows = state.audits.map(a => `<tr><td>${new Date(a.at).toLocaleString('pt-BR')}</td><td>${safe(a.actor)}</td><td>${safe(a.role || '')}</td><td>${safe(a.route || '')}</td><td>${safe(a.entity || '')}</td><td>${safe(a.action)}</td><td>${safe(a.detail)}</td><td class="code-chip">${safe(a.before || '')}</td><td class="code-chip">${safe(a.after || '')}</td></tr>`);
    return shell(simpleTableSection('Histórico de auditoria real',['Data/hora','Usuário','Perfil','Módulo','Entidade','Ação','Detalhe','Antes','Depois'],rows,'Sem eventos registrados.'), 'Auditoria Real', 'Rastreamento detalhado de login, criação, edição, exclusão, importação e configurações');
  }

  function renderGoogleCalendarCard() {
    const configured = googleCalendarConfigured();
    const connected = googleCalendarConnected();
    const enabled = googleCalendarEnabled();
    const stage = googleCalendarStage();
    const metrics = googleCalendarPeriodMetrics();
    const pendingAll = googleCalendarPendingAppointments();
    const statusText = googleCalendarStatusText();
    const calendarLabel = state.settings.googleCalendarCalendarSummary || googleCalendarCalendarId();
    const connectedAt = state.settings.googleCalendarConnectedAt ? new Date(state.settings.googleCalendarConnectedAt).toLocaleString('pt-BR') : 'Ainda não conectado';
    const validatedAt = state.settings.googleCalendarLastValidatedAt ? new Date(state.settings.googleCalendarLastValidatedAt).toLocaleString('pt-BR') : 'Ainda não testado';
    const lastSyncAt = state.settings.googleCalendarLastSyncAt ? new Date(state.settings.googleCalendarLastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizado';
    const autoLabel = enabled ? 'Ligada' : 'Desligada';
    return `
      <section class="card section google-calendar-card">
        <div class="spread"><h3>Google Calendar direto</h3><span class="badge ${stage === 'ready' ? 'ok' : stage === 'missing_credentials' ? 'info' : 'warn'}">${safe(statusText)}</span></div>
        <p>Fluxo final, sem complicação: você agenda no sistema e o evento vai direto para o Google Calendar. Se remarcar, o evento atualiza. Se cancelar, o evento é cancelado também.</p>
        <div class="google-steps-grid">
          <div class="google-step ${configured ? 'is-done' : ''}">
            <strong>1. Credenciais Google</strong>
            <small>${configured ? 'Arquivo OAuth já importado neste computador.' : 'Importe o arquivo JSON OAuth do Google.'}</small>
          </div>
          <div class="google-step ${connected ? 'is-done' : ''}">
            <strong>2. Conectar conta</strong>
            <small>${connected ? 'Conta Google autorizada com sucesso.' : 'Clique em Conectar Google para autorizar o acesso.'}</small>
          </div>
          <div class="google-step ${stage === 'ready' ? 'is-done' : ''}">
            <strong>3. Sincronização automática</strong>
            <small>${stage === 'ready' ? 'Agendamentos já podem ir automaticamente para o calendário.' : 'Quando estiver ligada, o sistema cria, atualiza e cancela sozinho.'}</small>
          </div>
        </div>
        <div class="google-metrics-grid section">
          <div class="google-metric-card"><span>Calendário de destino</span><strong>${safe(calendarLabel)}</strong><small>ID: ${safe(googleCalendarCalendarId())}</small></div>
          <div class="google-metric-card"><span>Sincronização automática</span><strong>${safe(autoLabel)}</strong><small>Agendou → cria · Remarcou → atualiza · Cancelou → cancela</small></div>
          <div class="google-metric-card"><span>Período atual</span><strong>${metrics.synced}/${metrics.total} sincronizado(s)</strong><small>${metrics.pending} pendente(s) · ${metrics.failed} falha(s) · ${metrics.canceled} cancelado(s)</small></div>
          <div class="google-metric-card"><span>Pendências globais</span><strong>${pendingAll.length} item(ns)</strong><small>${pendingAll.filter(item => !!item.googleSyncError).length} com falha real · ${pendingAll.filter(item => !item.googleSyncError).length} aguardando envio</small></div>
          <div class="google-metric-card"><span>Última sincronização</span><strong>${safe(lastSyncAt)}</strong><small>${safe(state.settings.googleCalendarLastSyncSummary || 'Nenhum resumo registrado ainda.')}</small></div>
        </div>
        <div class="form-grid three section">
          <div class="field"><label>Calendário de destino</label><input id="google-calendar-calendar-id" type="text" value="${safe(googleCalendarCalendarId())}" placeholder="primary" /></div>
          <div class="field"><label>Conectado neste computador</label><div class="chip">${safe(connectedAt)}</div></div>
          <div class="field"><label>Último teste da conexão</label><div class="chip">${safe(validatedAt)}</div></div>
        </div>
        <div class="notice google-flow-notice">${stage === 'ready' ? 'Tudo pronto: a partir de agora, ao agendar normalmente no sistema, o Google Calendar acompanha automaticamente.' : stage === 'connected_manual' ? 'Conta conectada, mas a sincronização automática está desligada. Ligue a opção para o envio automático funcionar.' : stage === 'ready_to_connect' ? 'Você já importou as credenciais. O próximo passo é apenas clicar em Conectar Google.' : 'Este app já está pronto para o Google Calendar. Falta apenas importar o arquivo de credenciais OAuth quando ele estiver disponível.'}</div>
        ${state.settings.googleCalendarCalendarTimeZone || state.settings.googleCalendarCalendarAccessRole ? `<div class="google-inline-meta"><span class="chip">Fuso do calendário: ${safe(state.settings.googleCalendarCalendarTimeZone || 'Não informado')}</span><span class="chip">Permissão: ${safe(state.settings.googleCalendarCalendarAccessRole || 'Não informada')}</span></div>` : ''}
        ${pendingAll.length ? `<div class="notice google-pending-notice section">Pendências detectadas: ${pendingAll.length} item(ns) aguardando envio ou correção. Use o botão “Sincronizar todos os pendentes” para regularizar de uma vez.</div>` : ''}
        ${state.settings.googleCalendarLastError ? `<div class="notice google-error-notice section">Último aviso do Google: ${safe(state.settings.googleCalendarLastError)}</div>` : ''}
        <div class="flex section">
          <button class="btn ghost" id="google-calendar-import-credentials">1) Importar credenciais Google</button>
          <button class="btn primary" id="google-calendar-connect">2) Conectar Google</button>
          <button class="btn success" id="google-calendar-test">Testar conexão</button>
          <button class="btn warn" id="google-calendar-sync-current">Sincronizar período atual agora</button>
          <button class="btn danger" id="google-calendar-sync-pending-all">Sincronizar todos os pendentes</button>
          <button class="btn ghost" id="google-calendar-disconnect">Desconectar</button>
        </div>
        <p class="footer-note">Dica prática: se você usa apenas seu calendário pessoal do Google, deixe <code>primary</code>. Depois disso, o uso do dia a dia continua igual: basta agendar normalmente no sistema.</p>
      </section>`;
  }

  function configView() {
    if (isDesktopApp()) {
      return shell(`
        <section class="layout-2">
          <article class="card">
            <h3>Painel Admin · Segurança e marca</h3>
            <form id="password-form" class="toolbar">
              <div class="field"><label>Nova senha ADMIN</label><input name="adminPassword" type="password" value="" placeholder="Deixe em branco para manter a atual" /></div>
              <div class="field"><label>Nova senha OPERADOR principal</label><input name="operatorPassword" type="password" value="" placeholder="Deixe em branco para manter a atual" /></div>
              <div class="field"><label>Nome comercial</label><input name="brandName" type="text" value="${safe(state.settings.brandName || 'Agenda Clínica')}" /></div>
              <div class="field"><label>Empresa</label><input name="companyName" type="text" value="${safe(state.settings.companyName || '')}" /></div>
              <div class="field"><label>Logomarca da clínica</label><input name="logoFile" type="file" accept="image/*" /></div>
              <div class="field"><label><input name="removeLogo" type="checkbox" value="1" /> Remover logomarca atual</label></div>
              <div class="field"><label>Email suporte</label><input name="supportEmail" type="email" value="${safe(state.settings.supportEmail || '')}" /></div>
              <div class="field"><label>Plano comercial</label><input name="commercialPlan" type="text" value="${safe(state.settings.commercialPlan || 'Essentials')}" /></div>
              ${renderAccessAutomationFields()}
              <button class="btn primary" type="submit">Salvar painel admin</button>
            </form>
          </article>
          <article class="card">
            <h3>Backup e importação</h3>
            <p>Use os botões da barra superior para exportar backup, restaurar dados e abrir a pasta local do sistema.</p>
            <div class="flex">
              <label class="btn warn" for="import-workbook">Importar planilha Excel</label>
              <input type="file" id="import-workbook" accept=".xlsm,.xlsx,.xls" hidden />
              <button class="btn ghost" id="open-data-folder-config">Abrir pasta de dados</button>
              <button class="btn ghost" id="about-btn-config">Sobre a versão desktop</button>
            </div>
            <p class="footer-note">Dados gravados localmente, com persistência automática e operação offline.</p>
          </article>
        </section>
        ${renderGoogleCalendarCard()}
        <section class="card section">
          <div class="spread"><h3>🔄 Backups automáticos com data/hora</h3><div style="display:flex;gap:8px"><button class="btn warn" id="manual-backup-btn">💾 Gerar backup + baixar agora</button></div></div>
          <p class="footer-note">🟢 Backup automático a cada <strong>30 minutos</strong> enquanto logado. 💾 "Gerar backup" também baixa o arquivo <code>.json</code> com data/hora na sua pasta de Downloads. Clique em "Restaurar" para voltar ao estado daquele momento ou "Baixar" para guardar o snapshot.</p>
          ${(() => { const backups = listAutoBackups(); return backups.length ? `<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Pacientes</th><th>Sessões</th><th>Agendamentos</th><th>Ações</th></tr></thead><tbody>${backups.map((b,i)=>`<tr class="autobackup-table-row"><td><strong>${safe(b.ts)}</strong></td><td>${b.patients ?? (b.data?.patients||[]).length}</td><td>${b.sessions ?? (b.data?.sessions||[]).length}</td><td>${b.appointments ?? (b.data?.appointments||[]).length}</td><td style="display:flex;gap:6px"><button class="btn ghost js-restore-autobackup" data-idx="${i}">↺ Restaurar</button><button class="btn info download-backup-btn js-download-autobackup" data-idx="${i}">↓ Baixar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum backup automático ainda. Use "Gerar backup + baixar agora" ou aguarde 30 minutos logado.</div>'; })()}
        </section>
        <section class="layout-2 section">
          <article class="card">
            <h3>Entrega comercial</h3>
            <p>Versão desktop pronta para instalação no Windows, sem depender de navegador, terminal, Python ou servidor local.</p>
            <div class="flex"><span class="chip">Desktop</span><span class="chip">Offline</span><span class="chip">Backup local</span><span class="chip">Auditoria</span><span class="chip">White-label</span></div>
            <p class="footer-note">Versão atual: ${safe(desktopInfo.version || '1.0.0')}.</p>
          </article>
          <article class="card">
            <h3>Ações administrativas</h3>
            <div class="flex">
              <button class="btn reset-appointments js-reset-module" data-module="appointments">Zerar agendamentos</button>
              <button class="btn reset-receivables js-reset-module" data-module="receivables">Zerar recebimentos</button>
              <button class="btn reset-payables js-reset-module" data-module="payables">Zerar pagamentos</button>
              <button class="btn reset-patients js-reset-module" data-module="patients">Zerar pacientes</button>
              <button class="btn danger" id="reset-app">Apagar tudo</button>
            </div>
            <p class="footer-note">As ações acima exigem perfil ADMIN.</p>
          </article>
        </section>
      `, 'Painel Admin', 'Versão desktop comercial, backup local e operação offline');
    }
    return shell(`
      <section class="layout-2">
        <article class="card">
          <h3>Painel Admin · Segurança, marca e SaaS</h3>
          <form id="password-form" class="toolbar">
            <div class="field"><label>Nova senha ADMIN</label><input name="adminPassword" type="password" value="" placeholder="Deixe em branco para manter a atual" /></div>
            <div class="field"><label>Nova senha OPERADOR principal</label><input name="operatorPassword" type="password" value="" placeholder="Deixe em branco para manter a atual" /></div>
            <div class="field"><label>Nome comercial</label><input name="brandName" type="text" value="${safe(state.settings.brandName || 'Agenda Clínica')}" /></div>
            <div class="field"><label>Empresa</label><input name="companyName" type="text" value="${safe(state.settings.companyName || '')}" /></div>
            <div class="field"><label>Logomarca da clínica</label><input name="logoFile" type="file" accept="image/*" /></div>
            <div class="field"><label><input name="removeLogo" type="checkbox" value="1" /> Remover logomarca atual</label></div>
            <div class="field"><label>Email suporte</label><input name="supportEmail" type="email" value="${safe(state.settings.supportEmail || '')}" /></div>
            <div class="field"><label>Plano comercial</label><input name="commercialPlan" type="text" value="${safe(state.settings.commercialPlan || 'Essentials')}" /></div>
            <div class="field" style="grid-column: 1 / -1;"><label>Template padrão de consentimento</label><textarea name="consentTemplate">${safe(state.settings.consentTemplate || '')}</textarea></div>
            <div class="field" style="grid-column: 1 / -1;"><label>Biblioteca de palavras-chave clínicas</label><textarea name="clinicalKeywordLibrary">${safe(state.settings.clinicalKeywordLibrary || '')}</textarea></div>
            <div class="field"><label>URL do backend</label><input name="backendUrl" type="text" value="${safe(state.settings.backendUrl || 'http://127.0.0.1:8000')}" /></div>
            <div class="field"><label>Modo padrão</label><select name="authMode"><option value="local" ${state.settings.authMode !== 'saas' ? 'selected' : ''}>Local</option><option value="saas" ${state.settings.authMode === 'saas' ? 'selected' : ''}>SaaS</option></select></div>
            <div class="field"><label>Email padrão SaaS</label><input name="backendEmail" type="email" value="${safe(state.settings.backendEmail || 'admin@agendaclinica.local')}" /></div>
            ${renderAccessAutomationFields()}
            <button class="btn primary" type="submit">Salvar painel admin</button>
          </form>
        </article>
        <article class="card">
          <h3>Importação e sincronização</h3>
          <p>Importe a planilha localmente e, se estiver conectado ao SaaS, envie o estado atual para o backend com um clique.</p>
          <div class="flex">
            <label class="btn warn" for="import-workbook">Importar planilha Excel</label>
            <input type="file" id="import-workbook" accept=".xlsm,.xlsx,.xls" hidden />
            <button class="btn ghost" id="test-backend">Testar backend</button>
            <button class="btn ghost" id="pull-backend">Recarregar do backend</button>
            <button class="btn success" id="push-backend">Enviar estado local ao backend</button>
          </div>
          <p class="footer-note">Status atual: ${useBackend() ? 'Conectado ao backend SaaS' : 'Modo local/offline'}${state.meta.lastSyncAt ? ` · Última sincronização: ${new Date(state.meta.lastSyncAt).toLocaleString('pt-BR')}` : ''}</p>
          <div class="notice">Daily plug-and-play: quando o backend estiver com DAILY_DOMAIN + DAILY_API_KEY configurados, basta iniciar a sessão no módulo Atendimento Clínico para gerar a sala automaticamente.</div>
        </article>
      </section>
      ${renderGoogleCalendarCard()}
      <section class="card section">
        <div class="spread"><h3>🔄 Backups automáticos com data/hora</h3><div style="display:flex;gap:8px"><button class="btn warn" id="manual-backup-btn">💾 Gerar backup + baixar agora</button></div></div>
        <p class="footer-note">A versão web agora mantém o mesmo fluxo operacional de backup local da versão offline: snapshot automático a cada <strong>30 minutos</strong> enquanto logado, com restauração e download sob demanda.</p>
        ${(() => { const backups = listAutoBackups(); return backups.length ? `<div class="table-wrap"><table><thead><tr><th>Data/hora</th><th>Pacientes</th><th>Sessões</th><th>Agendamentos</th><th>Ações</th></tr></thead><tbody>${backups.map((b,i)=>`<tr class="autobackup-table-row"><td><strong>${safe(b.ts)}</strong></td><td>${b.patients ?? (b.data?.patients||[]).length}</td><td>${b.sessions ?? (b.data?.sessions||[]).length}</td><td>${b.appointments ?? (b.data?.appointments||[]).length}</td><td style="display:flex;gap:6px"><button class="btn ghost js-restore-autobackup" data-idx="${i}">↺ Restaurar</button><button class="btn info download-backup-btn js-download-autobackup" data-idx="${i}">↓ Baixar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Nenhum backup automático ainda. Use "Gerar backup + baixar agora" ou aguarde 30 minutos logado.</div>'; })()}
      </section>
      <section class="layout-2 section">
        <article class="card">
          <h3>Operação web / PWA</h3>
          <p>Esta versão online foi ajustada para trabalhar como a offline: backup automático local no navegador, instalação como app e limpeza de cache para recuperação operacional.</p>
          <div class="flex">
            ${deferredPrompt ? '<button class="btn success" id="install-app-config">Instalar app web</button>' : '<span class="chip">Instalação disponível quando o navegador suportar PWA</span>'}
            <button class="btn warn" id="clear-browser-caches-btn">Limpar cache do navegador</button>
            <button class="btn ghost" id="about-btn-config">Sobre a versão web</button>
          </div>
          <p class="footer-note">Use a instalação PWA para deixar o uso diário mais próximo do app desktop, com atalho próprio e abertura independente do navegador.</p>
        </article>
        <article class="card">
          <h3>Versão web e comercialização</h3>
          <p>Esta aplicação agora suporta operação local e SaaS. Você pode publicar o frontend na web e apontar para o backend com autenticação, auditoria e persistência centralizada.</p>
          <div class="flex"><span class="chip">PWA</span><span class="chip">SaaS-ready</span><span class="chip">Web-ready</span><span class="chip">Windows-ready</span><span class="chip">White-label</span></div>
          <p class="footer-note">Use “Exportar backup” para exportar o backup completo do backend quando estiver conectado no modo SaaS.</p>
        </article>
      </section>
      <section class="layout-2 section">
        <article class="card">
          <h3>Ações administrativas</h3>
          <div class="flex">
            <button class="btn reset-appointments js-reset-module" data-module="appointments">Zerar agendamentos</button>
            <button class="btn reset-receivables js-reset-module" data-module="receivables">Zerar recebimentos</button>
            <button class="btn reset-payables js-reset-module" data-module="payables">Zerar pagamentos</button>
            <button class="btn reset-patients js-reset-module" data-module="patients">Zerar pacientes</button>
            <button class="btn danger" id="reset-app">Apagar tudo</button>
          </div>
          <p class="footer-note">As ações acima exigem perfil ADMIN. No modo SaaS, elas também atingem o banco central.</p>
        </article>
      </section>
    `, 'Painel Admin', 'Segurança, marca, importação Excel, sincronização com backend SaaS e operação comercial');
  }
  async function editRecord(type, id) {
    const collections = { clinic: state.clinics, professional: state.professionals, patient: state.patients, appointment: state.appointments, receivable: state.receivables, payable: state.payables, expenseCategory: state.expenseCategories || [], bankAccount: state.bankAccounts || [], cashEntry: state.cashEntries || [] };
    const item = collections[type]?.find(x => String(x.id) === String(id));
    if (!item) return;
    const before = clone(item);
    if (type === 'clinic') {
      item.name = prompt('Nome da clínica', item.name) || item.name;
      item.phone = prompt('Telefone', item.phone || '') || item.phone;
      item.email = prompt('Email', item.email || '') || item.email;
      item.status = prompt('Status', item.status || 'Ativo') || item.status;
    } else if (type === 'professional') {
      item.name = prompt('Nome do profissional', item.name) || item.name;
      item.clinicName = prompt('Clínica', item.clinicName || '') || item.clinicName;
      item.clinicId = findClinicIdByName(item.clinicName) || item.clinicId;
      item.specialty = prompt('Especialidade', item.specialty || '') || item.specialty;
      item.status = prompt('Status', item.status || 'Ativo') || item.status;
    } else if (type === 'patient') {
      openPatientEditModal(item);
      return;
    } else if (type === 'appointment') {
      item.date = prompt('Data (YYYY-MM-DD)', item.date || '') || item.date;
      item.time = prompt('Horário', item.time || '') || item.time;
      item.status = prompt('Status', item.status || 'AGENDADO') || item.status;
    } else if (type === 'receivable') {
      item.dueDate = prompt('Vencimento (YYYY-MM-DD)', item.dueDate || '') || item.dueDate;
      item.amountPlanned = Number(prompt('Valor previsto', item.amountPlanned) || item.amountPlanned || 0);
      item.amountPaid = Number(prompt('Valor pago', item.amountPaid) || item.amountPaid || 0);
      item.status = receiveStatus(item);
    } else if (type === 'payable') {
      item.dueDate = prompt('Vencimento (YYYY-MM-DD)', item.dueDate || '') || item.dueDate;
      item.category = normalizeExpenseCategory(prompt('Categoria', item.category || '') || item.category);
      ensureExpenseCategoryExists(item.category);
      item.description = prompt('Descrição', item.description || '') || item.description;
      item.amountPlanned = Number(prompt('Valor previsto', item.amountPlanned) || item.amountPlanned || 0);
      item.amountPaid = Number(prompt('Valor pago', item.amountPaid) || item.amountPaid || 0);
      item.status = receiveStatus({ dueDate: item.dueDate, amountPlanned: item.amountPlanned, amountPaid: item.amountPaid });
    } else if (type === 'expenseCategory') {
      item.name = normalizeExpenseCategory(prompt('Categoria', item.name || '') || item.name);
      item.description = prompt('Descrição', item.description || '') || item.description;
      item.status = prompt('Status', item.status || 'Ativa') || item.status;
    } else if (type === 'bankAccount') {
      item.name = prompt('Nome da conta', item.name || '') || item.name;
      item.bankName = prompt('Banco', item.bankName || '') || item.bankName;
      item.branch = prompt('Agência', item.branch || '') || item.branch;
      item.accountNumber = prompt('Número da conta', item.accountNumber || '') || item.accountNumber;
      item.type = prompt('Tipo', item.type || 'Conta Corrente') || item.type;
      item.initialBalance = Number(prompt('Saldo inicial', item.initialBalance) || item.initialBalance || 0);
      item.status = prompt('Status', item.status || 'Ativa') || item.status;
    } else if (type === 'cashEntry') {
      item.movementDate = prompt('Data (YYYY-MM-DD)', item.movementDate || todayIso()) || item.movementDate;
      item.direction = prompt('Tipo', item.direction || 'Entrada') || item.direction;
      item.category = prompt('Categoria', normalizeExpenseCategory(item.category)) || item.category;
      item.description = prompt('Descrição', item.description || '') || item.description;
      item.amount = Number(prompt('Valor', item.amount) || item.amount || 0);
      const bankName = prompt('Conta bancária', item.bankAccountName || '') || item.bankAccountName;
      const bank = (state.bankAccounts || []).find(a => a.name === bankName);
      item.bankAccountId = bank?.id || item.bankAccountId;
      item.bankAccountName = bankName;
      item.monthName = monthName(new Date(`${item.movementDate}T00:00:00`).getMonth());
    }
    try {
      if (useBackend() && !['bankAccount','cashEntry','expenseCategory'].includes(type)) {
        await updateBackendRecord(backendResourceForType(type), item.id, item);
      } else {
        saveState();
        audit('Edição', `${type} alterado(a).`, { entity: type, before, after: item });
      }
      if (type === 'appointment') await syncAppointmentToGoogleCalendar(item, { origin: 'edit' });
      render();
    } catch (error) {
      Object.assign(item, before);
      alert(error.message || 'Falha ao editar registro.');
    }
  }
  async function deleteRecord(type, id) {
    const labels = { clinic: 'clínica', professional: 'profissional', patient: 'paciente', appointment: 'agendamento', receivable: 'recebimento', payable: 'conta a pagar', expenseCategory: 'categoria de despesa', bankAccount: 'conta bancária', cashEntry: 'lançamento de caixa' };
    if (!confirm(`Deseja excluir ${labels[type] || 'registro'}?`)) return;
    const googleBefore = type === 'appointment' ? clone((state.appointments || []).find(item => String(item.id) === String(id))) : null;
    try {
      if (useBackend() && !['bankAccount','cashEntry','expenseCategory'].includes(type)) {
        if (type === 'patient') {
          await deleteBackendRecord('patients', id, { skipSync: true });
        } else if (type === 'professional') {
          const patientIds = state.patients.filter(p => String(p.professionalId) === String(id)).map(p => p.id);
          await clearBackendResource('patients', patientIds);
          await deleteBackendRecord('professionals', id, { skipSync: true });
        } else if (type === 'clinic') {
          const pros = state.professionals.filter(p => String(p.clinicId) === String(id)).map(p => p.id);
          const patientIds = state.patients.filter(p => String(p.clinicId) === String(id) || pros.includes(p.professionalId)).map(p => p.id);
          const payableIds = state.payables.filter(p => String(p.clinicId) === String(id)).map(p => p.id);
          await clearBackendResource('payables', payableIds);
          await clearBackendResource('patients', patientIds);
          await clearBackendResource('professionals', pros);
          await deleteBackendRecord('clinics', id, { skipSync: true });
        } else {
          await deleteBackendRecord(backendResourceForType(type), id, { skipSync: true });
        }
        await syncStateFromBackend();
      } else {
        if (type === 'patient') {
          const patient = state.patients.find(x => String(x.id) === String(id));
          const before = clone(patient);
          const receivableIds = state.receivables.filter(r => String(r.patientId) === String(id)).map(r => r.id);
          state.appointments = state.appointments.filter(a => String(a.patientId) !== String(id));
          state.receivables = state.receivables.filter(r => String(r.patientId) !== String(id));
          state.cashEntries = (state.cashEntries || []).filter(entry => !(entry.originType === 'receivable' && receivableIds.includes(entry.originId)));
          state.patients = state.patients.filter(x => String(x.id) !== String(id));
          audit('Exclusão', 'Paciente excluído com cascata de agenda/recebimentos.', { entity: type, before, after: null });
        } else if (type === 'professional') {
          const professional = state.professionals.find(x => String(x.id) === String(id));
          const before = clone(professional);
          const patientIds = state.patients.filter(p => String(p.professionalId) === String(id)).map(p => p.id);
          const receivableIds = state.receivables.filter(r => patientIds.includes(r.patientId)).map(r => r.id);
          state.appointments = state.appointments.filter(a => !patientIds.includes(a.patientId));
          state.receivables = state.receivables.filter(r => !patientIds.includes(r.patientId));
          state.cashEntries = (state.cashEntries || []).filter(entry => !(entry.originType === 'receivable' && receivableIds.includes(entry.originId)));
          state.patients = state.patients.filter(p => String(p.professionalId) !== String(id));
          state.professionals = state.professionals.filter(x => String(x.id) !== String(id));
          audit('Exclusão', 'Profissional excluído com cascata de pacientes, agenda e recebimentos.', { entity: type, before, after: null });
        } else if (type === 'clinic') {
          const clinic = state.clinics.find(x => String(x.id) === String(id));
          const before = clone(clinic);
          const pros = state.professionals.filter(p => String(p.clinicId) === String(id) || p.clinicName === clinic?.name).map(p => p.id);
          const patientIds = state.patients.filter(p => String(p.clinicId) === String(id) || pros.includes(p.professionalId)).map(p => p.id);
          const receivableIds = state.receivables.filter(r => String(r.clinicId) === String(id) || patientIds.includes(r.patientId)).map(r => r.id);
          const payableIds = state.payables.filter(p => String(p.clinicId) === String(id) || p.clinicName === clinic?.name).map(p => p.id);
          state.payables = state.payables.filter(p => String(p.clinicId) !== String(id) && p.clinicName !== clinic?.name);
          state.appointments = state.appointments.filter(a => String(a.clinicId) !== String(id) && !patientIds.includes(a.patientId));
          state.receivables = state.receivables.filter(r => String(r.clinicId) !== String(id) && !patientIds.includes(r.patientId));
          state.cashEntries = (state.cashEntries || []).filter(entry => !((entry.originType === 'receivable' && receivableIds.includes(entry.originId)) || (entry.originType === 'payable' && payableIds.includes(entry.originId)) || String(entry.clinicId) === String(id)));
          state.patients = state.patients.filter(p => String(p.clinicId) !== String(id) && !pros.includes(p.professionalId));
          state.professionals = state.professionals.filter(p => String(p.clinicId) !== String(id));
          state.clinics = state.clinics.filter(x => String(x.id) !== String(id));
          audit('Exclusão', 'Clínica excluída com cascata de profissionais, pacientes, agenda, recebimentos e pagamentos.', { entity: type, before, after: null });
        } else if (type === 'expenseCategory') {
          const before = clone((state.expenseCategories || []).find(x => String(x.id) === String(id)));
          const inUse = (state.payables || []).some(item => normalizeExpenseCategory(item.category) === normalizeExpenseCategory(before?.name));
          if (inUse) throw new Error('Esta categoria já está vinculada a contas a pagar. Edite ou inative em vez de excluir.');
          state.expenseCategories = (state.expenseCategories || []).filter(x => String(x.id) !== String(id));
          audit('Exclusão', 'Categoria de despesa excluída.', { entity: type, before, after: null });
        } else if (type === 'bankAccount') {
          const before = clone((state.bankAccounts || []).find(x => String(x.id) === String(id)));
          state.bankAccounts = (state.bankAccounts || []).filter(x => String(x.id) !== String(id));
          state.cashEntries = (state.cashEntries || []).filter(entry => String(entry.bankAccountId) !== String(id));
          audit('Exclusão', 'Conta bancária excluída com remoção das movimentações vinculadas.', { entity: type, before, after: null });
        } else if (type === 'cashEntry') {
          const before = clone((state.cashEntries || []).find(x => String(x.id) === String(id)));
          state.cashEntries = (state.cashEntries || []).filter(x => String(x.id) !== String(id));
          audit('Exclusão', 'Lançamento de caixa excluído.', { entity: type, before, after: null });
        } else {
          const map = { appointment: 'appointments', receivable: 'receivables', payable: 'payables', expenseCategory: 'expenseCategories' };
          const key = map[type];
          const before = clone(state[key].find(x => String(x.id) === String(id)));
          state[key] = state[key].filter(x => String(x.id) !== String(id));
          if (type === 'receivable') state.cashEntries = (state.cashEntries || []).filter(entry => !(entry.originType === 'receivable' && String(entry.originId) === String(id)));
          if (type === 'payable') state.cashEntries = (state.cashEntries || []).filter(entry => !(entry.originType === 'payable' && String(entry.originId) === String(id)));
          audit('Exclusão', `${labels[type] || 'Registro'} excluído(a).`, { entity: type, before, after: null });
        }
        saveState();
      }
      if (type === 'appointment' && googleBefore) await syncAppointmentToGoogleCalendar({ ...googleBefore, status: 'CANCELADO' }, { origin: 'delete' });
      render();
    } catch (error) {
      alert(error.message || 'Falha ao excluir registro.');
    }
  }
  function bindActionButtons() {
    document.querySelectorAll('.js-edit').forEach(btn => btn.addEventListener('click', () => editRecord(btn.dataset.type, btn.dataset.id)));
    document.querySelectorAll('.js-delete').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.type, btn.dataset.id)));
    document.querySelectorAll('.js-history').forEach(btn => btn.addEventListener('click', () => openPatientHistoryModal(btn.dataset.id)));
  }
  function currentView() {
    switch (state.meta.route) {
      case 'clinicas': return clinicsView();
      case 'profissionais': return professionalsView();
      case 'pacientes': return patientsView();
      case 'agendamentos': return appointmentsView();
      case 'agenda': return agendaView();
      case 'atendimentos': return clinicalSessionsView();
      case 'recebimentos': return receivablesView();
      case 'pagamentos': return payablesView();
      case 'categorias': return categoriesView();
      case 'caixa': return caixaView();
      case 'relatorios': return reportsView();
      case 'auditoria': return auditView();
      case 'configuracoes': return configView();
      default: return dashboardView();
    }
  }

  function bindCommonEvents() {
    document.querySelectorAll('[data-route]').forEach(btn => btn.onclick = () => setRoute(btn.dataset.route));
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      logoutSession('Logout', `Sessão encerrada para ${state.session?.role || 'usuário'}.`);
    });
    resetIdleTimer();
    document.getElementById('export-json')?.addEventListener('click', async () => {
      try {
        let payload = state;
        const now = new Date();
        const pad = n => String(n).padStart(2,'0');
        let filename = `agenda-clinica-backup-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
        if (useBackend() && isAdmin()) {
          payload = await api.exportFullBackup(apiBase(), state.session.token);
          filename = 'agenda-clinica-backup-saas.json';
        }
        const text = JSON.stringify(payload, null, 2);
        if (isDesktopApp() && desktop?.exportBackup) {
          const result = await desktop.exportBackup(text, filename);
          if (result?.canceled) return;
        } else {
          const blob = new Blob([text], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.click();
          URL.revokeObjectURL(a.href);
        }
        audit('Exportação', 'Backup exportado.', { entity: 'backup', origin: useBackend() ? 'saas' : 'json' });
      } catch (error) {
        alert(error.message || 'Falha ao exportar backup.');
      }
    });
    document.getElementById('export-audit-csv')?.addEventListener('click', async () => {
      const header = ['DataHora','Usuario','Perfil','Modulo','Entidade','Acao','Detalhe','Antes','Depois'];
      const lines = [header.join(';')].concat((state.audits || []).map(a => [a.at, a.actor || '', a.role || '', a.route || '', a.entity || '', a.action || '', a.detail || '', typeof a.before === 'string' ? a.before : JSON.stringify(a.before || ''), typeof a.after === 'string' ? a.after : JSON.stringify(a.after || '')].map(v => `"${String(v).replaceAll('"','\"')}"`).join(';')));
      const csvText = lines.join('\n');
      if (isDesktopApp() && desktop?.exportAuditCsv) {
        const result = await desktop.exportAuditCsv(csvText, 'agenda-clinica-auditoria.csv');
        if (result?.canceled) return;
      } else {
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'agenda-clinica-auditoria.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      }
    });
    document.getElementById('export-report-csv')?.addEventListener('click', () => {
      const payload = buildReportCsvPayload();
      downloadTextFile(payload.filename, payload.content, 'text/csv;charset=utf-8');
    });
    document.getElementById('report-print-pdf')?.addEventListener('click', async () => {
      try {
        if (isDesktopApp() && desktop?.exportPdf) {
          const html = buildPrintDocumentHtml(reportPrintTitle(), buildReportsPdfBody());
          const result = await desktop.exportPdf(html, reportPrintFileName());
          if (!result || result.canceled) return;
          alert(`PDF salvo com sucesso: ${result.filePath || reportPrintFileName()}`);
          return;
        }
        openPrintWindow(reportPrintTitle(), buildReportsPdfBody());
      } catch (error) {
        alert(error.message || 'Falha ao abrir a impressão dos relatórios.');
      }
    });
    document.getElementById('import-json')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        state = { ...defaultState(), ...data, meta: { ...defaultState().meta, ...(data.meta || {}) }, settings: { ...defaultState().settings, ...(data.settings || {}) } };
        enrichCollections();
        saveState();
        audit('Importação', `Backup importado: ${file.name}`);
        render();
      } catch (error) {
        alert('Falha ao importar backup JSON.');
      }
    });
    document.getElementById('import-backup-native')?.addEventListener('click', async () => {
      try {
        const result = await desktop?.importBackup?.();
        if (!result || result.canceled || !result.content) return;
        const data = JSON.parse(result.content);
        state = { ...defaultState(), ...data, meta: { ...defaultState().meta, ...(data.meta || {}) }, settings: { ...defaultState().settings, ...(data.settings || {}) } };
        enrichCollections();
        saveState();
        audit('Importação', `Backup restaurado: ${result.filePath || 'arquivo selecionado'}`);
        render();
      } catch (error) {
        alert('Falha ao restaurar backup JSON.');
      }
    });
    document.getElementById('import-workbook')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importWorkbookFile(file);
        enrichCollections();
        alert(`Planilha importada com sucesso: ${file.name}`);
        if (useBackend() && confirm('Deseja enviar os dados importados para o backend SaaS agora?')) {
          await pushStateToBackend();
          alert('Dados sincronizados com o backend SaaS.');
        }
        render();
      } catch (error) {
        alert(error.message || 'Falha ao importar planilha Excel.');
        console.error(error);
      }
    });
    document.getElementById('test-backend')?.addEventListener('click', async () => {
      try {
        const info = await testBackendConnection();
        alert(`Backend disponível: ${info.service}`);
      } catch (error) {
        alert(error.message || 'Falha ao conectar no backend.');
      }
    });
    document.getElementById('pull-backend')?.addEventListener('click', async () => {
      try {
        if (!useBackend()) throw new Error('Entre no modo SaaS para recarregar os dados do backend.');
        await syncStateFromBackend();
        alert('Dados recarregados do backend SaaS.');
        render();
      } catch (error) {
        alert(error.message || 'Falha ao recarregar dados do backend.');
      }
    });
    document.getElementById('push-backend')?.addEventListener('click', async () => {
      try {
        if (!useBackend()) throw new Error('Entre no modo SaaS para enviar os dados ao backend.');
        if (!confirm('Isso substituirá os dados atuais do backend pelos dados locais. Continuar?')) return;
        await pushStateToBackend();
        alert('Estado local enviado ao backend SaaS.');
        render();
      } catch (error) {
        alert(error.message || 'Falha ao sincronizar com o backend.');
      }
    });
    document.querySelectorAll('.js-reset-module').forEach(btn => btn.addEventListener('click', async () => {
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      const module = btn.dataset.module;
      if (!confirm(`Deseja zerar o módulo ${module}?`)) return;
      try {
        if (useBackend()) {
          const ids = (state[module] || []).map(item => item.id);
          await clearBackendResource(module, ids);
          await syncStateFromBackend();
        } else {
          const beforeCount = Array.isArray(state[module]) ? state[module].length : 0;
          state[module] = [];
          if (module === 'patients') { state.appointments = []; state.receivables = []; state.cashEntries = []; }
          if (module === 'receivables') state.cashEntries = (state.cashEntries || []).filter(entry => entry.originType !== 'receivable');
          if (module === 'payables') state.cashEntries = (state.cashEntries || []).filter(entry => entry.originType !== 'payable');
          saveState();
          audit('Limpeza administrativa', `Módulo ${module} zerado.`, { entity: module, before: `${beforeCount} registros`, after: '0 registros' });
        }
        render();
      } catch (error) {
        alert(error.message || 'Falha ao limpar módulo.');
      }
    }));
    document.getElementById('help-btn')?.addEventListener('click', () => { state.meta.helpOpen = true; saveState(); render(); });
    document.getElementById('help-general-btn')?.addEventListener('click', () => { state.meta.helpOpen = 'geral'; saveState(); render(); });
    document.getElementById('help-close-btn')?.addEventListener('click', () => { state.meta.helpOpen = false; saveState(); render(); });
    document.getElementById('help-backdrop')?.addEventListener('click', event => { if (event.target.id === 'help-backdrop') { state.meta.helpOpen = false; saveState(); render(); } });
    document.getElementById('save-clinical-keywords-btn')?.addEventListener('click', () => {
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      const value = String(document.getElementById('clinical-keyword-library-editor')?.value || '').trim();
      state.settings.clinicalKeywordLibrary = value || defaultState().settings.clinicalKeywordLibrary;
      saveState();
      audit('Configuração clínica', 'Biblioteca de palavras-chave atualizada.', { entity: 'clinicalKeywordLibrary' });
      alert('Palavras-chave clínicas atualizadas.');
      render();
    });
    document.getElementById('onboarding-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      state.settings.brandName = String(fd.get('brandName') || '').trim() || state.settings.brandName || 'Agenda Clínica';
      state.settings.companyName = String(fd.get('companyName') || '').trim() || state.settings.companyName || 'Sua Clínica';
      const logoFile = event.target.querySelector('input[name="logoFile"]')?.files?.[0];
      if (logoFile) state.settings.logoDataUrl = await readFileAsDataUrl(logoFile);
      state.settings.firstRunCompleted = true;
      state.meta.onboardingOpen = false;
      saveState();
      audit('Onboarding', 'Primeira configuração concluída.', { entity: 'settings' });
      render();
    });
    document.getElementById('onboarding-skip-btn')?.addEventListener('click', () => {
      state.settings.firstRunCompleted = true;
      state.meta.onboardingOpen = false;
      saveState();
      render();
    });
    document.getElementById('onboarding-open-admin-btn')?.addEventListener('click', () => {
      state.meta.route = 'configuracoes';
      saveState();
      render();
    });
    document.getElementById('onboarding-backdrop')?.addEventListener('click', event => { if (event.target.id === 'onboarding-backdrop') { state.meta.onboardingOpen = false; saveState(); render(); } });
    document.getElementById('install-app')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      render();
    });
    const openDataFolder = async () => { if (desktop?.openDataFolder) await desktop.openDataFolder(); };
    const showAbout = async () => {
      if (desktop?.showAbout) {
        await desktop.showAbout();
        return;
      }
      state.meta.aboutOpen = true;
      saveState();
      render();
    };
    const closeAbout = () => {
      state.meta.aboutOpen = false;
      saveState();
      render();
    };
    document.getElementById('open-data-folder')?.addEventListener('click', openDataFolder);
    document.getElementById('open-data-folder-config')?.addEventListener('click', openDataFolder);
    document.getElementById('about-btn')?.addEventListener('click', showAbout);
    document.getElementById('about-btn-config')?.addEventListener('click', showAbout);
    document.getElementById('about-close-btn')?.addEventListener('click', closeAbout);
    document.getElementById('about-backdrop')?.addEventListener('click', event => { if (event.target.id === 'about-backdrop') closeAbout(); });
    document.getElementById('install-app-config')?.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert('A instalação PWA não está disponível neste navegador agora. Abra pelo navegador compatível e aceite a instalação quando ela aparecer.');
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      render();
    });
    document.getElementById('clear-browser-caches-btn')?.addEventListener('click', async () => {
      if (isDesktopApp()) return;
      if (!confirm('Isso limpará cache e service workers deste navegador para esta aplicação. Continuar?')) return;
      try {
        await clearBrowserCaches();
        alert('Cache limpo com sucesso. A aplicação será recarregada para garantir o ambiente limpo.');
        window.location.reload();
      } catch (error) {
        alert(error.message || 'Falha ao limpar o cache do navegador.');
      }
    });
    document.getElementById('google-calendar-calendar-id')?.addEventListener('change', async event => {
      state.settings.googleCalendarCalendarId = String(event.target.value || 'primary').trim() || 'primary';
      state.settings.googleCalendarCalendarSummary = '';
      state.settings.googleCalendarCalendarTimeZone = '';
      state.settings.googleCalendarCalendarAccessRole = '';
      state.settings.googleCalendarLastValidatedAt = '';
      saveState();
      if (googleCalendarConnected()) {
        try {
          await inspectGoogleCalendarConnection({ silent: true });
        } catch (_error) {}
      }
      render();
    });
    document.getElementById('google-calendar-enabled')?.addEventListener('change', event => {
      state.settings.googleCalendarSyncEnabled = !!event.target.checked;
      state.settings.googleCalendarLastError = '';
      saveState();
      alert(state.settings.googleCalendarSyncEnabled ? 'Sincronização automática do Google Calendar ativada. A partir de agora, novos agendamentos e remarcações já podem ser enviados automaticamente.' : 'Sincronização automática do Google Calendar desligada. A conta continua conectada, mas o envio automático fica pausado.');
      render();
    });
    document.getElementById('google-calendar-import-credentials')?.addEventListener('click', async () => {
      try {
        const result = await importGoogleOAuthCredentialsFlow();
        if (!result || result.canceled) return;
        state.settings.googleCalendarClientId = String(result.clientId || '');
        state.settings.googleCalendarClientSecret = String(result.clientSecret || '');
        state.settings.googleCalendarProjectId = String(result.projectId || '');
        state.settings.googleCalendarAuthUri = String(result.authUri || 'https://accounts.google.com/o/oauth2/v2/auth');
        state.settings.googleCalendarTokenUri = String(result.tokenUri || 'https://oauth2.googleapis.com/token');
        state.settings.googleCalendarCalendarId = state.settings.googleCalendarCalendarId || 'primary';
        state.settings.googleCalendarLastError = '';
        saveState();
        alert('Credenciais Google importadas com sucesso. Próximo passo: clique em Conectar Google para autorizar sua conta.');
        render();
      } catch (error) {
        state.settings.googleCalendarLastError = String(error.message || 'Falha ao importar as credenciais Google.');
        saveState();
        alert(error.message || 'Falha ao importar as credenciais Google.');
      }
    });
    document.getElementById('google-calendar-connect')?.addEventListener('click', async () => {
      try {
        if (!googleCalendarConfigured()) throw new Error('Importe primeiro o arquivo JSON de credenciais OAuth do Google.');
        const tokens = isDesktopApp() && desktop?.googleCalendarConnect
          ? await desktop.googleCalendarConnect({
              clientId: state.settings.googleCalendarClientId,
              clientSecret: state.settings.googleCalendarClientSecret,
              authUri: state.settings.googleCalendarAuthUri,
              tokenUri: state.settings.googleCalendarTokenUri,
              scopes: state.settings.googleCalendarScopes
            })
          : await browserGoogleCalendarConnect();
        setGoogleCalendarTokens(tokens || {});
        state.settings.googleCalendarSyncEnabled = true;
        const info = await inspectGoogleCalendarConnection({ silent: true });
        const syncResult = await syncCurrentPeriodToGoogleCalendar({ origin: 'connect-initial-sync' });
        saveState();
        alert(`Google Calendar conectado com sucesso.

Calendário validado: ${info?.summaryOverride || info?.summary || googleCalendarCalendarId()}
Agendamentos do período atual: ${syncResult.items.length}
Criados: ${syncResult.summary.created}
Atualizados: ${syncResult.summary.updated}
Cancelados: ${syncResult.summary.deleted}
Falhas: ${syncResult.summary.failed}`);
        render();
      } catch (error) {
        state.settings.googleCalendarLastError = String(error.message || 'Falha ao conectar com o Google Calendar.');
        saveState();
        alert(error.message || 'Falha ao conectar com o Google Calendar.');
        render();
      }
    });
    document.getElementById('google-calendar-test')?.addEventListener('click', async () => {
      try {
        const info = await inspectGoogleCalendarConnection({ silent: true });
        alert(`Conexão com o Google validada com sucesso.

Calendário: ${info?.summaryOverride || info?.summary || googleCalendarCalendarId()}
Permissão: ${info?.accessRole || 'owner'}
Fuso: ${info?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'não informado'}`);
        render();
      } catch (error) {
        state.settings.googleCalendarLastError = String(error.message || 'Falha ao testar a conexão com o Google Calendar.');
        saveState();
        alert(error.message || 'Falha ao testar a conexão com o Google Calendar.');
        render();
      }
    });
    document.getElementById('google-calendar-disconnect')?.addEventListener('click', () => {
      clearGoogleCalendarConnection();
      state.settings.googleCalendarSyncEnabled = false;
      saveState();
      alert('Conexão do Google Calendar removida deste computador. Se quiser usar novamente, basta conectar de novo.');
      render();
    });
    document.getElementById('google-calendar-sync-current')?.addEventListener('click', async () => {
      try {
        const syncResult = await syncCurrentPeriodToGoogleCalendar({ origin: 'manual-current-period' });
        alert(`Sincronização do período atual concluída.

Agendamentos analisados: ${syncResult.items.length}
Criados: ${syncResult.summary.created}
Atualizados: ${syncResult.summary.updated}
Cancelados: ${syncResult.summary.deleted}
Falhas: ${syncResult.summary.failed}`);
        render();
      } catch (error) {
        state.settings.googleCalendarLastError = String(error.message || 'Falha ao sincronizar o período atual com o Google Calendar.');
        saveState();
        alert(error.message || 'Falha ao sincronizar o período atual com o Google Calendar.');
        render();
      }
    });
    document.getElementById('google-calendar-sync-pending-all')?.addEventListener('click', async () => {
      try {
        if (!googleCalendarReady()) throw new Error('Conecte o Google Calendar e deixe a sincronização automática ligada para tratar os pendentes.');
        const pendingItems = googleCalendarPendingAppointments();
        if (!pendingItems.length) {
          alert('Não há pendências de sincronização com o Google Calendar no momento.');
          return;
        }
        const summary = await syncAppointmentsBatchToGoogleCalendar(pendingItems, { silent: true, origin: 'manual-pending-all' });
        alert(`Sincronização de pendentes concluída.

Itens analisados: ${pendingItems.length}
Criados: ${summary.created}
Atualizados: ${summary.updated}
Cancelados: ${summary.deleted}
Falhas restantes: ${summary.failed}`);
        render();
      } catch (error) {
        state.settings.googleCalendarLastError = String(error.message || 'Falha ao sincronizar todos os pendentes do Google Calendar.');
        saveState();
        alert(error.message || 'Falha ao sincronizar todos os pendentes do Google Calendar.');
        render();
      }
    });
    if (isDesktopApp() && desktop?.onMenuAction && !window.__agendaMenuBound) {
      window.__agendaMenuBound = true;
      desktop.onMenuAction(async action => {
        if (action === 'export-backup') document.getElementById('export-json')?.click();
        if (action === 'import-backup') document.getElementById('import-backup-native')?.click();
      });
    }
    document.getElementById('clinic-filter')?.addEventListener('change', e => { state.meta.clinicFilter = e.target.value; saveState(); render(); });
    document.getElementById('month-filter')?.addEventListener('change', e => { state.meta.monthFilter = e.target.value; saveState(); render(); });
    document.getElementById('manual-backup-btn')?.addEventListener('click', () => {
      doAutoBackup(true); // true = baixar arquivo json
      alert('Backup gerado e download iniciado! O arquivo foi salvo na sua pasta de Downloads.');
      render();
    });

    document.getElementById('js-add-operator')?.addEventListener('click', async () => {
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      ensureAccessSettings();
      const activeOperators = (useBackend() ? (state.meta.backendUsers || []) : (state.settings.localUsers || [])).filter(user => user.role === 'OPERADOR' && user.status !== 'Inativo' && user.active !== false).length;
      if (activeOperators >= Number(state.settings.licenseOperatorLimit || 3)) return alert('O limite de operadores da licença foi atingido.');
      const name = String(document.getElementById('new-local-user-name')?.value || '').trim();
      const email = String(document.getElementById('new-local-user-email')?.value || '').trim().toLowerCase();
      const password = String(document.getElementById('new-local-user-password')?.value || '').trim();
      const status = String(document.getElementById('new-local-user-status')?.value || 'Ativo');
      if (!name || !password) return alert('Informe nome e senha do operador.');
      try {
        if (useBackend() && api?.createUser) {
          if (!email) return alert('Informe o email do operador para criar o acesso no backend.');
          await api.createUser(apiBase(), state.session.token, { name, email, password, role: 'OPERADOR', active: status !== 'Inativo' });
          await syncStateFromBackend();
        } else {
          state.settings.localUsers.push({ id: uid('USR'), name, email, role: 'OPERADOR', password, status, createdAt: new Date().toISOString() });
          saveState();
        }
        audit('Configuração', `Operador criado: ${name}.`, { entity: 'user' });
        render();
      } catch (error) {
        alert(error.message || 'Falha ao criar operador.');
      }
    });
    document.querySelectorAll('.js-remove-local-user').forEach(btn => btn.addEventListener('click', async () => {
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      const user = (useBackend() ? (state.meta.backendUsers || []).find(item => String(item.id) === String(btn.dataset.userId)) : localUserById(btn.dataset.userId));
      if (!user) return;
      if (!confirm(`Remover o usuário ${user.name}?`)) return;
      try {
        if (useBackend() && api?.deleteUser) {
          await api.deleteUser(apiBase(), state.session.token, user.id);
          await syncStateFromBackend();
        } else {
          state.settings.localUsers = (state.settings.localUsers || []).filter(item => String(item.id) !== String(user.id));
          saveState();
        }
        audit('Configuração', `Usuário removido: ${user.name}.`, { entity: 'user' });
        render();
      } catch (error) {
        alert(error.message || 'Falha ao remover usuário.');
      }
    }));
    document.getElementById('test-upcoming-alert-btn')?.addEventListener('click', async () => {
      const sent = await notifyUpcomingAppointments(true).catch(() => 0);
      alert(sent ? `Alerta de sessão testado em ${sent} agendamento(s).` : 'Nenhuma sessão próxima encontrada para teste.');
    });
    document.getElementById('run-tomorrow-reminders-btn')?.addEventListener('click', async () => {
      const sent = await runTomorrowReminderBatch(true).catch(() => 0);
      alert(sent ? `Lembretes da véspera processados: ${sent}.` : 'Nenhum lembrete da véspera foi gerado.');
    });
    document.querySelectorAll('.js-restore-autobackup').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx || 0);
        const backups = listAutoBackups();
        const entry = backups[idx];
        if (!entry) return;
        if (!confirm(`Restaurar o backup de ${entry.ts}?\nISTO IRÁ SUBSTITUIR os dados atuais (exceto configurações e sessão de login).`)) return;
        if (restoreAutoBackup(idx)) {
          alert(`Backup de ${entry.ts} restaurado com sucesso.`);
          render();
        } else {
          alert('Falha ao restaurar o backup.');
        }
      });
    });
    document.querySelectorAll('.js-download-autobackup').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.idx || 0);
        if (downloadAutoBackup(idx)) {
          alert('Download do backup iniciado.');
        } else {
          alert('Falha ao baixar o backup.');
        }
      });
    });
  }

  async function handleClinicSubmit(eventOrForm) {
    const form = eventOrForm?.target?.tagName === 'FORM' ? eventOrForm.target : eventOrForm;
    if (eventOrForm?.preventDefault) eventOrForm.preventDefault();
    if (!form) return;
    const fd = new FormData(form);
    const clinic = { id: uid('CLI'), code: nextCode('CLI', state.clinics), name: fd.get('name'), status: fd.get('status'), phone: fd.get('phone'), email: fd.get('email'), createdAt: todayIso() };
    try {
      if (useBackend()) {
        await createBackendRecord('clinics', clinic);
      } else {
        state.clinics.push(clinic);
        saveState();
        audit('Cadastro', `Clínica criada: ${clinic.name}`);
      }
      alert(`Clínica salva com sucesso: ${clinic.name}`);
      render();
    } catch (error) {
      alert(error.message || 'Falha ao salvar clínica.');
    }
  }

  function bindRouteForms() {
    const clinicForm = document.getElementById('clinic-form');
    clinicForm?.addEventListener('submit', handleClinicSubmit);
    document.getElementById('clinic-save-btn')?.addEventListener('click', async event => {
      if (!clinicForm) return;
      if (event) event.preventDefault();
      if (typeof clinicForm.reportValidity === 'function' && !clinicForm.reportValidity()) return;
      await handleClinicSubmit(clinicForm);
    });
    document.getElementById('professional-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const clinicName = String(fd.get('clinicName') || currentClinicScopeName() || '');
      const item = { id: uid('PRO'), code: nextCode('PRO', state.professionals), name: fd.get('name'), clinicName, clinicId: findClinicIdByName(clinicName), specialty: fd.get('specialty'), status: fd.get('status'), createdAt: todayIso() };
      try {
        if (useBackend()) {
          await createBackendRecord('professionals', item);
        } else {
          state.professionals.push(item);
          saveState();
          audit('Cadastro', `Profissional criado: ${item.name}`);
        }
        render();
      } catch (error) { alert(error.message || 'Falha ao salvar profissional.'); }
    });
    document.getElementById('patient-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const professional = state.professionals.find(p => String(p.id) === String(fd.get('professionalId')));
      const patient = {
        id: uid('PAC'),
        code: nextCode('PAC', state.patients),
        name: fd.get('name'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        professionalId: String(fd.get('professionalId') || ''),
        professionalName: professional?.name || '',
        clinicId: professional?.clinicId || '',
        clinicName: professional?.clinicName || '',
        frequency: fd.get('frequency'),
        weekday: fd.get('weekday'),
        time: fd.get('time'),
        monthlyFee: Number(fd.get('monthlyFee') || 0),
        paymentDay: Number(fd.get('paymentDay') || 1),
        billingType: fd.get('billingType'),
        status: fd.get('status'),
        registrationDate: fd.get('registrationDate') || todayIso(),
        consentRecording: String(fd.get('consentRecording') || '0') === '1',
        consentSignedAt: String(fd.get('consentRecording') || '0') === '1' ? (fd.get('consentSignedAt') || todayIso()) : '',
        consentText: fd.get('consentText') || state.settings.consentTemplate || '',
        birthDate: fd.get('birthDate') || '',
        clinicalAlerts: fd.get('clinicalAlerts') || '',
        medications: fd.get('medications') || '',
        diseases: fd.get('diseases') || '',
        observations: fd.get('observations') || '',
        anamnese: fd.get('anamnese') || '',
        createdAt: todayIso()
      };
      try {
        if (useBackend()) {
          const created = await createBackendRecord('patients', patient, { skipSync: true });
          state.patients.push({ ...patient, ...created, id: String(created.id) });
          enrichCollections();
          const beforeAppointments = state.appointments.length;
          const beforeReceivables = state.receivables.length;
          const result = generateScheduleAndReceivables(String(created.id), fd.get('billingStart'));
          const generatedAppointments = state.appointments.slice(beforeAppointments).filter(a => String(a.patientId) === String(created.id));
          const generatedReceivables = state.receivables.slice(beforeReceivables).filter(r => String(r.patientId) === String(created.id));
          for (const appointment of generatedAppointments) await createBackendRecord('appointments', appointment, { skipSync: true });
          for (const receivable of generatedReceivables) await createBackendRecord('receivables', receivable, { skipSync: true });
          await syncStateFromBackend();
          if (googleCalendarReady()) await syncAppointmentsBatchToGoogleCalendar(generatedAppointments, { silent: true, origin: 'patient-create' });
          alert(`${patient.name} salvo com sucesso.\nGerados: ${result.appointments} agendamentos e ${result.receivables} recebimentos.`);
        } else {
          state.patients.push(patient);
          saveState();
          const beforeAppointments = state.appointments.length;
          const result = generateScheduleAndReceivables(patient.id, fd.get('billingStart'));
          const generatedAppointments = state.appointments.slice(beforeAppointments).filter(item => String(item.patientId) === String(patient.id));
          if (googleCalendarReady()) await syncAppointmentsBatchToGoogleCalendar(generatedAppointments, { silent: true, origin: 'patient-create' });
          audit('Cadastro', `Paciente criado: ${patient.name}`);
          alert(`${patient.name} salvo com sucesso.\nGerados: ${result.appointments} agendamentos e ${result.receivables} recebimentos.`);
        }
        render();
      } catch (error) { alert(error.message || 'Falha ao salvar paciente.'); }
    });
    document.getElementById('expense-category-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const name = normalizeExpenseCategory(fd.get('name'));
      if (name === 'Sem categoria') return alert('Informe um nome válido para a categoria.');
      state.expenseCategories ||= [];
      const existing = expenseCategoryRecord(name);
      if (existing) {
        existing.description = String(fd.get('description') || existing.description || '').trim();
        existing.status = String(fd.get('status') || existing.status || 'Ativa');
        audit('Financeiro', `Categoria de despesa atualizada: ${name}.`);
      } else {
        state.expenseCategories.push({ id: uid('CAT'), code: nextCode('CAT', state.expenseCategories), name, description: String(fd.get('description') || '').trim(), status: String(fd.get('status') || 'Ativa'), createdAt: new Date().toISOString() });
        audit('Financeiro', `Categoria de despesa criada: ${name}.`);
      }
      saveState();
      render();
    });
    document.getElementById('report-filter-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      state.meta.reportType = String(fd.get('reportType') || 'summary');
      state.meta.reportStartDate = String(fd.get('reportStartDate') || '');
      state.meta.reportEndDate = String(fd.get('reportEndDate') || todayIso());
      state.meta.reportClinicFilter = String(fd.get('reportClinicFilter') || 'Todas as clínicas');
      state.meta.reportBankFilter = String(fd.get('reportBankFilter') || 'Todas as contas');
      saveState();
      render();
    });
    document.getElementById('payment-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const rec = state.receivables.find(r => String(r.id) === String(fd.get('receivableId')));
      if (!rec) return;
      rec.amountPaid = Number(fd.get('amountPaid') || 0);
      rec.paymentDate = fd.get('paymentDate') || todayIso();
      rec.bankAccountId = String(fd.get('bankAccountId') || '');
      rec.bankAccountName = bankAccountById(rec.bankAccountId)?.name || '';
      rec.status = receiveStatus(rec);
      try {
        if (rec.amountPaid > 0 && rec.bankAccountId) {
          upsertCashEntryForOrigin('receivable', rec.id, {
            bankAccountId: rec.bankAccountId,
            clinicId: rec.clinicId,
            clinicName: rec.clinicName,
            description: `Recebimento ${rec.code} · ${rec.patientName}`,
            direction: 'Entrada',
            amount: rec.amountPaid,
            movementDate: rec.paymentDate,
            monthName: rec.monthName
          });
        } else {
          removeCashEntriesForOrigin('receivable', rec.id);
        }
        if (useBackend()) {
          await updateBackendRecord('receivables', rec.id, rec);
        } else {
          saveState();
          audit('Financeiro', `Recebimento registrado para ${rec.patientName}: ${money(rec.amountPaid)}.`);
        }
        render();
      } catch (error) { alert(error.message || 'Falha ao registrar recebimento.'); }
    });
    document.getElementById('payable-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const due = String(fd.get('dueDate') || todayIso());
      const clinicName = String(fd.get('clinicName') || currentClinicScopeName() || '');
      const recurrenceType = String(fd.get('recurrenceType') || 'single');
      const recurrenceCount = Math.max(1, Number(fd.get('recurrenceCount') || 1));
      const recurrenceInterval = String(fd.get('recurrenceInterval') || 'monthly');
      const categoryName = normalizeExpenseCategory(fd.get('category'));
      ensureExpenseCategoryExists(categoryName);
      const baseDate = toDate(due);
      const createdItems = [];
      const buildDueDate = index => {
        if (recurrenceType !== 'recurring') return due;
        if (recurrenceInterval === 'daily') return toIso(addDays(baseDate, index));
        if (recurrenceInterval === 'weekly') return toIso(addDays(baseDate, index * 7));
        const d = new Date(baseDate);
        d.setMonth(d.getMonth() + index);
        return toIso(d);
      };
      const total = recurrenceType === 'recurring' ? recurrenceCount : 1;
      try {
        for (let index = 0; index < total; index += 1) {
          const itemDueDate = buildDueDate(index);
          const descriptionBase = String(fd.get('description') || '').trim();
          const item = {
            id: uid('PAG'),
            code: nextCode('PAG', state.payables.concat(createdItems)),
            dueDate: itemDueDate,
            paymentDate: fd.get('paymentDate') || '',
            monthName: monthName(new Date(`${itemDueDate}T00:00:00`).getMonth()),
            category: categoryName,
            description: total > 1 ? `${descriptionBase} · Parcela ${index + 1}/${total}` : descriptionBase,
            clinicName,
            clinicId: findClinicIdByName(clinicName),
            amountPlanned: Number(fd.get('amountPlanned') || 0),
            amountPaid: Number(fd.get('amountPaid') || 0),
            bankAccountId: String(fd.get('bankAccountId') || ''),
            bankAccountName: bankAccountById(String(fd.get('bankAccountId') || ''))?.name || '',
            recurrenceType,
            recurrenceCount: total,
            recurrenceIndex: index + 1,
            recurrenceInterval
          };
          item.status = receiveStatus({ dueDate: item.dueDate, amountPaid: item.amountPaid, amountPlanned: item.amountPlanned });
          createdItems.push(item);
          if (item.amountPaid > 0 && item.bankAccountId) {
            upsertCashEntryForOrigin('payable', item.id, {
              bankAccountId: item.bankAccountId,
              clinicId: item.clinicId,
              clinicName: item.clinicName,
              description: `Pagamento ${item.code} · ${item.description}`,
              category: item.category,
              direction: 'Saída',
              amount: item.amountPaid,
              movementDate: item.paymentDate || todayIso(),
              monthName: item.monthName
            });
          }
          if (useBackend()) {
            await createBackendRecord('payables', item);
          } else {
            state.payables.push(item);
          }
        }
        if (!useBackend()) {
          saveState();
          audit('Financeiro', `Conta(s) a pagar criada(s): ${createdItems.length} lançamento(s) em ${categoryName}.`);
        }
        render();
      } catch (error) { alert(error.message || 'Falha ao salvar conta a pagar.'); }
    });
    document.getElementById('payable-payment-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const pay = state.payables.find(p => String(p.id) === String(fd.get('payableId')));
      if (!pay) return;
      pay.amountPaid = Number(fd.get('amountPaid') || 0);
      pay.paymentDate = fd.get('paymentDate') || todayIso();
      pay.bankAccountId = String(fd.get('bankAccountId') || '');
      pay.bankAccountName = bankAccountById(pay.bankAccountId)?.name || '';
      pay.status = receiveStatus({ dueDate: pay.dueDate, amountPaid: pay.amountPaid, amountPlanned: pay.amountPlanned });
      try {
        if (pay.amountPaid > 0 && pay.bankAccountId) {
          upsertCashEntryForOrigin('payable', pay.id, {
            bankAccountId: pay.bankAccountId,
            clinicId: pay.clinicId,
            clinicName: pay.clinicName,
            description: `Pagamento ${pay.code} · ${pay.description}`,
            category: pay.category,
            direction: 'Saída',
            amount: pay.amountPaid,
            movementDate: pay.paymentDate,
            monthName: pay.monthName
          });
        } else {
          removeCashEntriesForOrigin('payable', pay.id);
        }
        if (useBackend()) {
          await updateBackendRecord('payables', pay.id, pay);
        } else {
          saveState();
          audit('Financeiro', `Pagamento de despesa registrado: ${pay.description} (${money(pay.amountPaid)}).`);
        }
        render();
      } catch (error) { alert(error.message || 'Falha ao registrar pagamento.'); }
    });
    document.getElementById('bank-account-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const item = {
        id: uid('BAN'),
        code: nextCode('BAN', state.bankAccounts || []),
        name: String(fd.get('name') || '').trim(),
        bankName: String(fd.get('bankName') || '').trim(),
        branch: String(fd.get('branch') || '').trim(),
        accountNumber: String(fd.get('accountNumber') || '').trim(),
        type: String(fd.get('type') || 'Conta Corrente'),
        initialBalance: Number(fd.get('initialBalance') || 0),
        status: String(fd.get('status') || 'Ativa'),
        createdAt: todayIso()
      };
      state.bankAccounts ||= [];
      state.bankAccounts.push(item);
      saveState();
      audit('Financeiro', `Conta bancária criada: ${item.name}.`);
      render();
    });
    document.getElementById('cash-entry-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const fd = new FormData(event.target);
      const clinicName = String(fd.get('clinicName') || currentClinicScopeName() || '');
      state.cashEntries ||= [];
      state.cashEntries.push({
        id: uid('CAX'),
        code: nextCode('CAX', state.cashEntries),
        originType: 'manual',
        originId: uid('MAN'),
        bankAccountId: String(fd.get('bankAccountId') || ''),
        bankAccountName: bankAccountById(String(fd.get('bankAccountId') || ''))?.name || '',
        clinicId: findClinicIdByName(clinicName),
        clinicName,
        category: normalizeExpenseCategory(fd.get('category')),
        description: String(fd.get('description') || '').trim(),
        direction: String(fd.get('direction') || 'Entrada'),
        amount: Number(fd.get('amount') || 0),
        movementDate: fd.get('movementDate') || todayIso(),
        monthName: monthName(new Date(`${fd.get('movementDate') || todayIso()}T00:00:00`).getMonth()),
        status: 'Efetivado',
        createdAt: new Date().toISOString()
      });
      ensureExpenseCategoryExists(fd.get('category'));
      saveState();
      audit('Financeiro', `Lançamento manual registrado no caixa${normalizeExpenseCategory(fd.get('category')) !== 'Sem categoria' ? ` · categoria ${normalizeExpenseCategory(fd.get('category'))}` : ''}.`);
      render();
    });
    document.getElementById('agenda-mode')?.addEventListener('change', e => { state.meta.agendaMode = e.target.value; saveState(); render(); });
    document.getElementById('agenda-ref')?.addEventListener('change', e => { state.meta.agendaRefDate = e.target.value || todayIso(); saveState(); render(); });
    document.getElementById('clinical-start-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const fd = new FormData(event.target);
        await startClinicalSessionFlow(String(fd.get('patientId') || ''));
        render();
      } catch (error) {
        alert(error.message || 'Falha ao iniciar atendimento.');
      }
    });
    document.querySelectorAll('.js-open-session').forEach(btn => btn.addEventListener('click', () => { state.meta.selectedClinicalSessionId = btn.dataset.id || ''; saveState(); render(); }));
    document.getElementById('clinical-open-whatsapp-btn')?.addEventListener('click', async () => {
      const checkbox = document.getElementById('clinical-consent-checkbox');
      if (checkbox && !checkbox.checked) {
        alert('Por favor, confirme o consentimento do paciente antes de abrir o WhatsApp.');
        return;
      }
      const session = currentClinicalSession();
      if (session && checkbox?.checked) {
        session.consentConfirmed = true;
        saveState();
      }
      try { await openClinicalWhatsapp(); } catch (error) { alert(error.message || 'Falha ao abrir o WhatsApp.'); }
    });
    document.getElementById('clinical-consent-checkbox')?.addEventListener('change', event => {
      const session = currentClinicalSession();
      if (session) {
        session.consentConfirmed = !!event.target.checked;
        saveState();
      }
    });
    document.getElementById('clinical-copy-link-btn')?.addEventListener('click', async () => {
      const session = currentClinicalSession();
      const url = currentClinicalWhatsappUrl(session);
      if (!url) { alert('Cadastre o telefone do paciente para copiar o link.'); return; }
      try {
        await navigator.clipboard.writeText(url);
        const btn = document.getElementById('clinical-copy-link-btn');
        if (btn) { btn.textContent = '✓ Copiado!'; btn.classList.add('btn-copied'); setTimeout(() => { btn.textContent = 'Copiar link'; btn.classList.remove('btn-copied'); }, 2000); }
      } catch { alert('Não foi possível copiar automaticamente. Link: ' + url); }
    });
    document.getElementById('clinical-copy-phone-btn')?.addEventListener('click', async () => {
      const session = currentClinicalSession();
      const patient = patientById(session?.patientId);
      const phone = patient?.phone || '';
      if (!phone) { alert('Sem telefone cadastrado para este paciente.'); return; }
      const digits = phone.replace(/\D/g,'');
      const formatted = `+55${digits}`;
      try {
        await navigator.clipboard.writeText(formatted);
        const btn = document.getElementById('clinical-copy-phone-btn');
        if (btn) { btn.textContent = '✓ Copiado!'; btn.classList.add('btn-copied'); setTimeout(() => { btn.textContent = 'Copiar número'; btn.classList.remove('btn-copied'); }, 2000); }
      } catch { alert('Não foi possível copiar. Número: ' + formatted); }
    });
    document.getElementById('patient-search-input')?.addEventListener('input', event => {
      patientSearchQuery = event.target.value || '';
      state.meta.patientSearch = patientSearchQuery;
      saveState();
      render();
    });
    document.getElementById('patient-prof-filter')?.addEventListener('change', event => {
      patientProfessionalFilter = event.target.value || '';
      state.meta.patientProfFilter = patientProfessionalFilter;
      saveState();
      render();
    });
    document.getElementById('clinical-gen-evolution-btn')?.addEventListener('click', () => {
      const session = currentClinicalSession();
      const reason = document.getElementById('clinical-main-reason')?.value || session?.mainReason || '';
      const summary = document.getElementById('clinical-summary')?.value || session?.summary || '';
      const subj = document.getElementById('soap-subjective')?.value || session?.soapSubjective || '';
      const obj = document.getElementById('soap-objective')?.value || session?.soapObjective || '';
      const asse = document.getElementById('soap-assessment')?.value || session?.soapAssessment || '';
      const plan = document.getElementById('soap-plan')?.value || session?.soapPlan || '';
      if (!reason && !summary && !subj && !obj && !asse && !plan) {
        alert('Preencha ao menos o resumo ou o SOAP antes de gerar a evolução clínica completa.');
        return;
      }
      const text = generateClinicalEvolution({
        patientName: session?.patientName || '',
        date: fmtDate(session?.scheduledDate || todayIso()),
        mainReason: reason, summary, subjective: subj, objective: obj, assessment: asse, plan
      });
      const evoField = document.getElementById('clinical-full-evolution');
      if (evoField) evoField.value = text;
      if (session) { session.fullEvolution = text; saveState(); queueClinicalDraftSync(session.id, 'manual'); }
      setClinicalRuntimeStatus('Evolução clínica gerada.', 'ok');
    });
    document.getElementById('clinical-gen-anamnesis-btn')?.addEventListener('click', () => {
      const session = currentClinicalSession();
      const patient = patientById(session?.patientId);
      const field = document.getElementById('clinical-anamnesis');
      if (!field) return;
      if (field.value.trim() && !confirm('O campo de anamnese já tem conteúdo. Deseja sobrescrever com o modelo padrão?')) return;
      field.value = generateInitialAnamnesisTemplate(patient);
      if (session) { session.anamnesisInitial = field.value; saveState(); queueClinicalDraftSync(session.id, 'manual'); }
      setClinicalRuntimeStatus('Modelo de anamnese carregado.', 'ok');
    });
    document.getElementById('clinical-print-pdf-btn')?.addEventListener('click', () => {
      const session = currentClinicalSession();
      if (!session) { alert('Nenhuma sessão selecionada.'); return; }
      const patient = patientById(session.patientId);
      const clinicName = session.clinicName || currentClinicScopeName() || state.settings.companyName || 'Agenda Clínica';
      const date = fmtDate(session.scheduledDate || todayIso());
      const html = [
        `<div class="print-header">${state.settings.logoDataUrl ? `<img src="${safe(state.settings.logoDataUrl)}" alt="Logo da clínica" style="width:68px;height:68px;object-fit:cover;border-radius:16px;border:2px solid rgba(255,255,255,.25);margin-bottom:12px" />` : ""}<h1>${safe(clinicName)}</h1><div class="sub">Prontuário clínico pronto para impressão · ${safe(state.settings.supportEmail || '')}</div><div class="meta">Emitido em ${new Date().toLocaleString('pt-BR')}</div></div>`,
        `<div class="print-body">`,
        `<h2>Identificação do atendimento</h2>`,
        `<div class="print-grid"><div class="print-card"><label>Paciente</label><div>${safe(session.patientName || '')}</div></div><div class="print-card"><label>Profissional</label><div>${safe(session.professionalName || '')}</div></div><div class="print-card"><label>Data da sessão</label><div>${date}</div></div><div class="print-card"><label>Código / status</label><div>${safe(session.code)} · ${safe(session.status || '')}</div></div></div>`,
        patient?.clinicalAlerts ? `<div class="alert-box"><strong>⚠ Alertas clínicos:</strong> ${safe(patient.clinicalAlerts)}</div>` : '',
        `<div class="print-grid"><div class="print-card"><label>Data de nascimento</label><div>${patient?.birthDate ? fmtDate(patient.birthDate) : '—'}</div></div><div class="print-card"><label>Telefone</label><div>${patient?.phone ? safe(patient.phone) : '—'}</div></div><div class="print-card"><label>Medicações em uso</label><div>${patient?.medications ? safe(patient.medications) : '—'}</div></div><div class="print-card"><label>Doenças / diagnósticos</label><div>${patient?.diseases ? safe(patient.diseases) : '—'}</div></div></div>`,
        session.mainReason ? `<h2>Motivo principal</h2><p>${safe(session.mainReason)}</p>` : '',
        session.summary ? `<h2>Resumo da sessão</h2><p>${safe(session.summary)}</p>` : '',
        session.fullEvolution ? `<h2>Evolução clínica completa</h2><pre>${safe(session.fullEvolution)}</pre>` : '',
        session.anamnesisInitial ? `<h2>Anamnese inicial</h2><pre>${safe(session.anamnesisInitial)}</pre>` : '',
        '<h2>SOAP</h2>',
        `<div class="soap-grid">${session.soapSubjective ? `<div class="print-card"><label>S — Subjetivo</label><div>${safe(session.soapSubjective)}</div></div>` : ''}${session.soapObjective ? `<div class="print-card"><label>O — Objetivo</label><div>${safe(session.soapObjective)}</div></div>` : ''}${session.soapAssessment ? `<div class="print-card"><label>A — Avaliação</label><div>${safe(session.soapAssessment)}</div></div>` : ''}${session.soapPlan ? `<div class="print-card"><label>P — Plano</label><div>${safe(session.soapPlan)}</div></div>` : ''}</div>`,
        (session.keywords||[]).length ? `<h2>Palavras-chave</h2><p>${safe(session.keywords.join(', '))}</p>` : '',
        `<div class="footer">Documento gerado pelo sistema ${safe(state.settings.brandName || 'Agenda Clínica')} em ${new Date().toLocaleString('pt-BR')}.</div>`,
        `</div>`
      ].filter(Boolean).join('');
      try { openPrintWindow(`Prontuário — ${session.patientName}`, html); }
      catch (err) { alert(err.message || 'Não foi possível abrir a janela de impressão.'); }
    });
    document.getElementById('clinical-end-call-btn')?.addEventListener('click', () => {
      const session = currentClinicalSession();
      if (!session) return;
      session.callStatus = 'retornou_whatsapp';
      saveState();
      queueClinicalDraftSync(session.id, 'manual');
      setClinicalRuntimeStatus('Chamada encerrada. Agora dite ou escreva o resumo e gere o SOAP.', 'ok');
      const btn = document.getElementById('clinical-end-call-btn');
      if (btn) { btn.textContent = '✓ Chamada registrada'; btn.disabled = true; btn.classList.add('btn-copied'); }
      const recordBtn = document.getElementById('clinical-record-summary-btn');
      if (recordBtn) { recordBtn.classList.add('clinical-btn-pulse'); setTimeout(() => recordBtn.classList.remove('clinical-btn-pulse'), 3000); }
    });
    document.getElementById('clinical-copy-soap-btn')?.addEventListener('click', async () => {
      const session = currentClinicalSession();
      if (!session) return;
      const merged = {
        ...session,
        mainReason: document.getElementById('clinical-main-reason')?.value || session.mainReason || '',
        summary: document.getElementById('clinical-summary')?.value || session.summary || '',
        soapSubjective: document.getElementById('soap-subjective')?.value || session.soapSubjective || '',
        soapObjective: document.getElementById('soap-objective')?.value || session.soapObjective || '',
        soapAssessment: document.getElementById('soap-assessment')?.value || session.soapAssessment || '',
        soapPlan: document.getElementById('soap-plan')?.value || session.soapPlan || '',
        fullEvolution: document.getElementById('clinical-full-evolution')?.value || session.fullEvolution || '',
        anamnesisInitial: document.getElementById('clinical-anamnesis')?.value || session.anamnesisInitial || ''
      };
      const lines = buildSoapClipboardText(merged);
      const preview = document.getElementById('clinical-soap-copy-preview');
      if (preview) { preview.textContent = lines; preview.style.display = 'block'; }
      try {
        await navigator.clipboard.writeText(lines);
        const btn = document.getElementById('clinical-copy-soap-btn');
        if (btn) { btn.textContent = '✓ SOAP copiado!'; btn.classList.add('btn-copied'); setTimeout(() => { btn.textContent = '📋 Copiar SOAP completo'; btn.classList.remove('btn-copied'); }, 3000); }
      } catch { alert('Não foi possível copiar automaticamente. Selecione o texto abaixo e copie manualmente.'); }
    });
    document.getElementById('clinical-record-summary-btn')?.addEventListener('click', async () => {
      try { await toggleClinicalVoiceCapture(); } catch (error) { alert(error.message || 'Falha ao capturar resumo por voz.'); }
    });
    document.getElementById('clinical-generate-btn')?.addEventListener('click', () => {
      const live = document.getElementById('clinical-transcript-live')?.value || '';
      const finalText = document.getElementById('clinical-transcript-final')?.value || live;
      const soap = buildSoapFromTranscript(finalText);
      const keywords = extractClinicalKeywords(finalText);
      const summary = summarizeTranscript(finalText);
      const mainReason = document.getElementById('clinical-main-reason')?.value || '';
      const subjective = document.getElementById('soap-subjective');
      const objective = document.getElementById('soap-objective');
      const assessment = document.getElementById('soap-assessment');
      const plan = document.getElementById('soap-plan');
      const summaryField = document.getElementById('clinical-summary');
      if (subjective) subjective.value = mainReason ? `Motivo principal da sessão: ${mainReason}.\n${soap.subjective}` : soap.subjective;
      if (objective) objective.value = soap.objective;
      if (assessment) assessment.value = soap.assessment;
      if (plan) plan.value = soap.plan;
      if (summaryField) summaryField.value = summary;
      const keywordWrap = document.getElementById('clinical-keywords');
      if (keywordWrap) keywordWrap.innerHTML = keywords.length ? keywords.map(item => `<span class="chip">${safe(item)}</span>`).join('') : '<span class="muted">Nenhuma palavra-chave extraída.</span>';
      setClinicalRuntimeStatus('SOAP gerado a partir do resumo atual.', 'ok');
    });
    const clinicalPersist = async finalize => {
      const selected = currentClinicalSession();
      if (!selected) throw new Error('Nenhuma sessão selecionada.');
      if (clinicalSpeechActive) stopClinicalVoiceCapture({ keepStatus: true });
      const payload = currentClinicalDraftPayload();
      await persistClinicalSession(selected.id, { ...payload, endedAt: finalize ? new Date().toISOString() : selected.endedAt || '' }, finalize);
      if (finalize) {
        stopClinicalTimer();
        alert('Prontuário finalizado com sucesso. O agendamento vinculado foi marcado como REALIZADO.');
        render();
      } else {
        setClinicalRuntimeStatus('Prontuário salvo sem encerrar a sessão.', 'ok');
      }
    };
    document.getElementById('clinical-save-btn')?.addEventListener('click', async () => { try { await clinicalPersist(false); } catch (error) { alert(error.message || 'Falha ao salvar prontuário.'); } });
    document.getElementById('clinical-complete-btn')?.addEventListener('click', async () => { try { await clinicalPersist(true); } catch (error) { alert(error.message || 'Falha ao finalizar sessão.'); } });
    document.querySelectorAll('.js-appointment-whatsapp').forEach(btn => btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const id = event.currentTarget.dataset.id;
      const item = (state.appointments || []).find(a => String(a.id) === String(id));
      if (!item) return;
      const url = whatsappLink(item.phone, `Olá ${item.patientName}, lembrando da sessão do dia ${fmtDate(item.date)} às ${item.time}.`);
      if (!url) { alert('Cadastre o telefone / WhatsApp do paciente para enviar o lembrete.'); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
      audit('Agenda', `Lembrete de sessão enviado para ${item.patientName}.`, { entity: 'appointment', before: item.code || '', after: `${item.date} ${item.time}` });
    }));
    document.querySelectorAll('.js-appointment-reschedule').forEach(btn => btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await quickRescheduleAppointment(btn.dataset.id);
    }));
    document.querySelectorAll('.js-appointment-status-action').forEach(btn => btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await quickUpdateAppointmentStatus(btn.dataset.id, btn.dataset.status);
    }));
    document.querySelectorAll('.js-google-sync-one').forEach(btn => btn.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const item = (state.appointments || []).find(a => String(a.id) === String(btn.dataset.id));
      if (!item) return;
      try {
        if (!googleCalendarReady()) throw new Error('Conecte o Google Calendar e deixe a sincronização automática ligada para enviar este agendamento.');
        const result = await syncAppointmentToGoogleCalendar(item, { origin: 'manual-single' });
        const verb = ({ created: 'enviado ao Google Calendar', updated: 'atualizado no Google Calendar', deleted: 'cancelado no Google Calendar', skipped: 'sem alterações necessárias', missing_remote: 'recriado no Google Calendar após detectar ausência do evento remoto' })[result?.status] || 'sincronizado';
        alert(`${item.patientName}: ${verb}.`);
        render();
      } catch (error) {
        alert(error.message || 'Falha ao enviar este agendamento para o Google Calendar.');
        render();
      }
    }));
    if (!window.__agendaRescheduleDelegated) {
      window.__agendaRescheduleDelegated = true;
      document.addEventListener('click', async event => {
        const btn = event.target?.closest?.('.js-appointment-reschedule');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        if (window.quickRescheduleAppointment) await window.quickRescheduleAppointment(btn.dataset.id);
      }, true);
    }
    document.getElementById('password-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      const fd = new FormData(event.target);
      const before = clone(state.settings);
      ensureAccessSettings();
      const submittedAdminPassword = String(fd.get('adminPassword') || '').trim();
      const submittedOperatorPassword = String(fd.get('operatorPassword') || '').trim();
      if (isDesktopApp()) {
        if (submittedAdminPassword) state.settings.adminPassword = submittedAdminPassword;
        if (submittedOperatorPassword) state.settings.operatorPassword = submittedOperatorPassword;
      }
      state.settings.brandName = String(fd.get('brandName') || '').trim() || 'Agenda Clínica';
      state.settings.companyName = String(fd.get('companyName') || '').trim();
      state.settings.supportEmail = String(fd.get('supportEmail') || '').trim();
      if (String(fd.get('removeLogo') || '') === '1') state.settings.logoDataUrl = '';
      const logoFile = event.target.querySelector('input[name="logoFile"]')?.files?.[0];
      if (logoFile) state.settings.logoDataUrl = await readFileAsDataUrl(logoFile);
      state.settings.commercialPlan = String(fd.get('commercialPlan') || '').trim() || 'Essentials';
      state.settings.licenseClinicName = String(fd.get('licenseClinicName') || '').trim() || state.settings.companyName || 'Sua Clínica';
      state.settings.licenseOperatorLimit = Math.max(1, Number(fd.get('licenseOperatorLimit') || 3));
      state.settings.licenseExpiresAt = String(fd.get('licenseExpiresAt') || '').trim();
      state.settings.licenseKey = String(fd.get('licenseKey') || state.settings.licenseKey || '').trim();
      state.settings.enableUpcomingSessionAlert = String(fd.get('enableUpcomingSessionAlert') || '1') === '1';
      state.settings.enableProfessionalReminder = String(fd.get('enableProfessionalReminder') || '1') === '1';
      state.settings.enablePatientReminder = String(fd.get('enablePatientReminder') || '1') === '1';
      state.settings.sessionAlertLeadMinutes = Math.max(1, Number(fd.get('sessionAlertLeadMinutes') || 10));
      state.settings.eveReminderHour = Math.min(23, Math.max(0, Number(fd.get('eveReminderHour') || 19)));
      state.settings.whatsappApiEnabled = String(fd.get('whatsappApiEnabled') || '0') === '1';
      state.settings.whatsappApiVersion = String(fd.get('whatsappApiVersion') || 'v22.0').trim() || 'v22.0';
      state.settings.whatsappPhoneNumberId = String(fd.get('whatsappPhoneNumberId') || '').trim();
      state.settings.whatsappAccessToken = String(fd.get('whatsappAccessToken') || '').trim();
      state.settings.whatsappBusinessNumber = String(fd.get('whatsappBusinessNumber') || '').trim();
      state.settings.consentTemplate = String(fd.get('consentTemplate') || '').trim() || defaultState().settings.consentTemplate;
      state.settings.clinicalKeywordLibrary = String(fd.get('clinicalKeywordLibrary') || '').trim() || defaultState().settings.clinicalKeywordLibrary;
      state.settings.firstRunCompleted = true;
      if (!isDesktopApp()) {
        state.settings.backendUrl = String(fd.get('backendUrl') || '').trim() || 'http://127.0.0.1:8000';
        state.settings.authMode = String(fd.get('authMode') || 'local');
        state.settings.backendEmail = String(fd.get('backendEmail') || '').trim() || 'admin@agendaclinica.local';
        if (api) api.apiBase = state.settings.backendUrl;
      } else {
        state.settings.authMode = 'local';
      }
      ensureAccessSettings();
      const adminUser = (state.settings.localUsers || []).find(user => user.role === 'ADMIN');
      if (isDesktopApp() && adminUser && submittedAdminPassword) { adminUser.password = submittedAdminPassword; adminUser.name = adminUser.name || 'Administrador'; adminUser.status = 'Ativo'; }
      const firstOperator = (state.settings.localUsers || []).find(user => user.role === 'OPERADOR');
      if (isDesktopApp() && firstOperator && submittedOperatorPassword) firstOperator.password = submittedOperatorPassword;
      state.settings.licensePreviewKey = buildLicenseKey(state.settings);
      if (!state.settings.licenseKey && isDesktopApp()) state.settings.licenseKey = state.settings.licensePreviewKey;
      if (!isDesktopApp() && useBackend()) {
        try {
          if (api?.updateLicense) {
            const remoteLicense = await api.updateLicense(apiBase(), state.session.token, {
              companyName: state.settings.licenseClinicName || state.settings.companyName || 'Sua Clínica',
              planName: state.settings.commercialPlan || 'Essentials',
              status: 'ATIVA',
              maxUsers: state.settings.licenseOperatorLimit || 3,
              expiresAt: state.settings.licenseExpiresAt || '',
              graceDays: 7
            });
            if (remoteLicense?.companyName) state.settings.licenseClinicName = remoteLicense.companyName;
            if (remoteLicense?.planName) state.settings.commercialPlan = remoteLicense.planName;
            if (remoteLicense?.maxUsers != null) state.settings.licenseOperatorLimit = Math.max(1, Number(remoteLicense.maxUsers || 1));
            if (remoteLicense?.expiresAt != null) state.settings.licenseExpiresAt = String(remoteLicense.expiresAt || '').slice(0, 10);
            if (remoteLicense?.activationCode != null) state.settings.licenseKey = String(remoteLicense.activationCode || '');
            state.meta.backendLicense = clone(remoteLicense || null);
          }
          if ((submittedAdminPassword || submittedOperatorPassword) && api?.updateUser) {
            let backendUsers = Array.isArray(state.meta.backendUsers) ? [...state.meta.backendUsers] : [];
            if (!backendUsers.length && api?.getUsers) {
              backendUsers = await api.getUsers(apiBase(), state.session.token).catch(() => []);
              state.meta.backendUsers = clone(backendUsers || []);
            }
            const adminEmail = String(state.settings.backendEmail || state.session?.email || 'admin@agendaclinica.local').trim().toLowerCase();
            const backendAdmin = backendUsers.find(user => user.role === 'ADMIN' && String(user.email || '').trim().toLowerCase() === adminEmail)
              || backendUsers.find(user => user.role === 'ADMIN');
            const backendOperator = backendUsers.find(user => user.role === 'OPERADOR');
            if (submittedAdminPassword) {
              if (!backendAdmin) throw new Error('Usuário ADMIN do backend não encontrado para troca de senha.');
              await api.updateUser(apiBase(), state.session.token, backendAdmin.id, { password: submittedAdminPassword });
            }
            if (submittedOperatorPassword) {
              if (!backendOperator) throw new Error('Usuário OPERADOR do backend não encontrado para troca de senha.');
              await api.updateUser(apiBase(), state.session.token, backendOperator.id, { password: submittedOperatorPassword });
            }
            state.settings.adminPassword = '';
            state.settings.operatorPassword = '';
          }
          await syncStateFromBackend();
        } catch (error) {
          console.error('Falha ao sincronizar segurança/licença no backend', error);
          alert(error.message || 'Falha ao atualizar senha/licença no backend.');
          return;
        }
      }
      saveState();
      audit('Configuração', 'Painel admin atualizado.', { entity: 'settings', before, after: state.settings });
      alert('Painel admin atualizado.');
      render();
    });
    document.getElementById('reset-app')?.addEventListener('click', async () => {
      try { requireAdmin(); } catch (error) { alert(error.message); return; }
      if (!confirm('Deseja apagar todos os dados locais deste navegador?')) return;
      const preservedSettings = clone(state.settings);
      const preservedSession = clone(state.session);
      const before = { clinics: state.clinics.length, professionals: state.professionals.length, patients: state.patients.length, appointments: state.appointments.length, receivables: state.receivables.length, payables: state.payables.length };
      try {
        if (useBackend()) {
          await clearBackendAll();
          state = defaultState();
          state.settings = { ...state.settings, ...preservedSettings };
          state.session = preservedSession;
          await syncStateFromBackend();
        } else {
          state = defaultState();
          state.settings = { ...state.settings, ...preservedSettings };
          state.session = preservedSession;
          saveState();
          audit('Limpeza administrativa', 'Base local reinicializada.', { entity: 'database', before, after: 'estado padrão' });
        }
        render();
      } catch (error) {
        alert(error.message || 'Falha ao apagar dados.');
      }
    });
  }

  async function render() {
    if (handleGoogleOAuthPopupCallback()) return;
    patientSearchQuery = String(state.meta.patientSearch || '');
    patientProfessionalFilter = String(state.meta.patientProfFilter || '');
    if (state.meta.route !== 'atendimentos' || !state.session) {
      stopDailyAutomation();
      stopClinicalVoiceCapture({ keepStatus: true });
      stopClinicalTimer();
    }
    ensureAccessSettings();
    if (!state.session) { clearTimeout(idleTimer); idleTimer = null; stopCommunicationAutomation(); }
    app.innerHTML = state.session ? currentView() : authScreen();
    ensureRequiredGuard(document);
    if (!state.session) {
      document.getElementById('login-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const fd = new FormData(event.target);
        const authMode = isDesktopApp() ? 'local' : String(fd.get('authMode') || 'local');
        const selectedUser = localUserById(String(fd.get('userId') || ''));
        const role = String(selectedUser?.role || 'ADMIN');
        const password = String(fd.get('password') || '');
        state.settings.authMode = authMode;
        if (!isDesktopApp()) {
          state.settings.backendUrl = String(fd.get('backendUrl') || '').trim() || state.settings.backendUrl;
          state.settings.backendEmail = String(fd.get('email') || '').trim() || state.settings.backendEmail;
        }
        saveState();
        try {
          if (!isDesktopApp() && authMode === 'saas') {
            if (!api) throw new Error('Camada de API não carregada.');
            if (!state.settings.backendUrl) throw new Error('Informe a URL do backend SaaS.');
            const result = await api.login(apiBase(), state.settings.backendEmail, password);
            state.session = { role: result.user.role, name: result.user.name, email: result.user.email, at: new Date().toISOString(), token: result.token, authMode: 'saas' };
            state.meta.onboardingOpen = !state.settings.firstRunCompleted;
            resetIdleTimer();
            startAutoBackup();
            if (api) {
              api.apiBase = apiBase();
              api.token = result.token;
            }
            saveState();
            await syncStateFromBackend();
          } else {
            ensureAccessSettings();
            const license = licenseStatus();
            if (!license.valid) throw new Error(license.reason || 'Licença inválida.');
            const user = selectedUser || activeLocalUsers().find(item => item.role === role) || null;
            if (!user) throw new Error('Usuário local não encontrado.');
            if (user.status === 'Inativo') throw new Error('Este usuário está inativo.');
            if (password != String(user.password || '')) throw new Error('Senha inválida.');
            state.session = { role: user.role, userId: user.id, name: user.name, at: new Date().toISOString(), authMode: 'local' };
            state.meta.onboardingOpen = !state.settings.firstRunCompleted;
            saveState();
            resetIdleTimer();
            startAutoBackup();
            audit('Login', `Acesso concedido para ${user.name}.`);
          }
          render();
        } catch (error) {
          alert(error.message || 'Falha ao autenticar.');
        }
      });
      return;
    }
    enrichCollections();
    bindCommonEvents();
    bindRouteForms();
    bindActionButtons();
    if (state.meta.route === 'atendimentos') await hydrateClinicalSessionPanel();
    startCommunicationAutomation();
  }

  if (!isDesktopApp()) {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredPrompt = event;
      if (state.session) render();
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      audit('Instalação', 'Aplicativo instalado no dispositivo.');
    });
  }

  async function clearBrowserCaches() {
    if (isDesktopApp()) return;
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) await registration.unregister();
      }
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(name => caches.delete(name)));
      }
    } catch (_) {}
  }

  if (!window.__agendaHelpShortcutBound) {
    window.__agendaHelpShortcutBound = true;
    window.addEventListener('keydown', event => {
      if (event.key === 'F1') {
        event.preventDefault();
        if (!state.session) return;
        state.meta.helpOpen = state.meta.helpOpen ? false : true;
        saveState();
        render();
      }
    });
  }
  attachIdleActivityListeners();
  clearBrowserCaches().finally(() => {
    render();
  });
})();
