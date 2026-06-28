import { SAVE_KEY, LEGACY_SAVE_KEYS, createBaseState, readSaveFromStorage, clearKnownSaveKeys } from './src/save.js';
import {
  BUILD_CORE_SCORE,
  DIFFICULTY_DEFS as difficultyDefs,
  DIFFICULTY_ORDER as difficultyOrder,
  RUN_STAGE_DEFS as runStageDefs,
  CORE_RESONANCE_DEFS as coreResonanceDefs,
  CORE_TRIAL_DEFS as coreTrialDefs,
  EVASION_SURGE_GRAZES,
  EVASION_SURGE_WINDOW,
  EVASION_SURGE_DEF as evasionSurgeDef,
  COMBAT_SURGE_KILLS,
  COMBAT_SURGE_WINDOW,
  COMBAT_SURGE_DEF as combatSurgeDef,
  combineRouteChoiceEffects,
  difficultyFor,
  stageKeyForWave,
  lateGameScaleForWave,
  enemyCapValue,
  waveEnemyBudgetValue,
  eventChanceForWaveValue,
  spawnIntervalForWaveValue,
  compactWorldFeatureTargetValue,
  upgradeCostForLevel,
  scoreBuilds,
  topBuildFromScores,
  coreResonanceForCore,
  coreTrialForResonance,
  combatChainAfterKill,
  combatSurgeShockwaveDamage
} from './src/balance.js';
import { createDiagnostics } from './src/diagnostics.js';

(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    wave: document.getElementById('wave'),
    hp: document.getElementById('hp'),
    scrap: document.getElementById('scrap'),
    score: document.getElementById('score'),
    xpBar: document.getElementById('xpBar'),
    upgrades: document.getElementById('upgrades'),
    upgradeModal: document.getElementById('upgradeModal'),
    upgradeMenuBtn: document.getElementById('upgradeMenuBtn'),
    closeUpgradeBtn: document.getElementById('closeUpgradeBtn'),
    resumeFromUpgradeBtn: document.getElementById('resumeFromUpgradeBtn'),
    saveBtn: document.getElementById('saveBtn'),
    resetBtn: document.getElementById('resetBtn'),
    overlay: document.getElementById('overlay'),
    startBtn: document.getElementById('startBtn'),
    homeSettingsBtn: document.getElementById('homeSettingsBtn'),
    howBtn: document.getElementById('howBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    difficultyBtn: document.getElementById('difficultyBtn'),
    perfBtn: document.getElementById('perfBtn'),
    how: document.getElementById('how'),
    toast: document.getElementById('toast'),
    controlModeBtn: document.getElementById('controlModeBtn'),
    autoAimBtn: document.getElementById('autoAimBtn'),
    soundBtn: document.getElementById('soundBtn'),
    testSoundBtn: document.getElementById('testSoundBtn'),
    audioStatus: document.getElementById('audioStatus'),
    volumeRange: document.getElementById('volumeRange'),
    volumeValue: document.getElementById('volumeValue'),
    hapticBtn: document.getElementById('hapticBtn'),
    shakeRange: document.getElementById('shakeRange'),
    shakeValue: document.getElementById('shakeValue'),
    touchSensitivityRange: document.getElementById('touchSensitivityRange'),
    touchSensitivityValue: document.getElementById('touchSensitivityValue'),
    pauseBtn: document.getElementById('pauseBtn'),
    upgradePrompt: document.getElementById('upgradePrompt'),
    offlineNotice: document.getElementById('offlineNotice'),
    achievementPanel: document.getElementById('achievementPanel'),
    zonePanel: document.getElementById('zonePanel')
  };

  const diagnostics = createDiagnostics({ document, storage: localStorage, performance });

  const TWO_PI = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const rand = (a, b) => a + Math.random() * (b - a);
  const choose = arr => arr[Math.floor(Math.random() * arr.length)];
  const dist2 = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };
  const camera = () => player ? { x: player.x - W / 2, y: player.y - H / 2 } : { x: 0, y: 0 };
  const screenToWorld = (x, y) => { const c = camera(); return { x: c.x + x, y: c.y + y }; };

  let W = 1280;
  let H = 720;
  let dpr = 1;
  let lastTime = performance.now();
  let running = false;
  let paused = true;
  let toastTimer = 0;
  let skillChoosing = false;
  let missionPulse = 0;
  let runTime = 0;

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, lastMove: performance.now() };
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  let controlMode = 'keyboard';
  const touchMove = { x: 0, y: 0, active: false, pressed: false, sx: W / 2, sy: H / 2, cx: W / 2, cy: H / 2, dir: '', force: 0 };

  const baseState = createBaseState;

  let meta = loadSave();
  controlMode = meta.controlMode === 'touch' ? 'touch' : 'keyboard';
  meta.aimAssist = ['off', 'assist', 'full'].includes(meta.aimAssist) ? meta.aimAssist : (meta.autoAim === false ? 'off' : 'assist');
  meta.autoAim = meta.aimAssist !== 'off';
  meta.volume = clamp(Number(meta.volume ?? .75), 0, 1);
  meta.shakeStrength = clamp(Number(meta.shakeStrength ?? .7), 0, 1);
  meta.touchSensitivity = clamp(Number(meta.touchSensitivity ?? 1), .55, 1.6);
  meta.hapticsEnabled = meta.hapticsEnabled !== false;
  meta.tutorialDone = meta.tutorialDone === true || (meta.bestWave || 1) >= 3 || !!meta.achievements?.sectorClear;
  let player;
  let bullets = [];
  let enemies = [];
  let shards = [];
  let particles = [];
  let floatText = [];
  let powerups = [];
  let enemyShots = [];
  let bossTelegraphs = [];
  let stars = [];
  let nebula = [];
  let wave = 1;
  let spawnLeft = 0;
  let spawnTimer = 0;
  let shotTimer = 0;
  let dashCooldown = 0;
  let dashTime = 0;
  let xp = 0;
  let xpNeed = 12;
  let runKills = 0;
  let totalKills = 0;
  let gameOver = false;
  let bossActive = false;
  let mission = null;
  let autoAim = meta.autoAim !== false;
  let activeEvent = null;
  let activeZone = null;
  let activeAnomaly = null;
  let activeContract = null;
  let activeRouteChoices = [];
  let routeChoiceOffer = null;
  let routeChoiceSerial = 0;
  let activeRouteConsequences = [];
  let routeConsequenceSerial = 0;
  let anomalyState = null;
  let activeTactic = null;
  let eventTimer = 0;
  let meteorTimer = 0;
  let activeTempoBoost = null;
  let activeTacticBreak = null;
  let activeBossBreak = null;
  let activeBossRhythm = null;
  let activeCoreOverdrive = null;
  let activeCoreTrial = null;
  let coreTrialSeen = new Set();
  let coreStreak = 0;
  let coreStreakTimer = 0;
  let lastCoreResonanceId = '';
  let activeEvasionSurge = null;
  let evasionStreak = 0;
  let evasionStreakTimer = 0;
  let activeCombatSurge = null;
  let combatCombo = 0;
  let combatComboTimer = 0;
  let bossCinematic = null;
  let victoryRainTimer = 0;
  let hitStopTimer = 0;
  let tacticPulse = 0;
  let bossAlertTimer = 0;
  let bossAlert = null;
  let eventBannerTimer = 0;
  let missionHudWakeUntil = 0;
  let missionHudSignature = '';
  let damageFlash = 0;
  let playerDamageCue = null;
  let worldFeatures = [];
  let featurePulse = 0;
  let zoneTick = 0;
  let beacon = null;
  let shotSeq = 0;
  let runObjectives = 0;
  let runEvents = 0;
  let runStartScrap = 0;
  let lastDamageCause = '';
  let tutorialShown = new Set();
  let tutorialRun = null;
  let runStats = null;
  let upgradeFromRun = false;

  function clearMovementInput() {
    keys.clear();
    touchMove.x = 0;
    touchMove.y = 0;
    touchMove.active = false;
    touchMove.pressed = false;
    touchMove.dir = '';
    touchMove.force = 0;
    mouse.down = false;
    if (player) { player.vx = 0; player.vy = 0; }
  }
  let audioCtx = null;
  let sfxUnlocked = false;
  let shakePower = 0;
  let shakeTime = 0;
  let shakeDuration = .1;
  const sfxGate = {};

  const SECTOR_CLEAR_WAVE = 10;
  const MAX_PARTICLES = 180;
  const MAX_RING_PARTICLES = 10;
  function currentDifficulty() {
    return difficultyFor(meta?.difficulty);
  }

  function lateGameScale() {
    return lateGameScaleForWave(wave);
  }
  function visualScale() {
    return lateGameScale() * (controlMode === 'touch' ? .9 : 1);
  }
  function enemyCap() {
    return enemyCapValue({ wave, controlMode, difficulty: currentDifficulty() });
  }

  function waveEnemyBudget(n = wave) {
    return waveEnemyBudgetValue({ wave: n, controlMode, tutorial: !!tutorialRun, difficulty: currentDifficulty(), anomaly: currentAnomaly(), contract: currentContract(), route: routeChoiceEffects() });
  }

  function eventChanceForWave(n = wave) {
    return eventChanceForWaveValue({ wave: n, anomaly: currentAnomaly(), route: routeChoiceEffects() });
  }

  function spawnIntervalForWave(n = wave) {
    return spawnIntervalForWaveValue({ wave: n, controlMode });
  }
  function compactWorldFeatureTarget() {
    return compactWorldFeatureTargetValue({ wave });
  }

  function ensureAudio() {
    if (!meta.soundEnabled) return null;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') audioCtx.resume().then(updateSoundUi).catch(() => {});
      sfxUnlocked = true;
      return audioCtx;
    } catch (err) {
      return null;
    }
  }

  function audioStatusText() {
    if (!meta.soundEnabled) return '音效已關閉；震動可在下方獨立控制。';
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return '此瀏覽器不支援 WebAudio 音效。';
    if (!audioCtx) return '尚未啟動；請點「測試音效」或開始遊戲。';
    if (audioCtx.state === 'running') return 'WebAudio 已啟動；若仍沒聲音，請確認手機靜音鍵與系統音量。';
    return `WebAudio 狀態：${audioCtx.state}；請點「測試音效」喚醒。`;
  }

  function tone(freq, duration = .07, type = 'sine', gain = .035, slide = 1) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * slide), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain * clamp(meta.volume ?? .75, 0, 1), now + .008);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(now);
    osc.stop(now + duration + .025);
  }

  function sfx(name) {
    if (!meta.soundEnabled) return;
    const now = performance.now();
    const gap = name === 'shoot' ? 55 : name === 'hit' ? 38 : name === 'pickup' ? 75 : name === 'bossHit' ? 90 : name === 'hurt' ? 240 : name === 'surge' ? 160 : 0;
    if (gap && now - (sfxGate[name] || 0) < gap) return;
    sfxGate[name] = now;
    if (name === 'shoot') tone(720, .035, 'square', .014, 1.28);
    else if (name === 'hit') tone(420, .032, 'triangle', .018, .7);
    else if (name === 'kill') { tone(280, .055, 'triangle', .025, .58); tone(680, .035, 'sine', .014, .9); }
    else if (name === 'elite') { tone(360, .07, 'sawtooth', .03, .62); tone(900, .05, 'triangle', .018, 1.2); }
    else if (name === 'bossHit') tone(150, .06, 'sawtooth', .025, .82);
    else if (name === 'boss') { tone(90, .2, 'sawtooth', .035, .72); tone(180, .14, 'triangle', .025, .55); }
    else if (name === 'bossTell') { tone(180, .11, 'sawtooth', .026, .72); setTimeout(() => tone(360, .08, 'triangle', .018, 1.18), 60); }
    else if (name === 'counter') { tone(520, .055, 'triangle', .024, 1.35); setTimeout(() => tone(880, .075, 'sine', .018, 1.25), 55); }
    else if (name === 'surge') { tone(180, .08, 'sawtooth', .032, .72); setTimeout(() => tone(620, .075, 'triangle', .026, 1.4), 45); setTimeout(() => tone(980, .09, 'sine', .022, 1.18), 95); }
    else if (name === 'bossDie') { tone(120, .18, 'sawtooth', .04, .5); setTimeout(() => tone(520, .12, 'triangle', .03, 1.6), 70); }
    else if (name === 'pickup') tone(960, .045, 'sine', .018, 1.35);
    else if (name === 'upgrade') { tone(520, .06, 'triangle', .025, 1.35); setTimeout(() => tone(760, .07, 'triangle', .022, 1.25), 55); }
    else if (name === 'hurt') tone(105, .1, 'sawtooth', .035, .72);
    else if (name === 'dash') tone(430, .06, 'triangle', .02, 1.8);
    else if (name === 'success') { tone(440, .08, 'triangle', .026, 1.2); setTimeout(() => tone(660, .1, 'triangle', .026, 1.25), 80); setTimeout(() => tone(990, .14, 'sine', .024, 1.05), 170); }
  }

  function haptic(ms = 18) {
    if (!meta.hapticsEnabled || typeof navigator?.vibrate !== 'function') return;
    try { navigator.vibrate(ms); } catch (err) {}
  }

  function addShake(power = 2, duration = .12) {
    if (reduceMotion) return;
    const scale = clamp(meta.shakeStrength ?? .7, 0, 1);
    if (scale <= 0) return;
    shakePower = Math.max(shakePower, Math.min(12, power * scale));
    shakeDuration = Math.max(shakeDuration, duration);
    shakeTime = Math.max(shakeTime, duration);
  }

  function screenShakeOffset() {
    if (shakeTime <= 0) return { x: 0, y: 0 };
    const t = clamp(shakeTime / Math.max(.001, shakeDuration), 0, 1);
    const amp = shakePower * t * t;
    return { x: rand(-amp, amp), y: rand(-amp, amp) };
  }

  function triggerHitStop(duration = .075) {
    if (reduceMotion) return;
    hitStopTimer = Math.max(hitStopTimer, duration);
  }

  function updateFeedbackTimers(dt) {
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      if (shakeTime <= 0) { shakePower = 0; shakeDuration = .1; }
    }
    if (playerDamageCue) {
      playerDamageCue.life -= dt;
      if (playerDamageCue.life <= 0) playerDamageCue = null;
    }
    if (bossCinematic) {
      bossCinematic.timer -= dt;
      if (bossCinematic.timer <= 0) bossCinematic = null;
    }
    victoryRainTimer = Math.max(0, victoryRainTimer - dt);
  }

  const aimAssistDefs = {
    off: { name: '關閉', desc: '完全手動瞄準' },
    assist: { name: '輔助', desc: '滑鼠操作優先，停止手動瞄準時鎖定最近敵人' },
    full: { name: '完全', desc: '持續鎖定最近敵人' }
  };
  const aimAssistOrder = ['assist', 'full', 'off'];

  function percent(value) {
    return `${Math.round(clamp(value, 0, 1) * 100)}%`;
  }

  function updateSoundUi() {
    if (ui.soundBtn) {
      ui.soundBtn.textContent = `音效 ${meta.soundEnabled ? 'ON' : 'OFF'}`;
      ui.soundBtn.classList.toggle('active', meta.soundEnabled);
    }
    if (ui.audioStatus) ui.audioStatus.textContent = `${audioStatusText()} 音量 ${percent(meta.volume ?? .75)}`;
    if (ui.volumeRange) ui.volumeRange.value = Math.round(clamp(meta.volume ?? .75, 0, 1) * 100);
    if (ui.volumeValue) ui.volumeValue.textContent = percent(meta.volume ?? .75);
    if (ui.hapticBtn) {
      ui.hapticBtn.textContent = `震動 ${meta.hapticsEnabled !== false ? 'ON' : 'OFF'}`;
      ui.hapticBtn.classList.toggle('active', meta.hapticsEnabled !== false);
    }
    if (ui.shakeRange) ui.shakeRange.value = Math.round(clamp(meta.shakeStrength ?? .7, 0, 1) * 100);
    if (ui.shakeValue) ui.shakeValue.textContent = percent(meta.shakeStrength ?? .7);
    if (ui.touchSensitivityRange) ui.touchSensitivityRange.value = Math.round(clamp(meta.touchSensitivity ?? 1, .55, 1.6) * 100);
    if (ui.touchSensitivityValue) ui.touchSensitivityValue.textContent = `${Math.round(clamp(meta.touchSensitivity ?? 1, .55, 1.6) * 100)}%`;
  }

  function updateDifficultyUi() {
    if (!ui.difficultyBtn) return;
    const diff = currentDifficulty();
    ui.difficultyBtn.textContent = `難度：${diff.name}`;
    ui.difficultyBtn.title = diff.desc;
  }

  function toggleDifficulty() {
    const idx = difficultyOrder.indexOf(meta.difficulty || 'standard');
    meta.difficulty = difficultyOrder[(idx + 1) % difficultyOrder.length];
    save(false);
    updateDifficultyUi();
    flash(`難度切換：${currentDifficulty().name}`);
  }

  function toggleSound() {
    meta.soundEnabled = !meta.soundEnabled;
    if (meta.soundEnabled) { ensureAudio(); sfx('upgrade'); }
    save(false);
    updateSoundUi();
    flash(`音效 ${meta.soundEnabled ? '開啟' : '關閉'}`);
  }

  function testSound() {
    if (!meta.soundEnabled) meta.soundEnabled = true;
    const ac = ensureAudio();
    updateSoundUi();
    if (!ac) return flash('此瀏覽器不支援 WebAudio 音效');
    sfx('upgrade');
    setTimeout(() => sfx('pickup'), 130);
    setTimeout(() => sfx('success'), 260);
    haptic(18);
    save(false);
    updateSoundUi();
    flash('已播放測試音效');
  }

  function impactFeedback(x, y, color = '#37f6ff', strength = 1, sound = 'hit', angle = null) {
    sfx(sound);
    if (sound === 'bossDie') triggerHitStop(.085);
    else if (sound === 'elite') triggerHitStop(.045);
    else if (sound === 'kill') triggerHitStop(.026);
    else if (strength >= 2.8) triggerHitStop(.04);
    if (strength >= 1.8) addShake(strength, .12);
    const count = Math.min(18, Math.ceil(4 + strength * 3));
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = angle == null ? Math.random() * TWO_PI : angle + rand(-1.8, 1.8);
      const sp = rand(70, 230) * strength;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.12, .28), max: .28, r: rand(1.1, 2.9) * Math.min(1.8, strength), color, ring: false, kind: i % 3 === 0 ? 'spark' : 'dot', len: rand(8, 20) * Math.min(1.7, strength) });
    }
    if (particles.length < MAX_PARTICLES) particles.push({ x, y, vx: 0, vy: 0, life: .14, max: .14, r: 5 + strength * 4, color: '#ffffff', ring: true, fastRing: true });
  }

  function playerImpact(cause, shake = 3.2, vibrateMs = 18, sourceX = null, sourceY = null) {
    lastDamageCause = cause;
    sfx('hurt');
    addShake(shake, .13);
    if (player && sourceX != null && sourceY != null) {
      playerDamageCue = { angle: Math.atan2(sourceY - player.y, sourceX - player.x), life: .55, max: .55, cause };
      for (let i = 0; i < 8 && particles.length < MAX_PARTICLES; i++) {
        const a = playerDamageCue.angle + Math.PI + rand(-.75, .75);
        particles.push({ x: player.x + rand(-8, 8), y: player.y + rand(-8, 8), vx: Math.cos(a) * rand(55, 160), vy: Math.sin(a) * rand(55, 160), life: rand(.16, .3), max: .3, r: rand(1.6, 3.2), color: '#ff4d6d', ring: false, kind: 'spark', len: rand(10, 22) });
      }
    } else {
      playerDamageCue = { angle: -Math.PI / 2, life: .45, max: .45, cause };
    }
    const now = performance.now();
    if (now - (sfxGate.haptic || 0) > 220) { sfxGate.haptic = now; haptic(vibrateMs); }
  }

  function newRunStats() {
    return { waveStart: 0, bossStart: 0, bossName: '', bossKillTime: null, bossMechanics: [], bossBreaks: [], bossBreakCount: 0, bossRhythms: [], bossRhythmCount: 0, bossHighlights: [], bossModifier: '', bossPhase2: false, bossPhase2Start: 0, bossPhase2Survival: 0, contract: '', contractTag: '', routeChoices: [], routeChoiceTags: [], routeChoiceEffects: [], routeConsequences: [], routeConsequenceEffects: [], routeConsequenceMisses: [], routeBossPreps: [], objectiveRoute: [], objectiveChains: [], objectiveBonuses: 0, paceNodes: [], prepDrops: 0, waveTimes: {}, skills: [], eventsSeen: [], eventBoosts: [], tacticsSeen: [], tacticBreaks: [], tacticBreakCount: 0, zone: '', anomaly: '', anomalyTasks: [], anomalyScore: 0, shieldSatelliteTime: 0, shieldSatelliteKills: 0, tacticPressure: 0, salvageRushWins: 0, salvageRushShards: 0, coreResonances: [], coreResonance: '', coreResonanceHits: 0, coreTrials: [], coreTrialCount: 0, coreTrialMisses: [], coreOverdrives: [], coreOverdriveCount: 0, coreStreakBest: 0, combatSurges: [], combatSurgeCount: 0, combatComboBest: 0, evasiveSurges: [], evasionSurgeCount: 0, evasionBestStreak: 0, grazes: 0, maxEnemies: 0, maxWorldFeatures: 0, maxParticles: 0, maxRings: 0, deathCause: '' };
  }

  const runAnomalyDefs = {
    salvage: { id: 'salvage', name: '碎晶潮汐', tag: '資源多｜競速多', color: '#ffd166', desc: '資源點、碎晶與拾荒競速更常出現。', events: ['rich', 'salvageRush', 'supply'], objectiveBias: ['harvest', 'scan'], rewardMult: 1.14 },
    bounty: { id: 'bounty', name: '懸賞獵場', tag: '菁英多｜獎勵高', color: '#ff3df2', desc: '菁英與獵殺目標更常見，擊破獎勵提高。', events: ['eliteStorm', 'droneSwarm'], objectiveBias: ['hunt', 'hold'], enemyMult: 1.04, rewardMult: 1.1 },
    rift: { id: 'rift', name: '裂隙干擾', tag: '危險多｜事件強', color: '#ff4d6d', desc: '裂隙、重力與電磁事件更常出現，目標獎勵更高。', events: ['gravityWell', 'hazard', 'empStorm'], objectiveBias: ['rift', 'hold'], eventBoost: .12, rewardMult: 1.18 },
    convoy: { id: 'convoy', name: '補給航道', tag: '補給多｜節奏穩', color: '#4dff88', desc: '維修與補給事件更常見，前中期更容易整理 build。', events: ['supply', 'rich', 'overclock'], objectiveBias: ['scan', 'harvest'], support: true, rewardMult: 1.05 }
  };

  const neutralContract = { id: 'standard', kind: '契約', name: '標準委託', tag: '無額外改變', color: '#bdfcff', desc: '標準星環委託。', damageMult: 1, fireRateMult: 1, incomingMult: 1, magnetBonus: 0, rewardMult: 1, enemyMult: 1, bossHpMult: 1 };

  const runContractDefs = {
    overdrive: { id: 'overdrive', kind: '契約', name: '過載合約', tag: '射速+8%｜敵量+6%', color: '#37f6ff', desc: '主砲節奏加快，但訊號會吸引更多敵群。', fireRateMult: .92, enemyMult: 1.06, startXp: .12 },
    glass: { id: 'glass', kind: '詛咒', name: '玻璃核心', tag: '火力+16%｜受傷+14%', color: '#ff4d6d', desc: '輸出更高、錯誤更痛；適合追求快速擊破。', damageMult: 1.16, incomingMult: 1.14, rewardMult: 1.05 },
    salvageBond: { id: 'salvageBond', kind: '契約', name: '拾荒債券', tag: '磁吸+90｜碎晶+8%｜Boss護甲+6%', color: '#ffd166', desc: '拾荒效率提升，但 Boss 攜帶加固外殼。', magnetBonus: 90, rewardMult: 1.08, bossHpMult: 1.06, startShards: 5 },
    convoyPledge: { id: 'convoyPledge', kind: '契約', name: '護航協議', tag: '受傷-10%｜火力-4%', color: '#4dff88', desc: '護盾更穩，輸出略降；適合保守通關。', incomingMult: .9, damageMult: .96, startPowerup: 'heal' }
  };

  function chooseRunAnomaly() {
    return { ...choose(Object.values(runAnomalyDefs)) };
  }

  function chooseRunContract() {
    return { ...choose(Object.values(runContractDefs)) };
  }

  function currentAnomaly() {
    return activeAnomaly || runAnomalyDefs.salvage;
  }

  function currentContract() {
    return activeContract || neutralContract;
  }

  function contractTitle(contract = currentContract()) {
    return `${contract.kind || '契約'}｜${contract.name || '標準委託'}`;
  }

  function applyRunContractOpening() {
    const contract = currentContract();
    if (!player || contract.id === 'standard') return;
    if (contract.startXp) xp += Math.ceil(xpNeed * contract.startXp);
    if (contract.startShards) for (let i = 0; i < contract.startShards; i++) dropShard(player.x + rand(-70, 70), player.y + rand(-62, 62), 1);
    if (contract.startPowerup) dropPowerup(contract.startPowerup, player.x + 72, player.y + 32, 18);
    addText(player.x, player.y - 82, `${contract.kind}：${contract.name}`, contract.color || '#bdfcff');
    burst(player.x, player.y, contract.color || '#bdfcff', 18, .8);
    recordPaceNode(`開局${contract.kind}｜${contract.name}：${contract.tag}`);
  }

  const neutralRouteChoice = { id: 'none', name: '未定路線', tag: '尚未選擇局內路線', color: '#bdfcff', eventBias: [], objectiveBias: [], enemyBias: [], damageMult: 1, fireRateMult: 1, incomingMult: 1, rewardMult: 1, enemyMult: 1, magnetBonus: 0, bossHpMult: 1, bossShotMult: 1, bossSpeedMult: 1, bossAbilityMult: 1, bossRewardBonus: 0, eventBoost: 0 };

  const routeChoiceDefs = {
    safeSupply: { id: 'safeSupply', name: '安全補給', tag: '立即維修｜補給事件↑｜Boss彈幕-4%', color: '#4dff88', desc: '偏穩定：補盾、補給事件與守點目標更常見，Boss 彈幕略慢。', eventBias: ['supply', 'rich', 'overclock'], objectiveBias: ['hold', 'scan'], incomingMult: .96, bossShotMult: .96, startHeal: 18, startPowerup: 'heal' },
    bountyRisk: { id: 'bountyRisk', name: '高風險懸賞', tag: '火力+6%｜敵量+5%｜Boss掉落+14', color: '#ff3df2', desc: '偏進攻：吸引菁英與蜂群事件，清得快會帶來更高收益。', eventBias: ['eliteStorm', 'droneSwarm', 'meteor'], objectiveBias: ['hunt', 'hold'], enemyBias: ['sprinter', 'bomber'], damageMult: 1.06, enemyMult: 1.05, bossRewardBonus: 14, startScrap: 18, startElite: true },
    weakScan: { id: 'weakScan', name: '弱點掃描', tag: '火力+4%｜Boss生命-6%｜掃描目標↑', color: '#bdfcff', desc: '偏技術：強化掃描路線，Boss 生命下降但事件更偏電磁/超頻。', eventBias: ['empStorm', 'overclock', 'droneSwarm'], objectiveBias: ['scan', 'hunt'], damageMult: 1.04, bossHpMult: .94, startXp: .18, weakScan: true },
    crystalDrill: { id: 'crystalDrill', name: '晶礦開採', tag: '碎晶+10%｜磁吸+45｜Boss護甲+4%', color: '#ffd166', desc: '偏經濟：採集與拾荒競速更常見，但 Boss 外殼稍厚。', eventBias: ['salvageRush', 'rich', 'supply'], objectiveBias: ['harvest', 'scan'], rewardMult: 1.1, magnetBonus: 45, bossHpMult: 1.04, startShards: 7 }
  };

  function routeChoicePairsForWave(n = wave) {
    return n <= 2 ? [['safeSupply', 'bountyRisk'], ['weakScan', 'crystalDrill']] : [['safeSupply', 'crystalDrill'], ['weakScan', 'bountyRisk']];
  }

  function currentRouteChoice() {
    return activeRouteChoices[activeRouteChoices.length - 1] || neutralRouteChoice;
  }

  function routeChoiceEffects() {
    return combineRouteChoiceEffects(activeRouteChoices, neutralRouteChoice);
  }

  function routeChoiceTitle() {
    return activeRouteChoices.length ? activeRouteChoices.map(c => c.name).join(' + ') : '尚未抉擇';
  }

  const routeConsequenceDefs = {
    safeSupply: { id: 'supplyConvoy', title: '補給護送', mode: 'convoy', label: '補給護送', action: '靠近補給艙護送充能', tag: '完成後：護盾+22｜護盾整備', color: '#4dff88', chargeNeed: 3.6, hp: 3.2, tempo: 'supply', rewardScrap: 14, rewardXp: .16, powerup: 'heal', bossPrep: { id: 'defenseCache', name: '防禦補給艙', tag: 'Boss前維修核心｜Boss彈幕-4%', color: '#4dff88', shotMult: .96, heal: 18, powerups: ['heal'] } },
    bountyRisk: { id: 'bountyMark', title: '懸賞目標', mode: 'bounty', label: '懸賞菁英', action: '擊破標記菁英', tag: '完成後：懸賞+36｜菁英破甲', color: '#ff3df2', tempo: 'eliteStorm', rewardScrap: 36, rewardXp: .22, powerup: 'nova', bossPrep: { id: 'bountyWeakness', name: '懸賞弱點', tag: 'Boss生命-4%｜破招門檻-8%｜掉落+12', color: '#ff3df2', hpMult: .96, breakThresholdMult: .92, rewardBonus: 12, powerups: ['nova'] } },
    weakScan: { id: 'scanRelay', title: '掃描中繼', mode: 'relay', label: '掃描中繼', action: '靠近中繼站完成掃描', tag: '完成後：弱點資料+1｜EMP 護層', color: '#bdfcff', chargeNeed: 2.3, tempo: 'empStorm', rewardScrap: 18, rewardXp: .28, weakScan: true, bossPrep: { id: 'readCalibration', name: '讀題校準', tag: '破招窗口+0.7s｜破招門檻-12%', color: '#bdfcff', abilityMult: 1.06, breakThresholdMult: .88, breakWindowBonus: .7 } },
    crystalDrill: { id: 'crystalDrill', title: '晶礦鑽探', mode: 'drill', label: '晶礦鑽探', action: '站在鑽探圈收集晶礦', tag: '完成後：碎晶雨｜拾荒磁暴', color: '#ffd166', chargeNeed: 2.9, tempo: 'salvageRush', rewardScrap: 24, rewardXp: .14, shards: 11, bossPrep: { id: 'crystalStake', name: '晶礦賭注', tag: 'Boss掉落+22｜高速敵伏擊', color: '#ffd166', speedMult: 1.03, rewardBonus: 22, shards: 8, adds: ['sprinter', 'sprinter'] } }
  };

  function routeConsequenceDef(choiceId) {
    return routeConsequenceDefs[choiceId] || routeConsequenceDefs.safeSupply;
  }

  function completedRouteConsequences() {
    return activeRouteConsequences.filter(c => c.status === 'complete');
  }

  function routeBossPrepEffects() {
    const complete = completedRouteConsequences();
    const acc = { count: 0, id: '', name: '', tag: '', names: [], tags: [], color: '', hpMult: 1, shotMult: 1, speedMult: 1, abilityMult: 1, rewardBonus: 0, breakThresholdMult: 1, breakWindowBonus: 0, heal: 0, powerups: [], shards: 0, adds: [] };
    for (const state of complete) {
      const def = state.def || routeConsequenceDef(state.choiceId);
      const prep = def.bossPrep;
      if (!prep) continue;
      acc.count++;
      acc.names.push(prep.name);
      acc.tags.push(prep.tag);
      acc.color = prep.color || state.color || acc.color;
      acc.hpMult *= prep.hpMult || 1;
      acc.shotMult *= prep.shotMult || 1;
      acc.speedMult *= prep.speedMult || 1;
      acc.abilityMult *= prep.abilityMult || 1;
      acc.breakThresholdMult *= prep.breakThresholdMult || 1;
      acc.breakWindowBonus += prep.breakWindowBonus || 0;
      acc.rewardBonus += prep.rewardBonus || 0;
      acc.heal += prep.heal || 0;
      acc.shards += prep.shards || 0;
      if (prep.powerups?.length) acc.powerups.push(...prep.powerups);
      if (prep.adds?.length) acc.adds.push(...prep.adds);
    }
    acc.id = complete.map(c => c.choiceId).join('+') || 'none';
    acc.name = acc.names.join('+');
    acc.tag = acc.tags.join('｜');
    return acc;
  }

  function routeBossPrepTitle() {
    const prep = routeBossPrepEffects();
    return prep.count ? prep.name : '尚未取得 Boss 前預備';
  }

  function recordRouteBossPrep(state) {
    if (!state || !runStats) return;
    const def = state.def || routeConsequenceDef(state.choiceId);
    const prep = def.bossPrep;
    if (!prep) return;
    const label = `${state.choiceName}→${prep.name}｜${prep.tag}`;
    if (!runStats.routeBossPreps.includes(label)) runStats.routeBossPreps.push(label);
    recordPaceNode(`Boss前預備取得｜${label}`);
  }

  function applyBossPrepSupport(boss = currentBoss()) {
    if (!player || !bossActive) return '';
    const prep = routeBossPrepEffects();
    if (!prep.count) return '';
    const effects = [];
    if (prep.heal) { player.hp = Math.min(player.maxHp, player.hp + prep.heal); effects.push(`護盾+${prep.heal}`); }
    for (const kind of prep.powerups) { dropPowerup(kind, player.x + rand(-92, 92), player.y + rand(-70, 70), 22); effects.push(kind === 'nova' ? '新星炸彈' : '維修核心'); }
    for (let i = 0; i < prep.shards; i++) dropShard(player.x + rand(-120, 120), player.y + rand(-88, 88), 1);
    if (prep.shards) effects.push(`Boss前晶礦x${prep.shards}`);
    for (const type of prep.adds) {
      const add = spawnEnemy(type);
      if (add) {
        add.x = (boss?.x || player.x) + rand(-130, 130);
        add.y = (boss?.y || player.y) + rand(90, 180);
        add.telegraph = Math.max(add.telegraph || 0, .65);
        add.objectiveTarget = true;
        effects.push(`伏擊:${add.label || type}`);
      }
    }
    const text = effects.join('｜') || prep.tag;
    if (boss) addText(boss.x, boss.y - boss.r - 48, `Boss前預備：${prep.name}`, prep.color || boss.color || '#ffd166');
    burst(player.x, player.y, prep.color || '#ffd166', 24, 1.05);
    if (runStats) { runStats.prepDrops += prep.count; recordPaceNode(`Boss前預備啟動｜${prep.name}｜${text}`); }
    flash(`Boss 前預備：${prep.name}｜${text}`);
    wakeMissionHud(5.2);
    return text;
  }

  function activeRouteConsequenceTarget() {
    const node = worldFeatures.find(f => f.type === 'routeConsequence' && !f.dead);
    if (node) return node;
    return enemies.find(e => e.routeConsequence && !e.dead) || null;
  }

  function activeRouteConsequenceLabel() {
    const active = activeRouteConsequences.find(c => c.status === 'active');
    if (!active) return '';
    return `${active.choiceName}→${active.title}`;
  }

  function recordRouteConsequence(state, status, effect = '') {
    if (!state || !runStats) return;
    const label = `${state.choiceName}→${state.title}｜第 ${state.wave} 波`;
    if (status === 'complete') {
      runStats.routeConsequences.push(label);
      if (effect) runStats.routeConsequenceEffects.push(`${label}｜${effect}`);
    } else if (status === 'miss') {
      runStats.routeConsequenceMisses.push(`${label}｜${effect || '錯過'}`);
    }
  }

  function routeConsequenceEventRef(def, state) {
    const tempo = tempoProfile(def.tempo || 'rich');
    return { id: def.tempo || tempo.id, name: `路線後果：${state.title}`, color: def.color || tempo.color };
  }

  function completeRouteConsequence(state, source = null) {
    if (!state || state.status !== 'active' || !player) return '';
    const def = state.def || routeConsequenceDef(state.choiceId);
    state.status = 'complete';
    state.completedAt = runTime;
    const effects = [];
    if (def.rewardScrap) { meta.scrap += def.rewardScrap; effects.push(`碎晶+${def.rewardScrap}`); }
    if (def.rewardXp) { const gain = Math.ceil(xpNeed * def.rewardXp); xp += gain; effects.push(`XP+${gain}`); }
    if (def.shards) { for (let i = 0; i < def.shards; i++) dropShard((source?.x || player.x) + rand(-70, 70), (source?.y || player.y) + rand(-60, 60), 1); effects.push(`碎晶雨x${def.shards}`); }
    if (def.weakScan) { upgradesRuntime.weakScan = (upgradesRuntime.weakScan || 0) + 1; effects.push('弱點資料+1'); }
    if (def.powerup) { dropPowerup(def.powerup, source?.x || player.x, source?.y || player.y, 20); effects.push(def.powerup === 'nova' ? '新星炸彈' : '維修核心'); }
    if (def.mode === 'convoy') { player.hp = Math.min(player.maxHp, player.hp + 22); effects.push('護盾+22'); }
    const boost = applyTempoBoost(routeConsequenceEventRef(def, state), true);
    if (boost) effects.push(`${boost.name} ${Math.ceil(boost.duration)}s`);
    const text = effects.join('｜') || def.tag;
    recordRouteConsequence(state, 'complete', text);
    recordRouteBossPrep(state);
    recordPaceNode(`路線後果完成｜${state.choiceName}→${state.title}`);
    if (source) source.dead = true;
    addText(source?.x || player.x, (source?.y || player.y) - 54, `${state.title} 完成`, def.color || '#bdfcff');
    burst(source?.x || player.x, source?.y || player.y, def.color || '#bdfcff', 30, 1.2);
    flash(`路線後果完成：${state.title}｜${text}`);
    sfx('success');
    haptic(34);
    wakeMissionHud(4.2);
    save(false);
    return text;
  }

  function failRouteConsequence(state, reason = '錯過') {
    if (!state || state.status !== 'active') return;
    state.status = 'miss';
    state.missedAt = runTime;
    recordRouteConsequence(state, 'miss', reason);
    recordPaceNode(`路線後果錯過｜${state.choiceName}→${state.title}：${reason}`);
    worldFeatures.forEach(f => { if (f.consequenceId === state.id) f.dead = true; });
    enemies.forEach(e => { if (e.routeConsequence?.id === state.id) e.routeConsequence = null; });
    flash(`路線後果錯過：${state.title}｜${reason}`);
    wakeMissionHud(2.4);
  }

  function spawnRouteConsequence(choice) {
    if (!player || bossActive || tutorialRun || !choice || choice.consequenceSpawned) return null;
    const def = routeConsequenceDef(choice.id);
    const state = { id: `consequence-${++routeConsequenceSerial}`, choiceId: choice.id, choiceName: choice.name, title: def.title, mode: def.mode, color: def.color || choice.color, wave, status: 'active', def };
    choice.consequenceSpawned = true;
    activeRouteConsequences.push(state);
    const a = rand(-Math.PI * .86, -Math.PI * .14);
    const d = wave <= 3 ? 520 : 620;
    if (def.mode === 'bounty') {
      const e = spawnEnemy(choose(['tank', 'shooter', 'leech']), { elite: 'juggernaut' });
      if (e) {
        e.x = player.x + Math.cos(a) * d;
        e.y = player.y + Math.sin(a) * d;
        e.routeConsequence = { id: state.id, choiceId: choice.id, name: def.title, color: def.color };
        e.objectiveTarget = true;
        e.scrap += 8;
        addText(e.x, e.y - e.r - 28, def.title, def.color);
      }
    } else {
      worldFeatures.push({ type: 'routeConsequence', consequenceId: state.id, choiceId: choice.id, routeConsequence: state, x: player.x + Math.cos(a) * d, y: player.y + Math.sin(a) * d, r: def.mode === 'convoy' ? 68 : def.mode === 'drill' ? 76 : 62, spin: rand(-.4, .4), seed: Math.random() * 999, cool: 0, charge: 0, chargeNeed: def.chargeNeed || 2.6, hp: def.hp || 0, maxHp: def.hp || 0, color: def.color });
    }
    recordPaceNode(`路線後果開啟｜${choice.name}→${def.title}`);
    flash(`路線後果：${choice.name}→${def.title}｜${def.action}`);
    wakeMissionHud(5.2);
    return state;
  }

  function spawnDueRouteConsequences(n = wave) {
    for (const c of activeRouteChoices) {
      if (!c.consequenceSpawned && (c.consequenceDue || c.wave + 1) <= n) spawnRouteConsequence(c);
    }
  }

  function expireActiveRouteConsequences(reason = '錯過') {
    for (const c of activeRouteConsequences) if (c.status === 'active') failRouteConsequence(c, reason);
  }

  function updateRouteConsequenceFeature(f, d, dt) {
    const state = f.routeConsequence || activeRouteConsequences.find(c => c.id === f.consequenceId);
    if (!state || state.status !== 'active') { f.dead = true; return; }
    const def = state.def || routeConsequenceDef(state.choiceId);
    const inside = d < f.r + player.r + 22;
    if (inside) {
      f.charge += dt;
      f.sideTick = (f.sideTick || 0) + dt;
      if (particles.length < MAX_PARTICLES) particles.push({ x: f.x + rand(-28, 28), y: f.y + rand(-28, 28), vx: rand(-10, 10), vy: rand(-10, 10), life: .22, max: .22, r: rand(1.5, 3.3), color: def.color || '#bdfcff', ring: false });
      if (def.mode === 'drill' && f.sideTick >= .38) { f.sideTick = 0; dropShard(f.x + rand(-58, 58), f.y + rand(-58, 58), 1); }
      if (def.mode === 'relay' && f.sideTick >= .72) { f.sideTick = 0; addText(f.x, f.y - f.r - 28, '掃描脈衝', def.color || '#bdfcff'); }
      if (f.charge >= (f.chargeNeed || def.chargeNeed || 2.6)) completeRouteConsequence(state, f);
      if (f.dead) return;
    } else {
      f.charge = Math.max(0, f.charge - dt * (def.mode === 'convoy' ? .32 : .45));
      f.sideTick = Math.max(0, (f.sideTick || 0) - dt * .5);
    }
    if (def.mode === 'convoy') {
      const attackers = enemies.filter(e => !e.dead && Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r + 96);
      if (attackers.length && f.cool <= 0) {
        f.hp -= .34;
        f.cool = .85;
        addText(f.x, f.y - f.r - 18, `補給艙 ${Math.max(0, Math.ceil(f.hp))}`, def.color || '#4dff88');
        if (f.hp <= 0) { f.dead = true; failRouteConsequence(state, '補給艙被破壞'); }
      }
    }
  }

  function missionHudNow() {
    return performance.now() / 1000;
  }

  function wakeMissionHud(seconds = 3) {
    missionHudWakeUntil = Math.max(missionHudWakeUntil, missionHudNow() + seconds);
  }

  function updateMissionHudSignature(signature, seconds = 3) {
    if (missionHudSignature === signature) return false;
    missionHudSignature = signature;
    wakeMissionHud(seconds);
    return true;
  }

  function missionHudAlpha(forceBright = false) {
    if (!running || paused || gameOver || skillChoosing) return 1;
    const bright = forceBright || runTime < 3 || eventBannerTimer > 0 || bossAlertTimer > 0 || missionHudNow() < missionHudWakeUntil;
    return bright ? 1 : .35;
  }

  function currentMissionHudSignature() {
    const beaconSig = beacon ? `${beacon.kind}:${beacon.previewEvent}:${objectiveSideComplete(beacon) ? 1 : 0}` : '';
    const anomalySig = `${anomalyState?.id || ''}:${anomalyState?.reward ? 1 : 0}:${anomalyState?.count || 0}`;
    const boss = currentBoss();
    const bossSig = boss ? `${boss.bossVariant}:${boss.phase2 ? 1 : 0}:${boss.breakWindow?.name || ''}:${Math.round((boss.breakWindow?.progress || 0) / Math.max(1, boss.breakWindow?.threshold || 1) * 10)}` : '';
    const routeSig = `${activeRouteChoices.map(c => c.id).join('+')}:${routeChoiceOffer?.id || ''}:${worldFeatures.filter(f => f.type === 'routeChoice').map(f => `${f.choiceId}:${Math.round((f.charge || 0) * 10)}`).join(',')}`;
    const consequenceSig = `${activeRouteConsequences.map(c => `${c.id}:${c.status}`).join(',')}:${worldFeatures.filter(f => f.type === 'routeConsequence').map(f => `${f.choiceId}:${Math.round((f.charge || 0) * 10)}:${Math.ceil(f.hp || 0)}`).join(',')}:${enemies.filter(e => e.routeConsequence).map(e => `${e.routeConsequence.id}:${Math.round(e.hp)}`).join(',')}`;
    const prepSig = routeBossPrepEffects().names.join('+');
    return [wave, mission?.text || '', mission?.done ? 1 : 0, activeEvent?.id || '', activeTempoBoost?.id || '', activeTacticBreak?.id || '', activeBossBreak?.id || '', activeBossRhythm?.id || '', activeCoreTrial ? `${activeCoreTrial.id}:${activeCoreTrial.progress}:${Math.ceil(activeCoreTrial.timer)}` : '', activeCoreOverdrive?.id || '', Math.ceil(activeCoreOverdrive?.timer || 0), activeEvasionSurge?.id || '', Math.ceil(activeEvasionSurge?.timer || 0), evasionStreak || 0, activeContract?.id || '', activeTactic?.id || activeTactic?.name || '', beaconSig, anomalySig, routeSig, consequenceSig, prepSig, bossSig].join('|');
  }

  function makeAnomalyState(def = currentAnomaly()) {
    const base = { id: def.id, count: 0, target: 1, timer: 0, reward: false, pulse: 5, combo: 0, best: 0 };
    if (def.id === 'salvage') return { ...base, label: '潮汐連撿', target: 12, timer: 0 };
    if (def.id === 'bounty') return { ...base, label: '懸賞連賞', target: 3 };
    if (def.id === 'rift') return { ...base, label: '裂隙封印', target: 3, pulse: 2.5 };
    if (def.id === 'convoy') return { ...base, label: '補給護送', target: 2, pulse: 3.5 };
    return base;
  }

  function anomalyTaskText() {
    const s = anomalyState;
    if (!s) return '異變任務準備中';
    if (s.id === 'salvage') return `潮汐連撿 ${s.combo}/${s.target}${s.timer > 0 ? `｜${s.timer.toFixed(1)}s` : ''}`;
    if (s.id === 'bounty') return `懸賞擊破 ${s.count}/${s.target}`;
    if (s.id === 'rift') return `封印裂隙 ${s.count}/${s.target}`;
    if (s.id === 'convoy') return `護送補給 ${s.count}/${s.target}`;
    return `${s.label || '異變任務'} ${s.count}/${s.target}`;
  }

  function recordAnomalyTask(label) {
    if (!runStats || !label) return;
    runStats.anomalyTasks.push(label);
    runStats.anomalyScore = (runStats.anomalyScore || 0) + 1;
    recordPaceNode(`異變任務｜${label}`);
  }

  function rewardAnomalyTask(label, scrap = 22, xpGain = 0, powerup = null) {
    if (!player) return;
    meta.scrap += scrap;
    xp += xpGain || Math.ceil(xpNeed * .18);
    if (powerup) dropPowerup(powerup, player.x + rand(-72, 72), player.y + rand(-58, 58), 18);
    addText(player.x, player.y - 72, `${label} +${scrap}`, currentAnomaly().color || '#ffd166');
    burst(player.x, player.y, currentAnomaly().color || '#ffd166', 24, 1.05);
    sfx('success');
    wakeMissionHud(3.6);
    recordAnomalyTask(label);
  }

  function spawnAnomalyFeature(type) {
    if (!player) return null;
    const a = Math.random() * TWO_PI;
    const d = rand(360, 720);
    const f = {
      type,
      x: player.x + Math.cos(a) * d,
      y: player.y + Math.sin(a) * d,
      r: type === 'convoyPod' ? 62 : 58,
      spin: rand(-.6, .6),
      seed: Math.random() * 999,
      cool: 0,
      charge: 0,
      hp: type === 'convoyPod' ? 3 : 0,
      maxHp: type === 'convoyPod' ? 3 : 0
    };
    worldFeatures.push(f);
    return f;
  }

  function onShardCollected(value = 1) {
    if (currentAnomaly().id !== 'salvage' || !anomalyState) return;
    if (anomalyState.timer <= 0) anomalyState.combo = 0;
    anomalyState.combo += value;
    anomalyState.best = Math.max(anomalyState.best || 0, anomalyState.combo);
    anomalyState.timer = 2.6;
    if (!anomalyState.reward && anomalyState.combo >= anomalyState.target) {
      anomalyState.reward = true;
      anomalyState.count = 1;
      rewardAnomalyTask('潮汐連撿達成', 34 + wave * 3, Math.ceil(xpNeed * .28), 'rapid');
      flash('碎晶潮汐：連撿達成，超頻核心已投放');
    }
  }

  function onEliteKilled(e) {
    if (currentAnomaly().id !== 'bounty' || !anomalyState || !e?.elite) return;
    anomalyState.count++;
    addText(e.x, e.y - e.r - 22, `懸賞 ${anomalyState.count}/${anomalyState.target}`, '#ff3df2');
    if (!anomalyState.reward && anomalyState.count >= anomalyState.target) {
      anomalyState.reward = true;
      rewardAnomalyTask('懸賞連賞達成', 40 + wave * 4, Math.ceil(xpNeed * .32), 'nova');
      flash('懸賞獵場：連賞達成，新星炸彈已投放');
    }
  }

  function completeRiftSeal(f) {
    if (!f || f.dead || currentAnomaly().id !== 'rift' || !anomalyState) return;
    f.dead = true;
    anomalyState.count++;
    worldFeatures = worldFeatures.filter(w => w === f || w.type !== 'hazard' || Math.hypot(w.x - f.x, w.y - f.y) > 520);
    burst(f.x, f.y, '#b66dff', 34, 1.2);
    addText(f.x, f.y - 54, `封印 ${anomalyState.count}/${anomalyState.target}`, '#b66dff');
    if (!anomalyState.reward && anomalyState.count >= anomalyState.target) {
      anomalyState.reward = true;
      rewardAnomalyTask('裂隙封印達成', 42 + wave * 4, Math.ceil(xpNeed * .34), 'heal');
      flash('裂隙干擾：封印完成，危險區已清理');
    }
  }

  function completeConvoyPod(f) {
    if (!f || f.dead || currentAnomaly().id !== 'convoy' || !anomalyState) return;
    f.dead = true;
    anomalyState.count++;
    burst(f.x, f.y, '#4dff88', 28, 1.1);
    dropPowerup('heal', f.x + 34, f.y, 18);
    addText(f.x, f.y - 54, `護送 ${anomalyState.count}/${anomalyState.target}`, '#4dff88');
    if (!anomalyState.reward && anomalyState.count >= anomalyState.target) {
      anomalyState.reward = true;
      rewardAnomalyTask('補給護送達成', 32 + wave * 3, Math.ceil(xpNeed * .24), 'rapid');
      flash('補給航道：護送完成，額外補給已投放');
    }
  }

  function updateAnomaly(dt) {
    if (!anomalyState || !player || !running || bossActive) return;
    if (anomalyState.id === 'salvage') {
      anomalyState.timer = Math.max(0, anomalyState.timer - dt);
      if (anomalyState.timer <= 0 && anomalyState.combo > 0 && !anomalyState.reward) anomalyState.combo = 0;
      return;
    }
    if (anomalyState.reward) return;
    if (anomalyState.id === 'rift') {
      anomalyState.pulse -= dt;
      const active = worldFeatures.some(f => f.type === 'riftSeal' && !f.dead);
      if (!active && anomalyState.pulse <= 0 && anomalyState.count < anomalyState.target) {
        const f = spawnAnomalyFeature('riftSeal');
        anomalyState.pulse = 12;
        if (f) flash('裂隙封印點出現：靠近充能可清理危險區');
      }
    }
    if (anomalyState.id === 'convoy') {
      anomalyState.pulse -= dt;
      const active = worldFeatures.some(f => f.type === 'convoyPod' && !f.dead);
      if (!active && anomalyState.pulse <= 0 && anomalyState.count < anomalyState.target) {
        const f = spawnAnomalyFeature('convoyPod');
        anomalyState.pulse = 16;
        if (f) flash('補給艙出現：靠近護送到充能完成');
      }
    }
  }

  function runStageForWave(n = wave) {
    return runStageDefs[stageKeyForWave(n, SECTOR_CLEAR_WAVE)];
  }

  function recordPaceNode(label) {
    if (!runStats || !label || runStats.paceNodes.includes(label)) return;
    runStats.paceNodes.push(label);
  }

  function formatTime(seconds = 0) {
    const total = Math.max(0, Math.floor(seconds));
    const m = Math.floor(total / 60).toString().padStart(2, '0');
    const s = (total % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function recordWaveTime(n = wave) {
    if (!runStats) return;
    const spent = Math.max(0, runTime - (runStats.waveStart || 0));
    if (spent > 0) runStats.waveTimes[n] = Math.max(runStats.waveTimes[n] || 0, spent);
  }

  function sampleRunStats() {
    if (!runStats) return;
    runStats.maxEnemies = Math.max(runStats.maxEnemies, enemies.length);
    runStats.maxWorldFeatures = Math.max(runStats.maxWorldFeatures, worldFeatures.length);
    runStats.maxParticles = Math.max(runStats.maxParticles, particles.length);
    let ringCount = 0;
    for (const p of particles) if (p.ring) ringCount++;
    runStats.maxRings = Math.max(runStats.maxRings, ringCount);
  }

  function longestWaveText() {
    if (!runStats) return '最久波 -';
    const entries = Object.entries(runStats.waveTimes);
    if (!entries.length) return '最久波 -';
    entries.sort((a, b) => b[1] - a[1]);
    return `最久波 第${entries[0][0]}波 ${formatTime(entries[0][1])}`;
  }

  function pickedSkillsText() {
    const list = runStats?.skills || [];
    if (!list.length) return '技能：尚未選擇';
    const tail = list.slice(-4).join('、');
    return `技能：${tail}${list.length > 4 ? ` 等 ${list.length} 個` : ''}`;
  }

  function buildScoreMap(extraSkillId = null) {
    return scoreBuilds(skillPool, upgradesRuntime, extraSkillId);
  }

  function topBuild(extraSkillId = null) {
    return topBuildFromScores(buildScoreMap(extraSkillId), buildDefs);
  }

  function currentBuildCore() {
    const top = topBuild();
    return top.def && top.score >= BUILD_CORE_SCORE ? top : { id: '', score: 0, def: null };
  }

  function currentCoreResonance() {
    return coreResonanceForCore(currentBuildCore(), coreResonanceDefs);
  }

  function coreResonanceLabel(resonance = currentCoreResonance()) {
    return resonance ? `${resonance.buildName}→${resonance.name}｜${resonance.desc}` : '';
  }

  function startCoreTrial(resonance = currentCoreResonance()) {
    if (!resonance || activeCoreTrial || coreTrialSeen.has(resonance.id)) return null;
    const trial = coreTrialForResonance(resonance, coreTrialDefs);
    if (!trial) return null;
    activeCoreTrial = { ...trial, timer: trial.duration, progress: 0, completed: false };
    coreTrialSeen.add(resonance.id);
    if (runStats) recordPaceNode(`核心試煉開始｜${trial.name}：${trial.verb} ${trial.target} 次`);
    flash(`核心試煉：${trial.name}｜${trial.verb} ${trial.target} 次`);
    wakeMissionHud(4.5);
    return activeCoreTrial;
  }

  function completeCoreTrial(trial = activeCoreTrial) {
    if (!trial || trial.completed) return;
    trial.completed = true;
    const xpGain = Math.ceil(xpNeed * (trial.rewardXpMult || .25));
    const scrapGain = trial.rewardScrap || 20;
    xp += xpGain;
    meta.scrap += scrapGain;
    if (trial.powerup) dropPowerup(trial.powerup, player?.x + 48 || W / 2, player?.y - 34 || H / 2, 18);
    const label = `${trial.name}完成｜${trial.verb} ${trial.progress}/${trial.target}｜碎晶+${scrapGain}｜XP+${xpGain}`;
    if (runStats) {
      runStats.coreTrialCount = (runStats.coreTrialCount || 0) + 1;
      runStats.coreTrials.push(label);
      runStats.coreTrials = runStats.coreTrials.slice(-6);
      recordPaceNode(`核心試煉完成｜${label}`);
    }
    if (player) {
      addText(player.x, player.y - player.r - 84, `${trial.name}完成`, trial.color);
      burst(player.x, player.y, trial.color, 22, 1.05);
    }
    flash(`核心試煉完成：碎晶 +${scrapGain}｜XP +${xpGain}`);
    sfx('success');
    haptic(35);
    activeCoreTrial = null;
    wakeMissionHud(4.2);
  }

  function expireCoreTrial() {
    if (!activeCoreTrial) return;
    const label = `${activeCoreTrial.name}未完成｜${activeCoreTrial.progress}/${activeCoreTrial.target}`;
    if (runStats) {
      runStats.coreTrialMisses.push(label);
      runStats.coreTrialMisses = runStats.coreTrialMisses.slice(-4);
      recordPaceNode(`核心試煉逾時｜${label}`);
    }
    flash(`核心試煉逾時：${activeCoreTrial.progress}/${activeCoreTrial.target}`);
    activeCoreTrial = null;
    wakeMissionHud(2.5);
  }

  function recordCoreResonanceHit(b, e) {
    if (!b?.resonance) return;
    if (runStats) runStats.coreResonanceHits += 1;
    if (!activeCoreTrial || activeCoreTrial.completed || activeCoreTrial.id !== b.resonance) return;
    activeCoreTrial.progress = Math.min(activeCoreTrial.target, activeCoreTrial.progress + 1);
    if (activeCoreTrial.progress >= activeCoreTrial.target) completeCoreTrial(activeCoreTrial);
    else if (activeCoreTrial.target - activeCoreTrial.progress <= 2 && player) {
      addText(e?.x || player.x, (e?.y || player.y) - 28, `${activeCoreTrial.name} ${activeCoreTrial.progress}/${activeCoreTrial.target}`, activeCoreTrial.color);
      wakeMissionHud(1.4);
    }
  }

  function announceCoreResonanceIfNeeded() {
    const resonance = currentCoreResonance();
    const id = resonance ? `${resonance.id}:${resonance.score}` : '';
    if (!resonance || id === lastCoreResonanceId) return;
    lastCoreResonanceId = id;
    const label = coreResonanceLabel(resonance);
    if (runStats) {
      runStats.coreResonance = label;
      runStats.coreResonances.push(label);
      runStats.coreResonances = runStats.coreResonances.slice(-6);
      recordPaceNode(`Build核心諧振｜${label}`);
    }
    if (player) {
      addText(player.x, player.y - player.r - 70, resonance.name, resonance.color);
      particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .48, max: .48, r: 24, color: resonance.color, ring: true, fastRing: true });
      wakeMissionHud(3.2);
    }
    startCoreTrial(resonance);
  }

  function coreOverdriveActive() {
    return activeCoreOverdrive && activeCoreOverdrive.timer > 0 ? activeCoreOverdrive : null;
  }

  function coreOverdriveNeed(core = currentBuildCore()) {
    if (!core.id) return Infinity;
    return Math.max(6, CORE_OVERDRIVE_KILLS - Math.floor(Math.max(0, core.score - BUILD_CORE_SCORE) / 3));
  }

  function coreOverdriveProfile(core = currentBuildCore()) {
    if (!core.id) return null;
    const def = core.def || buildDefs[core.id] || { name: '核心流派', color: '#37f6ff', core: 'Build 核心' };
    const boost = coreOverdriveDefs[core.id] || { name: `${def.name}超載`, desc: '火力 +8%', damageMult: 1.08 };
    return { id: core.id, buildName: def.name, coreName: def.core, color: def.color || '#37f6ff', duration: 7.5 + Math.min(3, Math.max(0, core.score - BUILD_CORE_SCORE) * .35), damageMult: 1, fireRateMult: 1, incomingMult: 1, magnetBonus: 0, regenBonus: 0, bossBreakThresholdMult: 1, bossBreakWindowBonus: 0, ...boost };
  }

  function triggerCoreOverdrive(source = '連續擊破') {
    if (!player) return null;
    const core = currentBuildCore();
    const profile = coreOverdriveProfile(core);
    if (!profile) return null;
    activeCoreOverdrive = { ...profile, timer: profile.duration, source };
    coreStreak = 0;
    coreStreakTimer = 0;
    if (runStats) {
      runStats.coreOverdriveCount = (runStats.coreOverdriveCount || 0) + 1;
      const label = `${profile.buildName}→${profile.name}｜${profile.desc}`;
      runStats.coreOverdrives.push(label);
      runStats.coreOverdrives = runStats.coreOverdrives.slice(-8);
      recordPaceNode(`Build核心超載｜${label}`);
    }
    addText(player.x, player.y - player.r - 62, `${profile.name} ${Math.ceil(profile.duration)}s`, profile.color);
    particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .52, max: .52, r: 30, color: profile.color, ring: true, fastRing: true });
    burst(player.x, player.y, profile.color, 26, 1.05);
    flash(`Build 核心超載：${profile.name}｜${profile.desc}`);
    sfx('counter');
    haptic(30);
    wakeMissionHud(4.2);
    return activeCoreOverdrive;
  }

  function recordCoreKill(e) {
    if (!e || e.type === 'boss') return;
    const core = currentBuildCore();
    if (!core.id) return;
    coreStreak = coreStreakTimer > 0 ? coreStreak + 1 : 1;
    coreStreakTimer = CORE_OVERDRIVE_WINDOW;
    if (runStats) runStats.coreStreakBest = Math.max(runStats.coreStreakBest || 0, coreStreak);
    const need = coreOverdriveNeed(core);
    if (coreStreak >= need && (!activeCoreOverdrive || activeCoreOverdrive.timer < 2.5)) {
      triggerCoreOverdrive(`${need} 連殺`);
    } else if (need - coreStreak === 2 && player) {
      const profile = coreOverdriveProfile(core);
      addText(player.x, player.y - player.r - 48, `核心連殺 ${coreStreak}/${need}`, profile?.color || '#ffd166');
      wakeMissionHud(1.6);
    }
  }

  function evasionSurgeActive() {
    return activeEvasionSurge && activeEvasionSurge.timer > 0 ? activeEvasionSurge : null;
  }

  function triggerEvasionSurge(source = '擦彈連段') {
    if (!player) return null;
    activeEvasionSurge = { ...evasionSurgeDef, timer: evasionSurgeDef.duration, source };
    evasionStreak = 0;
    evasionStreakTimer = 0;
    if (runStats) {
      runStats.evasionSurgeCount = (runStats.evasionSurgeCount || 0) + 1;
      const label = `${evasionSurgeDef.name}｜${evasionSurgeDef.desc}`;
      runStats.evasiveSurges.push(label);
      runStats.evasiveSurges = runStats.evasiveSurges.slice(-8);
      recordPaceNode(`擦彈機動｜${label}`);
    }
    addText(player.x, player.y - player.r - 54, `${evasionSurgeDef.name} ${Math.ceil(evasionSurgeDef.duration)}s`, evasionSurgeDef.color);
    particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .42, max: .42, r: 24, color: evasionSurgeDef.color, ring: true, fastRing: true });
    burst(player.x, player.y, evasionSurgeDef.color, 18, .92);
    flash(`擦彈機動：${evasionSurgeDef.desc}`);
    sfx('counter');
    haptic(18);
    wakeMissionHud(3.4);
    return activeEvasionSurge;
  }

  function recordEvasionGraze(s) {
    if (!player || !s || s.grazed || isPlayerProtected()) return;
    s.grazed = true;
    evasionStreak = evasionStreakTimer > 0 ? evasionStreak + 1 : 1;
    evasionStreakTimer = EVASION_SURGE_WINDOW;
    if (runStats) {
      runStats.grazes = (runStats.grazes || 0) + 1;
      runStats.evasionBestStreak = Math.max(runStats.evasionBestStreak || 0, evasionStreak);
    }
    const need = EVASION_SURGE_GRAZES;
    addText(player.x, player.y - player.r - 36, `擦彈 ${Math.min(evasionStreak, need)}/${need}`, evasionSurgeDef.color);
    particles.push({ x: s.x, y: s.y, vx: -s.vx * .06 + rand(-20, 20), vy: -s.vy * .06 + rand(-20, 20), life: .18, max: .18, r: 2.2, color: evasionSurgeDef.color, ring: false, kind: 'spark', len: 18 });
    if (evasionStreak >= need && (!activeEvasionSurge || activeEvasionSurge.timer < 1.6)) triggerEvasionSurge(`${need} 擦彈`);
    else wakeMissionHud(1.2);
  }

  function combatSurgeActive() {
    return activeCombatSurge && activeCombatSurge.timer > 0 ? activeCombatSurge : null;
  }

  function applyCombatShockwave(source, combo = combatCombo) {
    if (!source) return 0;
    const radius = (combatSurgeDef.shockwaveRadius || 128) + Math.min(52, combo * 3.5);
    const amount = combatSurgeShockwaveDamage({ wave, combo, def: combatSurgeDef });
    let hits = 0;
    if (particles.length < MAX_PARTICLES) particles.push({ x: source.x, y: source.y, vx: 0, vy: 0, life: .32, max: .32, r: radius * .42, color: combatSurgeDef.color, ring: true, fastRing: true });
    if (particles.length < MAX_PARTICLES) particles.push({ x: source.x, y: source.y, vx: 0, vy: 0, life: .22, max: .22, r: radius * .25, color: '#ffffff', ring: true, fastRing: true });
    for (const other of enemies) {
      if (other.dead || other === source) continue;
      const d = Math.hypot(other.x - source.x, other.y - source.y);
      if (d > radius + other.r) continue;
      const falloff = 1 - Math.min(.55, d / Math.max(1, radius) * .42);
      const dealt = amount * falloff * (other.type === 'boss' ? .45 : 1);
      other.hp -= dealt;
      other.hit = Math.max(other.hit || 0, .12);
      hits++;
      if (particles.length < MAX_PARTICLES) {
        const a = Math.atan2(other.y - source.y, other.x - source.x);
        particles.push({ x: other.x, y: other.y, vx: Math.cos(a) * rand(70, 150), vy: Math.sin(a) * rand(70, 150), life: .18, max: .18, r: 2.4, color: combatSurgeDef.color, ring: false, kind: 'spark', len: 22 });
      }
      if (other.hp <= 0) killEnemy(other);
    }
    if (hits) addText(source.x, source.y - source.r - 34, `衝擊波 ${hits}`, combatSurgeDef.color);
    return hits;
  }

  function triggerCombatSurge(source, combo = combatCombo) {
    if (!source) return null;
    activeCombatSurge = { ...combatSurgeDef, timer: combatSurgeDef.duration, combo, source: `${combo} 連殺` };
    if (runStats) {
      runStats.combatSurgeCount = (runStats.combatSurgeCount || 0) + 1;
      const label = `${combatSurgeDef.name} x${combo}｜${combatSurgeDef.desc}`;
      runStats.combatSurges.push(label);
      runStats.combatSurges = runStats.combatSurges.slice(-8);
      recordPaceNode(`擊破爆發｜${label}`);
    }
    addText(source.x, source.y - source.r - 48, `${combatSurgeDef.name} x${combo}`, combatSurgeDef.color);
    burst(source.x, source.y, combatSurgeDef.color, 26, 1.18);
    triggerHitStop(.052);
    addShake(3.8, .18);
    sfx('surge');
    haptic(24);
    applyCombatShockwave(source, combo);
    flash(`${combatSurgeDef.name}：${combo} 連殺｜衝擊波 + 短暫火力加速`);
    wakeMissionHud(3.2);
    return activeCombatSurge;
  }

  function recordCombatKill(e) {
    if (!e || e.type === 'boss') return;
    const state = combatChainAfterKill({ combo: combatCombo, timer: combatComboTimer, best: runStats?.combatComboBest || 0 });
    combatCombo = state.combo;
    combatComboTimer = state.timer;
    if (runStats) runStats.combatComboBest = state.best;
    if (combatCombo >= 3) addText(e.x, e.y - e.r - 24, `連殺 x${combatCombo}`, combatSurgeDef.color);
    if (state.surgeReady && (!activeCombatSurge || activeCombatSurge.timer < 1.2)) triggerCombatSurge(e, combatCombo);
    else if (combatCombo >= COMBAT_SURGE_KILLS - 1 || combatComboTimer > COMBAT_SURGE_WINDOW * .55) wakeMissionHud(1.15);
  }

  function detectBuildName() {
    const top = topBuild();
    if (!top.def || top.score <= 0) return '未成形';
    const resonance = coreResonanceForCore(top, coreResonanceDefs);
    return `${top.def.name}${top.score >= BUILD_CORE_SCORE ? `｜核心成形${resonance ? `｜${resonance.name}` : ''}` : '｜成形中'}`;
  }

  function balanceHint() {
    if (!runStats) return '診斷：資料不足，先完成更多波次。';
    if (runStats.maxParticles >= MAX_PARTICLES * .92 || runStats.maxRings >= MAX_RING_PARTICLES) return '診斷：性能預算曾接近紅線，系統已限制粒子/ring；下一局可少疊高爆裂特效。';
    if ((runStats.shieldSatelliteTime || 0) > 8 && (runStats.shieldSatelliteKills || 0) <= 1) return '診斷：護盾衛星拖慢清場，下一局看到藍色衛星要優先擊破。';
    if ((runStats.tacticPressure || 0) >= 8 && !(runStats.tacticBreakCount || 0)) return '診斷：敵群戰術壓力偏高但未破解，下一局先拆 HUD 提示的關鍵單位。';
    if ((runStats.tacticBreakCount || 0) >= 2) return '診斷：戰術破解穩定，能把敵群題目轉成短暫反攻窗口。';
    if ((runStats.combatSurgeCount || 0) >= 2) return '診斷：擊破爆發穩定，5 連殺衝擊波已能把清場轉成爽快節奏。';
    if (runKills >= 14 && !(runStats.combatSurgeCount || 0)) return '診斷：擊殺斷點偏散；用範圍、追蹤或拉怪把 5 連殺接成擊破爆發會更爽。';
    if ((runStats.tacticPressure || 0) >= 8) return '診斷：敵群戰術組合壓力偏高，先拆關鍵單位再清雜兵會更穩。';
    if ((runStats.bossBreakCount || 0) >= 2) return '診斷：Boss 讀題與破招掌握良好，能把終局招式轉成輸出窗口。';
    if ((runStats.bossRhythmCount || 0) >= 2) return '診斷：Boss 節奏掌握良好，能利用安全縫換到反擊窗口。';
    if (runStats.bossPhase2 && !(runStats.bossBreakCount || 0)) return '診斷：Boss 進入二階段但未破招，下一局留火力在讀題窗口集中輸出。';
    if ((runStats.eventsSeen || []).includes('拾荒競速') && !runStats.salvageRushWins) return '診斷：拾荒競速未達標，磁吸場與安全路線會提高收益。';
    if (runObjectives <= 1 && wave >= 5) return '診斷：目標參與偏低，建議多跑目標點換事件獎勵。';
    if (runStats.maxEnemies >= enemyCap() - 1) return '診斷：敵量曾達上限，範圍技能與走位會是關鍵。';
    if (runStats.maxRings >= Math.floor(MAX_RING_PARTICLES * .8)) return '診斷：特效接近預算上限，但已被系統壓住。';
    if (runStats.bossKillTime && runStats.bossKillTime > 85) return '診斷：Boss 擊殺偏慢，下一局可優先主砲或穿甲/軌砲。';
    if ((runStats.skills || []).length <= 1 && wave >= 4) return '診斷：局內技能偏少，建議利用目標與事件加速升級。';
    return '診斷：節奏穩定，可挑戰更高評級。';
  }

  function combatReport() {
    const boss = runStats?.bossKillTime ? `｜Boss ${formatTime(runStats.bossKillTime)}` : '';
    const consequence = runStats?.routeConsequences?.length ? `｜後果 ${runStats.routeConsequences.length}` : '';
    const prep = runStats?.routeBossPreps?.length ? `｜Boss預備 ${runStats.routeBossPreps.length}` : '';
    return `戰鬥報告｜${contractTitle()}｜路線 ${routeChoiceTitle()}${consequence}${prep}｜時間 ${formatTime(runTime)}｜${longestWaveText()}｜連殺${runStats?.combatComboBest || 0}/爆發${runStats?.combatSurgeCount || 0}｜峰值 敵${runStats?.maxEnemies || 0}/物件${runStats?.maxWorldFeatures || 0}/粒子${runStats?.maxParticles || 0}/ring${runStats?.maxRings || 0}${boss}｜${pickedSkillsText()}｜${balanceHint()}｜${buildCoverageHint()}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  function longestWaveSummary() {
    const entries = Object.entries(runStats?.waveTimes || {});
    if (!entries.length) return { wave: '-', time: 0, label: '-' };
    entries.sort((a, b) => b[1] - a[1]);
    return { wave: entries[0][0], time: entries[0][1], label: `第${entries[0][0]}波 ${formatTime(entries[0][1])}` };
  }

  function pressureLabel(record) {
    if ((record.maxParticles || 0) >= MAX_PARTICLES * .92 || (record.maxRings || 0) >= MAX_RING_PARTICLES) return '紅線';
    if ((record.maxRings || 0) >= 8 || (record.maxParticles || 0) >= 150) return '高壓';
    if ((record.maxEnemies || 0) >= 28) return '密集';
    return '穩定';
  }

  function budgetLabel(record) {
    const enemyRatio = (record.maxEnemies || 0) / Math.max(1, enemyCap());
    const particleRatio = (record.maxParticles || 0) / MAX_PARTICLES;
    const ringRatio = (record.maxRings || 0) / MAX_RING_PARTICLES;
    const peak = Math.max(enemyRatio, particleRatio, ringRatio);
    if (peak >= .92) return '紅線｜系統已進入強制預算';
    if (peak >= .74) return '黃色｜接近預算，建議降特效密度';
    return '綠色｜性能預算穩定';
  }

  function challengeList(record) {
    const list = [];
    if (record.status === 'clear') {
      if (record.grade !== 'S') list.push('衝到 S 評級');
      if ((record.bossTime || 0) > 60) list.push('Boss 擊殺壓到 60 秒內');
      if ((record.objectives || 0) < 4) list.push('完成至少 4 個目標');
      if ((record.bossBreakCount || 0) < 1) list.push('Boss 戰至少破招 1 次');
      if ((record.bossRhythmCount || 0) < 1) list.push('穿過一次 Boss 脈衝安全縫');
      if (!list.length) list.push('保持 S 評級並嘗試更高擊殺數');
    } else {
      list.push(`突破第 ${Math.min(SECTOR_CLEAR_WAVE, record.wave + 1)} 波`);
      if ((record.objectives || 0) < 3) list.push('完成至少 3 個目標');
      if ((record.skills || []).length < 3) list.push('拿到 3 個局內技能');
    }
    if ((record.shieldSatelliteTime || 0) > 0 && (record.shieldSatelliteKills || 0) < 2) list.push('優先擊破 2 台護盾衛星');
    if ((record.objectiveBonuses || 0) < 2 && (record.objectives || 0) >= 2) list.push('完成 2 個帶 ★ 副條件目標');
    if ((record.kills || 0) >= 12 && !(record.combatSurgeCount || 0)) list.push('用 5 連殺觸發一次擊破爆發');
    if ((record.combatSurgeCount || 0) >= 1 && (record.combatComboBest || 0) < 10) list.push('挑戰 10 連殺雙重爆發');
    if ((record.wave || 0) >= 2 && !(record.evasionSurgeCount || 0)) list.push('用 3 次擦彈啟動一次機動超載');
    if ((record.evasionSurgeCount || 0) >= 1 && (record.evasionBestStreak || 0) < 6) list.push('挑戰 6 連擦彈維持機動超載');
    if ((record.build || '').includes('核心成形') && !(record.coreOverdriveCount || 0)) list.push('用核心流派打出一次連殺超載');
    if ((record.coreOverdriveCount || 0) >= 1 && (record.coreStreakBest || 0) < 14) list.push('挑戰 14 連殺延續核心超載');
    if ((record.tacticsSeen || []).length && !(record.tacticBreakCount || 0)) list.push(`破解 ${record.tacticsSeen[0]} 戰術`);
    else if ((record.tacticsSeen || []).length) list.push('連續破解 2 次敵群戰術');
    if (record.bossPhase2 && !(record.bossBreakCount || 0)) list.push('Boss 二階段讀題後完成 1 次破招');
    if (!(record.routeChoices || []).length && record.wave >= 2) list.push('完成一次局內 2 選 1 抉擇');
    if ((record.routeChoices || []).length && !(record.routeConsequences || []).length) list.push('完成一次局內路線後果任務');
    if ((record.eventsSeen || []).includes('拾荒競速') && !record.salvageRushWins) list.push('完成一次拾荒競速');
    if ((record.maxEnemies || 0) >= enemyCap() - 1) list.push('帶一個範圍技能進後期');
    return [...new Set(list)].slice(0, 3);
  }

  function makeRunRecord(status, grade = '-', bonus = 0) {
    const longest = longestWaveSummary();
    const record = {
      id: Date.now(),
      status,
      grade,
      wave,
      difficulty: currentDifficulty().name,
      time: Math.floor(runTime),
      kills: runKills,
      objectives: runObjectives,
      events: runEvents,
      scrap: runScrapGain(),
      bonus,
      score: Math.floor(meta.score),
      longestWave: longest.label,
      longestWaveTime: Math.floor(longest.time || 0),
      maxEnemies: runStats?.maxEnemies || 0,
      maxWorldFeatures: runStats?.maxWorldFeatures || 0,
      maxParticles: runStats?.maxParticles || 0,
      maxRings: runStats?.maxRings || 0,
      bossName: runStats?.bossName || '',
      bossTime: runStats?.bossKillTime ? Math.floor(runStats.bossKillTime) : 0,
      bossMechanics: [...(runStats?.bossMechanics || [])].slice(-6),
      bossBreaks: [...(runStats?.bossBreaks || [])].slice(-6),
      bossBreakCount: runStats?.bossBreakCount || 0,
      bossRhythms: [...(runStats?.bossRhythms || [])].slice(-6),
      bossRhythmCount: runStats?.bossRhythmCount || 0,
      bossHighlights: [...(runStats?.bossHighlights || [])].slice(-6),
      bossModifier: runStats?.bossModifier || currentBossModifier().name,
      bossPhase2: !!runStats?.bossPhase2,
      bossPhase2Survival: Math.floor(runStats?.bossPhase2Survival || (runStats?.bossPhase2Start ? Math.max(0, runTime - runStats.bossPhase2Start) : 0)),
      skills: [...(runStats?.skills || [])].slice(-6),
      build: detectBuildName(),
      coreResonance: runStats?.coreResonance || coreResonanceLabel() || '',
      coreResonances: [...(runStats?.coreResonances || [])].slice(-6),
      coreResonanceHits: runStats?.coreResonanceHits || 0,
      coreTrials: [...(runStats?.coreTrials || [])].slice(-6),
      coreTrialCount: runStats?.coreTrialCount || 0,
      coreTrialMisses: [...(runStats?.coreTrialMisses || [])].slice(-4),
      activeCoreTrial: activeCoreTrial ? `${activeCoreTrial.name}｜${activeCoreTrial.progress}/${activeCoreTrial.target}｜${Math.ceil(activeCoreTrial.timer)}s` : '',
      coreOverdrives: [...(runStats?.coreOverdrives || [])].slice(-8),
      coreOverdriveCount: runStats?.coreOverdriveCount || 0,
      coreStreakBest: runStats?.coreStreakBest || 0,
      combatSurges: [...(runStats?.combatSurges || [])].slice(-8),
      combatSurgeCount: runStats?.combatSurgeCount || 0,
      combatComboBest: runStats?.combatComboBest || 0,
      evasiveSurges: [...(runStats?.evasiveSurges || [])].slice(-8),
      evasionSurgeCount: runStats?.evasionSurgeCount || 0,
      evasionBestStreak: runStats?.evasionBestStreak || 0,
      grazes: runStats?.grazes || 0,
      contract: runStats?.contract || contractTitle(),
      contractTag: runStats?.contractTag || currentContract().tag || '',
      routeChoices: [...(runStats?.routeChoices || [])].slice(-4),
      routeChoiceTags: [...(runStats?.routeChoiceTags || [])].slice(-4),
      routeChoiceEffects: [...(runStats?.routeChoiceEffects || [])].slice(-4),
      routeConsequences: [...(runStats?.routeConsequences || [])].slice(-5),
      routeConsequenceEffects: [...(runStats?.routeConsequenceEffects || [])].slice(-5),
      routeConsequenceMisses: [...(runStats?.routeConsequenceMisses || [])].slice(-5),
      routeBossPreps: [...(runStats?.routeBossPreps || [])].slice(-5),
      zone: runStats?.zone || currentZone().name,
      anomaly: runStats?.anomaly || currentAnomaly().name,
      anomalyTasks: [...(runStats?.anomalyTasks || [])].slice(-5),
      anomalyScore: runStats?.anomalyScore || 0,
      paceNodes: [...(runStats?.paceNodes || [])].slice(-6),
      prepDrops: runStats?.prepDrops || 0,
      objectiveRoute: [...(runStats?.objectiveRoute || [])].slice(-6),
      objectiveChains: [...(runStats?.objectiveChains || [])].slice(-6),
      objectiveBonuses: runStats?.objectiveBonuses || 0,
      eventsSeen: [...(runStats?.eventsSeen || [])].slice(-5),
      eventBoosts: [...(runStats?.eventBoosts || [])].slice(-5),
      tacticsSeen: [...(runStats?.tacticsSeen || [])].slice(-5),
      tacticBreaks: [...(runStats?.tacticBreaks || [])].slice(-6),
      tacticBreakCount: runStats?.tacticBreakCount || 0,
      tacticPressure: runStats?.tacticPressure || 0,
      shieldSatelliteKills: runStats?.shieldSatelliteKills || 0,
      shieldSatelliteTime: Math.floor(runStats?.shieldSatelliteTime || 0),
      salvageRushWins: runStats?.salvageRushWins || 0,
      salvageRushShards: Math.floor(runStats?.salvageRushShards || 0),
      deathCause: runStats?.deathCause || lastDamageCause || '',
      diagnosis: balanceHint()
    };
    record.pressure = pressureLabel(record);
    record.budget = budgetLabel(record);
    record.challenges = challengeList(record);
    return record;
  }

  function saveRunRecord(record) {
    meta.recentRuns = [record, ...((Array.isArray(meta.recentRuns) && meta.recentRuns) || [])].slice(0, 5);
    save(false);
  }

  function clearRunOverlayExtras(card = ui.overlay.querySelector('.card')) {
    if (!card) return;
    card.classList.remove('run-card', 'success-run', 'failed-run');
    card.querySelector('#runReport')?.remove();
    card.querySelector('#postRunActions')?.remove();
    card.querySelector('#recentRunsPanel')?.remove();
  }

  function setHomeOnlyPanels(card = ui.overlay.querySelector('.card'), visible = true) {
    if (!card) return;
    for (const selector of ['.version-card', '.beta-summary', '#offlineNotice', '#achievementPanel', '#zonePanel']) {
      const el = card.querySelector(selector);
      if (el) el.hidden = !visible;
    }
  }

  function hideHomeOnlyPanels(card = ui.overlay.querySelector('.card')) {
    setHomeOnlyPanels(card, false);
  }

  function renderRecentRuns(card) {
    const runs = (Array.isArray(meta.recentRuns) && meta.recentRuns) || [];
    let panel = card.querySelector('#recentRunsPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'recentRunsPanel';
      panel.className = 'recent-runs';
      panel.hidden = true;
      (card.querySelector('#postRunActions') || card.querySelector('.actions'))?.after(panel);
    }
    panel.innerHTML = `<strong>最近 5 場戰績</strong>${runs.length ? runs.map(r => `<div class="recent-row"><b class="${r.status === 'clear' ? 'win' : 'fail'}">${escapeHtml(r.status === 'clear' ? r.grade : 'X')}</b><span>${escapeHtml(r.status === 'clear' ? '撤離' : '失敗')}｜第 ${escapeHtml(r.wave)} 波｜${escapeHtml(formatTime(r.time))}｜Boss ${escapeHtml(r.bossTime ? formatTime(r.bossTime) : '-')}｜${escapeHtml(r.diagnosis || '')}</span></div>`).join('') : '<p>還沒有戰績。</p>'}`;
    return panel;
  }

  function renderPostRunActions(card) {
    let box = card.querySelector('#postRunActions');
    if (!box) {
      box = document.createElement('div');
      box.id = 'postRunActions';
      box.className = 'post-run-actions';
      card.querySelector('.actions')?.after(box);
    }
    box.innerHTML = '<button id="postUpgradeBtn" class="secondary" type="button">打開艦載升級</button><button id="historyBtn" class="secondary" type="button">查看最近戰績</button>';
    box.querySelector('#postUpgradeBtn').addEventListener('click', openPostRunUpgradeModal);
    box.querySelector('#historyBtn').addEventListener('click', () => {
      const panel = renderRecentRuns(card);
      panel.hidden = !panel.hidden;
    });
  }

  function renderRunReport(card, record, leadText) {
    clearRunOverlayExtras(card);
    hideHomeOnlyPanels(card);
    card.classList.add('run-card', record.status === 'clear' ? 'success-run' : 'failed-run');
    const lead = card.querySelector('p:not(.eyebrow)');
    lead.textContent = leadText;
    const actions = card.querySelector('.actions');
    if (actions) lead.after(actions);
    const report = document.createElement('div');
    report.id = 'runReport';
    report.className = 'run-report';
    const skillHtml = record.skills.length ? record.skills.map(s => `<span>${escapeHtml(s)}</span>`).join('') : '<span>尚未選擇技能</span>';
    const paceHtml = record.paceNodes?.length ? record.paceNodes.map(p => `<span>${escapeHtml(p)}</span>`).join('') : '<span>尚未記錄節奏節點</span>';
    const eventHtml = record.eventsSeen?.length ? record.eventsSeen.map(e => `<span>${escapeHtml(e)}</span>`).join('') : '<span>尚未觸發事件</span>';
    const boostHtml = record.eventBoosts?.length ? record.eventBoosts.map(e => `<span>${escapeHtml(e)}</span>`).join('') : '<span>尚未取得事件加成</span>';
    const routeHtml = record.objectiveRoute?.length ? record.objectiveRoute.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未完成目標路線</span>';
    const chainHtml = record.objectiveChains?.length ? record.objectiveChains.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未形成目標連鎖</span>';
    const routeChoiceHtml = record.routeChoices?.length ? record.routeChoices.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未完成局內抉擇</span>';
    const routeChoiceEffectHtml = record.routeChoiceEffects?.length ? record.routeChoiceEffects.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未取得抉擇效果</span>';
    const routeConsequenceHtml = record.routeConsequences?.length ? record.routeConsequences.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未完成路線後果</span>';
    const routeConsequenceEffectHtml = record.routeConsequenceEffects?.length ? record.routeConsequenceEffects.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未取得後果獎勵</span>';
    const routeConsequenceMissHtml = record.routeConsequenceMisses?.length ? record.routeConsequenceMisses.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>沒有錯過後果任務</span>';
    const routeBossPrepHtml = record.routeBossPreps?.length ? record.routeBossPreps.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未取得 Boss 前預備</span>';
    const anomalyHtml = record.anomalyTasks?.length ? record.anomalyTasks.map(a => `<span>${escapeHtml(a)}</span>`).join('') : '<span>尚未完成異變任務</span>';
    const tacticHtml = record.tacticsSeen?.length ? record.tacticsSeen.map(t => `<span>${escapeHtml(t)}</span>`).join('') : '<span>尚未遇到戰術組合</span>';
    const tacticBreakHtml = record.tacticBreaks?.length ? record.tacticBreaks.map(t => `<span>${escapeHtml(t)}</span>`).join('') : '<span>尚未破解戰術</span>';
    const bossHtml = record.bossMechanics?.length ? record.bossMechanics.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未遭遇 Boss 機制</span>';
    const bossBreakHtml = record.bossBreaks?.length ? record.bossBreaks.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未完成 Boss 破招</span>';
    const bossRhythmHtml = record.bossRhythms?.length ? record.bossRhythms.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未觸發 Boss 節奏反擊</span>';
    const bossHighlightHtml = record.bossHighlights?.length ? record.bossHighlights.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未記錄 Boss 擊破亮點</span>';
    const coreResonanceHtml = record.coreResonances?.length ? record.coreResonances.map(b => `<span>${escapeHtml(b)}</span>`).join('') : record.coreResonance ? `<span>${escapeHtml(record.coreResonance)}</span>` : '<span>尚未形成 Build 核心諧振</span>';
    const coreTrialHtml = record.coreTrials?.length ? record.coreTrials.map(b => `<span>${escapeHtml(b)}</span>`).join('') : record.activeCoreTrial ? `<span>${escapeHtml(record.activeCoreTrial)}</span>` : '<span>尚未完成核心試煉</span>';
    const coreTrialMissHtml = record.coreTrialMisses?.length ? record.coreTrialMisses.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>沒有逾時核心試煉</span>';
    const coreOverdriveHtml = record.coreOverdrives?.length ? record.coreOverdrives.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未觸發 Build 核心超載</span>';
    const combatSurgeHtml = record.combatSurges?.length ? record.combatSurges.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未觸發擊破爆發</span>';
    const evasionSurgeHtml = record.evasiveSurges?.length ? record.evasiveSurges.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未觸發擦彈機動</span>';
    const unlock = nextAchievement();
    const unlockHtml = unlock ? `${escapeHtml(unlock.name)}｜${escapeHtml(unlock.progress?.() || '')}｜${escapeHtml(unlock.unlock || '')}` : '所有成就已解鎖';
    const summaryHtml = [
      ['波次', `第 ${record.wave} 波`],
      ['Build', record.build || '未成形'],
      ['諧振', record.coreResonance ? `${record.coreResonance.split('｜')[0]}｜命中${record.coreResonanceHits || 0}` : '未成形'],
      ['試煉', record.coreTrialCount ? `${record.coreTrialCount} 完成` : record.activeCoreTrial || '未完成'],
      ['契約', `${record.contract || '標準委託'}｜${record.zone || '-'}`],
      ['路線', record.routeChoices?.length ? record.routeChoices.map(r => r.split('｜')[0]).join(' + ') : '未抉擇'],
      ['超載', record.coreOverdriveCount ? `${record.coreOverdriveCount} 次｜核心連殺${record.coreStreakBest || 0}` : '未觸發'],
      ['爽快', record.combatSurgeCount ? `${record.combatSurgeCount} 次爆發｜連殺${record.combatComboBest || 0}` : `連殺${record.combatComboBest || 0}`],
      ['擦彈', record.evasionSurgeCount ? `${record.evasionSurgeCount} 次｜連擦${record.evasionBestStreak || 0}` : `${record.grazes || 0} 擦`],
      ['後果', record.routeConsequences?.length ? `${record.routeConsequences.length} 完成` : record.routeConsequenceMisses?.length ? '已錯過' : '未觸發'],
      ['Boss預備', record.routeBossPreps?.length ? `${record.routeBossPreps.length} 個` : '未取得'],
      ['壓力', `${record.pressure || '-'}｜${(record.budget || '-').split('｜')[0]}`],
      ['下一步', record.challenges?.[0] || '自由挑戰']
    ].map(([k, v]) => `<span><b>${escapeHtml(k)}</b>${escapeHtml(v)}</span>`).join('');
    report.innerHTML = `
      <div class="grade-badge ${record.status === 'clear' ? 'win' : 'fail'}"><span>${escapeHtml(record.status === 'clear' ? record.grade : '失敗')}</span><small>${escapeHtml(record.status === 'clear' ? '撤離成功' : '資料已保存')}</small></div>
      <div class="run-summary">${summaryHtml}</div>
      <div class="report-grid">
        <section><h3>本局成果</h3><dl><div><dt>難度</dt><dd>${escapeHtml(record.difficulty || '標準星環')}</dd></div><div><dt>時間</dt><dd>${escapeHtml(formatTime(record.time))}</dd></div><div><dt>擊殺</dt><dd>${escapeHtml(record.kills)}</dd></div><div><dt>目標</dt><dd>${escapeHtml(record.objectives)}${record.objectiveBonuses ? `｜★${escapeHtml(record.objectiveBonuses)}` : ''}</dd></div><div><dt>事件</dt><dd>${escapeHtml(record.events)}</dd></div><div><dt>碎晶</dt><dd>+${escapeHtml(record.scrap)}</dd></div></dl></section>
        <section><h3>戰鬥壓力</h3><dl><div><dt>最高敵人</dt><dd>${escapeHtml(record.maxEnemies)}</dd></div><div><dt>地圖物件</dt><dd>${escapeHtml(record.maxWorldFeatures)}</dd></div><div><dt>粒子</dt><dd>${escapeHtml(record.maxParticles)}</dd></div><div><dt>ring</dt><dd>${escapeHtml(record.maxRings)}</dd></div><div><dt>壓力</dt><dd>${escapeHtml(record.pressure)}</dd></div><div><dt>預算</dt><dd>${escapeHtml(record.budget || '-')}</dd></div></dl></section>
        <section><h3>節奏</h3><dl><div><dt>最久波</dt><dd>${escapeHtml(record.longestWave)}</dd></div><div><dt>Boss</dt><dd>${escapeHtml(record.bossName || '-')}${record.bossTime ? `｜${escapeHtml(formatTime(record.bossTime))}` : ''}${record.bossPhase2 ? `｜二階段 ${escapeHtml(formatTime(record.bossPhase2Survival || 0))}` : ''}</dd></div><div><dt>Boss 破招</dt><dd>${escapeHtml(record.bossBreakCount || 0)} 次</dd></div><div><dt>Boss 節奏</dt><dd>${escapeHtml(record.bossRhythmCount || 0)} 次</dd></div><div><dt>核心超載</dt><dd>${escapeHtml(record.coreOverdriveCount || 0)} 次｜核心連殺 ${escapeHtml(record.coreStreakBest || 0)}</dd></div><div><dt>擊破爆發</dt><dd>${escapeHtml(record.combatSurgeCount || 0)} 次｜連殺 ${escapeHtml(record.combatComboBest || 0)}</dd></div><div><dt>核心試煉</dt><dd>${escapeHtml(record.coreTrialCount || 0)} 完成｜命中 ${escapeHtml(record.coreResonanceHits || 0)}</dd></div><div><dt>擦彈機動</dt><dd>${escapeHtml(record.evasionSurgeCount || 0)} 次｜擦彈 ${escapeHtml(record.grazes || 0)}</dd></div><div><dt>整備</dt><dd>${record.prepDrops ? '終局補給已投放' : '未抵達整備波'}</dd></div><div><dt>分數</dt><dd>${escapeHtml(record.score)}</dd></div></dl></section>
        <section><h3>星域內容</h3><dl><div><dt>區域</dt><dd>${escapeHtml(record.zone || '-')}</dd></div><div><dt>契約</dt><dd>${escapeHtml(record.contract || '-')}</dd></div><div><dt>局內路線</dt><dd>${escapeHtml(record.routeChoices?.length ? record.routeChoices.map(r => r.split('｜')[0]).join(' + ') : '-')}</dd></div><div><dt>異變</dt><dd>${escapeHtml(record.anomaly || '-')}</dd></div><div><dt>Boss改造</dt><dd>${escapeHtml(record.bossModifier || '-')}</dd></div><div><dt>戰術破解</dt><dd>${escapeHtml(record.tacticBreakCount || 0)} 次</dd></div></dl></section>
      </div>
      <div class="skill-chips"><b>事件紀錄</b>${eventHtml}</div>
      <div class="skill-chips"><b>Run 身份</b><span>${escapeHtml(record.contract || '標準委託')}</span><span>${escapeHtml(record.contractTag || '')}</span><span>${escapeHtml(record.routeChoices?.length ? record.routeChoices.map(r => r.split('｜')[0]).join(' + ') : '未抉擇')}</span><span>${escapeHtml(record.bossModifier || '')}</span></div>
      <div class="skill-chips"><b>局內抉擇</b>${routeChoiceHtml}</div>
      <div class="skill-chips"><b>抉擇效果</b>${routeChoiceEffectHtml}</div>
      <div class="skill-chips"><b>路線後果</b>${routeConsequenceHtml}</div>
      <div class="skill-chips"><b>後果獎勵</b>${routeConsequenceEffectHtml}</div>
      <div class="skill-chips"><b>Boss 前預備</b>${routeBossPrepHtml}</div>
      <div class="skill-chips"><b>錯過後果</b>${routeConsequenceMissHtml}</div>
      <div class="skill-chips"><b>事件加成</b>${boostHtml}</div>
      <div class="skill-chips"><b>異變任務</b>${anomalyHtml}</div>
      <div class="skill-chips"><b>節奏節點</b>${paceHtml}</div>
      <div class="skill-chips"><b>目標路線</b>${routeHtml}</div>
      <div class="skill-chips"><b>目標連鎖</b>${chainHtml}</div>
      <div class="skill-chips"><b>Boss 機制</b>${bossHtml}</div>
      <div class="skill-chips"><b>Boss 破招</b>${bossBreakHtml}</div>
      <div class="skill-chips"><b>Boss 節奏</b>${bossRhythmHtml}</div>
      <div class="skill-chips"><b>Boss 擊破亮點</b>${bossHighlightHtml}</div>
      <div class="skill-chips"><b>Build 核心諧振</b>${coreResonanceHtml}</div>
      <div class="skill-chips"><b>核心試煉</b>${coreTrialHtml}</div>
      <div class="skill-chips"><b>試煉逾時</b>${coreTrialMissHtml}</div>
      <div class="skill-chips"><b>Build 核心超載</b>${coreOverdriveHtml}</div>
      <div class="skill-chips"><b>擊破爆發</b>${combatSurgeHtml}</div>
      <div class="skill-chips"><b>擦彈機動</b>${evasionSurgeHtml}</div>
      <div class="skill-chips"><b>戰術組合</b>${tacticHtml}</div>
      <div class="skill-chips"><b>戰術破解</b>${tacticBreakHtml}</div>
      <div class="skill-chips"><b>主要流派</b><span>${escapeHtml(record.build || '未成形')}</span></div>
      <div class="skill-chips"><b>技能流派</b>${skillHtml}</div>
      <div class="diagnosis"><b>解鎖目標</b><p>${unlockHtml}</p></div>
      <div class="diagnosis"><b>診斷</b><p>${escapeHtml(record.diagnosis)}</p></div>
      <div class="next-challenges"><b>下一局挑戰</b><ul>${record.challenges.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>`;
    renderPostRunActions(card);
    renderRecentRuns(card);
    (card.querySelector('#recentRunsPanel') || card.querySelector('#postRunActions') || actions || card.querySelector('.version-card'))?.after(report);
  }

  const upgradesRuntime = {
    splitShot: 0,
    chain: 0,
    shieldRegen: 0,
    shardMultiplier: 0,
    slowField: 0,
    orbitals: 0,
    homingRounds: 0,
    weakScan: 0,
    harvestDrive: 0,
    lanceRounds: 0,
    plasmaBurst: 0,
    flakBurst: 0,
    railCharge: 0,
    critCore: 0,
    burnRounds: 0,
    chainBurst: 0,
    railOverload: 0,
    flakRecoil: 0,
    droneWing: 0
  };

  const upgradeDefs = [
    { id: 'cannon', lane: '火力系', name: '脈衝主砲', desc: '提高射速與子彈傷害。', base: 18, scale: 1.47, max: 12 },
    { id: 'reactor', lane: '火力系', name: '過載反應爐', desc: '提高所有武器傷害，Lv.3 後讓暴擊更穩。', base: 44, scale: 1.58, max: 6, requires: 'wave5' },
    { id: 'shield', lane: '生存系', name: '護盾矩陣', desc: '提高最大護盾，每級 +15。', base: 16, scale: 1.45, max: 12 },
    { id: 'armor', lane: '生存系', name: '緊急裝甲', desc: '提高最大護盾並略微降低撞擊/彈幕傷害。', base: 38, scale: 1.52, max: 6, requires: 'kills50' },
    { id: 'engine', lane: '生存系', name: '離子引擎', desc: '提高移動速度與衝刺恢復。', base: 15, scale: 1.42, max: 10 },
    { id: 'magnet', lane: '拾荒系', name: '磁吸場', desc: '擴大碎晶自動吸附範圍。', base: 12, scale: 1.4, max: 10 },
    { id: 'survey', lane: '拾荒系', name: '星圖掃描', desc: '提高目標與事件獎勵，並更容易完成拾荒競速。', base: 34, scale: 1.52, max: 6, requires: 'scrap200' },
    { id: 'drone', lane: '拾荒系', name: '無人機合約', desc: '提高離線碎晶收益。', base: 28, scale: 1.62, max: 8 }
  ];

  const buildDefs = {
    rapid: { name: '主砲速射流', color: '#37f6ff', core: '高頻主砲核心' },
    rail: { name: '軌砲穿透流', color: '#bdfcff', core: '穿透過載核心' },
    flak: { name: '霰彈近戰流', color: '#ff9f1c', core: '近距爆破核心' },
    plasma: { name: '電漿清場流', color: '#ff7a3d', core: '連鎖清場核心' },
    seeker: { name: '追蹤輔助流', color: '#ffd166', core: '自動索敵核心' },
    drone: { name: '無人機流', color: '#7aa7ff', core: '蜂群翼隊核心' },
    burn: { name: '暴擊灼燒流', color: '#ff4d6d', core: '熔毀弱點核心' },
    survival: { name: '生存續航流', color: '#4dff88', core: '韌性護盾核心' },
    economy: { name: '拾荒經濟流', color: '#ffd166', core: '碎晶滾雪球核心' }
  };

  const CORE_OVERDRIVE_KILLS = 9;
  const CORE_OVERDRIVE_WINDOW = 5.5;
  const coreOverdriveDefs = {
    rapid: { name: '高頻超載', desc: '射擊間隔 -18%', fireRateMult: .82 },
    rail: { name: '穿甲校準', desc: '火力 +16%｜Boss破招門檻-16%', damageMult: 1.16, bossBreakThresholdMult: .84, bossBreakWindowBonus: .35 },
    flak: { name: '近爆推進', desc: '火力 +8%｜受傷 -8%', damageMult: 1.08, incomingMult: .92 },
    plasma: { name: '電漿連鎖', desc: '火力 +12%｜射擊間隔 -6%', damageMult: 1.12, fireRateMult: .94 },
    seeker: { name: '索敵矩陣', desc: '射擊間隔 -10%｜磁吸 +70', fireRateMult: .9, magnetBonus: 70 },
    drone: { name: '蜂群同步', desc: '射擊間隔 -12%｜火力 +6%', fireRateMult: .88, damageMult: 1.06 },
    burn: { name: '熔毀節拍', desc: '火力 +14%｜受傷 -6%', damageMult: 1.14, incomingMult: .94 },
    survival: { name: '韌性護盾', desc: '受傷 -18%｜短暫自修', incomingMult: .82, regenBonus: 4.2 },
    economy: { name: '拾荒磁暴', desc: '磁吸 +160｜火力 +5%', magnetBonus: 160, damageMult: 1.05 }
  };

  const skillPool = [
    { id: 'splitShot', build: 'rapid', weight: 2, role: '多彈道', name: '三叉脈衝', desc: '主砲增加散射彈道。' },
    { id: 'chain', build: 'plasma', weight: 2, role: '連鎖', name: '連鎖電弧', desc: '擊殺時對附近敵人造成電弧傷害。' },
    { id: 'shieldRegen', build: 'survival', weight: 2, role: '續航', name: '自修護盾', desc: '每秒緩慢回復護盾。' },
    { id: 'shardMultiplier', build: 'economy', weight: 2, role: '收益', name: '碎晶精煉', desc: '敵人掉落碎晶增加。' },
    { id: 'slowField', build: 'seeker', weight: 1, role: '控場', name: '重力干擾', desc: '敵人靠近時會被減速。' },
    { id: 'orbitals', build: 'flak', weight: 2, role: '近身圈', name: '環繞刃翼', desc: '生成環繞玩家的近距離傷害刃翼。' },
    { id: 'homingRounds', build: 'seeker', weight: 3, role: '追蹤', name: '追蹤子彈', desc: '保留原本主砲，額外追加會追蹤敵人的微型彈。' },
    { id: 'lanceRounds', build: 'rail', weight: 2, role: '穿透', name: '穿甲光矛', desc: '主砲改良成高速穿透光矛，可連續貫穿敵人。' },
    { id: 'plasmaBurst', build: 'plasma', weight: 3, role: '範圍', name: '電漿爆裂', desc: '子彈命中時產生小範圍爆炸，適合清密集敵群。' },
    { id: 'flakBurst', build: 'flak', weight: 3, role: '近爆', name: '霰彈彈幕', desc: '額外噴出短距離扇形彈，適合近距離清場。' },
    { id: 'railCharge', build: 'rail', weight: 3, role: '重擊', name: '蓄能軌砲', desc: '每隔數發打出高傷害穿透重擊。' },
    { id: 'critCore', build: 'burn', weight: 3, role: '暴擊', name: '暴擊核心', desc: '主砲有機率造成暴擊，對 Boss 更有效。' },
    { id: 'burnRounds', build: 'burn', weight: 3, role: '持傷', name: '燃燒彈頭', desc: '命中後附加短時間灼燒，適合壓厚血敵人。' },
    { id: 'chainBurst', build: 'plasma', weight: 3, role: '爆裂', name: '連鎖爆裂', desc: '擊殺會觸發小爆裂，清群怪更穩。' },
    { id: 'railOverload', build: 'rail', weight: 4, role: '核心件', name: '軌砲過載', desc: '蓄能軌砲傷害與貫穿提高，但節奏更重。' },
    { id: 'flakRecoil', build: 'flak', weight: 4, role: '核心件', name: '霰彈反沖', desc: '霰彈發射時短暫反推飛船，方便拉開距離。' },
    { id: 'droneWing', build: 'drone', weight: 4, role: '無人機', name: '無人機增殖', desc: '額外釋放微型無人機光彈，形成被動輸出。' },
    { id: 'weakScan', build: 'rail', weight: 1, role: 'Boss', name: '弱點掃描', desc: '對精英與 Boss 造成額外傷害。' },
    { id: 'harvestDrive', build: 'rapid', weight: 3, role: '射速', name: '收割引擎', desc: '連續擊殺會短暫提高射速。' }
  ];

  function skillDef(id) {
    return skillPool.find(s => s.id === id);
  }

  function buildChoiceHint(skill) {
    const before = topBuild();
    const after = topBuild(skill.id);
    const def = buildDefs[skill.build];
    if (after.id === skill.build && after.score >= BUILD_CORE_SCORE && before.score < BUILD_CORE_SCORE) return `核心候選｜${def.core}`;
    if (before.id === skill.build && before.score > 0) return '主流派強化';
    if (before.score > 0) return '副流派展開';
    return '流派起手';
  }

  function buildCoverageHint(extraSkillId = null) {
    const scores = buildScoreMap(extraSkillId);
    const top = topBuild(extraSkillId);
    if (!top.def || top.score <= 0) return 'Build 診斷：尚未成形，先沿同一流派疊核心。';
    const boss = (scores.rail || 0) + (scores.burn || 0) + (scores.rapid || 0);
    const clear = (scores.plasma || 0) + (scores.flak || 0) + (scores.seeker || 0) + (scores.drone || 0);
    const sustain = (scores.survival || 0) + (scores.economy || 0) * .5;
    if (top.score < BUILD_CORE_SCORE) return `Build 診斷：${top.def.name} 還差 ${BUILD_CORE_SCORE - top.score} 分成核心。`;
    if (wave >= 5 && boss < 4) return `Build 診斷：${top.def.name} 已成形，但 Boss 火力偏少，可補軌砲/暴擊/主砲。`;
    if (runStats?.maxEnemies >= enemyCap() - 3 && clear < 4) return `Build 診斷：${top.def.name} 已成形，但清群偏弱，可補電漿/霰彈/追蹤。`;
    if (player && player.hp < player.maxHp * .42 && sustain < 3) return `Build 診斷：${top.def.name} 已成形，但續航偏弱，可補護盾或拾荒。`;
    return `Build 診斷：${top.def.name} 路線清楚，下一步可補副流派弱點。`;
  }

  function skillChoiceAnalysis(skill) {
    const beforeScores = buildScoreMap();
    const afterScores = buildScoreMap(skill.id);
    const before = topBuild();
    const after = topBuild(skill.id);
    const def = buildDefs[skill.build] || { name: '未分類', color: '#92a5c8', core: '核心' };
    const current = beforeScores[skill.build] || 0;
    const next = afterScores[skill.build] || 0;
    const tags = [];
    if (after.id === skill.build && next >= BUILD_CORE_SCORE && current < BUILD_CORE_SCORE) tags.push('核心候選');
    if (before.id === skill.build && before.score > 0) tags.push('主流派強化');
    if (before.score > 0 && before.id !== skill.build) tags.push('副流派展開');
    if (player && player.hp < player.maxHp * .45 && (skill.build === 'survival' || skill.id === 'shieldRegen')) tags.push('生存補強');
    if (wave >= 5 && ['rail', 'burn', 'rapid'].includes(skill.build)) tags.push('Boss 火力');
    if ((runStats?.maxEnemies || enemies.length) >= Math.max(10, enemyCap() - 7) && ['plasma', 'flak', 'seeker', 'drone'].includes(skill.build)) tags.push('清群補強');
    if (wave <= 5 && skill.build === 'economy') tags.push('早期滾雪球');
    if (!tags.length) tags.push('流派起手');

    let reason = `${def.name} ${current} → ${next} / ${BUILD_CORE_SCORE}`;
    if (tags.includes('核心候選')) reason += `，選下去會啟動「${def.core}」與「${coreResonanceDefs[skill.build]?.name || '核心諧振'}」。`;
    else if (tags.includes('主流派強化')) reason += '，穩定推高目前主軸。';
    else if (tags.includes('生存補強')) reason += '，目前護盾偏低，能降低暴斃風險。';
    else if (tags.includes('Boss 火力')) reason += '，適合準備 Boss 檢查。';
    else if (tags.includes('清群補強')) reason += '，適合處理敵量壓力。';
    else if (tags.includes('早期滾雪球')) reason += '，前期收益會放大後續選擇。';
    else if (tags.includes('副流派展開')) reason += `，補足 ${before.def?.name || '主流派'} 的弱點。`;
    else reason += '，建立本局第一個方向。';

    return { def, current, next, topAfter: after, tags, reason, core: tags.includes('核心候選'), coverage: buildCoverageHint(skill.id) };
  }

  function makeSkillChoices() {
    const picks = [];
    const add = skill => { if (skill && !picks.some(p => p.id === skill.id)) picks.push(skill); };
    const current = topBuild();
    if (current.id) add(choose(skillPool.filter(s => s.build === current.id)));
    const baseScore = topBuild().score;
    const coreCandidate = [...skillPool].sort(() => Math.random() - .5).find(s => topBuild(s.id).score >= BUILD_CORE_SCORE && baseScore < BUILD_CORE_SCORE);
    add(coreCandidate);
    for (const s of [...skillPool].sort(() => Math.random() - .5)) {
      add(s);
      if (picks.length >= 3) break;
    }
    return picks.slice(0, 3);
  }

  const enemyTypes = {
    chaser: { label: '追獵機', color: '#ff4d6d', hp: 21, speed: 68, r: 15, sides: 5, scrap: 1 },
    sprinter: { label: '閃擊機', color: '#ff7a3d', hp: 13, speed: 128, r: 11, sides: 3, scrap: 1 },
    tank: { label: '重甲機', color: '#ff9f1c', hp: 58, speed: 42, r: 24, sides: 6, scrap: 3 },
    shooter: { label: '狙擊球', color: '#ff3df2', hp: 27, speed: 50, r: 17, sides: 8, scrap: 2 },
    leech: { label: '吸能蟲', color: '#b66dff', hp: 34, speed: 76, r: 14, sides: 7, scrap: 2 },
    bomber: { label: '爆裂雷', color: '#ff7a3d', hp: 22, speed: 62, r: 16, sides: 6, scrap: 2 },
    shieldSat: { label: '護盾衛星', color: '#7aa7ff', hp: 38, speed: 48, r: 16, sides: 4, scrap: 4 },
    boss: { label: '星環吞噬者', color: '#ff4d6d', hp: 520, speed: 34, r: 48, sides: 10, scrap: 18 }
  };

  const eliteMods = {
    shielded: { name: '護盾', color: '#7aa7ff', hp: 1.55, speed: .92, scrap: 2 },
    splitter: { name: '分裂', color: '#ffd166', hp: 1.18, speed: 1.02, scrap: 2 },
    berserk: { name: '狂暴', color: '#ff4d6d', hp: .9, speed: 1.42, scrap: 2 },
    medic: { name: '治療', color: '#4dff88', hp: 1.28, speed: .96, scrap: 3 },
    phantom: { name: '幻影', color: '#bdfcff', hp: .82, speed: 1.64, scrap: 3 },
    juggernaut: { name: '巨像', color: '#ff9f1c', hp: 2.05, speed: .72, scrap: 4 },
    accelerator: { name: '加速', color: '#4dff88', hp: 1.05, speed: 1.28, scrap: 3 },
    refractor: { name: '折射', color: '#bdfcff', hp: 1.25, speed: 1.02, scrap: 3 }
  };

  const eliteGlyphs = { shielded: '◆', splitter: '✦', berserk: '!', medic: '+', phantom: '◇', juggernaut: '⬢', accelerator: '»', refractor: '◌' };
  const enemyGlyphs = { leech: '⌁', bomber: '!', shieldSat: '⊞', shooter: '•', tank: '■', sprinter: '▸', chaser: '◆' };

  const zoneDefs = {
    scrapyard: { name: '電磁殘骸帶', color: '#7aa7ff', desc: '殘骸密集、敵彈較慢，碎晶略多但戰場更擁擠。', featureBias: ['debris', 'debris', 'asteroid', 'resource', 'hazard'], scrapBonus: 1, enemyBias: ['shooter', 'shieldSat'], bossMod: { id: 'empShell', name: 'EMP 裝甲', tag: 'Boss護甲+8%｜彈幕-8%', color: '#7aa7ff', desc: 'Boss 攜帶電磁裝甲，較硬但射擊節奏略慢。', hpMult: 1.08, shotMult: .92, speedMult: .96, rewardBonus: 7 } },
    crystal: { name: '晶礦雲帶', color: '#ffd166', desc: '資源點更常見，晶礦會吸引高速敵人與拾荒競速事件。', featureBias: ['resource', 'resource', 'resource', 'repair', 'debris'], scrapBonus: 2, enemyBias: ['sprinter', 'sprinter', 'bomber'], bossMod: { id: 'crystalCarapace', name: '晶礦外殼', tag: 'Boss護甲+5%｜掉落+16', color: '#ffd166', desc: 'Boss 外殼帶有晶礦，稍硬但擊破報酬提高。', hpMult: 1.05, shotMult: 1, speedMult: 1, rewardBonus: 16 } },
    rift: { name: '裂隙邊界', color: '#ff4d6d', desc: '危險裂隙較多，但目標獎勵更高。', featureBias: ['hazard', 'hazard', 'resource', 'debris', 'repair'], scrapBonus: 1, enemyBias: ['leech', 'shooter'], bossMod: { id: 'riftOverload', name: '裂隙超載', tag: 'Boss招式+14%｜生命-4%', color: '#ff4d6d', desc: 'Boss 招式節奏更快，但核心更不穩定。', hpMult: .96, shotMult: 1.08, speedMult: 1.06, abilityMult: .86, rewardBonus: 10 } }
  };

  function zoneOptions() {
    return [
      { id: 'random', name: '隨機航線', color: '#bdfcff', desc: '每局抽一個星域，適合保持新鮮感。' },
      ...Object.entries(zoneDefs).map(([id, z]) => ({ id, ...z }))
    ];
  }

  function selectedZoneId() {
    return meta.selectedZone && (meta.selectedZone === 'random' || zoneDefs[meta.selectedZone]) ? meta.selectedZone : 'random';
  }

  function setSelectedZone(id) {
    meta.selectedZone = id === 'random' || zoneDefs[id] ? id : 'random';
    save(false);
    renderZonePanel();
    const name = zoneOptions().find(z => z.id === selectedZoneId())?.name || '隨機航線';
    flash(`星域路線：${name}`);
  }

  function renderZonePanel() {
    if (!ui.zonePanel) return;
    const current = selectedZoneId();
    ui.zonePanel.innerHTML = '<strong>星域路線</strong>';
    const grid = document.createElement('div');
    grid.className = 'zone-grid';
    for (const z of zoneOptions()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `zone-card${z.id === current ? ' active' : ''}`;
      btn.style.setProperty('--zone-color', z.color || '#37f6ff');
      const bossLine = z.bossMod ? `Boss：${z.bossMod.name}｜${z.bossMod.tag}` : 'Boss：每局隨星域抽取 modifier';
      btn.innerHTML = `<b style="color:${z.color || '#37f6ff'}">${z.name}</b><small>${z.desc}</small><small>${bossLine}</small>`;
      btn.addEventListener('click', () => setSelectedZone(z.id));
      grid.appendChild(btn);
    }
    ui.zonePanel.appendChild(grid);
  }

  const eventDefs = {
    meteor: { name: '流星雨', desc: '危險流星穿越戰場，擊中敵我皆會受傷。', color: '#ff7a3d' },
    overclock: { name: '超頻風暴', desc: '你的射速提升，但敵人行動也更快。', color: '#37f6ff' },
    blackout: { name: '電磁干擾', desc: '狙擊球變多，自動鎖定半徑縮短。', color: '#ff3df2' },
    rich: { name: '碎晶富礦', desc: '敵人掉落增加，但精英出現率提高。', color: '#ffd166' },
    hazard: { name: '輻射裂隙', desc: '危險區域擴散，靠近會持續受損。', color: '#ff4d6d' },
    supply: { name: '補給航道', desc: '補給站出現率提高，適合喘息與回復。', color: '#4dff88' },
    eliteStorm: { name: '菁英獵殺令', desc: '菁英敵人大量出現，但擊破獎勵提高。', color: '#bdfcff' },
    droneSwarm: { name: '蜂群入侵', desc: '高速小型敵人持續湧入。', color: '#4dff88' },
    gravityWell: { name: '重力井', desc: '戰場重力異常，敵我都會被拉向訊號核心。', color: '#b66dff' },
    empStorm: { name: 'EMP 風暴', desc: '自動鎖定距離縮短，但敵彈與敵機也會被拖慢。', color: '#7aa7ff' },
    salvageRush: { name: '拾荒競速', desc: '限時收集碎晶，達標會追加事件獎勵。', color: '#ffd166' }
  };

  const tempoBoostDefs = {
    meteor: { label: '高風險高獎勵', name: '流星破甲', desc: '火力 +18%', duration: 11, damageMult: 1.18 },
    overclock: { label: '火力事件', name: '主砲超頻', desc: '射擊間隔 -24%', duration: 12, fireRateMult: .76 },
    blackout: { label: '索敵干擾', name: '電磁鎖定', desc: '火力 +12%', duration: 10, damageMult: 1.12 },
    rich: { label: '資源事件', name: '富礦磁吸', desc: '磁吸範圍 +120', duration: 13, magnetBonus: 120 },
    hazard: { label: '高風險高獎勵', name: '裂隙抗性', desc: '受傷 -16%', duration: 11, incomingMult: .84 },
    supply: { label: '救命補給', name: '護盾整備', desc: '短暫自修護盾', duration: 13, regenBonus: 5.2, incomingMult: .9 },
    eliteStorm: { label: '獵殺事件', name: '菁英破甲', desc: '火力 +22%', duration: 12, damageMult: 1.22 },
    droneSwarm: { label: '清群事件', name: '蜂群超頻', desc: '射擊間隔 -18%', duration: 11, fireRateMult: .82 },
    gravityWell: { label: '走位事件', name: '重力牽引', desc: '磁吸範圍 +140', duration: 12, magnetBonus: 140 },
    empStorm: { label: '控場事件', name: 'EMP 護層', desc: '受傷 -12%｜火力 +8%', duration: 12, incomingMult: .88, damageMult: 1.08 },
    salvageRush: { label: '限時競速', name: '拾荒磁暴', desc: '磁吸範圍 +180', duration: 13, magnetBonus: 180 }
  };

  function tempoProfile(idOrEvent) {
    const id = typeof idOrEvent === 'string' ? idOrEvent : idOrEvent?.id;
    const event = eventDefs[id] || idOrEvent || {};
    return { id, color: event.color || '#ffd166', ...(tempoBoostDefs[id] || { label: '事件加成', name: '戰術餘波', desc: '火力 +10%', duration: 10, damageMult: 1.1 }) };
  }

  function applyTempoBoost(eventRef, success = true) {
    if (!eventRef || !player) return null;
    const profile = tempoProfile(eventRef);
    const scale = success ? 1 : .55;
    activeTempoBoost = {
      id: profile.id,
      name: profile.name,
      label: profile.label,
      desc: profile.desc,
      color: profile.color,
      timer: Math.max(6, profile.duration * scale),
      duration: Math.max(6, profile.duration * scale),
      fireRateMult: profile.fireRateMult ? 1 + (profile.fireRateMult - 1) * scale : 1,
      damageMult: profile.damageMult ? 1 + (profile.damageMult - 1) * scale : 1,
      incomingMult: profile.incomingMult ? 1 + (profile.incomingMult - 1) * scale : 1,
      magnetBonus: Math.round((profile.magnetBonus || 0) * scale),
      regenBonus: (profile.regenBonus || 0) * scale
    };
    if (runStats) {
      const mark = `${eventRef.name || profile.id}→${activeTempoBoost.name}${success ? '' : '弱化'}`;
      if (!runStats.eventBoosts.includes(mark)) runStats.eventBoosts.push(mark);
    }
    addText(player.x, player.y - 72, `${activeTempoBoost.name} ${Math.ceil(activeTempoBoost.timer)}s`, profile.color);
    particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .45, max: .45, r: 20, color: profile.color, ring: true, fastRing: true });
    burst(player.x, player.y, profile.color, 18, .78);
    wakeMissionHud(3.2);
    return activeTempoBoost;
  }

  function tempoBoostActive() {
    return activeTempoBoost && activeTempoBoost.timer > 0 ? activeTempoBoost : null;
  }

  function tacticBreakActive() {
    return activeTacticBreak && activeTacticBreak.timer > 0 ? activeTacticBreak : null;
  }

  function bossBreakActive() {
    return activeBossBreak && activeBossBreak.timer > 0 ? activeBossBreak : null;
  }

  function bossRhythmActive() {
    return activeBossRhythm && activeBossRhythm.timer > 0 ? activeBossRhythm : null;
  }

  function applyBossRhythmBoost(source = '安全縫穿越') {
    if (!player) return null;
    if (activeBossRhythm && activeBossRhythm.timer > activeBossRhythm.duration * .62) return activeBossRhythm;
    activeBossRhythm = { id: 'gapCounter', name: '穿縫反擊', source, color: '#4dff88', desc: '火力 +6%｜射速 +3%｜受傷 -6%', timer: 4.2, duration: 4.2, damageMult: 1.06, fireRateMult: .97, incomingMult: .94 };
    if (runStats) {
      runStats.bossRhythmCount = (runStats.bossRhythmCount || 0) + 1;
      runStats.bossRhythms.push(`${source}→${activeBossRhythm.name}`);
      runStats.bossRhythms = runStats.bossRhythms.slice(-6);
      recordPaceNode(`Boss 節奏｜${source}→${activeBossRhythm.name}`);
    }
    addText(player.x, player.y - player.r - 44, activeBossRhythm.name, activeBossRhythm.color);
    addBossTelegraph('counter', { x: player.x, y: player.y, r: player.r + 44, color: activeBossRhythm.color, duration: .7, label: activeBossRhythm.name });
    burst(player.x, player.y, activeBossRhythm.color, 20, .92);
    sfx('counter');
    haptic(18);
    wakeMissionHud(3.6);
    return activeBossRhythm;
  }

  function checkBossPulseGap(t) {
    if (!player || t.kind !== 'pulse' || t.rewarded) return;
    const left = clamp(t.timer / t.duration, 0, 1);
    const p = 1 - left;
    const ringR = t.r * (.74 + p * .34);
    const d = Math.hypot(player.x - t.x, player.y - t.y);
    const angle = Math.atan2(player.y - t.y, player.x - t.x);
    const diff = Math.abs(((angle - (t.gap || 0) + Math.PI * 3) % TWO_PI) - Math.PI);
    if (d < ringR + 92 && d > Math.max(22, ringR - 92) && diff < (t.gapWidth || .5) * .62) {
      t.rewarded = true;
      applyBossRhythmBoost('脈衝安全縫');
    }
  }

  function recordBossHighlight(label) {
    if (!runStats || !label) return;
    runStats.bossHighlights.push(label);
    runStats.bossHighlights = runStats.bossHighlights.slice(-6);
    recordPaceNode(`Boss 亮點｜${label}`);
  }

  function triggerBossPhaseCinematic(e) {
    if (!e || e.type !== 'boss') return;
    const label = e.finalBoss ? '核心失控二階段' : `${e.label} 二階段`;
    bossCinematic = { kind: 'phase2', x: e.x, y: e.y, color: e.color || '#ff4d6d', label, timer: 1.45, duration: 1.45, final: !!e.finalBoss };
    addBossTelegraph('phase', { x: e.x, y: e.y, r: e.r + (e.finalBoss ? 92 : 64), color: e.color || '#ff4d6d', duration: 1.3, label });
    triggerHitStop(e.finalBoss ? .13 : .09);
    addShake(e.finalBoss ? 8.2 : 5.6, .34);
    haptic(e.finalBoss ? 72 : 38);
    sfx('bossTell');
    recordBossHighlight(label);
  }

  function triggerBossDefeatCinematic(e) {
    if (!e || e.type !== 'boss') return;
    const final = !!e.finalBoss || wave >= SECTOR_CLEAR_WAVE;
    const label = final ? '星環核心回收｜終局碎晶雨' : `${e.label} 擊破`;
    bossCinematic = { kind: final ? 'victory' : 'defeat', x: e.x, y: e.y, color: final ? '#bdfcff' : e.color || '#ff4d6d', label, timer: final ? 2.8 : 1.25, duration: final ? 2.8 : 1.25, final };
    victoryRainTimer = final ? 2.8 : Math.max(victoryRainTimer, .75);
    triggerHitStop(final ? .16 : .08);
    addShake(final ? 10 : 5.8, final ? .46 : .24);
    recordBossHighlight(label);
    const rain = final ? 42 : 16;
    for (let i = 0; i < rain; i++) {
      const a = Math.random() * TWO_PI;
      const d = rand(28, final ? 240 : 120);
      const x = e.x + Math.cos(a) * d;
      const y = e.y + Math.sin(a) * d;
      if (final && i < 20) dropShard(x, y, 1);
      particles.push({ x, y, vx: Math.cos(a) * rand(80, 420), vy: Math.sin(a) * rand(80, 420) + rand(-120, 80), life: rand(.55, 1.55), max: 1.55, r: rand(2.5, final ? 7 : 4.5), color: i % 4 === 0 ? '#ffffff' : final ? '#ffd166' : e.color || '#ff4d6d', ring: false, kind: i % 3 === 0 ? 'spark' : '', len: rand(12, 32) });
    }
    for (let i = 0; i < (final ? 4 : 2); i++) {
      particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .42 + i * .13, max: .42 + i * .13, r: e.r * (.55 + i * .28), color: i % 2 ? '#ffd166' : '#ffffff', ring: true, fastRing: true });
    }
  }

  function tacticById(id) {
    return id && tacticDefs[id] ? { id, ...tacticDefs[id] } : null;
  }

  function tacticCounterText(tactic = activeTactic) {
    return tactic?.counter || tactic?.desc || '先拆關鍵單位，再清雜兵。';
  }

  function isTacticKeyEnemy(e, tactic = activeTactic) {
    if (!e || !tactic) return false;
    return (tactic.keyTypes || []).includes(e.type) || (e.elite?.id && (tactic.keyElites || []).includes(e.elite.id));
  }

  function applyTacticBreak(tactic, e) {
    if (!tactic || !runStats || !isTacticKeyEnemy(e, tactic)) return null;
    const name = tactic.breakName || '戰術破解';
    activeTacticBreak = {
      id: tactic.id,
      name,
      tacticName: tactic.name,
      color: tactic.color || '#ffd166',
      desc: '火力 +10%｜射速 +8%｜受傷 -8%',
      timer: 7.5,
      duration: 7.5,
      damageMult: 1.1,
      fireRateMult: .92,
      incomingMult: .92,
      magnetBonus: 42
    };
    runStats.tacticBreakCount = (runStats.tacticBreakCount || 0) + 1;
    const label = `${tactic.name}→${name}`;
    runStats.tacticBreaks.push(label);
    runStats.tacticBreaks = runStats.tacticBreaks.slice(-6);
    recordPaceNode(`戰術破解｜${label}`);
    addText(e.x, e.y - e.r - 26, name, tactic.color || e.color || '#ffd166');
    flash(`戰術破解：${label}｜${activeTacticBreak.desc}`);
    burst(e.x, e.y, tactic.color || e.color || '#ffd166', 22, 1.25);
    addShake(2.4, .16);
    haptic(24);
    wakeMissionHud(4.2);
    return activeTacticBreak;
  }

  const tacticDefs = {
    shieldWall: {
      name: '護盾重甲陣', color: '#7aa7ff', minWave: 4,
      desc: '護盾衛星保護重甲機；先打藍色衛星再清主群。',
      counter: '先拆藍色衛星，重甲失盾後再清。', keyTypes: ['shieldSat'], breakName: '護盾破解',
      bias: ['shieldSat', 'tank', 'tank', 'chaser'], elites: [], events: ['empStorm', 'eliteStorm'], zones: ['scrapyard']
    },
    blitzMines: {
      name: '加速爆雷群', color: '#ff7a3d', minWave: 5,
      desc: '加速精英帶爆裂雷逼你後撤；看到閃爍十字先拉開。',
      counter: '先拉開爆裂雷，擊破加速精英。', keyTypes: ['bomber'], keyElites: ['accelerator'], breakName: '爆雷破解',
      bias: ['bomber', 'bomber', 'sprinter', 'sprinter'], elites: [{ type: 'sprinter', mod: 'accelerator' }], events: ['droneSwarm', 'overclock'], zones: ['crystal']
    },
    medicSwarm: {
      name: '治療蜂群', color: '#4dff88', minWave: 6,
      desc: '治療精英躲在小怪後方；範圍清場或先點殺治療者。',
      counter: '先殺綠色治療精英，別讓小怪回血。', keyElites: ['medic'], breakName: '治療中斷',
      bias: ['chaser', 'sprinter', 'sprinter', 'chaser'], elites: [{ type: 'chaser', mod: 'medic' }], events: ['droneSwarm', 'eliteStorm'], zones: ['crystal']
    },
    sniperRift: {
      name: '狙擊裂隙線', color: '#ff3df2', minWave: 5,
      desc: '狙擊球配裂隙封路；橫向移動，別站在紅區。',
      counter: '橫向躲粉色狙擊線，先拆狙擊球。', keyTypes: ['shooter'], breakName: '狙擊斷線',
      bias: ['shooter', 'shooter', 'chaser'], elites: [], events: ['blackout', 'hazard'], zones: ['rift', 'scrapyard'], feature: 'hazard'
    },
    leechRefractor: {
      name: '吸能折射網', color: '#b66dff', minWave: 7,
      desc: '吸能蟲加折射精英拖長戰鬥；用穿透或爆裂快速破網。',
      counter: '用穿透或爆裂先破折射吸能蟲。', keyTypes: ['leech'], keyElites: ['refractor'], breakName: '折射破網',
      bias: ['leech', 'leech', 'shooter'], elites: [{ type: 'leech', mod: 'refractor' }], events: ['gravityWell', 'empStorm'], zones: ['rift']
    }
  };

  const bossMechanicDefs = {
    ring: { title: '星環吞噬者', intro: '追擊 + 扇形彈幕；保持橫向移動。', phase: '二階段：彈幕密度提高，別貼臉硬吃。', mechanic: '追擊扇形彈幕', counter: '橫向拉開扇形彈幕，預警後集火核心。', breakName: '星環破防', breakHint: '扇形預警後 4 秒內集中輸出。' },
    forge: { title: '熔核鍛造者', intro: '熔核流星 + 危險火圈；不要站紅區。', phase: '二階段：流星更頻繁，先保走位。', mechanic: '熔核流星', counter: '先離開橘色落點，流星後回頭集火。', breakName: '熔核冷卻', breakHint: '躲過流星後把火力灌進 Boss。' },
    void: { title: '虛空指揮官', intro: '召喚壓迫 + 紫色彈線；先清召喚物。', phase: '二階段：召喚與彈線同步加速。', mechanic: '虛空召喚', counter: '先清紫色召喚物，再處理 Boss 彈線。', breakName: '虛空斷召', breakHint: '擊破 Boss 召喚物或在窗口內集火。' },
    pulse: { title: '虛空脈衝體', intro: '環形彈幕；找縫隙穿過，不要貼臉。', phase: '二階段：雙層脈衝環，橫向穿縫。', mechanic: '環形脈衝', counter: '看環形缺口穿過，聚能時不要貼臉。', breakName: '脈衝斷頻', breakHint: '環形脈衝讀條時集中火力。' },
    brood: { title: '裂隙母巢', intro: '裂隙 + 小怪 + 護盾衛星；先拆衛星。', phase: '二階段：裂隙與召喚加速。', mechanic: '母巢裂隙', counter: '先拆孵化物與護盾衛星，別站裂隙。', breakName: '母巢斷孵', breakHint: '擊破孵化物或快速輸出 Boss。' },
    core: { title: '星環核心主宰', intro: '終局考驗：混合彈幕、召喚與裂隙。', phase: '二階段：核心失控，所有招式加速。', mechanic: '終局混合招式', counter: '先讀招式類型：流星躲圈、召喚先清、脈衝穿縫。', breakName: '核心破防', breakHint: '終局招式讀條時集中火力或清召喚物。' }
  };

  function bossMechanic(id) {
    return bossMechanicDefs[id] || bossMechanicDefs.ring;
  }

  function recordBossMechanic(label) {
    if (!runStats || !label) return;
    if (!runStats.bossMechanics.includes(label)) runStats.bossMechanics.push(label);
  }

  function currentBoss() {
    return enemies.find(e => !e.dead && e.type === 'boss') || null;
  }

  function bossReadInfo(e, move = null) {
    const base = bossMechanic(e?.bossVariant);
    if (e?.finalBoss && move) {
      const moveNames = { meteor: '終局流星', summon: '核心召喚', rift: '核心裂隙', pulse: '核心脈衝' };
      const counters = { meteor: '看到橘色流星落點先橫移。', summon: '先清核心召喚物，避免被包夾。', rift: '離開紅色裂隙區，保持外圈走位。', pulse: '看環形缺口穿過，不要貼臉。' };
      const hints = { meteor: '流星落下後 4 秒內集火核心。', summon: '擊破核心召喚物會開破防。', rift: '裂隙展開時集火核心。', pulse: '脈衝讀條時集中火力。' };
      const colors = { meteor: '#ff7a3d', summon: '#b66dff', rift: '#ff4d6d', pulse: '#bdfcff' };
      return { ...base, title: moveNames[move] || base.mechanic, counter: counters[move] || base.counter, breakHint: hints[move] || base.breakHint, breakName: base.breakName, mechanic: base.mechanic, color: colors[move] || base.color };
    }
    return { ...base, title: base.mechanic, counter: base.counter || base.intro, breakHint: base.breakHint || 'Boss 出招讀條時集中火力。', breakName: base.breakName || 'Boss 破防' };
  }

  function addBossTelegraph(kind, opts = {}) {
    const duration = opts.duration || 1.1;
    const t = { kind, x: opts.x || 0, y: opts.y || 0, r: opts.r || 80, color: opts.color || '#ff4d6d', timer: duration, duration, angle: opts.angle || 0, gap: opts.gap || 0, gapWidth: opts.gapWidth || .55, label: opts.label || '', targetX: opts.targetX, targetY: opts.targetY, rewarded: false, seed: Math.random() * 99 };
    bossTelegraphs.push(t);
    return t;
  }

  function addBossSummonTelegraph(add, info = {}) {
    if (!add) return null;
    add.spawnRift = 1.15;
    add.spawnRiftMax = 1.15;
    return addBossTelegraph('summon', { x: add.x, y: add.y, r: add.r + 42, color: info.color || '#b66dff', duration: 1.35, label: info.breakName || '召喚物' });
  }

  function firePulseRing(e, opts = {}) {
    if (!e || !player) return;
    const count = opts.count || (e.phase2 ? 18 : 12);
    const spin = opts.spin ?? runTime * (e.phase2 ? .9 : .55);
    const speed = (opts.speed || (e.phase2 ? 210 : 175)) * (activeEvent?.id === 'empStorm' ? .68 : 1);
    const gap = opts.gap ?? Math.atan2(player.y - e.y, player.x - e.x) + rand(-.22, .22);
    const gapWidth = opts.gapWidth || (e.phase2 ? .42 : .54);
    addBossTelegraph('pulse', { x: e.x, y: e.y, r: e.r + (e.phase2 ? 104 : 86), color: opts.color || e.color || '#bdfcff', duration: .9, gap, gapWidth, label: '安全缺口' });
    for (let i = 0; i < count; i++) {
      const aa = spin + i / count * TWO_PI;
      const diff = Math.abs(((aa - gap + Math.PI * 3) % TWO_PI) - Math.PI);
      if (diff < gapWidth * .5) continue;
      enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(aa) * speed, vy: Math.sin(aa) * speed, r: 4.8, life: 4.5, dmg: e.phase2 ? 13 : 10, color: opts.color || '#bdfcff' });
    }
  }

  function updateBossTelegraphs(dt) {
    for (const t of bossTelegraphs) {
      checkBossPulseGap(t);
      t.timer -= dt;
    }
    bossTelegraphs = bossTelegraphs.filter(t => t.timer > 0);
  }

  function armBossBreakWindow(e, info = bossReadInfo(e)) {
    if (!e || e.type !== 'boss') return null;
    const modifier = e.bossModifier || currentBossModifier();
    const core = coreOverdriveActive();
    const threshold = Math.max(28, e.maxHp * (e.finalBoss ? .035 : .045) * (modifier.breakThresholdMult || 1) * (core?.bossBreakThresholdMult || 1));
    const duration = 4.2 + (modifier.breakWindowBonus || 0) + (core?.bossBreakWindowBonus || 0);
    e.breakWindow = { name: info.breakName || 'Boss 破防', source: info.title || info.mechanic || 'Boss 招式', counter: info.counter || '', threshold, progress: 0, timer: duration, duration, color: info.color || e.color || '#ff4d6d' };
    wakeMissionHud(4.6);
    return e.breakWindow;
  }

  function announceBossMove(e, info = bossReadInfo(e)) {
    if (!e || e.type !== 'boss') return;
    bossAlert = { title: `Boss 讀題｜${info.title || info.mechanic}`, desc: `反制：${info.counter || info.intro}`, hint: `破招：${info.breakHint || '集中火力打開破防窗口。'}`, color: info.color || e.color || '#ff4d6d' };
    bossAlertTimer = 3.0;
    recordBossMechanic(info.mechanic || info.title);
    flash(`${bossAlert.title}｜${bossAlert.desc}`);
    addBossTelegraph('charge', { x: e.x, y: e.y, r: e.r + 64, color: info.color || e.color || '#ff4d6d', duration: .82, label: info.title || info.mechanic || '蓄力' });
    sfx('bossTell');
    haptic(10);
    armBossBreakWindow(e, info);
  }

  function applyBossBreak(source, name = null, sourceLabel = null) {
    const boss = source?.type === 'boss' ? source : currentBoss();
    const color = boss?.color || source?.color || '#ffd166';
    const breakName = name || source?.bossBreakName || bossReadInfo(boss).breakName || 'Boss 破防';
    const label = sourceLabel || source?.bossBreakSource || boss?.breakWindow?.source || bossReadInfo(boss).mechanic || 'Boss 招式';
    activeBossBreak = { id: breakName, name: breakName, source: label, color, desc: '火力 +12%｜射速 +6%｜受傷 -10%', timer: 8, duration: 8, damageMult: 1.12, fireRateMult: .94, incomingMult: .9 };
    if (runStats) {
      runStats.bossBreakCount = (runStats.bossBreakCount || 0) + 1;
      runStats.bossBreaks.push(`${label}→${breakName}`);
      runStats.bossBreaks = runStats.bossBreaks.slice(-6);
      recordPaceNode(`Boss 破招｜${label}→${breakName}`);
    }
    if (boss) { boss.breakWindow = null; boss.abilityClock = Math.max(boss.abilityClock || 0, 1.4); boss.hit = Math.max(boss.hit || 0, .22); }
    addText((boss || source).x, (boss || source).y - (boss || source).r - 32, breakName, color);
    flash(`Boss 破招：${label}→${breakName}｜${activeBossBreak.desc}`);
    addBossTelegraph('shatter', { x: (boss || source).x, y: (boss || source).y, r: (boss || source).r + 54, color: '#ffffff', duration: .72, label: breakName });
    triggerHitStop(.085);
    sfx('counter');
    burst((boss || source).x, (boss || source).y, color, 34, 1.45);
    addShake(4.2, .2);
    haptic(36);
    wakeMissionHud(4.8);
    return activeBossBreak;
  }

  function markBossKeyAdd(add, info) {
    if (!add || !info) return add;
    add.bossKey = true;
    add.bossBreakName = info.breakName || 'Boss 破防';
    add.bossBreakSource = info.title || info.mechanic || 'Boss 召喚';
    add.telegraph = Math.max(add.telegraph || 0, .7);
    return add;
  }

  function recordBossBreakDamage(e, amount) {
    if (!e?.breakWindow || e.breakWindow.timer <= 0 || amount <= 0) return;
    e.breakWindow.progress += amount;
    if (e.breakWindow.progress >= e.breakWindow.threshold) applyBossBreak(e, e.breakWindow.name, e.breakWindow.source);
  }

  function announceBoss(e, phase = 'intro') {
    if (!e || e.type !== 'boss') return;
    const info = bossMechanic(e.bossVariant);
    const modifier = e.bossModifier || currentBossModifier();
    const desc = phase === 'phase2' ? info.phase : `${info.intro}｜星域改造：${modifier.name}（${modifier.tag}）`;
    bossAlert = { title: phase === 'phase2' ? `${e.label}｜二階段` : `${e.finalBoss ? '終局 Boss' : 'Boss'}：${e.label}`, desc, color: modifier.color || e.color || '#ff4d6d' };
    bossAlertTimer = phase === 'phase2' ? 2.8 : 3.4;
    recordBossMechanic(phase === 'phase2' ? `${info.mechanic}｜二階段` : `${info.mechanic}｜${modifier.name}`);
    flash(`${bossAlert.title}｜${desc}`);
  }

  const objectiveDefs = {
    scan: { name: '掃描信標', color: '#bdfcff', event: ['overclock', 'empStorm', 'rich'], routeBias: ['overclock', 'empStorm', 'rich'], reward: 1, charge: 2.4, sideLabel: '穩定掃描', sideGoal: 3, sideHint: '站在圈內完成 3 次掃描脈衝。' },
    hold: { name: '守點核心', color: '#7aa7ff', event: ['supply', 'empStorm', 'eliteStorm'], routeBias: ['supply', 'empStorm'], reward: 1.35, charge: 6.2, sideLabel: '守住攻勢', sideGoal: 3, sideHint: '守點期間撐過 3 次敵群衝擊。' },
    harvest: { name: '採集晶礦', color: '#ffd166', event: ['rich', 'salvageRush'], routeBias: ['salvageRush', 'rich'], reward: 1.2, charge: 4.2, sideLabel: '採出晶礦', sideGoal: 6, sideHint: '採集期間噴出 6 批碎晶。' },
    rift: { name: '清除裂隙', color: '#ff4d6d', event: ['hazard', 'gravityWell', 'empStorm'], routeBias: ['hazard', 'gravityWell'], reward: 1.45, charge: 4.8, sideLabel: '封印裂隙', sideGoal: 3, sideHint: '在圈內壓制 3 次裂隙脈衝。' },
    hunt: { name: '獵殺菁英', color: '#ff3df2', event: ['eliteStorm', 'rich', 'salvageRush'], routeBias: ['eliteStorm', 'rich'], reward: 1.7, charge: 1, sideLabel: '擊破目標', sideGoal: 1, sideHint: '進入區域後擊破標記菁英。' }
  };

  const tutorialDefs = [
    { id: 'move', label: '推進', text: 'WASD/方向鍵移動；滑鼠只負責朝向與手動瞄準。', target: 120, progress: () => tutorialRun?.moved || 0 },
    { id: 'kill', label: '擊殺', text: '保持距離，主砲會自動射擊；先擊毀 3 架無人機。', target: 3, progress: () => runKills },
    { id: 'scrap', label: '拾取', text: '靠近黃色碎晶會自動拾取；先收集 8 個碎晶。', target: 8, progress: () => Math.max(0, Math.floor(meta.scrap - (tutorialRun?.startScrap || 0))) },
    { id: 'objective', label: '目標', text: '跟著藍色箭頭靠近目標點，站在光圈內充能。', target: 1, progress: () => runObjectives },
    { id: 'skill', label: '技能', text: '經驗滿時會暫停三選一；選第一個本局技能。', target: 1, progress: () => runStats?.skills?.length || 0 }
  ];

  const achievementDefs = [
    { id: 'wave5', name: '突破第 5 波', unlock: '解鎖過載反應爐', test: () => wave >= 5 || meta.bestWave >= 5, progress: () => `${Math.min(Math.max(wave, meta.bestWave), 5)}/5 波`, reward: 20 },
    { id: 'kills50', name: '擊毀 50 架無人機', unlock: '解鎖緊急裝甲', test: () => totalKills >= 50, progress: () => `${Math.min(totalKills, 50)}/50 擊殺`, reward: 35 },
    { id: 'boss1', name: '擊破第一台 Boss', unlock: 'Boss 變體資料寫入戰鬥報告', test: () => meta.achievements.bossKilled, progress: () => meta.achievements.bossKilled ? '已擊破' : '未擊破', reward: 60 },
    { id: 'scrap200', name: '累積 200 碎晶', unlock: '解鎖星圖掃描', test: () => meta.scrap >= 200, progress: () => `${Math.min(Math.floor(meta.scrap), 200)}/200 碎晶`, reward: 45 },
    { id: 'objectives5', name: '一局完成 5 個目標', unlock: '事件獎勵提高', test: () => runObjectives >= 5, progress: () => `${Math.min(runObjectives, 5)}/5 目標`, reward: 50 },
    { id: 'rushWin', name: '完成拾荒競速', unlock: '拾荒系挑戰加入結算建議', test: () => (runStats?.salvageRushWins || 0) > 0, progress: () => (runStats?.salvageRushWins || 0) > 0 ? '已完成' : '等待事件', reward: 55 },
    { id: 'gradeS', name: 'S 評級撤離', unlock: '高難挑戰入口準備完成', test: () => (meta.recentRuns || []).some(r => r.grade === 'S'), progress: () => (meta.recentRuns || []).some(r => r.grade === 'S') ? '已達成' : '尚未 S 評級', reward: 90 },
    { id: 'clear1', name: '第一次撤離成功', unlock: '解鎖 v3 Beta 進度標記', test: () => meta.achievements.sectorClear, progress: () => meta.achievements.sectorClear ? '已撤離' : '未撤離', reward: 100 }
  ];

  function nextAchievement() {
    return achievementDefs.find(a => !meta.achievements[a.id]);
  }

  function renderAchievementPanel() {
    if (!ui.achievementPanel) return;
    const done = achievementDefs.filter(a => meta.achievements[a.id]).length;
    const next = nextAchievement();
    ui.achievementPanel.innerHTML = next
      ? `<b>解鎖進度 ${done}/${achievementDefs.length}</b><span>下一個：${escapeHtml(next.name)}｜${escapeHtml(next.progress?.() || '')}</span><small>${escapeHtml(next.unlock || '')}，獎勵 +${escapeHtml(next.reward)} 碎晶</small>`
      : `<b>解鎖進度 ${done}/${achievementDefs.length}</b><span>所有成就已解鎖</span><small>可以挑戰高難與更高評級。</small>`;
  }

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      w: Math.max(320, Math.round(vv?.width || window.innerWidth || 320)),
      h: Math.max(360, Math.round(vv?.height || window.innerHeight || 560))
    };
  }

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const viewport = viewportSize();
    W = viewport.w;
    H = viewport.h;
    document.documentElement.style.setProperty('--app-height', `${H}px`);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Open-world camera keeps the player centered; do not clamp world position on resize.
    makeSpaceDust();
  }

  function makeSpaceDust() {
    const count = Math.floor((W * H) / 10500);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: rand(.15, 1.25), tw: Math.random() * TWO_PI
    }));
    nebula = Array.from({ length: 7 }, (_, i) => ({
      x: rand(W * .12, W * .88), y: rand(H * .1, H * .92), r: rand(140, 330),
      color: i % 3 === 0 ? '55,246,255' : i % 3 === 1 ? '255,61,242' : '255,209,102',
      drift: rand(.05, .18), a: Math.random() * TWO_PI
    }));
  }

  function loadSave() {
    try {
      return readSaveFromStorage(localStorage);
    } catch (err) {
      console.warn('save load failed', err);
      return baseState();
    }
  }

  function save(show = false) {
    meta.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
    if (show) flash('已保存到本機瀏覽器');
    renderUpgrades();
    renderAchievementPanel();
    renderZonePanel();
  }

  function resetSave() {
    if (!confirm('確定要重置宇宙？所有碎晶、成就與永久升級都會清除。')) return;
    clearKnownSaveKeys(localStorage);
    meta = baseState();
    controlMode = meta.controlMode;
    autoAim = meta.autoAim;
    document.body.dataset.controlMode = controlMode;
    hardResetRun();
    save(true);
    updateCombatControls();
    renderAchievementPanel();
    flash('宇宙已重置');
  }

  function applyOfflineRewards() {
    const elapsed = Math.max(0, Date.now() - (meta.lastSaved || Date.now()));
    const hours = Math.min(24, elapsed / 36e5);
    const drone = meta.upgrades.drone || 0;
    const survey = meta.upgrades.survey || 0;
    if ((drone + survey) <= 0 || hours < 0.05) return;
    const gain = Math.floor(hours * drone * 10 + Math.sqrt(Math.max(1, meta.bestWave)) * hours * (2.5 + survey * .8));
    if (gain > 0) {
      meta.scrap += gain;
      ui.offlineNotice.textContent = `離線探勘回收 ${gain} 碎晶（最多計 24 小時）`;
      save(false);
    }
  }

  function upgradeCost(def) {
    return upgradeCostForLevel(def, meta.upgrades[def.id] || 0);
  }

  function upgradeUnlocked(def) {
    return !def.requires || !!meta.achievements?.[def.requires];
  }

  function upgradeLockText(def) {
    if (!def.requires) return '';
    const ach = achievementDefs.find(a => a.id === def.requires);
    return ach ? `需成就：${ach.name}` : '尚未解鎖';
  }

  function availableUpgradeCount() {
    return upgradeDefs.filter(def => {
      const lvl = meta.upgrades[def.id] || 0;
      return upgradeUnlocked(def) && lvl < def.max && meta.scrap >= upgradeCost(def);
    }).length;
  }

  function canUsePermanentUpgrades() {
    return running && paused && !skillChoosing && (!gameOver || upgradeFromRun);
  }

  function isUpgradeModalOpen() {
    return !!ui.upgradeModal && !ui.upgradeModal.hidden;
  }

  function isSettingsModalOpen() {
    return !!ui.settingsModal && !ui.settingsModal.hidden;
  }

  function openSettingsModal() {
    if (ui.settingsModal) ui.settingsModal.hidden = false;
    resetTouchDirection();
    updateCombatControls();
  }

  function closeSettingsModal() {
    if (ui.settingsModal) ui.settingsModal.hidden = true;
    resetTouchDirection();
    updateCombatControls();
  }

  function updateUpgradeAccessUi() {
    const allowed = canUsePermanentUpgrades();
    const available = availableUpgradeCount();
    const hasAvailable = available > 0;
    if (ui.upgradeMenuBtn) {
      ui.upgradeMenuBtn.hidden = !allowed;
      ui.upgradeMenuBtn.textContent = hasAvailable ? `艦載升級！×${available}` : '艦載升級';
      ui.upgradeMenuBtn.classList.toggle('ready', hasAvailable);
    }
    if (ui.upgradePrompt) {
      const showPrompt = running && !paused && !gameOver && !skillChoosing && hasAvailable;
      ui.upgradePrompt.hidden = !showPrompt;
      ui.upgradePrompt.textContent = `可升級 ×${available}｜按 P`;
    }
    if (!allowed && isUpgradeModalOpen()) closeUpgradeModal();
    renderUpgradeButtonStateOnly();
  }

  function openUpgradeModal() {
    if (!canUsePermanentUpgrades()) return flash('請先按 P 暫停，再開啟升級');
    renderUpgrades();
    ui.upgradeModal.hidden = false;
    resetTouchDirection();
  }

  function openPostRunUpgradeModal() {
    upgradeFromRun = true;
    running = true;
    paused = true;
    renderUpgrades();
    ui.upgradeModal.hidden = false;
    resetTouchDirection();
    flash('可用本局碎晶升級艦載系統');
  }

  function closeUpgradeModal() {
    if (ui.upgradeModal) ui.upgradeModal.hidden = true;
    if (gameOver) upgradeFromRun = false;
    if (ui.upgradeMenuBtn) ui.upgradeMenuBtn.hidden = !canUsePermanentUpgrades();
  }

  function resumeFromUpgradeModal() {
    closeUpgradeModal();
    if (running && paused && !gameOver && !skillChoosing) paused = false;
    updateUi();
  }

  function buyUpgrade(id) {
    if (!canUsePermanentUpgrades()) return flash('請先按 P 暫停，再升級');
    const def = upgradeDefs.find(u => u.id === id);
    if (!def) return;
    if (!upgradeUnlocked(def)) return flash(upgradeLockText(def));
    const lvl = meta.upgrades[id] || 0;
    if (lvl >= def.max) return flash('這項已滿級');
    const cost = upgradeCost(def);
    if (meta.scrap < cost) return flash(`碎晶不足，還需要 ${cost - meta.scrap}`);
    meta.scrap -= cost;
    meta.upgrades[id] = lvl + 1;
    if (id === 'shield' && player) {
      player.maxHp = maxHp();
      player.hp = Math.min(player.maxHp, player.hp + 20);
    }
    save(false);
    renderUpgrades();
    sfx('upgrade');
    flash(`${def.name} 升到 Lv.${lvl + 1}`);
  }

  function renderUpgrades() {
    ui.upgrades.innerHTML = '';
    let lane = '';
    for (const def of upgradeDefs) {
      if (def.lane && def.lane !== lane) {
        lane = def.lane;
        const head = document.createElement('div');
        head.className = 'upgrade-lane';
        head.textContent = lane;
        ui.upgrades.appendChild(head);
      }
      const lvl = meta.upgrades[def.id] || 0;
      const cost = upgradeCost(def);
      const unlocked = upgradeUnlocked(def);
      const el = document.createElement('article');
      el.className = 'upgrade';
      if (!unlocked) el.classList.add('locked');
      el.innerHTML = `<header><strong>${def.name}</strong><span class="level">Lv.${lvl}/${def.max}</span></header><p>${def.desc}</p>${!unlocked ? `<small>${upgradeLockText(def)}</small>` : ''}<button ${!unlocked || !canUsePermanentUpgrades() || lvl >= def.max || meta.scrap < cost ? 'disabled' : ''}>${!unlocked ? '未解鎖' : lvl >= def.max ? '已滿級' : `升級｜${cost} 碎晶`}</button>`;
      el.querySelector('button').addEventListener('click', () => buyUpgrade(def.id));
      ui.upgrades.appendChild(el);
    }
    ui.scrap.textContent = Math.floor(meta.scrap).toString();
  }

  function maxHp() { return 122 + (meta.upgrades.shield || 0) * 16 + (meta.upgrades.armor || 0) * 13; }
  function playerScale() { return controlMode === 'touch' ? .46 : .72; }
  function playerRadius() { return 17 * playerScale(); }
  function enemyScale() { return controlMode === 'touch' ? .76 : .84; }
  function speed() { return (298 + (meta.upgrades.engine || 0) * 19 + (meta.upgrades.armor || 0) * 2.4) * (controlMode === 'touch' ? .91 : 1) * (evasionSurgeActive()?.speedMult || 1); }
  function fireRate() { return Math.max(.066, .202 - (meta.upgrades.cannon || 0) * .012 - (meta.upgrades.reactor || 0) * .0045); }
  function weaponFireRate() {
    const harvest = upgradesRuntime.harvestDrive > 0 ? Math.max(.72, 1 - Math.min(.28, (runKills % 10) * .028 * upgradesRuntime.harvestDrive)) : 1;
    const storm = activeEvent?.id === 'overclock' ? .78 : 1;
    const tempo = tempoBoostActive()?.fireRateMult || 1;
    const tactic = tacticBreakActive()?.fireRateMult || 1;
    const boss = bossBreakActive()?.fireRateMult || 1;
    const rhythm = bossRhythmActive()?.fireRateMult || 1;
    const contract = currentContract()?.fireRateMult || 1;
    const route = routeChoiceEffects()?.fireRateMult || 1;
    const resonance = currentCoreResonance()?.fireRateMult || 1;
    const core = coreOverdriveActive()?.fireRateMult || 1;
    const evasion = evasionSurgeActive()?.fireRateMult || 1;
    const combat = combatSurgeActive()?.fireRateMult || 1;
    return fireRate() * harvest * storm * tempo * tactic * boss * rhythm * contract * route * resonance * core * evasion * combat;
  }
  function damage() { return (17 + (meta.upgrades.cannon || 0) * 2.7 + (meta.upgrades.reactor || 0) * 2.35) * (currentCoreResonance()?.damageMult || 1) * (tempoBoostActive()?.damageMult || 1) * (tacticBreakActive()?.damageMult || 1) * (bossBreakActive()?.damageMult || 1) * (bossRhythmActive()?.damageMult || 1) * (coreOverdriveActive()?.damageMult || 1) * (combatSurgeActive()?.damageMult || 1) * (currentContract()?.damageMult || 1) * (routeChoiceEffects()?.damageMult || 1); }
  function incomingDamage(amount) { return amount * Math.max(.74, 1 - (meta.upgrades.armor || 0) * .038) * (currentCoreResonance()?.incomingMult || 1) * (tempoBoostActive()?.incomingMult || 1) * (tacticBreakActive()?.incomingMult || 1) * (bossBreakActive()?.incomingMult || 1) * (bossRhythmActive()?.incomingMult || 1) * (coreOverdriveActive()?.incomingMult || 1) * (evasionSurgeActive()?.incomingMult || 1) * (currentContract()?.incomingMult || 1) * (routeChoiceEffects()?.incomingMult || 1); }
  function magnetRange() { return 92 + (meta.upgrades.magnet || 0) * 28 + (currentCoreResonance()?.magnetBonus || 0) + (tempoBoostActive()?.magnetBonus || 0) + (tacticBreakActive()?.magnetBonus || 0) + (coreOverdriveActive()?.magnetBonus || 0) + (currentContract()?.magnetBonus || 0) + (routeChoiceEffects()?.magnetBonus || 0); }
  function isPlayerProtected() { return !!player && (player.invuln > 0 || runTime < 3.5); }

  function shouldStartTutorial() {
    return !meta.tutorialDone && (meta.bestWave || 1) <= 2 && !(meta.recentRuns || []).length;
  }

  function makeTutorialRun() {
    if (!shouldStartTutorial()) return null;
    return { step: 0, moved: 0, startScrap: meta.scrap, lastX: player?.x || W / 2, lastY: player?.y || H / 2, announced: '' };
  }

  function currentTutorialStep() {
    if (!tutorialRun || meta.tutorialDone) return null;
    return tutorialDefs[tutorialRun.step] || null;
  }

  function tutorialProgress(step = currentTutorialStep()) {
    if (!step) return { value: 0, target: 1, pct: 0 };
    const value = Math.min(step.target, Math.floor(step.progress()));
    return { value, target: step.target, pct: clamp(value / step.target, 0, 1) };
  }

  function tutorialMission() {
    return { text: '新手任務：完成 5 個基礎動作', target: tutorialDefs.length, reward: 36, check: () => meta.tutorialDone ? tutorialDefs.length : tutorialRun?.step || 0 };
  }

  function announceTutorialStep() {
    const step = currentTutorialStep();
    if (!step || tutorialRun.announced === step.id) return;
    tutorialRun.announced = step.id;
    flash(`新手 ${tutorialRun.step + 1}/${tutorialDefs.length}：${step.text}`);
  }

  function updateTutorial() {
    if (!tutorialRun || meta.tutorialDone || !player) return;
    const moved = Math.hypot(player.x - tutorialRun.lastX, player.y - tutorialRun.lastY);
    tutorialRun.moved += moved;
    tutorialRun.lastX = player.x;
    tutorialRun.lastY = player.y;
    let step = currentTutorialStep();
    while (step && tutorialProgress(step).pct >= 1) {
      tutorialRun.step++;
      addText(player.x, player.y - 58, `${step.label}完成`, '#4dff88');
      sfx('pickup');
      step = currentTutorialStep();
      if (step) announceTutorialStep();
    }
    if (!step) {
      meta.tutorialDone = true;
      meta.scrap += 24;
      addText(player.x, player.y - 70, '新手訓練完成 +24', '#ffd166');
      sfx('success');
      save(false);
      flash('新手訓練完成：你已掌握移動、戰鬥、拾取、目標與技能');
      tutorialRun = null;
    } else {
      announceTutorialStep();
    }
  }

  function chooseZone() {
    const picked = selectedZoneId();
    const ids = Object.keys(zoneDefs);
    const id = picked === 'random' ? choose(ids) : picked;
    return { id, ...zoneDefs[id] };
  }

  function currentZone() {
    return activeZone || { id: 'default', name: '標準星環', color: '#37f6ff', desc: '標準星環航道。', featureBias: null, scrapBonus: 0, enemyBias: [], bossMod: { id: 'standardCore', name: '標準核心', tag: '無額外 Boss modifier', color: '#37f6ff', desc: '標準 Boss 規則。', hpMult: 1, shotMult: 1, speedMult: 1, abilityMult: 1, rewardBonus: 0 } };
  }

  function currentBossModifier() {
    const base = currentZone().bossMod || { id: 'standardCore', name: '標準核心', tag: '無額外 Boss modifier', color: currentZone().color || '#37f6ff', desc: '標準 Boss 規則。', hpMult: 1, shotMult: 1, speedMult: 1, abilityMult: 1, rewardBonus: 0, breakThresholdMult: 1, breakWindowBonus: 0 };
    const route = routeChoiceEffects();
    const prep = routeBossPrepEffects();
    const hasRoute = activeRouteChoices.length > 0;
    const hasPrep = prep.count > 0;
    if (!hasRoute && !hasPrep) return base;
    const routeBossTags = hasRoute ? activeRouteChoices.map(c => c.bossTag || c.tag).filter(Boolean) : [];
    const nameParts = [base.name];
    if (hasRoute) nameParts.push(currentRouteChoice().name);
    if (hasPrep) nameParts.push(prep.name);
    return {
      ...base,
      id: [base.id, hasRoute ? route.id : '', hasPrep ? `prep-${prep.id}` : ''].filter(Boolean).join('+'),
      name: nameParts.join('+'),
      tag: [base.tag, ...routeBossTags, prep.tag].filter(Boolean).join('｜'),
      desc: [base.desc || '標準 Boss 規則。', hasRoute ? `局內路線：${route.name}` : '', hasPrep ? `Boss前預備：${prep.name}` : ''].filter(Boolean).join('｜'),
      color: prep.color || (hasRoute ? currentRouteChoice().color : '') || base.color,
      hpMult: (base.hpMult || 1) * (hasRoute ? (route.bossHpMult || 1) : 1) * (prep.hpMult || 1),
      shotMult: (base.shotMult || 1) * (hasRoute ? (route.bossShotMult || 1) : 1) * (prep.shotMult || 1),
      speedMult: (base.speedMult || 1) * (hasRoute ? (route.bossSpeedMult || 1) : 1) * (prep.speedMult || 1),
      abilityMult: (base.abilityMult || 1) * (hasRoute ? (route.bossAbilityMult || 1) : 1) * (prep.abilityMult || 1),
      rewardBonus: (base.rewardBonus || 0) + (hasRoute ? (route.bossRewardBonus || 0) : 0) + (prep.rewardBonus || 0),
      breakThresholdMult: (base.breakThresholdMult || 1) * (prep.breakThresholdMult || 1),
      breakWindowBonus: (base.breakWindowBonus || 0) + (prep.breakWindowBonus || 0)
    };
  }

  function chooseTacticForWave() {
    if (bossActive || wave < 3 || (tutorialRun && wave <= 2)) return null;
    const zoneId = currentZone().id;
    const pool = [];
    for (const [id, def] of Object.entries(tacticDefs)) {
      if (wave < def.minWave) continue;
      pool.push(id);
      if (def.zones?.includes(zoneId)) pool.push(id, id);
      if (activeEvent && def.events?.includes(activeEvent.id)) pool.push(id);
    }
    if (!pool.length) return null;
    const id = choose(pool);
    return { id, ...tacticDefs[id] };
  }

  function setActiveTactic(tactic) {
    activeTactic = tactic;
    tacticPulse = tactic ? rand(5.2, 8.4) : 0;
    if (!tactic || !runStats) return;
    if (!runStats.tacticsSeen.includes(tactic.name)) runStats.tacticsSeen.push(tactic.name);
    wakeMissionHud(4.2);
  }

  function spawnTacticPack(tactic = activeTactic, opening = false) {
    if (!tactic || bossActive || !player) return;
    const entries = [...(tactic.bias || [])];
    const elite = choose(tactic.elites || []);
    if (elite) entries.unshift(elite.type);
    const maxPack = opening ? (wave < 5 ? 2 : 3) : 1;
    let spawned = 0;
    for (const type of entries) {
      if (spawned >= maxPack) break;
      const opts = { tacticId: tactic.id };
      if (elite && type === elite.type && spawned === 0) opts.elite = elite.mod;
      const e = spawnEnemy(type, opts);
      if (e) spawned++;
    }
    if (tactic.feature && opening) addWorldFeature(tactic.feature);
    if (spawned && runStats) runStats.tacticPressure += spawned;
  }

  function objectiveRewardMult() {
    return ((currentZone().id === 'rift' ? 1.12 : 1) + (meta.upgrades.survey || 0) * .035) * currentDifficulty().reward * (currentAnomaly()?.rewardMult || 1) * (routeChoiceEffects()?.rewardMult || 1);
  }

  function chooseObjectiveEvent(kind, def = objectiveDefs[kind] || objectiveDefs.scan) {
    const pool = [...(def.event || ['droneSwarm'])];
    if (def.routeBias?.length) pool.push(...def.routeBias);
    if (currentAnomaly()?.events?.length) pool.push(...currentAnomaly().events);
    if (routeChoiceEffects()?.eventBias?.length) pool.push(...routeChoiceEffects().eventBias);
    const zoneId = currentZone().id;
    if (zoneId === 'crystal' && def.event?.includes('salvageRush')) pool.push('salvageRush', 'rich');
    if (zoneId === 'scrapyard' && def.event?.includes('empStorm')) pool.push('empStorm');
    if (zoneId === 'rift') {
      if (def.event?.includes('hazard')) pool.push('hazard');
      if (def.event?.includes('gravityWell')) pool.push('gravityWell');
    }
    return choose(pool);
  }

  function objectiveSideGoal(beaconRef = beacon) {
    const def = objectiveDefs[beaconRef?.kind] || objectiveDefs.scan;
    return Math.max(1, beaconRef?.sideGoal || def.sideGoal || 1);
  }

  function objectiveSideProgress(beaconRef = beacon) {
    return Math.min(objectiveSideGoal(beaconRef), Math.floor(beaconRef?.sideProgress || 0));
  }

  function objectiveSideComplete(beaconRef = beacon) {
    return objectiveSideProgress(beaconRef) >= objectiveSideGoal(beaconRef);
  }

  function objectiveSideText(beaconRef = beacon) {
    if (!beaconRef) return '';
    const def = objectiveDefs[beaconRef.kind] || objectiveDefs.scan;
    return `${def.sideLabel || '副目標'} ${objectiveSideProgress(beaconRef)}/${objectiveSideGoal(beaconRef)}`;
  }

  function objectiveChainSummary(beaconRef, eventId, bonus = false) {
    if (!beaconRef) return '';
    const def = objectiveDefs[beaconRef.kind] || objectiveDefs.scan;
    const eventName = eventDefs[eventId]?.name || '未知事件';
    const boost = tempoProfile(eventId).name || '戰術餘波';
    return `${def.name}→${eventName}→${boost}${bonus ? '★' : ''}`;
  }

  function objectiveChainPreview(beaconRef = beacon) {
    if (!beaconRef) return '';
    const eventName = eventDefs[beaconRef.previewEvent]?.name || '未知事件';
    const boost = tempoProfile(beaconRef.previewEvent).name || '戰術餘波';
    return `${eventName}→${boost}`;
  }

  function applyObjectiveChainEffect(beaconRef, eventId, bonus) {
    if (!beaconRef || !player) return '';
    const def = objectiveDefs[beaconRef.kind] || objectiveDefs.scan;
    let effect = '';
    if (beaconRef.kind === 'scan') {
      const xpGain = Math.ceil(xpNeed * (bonus ? .14 : .08));
      xp += xpGain;
      if (bonus) upgradesRuntime.weakScan = Math.max(upgradesRuntime.weakScan, 1);
      effect = `弱點標記 XP+${xpGain}${bonus ? '｜弱點掃描' : ''}`;
    } else if (beaconRef.kind === 'hold') {
      const heal = bonus ? 22 : 12;
      player.hp = Math.min(player.maxHp, player.hp + heal);
      dropPowerup('heal', beaconRef.x + 44, beaconRef.y, 18);
      effect = `防線補給 護盾+${heal}`;
    } else if (beaconRef.kind === 'harvest') {
      const count = bonus ? 9 : 5;
      for (let i = 0; i < count; i++) dropShard(beaconRef.x + rand(-68, 68), beaconRef.y + rand(-68, 68), 1);
      if (bonus) dropPowerup('rapid', beaconRef.x - 48, beaconRef.y + 24, 18);
      effect = `晶礦噴發 ${count} 碎晶${bonus ? '｜超頻核心' : ''}`;
    } else if (beaconRef.kind === 'rift') {
      const before = worldFeatures.filter(f => f.type === 'hazard').length;
      worldFeatures = worldFeatures.filter(f => f.type !== 'hazard' || Math.hypot(f.x - beaconRef.x, f.y - beaconRef.y) > (bonus ? 940 : 700));
      const cleared = before - worldFeatures.filter(f => f.type === 'hazard').length;
      if (bonus) dropPowerup('nova', beaconRef.x + 52, beaconRef.y - 18, 18);
      effect = `封印裂隙 清除${cleared}危險區${bonus ? '｜新星炸彈' : ''}`;
    } else if (beaconRef.kind === 'hunt') {
      const bounty = Math.floor(12 + wave * 2.4 + (bonus ? 12 : 0));
      meta.scrap += bounty;
      xp += Math.ceil(xpNeed * (bonus ? .13 : .07));
      dropPowerup(bonus ? 'nova' : 'rapid', beaconRef.x + rand(-42, 42), beaconRef.y + rand(-34, 34), 18);
      effect = `懸賞兌現 +${bounty}`;
    }
    addText(beaconRef.x, beaconRef.y - beaconRef.r - 32, effect, def.color);
    return effect;
  }

  function recordObjectiveRoute(beaconRef, eventId, bonus, effect = '') {
    if (!runStats || !beaconRef) return;
    const label = objectiveChainSummary(beaconRef, eventId, bonus);
    runStats.objectiveRoute.push(label);
    if (effect) runStats.objectiveChains.push(`${label}｜${effect}`);
    else runStats.objectiveChains.push(label);
    if (bonus) runStats.objectiveBonuses++;
  }

  function shouldSpawnRouteChoiceOffer(n = wave) {
    if (!player || bossActive || tutorialRun || routeChoiceOffer) return false;
    if (![2, 4].includes(n)) return false;
    return !activeRouteChoices.some(c => c.wave === n);
  }

  function spawnRouteChoiceOffer(n = wave, forcedPair = null) {
    if (!player || bossActive || tutorialRun) return null;
    const pair = forcedPair || choose(routeChoicePairsForWave(n));
    const offerId = `route-${++routeChoiceSerial}`;
    routeChoiceOffer = { id: offerId, wave: n, pair: [...pair], picked: null };
    const baseAngle = rand(-Math.PI * .82, -Math.PI * .18);
    const dist = n <= 2 ? 430 : 560;
    pair.forEach((choiceId, i) => {
      const def = routeChoiceDefs[choiceId];
      if (!def) return;
      const a = baseAngle + (i === 0 ? -.46 : .46);
      worldFeatures.push({ type: 'routeChoice', offerId, choiceId, routeChoice: { ...def, wave: n }, x: player.x + Math.cos(a) * dist, y: player.y + Math.sin(a) * dist, r: 72, spin: rand(-.4, .4), seed: Math.random() * 999, cool: 0, charge: 0, chargeNeed: 1.75, color: def.color });
    });
    flash(`局內抉擇：靠近一個節點充能｜${pair.map(id => routeChoiceDefs[id]?.name).filter(Boolean).join(' vs ')}`);
    wakeMissionHud(5.4);
    recordPaceNode(`局內抉擇開啟｜第 ${n} 波`);
    return routeChoiceOffer;
  }

  function expireRouteChoiceOffer(reason = '未選擇') {
    if (!routeChoiceOffer) return;
    const offerId = routeChoiceOffer.id;
    worldFeatures.forEach(f => { if (f.type === 'routeChoice' && f.offerId === offerId) f.dead = true; });
    recordPaceNode(`局內抉擇錯過｜${reason}`);
    routeChoiceOffer = null;
    wakeMissionHud(2.5);
  }

  function applyRouteChoiceReward(choice, node = player) {
    if (!choice || !player) return '';
    const effects = [];
    if (choice.startHeal) { player.hp = Math.min(player.maxHp, player.hp + choice.startHeal); effects.push(`護盾+${choice.startHeal}`); }
    if (choice.startPowerup) { dropPowerup(choice.startPowerup, player.x + 58, player.y + 28, 18); effects.push('補給投放'); }
    if (choice.startScrap) { meta.scrap += choice.startScrap; effects.push(`碎晶+${choice.startScrap}`); }
    if (choice.startXp) { const gain = Math.ceil(xpNeed * choice.startXp); xp += gain; effects.push(`XP+${gain}`); }
    if (choice.startShards) { for (let i = 0; i < choice.startShards; i++) dropShard((node?.x || player.x) + rand(-64, 64), (node?.y || player.y) + rand(-56, 56), 1); effects.push(`碎晶雨x${choice.startShards}`); }
    if (choice.weakScan) { upgradesRuntime.weakScan = Math.max(upgradesRuntime.weakScan || 0, 1); effects.push('弱點掃描'); }
    if (choice.startElite) {
      const e = spawnEnemy(choose(['sprinter', 'shooter', 'tank']));
      if (e) { applyEliteMod(e, 'berserk'); effects.push('懸賞菁英'); }
    }
    return effects.join('｜') || choice.tag || '路線已記錄';
  }

  function chooseRouteChoiceNode(f) {
    if (!f || f.dead || f.type !== 'routeChoice' || !routeChoiceOffer || routeChoiceOffer.id !== f.offerId) return;
    const choice = { ...(f.routeChoice || routeChoiceDefs[f.choiceId] || neutralRouteChoice), wave };
    choice.consequenceDue = wave >= 4 ? wave : wave + 1;
    routeChoiceOffer.picked = choice.id;
    activeRouteChoices.push(choice);
    const effect = applyRouteChoiceReward(choice, f);
    if (runStats) {
      runStats.routeChoices.push(`${choice.name}｜第 ${choice.wave} 波`);
      runStats.routeChoiceTags.push(choice.tag || choice.desc || '');
      runStats.routeChoiceEffects.push(effect);
    }
    recordPaceNode(`局內抉擇｜${choice.name}：${choice.tag}`);
    worldFeatures.forEach(w => { if (w.type === 'routeChoice' && w.offerId === f.offerId) w.dead = true; });
    burst(f.x, f.y, choice.color || '#bdfcff', 34, 1.25);
    particles.push({ x: f.x, y: f.y, vx: 0, vy: 0, life: .48, max: .48, r: 46, color: choice.color || '#bdfcff', ring: true, fastRing: true });
    addText(f.x, f.y - f.r - 28, `選擇：${choice.name}`, choice.color || '#bdfcff');
    flash(`路線選擇：${choice.name}｜${effect}`);
    sfx('success');
    haptic(32);
    routeChoiceOffer = null;
    if ((choice.consequenceDue || wave + 1) <= wave) spawnRouteConsequence(choice);
    else flash(`路線選擇：${choice.name}｜第 ${choice.consequenceDue} 波將出現後果任務`);
    wakeMissionHud(5.2);
  }

  function hardResetRun() {
    clearMovementInput();
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: playerRadius(), hp: maxHp(), maxHp: maxHp(), invuln: 3.5, regenClock: 0, angle: -Math.PI / 2, bank: 0 };
    bullets = []; enemies = []; shards = []; particles = []; floatText = []; powerups = []; enemyShots = []; bossTelegraphs = []; worldFeatures = []; beacon = null; zoneTick = 0;
    Object.keys(upgradesRuntime).forEach(k => { upgradesRuntime[k] = 0; });
    wave = 1; xp = 0; xpNeed = 12; runKills = 0; totalKills = 0; runTime = 0; shotSeq = 0; runObjectives = 0; runEvents = 0; runStartScrap = meta.scrap; lastDamageCause = ''; tutorialShown = new Set();
    activeRouteChoices = []; routeChoiceOffer = null; routeChoiceSerial = 0; activeRouteConsequences = []; routeConsequenceSerial = 0;
    activeZone = chooseZone();
    activeAnomaly = chooseRunAnomaly();
    activeContract = chooseRunContract();
    anomalyState = makeAnomalyState(activeAnomaly);
    runStats = newRunStats();
    runStats.zone = activeZone.name;
    runStats.anomaly = activeAnomaly.name;
    runStats.contract = contractTitle(activeContract);
    runStats.contractTag = activeContract.tag || '';
    recordPaceNode(`本局異變｜${activeAnomaly.name}：${activeAnomaly.tag}`);
    applyRunContractOpening();
    upgradeFromRun = false; bossActive = false; gameOver = false; skillChoosing = false; activeEvent = null; activeTactic = null; eventTimer = 0; meteorTimer = 0; activeTempoBoost = null; activeTacticBreak = null; activeBossBreak = null; activeBossRhythm = null; activeCoreOverdrive = null; activeCoreTrial = null; coreTrialSeen = new Set(); coreStreak = 0; coreStreakTimer = 0; lastCoreResonanceId = ''; activeEvasionSurge = null; evasionStreak = 0; evasionStreakTimer = 0; activeCombatSurge = null; combatCombo = 0; combatComboTimer = 0; bossCinematic = null; victoryRainTimer = 0; bossTelegraphs = []; hitStopTimer = 0; tacticPulse = 0; bossAlertTimer = 0; bossAlert = null; eventBannerTimer = 0; missionHudWakeUntil = 0; missionHudSignature = ''; damageFlash = 0; playerDamageCue = null;
    tutorialRun = makeTutorialRun();
    mission = tutorialRun ? tutorialMission() : newMission();
    wakeMissionHud(4.5);
    startWave(1);
    for (let i = 0; i < (tutorialRun ? 9 : 5); i++) dropShard(player.x + rand(-48, 48), player.y + rand(-48, 48), 1);
    updateUi();
  }

  function newMission() {
    return choose([
      { text: '任務：本局擊毀 25 架無人機', target: 25, reward: 24, check: () => runKills },
      { text: '任務：抵達第 4 波', target: 4, reward: 28, check: () => wave },
      { text: '任務：收集 60 碎晶', target: 60, reward: 26, check: () => Math.floor(meta.scrap) }
    ]);
  }

  function completeMissionIfNeeded() {
    if (!mission || mission.done || mission.check() < mission.target) return;
    mission.done = true;
    meta.scrap += mission.reward;
    addText(player.x, player.y - 36, `任務完成 +${mission.reward}`, '#4dff88');
    flash(`任務完成：獲得 ${mission.reward} 碎晶`);
    wakeMissionHud(3.8);
    save(false);
  }

  function chooseObjectiveKind() {
    const bias = currentAnomaly()?.objectiveBias || [];
    const routeBias = routeChoiceEffects()?.objectiveBias || [];
    if (wave <= 3) return choose(['scan', 'scan', 'harvest', ...bias, ...routeBias]);
    if (wave <= 6) return choose(['scan', 'harvest', 'hold', 'rift', ...bias, ...routeBias]);
    return choose(['hunt', 'hold', 'rift', 'harvest', 'scan', ...bias, ...bias, ...routeBias]);
  }

  function stageIntroForWave(n, isBoss = false) {
    const stage = runStageForWave(n);
    if (n === 1) return `${stage.name}：先熟悉移動、拾荒與自動開火。`;
    if (n === 4) return `${stage.name}：開始補核心技能，讓流派成形。`;
    if (n === 7) return `${stage.name}：戰術與事件密度上升，先拆關鍵敵。`;
    if (n === 9) return '終局整備：補給艙已投放，拿完再迎戰核心。';
    if (n >= SECTOR_CLEAR_WAVE && isBoss) return `${stage.name}：星環核心主宰啟動。`;
    return '';
  }

  function applyWavePaceSupport(n, isBoss = false) {
    const stage = runStageForWave(n);
    if ([1, 4, 7, SECTOR_CLEAR_WAVE].includes(n) || (n === 9 && !runStats?.paceNodes?.some(p => p.startsWith(stage.name)))) recordPaceNode(`${stage.name}｜${stage.desc}`);
    if (!player || isBoss) return '';
    if (n === 1 && activeAnomaly) {
      addText(player.x, player.y - 64, `異變：${activeAnomaly.name}`, activeAnomaly.color || '#ffd166');
    }
    if (currentAnomaly()?.id === 'convoy' && (n === 2 || n === 6)) {
      dropPowerup(n === 2 ? 'heal' : 'rapid', player.x + 72, player.y + 36, 18);
      recordPaceNode(`異變支援｜${currentAnomaly().name}`);
      return `${currentAnomaly().name}：額外補給已投放。`;
    }
    if (n === 4) {
      xp += Math.ceil(xpNeed * .22);
      dropPowerup('rapid', player.x + 86, player.y - 28, 18);
      for (let i = 0; i < 6; i++) dropShard(player.x + rand(-86, 86), player.y + rand(-70, 70), 1);
      recordPaceNode('成形補給｜XP + 超頻核心');
      return 'Build 成形補給：額外經驗與超頻核心已投放。';
    }
    if (n === 9) {
      player.hp = Math.min(player.maxHp, player.hp + 24);
      dropPowerup('heal', player.x + 88, player.y, 22);
      dropPowerup('nova', player.x - 88, player.y, 22);
      for (let i = 0; i < 10; i++) dropShard(player.x + rand(-130, 130), player.y + rand(-95, 95), 1);
      if (runStats) runStats.prepDrops++;
      recordPaceNode('終局整備｜維修核心 + 新星炸彈');
      return '終局整備：維修核心與新星炸彈已投放。';
    }
    return '';
  }

  function guideForWave(n, isBoss = false) {
    if (n === 1) return '引導：移動保持距離，主砲會自動開火；先撿旁邊碎晶。';
    if (n === 2) return '引導：藍色箭頭指向目標點，順路靠近可拿獎勵。';
    if (n === 3) return '暖機收尾：完成目標會觸發事件；撐過去會再給獎勵。';
    if (n === 4) return 'Build 成形：利用補給與三選一，先把一個流派疊起來。';
    if (n === 5 && isBoss) return 'Boss 檢查：火力不足就優先選穿甲、軌砲、弱點或主砲強化。';
    if (n === 7) return '高壓選擇：敵群開始更常組戰術，先拆衛星、治療或加速單位。';
    if (n === 9) return '終局前整備：拿補給、完成高價目標，但不要為碎晶冒死。';
    if (n === SECTOR_CLEAR_WAVE && isBoss) return '最終 Boss：擊破星環核心主宰後即可撤離成功。';
    return '';
  }

  function showWaveGuide(n, isBoss = false) {
    const msg = guideForWave(n, isBoss);
    if ((tutorialRun && n <= 3) || !msg || tutorialShown.has(n) || !running) return;
    setTimeout(() => {
      if (running && !gameOver && !skillChoosing && wave === n) { tutorialShown.add(n); flash(msg); }
    }, 950);
  }

  function startWave(n) {
    wave = n;
    wakeMissionHud(3.4);
    bossActive = n % 5 === 0;
    spawnLeft = waveEnemyBudget(n);
    spawnTimer = bossActive ? .35 : 0;
    if (wave === 9 && !bossActive) startEvent(choose(['eliteStorm', 'hazard', 'gravityWell', 'supply']));
    else if (!bossActive && Math.random() < eventChanceForWave(wave) * currentDifficulty().event) startEvent();
    if (!beacon || wave % 3 === 1 || wave === 9) { beacon = makeBeacon(chooseObjectiveKind()); wakeMissionHud(3.2); }
    if (bossActive) { activeEvent = null; activeTactic = null; eventTimer = 0; meteorTimer = 0; tacticPulse = 0; }
    else {
      setActiveTactic(chooseTacticForWave());
      if (activeTactic) spawnTacticPack(activeTactic, true);
    }
    const bossRef = bossActive ? spawnBoss() : null;
    const bossPrepMsg = bossActive ? applyBossPrepSupport(bossRef) : '';
    const supportMsg = applyWavePaceSupport(wave, bossActive);
    if (runStats) { runStats.waveStart = runTime; if (bossActive) runStats.bossStart = runTime; }
    if (!bossActive) {
      const waveMsg = supportMsg || (activeTactic ? `戰術：${activeTactic.name}｜反制：${tacticCounterText(activeTactic)}` : activeEvent ? `事件波：${activeEvent.name}` : wave === 1 ? `${activeZone?.name || '標準星環'}｜${contractTitle()}｜異變：${currentAnomaly().name}｜第 ${wave} 波來襲` : `第 ${wave} 波來襲`);
      flash(waveMsg);
    } else if (bossPrepMsg) {
      setTimeout(() => { if (running && !gameOver && bossActive && currentBoss()) flash(`Boss 前預備啟動｜${routeBossPrepTitle()}｜${bossPrepMsg}`); }, 720);
    }
    const stageMsg = stageIntroForWave(wave, bossActive);
    if (stageMsg && !tutorialShown.has(`stage-${wave}`)) setTimeout(() => { if (running && !gameOver && !skillChoosing && wave === n) { tutorialShown.add(`stage-${wave}`); flash(stageMsg); } }, 520);
    if (!bossActive && routeChoiceOffer && wave > (routeChoiceOffer.wave || wave) + 1) expireRouteChoiceOffer('航線窗口關閉');
    if (bossActive) { expireRouteChoiceOffer('Boss 波來臨'); expireActiveRouteConsequences('Boss 波來臨'); }
    else { spawnDueRouteConsequences(wave); if (shouldSpawnRouteChoiceOffer(wave)) spawnRouteChoiceOffer(wave); }
    showWaveGuide(wave, bossActive);
  }

  function startEvent(forcedId = null, reward = null, source = null) {
    const ids = ['meteor', 'overclock', 'blackout', 'rich', 'hazard', 'supply', 'eliteStorm', 'droneSwarm', 'gravityWell', 'empStorm', 'salvageRush'];
    const zoneBonus = currentZone().id === 'crystal' ? ['salvageRush'] : currentZone().id === 'scrapyard' ? ['empStorm'] : [];
    const anomalyBonus = currentAnomaly()?.events || [];
    const routeBonus = routeChoiceEffects()?.eventBias || [];
    const id = forcedId || choose([...ids, ...zoneBonus, ...anomalyBonus, ...anomalyBonus, ...routeBonus, ...routeBonus]);
    const tempo = tempoProfile(id);
    activeEvent = { id, ...eventDefs[id], reward, sourceRoute: source?.route || '', sourceEffect: source?.effect || '', tempoLabel: tempo.label, tempoName: tempo.name, tempoDesc: tempo.desc, rushStart: meta.scrap, rushGoal: id === 'salvageRush' ? 22 + wave * 3 : 0, rushDone: false };
    runEvents++;
    if (runStats && !runStats.eventsSeen.includes(eventDefs[id].name)) runStats.eventsSeen.push(eventDefs[id].name);
    eventTimer = id === 'salvageRush' ? 20 : 18 + Math.min(12, wave * .8);
    meteorTimer = .8;
    eventBannerTimer = 2.8;
    wakeMissionHud(3.8);
    if (runStats) recordPaceNode(`事件開始｜${eventDefs[id].name}｜${tempo.label}`);
    if (player) {
      burst(player.x, player.y, eventDefs[id].color, 22, 1.05);
      particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .5, max: .5, r: 28, color: eventDefs[id].color, ring: true, fastRing: true });
      addText(player.x, player.y - 58, `${tempo.label}｜${tempo.name}`, eventDefs[id].color);
    }
  }

  function finishEvent() {
    if (!activeEvent) return;
    const reward = activeEvent.reward;
    const name = activeEvent.name;
    const color = activeEvent.color;
    let eventSuccess = activeEvent.id !== 'salvageRush';
    if (activeEvent.id === 'salvageRush') {
      const collected = Math.max(0, Math.floor(meta.scrap - (activeEvent.rushStart || meta.scrap)));
      if (runStats) runStats.salvageRushShards += collected;
      if (collected >= (activeEvent.rushGoal || 0)) {
        eventSuccess = true;
        const rushBonus = 24 + wave * 4;
        meta.scrap += rushBonus;
        if (runStats) runStats.salvageRushWins++;
        addText(player.x, player.y - 62, `競速成功 +${rushBonus}`, '#ffd166');
        sfx('success');
      }
    }
    if (reward) {
      meta.scrap += reward.scrap;
      xp += reward.xp;
      for (let i = 0; i < reward.shards; i++) dropShard(player.x + rand(-42, 42), player.y + rand(-42, 42), 1);
      if (reward.heal > 0) player.hp = Math.min(player.maxHp, player.hp + reward.heal);
      addText(player.x, player.y - 54, `事件獎勵 +${reward.scrap}`, color);
      burst(player.x, player.y, color, 28, 1.2);
      sfx('upgrade');
      save(false);
    }
    const boost = applyTempoBoost(activeEvent, eventSuccess);
    if (runStats && boost) recordPaceNode(`事件加成｜${boost.name} ${Math.ceil(boost.duration)}s`);
    flash(`${name} 結束${reward ? `｜獎勵 +${reward.scrap}` : ''}${boost ? `｜${boost.name} ${Math.ceil(boost.duration)}s` : ''}`);
    activeEvent = null;
    wakeMissionHud(2.4);
  }

  function spawnEnemy(typeId, opts = {}) {
    if (enemies.length >= enemyCap() && typeId !== 'boss') return null;
    const side = Math.floor(Math.random() * 4);
    const pad = 58;
    const pick = typeId || pickEnemyType();
    const t = enemyTypes[pick];
    const e = {
      type: pick,
      label: t.label,
      x: (() => { const c = camera(); return side === 0 ? c.x - pad : side === 1 ? c.x + W + pad : rand(c.x, c.x + W); })(),
      y: (() => { const c = camera(); return side === 2 ? c.y - pad : side === 3 ? c.y + H + pad : rand(c.y, c.y + H); })(),
      r: (t.r + Math.min(6, wave * .12)) * enemyScale(),
      hp: (t.hp + wave * (pick === 'tank' ? 7.2 : pick === 'sprinter' ? 3.2 : 4.7)) * currentDifficulty().enemy,
      maxHp: 1,
      speed: (t.speed + wave * (pick === 'sprinter' ? 3.25 : 2.05)) * currentDifficulty().speed * (wave === 1 ? .82 : 1) * (activeEvent?.id === 'overclock' ? 1.14 : 1),
      spin: rand(-3, 3),
      color: t.color,
      sides: t.sides,
      scrap: t.scrap,
      hit: 0,
      shootClock: rand(.8, 2.4),
      elite: null,
      healClock: rand(1.1, 2.0),
      splitDone: false,
      shield: 0,
      shieldClock: rand(.4, 1.2),
      aiPhase: rand(0, TWO_PI),
      strafeDir: Math.random() < .5 ? -1 : 1,
      dashWindup: rand(.9, 1.7),
      dashTime: 0,
      dashRecover: 0,
      dashA: 0,
      detonate: 0,
      ramClock: rand(1.4, 2.7),
      ramTime: 0,
      telegraph: 0
    };
    maybeApplyElite(e, pick, opts.elite || null);
    if (opts.tacticId) e.tacticId = opts.tacticId;
    e.maxHp = e.hp;
    enemies.push(e);
    return e;
  }

  function pickEnemyType() {
    const pool = ['chaser', 'chaser', 'chaser'];
    if (wave >= 2) pool.push('sprinter');
    if (wave >= 3 || activeEvent?.id === 'blackout') pool.push('shooter');
    if (wave >= 4) pool.push('tank');
    if (wave >= 8) pool.push('sprinter', 'shooter');
    if (wave >= 6) pool.push('leech');
    if (wave >= 7 || activeEvent?.id === 'droneSwarm') pool.push('bomber');
    if (wave >= 5) pool.push('shieldSat');
    if (activeEvent?.id === 'blackout') pool.push('shooter', 'shooter');
    if (activeEvent?.id === 'droneSwarm') pool.push('sprinter', 'sprinter', 'bomber');
    if (activeTactic?.bias?.length) pool.push(...activeTactic.bias);
    if (routeChoiceEffects()?.enemyBias?.length) pool.push(...routeChoiceEffects().enemyBias);
    if (activeZone?.enemyBias?.length) pool.push(...activeZone.enemyBias);
    return choose(pool);
  }

  function applyEliteMod(e, id) {
    if (!e || e.type === 'boss' || !eliteMods[id]) return;
    const mod = eliteMods[id];
    const baseLabel = e.baseLabel || e.label;
    e.baseLabel = baseLabel;
    e.elite = { id, name: mod.name, color: mod.color };
    e.label = `${mod.name}${baseLabel}`;
    e.hp *= mod.hp;
    e.speed *= mod.speed;
    e.scrap += mod.scrap + (activeEvent?.id === 'eliteStorm' ? 2 : 0);
    e.r += (id === 'shielded' ? 3 : 1.4) * enemyScale();
    e.color = mod.color;
  }

  function maybeApplyElite(e, pick, forcedId = null) {
    if (pick === 'boss') return;
    if (forcedId) { applyEliteMod(e, forcedId); return; }
    if (wave < 7 && currentAnomaly()?.id !== 'bounty') return;
    const chance = Math.min(.12 + wave * .012 + (activeEvent?.id === 'rich' ? .12 : 0) + (activeEvent?.id === 'eliteStorm' ? .20 : 0) + (currentAnomaly()?.id === 'bounty' ? .16 : 0), .52);
    if (Math.random() > chance) return;
    const id = choose(wave >= 12 ? ['shielded', 'splitter', 'berserk', 'medic', 'phantom', 'juggernaut', 'accelerator', 'refractor'] : wave >= 8 ? ['shielded', 'splitter', 'berserk', 'medic', 'accelerator', 'refractor'] : ['shielded', 'splitter', 'berserk', 'medic']);
    applyEliteMod(e, id);
  }

  function spawnBoss() {
    const t = enemyTypes.boss;
    const c = camera();
    const variants = wave >= SECTOR_CLEAR_WAVE ? [
      { id: 'core', label: '星環核心主宰', color: '#bdfcff', hp: 1.42, speed: 1.08, sides: 14, shot: 1.38, final: true }
    ] : [
      { id: 'ring', label: '星環吞噬者', color: '#ff4d6d', hp: 1, speed: 1, sides: 10, shot: 1 },
      { id: 'forge', label: '熔核鍛造者', color: '#ff9f1c', hp: 1.18, speed: .86, sides: 8, shot: .88 },
      { id: 'void', label: '虛空指揮官', color: '#b66dff', hp: .92, speed: 1.22, sides: 12, shot: 1.18 },
      { id: 'pulse', label: '虛空脈衝體', color: '#bdfcff', hp: .96, speed: 1.05, sides: 13, shot: 1.05 },
      { id: 'brood', label: '裂隙母巢', color: '#ff3df2', hp: 1.12, speed: .92, sides: 11, shot: .94 }
    ];
    const v = wave >= SECTOR_CLEAR_WAVE ? variants[0] : choose(variants);
    const bossMod = currentBossModifier();
    const contract = currentContract();
    const hp = (t.hp + wave * 75) * v.hp * (bossMod.hpMult || 1) * (contract.bossHpMult || 1) * currentDifficulty().enemy * (wave === 5 ? .78 : 1);
    const baseAbility = v.final ? 2.4 : v.id === 'forge' ? 2.1 : v.id === 'void' ? 2.8 : v.id === 'ring' ? 3.1 : v.id === 'brood' ? 2.9 : 3.4;
    const e = { type: 'boss', bossVariant: v.id, finalBoss: !!v.final, label: v.label, x: player.x, y: c.y - 80, r: (t.r + wave * (v.final ? 1.45 : .95)) * enemyScale(), hp, maxHp: hp, speed: (t.speed + wave) * v.speed * (bossMod.speedMult || 1) * currentDifficulty().speed, spin: .7, color: v.color, sides: v.sides, scrap: Math.floor((t.scrap + wave + (v.final ? 28 : 6) + (bossMod.rewardBonus || 0)) * currentDifficulty().reward), hit: 0, shootClock: v.final ? .72 : 1.1, summonClock: v.final ? 2.8 : v.id === 'brood' ? 2.2 : 0, pulseClock: v.id === 'pulse' ? 3.2 : 0, abilityClock: baseAbility * (bossMod.abilityMult || 1), shotMult: v.shot * (bossMod.shotMult || 1), phase2: false, elite: null, bossModifier: bossMod };
    if (runStats) {
      runStats.bossName = v.label;
      runStats.bossModifier = `${bossMod.name}｜${bossMod.tag}`;
      recordPaceNode(`星域Boss｜${bossMod.name}：${bossMod.tag}`);
    }
    enemies.push(e);
    announceBoss(e, 'intro');
    sfx('boss');
    addShake(v.final ? 6 : 4, .22);
    return e;
  }

  function nearestEnemy(maxRange = Infinity) {
    if (!player) return null;
    let best = null;
    let bestD = maxRange * maxRange;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = dist2(player, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function mouseAimAngle() {
    return Math.atan2(mouse.y - H / 2, mouse.x - W / 2);
  }

  function approachAngle(current, target, amount) {
    const diff = ((target - current + Math.PI * 3) % TWO_PI) - Math.PI;
    return current + diff * clamp(amount, 0, 1);
  }

  function updatePlayerPose(dt, ax, ay) {
    if (!player) return;
    const moving = Math.hypot(ax, ay) > .05;
    const desired = moving ? Math.atan2(ay, ax) : shotTarget();
    player.angle = approachAngle(player.angle ?? desired, desired, dt * 10.5);
    player.bank += (0 - player.bank) * clamp(dt * 10, 0, 1);
  }

  function isMouseAiming() {
    if (controlMode === 'touch') return false;
    return mouse.down || performance.now() - mouse.lastMove < 1500;
  }

  function shotTarget() {
    const aimMode = meta.aimAssist || (autoAim ? 'assist' : 'off');
    const assisted = autoAim && aimMode !== 'off' && (aimMode === 'full' || !isMouseAiming());
    const target = assisted ? nearestEnemy(activeEvent?.id === 'blackout' ? 520 : activeEvent?.id === 'empStorm' ? 620 : Infinity) : null;
    if (target) return Math.atan2(target.y - player.y, target.x - player.x);
    return mouseAimAngle();
  }

  function toggleAutoAim() {
    const idx = aimAssistOrder.indexOf(meta.aimAssist || 'assist');
    meta.aimAssist = aimAssistOrder[(idx + 1) % aimAssistOrder.length];
    autoAim = meta.aimAssist !== 'off';
    meta.autoAim = autoAim;
    save(false);
    flash(`自動瞄準：${aimAssistDefs[meta.aimAssist]?.name || '輔助'}`);
    updateCombatControls();
  }

  function setControlMode(mode, announce = true) {
    controlMode = mode === 'touch' ? 'touch' : 'keyboard';
    document.body.dataset.controlMode = controlMode;
    if (controlMode === 'touch' && (meta.aimAssist === 'off' || !meta.aimAssist)) meta.aimAssist = 'assist';
    autoAim = meta.aimAssist !== 'off';
    meta.controlMode = controlMode;
    meta.autoAim = autoAim;
    if (player) player.r = playerRadius();
    touchMove.x = 0; touchMove.y = 0; touchMove.active = false; touchMove.pressed = false; touchMove.dir = ''; touchMove.force = 0;
    if (announce) flash(controlMode === 'touch' ? `手機模式：自動瞄準 ${aimAssistDefs[meta.aimAssist]?.name || '輔助'}` : `滑鼠模式：自動瞄準 ${aimAssistDefs[meta.aimAssist]?.name || '輔助'}`);
    save(false);
    updateCombatControls();
  }

  function toggleControlMode() {
    setControlMode(controlMode === 'touch' ? 'keyboard' : 'touch');
  }

  function togglePerfDashboard() {
    const visible = diagnostics.toggle();
    flash(`效能面板 ${visible ? '開啟' : '關閉'}｜F3 可切換`);
    updateCombatControls();
  }

  function updateCombatControls() {
    if (ui.settingsBtn) ui.settingsBtn.classList.toggle('active', isSettingsModalOpen());
    if (ui.controlModeBtn) {
      ui.controlModeBtn.textContent = controlMode === 'touch' ? '手機' : '滑鼠';
      ui.controlModeBtn.classList.toggle('active', controlMode === 'touch');
    }
    if (ui.autoAimBtn) {
      const aim = aimAssistDefs[meta.aimAssist || 'assist'] || aimAssistDefs.assist;
      ui.autoAimBtn.textContent = `自瞄：${aim.name}`;
      ui.autoAimBtn.title = aim.desc;
      ui.autoAimBtn.classList.toggle('active', autoAim);
    }
    updateSoundUi();
    updateDifficultyUi();
    if (ui.perfBtn) {
      ui.perfBtn.textContent = `效能面板 ${diagnostics.visible ? 'ON' : 'OFF'}`;
      ui.perfBtn.classList.toggle('active', diagnostics.visible);
      ui.perfBtn.title = '顯示 FPS、frame time、update/draw timing 與 entity 數量。F3 可快速切換。';
    }
    if (ui.pauseBtn) {
      ui.pauseBtn.hidden = !running || gameOver || skillChoosing;
      ui.pauseBtn.textContent = paused ? '繼續' : '暫停';
      ui.pauseBtn.classList.toggle('active', paused);
    }
  }

  function shoot() {
    shotSeq++;
    sfx('shoot');
    const angle = shotTarget();
    const core = currentBuildCore();
    const resonance = currentCoreResonance();
    const coreId = core.id;
    const coreColor = core.def?.color || '#37f6ff';
    const split = Math.min(2, upgradesRuntime.splitShot);
    const spread = split === 0 ? [0] : split === 1 ? [-.11, 0, .11] : [-.18, -.07, .07, .18];
    const lance = upgradesRuntime.lanceRounds > 0;
    const rail = upgradesRuntime.railCharge > 0 && shotSeq % Math.max(3, 7 - upgradesRuntime.railCharge) === 0;
    const critChance = Math.min(.42, (upgradesRuntime.critCore > 0 ? .08 + upgradesRuntime.critCore * .055 : 0) + (resonance?.critChanceBonus || 0));
    const crit = critChance > 0 && Math.random() < critChance;
    const railBoost = rail ? 1 + upgradesRuntime.railOverload * .22 : 1;
    for (const s of spread) {
      const bulletBuild = rail || lance ? 'rail' : upgradesRuntime.plasmaBurst > 0 ? 'plasma' : upgradesRuntime.burnRounds > 0 ? 'burn' : coreId || 'rapid';
      const trailColor = rail || lance ? '#bdfcff' : bulletBuild === 'plasma' ? '#ff7a3d' : bulletBuild === 'burn' ? '#ff4d6d' : coreId ? coreColor : '#37f6ff';
      bullets.push({
        type: rail ? 'rail' : lance ? 'lance' : 'pulse', homing: false, target: null, turn: 0,
        build: bulletBuild,
        trailColor,
        core: !!coreId,
        resonance: resonance?.id || '',
        bossDamageMult: resonance?.bossDamageMult || 1,
        blastDamageMult: resonance?.blastDamageMult || 1,
        x: player.x + Math.cos(angle + s) * 23,
        y: player.y + Math.sin(angle + s) * 23,
        vx: Math.cos(angle + s) * (rail ? 940 : lance ? 820 : 690),
        vy: Math.sin(angle + s) * (rail ? 940 : lance ? 820 : 690),
        life: rail ? .98 : lance ? 1.18 : 1.05,
        r: rail ? 7.2 : lance ? 5.8 : 4.5,
        dmg: damage() * (spread.length > 1 ? .76 : 1) * (crit ? 1.75 : 1) * (rail ? (1.85 + upgradesRuntime.railCharge * .18) * railBoost : lance ? .88 + upgradesRuntime.lanceRounds * .08 : 1),
        pierce: (upgradesRuntime.chain > 1 ? 1 : 0) + (rail ? 5 + upgradesRuntime.railOverload : lance ? Math.min(3, upgradesRuntime.lanceRounds) : 0) + (resonance?.pierceBonus || 0),
        blast: (upgradesRuntime.plasmaBurst > 0 ? 42 + upgradesRuntime.plasmaBurst * 18 : rail && upgradesRuntime.railOverload > 0 ? 22 + upgradesRuntime.railOverload * 9 : 0) + (resonance?.blastBonus || 0),
        crit,
        burn: upgradesRuntime.burnRounds + (resonance?.burnBonus || 0)
      });
      if (coreId && particles.length < MAX_PARTICLES) particles.push({ x: player.x + Math.cos(angle + s) * 25, y: player.y + Math.sin(angle + s) * 25, vx: Math.cos(angle + s) * 120 + rand(-18, 18), vy: Math.sin(angle + s) * 120 + rand(-18, 18), life: .16, max: .16, r: 2.2, color: trailColor, ring: false, kind: 'spark', len: rail ? 26 : 13 });
    }
    if (resonance?.extraPulseEvery && shotSeq % resonance.extraPulseEvery === 0) {
      for (const off of [-.1, .1]) {
        bullets.push({
          type: 'resonance', homing: false, target: null, turn: 0,
          build: resonance.id, trailColor: resonance.color, core: true, resonance: resonance.id,
          bossDamageMult: 1, blastDamageMult: 1,
          x: player.x + Math.cos(angle + off) * 18,
          y: player.y + Math.sin(angle + off) * 18,
          vx: Math.cos(angle + off) * 760,
          vy: Math.sin(angle + off) * 760,
          life: .72, r: 3.2,
          dmg: damage() * .34,
          pierce: 0, blast: 0, crit: false, burn: 0
        });
      }
      if (player) wakeMissionHud(.8);
    }
    if (upgradesRuntime.flakBurst > 0) {
      const count = 2 + Math.min(5, upgradesRuntime.flakBurst * 2);
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * .18 + rand(-.035, .035);
        bullets.push({ type: 'flak', homing: false, target: null, turn: 0, build: 'flak', trailColor: '#ff9f1c', core: coreId === 'flak', x: player.x + Math.cos(angle + off) * 17, y: player.y + Math.sin(angle + off) * 17, vx: Math.cos(angle + off) * rand(520, 650), vy: Math.sin(angle + off) * rand(520, 650), life: .55, r: 3.8, dmg: damage() * (.26 + upgradesRuntime.flakBurst * .035), pierce: 0, blast: 18 + upgradesRuntime.flakBurst * 4, crit: false, burn: upgradesRuntime.burnRounds });
      }
      if (upgradesRuntime.flakRecoil > 0) {
        player.x -= Math.cos(angle) * (5 + upgradesRuntime.flakRecoil * 3);
        player.y -= Math.sin(angle) * (5 + upgradesRuntime.flakRecoil * 3);
      }
    }
    if (upgradesRuntime.homingRounds > 0) {
      const target = nearestEnemy(activeEvent?.id === 'blackout' ? 520 : activeEvent?.id === 'empStorm' ? 620 : 860);
      const count = Math.min(3, upgradesRuntime.homingRounds);
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i - (count - 1) / 2) * .18;
        bullets.push({
          type: 'seeker', homing: true, target, turn: (4.2 + upgradesRuntime.homingRounds * 1.1) * (resonance?.homingTurnMult || 1),
          build: 'seeker', trailColor: '#ffd166', core: coreId === 'seeker', resonance: resonance?.id === 'seeker' ? resonance.id : '',
          x: player.x + Math.cos(angle + off) * 18,
          y: player.y + Math.sin(angle + off) * 18,
          vx: Math.cos(angle + off) * 610,
          vy: Math.sin(angle + off) * 610,
          life: 1.35,
          r: 4.2,
          dmg: damage() * (.34 + upgradesRuntime.homingRounds * .06),
          pierce: 0,
          blast: 0,
          crit: false,
          burn: 0
        });
      }
    }
    if (upgradesRuntime.droneWing > 0) {
      const target = nearestEnemy(760);
      const count = Math.min(3, upgradesRuntime.droneWing);
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * .42;
        bullets.push({ type: 'drone', homing: true, target, turn: 6.2, build: 'drone', trailColor: '#7aa7ff', core: coreId === 'drone', resonance: resonance?.id === 'drone' ? resonance.id : '', x: player.x + Math.cos(angle + off) * 20, y: player.y + Math.sin(angle + off) * 20, vx: Math.cos(angle + off) * 560, vy: Math.sin(angle + off) * 560, life: 1.1, r: 3.5, dmg: damage() * (.18 + upgradesRuntime.droneWing * .035) * (resonance?.droneDamageMult || 1), pierce: 0, blast: 0, crit: false, burn: 0 });
      }
    }
  }

  function enemyShoot(e) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    if (e.type === 'boss' && e.bossVariant === 'pulse') {
      firePulseRing(e, { count: e.phase2 ? 18 : 12, speed: e.phase2 ? 210 : 175, color: '#bdfcff' });
      return;
    }
    const count = e.type === 'boss' ? (e.finalBoss ? (e.phase2 ? 17 : 11) : e.bossVariant === 'void' ? (e.phase2 ? 15 : 9) : e.phase2 ? 11 : 7) : 1;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i - (count - 1) / 2) * (e.phase2 ? .13 : .16);
      const bossSpeed = (e.type === 'boss' ? (e.phase2 ? 235 : 205) * (e.shotMult || 1) : 250) * (activeEvent?.id === 'empStorm' ? .68 : 1);
      enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(a + off) * bossSpeed, vy: Math.sin(a + off) * bossSpeed, r: e.type === 'boss' ? 5 : 4, life: 4, dmg: e.type === 'boss' ? (e.phase2 ? 15 : 12) : 8 });
    }
  }

  function bossAbilityDelay(e) {
    const mult = (e.phase2 ? .72 : 1) * (e.bossModifier?.abilityMult || 1);
    if (e.finalBoss) return rand(2.0, 3.2) * mult;
    if (e.bossVariant === 'forge') return rand(2.2, 3.4) * mult;
    if (e.bossVariant === 'void') return rand(2.8, 4.0) * mult;
    if (e.bossVariant === 'brood') return rand(2.4, 3.6) * mult;
    if (e.bossVariant === 'pulse') return rand(3.0, 4.2) * mult;
    return rand(3.1, 4.6) * mult;
  }

  function triggerBossAbility(e) {
    if (!e || e.type !== 'boss' || !player) return;
    const phaseBoost = e.phase2 ? 1.2 : 1;
    if (e.bossVariant === 'forge') {
      const info = bossReadInfo(e);
      announceBossMove(e, info);
      spawnMeteor(info.color || e.color);
      if (e.phase2 || Math.random() < .35) spawnMeteor(info.color || e.color);
      if (Math.random() < (e.phase2 ? .55 : .28)) addWorldFeature('hazard');
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    } else if (e.bossVariant === 'void') {
      const info = bossReadInfo(e);
      announceBossMove(e, info);
      const add = markBossKeyAdd(spawnEnemy(choose(e.phase2 ? ['shieldSat', 'leech', 'sprinter'] : ['sprinter', 'chaser'])), info);
      if (add) { add.x = e.x + rand(-80, 80); add.y = e.y + rand(-80, 80); addBossSummonTelegraph(add, info); }
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    } else if (e.bossVariant === 'brood') {
      const info = bossReadInfo(e);
      announceBossMove(e, info);
      const add = markBossKeyAdd(spawnEnemy(choose(e.phase2 ? ['leech', 'shieldSat', 'bomber'] : ['leech', 'chaser'])), info);
      if (add) { add.x = e.x + rand(-84, 84); add.y = e.y + rand(-84, 84); addBossSummonTelegraph(add, info); }
      addWorldFeature('hazard');
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    } else if (e.bossVariant === 'pulse') {
      const info = bossReadInfo(e);
      announceBossMove(e, info);
      firePulseRing(e, { count: e.phase2 ? 22 : 14, spin: runTime * (e.phase2 ? 1.2 : .75), speed: (e.phase2 ? 235 : 190) * phaseBoost, color: '#bdfcff', gapWidth: e.phase2 ? .38 : .52 });
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    } else if (e.finalBoss) {
      const move = choose(['meteor', 'summon', 'rift', 'pulse']);
      const info = bossReadInfo(e, move);
      announceBossMove(e, info);
      if (move === 'meteor') { spawnMeteor(info.color); spawnMeteor(info.color); }
      if (move === 'summon') {
        const add = markBossKeyAdd(spawnEnemy(choose(e.phase2 ? ['shieldSat', 'bomber', 'leech'] : ['sprinter', 'chaser'])), info);
        if (add) { add.x = e.x + rand(-96, 96); add.y = e.y + rand(-96, 96); addBossSummonTelegraph(add, info); }
      }
      if (move === 'rift') { addWorldFeature('hazard'); addBossTelegraph('rift', { x: player.x + rand(-140, 140), y: player.y + rand(-140, 140), r: 96, color: info.color || '#ff4d6d', duration: 1.4, label: '核心裂隙' }); }
      if (move === 'pulse') firePulseRing(e, { count: e.phase2 ? 24 : 16, speed: e.phase2 ? 245 : 205, color: info.color || '#bdfcff', gapWidth: e.phase2 ? .38 : .52 });
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    } else {
      const info = bossReadInfo(e);
      announceBossMove(e, info);
      enemyShoot(e);
      addText(e.x, e.y - e.r - 14, info.title, e.color);
    }
    burst(e.x, e.y, e.color || '#ff4d6d', e.finalBoss ? 20 : 12, e.finalBoss ? 1.1 : .8);
  }

  function dropShard(x, y, amount = 1) {
    const bonus = upgradesRuntime.shardMultiplier + (currentZone().scrapBonus || 0);
    const total = Math.max(1, Math.floor((amount + bonus + (Math.random() < .25 + bonus * .08 + (meta.upgrades.survey || 0) * .025 ? 1 : 0)) * currentDifficulty().reward * (currentAnomaly()?.rewardMult || 1) * (currentContract()?.rewardMult || 1) * (routeChoiceEffects()?.rewardMult || 1) * (currentCoreResonance()?.rewardMult || 1)));
    for (let i = 0; i < total; i++) {
      const a = Math.random() * TWO_PI;
      shards.push({ x: x + rand(-12, 12), y: y + rand(-12, 12), vx: Math.cos(a) * rand(45, 145), vy: Math.sin(a) * rand(45, 145), r: rand(4, 7), value: 1, life: 20 });
    }
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > .045) return;
    dropPowerup(choose(['heal', 'nova', 'rapid']), x, y);
  }

  function dropPowerup(kind = 'heal', x = player?.x || W / 2, y = player?.y || H / 2, life = 16) {
    powerups.push({ kind, x, y, r: 12, life, spin: 0 });
  }

  function burst(x, y, color, n = 14, force = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TWO_PI;
      particles.push({ x, y, vx: Math.cos(a) * rand(45, 285) * force, vy: Math.sin(a) * rand(45, 285) * force, life: rand(.35, .95), max: .95, r: rand(1.5, 4.8) * force, color, ring: false });
    }
    particles.push({ x, y, vx: 0, vy: 0, life: .38, max: .38, r: 8, color, ring: true });
  }

  function deathBurst(e) {
    if (!e) return;
    const color = e.color || '#ff4d6d';
    const force = e.type === 'boss' ? 2.1 : e.elite ? 1.55 : 1.05;
    const spokes = e.type === 'boss' ? 26 : e.elite ? 18 : 12;
    for (let i = 0; i < spokes && particles.length < MAX_PARTICLES; i++) {
      const a = i / spokes * TWO_PI + rand(-.08, .08);
      const sp = rand(160, 360) * force;
      particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.18, .42), max: .42, r: rand(1.4, 3.2) * force, color: i % 4 === 0 ? '#ffffff' : color, ring: false, kind: 'spark', len: rand(16, 34) * force });
    }
    particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .28, max: .28, r: Math.max(10, e.r * .45), color, ring: true, fastRing: true });
    if (e.elite || e.type === 'boss') particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .45, max: .45, r: Math.max(18, e.r * .7), color: '#ffffff', ring: true });
  }

  function addText(x, y, text, color = '#eef7ff') {
    floatText.push({ x, y, text, color, life: 1.2, max: 1.2 });
  }

  function drawMapLabel(text, x, y, color = '#eef7ff', alpha = .92) {
    if (!text) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 10px system-ui';
    const w = Math.min(92, ctx.measureText(text).width + 14);
    ctx.fillStyle = 'rgba(5,7,18,.72)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - 9, w, 18, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y + .5, w - 6);
    ctx.restore();
  }

  function worldFeatureLabel(f) {
    if (f.type === 'hazard') return { text: '危險區', color: '#ff4d6d', y: f.y - f.r - 18 };
    if (f.type === 'repair') return { text: '補給', color: '#4dff88', y: f.y - f.r - 16 };
    if (f.type === 'resource') return { text: '資源', color: '#ffd166', y: f.y - f.r - 16 };
    if (f.type === 'routeChoice') {
      const choice = f.routeChoice || routeChoiceDefs[f.choiceId] || neutralRouteChoice;
      const charge = Math.round(clamp((f.charge || 0) / (f.chargeNeed || 1.75), 0, 1) * 100);
      return { text: `${choice.name}｜${choice.tag}${charge ? `｜${charge}%` : ''}`, color: choice.color || '#bdfcff', y: f.y - f.r - 22 };
    }
    if (f.type === 'routeConsequence') {
      const state = f.routeConsequence || activeRouteConsequences.find(c => c.id === f.consequenceId);
      const def = state?.def || routeConsequenceDef(f.choiceId);
      const charge = Math.round(clamp((f.charge || 0) / (f.chargeNeed || def.chargeNeed || 2.6), 0, 1) * 100);
      return { text: `${state?.choiceName || '路線'}→${def.title}｜${def.action}${charge ? `｜${charge}%` : ''}`, color: def.color || '#bdfcff', y: f.y - f.r - 24 };
    }
    if (f.type === 'riftSeal') return { text: '裂隙封印', color: '#b66dff', y: f.y - f.r - 18 };
    if (f.type === 'convoyPod') return { text: '補給艙', color: '#4dff88', y: f.y - f.r - 18 };
    return null;
  }

  function powerupLabel(kind) {
    if (kind === 'heal') return { text: '維修', color: '#4dff88' };
    if (kind === 'nova') return { text: '新星', color: '#ffd166' };
    if (kind === 'rapid') return { text: '超頻', color: '#37f6ff' };
    return { text: '補給', color: '#eef7ff' };
  }

  function killEnemy(e) {
    e.dead = true;
    const scoreGain = Math.floor((e.type === 'boss' ? 400 : 16) + wave * (e.type === 'boss' ? 24 : 3.5));
    meta.score += scoreGain;
    totalKills++; runKills++;
    recordCoreKill(e);
    recordCombatKill(e);
    if (e.type === 'shieldSat' && runStats) runStats.shieldSatelliteKills++;
    const tacticBreakCandidate = tacticById(e.tacticId) || activeTactic;
    xp += e.type === 'boss' ? 8 : e.elite ? 3 : e.type === 'tank' ? 2 : 1;
    if (e.elite) onEliteKilled(e);
    if (e.routeConsequence) {
      const state = activeRouteConsequences.find(c => c.id === e.routeConsequence.id);
      completeRouteConsequence(state, e);
    }
    if (e.elite?.id === 'splitter' && !e.splitDone) spawnSplinters(e);
    dropShard(e.x, e.y, e.scrap + Math.floor(wave / 5) + (activeEvent?.id === 'rich' ? 2 : 0));
    maybeDropPowerup(e.x, e.y);
    burst(e.x, e.y, e.color, e.type === 'boss' ? 44 : 18, e.type === 'boss' ? 1.5 : 1);
    deathBurst(e);
    addText(e.x, e.y - e.r - 10, `+${scoreGain}`, e.color);
    impactFeedback(e.x, e.y, e.color, e.type === 'boss' ? 4.8 : e.elite ? 2.4 : 1.2, e.type === 'boss' ? 'bossDie' : e.elite ? 'elite' : 'kill');
    if (e.type === 'boss') {
      triggerBossDefeatCinematic(e);
      if (runStats) {
        runStats.bossKillTime = Math.max(0, runTime - (runStats.bossStart || runTime));
        if (runStats.bossPhase2Start) runStats.bossPhase2Survival = Math.max(runStats.bossPhase2Survival || 0, runTime - runStats.bossPhase2Start);
      }
      meta.achievements.bossKilled = true;
      bossActive = false;
      haptic(e.finalBoss ? 90 : 42);
      flash('Boss 擊破！星環暫時安全');
      if (wave >= SECTOR_CLEAR_WAVE) completeSector();
    }
    if (upgradesRuntime.chain > 0) chainArc(e.x, e.y, e.type === 'boss' ? 80 : 42);
    if (upgradesRuntime.chainBurst > 0 && e.type !== 'boss') {
      const radius = 70 + upgradesRuntime.chainBurst * 18;
      particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .22, max: .22, r: radius * .28, color: '#ff7a3d', ring: true });
      for (const other of enemies) {
        if (other.dead || other === e) continue;
        const d = Math.hypot(other.x - e.x, other.y - e.y);
        if (d < radius + other.r) {
          other.hp -= (18 + upgradesRuntime.chainBurst * 9) * (1 - Math.min(.55, d / radius * .4));
          other.hit = .08;
          if (other.hp <= 0) killEnemy(other);
        }
      }
    }
    checkAchievements();
    if (e.bossKey) applyBossBreak(e, e.bossBreakName, e.bossBreakSource);
    applyTacticBreak(tacticBreakCandidate, e);
  }

  function spawnSplinters(e) {
    for (let i = 0; i < 2; i++) {
      const t = enemyTypes.sprinter;
      enemies.push({ type: 'sprinter', label: '分裂碎片', x: e.x + rand(-16, 16), y: e.y + rand(-16, 16), r: 7 * enemyScale(), hp: 10 + wave * 2.2, maxHp: 10 + wave * 2.2, speed: t.speed + wave * 3.8, spin: rand(-4, 4), color: '#ffd166', sides: 3, scrap: 1, hit: 0, shootClock: rand(1, 2), elite: null, healClock: 2, splitDone: true });
    }
  }

  function spawnMeteor(color = '#ff7a3d') {
    const fromLeft = Math.random() < .5;
    const c = camera();
    const y = rand(c.y + 90, c.y + H - 40);
    const x = fromLeft ? c.x - 35 : c.x + W + 35;
    const vx = (fromLeft ? 1 : -1) * rand(360, 520);
    const vy = rand(-60, 60);
    const targetT = .92;
    const tx = clamp(x + vx * targetT, c.x + 92, c.x + W - 92);
    const ty = clamp(y + vy * targetT, c.y + 76, c.y + H - 64);
    addBossTelegraph('meteor', { x: tx, y: ty, r: 72, color, duration: 1.18, angle: Math.atan2(vy, vx), targetX: x, targetY: y, label: '流星落點' });
    enemyShots.push({ type: 'meteor', x, y, vx, vy, r: rand(10, 18), life: 3.2, dmg: 18 + wave * .5, color });
  }

  function chainArc(x, y, amount) {
    let jumps = 1 + upgradesRuntime.chain;
    for (const e of enemies) {
      if (jumps <= 0) break;
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < 150 + upgradesRuntime.chain * 45) {
        e.hp -= amount;
        e.hit = .1;
        particles.push({ x, y, vx: (e.x - x) * 3, vy: (e.y - y) * 3, life: .16, max: .16, r: 3, color: '#bdfcff', ring: false });
        if (e.hp <= 0) killEnemy(e);
        jumps--;
      }
    }
  }

  function checkAchievements() {
    for (const a of achievementDefs) {
      if (meta.achievements[a.id]) continue;
      if (a.test()) {
        meta.achievements[a.id] = true;
        meta.scrap += a.reward;
        sfx('upgrade');
        renderAchievementPanel();
        save(false);
        flash(`成就解鎖：${a.name}｜${a.unlock || '新目標'} +${a.reward} 碎晶`);
      }
    }
  }


  function makeBeacon(kind = null) {
    const a = Math.random() * TWO_PI;
    const d = wave <= 2 ? rand(430, 760) : rand(760, 1450);
    const keys = Object.keys(objectiveDefs);
    const objective = kind || choose(keys);
    const def = objectiveDefs[objective];
    return { x: player ? player.x + Math.cos(a) * d : W / 2 + 900, y: player ? player.y + Math.sin(a) * d : H / 2 - 700, r: objective === 'hold' ? 86 : objective === 'hunt' ? 72 : 64, pulse: 0, charge: 0, armed: false, kind: objective, name: def.name, color: def.color, previewEvent: chooseObjectiveEvent(objective, def), sideProgress: 0, sideGoal: def.sideGoal || 1, sideTick: 0, bonusGranted: false, huntTarget: null, spawnClock: 0, tick: 0 };
  }

  function objectiveReward(def) {
    const mult = def.reward || 1;
    return {
      scrap: Math.floor((18 + wave * 3.1) * mult * objectiveRewardMult()),
      xp: Math.ceil(xpNeed * (.20 + mult * .065)),
      shards: Math.ceil(3 + wave * .3 * mult),
      heal: def === objectiveDefs.hold ? 10 : def === objectiveDefs.rift ? 6 : 0
    };
  }

  function spawnObjectiveHunter() {
    if (!beacon || beacon.huntTarget) return;
    const e = spawnEnemy(choose(['tank', 'leech', 'shooter']));
    if (!e) return;
    e.elite = { id: 'objective', name: '目標', color: '#ff3df2' };
    e.color = '#ff3df2';
    e.hp *= 1.75;
    e.maxHp = e.hp;
    e.speed *= 1.08;
    e.scrap += 5 + Math.floor(wave / 2);
    e.objectiveTarget = true;
    e.x = beacon.x + rand(-90, 90);
    e.y = beacon.y + rand(-90, 90);
    beacon.huntTarget = e;
    flash('獵殺菁英出現');
  }

  function triggerBeacon() {
    if (!beacon || beacon.armed) return;
    beacon.armed = true;
    const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
    const bonus = objectiveSideComplete(beacon);
    const bonusScrap = bonus ? Math.floor(8 + wave * 1.4) : 0;
    const instant = Math.floor((12 + wave * 1.8) * def.reward) + bonusScrap;
    runObjectives++;
    const reward = objectiveReward(def);
    if (bonus) reward.xp += Math.ceil(xpNeed * .08);
    meta.scrap += instant;
    xp += Math.ceil(xpNeed * (bonus ? .18 : .12));
    addText(player.x, player.y - 50, `${def.name} +${instant}${bonus ? '★' : ''}`, def.color);
    burst(beacon.x, beacon.y, def.color, bonus ? 50 : 38, bonus ? 1.55 : 1.35);
    sfx('upgrade');
    addShake(bonus ? 2.2 : 1.6, .1);
    const eventId = beacon.previewEvent || chooseObjectiveEvent(beacon.kind, def);
    const effect = applyObjectiveChainEffect(beacon, eventId, bonus);
    const route = objectiveChainSummary(beacon, eventId, bonus);
    recordObjectiveRoute(beacon, eventId, bonus, effect);
    startEvent(eventId, reward, { route, effect });
    const eventBurst = Math.max(3, Math.round((4 + Math.floor(wave / 3)) * lateGameScale()));
    for (let i = 0; i < eventBurst; i++) spawnEnemy(eventId === 'droneSwarm' ? choose(['sprinter', 'bomber']) : undefined);
    flash(`目標連鎖：${route}｜${effect}`);
    recordPaceNode(`目標連鎖｜${route}`);
    beacon = makeBeacon();
    wakeMissionHud(3.2);
    save(false);
  }

  function updateBeacon(dt) {
    if (!beacon || !player) return;
    const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
    const d = Math.hypot(player.x - beacon.x, player.y - beacon.y);
    const inside = d < beacon.r + player.r + 14;
    beacon.tick += dt;
    if (beacon.kind === 'hunt') {
      if (inside) spawnObjectiveHunter();
      if (beacon.huntTarget?.dead) { beacon.sideProgress = objectiveSideGoal(beacon); triggerBeacon(); }
      return;
    }
    if (inside) {
      beacon.charge += dt;
      beacon.sideTick += dt;
      if (particles.length < MAX_PARTICLES) particles.push({ x: beacon.x + rand(-18, 18), y: beacon.y + rand(-18, 18), vx: rand(-8, 8), vy: rand(-8, 8), life: .22, max: .22, r: rand(1.4, 2.8), color: def.color, ring: false });
      if (beacon.kind === 'scan' && beacon.sideTick >= .75 && beacon.sideProgress < objectiveSideGoal(beacon)) { beacon.sideProgress++; beacon.sideTick = 0; addText(beacon.x, beacon.y - 42, '掃描脈衝', def.color); }
      if (beacon.kind === 'hold') { beacon.spawnClock -= dt; if (beacon.spawnClock <= 0) { spawnEnemy(choose(['chaser', 'sprinter', 'bomber'])); beacon.spawnClock = .9 / lateGameScale(); if (beacon.sideProgress < objectiveSideGoal(beacon)) beacon.sideProgress++; } }
      if (beacon.kind === 'harvest' && Math.random() < dt * 4.2) { dropShard(beacon.x + rand(-58, 58), beacon.y + rand(-58, 58), 1); if (beacon.sideProgress < objectiveSideGoal(beacon)) beacon.sideProgress++; }
      if (beacon.kind === 'rift' && beacon.sideTick >= 1.05) { beacon.sideTick = 0; if (beacon.sideProgress < objectiveSideGoal(beacon)) beacon.sideProgress++; if (Math.random() < .9 * lateGameScale()) addWorldFeature('hazard'); }
      if (beacon.charge >= def.charge) triggerBeacon();
    } else {
      beacon.charge = Math.max(0, beacon.charge - dt * (beacon.kind === 'hold' ? .95 : .55));
      beacon.sideTick = Math.max(0, beacon.sideTick - dt * .5);
    }
  }

  function addWorldFeature(kind = null) {
    if (!player) return;
    const zone = currentZone();
    const anomaly = currentAnomaly();
    const anomalyBias = anomaly.id === 'salvage' ? ['resource', 'resource', 'repair'] : anomaly.id === 'convoy' ? ['repair', 'repair', 'resource'] : anomaly.id === 'rift' ? ['hazard', 'hazard', 'resource'] : anomaly.id === 'bounty' ? ['resource', 'hazard'] : [];
    const types = kind ? [kind] : [...(zone.featureBias || ['asteroid', 'debris', 'resource', 'resource', 'hazard', 'repair']), ...anomalyBias];
    const type = choose(types);
    const a = Math.random() * TWO_PI;
    const d = rand(Math.min(W, H) * .72, Math.max(W, H) * 1.9);
    const base = {
      type,
      x: player.x + Math.cos(a) * d,
      y: player.y + Math.sin(a) * d,
      r: type === 'asteroid' ? rand(22, 44) : type === 'debris' ? rand(16, 30) : type === 'repair' ? 28 : type === 'hazard' ? rand(70, 112) : rand(58, 96),
      spin: rand(-1, 1),
      seed: Math.random() * 999,
      cool: 0
    };
    worldFeatures.push(base);
  }

  function maintainWorldFeatures() {
    if (!player) return;
    const keep = Math.max(W, H) * 2.8;
    worldFeatures = worldFeatures.filter(f => Math.hypot(f.x - player.x, f.y - player.y) < keep);
    const target = compactWorldFeatureTarget();
    while (worldFeatures.length < target) addWorldFeature();
  }

  function updateWorldFeatures(dt) {
    if (!player) return;
    for (const f of worldFeatures) {
      f.cool = Math.max(0, f.cool - dt);
      f.spin += dt * .2;
      const d = Math.hypot(player.x - f.x, player.y - f.y);
      if (f.type === 'routeChoice') {
        const choice = f.routeChoice || routeChoiceDefs[f.choiceId] || neutralRouteChoice;
        if (d < f.r + player.r + 18) {
          f.charge += dt;
          if (particles.length < MAX_PARTICLES) particles.push({ x: f.x + rand(-28, 28), y: f.y + rand(-28, 28), vx: rand(-10, 10), vy: rand(-10, 10), life: .22, max: .22, r: rand(1.5, 3.4), color: choice.color || '#bdfcff', ring: false });
          if (f.charge >= (f.chargeNeed || 1.75)) chooseRouteChoiceNode(f);
          if (f.dead) continue;
        } else {
          f.charge = Math.max(0, f.charge - dt * .5);
        }
        continue;
      }
      if (f.type === 'routeConsequence') {
        updateRouteConsequenceFeature(f, d, dt);
        continue;
      }
      if (f.type === 'riftSeal') {
        if (d < f.r + player.r + 18) {
          f.charge += dt;
          if (particles.length < MAX_PARTICLES) particles.push({ x: f.x + rand(-22, 22), y: f.y + rand(-22, 22), vx: rand(-8, 8), vy: rand(-8, 8), life: .22, max: .22, r: rand(1.5, 3.1), color: '#b66dff', ring: false });
          if (f.charge >= 2.2) completeRiftSeal(f);
          if (f.dead) continue;
        } else {
          f.charge = Math.max(0, f.charge - dt * .42);
        }
        if (f.cool <= 0 && !f.dead) { addWorldFeature('hazard'); f.cool = 4.2; }
        continue;
      }
      if (f.type === 'convoyPod') {
        if (d < f.r + player.r + 30) {
          f.charge += dt;
          if (particles.length < MAX_PARTICLES) particles.push({ x: f.x + rand(-20, 20), y: f.y + rand(-20, 20), vx: rand(-6, 6), vy: rand(-8, 8), life: .2, max: .2, r: rand(1.4, 2.8), color: '#4dff88', ring: false });
          if (f.charge >= 5.0) completeConvoyPod(f);
          if (f.dead) continue;
        } else {
          f.charge = Math.max(0, f.charge - dt * .25);
        }
        const attackers = enemies.filter(e => !e.dead && Math.hypot(e.x - f.x, e.y - f.y) < f.r + e.r + 90);
        if (attackers.length && f.cool <= 0) {
          f.hp -= .42;
          f.cool = .85;
          addText(f.x, f.y - f.r - 18, `補給艙 ${Math.max(0, Math.ceil(f.hp))}`, '#4dff88');
          if (f.hp <= 0) { f.dead = true; flash('補給艙受損：護送失敗，等待下一艙'); anomalyState.pulse = Math.min(anomalyState.pulse || 10, 8); }
        }
        continue;
      }
      if ((f.type === 'asteroid' || f.type === 'debris') && d < player.r + f.r * .76) {
        const a = Math.atan2(player.y - f.y, player.x - f.x);
        const push = (player.r + f.r * .76 - d) + 1;
        player.x += Math.cos(a) * push;
        player.y += Math.sin(a) * push;
        if (f.cool <= 0 && !isPlayerProtected()) { playerImpact('obstacle', 2.2, 16, f.x, f.y); player.hp -= incomingDamage(f.type === 'asteroid' ? 8 : 4); damageFlash = .28; player.invuln = .38; f.cool = .75; burst(player.x, player.y, '#ff4d6d', 8); if (player.hp <= 0) endRun(); }
      }
      if (f.type === 'hazard' && d < f.r) {
        if (zoneTick <= 0 && !isPlayerProtected()) { playerImpact('hazard', 1.6, 10, f.x, f.y); player.hp -= incomingDamage(3 + wave * .12); damageFlash = .22; player.invuln = .12; burst(player.x, player.y, '#ff4d6d', 4, .45); if (player.hp <= 0) endRun(); }
      }
      if (f.type === 'repair' && d < f.r && f.cool <= 0) {
        player.hp = Math.min(player.maxHp, player.hp + 14);
        f.cool = 3.2;
        addText(player.x, player.y - 34, '補給 +14', '#4dff88');
        sfx('pickup');
      }
      if (f.type === 'resource' && d < f.r && f.cool <= 0) {
        dropShard(player.x + rand(-24, 24), player.y + rand(-24, 24), 1);
        f.cool = 2.4;
      }
      for (const e of enemies) {
        if (!e.dead && (f.type === 'asteroid' || f.type === 'debris') && dist2(e, f) < Math.pow(e.r + f.r * .7, 2)) {
          const a = Math.atan2(e.y - f.y, e.x - f.x);
          e.x += Math.cos(a) * 22 * dt;
          e.y += Math.sin(a) * 22 * dt;
        }
      }
    }
    worldFeatures = worldFeatures.filter(f => !f.dead);
    if (zoneTick <= 0) zoneTick = .55;
  }

  function update(dt) {
    if (!running || paused || gameOver || skillChoosing) return;
    dt = Math.min(dt, .033);
    if (hitStopTimer > 0) {
      hitStopTimer = Math.max(0, hitStopTimer - dt);
      updateUi();
      return;
    }
    runTime += dt;
    eventBannerTimer = Math.max(0, eventBannerTimer - dt);
    bossAlertTimer = Math.max(0, bossAlertTimer - dt);
    damageFlash = Math.max(0, damageFlash - dt);
    if (activeTempoBoost) {
      activeTempoBoost.timer -= dt;
      if (activeTempoBoost.timer <= 0) activeTempoBoost = null;
    }
    if (activeCoreOverdrive) {
      activeCoreOverdrive.timer -= dt;
      if (activeCoreOverdrive.timer <= 0) activeCoreOverdrive = null;
    }
    if (activeCombatSurge) {
      activeCombatSurge.timer -= dt;
      if (activeCombatSurge.timer <= 0) activeCombatSurge = null;
    }
    if (activeCoreTrial) {
      activeCoreTrial.timer -= dt;
      if (activeCoreTrial.timer <= 0) expireCoreTrial();
    }
    if (activeEvasionSurge) {
      activeEvasionSurge.timer -= dt;
      if (activeEvasionSurge.timer <= 0) activeEvasionSurge = null;
    }
    if (evasionStreakTimer > 0) {
      evasionStreakTimer -= dt;
      if (evasionStreakTimer <= 0) evasionStreak = 0;
    }
    if (coreStreakTimer > 0) {
      coreStreakTimer -= dt;
      if (coreStreakTimer <= 0) coreStreak = 0;
    }
    if (combatComboTimer > 0) {
      combatComboTimer -= dt;
      if (combatComboTimer <= 0) combatCombo = 0;
    }
    if (activeTacticBreak) {
      activeTacticBreak.timer -= dt;
      if (activeTacticBreak.timer <= 0) activeTacticBreak = null;
    }
    if (activeBossBreak) {
      activeBossBreak.timer -= dt;
      if (activeBossBreak.timer <= 0) activeBossBreak = null;
    }
    if (activeBossRhythm) {
      activeBossRhythm.timer -= dt;
      if (activeBossRhythm.timer <= 0) activeBossRhythm = null;
    }
    if (activeEvent) {
      eventTimer -= dt;
      if (activeEvent.id === 'meteor') { meteorTimer -= dt; if (meteorTimer <= 0) { spawnMeteor(); meteorTimer = rand(.75, 1.35); } }
      if (activeEvent.id === 'hazard' && Math.random() < dt * .55 * lateGameScale()) addWorldFeature('hazard');
      if (activeEvent.id === 'supply' && Math.random() < dt * .38 * lateGameScale()) addWorldFeature('repair');
      if (activeEvent.id === 'droneSwarm' && Math.random() < dt * 5.2 * lateGameScale()) spawnEnemy(choose(['sprinter', 'chaser', 'bomber']));
      if (activeEvent.id === 'salvageRush' && Math.random() < dt * 2.6) dropShard(player.x + rand(-160, 160), player.y + rand(-160, 160), 1);
      if (activeEvent.id === 'empStorm' && Math.random() < dt * 3.4 && particles.length < MAX_PARTICLES) particles.push({ x: player.x + rand(-260, 260), y: player.y + rand(-180, 180), vx: rand(-16, 16), vy: rand(-16, 16), life: .24, max: .24, r: rand(1.8, 3.8), color: '#7aa7ff', ring: false });
      if (eventTimer <= 0) finishEvent();
    }
    if (activeTactic && !bossActive) {
      tacticPulse -= dt;
      if (tacticPulse <= 0) {
        spawnTacticPack(activeTactic, false);
        tacticPulse = rand(5.6, 9.2) / lateGameScale();
      }
    }
    featurePulse += dt; zoneTick -= dt; maintainWorldFeatures();
    shotTimer -= dt; spawnTimer -= dt; dashCooldown = Math.max(0, dashCooldown - dt); dashTime = Math.max(0, dashTime - dt); player.invuln = Math.max(0, player.invuln - dt); missionPulse += dt;

    const keyX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const keyY = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const useTouchMove = controlMode === 'touch' && touchMove.pressed && touchMove.active;
    const ax = useTouchMove ? touchMove.x : keyX;
    const ay = useTouchMove ? touchMove.y : keyY;
    const len = Math.hypot(ax, ay) || 1;
    const touchForce = useTouchMove ? clamp(touchMove.force || 1, .45, 1) : 1;
    const dashMult = dashTime > 0 ? 3.25 : 1;
    player.vx = (ax / len) * speed() * touchForce * dashMult;
    player.vy = (ay / len) * speed() * touchForce * dashMult;
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (activeEvent?.id === 'gravityWell' && beacon) {
      const ga = Math.atan2(beacon.y - player.y, beacon.x - player.x);
      player.x += Math.cos(ga) * 34 * dt;
      player.y += Math.sin(ga) * 34 * dt;
    }
    updatePlayerPose(dt, ax, ay);
    updateAnomaly(dt);
    updateWorldFeatures(dt);
    updateBeacon(dt);

    const tempoRegen = (tempoBoostActive()?.regenBonus || 0) + (coreOverdriveActive()?.regenBonus || 0) + (currentCoreResonance()?.regenBonus || 0);
    if ((upgradesRuntime.shieldRegen > 0 || tempoRegen > 0) && player.hp < player.maxHp) {
      player.regenClock += dt;
      if (player.regenClock >= .5) {
        player.hp = Math.min(player.maxHp, player.hp + upgradesRuntime.shieldRegen * 1.7 + tempoRegen);
        player.regenClock = 0;
      }
    }

    if (shotTimer <= 0) { shoot(); shotTimer = weaponFireRate(); }
    if (spawnLeft > 0 && spawnTimer <= 0) {
      const activeCap = enemyCap();
      const openSlots = Math.max(1, activeCap - enemies.length);
      const burstBase = runStageForWave(wave) === runStageDefs.warmup ? 5 : runStageForWave(wave) === runStageDefs.pressure ? 7 : 6;
      const burstCount = Math.min(spawnLeft, openSlots, Math.max(4, Math.round((burstBase + Math.floor(wave / 3)) * lateGameScale())));
      for (let i = 0; i < burstCount; i++) spawnEnemy();
      spawnLeft -= burstCount;
      spawnTimer = spawnIntervalForWave(wave);
    }

    updateBullets(dt); updateEnemies(dt); updateEnemyShots(dt); updateBossTelegraphs(dt); updatePickups(dt); updateParticles(dt);
    sampleRunStats();
    updateTutorial();

    if (xp >= xpNeed) levelUp();
    if (spawnLeft <= 0 && enemies.length === 0) finishWave();
    completeMissionIfNeeded();
    checkAchievements();
    updateUi();
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      const trailColor = b.trailColor || (b.homing ? '#ffd166' : '#37f6ff');
      if (b.homing) {
        if (!b.target || b.target.dead) b.target = nearestEnemy(activeEvent?.id === 'blackout' ? 520 : activeEvent?.id === 'empStorm' ? 620 : 860);
        if (b.target) {
          const desired = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          const current = Math.atan2(b.vy, b.vx);
          let diff = ((desired - current + Math.PI * 3) % TWO_PI) - Math.PI;
          diff = clamp(diff, -b.turn * dt, b.turn * dt);
          const speed = Math.hypot(b.vx, b.vy) || 430;
          const next = current + diff;
          b.vx = Math.cos(next) * speed;
          b.vy = Math.sin(next) * speed;
        }
        if (particles.length < MAX_PARTICLES) particles.push({ x: b.x - b.vx * .01, y: b.y - b.vy * .01, vx: rand(-10, 10), vy: rand(-10, 10), life: .16, max: .16, r: rand(1.2, 2.4), color: trailColor, ring: false, kind: 'pickupTrail', len: b.type === 'drone' ? 18 : 13 });
      } else if ((b.core || b.type === 'rail' || b.type === 'lance') && particles.length < MAX_PARTICLES && Math.random() < dt * (b.type === 'rail' ? 42 : 26)) {
        particles.push({ x: b.x - b.vx * .012, y: b.y - b.vy * .012, vx: -b.vx * .035 + rand(-8, 8), vy: -b.vy * .035 + rand(-8, 8), life: .13, max: .13, r: 2, color: trailColor, ring: false, kind: 'spark', len: b.type === 'rail' ? 24 : 12 });
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    }
    for (const b of bullets) {
      if (b.dead) continue;
      for (const e of enemies) {
        if (e.dead) continue;
        const rr = b.r + e.r;
        if (dist2(b, e) < rr * rr) {
          const weakMult = (upgradesRuntime.weakScan > 0 && (e.elite || e.type === 'boss')) ? 1 + upgradesRuntime.weakScan * .16 : 1;
          let hitDamage = b.dmg * weakMult * (e.type === 'boss' ? (b.bossDamageMult || 1) : 1);
          recordCoreResonanceHit(b, e);
          if (e.elite?.id === 'refractor' && (Math.floor(runTime * 2) % 2 === 0)) hitDamage *= .62;
          if (e.shield > 0) {
            const blocked = Math.min(e.shield, hitDamage * .85);
            e.shield -= blocked;
            hitDamage -= blocked * .72;
            if (runStats) runStats.shieldSatelliteTime += .05;
          }
          e.hp -= hitDamage;
          if (e.type === 'boss') recordBossBreakDamage(e, hitDamage);
          e.hit = e.type === 'boss' ? .12 : .08;
          if (b.crit) addText(e.x, e.y - e.r - 14, 'CRIT', '#fff6c7');
          if (b.burn > 0) e.burn = Math.max(e.burn || 0, 1.6 + b.burn * .35);
          impactFeedback(b.x, b.y, e.type === 'boss' ? '#ffffff' : b.trailColor || (b.homing ? '#ffd166' : '#37f6ff'), e.type === 'boss' ? 1.2 : .78, e.type === 'boss' ? 'bossHit' : 'hit', Math.atan2(b.vy, b.vx));
          if (b.blast > 0) {
            const blastDamage = b.dmg * (.35 + upgradesRuntime.plasmaBurst * .08) * (b.blastDamageMult || 1);
            particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: .22, max: .22, r: b.blast * .32, color: '#ff7a3d', ring: true });
            for (const other of enemies) {
              if (other.dead || other === e) continue;
              const d = Math.hypot(other.x - b.x, other.y - b.y);
              if (d < b.blast + other.r) {
                other.hp -= blastDamage * (1 - Math.min(.65, d / (b.blast + other.r) * .45));
                other.hit = .08;
                if (other.hp <= 0) killEnemy(other);
              }
            }
          }
          if (e.hp <= 0) killEnemy(e);
          if (b.pierce > 0) b.pierce--; else b.dead = true;
          break;
        }
      }
    }
    { const c = camera(); bullets = bullets.filter(b => !b.dead && b.life > 0 && b.x > c.x - 160 && b.x < c.x + W + 160 && b.y > c.y - 160 && b.y < c.y + H + 160); }
  }

  function enemyBehaviorVector(e, a, d, dt) {
    const toward = { x: Math.cos(a), y: Math.sin(a), speed: 1 };
    if (!e || e.type === 'boss') return { ...toward, speed: d < 230 ? .18 : 1 };
    const sideA = a + Math.PI / 2 * (e.strafeDir || 1);
    const side = { x: Math.cos(sideA), y: Math.sin(sideA) };
    if (e.type === 'chaser') {
      const flank = d > 95 ? .34 : .62;
      return { x: toward.x * (1 - flank) + side.x * flank, y: toward.y * (1 - flank) + side.y * flank, speed: d < 70 ? .55 : 1.05 };
    }
    if (e.type === 'sprinter') {
      e.dashRecover = Math.max(0, e.dashRecover - dt);
      if (e.dashTime > 0) {
        e.dashTime -= dt;
        if (e.dashTime <= 0) { e.dashRecover = .5; e.dashWindup = rand(1.05, 1.85); }
        return { x: Math.cos(e.dashA), y: Math.sin(e.dashA), speed: 2.35 };
      }
      if (e.dashRecover > 0) return { x: -toward.x * .25 + side.x * .45, y: -toward.y * .25 + side.y * .45, speed: .42 };
      e.dashWindup -= dt;
      if (d < 540 && e.dashWindup <= 0) {
        e.dashA = a;
        e.dashTime = .32;
        e.telegraph = .34;
        addText(e.x, e.y - e.r - 15, '突進', '#ffb36b');
        return { x: 0, y: 0, speed: 0 };
      }
      if (d < 540 && e.dashWindup < .34) { e.telegraph = .18; return { x: side.x, y: side.y, speed: .35 }; }
      return { x: toward.x * .75 + side.x * .25, y: toward.y * .75 + side.y * .25, speed: 1.08 };
    }
    if (e.type === 'shooter') {
      if (d < 250) return { x: -toward.x * .9 + side.x * .25, y: -toward.y * .9 + side.y * .25, speed: 1.05 };
      if (d > 440) return { x: toward.x * .85 + side.x * .22, y: toward.y * .85 + side.y * .22, speed: .88 };
      return { x: side.x, y: side.y, speed: .62 };
    }
    if (e.type === 'bomber') {
      if (d < 155 && !e.detonate) { e.detonate = 1.05; e.telegraph = 1.05; addText(e.x, e.y - e.r - 14, '引爆', '#ffb36b'); }
      if (e.detonate > 0) return { x: toward.x, y: toward.y, speed: .34 };
      return { x: toward.x * .86 + side.x * .2, y: toward.y * .86 + side.y * .2, speed: .96 };
    }
    if (e.type === 'tank') {
      e.ramClock -= dt;
      if (e.ramTime > 0) { e.ramTime -= dt; return { x: toward.x, y: toward.y, speed: 1.75 }; }
      if (e.ramClock <= 0 && d < 360) { e.ramTime = .5; e.ramClock = rand(2.2, 3.4); e.telegraph = .45; addText(e.x, e.y - e.r - 16, '盾推', '#ffcf7a'); return { x: 0, y: 0, speed: 0 }; }
      return { x: toward.x * .88 + side.x * .12, y: toward.y * .88 + side.y * .12, speed: d < 90 ? .32 : .82 };
    }
    if (e.type === 'leech') {
      if (d < 145) return { x: -toward.x * .55 + side.x * .7, y: -toward.y * .55 + side.y * .7, speed: .72 };
      if (d < 210) return { x: side.x, y: side.y, speed: .72 };
      return { x: toward.x * .82 + side.x * .18, y: toward.y * .82 + side.y * .18, speed: .95 };
    }
    if (e.type === 'shieldSat') {
      let anchor = null;
      let best = Infinity;
      for (const ally of enemies) {
        if (ally.dead || ally === e || ally.type === 'boss' || ally.type === 'shieldSat') continue;
        const ad = Math.hypot(ally.x - e.x, ally.y - e.y);
        if (ad < best) { best = ad; anchor = ally; }
      }
      if (anchor && best > 126) {
        const aa = Math.atan2(anchor.y - e.y, anchor.x - e.x);
        return { x: Math.cos(aa), y: Math.sin(aa), speed: .82 };
      }
      if (anchor) {
        const aa = Math.atan2(anchor.y - e.y, anchor.x - e.x) + Math.PI / 2 * (e.strafeDir || 1);
        return { x: Math.cos(aa), y: Math.sin(aa), speed: .46 };
      }
      return { ...toward, speed: .72 };
    }
    return toward;
  }

  function updateEnemies(dt) {
    const slowRadius = 150 + upgradesRuntime.slowField * 45;
    for (const e of enemies) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (e.burn > 0) {
        e.burn = Math.max(0, e.burn - dt);
        e.hp -= dt * (5 + upgradesRuntime.burnRounds * 2.6);
        if (Math.random() < dt * 4 && particles.length < MAX_PARTICLES) particles.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-15, 15), vy: rand(-20, 5), life: .22, max: .22, r: 2.2, color: '#ff7a3d', ring: false });
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
      const auraSpeed = enemies.some(ae => !ae.dead && ae !== e && ae.elite?.id === 'accelerator' && Math.hypot(ae.x - e.x, ae.y - e.y) < 165) ? 1.16 : 1;
      const slow = (upgradesRuntime.slowField > 0 && d < slowRadius ? .55 : 1) * (activeEvent?.id === 'empStorm' ? .82 : 1) * auraSpeed;
      e.telegraph = Math.max(0, (e.telegraph || 0) - dt);
      const mv = enemyBehaviorVector(e, a, d, dt);
      const ml = Math.hypot(mv.x, mv.y) || 1;
      e.x += (mv.x / ml) * e.speed * slow * (mv.speed ?? 1) * dt;
      e.y += (mv.y / ml) * e.speed * slow * (mv.speed ?? 1) * dt;
      if (e.type === 'boss') {
        if (e.breakWindow) {
          e.breakWindow.timer -= dt;
          if (e.breakWindow.timer <= 0) e.breakWindow = null;
        }
        e.abilityClock = (e.abilityClock ?? bossAbilityDelay(e)) - dt;
        if (e.abilityClock <= 0) {
          triggerBossAbility(e);
          e.abilityClock = bossAbilityDelay(e);
        }
      }
      if (e.finalBoss || e.bossVariant === 'brood') {
        e.summonClock -= dt;
        if (e.summonClock <= 0) {
          spawnEnemy(e.bossVariant === 'brood' ? choose(['leech', 'shieldSat', 'bomber']) : choose(e.phase2 ? ['sprinter', 'bomber', 'leech'] : ['chaser', 'sprinter']));
          if (e.bossVariant === 'brood' && Math.random() < .45) addWorldFeature('hazard');
          e.summonClock = e.bossVariant === 'brood' ? (e.phase2 ? 1.35 : 1.9) : e.phase2 ? 1.9 : 2.8;
          particles.push({ x: e.x, y: e.y, vx: rand(-40, 40), vy: rand(-40, 40), life: .3, max: .3, r: 8, color: e.color, ring: true });
        }
      }
      if (activeEvent?.id === 'gravityWell' && beacon && e.type !== 'boss') {
        const ga = Math.atan2(beacon.y - e.y, beacon.x - e.x);
        e.x += Math.cos(ga) * 22 * dt;
        e.y += Math.sin(ga) * 22 * dt;
      }
      if (e.type === 'boss' && !e.phase2 && e.hp < e.maxHp * .5) {
        e.phase2 = true;
        e.speed *= 1.22;
        e.abilityClock = Math.min(e.abilityClock || 1.4, 1.1);
        if (runStats) { runStats.bossPhase2 = true; runStats.bossPhase2Start = runTime; }
        announceBoss(e, 'phase2');
        triggerBossPhaseCinematic(e);
        const info = bossReadInfo(e);
        bossAlert.hint = `破招：${info.breakHint || '二階段讀題時集中火力。'}`;
        armBossBreakWindow(e, info);
        burst(e.x, e.y, e.color || '#ff4d6d', e.finalBoss ? 70 : 48, e.finalBoss ? 1.8 : 1.5);
        sfx('boss'); addShake(e.finalBoss ? 8 : 5, .24); haptic(e.finalBoss ? 55 : 28);
      }
      if (e.type === 'leech' && d < 185 && !isPlayerProtected()) {
        playerImpact('leech', 1.2, 8, e.x, e.y); player.hp -= incomingDamage(dt * (1.8 + wave * .04)); damageFlash = Math.max(damageFlash, .12);
        if (Math.random() < dt * 5) particles.push({ x: player.x + rand(-8, 8), y: player.y + rand(-8, 8), vx: (e.x - player.x) * .4, vy: (e.y - player.y) * .4, life: .18, max: .18, r: 2.2, color: '#b66dff', ring: false });
        if (player.hp <= 0) endRun();
      }
      if (e.type === 'bomber' && e.detonate > 0) {
        e.detonate -= dt;
        e.telegraph = Math.max(e.telegraph || 0, e.detonate);
        if (Math.random() < dt * 14 && particles.length < MAX_PARTICLES) particles.push({ x: e.x + rand(-e.r, e.r), y: e.y + rand(-e.r, e.r), vx: rand(-18, 18), vy: rand(-18, 18), life: .18, max: .18, r: rand(2, 4), color: '#ff7a3d', ring: false });
        if (e.detonate <= 0) {
          e.dead = true;
          const blastD = Math.hypot(player.x - e.x, player.y - e.y);
          if (blastD < 128 && !isPlayerProtected()) {
            playerImpact('bomber', 5.2, 40, e.x, e.y);
            player.hp -= incomingDamage(15 + wave * .42);
            damageFlash = .34;
            player.invuln = .42;
            if (player.hp <= 0) endRun();
          }
          burst(e.x, e.y, '#ff7a3d', 30, 1.3);
          particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .26, max: .26, r: 42, color: '#ff7a3d', ring: true });
          continue;
        }
      }
      if (e.type === 'shieldSat') {
        e.shieldClock -= dt;
        if (e.shieldClock <= 0) {
          let linked = 0;
          for (const ally of enemies) {
            if (ally.dead || ally === e || ally.type === 'boss') continue;
            const ad = Math.hypot(ally.x - e.x, ally.y - e.y);
            if (ad < 180) {
              ally.shield = Math.min(26 + wave * 1.4, (ally.shield || 0) + 9 + wave * .8);
              linked++;
              if (particles.length < MAX_PARTICLES) particles.push({ x: ally.x, y: ally.y, vx: (e.x - ally.x) * .08, vy: (e.y - ally.y) * .08, life: .2, max: .2, r: 2.4, color: '#7aa7ff', ring: false });
            }
          }
          if (linked && runStats) runStats.shieldSatelliteTime += linked * .35;
          e.shieldClock = 1.15;
        }
      }
      if (e.elite?.id === 'medic') {
        e.healClock -= dt;
        if (e.healClock <= 0) {
          for (const ally of enemies) if (!ally.dead && ally !== e && Math.hypot(ally.x - e.x, ally.y - e.y) < 145) ally.hp = Math.min(ally.maxHp, ally.hp + 9 + wave * 1.2);
          particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: .34, max: .34, r: 18, color: '#4dff88', ring: true });
          e.healClock = rand(1.2, 2.1);
        }
      }
      e.hit = Math.max(0, e.hit - dt);
      if (e.type === 'shooter' || e.type === 'boss') {
        e.shootClock -= dt;
        if (e.shootClock <= 0) { enemyShoot(e); e.shootClock = e.type === 'boss' ? (e.finalBoss ? (e.phase2 ? rand(.42, .72) : rand(.62, .96)) : e.phase2 ? rand(.72, 1.12) : rand(1.0, 1.65)) : rand(1.7, 2.7); }
      }
      const rr = e.r + player.r;
      if (!(e.type === 'bomber' && e.detonate > 0) && dist2(e, player) < rr * rr && !isPlayerProtected()) {
        playerImpact(e.type === 'boss' ? 'boss' : 'collision', e.type === 'boss' ? 5.5 : 3.1, e.type === 'boss' ? 42 : 18, e.x, e.y); player.hp -= incomingDamage(Math.ceil((e.type === 'boss' ? 22 : 7) + wave * .55)); damageFlash = .32;
        player.invuln = dashTime > 0 ? .05 : .68;
        if (e.type !== 'boss') e.dead = true;
        burst(player.x, player.y, '#ff4d6d', 18);
        if (player.hp <= 0) endRun();
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }

  function updateEnemyShots(dt) {
    for (const s of enemyShots) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.type === 'meteor') {
        for (const e of enemies) if (!e.dead && dist2(s, e) < Math.pow(s.r + e.r, 2)) { e.hp -= s.dmg * 1.7; e.hit = .12; impactFeedback(s.x, s.y, '#ff7a3d', .8, 'hit'); if (e.hp <= 0) killEnemy(e); }
        particles.push({ x: s.x, y: s.y, vx: rand(-10, 10), vy: rand(-10, 10), life: .2, max: .2, r: 3, color: s.color || '#ff7a3d', ring: false });
      }
      const hitR = s.r + player.r;
      const shotD2 = dist2(s, player);
      const grazeR = hitR + (s.type === 'meteor' ? 30 : 22);
      if (!s.grazed && !isPlayerProtected() && shotD2 >= hitR * hitR && shotD2 < grazeR * grazeR) recordEvasionGraze(s);
      if (shotD2 < hitR * hitR && !isPlayerProtected()) {
        playerImpact(s.type === 'meteor' ? 'meteor' : 'projectile', s.type === 'meteor' ? 4.5 : 3.4, s.type === 'meteor' ? 38 : 20, s.x, s.y); s.dead = true; player.hp -= incomingDamage(s.dmg); damageFlash = .3; player.invuln = .45; burst(player.x, player.y, '#ff4d6d', 10);
        if (player.hp <= 0) endRun();
      }
    }
    { const c = camera(); enemyShots = enemyShots.filter(s => !s.dead && s.life > 0 && s.x > c.x - 180 && s.x < c.x + W + 180 && s.y > c.y - 180 && s.y < c.y + H + 180); }
  }

  function updatePickups(dt) {
    const mr = magnetRange();
    for (const s of shards) {
      s.life -= dt; s.vx *= .985; s.vy *= .985;
      const dx = player.x - s.x; const dy = player.y - s.y; const d = Math.hypot(dx, dy);
      if (d < mr) {
        const magnet = clamp(1 - d / mr, 0, 1);
        const pull = magnet * 980;
        s.magnet = Math.max(s.magnet || 0, magnet);
        s.vx += (dx / Math.max(1, d)) * pull * dt;
        s.vy += (dy / Math.max(1, d)) * pull * dt;
        if (magnet > .18 && Math.random() < dt * 18 && particles.length < MAX_PARTICLES) particles.push({ x: s.x, y: s.y, vx: -s.vx * .05, vy: -s.vy * .05, life: .18, max: .18, r: 2.2 + magnet * 2.2, color: '#ffd166', ring: false, kind: 'pickupTrail', len: 8 + magnet * 14 });
      } else {
        s.magnet = Math.max(0, (s.magnet || 0) - dt * 1.5);
      }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (d < player.r + s.r + 8) { s.dead = true; meta.scrap += s.value; meta.score += 2; onShardCollected(s.value); impactFeedback(s.x, s.y, '#ffd166', .45, 'pickup', Math.atan2(dy, dx)); }
    }
    shards = shards.filter(s => !s.dead && s.life > 0);

    for (const p of powerups) {
      p.life -= dt; p.spin += dt * 3;
      if (Math.hypot(player.x - p.x, player.y - p.y) < player.r + p.r + 10) {
        p.dead = true;
        if (p.kind === 'heal') { player.hp = Math.min(player.maxHp, player.hp + 35); sfx('pickup'); flash('維修核心：護盾 +35'); }
        if (p.kind === 'nova') { enemies.forEach(e => { e.hp -= 80; if (e.hp <= 0) killEnemy(e); }); burst(player.x, player.y, '#ffd166', 48, 1.7); sfx('boss'); addShake(6, .22); flash('新星炸彈啟動'); }
        if (p.kind === 'rapid') { shotTimer = -1; sfx('upgrade'); for (let i = 0; i < 5; i++) setTimeout(shoot, i * 55); flash('短暫超頻射擊'); }
      }
    }
    powerups = powerups.filter(p => !p.dead && p.life > 0);
  }

  function updateParticles(dt) {
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; if (p.ring) p.r += (p.fastRing ? 150 : 90) * dt; }
    particles = particles.filter(p => p.life > 0);
    let rings = 0;
    particles = particles.filter(p => {
      if (!p.ring) return true;
      rings++;
      return rings <= MAX_RING_PARTICLES;
    });
    if (particles.length > MAX_PARTICLES) particles = particles.slice(particles.length - MAX_PARTICLES);
    for (const t of floatText) { t.life -= dt; t.y -= 34 * dt; }
    floatText = floatText.filter(t => t.life > 0);
  }

  function levelUp() {
    xp -= xpNeed;
    xpNeed = Math.floor(xpNeed * 1.2 + 5);
    meta.scrap += 8 + Math.floor(wave * 1.45);
    player.hp = Math.min(player.maxHp, player.hp + 20);
    sfx('upgrade');
    openSkillChoices();
  }

  function openSkillChoices() {
    closeUpgradeModal();
    skillChoosing = true;
    paused = true;
    const choices = makeSkillChoices();
    ui.overlay.classList.add('visible');
    const card = ui.overlay.querySelector('.card');
    clearRunOverlayExtras(card);
    hideHomeOnlyPanels(card);
    card.querySelector('.eyebrow').textContent = 'LEVEL UP // 選擇一項本局技能';
    card.querySelector('h2').textContent = '飛船核心升級';
    const current = topBuild();
    card.querySelector('p:not(.eyebrow)').textContent = current.def ? `目前主流派：${current.def.name}（${current.score}/${BUILD_CORE_SCORE}，${current.score >= BUILD_CORE_SCORE ? '核心成形' : '成形中'}）。卡片會標出主流派、副流派、核心候選與補強理由。` : '這些技能只在本局有效。先選一個起手流派，再沿同方向疊出核心；卡片會顯示分數預覽與推薦理由。';
    ui.startBtn.style.display = 'none';
    ui.howBtn.style.display = 'none';
    ui.how.hidden = true;
    let box = document.getElementById('skillChoices');
    if (!box) { box = document.createElement('div'); box.id = 'skillChoices'; box.className = 'skill-choices'; card.appendChild(box); }
    box.innerHTML = '';
    for (const c of choices) {
      const analysis = skillChoiceAnalysis(c);
      const def = analysis.def;
      const scorePct = Math.round(clamp(analysis.next / BUILD_CORE_SCORE, 0, 1) * 100);
      const btn = document.createElement('button');
      btn.className = `skill-choice${analysis.core ? ' core' : ''}`;
      btn.style.setProperty('--skill-color', def.color);
      const chips = analysis.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
      btn.innerHTML = `
        <span class="skill-tag" style="color:${def.color}">${escapeHtml(def.name)}｜${escapeHtml(c.role)}</span>
        <b>${escapeHtml(c.name)}</b>
        <small>${escapeHtml(c.desc)}</small>
        <div class="skill-meta"><span>Lv.${upgradesRuntime[c.id]} → ${upgradesRuntime[c.id] + 1}</span><span>${analysis.current} → ${analysis.next} / ${BUILD_CORE_SCORE}</span></div>
        <div class="skill-score" aria-label="${escapeHtml(def.name)} 分數 ${analysis.next}/${BUILD_CORE_SCORE}"><i style="width:${scorePct}%"></i></div>
        <div class="skill-tags">${chips}</div>
        <em>推薦：${escapeHtml(analysis.reason)}</em>
        <small class="skill-coverage">選後：${escapeHtml(analysis.coverage)}</small>`;
      btn.addEventListener('click', () => chooseSkill(c.id, c.name));
      box.appendChild(btn);
    }
  }

  function chooseSkill(id, name) {
    const before = currentBuildCore();
    upgradesRuntime[id]++;
    if (runStats) runStats.skills.push(name);
    skillChoosing = false;
    paused = false;
    ui.overlay.classList.remove('visible');
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
    const box = document.getElementById('skillChoices');
    if (box) box.remove();
    const after = currentBuildCore();
    if (after.id && after.id !== before.id && player) {
      particles.push({ x: player.x, y: player.y, vx: 0, vy: 0, life: .58, max: .58, r: 22, color: after.def.color, ring: true, fastRing: true });
      burst(player.x, player.y, after.def.color, 18, .75);
      flash(`${after.def.core} 成形｜${after.def.name}`);
      haptic(28);
    } else {
      flash(`${name} Lv.${upgradesRuntime[id]}｜${detectBuildName()}`);
    }
    announceCoreResonanceIfNeeded();
    sfx('upgrade');
  }

  function finishWave() {
    recordWaveTime(wave);
    meta.bestWave = Math.max(meta.bestWave, wave + 1);
    const reward = 5 + Math.floor(wave * 1.25) + (bossActive ? 20 : 0) + (beacon && Math.hypot(player.x - beacon.x, player.y - beacon.y) < 130 ? 10 : 0);
    meta.scrap += reward;
    addText(player.x, player.y - 44, `波次獎勵 +${reward}`, '#ffd166');
    startWave(wave + 1);
    save(false);
  }

  function runScrapGain() {
    return Math.max(0, Math.floor(meta.scrap - runStartScrap));
  }

  function runGrade() {
    let points = 0;
    points += runObjectives * 16;
    points += runEvents * 12;
    points += Math.min(40, Math.floor(runKills / 8));
    points += Math.min(25, Math.floor(runScrapGain() / 35));
    if (player?.hp > player?.maxHp * .55) points += 10;
    if (points >= 105) return 'S';
    if (points >= 78) return 'A';
    if (points >= 52) return 'B';
    return 'C';
  }

  function nextChallengeForGrade(grade) {
    if (grade === 'S') return '下一局挑戰：嘗試更少受傷或更高波次。';
    if (grade === 'A') return '下一局挑戰：多完成目標與事件，衝 S 評級。';
    if (grade === 'B') return '下一局挑戰：多跑目標點，事件獎勵會推高評級。';
    return '下一局挑戰：先完成 2 個目標，累積技能再打 Boss。';
  }

  function deathAdvice() {
    if (wave <= 3) return '建議：前 3 波先保持距離、撿碎晶，看到藍色箭頭就順路靠近目標。';
    if (lastDamageCause === 'hazard') return '建議：紅色裂隙是持續傷害區，不要硬穿；先升引擎或繞路完成其他目標。';
    if (lastDamageCause === 'leech') return '建議：紫色吸能蟲要優先拉開距離擊殺；可選霰彈、電漿或升主砲。';
    if (lastDamageCause === 'bomber') return '建議：爆裂雷閃爍時代表快自爆，先後退再用範圍火力清掉。';
    if ((runStats?.shieldSatelliteTime || 0) > 10) return '建議：護盾衛星會替附近敵人補盾，先集火藍色衛星再清主群。';
    if ((runStats?.tacticsSeen || []).includes('加速爆雷群')) return '建議：加速爆雷群要先後撤，等爆裂雷離開主群再清掉。';
    if ((runStats?.tacticsSeen || []).includes('治療蜂群')) return '建議：治療蜂群會拖長戰鬥，看到綠色 + 精英時先點殺治療者。';
    if (lastDamageCause === 'boss') return '建議：Boss 戰前優先主砲、穿甲光矛或蓄能軌砲，護盾不足就先升護盾矩陣。';
    if (lastDamageCause === 'projectile' || lastDamageCause === 'meteor') return '建議：彈幕多時不要貪撿碎晶，優先橫向移動並保留安全距離。';
    if (runObjectives <= 1 && wave >= 4) return '建議：多完成目標點，事件獎勵會讓技能與碎晶成長更快。';
    if ((meta.upgrades.magnet || 0) < 2 && runScrapGain() < 60) return '建議：永久升級可先補磁吸場，碎晶不用冒險貼臉撿。';
    return '建議：下一局先補護盾矩陣與主砲，並用目標事件累積局內技能。';
  }

  function completeSector() {
    if (gameOver) return;
    recordWaveTime(wave);
    sampleRunStats();
    closeUpgradeModal();
    gameOver = true;
    paused = true;
    const bonus = Math.floor((120 + Math.floor(meta.bestWave * 3) + runKills) * (1 + (meta.upgrades.survey || 0) * .035) * currentDifficulty().reward);
    meta.scrap += bonus;
    const grade = runGrade();
    const record = makeRunRecord('clear', grade, bonus);
    meta.bestWave = Math.max(meta.bestWave, wave);
    meta.achievements.sectorClear = true;
    saveRunRecord(record);
    checkAchievements();
    burst(player.x, player.y, '#bdfcff', 70, 1.9);
    sfx('success');
    addShake(7.5, .32);
    haptic(110);
    ui.overlay.classList.add('visible');
    const card = ui.overlay.querySelector('.card');
    card.querySelector('.eyebrow').textContent = 'SECTOR CLEAR // 撤離成功';
    card.querySelector('h2').textContent = `星環核心已回收｜評級 ${grade}`;
    ui.startBtn.textContent = '再次出擊';
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
    renderRunReport(card, record, `你帶回 ${bonus} 額外碎晶，碎晶淨收益 ${runScrapGain()}。${nextChallengeForGrade(grade)}`);
    flash(`撤離成功：額外 +${bonus} 碎晶`);
  }

  function endRun() {
    recordWaveTime(wave);
    sampleRunStats();
    if (runStats) runStats.deathCause = lastDamageCause || 'unknown';
    expireActiveRouteConsequences('本局結束');
    closeUpgradeModal();
    gameOver = true;
    sfx('hurt');
    addShake(3.2, .16);
    meta.bestWave = Math.max(meta.bestWave, wave);
    const record = makeRunRecord('fail', '-', 0);
    saveRunRecord(record);
    ui.overlay.classList.add('visible');
    const card = ui.overlay.querySelector('.card');
    card.querySelector('.eyebrow').textContent = 'RUN TERMINATED';
    card.querySelector('h2').textContent = '飛船解體，但資料已保存。';
    ui.startBtn.textContent = '重新出擊';
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
    renderRunReport(card, record, `你撐到第 ${wave} 波，擊毀 ${runKills} 架無人機。${deathAdvice()}`);
    flash('本局結束，永久資源已保存');
  }

  function updateUi() {
    ui.wave.textContent = wave;
    ui.hp.textContent = Math.max(0, Math.ceil(player?.hp || 0));
    ui.scrap.textContent = Math.floor(meta.scrap);
    ui.score.textContent = Math.floor(meta.score);
    ui.xpBar.style.width = `${clamp((xp / xpNeed) * 100, 0, 100)}%`;
    updateCombatControls();
    updateUpgradeAccessUi();
  }

  function renderUpgradeButtonStateOnly() {
    const buttons = ui.upgrades.querySelectorAll('.upgrade button');
    upgradeDefs.forEach((def, i) => {
      const btn = buttons[i]; if (!btn) return;
      const lvl = meta.upgrades[def.id] || 0; const cost = upgradeCost(def);
      const unlocked = upgradeUnlocked(def);
      btn.disabled = !unlocked || !canUsePermanentUpgrades() || lvl >= def.max || meta.scrap < cost;
      btn.textContent = !unlocked ? '未解鎖' : lvl >= def.max ? '已滿級' : `升級｜${cost} 碎晶`;
      const level = btn.closest('.upgrade')?.querySelector('.level'); if (level) level.textContent = `Lv.${lvl}/${def.max}`;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    const c = camera();
    const shake = screenShakeOffset();
    ctx.save();
    ctx.translate(-c.x + shake.x, -c.y + shake.y);
    drawWorldFeatures(); drawShards(); drawPowerups(); drawBullets(); drawBossTelegraphs(); drawEnemyShots(); drawEnemies(); drawOrbitals(); drawBuildAura(); drawPlayer(); drawParticles();
    ctx.restore();
    drawMission(); drawTargetGuide(); drawEventBanner(); drawBossAlert(); drawBossCinematic(); drawScreenEffects(); drawTouchDpad();
    if (paused && running && !ui.overlay.classList.contains('visible')) drawPause();
  }

  function drawBackground() {
    ctx.save();
    for (const n of nebula) {
      n.a += n.drift * .002;
      const x = n.x + Math.cos(n.a) * 16; const y = n.y + Math.sin(n.a) * 12;
      const g = ctx.createRadialGradient(x, y, 10, x, y, n.r);
      g.addColorStop(0, `rgba(${n.color},.105)`); g.addColorStop(1, `rgba(${n.color},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    ctx.save();
    for (const s of stars) {
      s.tw += .01 * s.z; ctx.globalAlpha = .2 + Math.sin(s.tw) * .18 + s.z * .36; ctx.fillStyle = s.z > .75 ? '#37f6ff' : '#eef7ff';
      ctx.fillRect(s.x, s.y, s.z * 2, s.z * 2); s.y += s.z * .09; if (s.y > H) s.y = 0;
    }
    ctx.restore();

    const c = camera();
    ctx.save();
    ctx.strokeStyle = 'rgba(55,246,255,.055)';
    ctx.lineWidth = 1;
    const grid = 180;
    const ox = -((c.x % grid) + grid) % grid;
    const oy = -((c.y % grid) + grid) % grid;
    for (let x = ox; x < W; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = oy; y < H; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const zone = currentZone();
    if (zone.id !== 'default') {
      ctx.globalAlpha = .08;
      ctx.fillStyle = zone.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = .22;
      ctx.strokeStyle = zone.color;
      const t = performance.now() * .001;
      for (let i = 0; i < 4; i++) {
        const y = (Math.sin(t + i * 1.7) * .5 + .5) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + Math.sin(t * 1.8 + i) * 26); ctx.stroke();
      }
    }
    const coreBoss = currentBoss();
    const coreActive = (coreBoss?.finalBoss && bossActive) || bossCinematic?.final || victoryRainTimer > 0;
    if (coreActive) {
      const t = performance.now() * .001;
      const color = bossCinematic?.kind === 'victory' || victoryRainTimer > 0 ? '#bdfcff' : coreBoss?.phase2 || bossCinematic?.kind === 'phase2' ? '#ff4d6d' : '#bdfcff';
      ctx.globalAlpha = bossCinematic?.kind === 'victory' ? .22 : coreBoss?.phase2 ? .16 : .10;
      const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * .62);
      g.addColorStop(0, color === '#ff4d6d' ? 'rgba(255,77,109,.18)' : 'rgba(189,252,255,.16)');
      g.addColorStop(1, 'rgba(5,7,18,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = .18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const r = 90 + i * 72 + Math.sin(t * 1.6 + i) * 18;
        ctx.beginPath(); ctx.ellipse(W / 2, H / 2, r * 1.6, r * .62, t * .12, 0, TWO_PI); ctx.stroke();
      }
    }
    ctx.restore();
  }


  function drawWorldFeatures() {
    if (!worldFeatures.length) return;
    ctx.save();
    for (const f of worldFeatures) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(visualScale(), visualScale());
      ctx.rotate(f.spin + f.seed);
      if (f.type === 'asteroid' || f.type === 'debris') {
        const color = f.type === 'asteroid' ? '#6f7d9c' : '#37f6ff';
        ctx.shadowColor = color; ctx.shadowBlur = f.type === 'asteroid' ? 8 : 14;
        ctx.fillStyle = f.type === 'asteroid' ? 'rgba(111,125,156,.64)' : 'rgba(55,246,255,.16)';
        ctx.strokeStyle = f.type === 'asteroid' ? 'rgba(238,247,255,.34)' : 'rgba(55,246,255,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const sides = f.type === 'asteroid' ? 9 : 4;
        for (let i = 0; i < sides; i++) {
          const a = i / sides * TWO_PI;
          const wobble = .78 + Math.sin(f.seed + i * 2.17) * .16;
          const rr = f.r * (f.type === 'asteroid' ? wobble : (i % 2 ? .55 : 1));
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        const color = f.type === 'hazard' ? '#ff4d6d' : f.type === 'repair' || f.type === 'convoyPod' ? '#4dff88' : f.type === 'riftSeal' ? '#b66dff' : f.type === 'routeChoice' ? (f.color || f.routeChoice?.color || '#bdfcff') : f.type === 'routeConsequence' ? (f.color || f.routeConsequence?.color || '#ffd166') : '#ffd166';
        ctx.globalAlpha = .82 + Math.sin(performance.now() * .004 + f.seed) * .12;
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
        if (f.type === 'routeChoice') {
          const choice = f.routeChoice || routeChoiceDefs[f.choiceId] || neutralRouteChoice;
          const pulse = Math.sin(performance.now() * .006 + f.seed) * .5 + .5;
          ctx.shadowColor = color; ctx.shadowBlur = 18;
          ctx.globalAlpha = .62 + pulse * .24;
          ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(30, 0); ctx.lineTo(0, 30); ctx.lineTo(-30, 0); ctx.closePath(); ctx.stroke();
          ctx.globalAlpha *= .64;
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 0); ctx.lineTo(0, 18); ctx.lineTo(-18, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#050712'; ctx.globalAlpha = .92;
          ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(8, 0); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.globalAlpha = .92;
          ctx.beginPath(); ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + TWO_PI * clamp((f.charge || 0) / (f.chargeNeed || 1.75), 0, 1)); ctx.stroke();
          ctx.globalAlpha = .78; ctx.strokeStyle = choice.color || color; ctx.lineWidth = 1.2; ctx.setLineDash([5, 7]);
          ctx.beginPath(); ctx.arc(0, 0, 52 + pulse * 6, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
        } else if (f.type === 'routeConsequence') {
          const state = f.routeConsequence || activeRouteConsequences.find(c => c.id === f.consequenceId);
          const def = state?.def || routeConsequenceDef(f.choiceId);
          const pulse = Math.sin(performance.now() * .006 + f.seed) * .5 + .5;
          const pct = clamp((f.charge || 0) / (f.chargeNeed || def.chargeNeed || 2.6), 0, 1);
          ctx.shadowColor = color; ctx.shadowBlur = 18;
          ctx.globalAlpha = .62 + pulse * .22;
          if (def.mode === 'convoy') {
            ctx.beginPath(); ctx.roundRect(-29, -21, 58, 42, 12); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#050712'; ctx.fillRect(-5, -14, 10, 28); ctx.fillRect(-15, -4, 30, 8);
            ctx.fillStyle = color; ctx.globalAlpha *= .92; ctx.fillRect(-23, 28, 46 * clamp((f.hp || 0) / Math.max(1, f.maxHp || 3), 0, 1), 4);
          } else if (def.mode === 'relay') {
            ctx.beginPath(); ctx.arc(0, 0, 25, 0, TWO_PI); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(22, 0); ctx.lineTo(0, 22); ctx.lineTo(-22, 0); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TWO_PI); ctx.fill();
            ctx.strokeStyle = color; ctx.globalAlpha *= .72; ctx.beginPath(); ctx.arc(0, 0, 43 + pulse * 6, -.2, Math.PI * 1.2); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(26, -8); ctx.lineTo(18, 26); ctx.lineTo(-18, 26); ctx.lineTo(-26, -8); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.moveTo(-7, -12); ctx.lineTo(10, 0); ctx.lineTo(-4, 14); ctx.lineTo(2, 2); ctx.closePath(); ctx.fill();
            ctx.globalAlpha *= .48; ctx.beginPath(); ctx.arc(0, 0, 52 + pulse * 8, 0, TWO_PI); ctx.stroke();
          }
          ctx.globalAlpha = .92; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(0, 0, 42, -Math.PI / 2, -Math.PI / 2 + TWO_PI * pct); ctx.stroke();
        } else if (f.type === 'riftSeal') {
          ctx.beginPath(); ctx.arc(0, 0, 24, 0, TWO_PI); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(10, -8); ctx.lineTo(-4, 2); ctx.lineTo(12, 27); ctx.stroke();
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + TWO_PI * clamp((f.charge || 0) / 2.2, 0, 1)); ctx.stroke();
        } else if (f.type === 'convoyPod') {
          ctx.beginPath(); ctx.roundRect(-25, -18, 50, 36, 10); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#050712'; ctx.fillRect(-4, -12, 8, 24); ctx.fillRect(-12, -4, 24, 8);
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + TWO_PI * clamp((f.charge || 0) / 5, 0, 1)); ctx.stroke();
          ctx.fillStyle = '#4dff88'; ctx.globalAlpha *= .9; ctx.fillRect(-20, 24, 40 * clamp((f.hp || 0) / Math.max(1, f.maxHp || 3), 0, 1), 4);
        } else if (f.type === 'hazard') {
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 15); ctx.lineTo(-18, 15); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = '#050712'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 5); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 10, 1.8, 0, TWO_PI); ctx.fillStyle = '#050712'; ctx.fill();
        } else if (f.type === 'repair') {
          ctx.beginPath(); ctx.roundRect(-16, -16, 32, 32, 8); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#050712'; ctx.fillRect(-4, -11, 8, 22); ctx.fillRect(-11, -4, 22, 8);
        } else {
          ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 0); ctx.lineTo(0, 18); ctx.lineTo(-18, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 0); ctx.lineTo(0, 8); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(-8, -7, 2.2, 0, TWO_PI); ctx.arc(9, 6, 1.8, 0, TWO_PI); ctx.fill();
        }
      }
      ctx.restore();
      const label = worldFeatureLabel(f);
      if (label && (!player || Math.hypot(player.x - f.x, player.y - f.y) < (f.type === 'hazard' ? 620 : 420))) {
        drawMapLabel(label.text, f.x, label.y, label.color, f.type === 'hazard' ? .95 : .86);
      }
    }
    if (beacon) {
      beacon.pulse = (beacon.pulse || 0) + .02;
      const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
      const charge = clamp((beacon.charge || 0) / def.charge, 0, 1);
      const bv = .76 * visualScale();
      ctx.save(); ctx.translate(beacon.x, beacon.y); ctx.scale(bv, bv); ctx.globalAlpha = .78 + Math.sin(beacon.pulse) * .16; ctx.strokeStyle = def.color; ctx.fillStyle = def.color; ctx.lineWidth = 3; ctx.shadowColor = def.color; ctx.shadowBlur = 16;
      if (beacon.kind === 'harvest') { ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(22, 0); ctx.lineTo(0, 24); ctx.lineTo(-22, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); }
      else if (beacon.kind === 'rift') { ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(12, -8); ctx.lineTo(-2, 2); ctx.lineTo(14, 30); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 26, 0, TWO_PI); ctx.stroke(); }
      else if (beacon.kind === 'hold') { ctx.beginPath(); ctx.roundRect(-24, -24, 48, 48, 10); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 9, 0, TWO_PI); ctx.fill(); }
      else if (beacon.kind === 'hunt') { ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(21, 12); ctx.lineTo(-21, 12); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 7, 0, TWO_PI); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 0); ctx.lineTo(0, 18); ctx.lineTo(-18, 0); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 5, 0, TWO_PI); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(-21, 0); ctx.moveTo(21, 0); ctx.lineTo(28, 0); ctx.moveTo(0, -28); ctx.lineTo(0, -21); ctx.moveTo(0, 21); ctx.lineTo(0, 28); ctx.stroke(); if (charge > 0) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 36, -Math.PI / 2, -Math.PI / 2 + TWO_PI * charge); ctx.stroke(); } ctx.restore();
      drawMapLabel(`${def.name}→${objectiveChainPreview(beacon)}`, beacon.x, beacon.y - beacon.r - 38, def.color, .9);
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (!player) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    const a = player.angle ?? mouseAimAngle();
    ctx.rotate(a);
    ctx.scale(playerScale(), playerScale());
    const flicker = isPlayerProtected() && Math.sin(performance.now() * .05) > 0;
    const core = currentBuildCore();
    const coreColor = core.def?.color || '#37f6ff';
    ctx.globalAlpha = flicker ? .45 : 1;
    ctx.shadowColor = playerDamageCue ? '#ff4d6d' : dashTime > 0 ? '#ffd166' : core.id ? coreColor : '#37f6ff'; ctx.shadowBlur = playerDamageCue ? 22 : core.id ? 18 : 10;
    if (upgradesRuntime.railCharge > 0) {
      const cadence = Math.max(3, 7 - upgradesRuntime.railCharge);
      const railReady = (shotSeq + 1) % cadence === 0;
      ctx.shadowColor = railReady ? '#ffffff' : ctx.shadowColor;
      ctx.shadowBlur = railReady ? 26 : ctx.shadowBlur;
      if (railReady) { ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, -9); ctx.lineTo(30, 0); ctx.lineTo(12, 9); ctx.stroke(); }
    }
    const grad = ctx.createLinearGradient(-18, 0, 28, 0); grad.addColorStop(0, '#13213f'); grad.addColorStop(.45, core.id ? coreColor : '#37f6ff'); grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-22, -15); ctx.lineTo(-11, -4); ctx.lineTo(-24, 0); ctx.lineTo(-11, 4); ctx.lineTo(-22, 15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#eef7ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TWO_PI); ctx.fill();
    if (playerDamageCue) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 3; ctx.globalAlpha *= .72; ctx.beginPath(); ctx.arc(0, 0, 31, 0, TWO_PI); ctx.stroke(); ctx.globalAlpha = flicker ? .45 : 1; }
    const evasion = evasionSurgeActive();
    if (evasion) {
      const pulse = Math.sin(performance.now() * .012) * .5 + .5;
      ctx.strokeStyle = evasion.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha *= .74;
      ctx.setLineDash([7, 6]);
      ctx.beginPath(); ctx.arc(0, 0, 34 + pulse * 7, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = flicker ? .45 : 1;
    }
    const combat = combatSurgeActive();
    if (combat) {
      const pulse = Math.sin(performance.now() * .018) * .5 + .5;
      ctx.strokeStyle = combat.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha *= .72;
      ctx.shadowColor = combat.color;
      ctx.shadowBlur = 26;
      ctx.beginPath(); ctx.arc(0, 0, 38 + pulse * 9, 0, TWO_PI); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const a2 = i / 4 * TWO_PI + performance.now() * .006;
        ctx.beginPath(); ctx.moveTo(Math.cos(a2) * 23, Math.sin(a2) * 23); ctx.lineTo(Math.cos(a2) * (48 + pulse * 6), Math.sin(a2) * (48 + pulse * 6)); ctx.stroke();
      }
      ctx.globalAlpha = flicker ? .45 : 1;
    }
    ctx.fillStyle = '#ff3df2'; ctx.globalAlpha *= .82; ctx.beginPath(); ctx.moveTo(-23, -5); ctx.lineTo(-29 - Math.random() * 4, 0); ctx.lineTo(-23, 5); ctx.fill();
    ctx.restore();

  }

  function drawBuildAura() {
    if (!player) return;
    const top = topBuild();
    if (!top.def || top.score <= 0) return;
    const core = top.score >= BUILD_CORE_SCORE;
    const resonance = coreResonanceForCore(top, coreResonanceDefs);
    const overdrive = coreOverdriveActive();
    const color = overdrive?.color || resonance?.color || top.def.color || '#37f6ff';
    const t = performance.now() * .001;
    const pulse = Math.sin(t * 5.2) * .5 + .5;
    const r = 34 + Math.min(18, top.score * 1.8) + pulse * 2;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.globalAlpha = overdrive ? .88 : core ? .72 : .24;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = overdrive ? 28 : core ? 18 : 9;
    ctx.lineWidth = overdrive ? 3 : core ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TWO_PI);
    ctx.stroke();
    if (overdrive) {
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(0, 0, r + 18 + pulse * 8, 0, TWO_PI); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('OVERDRIVE', 0, -r - 24);
    } else if (resonance) {
      ctx.font = '900 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(resonance.name, 0, -r - 18);
    }
    if (top.id === 'rapid') {
      for (let i = 0; i < 6; i++) {
        const a = t * 3.8 + i / 6 * TWO_PI;
        ctx.beginPath(); ctx.arc(0, 0, r + 6, a, a + .28 + pulse * .08); ctx.stroke();
      }
    } else if (top.id === 'rail') {
      const a = player.angle ?? mouseAimAngle();
      ctx.rotate(a);
      ctx.globalAlpha = core ? .82 : .32;
      ctx.beginPath(); ctx.moveTo(20, -14); ctx.lineTo(58 + pulse * 12, 0); ctx.lineTo(20, 14); ctx.stroke();
      ctx.globalAlpha *= .5;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(86 + pulse * 18, 0); ctx.stroke();
    } else if (top.id === 'flak') {
      for (let i = -2; i <= 2; i++) { const a = (player.angle ?? mouseAimAngle()) + i * .32; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.lineTo(Math.cos(a) * (r + 20), Math.sin(a) * (r + 20)); ctx.stroke(); }
    } else if (top.id === 'plasma') {
      for (let i = 0; i < 4; i++) {
        const a = t * 2.2 + i / 4 * TWO_PI;
        const x = Math.cos(a) * (r + 4); const y = Math.sin(a) * (r + 4);
        const x2 = Math.cos(a + 1.45) * (r + 2); const y2 = Math.sin(a + 1.45) * (r + 2);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(0, 0, x2, y2); ctx.stroke();
      }
    } else if (top.id === 'seeker') {
      for (let i = 0; i < 8; i++) { const a = -t * 2.7 + i / 8 * TWO_PI; ctx.beginPath(); ctx.arc(Math.cos(a) * (r + 3), Math.sin(a) * (r + 3), core ? 3.2 : 2.1, 0, TWO_PI); ctx.fill(); }
    } else if (top.id === 'drone') {
      for (let i = 0; i < 3; i++) {
        const a = t * 2.9 + i / 3 * TWO_PI;
        const x = Math.cos(a) * (r + 9); const y = Math.sin(a) * (r + 9);
        ctx.beginPath(); ctx.roundRect(x - 5, y - 3.5, 10, 7, 3); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(Math.cos(a + .75) * (r + 3), Math.sin(a + .75) * (r + 3)); ctx.stroke();
      }
    } else if (top.id === 'burn') {
      for (let i = 0; i < 3; i++) { const a = t * 1.8 + i / 3 * TWO_PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 12), Math.sin(a) * (r - 12)); ctx.lineTo(Math.cos(a) * (r + 14), Math.sin(a) * (r + 14)); ctx.stroke(); }
    } else if (top.id === 'survival') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TWO_PI + Math.PI / 6; const rr = r + 6 + pulse * 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.stroke();
    } else if (top.id === 'economy') {
      ctx.setLineDash([4, 7]); ctx.beginPath(); ctx.arc(0, 0, r + 11 + pulse * 4, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 5; i++) { const a = t * 3 + i / 5 * TWO_PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2)); ctx.lineTo(Math.cos(a) * (r + 13), Math.sin(a) * (r + 13)); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawOrbitals() {
    if (!player || upgradesRuntime.orbitals <= 0) return;
    const count = Math.min(5, upgradesRuntime.orbitals + 1);
    for (let i = 0; i < count; i++) {
      const a = performance.now() * .003 + i / count * TWO_PI;
      const o = { x: player.x + Math.cos(a) * 44, y: player.y + Math.sin(a) * 44, r: 7 };
      ctx.save(); ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 9; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(o.x, o.y, 4.5 * visualScale(), 0, TWO_PI); ctx.fill(); ctx.restore();
      for (const e of enemies) if (!e.dead && dist2(o, e) < Math.pow(o.r + e.r, 2)) { e.hp -= .75 + upgradesRuntime.orbitals * .35; e.hit = .05; if (e.hp <= 0) killEnemy(e); }
    }
  }

  function drawBullets() {
    ctx.save();
    for (const b of bullets) {
      const a = Math.atan2(b.vy, b.vx);
      const color = b.trailColor || (b.homing ? '#ffd166' : '#37f6ff');
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.shadowColor = color;
      ctx.shadowBlur = b.core ? 24 : b.homing ? 20 : 15;
      if (b.type === 'rail') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.roundRect(-b.r * 2.4, -b.r * .42, b.r * 5.2, b.r * .84, b.r * .4); ctx.fill();
        ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 2; ctx.stroke();
      } else if (b.type === 'flak') {
        ctx.fillStyle = '#ffb36b';
        ctx.beginPath(); ctx.moveTo(b.r + 2, 0); ctx.lineTo(-b.r, b.r * .75); ctx.lineTo(-b.r * .45, 0); ctx.lineTo(-b.r, -b.r * .75); ctx.closePath(); ctx.fill();
      } else if (b.type === 'lance') {
        ctx.fillStyle = '#ff7a3d';
        ctx.beginPath(); ctx.roundRect(-b.r * 1.8, -b.r * .55, b.r * 3.9, b.r * 1.1, b.r * .5); ctx.fill();
        ctx.fillStyle = '#fff6c7'; ctx.beginPath(); ctx.arc(b.r * 1.3, 0, b.r * .45, 0, TWO_PI); ctx.fill();
      } else if (b.homing) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(b.r + 3, 0); ctx.lineTo(0, b.r + 2); ctx.lineTo(-b.r - 3, 0); ctx.lineTo(0, -b.r - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff6c7'; ctx.beginPath(); ctx.arc(2, 0, b.r * .42, 0, TWO_PI); ctx.fill();
      } else {
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TWO_PI); ctx.fill();
        if (b.core) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawEnemyShots() { ctx.save(); for (const s of enemyShots) { const sr = Math.max(2.5, s.r * visualScale()); ctx.shadowColor = s.type === 'meteor' ? '#ff7a3d' : '#ff3df2'; ctx.shadowBlur = s.type === 'meteor' ? 14 : 8; ctx.fillStyle = s.type === 'meteor' ? '#ffb36b' : '#ff9af8'; ctx.beginPath(); ctx.arc(s.x, s.y, sr, 0, TWO_PI); ctx.fill(); if (s.type === 'meteor') { ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = 1.5; ctx.stroke(); } } ctx.restore(); }

  function drawBossTelegraphs() {
    if (!bossTelegraphs.length) return;
    const now = performance.now() * .001;
    ctx.save();
    for (const t of bossTelegraphs) {
      const left = clamp(t.timer / t.duration, 0, 1);
      const p = 1 - left;
      const pulse = Math.sin((now + t.seed) * 9) * .5 + .5;
      const color = t.color || '#ff4d6d';
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.globalAlpha = .18 + left * .58;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      if (t.kind === 'charge') {
        const r = t.r * (.78 + p * .25 + pulse * .04);
        ctx.globalAlpha = .24 + left * .52;
        ctx.lineWidth = 3.2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO_PI); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const a = now * 2.4 + i / 4 * TWO_PI;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 18), Math.sin(a) * (r - 18)); ctx.lineTo(Math.cos(a) * (r + 18), Math.sin(a) * (r + 18)); ctx.stroke();
        }
        ctx.fillStyle = color; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('蓄力', 0, -r - 16);
      } else if (t.kind === 'meteor') {
        ctx.rotate(t.angle || 0);
        ctx.lineWidth = 2.2;
        ctx.setLineDash([11, 8]);
        ctx.beginPath(); ctx.moveTo(-118, 0); ctx.lineTo(118, 0); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = .25 + left * .46;
        ctx.beginPath(); ctx.ellipse(0, 0, t.r * (1.08 - p * .28), t.r * .42, 0, 0, TWO_PI); ctx.stroke();
        ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.arc(0, 0, t.r * .46, -Math.PI / 2, -Math.PI / 2 + TWO_PI * left); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.moveTo(0, -18); ctx.lineTo(0, 18); ctx.stroke();
      } else if (t.kind === 'summon' || t.kind === 'rift') {
        const r = t.r * (.72 + p * .34 + pulse * .05);
        ctx.globalAlpha = .20 + left * .48;
        ctx.lineWidth = t.kind === 'rift' ? 3.2 : 2.4;
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * .42, now * .8, 0, TWO_PI); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * .18, -r * .56); ctx.lineTo(r * .08, -r * .14); ctx.lineTo(-r * .06, r * .04); ctx.lineTo(r * .22, r * .52);
        ctx.stroke();
        ctx.globalAlpha *= .42;
        ctx.beginPath(); ctx.arc(0, 0, r * .78, 0, TWO_PI); ctx.fill();
      } else if (t.kind === 'pulse') {
        const r = t.r * (.74 + p * .34);
        const gap = t.gap || 0;
        const half = (t.gapWidth || .5) * .5;
        ctx.lineWidth = 4;
        ctx.globalAlpha = .28 + left * .54;
        ctx.beginPath(); ctx.arc(0, 0, r, gap + half, gap - half + TWO_PI); ctx.stroke();
        ctx.strokeStyle = '#4dff88'; ctx.shadowColor = '#4dff88'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(gap - half) * (r - 14), Math.sin(gap - half) * (r - 14));
        ctx.lineTo(Math.cos(gap - half) * (r + 22), Math.sin(gap - half) * (r + 22));
        ctx.moveTo(Math.cos(gap + half) * (r - 14), Math.sin(gap + half) * (r - 14));
        ctx.lineTo(Math.cos(gap + half) * (r + 22), Math.sin(gap + half) * (r + 22));
        ctx.stroke();
        ctx.fillStyle = '#4dff88'; ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('安全縫', Math.cos(gap) * (r + 34), Math.sin(gap) * (r + 34));
      } else if (t.kind === 'counter') {
        const r = t.r * (.82 + p * .62);
        ctx.strokeStyle = '#4dff88'; ctx.shadowColor = '#4dff88'; ctx.lineWidth = 3;
        ctx.globalAlpha = left;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO_PI); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * .56, 0, TWO_PI); ctx.stroke();
        ctx.fillStyle = '#4dff88'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('COUNTER', 0, -r - 12);
      } else if (t.kind === 'phase') {
        const r = t.r * (.62 + p * .78);
        ctx.strokeStyle = color; ctx.shadowColor = color; ctx.lineWidth = 4;
        ctx.globalAlpha = .36 + left * .54;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO_PI); ctx.stroke();
        ctx.setLineDash([12, 9]);
        ctx.beginPath(); ctx.arc(0, 0, r * .68, -now * 1.3, TWO_PI - now * 1.3); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#fff1c7'; ctx.font = '950 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('PHASE 2', 0, -r - 16);
      } else if (t.kind === 'shatter') {
        const r = t.r * (.65 + p * .75);
        ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.lineWidth = 3.2;
        ctx.globalAlpha = left;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TWO_PI); ctx.stroke();
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * TWO_PI + now * .6;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r * .62), Math.sin(a) * (r * .62)); ctx.lineTo(Math.cos(a) * (r + 24), Math.sin(a) * (r + 24)); ctx.stroke();
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEnemies() {
    ctx.save();
    for (const e of enemies) {
      const ed = player ? Math.hypot(player.x - e.x, player.y - e.y) : Infinity;
      const ev = e.type === 'boss' ? Math.max(.72, visualScale()) : visualScale();
      const er = Math.max(4, e.r * ev);
      const dense = enemies.length > 26;
      if (e.type === 'leech' && ed < 210) {
        ctx.save();
        ctx.globalAlpha = clamp(1 - ed / 230, .12, .68);
        ctx.strokeStyle = '#b66dff'; ctx.lineWidth = 2.5; ctx.shadowColor = '#b66dff'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
        ctx.restore();
      }
      if (e.type === 'shieldSat') {
        ctx.save(); ctx.globalAlpha = .24; ctx.strokeStyle = '#7aa7ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
        for (const ally of enemies) if (!ally.dead && ally !== e && ally.shield > 0 && Math.hypot(ally.x - e.x, ally.y - e.y) < 190) { ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ally.x, ally.y); ctx.stroke(); }
        ctx.restore();
      }
      if (e.type === 'shooter' && e.shootClock < .48 && ed < 620) {
        ctx.save();
        const alpha = clamp(1 - e.shootClock / .48, .12, .72);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ff9af8'; ctx.lineWidth = 2; ctx.setLineDash([8, 7]); ctx.shadowColor = '#ff3df2'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(player.x, player.y); ctx.stroke();
        ctx.restore();
      }
      if (e.type === 'sprinter' && (e.telegraph > 0 || e.dashTime > 0)) {
        ctx.save();
        const a = e.dashTime > 0 ? e.dashA : Math.atan2(player.y - e.y, player.x - e.x);
        ctx.globalAlpha = e.dashTime > 0 ? .56 : .32;
        ctx.strokeStyle = '#ffb36b'; ctx.lineWidth = e.dashTime > 0 ? 4 : 2; ctx.setLineDash(e.dashTime > 0 ? [] : [9, 8]); ctx.shadowColor = '#ff7a3d'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 145, e.y + Math.sin(a) * 145); ctx.stroke();
        ctx.restore();
      }
      if (e.type === 'bomber' && e.detonate > 0) {
        ctx.save();
        const p = clamp(1 - e.detonate / 1.05, 0, 1);
        ctx.globalAlpha = .24 + p * .38;
        ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = 2 + p * 2; ctx.shadowColor = '#ff7a3d'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(e.x, e.y, 128 * visualScale(), 0, TWO_PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.x - 15, e.y); ctx.lineTo(e.x + 15, e.y); ctx.moveTo(e.x, e.y - 15); ctx.lineTo(e.x, e.y + 15); ctx.stroke();
        ctx.restore();
      }
      if (e.type === 'tank' && (e.telegraph > 0 || e.ramTime > 0)) {
        ctx.save();
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        ctx.globalAlpha = e.ramTime > 0 ? .46 : .24; ctx.strokeStyle = '#ffcf7a'; ctx.lineWidth = e.ramTime > 0 ? 4 : 2; ctx.setLineDash(e.ramTime > 0 ? [] : [7, 7]);
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 92, e.y + Math.sin(a) * 92); ctx.stroke();
        ctx.restore();
      }
      if (e.elite?.id === 'accelerator') {
        ctx.save(); ctx.globalAlpha = .16; ctx.strokeStyle = '#4dff88'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 165 * visualScale(), 0, TWO_PI); ctx.stroke(); ctx.restore();
      }
      if (e.breakWindow) {
        const p = clamp(e.breakWindow.progress / e.breakWindow.threshold, 0, 1);
        ctx.save();
        ctx.globalAlpha = .28 + p * .42;
        ctx.strokeStyle = e.breakWindow.color || e.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = e.breakWindow.color || e.color;
        ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.arc(e.x, e.y, er + 16 + Math.sin(performance.now() * .01) * 4, 0, TWO_PI); ctx.stroke();
        ctx.strokeStyle = '#fff1c7'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(e.x, e.y, er + 22, -Math.PI / 2, -Math.PI / 2 + TWO_PI * p); ctx.stroke();
        ctx.restore();
      }
      if (e.bossKey) {
        ctx.save();
        ctx.globalAlpha = .52 + Math.sin(performance.now() * .012) * .18;
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2.5; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(e.x, e.y, er + 10, 0, TWO_PI); ctx.stroke();
        ctx.fillStyle = '#ffd166'; ctx.font = `900 ${Math.max(12, er * .95)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', e.x, e.y - er - 14);
        ctx.restore();
      }
      if (e.routeConsequence) {
        ctx.save();
        const rcColor = e.routeConsequence.color || '#ff3df2';
        ctx.globalAlpha = .6 + Math.sin(performance.now() * .01) * .2;
        ctx.strokeStyle = rcColor; ctx.lineWidth = 3; ctx.shadowColor = rcColor; ctx.shadowBlur = 18;
        ctx.setLineDash([7, 5]);
        ctx.beginPath(); ctx.arc(e.x, e.y, er + 16, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = rcColor; ctx.font = `900 ${Math.max(12, er * .82)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('賞', e.x, e.y - er - 16);
        ctx.restore();
      }
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(performance.now() * .001 * e.spin);
      ctx.shadowColor = e.color; ctx.shadowBlur = e.hit > 0 ? 20 : 9; ctx.fillStyle = e.hit > 0 ? '#fff' : e.color;
      if (e.type === 'bomber' && ed < 150) { ctx.shadowColor = '#ff7a3d'; ctx.shadowBlur = 22; ctx.globalAlpha = .62 + Math.sin(performance.now() * .024) * .28; }
      if (e.type === 'shieldSat') { ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, er + 7 + Math.sin(performance.now() * .006) * 2, 0, TWO_PI); ctx.stroke(); }
      if (e.burn > 0) { ctx.shadowColor = '#ff7a3d'; ctx.shadowBlur = 20; }
      if (e.elite || e.phase2) { ctx.strokeStyle = e.elite?.color || '#ff4d6d'; ctx.lineWidth = 2; ctx.globalAlpha = .32 + Math.sin(performance.now() * .006) * .12; ctx.beginPath(); ctx.arc(0, 0, er + 3, 0, TWO_PI); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.beginPath();
      for (let i = 0; i < e.sides * 2; i++) { const a = i / (e.sides * 2) * TWO_PI; const r = i % 2 ? er * .66 : er; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
      if (e.type === 'bomber' && ed < 160) { ctx.strokeStyle = '#fff1c7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-er * .55, 0); ctx.lineTo(er * .55, 0); ctx.moveTo(0, -er * .55); ctx.lineTo(0, er * .55); ctx.stroke(); }
      if (e.shield > 0) { ctx.strokeStyle = '#7aa7ff'; ctx.globalAlpha = .75; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, er + 5, 0, TWO_PI); ctx.stroke(); ctx.globalAlpha = 1; }
      const glyph = e.elite ? eliteGlyphs[e.elite.id] : enemyGlyphs[e.type];
      if (glyph && (e.elite || e.type === 'leech' || e.type === 'bomber' || e.type === 'shieldSat' || e.type === 'tank')) {
        ctx.fillStyle = '#050712'; ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.lineWidth = 2; ctx.font = `900 ${Math.max(10, er * .9)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeText(glyph, 0, 1); ctx.fillText(glyph, 0, 1);
      }
      ctx.restore();
      const showHp = e.type === 'boss' || e.elite || e.hit > 0 || (!dense && ed < 420);
      if (showHp) {
        ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(e.x - er, e.y - er - 7, er * 2, 2);
        ctx.fillStyle = e.type === 'boss' ? '#ff4d6d' : '#4dff88'; ctx.fillRect(e.x - er, e.y - er - 7, er * 2 * clamp(e.hp / e.maxHp, 0, 1), 2);
      }
    }
    ctx.restore();
  }

  function drawShards() {
    ctx.save();
    for (const s of shards) {
      const sr = Math.max(2.5, s.r * visualScale());
      const mag = clamp(s.magnet || 0, 0, 1);
      if (mag > .08) {
        ctx.globalAlpha = .18 + mag * .36;
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.2;
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(s.x, s.y, sr + 5 + mag * 10, 0, TWO_PI);
        ctx.stroke();
      }
      ctx.globalAlpha = .86 + mag * .14;
      ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8 + mag * 12; ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(s.x, s.y - sr); ctx.lineTo(s.x + sr, s.y); ctx.lineTo(s.x, s.y + sr); ctx.lineTo(s.x - sr, s.y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawPowerups() {
    const colors = { heal: '#4dff88', nova: '#ffd166', rapid: '#37f6ff' };
    const glyph = { heal: '+', nova: '✦', rapid: '⚡' };
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 17px system-ui';
    for (const p of powerups) {
      const pr = Math.max(7, p.r * visualScale());
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.shadowColor = colors[p.kind]; ctx.shadowBlur = 10; ctx.fillStyle = colors[p.kind]; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TWO_PI); ctx.fill(); ctx.fillStyle = '#050712'; ctx.fillText(glyph[p.kind], 0, 1); ctx.restore();
      const label = powerupLabel(p.kind);
      drawMapLabel(label.text, p.x, p.y - pr - 17, label.color, .94);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) {
      const alpha = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.ring ? 3 : p.kind === 'spark' ? 14 : 8;
      ctx.beginPath();
      if (p.ring) {
        ctx.lineWidth = p.fastRing ? 2 : 1;
        ctx.arc(p.x, p.y, Math.min(p.r, (p.fastRing ? 34 : 26) * visualScale()), 0, TWO_PI);
        ctx.stroke();
      } else if (p.kind === 'spark' || p.kind === 'pickupTrail') {
        const a = Math.atan2(p.vy, p.vx);
        const len = (p.len || 12) * visualScale();
        ctx.lineWidth = Math.max(1, (p.kind === 'pickupTrail' ? 1.3 : 1.8) * visualScale());
        ctx.moveTo(p.x - Math.cos(a) * len * .45, p.y - Math.sin(a) * len * .45);
        ctx.lineTo(p.x + Math.cos(a) * len * .55, p.y + Math.sin(a) * len * .55);
        ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, p.r * visualScale(), 0, TWO_PI);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 14px system-ui';
    for (const t of floatText) { ctx.globalAlpha = clamp(t.life / t.max, 0, 1); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
    ctx.restore();
  }

  function drawMission() {
    ctx.save();
    const tutorialStep = currentTutorialStep();
    const hasTutorial = !!tutorialStep;
    const hasTactic = !!activeTactic && !bossActive;
    const hasObjective = !!beacon;
    const routeNodes = worldFeatures.filter(f => f.type === 'routeChoice' && !f.dead);
    const hasRouteChoice = routeNodes.length > 0;
    const routeConsequenceTarget = activeRouteConsequenceTarget();
    const routeConsequenceState = activeRouteConsequences.find(c => c.status === 'active');
    const hasRouteConsequence = !!routeConsequenceTarget || !!routeConsequenceState;
    const bossPrep = routeBossPrepEffects();
    const hasBossPrep = bossPrep.count > 0;
    const boss = currentBoss();
    const bossWindow = boss?.breakWindow;
    const hasBoss = !!boss && bossActive;
    const stage = runStageForWave(wave);
    const resonance = currentCoreResonance();
    const compactMission = controlMode === 'touch' || W < 640;
    if (compactMission) {
      const x = 8; const y = 104; const w = Math.min(W - 16, 330);
      const h = 42;
      const zone = currentZone();
      const progress = mission ? clamp(mission.check() / mission.target, 0, 1) : 0;
      const anomaly = currentAnomaly();
      const changed = updateMissionHudSignature(currentMissionHudSignature(), 3.2);
      const hudAlpha = missionHudAlpha(changed);
      ctx.globalAlpha = .76 * hudAlpha; ctx.fillStyle = 'rgba(5,7,18,.52)'; ctx.strokeStyle = mission?.done ? '#4dff88' : anomaly.color || '#ffd166'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 9); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = hudAlpha;
      let detail = `節奏 ${stage.name}`;
      let color = stage.color || '#bdfcff';
      if (activeEvent) { detail = `事件 ${activeEvent.name}｜${Math.ceil(eventTimer)}s`; color = activeEvent.color; }
      else if (activeBossBreak) { detail = `Boss破防 ${activeBossBreak.name}｜${Math.ceil(activeBossBreak.timer)}s`; color = activeBossBreak.color; }
      else if (activeBossRhythm) { detail = `Boss節奏 ${activeBossRhythm.name}｜${Math.ceil(activeBossRhythm.timer)}s`; color = activeBossRhythm.color; }
      else if (bossWindow) { detail = `Boss讀題 ${bossWindow.source}｜破招 ${Math.ceil(bossWindow.timer)}s`; color = bossWindow.color; }
      else if (hasBoss) { detail = `Boss ${boss.label}${boss.phase2 ? '｜二階段' : ''}｜${(boss.bossModifier || currentBossModifier()).name}`; color = boss.color; }
      else if (activeTacticBreak) { detail = `破解 ${activeTacticBreak.name}｜${Math.ceil(activeTacticBreak.timer)}s`; color = activeTacticBreak.color; }
      else if (activeCoreTrial) { detail = `試煉 ${activeCoreTrial.name}｜${activeCoreTrial.progress}/${activeCoreTrial.target}｜${Math.ceil(activeCoreTrial.timer)}s`; color = activeCoreTrial.color; }
      else if (activeCoreOverdrive) { detail = `核心超載 ${activeCoreOverdrive.name}｜${Math.ceil(activeCoreOverdrive.timer)}s`; color = activeCoreOverdrive.color; }
      else if (activeCombatSurge) { detail = `擊破爆發 x${activeCombatSurge.combo}｜${Math.ceil(activeCombatSurge.timer)}s`; color = activeCombatSurge.color; }
      else if (resonance) { detail = `核心諧振 ${resonance.name}｜${resonance.desc}`; color = resonance.color; }
      else if (activeEvasionSurge) { detail = `擦彈機動 ${activeEvasionSurge.name}｜${Math.ceil(activeEvasionSurge.timer)}s`; color = activeEvasionSurge.color; }
      else if (activeTempoBoost) { detail = `加成 ${activeTempoBoost.name}｜${Math.ceil(activeTempoBoost.timer)}s`; color = activeTempoBoost.color; }
      else if (hasTactic) { detail = `戰術 ${activeTactic.name}｜${tacticCounterText(activeTactic)}`; color = activeTactic.color || '#ffd166'; }
      else if (hasRouteChoice) {
        const names = routeChoiceOffer?.pair?.map(id => routeChoiceDefs[id]?.name).filter(Boolean).join(' vs ') || '路線抉擇';
        detail = `抉擇 ${names}｜靠近一個節點充能`;
        color = routeNodes[0].routeChoice?.color || '#bdfcff';
      }
      else if (hasRouteConsequence) {
        const state = routeConsequenceState || routeConsequenceTarget?.routeConsequence;
        detail = `後果 ${state?.choiceName || '路線'}→${state?.title || routeConsequenceTarget?.routeConsequence?.name || '任務'}｜${state?.def?.action || '完成路線後果'}`;
        color = state?.color || routeConsequenceTarget?.routeConsequence?.color || '#ffd166';
      }
      else if (hasBossPrep) { detail = `Boss預備 ${bossPrep.name}｜${bossPrep.tag}`; color = bossPrep.color || '#ffd166'; }
      else if (beacon) {
        const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
        detail = `目標 ${def.name}→${objectiveChainPreview(beacon)}｜${objectiveSideText(beacon)}${objectiveSideComplete(beacon) ? ' ★' : ''}`;
        color = def.color;
      }
      if (hasTutorial && !activeEvent && !activeBossBreak && !hasBoss && !activeTacticBreak && !activeCoreTrial && !activeCoreOverdrive && !activeCombatSurge && !resonance && !activeEvasionSurge && !activeTempoBoost && !hasTactic && !hasBossPrep && !beacon) {
        const tp = tutorialProgress(tutorialStep);
        detail = `教學 ${tutorialStep.label}｜${tp.value}/${tp.target}`;
        color = '#bdfcff';
      }
      const missionLabel = mission?.done ? '任務完成' : (mission?.text || '任務');
      const routeLabel = hasRouteConsequence ? `｜後果 ${activeRouteConsequenceLabel()}` : hasBossPrep ? `｜Boss預備 ${bossPrep.name}` : activeRouteChoices.length ? `｜路線 ${currentRouteChoice().name}` : routeChoiceOffer ? '｜抉擇中' : '';
      ctx.fillStyle = mission?.done ? '#4dff88' : '#ffd166'; ctx.font = '900 9px system-ui';
      ctx.fillText(`${missionLabel}｜${zone.name || '星環'}｜${currentContract().name}${routeLabel}`, x + 7, y + 15, w - 14);
      ctx.fillStyle = anomaly.color || '#ffd166'; ctx.font = '800 9px system-ui';
      ctx.fillText(`異變 ${anomalyTaskText()}｜${detail}`, x + 7, y + 30, w - 14);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 7, y + h - 6, w - 14, 2);
      ctx.fillStyle = mission?.done ? '#4dff88' : '#37f6ff'; ctx.fillRect(x + 7, y + h - 6, (w - 14) * progress, 2);
      if (activeEvent) {
        ctx.fillStyle = activeEvent.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(eventTimer / 30, 0, 1), 2);
      } else if (activeBossBreak) {
        ctx.fillStyle = activeBossBreak.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeBossBreak.timer / activeBossBreak.duration, 0, 1), 2);
      } else if (activeBossRhythm) {
        ctx.fillStyle = activeBossRhythm.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeBossRhythm.timer / activeBossRhythm.duration, 0, 1), 2);
      } else if (bossWindow) {
        ctx.fillStyle = bossWindow.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(bossWindow.progress / bossWindow.threshold, 0, 1), 2);
      } else if (activeTacticBreak) {
        ctx.fillStyle = activeTacticBreak.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeTacticBreak.timer / activeTacticBreak.duration, 0, 1), 2);
      } else if (activeCoreTrial) {
        ctx.fillStyle = activeCoreTrial.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeCoreTrial.progress / Math.max(1, activeCoreTrial.target), 0, 1), 2);
      } else if (activeCoreOverdrive) {
        ctx.fillStyle = activeCoreOverdrive.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeCoreOverdrive.timer / activeCoreOverdrive.duration, 0, 1), 2);
      } else if (activeCombatSurge) {
        ctx.fillStyle = activeCombatSurge.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeCombatSurge.timer / activeCombatSurge.duration, 0, 1), 2);
      } else if (resonance) {
        ctx.fillStyle = resonance.color; ctx.fillRect(x + 7, y + h - 3, w - 14, 2);
      } else if (activeEvasionSurge) {
        ctx.fillStyle = activeEvasionSurge.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeEvasionSurge.timer / activeEvasionSurge.duration, 0, 1), 2);
      } else if (activeTempoBoost) {
        ctx.fillStyle = activeTempoBoost.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * clamp(activeTempoBoost.timer / activeTempoBoost.duration, 0, 1), 2);
      } else if (hasRouteConsequence) {
        const target = routeConsequenceTarget;
        const state = routeConsequenceState || target?.routeConsequence;
        const def = state?.def || routeConsequenceDef(target?.choiceId || target?.routeConsequence?.choiceId);
        const pct = target?.type === 'routeConsequence' ? clamp((target.charge || 0) / (target.chargeNeed || def.chargeNeed || 2.6), 0, 1) : target?.routeConsequence ? 1 - clamp(target.hp / Math.max(1, target.maxHp || 1), 0, 1) : 0;
        ctx.fillStyle = state?.color || def.color || '#ffd166'; ctx.fillRect(x + 7, y + h - 3, (w - 14) * pct, 2);
      } else if (hasBossPrep) {
        ctx.fillStyle = bossPrep.color || '#ffd166'; ctx.fillRect(x + 7, y + h - 3, w - 14, 2);
      } else if (beacon) {
        const sidePct = clamp(objectiveSideProgress(beacon) / objectiveSideGoal(beacon), 0, 1);
        const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
        ctx.fillStyle = objectiveSideComplete(beacon) ? '#4dff88' : def.color; ctx.fillRect(x + 7, y + h - 3, (w - 14) * sidePct, 2);
      }
      ctx.restore();
      return;
    }
    const x = 12; const y = 112; const w = Math.min(336, W - 24);
    const h = 166 + (activeEvent ? 24 : 0) + (activeTempoBoost ? 24 : 0) + (activeCoreTrial ? 24 : 0) + (activeCoreOverdrive ? 24 : 0) + (activeCombatSurge ? 24 : 0) + (!activeCoreOverdrive && resonance ? 24 : 0) + (activeEvasionSurge ? 24 : 0) + (activeTacticBreak ? 24 : 0) + (activeBossBreak ? 24 : 0) + (activeBossRhythm ? 24 : 0) + (hasBoss ? 52 : 0) + (hasTactic ? 42 : 0) + (hasRouteConsequence ? 36 : 0) + (!hasRouteConsequence && hasBossPrep ? 30 : 0) + (hasObjective ? 32 : 0) + (hasTutorial ? 42 : 0);
    ctx.globalAlpha = .86; ctx.fillStyle = 'rgba(5,7,18,.58)'; ctx.strokeStyle = mission?.done ? '#4dff88' : boss?.color || activeTactic?.color || '#ffd166'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 11); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = mission?.done ? '#4dff88' : '#ffd166'; ctx.font = '800 11px system-ui'; ctx.fillText(mission?.done ? '任務完成' : mission?.text || '任務載入中', x + 10, y + 19, w - 112);
    const zone = currentZone();
    ctx.textAlign = 'right'; ctx.fillStyle = zone.color || '#37f6ff'; ctx.fillText(zone.name || '標準星環', x + w - 10, y + 19, 96); ctx.textAlign = 'left';
    const progress = mission ? clamp(mission.check() / mission.target, 0, 1) : 0;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, y + 30, w - 20, 4); ctx.fillStyle = mission?.done ? '#4dff88' : '#37f6ff'; ctx.fillRect(x + 10, y + 30, (w - 20) * progress, 4);
    if (isPlayerProtected() && runTime < 5) {
      const shieldLeft = Math.max(player.invuln, 3.5 - runTime);
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 11px system-ui';
      ctx.fillText(`新手護盾 ${Math.ceil(shieldLeft)}s`, x + 10, y + h + 18);
    }
    let lineY = y + 52;
    ctx.fillStyle = stage.color || '#ffd166'; ctx.font = '900 11px system-ui';
    ctx.fillText(`P1 節奏｜${stage.name} ${stage.waves}`, x + 10, lineY, w - 20);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(stage.desc || '星環節奏穩定。', x + 10, lineY + 15, w - 20);
    lineY += 26;
    const anomaly = currentAnomaly();
    ctx.fillStyle = anomaly.color || '#ffd166'; ctx.font = '900 11px system-ui';
    ctx.fillText(`P1 異變｜${anomaly.name}`, x + 10, lineY, w - 20);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(`${anomaly.tag || anomaly.desc || '本局規則'}｜${anomalyTaskText()}`, x + 10, lineY + 15, w - 20);
    lineY += 26;
    const contract = currentContract();
    ctx.fillStyle = contract.color || '#bdfcff'; ctx.font = '900 11px system-ui';
    ctx.fillText(`P1 ${contract.kind}｜${contract.name}`, x + 10, lineY, w - 20);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(contract.tag || contract.desc || '本局委託', x + 10, lineY + 15, w - 20);
    lineY += 26;
    const route = routeChoiceEffects();
    const routeStatus = routeChoiceOffer ? `抉擇中｜${routeChoiceOffer.pair.map(id => routeChoiceDefs[id]?.name).filter(Boolean).join(' vs ')}` : routeChoiceTitle();
    ctx.fillStyle = route.color || '#bdfcff'; ctx.font = '900 11px system-ui';
    ctx.fillText(`P1 路線｜${routeStatus}`, x + 10, lineY, w - 20);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(activeRouteChoices.length ? route.tag : '第 2/4 波靠近一個節點充能，另一個會消失。', x + 10, lineY + 15, w - 20);
    lineY += 26;
    if (hasRouteConsequence) {
      const state = routeConsequenceState || routeConsequenceTarget?.routeConsequence;
      const def = state?.def || routeConsequenceDef(routeConsequenceTarget?.choiceId || routeConsequenceTarget?.routeConsequence?.choiceId);
      const pct = routeConsequenceTarget?.type === 'routeConsequence'
        ? clamp((routeConsequenceTarget.charge || 0) / (routeConsequenceTarget.chargeNeed || def.chargeNeed || 2.6), 0, 1)
        : routeConsequenceTarget?.routeConsequence ? 1 - clamp(routeConsequenceTarget.hp / Math.max(1, routeConsequenceTarget.maxHp || 1), 0, 1) : 0;
      ctx.fillStyle = state?.color || def.color || '#ffd166'; ctx.font = '900 11px system-ui';
      ctx.fillText(`P1 後果｜${state?.choiceName || '路線'} → ${state?.title || def.title}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(def.action || def.tag || '完成後果任務', x + 10, lineY + 15, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 21, w - 20, 3);
      ctx.fillStyle = state?.color || def.color || '#ffd166'; ctx.fillRect(x + 10, lineY + 21, (w - 20) * pct, 3);
      lineY += 36;
    }
    if (!hasRouteConsequence && hasBossPrep) {
      ctx.fillStyle = bossPrep.color || '#ffd166'; ctx.font = '900 11px system-ui';
      ctx.fillText(`P1 Boss預備｜${bossPrep.name}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(bossPrep.tag || '完成後果後，下一個 Boss 會帶入預備收益。', x + 10, lineY + 15, w - 20);
      lineY += 30;
    }
    if (activeEvent) {
      ctx.fillStyle = activeEvent.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 事件｜${activeEvent.name} ${Math.ceil(eventTimer)}s`, x + 10, lineY);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeEvent.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(eventTimer / 30, 0, 1), 4);
      lineY += 24;
    }
    if (activeTempoBoost) {
      ctx.fillStyle = activeTempoBoost.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 加成｜${activeTempoBoost.name} ${Math.ceil(activeTempoBoost.timer)}s`, x + 10, lineY);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeTempoBoost.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeTempoBoost.timer / activeTempoBoost.duration, 0, 1), 4);
      lineY += 24;
    }
    if (activeCoreTrial) {
      ctx.fillStyle = activeCoreTrial.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 核心試煉｜${activeCoreTrial.name} ${Math.ceil(activeCoreTrial.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeCoreTrial.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeCoreTrial.progress / Math.max(1, activeCoreTrial.target), 0, 1), 4);
      ctx.fillStyle = 'rgba(238,247,255,.72)'; ctx.font = '800 10px system-ui';
      ctx.fillText(`${activeCoreTrial.verb} ${activeCoreTrial.progress}/${activeCoreTrial.target}`, x + 10, lineY + 19, w - 20);
      lineY += 24;
    }
    if (activeCoreOverdrive) {
      ctx.fillStyle = activeCoreOverdrive.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 核心超載｜${activeCoreOverdrive.name} ${Math.ceil(activeCoreOverdrive.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeCoreOverdrive.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeCoreOverdrive.timer / activeCoreOverdrive.duration, 0, 1), 4);
      lineY += 24;
    } else if (resonance) {
      ctx.fillStyle = resonance.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 核心諧振｜${resonance.name}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(resonance.desc, x + 10, lineY + 15, w - 20);
      lineY += 24;
    }
    if (activeCombatSurge) {
      ctx.fillStyle = activeCombatSurge.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 擊破爆發｜x${activeCombatSurge.combo} ${Math.ceil(activeCombatSurge.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeCombatSurge.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeCombatSurge.timer / activeCombatSurge.duration, 0, 1), 4);
      lineY += 24;
    }
    if (activeEvasionSurge) {
      ctx.fillStyle = activeEvasionSurge.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 擦彈機動｜${activeEvasionSurge.name} ${Math.ceil(activeEvasionSurge.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeEvasionSurge.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeEvasionSurge.timer / activeEvasionSurge.duration, 0, 1), 4);
      lineY += 24;
    }
    if (activeTacticBreak) {
      ctx.fillStyle = activeTacticBreak.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 破解｜${activeTacticBreak.name} ${Math.ceil(activeTacticBreak.timer)}s`, x + 10, lineY);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeTacticBreak.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeTacticBreak.timer / activeTacticBreak.duration, 0, 1), 4);
      lineY += 24;
    }
    if (activeBossBreak) {
      ctx.fillStyle = activeBossBreak.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 Boss破防｜${activeBossBreak.name} ${Math.ceil(activeBossBreak.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeBossBreak.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeBossBreak.timer / activeBossBreak.duration, 0, 1), 4);
      lineY += 24;
    }
    if (activeBossRhythm) {
      ctx.fillStyle = activeBossRhythm.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 Boss節奏｜${activeBossRhythm.name} ${Math.ceil(activeBossRhythm.timer)}s`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeBossRhythm.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(activeBossRhythm.timer / activeBossRhythm.duration, 0, 1), 4);
      lineY += 24;
    }
    if (hasBoss) {
      const info = bossReadInfo(boss);
      const modifier = boss.bossModifier || currentBossModifier();
      ctx.fillStyle = boss.color || '#ff4d6d'; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 Boss｜${boss.label}${boss.phase2 ? '｜二階段' : ''}｜${modifier.name}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(`反制：${bossWindow?.counter || info.counter || info.intro}`, x + 10, lineY + 15, w - 20);
      if (bossWindow) {
        const pct = clamp(bossWindow.progress / bossWindow.threshold, 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 23, w - 20, 4);
        ctx.fillStyle = bossWindow.color; ctx.fillRect(x + 10, lineY + 23, (w - 20) * pct, 4);
        ctx.fillStyle = 'rgba(238,247,255,.68)'; ctx.fillText(`破招窗口：${bossWindow.name}｜${Math.ceil(bossWindow.timer)}s`, x + 10, lineY + 40, w - 20);
      } else {
        ctx.fillStyle = 'rgba(238,247,255,.62)'; ctx.fillText(`讀題：${info.breakHint || '等 Boss 出招後集中火力。'}`, x + 10, lineY + 30, w - 20);
      }
      lineY += 52;
    }
    if (hasTactic) {
      ctx.fillStyle = activeTactic.color || '#ffd166'; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 戰術｜${activeTactic.name}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(`反制：${tacticCounterText(activeTactic)}`, x + 10, lineY + 15, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.62)';
      ctx.fillText(activeTactic.desc || '敵群正在形成組合壓力。', x + 10, lineY + 28, w - 20);
      lineY += 42;
    }
    if (beacon) {
      const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
      const preview = eventDefs[beacon.previewEvent]?.name || '未知事件';
      const boost = tempoProfile(beacon.previewEvent).name || '戰術餘波';
      const sidePct = clamp(objectiveSideProgress(beacon) / objectiveSideGoal(beacon), 0, 1);
      ctx.fillStyle = def.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P3 目標｜${def.name} → ${preview} → ${boost}`, x + 10, lineY, w - 20);
      ctx.fillStyle = objectiveSideComplete(beacon) ? '#4dff88' : 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(`副條件：${objectiveSideText(beacon)}${objectiveSideComplete(beacon) ? ' ★' : ''}`, x + 10, lineY + 15, w - 20);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 21, w - 20, 3);
      ctx.fillStyle = objectiveSideComplete(beacon) ? '#4dff88' : def.color; ctx.fillRect(x + 10, lineY + 21, (w - 20) * sidePct, 3);
      lineY += 32;
    }
    if (hasTutorial) {
      const tp = tutorialProgress(tutorialStep);
      const ty = lineY + 10;
      ctx.fillStyle = '#bdfcff';
      ctx.font = '900 11px system-ui';
      ctx.fillText(`新手 ${tutorialRun.step + 1}/${tutorialDefs.length}｜${tutorialStep.label}`, x + 10, ty);
      ctx.fillStyle = 'rgba(238,247,255,.82)';
      ctx.font = '800 10px system-ui';
      ctx.fillText(tutorialStep.text, x + 10, ty + 15);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(x + 10, ty + 23, w - 20, 4);
      ctx.fillStyle = '#bdfcff';
      ctx.fillRect(x + 10, ty + 23, (w - 20) * tp.pct, 4);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(`${tp.value}/${tp.target}`, x + w - 48, ty);
    }
    ctx.restore();
  }

  function drawTargetGuide() {
    if (!player || !running || gameOver) return;
    const routeTarget = worldFeatures.find(f => f.type === 'routeChoice' && !f.dead);
    const consequenceTarget = activeRouteConsequenceTarget();
    const target = routeTarget || consequenceTarget || beacon;
    if (!target) return;
    const isRoute = target.type === 'routeChoice';
    const isConsequence = target.type === 'routeConsequence' || !!target.routeConsequence;
    const c = camera();
    const sx = target.x - c.x;
    const sy = target.y - c.y;
    const d = Math.hypot(target.x - player.x, target.y - player.y);
    const state = isConsequence ? (target.routeConsequence?.def ? target.routeConsequence : activeRouteConsequences.find(rc => rc.id === (target.routeConsequence?.id || target.consequenceId))) : null;
    const def = isRoute ? (target.routeChoice || routeChoiceDefs[target.choiceId] || neutralRouteChoice) : isConsequence ? (state?.def || routeConsequenceDef(target.choiceId || target.routeConsequence?.choiceId)) : (objectiveDefs[target.kind] || objectiveDefs.scan);
    const color = def.color || target.routeConsequence?.color || '#bdfcff';
    const inside = sx > 46 && sx < W - 46 && sy > 92 && sy < H - 46;
    const pulse = .55 + Math.sin(performance.now() * .006) * .22;
    const charge = isRoute ? clamp((target.charge || 0) / (target.chargeNeed || 1.75), 0, 1) : isConsequence ? clamp((target.charge || 0) / (target.chargeNeed || def.chargeNeed || 2.6), 0, 1) : clamp((beacon.charge || 0) / def.charge, 0, 1);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = isRoute || isConsequence ? 18 : 14;
    if (inside) {
      ctx.globalAlpha = .42 + pulse * .36;
      ctx.strokeStyle = color; ctx.lineWidth = isRoute || isConsequence ? 2.6 : 2;
      ctx.beginPath(); ctx.arc(sx, sy, (isRoute || isConsequence ? 44 : 32) + pulse * 7, 0, TWO_PI); ctx.stroke();
      if (isRoute || isConsequence) { ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(sx, sy, 58 + pulse * 6, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]); }
      if (charge > 0) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, isRoute || isConsequence ? 62 : 44, -Math.PI / 2, -Math.PI / 2 + TWO_PI * charge); ctx.stroke(); }
    } else {
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const x = clamp(W / 2 + Math.cos(a) * (Math.min(W, H) * .43), 36, W - 36);
      const y = clamp(H / 2 + Math.sin(a) * (Math.min(W, H) * .43), 92, H - 36);
      const scale = clamp(1.25 - d / 1800, .68, 1.15);
      ctx.translate(x, y); ctx.rotate(a); ctx.scale(scale, scale);
      ctx.globalAlpha = .72 + pulse * .24;
      ctx.fillStyle = color; ctx.strokeStyle = '#050712'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(isRoute || isConsequence ? 21 : 17, 0); ctx.lineTo(-10, -11); ctx.lineTo(-5, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, isRoute || isConsequence ? 27 : 22, -0.6, 0.6); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEventBanner() {
    if (!activeEvent || eventBannerTimer <= 0) return;
    const a = clamp(eventBannerTimer / 2.8, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(.95, a + .15);
    const w = Math.min(460, W - 28), h = 70, x = (W - w) / 2, y = 86;
    ctx.fillStyle = 'rgba(5,7,18,.78)'; ctx.strokeStyle = activeEvent.color; ctx.lineWidth = 2;
    ctx.shadowColor = activeEvent.color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = activeEvent.color; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${activeEvent.sourceRoute ? '目標連鎖' : activeEvent.tempoLabel || '事件'}｜${activeEvent.name}`, W / 2, y + 23);
    ctx.fillStyle = 'rgba(238,247,255,.86)'; ctx.font = '800 10px system-ui';
    ctx.fillText(activeEvent.sourceEffect || activeEvent.desc, W / 2, y + 41);
    ctx.fillStyle = activeEvent.color; ctx.font = '900 10px system-ui';
    ctx.fillText(`完成後：${activeEvent.tempoName || '戰術餘波'}｜${activeEvent.tempoDesc || '短暫加成'}`, W / 2, y + 57);
    ctx.restore();
  }

  function drawBossAlert() {
    if (!bossAlert || bossAlertTimer <= 0) return;
    const a = clamp(bossAlertTimer / 3.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(.96, a + .18);
    const w = Math.min(520, W - 28), h = bossAlert.hint ? 84 : 68, x = (W - w) / 2, y = activeEvent && eventBannerTimer > 0 ? 164 : 86;
    ctx.fillStyle = 'rgba(5,7,18,.84)'; ctx.strokeStyle = bossAlert.color; ctx.lineWidth = 2.4;
    ctx.shadowColor = bossAlert.color; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = bossAlert.color; ctx.font = '950 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(bossAlert.title, W / 2, y + 25);
    ctx.fillStyle = 'rgba(238,247,255,.86)'; ctx.font = '850 11px system-ui';
    ctx.fillText(bossAlert.desc, W / 2, y + 45);
    if (bossAlert.hint) { ctx.fillStyle = '#ffd166'; ctx.font = '850 10px system-ui'; ctx.fillText(bossAlert.hint, W / 2, y + 64); }
    ctx.restore();
  }

  function drawBossCinematic() {
    if (!bossCinematic) return;
    const left = clamp(bossCinematic.timer / bossCinematic.duration, 0, 1);
    const p = 1 - left;
    const color = bossCinematic.color || '#bdfcff';
    ctx.save();
    ctx.globalAlpha = bossCinematic.kind === 'victory' ? .18 + left * .22 : .10 + left * .18;
    ctx.fillStyle = bossCinematic.kind === 'phase2' ? 'rgba(255,77,109,.72)' : 'rgba(189,252,255,.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(.96, .35 + left * .72);
    const w = Math.min(W - 36, bossCinematic.kind === 'victory' ? 620 : 540);
    const h = bossCinematic.kind === 'victory' ? 106 : 88;
    const x = (W - w) / 2;
    const y = H * .32 + Math.sin(performance.now() * .008) * 4;
    ctx.fillStyle = 'rgba(5,7,18,.84)';
    ctx.strokeStyle = color;
    ctx.lineWidth = bossCinematic.kind === 'victory' ? 3 : 2.4;
    ctx.shadowColor = color;
    ctx.shadowBlur = bossCinematic.kind === 'victory' ? 28 : 22;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill(); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `950 ${bossCinematic.kind === 'victory' ? 21 : 18}px system-ui`;
    const heading = bossCinematic.kind === 'victory' ? 'SECTOR CLEAR' : bossCinematic.kind === 'phase2' ? 'PHASE SHIFT' : 'BOSS DOWN';
    ctx.fillText(heading, W / 2, y + 31);
    ctx.fillStyle = bossCinematic.kind === 'victory' ? '#fff1c7' : 'rgba(238,247,255,.92)';
    ctx.font = '900 13px system-ui';
    ctx.fillText(bossCinematic.label, W / 2, y + 55, w - 28);
    ctx.fillStyle = 'rgba(238,247,255,.72)';
    ctx.font = '800 10px system-ui';
    const sub = bossCinematic.kind === 'victory' ? '核心碎裂，碎晶雨展開｜準備撤離' : bossCinematic.kind === 'phase2' ? '二階段轉場：招式加速，留意下一次讀題' : 'Boss 壓力解除，回收碎晶';
    ctx.fillText(sub, W / 2, y + 76, w - 28);
    if (bossCinematic.kind === 'victory') {
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(W / 2, y + h + 24, 28 + p * 46, -Math.PI / 2, -Math.PI / 2 + TWO_PI * left); ctx.stroke();
    }
    ctx.restore();
  }

  function drawScreenEffects() {
    if (damageFlash <= 0 && !playerDamageCue) return;
    ctx.save();
    if (damageFlash > 0) {
      const a = clamp(damageFlash / .34, 0, 1) * .18;
      ctx.strokeStyle = `rgba(255,77,109,${a * 2.1})`;
      ctx.lineWidth = 18;
      ctx.strokeRect(8, 8, W - 16, H - 16);
      ctx.fillStyle = `rgba(255,77,109,${a})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (playerDamageCue) {
      const t = clamp(playerDamageCue.life / playerDamageCue.max, 0, 1);
      const a = playerDamageCue.angle;
      const cx = W / 2 + Math.cos(a) * Math.min(W, H) * .42;
      const cy = H / 2 + Math.sin(a) * Math.min(W, H) * .42;
      ctx.translate(cx, cy);
      ctx.rotate(a + Math.PI / 2);
      ctx.globalAlpha = .18 + t * .46;
      ctx.fillStyle = '#ff4d6d';
      ctx.shadowColor = '#ff4d6d';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(0, -34);
      ctx.lineTo(24, 18);
      ctx.lineTo(0, 8);
      ctx.lineTo(-24, 18);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff1c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -24);
      ctx.lineTo(0, 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTouchIdleHint() {
    if (controlMode !== 'touch' || !running || paused || gameOver || skillChoosing || ui.overlay.classList.contains('visible')) return;
    const alpha = runTime < 10 ? .82 : .34;
    const text = '按住任意位置拖曳：8向移動｜放開停止｜自動瞄準';
    const w = Math.min(W - 24, 330);
    const x = (W - w) / 2;
    const y = H - 74;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(5,7,18,.54)';
    ctx.strokeStyle = 'rgba(55,246,255,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, 34, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#bdfcff';
    ctx.font = '850 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, y + 17, w - 18);
    ctx.restore();
  }

  function drawTouchDpad() {
    if (controlMode !== 'touch') return;
    if (!touchMove.pressed) { drawTouchIdleHint(); return; }
    const maxX = W > 860 ? W - 420 : W - 86;
    const x = clamp(touchMove.sx, 86, maxX);
    const y = clamp(touchMove.sy, 124, H - 124);
    const active = touchMove.active ? touchMove.dir : '';
    const pads = [
      { id: 'upLeft', label: '↖', x: -36, y: -36, size: 30 },
      { id: 'up', label: '▲', x: 0, y: -46, size: 34 },
      { id: 'upRight', label: '↗', x: 36, y: -36, size: 30 },
      { id: 'left', label: '◀', x: -46, y: 0, size: 34 },
      { id: 'right', label: '▶', x: 46, y: 0, size: 34 },
      { id: 'downLeft', label: '↙', x: -36, y: 36, size: 30 },
      { id: 'down', label: '▼', x: 0, y: 46, size: 34 },
      { id: 'downRight', label: '↘', x: 36, y: 36, size: 30 }
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = .88;
    ctx.fillStyle = 'rgba(5,7,18,.38)';
    ctx.strokeStyle = 'rgba(55,246,255,.36)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#37f6ff';
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, 68, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(238,247,255,.10)';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TWO_PI); ctx.fill();
    const force = clamp(touchMove.force || 0, 0, 1);
    ctx.strokeStyle = 'rgba(255,209,102,.58)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 22 + force * 34, -Math.PI / 2, -Math.PI / 2 + TWO_PI * force); ctx.stroke();
    const knobX = clamp(touchMove.cx - touchMove.sx, -43, 43);
    const knobY = clamp(touchMove.cy - touchMove.sy, -43, 43);
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.strokeStyle = 'rgba(189,252,255,.72)';
    ctx.beginPath(); ctx.arc(knobX, knobY, 10, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.font = '900 18px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of pads) {
      const isActive = active === p.id;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = isActive ? 'rgba(55,246,255,.78)' : 'rgba(238,247,255,.18)';
      ctx.strokeStyle = isActive ? '#bdfcff' : 'rgba(238,247,255,.22)';
      ctx.shadowColor = isActive ? '#37f6ff' : 'transparent';
      ctx.shadowBlur = isActive ? 20 : 0;
      ctx.beginPath(); ctx.roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = isActive ? '#050712' : 'rgba(238,247,255,.70)';
      ctx.fillText(p.label, 0, 1);
      ctx.restore();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(189,252,255,.90)';
    ctx.font = '900 10px system-ui';
    ctx.fillText(active ? `推進 ${Math.round(force * 100)}%` : '待命', 0, 82);
    ctx.restore();
  }

  function drawPause() { ctx.save(); ctx.fillStyle = 'rgba(5,7,18,.45)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#eef7ff'; ctx.textAlign = 'center'; ctx.font = '800 42px system-ui'; ctx.fillText('暫停中', W / 2, H / 2); ctx.font = '16px system-ui'; ctx.fillText('按 P 繼續｜狀態已保存', W / 2, H / 2 + 38); ctx.restore(); }

  function flash(message) { ui.toast.textContent = message; ui.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1800); }

  function startOrResume() {
    closeUpgradeModal();
    closeSettingsModal();
    clearMovementInput();
    ensureAudio();
    if (gameOver || !player || !running) hardResetRun();
    running = true; paused = false; gameOver = false; skillChoosing = false;
    clearRunOverlayExtras();
    ui.overlay.classList.remove('visible'); ui.startBtn.textContent = '開始 / 繼續'; ui.startBtn.style.display = ''; ui.howBtn.style.display = '';
    save(false);
    updateUi();
    showWaveGuide(wave, bossActive);
  }

  function togglePause() {
    if (!running || gameOver || skillChoosing) return;
    paused = !paused;
    if (paused) {
      save(true);
      openUpgradeModal();
    } else {
      closeUpgradeModal();
    }
    updateUi();
  }
  function doDash() { if (controlMode === 'touch' || !running || paused || gameOver || skillChoosing || dashCooldown > 0) return; dashTime = .16; dashCooldown = Math.max(.55, 1.32 - (meta.upgrades.engine || 0) * .065); player.invuln = .24; burst(player.x, player.y, '#ffd166', 11); sfx('dash'); addShake(1.2, .08); }

  function diagnosticsCounts() {
    return {
      running, paused, skillChoosing, gameOver, wave,
      bullets: bullets.length,
      enemyShots: enemyShots.length,
      enemies: enemies.length,
      shards: shards.length,
      particles: particles.length,
      powerups: powerups.length,
      worldFeatures: worldFeatures.length,
      floatText: floatText.length,
      bossTelegraphs: bossTelegraphs.length
    };
  }

  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, .05);
    lastTime = now;
    diagnostics.beginFrame(now);
    diagnostics.measure('update', () => { updateFeedbackTimers(dt); update(dt); });
    diagnostics.measure('draw', draw);
    diagnostics.endFrame(diagnosticsCounts());
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  window.addEventListener('blur', clearMovementInput);
  window.addEventListener('pagehide', clearMovementInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovementInput(); });
  window.addEventListener('keydown', e => {
    if (!e.repeat && (e.code === 'F3' || (e.code === 'Backquote' && e.shiftKey))) {
      e.preventDefault();
      togglePerfDashboard();
      return;
    }
    keys.add(e.code);
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) doDash(); }
    if (e.repeat) return;
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyE') toggleAutoAim();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  function setMouseFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = clamp(clientX - rect.left, 0, W);
    mouse.y = clamp(clientY - rect.top, 0, H);
    mouse.lastMove = performance.now();
  }

  function setControlSetting(key, value, message = '') {
    meta[key] = value;
    save(false);
    updateCombatControls();
    if (message) flash(message);
  }

  function toggleHaptics() {
    meta.hapticsEnabled = meta.hapticsEnabled === false;
    save(false);
    updateSoundUi();
    if (meta.hapticsEnabled) haptic(18);
    flash(`手機震動 ${meta.hapticsEnabled ? '開啟' : '關閉'}`);
  }

  canvas.addEventListener('pointermove', e => { setMouseFromClient(e.clientX, e.clientY); });
  canvas.addEventListener('pointerdown', e => { mouse.down = true; setMouseFromClient(e.clientX, e.clientY); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointerup', e => { mouse.down = false; canvas.releasePointerCapture?.(e.pointerId); if (controlMode === 'touch') resetTouchDirection(); });
  canvas.addEventListener('pointercancel', clearMovementInput);
  canvas.addEventListener('pointerleave', () => { mouse.down = false; if (controlMode === 'touch') resetTouchDirection(); });
  window.addEventListener('pointerup', () => { mouse.down = false; if (controlMode === 'touch') resetTouchDirection(); });
  ui.startBtn.addEventListener('click', startOrResume);
  ui.settingsBtn?.addEventListener('click', openSettingsModal);
  ui.homeSettingsBtn?.addEventListener('click', openSettingsModal);
  ui.closeSettingsBtn?.addEventListener('click', closeSettingsModal);
  ui.howBtn.addEventListener('click', () => { ui.how.hidden = !ui.how.hidden; });
  ui.saveBtn.addEventListener('click', () => save(true));
  ui.resetBtn.addEventListener('click', resetSave);
  ui.pauseBtn?.addEventListener('click', togglePause);
  ui.upgradeMenuBtn?.addEventListener('click', openUpgradeModal);
  ui.closeUpgradeBtn?.addEventListener('click', closeUpgradeModal);
  ui.resumeFromUpgradeBtn?.addEventListener('click', resumeFromUpgradeModal);
  ui.controlModeBtn?.addEventListener('click', toggleControlMode);
  ui.autoAimBtn?.addEventListener('click', toggleAutoAim);
  ui.soundBtn?.addEventListener('click', toggleSound);
  ui.testSoundBtn?.addEventListener('click', testSound);
  ui.volumeRange?.addEventListener('input', e => setControlSetting('volume', clamp(Number(e.target.value) / 100, 0, 1)));
  ui.hapticBtn?.addEventListener('click', toggleHaptics);
  ui.shakeRange?.addEventListener('input', e => setControlSetting('shakeStrength', clamp(Number(e.target.value) / 100, 0, 1)));
  ui.touchSensitivityRange?.addEventListener('input', e => setControlSetting('touchSensitivity', clamp(Number(e.target.value) / 100, .55, 1.6)));
  ui.difficultyBtn?.addEventListener('click', toggleDifficulty);
  ui.perfBtn?.addEventListener('click', togglePerfDashboard);

  function setTouchDirectionFromClient(e, start = false) {
    const rect = canvas.getBoundingClientRect();
    const sx = clamp(e.clientX - rect.left, 0, W);
    const sy = clamp(e.clientY - rect.top, 0, H);
    if (start || !touchMove.pressed) {
      touchMove.sx = sx;
      touchMove.sy = sy;
    }
    touchMove.cx = sx;
    touchMove.cy = sy;
    touchMove.pressed = true;
    const dx = sx - touchMove.sx;
    const dy = sy - touchMove.sy;
    const distance = Math.hypot(dx, dy);
    const deadZone = 18;
    if (distance <= deadZone) {
      touchMove.x = 0;
      touchMove.y = 0;
      touchMove.dir = '';
      touchMove.force = 0;
      touchMove.active = false;
    } else {
      const eightWay = [
        { dir: 'right', x: 1, y: 0 },
        { dir: 'downRight', x: 1, y: 1 },
        { dir: 'down', x: 0, y: 1 },
        { dir: 'downLeft', x: -1, y: 1 },
        { dir: 'left', x: -1, y: 0 },
        { dir: 'upLeft', x: -1, y: -1 },
        { dir: 'up', x: 0, y: -1 },
        { dir: 'upRight', x: 1, y: -1 }
      ];
      const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      const move = eightWay[(sector + 8) % 8];
      touchMove.x = move.x;
      touchMove.y = move.y;
      touchMove.dir = move.dir;
      const sensitivity = clamp(meta.touchSensitivity ?? 1, .55, 1.6);
      touchMove.force = .45 + clamp((distance - deadZone) / (58 / sensitivity), 0, 1) * .55;
      touchMove.active = true;
    }
    mouse.x = sx;
    mouse.y = sy;
    mouse.down = true;
    mouse.lastMove = performance.now();
  }

  function resetTouchDirection() {
    touchMove.x = 0;
    touchMove.y = 0;
    touchMove.dir = '';
    touchMove.force = 0;
    touchMove.active = false;
    touchMove.pressed = false;
    mouse.down = false;
  }

  function bindTouchControls() {
    const touchStart = e => {
      if (controlMode !== 'touch') return;
      if (ui.overlay.classList.contains('visible') || isUpgradeModalOpen() || isSettingsModalOpen()) return;
      e.preventDefault();
      setTouchDirectionFromClient(e, true);
    };
    const touchMoveHandler = e => {
      if (controlMode !== 'touch') return;
      if (!touchMove.pressed) return;
      e.preventDefault();
      setTouchDirectionFromClient(e, false);
    };
    const touchEnd = e => {
      if (controlMode !== 'touch') return;
      e.preventDefault();
      resetTouchDirection();
    };
    canvas.addEventListener('pointerdown', touchStart);
    canvas.addEventListener('pointermove', touchMoveHandler);
    canvas.addEventListener('pointerup', touchEnd);
    canvas.addEventListener('pointercancel', touchEnd);
  }

  bindTouchControls();
  setControlMode(controlMode, false);
  window.addEventListener('beforeunload', () => save(false));

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      this.moveTo(x + rr, y); this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr); this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr); return this;
    };
  }

  resize(); applyOfflineRewards(); hardResetRun(); renderUpgrades(); renderAchievementPanel(); renderZonePanel(); updateSoundUi(); updateDifficultyUi(); updateUi(); requestAnimationFrame(loop);
})();
