import React, { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  Award,
  CreditCard,
  Bell,
  User,
  Search,
  Printer,
  Download,
  Eye,
  QrCode,
  PlusCircle,
  Edit3,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import {
  AdministrativeUnit,
  Application,
  Certificate,
  CitizenNotification,
  UserSession,
} from '../../types';
import { api } from '../../services/api';
import { ResponsiveDataTable, TableColumn } from '../common/ResponsiveDataTable';
import { CertificatePreviewModal } from '../certificate/CertificatePreviewModal';

interface CitizenDashboardProps {
  institutions: AdministrativeUnit[];
  userSession?: UserSession;
  onApplyNew: () => void;
  onNavigateVerify: (token: string) => void;
  onNavigateTracking: () => void;
  onNavigateAdminLogin: () => void;
  onPrintCertificate?: (cert: Certificate, trackingNo?: string) => void;
  onLogout?: () => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'পেমেন্ট অপেক্ষমাণ', cls: 'bg-amber-100 text-amber-800' },
  paid: { label: 'ফি পরিশোধিত', cls: 'bg-sky-100 text-sky-800' },
  under_verification: { label: 'যাচাই চলছে', cls: 'bg-blue-100 text-blue-800' },
  correction_required: { label: 'সংশোধন প্রয়োজন', cls: 'bg-orange-100 text-orange-800' },
  forwarded_for_approval: { label: 'অনুমোদনের জন্য প্রেরিত', cls: 'bg-indigo-100 text-indigo-800' },
  approved: { label: 'অনুমোদিত', cls: 'bg-teal-100 text-teal-800' },
  certificate_issued: { label: 'সনদ ইস্যুকৃত', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'বাতিল / প্রত্যাখ্যাত', cls: 'bg-red-100 text-red-800' },
};

export const CitizenDashboard: React.FC<CitizenDashboardProps> = ({
  institutions,
  userSession,
  onApplyNew,
  onNavigateVerify,
  onNavigateTracking,
  onNavigateAdminLogin,
  onPrintCertificate,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    'applications' | 'certificates' | 'payments' | 'notifications' | 'profile'
  >('applications');

  const isAuthCitizen = Boolean(userSession?.role === 'citizen' && userSession?.token);
  const [lookupInput, setLookupInput] = useState(isAuthCitizen ? '' : '01712-345678');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [applications, setApplications] = useState<Application[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [notifications, setNotifications] = useState<CitizenNotification[]>([]);

  // Certificate preview modal state
  const [previewTarget, setPreviewTarget] = useState<{
    cert: Certificate;
    trackingNo?: string;
    autoPrint?: boolean;
  } | null>(null);

  // Correction resubmit modal state
  const [correctionApp, setCorrectionApp] = useState<Application | null>(null);
  const [resubmitName, setResubmitName] = useState('');
  const [resubmitAddress, setResubmitAddress] = useState('');
  const [resubmitNote, setResubmitNote] = useState('');
  const [resubmitting, setResubmitting] = useState(false);

  const loadPortalData = useCallback(
    async (queryText: string) => {
      const q = queryText.trim();
      if (!q && !isAuthCitizen) {
        setError('তথ্য অনুসন্ধান করতে আপনার মোবাইল নম্বর অথবা ট্র্যাকিং নম্বর দিন।');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const isTracking = /^(UP|PM)-/i.test(q);
        const data = await api.getCitizenPortal({
          tracking_no: isTracking ? q.toUpperCase() : undefined,
          mobile: !isTracking && q ? q : undefined,
          token: isAuthCitizen ? userSession?.token : undefined,
        });
        setApplications(data.applications || []);
        setCertificates(data.certificates || []);
        setNotifications(data.notifications || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'নাগরিক তথ্য লোড করা যায়নি।');
      } finally {
        setLoading(false);
      }
    },
    [isAuthCitizen, userSession?.token]
  );

  useEffect(() => {
    if (isAuthCitizen) {
      loadPortalData('');
    } else {
      loadPortalData('01712-345678');
    }
  }, [isAuthCitizen, loadPortalData]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPortalData(lookupInput);
  };

  const openResubmitModal = (app: Application) => {
    setCorrectionApp(app);
    setResubmitName(app.applicant_name_bn);
    setResubmitAddress(app.present_address_bn || '');
    setResubmitNote('');
  };

  const handleConfirmResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionApp) return;
    setResubmitting(true);
    setError('');
    try {
      await api.resubmitApplication(correctionApp.id, {
        tracking_no: correctionApp.tracking_no,
        applicant_name_bn: resubmitName.trim(),
        present_address_bn: resubmitAddress.trim(),
        correction_response: resubmitNote.trim() || 'সংশোধিত তথ্য পুনঃদাখিল করা হয়েছে।',
      });
      setSuccessMsg(
        `আবেদন নম্বর ${correctionApp.tracking_no} সফলভাবে সংশোধনপূর্বক পুনরায় যাচাইয়ের জন্য পাঠানো হয়েছে।`
      );
      setCorrectionApp(null);
      await loadPortalData(lookupInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'পুনঃদাখিল ব্যর্থ হয়েছে।');
    } finally {
      setResubmitting(false);
    }
  };

  const handleDownloadPdf = async (cert: Certificate) => {
    const linkedApp = applications.find((a) => a.id === cert.application_id);
    const trackingNo = cert.application_tracking_no || linkedApp?.tracking_no;
    setError('');
    try {
      const { blob, filename } = await api.fetchCertificatePdfBlob(cert.id, {
        trackingNo,
        authToken: isAuthCitizen ? userSession?.token : undefined,
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
      setError(err instanceof Error ? err.message : 'PDF ডাউনলোড ব্যর্থ হয়েছে।');
    }
  };

  const primaryProfile = applications[0];

  const appColumns: TableColumn<Application>[] = [
    {
      key: 'tracking_no',
      header: 'ট্র্যাকিং নম্বর',
      minWidth: '130px',
      stickyLeft: true,
      render: (app) => (
        <span className="font-mono font-bold text-emerald-900">{app.tracking_no}</span>
      ),
    },
    {
      key: 'service',
      header: 'সেবার নাম',
      minWidth: '150px',
      render: (app) => <span className="font-semibold text-slate-900">{app.service_name_bn}</span>,
    },
    {
      key: 'unit',
      header: 'প্রতিষ্ঠান',
      minWidth: '160px',
      render: (app) => {
        const u = institutions.find((i) => i.id === app.administrative_unit_id);
        return <span className="text-slate-700">{u?.name_bn || app.administrative_unit_id}</span>;
      },
    },
    {
      key: 'date',
      header: 'আবেদনের তারিখ',
      minWidth: '110px',
      render: (app) => (
        <span className="font-mono text-slate-600">
          {new Date(app.created_at).toLocaleDateString('bn-BD')}
        </span>
      ),
    },
    {
      key: 'fee',
      header: 'ফি',
      align: 'right',
      minWidth: '85px',
      render: (app) => (
        <span className="font-mono font-bold text-slate-800">৳{app.fee_amount}</span>
      ),
    },
    {
      key: 'status',
      header: 'বর্তমান অবস্থা',
      align: 'center',
      minWidth: '140px',
      render: (app) => {
        const badge = STATUS_BADGE[app.status] || {
          label: app.status,
          cls: 'bg-slate-100 text-slate-800',
        };
        return (
          <div className="inline-flex flex-col items-center gap-0.5">
            <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${badge.cls}`}>
              {badge.label}
            </span>
            {app.status === 'correction_required' && app.correction_note && (
              <span className="text-[10px] text-orange-700 max-w-[160px] truncate">
                {app.correction_note}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'পদক্ষেপ',
      align: 'right',
      minWidth: '190px',
      hideInMobileCard: true,
      render: (app) => {
        const cert = certificates.find(
          (c) => c.id === app.certificate_id || c.application_id === app.id
        );
        return (
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            {app.status === 'correction_required' && (
              <button
                type="button"
                onClick={() => openResubmitModal(app)}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>সংশোধন পুনঃদাখিল</span>
              </button>
            )}
            {cert && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewTarget({ cert, trackingNo: app.tracking_no, autoPrint: false })
                  }
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>সনদ</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(cert)}
                  className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  <span>PDF</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onNavigateTracking}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2.5 py-1 rounded text-[11px]"
            >
              ট্র্যাক
            </button>
          </div>
        );
      },
    },
  ];

  const certColumns: TableColumn<Certificate>[] = [
    {
      key: 'cert_no',
      header: 'সনদ নম্বর',
      minWidth: '130px',
      stickyLeft: true,
      render: (cert) => (
        <span className="font-mono font-bold text-emerald-900">
          {cert.certificate_number || cert.certificate_no}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'সনদের ধরন',
      minWidth: '150px',
      render: (cert) => <span className="font-bold text-slate-900">{cert.certificate_title_bn}</span>,
    },
    {
      key: 'unit',
      header: 'ইস্যুকারী প্রতিষ্ঠান',
      minWidth: '160px',
      render: (cert) => (
        <span className="text-slate-700">
          {cert.issuing_unit_bn ||
            institutions.find((i) => i.id === cert.administrative_unit_id)?.name_bn ||
            'স্থানীয় সরকার'}
        </span>
      ),
    },
    {
      key: 'issue_date',
      header: 'ইস্যুর তারিখ',
      minWidth: '120px',
      render: (cert) => <span className="text-slate-600">{cert.issue_date_bn}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '100px',
      render: (cert) => (
        <span
          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
            cert.status === 'valid'
              ? 'bg-emerald-100 text-emerald-800'
              : cert.status === 'revoked'
              ? 'bg-red-100 text-red-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {cert.status === 'valid' ? 'বৈধ' : cert.status === 'revoked' ? 'বাতিল' : 'মেয়াদোত্তীর্ণ'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'পদক্ষেপ',
      align: 'right',
      minWidth: '240px',
      hideInMobileCard: true,
      render: (cert) => {
        const linked = applications.find((a) => a.id === cert.application_id);
        const trackingNo = cert.application_tracking_no || linked?.tracking_no;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setPreviewTarget({ cert, trackingNo, autoPrint: false })}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
            >
              <Eye className="w-3 h-3" />
              <span>প্রিভিউ</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onPrintCertificate
                  ? onPrintCertificate(cert, trackingNo)
                  : setPreviewTarget({ cert, trackingNo, autoPrint: true })
              }
              className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
            >
              <Printer className="w-3 h-3" />
              <span>প্রিন্ট</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadPdf(cert)}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>PDF</span>
            </button>
            {cert.verification_url && !cert.verification_url.includes('[protected-token]') && (
              <button
                type="button"
                onClick={() => {
                  const tok = cert.verification_url.split('/verify/')[1] || '';
                  if (tok) onNavigateVerify(tok);
                }}
                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
                title="QR যাচাই"
              >
                <QrCode className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const paymentColumns: TableColumn<Application>[] = [
    {
      key: 'trx',
      header: 'ট্রানজেকশন আইডি',
      minWidth: '130px',
      stickyLeft: true,
      render: (app) => (
        <span className="font-mono font-bold text-slate-900">
          {app.transaction_id || 'অপেক্ষমাণ'}
        </span>
      ),
    },
    {
      key: 'tracking',
      header: 'আবেদন নম্বর',
      minWidth: '120px',
      render: (app) => <span className="font-mono text-emerald-900">{app.tracking_no}</span>,
    },
    {
      key: 'service',
      header: 'সেবা',
      minWidth: '150px',
      render: (app) => <span className="font-medium text-slate-800">{app.service_name_bn}</span>,
    },
    {
      key: 'method',
      header: 'মাধ্যম',
      minWidth: '90px',
      render: (app) => (
        <span className="uppercase font-semibold text-slate-700">
          {app.payment_method || '-'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'পরিমাণ',
      align: 'right',
      minWidth: '90px',
      render: (app) => (
        <span className="font-mono font-bold text-emerald-800">৳{app.fee_amount}</span>
      ),
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '100px',
      render: (app) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            app.payment_status === 'paid'
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {app.payment_status === 'paid' ? 'পরিশোধিত' : 'বকেয়া'}
        </span>
      ),
    },
  ];

  return (
    <div className="py-6 sm:py-8 bg-[#F3F6F4] min-h-screen">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 space-y-6 print-hide-when-modal">
        {/* Top Citizen Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-md">
                নাগরিক সেবা পোর্টাল
              </span>
              {isAuthCitizen && (
                <span className="text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 rounded-md flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>সুরক্ষিত নাগরিক একাউন্ট ({userSession?.name})</span>
                </span>
              )}
              <span className="text-xs text-slate-500 font-mono">পাবনা সদর উপজেলা</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">
              {primaryProfile
                ? `স্বাগতম, ${primaryProfile.applicant_name_bn}`
                : isAuthCitizen
                ? `স্বাগতম, ${userSession?.name}`
                : 'আমার নাগরিক ড্যাশবোর্ড'}
            </h1>
            <p className="text-xs text-slate-600">
              {isAuthCitizen
                ? 'আপনার নিজস্ব আবেদন, পেমেন্ট রসিদ, নোটিফিকেশন এবং ডিজিটাল সনদ দেখুন ও প্রিন্ট করুন (অন্য নাগরিকের তথ্য সুরক্ষিতভাবে সীমাবদ্ধ)'
                : 'আপনার মোবাইল নম্বর অথবা ট্র্যাকিং নম্বর দিয়ে আবেদন, পেমেন্ট রসিদ, নোটিফিকেশন এবং ডিজিটাল সনদ দেখুন ও প্রিন্ট করুন'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onApplyNew}
              className="bg-[#08783F] hover:bg-[#064E32] text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>নতুন আবেদন করুন</span>
            </button>
            <button
              type="button"
              onClick={onNavigateAdminLogin}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold px-3.5 py-2.5 rounded-xl text-xs"
            >
              প্রশাসনিক লগইন
            </button>
            {isAuthCitizen && onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>লগআউট</span>
              </button>
            )}
          </div>
        </div>

        {/* Lookup Bar */}
        <form
          onSubmit={handleSearchSubmit}
          className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="মোবাইল নম্বর (যেমন: 01712-345678) অথবা ট্র্যাকিং নম্বর (যেমন: UP-2026-10025)"
              className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>তথ্য খুঁজুন</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLookupInput('01712-345678');
                loadPortalData('01712-345678');
              }}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs whitespace-nowrap"
            >
              নমুনা নাগরিক
            </button>
          </div>
        </form>

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button type="button" onClick={() => setSuccessMsg('')} className="font-bold">
              ✕
            </button>
          </div>
        )}

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">মোট আবেদন</span>
            <span className="text-2xl font-black text-slate-900 font-mono">{applications.length}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">প্রাপ্য সনদপত্র</span>
            <span className="text-2xl font-black text-emerald-800 font-mono">{certificates.length}</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">সংশোধন প্রয়োজন</span>
            <span className="text-2xl font-black text-orange-700 font-mono">
              {applications.filter((a) => a.status === 'correction_required').length}
            </span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">পরিশোধিত ফি</span>
            <span className="text-2xl font-black text-slate-900 font-mono">
              ৳
              {applications
                .filter((a) => a.payment_status === 'paid')
                .reduce((s, a) => s + (a.fee_amount || 0), 0)}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold">
          {[
            { id: 'applications', label: `আমার আবেদনসমূহ (${applications.length})`, icon: FileText },
            { id: 'certificates', label: `আমার সনদসমূহ (${certificates.length})`, icon: Award },
            { id: 'payments', label: 'পেমেন্ট ইতিহাস', icon: CreditCard },
            { id: 'notifications', label: `নোটিফিকেশন (${notifications.length})`, icon: Bell },
            { id: 'profile', label: 'নাগরিক প্রোফাইল', icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2.5 rounded-xl flex items-center gap-2 whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        {activeTab === 'applications' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <ResponsiveDataTable
              data={applications}
              columns={appColumns}
              rowKey={(a) => a.id}
              loading={loading}
              emptyTitle="কোনো আবেদন পাওয়া যায়নি"
              emptyDescription="উপরে আপনার মোবাইল নম্বর অথবা ট্র্যাকিং নম্বর দিয়ে খুঁজুন অথবা নতুন আবেদন করুন।"
              mobileCardTitle={(a) => `${a.service_name_bn} (${a.tracking_no})`}
              mobileCardBadge={(a) => (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    STATUS_BADGE[a.status]?.cls || 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {STATUS_BADGE[a.status]?.label || a.status}
                </span>
              )}
              mobileCardActions={(a) => {
                const cert = certificates.find(
                  (c) => c.id === a.certificate_id || c.application_id === a.id
                );
                return (
                  <>
                    {a.status === 'correction_required' && (
                      <button
                        type="button"
                        onClick={() => openResubmitModal(a)}
                        className="bg-orange-600 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                      >
                        সংশোধন পুনঃদাখিল
                      </button>
                    )}
                    {cert && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewTarget({ cert, trackingNo: a.tracking_no, autoPrint: false })
                        }
                        className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                      >
                        সনদ দেখুন
                      </button>
                    )}
                  </>
                );
              }}
            />
          </div>
        )}

        {activeTab === 'certificates' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <ResponsiveDataTable
              data={certificates}
              columns={certColumns}
              rowKey={(c) => c.id}
              loading={loading}
              emptyTitle="এখনো কোনো অনুমোদিত সনদ পাওয়া যায়নি"
              emptyDescription="আবেদন চূড়ান্তভাবে অনুমোদিত হলে স্বয়ংক্রিয়ভাবে আপনার সনদ এখানে যুক্ত হবে।"
              mobileCardTitle={(c) => `${c.certificate_title_bn} (${c.certificate_number || c.certificate_no})`}
              mobileCardActions={(c) => {
                const linked = applications.find((a) => a.id === c.application_id);
                const trackingNo = c.application_tracking_no || linked?.tracking_no;
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewTarget({ cert: c, trackingNo, autoPrint: false })}
                      className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                    >
                      প্রিভিউ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onPrintCertificate
                          ? onPrintCertificate(c, trackingNo)
                          : setPreviewTarget({ cert: c, trackingNo, autoPrint: true })
                      }
                      className="bg-white border border-slate-300 text-slate-800 font-bold px-3 py-1.5 rounded-lg text-[11px]"
                    >
                      প্রিন্ট
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(c)}
                      className="bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
                    >
                      PDF
                    </button>
                  </>
                );
              }}
            />
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <ResponsiveDataTable
              data={applications}
              columns={paymentColumns}
              rowKey={(a) => a.id}
              loading={loading}
              mobileCardTitle={(a) => `${a.service_name_bn} — ৳${a.fee_amount}`}
            />
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            {notifications.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                কোনো এসএমএস বা পোর্টাল নোটিফিকেশন পাওয়া যায়নি।
              </div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-emerald-900">{n.title_bn}</span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(n.created_at).toLocaleString('bn-BD')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700">{n.message_bn}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl space-y-4 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              নাগরিক প্রোফাইল তথ্য
            </h3>
            {primaryProfile ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block">নাগরিকের নাম:</span>
                  <span className="font-bold text-slate-900 text-sm">{primaryProfile.applicant_name_bn}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">মোবাইল নম্বর:</span>
                  <span className="font-mono font-bold text-slate-900">{primaryProfile.mobile}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">পিতা / মাতা:</span>
                  <span className="font-semibold text-slate-800">
                    {primaryProfile.father_name_bn} / {primaryProfile.mother_name_bn}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">ঠিকানা ও ওয়ার্ড:</span>
                  <span className="font-semibold text-slate-800">
                    {primaryProfile.ward_no} নং ওয়ার্ড, {primaryProfile.village_or_area_bn}, {primaryProfile.upazila_bn}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500">অনুগ্রহ করে মোবাইল নম্বর বা ট্র্যাকিং নম্বর দিয়ে অনুসন্ধান করুন।</p>
            )}
          </div>
        )}
      </div>

      {/* Certificate Preview & Certificate-Only Print Modal */}
      {previewTarget && (
        <CertificatePreviewModal
          certificate={previewTarget.cert}
          institution={institutions.find((i) => i.id === previewTarget.cert.administrative_unit_id)}
          authToken={isAuthCitizen ? userSession?.token : undefined}
          trackingNo={previewTarget.trackingNo}
          autoPrint={previewTarget.autoPrint}
          onOpenPrintRoute={(cert, trackingNo) => {
            setPreviewTarget(null);
            onPrintCertificate?.(cert, trackingNo);
          }}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Correction Resubmit Modal */}
      {correctionApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmResubmit}
            className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-orange-200 text-xs"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-orange-700 uppercase">
                  আবেদন সংশোধন ও পুনঃদাখিল
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">
                  ট্র্যাকিং নং: {correctionApp.tracking_no}
                </h3>
              </div>
              <button type="button" onClick={() => setCorrectionApp(null)} className="text-slate-500 font-bold">
                ✕
              </button>
            </div>

            {correctionApp.correction_note && (
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-900">
                <strong>কর্মকর্তার নির্দেশনা:</strong> {correctionApp.correction_note}
              </div>
            )}

            <div>
              <label className="font-bold text-slate-700 block mb-1">সংশোধিত আবেদনকারীর নাম (বাংলা)</label>
              <input
                type="text"
                required
                value={resubmitName}
                onChange={(e) => setResubmitName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">সংশোধিত ঠিকানা</label>
              <input
                type="text"
                value={resubmitAddress}
                onChange={(e) => setResubmitAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">সংশোধন সংক্রান্ত মন্তব্য *</label>
              <textarea
                rows={2}
                required
                value={resubmitNote}
                onChange={(e) => setResubmitNote(e.target.value)}
                placeholder="প্রয়োজনীয় তথ্য ও বানান সংশোধন করে পুনরায় দাখিল করা হলো..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrectionApp(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={resubmitting}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
              >
                {resubmitting ? 'পাঠানো হচ্ছে...' : 'সংশোধিত আবেদন দাখিল করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
