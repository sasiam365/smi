import React, { useState } from 'react';
import {
  Search,
  Filter,
  Users,
  BadgeDollarSign,
  IdCard,
  Building,
  FileCheck2,
  Clock,
  ArrowRight,
  CheckCircle,
  HelpCircle,
  X
} from 'lucide-react';
import { Service, ServiceCategory } from '../../types';

interface AllServicesViewProps {
  services: Service[];
  onApplyService: (serviceId: string) => void;
  lang?: 'bn' | 'en';
  initialCategory?: string;
  initialSearchQuery?: string;
}

export const AllServicesView: React.FC<AllServicesViewProps> = ({
  services,
  onApplyService,
  lang = 'bn',
  initialCategory = 'all',
  initialSearchQuery = '',
}) => {
  const [activeCategory, setActiveCategory] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedServiceForModal, setSelectedServiceForModal] = useState<Service | null>(null);

  React.useEffect(() => {
    setActiveCategory(initialCategory || 'all');
  }, [initialCategory]);

  React.useEffect(() => {
    setSearchQuery(initialSearchQuery || '');
  }, [initialSearchQuery]);

  const countCat = (cat: ServiceCategory) => services.filter((s) => s.category === cat).length;
  const toBn = (n: number) => n.toLocaleString('bn-BD');

  const categories = [
    { id: 'all', name_bn: `সকল সেবা (${toBn(services.length)}টি)`, name_en: `All Services (${services.length})` },
    { id: 'citizen_personal', name_bn: `নাগরিক ও ব্যক্তিগত (${toBn(countCat('citizen_personal'))})`, name_en: `Citizen & Personal (${countCat('citizen_personal')})` },
    { id: 'financial_social', name_bn: `আর্থিক ও সামাজিক (${toBn(countCat('financial_social'))})`, name_en: `Financial & Social (${countCat('financial_social')})` },
    { id: 'nid_voter', name_bn: `জাতীয় পরিচয় ও ভোটার (${toBn(countCat('nid_voter'))})`, name_en: `NID & Voter (${countCat('nid_voter')})` },
    { id: 'licensing', name_bn: `লাইসেন্সিং ও বাণিজ্য (${toBn(countCat('licensing'))})`, name_en: `Licensing (${countCat('licensing')})` },
    { id: 'other', name_bn: `অন্যান্য প্রত্যয়ন (${toBn(countCat('other'))})`, name_en: `Other Civic (${countCat('other')})` },
  ];

  const filteredServices = services.filter((s) => {
    const matchesCategory = activeCategory === 'all' || s.category === activeCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.name_bn.toLowerCase().includes(q) ||
      s.name_en.toLowerCase().includes(q) ||
      s.description_bn.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="py-10 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            সকল নাগরিক সেবাসমূহ
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            পাবনা সদর উপজেলার ১০টি ইউনিয়ন পরিষদ ও পাবনা পৌরসভার সকল অনুমোদিত সরকারি সেবা, প্রত্যায়ন ও লাইসেন্স
          </p>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs mb-8 space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="সেবার নাম লিখে খুঁজুন (যেমন: ওয়ারিশ, নাগরিকত্ব, ট্রেড লাইসেন্স, ইনকাম...)"
              className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-2 rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                  activeCategory === cat.id
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {lang === 'bn' ? cat.name_bn : cat.name_en}
              </button>
            ))}
          </div>
        </div>

        {/* Services Grid (47 Services) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((service, index) => (
            <div
              key={service.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono text-slate-400 font-semibold">
                    #{(index + 1).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded">
                    ফি: ৳{service.default_fee}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  {service.name_bn}
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-2">{service.name_en}</p>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {service.description_bn}
                </p>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>প্রদান সময়: {service.delivery_time_days} কর্মদিবস</span>
                  </span>
                  <span>অনুমোদন: {service.approval_authority_bn.split('/')[0]}</span>
                </div>
              </div>

              <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => setSelectedServiceForModal(service)}
                  className="text-xs font-bold text-slate-600 hover:text-emerald-700 transition-colors"
                >
                  বিস্তারিত নিয়ম
                </button>

                <button
                  onClick={() => onApplyService(service.id)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <span>আবেদন করুন</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredServices.length === 0 && (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500">
            <HelpCircle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-base font-semibold">কোনো সেবা খুঁজে পাওয়া যায়নি</p>
            <p className="text-xs text-slate-400 mt-1">অন্য কোনো কি-ওয়ার্ড দিয়ে সার্চ করুন</p>
          </div>
        )}

        {/* Service Details Modal */}
        {selectedServiceForModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {selectedServiceForModal.name_bn}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedServiceForModal.name_en}</p>
                </div>
                <button
                  onClick={() => setSelectedServiceForModal(null)}
                  className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                {selectedServiceForModal.description_bn}
              </p>

              <div className="space-y-2 text-xs">
                <span className="font-bold text-slate-900 block">প্রয়োজনীয় কাগজপত্র:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  {selectedServiceForModal.required_docs_bn.map((doc, idx) => (
                    <li key={idx}>{doc}</li>
                  ))}
                </ul>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs p-3 bg-emerald-50 rounded-lg text-emerald-900">
                <div>
                  <span className="text-slate-500 block">সরকারি ফি:</span>
                  <span className="font-bold text-base font-mono">৳{selectedServiceForModal.default_fee}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">প্রদানের সময়সীমা:</span>
                  <span className="font-bold">{selectedServiceForModal.delivery_time_days} কর্মদিবস</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => setSelectedServiceForModal(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  বন্ধ করুন
                </button>
                <button
                  onClick={() => {
                    const id = selectedServiceForModal.id;
                    setSelectedServiceForModal(null);
                    onApplyService(id);
                  }}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2 rounded-lg text-xs shadow-xs"
                >
                  অনলাইন আবেদন শুরু করুন
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
