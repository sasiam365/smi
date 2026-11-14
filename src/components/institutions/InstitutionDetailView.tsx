import React, { useEffect, useState } from 'react';
import {
  MapPin,
  Phone,
  ArrowRight,
  FileText,
  Home,
  Store,
  Bell,
  ArrowLeft,
} from 'lucide-react';
import { AdministrativeUnit, Service, HoldingTaxRecord, TradeLicenseRecord, Notice } from '../../types';
import { storage } from '../../services/storage';
import { api } from '../../services/api';
import { ResponsiveDataTable, TableColumn } from '../common/ResponsiveDataTable';

interface InstitutionDetailViewProps {
  institution: AdministrativeUnit;
  services: Service[];
  onApplyService: (serviceId: string, unitId: string) => void;
  onBack: () => void;
  lang?: 'bn' | 'en';
}

export const InstitutionDetailView: React.FC<InstitutionDetailViewProps> = ({
  institution,
  services,
  onApplyService,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<'services' | 'holding_tax' | 'trade_license' | 'notices'>('services');

  const [holdingTaxes, setHoldingTaxes] = useState<HoldingTaxRecord[]>(() =>
    storage.getHoldingTaxes(institution.id)
  );
  const [tradeLicenses, setTradeLicenses] = useState<TradeLicenseRecord[]>(() =>
    storage.getTradeLicenses(institution.id)
  );
  const [notices, setNotices] = useState<Notice[]>(() => storage.getNotices(institution.id));

  useEffect(() => {
    api.listHoldingTaxes(institution.id).then(setHoldingTaxes).catch(() => {});
    api.listTradeLicenses(institution.id).then(setTradeLicenses).catch(() => {});
    api.listNotices(institution.id).then(setNotices).catch(() => {});
  }, [institution.id]);

  const isMuni = institution.type === 'municipality';

  const holdingColumns: TableColumn<HoldingTaxRecord>[] = [
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
      header: 'মালিকের নাম',
      minWidth: '150px',
      render: (ht) => <span className="font-semibold text-slate-800">{ht.owner_name_bn}</span>,
    },
    {
      key: 'structure',
      header: 'স্থাপনার ধরন',
      minWidth: '130px',
      render: (ht) => <span className="text-slate-600">{ht.structure_type}</span>,
    },
    {
      key: 'annual_tax',
      header: 'বাৎসরিক কর',
      align: 'right',
      minWidth: '100px',
      render: (ht) => <span className="font-mono font-semibold text-slate-900">৳{ht.annual_tax}</span>,
    },
    {
      key: 'current_due',
      header: 'বর্তমান বকেয়া',
      align: 'right',
      minWidth: '110px',
      render: (ht) => <span className="font-mono font-bold text-amber-700">৳{ht.current_due}</span>,
    },
    {
      key: 'status',
      header: 'অবস্থা',
      align: 'center',
      minWidth: '100px',
      render: (ht) => (
        <span
          className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
            ht.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {ht.status === 'paid' ? 'পরিশোধিত' : 'বকেয়া আছে'}
        </span>
      ),
    },
  ];

  const licenseColumns: TableColumn<TradeLicenseRecord>[] = [
    {
      key: 'license_no',
      header: 'লাইসেন্স নং',
      minWidth: '120px',
      stickyLeft: true,
      render: (tl) => <span className="font-mono font-bold text-slate-900">{tl.license_no}</span>,
    },
    {
      key: 'business',
      header: 'প্রতিষ্ঠানের নাম',
      minWidth: '160px',
      render: (tl) => <span className="font-bold text-slate-900">{tl.business_name_bn}</span>,
    },
    {
      key: 'owner',
      header: 'স্বত্বাধিকারী',
      minWidth: '130px',
      render: (tl) => <span className="text-slate-800">{tl.owner_name_bn}</span>,
    },
    {
      key: 'type',
      header: 'ব্যবসার ধরন',
      minWidth: '130px',
      render: (tl) => <span className="text-slate-600">{tl.business_type}</span>,
    },
    {
      key: 'address',
      header: 'ঠিকানা',
      minWidth: '150px',
      render: (tl) => <span className="text-slate-500">{tl.address_bn}</span>,
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
      minWidth: '100px',
      render: (tl) => (
        <span
          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
            tl.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {tl.status === 'active' ? 'সক্রিয়' : tl.status}
        </span>
      ),
    },
  ];

  return (
    <div className="py-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg mb-6 transition-colors shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>সকল প্রতিষ্ঠানের তালিকায় ফিরে যান</span>
        </button>

        {/* Institution Banner Card */}
        <div
          className={`rounded-2xl p-6 sm:p-8 text-white shadow-md mb-8 ${
            isMuni
              ? 'bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900'
              : 'bg-gradient-to-r from-emerald-900 via-emerald-800 to-slate-900'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-xs">
                  {isMuni ? 'স্বতন্ত্র নগর স্থানীয় সরকার' : 'ইউনিয়ন পরিষদ'}
                </span>
                <span className="text-xs text-white/80 font-mono">
                  স্থাপিত: {institution.established_year}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
                {institution.name_bn}
              </h1>
              <p className="text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
                {institution.description_bn}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-white/90 pt-2">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>{institution.office_address_bn}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>{institution.contact_phone}</span>
                </span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-xs p-4 rounded-xl border border-white/20 space-y-2 text-xs shrink-0 min-w-64">
              <div>
                <span className="text-white/60 block text-[11px]">{institution.chairman_or_mayor_title_bn}:</span>
                <span className="font-bold text-base">{institution.chairman_or_mayor_name_bn}</span>
              </div>
              <div>
                <span className="text-white/60 block text-[11px]">{institution.secretary_or_ceo_title_bn}:</span>
                <span className="font-semibold">{institution.secretary_or_ceo_name_bn}</span>
              </div>
              <div className="pt-1 border-t border-white/10 flex justify-between">
                <span className="text-white/70">ওয়ার্ড সংখ্যা:</span>
                <span className="font-bold">{institution.wards_count}টি ওয়ার্ড</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-6 pb-2 text-xs sm:text-sm font-bold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('services')}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'services' ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>নাগরিক সেবাসমূহ ({services.length}টি)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('holding_tax')}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'holding_tax' ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>হোল্ডিং ট্যাক্স রেজিস্টার</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trade_license')}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'trade_license' ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>ট্রেড লাইসেন্স ব্যবস্থাপনা</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notices')}
            className={`px-4 py-2.5 rounded-xl transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'notices' ? 'bg-emerald-800 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>স্থানীয় নোটিশ বোর্ড</span>
          </button>
        </div>

        {/* Tab 1: Services */}
        {activeTab === 'services' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {institution.name_bn} হতে উপলব্ধ নাগরিক সেবাসমূহ
              </h3>
              <span className="text-xs text-slate-500">অনলাইনে আবেদন ও সনদ সংগ্রহ করুন</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {services.map((srv) => (
                <div
                  key={srv.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                        ফি: ৳{srv.default_fee}
                      </span>
                      <span>{srv.delivery_time_days} কর্মদিবস</span>
                    </div>
                    <h4 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                      {srv.name_bn}
                    </h4>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-1.5 leading-relaxed">
                      {srv.description_bn}
                    </p>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      অনুমোদন: {srv.approval_authority_bn.split('/')[0]}
                    </span>
                    <button
                      type="button"
                      onClick={() => onApplyService(srv.id, institution.id)}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <span>আবেদন করুন</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Holding Tax */}
        {activeTab === 'holding_tax' && (
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {institution.name_bn} - হোল্ডিং ট্যাক্স অ্যাসেসমেন্ট তালিকা
                </h3>
                <p className="text-xs text-slate-500">
                  ওয়ার্ডভিত্তিক বাড়ি ও বাণিজ্যিক স্থাপনার কর নিরূপণ ও পরিশোধ তথ্য
                </p>
              </div>
              <button
                type="button"
                onClick={() => onApplyService('srv_holding_tax', institution.id)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
              >
                নতুন হোল্ডিং ট্যাক্স পরিশোধ
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <ResponsiveDataTable
                data={holdingTaxes}
                columns={holdingColumns}
                rowKey={(ht) => ht.id}
                mobileCardTitle={(ht) => `হোল্ডিং #${ht.holding_no} — ${ht.owner_name_bn}`}
                mobileCardBadge={(ht) => (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                    {ht.status === 'paid' ? 'পরিশোধিত' : `বকেয়া ৳${ht.current_due}`}
                  </span>
                )}
              />
            </div>
          </div>
        )}

        {/* Tab 3: Trade License */}
        {activeTab === 'trade_license' && (
          <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {institution.name_bn} - ট্রেড লাইসেন্স রেজিস্ট্রি
                </h3>
                <p className="text-xs text-slate-500">অনুমোদিত ব্যবসায়ী ও প্রতিষ্ঠানের তালিকা</p>
              </div>
              <button
                type="button"
                onClick={() => onApplyService('srv_trade_license', institution.id)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
              >
                নতুন ট্রেড লাইসেন্স আবেদন
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <ResponsiveDataTable
                data={tradeLicenses}
                columns={licenseColumns}
                rowKey={(tl) => tl.id}
                mobileCardTitle={(tl) => `${tl.business_name_bn} (${tl.license_no})`}
              />
            </div>
          </div>
        )}

        {/* Tab 4: Notices */}
        {activeTab === 'notices' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-slate-900">স্থানীয় প্রজ্ঞাপন ও নোটিশ</h3>
            <div className="space-y-3">
              {notices.map((notice) => (
                <div key={notice.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded">
                      {notice.category}
                    </span>
                    <span className="font-mono">{notice.published_at}</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">{notice.title_bn}</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">{notice.content_bn}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
