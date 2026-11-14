import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  INITIAL_INSTITUTIONS,
  INITIAL_SERVICES,
  INITIAL_APPLICATIONS,
  INITIAL_CERTIFICATES,
  INITIAL_HOLDING_TAXES,
  INITIAL_TRADE_LICENSES,
  INITIAL_NOTICES,
} from '../src/data/seedData.ts';
import type {
  AdministrativeUnit,
  Application,
  ApplicationApproval,
  ApplicationAttachment,
  ApprovalAuthorityAssignment,
  Certificate,
  CertificateEvent,
  CertificateTemplate,
  CertificateVerificationLog,
  CitizenNotification,
  ContactInquiry,
  HoldingTaxRecord,
  MonitoringObservation,
  Notice,
  PermissionAuditLog,
  PermissionKey,
  PermissionScope,
  RbacPermission,
  RbacRole,
  RefundRequest,
  RolePermissionAssignment,
  RolePermissionEntry,
  Service,
  StaffMember,
  SystemSettings,
  TradeLicenseRecord,
  UserAccount,
  UserPermissionOverride,
  UserRole,
  UserRoleAssignment,
  WardOrDepartment,
  WorkflowStepKey,
} from '../src/types/index.ts';
import {
  DEFAULT_LEGACY_ROLE_SUMMARIES,
  DEFAULT_ROLE_PERMISSION_MAP,
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
} from './rbacCatalog.ts';
import { generateAndStoreCertificatePdf, getCertificateStorageRoot, isValidPdfFile } from './pdfGenerator.ts';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 }).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexHash] = parts;
  const computed = crypto.scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 });
  const expected = Buffer.from(hexHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

const DEFAULT_DEMO_PASSWORD_HASH = hashPassword('Pottoyon@2026!');

export function hashVerificationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

import {
  getDbPath,
  getAttachmentStorageRoot,
  getVerificationBaseUrl,
} from './envConfig.ts';

export {
  getDbPath,
  getAttachmentStorageRoot,
  getVerificationBaseUrl,
};

const DEFAULT_ROLE_PERMISSIONS: RolePermissionEntry[] = DEFAULT_LEGACY_ROLE_SUMMARIES;

class PottoyonDatabase {
  public db: DatabaseSync;
  private initializedSeedCertPdf = false;

  constructor() {
    const dbPath = getDbPath();
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.createTables();
    this.runSafeMigrations();
    this.seedIfEmpty();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        tracking_no TEXT UNIQUE NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS certificate_templates (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        version TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        header_text_bn TEXT NOT NULL,
        body_intro_bn TEXT NOT NULL,
        footer_disclaimer_bn TEXT NOT NULL,
        default_validity_days INTEGER,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        certificate_number TEXT UNIQUE NOT NULL,
        verification_token_hash TEXT UNIQUE NOT NULL,
        template_version_id TEXT NOT NULL,
        issued_by TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT,
        revoked_at TEXT,
        revocation_reason TEXT,
        reissued_from_cert_id TEXT,
        status TEXT NOT NULL,
        pdf_path TEXT NOT NULL,
        certificate_title_bn TEXT NOT NULL,
        issue_date_bn TEXT NOT NULL,
        issue_date_en TEXT NOT NULL,
        applicant_name_bn TEXT NOT NULL,
        father_name_bn TEXT NOT NULL,
        mother_name_bn TEXT NOT NULL,
        permanent_address_bn TEXT NOT NULL,
        present_address_bn TEXT NOT NULL,
        heirs_json TEXT,
        qr_data_url TEXT,
        officer_name_bn TEXT NOT NULL,
        officer_title_bn TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_active_app
        ON certificates(application_id)
        WHERE status != 'revoked';

      CREATE TABLE IF NOT EXISTS application_approvals (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        officer_id TEXT NOT NULL,
        officer_role TEXT NOT NULL,
        officer_name_bn TEXT NOT NULL,
        officer_title_bn TEXT NOT NULL,
        decision TEXT NOT NULL,
        notes TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS certificate_events (
        id TEXT PRIMARY KEY,
        certificate_id TEXT NOT NULL,
        application_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name_bn TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS certificate_verification_logs (
        id TEXT PRIMARY KEY,
        certificate_id TEXT,
        token_hash_prefix TEXT NOT NULL,
        result_status TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        verified_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_mobile TEXT NOT NULL,
        application_id TEXT NOT NULL,
        certificate_id TEXT,
        administrative_unit_id TEXT NOT NULL,
        title_bn TEXT NOT NULL,
        message_bn TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS holding_taxes (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS trade_licenses (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staff_members (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        role TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wards_departments (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS application_attachments (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        uploaded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS contact_inquiries (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role TEXT PRIMARY KEY,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        name_en TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        category TEXT NOT NULL,
        institution_type TEXT,
        default_scope TEXT NOT NULL,
        is_system INTEGER NOT NULL DEFAULT 1,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_optional INTEGER NOT NULL DEFAULT 0,
        description_bn TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        key TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        name_en TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        is_sensitive INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS role_permissions_v2 (
        role_slug TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        scope TEXT NOT NULL,
        granted INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (role_slug, permission_key)
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name_bn TEXT NOT NULL,
        title_bn TEXT NOT NULL,
        mobile TEXT NOT NULL,
        email TEXT,
        primary_role TEXT NOT NULL,
        administrative_unit_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        mfa_enabled INTEGER NOT NULL DEFAULT 1,
        account_status TEXT NOT NULL DEFAULT 'active',
        identity_verified INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        appointment_note_bn TEXT,
        deactivated_at TEXT,
        deactivation_reason_bn TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role_slug TEXT NOT NULL,
        administrative_unit_id TEXT,
        is_primary INTEGER NOT NULL DEFAULT 0,
        assigned_by TEXT NOT NULL,
        expires_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_permission_overrides (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        scope TEXT NOT NULL,
        effect TEXT NOT NULL,
        reason_bn TEXT NOT NULL,
        assigned_by TEXT NOT NULL,
        expires_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_institution_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        assigned_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_department_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        department_code TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        assigned_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_ward_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        ward_no INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        assigned_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approval_authority_assignments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        role_slug TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        max_fee_limit INTEGER,
        effective_from TEXT NOT NULL,
        expires_at TEXT,
        delegated_by TEXT NOT NULL,
        delegation_note_bn TEXT NOT NULL,
        allow_self_approval INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permission_audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        actor_name_bn TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        administrative_unit_id TEXT,
        before_json TEXT,
        after_json TEXT,
        reason_bn TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS monitoring_observations (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        application_id TEXT,
        officer_id TEXT NOT NULL,
        officer_name_bn TEXT NOT NULL,
        observation_bn TEXT NOT NULL,
        severity TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refund_requests (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        administrative_unit_id TEXT NOT NULL,
        amount REAL NOT NULL,
        reason_bn TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        requested_by_name_bn TEXT NOT NULL,
        status TEXT NOT NULL,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_invitation_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS escalated_complaints (
        id TEXT PRIMARY KEY,
        administrative_unit_id TEXT NOT NULL,
        application_id TEXT,
        complainant_user_id TEXT,
        complainant_name_bn TEXT NOT NULL,
        complainant_mobile TEXT NOT NULL,
        subject_bn TEXT NOT NULL,
        details_bn TEXT NOT NULL,
        status TEXT NOT NULL,
        forwarded_to_unit_id TEXT,
        resolution_note_bn TEXT,
        handled_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS developer_access_requests (
        id TEXT PRIMARY KEY,
        developer_user_id TEXT NOT NULL,
        developer_name_bn TEXT NOT NULL,
        scope TEXT NOT NULL,
        reason_bn TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL,
        approved_by TEXT,
        approved_by_name_bn TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_token_hash TEXT UNIQUE NOT NULL,
        remember_token_hash TEXT UNIQUE,
        role_slug TEXT NOT NULL,
        administrative_unit_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        expires_at TEXT NOT NULL,
        remember_expires_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_apps_unit_status ON applications(administrative_unit_id, status);
      CREATE INDEX IF NOT EXISTS idx_certs_app ON certificates(application_id);
      CREATE INDEX IF NOT EXISTS idx_certs_unit_issued ON certificates(administrative_unit_id, issued_at);
      CREATE INDEX IF NOT EXISTS idx_notifs_app_mobile ON notifications(application_id, recipient_mobile);
      CREATE INDEX IF NOT EXISTS idx_events_cert ON certificate_events(certificate_id, application_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_app ON application_approvals(application_id);
      CREATE INDEX IF NOT EXISTS idx_complaints_unit_status ON escalated_complaints(administrative_unit_id, status);
      CREATE INDEX IF NOT EXISTS idx_dev_req_user_status ON developer_access_requests(developer_user_id, status);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, revoked_at);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_remember ON user_sessions(remember_token_hash, revoked_at);
    `);
  }

  private runSafeMigrations(): void {
    const certCols = this.db
      .prepare('PRAGMA table_info(certificates)')
      .all() as Array<{ name: string }>;
    if (!certCols.some((c) => c.name === 'reissued_from_cert_id')) {
      this.db.exec('ALTER TABLE certificates ADD COLUMN reissued_from_cert_id TEXT;');
    }

    const masterRow = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='certificates'")
      .get() as { sql?: string } | undefined;
    if (masterRow?.sql && /application_id\s+TEXT\s+UNIQUE/i.test(masterRow.sql)) {
      this.db.exec(`
        BEGIN IMMEDIATE;
        CREATE TABLE certificates_migrated (
          id TEXT PRIMARY KEY,
          application_id TEXT NOT NULL,
          administrative_unit_id TEXT NOT NULL,
          service_id TEXT NOT NULL,
          certificate_number TEXT UNIQUE NOT NULL,
          verification_token_hash TEXT UNIQUE NOT NULL,
          template_version_id TEXT NOT NULL,
          issued_by TEXT NOT NULL,
          approved_at TEXT NOT NULL,
          issued_at TEXT NOT NULL,
          expires_at TEXT,
          revoked_at TEXT,
          revocation_reason TEXT,
          reissued_from_cert_id TEXT,
          status TEXT NOT NULL,
          pdf_path TEXT NOT NULL,
          certificate_title_bn TEXT NOT NULL,
          issue_date_bn TEXT NOT NULL,
          issue_date_en TEXT NOT NULL,
          applicant_name_bn TEXT NOT NULL,
          father_name_bn TEXT NOT NULL,
          mother_name_bn TEXT NOT NULL,
          permanent_address_bn TEXT NOT NULL,
          present_address_bn TEXT NOT NULL,
          heirs_json TEXT,
          qr_data_url TEXT,
          officer_name_bn TEXT NOT NULL,
          officer_title_bn TEXT NOT NULL
        );
        INSERT INTO certificates_migrated SELECT
          id, application_id, administrative_unit_id, service_id,
          certificate_number, verification_token_hash, template_version_id,
          issued_by, approved_at, issued_at, expires_at, revoked_at,
          revocation_reason, reissued_from_cert_id, status, pdf_path, certificate_title_bn,
          issue_date_bn, issue_date_en, applicant_name_bn, father_name_bn,
          mother_name_bn, permanent_address_bn, present_address_bn,
          heirs_json, qr_data_url, officer_name_bn, officer_title_bn
        FROM certificates;
        DROP TABLE certificates;
        ALTER TABLE certificates_migrated RENAME TO certificates;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_certificates_active_app
          ON certificates(application_id)
          WHERE status != 'revoked';
        COMMIT;
      `);
    }

    // Ensure supplementary metadata tables get seeded on existing DBs if empty
    const staffCount = (this.db.prepare('SELECT COUNT(*) AS cnt FROM staff_members').get() as { cnt: number }).cnt;
    if (staffCount === 0 && (this.db.prepare('SELECT COUNT(*) AS cnt FROM institutions').get() as { cnt: number }).cnt > 0) {
      this.seedOperationalMetadata();
    }

    const rolesCount = (this.db.prepare('SELECT COUNT(*) AS cnt FROM roles').get() as { cnt: number }).cnt;
    if (rolesCount === 0 && (this.db.prepare('SELECT COUNT(*) AS cnt FROM institutions').get() as { cnt: number }).cnt > 0) {
      this.seedRbacCatalogAndUsers();
    }

    // Migrate legacy 17-role databases to the simplified 4-role architecture while preserving applications & certificates
    const obsoleteRoleCount = (
      this.db
        .prepare("SELECT COUNT(*) AS cnt FROM roles WHERE slug NOT IN ('chairman', 'secretary', 'developer', 'supervisor')")
        .get() as { cnt: number }
    ).cnt;
    const supervisorRoleCount = (
      this.db.prepare("SELECT COUNT(*) AS cnt FROM roles WHERE slug = 'supervisor'").get() as { cnt: number }
    ).cnt;
    if (
      (obsoleteRoleCount > 0 || supervisorRoleCount === 0) &&
      (this.db.prepare('SELECT COUNT(*) AS cnt FROM institutions').get() as { cnt: number }).cnt > 0
    ) {
      this.migrateToFourRoleArchitecture();
    }

    // Ensure Chairman has application creation/draft/submit permissions and Secretary does not hold final request_correction authority
    const insertRolePerm = this.db.prepare(`
      INSERT OR IGNORE INTO role_permissions_v2 (role_slug, permission_key, scope, granted)
      VALUES (?, ?, ?, 1)
    `);
    for (const permKey of ['applications.create', 'applications.edit', 'applications.submit', 'applications.forward']) {
      insertRolePerm.run('chairman', permKey, 'institution');
    }
    this.db
      .prepare("DELETE FROM role_permissions_v2 WHERE role_slug = 'secretary' AND permission_key = 'applications.request_correction'")
      .run();

    // Ensure user account lifecycle columns exist on existing databases
    const userCols = this.db
      .prepare('PRAGMA table_info(users)')
      .all() as Array<{ name: string }>;
    const hasUserCol = (name: string) => userCols.some((c) => c.name === name);
    if (!hasUserCol('account_status')) {
      this.db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';");
    }
    if (!hasUserCol('identity_verified')) {
      this.db.exec('ALTER TABLE users ADD COLUMN identity_verified INTEGER NOT NULL DEFAULT 1;');
    }
    if (!hasUserCol('must_change_password')) {
      this.db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;');
    }
    if (!hasUserCol('appointment_note_bn')) {
      this.db.exec('ALTER TABLE users ADD COLUMN appointment_note_bn TEXT;');
    }
    if (!hasUserCol('deactivated_at')) {
      this.db.exec('ALTER TABLE users ADD COLUMN deactivated_at TEXT;');
    }
    if (!hasUserCol('deactivation_reason_bn')) {
      this.db.exec('ALTER TABLE users ADD COLUMN deactivation_reason_bn TEXT;');
    }

    if ((this.db.prepare('SELECT COUNT(*) AS cnt FROM institutions').get() as { cnt: number }).cnt > 0) {
      this.ensureInitialFourAdminAccounts();
    }
  }

  private migrateToFourRoleArchitecture(): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        DELETE FROM user_ward_assignments;
        DELETE FROM user_department_assignments;
        DELETE FROM user_institution_assignments;
        DELETE FROM user_permission_overrides;
        DELETE FROM approval_authority_assignments;
        DELETE FROM user_roles;
        DELETE FROM users;
        DELETE FROM role_permissions_v2;
        DELETE FROM permissions;
        DELETE FROM roles;
        DELETE FROM role_permissions;
        DELETE FROM staff_members;
      `);

      this.db
        .prepare("UPDATE certificates SET issued_by = 'off_goyeshpur_chairman' WHERE issued_by = 'off_goyeshpur_head'")
        .run();
      this.db
        .prepare(
          "UPDATE application_approvals SET officer_id = 'off_goyeshpur_chairman', officer_role = 'chairman' WHERE officer_role IN ('union_admin', 'municipality_admin', 'mayor')"
        )
        .run();
      this.db
        .prepare(
          "UPDATE certificate_events SET actor_id = 'off_goyeshpur_chairman', actor_role = 'chairman' WHERE actor_role IN ('union_admin', 'municipality_admin', 'mayor')"
        )
        .run();

      this.seedOperationalMetadata();
      this.seedRbacCatalogAndUsers();
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }
  }

  public seedIfEmpty(): void {
    const countRow = this.db.prepare('SELECT COUNT(*) AS cnt FROM institutions').get() as { cnt: number };
    if (countRow.cnt > 0) return;
    this.seedAll();
  }

  public resetDatabase(): void {
    this.db.exec(`
      DELETE FROM user_sessions;
      DELETE FROM account_invitation_tokens;
      DELETE FROM developer_access_requests;
      DELETE FROM escalated_complaints;
      DELETE FROM password_reset_tokens;
      DELETE FROM refund_requests;
      DELETE FROM monitoring_observations;
      DELETE FROM permission_audit_logs;
      DELETE FROM approval_authority_assignments;
      DELETE FROM user_ward_assignments;
      DELETE FROM user_department_assignments;
      DELETE FROM user_institution_assignments;
      DELETE FROM user_permission_overrides;
      DELETE FROM user_roles;
      DELETE FROM users;
      DELETE FROM role_permissions_v2;
      DELETE FROM permissions;
      DELETE FROM roles;
      DELETE FROM application_attachments;
      DELETE FROM certificate_verification_logs;
      DELETE FROM certificate_events;
      DELETE FROM application_approvals;
      DELETE FROM notifications;
      DELETE FROM certificates;
      DELETE FROM certificate_templates;
      DELETE FROM applications;
      DELETE FROM holding_taxes;
      DELETE FROM trade_licenses;
      DELETE FROM notices;
      DELETE FROM staff_members;
      DELETE FROM wards_departments;
      DELETE FROM contact_inquiries;
      DELETE FROM role_permissions;
      DELETE FROM system_settings;
      DELETE FROM services;
      DELETE FROM institutions;
    `);
    this.initializedSeedCertPdf = false;
    this.seedAll();
  }

  private seedOperationalMetadata(): void {
    const nowIso = '2026-11-01T00:00:00.000Z';
    const insertStaff = this.db.prepare(
      'INSERT OR IGNORE INTO staff_members (id, administrative_unit_id, role, data_json) VALUES (?, ?, ?, ?)'
    );
    const insertWard = this.db.prepare(
      'INSERT OR IGNORE INTO wards_departments (id, administrative_unit_id, kind, data_json) VALUES (?, ?, ?, ?)'
    );

    const institutions = this.getInstitutions();
    for (const inst of institutions) {
      if (inst.type === 'municipality') {
        const muniStaff: StaffMember[] = [
          {
            id: `stf_${inst.code}_chairman`,
            administrative_unit_id: inst.id,
            name_bn: inst.chairman_or_mayor_name_bn,
            designation_bn: inst.chairman_or_mayor_title_bn,
            role: 'chairman',
            employee_code: `${inst.code}.chairman`,
            mobile: inst.contact_phone,
            ward_or_dept_bn: 'প্রশাসনিক কার্যালয়',
            status: 'active',
            created_at: nowIso,
          },
          {
            id: `stf_${inst.code}_secretary`,
            administrative_unit_id: inst.id,
            name_bn: inst.secretary_or_ceo_name_bn,
            designation_bn: inst.secretary_or_ceo_title_bn,
            role: 'secretary',
            employee_code: `${inst.code}.secretary`,
            mobile: '01711-889901',
            ward_or_dept_bn: 'সচিব / নির্বাহী শাখা',
            status: 'active',
            created_at: nowIso,
          },
        ];
        for (const s of muniStaff) {
          insertStaff.run(s.id, s.administrative_unit_id, s.role, JSON.stringify(s));
        }

        // 15 Municipal Wards + 3 Municipal Departments
        for (let w = 1; w <= inst.wards_count; w++) {
          const ward: WardOrDepartment = {
            id: `wd_${inst.code}_w${w}`,
            administrative_unit_id: inst.id,
            kind: 'ward',
            code_or_no: `W-${String(w).padStart(2, '0')}`,
            name_bn: `${w} নং পৌর ওয়ার্ড`,
            head_name_bn: `কাউন্সিলর (ওয়ার্ড ${w})`,
            head_mobile: `01712-${String(100000 + w * 111)}`,
            households_or_staff_count: 1450 + w * 40,
            status: 'active',
          };
          insertWard.run(ward.id, ward.administrative_unit_id, ward.kind, JSON.stringify(ward));
        }
        const depts = [
          { code: 'DEPT-GEN', name: 'সাধারণ ও নাগরিক সনদ বিভাগ', head: 'মোঃ তানভীর আহমেদ', count: 14 },
          { code: 'DEPT-TAX', name: 'পৌর কর ও হোল্ডিং অ্যাসেসমেন্ট বিভাগ', head: 'মোঃ কামাল হোসেন', count: 11 },
          { code: 'DEPT-TRD', name: 'ট্রেড লাইসেন্স ও বাজার বিভাগ', head: 'মোছাঃ ফারহানা আক্তার', count: 9 },
        ];
        depts.forEach((d, idx) => {
          const dept: WardOrDepartment = {
            id: `wd_${inst.code}_dept_${idx + 1}`,
            administrative_unit_id: inst.id,
            kind: 'department',
            code_or_no: d.code,
            name_bn: d.name,
            head_name_bn: d.head,
            head_mobile: `01715-50000${idx + 1}`,
            households_or_staff_count: d.count,
            status: 'active',
          };
          insertWard.run(dept.id, dept.administrative_unit_id, dept.kind, JSON.stringify(dept));
        });
      } else {
        const upStaff: StaffMember[] = [
          {
            id: `stf_${inst.code}_chairman`,
            administrative_unit_id: inst.id,
            name_bn: inst.chairman_or_mayor_name_bn,
            designation_bn: inst.chairman_or_mayor_title_bn,
            role: 'chairman',
            employee_code: `${inst.code}.chairman`,
            mobile: inst.contact_phone,
            ward_or_dept_bn: 'চেয়ারম্যানের কার্যালয়',
            status: 'active',
            created_at: nowIso,
          },
          {
            id: `stf_${inst.code}_sec`,
            administrative_unit_id: inst.id,
            name_bn: inst.secretary_or_ceo_name_bn,
            designation_bn: inst.secretary_or_ceo_title_bn,
            role: 'secretary',
            employee_code: `${inst.code}.secretary`,
            mobile: '01718-770011',
            ward_or_dept_bn: 'সচিব শাখা',
            status: 'active',
            created_at: nowIso,
          },
        ];
        for (const s of upStaff) {
          insertStaff.run(s.id, s.administrative_unit_id, s.role, JSON.stringify(s));
        }

        for (let w = 1; w <= inst.wards_count; w++) {
          const ward: WardOrDepartment = {
            id: `wd_${inst.code}_w${w}`,
            administrative_unit_id: inst.id,
            kind: 'ward',
            code_or_no: `W-0${w}`,
            name_bn: `${w} নং ওয়ার্ড (${inst.name_bn})`,
            head_name_bn: w === 4 ? 'মোঃ সোহেল রানা' : `ইউপি সদস্য (ওয়ার্ড ${w})`,
            head_mobile: `01719-${String(200000 + w * 13)}`,
            households_or_staff_count: 680 + w * 25,
            status: 'active',
          };
          insertWard.run(ward.id, ward.administrative_unit_id, ward.kind, JSON.stringify(ward));
        }
      }
    }

    const insertPerm = this.db.prepare('INSERT OR IGNORE INTO role_permissions (role, data_json) VALUES (?, ?)');
    for (const perm of DEFAULT_ROLE_PERMISSIONS) {
      insertPerm.run(perm.role, JSON.stringify(perm));
    }

    const defaultSettings: SystemSettings = {
      platform_name_bn: 'PottoyonBD — পাবনা সদর ডিজিটাল স্থানীয় সরকার সেবা',
      support_phone: '01700-000000',
      support_email: 'info@pottoyonbd.gov.bd',
      verification_base_url: 'https://pottoyonbd.gov.bd/verify',
      allow_online_applications: true,
      require_2fa_for_officers: true,
      auto_sms_notifications: true,
      maintenance_mode: false,
      updated_at: nowIso,
    };
    this.db
      .prepare('INSERT OR IGNORE INTO system_settings (id, data_json) VALUES (?, ?)')
      .run('default', JSON.stringify(defaultSettings));

    this.db
      .prepare(
        `INSERT OR IGNORE INTO escalated_complaints (
          id, administrative_unit_id, application_id, complainant_user_id,
          complainant_name_bn, complainant_mobile, subject_bn, details_bn,
          status, forwarded_to_unit_id, resolution_note_bn, handled_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'cmp_seed_001',
        'unit_goyeshpur',
        'app_goy_pending_01',
        'usr_citizen_portal',
        'মোঃ মনিরুল ইসলাম',
        '01712-345678',
        'সরেজমিন যাচাই প্রতিবেদন বিলম্ব সংক্রান্ত অভিযোগ',
        'আমার আবেদনের নির্ধারিত ৩ কর্মদিবস অতিক্রান্ত হলেও ওয়ার্ড পর্যায়ের যাচাই প্রতিবেদন সম্পন্ন হয়নি। দ্রুত নিষ্পত্তির অনুরোধ করছি।',
        'open',
        null,
        null,
        null,
        nowIso,
        nowIso
      );
  }

  private seedAll(): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insertInst = this.db.prepare(
        'INSERT INTO institutions (id, type, code, data_json) VALUES (?, ?, ?, ?)'
      );
      for (const inst of INITIAL_INSTITUTIONS) {
        insertInst.run(inst.id, inst.type, inst.code, JSON.stringify(inst));
      }

      const insertSrv = this.db.prepare(
        'INSERT INTO services (id, category, data_json) VALUES (?, ?, ?)'
      );
      for (const srv of INITIAL_SERVICES) {
        insertSrv.run(srv.id, srv.category, JSON.stringify({ ...srv, is_active: true }));
      }

      const insertTpl = this.db.prepare(`
        INSERT INTO certificate_templates (
          id, administrative_unit_id, service_id, version, name_bn,
          header_text_bn, body_intro_bn, footer_disclaimer_bn,
          default_validity_days, is_active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const nowIso = '2026-11-01T00:00:00.000Z';
      insertTpl.run(
        'tpl_up_general_v1',
        '*',
        '*',
        'v1.0-A4',
        'ইউনিয়ন পরিষদ ও পৌরসভা আদর্শ সনদ টেমপ্লেট (A4)',
        'গণপ্রজাতন্ত্রী বাংলাদেশ সরকার • স্থানীয় সরকার ডিজিটাল সেবা',
        'এই মর্মে প্রত্যয়ন করা যাইতেছে যে, আবেদনকারী অত্র এলাকার একজন স্থায়ী বাসিন্দা।',
        'কিউআর কোড স্ক্যান করে অনলাইনে সনদের সত্যতা যাচাই করুন।',
        null,
        1,
        nowIso
      );
      insertTpl.run(
        'tpl_trade_license_v1',
        '*',
        'srv_trade_license',
        'v1.0-TL',
        'ট্রেড লাইসেন্স টেমপ্লেট (বাৎসরিক মেয়াদযুক্ত)',
        'স্থানীয় সরকার প্রতিষ্ঠান • বাণিজ্যিক ট্রেড লাইসেন্স',
        'বিধি মোতাবেক ফি পরিশোধ সাপেক্ষে ব্যবসা পরিচালনার অনুমোদন প্রদান করা হইল।',
        'এই ট্রেড লাইসেন্স ইস্যুর তারিখ হইতে ১ (এক) বৎসর পর্যন্ত বৈধ থাকিবে।',
        365,
        1,
        nowIso
      );
      insertTpl.run(
        'tpl_character_v1',
        '*',
        'srv_character',
        'v1.0-CC',
        'চারিত্রিক সনদ টেমপ্লেট (৬ মাস মেয়াদ)',
        'স্থানীয় সরকার প্রতিষ্ঠান • চারিত্রিক প্রত্যয়নপত্র',
        'তাহার স্বভাব ও চরিত্র সম্পর্কে আমাদের জানা মতে কোনো বিরূপ তথ্য নাই।',
        'এই চারিত্রিক সনদ ইস্যুর তারিখ হইতে ১৮০ দিন পর্যন্ত কার্যকর থাকিবে।',
        180,
        1,
        nowIso
      );

      const insertApp = this.db.prepare(`
        INSERT INTO applications (
          id, tracking_no, administrative_unit_id, service_id,
          status, payment_status, updated_at, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const app of INITIAL_APPLICATIONS) {
        insertApp.run(
          app.id,
          app.tracking_no,
          app.administrative_unit_id,
          app.service_id,
          app.status,
          app.payment_status,
          app.updated_at,
          JSON.stringify(app)
        );
      }

      const insertCert = this.db.prepare(`
        INSERT INTO certificates (
          id, application_id, administrative_unit_id, service_id,
          certificate_number, verification_token_hash, template_version_id,
          issued_by, approved_at, issued_at, expires_at, revoked_at,
          revocation_reason, reissued_from_cert_id, status, pdf_path, certificate_title_bn,
          issue_date_bn, issue_date_en, applicant_name_bn, father_name_bn,
          mother_name_bn, permanent_address_bn, present_address_bn,
          heirs_json, qr_data_url, officer_name_bn, officer_title_bn
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const storageRoot = getCertificateStorageRoot();
      for (const cert of INITIAL_CERTIFICATES) {
        const rawSeedToken = cert.verification_token || '10275626255';
        const certNumber = '10275626255';
        const tokenHash = hashVerificationToken(rawSeedToken);
        const pdfPath = path.join(storageRoot, cert.administrative_unit_id, `${certNumber}.pdf`);

        insertCert.run(
          cert.id,
          cert.application_id,
          cert.administrative_unit_id,
          cert.service_id,
          certNumber,
          tokenHash,
          'tpl_up_general_v1',
          'off_goyeshpur_chairman',
          '2026-11-12T07:28:00.000Z',
          '2026-11-12T07:30:00.000Z',
          null,
          null,
          null,
          null,
          cert.status,
          pdfPath,
          cert.certificate_title_bn,
          cert.issue_date_bn,
          cert.issue_date_en,
          cert.applicant_name_bn,
          cert.father_name_bn,
          cert.mother_name_bn,
          cert.permanent_address_bn,
          cert.present_address_bn,
          cert.heirs ? JSON.stringify(cert.heirs) : null,
          cert.qr_data_url || null,
          cert.officer_name_bn,
          cert.officer_title_bn
        );

        this.db
          .prepare(
            `INSERT INTO application_approvals (
              id, application_id, administrative_unit_id, officer_id,
              officer_role, officer_name_bn, officer_title_bn, decision, notes, approved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            'apr_seed_10275626255',
            cert.application_id,
            cert.administrative_unit_id,
            'off_goyeshpur_chairman',
            'chairman',
            cert.officer_name_bn,
            cert.officer_title_bn,
            'approved',
            'ইউপি সচিবের যাচাই ও প্রস্তুতির পর চেয়ারম্যান কর্তৃক চূড়ান্ত অনুমোদন প্রদান।',
            '2026-11-12T07:28:00.000Z'
          );

        this.db
          .prepare(
            `INSERT INTO certificate_events (
              id, certificate_id, application_id, administrative_unit_id,
              event_type, actor_id, actor_role, actor_name_bn, metadata_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            'evt_seed_issued_10275626255',
            cert.id,
            cert.application_id,
            cert.administrative_unit_id,
            'issued',
            'off_goyeshpur_chairman',
            'chairman',
            cert.officer_name_bn,
            JSON.stringify({ certificate_number: certNumber, template_version_id: 'tpl_up_general_v1' }),
            '2026-11-12T07:30:00.000Z'
          );

        this.db
          .prepare(
            `INSERT INTO notifications (
              id, recipient_mobile, application_id, certificate_id,
              administrative_unit_id, title_bn, message_bn, channel, status, is_read, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            'notif_seed_10275626255',
            '01712-345678',
            cert.application_id,
            cert.id,
            cert.administrative_unit_id,
            'ডিজিটাল সনদপত্র প্রস্তুত হয়েছে',
            `আপনার ${cert.certificate_title_bn} (সনদ নং: ${certNumber}) চূড়ান্ত অনুমোদন ও কিউআর কোডসহ ইস্যু করা হয়েছে।`,
            'sms',
            'sent',
            0,
            '2026-11-12T07:30:05.000Z'
          );
      }

      const insertHt = this.db.prepare(
        'INSERT INTO holding_taxes (id, administrative_unit_id, data_json) VALUES (?, ?, ?)'
      );
      for (const ht of INITIAL_HOLDING_TAXES) {
        insertHt.run(ht.id, ht.administrative_unit_id, JSON.stringify(ht));
      }

      const insertTl = this.db.prepare(
        'INSERT INTO trade_licenses (id, administrative_unit_id, data_json) VALUES (?, ?, ?)'
      );
      for (const tl of INITIAL_TRADE_LICENSES) {
        insertTl.run(tl.id, tl.administrative_unit_id, JSON.stringify(tl));
      }

      const insertNotice = this.db.prepare(
        'INSERT INTO notices (id, administrative_unit_id, data_json) VALUES (?, ?, ?)'
      );
      for (const n of INITIAL_NOTICES) {
        insertNotice.run(n.id, n.administrative_unit_id || null, JSON.stringify(n));
      }

      this.seedOperationalMetadata();
      this.seedRbacCatalogAndUsers();

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  private seedRbacCatalogAndUsers(): void {
    const nowIso = '2026-11-01T00:00:00.000Z';

    const insertRole = this.db.prepare(`
      INSERT OR IGNORE INTO roles (
        id, slug, name_en, name_bn, category, institution_type,
        default_scope, is_system, is_active, is_optional, description_bn,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
    `);

    for (const r of SYSTEM_ROLES) {
      insertRole.run(
        r.id,
        r.slug,
        r.name_en,
        r.name_bn,
        r.category,
        r.institution_type,
        r.default_scope,
        r.is_optional ? 1 : 0,
        r.description_bn,
        nowIso,
        nowIso
      );
    }

    const insertPerm = this.db.prepare(`
      INSERT OR IGNORE INTO permissions (key, module, name_en, name_bn, is_sensitive)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of SYSTEM_PERMISSIONS) {
      insertPerm.run(p.key, p.module, p.name_en, p.name_bn, p.is_sensitive ? 1 : 0);
    }

    const insertRolePerm = this.db.prepare(`
      INSERT OR IGNORE INTO role_permissions_v2 (role_slug, permission_key, scope, granted)
      VALUES (?, ?, ?, 1)
    `);
    for (const [roleSlug, grants] of Object.entries(DEFAULT_ROLE_PERMISSION_MAP)) {
      if (roleSlug === 'citizen') continue; // Citizen is a public account type, not an administrative role
      for (const [permKey, scope] of grants) {
        insertRolePerm.run(roleSlug, permKey, scope);
      }
    }

    const insertUser = this.db.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, password_hash, name_bn, title_bn, mobile, email,
        primary_role, administrative_unit_id, is_active, mfa_enabled,
        failed_login_attempts, locked_until, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, NULL, ?)
    `);
    const insertUserRole = this.db.prepare(`
      INSERT OR IGNORE INTO user_roles (
        id, user_id, role_slug, administrative_unit_id, is_primary,
        assigned_by, expires_at, is_active, created_at
      ) VALUES (?, ?, ?, ?, 1, 'system_seed', NULL, 1, ?)
    `);
    const insertInstAssign = this.db.prepare(`
      INSERT OR IGNORE INTO user_institution_assignments (
        id, user_id, administrative_unit_id, is_active, assigned_by, created_at
      ) VALUES (?, ?, ?, 1, 'system_seed', ?)
    `);
    const insertAuthority = this.db.prepare(`
      INSERT OR IGNORE INTO approval_authority_assignments (
        id, user_id, role_slug, administrative_unit_id, service_id,
        max_fee_limit, effective_from, expires_at, delegated_by,
        delegation_note_bn, allow_self_approval, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, 'system_seed', ?, 0, 1, ?)
    `);

    const addUser = (params: {
      id: string;
      username: string;
      name_bn: string;
      title_bn: string;
      mobile: string;
      email: string;
      role: UserRole;
      unitId?: string | null;
      mfa?: boolean;
    }) => {
      insertUser.run(
        params.id,
        params.username,
        DEFAULT_DEMO_PASSWORD_HASH,
        params.name_bn,
        params.title_bn,
        params.mobile,
        params.email,
        params.role,
        params.unitId || null,
        params.mfa === false ? 0 : 1,
        nowIso
      );
      if (params.role !== 'citizen') {
        insertUserRole.run(
          `ur_${params.id}_${params.role}`,
          params.id,
          params.role,
          params.unitId || null,
          nowIso
        );
      }
      if (params.unitId) {
        insertInstAssign.run(`uia_${params.id}_${params.unitId}`, params.id, params.unitId, nowIso);
      }
    };

    // Global Platform Administrative Users: SUPERVISOR & DEVELOPER
    addUser({
      id: 'off_supervisor',
      username: 'supervisor',
      name_bn: 'মোছাঃ নাজনীন জাহান',
      title_bn: 'প্ল্যাটফর্ম সুপারভাইজার ও সিস্টেম অ্যাডমিনিস্ট্রেটর',
      mobile: '01700-000001',
      email: 'supervisor@pottoyonbd.gov.bd',
      role: 'supervisor',
      unitId: null,
    });
    // Keep superadmin username as alias for supervisor account compatibility
    addUser({
      id: 'off_super_admin',
      username: 'superadmin',
      name_bn: 'মোছাঃ নাজনীন জাহান',
      title_bn: 'প্ল্যাটফর্ম সুপারভাইজার ও সিস্টেম অ্যাডমিনিস্ট্রেটর',
      mobile: '01700-000001',
      email: 'superadmin@pottoyonbd.gov.bd',
      role: 'supervisor',
      unitId: null,
    });
    addUser({
      id: 'off_dev_admin',
      username: 'developer',
      name_bn: 'মোঃ রাকিবুল হাসান',
      title_bn: 'সিনিয়র প্ল্যাটফর্ম ডেভেলপার ও টেকনিক্যাল রক্ষণাবেক্ষণ কর্মকর্তা',
      mobile: '01700-000099',
      email: 'dev@pottoyonbd.gov.bd',
      role: 'developer',
      unitId: null,
    });

    // Public Citizen Accounts (Not administrative roles)
    addUser({
      id: 'usr_citizen_portal',
      username: 'citizen',
      name_bn: 'মোঃ মনিরুল ইসলাম',
      title_bn: 'নাগরিক সেবা ব্যবহারকারী',
      mobile: '01712-345678',
      email: 'citizen1@pottoyonbd.gov.bd',
      role: 'citizen',
      unitId: null,
      mfa: false,
    });
    addUser({
      id: 'usr_citizen_2',
      username: 'citizen2',
      name_bn: 'মোছাঃ সালমা খাতুন',
      title_bn: 'নাগরিক সেবা ব্যবহারকারী',
      mobile: '01799-887766',
      email: 'citizen2@pottoyonbd.gov.bd',
      role: 'citizen',
      unitId: null,
      mfa: false,
    });

    const institutions = this.getInstitutions();
    const chairmanAuthorizedServices = [
      'srv_warish',
      'srv_nationality',
      'srv_character',
      'srv_citizenship',
      'srv_family',
      'srv_inheritance',
      'srv_death',
      'srv_birth_corr',
      'srv_address',
      'srv_unmarried',
    ];
    const municipalityAuthorizedServices = [
      'srv_trade_license',
      'srv_warish',
      'srv_nationality',
      'srv_character',
      'srv_citizenship',
      'srv_family',
      'srv_inheritance',
      'srv_holding_tax',
    ];

    for (const inst of institutions) {
      const authorizedServices =
        inst.type === 'municipality' ? municipalityAuthorizedServices : chairmanAuthorizedServices;

      addUser({
        id: `off_${inst.code}_chairman`,
        username: `${inst.code}.chairman`,
        name_bn: inst.chairman_or_mayor_name_bn,
        title_bn: inst.chairman_or_mayor_title_bn,
        mobile: inst.contact_phone,
        email: `chairman.${inst.code}@pottoyonbd.gov.bd`,
        role: 'chairman',
        unitId: inst.id,
      });
      for (const srvId of authorizedServices) {
        insertAuthority.run(
          `aa_${inst.code}_chairman_${srvId}`,
          `off_${inst.code}_chairman`,
          'chairman',
          inst.id,
          srvId,
          nowIso,
          `স্থানীয় সরকার বিধি অনুযায়ী ${inst.name_bn}-এ ${srvId} সনদ অনুমোদন ক্ষমতা`,
          nowIso
        );
      }

      addUser({
        id: `off_${inst.code}_secretary`,
        username: `${inst.code}.secretary`,
        name_bn: inst.secretary_or_ceo_name_bn,
        title_bn: inst.secretary_or_ceo_title_bn,
        mobile: inst.type === 'municipality' ? '01711-889901' : '01718-770011',
        email: `secretary.${inst.code}@pottoyonbd.gov.bd`,
        role: 'secretary',
        unitId: inst.id,
      });
    }

    this.ensureInitialFourAdminAccounts();
  }

  public ensureInitialFourAdminAccounts(): void {
    const nowIso = '2026-11-13T00:00:00.000Z';
    const insertInitialUser = this.db.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, password_hash, name_bn, title_bn, mobile, email,
        primary_role, administrative_unit_id, is_active, mfa_enabled,
        account_status, identity_verified, must_change_password, appointment_note_bn,
        failed_login_attempts, locked_until, created_at
      ) VALUES (?, ?, 'UNSET_INVITATION_REQUIRED', ?, ?, ?, ?, ?, ?, 0, 1, 'pending_verification', 0, 1, ?, 0, NULL, ?)
    `);
    const insertUserRole = this.db.prepare(`
      INSERT OR IGNORE INTO user_roles (
        id, user_id, role_slug, administrative_unit_id, is_primary,
        assigned_by, expires_at, is_active, created_at
      ) VALUES (?, ?, ?, ?, 1, 'system_initial_setup', NULL, 1, ?)
    `);
    const insertInstAssign = this.db.prepare(`
      INSERT OR IGNORE INTO user_institution_assignments (
        id, user_id, administrative_unit_id, is_active, assigned_by, created_at
      ) VALUES (?, ?, ?, 1, 'system_initial_setup', ?)
    `);
    const insertAuthority = this.db.prepare(`
      INSERT OR IGNORE INTO approval_authority_assignments (
        id, user_id, role_slug, administrative_unit_id, service_id,
        max_fee_limit, effective_from, expires_at, delegated_by,
        delegation_note_bn, allow_self_approval, is_active, created_at
      ) VALUES (?, ?, 'chairman', 'unit_goyeshpur', ?, NULL, ?, NULL, 'system_initial_setup', ?, 0, 1, ?)
    `);

    // Account 1 — UP CHAIRMAN (MD Unus Ali, Goyeshpur Union Parishad, Pending Identity Verification)
    insertInitialUser.run(
      'usr_init_goyeshpur_chairman',
      'md.unus.ali',
      'MD Unus Ali',
      'ইউপি চেয়ারম্যান, গয়েশপুর ইউনিয়ন পরিষদ (পরিচয় ও নিয়োগ যাচাই অপেক্ষমাণ)',
      '01711-000101',
      'unus.ali.goyeshpur@pottoyonbd.gov.bd',
      'chairman',
      'unit_goyeshpur',
      'প্রস্তাবিত নাম (MD Unus Ali) — দাপ্তরিক নিয়োগ ও পরিচয় যাচাই না হওয়া পর্যন্ত নিষ্ক্রিয় (Pending Identity Verification)। কেবল গয়েশপুর ইউনিয়ন পরিষদের জন্য প্রযোজ্য।',
      nowIso
    );
    insertUserRole.run(
      'ur_usr_init_goyeshpur_chairman_chairman',
      'usr_init_goyeshpur_chairman',
      'chairman',
      'unit_goyeshpur',
      nowIso
    );
    insertInstAssign.run(
      'uia_usr_init_goyeshpur_chairman_unit_goyeshpur',
      'usr_init_goyeshpur_chairman',
      'unit_goyeshpur',
      nowIso
    );
    const chairmanServices = [
      'srv_warish',
      'srv_nationality',
      'srv_character',
      'srv_citizenship',
      'srv_family',
      'srv_inheritance',
      'srv_death',
      'srv_birth_corr',
      'srv_address',
      'srv_unmarried',
    ];
    for (const srvId of chairmanServices) {
      insertAuthority.run(
        `aa_init_goyeshpur_chairman_${srvId}`,
        'usr_init_goyeshpur_chairman',
        srvId,
        nowIso,
        `গয়েশপুর ইউনিয়ন পরিষদ — ${srvId} সনদ অনুমোদন এখতিয়ার (পরিচয় যাচাই সাপেক্ষে)`,
        nowIso
      );
    }

    // Account 2 — UP SECRETARY (Md Saiduzzaman, Goyeshpur Union Parishad, Pending Identity Verification)
    insertInitialUser.run(
      'usr_init_goyeshpur_secretary',
      'md.saiduzzaman',
      'Md Saiduzzaman',
      'ইউপি সচিব, গয়েশপুর ইউনিয়ন পরিষদ (পরিচয় ও নিয়োগ যাচাই অপেক্ষমাণ)',
      '01718-000102',
      'saiduzzaman.goyeshpur@pottoyonbd.gov.bd',
      'secretary',
      'unit_goyeshpur',
      'প্রস্তাবিত নাম (Md Saiduzzaman) — বর্তমান ইউপি সচিবের পরিচয় ও দাপ্তরিক নিয়োগ যাচাই সম্পন্ন না হওয়া পর্যন্ত অ্যাকাউন্ট সক্রিয় করা নিষিদ্ধ (Pending Identity Verification)। চূড়ান্ত অনুমোদন ও সনদ ইস্যু ক্ষমতা কঠোরভাবে নিষিদ্ধ।',
      nowIso
    );
    insertUserRole.run(
      'ur_usr_init_goyeshpur_secretary_secretary',
      'usr_init_goyeshpur_secretary',
      'secretary',
      'unit_goyeshpur',
      nowIso
    );
    insertInstAssign.run(
      'uia_usr_init_goyeshpur_secretary_unit_goyeshpur',
      'usr_init_goyeshpur_secretary',
      'unit_goyeshpur',
      nowIso
    );

    // Account 3 — SUPERVISOR (ProttoyonBD Admin, prottoyonbd.admin, Global Platform, Mandatory MFA)
    insertInitialUser.run(
      'usr_init_prottoyonbd_admin',
      'prottoyonbd.admin',
      'ProttoyonBD Admin',
      'গ্লোবাল প্ল্যাটফর্ম সুপারভাইজার (ProttoyonBD Admin)',
      '01700-000103',
      'admin@pottoyonbd.gov.bd',
      'supervisor',
      null,
      'গ্লোবাল প্ল্যাটফর্ম সুপারভাইজার অ্যাকাউন্ট (বাধ্যতামূলক MFA সুরক্ষিত)। আমন্ত্রণ টোকেনের মাধ্যমে শক্তিশালী পাসওয়ার্ড সেটআপ ও যাচাই সাপেক্ষে সক্রিয় হবে।',
      nowIso
    );
    insertUserRole.run(
      'ur_usr_init_prottoyonbd_admin_supervisor',
      'usr_init_prottoyonbd_admin',
      'supervisor',
      null,
      nowIso
    );

    // Account 4 — DEVELOPER (Rakibul Islam Siam, rakibul.siam, Global Technical Access, Mandatory MFA)
    insertInitialUser.run(
      'usr_init_rakibul_siam',
      'rakibul.siam',
      'Rakibul Islam Siam',
      'গ্লোবাল টেকনিক্যাল ডেভেলপার (Global Technical Access)',
      '01700-000104',
      'siamllc2023@gmail.com',
      'developer',
      null,
      'গ্লোবাল টেকনিক্যাল ডেভেলপার অ্যাকাউন্ট (বাধ্যতামূলক MFA সুরক্ষিত)। স্বয়ংক্রিয় সুপারভাইজার ক্ষমতা নেই; প্রোডাকশন ডিপ্লয়মেন্টের জন্য অনুমোদিত ও অডিটকৃত অ্যাক্সেস আবশ্যক।',
      nowIso
    );
    insertUserRole.run(
      'ur_usr_init_rakibul_siam_developer',
      'usr_init_rakibul_siam',
      'developer',
      null,
      nowIso
    );

    // Record immutable provisioning audit entry once
    const existingAudit = this.db
      .prepare("SELECT id FROM permission_audit_logs WHERE id = 'pal_initial_four_admins_provisioned' LIMIT 1")
      .get();
    if (!existingAudit) {
      this.db
        .prepare(
          `INSERT INTO permission_audit_logs (
            id, actor_id, actor_role, actor_name_bn, action_type, target_type, target_id,
            administrative_unit_id, before_json, after_json, reason_bn, created_at
          ) VALUES (?, 'system_initial_setup', 'supervisor', 'সিস্টেম ইনিশিয়ালাইজার', 'INITIAL_FOUR_ADMIN_ACCOUNTS_PROVISIONED', 'user_accounts', 'initial_4_admins', 'unit_goyeshpur', NULL, ?, ?, ?)`
        )
        .run(
          'pal_initial_four_admins_provisioned',
          JSON.stringify({
            accounts: [
              { id: 'usr_init_goyeshpur_chairman', username: 'md.unus.ali', role: 'UP_CHAIRMAN', unit: 'unit_goyeshpur', status: 'pending_verification' },
              { id: 'usr_init_goyeshpur_secretary', username: 'md.saiduzzaman', role: 'UP_SECRETARY', unit: 'unit_goyeshpur', status: 'pending_verification' },
              { id: 'usr_init_prottoyonbd_admin', username: 'prottoyonbd.admin', role: 'SUPERVISOR', scope: 'global', mfa: true },
              { id: 'usr_init_rakibul_siam', username: 'rakibul.siam', role: 'DEVELOPER', scope: 'global', mfa: true },
            ],
          }),
          '৪টি প্রারম্ভিক প্রশাসনিক অ্যাকাউন্ট (UP_CHAIRMAN, UP_SECRETARY, SUPERVISOR, DEVELOPER) ডিফল্ট পাসওয়ার্ড ব্যতীত এবং পরিচয় যাচাই অপেক্ষমাণ অবস্থায় প্রস্তুত করা হয়েছে।',
          nowIso
        );
    }
  }

  public async ensureSeedCertificateAsset(): Promise<void> {
    if (this.initializedSeedCertPdf) return;
    const cert = this.getCertificateById('cert_10275626255');
    if (!cert) return;
    const unit = this.getInstitutionById(cert.administrative_unit_id);
    if (!unit) return;

    const seedDef = INITIAL_CERTIFICATES[0];
    if (seedDef && cert.status === 'valid' && !cert.reissued_from_cert_id) {
      this.db
        .prepare(
          `UPDATE certificates
           SET certificate_title_bn = ?,
               issue_date_bn = ?,
               applicant_name_bn = ?,
               father_name_bn = ?,
               mother_name_bn = ?,
               permanent_address_bn = ?,
               present_address_bn = ?,
               heirs_json = ?,
               officer_name_bn = ?,
               officer_title_bn = ?
           WHERE id = 'cert_10275626255'`
        )
        .run(
          seedDef.certificate_title_bn,
          seedDef.issue_date_bn,
          seedDef.applicant_name_bn,
          seedDef.father_name_bn,
          seedDef.mother_name_bn,
          seedDef.permanent_address_bn,
          seedDef.present_address_bn,
          seedDef.heirs ? JSON.stringify(seedDef.heirs) : null,
          seedDef.officer_name_bn,
          seedDef.officer_title_bn
        );
    }

    const refreshed = this.getCertificateById('cert_10275626255') || cert;
    const verificationUrl = 'https://pottoyonbd.gov.bd/verify/10275626255';
    const generated = await generateAndStoreCertificatePdf({
      certificateNumber: refreshed.certificate_number || '10275626255',
      certificateTitleBn: refreshed.certificate_title_bn,
      issueDateBn: refreshed.issue_date_bn,
      issueDateEn: refreshed.issue_date_en,
      expiresAtIso: refreshed.expires_at,
      applicantNameBn: refreshed.applicant_name_bn,
      fatherNameBn: refreshed.father_name_bn,
      motherNameBn: refreshed.mother_name_bn,
      permanentAddressBn: refreshed.permanent_address_bn,
      presentAddressBn: refreshed.present_address_bn,
      heirs: refreshed.heirs,
      unit,
      officerNameBn: refreshed.officer_name_bn,
      officerTitleBn: refreshed.officer_title_bn,
      verificationUrl,
      templateVersionId: refreshed.template_version_id || 'tpl_up_general_v1',
      status: refreshed.status,
    });

    this.db
      .prepare('UPDATE certificates SET qr_data_url = ?, pdf_path = ? WHERE id = ?')
      .run(generated.qrDataUrl, generated.pdfPath, refreshed.id);
    this.initializedSeedCertPdf = true;
  }

  // --- Readers & Writers ---
  public getInstitutions(): AdministrativeUnit[] {
    const rows = this.db.prepare('SELECT data_json FROM institutions').all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as AdministrativeUnit);
  }

  public getInstitutionById(idOrCode: string): AdministrativeUnit | undefined {
    const row = this.db
      .prepare('SELECT data_json FROM institutions WHERE id = ? OR code = ?')
      .get(idOrCode, idOrCode) as { data_json: string } | undefined;
    return row ? (JSON.parse(row.data_json) as AdministrativeUnit) : undefined;
  }

  public updateInstitution(unit: AdministrativeUnit): void {
    this.db
      .prepare('UPDATE institutions SET data_json = ? WHERE id = ?')
      .run(JSON.stringify(unit), unit.id);
  }

  private withDefaultWorkflowSteps(srv: Service): Service {
    if (Array.isArray(srv.workflow_steps) && srv.workflow_steps.length > 0) {
      return srv;
    }
    const steps: WorkflowStepKey[] = ['secretary_verification', 'approver_decision'];
    return {
      ...srv,
      workflow_steps: steps,
      is_active: srv.is_active ?? true,
    };
  }

  public getServices(): Service[] {
    const rows = this.db.prepare('SELECT data_json FROM services').all() as Array<{ data_json: string }>;
    return rows.map((r) => this.withDefaultWorkflowSteps(JSON.parse(r.data_json) as Service));
  }

  public getServiceById(id: string): Service | undefined {
    const row = this.db.prepare('SELECT data_json FROM services WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? this.withDefaultWorkflowSteps(JSON.parse(row.data_json) as Service) : undefined;
  }

  public updateService(srv: Service): void {
    this.db
      .prepare('UPDATE services SET category = ?, data_json = ? WHERE id = ?')
      .run(srv.category, JSON.stringify(srv), srv.id);
  }

  public getApplications(unitId?: string): Application[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT data_json FROM applications WHERE administrative_unit_id = ? ORDER BY updated_at DESC')
          .all(unitId) as Array<{ data_json: string }>)
      : (this.db
          .prepare('SELECT data_json FROM applications ORDER BY updated_at DESC')
          .all() as Array<{ data_json: string }>);
    return rows.map((r) => {
      const app = JSON.parse(r.data_json) as Application;
      const attachments = this.getApplicationAttachments(app.id);
      if (attachments.length > 0) {
        app.attachments = attachments;
      }
      return app;
    });
  }

  public getApplicationByIdOrTracking(idOrTracking: string): Application | undefined {
    const clean = idOrTracking.trim();
    const row = this.db
      .prepare('SELECT data_json FROM applications WHERE id = ? OR UPPER(tracking_no) = UPPER(?)')
      .get(clean, clean) as { data_json: string } | undefined;
    if (!row) return undefined;
    const app = JSON.parse(row.data_json) as Application;
    const attachments = this.getApplicationAttachments(app.id);
    if (attachments.length > 0) {
      app.attachments = attachments;
    }
    return app;
  }

  public upsertApplication(app: Application): void {
    const { attachments: _att, ...serializable } = app;
    this.db
      .prepare(`
        INSERT INTO applications (
          id, tracking_no, administrative_unit_id, service_id,
          status, payment_status, updated_at, data_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          payment_status = excluded.payment_status,
          updated_at = excluded.updated_at,
          data_json = excluded.data_json
      `)
      .run(
        app.id,
        app.tracking_no,
        app.administrative_unit_id,
        app.service_id,
        app.status,
        app.payment_status,
        app.updated_at,
        JSON.stringify(serializable)
      );
  }

  public getApplicationAttachments(applicationId: string): ApplicationAttachment[] {
    const rows = this.db
      .prepare('SELECT id, application_id, doc_type, original_name, mime_type, size_bytes, uploaded_at FROM application_attachments WHERE application_id = ? ORDER BY uploaded_at DESC')
      .all(applicationId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      application_id: String(r.application_id),
      doc_type: String(r.doc_type) as ApplicationAttachment['doc_type'],
      original_name: String(r.original_name),
      mime_type: String(r.mime_type),
      size_bytes: Number(r.size_bytes),
      uploaded_at: String(r.uploaded_at),
    }));
  }

  public getAttachmentWithPath(attachmentId: string): (ApplicationAttachment & { storage_path: string }) | undefined {
    const row = this.db
      .prepare('SELECT * FROM application_attachments WHERE id = ?')
      .get(attachmentId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      application_id: String(row.application_id),
      doc_type: String(row.doc_type) as ApplicationAttachment['doc_type'],
      original_name: String(row.original_name),
      mime_type: String(row.mime_type),
      size_bytes: Number(row.size_bytes),
      storage_path: String(row.storage_path),
      uploaded_at: String(row.uploaded_at),
    };
  }

  public insertAttachment(att: ApplicationAttachment & { storage_path: string }): void {
    this.db
      .prepare(
        `INSERT INTO application_attachments (
          id, application_id, doc_type, original_name, mime_type, size_bytes, storage_path, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        att.id,
        att.application_id,
        att.doc_type,
        att.original_name,
        att.mime_type,
        att.size_bytes,
        att.storage_path,
        att.uploaded_at
      );
  }

  public getActiveTemplate(unitId: string, serviceId: string): CertificateTemplate {
    const row =
      (this.db
        .prepare(
          `SELECT * FROM certificate_templates
           WHERE is_active = 1 AND administrative_unit_id = ? AND service_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(unitId, serviceId) as Record<string, unknown> | undefined) ||
      (this.db
        .prepare(
          `SELECT * FROM certificate_templates
           WHERE is_active = 1 AND administrative_unit_id = '*' AND service_id = ?
           ORDER BY created_at DESC LIMIT 1`
        )
        .get(serviceId) as Record<string, unknown> | undefined) ||
      (this.db
        .prepare(
          `SELECT * FROM certificate_templates
           WHERE is_active = 1 AND administrative_unit_id = '*' AND service_id = '*'
           ORDER BY created_at DESC LIMIT 1`
        )
        .get() as Record<string, unknown>);

    return {
      id: String(row.id),
      administrative_unit_id: String(row.administrative_unit_id),
      service_id: String(row.service_id),
      version: String(row.version),
      name_bn: String(row.name_bn),
      header_text_bn: String(row.header_text_bn),
      body_intro_bn: String(row.body_intro_bn),
      footer_disclaimer_bn: String(row.footer_disclaimer_bn),
      default_validity_days:
        row.default_validity_days === null || row.default_validity_days === undefined
          ? null
          : Number(row.default_validity_days),
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at),
    };
  }

  public getCertificateTemplates(): CertificateTemplate[] {
    const rows = this.db
      .prepare('SELECT * FROM certificate_templates ORDER BY created_at DESC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id),
      administrative_unit_id: String(row.administrative_unit_id),
      service_id: String(row.service_id),
      version: String(row.version),
      name_bn: String(row.name_bn),
      header_text_bn: String(row.header_text_bn),
      body_intro_bn: String(row.body_intro_bn),
      footer_disclaimer_bn: String(row.footer_disclaimer_bn),
      default_validity_days:
        row.default_validity_days === null || row.default_validity_days === undefined
          ? null
          : Number(row.default_validity_days),
      is_active: Boolean(row.is_active),
      created_at: String(row.created_at),
    }));
  }

  private mapCertificateRow(row: Record<string, unknown>): Certificate {
    const expiresAt = row.expires_at ? String(row.expires_at) : null;
    const revokedAt = row.revoked_at ? String(row.revoked_at) : null;
    let computedStatus: 'valid' | 'revoked' | 'expired' =
      row.status === 'revoked' || revokedAt ? 'revoked' : 'valid';
    if (computedStatus === 'valid' && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      computedStatus = 'expired';
    }

    const certNumber = String(row.certificate_number);
    const appRow = this.db
      .prepare('SELECT tracking_no, data_json FROM applications WHERE id = ?')
      .get(String(row.application_id)) as { tracking_no: string; data_json: string } | undefined;
    const parsedApp = appRow ? (JSON.parse(appRow.data_json) as Application) : undefined;
    const inst = this.getInstitutionById(String(row.administrative_unit_id));
    const srv = this.getServiceById(String(row.service_id));

    return {
      id: String(row.id),
      certificate_no: certNumber,
      certificate_number: certNumber,
      verification_token_hash: String(row.verification_token_hash),
      application_id: String(row.application_id),
      application_tracking_no: appRow?.tracking_no,
      application_created_at: parsedApp?.created_at,
      assigned_officer: parsedApp?.assigned_officer || String(row.officer_name_bn),
      administrative_unit_id: String(row.administrative_unit_id),
      issuing_unit_bn: inst?.name_bn,
      service_id: String(row.service_id),
      service_name_bn: srv?.name_bn || String(row.certificate_title_bn),
      template_version_id: String(row.template_version_id),
      issued_by: String(row.issued_by),
      approved_at: String(row.approved_at),
      issued_at: String(row.issued_at),
      expires_at: expiresAt,
      revoked_at: revokedAt,
      revocation_reason: row.revocation_reason ? String(row.revocation_reason) : null,
      reissued_from_cert_id: row.reissued_from_cert_id ? String(row.reissued_from_cert_id) : null,
      pdf_path: String(row.pdf_path),
      pdf_available: Boolean(row.pdf_path && isValidPdfFile(String(row.pdf_path))),
      certificate_title_bn: String(row.certificate_title_bn),
      issue_date_bn: String(row.issue_date_bn),
      issue_date_en: String(row.issue_date_en),
      applicant_name_bn: String(row.applicant_name_bn),
      father_name_bn: String(row.father_name_bn),
      mother_name_bn: String(row.mother_name_bn),
      permanent_address_bn: String(row.permanent_address_bn),
      present_address_bn: String(row.present_address_bn),
      heirs: row.heirs_json ? (JSON.parse(String(row.heirs_json)) as Certificate['heirs']) : undefined,
      qr_data_url: row.qr_data_url ? String(row.qr_data_url) : undefined,
      verification_url: `https://pottoyonbd.gov.bd/verify/${certNumber === '10275626255' ? '10275626255' : '[protected-token]'}`,
      officer_name_bn: String(row.officer_name_bn),
      officer_title_bn: String(row.officer_title_bn),
      status: computedStatus,
    };
  }

  public getCertificates(unitId?: string): Certificate[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT * FROM certificates WHERE administrative_unit_id = ? ORDER BY issued_at DESC')
          .all(unitId) as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM certificates ORDER BY issued_at DESC')
          .all() as Array<Record<string, unknown>>);
    return rows.map((r) => this.mapCertificateRow(r));
  }

  public getCertificateById(id: string): Certificate | undefined {
    const row = this.db
      .prepare('SELECT * FROM certificates WHERE id = ? OR certificate_number = ?')
      .get(id, id) as Record<string, unknown> | undefined;
    return row ? this.mapCertificateRow(row) : undefined;
  }

  public getCertificateByApplicationId(applicationId: string): Certificate | undefined {
    const row = this.db
      .prepare('SELECT * FROM certificates WHERE application_id = ? ORDER BY issued_at DESC LIMIT 1')
      .get(applicationId) as Record<string, unknown> | undefined;
    return row ? this.mapCertificateRow(row) : undefined;
  }

  public getCertificateByTokenHash(tokenHash: string): Certificate | undefined {
    const row = this.db
      .prepare('SELECT * FROM certificates WHERE verification_token_hash = ?')
      .get(tokenHash) as Record<string, unknown> | undefined;
    return row ? this.mapCertificateRow(row) : undefined;
  }

  public getCertificateEvents(certificateId?: string, unitId?: string, applicationId?: string): CertificateEvent[] {
    let rows: Array<Record<string, unknown>>;
    if (certificateId) {
      rows = this.db
        .prepare('SELECT * FROM certificate_events WHERE certificate_id = ? ORDER BY created_at DESC')
        .all(certificateId) as Array<Record<string, unknown>>;
    } else if (applicationId) {
      rows = this.db
        .prepare('SELECT * FROM certificate_events WHERE application_id = ? ORDER BY created_at DESC')
        .all(applicationId) as Array<Record<string, unknown>>;
    } else if (unitId) {
      rows = this.db
        .prepare('SELECT * FROM certificate_events WHERE administrative_unit_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(unitId) as Array<Record<string, unknown>>;
    } else {
      rows = this.db
        .prepare('SELECT * FROM certificate_events ORDER BY created_at DESC LIMIT 100')
        .all() as Array<Record<string, unknown>>;
    }
    return rows.map((r) => ({
      id: String(r.id),
      certificate_id: String(r.certificate_id),
      application_id: String(r.application_id),
      administrative_unit_id: String(r.administrative_unit_id),
      event_type: String(r.event_type) as CertificateEvent['event_type'],
      actor_id: String(r.actor_id),
      actor_role: String(r.actor_role) as CertificateEvent['actor_role'],
      actor_name_bn: String(r.actor_name_bn),
      metadata: r.metadata_json ? (JSON.parse(String(r.metadata_json)) as Record<string, unknown>) : undefined,
      created_at: String(r.created_at),
    }));
  }

  public getVerificationLogs(unitId?: string, certificateId?: string): CertificateVerificationLog[] {
    let rows: Array<Record<string, unknown>>;
    if (certificateId) {
      rows = this.db
        .prepare('SELECT * FROM certificate_verification_logs WHERE certificate_id = ? ORDER BY verified_at DESC LIMIT 100')
        .all(certificateId) as Array<Record<string, unknown>>;
    } else if (unitId) {
      rows = this.db
        .prepare(
          `SELECT l.* FROM certificate_verification_logs l
           LEFT JOIN certificates c ON l.certificate_id = c.id
           WHERE c.administrative_unit_id = ?
           ORDER BY l.verified_at DESC LIMIT 100`
        )
        .all(unitId) as Array<Record<string, unknown>>;
    } else {
      rows = this.db
        .prepare('SELECT * FROM certificate_verification_logs ORDER BY verified_at DESC LIMIT 100')
        .all() as Array<Record<string, unknown>>;
    }

    return rows.map((r) => ({
      id: String(r.id),
      certificate_id: r.certificate_id ? String(r.certificate_id) : null,
      token_hash_prefix: String(r.token_hash_prefix),
      result_status: String(r.result_status) as CertificateVerificationLog['result_status'],
      ip_address: String(r.ip_address),
      user_agent: String(r.user_agent),
      verified_at: String(r.verified_at),
    }));
  }

  public getApplicationApprovals(applicationId?: string): ApplicationApproval[] {
    const rows = applicationId
      ? (this.db
          .prepare('SELECT * FROM application_approvals WHERE application_id = ? ORDER BY approved_at DESC')
          .all(applicationId) as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM application_approvals ORDER BY approved_at DESC LIMIT 100')
          .all() as Array<Record<string, unknown>>);
    return rows.map((r) => ({
      id: String(r.id),
      application_id: String(r.application_id),
      administrative_unit_id: String(r.administrative_unit_id),
      officer_id: String(r.officer_id),
      officer_role: String(r.officer_role) as ApplicationApproval['officer_role'],
      officer_name_bn: String(r.officer_name_bn),
      officer_title_bn: String(r.officer_title_bn),
      decision: String(r.decision) as ApplicationApproval['decision'],
      notes: String(r.notes),
      approved_at: String(r.approved_at),
    }));
  }

  public recordApprovalAction(params: {
    applicationId: string;
    unitId: string;
    officerId: string;
    officerRole: ApplicationApproval['officer_role'];
    officerNameBn: string;
    officerTitleBn: string;
    decision: ApplicationApproval['decision'];
    notes: string;
    timestamp?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO application_approvals (
          id, application_id, administrative_unit_id, officer_id,
          officer_role, officer_name_bn, officer_title_bn, decision, notes, approved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `apr_${crypto.randomUUID()}`,
        params.applicationId,
        params.unitId,
        params.officerId,
        params.officerRole,
        params.officerNameBn,
        params.officerTitleBn,
        params.decision,
        params.notes,
        params.timestamp || new Date().toISOString()
      );
  }

  public getNotifications(params?: {
    unitId?: string;
    applicationId?: string;
    mobile?: string;
  }): CitizenNotification[] {
    let rows: Array<Record<string, unknown>>;
    if (params?.applicationId) {
      rows = this.db
        .prepare('SELECT * FROM notifications WHERE application_id = ? ORDER BY created_at DESC')
        .all(params.applicationId) as Array<Record<string, unknown>>;
    } else if (params?.mobile) {
      rows = this.db
        .prepare('SELECT * FROM notifications WHERE recipient_mobile = ? ORDER BY created_at DESC')
        .all(params.mobile) as Array<Record<string, unknown>>;
    } else if (params?.unitId) {
      rows = this.db
        .prepare('SELECT * FROM notifications WHERE administrative_unit_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(params.unitId) as Array<Record<string, unknown>>;
    } else {
      rows = this.db
        .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100')
        .all() as Array<Record<string, unknown>>;
    }
    return rows.map((r) => ({
      id: String(r.id),
      recipient_mobile: String(r.recipient_mobile),
      application_id: String(r.application_id),
      certificate_id: r.certificate_id ? String(r.certificate_id) : undefined,
      administrative_unit_id: String(r.administrative_unit_id),
      title_bn: String(r.title_bn),
      message_bn: String(r.message_bn),
      channel: String(r.channel) as 'sms' | 'portal',
      status: String(r.status) as 'sent' | 'queued' | 'failed',
      is_read: Boolean(r.is_read),
      created_at: String(r.created_at),
    }));
  }

  public insertNotification(params: {
    mobile: string;
    applicationId: string;
    certificateId?: string;
    unitId: string;
    titleBn: string;
    messageBn: string;
    channel?: 'sms' | 'portal';
  }): void {
    this.db
      .prepare(
        `INSERT INTO notifications (
          id, recipient_mobile, application_id, certificate_id,
          administrative_unit_id, title_bn, message_bn, channel, status, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `notif_${crypto.randomUUID()}`,
        params.mobile,
        params.applicationId,
        params.certificateId || null,
        params.unitId,
        params.titleBn,
        params.messageBn,
        params.channel || 'sms',
        'sent',
        0,
        new Date().toISOString()
      );
  }

  public getHoldingTaxes(unitId?: string): HoldingTaxRecord[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT data_json FROM holding_taxes WHERE administrative_unit_id = ?')
          .all(unitId) as Array<{ data_json: string }>)
      : (this.db.prepare('SELECT data_json FROM holding_taxes').all() as Array<{ data_json: string }>);
    return rows.map((r) => JSON.parse(r.data_json) as HoldingTaxRecord);
  }

  public getHoldingTaxById(id: string): HoldingTaxRecord | undefined {
    const row = this.db.prepare('SELECT data_json FROM holding_taxes WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as HoldingTaxRecord) : undefined;
  }

  public upsertHoldingTax(ht: HoldingTaxRecord): void {
    this.db
      .prepare(
        `INSERT INTO holding_taxes (id, administrative_unit_id, data_json)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET administrative_unit_id = excluded.administrative_unit_id, data_json = excluded.data_json`
      )
      .run(ht.id, ht.administrative_unit_id, JSON.stringify(ht));
  }

  public getTradeLicenses(unitId?: string): TradeLicenseRecord[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT data_json FROM trade_licenses WHERE administrative_unit_id = ?')
          .all(unitId) as Array<{ data_json: string }>)
      : (this.db.prepare('SELECT data_json FROM trade_licenses').all() as Array<{ data_json: string }>);
    return rows.map((r) => JSON.parse(r.data_json) as TradeLicenseRecord);
  }

  public getTradeLicenseById(id: string): TradeLicenseRecord | undefined {
    const row = this.db.prepare('SELECT data_json FROM trade_licenses WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as TradeLicenseRecord) : undefined;
  }

  public upsertTradeLicense(tl: TradeLicenseRecord): void {
    this.db
      .prepare(
        `INSERT INTO trade_licenses (id, administrative_unit_id, data_json)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET administrative_unit_id = excluded.administrative_unit_id, data_json = excluded.data_json`
      )
      .run(tl.id, tl.administrative_unit_id, JSON.stringify(tl));
  }

  public getNotices(unitId?: string): Notice[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT data_json FROM notices WHERE administrative_unit_id IS NULL OR administrative_unit_id = ?')
          .all(unitId) as Array<{ data_json: string }>)
      : (this.db.prepare('SELECT data_json FROM notices').all() as Array<{ data_json: string }>);
    return rows.map((r) => JSON.parse(r.data_json) as Notice);
  }

  public upsertNotice(notice: Notice): void {
    this.db
      .prepare(
        `INSERT INTO notices (id, administrative_unit_id, data_json)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET administrative_unit_id = excluded.administrative_unit_id, data_json = excluded.data_json`
      )
      .run(notice.id, notice.administrative_unit_id || null, JSON.stringify(notice));
  }

  public deleteNotice(id: string): boolean {
    const info = this.db.prepare('DELETE FROM notices WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public getStaffMembers(unitId?: string): StaffMember[] {
    const rows = unitId
      ? (this.db
          .prepare('SELECT data_json FROM staff_members WHERE administrative_unit_id = ?')
          .all(unitId) as Array<{ data_json: string }>)
      : (this.db.prepare('SELECT data_json FROM staff_members').all() as Array<{ data_json: string }>);
    return rows.map((r) => JSON.parse(r.data_json) as StaffMember);
  }

  public getStaffById(id: string): StaffMember | undefined {
    const row = this.db.prepare('SELECT data_json FROM staff_members WHERE id = ?').get(id) as
      | { data_json: string }
      | undefined;
    return row ? (JSON.parse(row.data_json) as StaffMember) : undefined;
  }

  public upsertStaffMember(staff: StaffMember): void {
    this.db
      .prepare(
        `INSERT INTO staff_members (id, administrative_unit_id, role, data_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           administrative_unit_id = excluded.administrative_unit_id,
           role = excluded.role,
           data_json = excluded.data_json`
      )
      .run(staff.id, staff.administrative_unit_id, staff.role, JSON.stringify(staff));
  }

  public deleteStaffMember(id: string): boolean {
    const info = this.db.prepare('DELETE FROM staff_members WHERE id = ?').run(id);
    return info.changes > 0;
  }

  public getWardsAndDepartments(unitId?: string, kind?: 'ward' | 'department'): WardOrDepartment[] {
    let rows: Array<{ data_json: string }>;
    if (unitId && kind) {
      rows = this.db
        .prepare('SELECT data_json FROM wards_departments WHERE administrative_unit_id = ? AND kind = ?')
        .all(unitId, kind) as Array<{ data_json: string }>;
    } else if (unitId) {
      rows = this.db
        .prepare('SELECT data_json FROM wards_departments WHERE administrative_unit_id = ?')
        .all(unitId) as Array<{ data_json: string }>;
    } else {
      rows = this.db
        .prepare('SELECT data_json FROM wards_departments')
        .all() as Array<{ data_json: string }>;
    }
    return rows.map((r) => JSON.parse(r.data_json) as WardOrDepartment);
  }

  public upsertWardOrDepartment(item: WardOrDepartment): void {
    this.db
      .prepare(
        `INSERT INTO wards_departments (id, administrative_unit_id, kind, data_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           administrative_unit_id = excluded.administrative_unit_id,
           kind = excluded.kind,
           data_json = excluded.data_json`
      )
      .run(item.id, item.administrative_unit_id, item.kind, JSON.stringify(item));
  }

  public getContactInquiries(): ContactInquiry[] {
    const rows = this.db
      .prepare('SELECT data_json FROM contact_inquiries ORDER BY created_at DESC LIMIT 100')
      .all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as ContactInquiry);
  }

  public insertContactInquiry(inquiry: ContactInquiry): void {
    this.db
      .prepare('INSERT INTO contact_inquiries (id, created_at, data_json) VALUES (?, ?, ?)')
      .run(inquiry.id, inquiry.created_at, JSON.stringify(inquiry));
  }

  public getRolePermissions(): RolePermissionEntry[] {
    const rows = this.db.prepare('SELECT data_json FROM role_permissions').all() as Array<{ data_json: string }>;
    return rows.map((r) => JSON.parse(r.data_json) as RolePermissionEntry);
  }

  public updateRolePermission(entry: RolePermissionEntry): void {
    this.db
      .prepare(
        `INSERT INTO role_permissions (role, data_json) VALUES (?, ?)
         ON CONFLICT(role) DO UPDATE SET data_json = excluded.data_json`
      )
      .run(entry.role, JSON.stringify(entry));
  }

  public getSystemSettings(): SystemSettings {
    const defaultIntegrations = {
      smtp_host: 'smtp.pottoyonbd.gov.bd',
      smtp_port: 587,
      smtp_user: 'noreply@pottoyonbd.gov.bd',
      smtp_from_email: 'noreply@pottoyonbd.gov.bd',
      smtp_enabled: false,
      sms_provider: 'Banglalink/Grameenphone Gov SMS Gateway',
      sms_sender_id: 'POTTOYONBD',
      sms_enabled: true,
      payment_gateway_mode: 'sandbox' as const,
      bkash_merchant_no: '01700000101',
      nagad_merchant_no: '01700000202',
    };
    const row = this.db.prepare("SELECT data_json FROM system_settings WHERE id = 'default'").get() as
      | { data_json: string }
      | undefined;
    if (row) {
      const parsed = JSON.parse(row.data_json) as SystemSettings;
      return {
        ...parsed,
        maintenance_mode: Boolean(parsed.maintenance_mode),
        integrations: {
          ...defaultIntegrations,
          ...(parsed.integrations || {}),
        },
      };
    }
    return {
      platform_name_bn: 'PottoyonBD — পাবনা সদর ডিজিটাল স্থানীয় সরকার সেবা',
      support_phone: '01700-000000',
      support_email: 'info@pottoyonbd.gov.bd',
      verification_base_url: 'https://pottoyonbd.gov.bd/verify',
      allow_online_applications: true,
      require_2fa_for_officers: true,
      auto_sms_notifications: true,
      maintenance_mode: false,
      integrations: defaultIntegrations,
      updated_at: new Date().toISOString(),
    };
  }

  public updateSystemSettings(settings: SystemSettings): void {
    this.db
      .prepare(
        `INSERT INTO system_settings (id, data_json) VALUES ('default', ?)
         ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json`
      )
      .run(JSON.stringify(settings));
  }
}

let singletonDb: PottoyonDatabase | null = null;

export function getDb(): PottoyonDatabase {
  if (!singletonDb) {
    singletonDb = new PottoyonDatabase();
  }
  return singletonDb;
}

export function resetDbInstanceForTests(): void {
  if (singletonDb) {
    try {
      singletonDb.db.close();
    } catch {
      // ignore close errors
    }
    singletonDb = null;
  }
}
