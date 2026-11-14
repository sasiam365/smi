import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  ArrowRight,
  AlertCircle,
  Download,
  Bell,
  Printer,
} from 'lucide-react';
import { Application, Certificate, CitizenNotification } from '../../types';
import { storage } from '../../services/storage';
import { api } from '../../services/api';

interface ApplicationTrackingViewProps {
  onViewCertificate: (cert: Certificate, trackingNo?: string) => void;
  onPrintCertificate?: (cert: Certificate, trackingNo?: string) => void;
  lang?: 'bn' | 'en';
}

export const ApplicationTrackingView: React.FC<ApplicationTrackingViewProps> = ({
  onViewCertificate,
  onPrintCertificate,
}) => {
  const [trackingInput, setTrackingInput] = useState('UP-2026-00128');
  const [application, setApplication] = useState<Application | null>(
    () => storage.getApplicationByTrackingNo('UP-2026-00128') || null
  );
  const [linkedCert, setLinkedCert] = useState<Certificate | null>(null);
  const [notifications, setNotifications] = useState<CitizenNotification[]>([]);
  const [searched, setSearched] = useState(true);
  const [loading, setLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const loadTracking = async (rawTracking: string) => {
    const clean = rawTracking.trim().toUpperCase();
    if (!clean) return;
    setSearched(true);
    setLoading(true);
    try {
      const data = await api.getApplicationByTracking(clean);
      setApplication(data);
      setLinkedCert(data.certificate || null);
      setNotifications(data.notifications || []);
    } catch {
      const localApp = storage.getApplicationByTrackingNo(clean);
      setApplication(localApp || null);
      if (localApp?.verification_token) {
        setLinkedCert(storage.getCertificateByToken(localApp.verification_token) || null);
      } else {
        setLinkedCert(null);
      }
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTracking('UP-2026-00128');
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadTracking(trackingInput);
  };

  const getStatusStepIndex = (status: string) => {
    switch (status) {
      case 'draft':
      case 'pending_payment':
        return 1;
      case 'paid':
        return 2;
      case 'under_verification':
      case 'correction_required':
        return 3;
      case 'forwarded_for_approval':
        return 4;
      case 'approved':
        return 5;
      case 'certificate_issued':
        return 6;
      default:
        return 2;
    }
  };

  const handleViewCert = () => {
    if (!application) return;
    if (linkedCert) {
      onViewCertificate(linkedCert, application.tracking_no);
      return;
    }
    if (application.verification_token) {
      const cert = storage.getCertificateByToken(application.verification_token);
      if (cert) {
        onViewCertificate(cert, application.tracking_no);
      }
    }
  };

  const handleDownloadPdf = async () => {
    if (!application || !linkedCert) return;
    setDownloadingPdf(true);
    setPdfError('');
    try {
      const { blob, filename } = await api.fetchCertificatePdfBlob(linkedCert.id, {
        trackingNo: application.tracking_no,
      });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF ডাউনলোড ব্যর্থ হয়েছে।');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-2 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Search className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            অনলাইন আবেদন ট্র্যাকিং
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            আপনার আবেদন জমা দেওয়ার পর প্রাপ্ত ট্র্যাকিং আইডি প্রদান করে বর্তমান অগ্রগতি ও সনদের অবস্থা জানুন।
          </p>
        </div>

        {/* Search Box */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="উদাহরণ: UP-2026-00128 অথবা PM-2026-00045"
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono uppercase focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-xs flex items-center justify-center gap-2"
            >
              <span>{loading ? 'খুঁজছে...' : 'অগ্রগতি দেখুন'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>নমুনা আইডি:</span>
            <button
              type="button"
              onClick={() => {
                setTrackingInput('UP-2026-00128');
                loadTracking('UP-2026-00128');
              }}
              className="font-mono text-emerald-700 hover:underline font-bold"
            >
              UP-2026-00128 (ইস্যুকৃত সনদ)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setTrackingInput('UP-2026-00127');
                loadTracking('UP-2026-00127');
              }}
              className="font-mono text-emerald-700 hover:underline font-bold"
            >
              UP-2026-00127 (যাচাই চলছে)
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                setTrackingInput('PM-2026-00045');
                loadTracking('PM-2026-00045');
              }}
              className="font-mono text-emerald-700 hover:underline font-bold"
            >
              PM-2026-00045 (পৌর ট্রেড লাইসেন্স)
            </button>
          </div>
        </div>

        {/* Application Status Card */}
        {application ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 sm:p-8 animate-fadeIn space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
              <div>
                <span className="text-xs font-bold font-mono text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                  {application.tracking_no}
                </span>
                <h3 className="text-xl font-bold text-slate-900 mt-2">
                  {application.service_name_bn}
                </h3>
                <p className="text-xs text-slate-500">
                  আবেদনকারী: {application.applicant_name_bn} • পিতা: {application.father_name_bn}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-xs text-slate-400 block">বর্তমান স্ট্যাটাস</span>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-1 ${
                    application.status === 'certificate_issued'
                      ? 'bg-emerald-100 text-emerald-800'
                      : application.status === 'under_verification'
                      ? 'bg-blue-100 text-blue-800'
                      : application.status === 'approved'
                      ? 'bg-teal-100 text-teal-800'
                      : application.status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {application.status === 'certificate_issued'
                    ? linkedCert?.status === 'revoked'
                      ? 'সনদপত্র বাতিলকৃত'
                      : 'সনদপত্র ইস্যু সম্পন্ন'
                    : application.status === 'under_verification'
                    ? 'ওয়ার্ড মেম্বার যাচাই চলছে'
                    : application.status === 'approved'
                    ? 'অনুমোদিত'
                    : application.status === 'rejected'
                    ? 'বাতিলকৃত'
                    : application.payment_status === 'paid'
                    ? 'ফি পরিশোধিত (প্রক্রিয়াকরণ চলছে)'
                    : 'ফি পরিশোধ অপেক্ষমাণ'}
                </span>
              </div>
            </div>

            {/* Citizen Notifications */}
            {notifications.length > 0 && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                  <Bell className="w-4 h-4 text-emerald-700" />
                  <span>নাগরিক নোটিফিকেশন ও এসএমএস বার্তা</span>
                </div>
                {notifications.map((n) => (
                  <div key={n.id} className="text-xs text-emerald-900 bg-white/80 p-2.5 rounded-lg border border-emerald-100">
                    <div className="font-bold">{n.title_bn}</div>
                    <div className="text-slate-700 mt-0.5">{n.message_bn}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                অগ্রগতির সময়রেখা (Processing Timeline)
              </h4>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                <div className="relative">
                  <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-700 border-2 border-white ring-2 ring-emerald-200"></div>
                  <div className="text-xs font-bold text-slate-900">অনলাইন আবেদন দাখিল</div>
                  <div className="text-[11px] text-slate-500">আবেদন সফলভাবে সার্ভারে সংরক্ষিত হয়েছে।</div>
                </div>

                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white ring-2 ${
                      getStatusStepIndex(application.status) >= 2
                        ? 'bg-emerald-700 ring-emerald-200'
                        : 'bg-slate-300 ring-slate-100'
                    }`}
                  ></div>
                  <div className="text-xs font-bold text-slate-900">
                    ফি পরিশোধ ({application.payment_status === 'paid' ? 'সম্পন্ন' : 'বকেয়া'})
                  </div>
                  <div className="text-[11px] text-slate-500">
                    পরিশোধিত ফি: ৳{application.fee_amount} (TrxID: {application.transaction_id || 'N/A'})
                  </div>
                </div>

                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white ring-2 ${
                      getStatusStepIndex(application.status) >= 3
                        ? 'bg-emerald-700 ring-emerald-200'
                        : 'bg-slate-300 ring-slate-100'
                    }`}
                  ></div>
                  <div className="text-xs font-bold text-slate-900">স্থানীয় ওয়ার্ড সদস্য / পরিদর্শক যাচাই</div>
                  <div className="text-[11px] text-slate-500">
                    {application.ward_no} নং ওয়ার্ডের সরেজমিনে নাগরিকত্ব ও তথ্য যাচাই।
                  </div>
                </div>

                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white ring-2 ${
                      getStatusStepIndex(application.status) >= 5
                        ? 'bg-emerald-700 ring-emerald-200'
                        : 'bg-slate-300 ring-slate-100'
                    }`}
                  ></div>
                  <div className="text-xs font-bold text-slate-900">প্রশাসক / চেয়ারম্যান / মেয়র চূড়ান্ত অনুমোদন</div>
                  <div className="text-[11px] text-slate-500">
                    দায়িত্বপ্রাপ্ত কর্মকর্তা: {application.assigned_officer || 'অনুমোদনের অপেক্ষায়'}
                  </div>
                </div>

                <div className="relative">
                  <div
                    className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white ring-2 ${
                      getStatusStepIndex(application.status) >= 6
                        ? 'bg-emerald-700 ring-emerald-200'
                        : 'bg-slate-300 ring-slate-100'
                    }`}
                  ></div>
                  <div className="text-xs font-bold text-slate-900">স্বয়ংক্রিয় কিউআর ও ডিজিটাল সনদপত্র ইস্যু</div>
                  <div className="text-[11px] text-slate-500">
                    {linkedCert
                      ? `সনদ প্রস্তুত (সনদ নং: ${linkedCert.certificate_number || linkedCert.certificate_no})`
                      : 'চূড়ান্ত অনুমোদনের পর স্বয়ংক্রিয়ভাবে কিউআর সনদ তৈরি হবে'}
                  </div>
                </div>
              </div>
            </div>

            {/* Official Review Notes */}
            {application.review_notes && application.review_notes.length > 0 && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-slate-700 block">দাপ্তরিক মন্তব্য:</span>
                {application.review_notes.map((note, idx) => (
                  <p key={idx} className="text-slate-600">• {note}</p>
                ))}
              </div>
            )}

            {/* Ready Certificate Download & Print Buttons */}
            {application.status === 'certificate_issued' && linkedCert && (
              <div className="space-y-3 pt-2">
                {pdfError && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{pdfError}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={handleViewCert}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    <span>ডিজিটাল সনদপত্র দেখুন</span>
                  </button>
                  {onPrintCertificate && (
                    <button
                      type="button"
                      onClick={() => onPrintCertificate(linkedCert, application.tracking_no)}
                      className="bg-white border-2 border-emerald-700 text-emerald-800 hover:bg-emerald-50 font-bold py-3.5 px-5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
                    >
                      <Printer className="w-4 h-4" />
                      <span>সনদ প্রিন্ট করুন</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={downloadingPdf}
                    onClick={handleDownloadPdf}
                    className="bg-[#064E32] hover:bg-[#08783F] disabled:opacity-60 text-white font-bold py-3.5 px-5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>{downloadingPdf ? 'ডাউনলোড হচ্ছে...' : 'অফিসিয়াল PDF ডাউনলোড'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : searched ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
            <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
            <h4 className="text-base font-bold text-slate-900">আবেদন খুঁজে পাওয়া যায়নি</h4>
            <p className="text-xs text-slate-500">
              <code className="font-mono">{trackingInput}</code> নম্বরে কোনো আবেদন পাওয়া যায়নি। অনুগ্রহ করে সঠিক ট্র্যাকিং নম্বর দিয়ে পুনরায় চেষ্টা করুন।
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
