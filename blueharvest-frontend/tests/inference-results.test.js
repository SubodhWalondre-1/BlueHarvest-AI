import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { listCountSessions, processImage, saveCountSession, setAccessToken } from '../src/api/client.js';

const sessionId = 'd057e6ab-4610-42a8-a929-65f38f62cb57';

beforeEach(() => {
  const storage = new Map();
  globalThis.window = { location: { hostname: 'localhost', origin: 'http://localhost:5173' } };
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  setAccessToken('test-inference-token');
});

test('saving sends only the backend session ID and returns stored metrics', async (t) => {
  const stored = { session_id: sessionId, count: 17, confidence: '93.0%', image: '/api/uploads/owned.png', is_saved: true };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/api/count-sessions'));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), 'Bearer test-inference-token');
    assert.deepEqual(JSON.parse(options.body), { session_id: sessionId });
    return Response.json({ session: stored });
  });
  const result = await saveCountSession(sessionId, { count: 999999, confidence: 1, image_path: 'forged' });
  assert.deepEqual(result, stored);
});

for (const session of [undefined, null, '', '   ', { count: 999999 }, 999999]) {
  test(`missing or invalid session is rejected before a save request: ${JSON.stringify(session)}`, async (t) => {
    t.mock.method(globalThis, 'fetch', () => assert.fail('Invalid session reached fetch'));
    await assert.rejects(saveCountSession(session), /backend inference session is required/);
  });
}

for (const source of ['Uploaded', 'Camera']) {
  test(`inference uploads the image and its ${source} source before saving`, async (t) => {
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'sample.png', { type: 'image/png' });
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.ok(url.endsWith('/api/image-processing'));
      assert.equal(options.method, 'POST');
      assert.ok(options.body instanceof FormData);
      assert.deepEqual([...options.body.keys()], ['image', 'source']);
      assert.equal(options.body.get('source'), source);
      assert.equal(options.body.get('image').name, 'sample.png');
      return Response.json({ session_id: sessionId, final_fish_count: 17 });
    });
    const response = await processImage(file, source);
    assert.equal(response.session_id, sessionId);
  });
}

test('ledger requests exclude unsaved inference previews by default', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const params = new URL(url).searchParams;
    assert.equal(params.get('include_unsaved'), 'false');
    assert.equal(params.get('include_demo'), 'false');
    assert.equal(params.has('include_unverified'), false);
    return Response.json({ items: [{ session_id: sessionId }] });
  });
  assert.deepEqual(await listCountSessions(), [{ session_id: sessionId }]);
});

for (const status of [404, 409, 429]) {
  test(`save failure ${status} is surfaced without submitting replacement metrics`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      calls += 1;
      assert.deepEqual(JSON.parse(options.body), { session_id: sessionId });
      return Response.json({ detail: { code: 'save_failed', message: 'Could not save this session.' } }, { status });
    });
    await assert.rejects(saveCountSession(sessionId), (error) => error.status === status);
    assert.equal(calls, 1);
  });
}

test('token refresh retries the same save with only its session ID', async (t) => {
  let saves = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/api/auth/refresh')) {
      return Response.json({ access_token: 'test-refreshed-inference-token' });
    }
    saves += 1;
    assert.deepEqual(JSON.parse(options.body), { session_id: sessionId });
    if (saves === 1) return Response.json({ detail: 'Expired token' }, { status: 401 });
    assert.equal(options.headers.get('Authorization'), 'Bearer test-refreshed-inference-token');
    return Response.json({ session: { session_id: sessionId, count: 17 } });
  });
  assert.equal((await saveCountSession(sessionId)).count, 17);
  assert.equal(saves, 2);
});
