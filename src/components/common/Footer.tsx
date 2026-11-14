import React from 'react';
import { MapPin, Phone, Mail, Globe, Play, Share2 } from 'lucide-react';
import { BangladeshEmblem } from './BangladeshEmblem';

interface FooterProps {
  onNavigate: (view: string, param?: string) => void;
  lang: 'bn' | 'en';
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, lang }) => {
  return (
    <footer className="no-print bg-[#064E32] text-emerald-50 border-t-4 border-[#08783F] select-none pb-16 lg:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8">
          {/* Brand Column */}
          <div className="lg:col-span-3 space-y-3 lg:border-r lg:border-emerald-800/70 lg:pr-6">
            <div className="flex items-center gap-3">
              <BangladeshEmblem size={46} />
              <div>
                <h3 className="text-xl font-black text-white tracking-tight leading-none">
                  Pottoyon<span className="text-red-400">BD</span>
                </h3>
                <p className="text-xs text-emerald-200 font-semibold mt-1">
                  {lang === 'bn' ? 'স্থানীয় সরকার ডিজিটাল সেবা' : 'Digital Local Government Services'}
                </p>
              </div>
            </div>
            <p className="text-xs text-emerald-100/80 leading-relaxed">
              পাবনা সদর উপজেলার ১০টি ইউনিয়ন পরিষদ ও পাবনা পৌরসভার সমন্বিত নাগরিক সেবা ও ডিজিটাল সনদ প্ল্যাটফর্ম।
            </p>
          </div>

          {/* Important Links */}
          <div className="lg:col-span-2">
            <h4 className="text-sm font-bold text-white mb-3">
              {lang === 'bn' ? 'গুরুত্বপূর্ণ লিংক' : 'Important Links'}
            </h4>
            <ul className="space-y-2 text-xs text-emerald-100/90">
              <li>
                <button
                  onClick={() => onNavigate('services')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'সেবাসমূহ' : 'Services'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('tracking')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'আবেদন নির্দেশিকা' : 'Application Tracking'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('verify')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'সনদ যাচাইকরণ' : 'Verify Certificate'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('notices')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'নোটিশ বোর্ড' : 'Notice Board'}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Institutions Directory */}
          <div className="lg:col-span-3">
            <h4 className="text-sm font-bold text-white mb-3">
              {lang === 'bn' ? 'প্রতিষ্ঠানসমূহ' : 'Institutions'}
            </h4>
            <ul className="space-y-2 text-xs text-emerald-100/90">
              <li>
                <button
                  onClick={() => onNavigate('union_directory')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'ইউনিয়ন পরিষদ (১০টি)' : 'Union Parishads (10)'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('institution_detail', 'unit_pabna_muni')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'পৌরসভা (পাবনা পৌরসভা)' : 'Pabna Municipality'}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <span>▸</span>
                  <span>{lang === 'bn' ? 'উপজেলা প্রশাসন ও পরিচিতি' : 'Upazila Administration'}</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Contact Information */}
          <div className="lg:col-span-2">
            <h4 className="text-sm font-bold text-white mb-3">
              {lang === 'bn' ? 'যোগাযোগ' : 'Contact'}
            </h4>
            <div className="space-y-2.5 text-xs text-emerald-100/90">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-emerald-300 shrink-0 mt-0.5" />
                <span>পাবনা সদর উপজেলা, পাবনা</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="font-mono">০১৭০০-০০০০০০</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span className="break-all">info@pottoyonbd.gov.bd</span>
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="lg:col-span-2">
            <h4 className="text-sm font-bold text-white mb-3">
              {lang === 'bn' ? 'আমাদের সাথে যুক্ত থাকুন' : 'Connect With Us'}
            </h4>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => onNavigate('contact')}
                aria-label="Official Portal"
                className="w-9 h-9 rounded-full bg-white text-[#064E32] hover:bg-emerald-100 flex items-center justify-center transition-colors shadow-xs"
              >
                <Globe className="w-4 h-4" />
              </button>
              <button
                onClick={() => onNavigate('notices')}
                aria-label="Public Announcements"
                className="w-9 h-9 rounded-full bg-white text-[#064E32] hover:bg-emerald-100 flex items-center justify-center transition-colors shadow-xs"
              >
                <Play className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => onNavigate('contact')}
                aria-label="Share Portal"
                className="w-9 h-9 rounded-full bg-white text-[#064E32] hover:bg-emerald-100 flex items-center justify-center transition-colors shadow-xs"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Legal Strip */}
      <div className="bg-[#043924] border-t border-emerald-800/60 py-3.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs text-emerald-200/90 text-center">
          <span>© ২০২৬ PottoyonBD. সর্বস্বত্ব সংরক্ষিত।</span>
          <span className="hidden sm:inline text-emerald-600">|</span>
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('privacy')} className="hover:text-white transition-colors">
              গোপনীয়তা নীতি
            </button>
            <span className="text-emerald-600">|</span>
            <button onClick={() => onNavigate('terms')} className="hover:text-white transition-colors">
              ব্যবহারের শর্তাবলি
            </button>
            <span className="text-emerald-600">|</span>
            <button onClick={() => onNavigate('admin_login')} className="hover:text-white font-semibold transition-colors">
              প্রশাসনিক লগইন
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
