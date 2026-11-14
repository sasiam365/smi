import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import puppeteer from 'puppeteer';
import type { AdministrativeUnit, WarishMember } from '../src/types/index.ts';
import { getCertificateStorageRoot, isTestingApp } from './envConfig.ts';

export { getCertificateStorageRoot };

const GOVT_SEAL_PNG_PATH = path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'govt_seal.png');
const GOVT_SEAL_WATERMARK_PNG_PATH = path.resolve(
  process.cwd(),
  'public',
  'assets',
  'aistudio',
  'govt_seal_watermark.png'
);

const NOTO_BENGALI_REGULAR_PATH = path.resolve(process.cwd(), 'server', 'fonts', 'NotoSansBengali-Regular.ttf');
const NOTO_BENGALI_BOLD_PATH = path.resolve(process.cwd(), 'server', 'fonts', 'NotoSansBengali-Bold.ttf');

let regularFontBase64 = '';
let boldFontBase64 = '';

try {
  if (fs.existsSync(NOTO_BENGALI_REGULAR_PATH)) {
    regularFontBase64 = fs.readFileSync(NOTO_BENGALI_REGULAR_PATH).toString('base64');
  } else if (fs.existsSync('/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf')) {
    regularFontBase64 = fs.readFileSync('/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf').toString('base64');
  }
} catch (e) {
  console.warn('Could not read NotoSansBengali-Regular.ttf:', e);
}

try {
  if (fs.existsSync(NOTO_BENGALI_BOLD_PATH)) {
    boldFontBase64 = fs.readFileSync(NOTO_BENGALI_BOLD_PATH).toString('base64');
  } else if (fs.existsSync('/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf')) {
    boldFontBase64 = fs.readFileSync('/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf').toString('base64');
  }
} catch (e) {
  console.warn('Could not read NotoSansBengali-Bold.ttf:', e);
}

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

export function toBengaliDigits(input: string | number | undefined | null): string {
  return String(input ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] || d);
}

export function formatShortOfficerTitle(rawTitleBn: string): string {
  const clean = String(rawTitleBn || '').trim();
  if (!clean) return 'প্রশাসক';
  const beforeComma = clean.split(',')[0].trim();
  return beforeComma || clean;
}

export function normalizeAddressForCertificate(
  rawAddr: string,
  unitNameBn: string,
  upazilaBn = 'পাবনা সদর',
  districtBn = 'পাবনা'
): string {
  let cleaned = String(rawAddr || '')
    .replace(/^(স্থায়ী ঠিকানা|বর্তমান ঠিকানা)\s*[:ঃ-]*\s*/u, '')
    .trim();
  if (!cleaned) {
    cleaned = `গ্রাম/বাড়ীঃ ${unitNameBn.replace(/\s*ইউনিয়ন পরিষদ$/, '')}, ডাকঘরঃ ${upazilaBn} - ৬৬০০, ওয়ার্ড নম্বরঃ ৪, ${unitNameBn}, থানাঃ ${upazilaBn}, উপজেলাঃ ${upazilaBn}, জেলাঃ ${districtBn}।`;
  }
  if (!cleaned.endsWith('।')) {
    cleaned += '।';
  }
  return cleaned;
}


export function isValidPdfBuffer(buf: Buffer | Uint8Array): boolean {
  if (!buf || buf.byteLength < 1000) return false;
  const header = Buffer.from(buf.subarray(0, 5)).toString('ascii');
  if (header !== '%PDF-') return false;
  const tailStart = Math.max(0, buf.byteLength - 1024);
  const tail = Buffer.from(buf.subarray(tailStart)).toString('ascii');
  return tail.includes('%%EOF');
}

export function isValidPdfFile(filePath: string): boolean {
  if (!filePath || !fs.existsSync(filePath)) return false;
  let fd: number | null = null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 1000) return false;
    fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(8);
    fs.readSync(fd, head, 0, 8, 0);
    if (!head.toString('ascii').startsWith('%PDF-')) return false;
    const tailLen = Math.min(1024, stat.size);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, stat.size - tailLen);
    return tail.toString('ascii').includes('%%EOF');
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close errors
      }
    }
  }
}

export interface CertificatePdfPayload {
  certificateNumber: string;
  certificateTitleBn: string;
  issueDateBn: string;
  issueDateEn: string;
  expiresAtIso?: string | null;
  applicantNameBn: string;
  fatherNameBn: string;
  motherNameBn: string;
  permanentAddressBn: string;
  presentAddressBn: string;
  heirs?: WarishMember[];
  unit: AdministrativeUnit;
  officerNameBn: string;
  officerTitleBn: string;
  verificationUrl: string;
  templateVersionId: string;
  status?: 'valid' | 'revoked' | 'expired';
  orientation?: 'portrait' | 'landscape';
}

export async function generateQrDataUrl(verificationUrl: string): Promise<string> {
  return QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 240,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  });
}

export async function generateAndStoreCertificatePdf(
  payload: CertificatePdfPayload
): Promise<{ pdfPath: string; qrDataUrl: string; byteLength: number }> {
  const storageRoot = getCertificateStorageRoot();
  const safeUnitDir = payload.unit.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCertNo = payload.certificateNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = path.join(storageRoot, safeUnitDir);
  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const orientation = payload.orientation === 'landscape' ? 'landscape' : 'portrait';
  const suffix = orientation === 'landscape' ? '.landscape.pdf' : '.pdf';
  const pdfPath = path.join(targetDir, `${safeCertNo}${suffix}`);

  const qrDataUrl = await generateQrDataUrl(payload.verificationUrl);

  let sealBase64 = '';
  if (fs.existsSync(GOVT_SEAL_PNG_PATH)) {
    try {
      const sealBuf = fs.readFileSync(GOVT_SEAL_PNG_PATH);
      sealBase64 = `data:image/png;base64,${sealBuf.toString('base64')}`;
    } catch {}
  }

  let watermarkBase64 = '';
  if (fs.existsSync(GOVT_SEAL_WATERMARK_PNG_PATH)) {
    try {
      const wmBuf = fs.readFileSync(GOVT_SEAL_WATERMARK_PNG_PATH);
      watermarkBase64 = `data:image/png;base64,${wmBuf.toString('base64')}`;
    } catch {}
  }

  const isTestingEnv = isTestingApp();
  const isRevoked = payload.status === 'revoked';
  const certNoBn = toBengaliDigits(payload.certificateNumber);

  const permAddress = normalizeAddressForCertificate(
    payload.permanentAddressBn,
    payload.unit.name_bn,
    payload.unit.upazila_bn,
    payload.unit.district_bn
  );
  const presAddress = normalizeAddressForCertificate(
    payload.presentAddressBn,
    payload.unit.name_bn,
    payload.unit.upazila_bn,
    payload.unit.district_bn
  );
  const hasHeirs = Boolean(payload.heirs && payload.heirs.length > 0);
  const shortOfficerTitle = formatShortOfficerTitle(payload.officerTitleBn);
  const hasMultiplePages = Boolean(payload.heirs && payload.heirs.length > 7);
  const FIRST_PAGE_LIMIT = 7;
  const page1Heirs = hasMultiplePages ? payload.heirs!.slice(0, FIRST_PAGE_LIMIT) : (payload.heirs || []);
  const page2Heirs = hasMultiplePages ? payload.heirs!.slice(FIRST_PAGE_LIMIT) : [];

  const fontFaceCss = regularFontBase64 && boldFontBase64 ? `
    @font-face {
      font-family: 'Noto Sans Bengali';
      src: url('data:font/truetype;charset=utf-8;base64,${regularFontBase64}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Noto Sans Bengali';
      src: url('data:font/truetype;charset=utf-8;base64,${boldFontBase64}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
  ` : `
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;700&display=swap');
  `;

  const htmlContent = `
<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <title>${payload.certificateTitleBn}</title>
  <style>
    ${fontFaceCss}

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    @page {
      size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
      margin: 0;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: #FFFFFF;
      color: #000000;
      font-family: 'Noto Sans Bengali', system-ui, -apple-system, sans-serif;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    .page-container {
      width: ${orientation === 'landscape' ? '297mm' : '210mm'};
      height: ${orientation === 'landscape' ? '210mm' : '297mm'};
      padding: 8mm;
      background: #FFFFFF;
      box-sizing: border-box;
      page-break-after: always;
      break-after: page;
    }

    .page-container:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }

    /* Outer Thick Frame matching WarishCertificateView.tsx */
    .outer-frame {
      border: 2.5px solid #000000;
      padding: 3.5px;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    /* Inner Thin Frame */
    .inner-frame {
      border: 1px solid #000000;
      padding: ${orientation === 'landscape' ? '12px 24px 10px 24px' : '18px 28px 12px 28px'};
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
      box-sizing: border-box;
      overflow: hidden;
    }

    /* Watermark Seal Behind Content */
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 270px;
      height: 270px;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
    }

    /* Main Foreground Content Layer */
    .content-layer {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      height: 100%;
    }

    .header-section {
      text-align: center;
      margin-bottom: 2px;
    }

    .seal-img {
      width: 60px;
      height: 60px;
      object-fit: contain;
      margin: 0 auto 3px auto;
      display: block;
    }

    .unit-name {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 2px 0;
      line-height: 1.25;
      color: #000000;
    }

    .unit-location {
      font-size: 13.5px;
      font-weight: 400;
      margin: 0 0 3px 0;
      line-height: 1.25;
      color: #000000;
    }

    .cert-title {
      font-size: 18px;
      font-weight: 700;
      margin: 2px 0 6px 0;
      line-height: 1.3;
      color: #000000;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13.5px;
      font-weight: 700;
      margin-top: 4px;
      margin-bottom: 8px;
      color: #000000;
    }

    .tabular-nums {
      font-variant-numeric: tabular-nums;
    }

    .body-content {
      font-size: 13.5px;
      line-height: 1.8;
      text-align: justify;
      color: #000000;
      margin-bottom: 8px;
    }

    .body-content strong {
      font-weight: 700;
    }

    .table-container {
      margin-top: 6px;
      margin-bottom: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000000;
      font-size: 12.5px;
      background: transparent;
    }

    th, td {
      border: 1px solid #000000;
      padding: 4px 6px;
      text-align: center;
      color: #000000;
    }

    th {
      font-weight: 700;
      background: #F8FAFC;
    }

    td.text-left {
      text-align: left;
    }

    .post-table-notes {
      margin-top: 6px;
      font-size: 13px;
      line-height: 1.75;
      text-align: justify;
      color: #000000;
    }

    .post-table-notes p {
      margin: 0 0 4px 0;
    }

    .single-attestation {
      margin-top: 6px;
      font-size: 13.5px;
      line-height: 1.8;
      text-align: left;
      color: #000000;
    }

    .footer-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 10px;
      padding-top: 4px;
    }

    .qr-box {
      width: 96px;
      height: 96px;
      position: relative;
      flex-shrink: 0;
      background: #FFFFFF;
    }

    .qr-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .qr-center-seal {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 22px;
      height: 22px;
      background: #FFFFFF;
      border-radius: 50%;
      padding: 1px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    }

    .sig-box {
      text-align: right;
      width: 230px;
      line-height: 1.4;
    }

    .sig-line {
      border-top: 1px dashed #000000;
      width: 130px;
      margin-left: auto;
      margin-bottom: 4px;
    }

    .sig-name {
      font-weight: 700;
      font-size: 14px;
      margin: 0;
      color: #000000;
    }

    .sig-title {
      font-size: 12.5px;
      margin: 1px 0 0 0;
      color: #000000;
    }

    .sig-location {
      font-size: 12px;
      margin: 1px 0 0 0;
      color: #000000;
    }

    .verify-url {
      text-align: center;
      font-size: 10px;
      color: #333333;
      margin-top: 4px;
    }

    .testing-banner {
      background: #FEF3C7;
      color: #92400E;
      text-align: center;
      font-weight: 700;
      font-size: 11px;
      padding: 4px;
      margin-bottom: 6px;
      border: 1px solid #FCD34D;
      border-radius: 3px;
    }

    .revoked-banner {
      background: #FEE2E2;
      color: #991B1B;
      text-align: center;
      font-weight: 700;
      font-size: 11px;
      padding: 4px;
      margin-bottom: 6px;
      border: 1px solid #FCA5A5;
      border-radius: 3px;
    }
  </style>
</head>
<body>
${!hasMultiplePages ? `
  <div class="page-container">
    <div class="outer-frame">
      <div class="inner-frame">
        ${watermarkBase64 ? `<img src="${watermarkBase64}" class="watermark" alt="Watermark" />` : ''}

        <div class="content-layer">
          <div>
            ${isRevoked ? '<div class="revoked-banner">বাতিলকৃত সনদ / REVOKED CERTIFICATE</div>' : ''}
            ${isTestingEnv && !isRevoked ? '<div class="testing-banner">TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — বৈধ নয়</div>' : ''}

            <div class="header-section">
              ${sealBase64 ? `<img src="${sealBase64}" class="seal-img" alt="Government Seal" />` : ''}
              <h1 class="unit-name">${payload.unit.name_bn}</h1>
              <div class="unit-location">${payload.unit.upazila_bn || 'পাবনা সদর'}, ${payload.unit.district_bn || 'পাবনা'}, বাংলাদেশ</div>
              <div class="cert-title">${payload.certificateTitleBn}</div>
            </div>

            <div class="meta-row">
              <div>সনদ নং:- <span class="tabular-nums">${certNoBn}</span></div>
              <div>ইস্যুর তারিখ:- <span>${payload.issueDateBn}</span></div>
            </div>

            <div class="body-content">
              এই মর্মে প্রত্যয়ন করা যাইতেছে যে, <strong>${payload.applicantNameBn}</strong>, পিতা/স্বামীঃ <strong>${payload.fatherNameBn}</strong>, মাতাঃ <strong>${payload.motherNameBn}</strong> অত্র এলাকার একজন স্থায়ী বাসিন্দা। তাহার <strong>স্থায়ী ঠিকানাঃ-</strong> ${permAddress} <strong>বর্তমান ঠিকানাঃ-</strong> ${presAddress} ${hasHeirs ? 'উল্লিখিত ব্যক্তির পরিবারের সদস্যগণের তালিকা নিম্নরূপঃ' : 'তাহার স্বভাব ও চরিত্র উত্তম এবং আমাদের জানা মতে তাহার বিরুদ্ধে রাষ্ট্র বা সমাজবিরোধী কোনো অভিযোগ নাই।'}
            </div>

            ${hasHeirs && payload.heirs ? `
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th style="width: 12%;">ক্রমিক নং</th>
                    <th class="text-left" style="width: 41%;">নাম</th>
                    <th style="width: 18%;">জন্ম তারিখ</th>
                    <th style="width: 10%;">বয়স</th>
                    <th style="width: 19%;">সম্পর্ক</th>
                  </tr>
                </thead>
                <tbody>
                  ${payload.heirs.map((h, i) => `
                    <tr>
                      <td>${toBengaliDigits(i + 1)}</td>
                      <td class="text-left">${h.name || '-'}</td>
                      <td>${toBengaliDigits(h.dob || '-')}</td>
                      <td>${toBengaliDigits(h.age ?? '-')}</td>
                      <td>${h.relation || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="post-table-notes">
              <p>উল্লিখিত সদস্য/সদস্যগণ ছাড়া আর কোনো সদস্য নাই। আবেদনকারী যদি ইচ্ছাকৃতভাবে কোন সদস্য বাদ দিয়ে থাকেন তাহলে অনুমোদনকারী কোন ভাবেই দায়ী থাকিবেন না এবং উক্ত সনদ বাতিল বলিয়া গণ্য করা হইবে।</p>
              <p>আমি সকল সদস্যগণের মঙ্গল কামনা করিতেছি।</p>
            </div>
            ` : `
            <div class="single-attestation">
              <p>আমি তাহার সার্বিক মঙ্গল ও উন্নতি কামনা করিতেছি।</p>
            </div>
            `}
          </div>

          <div>
            <div class="footer-section">
              <div class="qr-box">
                <img src="${qrDataUrl}" class="qr-img" alt="QR Code" />
                ${sealBase64 ? `<img src="${sealBase64}" class="qr-center-seal" alt="Seal" />` : ''}
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-name">${payload.officerNameBn}</p>
                <p class="sig-title">${shortOfficerTitle}</p>
                <p class="sig-title">${payload.unit.name_bn}</p>
                <p class="sig-location">${payload.unit.upazila_bn || 'পাবনা সদর'}, ${payload.unit.district_bn || 'পাবনা'}</p>
              </div>
            </div>

            <div class="verify-url">
              যাচাইকরণ: ${payload.verificationUrl}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
` : `
  <!-- Page 1 of Multi-page Certificate -->
  <div class="page-container">
    <div class="outer-frame">
      <div class="inner-frame">
        ${watermarkBase64 ? `<img src="${watermarkBase64}" class="watermark" alt="Watermark" />` : ''}

        <div class="content-layer">
          <div>
            ${isRevoked ? '<div class="revoked-banner">বাতিলকৃত সনদ / REVOKED CERTIFICATE</div>' : ''}
            ${isTestingEnv && !isRevoked ? '<div class="testing-banner">TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — বৈধ নয়</div>' : ''}

            <div class="header-section">
              ${sealBase64 ? `<img src="${sealBase64}" class="seal-img" alt="Government Seal" />` : ''}
              <h1 class="unit-name">${payload.unit.name_bn}</h1>
              <div class="unit-location">${payload.unit.upazila_bn || 'পাবনা সদর'}, ${payload.unit.district_bn || 'পাবনা'}, বাংলাদেশ</div>
              <div class="cert-title">${payload.certificateTitleBn}</div>
            </div>

            <div class="meta-row">
              <div>সনদ নং:- <span class="tabular-nums">${certNoBn}</span></div>
              <div>ইস্যুর তারিখ:- <span>${payload.issueDateBn}</span></div>
            </div>

            <div class="body-content">
              এই মর্মে প্রত্যয়ন করা যাইতেছে যে, <strong>${payload.applicantNameBn}</strong>, পিতা/স্বামীঃ <strong>${payload.fatherNameBn}</strong>, মাতাঃ <strong>${payload.motherNameBn}</strong> অত্র এলাকার একজন স্থায়ী বাসিন্দা। তাহার <strong>স্থায়ী ঠিকানাঃ-</strong> ${permAddress} <strong>বর্তমান ঠিকানাঃ-</strong> ${presAddress} উল্লিখিত ব্যক্তির পরিবারের সদস্যগণের তালিকা নিম্নরূপঃ
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th style="width: 12%;">ক্রমিক নং</th>
                    <th class="text-left" style="width: 41%;">নাম</th>
                    <th style="width: 18%;">জন্ম তারিখ</th>
                    <th style="width: 10%;">বয়স</th>
                    <th style="width: 19%;">সম্পর্ক</th>
                  </tr>
                </thead>
                <tbody>
                  ${page1Heirs.map((h, i) => `
                    <tr>
                      <td>${toBengaliDigits(i + 1)}</td>
                      <td class="text-left">${h.name || '-'}</td>
                      <td>${toBengaliDigits(h.dob || '-')}</td>
                      <td>${toBengaliDigits(h.age ?? '-')}</td>
                      <td>${h.relation || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div style="text-align: right; font-size: 11px; margin-top: 8px; font-weight: 700; color: #333333;">
              (পরবর্তী অংশ পাতা ২-এ দ্রষ্টব্য)
            </div>
          </div>

          <div>
            <div class="verify-url" style="display: flex; justify-content: space-between; align-items: center; padding: 0 4px;">
              <span>যাচাইকরণ: ${payload.verificationUrl}</span>
              <span style="font-weight: 700;">পাতা ১ / ২</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Page 2 of Multi-page Certificate -->
  <div class="page-container">
    <div class="outer-frame">
      <div class="inner-frame">
        ${watermarkBase64 ? `<img src="${watermarkBase64}" class="watermark" alt="Watermark" />` : ''}

        <div class="content-layer">
          <div>
            <div class="header-section" style="margin-bottom: 6px;">
              ${sealBase64 ? `<img src="${sealBase64}" class="seal-img" style="width: 44px; height: 44px;" alt="Government Seal" />` : ''}
              <h1 class="unit-name" style="font-size: 19px;">${payload.unit.name_bn}</h1>
              <div class="cert-title" style="font-size: 15px; margin: 1px 0 3px 0;">${payload.certificateTitleBn} (পাতা ২)</div>
            </div>

            <div class="meta-row" style="margin-bottom: 6px;">
              <div>সনদ নং:- <span class="tabular-nums">${certNoBn}</span></div>
              <div>ইস্যুর তারিখ:- <span>${payload.issueDateBn}</span></div>
            </div>

            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th style="width: 12%;">ক্রমিক নং</th>
                    <th class="text-left" style="width: 41%;">নাম</th>
                    <th style="width: 18%;">জন্ম তারিখ</th>
                    <th style="width: 10%;">বয়স</th>
                    <th style="width: 19%;">সম্পর্ক</th>
                  </tr>
                </thead>
                <tbody>
                  ${page2Heirs.map((h, i) => `
                    <tr>
                      <td>${toBengaliDigits(FIRST_PAGE_LIMIT + i + 1)}</td>
                      <td class="text-left">${h.name || '-'}</td>
                      <td>${toBengaliDigits(h.dob || '-')}</td>
                      <td>${toBengaliDigits(h.age ?? '-')}</td>
                      <td>${h.relation || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="post-table-notes">
              <p>উল্লিখিত সদস্য/সদস্যগণ ছাড়া আর কোনো সদস্য নাই। আবেদনকারী যদি ইচ্ছাকৃতভাবে কোন সদস্য বাদ দিয়ে থাকেন তাহলে অনুমোদনকারী কোন ভাবেই দায়ী থাকিবেন না এবং উক্ত সনদ বাতিল বলিয়া গণ্য করা হইবে।</p>
              <p>আমি সকল সদস্যগণের মঙ্গল কামনা করিতেছি।</p>
            </div>
          </div>

          <div>
            <div class="footer-section">
              <div class="qr-box">
                <img src="${qrDataUrl}" class="qr-img" alt="QR Code" />
                ${sealBase64 ? `<img src="${sealBase64}" class="qr-center-seal" alt="Seal" />` : ''}
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                <p class="sig-name">${payload.officerNameBn}</p>
                <p class="sig-title">${shortOfficerTitle}</p>
                <p class="sig-title">${payload.unit.name_bn}</p>
                <p class="sig-location">${payload.unit.upazila_bn || 'পাবনা সদর'}, ${payload.unit.district_bn || 'পাবনা'}</p>
              </div>
            </div>

            <div class="verify-url" style="display: flex; justify-content: space-between; align-items: center; padding: 0 4px;">
              <span>যাচাইকরণ: ${payload.verificationUrl}</span>
              <span style="font-weight: 700;">পাতা ২ / ২</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
`}
</body>
</html>
  `;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--font-render-hinting=medium',
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({
      width: orientation === 'landscape' ? 1123 : 794,
      height: orientation === 'landscape' ? 794 : 1123,
      deviceScaleFactor: 2,
    });
    await page.setContent(htmlContent, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((res) => {
            img.onload = () => res(true);
            img.onerror = () => res(false);
          });
        })
      );
    });

    const pdfUint8 = await page.pdf({
      format: 'A4',
      landscape: orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
    });
    const pdfBuffer = Buffer.from(pdfUint8);

    if (!isValidPdfBuffer(pdfBuffer)) {
      throw new Error('Generated Puppeteer PDF failed integrity validation');
    }

    const tmpPath = `${pdfPath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, pdfBuffer);
    if (!isValidPdfFile(tmpPath)) {
      throw new Error('Written temporary PDF failed integrity check');
    }
    fs.renameSync(tmpPath, pdfPath);

    return {
      pdfPath,
      qrDataUrl,
      byteLength: pdfBuffer.byteLength,
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
