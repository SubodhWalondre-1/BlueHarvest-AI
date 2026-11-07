import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compressImageIfNeeded, MAX_SAFE_UPLOAD_BYTES, MAX_IMAGE_DIMENSION } from '../src/utils/imageCompressor.js';

test('constants expose safe limits below backend 12 MB threshold', () => {
  assert.equal(MAX_SAFE_UPLOAD_BYTES, 8 * 1024 * 1024);
  assert.ok(MAX_SAFE_UPLOAD_BYTES < 12 * 1024 * 1024, 'Safe upload threshold must be strictly below 12 MB');
  assert.equal(MAX_IMAGE_DIMENSION, 4096, 'Max dimension must preserve 4K resolution for P2PNet fry counting');
});

test('compressImageIfNeeded leaves small files untouched', async () => {
  const smallMockFile = {
    name: 'tray-sample.jpg',
    type: 'image/jpeg',
    size: 2 * 1024 * 1024, // 2 MB
  };
  const result = await compressImageIfNeeded(smallMockFile);
  assert.strictEqual(result, smallMockFile, 'Files under safe threshold must pass through without re-encoding');
});

test('compressImageIfNeeded ignores non-image files', async () => {
  const textFile = {
    name: 'notes.txt',
    type: 'text/plain',
    size: 15 * 1024 * 1024, // 15 MB text file
  };
  const result = await compressImageIfNeeded(textFile);
  assert.strictEqual(result, textFile, 'Non-image files must not be processed');
});

test('compressImageIfNeeded gracefully falls back if run outside browser', async () => {
  // In Node environment without window/document canvas, it safely returns original file
  const largeMockFile = {
    name: 'huge-fry-tray.png',
    type: 'image/png',
    size: 25 * 1024 * 1024, // 25 MB
  };
  const result = await compressImageIfNeeded(largeMockFile);
  assert.strictEqual(result, largeMockFile);
});
