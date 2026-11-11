import React from 'react';
import { MapPin, FileDown } from 'lucide-react';
import { FishIcon, CountingSessionsIcon } from '../icons/AppIcons';
import insightsBg from '../../assets/insightsBg.png';

export default function InsightsTab({
  activeInsightsRange,
  setActiveInsightsRange,
  insightsData,
  insightsLoading,
  insightsError,
  handleDownloadPDFReport,
}) {
  return (
    <div className="insights-tab-view-container">
      {/* Top Hero with insightsBg.png Artwork */}
      <section className="insights-hero-section">
        <div className="insights-hero-art-wrapper" aria-hidden="true">
          <img 
            src={insightsBg} 
            alt="Aquaculture farm landscape with pond and mountains" 
            className="insights-hero-art-img" 
          />
          <div className="insights-hero-overlay" />
        </div>

        <div className="insights-hero-content">
          <h1 className="insights-hero-heading">Farm Insights</h1>
          <p className="insights-hero-subtext">
            See how many fish you have counted and where they were counted.
          </p>
        </div>
      </section>

      {/* Time Filter Pills: Today, This Week, This Month, All Time */}
      <div className="insights-filter-pills-row">
        {['Today', 'This Week', 'This Month', 'All Time'].map((period) => (
          <button
            key={period}
            type="button"
            className={`insights-filter-pill ${activeInsightsRange === period ? 'active' : ''}`}
            onClick={() => setActiveInsightsRange(period)}
          >
            {period}
          </button>
        ))}
      </div>

      {/* 2 Primary KPI Summary Cards */}
      <div className="insights-kpi-cards-grid">
        {/* Total Fish Counted Card */}
        <div className="insights-kpi-card total-fish-card">
          <div className="insights-kpi-icon-badge blue-badge">
            <FishIcon size={20} color="#1D70F7" />
          </div>
          <span className="insights-kpi-label">Total Fish Counted</span>
          <span className="insights-kpi-value">
            {insightsLoading ? 'Loading…' : insightsError ? '—' : insightsData.totalFish.toLocaleString()}
          </span>
          <span className="insights-kpi-subtext">Fish Fry</span>
        </div>

        {/* Counting Sessions Card */}
        <div className="insights-kpi-card sessions-card">
          <div className="insights-kpi-icon-badge green-badge">
            <CountingSessionsIcon size={22} />
          </div>
          <span className="insights-kpi-label">Counting Sessions</span>
          <span className="insights-kpi-value">
            {insightsLoading ? '…' : insightsError ? '—' : insightsData.sessions}
          </span>
          <span className="insights-kpi-subtext">Sessions done</span>
        </div>
      </div>

      {insightsError && <p className="field-error-message" role="alert">{insightsError}</p>}

      {/* Counts by Location Card */}
      <div className="insights-location-card">
        <div className="insights-location-header">
          <MapPin size={18} fill="#2563EB" stroke="#2563EB" className="location-pin-icon" />
          <h2 className="insights-location-title">Counts by Location</h2>
        </div>

        <div className="insights-location-list">
          {insightsData.locations.map((loc) => (
            <div key={loc.name} className="insights-location-row">
              <span className="insights-location-name">{loc.name}</span>
              <div className="insights-progress-track">
                <div 
                  className="insights-progress-fill" 
                  style={{ 
                    width: `${loc.percentage}%`,
                    backgroundColor: loc.color
                  }} 
                />
              </div>
              <span className="insights-location-count">{loc.count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Download PDF Report CTA Button */}
      <button 
        type="button" 
        className="insights-download-btn"
        onClick={handleDownloadPDFReport}
        disabled={insightsLoading || Boolean(insightsError)}
        aria-label="Download PDF report of hatchery insights"
      >
        <FileDown size={20} className="download-btn-icon" />
        <span>Download PDF Report</span>
      </button>
    </div>
  );
}

