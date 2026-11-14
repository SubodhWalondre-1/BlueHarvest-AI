import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  signupUser,
  verifySignupOtp,
  resendSignupOtp,
  verifyGoogleOtp,
  resendGoogleOtp,
  setAccessToken,
} from '../src/api/client.js';

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
      channel: 'sms',
      destination: '+919876543210',
      message: 'Verification code sent via SMS.',
    });
  });

  const result = await signupUser(payload);
  assert.equal(result.verification_required, true);
  assert.equal(result.channel, 'sms');
  assert.equal(result.destination, '+919876543210');
  // Access token should NOT be stored yet
  assert.ok(!storage.get('bh_access_token'));
});

test('verifySignupOtp sends destination (phone) and 6-digit code, then sets stored access token on success', async (t) => {
  const verifyPayload = {
    destination: '+919876543210',
    code: '123456',
  };

  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/signup/verify'));
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.destination, '+919876543210');
    assert.equal(body.code, '123456');
    return Response.json({
      access_token: 'verified-signup-token',
      token_type: 'bearer',
      user: {
        id: 'user-ravi-1',
        username: 'ravi_farmer',
        email: 'ravi@example.com',
        phone: '+919876543210',
      },
    });
  });

  const result = await verifySignupOtp(verifyPayload);
  assert.equal(result.access_token, 'verified-signup-token');
  assert.equal(result.user.username, 'ravi_farmer');
  assert.equal(storage.get('bh_access_token'), 'verified-signup-token');
});

test('resendSignupOtp sends destination to request a new OTP challenge', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/signup/resend'));
    assert.equal(options.method, 'POST');
    const body = JSON.parse(options.body);
    assert.equal(body.destination, '+919876543210');
    return Response.json({
      verification_required: true,
      channel: 'sms',
      destination: '+919876543210',
      message: 'New code sent via SMS.',
    });
  });

  const result = await resendSignupOtp({ destination: '+919876543210' });
  assert.equal(result.verification_required, true);
  assert.equal(result.message, 'New code sent via SMS.');
});

test('verifyGoogleOtp sends challenge_id and 6-digit code, then sets stored access token on success', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/google/verify-otp'));
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      challenge_id: 'google-chal-789',
      code: '654321',
    });
    return Response.json({
      access_token: 'verified-google-token',
      token_type: 'bearer',
      user: {
        id: 'user-google-1',
        username: 'google_user',
        email: 'user@gmail.com',
      },
    });
  });

  const result = await verifyGoogleOtp({ challenge_id: 'google-chal-789', code: '654321' });
  assert.equal(result.access_token, 'verified-google-token');
  assert.equal(result.user.email, 'user@gmail.com');
  assert.equal(storage.get('bh_access_token'), 'verified-google-token');
});

test('resendGoogleOtp sends challenge_id to request a fresh Email OTP challenge', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/google/resend-otp'));
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {
      challenge_id: 'google-chal-789',
    });
    return Response.json({
      verification_required: true,
      channel: 'email',
      challenge_id: 'google-chal-789',
      message: 'New verification code sent to your email.',
    });
  });

  const result = await resendGoogleOtp({ challenge_id: 'google-chal-789' });
  assert.equal(result.verification_required, true);
  assert.equal(result.channel, 'email');
});
