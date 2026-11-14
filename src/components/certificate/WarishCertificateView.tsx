import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Printer,
  Download,
  CheckCircle,
  Share2,
  ArrowLeft,
  Ban,
  Clock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileText,
  Eye,
  Check,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { Certificate, AdministrativeUnit } from '../../types';
import { BangladeshEmblem } from '../common/BangladeshEmblem';
import { api } from '../../services/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBengaliDigits(val: string | number | undefined | null): string {
  return String(val ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] || d);
}

function formatShortOfficerTitle(rawTitleBn: string): string {
  const clean = String(rawTitleBn || '').trim();
  if (!clean) return 'প্রশাসক';
  return clean.split(',')[0].trim() || clean;
}

function normalizeAddressForDisplay(
  rawAddr: string,
  unitNameBn: string,
  upazilaBn = 'পাবনা সদর',
  districtBn = 'পাবনা'
): string {
  let cleaned = String(rawAddr || '')
    .replace(/^(স্থায়ী ঠিকানা|বর্তমান ঠিকানা)\s*[:ঃ-]*\s*/u, '')
    .trim();
  if (!cleaned) {
    cleaned = `গ্রাম/বাড়ীঃ ${unitNameBn.replace(/\s*ইউনিয়ন পরিষদ$/, '')}, ডাকঘরঃ ${upazilaBn} - ৬৬০০, ওয়ার্ড নম্বরঃ ৪, ${unitNameBn}, থানাঃ ${upazilaBn}, উপজেলাঃ ${upazilaBn}, জেলাঃ ${districtBn}।`;
  }
  if (!cleaned.endsWith('।')) {
    cleaned += '।';
  }
  return cleaned;
}

interface WarishCertificateViewProps {
  certificate: Certificate;
  institution?: AdministrativeUnit;
  authToken?: string;
  trackingNo?: string;
  onBack?: () => void;
  onOpenPrintRoute?: (cert: Certificate, trackingNo?: string) => void;
  isModalContext?: boolean;
  isDedicatedPrintRoute?: boolean;
  autoPrint?: boolean;
  lang?: 'bn' | 'en';
}

export const WarishCertificateView: React.FC<WarishCertificateViewProps> = ({
  certificate,
  institution,
  authToken,
  trackingNo,
  onBack,
  onOpenPrintRoute,
  isModalContext = false,
  isDedicatedPrintRoute = false,
  autoPrint = false,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerWrapRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const loadingTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);

  const canAccessServerPdf = Boolean(authToken || trackingNo || certificate.application_tracking_no);
  const effectiveTracking = trackingNo || certificate.application_tracking_no;

  const [previewMode, setPreviewMode] = useState<'a4' | 'pdf'>('a4');
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string>('');
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [containerWidth, setContainerWidth] = useState<number>(794);

  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string>('');

  const handlePrint = () => {
    if (!isDedicatedPrintRoute && onOpenPrintRoute) {
      onOpenPrintRoute(certificate, effectiveTracking);
      return;
    }
    if (isModalContext) {
      document.body.classList.add('printing-certificate-modal');
    }
    const cleanup = () => {
      document.body.classList.remove('printing-certificate-modal');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  };

  useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        if (isModalContext) {
          document.body.classList.add('printing-certificate-modal');
        }
        const cleanup = () => {
          document.body.classList.remove('printing-certificate-modal');
          window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        window.print();
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [autoPrint, isModalContext]);

  useEffect(() => {
    const updateWidth = () => {
      if (viewerWrapRef.current) {
        const w = viewerWrapRef.current.clientWidth;
        if (w > 120) setContainerWidth(w - 24);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [previewMode, isFullscreen]);

  const loadGeneratedPdf = useCallback(async () => {
    if (previewMode !== 'pdf' || !canAccessServerPdf || isDedicatedPrintRoute) return;
    setPdfLoading(true);
    setPdfError('');
    try {
      const { bytes } = await api.fetchCertificatePdfBlob(certificate.id, {
        authToken,
        trackingNo: effectiveTracking,
        inline: true,
        orientation: pdfOrientation,
      });
      if (loadingTaskRef.current) {
        await loadingTaskRef.current.destroy().catch(() => {});
        loadingTaskRef.current = null;
      }
      const loadingTask = pdfjsLib.getDocument({ data: bytes });
      loadingTaskRef.current = loadingTask;
      const loadedDoc = await loadingTask.promise;
      setPdfDoc(loadedDoc);
      setNumPages(loadedDoc.numPages);
      setPageNumber(1);
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : 'PDF লোড ব্যর্থ হয়েছে।');
      setPdfDoc(null);
      setNumPages(0);
    } finally {
      setPdfLoading(false);
    }
  }, [
    previewMode,
    canAccessServerPdf,
    isDedicatedPrintRoute,
    certificate.id,
    authToken,
    effectiveTracking,
    pdfOrientation,
  ]);

  useEffect(() => {
    void loadGeneratedPdf();
  }, [loadGeneratedPdf]);

  useEffect(() => {
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (loadingTaskRef.current) {
        loadingTaskRef.current.destroy().catch(() => {});
        loadingTaskRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (previewMode !== 'pdf' || !pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        const safePage = Math.min(Math.max(1, pageNumber), pdfDoc.numPages);
        const page = await pdfDoc.getPage(safePage);
        if (cancelled || !canvasRef.current) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const maxDisplayWidth = Math.min(containerWidth, pdfOrientation === 'landscape' ? 1020 : 794);
        const fitScale = Math.max(0.45, maxDisplayWidth / baseViewport.width);
        const displayScale = fitScale * (zoom / 100);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        const cssViewport = page.getViewport({ scale: displayScale });
        const outputViewport = page.getViewport({ scale: displayScale * dpr });

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(outputViewport.width);
        canvas.height = Math.floor(outputViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport: outputViewport,
          canvas,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        renderTaskRef.current = null;
      } catch (err: unknown) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name !== 'RenderingCancelledException') {
          setPdfError('PDF পৃষ্ঠা রেন্ডার করতে সমস্যা হয়েছে।');
        }
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [previewMode, pdfDoc, pageNumber, zoom, containerWidth, pdfOrientation]);

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    setDownloadError('');
    try {
      const { blob, filename } = await api.fetchCertificatePdfBlob(certificate.id, {
        authToken,
        trackingNo: effectiveTracking,
        orientation: pdfOrientation,
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'PDF ডাউনলোড করা যায়নি।');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const hasShareableVerifyUrl = Boolean(
    certificate.verification_url && !certificate.verification_url.includes('[protected-token]')
  );

  const handleCopyLink = () => {
    if (!hasShareableVerifyUrl) return;
    navigator.clipboard?.writeText(certificate.verification_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unitNameBn = certificate.issuing_unit_bn || institution?.name_bn || 'গোয়েশপুর ইউনিয়ন পরিষদ';
  const upazilaBn = institution?.upazila_bn || 'পাবনা সদর';
  const districtBn = institution?.district_bn || 'পাবনা';
  const upazilaDistrictBn = `${upazilaBn}, ${districtBn}, বাংলাদেশ`;
  const certNo = certificate.certificate_number || certificate.certificate_no;
  const certNoBn = toBengaliDigits(certNo);
  const cleanTitleBn = String(certificate.certificate_title_bn || 'পারিবারিক সনদ').replace(
    /সনদপত্র$/,
    'সনদ'
  );
  const permAddress = normalizeAddressForDisplay(
    certificate.permanent_address_bn,
    unitNameBn,
    upazilaBn,
    districtBn
  );
  const presAddress = normalizeAddressForDisplay(
    certificate.present_address_bn,
    unitNameBn,
    upazilaBn,
    districtBn
  );
  const hasHeirs = Boolean(certificate.heirs && certificate.heirs.length > 0);
  const shortOfficerTitleBn = formatShortOfficerTitle(certificate.officer_title_bn);

  return (
    <div
      className={`certificate-print-shell ${
        isFullscreen
          ? 'fixed inset-0 z-[100] bg-slate-900/95 overflow-y-auto p-3 sm:p-6'
          : isModalContext
          ? 'bg-slate-100 p-3 sm:p-6 min-h-full'
          : 'py-6 px-3 sm:px-6 bg-slate-100 min-h-screen'
      }`}
    >
      {/* Dedicated Preview Action Toolbar (Completely Hidden on Print) */}
      <div className="max-w-5xl mx-auto mb-5 no-print bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{isModalContext ? 'বন্ধ করুন' : 'পূর্ববর্তী পাতা'}</span>
              </button>
            )}

            {certificate.status === 'valid' && (
              <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-800 px-3 py-1.5 rounded-lg">
                <CheckCircle className="w-4 h-4 text-emerald-700" />
                <span>বৈধ ডিজিটাল সনদ (VALID)</span>
              </span>
            )}
            {certificate.status === 'revoked' && (
              <span className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-800 px-3 py-1.5 rounded-lg">
                <Ban className="w-4 h-4 text-red-700" />
                <span>বাতিলকৃত সনদ (REVOKED)</span>
              </span>
            )}
            {certificate.status === 'expired' && (
              <span className="flex items-center gap-1 text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg">
                <Clock className="w-4 h-4 text-amber-700" />
                <span>মেয়াদোত্তীর্ণ সনদ (EXPIRED)</span>
              </span>
            )}

            <span className="text-xs text-slate-700 font-bold tabular-nums">
              সনদ নং:- {certNoBn}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isDedicatedPrintRoute && canAccessServerPdf && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPreviewMode('a4')}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                    previewMode === 'a4' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>A4 প্রিভিউ</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('pdf')}
                  className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                    previewMode === 'pdf' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF ভিউয়ার</span>
                </button>
              </div>
            )}

            {!isDedicatedPrintRoute && previewMode === 'pdf' && canAccessServerPdf && (
              <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setPdfOrientation('portrait')}
                  className={`px-2 py-1 rounded transition-colors ${
                    pdfOrientation === 'portrait' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  পোর্ট্রেট
                </button>
                <button
                  type="button"
                  onClick={() => setPdfOrientation('landscape')}
                  className={`px-2 py-1 rounded transition-colors ${
                    pdfOrientation === 'landscape' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  ল্যান্ডস্কেপ
                </button>
              </div>
            )}

            {!isDedicatedPrintRoute && (
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(60, z - 15))}
                  className="p-1 hover:bg-white rounded text-slate-700"
                  title="জুম কমান"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(100)}
                  className="px-1.5 font-bold text-slate-700 tabular-nums hover:text-slate-950"
                  title="স্বাভাবিক আকার (১০০%)"
                >
                  {zoom}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(180, z + 15))}
                  className="p-1 hover:bg-white rounded text-slate-700"
                  title="জুম বাড়ান"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isDedicatedPrintRoute && previewMode === 'pdf' && numPages > 0 && (
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold">
                <button
                  type="button"
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="p-1 rounded hover:bg-white disabled:opacity-40 text-slate-700"
                  title="পূর্ববর্তী পৃষ্ঠা"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 font-mono text-slate-700 tabular-nums">
                  পৃষ্ঠা {pageNumber} / {numPages}
                </span>
                <button
                  type="button"
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                  className="p-1 rounded hover:bg-white disabled:opacity-40 text-slate-700"
                  title="পরবর্তী পৃষ্ঠা"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isDedicatedPrintRoute && (
              <button
                type="button"
                onClick={() => setIsFullscreen((f) => !f)}
                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-2 rounded-lg transition-colors"
                title="পূর্ণ স্ক্রিন"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{isFullscreen ? 'স্বাভাবিক' : 'পূর্ণ স্ক্রিন'}</span>
              </button>
            )}

            {!isDedicatedPrintRoute && hasShareableVerifyUrl && (
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copied ? 'কপি হয়েছে' : 'লিংক কপি'}</span>
              </button>
            )}

            {canAccessServerPdf && (
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
                className="flex items-center gap-1.5 bg-[#064E32] hover:bg-[#08783F] disabled:opacity-60 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingPdf ? 'ডাউনলোড হচ্ছে...' : 'PDF ডাউনলোড'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>শুধুমাত্র সনদ প্রিন্ট</span>
            </button>
          </div>
        </div>

        {downloadError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{downloadError}</span>
          </div>
        )}
      </div>

      {/* Mode 1: Actual Generated PDF High-DPI Canvas Viewer (pdfjs-dist) */}
      {previewMode === 'pdf' && !isDedicatedPrintRoute && (
        <div
          ref={viewerWrapRef}
          className="max-w-5xl mx-auto no-print bg-slate-200/80 rounded-xl border border-slate-300 shadow-xl overflow-auto p-3 sm:p-5"
        >
          {pdfLoading ? (
            <div className="h-[620px] bg-white rounded-lg flex flex-col items-center justify-center gap-3 text-slate-600 text-xs font-semibold">
              <div className="w-10 h-10 border-4 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
              <span>অফিসিয়াল জেনারেটেড A4 PDF লোড হচ্ছে...</span>
            </div>
          ) : pdfError ? (
            <div className="p-10 bg-white rounded-lg text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800">{pdfError}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadGeneratedPdf()}
                  className="bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-lg inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>পুনরায় চেষ্টা করুন</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('a4')}
                  className="bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg"
                >
                  A4 প্রিভিউতে যান
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center min-w-fit">
              <canvas
                ref={canvasRef}
                aria-label={`Official Certificate PDF Page ${pageNumber}`}
                className="bg-white shadow-2xl border border-slate-300 rounded-xs block"
              />
            </div>
          )}
        </div>
      )}

      {/* Mode 2 (and ALWAYS used as the clean Printable DOM): Exact Traditional Bengali Government Certificate Layout */}
      <div
        className={
          previewMode === 'pdf' && !isDedicatedPrintRoute
            ? 'hidden print:block certificate-print-scroll-wrap'
            : 'block overflow-x-auto pb-4 certificate-print-scroll-wrap'
        }
      >
        <div
          ref={printRef}
          id="printable-certificate"
          className="w-[794px] max-w-[794px] mx-auto bg-white text-black shadow-2xl p-[10px] print:p-[6px] print:shadow-none relative overflow-hidden select-text border border-black origin-top transition-transform flex flex-col"
          style={{
            minHeight: '1122px',
            transform: !isDedicatedPrintRoute && zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            marginBottom: !isDedicatedPrintRoute && zoom > 100 ? `${(zoom - 100) * 10}px` : undefined,
          }}
        >
          {/* Outer Thick Black Rectangular Border */}
          <div className="border-[2.5px] border-black p-[3px] flex-1 flex flex-col">
            {/* Inner Thin Black Rectangular Border */}
            <div className="border border-black px-8 sm:px-10 pt-5 pb-3.5 flex-1 flex flex-col justify-between relative">
              {/* Large, Centered, Low-Opacity Government Seal Watermark Behind Content */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <BangladeshEmblem size={310} watermark={true} />
              </div>

              {/* Main Foreground Content */}
              <div className="relative z-10">
                {certificate.status === 'revoked' && (
                  <div className="mb-3 bg-red-50 border border-red-600 text-red-900 text-center py-1.5 px-3 text-xs font-bold">
                    বাতিলকৃত সনদ / REVOKED — কারণ: {certificate.revocation_reason || 'প্রশাসনিক আদেশে বাতিল'}
                  </div>
                )}
                {certificate.status !== 'revoked' &&
                  (typeof window !== 'undefined' &&
                    (window.location.hostname.includes('maltimarket.com') ||
                      window.location.hostname.includes('run.app') ||
                      window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1')) && (
                    <div className="mb-3 bg-amber-50 border border-amber-400 text-amber-900 text-center py-1 px-3 text-xs font-bold rounded">
                      TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — বৈধ নয়
                    </div>
                  )}

                {/* Top Centered Header: Circular Seal -> Institution Name -> Upazila/District -> Certificate Title */}
                <div className="text-center">
                  <div className="flex justify-center mb-1.5">
                    <BangladeshEmblem size={68} />
                  </div>
                  <h1 className="text-[22px] sm:text-[24px] font-bold text-black leading-snug tracking-normal">
                    {unitNameBn}
                  </h1>
                  <p className="text-[13.5px] sm:text-[14px] font-normal text-black leading-snug">
                    {upazilaDistrictBn}
                  </p>
                  <h2 className="text-[18px] sm:text-[19px] font-bold text-black leading-snug mt-0.5">
                    {cleanTitleBn}
                  </h2>
                </div>

                {/* Certificate Number (Left) & Issue Date (Right) */}
                <div className="flex items-center justify-between gap-4 text-[14.5px] font-bold text-black mt-3 mb-4">
                  <div>
                    <span>সনদ নং:- </span>
                    <span className="tabular-nums">{certNoBn}</span>
                  </div>
                  <div className="text-right">
                    <span>ইস্যুর তারিখ:- </span>
                    <span>{certificate.issue_date_bn || '১২ই নভেম্বর ২০২৬'}</span>
                  </div>
                </div>

                {/* Formal Bengali Certificate Paragraph (Justified Alignment with Important Names & Labels in Bold) */}
                <div className="text-justify text-[14.5px] sm:text-[15px] leading-[1.82] text-black font-normal">
                  <p>
                    এই মর্মে প্রত্যয়ন করা যাইতেছে যে,{' '}
                    <strong className="font-bold text-black">{certificate.applicant_name_bn}</strong>,
                    পিতা/স্বামীঃ{' '}
                    <strong className="font-bold text-black">{certificate.father_name_bn}</strong>,
                    মাতাঃ{' '}
                    <strong className="font-bold text-black">{certificate.mother_name_bn}</strong>{' '}
                    অত্র এলাকার একজন স্থায়ী বাসিন্দা। তাহার{' '}
                    <strong className="font-bold text-black">স্থায়ী ঠিকানাঃ-</strong>{' '}
                    <span>{permAddress}</span>{' '}
                    <strong className="font-bold text-black">বর্তমান ঠিকানাঃ-</strong>{' '}
                    <span>{presAddress}</span>{' '}
                    {hasHeirs ? (
                      <span>উল্লিখিত ব্যক্তির পরিবারের সদস্যগণের তালিকা নিম্নরূপঃ</span>
                    ) : (
                      <span>
                        তাহার স্বভাব ও চরিত্র উত্তম এবং আমাদের জানা মতে তাহার বিরুদ্ধে রাষ্ট্র বা সমাজবিরোধী কোনো অভিযোগ নাই।
                      </span>
                    )}
                  </p>
                </div>

                {/* Dynamic Information Table with Black Grid Borders */}
                {hasHeirs && certificate.heirs && (
                  <>
                    <div className="mt-3">
                      <table className="w-full border-collapse border border-black text-[13.5px] text-black tabular-nums bg-transparent">
                        <thead>
                          <tr className="font-bold text-center text-black">
                            <th className="border border-black py-1 px-2 w-[12%]">ক্রমিক নং</th>
                            <th className="border border-black py-1 px-2.5 w-[41%] text-center">নাম</th>
                            <th className="border border-black py-1 px-2 w-[18%]">জন্ম তারিখ</th>
                            <th className="border border-black py-1 px-2 w-[10%]">বয়স</th>
                            <th className="border border-black py-1 px-2 w-[19%]">সম্পর্ক</th>
                          </tr>
                        </thead>
                        <tbody>
                          {certificate.heirs.map((heir, idx) => (
                            <tr key={idx} className="text-black">
                              <td className="border border-black py-1 px-2 text-center">
                                {toBengaliDigits(idx + 1)}
                              </td>
                              <td className="border border-black py-1 px-2.5 text-left font-normal">
                                {heir.name}
                              </td>
                              <td className="border border-black py-1 px-2 text-center">
                                {toBengaliDigits(heir.dob)}
                              </td>
                              <td className="border border-black py-1 px-2 text-center">
                                {toBengaliDigits(heir.age)}
                              </td>
                              <td className="border border-black py-1 px-2 text-center">
                                {heir.relation}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Post-Table Attestation Paragraphs */}
                    <div className="mt-3 text-[14.5px] leading-[1.8] text-black text-justify space-y-3">
                      <p>
                        উল্লিখিত সদস্য/সদস্যগণ ছাড়া আর কোনো সদস্য নাই। আবেদনকারী যদি ইচ্ছাকৃতভাবে কোন সদস্য বাদ দিয়ে থাকেন তাহলে অনুমোদনকারী কোন ভাবেই দায়ী থাকিবেন না এবং উক্ত সনদ বাতিল বলিয়া গণ্য করা হইবে।
                      </p>
                      <p className="text-left">আমি সকল সদস্যগণের মঙ্গল কামনা করিতেছি।</p>
                    </div>
                  </>
                )}

                {!hasHeirs && (
                  <div className="mt-4 text-[14.5px] leading-[1.8] text-black text-left">
                    <p>আমি তাহার সার্বিক মঙ্গল ও উন্নতি কামনা করিতেছি।</p>
                  </div>
                )}
              </div>

              {/* Bottom Footer: QR Code (Bottom-Left) | Authorized Officer (Bottom-Right) | Centered Verification URL */}
              <div className="relative z-10 mt-10 pt-2">
                <div className="flex items-end justify-between gap-6">
                  {/* Bottom-Left: QR Code with Official Seal Center Badge */}
                  <div className="relative inline-block shrink-0">
                    {certificate.qr_data_url ? (
                      <div className="relative w-[108px] h-[108px] bg-white">
                        <img
                          src={certificate.qr_data_url}
                          alt="Verification QR Code"
                          className="w-full h-full object-contain block"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-white rounded-full p-[2px] shadow-2xs">
                            <BangladeshEmblem size={22} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-[108px] h-[108px] border border-black bg-white flex items-center justify-center text-[11px] text-black text-center p-1">
                        QR Code
                      </div>
                    )}
                  </div>

                  {/* Bottom-Right: Authorized Officer's Name, Designation, Institution & Location */}
                  <div className="text-right text-black leading-[1.45]">
                    <div className="inline-block text-right">
                      <div className="w-32 ml-auto border-t border-dashed border-black mb-1" />
                      <p className="text-[15px] font-bold text-black">
                        {certificate.officer_name_bn}
                      </p>
                      <p className="text-[13.5px] font-normal text-black">
                        {shortOfficerTitleBn}
                      </p>
                      <p className="text-[13.5px] font-normal text-black">
                        {unitNameBn}
                      </p>
                      <p className="text-[13.5px] font-normal text-black">
                        {upazilaDistrictBn}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Centered Verification URL Along the Bottom */}
                <div className="mt-3 text-center text-[11.5px] text-neutral-800 tracking-tight">
                  যাচাইকরণ:{' '}
                  {certificate.verification_url && !certificate.verification_url.includes('[protected-token]')
                    ? certificate.verification_url
                    : `${typeof window !== 'undefined' ? window.location.origin : 'https://prottoyonbd.maltimarket.com'}/verify/${certificate.certificate_number || certificate.certificate_no || certNoBn}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
