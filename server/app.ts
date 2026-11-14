import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  type AuthedRequest,
  extractActorMiddleware,
  parseCookies,
  requireFinalApproverMiddleware,
  requireOfficerMiddleware,
  resolveAuthoritativeOfficer,
  resolveRedirectDashboard,
  signActorToken,
  toUserSession,
} from './auth.ts';
import {
  approveAndIssueCertificate,
  ensureCertificatePdfFile,
  reissueCertificate,
  revokeCertificate,
  sanitizeCertificateForResponse,
  ServiceError,
  verifyCertificateByToken,
} from './certificateService.ts';
import { isValidPdfFile } from './pdfGenerator.ts';
import {
  getAttachmentStorageRoot,
  getDb,
  hashPassword,
  hashVerificationToken,
  verifyPassword,
} from './db.ts';
import {
  getAppEnv,
  getSanitizedEnvironmentDiagnostics,
  validateEnvironmentStartup,
} from './envConfig.ts';
import {
  ALLOWED_ADMIN_ROLE_SLUGS,
  normalizeRoleSlug,
  OBSOLETE_ADMIN_ROLE_SLUGS,
} from './rbacCatalog.ts';
import {
  type ActorRbacContext,
  adminResetUserPasswordTransactional,
  appendPermissionAuditLog,
  assignUserRoleAndScopeTransactional,
  authorizeContextPermission,
  canUserAccessApplicationRecord,
  createCustomRoleTransactional,
  createDeveloperAccessRequestTransactional,
  createEscalatedComplaintTransactional,
  createUserAccountTransactional,
  createUserPermissionOverrideTransactional,
  decideDeveloperAccessRequestTransactional,
  executeInitialAdminResetTransactional,
  filterApplicationsForContext,
  getActiveDeveloperProductionAccess,
  getEscalatedComplaintById,
  getInitialAdminResetPreview,
  getRolePermissionsV2,
  grantApprovalAuthorityTransactional,
  insertMonitoringObservation,
  issueAccountInvitationTokenTransactional,
  listAllPermissions,
  listAllRoles,
  listApprovalAuthorities,
  listDeveloperAccessRequests,
  listEscalatedComplaints,
  listMonitoringObservations,
  listPermissionAuditLogs,
  listRefundRequests,
  listUsersWithAssignments,
  mapServiceDepartment,
  normalizeMobile,
  RbacError,
  revokeApprovalAuthorityTransactional,
  revokeUserOverrideTransactional,
  revokeUserRoleTransactional,
  setRoleActiveStatusTransactional,
  setupAccountPasswordWithInvitationTransactional,
  setUserActiveStatusTransactional,
  updateEscalatedComplaintTransactional,
  updateRolePermissionsTransactional,
  upsertRefundRequest,
  validateStrongPassword,
  verifyInitialAdminIdentityTransactional,
} from './rbacService.ts';
import { initEnterpriseTables, registerEnterpriseRoutes } from './enterpriseModules.ts';
import type {
  Application,
  ApplicationAttachment,
  ApplicationStatus,
  Certificate,
  DashboardStatsResponse,
  DeveloperDiagnosticsResponse,
  EscalatedComplaint,
  HoldingTaxRecord,
  MonitoringObservation,
  Notice,
  PermissionKey,
  PermissionScope,
  RefundRequest,
  RoleCategory,
  RolePermissionEntry,
  StaffMember,
  TradeLicenseRecord,
  UserRole,
  WardOrDepartment,
  WorkflowStepKey,
} from '../src/types/index.ts';

// In-memory sliding window rate limiter for public verification endpoint
const verifyRateBuckets = new Map<string, number[]>();

export function resetVerifyRateLimiter(): void {
  verifyRateBuckets.clear();
}

function getVerifyRateLimitMax(): number {
  const raw = process.env.POTTOYON_VERIFY_RATE_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : 30;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function checkVerifyRateLimit(ip: string): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const maxRequests = getVerifyRateLimitMax();
  const windowMs = 60_000;
  const now = Date.now();
  const existing = (verifyRateBuckets.get(ip) || []).filter((ts) => now - ts < windowMs);

  if (existing.length >= maxRequests) {
    const oldest = existing[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    verifyRateBuckets.set(ip, existing);
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  existing.push(now);
  verifyRateBuckets.set(ip, existing);
  return { allowed: true, retryAfterSec: 0, remaining: maxRequests - existing.length };
}

function extractClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}

function sanitizeText(val: unknown, maxLen = 500): string {
  return String(val ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function escapeCsvCell(value: unknown): string {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildMeaningfulPdfFilename(cert: Certificate, serviceEn?: string, trackingNo?: string): string {
  const slugBase = (serviceEn || cert.service_id || 'Certificate')
    .replace(/^srv_/, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const trackPart = (trackingNo || cert.application_tracking_no || '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .slice(0, 24);
  const certNoPart = (cert.certificate_number || cert.certificate_no || 'cert')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .slice(0, 24);
  return ['PottoyonBD', slugBase || 'Certificate', trackPart, certNoPart]
    .filter(Boolean)
    .join('_') + '.pdf';
}

function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

function sameOriginProtectionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.headers.origin;
  if (!origin || origin === 'null') {
    next();
    return;
  }
  try {
    const parsedOrigin = new URL(origin);
    const originHost = parsedOrigin.host.toLowerCase();
    const originHostname = parsedOrigin.hostname.toLowerCase();

    const candidateHosts = new Set<string>();
    if (typeof req.headers.host === 'string' && req.headers.host.trim()) {
      candidateHosts.add(req.headers.host.trim().toLowerCase());
    }
    const fwdHost = req.headers['x-forwarded-host'];
    if (typeof fwdHost === 'string' && fwdHost.trim()) {
      for (const part of fwdHost.split(',')) {
        if (part.trim()) candidateHosts.add(part.trim().toLowerCase());
      }
    } else if (Array.isArray(fwdHost)) {
      for (const h of fwdHost) {
        if (h.trim()) candidateHosts.add(h.trim().toLowerCase());
      }
    }
    if (process.env.APP_URL) {
      try {
        candidateHosts.add(new URL(process.env.APP_URL).host.toLowerCase());
      } catch {
        // ignore invalid APP_URL placeholder
      }
    }
    if (process.env.FRONTEND_URL) {
      try {
        candidateHosts.add(new URL(process.env.FRONTEND_URL).host.toLowerCase());
      } catch {
        // ignore invalid FRONTEND_URL placeholder
      }
    }
    candidateHosts.add('prottoyonbd.maltimarket.com');

    const isTrustedPlatformOrigin =
      originHostname === 'localhost' ||
      originHostname === '127.0.0.1' ||
      originHostname === 'prottoyonbd.maltimarket.com' ||
      originHostname.endsWith('.maltimarket.com') ||
      originHostname.endsWith('.run.app') ||
      originHostname.endsWith('.google.com') ||
      originHostname.endsWith('.googleusercontent.com');

    if (!candidateHosts.has(originHost) && !isTrustedPlatformOrigin) {
      res.status(403).json({
        error: 'Forbidden: Cross-site request blocked',
        message_bn: 'নিরাপত্তার কারণে বাহ্যিক উৎস থেকে পরিবর্তন অনুরোধ প্রত্যাখ্যাত হয়েছে।',
      });
      return;
    }
  } catch {
    res.status(403).json({ error: 'Invalid Origin header' });
    return;
  }
  next();
}

function setSessionCookie(res: Response, token: string, rememberToken?: string): void {
  const isHttps =
    process.env.NODE_ENV === 'production' ||
    process.env.APP_ENV === 'testing' ||
    process.env.APP_URL?.startsWith('https') ||
    process.env.FRONTEND_URL?.startsWith('https');
  const secureFlag = isHttps ? '; Secure' : '';
  const cookies = [
    `pottoyon_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${12 * 3600}`,
  ];
  if (rememberToken) {
    cookies.push(
      `pottoyon_remember=${encodeURIComponent(rememberToken)}; Path=/; HttpOnly; SameSite=Lax${secureFlag}; Max-Age=${30 * 24 * 3600}`
    );
  }
  res.setHeader('Set-Cookie', cookies);
}

function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', [
    'pottoyon_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'pottoyon_remember=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
  ]);
}

function hasBroadUnitScope(ctx: ActorRbacContext, key: PermissionKey): boolean {
  const sc = ctx.effectivePermissions.get(key);
  return sc === 'global' || sc === 'upazila';
}

function redactCitizenApplication(app: Application): Application {
  return {
    ...app,
    review_notes: ['আবেদনটি সিস্টেমে সংরক্ষিত রয়েছে এবং যাচাই প্রক্রিয়াধীন।'],
  };
}

function handleRbacError(res: Response, err: unknown, fallbackMsg: string): void {
  if (err instanceof RbacError) {
    res.status(err.statusCode).json({
      error: err.message,
      message_bn: err.messageBn,
    });
    return;
  }
  console.error(fallbackMsg, err);
  res.status(500).json({ error: fallbackMsg });
}

const ALLOWED_ATTACHMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024; // 2 MB

export async function createApp(): Promise<express.Express> {
  validateEnvironmentStartup();
  const store = getDb();
  initEnterpriseTables();
  store.ensureSeedCertificateAsset().catch((err) => {
    console.warn('[PottoyonBD] Seed certificate PDF initialization deferred:', err);
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(securityHeadersMiddleware);
  app.use(sameOriginProtectionMiddleware);
  app.use(express.json({ limit: '5mb' }));
  app.use(extractActorMiddleware);
  registerEnterpriseRoutes(app, { extractClientIp });

  // --- Health & CSRF ---
  app.get('/api/health', (_req: Request, res: Response) => {
    const institutions = store.getInstitutions();
    res.json({
      status: 'ok',
      platform: 'PottoyonBD',
      region: 'Pabna Sadar Upazila, Pabna, Bangladesh',
      institutions_count: institutions.length,
      timestamp: new Date().toISOString(),
    });
  });

  // --- Public Environment Summary ---
  app.get('/api/system/environment', (_req: Request, res: Response) => {
    const diag = getSanitizedEnvironmentDiagnostics();
    res.json({
      app_env: diag.app_env,
      is_production: diag.is_production,
      is_testing: diag.is_testing,
      testing_domain: 'https://prottoyonbd.maltimarket.com',
      qr_verify_base_url: diag.urls.qr_verify_base_url,
      watermark_active: diag.watermark.active,
      watermark_text: diag.watermark.display_text,
    });
  });

  // --- Admin Sanitized Environment Diagnostics ---
  app.get('/api/admin/environment-diagnostics', (req: AuthedRequest, res: Response) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({
        error: 'Authentication required',
        message_bn: 'পরিবেশ ডায়াগনস্টিক তথ্য দেখতে অনুমোদিত কর্মকর্তার লগইন আবশ্যক।',
      });
      return;
    }
    const diag = getSanitizedEnvironmentDiagnostics();
    res.json(diag);
  });

  app.get('/api/auth/csrf', (_req: Request, res: Response) => {
    const token = crypto.randomBytes(24).toString('base64url');
    res.json({ csrf_token: token });
  });

  // --- Auth, Two-Option Realm Separation, Lockout, MFA, Remember-Me, Registration & Session ---
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const {
      login_type,
      realm,
      role,
      administrative_unit_id,
      username,
      password,
      otp,
      remember_me,
      session_ttl_seconds,
    } = req.body || {};

    if (!username || !password) {
      res.status(400).json({
        error: 'User ID and password required',
        message_bn: 'ইউজার আইডি ও পাসওয়ার্ড প্রদান করুন।',
      });
      return;
    }

    const cleanIdentifier = String(username).trim().toLowerCase();
    const normMobile = normalizeMobile(cleanIdentifier);
    const userRow = store.db
      .prepare(
        `SELECT * FROM users
         WHERE LOWER(username) = ?
            OR LOWER(COALESCE(email, '')) = ?
            OR (LENGTH(?) >= 6 AND REPLACE(REPLACE(mobile, '-', ''), ' ', '') = ?)
         LIMIT 1`
      )
      .get(cleanIdentifier, cleanIdentifier, normMobile, normMobile) as Record<string, unknown> | undefined;

    if (!userRow) {
      res.status(401).json({
        error: 'Invalid credentials',
        message_bn: 'ইউজার আইডি বা পাসওয়ার্ড সঠিক নয়।',
      });
      return;
    }

    const accountStatus = String(userRow.account_status || 'active');
    if (accountStatus === 'deactivated') {
      res.status(403).json({
        error: 'Account suspended or deactivated',
        account_status: 'deactivated',
        message_bn: 'এই ব্যবহারকারী অ্যাকাউন্টটি নিষ্ক্রিয় করা হয়েছে। লগইন করার অনুমতি নেই।',
      });
      return;
    }

    if (accountStatus === 'pending_verification' || Number(userRow.identity_verified ?? 1) !== 1) {
      res.status(403).json({
        error: 'Account pending identity verification',
        account_status: 'pending_verification',
        pending_verification: true,
        message_bn:
          'এই অ্যাকাউন্টটি দাপ্তরিক পরিচয় ও নিয়োগ যাচাইয়ের অপেক্ষায় (Pending Identity Verification) রয়েছে। যাচাই সম্পন্ন না হওয়া পর্যন্ত লগইন করা যাবে না।',
      });
      return;
    }

    if (String(userRow.password_hash || '') === 'UNSET_INVITATION_REQUIRED') {
      res.status(403).json({
        error: 'One-time invitation password setup required',
        invitation_required: true,
        message_bn:
          'এই অ্যাকাউন্টের পাসওয়ার্ড এখনো সেট করা হয়নি। অনুগ্রহ করে এককালীন আমন্ত্রণ টোকেন (Invitation Token) ব্যবহার করে পাসওয়ার্ড সেটআপ সম্পন্ন করুন।',
      });
      return;
    }

    if (Number(userRow.is_active) !== 1) {
      res.status(403).json({
        error: 'Account suspended or deactivated',
        message_bn: 'এই ব্যবহারকারী অ্যাকাউন্টটি নিষ্ক্রিয় বা স্থগিত করা হয়েছে।',
      });
      return;
    }

    if (userRow.locked_until && new Date(String(userRow.locked_until)).getTime() > Date.now()) {
      res.status(423).json({
        error: 'Account temporarily locked due to repeated failed login attempts',
        message_bn: 'একাধিক ভুল পাসওয়ার্ড প্রচেষ্টার কারণে একাউন্টটি সাময়িকভাবে লক করা হয়েছে।',
      });
      return;
    }

    const passwordValid = verifyPassword(String(password), String(userRow.password_hash));
    if (!passwordValid) {
      const nextFails = (Number(userRow.failed_login_attempts) || 0) + 1;
      const lockedUntil =
        nextFails >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
      store.db
        .prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
        .run(nextFails, lockedUntil, String(userRow.id));

      if (lockedUntil) {
        res.status(423).json({
          error: 'Account temporarily locked after 5 failed attempts',
          message_bn: '৫ বার ভুল পাসওয়ার্ড দেওয়ার কারণে একাউন্টটি ১৫ মিনিটের জন্য লক হয়েছে।',
        });
        return;
      }

      res.status(401).json({
        error: 'Invalid credentials',
        message_bn: `ইউজার আইডি বা পাসওয়ার্ড সঠিক নয় (অবশিষ্ট চেষ্টা: ${Math.max(0, 5 - nextFails)} বার)।`,
      });
      return;
    }

    const rawDbPrimaryRole = String(userRow.primary_role || '').trim().toLowerCase();
    if (OBSOLETE_ADMIN_ROLE_SLUGS.has(rawDbPrimaryRole)) {
      res.status(403).json({
        error: 'Account has an obsolete or unauthorized administrative role',
        message_bn: 'এই অ্যাকাউন্টের প্রশাসনিক রোলটি নিষ্ক্রিয় বা অনুমোদিত নয়।',
      });
      return;
    }

    const resolvedRole = normalizeRoleSlug(rawDbPrimaryRole);
    if (!resolvedRole) {
      res.status(403).json({
        error: 'Account does not have a valid role',
        message_bn: 'এই অ্যাকাউন্টে বৈধ কোনো রোল বরাদ্দ নেই।',
      });
      return;
    }

    // Two-Option Login Realm Enforcement ('citizen' vs 'administrative')
    const rawLoginType = String(login_type || realm || '').trim().toLowerCase();
    const effectiveLoginType =
      rawLoginType === 'citizen' || rawLoginType === 'administrative' ? rawLoginType : undefined;

    if (effectiveLoginType === 'citizen') {
      if (resolvedRole !== 'citizen') {
        res.status(403).json({
          error: 'Wrong login realm: administrative account cannot authenticate via Citizen Login',
          message_bn: 'প্রশাসনিক অ্যাকাউন্ট দিয়ে নাগরিক লগইনে প্রবেশ করা যাবে না। অনুগ্রহ করে "প্রশাসনিক লগইন" নির্বাচন করুন।',
        });
        return;
      }
    } else if (effectiveLoginType === 'administrative') {
      if (resolvedRole === 'citizen' || !ALLOWED_ADMIN_ROLE_SLUGS.has(resolvedRole)) {
        res.status(403).json({
          error: 'Wrong login realm: citizen or unauthorized account cannot authenticate via Administrative Login',
          message_bn: 'নাগরিক অ্যাকাউন্ট থেকে প্রশাসনিক লগইনে প্রবেশ অনুমোদিত নয়। শুধুমাত্র অনুমোদিত কর্মকর্তাগণ প্রবেশ করতে পারবেন।',
        });
        return;
      }
      // Verify role is active in RBAC catalog
      const roleRow = store.db
        .prepare('SELECT is_active FROM roles WHERE slug = ? LIMIT 1')
        .get(resolvedRole) as { is_active?: number } | undefined;
      if (roleRow && Number(roleRow.is_active) !== 1) {
        res.status(403).json({
          error: 'Assigned administrative role is currently inactive',
          message_bn: 'আপনার নির্ধারিত প্রশাসনিক রোলটি বর্তমানে নিষ্ক্রিয় রয়েছে।',
        });
        return;
      }
    } else {
      // Legacy fallback when login_type is omitted: still block obsolete roles & mismatched explicit role
      if (role && OBSOLETE_ADMIN_ROLE_SLUGS.has(String(role).trim().toLowerCase())) {
        res.status(403).json({
          error: 'Obsolete administrative role is not allowed',
          message_bn: 'এই অপ্রচলিত প্রশাসনিক রোলটি নিষ্ক্রিয় করা হয়েছে। অনুমোদিত ৪টি প্রশাসনিক রোল ব্যবহার করুন।',
        });
        return;
      }
      const requestedNormalizedRole = role ? normalizeRoleSlug(String(role)) : resolvedRole;
      if (role && (!requestedNormalizedRole || requestedNormalizedRole !== resolvedRole)) {
        const hasAssignedRole = requestedNormalizedRole
          ? store.db
              .prepare('SELECT id FROM user_roles WHERE user_id = ? AND role_slug = ? AND is_active = 1')
              .get(String(userRow.id), requestedNormalizedRole)
          : undefined;
        if (!hasAssignedRole) {
          res.status(403).json({
            error: 'User does not hold the requested role',
            message_bn: 'এই একাউন্টে নির্বাচিত পদবি বরাদ্দ নেই।',
          });
          return;
        }
      }
      if (
        administrative_unit_id &&
        userRow.administrative_unit_id &&
        String(userRow.administrative_unit_id) !== String(administrative_unit_id)
      ) {
        res.status(403).json({
          error: 'Institution mismatch for user account',
          message_bn: 'এই কর্মকর্তা নির্বাচিত প্রতিষ্ঠানের অন্তর্ভুক্ত নন।',
        });
        return;
      }
    }

    const settings = store.getSystemSettings();
    const isMandatoryMfaRole = resolvedRole === 'supervisor' || resolvedRole === 'developer';
    const mfaRequired =
      Number(userRow.mfa_enabled) === 1 &&
      resolvedRole !== 'citizen' &&
      (isMandatoryMfaRole || settings.require_2fa_for_officers);

    if (mfaRequired) {
      if (!otp) {
        res.status(401).json({
          error: '2FA OTP required for officer login',
          mfa_required: true,
          message_bn: 'নিরাপত্তা যাচাইয়ের জন্য ৬ ডিজিটের 2FA OTP কোড প্রদান করুন।',
        });
        return;
      }
      if (String(otp).trim() !== '123456') {
        res.status(401).json({
          error: 'Invalid 2FA OTP',
          mfa_required: true,
          message_bn: 'প্রদত্ত 2FA OTP কোড সঠিক নয় (স্যান্ডবক্স কোড: 123456)।',
        });
        return;
      }
    }

    store.db
      .prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
      .run(String(userRow.id));

    // Role and institution are always resolved authoritatively from the database
    const authoritativeRole = resolvedRole;
    const authoritativeUnitId = userRow.administrative_unit_id
      ? String(userRow.administrative_unit_id)
      : undefined;

    const actor = {
      id: String(userRow.id),
      role: authoritativeRole,
      name_bn: String(userRow.name_bn),
      title_bn: String(userRow.title_bn),
      administrative_unit_id: authoritativeUnitId,
      employee_id: String(userRow.username),
    };

    const ttlSec =
      typeof session_ttl_seconds === 'number' && Number.isFinite(session_ttl_seconds)
        ? Math.max(-3600, Math.min(session_ttl_seconds, 30 * 24 * 3600))
        : 12 * 3600;
    const sessionId = `sess_${crypto.randomUUID()}`;
    const token = signActorToken(actor, ttlSec, sessionId);
    const sessionTokenHash = hashVerificationToken(token);

    let rawRememberToken: string | undefined;
    let rememberTokenHash: string | null = null;
    let rememberExpiresAt: string | null = null;
    if (remember_me === true) {
      rawRememberToken = `rmb_${crypto.randomBytes(32).toString('base64url')}`;
      rememberTokenHash = hashVerificationToken(rawRememberToken);
      rememberExpiresAt = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    }

    const nowIso = new Date().toISOString();
    const expiresIso = new Date(Date.now() + ttlSec * 1000).toISOString();
    store.db
      .prepare(
        `INSERT INTO user_sessions (
          id, user_id, session_token_hash, remember_token_hash, role_slug, administrative_unit_id,
          ip_address, user_agent, expires_at, remember_expires_at, revoked_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .run(
        sessionId,
        actor.id,
        sessionTokenHash,
        rememberTokenHash,
        actor.role,
        actor.administrative_unit_id || null,
        extractClientIp(req),
        String(req.headers['user-agent'] || '').slice(0, 200),
        expiresIso,
        rememberExpiresAt,
        nowIso
      );

    setSessionCookie(res, token, rawRememberToken);
    const redirectDashboard = resolveRedirectDashboard(actor.role);
    res.json({
      token,
      remember_token: rawRememberToken,
      redirect_dashboard: redirectDashboard,
      session: toUserSession(actor, token),
    });
  });

  // Restore session using a revocable persistent Remember-Me token (never stores plaintext password)
  app.post('/api/auth/remember', (req: Request, res: Response) => {
    const cookies = parseCookies(req.headers.cookie);
    const rawRemember =
      (typeof req.body?.remember_token === 'string' && req.body.remember_token.trim()) ||
      cookies['pottoyon_remember'] ||
      '';
    if (!rawRemember || rawRemember.length < 16) {
      res.status(401).json({
        error: 'Valid remember_token required',
        message_bn: 'বৈধ রিমেম্বার টোকেন পাওয়া যায়নি। পুনরায় লগইন করুন।',
      });
      return;
    }

    const rememberHash = hashVerificationToken(rawRemember);
    const sessRow = store.db
      .prepare(
        `SELECT * FROM user_sessions
         WHERE remember_token_hash = ? AND revoked_at IS NULL
         LIMIT 1`
      )
      .get(rememberHash) as Record<string, unknown> | undefined;

    if (
      !sessRow ||
      !sessRow.remember_expires_at ||
      new Date(String(sessRow.remember_expires_at)).getTime() <= Date.now()
    ) {
      clearSessionCookie(res);
      res.status(401).json({
        error: 'Remember-me token is invalid, expired, or revoked',
        message_bn: 'সেশন মেয়াদোত্তীর্ণ বা বাতিল হয়েছে। পুনরায় লগইন করুন।',
      });
      return;
    }

    const userRow = store.db
      .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
      .get(String(sessRow.user_id)) as Record<string, unknown> | undefined;

    if (
      !userRow ||
      Number(userRow.is_active) !== 1 ||
      String(userRow.account_status || 'active') !== 'active' ||
      Number(userRow.identity_verified ?? 1) !== 1 ||
      String(userRow.password_hash || '') === 'UNSET_INVITATION_REQUIRED'
    ) {
      store.db
        .prepare('UPDATE user_sessions SET revoked_at = ?, remember_token_hash = NULL WHERE id = ?')
        .run(new Date().toISOString(), String(sessRow.id));
      clearSessionCookie(res);
      res.status(403).json({
        error: 'Account suspended, deactivated, or pending verification',
        message_bn: 'এই ব্যবহারকারী অ্যাকাউন্টটি নিষ্ক্রিয় বা যাচাইয়ের অপেক্ষায় রয়েছে।',
      });
      return;
    }

    const resolvedRole = normalizeRoleSlug(String(userRow.primary_role));
    if (!resolvedRole || OBSOLETE_ADMIN_ROLE_SLUGS.has(String(userRow.primary_role).toLowerCase())) {
      res.status(403).json({
        error: 'Account role is unauthorized',
        message_bn: 'এই অ্যাকাউন্টের রোল অনুমোদিত নয়।',
      });
      return;
    }

    // Rotate session and remember token
    const nowIso = new Date().toISOString();
    store.db
      .prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ?')
      .run(nowIso, String(sessRow.id));

    const actor = {
      id: String(userRow.id),
      role: resolvedRole,
      name_bn: String(userRow.name_bn),
      title_bn: String(userRow.title_bn),
      administrative_unit_id: userRow.administrative_unit_id
        ? String(userRow.administrative_unit_id)
        : undefined,
      employee_id: String(userRow.username),
    };

    const newSessionId = `sess_${crypto.randomUUID()}`;
    const newToken = signActorToken(actor, 12 * 3600, newSessionId);
    const newRememberToken = `rmb_${crypto.randomBytes(32).toString('base64url')}`;
    const newExpiresIso = new Date(Date.now() + 12 * 3600_000).toISOString();
    const newRememberExpiresIso = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();

    store.db
      .prepare(
        `INSERT INTO user_sessions (
          id, user_id, session_token_hash, remember_token_hash, role_slug, administrative_unit_id,
          ip_address, user_agent, expires_at, remember_expires_at, revoked_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .run(
        newSessionId,
        actor.id,
        hashVerificationToken(newToken),
        hashVerificationToken(newRememberToken),
        actor.role,
        actor.administrative_unit_id || null,
        extractClientIp(req),
        String(req.headers['user-agent'] || '').slice(0, 200),
        newExpiresIso,
        newRememberExpiresIso,
        nowIso
      );

    setSessionCookie(res, newToken, newRememberToken);
    res.json({
      token: newToken,
      remember_token: newRememberToken,
      redirect_dashboard: resolveRedirectDashboard(actor.role),
      session: toUserSession(actor, newToken),
    });
  });

  // Citizen Self-Registration (Strictly creates CITIZEN accounts only)
  app.post('/api/auth/register-citizen', (req: Request, res: Response) => {
    const { name_bn, username, mobile, email, password } = req.body || {};
    const cleanName = sanitizeText(name_bn, 120);
    const cleanMobile = sanitizeText(mobile, 30);
    const cleanUsername = sanitizeText(username || cleanMobile, 80).toLowerCase().replace(/\s+/g, '');
    const cleanEmail = email ? sanitizeText(email, 120).toLowerCase() : null;

    if (!cleanName || !cleanMobile || !cleanUsername || !password) {
      res.status(400).json({
        error: 'name_bn, mobile, username, and password are required',
        message_bn: 'নাম, মোবাইল নম্বর, ইউজার আইডি এবং পাসওয়ার্ড আবশ্যক।',
      });
      return;
    }

    if (!validateStrongPassword(String(password))) {
      res.status(400).json({
        error: 'Password must be at least 8 characters and include both letters and numbers',
        message_bn: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের এবং অক্ষর ও সংখ্যার সমন্বয়ে হতে হবে।',
      });
      return;
    }

    const existing = store.db
      .prepare('SELECT id FROM users WHERE LOWER(username) = ? LIMIT 1')
      .get(cleanUsername) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({
        error: 'Username already registered',
        message_bn: 'এই ইউজার আইডি ইতিমধ্যে নিবন্ধিত রয়েছে। অন্য ইউজার আইডি ব্যবহার করুন।',
      });
      return;
    }

    const newUserId = `usr_cit_${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();
    const passHash = hashPassword(String(password));

    store.db
      .prepare(
        `INSERT INTO users (
          id, username, password_hash, name_bn, title_bn, mobile, email,
          primary_role, administrative_unit_id, is_active, mfa_enabled,
          failed_login_attempts, locked_until, created_at
        ) VALUES (?, ?, ?, ?, 'নাগরিক সেবা ব্যবহারকারী', ?, ?, 'citizen', NULL, 1, 0, 0, NULL, ?)`
      )
      .run(newUserId, cleanUsername, passHash, cleanName, cleanMobile, cleanEmail, nowIso);

    const actor = {
      id: newUserId,
      role: 'citizen' as UserRole,
      name_bn: cleanName,
      title_bn: 'নাগরিক সেবা ব্যবহারকারী',
      employee_id: cleanUsername,
    };

    const sessionId = `sess_${crypto.randomUUID()}`;
    const token = signActorToken(actor, 12 * 3600, sessionId);
    store.db
      .prepare(
        `INSERT INTO user_sessions (
          id, user_id, session_token_hash, remember_token_hash, role_slug, administrative_unit_id,
          ip_address, user_agent, expires_at, remember_expires_at, revoked_at, created_at
        ) VALUES (?, ?, ?, NULL, 'citizen', NULL, ?, ?, ?, NULL, NULL, ?)`
      )
      .run(
        sessionId,
        newUserId,
        hashVerificationToken(token),
        extractClientIp(req),
        String(req.headers['user-agent'] || '').slice(0, 200),
        new Date(Date.now() + 12 * 3600_000).toISOString(),
        nowIso
      );

    setSessionCookie(res, token);
    res.status(201).json({
      token,
      redirect_dashboard: 'citizen_dashboard',
      session: toUserSession(actor, token),
    });
  });

  app.post('/api/auth/switch-role', (req: Request, res: Response) => {
    const { role, administrative_unit_id, username } = req.body || {};
    if (role && OBSOLETE_ADMIN_ROLE_SLUGS.has(String(role).trim().toLowerCase())) {
      res.status(403).json({
        error: 'Obsolete administrative role is not allowed',
        message_bn: 'এই অপ্রচলিত প্রশাসনিক রোলটি সিস্টেমে অনুমোদিত নয়।',
      });
      return;
    }
    const actor = resolveAuthoritativeOfficer(
      String(role || 'citizen'),
      administrative_unit_id,
      typeof username === 'string' ? username : undefined
    );
    if (!actor) {
      res.status(400).json({
        error: 'Invalid role or institution',
        message_bn: 'রোল বা প্রতিষ্ঠান সঠিক নয়।',
      });
      return;
    }

    const token = signActorToken(actor);
    setSessionCookie(res, token);
    res.json({
      token,
      redirect_dashboard: resolveRedirectDashboard(actor.role),
      session: toUserSession(actor, token),
    });
  });

  app.post('/api/auth/logout', (req: AuthedRequest, res: Response) => {
    const nowIso = new Date().toISOString();
    if (req.actor?.session_id) {
      store.db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ?')
        .run(nowIso, req.actor.session_id);
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawToken = authHeader.slice(7).trim();
      if (rawToken) {
        store.db
          .prepare('UPDATE user_sessions SET revoked_at = ? WHERE session_token_hash = ?')
          .run(nowIso, hashVerificationToken(rawToken));
      }
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['pottoyon_session']) {
      store.db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE session_token_hash = ?')
        .run(nowIso, hashVerificationToken(cookies['pottoyon_session']));
    }
    if (cookies['pottoyon_remember']) {
      store.db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE remember_token_hash = ?')
        .run(nowIso, hashVerificationToken(cookies['pottoyon_remember']));
    }
    if (typeof req.body?.remember_token === 'string' && req.body.remember_token.trim()) {
      store.db
        .prepare('UPDATE user_sessions SET revoked_at = ? WHERE remember_token_hash = ?')
        .run(nowIso, hashVerificationToken(req.body.remember_token.trim()));
    }
    clearSessionCookie(res);
    res.json({ success: true });
  });

  app.post('/api/auth/password-reset/request', (req: Request, res: Response) => {
    const { identifier } = req.body || {};
    const clean = String(identifier || '').trim().toLowerCase();
    if (!clean) {
      res.status(400).json({ error: 'Username, email, or mobile required' });
      return;
    }
    const userRow = store.db
      .prepare(
        `SELECT * FROM users
         WHERE is_active = 1 AND (LOWER(username) = ? OR LOWER(COALESCE(email, '')) = ? OR REPLACE(REPLACE(mobile, '-', ''), ' ', '') = ?)
         LIMIT 1`
      )
      .get(clean, clean, normalizeMobile(clean)) as Record<string, unknown> | undefined;

    if (!userRow) {
      res.json({
        success: true,
        message_bn: 'যদি একাউন্টটি বিদ্যমান থাকে তবে পাসওয়ার্ড রিসেট টোকেন প্রেরণ করা হয়েছে।',
      });
      return;
    }

    const rawToken = crypto.randomBytes(18).toString('base64url');
    const tokenHash = hashVerificationToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();

    store.db
      .prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`
      )
      .run(`prt_${crypto.randomUUID().slice(0, 8)}`, String(userRow.id), tokenHash, expiresAt, now.toISOString());

    res.json({
      success: true,
      message_bn: 'পাসওয়ার্ড রিসেট টোকেন প্রস্তুত হয়েছে (৩০ মিনিট কার্যকর)।',
      reset_token_preview: rawToken,
      expires_at: expiresAt,
    });
  });

  app.post('/api/auth/password-reset/confirm', (req: Request, res: Response) => {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) {
      res.status(400).json({ error: 'Reset token and new_password required' });
      return;
    }
    if (!validateStrongPassword(String(new_password))) {
      res.status(400).json({
        error: 'Password must be at least 8 characters and include both letters and numbers',
        message_bn: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের এবং অক্ষর ও সংখ্যার সমন্বয়ে হতে হবে।',
      });
      return;
    }

    const tokenHash = hashVerificationToken(String(token));
    const row = store.db
      .prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL LIMIT 1')
      .get(tokenHash) as Record<string, unknown> | undefined;

    if (!row || new Date(String(row.expires_at)).getTime() <= Date.now()) {
      res.status(400).json({
        error: 'Invalid or expired reset token',
        message_bn: 'পাসওয়ার্ড রিসেট টোকেনটি সঠিক নয় অথবা মেয়াদ উত্তীর্ণ হয়েছে।',
      });
      return;
    }

    const newHash = hashPassword(String(new_password));
    const nowIso = new Date().toISOString();
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.db
        .prepare('UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
        .run(newHash, String(row.user_id));
      store.db
        .prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?')
        .run(nowIso, String(row.id));
      store.db.exec('COMMIT');
    } catch (err) {
      try {
        store.db.exec('ROLLBACK');
      } catch {
        // ignore
      }
      throw err;
    }

    res.json({
      success: true,
      message_bn: 'পাসওয়ার্ড সফলভাবে হালনাগাদ ও একাউন্ট আনলক করা হয়েছে।',
    });
  });

  app.get('/api/auth/me', (req: AuthedRequest, res: Response) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const authHeader = req.headers.authorization;
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    res.json({
      actor: req.actor,
      session: toUserSession(req.actor, rawToken),
    });
  });

  app.get('/api/rbac/me', (req: AuthedRequest, res: Response) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({
      session: toUserSession(req.actor, ''),
      assigned_institutions: req.rbacContext.assignedInstitutions,
      assigned_wards: req.rbacContext.assignedWards,
      assigned_departments: req.rbacContext.assignedDepartments,
      approval_authorities: req.rbacContext.approvalAuthorities,
    });
  });

  // --- Initial User Reset & Four Admin Account Setup (Safe Non-Destructive Cleanup & Invitation Setup) ---
  app.post('/api/auth/setup-account-password', (req: Request, res: Response) => {
    try {
      const { username, invitation_token, new_password, mobile, email } = req.body || {};
      const result = setupAccountPasswordWithInvitationTransactional({
        username: String(username || ''),
        invitationToken: String(invitation_token || ''),
        newPassword: String(new_password || ''),
        mobile: typeof mobile === 'string' ? mobile : undefined,
        email: typeof email === 'string' ? email : undefined,
      });
      res.json(result);
    } catch (err) {
      handleRbacError(res, err, 'Failed to set up account password with invitation token');
    }
  });

  app.get('/api/rbac/initial-reset/preview', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    try {
      const ctx = req.rbacContext!;
      const canView =
        ctx.activeRoles.includes('supervisor') ||
        ctx.activeRoles.includes('developer') ||
        ctx.effectivePermissions.get('users.view') === 'global' ||
        ctx.effectivePermissions.get('users.create') === 'global' ||
        ctx.effectivePermissions.get('roles.view') === 'global';
      if (!canView) {
        res.status(403).json({
          error: 'Forbidden: global user/role inspection permission required',
          message_bn: 'প্রারম্ভিক অ্যাডমিন অ্যাকাউন্ট অডিট সারাংশ দেখার অনুমতি আপনার নেই।',
        });
        return;
      }
      res.json(getInitialAdminResetPreview());
    } catch (err) {
      handleRbacError(res, err, 'Failed to load initial admin reset preview');
    }
  });

  app.post('/api/rbac/initial-reset/execute', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    try {
      const result = executeInitialAdminResetTransactional({
        actorCtx: req.rbacContext!,
        confirmDeactivation: req.body?.confirm_deactivation === true,
        reasonBn: typeof req.body?.reason_bn === 'string' ? req.body.reason_bn : undefined,
      });
      res.json(result);
    } catch (err) {
      handleRbacError(res, err, 'Failed to execute initial admin account cleanup');
    }
  });

  app.post(
    '/api/rbac/initial-reset/accounts/:userId/issue-invitation',
    requireOfficerMiddleware,
    (req: AuthedRequest, res: Response) => {
      try {
        const result = issueAccountInvitationTokenTransactional({
          actorCtx: req.rbacContext!,
          targetUserId: req.params.userId,
          expiresInHours:
            typeof req.body?.expires_in_hours === 'number' ? req.body.expires_in_hours : undefined,
        });
        res.json(result);
      } catch (err) {
        handleRbacError(res, err, 'Failed to issue account invitation token');
      }
    }
  );

  app.post(
    '/api/rbac/initial-reset/accounts/:userId/verify-identity',
    requireOfficerMiddleware,
    (req: AuthedRequest, res: Response) => {
      try {
        const result = verifyInitialAdminIdentityTransactional({
          actorCtx: req.rbacContext!,
          targetUserId: req.params.userId,
          verificationNoteBn: String(req.body?.verification_note_bn || ''),
          activateAccount: req.body?.activate_account !== false,
        });
        res.json(result);
      } catch (err) {
        handleRbacError(res, err, 'Failed to verify initial admin account identity');
      }
    }
  );

  // --- Institutions & Services ---
  app.get('/api/institutions', (_req: Request, res: Response) => {
    res.json(store.getInstitutions());
  });

  app.get('/api/institutions/:id', (req: Request, res: Response) => {
    const unit = store.getInstitutionById(req.params.id);
    if (!unit) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    res.json(unit);
  });

  app.patch('/api/institutions/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const unit = store.getInstitutionById(req.params.id);
    if (!unit) {
      res.status(404).json({ error: 'Institution not found' });
      return;
    }
    const permCheck = authorizeContextPermission(ctx, 'settings.manage', { unitId: unit.id });
    if (!permCheck.allowed) {
      res.status(403).json({
        error: permCheck.reason || 'Forbidden: cross-institution update denied',
        message_bn: permCheck.reasonBn || 'অন্য প্রতিষ্ঠানের তথ্য পরিবর্তন করার অনুমতি নেই।',
      });
      return;
    }

    const b = req.body || {};
    const updated = {
      ...unit,
      office_address_bn: b.office_address_bn ? sanitizeText(b.office_address_bn, 300) : unit.office_address_bn,
      contact_phone: b.contact_phone ? sanitizeText(b.contact_phone, 50) : unit.contact_phone,
      contact_email: b.contact_email ? sanitizeText(b.contact_email, 120) : unit.contact_email,
      chairman_or_mayor_name_bn: b.chairman_or_mayor_name_bn
        ? sanitizeText(b.chairman_or_mayor_name_bn, 120)
        : unit.chairman_or_mayor_name_bn,
      secretary_or_ceo_name_bn: b.secretary_or_ceo_name_bn
        ? sanitizeText(b.secretary_or_ceo_name_bn, 120)
        : unit.secretary_or_ceo_name_bn,
    };
    store.updateInstitution(updated);
    res.json(updated);
  });

  app.get('/api/services', (_req: Request, res: Response) => {
    res.json(store.getServices());
  });

  app.get('/api/services/:id', (req: Request, res: Response) => {
    const srv = store.getServiceById(req.params.id);
    if (!srv) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    res.json(srv);
  });

  app.patch('/api/services/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const unitId = typeof b.unit_id === 'string' ? b.unit_id : undefined;
    const feeCheck = authorizeContextPermission(ctx, 'services.configure_fees', { unitId });
    const manageCheck = authorizeContextPermission(ctx, 'services.manage', { unitId });
    const effective = feeCheck.allowed ? feeCheck : manageCheck;

    if (!effective.allowed || (effective.scope !== 'global' && effective.scope !== 'upazila' && !unitId)) {
      res.status(403).json({
        error: 'Forbidden: insufficient authority to modify global service configuration',
        message_bn: 'কেন্দ্রীয় সেবা ও ফি কনফিগারেশন পরিবর্তনের অনুমতি আপনার নেই।',
      });
      return;
    }

    const srv = store.getServiceById(req.params.id);
    if (!srv) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const nextFee = typeof b.default_fee === 'number' && b.default_fee >= 0 ? b.default_fee : srv.default_fee;
    const nextDays =
      typeof b.delivery_time_days === 'number' && b.delivery_time_days >= 1
        ? b.delivery_time_days
        : srv.delivery_time_days;
    const allowedWorkflowSteps = new Set<WorkflowStepKey>([
      'operator_intake',
      'ward_verification',
      'secretary_verification',
      'department_verification',
      'executive_review',
      'approver_decision',
    ]);
    const nextWorkflowSteps = Array.isArray(b.workflow_steps)
      ? (b.workflow_steps.filter((st: unknown) => allowedWorkflowSteps.has(st as WorkflowStepKey)) as WorkflowStepKey[])
      : srv.workflow_steps;

    const updated = {
      ...srv,
      name_bn: typeof b.name_bn === 'string' && b.name_bn.trim() ? sanitizeText(b.name_bn, 160) : srv.name_bn,
      name_en: typeof b.name_en === 'string' && b.name_en.trim() ? sanitizeText(b.name_en, 160) : srv.name_en,
      required_docs_bn: Array.isArray(b.required_docs_bn)
        ? b.required_docs_bn.map((d: unknown) => sanitizeText(d, 160)).filter(Boolean)
        : srv.required_docs_bn,
      workflow_steps: nextWorkflowSteps && nextWorkflowSteps.length > 0 ? nextWorkflowSteps : srv.workflow_steps,
      default_fee: nextFee,
      delivery_time_days: nextDays,
      is_active: typeof b.is_active === 'boolean' ? b.is_active : srv.is_active ?? true,
    };
    store.updateService(updated);
    appendPermissionAuditLog({
      actorId: ctx.user.id,
      actorRole: ctx.user.primary_role,
      actorNameBn: ctx.user.name_bn,
      actionType: 'service_configuration_updated',
      targetType: 'service',
      targetId: srv.id,
      unitId: unitId || null,
      before: {
        default_fee: srv.default_fee,
        delivery_time_days: srv.delivery_time_days,
        workflow_steps: srv.workflow_steps,
        is_active: srv.is_active,
      },
      after: {
        default_fee: updated.default_fee,
        delivery_time_days: updated.delivery_time_days,
        workflow_steps: updated.workflow_steps,
        is_active: updated.is_active,
      },
      reasonBn: `সেবা কনফিগারেশন হালনাগাদ (${updated.name_bn})`,
    });
    res.json(updated);
  });

  app.get('/api/certificate-templates', (_req: Request, res: Response) => {
    res.json(store.getCertificateTemplates());
  });

  // --- Live Dashboard Aggregated Stats (Permission & Scope Isolated) ---
  app.get('/api/dashboard/stats', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const dashPerm = authorizeContextPermission(ctx, 'dashboard.view', { unitId: requestedUnit });
    if (!dashPerm.allowed) {
      res.status(403).json({
        error: dashPerm.reason || 'Forbidden: cross-institution stats access denied',
        message_bn: dashPerm.reasonBn || 'অন্য প্রতিষ্ঠানের পরিসংখ্যান দেখার অনুমতি নেই।',
      });
      return;
    }

    const isBroad = hasBroadUnitScope(ctx, 'dashboard.view');
    const unitScope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];

    const rawApps = store.getApplications(unitScope);
    const hasAppView = ctx.effectivePermissions.has('applications.view');
    const hasFinanceView =
      ctx.effectivePermissions.has('payments.view') || ctx.effectivePermissions.has('payments.view_reports');

    const apps = hasAppView
      ? filterApplicationsForContext(ctx, rawApps)
      : hasFinanceView
      ? rawApps
      : [];

    const appIds = new Set(apps.map((a) => a.id));
    const rawCerts = store.getCertificates(unitScope);
    const certs = hasAppView
      ? rawCerts.filter((c) => appIds.has(c.application_id))
      : ctx.effectivePermissions.has('certificates.view')
      ? rawCerts
      : [];

    const holdingTaxes = hasFinanceView ? store.getHoldingTaxes(unitScope) : [];
    const tradeLicenses = hasFinanceView || ctx.effectivePermissions.has('services.view')
      ? store.getTradeLicenses(unitScope)
      : [];
    const institutions = store.getInstitutions();

    const pendingStatuses = new Set(['pending_payment', 'paid', 'under_verification', 'correction_required', 'forwarded_for_approval']);
    const monthNamesBn = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
    const monthMap = new Map<string, { count: number; revenue: number }>();
    for (const appItem of apps) {
      const d = new Date(appItem.created_at);
      const label = monthNamesBn[d.getUTCMonth()] || 'নভে';
      const prev = monthMap.get(label) || { count: 0, revenue: 0 };
      prev.count += 1;
      if (appItem.payment_status === 'paid') prev.revenue += appItem.fee_amount || 0;
      monthMap.set(label, prev);
    }

    const monthly_stats = Array.from(monthMap.entries()).map(([month, v]) => ({
      month,
      count: v.count,
      revenue: v.revenue,
    }));

    const serviceCounter = new Map<string, { service_id: string; service_name_bn: string; count: number }>();
    for (const appItem of apps) {
      const prev = serviceCounter.get(appItem.service_id) || {
        service_id: appItem.service_id,
        service_name_bn: appItem.service_name_bn,
        count: 0,
      };
      prev.count += 1;
      serviceCounter.set(appItem.service_id, prev);
    }

    const allServices = store.getServices();
    const serviceSlaMap = new Map<string, number>(
      allServices.map((s) => [s.id, Number(s.delivery_time_days) || 3])
    );
    const nowMs = Date.now();
    const isAppOverdue = (a: Application): boolean => {
      if (!pendingStatuses.has(a.status)) return false;
      const slaDays = serviceSlaMap.get(a.service_id) || 3;
      const ageDays = Math.max(0, (nowMs - new Date(a.created_at).getTime()) / 86_400_000);
      return ageDays > slaDays;
    };
    const calcAvgDays = (list: Application[]): number => {
      if (list.length === 0) return 0;
      const sumDays = list.reduce((acc, a) => {
        const start = new Date(a.created_at).getTime();
        const end = new Date(a.updated_at || a.created_at).getTime();
        const diffDays = Math.max(0.5, (end - start) / 86_400_000);
        return acc + diffDays;
      }, 0);
      return Math.round((sumDays / list.length) * 10) / 10;
    };

    const institution_breakdown = institutions
      .filter((inst) => !unitScope || inst.id === unitScope)
      .map((inst) => {
        const instApps = apps.filter((a) => a.administrative_unit_id === inst.id);
        const instCerts = certs.filter((c) => c.administrative_unit_id === inst.id);
        const instRev = instApps
          .filter((a) => a.payment_status === 'paid')
          .reduce((s, a) => s + (a.fee_amount || 0), 0);
        return {
          unit_id: inst.id,
          name_bn: inst.name_bn,
          type: inst.type,
          applications: instApps.length,
          pending: instApps.filter((a) => pendingStatuses.has(a.status)).length,
          overdue: instApps.filter(isAppOverdue).length,
          avg_days: calcAvgDays(instApps),
          certificates: instCerts.length,
          revenue: instRev,
        };
      });

    const stats: DashboardStatsResponse = {
      total_applications: apps.length,
      pending_applications: apps.filter((a) => pendingStatuses.has(a.status)).length,
      overdue_applications: apps.filter(isAppOverdue).length,
      avg_processing_days: calcAvgDays(apps),
      under_verification: apps.filter((a) => a.status === 'under_verification').length,
      correction_required: apps.filter((a) => a.status === 'correction_required').length,
      forwarded_for_approval: apps.filter((a) => a.status === 'forwarded_for_approval').length,
      approved_applications: apps.filter((a) => a.status === 'approved' || a.status === 'certificate_issued').length,
      rejected_applications: apps.filter((a) => a.status === 'rejected').length,
      total_certificates: certs.length,
      valid_certificates: certs.filter((c) => c.status === 'valid').length,
      revoked_certificates: certs.filter((c) => c.status === 'revoked').length,
      expired_certificates: certs.filter((c) => c.status === 'expired').length,
      total_revenue: hasFinanceView || isBroad
        ? apps.filter((a) => a.payment_status === 'paid').reduce((s, a) => s + (a.fee_amount || 0), 0)
        : 0,
      holding_tax_due: holdingTaxes.reduce((s, h) => s + (h.current_due || 0), 0),
      holding_tax_collected: holdingTaxes.filter((h) => h.status === 'paid').reduce((s, h) => s + (h.annual_tax || 0), 0),
      active_trade_licenses: tradeLicenses.filter((t) => t.status === 'active').length,
      monthly_stats,
      service_breakdown: Array.from(serviceCounter.values()).sort((a, b) => b.count - a.count),
      institution_breakdown,
    };

    res.json(stats);
  });

  // --- Citizen Self-Service Portal (IDOR Protected for Authenticated Citizens) ---
  app.get('/api/citizen/portal', (req: AuthedRequest, res: Response) => {
    const mobile = typeof req.query.mobile === 'string' ? req.query.mobile.trim() : '';
    const trackingNo = typeof req.query.tracking_no === 'string' ? req.query.tracking_no.trim().toUpperCase() : '';

    if (req.actor && req.actor.role === 'citizen' && req.rbacContext) {
      const ctx = req.rbacContext;
      const myNormMobile = normalizeMobile(ctx.user.mobile);

      if (mobile && normalizeMobile(mobile) !== myNormMobile) {
        res.status(403).json({
          error: 'Forbidden: cannot access another citizen portal data',
          message_bn: 'অন্য নাগরিকের মোবাইল নম্বর দিয়ে তথ্য দেখার অনুমতি নেই।',
        });
        return;
      }

      const allApps = store.getApplications();
      if (trackingNo) {
        const target = allApps.find((a) => a.tracking_no.toUpperCase() === trackingNo);
        if (target && !canUserAccessApplicationRecord(ctx, target)) {
          res.status(403).json({
            error: 'Forbidden: application belongs to another citizen',
            message_bn: 'অন্য নাগরিকের আবেদনের তথ্য দেখার অনুমতি নেই।',
          });
          return;
        }
      }

      const matchedApps = allApps
        .filter((a) => canUserAccessApplicationRecord(ctx, a))
        .filter((a) => !trackingNo || a.tracking_no.toUpperCase() === trackingNo);

      const appIds = new Set(matchedApps.map((a) => a.id));
      const certs = store
        .getCertificates()
        .filter((c) => appIds.has(c.application_id))
        .map(sanitizeCertificateForResponse);
      const notifications = matchedApps.flatMap((a) => store.getNotifications({ applicationId: a.id }));

      res.json({
        applications: matchedApps.map(redactCitizenApplication),
        certificates: certs,
        notifications: notifications.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      });
      return;
    }

    if (!mobile && !trackingNo) {
      res.status(400).json({
        error: 'Provide mobile number or tracking_no',
        message_bn: 'নাগরিক তথ্য দেখতে মোবাইল নম্বর অথবা ট্র্যাকিং নম্বর দিন।',
      });
      return;
    }

    const allApps = store.getApplications();
    const matchedApps = allApps.filter((a) => {
      if (trackingNo && a.tracking_no.toUpperCase() === trackingNo) return true;
      if (mobile && normalizeMobile(a.mobile) === normalizeMobile(mobile)) return true;
      return false;
    });

    const appIds = new Set(matchedApps.map((a) => a.id));
    const certs = store
      .getCertificates()
      .filter((c) => appIds.has(c.application_id))
      .map(sanitizeCertificateForResponse);

    const notifications = matchedApps.flatMap((a) => store.getNotifications({ applicationId: a.id }));

    res.json({
      applications: matchedApps.map(redactCitizenApplication),
      certificates: certs,
      notifications: notifications.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    });
  });

  // --- Applications (Permission + Institution/Ward/Dept/Assigned/Own Scoped) ---
  app.get('/api/applications', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const viewCheck = authorizeContextPermission(ctx, 'applications.view', { unitId: requestedUnit });
    if (!viewCheck.allowed) {
      res.status(403).json({
        error: viewCheck.reason || 'Forbidden: applications view access denied',
        message_bn: viewCheck.reasonBn || 'আপনার পদবি থেকে আবেদন তালিকা দেখার অনুমতি নেই।',
      });
      return;
    }

    const wardNoParam = typeof req.query.ward_no === 'string' ? parseInt(req.query.ward_no, 10) : NaN;
    if (Number.isFinite(wardNoParam) && viewCheck.scope === 'ward' && !ctx.assignedWards.includes(wardNoParam)) {
      res.status(403).json({
        error: 'Forbidden: outside assigned ward scope',
        message_bn: 'অন্য ওয়ার্ডের আবেদন দেখার অনুমতি নেই।',
      });
      return;
    }

    const isBroad = hasBroadUnitScope(ctx, 'applications.view');
    const effectiveUnit = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    let items = filterApplicationsForContext(ctx, store.getApplications(effectiveUnit));

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const serviceId = typeof req.query.service_id === 'string' ? req.query.service_id : '';

    if (q) {
      items = items.filter(
        (a) =>
          a.tracking_no.toLowerCase().includes(q) ||
          a.applicant_name_bn.toLowerCase().includes(q) ||
          a.service_name_bn.toLowerCase().includes(q) ||
          a.mobile.toLowerCase().includes(q) ||
          (a.assigned_officer || '').toLowerCase().includes(q)
      );
    }
    if (status && status !== 'all') {
      items = items.filter((a) => a.status === status);
    }
    if (serviceId && serviceId !== 'all') {
      items = items.filter((a) => a.service_id === serviceId);
    }
    if (Number.isFinite(wardNoParam)) {
      items = items.filter((a) => a.ward_no === wardNoParam);
    }

    if (req.query.paginated === '1') {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size || '10'), 10) || 10));
      const total = items.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize);
      res.json({
        items: paged,
        total,
        page: safePage,
        page_size: pageSize,
        total_pages: totalPages,
      });
      return;
    }

    res.json(items);
  });

  app.get('/api/applications/:idOrTracking', (req: AuthedRequest, res: Response) => {
    const appRecord = store.getApplicationByIdOrTracking(req.params.idOrTracking);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const isCitizenOrAnon = !req.actor || req.actor.role === 'citizen';

    if (req.actor && req.rbacContext) {
      if (!canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
        res.status(403).json({
          error: 'Forbidden: record access denied by RBAC scope',
          message_bn: 'অন্য প্রতিষ্ঠান, ওয়ার্ড, বিভাগ বা নাগরিকের আবেদনে প্রবেশের অনুমতি নেই।',
        });
        return;
      }
    } else {
      // Unauthenticated lookup allowed ONLY by exact tracking number (prevents raw ID IDOR enumeration)
      const byTracking = req.params.idOrTracking.trim().toUpperCase() === appRecord.tracking_no.toUpperCase();
      if (!byTracking) {
        res.status(401).json({
          error: 'Authentication or exact tracking number required',
          message_bn: 'আবেদন দেখতে লগইন করুন অথবা সঠিক ট্র্যাকিং নম্বর ব্যবহার করুন।',
        });
        return;
      }
    }

    const cert = appRecord.certificate_id
      ? store.getCertificateById(appRecord.certificate_id)
      : store.getCertificateByApplicationId(appRecord.id);

    const notifications = store.getNotifications({ applicationId: appRecord.id });
    const approvals = isCitizenOrAnon
      ? []
      : store.getApplicationApprovals(appRecord.id);

    res.json({
      ...(isCitizenOrAnon ? redactCitizenApplication(appRecord) : appRecord),
      certificate: cert ? sanitizeCertificateForResponse(cert) : undefined,
      notifications,
      approvals,
    });
  });

  app.post('/api/applications', (req: AuthedRequest, res: Response) => {
    const body = req.body || {};
    const isUnionScopedOfficer =
      Boolean(req.actor && req.rbacContext && (req.actor.role === 'chairman' || req.actor.role === 'secretary'));
    const officerAssignedUnitId = isUnionScopedOfficer
      ? req.rbacContext!.assignedInstitutions[0] || req.actor!.administrative_unit_id
      : undefined;

    if (
      isUnionScopedOfficer &&
      body.administrative_unit_id &&
      officerAssignedUnitId &&
      String(body.administrative_unit_id) !== officerAssignedUnitId
    ) {
      res.status(403).json({
        error: 'Forbidden: cannot create application for another Union or institution',
        message_bn: 'অন্য ইউনিয়ন পরিষদ বা প্রতিষ্ঠানের নামে আবেদন তৈরি করার অনুমতি আপনার নেই।',
      });
      return;
    }

    const effectiveUnitId = isUnionScopedOfficer
      ? officerAssignedUnitId || body.administrative_unit_id
      : body.administrative_unit_id;

    if (!effectiveUnitId || !body.service_id || !body.applicant_name_bn || !body.mobile) {
      res.status(400).json({
        error: 'Missing required application fields',
        message_bn: 'আবশ্যকীয় তথ্যসমূহ পূরণ করুন।',
      });
      return;
    }

    if (req.actor && req.rbacContext) {
      const check = authorizeContextPermission(req.rbacContext, 'applications.create', {
        unitId: req.actor.role === 'citizen' ? undefined : effectiveUnitId,
        ownerUserId: req.actor.id,
      });
      if (!check.allowed) {
        res.status(403).json({
          error: check.reason || 'Forbidden: cannot create application',
          message_bn: check.reasonBn || 'আপনার পদবি থেকে আবেদন তৈরির অনুমতি নেই।',
        });
        return;
      }
    }

    const unit = store.getInstitutionById(effectiveUnitId);
    const service = store.getServiceById(body.service_id);
    if (!unit || !service) {
      res.status(404).json({
        error: 'Invalid institution or service',
        message_bn: 'নির্বাচিত প্রতিষ্ঠান বা সেবা সঠিক নয়।',
      });
      return;
    }

    if (service.is_active === false) {
      res.status(400).json({
        error: 'Selected service is currently disabled',
        message_bn: 'নির্বাচিত সেবাটি বর্তমানে নিষ্ক্রিয় রয়েছে।',
      });
      return;
    }

    const wardNo = body.ward_no !== undefined ? Number(body.ward_no) : 1;
    if (!Number.isInteger(wardNo) || wardNo < 1 || wardNo > unit.wards_count) {
      res.status(400).json({
        error: 'Invalid ward number for selected institution',
        message_bn: `নির্বাচিত প্রতিষ্ঠানের জন্য ১ থেকে ${unit.wards_count} এর মধ্যে সঠিক ওয়ার্ড নম্বর প্রদান করুন।`,
      });
      return;
    }

    const prefix = unit.type === 'municipality' ? 'PM' : 'UP';
    const randomNum = crypto.randomInt(10000, 99999);
    const trackingNo = `${prefix}-2026-${randomNum}`;
    const nowIso = new Date().toISOString();
    const authoritativeFee = Number(service.default_fee) || 0;
    const isZeroFee = authoritativeFee === 0;

    const isOfficerActor = Boolean(req.actor && req.actor.role !== 'citizen');
    const isDraftRequested =
      Boolean(body.save_as_draft || body.status === 'draft') && isOfficerActor;
    const isDirectSubmitToChairman =
      !isDraftRequested &&
      isOfficerActor &&
      Boolean(body.submit_to_chairman === true || body.save_as_draft === false || req.actor?.role === 'chairman');

    // Never auto-approve at creation time — even if created by UP_CHAIRMAN
    const initialStatus: ApplicationStatus = isDraftRequested
      ? 'draft'
      : isDirectSubmitToChairman
      ? 'forwarded_for_approval'
      : isZeroFee
      ? 'paid'
      : 'pending_payment';

    const roleLabelBn =
      req.actor?.role === 'chairman'
        ? 'ইউপি চেয়ারম্যান'
        : req.actor?.role === 'secretary'
        ? 'ইউপি সচিব'
        : 'কর্মকর্তা';

    const newApp: Application = {
      administrative_unit_id: unit.id,
      service_id: service.id,
      service_name_bn: sanitizeText(service.name_bn, 160),
      applicant_name_bn: sanitizeText(body.applicant_name_bn, 160),
      applicant_name_en: sanitizeText(body.applicant_name_en || '', 160),
      father_name_bn: sanitizeText(body.father_name_bn || '', 160),
      mother_name_bn: sanitizeText(body.mother_name_bn || '', 160),
      spouse_name_bn: body.spouse_name_bn ? sanitizeText(body.spouse_name_bn, 160) : undefined,
      nid_or_birth_reg: sanitizeText(body.nid_or_birth_reg || '', 40),
      mobile: sanitizeText(body.mobile, 25),
      email: body.email ? sanitizeText(body.email, 120) : undefined,
      ward_no: wardNo,
      village_or_area_bn: sanitizeText(body.village_or_area_bn || '', 200),
      road_block_sector_bn: body.road_block_sector_bn ? sanitizeText(body.road_block_sector_bn, 200) : undefined,
      holding_no: body.holding_no ? sanitizeText(body.holding_no, 80) : undefined,
      post_office_bn: sanitizeText(body.post_office_bn || 'পাবনা সদর', 120),
      upazila_bn: sanitizeText(unit.upazila_bn, 120),
      district_bn: sanitizeText(unit.district_bn, 120),
      permanent_address_bn: body.permanent_address_bn ? sanitizeText(body.permanent_address_bn, 300) : undefined,
      present_address_bn: body.present_address_bn ? sanitizeText(body.present_address_bn, 300) : undefined,
      heirs: Array.isArray(body.heirs) ? body.heirs.slice(0, 50) : undefined,
      id: `app_${Date.now()}_${randomNum}`,
      tracking_no: trackingNo,
      fee_amount: authoritativeFee,
      status: initialStatus,
      payment_status: isZeroFee ? 'paid' : 'unpaid',
      created_by_user_id: req.actor?.id,
      created_by_role: req.actor?.role,
      submitted_by_user_id: isDraftRequested ? undefined : req.actor?.id,
      submitted_at: isDraftRequested ? undefined : nowIso,
      assigned_officer_id: isOfficerActor ? req.actor!.id : undefined,
      assigned_officer: isOfficerActor ? req.actor!.name_bn : undefined,
      created_at: nowIso,
      updated_at: nowIso,
      review_notes: [
        isDraftRequested
          ? `${roleLabelBn} (${req.actor?.name_bn || 'কর্মকর্তা'}) কর্তৃক খসড়া আবেদন প্রস্তুত ও সংরক্ষিত হয়েছে।`
          : isDirectSubmitToChairman
          ? `${roleLabelBn} (${req.actor?.name_bn || 'কর্মকর্তা'}) কর্তৃক আবেদন প্রস্তুত ও চেয়ারম্যান অনুমোদনের জন্য দাখিলকৃত।`
          : 'আবেদন সফলভাবে সার্ভারে সংরক্ষিত হয়েছে।',
      ],
    };

    store.upsertApplication(newApp);
    if (isOfficerActor) {
      store.recordApprovalAction({
        applicationId: newApp.id,
        unitId: newApp.administrative_unit_id,
        officerId: req.actor!.id,
        officerRole: req.actor!.role,
        officerNameBn: req.actor!.name_bn,
        officerTitleBn: req.actor!.title_bn,
        decision: isDraftRequested ? 'under_verification' : 'forwarded',
        notes: isDraftRequested
          ? `${roleLabelBn} কর্তৃক খসড়া সংরক্ষণ`
          : `${roleLabelBn} কর্তৃক আবেদন দাখিল`,
        timestamp: nowIso,
      });
    }
    if (!isDraftRequested) {
      store.insertNotification({
        mobile: newApp.mobile,
        applicationId: newApp.id,
        unitId: newApp.administrative_unit_id,
        titleBn: 'নতুন আবেদন দাখিল হয়েছে',
        messageBn: `${unit.name_bn}-এ ${newApp.service_name_bn} আবেদন (${newApp.tracking_no}) দাখিল হয়েছে এবং চেয়ারম্যানের অনুমোদনের অপেক্ষায় রয়েছে।`,
      });
    }
    res.status(201).json(newApp);
  });

  // UP Secretary & UP Chairman: Edit draft or correction_required application, validate completeness, or submit to Chairman
  app.patch('/api/applications/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const actor = req.actor!;
    const ctx = req.rbacContext!;
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const b = req.body || {};
    if (b.administrative_unit_id && String(b.administrative_unit_id) !== appRecord.administrative_unit_id) {
      res.status(403).json({
        error: 'Forbidden: application administrative_unit_id is immutable and cannot be moved to another Union',
        message_bn: 'আবেদনের নির্ধারিত ইউনিয়ন/প্রতিষ্ঠান পরিবর্তন করা সম্পূর্ণ নিষিদ্ধ।',
      });
      return;
    }

    const canEdit =
      authorizeContextPermission(ctx, 'applications.edit', {
        unitId: appRecord.administrative_unit_id,
      }).allowed ||
      authorizeContextPermission(ctx, 'applications.verify', {
        unitId: appRecord.administrative_unit_id,
      }).allowed;

    if (!canEdit) {
      res.status(403).json({
        error: 'Forbidden: cannot edit application in this institution',
        message_bn: 'এই প্রতিষ্ঠানের আবেদন সম্পাদনার অনুমতি আপনার নেই।',
      });
      return;
    }

    if (appRecord.status === 'certificate_issued' || appRecord.status === 'approved') {
      res.status(409).json({
        error: 'Cannot edit an already approved or issued application',
        message_bn: 'চূড়ান্ত অনুমোদিত বা ইস্যুকৃত সনদের আবেদন সরাসরি সম্পাদনা করা যাবে না।',
      });
      return;
    }

    if (b.status === 'approved' || b.status === 'certificate_issued' || b.status === 'rejected') {
      res.status(403).json({
        error: 'Forbidden: cannot approve, issue certificate, or reject via application edit endpoint',
        message_bn: 'খসড়া সম্পাদনা ধাপ থেকে চূড়ান্ত অনুমোদন, প্রত্যাখ্যান বা সনদ ইস্যু করা যাবে না।',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: Application = {
      ...appRecord,
      administrative_unit_id: appRecord.administrative_unit_id,
      applicant_name_bn: b.applicant_name_bn !== undefined ? sanitizeText(b.applicant_name_bn, 160) : appRecord.applicant_name_bn,
      applicant_name_en: b.applicant_name_en !== undefined ? sanitizeText(b.applicant_name_en, 160) : appRecord.applicant_name_en,
      father_name_bn: b.father_name_bn !== undefined ? sanitizeText(b.father_name_bn, 160) : appRecord.father_name_bn,
      mother_name_bn: b.mother_name_bn !== undefined ? sanitizeText(b.mother_name_bn, 160) : appRecord.mother_name_bn,
      spouse_name_bn: b.spouse_name_bn !== undefined ? sanitizeText(b.spouse_name_bn, 160) : appRecord.spouse_name_bn,
      nid_or_birth_reg: b.nid_or_birth_reg !== undefined ? sanitizeText(b.nid_or_birth_reg, 40) : appRecord.nid_or_birth_reg,
      mobile: b.mobile !== undefined ? sanitizeText(b.mobile, 25) : appRecord.mobile,
      email: b.email !== undefined ? sanitizeText(b.email, 120) : appRecord.email,
      ward_no: b.ward_no !== undefined ? Number(b.ward_no) || appRecord.ward_no : appRecord.ward_no,
      village_or_area_bn: b.village_or_area_bn !== undefined ? sanitizeText(b.village_or_area_bn, 200) : appRecord.village_or_area_bn,
      road_block_sector_bn: b.road_block_sector_bn !== undefined ? sanitizeText(b.road_block_sector_bn, 200) : appRecord.road_block_sector_bn,
      holding_no: b.holding_no !== undefined ? sanitizeText(b.holding_no, 80) : appRecord.holding_no,
      post_office_bn: b.post_office_bn !== undefined ? sanitizeText(b.post_office_bn, 120) : appRecord.post_office_bn,
      permanent_address_bn: b.permanent_address_bn !== undefined ? sanitizeText(b.permanent_address_bn, 300) : appRecord.permanent_address_bn,
      present_address_bn: b.present_address_bn !== undefined ? sanitizeText(b.present_address_bn, 300) : appRecord.present_address_bn,
      heirs: Array.isArray(b.heirs) ? b.heirs.slice(0, 50) : appRecord.heirs,
      assigned_officer_id: actor.id,
      assigned_officer: actor.name_bn,
      updated_at: nowIso,
    };

    const missingFieldsBn: string[] = [];
    if (!updated.applicant_name_bn?.trim()) missingFieldsBn.push('আবেদনকারীর নাম (বাংলা)');
    if (!updated.father_name_bn?.trim()) missingFieldsBn.push('পিতা/স্বামীর নাম');
    if (!updated.mother_name_bn?.trim()) missingFieldsBn.push('মাতার নাম');
    if (!updated.nid_or_birth_reg?.trim()) missingFieldsBn.push('জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন নম্বর');
    if (!updated.mobile?.trim()) missingFieldsBn.push('মোবাইল নম্বর');
    if (!updated.village_or_area_bn?.trim()) missingFieldsBn.push('গ্রাম / মহল্লা');

    const roleLabelBn = actor.role === 'chairman' ? 'ইউপি চেয়ারম্যান' : 'ইউপি সচিব';

    if (b.submit_to_chairman === true) {
      if (missingFieldsBn.length > 0) {
        res.status(400).json({
          error: `Incomplete application: missing ${missingFieldsBn.join(', ')}`,
          missing_fields_bn: missingFieldsBn,
          message_bn: `চেয়ারম্যানের নিকট প্রেরণের পূর্বে আবশ্যকীয় তথ্য পূর্ণ করুন: ${missingFieldsBn.join(', ')}`,
        });
        return;
      }
      const fwdCheck =
        authorizeContextPermission(ctx, 'applications.forward', {
          unitId: appRecord.administrative_unit_id,
        }).allowed ||
        authorizeContextPermission(ctx, 'applications.submit', {
          unitId: appRecord.administrative_unit_id,
        }).allowed;
      if (!fwdCheck) {
        res.status(403).json({
          error: 'Forbidden: cannot forward application to Chairman',
          message_bn: 'চেয়ারম্যানের নিকট আবেদন প্রেরণের অনুমতি নেই।',
        });
        return;
      }
      updated.status = 'forwarded_for_approval';
      updated.submitted_by_user_id = actor.id;
      updated.submitted_at = nowIso;
      const fwdNote = sanitizeText(
        b.note || b.secretary_note || `${roleLabelBn} (${actor.name_bn}) কর্তৃক পূর্ণতা যাচাই শেষে চেয়ারম্যানের চূড়ান্ত অনুমোদনের জন্য প্রেরিত।`,
        400
      );
      updated.review_notes = [...(appRecord.review_notes || []), fwdNote];
      store.recordApprovalAction({
        applicationId: appRecord.id,
        unitId: appRecord.administrative_unit_id,
        officerId: actor.id,
        officerRole: actor.role,
        officerNameBn: actor.name_bn,
        officerTitleBn: actor.title_bn,
        decision: 'forwarded',
        notes: fwdNote,
        timestamp: nowIso,
      });
      store.insertNotification({
        mobile: updated.mobile,
        applicationId: appRecord.id,
        unitId: appRecord.administrative_unit_id,
        titleBn: 'চেয়ারম্যানের চূড়ান্ত অনুমোদনের অপেক্ষায়',
        messageBn: `আবেদন (${updated.tracking_no}) যাচাই শেষে ইউপি চেয়ারম্যানের চূড়ান্ত অনুমোদনের জন্য দাখিল করা হয়েছে।`,
      });
    } else {
      if (b.save_as_draft === true) {
        updated.status = 'draft';
      }
      const editNote = sanitizeText(
        b.note || b.secretary_note || `${roleLabelBn} (${actor.name_bn}) কর্তৃক আবেদনের তথ্য হালনাগাদ করা হয়েছে।`,
        400
      );
      updated.review_notes = [...(appRecord.review_notes || []), editNote];
    }

    store.upsertApplication(updated);
    res.json({
      ...updated,
      completeness: {
        is_complete: missingFieldsBn.length === 0,
        missing_fields_bn: missingFieldsBn,
      },
    });
  });

  // Draft Application Preview (Clearly marked as DRAFT before certificate issuance; no final PDF download/print)
  app.get('/api/applications/:id/draft-preview', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    if (!canUserAccessApplicationRecord(ctx, appRecord)) {
      res.status(403).json({
        error: 'Forbidden: cross-institution draft preview denied',
        message_bn: 'অন্য প্রতিষ্ঠানের খসড়া প্রিভিউ দেখার অনুমতি নেই।',
      });
      return;
    }

    const unit = store.getInstitutionById(appRecord.administrative_unit_id);
    const service = store.getServiceById(appRecord.service_id);
    const existingCert = appRecord.certificate_id
      ? store.getCertificateById(appRecord.certificate_id)
      : store.getCertificateByApplicationId(appRecord.id);

    const isIssued = Boolean(existingCert && appRecord.status === 'certificate_issued');
    const missingFieldsBn: string[] = [];
    if (!appRecord.applicant_name_bn?.trim()) missingFieldsBn.push('আবেদনকারীর নাম (বাংলা)');
    if (!appRecord.father_name_bn?.trim()) missingFieldsBn.push('পিতা/স্বামীর নাম');
    if (!appRecord.mother_name_bn?.trim()) missingFieldsBn.push('মাতার নাম');
    if (!appRecord.nid_or_birth_reg?.trim()) missingFieldsBn.push('জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন নম্বর');
    if (!appRecord.mobile?.trim()) missingFieldsBn.push('মোবাইল নম্বর');
    if (!appRecord.village_or_area_bn?.trim()) missingFieldsBn.push('গ্রাম / মহল্লা');

    res.json({
      is_draft: !isIssued,
      draft_label_bn: isIssued
        ? 'চূড়ান্ত অনুমোদিত ও ইস্যুকৃত সনদ'
        : 'খসড়া প্রিভিউ / DRAFT — অফিসিয়াল সনদ নয় (চূড়ান্ত অনুমোদনের পূর্বে ডাউনলোড বা প্রিন্ট নিষিদ্ধ)',
      can_download_final_pdf: isIssued,
      can_print_final_pdf: isIssued,
      application: appRecord,
      institution: unit,
      service,
      completeness: {
        is_complete: missingFieldsBn.length === 0,
        missing_fields_bn: missingFieldsBn,
      },
    });
  });

  // UP Chairman: Return application to UP Secretary for re-verification/preparation
  app.post('/api/applications/:id/return-to-secretary', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const actor = req.actor!;
    const ctx = req.rbacContext!;
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const canReturn =
      authorizeContextPermission(ctx, 'applications.approve', {
        unitId: appRecord.administrative_unit_id,
      }).allowed ||
      authorizeContextPermission(ctx, 'applications.request_correction', {
        unitId: appRecord.administrative_unit_id,
      }).allowed;

    if (!canReturn) {
      res.status(403).json({
        error: 'Forbidden: insufficient authority to return application to Secretary',
        message_bn: 'আবেদনটি সচিবের নিকট ফেরত পাঠানোর অনুমতি আপনার নেই।',
      });
      return;
    }

    const note = sanitizeText(
      req.body?.note || req.body?.reason || 'পুনঃযাচাই ও নথিপত্র পরীক্ষার জন্য ইউপি সচিবের নিকট ফেরত পাঠানো হলো।',
      400
    );
    const nowIso = new Date().toISOString();
    const updated: Application = {
      ...appRecord,
      status: 'under_verification',
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        `চেয়ারম্যান (${actor.name_bn}) কর্তৃক সচিবের নিকট ফেরত প্রেরণ: ${note}`,
      ],
    };
    store.upsertApplication(updated);
    store.recordApprovalAction({
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      officerId: actor.id,
      officerRole: actor.role,
      officerNameBn: actor.name_bn,
      officerTitleBn: actor.title_bn,
      decision: 'under_verification',
      notes: `সচিবের নিকট ফেরত: ${note}`,
      timestamp: nowIso,
    });
    res.json(updated);
  });

  // UP Secretary (for assigned Union) or Citizen resubmits application after correction_required
  app.post('/api/applications/:id/resubmit', (req: AuthedRequest, res: Response) => {
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const isOfficerActor = Boolean(req.actor && req.rbacContext && req.actor.role !== 'citizen');
    if (isOfficerActor) {
      const ctx = req.rbacContext!;
      const canResubmit =
        authorizeContextPermission(ctx, 'applications.edit', {
          unitId: appRecord.administrative_unit_id,
        }).allowed ||
        authorizeContextPermission(ctx, 'applications.submit', {
          unitId: appRecord.administrative_unit_id,
        }).allowed ||
        authorizeContextPermission(ctx, 'applications.forward', {
          unitId: appRecord.administrative_unit_id,
        }).allowed;
      if (!canResubmit) {
        res.status(403).json({
          error: 'Forbidden: cannot resubmit application for another Union',
          message_bn: 'অন্য ইউনিয়নের সংশোধিত আবেদন পুনঃদাখিল করার অনুমতি নেই।',
        });
        return;
      }
    } else {
      if (req.actor && req.rbacContext && req.actor.role === 'citizen') {
        if (!canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
          res.status(403).json({
            error: 'Forbidden: cannot resubmit another citizen application',
            message_bn: 'অন্য নাগরিকের আবেদন পুনঃদাখিল করার অনুমতি নেই।',
          });
          return;
        }
      }
      const { tracking_no } = req.body || {};
      if (!tracking_no || String(tracking_no).trim().toUpperCase() !== appRecord.tracking_no.toUpperCase()) {
        res.status(403).json({
          error: 'Matching tracking number required',
          message_bn: 'সংশোধিত আবেদন পুনঃদাখিল করতে সঠিক ট্র্যাকিং নম্বর প্রয়োজন।',
        });
        return;
      }
    }

    if (appRecord.status !== 'correction_required') {
      res.status(409).json({
        error: 'Application is not awaiting correction',
        message_bn: 'এই আবেদনটি বর্তমানে সংশোধনের জন্য ফেরত পাঠানো অবস্থায় নেই।',
      });
      return;
    }

    const {
      applicant_name_bn,
      father_name_bn,
      mother_name_bn,
      nid_or_birth_reg,
      mobile,
      village_or_area_bn,
      present_address_bn,
      correction_response,
      note,
    } = req.body || {};

    const nowIso = new Date().toISOString();
    const nextStatus: ApplicationStatus = isOfficerActor ? 'forwarded_for_approval' : 'under_verification';
    const responseText = sanitizeText(
      correction_response || note || 'সংশোধিত তথ্য ও কাগজপত্র যাচাইপূর্বক পুনঃদাখিল করা হয়েছে।',
      300
    );
    const updated: Application = {
      ...appRecord,
      applicant_name_bn: applicant_name_bn ? sanitizeText(applicant_name_bn, 160) : appRecord.applicant_name_bn,
      father_name_bn: father_name_bn ? sanitizeText(father_name_bn, 160) : appRecord.father_name_bn,
      mother_name_bn: mother_name_bn ? sanitizeText(mother_name_bn, 160) : appRecord.mother_name_bn,
      nid_or_birth_reg: nid_or_birth_reg ? sanitizeText(nid_or_birth_reg, 40) : appRecord.nid_or_birth_reg,
      mobile: mobile ? sanitizeText(mobile, 25) : appRecord.mobile,
      village_or_area_bn: village_or_area_bn ? sanitizeText(village_or_area_bn, 200) : appRecord.village_or_area_bn,
      present_address_bn: present_address_bn ? sanitizeText(present_address_bn, 300) : appRecord.present_address_bn,
      status: nextStatus,
      submitted_by_user_id: isOfficerActor ? req.actor!.id : appRecord.submitted_by_user_id,
      submitted_at: nowIso,
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        isOfficerActor
          ? `ইউপি সচিব (${req.actor!.name_bn}) কর্তৃক সংশোধনী সম্পন্ন করে চেয়ারম্যান অনুমোদনের জন্য পুনঃদাখিল: ${responseText}`
          : `নাগরিক কর্তৃক সংশোধিত তথ্য পুনঃদাখিল: ${responseText}`,
      ],
    };
    store.upsertApplication(updated);
    if (isOfficerActor) {
      store.recordApprovalAction({
        applicationId: appRecord.id,
        unitId: appRecord.administrative_unit_id,
        officerId: req.actor!.id,
        officerRole: req.actor!.role,
        officerNameBn: req.actor!.name_bn,
        officerTitleBn: req.actor!.title_bn,
        decision: 'forwarded',
        notes: `সংশোধন পরবর্তী পুনঃদাখিল: ${responseText}`,
        timestamp: nowIso,
      });
    }
    store.insertNotification({
      mobile: updated.mobile,
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      titleBn: 'সংশোধিত আবেদন পুনঃদাখিল হয়েছে',
      messageBn: `আবেদন (${updated.tracking_no}) সংশোধনের পর পুনঃদাখিল করা হয়েছে এবং চেয়ারম্যানের অনুমোদনের অপেক্ষায় রয়েছে।`,
    });
    res.json(updated);
  });

  // Upload validated attachment for an application (PDF/JPG/PNG <= 2MB)
  app.post('/api/applications/:id/attachments', (req: AuthedRequest, res: Response) => {
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    if (req.actor && req.rbacContext) {
      if (!canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
        res.status(403).json({ error: 'Forbidden: cannot attach documents to this application' });
        return;
      }
    } else {
      const providedTracking = String(req.body?.tracking_no || req.query?.tracking_no || '')
        .trim()
        .toUpperCase();
      const trackingMatch = Boolean(
        providedTracking && providedTracking === appRecord.tracking_no.toUpperCase()
      );
      const isInitialIntakeWindow =
        (appRecord.status === 'pending_payment' || appRecord.status === 'draft') &&
        Date.now() - new Date(appRecord.created_at).getTime() <= 15 * 60_000;
      if (!trackingMatch && !isInitialIntakeWindow) {
        res.status(403).json({
          error: 'Forbidden: authentication or tracking number required for attachment upload',
          message_bn: 'সংযুক্তি আপলোড করতে লগইন অথবা সঠিক ট্র্যাকিং নম্বর প্রয়োজন।',
        });
        return;
      }
    }

    const { doc_type, original_name, mime_type, content_base64 } = req.body || {};
    if (!original_name || !mime_type || !content_base64) {
      res.status(400).json({
        error: 'Attachment filename, mime_type, and content_base64 are required',
        message_bn: 'নথির নাম, ধরন ও ফাইল কনটেন্ট আবশ্যক।',
      });
      return;
    }
    if (!ALLOWED_ATTACHMENT_MIMES.has(String(mime_type))) {
      res.status(400).json({
        error: 'Unsupported file type; only PDF, JPG, and PNG allowed',
        message_bn: 'শুধুমাত্র PDF, JPG অথবা PNG ফরম্যাটের ফাইল আপলোড করা যাবে।',
      });
      return;
    }

    const rawBase64 = String(content_base64).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({
        error: 'File size must be between 1 byte and 2 MB',
        message_bn: 'ফাইলের আকার সর্বোচ্চ ২ মেগাবাইটের মধ্যে হতে হবে।',
      });
      return;
    }

    // Validate actual binary magic bytes match declared MIME type
    const isPdfMagic = buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    const isPngMagic =
      buffer.byteLength >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;
    const isJpegMagic =
      buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    const mimeStr = String(mime_type);
    const magicMatches =
      (mimeStr === 'application/pdf' && isPdfMagic) ||
      (mimeStr === 'image/png' && isPngMagic) ||
      (mimeStr === 'image/jpeg' && isJpegMagic);
    if (!magicMatches) {
      res.status(400).json({
        error: 'File content signature does not match declared MIME type',
        message_bn: 'ফাইলের ভেতরের ফরম্যাট ও ঘোষিত ধরনের মধ্যে অমিল রয়েছে। বৈধ PDF, JPG বা PNG আপলোড করুন।',
      });
      return;
    }

    const safeExt =
      mime_type === 'application/pdf' ? '.pdf' : mime_type === 'image/png' ? '.png' : '.jpg';
    const attId = `att_${crypto.randomUUID()}`;
    const dir = path.join(getAttachmentStorageRoot(), appRecord.administrative_unit_id, appRecord.id);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${attId}${safeExt}`);
    fs.writeFileSync(filePath, buffer);

    const safeName = path.basename(sanitizeText(original_name, 120)) || `document${safeExt}`;
    const att: ApplicationAttachment & { storage_path: string } = {
      id: attId,
      application_id: appRecord.id,
      doc_type: ['nid', 'photo', 'proof'].includes(doc_type) ? doc_type : 'other',
      original_name: safeName,
      mime_type: String(mime_type),
      size_bytes: buffer.byteLength,
      storage_path: filePath,
      uploaded_at: new Date().toISOString(),
    };
    store.insertAttachment(att);
    const { storage_path: _sp, ...publicMeta } = att;
    res.status(201).json(publicMeta);
  });

  app.get('/api/attachments/:id', (req: AuthedRequest, res: Response) => {
    const att = store.getAttachmentWithPath(req.params.id);
    if (!att) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const appRecord = store.getApplicationByIdOrTracking(att.application_id);
    if (!appRecord) {
      res.status(404).json({ error: 'Linked application not found' });
      return;
    }
    const trackingParam =
      typeof req.query.tracking_no === 'string' ? req.query.tracking_no.trim().toUpperCase() : '';
    const hasAnonTrackingMatch = !req.actor && Boolean(trackingParam && appRecord.tracking_no.toUpperCase() === trackingParam);
    const hasRbacAccess = Boolean(
      req.actor && req.rbacContext && canUserAccessApplicationRecord(req.rbacContext, appRecord)
    );

    if (!hasRbacAccess && !hasAnonTrackingMatch) {
      res.status(403).json({
        error: 'Forbidden: attachment access denied',
        message_bn: 'এই নাগরিক নথিপত্র দেখার অনুমতি আপনার নেই।',
      });
      return;
    }
    if (!fs.existsSync(att.storage_path)) {
      res.status(404).json({ error: 'Attachment file missing' });
      return;
    }
    res.setHeader('Content-Type', att.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${att.original_name.replace(/"/g, '')}"`);
    fs.createReadStream(att.storage_path).pipe(res);
  });

  // Assign application to an officer within the same institution
  app.post('/api/applications/:id/assign', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const actor = req.actor!;
    const ctx = req.rbacContext!;
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const permCheck = authorizeContextPermission(ctx, 'applications.assign', {
      unitId: appRecord.administrative_unit_id,
      wardNo: appRecord.ward_no,
      department: mapServiceDepartment(appRecord.service_id),
    });
    if (!permCheck.allowed) {
      res.status(403).json({
        error: permCheck.reason || 'Forbidden: cross-institution assignment denied',
        message_bn: permCheck.reasonBn || 'অন্য প্রতিষ্ঠানের আবেদনে কর্মকর্তা নিয়োগের অনুমতি নেই।',
      });
      return;
    }

    const { staff_id, officer_name_bn } = req.body || {};
    let assigneeName = sanitizeText(officer_name_bn, 120);
    let assigneeId = staff_id ? String(staff_id) : undefined;
    if (staff_id) {
      const staff = store.getStaffById(String(staff_id));
      if (!staff || staff.administrative_unit_id !== appRecord.administrative_unit_id) {
        res.status(400).json({
          error: 'Selected staff does not belong to this institution',
          message_bn: 'নির্বাচিত কর্মকর্তা এই প্রতিষ্ঠানের অন্তর্ভুক্ত নন।',
        });
        return;
      }
      assigneeName = staff.name_bn;
      assigneeId = staff.id;
    }

    if (!assigneeName) {
      res.status(400).json({ error: 'Officer name or staff_id required' });
      return;
    }

    const nowIso = new Date().toISOString();
    const updated: Application = {
      ...appRecord,
      assigned_officer: assigneeName,
      assigned_officer_id: assigneeId,
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        `দায়িত্ব বণ্টন (${actor.name_bn}): ${assigneeName} কে যাচাইয়ের দায়িত্ব অর্পণ করা হয়েছে।`,
      ],
    };
    store.upsertApplication(updated);
    store.recordApprovalAction({
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      officerId: actor.id,
      officerRole: actor.role,
      officerNameBn: actor.name_bn,
      officerTitleBn: actor.title_bn,
      decision: 'assigned',
      notes: `দায়িত্বপ্রাপ্ত কর্মকর্তা: ${assigneeName}`,
      timestamp: nowIso,
    });
    res.json(updated);
  });

  // Request correction (Chairman-only final review action for assigned Union)
  app.post('/api/applications/:id/request-correction', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const actor = req.actor!;
    const ctx = req.rbacContext!;
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const permCheck = authorizeContextPermission(ctx, 'applications.request_correction', {
      unitId: appRecord.administrative_unit_id,
      wardNo: appRecord.ward_no,
      department: mapServiceDepartment(appRecord.service_id),
      assignedOfficerId: appRecord.assigned_officer_id,
      assignedOfficerName: appRecord.assigned_officer,
    });
    const approvePermCheck = authorizeContextPermission(ctx, 'applications.approve', {
      unitId: appRecord.administrative_unit_id,
    });
    if (!permCheck.allowed || !approvePermCheck.allowed) {
      res.status(403).json({
        error: permCheck.reason || 'Forbidden: only the assigned UP Chairman can request correction',
        message_bn: permCheck.reasonBn || 'কেবল সংশ্লিষ্ট ইউনিয়নের চেয়ারম্যান আবেদন সংশোধনের নির্দেশনা দিতে পারবেন।',
      });
      return;
    }

    const reason = sanitizeText(req.body?.reason || req.body?.note || 'তথ্য বা সংযুক্ত নথিতে সংশোধন প্রয়োজন।', 400);
    const nowIso = new Date().toISOString();
    const updated: Application = {
      ...appRecord,
      status: 'correction_required',
      correction_note: reason,
      decision_reason: reason,
      final_approver_user_id: actor.id,
      assigned_officer: appRecord.assigned_officer || actor.name_bn,
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        `চেয়ারম্যান কর্তৃক সংশোধন অনুরোধ (${actor.name_bn}): ${reason}`,
      ],
    };
    store.upsertApplication(updated);
    store.recordApprovalAction({
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      officerId: actor.id,
      officerRole: actor.role,
      officerNameBn: actor.name_bn,
      officerTitleBn: actor.title_bn,
      decision: 'correction_required',
      notes: reason,
      timestamp: nowIso,
    });
    store.insertNotification({
      mobile: appRecord.mobile,
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      titleBn: 'আবেদন সংশোধনের নির্দেশনা',
      messageBn: `আপনার আবেদন (${appRecord.tracking_no}) সংশোধনের জন্য ফেরত পাঠানো হয়েছে। কারণ: ${reason}`,
    });
    res.json(updated);
  });

  const handleStatusOrRejectTransition = (req: AuthedRequest, res: Response, forcedStatus?: string) => {
    const actor = req.actor!;
    const ctx = req.rbacContext!;
    const status = forcedStatus || req.body?.status;
    const { note, assigned_officer } = req.body || {};
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    if (status === 'certificate_issued' || status === 'approved') {
      res.status(400).json({
        error: 'Use /api/applications/:id/final-approve for final approval and certificate issuance',
        message_bn: 'চূড়ান্ত অনুমোদন ও সনদ ইস্যুর জন্য অনুমোদিত ফাইনাল-অ্যাপ্রুভ ধাপ ব্যবহার করুন।',
      });
      return;
    }

    const permissionByStatus: Record<string, PermissionKey> = {
      under_verification: 'applications.verify',
      forwarded_for_approval: 'applications.forward',
      correction_required: 'applications.request_correction',
      rejected: 'applications.reject',
    };
    const requiredPerm = permissionByStatus[String(status)];
    if (!requiredPerm) {
      res.status(400).json({ error: 'Invalid status transition' });
      return;
    }

    const targetContext = {
      unitId: appRecord.administrative_unit_id,
      wardNo: appRecord.ward_no,
      department: mapServiceDepartment(appRecord.service_id),
      assignedOfficerId: appRecord.assigned_officer_id,
      assignedOfficerName: appRecord.assigned_officer,
      ownerUserId: appRecord.created_by_user_id,
    };
    let permCheck = authorizeContextPermission(ctx, requiredPerm, targetContext);
    if (!permCheck.allowed && status === 'forwarded_for_approval') {
      const recCheck = authorizeContextPermission(ctx, 'applications.recommend', targetContext);
      if (recCheck.allowed) {
        permCheck = recCheck;
      }
    }

    // Strictly enforce Chairman-only authority for rejection and correction_required
    if (status === 'rejected' || status === 'correction_required') {
      const chairmanCheck = authorizeContextPermission(ctx, 'applications.approve', {
        unitId: appRecord.administrative_unit_id,
      });
      if (!chairmanCheck.allowed) {
        permCheck = chairmanCheck;
      }
    }

    if (!permCheck.allowed) {
      res.status(403).json({
        error: permCheck.reason || 'Forbidden: status transition not allowed for current role/scope',
        message_bn: permCheck.reasonBn || 'আপনার বর্তমান পদবি বা নির্ধারিত পরিধি থেকে এই ধাপের অনুমতি নেই।',
      });
      return;
    }

    if (status === 'rejected') {
      const rawReason = String(note ?? req.body?.reason ?? '').trim();
      if (!rawReason) {
        res.status(400).json({
          error: 'Mandatory rejection reason required',
          message_bn: 'আবেদন বাতিলের ক্ষেত্রে সুনির্দিষ্ট কারণ উল্লেখ করা আবশ্যক।',
        });
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const cleanNote = sanitizeText(
      note || req.body?.reason || `কর্মকর্তা (${actor.name_bn}) কর্তৃক অবস্থা পরিবর্তন: ${status}`,
      400
    );
    const updated: Application = {
      ...appRecord,
      status: status as ApplicationStatus,
      updated_at: nowIso,
      assigned_officer: assigned_officer || actor.name_bn,
      correction_note: status === 'correction_required' ? cleanNote : appRecord.correction_note,
      rejection_reason: status === 'rejected' ? cleanNote : appRecord.rejection_reason,
      decision_reason:
        status === 'rejected' || status === 'correction_required' ? cleanNote : appRecord.decision_reason,
      final_approver_user_id:
        status === 'rejected' || status === 'correction_required' ? actor.id : appRecord.final_approver_user_id,
      rejected_at: status === 'rejected' ? nowIso : appRecord.rejected_at,
      submitted_by_user_id:
        status === 'forwarded_for_approval' ? actor.id : appRecord.submitted_by_user_id,
      submitted_at: status === 'forwarded_for_approval' ? nowIso : appRecord.submitted_at,
      review_notes: [...(appRecord.review_notes || []), cleanNote],
    };
    store.upsertApplication(updated);

    const decisionMap: Record<string, 'under_verification' | 'correction_required' | 'forwarded' | 'rejected'> = {
      under_verification: 'under_verification',
      correction_required: 'correction_required',
      forwarded_for_approval: 'forwarded',
      rejected: 'rejected',
    };
    store.recordApprovalAction({
      applicationId: appRecord.id,
      unitId: appRecord.administrative_unit_id,
      officerId: actor.id,
      officerRole: actor.role,
      officerNameBn: actor.name_bn,
      officerTitleBn: actor.title_bn,
      decision: decisionMap[status],
      notes: cleanNote,
      timestamp: nowIso,
    });

    if (status === 'rejected' || status === 'correction_required' || status === 'forwarded_for_approval') {
      store.insertNotification({
        mobile: appRecord.mobile,
        applicationId: appRecord.id,
        unitId: appRecord.administrative_unit_id,
        titleBn:
          status === 'rejected'
            ? 'আবেদন বাতিল করা হয়েছে'
            : status === 'correction_required'
            ? 'আবেদন সংশোধনের নির্দেশনা'
            : 'চেয়ারম্যান অনুমোদনের অপেক্ষায়',
        messageBn: `আবেদন নং ${appRecord.tracking_no}: ${cleanNote}`,
      });
    }

    res.json(updated);
  };

  app.patch('/api/applications/:id/status', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    handleStatusOrRejectTransition(req, res);
  });

  app.post('/api/applications/:id/reject', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    handleStatusOrRejectTransition(req, res, 'rejected');
  });

  app.get('/api/applications/:id/history', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const appRecord = store.getApplicationByIdOrTracking(req.params.id);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    if (!canUserAccessApplicationRecord(req.rbacContext!, appRecord)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({
      approvals: store.getApplicationApprovals(appRecord.id),
      events: store.getCertificateEvents(undefined, undefined, appRecord.id),
    });
  });

  // --- Payment Checkout ---
  app.post('/api/payments/checkout', (req: AuthedRequest, res: Response) => {
    const { applicationId, method, amount } = req.body || {};
    if (!applicationId || typeof applicationId !== 'string') {
      res.status(400).json({
        error: 'applicationId is required',
        message_bn: 'পেমেন্ট সম্পন্ন করতে সঠিক আবেদন আইডি প্রয়োজন।',
      });
      return;
    }

    const cleanMethod = String(method || 'bkash').toLowerCase();
    if (!['bkash', 'nagad', 'rocket', 'card'].includes(cleanMethod)) {
      res.status(400).json({
        error: 'Unsupported payment method',
        message_bn: 'অসমর্থিত পেমেন্ট মাধ্যম। bKash, Nagad, Rocket বা Card নির্বাচন করুন।',
      });
      return;
    }

    const appRecord = store.getApplicationByIdOrTracking(applicationId);
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found for payment', message_bn: 'আবেদনটি খুঁজে পাওয়া যায়নি।' });
      return;
    }

    if (req.actor?.role === 'citizen' && req.rbacContext && !canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
      res.status(403).json({
        error: 'Forbidden: cannot pay for another citizen application',
        message_bn: 'অন্য নাগরিকের আবেদনের ফি পরিশোধ করার অনুমতি নেই।',
      });
      return;
    }

    if (['rejected', 'cancelled', 'refunded'].includes(appRecord.status)) {
      res.status(409).json({
        error: `Cannot process payment for application in status ${appRecord.status}`,
        message_bn: 'বাতিল বা প্রত্যাখ্যাত আবেদনের বিপরীতে পেমেন্ট গ্রহণযোগ্য নয়।',
      });
      return;
    }

    if (appRecord.payment_status === 'paid') {
      res.status(409).json({
        error: 'Payment already completed for this application',
        message_bn: 'এই আবেদনের ফি ইতোমধ্যেই পরিশোধ করা হয়েছে।',
      });
      return;
    }

    const authoritativeAmount = Number(appRecord.fee_amount) || 0;
    if (amount !== undefined && amount !== null) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0 || (authoritativeAmount > 0 && numericAmount === 0)) {
        res.status(400).json({
          error: `Invalid payment amount: expected ${authoritativeAmount}`,
          message_bn: `নির্ধারিত সরকারি ফি ৳${authoritativeAmount} এর পরিপন্থী পরিমাণ গ্রহণযোগ্য নয়।`,
        });
        return;
      }
    }

    const trxPrefix =
      cleanMethod === 'bkash' ? 'BKS' : cleanMethod === 'nagad' ? 'NGD' : cleanMethod === 'rocket' ? 'RKT' : 'CRD';
    const trxId = `${trxPrefix}${crypto.randomInt(10000000, 99999999)}`;
    const paidAt = new Date().toISOString();

    const updated: Application = {
      ...appRecord,
      payment_status: 'paid',
      status: appRecord.status === 'pending_payment' ? 'paid' : appRecord.status,
      payment_method: cleanMethod as Application['payment_method'],
      transaction_id: trxId,
      paid_at: paidAt,
      updated_at: paidAt,
      review_notes: [
        ...(appRecord.review_notes || []),
        `অনলাইন ফি ৳${authoritativeAmount} সফলভাবে পরিশোধিত (${cleanMethod.toUpperCase()}, TrxID: ${trxId})`,
      ],
    };
    store.upsertApplication(updated);

    res.json({
      success: true,
      transaction_id: trxId,
      amount: authoritativeAmount,
      paid_at: paidAt,
      application: updated,
    });
  });

  // --- Final Approval & Automatic QR/PDF Certificate Issuance ---
  const handleFinalApprove = async (req: AuthedRequest, res: Response) => {
    try {
      const result = await approveAndIssueCertificate({
        applicationId: req.params.id,
        actor: req.actor!,
        notes: req.body?.notes || req.body?.note,
        expiresInDays:
          typeof req.body?.expires_in_days === 'number' ? req.body.expires_in_days : undefined,
      });
      res.status(result.already_issued ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.statusCode).json({
          error: err.message,
          message_bn: err.messageBn,
        });
        return;
      }
      console.error('Final approval error:', err);
      res.status(500).json({
        error: 'Certificate issuance failed',
        message_bn: 'সনদপত্র প্রস্তুতকরণে কারিগরি ত্রুটি হয়েছে।',
      });
    }
  };

  app.post('/api/applications/:id/final-approve', requireFinalApproverMiddleware, handleFinalApprove);
  app.post('/api/applications/:id/issue-certificate', requireFinalApproverMiddleware, handleFinalApprove);

  // --- Certificate Registry, Export, Filter/Sort/Paginate, Revocation, Reissue & PDF Download ---
  function filterAndSortCertificates(req: Request, unitScope?: string, ctx?: ActorRbacContext | null): Certificate[] {
    let items = store.getCertificates(unitScope);

    if (ctx) {
      items = items.filter((c) => {
        const linkedApp = store.getApplicationByIdOrTracking(c.application_id);
        return authorizeContextPermission(ctx, 'certificates.view', {
          unitId: c.administrative_unit_id,
          wardNo: linkedApp?.ward_no,
          department: mapServiceDepartment(c.service_id),
          assignedOfficerId: linkedApp?.assigned_officer_id,
          assignedOfficerName: linkedApp?.assigned_officer,
          ownerUserId: linkedApp?.created_by_user_id,
          ownerMobile: linkedApp?.mobile,
        }).allowed;
      });
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const serviceId = typeof req.query.service_id === 'string' ? req.query.service_id : '';
    const dateFrom = typeof req.query.date_from === 'string' ? req.query.date_from : '';
    const dateTo = typeof req.query.date_to === 'string' ? req.query.date_to : '';
    const sortBy = typeof req.query.sort_by === 'string' ? req.query.sort_by : 'issued_at';
    const sortDir = req.query.sort_dir === 'asc' ? 1 : -1;

    if (q) {
      items = items.filter(
        (c) =>
          (c.certificate_number || c.certificate_no).toLowerCase().includes(q) ||
          c.applicant_name_bn.toLowerCase().includes(q) ||
          c.certificate_title_bn.toLowerCase().includes(q) ||
          (c.application_tracking_no || '').toLowerCase().includes(q) ||
          (c.issuing_unit_bn || '').toLowerCase().includes(q) ||
          c.officer_name_bn.toLowerCase().includes(q)
      );
    }
    if (status && status !== 'all') {
      items = items.filter((c) => c.status === status);
    }
    if (serviceId && serviceId !== 'all') {
      items = items.filter((c) => c.service_id === serviceId);
    }
    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime();
      if (Number.isFinite(fromTs)) {
        items = items.filter((c) => new Date(c.issued_at || 0).getTime() >= fromTs);
      }
    }
    if (dateTo) {
      const toTs = new Date(dateTo).getTime() + 86400_000;
      if (Number.isFinite(toTs)) {
        items = items.filter((c) => new Date(c.issued_at || 0).getTime() <= toTs);
      }
    }

    items.sort((a, b) => {
      if (sortBy === 'applicant_name_bn') {
        return a.applicant_name_bn.localeCompare(b.applicant_name_bn) * sortDir;
      }
      if (sortBy === 'certificate_number') {
        return (a.certificate_number || '').localeCompare(b.certificate_number || '') * sortDir;
      }
      if (sortBy === 'status') {
        return a.status.localeCompare(b.status) * sortDir;
      }
      const ta = new Date(a.issued_at || a.approved_at || 0).getTime();
      const tb = new Date(b.issued_at || b.approved_at || 0).getTime();
      return (ta - tb) * sortDir;
    });

    return items.map(sanitizeCertificateForResponse);
  }

  app.get('/api/certificates', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const certCheck = authorizeContextPermission(ctx, 'certificates.view', { unitId: requestedUnit });
    if (!certCheck.allowed) {
      res.status(403).json({
        error: certCheck.reason || 'Forbidden: cross-institution access denied',
        message_bn: certCheck.reasonBn || 'অন্য প্রতিষ্ঠানের সনদ তালিকা দেখার অনুমতি নেই।',
      });
      return;
    }

    const effectiveUnit = hasBroadUnitScope(ctx, 'certificates.view')
      ? requestedUnit
      : ctx.assignedInstitutions[0];
    const filtered = filterAndSortCertificates(req, effectiveUnit, ctx);

    if (req.query.paginated === '1') {
      const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.page_size || '10'), 10) || 10));
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const safePage = Math.min(page, totalPages);
      const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
      res.json({
        items: paged,
        total,
        page: safePage,
        page_size: pageSize,
        total_pages: totalPages,
      });
      return;
    }

    res.json(filtered);
  });

  app.get('/api/certificates/export', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const viewOk = authorizeContextPermission(ctx, 'certificates.view', { unitId: requestedUnit });
    const exportOk =
      authorizeContextPermission(ctx, 'applications.export', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'reports.export', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'certificates.download', { unitId: requestedUnit }).allowed;

    if (!viewOk.allowed || !exportOk) {
      res.status(403).json({
        error: 'Forbidden: certificate export permission denied',
        message_bn: 'সনদ রেজিস্ট্রি এক্সপোর্ট করার অনুমতি আপনার নেই।',
      });
      return;
    }

    const effectiveUnit = hasBroadUnitScope(ctx, 'certificates.view')
      ? requestedUnit
      : ctx.assignedInstitutions[0];
    const items = filterAndSortCertificates(req, effectiveUnit, ctx);

    const header = [
      'Certificate No',
      'Application No',
      'Applicant Name',
      'Certificate Type',
      'Issuing Institution',
      'Submitted At',
      'Approved At',
      'Issued At',
      'Status',
      'Assigned Officer',
    ];
    const rows = items.map((c) => [
      escapeCsvCell(c.certificate_number || c.certificate_no),
      escapeCsvCell(c.application_tracking_no || c.application_id),
      escapeCsvCell(c.applicant_name_bn),
      escapeCsvCell(c.certificate_title_bn),
      escapeCsvCell(c.issuing_unit_bn || c.administrative_unit_id),
      escapeCsvCell(c.application_created_at || ''),
      escapeCsvCell(c.approved_at || ''),
      escapeCsvCell(c.issued_at || ''),
      escapeCsvCell(c.status),
      escapeCsvCell(c.assigned_officer || c.officer_name_bn),
    ]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const filename = `PottoyonBD_Certificates_Export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  });

  app.post('/api/certificates/:id/revoke', requireFinalApproverMiddleware, async (req: AuthedRequest, res: Response) => {
    try {
      const updated = await revokeCertificate({
        certificateId: req.params.id,
        actor: req.actor!,
        reason: String(req.body?.reason || ''),
      });
      res.json({
        success: true,
        certificate: updated,
      });
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.statusCode).json({
          error: err.message,
          message_bn: err.messageBn,
        });
        return;
      }
      console.error('Revocation error:', err);
      res.status(500).json({ error: 'Revocation failed' });
    }
  });

  app.post('/api/certificates/:id/reissue', requireFinalApproverMiddleware, async (req: AuthedRequest, res: Response) => {
    try {
      const result = await reissueCertificate({
        certificateId: req.params.id,
        actor: req.actor!,
        notes: req.body?.notes || req.body?.reason,
        expiresInDays:
          typeof req.body?.expires_in_days === 'number' ? req.body.expires_in_days : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.statusCode).json({
          error: err.message,
          message_bn: err.messageBn,
        });
        return;
      }
      console.error('Reissue error:', err);
      res.status(500).json({
        error: 'Certificate reissue failed',
        message_bn: 'সনদ পুনঃইস্যু করতে সমস্যা হয়েছে।',
      });
    }
  });

  app.get('/api/certificates/:id/history', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const cert = store.getCertificateById(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }
    const appRecord = store.getApplicationByIdOrTracking(cert.application_id);
    const check = authorizeContextPermission(req.rbacContext!, 'certificates.view', {
      unitId: cert.administrative_unit_id,
      wardNo: appRecord?.ward_no,
      department: mapServiceDepartment(cert.service_id),
      assignedOfficerId: appRecord?.assigned_officer_id,
      assignedOfficerName: appRecord?.assigned_officer,
    });
    if (!check.allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({
      events: store.getCertificateEvents(undefined, undefined, cert.application_id),
      approvals: store.getApplicationApprovals(cert.application_id),
      verification_logs: store.getVerificationLogs(undefined, cert.id),
    });
  });

  app.get('/api/certificates/:id', (req: AuthedRequest, res: Response) => {
    const cert = store.getCertificateById(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }

    const trackingParam =
      typeof req.query.tracking_no === 'string' ? req.query.tracking_no.trim().toUpperCase() : '';
    const appRecord = store.getApplicationByIdOrTracking(cert.application_id);
    const hasAnonTrackingMatch = !req.actor && Boolean(
      appRecord && trackingParam && appRecord.tracking_no.toUpperCase() === trackingParam
    );

    const hasRbacAccess = Boolean(
      req.actor &&
      req.rbacContext &&
      authorizeContextPermission(req.rbacContext, 'certificates.view', {
        unitId: cert.administrative_unit_id,
        wardNo: appRecord?.ward_no,
        department: mapServiceDepartment(cert.service_id),
        assignedOfficerId: appRecord?.assigned_officer_id,
        assignedOfficerName: appRecord?.assigned_officer,
        ownerUserId: appRecord?.created_by_user_id,
        ownerMobile: appRecord?.mobile,
      }).allowed
    );

    if (!hasRbacAccess && !hasAnonTrackingMatch) {
      res.status(403).json({
        error: 'Forbidden: authorized officer or matching tracking number required',
        message_bn: 'পূর্ণাঙ্গ সনদপত্র দেখতে অনুমোদিত কর্মকর্তা লগইন অথবা সঠিক ট্র্যাকিং নম্বর প্রয়োজন।',
      });
      return;
    }

    res.json(sanitizeCertificateForResponse(cert));
  });

  app.get('/api/certificates/:id/pdf', async (req: AuthedRequest, res: Response) => {
    const cert = store.getCertificateById(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found', message_bn: 'সনদটি খুঁজে পাওয়া যায়নি।' });
      return;
    }

    const trackingParam =
      typeof req.query.tracking_no === 'string' ? req.query.tracking_no.trim().toUpperCase() : '';
    const appRecord = store.getApplicationByIdOrTracking(cert.application_id);
    const hasAnonTrackingMatch = !req.actor && Boolean(
      appRecord && trackingParam && appRecord.tracking_no.toUpperCase() === trackingParam
    );

    const target = {
      unitId: cert.administrative_unit_id,
      wardNo: appRecord?.ward_no,
      department: mapServiceDepartment(cert.service_id),
      assignedOfficerId: appRecord?.assigned_officer_id,
      assignedOfficerName: appRecord?.assigned_officer,
      ownerUserId: appRecord?.created_by_user_id,
      ownerMobile: appRecord?.mobile,
    };

    const hasRbacDownload = Boolean(
      req.actor &&
      req.rbacContext &&
      (authorizeContextPermission(req.rbacContext, 'certificates.download', target).allowed ||
        (req.query.inline === '1' && authorizeContextPermission(req.rbacContext, 'certificates.preview', target).allowed))
    );

    if (!hasRbacDownload && !hasAnonTrackingMatch) {
      res.status(403).json({
        error: 'Forbidden: PDF download requires authorized permission or citizen ownership',
        message_bn: 'অফিসিয়াল পিডিএফ ডাউনলোডের জন্য অনুমোদন প্রয়োজন।',
      });
      return;
    }

    const orientation = req.query.orientation === 'landscape' ? 'landscape' : 'portrait';

    let pdfPath: string;
    try {
      pdfPath = await ensureCertificatePdfFile(cert.id, { orientation });
    } catch (err) {
      if (err instanceof ServiceError) {
        res.status(err.statusCode).json({ error: err.message, message_bn: err.messageBn });
        return;
      }
      console.error('Certificate PDF regeneration error:', err);
      res.status(500).json({
        error: 'Certificate PDF could not be generated',
        message_bn: 'সনদের পিডিএফ ফাইল তৈরি করা যায়নি। পুনরায় চেষ্টা করুন।',
      });
      return;
    }

    if (!isValidPdfFile(pdfPath)) {
      res.status(500).json({
        error: 'Generated certificate PDF failed integrity validation',
        message_bn: 'প্রস্তুতকৃত পিডিএফ ফাইলটি বৈধ ফরম্যাটে নেই।',
      });
      return;
    }

    const stat = fs.statSync(pdfPath);
    const service = store.getServiceById(cert.service_id);
    const filename = buildMeaningfulPdfFilename(cert, service?.name_en, appRecord?.tracking_no);
    const dispositionType = req.query.inline === '1' ? 'inline' : 'attachment';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `${dispositionType}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(pdfPath);
    stream.on('error', (streamErr) => {
      console.error('PDF stream error:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Failed to stream PDF file',
          message_bn: 'পিডিএফ ফাইল পাঠাতে কারিগরি ত্রুটি হয়েছে।',
        });
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  });

  // --- Audit & Verification Logs ---
  app.get('/api/certificates/:id/events', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const cert = store.getCertificateById(req.params.id);
    if (!cert) {
      res.status(404).json({ error: 'Certificate not found' });
      return;
    }
    const check = authorizeContextPermission(req.rbacContext!, 'certificates.view', {
      unitId: cert.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: 'Forbidden: cross-institution audit access denied' });
      return;
    }
    res.json(store.getCertificateEvents(cert.id));
  });

  app.get('/api/audit-logs', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const check = authorizeContextPermission(ctx, 'audit_logs.view', { unitId: requestedUnit });
    if (!check.allowed) {
      res.status(403).json({
        error: check.reason || 'Forbidden: audit logs view permission required',
        message_bn: check.reasonBn || 'অডিট লগ দেখার অনুমতি আপনার নেই।',
      });
      return;
    }

    const unitScope = hasBroadUnitScope(ctx, 'audit_logs.view')
      ? requestedUnit
      : ctx.assignedInstitutions[0];

    res.json({
      events: store.getCertificateEvents(undefined, unitScope),
      verification_logs: store.getVerificationLogs(unitScope),
      approvals: store
        .getApplicationApprovals()
        .filter((a) => !unitScope || a.administrative_unit_id === unitScope),
    });
  });

  // --- Notifications ---
  app.get('/api/notifications', (req: AuthedRequest, res: Response) => {
    const trackingNo =
      typeof req.query.tracking_no === 'string' ? req.query.tracking_no.trim() : undefined;
    const applicationId =
      typeof req.query.application_id === 'string' ? req.query.application_id.trim() : undefined;

    if (trackingNo) {
      const appRecord = store.getApplicationByIdOrTracking(trackingNo);
      if (req.actor && req.actor.role === 'citizen' && req.rbacContext && appRecord) {
        if (!canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
      res.json(appRecord ? store.getNotifications({ applicationId: appRecord.id }) : []);
      return;
    }

    if (applicationId) {
      const appRecord = store.getApplicationByIdOrTracking(applicationId);
      if (req.actor && req.rbacContext && appRecord && !canUserAccessApplicationRecord(req.rbacContext, appRecord)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json(store.getNotifications({ applicationId }));
      return;
    }

    if (req.actor && req.rbacContext && req.actor.role !== 'citizen') {
      const unitScope = hasBroadUnitScope(req.rbacContext, 'dashboard.view')
        ? undefined
        : req.rbacContext.assignedInstitutions[0];
      res.json(store.getNotifications({ unitId: unitScope }));
      return;
    }

    res.status(401).json({ error: 'Officer session or tracking_no required' });
  });

  // --- Public Rate-Limited Real-Time Certificate Verification ---
  app.get('/api/verify/:token', (req: Request, res: Response) => {
    const ip = extractClientIp(req);
    const rate = checkVerifyRateLimit(ip);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({
        verified: false,
        status: 'invalid',
        error: 'Rate limit exceeded',
        message_bn: `অতিরিক্ত যাচাই অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে ${rate.retryAfterSec} সেকেন্ড পর পুনরায় চেষ্টা করুন।`,
      });
      return;
    }

    const result = verifyCertificateByToken({
      rawToken: req.params.token,
      ipAddress: ip,
      userAgent: String(req.headers['user-agent'] || 'unknown'),
    });

    res.status(result.httpStatus).json(result.body);
  });

  // --- Holding Taxes, Trade Licenses, Notices ---
  app.get('/api/holding-taxes', (req: AuthedRequest, res: Response) => {
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    if (req.actor && req.rbacContext) {
      const check = authorizeContextPermission(req.rbacContext, 'payments.view', { unitId: requestedUnit });
      if (!check.allowed) {
        res.status(403).json({ error: check.reason || 'Forbidden: financial tax registry denied' });
        return;
      }
      const effectiveUnit = hasBroadUnitScope(req.rbacContext, 'payments.view')
        ? requestedUnit
        : req.rbacContext.assignedInstitutions[0];
      res.json(store.getHoldingTaxes(effectiveUnit));
      return;
    }
    res.json(store.getHoldingTaxes(requestedUnit));
  });

  app.post('/api/holding-taxes', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = b.administrative_unit_id
      ? String(b.administrative_unit_id)
      : hasBroadUnitScope(ctx, 'payments.reconcile')
        ? 'unit_goyeshpur'
        : ctx.assignedInstitutions[0];

    const check = authorizeContextPermission(ctx, 'payments.reconcile', { unitId: targetUnit });
    if (!check.allowed) {
      res.status(403).json({
        error: check.reason || 'Forbidden: insufficient financial permissions',
        message_bn: check.reasonBn || 'হোল্ডিং ট্যাক্স এন্ট্রি করার অনুমতি আপনার নেই।',
      });
      return;
    }
    if (!b.holding_no || !b.owner_name_bn) {
      res.status(400).json({ error: 'holding_no and owner_name_bn required' });
      return;
    }
    const annualTax = Number(b.annual_tax) || 500;
    const record: HoldingTaxRecord = {
      id: `ht_${crypto.randomUUID().slice(0, 8)}`,
      administrative_unit_id: targetUnit,
      holding_no: sanitizeText(b.holding_no, 40),
      ward_no: Number(b.ward_no) || 1,
      owner_name_bn: sanitizeText(b.owner_name_bn, 120),
      owner_mobile: sanitizeText(b.owner_mobile || '01700-000000', 30),
      village_bn: sanitizeText(b.village_bn || 'সদর', 120),
      structure_type: sanitizeText(b.structure_type || 'আধাপাকা বসতবাড়ি', 80),
      annual_assessment: annualTax * 12,
      annual_tax: annualTax,
      arrears: Number(b.arrears) || 0,
      current_due: annualTax + (Number(b.arrears) || 0),
      fiscal_year: '২০২৫-২০২৬',
      status: 'due',
    };
    store.upsertHoldingTax(record);
    res.status(201).json(record);
  });

  app.post('/api/holding-taxes/:id/pay', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const record = store.getHoldingTaxById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Holding tax record not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'payments.reconcile', {
      unitId: record.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden: payment reconciliation denied' });
      return;
    }
    const payAmount =
      typeof req.body?.amount === 'number' && req.body.amount > 0 ? req.body.amount : record.current_due;
    const remaining = Math.max(0, record.current_due - payAmount);
    const updated: HoldingTaxRecord = {
      ...record,
      current_due: remaining,
      arrears: remaining > 0 ? remaining : 0,
      last_paid_at: new Date().toISOString().slice(0, 10),
      status: remaining === 0 ? 'paid' : 'partial',
    };
    store.upsertHoldingTax(updated);
    res.json(updated);
  });

  app.get('/api/trade-licenses', (req: AuthedRequest, res: Response) => {
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    if (req.actor && req.rbacContext) {
      const check =
        authorizeContextPermission(req.rbacContext, 'payments.view', { unitId: requestedUnit }).allowed ||
        authorizeContextPermission(req.rbacContext, 'services.view', { unitId: requestedUnit, department: 'licensing' }).allowed;
      if (!check) {
        res.status(403).json({ error: 'Forbidden: trade license registry access denied' });
        return;
      }
      const isBroad = hasBroadUnitScope(req.rbacContext, 'payments.view') || hasBroadUnitScope(req.rbacContext, 'services.view');
      const effectiveUnit = isBroad ? requestedUnit : req.rbacContext.assignedInstitutions[0];
      res.json(store.getTradeLicenses(effectiveUnit));
      return;
    }
    res.json(store.getTradeLicenses(requestedUnit));
  });

  app.post('/api/trade-licenses', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = b.administrative_unit_id
      ? String(b.administrative_unit_id)
      : hasBroadUnitScope(ctx, 'payments.reconcile') || hasBroadUnitScope(ctx, 'services.manage')
        ? 'unit_goyeshpur'
        : ctx.assignedInstitutions[0];

    const allowed =
      authorizeContextPermission(ctx, 'payments.reconcile', { unitId: targetUnit }).allowed ||
      authorizeContextPermission(ctx, 'services.manage', { unitId: targetUnit, department: 'licensing' }).allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden: insufficient authority to issue trade license' });
      return;
    }
    if (!b.business_name_bn || !b.owner_name_bn) {
      res.status(400).json({ error: 'business_name_bn and owner_name_bn required' });
      return;
    }
    const now = new Date();
    const nextYear = new Date(now.getTime() + 365 * 86400_000);
    const record: TradeLicenseRecord = {
      id: `tl_${crypto.randomUUID().slice(0, 8)}`,
      license_no: sanitizeText(b.license_no || `TL-2026-${crypto.randomInt(1000, 9999)}`, 40),
      administrative_unit_id: targetUnit,
      business_name_bn: sanitizeText(b.business_name_bn, 160),
      owner_name_bn: sanitizeText(b.owner_name_bn, 120),
      business_type: sanitizeText(b.business_type || 'সাধারণ ব্যবসা ও স্টোর', 80),
      ward_no: Number(b.ward_no) || 1,
      address_bn: sanitizeText(b.address_bn || 'বাজার এলাকা', 160),
      fee_amount: Number(b.fee_amount) || 500,
      issue_date: now.toISOString().slice(0, 10),
      expiry_date: nextYear.toISOString().slice(0, 10),
      status: 'active',
    };
    store.upsertTradeLicense(record);
    res.status(201).json(record);
  });

  app.post('/api/trade-licenses/:id/renew', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const record = store.getTradeLicenseById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Trade license not found' });
      return;
    }
    const allowed =
      authorizeContextPermission(ctx, 'payments.reconcile', { unitId: record.administrative_unit_id }).allowed ||
      authorizeContextPermission(ctx, 'services.manage', { unitId: record.administrative_unit_id, department: 'licensing' }).allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const baseDate = new Date(record.expiry_date).getTime() > Date.now() ? new Date(record.expiry_date) : new Date();
    const renewedUntil = new Date(baseDate.getTime() + 365 * 86400_000).toISOString().slice(0, 10);
    const updated: TradeLicenseRecord = {
      ...record,
      expiry_date: renewedUntil,
      status: 'active',
    };
    store.upsertTradeLicense(updated);
    res.json(updated);
  });

  app.get('/api/notices', (req: Request, res: Response) => {
    const unitId = typeof req.query.unit_id === 'string' ? req.query.unit_id : undefined;
    res.json(store.getNotices(unitId));
  });

  app.post('/api/notices', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = b.administrative_unit_id
      ? String(b.administrative_unit_id)
      : hasBroadUnitScope(ctx, 'notices.manage')
        ? undefined
        : ctx.assignedInstitutions[0];

    const check = authorizeContextPermission(ctx, 'notices.manage', { unitId: targetUnit });
    if (!check.allowed) {
      res.status(403).json({
        error: check.reason || 'Forbidden: notice management permission denied',
        message_bn: check.reasonBn || 'নোটিশ প্রকাশের অনুমতি আপনার নেই।',
      });
      return;
    }
    if (!b.title_bn || !b.content_bn) {
      res.status(400).json({ error: 'title_bn and content_bn required' });
      return;
    }
    const notice: Notice = {
      id: `ntc_${crypto.randomUUID().slice(0, 8)}`,
      administrative_unit_id: targetUnit,
      title_bn: sanitizeText(b.title_bn, 200),
      title_en: sanitizeText(b.title_en || b.title_bn, 200),
      category: sanitizeText(b.category || 'সাধারণ বিজ্ঞপ্তি', 80),
      published_at: new Date().toISOString().slice(0, 10),
      content_bn: sanitizeText(b.content_bn, 1200),
      is_pinned: Boolean(b.is_pinned),
    };
    store.upsertNotice(notice);
    res.status(201).json(notice);
  });

  app.delete('/api/notices/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const existing = store.getNotices().find((n) => n.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Notice not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'notices.manage', {
      unitId: existing.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden' });
      return;
    }
    store.deleteNotice(req.params.id);
    res.json({ success: true });
  });

  // --- Staff, Wards/Departments, Role Permissions & System Settings ---
  app.get('/api/staff', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const canView =
      authorizeContextPermission(ctx, 'employees.view', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'applications.assign', { unitId: requestedUnit }).allowed;
    if (!canView) {
      res.status(403).json({ error: 'Forbidden: staff view denied' });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'employees.view') || hasBroadUnitScope(ctx, 'applications.assign');
    const scope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(store.getStaffMembers(scope));
  });

  app.post('/api/staff', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = hasBroadUnitScope(ctx, 'employees.manage')
      ? b.administrative_unit_id || 'unit_goyeshpur'
      : ctx.assignedInstitutions[0];

    const check = authorizeContextPermission(ctx, 'employees.manage', { unitId: targetUnit });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden: employee management denied' });
      return;
    }
    if (!b.name_bn || !b.designation_bn) {
      res.status(400).json({ error: 'name_bn and designation_bn required' });
      return;
    }
    const staff: StaffMember = {
      id: `stf_${crypto.randomUUID().slice(0, 8)}`,
      administrative_unit_id: targetUnit,
      name_bn: sanitizeText(b.name_bn, 120),
      designation_bn: sanitizeText(b.designation_bn, 120),
      role: (b.role || 'secretary') as UserRole,
      employee_code: sanitizeText(b.employee_code || `emp.${crypto.randomInt(100, 999)}`, 40),
      mobile: sanitizeText(b.mobile || '01700-000000', 30),
      ward_or_dept_bn: sanitizeText(b.ward_or_dept_bn || 'সাধারণ শাখা', 120),
      status: 'active',
      created_at: new Date().toISOString(),
    };
    store.upsertStaffMember(staff);
    res.status(201).json(staff);
  });

  app.patch('/api/staff/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const existing = store.getStaffById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'employees.manage', {
      unitId: existing.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const b = req.body || {};
    const updated: StaffMember = {
      ...existing,
      name_bn: b.name_bn ? sanitizeText(b.name_bn, 120) : existing.name_bn,
      designation_bn: b.designation_bn ? sanitizeText(b.designation_bn, 120) : existing.designation_bn,
      mobile: b.mobile ? sanitizeText(b.mobile, 30) : existing.mobile,
      status: b.status === 'inactive' || b.status === 'active' ? b.status : existing.status,
    };
    store.upsertStaffMember(updated);
    res.json(updated);
  });

  app.get('/api/wards-departments', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const allowed =
      authorizeContextPermission(ctx, 'employees.view', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'services.view', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'dashboard.view', { unitId: requestedUnit }).allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'employees.view') || hasBroadUnitScope(ctx, 'dashboard.view');
    const scope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    const kind = req.query.kind === 'ward' || req.query.kind === 'department' ? req.query.kind : undefined;
    res.json(store.getWardsAndDepartments(scope, kind));
  });

  app.post('/api/wards-departments', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = hasBroadUnitScope(ctx, 'employees.assign_department') || hasBroadUnitScope(ctx, 'employees.manage')
      ? b.administrative_unit_id || 'unit_goyeshpur'
      : ctx.assignedInstitutions[0];

    const allowed =
      authorizeContextPermission(ctx, 'employees.assign_department', { unitId: targetUnit }).allowed ||
      authorizeContextPermission(ctx, 'employees.manage', { unitId: targetUnit }).allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!b.name_bn || !b.head_name_bn) {
      res.status(400).json({ error: 'name_bn and head_name_bn required' });
      return;
    }
    const item: WardOrDepartment = {
      id: `wd_${crypto.randomUUID().slice(0, 8)}`,
      administrative_unit_id: targetUnit,
      kind: b.kind === 'department' ? 'department' : 'ward',
      code_or_no: sanitizeText(b.code_or_no || 'NEW-01', 20),
      name_bn: sanitizeText(b.name_bn, 120),
      head_name_bn: sanitizeText(b.head_name_bn, 120),
      head_mobile: sanitizeText(b.head_mobile || '01700-000000', 30),
      households_or_staff_count: Number(b.households_or_staff_count) || 0,
      status: 'active',
    };
    store.upsertWardOrDepartment(item);
    res.status(201).json(item);
  });

  app.get('/api/role-permissions', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!ctx.effectivePermissions.has('roles.manage') && !ctx.effectivePermissions.has('settings.view')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(store.getRolePermissions());
  });

  app.patch('/api/role-permissions/:role', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const check = authorizeContextPermission(ctx, 'roles.manage');
    if (!check.allowed || check.scope !== 'global') {
      res.status(403).json({
        error: 'Forbidden: Super Admin required',
        message_bn: 'রোল পারমিশন পরিবর্তনের অনুমতি কেবল সুপার অ্যাডমিনের।',
      });
      return;
    }
    const existing = store.getRolePermissions().find((p) => p.role === req.params.role);
    if (!existing) {
      res.status(404).json({ error: 'Role permission not found' });
      return;
    }
    const b = req.body || {};
    const updated: RolePermissionEntry = {
      ...existing,
      label_bn: typeof b.label_bn === 'string' ? sanitizeText(b.label_bn, 120) : existing.label_bn,
      scope_bn: typeof b.scope_bn === 'string' ? sanitizeText(b.scope_bn, 160) : existing.scope_bn,
      can_view_applications:
        typeof b.can_view_applications === 'boolean' ? b.can_view_applications : existing.can_view_applications,
      can_verify_applications:
        typeof b.can_verify_applications === 'boolean' ? b.can_verify_applications : existing.can_verify_applications,
      can_forward_applications:
        typeof b.can_forward_applications === 'boolean' ? b.can_forward_applications : existing.can_forward_applications,
      can_final_approve:
        typeof b.can_final_approve === 'boolean' ? b.can_final_approve : existing.can_final_approve,
      can_revoke_certificate:
        typeof b.can_revoke_certificate === 'boolean' ? b.can_revoke_certificate : existing.can_revoke_certificate,
      can_manage_revenue:
        typeof b.can_manage_revenue === 'boolean' ? b.can_manage_revenue : existing.can_manage_revenue,
      can_manage_staff:
        typeof b.can_manage_staff === 'boolean' ? b.can_manage_staff : existing.can_manage_staff,
      can_manage_settings:
        typeof b.can_manage_settings === 'boolean' ? b.can_manage_settings : existing.can_manage_settings,
      role: existing.role,
    };
    store.updateRolePermission(updated);
    res.json(updated);
  });

  app.get('/api/system-settings', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!ctx.effectivePermissions.has('settings.view')) {
      res.status(403).json({ error: 'Forbidden: settings view permission required' });
      return;
    }
    const rawSettings = store.getSystemSettings();
    const canManageIntegrations =
      ctx.effectivePermissions.get('integrations.manage') === 'global' ||
      ctx.activeRoles.includes('supervisor');

    if (!canManageIntegrations) {
      res.json({
        ...rawSettings,
        integrations: rawSettings.integrations
          ? {
              ...rawSettings.integrations,
              smtp_user: '[REDACTED]',
              bkash_merchant_no: '[REDACTED]',
              nagad_merchant_no: '[REDACTED]',
            }
          : undefined,
      });
      return;
    }
    res.json(rawSettings);
  });

  app.patch('/api/system-settings', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const check = authorizeContextPermission(ctx, 'settings.manage');
    if (!check.allowed || check.scope !== 'global') {
      res.status(403).json({
        error: 'Forbidden: Super Admin required for global system settings',
        message_bn: 'কেন্দ্রীয় সিস্টেম সেটিংস পরিবর্তনের অনুমতি কেবল সুপার অ্যাডমিনের।',
      });
      return;
    }
    const current = store.getSystemSettings();
    const b = req.body || {};
    const bi = b.integrations || {};
    const curInt = current.integrations!;
    const updated = {
      ...current,
      platform_name_bn: b.platform_name_bn ? sanitizeText(b.platform_name_bn, 200) : current.platform_name_bn,
      support_phone: b.support_phone ? sanitizeText(b.support_phone, 40) : current.support_phone,
      support_email: b.support_email ? sanitizeText(b.support_email, 120) : current.support_email,
      verification_base_url: b.verification_base_url
        ? sanitizeText(b.verification_base_url, 200)
        : current.verification_base_url,
      allow_online_applications:
        typeof b.allow_online_applications === 'boolean'
          ? b.allow_online_applications
          : current.allow_online_applications,
      require_2fa_for_officers:
        typeof b.require_2fa_for_officers === 'boolean'
          ? b.require_2fa_for_officers
          : current.require_2fa_for_officers,
      auto_sms_notifications:
        typeof b.auto_sms_notifications === 'boolean'
          ? b.auto_sms_notifications
          : current.auto_sms_notifications,
      maintenance_mode:
        typeof b.maintenance_mode === 'boolean'
          ? b.maintenance_mode
          : Boolean(current.maintenance_mode),
      integrations: {
        smtp_host: typeof bi.smtp_host === 'string' ? sanitizeText(bi.smtp_host, 120) : curInt.smtp_host,
        smtp_port:
          typeof bi.smtp_port === 'number' && Number.isFinite(bi.smtp_port) && bi.smtp_port > 0
            ? Math.min(65535, Math.floor(bi.smtp_port))
            : curInt.smtp_port,
        smtp_user: typeof bi.smtp_user === 'string' ? sanitizeText(bi.smtp_user, 120) : curInt.smtp_user,
        smtp_from_email:
          typeof bi.smtp_from_email === 'string' ? sanitizeText(bi.smtp_from_email, 120) : curInt.smtp_from_email,
        smtp_enabled: typeof bi.smtp_enabled === 'boolean' ? bi.smtp_enabled : curInt.smtp_enabled,
        sms_provider: typeof bi.sms_provider === 'string' ? sanitizeText(bi.sms_provider, 120) : curInt.sms_provider,
        sms_sender_id: typeof bi.sms_sender_id === 'string' ? sanitizeText(bi.sms_sender_id, 30) : curInt.sms_sender_id,
        sms_enabled: typeof bi.sms_enabled === 'boolean' ? bi.sms_enabled : curInt.sms_enabled,
        payment_gateway_mode:
          bi.payment_gateway_mode === 'live' || bi.payment_gateway_mode === 'sandbox'
            ? bi.payment_gateway_mode
            : curInt.payment_gateway_mode,
        bkash_merchant_no:
          typeof bi.bkash_merchant_no === 'string' ? sanitizeText(bi.bkash_merchant_no, 30) : curInt.bkash_merchant_no,
        nagad_merchant_no:
          typeof bi.nagad_merchant_no === 'string' ? sanitizeText(bi.nagad_merchant_no, 30) : curInt.nagad_merchant_no,
      },
      updated_at: new Date().toISOString(),
    };
    store.updateSystemSettings(updated);
    appendPermissionAuditLog({
      actorId: ctx.user.id,
      actorRole: ctx.user.primary_role,
      actorNameBn: ctx.user.name_bn,
      actionType: 'system_settings_updated',
      targetType: 'system',
      targetId: 'default',
      before: {
        allow_online_applications: current.allow_online_applications,
        require_2fa_for_officers: current.require_2fa_for_officers,
        maintenance_mode: current.maintenance_mode,
      },
      after: {
        allow_online_applications: updated.allow_online_applications,
        require_2fa_for_officers: updated.require_2fa_for_officers,
        maintenance_mode: updated.maintenance_mode,
      },
      reasonBn: 'কেন্দ্রীয় সিস্টেম ও নিরাপত্তা সেটিংস হালনাগাদ',
    });
    res.json(updated);
  });

  // --- Granular RBAC Management APIs (/api/rbac/*) ---
  app.get('/api/rbac/roles', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const ok =
      ctx.effectivePermissions.has('roles.manage') ||
      ctx.effectivePermissions.has('users.view');
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(listAllRoles());
  });

  app.post('/api/rbac/roles', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'roles.manage').allowed) {
      res.status(403).json({
        error: 'Forbidden: roles.manage permission required',
        message_bn: 'নতুন রোল তৈরির অনুমতি কেবল অনুমোদিত প্রশাসকের।',
      });
      return;
    }
    try {
      const b = req.body || {};
      const role = createCustomRoleTransactional({
        actorCtx: ctx,
        slug: String(b.slug || ''),
        nameEn: sanitizeText(b.name_en || b.slug, 100),
        nameBn: sanitizeText(b.name_bn || b.name_en, 120),
        category: (b.category || 'custom') as RoleCategory,
        institutionType: b.institution_type || null,
        defaultScope: (b.default_scope || 'institution') as PermissionScope,
        descriptionBn: sanitizeText(b.description_bn || '', 400),
        assignments: Array.isArray(b.assignments) ? b.assignments : [],
      });
      res.status(201).json(role);
    } catch (err) {
      handleRbacError(res, err, 'Failed to create role');
    }
  });

  app.patch('/api/rbac/roles/:slug', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'roles.manage').allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      const updated = setRoleActiveStatusTransactional({
        actorCtx: ctx,
        roleSlug: req.params.slug,
        isActive: Boolean(req.body?.is_active),
      });
      res.json(updated);
    } catch (err) {
      handleRbacError(res, err, 'Failed to update role status');
    }
  });

  app.get('/api/rbac/permissions', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const ok =
      ctx.effectivePermissions.has('roles.manage') ||
      ctx.effectivePermissions.has('users.view') ||
      ctx.effectivePermissions.has('employees.view') ||
      ctx.effectivePermissions.has('settings.view');
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(listAllPermissions());
  });

  app.get('/api/rbac/roles/:slug/permissions', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const ok =
      ctx.effectivePermissions.has('roles.manage') ||
      ctx.effectivePermissions.has('users.view') ||
      ctx.effectivePermissions.has('employees.view') ||
      ctx.effectivePermissions.has('settings.view');
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(getRolePermissionsV2(req.params.slug));
  });

  app.put('/api/rbac/roles/:slug/permissions', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'roles.manage').allowed) {
      res.status(403).json({
        error: 'Forbidden: roles.manage permission required',
        message_bn: 'রোলের পারমিশন পরিবর্তনের অনুমতি আপনার নেই।',
      });
      return;
    }
    try {
      const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : [];
      const updated = updateRolePermissionsTransactional({
        actorCtx: ctx,
        roleSlug: req.params.slug,
        assignments,
        reasonBn: sanitizeText(req.body?.reason_bn || '', 300),
      });
      res.json(updated);
    } catch (err) {
      handleRbacError(res, err, 'Failed to update role permissions');
    }
  });

  app.get('/api/rbac/compare', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const ok =
      ctx.effectivePermissions.has('roles.manage') ||
      ctx.effectivePermissions.has('users.view') ||
      ctx.effectivePermissions.has('employees.view') ||
      ctx.effectivePermissions.has('settings.view');
    if (!ok) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const roleA = String(req.query.roleA || '');
    const roleB = String(req.query.roleB || '');
    const permsA = getRolePermissionsV2(roleA);
    const permsB = getRolePermissionsV2(roleB);
    res.json({
      roleA,
      roleB,
      permissionsA: permsA,
      permissionsB: permsB,
    });
  });

  app.get('/api/rbac/users', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;

    const canView =
      authorizeContextPermission(ctx, 'users.view', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'employees.view', { unitId: requestedUnit }).allowed;
    if (!canView) {
      res.status(403).json({ error: 'Forbidden: user directory permission denied' });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'users.view') || hasBroadUnitScope(ctx, 'employees.view');
    const unitScope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(listUsersWithAssignments(unitScope));
  });

  app.post('/api/rbac/users', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = hasBroadUnitScope(ctx, 'users.create')
      ? b.administrative_unit_id || null
      : ctx.assignedInstitutions[0];

    if (!authorizeContextPermission(ctx, 'users.create', { unitId: targetUnit || undefined }).allowed) {
      res.status(403).json({ error: 'Forbidden: user creation permission denied' });
      return;
    }
    try {
      const created = createUserAccountTransactional({
        actorCtx: ctx,
        username: String(b.username || ''),
        password: String(b.password || ''),
        nameBn: sanitizeText(b.name_bn, 120),
        titleBn: sanitizeText(b.title_bn, 120),
        mobile: sanitizeText(b.mobile || '01700-000000', 30),
        email: b.email ? sanitizeText(b.email, 120) : undefined,
        primaryRole: String(b.primary_role || 'secretary'),
        administrativeUnitId: targetUnit,
        wardNos: Array.isArray(b.ward_nos) ? b.ward_nos.map(Number) : undefined,
        departments: Array.isArray(b.departments) ? b.departments.map(String) : undefined,
        mfaEnabled: b.mfa_enabled,
      });
      res.status(201).json(created);
    } catch (err) {
      handleRbacError(res, err, 'Failed to create user');
    }
  });

  app.patch('/api/rbac/users/:id/status', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const wantActive = Boolean(req.body?.is_active);
    const neededKey: PermissionKey = wantActive ? 'users.activate' : 'users.deactivate';
    if (!authorizeContextPermission(ctx, neededKey).allowed) {
      res.status(403).json({ error: `Forbidden: ${neededKey} permission required` });
      return;
    }
    try {
      const updated = setUserActiveStatusTransactional({
        actorCtx: ctx,
        targetUserId: req.params.id,
        isActive: wantActive,
      });
      if (!wantActive) {
        store.db
          .prepare('UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
          .run(new Date().toISOString(), req.params.id);
      }
      res.json(updated);
    } catch (err) {
      handleRbacError(res, err, 'Failed to toggle user status');
    }
  });

  app.post('/api/rbac/users/:id/reset-password', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'users.reset_password').allowed) {
      res.status(403).json({ error: 'Forbidden: users.reset_password required' });
      return;
    }
    try {
      adminResetUserPasswordTransactional({
        actorCtx: ctx,
        targetUserId: req.params.id,
        newPassword: String(req.body?.new_password || ''),
      });
      res.json({ success: true });
    } catch (err) {
      handleRbacError(res, err, 'Failed to reset user password');
    }
  });

  app.post('/api/rbac/users/:id/roles', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const targetUserId = req.params.id;
    // Note: prevent self-elevation explicitly even before permission check or within permission check
    if (targetUserId === ctx.user.id) {
      res.status(403).json({
        error: 'Forbidden: users cannot elevate or assign roles to themselves',
        message_bn: 'নিরাপত্তা নীতির কারণে নিজেই নিজের রোল বা ক্ষমতা বৃদ্ধি করা নিষিদ্ধ।',
      });
      return;
    }
    if (!authorizeContextPermission(ctx, 'users.assign_role', { unitId: req.body?.administrative_unit_id }).allowed) {
      res.status(403).json({
        error: 'Forbidden: users.assign_role permission required',
        message_bn: 'রোল বরাদ্দ করার অনুমতি আপনার নেই।',
      });
      return;
    }
    try {
      const b = req.body || {};
      const assigned = assignUserRoleAndScopeTransactional({
        actorCtx: ctx,
        targetUserId,
        roleSlug: String(b.role_slug || ''),
        administrativeUnitId: b.administrative_unit_id || null,
        wardNos: Array.isArray(b.ward_nos) ? b.ward_nos.map(Number) : undefined,
        departments: Array.isArray(b.departments) ? b.departments.map(String) : undefined,
        expiresAt: b.expires_at || null,
        reasonBn: sanitizeText(b.reason_bn || '', 300),
      });
      res.status(201).json(assigned);
    } catch (err) {
      handleRbacError(res, err, 'Failed to assign user role');
    }
  });

  app.delete('/api/rbac/users/:id/roles/:assignmentId', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'users.assign_role').allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      revokeUserRoleTransactional({
        actorCtx: ctx,
        targetUserId: req.params.id,
        assignmentId: req.params.assignmentId,
      });
      res.json({ success: true });
    } catch (err) {
      handleRbacError(res, err, 'Failed to revoke user role');
    }
  });

  app.post('/api/rbac/users/:id/overrides', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const targetUserId = req.params.id;
    if (targetUserId === ctx.user.id && req.body?.effect === 'grant') {
      res.status(403).json({
        error: 'Forbidden: users cannot grant themselves additional permissions',
        message_bn: 'নিজের একাউন্টে অতিরিক্ত পারমিশন যোগ করা নিষিদ্ধ।',
      });
      return;
    }
    const allowed =
      authorizeContextPermission(ctx, 'roles.manage').allowed ||
      authorizeContextPermission(ctx, 'users.assign_role').allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden: permission override authority required' });
      return;
    }
    try {
      const b = req.body || {};
      const ov = createUserPermissionOverrideTransactional({
        actorCtx: ctx,
        targetUserId,
        permissionKey: String(b.permission_key) as PermissionKey,
        scope: (b.scope || 'institution') as PermissionScope,
        effect: b.effect === 'revoke' ? 'revoke' : 'grant',
        expiresAt: b.expires_at || null,
        reasonBn: sanitizeText(b.reason_bn || '', 300),
      });
      res.status(201).json(ov);
    } catch (err) {
      handleRbacError(res, err, 'Failed to create permission override');
    }
  });

  app.delete('/api/rbac/users/:id/overrides/:overrideId', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const allowed =
      authorizeContextPermission(ctx, 'roles.manage').allowed ||
      authorizeContextPermission(ctx, 'users.assign_role').allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      revokeUserOverrideTransactional({
        actorCtx: ctx,
        targetUserId: req.params.id,
        overrideId: req.params.overrideId,
      });
      res.json({ success: true });
    } catch (err) {
      handleRbacError(res, err, 'Failed to revoke override');
    }
  });

  app.get('/api/rbac/approval-authorities', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    const allowed =
      ctx.effectivePermissions.has('roles.manage') ||
      ctx.effectivePermissions.has('settings.view') ||
      ctx.effectivePermissions.has('employees.view');
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'roles.manage') || hasBroadUnitScope(ctx, 'settings.view');
    const unitScope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(listApprovalAuthorities(unitScope));
  });

  app.post('/api/rbac/approval-authorities', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'roles.manage').allowed) {
      res.status(403).json({
        error: 'Forbidden: roles.manage permission required to delegate approval authority',
        message_bn: 'সনদ অনুমোদন ক্ষমতা অর্পণের অনুমতি কেবল সুপার অ্যাডমিনের।',
      });
      return;
    }
    try {
      const b = req.body || {};
      const item = grantApprovalAuthorityTransactional({
        actorCtx: ctx,
        userId: String(b.user_id || ''),
        roleSlug: String(b.role_slug || ''),
        administrativeUnitId: String(b.administrative_unit_id || ''),
        serviceId: String(b.service_id || ''),
        maxFeeLimit: typeof b.max_fee_limit === 'number' ? b.max_fee_limit : null,
        effectiveFrom: b.effective_from || undefined,
        expiresAt: b.expires_at || null,
        delegationNoteBn: sanitizeText(b.delegation_note_bn || '', 300),
        allowSelfApproval: Boolean(b.allow_self_approval),
      });
      res.status(201).json(item);
    } catch (err) {
      handleRbacError(res, err, 'Failed to grant approval authority');
    }
  });

  app.delete('/api/rbac/approval-authorities/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'roles.manage').allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    try {
      revokeApprovalAuthorityTransactional({
        actorCtx: ctx,
        authorityId: req.params.id,
      });
      res.json({ success: true });
    } catch (err) {
      handleRbacError(res, err, 'Failed to revoke approval authority');
    }
  });

  app.get('/api/rbac/audit-logs', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    const check = authorizeContextPermission(ctx, 'audit_logs.view', { unitId: requestedUnit });
    if (!check.allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const unitScope = hasBroadUnitScope(ctx, 'audit_logs.view') ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(listPermissionAuditLogs(unitScope));
  });

  // --- Upazila Monitoring Observations ---
  app.get('/api/monitoring/observations', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    const canView =
      authorizeContextPermission(ctx, 'monitoring.observe', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'audit_logs.view', { unitId: requestedUnit }).allowed;
    if (!canView) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const unitScope = hasBroadUnitScope(ctx, 'monitoring.observe') || hasBroadUnitScope(ctx, 'audit_logs.view')
      ? requestedUnit
      : ctx.assignedInstitutions[0];
    res.json(listMonitoringObservations(unitScope));
  });

  app.post('/api/monitoring/observations', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const targetUnit = String(b.administrative_unit_id || '');
    if (!targetUnit || !b.observation_bn) {
      res.status(400).json({ error: 'administrative_unit_id and observation_bn required' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'monitoring.observe', { unitId: targetUnit });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden: monitoring.observe required' });
      return;
    }
    const obs: MonitoringObservation = {
      id: `obs_${crypto.randomUUID().slice(0, 8)}`,
      administrative_unit_id: targetUnit,
      application_id: b.application_id ? String(b.application_id) : null,
      officer_id: ctx.user.id,
      officer_name_bn: ctx.user.name_bn,
      observation_bn: sanitizeText(b.observation_bn, 800),
      severity: ['info', 'warning', 'critical', 'overdue'].includes(b.severity) ? b.severity : 'info',
      created_at: new Date().toISOString(),
    };
    insertMonitoringObservation(obs);
    res.status(201).json(obs);
  });

  // --- UNO / Admin / Citizen Escalated Complaints Management ---
  app.get('/api/complaints', (req: AuthedRequest, res: Response) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const ctx = req.rbacContext;
    if (req.actor.role === 'citizen') {
      res.json(
        listEscalatedComplaints(undefined, {
          userId: ctx.user.id,
          mobile: ctx.user.mobile,
        })
      );
      return;
    }
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    const check = authorizeContextPermission(ctx, 'complaints.view', { unitId: requestedUnit });
    if (!check.allowed) {
      res.status(403).json({
        error: check.reason || 'Forbidden: complaints.view required',
        message_bn: check.reasonBn || 'অভিযোগ ও এস্কেলেশন তালিকা দেখার অনুমতি নেই।',
      });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'complaints.view');
    const unitScope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(listEscalatedComplaints(unitScope));
  });

  app.post('/api/complaints', (req: AuthedRequest, res: Response) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const ctx = req.rbacContext;
    const b = req.body || {};
    const targetUnit = String(b.administrative_unit_id || ctx.assignedInstitutions[0] || 'unit_goyeshpur');
    if (!b.subject_bn || !b.details_bn) {
      res.status(400).json({ error: 'subject_bn and details_bn are required' });
      return;
    }
    if (req.actor.role !== 'citizen') {
      const check =
        authorizeContextPermission(ctx, 'complaints.manage', { unitId: targetUnit }).allowed ||
        authorizeContextPermission(ctx, 'complaints.view', { unitId: targetUnit }).allowed;
      if (!check) {
        res.status(403).json({ error: 'Forbidden: cross-institution complaint creation denied' });
        return;
      }
    }
    const created = createEscalatedComplaintTransactional({
      administrativeUnitId: targetUnit,
      applicationId: b.application_id ? String(b.application_id) : null,
      complainantUserId: ctx.user.id,
      complainantNameBn: sanitizeText(b.complainant_name_bn || ctx.user.name_bn, 120),
      complainantMobile: sanitizeText(b.complainant_mobile || ctx.user.mobile, 30),
      subjectBn: sanitizeText(b.subject_bn, 200),
      detailsBn: sanitizeText(b.details_bn, 1200),
      actorId: ctx.user.id,
      actorRole: ctx.user.primary_role,
      actorNameBn: ctx.user.name_bn,
    });
    res.status(201).json(created);
  });

  app.patch('/api/complaints/:id', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const existing = getEscalatedComplaintById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Complaint not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'complaints.manage', {
      unitId: existing.administrative_unit_id,
    });
    const checkForwarded = existing.forwarded_to_unit_id
      ? authorizeContextPermission(ctx, 'complaints.manage', { unitId: existing.forwarded_to_unit_id })
      : { allowed: false };

    if (!check.allowed && !checkForwarded.allowed) {
      res.status(403).json({
        error: check.reason || 'Forbidden: complaints.manage permission required',
        message_bn: check.reasonBn || 'অভিযোগ নিষ্পত্তি বা ফরোয়ার্ড করার অনুমতি আপনার নেই।',
      });
      return;
    }
    try {
      const b = req.body || {};
      const validStatuses: Array<EscalatedComplaint['status']> = ['open', 'investigating', 'forwarded', 'resolved'];
      const nextStatus: EscalatedComplaint['status'] = validStatuses.includes(b.status)
        ? b.status
        : existing.status;
      const updated = updateEscalatedComplaintTransactional({
        actorCtx: ctx,
        complaintId: existing.id,
        status: nextStatus,
        forwardedToUnitId:
          b.forwarded_to_unit_id !== undefined ? (b.forwarded_to_unit_id ? String(b.forwarded_to_unit_id) : null) : undefined,
        resolutionNoteBn:
          b.resolution_note_bn !== undefined ? sanitizeText(b.resolution_note_bn, 600) : undefined,
      });
      res.json(updated);
    } catch (err) {
      handleRbacError(res, err, 'Failed to update complaint');
    }
  });

  // --- Developer / Technical Admin Diagnostics, Deployments & Controlled Production Access ---
  app.get('/api/developer/diagnostics', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const allowed =
      authorizeContextPermission(ctx, 'developer.diagnostics').allowed ||
      authorizeContextPermission(ctx, 'developer.console').allowed ||
      authorizeContextPermission(ctx, 'roles.manage').allowed;
    if (!allowed) {
      res.status(403).json({
        error: 'Forbidden: developer.diagnostics permission required',
        message_bn: 'টেকনিক্যাল ডায়াগনস্টিকস দেখার অনুমতি কেবল ডেভেলপার ও সুপার অ্যাডমিনের।',
      });
      return;
    }

    const tablesRow = store.db
      .prepare("SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table'")
      .get() as { cnt: number };
    const activeProdAccess = getActiveDeveloperProductionAccess(ctx.user.id);
    const rawLogs = listPermissionAuditLogs().slice(0, 25);
    // Sanitize audit logs for technical view so citizen PII or sensitive payloads are never leaked
    const sanitizedLogs = rawLogs.map((l) => ({
      ...l,
      before_json: l.target_type === 'user' ? '[SANITIZED]' : l.before_json,
      after_json: l.target_type === 'user' ? '[SANITIZED]' : l.after_json,
    }));

    const payload: DeveloperDiagnosticsResponse = {
      environment: activeProdAccess ? 'production_temporary_window' : 'staging_sanitized',
      node_version: process.version,
      uptime_seconds: Math.floor(process.uptime()),
      sqlite_status: 'healthy',
      tables_count: Number(tablesRow.cnt) || 0,
      roles_count: listAllRoles().length,
      permissions_count: listAllPermissions().length,
      services_count: store.getServices().length,
      certificate_templates_count: store.getCertificateTemplates().length,
      queue_status: 'idle',
      cache_status: 'warm',
      pdf_engine: 'PDFKit + NotoSansBengali (Embedded) + QR',
      secrets_redacted: true,
      citizen_pii_redacted: true,
      active_production_access: activeProdAccess,
      recent_technical_events: sanitizedLogs,
    };
    res.json(payload);
  });

  app.get('/api/developer/access-requests', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const allowed =
      authorizeContextPermission(ctx, 'developer.production_access').allowed ||
      authorizeContextPermission(ctx, 'roles.manage').allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden: developer.production_access required' });
      return;
    }
    const isSuper = ctx.activeRoles.includes('supervisor') || ctx.effectivePermissions.get('roles.manage') === 'global';
    res.json(listDeveloperAccessRequests(isSuper ? undefined : ctx.user.id));
  });

  app.post('/api/developer/access-requests', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'developer.production_access').allowed) {
      res.status(403).json({
        error: 'Forbidden: developer.production_access permission required',
        message_bn: 'প্রোডাকশন অ্যাক্সেস অনুরোধ করার অনুমতি নেই।',
      });
      return;
    }
    const b = req.body || {};
    if (!b.scope || !b.reason_bn) {
      res.status(400).json({ error: 'scope and reason_bn are required' });
      return;
    }
    try {
      const reqItem = createDeveloperAccessRequestTransactional({
        actorCtx: ctx,
        scope: sanitizeText(b.scope, 120),
        reasonBn: sanitizeText(b.reason_bn, 500),
        durationMinutes: Number(b.duration_minutes) || 60,
      });
      res.status(201).json(reqItem);
    } catch (err) {
      handleRbacError(res, err, 'Failed to create developer production access request');
    }
  });

  app.post('/api/developer/access-requests/:id/decide', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    try {
      const b = req.body || {};
      const decision: 'approved' | 'rejected' | 'revoked' =
        b.decision === 'rejected' ? 'rejected' : b.decision === 'revoked' ? 'revoked' : 'approved';
      const updated = decideDeveloperAccessRequestTransactional({
        actorCtx: ctx,
        requestId: req.params.id,
        decision,
        expiresAtOverride: b.expires_at || null,
      });
      res.json(updated);
    } catch (err) {
      handleRbacError(res, err, 'Failed to decide developer production access request');
    }
  });

  app.post('/api/developer/deployments', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    if (!authorizeContextPermission(ctx, 'developer.deployments').allowed && !ctx.activeRoles.includes('supervisor')) {
      res.status(403).json({
        error: 'Forbidden: developer.deployments permission required',
        message_bn: 'ডিপ্লয়মেন্ট বা রিলিজ পরিচালনার অনুমতি আপনার নেই।',
      });
      return;
    }
    const b = req.body || {};
    const environment = b.environment === 'production' ? 'production' : 'staging';
    const versionTag = sanitizeText(b.version_tag || 'v2026.11-patch', 60);
    const summaryBn = sanitizeText(b.change_summary_bn || 'কারিগরি হালনাগাদ ও বাগ ফিক্স', 400);

    if (environment === 'production' && !ctx.activeRoles.includes('supervisor')) {
      const activeWindow = getActiveDeveloperProductionAccess(ctx.user.id);
      if (!activeWindow) {
        res.status(403).json({
          error: 'Forbidden: active Supervisor-approved production access window required for production release',
          message_bn: 'প্রোডাকশন রিলিজের জন্য সুপারভাইজার কর্তৃক অনুমোদিত ও মেয়াদযুক্ত প্রোডাকশন অ্যাক্সেস আবশ্যক।',
        });
        return;
      }
    }

    const deployId = `dep_${crypto.randomUUID().slice(0, 8)}`;
    appendPermissionAuditLog({
      actorId: ctx.user.id,
      actorRole: ctx.user.primary_role,
      actorNameBn: ctx.user.name_bn,
      actionType: environment === 'production' ? 'production_deployment_executed' : 'staging_deployment_executed',
      targetType: 'deployment',
      targetId: deployId,
      after: { environment, version_tag: versionTag, change_summary_bn: summaryBn },
      reasonBn: `[${environment.toUpperCase()}] রিলিজ ${versionTag}: ${summaryBn}`,
    });

    res.status(201).json({
      id: deployId,
      environment,
      version_tag: versionTag,
      change_summary_bn: summaryBn,
      executed_by: ctx.user.username,
      created_at: new Date().toISOString(),
    });
  });

  // --- Refund Requests Workflow ---
  app.get('/api/payments/refund-requests', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const requestedUnit = typeof req.query.unit_id === 'string' && req.query.unit_id !== 'all'
      ? req.query.unit_id
      : undefined;
    const allowed =
      authorizeContextPermission(ctx, 'payments.view_reports', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'payments.request_refund', { unitId: requestedUnit }).allowed ||
      authorizeContextPermission(ctx, 'payments.approve_refund', { unitId: requestedUnit }).allowed;
    if (!allowed) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const isBroad = hasBroadUnitScope(ctx, 'payments.view_reports') || hasBroadUnitScope(ctx, 'payments.approve_refund');
    const unitScope = isBroad ? requestedUnit : ctx.assignedInstitutions[0];
    res.json(listRefundRequests(unitScope));
  });

  app.post('/api/payments/refund-requests', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const b = req.body || {};
    const appRecord = store.getApplicationByIdOrTracking(String(b.application_id || ''));
    if (!appRecord) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'payments.request_refund', {
      unitId: appRecord.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden: refund request permission required' });
      return;
    }
    const rr: RefundRequest = {
      id: `rr_${crypto.randomUUID().slice(0, 8)}`,
      application_id: appRecord.id,
      administrative_unit_id: appRecord.administrative_unit_id,
      amount: Number(b.amount) || appRecord.fee_amount,
      reason_bn: sanitizeText(b.reason_bn || 'ভুল বা অতিরিক্ত ফি পরিশোধের কারণে রিফান্ড অনুরোধ', 400),
      requested_by: ctx.user.id,
      requested_by_name_bn: ctx.user.name_bn,
      status: 'pending',
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
    };
    upsertRefundRequest(rr);
    res.status(201).json(rr);
  });

  app.post('/api/payments/refund-requests/:id/decision', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const rr = listRefundRequests().find((r) => r.id === req.params.id);
    if (!rr) {
      res.status(404).json({ error: 'Refund request not found' });
      return;
    }
    const check = authorizeContextPermission(ctx, 'payments.approve_refund', {
      unitId: rr.administrative_unit_id,
    });
    if (!check.allowed) {
      res.status(403).json({ error: check.reason || 'Forbidden: refund approval permission required' });
      return;
    }
    const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
    const nowIso = new Date().toISOString();
    const updated: RefundRequest = {
      ...rr,
      status: decision,
      reviewed_by: ctx.user.id,
      reviewed_at: nowIso,
    };
    upsertRefundRequest(updated);
    if (decision === 'approved') {
      const appRecord = store.getApplicationByIdOrTracking(rr.application_id);
      if (appRecord) {
        store.upsertApplication({
          ...appRecord,
          payment_status: 'refunded',
          status: 'refunded',
          updated_at: nowIso,
          review_notes: [
            ...(appRecord.review_notes || []),
            `রিফান্ড অনুমোদিত (${ctx.user.name_bn}): ৳${rr.amount}`,
          ],
        });
      }
    }
    res.json(updated);
  });

  // --- System Backup Export (Super Admin Only) ---
  app.get('/api/backups/export', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const check = authorizeContextPermission(ctx, 'backups.manage');
    if (!check.allowed || check.scope !== 'global') {
      res.status(403).json({
        error: 'Forbidden: system backup permission required',
        message_bn: 'সিস্টেম ব্যাকআপ নেওয়ার অনুমতি কেবল সুপার অ্যাডমিনের।',
      });
      return;
    }

    appendPermissionAuditLog({
      actorId: ctx.user.id,
      actorRole: ctx.user.primary_role,
      actorNameBn: ctx.user.name_bn,
      actionType: 'system_backup_exported',
      targetType: 'system',
      targetId: 'pottoyonbd_full_snapshot',
      reasonBn: 'সুপার অ্যাডমিন কর্তৃক পূর্ণাঙ্গ সিস্টেম ব্যাকআপ ডাউনলোড',
    });

    const snapshot = {
      exported_at: new Date().toISOString(),
      exported_by: ctx.user.username,
      institutions_count: store.getInstitutions().length,
      services_count: store.getServices().length,
      applications_count: store.getApplications().length,
      certificates_count: store.getCertificates().length,
      roles: listAllRoles(),
      permission_audit_logs: listPermissionAuditLogs(),
      system_settings: store.getSystemSettings(),
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="PottoyonBD_Backup_${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(JSON.stringify(snapshot, null, 2));
  });

  // --- Contact Inquiries ---
  app.post('/api/contact', (req: AuthedRequest, res: Response) => {
    if (!req.actor || req.actor.role !== 'citizen') {
      res.status(401).json({
        error: 'Citizen authentication required',
        message_bn: 'বার্তা পাঠানোর জন্য নাগরিক হিসেবে লগইন করা বাধ্যতামূলক।',
      });
      return;
    }
    const b = req.body || {};
    if (!b.name || !b.phone || !b.message) {
      res.status(400).json({ error: 'name, phone, and message are required' });
      return;
    }
    const userRow = store.db
      .prepare('SELECT administrative_unit_id FROM users WHERE id = ?')
      .get(req.actor.id) as { administrative_unit_id?: string } | undefined;
    const citizenUnitId = userRow?.administrative_unit_id || 'unit_goyeshpur';

    const inquiry = {
      id: `inq_${crypto.randomUUID().slice(0, 8)}`,
      citizen_user_id: req.actor.id,
      administrative_unit_id: citizenUnitId,
      name: sanitizeText(b.name, 120),
      phone: sanitizeText(b.phone, 40),
      subject: sanitizeText(b.subject || 'সাধারণ জিজ্ঞাসা', 160),
      message: sanitizeText(b.message, 1500),
      status: 'new' as const,
      created_at: new Date().toISOString(),
    };
    store.insertContactInquiry(inquiry);
    res.status(201).json(inquiry);
  });

  app.get('/api/contact', requireOfficerMiddleware, (req: AuthedRequest, res: Response) => {
    const ctx = req.rbacContext!;
    const inquiries = store.getContactInquiries();
    if (hasBroadUnitScope(ctx, 'dashboard.view') || ctx.user.primary_role === 'developer' || ctx.user.primary_role === 'supervisor') {
      res.json(inquiries);
      return;
    }
    if (ctx.user.primary_role === 'chairman') {
      const assignedUnit = ctx.user.administrative_unit_id || ctx.assignedInstitutions[0];
      const filtered = inquiries.filter((inq: any) => !inq.administrative_unit_id || inq.administrative_unit_id === assignedUnit);
      res.json(filtered);
      return;
    }
    res.status(403).json({ error: 'Forbidden', message_bn: 'যোগাযোগ বার্তা দেখার অনুমতি আপনার নেই।' });
  });

  // --- Reset DB ---
  app.post('/api/reset', async (_req: Request, res: Response) => {
    store.resetDatabase();
    initEnterpriseTables();
    store.ensureSeedCertificateAsset().catch((err) => {
      console.warn('[PottoyonBD] Seed certificate PDF initialization deferred on reset:', err);
    });
    resetVerifyRateLimiter();
    res.json({ success: true, message: 'Database reset to initial seeds' });
  });

  // Global structured JSON error handler (prevents raw HTML/stack trace leaks)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    if (res.headersSent) return;
    res.status(500).json({
      error: 'Internal server error',
      message_bn: 'সার্ভারে অপ্রত্যাশিত কারিগরি ত্রুটি ঘটেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    });
  });

  return app;
}
