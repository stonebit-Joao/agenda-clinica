from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any

import jwt
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = os.getenv('DATABASE_PATH', str(DATA_DIR / 'agenda_clinica.db'))
JWT_SECRET = os.getenv('JWT_SECRET', 'troque-este-segredo-em-producao')
JWT_EXPIRES_HOURS = int(os.getenv('JWT_EXPIRES_HOURS', '12'))
LICENSE_SECRET = os.getenv('LICENSE_SECRET', JWT_SECRET)
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@agendaclinica.local')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'Admin@2026')
APP_ORIGIN = os.getenv('APP_ORIGIN', '*')
DAILY_API_KEY = os.getenv('DAILY_API_KEY', '').strip()
DAILY_DOMAIN = os.getenv('DAILY_DOMAIN', '').strip().rstrip('/')
WEB_DIR = BASE_DIR / 'web'

app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path='')

RESOURCE_COLUMNS = {
    'clinics': ['code', 'name', 'cnpj', 'manager', 'phone', 'email', 'address', 'status'],
    'professionals': ['code', 'name', 'specialty', 'registry', 'phone', 'email', 'clinic_id', 'status'],
    'patients': ['code', 'name', 'cpf', 'phone', 'email', 'professional_id', 'clinic_id', 'frequency', 'weekday', 'time', 'monthly_fee', 'payment_day', 'billing_type', 'status', 'registration_date', 'consent_recording', 'consent_signed_at', 'consent_text', 'clinical_alerts'],
    'appointments': ['code', 'patient_id', 'professional_id', 'clinic_id', 'date', 'time', 'frequency', 'status', 'month_name', 'note'],
    'receivables': ['code', 'patient_id', 'professional_id', 'clinic_id', 'amount_planned', 'amount_paid', 'due_date', 'payment_date', 'competence', 'month_name', 'status'],
    'payables': ['code', 'clinic_id', 'category', 'description', 'amount_planned', 'amount_paid', 'due_date', 'payment_date', 'month_name', 'status'],
    'sessions': ['code', 'patient_id', 'professional_id', 'clinic_id', 'appointment_id', 'scheduled_date', 'started_at', 'ended_at', 'duration_minutes', 'call_status', 'room_name', 'room_url', 'daily_room_url', 'recording_id', 'recording_url', 'transcript_live', 'transcript_final', 'transcript_segments', 'keywords', 'soap_subjective', 'soap_objective', 'soap_assessment', 'soap_plan', 'summary', 'status'],
}


CONSENT_DEFAULT_TEXT = (
    'Autorizo o registro da sessão por gravação e transcrição exclusivamente para fins clínicos, '
    'prontuário, auditoria e continuidade terapêutica, conforme as políticas da clínica.'
)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def password_policy_error(password: str) -> str | None:
    pwd = str(password or '')
    if len(pwd) < 8:
        return 'A senha precisa ter pelo menos 8 caracteres.'
    if not re.search(r'[A-Z]', pwd):
        return 'A senha precisa ter pelo menos 1 letra maiúscula.'
    if not re.search(r'[a-z]', pwd):
        return 'A senha precisa ter pelo menos 1 letra minúscula.'
    if not re.search(r'\d', pwd):
        return 'A senha precisa ter pelo menos 1 número.'
    return None


def normalize_license_expiry(value: Any) -> str:
    raw = str(value or '').strip()
    if not raw:
        return ''
    return raw[:10]


def build_activation_code(company_name: str, plan_name: str, max_users: Any, expires_at: Any) -> str:
    company = re.sub(r'[^A-Z0-9]', '', str(company_name or '').upper())[:6] or 'CLINIC'
    plan = re.sub(r'[^A-Z0-9]', '', str(plan_name or '').upper())[:4] or 'PLAN'
    limit = str(max(1, safe_int(max_users, 1))).zfill(2)
    expiry = re.sub(r'\D', '', normalize_license_expiry(expires_at))[:8] or 'PERMANENTE'
    payload = f'{company}|{plan}|{limit}|{expiry}|AGENDA-CLINICA'
    signature = hmac.new(LICENSE_SECRET.encode('utf-8'), payload.encode('utf-8'), hashlib.sha256).hexdigest().upper()[:10]
    return f'LIC-{company}-{plan}-{limit}-{expiry}-{signature}'


def get_db() -> sqlite3.Connection:
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = APP_ORIGIN
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


@app.teardown_appcontext
def close_db(_error=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cur = get_db().execute(sql, params)
    rows = [dict(row) for row in cur.fetchall()]
    cur.close()
    return rows


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    cur = get_db().execute(sql, params)
    row = cur.fetchone()
    cur.close()
    return dict(row) if row else None


def execute(sql: str, params: tuple[Any, ...] = ()) -> int:
    db = get_db()
    cur = db.execute(sql, params)
    db.commit()
    lastrowid = cur.lastrowid
    cur.close()
    return lastrowid


def audit(user_id: int | None, actor: str, role: str, action: str, entity: str, detail: str, before: Any = None, after: Any = None):
    execute(
        '''
        INSERT INTO audits (user_id, actor, role, action, entity, detail, before_json, after_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        (
            user_id,
            actor,
            role,
            action,
            entity,
            detail,
            json.dumps(before, ensure_ascii=False) if before is not None else None,
            json.dumps(after, ensure_ascii=False) if after is not None else None,
            utcnow(),
        ),
    )


def token_for_user(user: dict[str, Any]) -> str:
    payload = {
        'sub': str(user['id']),
        'name': user['name'],
        'email': user['email'],
        'role': user['role'],
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRES_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')


def auth_required(admin_only: bool = False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if request.method == 'OPTIONS':
                return ('', 204)
            header = request.headers.get('Authorization', '')
            token = header.removeprefix('Bearer ').strip()
            if not token:
                return jsonify({'error': 'Token ausente'}), 401
            try:
                payload = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            except jwt.PyJWTError:
                return jsonify({'error': 'Token inválido'}), 401
            user = query_one('SELECT id, name, email, role, active FROM users WHERE id = ?', (int(payload['sub']),))
            if not user or not user['active']:
                return jsonify({'error': 'Usuário inativo'}), 403
            if admin_only and user['role'] != 'ADMIN':
                return jsonify({'error': 'Acesso restrito ao ADMIN'}), 403
            g.current_user = user
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def ensure_column(db: sqlite3.Connection, table: str, column: str, definition: str):
    cols = {row[1] for row in db.execute(f'PRAGMA table_info({table})').fetchall()}
    if column not in cols:
        db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')


def ensure_schema():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        '''
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('ADMIN', 'OPERADOR')),
            clinic_id INTEGER NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clinics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT NOT NULL,
            cnpj TEXT,
            manager TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            status TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS professionals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT NOT NULL,
            specialty TEXT,
            registry TEXT,
            phone TEXT,
            email TEXT,
            clinic_id INTEGER,
            status TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT NOT NULL,
            cpf TEXT,
            phone TEXT,
            email TEXT,
            professional_id INTEGER,
            clinic_id INTEGER,
            frequency TEXT,
            weekday TEXT,
            time TEXT,
            monthly_fee REAL DEFAULT 0,
            payment_day INTEGER DEFAULT 1,
            billing_type TEXT,
            status TEXT,
            registration_date TEXT,
            consent_recording INTEGER DEFAULT 0,
            consent_signed_at TEXT,
            consent_text TEXT,
            clinical_alerts TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            patient_id INTEGER,
            professional_id INTEGER,
            clinic_id INTEGER,
            date TEXT,
            time TEXT,
            frequency TEXT,
            status TEXT,
            month_name TEXT,
            note TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY(professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS receivables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            patient_id INTEGER,
            professional_id INTEGER,
            clinic_id INTEGER,
            amount_planned REAL DEFAULT 0,
            amount_paid REAL DEFAULT 0,
            due_date TEXT,
            payment_date TEXT,
            competence TEXT,
            month_name TEXT,
            status TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY(professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS payables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            clinic_id INTEGER,
            category TEXT,
            description TEXT,
            amount_planned REAL DEFAULT 0,
            amount_paid REAL DEFAULT 0,
            due_date TEXT,
            payment_date TEXT,
            month_name TEXT,
            status TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            patient_id INTEGER,
            professional_id INTEGER,
            clinic_id INTEGER,
            appointment_id INTEGER,
            scheduled_date TEXT,
            started_at TEXT,
            ended_at TEXT,
            duration_minutes REAL DEFAULT 0,
            call_status TEXT,
            room_name TEXT,
            room_url TEXT,
            daily_room_url TEXT,
            recording_id TEXT,
            recording_url TEXT,
            transcript_live TEXT,
            transcript_final TEXT,
            transcript_segments TEXT,
            keywords TEXT,
            soap_subjective TEXT,
            soap_objective TEXT,
            soap_assessment TEXT,
            soap_plan TEXT,
            summary TEXT,
            status TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(patient_id) REFERENCES patients(id) ON DELETE CASCADE,
            FOREIGN KEY(professional_id) REFERENCES professionals(id) ON DELETE SET NULL,
            FOREIGN KEY(clinic_id) REFERENCES clinics(id) ON DELETE SET NULL,
            FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            actor TEXT NOT NULL,
            role TEXT NOT NULL,
            action TEXT NOT NULL,
            entity TEXT NOT NULL,
            detail TEXT NOT NULL,
            before_json TEXT,
            after_json TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS license_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            company_name TEXT,
            plan_name TEXT,
            status TEXT NOT NULL DEFAULT 'TRIAL',
            activation_code TEXT,
            max_users INTEGER NOT NULL DEFAULT 5,
            expires_at TEXT,
            grace_days INTEGER NOT NULL DEFAULT 7,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        '''
    )
    ensure_column(db, 'patients', 'consent_recording', 'INTEGER DEFAULT 0')
    ensure_column(db, 'patients', 'consent_signed_at', 'TEXT')
    ensure_column(db, 'patients', 'consent_text', 'TEXT')
    ensure_column(db, 'patients', 'clinical_alerts', 'TEXT')
    for col, definition in {
        'appointment_id': 'INTEGER',
        'scheduled_date': 'TEXT',
        'started_at': 'TEXT',
        'ended_at': 'TEXT',
        'duration_minutes': 'REAL DEFAULT 0',
        'call_status': 'TEXT',
        'room_name': 'TEXT',
        'room_url': 'TEXT',
        'daily_room_url': 'TEXT',
        'recording_id': 'TEXT',
        'recording_url': 'TEXT',
        'transcript_live': 'TEXT',
        'transcript_final': 'TEXT',
        'transcript_segments': 'TEXT',
        'keywords': 'TEXT',
        'soap_subjective': 'TEXT',
        'soap_objective': 'TEXT',
        'soap_assessment': 'TEXT',
        'soap_plan': 'TEXT',
        'summary': 'TEXT',
        'status': 'TEXT',
    }.items():
        ensure_column(db, 'sessions', col, definition)
    admin = db.execute('SELECT id FROM users WHERE email = ?', (ADMIN_EMAIL,)).fetchone()
    if not admin:
        db.execute(
            'INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
            ('Administrador', ADMIN_EMAIL, generate_password_hash(ADMIN_PASSWORD), 'ADMIN', utcnow()),
        )
    license_row = db.execute('SELECT id FROM license_settings WHERE id = 1').fetchone()
    if not license_row:
        created = utcnow()
        trial_until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        db.execute(
            'INSERT INTO license_settings (id, company_name, plan_name, status, activation_code, max_users, expires_at, grace_days, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ('Sua Clínica', 'Trial de implantação', 'TRIAL', '', 5, trial_until, 7, created, created),
        )
    db.commit()
    db.close()


def next_code(resource: str, prefix: str) -> str:
    row = query_one(f'SELECT MAX(id) AS max_id FROM {resource}')
    next_id = int((row or {}).get('max_id') or 0) + 1
    size = 4 if prefix in {'AGD', 'REC', 'SES'} else 3
    return f'{prefix}-{str(next_id).zfill(size)}'


def slugify(value: str) -> str:
    text = re.sub(r'[^a-zA-Z0-9]+', '-', value or '').strip('-').lower()
    return text[:60] or 'sessao'


def normalize_json_text(value: Any, default: str) -> str:
    if value is None or value == '':
        return default
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


def normalize_resource_value(resource: str, column: str, value: Any) -> Any:
    if resource == 'patients' and column == 'consent_recording':
        return 1 if value else 0
    if resource == 'patients' and column == 'consent_text':
        return value or CONSENT_DEFAULT_TEXT
    if resource == 'sessions' and column in {'keywords', 'transcript_segments'}:
        return normalize_json_text(value, '[]')
    return value


def payload_for_resource(resource: str) -> dict[str, Any]:
    body = request.get_json(force=True, silent=True) or {}
    return {column: normalize_resource_value(resource, column, body.get(column)) for column in RESOURCE_COLUMNS[resource]}


def list_sql(resource: str) -> str:
    order_field = 'date' if resource == 'appointments' else 'created_at'
    return f'SELECT * FROM {resource} ORDER BY {order_field} DESC, id DESC'


def resolve_daily_config(body: dict[str, Any]) -> dict[str, str]:
    domain = str(body.get('daily_domain') or DAILY_DOMAIN or '').strip().rstrip('/')
    api_key = str(body.get('daily_api_key') or DAILY_API_KEY or '').strip()
    return {'domain': domain, 'api_key': api_key}


def create_daily_room(config: dict[str, str], patient_name: str) -> dict[str, Any]:
    if not config.get('domain') or not config.get('api_key'):
        return {'enabled': False, 'room_name': '', 'room_url': ''}
    room_name = f"sessao-{slugify(patient_name)}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    payload = {
        'name': room_name,
        'properties': {
            'enable_prejoin_ui': True,
            'enable_knocking': False,
            'enable_recording': 'cloud',
            'start_video_off': False,
            'start_audio_off': False,
            'exp': int((datetime.now(timezone.utc) + timedelta(hours=8)).timestamp()),
        },
    }
    req = urllib.request.Request(
        'https://api.daily.co/v1/rooms',
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['api_key']}",
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            data = json.loads(response.read().decode('utf-8'))
        room_url = data.get('url') or f"https://{config['domain']}/{room_name}"
        return {'enabled': True, 'room_name': room_name, 'room_url': room_url, 'daily': data}
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', errors='ignore')
        raise RuntimeError(f'Falha ao criar sala Daily: {detail or error.reason}') from error
    except urllib.error.URLError as error:
        raise RuntimeError(f'Falha de comunicação com Daily: {error.reason}') from error


def calculate_duration_minutes(started_at: str | None, ended_at: str | None) -> float:
    try:
        if not started_at or not ended_at:
            return 0
        start_dt = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(ended_at.replace('Z', '+00:00'))
        return round(max((end_dt - start_dt).total_seconds(), 0) / 60, 2)
    except ValueError:
        return 0


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except ValueError:
        return None


def get_license_settings() -> dict[str, Any]:
    row = query_one('SELECT * FROM license_settings WHERE id = 1') or {}
    expires_at = row.get('expires_at')
    expires_dt = parse_iso_datetime(expires_at)
    now = datetime.now(timezone.utc)
    expired = bool(expires_dt and expires_dt < now)
    status = str(row.get('status') or 'TRIAL').upper()
    active = status in {'TRIAL', 'ATIVA'} and not expired
    days_left = None
    if expires_dt:
        days_left = (expires_dt.date() - now.date()).days
    return {
        'company_name': row.get('company_name') or 'Sua Clínica',
        'plan_name': row.get('plan_name') or 'Trial de implantação',
        'status': 'EXPIRADA' if expired and status in {'TRIAL', 'ATIVA'} else status,
        'activation_code': row.get('activation_code') or '',
        'max_users': int(row.get('max_users') or 5),
        'expires_at': expires_at or '',
        'grace_days': int(row.get('grace_days') or 7),
        'active': active,
        'days_left': days_left,
        'created_at': row.get('created_at') or '',
        'updated_at': row.get('updated_at') or '',
        'validation_mode': 'server_signed',
    }


def enforce_license_or_error() -> dict[str, Any] | None:
    license_data = get_license_settings()
    if license_data.get('active'):
        return None
    return {'error': 'Licença da nuvem expirada ou suspensa. Renove a licença para continuar usando o sistema online.', 'license': license_data}


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'ok': True, 'service': 'agenda-clinica-backend', 'database': DB_PATH})


@app.route('/api/auth/login', methods=['POST'])
def login():
    payload = request.get_json(force=True, silent=True) or {}
    email = str(payload.get('email', '')).strip().lower()
    password = str(payload.get('password', ''))
    user = query_one('SELECT * FROM users WHERE email = ?', (email,))
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Credenciais inválidas'}), 401
    license_error = enforce_license_or_error()
    if license_error:
        return jsonify(license_error), 403
    token = token_for_user(user)
    audit(user['id'], user['name'], user['role'], 'Login', 'users', 'Login no backend SaaS')
    return jsonify({'token': token, 'user': {'id': user['id'], 'name': user['name'], 'email': user['email'], 'role': user['role'], 'clinic_id': user['clinic_id']}, 'license': get_license_settings()})


@app.route('/api/auth/bootstrap-admin', methods=['GET'])
@auth_required(admin_only=True)
def bootstrap_admin_info():
    return jsonify({'admin_email': ADMIN_EMAIL, 'jwt_expires_hours': JWT_EXPIRES_HOURS, 'origin': APP_ORIGIN})


@app.route('/api/auth/change-password', methods=['POST'])
@auth_required()
def change_password():
    body = request.get_json(force=True, silent=True) or {}
    new_password = str(body.get('new_password') or body.get('password') or '')
    error = password_policy_error(new_password)
    if error:
        return jsonify({'error': error}), 400
    execute('UPDATE users SET password_hash = ? WHERE id = ?', (generate_password_hash(new_password), g.current_user['id']))
    refreshed = query_one('SELECT id, name, email, role, active FROM users WHERE id = ?', (g.current_user['id'],))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Edição', 'users', 'Senha do usuário autenticado atualizada')
    return jsonify({'ok': True, 'user': refreshed})


@app.route('/api/dashboard/summary', methods=['GET'])
@auth_required()
def dashboard_summary():
    db = get_db()
    result = {
        'clinics': db.execute('SELECT COUNT(*) FROM clinics').fetchone()[0],
        'professionals': db.execute('SELECT COUNT(*) FROM professionals').fetchone()[0],
        'patients': db.execute('SELECT COUNT(*) FROM patients').fetchone()[0],
        'appointments': db.execute('SELECT COUNT(*) FROM appointments').fetchone()[0],
        'sessions': db.execute('SELECT COUNT(*) FROM sessions').fetchone()[0],
        'receivables_open': db.execute("SELECT COALESCE(SUM(amount_planned - amount_paid),0) FROM receivables WHERE status IN ('Em Aberto','Atrasado','Parcial')").fetchone()[0],
        'payables_open': db.execute("SELECT COALESCE(SUM(amount_planned - amount_paid),0) FROM payables WHERE status IN ('Em Aberto','Atrasado','Parcial')").fetchone()[0],
        'audits': db.execute('SELECT COUNT(*) FROM audits').fetchone()[0],
    }
    return jsonify(result)


@app.route('/api/daily/config', methods=['GET'])
@auth_required()
def daily_config():
    return jsonify({'enabled': bool(DAILY_API_KEY and DAILY_DOMAIN), 'domain': DAILY_DOMAIN})


@app.route('/api/clinical-sessions/start', methods=['POST'])
@auth_required()
def start_clinical_session():
    body = request.get_json(force=True, silent=True) or {}
    patient_id = int(body.get('patient_id') or 0)
    appointment_id = int(body.get('appointment_id') or 0) or None
    patient = query_one('SELECT * FROM patients WHERE id = ?', (patient_id,))
    if not patient:
        return jsonify({'error': 'Paciente não encontrado'}), 404
    if not int(patient.get('consent_recording') or 0):
        return jsonify({'error': 'O paciente ainda não possui consentimento de gravação ativo no cadastro.'}), 400
    appointment = query_one('SELECT * FROM appointments WHERE id = ?', (appointment_id,)) if appointment_id else None
    daily_cfg = resolve_daily_config(body)
    daily_info = create_daily_room(daily_cfg, patient['name']) if daily_cfg.get('domain') and daily_cfg.get('api_key') else {'enabled': False, 'room_name': '', 'room_url': ''}
    now = utcnow()
    session_payload = {
        'code': next_code('sessions', 'SES'),
        'patient_id': patient['id'],
        'professional_id': patient.get('professional_id'),
        'clinic_id': patient.get('clinic_id'),
        'appointment_id': appointment_id,
        'scheduled_date': appointment['date'] if appointment else body.get('scheduled_date') or now[:10],
        'started_at': now,
        'ended_at': None,
        'duration_minutes': 0,
        'call_status': 'daily' if daily_info.get('enabled') else 'manual',
        'room_name': daily_info.get('room_name') or body.get('room_name') or '',
        'room_url': daily_info.get('room_url') or body.get('room_url') or '',
        'daily_room_url': daily_info.get('room_url') or body.get('room_url') or '',
        'recording_id': '',
        'recording_url': '',
        'transcript_live': '',
        'transcript_final': '',
        'transcript_segments': '[]',
        'keywords': '[]',
        'soap_subjective': '',
        'soap_objective': '',
        'soap_assessment': '',
        'soap_plan': '',
        'summary': '',
        'status': 'EM_ANDAMENTO',
    }
    columns = RESOURCE_COLUMNS['sessions'] + ['created_at', 'updated_at']
    values = [session_payload.get(c) for c in RESOURCE_COLUMNS['sessions']] + [now, now]
    row_id = execute(
        f"INSERT INTO sessions ({','.join(columns)}) VALUES ({','.join(['?'] * len(values))})",
        tuple(values),
    )
    created = query_one('SELECT * FROM sessions WHERE id = ?', (row_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Criação', 'sessions', f"Atendimento clínico iniciado para {patient['name']}", after=created)
    return jsonify({'session': created, 'daily': daily_info})


@app.route('/api/clinical-sessions/<int:session_id>/complete', methods=['POST', 'PUT'])
@auth_required()
def complete_clinical_session(session_id: int):
    body = request.get_json(force=True, silent=True) or {}
    before = query_one('SELECT * FROM sessions WHERE id = ?', (session_id,))
    if not before:
        return jsonify({'error': 'Atendimento não encontrado'}), 404
    ended_at = body.get('ended_at') or utcnow()
    started_at = body.get('started_at') or before.get('started_at') or utcnow()
    transcript_live = body.get('transcript_live') if body.get('transcript_live') is not None else before.get('transcript_live')
    transcript_final = body.get('transcript_final') if body.get('transcript_final') is not None else (before.get('transcript_final') or transcript_live)
    keywords = normalize_json_text(body.get('keywords') if body.get('keywords') is not None else before.get('keywords'), '[]')
    transcript_segments = normalize_json_text(body.get('transcript_segments') if body.get('transcript_segments') is not None else before.get('transcript_segments'), '[]')
    updates = {
        'started_at': started_at,
        'ended_at': ended_at,
        'duration_minutes': body.get('duration_minutes') or calculate_duration_minutes(started_at, ended_at),
        'call_status': body.get('call_status') or before.get('call_status') or 'daily',
        'room_name': body.get('room_name') or before.get('room_name') or '',
        'room_url': body.get('room_url') or before.get('room_url') or '',
        'daily_room_url': body.get('daily_room_url') or before.get('daily_room_url') or '',
        'recording_id': body.get('recording_id') or before.get('recording_id') or '',
        'recording_url': body.get('recording_url') or before.get('recording_url') or '',
        'transcript_live': transcript_live or '',
        'transcript_final': transcript_final or '',
        'transcript_segments': transcript_segments,
        'keywords': keywords,
        'soap_subjective': body.get('soap_subjective') if body.get('soap_subjective') is not None else before.get('soap_subjective') or '',
        'soap_objective': body.get('soap_objective') if body.get('soap_objective') is not None else before.get('soap_objective') or '',
        'soap_assessment': body.get('soap_assessment') if body.get('soap_assessment') is not None else before.get('soap_assessment') or '',
        'soap_plan': body.get('soap_plan') if body.get('soap_plan') is not None else before.get('soap_plan') or '',
        'summary': body.get('summary') if body.get('summary') is not None else before.get('summary') or '',
        'status': body.get('status') or 'FINALIZADO',
        'updated_at': utcnow(),
    }
    execute(
        '''
        UPDATE sessions
        SET started_at = ?, ended_at = ?, duration_minutes = ?, call_status = ?, room_name = ?, room_url = ?, daily_room_url = ?,
            recording_id = ?, recording_url = ?, transcript_live = ?, transcript_final = ?, transcript_segments = ?, keywords = ?,
            soap_subjective = ?, soap_objective = ?, soap_assessment = ?, soap_plan = ?, summary = ?, status = ?, updated_at = ?
        WHERE id = ?
        ''',
        (
            updates['started_at'], updates['ended_at'], updates['duration_minutes'], updates['call_status'], updates['room_name'], updates['room_url'], updates['daily_room_url'],
            updates['recording_id'], updates['recording_url'], updates['transcript_live'], updates['transcript_final'], updates['transcript_segments'], updates['keywords'],
            updates['soap_subjective'], updates['soap_objective'], updates['soap_assessment'], updates['soap_plan'], updates['summary'], updates['status'], updates['updated_at'], session_id,
        ),
    )
    after = query_one('SELECT * FROM sessions WHERE id = ?', (session_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Edição', 'sessions', f'Atendimento clínico finalizado: {session_id}', before=before, after=after)
    return jsonify(after)


@app.route('/api/<resource>', methods=['GET', 'POST', 'OPTIONS'])
@auth_required()
def resources_collection(resource: str):
    if resource not in RESOURCE_COLUMNS:
        return jsonify({'error': 'Recurso não suportado'}), 404
    if request.method == 'OPTIONS':
        return ('', 204)
    if request.method == 'GET':
        return jsonify(query_all(list_sql(resource)))
    data = payload_for_resource(resource)
    now = utcnow()
    columns = RESOURCE_COLUMNS[resource] + ['created_at', 'updated_at']
    values = [data.get(c) for c in RESOURCE_COLUMNS[resource]] + [now, now]
    placeholders = ','.join(['?'] * len(values))
    sql = f"INSERT INTO {resource} ({','.join(columns)}) VALUES ({placeholders})"
    row_id = execute(sql, tuple(values))
    created = query_one(f'SELECT * FROM {resource} WHERE id = ?', (row_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Criação', resource, f'Registro criado em {resource}', after=created)
    return jsonify(created), 201


@app.route('/api/<resource>/<int:row_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@auth_required()
def resource_item(resource: str, row_id: int):
    if resource not in RESOURCE_COLUMNS:
        return jsonify({'error': 'Recurso não suportado'}), 404
    if request.method == 'OPTIONS':
        return ('', 204)
    before = query_one(f'SELECT * FROM {resource} WHERE id = ?', (row_id,))
    if not before:
        return jsonify({'error': 'Registro não encontrado'}), 404
    if request.method == 'GET':
        return jsonify(before)
    if request.method == 'DELETE':
        execute(f'DELETE FROM {resource} WHERE id = ?', (row_id,))
        audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Exclusão', resource, f'Registro {row_id} removido', before=before)
        return jsonify({'ok': True})
    data = payload_for_resource(resource)
    assignments = ', '.join([f'{column} = ?' for column in RESOURCE_COLUMNS[resource]]) + ', updated_at = ?'
    values = [data.get(column) for column in RESOURCE_COLUMNS[resource]] + [utcnow(), row_id]
    execute(f'UPDATE {resource} SET {assignments} WHERE id = ?', tuple(values))
    after = query_one(f'SELECT * FROM {resource} WHERE id = ?', (row_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Edição', resource, f'Registro {row_id} atualizado', before=before, after=after)
    return jsonify(after)


@app.route('/api/audits', methods=['GET'])
@auth_required(admin_only=True)
def list_audits():
    return jsonify(query_all('SELECT * FROM audits ORDER BY id DESC LIMIT 1000'))


@app.route('/api/users', methods=['GET', 'POST'])
@auth_required(admin_only=True)
def users_collection():
    if request.method == 'GET':
        rows = query_all('SELECT id, name, email, role, clinic_id, active, created_at FROM users ORDER BY id DESC')
        return jsonify(rows)
    body = request.get_json(force=True, silent=True) or {}
    password = str(body.get('password', ''))
    error = password_policy_error(password)
    if error:
        return jsonify({'error': error}), 400
    now = utcnow()
    row_id = execute(
        'INSERT INTO users (name, email, password_hash, role, clinic_id, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        (
            body.get('name'),
            str(body.get('email', '')).strip().lower(),
            generate_password_hash(password),
            body.get('role', 'OPERADOR'),
            body.get('clinic_id'),
            1 if body.get('active', True) else 0,
            now,
        ),
    )
    created = query_one('SELECT id, name, email, role, clinic_id, active, created_at FROM users WHERE id = ?', (row_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Criação', 'users', 'Usuário criado', after=created)
    return jsonify(created), 201


@app.route('/api/users/<int:user_id>', methods=['PUT', 'DELETE'])
@auth_required(admin_only=True)
def user_item(user_id: int):
    before = query_one('SELECT id, name, email, role, clinic_id, active, created_at FROM users WHERE id = ?', (user_id,))
    if not before:
        return jsonify({'error': 'Usuário não encontrado'}), 404
    if request.method == 'DELETE':
        execute('DELETE FROM users WHERE id = ?', (user_id,))
        audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Exclusão', 'users', f'Usuário {user_id} removido', before=before)
        return jsonify({'ok': True})
    body = request.get_json(force=True, silent=True) or {}
    execute(
        'UPDATE users SET name = ?, email = ?, role = ?, clinic_id = ?, active = ? WHERE id = ?',
        (
            body.get('name') or before.get('name'),
            str(body.get('email') or before.get('email') or '').strip().lower(),
            body.get('role') or before.get('role') or 'OPERADOR',
            body.get('clinic_id') if body.get('clinic_id') is not None else before.get('clinic_id'),
            1 if body.get('active', before.get('active', True)) else 0,
            user_id,
        ),
    )
    if body.get('password'):
        error = password_policy_error(str(body.get('password')))
        if error:
            return jsonify({'error': error}), 400
        execute('UPDATE users SET password_hash = ? WHERE id = ?', (generate_password_hash(str(body.get('password'))), user_id))
    after = query_one('SELECT id, name, email, role, clinic_id, active, created_at FROM users WHERE id = ?', (user_id,))
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Edição', 'users', f'Usuário {user_id} atualizado', before=before, after=after)
    return jsonify(after)


@app.route('/api/license', methods=['GET', 'PUT'])
@auth_required()
def license_status():
    if request.method == 'GET':
        return jsonify(get_license_settings())
    if g.current_user['role'] != 'ADMIN':
        return jsonify({'error': 'Acesso restrito ao ADMIN'}), 403
    body = request.get_json(force=True, silent=True) or {}
    before = get_license_settings()
    now = utcnow()
    company_name = body.get('company_name') or before.get('company_name') or 'Sua Clínica'
    plan_name = body.get('plan_name') or before.get('plan_name') or 'Plano Comercial'
    status = str(body.get('status') or before.get('status') or 'ATIVA').upper()
    max_users = max(1, safe_int(body.get('max_users'), int(before.get('max_users') or 5)))
    expires_at = normalize_license_expiry(body.get('expires_at') if body.get('expires_at') is not None else before.get('expires_at') or '')
    grace_days = max(0, safe_int(body.get('grace_days'), int(before.get('grace_days') or 7)))
    activation_code = build_activation_code(company_name, plan_name, max_users, expires_at)
    execute(
        '''
        UPDATE license_settings
        SET company_name = ?, plan_name = ?, status = ?, activation_code = ?, max_users = ?, expires_at = ?, grace_days = ?, updated_at = ?
        WHERE id = 1
        ''',
        (company_name, plan_name, status, activation_code, max_users, expires_at, grace_days, now),
    )
    after = get_license_settings()
    audit(g.current_user['id'], g.current_user['name'], g.current_user['role'], 'Configuração', 'license', 'Licença atualizada', before=before, after=after)
    return jsonify(after)


@app.route('/api/license/activate', methods=['POST'])
def activate_license():
    body = request.get_json(force=True, silent=True) or {}
    activation_code = str(body.get('activation_code') or '').strip().upper()
    current = get_license_settings()
    if not activation_code:
        return jsonify({'error': 'Informe o código de ativação.'}), 400
    if activation_code != str(current.get('activation_code') or '').strip().upper():
        return jsonify({'error': 'Código de ativação inválido.'}), 400
    if current.get('status') == 'EXPIRADA':
        return jsonify({'error': 'Esta licença já está expirada.', 'license': current}), 403
    execute('UPDATE license_settings SET status = ?, updated_at = ? WHERE id = 1', ('ATIVA', utcnow()))
    return jsonify(get_license_settings())


@app.route('/api/export/full-backup', methods=['GET'])
@auth_required(admin_only=True)
def export_full_backup():
    payload = {resource: query_all(f'SELECT * FROM {resource}') for resource in RESOURCE_COLUMNS}
    payload['users'] = query_all('SELECT id, name, email, role, clinic_id, active, created_at FROM users')
    payload['audits'] = query_all('SELECT * FROM audits ORDER BY id DESC')
    payload['license'] = get_license_settings()
    return jsonify(payload)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_web_app(path: str):
    if path.startswith('api/') or path == 'health':
        return jsonify({'error': 'Recurso não encontrado'}), 404
    if path and (WEB_DIR / path).is_file():
        return send_from_directory(WEB_DIR, path)
    index_file = WEB_DIR / 'index.html'
    if index_file.exists():
        return send_from_directory(WEB_DIR, 'index.html')
    return jsonify({'ok': True, 'service': 'agenda-clinica-backend', 'message': 'Frontend web ainda não copiado para a pasta /web.'})


if __name__ == '__main__':
    ensure_schema()
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '8000')), debug=os.getenv('FLASK_DEBUG', '0') == '1')
else:
    ensure_schema()
