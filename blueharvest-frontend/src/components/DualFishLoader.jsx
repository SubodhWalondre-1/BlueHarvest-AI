import React from 'react';
import loadingScreenImage from '../assets/loadingScreen.png';

/**
 * Dual Fish Spinner using loadingScreen.png
 * Rotates anticlockwise (counter-clockwise) so the fishes swim forward naturally.
 */
export const DualFishSpinner = ({ size = 140, className = '' }) => (
  <div 
    className={`dual-fish-spinner-wrap ${className}`}
    style={{ width: size, height: size }}
    aria-label="Loading animation"
    role="status"
  >
    <img 
      src={loadingScreenImage} 
      alt="Loading fish animation" 
      className="dual-fish-spinner-img"
      style={{ 
        width: '100%', 
        height: '100%', 
        objectFit: 'contain', 
        display: 'block', 
        userSelect: 'none', 
        pointerEvents: 'none' 
      }}
    />
  </div>
);

export default function DualFishLoader({ 
  text = 'Loading...', 
  size = 140,
  fullScreen = false,
  className = ''
}) {
  const content = (
    <div className={`dual-fish-loading-container ${className}`}>
      <DualFishSpinner size={size} />
      {text && <div className="dual-fish-loading-text">{text}</div>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="dual-fish-fullscreen-overlay">
        {content}
      </div>
    );
  }

  return content;
}
