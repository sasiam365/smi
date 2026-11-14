import React, { useEffect, useState } from 'react';
import {
  Plus,
  CheckCircle,
  RefreshCw,
  Trash2,
  CreditCard,
  ShieldCheck,
  UserCheck,
  UserX,
  Save,
  Lock,
  Download,
  RotateCcw,
} from 'lucide-react';
import {
  AdministrativeUnit,
  Application,
  CertificateEvent,
  CertificateTemplate,
  CertificateVerificationLog,
  ContactInquiry,
  HoldingTaxRecord,
  Notice,
  RefundRequest,
  RolePermissionEntry,
  Service,
  StaffMember,
  SystemSettings,
  TradeLicenseRecord,
  UserRole,
  UserSession,
  WardOrDepartment,
} from '../../types';
import { api, triggerAuthenticatedDownload } from '../../services/api';
import { ResponsiveDataTable, TableColumn } from '../common/ResponsiveDataTable';

interface SharedPanelProps {
  userSession: UserSession;
  institutions: AdministrativeUnit[];
  isCrossUnit: boolean;
  canFinalApprove: boolean;
  currentUnit: AdministrativeUnit;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshAll: () => Promise<void>;
}

export const PaymentsPanel: React.FC<
  SharedPanelProps & {
    applications: Application[];
    totalRevenue: number;
    refundRequests?: RefundRequest[];
  }
> = ({
  userSession,
  applications,
  totalRevenue,
  refundRequests = [],
  onSuccess,
  onError,
  onRefreshAll,
}) => {
  const paidApps = applications.filter((a) => a.payment_status === 'paid');
  const perms = userSession.permissions || {};
  const canRequestRefund = Boolean(perms['payments.request_refund']);
  const canApproveRefund = Boolean(perms['payments.approve_refund']);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundAppId, setRefundAppId] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);

  const handleCreateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token || !refundAppId) return;
    setRefundBusy(true);
    try {
      const targetApp = paidApps.find((a) => a.id === refundAppId);
      await api.createRefundRequest(userSession.token, {
        application_id: refundAppId,
        amount: targetApp?.fee_amount,
        reason_bn: refundReason.trim() || 'ভুল বা অতিরিক্ত ফি পরিশোধের কারণে রিফান্ড অনুরোধ',
      });
      setRefundModalOpen(false);
      setRefundAppId('');
      setRefundReason('');
      onSuccess('রিফান্ড অনুরোধ সফলভাবে দাখিল করা হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'রিফান্ড অনুরোধ দাখিল ব্যর্থ হয়েছে।');
    } finally {
      setRefundBusy(false);
    }
  };

  const handleDecideRefund = async (rr: RefundRequest, decision: 'approved' | 'rejected') => {
    if (!userSession.token) return;
    setRefundBusy(true);
    try {
      await api.decideRefundRequest(userSession.token, rr.id, decision);
      onSuccess(
        decision === 'approved'
          ? `রিফান্ড অনুরোধ (${rr.id}) অনুমোদিত হয়েছে।`
          : `রিফান্ড অনুরোধ (${rr.id}) প্রত্যাখ্যাত হয়েছে।`
      );
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'রিফান্ড সিদ্ধান্ত সংরক্ষণ ব্যর্থ হয়েছে।');
    } finally {
      setRefundBusy(false);
    }
  };

  const columns: TableColumn<Application>[] = [
    {
      key: 'trx',
      header: 'ট্রানজেকশন আইডি',
      minWidth: '130px',
      stickyLeft: true,
      render: (a) => (
        <span className="font-mono font-bold text-slate-900">{a.transaction_id || 'BKS10293847'}</span>
      ),
    },
    {
      key: 'tracking',
      header: 'আবেদন নং',
      minWidth: '120px',
      render: (a) => <span className="font-mono text-emerald-900">{a.tracking_no}</span>,
    },
    {
      key: 'applicant',
      header: 'আবেদনকারী',
      minWidth: '140px',
      render: (a) => <span className="font-semibold text-slate-800">{a.applicant_name_bn}</span>,
    },
    {
      key: 'service',
      header: 'সেবা',
      minWidth: '140px',
      render: (a) => <span className="text-slate-700">{a.service_name_bn}</span>,
    },
    {
      key: 'method',
      header: 'মাধ্যম',
      minWidth: '90px',
      render: (a) => (
        <span className="uppercase font-semibold text-slate-700">{a.payment_method || 'bkash'}</span>
      ),
    },
    {
      key: 'amount',
      header: 'পরিমাণ',
      align: 'right',
      minWidth: '90px',
      render: (a) => <span className="font-mono font-bold text-emerald-800">৳{a.fee_amount}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '90px',
      render: () => (
        <span className="text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded">
          সফল
        </span>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">পেমেন্ট রিকনসিলিয়েশন ও রাজস্ব</h2>
        {canRequestRefund && paidApps.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setRefundAppId(paidApps[0]?.id || '');
              setRefundModalOpen(true);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>রিফান্ড অনুরোধ দাখিল</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <span className="text-xs text-slate-500 font-semibold block">মোট লেনদেন সংখ্যা</span>
          <span className="text-2xl font-black text-slate-900 font-mono">{paidApps.length}</span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <span className="text-xs text-slate-500 font-semibold block">অনলাইন সংগৃহীত অর্থ</span>
          <span className="text-2xl font-black text-emerald-800 font-mono">
            ৳{totalRevenue.toLocaleString('bn-BD')}
          </span>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200">
          <span className="text-xs text-slate-500 font-semibold block">রিফান্ড অনুরোধ</span>
          <span className="text-2xl font-black text-amber-700 font-mono">
            {refundRequests.filter((r) => r.status === 'pending').length}টি অপেক্ষমাণ
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800">যাচাইকৃত ফি আদায় রেকর্ড</h3>
        </div>
        <ResponsiveDataTable
          data={paidApps}
          columns={columns}
          rowKey={(a) => a.id}
          mobileCardTitle={(a) => `${a.service_name_bn} — ৳${a.fee_amount}`}
        />
      </div>

      {(refundRequests.length > 0 || canRequestRefund || canApproveRefund) && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-sm font-bold text-slate-900">রিফান্ড অনুরোধ ও অনুমোদন ({refundRequests.length})</h3>
          </div>
          {refundRequests.length === 0 ? (
            <p className="text-xs text-slate-400">কোনো রিফান্ড অনুরোধ নেই।</p>
          ) : (
            <div className="space-y-2 text-xs">
              {refundRequests.map((rr) => (
                <div
                  key={rr.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{rr.application_id}</span>
                      <span className="font-mono font-bold text-emerald-800">৳{rr.amount}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rr.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : rr.status === 'rejected'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {rr.status}
                      </span>
                    </div>
                    <p className="text-slate-700">{rr.reason_bn}</p>
                    <p className="text-[11px] text-slate-500">আবেদনকারী কর্মকর্তা: {rr.requested_by_name_bn}</p>
                  </div>
                  {canApproveRefund && rr.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={refundBusy}
                        onClick={() => handleDecideRefund(rr, 'approved')}
                        className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg"
                      >
                        অনুমোদন করুন
                      </button>
                      <button
                        type="button"
                        disabled={refundBusy}
                        onClick={() => handleDecideRefund(rr, 'rejected')}
                        className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold px-3 py-1.5 rounded-lg"
                      >
                        প্রত্যাখ্যান
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {refundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreateRefund} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              নতুন ফি রিফান্ড অনুরোধ দাখিল
            </h3>
            <div>
              <label className="font-bold block mb-1">পরিশোধিত আবেদন নির্বাচন করুন *</label>
              <select
                required
                value={refundAppId}
                onChange={(e) => setRefundAppId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                {paidApps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tracking_no} — {a.applicant_name_bn} (৳{a.fee_amount})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">রিফান্ডের কারণ *</label>
              <textarea
                rows={3}
                required
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="যেমন: নাগরিক ভুলবশত দুইবার ফি পরিশোধ করেছেন..."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRefundModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                disabled={refundBusy}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold"
              >
                {refundBusy ? 'দাখিল হচ্ছে...' : 'অনুরোধ পাঠান'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const HoldingTaxPanel: React.FC<
  SharedPanelProps & {
    holdingTaxes: HoldingTaxRecord[];
  }
> = ({ userSession, institutions, isCrossUnit, currentUnit, holdingTaxes, onSuccess, onError, onRefreshAll }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [holdingNo, setHoldingNo] = useState('');
  const [wardNo, setWardNo] = useState(1);
  const [ownerName, setOwnerName] = useState('');
  const [ownerMobile, setOwnerMobile] = useState('01700-000000');
  const [structureType, setStructureType] = useState('আধাপাকা বসতবাড়ি');
  const [annualTax, setAnnualTax] = useState(600);
  const [unitId, setUnitId] = useState(currentUnit.id);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePay = async (ht: HoldingTaxRecord) => {
    if (!userSession.token) return;
    setBusyId(ht.id);
    try {
      await api.payHoldingTax(userSession.token, ht.id);
      onSuccess(`হোল্ডিং নং ${ht.holding_no} এর কর সফলভাবে আদায় (PAID) হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'হোল্ডিং কর আদায়ে সমস্যা হয়েছে।');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.createHoldingTax(userSession.token, {
        administrative_unit_id: isCrossUnit ? unitId : currentUnit.id,
        holding_no: holdingNo.trim(),
        ward_no: wardNo,
        owner_name_bn: ownerName.trim(),
        owner_mobile: ownerMobile.trim(),
        structure_type: structureType,
        annual_tax: annualTax,
      });
      setModalOpen(false);
      setHoldingNo('');
      setOwnerName('');
      onSuccess('নতুন হোল্ডিং ট্যাক্স অ্যাসেসমেন্ট সফলভাবে যুক্ত হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'হোল্ডিং যোগ ব্যর্থ হয়েছে।');
    }
  };

  const canReconcileTax = Boolean(userSession.permissions?.['payments.reconcile']);

  const columns: TableColumn<HoldingTaxRecord>[] = [
    {
      key: 'holding_no',
      header: 'হোল্ডিং নং',
      minWidth: '110px',
      stickyLeft: true,
      render: (ht) => <span className="font-mono font-bold text-slate-900">{ht.holding_no}</span>,
    },
    {
      key: 'ward',
      header: 'ওয়ার্ড',
      minWidth: '80px',
      render: (ht) => <span>{ht.ward_no} নং</span>,
    },
    {
      key: 'owner',
      header: 'মালিক',
      minWidth: '150px',
      render: (ht) => <span className="font-bold text-slate-900">{ht.owner_name_bn}</span>,
    },
    {
      key: 'structure',
      header: 'স্থাপনা',
      minWidth: '130px',
      render: (ht) => <span className="text-slate-600">{ht.structure_type}</span>,
    },
    {
      key: 'annual',
      header: 'বাৎসরিক কর',
      align: 'right',
      minWidth: '100px',
      render: (ht) => <span className="font-mono font-semibold">৳{ht.annual_tax}</span>,
    },
    {
      key: 'due',
      header: 'বকেয়া',
      align: 'right',
      minWidth: '95px',
      render: (ht) => <span className="font-mono font-bold text-amber-700">৳{ht.current_due}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '95px',
      render: (ht) => (
        <span
          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
            ht.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {ht.status === 'paid' ? 'পরিশোধিত' : 'বকেয়া'}
        </span>
      ),
    },
    ...(canReconcileTax
      ? [
          {
            key: 'action',
            header: 'পদক্ষেপ',
            align: 'right' as const,
            minWidth: '130px',
            hideInMobileCard: true,
            render: (ht: HoldingTaxRecord) =>
              ht.status !== 'paid' ? (
                <button
                  type="button"
                  disabled={busyId === ht.id}
                  onClick={() => handlePay(ht)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1 rounded text-[11px] flex items-center gap-1 ml-auto"
                >
                  <CreditCard className="w-3 h-3" />
                  <span>{busyId === ht.id ? '...' : 'কর আদায়'}</span>
                </button>
              ) : (
                <span className="text-emerald-700 font-semibold text-[11px]">সম্পন্ন</span>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">হোল্ডিং ট্যাক্স রেজিস্ট্রি</h2>
          <p className="text-xs text-slate-500">বসতবাড়ি ও বাণিজ্যিক ভবনের মূল্যায়ন ও কর আদায়</p>
        </div>
        {canReconcileTax && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন হোল্ডিং যোগ</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <ResponsiveDataTable
          data={holdingTaxes}
          columns={columns}
          rowKey={(ht) => ht.id}
          mobileCardTitle={(ht) => `হোল্ডিং #${ht.holding_no} — ${ht.owner_name_bn}`}
          mobileCardActions={(ht) =>
            canReconcileTax && ht.status !== 'paid' ? (
              <button
                type="button"
                onClick={() => handlePay(ht)}
                className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
              >
                কর আদায় (৳{ht.current_due})
              </button>
            ) : null
          }
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              নতুন হোল্ডিং ট্যাক্স রেকর্ড যুক্ত করুন
            </h3>
            {isCrossUnit && (
              <div>
                <label className="font-bold block mb-1">প্রতিষ্ঠান</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {institutions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name_bn}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">হোল্ডিং নম্বর *</label>
                <input
                  type="text"
                  required
                  value={holdingNo}
                  onChange={(e) => setHoldingNo(e.target.value)}
                  placeholder="যেমন: ৩৫৪/ক"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">ওয়ার্ড নম্বর *</label>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={wardNo}
                  onChange={(e) => setWardNo(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">মালিকের নাম *</label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">স্থাপনার ধরন</label>
                <input
                  type="text"
                  value={structureType}
                  onChange={(e) => setStructureType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">বাৎসরিক কর (৳)</label>
                <input
                  type="number"
                  min={50}
                  value={annualTax}
                  onChange={(e) => setAnnualTax(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">মোবাইল নম্বর</label>
              <input
                type="text"
                value={ownerMobile}
                onChange={(e) => setOwnerMobile(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold"
              >
                সংরক্ষণ করুন
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const TradeLicensePanel: React.FC<
  SharedPanelProps & {
    tradeLicenses: TradeLicenseRecord[];
  }
> = ({ userSession, institutions, isCrossUnit, currentUnit, tradeLicenses, onSuccess, onError, onRefreshAll }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [businessType, setBusinessType] = useState('ব্যবসা ও বিপণন');
  const [address, setAddress] = useState('সদর বাজার');
  const [feeAmount, setFeeAmount] = useState(500);
  const [unitId, setUnitId] = useState(currentUnit.id);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleRenew = async (tl: TradeLicenseRecord) => {
    if (!userSession.token) return;
    setBusyId(tl.id);
    try {
      await api.renewTradeLicense(userSession.token, tl.id);
      onSuccess(`ট্রেড লাইসেন্স ${tl.license_no} সফলভাবে ১ বছরের জন্য নবায়ন হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'নবায়ন ব্যর্থ হয়েছে।');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.createTradeLicense(userSession.token, {
        administrative_unit_id: isCrossUnit ? unitId : currentUnit.id,
        business_name_bn: businessName.trim(),
        owner_name_bn: ownerName.trim(),
        business_type: businessType.trim(),
        address_bn: address.trim(),
        fee_amount: feeAmount,
      });
      setModalOpen(false);
      setBusinessName('');
      setOwnerName('');
      onSuccess('নতুন ট্রেড লাইসেন্স সফলভাবে ইস্যু করা হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ট্রেড লাইসেন্স তৈরি ব্যর্থ হয়েছে।');
    }
  };

  const canManageTrade = Boolean(
    userSession.permissions?.['payments.reconcile'] || userSession.permissions?.['services.manage']
  );

  const columns: TableColumn<TradeLicenseRecord>[] = [
    {
      key: 'license_no',
      header: 'লাইসেন্স নং',
      minWidth: '125px',
      stickyLeft: true,
      render: (tl) => <span className="font-mono font-bold text-slate-900">{tl.license_no}</span>,
    },
    {
      key: 'business',
      header: 'প্রতিষ্ঠান',
      minWidth: '160px',
      render: (tl) => <span className="font-bold text-slate-900">{tl.business_name_bn}</span>,
    },
    {
      key: 'owner',
      header: 'মালিকের নাম',
      minWidth: '140px',
      render: (tl) => <span className="text-slate-800">{tl.owner_name_bn}</span>,
    },
    {
      key: 'type',
      header: 'ধরন',
      minWidth: '130px',
      render: (tl) => <span className="text-slate-600">{tl.business_type}</span>,
    },
    {
      key: 'expiry',
      header: 'মেয়াদ',
      align: 'center',
      minWidth: '100px',
      render: (tl) => <span className="font-mono">{tl.expiry_date}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '90px',
      render: (tl) => (
        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">
          {tl.status === 'active' ? 'সক্রিয়' : tl.status}
        </span>
      ),
    },
    ...(canManageTrade
      ? [
          {
            key: 'action',
            header: 'পদক্ষেপ',
            align: 'right' as const,
            minWidth: '115px',
            hideInMobileCard: true,
            render: (tl: TradeLicenseRecord) => (
              <button
                type="button"
                disabled={busyId === tl.id}
                onClick={() => handleRenew(tl)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1 ml-auto"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{busyId === tl.id ? '...' : 'নবায়ন'}</span>
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">ট্রেড লাইসেন্স রেজিস্ট্রি</h2>
          <p className="text-xs text-slate-500">ব্যবসায়িক প্রতিষ্ঠান নিবন্ধন, লাইসেন্স ইস্যু ও নবায়ন</p>
        </div>
        {canManageTrade && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন লাইসেন্স ইস্যু</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <ResponsiveDataTable
          data={tradeLicenses}
          columns={columns}
          rowKey={(tl) => tl.id}
          mobileCardTitle={(tl) => `${tl.business_name_bn} (${tl.license_no})`}
          mobileCardActions={(tl) =>
            canManageTrade ? (
              <button
                type="button"
                onClick={() => handleRenew(tl)}
                className="bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px]"
              >
                ১ বছর নবায়ন করুন
              </button>
            ) : null
          }
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              নতুন ট্রেড লাইসেন্স ইস্যু
            </h3>
            {isCrossUnit && (
              <div>
                <label className="font-bold block mb-1">প্রতিষ্ঠান</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {institutions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name_bn}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="font-bold block mb-1">ব্যবসা প্রতিষ্ঠানের নাম *</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="মেসার্স পদ্মা ট্রেডার্স"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">স্বত্বাধিকারীর নাম *</label>
              <input
                type="text"
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ব্যবসার ধরন</label>
                <input
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">লাইসেন্স ফি (৳)</label>
                <input
                  type="number"
                  min={100}
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">ঠিকানা</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold"
              >
                লাইসেন্স ইস্যু করুন
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const StaffPanel: React.FC<
  SharedPanelProps & {
    staff: StaffMember[];
  }
> = ({ userSession, institutions, isCrossUnit, canFinalApprove, currentUnit, staff, onSuccess, onError, onRefreshAll }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [nameBn, setNameBn] = useState('');
  const [designationBn, setDesignationBn] = useState('');
  const [role, setRole] = useState<UserRole>('secretary');
  const [mobile, setMobile] = useState('01700-000000');
  const [deptBn, setDeptBn] = useState('সাধারণ শাখা');
  const [unitId, setUnitId] = useState(currentUnit.id);

  const handleToggleStatus = async (s: StaffMember) => {
    if (!userSession.token) return;
    try {
      const next = s.status === 'active' ? 'inactive' : 'active';
      await api.updateStaff(userSession.token, s.id, { status: next });
      onSuccess(`${s.name_bn} এর অবস্থা ${next === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'} করা হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'স্ট্যাটাস পরিবর্তন ব্যর্থ।');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.createStaff(userSession.token, {
        administrative_unit_id: isCrossUnit ? unitId : currentUnit.id,
        name_bn: nameBn.trim(),
        designation_bn: designationBn.trim(),
        role,
        mobile: mobile.trim(),
        ward_or_dept_bn: deptBn.trim(),
      });
      setModalOpen(false);
      setNameBn('');
      setDesignationBn('');
      onSuccess('নতুন কর্মকর্তা/কর্মচারী সফলভাবে নিবন্ধিত হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'কর্মকর্তা সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const canManageStaff = Boolean(userSession.permissions?.['employees.manage']);

  const columns: TableColumn<StaffMember>[] = [
    {
      key: 'code',
      header: 'কর্মকর্তা কোড',
      minWidth: '115px',
      stickyLeft: true,
      render: (s) => <span className="font-mono font-bold text-emerald-900">{s.employee_code}</span>,
    },
    {
      key: 'name',
      header: 'নাম',
      minWidth: '150px',
      render: (s) => <span className="font-bold text-slate-900">{s.name_bn}</span>,
    },
    {
      key: 'designation',
      header: 'পদবি',
      minWidth: '140px',
      render: (s) => <span className="text-slate-700">{s.designation_bn}</span>,
    },
    {
      key: 'unit',
      header: 'প্রতিষ্ঠান',
      minWidth: '150px',
      render: (s) => (
        <span className="text-slate-600">
          {institutions.find((u) => u.id === s.administrative_unit_id)?.name_bn || s.administrative_unit_id}
        </span>
      ),
    },
    {
      key: 'ward_dept',
      header: 'শাখা / ওয়ার্ড',
      minWidth: '130px',
      render: (s) => <span className="text-slate-600">{s.ward_or_dept_bn || '—'}</span>,
    },
    {
      key: 'mobile',
      header: 'মোবাইল',
      minWidth: '115px',
      render: (s) => <span className="font-mono text-slate-700">{s.mobile}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '90px',
      render: (s) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            s.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {s.status === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
        </span>
      ),
    },
    ...(canManageStaff
      ? [
          {
            key: 'action',
            header: 'পদক্ষেপ',
            align: 'right' as const,
            minWidth: '115px',
            hideInMobileCard: true,
            render: (s: StaffMember) => (
              <button
                type="button"
                onClick={() => handleToggleStatus(s)}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 font-bold text-[11px] flex items-center gap-1 ml-auto"
              >
                {s.status === 'active' ? (
                  <>
                    <UserX className="w-3 h-3 text-red-600" />
                    <span>নিষ্ক্রিয়</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3 h-3 text-emerald-700" />
                    <span>সক্রিয়</span>
                  </>
                )}
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">কর্মকর্তা ও কর্মচারী ব্যবস্থাপনা</h2>
          <p className="text-xs text-slate-500">প্রতিষ্ঠানভিত্তিক অনুমোদনকারী, সচিব, ওয়ার্ড সদস্য ও হিসাব সহকারীর তালিকা</p>
        </div>
        {canManageStaff && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন কর্মকর্তা যোগ</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <ResponsiveDataTable
          data={staff}
          columns={columns}
          rowKey={(s) => s.id}
          mobileCardTitle={(s) => `${s.name_bn} — ${s.designation_bn}`}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleAddStaff} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              নতুন কর্মকর্তা / কর্মচারী যুক্ত করুন
            </h3>
            {isCrossUnit && (
              <div>
                <label className="font-bold block mb-1">প্রতিষ্ঠান</label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  {institutions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name_bn}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="font-bold block mb-1">পূর্ণ নাম (বাংলা) *</label>
              <input
                type="text"
                required
                value={nameBn}
                onChange={(e) => setNameBn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">পদবি (বাংলা) *</label>
              <input
                type="text"
                required
                value={designationBn}
                onChange={(e) => setDesignationBn(e.target.value)}
                placeholder="যেমন: ওয়ার্ড সদস্য (৫ নং)"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">সিস্টেম রোল</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="chairman">ইউপি চেয়ারম্যান (UP Chairman)</option>
                  <option value="secretary">ইউপি সচিব (UP Secretary)</option>
                  <option value="developer">ডেভেলপার (Developer)</option>
                  <option value="supervisor">সুপারভাইজার (Supervisor)</option>
                </select>
              </div>
              <div>
                <label className="font-bold block mb-1">মোবাইল</label>
                <input
                  type="text"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">শাখা / ওয়ার্ড</label>
              <input
                type="text"
                value={deptBn}
                onChange={(e) => setDeptBn(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold"
              >
                সংরক্ষণ করুন
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const WardsAndNoticesPanel: React.FC<
  SharedPanelProps & {
    mode: 'wards_depts' | 'notices';
    wardsDepts: WardOrDepartment[];
    notices: Notice[];
  }
> = ({
  mode,
  userSession,
  institutions,
  isCrossUnit,
  canFinalApprove,
  currentUnit,
  wardsDepts,
  notices,
  onSuccess,
  onError,
  onRefreshAll,
}) => {
  // Ward/Dept modal
  const [wdModal, setWdModal] = useState(false);
  const [wdKind, setWdKind] = useState<'ward' | 'department'>('ward');
  const [wdCode, setWdCode] = useState('');
  const [wdName, setWdName] = useState('');
  const [wdHead, setWdHead] = useState('');
  const [wdMobile, setWdMobile] = useState('01700-000000');

  // Notice modal
  const [noticeModal, setNoticeModal] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeCat, setNoticeCat] = useState('সাধারণ বিজ্ঞপ্তি');
  const [noticeContent, setNoticeContent] = useState('');

  const handleAddWardDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.createWardOrDepartment(userSession.token, {
        administrative_unit_id: currentUnit.id,
        kind: wdKind,
        code_or_no: wdCode.trim() || 'NEW',
        name_bn: wdName.trim(),
        head_name_bn: wdHead.trim(),
        head_mobile: wdMobile.trim(),
      });
      setWdModal(false);
      setWdCode('');
      setWdName('');
      setWdHead('');
      onSuccess('নতুন ওয়ার্ড/বিভাগ সফলভাবে সংরক্ষিত হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.createNotice(userSession.token, {
        administrative_unit_id: isCrossUnit ? undefined : currentUnit.id,
        title_bn: noticeTitle.trim(),
        category: noticeCat,
        content_bn: noticeContent.trim(),
      });
      setNoticeModal(false);
      setNoticeTitle('');
      setNoticeContent('');
      onSuccess('নতুন নোটিশ সফলভাবে প্রকাশিত হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'নোটিশ প্রকাশ ব্যর্থ হয়েছে।');
    }
  };

  const handleDeleteNotice = async (id: string) => {
    if (!userSession.token) return;
    try {
      await api.deleteNotice(userSession.token, id);
      onSuccess('নোটিশটি তালিকা থেকে অপসারণ করা হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'নোটিশ মোছা যায়নি।');
    }
  };

  if (mode === 'wards_depts') {
    const columns: TableColumn<WardOrDepartment>[] = [
      {
        key: 'code',
        header: 'কোড / নং',
        minWidth: '90px',
        stickyLeft: true,
        render: (w) => <span className="font-mono font-bold text-emerald-900">{w.code_or_no}</span>,
      },
      {
        key: 'kind',
        header: 'ধরন',
        minWidth: '90px',
        render: (w) => (
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              w.kind === 'department' ? 'bg-teal-100 text-teal-800' : 'bg-blue-100 text-blue-800'
            }`}
          >
            {w.kind === 'department' ? 'পৌর বিভাগ' : 'ওয়ার্ড'}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'নাম',
        minWidth: '150px',
        render: (w) => <span className="font-bold text-slate-900">{w.name_bn}</span>,
      },
      {
        key: 'unit',
        header: 'প্রতিষ্ঠান',
        minWidth: '150px',
        render: (w) => (
          <span className="text-slate-600">
            {institutions.find((u) => u.id === w.administrative_unit_id)?.name_bn || w.administrative_unit_id}
          </span>
        ),
      },
      {
        key: 'head',
        header: 'দায়িত্বপ্রাপ্ত প্রধান',
        minWidth: '150px',
        render: (w) => <span className="font-semibold text-slate-800">{w.head_name_bn}</span>,
      },
      {
        key: 'mobile',
        header: 'মোবাইল',
        minWidth: '115px',
        render: (w) => <span className="font-mono text-slate-600">{w.head_mobile}</span>,
      },
      {
        key: 'count',
        header: 'খানা / জনবল',
        align: 'right',
        minWidth: '95px',
        render: (w) => <span className="font-mono font-bold">{w.households_or_staff_count}</span>,
      },
    ];

    return (
      <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">ওয়ার্ড ও বিভাগসমূহ</h2>
            <p className="text-xs text-slate-500">
              ইউনিয়ন পরিষদের ওয়ার্ড (৯টি) এবং পাবনা পৌরসভার ওয়ার্ড (১৫টি) ও বিভাগীয় কাঠামো
            </p>
          </div>
          {Boolean(
            userSession.permissions?.['employees.assign_department'] ||
              userSession.permissions?.['employees.manage']
          ) && (
            <button
              type="button"
              onClick={() => setWdModal(true)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>নতুন ওয়ার্ড/বিভাগ যোগ</span>
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <ResponsiveDataTable
            data={wardsDepts}
            columns={columns}
            rowKey={(w) => w.id}
            mobileCardTitle={(w) => `${w.name_bn} (${w.code_or_no})`}
          />
        </div>

        {wdModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <form onSubmit={handleAddWardDept} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
                নতুন ওয়ার্ড বা বিভাগ যুক্ত করুন
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">ধরন</label>
                  <select
                    value={wdKind}
                    onChange={(e) => setWdKind(e.target.value as 'ward' | 'department')}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
                  >
                    <option value="ward">ওয়ার্ড</option>
                    <option value="department">বিভাগ (পৌরসভা)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold block mb-1">কোড/নং</label>
                  <input
                    type="text"
                    required
                    value={wdCode}
                    onChange={(e) => setWdCode(e.target.value)}
                    placeholder="যেমন: DEPT-TAX"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="font-bold block mb-1">ওয়ার্ড / বিভাগের নাম *</label>
                <input
                  type="text"
                  required
                  value={wdName}
                  onChange={(e) => setWdName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">দায়িত্বপ্রাপ্ত প্রধানের নাম *</label>
                <input
                  type="text"
                  required
                  value={wdHead}
                  onChange={(e) => setWdHead(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">মোবাইল</label>
                <input
                  type="text"
                  value={wdMobile}
                  onChange={(e) => setWdMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWdModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  const canManageNotices = Boolean(userSession.permissions?.['notices.manage']);

  // NOTICES PANEL
  return (
    <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">নোটিশ ও প্রজ্ঞাপন ব্যবস্থাপনা</h2>
          <p className="text-xs text-slate-500">নাগরিক পোর্টালে প্রদর্শিত বিজ্ঞপ্তি প্রকাশ ও হালনাগাদ</p>
        </div>
        {canManageNotices && (
          <button
            type="button"
            onClick={() => setNoticeModal(true)}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন নোটিশ প্রকাশ</span>
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notices.map((n) => (
          <div key={n.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded border border-emerald-200">
                  {n.category}
                </span>
                <span className="font-mono text-slate-500">{n.published_at}</span>
              </div>
              {canManageNotices && (
                <button
                  type="button"
                  onClick={() => handleDeleteNotice(n.id)}
                  className="text-red-600 hover:text-red-800 p-1 rounded"
                  title="মুছুন"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <h4 className="font-bold text-slate-900 text-sm">{n.title_bn}</h4>
            <p className="text-xs text-slate-600 leading-relaxed">{n.content_bn}</p>
          </div>
        ))}
      </div>

      {noticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handlePublishNotice} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-3 text-xs">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-2">
              নতুন সরকারি বিজ্ঞপ্তি প্রকাশ করুন
            </h3>
            <div>
              <label className="font-bold block mb-1">বিজ্ঞপ্তির শিরোনাম *</label>
              <input
                type="text"
                required
                value={noticeTitle}
                onChange={(e) => setNoticeTitle(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">শ্রেণি</label>
              <select
                value={noticeCat}
                onChange={(e) => setNoticeCat(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white"
              >
                <option value="সাধারণ বিজ্ঞপ্তি">সাধারণ বিজ্ঞপ্তি</option>
                <option value="ট্রেড লাইসেন্স">ট্রেড লাইসেন্স</option>
                <option value="হোল্ডিং ট্যাক্স">হোল্ডিং ট্যাক্স</option>
                <option value="নতুন সেবা">নতুন সেবা</option>
              </select>
            </div>
            <div>
              <label className="font-bold block mb-1">বিস্তারিত বিবরণ *</label>
              <textarea
                rows={4}
                required
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNoticeModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold"
              >
                প্রকাশ করুন
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export const ReportsAndSettingsPanel: React.FC<
  SharedPanelProps & {
    mode: 'reports' | 'services_config' | 'settings';
    templates: CertificateTemplate[];
    events: CertificateEvent[];
    verificationLogs: CertificateVerificationLog[];
    inquiries: ContactInquiry[];
    rolePermissions: RolePermissionEntry[];
    systemSettings: SystemSettings | null;
    services: Service[];
  }
> = ({
  mode,
  userSession,
  isCrossUnit,
  canFinalApprove,
  currentUnit,
  templates,
  events,
  verificationLogs,
  inquiries,
  rolePermissions,
  systemSettings,
  services,
  onSuccess,
  onError,
  onRefreshAll,
}) => {
  const [instPhone, setInstPhone] = useState(currentUnit.contact_phone);
  const [instEmail, setInstEmail] = useState(currentUnit.contact_email);
  const [instAddress, setInstAddress] = useState(currentUnit.office_address_bn);
  const [instHead, setInstHead] = useState(currentUnit.chairman_or_mayor_name_bn);
  const [instSec, setInstSec] = useState(currentUnit.secretary_or_ceo_name_bn);

  const [platName, setPlatName] = useState(systemSettings?.platform_name_bn || 'PottoyonBD');
  const [supPhone, setSupPhone] = useState(systemSettings?.support_phone || '01700-000000');
  const [supEmail, setSupEmail] = useState(systemSettings?.support_email || 'info@pottoyonbd.gov.bd');
  const [allowOnline, setAllowOnline] = useState(systemSettings?.allow_online_applications ?? true);
  const [autoSms, setAutoSms] = useState(systemSettings?.auto_sms_notifications ?? true);
  const [maintenanceMode, setMaintenanceMode] = useState(systemSettings?.maintenance_mode ?? false);

  const [smtpHost, setSmtpHost] = useState(systemSettings?.integrations?.smtp_host || 'smtp.pottoyonbd.gov.bd');
  const [smtpPort, setSmtpPort] = useState<number>(systemSettings?.integrations?.smtp_port ?? 587);
  const [smtpFromEmail, setSmtpFromEmail] = useState(
    systemSettings?.integrations?.smtp_from_email || 'noreply@pottoyonbd.gov.bd'
  );
  const [smtpEnabled, setSmtpEnabled] = useState(systemSettings?.integrations?.smtp_enabled ?? false);
  const [smsSenderId, setSmsSenderId] = useState(systemSettings?.integrations?.sms_sender_id || 'POTTOYONBD');
  const [smsEnabled, setSmsEnabled] = useState(systemSettings?.integrations?.sms_enabled ?? true);
  const [gatewayMode, setGatewayMode] = useState<'sandbox' | 'live'>(
    systemSettings?.integrations?.payment_gateway_mode || 'sandbox'
  );
  const [bkashMerchant, setBkashMerchant] = useState(
    systemSettings?.integrations?.bkash_merchant_no || '01700000101'
  );
  const [backupBusy, setBackupBusy] = useState(false);

  useEffect(() => {
    if (!systemSettings) return;
    setPlatName(systemSettings.platform_name_bn);
    setSupPhone(systemSettings.support_phone);
    setSupEmail(systemSettings.support_email);
    setAllowOnline(systemSettings.allow_online_applications);
    setAutoSms(systemSettings.auto_sms_notifications);
    setMaintenanceMode(systemSettings.maintenance_mode ?? false);
    if (systemSettings.integrations) {
      setSmtpHost(systemSettings.integrations.smtp_host);
      setSmtpPort(systemSettings.integrations.smtp_port);
      setSmtpFromEmail(systemSettings.integrations.smtp_from_email);
      setSmtpEnabled(systemSettings.integrations.smtp_enabled);
      setSmsSenderId(systemSettings.integrations.sms_sender_id);
      setSmsEnabled(systemSettings.integrations.sms_enabled);
      setGatewayMode(systemSettings.integrations.payment_gateway_mode);
      setBkashMerchant(systemSettings.integrations.bkash_merchant_no);
    }
  }, [systemSettings]);

  const [editingFee, setEditingFee] = useState<Record<string, number>>({});

  const isSuperAdmin = userSession.role === 'supervisor';
  const canManageInstitution = Boolean(userSession.permissions?.['settings.manage']);
  const canManageGlobalSettings = userSession.permissions?.['settings.manage'] === 'global';
  const canManageRoles = Boolean(userSession.permissions?.['roles.manage']);
  const canManageBackups = Boolean(userSession.permissions?.['backups.manage']);
  const canConfigureServices = Boolean(
    userSession.permissions?.['services.configure_fees'] || userSession.permissions?.['services.manage']
  );

  const handleSaveInstitution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.updateInstitution(userSession.token, currentUnit.id, {
        contact_phone: instPhone,
        contact_email: instEmail,
        office_address_bn: instAddress,
        chairman_or_mayor_name_bn: instHead,
        secretary_or_ceo_name_bn: instSec,
      });
      onSuccess(`${currentUnit.name_bn} এর দাপ্তরিক তথ্য সফলভাবে হালনাগাদ হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'হালনাগাদ ব্যর্থ হয়েছে।');
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userSession.token) return;
    try {
      await api.updateSystemSettings(userSession.token, {
        platform_name_bn: platName,
        support_phone: supPhone,
        support_email: supEmail,
        allow_online_applications: allowOnline,
        auto_sms_notifications: autoSms,
        maintenance_mode: maintenanceMode,
        integrations: {
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort) || 587,
          smtp_user: smtpFromEmail,
          smtp_from_email: smtpFromEmail,
          smtp_enabled: smtpEnabled,
          sms_provider: systemSettings?.integrations?.sms_provider || 'Banglalink/Grameenphone Gov SMS Gateway',
          sms_sender_id: smsSenderId,
          sms_enabled: smsEnabled,
          payment_gateway_mode: gatewayMode,
          bkash_merchant_no: bkashMerchant,
          nagad_merchant_no: systemSettings?.integrations?.nagad_merchant_no || '01700000202',
        },
      });
      onSuccess('প্ল্যাটফর্ম সিস্টেম ও ইন্টিগ্রেশন সেটিংস সফলভাবে সংরক্ষিত হয়েছে।');
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'সেটিংস সংরক্ষণ ব্যর্থ হয়েছে।');
    }
  };

  const handleBackupDownload = async () => {
    if (!userSession.token) return;
    setBackupBusy(true);
    try {
      await triggerAuthenticatedDownload(
        '/api/backups/export',
        `PottoyonBD_Backup_${new Date().toISOString().slice(0, 10)}.json`,
        userSession.token
      );
      onSuccess('সিস্টেম ব্যাকআপ সফলভাবে ডাউনলোড হয়েছে।');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ব্যাকআপ ডাউনলোড ব্যর্থ হয়েছে।');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleTogglePermission = async (
    entry: RolePermissionEntry,
    field: keyof Omit<RolePermissionEntry, 'role' | 'label_bn' | 'scope_bn'>
  ) => {
    if (!userSession.token || !isSuperAdmin) return;
    try {
      await api.updateRolePermission(userSession.token, entry.role, {
        [field]: !entry[field],
      });
      onSuccess(`${entry.label_bn} এর পারমিশন হালনাগাদ করা হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'পারমিশন পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const handleUpdateServiceFee = async (srv: Service) => {
    if (!userSession.token) return;
    const fee = editingFee[srv.id] ?? srv.default_fee;
    try {
      await api.updateService(userSession.token, srv.id, { default_fee: fee });
      onSuccess(`${srv.name_bn} এর সরকারি ফি ৳${fee} নির্ধারিত হয়েছে।`);
      await onRefreshAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'সেবা ফি পরিবর্তন ব্যর্থ হয়েছে।');
    }
  };

  const WORKFLOW_STEP_LABEL_BN: Record<string, string> = {
    operator_intake: 'অপারেটর এন্ট্রি',
    ward_verification: 'ওয়ার্ড সদস্য যাচাই',
    secretary_verification: 'সচিব যাচাই',
    department_verification: 'বিভাগীয় যাচাই',
    executive_review: 'নির্বাহী পর্যালোচনা',
    approver_decision: 'চেয়ারম্যান/মেয়র চূড়ান্ত অনুমোদন',
  };

  if (mode === 'services_config') {
    const srvCols: TableColumn<Service>[] = [
      {
        key: 'name',
        header: 'সেবার নাম',
        minWidth: '190px',
        stickyLeft: true,
        render: (s) => (
          <div>
            <div className="font-bold text-slate-900">{s.name_bn}</div>
            <div className="text-[10px] text-slate-500">{s.name_en}</div>
          </div>
        ),
      },
      {
        key: 'workflow',
        header: 'অনুমোদন ওয়ার্কফ্লো ধাপসমূহ',
        minWidth: '210px',
        render: (s) => (
          <div className="flex flex-wrap gap-1">
            {(s.workflow_steps || ['secretary_verification', 'approver_decision']).map((step) => (
              <span
                key={step}
                className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold text-[10px]"
              >
                {WORKFLOW_STEP_LABEL_BN[step] || step}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: 'days',
        header: 'নিষ্পত্তি সময়',
        minWidth: '100px',
        render: (s) => <span className="font-mono">{s.delivery_time_days} কর্মদিবস</span>,
      },
      {
        key: 'fee',
        header: 'নির্ধারিত ফি (৳)',
        minWidth: '130px',
        render: (s) => (
          <input
            type="number"
            min={0}
            value={editingFee[s.id] ?? s.default_fee}
            onChange={(e) =>
              setEditingFee((prev) => ({ ...prev, [s.id]: Number(e.target.value) }))
            }
            className="w-24 px-2 py-1 border border-slate-300 rounded font-mono text-xs"
          />
        ),
      },
      {
        key: 'authority',
        header: 'অনুমোদনকারী',
        minWidth: '160px',
        render: (s) => <span className="text-slate-600">{s.approval_authority_bn}</span>,
      },
      {
        key: 'save',
        header: 'সংরক্ষণ',
        align: 'right',
        minWidth: '100px',
        render: (s) =>
          canConfigureServices ? (
            <button
              type="button"
              onClick={() => handleUpdateServiceFee(s)}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1 rounded text-[11px]"
            >
              আপডেট
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">শুধুমাত্র দেখুন</span>
          ),
      },
    ];

    return (
      <div className="p-4 sm:p-6 space-y-5 min-w-0 max-w-full">
        <div>
          <h2 className="text-xl font-bold text-slate-900">সেবা, ওয়ার্কফ্লো ও সরকারি ফি কনফিগারেশন ({services.length}টি)</h2>
          <p className="text-xs text-slate-500">কেন্দ্রীয়ভাবে সকল নাগরিক সেবার ফি, ওয়ার্কফ্লো ধাপ ও সেবা প্রদানের সময়সীমা নির্ধারণ</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <ResponsiveDataTable
            data={services}
            columns={srvCols}
            rowKey={(s) => s.id}
            mobileCardTitle={(s) => `${s.name_bn} — ৳${s.default_fee}`}
          />
        </div>
      </div>
    );
  }

  if (mode === 'settings') {
    return (
      <div className="p-4 sm:p-6 space-y-6 min-w-0 max-w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">প্রতিষ্ঠান, রোল পারমিশন ও সিস্টেম সেটিংস</h2>
            <p className="text-xs text-slate-500">দাপ্তরিক যোগাযোগ তথ্য, ভূমিকা ভিত্তিক প্রবেশাধিকার ও নিরাপত্তা নীতিমালা</p>
          </div>
          {canManageBackups && userSession.token && (
            <button
              type="button"
              disabled={backupBusy}
              onClick={handleBackupDownload}
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>{backupBusy ? 'ডাউনলোড হচ্ছে...' : 'সিস্টেম ব্যাকআপ ডাউনলোড (JSON)'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Institution Contact Settings */}
          <form
            onSubmit={handleSaveInstitution}
            className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              {currentUnit.name_bn} — প্রাতিষ্ঠানিক প্রোফাইল
            </h3>
            <div>
              <label className="font-bold block mb-1">প্রধান কর্মকর্তা ({currentUnit.chairman_or_mayor_title_bn})</label>
              <input
                type="text"
                disabled={!canManageInstitution}
                value={instHead}
                onChange={(e) => setInstHead(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="font-bold block mb-1">{currentUnit.secretary_or_ceo_title_bn}</label>
              <input
                type="text"
                disabled={!canManageInstitution}
                value={instSec}
                onChange={(e) => setInstSec(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">ফোন নম্বর</label>
                <input
                  type="text"
                  disabled={!canManageInstitution}
                  value={instPhone}
                  onChange={(e) => setInstPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">ইমেইল</label>
                <input
                  type="email"
                  disabled={!canManageInstitution}
                  value={instEmail}
                  onChange={(e) => setInstEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
                />
              </div>
            </div>
            <div>
              <label className="font-bold block mb-1">কার্যালয়ের ঠিকানা</label>
              <input
                type="text"
                disabled={!canManageInstitution}
                value={instAddress}
                onChange={(e) => setInstAddress(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
              />
            </div>
            {canManageInstitution ? (
              <button
                type="submit"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>প্রতিষ্ঠানের তথ্য সংরক্ষণ</span>
              </button>
            ) : (
              <div className="p-2.5 bg-slate-50 rounded-lg text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>পরিবর্তনের অধিকার কেবল অনুমোদিত প্রশাসকের।</span>
              </div>
            )}
          </form>

          {/* System Settings */}
          <form
            onSubmit={handleSaveSystemSettings}
            className="bg-white p-6 rounded-2xl border border-slate-200 space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              সিস্টেম ও নিরাপত্তা সেটিংস {canManageGlobalSettings ? '' : '(কেবল সুপার অ্যাডমিন সম্পাদনাযোগ্য)'}
            </h3>
            <div>
              <label className="font-bold block mb-1">প্ল্যাটফর্ম নাম</label>
              <input
                type="text"
                disabled={!canManageGlobalSettings}
                value={platName}
                onChange={(e) => setPlatName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold block mb-1">সাপোর্ট হটলাইন</label>
                <input
                  type="text"
                  disabled={!canManageGlobalSettings}
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono disabled:bg-slate-50"
                />
              </div>
              <div>
                <label className="font-bold block mb-1">অফিসিয়াল ইমেইল</label>
                <input
                  type="email"
                  disabled={!canManageGlobalSettings}
                  value={supEmail}
                  onChange={(e) => setSupEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl disabled:bg-slate-50"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 font-semibold text-slate-800 pt-1">
              <input
                type="checkbox"
                disabled={!canManageGlobalSettings}
                checked={allowOnline}
                onChange={(e) => setAllowOnline(e.target.checked)}
              />
              <span>অনলাইন নাগরিক আবেদন গ্রহণ সচল রাখুন</span>
            </label>
            <label className="flex items-center gap-2 font-semibold text-slate-800">
              <input
                type="checkbox"
                disabled={!canManageGlobalSettings}
                checked={autoSms}
                onChange={(e) => setAutoSms(e.target.checked)}
              />
              <span>সনদ অনুমোদন ও ইস্যুতে স্বয়ংক্রিয় SMS নোটিফিকেশন</span>
            </label>
            <label className="flex items-center gap-2 font-semibold text-amber-800">
              <input
                type="checkbox"
                disabled={!canManageGlobalSettings}
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
              />
              <span>রক্ষণাবেক্ষণ মোড (Maintenance Mode)</span>
            </label>

            {/* SMTP, SMS Gateway & Payment Integrations */}
            <div className="pt-3 mt-2 border-t border-slate-100 space-y-2.5">
              <h4 className="font-bold text-slate-800">SMTP, SMS ও পেমেন্ট গেটওয়ে ইন্টিগ্রেশন</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="font-semibold block mb-1 text-slate-600">SMTP হোস্ট</label>
                  <input
                    type="text"
                    disabled={!canManageGlobalSettings}
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-600">SMTP পোর্ট</label>
                  <input
                    type="number"
                    disabled={!canManageGlobalSettings}
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1 text-slate-600">প্রেরক ইমেইল (From)</label>
                  <input
                    type="email"
                    disabled={!canManageGlobalSettings}
                    value={smtpFromEmail}
                    onChange={(e) => setSmtpFromEmail(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-600">SMS সেন্ডার আইডি</label>
                  <input
                    type="text"
                    disabled={!canManageGlobalSettings}
                    value={smsSenderId}
                    onChange={(e) => setSmsSenderId(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold block mb-1 text-slate-600">পেমেন্ট গেটওয়ে মোড</label>
                  <select
                    disabled={!canManageGlobalSettings}
                    value={gatewayMode}
                    onChange={(e) => setGatewayMode(e.target.value === 'live' ? 'live' : 'sandbox')}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                  >
                    <option value="sandbox">Sandbox (পরীক্ষামূলক)</option>
                    <option value="live">Live (প্রোডাকশন)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-600">bKash মার্চেন্ট নম্বর</label>
                  <input
                    type="text"
                    disabled={!canManageGlobalSettings}
                    value={bkashMerchant}
                    onChange={(e) => setBkashMerchant(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    disabled={!canManageGlobalSettings}
                    checked={smtpEnabled}
                    onChange={(e) => setSmtpEnabled(e.target.checked)}
                  />
                  <span>SMTP ইমেইল সক্রিয়</span>
                </label>
                <label className="flex items-center gap-1.5 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    disabled={!canManageGlobalSettings}
                    checked={smsEnabled}
                    onChange={(e) => setSmsEnabled(e.target.checked)}
                  />
                  <span>SMS গেটওয়ে সক্রিয়</span>
                </label>
              </div>
            </div>

            {canManageGlobalSettings && (
              <button
                type="submit"
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>সিস্টেম সেটিংস সংরক্ষণ</span>
              </button>
            )}
          </form>
        </div>

        {/* Role & Permission Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">রোল ও অনুমতি ম্যাট্রিক্স (RBAC Permission Matrix)</h3>
          </div>
          <div className="horizontal-scroll-table">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 min-w-[160px]">ভূমিকা (Role)</th>
                  <th className="py-2.5 px-3 min-w-[130px]">পরিধি</th>
                  <th className="py-2.5 px-3 text-center">যাচাই</th>
                  <th className="py-2.5 px-3 text-center">ফরোয়ার্ড</th>
                  <th className="py-2.5 px-3 text-center">চূড়ান্ত অনুমোদন</th>
                  <th className="py-2.5 px-3 text-center">বাতিল/পুনঃইস্যু</th>
                  <th className="py-2.5 px-3 text-center">রাজস্ব</th>
                  <th className="py-2.5 px-3 text-center">কর্মকর্তা ব্যবস্থাপনা</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rolePermissions.map((rp) => (
                  <tr key={rp.role} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{rp.label_bn}</td>
                    <td className="py-2.5 px-3 text-slate-600">{rp.scope_bn}</td>
                    {(
                      [
                        'can_verify_applications',
                        'can_forward_applications',
                        'can_final_approve',
                        'can_revoke_certificate',
                        'can_manage_revenue',
                        'can_manage_staff',
                      ] as const
                    ).map((field) => (
                      <td key={field} className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          disabled={!canManageRoles && !isSuperAdmin}
                          onClick={() => handleTogglePermission(rp, field)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rp[field]
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {rp[field] ? '✓ অনুমোদিত' : '—'}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // REPORTS & AUDIT MODE
  const eventCols: TableColumn<CertificateEvent>[] = [
    {
      key: 'event_type',
      header: 'ইভেন্ট',
      minWidth: '140px',
      stickyLeft: true,
      render: (ev) => <span className="font-mono font-bold text-emerald-800">{ev.event_type}</span>,
    },
    {
      key: 'actor',
      header: 'কর্মকর্তা ও পদবি',
      minWidth: '180px',
      render: (ev) => (
        <div>
          <span className="font-semibold text-slate-900">{ev.actor_name_bn}</span>{' '}
          <span className="text-slate-400 font-mono text-[10px]">({ev.actor_role})</span>
        </div>
      ),
    },
    {
      key: 'cert',
      header: 'সনদ আইডি',
      minWidth: '140px',
      render: (ev) => <span className="font-mono text-[11px] text-slate-600">{ev.certificate_id}</span>,
    },
    {
      key: 'time',
      header: 'সময়',
      minWidth: '150px',
      render: (ev) => (
        <span className="font-mono text-[11px] text-slate-500">
          {new Date(ev.created_at).toLocaleString('bn-BD')}
        </span>
      ),
    },
  ];

  const scanCols: TableColumn<CertificateVerificationLog>[] = [
    {
      key: 'status',
      header: 'ফলাফল',
      minWidth: '100px',
      render: (vl) => (
        <span
          className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase ${
            vl.result_status === 'valid'
              ? 'bg-emerald-100 text-emerald-800'
              : vl.result_status === 'revoked'
              ? 'bg-red-100 text-red-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {vl.result_status}
        </span>
      ),
    },
    {
      key: 'hash',
      header: 'টোকেন হ্যাশ (Prefix)',
      minWidth: '150px',
      render: (vl) => <span className="font-mono text-slate-700">{vl.token_hash_prefix}...</span>,
    },
    {
      key: 'ip',
      header: 'আইপি ঠিকানা',
      minWidth: '120px',
      render: (vl) => <span className="font-mono text-slate-600">{vl.ip_address}</span>,
    },
    {
      key: 'time',
      header: 'সময়',
      minWidth: '150px',
      render: (vl) => (
        <span className="font-mono text-slate-500">
          {new Date(vl.verified_at).toLocaleString('bn-BD')}
        </span>
      ),
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 min-w-0 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">রিপোর্ট, টেমপ্লেট ও অডিট লগ</h2>
          <p className="text-xs text-slate-500">
            সনদ ইস্যু, বাতিল, পুনঃইস্যু, অনুমোদন ও কিউআর যাচাইকরণের পূর্ণাঙ্গ অডিট ট্রেইল
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRefreshAll()}
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
        >
          <ShieldCheck className="w-4 h-4" />
          <span>অডিট লগ রিফ্রেশ</span>
        </button>
      </div>

      {/* Active Templates */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">সক্রিয় A4 সনদ টেমপ্লেটসমূহ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {templates.map((tpl) => (
            <div key={tpl.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-emerald-800">{tpl.id}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                  {tpl.version}
                </span>
              </div>
              <div className="font-bold text-slate-900">{tpl.name_bn}</div>
              <div className="text-[11px] text-slate-500">
                মেয়াদ: {tpl.default_validity_days ? `${tpl.default_validity_days} দিন` : 'স্থায়ী'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Certificate Events Audit Trail */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">সনদ ও অনুমোদন অডিট লগ ({events.length})</h3>
        </div>
        <ResponsiveDataTable
          data={events.slice(0, 30)}
          columns={eventCols}
          rowKey={(ev) => ev.id}
          mobileCardTitle={(ev) => `${ev.event_type} — ${ev.actor_name_bn}`}
        />
      </div>

      {/* Verification Scan Logs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">QR যাচাইকরণ লগ ({verificationLogs.length})</h3>
        </div>
        <ResponsiveDataTable
          data={verificationLogs.slice(0, 30)}
          columns={scanCols}
          rowKey={(vl) => vl.id}
          mobileCardTitle={(vl) => `${vl.result_status.toUpperCase()} (${vl.ip_address})`}
        />
      </div>

      {/* Contact Inquiries for Upazila / Super Admin */}
      {isCrossUnit && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">নাগরিক যোগাযোগ ও জিজ্ঞাসা ({inquiries.length})</h3>
          {inquiries.length === 0 ? (
            <p className="text-xs text-slate-400">কোনো নাগরিক বার্তা জমা পড়েনি।</p>
          ) : (
            <div className="space-y-2">
              {inquiries.map((inq) => (
                <div key={inq.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span>
                      {inq.name} (<span className="font-mono">{inq.phone}</span>) — {inq.subject}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(inq.created_at).toLocaleString('bn-BD')}
                    </span>
                  </div>
                  <p className="text-slate-600">{inq.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
