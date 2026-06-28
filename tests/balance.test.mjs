import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_CORE_SCORE,
  CORE_RESONANCE_DEFS,
  DIFFICULTY_DEFS,
  EVASION_SURGE_DEF,
  combineRouteChoiceEffects,
  compactWorldFeatureTargetValue,
  coreResonanceForCore,
  difficultyFor,
  enemyCapValue,
  eventChanceForWaveValue,
  lateGameScaleForWave,
  scoreBuilds,
  spawnIntervalForWaveValue,
  stageKeyForWave,
  topBuildFromScores,
  upgradeCostForLevel,
  waveEnemyBudgetValue
} from '../src/balance.js';

test('difficulty fallback keeps old saves playable', () => {
  assert.equal(difficultyFor('missing'), DIFFICULTY_DEFS.standard);
  assert.equal(difficultyFor('chaos').name, '失控星環');
});

test('run stage and late-game scale are deterministic tuning helpers', () => {
  assert.equal(stageKeyForWave(1), 'warmup');
  assert.equal(stageKeyForWave(4), 'build');
  assert.equal(stageKeyForWave(7), 'pressure');
  assert.equal(stageKeyForWave(10), 'final');
  assert.equal(lateGameScaleForWave(4), 1);
  assert.equal(lateGameScaleForWave(20), .64);
  assert.equal(compactWorldFeatureTargetValue({ wave: 1 }), 22);
});

test('upgrade cost uses current exponential curve', () => {
  const def = { base: 18, scale: 1.47 };
  assert.equal(upgradeCostForLevel(def, 0), 18);
  assert.equal(upgradeCostForLevel(def, 3), Math.floor(18 * Math.pow(1.47, 3)));
});

test('route choices combine multipliers, additive bonuses, and bias pools', () => {
  const safe = { id: 'safeSupply', name: '安全補給', tag: '補給', color: '#4dff88', incomingMult: .96, bossShotMult: .96, eventBias: ['supply'], objectiveBias: ['hold'] };
  const bounty = { id: 'bountyRisk', name: '高風險懸賞', tag: '懸賞', color: '#ff3df2', damageMult: 1.06, enemyMult: 1.05, bossRewardBonus: 14, eventBias: ['eliteStorm'], enemyBias: ['sprinter'] };
  const effects = combineRouteChoiceEffects([safe, bounty]);
  assert.equal(effects.id, 'safeSupply+bountyRisk');
  assert.equal(effects.name, '安全補給 + 高風險懸賞');
  assert.equal(effects.color, '#ff3df2');
  assert.equal(effects.incomingMult, .96);
  assert.equal(effects.damageMult, 1.06);
  assert.equal(effects.enemyMult, 1.05);
  assert.equal(effects.bossShotMult, .96);
  assert.equal(effects.bossRewardBonus, 14);
  assert.deepEqual(effects.eventBias, ['supply', 'eliteStorm']);
  assert.deepEqual(effects.objectiveBias, ['hold']);
  assert.deepEqual(effects.enemyBias, ['sprinter']);
});

test('difficulty, touch mode, anomaly and route effects feed pacing helpers', () => {
  assert.equal(waveEnemyBudgetValue({ wave: 1 }), 14);
  assert.equal(waveEnemyBudgetValue({ wave: 1, controlMode: 'touch', tutorial: true }), Math.floor(14 * .92 * .72));
  assert.equal(waveEnemyBudgetValue({ wave: 5 }), 0);
  assert.equal(waveEnemyBudgetValue({ wave: 7, difficulty: DIFFICULTY_DEFS.high, anomaly: { enemyMult: 1.04 }, route: { enemyMult: 1.05 } }), Math.floor(48 * 1.12 * 1.04 * 1.05));
  assert.equal(eventChanceForWaveValue({ wave: 2 }), 0);
  assert.equal(eventChanceForWaveValue({ wave: 6, anomaly: { eventBoost: .12 }, route: { eventBoost: .05 } }), .42 + .17);
  assert.equal(spawnIntervalForWaveValue({ wave: 1, controlMode: 'keyboard' }), .19);
  assert.equal(enemyCapValue({ wave: 10, controlMode: 'touch', difficulty: DIFFICULTY_DEFS.standard }), Math.round(Math.max(22, (30 - 3 * 1.35) * .86)));
});

test('build scoring identifies core candidates without touching runtime', () => {
  const pool = [
    { id: 'splitShot', build: 'rapid', weight: 2 },
    { id: 'harvestDrive', build: 'rapid', weight: 3 },
    { id: 'railOverload', build: 'rail', weight: 4 }
  ];
  const runtime = { splitShot: 1, harvestDrive: 1 };
  const scores = scoreBuilds(pool, runtime, 'harvestDrive');
  assert.equal(scores.rapid, 2 + 3 * 2);
  const top = topBuildFromScores(scores, { rapid: { name: '主砲速射流' } });
  assert.equal(top.id, 'rapid');
  assert.ok(top.score >= BUILD_CORE_SCORE);
});

test('evasion surge constants remain aligned with gameplay copy', () => {
  assert.equal(EVASION_SURGE_DEF.name, '擦彈機動');
  assert.equal(EVASION_SURGE_DEF.speedMult, 1.18);
  assert.equal(EVASION_SURGE_DEF.fireRateMult, .93);
  assert.equal(EVASION_SURGE_DEF.incomingMult, .92);
});

test('core resonance stays inactive before core threshold and exposes build-specific effects after core', () => {
  const def = { name: '軌砲穿透流', color: '#bdfcff', core: '穿透過載核心' };
  assert.equal(coreResonanceForCore({ id: 'rail', score: BUILD_CORE_SCORE - 1, def }), null);
  const resonance = coreResonanceForCore({ id: 'rail', score: BUILD_CORE_SCORE + 4, def });
  assert.equal(resonance.name, CORE_RESONANCE_DEFS.rail.name);
  assert.equal(resonance.buildName, def.name);
  assert.equal(resonance.coreName, def.core);
  assert.equal(resonance.pierceBonus, 1);
  assert.equal(resonance.bossDamageMult, 1.08);
  assert.equal(resonance.tier, 1.5);
});

test('unknown core resonance falls back to a safe damage-only profile', () => {
  const resonance = coreResonanceForCore({ id: 'custom', score: BUILD_CORE_SCORE, def: { name: '自訂流', color: '#fff', core: '自訂核心' } }, {});
  assert.equal(resonance.name, '自訂流諧振');
  assert.equal(resonance.damageMult, 1.04);
  assert.equal(resonance.fireRateMult, 1);
  assert.equal(resonance.rewardMult, 1);
});
