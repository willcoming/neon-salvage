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

  const SAVE_KEY = 'neon-salvage-save-v2';
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

  const baseState = () => ({
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
    lastSaved: Date.now(),
    upgrades: { cannon: 0, reactor: 0, shield: 0, armor: 0, engine: 0, magnet: 0, survey: 0, drone: 0 }
  });

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
  let anomalyState = null;
  let activeTactic = null;
  let eventTimer = 0;
  let meteorTimer = 0;
  let tacticPulse = 0;
  let bossAlertTimer = 0;
  let bossAlert = null;
  let eventBannerTimer = 0;
  let damageFlash = 0;
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
  const difficultyOrder = ['standard', 'high', 'chaos'];
  const difficultyDefs = {
    standard: { name: '標準星環', desc: '預設體驗', enemy: 1, speed: 1, cap: 1, reward: 1, event: 1 },
    high: { name: '高壓星環', desc: '敵人更多、獎勵更多', enemy: 1.12, speed: 1.06, cap: 1.12, reward: 1.18, event: 1.18 },
    chaos: { name: '失控星環', desc: 'Boss 更強、事件更頻繁', enemy: 1.25, speed: 1.12, cap: 1.18, reward: 1.38, event: 1.35 }
  };

  function currentDifficulty() {
    return difficultyDefs[meta?.difficulty] || difficultyDefs.standard;
  }

  function lateGameScale() {
    return clamp(1 - Math.max(0, wave - 4) * .055, .64, 1);
  }
  function visualScale() {
    return lateGameScale() * (controlMode === 'touch' ? .9 : 1);
  }
  function enemyCap() {
    const base = controlMode === 'touch' ? 30 : 36;
    const pressureCut = Math.max(0, wave - 7) * 1.35;
    const stage = runStageForWave(wave);
    const stageEase = stage === runStageDefs.warmup ? .88 : stage === runStageDefs.final ? .86 : stage === runStageDefs.pressure ? .94 : 1;
    return Math.round(Math.max(controlMode === 'touch' ? 22 : 26, (base - pressureCut) * stageEase) * currentDifficulty().cap);
  }

  function waveEnemyBudget(n = wave) {
    if (n % 5 === 0) return 0;
    const budgets = { 1: 14, 2: 22, 3: 30, 4: 36, 6: 42, 7: 48, 8: 53, 9: 56 };
    const base = budgets[n] || Math.round(34 + n * 3.2);
    const mobileEase = controlMode === 'touch' ? .92 : 1;
    const tutorialEase = tutorialRun && n <= 2 ? .72 : 1;
    return Math.floor(base * mobileEase * tutorialEase * currentDifficulty().enemy * (currentAnomaly()?.enemyMult || 1));
  }

  function eventChanceForWave(n = wave) {
    if (n <= 3 || n % 5 === 0) return 0;
    const boost = currentAnomaly()?.eventBoost || 0;
    if (n <= 6) return (n === 6 ? .42 : .18) + boost;
    return (n === 9 ? .72 : .48) + boost;
  }

  function spawnIntervalForWave(n = wave) {
    const stage = runStageForWave(n);
    const base = stage === runStageDefs.warmup ? (n === 1 ? .19 : .165) : stage === runStageDefs.build ? .135 : .118;
    return Math.max(controlMode === 'touch' ? .085 : .068, base - Math.max(0, n - 4) * .004 + (controlMode === 'touch' ? .012 : 0));
  }
  function compactWorldFeatureTarget() {
    return Math.max(14, Math.round((22 + Math.min(10, Math.floor(wave / 2))) * lateGameScale()));
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
    const gap = name === 'shoot' ? 55 : name === 'hit' ? 38 : name === 'pickup' ? 75 : name === 'bossHit' ? 90 : name === 'hurt' ? 240 : 0;
    if (gap && now - (sfxGate[name] || 0) < gap) return;
    sfxGate[name] = now;
    if (name === 'shoot') tone(720, .035, 'square', .014, 1.28);
    else if (name === 'hit') tone(420, .032, 'triangle', .018, .7);
    else if (name === 'kill') { tone(280, .055, 'triangle', .025, .58); tone(680, .035, 'sine', .014, .9); }
    else if (name === 'elite') { tone(360, .07, 'sawtooth', .03, .62); tone(900, .05, 'triangle', .018, 1.2); }
    else if (name === 'bossHit') tone(150, .06, 'sawtooth', .025, .82);
    else if (name === 'boss') { tone(90, .2, 'sawtooth', .035, .72); tone(180, .14, 'triangle', .025, .55); }
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

  function updateFeedbackTimers(dt) {
    if (shakeTime > 0) {
      shakeTime = Math.max(0, shakeTime - dt);
      if (shakeTime <= 0) shakePower = 0;
    }
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

  function impactFeedback(x, y, color = '#37f6ff', strength = 1, sound = 'hit') {
    sfx(sound);
    if (strength >= 2.2) addShake(strength, .12);
    const count = Math.min(12, Math.ceil(3 + strength * 2));
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * TWO_PI;
      particles.push({ x, y, vx: Math.cos(a) * rand(50, 180) * strength, vy: Math.sin(a) * rand(50, 180) * strength, life: rand(.12, .24), max: .24, r: rand(1.1, 2.8) * Math.min(1.7, strength), color, ring: false });
    }
  }

  function playerImpact(cause, shake = 3.2, vibrateMs = 18) {
    lastDamageCause = cause;
    sfx('hurt');
    addShake(shake, .13);
    const now = performance.now();
    if (now - (sfxGate.haptic || 0) > 220) { sfxGate.haptic = now; haptic(vibrateMs); }
  }

  function newRunStats() {
    return { waveStart: 0, bossStart: 0, bossName: '', bossKillTime: null, bossMechanics: [], bossPhase2: false, objectiveRoute: [], objectiveBonuses: 0, paceNodes: [], prepDrops: 0, waveTimes: {}, skills: [], eventsSeen: [], tacticsSeen: [], zone: '', anomaly: '', anomalyTasks: [], anomalyScore: 0, shieldSatelliteTime: 0, shieldSatelliteKills: 0, tacticPressure: 0, salvageRushWins: 0, salvageRushShards: 0, maxEnemies: 0, maxWorldFeatures: 0, maxParticles: 0, maxRings: 0, deathCause: '' };
  }

  const runAnomalyDefs = {
    salvage: { id: 'salvage', name: '碎晶潮汐', tag: '資源多｜競速多', color: '#ffd166', desc: '資源點、碎晶與拾荒競速更常出現。', events: ['rich', 'salvageRush', 'supply'], objectiveBias: ['harvest', 'scan'], rewardMult: 1.14 },
    bounty: { id: 'bounty', name: '懸賞獵場', tag: '菁英多｜獎勵高', color: '#ff3df2', desc: '菁英與獵殺目標更常見，擊破獎勵提高。', events: ['eliteStorm', 'droneSwarm'], objectiveBias: ['hunt', 'hold'], enemyMult: 1.04, rewardMult: 1.1 },
    rift: { id: 'rift', name: '裂隙干擾', tag: '危險多｜事件強', color: '#ff4d6d', desc: '裂隙、重力與電磁事件更常出現，目標獎勵更高。', events: ['gravityWell', 'hazard', 'empStorm'], objectiveBias: ['rift', 'hold'], eventBoost: .12, rewardMult: 1.18 },
    convoy: { id: 'convoy', name: '補給航道', tag: '補給多｜節奏穩', color: '#4dff88', desc: '維修與補給事件更常見，前中期更容易整理 build。', events: ['supply', 'rich', 'overclock'], objectiveBias: ['scan', 'harvest'], support: true, rewardMult: 1.05 }
  };

  function chooseRunAnomaly() {
    return { ...choose(Object.values(runAnomalyDefs)) };
  }

  function currentAnomaly() {
    return activeAnomaly || runAnomalyDefs.salvage;
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

  const runStageDefs = {
    warmup: { name: '暖機', waves: '1-3', color: '#bdfcff', desc: '操作 / 目標暖機' },
    build: { name: 'Build 成形', waves: '4-6', color: '#ffd166', desc: '技能核心與第一個 Boss' },
    pressure: { name: '高壓選擇', waves: '7-9', color: '#ff9f1c', desc: '戰術、事件與終局整備' },
    final: { name: '終局考驗', waves: '10', color: '#ff4d6d', desc: '星環核心 Boss' }
  };

  function runStageForWave(n = wave) {
    if (n >= SECTOR_CLEAR_WAVE) return runStageDefs.final;
    if (n >= 7) return runStageDefs.pressure;
    if (n >= 4) return runStageDefs.build;
    return runStageDefs.warmup;
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
    runStats.maxRings = Math.max(runStats.maxRings, particles.filter(p => p.ring).length);
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
    const scores = {};
    for (const skill of skillPool) {
      const level = (upgradesRuntime?.[skill.id] || 0) + (skill.id === extraSkillId ? 1 : 0);
      if (level <= 0 || !skill.build) continue;
      scores[skill.build] = (scores[skill.build] || 0) + level * (skill.weight || 1);
    }
    return scores;
  }

  function topBuild(extraSkillId = null) {
    const scores = buildScoreMap(extraSkillId);
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return { id: '', score: 0, def: null };
    const [id, score] = entries[0];
    return { id, score, def: buildDefs[id] || null };
  }

  function detectBuildName() {
    const top = topBuild();
    if (!top.def || top.score <= 0) return '未成形';
    return `${top.def.name}${top.score >= BUILD_CORE_SCORE ? '｜核心成形' : '｜成形中'}`;
  }

  function balanceHint() {
    if (!runStats) return '診斷：資料不足，先完成更多波次。';
    if (runStats.maxParticles >= MAX_PARTICLES * .92 || runStats.maxRings >= MAX_RING_PARTICLES) return '診斷：性能預算曾接近紅線，系統已限制粒子/ring；下一局可少疊高爆裂特效。';
    if ((runStats.shieldSatelliteTime || 0) > 8 && (runStats.shieldSatelliteKills || 0) <= 1) return '診斷：護盾衛星拖慢清場，下一局看到藍色衛星要優先擊破。';
    if ((runStats.tacticPressure || 0) >= 8) return '診斷：敵群戰術組合壓力偏高，先拆關鍵單位再清雜兵會更穩。';
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
    return `戰鬥報告｜時間 ${formatTime(runTime)}｜${longestWaveText()}｜峰值 敵${runStats?.maxEnemies || 0}/物件${runStats?.maxWorldFeatures || 0}/粒子${runStats?.maxParticles || 0}/ring${runStats?.maxRings || 0}${boss}｜${pickedSkillsText()}｜${balanceHint()}`;
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
      if (!list.length) list.push('保持 S 評級並嘗試更高擊殺數');
    } else {
      list.push(`突破第 ${Math.min(SECTOR_CLEAR_WAVE, record.wave + 1)} 波`);
      if ((record.objectives || 0) < 3) list.push('完成至少 3 個目標');
      if ((record.skills || []).length < 3) list.push('拿到 3 個局內技能');
    }
    if ((record.shieldSatelliteTime || 0) > 0 && (record.shieldSatelliteKills || 0) < 2) list.push('優先擊破 2 台護盾衛星');
    if ((record.objectiveBonuses || 0) < 2 && (record.objectives || 0) >= 2) list.push('完成 2 個帶 ★ 副條件目標');
    if ((record.tacticsSeen || []).length) list.push(`破解 ${record.tacticsSeen[0]} 戰術`);
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
      bossPhase2: !!runStats?.bossPhase2,
      skills: [...(runStats?.skills || [])].slice(-6),
      build: detectBuildName(),
      zone: runStats?.zone || currentZone().name,
      anomaly: runStats?.anomaly || currentAnomaly().name,
      anomalyTasks: [...(runStats?.anomalyTasks || [])].slice(-5),
      anomalyScore: runStats?.anomalyScore || 0,
      paceNodes: [...(runStats?.paceNodes || [])].slice(-6),
      prepDrops: runStats?.prepDrops || 0,
      objectiveRoute: [...(runStats?.objectiveRoute || [])].slice(-6),
      objectiveBonuses: runStats?.objectiveBonuses || 0,
      eventsSeen: [...(runStats?.eventsSeen || [])].slice(-5),
      tacticsSeen: [...(runStats?.tacticsSeen || [])].slice(-5),
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
    const routeHtml = record.objectiveRoute?.length ? record.objectiveRoute.map(r => `<span>${escapeHtml(r)}</span>`).join('') : '<span>尚未完成目標路線</span>';
    const anomalyHtml = record.anomalyTasks?.length ? record.anomalyTasks.map(a => `<span>${escapeHtml(a)}</span>`).join('') : '<span>尚未完成異變任務</span>';
    const tacticHtml = record.tacticsSeen?.length ? record.tacticsSeen.map(t => `<span>${escapeHtml(t)}</span>`).join('') : '<span>尚未遇到戰術組合</span>';
    const bossHtml = record.bossMechanics?.length ? record.bossMechanics.map(b => `<span>${escapeHtml(b)}</span>`).join('') : '<span>尚未遭遇 Boss 機制</span>';
    const unlock = nextAchievement();
    const unlockHtml = unlock ? `${escapeHtml(unlock.name)}｜${escapeHtml(unlock.progress?.() || '')}｜${escapeHtml(unlock.unlock || '')}` : '所有成就已解鎖';
    const summaryHtml = [
      ['波次', `第 ${record.wave} 波`],
      ['Build', record.build || '未成形'],
      ['壓力', `${record.pressure || '-'}｜${(record.budget || '-').split('｜')[0]}`],
      ['下一步', record.challenges?.[0] || '自由挑戰']
    ].map(([k, v]) => `<span><b>${escapeHtml(k)}</b>${escapeHtml(v)}</span>`).join('');
    report.innerHTML = `
      <div class="grade-badge ${record.status === 'clear' ? 'win' : 'fail'}"><span>${escapeHtml(record.status === 'clear' ? record.grade : '失敗')}</span><small>${escapeHtml(record.status === 'clear' ? '撤離成功' : '資料已保存')}</small></div>
      <div class="run-summary">${summaryHtml}</div>
      <div class="report-grid">
        <section><h3>本局成果</h3><dl><div><dt>難度</dt><dd>${escapeHtml(record.difficulty || '標準星環')}</dd></div><div><dt>時間</dt><dd>${escapeHtml(formatTime(record.time))}</dd></div><div><dt>擊殺</dt><dd>${escapeHtml(record.kills)}</dd></div><div><dt>目標</dt><dd>${escapeHtml(record.objectives)}${record.objectiveBonuses ? `｜★${escapeHtml(record.objectiveBonuses)}` : ''}</dd></div><div><dt>事件</dt><dd>${escapeHtml(record.events)}</dd></div><div><dt>碎晶</dt><dd>+${escapeHtml(record.scrap)}</dd></div></dl></section>
        <section><h3>戰鬥壓力</h3><dl><div><dt>最高敵人</dt><dd>${escapeHtml(record.maxEnemies)}</dd></div><div><dt>地圖物件</dt><dd>${escapeHtml(record.maxWorldFeatures)}</dd></div><div><dt>粒子</dt><dd>${escapeHtml(record.maxParticles)}</dd></div><div><dt>ring</dt><dd>${escapeHtml(record.maxRings)}</dd></div><div><dt>壓力</dt><dd>${escapeHtml(record.pressure)}</dd></div><div><dt>預算</dt><dd>${escapeHtml(record.budget || '-')}</dd></div></dl></section>
        <section><h3>節奏</h3><dl><div><dt>最久波</dt><dd>${escapeHtml(record.longestWave)}</dd></div><div><dt>Boss</dt><dd>${escapeHtml(record.bossName || '-')}${record.bossTime ? `｜${escapeHtml(formatTime(record.bossTime))}` : ''}${record.bossPhase2 ? '｜二階段' : ''}</dd></div><div><dt>整備</dt><dd>${record.prepDrops ? '終局補給已投放' : '未抵達整備波'}</dd></div><div><dt>分數</dt><dd>${escapeHtml(record.score)}</dd></div></dl></section>
        <section><h3>星域內容</h3><dl><div><dt>區域</dt><dd>${escapeHtml(record.zone || '-')}</dd></div><div><dt>異變</dt><dd>${escapeHtml(record.anomaly || '-')}</dd></div><div><dt>護盾衛星</dt><dd>${escapeHtml(record.shieldSatelliteKills || 0)} 擊破</dd></div><div><dt>衛星拖慢</dt><dd>${escapeHtml(record.shieldSatelliteTime || 0)}s</dd></div><div><dt>戰術壓力</dt><dd>${escapeHtml(record.tacticPressure || 0)}</dd></div><div><dt>競速</dt><dd>${escapeHtml(record.salvageRushWins || 0)} 成功</dd></div></dl></section>
      </div>
      <div class="skill-chips"><b>事件紀錄</b>${eventHtml}</div>
      <div class="skill-chips"><b>異變任務</b>${anomalyHtml}</div>
      <div class="skill-chips"><b>節奏節點</b>${paceHtml}</div>
      <div class="skill-chips"><b>目標路線</b>${routeHtml}</div>
      <div class="skill-chips"><b>Boss 機制</b>${bossHtml}</div>
      <div class="skill-chips"><b>戰術組合</b>${tacticHtml}</div>
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

  const BUILD_CORE_SCORE = 6;
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
    scrapyard: { name: '電磁殘骸帶', color: '#7aa7ff', desc: '殘骸密集、敵彈較慢，碎晶略多但戰場更擁擠。', featureBias: ['debris', 'debris', 'asteroid', 'resource', 'hazard'], scrapBonus: 1, enemyBias: ['shooter', 'shieldSat'] },
    crystal: { name: '晶礦雲帶', color: '#ffd166', desc: '資源點更常見，晶礦會吸引高速敵人與拾荒競速事件。', featureBias: ['resource', 'resource', 'resource', 'repair', 'debris'], scrapBonus: 2, enemyBias: ['sprinter', 'sprinter', 'bomber'] },
    rift: { name: '裂隙邊界', color: '#ff4d6d', desc: '危險裂隙較多，但目標獎勵更高。', featureBias: ['hazard', 'hazard', 'resource', 'debris', 'repair'], scrapBonus: 1, enemyBias: ['leech', 'shooter'] }
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
      btn.innerHTML = `<b style="color:${z.color || '#37f6ff'}">${z.name}</b><small>${z.desc}</small>`;
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

  const tacticDefs = {
    shieldWall: {
      name: '護盾重甲陣', color: '#7aa7ff', minWave: 4,
      desc: '護盾衛星保護重甲機；先打藍色衛星再清主群。',
      bias: ['shieldSat', 'tank', 'tank', 'chaser'], elites: [], events: ['empStorm', 'eliteStorm'], zones: ['scrapyard']
    },
    blitzMines: {
      name: '加速爆雷群', color: '#ff7a3d', minWave: 5,
      desc: '加速精英帶爆裂雷逼你後撤；看到閃爍十字先拉開。',
      bias: ['bomber', 'bomber', 'sprinter', 'sprinter'], elites: [{ type: 'sprinter', mod: 'accelerator' }], events: ['droneSwarm', 'overclock'], zones: ['crystal']
    },
    medicSwarm: {
      name: '治療蜂群', color: '#4dff88', minWave: 6,
      desc: '治療精英躲在小怪後方；範圍清場或先點殺治療者。',
      bias: ['chaser', 'sprinter', 'sprinter', 'chaser'], elites: [{ type: 'chaser', mod: 'medic' }], events: ['droneSwarm', 'eliteStorm'], zones: ['crystal']
    },
    sniperRift: {
      name: '狙擊裂隙線', color: '#ff3df2', minWave: 5,
      desc: '狙擊球配裂隙封路；橫向移動，別站在紅區。',
      bias: ['shooter', 'shooter', 'chaser'], elites: [], events: ['blackout', 'hazard'], zones: ['rift', 'scrapyard'], feature: 'hazard'
    },
    leechRefractor: {
      name: '吸能折射網', color: '#b66dff', minWave: 7,
      desc: '吸能蟲加折射精英拖長戰鬥；用穿透或爆裂快速破網。',
      bias: ['leech', 'leech', 'shooter'], elites: [{ type: 'leech', mod: 'refractor' }], events: ['gravityWell', 'empStorm'], zones: ['rift']
    }
  };

  const bossMechanicDefs = {
    ring: { title: '星環吞噬者', intro: '追擊 + 扇形彈幕；保持橫向移動。', phase: '二階段：彈幕密度提高，別貼臉硬吃。', mechanic: '追擊扇形彈幕' },
    forge: { title: '熔核鍛造者', intro: '熔核流星 + 危險火圈；不要站紅區。', phase: '二階段：流星更頻繁，先保走位。', mechanic: '熔核流星' },
    void: { title: '虛空指揮官', intro: '召喚壓迫 + 紫色彈線；先清召喚物。', phase: '二階段：召喚與彈線同步加速。', mechanic: '虛空召喚' },
    pulse: { title: '虛空脈衝體', intro: '環形彈幕；找縫隙穿過，不要貼臉。', phase: '二階段：雙層脈衝環，橫向穿縫。', mechanic: '環形脈衝' },
    brood: { title: '裂隙母巢', intro: '裂隙 + 小怪 + 護盾衛星；先拆衛星。', phase: '二階段：裂隙與召喚加速。', mechanic: '母巢裂隙' },
    core: { title: '星環核心主宰', intro: '終局考驗：混合彈幕、召喚與裂隙。', phase: '二階段：核心失控，所有招式加速。', mechanic: '終局混合招式' }
  };

  function bossMechanic(id) {
    return bossMechanicDefs[id] || bossMechanicDefs.ring;
  }

  function recordBossMechanic(label) {
    if (!runStats || !label) return;
    if (!runStats.bossMechanics.includes(label)) runStats.bossMechanics.push(label);
  }

  function announceBoss(e, phase = 'intro') {
    if (!e || e.type !== 'boss') return;
    const info = bossMechanic(e.bossVariant);
    const desc = phase === 'phase2' ? info.phase : info.intro;
    bossAlert = { title: phase === 'phase2' ? `${e.label}｜二階段` : `${e.finalBoss ? '終局 Boss' : 'Boss'}：${e.label}`, desc, color: e.color || '#ff4d6d' };
    bossAlertTimer = phase === 'phase2' ? 2.8 : 3.4;
    recordBossMechanic(phase === 'phase2' ? `${info.mechanic}｜二階段` : info.mechanic);
    flash(`${bossAlert.title}｜${desc}`);
  }

  const objectiveDefs = {
    scan: { name: '掃描信標', color: '#bdfcff', event: ['droneSwarm', 'gravityWell', 'rich', 'empStorm'], routeBias: ['empStorm', 'rich'], reward: 1, charge: 2.4, sideLabel: '穩定掃描', sideGoal: 3, sideHint: '站在圈內完成 3 次掃描脈衝。' },
    hold: { name: '守點核心', color: '#7aa7ff', event: ['droneSwarm', 'eliteStorm', 'empStorm'], routeBias: ['droneSwarm', 'eliteStorm'], reward: 1.35, charge: 6.2, sideLabel: '守住攻勢', sideGoal: 3, sideHint: '守點期間撐過 3 次敵群衝擊。' },
    harvest: { name: '採集晶礦', color: '#ffd166', event: ['rich', 'droneSwarm', 'salvageRush'], routeBias: ['rich', 'salvageRush'], reward: 1.2, charge: 4.2, sideLabel: '採出晶礦', sideGoal: 6, sideHint: '採集期間噴出 6 批碎晶。' },
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
      const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('neon-salvage-save-v1');
      if (!raw) return baseState();
      const parsed = JSON.parse(raw);
      return { ...baseState(), ...parsed, achievements: { ...(parsed.achievements || {}) }, upgrades: { ...baseState().upgrades, ...(parsed.upgrades || {}) } };
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
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('neon-salvage-save-v1');
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
    const lvl = meta.upgrades[def.id] || 0;
    return Math.floor(def.base * Math.pow(def.scale, lvl));
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

  function maxHp() { return 110 + (meta.upgrades.shield || 0) * 15 + (meta.upgrades.armor || 0) * 12; }
  function playerScale() { return controlMode === 'touch' ? .46 : .72; }
  function playerRadius() { return 17 * playerScale(); }
  function enemyScale() { return controlMode === 'touch' ? .76 : .84; }
  function speed() { return (282 + (meta.upgrades.engine || 0) * 18 + (meta.upgrades.armor || 0) * 2) * (controlMode === 'touch' ? .88 : 1); }
  function fireRate() { return Math.max(.07, .215 - (meta.upgrades.cannon || 0) * .011 - (meta.upgrades.reactor || 0) * .004); }
  function weaponFireRate() {
    const harvest = upgradesRuntime.harvestDrive > 0 ? Math.max(.72, 1 - Math.min(.28, (runKills % 10) * .028 * upgradesRuntime.harvestDrive)) : 1;
    const storm = activeEvent?.id === 'overclock' ? .78 : 1;
    return fireRate() * harvest * storm;
  }
  function damage() { return 15 + (meta.upgrades.cannon || 0) * 2.45 + (meta.upgrades.reactor || 0) * 2.15; }
  function incomingDamage(amount) { return amount * Math.max(.78, 1 - (meta.upgrades.armor || 0) * .035); }
  function magnetRange() { return 92 + (meta.upgrades.magnet || 0) * 28; }
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
    return activeZone || { id: 'default', name: '標準星環', color: '#37f6ff', desc: '標準星環航道。', featureBias: null, scrapBonus: 0, enemyBias: [] };
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
    return ((currentZone().id === 'rift' ? 1.12 : 1) + (meta.upgrades.survey || 0) * .035) * currentDifficulty().reward * (currentAnomaly()?.rewardMult || 1);
  }

  function chooseObjectiveEvent(kind, def = objectiveDefs[kind] || objectiveDefs.scan) {
    const pool = [...(def.event || ['droneSwarm'])];
    if (def.routeBias?.length) pool.push(...def.routeBias);
    if (currentAnomaly()?.events?.length) pool.push(...currentAnomaly().events);
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

  function recordObjectiveRoute(beaconRef, eventId, bonus) {
    if (!runStats || !beaconRef) return;
    const def = objectiveDefs[beaconRef.kind] || objectiveDefs.scan;
    const eventName = eventDefs[eventId]?.name || '未知事件';
    const label = `${def.name}→${eventName}${bonus ? '★' : ''}`;
    runStats.objectiveRoute.push(label);
    if (bonus) runStats.objectiveBonuses++;
  }

  function hardResetRun() {
    clearMovementInput();
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: playerRadius(), hp: maxHp(), maxHp: maxHp(), invuln: 3.5, regenClock: 0, angle: -Math.PI / 2, bank: 0 };
    bullets = []; enemies = []; shards = []; particles = []; floatText = []; powerups = []; enemyShots = []; worldFeatures = []; beacon = null; zoneTick = 0;
    Object.keys(upgradesRuntime).forEach(k => { upgradesRuntime[k] = 0; });
    wave = 1; xp = 0; xpNeed = 12; runKills = 0; totalKills = 0; runTime = 0; shotSeq = 0; runObjectives = 0; runEvents = 0; runStartScrap = meta.scrap; lastDamageCause = ''; tutorialShown = new Set();
    activeZone = chooseZone();
    activeAnomaly = chooseRunAnomaly();
    anomalyState = makeAnomalyState(activeAnomaly);
    runStats = newRunStats();
    runStats.zone = activeZone.name;
    runStats.anomaly = activeAnomaly.name;
    recordPaceNode(`本局異變｜${activeAnomaly.name}：${activeAnomaly.tag}`);
    upgradeFromRun = false; bossActive = false; gameOver = false; skillChoosing = false; activeEvent = null; activeTactic = null; eventTimer = 0; meteorTimer = 0; tacticPulse = 0; bossAlertTimer = 0; bossAlert = null; eventBannerTimer = 0; damageFlash = 0;
    tutorialRun = makeTutorialRun();
    mission = tutorialRun ? tutorialMission() : newMission();
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
    save(false);
  }

  function chooseObjectiveKind() {
    const bias = currentAnomaly()?.objectiveBias || [];
    if (wave <= 3) return choose(['scan', 'scan', 'harvest', ...bias]);
    if (wave <= 6) return choose(['scan', 'harvest', 'hold', 'rift', ...bias]);
    return choose(['hunt', 'hold', 'rift', 'harvest', 'scan', ...bias, ...bias]);
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
    bossActive = n % 5 === 0;
    spawnLeft = waveEnemyBudget(n);
    spawnTimer = bossActive ? .35 : 0;
    if (wave === 9 && !bossActive) startEvent(choose(['eliteStorm', 'hazard', 'gravityWell', 'supply']));
    else if (!bossActive && Math.random() < eventChanceForWave(wave) * currentDifficulty().event) startEvent();
    if (!beacon || wave % 3 === 1 || wave === 9) beacon = makeBeacon(chooseObjectiveKind());
    if (bossActive) { activeEvent = null; activeTactic = null; eventTimer = 0; meteorTimer = 0; tacticPulse = 0; }
    else {
      setActiveTactic(chooseTacticForWave());
      if (activeTactic) spawnTacticPack(activeTactic, true);
    }
    if (bossActive) spawnBoss();
    const supportMsg = applyWavePaceSupport(wave, bossActive);
    if (runStats) { runStats.waveStart = runTime; if (bossActive) runStats.bossStart = runTime; }
    if (!bossActive) {
      const waveMsg = supportMsg || (activeTactic ? `戰術：${activeTactic.name}` : activeEvent ? `事件波：${activeEvent.name}` : wave === 1 ? `${activeZone?.name || '標準星環'}｜異變：${currentAnomaly().name}｜第 ${wave} 波來襲` : `第 ${wave} 波來襲`);
      flash(waveMsg);
    }
    const stageMsg = stageIntroForWave(wave, bossActive);
    if (stageMsg && !tutorialShown.has(`stage-${wave}`)) setTimeout(() => { if (running && !gameOver && !skillChoosing && wave === n) { tutorialShown.add(`stage-${wave}`); flash(stageMsg); } }, 520);
    showWaveGuide(wave, bossActive);
  }

  function startEvent(forcedId = null, reward = null) {
    const ids = ['meteor', 'overclock', 'blackout', 'rich', 'hazard', 'supply', 'eliteStorm', 'droneSwarm', 'gravityWell', 'empStorm', 'salvageRush'];
    const zoneBonus = currentZone().id === 'crystal' ? ['salvageRush'] : currentZone().id === 'scrapyard' ? ['empStorm'] : [];
    const anomalyBonus = currentAnomaly()?.events || [];
    const id = forcedId || choose([...ids, ...zoneBonus, ...anomalyBonus, ...anomalyBonus]);
    activeEvent = { id, ...eventDefs[id], reward, rushStart: meta.scrap, rushGoal: id === 'salvageRush' ? 22 + wave * 3 : 0, rushDone: false };
    runEvents++;
    if (runStats && !runStats.eventsSeen.includes(eventDefs[id].name)) runStats.eventsSeen.push(eventDefs[id].name);
    eventTimer = id === 'salvageRush' ? 20 : 18 + Math.min(12, wave * .8);
    meteorTimer = .8;
    eventBannerTimer = 2.2;
    if (player) burst(player.x, player.y, eventDefs[id].color, 18, .9);
  }

  function finishEvent() {
    if (!activeEvent) return;
    const reward = activeEvent.reward;
    const name = activeEvent.name;
    const color = activeEvent.color;
    if (activeEvent.id === 'salvageRush') {
      const collected = Math.max(0, Math.floor(meta.scrap - (activeEvent.rushStart || meta.scrap)));
      if (runStats) runStats.salvageRushShards += collected;
      if (collected >= (activeEvent.rushGoal || 0)) {
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
    flash(`${name} 結束${reward ? `｜獎勵 +${reward.scrap}` : ''}`);
    activeEvent = null;
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
    const hp = (t.hp + wave * 75) * v.hp * currentDifficulty().enemy * (wave === 5 ? .78 : 1);
    const e = { type: 'boss', bossVariant: v.id, finalBoss: !!v.final, label: v.label, x: player.x, y: c.y - 80, r: (t.r + wave * (v.final ? 1.45 : .95)) * enemyScale(), hp, maxHp: hp, speed: (t.speed + wave) * v.speed * currentDifficulty().speed, spin: .7, color: v.color, sides: v.sides, scrap: Math.floor((t.scrap + wave + (v.final ? 28 : 6)) * currentDifficulty().reward), hit: 0, shootClock: v.final ? .72 : 1.1, summonClock: v.final ? 2.8 : v.id === 'brood' ? 2.2 : 0, pulseClock: v.id === 'pulse' ? 3.2 : 0, abilityClock: v.final ? 2.4 : v.id === 'forge' ? 2.1 : v.id === 'void' ? 2.8 : v.id === 'ring' ? 3.1 : v.id === 'brood' ? 2.9 : 3.4, shotMult: v.shot, phase2: false, elite: null };
    if (runStats) runStats.bossName = v.label;
    enemies.push(e);
    announceBoss(e, 'intro');
    sfx('boss');
    addShake(v.final ? 6 : 4, .22);
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
    const split = Math.min(2, upgradesRuntime.splitShot);
    const spread = split === 0 ? [0] : split === 1 ? [-.11, 0, .11] : [-.18, -.07, .07, .18];
    const lance = upgradesRuntime.lanceRounds > 0;
    const rail = upgradesRuntime.railCharge > 0 && shotSeq % Math.max(3, 7 - upgradesRuntime.railCharge) === 0;
    const crit = upgradesRuntime.critCore > 0 && Math.random() < Math.min(.34, .08 + upgradesRuntime.critCore * .055);
    const railBoost = rail ? 1 + upgradesRuntime.railOverload * .22 : 1;
    for (const s of spread) {
      bullets.push({
        type: rail ? 'rail' : lance ? 'lance' : 'pulse', homing: false, target: null, turn: 0,
        x: player.x + Math.cos(angle + s) * 23,
        y: player.y + Math.sin(angle + s) * 23,
        vx: Math.cos(angle + s) * (rail ? 940 : lance ? 820 : 690),
        vy: Math.sin(angle + s) * (rail ? 940 : lance ? 820 : 690),
        life: rail ? .98 : lance ? 1.18 : 1.05,
        r: rail ? 7.2 : lance ? 5.8 : 4.5,
        dmg: damage() * (spread.length > 1 ? .76 : 1) * (crit ? 1.75 : 1) * (rail ? (1.85 + upgradesRuntime.railCharge * .18) * railBoost : lance ? .88 + upgradesRuntime.lanceRounds * .08 : 1),
        pierce: (upgradesRuntime.chain > 1 ? 1 : 0) + (rail ? 5 + upgradesRuntime.railOverload : lance ? Math.min(3, upgradesRuntime.lanceRounds) : 0),
        blast: upgradesRuntime.plasmaBurst > 0 ? 42 + upgradesRuntime.plasmaBurst * 18 : rail && upgradesRuntime.railOverload > 0 ? 22 + upgradesRuntime.railOverload * 9 : 0,
        crit,
        burn: upgradesRuntime.burnRounds
      });
    }
    if (upgradesRuntime.flakBurst > 0) {
      const count = 2 + Math.min(5, upgradesRuntime.flakBurst * 2);
      for (let i = 0; i < count; i++) {
        const off = (i - (count - 1) / 2) * .18 + rand(-.035, .035);
        bullets.push({ type: 'flak', homing: false, target: null, turn: 0, x: player.x + Math.cos(angle + off) * 17, y: player.y + Math.sin(angle + off) * 17, vx: Math.cos(angle + off) * rand(520, 650), vy: Math.sin(angle + off) * rand(520, 650), life: .55, r: 3.8, dmg: damage() * (.26 + upgradesRuntime.flakBurst * .035), pierce: 0, blast: 18 + upgradesRuntime.flakBurst * 4, crit: false, burn: upgradesRuntime.burnRounds });
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
          type: 'seeker', homing: true, target, turn: 4.2 + upgradesRuntime.homingRounds * 1.1,
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
        bullets.push({ type: 'drone', homing: true, target, turn: 6.2, x: player.x + Math.cos(angle + off) * 20, y: player.y + Math.sin(angle + off) * 20, vx: Math.cos(angle + off) * 560, vy: Math.sin(angle + off) * 560, life: 1.1, r: 3.5, dmg: damage() * (.18 + upgradesRuntime.droneWing * .035), pierce: 0, blast: 0, crit: false, burn: 0 });
      }
    }
  }

  function enemyShoot(e) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    if (e.type === 'boss' && e.bossVariant === 'pulse') {
      const count = e.phase2 ? 18 : 12;
      const spin = runTime * (e.phase2 ? .9 : .55);
      for (let i = 0; i < count; i++) {
        const aa = spin + i / count * TWO_PI;
        const spd = (e.phase2 ? 210 : 175) * (activeEvent?.id === 'empStorm' ? .68 : 1);
        enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd, r: 4.8, life: 4.6, dmg: e.phase2 ? 13 : 10, color: '#bdfcff' });
      }
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
    const mult = e.phase2 ? .72 : 1;
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
      spawnMeteor();
      if (e.phase2 || Math.random() < .35) spawnMeteor();
      if (Math.random() < (e.phase2 ? .55 : .28)) addWorldFeature('hazard');
      recordBossMechanic('熔核流星');
      addText(e.x, e.y - e.r - 14, '熔核流星', e.color);
    } else if (e.bossVariant === 'void') {
      const add = spawnEnemy(choose(e.phase2 ? ['shieldSat', 'leech', 'sprinter'] : ['sprinter', 'chaser']));
      if (add) { add.x = e.x + rand(-80, 80); add.y = e.y + rand(-80, 80); }
      recordBossMechanic('虛空召喚');
      addText(e.x, e.y - e.r - 14, '虛空召喚', e.color);
    } else if (e.bossVariant === 'brood') {
      spawnEnemy(choose(e.phase2 ? ['leech', 'shieldSat', 'bomber'] : ['leech', 'chaser']));
      addWorldFeature('hazard');
      recordBossMechanic('母巢裂隙');
      addText(e.x, e.y - e.r - 14, '裂隙孵化', e.color);
    } else if (e.bossVariant === 'pulse') {
      const count = e.phase2 ? 22 : 14;
      const spin = runTime * (e.phase2 ? 1.2 : .75);
      for (let i = 0; i < count; i++) {
        const aa = spin + i / count * TWO_PI;
        const spd = (e.phase2 ? 235 : 190) * phaseBoost * (activeEvent?.id === 'empStorm' ? .68 : 1);
        enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(aa) * spd, vy: Math.sin(aa) * spd, r: 4.8, life: 4.4, dmg: e.phase2 ? 13 : 10, color: '#bdfcff' });
      }
      recordBossMechanic('環形脈衝');
      addText(e.x, e.y - e.r - 14, '脈衝環', e.color);
    } else if (e.finalBoss) {
      const move = choose(['meteor', 'summon', 'rift', 'pulse']);
      if (move === 'meteor') { spawnMeteor(); spawnMeteor(); }
      if (move === 'summon') spawnEnemy(choose(e.phase2 ? ['shieldSat', 'bomber', 'leech'] : ['sprinter', 'chaser']));
      if (move === 'rift') addWorldFeature('hazard');
      if (move === 'pulse') enemyShoot(e);
      recordBossMechanic('終局混合招式');
      addText(e.x, e.y - e.r - 14, '核心指令', e.color);
    } else {
      enemyShoot(e);
      recordBossMechanic('追擊扇形彈幕');
      addText(e.x, e.y - e.r - 14, '吞噬彈幕', e.color);
    }
    burst(e.x, e.y, e.color || '#ff4d6d', e.finalBoss ? 20 : 12, e.finalBoss ? 1.1 : .8);
  }

  function dropShard(x, y, amount = 1) {
    const bonus = upgradesRuntime.shardMultiplier + (currentZone().scrapBonus || 0);
    const total = Math.max(1, Math.floor((amount + bonus + (Math.random() < .25 + bonus * .08 + (meta.upgrades.survey || 0) * .025 ? 1 : 0)) * currentDifficulty().reward * (currentAnomaly()?.rewardMult || 1)));
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
    if (e.type === 'shieldSat' && runStats) runStats.shieldSatelliteKills++;
    xp += e.type === 'boss' ? 8 : e.elite ? 3 : e.type === 'tank' ? 2 : 1;
    if (e.elite) onEliteKilled(e);
    if (e.elite?.id === 'splitter' && !e.splitDone) spawnSplinters(e);
    dropShard(e.x, e.y, e.scrap + Math.floor(wave / 5) + (activeEvent?.id === 'rich' ? 2 : 0));
    maybeDropPowerup(e.x, e.y);
    burst(e.x, e.y, e.color, e.type === 'boss' ? 44 : 18, e.type === 'boss' ? 1.5 : 1);
    addText(e.x, e.y - e.r - 10, `+${scoreGain}`, e.color);
    impactFeedback(e.x, e.y, e.color, e.type === 'boss' ? 4.8 : e.elite ? 2.4 : 1.2, e.type === 'boss' ? 'bossDie' : e.elite ? 'elite' : 'kill');
    if (e.type === 'boss') {
      if (runStats) runStats.bossKillTime = Math.max(0, runTime - (runStats.bossStart || runTime));
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
  }

  function spawnSplinters(e) {
    for (let i = 0; i < 2; i++) {
      const t = enemyTypes.sprinter;
      enemies.push({ type: 'sprinter', label: '分裂碎片', x: e.x + rand(-16, 16), y: e.y + rand(-16, 16), r: 7 * enemyScale(), hp: 10 + wave * 2.2, maxHp: 10 + wave * 2.2, speed: t.speed + wave * 3.8, spin: rand(-4, 4), color: '#ffd166', sides: 3, scrap: 1, hit: 0, shootClock: rand(1, 2), elite: null, healClock: 2, splitDone: true });
    }
  }

  function spawnMeteor() {
    const fromLeft = Math.random() < .5;
    const c = camera();
    const y = rand(c.y + 90, c.y + H - 40);
    const vx = (fromLeft ? 1 : -1) * rand(360, 520);
    const vy = rand(-60, 60);
    enemyShots.push({ type: 'meteor', x: fromLeft ? c.x - 35 : c.x + W + 35, y, vx, vy, r: rand(10, 18), life: 3.2, dmg: 18 + wave * .5, color: '#ff7a3d' });
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
    if (beacon.kind === 'rift') worldFeatures = worldFeatures.filter(f => f.type !== 'hazard' || Math.hypot(f.x - beacon.x, f.y - beacon.y) > 620);
    addText(player.x, player.y - 50, `${def.name} +${instant}${bonus ? '★' : ''}`, def.color);
    burst(beacon.x, beacon.y, def.color, bonus ? 50 : 38, bonus ? 1.55 : 1.35);
    sfx('upgrade');
    addShake(bonus ? 2.2 : 1.6, .1);
    const eventId = beacon.previewEvent || chooseObjectiveEvent(beacon.kind, def);
    recordObjectiveRoute(beacon, eventId, bonus);
    startEvent(eventId, reward);
    const eventBurst = Math.max(3, Math.round((4 + Math.floor(wave / 3)) * lateGameScale()));
    for (let i = 0; i < eventBurst; i++) spawnEnemy(eventId === 'droneSwarm' ? choose(['sprinter', 'bomber']) : undefined);
    flash(`${def.name}完成：${eventDefs[eventId].name}｜${bonus ? '副目標達成 ' : ''}+${instant} 碎晶`);
    beacon = makeBeacon();
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
        if (f.cool <= 0 && !isPlayerProtected()) { playerImpact('obstacle', 2.2, 16); player.hp -= incomingDamage(f.type === 'asteroid' ? 8 : 4); damageFlash = .28; player.invuln = .38; f.cool = .75; burst(player.x, player.y, '#ff4d6d', 8); if (player.hp <= 0) endRun(); }
      }
      if (f.type === 'hazard' && d < f.r) {
        if (zoneTick <= 0 && !isPlayerProtected()) { playerImpact('hazard', 1.6, 10); player.hp -= incomingDamage(3 + wave * .12); damageFlash = .22; player.invuln = .12; burst(player.x, player.y, '#ff4d6d', 4, .45); if (player.hp <= 0) endRun(); }
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
    runTime += dt;
    eventBannerTimer = Math.max(0, eventBannerTimer - dt);
    bossAlertTimer = Math.max(0, bossAlertTimer - dt);
    damageFlash = Math.max(0, damageFlash - dt);
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

    if (upgradesRuntime.shieldRegen > 0 && player.hp < player.maxHp) {
      player.regenClock += dt;
      if (player.regenClock >= .5) {
        player.hp = Math.min(player.maxHp, player.hp + upgradesRuntime.shieldRegen * 1.7);
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

    updateBullets(dt); updateEnemies(dt); updateEnemyShots(dt); updatePickups(dt); updateParticles(dt);
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
        particles.push({ x: b.x - b.vx * .01, y: b.y - b.vy * .01, vx: rand(-10, 10), vy: rand(-10, 10), life: .14, max: .14, r: rand(1.2, 2.4), color: '#ffd166', ring: false });
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
          let hitDamage = b.dmg * weakMult;
          if (e.elite?.id === 'refractor' && (Math.floor(runTime * 2) % 2 === 0)) hitDamage *= .62;
          if (e.shield > 0) {
            const blocked = Math.min(e.shield, hitDamage * .85);
            e.shield -= blocked;
            hitDamage -= blocked * .72;
            if (runStats) runStats.shieldSatelliteTime += .05;
          }
          e.hp -= hitDamage;
          e.hit = e.type === 'boss' ? .12 : .08;
          if (b.crit) addText(e.x, e.y - e.r - 14, 'CRIT', '#fff6c7');
          if (b.burn > 0) e.burn = Math.max(e.burn || 0, 1.6 + b.burn * .35);
          impactFeedback(b.x, b.y, e.type === 'boss' ? '#ffffff' : b.homing ? '#ffd166' : '#37f6ff', e.type === 'boss' ? .9 : .55, e.type === 'boss' ? 'bossHit' : 'hit');
          if (b.blast > 0) {
            const blastDamage = b.dmg * (.35 + upgradesRuntime.plasmaBurst * .08);
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
      if (e.type === 'boss' && !e.phase2 && e.hp < e.maxHp * .5) { e.phase2 = true; e.speed *= 1.22; e.abilityClock = Math.min(e.abilityClock || 1.4, 1.1); if (runStats) runStats.bossPhase2 = true; announceBoss(e, 'phase2'); burst(e.x, e.y, e.color || '#ff4d6d', e.finalBoss ? 70 : 48, e.finalBoss ? 1.8 : 1.5); sfx('boss'); addShake(e.finalBoss ? 8 : 5, .24); haptic(e.finalBoss ? 55 : 28); }
      if (e.type === 'leech' && d < 185 && !isPlayerProtected()) {
        playerImpact('leech', 1.2, 8); player.hp -= incomingDamage(dt * (1.8 + wave * .04)); damageFlash = Math.max(damageFlash, .12);
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
            playerImpact('bomber', 5.2, 40);
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
        playerImpact(e.type === 'boss' ? 'boss' : 'collision', e.type === 'boss' ? 5.5 : 3.1, e.type === 'boss' ? 42 : 18); player.hp -= incomingDamage(Math.ceil((e.type === 'boss' ? 22 : 7) + wave * .55)); damageFlash = .32;
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
      if (dist2(s, player) < Math.pow(s.r + player.r, 2) && !isPlayerProtected()) {
        playerImpact(s.type === 'meteor' ? 'meteor' : 'projectile', s.type === 'meteor' ? 4.5 : 3.4, s.type === 'meteor' ? 38 : 20); s.dead = true; player.hp -= incomingDamage(s.dmg); damageFlash = .3; player.invuln = .45; burst(player.x, player.y, '#ff4d6d', 10);
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
      if (d < mr) { const pull = clamp(1 - d / mr, 0, 1) * 900; s.vx += (dx / Math.max(1, d)) * pull * dt; s.vy += (dy / Math.max(1, d)) * pull * dt; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (d < player.r + s.r + 8) { s.dead = true; meta.scrap += s.value; meta.score += 2; onShardCollected(s.value); sfx('pickup'); }
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
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; if (p.ring) p.r += 90 * dt; }
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
    card.querySelector('p:not(.eyebrow)').textContent = current.def ? `目前主流派：${current.def.name}（${current.score >= BUILD_CORE_SCORE ? '核心成形' : '成形中'}）。選同流派會加速核心成形，選副流派可補足弱點。` : '這些技能只在本局有效。先選一個起手流派，再沿同方向疊出核心。';
    ui.startBtn.style.display = 'none';
    ui.howBtn.style.display = 'none';
    ui.how.hidden = true;
    let box = document.getElementById('skillChoices');
    if (!box) { box = document.createElement('div'); box.id = 'skillChoices'; box.className = 'skill-choices'; card.appendChild(box); }
    box.innerHTML = '';
    for (const c of choices) {
      const def = buildDefs[c.build] || { name: '未分類', color: '#92a5c8', core: '核心' };
      const hint = buildChoiceHint(c);
      const next = topBuild(c.id);
      const btn = document.createElement('button');
      btn.className = `skill-choice${hint.startsWith('核心候選') ? ' core' : ''}`;
      btn.innerHTML = `<span class="skill-tag" style="color:${def.color}">${def.name}｜${c.role}</span><b>${c.name}</b><small>${c.desc}</small><em>目前 Lv.${upgradesRuntime[c.id]} → Lv.${upgradesRuntime[c.id] + 1}｜${hint}${next.score >= BUILD_CORE_SCORE && next.id === c.build ? '｜核心分數達標' : ''}</em>`;
      btn.addEventListener('click', () => chooseSkill(c.id, c.name));
      box.appendChild(btn);
    }
  }

  function chooseSkill(id, name) {
    upgradesRuntime[id]++;
    if (runStats) runStats.skills.push(name);
    skillChoosing = false;
    paused = false;
    ui.overlay.classList.remove('visible');
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
    const box = document.getElementById('skillChoices');
    if (box) box.remove();
    flash(`${name} Lv.${upgradesRuntime[id]}｜${detectBuildName()}`);
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
    drawWorldFeatures(); drawShards(); drawPowerups(); drawBullets(); drawEnemyShots(); drawEnemies(); drawOrbitals(); drawPlayer(); drawParticles();
    ctx.restore();
    drawMission(); drawTargetGuide(); drawEventBanner(); drawBossAlert(); drawScreenEffects(); drawTouchDpad();
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
        const color = f.type === 'hazard' ? '#ff4d6d' : f.type === 'repair' || f.type === 'convoyPod' ? '#4dff88' : f.type === 'riftSeal' ? '#b66dff' : '#ffd166';
        ctx.globalAlpha = .82 + Math.sin(performance.now() * .004 + f.seed) * .12;
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
        if (f.type === 'riftSeal') {
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
    ctx.globalAlpha = flicker ? .45 : 1;
    ctx.shadowColor = dashTime > 0 ? '#ffd166' : '#37f6ff'; ctx.shadowBlur = 10;
    if (upgradesRuntime.railCharge > 0) {
      const cadence = Math.max(3, 7 - upgradesRuntime.railCharge);
      const railReady = (shotSeq + 1) % cadence === 0;
      ctx.shadowColor = railReady ? '#ffffff' : ctx.shadowColor;
      ctx.shadowBlur = railReady ? 26 : ctx.shadowBlur;
      if (railReady) { ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(12, -9); ctx.lineTo(30, 0); ctx.lineTo(12, 9); ctx.stroke(); }
    }
    const grad = ctx.createLinearGradient(-18, 0, 28, 0); grad.addColorStop(0, '#13213f'); grad.addColorStop(.45, '#37f6ff'); grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(25, 0); ctx.lineTo(-22, -15); ctx.lineTo(-11, -4); ctx.lineTo(-24, 0); ctx.lineTo(-11, 4); ctx.lineTo(-22, 15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#eef7ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.arc(0, 0, 5.2, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = '#ff3df2'; ctx.globalAlpha *= .82; ctx.beginPath(); ctx.moveTo(-23, -5); ctx.lineTo(-29 - Math.random() * 4, 0); ctx.lineTo(-23, 5); ctx.fill();
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
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(a);
      ctx.shadowColor = b.homing ? '#ffd166' : '#37f6ff';
      ctx.shadowBlur = b.homing ? 20 : 15;
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
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.moveTo(b.r + 3, 0); ctx.lineTo(0, b.r + 2); ctx.lineTo(-b.r - 3, 0); ctx.lineTo(0, -b.r - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff6c7'; ctx.beginPath(); ctx.arc(2, 0, b.r * .42, 0, TWO_PI); ctx.fill();
      } else {
        ctx.fillStyle = '#bdfcff'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TWO_PI); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawEnemyShots() { ctx.save(); for (const s of enemyShots) { const sr = Math.max(2.5, s.r * visualScale()); ctx.shadowColor = s.type === 'meteor' ? '#ff7a3d' : '#ff3df2'; ctx.shadowBlur = s.type === 'meteor' ? 14 : 8; ctx.fillStyle = s.type === 'meteor' ? '#ffb36b' : '#ff9af8'; ctx.beginPath(); ctx.arc(s.x, s.y, sr, 0, TWO_PI); ctx.fill(); if (s.type === 'meteor') { ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = 1.5; ctx.stroke(); } } ctx.restore(); }

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

  function drawShards() { ctx.save(); for (const s of shards) { const sr = Math.max(2.5, s.r * visualScale()); ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 8; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(s.x, s.y - sr); ctx.lineTo(s.x + sr, s.y); ctx.lineTo(s.x, s.y + sr); ctx.lineTo(s.x - sr, s.y); ctx.closePath(); ctx.fill(); } ctx.restore(); }

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
    for (const p of particles) { const alpha = clamp(p.life / p.max, 0, 1); ctx.globalAlpha = alpha; ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = p.ring ? 3 : 8; ctx.beginPath(); if (p.ring) { ctx.lineWidth = 1; ctx.arc(p.x, p.y, Math.min(p.r, 26 * visualScale()), 0, TWO_PI); ctx.stroke(); } else { ctx.arc(p.x, p.y, p.r * visualScale(), 0, TWO_PI); ctx.fill(); } }
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 14px system-ui';
    for (const t of floatText) { ctx.globalAlpha = clamp(t.life / t.max, 0, 1); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
    ctx.restore();
  }

  function drawMission() {
    ctx.save();
    const tutorialStep = currentTutorialStep();
    const hasTutorial = !!tutorialStep;
    const hasTactic = !!activeTactic && !bossActive;
    const hasObjective = !!beacon;
    const stage = runStageForWave(wave);
    const compactMission = controlMode === 'touch' || W < 640;
    if (compactMission) {
      const x = 10; const y = 104; const w = Math.min(W - 20, 258);
      const h = activeEvent || beacon || hasTutorial ? 78 : 64;
      const zone = currentZone();
      const progress = mission ? clamp(mission.check() / mission.target, 0, 1) : 0;
      ctx.globalAlpha = .82; ctx.fillStyle = 'rgba(5,7,18,.56)'; ctx.strokeStyle = mission?.done ? '#4dff88' : currentAnomaly().color || '#ffd166'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = mission?.done ? '#4dff88' : '#ffd166'; ctx.font = '900 10px system-ui';
      ctx.fillText(mission?.done ? '任務完成' : mission?.text || '任務', x + 8, y + 17, w - 96);
      ctx.textAlign = 'right'; ctx.fillStyle = zone.color || '#37f6ff'; ctx.fillText(zone.name || '星環', x + w - 8, y + 17, 86); ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 8, y + 25, w - 16, 3);
      ctx.fillStyle = mission?.done ? '#4dff88' : '#37f6ff'; ctx.fillRect(x + 8, y + 25, (w - 16) * progress, 3);

      const anomaly = currentAnomaly();
      ctx.fillStyle = anomaly.color || '#ffd166'; ctx.font = '900 10px system-ui';
      ctx.fillText(`${anomaly.name}｜${anomalyTaskText()}`, x + 8, y + 43, w - 16);

      let detail = `節奏 ${stage.name}`;
      let color = stage.color || '#bdfcff';
      if (activeEvent) { detail = `事件 ${activeEvent.name}｜${Math.ceil(eventTimer)}s`; color = activeEvent.color; }
      else if (beacon) {
        const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
        detail = `目標 ${def.name}｜${objectiveSideText(beacon)}${objectiveSideComplete(beacon) ? ' ★' : ''}`;
        color = def.color;
      } else if (hasTactic) { detail = `戰術 ${activeTactic.name}`; color = activeTactic.color || '#ffd166'; }
      if (hasTutorial && !activeEvent && !beacon) {
        const tp = tutorialProgress(tutorialStep);
        detail = `教學 ${tutorialStep.label}｜${tp.value}/${tp.target}`;
        color = '#bdfcff';
      }
      ctx.fillStyle = color; ctx.font = '800 9px system-ui';
      ctx.fillText(detail, x + 8, y + 58, w - 16);
      if (activeEvent) {
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 8, y + 65, w - 16, 3);
        ctx.fillStyle = activeEvent.color; ctx.fillRect(x + 8, y + 65, (w - 16) * clamp(eventTimer / 30, 0, 1), 3);
      } else if (beacon) {
        const sidePct = clamp(objectiveSideProgress(beacon) / objectiveSideGoal(beacon), 0, 1);
        const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 8, y + 65, w - 16, 3);
        ctx.fillStyle = objectiveSideComplete(beacon) ? '#4dff88' : def.color; ctx.fillRect(x + 8, y + 65, (w - 16) * sidePct, 3);
      }
      ctx.restore();
      return;
    }
    const x = 12; const y = 112; const w = 286;
    const h = 106 + (activeEvent ? 24 : 0) + (hasTactic ? 30 : 0) + (hasObjective ? 32 : 0) + (hasTutorial ? 42 : 0);
    ctx.globalAlpha = .86; ctx.fillStyle = 'rgba(5,7,18,.58)'; ctx.strokeStyle = mission?.done ? '#4dff88' : activeTactic?.color || '#ffd166'; ctx.lineWidth = 1;
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
    lineY += 22;
    const anomaly = currentAnomaly();
    ctx.fillStyle = anomaly.color || '#ffd166'; ctx.font = '900 11px system-ui';
    ctx.fillText(`P1 異變｜${anomaly.name}`, x + 10, lineY, w - 20);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(`${anomaly.tag || anomaly.desc || '本局規則'}｜${anomalyTaskText()}`, x + 10, lineY + 15, w - 20);
    lineY += 22;
    if (activeEvent) {
      ctx.fillStyle = activeEvent.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 事件｜${activeEvent.name} ${Math.ceil(eventTimer)}s`, x + 10, lineY);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 10, lineY + 6, w - 20, 4);
      ctx.fillStyle = activeEvent.color; ctx.fillRect(x + 10, lineY + 6, (w - 20) * clamp(eventTimer / 30, 0, 1), 4);
      lineY += 24;
    }
    if (hasTactic) {
      ctx.fillStyle = activeTactic.color || '#ffd166'; ctx.font = '900 11px system-ui';
      ctx.fillText(`P2 戰術｜${activeTactic.name}`, x + 10, lineY, w - 20);
      ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
      ctx.fillText(activeTactic.desc || '敵群正在形成組合壓力。', x + 10, lineY + 15, w - 20);
      lineY += 30;
    }
    if (beacon) {
      const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
      const preview = eventDefs[beacon.previewEvent]?.name || '未知事件';
      const sidePct = clamp(objectiveSideProgress(beacon) / objectiveSideGoal(beacon), 0, 1);
      ctx.fillStyle = def.color; ctx.font = '900 11px system-ui';
      ctx.fillText(`P3 目標｜${def.name} → ${preview}`, x + 10, lineY, w - 20);
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
    if (!beacon || !player || !running || gameOver) return;
    const c = camera();
    const sx = beacon.x - c.x;
    const sy = beacon.y - c.y;
    const d = Math.hypot(beacon.x - player.x, beacon.y - player.y);
    const def = objectiveDefs[beacon.kind] || objectiveDefs.scan;
    const inside = sx > 46 && sx < W - 46 && sy > 92 && sy < H - 46;
    const pulse = .55 + Math.sin(performance.now() * .006) * .22;
    const charge = clamp((beacon.charge || 0) / def.charge, 0, 1);
    ctx.save();
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 14;
    if (inside) {
      ctx.globalAlpha = .42 + pulse * .36;
      ctx.strokeStyle = def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 32 + pulse * 7, 0, TWO_PI); ctx.stroke();
      if (charge > 0) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 44, -Math.PI / 2, -Math.PI / 2 + TWO_PI * charge); ctx.stroke(); }
    } else {
      const a = Math.atan2(sy - H / 2, sx - W / 2);
      const x = clamp(W / 2 + Math.cos(a) * (Math.min(W, H) * .43), 36, W - 36);
      const y = clamp(H / 2 + Math.sin(a) * (Math.min(W, H) * .43), 92, H - 36);
      const scale = clamp(1.25 - d / 1800, .68, 1.15);
      ctx.translate(x, y); ctx.rotate(a); ctx.scale(scale, scale);
      ctx.globalAlpha = .72 + pulse * .24;
      ctx.fillStyle = def.color; ctx.strokeStyle = '#050712'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-10, -11); ctx.lineTo(-5, 0); ctx.lineTo(-10, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = def.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 22, -0.6, 0.6); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEventBanner() {
    if (!activeEvent || eventBannerTimer <= 0) return;
    const a = clamp(eventBannerTimer / 2.2, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(.95, a + .15);
    const w = Math.min(430, W - 28), h = 56, x = (W - w) / 2, y = 86;
    ctx.fillStyle = 'rgba(5,7,18,.78)'; ctx.strokeStyle = activeEvent.color; ctx.lineWidth = 2;
    ctx.shadowColor = activeEvent.color; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = activeEvent.color; ctx.font = '900 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(activeEvent.name, W / 2, y + 24);
    ctx.fillStyle = 'rgba(238,247,255,.82)'; ctx.font = '800 10px system-ui';
    ctx.fillText(activeEvent.desc, W / 2, y + 41);
    ctx.restore();
  }

  function drawBossAlert() {
    if (!bossAlert || bossAlertTimer <= 0) return;
    const a = clamp(bossAlertTimer / 3.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(.96, a + .18);
    const w = Math.min(520, W - 28), h = 68, x = (W - w) / 2, y = activeEvent && eventBannerTimer > 0 ? 150 : 86;
    ctx.fillStyle = 'rgba(5,7,18,.84)'; ctx.strokeStyle = bossAlert.color; ctx.lineWidth = 2.4;
    ctx.shadowColor = bossAlert.color; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.fill(); ctx.stroke();
    ctx.fillStyle = bossAlert.color; ctx.font = '950 16px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(bossAlert.title, W / 2, y + 27);
    ctx.fillStyle = 'rgba(238,247,255,.86)'; ctx.font = '850 11px system-ui';
    ctx.fillText(bossAlert.desc, W / 2, y + 47);
    ctx.restore();
  }

  function drawScreenEffects() {
    if (damageFlash <= 0) return;
    ctx.save();
    const a = clamp(damageFlash / .34, 0, 1) * .18;
    ctx.strokeStyle = `rgba(255,77,109,${a * 2.1})`;
    ctx.lineWidth = 18;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.fillStyle = `rgba(255,77,109,${a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawTouchDpad() {
    if (controlMode !== 'touch' || !touchMove.pressed) return;
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

  function loop(now) { const dt = Math.min((now - lastTime) / 1000, .05); lastTime = now; updateFeedbackTimers(dt); update(dt); draw(); requestAnimationFrame(loop); }

  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  window.addEventListener('blur', clearMovementInput);
  window.addEventListener('pagehide', clearMovementInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovementInput(); });
  window.addEventListener('keydown', e => {
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
