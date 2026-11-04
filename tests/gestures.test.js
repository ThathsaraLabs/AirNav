import test from 'node:test';
import assert from 'node:assert/strict';
import { DwellController, mapPointer, isIndexPointing } from '../dist/gestures.js';

test('dwell activates once, releases on exit, and starts over on a new target', () => {
  const dwell = new DwellController(1000);
  const first = {}, second = {};
  assert.deepEqual(dwell.update(first, 0), { progress: 0, activate: false });
  assert.equal(dwell.update(first, 500).progress, .5);
  assert.equal(dwell.update(first, 1000).activate, true);
  assert.equal(dwell.update(first, 2500).activate, false);
  dwell.update(null, 2600);
  assert.equal(dwell.update(first, 2700).progress, 0);
  assert.equal(dwell.update(first, 3700).activate, true);
  assert.equal(dwell.update(second, 4000).activate, false);
  assert.equal(dwell.update(second, 4500).progress, .5);
  dwell.reset();
  assert.equal(dwell.update(second, 8000).activate, false);
});

test('camera coordinates mirror horizontally and clamp to reachable screen edges', () => {
  assert.deepEqual(mapPointer({ x: .5, y: .5 }, 1001, 801), { x: 500, y: 400 });
  assert.deepEqual(mapPointer({ x: 0, y: 0 }, 1001, 801), { x: 1000, y: 0 });
  assert.deepEqual(mapPointer({ x: 1, y: 1 }, 1001, 801), { x: 0, y: 800 });
});

test('index-only pose is accepted, open hand and curled index are rejected', () => {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .65 }));
  points[0] = { x: .5, y: .9 };
  points[5] = { x: .45, y: .65 };
  points[6] = { x: .45, y: .45 };
  points[8] = { x: .45, y: .2 };
  for (const [tip, pip] of [[12, 10], [16, 14], [20, 18]]) { points[pip] = { x: .6, y: .5 }; points[tip] = { x: .6, y: .7 }; }
  assert.equal(isIndexPointing(points), true);
  points[12] = { x: .6, y: .15 };
  assert.equal(isIndexPointing(points), false);
  points[12] = { x: .6, y: .7 };
  points[8] = { x: .45, y: .7 };
  assert.equal(isIndexPointing(points), false);
  assert.equal(isIndexPointing(null), false);
});
