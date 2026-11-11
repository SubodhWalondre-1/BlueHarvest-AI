import React from 'react';
import { 
  Pencil, 
  MapPin, 
  ChevronRight, 
  User, 
  Mail, 
  Phone, 
  Settings, 
  Bell, 
  Globe, 
  Palette, 
  LogOut 
} from 'lucide-react';

export default function ProfileTab({
  profileUsername,
  profileRole,
  profileEmail,
  profilePhone,
  profileLocation,
  profileNotificationsEnabled,
  setProfileNotificationsEnabled,
  profileLanguage,
  profileTheme,
  setEditFormData,
  setShowEditProfileModal,
  setShowLocationPickerModal,
  setShowLanguagePickerModal,
  setShowThemePickerModal,
  updateUserSettings,
  showProfileToastMsg,
  onLogout,
}) {
  return (
    <section className="profile-tab-content">
      {/* Top Heading Group */}
      <div className="profile-heading-group">
        <h1 className="profile-main-title">Profile</h1>
        <p className="profile-main-subtitle">Manage your farm details and account settings</p>
      </div>

      {/* Farm & Manager Hero Card */}
      <div className="profile-hero-card">
        {/* Subtle wavy decorative vector background on the right */}
        <div className="profile-hero-waves-bg" aria-hidden="true">
          <svg viewBox="0 0 280 160" fill="none" preserveAspectRatio="none">
            <path d="M40 160C100 135 150 70 280 60V160H40Z" fill="url(#heroWaveGrad1)" />
            <path d="M90 160C140 125 190 95 280 90V160H90Z" fill="url(#heroWaveGrad2)" />
            <defs>
              <linearGradient id="heroWaveGrad1" x1="40" y1="110" x2="280" y2="110" gradientUnits="userSpaceOnUse">
                <stop stopColor="#E2EDFD" stopOpacity="0.75" />
                <stop stopColor="#CCE3FD" stopOpacity="0.4" />
              </linearGradient>
              <linearGradient id="heroWaveGrad2" x1="90" y1="125" x2="280" y2="125" gradientUnits="userSpaceOnUse">
                <stop stopColor="#EDF4FE" stopOpacity="0.9" />
                <stop stopColor="#DBEAFE" stopOpacity="0.75" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Avatar & Manager Identity */}
        <div className="profile-hero-top-row">
          <div className="profile-hero-avatar-wrap">
            <div className="profile-hero-avatar-circle">
              <svg viewBox="0 0 24 24" fill="#3B82F6" className="profile-hero-avatar-svg">
                <path d="M12 12c2.4 0 4.4-2 4.4-4.4S14.4 3.2 12 3.2 7.6 5.2 7.6 7.6 9.6 12 12 12zm0 2.4c-3 0-9 1.5-9 4.4v2h18v-2c0-2.9-6-4.4-9-4.4z"/>
              </svg>
            </div>
            <button 
              type="button" 
              className="profile-avatar-edit-badge"
              onClick={() => {
                setEditFormData({
                  username: profileUsername,
                  role: profileRole,
                  email: profileEmail,
                  phone: profilePhone,
                  location: profileLocation
                });
                setShowEditProfileModal(true);
              }}
              aria-label="Edit Profile Details"
            >
              <Pencil size={11} strokeWidth={2.6} color="#FFFFFF" />
            </button>
          </div>

          <div className="profile-hero-identity">
            <h2 className="profile-hero-name">{profileUsername}</h2>
            <span className="profile-hero-role">{profileRole}</span>
          </div>
        </div>

        {/* Farm Location Pill */}
        <div 
          className="profile-location-pill"
          role="button"
          tabIndex={0}
          onClick={() => setShowLocationPickerModal(true)}
          aria-label="Change Farm Location"
        >
          <div className="profile-location-left">
            <div className="profile-location-icon-badge">
              <MapPin size={17} fill="#2563EB" color="#2563EB" />
            </div>
            <div className="profile-location-text">
              <span className="profile-location-label">Farm Location</span>
              <strong className="profile-location-value">{profileLocation}</strong>
            </div>
          </div>
          <ChevronRight size={18} className="profile-row-chevron" />
        </div>
      </div>

      {/* Account & Contact Card */}
      <div className="profile-section-card">
        <div className="profile-card-header">
          <div className="profile-card-icon-badge">
            <User size={18} strokeWidth={2.4} color="#2563EB" />
          </div>
          <div className="profile-card-header-text">
            <h3 className="profile-card-title">Account & Contact</h3>
            <p className="profile-card-subtitle">Your account information</p>
          </div>
        </div>

        <div className="profile-card-items-list">
          <div 
            className="profile-info-row-item"
            role="button"
            tabIndex={0}
            onClick={() => {
              setEditFormData({
                username: profileUsername,
                role: profileRole,
                email: profileEmail,
                phone: profilePhone,
                location: profileLocation
              });
              setShowEditProfileModal(true);
            }}
          >
            <div className="profile-row-left">
              <Mail size={18} strokeWidth={2} className="profile-row-icon" />
              <span className="profile-row-label">Email</span>
            </div>
            <div className="profile-row-right">
              <span className="profile-row-value">{profileEmail}</span>
              <ChevronRight size={16} className="profile-row-chevron" />
            </div>
          </div>

          <div className="profile-row-divider" />

          <div 
            className="profile-info-row-item"
            role="button"
            tabIndex={0}
            onClick={() => {
              setEditFormData({
                username: profileUsername,
                role: profileRole,
                email: profileEmail,
                phone: profilePhone,
                location: profileLocation
              });
              setShowEditProfileModal(true);
            }}
          >
            <div className="profile-row-left">
              <Phone size={18} strokeWidth={2} className="profile-row-icon" />
              <span className="profile-row-label">Phone Number</span>
            </div>
            <div className="profile-row-right">
              <span className="profile-row-value">{profilePhone}</span>
              <ChevronRight size={16} className="profile-row-chevron" />
            </div>
          </div>
        </div>
      </div>

      {/* App Settings Card */}
      <div className="profile-section-card">
        <div className="profile-card-header">
          <div className="profile-card-icon-badge">
            <Settings size={18} strokeWidth={2.4} color="#2563EB" />
          </div>
          <div className="profile-card-header-text">
            <h3 className="profile-card-title">App Settings</h3>
            <p className="profile-card-subtitle">Customize your experience</p>
          </div>
        </div>

        <div className="profile-card-items-list">
          <div 
            className="profile-setting-row-item"
            role="button"
            tabIndex={0}
            onClick={async () => {
              const next = !profileNotificationsEnabled;
              setProfileNotificationsEnabled(next);
              try {
                await updateUserSettings({ notificationsEnabled: next });
                showProfileToastMsg(next ? 'Notifications enabled' : 'Notifications muted');
              } catch (error) {
                setProfileNotificationsEnabled(!next);
                showProfileToastMsg(error.message || 'Could not save notification preference');
              }
            }}
          >
            <div className="profile-row-left">
              <Bell size={18} strokeWidth={2} className="profile-row-icon" />
              <div className="profile-setting-text">
                <span className="profile-setting-title">Notifications</span>
                <span className="profile-setting-sub">
                  {profileNotificationsEnabled ? 'Receive updates and alerts' : 'Notifications muted'}
                </span>
              </div>
            </div>
            <ChevronRight size={16} className="profile-row-chevron" />
          </div>

          <div className="profile-row-divider" />

          <div 
            className="profile-setting-row-item"
            role="button"
            tabIndex={0}
            onClick={() => setShowLanguagePickerModal(true)}
          >
            <div className="profile-row-left">
              <Globe size={18} strokeWidth={2} className="profile-row-icon" />
              <div className="profile-setting-text">
                <span className="profile-setting-title">Language</span>
                <span className="profile-setting-sub">{profileLanguage}</span>
              </div>
            </div>
            <ChevronRight size={16} className="profile-row-chevron" />
          </div>

          <div className="profile-row-divider" />

          <div 
            className="profile-setting-row-item"
            role="button"
            tabIndex={0}
            onClick={() => setShowThemePickerModal(true)}
          >
            <div className="profile-row-left">
              <Palette size={18} strokeWidth={2} className="profile-row-icon" />
              <div className="profile-setting-text">
                <span className="profile-setting-title">App Theme</span>
                <span className="profile-setting-sub">{profileTheme}</span>
              </div>
            </div>
            <ChevronRight size={16} className="profile-row-chevron" />
          </div>
        </div>
      </div>

      {/* Sign Out Button */}
      <button 
        type="button" 
        className="profile-signout-btn"
        onClick={onLogout}
        aria-label="Sign Out"
      >
        <LogOut size={18} strokeWidth={2.4} className="profile-signout-icon" />
        <span>Sign Out</span>
      </button>
    </section>
  );
}

