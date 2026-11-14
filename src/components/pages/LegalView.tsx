import React from 'react';
import { ShieldCheck, Lock, FileText } from 'lucide-react';

interface LegalViewProps {
  type: 'privacy' | 'terms';
}

export const LegalView: React.FC<LegalViewProps> = ({ type }) => {
  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-white p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              {type === 'privacy' ? <ShieldCheck className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {type === 'privacy' ? 'গোপনীয়তা নীতি (Privacy Policy)' : 'ব্যবহারের শর্তাবলি (Terms & Conditions)'}
              </h1>
              <p className="text-xs text-slate-500">পাবনা সদর উপজেলা ডিজিটাল স্থানীয় সরকার প্ল্যাটফর্ম</p>
            </div>
          </div>

          {type === 'privacy' ? (
            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-4">
              <h3 className="text-base font-bold text-slate-900">১. তথ্যের সংগ্রহ ও ব্যবহার</h3>
              <p>
                PottoyonBD প্ল্যাটফর্মে সেবা গ্রহণের উদ্দেশ্যে নাগরিকের নাম, জাতীয় পরিচয়পত্র (NID), জন্ম নিবন্ধন নম্বর, মোবাইল নম্বর ও ঠিকানা সংগ্রহ করা হয়। এই তথ্যসমূহ শুধুমাত্র স্থানীয় সরকার আইন ও বিধিমালা অনুযায়ী সনদ প্রদান এবং রাজস্ব ব্যবস্থাপনায় ব্যবহার করা হয়।
              </p>

              <h3 className="text-base font-bold text-slate-900">২. তথ্যের সুরক্ষা ও এনক্রিপশন</h3>
              <p>
                সকল নাগরিকের ব্যক্তিগত নথি ও ডেটা সর্বোচ্চ নিরাপত্তা প্রটোকল এবং ২৫৬-বিট এনক্রিপশন দ্বারা সংরক্ষিত। পাবলিক কিউআর কোড ভেরিফিকেশন পেজে কখনোই পূর্ণ এনআইডি বা স্পর্শকাতর ব্যক্তিগত নথি প্রকাশ করা হয় না।
              </p>

              <h3 className="text-base font-bold text-slate-900">৩. পেমেন্ট তথ্যের গোপনীয়তা</h3>
              <p>
                অনলাইন পেমেন্টসমূহ সরাসরি বাংলাদেশ ব্যাংক অনুমোদিত পেমেন্ট গেটওয়ের মাধ্যমে পরিচালিত হয়। প্ল্যাটফর্ম কোনো ব্যবহারকারীর কার্ড পিন বা পাসওয়ার্ড সংরক্ষণ করে না।
              </p>
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-slate-700 leading-relaxed space-y-4">
              <h3 className="text-base font-bold text-slate-900">১. আবেদনের যথার্থতা</h3>
              <p>
                আবেদনকারীকে নিশ্চিত করতে হবে যে দাখিলকৃত সকল তথ্য ও কাগজপত্র সম্পূর্ণ সঠিক ও সত্যায়িত। কোনো অসত্য বা তথ্য গোপন করা হলে আইনানুগ ব্যবস্থা গ্রহণ এবং সনদপত্র তাৎক্ষণিকভাবে বাতিল (Revoked) করা হবে।
              </p>

              <h3 className="text-base font-bold text-slate-900">২. সনদপত্রের বৈধতা ও কিউআর যাচাই</h3>
              <p>
                PottoyonBD পোর্টাল থেকে ইস্যুকৃত প্রতিটি সনদপত্রে একটি অনন্য ভেরিফিকেশন কোড ও কিউআর কোড থাকবে। যে কেউ pottoyonbd.gov.bd/verify লিংকের মাধ্যমে এর সত্যতা যাচাই করতে পারবেন।
              </p>

              <h3 className="text-base font-bold text-slate-900">৩. সরকারি ফি সংক্রান্ত নীতিমালা</h3>
              <p>
                নির্ধারিত সরকারি ফি পরিশোধের পর আবেদন প্রক্রিয়া শুরু হয়। আবেদন গৃহীত হলে কোনো ফি ফেরতযোগ্য নয়।
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
