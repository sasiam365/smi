import React from 'react';
import { AdministrativeUnit, Certificate } from '../../types';
import { WarishCertificateView } from './WarishCertificateView';

interface CertificatePreviewModalProps {
  certificate: Certificate;
  institution?: AdministrativeUnit;
  authToken?: string;
  trackingNo?: string;
  autoPrint?: boolean;
  onOpenPrintRoute?: (cert: Certificate, trackingNo?: string) => void;
  onClose: () => void;
}

export const CertificatePreviewModal: React.FC<CertificatePreviewModalProps> = ({
  certificate,
  institution,
  authToken,
  trackingNo,
  autoPrint = false,
  onOpenPrintRoute,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/75 overflow-y-auto certificate-print-shell">
      <div className="min-h-screen">
        <WarishCertificateView
          certificate={certificate}
          institution={institution}
          authToken={authToken}
          trackingNo={trackingNo}
          isModalContext={true}
          autoPrint={autoPrint}
          onOpenPrintRoute={onOpenPrintRoute}
          onBack={onClose}
        />
      </div>
    </div>
  );
};
