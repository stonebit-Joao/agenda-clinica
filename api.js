(() => {
  const STORAGE_KEYS = {
    apiBase: 'agenda-clinica-api-base',
    token: 'agenda-clinica-api-token'
  };

  const camelMap = {
    clinic_id: 'clinicId',
    professional_id: 'professionalId',
    patient_id: 'patientId',
    user_id: 'userId',
    appointment_id: 'appointmentId',
    amount_planned: 'amountPlanned',
    amount_paid: 'amountPaid',
    due_date: 'dueDate',
    payment_date: 'paymentDate',
    month_name: 'monthName',
    monthly_fee: 'monthlyFee',
    payment_day: 'paymentDay',
    billing_type: 'billingType',
    registration_date: 'registrationDate',
    consent_recording: 'consentRecording',
    consent_signed_at: 'consentSignedAt',
    consent_text: 'consentText',
    clinical_alerts: 'clinicalAlerts',
    scheduled_date: 'scheduledDate',
    started_at: 'startedAt',
    ended_at: 'endedAt',
    duration_minutes: 'durationMinutes',
    call_status: 'callStatus',
    room_name: 'roomName',
    room_url: 'roomUrl',
    daily_room_url: 'dailyRoomUrl',
    recording_id: 'recordingId',
    recording_url: 'recordingUrl',
    transcript_live: 'transcriptLive',
    transcript_final: 'transcriptFinal',
    transcript_segments: 'transcriptSegments',
    soap_subjective: 'soapSubjective',
    soap_objective: 'soapObjective',
    soap_assessment: 'soapAssessment',
    soap_plan: 'soapPlan',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    before_json: 'before',
    after_json: 'after'
  };

  const reverseMap = Object.fromEntries(Object.entries(camelMap).map(([key, value]) => [value, key]));

  function normalizeId(value) {
    return value == null || value === '' ? '' : String(value);
  }

  function readStored(key) {
    try { return window.localStorage.getItem(key) || ''; } catch { return ''; }
  }

  function writeStored(key, value) {
    try {
      if (!value) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch {
      // noop
    }
  }

  function resolveBase(baseUrl = '') {
    return String(baseUrl || window.AGENDA_API_BASE || readStored(STORAGE_KEYS.apiBase) || '').trim().replace(/\/$/, '');
  }

  function tryParseJson(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  function camelize(row = {}) {
    const out = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      out[camelMap[key] || key] = value;
    });
    if ('id' in out) out.id = normalizeId(out.id);
    ['clinicId', 'professionalId', 'patientId', 'userId', 'appointmentId'].forEach(key => {
      if (key in out) out[key] = normalizeId(out[key]);
    });
    if ('before' in out) out.before = tryParseJson(out.before);
    if ('after' in out) out.after = tryParseJson(out.after);
    if ('keywords' in out) out.keywords = tryParseJson(out.keywords) || [];
    if ('transcriptSegments' in out) out.transcriptSegments = tryParseJson(out.transcriptSegments) || [];
    if ('createdAt' in out && !out.at) out.at = out.createdAt;
    return out;
  }

  function decamelize(row = {}) {
    const out = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if ([
        'id', 'createdAt', 'updatedAt', 'at', 'actor', 'role', 'route', 'detail', 'entity', 'action', 'before', 'after', 'origin',
        'patientName', 'professionalName', 'clinicName', 'phone', 'configKey'
      ].includes(key)) return;
      const nextKey = reverseMap[key] || key;
      if (['keywords', 'transcriptSegments'].includes(key) && typeof value !== 'string') out[nextKey] = JSON.stringify(value || []);
      else out[nextKey] = value;
    });
    return out;
  }

  async function request(baseUrl, path, options = {}) {
    const resolvedBase = resolveBase(baseUrl);
    if (!resolvedBase) throw new Error('API_BASE não configurada. O app permanecerá no modo local/offline até informar a URL do backend.');
    const url = `${resolvedBase}${path}`;
    const headers = { ...(options.headers || {}) };
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { ...options, headers });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!response.ok) throw new Error(data?.error || `Erro HTTP ${response.status}`);
    return data;
  }

  async function apiFetch(resource, id = '', method = 'GET', body = null, baseUrl = '', token = '') {
    return request(baseUrl, `/api/${resource}${id ? `/${id}` : ''}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: body == null ? undefined : JSON.stringify(decamelize(body))
    });
  }

  async function login(baseUrl, email, password) {
    const data = await request(baseUrl, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data?.token) writeStored(STORAGE_KEYS.token, data.token);
    if (resolveBase(baseUrl)) writeStored(STORAGE_KEYS.apiBase, resolveBase(baseUrl));
    return data;
  }

  async function health(baseUrl) { return request(baseUrl, '/health'); }
  async function getResource(baseUrl, token, resource) {
    const rows = await apiFetch(resource, '', 'GET', null, baseUrl, token);
    return Array.isArray(rows) ? rows.map(camelize) : [];
  }
  async function createResource(baseUrl, token, resource, payload) { return camelize(await apiFetch(resource, '', 'POST', payload, baseUrl, token) || {}); }
  async function updateResource(baseUrl, token, resource, id, payload) { return camelize(await apiFetch(resource, id, 'PUT', payload, baseUrl, token) || {}); }
  async function deleteResource(baseUrl, token, resource, id) { return apiFetch(resource, id, 'DELETE', null, baseUrl, token); }
  async function getDashboard(baseUrl, token) { return request(baseUrl, '/api/dashboard/summary', { headers: { Authorization: `Bearer ${token}` } }); }
  async function getAudits(baseUrl, token) {
    const rows = await request(baseUrl, '/api/audits', { headers: { Authorization: `Bearer ${token}` } });
    return Array.isArray(rows) ? rows.map(camelize).map(item => ({ ...item, at: item.at || item.createdAt || new Date().toISOString() })) : [];
  }
  async function getUsers(baseUrl, token) {
    const rows = await request(baseUrl, '/api/users', { headers: { Authorization: `Bearer ${token}` } });
    return Array.isArray(rows) ? rows.map(camelize) : [];
  }
  async function createUser(baseUrl, token, payload) {
    return camelize(await request(baseUrl, '/api/users', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(decamelize(payload || {})) }) || {});
  }
  async function updateUser(baseUrl, token, id, payload) {
    return camelize(await request(baseUrl, `/api/users/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(decamelize(payload || {})) }) || {});
  }
  async function changePassword(baseUrl, token, payload) {
    return camelize(await request(baseUrl, '/api/auth/change-password', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(decamelize(payload || {})) }) || {});
  }
  async function deleteUser(baseUrl, token, id) {
    return request(baseUrl, `/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
  async function getLicense(baseUrl, token) {
    return camelize(await request(baseUrl, '/api/license', { headers: { Authorization: `Bearer ${token}` } }) || {});
  }
  async function updateLicense(baseUrl, token, payload) {
    return camelize(await request(baseUrl, '/api/license', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(decamelize(payload || {})) }) || {});
  }
  async function exportFullBackup(baseUrl, token) {
    const data = await request(baseUrl, '/api/export/full-backup', { headers: { Authorization: `Bearer ${token}` } });
    const normalized = {};
    Object.entries(data || {}).forEach(([key, value]) => { normalized[key] = Array.isArray(value) ? value.map(camelize) : value; });
    return normalized;
  }
  async function getDailyConfig(baseUrl, token) {
    return request(baseUrl, '/api/daily/config', { headers: { Authorization: `Bearer ${token}` } });
  }
  async function startClinicalSession(baseUrl, token, payload) {
    const data = await request(baseUrl, '/api/clinical-sessions/start', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(decamelize(payload || {}))
    });
    return { ...data, session: camelize(data?.session || {}) };
  }
  async function completeClinicalSession(baseUrl, token, id, payload) {
    const data = await request(baseUrl, `/api/clinical-sessions/${id}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(decamelize(payload || {}))
    });
    return camelize(data || {});
  }

  async function loadAll(baseUrl, token, includeAdmin = false) {
    const [summary, clinics, professionals, patients, appointments, receivables, payables, sessions, audits, users, license] = await Promise.all([
      getDashboard(baseUrl, token),
      getResource(baseUrl, token, 'clinics'),
      getResource(baseUrl, token, 'professionals'),
      getResource(baseUrl, token, 'patients'),
      getResource(baseUrl, token, 'appointments'),
      getResource(baseUrl, token, 'receivables'),
      getResource(baseUrl, token, 'payables'),
      getResource(baseUrl, token, 'sessions').catch(() => []),
      includeAdmin ? getAudits(baseUrl, token).catch(() => []) : Promise.resolve([]),
      includeAdmin ? getUsers(baseUrl, token).catch(() => []) : Promise.resolve([]),
      includeAdmin ? getLicense(baseUrl, token).catch(() => null) : Promise.resolve(null)
    ]);
    return { summary, clinics, professionals, patients, appointments, receivables, payables, sessions, audits, users, license };
  }

  const api = {
    get apiBase() { return resolveBase(); },
    set apiBase(value) { const normalized = resolveBase(value); window.AGENDA_API_BASE = normalized; writeStored(STORAGE_KEYS.apiBase, normalized); },
    get token() { return readStored(STORAGE_KEYS.token); },
    set token(value) { writeStored(STORAGE_KEYS.token, value || ''); },
    clearToken() { writeStored(STORAGE_KEYS.token, ''); },
    isOfflineConfigured() { return !resolveBase(); },
    camelize,
    decamelize,
    request,
    fetch: apiFetch,
    login,
    health,
    getResource,
    createResource,
    updateResource,
    deleteResource,
    getDashboard,
    getAudits,
    getUsers,
    createUser,
    updateUser,
    changePassword,
    deleteUser,
    getLicense,
    updateLicense,
    exportFullBackup,
    getDailyConfig,
    startClinicalSession,
    completeClinicalSession,
    loadAll
  };

  window.AgendaApi = api;
})();
