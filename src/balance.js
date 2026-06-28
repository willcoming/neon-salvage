export const BUILD_CORE_SCORE = 6;
export const EVASION_SURGE_GRAZES = 3;
export const EVASION_SURGE_WINDOW = 3.2;
export const EVASION_SURGE_DEF = Object.freeze({
  id: 'evasionSurge',
  name: '擦彈機動',
  desc: '移速 +18%｜射速 +7%｜受傷 -8%',
  color: '#bdfcff',
  duration: 5.5,
  speedMult: 1.18,
  fireRateMult: .93,
  incomingMult: .92
});

export const COMBAT_SURGE_KILLS = 5;
export const COMBAT_SURGE_WINDOW = 3.6;
export const COMBAT_SURGE_DEF = Object.freeze({
  id: 'combatSurge',
  name: '擊破爆發',
  desc: '5 連殺觸發衝擊波｜射速 +10%｜火力 +6%',
  color: '#ffd166',
  duration: 3.8,
  fireRateMult: .9,
  damageMult: 1.06,
  shockwaveRadius: 128,
  shockwaveDamageBase: 10,
  shockwaveDamagePerWave: 1.2
});

export const DIFFICULTY_ORDER = ['standard', 'high', 'chaos'];
export const DIFFICULTY_DEFS = Object.freeze({
  standard: { name: '標準星環', desc: '預設體驗', enemy: 1, speed: 1, cap: 1, reward: 1, event: 1 },
  high: { name: '高壓星環', desc: '敵人更多、獎勵更多', enemy: 1.12, speed: 1.06, cap: 1.12, reward: 1.18, event: 1.18 },
  chaos: { name: '失控星環', desc: 'Boss 更強、事件更頻繁', enemy: 1.25, speed: 1.12, cap: 1.18, reward: 1.38, event: 1.35 }
});

export const RUN_STAGE_DEFS = Object.freeze({
  warmup: { name: '暖機', waves: '1-3', color: '#bdfcff', desc: '操作 / 目標暖機' },
  build: { name: 'Build 成形', waves: '4-6', color: '#ffd166', desc: '技能核心與第一個 Boss' },
  pressure: { name: '高壓選擇', waves: '7-9', color: '#ff9f1c', desc: '戰術、事件與終局整備' },
  final: { name: '終局考驗', waves: '10', color: '#ff4d6d', desc: '星環核心 Boss' }
});

export const CORE_RESONANCE_DEFS = Object.freeze({
  rapid: { name: '速射諧振', desc: '射擊間隔 -6%｜每4發追加微脈衝', fireRateMult: .94, extraPulseEvery: 4 },
  rail: { name: '穿透諧振', desc: '火力 +7%｜穿透 +1｜Boss傷害 +8%', damageMult: 1.07, pierceBonus: 1, bossDamageMult: 1.08 },
  flak: { name: '近爆諧振', desc: '受傷 -4%｜爆裂半徑 +8', incomingMult: .96, blastBonus: 8 },
  plasma: { name: '電漿諧振', desc: '爆裂半徑 +12｜爆裂傷害 +10%', blastBonus: 12, blastDamageMult: 1.1 },
  seeker: { name: '索敵諧振', desc: '追蹤轉向 +18%｜磁吸 +55', homingTurnMult: 1.18, magnetBonus: 55 },
  drone: { name: '蜂群諧振', desc: '射擊間隔 -5%｜無人機傷害 +12%', fireRateMult: .95, droneDamageMult: 1.12 },
  burn: { name: '熔毀諧振', desc: '暴擊率 +6%｜灼燒 +0.45s', critChanceBonus: .06, burnBonus: .45 },
  survival: { name: '護盾諧振', desc: '受傷 -6%｜每半秒自修 +0.8', incomingMult: .94, regenBonus: .8 },
  economy: { name: '拾荒諧振', desc: '磁吸 +85｜碎晶收益 +8%', magnetBonus: 85, rewardMult: 1.08 }
});

export const CORE_TRIAL_DEFS = Object.freeze({
  rapid: { name: '速射試煉', verb: '微脈衝命中', target: 10, duration: 22, rewardScrap: 20, rewardXpMult: .28, powerup: 'rapid' },
  rail: { name: '穿透試煉', verb: '穿透命中', target: 8, duration: 24, rewardScrap: 24, rewardXpMult: .3, powerup: 'nova' },
  flak: { name: '近爆試煉', verb: '近爆命中', target: 10, duration: 22, rewardScrap: 22, rewardXpMult: .28, powerup: 'heal' },
  plasma: { name: '電漿試煉', verb: '爆裂命中', target: 10, duration: 24, rewardScrap: 24, rewardXpMult: .3, powerup: 'rapid' },
  seeker: { name: '索敵試煉', verb: '追蹤命中', target: 9, duration: 24, rewardScrap: 22, rewardXpMult: .28, powerup: 'rapid' },
  drone: { name: '蜂群試煉', verb: '無人機命中', target: 9, duration: 24, rewardScrap: 24, rewardXpMult: .3, powerup: 'heal' },
  burn: { name: '熔毀試煉', verb: '灼燒命中', target: 9, duration: 24, rewardScrap: 24, rewardXpMult: .3, powerup: 'nova' },
  survival: { name: '護盾試煉', verb: '護盾核心命中', target: 7, duration: 26, rewardScrap: 22, rewardXpMult: .32, powerup: 'heal' },
  economy: { name: '拾荒試煉', verb: '諧振拾荒命中', target: 8, duration: 24, rewardScrap: 30, rewardXpMult: .24, powerup: 'rapid' }
});

export const NEUTRAL_ROUTE_CHOICE = Object.freeze({
  id: 'none',
  name: '未定路線',
  tag: '尚未選擇局內路線',
  color: '#bdfcff',
  eventBias: [],
  objectiveBias: [],
  enemyBias: [],
  damageMult: 1,
  fireRateMult: 1,
  incomingMult: 1,
  rewardMult: 1,
  enemyMult: 1,
  magnetBonus: 0,
  bossHpMult: 1,
  bossShotMult: 1,
  bossSpeedMult: 1,
  bossAbilityMult: 1,
  bossRewardBonus: 0,
  eventBoost: 0
});

export const WAVE_ENEMY_BUDGETS = Object.freeze({ 1: 14, 2: 22, 3: 30, 4: 36, 6: 42, 7: 48, 8: 53, 9: 56 });

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function difficultyFor(id) {
  return DIFFICULTY_DEFS[id] || DIFFICULTY_DEFS.standard;
}

export function combatChainAfterKill({ combo = 0, timer = 0, best = 0, threshold = COMBAT_SURGE_KILLS, window = COMBAT_SURGE_WINDOW } = {}) {
  const nextCombo = timer > 0 ? Math.max(0, combo) + 1 : 1;
  return {
    combo: nextCombo,
    timer: window,
    best: Math.max(best || 0, nextCombo),
    surgeReady: nextCombo >= threshold && nextCombo % threshold === 0
  };
}

export function combatSurgeShockwaveDamage({ wave = 1, combo = 0, def = COMBAT_SURGE_DEF } = {}) {
  const comboBonus = Math.min(12, Math.max(0, combo - COMBAT_SURGE_KILLS) * .85);
  return Math.round((def.shockwaveDamageBase || 0) + Math.max(1, wave || 1) * (def.shockwaveDamagePerWave || 0) + comboBonus);
}

export function stageKeyForWave(wave, sectorClearWave = 10) {
  if (wave >= sectorClearWave) return 'final';
  if (wave >= 7) return 'pressure';
  if (wave >= 4) return 'build';
  return 'warmup';
}

export function runStageForWaveValue(wave, sectorClearWave = 10) {
  return RUN_STAGE_DEFS[stageKeyForWave(wave, sectorClearWave)];
}

export function lateGameScaleForWave(wave) {
  return clamp(1 - Math.max(0, wave - 4) * .055, .64, 1);
}

export function enemyCapValue({ wave, controlMode = 'keyboard', difficulty = DIFFICULTY_DEFS.standard } = {}) {
  const base = controlMode === 'touch' ? 30 : 36;
  const pressureCut = Math.max(0, wave - 7) * 1.35;
  const stageKey = stageKeyForWave(wave);
  const stageEase = stageKey === 'warmup' ? .88 : stageKey === 'final' ? .86 : stageKey === 'pressure' ? .94 : 1;
  return Math.round(Math.max(controlMode === 'touch' ? 22 : 26, (base - pressureCut) * stageEase) * (difficulty.cap || 1));
}

export function waveEnemyBudgetValue({ wave, controlMode = 'keyboard', tutorial = false, difficulty = DIFFICULTY_DEFS.standard, anomaly = {}, contract = {}, route = {} } = {}) {
  if (wave % 5 === 0) return 0;
  const base = WAVE_ENEMY_BUDGETS[wave] || Math.round(34 + wave * 3.2);
  const mobileEase = controlMode === 'touch' ? .92 : 1;
  const tutorialEase = tutorial && wave <= 2 ? .72 : 1;
  return Math.floor(base * mobileEase * tutorialEase * (difficulty.enemy || 1) * (anomaly.enemyMult || 1) * (contract.enemyMult || 1) * (route.enemyMult || 1));
}

export function eventChanceForWaveValue({ wave, anomaly = {}, route = {} } = {}) {
  if (wave <= 3 || wave % 5 === 0) return 0;
  const boost = (anomaly.eventBoost || 0) + (route.eventBoost || 0);
  if (wave <= 6) return (wave === 6 ? .42 : .18) + boost;
  return (wave === 9 ? .72 : .48) + boost;
}

export function spawnIntervalForWaveValue({ wave, controlMode = 'keyboard' } = {}) {
  const stageKey = stageKeyForWave(wave);
  const base = stageKey === 'warmup' ? (wave === 1 ? .19 : .165) : stageKey === 'build' ? .135 : .118;
  return Math.max(controlMode === 'touch' ? .085 : .068, base - Math.max(0, wave - 4) * .004 + (controlMode === 'touch' ? .012 : 0));
}

export function compactWorldFeatureTargetValue({ wave } = {}) {
  return Math.max(14, Math.round((22 + Math.min(10, Math.floor(wave / 2))) * lateGameScaleForWave(wave)));
}

export function upgradeCostForLevel(def, level = 0) {
  return Math.floor((def?.base || 0) * Math.pow(def?.scale || 1, Math.max(0, level || 0)));
}

export function combineRouteChoiceEffects(choices = [], neutral = NEUTRAL_ROUTE_CHOICE) {
  const safeChoices = Array.isArray(choices) ? choices.filter(Boolean) : [];
  const last = safeChoices[safeChoices.length - 1];
  const acc = {
    ...neutral,
    id: safeChoices.map(c => c.id).join('+') || neutral.id,
    name: safeChoices.map(c => c.name).join(' + ') || neutral.name,
    tag: safeChoices.map(c => c.tag).join('｜') || neutral.tag,
    color: last?.color || neutral.color,
    eventBias: [],
    objectiveBias: [],
    enemyBias: []
  };
  for (const c of safeChoices) {
    acc.damageMult *= c.damageMult || 1;
    acc.fireRateMult *= c.fireRateMult || 1;
    acc.incomingMult *= c.incomingMult || 1;
    acc.rewardMult *= c.rewardMult || 1;
    acc.enemyMult *= c.enemyMult || 1;
    acc.bossHpMult *= c.bossHpMult || 1;
    acc.bossShotMult *= c.bossShotMult || 1;
    acc.bossSpeedMult *= c.bossSpeedMult || 1;
    acc.bossAbilityMult *= c.bossAbilityMult || 1;
    acc.magnetBonus += c.magnetBonus || 0;
    acc.bossRewardBonus += c.bossRewardBonus || 0;
    acc.eventBoost += c.eventBoost || 0;
    acc.eventBias.push(...(c.eventBias || []));
    acc.objectiveBias.push(...(c.objectiveBias || []));
    acc.enemyBias.push(...(c.enemyBias || []));
  }
  return acc;
}

export function scoreBuilds(skillPool = [], runtime = {}, extraSkillId = null) {
  const scores = {};
  for (const skill of skillPool) {
    const level = (runtime?.[skill.id] || 0) + (skill.id === extraSkillId ? 1 : 0);
    if (level <= 0 || !skill.build) continue;
    scores[skill.build] = (scores[skill.build] || 0) + level * (skill.weight || 1);
  }
  return scores;
}

export function topBuildFromScores(scores = {}, buildDefs = {}) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return { id: '', score: 0, def: null };
  const [id, score] = entries[0];
  return { id, score, def: buildDefs[id] || null };
}

export function coreResonanceForCore(core = {}, resonanceDefs = CORE_RESONANCE_DEFS) {
  if (!core?.id || !core?.def || (core.score || 0) < BUILD_CORE_SCORE) return null;
  const def = core.def;
  const resonance = resonanceDefs[core.id] || { name: `${def.name || 'Build'}諧振`, desc: '火力 +4%', damageMult: 1.04 };
  const bonusScore = Math.max(0, (core.score || 0) - BUILD_CORE_SCORE);
  return {
    id: core.id,
    score: core.score || 0,
    buildName: def.name || core.id,
    coreName: def.core || 'Build 核心',
    color: def.color || '#37f6ff',
    tier: 1 + Math.min(2, Math.floor(bonusScore / 4)) * .5,
    damageMult: 1,
    fireRateMult: 1,
    incomingMult: 1,
    rewardMult: 1,
    magnetBonus: 0,
    regenBonus: 0,
    pierceBonus: 0,
    blastBonus: 0,
    blastDamageMult: 1,
    bossDamageMult: 1,
    critChanceBonus: 0,
    burnBonus: 0,
    homingTurnMult: 1,
    droneDamageMult: 1,
    extraPulseEvery: 0,
    ...resonance
  };
}

export function coreTrialForResonance(resonance = null, trialDefs = CORE_TRIAL_DEFS) {
  if (!resonance?.id) return null;
  const trial = trialDefs[resonance.id] || { name: `${resonance.name || '核心'}試煉`, verb: '諧振命中', target: 8, duration: 24, rewardScrap: 20, rewardXpMult: .25, powerup: 'rapid' };
  return {
    id: resonance.id,
    resonanceName: resonance.name,
    buildName: resonance.buildName,
    color: resonance.color || '#37f6ff',
    progress: 0,
    completed: false,
    ...trial
  };
}
