import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  apiRequest, fetchUploadedImage, getApiBaseUrl, getPrivateImagePath, setAccessToken,
} from '../src/api/client.js';

const imagePath = `/api/uploads/${'a'.repeat(32)}.png`;
const png = new Uint8Array([137, 80, 78, 71]);

beforeEach(() => {
  const storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' } };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  setAccessToken('test-owner-access-token');
});

test('private image requests use bearer authentication and return binary data', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, `${getApiBaseUrl()}${imagePath}`);
    assert.equal(options.headers.get('Authorization'), 'Bearer test-owner-access-token');
    assert.equal(options.credentials, 'include');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.signal, controller.signal);
    assert.ok(!url.includes('access-token'));
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  const blob = await fetchUploadedImage(imagePath, { signal: controller.signal });
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), png);
});

test('absolute image URLs from the configured API resolve to the protected route', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, `${getApiBaseUrl()}${imagePath}`);
    return new Response(png);
  });
  const source = `${getApiBaseUrl()}${imagePath}`;
  assert.equal(getPrivateImagePath(source), imagePath);
  assert.ok(await fetchUploadedImage(source) instanceof Blob);
});

for (const source of [
  `https://untrusted.example${imagePath}`,
  `http://localhost:8000.untrusted.example${imagePath}`,
  `http://localhost:8000@untrusted.example${imagePath}`,
  `${imagePath}?access_token=secret`,
  `${imagePath}#fragment`,
  '/api/uploads/../private.png',
  '/api/uploads/%2e%2e%2fprivate.png',
  '//untrusted.example/api/uploads/private.png',
]) {
  test(`unsafe source is rejected before sending credentials: ${source}`, async (t) => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('Unsafe image URL reached fetch'));
    await assert.rejects(fetchUploadedImage(source), /Invalid private image URL/);
  });
}

test('local previews and public assets do not use authenticated image fetching', () => {
  for (const source of [null, undefined, 123, '/assets/hero.png', 'blob:preview-image', 'data:image/png;base64,cHJldmlldw==']) {
    assert.equal(getPrivateImagePath(source), null);
  }
});

test('an expired image token refreshes once and retries with binary response parsing', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/auth/refresh')) {
      return Response.json({ access_token: 'test-refreshed-token' });
    }
    if (options.headers.get('Authorization') === 'Bearer test-owner-access-token') {
      return Response.json({ detail: { code: 'invalid_token', message: 'Expired token' } }, { status: 401 });
    }
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  const blob = await fetchUploadedImage(imagePath);
  assert.equal(blob.type, 'image/png');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].options.headers.get('Authorization'), 'Bearer test-refreshed-token');
  assert.equal(calls[2].options.responseType, undefined);
});

test('parallel private thumbnails share a single token refresh', async (t) => {
  let refreshes = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/refresh')) {
      refreshes += 1;
      return Response.json({ access_token: 'test-refreshed-token' });
    }
    if (options.headers.get('Authorization') === 'Bearer test-owner-access-token') {
      return new Response(null, { status: 401 });
    }
    return new Response(png);
  });
  const blobs = await Promise.all([fetchUploadedImage(imagePath), fetchUploadedImage(imagePath)]);
  assert.ok(blobs.every((blob) => blob instanceof Blob));
  assert.equal(refreshes, 1);
});

test('missing or unauthorized images preserve the API error without refreshing', async (t) => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json(
    { detail: { code: 'image_not_found', message: 'Uploaded image not found.' } }, { status: 404 },
  ));
  await assert.rejects(fetchUploadedImage(imagePath), (error) => error.status === 404 && error.code === 'image_not_found');
  assert.equal(mocked.mock.callCount(), 1);
});

test('failed session refresh rejects the image and clears the stored access token', async (t) => {
  const mocked = t.mock.method(globalThis, 'fetch', async () => Response.json(
    { detail: { code: 'invalid_session', message: 'Sign in again.' } }, { status: 401 },
  ));
  await assert.rejects(fetchUploadedImage(imagePath), (error) => error.status === 401);
  assert.equal(mocked.mock.callCount(), 2);
  assert.equal(sessionStorage.getItem('bh_access_token'), null);
});

test('image request cancellation reaches fetch', async (t) => {
  const controller = new AbortController();
  controller.abort();
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.signal, controller.signal);
    throw new DOMException('Request aborted', 'AbortError');
  });
  await assert.rejects(fetchUploadedImage(imagePath, { signal: controller.signal }), (error) => error.name === 'AbortError');
});

test('existing JSON API requests retain their response behavior', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ user: { id: 'test-user' } }));
  assert.deepEqual(await apiRequest('/api/auth/me'), { user: { id: 'test-user' } });
});
