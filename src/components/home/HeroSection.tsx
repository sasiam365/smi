import React from 'react';
import { PenLine, Search } from 'lucide-react';

interface HeroSectionProps {
  onApplyClick: () => void;
  onTrackClick: () => void;
  lang: 'bn' | 'en';
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onApplyClick,
  onTrackClick,
  lang,
}) => {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-[#EAF5FB] via-[#F2FBF6] to-[#E1F3E8] shadow-xs">
      {/* Subtle Sky Clouds */}
      <div className="absolute top-6 right-16 w-28 h-8 rounded-full bg-white/60 blur-xs pointer-events-none" />
      <div className="absolute top-12 right-48 w-20 h-6 rounded-full bg-white/50 blur-xs pointer-events-none" />

      {/* Main Content Wrapper */}
      <div className="relative z-10 px-5 sm:px-8 pt-6 sm:pt-8 pb-10 sm:pb-12 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Left: Copy & Primary Actions */}
        <div className="md:col-span-7 space-y-3.5 sm:space-y-4">
          <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-black text-slate-900 leading-[1.2] tracking-tight text-balance">
            {lang === 'bn' ? (
              <>
                আপনার স্থানীয় <br className="hidden sm:inline" />
                সরকারের সেবা{' '}
                <span className="text-[#08783F] block sm:inline">এখন অনলাইনে</span>
              </>
            ) : (
              <>
                Your Local Government Services{' '}
                <span className="text-[#08783F]">Now Online</span>
              </>
            )}
          </h1>

          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed max-w-md font-medium">
            {lang === 'bn'
              ? 'পাবনা সদর উপজেলার ১০টি ইউনিয়ন পরিষদ ও ১টি পৌরসভার বিভিন্ন সেবা ঘরে বসেই গ্রহণ করুন।'
              : 'Access certificates, licenses, and civic services across 10 Union Parishads and Pabna Municipality from home.'}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 pt-1">
            <button
              onClick={onApplyClick}
              className="flex items-center justify-center gap-2 bg-[#08783F] hover:bg-[#064E32] text-white font-bold px-5 py-2.5 sm:py-3 rounded-xl shadow-sm transition-colors text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PenLine className="w-4 h-4" />
              <span>{lang === 'bn' ? 'সেবা নিতে আবেদন করুন' : 'Apply for Service'}</span>
            </button>

            <button
              onClick={onTrackClick}
              className="flex items-center justify-center gap-2 bg-white hover:bg-[#F3F6F4] text-slate-800 border border-slate-300 font-bold px-5 py-2.5 sm:py-3 rounded-xl shadow-2xs transition-colors text-xs sm:text-sm whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4 text-[#08783F]" />
              <span>{lang === 'bn' ? 'আবেদনের অবস্থা দেখুন' : 'Track Application'}</span>
            </button>
          </div>
        </div>

        {/* Right: Union Parishad Building & Bangladesh Flag Illustration */}
        <div className="md:col-span-5 flex justify-center md:justify-end">
          <div className="w-full max-w-[320px] sm:max-w-[350px] relative">
            <svg
              viewBox="0 0 420 260"
              className="w-full h-auto drop-shadow-sm"
              role="img"
              aria-label="ইউনিয়ন পরিষদ ভবন ও বাংলাদেশের জাতীয় পতাকা"
            >
              <defs>
                <linearGradient id="buildingWall" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FDF8ED" />
                  <stop offset="100%" stopColor="#EFE5D0" />
                </linearGradient>
                <linearGradient id="lawnGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#75C259" />
                  <stop offset="100%" stopColor="#489E3D" />
                </linearGradient>
              </defs>

              {/* Soft Background Trees */}
              <circle cx="52" cy="148" r="34" fill="#3B8C3E" />
              <circle cx="80" cy="130" r="30" fill="#4BA54E" />
              <circle cx="360" cy="142" r="38" fill="#3B8C3E" />
              <circle cx="332" cy="126" r="28" fill="#52B055" />

              {/* Flagpole & Waving Bangladesh Flag */}
              <rect x="208" y="30" width="3.5" height="68" fill="#475569" rx="1.5" />
              <circle cx="209.75" cy="28" r="3.5" fill="#D97706" />
              <g transform="translate(211.5, 34)">
                <path
                  d="M0 0 Q18 -5 36 0 T70 0 L70 38 Q52 33 36 38 T0 38 Z"
                  fill="#006A4E"
                />
                <circle cx="31" cy="19" r="11" fill="#F42A41" />
              </g>

              {/* Main Union Parishad Building Structure */}
              <rect x="65" y="110" width="290" height="96" rx="2" fill="url(#buildingWall)" stroke="#D6C8AC" strokeWidth="1.5" />
              {/* Roof Cornice */}
              <rect x="57" y="102" width="306" height="10" rx="2" fill="#E3D4B7" stroke="#C7B697" strokeWidth="1" />

              {/* Elevated Center Signboard Parapet */}
              <rect x="132" y="84" width="156" height="26" rx="3" fill="#FAF4E6" stroke="#C7B697" strokeWidth="1.5" />
              <text
                x="210"
                y="102"
                textAnchor="middle"
                fill="#1E293B"
                fontSize="14.5"
                fontWeight="800"
                fontFamily="Noto Sans Bengali, sans-serif"
              >
                ইউনিয়ন পরিষদ
              </text>

              {/* Portico Pillars */}
              <rect x="148" y="112" width="10" height="94" fill="#FBF7EE" stroke="#D6C8AC" strokeWidth="1" />
              <rect x="262" y="112" width="10" height="94" fill="#FBF7EE" stroke="#D6C8AC" strokeWidth="1" />
              <rect x="178" y="112" width="8" height="94" fill="#FBF7EE" stroke="#D6C8AC" strokeWidth="1" />
              <rect x="234" y="112" width="8" height="94" fill="#FBF7EE" stroke="#D6C8AC" strokeWidth="1" />

              {/* Center Entrance Doorway */}
              <rect x="193" y="142" width="34" height="64" rx="2" fill="#4A2E1B" />
              <rect x="197" y="146" width="12" height="56" fill="#633F26" />
              <rect x="211" y="146" width="12" height="56" fill="#633F26" />

              {/* Left & Right Windows */}
              <rect x="85" y="138" width="24" height="32" rx="1.5" fill="#4B6B7A" stroke="#C7B697" strokeWidth="2" />
              <line x1="97" y1="138" x2="97" y2="170" stroke="#C7B697" strokeWidth="1.5" />
              <line x1="85" y1="154" x2="109" y2="154" stroke="#C7B697" strokeWidth="1.5" />

              <rect x="117" y="138" width="22" height="32" rx="1.5" fill="#4B6B7A" stroke="#C7B697" strokeWidth="2" />
              <line x1="128" y1="138" x2="128" y2="170" stroke="#C7B697" strokeWidth="1.5" />

              <rect x="281" y="138" width="22" height="32" rx="1.5" fill="#4B6B7A" stroke="#C7B697" strokeWidth="2" />
              <line x1="292" y1="138" x2="292" y2="170" stroke="#C7B697" strokeWidth="1.5" />

              <rect x="311" y="138" width="24" height="32" rx="1.5" fill="#4B6B7A" stroke="#C7B697" strokeWidth="2" />
              <line x1="323" y1="138" x2="323" y2="170" stroke="#C7B697" strokeWidth="1.5" />
              <line x1="311" y1="154" x2="335" y2="154" stroke="#C7B697" strokeWidth="1.5" />

              {/* Entrance Steps */}
              <rect x="174" y="206" width="72" height="6" fill="#CBD5E1" />
              <rect x="166" y="212" width="88" height="6" fill="#94A3B8" />

              {/* Lush Green Courtyard & Shrubs */}
              <path d="M12 222 Q210 206 408 222 L408 250 L12 250 Z" fill="url(#lawnGrad)" />
              <circle cx="88" cy="204" r="14" fill="#2D7A31" />
              <circle cx="110" cy="208" r="11" fill="#3B8C3E" />
              <circle cx="310" cy="208" r="11" fill="#3B8C3E" />
              <circle cx="332" cy="204" r="15" fill="#2D7A31" />

              {/* Courtyard Walkway */}
              <polygon points="184,218 236,218 265,250 155,250" fill="#E2E8F0" />
            </svg>
          </div>
        </div>
      </div>

      {/* Bottom Green Wave Decoration matching the reference screenshot */}
      <svg
        viewBox="0 0 1200 72"
        preserveAspectRatio="none"
        className="absolute bottom-0 inset-x-0 w-full h-9 sm:h-12 pointer-events-none"
      >
        <path
          d="M0,44 C300,82 720,4 1200,46 L1200,72 L0,72 Z"
          fill="#08783F"
          fillOpacity="0.16"
        />
        <path
          d="M0,56 C380,22 820,80 1200,32 L1200,72 L0,72 Z"
          fill="#08783F"
          fillOpacity="0.88"
        />
      </svg>
    </section>
  );
};
