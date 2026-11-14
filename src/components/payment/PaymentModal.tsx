import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Lock, ArrowRight, Loader2 } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  serviceTitle: string;
  trackingNo: string;
  onPaymentSuccess: (paymentData: {
    method: 'bkash' | 'nagad' | 'rocket' | 'card';
    transactionId: string;
    amount: number;
  }) => void;
  lang?: 'bn' | 'en';
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  amount,
  serviceTitle,
  trackingNo,
  onPaymentSuccess,
  lang = 'bn',
}) => {
  const [method, setMethod] = useState<'bkash' | 'nagad' | 'rocket' | 'card'>('bkash');
  const [step, setStep] = useState<'details' | 'otp' | 'pin' | 'processing'>('details');
  const [mobileNumber, setMobileNumber] = useState('01712345678');
  const [otp, setOtp] = useState('123456');
  const [pin, setPin] = useState('12345');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleProceedToOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileNumber || mobileNumber.length < 11) {
      setError('সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন');
      return;
    }
    setError('');
    setStep('otp');
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) {
      setError('সঠিক ওটিপি কোড প্রদান করুন');
      return;
    }
    setError('');
    setStep('pin');
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      setError('সঠিক পিন কোড প্রদান করুন');
      return;
    }
    setError('');
    setStep('processing');

    setTimeout(() => {
      const prefix = method === 'bkash' ? 'BKS' : method === 'nagad' ? 'NGD' : 'RKT';
      const randomTrx = `${prefix}${Math.floor(10000000 + Math.random() * 90000000)}`;
      onPaymentSuccess({
        method,
        transactionId: randomTrx,
        amount,
      });
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div
          className={`p-5 text-white flex items-center justify-between ${
            method === 'bkash'
              ? 'bg-[#E2136E]'
              : method === 'nagad'
              ? 'bg-[#F7941D]'
              : method === 'rocket'
              ? 'bg-[#8C3494]'
              : 'bg-slate-900'
          } transition-colors`}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            <div>
              <h3 className="text-base font-bold leading-tight">
                {method.toUpperCase()} পেমেন্ট গেটওয়ে (Sandbox)
              </h3>
              <p className="text-[11px] opacity-90">নিরাপদ সরকারি ফি পরিশোধ পোর্টাল</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Summary */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-500 block">সেবা: {serviceTitle}</span>
            <span className="font-mono text-slate-700 font-semibold">আবেদন নং: {trackingNo}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block">মোট ফি</span>
            <span className="text-lg font-bold text-emerald-800 font-mono">৳{amount}</span>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {step === 'details' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">
                পেমেন্ট মাধ্যম নির্বাচন করুন:
              </label>
              <div className="grid grid-cols-4 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setMethod('bkash')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    method === 'bkash'
                      ? 'border-[#E2136E] bg-pink-50 ring-2 ring-[#E2136E]/30 font-bold text-[#E2136E]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs font-black">bKash</span>
                  <span className="text-[10px]">বিকাশ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('nagad')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    method === 'nagad'
                      ? 'border-[#F7941D] bg-amber-50 ring-2 ring-[#F7941D]/30 font-bold text-[#F7941D]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs font-black">Nagad</span>
                  <span className="text-[10px]">নগদ</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('rocket')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    method === 'rocket'
                      ? 'border-[#8C3494] bg-purple-50 ring-2 ring-[#8C3494]/30 font-bold text-[#8C3494]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs font-black">Rocket</span>
                  <span className="text-[10px]">রকেট</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod('card')}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    method === 'card'
                      ? 'border-slate-900 bg-slate-100 ring-2 ring-slate-900/30 font-bold text-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs font-black">Card</span>
                  <span className="text-[10px]">কার্ড</span>
                </button>
              </div>

              <form onSubmit={handleProceedToOtp} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {method.toUpperCase()} মোবাইল অ্যাকাউন্ট নম্বর
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 font-mono text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    টেস্টিং স্যান্ডবক্স: যেকোনো ১১ ডিজিটের নম্বর ব্যবহারযোগ্য।
                  </p>
                </div>

                {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                  >
                    <span>পরবর্তী ধাপ (OTP গ্রহণ)</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center pb-2">
                <span className="text-xs text-slate-500">
                  আপনার মোবাইল নম্বর <strong className="text-slate-800 font-mono">{mobileNumber}</strong> এ ৬ সংখ্যার ভেরিফিকেশন কোড পাঠানো হয়েছে।
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1 text-center">
                  ৬-ডিজিট OTP কোড লিখুন
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full px-3 py-2.5 text-center text-xl tracking-widest font-mono font-bold rounded-xl border border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  স্যান্ডবক্স ডিফল্ট OTP: <code className="font-mono font-bold text-emerald-800">123456</code>
                </p>
              </div>

              {error && <p className="text-xs text-red-600 text-center font-medium">{error}</p>}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition-colors"
                >
                  পিছনে
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl transition-colors text-sm shadow-sm"
                >
                  OTP যাচাই করুন
                </button>
              </div>
            </form>
          )}

          {step === 'pin' && (
            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div className="text-center pb-1">
                <Lock className="w-8 h-8 text-emerald-700 mx-auto mb-1" />
                <h4 className="text-sm font-bold text-slate-900">গোপন পিন প্রদান করুন</h4>
                <p className="text-xs text-slate-500">আপনার {method.toUpperCase()} অ্যাকাউন্টের পিন দিয়ে লেনদেন সম্পন্ন করুন</p>
              </div>

              <div>
                <input
                  type="password"
                  maxLength={5}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="PIN"
                  className="w-full px-3 py-2.5 text-center text-2xl tracking-widest font-mono font-bold rounded-xl border border-slate-300 text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-400 text-center mt-1">
                  স্যান্ডবক্স ডেমো পিন: <code className="font-mono font-bold text-emerald-800">12345</code>
                </p>
              </div>

              {error && <p className="text-xs text-red-600 text-center font-medium">{error}</p>}

              <button
                type="submit"
                className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 rounded-xl transition-colors text-sm shadow-md"
              >
                ৳{amount} পরিশোধ নিশ্চিত করুন
              </button>
            </form>
          )}

          {step === 'processing' && (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-10 h-10 text-emerald-700 animate-spin mx-auto" />
              <h4 className="text-base font-bold text-slate-900">পেমেন্ট যাচাই প্রক্রিয়াধীন...</h4>
              <p className="text-xs text-slate-500">
                বাংলাদেশ ব্যাংক গেটওয়ে ও সার্ভার রিকনসিলিয়েশন সম্পন্ন হচ্ছে। অনুগ্রহ করে অপেক্ষা করুন।
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-100 text-center text-[10px] text-slate-500 border-t border-slate-200">
          🔒 ২৫৬-বিট SSL সিকিউর্ড স্যান্ডবক্স গেটওয়ে • পেমেন্ট প্রটেকশন ভেরিফাইড
        </div>
      </div>
    </div>
  );
};
