import React from 'react';
import { X, Camera, RefreshCw, SwitchCamera } from 'lucide-react';
import { DualFishSpinner } from '../DualFishLoader';

export default function LiveCameraModal({
  isOpen,
  onClose,
  cameraError,
  onRetry,
  videoRef,
  isCameraStarting,
  onSwitchCamera,
  onCapture,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop camera-live-backdrop" onClick={onClose}>
      <div className="camera-live-modal" onClick={(e) => e.stopPropagation()}>
        {/* Live Camera Top Bar */}
        <div className="camera-modal-header">
          <div className="camera-header-tag">
            <span className="live-rec-dot" />
            <span>LIVE CAMERA SCANNER</span>
          </div>
          <button 
            type="button" 
            className="camera-close-btn"
            onClick={onClose}
            aria-label="Close live camera"
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder Window */}
        <div className="camera-viewfinder-container">
          {cameraError ? (
            <div className="camera-error-view">
              <div className="camera-error-icon">
                <Camera size={34} />
              </div>
              <h4 className="camera-error-title">Camera Access Required</h4>
              <p className="camera-error-desc">{cameraError}</p>
              <div className="camera-error-actions">
                <button 
                  type="button" 
                  className="action-btn primary-login-btn camera-retry-btn"
                  onClick={onRetry}
                >
                  <RefreshCw size={15} />
                  <span>Try Again</span>
                </button>
                <button 
                  type="button" 
                  className="action-btn camera-fallback-file-btn"
                  onClick={onClose}
                >
                  <span>Close Camera</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef} 
                playsInline 
                muted 
                className="camera-video-feed" 
              />

              {isCameraStarting && (
                <div className="camera-loading-overlay">
                  <DualFishSpinner size={48} />
                  <span className="camera-loading-text">Initializing Live Video Feed...</span>
                </div>
              )}

              {/* AI Vision Reticle & Alignment HUD */}
              <div className="camera-reticle-overlay" aria-hidden="true">
                <div className="corner-bracket corner-top-left" />
                <div className="corner-bracket corner-top-right" />
                <div className="corner-bracket corner-bottom-left" />
                <div className="corner-bracket corner-bottom-right" />
                <div className="camera-scan-laser-line" />
              </div>

              <div className="camera-tip-badge">
                <span>Position tray or pond basin in frame</span>
              </div>
            </>
          )}
        </div>

        {/* Bottom Camera Toolbar */}
        {!cameraError && (
          <div className="camera-controls-bar">
            <button 
              type="button" 
              className="camera-tool-btn"
              onClick={onSwitchCamera}
              title="Switch Camera (Front/Rear)"
              aria-label="Switch camera"
            >
              <SwitchCamera size={22} />
            </button>

            <button 
              type="button" 
              className="camera-shutter-btn"
              onClick={onCapture}
              disabled={isCameraStarting}
              title="Capture Frame & Count Spawn"
              aria-label="Capture live photo and count spawn"
            >
              <div className="shutter-inner-ring" />
            </button>

            <div className="camera-tool-spacer" style={{ width: 48, height: 48 }} aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
