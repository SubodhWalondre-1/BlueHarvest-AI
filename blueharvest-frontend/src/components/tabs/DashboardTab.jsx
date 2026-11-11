import React from 'react';
import { 
  Image as ImageIcon, 
  ChevronRight, 
  Camera, 
  Video, 
  Settings, 
  BarChart3, 
  Sprout 
} from 'lucide-react';
import heroImage from '../../assets/hero.png';
import agriImage from '../../assets/agriculture.png';

export default function DashboardTab({ fileInputRef, onOpenLiveCamera }) {
  return (
    <>
      {/* Hero Section with Tub Image Blend */}
      <section className="home-hero-section">
        <div className="hero-content-wrapper">
          <div className="hero-text-content">
            <h1 className="hero-heading">
              Count Fish<br />
              Spawn <span className="highlight-blue">Easily</span>
            </h1>
            <p className="hero-subtext">
              Upload a photo or use your camera to get an accurate count of fish spawn and fry.
            </p>
          </div>

          {/* Top-Right Circular Basin with Spawn from hero.png */}
          <div className="hero-image-wrapper" aria-label="Fish fry swimming in nursery basin">
            <img 
              src={heroImage} 
              alt="Count fish spawn in blue basin" 
              className="hero-tub-img" 
            />
            <div className="hero-image-blend-overlay"></div>
          </div>
        </div>

        {/* Authentic animated dual-layer wave ribbons matching heroReference.png */}
        <div className="hero-wave-divider" aria-hidden="true">
          {/* Wave Layer 1: Upper Light Blue Ribbon (#BCD3FD) */}
          <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-1">
            <path 
              d="M-60,46 C50,16 250,16 410,44 C530,65 670,68 820,36 C845,30 865,34 885,38 L885,100 L-60,100 Z" 
              fill="#BCD3FD"
            />
          </svg>
          {/* Wave Layer 2: Lower Soft Blue Ribbon (#97B9FC) */}
          <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-2">
            <path 
              d="M-60,76 C50,56 250,56 410,74 C530,85 670,80 820,52 C845,46 865,52 885,58 L885,100 L-60,100 Z" 
              fill="#97B9FC"
            />
          </svg>
          {/* Wave Layer 3: Deep Blue Right Corner Accent (#1E6FFB) */}
          <svg viewBox="0 0 820 100" preserveAspectRatio="none" className="home-wave-layer home-wave-3">
            <path 
              d="M710,100 C745,96 785,82 820,68 C845,60 865,65 885,70 L885,100 Z" 
              fill="#1E6FFB"
            />
          </svg>
        </div>
      </section>

      {/* Primary Action Cards Grid (Responsive 2-col on mobile, 3-col on tablet/desktop) */}
      <section className="action-cards-grid">
        {/* Upload Image Card */}
        <div 
          className="action-card upload-card"
          onClick={() => {
            fileInputRef.current && fileInputRef.current.click();
          }}
          role="button"
          tabIndex={0}
        >
          <div className="card-top-row">
            <div className="card-icon-badge blue-badge">
              <ImageIcon size={24} className="card-icon" />
            </div>
            <ChevronRight size={20} className="card-chevron blue-chevron" />
          </div>
          <div className="card-text-block">
            <h2 className="card-title">Upload Image</h2>
            <p className="card-subtitle">From gallery or files</p>
          </div>
        </div>

        {/* Use Camera Card - Opens Live Camera Scanner */}
        <div 
          className="action-card camera-card"
          onClick={() => {
            if (typeof onOpenLiveCamera === 'function') {
              onOpenLiveCamera();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Open live camera scanner"
        >
          <div className="card-top-row">
            <div className="card-icon-badge green-badge">
              <Camera size={24} className="card-icon" />
            </div>
            <ChevronRight size={20} className="card-chevron green-chevron" />
          </div>
          <div className="card-text-block">
            <h2 className="card-title">Live Camera</h2>
            <p className="card-subtitle">Open live camera</p>
          </div>
        </div>

        {/* Video Counting Card */}
        <div className="action-card video-card">
          <div className="video-card-left">
            <div className="card-icon-badge amber-badge">
              <Video size={24} className="card-icon" />
            </div>
            <div className="video-text-block">
              <h2 className="card-title">Video Counting</h2>
              <span className="coming-soon-tag">Coming Soon</span>
            </div>
          </div>
          <ChevronRight size={20} className="card-chevron gray-chevron" />
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
        <h2 className="section-title">How It Works</h2>
        
        <div className="steps-flow-container">
          {/* Step 1 */}
          <div className="step-flow-item">
            <div className="step-circle-wrapper">
              <span className="step-counter-badge">1</span>
              <div className="step-icon-circle">
                <ImageIcon size={26} className="step-icon" />
              </div>
            </div>
            <h3 className="step-title">Upload or Capture</h3>
            <p className="step-desc">Open live camera or choose an image</p>
          </div>

          {/* Connecting Arrow */}
          <div className="step-arrow-divider" aria-hidden="true">
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M1 8H24M24 8L18 2M24 8L18 14" stroke="#93C5FD" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Step 2 */}
          <div className="step-flow-item">
            <div className="step-circle-wrapper">
              <span className="step-counter-badge">2</span>
              <div className="step-icon-circle">
                <Settings size={26} className="step-icon" />
              </div>
            </div>
            <h3 className="step-title">AI Processing</h3>
            <p className="step-desc">Our system analyzes the image</p>
          </div>

          {/* Connecting Arrow */}
          <div className="step-arrow-divider" aria-hidden="true">
            <svg width="28" height="16" viewBox="0 0 28 16" fill="none">
              <path d="M1 8H24M24 8L18 2M24 8L18 14" stroke="#93C5FD" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Step 3 */}
          <div className="step-flow-item">
            <div className="step-circle-wrapper">
              <span className="step-counter-badge">3</span>
              <div className="step-icon-circle">
                <BarChart3 size={26} className="step-icon" />
              </div>
            </div>
            <h3 className="step-title">Get Count</h3>
            <p className="step-desc">View the approximated spawn count</p>
          </div>
        </div>
      </section>

      {/* Supporting Sustainable Aquaculture Banner */}
      <section className="sustainability-banner">
        <div className="banner-content">
          <div className="banner-sprout-badge">
            <Sprout size={24} className="sprout-icon" />
          </div>
          <div className="banner-text">
            <h3 className="banner-heading">Supporting Sustainable Aquaculture</h3>
            <p className="banner-subtext">For healthier farms and brighter tomorrows.</p>
          </div>
        </div>

        {/* Landscape Illustration Artwork from Assets */}
        <div className="banner-artwork" aria-hidden="true">
          <img 
            src={agriImage} 
            alt="Sustainable Aquaculture Landscape" 
            className="banner-artwork-img" 
          />
        </div>
      </section>
    </>
  );
}
