import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { confirmContactChange, requestContactChange, setAccessToken } from '../src/api/client.js';

const challengeId = 'edff350a-45b5-401b-bf77-3aa81bbdd52c';
const password = ' CurrentPassword!123 ';
let storage;

beforeEach(() => {
  storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' } };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  setAccessToken('test-contact-access-token');
});

for (const [channel, value] of [['email', 'new@example.com'], ['phone', '+919999888877'], ['phone', null]]) {
  test(`contact change ${channel}:${value} requests verification without updating the profile`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.ok(url.endsWith('/api/users/me/contact-change/request'));
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.get('Authorization'), 'Bearer test-contact-access-token');
      assert.deepEqual(JSON.parse(options.body), { channel, value, password });
      return Response.json({ challenge_id: challengeId });
    });
    assert.equal((await requestContactChange({ channel, value, password })).challenge_id, challengeId);
    assert.deepEqual([...storage.keys()], ['bh_access_token']);
  });
}

test('confirmation sends the challenge ID, OTP, and unmodified current password', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/users/me/contact-change/confirm'));
    assert.deepEqual(JSON.parse(options.body), { challenge_id: challengeId, code: '123456', password });
    return Response.json({ user: { email: 'verified@example.com', emailVerified: true } });
  });
  const response = await confirmContactChange({ challengeId, code: '123456', password, value: 'forged@example.com' });
  assert.equal(response.user.email, 'verified@example.com');
  assert.deepEqual([...storage.keys()], ['bh_access_token']);
});

for (const status of [400, 403, 409, 429, 503]) {
  test(`contact verification error ${status} is surfaced without a direct profile update`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url) => {
      calls += 1;
      assert.ok(url.endsWith('/api/users/me/contact-change/request'));
      return Response.json({ detail: { code: 'contact_change_failed', message: 'Contact change could not be verified.' } }, { status });
    });
    await assert.rejects(requestContactChange({ channel: 'email', value: 'new@example.com', password }), (error) => error.status === status);
    assert.equal(calls, 1);
    assert.equal(storage.get('bh_access_token'), 'test-contact-access-token');
  });
}
