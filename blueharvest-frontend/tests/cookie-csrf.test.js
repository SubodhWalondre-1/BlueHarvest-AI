import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { apiRequest, logoutUser, restoreAuthSession, setAccessToken } from '../src/api/client.js';

beforeEach(() => {
  const storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' } };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  setAccessToken('test-csrf-access-token');
});

function assertProtectedRequest(options) {
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'include');
  const headers = new Headers(options.headers);
  assert.equal(headers.get('X-CSRF-Protection'), '1');
  assert.equal(headers.has('Origin'), false);
}

test('logout sends the CSRF header with the cookie request', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/auth/logout'));
    assertProtectedRequest(options);
    return Response.json({ ok: true });
  });
  await logoutUser();
  assert.equal(sessionStorage.getItem('bh_access_token'), null);
});

test('automatic token refresh sends the CSRF header before retrying the original request', async (t) => {
  let protectedCalls = 0;
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/refresh')) {
      refreshes += 1;
      assertProtectedRequest(options);
      return Response.json({ access_token: 'test-csrf-refreshed-token' });
    }
    protectedCalls += 1;
    if (protectedCalls === 1) return Response.json({ detail: 'Expired token' }, { status: 401 });
    assert.equal(options.headers.get('Authorization'), 'Bearer test-csrf-refreshed-token');
    return Response.json({ ok: true });
  });
  assert.deepEqual(await apiRequest('/api/users/me'), { ok: true });
  assert.equal(refreshes, 1);
  assert.equal(protectedCalls, 2);
});

test('session restoration refresh path sends the CSRF header without an access token', async (t) => {
  setAccessToken(null);
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/me')) return Response.json({ detail: 'Not signed in' }, { status: 401 });
    assert.ok(url.endsWith('/api/auth/refresh'));
    assertProtectedRequest(options);
    return Response.json({ access_token: 'test-restored-token', user: { id: 'test-user' } });
  });
  assert.deepEqual(await restoreAuthSession(), { id: 'test-user' });
});

test('CSRF rejection during automatic refresh does not cause a retry loop', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls += 1;
    if (url.endsWith('/api/auth/refresh')) {
      assertProtectedRequest(options);
      return Response.json({ detail: { code: 'csrf_failed', message: 'Untrusted origin' } }, { status: 403 });
    }
    return Response.json({ detail: 'Expired token' }, { status: 401 });
  });
  await assert.rejects(apiRequest('/api/users/me'), (error) => error.status === 401);
  assert.equal(calls, 2);
  assert.equal(sessionStorage.getItem('bh_access_token'), null);
});

test('non-cookie API requests retain their existing headers', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.headers.has('X-CSRF-Protection'), false);
    assert.equal(options.headers.get('Authorization'), 'Bearer test-csrf-access-token');
    return Response.json({ ok: true });
  });
  await apiRequest('/api/users/me');
});

test('generic cookie requests enforce the expected marker value', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assertProtectedRequest(options);
    return Response.json({ ok: true });
  });
  await apiRequest('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Protection': 'wrong' } });
});
