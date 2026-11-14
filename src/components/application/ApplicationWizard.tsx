import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  CheckCircle,
  FileText,
  User,
  Plus,
  Trash2,
  CreditCard,
  Printer,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { AdministrativeUnit, Service, WarishMember, Application } from '../../types';
import { PaymentModal } from '../payment/PaymentModal';
import { api } from '../../services/api';

interface ApplicationWizardProps {
  initialServiceId?: string;
  initialUnitId?: string;
  institutions: AdministrativeUnit[];
  services: Service[];
  authToken?: string;
  onComplete: (application: Application) => void;
  onCancel: () => void;
  lang?: 'bn' | 'en';
}

interface QueuedAttachment {
  doc_type: 'nid' | 'photo' | 'proof';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  content_base64: string;
}

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

export const ApplicationWizard: React.FC<ApplicationWizardProps> = ({
  initialServiceId = 'srv_warish',
  initialUnitId = 'unit_goyeshpur',
  institutions,
  services,
  authToken,
  onComplete,
  onCancel,
  lang = 'bn',
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedServiceId, setSelectedServiceId] = useState(initialServiceId);
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId);
  const [formError, setFormError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Form fields
  const [applicantName, setApplicantName] = useState('মোঃ মনিরুল ইসলাম');
  const [applicantNameEn, setApplicantNameEn] = useState('Md. Monirul Islam');
  const [fatherName, setFatherName] = useState('মোঃ আব্দুল মমিন মোল্লা');
  const [motherName, setMotherName] = useState('মোছাঃ সাবিনা খাতুন');
  const [spouseName, setSpouseName] = useState('');
  const [nidNumber, setNidNumber] = useState('19977615500000001');
  const [mobileNumber, setMobileNumber] = useState('01712-345678');
  const [email, setEmail] = useState('monirul.islam@example.com');
  const [wardNo, setWardNo] = useState<number>(4);
  const [village, setVillage] = useState('পূর্বপাড়া');
  const [postOffice, setPostOffice] = useState('গোয়েশপুর - ৬৬০০');
  const [presentAddress, setPresentAddress] = useState('গোয়েশপুর, পাবনা সদর, পাবনা');

  // Warish table heirs state
  const [heirs, setHeirs] = useState<WarishMember[]>([
    { sl: 1, name: 'মোঃ মনিরুল ইসলাম হুজুর', dob: '১৮-০৪-১৯৯৭', age: 30, relation: 'নিজ' },
    { sl: 2, name: 'মোঃ আব্দুল মমিন মোল্লা', dob: '২০-১০-১৯৭৬', age: 50, relation: 'পিতা' },
    { sl: 3, name: 'মোছাঃ সাবিনা খাতুন', dob: '১৫-০৮-১৯৭৬', age: 50, relation: 'মাতা' },
  ]);

  // Uploaded files state (supports both real picked files + default demo reference labels)
  const [uploadedDocs, setUploadedDocs] = useState<{ [key: string]: { name: string; sizeText?: string; isReal?: boolean } }>({
    nid: { name: 'nid_front_back_scanned.pdf', sizeText: 'নমুনা নথি সংযুক্ত' },
    photo: { name: 'applicant_passport_photo.jpg', sizeText: 'নমুনা ছবি সংযুক্ত' },
    proof: { name: 'ward_member_recommendation.pdf', sizeText: 'ঐচ্ছিক প্রত্যয়ন' },
  });
  const [queuedAttachments, setQueuedAttachments] = useState<Partial<Record<'nid' | 'photo' | 'proof', QueuedAttachment>>>({});

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [generatedTrackingNo, setGeneratedTrackingNo] = useState('');
  const [completedApp, setCompletedApp] = useState<Application | null>(null);

  const selectedService = services.find((s) => s.id === selectedServiceId) || services[0];
  const selectedUnit = institutions.find((i) => i.id === selectedUnitId) || institutions[0];

  useEffect(() => {
    const prefix = selectedUnit.type === 'municipality' ? 'PM' : 'UP';
    const rand = Math.floor(10000 + Math.random() * 90000);
    setGeneratedTrackingNo(`${prefix}-2026-${rand}`);
    setWardNo((prev) => Math.min(Math.max(1, prev), selectedUnit.wards_count));
  }, [selectedUnit]);

  const addHeirRow = () => {
    setHeirs([
      ...heirs,
      {
        sl: heirs.length + 1,
        name: '',
        dob: '০১-০১-২০০০',
        age: 25,
        relation: 'পুত্র',
      },
    ]);
  };

  const updateHeir = (index: number, field: keyof WarishMember, value: string | number) => {
    const updated = [...heirs];
    updated[index] = { ...updated[index], [field]: value };
    setHeirs(updated);
  };

  const removeHeir = (index: number) => {
    if (heirs.length <= 1) return;
    const updated = heirs.filter((_, i) => i !== index).map((h, idx) => ({ ...h, sl: idx + 1 }));
    setHeirs(updated);
  };

  const handleFilePick = (docType: 'nid' | 'photo' | 'proof', file?: File) => {
    if (!file) return;
    setUploadError('');

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setUploadError('শুধুমাত্র PDF, JPG অথবা PNG ফরম্যাটের ফাইল গ্রহণযোগ্য।');
      return;
    }
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setUploadError('ফাইলের আকার সর্বোচ্চ ২ মেগাবাইটের (2 MB) মধ্যে হতে হবে।');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setUploadError('ফাইলটি পাঠ করা যায়নি। পুনরায় চেষ্টা করুন।');
        return;
      }
      setQueuedAttachments((prev) => ({
        ...prev,
        [docType]: {
          doc_type: docType,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          content_base64: result,
        },
      }));
      setUploadedDocs((prev) => ({
        ...prev,
        [docType]: {
          name: file.name,
          sizeText: `${(file.size / 1024).toFixed(1)} KB`,
          isReal: true,
        },
      }));
    };
    reader.onerror = () => {
      setUploadError('ফাইল আপলোড প্রস্তুতিতে ত্রুটি হয়েছে।');
    };
    reader.readAsDataURL(file);
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!applicantName.trim() || !fatherName.trim() || !motherName.trim() || !mobileNumber.trim() || !nidNumber.trim()) {
      setFormError('অনুগ্রহ করে তারকা (*) চিহ্নিত সকল আবশ্যক তথ্য সঠিকভাবে প্রদান করুন।');
      return;
    }
    if (selectedService.has_warish_table && heirs.some((h) => !h.name.trim())) {
      setFormError('ওয়ারিশ তালিকার সকল সদস্যের নাম প্রদান করুন।');
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleStep2Submit = () => {
    setUploadError('');
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePaymentSuccess = async (paymentData: {
    method: 'bkash' | 'nagad' | 'rocket' | 'card';
    transactionId: string;
    amount: number;
  }) => {
    setPaymentModalOpen(false);
    setSubmittingPayment(true);
    setPaymentError('');

    const draftPayload: Application = {
      id: `app_${Date.now()}`,
      tracking_no: generatedTrackingNo,
      administrative_unit_id: selectedUnit.id,
      service_id: selectedService.id,
      service_name_bn: selectedService.name_bn,
      applicant_name_bn: applicantName.trim(),
      applicant_name_en: (applicantNameEn || applicantName).trim(),
      father_name_bn: fatherName.trim(),
      mother_name_bn: motherName.trim(),
      spouse_name_bn: spouseName.trim(),
      nid_or_birth_reg: nidNumber.trim(),
      mobile: mobileNumber.trim(),
      email: email.trim(),
      ward_no: wardNo,
      village_or_area_bn: village.trim(),
      post_office_bn: postOffice.trim(),
      upazila_bn: selectedUnit.upazila_bn,
      district_bn: selectedUnit.district_bn,
      present_address_bn: presentAddress.trim(),
      heirs: selectedService.has_warish_table ? heirs : undefined,
      status: 'pending_payment',
      fee_amount: selectedService.default_fee,
      payment_status: 'unpaid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const created = await api.createApplication(draftPayload, authToken);

      // Upload any real user-selected attachments to server private storage
      const filesToUpload = Object.values(queuedAttachments).filter(
        (item): item is QueuedAttachment => Boolean(item)
      );
      for (const att of filesToUpload) {
        await api.uploadAttachment(created.id, att);
      }

      const paidResult = await api.checkoutPayment({
        applicationId: created.id,
        method: paymentData.method,
        amount: created.fee_amount,
      });
      setCompletedApp(paidResult.application);
      setStep(4);
      onComplete(paidResult.application);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'সার্ভারে আবেদন ও পেমেন্ট সংরক্ষণ করা যায়নি। অনুগ্রহ করে পুনরায় চেষ্টা করুন।';
      setPaymentError(msg);
      setFormError(msg);
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <div className="py-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <div className="no-print text-xs text-slate-500 flex flex-wrap items-center gap-2 mb-6">
          <button type="button" onClick={onCancel} className="hover:text-emerald-700">
            হোম
          </button>
          <span>/</span>
          <span>সেবাসমূহ</span>
          <span>/</span>
          <span className="font-semibold text-slate-700">{selectedService.name_bn}</span>
          <span>/</span>
          <span className="text-emerald-800 font-bold">আবেদন</span>
        </div>

        {/* Multi-step progress indicator */}
        <div className="no-print bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs mb-8">
          <div className="flex items-center justify-between max-w-2xl mx-auto relative">
            <div className="absolute top-1/2 left-8 right-8 -translate-y-1/2 h-0.5 bg-slate-200 -z-0"></div>

            {[
              { id: 1, bn: '১', label: 'তথ্য প্রদান' },
              { id: 2, bn: '২', label: 'নথি আপলোড' },
              { id: 3, bn: '৩', label: 'ফি পরিশোধ' },
              { id: 4, bn: '৪', label: 'আবেদন সম্পন্ন' },
            ].map((s) => (
              <div key={s.id} className="relative z-10 flex flex-col items-center gap-1.5">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    step === s.id
                      ? 'bg-emerald-700 text-white ring-4 ring-emerald-100'
                      : step > s.id
                      ? 'bg-emerald-800 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {s.bn}
                </div>
                <span
                  className={`text-[11px] sm:text-xs font-semibold ${
                    step === s.id ? 'text-emerald-800 font-bold' : 'text-slate-600'
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1: তথ্য প্রদান */}
        {step === 1 && (
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
            <div className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {selectedService.name_bn}ের জন্য আবেদন
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                সরকারি রেকর্ড ও সনদপত্র প্রস্তুতকরণের জন্য নির্ভুল তথ্য প্রদান করুন
              </p>
            </div>

            {formError && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleStep1Submit} className="space-y-6">
              {/* Service, Institution & Ward Selection */}
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    সেবার ধরন নির্বাচন করুন *
                  </label>
                  <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    {services.map((srv) => (
                      <option key={srv.id} value={srv.id}>
                        {srv.name_bn} (৳{srv.default_fee})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    প্রতিষ্ঠান নির্বাচন করুন *
                  </label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    <optgroup label="ইউনিয়ন পরিষদ (১০টি)">
                      {institutions
                        .filter((i) => i.type === 'union_parishad')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name_bn}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="পৌরসভা (স্বতন্ত্র)">
                      {institutions
                        .filter((i) => i.type === 'municipality')
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name_bn} (স্বতন্ত্র নগর পরিষদ)
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-1">
                    ওয়ার্ড নম্বর *
                  </label>
                  <select
                    value={wardNo}
                    onChange={(e) => setWardNo(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  >
                    {Array.from({ length: selectedUnit.wards_count }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>
                        {w} নং ওয়ার্ড ({selectedUnit.name_bn})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Personal Details */}
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide border-b border-slate-100 pb-2">
                আবেদনকারীর তথ্য
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    আবেদনকারীর নাম (বাংলায়) *
                  </label>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="মোঃ মনিরুল ইসলাম"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    আবেদনকারীর নাম (ইংরেজিতে)
                  </label>
                  <input
                    type="text"
                    value={applicantNameEn}
                    onChange={(e) => setApplicantNameEn(e.target.value)}
                    placeholder="Md. Monirul Islam"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    পিতার নাম *
                  </label>
                  <input
                    type="text"
                    required
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="মোঃ আব্দুল মমিন মোল্লা"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    মাতার নাম *
                  </label>
                  <input
                    type="text"
                    required
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder="মোছাঃ সাবিনা খাতুন"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    স্বামী / স্ত্রীর নাম (প্রযোজ্য ক্ষেত্রে)
                  </label>
                  <input
                    type="text"
                    value={spouseName}
                    onChange={(e) => setSpouseName(e.target.value)}
                    placeholder="স্বামী বা স্ত্রীর নাম"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    জাতীয় পরিচয়পত্র (NID) বা জন্ম নিবন্ধন নম্বর *
                  </label>
                  <input
                    type="text"
                    required
                    value={nidNumber}
                    onChange={(e) => setNidNumber(e.target.value)}
                    placeholder="1997XXXXXXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    মোবাইল নম্বর * (এসএমএস প্রাপ্তির জন্য)
                  </label>
                  <input
                    type="text"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    গ্রাম / মহল্লা / রোড নম্বর
                  </label>
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder="পূর্বপাড়া"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">ডাকঘর</label>
                  <input
                    type="text"
                    value={postOffice}
                    onChange={(e) => setPostOffice(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">ইমেইল (ঐচ্ছিক)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  বর্তমান ঠিকানা *
                </label>
                <input
                  type="text"
                  required
                  value={presentAddress}
                  onChange={(e) => setPresentAddress(e.target.value)}
                  placeholder="গোয়েশপুর, পাবনা সদর, পাবনা"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
                />
              </div>

              {/* Dynamic Warish / Family Heir Table */}
              {selectedService.has_warish_table && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        পরিবারের সদস্য / ওয়ারিশগণের বিবরণী *
                      </h4>
                      <p className="text-xs text-slate-500">
                        সনদপত্রে উল্লিখিত সদস্যদের নাম, বয়স ও সম্পর্কের বিবরণ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addHeirRow}
                      className="flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>সদস্য যোগ করুন</span>
                    </button>
                  </div>

                  <div className="horizontal-scroll-table border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left tabular-nums">
                      <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">নং</th>
                          <th className="py-2.5 px-3 min-w-[180px]">সদস্যের নাম</th>
                          <th className="py-2.5 px-3 min-w-[120px]">জন্ম তারিখ</th>
                          <th className="py-2.5 px-3 min-w-[80px]">বয়স</th>
                          <th className="py-2.5 px-3 min-w-[110px]">সম্পর্ক</th>
                          <th className="py-2.5 px-2 w-10 text-center">মুছুন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {heirs.map((heir, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-center font-mono font-bold text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                required
                                value={heir.name}
                                onChange={(e) => updateHeir(idx, 'name', e.target.value)}
                                placeholder="সদস্যের পুরো নাম"
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={heir.dob}
                                onChange={(e) => updateHeir(idx, 'dob', e.target.value)}
                                placeholder="দিন-মাস-বছর"
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                value={heir.age}
                                onChange={(e) => updateHeir(idx, 'age', parseInt(e.target.value, 10) || 0)}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs font-mono focus:ring-1 focus:ring-emerald-600 focus:outline-hidden"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={heir.relation}
                                onChange={(e) => updateHeir(idx, 'relation', e.target.value)}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-600 focus:outline-hidden bg-white"
                              >
                                <option value="নিজ">নিজ</option>
                                <option value="পিতা">পিতা</option>
                                <option value="মাতা">মাতা</option>
                                <option value="স্ত্রী">স্ত্রী</option>
                                <option value="পুত্র">পুত্র</option>
                                <option value="কন্যা">কন্যা</option>
                                <option value="ভাই">ভাই</option>
                                <option value="বোন">বোন</option>
                              </select>
                            </td>
                            <td className="py-2 px-2 text-center">
                              {heirs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeHeir(idx)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-6 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-xs"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>পূর্ববর্তী</span>
                </button>

                <button
                  type="submit"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
                >
                  <span>পরবর্তী ধাপ (নথি আপলোড)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: নথি আপলোড */}
        {step === 2 && (
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
            <div className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                প্রয়োজনীয় কাগজপত্র আপলোড করুন
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                আবেদন যাচাইয়ের জন্য সুস্পষ্ট স্ক্যান কপি সংযুক্ত করুন (PDF, JPG, PNG • সর্বোচ্চ ২ মেগাবাইট)
              </p>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-700" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="space-y-4">
              {[
                {
                  key: 'nid' as const,
                  title: 'জাতীয় পরিচয়পত্র / জন্ম নিবন্ধন সনদ *',
                  icon: FileText,
                },
                {
                  key: 'photo' as const,
                  title: 'আবেদনকারীর সাম্প্রতিক ছবি *',
                  icon: User,
                },
                {
                  key: 'proof' as const,
                  title: 'ওয়ার্ড মেম্বার / কাউন্সিলরের প্রত্যয়ন কপি',
                  icon: ShieldCheck,
                },
              ].map((docItem) => {
                const Icon = docItem.icon;
                const info = uploadedDocs[docItem.key];
                return (
                  <div
                    key={docItem.key}
                    className="p-4 border border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="w-8 h-8 text-emerald-700 shrink-0" />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900">{docItem.title}</h4>
                        <span className="text-xs text-slate-600 block truncate">
                          {info?.name} {info?.sizeText ? `(${info.sizeText})` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 ${
                          info?.isReal
                            ? 'text-emerald-800 bg-emerald-100'
                            : 'text-slate-700 bg-slate-200/80'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>{info?.isReal ? 'নতুন ফাইল নির্বাচিত' : 'সংযুক্ত'}</span>
                      </span>

                      <label className="cursor-pointer bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                        <Upload className="w-3.5 h-3.5" />
                        <span>ফাইল পরিবর্তন</span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                          className="hidden"
                          onChange={(e) => handleFilePick(docItem.key, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-6 mt-8 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>পূর্ববর্তী (তথ্য পরিবর্তন)</span>
              </button>

              <button
                type="button"
                onClick={handleStep2Submit}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
              >
                <span>পরবর্তী ধাপ (ফি পরিশোধ)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: ফি পরিশোধ */}
        {step === 3 && (
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
            <div className="border-b border-slate-200 pb-4 mb-6">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                সরকারি ফি পরিশোধ
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                আবেদন প্রক্রিয়া শুরু করতে ডিজিটাল পেমেন্ট সম্পন্ন করুন
              </p>
            </div>

            <div className="bg-emerald-50/70 p-6 rounded-2xl border border-emerald-100 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
                    আবেদনের সারাংশ
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {selectedService.name_bn}
                  </h3>
                  <p className="text-xs text-slate-600">
                    প্রতিষ্ঠান: {selectedUnit.name_bn} ({wardNo} নং ওয়ার্ড)
                  </p>
                  <p className="text-xs text-slate-600 font-mono mt-0.5">
                    আবেদন ট্র্যাকিং নম্বর: <strong className="text-slate-900">{generatedTrackingNo}</strong>
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">মোট প্রদেয় ফি:</span>
                  <span className="text-3xl font-black text-emerald-800 font-mono tabular-nums">
                    ৳{selectedService.default_fee}
                  </span>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-5 mb-6 space-y-3">
              <h4 className="text-sm font-bold text-slate-800">পেমেন্ট সম্পর্কিত নিয়মাবলি:</h4>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>শুধুমাত্র অনুমোদিত অনলাইন মাধ্যম (বিকাশ, নগদ, রকেট, কার্ড) গ্রহণযোগ্য।</li>
                <li>ফি পরিশোধ সম্পন্ন হলে সাথে সাথে ট্রানজেকশন রসিদ ও এসএমএস নিশ্চিতকরণ প্রদান করা হবে।</li>
                <li>যাচাইকালে কোনো অসঙ্গতি পাওয়া গেলে সংশোধনের সুযোগ দেওয়া হবে।</li>
              </ul>
            </div>

            {paymentError && (
              <div className="mb-5 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>পূর্ববর্তী</span>
              </button>

              <button
                type="button"
                disabled={submittingPayment}
                onClick={() => setPaymentModalOpen(true)}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold px-6 sm:px-8 py-3 rounded-xl transition-all shadow-md text-xs sm:text-sm"
              >
                <CreditCard className="w-4 h-4" />
                <span>
                  {submittingPayment
                    ? 'আবেদন প্রক্রিয়াকরণ হচ্ছে...'
                    : `অনলাইন ফি পরিশোধ করুন (৳${selectedService.default_fee})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: আবেদন সম্পন্ন */}
        {step === 4 && completedApp && (
          <div className="bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 shadow-lg text-center animate-fadeIn space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                আবেদন সফলভাবে গৃহীত হয়েছে!
              </h2>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                আপনার আবেদনটি <strong className="text-slate-900">{selectedUnit.name_bn}</strong> এর যাচাই তালিকায় অন্তর্ভুক্ত করা হয়েছে।
              </p>
            </div>

            {/* Tracking Receipt Box */}
            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200 rounded-xl p-5 text-left text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">ট্র্যাকিং নম্বর:</span>
                <span className="font-mono font-bold text-emerald-800 text-sm">
                  {completedApp.tracking_no}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">আবেদনকারীর নাম:</span>
                <span className="font-semibold text-slate-800">{completedApp.applicant_name_bn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">সেবার নাম:</span>
                <span className="font-semibold text-slate-800">{completedApp.service_name_bn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">পরিশোধিত ফি:</span>
                <span className="font-bold text-emerald-700 font-mono">৳{completedApp.fee_amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">ট্রানজেকশন আইডি:</span>
                <span className="font-mono text-slate-800">{completedApp.transaction_id}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500">বর্তমান অবস্থা:</span>
                <span className="font-bold text-amber-700">ফি পরিশোধিত (যাচাই প্রক্রিয়াধীন)</span>
              </div>
            </div>

            <div className="no-print flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 transition-colors text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>রসিদ প্রিন্ট করুন</span>
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-xs shadow-sm"
              >
                হোম পেজে ফিরে যান
              </button>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        <PaymentModal
          isOpen={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          amount={selectedService.default_fee}
          serviceTitle={selectedService.name_bn}
          trackingNo={generatedTrackingNo}
          onPaymentSuccess={handlePaymentSuccess}
          lang={lang}
        />
      </div>
    </div>
  );
};
