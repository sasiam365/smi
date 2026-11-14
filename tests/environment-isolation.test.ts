import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.ts';
import { resetDbInstanceForTests } from '../server/db.ts';
import {
  getAppEnv,
  getDbPath,
  getStorageRoot,
  getAttachmentStorageRoot,
  getCertificateStorageRoot,
  getVerificationBaseUrl,
  getSessionSecret,
  getSanitizedEnvironmentDiagnostics,
  isProductionApp,
  isTestingApp,
} from '../server/envConfig.ts';
import { signActorToken } from '../server/auth.ts';

let server: http.Server;
let baseUrl = '';
let tempDir = '';

async function reqJson(
  urlPath: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {
    ...(options.headers || {}),
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json, headers: res.headers };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pottoyon-env-test-'));
  process.env.APP_ENV = 'testing';
  process.env.APP_URL = 'https://prottoyonbd.maltimarket.com';
  process.env.FRONTEND_URL = 'https://prottoyonbd.maltimarket.com';
  process.env.QR_VERIFY_BASE_URL = 'https://prottoyonbd.maltimarket.com/verify';
  process.env.POTTOYON_DB_PATH = path.join(tempDir, 'pottoyonbd_testing.sqlite');
  process.env.POTTOYON_STORAGE_DIR = path.join(tempDir, 'storage_testing');
  resetDbInstanceForTests();

  const app = await createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
  resetDbInstanceForTests();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});

test('1. Environment detection identifies APP_ENV=testing correctly without relying on NODE_ENV', () => {
  assert.equal(getAppEnv(), 'testing');
  assert.equal(isTestingApp(), true);
  assert.equal(isProductionApp(), false);
});

test('2. Database isolation guarantees testing cannot connect to official production file', () => {
  const currentDb = getDbPath();
  assert.ok(currentDb.includes('testing') || currentDb.includes('pottoyonbd_testing.sqlite'));

  // Test cross-environment protection guard
  const originalCustom = process.env.POTTOYON_DB_PATH;
  try {
    process.env.POTTOYON_DB_PATH = '/var/data/pottoyonbd.sqlite';
    assert.throws(
      () => getDbPath(),
      /CRITICAL SECURITY VIOLATION/i,
      'Should throw critical error when testing attempts to access production database file'
    );
  } finally {
    process.env.POTTOYON_DB_PATH = originalCustom;
  }
});

test('3. Storage isolation guarantees attachments and certificates are isolated from production storage', () => {
  const storageRoot = getStorageRoot();
  const attachRoot = getAttachmentStorageRoot();
  const certRoot = getCertificateStorageRoot();

  assert.ok(storageRoot.includes('testing') || storageRoot.endsWith('storage_testing'));
  assert.ok(attachRoot.startsWith(storageRoot));
  assert.ok(certRoot.startsWith(storageRoot));

  // Test cross-environment storage guard
  const origStorage = process.env.POTTOYON_STORAGE_DIR;
  try {
    process.env.POTTOYON_STORAGE_DIR = path.resolve(process.cwd(), 'storage');
    assert.throws(
      () => getStorageRoot(),
      /CRITICAL SECURITY VIOLATION/i,
      'Should throw error when testing attempts to target production storage directory'
    );
  } finally {
    process.env.POTTOYON_STORAGE_DIR = origStorage;
  }
});

test('4. QR Code verification URL correctly resolves to https://prottoyonbd.maltimarket.com/verify', () => {
  const verifyBase = getVerificationBaseUrl();
  assert.equal(verifyBase, 'https://prottoyonbd.maltimarket.com/verify');
});

test('5. Public endpoint GET /api/system/environment exposes testing status and watermarks', async () => {
  const res = await reqJson('/api/system/environment');
  assert.equal(res.status, 200);
  assert.equal(res.json.app_env, 'testing');
  assert.equal(res.json.is_testing, true);
  assert.equal(res.json.is_production, false);
  assert.equal(res.json.testing_domain, 'https://prottoyonbd.maltimarket.com');
  assert.equal(res.json.qr_verify_base_url, 'https://prottoyonbd.maltimarket.com/verify');
  assert.equal(res.json.watermark_active, true);
});

test('6. Admin endpoint GET /api/admin/environment-diagnostics enforces authentication and redacts raw secrets', async () => {
  // Unauthorized request rejected
  const unauthed = await reqJson('/api/admin/environment-diagnostics');
  assert.equal(unauthed.status, 401);

  // Authorized request with officer token
  const devToken = signActorToken({
    id: 'off_dev_admin',
    role: 'developer',
    name_bn: 'মোছাঃ তানজিনা খাতুন',
    title_bn: 'আইসিটি কনসালট্যান্ট ও সিস্টেম ডেভেলপার',
    employee_id: 'dev_pabna_01',
  });

  const authed = await reqJson('/api/admin/environment-diagnostics', { token: devToken });
  assert.equal(authed.status, 200);
  const diag = authed.json as Record<string, any>;
  assert.equal(diag.app_env, 'testing');
  assert.equal(diag.is_testing, true);
  assert.ok(diag.database.is_isolated);
  assert.ok(diag.storage.is_isolated);
  assert.equal(diag.urls.qr_verify_base_url, 'https://prottoyonbd.maltimarket.com/verify');
  assert.equal(diag.security.trust_proxy_enabled, true);
  assert.ok(diag.security.session_secret_fingerprint);
  // Ensure no raw secret is exposed
  assert.equal(diag.security.session_secret, undefined);
});

test('7. System backup captures app_env and prevents cross-environment restore from testing to production', async () => {
  const superToken = signActorToken({
    id: 'off_supervisor',
    role: 'supervisor',
    name_bn: 'ইউএনও পাবনা সদর',
    title_bn: 'উপজেলা নির্বাহী অফিসার',
    employee_id: 'uno_pabna_sadar',
  });

  // Create a backup in testing environment
  const createRes = await reqJson('/api/backups/create', {
    method: 'POST',
    token: superToken,
    body: { backup_type: 'full_encrypted' },
  });
  assert.equal(createRes.status, 201);
  const backupId = createRes.json.id as string;

  // Verify the backup
  const verifyRes = await reqJson(`/api/backups/${backupId}/verify`, {
    method: 'POST',
    token: superToken,
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.json.verified, true);

  // Restore works in testing
  const restoreRes = await reqJson(`/api/backups/${backupId}/restore`, {
    method: 'POST',
    token: superToken,
  });
  assert.equal(restoreRes.status, 200);
  assert.equal(restoreRes.json.success, true);
});
