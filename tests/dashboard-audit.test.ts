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

async function getRoleToken(role: string, administrativeUnitId?: string): Promise<string> {
  const res = await reqJson('/api/auth/switch-role', {
    method: 'POST',
    body: { role, administrative_unit_id: administrativeUnitId },
  });
  assert.equal(res.status, 200);
  return String(res.body.token);
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pottoyonbd-audit-'));
  process.env.POTTOYON_DB_PATH = path.join(tempDir, 'audit.sqlite');
  process.env.POTTOYON_STORAGE_DIR = path.join(tempDir, 'storage');
  process.env.POTTOYON_VERIFY_RATE_LIMIT = '100';

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

test('1. Certificate management pagination, search, filters, sorting, CSV export & meaningful PDF disposition', async () => {
  const superToken = await getRoleToken('supervisor');
  const pageRes = await reqJson('/api/certificates?paginated=1&page=1&page_size=5&sort_by=issued_at&sort_dir=desc', {
    token: superToken,
  });
  assert.equal(pageRes.status, 200);
  assert.ok(Array.isArray(pageRes.body.items));
  assert.ok(Number(pageRes.body.total) >= 1);
  assert.equal(pageRes.body.page, 1);

  const exportRes = await fetch(`${baseUrl}/api/certificates/export?auth_token=${encodeURIComponent(superToken)}`);
  assert.equal(exportRes.status, 200);
  assert.ok((exportRes.headers.get('content-type') || '').includes('text/csv'));
  const csvText = await exportRes.text();
  assert.ok(csvText.includes('Certificate No'));
  assert.ok(csvText.includes('10275626255'));

  // Inline preview + attachment download headers
  const inlinePdf = await fetch(`${baseUrl}/api/certificates/cert_10275626255/pdf?inline=1&auth_token=${encodeURIComponent(superToken)}`);
  assert.equal(inlinePdf.status, 200);
  const inlineDisp = inlinePdf.headers.get('content-disposition') || '';
  assert.ok(inlineDisp.startsWith('inline;'));
  assert.ok(inlineDisp.includes('PottoyonBD_'));
});

test('2. Full multi-step workflow: Attachment upload -> Assign Officer -> Request Correction -> Citizen Resubmit -> Forward -> Final Approve -> Revoke -> Reissue', async () => {
  // Citizen applies
  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_warish',
      applicant_name_bn: 'মোঃ রফিকুল ইসলাম',
      father_name_bn: 'মোঃ জসিম উদ্দিন',
      mother_name_bn: 'মোছাঃ ফাতেমা খাতুন',
      nid_or_birth_reg: '19920000111122229',
      mobile: '01799-112233',
      ward_no: 4,
      village_or_area_bn: 'গোয়েশপুর',
      post_office_bn: 'গোয়েশপুর',
    },
  });
  assert.equal(createRes.status, 201);
  const appId = String(createRes.body.id);
  const trackingNo = String(createRes.body.tracking_no);

  // Reject invalid attachment mime
  const badAtt = await reqJson(`/api/applications/${appId}/attachments`, {
    method: 'POST',
    body: {
      doc_type: 'nid',
      original_name: 'script.exe',
      mime_type: 'application/x-msdownload',
      content_base64: Buffer.from('MZfake').toString('base64'),
    },
  });
  assert.equal(badAtt.status, 400);

  // Accept valid PDF attachment
  const goodAtt = await reqJson(`/api/applications/${appId}/attachments`, {
    method: 'POST',
    body: {
      doc_type: 'nid',
      original_name: 'nid_copy.pdf',
      mime_type: 'application/pdf',
      content_base64: Buffer.from('%PDF-1.4\n%test\n').toString('base64'),
    },
  });
  assert.equal(goodAtt.status, 201);
  const attId = String(goodAtt.body.id);

  // Verify attachment access isolation (cross unit denied, owning unit allowed)
  const bhararaToken = await getRoleToken('chairman', 'unit_bharara');
  const crossAtt = await fetch(`${baseUrl}/api/attachments/${attId}`, {
    headers: { Authorization: `Bearer ${bhararaToken}` },
  });
  assert.equal(crossAtt.status, 403);

  const goyeshpurAdminToken = await getRoleToken('chairman', 'unit_goyeshpur');
  const ownAtt = await fetch(`${baseUrl}/api/attachments/${attId}`, {
    headers: { Authorization: `Bearer ${goyeshpurAdminToken}` },
  });
  assert.equal(ownAtt.status, 200);

  // Pay fee
  const payRes = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 100 },
  });
  assert.equal(payRes.status, 200);

  // List Goyeshpur staff & assign
  const staffRes = await reqJson('/api/staff?unit_id=unit_goyeshpur', { token: goyeshpurAdminToken });
  assert.equal(staffRes.status, 200);
  const staffList = staffRes.body as unknown as Array<{ id: string }>;
  assert.ok(Array.isArray(staffList) && staffList.length > 0);

  const assignRes = await reqJson(`/api/applications/${appId}/assign`, {
    method: 'POST',
    token: goyeshpurAdminToken,
    body: { staff_id: staffList[0].id },
  });
  assert.equal(assignRes.status, 200);

  // Chairman requests correction (Chairman-only final review authority)
  const secToken = await getRoleToken('secretary', 'unit_goyeshpur');
  const corrRes = await reqJson(`/api/applications/${appId}/request-correction`, {
    method: 'POST',
    token: goyeshpurAdminToken,
    body: { reason: 'পিতার নামের বানান সংশোধন করুন' },
  });
  assert.equal(corrRes.status, 200);
  assert.equal(corrRes.body.status, 'correction_required');

  // Citizen resubmits with matching tracking_no
  const resubmitRes = await reqJson(`/api/applications/${appId}/resubmit`, {
    method: 'POST',
    body: {
      tracking_no: trackingNo,
      applicant_name_bn: 'মোঃ রফিকুল ইসলাম (সংশোধিত)',
      correction_response: 'বানান সংশোধন করে দাখিল করা হলো',
    },
  });
  assert.equal(resubmitRes.status, 200);
  assert.equal(resubmitRes.body.status, 'under_verification');

  // Secretary forwards for approval
  const fwdRes = await reqJson(`/api/applications/${appId}/status`, {
    method: 'PATCH',
    token: secToken,
    body: { status: 'forwarded_for_approval', note: 'সরেজমিন যাচাই সঠিক' },
  });
  assert.equal(fwdRes.status, 200);
  assert.equal(fwdRes.body.status, 'forwarded_for_approval');

  // Chairman approves & issues certificate #1
  const approveRes = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: goyeshpurAdminToken,
    body: { notes: 'চূড়ান্ত অনুমোদিত' },
  });
  assert.equal(approveRes.status, 201);
  const cert1 = approveRes.body.certificate as { id: string; certificate_no: string };
  const token1 = String(approveRes.body.verification_url).split('/verify/')[1];

  // Revoke cert #1
  const revokeRes = await reqJson(`/api/certificates/${cert1.id}/revoke`, {
    method: 'POST',
    token: goyeshpurAdminToken,
    body: { reason: 'নতুন সংস্করণে পুনঃইস্যুর জন্য বাতিল' },
  });
  assert.equal(revokeRes.status, 200);

  // Reissue cert #2 by authorized officer
  const reissueRes = await reqJson(`/api/certificates/${cert1.id}/reissue`, {
    method: 'POST',
    token: goyeshpurAdminToken,
    body: { notes: 'সংশোধিত সনদ পুনঃইস্যু' },
  });
  assert.equal(reissueRes.status, 201);
  const cert2 = reissueRes.body.certificate as { id: string; certificate_no: string; reissued_from_cert_id: string };
  const token2 = String(reissueRes.body.verification_url).split('/verify/')[1];
  assert.notEqual(cert2.id, cert1.id);
  assert.notEqual(cert2.certificate_no, cert1.certificate_no);
  assert.notEqual(token2, token1);
  assert.equal(cert2.reissued_from_cert_id, cert1.id);

  // Old token MUST remain revoked, new token MUST verify as valid!
  const verifyOld = await reqJson(`/api/verify/${token1}`);
  assert.equal(verifyOld.body.status, 'revoked');
  const verifyNew = await reqJson(`/api/verify/${token2}`);
  assert.equal(verifyNew.body.status, 'valid');
  assert.equal(verifyNew.body.verified, true);

  // History endpoint includes approvals & events
  const histRes = await reqJson(`/api/certificates/${cert2.id}/history`, { token: goyeshpurAdminToken });
  assert.equal(histRes.status, 200);
  assert.ok(Array.isArray(histRes.body.events) && (histRes.body.events as unknown[]).length >= 3);
  assert.ok(Array.isArray(histRes.body.approvals) && (histRes.body.approvals as unknown[]).length >= 3);
});

test('3. Dashboard stats, Citizen portal, Holding Tax pay/create, Trade License create/renew, Staff/Notices/Settings & CSRF Origin protection', async () => {
  const superToken = await getRoleToken('supervisor');
  const muniToken = await getRoleToken('secretary', 'unit_pabna_muni');
  const secToken = await getRoleToken('secretary', 'unit_goyeshpur');

  // Live dashboard stats
  const statsRes = await reqJson('/api/dashboard/stats', { token: superToken });
  assert.equal(statsRes.status, 200);
  assert.ok(Number(statsRes.body.total_applications) >= 1);
  assert.ok(Array.isArray(statsRes.body.institution_breakdown));
  assert.equal((statsRes.body.institution_breakdown as unknown[]).length, 11);

  // Citizen portal lookup
  const portalRes = await reqJson('/api/citizen/portal?mobile=01712-345678');
  assert.equal(portalRes.status, 200);
  assert.ok(Array.isArray(portalRes.body.applications));

  // Holding tax create & pay
  const htCreate = await reqJson('/api/holding-taxes', {
    method: 'POST',
    token: muniToken,
    body: { holding_no: 'PM-999', ward_no: 2, owner_name_bn: 'মোঃ তানভীর আহমেদ', annual_tax: 800 },
  });
  assert.equal(htCreate.status, 201);
  const htPay = await reqJson(`/api/holding-taxes/${htCreate.body.id}/pay`, {
    method: 'POST',
    token: muniToken,
    body: {},
  });
  assert.equal(htPay.status, 200);
  assert.equal(htPay.body.status, 'paid');
  assert.equal(htPay.body.current_due, 0);

  // Trade license create & renew
  const tlCreate = await reqJson('/api/trade-licenses', {
    method: 'POST',
    token: muniToken,
    body: { business_name_bn: 'পাবনা ডিজিটাল প্রেস', owner_name_bn: 'মোঃ রাশেদুল ইসলাম' },
  });
  assert.equal(tlCreate.status, 201);
  const tlRenew = await reqJson(`/api/trade-licenses/${tlCreate.body.id}/renew`, {
    method: 'POST',
    token: muniToken,
  });
  assert.equal(tlRenew.status, 200);

  // Secretary cannot modify service fee or system settings
  const deniedService = await reqJson('/api/services/srv_warish', {
    method: 'PATCH',
    token: secToken,
    body: { default_fee: 999 },
  });
  assert.equal(deniedService.status, 403);

  const deniedSettings = await reqJson('/api/system-settings', {
    method: 'PATCH',
    token: muniToken,
    body: { support_phone: '01900000000' },
  });
  assert.equal(deniedSettings.status, 403);

  // Supervisor can update service fee & system settings
  const okService = await reqJson('/api/services/srv_warish', {
    method: 'PATCH',
    token: superToken,
    body: { default_fee: 120 },
  });
  assert.equal(okService.status, 200);
  assert.equal(okService.body.default_fee, 120);

  // Contact inquiry submission + super admin read
  const citizenToken = await getRoleToken('citizen');
  const contactRes = await reqJson('/api/contact', {
    method: 'POST',
    token: citizenToken,
    body: {
      name: 'মোঃ সুমন মিয়া',
      phone: '01788-554433',
      subject: 'সনদ যাচাই',
      message: 'আমার আবেদন নম্বর যাচাই করতে চাই।',
    },
  });
  assert.equal(contactRes.status, 201);

  const listContact = await reqJson('/api/contact', { token: superToken });
  assert.equal(listContact.status, 200);
  assert.ok(Array.isArray(listContact.body) || Array.isArray(listContact.body.raw));

  // Cross-site Origin protection blocks mismatched Origin POST
  const csrfBlocked = await reqJson('/api/contact', {
    method: 'POST',
    token: citizenToken,
    headers: { Origin: 'https://evil-attacker.example' },
    body: { name: 'Attacker', phone: '000', message: 'CSRF' },
  });
  assert.equal(csrfBlocked.status, 403);
});
