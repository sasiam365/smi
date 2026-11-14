import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Database,
  FileCheck2,
  Globe,
  KeyRound,
  LayoutTemplate,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import { api } from '../../services/api';
import type { PermissionKey, UserSession } from '../../types';

interface EnterprisePanelProps {
  userSession: UserSession;
  hasPerm: (key: PermissionKey) => boolean;
  notify: (msg: string, isError?: boolean) => void;
}

export const EnterpriseCmsAndPagesPanel: React.FC<EnterprisePanelProps> = ({
  userSession,
  hasPerm,
  notify,
}) => {
  const token = userSession.token || '';
  const [loading, setLoading] = useState(false);
  const [cmsVersion, setCmsVersion] = useState(1);
  const [cmsStatus, setCmsStatus] = useState('published');
  const [cmsConfig, setCmsConfig] = useState<Record<string, string | boolean | number>>({});
  const [revisions, setRevisions] = useState<Array<Record<string, unknown>>>([]);
  const [pages, setPages] = useState<Array<Record<string, unknown>>>([]);
  const [noteBn, setNoteBn] = useState('');

  // New page builder form
  const [newSlug, setNewSlug] = useState('');
  const [newTitleBn, setNewTitleBn] = useState('');
  const [newMetaDesc, setNewMetaDesc] = useState('');
  const [newBlockType, setNewBlockType] = useState('paragraph');
  const [newBlockContentBn, setNewBlockContentBn] = useState('');

  // Extended notice form
  const [noticeType, setNoticeType] = useState<'popup' | 'ticker' | 'emergency' | 'scheduled'>('ticker');
  const [noticeTitleBn, setNoticeTitleBn] = useState('');
  const [noticeContentBn, setNoticeContentBn] = useState('');

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [cfgRes, pagesRes] = await Promise.all([
        api.getCmsConfig(token),
        hasPerm('website.pages.manage') || hasPerm('website.cms.manage')
          ? api.listCmsPages(token)
          : Promise.resolve([]),
      ]);
      setCmsVersion(cfgRes.version);
      setCmsStatus(cfgRes.status);
      setCmsConfig(cfgRes.config || {});
      setRevisions(cfgRes.revisions || []);
      setPages(pagesRes || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'সিএমএস তথ্য লোড ব্যর্থ হয়েছে', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const handleSaveCms = async (status: 'draft' | 'published') => {
    try {
      const res = await api.updateCmsConfig(token, {
        config: cmsConfig,
        status,
        note_bn: noteBn || (status === 'published' ? 'সিএমএস লাইভ পাবলিশ' : 'সিএমএস ড্রাফট সংরক্ষণ'),
      });
      setCmsVersion(res.version);
      setCmsStatus(res.status);
      setNoteBn('');
      notify(
        status === 'published'
          ? `সিএমএস কনফিগারেশন সংস্করণ #${res.version} প্রকাশিত হয়েছে।`
          : `সিএমএস ড্রাফট সংস্করণ #${res.version} সংরক্ষিত হয়েছে।`
      );
      void loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'সিএমএস আপডেট ব্যর্থ হয়েছে', true);
    }
  };

  const handleRestoreRevision = async (revId: string) => {
    try {
      const res = await api.restoreCmsRevision(token, revId);
      notify(`সংস্করণ #${res.version} সফলভাবে পুনরুদ্ধার করা হয়েছে।`);
      void loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'রিস্টোর ব্যর্থ হয়েছে', true);
    }
  };

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createCmsPage(token, {
        slug: newSlug,
        title_bn: newTitleBn,
        meta_description: newMetaDesc || newTitleBn,
        status: 'published',
        blocks: [
          {
            type: newBlockType,
            content_bn: newBlockContentBn || newTitleBn,
          },
        ],
      });
      setNewSlug('');
      setNewTitleBn('');
      setNewMetaDesc('');
      setNewBlockContentBn('');
      notify('নতুন ডায়নামিক পেজ সফলভাবে তৈরি ও প্রকাশিত হয়েছে।');
      void loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'পেজ তৈরি ব্যর্থ হয়েছে', true);
    }
  };

  const handleCreateNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createExtendedNotice(token, {
        notice_type: noticeType,
        title_bn: noticeTitleBn,
        content_bn: noticeContentBn,
        status: 'published',
      });
      setNoticeTitleBn('');
      setNoticeContentBn('');
      notify('বিশেষ বিজ্ঞপ্তি / পপআপ / টিকার প্রকাশিত হয়েছে।');
      void loadData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'নোটিশ প্রকাশ ব্যর্থ হয়েছে', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-700" />
              ওয়েবসাইট সিএমএস, ব্র্যান্ডিং ও হেডার/ফুটার কন্ট্রোল (সংস্করণ #{cmsVersion})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              হোমপেজ হিরো, জরুরি ঘোষণা বার, হেল্পলাইন, ফুটার কপিরাইট এবং রক্ষণাবেক্ষণ মোড সরাসরি নিয়ন্ত্রণ করুন।
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              অবস্থা: {cmsStatus === 'published' ? 'লাইভ প্রকাশিত' : 'ড্রাফট'}
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              title="রিফ্রেশ"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">সাইটের নাম (বাংলা)</label>
            <input
              type="text"
              value={String(cmsConfig.site_name_bn || '')}
              onChange={(e) => setCmsConfig({ ...cmsConfig, site_name_bn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">ট্যাগলাইন / সাবটাইটেল (বাংলা)</label>
            <input
              type="text"
              value={String(cmsConfig.tagline_bn || '')}
              onChange={(e) => setCmsConfig({ ...cmsConfig, tagline_bn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">হিরো শিরোনাম (বাংলা)</label>
            <input
              type="text"
              value={String(cmsConfig.hero_title_bn || '')}
              onChange={(e) => setCmsConfig({ ...cmsConfig, hero_title_bn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">জরুরি ঘোষণা টিকার (বাংলা)</label>
            <input
              type="text"
              value={String(cmsConfig.emergency_banner_bn || '')}
              onChange={(e) => setCmsConfig({ ...cmsConfig, emergency_banner_bn: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">হেল্পলাইন নম্বর</label>
            <input
              type="text"
              value={String(cmsConfig.helpline_phone || '')}
              onChange={(e) => setCmsConfig({ ...cmsConfig, helpline_phone: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">সংস্করণ নোট (ঐচ্ছিক)</label>
            <input
              type="text"
              placeholder="পরিবর্তনের সংক্ষিপ্ত কারণ লিখুন..."
              value={noteBn}
              onChange={(e) => setNoteBn(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-100">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={Boolean(cmsConfig.maintenance_mode)}
              onChange={(e) => setCmsConfig({ ...cmsConfig, maintenance_mode: e.target.checked })}
              className="rounded border-slate-300 text-emerald-700"
            />
            রক্ষণাবেক্ষণ মোড (Maintenance Banner) সক্রিয় করুন
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSaveCms('draft')}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
            >
              ড্রাফট সংরক্ষণ
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCms('published')}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
            >
              লাইভ প্রকাশ করুন
            </button>
          </div>
        </div>
      </div>

      {/* Visual Page Builder & Extended Notices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h4 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
            <LayoutTemplate className="w-4 h-4 text-emerald-700" />
            ভিজ্যুয়াল পেজ বিল্ডার (নিরাপদ কম্পোনেন্ট ব্লক)
          </h4>
          <form onSubmit={handleCreatePage} className="space-y-3 mb-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL স্লাগ (যেমন: citizen-guide)</label>
                <input
                  type="text"
                  required
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="citizen-guide"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">পাতার বাংলা শিরোনাম</label>
                <input
                  type="text"
                  required
                  value={newTitleBn}
                  onChange={(e) => setNewTitleBn(e.target.value)}
                  placeholder="নাগরিক সনদ নির্দেশিকা"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ব্লকের ধরন</label>
                <select
                  value={newBlockType}
                  onChange={(e) => setNewBlockType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="heading">শিরোনাম (Heading)</option>
                  <option value="paragraph">অনুচ্ছেদ (Paragraph)</option>
                  <option value="faq">প্রশ্নোত্তর (FAQ)</option>
                  <option value="banner">ব্যানার (Banner)</option>
                  <option value="cta">কল টু অ্যাকশন (CTA)</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">মেটা বিবরণ (SEO Description)</label>
                <input
                  type="text"
                  value={newMetaDesc}
                  onChange={(e) => setNewMetaDesc(e.target.value)}
                  placeholder="এসইও মেটা বিবরণ..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ব্লক কনটেন্ট (স্বয়ংক্রিয় XSS স্যানিটাইজড)</label>
              <textarea
                rows={2}
                required
                value={newBlockContentBn}
                onChange={(e) => setNewBlockContentBn(e.target.value)}
                placeholder="পাতার বিস্তারিত বিষয়বস্তু লিখুন..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
            >
              <Plus className="w-3.5 h-3.5" /> নতুন পেজ তৈরি ও প্রকাশ করুন
            </button>
          </form>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {pages.map((p) => (
              <div
                key={String(p.id)}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-800">{String(p.title_bn)}</div>
                  <div className="text-slate-500 font-mono">/pages/{String(p.slug)} • সংস্করণ #{String(p.version)}</div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                  {String(p.status)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Extended Notices & Revision History */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h4 className="text-base font-bold text-slate-900 mb-3">
              পপআপ নোটিশ, হেডলাইন টিকার ও জরুরি সতর্কবার্তা প্রকাশ
            </h4>
            <form onSubmit={handleCreateNotice} className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">নোটিশের ধরন</label>
                  <select
                    value={noticeType}
                    onChange={(e) =>
                      setNoticeType(e.target.value as 'popup' | 'ticker' | 'emergency' | 'scheduled')
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="ticker">হেডলাইন টিকার</option>
                    <option value="popup">হোমপেজ পপআপ</option>
                    <option value="emergency">জরুরি সতর্কবার্তা</option>
                    <option value="scheduled">নির্ধারিত বিজ্ঞপ্তি</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">নোটিশ শিরোনাম</label>
                  <input
                    type="text"
                    required
                    value={noticeTitleBn}
                    onChange={(e) => setNoticeTitleBn(e.target.value)}
                    placeholder="যেমন: সরকারি ছুটির দিনেও অনলাইন আবেদন খোলা"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>
              <textarea
                rows={2}
                required
                value={noticeContentBn}
                onChange={(e) => setNoticeContentBn(e.target.value)}
                placeholder="নোটিশের বিস্তারিত বিবরণ..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                নোটিশ প্রকাশ করুন
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-emerald-700" />
              সিএমএস সংস্করণ ইতিহাস ও রোলব্যাক ({revisions.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {revisions.slice(0, 6).map((rev) => (
                <div
                  key={String(rev.id)}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800">সংস্করণ #{String(rev.version)}</span> —{' '}
                    <span className="text-slate-600">{String(rev.note_bn || '')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRestoreRevision(String(rev.id))}
                    className="px-2.5 py-1 rounded bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100"
                  >
                    পুনরুদ্ধার
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnterpriseSeoAndAiStudioPanel: React.FC<EnterprisePanelProps> = ({
  userSession,
  hasPerm,
  notify,
}) => {
  const token = userSession.token || '';
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);
  const [proposals, setProposals] = useState<Array<Record<string, unknown>>>([]);
  const [drafts, setDrafts] = useState<Array<Record<string, unknown>>>([]);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [targetPath, setTargetPath] = useState('/');
  const [focusTopic, setFocusTopic] = useState('পাবনা সদর অনলাইন ওয়ারিশ ও নাগরিকত্ব সনদ সেবা');
  const [contentPrompt, setContentPrompt] = useState('অনলাইনে হোল্ডিং ট্যাক্স ও ট্রেড লাইসেন্স নবায়ন নির্দেশিকা');
  const [contentType, setContentType] = useState('notice');
  const [busy, setBusy] = useState(false);

  const loadSeoData = async () => {
    if (!token) return;
    try {
      const [seoRes, draftRes] = await Promise.all([
        api.getSeoOverview(token),
        hasPerm('website.cms.manage') || hasPerm('seo.edit')
          ? api.listAiContentDrafts(token)
          : Promise.resolve([]),
      ]);
      setAudits(seoRes.audits || []);
      setProposals(seoRes.proposals || []);
      setGeminiConfigured(seoRes.gemini_configured);
      setDrafts(draftRes || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'এসইও স্টুডিও লোড ব্যর্থ হয়েছে', true);
    }
  };

  useEffect(() => {
    void loadSeoData();
  }, [token]);

  const handleRunAudit = async () => {
    setBusy(true);
    try {
      const res = await api.runSeoAudit(token);
      notify(`এসইও অডিট সম্পন্ন! স্কোর: ${String(res.score)}/১০০ (${String(res.pages_crawled)}টি পাতা যাচাইকৃত)`);
      void loadSeoData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'এসইও অডিট ব্যর্থ হয়েছে', true);
    } finally {
      setBusy(false);
    }
  };

  const handleProposeSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.proposeAiSeo(token, { target_path: targetPath, focus_topic: focusTopic });
      notify('AI SEO মেটাডেটা ও JSON-LD প্রস্তাবনা তৈরি হয়েছে (সুপারভাইজার অনুমোদনের অপেক্ষায়)।');
      void loadSeoData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI SEO প্রস্তাবনা ব্যর্থ হয়েছে', true);
    } finally {
      setBusy(false);
    }
  };

  const handleDecideProposal = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      await api.decideSeoProposal(token, id, decision);
      notify(
        decision === 'approved'
          ? 'এসইও প্রস্তাবনা অনুমোদিত ও লাইভ প্রকাশিত হয়েছে।'
          : 'এসইও প্রস্তাবনা প্রত্যাখ্যাত হয়েছে।'
      );
      void loadSeoData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'সিদ্ধান্ত সংরক্ষণ ব্যর্থ হয়েছে', true);
    }
  };

  const handleGenerateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.generateAiContentDraft(token, { content_type: contentType, prompt: contentPrompt });
      notify('দ্বিভাষিক AI কনটেন্ট ড্রাফট প্রস্তুত হয়েছে।');
      void loadSeoData();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI কনটেন্ট জেনারেশন ব্যর্থ হয়েছে', true);
    } finally {
      setBusy(false);
    }
  };

  const latestAudit = audits[0];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-700" />
              AI SEO স্টুডিও, টেকনিক্যাল ক্রলার ও JSON-LD স্কিমা ইঞ্জিন
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              পাবলিক পাতার রিয়েল-টাইম এসইও অডিট, বাংলা ও ইংরেজি মেটা অপ্টিমাইজেশন এবং সুপারভাইজার অনুমোদিত প্রকাশনা।
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/robots.txt"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              /robots.txt
            </a>
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              /sitemap.xml
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRunAudit()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" /> এখনই এসইও অডিট চালান
            </button>
          </div>
        </div>

        {latestAudit && (
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-emerald-900">
                সর্বশেষ অডিট স্কোর: <span className="text-lg">{String(latestAudit.score)}/100</span>
              </div>
              <div className="text-xs text-emerald-800">
                যাচাইকৃত পাবলিক পাতা: {String(latestAudit.pages_crawled)}টি • শনাক্তকৃত সমস্যা:{' '}
                {String(latestAudit.issues_count)}টি
              </div>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-white text-emerald-800 border border-emerald-300">
              AI ইঞ্জিন: {geminiConfigured ? 'Gemini Server SDK Active' : 'Verified Policy Engine Active'}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleProposeSeo} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-emerald-700" /> নতুন AI SEO মেটাডেটা ও স্কিমা প্রস্তাবনা
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">টার্গেট পাবলিক পাথ</label>
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="/ অথবা /services"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">ফোকাস সার্ভিস / কীওয়ার্ড টপিক</label>
              <input
                type="text"
                value={focusTopic}
                onChange={(e) => setFocusTopic(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              AI SEO প্রস্তাবনা তৈরি করুন
            </button>
          </form>

          <form onSubmit={handleGenerateContent} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-700" /> AI কনটেন্ট ও নোটিশ ড্রাফট স্টুডিও
            </h4>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">কনটেন্টের ধরন</label>
              <select
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="notice">জনস্বার্থে সরকারি বিজ্ঞপ্তি</option>
                <option value="faq">নাগরিক জিজ্ঞাসা ও উত্তর (FAQ)</option>
                <option value="service_guide">সেবা প্রাপ্তির নির্দেশিকা</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">বিষয়বস্তু নির্দেশনা</label>
              <input
                type="text"
                value={contentPrompt}
                onChange={(e) => setContentPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
            >
              দ্বিভাষিক খসড়া তৈরি করুন
            </button>
          </form>
        </div>

        {/* SEO Proposals Approval Queue */}
        <div className="mt-6">
          <h4 className="text-sm font-bold text-slate-900 mb-3">
            AI SEO প্রস্তাবনা ও সুপারভাইজার অনুমোদন তালিকা ({proposals.length})
          </h4>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {proposals.map((prop) => (
              <div
                key={String(prop.id)}
                className="p-4 rounded-xl border border-slate-200 bg-white flex flex-wrap items-start justify-between gap-4 text-xs"
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                      {String(prop.target_path)}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold ${
                        prop.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : prop.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {String(prop.status)}
                    </span>
                  </div>
                  <div className="font-bold text-slate-900">{String(prop.proposed_title_bn)}</div>
                  <div className="text-slate-600">{String(prop.proposed_description_bn)}</div>
                </div>
                {hasPerm('seo.publish') && prop.status === 'pending_approval' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDecideProposal(String(prop.id), 'approved')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-800"
                    >
                      অনুমোদন ও প্রকাশ
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDecideProposal(String(prop.id), 'rejected')}
                      className="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 font-bold hover:bg-rose-50"
                    >
                      বাতিল
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* AI Content Drafts */}
        {drafts.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-900 mb-3">AI কনটেন্ট খসড়া তালিকা ({drafts.length})</h4>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {drafts.map((d) => (
                <div
                  key={String(d.id)}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900">{String(d.title_bn)}</div>
                    <div className="text-slate-600 mt-0.5">{String(d.body_bn)}</div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 shrink-0">
                    {String(d.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const EnterpriseIntegrationsAndCertDesignPanel: React.FC<EnterprisePanelProps> = ({
  userSession,
  hasPerm,
  notify,
}) => {
  const token = userSession.token || '';
  const [providers, setProviders] = useState<Array<Record<string, unknown>>>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<Array<Record<string, unknown>>>([]);
  const [certDesign, setCertDesign] = useState<Record<string, unknown>>({});
  const [certVersion, setCertVersion] = useState('');
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [confirmLiveMap, setConfirmLiveMap] = useState<Record<string, boolean>>({});

  const loadAll = async () => {
    if (!token) return;
    try {
      const [intRes, certRes] = await Promise.all([
        api.getIntegrationsOverview(token),
        api.getCertificateDesignConfig(),
      ]);
      setProviders(intRes.providers || []);
      setDeliveryLogs(intRes.delivery_logs || []);
      setCertDesign(certRes.config || {});
      setCertVersion(certRes.version_tag || '');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ইন্টিগ্রেশন তথ্য লোড ব্যর্থ হয়েছে', true);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [token]);

  const handleSaveProvider = async (prv: Record<string, unknown>, targetMode?: 'sandbox' | 'live') => {
    const key = String(prv.provider_key);
    const mode = targetMode || (String(prv.mode) as 'sandbox' | 'live');
    try {
      await api.updateIntegrationProvider(token, key, {
        mode,
        confirm_live: Boolean(confirmLiveMap[key]),
        is_enabled: true,
        secret: secretInputs[key] || undefined,
      });
      setSecretInputs({ ...secretInputs, [key]: '' });
      notify(`${String(prv.name_bn)} কনফিগারেশন সফলভাবে সংরক্ষিত ও এনক্রিপ্ট করা হয়েছে।`);
      void loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ইন্টিগ্রেশন আপডেট ব্যর্থ হয়েছে', true);
    }
  };

  const handleTestProvider = async (key: string) => {
    try {
      const res = await api.testIntegrationProvider(token, {
        provider_key: key,
        recipient: 'supervisor@pottoyon.gov.bd',
      });
      notify(String(res.message_bn || 'সংযোগ পরীক্ষা সফল হয়েছে'));
      void loadAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'সংযোগ পরীক্ষা ব্যর্থ হয়েছে', true);
    }
  };

  const handleSaveCertDesign = async () => {
    try {
      const res = await api.updateCertificateDesignConfig(token, {
        config: certDesign,
      });
      setCertVersion(res.version_tag);
      notify(`সরকারি A4 সনদ টেমপ্লেট কনফিগারেশন (${res.version_tag}) সংরক্ষিত হয়েছে।`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'সনদ ডিজাইন আপডেট ব্যর্থ হয়েছে', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-1">
          <KeyRound className="w-5 h-5 text-emerald-700" />
          পেমেন্ট গেটওয়ে, SMTP ইমেইল, SMS ও OTP ইন্টিগ্রেশন কন্ট্রোল সেন্টার
        </h3>
        <p className="text-xs text-slate-500 mb-5">
          সকল API কী AES-256-GCM দ্বারা এনক্রিপ্টেড থাকে এবং ইন্টারফেসে মাস্কড (`••••••••`) অবস্থায় প্রদর্শিত হয়। ক্রেডেনশিয়াল ছাড়া কোনো সার্ভিস সংযুক্ত দেখানো হয় না।
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {providers.map((prv) => {
            const key = String(prv.provider_key);
            const configured = Boolean(prv.is_configured);
            return (
              <div
                key={key}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-900">{String(prv.name_bn)}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {String(prv.category).toUpperCase()} • {key}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      configured
                        ? prv.mode === 'live'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-sky-100 text-sky-800 border border-sky-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {String(prv.status_label)}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="text-xs text-slate-600">
                    সংরক্ষিত সিক্রেট কী:{' '}
                    <span className="font-mono font-bold text-slate-800">
                      {prv.masked_secret ? String(prv.masked_secret) : 'কনফিগার করা হয়নি (Not Configured)'}
                    </span>
                  </div>
                  {hasPerm('integrations.manage') && (
                    <>
                      <input
                        type="password"
                        value={secretInputs[key] || ''}
                        onChange={(e) => setSecretInputs({ ...secretInputs, [key]: e.target.value })}
                        placeholder="নতুন API Secret / SMTP Password দিন..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={Boolean(confirmLiveMap[key])}
                            onChange={(e) =>
                              setConfirmLiveMap({ ...confirmLiveMap, [key]: e.target.checked })
                            }
                            className="rounded border-slate-300"
                          />
                          লাইভ প্রোডাকশন মোড নিশ্চিতকরণ
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleSaveProvider(prv, 'sandbox')}
                            className="px-2.5 py-1 rounded bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                          >
                            সংরক্ষণ
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleTestProvider(key)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-600 text-emerald-700 text-xs font-bold hover:bg-emerald-50"
                          >
                            <Send className="w-3 h-3" /> টেস্ট
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {deliveryLogs.length > 0 && (
          <div className="mt-6 pt-5 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-emerald-700" /> সাম্প্রতিক সংযোগ ও ডেলিভারি লগ
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {deliveryLogs.slice(0, 8).map((log) => (
                <div
                  key={String(log.id)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <span>
                    <strong className="font-mono">{String(log.provider_key)}</strong> → {String(log.recipient)} ({String(log.response_detail)})
                  </span>
                  <span className="text-emerald-700 font-bold">{String(log.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Certificate Design Center */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-emerald-700" />
              সরকারি A4 সনদ টেমপ্লেট ডিজাইন সেন্টার ({certVersion})
            </h3>
            <p className="text-xs text-slate-500">
              সকল সনদে একক ঐতিহ্যবাহী বাংলা সরকারি A4 পোর্ট্রেট লেআউট, ডাবল কালো বর্ডার, জলছাপ ও QR যাচাইকরণ ফুটার সংরক্ষিত।
            </p>
          </div>
          {hasPerm('settings.manage') && (
            <button
              type="button"
              onClick={() => void handleSaveCertDesign()}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
            >
              লেআউট কনফিগারেশন সংরক্ষণ
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">পৃষ্ঠার মাপ ও ওরিয়েন্টেশন</label>
            <input
              type="text"
              disabled
              value="A4 Portrait (Double Black Border)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-slate-600"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">জলছাপ অপাসিটি (Watermark Opacity)</label>
            <input
              type="number"
              step="0.01"
              min="0.04"
              max="0.25"
              value={Number(certDesign.watermark_opacity ?? 0.08)}
              onChange={(e) =>
                setCertDesign({ ...certDesign, watermark_opacity: parseFloat(e.target.value) || 0.08 })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">সরকারি মনোগ্রাম মাপ (px)</label>
            <input
              type="number"
              min="48"
              max="96"
              value={Number(certDesign.seal_size_px ?? 68)}
              onChange={(e) =>
                setCertDesign({ ...certDesign, seal_size_px: parseInt(e.target.value, 10) || 68 })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">QR কোড মাপ (px, নিচে বামে)</label>
            <input
              type="number"
              min="70"
              max="120"
              value={Number(certDesign.qr_size_px ?? 88)}
              onChange={(e) =>
                setCertDesign({ ...certDesign, qr_size_px: parseInt(e.target.value, 10) || 88 })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnterpriseSecurityAndBackupsPanel: React.FC<EnterprisePanelProps> = ({
  userSession,
  hasPerm,
  notify,
}) => {
  const token = userSession.token || '';
  const [ipRules, setIpRules] = useState<Array<Record<string, unknown>>>([]);
  const [phoneRules, setPhoneRules] = useState<Array<Record<string, unknown>>>([]);
  const [activeSessions, setActiveSessions] = useState<Array<Record<string, unknown>>>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  const [backups, setBackups] = useState<Array<Record<string, unknown>>>([]);

  const [ipInput, setIpInput] = useState('');
  const [ipRuleType, setIpRuleType] = useState<'block' | 'allow'>('block');
  const [ipReason, setIpReason] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneReason, setPhoneReason] = useState('');

  const loadSecurityAndHealth = async () => {
    if (!token) return;
    try {
      const [secRes, healthRes] = await Promise.all([
        api.getSecurityOverview(token),
        api.getSystemHealthOverview(token),
      ]);
      setIpRules(secRes.ip_rules || []);
      setPhoneRules(secRes.phone_rules || []);
      setActiveSessions(secRes.active_sessions || []);
      setHealth(healthRes || {});
      setBackups((healthRes.backups as Array<Record<string, unknown>>) || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'নিরাপত্তা ও ব্যাকআপ তথ্য লোড ব্যর্থ হয়েছে', true);
    }
  };

  useEffect(() => {
    void loadSecurityAndHealth();
  }, [token]);

  const handleAddIpRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createIpRule(token, {
        ip_or_cidr: ipInput,
        rule_type: ipRuleType,
        reason_bn: ipReason,
        duration_minutes: 60,
      });
      setIpInput('');
      setIpReason('');
      notify('আইপি নিরাপত্তা রুল সফলভাবে যুক্ত হয়েছে।');
      void loadSecurityAndHealth();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'আইপি রুল যোগ ব্যর্থ হয়েছে', true);
    }
  };

  const handleAddPhoneRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPhoneRule(token, {
        mobile: phoneInput,
        reason_bn: phoneReason,
        duration_minutes: 120,
      });
      setPhoneInput('');
      setPhoneReason('');
      notify('মোবাইল নম্বর সীমাবদ্ধতা রুল যুক্ত হয়েছে।');
      void loadSecurityAndHealth();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ফোন রুল যোগ ব্যর্থ হয়েছে', true);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const bkp = await api.createSystemBackup(token);
      notify(`নতুন এনক্রিপ্টেড ব্যাকআপ (${String(bkp.id)}) তৈরি হয়েছে। রিস্টোরের পূর্বে Verify করুন।`);
      void loadSecurityAndHealth();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ব্যাকআপ তৈরি ব্যর্থ হয়েছে', true);
    }
  };

  const handleVerifyBackup = async (id: string) => {
    try {
      await api.verifySystemBackup(token, id);
      notify('ব্যাকআপ SHA-256 চেকসাম যাচাই (Verified) সফল হয়েছে!');
      void loadSecurityAndHealth();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ব্যাকআপ যাচাই ব্যর্থ হয়েছে', true);
    }
  };

  const handleRestoreBackup = async (id: string) => {
    try {
      const res = await api.restoreSystemBackup(token, id);
      notify(String(res.message_bn || 'রিস্টোর সফল হয়েছে'));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'রিস্টোর ব্যর্থ হয়েছে', true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* IP & Phone Firewall Controls */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            সিকিউরিটি অপারেশনস সেন্টার (SOC): আইপি ও ফোন সীমাবদ্ধতা
          </h3>

          <form onSubmit={handleAddIpRule} className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-bold text-slate-800">সাময়িক আইপি ব্লক / অ্যালাউলিস্ট রুল</div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                required
                value={ipInput}
                onChange={(e) => setIpInput(e.target.value)}
                placeholder="IP (যেমন: 203.0.113.5)"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              />
              <select
                value={ipRuleType}
                onChange={(e) => setIpRuleType(e.target.value as 'block' | 'allow')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              >
                <option value="block">সাময়িক ব্লক (Block)</option>
                <option value="allow">নিরাপদ তালিকা (Allowlist)</option>
              </select>
              <input
                type="text"
                required
                value={ipReason}
                onChange={(e) => setIpReason(e.target.value)}
                placeholder="কারণ লিখুন..."
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
            >
              আইপি রুল যুক্ত করুন
            </button>
          </form>

          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {ipRules
              .filter((r) => Number(r.is_active) === 1)
              .map((r) => (
                <div
                  key={String(r.id)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold">{String(r.ip_or_cidr)}</span> •{' '}
                    <span className={r.rule_type === 'allow' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                      {String(r.rule_type).toUpperCase()}
                    </span>{' '}
                    — {String(r.reason_bn)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void api.removeIpRule(token, String(r.id)).then(loadSecurityAndHealth)}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>

          <form onSubmit={handleAddPhoneRule} className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-bold text-slate-800">মোবাইল নম্বর স্প্যাম/অপব্যবহার সীমাবদ্ধতা</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="মোবাইল নম্বর (017...)"
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              />
              <input
                type="text"
                required
                value={phoneReason}
                onChange={(e) => setPhoneReason(e.target.value)}
                placeholder="সীমাবদ্ধতার কারণ..."
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-rose-700 text-white text-xs font-bold hover:bg-rose-800"
            >
              নম্বর সীমাবদ্ধ করুন
            </button>
          </form>

          {phoneRules.filter((r) => Number(r.is_active) === 1).length > 0 && (
            <div className="space-y-1.5 max-h-28 overflow-y-auto">
              {phoneRules
                .filter((r) => Number(r.is_active) === 1)
                .map((r) => (
                  <div
                    key={String(r.id)}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-xs"
                  >
                    <span>
                      <strong>{String(r.mobile)}</strong> — {String(r.reason_bn)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void api.removePhoneRule(token, String(r.id)).then(loadSecurityAndHealth)}
                      className="text-rose-700 font-bold"
                    >
                      প্রত্যাহার
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* System Health & Verified Backups */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-700" />
                সিস্টেম হেলথ ও যাচাইকৃত ডিজাস্টার রিকভারি ব্যাকআপ
              </h3>
              <p className="text-xs text-slate-500">
                চেকসাম যাচাই (Verified) ছাড়া কোনো ব্যাকআপ থেকে রিস্টোর অনুমোদিত নয়।
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCreateBackup()}
              className="px-3.5 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
            >
              + নতুন এনক্রিপ্টেড ব্যাকআপ
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-slate-600">ডাটাবেস ও স্টোরেজ</div>
              <div className="font-bold text-emerald-900">{String(health.database_health || 'Healthy')}</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-slate-600">SSL ও PDF ইঞ্জিন</div>
              <div className="font-bold text-emerald-900">{String(health.pdf_engine_health || 'Healthy')}</div>
            </div>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {backups.map((b) => {
              const verified = Boolean(b.verified);
              return (
                <div
                  key={String(b.id)}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{String(b.id)}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] ${
                          verified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {verified ? 'Verified Recovery Point' : 'Unverified'}
                      </span>
                    </div>
                    <div className="text-slate-500 font-mono text-[11px]">
                      SHA-256: {String(b.checksum_sha256).slice(0, 20)}... ({String(b.size_bytes)} bytes)
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!verified && (
                      <button
                        type="button"
                        onClick={() => void handleVerifyBackup(String(b.id))}
                        className="px-2.5 py-1 rounded bg-sky-700 text-white font-bold hover:bg-sky-800"
                      >
                        Verify Checksum
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleRestoreBackup(String(b.id))}
                      className={`px-2.5 py-1 rounded font-bold ${
                        verified
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      রিস্টোর টেস্ট
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Sessions */}
          <div className="pt-3 border-t border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-2">
              সক্রিয় সেশন পর্যবেক্ষণ ({activeSessions.length})
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {activeSessions.slice(0, 6).map((s) => (
                <div
                  key={String(s.id)}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                >
                  <span>
                    <strong>{String(s.role_slug)}</strong> ({String(s.user_id)}) • IP: {String(s.ip_address || 'local')}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void api.terminateSecuritySession(token, String(s.id)).then(() => {
                        notify('সেশনটি তাৎক্ষণিকভাবে বাতিল করা হয়েছে।');
                        void loadSecurityAndHealth();
                      })
                    }
                    className="text-rose-700 font-bold hover:underline"
                  >
                    টার্মিনেট
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EnterpriseDeveloperAiDebugPanel: React.FC<EnterprisePanelProps> = ({
  userSession,
  notify,
}) => {
  const token = userSession.token || '';
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [patches, setPatches] = useState<Array<Record<string, unknown>>>([]);
  const [rawErrorInput, setRawErrorInput] = useState(
    'TypeError: Cannot read properties of undefined (reading "certificate_no") at /server/certificateService.ts:142 mobile=01712345678 nid=1997123456789'
  );
  const [busy, setBusy] = useState(false);

  const loadDevLogs = async () => {
    if (!token) return;
    try {
      const res = await api.getDeveloperErrorLogs(token);
      setLogs(res.logs || []);
      setPatches(res.patches || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ডেভেলপার লগ লোড ব্যর্থ হয়েছে', true);
    }
  };

  useEffect(() => {
    void loadDevLogs();
  }, [token]);

  const handleRunAiDebug = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.runDeveloperAiDebug(token, { log_message: rawErrorInput });
      notify('AI রুট-কজ বিশ্লেষণ ও নিরাপদ কোড প্যাচ প্রস্তাবনা তৈরি হয়েছে (PII ও সিক্রেট স্বয়ংক্রিয়ভাবে রিড্যাক্টেড)।');
      void loadDevLogs();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI ডিবাগ বিশ্লেষণ ব্যর্থ হয়েছে', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-700" />
          ডেভেলপার AI ডিবাগ ও কোড অ্যাসিস্ট্যান্ট (PII & Secret Sanitized)
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          এরর লগ বিশ্লেষণের পূর্বে মোবাইল নম্বর, এনআইডি ও API টোকেন স্বয়ংক্রিয়ভাবে রিড্যাক্ট করা হয়। AI কখনোই সরাসরি প্রোডাকশনে কোড রান করে না।
        </p>
      </div>

      <form onSubmit={handleRunAiDebug} className="space-y-3">
        <label className="block text-xs font-bold text-slate-700">
          বিশ্লেষণের জন্য এরর লগ / স্ট্যাক ট্রেস পেস্ট করুন
        </label>
        <textarea
          rows={3}
          value={rawErrorInput}
          onChange={(e) => setRawErrorInput(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs bg-slate-900 text-emerald-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 disabled:opacity-50"
        >
          <Code2 className="w-4 h-4" /> AI রুট-কজ ও নিরাপদ প্যাচ বিশ্লেষণ চালান
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">সাম্প্রতিক স্যানিটাইজড এরর লগ ({logs.length})</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.map((l) => (
              <div key={String(l.id)} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>{String(l.component)}</span>
                  <span className="text-amber-700 uppercase">{String(l.severity)}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 mt-1">{String(l.sanitized_message)}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">
            প্রস্তাবিত AI কোড প্যাচ ও টেস্ট কেস ({patches.length})
          </h4>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {patches.map((p) => (
              <div key={String(p.id)} className="p-3.5 rounded-xl bg-slate-900 text-slate-100 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400">{String(p.root_cause_bn)}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px]">
                    Review Required • Risk: {String(p.regression_risk)}
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{String(p.explanation_bn)}</p>
                <pre className="p-2 rounded bg-black/50 text-emerald-300 font-mono text-[10px] overflow-x-auto">
                  {String(p.proposed_diff)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
