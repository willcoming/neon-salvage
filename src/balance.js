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
