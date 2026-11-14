import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.ts';
import { resetDbInstanceForTests } from '../server/db.ts';
import { isValidPdfBuffer, isValidPdfFile } from '../server/pdfGenerator.ts';

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

async function extractPdfTextAndPageInfo(bytes: Uint8Array): Promise<{
  numPages: number;
  pageSizes: Array<{ width: number; height: number }>;
  text: string;
}> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    useWorkerFetch: false,
  });
  const doc = await loadingTask.promise;
  const pageSizes: Array<{ width: number; height: number }> = [];
  const textParts: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({ width: Math.round(viewport.width), height: Math.round(viewport.height) });
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    textParts.push(strings.join(' '));
  }
  await loadingTask.destroy();
  return {
    numPages: pageSizes.length,
    pageSizes,
    text: textParts.join('\n').replace(/\s+/g, ' '),
  };
}

function assertValidGhostscriptPdf(bytes: Buffer, label: string) {
  assert.ok(isValidPdfBuffer(bytes), `${label}: buffer failed PDF header/EOF/size check`);
  const tmpPdf = path.join(tempDir, `${label.replace(/[^a-z0-9_-]/gi, '_')}.pdf`);
  fs.writeFileSync(tmpPdf, bytes);
  assert.ok(isValidPdfFile(tmpPdf), `${label}: file validation failed`);
  if (fs.existsSync('/usr/bin/gs')) {
    execFileSync('/usr/bin/gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=nullpage', tmpPdf], {
      stdio: 'pipe',
    });
  }
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pottoyonbd-pdf-audit-'));
  process.env.POTTOYON_DB_PATH = path.join(tempDir, 'test.sqlite');
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

test('1. PDF binary validity, Ghostscript parsing, Bangla+English text extraction & A4 portrait/landscape rendering', async () => {
  const token = await getRoleToken('chairman', 'unit_goyeshpur');

  // Portrait download
  const portraitRes = await fetch(`${baseUrl}/api/certificates/cert_10275626255/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(portraitRes.status, 200);
  assert.equal(portraitRes.headers.get('content-type'), 'application/pdf');
  assert.match(portraitRes.headers.get('content-disposition') || '', /attachment; filename="PottoyonBD_.*\.pdf"/);
  assert.equal(portraitRes.headers.get('x-content-type-options'), 'nosniff');

  const portraitBytes = Buffer.from(await portraitRes.arrayBuffer());
  assert.equal(Number(portraitRes.headers.get('content-length')), portraitBytes.length);
  assertValidGhostscriptPdf(portraitBytes, 'seed_portrait');

  const portraitInfo = await extractPdfTextAndPageInfo(portraitBytes);
  assert.ok(portraitInfo.numPages >= 1);
  assert.ok(portraitInfo.pageSizes[0].height > portraitInfo.pageSizes[0].width, 'Portrait A4 must have height > width');
  assert.ok(portraitInfo.text.includes('10275626255'), 'PDF text should include certificate number');
  assert.ok(portraitInfo.text.toUpperCase().includes('POTTOYONBD'), 'PDF text should include PottoyonBD brand');

  // Landscape inline preview
  const landscapeRes = await fetch(
    `${baseUrl}/api/certificates/cert_10275626255/pdf?inline=1&orientation=landscape`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  assert.equal(landscapeRes.status, 200);
  assert.equal(landscapeRes.headers.get('content-type'), 'application/pdf');
  assert.match(landscapeRes.headers.get('content-disposition') || '', /inline; filename=/);

  const landscapeBytes = Buffer.from(await landscapeRes.arrayBuffer());
  assertValidGhostscriptPdf(landscapeBytes, 'seed_landscape');
  const landscapeInfo = await extractPdfTextAndPageInfo(landscapeBytes);
  assert.ok(landscapeInfo.pageSizes[0].width > landscapeInfo.pageSizes[0].height, 'Landscape A4 must have width > height');
});

test('2. Multi-page Warish certificate with 16 heirs paginates cleanly with all heirs present', async () => {
  const heirs = Array.from({ length: 16 }, (_, idx) => ({
    sl: idx + 1,
    name: `ওয়ারিশ সদস্য ${idx + 1} (Heir Member ${idx + 1})`,
    dob: `০${(idx % 9) + 1}-০১-১৯৯${idx % 10}`,
    age: 20 + idx,
    relation: idx === 0 ? 'স্ত্রী' : idx % 2 === 0 ? 'পুত্র' : 'কন্যা',
  }));

  const createRes = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_warish',
      applicant_name_bn: 'মোঃ আব্দুর রাজ্জাক প্রামানিক',
      applicant_name_en: 'Md. Abdur Razzak Pramanik',
      father_name_bn: 'মৃত কফিল উদ্দিন',
      mother_name_bn: 'মৃত জরিনা খাতুন',
      nid_or_birth_reg: '19757615547001122',
      mobile: '01722-334455',
      ward_no: 3,
      village_or_area_bn: 'জালালপুর',
      post_office_bn: 'পাবনা - ৬৬০০',
      heirs,
    },
  });
  assert.equal(createRes.status, 201);
  const appId = String(createRes.body.id);

  const payRes = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 100 },
  });
  assert.equal(payRes.status, 200);

  const chairmanToken = await getRoleToken('chairman', 'unit_goyeshpur');
  const approveRes = await reqJson(`/api/applications/${appId}/final-approve`, {
    method: 'POST',
    token: chairmanToken,
    body: { note_bn: 'সব ওয়ারিশ সঠিক।' },
  });
  assert.equal(approveRes.status, 201);
  const certId = String((approveRes.body.certificate as Record<string, unknown>).id);

  const pdfRes = await fetch(`${baseUrl}/api/certificates/${certId}/pdf`, {
    headers: { Authorization: `Bearer ${chairmanToken}` },
  });
  assert.equal(pdfRes.status, 200);
  const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
  assertValidGhostscriptPdf(pdfBytes, 'multi_page_16_heirs');

  const info = await extractPdfTextAndPageInfo(pdfBytes);
  assert.ok(info.numPages >= 2, `Expected multi-page PDF for 16 heirs, got ${info.numPages} page(s)`);
  assert.ok(info.text.includes('Heir Member 16'), 'Last heir row (16) must not be truncated');
  assert.ok(info.text.includes('Heir Member 1'), 'First heir row (1) must be present');
});

test('3. Missing or corrupted PDF on disk is automatically regenerated on download', async () => {
  const token = await getRoleToken('chairman', 'unit_goyeshpur');
  const certPdfPath = path.join(
    process.env.POTTOYON_STORAGE_DIR!,
    'unit_goyeshpur',
    '10275626255.pdf'
  );
  assert.ok(fs.existsSync(certPdfPath), 'Seed certificate PDF should exist');

  // Case A: Corrupt the file with invalid garbage
  fs.writeFileSync(certPdfPath, 'CORRUPTED_NOT_A_PDF');
  const repairedRes = await fetch(`${baseUrl}/api/certificates/cert_10275626255/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(repairedRes.status, 200);
  const repairedBytes = Buffer.from(await repairedRes.arrayBuffer());
  assertValidGhostscriptPdf(repairedBytes, 'repaired_from_corrupt');

  // Case B: Delete the file completely
  fs.unlinkSync(certPdfPath);
  const recreatedRes = await fetch(`${baseUrl}/api/certificates/cert_10275626255/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(recreatedRes.status, 200);
  const recreatedBytes = Buffer.from(await recreatedRes.arrayBuffer());
  assertValidGhostscriptPdf(recreatedBytes, 'recreated_from_missing');
});

test('4. Security hardening: Fee tampering, ward validation, duplicate/rejected payment, attachment magic bytes & settings persistence', async () => {
  // 4A. Client tries to tamper fee_amount=0, status='certificate_issued', and invalid ward_no=99 on Union (9 wards)
  const tamperedApp = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_warish',
      applicant_name_bn: 'জালিয়াতি পরীক্ষা',
      father_name_bn: 'পিতার নাম',
      mother_name_bn: 'মাতার নাম',
      nid_or_birth_reg: '19881234567890001',
      mobile: '01755-667788',
      ward_no: 99,
      village_or_area_bn: 'গ্রাম',
      post_office_bn: 'পাবনা',
    },
  });
  assert.equal(tamperedApp.status, 400, 'Invalid ward_no=99 for 9-ward union should return 400');

  const forcedServerFieldsApp = await reqJson('/api/applications', {
    method: 'POST',
    body: {
      administrative_unit_id: 'unit_goyeshpur',
      service_id: 'srv_warish',
      applicant_name_bn: 'সঠিক আবেদনকারী',
      father_name_bn: 'পিতার নাম',
      mother_name_bn: 'মাতার নাম',
      nid_or_birth_reg: '19881234567890002',
      mobile: '01755-667799',
      ward_no: 5,
      village_or_area_bn: 'জালালপুর',
      post_office_bn: 'পাবনা',
      fee_amount: 0,
      status: 'certificate_issued',
      payment_status: 'paid',
    },
  });
  assert.equal(forcedServerFieldsApp.status, 201);
  assert.equal(forcedServerFieldsApp.body.fee_amount, 100, 'Server must override client fee_amount with service.default_fee');
  assert.equal(forcedServerFieldsApp.body.status, 'pending_payment', 'Server must ignore forged status');
  assert.equal(forcedServerFieldsApp.body.payment_status, 'unpaid', 'Server must ignore forged payment_status');

  const appId = String(forcedServerFieldsApp.body.id);

  // 4B. Attachment upload rejects mismatched magic bytes (.exe/text disguised as PDF)
  const badAttachmentRes = await reqJson(`/api/applications/${appId}/attachments`, {
    method: 'POST',
    body: {
      tracking_no: forcedServerFieldsApp.body.tracking_no,
      doc_type: 'nid',
      original_name: 'fake.pdf',
      mime_type: 'application/pdf',
      content_base64: Buffer.from('MZ_FAKE_EXECUTABLE_PAYLOAD').toString('base64'),
    },
  });
  assert.equal(badAttachmentRes.status, 400, 'Magic byte mismatch should reject fake PDF');

  // Valid PDF attachment with matching tracking_no succeeds
  const validPdfPayload = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF').toString('base64');
  const goodAttachmentRes = await reqJson(`/api/applications/${appId}/attachments`, {
    method: 'POST',
    body: {
      tracking_no: forcedServerFieldsApp.body.tracking_no,
      doc_type: 'nid',
      original_name: 'nid.pdf',
      mime_type: 'application/pdf',
      content_base64: validPdfPayload,
    },
  });
  assert.equal(goodAttachmentRes.status, 201);

  // 4C. Payment blocks zero-fee bypass, enforces authoritative server fee & blocks duplicate payments
  const zeroAmountPay = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 0 },
  });
  assert.equal(zeroAmountPay.status, 400, 'Zero-amount bypass must be rejected with 400');

  const validPay = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'bkash', amount: 1 },
  });
  assert.equal(validPay.status, 200);
  assert.equal(validPay.body.amount, 100, 'Server must bill authoritative fee_amount even if tampered amount is sent');

  const duplicatePay = await reqJson('/api/payments/checkout', {
    method: 'POST',
    body: { applicationId: appId, method: 'nagad', amount: 100 },
  });
  assert.equal(duplicatePay.status, 409, 'Duplicate payment must be rejected with 409');

  // 4D. Supervisor system settings integrations persist & non-whitelisted RBAC keys are stripped
  const superAdminToken = await getRoleToken('supervisor', 'all');
  const permUpdate = await reqJson('/api/role-permissions/secretary', {
    method: 'PATCH',
    token: superAdminToken,
    body: {
      can_manage_revenue: true,
      malicious_extra_column: 'hack',
    },
  });
  assert.equal(permUpdate.status, 200);
  assert.equal((permUpdate.body as Record<string, unknown>).malicious_extra_column, undefined);

  const settingsUpdate = await reqJson('/api/system-settings', {
    method: 'PATCH',
    token: superAdminToken,
    body: {
      platform_name_bn: 'PottoyonBD পাবনা সদর',
      integrations: {
        smtp_enabled: true,
        smtp_host: 'smtp.gov.bd.example',
        smtp_port: 587,
        sms_enabled: true,
        sms_provider: 'SSLWireless',
        payment_gateway_mode: 'sandbox',
      },
    },
  });
  assert.equal(settingsUpdate.status, 200);

  const settingsFetch = await reqJson('/api/system-settings', { token: superAdminToken });
  assert.equal(settingsFetch.status, 200);
  const integrations = settingsFetch.body.integrations as Record<string, unknown>;
  assert.equal(integrations.smtp_enabled, true);
  assert.equal(integrations.smtp_host, 'smtp.gov.bd.example');
  assert.equal(integrations.sms_provider, 'SSLWireless');
});
