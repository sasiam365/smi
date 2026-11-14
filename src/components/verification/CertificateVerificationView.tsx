import React, { useState, useEffect } from 'react';
import {
  Search,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Ban,
  Lock,
} from 'lucide-react';
import type { VerificationResponse } from '../../types';
import { api } from '../../services/api';

interface CertificateVerificationViewProps {
  initialToken?: string;
  onNavigateHome: () => void;
  lang?: 'bn' | 'en';
}

export const CertificateVerificationView: React.FC<CertificateVerificationViewProps> = ({
  initialToken = '',
  onNavigateHome,
}) => {
  const [tokenInput, setTokenInput] = useState(initialToken || '10275626255');
  const [searchedToken, setSearchedToken] = useState(initialToken || '10275626255');
  const [loading, setLoading] = useState(false);
  const [rateLimitedMsg, setRateLimitedMsg] = useState('');
  const [result, setResult] = useState<VerificationResponse | null>(null);

  useEffect(() => {
    const target = (initialToken || '10275626255').trim();
    setTokenInput(target);
    handleSearch(target);
  }, [initialToken]);

  const handleSearch = async (tokenToSearch: string) => {
    const clean = tokenToSearch.trim();
    if (!clean) return;

    setSearchedToken(clean);
    setLoading(true);
    setRateLimitedMsg('');

    try {
      const { statusCode, data } = await api.verifyCertificate(clean);
      if (statusCode === 429) {
        setRateLimitedMsg(
          data.message_bn || 'অতিরিক্ত যাচাই অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।'
        );
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setResult({
        verified: false,
        status: 'invalid',
        message_bn: 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি। পুনরায় চেষ্টা করুন।',
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(tokenInput);
  };

  const formatBnDateTime = (iso?: string | null) => {
    if (!iso) return 'প্রযোজ্য নয় (স্থায়ী)';
    try {
      return new Intl.DateTimeFormat('bn-BD', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-2 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            অনলাইন সনদপত্র যাচাইকরণ পোর্টাল
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto">
            সনদপত্রে থাকা কিউআর কোড স্ক্যান করুন অথবা ভেরিফিকেশন টোকেন প্রদান করে রিয়েল-টাইম সরকারি সত্যতা নিশ্চিত করুন।
          </p>
        </div>

        {/* Search input box */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ভেরিফিকেশন টোকেন অথবা সনদ টোকেন লিখুন..."
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm shadow-xs flex items-center justify-center gap-2"
            >
              <span>{loading ? 'যাচাই হচ্ছে...' : 'যাচাই করুন'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>নমুনা যাচাই টোকেন:</span>
            <button
              type="button"
              onClick={() => {
                setTokenInput('10275626255');
                handleSearch('10275626255');
              }}
              className="font-mono text-emerald-700 hover:underline font-bold"
            >
              10275626255 (গোয়েশপুর ইউপি ওয়ারিশ সনদ)
            </button>
          </div>
        </div>

        {/* Rate Limit Banner */}
        {rateLimitedMsg && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center space-y-2 mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
            <h3 className="text-base font-bold text-amber-950">যাচাই সীমা অতিক্রম করেছে (429)</h3>
            <p className="text-xs text-amber-800">{rateLimitedMsg}</p>
          </div>
        )}

        {/* Verification Result: VALID / REVOKED / EXPIRED */}
        {result && result.status !== 'invalid' && (
          <div
            className={`bg-white rounded-2xl border-2 shadow-lg overflow-hidden animate-fadeIn ${
              result.status === 'valid'
                ? 'border-emerald-500'
                : result.status === 'revoked'
                ? 'border-red-500'
                : 'border-amber-500'
            }`}
          >
            {/* Testing Environment Notice */}
            {typeof window !== 'undefined' &&
              (window.location.hostname.includes('maltimarket.com') ||
                window.location.hostname.includes('run.app') ||
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1') && (
                <div className="bg-amber-100 border-b border-amber-300 px-6 py-2.5 text-xs text-amber-900 font-bold flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — টেস্ট পরিবেশের ডাটা</span>
                </div>
              )}

            {/* Status Banner */}
            <div
              className={`text-white p-5 flex items-center justify-between gap-4 ${
                result.status === 'valid'
                  ? 'bg-emerald-800'
                  : result.status === 'revoked'
                  ? 'bg-red-700'
                  : 'bg-amber-700'
              }`}
            >
              <div className="flex items-center gap-3">
                {result.status === 'valid' && <CheckCircle2 className="w-8 h-8 text-emerald-300 shrink-0" />}
                {result.status === 'revoked' && <Ban className="w-8 h-8 text-red-200 shrink-0" />}
                {result.status === 'expired' && <Clock className="w-8 h-8 text-amber-200 shrink-0" />}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider opacity-85">
                    রিয়েল-টাইম ভেরিফিকেশন স্ট্যাটাস
                  </span>
                  <h3 className="text-lg font-black leading-tight">
                    {result.status === 'valid' && 'সনদটি সম্পূর্ণ বৈধ ও সরকারি ডাটাবেজে সংরক্ষিত'}
                    {result.status === 'revoked' && 'সতর্কতা: এই সনদপত্রটি কর্তৃপক্ষ কর্তৃক বাতিল (REVOKED) করা হয়েছে'}
                    {result.status === 'expired' && 'এই সনদপত্রের মেয়াদ উত্তীর্ণ (EXPIRED) হয়েছে'}
                  </h3>
                </div>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full font-bold uppercase shrink-0 ${
                  result.status === 'valid'
                    ? 'bg-emerald-700 text-emerald-100'
                    : result.status === 'revoked'
                    ? 'bg-red-900 text-red-100'
                    : 'bg-amber-900 text-amber-100'
                }`}
              >
                {result.status.toUpperCase()}
              </span>
            </div>

            {result.status === 'revoked' && (
              <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-xs text-red-800 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>বাতিলের কারণ:</strong> {result.revocation_reason || 'প্রশাসনিক আদেশে বাতিলকৃত'}
                </span>
                {result.revoked_at && (
                  <span className="font-mono">বাতিলের তারিখ: {formatBnDateTime(result.revoked_at)}</span>
                )}
              </div>
            )}

            {/* Limited Publicly Permitted Fields ONLY */}
            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-slate-400 block text-xs">সনদ নম্বর:</span>
                  <span className="font-bold font-mono text-base text-slate-900">
                    {result.certificate_number || result.certificate_no}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">সনদের ধরন:</span>
                  <span className="font-bold text-slate-900">{result.certificate_title_bn}</span>
                  {result.service_name_en && (
                    <span className="text-[11px] text-slate-500 block">{result.service_name_en}</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">ইস্যুকারী প্রতিষ্ঠান:</span>
                  <span className="font-bold text-emerald-800 text-base">
                    {result.issuing_unit_bn || 'স্থানীয় সরকার প্রতিষ্ঠান'}
                  </span>
                  <span className="text-xs text-slate-500 block">
                    {result.upazila_bn}, {result.district_bn}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">ইস্যুর তারিখ ও মেয়াদ:</span>
                  <span className="font-bold text-slate-900 block">{result.issue_date_bn}</span>
                  {result.expires_at ? (
                    <span className="text-xs text-slate-600 block">
                      মেয়াদোত্তীর্ণ: {formatBnDateTime(result.expires_at)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 block">মেয়াদ: স্থায়ী (প্রযোজ্য নয়)</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div>
                  <span className="text-slate-400 block text-xs">মূল আবেদনকারীর নাম:</span>
                  <span className="font-semibold text-slate-800">{result.applicant_name_bn}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs">অনুমোদনকারী কর্মকর্তা:</span>
                  <span className="font-semibold text-slate-800">
                    {result.officer_name_bn} ({result.officer_title_bn})
                  </span>
                </div>
              </div>

              {/* Strict Privacy Protection Notice */}
              <div className="p-3.5 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-200 flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 block mb-0.5">ব্যক্তিগত তথ্য সুরক্ষা নীতি</span>
                  <span>
                    {result.privacy_notice_bn ||
                      'নাগরিকের ব্যক্তিগত গোপনীয়তা সুরক্ষায় পূর্ণ এনআইডি নম্বর, জন্ম তারিখ, ঠিকানা, ওয়ারিশ তালিকা ও সংযুক্ত নথিপত্র পাবলিক যাচাই পেজে অপ্রকাশিত রাখা হয়েছে।'}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-[11px] font-mono text-slate-400">
                  টেমপ্লেট: {result.template_version_id || 'tpl_up_general_v1'}
                </span>
                <button
                  onClick={onNavigateHome}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
                >
                  হোম পেজে ফিরে যান →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Verification Result: INVALID / NOT FOUND */}
        {result && result.status === 'invalid' && (
          <div className="bg-white rounded-2xl border-2 border-red-300 shadow-md p-6 text-center animate-fadeIn space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <span className="inline-block bg-red-100 text-red-800 text-[11px] font-bold px-3 py-0.5 rounded-full">
                INVALID / NOT FOUND
              </span>
              <h3 className="text-lg font-black text-slate-900 pt-1">
                কোনো বৈধ সনদ পাওয়া যায়নি!
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                <code className="font-mono font-bold text-red-600">{searchedToken}</code> টোকেনে কোনো অনুমোদিত সনদ সরকারি ডাটাবেজে বিদ্যমান নেই। কিউআর কোড বা টোকেনটি সঠিক কিনা পরীক্ষা করুন।
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
