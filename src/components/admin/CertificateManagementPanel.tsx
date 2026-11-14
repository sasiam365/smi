import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Download,
  Printer,
  Eye,
  Ban,
  RefreshCw,
  RotateCcw,
  History,
  FileSpreadsheet,
  QrCode,
  Info,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  AdministrativeUnit,
  ApplicationApproval,
  Certificate,
  CertificateEvent,
  CertificateVerificationLog,
  Service,
  UserSession,
} from '../../types';
import { api, triggerAuthenticatedDownload } from '../../services/api';
import { ResponsiveDataTable, TableColumn } from '../common/ResponsiveDataTable';
import { CertificatePreviewModal } from '../certificate/CertificatePreviewModal';

interface CertificateManagementPanelProps {
  userSession: UserSession;
  institutions: AdministrativeUnit[];
  services: Service[];
  canFinalApprove: boolean;
  isCrossUnit: boolean;
  selectedUnitFilter: string;
  onPrintCertificate?: (cert: Certificate, trackingNo?: string) => void;
  onNavigateVerify?: (token: string) => void;
  onRefreshDashboard?: () => void;
}

export const CertificateManagementPanel: React.FC<CertificateManagementPanelProps> = ({
  userSession,
  institutions,
  services,
  canFinalApprove,
  isCrossUnit,
  selectedUnitFilter,
  onPrintCertificate,
  onNavigateVerify,
  onRefreshDashboard,
}) => {
  const [items, setItems] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const perms = userSession.permissions || {};
  const canRevoke = perms['certificates.revoke'] !== undefined ? Boolean(perms['certificates.revoke']) : canFinalApprove;
  const canReissue = perms['certificates.reissue'] !== undefined ? Boolean(perms['certificates.reissue']) : canFinalApprove;
  const canDownload = perms['certificates.download'] !== undefined ? Boolean(perms['certificates.download']) : true;
  const canPrint = perms['certificates.print'] !== undefined ? Boolean(perms['certificates.print']) : true;
  const canExport = Boolean(perms['reports.export'] || perms['certificates.download']);

  // Filters & sorting
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unitFilter, setUnitFilter] = useState(selectedUnitFilter || 'all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('issued_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [detailCert, setDetailCert] = useState<Certificate | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    cert: Certificate;
    autoPrint?: boolean;
  } | null>(null);

  const [historyCert, setHistoryCert] = useState<Certificate | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<{
    events: CertificateEvent[];
    approvals: ApplicationApproval[];
    verification_logs: CertificateVerificationLog[];
  } | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('তথ্যগত অসঙ্গতি বা প্রশাসনিক আদেশে বাতিলকৃত');
  const [reissueTarget, setReissueTarget] = useState<Certificate | null>(null);
  const [reissueNote, setReissueNote] = useState('তথ্য যাচাইপূর্বক পুনঃইস্যুকৃত');
  const [reissueDays, setReissueDays] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    setUnitFilter(selectedUnitFilter || 'all');
  }, [selectedUnitFilter]);

  const fetchCertificates = useCallback(async () => {
    if (!userSession.token) return;
    setLoading(true);
    setError('');
    try {
      const effectiveUnit = isCrossUnit
        ? unitFilter
        : userSession.administrative_unit_id || 'unit_goyeshpur';
      const result = await api.queryCertificates(userSession.token, {
        unit_id: effectiveUnit,
        q: q.trim() || undefined,
        status: statusFilter,
        service_id: serviceFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: pageSize,
      });
      setItems(result.items || []);
      setTotal(result.total || 0);
      setTotalPages(result.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সনদ তালিকা লোড করা যায়নি।');
    } finally {
      setLoading(false);
    }
  }, [
    userSession.token,
    userSession.administrative_unit_id,
    isCrossUnit,
    unitFilter,
    q,
    statusFilter,
    serviceFilter,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    page,
    pageSize,
  ]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleOpenHistory = async (cert: Certificate) => {
    if (!userSession.token) return;
    setHistoryCert(cert);
    setHistoryLoading(true);
    setHistoryData(null);
    try {
      const data = await api.getCertificateHistory(userSession.token, cert.id);
      setHistoryData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ইতিহাস লোড ব্যর্থ হয়েছে।');
      setHistoryCert(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDownloadPdf = async (cert: Certificate) => {
    setError('');
    try {
      const { blob, filename } = await api.fetchCertificatePdfBlob(cert.id, {
        authToken: userSession.token,
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

  const handleExportCsv = async () => {
    if (!userSession.token) return;
    setError('');
    const effectiveUnit = isCrossUnit
      ? unitFilter
      : userSession.administrative_unit_id || 'unit_goyeshpur';
    const qParams = new URLSearchParams();
    if (effectiveUnit && effectiveUnit !== 'all') qParams.set('unit_id', effectiveUnit);
    if (q.trim()) qParams.set('q', q.trim());
    if (statusFilter) qParams.set('status', statusFilter);
    if (serviceFilter) qParams.set('service_id', serviceFilter);
    const url = `/api/certificates/export${qParams.toString() ? `?${qParams.toString()}` : ''}`;
    try {
      await triggerAuthenticatedDownload(url, 'PottoyonBD_Certificates.csv', userSession.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV এক্সপোর্ট ব্যর্থ হয়েছে।');
    }
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revokeTarget || !userSession.token) return;
    setSubmittingAction(true);
    setError('');
    try {
      await api.revokeCertificate(userSession.token, revokeTarget.id, revokeReason);
      setSuccessMsg(
        `সনদ নং ${revokeTarget.certificate_number || revokeTarget.certificate_no} সফলভাবে বাতিল (REVOKED) করা হয়েছে।`
      );
      setRevokeTarget(null);
      await fetchCertificates();
      onRefreshDashboard?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সনদ বাতিল ব্যর্থ হয়েছে।');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleConfirmReissue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reissueTarget || !userSession.token) return;
    setSubmittingAction(true);
    setError('');
    try {
      const days = reissueDays.trim() ? parseInt(reissueDays.trim(), 10) : undefined;
      const result = await api.reissueCertificate(userSession.token, reissueTarget.id, {
        notes: reissueNote,
        expires_in_days: Number.isFinite(days) ? days : undefined,
      });
      setSuccessMsg(
        `নতুন সনদ সফলভাবে পুনঃইস্যু হয়েছে! নতুন সনদ নম্বর: ${result.certificate.certificate_number || result.certificate.certificate_no}`
      );
      setReissueTarget(null);
      await fetchCertificates();
      onRefreshDashboard?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'সনদ পুনঃইস্যু ব্যর্থ হয়েছে।');
    } finally {
      setSubmittingAction(false);
    }
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('bn-BD');
  };

  const columns: TableColumn<Certificate>[] = [
    {
      key: 'cert_no',
      header: 'সনদ নং',
      minWidth: '130px',
      stickyLeft: true,
      render: (c) => (
        <span className="font-mono font-bold text-emerald-900">
          {c.certificate_number || c.certificate_no}
        </span>
      ),
    },
    {
      key: 'applicant',
      header: 'আবেদনকারী',
      minWidth: '150px',
      render: (c) => <span className="font-semibold text-slate-900">{c.applicant_name_bn}</span>,
    },
    {
      key: 'type',
      header: 'সনদের ধরন',
      minWidth: '140px',
      render: (c) => (
        <div>
          <div className="font-bold text-slate-800">{c.certificate_title_bn}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            {c.template_version_id || 'tpl_up_general_v1'}
          </div>
        </div>
      ),
    },
    {
      key: 'app_no',
      header: 'আবেদন নং',
      minWidth: '125px',
      render: (c) => (
        <span className="font-mono text-slate-700">
          {c.application_tracking_no || c.application_id}
        </span>
      ),
    },
    {
      key: 'institution',
      header: 'প্রতিষ্ঠান',
      minWidth: '155px',
      render: (c) => (
        <span className="text-slate-700">
          {c.issuing_unit_bn ||
            institutions.find((i) => i.id === c.administrative_unit_id)?.name_bn ||
            c.administrative_unit_id}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: 'জমার তারিখ',
      minWidth: '105px',
      render: (c) => <span className="font-mono text-slate-600">{formatDate(c.application_created_at)}</span>,
    },
    {
      key: 'approved',
      header: 'অনুমোদনের তারিখ',
      minWidth: '115px',
      render: (c) => <span className="font-mono text-slate-600">{formatDate(c.approved_at)}</span>,
    },
    {
      key: 'issued',
      header: 'ইস্যুর তারিখ',
      minWidth: '115px',
      render: (c) => (
        <div>
          <div className="text-slate-800">{c.issue_date_bn || formatDate(c.issued_at)}</div>
          {c.expires_at && (
            <div className="text-[10px] text-amber-700">মেয়াদ: {formatDate(c.expires_at)}</div>
          )}
        </div>
      ),
    },
    {
      key: 'officer',
      header: 'দায়িত্বপ্রাপ্ত কর্মকর্তা',
      minWidth: '145px',
      render: (c) => (
        <div>
          <div className="font-semibold text-slate-800">
            {c.assigned_officer || c.officer_name_bn}
          </div>
          <div className="text-[10px] text-slate-500">{c.officer_title_bn}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '95px',
      render: (c) => (
        <span
          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
            c.status === 'valid'
              ? 'bg-emerald-100 text-emerald-800'
              : c.status === 'revoked'
              ? 'bg-red-100 text-red-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {c.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'পদক্ষেপ',
      align: 'right',
      minWidth: '310px',
      hideInMobileCard: true,
      render: (c) => (
        <div className="flex items-center justify-end gap-1 flex-nowrap">
          <button
            type="button"
            onClick={() => setDetailCert(c)}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
            title="বিস্তারিত"
          >
            <Info className="w-3 h-3" />
            <span>বিস্তারিত</span>
          </button>
          <button
            type="button"
            onClick={() => setPreviewTarget({ cert: c, autoPrint: false })}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
            title="প্রিভিউ"
          >
            <Eye className="w-3 h-3" />
            <span>প্রিভিউ</span>
          </button>
          {canPrint && (
            <button
              type="button"
              onClick={() =>
                onPrintCertificate
                  ? onPrintCertificate(c, c.application_tracking_no)
                  : setPreviewTarget({ cert: c, autoPrint: true })
              }
              className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
              title="শুধুমাত্র সনদ প্রিন্ট"
            >
              <Printer className="w-3 h-3" />
              <span>প্রিন্ট</span>
            </button>
          )}
          {canDownload && (
            <button
              type="button"
              onClick={() => handleDownloadPdf(c)}
              className="bg-slate-800 hover:bg-slate-900 text-white font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
              title="PDF ডাউনলোড"
            >
              <Download className="w-3 h-3" />
              <span>PDF</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleOpenHistory(c)}
            className="bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
            title="অনুমোদন ও অডিট ইতিহাস"
          >
            <History className="w-3 h-3" />
          </button>
          {canRevoke && c.status !== 'revoked' && (
            <button
              type="button"
              onClick={() => setRevokeTarget(c)}
              className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
              title="বাতিল করুন"
            >
              <Ban className="w-3 h-3" />
              <span>বাতিল</span>
            </button>
          )}
          {canReissue && c.status === 'revoked' && (
            <button
              type="button"
              onClick={() => setReissueTarget(c)}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 py-1 rounded text-[11px] flex items-center gap-1"
              title="নতুন সনদ পুনঃইস্যু"
            >
              <RotateCcw className="w-3 h-3" />
              <span>পুনঃইস্যু</span>
            </button>
          )}
        </div>
      ),
    },
  ];

  const validCount = items.filter((i) => i.status === 'valid').length;
  const revokedCount = items.filter((i) => i.status === 'revoked').length;
  const expiredCount = items.filter((i) => i.status === 'expired').length;

  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
      <div className="print-hide-when-modal space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">সনদ ব্যবস্থাপনা ও ডিজিটাল রেজিস্ট্রি</h2>
          <p className="text-xs text-slate-500">
            অনুমোদিত, QR যাচাইকৃত ও PDF সংরক্ষিত সনদপত্রের সম্পূর্ণ তালিকা — মোবাইল ও ডেস্কটপে আনুভূমিক স্ক্রলযোগ্য
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>CSV এক্সপোর্ট</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchCertificates}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>রিফ্রেশ</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 block">মোট সনদ (ফিল্টারকৃত)</span>
          <span className="text-xl font-black text-slate-900 font-mono">{total}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 block">বৈধ (Valid)</span>
          <span className="text-xl font-black text-emerald-800 font-mono">{validCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 block">বাতিলকৃত (Revoked)</span>
          <span className="text-xl font-black text-red-700 font-mono">{revokedCount}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 block">মেয়াদোত্তীর্ণ (Expired)</span>
          <span className="text-xl font-black text-amber-700 font-mono">{expiredCount}</span>
        </div>
      </div>

      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Search, Filters & Sorting */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="সনদ নং, আবেদনকারী, ট্র্যাকিং নং, প্রতিষ্ঠান বা কর্মকর্তা দিয়ে খুঁজুন..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
          >
            <option value="all">সকল অবস্থা</option>
            <option value="valid">বৈধ (Valid)</option>
            <option value="revoked">বাতিল (Revoked)</option>
            <option value="expired">মেয়াদোত্তীর্ণ (Expired)</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => {
              setServiceFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
          >
            <option value="all">সকল সেবার ধরন</option>
            {services.slice(0, 20).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_bn}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 items-center">
          {isCrossUnit && (
            <select
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold col-span-2 sm:col-span-1"
            >
              <option value="all">সকল প্রতিষ্ঠান (১১টি)</option>
              {institutions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name_bn}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            title="শুরুর তারিখ"
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono"
          />

          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            title="শেষ তারিখ"
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono"
          />

          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [sb, sd] = e.target.value.split(':');
              setSortBy(sb);
              setSortDir(sd === 'asc' ? 'asc' : 'desc');
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
          >
            <option value="issued_at:desc">সর্বশেষ ইস্যুকৃত</option>
            <option value="issued_at:asc">পুরাতন ইস্যুকৃত</option>
            <option value="certificate_number:asc">সনদ নং (A-Z)</option>
            <option value="applicant_name_bn:asc">আবেদনকারীর নাম</option>
            <option value="status:asc">অবস্থা অনুযায়ী</option>
          </select>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
          >
            <option value={10}>প্রতি পাতায় ১০টি</option>
            <option value={25}>প্রতি পাতায় ২৫টি</option>
            <option value={50}>প্রতি পাতায় ৫০টি</option>
          </select>
        </div>
      </div>

      {/* Responsive Scrollable Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <ResponsiveDataTable
          data={items}
          columns={columns}
          rowKey={(c) => c.id}
          loading={loading}
          emptyTitle="কোনো সনদপত্র পাওয়া যায়নি"
          emptyDescription="অনুসন্ধান অথবা ফিল্টার শর্ত পরিবর্তন করে দেখুন।"
          mobileCardTitle={(c) => `${c.certificate_title_bn} (#${c.certificate_number || c.certificate_no})`}
          mobileCardBadge={(c) => (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                c.status === 'valid'
                  ? 'bg-emerald-100 text-emerald-800'
                  : c.status === 'revoked'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {c.status}
            </span>
          )}
          mobileCardActions={(c) => (
            <>
              <button
                type="button"
                onClick={() => setPreviewTarget({ cert: c, autoPrint: false })}
                className="bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
              >
                প্রিভিউ
              </button>
              {canPrint && (
                <button
                  type="button"
                  onClick={() =>
                    onPrintCertificate
                      ? onPrintCertificate(c, c.application_tracking_no)
                      : setPreviewTarget({ cert: c, autoPrint: true })
                  }
                  className="bg-white border border-slate-300 text-slate-800 font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
                >
                  প্রিন্ট
                </button>
              )}
              {canDownload && (
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(c)}
                  className="bg-slate-800 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
                >
                  PDF
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenHistory(c)}
                className="bg-blue-50 text-blue-800 font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
              >
                ইতিহাস
              </button>
              {canRevoke && c.status !== 'revoked' && (
                <button
                  type="button"
                  onClick={() => setRevokeTarget(c)}
                  className="bg-red-50 text-red-700 border border-red-200 font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
                >
                  বাতিল
                </button>
              )}
              {canReissue && c.status === 'revoked' && (
                <button
                  type="button"
                  onClick={() => setReissueTarget(c)}
                  className="bg-amber-600 text-white font-bold px-2.5 py-1.5 rounded-lg text-[11px]"
                >
                  পুনঃইস্যু
                </button>
              )}
            </>
          )}
        />

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 font-mono">
            পৃষ্ঠা {page} / {totalPages} (মোট {total} টি সনদ)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>পূর্ববর্তী</span>
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-40 flex items-center gap-1"
            >
              <span>পরবর্তী</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Dedicated Preview & Certificate-Only Print Modal */}
      {previewTarget && (
        <CertificatePreviewModal
          certificate={previewTarget.cert}
          institution={institutions.find((i) => i.id === previewTarget.cert.administrative_unit_id)}
          authToken={userSession.token}
          trackingNo={previewTarget.cert.application_tracking_no}
          autoPrint={previewTarget.autoPrint}
          onOpenPrintRoute={(cert, trackingNo) => {
            setPreviewTarget(null);
            onPrintCertificate?.(cert, trackingNo);
          }}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Detail Inspection Modal */}
      {detailCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {detailCert.certificate_number || detailCert.certificate_no}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {detailCert.certificate_title_bn}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailCert(null)}
                className="text-slate-500 font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-400 block">আবেদনকারী:</span>
                <span className="font-bold text-slate-900">{detailCert.applicant_name_bn}</span>
              </div>
              <div>
                <span className="text-slate-400 block">পিতা / মাতা:</span>
                <span className="font-semibold text-slate-800">
                  {detailCert.father_name_bn} / {detailCert.mother_name_bn}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">আবেদন ট্র্যাকিং নং:</span>
                <span className="font-mono font-bold text-slate-800">
                  {detailCert.application_tracking_no || detailCert.application_id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">ইস্যুকারী প্রতিষ্ঠান:</span>
                <span className="font-semibold text-slate-800">
                  {detailCert.issuing_unit_bn || detailCert.administrative_unit_id}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">অনুমোদনকারী কর্মকর্তা:</span>
                <span className="font-semibold text-slate-800">
                  {detailCert.officer_name_bn} ({detailCert.officer_title_bn})
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">অবস্থা ও মেয়াদ:</span>
                <span className="font-bold uppercase text-emerald-800">{detailCert.status}</span>
                {detailCert.expires_at && (
                  <span className="block text-amber-700 font-mono">
                    মেয়াদ: {formatDate(detailCert.expires_at)}
                  </span>
                )}
              </div>
            </div>

            {detailCert.qr_data_url && (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200">
                <img
                  src={detailCert.qr_data_url}
                  alt="QR"
                  className="w-16 h-16 border border-slate-200 rounded p-1 shrink-0"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1">
                    <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                    <span>QR ভেরিফিকেশন লিংক</span>
                  </span>
                  <div className="font-mono text-[11px] text-slate-600 break-all">
                    {detailCert.verification_url}
                  </div>
                </div>
                {onNavigateVerify &&
                  detailCert.verification_url.includes('/verify/') &&
                  !detailCert.verification_url.includes('[protected-token]') && (
                  <button
                    type="button"
                    onClick={() => {
                      const tok = detailCert.verification_url.split('/verify/')[1] || '';
                      setDetailCert(null);
                      if (tok) onNavigateVerify(tok);
                    }}
                    className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>যাচাই</span>
                  </button>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const target = detailCert;
                  setDetailCert(null);
                  setPreviewTarget({ cert: target, autoPrint: false });
                }}
                className="bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-xl flex items-center gap-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>প্রিভিউ</span>
              </button>
              {canPrint && (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailCert;
                    setDetailCert(null);
                    if (onPrintCertificate) {
                      onPrintCertificate(target, target.application_tracking_no);
                    } else {
                      setPreviewTarget({ cert: target, autoPrint: true });
                    }
                  }}
                  className="bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold px-3.5 py-2 rounded-xl flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>শুধুমাত্র সনদ প্রিন্ট</span>
                </button>
              )}
              {canDownload && (
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(detailCert)}
                  className="bg-slate-800 text-white font-bold px-3.5 py-2 rounded-xl flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PDF ডাউনলোড</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval & Audit History Modal */}
      {historyCert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-blue-700 uppercase">
                  অনুমোদন ও সনদ অডিট ইতিহাস
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  সনদ নং: {historyCert.certificate_number || historyCert.certificate_no}
                </h3>
              </div>
              <button type="button" onClick={() => setHistoryCert(null)} className="text-slate-500 font-bold">
                ✕
              </button>
            </div>

            {historyLoading ? (
              <div className="py-8 text-center text-slate-500">ইতিহাস লোড হচ্ছে...</div>
            ) : historyData ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-slate-800 mb-2">আবেদন অনুমোদন ধাপ ({historyData.approvals.length})</h4>
                  <div className="space-y-1.5">
                    {historyData.approvals.map((ap) => (
                      <div key={ap.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
                        <div>
                          <span className="font-bold text-emerald-900">{ap.decision}</span> —{' '}
                          <span className="font-semibold text-slate-800">{ap.officer_name_bn}</span> ({ap.officer_title_bn})
                          <div className="text-slate-600 mt-0.5">{ap.notes}</div>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 shrink-0">
                          {new Date(ap.approved_at).toLocaleString('bn-BD')}
                        </span>
                      </div>
                    ))}
                    {historyData.approvals.length === 0 && (
                      <div className="text-slate-400">কোনো অনুমোদন লগ নেই।</div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-2">সনদ লাইফসাইকেল ইভেন্ট ({historyData.events.length})</h4>
                  <div className="space-y-1.5">
                    {historyData.events.map((ev) => (
                      <div key={ev.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-emerald-800">{ev.event_type}</span> —{' '}
                          <span>{ev.actor_name_bn}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500">
                          {new Date(ev.created_at).toLocaleString('bn-BD')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-2">QR যাচাই লগ ({historyData.verification_logs.length})</h4>
                  <div className="space-y-1.5">
                    {historyData.verification_logs.map((vl) => (
                      <div key={vl.id} className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex justify-between font-mono text-[11px]">
                        <span>{vl.result_status.toUpperCase()} ({vl.ip_address})</span>
                        <span>{new Date(vl.verified_at).toLocaleString('bn-BD')}</span>
                      </div>
                    ))}
                    {historyData.verification_logs.length === 0 && (
                      <div className="text-slate-400">এখনো কোনো QR স্ক্যান লগ নেই।</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Revoke Modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmRevoke}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-red-200 text-xs"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-red-700 uppercase">সনদ বাতিলকরণ</span>
                <h3 className="text-base font-bold text-slate-900">
                  সনদ নং: {revokeTarget.certificate_number || revokeTarget.certificate_no}
                </h3>
              </div>
              <button type="button" onClick={() => setRevokeTarget(null)} className="text-slate-500 font-bold">
                ✕
              </button>
            </div>
            <p className="text-slate-600">
              সনদটি বাতিল করলে অনলাইন QR যাচাই পেজে তাৎক্ষণিকভাবে <strong>REVOKED</strong> প্রদর্শিত হবে এবং প্রয়োজনে পরে নতুন নম্বরসহ পুনঃইস্যু করা যাবে।
            </p>
            <div>
              <label className="font-bold text-slate-700 block mb-1">বাতিলের কারণ *</label>
              <textarea
                rows={2}
                required
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold"
              >
                ফিরে যান
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold"
              >
                {submittingAction ? 'বাতিল হচ্ছে...' : 'নিশ্চিত বাতিল করুন'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reissue Modal */}
      {reissueTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleConfirmReissue}
            className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-amber-200 text-xs"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[11px] font-bold text-amber-700 uppercase">নতুন সনদ পুনঃইস্যু</span>
                <h3 className="text-base font-bold text-slate-900">
                  পূর্ববর্তী বাতিল সনদ: {reissueTarget.certificate_number || reissueTarget.certificate_no}
                </h3>
              </div>
              <button type="button" onClick={() => setReissueTarget(null)} className="text-slate-500 font-bold">
                ✕
              </button>
            </div>
            <p className="text-slate-600">
              পুনঃইস্যু করলে নতুন অনন্য সনদ নম্বর, নতুন নিরাপদ QR টোকেন এবং নতুন A4 PDF প্রস্তুত হবে; পূর্ববর্তী বাতিলকৃত সনদটি অডিট ও যাচাই ইতিহাসে <strong>REVOKED</strong> হিসেবেই সংরক্ষিত থাকবে।
            </p>
            <div>
              <label className="font-bold text-slate-700 block mb-1">পুনঃইস্যুর কারণ / মন্তব্য *</label>
              <textarea
                rows={2}
                required
                value={reissueNote}
                onChange={(e) => setReissueNote(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">নতুন মেয়াদ (দিন — ঐচ্ছিক)</label>
              <input
                type="number"
                min={1}
                value={reissueDays}
                onChange={(e) => setReissueDays(e.target.value)}
                placeholder="স্থায়ী রাখতে খালি রাখুন"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReissueTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={submittingAction}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
              >
                {submittingAction ? 'পুনঃইস্যু হচ্ছে...' : 'নতুন QR ও PDF সহ পুনঃইস্যু করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
