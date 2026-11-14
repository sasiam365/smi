import React, { useState } from 'react';
import { Users, Building2, ChevronRight, ArrowUpRight, X } from 'lucide-react';
import { AdministrativeUnit } from '../../types';

interface InstitutionSelectorProps {
  institutions: AdministrativeUnit[];
  onSelectInstitution: (unitId: string) => void;
  onViewDetails: (unitId: string) => void;
  lang: 'bn' | 'en';
}

export const InstitutionSelector: React.FC<InstitutionSelectorProps> = ({
  institutions,
  onSelectInstitution,
  onViewDetails,
  lang,
}) => {
  const [expandedUnionList, setExpandedUnionList] = useState(false);

  const unions = institutions.filter((i) => i.type === 'union_parishad');
  const muni = institutions.find((i) => i.type === 'municipality');

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
          {lang === 'bn' ? 'প্রতিষ্ঠান নির্বাচন করুন' : 'Select Your Institution'}
        </h2>
        {expandedUnionList && (
          <button
            onClick={() => setExpandedUnionList(false)}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            <span>{lang === 'bn' ? 'বন্ধ করুন' : 'Close'}</span>
          </button>
        )}
      </div>

      {/* Two Institution Cards: Union Parishad & Pabna Municipality (2 cols on tablet/small desktop, 1 col in narrow sidebar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {/* Union Parishad Card */}
        <button
          type="button"
          onClick={() => setExpandedUnionList(!expandedUnionList)}
          className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 group cursor-pointer ${
            expandedUnionList
              ? 'border-[#08783F] bg-emerald-50/50'
              : 'border-slate-200 bg-[#F3F6F4]/60 hover:border-[#08783F] hover:bg-white'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-emerald-100/80 text-[#08783F] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#08783F] transition-colors truncate">
                {lang === 'bn' ? 'ইউনিয়ন পরিষদ' : 'Union Parishad'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {lang === 'bn' ? '(১০টি ইউনিয়ন)' : '(10 Unions)'}
              </p>
            </div>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-slate-400 group-hover:text-[#08783F] transition-transform shrink-0 ${
              expandedUnionList ? 'rotate-90 text-[#08783F]' : ''
            }`}
          />
        </button>

        {/* Pabna Municipality Card (Distinct Autonomous Entity) */}
        {muni && (
          <button
            type="button"
            onClick={() => onViewDetails(muni.id)}
            className="w-full text-left p-3.5 rounded-xl border border-slate-200 bg-[#F3F6F4]/60 hover:border-[#08783F] hover:bg-white transition-all flex items-center justify-between gap-3 group cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-teal-100/80 text-[#064E32] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#08783F] transition-colors truncate">
                  {lang === 'bn' ? 'পৌরসভা' : 'Municipality'}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {lang === 'bn' ? '(পাবনা পৌরসভা)' : '(Pabna Municipality)'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#08783F] transition-colors shrink-0" />
          </button>
        )}
      </div>

      {/* Expandable 10 Union Parishads Quick Picker */}
      {expandedUnionList && (
        <div className="pt-2 border-t border-slate-100 space-y-2 animate-fadeIn">
          <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
            <span>{lang === 'bn' ? 'আপনার ইউনিয়ন নির্বাচন করুন:' : 'Choose your Union Parishad:'}</span>
            <span>১০টি</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
            {unions.map((u, idx) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-[#F3F6F4]/70 hover:bg-emerald-50/70 hover:border-emerald-200 transition-colors text-xs"
              >
                <button
                  onClick={() => onViewDetails(u.id)}
                  className="text-left font-semibold text-slate-800 hover:text-[#08783F] flex-1 truncate"
                >
                  {idx + 1}. {u.name_bn}
                </button>
                <button
                  onClick={() => onSelectInstitution(u.id)}
                  className="text-[11px] font-bold text-[#08783F] hover:underline flex items-center gap-0.5 shrink-0 ml-2"
                >
                  <span>সেবা</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
