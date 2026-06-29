import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILD_CORE_SCORE,
  CORE_RESONANCE_DEFS,
  CORE_TRIAL_DEFS,
  COMBAT_SURGE_DEF,
  COMBAT_SURGE_KILLS,
  COMBAT_SURGE_WINDOW,
  DIFFICULTY_DEFS,
  SWARM_PRESSURE_DEF,
  EVASION_SURGE_DEF,
  combineRouteChoiceEffects,
  combatChainAfterKill,
  combatSurgeShockwaveDamage,
  compactWorldFeatureTargetValue,
  coreResonanceForCore,
  coreTrialForResonance,
  difficultyFor,
  enemyCapValue,
  eventChanceForWaveValue,
  lateGameScaleForWave,
  scoreBuilds,
  spawnIntervalForWaveValue,
  stageKeyForWave,
  swarmPressureForWave,
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
  assert.equal(stageKeyForWave(10), 'build');
  assert.equal(stageKeyForWave(30), 'pressure');
  assert.equal(stageKeyForWave(99), 'final');
  assert.equal(lateGameScaleForWave(4), 1);
  assert.equal(lateGameScaleForWave(20), .94);
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
  assert.equal(waveEnemyBudgetValue({ wave: 1 }), Math.floor(14 * SWARM_PRESSURE_DEF.budgetMult.warmup));
  assert.equal(waveEnemyBudgetValue({ wave: 1, controlMode: 'touch', tutorial: true }), Math.floor(14 * swarmPressureForWave({ wave: 1, controlMode: 'touch' }).budgetMult * .72));
  assert.equal(waveEnemyBudgetValue({ wave: 5 }), 0);
  assert.equal(waveEnemyBudgetValue({ wave: 7, difficulty: DIFFICULTY_DEFS.high, anomaly: { enemyMult: 1.04 }, route: { enemyMult: 1.05 } }), Math.floor(48 * swarmPressureForWave({ wave: 7 }).budgetMult * 1.12 * 1.04 * 1.05));
  assert.equal(eventChanceForWaveValue({ wave: 2 }), 0);
  assert.equal(eventChanceForWaveValue({ wave: 6, anomaly: { eventBoost: .12 }, route: { eventBoost: .05 } }), .42 + .17);
  assert.equal(spawnIntervalForWaveValue({ wave: 1, controlMode: 'keyboard' }), .19 * SWARM_PRESSURE_DEF.spawnIntervalMult.warmup);
  assert.equal(enemyCapValue({ wave: 10, controlMode: 'touch', difficulty: DIFFICULTY_DEFS.standard }), Math.round(Math.max(24, (30 + 4 - 1) * 1)));
});

test('swarm pressure helper raises enemy density while preserving mobile easing', () => {
  const warmup = swarmPressureForWave({ wave: 1 });
  const pressure = swarmPressureForWave({ wave: 30 });
  const mobilePressure = swarmPressureForWave({ wave: 30, controlMode: 'touch' });
  assert.equal(warmup.budgetMult, SWARM_PRESSURE_DEF.budgetMult.warmup);
  assert.ok(pressure.budgetMult > warmup.budgetMult);
  assert.equal(mobilePressure.budgetMult, SWARM_PRESSURE_DEF.budgetMult.pressure * SWARM_PRESSURE_DEF.touchBudgetMult);
  assert.ok(mobilePressure.capBonus < pressure.capBonus);
  assert.ok(pressure.spawnIntervalMult < warmup.spawnIntervalMult);
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

test('combat surge helper advances kill chains and shockwave damage', () => {
  let state = { combo: 0, timer: 0, best: 0 };
  for (let i = 1; i <= COMBAT_SURGE_KILLS; i++) state = combatChainAfterKill(state);
  assert.equal(state.combo, COMBAT_SURGE_KILLS);
  assert.equal(state.best, COMBAT_SURGE_KILLS);
  assert.equal(state.timer, COMBAT_SURGE_WINDOW);
  assert.equal(state.surgeReady, true);
  const reset = combatChainAfterKill({ combo: 9, timer: 0, best: state.best });
  assert.equal(reset.combo, 1);
  assert.equal(reset.surgeReady, false);
  assert.equal(COMBAT_SURGE_DEF.name, '擊破爆發');
  assert.equal(COMBAT_SURGE_DEF.fireRateMult, .9);
  assert.equal(COMBAT_SURGE_DEF.damageMult, 1.06);
  assert.equal(combatSurgeShockwaveDamage({ wave: 5, combo: 10 }), Math.round(10 + 5 * 1.2 + 5 * .85));
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

test('core trial helper maps resonances to timed objectives with safe fallback', () => {
  const def = { name: '軌砲穿透流', color: '#bdfcff', core: '穿透過載核心' };
  const resonance = coreResonanceForCore({ id: 'rail', score: BUILD_CORE_SCORE, def });
  const trial = coreTrialForResonance(resonance);
  assert.equal(trial.name, CORE_TRIAL_DEFS.rail.name);
  assert.equal(trial.verb, '穿透命中');
  assert.equal(trial.target, 8);
  assert.equal(trial.duration, 24);
  assert.equal(trial.color, def.color);
  assert.equal(trial.progress, 0);
  assert.equal(trial.completed, false);
  assert.equal(coreTrialForResonance(null), null);
  const fallback = coreTrialForResonance({ id: 'custom', name: '自訂諧振', buildName: '自訂流', color: '#fff' }, {});
  assert.equal(fallback.name, '自訂諧振試煉');
  assert.equal(fallback.target, 8);
  assert.equal(fallback.rewardScrap, 20);
});
