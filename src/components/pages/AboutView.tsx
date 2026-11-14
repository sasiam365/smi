import React from 'react';
import { ShieldCheck, Building2, Users, CheckCircle2, ArrowRight } from 'lucide-react';
import { BangladeshEmblem } from '../common/BangladeshEmblem';

interface AboutViewProps {
  onApplyClick: () => void;
  lang?: 'bn' | 'en';
}

export const AboutView: React.FC<AboutViewProps> = ({ onApplyClick, lang = 'bn' }) => {
  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-10">
        {/* Banner */}
        <div className="text-center space-y-3">
          <BangladeshEmblem size={64} className="mx-auto" />
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            প্রত্যয়নবিডি (PottoyonBD) পরিচিতি
          </h1>
          <p className="text-base text-slate-600 max-w-2xl mx-auto">
            পাবনা সদর উপজেলার ১০টি ইউনিয়ন পরিষদ ও ১টি পৌরসভার সমন্বিত স্থানীয় সরকার ডিজিটাল নাগরিক সেবা পোর্টাল
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              লক্ষ্য
            </div>
            <h3 className="text-lg font-bold text-slate-900">আমাদের ভিশন ও উদ্দেশ্য</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              বাংলাদেশের প্রতিটি নাগরিকের কাছে স্থানীয় সরকারের সেবা হয়রানিমুক্ত, স্বচ্ছ ও কাগজবিহীনভাবে পৌঁছে দেওয়া। পাবনা সদর উপজেলার সকল ইউনিয়ন পরিষদ ও পৌর এলাকাকে শতভাগ অটোমেশনের আওতায় নিয়ে আসা।
            </p>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
              সুরক্ষা
            </div>
            <h3 className="text-lg font-bold text-slate-900">জালিয়াতি প্রতিরোধ ও কিউআর যাচাই</h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              প্রত্যেকটি ডিজিটাল সনদপত্রে ইউনিক এনক্রিপ্টেড কিউআর কোড সংযুক্ত থাকে যা বিশ্বের যেকোনো প্রান্ত থেকে তাৎক্ষণিকভাবে যাচাই করা যায়। ফলে ভুয়া ওয়ারিশ ও পারিবারিক সনদ তৈরির পথ চিরতরে বন্ধ হয়েছে।
            </p>
          </div>
        </div>

        {/* Administrative Scope */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-3">
            প্রশাসনিক আওতা ও অধিক্ষেত্র
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            পাবনা জেলার প্রাণকেন্দ্রে অবস্থিত পাবনা সদর উপজেলার আওতাধীন নিম্নোক্ত প্রতিষ্ঠানসমূহে এই প্ল্যাটফর্ম কার্যকর:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 text-xs">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 space-y-2">
              <span className="font-bold text-emerald-950 text-sm block">১০টি ইউনিয়ন পরিষদ:</span>
              <ul className="grid grid-cols-2 gap-1 text-slate-700">
                <li>১. মালিগাছা</li>
                <li>২. ভাঁড়ারা</li>
                <li>৩. আতাইকুলা</li>
                <li>৪. মালঞ্চি</li>
                <li>৫. দাপুনিয়া</li>
                <li>৬. গোয়েশপুর</li>
                <li>৭. সাদুল্লাপুর</li>
                <li>৮. চরতারাপুর</li>
                <li>৯. হিমায়েতপুর</li>
                <li>১০. দোগাছী</li>
              </ul>
            </div>

            <div className="p-4 bg-teal-50 rounded-xl border border-teal-100 space-y-2">
              <span className="font-bold text-teal-950 text-sm block">১টি স্বতন্ত্র পৌর প্রশাসন:</span>
              <p className="text-slate-700 leading-relaxed">
                <strong>পাবনা পৌরসভা</strong> (১৮৭৬ সালে প্রতিষ্ঠিত ক-শ্রেণির ঐতিহ্যবাহী পৌরসভা, ১৫টি পূর্ণাঙ্গ পৌর ওয়ার্ড)।
              </p>
              <div className="text-[11px] text-teal-800 font-medium">
                ★ পৌরসভা একটি স্বতন্ত্র প্রশাসনিক সংস্থা হিসেবে পৃথক সেবা ও রাজস্ব কাঠামোয় পরিচালিত।
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bg-emerald-900 text-white rounded-2xl p-8 text-center space-y-4 shadow-lg">
          <h3 className="text-2xl font-black">ঘরে বসেই নাগরিক সেবা নিন</h3>
          <p className="text-xs sm:text-sm text-emerald-200 max-w-md mx-auto">
            ওয়ারিশ সনদ, নাগরিকত্ব সনদ, ট্রেড লাইসেন্স বা হোল্ডিং ট্যাক্স পরিশোধ করতে এখনই অনলাইনে আবেদন করুন।
          </p>
          <button
            onClick={onApplyClick}
            className="bg-white hover:bg-emerald-50 text-emerald-950 font-bold px-8 py-3 rounded-xl transition-all shadow-md text-sm inline-flex items-center gap-2"
          >
            <span>অনলাইন আবেদন করুন</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
