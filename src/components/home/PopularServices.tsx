import React from 'react';
import {
  Home,
  Users,
  GitFork,
  FileBadge,
  IdCard,
  ShieldCheck,
  Store,
  Handshake,
  Zap,
  Cross,
  UserCheck,
  Briefcase,
  Layers,
  ArrowRight
} from 'lucide-react';

interface PopularServicesProps {
  onSelectService: (serviceId: string) => void;
  onViewAllServices: () => void;
  lang: 'bn' | 'en';
}

export const PopularServices: React.FC<PopularServicesProps> = ({
  onSelectService,
  onViewAllServices,
  lang,
}) => {
  const POPULAR_ITEMS = [
    {
      id: 'srv_holding_tax',
      title_bn: 'হোল্ডিং ট্যাক্স',
      title_en: 'Holding Tax',
      icon: Home,
      iconBg: 'bg-emerald-50 text-[#08783F]',
    },
    {
      id: 'srv_family',
      title_bn: 'পারিবারিক সনদ',
      title_en: 'Family Certificate',
      icon: Users,
      iconBg: 'bg-sky-50 text-sky-600',
    },
    {
      id: 'srv_warish',
      title_bn: 'ওয়ারিশ সনদ',
      title_en: 'Warish Certificate',
      icon: GitFork,
      iconBg: 'bg-purple-50 text-purple-600',
    },
    {
      id: 'srv_inheritance',
      title_bn: 'উত্তরাধিকার সনদ',
      title_en: 'Inheritance Certificate',
      icon: FileBadge,
      iconBg: 'bg-amber-50 text-amber-600',
    },
    {
      id: 'srv_citizenship',
      title_bn: 'নাগরিকত্ব সনদ',
      title_en: 'Citizenship Certificate',
      icon: IdCard,
      iconBg: 'bg-blue-50 text-blue-600',
    },
    {
      id: 'srv_character',
      title_bn: 'চারিত্রিক সনদ',
      title_en: 'Character Certificate',
      icon: ShieldCheck,
      iconBg: 'bg-emerald-50 text-[#08783F]',
    },
    {
      id: 'srv_trade_license',
      title_bn: 'ট্রেড লাইসেন্স',
      title_en: 'Trade License',
      icon: Store,
      iconBg: 'bg-rose-50 text-rose-600',
    },
    {
      id: 'srv_power_of_attorney',
      title_bn: 'ক্ষমতা অর্পণ প্রত্যয়ন',
      title_en: 'Power Delegation',
      icon: Handshake,
      iconBg: 'bg-green-50 text-green-700',
    },
    {
      id: 'srv_electricity_noc',
      title_bn: 'নতুন বিদ্যুৎ সংযোগ',
      title_en: 'Electricity Connection',
      icon: Zap,
      iconBg: 'bg-amber-50 text-amber-500',
    },
    {
      id: 'srv_death',
      title_bn: 'মৃত্যু প্রত্যয়ন',
      title_en: 'Death Certificate',
      icon: Cross,
      iconBg: 'bg-violet-50 text-violet-600',
    },
    {
      id: 'srv_unemployment',
      title_bn: 'বেকারত্ব সনদ',
      title_en: 'Unemployment Certificate',
      icon: UserCheck,
      iconBg: 'bg-teal-50 text-teal-700',
    },
    {
      id: 'srv_professional',
      title_bn: 'পেশাগত সনদ',
      title_en: 'Professional Certificate',
      icon: Briefcase,
      iconBg: 'bg-orange-50 text-orange-700',
    },
  ];

  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#08783F] shrink-0" />
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {lang === 'bn' ? 'জনপ্রিয় সেবাসমূহ' : 'Popular Services'}
          </h2>
        </div>

        <button
          onClick={onViewAllServices}
          className="flex items-center gap-1 text-xs sm:text-sm font-bold text-[#08783F] hover:text-[#064E32] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>{lang === 'bn' ? 'সকল সেবা দেখুন' : 'See All Services'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3-col on mobile, 4-col on desktop matching both reference screenshots */}
      <div className="grid grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {POPULAR_ITEMS.map((item) => {
          const IconComponent = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onSelectService(item.id)}
              className="bg-white rounded-xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs hover:border-[#08783F] hover:shadow-md transition-all flex flex-col items-center justify-center text-center gap-2.5 min-h-[102px] sm:min-h-[112px] group cursor-pointer"
            >
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${item.iconBg}`}
              >
                <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <span className="text-[11px] sm:text-xs font-bold text-slate-800 group-hover:text-[#08783F] leading-snug line-clamp-2">
                {lang === 'bn' ? item.title_bn : item.title_en}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
