import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { signupUser } from '../api/client';

export default function SignUpView({ onSignUpSuccess, onSwitchToLogin }) {
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    pondLocation: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const handleChange = (field, val) => {
    setFormData(prev => ({ ...prev, [field]: val }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!formData.fullName.trim()) newErrors.fullName = 'Full Name is required';
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) newErrors.email = 'A valid email address is required';
    if (!formData.pondLocation.trim()) newErrors.pondLocation = 'Hatchery/Pond location is required';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password && formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    try {
      const result = await signupUser(formData);
      onSignUpSuccess?.(result.user);
    } catch (error) {
      setErrors({ form: error.message || 'Account creation failed. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-screen-wrapper signup-screen-mode">
      {/* Background Animated Tidal Waves */}
      <div className="waves-tide-container" aria-hidden="true">
        <svg className="tide-wave-layer wave-layer-1" viewBox="0 0 1200 340" preserveAspectRatio="none">
          <path d="M0,75 C250,45 520,115 800,90 C1000,72 1120,60 1200,55 L1200,340 L0,340 Z" fill="#BED7FF" opacity="0.95" />
        </svg>
        <svg className="tide-wave-layer wave-layer-2" viewBox="0 0 1200 340" preserveAspectRatio="none">
          <path d="M0,120 C220,135 480,180 740,175 C950,170 1100,150 1200,145 L1200,340 L0,340 Z" fill="#7AA6FF" />
        </svg>
        <svg className="tide-wave-layer wave-layer-3" viewBox="0 0 1200 340" preserveAspectRatio="none">
          <path d="M0,175 C200,190 460,225 720,235 C940,245 1100,260 1200,265 L1200,340 L0,340 Z" fill="#2564F4" />
        </svg>
        <svg className="tide-wave-layer wave-layer-4" viewBox="0 0 1200 340" preserveAspectRatio="none">
          <path d="M0,250 C260,265 540,278 800,285 C1000,290 1120,296 1200,300 L1200,340 L0,340 Z" fill="#0C286D" />
        </svg>
      </div>

      <div className="login-content-container signup-content">
        <button 
          type="button" 
          className="back-nav-btn"
          onClick={onSwitchToLogin}
          aria-label="Back to login"
        >
          <ArrowLeft size={18} />
          <span>Back to Log in</span>
        </button>

        {/* Logo Badge */}
        <div className="app-logo-badge small-badge" aria-label="Blue Harvest Logo">
          <svg className="fish-swim-icon" width="40" height="40" viewBox="0 0 48 48" fill="none">
            <path d="M6 24 C12 11, 24 8, 33 13 L42 7 V37 L33 31 C24 36, 12 33, 6 24 Z" fill="#FFFFFF"/>
            <circle cx="15" cy="21" r="2.8" fill="#2564F4"/>
          </svg>
        </div>

        <h1 className="app-title small-title">Register Hatchery</h1>
        <p className="app-subtitle">Join 12,000+ farmers counting fish spawn with AI</p>

        <form className="login-form signup-form" onSubmit={handleSubmit} noValidate>
          {/* Full Name */}
          <div className={`form-group ${errors.fullName ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-fullname">Full Name</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-fullname"
                type="text"
                className="neumorphic-input"
                placeholder="e.g. Samarth Rao"
                value={formData.fullName}
                onChange={(e) => handleChange('fullName', e.target.value)}
              />
            </div>
            {errors.fullName && <span className="field-error-message">{errors.fullName}</span>}
          </div>

          {/* Username */}
          <div className={`form-group ${errors.username ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-username">Username</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-username"
                type="text"
                className="neumorphic-input"
                placeholder="Choose username"
                value={formData.username}
                onChange={(e) => handleChange('username', e.target.value)}
              />
            </div>
            {errors.username && <span className="field-error-message">{errors.username}</span>}
          </div>

          {/* Required Email */}
          <div className={`form-group ${errors.email ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-email">Email Address</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                className="neumorphic-input"
                placeholder="you@hatchery.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                required
              />
            </div>
            {errors.email && <span className="field-error-message">{errors.email}</span>}
          </div>

          {/* Optional Phone */}
          <div className="form-group">
            <label className="form-label" htmlFor="reg-phone">Phone Number (Optional)</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-phone"
                type="tel"
                autoComplete="tel"
                className="neumorphic-input"
                placeholder="+91 98765 43210"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
          </div>

          {/* Pond/Farm Location */}
          <div className={`form-group ${errors.pondLocation ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-pond">Farm / Pond Location</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-pond"
                type="text"
                className="neumorphic-input"
                placeholder="e.g. Coastal Hatchery Pond #3"
                value={formData.pondLocation}
                onChange={(e) => handleChange('pondLocation', e.target.value)}
              />
            </div>
            {errors.pondLocation && <span className="field-error-message">{errors.pondLocation}</span>}
          </div>

          {/* Password */}
          <div className={`form-group ${errors.password ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-password">Password</label>
            <div className="neumorphic-input-box password-box">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                className="neumorphic-input"
                placeholder="Create secure password"
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
              />
              <button
                type="button"
                className="eye-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && <span className="field-error-message">{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div className={`form-group ${errors.confirmPassword ? 'has-error' : ''}`}>
            <label className="form-label" htmlFor="reg-confirm">Confirm Password</label>
            <div className="neumorphic-input-box">
              <input
                id="reg-confirm"
                type="password"
                className="neumorphic-input"
                placeholder="Re-enter password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
              />
            </div>
            {errors.confirmPassword && <span className="field-error-message">{errors.confirmPassword}</span>}
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="action-btn primary-login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-loading-state">
                <Loader2 size={19} className="spin-icon" />
                <span>Creating Account…</span>
              </span>
            ) : (
              <span>Create Account</span>
            )}
          </button>
        </form>
        {errors.form && <div className="field-error-message" role="alert" style={{ marginTop: 8 }}>{errors.form}</div>}

        <div className="bottom-wave-section">
          <p className="registration-prompt">Already have an account?</p>
          <button
            type="button"
            className="action-btn signup-switch-btn"
            onClick={onSwitchToLogin}
          >
            Log in
          </button>
        </div>
      </div>
    </div>
  );
}
