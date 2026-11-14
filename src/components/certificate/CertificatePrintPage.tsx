import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { AdministrativeUnit, Certificate } from '../../types';
import { api } from '../../services/api';
import { WarishCertificateView } from './WarishCertificateView';

interface CertificatePrintPageProps {
  certificateId: string;
  initialCertificate?: Certificate | null;
  institutions: AdministrativeUnit[];
  authToken?: string;
  trackingNo?: string;
  autoPrint?: boolean;
  onBack: () => void;
}

export const CertificatePrintPage: React.FC<CertificatePrintPageProps> = ({
  certificateId,
  initialCertificate,
  institutions,
  authToken,
  trackingNo,
  autoPrint = true,
  onBack,
}) => {
  const matchedInitial =
    initialCertificate && initialCertificate.id === certificateId ? initialCertificate : null;

  const [certificate, setCertificate] = useState<Certificate | null>(matchedInitial);
  const [loading, setLoading] = useState<boolean>(!matchedInitial);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (matchedInitial) {
      setCertificate(matchedInitial);
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    api
      .getCertificateById(certificateId, { authToken, trackingNo })
      .then((cert) => {
        if (cancelled) return;
        setCertificate(cert);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : 'সনদপত্রটি লোড করা যায়নি। অনুগ্রহ করে লগইন করুন অথবা সঠিক ট্র্যাকিং নম্বর ব্যবহার করুন।'
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [certificateId, matchedInitial, authToken, trackingNo]);

  useEffect(() => {
    if (!certificate) return;
    const prevTitle = document.title;
    const certNo = certificate.certificate_number || certificate.certificate_no || certificate.id;
    document.title = `PottoyonBD_Certificate_${certNo}`;
    return () => {
      document.title = prevTitle;
    };
  }, [certificate]);

  if (loading) {
    return (
      <div className="certificate-print-route min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 gap-3">
        <div className="w-10 h-10 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-700">
          প্রিন্ট-রেডি A4 সনদপত্র প্রস্তুত করা হচ্ছে...
        </p>
      </div>
    );
  }

  if (error || !certificate) {
    return (
      <div className="certificate-print-route min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg max-w-md w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">সনদপত্র প্রদর্শন করা যায়নি</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              {error || 'অনুরোধকৃত সনদপত্রটি খুঁজে পাওয়া যায়নি অথবা আপনার প্রবেশাধিকার নেই।'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>ফিরে যান</span>
          </button>
        </div>
      </div>
    );
  }

  const institution = institutions.find((i) => i.id === certificate.administrative_unit_id);

  return (
    <div className="certificate-print-route min-h-screen bg-slate-200/70">
      <WarishCertificateView
        certificate={certificate}
        institution={institution}
        authToken={authToken}
        trackingNo={trackingNo || certificate.application_tracking_no}
        isDedicatedPrintRoute={true}
        autoPrint={autoPrint}
        onBack={onBack}
      />
    </div>
  );
};
