import React, { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { loginUser, loginWithGoogleCredential } from '../api/client';

const loadGoogleIdentityScript = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.id) return resolve();
  const existing = document.querySelector('script[data-google-identity]');
  if (existing) {
    existing.addEventListener('load', resolve, { once: true });
    existing.addEventListener('error', reject, { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://accounts.google.com/gsi/client';
  script.async = true;
  script.defer = true;
  script.dataset.googleIdentity = 'true';
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

export default function LoginView({ 
  onLoginSuccess, 
  onSwitchToSignUp, 
  onForgotPassword 
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    const newErrors = {};

    if (!username.trim()) newErrors.username = 'Please enter your username';
    if (!password) newErrors.password = 'Please enter your password';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setAuthError('');
    setIsLoading(true);
    try {
      const result = await loginUser({ username: username.trim(), password });
      onLoginSuccess?.(result.user);
    } catch (error) {
      setAuthError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setAuthError('Google sign-in is not configured yet. Set VITE_GOOGLE_CLIENT_ID after creating a Google OAuth Web Client.');
      return;
    }

    setIsLoading(true);
    try {
      await loadGoogleIdentityScript();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (credentialResponse) => {
          try {
            if (!credentialResponse?.credential) throw new Error('Google did not return an identity credential.');
            const result = await loginWithGoogleCredential(credentialResponse.credential);
            onLoginSuccess?.(result.user);
          } catch (error) {
            setAuthError(error.message || 'Google sign-in failed.');
          } finally {
            setIsLoading(false);
          }
        },
      });
      window.google.accounts.id.prompt();
      setIsLoading(false);
    } catch {
      setAuthError('Google sign-in could not load. Check your network and OAuth configuration.');
      setIsLoading(false);
    }
  };

  const [isDemoFilled, setIsDemoFilled] = useState(false);

  const handleFillDemo = () => {
    setUsername('samarth_aquafarm');
    setPassword('SpawnCounter2026!');
    setErrors({ username: '', password: '' });
    setIsDemoFilled(true);
    setTimeout(() => setIsDemoFilled(false), 2500);
  };

  return (
    <div className="login-screen-wrapper">
      {/* Background Animated Tidal Waves */}
      <div className="waves-tide-container" aria-hidden="true">
        {/* Layer 1: Top Light Powder Blue Wave */}
        <svg 
          className="tide-wave-layer wave-layer-1" 
          viewBox="0 0 1200 340" 
          preserveAspectRatio="none"
        >
          <path 
            d="M0,75 C250,45 520,115 800,90 C1000,72 1120,60 1200,55 L1200,340 L0,340 Z" 
            fill="#BED7FF" 
            opacity="0.95"
          />
        </svg>

        {/* Layer 2: Medium Soft Blue Wave */}
        <svg 
          className="tide-wave-layer wave-layer-2" 
          viewBox="0 0 1200 340" 
          preserveAspectRatio="none"
        >
          <path 
            d="M0,120 C220,135 480,180 740,175 C950,170 1100,150 1200,145 L1200,340 L0,340 Z" 
            fill="#7AA6FF" 
          />
        </svg>

        {/* Layer 3: Vivid Royal Blue Wave */}
        <svg 
          className="tide-wave-layer wave-layer-3" 
          viewBox="0 0 1200 340" 
          preserveAspectRatio="none"
        >
          <path 
            d="M0,175 C200,190 460,225 720,235 C940,245 1100,260 1200,265 L1200,340 L0,340 Z" 
            fill="#2564F4" 
          />
        </svg>

        {/* Layer 4: Deep Navy Foundation Wave */}
        <svg 
          className="tide-wave-layer wave-layer-4" 
          viewBox="0 0 1200 340" 
          preserveAspectRatio="none"
        >
          <path 
            d="M0,250 C260,265 540,278 800,285 C1000,290 1120,296 1200,300 L1200,340 L0,340 Z" 
            fill="#0C286D" 
          />
        </svg>
      </div>

      <div className="login-content-container">
        {/* Temporary Demo Credentials Tab in Top Right */}
        <button
          type="button"
          className={`demo-credentials-tab ${isDemoFilled ? 'filled' : ''}`}
          onClick={handleFillDemo}
          title="Auto-fill Demo Credentials (samarth_aquafarm / SpawnCounter2026!)"
          aria-label="Auto-fill demo credentials"
        >
          <span className="demo-tab-icon">{isDemoFilled ? '✓' : '⚡'}</span>
          <span className="demo-tab-text">{isDemoFilled ? 'Filled!' : 'Demo'}</span>
        </button>

        {/* Blue Harvest Logo Badge */}
        <div className="app-logo-badge" aria-label="Blue Harvest Logo">
          <svg 
            className="fish-swim-icon"
            width="50" 
            height="50" 
            viewBox="0 0 48 48" 
            fill="none"
          >
            {/* Streamlined Fish Silhouette */}
            <path 
              d="M6 24 C12 11, 24 8, 33 13 L42 7 V37 L33 31 C24 36, 12 33, 6 24 Z" 
              fill="#FFFFFF"
            />
            {/* Fish Eye */}
            <circle cx="15" cy="21" r="2.8" fill="#2564F4"/>
          </svg>
        </div>

        {/* Title & Tagline */}
        <h1 className="app-title">Blue Harvest</h1>
        <p className="app-subtitle">Count fish spawn live with your camera</p>

        {/* Main Form */}
        <form className="login-form" onSubmit={handleLogin} noValidate>
          {/* Username Field */}
          <div className={`form-group ${errors.username ? 'has-error' : ''}`}>
            <label htmlFor="username-input" className="form-label">
              Username
            </label>
            <div className="neumorphic-input-box">
              <input
                id="username-input"
                type="text"
                className="neumorphic-input"
                placeholder="Enter your username"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errors.username) setErrors(prev => ({ ...prev, username: '' }));
                }}
                disabled={isLoading}
              />
            </div>
            {errors.username && (
              <span className="field-error-message">{errors.username}</span>
            )}
          </div>

          {/* Password Field */}
          <div className={`form-group ${errors.password ? 'has-error' : ''}`}>
            <label htmlFor="password-input" className="form-label">
              Password
            </label>
            <div className="neumorphic-input-box password-box">
              <input
                id="password-input"
                type={showPassword ? 'text' : 'password'}
                className="neumorphic-input"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors(prev => ({ ...prev, password: '' }));
                }}
                disabled={isLoading}
              />
              <button
                type="button"
                className="eye-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={19} className="eye-icon" />
                ) : (
                  <Eye size={19} className="eye-icon" />
                )}
              </button>
            </div>
            {errors.password && (
              <span className="field-error-message">{errors.password}</span>
            )}
          </div>

          {/* Forgot Password link */}
          <div className="forgot-password-row">
            <button
              type="button"
              className="forgot-link"
              onClick={onForgotPassword}
            >
              Forgot password?
            </button>
          </div>

          {/* Primary Log In Button */}
          <button
            type="submit"
            className="action-btn primary-login-btn"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="btn-loading-state">
                <Loader2 size={20} className="spin-icon" />
                <span>Logging in…</span>
              </span>
            ) : (
              <span>Log in</span>
            )}
          </button>
        </form>
        {authError && <div className="field-error-message" role="alert" style={{ marginTop: 8 }}>{authError}</div>}

        {/* Continue with Google */}
        <button
          type="button"
          className="action-btn google-login-btn"
          onClick={handleGoogleLogin}
          disabled={isLoading}
        >
          {/* Authentic Google Multi-color G */}
          <svg className="google-icon" width="22" height="22" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          <span className="google-btn-text">Continue with Google</span>
        </button>

        {/* Bottom Section Resting on Wave */}
        <div className="bottom-wave-section">
          <p className="registration-prompt">Not registered yet?</p>
          <button
            type="button"
            className="action-btn signup-switch-btn"
            onClick={onSwitchToSignUp}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}
