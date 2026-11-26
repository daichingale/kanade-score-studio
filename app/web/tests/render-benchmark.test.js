import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../src/core.js');
const Bench = require('../src/render-benchmark.js');

describe('KanadeRenderBench', () => {
  test('batchLatency coalesces rapid schedules', () => {
    const { medianMs, flushes, iterations } = Bench.batchLatency(32, 16);
    assert.ok(iterations === 32);
    assert.ok(flushes < iterations);
    assert.ok(medianMs < 20);
  });

  test('buildScore creates requested measures with notes', () => {
    const score = Bench.buildScore(8, 1);
    assert.equal(score.measures.length, 8);
    assert.equal(score.measures.reduce((n, bar) => n + bar.events.length, 0), 8);
  });
});