import React from 'react';
import { User, Store, Coins, LayoutGrid, Zap } from 'lucide-react';

interface QuickActionBannerProps {
  onNavigateServices: (category?: string) => void;
  onApplyHoldingTax: () => void;
  lang: 'bn' | 'en';
}

export const QuickActionBanner: React.FC<QuickActionBannerProps> = ({
  onNavigateServices,
  onApplyHoldingTax,
  lang,
}) => {
  const quickCards = [
    {
      id: 'citizen',
      title_bn: 'নাগরিক সেবা',
      title_en: 'Citizen Services',
      subtitle_bn: 'ব্যক্তিগত সনদ ও প্রত্যয়ন',
      subtitle_en: 'Personal & civic certificates',
      icon: User,
      iconBg: 'bg-emerald-50 text-[#08783F]',
      cardTint: 'hover:border-[#08783F]',
      action: () => onNavigateServices('citizen_personal'),
    },
    {
      id: 'business',
      title_bn: 'ব্যবসায়িক সেবা',
      title_en: 'Business Services',
      subtitle_bn: 'ট্রেড লাইসেন্স ও প্রতিষ্ঠান',
      subtitle_en: 'Trade & commercial licenses',
      icon: Store,
      iconBg: 'bg-amber-50 text-amber-600',
      cardTint: 'hover:border-amber-500',
      action: () => onNavigateServices('licensing'),
    },
    {
      id: 'tax',
      title_bn: 'কর ও রাজস্ব',
      title_en: 'Tax & Revenue',
      subtitle_bn: 'হোল্ডিং ট্যাক্স পরিশোধ',
      subtitle_en: 'Holding tax & assessments',
      icon: Coins,
      iconBg: 'bg-sky-50 text-sky-600',
      cardTint: 'hover:border-sky-500',
      action: () => onApplyHoldingTax(),
    },
    {
      id: 'all',
      title_bn: 'সকল সেবা',
      title_en: 'All Services',
      subtitle_bn: '৪৭টি সেবা একস্থানে',
      subtitle_en: 'All 47 services in one place',
      icon: LayoutGrid,
      iconBg: 'bg-purple-50 text-purple-600',
      cardTint: 'hover:border-purple-500',
      action: () => onNavigateServices('all'),
    },
  ];

  return (
    <section className="space-y-3.5">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[#08783F] fill-[#08783F]" />
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          {lang === 'bn' ? 'দ্রুত প্রবেশ' : 'Quick Access'}
        </h2>
      </div>

      {/* 2x2 on mobile, 4 columns on desktop matching both reference screenshots */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {quickCards.map((card) => {
          const IconComponent = card.icon;
          return (
            <button
              key={card.id}
              onClick={card.action}
              className={`bg-white rounded-xl border border-slate-200/90 p-3.5 sm:p-4 shadow-2xs hover:shadow-md transition-all flex items-center gap-3 text-left group cursor-pointer ${card.cardTint}`}
            >
              <div
                className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${card.iconBg}`}
              >
                <IconComponent className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#08783F] transition-colors truncate">
                  {lang === 'bn' ? card.title_bn : card.title_en}
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                  {lang === 'bn' ? card.subtitle_bn : card.subtitle_en}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
