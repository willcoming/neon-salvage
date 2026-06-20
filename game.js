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
    howBtn: document.getElementById('howBtn'),
    how: document.getElementById('how'),
    toast: document.getElementById('toast'),
    controlModeBtn: document.getElementById('controlModeBtn'),
    autoAimBtn: document.getElementById('autoAimBtn'),
    upgradePrompt: document.getElementById('upgradePrompt'),
    offlineNotice: document.getElementById('offlineNotice'),
    touchGuide: document.getElementById('touchGuide')
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
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches || window.innerWidth <= 860;
  let controlMode = coarsePointer ? 'touch' : 'keyboard';
  const touchMove = { x: 0, y: 0, active: false, pressed: false, sx: W / 2, sy: H / 2, cx: W / 2, cy: H / 2, dir: '', force: 0 };

  const baseState = () => ({
    scrap: 0,
    score: 0,
    bestWave: 1,
    achievements: {},
    lastSaved: Date.now(),
    upgrades: { cannon: 0, shield: 0, engine: 0, magnet: 0, drone: 0 }
  });

  let meta = loadSave();
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
  let autoAim = false;
  let activeEvent = null;
  let eventTimer = 0;
  let meteorTimer = 0;
  let worldFeatures = [];
  let featurePulse = 0;
  let zoneTick = 0;
  let beacon = null;

  const upgradesRuntime = {
    splitShot: 0,
    chain: 0,
    shieldRegen: 0,
    shardMultiplier: 0,
    slowField: 0,
    orbitals: 0,
    homingRounds: 0,
    weakScan: 0,
    harvestDrive: 0
  };

  const upgradeDefs = [
    { id: 'cannon', name: '脈衝主砲', desc: '提高射速與子彈傷害。', base: 18, scale: 1.47, max: 12 },
    { id: 'shield', name: '護盾矩陣', desc: '提高最大護盾，每級 +15。', base: 16, scale: 1.45, max: 12 },
    { id: 'engine', name: '離子引擎', desc: '提高移動速度與衝刺恢復。', base: 15, scale: 1.42, max: 10 },
    { id: 'magnet', name: '磁吸場', desc: '擴大碎晶自動吸附範圍。', base: 12, scale: 1.4, max: 10 },
    { id: 'drone', name: '無人機合約', desc: '提高離線碎晶收益。', base: 28, scale: 1.62, max: 8 }
  ];

  const skillPool = [
    { id: 'splitShot', name: '三叉脈衝', desc: '主砲增加散射彈道。' },
    { id: 'chain', name: '連鎖電弧', desc: '擊殺時對附近敵人造成電弧傷害。' },
    { id: 'shieldRegen', name: '自修護盾', desc: '每秒緩慢回復護盾。' },
    { id: 'shardMultiplier', name: '碎晶精煉', desc: '敵人掉落碎晶增加。' },
    { id: 'slowField', name: '重力干擾', desc: '敵人靠近時會被減速。' },
    { id: 'orbitals', name: '環繞刃翼', desc: '生成環繞玩家的近距離傷害刃翼。' },
    { id: 'homingRounds', name: '追蹤子彈', desc: '原本的脈衝主砲子彈會微幅追蹤敵人。' },
    { id: 'weakScan', name: '弱點掃描', desc: '對精英與 Boss 造成額外傷害。' },
    { id: 'harvestDrive', name: '收割引擎', desc: '連續擊殺會短暫提高射速。' }
  ];

  const enemyTypes = {
    chaser: { label: '追獵機', color: '#37f6ff', hp: 21, speed: 68, r: 15, sides: 5, scrap: 1 },
    sprinter: { label: '閃擊機', color: '#4dff88', hp: 13, speed: 128, r: 11, sides: 3, scrap: 1 },
    tank: { label: '重甲機', color: '#ffd166', hp: 58, speed: 42, r: 24, sides: 6, scrap: 3 },
    shooter: { label: '狙擊球', color: '#ff3df2', hp: 27, speed: 50, r: 17, sides: 8, scrap: 2 },
    boss: { label: '星環吞噬者', color: '#ff4d6d', hp: 520, speed: 34, r: 48, sides: 10, scrap: 18 }
  };

  const eliteMods = {
    shielded: { name: '護盾', color: '#7aa7ff', hp: 1.55, speed: .92, scrap: 2 },
    splitter: { name: '分裂', color: '#ffd166', hp: 1.18, speed: 1.02, scrap: 2 },
    berserk: { name: '狂暴', color: '#ff4d6d', hp: .9, speed: 1.42, scrap: 2 },
    medic: { name: '治療', color: '#4dff88', hp: 1.28, speed: .96, scrap: 3 },
    phantom: { name: '幻影', color: '#bdfcff', hp: .82, speed: 1.64, scrap: 3 },
    juggernaut: { name: '巨像', color: '#ff9f1c', hp: 2.05, speed: .72, scrap: 4 }
  };

  const eventDefs = {
    meteor: { name: '流星雨', desc: '危險流星穿越戰場，擊中敵我皆會受傷。', color: '#ff7a3d' },
    overclock: { name: '超頻風暴', desc: '你的射速提升，但敵人行動也更快。', color: '#37f6ff' },
    blackout: { name: '電磁干擾', desc: '狙擊球變多，自動鎖定半徑縮短。', color: '#ff3df2' },
    rich: { name: '碎晶富礦', desc: '敵人掉落增加，但精英出現率提高。', color: '#ffd166' },
    hazard: { name: '輻射裂隙', desc: '危險區域擴散，靠近會持續受損。', color: '#ff4d6d' },
    supply: { name: '補給航道', desc: '補給站出現率提高，適合喘息與回復。', color: '#4dff88' },
    eliteStorm: { name: '菁英獵殺令', desc: '菁英敵人大量出現，但擊破獎勵提高。', color: '#bdfcff' }
  };

  const achievementDefs = [
    { id: 'wave5', name: '突破第 5 波', test: () => wave >= 5, reward: 20 },
    { id: 'kills50', name: '擊毀 50 架無人機', test: () => totalKills >= 50, reward: 35 },
    { id: 'boss1', name: '擊破第一台 Boss', test: () => meta.achievements.bossKilled, reward: 60 },
    { id: 'scrap200', name: '累積 200 碎晶', test: () => meta.scrap >= 200, reward: 45 }
  ];

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = window.innerWidth;
    H = window.innerHeight;
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
  }

  function resetSave() {
    if (!confirm('確定要重置宇宙？所有碎晶、成就與永久升級都會清除。')) return;
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem('neon-salvage-save-v1');
    meta = baseState();
    hardResetRun();
    save(true);
    flash('宇宙已重置');
  }

  function applyOfflineRewards() {
    const elapsed = Math.max(0, Date.now() - (meta.lastSaved || Date.now()));
    const hours = Math.min(24, elapsed / 36e5);
    const drone = meta.upgrades.drone || 0;
    if (drone <= 0 || hours < 0.05) return;
    const gain = Math.floor(hours * drone * 10 + Math.sqrt(Math.max(1, meta.bestWave)) * hours * 2.5);
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

  function availableUpgradeCount() {
    return upgradeDefs.filter(def => {
      const lvl = meta.upgrades[def.id] || 0;
      return lvl < def.max && meta.scrap >= upgradeCost(def);
    }).length;
  }

  function canUsePermanentUpgrades() {
    return running && paused && !gameOver && !skillChoosing;
  }

  function isUpgradeModalOpen() {
    return !!ui.upgradeModal && !ui.upgradeModal.hidden;
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

  function closeUpgradeModal() {
    if (ui.upgradeModal) ui.upgradeModal.hidden = true;
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
    flash(`${def.name} 升到 Lv.${lvl + 1}`);
  }

  function renderUpgrades() {
    ui.upgrades.innerHTML = '';
    for (const def of upgradeDefs) {
      const lvl = meta.upgrades[def.id] || 0;
      const cost = upgradeCost(def);
      const el = document.createElement('article');
      el.className = 'upgrade';
      el.innerHTML = `<header><strong>${def.name}</strong><span class="level">Lv.${lvl}/${def.max}</span></header><p>${def.desc}</p><button ${!canUsePermanentUpgrades() || lvl >= def.max || meta.scrap < cost ? 'disabled' : ''}>${lvl >= def.max ? '已滿級' : `升級｜${cost} 碎晶`}</button>`;
      el.querySelector('button').addEventListener('click', () => buyUpgrade(def.id));
      ui.upgrades.appendChild(el);
    }
    ui.scrap.textContent = Math.floor(meta.scrap).toString();
  }

  function maxHp() { return 110 + (meta.upgrades.shield || 0) * 15; }
  function playerScale() { return controlMode === 'touch' ? .78 : 1; }
  function playerRadius() { return 17 * playerScale(); }
  function speed() { return (282 + (meta.upgrades.engine || 0) * 18) * (controlMode === 'touch' ? .88 : 1); }
  function fireRate() { return Math.max(.075, .215 - (meta.upgrades.cannon || 0) * .011); }
  function weaponFireRate() {
    const harvest = upgradesRuntime.harvestDrive > 0 ? Math.max(.72, 1 - Math.min(.28, (runKills % 10) * .028 * upgradesRuntime.harvestDrive)) : 1;
    const storm = activeEvent?.id === 'overclock' ? .78 : 1;
    return fireRate() * harvest * storm;
  }
  function damage() { return 15 + (meta.upgrades.cannon || 0) * 2.45; }
  function magnetRange() { return 92 + (meta.upgrades.magnet || 0) * 28; }
  function isPlayerProtected() { return !!player && (player.invuln > 0 || runTime < 3.5); }

  function hardResetRun() {
    player = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: playerRadius(), hp: maxHp(), maxHp: maxHp(), invuln: 3.5, regenClock: 0 };
    bullets = []; enemies = []; shards = []; particles = []; floatText = []; powerups = []; enemyShots = []; worldFeatures = []; beacon = makeBeacon(); zoneTick = 0;
    Object.keys(upgradesRuntime).forEach(k => { upgradesRuntime[k] = 0; });
    wave = 1; xp = 0; xpNeed = 12; runKills = 0; totalKills = 0; runTime = 0; bossActive = false; gameOver = false; skillChoosing = false; activeEvent = null; eventTimer = 0; meteorTimer = 0;
    mission = newMission();
    startWave(1);
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

  function startWave(n) {
    wave = n;
    bossActive = n % 5 === 0;
    const mobileEase = controlMode === 'touch' ? .84 : 1;
    spawnLeft = bossActive ? 0 : Math.floor((5 + n * 1.55 + Math.pow(n, 1.08)) * mobileEase);
    spawnTimer = bossActive ? .55 : n === 1 ? .95 : controlMode === 'touch' ? .58 : .45;
    if (wave >= 9 && !bossActive && (wave % 3 === 0 || Math.random() < .28)) startEvent();
    if (!beacon || wave % 3 === 1) beacon = makeBeacon();
    if (bossActive) { activeEvent = null; eventTimer = 0; meteorTimer = 0; }
    if (bossActive) spawnBoss();
    flash(bossActive ? `Boss 波：第 ${wave} 波` : activeEvent ? `事件波：${activeEvent.name}` : `第 ${wave} 波來襲`);
  }

  function startEvent() {
    const ids = ['meteor', 'overclock', 'blackout', 'rich', 'hazard', 'supply', 'eliteStorm'];
    const id = choose(ids);
    activeEvent = { id, ...eventDefs[id] };
    eventTimer = 18 + Math.min(12, wave * .8);
    meteorTimer = .8;
  }

  function spawnEnemy(typeId) {
    const side = Math.floor(Math.random() * 4);
    const pad = 58;
    const pick = typeId || pickEnemyType();
    const t = enemyTypes[pick];
    const e = {
      type: pick,
      label: t.label,
      x: (() => { const c = camera(); return side === 0 ? c.x - pad : side === 1 ? c.x + W + pad : rand(c.x, c.x + W); })(),
      y: (() => { const c = camera(); return side === 2 ? c.y - pad : side === 3 ? c.y + H + pad : rand(c.y, c.y + H); })(),
      r: t.r + Math.min(9, wave * .18),
      hp: t.hp + wave * (pick === 'tank' ? 7.2 : pick === 'sprinter' ? 3.2 : 4.7),
      maxHp: 1,
      speed: (t.speed + wave * (pick === 'sprinter' ? 3.25 : 2.05)) * (wave === 1 ? .82 : 1) * (activeEvent?.id === 'overclock' ? 1.14 : 1),
      spin: rand(-3, 3),
      color: t.color,
      sides: t.sides,
      scrap: t.scrap,
      hit: 0,
      shootClock: rand(.8, 2.4),
      elite: null,
      healClock: rand(1.1, 2.0),
      splitDone: false
    };
    maybeApplyElite(e, pick);
    e.maxHp = e.hp;
    enemies.push(e);
  }

  function pickEnemyType() {
    const pool = ['chaser', 'chaser', 'chaser'];
    if (wave >= 2) pool.push('sprinter');
    if (wave >= 3 || activeEvent?.id === 'blackout') pool.push('shooter');
    if (wave >= 4) pool.push('tank');
    if (wave >= 8) pool.push('sprinter', 'shooter');
    if (activeEvent?.id === 'blackout') pool.push('shooter', 'shooter');
    return choose(pool);
  }

  function maybeApplyElite(e, pick) {
    if (pick === 'boss' || wave < 7) return;
    const chance = Math.min(.12 + wave * .012 + (activeEvent?.id === 'rich' ? .12 : 0) + (activeEvent?.id === 'eliteStorm' ? .20 : 0), .48);
    if (Math.random() > chance) return;
    const id = choose(wave >= 12 ? ['shielded', 'splitter', 'berserk', 'medic', 'phantom', 'juggernaut'] : ['shielded', 'splitter', 'berserk', 'medic']);
    const mod = eliteMods[id];
    e.elite = { id, name: mod.name, color: mod.color };
    e.label = `${mod.name}${e.label}`;
    e.hp *= mod.hp;
    e.speed *= mod.speed;
    e.scrap += mod.scrap + (activeEvent?.id === 'eliteStorm' ? 2 : 0);
    e.r += id === 'shielded' ? 4 : 2;
    e.color = mod.color;
  }

  function spawnBoss() {
    const t = enemyTypes.boss;
    const c = camera();
    const variants = [
      { id: 'ring', label: '星環吞噬者', color: '#ff4d6d', hp: 1, speed: 1, sides: 10, shot: 1 },
      { id: 'forge', label: '熔核鍛造者', color: '#ff9f1c', hp: 1.18, speed: .86, sides: 8, shot: .88 },
      { id: 'void', label: '虛空指揮官', color: '#b66dff', hp: .92, speed: 1.22, sides: 12, shot: 1.18 }
    ];
    const v = variants[Math.floor((wave / 5 - 1) % variants.length)];
    const hp = (t.hp + wave * 75) * v.hp;
    const e = { type: 'boss', bossVariant: v.id, label: v.label, x: player.x, y: c.y - 80, r: t.r + wave * 1.5, hp, maxHp: hp, speed: (t.speed + wave) * v.speed, spin: .7, color: v.color, sides: v.sides, scrap: t.scrap + wave + 6, hit: 0, shootClock: 1.1, shotMult: v.shot, phase2: false, elite: null };
    enemies.push(e);
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

  function isMouseAiming() {
    if (controlMode === 'touch') return false;
    return mouse.down || performance.now() - mouse.lastMove < 1500;
  }

  function shotTarget() {
    const target = autoAim && !isMouseAiming() ? nearestEnemy(activeEvent?.id === 'blackout' ? 520 : Infinity) : null;
    if (target) return Math.atan2(target.y - player.y, target.x - player.x);
    return mouseAimAngle();
  }

  function toggleAutoAim() {
    autoAim = !autoAim;
    flash(autoAim ? '自動鎖定最近敵人：ON' : '自動鎖定最近敵人：OFF');
    updateCombatControls();
  }

  function setControlMode(mode, announce = true) {
    controlMode = mode === 'touch' ? 'touch' : 'keyboard';
    document.body.dataset.controlMode = controlMode;
    autoAim = controlMode === 'touch';
    if (player) player.r = playerRadius();
    touchMove.x = 0; touchMove.y = 0; touchMove.active = false; touchMove.pressed = false; touchMove.dir = ''; touchMove.force = 0;
    if (announce) flash(controlMode === 'touch' ? '手機自動模式：自動瞄準 ON' : '鍵鼠模式：鍵盤移動 / 滑鼠瞄準');
    updateCombatControls();
  }

  function toggleControlMode() {
    setControlMode(controlMode === 'touch' ? 'keyboard' : 'touch');
  }

  function updateCombatControls() {
    if (ui.controlModeBtn) {
      ui.controlModeBtn.textContent = `操作：${controlMode === 'touch' ? '手機自動' : '鍵鼠模式'}`;
      ui.controlModeBtn.classList.toggle('active', controlMode === 'touch');
    }
    if (ui.autoAimBtn) {
      ui.autoAimBtn.textContent = `自動鎖定：${autoAim ? 'ON' : 'OFF'}`;
      ui.autoAimBtn.classList.toggle('active', autoAim);
    }
  }

  function shoot() {
    const angle = shotTarget();
    const split = Math.min(2, upgradesRuntime.splitShot);
    const spread = split === 0 ? [0] : split === 1 ? [-.11, 0, .11] : [-.18, -.07, .07, .18];
    const homing = upgradesRuntime.homingRounds > 0;
    const target = homing ? nearestEnemy(activeEvent?.id === 'blackout' ? 520 : 860) : null;
    for (const s of spread) {
      bullets.push({
        type: 'pulse', homing, target, turn: 3.8 + upgradesRuntime.homingRounds * 1.3,
        x: player.x + Math.cos(angle + s) * 23,
        y: player.y + Math.sin(angle + s) * 23,
        vx: Math.cos(angle + s) * 690,
        vy: Math.sin(angle + s) * 690,
        life: homing ? 1.24 : 1.05,
        r: homing ? 5.4 : 4.5,
        dmg: damage() * (spread.length > 1 ? .76 : 1),
        pierce: upgradesRuntime.chain > 1 ? 1 : 0
      });
    }
  }

  function enemyShoot(e) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    const count = e.type === 'boss' ? (e.bossVariant === 'void' ? (e.phase2 ? 15 : 9) : e.phase2 ? 11 : 7) : 1;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i - (count - 1) / 2) * (e.phase2 ? .13 : .16);
      const bossSpeed = (e.type === 'boss' ? (e.phase2 ? 235 : 205) * (e.shotMult || 1) : 250);
      enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(a + off) * bossSpeed, vy: Math.sin(a + off) * bossSpeed, r: e.type === 'boss' ? 5 : 4, life: 4, dmg: e.type === 'boss' ? (e.phase2 ? 15 : 12) : 8 });
    }
  }

  function dropShard(x, y, amount = 1) {
    const bonus = upgradesRuntime.shardMultiplier;
    const total = amount + bonus + (Math.random() < .25 + bonus * .08 ? 1 : 0);
    for (let i = 0; i < total; i++) {
      const a = Math.random() * TWO_PI;
      shards.push({ x: x + rand(-12, 12), y: y + rand(-12, 12), vx: Math.cos(a) * rand(45, 145), vy: Math.sin(a) * rand(45, 145), r: rand(4, 7), value: 1, life: 20 });
    }
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > .045) return;
    const kind = choose(['heal', 'nova', 'rapid']);
    powerups.push({ kind, x, y, r: 12, life: 12, spin: 0 });
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

  function killEnemy(e) {
    e.dead = true;
    const scoreGain = Math.floor((e.type === 'boss' ? 400 : 16) + wave * (e.type === 'boss' ? 24 : 3.5));
    meta.score += scoreGain;
    totalKills++; runKills++;
    xp += e.type === 'boss' ? 8 : e.elite ? 3 : e.type === 'tank' ? 2 : 1;
    if (e.elite?.id === 'splitter' && !e.splitDone) spawnSplinters(e);
    dropShard(e.x, e.y, e.scrap + Math.floor(wave / 5) + (activeEvent?.id === 'rich' ? 2 : 0));
    maybeDropPowerup(e.x, e.y);
    burst(e.x, e.y, e.color, e.type === 'boss' ? 44 : 18, e.type === 'boss' ? 1.5 : 1);
    addText(e.x, e.y - e.r - 10, `+${scoreGain}`, e.color);
    if (e.type === 'boss') {
      meta.achievements.bossKilled = true;
      bossActive = false;
      flash('Boss 擊破！星環暫時安全');
    }
    if (upgradesRuntime.chain > 0) chainArc(e.x, e.y, e.type === 'boss' ? 80 : 42);
    checkAchievements();
  }

  function spawnSplinters(e) {
    for (let i = 0; i < 2; i++) {
      const t = enemyTypes.sprinter;
      enemies.push({ type: 'sprinter', label: '分裂碎片', x: e.x + rand(-16, 16), y: e.y + rand(-16, 16), r: 9, hp: 10 + wave * 2.2, maxHp: 10 + wave * 2.2, speed: t.speed + wave * 3.8, spin: rand(-4, 4), color: '#ffd166', sides: 3, scrap: 1, hit: 0, shootClock: rand(1, 2), elite: null, healClock: 2, splitDone: true });
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
        flash(`成就解鎖：${a.name} +${a.reward} 碎晶`);
      }
    }
  }


  function makeBeacon() {
    const a = Math.random() * TWO_PI;
    const d = rand(760, 1450);
    return { x: player ? player.x + Math.cos(a) * d : W / 2 + 900, y: player ? player.y + Math.sin(a) * d : H / 2 - 700, r: 86, pulse: 0 };
  }

  function addWorldFeature(kind = null) {
    if (!player) return;
    const types = kind ? [kind] : ['asteroid', 'debris', 'resource', 'resource', 'hazard', 'repair'];
    const type = choose(types);
    const a = Math.random() * TWO_PI;
    const d = rand(Math.min(W, H) * .72, Math.max(W, H) * 1.9);
    const base = {
      type,
      x: player.x + Math.cos(a) * d,
      y: player.y + Math.sin(a) * d,
      r: type === 'asteroid' ? rand(34, 72) : type === 'debris' ? rand(24, 48) : type === 'repair' ? 44 : type === 'hazard' ? rand(110, 190) : rand(95, 165),
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
    const target = 24 + Math.min(14, Math.floor(wave / 2));
    while (worldFeatures.length < target) addWorldFeature();
  }

  function updateWorldFeatures(dt) {
    if (!player) return;
    for (const f of worldFeatures) {
      f.cool = Math.max(0, f.cool - dt);
      f.spin += dt * .2;
      const d = Math.hypot(player.x - f.x, player.y - f.y);
      if ((f.type === 'asteroid' || f.type === 'debris') && d < player.r + f.r * .76) {
        const a = Math.atan2(player.y - f.y, player.x - f.x);
        const push = (player.r + f.r * .76 - d) + 1;
        player.x += Math.cos(a) * push;
        player.y += Math.sin(a) * push;
        if (f.cool <= 0 && !isPlayerProtected()) { player.hp -= f.type === 'asteroid' ? 8 : 4; player.invuln = .38; f.cool = .75; burst(player.x, player.y, '#ff4d6d', 8); if (player.hp <= 0) endRun(); }
      }
      if (f.type === 'hazard' && d < f.r) {
        if (zoneTick <= 0 && !isPlayerProtected()) { player.hp -= 3 + wave * .12; player.invuln = .12; burst(player.x, player.y, '#ff4d6d', 4, .45); }
      }
      if (f.type === 'repair' && d < f.r && f.cool <= 0) {
        player.hp = Math.min(player.maxHp, player.hp + 14);
        f.cool = 3.2;
        addText(player.x, player.y - 34, '補給 +14', '#4dff88');
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
    if (zoneTick <= 0) zoneTick = .55;
  }

  function update(dt) {
    if (!running || paused || gameOver || skillChoosing) return;
    dt = Math.min(dt, .033);
    runTime += dt;
    if (activeEvent) {
      eventTimer -= dt;
      if (activeEvent.id === 'meteor') { meteorTimer -= dt; if (meteorTimer <= 0) { spawnMeteor(); meteorTimer = rand(.75, 1.35); } }
      if (activeEvent.id === 'hazard' && Math.random() < dt * .55) addWorldFeature('hazard');
      if (activeEvent.id === 'supply' && Math.random() < dt * .38) addWorldFeature('repair');
      if (eventTimer <= 0) { flash(`${activeEvent.name} 結束`); activeEvent = null; }
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
    updateWorldFeatures(dt);

    if (upgradesRuntime.shieldRegen > 0 && player.hp < player.maxHp) {
      player.regenClock += dt;
      if (player.regenClock >= .5) {
        player.hp = Math.min(player.maxHp, player.hp + upgradesRuntime.shieldRegen * 1.7);
        player.regenClock = 0;
      }
    }

    if (shotTimer <= 0) { shoot(); shotTimer = weaponFireRate(); }
    if (spawnLeft > 0 && spawnTimer <= 0) { spawnEnemy(); spawnLeft--; spawnTimer = Math.max(controlMode === 'touch' ? .28 : .20, (wave === 1 ? 1.05 : .9) - wave * .016 + (controlMode === 'touch' ? .12 : 0)); }

    updateBullets(dt); updateEnemies(dt); updateEnemyShots(dt); updatePickups(dt); updateParticles(dt);

    if (xp >= xpNeed) levelUp();
    if (spawnLeft <= 0 && enemies.length === 0) finishWave();
    completeMissionIfNeeded();
    checkAchievements();
    updateUi();
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (b.homing) {
        if (!b.target || b.target.dead) b.target = nearestEnemy(activeEvent?.id === 'blackout' ? 520 : 860);
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
          e.hp -= b.dmg * ((upgradesRuntime.weakScan > 0 && (e.elite || e.type === 'boss')) ? 1 + upgradesRuntime.weakScan * .16 : 1); e.hit = .08; burst(b.x, b.y, b.homing ? '#ffd166' : '#37f6ff', b.homing ? 6 : 4, .55);
          if (e.hp <= 0) killEnemy(e);
          if (b.pierce > 0) b.pierce--; else b.dead = true;
          break;
        }
      }
    }
    { const c = camera(); bullets = bullets.filter(b => !b.dead && b.life > 0 && b.x > c.x - 160 && b.x < c.x + W + 160 && b.y > c.y - 160 && b.y < c.y + H + 160); }
  }

  function updateEnemies(dt) {
    const slowRadius = 150 + upgradesRuntime.slowField * 45;
    for (const e of enemies) {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      const slow = upgradesRuntime.slowField > 0 && d < slowRadius ? .55 : 1;
      const bossStop = e.type === 'boss' && d < 230 ? .18 : 1;
      e.x += Math.cos(a) * e.speed * slow * bossStop * dt;
      e.y += Math.sin(a) * e.speed * slow * bossStop * dt;
      if (e.type === 'boss' && !e.phase2 && e.hp < e.maxHp * .5) { e.phase2 = true; e.speed *= 1.22; flash('Boss 進入二階段：星環暴走'); burst(e.x, e.y, '#ff4d6d', 48, 1.5); }
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
        if (e.shootClock <= 0) { enemyShoot(e); e.shootClock = e.type === 'boss' ? (e.phase2 ? rand(.72, 1.12) : rand(1.0, 1.65)) : rand(1.7, 2.7); }
      }
      const rr = e.r + player.r;
      if (dist2(e, player) < rr * rr && !isPlayerProtected()) {
        player.hp -= Math.ceil((e.type === 'boss' ? 22 : 7) + wave * .55);
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
        for (const e of enemies) if (!e.dead && dist2(s, e) < Math.pow(s.r + e.r, 2)) { e.hp -= s.dmg * 1.7; e.hit = .12; if (e.hp <= 0) killEnemy(e); }
        particles.push({ x: s.x, y: s.y, vx: rand(-10, 10), vy: rand(-10, 10), life: .2, max: .2, r: 3, color: s.color || '#ff7a3d', ring: false });
      }
      if (dist2(s, player) < Math.pow(s.r + player.r, 2) && !isPlayerProtected()) {
        s.dead = true; player.hp -= s.dmg; player.invuln = .45; burst(player.x, player.y, '#ff4d6d', 10);
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
      if (d < player.r + s.r + 8) { s.dead = true; meta.scrap += s.value; meta.score += 2; }
    }
    shards = shards.filter(s => !s.dead && s.life > 0);

    for (const p of powerups) {
      p.life -= dt; p.spin += dt * 3;
      if (Math.hypot(player.x - p.x, player.y - p.y) < player.r + p.r + 10) {
        p.dead = true;
        if (p.kind === 'heal') { player.hp = Math.min(player.maxHp, player.hp + 35); flash('維修核心：護盾 +35'); }
        if (p.kind === 'nova') { enemies.forEach(e => { e.hp -= 80; if (e.hp <= 0) killEnemy(e); }); burst(player.x, player.y, '#ffd166', 48, 1.7); flash('新星炸彈啟動'); }
        if (p.kind === 'rapid') { shotTimer = -1; for (let i = 0; i < 5; i++) setTimeout(shoot, i * 55); flash('短暫超頻射擊'); }
      }
    }
    powerups = powerups.filter(p => !p.dead && p.life > 0);
  }

  function updateParticles(dt) {
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96; if (p.ring) p.r += 240 * dt; }
    particles = particles.filter(p => p.life > 0);
    for (const t of floatText) { t.life -= dt; t.y -= 34 * dt; }
    floatText = floatText.filter(t => t.life > 0);
  }

  function levelUp() {
    xp -= xpNeed;
    xpNeed = Math.floor(xpNeed * 1.2 + 5);
    meta.scrap += 8 + Math.floor(wave * 1.45);
    player.hp = Math.min(player.maxHp, player.hp + 20);
    openSkillChoices();
  }

  function openSkillChoices() {
    closeUpgradeModal();
    skillChoosing = true;
    paused = true;
    const choices = [...skillPool].sort(() => Math.random() - .5).slice(0, 3);
    ui.overlay.classList.add('visible');
    const card = ui.overlay.querySelector('.card');
    card.querySelector('.eyebrow').textContent = 'LEVEL UP // 選擇一項本局技能';
    card.querySelector('h2').textContent = '飛船核心升級';
    card.querySelector('p:not(.eyebrow)').textContent = '這些技能只在本局有效。選一個強化方向，繼續撐過下一波。';
    card.querySelector('.version-card')?.setAttribute('hidden', '');
    ui.startBtn.style.display = 'none';
    ui.howBtn.style.display = 'none';
    ui.how.hidden = true;
    let box = document.getElementById('skillChoices');
    if (!box) { box = document.createElement('div'); box.id = 'skillChoices'; box.style.cssText = 'display:grid;gap:10px;margin-top:18px'; card.appendChild(box); }
    box.innerHTML = '';
    for (const c of choices) {
      const btn = document.createElement('button');
      btn.innerHTML = `${c.name}<br><small style="font-weight:600;color:#92a5c8">${c.desc} 目前 Lv.${upgradesRuntime[c.id]}</small>`;
      btn.addEventListener('click', () => chooseSkill(c.id, c.name));
      box.appendChild(btn);
    }
  }

  function chooseSkill(id, name) {
    upgradesRuntime[id]++;
    skillChoosing = false;
    paused = false;
    ui.overlay.classList.remove('visible');
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
    const box = document.getElementById('skillChoices');
    if (box) box.remove();
    flash(`${name} Lv.${upgradesRuntime[id]}`);
  }

  function finishWave() {
    meta.bestWave = Math.max(meta.bestWave, wave + 1);
    const reward = 5 + Math.floor(wave * 1.25) + (bossActive ? 20 : 0) + (beacon && Math.hypot(player.x - beacon.x, player.y - beacon.y) < 130 ? 10 : 0);
    meta.scrap += reward;
    addText(player.x, player.y - 44, `波次獎勵 +${reward}`, '#ffd166');
    startWave(wave + 1);
    save(false);
  }

  function endRun() {
    closeUpgradeModal();
    gameOver = true;
    meta.bestWave = Math.max(meta.bestWave, wave);
    save(false);
    ui.overlay.classList.add('visible');
    const card = ui.overlay.querySelector('.card');
    card.querySelector('.eyebrow').textContent = 'RUN TERMINATED';
    card.querySelector('h2').textContent = '飛船解體，但資料已保存。';
    card.querySelector('p:not(.eyebrow)').textContent = `你撐到第 ${wave} 波，擊毀 ${runKills} 架無人機，累積分數 ${Math.floor(meta.score)}。升級後再回星環復仇。`;
    ui.startBtn.textContent = '重新出擊';
    ui.startBtn.style.display = '';
    ui.howBtn.style.display = '';
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
      btn.disabled = !canUsePermanentUpgrades() || lvl >= def.max || meta.scrap < cost;
      btn.textContent = lvl >= def.max ? '已滿級' : `升級｜${cost} 碎晶`;
      const level = btn.closest('.upgrade')?.querySelector('.level'); if (level) level.textContent = `Lv.${lvl}/${def.max}`;
    });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    const c = camera();
    ctx.save();
    ctx.translate(-c.x, -c.y);
    drawWorldFeatures(); drawShards(); drawPowerups(); drawBullets(); drawEnemyShots(); drawEnemies(); drawOrbitals(); drawPlayer(); drawParticles();
    ctx.restore();
    drawMission(); drawMiniMap(); drawTouchDpad();
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
    ctx.translate(W * .5, H * .52);
    ctx.rotate(-.25);
    ctx.strokeStyle = 'rgba(55,246,255,.14)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(0, 0, W * (.28 + i * .035), H * (.055 + i * .012), 0, 0, TWO_PI); ctx.stroke(); }
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
    ctx.restore();
  }


  function drawWorldFeatures() {
    if (!worldFeatures.length) return;
    ctx.save();
    for (const f of worldFeatures) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.spin + f.seed);
      if (f.type === 'asteroid' || f.type === 'debris') {
        const color = f.type === 'asteroid' ? '#6f7d9c' : '#37f6ff';
        ctx.shadowColor = color; ctx.shadowBlur = f.type === 'asteroid' ? 10 : 18;
        ctx.fillStyle = f.type === 'asteroid' ? 'rgba(111,125,156,.72)' : 'rgba(55,246,255,.18)';
        ctx.strokeStyle = f.type === 'asteroid' ? 'rgba(238,247,255,.34)' : 'rgba(55,246,255,.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const sides = f.type === 'asteroid' ? 9 : 4;
        for (let i = 0; i < sides; i++) {
          const a = i / sides * TWO_PI;
          const rr = f.r * (f.type === 'asteroid' ? rand(.62, 1.0) : (i % 2 ? .55 : 1));
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      } else {
        const color = f.type === 'hazard' ? '#ff4d6d' : f.type === 'repair' ? '#4dff88' : '#ffd166';
        ctx.globalAlpha = .18 + Math.sin(performance.now() * .004 + f.seed) * .04;
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, f.r, 0, TWO_PI); ctx.fill(); ctx.globalAlpha = .72; ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(f.type === 'hazard' ? '危' : f.type === 'repair' ? '+' : '◇', 0, 0);
      }
      ctx.restore();
    }
    if (beacon) {
      beacon.pulse = (beacon.pulse || 0) + .02;
      ctx.save(); ctx.translate(beacon.x, beacon.y); ctx.globalAlpha = .35 + Math.sin(beacon.pulse) * .12; ctx.strokeStyle = '#bdfcff'; ctx.lineWidth = 3; ctx.shadowColor = '#bdfcff'; ctx.shadowBlur = 22; ctx.beginPath(); ctx.arc(0, 0, beacon.r, 0, TWO_PI); ctx.stroke(); ctx.fillStyle = '#bdfcff'; ctx.font = '900 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('目標', 0, 5); ctx.restore();
    }
    ctx.restore();
  }

  function drawPlayer() {
    if (!player) return;
    ctx.save();
    ctx.translate(player.x, player.y);
    const a = mouseAimAngle();
    ctx.rotate(a);
    ctx.scale(playerScale(), playerScale());
    const flicker = isPlayerProtected() && Math.sin(performance.now() * .05) > 0;
    ctx.globalAlpha = flicker ? .45 : 1;
    ctx.shadowColor = dashTime > 0 ? '#ffd166' : '#37f6ff'; ctx.shadowBlur = 24;
    const grad = ctx.createLinearGradient(-18, 0, 28, 0); grad.addColorStop(0, '#13213f'); grad.addColorStop(.45, '#37f6ff'); grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(29, 0); ctx.lineTo(-18, -17); ctx.lineTo(-8, -4); ctx.lineTo(-20, 0); ctx.lineTo(-8, 4); ctx.lineTo(-18, 17); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#eef7ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#050712'; ctx.beginPath(); ctx.arc(4, 0, 5.5, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = '#ff3df2'; ctx.beginPath(); ctx.moveTo(-19, -8); ctx.lineTo(-33 - Math.random() * 10, 0); ctx.lineTo(-19, 8); ctx.fill();
    ctx.restore();

    ctx.save(); ctx.globalAlpha = .22 + (Math.sin(performance.now() * .004) + 1) * .07; ctx.strokeStyle = dashCooldown <= 0 ? '#37f6ff' : '#ff3df2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, magnetRange(), 0, TWO_PI); ctx.stroke(); ctx.restore();
    if (isPlayerProtected()) {
      const shieldLeft = Math.max(player.invuln, 3.5 - runTime);
      ctx.save();
      ctx.globalAlpha = clamp(shieldLeft / 3.5, .18, .58);
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(player.x, player.y, player.r + 18 + Math.sin(performance.now() * .01) * 3, 0, TWO_PI); ctx.stroke();
      ctx.restore();
    }
  }

  function drawOrbitals() {
    if (!player || upgradesRuntime.orbitals <= 0) return;
    const count = Math.min(5, upgradesRuntime.orbitals + 1);
    for (let i = 0; i < count; i++) {
      const a = performance.now() * .003 + i / count * TWO_PI;
      const o = { x: player.x + Math.cos(a) * 54, y: player.y + Math.sin(a) * 54, r: 8 };
      ctx.save(); ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(o.x, o.y, 6, 0, TWO_PI); ctx.fill(); ctx.restore();
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
      if (b.homing) {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.ellipse(0, 0, b.r + 3, b.r, 0, 0, TWO_PI); ctx.fill();
        ctx.fillStyle = '#fff6c7'; ctx.beginPath(); ctx.arc(3, 0, b.r * .48, 0, TWO_PI); ctx.fill();
      } else {
        ctx.fillStyle = '#bdfcff'; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TWO_PI); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function drawEnemyShots() { ctx.save(); for (const s of enemyShots) { ctx.shadowColor = s.type === 'meteor' ? '#ff7a3d' : '#ff3df2'; ctx.shadowBlur = s.type === 'meteor' ? 24 : 14; ctx.fillStyle = s.type === 'meteor' ? '#ffb36b' : '#ff9af8'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TWO_PI); ctx.fill(); if (s.type === 'meteor') { ctx.strokeStyle = '#ff7a3d'; ctx.lineWidth = 2; ctx.stroke(); } } ctx.restore(); }

  function drawEnemies() {
    ctx.save();
    for (const e of enemies) {
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(performance.now() * .001 * e.spin);
      ctx.shadowColor = e.color; ctx.shadowBlur = e.hit > 0 ? 30 : 15; ctx.fillStyle = e.hit > 0 ? '#fff' : e.color;
      if (e.elite || e.phase2) { ctx.strokeStyle = e.elite?.color || '#ff4d6d'; ctx.lineWidth = 3; ctx.globalAlpha = .45 + Math.sin(performance.now() * .006) * .18; ctx.beginPath(); ctx.arc(0, 0, e.r + 8, 0, TWO_PI); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.beginPath();
      for (let i = 0; i < e.sides * 2; i++) { const a = i / (e.sides * 2) * TWO_PI; const r = i % 2 ? e.r * .66 : e.r; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke(); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2, 3);
      ctx.fillStyle = e.type === 'boss' ? '#ff4d6d' : '#4dff88'; ctx.fillRect(e.x - e.r, e.y - e.r - 12, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    ctx.restore();
  }

  function drawShards() { ctx.save(); for (const s of shards) { ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 14; ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(s.x, s.y - s.r); ctx.lineTo(s.x + s.r, s.y); ctx.lineTo(s.x, s.y + s.r); ctx.lineTo(s.x - s.r, s.y); ctx.closePath(); ctx.fill(); } ctx.restore(); }

  function drawPowerups() {
    const colors = { heal: '#4dff88', nova: '#ffd166', rapid: '#37f6ff' };
    const glyph = { heal: '+', nova: '✦', rapid: '⚡' };
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 17px system-ui';
    for (const p of powerups) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin); ctx.shadowColor = colors[p.kind]; ctx.shadowBlur = 18; ctx.fillStyle = colors[p.kind]; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TWO_PI); ctx.fill(); ctx.fillStyle = '#050712'; ctx.fillText(glyph[p.kind], 0, 1); ctx.restore(); }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (const p of particles) { const alpha = clamp(p.life / p.max, 0, 1); ctx.globalAlpha = alpha; ctx.strokeStyle = p.color; ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.beginPath(); if (p.ring) { ctx.arc(p.x, p.y, p.r, 0, TWO_PI); ctx.stroke(); } else { ctx.arc(p.x, p.y, p.r, 0, TWO_PI); ctx.fill(); } }
    ctx.restore();
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '800 14px system-ui';
    for (const t of floatText) { ctx.globalAlpha = clamp(t.life / t.max, 0, 1); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y); }
    ctx.restore();
  }

  function drawMission() {
    ctx.save();
    const x = 18; const y = 118; const w = 318; const h = activeEvent ? 78 : 54;
    ctx.globalAlpha = .86; ctx.fillStyle = 'rgba(5,7,18,.58)'; ctx.strokeStyle = mission?.done ? '#4dff88' : '#ffd166'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = mission?.done ? '#4dff88' : '#ffd166'; ctx.font = '800 13px system-ui'; ctx.fillText(mission?.done ? '任務完成' : mission?.text || '任務載入中', x + 14, y + 22);
    const progress = mission ? clamp(mission.check() / mission.target, 0, 1) : 0;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 14, y + 35, w - 28, 6); ctx.fillStyle = mission?.done ? '#4dff88' : '#37f6ff'; ctx.fillRect(x + 14, y + 35, (w - 28) * progress, 6);
    if (isPlayerProtected() && runTime < 5) {
      const shieldLeft = Math.max(player.invuln, 3.5 - runTime);
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 12px system-ui';
      ctx.fillText(`新手護盾 ${Math.ceil(shieldLeft)}s`, x + 14, y + h + 22);
    }
    if (activeEvent) {
      ctx.fillStyle = activeEvent.color; ctx.font = '900 12px system-ui';
      ctx.fillText(`事件：${activeEvent.name} ${Math.ceil(eventTimer)}s`, x + 14, y + 58);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x + 14, y + 65, w - 28, 5);
      ctx.fillStyle = activeEvent.color; ctx.fillRect(x + 14, y + 65, (w - 28) * clamp(eventTimer / 30, 0, 1), 5);
    }
    ctx.fillStyle = autoAim ? '#4dff88' : '#92a5c8';
    ctx.font = '800 12px system-ui';
    ctx.fillText(`機身：${controlMode === 'touch' ? '觸控' : '滑鼠'}｜主砲${upgradesRuntime.homingRounds > 0 ? '＋追蹤子彈' : ''}｜鎖定 ${autoAim ? (isMouseAiming() ? '手動優先' : 'ON') : 'OFF'}`, x + 14, y + h + (isPlayerProtected() && runTime < 5 ? 40 : 22));
    ctx.restore();
  }


  function drawMiniMap() {
    if (!player) return;
    const size = Math.min(150, Math.max(110, W * .12));
    const x = W - size - 18;
    const y = H - size - 18;
    const scale = size / 1800;
    ctx.save();
    ctx.globalAlpha = .9;
    ctx.fillStyle = 'rgba(5,7,18,.58)'; ctx.strokeStyle = 'rgba(55,246,255,.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, size, size, 16); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
    const cx = x + size / 2, cy = y + size / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.beginPath(); ctx.moveTo(cx, y + 10); ctx.lineTo(cx, y + size - 10); ctx.moveTo(x + 10, cy); ctx.lineTo(x + size - 10, cy); ctx.stroke();
    for (const f of worldFeatures) {
      const px = cx + (f.x - player.x) * scale; const py = cy + (f.y - player.y) * scale;
      if (px < x + 5 || px > x + size - 5 || py < y + 5 || py > y + size - 5) continue;
      ctx.fillStyle = f.type === 'hazard' ? '#ff4d6d' : f.type === 'repair' ? '#4dff88' : f.type === 'resource' ? '#ffd166' : '#92a5c8';
      ctx.beginPath(); ctx.arc(px, py, f.type === 'hazard' ? 3 : 2.2, 0, TWO_PI); ctx.fill();
    }
    for (const e of enemies) {
      const px = cx + (e.x - player.x) * scale; const py = cy + (e.y - player.y) * scale;
      if (px < x + 5 || px > x + size - 5 || py < y + 5 || py > y + size - 5) continue;
      ctx.fillStyle = e.type === 'boss' ? '#ff4d6d' : '#ff9af8'; ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    if (beacon) {
      const px = cx + (beacon.x - player.x) * scale; const py = cy + (beacon.y - player.y) * scale;
      ctx.strokeStyle = '#bdfcff'; ctx.beginPath(); ctx.arc(clamp(px, x + 8, x + size - 8), clamp(py, y + 8, y + size - 8), 5, 0, TWO_PI); ctx.stroke();
    }
    ctx.fillStyle = '#37f6ff'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, TWO_PI); ctx.fill();
    ctx.restore();
    const nearestResource = worldFeatures.filter(f => ['resource', 'repair'].includes(f.type)).sort((a,b) => dist2(player,a)-dist2(player,b))[0];
    const distLabel = nearestResource ? `${nearestResource.type === 'repair' ? '補給' : '資源'} ${Math.round(Math.sqrt(dist2(player, nearestResource)))}m` : '掃描中';
    ctx.fillStyle = 'rgba(238,247,255,.76)'; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(distLabel, x + size / 2, y + size - 10);
    ctx.restore();
  }

  function drawTouchDpad() {
    if (controlMode !== 'touch' || !touchMove.pressed) return;
    const maxX = W > 860 ? W - 420 : W - 86;
    const x = clamp(touchMove.sx, 86, maxX);
    const y = clamp(touchMove.sy, 124, H - 124);
    const active = touchMove.active ? touchMove.dir : '';
    const pads = [
      { id: 'upLeft', label: '↖', x: -44, y: -44, size: 36 },
      { id: 'up', label: '▲', x: 0, y: -56, size: 42 },
      { id: 'upRight', label: '↗', x: 44, y: -44, size: 36 },
      { id: 'left', label: '◀', x: -56, y: 0, size: 42 },
      { id: 'right', label: '▶', x: 56, y: 0, size: 42 },
      { id: 'downLeft', label: '↙', x: -44, y: 44, size: 36 },
      { id: 'down', label: '▼', x: 0, y: 56, size: 42 },
      { id: 'downRight', label: '↘', x: 44, y: 44, size: 36 }
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = .88;
    ctx.fillStyle = 'rgba(5,7,18,.38)';
    ctx.strokeStyle = 'rgba(55,246,255,.36)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#37f6ff';
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.arc(0, 0, 84, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(238,247,255,.10)';
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, TWO_PI); ctx.fill();
    const force = clamp(touchMove.force || 0, 0, 1);
    ctx.strokeStyle = 'rgba(255,209,102,.58)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 26 + force * 44, -Math.PI / 2, -Math.PI / 2 + TWO_PI * force); ctx.stroke();
    const knobX = clamp(touchMove.cx - touchMove.sx, -54, 54);
    const knobY = clamp(touchMove.cy - touchMove.sy, -54, 54);
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.strokeStyle = 'rgba(189,252,255,.72)';
    ctx.beginPath(); ctx.arc(knobX, knobY, 10, 0, TWO_PI); ctx.fill(); ctx.stroke();
    ctx.font = '900 22px system-ui';
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
    if (gameOver || !player) hardResetRun();
    running = true; paused = false; gameOver = false; skillChoosing = false;
    ui.overlay.classList.remove('visible'); ui.startBtn.textContent = '開始 / 繼續'; ui.startBtn.style.display = ''; ui.howBtn.style.display = '';
    save(false);
    updateUi();
  }

  function togglePause() {
    if (!running || gameOver || skillChoosing) return;
    paused = !paused;
    if (paused) {
      save(true);
      openUpgradeModal();
    } else {
      closeUpgradeModal();
      updateUi();
    }
  }
  function doDash() { if (controlMode === 'touch' || !running || paused || gameOver || skillChoosing || dashCooldown > 0) return; dashTime = .16; dashCooldown = Math.max(.55, 1.32 - (meta.upgrades.engine || 0) * .065); player.invuln = .24; burst(player.x, player.y, '#ffd166', 11); }

  function loop(now) { const dt = (now - lastTime) / 1000; lastTime = now; update(dt); draw(); requestAnimationFrame(loop); }

  window.addEventListener('resize', resize);
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

  canvas.addEventListener('pointermove', e => { setMouseFromClient(e.clientX, e.clientY); });
  canvas.addEventListener('pointerdown', e => { mouse.down = true; setMouseFromClient(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', () => { mouse.down = false; });
  ui.startBtn.addEventListener('click', startOrResume);
  ui.howBtn.addEventListener('click', () => { ui.how.hidden = !ui.how.hidden; });
  ui.saveBtn.addEventListener('click', () => save(true));
  ui.resetBtn.addEventListener('click', resetSave);
  ui.upgradeMenuBtn?.addEventListener('click', openUpgradeModal);
  ui.closeUpgradeBtn?.addEventListener('click', closeUpgradeModal);
  ui.resumeFromUpgradeBtn?.addEventListener('click', resumeFromUpgradeModal);
  ui.controlModeBtn?.addEventListener('click', toggleControlMode);
  ui.autoAimBtn?.addEventListener('click', toggleAutoAim);

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
      touchMove.force = .45 + clamp((distance - deadZone) / 58, 0, 1) * .55;
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
      if (ui.overlay.classList.contains('visible') || isUpgradeModalOpen()) return;
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

  resize(); applyOfflineRewards(); hardResetRun(); renderUpgrades(); updateUi(); requestAnimationFrame(loop);
})();
