import test from 'node:test';
import assert from 'node:assert/strict';
import { SAVE_KEY, LEGACY_SAVE_KEYS, clearKnownSaveKeys, createBaseState, normalizeSave, readSaveFromStorage } from '../src/save.js';

function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
    has: key => data.has(key)
  };
}

test('base state preserves current save schema defaults', () => {
  const meta = createBaseState(1234);
  assert.equal(meta.lastSaved, 1234);
  assert.equal(meta.controlMode, 'keyboard');
  assert.equal(meta.aimAssist, 'assist');
  assert.equal(meta.autoAim, true);
  assert.equal(meta.difficulty, 'standard');
  assert.deepEqual(Object.keys(meta.upgrades).sort(), ['armor', 'blast', 'boss', 'cannon', 'drone', 'droneFire', 'droneGuard', 'engine', 'magnet', 'mission', 'pierce', 'reactor', 'refinery', 'regen', 'shield', 'supply', 'survey']);
});

test('normalizeSave migrates partial legacy records safely', () => {
  const meta = normalizeSave({
    scrap: 99,
    bestWave: 4,
    autoAim: false,
    volume: 2,
    touchSensitivity: .2,
    recentRuns: [1, 2, 3, 4, 5, 6],
    upgrades: { cannon: 2 }
  }, 999);
  assert.equal(meta.scrap, 99);
  assert.equal(meta.tutorialDone, true);
  assert.equal(meta.aimAssist, 'off');
  assert.equal(meta.autoAim, false);
  assert.equal(meta.volume, 1);
  assert.equal(meta.touchSensitivity, .55);
  assert.equal(meta.recentRuns.length, 5);
  assert.equal(meta.upgrades.cannon, 2);
  assert.equal(meta.upgrades.engine, 0);
});

test('readSaveFromStorage prefers v2 but still reads v1', () => {
  const legacy = JSON.stringify({ scrap: 12, upgrades: { shield: 1 } });
  const current = JSON.stringify({ scrap: 44, difficulty: 'chaos' });
  const storage = fakeStorage({ [LEGACY_SAVE_KEYS[0]]: legacy });
  assert.equal(readSaveFromStorage(storage, 111).scrap, 12);
  storage.setItem(SAVE_KEY, current);
  const meta = readSaveFromStorage(storage, 111);
  assert.equal(meta.scrap, 44);
  assert.equal(meta.difficulty, 'chaos');
});

test('clearKnownSaveKeys removes current and legacy save keys only', () => {
  const storage = fakeStorage({ [SAVE_KEY]: 'x', [LEGACY_SAVE_KEYS[0]]: 'y', other: 'z' });
  clearKnownSaveKeys(storage);
  assert.equal(storage.has(SAVE_KEY), false);
  assert.equal(storage.has(LEGACY_SAVE_KEYS[0]), false);
  assert.equal(storage.has('other'), true);
});
