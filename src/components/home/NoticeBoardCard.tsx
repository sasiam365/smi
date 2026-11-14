import React from 'react';
import { Megaphone, FileText, ChevronRight, ArrowRight } from 'lucide-react';
import { Notice } from '../../types';

interface NoticeBoardCardProps {
  notices: Notice[];
  onViewAllNotices: () => void;
  onSelectNotice: () => void;
  lang: 'bn' | 'en';
}

export const NoticeBoardCard: React.FC<NoticeBoardCardProps> = ({
  notices,
  onViewAllNotices,
  onSelectNotice,
  lang,
}) => {
  const latestNotices = notices.slice(0, 3);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-[#08783F] shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {lang === 'bn' ? 'নোটিশ বোর্ড' : 'Notice Board'}
          </h2>
        </div>

        <button
          onClick={onViewAllNotices}
          className="flex items-center gap-1 text-xs font-bold text-[#08783F] hover:text-[#064E32] transition-colors whitespace-nowrap cursor-pointer"
        >
          <span>{lang === 'bn' ? 'সব নোটিশ' : 'View All'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-2.5">
        {latestNotices.map((notice) => (
          <button
            key={notice.id}
            onClick={onSelectNotice}
            className="w-full text-left p-3 rounded-xl border border-slate-100 bg-[#F3F6F4]/60 hover:bg-white hover:border-[#08783F] transition-all flex items-center justify-between gap-3 group cursor-pointer"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#08783F] flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-slate-800 group-hover:text-[#08783F] line-clamp-2 leading-snug">
                  {lang === 'bn' ? notice.title_bn : notice.title_en}
                </h3>
                <span className="text-[11px] text-slate-500 mt-1 block font-medium">
                  {notice.published_at}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#08783F] shrink-0" />
          </button>
        ))}

        {latestNotices.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">
            {lang === 'bn' ? 'বর্তমানে কোনো নতুন নোটিশ নেই' : 'No recent notices available'}
          </p>
        )}
      </div>
    </section>
  );
};
