import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.ts';
import { resetDbInstanceForTests } from '../server/db.ts';

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
  return { status: res.status, headers: res.headers, body: json, rawText: text };
}

async function getRoleToken(
  role: string,
  administrativeUnitId?: string,
  username?: string
): Promise<{ token: string; session: Record<string, unknown> }> {
  const res = await reqJson('/api/auth/switch-role', {
    method: 'POST',
    body: { role, administrative_unit_id: administrativeUnitId, username },
  });
  assert.equal(res.status, 200, `Expected 200 switch-role for ${role}, got ${res.status}`);
  return {
    token: String(res.body.token),
    session: res.body.session as Record<string, unknown>,
  };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pottoyonbd-final-auth-'));
  process.env.POTTOYON_DB_PATH = path.join(tempDir, 'final_auth.sqlite');
  process.env.POTTOYON_STORAGE_DIR = path.join(tempDir, 'storage');
  process.env.POTTOYON_VERIFY_RATE_LIMIT = '200';

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

test('Scenario 1, 2, 7: UP Secretary creates, saves draft, edits, previews draft (cannot download/print final PDF), and submits to Chairman, but cannot approve or issue certificates', async () => {
  const { token: goySec } = await getRoleToken('secretary', 'unit_goyeshpur');

  // 1. Secretary creates a draft application
  const draftRes = await reqJson('/api/applications', {
    method: 'POST',
    token: goySec,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ তানভীর আহমেদ (খসড়া)',
      father_name_bn: 'মোঃ জসিম উদ্দিন',
      mother_name_bn: 'মোছাঃ নাজমা বেগম',
      nid_or_birth_reg: '19940000111199901',
      mobile: '01711-223344',
      ward_no: 4,
      village_or_area_bn: 'গোয়েশপুর',
      post_office_bn: 'গোয়েশপুর',
      save_as_draft: true,
    },
  });
  assert.equal(draftRes.status, 201);
  assert.equal(draftRes.body.status, 'draft');
  const appId = String(draftRes.body.id);

  // 2. Secretary previews draft before issuance (Scenario 7: Draft cannot be downloaded or printed as final certificate)
  const previewRes = await reqJson(`/api/applications/${appId}/draft-preview`, { token: goySec });
  assert.equal(previewRes.status, 200);
  assert.equal(previewRes.body.is_draft, true);
  assert.equal(previewRes.body.can_download_final_pdf, false);
  assert.equal(previewRes.body.can_print_final_pdf, false);
  assert.ok(String(previewRes.body.draft_label_bn || '').includes('DRAFT'));

  // 3. Secretary edits the draft and submits to Chairman
  const submitRes = await reqJson(`/api/applications/${appId}`, {
    method: 'PATCH',
    token: goySec,
    body: {
      applicant_name_bn: 'মোঃ তানভীর আহমেদ',
      secretary_note: 'সচিব কর্তৃক সকল তথ্য ও কাগজপত্র যাচাইপূর্বক চেয়ারম্যানের নিকট প্রেরণ করা হলো।',
      submit_to_chairman: true,
    },
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.body.status, 'forwarded_for_approval');
  assert.equal(submitRes.body.applicant_name_bn, 'মোঃ তানভীর আহমেদ');

  // Pay fee so application is eligible for final approval
  const payRes = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 50 },
  });
  assert.equal(payRes.status, 200);

  // Scenario 2: Secretary CANNOT approve or issue certificates
  const secApproveAttempt = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: goySec,
    body: { notes: 'সচিব কর্তৃক সরাসরি অনুমোদনের অবৈধ চেষ্টা' },
  });
  assert.equal(secApproveAttempt.status, 403, 'Secretary must not be allowed to final-approve or issue certificates');
});

test('Scenario 3, 4, 5, 6: Goyeshpur Chairman can return to Secretary or approve Goyeshpur applications; Maligachha Chairman and Bharara Secretary are strictly isolated; approved applications generate valid cert, QR, verification & PDF', async () => {
  const { token: goySec } = await getRoleToken('secretary', 'unit_goyeshpur');
  const { token: goyChairman } = await getRoleToken('chairman', 'unit_goyeshpur');
  const { token: malChairman } = await getRoleToken('chairman', 'unit_maligachha');
  const { token: bhaSec } = await getRoleToken('secretary', 'unit_bharara');

  // Secretary creates & submits an application in Goyeshpur
  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    token: goySec,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_warish',
      applicant_name_bn: 'মোঃ মাহবুব আলম',
      father_name_bn: 'মৃত আবুল কাশেম',
      mother_name_bn: 'মোছাঃ সালেহা খাতুন',
      nid_or_birth_reg: '19880000111199903',
      mobile: '01715-009988',
      ward_no: 4,
      village_or_area_bn: 'গোয়েশপুর',
      post_office_bn: 'গোয়েশপুর',
      heirs: [{ sl: 1, name: 'মোঃ মাহবুব আলম', dob: '১৮-০৪-১৯৯৭', age: 30, relation: 'নিজ' }],
    },
  });
  assert.equal(createRes.status, 201);
  const goyAppId = String(createRes.body.id);

  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: goyAppId, method: 'nagad', amount: 100 },
  });

  // Scenario 4: Maligachha Chairman CANNOT view or approve Goyeshpur applications
  const malList = await reqJson('/api/applications', { token: malChairman });
  assert.equal(malList.status, 200);
  const malApps = Array.isArray(malList.body) ? (malList.body as Array<Record<string, unknown>>) : [];
  assert.equal(malApps.some((a) => a.administrative_unit_id === 'unit_goyeshpur'), false);
  assert.equal((await reqJson(`/api/applications/${goyAppId}`, { token: malChairman })).status, 403);
  assert.equal(
    (
      await reqJson(`/api/applications/${goyAppId}/final-approve`, {
        method: 'POST',
        token: malChairman,
        body: { notes: 'Cross-union approval attempt' },
      })
    ).status,
    403
  );

  // Scenario 5: Bharara Secretary CANNOT view or edit Goyeshpur applications
  assert.equal((await reqJson(`/api/applications/${goyAppId}`, { token: bhaSec })).status, 403);
  assert.equal(
    (
      await reqJson(`/api/applications/${goyAppId}`, {
        method: 'PATCH',
        token: bhaSec,
        body: { applicant_name_bn: 'Tampered by Bharara Secretary' },
      })
    ).status,
    403
  );

  // Scenario 3A: Goyeshpur Chairman can return the application to Secretary
  const returnRes = await reqJson(`/api/applications/${goyAppId}/return-to-secretary`, {
    method: 'POST',
    token: goyChairman,
    body: { reason: 'ওয়ারিশ সদস্যের জন্ম তারিখ পুনরায় যাচাই করে প্রেরণ করুন।' },
  });
  assert.equal(returnRes.status, 200);
  assert.equal(returnRes.body.status, 'under_verification');

  // Secretary re-submits to Chairman
  const resubmitToChair = await reqJson(`/api/applications/${goyAppId}`, {
    method: 'PATCH',
    token: goySec,
    body: {
      secretary_note: 'জন্ম তারিখ যাচাই সম্পন্ন, পুনরায় চেয়ারম্যান মহোদয়ের নিকট প্রেরিত।',
      submit_to_chairman: true,
    },
  });
  assert.equal(resubmitToChair.status, 200);
  assert.equal(resubmitToChair.body.status, 'forwarded_for_approval');

  // Scenario 3B & 6: Goyeshpur Chairman approves Goyeshpur application -> generates valid certificate number, QR code, verification record & downloadable PDF
  const goyApproveRes = await reqJson(`/api/applications/${goyAppId}/final-approve`, {
    method: 'POST',
    token: goyChairman,
    body: { notes: 'গোয়েশপুর ইউপি চেয়ারম্যান কর্তৃক অনুমোদিত' },
  });
  assert.equal(goyApproveRes.status, 201);
  const certObj = goyApproveRes.body.certificate as Record<string, unknown>;
  assert.ok(certObj.certificate_no, 'Certificate number must be generated');
  assert.ok(String(certObj.qr_data_url || '').startsWith('data:image/png;base64,'), 'QR code must be generated');

  const verificationUrl = String(goyApproveRes.body.verification_url);
  const rawToken = verificationUrl.split('/verify/')[1];
  const verifyRes = await reqJson(`/api/verify/${rawToken}`);
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.verified, true);
  assert.equal(verifyRes.body.status, 'valid');

  const pdfRes = await fetch(`${baseUrl}/api/certificates/${certObj.id}/pdf`, {
    headers: { Authorization: `Bearer ${goyChairman}` },
  });
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('Scenario 8 & 9: Developer can access technical tools and staging deployments, cannot approve certificates or grant themselves Supervisor privileges, and production deployment requires Supervisor approval', async () => {
  const { token: devToken } = await getRoleToken('developer');
  const { token: supervisorToken } = await getRoleToken('supervisor');

  // Scenario 8: Developer can access technical diagnostics (strictly 4 administrative roles) and staging deployments
  const diagRes = await reqJson('/api/developer/diagnostics', { token: devToken });
  assert.equal(diagRes.status, 200);
  assert.equal(diagRes.body.sqlite_status, 'healthy');
  assert.equal(diagRes.body.roles_count, 4, 'Must strictly have 4 administrative roles');
  assert.equal(diagRes.body.secrets_redacted, true);
  assert.equal(diagRes.body.citizen_pii_redacted, true);

  const stagingDeploy = await reqJson('/api/developer/deployments', {
    method: 'POST',
    token: devToken,
    body: {
      environment: 'staging',
      version_tag: 'v3.0.0-rc1',
      change_summary_bn: 'স্টেজিং এনভায়রনমেন্টে ৪-রোল আর্কিটেকচার পরীক্ষা।',
    },
  });
  assert.equal(stagingDeploy.status, 201);

  // Developer is blocked from citizen applications, certificate approval, and backups
  assert.equal((await reqJson('/api/applications', { token: devToken })).status, 403);
  assert.equal((await reqJson('/api/backups/export', { token: devToken })).status, 403);

  const appRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ রফিকুল ইসলাম',
      mobile: '01712-998877',
      ward_no: 2,
    },
  });
  const appId = String(appRes.body.id);
  const devApprove = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: devToken,
  });
  assert.equal(devApprove.status, 403, 'Developer must not approve certificates');

  // Scenario 9: Developer cannot grant themselves Supervisor privileges
  const selfEscalateRole = await reqJson('/api/rbac/users/off_dev_admin/roles', {
    method: 'POST',
    token: devToken,
    body: { role_slug: 'supervisor' },
  });
  assert.equal(selfEscalateRole.status, 403, 'Developer must not grant themselves Supervisor role');

  const selfGrantApproval = await reqJson('/api/rbac/approval-authorities', {
    method: 'POST',
    token: devToken,
    body: {
      user_id: 'off_dev_admin',
      role_slug: 'developer',
      administrative_unit_id: '*',
      service_id: '*',
      delegation_note_bn: 'Self approval attempt',
    },
  });
  assert.equal(selfGrantApproval.status, 403, 'Developer must not grant certificate approval authority');

  // Production deployment requires Supervisor approval
  const unapprovedProdDeploy = await reqJson('/api/developer/deployments', {
    method: 'POST',
    token: devToken,
    body: {
      environment: 'production',
      version_tag: 'v3.0.0',
      change_summary_bn: 'অনুমোদনহীন প্রোডাকশন ডিপ্লয়মেন্ট চেষ্টা',
    },
  });
  assert.equal(unapprovedProdDeploy.status, 403);

  const reqAccess = await reqJson('/api/developer/access-requests', {
    method: 'POST',
    token: devToken,
    body: {
      scope: 'production_deployment',
      reason_bn: 'জরুরি নিরাপত্তা আপডেট প্রোডাকশনে ডিপ্লয় করার জন্য ২০ মিনিট অ্যাক্সেস প্রয়োজন।',
      duration_minutes: 20,
    },
  });
  assert.equal(reqAccess.status, 201);
  const accessReqId = String(reqAccess.body.id);

  // Developer cannot self-approve
  assert.equal(
    (
      await reqJson(`/api/developer/access-requests/${accessReqId}/decide`, {
        method: 'POST',
        token: devToken,
        body: { decision: 'approved' },
      })
    ).status,
    403
  );

  // Supervisor approves the time-limited request
  const supApproveAccess = await reqJson(`/api/developer/access-requests/${accessReqId}/decide`, {
    method: 'POST',
    token: supervisorToken,
    body: { decision: 'approved' },
  });
  assert.equal(supApproveAccess.status, 200);

  // Developer can now deploy to production
  const approvedProdDeploy = await reqJson('/api/developer/deployments', {
    method: 'POST',
    token: devToken,
    body: {
      environment: 'production',
      version_tag: 'v3.0.0',
      change_summary_bn: 'সুপারভাইজার অনুমোদিত প্রোডাকশন সিকিউরিটি ডিপ্লয়মেন্ট।',
    },
  });
  assert.equal(approvedProdDeploy.status, 201);
});

test('Scenario 10: Supervisor can manage users, roles, institutions, services, settings, and reports across all 10 Unions and Pabna Municipality, without automatic legal certificate approval authority', async () => {
  const { token: supervisorToken } = await getRoleToken('supervisor');

  // Supervisor can manage global system settings and service fees/workflows
  const settingsPatch = await reqJson('/api/system-settings', {
    method: 'PATCH',
    token: supervisorToken,
    body: {
      maintenance_mode: false,
      allow_online_applications: true,
    },
  });
  assert.equal(settingsPatch.status, 200);
  assert.equal(settingsPatch.body.maintenance_mode, false);

  const srvPatch = await reqJson('/api/services/srv_warish', {
    method: 'PATCH',
    token: supervisorToken,
    body: {
      workflow_steps: ['secretary_preparation', 'chairman_approval'],
    },
  });
  assert.equal(srvPatch.status, 200);

  // Supervisor can view cross-institution dashboard stats and reports across all 11 institutions (10 Unions + Pabna Municipality)
  const statsRes = await reqJson('/api/dashboard/stats', { token: supervisorToken });
  assert.equal(statsRes.status, 200);
  assert.ok(Array.isArray(statsRes.body.institution_breakdown));
  assert.equal((statsRes.body.institution_breakdown as unknown[]).length, 11);

  // Supervisor does NOT automatically have Chairman legal approval authority
  const appRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ কামরুল হাসান',
      mobile: '01711-001122',
      ward_no: 4,
    },
  });
  const appId = String(appRes.body.id);
  const supApprove = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: supervisorToken,
  });
  assert.equal(supApprove.status, 403, 'Supervisor must not have automatic legal certificate approval authority');
});

test('Scenario 11: All removed/obsolete administrative roles cannot log in, switch roles, or access protected routes', async () => {
  const obsoleteRoles = [
    'upazila_admin',
    'uno',
    'upazila_monitoring_officer',
    'union_admin',
    'ward_member',
    'union_accountant',
    'municipality_accountant',
    'accountant',
    'union_service_operator',
    'municipality_service_operator',
    'service_operator',
    'municipality_admin',
    'mayor',
    'executive_officer',
    'department_officer',
  ];

  for (const obsoleteRole of obsoleteRoles) {
    const switchRes = await reqJson('/api/auth/switch-role', {
      method: 'POST',
      body: { role: obsoleteRole, administrative_unit_id: 'unit_goyeshpur' },
    });
    assert.equal(
      switchRes.status,
      403,
      `Obsolete role "${obsoleteRole}" must be rejected with 403 on /api/auth/switch-role`
    );
  }

  // Verify RBAC role catalog strictly returns only the 4 allowed administrative roles
  const { token: supervisorToken } = await getRoleToken('supervisor');
  const rolesRes = await reqJson('/api/rbac/roles', { token: supervisorToken });
  assert.equal(rolesRes.status, 200);
  const rolesList = rolesRes.body as unknown as Array<{ slug: string }>;
  const roleSlugs = rolesList.map((r) => r.slug).sort();
  assert.deepEqual(roleSlugs, ['chairman', 'developer', 'secretary', 'supervisor']);
});

test('Scenario 12: Two-Option Secure Login Modal — Citizen vs Administrative realm separation, DB role resolution, redirect_dashboard, wrong password/realm, suspended account, session expiry/logout, remember-me rotation, and password reset', async () => {
  // 1. Citizen Login (username / mobile / email) -> Citizen Dashboard
  const citLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'citizen',
      username: 'citizen',
      password: 'Pottoyon@2026!',
      remember_me: true,
    },
  });
  assert.equal(citLogin.status, 200);
  assert.equal(citLogin.body.redirect_dashboard, 'citizen_dashboard');
  assert.equal((citLogin.body.session as Record<string, unknown>).role, 'citizen');
  assert.ok(citLogin.body.remember_token, 'Should issue revocable remember_token when remember_me=true');

  // Citizen account cannot access administrative dashboard endpoints
  const citToken = String(citLogin.body.token);
  assert.equal((await reqJson('/api/dashboard/stats', { token: citToken })).status, 403);

  // 2. Wrong Login Type: Citizen attempting Administrative Login -> 403
  const citAsAdmin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'citizen',
      password: 'Pottoyon@2026!',
    },
  });
  assert.equal(citAsAdmin.status, 403, 'Citizen account must be rejected from Administrative Login');

  // 3. Wrong Login Type: Administrative Officer attempting Citizen Login -> 403
  const chairAsCitizen = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'citizen',
      username: 'goyeshpur.chairman',
      password: 'Pottoyon@2026!',
    },
  });
  assert.equal(chairAsCitizen.status, 403, 'Administrative account must be rejected from Citizen Login');

  // 4. Administrative Login resolves actual role & institution from database (no role input required)
  // 4A. UP_CHAIRMAN -> chairman_dashboard
  const chairLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.chairman',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(chairLogin.status, 200);
  assert.equal(chairLogin.body.redirect_dashboard, 'chairman_dashboard');
  assert.equal((chairLogin.body.session as Record<string, unknown>).role, 'chairman');
  assert.equal((chairLogin.body.session as Record<string, unknown>).administrative_unit_id, 'unit_goyeshpur');

  // 4B. UP_SECRETARY -> secretary_dashboard
  const secLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.secretary',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(secLogin.status, 200);
  assert.equal(secLogin.body.redirect_dashboard, 'secretary_dashboard');
  assert.equal((secLogin.body.session as Record<string, unknown>).role, 'secretary');
  assert.equal((secLogin.body.session as Record<string, unknown>).administrative_unit_id, 'unit_goyeshpur');

  // 4C. DEVELOPER -> developer_dashboard
  const devLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'developer',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(devLogin.status, 200);
  assert.equal(devLogin.body.redirect_dashboard, 'developer_dashboard');
  assert.equal((devLogin.body.session as Record<string, unknown>).role, 'developer');

  // 4D. SUPERVISOR -> supervisor_dashboard
  const supLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'supervisor',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(supLogin.status, 200);
  assert.equal(supLogin.body.redirect_dashboard, 'supervisor_dashboard');
  assert.equal((supLogin.body.session as Record<string, unknown>).role, 'supervisor');
  const supToken = String(supLogin.body.token);

  // 5. Wrong password -> 401
  const wrongPass = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.secretary',
      password: 'WrongPassword123!',
      otp: '123456',
    },
  });
  assert.equal(wrongPass.status, 401);

  // 6. Suspended account -> 403
  await reqJson('/api/rbac/users/off_maligachha_secretary/status', {
    method: 'PATCH',
    token: supToken,
    body: { is_active: false },
  });
  const suspendedLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'maligachha.secretary',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(suspendedLogin.status, 403, 'Suspended administrative account must be rejected with 403');
  // Re-enable account
  await reqJson('/api/rbac/users/off_maligachha_secretary/status', {
    method: 'PATCH',
    token: supToken,
    body: { is_active: true },
  });

  // 7. Remember-me token rotation & Logout session invalidation
  const secRememberLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.secretary',
      password: 'Pottoyon@2026!',
      otp: '123456',
      remember_me: true,
    },
  });
  assert.equal(secRememberLogin.status, 200);
  const firstRememberToken = String(secRememberLogin.body.remember_token);
  assert.ok(firstRememberToken.length > 20);

  const restored = await reqJson('/api/auth/remember', {
    method: 'POST',
    body: { remember_token: firstRememberToken },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.redirect_dashboard, 'secretary_dashboard');
  const rotatedRememberToken = String(restored.body.remember_token);
  const restoredAccessToken = String(restored.body.token);
  assert.notEqual(rotatedRememberToken, firstRememberToken, 'Remember token must rotate on use');

  // Verify active session works before logout
  assert.equal((await reqJson('/api/applications', { token: restoredAccessToken })).status, 200);

  // Logout invalidates both the access session and the remember token
  const logoutRes = await reqJson('/api/auth/logout', {
    method: 'POST',
    token: restoredAccessToken,
    body: { remember_token: rotatedRememberToken },
  });
  assert.equal(logoutRes.status, 200);

  // Access token is now revoked (401)
  assert.equal(
    (await reqJson('/api/applications', { token: restoredAccessToken })).status,
    401,
    'Logged-out session token must be invalidated on the server'
  );
  // Remember token is also revoked (401)
  assert.equal(
    (await reqJson('/api/auth/remember', { method: 'POST', body: { remember_token: rotatedRememberToken } })).status,
    401,
    'Revoked remember token must not restore a session'
  );

  // 8. Session Expiration
  const shortSessionLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.secretary',
      password: 'Pottoyon@2026!',
      otp: '123456',
      session_ttl_seconds: -5,
    },
  });
  assert.equal(shortSessionLogin.status, 200);
  const expiredToken = String(shortSessionLogin.body.token);
  assert.equal(
    (await reqJson('/api/applications', { token: expiredToken })).status,
    401,
    'Expired session token must be rejected with 401'
  );

  // 9. Password Reset Flow
  const resetReq = await reqJson('/api/auth/password-reset/request', {
    method: 'POST',
    body: { identifier: 'citizen' },
  });
  assert.equal(resetReq.status, 200);
  const resetTokenPreview = String(resetReq.body.reset_token_preview);
  assert.ok(resetTokenPreview.length > 5);

  const resetConfirm = await reqJson('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: { token: resetTokenPreview, new_password: 'NewCitizen@2026!' },
  });
  assert.equal(resetConfirm.status, 200);

  // Login with new password succeeds
  const reLoginNewPass = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'citizen',
      username: 'citizen',
      password: 'NewCitizen@2026!',
    },
  });
  assert.equal(reLoginNewPass.status, 200);
});

test('Scenario 13: Website CMS, Visual Page Builder (XSS sanitization & protected route guard), AI SEO Studio, AI Content Studio & Certificate Design Center', async () => {
  const { token: supToken } = await getRoleToken('supervisor');
  const { token: secToken } = await getRoleToken('secretary', 'unit_goyeshpur');

  // 1. Secretary cannot modify global CMS or create pages (403)
  assert.equal(
    (await reqJson('/api/cms/config', { method: 'PUT', token: secToken, body: { config: { site_name_bn: 'হ্যাকড' } } })).status,
    403
  );

  // 2. Supervisor updates CMS config with XSS payload -> sanitized & versioned
  const cmsUpdate = await reqJson('/api/cms/config', {
    method: 'PUT',
    token: supToken,
    body: {
      config: {
        hero_title_bn: 'পাবনা সদর ডিজিটাল সেবা <script>alert(1)</script>',
      },
      status: 'published',
      note_bn: 'হিরো শিরোনাম হালনাগাদ',
    },
  });
  assert.equal(cmsUpdate.status, 200);
  const updatedCfg = cmsUpdate.body.config as Record<string, unknown>;
  assert.ok(!String(updatedCfg.hero_title_bn).includes('<script>'), 'CMS string must strip script tags');

  // 3. Visual Page Builder blocks protected system slugs (/verify, /api, /certificates)
  const blockedPage = await reqJson('/api/cms/pages', {
    method: 'POST',
    token: supToken,
    body: {
      slug: 'verify',
      title_bn: 'ভুয়া যাচাই পাতা',
    },
  });
  assert.equal(blockedPage.status, 400, 'Page Builder must reject protected system slugs');

  // 4. Visual Page Builder creates safe dynamic page & strips inline event handlers
  const validPage = await reqJson('/api/cms/pages', {
    method: 'POST',
    token: supToken,
    body: {
      slug: 'trade-license-faq',
      title_bn: 'ট্রেড লাইসেন্স নির্দেশিকা',
      status: 'published',
      blocks: [
        {
          type: 'paragraph',
          content_bn: 'অনলাইনে ট্রেড লাইসেন্স আবেদন করুন <img src=x onerror="alert(1)">',
        },
      ],
    },
  });
  assert.equal(validPage.status, 201);
  const blocks = validPage.body.blocks as Array<Record<string, unknown>>;
  assert.ok(!String(blocks[0].content_bn).includes('onerror='), 'Page Builder block must sanitize XSS attributes');

  // 5. Public technical SEO routes (/robots.txt and /sitemap.xml) include published page
  const robotsRes = await reqJson('/robots.txt');
  assert.equal(robotsRes.status, 200);
  assert.ok(robotsRes.rawText.includes('Sitemap:'));

  const sitemapRes = await reqJson('/sitemap.xml');
  assert.equal(sitemapRes.status, 200);
  assert.ok(sitemapRes.rawText.includes('/pages/trade-license-faq'));

  // 6. SEO Audit & AI SEO Proposal + Supervisor Approval workflow
  const auditRes = await reqJson('/api/seo/audit', { method: 'POST', token: supToken });
  assert.equal(auditRes.status, 201);
  assert.ok(Number(auditRes.body.pages_crawled) >= 4);

  // AI SEO blocks protected verification route
  const blockedSeo = await reqJson('/api/seo/ai-propose', {
    method: 'POST',
    token: supToken,
    body: { target_path: '/verify', focus_topic: 'সনদ যাচাই' },
  });
  assert.equal(blockedSeo.status, 400, 'AI SEO must not modify protected verification routes');

  const seoProp = await reqJson('/api/seo/ai-propose', {
    method: 'POST',
    token: supToken,
    body: { target_path: '/services', focus_topic: 'পাবনা সদর অনলাইন নাগরিক সনদ' },
  });
  assert.equal(seoProp.status, 201);
  assert.equal(seoProp.body.status, 'pending_approval');
  const propId = String(seoProp.body.id);

  const approveSeo = await reqJson(`/api/seo/proposals/${propId}/decision`, {
    method: 'POST',
    token: supToken,
    body: { decision: 'approved' },
  });
  assert.equal(approveSeo.status, 200);
  assert.equal(approveSeo.body.status, 'published');

  // 7. Certificate Design Center enforces A4 Portrait Double Black Border & Authorized Seal Only
  const certDesignPatch = await reqJson('/api/certificate-design', {
    method: 'PATCH',
    token: supToken,
    body: {
      config: {
        watermark_opacity: 0.09,
        page_size: 'Letter', // should be overridden back to A4
      },
    },
  });
  assert.equal(certDesignPatch.status, 200);
  const certCfg = certDesignPatch.body.config as Record<string, unknown>;
  assert.equal(certCfg.page_size, 'A4');
  assert.equal(certCfg.orientation, 'portrait');
  assert.equal(certCfg.border_style, 'double_black');
});

test('Scenario 14: Payment, SMTP, SMS & API Integrations (AES-256-GCM Secret Masking, Not Configured Guard, Live Mode Confirmation) & Developer AI Debug Sanitization', async () => {
  const { token: supToken } = await getRoleToken('supervisor');
  const { token: devToken } = await getRoleToken('developer');

  // 1. Unconfigured provider (rocket) shows "Not Configured" and cannot run connection test (400)
  const listInt = await reqJson('/api/integrations/providers', { token: supToken });
  assert.equal(listInt.status, 200);
  const providers = listInt.body.providers as Array<Record<string, unknown>>;
  const rocket = providers.find((p) => p.provider_key === 'rocket')!;
  assert.equal(rocket.is_configured, false);
  assert.equal(rocket.status_label, 'Not Configured');

  const unconfiguredTest = await reqJson('/api/integrations/test', {
    method: 'POST',
    token: supToken,
    body: { provider_key: 'rocket' },
  });
  assert.equal(unconfiguredTest.status, 400, 'Unconfigured provider test must fail with 400');

  // 2. Enabling live mode without confirm_live: true is blocked (400)
  const liveWithoutConfirm = await reqJson('/api/integrations/providers/rocket', {
    method: 'PATCH',
    token: supToken,
    body: { mode: 'live', secret: 'rocket_live_secret_987654' },
  });
  assert.equal(liveWithoutConfirm.status, 400, 'Switching to live mode without confirm_live: true must return 400');

  // 3. Configuring provider encrypts secret at rest and returns masked secret in UI
  const configureRocket = await reqJson('/api/integrations/providers/rocket', {
    method: 'PATCH',
    token: supToken,
    body: {
      mode: 'sandbox',
      is_enabled: true,
      secret: 'rocket_sandbox_secret_key_1234',
    },
  });
  assert.equal(configureRocket.status, 200);
  assert.equal(configureRocket.body.is_configured, true);
  assert.equal(configureRocket.body.status_label, 'Sandbox Configured');
  const masked = String(configureRocket.body.masked_secret);
  assert.ok(masked.includes('•') && masked.endsWith('1234'), 'Secret must be masked in UI response');
  assert.ok(!masked.includes('rocket_sandbox_secret_key'), 'Plaintext secret must never be returned');

  // 4. Configured provider test succeeds and logs delivery
  const testRocket = await reqJson('/api/integrations/test', {
    method: 'POST',
    token: supToken,
    body: { provider_key: 'rocket', recipient: '01700000000' },
  });
  assert.equal(testRocket.status, 200);
  assert.equal(testRocket.body.status, 'delivered');

  // 5. Privacy-conscious Analytics never exposes citizen PII
  const analyticsRes = await reqJson('/api/analytics/overview?period=monthly', { token: supToken });
  assert.equal(analyticsRes.status, 200);
  assert.equal(analyticsRes.body.privacy_compliant, true);
  assert.equal(analyticsRes.body.pii_exposed, false);

  // 6. Developer AI Debug Assistant redacts secrets, tokens, NIDs & mobile numbers and never auto-executes
  const debugRes = await reqJson('/api/developer/ai-debug', {
    method: 'POST',
    token: devToken,
    body: {
      log_message:
        'Error at checkout: mobile=01712345678 nid=19971234567891234 password="MySecretPassword123" Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def',
    },
  });
  assert.equal(debugRes.status, 201);
  assert.equal(debugRes.body.auto_executed, false);
  assert.equal(debugRes.body.requires_developer_review, true);
  assert.equal(debugRes.body.requires_supervisor_prod_approval, true);
  const sanitized = String(debugRes.body.sanitized_input);
  assert.ok(!sanitized.includes('01712345678'), 'Mobile number must be redacted before AI analysis');
  assert.ok(!sanitized.includes('19971234567891234'), 'NID must be redacted before AI analysis');
  assert.ok(!sanitized.includes('MySecretPassword123'), 'Secret password must be redacted before AI analysis');
});

test('Scenario 15: Security Operations Center (Temporary IP Block, Auto-Expiry, Phone Restriction), Verified Backups Recovery Guard & Live Permission Sync', async () => {
  const { token: supToken } = await getRoleToken('supervisor');

  // 1. Temporary IP Block restricts requests from that IP (403)
  const blockIpRes = await reqJson('/api/security/ip-rules', {
    method: 'POST',
    token: supToken,
    body: {
      ip_or_cidr: '198.51.100.77',
      rule_type: 'block',
      reason_bn: 'সন্দেহজনক ব্রুট-ফোর্স প্রচেষ্টা',
      duration_minutes: 30,
    },
  });
  assert.equal(blockIpRes.status, 201);
  const ipRuleId = String(blockIpRes.body.id);

  const blockedReq = await reqJson('/api/services', {
    headers: { 'x-simulated-ip': '198.51.100.77' },
  });
  assert.equal(blockedReq.status, 403, 'Blocked IP must receive 403');

  // Unblock IP -> access restored
  await reqJson(`/api/security/ip-rules/${ipRuleId}`, { method: 'DELETE', token: supToken });
  const unblockedReq = await reqJson('/api/services', {
    headers: { 'x-simulated-ip': '198.51.100.77' },
  });
  assert.equal(unblockedReq.status, 200);

  // 2. Expired IP block auto-expires and allows traffic
  await reqJson('/api/security/ip-rules', {
    method: 'POST',
    token: supToken,
    body: {
      ip_or_cidr: '198.51.100.88',
      rule_type: 'block',
      reason_bn: 'মেয়াদোত্তীর্ণ পরীক্ষা',
      expires_at: new Date(Date.now() - 10_000).toISOString(),
    },
  });
  const autoExpiredReq = await reqJson('/api/services', {
    headers: { 'x-simulated-ip': '198.51.100.88' },
  });
  assert.equal(autoExpiredReq.status, 200, 'Expired temporary IP block must auto-expire');

  // 3. Phone Abuse Restriction blocks application submission from restricted phone number
  const phoneRuleRes = await reqJson('/api/security/phone-rules', {
    method: 'POST',
    token: supToken,
    body: {
      mobile: '01999888777',
      reason_bn: 'স্প্যাম আবেদন প্রতিরোধ',
      duration_minutes: 60,
    },
  });
  assert.equal(phoneRuleRes.status, 201);

  const blockedPhoneApp = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'টেস্ট',
      mobile: '01999888777',
    },
  });
  assert.equal(blockedPhoneApp.status, 403, 'Restricted mobile number must be blocked from submitting applications');

  // 4. Verified Disaster Recovery Backups: unverified backup CANNOT be restored (400)
  const createBkp = await reqJson('/api/backups/create', {
    method: 'POST',
    token: supToken,
    body: { backup_type: 'full_encrypted' },
  });
  assert.equal(createBkp.status, 201);
  assert.equal(createBkp.body.verified, false);
  const bkpId = String(createBkp.body.id);

  const unverifiedRestore = await reqJson(`/api/backups/${bkpId}/restore`, {
    method: 'POST',
    token: supToken,
  });
  assert.equal(
    unverifiedRestore.status,
    400,
    'Unverified backup must NOT be allowed to restore'
  );

  // Verify backup checksum -> then restore succeeds
  const verifyBkp = await reqJson(`/api/backups/${bkpId}/verify`, {
    method: 'POST',
    token: supToken,
  });
  assert.equal(verifyBkp.status, 200);
  assert.equal(verifyBkp.body.verified, true);

  const verifiedRestore = await reqJson(`/api/backups/${bkpId}/restore`, {
    method: 'POST',
    token: supToken,
  });
  assert.equal(verifiedRestore.status, 200);
  assert.equal(verifiedRestore.body.verified, true);

  // 5. Live Permission Refresh (/api/auth/me) reflects user overrides immediately
  const { token: secToken } = await getRoleToken('secretary', 'unit_goyeshpur');
  const meBefore = await reqJson('/api/auth/me', { token: secToken });
  assert.equal(meBefore.status, 200);
  const permsBefore = (meBefore.body.session as Record<string, unknown>).permissions as Record<string, unknown>;
  assert.equal(Boolean(permsBefore['seo.view']), false);

  // Supervisor grants seo.view override to Goyeshpur Secretary
  const ovrRes = await reqJson('/api/rbac/users/off_goyeshpur_secretary/overrides', {
    method: 'POST',
    token: supToken,
    body: {
      permission_key: 'seo.view',
      scope: 'own_institution',
      effect: 'grant',
      reason_bn: 'টেস্ট লাইভ পারমিশন সিঙ্ক',
    },
  });
  assert.equal(ovrRes.status, 201);
  const overrideId = String(ovrRes.body.id);

  // Secretary calls /api/auth/me without re-logging in -> seo.view is immediately present!
  const meAfter = await reqJson('/api/auth/me', { token: secToken });
  assert.equal(meAfter.status, 200);
  const permsAfter = (meAfter.body.session as Record<string, unknown>).permissions as Record<string, unknown>;
  assert.equal(permsAfter['seo.view'], 'own_institution');

  // Clean up override
  await reqJson(`/api/rbac/users/off_goyeshpur_secretary/overrides/${overrideId}`, {
    method: 'DELETE',
    token: supToken,
  });
});

test('Scenario 16: 20-Point Union-Wise Application & Chairman-Only Final Approval Workflow', async () => {
  const { token: goySec } = await getRoleToken('secretary', 'unit_goyeshpur');
  const { token: goyChairman } = await getRoleToken('chairman', 'unit_goyeshpur');
  const { token: malChairman } = await getRoleToken('chairman', 'unit_maligachha');
  const { token: bhaChairman } = await getRoleToken('chairman', 'unit_bharara');

  // 1 & 3. UP_SECRETARY can create an application and save a draft for their assigned Union
  const secDraftRes = await reqJson('/api/applications', {
    method: 'POST',
    token: goySec,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ সাইফুল ইসলাম (সচিব খসড়া)',
      father_name_bn: 'মোঃ আব্দুল করিম',
      mother_name_bn: 'মোছাঃ রাবেয়া খাতুন',
      nid_or_birth_reg: '19920000111122201',
      mobile: '01711-334455',
      ward_no: 2,
      village_or_area_bn: 'গোয়েশপুর',
      save_as_draft: true,
    },
  });
  assert.equal(secDraftRes.status, 201);
  assert.equal(secDraftRes.body.status, 'draft');
  assert.equal(secDraftRes.body.administrative_unit_id, 'unit_goyeshpur');
  assert.equal(secDraftRes.body.created_by_role, 'secretary');
  const secDraftId = String(secDraftRes.body.id);

  // Cross-Union creation attempt by Goyeshpur UP_SECRETARY for Maligachha -> 403
  const secCrossCreate = await reqJson('/api/applications', {
    method: 'POST',
    token: goySec,
    body: {
      administrative_unit_id: 'unit_maligachha',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'ক্রস ইউনিয়ন পরীক্ষা',
      mobile: '01711-334456',
    },
  });
  assert.equal(secCrossCreate.status, 403, 'UP_SECRETARY must not create applications for another Union');

  // 19. Draft applications never generate a final certificate (neither Secretary nor Chairman can approve a draft before submission)
  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: secDraftId, method: 'bkash', amount: 50 },
  });
  const approveDraftAttempt = await reqJson(`/api/applications/${secDraftId}/final-approve`, {
    method: 'POST',
    token: goyChairman,
    body: { notes: 'খসড়া অনুমোদন প্রচেষ্টা' },
  });
  assert.equal(approveDraftAttempt.status, 403, 'Draft application must not generate a final certificate prior to submission');

  // 5. UP_SECRETARY can submit an application
  const secSubmitRes = await reqJson(`/api/applications/${secDraftId}`, {
    method: 'PATCH',
    token: goySec,
    body: {
      applicant_name_bn: 'মোঃ সাইফুল ইসলাম',
      submit_to_chairman: true,
      secretary_note: 'সচিব কর্তৃক যাচাই ও দাখিল সম্পন্ন।',
    },
  });
  assert.equal(secSubmitRes.status, 200);
  assert.equal(secSubmitRes.body.status, 'forwarded_for_approval');
  assert.ok(secSubmitRes.body.submitted_by_user_id);
  assert.ok(secSubmitRes.body.submitted_at);

  // 6, 7, 8. UP_SECRETARY cannot approve, reject, request correction, or issue a certificate
  assert.equal(
    (await reqJson(`/api/applications/${secDraftId}/final-approve`, { method: 'POST', token: goySec })).status,
    403,
    'UP_SECRETARY must not approve an application'
  );
  assert.equal(
    (await reqJson(`/api/applications/${secDraftId}/issue-certificate`, { method: 'POST', token: goySec })).status,
    403,
    'UP_SECRETARY must not issue a certificate'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${secDraftId}/reject`, {
        method: 'POST',
        token: goySec,
        body: { reason: 'সচিব কর্তৃক অবৈধ বাতিল চেষ্টা' },
      })
    ).status,
    403,
    'UP_SECRETARY must not reject an application'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${secDraftId}/status`, {
        method: 'PATCH',
        token: goySec,
        body: { status: 'rejected', note: 'সচিব কর্তৃক অবৈধ বাতিল চেষ্টা' },
      })
    ).status,
    403,
    'UP_SECRETARY must not reject an application via status endpoint'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${secDraftId}/request-correction`, {
        method: 'POST',
        token: goySec,
        body: { reason: 'সচিব কর্তৃক সংশোধন অনুরোধ চেষ্টা' },
      })
    ).status,
    403,
    'UP_SECRETARY must not issue a final correction request decision'
  );

  // 14, 15, 16. Strict Union Isolation:
  // - Goyeshpur UP_SECRETARY cannot access Maligachha applications
  const { token: malSec } = await getRoleToken('secretary', 'unit_maligachha');
  const malAppCreate = await reqJson('/api/applications', {
    method: 'POST',
    token: malSec,
    body: {
      administrative_unit_id: 'unit_maligachha',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ জুবায়ের হোসেন (মালিগাছা)',
      mobile: '01711-556677',
      ward_no: 3,
    },
  });
  assert.equal(malAppCreate.status, 201);
  const malAppId = String(malAppCreate.body.id);

  assert.equal(
    (await reqJson(`/api/applications/${malAppId}`, { token: goySec })).status,
    403,
    'Goyeshpur UP_SECRETARY must not access Maligachha applications'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${secDraftId}/final-approve`, {
        method: 'POST',
        token: malChairman,
      })
    ).status,
    403,
    'Maligachha UP_CHAIRMAN must not approve Goyeshpur applications'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${secDraftId}/reject`, {
        method: 'POST',
        token: bhaChairman,
        body: { reason: 'ভাঁড়ারা চেয়ারম্যান কর্তৃক গোয়েশপুরের আবেদন বাতিলের চেষ্টা' },
      })
    ).status,
    403,
    'Bharara UP_CHAIRMAN must not reject Goyeshpur applications'
  );

  // 12 & 13. UP_CHAIRMAN can request correction -> UP_SECRETARY can respond to correction request and resubmit
  const corrReqRes = await reqJson(`/api/applications/${secDraftId}/request-correction`, {
    method: 'POST',
    token: goyChairman,
    body: { reason: 'জাতীয় পরিচয়পত্রের নম্বর ও মাতার নামের বানান যাচাই করে পুনরায় দাখিল করুন।' },
  });
  assert.equal(corrReqRes.status, 200);
  assert.equal(corrReqRes.body.status, 'correction_required');
  assert.ok(String(corrReqRes.body.decision_reason || '').includes('জাতীয় পরিচয়পত্রের'));

  const secResubmitRes = await reqJson(`/api/applications/${secDraftId}/resubmit`, {
    method: 'POST',
    token: goySec,
    body: {
      mother_name_bn: 'মোছাঃ রাবেয়া বেগম',
      correction_response: 'মাতার নামের বানান ও এনআইডি যাচাইপূর্বক সংশোধন করে পুনরায় দাখিল করা হলো।',
    },
  });
  assert.equal(secResubmitRes.status, 200);
  assert.equal(secResubmitRes.body.status, 'forwarded_for_approval');
  assert.equal(secResubmitRes.body.mother_name_bn, 'মোছাঃ রাবেয়া বেগম');

  // 9 & 17. UP_CHAIRMAN can approve an application for their assigned Union -> generates valid certificate number, QR code, verification link & PDF
  const chairApproveRes = await reqJson(`/api/applications/${secDraftId}/final-approve`, {
    method: 'POST',
    token: goyChairman,
    body: { notes: 'গোয়েশপুর ইউপি চেয়ারম্যান কর্তৃক চূড়ান্ত অনুমোদিত।' },
  });
  assert.equal(chairApproveRes.status, 201);
  const issuedApp = chairApproveRes.body.application as Record<string, unknown>;
  const issuedCert = chairApproveRes.body.certificate as Record<string, unknown>;
  assert.equal(issuedApp.status, 'certificate_issued');
  assert.ok(issuedApp.final_approver_user_id);
  assert.ok(issuedApp.approved_at);
  assert.ok(issuedCert.certificate_no);
  assert.ok(String(issuedCert.qr_data_url || '').startsWith('data:image/png;base64,'));
  assert.ok(String(chairApproveRes.body.verification_url || '').includes('/verify/'));

  const pdfCheck = await fetch(`${baseUrl}/api/certificates/${issuedCert.id}/pdf`, {
    headers: { Authorization: `Bearer ${goySec}` },
  });
  assert.equal(pdfCheck.status, 200);
  assert.equal(pdfCheck.headers.get('content-type'), 'application/pdf');

  // 2, 4, 20. UP_CHAIRMAN can create an application and save a draft for their assigned Union;
  // Chairman-created applications require explicit approval and DO NOT auto-approve on creation
  const chairDraftRes = await reqJson('/api/applications', {
    method: 'POST',
    token: goyChairman,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_character',
      applicant_name_bn: 'মোঃ নাজমুল হুদা (চেয়ারম্যান খসড়া)',
      father_name_bn: 'মোঃ শামসুল হক',
      mother_name_bn: 'মোছাঃ ফাতেমা বেগম',
      nid_or_birth_reg: '19910000111122209',
      mobile: '01712-667788',
      ward_no: 5,
      save_as_draft: true,
    },
  });
  assert.equal(chairDraftRes.status, 201);
  assert.equal(chairDraftRes.body.status, 'draft', 'Chairman-saved draft must remain in draft status');
  assert.equal(chairDraftRes.body.created_by_role, 'chairman');

  // Chairman creates & submits an application directly -> must enter pending approval ('forwarded_for_approval'), NEVER auto-approved
  const chairSubRes = await reqJson('/api/applications', {
    method: 'POST',
    token: goyChairman,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_character',
      applicant_name_bn: 'মোঃ আনোয়ার হোসেন (চেয়ারম্যান দাখিলকৃত)',
      father_name_bn: 'মোঃ লুৎফর রহমান',
      mother_name_bn: 'মোছাঃ আমেনা খাতুন',
      nid_or_birth_reg: '19890000111122210',
      mobile: '01712-778899',
      ward_no: 6,
      save_as_draft: false,
    },
  });
  assert.equal(chairSubRes.status, 201);
  assert.equal(
    chairSubRes.body.status,
    'forwarded_for_approval',
    'Chairman-created submitted application must NOT auto-approve on creation'
  );
  const chairSubAppId = String(chairSubRes.body.id);

  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: chairSubAppId, method: 'nagad', amount: 50 },
  });

  // Chairman explicitly approves the Chairman-created application after review
  const chairExplicitApprove = await reqJson(`/api/applications/${chairSubAppId}/final-approve`, {
    method: 'POST',
    token: goyChairman,
    body: { notes: 'চেয়ারম্যান কর্তৃক পর্যালোচনা ও সুনির্দিষ্ট অনুমোদন সম্পন্ন।' },
  });
  assert.equal(chairExplicitApprove.status, 201);
  assert.equal((chairExplicitApprove.body.application as Record<string, unknown>).status, 'certificate_issued');

  // 10, 11, 18. UP_CHAIRMAN cannot reject without a reason (400), can reject with a reason (200), and rejected applications never generate a certificate
  const rejectTargetCreate = await reqJson('/api/applications', {
    method: 'POST',
    token: goySec,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ তারেক আজিজ',
      mobile: '01719-112233',
      ward_no: 4,
    },
  });
  assert.equal(rejectTargetCreate.status, 201);
  const rejectAppId = String(rejectTargetCreate.body.id);

  // 11. UP_CHAIRMAN cannot reject without a reason
  const rejectNoReason = await reqJson(`/api/applications/${rejectAppId}/reject`, {
    method: 'POST',
    token: goyChairman,
    body: { reason: '   ' },
  });
  assert.equal(rejectNoReason.status, 400, 'UP_CHAIRMAN must not be allowed to reject without a mandatory reason');

  // 10. UP_CHAIRMAN can reject with a mandatory reason
  const rejectWithReason = await reqJson(`/api/applications/${rejectAppId}/reject`, {
    method: 'POST',
    token: goyChairman,
    body: { reason: 'আবেদনকারী উক্ত ওয়ার্ডের স্থায়ী বাসিন্দা নন মর্মে প্রমাণিত হওয়ায় আবেদনটি প্রত্যাখ্যান করা হলো।' },
  });
  assert.equal(rejectWithReason.status, 200);
  assert.equal(rejectWithReason.body.status, 'rejected');
  assert.ok(rejectWithReason.body.rejected_at);
  assert.ok(String(rejectWithReason.body.decision_reason || '').includes('স্থায়ী বাসিন্দা নন'));

  // 18. Rejected applications never generate a certificate
  const allCertsRes = await reqJson('/api/certificates', { token: goyChairman });
  assert.equal(allCertsRes.status, 200);
  const certsList = allCertsRes.body as unknown as Array<Record<string, unknown>>;
  assert.equal(
    certsList.some((c) => c.application_id === rejectAppId),
    false,
    'Rejected application must never generate a certificate'
  );
});

test('Scenario 17: Initial User Reset & Four Admin Account Setup (Safe Cleanup, Backup, One-Time Invitation, Identity Verification & 4-Role Validation)', async () => {
  const { token: legacySupToken } = await getRoleToken('supervisor');

  // Create an active session + remember token for a legacy admin account before cleanup to verify session revocation
  const legacySecLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.secretary',
      password: 'Pottoyon@2026!',
      otp: '123456',
      remember_me: true,
    },
  });
  assert.equal(legacySecLogin.status, 200);
  const legacySecSessionToken = String(legacySecLogin.body.token);
  const legacySecRememberToken = String(legacySecLogin.body.remember_token);

  // 1. Preview accounts to be deactivated & initial 4 admin accounts
  const previewRes = await reqJson('/api/rbac/initial-reset/preview', { token: legacySupToken });
  assert.equal(previewRes.status, 200);
  const initialFour = previewRes.body.initial_four_accounts as Array<Record<string, unknown>>;
  const toDeactivate = previewRes.body.accounts_to_be_deactivated as Array<Record<string, unknown>>;
  const preservedSummary = previewRes.body.preserved_records_summary as Record<string, number>;

  assert.equal(initialFour.length, 4, 'Exactly 4 initial admin accounts must be provisioned');
  assert.ok(toDeactivate.length >= 25, 'All legacy administrative/test accounts must be listed in deactivation summary');
  assert.ok(preservedSummary.citizen_accounts_count >= 2, 'Citizen accounts must be preserved');
  assert.ok(preservedSummary.applications_count > 0, 'Historical applications must be preserved');
  assert.ok(preservedSummary.certificates_count > 0, 'Historical certificates must be preserved');

  const unusAcc = initialFour.find((a) => a.username === 'md.unus.ali')!;
  const saidAcc = initialFour.find((a) => a.username === 'md.saiduzzaman')!;
  const supAcc = initialFour.find((a) => a.username === 'prottoyonbd.admin')!;
  const devAcc = initialFour.find((a) => a.username === 'rakibul.siam')!;

  assert.equal(unusAcc.display_name, 'MD Unus Ali');
  assert.equal(unusAcc.role_label, 'UP_CHAIRMAN');
  assert.equal(unusAcc.institution_id, 'unit_goyeshpur');
  assert.equal(unusAcc.account_status, 'pending_verification');
  assert.equal(unusAcc.has_password_set, false);

  assert.equal(saidAcc.display_name, 'Md Saiduzzaman');
  assert.equal(saidAcc.role_label, 'UP_SECRETARY');
  assert.equal(saidAcc.institution_id, 'unit_goyeshpur');
  assert.equal(saidAcc.account_status, 'pending_verification');
  assert.equal(saidAcc.has_password_set, false);

  assert.equal(supAcc.display_name, 'ProttoyonBD Admin');
  assert.equal(supAcc.role_label, 'SUPERVISOR');
  assert.equal(supAcc.mfa_enabled, true);

  assert.equal(devAcc.display_name, 'Rakibul Islam Siam');
  assert.equal(devAcc.role_label, 'DEVELOPER');
  assert.equal(devAcc.email, 'siamllc2023@gmail.com');
  assert.equal(devAcc.mfa_enabled, true);

  // 2. Pending verification accounts cannot log in before verification & password setup
  const pendingLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'md.unus.ali',
      password: 'AnyPassword@2026!',
      otp: '123456',
    },
  });
  assert.equal(pendingLogin.status, 403, 'Pending verification account must not be allowed to log in');
  assert.equal(pendingLogin.body.pending_verification, true);

  // 3. Onboard the 4 initial admin accounts via one-time invitation token + strong password + identity verification
  const issuedRawTokens: string[] = [];
  for (const acc of [supAcc, devAcc, unusAcc, saidAcc]) {
    const invRes = await reqJson(`/api/rbac/initial-reset/accounts/${acc.id}/issue-invitation`, {
      method: 'POST',
      token: legacySupToken,
      body: { expires_in_hours: 24 },
    });
    assert.equal(invRes.status, 200);
    const invToken = String(invRes.body.invitation_token);
    assert.ok(invToken.startsWith('inv_'));
    issuedRawTokens.push(invToken);

    // Weak password must be rejected (400)
    const weakSetup = await reqJson('/api/auth/setup-account-password', {
      method: 'POST',
      body: {
        username: acc.username,
        invitation_token: invToken,
        new_password: 'weak',
      },
    });
    assert.equal(weakSetup.status, 400, 'Weak password must be rejected by strong password policy');

    // Strong password setup succeeds
    const strongSetup = await reqJson('/api/auth/setup-account-password', {
      method: 'POST',
      body: {
        username: acc.username,
        invitation_token: invToken,
        new_password: `Verified#${acc.username}2026!`,
      },
    });
    assert.equal(strongSetup.status, 200);

    // Reusing one-time invitation token must fail (400)
    const reuseSetup = await reqJson('/api/auth/setup-account-password', {
      method: 'POST',
      body: {
        username: acc.username,
        invitation_token: invToken,
        new_password: `Another#${acc.username}2026!`,
      },
    });
    assert.equal(reuseSetup.status, 400, 'One-time invitation token cannot be reused');

    // Even after password setup, account is still Pending Identity Verification until verified -> login blocked (403)
    const stillPendingLogin = await reqJson('/api/auth/login', {
      method: 'POST',
      body: {
        login_type: 'administrative',
        username: acc.username,
        password: `Verified#${acc.username}2026!`,
        otp: '123456',
      },
    });
    assert.equal(
      stillPendingLogin.status,
      403,
      `Account ${acc.username} must remain blocked from login until official identity is verified`
    );

    // Verify official identity & appointment
    const verifyRes = await reqJson(`/api/rbac/initial-reset/accounts/${acc.id}/verify-identity`, {
      method: 'POST',
      token: legacySupToken,
      body: {
        verification_note_bn: 'দাপ্তরিক নিয়োগপত্র, গেজেট ও জাতীয় পরিচয়পত্র যাচাইপূর্বক চূড়ান্ত অনুমোদন',
        activate_account: true,
      },
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.body.account_status, 'active');
    assert.equal(verifyRes.body.identity_verified, true);
    assert.equal(verifyRes.body.is_active, true);
  }

  // 4. Attempting account cleanup without explicit confirmation fails (400)
  const unconfirmedCleanup = await reqJson('/api/rbac/initial-reset/execute', {
    method: 'POST',
    token: legacySupToken,
    body: { confirm_deactivation: false },
  });
  assert.equal(unconfirmedCleanup.status, 400, 'Cleanup without confirm_deactivation: true must be rejected');

  // 5. Execute safe account cleanup with confirmation (creates pre-cleanup backup, deactivates old accounts, revokes sessions)
  const execCleanup = await reqJson('/api/rbac/initial-reset/execute', {
    method: 'POST',
    token: legacySupToken,
    body: {
      confirm_deactivation: true,
      reason_bn: 'প্রারম্ভিক ৪টি অ্যাডমিন অ্যাকাউন্ট সক্রিয়করণ ও পূর্ববর্তী টেস্ট অ্যাকাউন্ট নিরাপদ নিষ্ক্রিয়করণ',
    },
  });
  assert.equal(execCleanup.status, 200);
  assert.ok(String(execCleanup.body.backup_id).startsWith('bkp_pre_reset_'), 'Pre-cleanup database backup must be created');
  assert.ok(String(execCleanup.body.backup_checksum_sha256).length === 64);
  assert.ok(Number(execCleanup.body.deactivated_count) >= 25);
  assert.ok(Number(execCleanup.body.sessions_revoked_count) >= 1);

  // 6. Old deactivated administrative accounts & their sessions/remember tokens are strictly blocked
  const revokedSessionUse = await reqJson('/api/applications', { token: legacySecSessionToken });
  assert.equal(revokedSessionUse.status, 401, 'Deactivated user session must be rejected immediately');

  const revokedRememberUse = await reqJson('/api/auth/remember', {
    method: 'POST',
    body: { remember_token: legacySecRememberToken },
  });
  assert.ok(
    revokedRememberUse.status === 401 || revokedRememberUse.status === 403,
    'Deactivated user remember token must be revoked'
  );

  const deactivatedLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'goyeshpur.chairman',
      password: 'Pottoyon@2026!',
      otp: '123456',
    },
  });
  assert.equal(deactivatedLogin.status, 403, 'Deactivated legacy admin account cannot log in');
  assert.equal(deactivatedLogin.body.account_status, 'deactivated');

  // 7A. Validate Account 3 — SUPERVISOR (prottoyonbd.admin) with mandatory MFA
  const supNoOtp = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'prottoyonbd.admin',
      password: 'Verified#prottoyonbd.admin2026!',
    },
  });
  assert.equal(supNoOtp.status, 401, 'Supervisor login must enforce mandatory MFA');
  assert.equal(supNoOtp.body.mfa_required, true);

  const initSupLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'prottoyonbd.admin',
      password: 'Verified#prottoyonbd.admin2026!',
      otp: '123456',
    },
  });
  assert.equal(initSupLogin.status, 200);
  assert.equal(initSupLogin.body.redirect_dashboard, 'supervisor_dashboard');
  const initSupToken = String(initSupLogin.body.token);

  // Verify audit logs never leaked any raw invitation token
  const auditLogsRes = await reqJson('/api/rbac/audit-logs', { token: initSupToken });
  assert.equal(auditLogsRes.status, 200);
  const rawAuditJson = JSON.stringify(auditLogsRes.body);
  assert.equal(
    issuedRawTokens.some((tok) => rawAuditJson.includes(tok)),
    false,
    'Audit logs must never expose raw invitation tokens'
  );

  // 7B. Validate Account 4 — DEVELOPER (rakibul.siam) with mandatory MFA and no automatic Supervisor privileges
  const devNoOtp = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'rakibul.siam',
      password: 'Verified#rakibul.siam2026!',
    },
  });
  assert.equal(devNoOtp.status, 401, 'Developer login must enforce mandatory MFA');

  const initDevLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'rakibul.siam',
      password: 'Verified#rakibul.siam2026!',
      otp: '123456',
    },
  });
  assert.equal(initDevLogin.status, 200);
  assert.equal(initDevLogin.body.redirect_dashboard, 'developer_dashboard');
  const initDevToken = String(initDevLogin.body.token);

  // Developer can access technical diagnostics (200) but CANNOT manage roles or verify admin identities (403)
  assert.equal((await reqJson('/api/developer/diagnostics', { token: initDevToken })).status, 200);
  assert.equal(
    (
      await reqJson('/api/rbac/initial-reset/accounts/usr_init_goyeshpur_chairman/verify-identity', {
        method: 'POST',
        token: initDevToken,
        body: { verification_note_bn: 'চেষ্টা' },
      })
    ).status,
    403,
    'Developer must not have automatic Supervisor privilege'
  );

  // 7C. Validate Account 2 — UP_SECRETARY (Md Saiduzzaman, Goyeshpur Union)
  const initSecLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'md.saiduzzaman',
      password: 'Verified#md.saiduzzaman2026!',
      otp: '123456',
    },
  });
  assert.equal(initSecLogin.status, 200);
  assert.equal(initSecLogin.body.redirect_dashboard, 'secretary_dashboard');
  const initSecToken = String(initSecLogin.body.token);

  // Md Saiduzzaman creates & submits a Goyeshpur Union application
  const secCreateGoy = await reqJson('/api/applications', {
    method: 'POST',
    token: initSecToken,
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_citizenship',
      applicant_name_bn: 'মোঃ সাইফুল ইসলাম (গয়েশপুর)',
      mobile: '01711-909090',
      ward_no: 2,
      save_as_draft: false,
    },
  });
  assert.equal(secCreateGoy.status, 201);
  const goyAppId = String(secCreateGoy.body.id);

  await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: goyAppId, method: 'bkash', amount: 50 },
  });

  // Md Saiduzzaman cannot create for another Union (403) and cannot final-approve or reject (403)
  assert.equal(
    (
      await reqJson('/api/applications', {
        method: 'POST',
        token: initSecToken,
        body: {
          administrative_unit_id: 'unit_maligachha',
          service_id: 'srv_citizenship',
          applicant_name_bn: 'মালিগাছা আবেদনকারী',
          mobile: '01711-808080',
        },
      })
    ).status,
    403,
    'Goyeshpur Secretary cannot create applications for another Union'
  );
  assert.equal(
    (await reqJson(`/api/applications/${goyAppId}/final-approve`, { method: 'POST', token: initSecToken })).status,
    403,
    'UP_SECRETARY Md Saiduzzaman must be strictly denied final approval'
  );
  assert.equal(
    (
      await reqJson(`/api/applications/${goyAppId}/reject`, {
        method: 'POST',
        token: initSecToken,
        body: { reason: 'সচিব কর্তৃক প্রত্যাখ্যান প্রচেষ্টা' },
      })
    ).status,
    403,
    'UP_SECRETARY Md Saiduzzaman must be strictly denied final rejection'
  );

  // 7D. Validate Account 1 — UP_CHAIRMAN (MD Unus Ali, Goyeshpur Union)
  const initChairLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'administrative',
      username: 'md.unus.ali',
      password: 'Verified#md.unus.ali2026!',
      otp: '123456',
    },
  });
  assert.equal(initChairLogin.status, 200);
  assert.equal(initChairLogin.body.redirect_dashboard, 'chairman_dashboard');
  const initChairToken = String(initChairLogin.body.token);

  // MD Unus Ali cannot access another Union's application (403)
  assert.equal(
    (await reqJson('/api/applications?unit_id=unit_maligachha', { token: initChairToken })).status,
    403,
    'Goyeshpur Chairman MD Unus Ali cannot query another Union applications'
  );
  const malAppsRes = await reqJson('/api/applications?unit_id=unit_maligachha', { token: initSupToken });
  assert.equal(malAppsRes.status, 200);
  const malApps = malAppsRes.body as unknown as Array<Record<string, unknown>>;
  if (malApps.length > 0) {
    assert.equal(
      (await reqJson(`/api/applications/${malApps[0].id}`, { token: initChairToken })).status,
      403,
      'Goyeshpur Chairman MD Unus Ali cannot access another Union application'
    );
  }

  // MD Unus Ali approves Goyeshpur application & issues certificate
  const chairApproveGoy = await reqJson(`/api/applications/${goyAppId}/final-approve`, {
    method: 'POST',
    token: initChairToken,
    body: { notes: 'গয়েশপুর ইউপি চেয়ারম্যান MD Unus Ali কর্তৃক চূড়ান্ত অনুমোদন ও সনদ ইস্যু।' },
  });
  assert.equal(chairApproveGoy.status, 201);
  assert.equal((chairApproveGoy.body.application as Record<string, unknown>).status, 'certificate_issued');

  // 8. Citizen login & historical records remain completely intact after admin reset
  const citLogin = await reqJson('/api/auth/login', {
    method: 'POST',
    body: {
      login_type: 'citizen',
      username: 'citizen',
      password: 'NewCitizen@2026!',
    },
  });
  assert.equal(citLogin.status, 200, 'Citizen login must remain intact after admin account cleanup');

  // Restore clean seeded database state at the end of the test suite
  await reqJson('/api/reset', { method: 'POST' });
});




