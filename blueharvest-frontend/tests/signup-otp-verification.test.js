import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { signupUser, verifySignupOtp, resendSignupOtp, setAccessToken } from '../src/api/client.js';

let storage;

beforeEach(() => {
  storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' } };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  setAccessToken(null);
});

test('signupUser sends registration data and receives verification_required without setting access token', async (t) => {
  const payload = {
    fullName: 'Ravi Kumar',
    username: 'ravi_farmer',
    email: 'ravi@example.com',
    phone: '+919876543210',
    pondLocation: 'Pond Alpha',
    password: 'SecurePassword!123',
  };

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/signup'));
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      full_name: payload.fullName,
      username: payload.username,
      email: payload.email,
      phone: payload.phone,
      pond_location: payload.pondLocation,
      password: payload.password,
    });
    return Response.json({
      verification_required: true,
      email: 'ravi@example.com',
      challenge_id: 'challenge-1234',
      message: 'Verification code sent.',
    });
  });

  const result = await signupUser(payload);
  assert.equal(result.verification_required, true);
  assert.equal(result.email, 'ravi@example.com');
  // Access token should NOT be stored yet
  assert.ok(!storage.get('bh_access_token'));
});

test('verifySignupOtp sends email and 6-digit code, then sets stored access token on success', async (t) => {
  const verifyPayload = {
    email: 'ravi@example.com',
    code: '123456',
  };

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/signup/verify'));
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      email: 'ravi@example.com',
      code: '123456',
    });
    return Response.json({
      access_token: 'verified-signup-token',
      token_type: 'bearer',
      user: {
        id: 'user-ravi-1',
        username: 'ravi_farmer',
        email: 'ravi@example.com',
      },
    });
  });

  const result = await verifySignupOtp(verifyPayload);
  assert.equal(result.access_token, 'verified-signup-token');
  assert.equal(result.user.username, 'ravi_farmer');
  assert.equal(storage.get('bh_access_token'), 'verified-signup-token');
});

test('resendSignupOtp sends email to request a new OTP challenge', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/signup/resend'));
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      email: 'ravi@example.com',
    });
    return Response.json({
      verification_required: true,
      email: 'ravi@example.com',
      message: 'New code sent.',
    });
  });

  const result = await resendSignupOtp({ email: 'ravi@example.com' });
  assert.equal(result.verification_required, true);
  assert.equal(result.message, 'New code sent.');
});

