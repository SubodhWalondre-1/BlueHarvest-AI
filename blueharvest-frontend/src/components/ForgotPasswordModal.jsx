import React, { useEffect, useState } from 'react';
import { X, Mail, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { requestPasswordReset, verifyPasswordReset, confirmPasswordReset } from '../api/client';

export default function ForgotPasswordModal({ isOpen, onClose }) {
  const [destination, setDestination] = useState('');
  const [step, setStep] = useState('request');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [developmentCode, setDevelopmentCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep('request');
      setDestination('');
      setCode('');
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setDevelopmentCode('');
      setError('');
      setMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestCode = async (e) => {
    e.preventDefault();
    const value = destination.trim();
    if (!value || (value.includes('@') ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) : value.replace(/\D/g, '').length < 8)) {
      setError('Enter a valid registered email address or phone number');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const result = await requestPasswordReset(value);
      setDevelopmentCode(result.development_code || '');
      setMessage(result.message || 'If an account matches, a recovery code has been sent.');
      setStep('verify');
    } catch (requestError) {
      setError(requestError.message || 'Could not send a recovery code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit verification code');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      const result = await verifyPasswordReset(destination.trim(), code.trim());
      setResetToken(result.reset_token);
      setStep('reset');
    } catch (verifyError) {
      setError(verifyError.message || 'The verification code is invalid or expired.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await confirmPasswordReset(destination.trim(), resetToken, newPassword);
      setStep('complete');
      setMessage('Your password has been updated. Sign in with the new password.');
    } catch (resetError) {
      setError(resetError.message || 'Could not update the password. Request a new code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('request');
    setDestination('');
    setCode('');
    setResetToken('');
    setNewPassword('');
    setConfirmPassword('');
    setDevelopmentCode('');
    setError('');
    setMessage('');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={handleClose} aria-label="Close modal">
          <X size={20} />
        </button>

        {step === 'complete' ? (
          <div className="modal-success-state">
            <div className="modal-icon-badge success-badge">
              <CheckCircle2 size={32} className="success-icon" />
            </div>
            <h2 className="modal-title">Password Updated</h2>
            <p className="modal-description">{message}</p>
            <button type="button" className="action-btn primary-login-btn" onClick={handleClose}>Back to Login</button>
          </div>
        ) : (
          <>
            <div className="modal-icon-badge">
              {step === 'request' ? <Mail size={26} className="modal-badge-icon" /> : <CheckCircle2 size={26} className="modal-badge-icon" />}
            </div>
            <h2 className="modal-title">
              {step === 'request' ? 'Reset Password' : step === 'verify' ? 'Verify Recovery Code' : 'Create New Password'}
            </h2>
            <p className="modal-description">
              {step === 'request'
                ? "Enter your registered email or phone number. We'll send a 6-digit verification code."
                : step === 'verify'
                  ? `Enter the 6-digit code sent to ${destination}.`
                  : 'Choose a new password with at least 8 characters.'}
            </p>

            {step === 'request' && (
              <form onSubmit={handleRequestCode} className="modal-form">
                <div className={`form-group ${error ? 'has-error' : ''}`}>
                  <label className="form-label">Email or Mobile Number</label>
                  <div className="neumorphic-input-box">
                    <input
                      type="text"
                      className="neumorphic-input"
                      placeholder="farmer@aquatech.com or +91..."
                      value={destination}
                      onChange={(e) => { setDestination(e.target.value); setError(''); }}
                      autoFocus
                      autoComplete="email"
                    />
                  </div>
                  {error && <span className="field-error-message">{error}</span>}
                </div>
                <button type="submit" className="action-btn primary-login-btn modal-submit-btn" disabled={isLoading}>
                  {isLoading ? <span className="btn-loading-state"><Loader2 size={18} className="spin-icon" /><span>Sending code…</span></span> : <span>Send Recovery Code</span>}
                </button>
              </form>
            )}

            {step === 'verify' && (
              <form onSubmit={handleVerifyCode} className="modal-form">
                {message && <p className="modal-description">{message}</p>}
                {developmentCode && (
                  <div className="field-error-message" role="status" style={{ marginBottom: 12 }}>
                    Local development OTP: <strong>{developmentCode}</strong>. This appears only when DEV_EXPOSE_OTP is enabled in development.
                  </div>
                )}
                <div className={`form-group ${error ? 'has-error' : ''}`}>
                  <label className="form-label">6-Digit Code</label>
                  <div className="neumorphic-input-box">
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="neumorphic-input" placeholder="000000" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }} autoFocus />
                  </div>
                  {error && <span className="field-error-message">{error}</span>}
                </div>
                <button type="submit" className="action-btn primary-login-btn modal-submit-btn" disabled={isLoading}>
                  {isLoading ? <span className="btn-loading-state"><Loader2 size={18} className="spin-icon" /><span>Verifying…</span></span> : <span>Verify Code <ArrowRight size={16} /></span>}
                </button>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={handleSetNewPassword} className="modal-form">
                <div className={`form-group ${error ? 'has-error' : ''}`}>
                  <label className="form-label">New Password</label>
                  <div className="neumorphic-input-box"><input type="password" className="neumorphic-input" autoComplete="new-password" placeholder="At least 8 characters" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} autoFocus /></div>
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm New Password</label>
                  <div className="neumorphic-input-box"><input type="password" className="neumorphic-input" autoComplete="new-password" placeholder="Re-enter new password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} /></div>
                  {error && <span className="field-error-message">{error}</span>}
                </div>
                <button type="submit" className="action-btn primary-login-btn modal-submit-btn" disabled={isLoading}>
                  {isLoading ? <span className="btn-loading-state"><Loader2 size={18} className="spin-icon" /><span>Updating password…</span></span> : <span>Update Password</span>}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
