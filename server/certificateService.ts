import crypto from 'node:crypto';
import fs from 'node:fs';
import { getDb, hashVerificationToken, getVerificationBaseUrl } from './db.ts';
import { type AuthenticatedActor } from './auth.ts';
import {
  authorizeApprovalAction,
  authorizeContextPermission,
  resolveActorRbacContext,
} from './rbacService.ts';
import { generateAndStoreCertificatePdf, isValidPdfFile } from './pdfGenerator.ts';
import type {
  Application,
  Certificate,
  VerificationResponse,
} from '../src/types/index.ts';

// Per-application in-process issuance lock to prevent concurrent duplicate issuance
const issuanceLocks = new Map<string, Promise<unknown>>();

async function withApplicationLock<T>(applicationId: string, fn: () => Promise<T>): Promise<T> {
  const previous = issuanceLocks.get(applicationId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  issuanceLocks.set(applicationId, chained);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (issuanceLocks.get(applicationId) === chained) {
      issuanceLocks.delete(applicationId);
    }
  }
}

export class ServiceError extends Error {
  public statusCode: number;
  public messageBn: string;

  constructor(statusCode: number, message: string, messageBn: string) {
    super(message);
    this.statusCode = statusCode;
    this.messageBn = messageBn;
  }
}

function generateUniqueCertificateNumber(): string {
  const db = getDb().db;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `10${crypto.randomInt(100000000, 999999999)}`;
    const existing = db
      .prepare('SELECT id FROM certificates WHERE certificate_number = ?')
      .get(candidate);
    if (!existing) return candidate;
  }
  throw new ServiceError(500, 'Could not allocate unique certificate number', 'অনন্য সনদ নম্বর তৈরি করা যায়নি।');
}

function formatDateBn(date: Date): string {
  return new Intl.DateTimeFormat('bn-BD', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatDateEn(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export interface FinalApproveInput {
  applicationId: string;
  actor: AuthenticatedActor;
  notes?: string;
  expiresInDays?: number | null;
}

export interface FinalApproveResult {
  already_issued: boolean;
  certificate: Certificate;
  application: Application;
  verification_url?: string;
}

export async function approveAndIssueCertificate(
  input: FinalApproveInput
): Promise<FinalApproveResult> {
  const { applicationId, actor, notes, expiresInDays } = input;
  const ctx = resolveActorRbacContext(actor.id);
  if (
    !ctx ||
    !ctx.effectivePermissions.has('applications.approve') ||
    !ctx.effectivePermissions.has('certificates.issue')
  ) {
    throw new ServiceError(
      403,
      'Forbidden: insufficient authority for final approval',
      'আপনার পদবি বা পারমিশন থেকে চূড়ান্ত অনুমোদন ও সনদ ইস্যু করার অনুমতি নেই।'
    );
  }

  return withApplicationLock(applicationId, async () => {
    const store = getDb();
    const appRecord = store.getApplicationByIdOrTracking(applicationId);
    if (!appRecord) {
      throw new ServiceError(404, 'Application not found', 'আবেদনটি খুঁজে পাওয়া যায়নি।');
    }

    const approvalCheck = authorizeApprovalAction(
      ctx,
      appRecord.administrative_unit_id,
      appRecord.service_id,
      appRecord
    );
    if (!approvalCheck.allowed) {
      throw new ServiceError(
        403,
        approvalCheck.reason || 'Forbidden: approval authority check failed',
        approvalCheck.reasonBn || 'এই আবেদন অনুমোদনের আইনি ক্ষমতা আপনার ওপর অর্পিত নেই।'
      );
    }

    // Idempotency check: if an active (non-revoked) certificate already exists, block duplicate creation & return existing certificate
    const existingCert = store.getCertificateByApplicationId(appRecord.id);
    if (existingCert && existingCert.status !== 'revoked') {
      store.db
        .prepare(
          `INSERT INTO certificate_events (
            id, certificate_id, application_id, administrative_unit_id,
            event_type, actor_id, actor_role, actor_name_bn, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `evt_${crypto.randomUUID()}`,
          existingCert.id,
          appRecord.id,
          appRecord.administrative_unit_id,
          'duplicate_attempt_blocked',
          actor.id,
          actor.role,
          actor.name_bn,
          JSON.stringify({ certificate_number: existingCert.certificate_number }),
          new Date().toISOString()
        );

      return {
        already_issued: true,
        certificate: sanitizeCertificateForResponse(existingCert),
        application: appRecord,
      };
    }

    if (appRecord.payment_status !== 'paid') {
      throw new ServiceError(
        400,
        'Cannot issue certificate before fee payment is completed',
        'সরকারি ফি পরিশোধ না হওয়া পর্যন্ত চূড়ান্ত অনুমোদন ও সনদ ইস্যু করা যাবে না।'
      );
    }

    if (appRecord.status === 'rejected' || appRecord.status === 'cancelled' || appRecord.status === 'refunded') {
      throw new ServiceError(
        409,
        `Cannot approve application in status ${appRecord.status}`,
        'বাতিলকৃত আবেদনের বিপরীতে সনদ ইস্যু করা যাবে না।'
      );
    }

    const unit = store.getInstitutionById(appRecord.administrative_unit_id);
    const service = store.getServiceById(appRecord.service_id);
    if (!unit) {
      throw new ServiceError(404, 'Institution not found', 'সংশ্লিষ্ট প্রতিষ্ঠান খুঁজে পাওয়া যায়নি।');
    }

    const template = store.getActiveTemplate(appRecord.administrative_unit_id, appRecord.service_id);
    const now = new Date();
    const nowIso = now.toISOString();

    const validityDays =
      typeof expiresInDays === 'number'
        ? expiresInDays
        : template.default_validity_days;
    const expiresAtIso =
      typeof validityDays === 'number' && validityDays > 0
        ? new Date(now.getTime() + validityDays * 86400_000).toISOString()
        : null;

    const certificateNumber = generateUniqueCertificateNumber();
    const rawToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashVerificationToken(rawToken);
    const baseVerifyUrl = getVerificationBaseUrl();
    const verificationUrl = `${baseVerifyUrl}/${rawToken}`;

    const issueDateBn = formatDateBn(now);
    const issueDateEn = formatDateEn(now);
    const certificateTitleBn = service?.name_bn || appRecord.service_name_bn || 'প্রত্যয়নপত্র';

    const wardBn = String(appRecord.ward_no ?? 4).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] || d);
    const shortUnitNameBn = unit.name_bn.replace(/\s*পরিষদ$/, '');
    const permanentAddressBn = `গ্রাম/বাড়ীঃ ${appRecord.village_or_area_bn || shortUnitNameBn.replace(/\s*ইউনিয়ন$/, '')}, রোড/ব্লক/সেক্টরঃ ${appRecord.road_block_sector_bn || 'পূর্বপাড়া'}, ডাকঘরঃ ${appRecord.post_office_bn || 'গোয়েশপুর - ৬৬০০'}, ওয়ার্ড নম্বরঃ ${wardBn}, ${shortUnitNameBn}, থানাঃ ${unit.upazila_bn}, উপজেলাঃ ${unit.upazila_bn}, জেলাঃ ${unit.district_bn}।`;
    const presentAddressBn = appRecord.present_address_bn || permanentAddressBn;

    const officerNameBn = actor.name_bn || unit.chairman_or_mayor_name_bn;
    const officerTitleBn = actor.title_bn || unit.chairman_or_mayor_title_bn;

    // Generate QR + A4 PDF BEFORE marking certificate issued in DB
    const { pdfPath, qrDataUrl, byteLength } = await generateAndStoreCertificatePdf({
      certificateNumber,
      certificateTitleBn,
      issueDateBn,
      issueDateEn,
      expiresAtIso,
      applicantNameBn: appRecord.applicant_name_bn,
      fatherNameBn: appRecord.father_name_bn,
      motherNameBn: appRecord.mother_name_bn,
      permanentAddressBn,
      presentAddressBn,
      heirs: appRecord.heirs,
      unit,
      officerNameBn,
      officerTitleBn,
      verificationUrl,
      templateVersionId: template.id,
      status: 'valid',
    });

    const certId = `cert_${crypto.randomUUID()}`;
    const approvalId = `apr_${crypto.randomUUID()}`;
    const noteText =
      notes?.trim() || 'অনুমোদিত কর্মকর্তা কর্তৃক তথ্য যাচাই শেষে চূড়ান্ত অনুমোদন ও সনদ ইস্যু সম্পন্ন।';

    const updatedApp: Application = {
      ...appRecord,
      status: 'certificate_issued',
      certificate_id: certId,
      verification_token: certificateNumber,
      assigned_officer: officerNameBn,
      submitted_by_user_id: appRecord.submitted_by_user_id || appRecord.created_by_user_id,
      submitted_at: appRecord.submitted_at || appRecord.created_at,
      final_approver_user_id: actor.id,
      approved_at: nowIso,
      decision_reason: noteText,
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        noteText,
        `চূড়ান্ত অনুমোদন ও স্বয়ংক্রিয় কিউআর সনদ ইস্যু সম্পন্ন (সনদ নং: ${certificateNumber})।`,
      ],
    };

    try {
      store.db.exec('BEGIN IMMEDIATE');

      // Re-verify inside transaction for airtight race safety (only one active non-revoked cert per application)
      const raceCheck = store.db
        .prepare("SELECT id FROM certificates WHERE application_id = ? AND status != 'revoked'")
        .get(appRecord.id);
      if (raceCheck) {
        store.db.exec('ROLLBACK');
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
        const existing = store.getCertificateByApplicationId(appRecord.id)!;
        return {
          already_issued: true,
          certificate: sanitizeCertificateForResponse(existing),
          application: appRecord,
        };
      }

      store.db
        .prepare(
          `INSERT INTO application_approvals (
            id, application_id, administrative_unit_id, officer_id,
            officer_role, officer_name_bn, officer_title_bn, decision, notes, approved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          approvalId,
          appRecord.id,
          appRecord.administrative_unit_id,
          actor.id,
          actor.role,
          officerNameBn,
          officerTitleBn,
          'approved',
          noteText,
          nowIso
        );

      store.db
        .prepare(
          `INSERT INTO certificates (
            id, application_id, administrative_unit_id, service_id,
            certificate_number, verification_token_hash, template_version_id,
            issued_by, approved_at, issued_at, expires_at, revoked_at,
            revocation_reason, status, pdf_path, certificate_title_bn,
            issue_date_bn, issue_date_en, applicant_name_bn, father_name_bn,
            mother_name_bn, permanent_address_bn, present_address_bn,
            heirs_json, qr_data_url, officer_name_bn, officer_title_bn
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          certId,
          appRecord.id,
          appRecord.administrative_unit_id,
          appRecord.service_id,
          certificateNumber,
          tokenHash,
          template.id,
          actor.id,
          nowIso,
          nowIso,
          expiresAtIso,
          null,
          null,
          'valid',
          pdfPath,
          certificateTitleBn,
          issueDateBn,
          issueDateEn,
          appRecord.applicant_name_bn,
          appRecord.father_name_bn,
          appRecord.mother_name_bn,
          permanentAddressBn,
          presentAddressBn,
          appRecord.heirs ? JSON.stringify(appRecord.heirs) : null,
          qrDataUrl,
          officerNameBn,
          officerTitleBn
        );

      store.db
        .prepare(
          `UPDATE applications
           SET status = ?, updated_at = ?, data_json = ?
           WHERE id = ?`
        )
        .run('certificate_issued', nowIso, JSON.stringify(updatedApp), appRecord.id);

      const insertEvt = store.db.prepare(
        `INSERT INTO certificate_events (
          id, certificate_id, application_id, administrative_unit_id,
          event_type, actor_id, actor_role, actor_name_bn, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        appRecord.administrative_unit_id,
        'approved',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ approval_id: approvalId }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        appRecord.administrative_unit_id,
        'token_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ token_hash_prefix: tokenHash.slice(0, 12) }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        appRecord.administrative_unit_id,
        'qr_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ qr_embedded: true }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        appRecord.administrative_unit_id,
        'pdf_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ template_version_id: template.id, bytes: byteLength }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        appRecord.administrative_unit_id,
        'issued',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ certificate_number: certificateNumber, expires_at: expiresAtIso }),
        nowIso
      );

      // Citizen Notification
      store.db
        .prepare(
          `INSERT INTO notifications (
            id, recipient_mobile, application_id, certificate_id,
            administrative_unit_id, title_bn, message_bn, channel, status, is_read, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `notif_${crypto.randomUUID()}`,
          appRecord.mobile,
          appRecord.id,
          certId,
          appRecord.administrative_unit_id,
          'সনদপত্র প্রস্তুত ও ইস্যু হয়েছে',
          `প্রিয় ${appRecord.applicant_name_bn}, আপনার ${certificateTitleBn} (${unit.name_bn}) চূড়ান্ত অনুমোদন ও কিউআর কোডসহ ইস্যু করা হয়েছে। সনদ নং: ${certificateNumber}।`,
          'sms',
          'sent',
          0,
          nowIso
        );

      store.db.exec('COMMIT');
    } catch (err) {
      try {
        store.db.exec('ROLLBACK');
      } catch {
        // ignore rollback failure
      }
      if (fs.existsSync(pdfPath)) {
        try {
          fs.unlinkSync(pdfPath);
        } catch {
          // ignore cleanup failure
        }
      }
      throw err;
    }

    const issuedCert = store.getCertificateById(certId)!;
    return {
      already_issued: false,
      certificate: {
        ...sanitizeCertificateForResponse(issuedCert),
        verification_url: verificationUrl,
      },
      application: updatedApp,
      verification_url: verificationUrl,
    };
  });
}

export async function revokeCertificate(params: {
  certificateId: string;
  actor: AuthenticatedActor;
  reason: string;
}): Promise<Certificate> {
  const { certificateId, actor, reason } = params;
  const ctx = resolveActorRbacContext(actor.id);
  if (!ctx || !ctx.effectivePermissions.has('certificates.revoke')) {
    throw new ServiceError(
      403,
      'Forbidden: insufficient authority to revoke certificate',
      'সনদ বাতিল করার জন্য আপনার পর্যাপ্ত প্রশাসনিক অনুমতি নেই।'
    );
  }

  const store = getDb();
  const cert = store.getCertificateById(certificateId);
  if (!cert) {
    throw new ServiceError(404, 'Certificate not found', 'সনদটি খুঁজে পাওয়া যায়নি।');
  }

  const permCheck = authorizeContextPermission(ctx, 'certificates.revoke', {
    unitId: cert.administrative_unit_id,
  });
  if (!permCheck.allowed) {
    throw new ServiceError(
      403,
      permCheck.reason || 'Forbidden: cross-institution revocation denied',
      permCheck.reasonBn || 'অন্য প্রতিষ্ঠানের ইস্যুকৃত সনদ বাতিল করার অনুমতি নেই।'
    );
  }

  const hasAuthority = ctx.approvalAuthorities.some(
    (aa) =>
      (aa.administrative_unit_id === cert.administrative_unit_id || aa.administrative_unit_id === '*') &&
      (aa.service_id === cert.service_id || aa.service_id === '*')
  );
  if (!hasAuthority) {
    throw new ServiceError(
      403,
      'Forbidden: no active approval authority for this service',
      'এই নির্দিষ্ট সেবার সনদ বাতিল করার আইনি ক্ষমতা আপনার ওপর অর্পিত নেই।'
    );
  }

  const cleanReason = reason.trim() || 'প্রশাসনিক আদেশে বাতিলকৃত';
  const nowIso = new Date().toISOString();

  store.db.exec('BEGIN IMMEDIATE');
  try {
    store.db
      .prepare(
        `UPDATE certificates
         SET status = 'revoked', revoked_at = ?, revocation_reason = ?
         WHERE id = ?`
      )
      .run(nowIso, cleanReason, cert.id);

    store.db
      .prepare(
        `INSERT INTO certificate_events (
          id, certificate_id, application_id, administrative_unit_id,
          event_type, actor_id, actor_role, actor_name_bn, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `evt_${crypto.randomUUID()}`,
        cert.id,
        cert.application_id,
        cert.administrative_unit_id,
        'revoked',
        actor.id,
        actor.role,
        actor.name_bn,
        JSON.stringify({ reason: cleanReason }),
        nowIso
      );

    const appRecord = store.getApplicationByIdOrTracking(cert.application_id);
    if (appRecord) {
      store.db
        .prepare(
          `INSERT INTO notifications (
            id, recipient_mobile, application_id, certificate_id,
            administrative_unit_id, title_bn, message_bn, channel, status, is_read, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          `notif_${crypto.randomUUID()}`,
          appRecord.mobile,
          appRecord.id,
          cert.id,
          cert.administrative_unit_id,
          'সনদপত্র বাতিল করা হয়েছে',
          `আপনার সনদ নং ${cert.certificate_number} বাতিল করা হয়েছে। কারণ: ${cleanReason}`,
          'sms',
          'sent',
          0,
          nowIso
        );
    }

    store.db.exec('COMMIT');
  } catch (err) {
    try {
      store.db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw err;
  }

  const updated = store.getCertificateById(cert.id)!;
  return sanitizeCertificateForResponse(updated);
}

export function verifyCertificateByToken(params: {
  rawToken: string;
  ipAddress: string;
  userAgent: string;
}): { httpStatus: number; body: VerificationResponse } {
  const cleanToken = params.rawToken.trim();
  const tokenHash = hashVerificationToken(cleanToken);
  const store = getDb();
  const cert = store.getCertificateByTokenHash(tokenHash);
  const nowIso = new Date().toISOString();

  if (!cert) {
    store.db
      .prepare(
        `INSERT INTO certificate_verification_logs (
          id, certificate_id, token_hash_prefix, result_status,
          ip_address, user_agent, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `vlog_${crypto.randomUUID()}`,
        null,
        tokenHash.slice(0, 12),
        'invalid',
        params.ipAddress,
        params.userAgent.slice(0, 200),
        nowIso
      );

    return {
      httpStatus: 404,
      body: {
        verified: false,
        status: 'invalid',
        message_bn:
          'কোনো বৈধ সনদ পাওয়া যায়নি। ভেরিফিকেশন টোকেন বা কিউআর কোড সঠিক কিনা নিশ্চিত করুন।',
      },
    };
  }

  const unit = store.getInstitutionById(cert.administrative_unit_id);
  const service = store.getServiceById(cert.service_id);

  let resultStatus: 'valid' | 'revoked' | 'expired' = cert.status;
  if (cert.status === 'revoked' || cert.revoked_at) {
    resultStatus = 'revoked';
  } else if (cert.expires_at && new Date(cert.expires_at).getTime() <= Date.now()) {
    resultStatus = 'expired';
  } else {
    resultStatus = 'valid';
  }

  store.db
    .prepare(
      `INSERT INTO certificate_verification_logs (
        id, certificate_id, token_hash_prefix, result_status,
        ip_address, user_agent, verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      `vlog_${crypto.randomUUID()}`,
      cert.id,
      tokenHash.slice(0, 12),
      resultStatus,
      params.ipAddress,
      params.userAgent.slice(0, 200),
      nowIso
    );

  // Strictly limited public fields: NO NID, NO DOB, NO address, NO heir list, NO uploaded files, NO pdf_path
  const responseBody: VerificationResponse = {
    verified: resultStatus === 'valid',
    status: resultStatus,
    certificate_number: cert.certificate_number || cert.certificate_no,
    certificate_no: cert.certificate_number || cert.certificate_no,
    certificate_title_bn: cert.certificate_title_bn,
    service_name_bn: service?.name_bn || cert.certificate_title_bn,
    service_name_en: service?.name_en,
    issuing_unit_bn: unit?.name_bn,
    issuing_unit_en: unit?.name_en,
    issuing_unit_type: unit?.type,
    upazila_bn: unit?.upazila_bn,
    district_bn: unit?.district_bn,
    issue_date_bn: cert.issue_date_bn,
    issue_date_en: cert.issue_date_en,
    issued_at: cert.issued_at,
    expires_at: cert.expires_at || null,
    revoked_at: resultStatus === 'revoked' ? cert.revoked_at || null : null,
    revocation_reason: resultStatus === 'revoked' ? cert.revocation_reason || null : null,
    applicant_name_bn: cert.applicant_name_bn,
    officer_name_bn: cert.officer_name_bn,
    officer_title_bn: cert.officer_title_bn,
    template_version_id: cert.template_version_id,
    privacy_notice_bn:
      'নাগরিকের ব্যক্তিগত গোপনীয়তা সুরক্ষায় পূর্ণ এনআইডি নম্বর, জন্ম তারিখ, ঠিকানা, ওয়ারিশ তালিকা ও সংযুক্ত নথিপত্র পাবলিক যাচাই পেজে অপ্রকাশিত রাখা হয়েছে।',
  };

  return {
    httpStatus: 200,
    body: responseBody,
  };
}

export async function reissueCertificate(params: {
  certificateId: string;
  actor: AuthenticatedActor;
  notes?: string;
  expiresInDays?: number | null;
}): Promise<FinalApproveResult> {
  const { certificateId, actor, notes, expiresInDays } = params;
  const ctx = resolveActorRbacContext(actor.id);
  if (!ctx || !ctx.effectivePermissions.has('certificates.reissue')) {
    throw new ServiceError(
      403,
      'Forbidden: insufficient authority to reissue certificate',
      'সনদ পুনঃইস্যু করার জন্য আপনার পর্যাপ্ত প্রশাসনিক অনুমতি নেই।'
    );
  }

  const store = getDb();
  const oldCert = store.getCertificateById(certificateId);
  if (!oldCert) {
    throw new ServiceError(404, 'Certificate not found', 'সনদটি খুঁজে পাওয়া যায়নি।');
  }
  const permCheck = authorizeContextPermission(ctx, 'certificates.reissue', {
    unitId: oldCert.administrative_unit_id,
  });
  if (!permCheck.allowed) {
    throw new ServiceError(
      403,
      permCheck.reason || 'Forbidden: cross-institution reissue denied',
      permCheck.reasonBn || 'অন্য প্রতিষ্ঠানের সনদ পুনঃইস্যু করার অনুমতি নেই।'
    );
  }
  const hasAuthority = ctx.approvalAuthorities.some(
    (aa) =>
      (aa.administrative_unit_id === oldCert.administrative_unit_id || aa.administrative_unit_id === '*') &&
      (aa.service_id === oldCert.service_id || aa.service_id === '*')
  );
  if (!hasAuthority) {
    throw new ServiceError(
      403,
      'Forbidden: no active approval authority to reissue this service certificate',
      'এই নির্দিষ্ট সেবার সনদ পুনঃইস্যু করার আইনি ক্ষমতা আপনার ওপর অর্পিত নেই।'
    );
  }
  if (oldCert.status !== 'revoked') {
    throw new ServiceError(
      409,
      'Only revoked certificates can be reissued',
      'শুধুমাত্র বাতিলকৃত (REVOKED) সনদ পুনঃইস্যু করা যাবে।'
    );
  }

  return withApplicationLock(oldCert.application_id, async () => {
    const appRecord = store.getApplicationByIdOrTracking(oldCert.application_id);
    if (!appRecord) {
      throw new ServiceError(404, 'Linked application not found', 'সংশ্লিষ্ট আবেদনটি খুঁজে পাওয়া যায়নি।');
    }
    const unit = store.getInstitutionById(oldCert.administrative_unit_id);
    if (!unit) {
      throw new ServiceError(404, 'Institution not found', 'সংশ্লিষ্ট প্রতিষ্ঠান খুঁজে পাওয়া যায়নি।');
    }

    const activeExisting = store.db
      .prepare("SELECT id FROM certificates WHERE application_id = ? AND status != 'revoked'")
      .get(oldCert.application_id) as { id: string } | undefined;
    if (activeExisting) {
      throw new ServiceError(
        409,
        'An active certificate already exists for this application',
        'এই আবেদনের বিপরীতে ইতোমধ্যেই একটি সক্রিয় সনদ বিদ্যমান রয়েছে।'
      );
    }

    const template = store.getActiveTemplate(oldCert.administrative_unit_id, oldCert.service_id);
    const now = new Date();
    const nowIso = now.toISOString();
    const validityDays =
      typeof expiresInDays === 'number' ? expiresInDays : template.default_validity_days;
    const expiresAtIso =
      typeof validityDays === 'number' && validityDays > 0
        ? new Date(now.getTime() + validityDays * 86400_000).toISOString()
        : null;

    const certificateNumber = generateUniqueCertificateNumber();
    const rawToken = crypto.randomBytes(24).toString('base64url');
    const tokenHash = hashVerificationToken(rawToken);
    const baseVerifyUrl = getVerificationBaseUrl();
    const verificationUrl = `${baseVerifyUrl}/${rawToken}`;

    const issueDateBn = formatDateBn(now);
    const issueDateEn = formatDateEn(now);
    const officerNameBn = actor.name_bn || unit.chairman_or_mayor_name_bn;
    const officerTitleBn = actor.title_bn || unit.chairman_or_mayor_title_bn;

    const { pdfPath, qrDataUrl, byteLength } = await generateAndStoreCertificatePdf({
      certificateNumber,
      certificateTitleBn: oldCert.certificate_title_bn,
      issueDateBn,
      issueDateEn,
      expiresAtIso,
      applicantNameBn: oldCert.applicant_name_bn,
      fatherNameBn: oldCert.father_name_bn,
      motherNameBn: oldCert.mother_name_bn,
      permanentAddressBn: oldCert.permanent_address_bn,
      presentAddressBn: oldCert.present_address_bn,
      heirs: oldCert.heirs,
      unit,
      officerNameBn,
      officerTitleBn,
      verificationUrl,
      templateVersionId: template.id,
      status: 'valid',
    });

    const certId = `cert_${crypto.randomUUID()}`;
    const approvalId = `apr_${crypto.randomUUID()}`;
    const noteText =
      notes?.trim() ||
      `বাতিলকৃত সনদ নং ${oldCert.certificate_number} এর বিপরীতে সংশোধিত সনদ পুনঃইস্যু সম্পন্ন।`;

    const updatedApp: Application = {
      ...appRecord,
      status: 'certificate_issued',
      certificate_id: certId,
      verification_token: certificateNumber,
      assigned_officer: officerNameBn,
      updated_at: nowIso,
      review_notes: [
        ...(appRecord.review_notes || []),
        noteText,
        `নতুন সনদ নং: ${certificateNumber} (পুনঃইস্যুকৃত)।`,
      ],
    };

    try {
      store.db.exec('BEGIN IMMEDIATE');

      store.db
        .prepare(
          `INSERT INTO application_approvals (
            id, application_id, administrative_unit_id, officer_id,
            officer_role, officer_name_bn, officer_title_bn, decision, notes, approved_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          approvalId,
          appRecord.id,
          oldCert.administrative_unit_id,
          actor.id,
          actor.role,
          officerNameBn,
          officerTitleBn,
          'reissued',
          noteText,
          nowIso
        );

      store.db
        .prepare(
          `INSERT INTO certificates (
            id, application_id, administrative_unit_id, service_id,
            certificate_number, verification_token_hash, template_version_id,
            issued_by, approved_at, issued_at, expires_at, revoked_at,
            revocation_reason, reissued_from_cert_id, status, pdf_path, certificate_title_bn,
            issue_date_bn, issue_date_en, applicant_name_bn, father_name_bn,
            mother_name_bn, permanent_address_bn, present_address_bn,
            heirs_json, qr_data_url, officer_name_bn, officer_title_bn
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          certId,
          appRecord.id,
          oldCert.administrative_unit_id,
          oldCert.service_id,
          certificateNumber,
          tokenHash,
          template.id,
          actor.id,
          nowIso,
          nowIso,
          expiresAtIso,
          null,
          null,
          oldCert.id,
          'valid',
          pdfPath,
          oldCert.certificate_title_bn,
          issueDateBn,
          issueDateEn,
          oldCert.applicant_name_bn,
          oldCert.father_name_bn,
          oldCert.mother_name_bn,
          oldCert.permanent_address_bn,
          oldCert.present_address_bn,
          oldCert.heirs ? JSON.stringify(oldCert.heirs) : null,
          qrDataUrl,
          officerNameBn,
          officerTitleBn
        );

      store.db
        .prepare('UPDATE applications SET status = ?, updated_at = ?, data_json = ? WHERE id = ?')
        .run('certificate_issued', nowIso, JSON.stringify(updatedApp), appRecord.id);

      const insertEvt = store.db.prepare(
        `INSERT INTO certificate_events (
          id, certificate_id, application_id, administrative_unit_id,
          event_type, actor_id, actor_role, actor_name_bn, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        oldCert.administrative_unit_id,
        'token_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ token_hash_prefix: tokenHash.slice(0, 12), reissued_from_cert_id: oldCert.id }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        oldCert.administrative_unit_id,
        'qr_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ verification_domain: 'https://pottoyonbd.gov.bd/verify/...' }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        oldCert.administrative_unit_id,
        'pdf_generated',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({ template_version_id: template.id, bytes: byteLength }),
        nowIso
      );
      insertEvt.run(
        `evt_${crypto.randomUUID()}`,
        certId,
        appRecord.id,
        oldCert.administrative_unit_id,
        'reissued',
        actor.id,
        actor.role,
        officerNameBn,
        JSON.stringify({
          reissued_from_cert_id: oldCert.id,
          previous_certificate_number: oldCert.certificate_number,
          certificate_number: certificateNumber,
          pdf_bytes: byteLength,
        }),
        nowIso
      );

      store.insertNotification({
        mobile: appRecord.mobile,
        applicationId: appRecord.id,
        certificateId: certId,
        unitId: oldCert.administrative_unit_id,
        titleBn: 'সংশোধিত ডিজিটাল সনদ পুনঃইস্যু হয়েছে',
        messageBn: `প্রিয় ${appRecord.applicant_name_bn}, আপনার ${oldCert.certificate_title_bn} সংশোধিত আকারে পুনঃইস্যু করা হয়েছে। নতুন সনদ নং: ${certificateNumber}।`,
      });

      store.db.exec('COMMIT');
    } catch (err) {
      try {
        store.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      if (fs.existsSync(pdfPath)) {
        try {
          fs.unlinkSync(pdfPath);
        } catch {
          // ignore unlink error
        }
      }
      throw err;
    }

    const issuedCert = store.getCertificateById(certId)!;
    return {
      already_issued: false,
      certificate: {
        ...sanitizeCertificateForResponse(issuedCert),
        verification_url: verificationUrl,
      },
      application: updatedApp,
      verification_url: verificationUrl,
    };
  });
}

export async function ensureCertificatePdfFile(
  certificateId: string,
  options?: { orientation?: 'portrait' | 'landscape'; forceRegenerate?: boolean }
): Promise<string> {
  const store = getDb();
  const cert = store.getCertificateById(certificateId);
  if (!cert) {
    throw new ServiceError(404, 'Certificate not found', 'সনদটি খুঁজে পাওয়া যায়নি।');
  }

  const appRecord = store.getApplicationByIdOrTracking(cert.application_id);
  if (appRecord && appRecord.status !== 'certificate_issued' && appRecord.status !== 'approved') {
    throw new ServiceError(
      403,
      'Certificate has not been issued after final approval',
      'চূড়ান্ত অনুমোদনের পূর্বে সনদের পিডিএফ ডাউনলোড করা যাবে না।'
    );
  }

  const orientation = options?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const portraitPath = cert.pdf_path || '';
  const targetPath =
    orientation === 'landscape'
      ? portraitPath.replace(/\.pdf$/i, '.landscape.pdf')
      : portraitPath;

  if (!options?.forceRegenerate && targetPath && isValidPdfFile(targetPath)) {
    return targetPath;
  }

  const unit = store.getInstitutionById(cert.administrative_unit_id);
  if (!unit) {
    throw new ServiceError(404, 'Issuing institution not found', 'ইস্যুকারী প্রতিষ্ঠান খুঁজে পাওয়া যায়নি।');
  }

  const certNo = cert.certificate_number || cert.certificate_no;
  const baseVerifyUrl = getVerificationBaseUrl();
  const fallbackVerifyUrl =
    certNo === '10275626255'
      ? `${baseVerifyUrl}/10275626255`
      : cert.verification_url && !cert.verification_url.includes('[protected-token]')
        ? cert.verification_url
        : `${baseVerifyUrl}/${certNo}`;

  const generated = await generateAndStoreCertificatePdf({
    certificateNumber: certNo,
    certificateTitleBn: cert.certificate_title_bn,
    issueDateBn: cert.issue_date_bn,
    issueDateEn: cert.issue_date_en,
    expiresAtIso: cert.expires_at,
    applicantNameBn: cert.applicant_name_bn,
    fatherNameBn: cert.father_name_bn,
    motherNameBn: cert.mother_name_bn,
    permanentAddressBn: cert.permanent_address_bn,
    presentAddressBn: cert.present_address_bn,
    heirs: cert.heirs,
    unit,
    officerNameBn: cert.officer_name_bn,
    officerTitleBn: cert.officer_title_bn,
    verificationUrl: fallbackVerifyUrl,
    templateVersionId: cert.template_version_id || 'tpl_up_general_v1',
    status: cert.status,
    orientation,
  });

  if (orientation === 'portrait') {
    store.db
      .prepare('UPDATE certificates SET pdf_path = ?, qr_data_url = COALESCE(qr_data_url, ?) WHERE id = ?')
      .run(generated.pdfPath, generated.qrDataUrl, cert.id);
  }

  return generated.pdfPath;
}

export function sanitizeCertificateForResponse(cert: Certificate): Certificate {
  const { verification_token_hash: _hash, pdf_path: _path, ...safe } = cert;
  return safe;
}
