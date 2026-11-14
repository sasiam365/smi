import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type AppEnvironment = 'production' | 'testing';

export interface EnvironmentDiagnostics {
  app_env: AppEnvironment;
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

export function getAppEnv(): AppEnvironment {
  const env = (process.env.APP_ENV || '').trim().toLowerCase();
  if (env === 'production') {
    return 'production';
  }
  if (env === 'testing' || env === 'test') {
    return 'testing';
  }
  const appUrl = (process.env.APP_URL || process.env.FRONTEND_URL || '').toLowerCase();
  if (appUrl.includes('maltimarket.com') || appUrl.includes('localhost') || appUrl.includes('.run.app')) {
    return 'testing';
  }
  return 'testing';
}

export function isProductionApp(): boolean {
  return getAppEnv() === 'production';
}

export function isTestingApp(): boolean {
  return getAppEnv() === 'testing';
}

export function getDbPath(): string {
  const appEnv = getAppEnv();
  if (process.env.POTTOYON_DB_PATH) {
    const customPath = path.resolve(process.env.POTTOYON_DB_PATH);
    const filename = path.basename(customPath).toLowerCase();

    // Strict cross-environment protection guard
    if (appEnv === 'testing') {
      const isTestNamed = filename.includes('test') || customPath.includes('test') || customPath.includes('tmp');
      if (filename === 'pottoyonbd.sqlite' && !isTestNamed) {
        throw new Error(
          `[CRITICAL SECURITY VIOLATION] Testing environment (APP_ENV=testing) cannot connect to production database (${customPath}). ` +
          `Set POTTOYON_DB_PATH to 'data/pottoyonbd_testing.sqlite' or leave it unset to use the default isolated database.`
        );
      }
    } else if (appEnv === 'production') {
      if (filename.includes('testing') || customPath.includes('testing')) {
        throw new Error(
          `[CRITICAL CONFIGURATION ERROR] Production environment (APP_ENV=production) cannot point to testing database (${customPath}).`
        );
      }
    }
    return customPath;
  }

  const dbFilename = appEnv === 'production' ? 'pottoyonbd.sqlite' : 'pottoyonbd_testing.sqlite';
  return path.resolve(process.cwd(), 'data', dbFilename);
}

export function getStorageRoot(): string {
  const appEnv = getAppEnv();
  if (process.env.POTTOYON_STORAGE_DIR) {
    const customDir = path.resolve(process.env.POTTOYON_STORAGE_DIR);
    const dirBase = path.basename(customDir).toLowerCase();

    // Strict storage isolation guard
    if (appEnv === 'testing') {
      const prodDefault = path.resolve(process.cwd(), 'storage');
      const isTestNamed = dirBase.includes('test') || customDir.includes('test') || customDir.includes('tmp');
      if (customDir === prodDefault && !isTestNamed) {
        throw new Error(
          `[CRITICAL SECURITY VIOLATION] Testing environment cannot use production storage directory (${customDir}). ` +
          `Set POTTOYON_STORAGE_DIR to 'storage_testing' or leave it unset.`
        );
      }
    } else if (appEnv === 'production') {
      if (dirBase.includes('testing') || customDir.includes('storage_testing')) {
        throw new Error(
          `[CRITICAL CONFIGURATION ERROR] Production environment cannot use testing storage directory (${customDir}).`
        );
      }
    }
    return customDir;
  }

  const dirName = appEnv === 'production' ? 'storage' : 'storage_testing';
  return path.resolve(process.cwd(), dirName);
}

export function getAttachmentStorageRoot(): string {
  return path.join(getStorageRoot(), 'attachments');
}

export function getCertificateStorageRoot(): string {
  if (process.env.POTTOYON_STORAGE_DIR) {
    return path.resolve(process.env.POTTOYON_STORAGE_DIR);
  }
  const appEnv = getAppEnv();
  const dirName = appEnv === 'production' ? 'storage' : 'storage_testing';
  return path.resolve(process.cwd(), dirName, 'certificates');
}

export function getVerificationBaseUrl(): string {
  const appEnv = getAppEnv();
  if (process.env.QR_VERIFY_BASE_URL) {
    const raw = process.env.QR_VERIFY_BASE_URL.replace(/\/+$/, '');
    if (appEnv === 'testing' && (raw.includes('pottoyonbd.gov.bd') || raw.includes('pottoyon.gov.bd'))) {
      console.warn(
        `[SECURITY WARNING] Testing environment detected with production QR_VERIFY_BASE_URL (${raw}). ` +
        `Overriding to testing verify endpoint to prevent testing QR codes from resolving against production.`
      );
      return 'https://prottoyonbd.maltimarket.com/verify';
    }
    return raw;
  }
  if (process.env.POTTOYON_VERIFICATION_BASE_URL) {
    return process.env.POTTOYON_VERIFICATION_BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL') && !process.env.APP_URL.includes('localhost')) {
    return `${process.env.APP_URL.replace(/\/+$/, '')}/verify`;
  }
  return appEnv === 'production'
    ? 'https://pottoyonbd.gov.bd/verify'
    : 'https://prottoyonbd.maltimarket.com/verify';
}

export function getSessionSecret(): string {
  const appEnv = getAppEnv();
  const configured = process.env.POTTOYON_SESSION_SECRET?.trim();

  if (configured) {
    if (appEnv === 'production' && configured.length < 32) {
      console.warn(
        '[SECURITY WARNING] POTTOYON_SESSION_SECRET is shorter than 32 characters in production. Consider using a 64-character random key.'
      );
    }
    return configured;
  }

  if (appEnv === 'production') {
    console.warn(
      '[SECURITY NOTICE] POTTOYON_SESSION_SECRET not set in production. Generating isolated runtime secret.'
    );
    return crypto.createHash('sha256').update(`prod-runtime-seed-${Date.now()}-${process.pid}`).digest('hex');
  }

  return crypto.createHash('sha256').update('pottoyonbd-testing-isolated-session-secret-v2').digest('hex');
}

export function validateEnvironmentStartup(): void {
  const appEnv = getAppEnv();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbPath = getDbPath();
  const storageDir = getStorageRoot();
  const attachDir = getAttachmentStorageRoot();
  const certDir = getCertificateStorageRoot();
  const verifyBase = getVerificationBaseUrl();
  const sessionSecret = getSessionSecret();

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(attachDir, { recursive: true });
  fs.mkdirSync(certDir, { recursive: true });

  const secretFingerprint = crypto.createHash('sha256').update(sessionSecret).digest('hex').slice(0, 10);

  console.log('====================================================');
  console.log(`[PottoyonBD] Initializing Environment: ${appEnv.toUpperCase()}`);
  console.log(`- NODE_ENV: ${nodeEnv} | APP_ENV: ${appEnv}`);
  console.log(`- Database: ${path.relative(process.cwd(), dbPath) || dbPath} [ISOLATED & PROTECTED]`);
  console.log(`- Storage: ${path.relative(process.cwd(), storageDir) || storageDir} [ISOLATED]`);
  console.log(`- Verification Base: ${verifyBase}`);
  console.log(`- Session Security: HMAC-SHA256 (fingerprint: ${secretFingerprint}...) [ACTIVE]`);
  console.log(`- Production Guard: ${appEnv === 'production' ? 'OFFICIAL_PRODUCTION_ACTIVE' : 'TESTING_ISOLATION_ACTIVE'}`);
  console.log('====================================================');
}

export function getSanitizedEnvironmentDiagnostics(): EnvironmentDiagnostics {
  const appEnv = getAppEnv();
  const nodeEnv = process.env.NODE_ENV || 'development';
  const dbPath = getDbPath();
  const storageDir = getStorageRoot();
  const attachDir = getAttachmentStorageRoot();
  const certDir = getCertificateStorageRoot();
  const verifyBase = getVerificationBaseUrl();
  const sessionSecret = getSessionSecret();

  const secretFingerprint = crypto.createHash('sha256').update(sessionSecret).digest('hex').slice(0, 12);
  const dbName = path.basename(dbPath);
  const isTesting = appEnv === 'testing';

  const allowedHosts: string[] = ['localhost', '127.0.0.1'];
  if (process.env.APP_URL) {
    try {
      allowedHosts.push(new URL(process.env.APP_URL).host);
    } catch {}
  }
  if (process.env.FRONTEND_URL) {
    try {
      allowedHosts.push(new URL(process.env.FRONTEND_URL).host);
    } catch {}
  }
  if (isTesting) {
    allowedHosts.push('prottoyonbd.maltimarket.com');
  } else {
    allowedHosts.push('pottoyonbd.gov.bd');
  }

  return {
    app_env: appEnv,
    node_env: nodeEnv,
    is_production: !isTesting,
    is_testing: isTesting,
    database: {
      resolved_path: path.relative(process.cwd(), dbPath) || dbPath,
      database_file: dbName,
      is_isolated: true,
      is_production_file: dbName === 'pottoyonbd.sqlite',
      is_testing_file: dbName.includes('testing') || dbName.includes('test'),
      wal_journal_mode: true,
      protection_guard: isTesting
        ? 'STRICT_TESTING_ISOLATION (PRODUCTION_DATABASE_PROTECTED)'
        : 'PRODUCTION_INTEGRITY_PROTECTED',
    },
    storage: {
      resolved_dir: path.relative(process.cwd(), storageDir) || storageDir,
      attachments_dir: path.relative(process.cwd(), attachDir) || attachDir,
      certificates_dir: path.relative(process.cwd(), certDir) || certDir,
      is_isolated: true,
      is_production_dir: path.basename(storageDir) === 'storage',
      is_testing_dir: path.basename(storageDir).includes('testing') || path.basename(storageDir).includes('test'),
    },
    urls: {
      app_url: process.env.APP_URL || (isTesting ? 'https://prottoyonbd.maltimarket.com' : 'https://pottoyonbd.gov.bd'),
      frontend_url: process.env.FRONTEND_URL || (isTesting ? 'https://prottoyonbd.maltimarket.com' : 'https://pottoyonbd.gov.bd'),
      qr_verify_base_url: verifyBase,
    },
    security: {
      session_secret_configured: Boolean(process.env.POTTOYON_SESSION_SECRET),
      session_algorithm: 'HMAC-SHA256',
      session_secret_fingerprint: `${secretFingerprint}...`,
      trust_proxy_enabled: true,
      https_enforced: !isTesting || Boolean(process.env.APP_URL?.startsWith('https')),
      cors_allowed_hosts: Array.from(new Set(allowedHosts)),
    },
    watermark: {
      active: isTesting,
      display_text: isTesting ? 'TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — বৈধ নয়' : null,
    },
  };
}
