export const SAVE_KEY = 'neon-salvage-save-v2';
export const LEGACY_SAVE_KEYS = ['neon-salvage-save-v1'];

export const DEFAULT_UPGRADES = Object.freeze({
  cannon: 0,
  reactor: 0,
  shield: 0,
  armor: 0,
  engine: 0,
  magnet: 0,
  survey: 0,
  drone: 0
});

const AIM_ASSIST_MODES = new Set(['off', 'assist', 'full']);
const DIFFICULTIES = new Set(['standard', 'high', 'chaos']);

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function createBaseState(now = Date.now()) {
  return {
    scrap: 0,
    score: 0,
    bestWave: 1,
    achievements: {},
    recentRuns: [],
    soundEnabled: true,
    volume: .75,
    hapticsEnabled: true,
    shakeStrength: .7,
    touchSensitivity: 1,
    controlMode: 'keyboard',
    autoAim: true,
    aimAssist: 'assist',
    tutorialDone: false,
    selectedZone: 'random',
    difficulty: 'standard',
    lastSaved: now,
    upgrades: { ...DEFAULT_UPGRADES }
  };
}

export function normalizeSave(raw = {}, now = Date.now()) {
  const parsed = raw && typeof raw === 'object' ? raw : {};
  const base = createBaseState(now);
  const aimAssist = AIM_ASSIST_MODES.has(parsed.aimAssist)
    ? parsed.aimAssist
    : parsed.autoAim === false ? 'off' : base.aimAssist;

  return {
    ...base,
    ...parsed,
    achievements: { ...(parsed.achievements || {}) },
    recentRuns: Array.isArray(parsed.recentRuns) ? parsed.recentRuns.slice(0, 5) : [],
    upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
    soundEnabled: parsed.soundEnabled !== false,
    volume: clampNumber(parsed.volume, 0, 1, base.volume),
    hapticsEnabled: parsed.hapticsEnabled !== false,
    shakeStrength: clampNumber(parsed.shakeStrength, 0, 1, base.shakeStrength),
    touchSensitivity: clampNumber(parsed.touchSensitivity, .55, 1.6, base.touchSensitivity),
    controlMode: parsed.controlMode === 'touch' ? 'touch' : 'keyboard',
    aimAssist,
    autoAim: aimAssist !== 'off',
    selectedZone: parsed.selectedZone || base.selectedZone,
    difficulty: DIFFICULTIES.has(parsed.difficulty) ? parsed.difficulty : base.difficulty,
    tutorialDone: parsed.tutorialDone === true || (parsed.bestWave || 1) >= 3 || !!parsed.achievements?.sectorClear,
    lastSaved: Number.isFinite(Number(parsed.lastSaved)) ? Number(parsed.lastSaved) : base.lastSaved
  };
}

export function readSaveFromStorage(storage, now = Date.now()) {
  for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
    const raw = storage?.getItem?.(key);
    if (!raw) continue;
    return normalizeSave(JSON.parse(raw), now);
  }
  return createBaseState(now);
}

export function clearKnownSaveKeys(storage) {
  storage?.removeItem?.(SAVE_KEY);
  for (const key of LEGACY_SAVE_KEYS) storage?.removeItem?.(key);
}
