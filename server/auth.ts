import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { INITIAL_INSTITUTIONS } from '../src/data/seedData.ts';
import type { PermissionKey, PermissionScope, UserRole, UserSession } from '../src/types/index.ts';
import { getDb } from './db.ts';
import {
  ALLOWED_ADMIN_ROLE_SLUGS,
  normalizeRoleSlug,
  OBSOLETE_ADMIN_ROLE_SLUGS,
} from './rbacCatalog.ts';
import {
  authorizeContextPermission,
  resolveActorRbacContext,
  type ActorRbacContext,
  type AuthorizationTarget,
} from './rbacService.ts';

export interface AuthenticatedActor {
  id: string;
  role: UserRole;
  name_bn: string;
  title_bn: string;
  administrative_unit_id?: string;
  employee_id: string;
  session_id?: string;
  issued_at: number;
  exp: number;
}

import { getSessionSecret } from './envConfig.ts';

const SESSION_SECRET = getSessionSecret();

export const OFFICER_REVIEW_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'chairman',
  'secretary',
  'developer',
  'supervisor',
]);

export const CROSS_UNIT_ROLES: ReadonlySet<UserRole> = new Set<UserRole>([
  'supervisor',
  'developer',
]);

export function isOfficerRole(role: string): boolean {
  if (OBSOLETE_ADMIN_ROLE_SLUGS.has(String(role || '').toLowerCase())) {
    return false;
  }
  const normalized = normalizeRoleSlug(role);
  return Boolean(normalized && OFFICER_REVIEW_ROLES.has(normalized));
}

export function canGrantFinalApproval(role: string, userId?: string): boolean {
  if (OBSOLETE_ADMIN_ROLE_SLUGS.has(String(role || '').toLowerCase())) {
    return false;
  }
  if (userId) {
    const ctx = resolveActorRbacContext(userId);
    if (ctx) {
      return (
        ctx.effectivePermissions.has('applications.approve') ||
        ctx.effectivePermissions.has('certificates.issue')
      );
    }
  }
  return normalizeRoleSlug(role) === 'chairman';
}

export function canAccessUnit(
  actor: AuthenticatedActor,
  unitId: string,
  rbacCtx?: ActorRbacContext | null
): boolean {
  const ctx = rbacCtx || resolveActorRbacContext(actor.id);
  if (ctx) {
    const dashScope = ctx.effectivePermissions.get('dashboard.view');
    const appScope = ctx.effectivePermissions.get('applications.view');
    if (dashScope === 'global' || dashScope === 'upazila' || appScope === 'global' || appScope === 'upazila') {
      return true;
    }
    return ctx.assignedInstitutions.includes(unitId);
  }
  const normRole = normalizeRoleSlug(actor.role);
  if (normRole && CROSS_UNIT_ROLES.has(normRole)) {
    return true;
  }
  return Boolean(actor.administrative_unit_id && actor.administrative_unit_id === unitId);
}

/**
 * Authoritative server-side user/officer resolver backed by the `users` table
 * for the simplified 4 administrative roles (UP_CHAIRMAN, UP_SECRETARY, DEVELOPER, SUPERVISOR)
 * plus CITIZEN public accounts. Obsolete administrative roles are strictly rejected.
 */
export function resolveAuthoritativeOfficer(
  rawRole: string,
  requestedUnitId?: string,
  usernameOrWard?: string
): Omit<AuthenticatedActor, 'issued_at' | 'exp'> | null {
  const cleanRoleInput = String(rawRole || '').trim().toLowerCase();
  if (OBSOLETE_ADMIN_ROLE_SLUGS.has(cleanRoleInput)) {
    return null;
  }
  const role = normalizeRoleSlug(cleanRoleInput);
  if (!role) {
    return null;
  }

  const db = getDb().db;

  if (role === 'citizen') {
    const cleanUser = usernameOrWard?.trim().toLowerCase();
    const row = (cleanUser
      ? db.prepare('SELECT * FROM users WHERE LOWER(username) = ? AND primary_role = ? AND is_active = 1').get(cleanUser, 'citizen')
      : db.prepare("SELECT * FROM users WHERE id = 'usr_citizen_portal' AND is_active = 1").get()) as
      | Record<string, unknown>
      | undefined;
    if (row) {
      return {
        id: String(row.id),
        role: 'citizen',
        name_bn: String(row.name_bn),
        title_bn: String(row.title_bn),
        employee_id: String(row.username),
      };
    }
    return {
      id: 'usr_citizen_portal',
      role: 'citizen',
      name_bn: 'সাধারণ নাগরিক',
      title_bn: 'নাগরিক সেবা ব্যবহারকারী',
      employee_id: 'citizen',
    };
  }

  if (!ALLOWED_ADMIN_ROLE_SLUGS.has(role)) {
    return null;
  }

  if (role === 'supervisor' || role === 'developer') {
    const cleanUser = usernameOrWard?.trim().toLowerCase();
    const row = (cleanUser
      ? db
          .prepare(
            "SELECT * FROM users WHERE LOWER(username) = ? AND primary_role = ? AND is_active = 1 AND COALESCE(account_status, 'active') = 'active' AND COALESCE(identity_verified, 1) = 1 AND password_hash != 'UNSET_INVITATION_REQUIRED' LIMIT 1"
          )
          .get(cleanUser, role)
      : db
          .prepare(
            "SELECT * FROM users WHERE primary_role = ? AND is_active = 1 AND COALESCE(account_status, 'active') = 'active' AND COALESCE(identity_verified, 1) = 1 AND password_hash != 'UNSET_INVITATION_REQUIRED' ORDER BY CASE WHEN id IN ('usr_init_prottoyonbd_admin', 'usr_init_rakibul_siam', 'off_supervisor', 'off_dev_admin') THEN 0 ELSE 1 END LIMIT 1"
          )
          .get(role)) as Record<string, unknown> | undefined;
    if (row) {
      return {
        id: String(row.id),
        role,
        name_bn: String(row.name_bn),
        title_bn: String(row.title_bn),
        employee_id: String(row.username),
      };
    }
    return null;
  }

  // Institutional roles (chairman, secretary) must map to a valid institution
  const targetUnitId = requestedUnitId || 'unit_goyeshpur';
  const unit = INITIAL_INSTITUTIONS.find((i) => i.id === targetUnitId);
  if (!unit) return null;

  const row = db
    .prepare(
      "SELECT * FROM users WHERE primary_role = ? AND administrative_unit_id = ? AND is_active = 1 AND COALESCE(account_status, 'active') = 'active' AND COALESCE(identity_verified, 1) = 1 AND password_hash != 'UNSET_INVITATION_REQUIRED' ORDER BY CASE WHEN id IN ('usr_init_goyeshpur_chairman', 'usr_init_goyeshpur_secretary') THEN 0 ELSE 1 END LIMIT 1"
    )
    .get(role, unit.id) as Record<string, unknown> | undefined;
  if (row) {
    return {
      id: String(row.id),
      role,
      name_bn: String(row.name_bn),
      title_bn: String(row.title_bn),
      administrative_unit_id: unit.id,
      employee_id: String(row.username),
    };
  }

  return null;
}

export function signActorToken(
  actor: Omit<AuthenticatedActor, 'issued_at' | 'exp'>,
  ttlSeconds = 60 * 60 * 12,
  sessionId?: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthenticatedActor = {
    ...actor,
    ...(sessionId ? { session_id: sessionId } : {}),
    issued_at: now,
    exp: now + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyActorToken(token: string): AuthenticatedActor | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, providedSig] = token.split('.');
  if (!encoded || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AuthenticatedActor;
    if (!parsed || !parsed.role || !parsed.id) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (OBSOLETE_ADMIN_ROLE_SLUGS.has(String(parsed.role).toLowerCase())) {
      return null;
    }
    const normalizedRole = normalizeRoleSlug(parsed.role);
    if (!normalizedRole) return null;
    parsed.role = normalizedRole;
    return parsed;
  } catch {
    return null;
  }
}

export function resolveRedirectDashboard(role: UserRole): string {
  switch (role) {
    case 'chairman':
      return 'chairman_dashboard';
    case 'secretary':
      return 'secretary_dashboard';
    case 'developer':
      return 'developer_dashboard';
    case 'supervisor':
      return 'supervisor_dashboard';
    case 'citizen':
    default:
      return 'citizen_dashboard';
  }
}

export function toUserSession(
  actor: Omit<AuthenticatedActor, 'issued_at' | 'exp'>,
  token: string
): UserSession {
  const ctx = resolveActorRbacContext(actor.id);
  const permsObj: Partial<Record<PermissionKey, PermissionScope>> = {};
  if (ctx) {
    for (const [k, v] of ctx.effectivePermissions.entries()) {
      permsObj[k] = v;
    }
  }
  return {
    user_id: actor.id,
    role: actor.role,
    roles: ctx?.activeRoles || [actor.role],
    name: actor.name_bn,
    title_bn: actor.title_bn,
    administrative_unit_id: actor.administrative_unit_id,
    employee_id: actor.employee_id,
    assigned_wards: ctx?.assignedWards || [],
    assigned_departments: ctx?.assignedDepartments || [],
    permissions: permsObj,
    approval_authorities:
      ctx?.approvalAuthorities.map((a) => ({
        administrative_unit_id: a.administrative_unit_id,
        service_id: a.service_id,
        expires_at: a.expires_at,
      })) || [],
    token,
  };
}

export interface AuthedRequest extends Request {
  actor?: AuthenticatedActor | null;
  rbacContext?: ActorRbacContext | null;
}

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) result[key] = val;
  }
  return result;
}

export function extractActorMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let rawToken = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice(7).trim();
  } else if (typeof req.query.auth_token === 'string') {
    rawToken = req.query.auth_token.trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['pottoyon_session']) {
      rawToken = cookies['pottoyon_session'];
    }
  }

  const verified = rawToken ? verifyActorToken(rawToken) : null;
  if (verified) {
    // If token is backed by a server-side session record, verify it is not revoked or expired
    if (verified.session_id) {
      const sessRow = getDb()
        .db.prepare('SELECT id, expires_at, revoked_at FROM user_sessions WHERE id = ? LIMIT 1')
        .get(verified.session_id) as { id: string; expires_at: string; revoked_at?: string | null } | undefined;
      if (
        !sessRow ||
        sessRow.revoked_at ||
        new Date(String(sessRow.expires_at)).getTime() <= Date.now()
      ) {
        req.actor = null;
        req.rbacContext = null;
        next();
        return;
      }
    }

    const ctx = resolveActorRbacContext(verified.id);
    if (!ctx) {
      // Account deactivated, locked, or missing -> reject stale token
      req.actor = null;
      req.rbacContext = null;
    } else {
      req.actor = verified;
      req.rbacContext = ctx;
    }
  } else {
    req.actor = null;
    req.rbacContext = null;
  }
  next();
}

export function requireOfficerMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.actor || !req.rbacContext) {
    res.status(401).json({
      error: 'Authentication required',
      message_bn: 'অনুগ্রহ করে অনুমোদিত কর্মকর্তা একাউন্টে লগইন করুন।',
    });
    return;
  }
  const hasAnyNonCitizenRole = req.rbacContext.activeRoles.some((r) => r !== 'citizen');
  if (!hasAnyNonCitizenRole || !isOfficerRole(req.actor.role)) {
    res.status(403).json({
      error: 'Forbidden: citizen accounts cannot perform administrative operations',
      message_bn: 'নাগরিক একাউন্ট থেকে প্রশাসনিক কার্যক্রম পরিচালনা করা যাবে না।',
    });
    return;
  }
  next();
}

export function requirePermission(
  permissionKey: PermissionKey,
  targetExtractor?: (req: AuthedRequest) => AuthorizationTarget
) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.actor || !req.rbacContext) {
      res.status(401).json({
        error: 'Authentication required',
        message_bn: 'অনুগ্রহ করে অনুমোদিত একাউন্টে লগইন করুন।',
      });
      return;
    }
    const target = targetExtractor ? targetExtractor(req) : {};
    const check = authorizeContextPermission(req.rbacContext, permissionKey, target);
    if (!check.allowed) {
      res.status(403).json({
        error: check.reason || `Forbidden: missing permission ${permissionKey}`,
        message_bn: check.reasonBn || 'আপনার এই কার্যক্রমের অনুমতি নেই।',
      });
      return;
    }
    next();
  };
}

export function requireFinalApproverMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.actor || !req.rbacContext) {
    res.status(401).json({
      error: 'Authentication required',
      message_bn: 'চূড়ান্ত অনুমোদনের জন্য কর্মকর্তার লগইন সেশন আবশ্যক।',
    });
    return;
  }
  const hasApprovePerm =
    req.rbacContext.effectivePermissions.has('applications.approve') ||
    req.rbacContext.effectivePermissions.has('certificates.issue') ||
    req.rbacContext.effectivePermissions.has('certificates.revoke') ||
    req.rbacContext.effectivePermissions.has('certificates.reissue');

  if (!hasApprovePerm) {
    res.status(403).json({
      error: 'Forbidden: insufficient authority for final certificate approval',
      message_bn: 'আপনার বর্তমান পদবি বা পারমিশন থেকে চূড়ান্ত অনুমোদন ও সনদ ইস্যু করার অনুমতি নেই।',
    });
    return;
  }
  next();
}
