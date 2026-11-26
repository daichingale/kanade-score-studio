import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');
const FE = require('../src/fast-entry.js');

describe('KanadeFastEntry', () => {
  test('maybeFillBar adds quarter rest when bar tail is exactly one quarter', () => {
    let score = C.createScore();
    const { score: withNote } = C.placeAcrossBars(score, 0, 0, C.makeNote({ step: 'C', octave: 4, alter: 0 }, 4));
    const filled = FE.maybeFillBar(withNote, 0, C.TPQ, 4);
  assert.equal(filled.measures[0].events.length, 2);
    assert.equal(filled.measures[0].events[1].type, 'rest');
  });

  test('repeatPreviousBar copies events into current measure', () => {
    let score = C.createScore();
    score = C.placeAcrossBars(score, 0, 0, C.makeNote({ step: 'G', octave: 4, alter: 0 }, 4)).score;
    score = C.addMeasure(score);
    const result = FE.repeatPreviousBar(score, 1);
    assert.equal(result.score.measures[1].events.length, 1);
    assert.equal(result.score.measures[1].events[0].pitches[0].step, 'G');
    assert.notEqual(result.score.measures[0].events[0].id, result.score.measures[1].events[0].id);
  });
});