import React from 'react';
import { 
  Search, 
  X, 
  Filter, 
  ChevronDown, 
  Check, 
  Layers, 
  Box, 
  Camera, 
  Image as ImageIcon, 
  MoreVertical, 
  Eye, 
  Download, 
  Trash2, 
  Ruler 
} from 'lucide-react';
import { BasinIcon, IndianRupeeIcon } from '../icons/AppIcons';
import AuthenticatedImage from '../AuthenticatedImage';
import { formatPriceINR } from '../../utils/pricing';
import agriImage from '../../assets/agriculture.png';
import heroImage from '../../assets/hero.png';

export default function LedgerTab({
  historyItems,
  historyLoading,
  historyError,
  historySearchQuery,
  setHistorySearchQuery,
  activeFilter,
  setActiveFilter,
  showFilterDropdown,
  setShowFilterDropdown,
  activeActionMenuId,
  setActiveActionMenuId,
  activeGroups,
  groupedHistory,
  setSelectedBatchModal,
  handleExportCSV,
  handleDeleteBatch,
}) {
  return (
    <div className="history-tab-view-container">
      {/* History Top Hero with agriculture.png Artwork */}
      <section className="history-hero-section">
        <div className="history-hero-art-wrapper" aria-hidden="true">
          <img 
            src={agriImage} 
            alt="Aquaculture farm illustration with fish swimming in circular basins" 
            className="history-hero-art-img" 
          />
          <div className="history-hero-overlay" />
        </div>

        <div className="history-hero-content">
          <h1 className="history-hero-heading">Counting History</h1>
          <p className="history-hero-subtext">View all your past fish counts</p>
        </div>
      </section>

      {/* Dedicated Search & Filter Controls */}
      <div className="history-search-filter-section">
        <div className="history-controls-row">
          <div className="history-search-box">
            <Search size={15} className="history-search-icon" />
            <input 
              type="text" 
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              placeholder="Search by pond name, date or ID..." 
              className="history-search-input"
              aria-label="Search past fish counts"
            />
            {historySearchQuery && (
              <button 
                type="button" 
                className="history-search-clear"
                onClick={() => setHistorySearchQuery('')}
                aria-label="Clear search query"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div className="history-filter-wrapper" onClick={(e) => e.stopPropagation()}>
            <button 
              type="button" 
              className={`history-filter-btn ${activeFilter !== 'All' ? 'active' : ''}`}
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              aria-label="Filter counting batches"
            >
              <Filter size={14} strokeWidth={2.3} />
              <span>{activeFilter === 'All' ? 'Filters' : activeFilter}</span>
              <ChevronDown size={13} className={`filter-chevron ${showFilterDropdown ? 'rotated' : ''}`} />
            </button>

            {showFilterDropdown && (
              <div className="history-filter-dropdown">
                <div className="filter-dropdown-header">Filter by Type</div>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'All' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('All'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <span>All Records</span>
                  {activeFilter === 'All' && <Check size={14} className="filter-opt-check" />}
                </button>
                <div className="filter-dropdown-divider" />
                <div className="filter-dropdown-section-lbl">Containers</div>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'Tray' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('Tray'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <div className="option-with-icon"><Layers size={14} /><span>Nursery Tray</span></div>
                  {activeFilter === 'Tray' && <Check size={14} className="filter-opt-check" />}
                </button>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'Tank' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('Tank'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <div className="option-with-icon"><Box size={14} /><span>Spawn Tank</span></div>
                  {activeFilter === 'Tank' && <Check size={14} className="filter-opt-check" />}
                </button>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'Pond' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('Pond'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <div className="option-with-icon"><BasinIcon size={14} /><span>Main Pond</span></div>
                  {activeFilter === 'Pond' && <Check size={14} className="filter-opt-check" />}
                </button>
                <div className="filter-dropdown-divider" />
                <div className="filter-dropdown-section-lbl">Source</div>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'Camera' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('Camera'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <div className="option-with-icon"><Camera size={14} /><span>Camera</span></div>
                  {activeFilter === 'Camera' && <Check size={14} className="filter-opt-check" />}
                </button>
                <button 
                  type="button" 
                  className={`filter-option-btn ${activeFilter === 'Uploaded' ? 'selected' : ''}`}
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    setActiveFilter('Uploaded'); 
                    setShowFilterDropdown(false); 
                  }}
                >
                  <div className="option-with-icon"><ImageIcon size={14} /><span>Uploaded</span></div>
                  {activeFilter === 'Uploaded' && <Check size={14} className="filter-opt-check" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History Feed List with Time Groups */}
      <section className="history-feed-section">
        {historyLoading ? <p className="modal-description">Loading saved ledger records…</p> : null}
        {historyError ? <p className="field-error-message" role="alert">{historyError}</p> : null}
        {!historyLoading && !historyError && historyItems.length === 0 ? (
          <p className="modal-description">No saved count records yet. Completed counts will appear here after they are saved.</p>
        ) : null}
        {activeGroups.length > 0 ? (
          activeGroups.map((groupName) => (
            <div key={groupName} className="history-group-block">
              <h2 className="history-group-header">{groupName}</h2>
              <div className="history-cards-list">
                {groupedHistory[groupName].map((item) => (
                  <div 
                    key={item.id} 
                    className="history-card-item"
                    onClick={() => setSelectedBatchModal(item)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Left Square Thumbnail */}
                    <div className="history-thumb-box">
                      <AuthenticatedImage
                        src={item.image || heroImage} 
                        fallbackSrc={heroImage}
                        alt={`Fish count ${item.id}`} 
                        className="history-thumb-img" 
                      />
                    </div>

                    {/* Right Details Column */}
                    <div className="history-card-right">
                      {/* Card Top Row: ID, Time, More Options */}
                      <div className="history-card-top-row">
                        <span className="history-batch-code">{item.id}</span>
                        <div className="history-card-time-group">
                          <span className="history-timestamp">{item.time}</span>
                          <div className="history-more-wrapper" onClick={(e) => e.stopPropagation()}>
                            <button 
                              type="button" 
                              className="history-more-btn"
                              onClick={() => setActiveActionMenuId(activeActionMenuId === item.id ? null : item.id)}
                              aria-label="More options"
                            >
                              <MoreVertical size={16} />
                            </button>

                            {activeActionMenuId === item.id && (
                              <div className="history-card-menu-dropdown">
                                <button 
                                  type="button" 
                                  className="card-menu-action-btn"
                                  onClick={() => {
                                    setSelectedBatchModal(item);
                                    setActiveActionMenuId(null);
                                  }}
                                >
                                  <Eye size={14} />
                                  <span>View Details</span>
                                </button>
                                <button 
                                  type="button" 
                                  className="card-menu-action-btn"
                                  onClick={(e) => handleExportCSV(item, e)}
                                >
                                  <Download size={14} />
                                  <span>Download CSV</span>
                                </button>
                                <button 
                                  type="button" 
                                  className="card-menu-action-btn delete-btn"
                                  onClick={(e) => handleDeleteBatch(item.id, e)}
                                >
                                  <Trash2 size={14} />
                                  <span>Delete Record</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Middle Row: Count Box + Pond & Density Column */}
                      <div className="history-card-mid-row">
                        <div className="history-count-badge-box">
                          <span className="history-count-num">
                            {Number(item.count).toLocaleString()}
                          </span>
                          <span className="history-count-lbl">Spawn</span>
                        </div>

                        <div className="history-pond-density-col">
                          <div className="history-pond-chip-row">
                            <BasinIcon size={17} />
                            <span className="history-pond-title">{item.pond}</span>
                          </div>
                          <div className="history-density-chip" title="Price: ₹0.025/spawn + ₹50 packing">
                            <IndianRupeeIcon size={13} />
                            <span>Price: {item.priceFormatted || formatPriceINR(item.count)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Tags Row */}
                      <div className="history-tags-row">
                        <div className="history-tag-pill">
                          {item.source === 'Camera' ? <Camera size={12} /> : <ImageIcon size={12} />}
                          <span>{item.source}</span>
                        </div>
                        <div className="history-tag-pill">
                          {item.container === 'Tray' ? <Layers size={12} /> : item.container === 'Tank' ? <Box size={12} /> : <ImageIcon size={12} />}
                          <span>{item.container}</span>
                        </div>
                        <div className="history-tag-pill">
                          <Ruler size={12} />
                          <span>{item.dimensions}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="history-empty-state">
            <div className="empty-state-icon-box">
              <Search size={32} />
            </div>
            <h3 className="empty-state-title">No matching counts found</h3>
            <p className="empty-state-desc">
              {historySearchQuery 
                ? `We couldn't find any batches matching "${historySearchQuery}".`
                : `No batches found for filter "${activeFilter}".`}
            </p>
            <button 
              type="button" 
              className="empty-reset-btn"
              onClick={() => {
                setHistorySearchQuery('');
                setActiveFilter('All');
              }}
            >
              Reset Search & Filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

