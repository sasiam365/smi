import React, { useState } from 'react';
import { Building2, Users, MapPin, Phone, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { AdministrativeUnit } from '../../types';

interface InstitutionDirectoryViewProps {
  institutions: AdministrativeUnit[];
  onSelectInstitution: (unitId: string) => void;
  lang?: 'bn' | 'en';
}

export const InstitutionDirectoryView: React.FC<InstitutionDirectoryViewProps> = ({
  institutions,
  onSelectInstitution,
  lang = 'bn',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'unions' | 'municipality'>('all');

  const unions = institutions.filter((i) => i.type === 'union_parishad');
  const muni = institutions.find((i) => i.type === 'municipality');

  const displayedList =
    activeTab === 'unions'
      ? unions
      : activeTab === 'municipality'
      ? muni
        ? [muni]
        : []
      : institutions;

  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            স্থানীয় সরকার প্রতিষ্ঠান ডিরেক্টরি
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            পাবনা সদর উপজেলার ১০টি ইউনিয়ন পরিষদ ও ১টি স্বতন্ত্র পৌরসভার প্রাতিষ্ঠানিক পরিচিতি ও অনলাইন পোর্টাল
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            সকল প্রতিষ্ঠান (১১টি)
          </button>
          <button
            onClick={() => setActiveTab('unions')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'unions'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            ১০টি ইউনিয়ন পরিষদ
          </button>
          <button
            onClick={() => setActiveTab('municipality')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'municipality'
                ? 'bg-emerald-800 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            পাবনা পৌরসভা (স্বতন্ত্র নগর প্রশাসন)
          </button>
        </div>

        {/* Municipality Spotlight when on All or Municipality tab */}
        {(activeTab === 'all' || activeTab === 'municipality') && muni && (
          <div className="mb-8 bg-gradient-to-r from-teal-900 to-emerald-900 text-white rounded-2xl p-6 sm:p-8 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 bg-teal-800/80 px-3 py-1 rounded-full text-xs font-bold text-teal-200">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>স্বতন্ত্র নগর স্থানীয় সরকার প্রশাসন • স্থাপিত: ১৮৭৬</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black">{muni.name_bn}</h2>
                <p className="text-xs sm:text-sm text-teal-100 leading-relaxed">
                  {muni.description_bn}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-teal-200 pt-1">
                  <span>মেয়র: <strong className="text-white">{muni.chairman_or_mayor_name_bn}</strong></span>
                  <span>•</span>
                  <span>সিইও: <strong className="text-white">{muni.secretary_or_ceo_name_bn}</strong></span>
                  <span>•</span>
                  <span>ওয়ার্ড সংখ্যা: <strong className="text-white">১৫টি ওয়ার্ড</strong></span>
                </div>
              </div>

              <div className="shrink-0">
                <button
                  onClick={() => onSelectInstitution(muni.id)}
                  className="bg-white hover:bg-teal-50 text-teal-900 font-bold px-6 py-3 rounded-xl transition-all shadow-md text-sm flex items-center gap-2"
                >
                  <span>পৌরসভা পোর্টালে প্রবেশ করুন</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Union Parishad Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedList
            .filter((i) => i.type === 'union_parishad')
            .map((unit, index) => (
              <div
                key={unit.id}
                className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="font-mono font-bold">ইউপি #{(index + 1).toString().padStart(2, '0')}</span>
                    <span className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded">
                      ৯টি ওয়ার্ড
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {unit.name_bn}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mb-3">{unit.name_en}</p>

                  <p className="text-xs text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                    {unit.description_bn}
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24">চেয়ারম্যান/প্রশাসক:</span>
                      <span className="font-semibold text-slate-800">{unit.chairman_or_mayor_name_bn}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24">ইউপি সচিব:</span>
                      <span className="font-semibold text-slate-800">{unit.secretary_or_ceo_name_bn}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{unit.contact_phone}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">অনলাইন সেবা সক্রিয়</span>
                  <button
                    onClick={() => onSelectInstitution(unit.id)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <span>পোর্টাল দেখুন</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
