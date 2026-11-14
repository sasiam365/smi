import type {
  PermissionKey,
  PermissionScope,
  RbacPermission,
  RoleCategory,
  RolePermissionEntry,
  UserRole,
} from '../src/types/index.ts';

export interface SystemRoleSeed {
  id: string;
  slug: Exclude<UserRole, 'citizen'>;
  code: 'UP_CHAIRMAN' | 'UP_SECRETARY' | 'DEVELOPER' | 'SUPERVISOR';
  name_en: string;
  name_bn: string;
  category: RoleCategory;
  institution_type: 'union_parishad' | 'municipality' | null;
  default_scope: PermissionScope;
  is_optional: boolean;
  description_bn: string;
}

export const ALLOWED_ADMIN_ROLE_SLUGS = new Set<Exclude<UserRole, 'citizen'>>([
  'chairman',
  'secretary',
  'developer',
  'supervisor',
]);

export const OBSOLETE_ADMIN_ROLE_SLUGS = new Set<string>([
  'uno',
  'upazila_admin',
  'upazila_monitoring_officer',
  'union_admin',
  'ward_member',
  'accountant',
  'union_accountant',
  'service_operator',
  'union_service_operator',
  'municipality_admin',
  'mayor',
  'executive_officer',
  'department_officer',
  'municipality_accountant',
  'municipality_service_operator',
]);

/**
 * Normalizes role codes/aliases into the canonical 4 administrative roles + citizen,
 * or returns null if the role is obsolete or unrecognized.
 */
export function normalizeRoleSlug(raw: unknown): UserRole | null {
  const clean = String(raw ?? '')
    .trim()
    .toLowerCase();
  switch (clean) {
    case 'chairman':
    case 'up_chairman':
      return 'chairman';
    case 'secretary':
    case 'up_secretary':
      return 'secretary';
    case 'developer':
    case 'technical_admin':
      return 'developer';
    case 'supervisor':
    case 'super_admin':
      return 'supervisor';
    case 'citizen':
      return 'citizen';
    default:
      return null;
  }
}

/**
 * Maps legacy/obsolete database roles during safe DB migration to the 4-role model.
 */
export function migrateLegacyRoleSlug(raw: unknown): { role: UserRole; keepActive: boolean } {
  const clean = String(raw ?? '')
    .trim()
    .toLowerCase();
  switch (clean) {
    case 'chairman':
    case 'up_chairman':
    case 'union_admin':
    case 'mayor':
    case 'municipality_admin':
      return { role: 'chairman', keepActive: true };
    case 'secretary':
    case 'up_secretary':
    case 'executive_officer':
      return { role: 'secretary', keepActive: true };
    case 'developer':
      return { role: 'developer', keepActive: true };
    case 'supervisor':
    case 'super_admin':
      return { role: 'supervisor', keepActive: true };
    case 'citizen':
      return { role: 'citizen', keepActive: true };
    default:
      // Obsolete roles (upazila_admin, ward_member, accountant, service_operator, department_officer, etc.)
      return { role: 'secretary', keepActive: false };
  }
}

export const SYSTEM_ROLES: SystemRoleSeed[] = [
  {
    id: 'role_chairman',
    slug: 'chairman',
    code: 'UP_CHAIRMAN',
    name_en: 'UP Chairman',
    name_bn: 'ইউপি চেয়ারম্যান (UP Chairman)',
    category: 'union_parishad',
    institution_type: 'union_parishad',
    default_scope: 'institution',
    is_optional: false,
    description_bn:
      'নির্ধারিত ইউনিয়ন পরিষদের চূড়ান্ত সনদ অনুমোদনকারী কর্তৃপক্ষ — আবেদন ও নথি পর্যালোচনা, অনুমোদন, কারণসহ প্রত্যাখ্যান, সংশোধন অনুরোধ, সচিবের নিকট ফেরত প্রেরণ এবং চূড়ান্ত সনদ ইস্যু ও মুদ্রণ।',
  },
  {
    id: 'role_secretary',
    slug: 'secretary',
    code: 'UP_SECRETARY',
    name_en: 'UP Secretary',
    name_bn: 'ইউপি সচিব (UP Secretary)',
    category: 'union_parishad',
    institution_type: 'union_parishad',
    default_scope: 'institution',
    is_optional: false,
    description_bn:
      'আবেদন প্রস্তুতকরণ ও প্রশাসনিক প্রক্রিয়াকরণ — নাগরিক ও ঠিকানা তথ্য এন্ট্রি, নথি আপলোড, খসড়া সংরক্ষণ ও সম্পাদনা, সম্পূর্ণতা যাচাই, চেয়ারম্যানের নিকট পেশ, সংশোধন নিষ্পত্তি এবং ইস্যুকৃত সনদ ডাউনলোড ও প্রিন্ট (চূড়ান্ত অনুমোদন ক্ষমতা নেই)।',
  },
  {
    id: 'role_developer',
    slug: 'developer',
    code: 'DEVELOPER',
    name_en: 'Developer',
    name_bn: 'ডেভেলপার (Developer)',
    category: 'global',
    institution_type: null,
    default_scope: 'global',
    is_optional: false,
    description_bn:
      'কারিগরি উন্নয়ন, রক্ষণাবেক্ষণ, স্যানিটাইজড ডায়াগনস্টিকস, টেমপ্লেট ও ফর্ম ইঞ্জিনিয়ারিং এবং অনুমোদিত ডিপ্লয়মেন্ট (আবেদন অনুমোদন, সনদ ইস্যু বা নিজ ক্ষমতা বৃদ্ধির এখতিয়ার নেই)।',
  },
  {
    id: 'role_supervisor',
    slug: 'supervisor',
    code: 'SUPERVISOR',
    name_en: 'Supervisor',
    name_bn: 'সুপারভাইজার (Supervisor)',
    category: 'global',
    institution_type: null,
    default_scope: 'global',
    is_optional: false,
    description_bn:
      'কেন্দ্রীয় প্ল্যাটফর্ম ও সিস্টেম প্রশাসক — সকল ইউনিয়ন ও প্রতিষ্ঠান, ব্যবহারকারী, রোল ও পারমিশন, সেবা ও ফি, ওয়েবসাইট কনটেন্ট, ইন্টিগ্রেশন, নিরাপত্তা ও অডিট লগ ব্যবস্থাপনা (চেয়ারম্যানের পক্ষে সনদ অনুমোদন ক্ষমতা নেই)।',
  },
];

export const SYSTEM_PERMISSIONS: RbacPermission[] = [
  // DASHBOARD
  { key: 'dashboard.view', module: 'DASHBOARD', name_en: 'View Dashboard', name_bn: 'ড্যাশবোর্ড দেখা', is_sensitive: false },

  // APPLICATIONS
  { key: 'applications.view', module: 'APPLICATIONS', name_en: 'View Scoped Applications', name_bn: 'নির্ধারিত আবেদন দেখা', is_sensitive: false },
  { key: 'applications.view_assigned', module: 'APPLICATIONS', name_en: 'View Assigned Applications', name_bn: 'দায়িত্বপ্রাপ্ত আবেদন দেখা', is_sensitive: false },
  { key: 'applications.view_all', module: 'APPLICATIONS', name_en: 'View All Unit Applications', name_bn: 'সকল আবেদন দেখা', is_sensitive: false },
  { key: 'applications.create', module: 'APPLICATIONS', name_en: 'Create & Draft Applications', name_bn: 'আবেদন তৈরি ও খসড়া সংরক্ষণ', is_sensitive: false },
  { key: 'applications.edit', module: 'APPLICATIONS', name_en: 'Edit Draft Applications', name_bn: 'খসড়া আবেদন সম্পাদনা ও সম্পূর্ণতা যাচাই', is_sensitive: false },
  { key: 'applications.submit', module: 'APPLICATIONS', name_en: 'Submit Application for Approval', name_bn: 'চেয়ারম্যানের অনুমোদনের জন্য আবেদন দাখিল', is_sensitive: false },
  { key: 'applications.review', module: 'APPLICATIONS', name_en: 'Review Application & Documents', name_bn: 'আবেদন ও সংযুক্ত দলিলাদি পর্যালোচনা', is_sensitive: false },
  { key: 'applications.verify', module: 'APPLICATIONS', name_en: 'Verify / Return Applications', name_bn: 'আবেদন যাচাই ও প্রক্রিয়াকরণ', is_sensitive: false },
  { key: 'applications.forward', module: 'APPLICATIONS', name_en: 'Submit to Chairman', name_bn: 'চেয়ারম্যানের নিকট অনুমোদনের জন্য প্রেরণ', is_sensitive: false },
  { key: 'applications.recommend', module: 'APPLICATIONS', name_en: 'Recommend Applications', name_bn: 'সুপারিশ প্রদান', is_sensitive: false },
  { key: 'applications.request_correction', module: 'APPLICATIONS', name_en: 'Request Correction', name_bn: 'সংশোধনের নির্দেশনা', is_sensitive: false },
  { key: 'applications.reject', module: 'APPLICATIONS', name_en: 'Reject Applications', name_bn: 'আবেদন প্রত্যাখ্যান (কারণসহ)', is_sensitive: true },
  { key: 'applications.approve', module: 'APPLICATIONS', name_en: 'Approve Applications', name_bn: 'চূড়ান্ত আবেদন অনুমোদন', is_sensitive: true },
  { key: 'applications.assign', module: 'APPLICATIONS', name_en: 'Assign Officers', name_bn: 'কর্মকর্তা নিয়োগ', is_sensitive: false },
  { key: 'applications.export', module: 'APPLICATIONS', name_en: 'Export Applications', name_bn: 'আবেদন এক্সপোর্ট', is_sensitive: false },

  // CERTIFICATES
  { key: 'certificates.view', module: 'CERTIFICATES', name_en: 'View Certificates', name_bn: 'অনুমোদিত সনদ তালিকা দেখা', is_sensitive: false },
  { key: 'certificates.preview', module: 'CERTIFICATES', name_en: 'Preview Certificate A4', name_bn: 'চূড়ান্ত সনদ প্রিভিউ', is_sensitive: false },
  { key: 'certificates.download', module: 'CERTIFICATES', name_en: 'Download Certificate PDF', name_bn: 'চূড়ান্ত ইস্যুকৃত PDF ডাউনলোড', is_sensitive: false },
  { key: 'certificates.print', module: 'CERTIFICATES', name_en: 'Print Certificate', name_bn: 'চূড়ান্ত ইস্যুকৃত সনদ প্রিন্ট', is_sensitive: false },
  { key: 'certificates.issue', module: 'CERTIFICATES', name_en: 'Issue Official Certificate', name_bn: 'সনদ ইস্যু ও ডিজিটাল স্বাক্ষর', is_sensitive: true },
  { key: 'certificates.revoke', module: 'CERTIFICATES', name_en: 'Revoke Certificate', name_bn: 'সনদ বাতিল করা', is_sensitive: true },
  { key: 'certificates.reissue', module: 'CERTIFICATES', name_en: 'Reissue Certificate', name_bn: 'সনদ পুনঃইস্যু করা', is_sensitive: true },
  { key: 'certificates.verify', module: 'CERTIFICATES', name_en: 'Verify Certificate QR', name_bn: 'QR সনদ যাচাই', is_sensitive: false },

  // PAYMENTS
  { key: 'payments.view', module: 'PAYMENTS', name_en: 'View Payments', name_bn: 'পেমেন্ট ও কর দেখা', is_sensitive: false },
  { key: 'payments.view_reports', module: 'PAYMENTS', name_en: 'View Financial Reports', name_bn: 'আর্থিক প্রতিবেদন দেখা', is_sensitive: false },
  { key: 'payments.reconcile', module: 'PAYMENTS', name_en: 'Reconcile Payments', name_bn: 'লেনদেন সমন্বয় ও কর আদায়', is_sensitive: true },
  { key: 'payments.request_refund', module: 'PAYMENTS', name_en: 'Request Refund', name_bn: 'রিফান্ড অনুরোধ দাখিল', is_sensitive: false },
  { key: 'payments.approve_refund', module: 'PAYMENTS', name_en: 'Approve Refund', name_bn: 'রিফান্ড অনুমোদন', is_sensitive: true },

  // USERS & ROLES
  { key: 'users.view', module: 'USERS', name_en: 'View Users', name_bn: 'ব্যবহারকারী দেখা', is_sensitive: false },
  { key: 'users.create', module: 'USERS', name_en: 'Create Users', name_bn: 'নতুন ব্যবহারকারী তৈরি', is_sensitive: true },
  { key: 'users.edit', module: 'USERS', name_en: 'Edit Users', name_bn: 'ব্যবহারকারী তথ্য সম্পাদনা', is_sensitive: false },
  { key: 'users.suspend', module: 'USERS', name_en: 'Suspend / Activate Users', name_bn: 'ব্যবহারকারী স্থগিত/সক্রিয়করণ', is_sensitive: true },
  { key: 'users.activate', module: 'USERS', name_en: 'Activate Users', name_bn: 'ব্যবহারকারী সক্রিয়করণ', is_sensitive: true },
  { key: 'users.deactivate', module: 'USERS', name_en: 'Deactivate Users', name_bn: 'ব্যবহারকারী নিষ্ক্রিয়করণ', is_sensitive: true },
  { key: 'users.reset_password', module: 'USERS', name_en: 'Reset Password', name_bn: 'পাসওয়ার্ড রিসেট', is_sensitive: true },
  { key: 'users.assign_role', module: 'USERS', name_en: 'Assign Roles & Scope', name_bn: 'রোল ও স্কোপ বরাদ্দ', is_sensitive: true },
  { key: 'roles.view', module: 'USERS', name_en: 'View Roles & Matrix', name_bn: 'রোল ও পারমিশন ম্যাট্রিক্স দেখা', is_sensitive: false },

  // WEBSITE CMS, BRANDING, PAGES & SEO
  { key: 'website.cms.manage', module: 'CMS', name_en: 'Manage Website CMS', name_bn: 'ওয়েবসাইট সিএমএস ও হোমপেজ ব্যবস্থাপনা', is_sensitive: true },
  { key: 'website.branding.manage', module: 'CMS', name_en: 'Manage Website Branding', name_bn: 'ওয়েবসাইট ব্র্যান্ডিং ও লোগো ব্যবস্থাপনা', is_sensitive: true },
  { key: 'website.pages.manage', module: 'CMS', name_en: 'Manage Visual Page Builder', name_bn: 'ভিজ্যুয়াল পেজ বিল্ডার ও পাবলিশিং', is_sensitive: true },
  { key: 'website.notices.manage', module: 'CMS', name_en: 'Manage Popups & Tickers', name_bn: 'পপআপ ও হেডলাইন নোটিশ ব্যবস্থাপনা', is_sensitive: false },
  { key: 'seo.view', module: 'SEO', name_en: 'View SEO Health', name_bn: 'এসইও হেলথ ও মেটাডাটা দেখা', is_sensitive: false },
  { key: 'seo.audit', module: 'SEO', name_en: 'Run SEO Audit', name_bn: 'এসইও অডিট ও ক্রল পরিচালনা', is_sensitive: false },
  { key: 'seo.edit', module: 'SEO', name_en: 'Edit SEO Proposals', name_bn: 'এআই এসইও প্রস্তাবনা তৈরি ও সম্পাদনা', is_sensitive: false },
  { key: 'seo.publish', module: 'SEO', name_en: 'Approve & Publish SEO Changes', name_bn: 'এসইও পরিবর্তন অনুমোদন ও প্রকাশ', is_sensitive: true },

  // SERVICES
  { key: 'services.view', module: 'SERVICES', name_en: 'View Services', name_bn: 'সেবা তালিকা দেখা', is_sensitive: false },
  { key: 'services.manage', module: 'SERVICES', name_en: 'Manage Services', name_bn: 'সেবা কনফিগারেশন', is_sensitive: false },
  { key: 'services.configure_fees', module: 'SERVICES', name_en: 'Configure Fees', name_bn: 'সেবা ফি নির্ধারণ', is_sensitive: true },
  { key: 'services.configure_forms', module: 'SERVICES', name_en: 'Configure Forms', name_bn: 'আবেদন ফরম কনফিগার', is_sensitive: false },
  { key: 'services.configure_workflow', module: 'SERVICES', name_en: 'Configure Workflow', name_bn: 'অনুমোদন কর্মপ্রবাহ', is_sensitive: true },

  // EMPLOYEES
  { key: 'employees.view', module: 'EMPLOYEES', name_en: 'View Employees', name_bn: 'কর্মকর্তা তালিকা দেখা', is_sensitive: false },
  { key: 'employees.manage', module: 'EMPLOYEES', name_en: 'Manage Employees', name_bn: 'কর্মকর্তা ব্যবস্থাপনা', is_sensitive: true },
  { key: 'employees.assign_department', module: 'EMPLOYEES', name_en: 'Assign Ward/Department', name_bn: 'ওয়ার্ড/বিভাগ বণ্টন', is_sensitive: false },

  // REPORTS & NOTICES & MONITORING
  { key: 'reports.view', module: 'REPORTS', name_en: 'View Reports', name_bn: 'প্রতিবেদন দেখা', is_sensitive: false },
  { key: 'reports.export', module: 'REPORTS', name_en: 'Export Reports', name_bn: 'প্রতিবেদন এক্সপোর্ট', is_sensitive: false },
  { key: 'notices.manage', module: 'REPORTS', name_en: 'Manage Notices', name_bn: 'নোটিশ প্রকাশ ও বাতিল', is_sensitive: false },
  { key: 'monitoring.observe', module: 'REPORTS', name_en: 'Record Monitoring Observations', name_bn: 'মনিটরিং পর্যবেক্ষণ নথিভুক্ত', is_sensitive: false },
  { key: 'complaints.view', module: 'REPORTS', name_en: 'View Complaints', name_bn: 'অভিযোগ ও নিষ্পত্তি তালিকা দেখা', is_sensitive: false },
  { key: 'complaints.manage', module: 'REPORTS', name_en: 'Manage Complaints', name_bn: 'অভিযোগ প্রেরণ ও নিষ্পত্তি ব্যবস্থাপনা', is_sensitive: false },

  // DEVELOPER / INFRASTRUCTURE
  { key: 'developer.console', module: 'DEVELOPER', name_en: 'Access Technical Developer Console', name_bn: 'কারিগরি ডেভেলপার কনসোল প্রবেশ', is_sensitive: false },
  { key: 'developer.tools.access', module: 'DEVELOPER', name_en: 'Access Developer Tools & AI Debugger', name_bn: 'ডেভেলপার টুলস ও এআই ডিবাগার প্রবেশ', is_sensitive: false },
  { key: 'developer.code.manage', module: 'DEVELOPER', name_en: 'Manage Technical Code & Patches', name_bn: 'কারিগরি কোড ও প্যাচ প্রস্তাবনা ব্যবস্থাপনা', is_sensitive: true },
  { key: 'developer.deploy', module: 'DEVELOPER', name_en: 'Deploy to Staging / Approved Production', name_bn: 'স্টেজিং ও অনুমোদিত প্রোডাকশন ডিপ্লয়মেন্ট', is_sensitive: true },
  { key: 'developer.diagnostics', module: 'DEVELOPER', name_en: 'View Sanitized System Diagnostics', name_bn: 'স্যানিটাইজড সিস্টেম ডায়াগনস্টিকস দেখা', is_sensitive: false },
  { key: 'developer.deployments', module: 'DEVELOPER', name_en: 'Execute Scoped Technical Deployments', name_bn: 'অনুমোদিত কারিগরি ডিপ্লয়মেন্ট পরিচালনা', is_sensitive: true },
  { key: 'developer.production_access', module: 'DEVELOPER', name_en: 'Request or Approve Production Access', name_bn: 'সময়সীমাবদ্ধ প্রোডাকশন এক্সেস অনুমোদন/অনুরোধ', is_sensitive: true },

  // SETTINGS, INTEGRATIONS & SECURITY
  { key: 'settings.view', module: 'SETTINGS', name_en: 'View Settings', name_bn: 'সেটিংস দেখা', is_sensitive: false },
  { key: 'settings.manage', module: 'SETTINGS', name_en: 'Manage Settings', name_bn: 'সেটিংস পরিবর্তন', is_sensitive: true },
  { key: 'settings.smtp.manage', module: 'SETTINGS', name_en: 'Manage SMTP Settings', name_bn: 'SMTP ইমেইল কনফিগারেশন', is_sensitive: true },
  { key: 'settings.sms.manage', module: 'SETTINGS', name_en: 'Manage SMS Settings', name_bn: 'SMS গেটওয়ে কনফিগারেশন', is_sensitive: true },
  { key: 'settings.payment.manage', module: 'SETTINGS', name_en: 'Manage Payment Settings', name_bn: 'পেমেন্ট গেটওয়ে কনফিগারেশন', is_sensitive: true },
  { key: 'integrations.manage', module: 'SETTINGS', name_en: 'Manage Integrations', name_bn: 'SMTP/SMS/গেটওয়ে ইন্টিগ্রেশন', is_sensitive: true },
  { key: 'integrations.smtp.manage', module: 'SETTINGS', name_en: 'Configure SMTP Integration', name_bn: 'SMTP ইন্টিগ্রেশন ব্যবস্থাপনা', is_sensitive: true },
  { key: 'integrations.sms.manage', module: 'SETTINGS', name_en: 'Configure SMS Integration', name_bn: 'SMS ইন্টিগ্রেশন ব্যবস্থাপনা', is_sensitive: true },
  { key: 'integrations.payment.manage', module: 'SETTINGS', name_en: 'Configure Payment Providers', name_bn: 'পেমেন্ট প্রোভাইডার ব্যবস্থাপনা', is_sensitive: true },
  { key: 'integrations.api.manage', module: 'SETTINGS', name_en: 'Configure External APIs & Webhooks', name_bn: 'এক্সটার্নাল এপিআই ও ওয়েবহুক ব্যবস্থাপনা', is_sensitive: true },
  { key: 'security.view', module: 'SECURITY', name_en: 'View Security Operations Center', name_bn: 'সিকিউরিটি অপারেশন সেন্টার দেখা', is_sensitive: false },
  { key: 'security.manage', module: 'SECURITY', name_en: 'Manage Security Policies', name_bn: 'নিরাপত্তা ও MFA নীতিমালা', is_sensitive: true },
  { key: 'security.ip.block', module: 'SECURITY', name_en: 'Manage IP Allowlist & Blocklist', name_bn: 'আইপি ব্লকলিস্ট ও অ্যালাউলিস্ট ব্যবস্থাপনা', is_sensitive: true },
  { key: 'security.phone.block', module: 'SECURITY', name_en: 'Manage Phone Restrictions', name_bn: 'ফোন নম্বর সীমাবদ্ধতা ব্যবস্থাপনা', is_sensitive: true },
  { key: 'security.rate_limits.manage', module: 'SECURITY', name_en: 'Manage Rate Limits', name_bn: 'রেট লিমিট পলিসি ব্যবস্থাপনা', is_sensitive: true },
  { key: 'roles.manage', module: 'SETTINGS', name_en: 'Manage Roles & Permissions', name_bn: 'রোল, পারমিশন ও অনুমোদন ক্ষমতা', is_sensitive: true },

  // AUDIT, HEALTH & BACKUP
  { key: 'audit_logs.view', module: 'AUDIT', name_en: 'View Audit Logs', name_bn: 'অডিট ও সনদ ইতিহাস পর্যবেক্ষণ', is_sensitive: false },
  { key: 'system.health.view', module: 'BACKUP', name_en: 'View System Health & Uptime', name_bn: 'সিস্টেম হেলথ ও আপটাইম পর্যবেক্ষণ', is_sensitive: false },
  { key: 'backups.manage', module: 'BACKUP', name_en: 'Manage System Backups', name_bn: 'সিস্টেম ব্যাকআপ ব্যবস্থাপনা', is_sensitive: true },
  { key: 'system.backup.manage', module: 'BACKUP', name_en: 'Create & Verify Backups', name_bn: 'ব্যাকআপ তৈরি ও যাচাইকরণ', is_sensitive: true },
  { key: 'system.restore.authorize', module: 'BACKUP', name_en: 'Authorize Backup Restore', name_bn: 'ব্যাকআপ রিস্টোর অনুমোদন', is_sensitive: true },
];

export const SENSITIVE_PERMISSION_KEYS = new Set<PermissionKey>(
  SYSTEM_PERMISSIONS.filter((p) => p.is_sensitive).map((p) => p.key)
);

type GrantTuple = [PermissionKey, PermissionScope];

function mapGrants(
  scopeDefault: PermissionScope,
  keys: PermissionKey[],
  overrides?: Partial<Record<PermissionKey, PermissionScope>>
): GrantTuple[] {
  return keys.map((k) => [k, overrides?.[k] || scopeDefault]);
}

export const DEFAULT_ROLE_PERMISSION_MAP: Record<UserRole, GrantTuple[]> = {
  // 1. UP_CHAIRMAN — Final approving authority for assigned Union & legally authorized services; can also create, save draft, edit draft, and submit applications for assigned Union.
  // Restrictions: Cannot access another Union, cannot change global settings, cannot manage Developer/Supervisor accounts, cannot change payment history.
  chairman: [
    ['dashboard.view', 'institution'],
    ['applications.create', 'institution'],
    ['applications.edit', 'institution'],
    ['applications.submit', 'institution'],
    ['applications.forward', 'institution'],
    ['applications.view', 'institution'],
    ['applications.view_all', 'institution'],
    ['applications.review', 'institution'],
    ['applications.verify', 'institution'],
    ['applications.assign', 'institution'],
    ['applications.request_correction', 'institution'],
    ['applications.reject', 'institution'],
    ['applications.approve', 'institution'],
    ['certificates.view', 'institution'],
    ['certificates.preview', 'institution'],
    ['certificates.download', 'institution'],
    ['certificates.print', 'institution'],
    ['certificates.issue', 'institution'],
    ['certificates.revoke', 'institution'],
    ['certificates.reissue', 'institution'],
    ['certificates.verify', 'global'],
    ['employees.view', 'institution'],
    ['services.view', 'institution'],
    ['reports.view', 'institution'],
    ['audit_logs.view', 'institution'],
  ],

  // 2. UP_SECRETARY — Application preparation, document upload, draft save/edit, validation, submission to Chairman, responding to correction requests, and issued certificate preview/download/print.
  // Restrictions: Cannot approve or reject or request correction as final decision, cannot issue/revoke/reissue certificates, cannot access another Union, cannot change global settings.
  secretary: [
    ['dashboard.view', 'institution'],
    ['applications.create', 'institution'],
    ['applications.edit', 'institution'],
    ['applications.submit', 'institution'],
    ['applications.view', 'institution'],
    ['applications.view_all', 'institution'],
    ['applications.verify', 'institution'],
    ['applications.forward', 'institution'],
    ['certificates.view', 'institution'],
    ['certificates.preview', 'institution'],
    ['certificates.download', 'institution'],
    ['certificates.print', 'institution'],
    ['certificates.verify', 'global'],
    ['payments.view', 'institution'],
    ['payments.reconcile', 'institution'],
    ['payments.request_refund', 'institution'],
    ['services.view', 'institution'],
    ['reports.view', 'institution'],
    ['notices.manage', 'institution'],
    ['audit_logs.view', 'institution'],
  ],

  // 3. DEVELOPER — Technical maintenance, sanitized diagnostics & scoped deployments ONLY.
  // Restrictions: Cannot approve applications, cannot issue certificates, cannot change citizen decisions, cannot self-grant Supervisor privileges.
  developer: [
    ['dashboard.view', 'global'],
    ['services.view', 'global'],
    ['certificates.verify', 'global'],
    ['settings.view', 'global'],
    ['seo.view', 'global'],
    ['seo.audit', 'global'],
    ['system.health.view', 'global'],
    ['developer.console', 'global'],
    ['developer.tools.access', 'global'],
    ['developer.code.manage', 'global'],
    ['developer.deploy', 'global'],
    ['developer.diagnostics', 'global'],
    ['developer.deployments', 'global'],
    ['developer.production_access', 'global'],
    ['audit_logs.view', 'global'],
  ],

  // 4. SUPERVISOR — Global platform owner & system administrator across all Unions & Municipality.
  // Restrictions: Does NOT automatically gain legal authority to approve certificates on behalf of a Chairman.
  supervisor: mapGrants('global', [
    'dashboard.view',
    'applications.view',
    'applications.view_all',
    'applications.review',
    'applications.assign',
    'applications.export',
    'certificates.view',
    'certificates.preview',
    'certificates.download',
    'certificates.print',
    'certificates.verify',
    'payments.view',
    'payments.view_reports',
    'payments.reconcile',
    'payments.approve_refund',
    'users.view',
    'users.create',
    'users.edit',
    'users.suspend',
    'users.activate',
    'users.deactivate',
    'users.reset_password',
    'users.assign_role',
    'roles.view',
    'roles.manage',
    'website.cms.manage',
    'website.branding.manage',
    'website.pages.manage',
    'website.notices.manage',
    'seo.view',
    'seo.audit',
    'seo.edit',
    'seo.publish',
    'services.view',
    'services.manage',
    'services.configure_fees',
    'services.configure_forms',
    'services.configure_workflow',
    'employees.view',
    'employees.manage',
    'employees.assign_department',
    'reports.view',
    'reports.export',
    'notices.manage',
    'monitoring.observe',
    'complaints.view',
    'complaints.manage',
    'developer.production_access',
    'settings.view',
    'settings.manage',
    'settings.smtp.manage',
    'settings.sms.manage',
    'settings.payment.manage',
    'integrations.manage',
    'integrations.smtp.manage',
    'integrations.sms.manage',
    'integrations.payment.manage',
    'integrations.api.manage',
    'security.view',
    'security.manage',
    'security.ip.block',
    'security.phone.block',
    'security.rate_limits.manage',
    'audit_logs.view',
    'system.health.view',
    'backups.manage',
    'system.backup.manage',
    'system.restore.authorize',
  ]),

  // PUBLIC CITIZEN ACCOUNT (separate public account type, not an administrative role)
  citizen: [
    ['dashboard.view', 'own'],
    ['applications.view', 'own'],
    ['applications.create', 'own'],
    ['applications.edit', 'own'],
    ['certificates.view', 'own'],
    ['certificates.preview', 'own'],
    ['certificates.download', 'own'],
    ['certificates.print', 'own'],
    ['certificates.verify', 'global'],
    ['payments.view', 'own'],
    ['services.view', 'global'],
    ['complaints.view', 'own'],
  ],
};

// Clean summary entries for backwards-compatible RolePermissionEntry view (Strictly the 4 administrative roles)
export const DEFAULT_LEGACY_ROLE_SUMMARIES: RolePermissionEntry[] = SYSTEM_ROLES.map((r) => {
  const keys = new Set(DEFAULT_ROLE_PERMISSION_MAP[r.slug].map(([k]) => k));
  return {
    role: r.slug,
    label_bn: r.name_bn,
    scope_bn: r.default_scope === 'global' ? 'সমগ্র প্ল্যাটফর্ম' : 'নির্ধারিত ইউনিয়ন / প্রতিষ্ঠান',
    can_view_applications:
      keys.has('applications.view') || keys.has('applications.view_all') || keys.has('applications.view_assigned'),
    can_verify_applications: keys.has('applications.verify'),
    can_forward_applications: keys.has('applications.forward'),
    can_final_approve: keys.has('applications.approve'),
    can_revoke_certificate: keys.has('certificates.revoke'),
    can_manage_revenue: keys.has('payments.reconcile') || keys.has('payments.view'),
    can_manage_staff: keys.has('employees.manage') || keys.has('users.assign_role'),
    can_manage_settings: keys.has('settings.manage'),
  };
});
