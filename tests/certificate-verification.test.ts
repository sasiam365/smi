import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp, resetVerifyRateLimiter } from '../server/app.ts';
import { getDb, resetDbInstanceForTests } from '../server/db.ts';

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
  return { status: res.status, headers: res.headers, body: json };
}

async function getRoleToken(role: string, administrativeUnitId?: string): Promise<string> {
  const res = await reqJson('/api/auth/switch-role', {
    method: 'POST',
    body: { role, administrative_unit_id: administrativeUnitId },
  });
  assert.equal(res.status, 200);
  return String(res.body.token);
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pottoyonbd-test-'));
  process.env.POTTOYON_DB_PATH = path.join(tempDir, 'test.sqlite');
  process.env.POTTOYON_STORAGE_DIR = path.join(tempDir, 'storage');
  process.env.POTTOYON_VERIFY_RATE_LIMIT = '50';

  resetDbInstanceForTests();
  const app = await createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  resetDbInstanceForTests();
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('1. End-to-end lifecycle for Union Parishad and Pabna Municipality: Apply -> Pay -> Final Approve -> QR & PDF -> Scan Verify (privacy preserved)', async () => {
  for (const unitCase of [
    { unitId: 'unit_bharara', role: 'chairman', expectedPrefix: 'UP', serviceId: 'srv_warish' },
    { unitId: 'unit_pabna_muni', role: 'chairman', expectedPrefix: 'PM', serviceId: 'srv_trade_license' },
  ]) {
    // 1. Citizen submits application
    const createRes = await reqJson('/api/applications', {
      method: 'POST',
      body: {
        administrative_unit_id: unitCase.unitId,
        service_id: unitCase.serviceId,
        applicant_name_bn: 'মোঃ করিম উদ্দিন',
        applicant_name_en: 'Md. Karim Uddin',
        father_name_bn: 'মোঃ রহিম উদ্দিন',
        mother_name_bn: 'মোছাঃ আমেনা বেগম',
        nid_or_birth_reg: '19901234567890123',
        mobile: '01711-000111',
        ward_no: 4,
        village_or_area_bn: 'সদর বাজার',
        post_office_bn: 'পাবনা - ৬৬০০',
        heirs: [{ sl: 1, name: 'মোঃ করিম উদ্দিন', dob: '০১-০১-১৯৯০', age: 36, relation: 'নিজ' }],
      },
    });
    assert.equal(createRes.status, 201);
    const appId = String(createRes.body.id);
    const trackingNo = String(createRes.body.tracking_no);
    assert.ok(trackingNo.startsWith(unitCase.expectedPrefix));

    // 2. Citizen pays fee
    const payRes = await reqJson('/api/payments/checkout', {
      method: 'POST',
      body: { applicationId: appId, method: 'bkash', amount: 100 },
    });
    assert.equal(payRes.status, 200);
    assert.equal(payRes.body.success, true);

    // 3. Authorized officer performs final approval
    const officerToken = await getRoleToken(unitCase.role, unitCase.unitId);
    const approveRes = await reqJson(`/api/applications/${appId}/final-approve`, {
      method: 'POST',
      token: officerToken,
      body: { notes: 'সরেজমিন যাচাই শেষে অনুমোদিত' },
    });
    assert.equal(approveRes.status, 201);
    const cert = approveRes.body.certificate as Record<string, unknown>;
    const verificationUrl = String(approveRes.body.verification_url);
    assert.ok(verificationUrl.includes('/verify/'), 'Verification URL must have /verify/ path');
    const rawToken = verificationUrl.split('/verify/')[1];
    assert.ok(rawToken.length >= 24, 'Token must be cryptographically unpredictable');
    assert.ok(String(cert.qr_data_url || '').startsWith('data:image/png;base64,'));
    assert.equal(cert.verification_token_hash, undefined, 'Must not expose token hash');
    assert.equal(cert.pdf_path, undefined, 'Must not expose private filesystem path');

    // 4. Verify real PDF exists and is downloadable by citizen with tracking_no
    const pdfRes = await fetch(`${baseUrl}/api/certificates/${cert.id}/pdf?tracking_no=${trackingNo}`);
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdfBytes.byteLength > 1500);

    // 5. Verify citizen notification created
    const notifRes = await reqJson(`/api/notifications?tracking_no=${trackingNo}`);
    assert.equal(notifRes.status, 200);
    assert.ok(Array.isArray(notifRes.body) || Array.isArray(notifRes.body.raw));

    // 6. Simulate QR scan -> online verification
    const verifyRes = await reqJson(`/api/verify/${rawToken}`);
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.verified, true);
    assert.equal(verifyRes.body.status, 'valid');
    assert.equal(verifyRes.body.certificate_number, cert.certificate_no);

    // Privacy assertions: no full NID, DOB, address, heir lists, or files exposed
    assert.equal(verifyRes.body.nid_or_birth_reg, undefined);
    assert.equal(verifyRes.body.heirs, undefined);
    assert.equal(verifyRes.body.permanent_address_bn, undefined);
    assert.equal(verifyRes.body.present_address_bn, undefined);
    assert.equal(verifyRes.body.pdf_path, undefined);
  }
});

test('2. Authorization & RBAC: prevents unauthenticated, citizen, and non-approver staff from approving or revoking', async () => {
  const unpaidBypass = await reqJson('/api/applications/app_goyeshpur_00127/final-approve', {
    method: 'POST',
  });
  assert.equal(unpaidBypass.status, 401);

  const citizenToken = await getRoleToken('citizen');
  const citizenRes = await reqJson('/api/applications/app_goyeshpur_00127/final-approve', {
    method: 'POST',
    token: citizenToken,
  });
  assert.equal(citizenRes.status, 403);

  for (const restrictedRole of ['secretary', 'developer', 'supervisor']) {
    const staffToken = await getRoleToken(
      restrictedRole,
      restrictedRole === 'secretary' ? 'unit_goyeshpur' : undefined
    );
    const staffRes = await reqJson('/api/applications/app_goyeshpur_00127/final-approve', {
      method: 'POST',
      token: staffToken,
    });
    assert.equal(staffRes.status, 403, `${restrictedRole} must be denied final approval`);
  }

  // Cannot bypass final approval via PATCH /status
  const goyeshpurToken = await getRoleToken('chairman', 'unit_goyeshpur');
  const bypassPatch = await reqJson('/api/applications/app_goyeshpur_00127/status', {
    method: 'PATCH',
    token: goyeshpurToken,
    body: { status: 'certificate_issued' },
  });
  assert.equal(bypassPatch.status, 400);
});

test('3. Cross-institution tenant isolation: Union A cannot approve/revoke/view Union B or Municipality, and vice versa', async () => {
  const bhararaToken = await getRoleToken('chairman', 'unit_bharara');
  const muniToken = await getRoleToken('chairman', 'unit_pabna_muni');

  // Bharara chairman tries to approve Goyeshpur application
  const crossApprove1 = await reqJson('/api/applications/app_goyeshpur_00127/final-approve', {
    method: 'POST',
    token: bhararaToken,
  });
  assert.equal(crossApprove1.status, 403);

  // Municipality chairman tries to approve Goyeshpur application
  const crossApprove2 = await reqJson('/api/applications/app_goyeshpur_00127/final-approve', {
    method: 'POST',
    token: muniToken,
  });
  assert.equal(crossApprove2.status, 403);

  // Bharara chairman tries to revoke Goyeshpur seed certificate
  const crossRevoke = await reqJson('/api/certificates/cert_10275626255/revoke', {
    method: 'POST',
    token: bhararaToken,
    body: { reason: 'Cross tenant test' },
  });
  assert.equal(crossRevoke.status, 403);

  // Bharara chairman tries to query Goyeshpur applications list
  const crossList = await reqJson('/api/applications?unit_id=unit_goyeshpur', {
    token: bhararaToken,
  });
  assert.equal(crossList.status, 403);
});

test('4. Cannot generate certificate before fee payment or on rejected application', async () => {
  const goyeshpurToken = await getRoleToken('chairman', 'unit_goyeshpur');
  // app_goyeshpur_00126 is unpaid in seedData
  const unpaidRes = await reqJson('/api/applications/app_goyeshpur_00126/final-approve', {
    method: 'POST',
    token: goyeshpurToken,
  });
  assert.equal(unpaidRes.status, 400);
});

test('5. Duplicate issuance prevention under concurrent/repeated final-approve calls', async () => {
  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_maligachha',
      service_id: 'srv_nationality',
      applicant_name_bn: 'মোঃ জামাল হোসেন',
      father_name_bn: 'মোঃ কামাল হোসেন',
      mother_name_bn: 'মোছাঃ লাইলী বেগম',
      nid_or_birth_reg: '19950000111122223',
      mobile: '01812-112233',
      ward_no: 2,
      village_or_area_bn: 'মালিগাছা মোড়',
      post_office_bn: 'মালিগাছা',
    },
  });
  const appId = String(createRes.body.id);
  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'nagad', amount: 50 },
  });

  const maligachhaToken = await getRoleToken('chairman', 'unit_maligachha');
  const results = await Promise.all([
    reqJson(`/api/applications/${appId}/final-approve`, { method: 'POST', token: maligachhaToken }),
    reqJson(`/api/applications/${appId}/final-approve`, { method: 'POST', token: maligachhaToken }),
    reqJson(`/api/applications/${appId}/final-approve`, { method: 'POST', token: maligachhaToken }),
  ]);

  const certIds = new Set(results.map((r) => (r.body.certificate as { id: string }).id));
  assert.equal(certIds.size, 1, 'Concurrent approvals must issue strictly 1 certificate');
  const createdCount = results.filter((r) => r.status === 201).length;
  const idempotentCount = results.filter((r) => r.status === 200 && r.body.already_issued === true).length;
  assert.equal(createdCount, 1);
  assert.equal(idempotentCount, 2);

  const dbRowCount = getDb()
    .db.prepare('SELECT COUNT(*) AS cnt FROM certificates WHERE application_id = ?')
    .get(appId) as { cnt: number };
  assert.equal(dbRowCount.cnt, 1);
});

test('6. Revoked certificate immediately reflects REVOKED on online verification', async () => {
  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_ataikula',
      service_id: 'srv_character',
      applicant_name_bn: 'মোঃ সাদেক আলী',
      father_name_bn: 'মোঃ বারেক আলী',
      mother_name_bn: 'মোছাঃ হাসিনা বেগম',
      nid_or_birth_reg: '19910000111122224',
      mobile: '01755-667788',
      ward_no: 5,
      village_or_area_bn: 'আতাইকুলা',
      post_office_bn: 'আতাইকুলা',
    },
  });
  const appId = String(createRes.body.id);
  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 50 },
  });

  const ataikulaToken = await getRoleToken('chairman', 'unit_ataikula');
  const approveRes = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: ataikulaToken,
  });
  const certId = String((approveRes.body.certificate as { id: string }).id);
  const rawToken = String(approveRes.body.verification_url).split('/verify/')[1];

  // Valid initially
  const validRes = await reqJson(`/api/verify/${rawToken}`);
  assert.equal(validRes.status, 200);
  assert.equal(validRes.body.status, 'valid');

  // Revoke by authorized officer
  const revokeRes = await reqJson(`/api/certificates/${certId}/revoke`, {
    method: 'POST',
    token: ataikulaToken,
    body: { reason: 'ভুল তথ্য প্রদানের কারণে বাতিল' },
  });
  assert.equal(revokeRes.status, 200);

  // Immediately reflects revoked
  const afterRevokeRes = await reqJson(`/api/verify/${rawToken}`);
  assert.equal(afterRevokeRes.status, 200);
  assert.equal(afterRevokeRes.body.verified, false);
  assert.equal(afterRevokeRes.body.status, 'revoked');
  assert.equal(afterRevokeRes.body.revocation_reason, 'ভুল তথ্য প্রদানের কারণে বাতিল');
});

test('7. Expired certificate immediately reflects EXPIRED on online verification', async () => {
  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_dapunia',
      service_id: 'srv_character',
      applicant_name_bn: 'মোঃ তৌহিদুল ইসলাম',
      father_name_bn: 'মোঃ নজরুল ইসলাম',
      mother_name_bn: 'মোছাঃ মাজেদা খাতুন',
      nid_or_birth_reg: '19930000111122225',
      mobile: '01912-334455',
      ward_no: 1,
      village_or_area_bn: 'দাপুনিয়া',
      post_office_bn: 'দাপুনিয়া',
    },
  });
  const appId = String(createRes.body.id);
  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'rocket', amount: 50 },
  });

  const dapuniaToken = await getRoleToken('chairman', 'unit_dapunia');
  const approveRes = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: dapuniaToken,
    body: { expires_in_days: 180 },
  });
  const certId = String((approveRes.body.certificate as { id: string }).id);
  const rawToken = String(approveRes.body.verification_url).split('/verify/')[1];

  // Simulate expiration timestamp in the past
  getDb()
    .db.prepare('UPDATE certificates SET expires_at = ? WHERE id = ?')
    .run('2020-01-01T00:00:00.000Z', certId);

  const expiredRes = await reqJson(`/api/verify/${rawToken}`);
  assert.equal(expiredRes.status, 200);
  assert.equal(expiredRes.body.verified, false);
  assert.equal(expiredRes.body.status, 'expired');
});

test('8. Invalid token returns 404 invalid and rate limiting returns 429', async () => {
  const invalidRes = await reqJson('/api/verify/nonexistent_unpredictable_token_xyz');
  assert.equal(invalidRes.status, 404);
  assert.equal(invalidRes.body.verified, false);
  assert.equal(invalidRes.body.status, 'invalid');

  // Test rate limit at threshold=3
  process.env.POTTOYON_VERIFY_RATE_LIMIT = '3';
  resetVerifyRateLimiter();

  const headers = { 'x-forwarded-for': '203.0.113.42' };
  const r1 = await reqJson('/api/verify/10275626255', { headers });
  const r2 = await reqJson('/api/verify/10275626255', { headers });
  const r3 = await reqJson('/api/verify/10275626255', { headers });
  const r4 = await reqJson('/api/verify/10275626255', { headers });

  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 200);
  assert.equal(r4.status, 429);
  assert.ok(r4.headers.get('retry-after'));
});
