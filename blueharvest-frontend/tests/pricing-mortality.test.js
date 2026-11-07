import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBatchPrice, formatPriceINR } from '../src/utils/pricing.js';
import { calculateMortalityAnalysis } from '../src/utils/mortality.js';

test('calculateBatchPrice computes price with base packing fee and unit rate', () => {
  assert.equal(calculateBatchPrice(0), 50.0);
  assert.equal(calculateBatchPrice(100), 52.5);
  assert.equal(calculateBatchPrice(1000), 75.0);
  assert.equal(calculateBatchPrice(-5), 50.0);
  assert.equal(calculateBatchPrice('invalid'), 50.0);
  assert.equal(calculateBatchPrice(null), 50.0);
});

test('formatPriceINR formats calculated price in Indian Rupee format', () => {
  assert.equal(formatPriceINR(0), '₹50.00');
  assert.equal(formatPriceINR(1000), '₹75.00');
});

test('calculateMortalityAnalysis computes survival and losses across scenarios', () => {
  const analysis = calculateMortalityAnalysis(1000);
  assert.equal(analysis.total, 1000);

  // 1 to 4 hr transit (2%)
  assert.equal(analysis.t1to4.mortalityRate, '2%');
  assert.equal(analysis.t1to4.loss, 20);
  assert.equal(analysis.t1to4.surviving, 980);
  assert.equal(analysis.t1to4.percentSurviving, '98%');

  // 12 to 24 hr transit (10%)
  assert.equal(analysis.t12to24.mortalityRate, '10%');
  assert.equal(analysis.t12to24.loss, 100);
  assert.equal(analysis.t12to24.surviving, 900);
  assert.equal(analysis.t12to24.percentSurviving, '90%');

  // Pond stocking (70%)
  assert.equal(analysis.pond70.mortalityRate, '70%');
  assert.equal(analysis.pond70.loss, 700);
  assert.equal(analysis.pond70.surviving, 300);
  assert.equal(analysis.pond70.percentSurviving, '30%');
});

test('calculateMortalityAnalysis handles zero and invalid input safely', () => {
  const analysisZero = calculateMortalityAnalysis(0);
  assert.equal(analysisZero.total, 0);
  assert.equal(analysisZero.t1to4.loss, 0);
  assert.equal(analysisZero.t1to4.surviving, 0);

  const analysisInvalid = calculateMortalityAnalysis('invalid');
  assert.equal(analysisInvalid.total, 0);
  assert.equal(analysisInvalid.pond70.surviving, 0);
});
