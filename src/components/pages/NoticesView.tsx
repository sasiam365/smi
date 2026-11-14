import React, { useEffect, useState } from 'react';
import { Bell, Search, Calendar, Download, CheckCircle } from 'lucide-react';
import { storage } from '../../services/storage';
import { api } from '../../services/api';
import { Notice } from '../../types';

export const NoticesView: React.FC = () => {
  const [notices, setNotices] = useState<Notice[]>(() => storage.getNotices());
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [downloadedId, setDownloadedId] = useState<string | null>(null);

  useEffect(() => {
    api
      .listNotices()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) setNotices(list);
      })
      .catch(() => {
        // fallback already loaded
      });
  }, []);

  const categories = ['all', ...Array.from(new Set(notices.map((n) => n.category)))];

  const filteredNotices = notices.filter((n) => {
    const matchesCat = filter === 'all' || n.category === filter;
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      n.title_bn.toLowerCase().includes(q) ||
      n.content_bn.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const handleDownloadNotice = (notice: Notice) => {
    const text = [
      '====================================================',
      'PottoyonBD — স্থানীয় সরকার ডিজিটাল সেবা',
      'পাবনা সদর উপজেলা, পাবনা, বাংলাদেশ',
      '====================================================',
      '',
      `বিজ্ঞপ্তি শিরোনাম: ${notice.title_bn}`,
      `শ্রেণি: ${notice.category}`,
      `প্রকাশের তারিখ: ${notice.published_at}`,
      '',
      notice.content_bn,
      '',
      '----------------------------------------------------',
      'স্থানীয় সরকার বিভাগ, পাবনা সদর',
    ].join('\n');

    const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PottoyonBD_Notice_${notice.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadedId(notice.id);
    setTimeout(() => setDownloadedId(null), 2500);
  };

  return (
    <div className="py-12 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center space-y-2 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2 shadow-xs">
            <Bell className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            নোটিশ বোর্ড ও প্রজ্ঞাপন
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            পাবনা সদর উপজেলা, ১০টি ইউনিয়ন পরিষদ ও পাবনা পৌরসভার সর্বশেষ জরুরি বিজ্ঞপ্তি
          </p>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs mb-6 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="বিজ্ঞপ্তির শিরোনাম বা বিষয় লিখে খুঁজুন..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  filter === cat
                    ? 'bg-emerald-800 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'সকল বিজ্ঞপ্তি' : cat}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {filteredNotices.map((notice) => (
            <div
              key={notice.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-500 hover:shadow-md transition-all space-y-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-md border border-emerald-200">
                  {notice.category}
                </span>
                <span className="text-slate-500 font-mono flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{notice.published_at}</span>
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-900">{notice.title_bn}</h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                {notice.content_bn}
              </p>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">স্থানীয় সরকার বিভাগ, পাবনা সদর</span>
                <button
                  type="button"
                  onClick={() => handleDownloadNotice(notice)}
                  className="text-emerald-700 hover:underline font-bold flex items-center gap-1.5"
                >
                  {downloadedId === notice.id ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                      <span>ডাউনলোড সম্পন্ন</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>বিজ্ঞপ্তি ডাউনলোড</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}

          {filteredNotices.length === 0 && (
            <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
              নির্বাচিত ফিল্টারে কোনো নোটিশ পাওয়া যায়নি।
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
