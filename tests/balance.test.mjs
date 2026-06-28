import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_CORE_SCORE,
  DIFFICULTY_DEFS,
  EVASION_SURGE_DEF,
  combineRouteChoiceEffects,
  compactWorldFeatureTargetValue,
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
