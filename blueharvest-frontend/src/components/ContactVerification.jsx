import { useState } from 'react';
import { confirmContactChange, requestContactChange } from '../api/client';
import './ContactVerification.css';

export default function ContactVerification({ email, phone, currentEmail, currentPhone, onVerified }) {
  const [password, setPassword] = useState('');
  const [challenges, setChallenges] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const normalizePhone = (value) => value?.replace(/[\s().-]/g, '') || null;
  const changes = [
    { channel: 'email', value: email.trim().toLowerCase(), current: currentEmail.toLowerCase() },
    { channel: 'phone', value: normalizePhone(phone), current: normalizePhone(currentPhone) },
  ].filter((item) => item.value !== item.current);
  if (!changes.length) return null;

  const sendCode = async (item) => {
    setError('');
    setBusy(item.channel);
    try {
      const result = await requestContactChange({ channel: item.channel, value: item.value, password });
      setChallenges((previous) => ({ ...previous, [item.channel]: {
        id: result.challenge_id, value: item.value, code: '', developmentCode: result.development_code,
      } }));
    } catch (failure) {
      setError(failure.message || 'Could not send the verification code.');
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async (item) => {
    setError('');
    setBusy(item.channel);
    try {
      const challenge = challenges[item.channel];
      const result = await confirmContactChange({ challengeId: challenge.id, code: challenge.code, password });
      onVerified(result.user);
    } catch (failure) {
      setError(failure.message || 'Contact verification failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="contact-verification" aria-label="Verify contact changes">
      <p>Verify each changed contact before saving your profile.</p>
      <div className="form-group">
        <label className="form-label" htmlFor="contact-current-password">Current password</label>
        <input id="contact-current-password" className="form-input" type="password" autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required />
      </div>
      {changes.map((item) => {
        const challenge = challenges[item.channel];
        const sent = challenge?.value === item.value;
        return (
          <div className="contact-verification-row" key={item.channel}>
            <p>{item.value ? `Verify ${item.channel}: ${item.value}` : 'Verify your current phone number to remove it.'}</p>
            <button type="button" className="action-btn secondary-btn" disabled={Boolean(busy) || !password}
              onClick={() => sendCode(item)}>{busy === item.channel ? 'Please wait...' : sent ? 'Resend Code' : 'Send Code'}</button>
            {sent && <>
              {challenge.developmentCode && <p className="contact-development-code">Development code: {challenge.developmentCode}</p>}
              <label className="form-label" htmlFor={`contact-code-${item.channel}`}>Verification code</label>
              <input id={`contact-code-${item.channel}`} className="form-input" inputMode="numeric" autoComplete="one-time-code"
                value={challenge.code} maxLength={6} placeholder="Six-digit code"
                onChange={(event) => setChallenges((previous) => ({ ...previous, [item.channel]: {
                  ...previous[item.channel], code: event.target.value.replace(/\D/g, ''),
                } }))} />
              <button type="button" className="action-btn primary-btn" disabled={Boolean(busy) || !password || challenge.code.length !== 6}
                onClick={() => verifyCode(item)}>Verify {item.channel}</button>
            </>}
          </div>
        );
      })}
      {error && <p className="contact-verification-error" role="alert">{error}</p>}
    </section>
  );
}
