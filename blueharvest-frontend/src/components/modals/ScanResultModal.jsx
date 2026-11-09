import React, { useState } from 'react';
import { X, Maximize2, Save, ArrowRight, RotateCcw } from 'lucide-react';
import DualFishLoader from '../DualFishLoader';
import AuthenticatedImage from '../AuthenticatedImage';
import { OutputCardFishIcon } from '../icons/AppIcons';
import outputCardMainBg from '../../assets/outputCardMainBg.png';
import outputCountBg from '../../assets/outputCountBg.png';
import trayImage from '../../assets/tray.png';

const formatProcessingTime = (timeStr) => {
  if (!timeStr) return '0.68s';
  return timeStr;
};

const OutputWaveSquiggle = () => (
  <svg width="72" height="6" viewBox="0 0 72 6" fill="none" xmlns="http://www.w3.org/2000/svg" className="output-stat-wave">
    <path 
      d="M1 3C5 1 9 5 13 3C17 1 21 5 25 3C29 1 33 5 37 3C41 1 45 5 49 3C53 1 57 5 61 3C65 1 69 5 71 3" 
      stroke="#93C5FD" 
      strokeWidth="2" 
      strokeLinecap="round" 
    />
  </svg>
);

const CelebrationCheckmarkBadge = () => (
  <div className="celebration-badge-container">
    <svg width="112" height="112" viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg" className="celebration-burst-svg">
      <line x1="43" y1="23" x2="39" y2="15" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="69" y1="23" x2="73" y2="15" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="89" y1="56" x2="97" y2="56" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="81" y1="78" x2="87" y2="84" stroke="#60A5FA" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="31" y1="78" x2="25" y2="84" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="23" y1="56" x2="15" y2="56" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="27" cy="38" r="2.2" fill="#10B981" />
      <circle cx="56" cy="11" r="2.2" fill="#10B981" />
      <circle cx="85" cy="38" r="2.2" fill="#10B981" />
      <circle cx="94" cy="69" r="2.2" fill="#38BDF8" />
      <circle cx="25" cy="69" r="2.2" fill="#10B981" />
      <circle cx="56" cy="100" r="2" fill="#60A5FA" />
      <circle cx="56" cy="56" r="37" fill="rgba(220, 252, 231, 0.45)" />
      <circle cx="56" cy="56" r="29" fill="#DCFCE7" stroke="#FFFFFF" strokeWidth="2.2" />
      <path 
        d="M45.5 56.5L52.5 63.5L66.5 49" 
        stroke="#16A34A" 
        strokeWidth="3.8" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  </div>
);

export default function ScanResultModal({
  isAnalyzing,
  scanResult,
  scanError,
  scanningImage,
  isSavingCount,
  onDismiss,
  onSaveToLedger,
  onSelectAnother,
  onResetScan,
  onRetryLogin,
}) {
  const [showHeatmapLightbox, setShowHeatmapLightbox] = useState(false);

  if (!isAnalyzing && !scanResult && !scanError) {
    return null;
  }

  return (
    <>
      <div 
        className="modal-backdrop output-modal-backdrop"
        onClick={() => {
          if (!isAnalyzing) {
            onDismiss?.();
          }
        }}
      >
        {isAnalyzing ? (
          <div className="modal-card dual-fish-loading-card" onClick={(e) => e.stopPropagation()}>
            <DualFishLoader 
              text="Loading..." 
              size={140}
            />
          </div>
        ) : scanError ? (
          <div className="modal-card scan-error-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="scan-error-content" style={{ textAlign: 'center', padding: '12px' }}>
              <div className="result-header" style={{ justifyContent: 'center', marginBottom: '12px' }}>
                <X size={36} style={{ color: '#EF4444' }} />
                <h3 style={{ margin: 0, color: '#1F2937' }}>Backend Connection Notice</h3>
              </div>
              <p style={{ color: '#4B5563', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
                {scanError}
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button" 
                  className="action-btn"
                  style={{ flex: 1, backgroundColor: '#E5E7EB', color: '#374151', padding: '10px' }}
                  onClick={onDismiss}
                >
                  Dismiss
                </button>
                {scanError && scanError.toLowerCase().includes('token') ? (
                  <button 
                    type="button" 
                    className="action-btn primary-login-btn"
                    style={{ flex: 1, padding: '10px' }}
                    onClick={onRetryLogin}
                  >
                    Sign In Again
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="action-btn primary-login-btn"
                    style={{ flex: 1, padding: '10px' }}
                    onClick={onSelectAnother}
                  >
                    Select Another
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : scanResult ? (
          <div className="modal-card output-card-modal" onClick={(e) => e.stopPropagation()}>
            {/* Top Scenic Landscape Header */}
            <div 
              className="output-card-header"
              style={{ backgroundImage: `url(${outputCardMainBg})` }}
            />

            {/* Celebration Checkmark Badge */}
            <div className="output-celebration-wrapper">
              <CelebrationCheckmarkBadge />
            </div>

            {/* Title & Subtitle */}
            <div className="output-title-group">
              <h2 className="output-verified-title">Count Result Ready</h2>
              <p className="output-verified-sub">Backend result received. Metrics are shown only when provided.</p>
            </div>

            {/* Stats Box */}
            <div 
              className="output-stats-card"
              style={{ backgroundImage: `url(${outputCountBg})` }}
            >
              {/* Left Stat: Fish Fry Detected */}
              <div className="output-stat-unit">
                <div className="output-stat-circle-badge">
                  <OutputCardFishIcon size={26} color="#1D4ED8" />
                </div>
                <div className="output-stat-meta">
                  <span className="output-stat-label">Fish Fry Detected</span>
                  <span className="output-stat-value count-value">
                    {scanResult.count ?? '—'}
                  </span>
                  <OutputWaveSquiggle />
                </div>
              </div>

              {/* Vertical Divider */}
              <div className="output-stat-separator" />

              {/* Right Stat: Processed in */}
              <div className="output-stat-unit">
                <div className="output-stat-circle-badge">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="output-stat-meta">
                  <span className="output-stat-label">Processed in</span>
                  <span className="output-stat-value time-value">
                    {formatProcessingTime(scanResult.processingTime)}
                  </span>
                </div>
              </div>
            </div>

            {/* Detection / Heatmap Preview Image */}
            <div className="output-image-card">
              <AuthenticatedImage
                src={scanResult.heatmapImg || scanningImage || trayImage} 
                fallbackSrc={trayImage}
                alt="Fish fry detection preview" 
                className="output-detection-img" 
              />
              <button 
                type="button" 
                className="output-expand-icon-btn"
                onClick={() => setShowHeatmapLightbox(true)}
                title="View full resolution detection"
                aria-label="Expand detection view"
              >
                <Maximize2 size={16} color="#FFFFFF" strokeWidth={2.4} />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="output-actions-group">
              <button 
                type="button" 
                className="output-primary-btn"
                onClick={onSaveToLedger}
                disabled={isSavingCount}
              >
                <div className="output-btn-left-content">
                  <Save size={20} color="#FFFFFF" strokeWidth={2.2} />
                  <span>{isSavingCount ? 'Saving…' : 'Save to Hatchery Ledger'}</span>
                </div>
                <ArrowRight size={20} color="#FFFFFF" strokeWidth={2.2} className="output-arrow-right" />
              </button>

              <button 
                type="button" 
                className="output-secondary-btn"
                onClick={onResetScan}
              >
                <RotateCcw size={18} color="#2563EB" strokeWidth={2.4} />
                <span>Count Another Image</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Heatmap Fullscreen Lightbox Modal */}
      {showHeatmapLightbox && (
        <div className="modal-backdrop lightbox-backdrop" onClick={() => setShowHeatmapLightbox(false)}>
          <div className="lightbox-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-title">AI Detection Inspection (Count: {scanResult?.count ?? 'Not available'})</span>
              <button 
                type="button" 
                className="lightbox-close-btn"
                onClick={() => setShowHeatmapLightbox(false)}
                aria-label="Close preview"
              >
                <X size={20} />
              </button>
            </div>
            <div className="lightbox-body">
              <AuthenticatedImage
                src={scanResult?.heatmapImg || scanningImage || trayImage} 
                fallbackSrc={trayImage}
                alt="High-resolution fish fry detection" 
                className="lightbox-full-img"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
