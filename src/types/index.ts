export type InstitutionType = 'union_parishad' | 'municipality';

export interface AdministrativeUnit {
  id: string;
  type: InstitutionType;
  name_bn: string;
  name_en: string;
  code: string;
  upazila_bn: string;
  upazila_en: string;
  district_bn: string;
  district_en: string;
  wards_count: number;
  office_address_bn: string;
  office_address_en: string;
  contact_email: string;
  contact_phone: string;
  chairman_or_mayor_name_bn: string;
  chairman_or_mayor_title_bn: string;
  secretary_or_ceo_name_bn: string;
  secretary_or_ceo_title_bn: string;
  description_bn: string;
  description_en: string;
  established_year: number;
}

export type ServiceCategory =
  | 'citizen_personal'
  | 'financial_social'
  | 'nid_voter'
  | 'licensing'
  | 'other';

export type WorkflowStepKey =
  | 'operator_intake'
  | 'ward_verification'
  | 'secretary_verification'
  | 'department_verification'
  | 'executive_review'
  | 'approver_decision';

export interface Service {
  id: string;
  category: ServiceCategory;
  name_bn: string;
  name_en: string;
  description_bn: string;
  description_en: string;
  delivery_time_days: number;
  default_fee: number;
  required_docs_bn: string[];
  approval_authority_bn: string;
  available_unit_types: InstitutionType[];
  workflow_steps?: WorkflowStepKey[];
  has_warish_table?: boolean;
  is_active?: boolean;
}

export interface WarishMember {
  sl: number;
  name: string;
  dob: string;
  age: number;
  relation: string;
  nid_or_birth_cert?: string;
}

export type ApplicationStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'under_verification'
  | 'correction_required'
  | 'forwarded_for_approval'
  | 'approved'
  | 'rejected'
  | 'certificate_issued'
  | 'cancelled'
  | 'refunded';

export interface ApplicationAttachment {
  id: string;
  application_id: string;
  doc_type: 'nid' | 'photo' | 'proof' | 'other';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface Application {
  id: string;
  tracking_no: string;
  administrative_unit_id: string;
  service_id: string;
  service_name_bn: string;
  applicant_name_bn: string;
  applicant_name_en: string;
  father_name_bn: string;
  mother_name_bn: string;
  spouse_name_bn?: string;
  nid_or_birth_reg: string;
  mobile: string;
  email?: string;
  ward_no: number;
  village_or_area_bn: string;
  road_block_sector_bn?: string;
  holding_no?: string;
  post_office_bn: string;
  upazila_bn: string;
  district_bn: string;
  permanent_address_bn?: string;
  present_address_bn?: string;
  heirs?: WarishMember[];
  status: ApplicationStatus;
  fee_amount: number;
  payment_status: 'unpaid' | 'paid' | 'refunded';
  payment_method?: 'bkash' | 'nagad' | 'rocket' | 'card';
  transaction_id?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  certificate_id?: string;
  verification_token?: string;
  review_notes?: string[];
  assigned_officer?: string;
  assigned_officer_id?: string;
  correction_note?: string;
  rejection_reason?: string;
  decision_reason?: string;
  created_by_user_id?: string;
  created_by_role?: UserRole;
  submitted_by_user_id?: string;
  submitted_at?: string;
  final_approver_user_id?: string;
  approved_at?: string;
  rejected_at?: string;
  attachments?: ApplicationAttachment[];
}

export type CertificateStatus = 'valid' | 'revoked' | 'expired';

export interface Certificate {
  id: string;
  certificate_no: string;
  certificate_number?: string;
  verification_token?: string;
  verification_token_hash?: string;
  application_id: string;
  application_tracking_no?: string;
  application_created_at?: string;
  assigned_officer?: string;
  administrative_unit_id: string;
  issuing_unit_bn?: string;
  service_id: string;
  service_name_bn?: string;
  template_version_id?: string;
  issued_by?: string;
  approved_at?: string;
  issued_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  reissued_from_cert_id?: string | null;
  pdf_path?: string;
  pdf_available?: boolean;
  certificate_title_bn: string;
  issue_date_bn: string;
  issue_date_en: string;
  applicant_name_bn: string;
  father_name_bn: string;
  mother_name_bn: string;
  permanent_address_bn: string;
  present_address_bn: string;
  heirs?: WarishMember[];
  qr_data_url?: string;
  verification_url: string;
  officer_name_bn: string;
  officer_title_bn: string;
  status: CertificateStatus;
}

export interface CertificateTemplate {
  id: string;
  administrative_unit_id: string;
  service_id: string;
  version: string;
  name_bn: string;
  header_text_bn: string;
  body_intro_bn: string;
  footer_disclaimer_bn: string;
  default_validity_days: number | null;
  is_active: boolean;
  created_at: string;
}

export interface CertificateEvent {
  id: string;
  certificate_id: string;
  application_id: string;
  administrative_unit_id: string;
  event_type:
    | 'approved'
    | 'token_generated'
    | 'qr_generated'
    | 'pdf_generated'
    | 'issued'
    | 'revoked'
    | 'reissued'
    | 'assigned'
    | 'correction_requested'
    | 'forwarded'
    | 'duplicate_attempt_blocked';
  actor_id: string;
  actor_role: UserRole;
  actor_name_bn: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CertificateVerificationLog {
  id: string;
  certificate_id: string | null;
  token_hash_prefix: string;
  result_status: 'valid' | 'revoked' | 'expired' | 'invalid';
  ip_address: string;
  user_agent: string;
  verified_at: string;
}

export interface ApplicationApproval {
  id: string;
  application_id: string;
  administrative_unit_id: string;
  officer_id: string;
  officer_role: UserRole;
  officer_name_bn: string;
  officer_title_bn: string;
  decision: 'approved' | 'rejected' | 'forwarded' | 'correction_required' | 'assigned' | 'under_verification' | 'reissued';
  notes: string;
  approved_at: string;
}

export interface CitizenNotification {
  id: string;
  recipient_mobile: string;
  application_id: string;
  certificate_id?: string;
  administrative_unit_id: string;
  title_bn: string;
  message_bn: string;
  channel: 'sms' | 'portal';
  status: 'sent' | 'queued' | 'failed';
  is_read: boolean;
  created_at: string;
}

export interface VerificationResponse {
  verified: boolean;
  status: 'valid' | 'revoked' | 'expired' | 'invalid';
  certificate_number?: string;
  certificate_no?: string;
  certificate_title_bn?: string;
  service_name_bn?: string;
  service_name_en?: string;
  issuing_unit_bn?: string;
  issuing_unit_en?: string;
  issuing_unit_type?: InstitutionType;
  upazila_bn?: string;
  district_bn?: string;
  issue_date_bn?: string;
  issue_date_en?: string;
  issued_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  applicant_name_bn?: string;
  officer_name_bn?: string;
  officer_title_bn?: string;
  template_version_id?: string;
  message_bn?: string;
  privacy_notice_bn?: string;
}

export interface HoldingTaxRecord {
  id: string;
  administrative_unit_id: string;
  holding_no: string;
  ward_no: number;
  owner_name_bn: string;
  owner_mobile: string;
  village_bn: string;
  structure_type: string;
  annual_assessment: number;
  annual_tax: number;
  arrears: number;
  current_due: number;
  fiscal_year: string;
  last_paid_at?: string;
  status: 'paid' | 'due' | 'partial';
}

export interface TradeLicenseRecord {
  id: string;
  license_no: string;
  administrative_unit_id: string;
  business_name_bn: string;
  owner_name_bn: string;
  business_type: string;
  ward_no: number;
  address_bn: string;
  fee_amount: number;
  issue_date: string;
  expiry_date: string;
  status: 'active' | 'expired' | 'pending';
}

export interface Notice {
  id: string;
  administrative_unit_id?: string;
  title_bn: string;
  title_en: string;
  category: string;
  published_at: string;
  content_bn: string;
  is_pinned?: boolean;
}

export interface StaffMember {
  id: string;
  administrative_unit_id: string;
  name_bn: string;
  designation_bn: string;
  role: UserRole;
  employee_code: string;
  mobile: string;
  ward_or_dept_bn?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface WardOrDepartment {
  id: string;
  administrative_unit_id: string;
  kind: 'ward' | 'department';
  code_or_no: string;
  name_bn: string;
  head_name_bn: string;
  head_mobile: string;
  households_or_staff_count: number;
  status: 'active' | 'inactive';
}

export interface ContactInquiry {
  id: string;
  citizen_user_id?: string;
  administrative_unit_id?: string;
  name: string;
  phone: string;
  subject: string;
  message: string;
  status: 'new' | 'resolved';
  created_at: string;
}

export interface RolePermissionEntry {
  role: UserRole;
  label_bn: string;
  scope_bn: string;
  can_view_applications: boolean;
  can_verify_applications: boolean;
  can_forward_applications: boolean;
  can_final_approve: boolean;
  can_revoke_certificate: boolean;
  can_manage_revenue: boolean;
  can_manage_staff: boolean;
  can_manage_settings: boolean;
}

export interface SystemIntegrationsSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from_email: string;
  smtp_enabled: boolean;
  sms_provider: string;
  sms_sender_id: string;
  sms_enabled: boolean;
  payment_gateway_mode: 'sandbox' | 'live';
  bkash_merchant_no: string;
  nagad_merchant_no: string;
}

export interface SystemSettings {
  platform_name_bn: string;
  support_phone: string;
  support_email: string;
  verification_base_url: string;
  allow_online_applications: boolean;
  require_2fa_for_officers: boolean;
  auto_sms_notifications: boolean;
  maintenance_mode?: boolean;
  integrations?: SystemIntegrationsSettings;
  updated_at: string;
}

export interface DashboardStatsResponse {
  total_applications: number;
  pending_applications: number;
  overdue_applications?: number;
  avg_processing_days?: number;
  under_verification: number;
  correction_required: number;
  forwarded_for_approval: number;
  approved_applications: number;
  rejected_applications: number;
  total_certificates: number;
  valid_certificates: number;
  revoked_certificates: number;
  expired_certificates: number;
  total_revenue: number;
  holding_tax_due: number;
  holding_tax_collected: number;
  active_trade_licenses: number;
  monthly_stats: Array<{ month: string; count: number; revenue: number }>;
  service_breakdown: Array<{ service_id: string; service_name_bn: string; count: number }>;
  institution_breakdown: Array<{
    unit_id: string;
    name_bn: string;
    type: InstitutionType;
    applications: number;
    pending?: number;
    overdue?: number;
    avg_days?: number;
    certificates: number;
    revenue: number;
  }>;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type UserRole =
  | 'chairman'
  | 'secretary'
  | 'developer'
  | 'supervisor'
  | 'citizen';

export type PermissionScope =
  | 'global'
  | 'upazila'
  | 'institution'
  | 'department'
  | 'ward'
  | 'assigned'
  | 'own';

export type PermissionKey =
  | 'dashboard.view'
  | 'applications.view'
  | 'applications.view_assigned'
  | 'applications.view_all'
  | 'applications.create'
  | 'applications.edit'
  | 'applications.submit'
  | 'applications.review'
  | 'applications.verify'
  | 'applications.forward'
  | 'applications.recommend'
  | 'applications.request_correction'
  | 'applications.reject'
  | 'applications.approve'
  | 'applications.assign'
  | 'applications.export'
  | 'certificates.view'
  | 'certificates.preview'
  | 'certificates.download'
  | 'certificates.print'
  | 'certificates.issue'
  | 'certificates.revoke'
  | 'certificates.reissue'
  | 'certificates.verify'
  | 'payments.view'
  | 'payments.view_reports'
  | 'payments.reconcile'
  | 'payments.request_refund'
  | 'payments.approve_refund'
  | 'users.view'
  | 'users.create'
  | 'users.edit'
  | 'users.suspend'
  | 'users.activate'
  | 'users.deactivate'
  | 'users.reset_password'
  | 'users.assign_role'
  | 'roles.view'
  | 'roles.manage'
  | 'website.cms.manage'
  | 'website.branding.manage'
  | 'website.pages.manage'
  | 'website.notices.manage'
  | 'seo.view'
  | 'seo.audit'
  | 'seo.edit'
  | 'seo.publish'
  | 'services.view'
  | 'services.manage'
  | 'services.configure_fees'
  | 'services.configure_forms'
  | 'services.configure_workflow'
  | 'employees.view'
  | 'employees.manage'
  | 'employees.assign_department'
  | 'reports.view'
  | 'reports.export'
  | 'settings.view'
  | 'settings.manage'
  | 'settings.smtp.manage'
  | 'settings.sms.manage'
  | 'settings.payment.manage'
  | 'integrations.manage'
  | 'integrations.smtp.manage'
  | 'integrations.sms.manage'
  | 'integrations.payment.manage'
  | 'integrations.api.manage'
  | 'security.view'
  | 'security.manage'
  | 'security.ip.block'
  | 'security.phone.block'
  | 'security.rate_limits.manage'
  | 'audit_logs.view'
  | 'backups.manage'
  | 'system.health.view'
  | 'system.backup.manage'
  | 'system.restore.authorize'
  | 'notices.manage'
  | 'monitoring.observe'
  | 'complaints.view'
  | 'complaints.manage'
  | 'developer.console'
  | 'developer.tools.access'
  | 'developer.code.manage'
  | 'developer.deploy'
  | 'developer.diagnostics'
  | 'developer.deployments'
  | 'developer.production_access';

export type RoleCategory =
  | 'global'
  | 'upazila'
  | 'union_parishad'
  | 'municipality'
  | 'public'
  | 'custom';

export interface RbacRole {
  id: string;
  slug: string;
  name_en: string;
  name_bn: string;
  category: RoleCategory;
  institution_type?: InstitutionType | null;
  default_scope: PermissionScope;
  is_system: boolean;
  is_active: boolean;
  is_optional: boolean;
  description_bn: string;
  permission_count?: number;
  created_at: string;
  updated_at: string;
}

export interface RbacPermission {
  key: PermissionKey;
  module: string;
  name_en: string;
  name_bn: string;
  is_sensitive: boolean;
}

export interface RolePermissionAssignment {
  role_slug: string;
  permission_key: PermissionKey;
  scope: PermissionScope;
  granted: boolean;
}

export type AccountLifecycleStatus =
  | 'active'
  | 'pending_verification'
  | 'invited'
  | 'deactivated';

export interface UserAccount {
  id: string;
  username: string;
  name_bn: string;
  title_bn: string;
  mobile: string;
  email?: string;
  primary_role: string;
  administrative_unit_id?: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  account_status?: AccountLifecycleStatus;
  identity_verified?: boolean;
  must_change_password?: boolean;
  has_password_set?: boolean;
  appointment_note_bn?: string | null;
  deactivated_at?: string | null;
  deactivation_reason_bn?: string | null;
  failed_login_attempts: number;
  locked_until?: string | null;
  created_at: string;
  roles?: UserRoleAssignment[];
  wards?: number[];
  departments?: string[];
  overrides?: UserPermissionOverride[];
}

export interface InitialAdminAccountSummary {
  id: string;
  username: string;
  display_name: string;
  name_bn: string;
  role_slug: 'chairman' | 'secretary' | 'supervisor' | 'developer';
  role_label: 'UP_CHAIRMAN' | 'UP_SECRETARY' | 'SUPERVISOR' | 'DEVELOPER';
  institution_id: string | null;
  institution_name: string;
  institution_type: 'Union' | 'Global Platform' | 'Global Technical Access';
  account_status: AccountLifecycleStatus;
  identity_verified: boolean;
  is_active: boolean;
  mfa_enabled: boolean;
  has_password_set: boolean;
  has_pending_invitation: boolean;
  appointment_note_bn: string;
  email?: string;
  created_at: string;
}

export interface DeactivationCandidateSummary {
  id: string;
  username: string;
  name_bn: string;
  title_bn: string;
  primary_role: string;
  administrative_unit_id: string | null;
  institution_name_bn: string;
  is_active: boolean;
  account_status: AccountLifecycleStatus;
  active_sessions_count: number;
  historical_applications_count: number;
}

export interface InitialAdminResetPreviewResponse {
  cleanup_already_executed: boolean;
  requires_confirmation: boolean;
  initial_four_accounts: InitialAdminAccountSummary[];
  accounts_to_be_deactivated: DeactivationCandidateSummary[];
  preserved_records_summary: {
    citizen_accounts_count: number;
    applications_count: number;
    certificates_count: number;
    payments_count: number;
    audit_logs_count: number;
  };
}

export interface InitialAdminResetExecuteResponse {
  backup_id: string;
  backup_checksum_sha256: string;
  deactivated_count: number;
  sessions_revoked_count: number;
  deactivated_usernames: string[];
  initial_four_accounts: InitialAdminAccountSummary[];
  executed_at: string;
}

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  role_slug: string;
  administrative_unit_id?: string | null;
  is_primary: boolean;
  assigned_by: string;
  expires_at?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UserPermissionOverride {
  id: string;
  user_id: string;
  permission_key: PermissionKey;
  scope: PermissionScope;
  effect: 'grant' | 'revoke';
  reason_bn: string;
  assigned_by: string;
  expires_at?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ApprovalAuthorityAssignment {
  id: string;
  user_id: string;
  user_name_bn?: string;
  role_slug: string;
  administrative_unit_id: string;
  service_id: string;
  max_fee_limit?: number | null;
  effective_from: string;
  expires_at?: string | null;
  delegated_by: string;
  delegation_note_bn: string;
  allow_self_approval: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PermissionAuditLog {
  id: string;
  actor_id: string;
  actor_role: string;
  actor_name_bn: string;
  action_type: string;
  target_type:
    | 'role'
    | 'user'
    | 'override'
    | 'approval_authority'
    | 'settings'
    | 'system'
    | 'developer_access'
    | 'complaint'
    | 'service'
    | 'deployment';
  target_id: string;
  administrative_unit_id?: string | null;
  before_json?: string | null;
  after_json?: string | null;
  reason_bn: string;
  created_at: string;
}

export interface MonitoringObservation {
  id: string;
  administrative_unit_id: string;
  application_id?: string | null;
  officer_id: string;
  officer_name_bn: string;
  observation_bn: string;
  severity: 'info' | 'warning' | 'critical' | 'overdue';
  created_at: string;
}

export interface EscalatedComplaint {
  id: string;
  administrative_unit_id: string;
  application_id?: string | null;
  complainant_user_id?: string | null;
  complainant_name_bn: string;
  complainant_mobile: string;
  subject_bn: string;
  details_bn: string;
  status: 'open' | 'investigating' | 'under_review' | 'forwarded' | 'resolved';
  forwarded_to_unit_id?: string | null;
  resolution_note_bn?: string | null;
  handled_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperAccessRequest {
  id: string;
  developer_user_id: string;
  developer_name_bn: string;
  scope: string;
  reason_bn: string;
  duration_minutes: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  approved_by?: string | null;
  approved_by_name_bn?: string | null;
  expires_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeveloperDiagnosticsResponse {
  environment: string;
  node_version: string;
  uptime_seconds: number;
  sqlite_status: string;
  tables_count: number;
  roles_count: number;
  permissions_count: number;
  services_count: number;
  certificate_templates_count: number;
  queue_status: string;
  cache_status: string;
  pdf_engine: string;
  secrets_redacted: boolean;
  citizen_pii_redacted: boolean;
  active_production_access: DeveloperAccessRequest | null;
  recent_technical_events: PermissionAuditLog[];
}

export interface RefundRequest {
  id: string;
  application_id: string;
  administrative_unit_id: string;
  amount: number;
  reason_bn: string;
  requested_by: string;
  requested_by_name_bn: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface EffectivePermissionGrant {
  permission_key: PermissionKey;
  scope: PermissionScope;
  source: 'role' | 'override';
  expires_at?: string | null;
}

export interface UserSession {
  user_id?: string;
  role: UserRole;
  roles?: string[];
  name: string;
  title_bn: string;
  administrative_unit_id?: string;
  employee_id?: string;
  assigned_wards?: number[];
  assigned_departments?: string[];
  permissions?: Partial<Record<PermissionKey, PermissionScope>>;
  approval_authorities?: Array<{
    administrative_unit_id: string;
    service_id: string;
    expires_at?: string | null;
  }>;
  token?: string;
}

export interface SanitizedEnvironmentDiagnostics {
  app_env: 'production' | 'testing';
  node_env: string;
  is_production: boolean;
  is_testing: boolean;
  database: {
    resolved_path: string;
    database_file: string;
    is_isolated: boolean;
    is_production_file: boolean;
    is_testing_file: boolean;
    wal_journal_mode: boolean;
    protection_guard: string;
  };
  storage: {
    resolved_dir: string;
    attachments_dir: string;
    certificates_dir: string;
    is_isolated: boolean;
    is_production_dir: boolean;
    is_testing_dir: boolean;
  };
  urls: {
    app_url: string;
    frontend_url: string;
    qr_verify_base_url: string;
  };
  security: {
    session_secret_configured: boolean;
    session_algorithm: string;
    session_secret_fingerprint: string;
    trust_proxy_enabled: boolean;
    https_enforced: boolean;
    cors_allowed_hosts: string[];
  };
  watermark: {
    active: boolean;
    display_text: string | null;
  };
}

export interface SystemEnvironmentSummary {
  app_env: 'production' | 'testing';
  is_production: boolean;
  is_testing: boolean;
  testing_domain: string;
  qr_verify_base_url: string;
  watermark_active: boolean;
  watermark_text: string | null;
}
