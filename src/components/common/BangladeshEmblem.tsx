import React from 'react';

interface BangladeshEmblemProps {
  className?: string;
  size?: number;
  watermark?: boolean;
}

export const GOVT_SEAL_ASSET_URL =
  '/assets/aistudio/500px-Government_Seal_of_Bangladesh.svg_7a2b4488.webp';
export const GOVT_SEAL_PNG_FALLBACK = '/assets/aistudio/govt_seal.png';

export const BangladeshEmblem: React.FC<BangladeshEmblemProps> = ({
  className = '',
  size = 64,
  watermark = false,
}) => {
  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    if (!target.src.endsWith(GOVT_SEAL_PNG_FALLBACK)) {
      target.src = GOVT_SEAL_PNG_FALLBACK;
    }
  };

  if (watermark) {
    return (
      <div
        className={`pointer-events-none select-none flex items-center justify-center opacity-[0.15] ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src={GOVT_SEAL_ASSET_URL}
          onError={handleImgError}
          alt="গণপ্রজাতন্ত্রী বাংলাদেশ সরকার জলছাপ"
          className="w-full h-full object-contain"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full select-none ${className}`}
      style={{ width: size, height: size }}
      title="গণপ্রজাতন্ত্রী বাংলাদেশ সরকার"
    >
      <img
        src={GOVT_SEAL_ASSET_URL}
        onError={handleImgError}
        alt="গণপ্রজাতন্ত্রী বাংলাদেশ সরকার"
        className="w-full h-full object-contain rounded-full"
        draggable={false}
      />
    </div>
  );
};
