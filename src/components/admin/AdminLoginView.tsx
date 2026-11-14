import React, { useState } from 'react';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  X,
  ShieldCheck,
  Check,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  UserPlus,
  ArrowLeft,
} from 'lucide-react';
import { AdministrativeUnit, UserSession } from '../../types';
import { api } from '../../services/api';

export type LoginRealm = 'citizen' | 'administrative';

interface AdminLoginViewProps {
  institutions: AdministrativeUnit[];
  initialLoginType?: LoginRealm;
  onLoginSuccess: (
    session: UserSession,
    meta?: { rememberToken?: string; redirectDashboard?: string }
  ) => void;
  onCancel: () => void;
  lang?: 'bn' | 'en';
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  initialLoginType = 'citizen',
  onLoginSuccess,
  onCancel,
}) => {
  const [loginType, setLoginType] = useState<LoginRealm>(initialLoginType);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [twoFactorOtp, setTwoFactorOtp] = useState('123456');
  const [require2FA, setRequire2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mode: 'login' | 'register' | 'reset'
  const [viewMode, setViewMode] = useState<'login' | 'register' | 'reset'>('login');

  // Citizen Registration state
  const [regNameBn, setRegNameBn] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState('');

  // Password Reset state
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const handleSelectLoginType = (nextType: LoginRealm) => {
    setLoginType(nextType);
    setError('');
    setRequire2FA(false);
    if (viewMode === 'register' && nextType === 'administrative') {
      setViewMode('login');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setError('অনুগ্রহ করে ইউজার আইডি ও পাসওয়ার্ড প্রদান করুন।');
      return;
    }

    setLoading(true);
    try {
      const result = await api.login({
        login_type: loginType,
        username: trimmedUser,
        password,
        otp: require2FA ? twoFactorOtp.trim() : undefined,
        remember_me: rememberMe,
      });
      onLoginSuccess(result.session, {
        rememberToken: result.remember_token,
        redirectDashboard: result.redirect_dashboard,
      });
    } catch (err: unknown) {
      const errObj = err as Error & { data?: { mfa_required?: boolean; message_bn?: string } };
      if (errObj?.data?.mfa_required) {
        setRequire2FA(true);
        setError('দ্বিমুখী প্রমাণীকরণ (2FA OTP) কোড প্রদান করুন।');
      } else {
        setError(err instanceof Error ? err.message : 'লগইন ব্যর্থ হয়েছে।');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCitizenRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    if (!regNameBn.trim() || !regUsername.trim() || !regMobile.trim() || !regPassword) {
      setRegError('নাম, ইউজারনেম, মোবাইল নম্বর এবং পাসওয়ার্ড আবশ্যক।');
      return;
    }

    setRegBusy(true);
    try {
      const result = await api.registerCitizen({
        name_bn: regNameBn.trim(),
        username: regUsername.trim(),
        mobile: regMobile.trim(),
        email: regEmail.trim() || undefined,
        password: regPassword,
      });
      onLoginSuccess(result.session, {
        redirectDashboard: result.redirect_dashboard || 'citizen_dashboard',
      });
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : 'নিবন্ধন সম্পন্ন করা যায়নি।');
    } finally {
      setRegBusy(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');
    setResetBusy(true);
    try {
      const res = await api.requestPasswordReset(resetIdentifier.trim());
      setResetMessage(res.message_bn);
      if (res.reset_token_preview) {
        setResetToken(res.reset_token_preview);
      }
      setResetStep(2);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'রিসেট অনুরোধ ব্যর্থ হয়েছে।');
    } finally {
      setResetBusy(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetMessage('');
    setResetBusy(true);
    try {
      const res = await api.confirmPasswordReset(resetToken.trim(), resetNewPassword);
      setResetMessage(res.message_bn);
      setPassword(resetNewPassword);
      setTimeout(() => {
        setViewMode('login');
      }, 1200);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pottoyon-login-heading"
    >
      <div className="relative bg-white rounded-[28px] shadow-2xl max-w-[540px] w-full border border-white/80 overflow-hidden my-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="বন্ধ করুন"
          className="absolute right-5 top-5 z-20 w-9 h-9 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Main Content Area */}
        <div className="relative z-10 px-6 sm:px-11 pt-8 pb-12 text-center">
          {/* Top Green Shield with Lock Emblem */}
          <div className="mx-auto mb-3 w-14 h-16 flex items-center justify-center">
            <svg
              viewBox="0 0 64 72"
              className="w-14 h-16 drop-shadow-sm"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M32 3L8 12.5V33.5C8 50.8 18.2 64.9 32 69C45.8 64.9 56 50.8 56 33.5V12.5L32 3Z"
                fill="url(#shieldGrad)"
              />
              <path
                d="M32 6L11 14.3V33.5C11 49 19.9 61.8 32 65.8C44.1 61.8 53 49 53 33.5V14.3L32 6Z"
                stroke="#34D399"
                strokeOpacity="0.35"
                strokeWidth="1.5"
              />
              {/* Lock Shackle */}
              <path
                d="M25 31V25C25 21.134 28.134 18 32 18C35.866 18 39 21.134 39 25V31"
                stroke="white"
                strokeWidth="3.6"
                strokeLinecap="round"
              />
              {/* Lock Body */}
              <rect x="21" y="30" width="22" height="18" rx="4" fill="white" />
              <circle cx="32" cy="37.5" r="2.2" fill="#08783F" />
              <path
                d="M32 39.5V43.5"
                stroke="#08783F"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="shieldGrad" x1="32" y1="3" x2="32" y2="69" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#129B52" />
                  <stop offset="1" stopColor="#066031" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Heading & Subtitle */}
          <h2
            id="pottoyon-login-heading"
            className="text-2xl sm:text-[30px] font-extrabold text-[#064E32] tracking-tight leading-snug"
          >
            {viewMode === 'register'
              ? 'নতুন নাগরিক নিবন্ধন'
              : viewMode === 'reset'
              ? 'পাসওয়ার্ড পুনরুদ্ধার'
              : 'লগইন করুন'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
            {viewMode === 'register'
              ? 'নাগরিক সেবা গ্রহণের জন্য আপনার অ্যাকাউন্ট তৈরি করুন'
              : viewMode === 'reset'
              ? 'আপনার নিবন্ধিত ইউজার আইডি বা ইমেইল দিয়ে পাসওয়ার্ড রিসেট করুন'
              : 'আপনার নিবন্ধিত অ্যাকাউন্ট দিয়ে প্রবেশ করুন'}
          </p>

          {viewMode === 'login' && (
            <>
              {/* ONLY TWO LOGIN OPTIONS (Citizen Login vs Administrative Login) */}
              <div className="mt-5 mb-6 flex justify-center">
                <div
                  role="radiogroup"
                  aria-label="লগইনের ধরন নির্বাচন করুন"
                  className="inline-flex items-center gap-5 sm:gap-8 bg-[#E9F5EE] border border-[#CBE7D6] rounded-full px-5 sm:px-7 py-2.5"
                >
                  {/* Option A: নাগরিক লগইন */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={loginType === 'citizen'}
                    data-testid="login-option-citizen"
                    onClick={() => handleSelectLoginType('citizen')}
                    className="flex items-center gap-2.5 cursor-pointer focus:outline-hidden group"
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        loginType === 'citizen'
                          ? 'border-2 border-[#08783F] bg-white'
                          : 'border-2 border-slate-300 bg-white group-hover:border-slate-400'
                      }`}
                    >
                      {loginType === 'citizen' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#08783F]" />
                      )}
                    </span>
                    <span
                      className={`text-sm sm:text-[15px] font-bold transition-colors ${
                        loginType === 'citizen' ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      নাগরিক লগইন
                    </span>
                  </button>

                  {/* Option B: প্রশাসনিক লগইন */}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={loginType === 'administrative'}
                    data-testid="login-option-administrative"
                    onClick={() => handleSelectLoginType('administrative')}
                    className="flex items-center gap-2.5 cursor-pointer focus:outline-hidden group"
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                        loginType === 'administrative'
                          ? 'border-2 border-[#08783F] bg-white'
                          : 'border-2 border-slate-300 bg-white group-hover:border-slate-400'
                      }`}
                    >
                      {loginType === 'administrative' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#08783F]" />
                      )}
                    </span>
                    <span
                      className={`text-sm sm:text-[15px] font-bold transition-colors ${
                        loginType === 'administrative' ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      প্রশাসনিক লগইন
                    </span>
                  </button>
                </div>
              </div>

              {/* Shared Login Form */}
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
                {/* User ID Input */}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <User className="w-5 h-5 stroke-[1.75]" />
                  </span>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    aria-label="ইউজারনেম / মোবাইল / ইমেইল"
                    placeholder="ইউজারনেম / মোবাইল / ইমেইল"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm sm:text-[15px] placeholder:text-slate-500 focus:outline-hidden focus:border-[#08783F] focus:ring-2 focus:ring-[#08783F]/20 transition-all"
                  />
                </div>

                {/* Password Input with Show/Hide Toggle */}
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <Lock className="w-5 h-5 stroke-[1.75]" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    aria-label="পাসওয়ার্ড"
                    placeholder="পাসওয়ার্ড"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm sm:text-[15px] placeholder:text-slate-500 focus:outline-hidden focus:border-[#08783F] focus:ring-2 focus:ring-[#08783F]/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <Eye className="w-5 h-5" />
                    ) : (
                      <EyeOff className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Conditional 2FA OTP Field (only if required by server for administrative officers) */}
                {require2FA && loginType === 'administrative' && (
                  <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2 animate-fadeIn">
                    <label className="block text-xs font-bold text-[#064E32]">
                      দ্বিমুখী নিরাপত্তা কোড (2FA OTP) প্রদান করুন
                    </label>
                    <input
                      type="text"
                      placeholder="৬ ডিজিটের ওটিপি কোড"
                      value={twoFactorOtp}
                      onChange={(e) => setTwoFactorOtp(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-center tracking-widest text-sm font-mono font-bold rounded-lg border border-emerald-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#08783F]"
                    />
                  </div>
                )}

                {/* Remember Me & Forgot Password Row */}
                <div className="flex items-center justify-between pt-0.5 text-xs sm:text-sm">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-slate-800 font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                        rememberMe
                          ? 'bg-[#08783F] text-white border border-[#08783F]'
                          : 'bg-white border border-slate-300'
                      }`}
                    >
                      {rememberMe && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </span>
                    <span>আমাকে মনে রাখুন</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setResetIdentifier(username.trim());
                      setResetStep(1);
                      setResetError('');
                      setResetMessage('');
                      setViewMode('reset');
                    }}
                    className="text-[#08783F] hover:text-[#064E32] hover:underline font-semibold transition-colors cursor-pointer"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                </div>

                {/* Error Alert */}
                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-medium flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Login Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-[#0A8A45] via-[#08783F] to-[#05542B] hover:from-[#08783F] hover:to-[#044221] disabled:opacity-60 text-white font-bold text-base sm:text-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <LogIn className="w-5 h-5" />
                  <span>{loading ? 'যাচাই করা হচ্ছে...' : 'লগইন করুন'}</span>
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 border-t border-slate-200" />

              {/* Conditional Footer Notice / Citizen Registration Link */}
              {loginType === 'citizen' ? (
                <div className="text-xs sm:text-sm text-slate-700 font-medium">
                  <span>একটি অ্যাকাউন্ট নেই? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRegError('');
                      setViewMode('register');
                    }}
                    className="text-[#065F31] hover:text-[#044221] font-extrabold underline underline-offset-4 cursor-pointer"
                  >
                    নতুন নিবন্ধন করুন
                  </button>
                </div>
              ) : (
                <div className="text-xs sm:text-sm text-[#064E32] font-semibold bg-[#F2F9F5] border border-[#D3EBDD] rounded-xl px-4 py-2.5">
                  এই অংশটি শুধুমাত্র অনুমোদিত প্রশাসনিক কর্মকর্তাদের জন্য সংরক্ষিত।
                </div>
              )}
            </>
          )}

          {/* Citizen Registration Mode */}
          {viewMode === 'register' && (
            <form onSubmit={handleCitizenRegisterSubmit} className="mt-5 space-y-3.5 text-left text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">পূর্ণ নাম (বাংলায়) *</label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: মোঃ রফিকুল ইসলাম"
                  value={regNameBn}
                  onChange={(e) => setRegNameBn(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#08783F]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ইউজারনেম *</label>
                  <input
                    type="text"
                    required
                    placeholder="rafiqul.citizen"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#08783F]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">মোবাইল নম্বর *</label>
                  <input
                    type="tel"
                    required
                    placeholder="017XXXXXXXX"
                    value={regMobile}
                    onChange={(e) => setRegMobile(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#08783F]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">ইমেইল (ঐচ্ছিক)</label>
                <input
                  type="email"
                  placeholder="citizen@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#08783F]"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর, বর্ণ ও সংখ্যা) *</label>
                <input
                  type="password"
                  required
                  placeholder="কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#08783F]"
                />
              </div>

              {regError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {regError}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('login')}
                  className="px-4 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>ফিরে যান</span>
                </button>
                <button
                  type="submit"
                  disabled={regBusy}
                  className="flex-1 py-3 px-5 rounded-xl bg-gradient-to-r from-[#0A8A45] to-[#05542B] text-white font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{regBusy ? 'নিবন্ধন হচ্ছে...' : 'নিবন্ধন সম্পন্ন করুন'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Password Reset Mode */}
          {viewMode === 'reset' && (
            <div className="mt-5 space-y-4 text-left text-xs sm:text-sm">
              {resetMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{resetMessage}</span>
                </div>
              )}
              {resetError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                  {resetError}
                </div>
              )}

              {resetStep === 1 ? (
                <form onSubmit={handleRequestReset} className="space-y-3.5">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      ইউজারনেম, মোবাইল অথবা ইমেইল *
                    </label>
                    <input
                      type="text"
                      required
                      value={resetIdentifier}
                      onChange={(e) => setResetIdentifier(e.target.value)}
                      placeholder="আপনার ইউজার আইডি বা ইমেইল দিন"
                      className="w-full px-3.5 py-3 border border-slate-300 rounded-xl focus:outline-hidden focus:border-[#08783F]"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('login')}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      <span>ফিরে যান</span>
                    </button>
                    <button
                      type="submit"
                      disabled={resetBusy}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-[#08783F] hover:bg-[#064E32] text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{resetBusy ? 'পাঠানো হচ্ছে...' : 'রিসেট টোকেন পাঠান'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleConfirmReset} className="space-y-3.5">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">রিসেট টোকেন *</label>
                    <input
                      type="text"
                      required
                      value={resetToken}
                      onChange={(e) => setResetToken(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">
                      নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর, বর্ণ ও সংখ্যা) *
                    </label>
                    <input
                      type="password"
                      required
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="নতুন পাসওয়ার্ড দিন"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('login')}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-slate-700 cursor-pointer"
                    >
                      লগইনে ফিরুন
                    </button>
                    <button
                      type="submit"
                      disabled={resetBusy}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-[#08783F] hover:bg-[#064E32] text-white font-bold cursor-pointer"
                    >
                      {resetBusy ? 'সংরক্ষণ হচ্ছে...' : 'নতুন পাসওয়ার্ড সেট করুন'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Bottom Security & Privacy Pill */}
          <div className="mt-5 flex justify-center">
            <div className="inline-flex items-center gap-2 bg-[#EBF6F0] text-[#064E32] px-4 py-1.5 rounded-full text-xs font-medium border border-[#D5EDE0]">
              <ShieldCheck className="w-4 h-4 text-[#08783F] shrink-0" />
              <span>আপনার তথ্য নিরাপদ ও গোপনীয় রাখা হয়</span>
            </div>
          </div>
        </div>

        {/* Subtle Bottom Decorative Green Waves matching reference image */}
        <svg
          className="absolute bottom-0 left-0 w-full h-20 pointer-events-none select-none"
          viewBox="0 0 540 90"
          fill="none"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Left layered wave */}
          <path
            d="M0 30C45 36 92 64 155 90H0V30Z"
            fill="#A7DFC0"
            fillOpacity="0.55"
          />
          <path
            d="M0 52C38 58 82 74 125 90H0V52Z"
            fill="#43B577"
            fillOpacity="0.65"
          />
          {/* Right layered wave */}
          <path
            d="M540 28C485 36 435 64 375 90H540V28Z"
            fill="#A7DFC0"
            fillOpacity="0.55"
          />
          <path
            d="M540 48C495 56 448 72 405 90H540V48Z"
            fill="#1D9E59"
            fillOpacity="0.75"
          />
        </svg>
      </div>
    </div>
  );
};
