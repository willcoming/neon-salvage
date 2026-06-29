import {
  COMBAT_SURGE_DEF,
  COMBAT_SURGE_KILLS,
  COMBAT_SURGE_WINDOW,
  combatChainAfterKill,
  combatSurgeShockwaveDamage,
  difficultyFor,
  enemyCapValue,
  spawnIntervalForWaveValue,
  waveEnemyBudgetValue
} from './src/balance.js';
import { SAVE_KEY, readSaveFromStorage } from './src/save.js';

(() => {
  'use strict';

  const PhaserLib = window.Phaser;
  if (!PhaserLib) throw new Error('Phaser runtime missing: vendor/phaser.min.js was not loaded');

  const VERSION = 'v7.9 固定主砲與夥伴整備版';
  const WORLD = { w: 3200, h: 2200 };
  const PLAYER_BASE = { hp: 122, speed: 310, damage: 17, fireRate: 0.19, bulletSpeed: 760, radius: 7 };
  const PLAYER_VISUAL_SCALE = 0.5;
  const PLAYER_MUZZLE_OFFSET = 12;
  const TOUCH_JOYSTICK_MAX_RADIUS = 76;
  const PLAYER_BULLET_RADIUS = 2.35;
  const ENEMY_BULLET_SCALE = 0.58;
  const MAX_PARTICLES = 320;
  const ZONE_DEFS = [
    { id: 'random', name: '隨機航線', desc: '每局抽一個星域，保持新鮮感。', color: '#bdfcff' },
    { id: 'scrapyard', name: '電磁殘骸帶', desc: '敵彈稍慢，戰場更擁擠。', color: '#37f6ff' },
    { id: 'crystal', name: '晶礦雲帶', desc: '資源較多，高速敵人較常出現。', color: '#ffd166' },
    { id: 'rift', name: '裂隙邊界', desc: '危險裂隙較多，但目標獎勵更高。', color: '#ff4d6d' }
  ];
  const ROUTE_STYLE = {
    random: {
      id: 'random', accent: '#bdfcff', secondary: '#ffdf68', dark: '#111426',
      shipName: '拾荒遊俠塗裝', landmark: '漂流中繼站'
    },
    scrapyard: {
      id: 'scrapyard', accent: '#37f6ff', secondary: '#8aa3ff', dark: '#0f1827',
      shipName: '電磁殘骸裝甲', landmark: '殘骸艦橋'
    },
    crystal: {
      id: 'crystal', accent: '#ffd166', secondary: '#62ff91', dark: '#171321',
      shipName: '晶礦鍍金機翼', landmark: '晶礦母脈'
    },
    rift: {
      id: 'rift', accent: '#ff4d6d', secondary: '#ff3df2', dark: '#190d1d',
      shipName: '裂隙獵手塗裝', landmark: '紅裂縫燈塔'
    }
  };
  const DRONE_IDS = ['tank', 'artillery', 'repair', 'shield', 'rapid', 'melee'];
  const DRONE_DEFS = {
    tank: { name: '堡壘夥伴機', role: '耐打型', icon: 'FORT', color: '#8aa3ff', hp: 150, orbit: 70, fireRate: 0.95, damage: 8, range: 520 },
    artillery: { name: '重砲夥伴機', role: '重砲攻擊型', icon: 'CANNON', color: '#ff8c22', hp: 76, orbit: 92, fireRate: 1.45, damage: 24, range: 780 },
    repair: { name: '維修夥伴機', role: '維修型', icon: 'MEDIC', color: '#62ff91', hp: 70, orbit: 56, fireRate: 2.6, heal: 8, range: 520 },
    shield: { name: '護盾夥伴機', role: '護盾型', icon: 'Aegis', color: '#78f6ff', hp: 88, orbit: 64, fireRate: 1.15, damage: 6, range: 500 },
    rapid: { name: '蜂針夥伴機', role: '快速攻擊型', icon: 'STING', color: '#ffd166', hp: 62, orbit: 82, fireRate: 0.38, damage: 7, range: 640 },
    melee: { name: '斬擊夥伴機', role: '近戰強力型', icon: 'BLADE', color: '#ff3df2', hp: 92, orbit: 46, fireRate: 0.42, damage: 18, range: 132 }
  };
  const DRONE_SKILL_TREES = {
    tank: [
      { id: 'plates', name: '重裝板甲', desc: '本機更耐打，主機受傷減免提升', max: 3 },
      { id: 'taunt', name: '引力嘲諷', desc: '擴大護衛圈，吸收更多近身壓力', max: 3 },
      { id: 'shock', name: '震盪反擊', desc: '堡壘彈命中會產生小範圍震波', max: 3 }
    ],
    artillery: [
      { id: 'shell', name: '破甲重彈', desc: '重砲傷害與貫穿提升', max: 3 },
      { id: 'blast', name: '爆裂彈頭', desc: '命中後濺射附近敵人', max: 3 },
      { id: 'calibrate', name: '遠距校準', desc: '射程提升，開火間隔縮短', max: 3 }
    ],
    repair: [
      { id: 'medfoam', name: '納米泡沫', desc: '每次維修量提升', max: 3 },
      { id: 'triage', name: '戰場急救', desc: '低血量時維修更快', max: 3 },
      { id: 'overheal', name: '過量充能', desc: '補血時給短暫無敵與綠色護環', max: 3 }
    ],
    shield: [
      { id: 'dome', name: '擴張護罩', desc: '擋彈半徑提升', max: 3 },
      { id: 'reflect', name: '反射稜鏡', desc: '部分擋下的敵彈會轉成友方光彈', max: 3 },
      { id: 'battery', name: '緊急電池', desc: '擋彈時延長主機無敵時間', max: 3 }
    ],
    rapid: [
      { id: 'twin', name: '雙蜂發射器', desc: '額外發射並列蜂針', max: 3 },
      { id: 'needle', name: '穿刺針尖', desc: '蜂針傷害與速度提升', max: 3 },
      { id: 'capacitor', name: '高頻電容', desc: '蜂針射速大幅提升', max: 3 }
    ],
    melee: [
      { id: 'cleave', name: '弧月斬', desc: '斬擊會掃到周圍敵人', max: 3 },
      { id: 'execute', name: '處決演算', desc: '對低血量與 Boss 造成更高傷害', max: 3 },
      { id: 'lunge', name: '突進刀翼', desc: '近戰範圍與追擊距離提升', max: 3 }
    ]
  };
  const SHIP_SKILL_TREE = {
    cannon: { name: '主砲線圈', desc: '固定主砲傷害 +8%', base: 18, scale: 1.42, color: '#ffdf68' },
    reactor: { name: '反應爐節拍', desc: '固定主砲射速 +5%', base: 20, scale: 1.46, color: '#ff8c22' },
    shield: { name: '護盾容量', desc: '最大護盾 +12', base: 16, scale: 1.38, color: '#8aa3ff' },
    armor: { name: '裝甲鍍層', desc: '受到傷害 -2.5%', base: 18, scale: 1.44, color: '#bdfcff' },
    engine: { name: '推進調校', desc: '移動速度 +4.5%', base: 16, scale: 1.40, color: '#78f6ff' },
    magnet: { name: '拾荒磁場', desc: '道具與碎晶吸附範圍 +12%', base: 14, scale: 1.36, color: '#62ff91' },
    survey: { name: '戰場掃描', desc: '護甲 / 增效道具掉落率提升', base: 22, scale: 1.48, color: '#ff3df2' },
    drone: { name: '夥伴連線', desc: '所有夥伴機等級 +1', base: 24, scale: 1.52, color: '#ffd166' }
  };
  const SUPPLY_ITEM_DEFS = {
    repair: { name: '維修包', label: '維修', color: '#62ff91', value: 22, duration: 0, desc: '立即回復護盾' },
    cash: { name: '貨幣箱', label: '貨幣', color: '#ffdf68', value: 10, duration: 0, desc: '獲得碎晶' },
    armor: { name: '護甲板', label: '護甲', color: '#8aa3ff', value: 10, duration: 10, desc: '短時間降低受到傷害' },
    boost: { name: '增效核心', label: '增效', color: '#ff8c22', value: 8, duration: 8, desc: '短時間提升火力與射速' },
    magnet: { name: '磁吸增幅', label: '磁吸', color: '#78f6ff', value: 10, duration: 10, desc: '短時間提高拾取範圍' }
  };
  const BACKDROP_PROPS = createBackdropProps();
  const COMIC = {
    ink: 0x07080c,
    paper: 0x111426,
    shadow: 0x000000,
    blue: 0x1d5cff,
    cyan: 0x78f6ff,
    red: 0xe83b3b,
    orange: 0xff8c22,
    gold: 0xffdf68,
    magenta: 0xff3df2,
    green: 0x62ff91,
    white: 0xf6f2dc
  };
  const ui = {
    wave: document.getElementById('wave'),
    hp: document.getElementById('hp'),
    scrap: document.getElementById('scrap'),
    score: document.getElementById('score'),
    xpBar: document.getElementById('xpBar'),
    coreHud: document.getElementById('coreHud'),
    missionHud: document.getElementById('missionHud'),
    overlay: document.getElementById('overlay'),
    startBtn: document.getElementById('startBtn'),
    howBtn: document.getElementById('howBtn'),
    how: document.getElementById('how'),
    settingsBtn: document.getElementById('settingsBtn'),
    homeSettingsBtn: document.getElementById('homeSettingsBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    upgradePrompt: document.getElementById('upgradePrompt'),
    upgradeMenuBtn: document.getElementById('upgradeMenuBtn'),
    upgradeModal: document.getElementById('upgradeModal'),
    closeUpgradeBtn: document.getElementById('closeUpgradeBtn'),
    resumeFromUpgradeBtn: document.getElementById('resumeFromUpgradeBtn'),
    soundBtn: document.getElementById('soundBtn'),
    hapticBtn: document.getElementById('hapticBtn'),
    testSoundBtn: document.getElementById('testSoundBtn'),
    volumeRange: document.getElementById('volumeRange'),
    volumeValue: document.getElementById('volumeValue'),
    audioStatus: document.getElementById('audioStatus'),
    shakeRange: document.getElementById('shakeRange'),
    shakeValue: document.getElementById('shakeValue'),
    touchSensitivityRange: document.getElementById('touchSensitivityRange'),
    touchSensitivityValue: document.getElementById('touchSensitivityValue'),
    difficultyBtn: document.getElementById('difficultyBtn'),
    perfBtn: document.getElementById('perfBtn'),
    controlModeBtn: document.getElementById('controlModeBtn'),
    autoAimBtn: document.getElementById('autoAimBtn'),
    zonePanel: document.getElementById('zonePanel'),
    achievementPanel: document.getElementById('achievementPanel'),
    offlineNotice: document.getElementById('offlineNotice'),
    touchControls: document.getElementById('touchControls'),
    floatingJoystick: document.getElementById('floatingJoystick'),
    floatingJoystickKnob: document.getElementById('floatingJoystickKnob'),
    toast: document.getElementById('toast')
  };

  let meta = readSaveFromStorage(localStorage);
  let sceneRef = null;
  let audioCtx = null;
  let toastTimer = 0;

  const clamp = PhaserLib.Math.Clamp;
  const dist = PhaserLib.Math.Distance.Between;
  const angleBetween = PhaserLib.Math.Angle.Between;
  const wrapAngle = PhaserLib.Math.Angle.Wrap;

  function saveMeta() {
    meta.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function flash(message, duration = 1800) {
    if (!ui.toast) return;
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), duration);
  }

  function upgradeLevel(id) {
    meta.upgrades ||= {};
    return Math.max(0, Number(meta.upgrades[id] || 0));
  }

  function shipSkillCost(id) {
    const def = SHIP_SKILL_TREE[id];
    const level = upgradeLevel(id);
    return Math.ceil((def?.base || 12) * Math.pow(def?.scale || 1.42, level));
  }

  function purchaseShipSkill(id) {
    const def = SHIP_SKILL_TREE[id];
    if (!def) return false;
    const cost = shipSkillCost(id);
    if ((meta.scrap || 0) < cost) {
      flash(`碎晶不足：${def.name} 需要 ${cost}`);
      return false;
    }
    meta.scrap -= cost;
    meta.upgrades ||= {};
    meta.upgrades[id] = upgradeLevel(id) + 1;
    if (sceneRef?.player && (id === 'shield' || id === 'armor')) {
      sceneRef.player.maxHp = playerMaxHp(sceneRef);
      sceneRef.player.hp = Math.min(sceneRef.player.maxHp, sceneRef.player.hp + (id === 'shield' ? 12 : 6));
    }
    saveMeta();
    updateHud(sceneRef);
    flash(`${def.name} Lv.${meta.upgrades[id]}｜-${cost} 碎晶`);
    beep('clear');
    haptic(18);
    return true;
  }

  function companionFunctionText(type) {
    return {
      tank: '環繞在主機外圈承壓，提供減傷；升級後可嘲諷近身壓力與震盪反擊。',
      artillery: '保持外圈重砲角度，自主發射高傷害慢速砲彈；可破甲、濺射與加長射程。',
      repair: '在主機附近巡航，定期維修護盾；可急救、提高維修量與過量充能。',
      shield: '環繞主機形成擋彈圈；可擴大護罩、反射敵彈與延長無敵。',
      rapid: '高速繞行並快速點射最近敵人；可雙發、穿刺與提升射速。',
      melee: '在近距離繞行斬擊，敵人接近時突進砍殺；可弧月斬、處決與增加追擊距離。'
    }[type] || '環繞主機並依類型自動攻擊或支援。';
  }

  function renderShipSkillTree(container, rerender = () => {}) {
    if (!container) return;
    const wrap = document.createElement('section');
    wrap.className = 'skill-tree-section ship-tree-section';
    wrap.innerHTML = `<header><strong>主機技能樹｜永久升級</strong><small>武器固定為主砲；花貨幣提升主機數值，不再撿到不同武器。</small></header><div class="skill-tree-grid"></div>`;
    const grid = wrap.querySelector('.skill-tree-grid');
    for (const [id, def] of Object.entries(SHIP_SKILL_TREE)) {
      const level = upgradeLevel(id);
      const cost = shipSkillCost(id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skill-tree-card ship-skill-card';
      btn.disabled = (meta.scrap || 0) < cost;
      btn.style.setProperty('--skill-color', def.color);
      btn.innerHTML = `<b>${def.name} Lv.${level}</b><small>${def.desc}</small><em>${btn.disabled ? `需要 ${cost} 碎晶` : `花 ${cost} 碎晶升級`}</em>`;
      btn.addEventListener('click', () => { if (purchaseShipSkill(id)) rerender(); });
      grid.appendChild(btn);
    }
    container.appendChild(wrap);
  }

  function renderCompanionSkillPanel(container, scene, rerender = () => {}) {
    if (!container) return;
    const wrap = document.createElement('section');
    wrap.className = 'skill-tree-section companion-tree-section';
    wrap.innerHTML = '<header><strong>無人夥伴機｜本局技能樹</strong><small>夥伴機環繞主機移動；重複取得同型機會給技能點，可在暫停/結算這裡分配。</small></header>';
    if (!scene?.companions?.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-tree-note';
      empty.textContent = '尚未取得夥伴機；尋找任務區塊並停在旁邊開啟。';
      wrap.appendChild(empty);
      container.appendChild(wrap);
      return;
    }
    for (const drone of scene.companions) {
      const def = DRONE_DEFS[drone.type] || DRONE_DEFS.rapid;
      const card = document.createElement('article');
      card.className = 'drone-tree-card';
      card.style.setProperty('--skill-color', def.color);
      const points = drone.skillPoints || 0;
      card.innerHTML = `<h3>${def.name} <span>${def.role}｜Lv.${scene.companionLevel(drone)}｜技能點 ${points}</span></h3><p>${companionFunctionText(drone.type)}</p><div class="skill-tree-grid"></div>`;
      const grid = card.querySelector('.skill-tree-grid');
      for (const skill of DRONE_SKILL_TREES[drone.type] || []) {
        const level = scene.companionSkillLevel(drone, skill.id);
        const max = skill.max || 3;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'skill-tree-card drone-skill-card';
        btn.disabled = points <= 0 || level >= max;
        btn.innerHTML = `<b>${skill.name} Lv.${level}/${max}</b><small>${skill.desc}</small><em>${level >= max ? '已滿級' : points > 0 ? '使用 1 技能點升級' : '需要重複取得同型機'}</em>`;
        btn.addEventListener('click', () => { if (scene.applyCompanionUpgrade(drone.type, skill.id, false)) rerender(); });
        grid.appendChild(btn);
      }
      wrap.appendChild(card);
    }
    container.appendChild(wrap);
  }

  function haptic(ms = 16) {
    if (meta.hapticsEnabled && navigator.vibrate) navigator.vibrate(ms);
  }

  function beep(kind = 'shot') {
    if (!meta.soundEnabled) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;
      const table = {
        shot: [540, 0.025, 0.045], hit: [180, 0.05, 0.08], surge: [120, 0.16, 0.14], hurt: [80, 0.18, 0.18], clear: [720, 0.22, 0.12]
      };
      const [freq, length, vol] = table[kind] || table.shot;
      osc.type = kind === 'surge' ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 1.8), now + length);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * meta.volume), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + length + 0.02);
    } catch {
      // Audio is optional and can be blocked until a user gesture.
    }
  }

  function updateSettingsLabels() {
    if (ui.soundBtn) ui.soundBtn.textContent = `音效 ${meta.soundEnabled ? 'ON' : 'OFF'}`;
    if (ui.hapticBtn) ui.hapticBtn.textContent = `震動 ${meta.hapticsEnabled ? 'ON' : 'OFF'}`;
    if (ui.volumeRange) ui.volumeRange.value = String(Math.round(meta.volume * 100));
    if (ui.volumeValue) ui.volumeValue.textContent = `${Math.round(meta.volume * 100)}%`;
    if (ui.shakeRange) ui.shakeRange.value = String(Math.round(meta.shakeStrength * 100));
    if (ui.shakeValue) ui.shakeValue.textContent = `${Math.round(meta.shakeStrength * 100)}%`;
    if (ui.touchSensitivityRange) ui.touchSensitivityRange.value = String(Math.round((meta.touchSensitivity || 1) * 100));
    if (ui.touchSensitivityValue) ui.touchSensitivityValue.textContent = `${Math.round((meta.touchSensitivity || 1) * 100)}%`;
    if (ui.difficultyBtn) ui.difficultyBtn.textContent = `難度：${difficultyFor(meta.difficulty).name}`;
    if (ui.controlModeBtn) ui.controlModeBtn.textContent = meta.controlMode === 'touch' ? '手機' : '滑鼠';
    if (ui.autoAimBtn) ui.autoAimBtn.textContent = `自瞄：${meta.aimAssist === 'full' ? '完全' : meta.aimAssist === 'off' ? '關閉' : '輔助'}`;
    document.body.dataset.controlMode = meta.controlMode;
  }

  function setCardForHome() {
    const card = ui.overlay?.querySelector('.card');
    if (!card) return;
    card.classList.remove('run-card');
    const eyebrow = card.querySelector('.eyebrow');
    const h2 = card.querySelector('h2');
    const p = card.querySelector('p:not(.eyebrow)');
    if (eyebrow) eyebrow.textContent = 'BETA DEMO // 固定主砲與夥伴整備版';
    if (h2) h2.textContent = '霓虹拾荒者 Neon Salvage';
    if (p) p.textContent = 'v7.9 改成固定主砲，不再撿到會換武器的核心；暫停/結算可看主機永久技能樹與夥伴機技能樹。';
    if (ui.startBtn) {
      ui.startBtn.style.display = '';
      ui.startBtn.textContent = '開始 v7.9';
    }
    if (ui.howBtn) ui.howBtn.style.display = '';
    if (ui.homeSettingsBtn) ui.homeSettingsBtn.style.display = '';
    setHomePanelsVisible(true);
    card.querySelector('.run-shop')?.remove();
    card.querySelector('.home-ship-tree')?.remove();
    const homeTree = document.createElement('div');
    homeTree.className = 'home-ship-tree';
    card.querySelector('.actions')?.before(homeTree);
    renderShipSkillTree(homeTree, () => setCardForHome());
  }

  function setHomePanelsVisible(visible) {
    const card = ui.overlay?.querySelector('.card');
    if (!card) return;
    for (const selector of ['.version-card', '.beta-summary', '#offlineNotice', '#achievementPanel', '#zonePanel', '.home-ship-tree']) {
      const el = card.querySelector(selector);
      if (el) el.hidden = !visible;
    }
  }

  function renderZones() {
    if (!ui.zonePanel) return;
    ui.zonePanel.innerHTML = '<strong>星域路線選擇</strong><div class="zone-grid"></div>';
    const grid = ui.zonePanel.querySelector('.zone-grid');
    for (const z of ZONE_DEFS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `zone-card${meta.selectedZone === z.id ? ' selected' : ''}`;
      const style = ROUTE_STYLE[z.id] || ROUTE_STYLE.random;
      btn.innerHTML = `<b style="color:${z.color}">${z.name}</b><small>${z.desc}</small><small>背景：${style.landmark}｜造型：${style.shipName}</small>`;
      btn.addEventListener('click', () => {
        meta.selectedZone = z.id;
        saveMeta();
        renderZones();
        flash(`航線：${z.name}`);
      });
      grid.appendChild(btn);
    }
  }

  function updateMetaPanels() {
    const style = currentRouteStyle();
    if (ui.achievementPanel) ui.achievementPanel.textContent = `最佳波次 ${meta.bestWave || 1}｜累積碎晶 ${meta.scrap || 0}｜${style.shipName}｜Phaser 3.90`;
    if (ui.offlineNotice) ui.offlineNotice.textContent = 'v7.9：主砲固定，子彈比例縮小；護甲/增效/磁吸道具回歸，暫停可查看主機永久技能樹與無人夥伴機技能樹。';
  }

  function hideUpgradeSurfaces({ resume = false } = {}) {
    if (ui.upgradePrompt) ui.upgradePrompt.hidden = true;
    if (ui.upgradeMenuBtn) ui.upgradeMenuBtn.hidden = true;
    if (ui.upgradeModal) ui.upgradeModal.hidden = true;
    if (resume && sceneRef?.running && !sceneRef.gameOver) sceneRef.pausedRun = false;
    if (sceneRef) updateHud(sceneRef);
  }

  function openRunShop() {
    if (!sceneRef) return;
    if (sceneRef.running && !sceneRef.gameOver) sceneRef.pausedRun = true;
    const container = document.getElementById('upgrades');
    if (document.getElementById('upgradeTitle')) document.getElementById('upgradeTitle').textContent = '主機 / 夥伴技能樹';
    const muted = document.querySelector('#panel .muted');
    if (muted) muted.textContent = '主機技能用累積貨幣永久升級；無人夥伴機技能點來自重複取得同型機，本局有效。';
    if (container) {
      container.innerHTML = '';
      renderShipSkillTree(container, () => openRunShop());
      renderCompanionSkillPanel(container, sceneRef, () => openRunShop());
    }
    if (ui.upgradeModal) ui.upgradeModal.hidden = false;
    updateHud(sceneRef);
  }

  class NeonScene extends PhaserLib.Scene {
    constructor() {
      super('NeonScene');
      this.resetRuntime();
    }

    resetRuntime() {
      this.running = false;
      this.pausedRun = false;
      this.gameOver = false;
      this.wave = 1;
      this.waveSpawned = 0;
      this.waveBudget = 0;
      this.spawnClock = 0;
      this.fireClock = 0;
      this.reviveCount = 0;
      this.missionBlocks = [];
      this.nextMissionId = 1;
      this.companions = [];
      this.companionShots = 0;
      this.missionClaims = 0;
      this.supplyPickups = 0;
      this.shotCounter = 0;
      this.nextEnemyId = 1;
      this.armorBuffTimer = 0;
      this.boostTimer = 0;
      this.magnetTimer = 0;
      this.runTime = 0;
      this.kills = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.bestCombo = 0;
      this.surgeCount = 0;
      this.shakeTime = 0;
      this.shakeAmount = 0;
      this.screenFlash = 0;
      this.screenFlashColor = '#ffdf68';
      this.damageCue = null;
      this.message = 'Phaser 引擎就緒';
      this.messageTimer = 2.4;
      const maxHp = playerMaxHp(this);
      this.player = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0, hp: maxHp, maxHp, angle: -Math.PI / 2, invuln: 1.8 };
      this.touchVector = null;
      this.touchOrigin = null;
      this.touchPointerId = null;
      this.enemies = [];
      this.bullets = [];
      this.enemyShots = [];
      this.shards = [];
      if (this.labels) {
        for (const label of this.labels) label.destroy();
      }
      this.particles = [];
      this.labels = [];
    }

    create() {
      sceneRef = this;
      this.g = this.add.graphics();
      this.uiG = this.add.graphics().setScrollFactor(0);
      this.bannerText = this.add.text(0, 0, '', { fontFamily: 'ui-sans-serif, system-ui, sans-serif', fontSize: '16px', color: '#eef7ff', stroke: '#050712', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,P,E');
      this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
      this.cameras.main.centerOn(this.player.x, this.player.y);
      this.input.on('pointerdown', pointer => this.beginTouchJoystick(pointer));
      this.input.on('pointermove', pointer => this.updateTouchJoystick(pointer));
      this.input.on('pointerup', pointer => this.clearTouchJoystick(pointer, true));
      this.input.on('pointerupoutside', pointer => this.clearTouchJoystick(pointer, true));
      this.input.on('pointercancel', pointer => this.clearTouchJoystick(pointer, true));
      window.addEventListener('pointerup', () => this.clearTouchJoystick(null, true));
      window.addEventListener('pointercancel', () => this.clearTouchJoystick(null, true));
      window.addEventListener('blur', () => this.clearMovementInput(true));
      window.addEventListener('pagehide', () => this.clearMovementInput(true));
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.clearMovementInput(true); });
      const canvas = this.game?.canvas;
      canvas?.addEventListener?.('pointerleave', () => this.clearTouchJoystick(null, true));
      canvas?.addEventListener?.('pointercancel', () => this.clearTouchJoystick(null, true));
      const app = document.getElementById('app');
      const touchOptions = { passive: false, capture: true };
      app?.addEventListener?.('pointerdown', event => this.handleDomTouchJoystick(event, 'down'), touchOptions);
      app?.addEventListener?.('pointermove', event => this.handleDomTouchJoystick(event, 'move'), touchOptions);
      window.addEventListener('pointerup', event => this.handleDomTouchJoystick(event, 'up'), { passive: false });
      window.addEventListener('pointercancel', event => this.handleDomTouchJoystick(event, 'up'), { passive: false });
      this.scale.on('resize', gameSize => this.onResize(gameSize));
      this.onResize({ width: this.scale.width, height: this.scale.height });
      this.drawAll();
      updateHud(this);
    }

    onResize(gameSize) {
      const size = syncViewportVars(gameSize);
      this.cameras.main.setViewport(0, 0, size.width, size.height);
    }

    startRun() {
      this.resetRuntime();
      this.running = true;
      this.pausedRun = false;
      this.gameOver = false;
      ui.overlay?.classList.remove('visible');
      hideUpgradeSurfaces();
      this.startWave(1);
      this.message = '固定主砲上線｜靠任務找夥伴機與道具強化';
      this.messageTimer = 2.0;
      flash('固定主砲出擊｜武器不再隨掉落改變');
      beep('clear');
      haptic(18);
    }

    startWave(n) {
      this.wave = n;
      this.waveSpawned = 0;
      this.waveBudget = waveEnemyBudgetValue({ wave: n, controlMode: meta.controlMode, difficulty: difficultyFor(meta.difficulty), route: zoneRouteEffect() });
      if (n % 5 === 0) this.waveBudget = 1;
      this.spawnClock = 0.05;
      const bossKind = n % 5 === 0 ? bossKindForWave(n) : null;
      this.message = bossKind ? `第 ${n} 波｜${bossName(bossKind)}` : `第 ${n} 波｜敵群 ${this.waveBudget}`;
      this.messageTimer = 2.2;
      flash(this.message);
      this.screenFlash = Math.max(this.screenFlash, bossKind ? 0.24 : 0.13);
      this.screenFlashColor = bossKind ? bossColor(bossKind) : '#ffdf68';
      this.comicSplash(this.player.x, this.player.y, bossKind ? 'BOSS!!' : 'WAVE!', bossKind ? bossColor(bossKind) : '#ffdf68');
      if (!bossKind && (n === 1 || n % 2 === 0 || Math.random() < 0.36)) this.spawnMissionBlock();
    }

    pointerKey(pointer) {
      return pointer?.event?.pointerId ?? pointer?.pointerId ?? pointer?.id ?? pointer?.identifier ?? 0;
    }

    touchPointFromPointer(pointer) {
      const rect = ui.touchControls?.getBoundingClientRect?.()
        || this.game?.canvas?.getBoundingClientRect?.()
        || { left: 0, top: 0, width: this.scale.width, height: this.scale.height };
      const event = pointer?.event;
      const rawX = Number.isFinite(event?.clientX) ? event.clientX : pointer?.x;
      const rawY = Number.isFinite(event?.clientY) ? event.clientY : pointer?.y;
      const width = Math.max(1, rect.width || this.scale.width || 1);
      const height = Math.max(1, rect.height || this.scale.height || 1);
      return {
        x: clamp((rawX ?? 0) - (rect.left || 0), 0, width),
        y: clamp((rawY ?? 0) - (rect.top || 0), 0, height)
      };
    }

    syncTouchJoystickVisual() {
      const root = ui.floatingJoystick;
      const knob = ui.floatingJoystickKnob;
      if (!root || !knob) return;
      if (meta.controlMode !== 'touch' || !this.touchOrigin || !this.touchVector) {
        root.hidden = true;
        root.classList.remove('active');
        root.style.removeProperty('left');
        root.style.removeProperty('top');
        root.style.removeProperty('--knob-x');
        root.style.removeProperty('--knob-y');
        return;
      }
      const knobDistance = this.touchVector.force * 42;
      root.hidden = false;
      root.classList.add('active');
      root.style.left = `${this.touchOrigin.x}px`;
      root.style.top = `${this.touchOrigin.y}px`;
      root.style.setProperty('--knob-x', `${this.touchVector.x * knobDistance}px`);
      root.style.setProperty('--knob-y', `${this.touchVector.y * knobDistance}px`);
    }

    shouldIgnoreDomTouch(event) {
      const target = event?.target;
      if (!target?.closest) return false;
      return !!target.closest('button, input, select, textarea, a, [role="button"], .modal-backdrop, #overlay.visible');
    }

    domPointer(event) {
      return {
        id: event?.pointerId ?? 0,
        pointerId: event?.pointerId ?? 0,
        x: event?.clientX ?? 0,
        y: event?.clientY ?? 0,
        event
      };
    }

    handleDomTouchJoystick(event, phase) {
      if (meta.controlMode !== 'touch') return;
      if (phase === 'down') {
        if (this.shouldIgnoreDomTouch(event)) return;
        this.beginTouchJoystick(this.domPointer(event));
        return;
      }
      if (phase === 'move') {
        if (!this.touchOrigin) return;
        this.updateTouchJoystick(this.domPointer(event));
        return;
      }
      this.clearTouchJoystick(this.domPointer(event), true);
    }

    beginTouchJoystick(pointer) {
      if (meta.controlMode !== 'touch' || !this.running || this.pausedRun || this.gameOver) return;
      const { x, y } = this.touchPointFromPointer(pointer);
      this.touchPointerId = this.pointerKey(pointer);
      this.touchOrigin = { x, y };
      this.touchVector = { x: 0, y: 0, force: 0 };
      this.syncTouchJoystickVisual();
      pointer.event?.preventDefault?.();
      this.updateTouchJoystick(pointer);
    }

    updateTouchJoystick(pointer) {
      if (meta.controlMode !== 'touch' || !this.running || this.pausedRun || this.gameOver) return;
      if (!this.touchOrigin) return;
      if (this.touchPointerId !== null && this.pointerKey(pointer) !== this.touchPointerId) return;
      const point = this.touchPointFromPointer(pointer);
      const dx = point.x - this.touchOrigin.x;
      const dy = point.y - this.touchOrigin.y;
      const len = Math.hypot(dx, dy);
      const deadZone = 10;
      const maxRadius = TOUCH_JOYSTICK_MAX_RADIUS;
      if (len <= deadZone) {
        this.touchVector = { x: 0, y: 0, force: 0 };
      } else {
        const force = clamp(((len - deadZone) / (maxRadius - deadZone)) * (meta.touchSensitivity || 1), 0.22, 1);
        this.touchVector = { x: dx / len, y: dy / len, force };
      }
      this.syncTouchJoystickVisual();
      pointer.event?.preventDefault?.();
    }

    clearTouchJoystick(pointer = null, resetVelocity = false) {
      if (pointer && this.touchPointerId !== null && this.pointerKey(pointer) !== this.touchPointerId) return;
      this.touchVector = null;
      this.touchOrigin = null;
      this.touchPointerId = null;
      this.syncTouchJoystickVisual();
      if (resetVelocity && this.player) {
        this.player.vx = 0;
        this.player.vy = 0;
      }
    }

    clearMovementInput(resetVelocity = false) {
      this.clearTouchJoystick(null, resetVelocity);
      this.input?.keyboard?.resetKeys?.();
    }

    update(time, deltaMs) {
      const dt = Math.min(deltaMs / 1000, 0.05);
      if (!this.running || this.pausedRun || this.gameOver) {
        this.drawAll();
        return;
      }
      this.runTime += dt;
      this.player.invuln = Math.max(0, this.player.invuln - dt);
      this.comboTimer = Math.max(0, this.comboTimer - dt);
      this.updateBuffTimers(dt);
      if (this.comboTimer <= 0) this.combo = 0;
      this.updatePlayer(dt);
      this.updateSpawning(dt);
      this.updateFiring(dt);
      this.updateBullets(dt);
      this.updateEnemies(dt);
      this.updateMissionBlocks(dt);
      this.updateCompanions(dt);
      this.updateDrops(dt);
      this.updateParticles(dt);
      this.updateWaveProgress();
      this.updateCamera(dt);
      this.drawAll();
      updateHud(this);
    }

    updateBuffTimers(dt) {
      this.armorBuffTimer = Math.max(0, (this.armorBuffTimer || 0) - dt);
      this.boostTimer = Math.max(0, (this.boostTimer || 0) - dt);
      this.magnetTimer = Math.max(0, (this.magnetTimer || 0) - dt);
    }

    firePlayerBullet(angle, opts = {}) {
      const speed = opts.speed || PLAYER_BASE.bulletSpeed;
      this.bullets.push({
        x: this.player.x + Math.cos(angle) * (opts.offset || PLAYER_MUZZLE_OFFSET),
        y: this.player.y + Math.sin(angle) * (opts.offset || PLAYER_MUZZLE_OFFSET),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: opts.life || 1.25,
        r: opts.r || PLAYER_BULLET_RADIUS,
        damage: opts.damage || playerDamage(this),
        color: opts.color,
        source: opts.source || opts.core || 'player',
        pierce: opts.pierce || 0,
        hitIds: opts.pierce ? new Set() : null
      });
    }

    spawnMissionBlock(forceType = null) {
      if (this.missionBlocks.length >= 2) return null;
      const a = PhaserLib.Math.FloatBetween(0, Math.PI * 2);
      const r = PhaserLib.Math.Between(260, 470);
      const x = clamp(this.player.x + Math.cos(a) * r, 150, WORLD.w - 150);
      const y = clamp(this.player.y + Math.sin(a) * r, 150, WORLD.h - 150);
      const droneType = forceType || DRONE_IDS[PhaserLib.Math.Between(0, DRONE_IDS.length - 1)] || 'rapid';
      const def = DRONE_DEFS[droneType] || DRONE_DEFS.rapid;
      const block = { id: this.nextMissionId++, x, y, r: 62, progress: 0, target: 2.05, droneType, color: def.color, pulse: Math.random() * 10 };
      this.missionBlocks.push(block);
      this.message = `偵測任務區塊｜${def.role}`;
      this.messageTimer = 1.8;
      this.addFloatingText(x, y - 46, '任務區塊', def.color, 900, 17);
      return block;
    }

    updateMissionBlocks(dt) {
      for (const block of this.missionBlocks) {
        const d = dist(this.player.x, this.player.y, block.x, block.y);
        const parked = d < block.r + 42 && Math.hypot(this.player.vx, this.player.vy) < 125;
        if (parked) {
          block.progress += dt;
          this.player.vx *= 0.92;
          this.player.vy *= 0.92;
          if (Math.random() < 0.25) this.particles.push({ x: block.x, y: block.y, vx: PhaserLib.Math.FloatBetween(-28, 28), vy: PhaserLib.Math.FloatBetween(-28, 28), r: 2.4, life: 0.28, max: 0.28, color: block.color, kind: 'spark' });
        } else {
          block.progress = Math.max(0, block.progress - dt * 0.38);
        }
        if (block.progress >= block.target) {
          block.done = true;
          this.openMissionBlock(block);
        }
      }
      this.missionBlocks = this.missionBlocks.filter(block => !block.done);
    }

    openMissionBlock(block) {
      const def = DRONE_DEFS[block.droneType] || DRONE_DEFS.rapid;
      this.grantCompanion(block.droneType, block.x, block.y);
      meta.scrap += 8;
      meta.score += 240;
      this.missionClaims++;
      this.dropSupplyItem(block.x + 18, block.y, 'cash', 12);
      this.comicSplash(block.x, block.y, 'ALLY!', def.color, 1.2);
      this.screenFlash = Math.max(this.screenFlash, 0.18);
      this.screenFlashColor = def.color;
      this.addShake(6, 0.16);
      saveMeta();
    }

    grantCompanion(type = 'rapid', x = this.player.x, y = this.player.y) {
      const safeType = DRONE_DEFS[type] ? type : 'rapid';
      const def = DRONE_DEFS[safeType];
      let drone = this.companions.find(item => item.type === safeType);
      if (drone) {
        drone.level++;
        drone.skillPoints = (drone.skillPoints || 0) + 1;
        drone.hp = Math.min(drone.maxHp + def.hp * 0.30, (drone.hp || 0) + def.hp * 0.35);
        this.addFloatingText(drone.x, drone.y - 30, `${def.name} 技能點 +1`, def.color, 900, 16);
        this.showCompanionUpgradeChoice(drone);
      } else {
        const idx = this.companions.length;
        drone = { type: safeType, level: 1, skillPoints: 0, upgrades: {}, x, y, angle: idx * Math.PI * 2 / 6, fireClock: 0.2, hp: def.hp, maxHp: def.hp, slashClock: 0 };
        this.companions.push(drone);
        this.addFloatingText(x, y - 30, `${def.name} 加入`, def.color, 1000, 17);
      }
      this.message = `${def.role}｜${def.name}`;
      this.messageTimer = 1.7;
      beep('clear');
      haptic(24);
      return drone;
    }

    companionLevel(drone) {
      return Math.max(1, (drone?.level || 1) + upgradeLevel('drone'));
    }

    companionSkillLevel(drone, id) {
      return Math.max(0, Number(drone?.upgrades?.[id] || 0));
    }

    companionSkillSummary(drone) {
      const tree = DRONE_SKILL_TREES[drone?.type] || [];
      const picked = tree.filter(skill => this.companionSkillLevel(drone, skill.id) > 0);
      if (!picked.length) return '尚未分支';
      return picked.map(skill => `${skill.name}${this.companionSkillLevel(drone, skill.id)}`).join(' / ');
    }

    showCompanionUpgradeChoice(drone) {
      const def = DRONE_DEFS[drone?.type] || DRONE_DEFS.rapid;
      const tree = DRONE_SKILL_TREES[drone?.type] || [];
      if (!tree.length) return;
      const card = ui.overlay?.querySelector('.card');
      if (!card) return;
      this.pausedRun = true;
      setHomePanelsVisible(false);
      card.classList.add('run-card');
      card.querySelector('.eyebrow').textContent = 'COMPANION DUPLICATE // Skill Tree';
      card.querySelector('h2').textContent = `${def.name} 技能樹`;
      const p = card.querySelector('p:not(.eyebrow)');
      if (p) p.textContent = `重複取得 ${def.role}，選擇一個分支升級。每台夥伴機都有自己的技能樹，本局有效。`;
      if (ui.startBtn) ui.startBtn.style.display = 'none';
      if (ui.howBtn) ui.howBtn.style.display = 'none';
      if (ui.homeSettingsBtn) ui.homeSettingsBtn.style.display = 'none';
      let shop = card.querySelector('.run-shop');
      if (!shop) {
        shop = document.createElement('div');
        shop.className = 'run-shop drone-skill-shop';
        card.querySelector('.actions')?.before(shop);
      }
      shop.classList.add('drone-skill-shop');
      shop.innerHTML = `<strong>${def.role}｜Lv.${this.companionLevel(drone)}｜技能點 ${drone.skillPoints || 0}</strong><div class="shop-grid"></div>`;
      const grid = shop.querySelector('.shop-grid');
      for (const skill of tree) {
        const level = this.companionSkillLevel(drone, skill.id);
        const maxed = level >= (skill.max || 3);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-card drone-skill-card';
        btn.disabled = maxed || (drone.skillPoints || 0) <= 0;
        btn.innerHTML = `<b>${skill.name} Lv.${level}/${skill.max || 3}</b><small>${skill.desc}</small><small>${maxed ? '已滿級' : '選擇此分支升級'}</small>`;
        btn.addEventListener('click', () => this.applyCompanionUpgrade(drone.type, skill.id));
        grid.appendChild(btn);
      }
      ui.overlay?.classList.add('visible');
      updateHud(this);
    }

    applyCompanionUpgrade(type, skillId, closeOverlay = true) {
      const drone = this.companions.find(item => item.type === type);
      const tree = DRONE_SKILL_TREES[type] || [];
      const skill = tree.find(item => item.id === skillId);
      if (!drone || !skill) return false;
      drone.upgrades ||= {};
      const current = this.companionSkillLevel(drone, skillId);
      if (current >= (skill.max || 3)) return false;
      if ((drone.skillPoints || 0) <= 0) return false;
      drone.upgrades[skillId] = current + 1;
      drone.skillPoints = Math.max(0, (drone.skillPoints || 0) - 1);
      const def = DRONE_DEFS[type] || DRONE_DEFS.rapid;
      this.addFloatingText(drone.x, drone.y - 36, `${skill.name} Lv.${drone.upgrades[skillId]}`, def.color, 1000, 16);
      this.message = `${def.name}｜${skill.name} Lv.${drone.upgrades[skillId]}`;
      this.messageTimer = 1.8;
      if (closeOverlay) {
        ui.overlay?.classList.remove('visible');
        ui.overlay?.querySelector('.drone-skill-shop')?.remove();
        if (ui.homeSettingsBtn) ui.homeSettingsBtn.style.display = '';
        this.pausedRun = false;
      }
      updateHud(this);
      beep('clear');
      haptic(28);
      return true;
    }

    updateCompanions(dt) {
      const count = Math.max(1, this.companions.length);
      this.companions.forEach((drone, index) => {
        const def = DRONE_DEFS[drone.type] || DRONE_DEFS.rapid;
        const lvl = this.companionLevel(drone);
        const skill = id => this.companionSkillLevel(drone, id);
        drone.angle += dt * (0.44 + index * 0.035 + lvl * 0.01);
        const orbit = def.orbit + 30 + Math.min(54, lvl * 6) + index * 14 + skill('taunt') * 10;
        const slot = drone.angle + index * Math.PI * 2 / count;
        const wobble = Math.sin(this.runTime * 2.1 + index) * 10;
        const tx = this.player.x + Math.cos(slot) * (orbit + wobble);
        const ty = this.player.y + Math.sin(slot) * (orbit * 0.82 + wobble * 0.35);
        const follow = Math.min(1, dt * (2.35 + Math.min(1.4, lvl * 0.08)));
        drone.x += (tx - drone.x) * follow;
        drone.y += (ty - drone.y) * follow;
        drone.fireClock -= dt;
        if (drone.type === 'repair') {
          const lowHpBoost = this.player.hp < playerMaxHp(this) * 0.45 ? skill('triage') * 0.18 : 0;
          if (drone.fireClock <= 0) {
            const heal = (def.heal || 7) + lvl * 2 + skill('medfoam') * 7;
            const before = this.player.hp;
            this.player.hp = Math.min(playerMaxHp(this), this.player.hp + heal);
            if (skill('overheal') > 0 && this.player.hp >= playerMaxHp(this) * 0.92) {
              this.player.invuln = Math.max(this.player.invuln, 0.16 + skill('overheal') * 0.13);
              this.particles.push({ x: this.player.x, y: this.player.y, vx: 0, vy: 0, r: 20, grow: 130 + skill('overheal') * 36, life: 0.3, max: 0.3, color: def.color, ring: true });
            }
            if (this.player.hp > before) this.addFloatingText(this.player.x, this.player.y - 48, `+${Math.round(this.player.hp - before)}`, def.color, 650, 16);
            drone.fireClock = Math.max(0.46, def.fireRate - lvl * 0.12 - skill('triage') * 0.22 - lowHpBoost);
            this.particles.push({ x: this.player.x, y: this.player.y, vx: 0, vy: 0, r: 12, grow: 120, life: 0.28, max: 0.28, color: def.color, ring: true });
          }
          return;
        }
        if (drone.type === 'shield') {
          let blocked = 0;
          const radius = 92 + lvl * 12 + skill('dome') * 28;
          for (const shot of this.enemyShots) {
            if (dist(shot.x, shot.y, this.player.x, this.player.y) < radius) {
              shot.dead = true;
              blocked++;
              if (skill('reflect') > 0) {
                const target = this.nearestEnemyFrom(shot.x, shot.y, 620 + skill('reflect') * 100);
                const a = target ? angleBetween(shot.x, shot.y, target.x, target.y) : angleBetween(this.player.x, this.player.y, shot.x, shot.y);
                this.bullets.push({ x: shot.x, y: shot.y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: 0.8, r: 2.3, damage: 6 + lvl * 2.4 + skill('reflect') * 4, color: def.color, source: 'drone-reflect', pierce: skill('reflect') >= 3 ? 1 : 0, hitIds: skill('reflect') >= 3 ? new Set() : null });
              }
            }
          }
          if (blocked) {
            this.player.invuln = Math.max(this.player.invuln, 0.18 + skill('battery') * 0.10);
            this.particles.push({ x: this.player.x, y: this.player.y, vx: 0, vy: 0, r: 18, grow: radius * 1.7, life: 0.24, max: 0.24, color: def.color, ring: true });
          }
        }
        const targetRange = def.range + lvl * 18 + skill('calibrate') * 90 + skill('lunge') * 38;
        const target = this.nearestEnemyFrom(drone.x, drone.y, targetRange);
        if (!target) return;
        if (drone.type === 'melee') {
          const range = 126 + lvl * 6 + skill('lunge') * 34;
          if (dist(drone.x, drone.y, target.x, target.y) < range && drone.fireClock <= 0) {
            const execute = target.hp < target.maxHp * 0.35 ? 1 + skill('execute') * 0.24 : 1;
            const bossMult = target.type === 'boss' ? 0.42 + skill('execute') * 0.04 : 1;
            const damage = (def.damage + lvl * 5 + skill('execute') * 4) * execute;
            target.hp -= damage * bossMult;
            target.hit = 0.14;
            drone.x += (target.x - drone.x) * 0.28;
            drone.y += (target.y - drone.y) * 0.28;
            this.comicImpact(target.x, target.y, def.color, angleBetween(drone.x, drone.y, target.x, target.y), 0.72 + skill('cleave') * 0.07);
            if (skill('cleave') > 0) {
              const cleaveRadius = 82 + skill('cleave') * 32;
              for (const other of this.enemies) {
                if (other.dead || other === target) continue;
                if (dist(target.x, target.y, other.x, other.y) > cleaveRadius + other.r) continue;
                other.hp -= damage * 0.42;
                other.hit = 0.12;
                if (other.hp <= 0) this.killEnemy(other);
              }
              this.particles.push({ x: target.x, y: target.y, vx: 0, vy: 0, r: 12, grow: cleaveRadius * 2, life: 0.18, max: 0.18, color: def.color, ring: true });
            }
            this.addFloatingText(target.x, target.y - target.r - 10, skill('execute') && execute > 1 ? '處決' : '斬擊', def.color, 420, 14);
            if (target.hp <= 0) this.killEnemy(target);
            drone.fireClock = Math.max(0.16, def.fireRate - lvl * 0.028 - skill('lunge') * 0.018);
          }
          return;
        }
        if (drone.fireClock <= 0) {
          const a = angleBetween(drone.x, drone.y, target.x, target.y);
          const artillery = drone.type === 'artillery';
          const rapid = drone.type === 'rapid';
          const tank = drone.type === 'tank';
          const damage = (def.damage || 8) + lvl * (artillery ? 6 : 2.2) + skill('shell') * 8 + skill('needle') * 2.7 + skill('shock') * 1.8;
          const speed = artillery ? 620 + skill('shell') * 28 : rapid ? 820 + skill('needle') * 55 : 680;
          const radius = artillery ? 3.8 + skill('blast') * 0.35 : tank ? 3.3 : rapid ? 2.1 : 2.2;
          const pierce = artillery ? 1 + skill('shell') : tank && skill('shock') >= 2 ? 1 : 0;
          const blast = artillery ? skill('blast') * 58 : tank ? skill('shock') * 34 : 0;
          const shotCount = rapid ? 1 + Math.min(2, skill('twin')) : 1;
          for (let i = 0; i < shotCount; i++) {
            const off = shotCount === 1 ? 0 : (i - (shotCount - 1) / 2) * 0.13;
            this.bullets.push({ x: drone.x, y: drone.y, vx: Math.cos(a + off) * speed, vy: Math.sin(a + off) * speed, life: artillery ? 1.32 : 0.95, r: radius, damage, color: def.color, source: `drone-${drone.type}`, pierce, blast, hitIds: pierce > 0 ? new Set() : null });
            this.companionShots++;
          }
          const cooldownBonus = skill('capacitor') * 0.055 + skill('calibrate') * 0.075;
          drone.fireClock = Math.max(0.12, def.fireRate - lvl * (rapid ? 0.032 : 0.045) - cooldownBonus);
        }
      });
      this.enemyShots = this.enemyShots.filter(s => !s.dead && s.life > 0);
    }

    nearestEnemyFrom(x, y, maxRange = Infinity) {
      let best = null;
      let bestD = maxRange;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = dist(x, y, e.x, e.y);
        if (d < bestD) { best = e; bestD = d; }
      }
      return best;
    }

    updatePlayer(dt) {
      let mx = 0;
      let my = 0;
      if (this.keys.W.isDown || this.keys.UP.isDown) my -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) my += 1;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) mx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) mx += 1;
      if (this.touchVector && this.touchVector.force > 0) {
        mx = this.touchVector.x * this.touchVector.force;
        my = this.touchVector.y * this.touchVector.force;
      }
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= Math.max(1, len);
        my /= Math.max(1, len);
        this.player.angle = smoothAngle(this.player.angle, Math.atan2(my, mx), 10 * dt);
      } else {
        const target = this.nearestEnemy();
        if (target) this.player.angle = smoothAngle(this.player.angle, angleBetween(this.player.x, this.player.y, target.x, target.y), 6 * dt);
      }
      const zoneSpeed = meta.selectedZone === 'rift' ? 1.03 : 1;
      const coreSpeed = this.boostTimer > 0 ? 1.06 : 1;
      const runSpeed = 1 + upgradeLevel('engine') * 0.045;
      const speed = PLAYER_BASE.speed * zoneSpeed * coreSpeed * runSpeed * (meta.controlMode === 'touch' ? 0.92 : 1);
      this.player.vx = mx * speed;
      this.player.vy = my * speed;
      this.player.x = clamp(this.player.x + this.player.vx * dt, 60, WORLD.w - 60);
      this.player.y = clamp(this.player.y + this.player.vy * dt, 60, WORLD.h - 60);
    }

    updateSpawning(dt) {
      if (this.waveSpawned >= this.waveBudget) return;
      this.spawnClock -= dt;
      const cap = enemyCapValue({ wave: this.wave, controlMode: meta.controlMode, difficulty: difficultyFor(meta.difficulty) });
      if (this.spawnClock <= 0 && this.enemies.length < cap) {
        this.spawnEnemy(this.wave % 5 === 0 ? 'boss' : pickEnemyType(this.wave));
        this.waveSpawned++;
        this.spawnClock = spawnIntervalForWaveValue({ wave: this.wave, controlMode: meta.controlMode });
      }
    }

    spawnEnemy(type = 'chaser') {
      const angle = PhaserLib.Math.FloatBetween(0, Math.PI * 2);
      const radius = PhaserLib.Math.Between(520, 760);
      const px = clamp(this.player.x + Math.cos(angle) * radius, 80, WORLD.w - 80);
      const py = clamp(this.player.y + Math.sin(angle) * radius, 80, WORLD.h - 80);
      const boss = type === 'boss';
      const bossKind = boss ? bossKindForWave(this.wave) : null;
      const hpScale = difficultyFor(meta.difficulty).enemy || 1;
      const def = enemyDef(type, this.wave, bossKind);
      const enemy = {
        id: this.nextEnemyId++,
        type, bossKind, x: px, y: py, vx: 0, vy: 0, r: def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
        speed: def.speed * (difficultyFor(meta.difficulty).speed || 1), color: def.color,
        shotClock: PhaserLib.Math.FloatBetween(boss ? 0.8 : 0.4, boss ? 1.7 : 1.6), dashClock: 0,
        blastClock: 0, attackFlash: 0, phase: PhaserLib.Math.FloatBetween(0, Math.PI * 2), hit: 0
      };
      this.enemies.push(enemy);
      return enemy;
    }

    updateFiring(dt) {
      this.fireClock -= dt;
      if (this.fireClock > 0) return;
      const target = this.nearestEnemy();
      const pointer = this.input.activePointer;
      let a = target && meta.aimAssist !== 'off'
        ? angleBetween(this.player.x, this.player.y, target.x, target.y)
        : angleBetween(this.player.x, this.player.y, pointer.worldX || this.player.x + 1, pointer.worldY || this.player.y);
      if (Number.isNaN(a)) a = this.player.angle;
      this.player.angle = smoothAngle(this.player.angle, a, 0.8);
      this.shotCounter++;
      this.firePlayerBullet(a, { damage: playerDamage(this), r: PLAYER_BULLET_RADIUS, color: '#ffdf68', source: 'fixed-main' });
      this.fireClock = playerFireRate(this);
      beep(this.boostTimer > 0 ? 'surge' : 'shot');
    }

    updateBullets(dt) {
      for (const b of this.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        for (const e of this.enemies) {
          if (e.dead || dist(b.x, b.y, e.x, e.y) > b.r + e.r) continue;
          if (b.hitIds?.has(e.id)) continue;
          if (b.hitIds) b.hitIds.add(e.id);
          e.hp -= b.damage;
          e.hit = 0.12;
          if (b.pierce > 0) b.pierce--;
          else b.dead = true;
          const hitAngle = Math.atan2(b.vy, b.vx);
          this.burst(b.x, b.y, b.color || '#bdfcff', 5, 0.45);
          this.comicImpact(b.x, b.y, e.hp <= 0 ? (b.color || '#ffdf68') : '#f6f2dc', hitAngle, e.hp <= 0 ? 1.05 : 0.72);
          if (e.hp <= 0) this.killEnemy(e);
          if (b.blast > 0) {
            let splashHits = 0;
            for (const other of this.enemies) {
              if (other.dead || other === e) continue;
              if (dist(b.x, b.y, other.x, other.y) > b.blast + other.r) continue;
              other.hp -= b.damage * (other.type === 'boss' ? 0.18 : 0.42);
              other.hit = 0.1;
              splashHits++;
              if (other.hp <= 0) this.killEnemy(other);
            }
            if (splashHits) this.particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: 10, grow: b.blast * 2.2, life: 0.22, max: 0.22, color: b.color || '#ffdf68', ring: true });
          }
          break;
        }
      }
      this.bullets = this.bullets.filter(b => !b.dead && b.life > 0 && b.x > -100 && b.x < WORLD.w + 100 && b.y > -100 && b.y < WORLD.h + 100);

      for (const s of this.enemyShots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        if (dist(s.x, s.y, this.player.x, this.player.y) < s.r + PLAYER_BASE.radius) {
          s.dead = true;
          this.damagePlayer(s.damage, s.x, s.y);
        }
      }
      this.enemyShots = this.enemyShots.filter(s => !s.dead && s.life > 0);
    }

    updateEnemies(dt) {
      for (const e of this.enemies) {
        e.hit = Math.max(0, e.hit - dt);
        e.attackFlash = Math.max(0, (e.attackFlash || 0) - dt);
        e.phase = (e.phase || 0) + dt;
        const a = angleBetween(e.x, e.y, this.player.x, this.player.y);
        const d = dist(e.x, e.y, this.player.x, this.player.y);
        let desired = a;
        let speed = e.speed;

        if (e.type === 'shooter' && d < 440) desired = a + Math.PI;
        if (e.type === 'tank' && d < 280) desired = a + Math.PI;
        if (e.type === 'bomber') {
          if (d < 190) {
            speed *= 0.58;
            e.blastClock = Math.min(1.05, (e.blastClock || 0) + dt);
          } else {
            e.blastClock = Math.max(0, (e.blastClock || 0) - dt * 0.5);
          }
        }
        if (e.type === 'sprinter') {
          e.dashClock -= dt;
          if (e.dashClock <= -1.0) e.dashClock = 0.42;
          if (e.dashClock > 0) {
            speed *= 1.92;
            e.dashClock -= dt;
          }
        }
        if (e.type === 'boss') {
          const kind = e.bossKind || 'warden';
          const far = d > (kind === 'artillery' ? 520 : 360);
          const bossSpeed = kind === 'ironclad' ? (far ? 0.42 : 0.12)
            : kind === 'riftlord' ? (far ? 0.86 : 0.24)
              : kind === 'crystalQueen' ? (far ? 0.66 : 0.16)
                : (far ? 0.72 : 0.18);
          speed *= bossSpeed;
          if (kind === 'artillery' && d < 620) desired = a + Math.PI * 0.72;
        }

        e.vx = Math.cos(desired) * speed;
        e.vy = Math.sin(desired) * speed;
        e.x = clamp(e.x + e.vx * dt, 35, WORLD.w - 35);
        e.y = clamp(e.y + e.vy * dt, 35, WORLD.h - 35);

        if (e.type === 'bomber' && e.blastClock >= 0.95) {
          this.enemyBlast(e);
          continue;
        }

        this.updateEnemyAttacks(e, a, d, dt);

        if (d < e.r + PLAYER_BASE.radius) {
          this.damagePlayer(e.type === 'boss' ? 22 : e.type === 'bomber' ? 18 : 13, e.x, e.y);
          const push = angleBetween(e.x, e.y, this.player.x, this.player.y);
          this.player.x = clamp(this.player.x + Math.cos(push) * 28, 60, WORLD.w - 60);
          this.player.y = clamp(this.player.y + Math.sin(push) * 28, 60, WORLD.h - 60);
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    updateEnemyAttacks(e, a, d, dt) {
      if (e.type === 'shooter' && d < 840) {
        e.shotClock -= dt;
        if (e.shotClock <= 0) {
          const spread = this.wave >= 6 ? [-0.16, 0, 0.16] : [0];
          for (const off of spread) this.enemyShot(e, a + off, 310, 3.25, 5, 9, '#ff3df2');
          e.attackFlash = 0.22;
          e.shotClock = 1.35;
        }
      }
      if (e.type === 'tank' && d < 680) {
        e.shotClock -= dt;
        if (e.shotClock <= 0) {
          for (const off of [-0.48, 0, 0.48]) this.enemyShot(e, a + off, 220, 3.7, 6, 11, '#8aa3ff');
          e.attackFlash = 0.28;
          e.shotClock = 2.05;
        }
      }
      if (e.type === 'boss' && d < 940) this.bossAttack(e, a, dt);
    }

    bossAttack(e, a, dt) {
      e.shotClock -= dt;
      if (e.shotClock > 0) return;
      const kind = e.bossKind || 'warden';
      e.attackFlash = 0.42;
      if (kind === 'artillery') {
        for (const off of [-0.64, -0.32, 0, 0.32, 0.64]) this.enemyShot(e, a + off, 245, 4.2, 7, 13, '#ff8c22');
        this.enemyShot(e, a, 170, 5.0, 11, 18, '#ffd166');
        e.shotClock = 1.75;
      } else if (kind === 'riftlord') {
        for (const off of [-0.72, -0.36, 0.36, 0.72]) this.enemyShot(e, a + off, 300, 3.0, 5, 12, '#ff3df2');
        for (const dir of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) this.enemyShot(e, dir + e.phase * 0.28, 230, 3.4, 5.5, 10, '#ff4d6d');
        e.shotClock = 1.25;
      } else if (kind === 'crystalQueen') {
        for (let i = 0; i < 8; i++) this.enemyShot(e, e.phase * 0.35 + i * Math.PI * 2 / 8, 210, 4.1, 5, 10, i % 2 ? '#62ff91' : '#ffd166');
        this.enemyShot(e, a, 330, 2.7, 5, 12, '#ffd166');
        e.shotClock = 1.45;
      } else if (kind === 'ironclad') {
        for (const off of [-0.38, 0, 0.38]) this.enemyShot(e, a + off, 190, 4.8, 9, 17, '#8aa3ff');
        e.shotClock = 2.15;
      } else if (kind === 'starcore') {
        for (let i = 0; i < 12; i++) this.enemyShot(e, e.phase * 0.22 + i * Math.PI * 2 / 12, 235, 3.7, 5, 11, '#ffdf68');
        for (const off of [-0.18, 0, 0.18]) this.enemyShot(e, a + off, 300, 3.1, 5, 14, '#ff4d6d');
        e.shotClock = 1.18;
      } else {
        for (const off of [-0.34, 0, 0.34]) this.enemyShot(e, a + off, 270, 3.4, 5, 13, '#ff4d6d');
        e.shotClock = 1.32;
      }
      this.addFloatingText(e.x, e.y - e.r - 18, bossName(kind), bossColor(kind), 520, 15);
    }

    enemyShot(e, angle, speed, life, radius, damage, color = '#ff4d6d') {
      this.enemyShots.push({
        x: e.x + Math.cos(angle) * (e.r + 8),
        y: e.y + Math.sin(angle) * (e.r + 8),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        r: Math.max(1.8, radius * ENEMY_BULLET_SCALE),
        damage,
        color
      });
    }

    enemyBlast(e) {
      if (e.dead) return;
      e.dead = true;
      const radius = 146;
      this.particles.push({ x: e.x, y: e.y, vx: 0, vy: 0, r: 20, grow: radius * 3.2, life: 0.32, max: 0.32, color: '#ff8c22', ring: true });
      this.comicSplash(e.x, e.y, 'BOOM!', '#ff8c22', 1.08);
      this.addShake(5, 0.16);
      beep('hurt');
      haptic(20);
      if (dist(e.x, e.y, this.player.x, this.player.y) < radius + PLAYER_BASE.radius) this.damagePlayer(24, e.x, e.y);
    }

    updateDrops(dt) {
      for (const s of this.shards) {
        const isSupply = !!SUPPLY_ITEM_DEFS[s.kind];
        const d = dist(s.x, s.y, this.player.x, this.player.y);
        const magnet = (isSupply ? 215 : 170) * (1 + upgradeLevel('magnet') * 0.12 + (this.magnetTimer > 0 ? 0.55 : 0));
        if (d < magnet) {
          const a = angleBetween(s.x, s.y, this.player.x, this.player.y);
          const pull = (isSupply ? 640 : 520) * (1 + upgradeLevel('magnet') * 0.08 + (this.magnetTimer > 0 ? 0.35 : 0));
          s.vx += Math.cos(a) * pull * dt;
          s.vy += Math.sin(a) * pull * dt;
          if (Math.random() < (isSupply ? 0.42 : 0.18)) this.particles.push({ x: s.x, y: s.y, vx: -Math.cos(a) * 45, vy: -Math.sin(a) * 45, r: isSupply ? 2.5 : 2.1, life: 0.22, max: 0.22, color: s.color || '#ffdf68', kind: 'spark' });
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.pow(isSupply ? 0.028 : 0.02, dt);
        s.vy *= Math.pow(isSupply ? 0.028 : 0.02, dt);
        if (d < PLAYER_BASE.radius + (isSupply ? 15 : 12)) {
          s.dead = true;
          if (isSupply) {
            this.applySupplyItem(s, s.x, s.y);
          } else {
            meta.scrap += s.value;
            meta.score += s.value * 4;
            this.comicImpact(s.x, s.y, '#ffdf68', angleBetween(s.x, s.y, this.player.x, this.player.y), 0.45);
          }
        }
      }
      this.shards = this.shards.filter(s => !s.dead);
    }

    applySupplyItem(item, x = this.player.x, y = this.player.y) {
      this.supplyPickups = (this.supplyPickups || 0) + 1;
      const def = SUPPLY_ITEM_DEFS[item.kind] || SUPPLY_ITEM_DEFS.cash;
      const value = item.value ?? def.value;
      const color = item.color || def.color;
      if (item.kind === 'repair') {
        const before = this.player.hp;
        this.player.hp = Math.min(playerMaxHp(this), this.player.hp + value);
        this.addFloatingText(this.player.x, this.player.y - 42, `維修 +${Math.round(this.player.hp - before)}`, color, 780, 15);
      } else if (item.kind === 'cash') {
        meta.scrap += value || 8;
        meta.score += (value || 8) * 7;
        this.addFloatingText(x, y - 20, `貨幣 +${value || 8}`, color, 780, 15);
        saveMeta();
      } else if (item.kind === 'armor') {
        this.armorBuffTimer = Math.max(this.armorBuffTimer || 0, item.duration || def.duration || 10);
        this.player.invuln = Math.max(this.player.invuln, 0.28);
        this.addFloatingText(this.player.x, this.player.y - 44, `護甲 ${Math.ceil(this.armorBuffTimer)}s`, color, 780, 15);
      } else if (item.kind === 'boost') {
        this.boostTimer = Math.max(this.boostTimer || 0, item.duration || def.duration || 8);
        this.addFloatingText(this.player.x, this.player.y - 44, `增效 ${Math.ceil(this.boostTimer)}s`, color, 780, 15);
      } else if (item.kind === 'magnet') {
        this.magnetTimer = Math.max(this.magnetTimer || 0, item.duration || def.duration || 10);
        this.addFloatingText(this.player.x, this.player.y - 44, `磁吸 ${Math.ceil(this.magnetTimer)}s`, color, 780, 15);
      }
      this.comicImpact(x, y, color, angleBetween(x, y, this.player.x, this.player.y), 0.46);
      this.particles.push({ x: this.player.x, y: this.player.y, vx: 0, vy: 0, r: 12, grow: item.kind === 'armor' ? 170 : 118, life: 0.24, max: 0.24, color, ring: true });
      beep(item.kind === 'cash' ? 'hit' : 'clear');
      haptic(item.kind === 'cash' ? 8 : 18);
    }

    updateParticles(dt) {
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      this.screenFlash = Math.max(0, this.screenFlash - dt);
      if (this.damageCue) {
        this.damageCue.life -= dt;
        if (this.damageCue.life <= 0) this.damageCue = null;
      }
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.r += (p.grow || 0) * dt;
      }
      this.particles = this.particles.filter(p => p.life > 0).slice(-MAX_PARTICLES);
    }

    updateWaveProgress() {
      if (this.waveSpawned < this.waveBudget || this.enemies.length) return;
      if (this.wave >= 10) return this.clearRun();
      this.startWave(this.wave + 1);
    }

    updateCamera(dt) {
      const cam = this.cameras.main;
      cam.scrollX += (this.player.x - cam.width / 2 - cam.scrollX) * Math.min(1, 8 * dt);
      cam.scrollY += (this.player.y - cam.height / 2 - cam.scrollY) * Math.min(1, 8 * dt);
      if (this.shakeTime > 0 && meta.shakeStrength > 0) {
        const amount = this.shakeAmount * meta.shakeStrength * (this.shakeTime / 0.24);
        cam.scrollX += PhaserLib.Math.FloatBetween(-amount, amount);
        cam.scrollY += PhaserLib.Math.FloatBetween(-amount, amount);
      }
    }

    damagePlayer(amount, sx, sy) {
      if (this.player.invuln > 0 || this.gameOver) return;
      const shieldDrone = this.companions.find(d => d.type === 'shield');
      const guardDrone = this.companions.find(d => d.type === 'tank');
      const guardSkill = guardDrone ? this.companionSkillLevel(guardDrone, 'plates') : 0;
      const shieldSkill = shieldDrone ? this.companionSkillLevel(shieldDrone, 'battery') : 0;
      const armorItem = this.armorBuffTimer > 0 ? 0.20 : 0;
      const reduction = 1 - Math.min(0.64, armorItem + upgradeLevel('armor') * 0.025 + (shieldDrone ? this.companionLevel(shieldDrone) * 0.025 + shieldSkill * 0.018 : 0) + (guardDrone ? this.companionLevel(guardDrone) * 0.015 + guardSkill * 0.028 : 0));
      const finalAmount = amount * reduction;
      this.player.hp -= finalAmount;
      this.player.invuln = 0.42;
      this.addFloatingText(this.player.x, this.player.y - 28, `-${Math.round(finalAmount)}`, '#ff4d6d', 650);
      this.burst(sx, sy, '#ff4d6d', 10, 0.85);
      this.comicImpact(sx, sy, '#e83b3b', angleBetween(sx, sy, this.player.x, this.player.y), 0.95);
      this.screenFlash = Math.max(this.screenFlash, 0.22);
      this.screenFlashColor = '#e83b3b';
      this.damageCue = { x: sx, y: sy, life: 0.34, max: 0.34 };
      this.addShake(4, 0.18);
      beep('hurt');
      haptic(28);
      if (this.player.hp <= 0) this.endRun(false);
    }

    killEnemy(e) {
      if (e.dead) return;
      e.dead = true;
      const boss = e.type === 'boss';
      this.kills++;
      meta.score += boss ? 550 : 70;
      const color = boss ? bossColor(e.bossKind || 'warden') : e.color;
      this.addFloatingText(e.x, e.y - e.r, boss ? bossName(e.bossKind || 'warden') : '+KILL', boss ? color : '#bdfcff', 800);
      this.burst(e.x, e.y, color, boss ? 34 : 13, boss ? 1.45 : 0.8);
      this.comicSplash(e.x, e.y, boss ? 'KRAK!!' : 'BLAM!', boss ? color : e.color, boss ? 1.28 : 0.82);
      this.screenFlash = Math.max(this.screenFlash, boss ? 0.22 : 0.08);
      this.screenFlashColor = boss ? color : '#78f6ff';
      this.dropShards(e.x, e.y, boss ? 18 : PhaserLib.Math.Between(2, 4));
      const supplyChance = boss ? 1 : 0.11 + upgradeLevel('survey') * 0.025 + (this.player.hp < playerMaxHp(this) * 0.45 ? 0.12 : 0);
      if (boss || Math.random() < supplyChance) {
        const count = boss ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const kind = this.randomSupplyKind();
          this.dropSupplyItem(e.x + PhaserLib.Math.Between(-28, 28), e.y + PhaserLib.Math.Between(-28, 28), kind);
        }
      }
      beep(boss ? 'surge' : 'hit');
      haptic(boss ? 38 : 10);
      if (!boss) this.recordCombatKill(e);
      else this.addShake(7, 0.22);
    }

    recordCombatKill(e) {
      const state = combatChainAfterKill({ combo: this.combo, timer: this.comboTimer, best: this.bestCombo });
      this.combo = state.combo;
      this.comboTimer = state.timer;
      this.bestCombo = state.best;
      if (this.combo >= 3) this.addFloatingText(e.x, e.y - e.r - 18, `連殺 x${this.combo}`, COMBAT_SURGE_DEF.color, 750);
      if (state.surgeReady) this.triggerCombatSurge(e);
    }

    triggerCombatSurge(source) {
      this.surgeCount++;
      const radius = COMBAT_SURGE_DEF.shockwaveRadius + Math.min(58, this.combo * 4);
      const amount = combatSurgeShockwaveDamage({ wave: this.wave, combo: this.combo, def: COMBAT_SURGE_DEF });
      let hits = 0;
      for (const e of this.enemies) {
        if (e.dead || e === source) continue;
        const d = dist(source.x, source.y, e.x, e.y);
        if (d > radius + e.r) continue;
        e.hp -= amount * (e.type === 'boss' ? 0.42 : 1);
        e.hit = 0.18;
        hits++;
        if (e.hp <= 0) this.killEnemy(e);
      }
      this.particles.push({ x: source.x, y: source.y, vx: 0, vy: 0, r: 18, grow: radius * 4, life: 0.35, max: 0.35, color: COMBAT_SURGE_DEF.color, ring: true });
      this.comicSplash(source.x, source.y, 'SURGE!', COMBAT_SURGE_DEF.color, 1.45);
      this.screenFlash = Math.max(this.screenFlash, 0.20);
      this.screenFlashColor = COMBAT_SURGE_DEF.color;
      this.addFloatingText(source.x, source.y - 48, `${COMBAT_SURGE_DEF.name}｜${hits}`, COMBAT_SURGE_DEF.color, 1050);
      this.addShake(8, 0.22);
      beep('surge');
      haptic(32);
    }

    dropShards(x, y, count) {
      for (let i = 0; i < count; i++) {
        const a = PhaserLib.Math.FloatBetween(0, Math.PI * 2);
        const speed = PhaserLib.Math.Between(80, 210);
        this.shards.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 4, value: 1 });
      }
    }

    dropSupplyItem(x, y, kind = 'cash', value = null) {
      const a = PhaserLib.Math.FloatBetween(0, Math.PI * 2);
      const speed = PhaserLib.Math.Between(70, 150);
      const def = SUPPLY_ITEM_DEFS[kind] || SUPPLY_ITEM_DEFS.cash;
      const itemKind = SUPPLY_ITEM_DEFS[kind] ? kind : 'cash';
      const color = def.color;
      this.shards.push({ kind: itemKind, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: itemKind === 'cash' ? 5.2 : itemKind === 'repair' ? 6.2 : 6.8, value: value ?? def.value, duration: def.duration || 0, color });
      this.particles.push({ x, y, vx: 0, vy: 0, r: 8, grow: 96, life: 0.2, max: 0.2, color, ring: true });
      this.addFloatingText(x, y - 26, def.name, color, 650, 14);
    }

    randomSupplyKind() {
      if (this.player.hp < playerMaxHp(this) * 0.52 && Math.random() < 0.36) return 'repair';
      const roll = Math.random();
      if (roll < 0.30) return 'cash';
      if (roll < 0.52) return 'armor';
      if (roll < 0.76) return 'boost';
      if (roll < 0.92) return 'magnet';
      return 'repair';
    }

    burst(x, y, color, count, scale = 1) {
      for (let i = 0; i < count; i++) {
        const a = PhaserLib.Math.FloatBetween(0, Math.PI * 2);
        const speed = PhaserLib.Math.Between(50, 260) * scale;
        this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: PhaserLib.Math.FloatBetween(1.6, 4.2) * scale, life: PhaserLib.Math.FloatBetween(0.18, 0.52), max: 0.52, color, kind: 'spark' });
      }
    }

    comicImpact(x, y, color, angle = 0, scale = 1) {
      this.particles.push({ x, y, vx: 0, vy: 0, r: 12 * scale, grow: 180 * scale, life: 0.22, max: 0.22, color, ring: true });
      this.particles.push({ x, y, vx: 0, vy: 0, r: 22 * scale, grow: 86 * scale, life: 0.18, max: 0.18, color, kind: 'star' });
      for (let i = -2; i <= 2; i++) {
        const a = angle + i * 0.28 + PhaserLib.Math.FloatBetween(-0.08, 0.08);
        const speed = PhaserLib.Math.Between(170, 330) * scale;
        this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: PhaserLib.Math.FloatBetween(2.2, 4.8) * scale, life: 0.20 + Math.random() * 0.18, max: 0.32, color, kind: 'slash' });
      }
    }

    comicSplash(x, y, text, color = '#ffdf68', scale = 1) {
      this.comicImpact(x, y, color, -Math.PI / 2, scale);
      this.addFloatingText(x, y - 30 * scale, text, color, 880 + scale * 120, 22 + scale * 10);
    }

    addShake(amount, duration) {
      this.shakeAmount = Math.max(this.shakeAmount, amount);
      this.shakeTime = Math.max(this.shakeTime, duration);
    }

    nearestEnemy() {
      let best = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        const d = dist(this.player.x, this.player.y, e.x, e.y);
        if (d < bestD) { best = e; bestD = d; }
      }
      return best;
    }

    clearRun() {
      this.endRun(true);
    }

    endRun(clear) {
      this.gameOver = true;
      this.running = false;
      meta.bestWave = Math.max(meta.bestWave || 1, this.wave);
      meta.recentRuns = [{
        id: Date.now(), engine: 'Phaser', status: clear ? 'clear' : 'dead', wave: this.wave, kills: this.kills,
        combo: this.bestCombo, surges: this.surgeCount, supplies: this.supplyPickups,
        missions: this.missionClaims, companions: this.companions.length, companionTrees: this.companions.map(d => `${DRONE_DEFS[d.type]?.name || d.type}:${this.companionSkillSummary(d)}`), revives: this.reviveCount,
        time: Math.floor(this.runTime), scrap: meta.scrap, score: meta.score
      }, ...(meta.recentRuns || [])].slice(0, 5);
      saveMeta();
      this.showRunOverlay(clear);
      beep(clear ? 'clear' : 'hurt');
      haptic(clear ? 48 : 32);
    }

    showRunOverlay(clear) {
      const card = ui.overlay?.querySelector('.card');
      if (!card) return;
      card.classList.add('run-card');
      setHomePanelsVisible(false);
      card.querySelector('.eyebrow').textContent = clear ? 'SECTOR CLEAR // Phaser runtime' : 'RUN TERMINATED // Phaser runtime';
      card.querySelector('h2').textContent = clear ? '星環核心已回收' : '飛船解體，但資料已保存';
      const p = card.querySelector('p:not(.eyebrow)');
      if (p) p.textContent = `Engine Phaser｜時間 ${formatTime(this.runTime)}｜第 ${this.wave} 波｜擊殺 ${this.kills}｜任務 ${this.missionClaims}｜夥伴 ${this.companions.length}｜技能樹 ${this.companions.filter(d => Object.keys(d.upgrades || {}).length).length}｜道具 ${this.supplyPickups || 0}｜碎晶 ${meta.scrap}`;
      this.renderOverlayShop(card, clear);
      if (ui.startBtn) {
        ui.startBtn.textContent = '再次出擊';
        ui.startBtn.style.display = '';
      }
      if (ui.homeSettingsBtn) ui.homeSettingsBtn.style.display = '';
      if (ui.howBtn) ui.howBtn.style.display = '';
      ui.overlay.classList.add('visible');
      updateMetaPanels();
    }

    reviveCost() {
      return Math.ceil(42 + this.wave * 6 + this.reviveCount * 36);
    }

    reviveRun() {
      if (!this.gameOver) return false;
      const cost = this.reviveCost();
      if ((meta.scrap || 0) < cost) {
        flash(`接關需要 ${cost} 碎晶`);
        return false;
      }
      meta.scrap -= cost;
      this.reviveCount++;
      this.gameOver = false;
      this.running = true;
      this.pausedRun = false;
      this.player.maxHp = playerMaxHp(this);
      this.player.hp = Math.max(44, this.player.maxHp * 0.62);
      this.player.invuln = 2.4;
      this.enemyShots = [];
      for (const e of this.enemies) {
        const push = angleBetween(this.player.x, this.player.y, e.x, e.y);
        e.x = clamp(e.x + Math.cos(push) * 96, 60, WORLD.w - 60);
        e.y = clamp(e.y + Math.sin(push) * 96, 60, WORLD.h - 60);
      }
      ui.overlay?.classList.remove('visible');
      saveMeta();
      this.comicSplash(this.player.x, this.player.y, 'CONTINUE!', '#62ff91', 1.25);
      this.addShake(7, 0.18);
      updateHud(this);
      flash(`接關成功｜-${cost} 碎晶`);
      beep('clear');
      haptic(44);
      return true;
    }

    renderOverlayShop(card, clear) {
      let shop = card.querySelector('.run-shop');
      if (!shop) {
        shop = document.createElement('div');
        shop.className = 'run-shop';
        card.querySelector('.actions')?.before(shop);
      }
      shop.innerHTML = '';
      if (!clear) {
        const cost = this.reviveCost();
        const reviveWrap = document.createElement('section');
        reviveWrap.className = 'skill-tree-section revive-section';
        reviveWrap.innerHTML = '<header><strong>接關</strong><small>復活會保留本局夥伴機與已選夥伴技能。</small></header><div class="shop-grid"></div>';
        const grid = reviveWrap.querySelector('.shop-grid');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'shop-card revive';
        btn.disabled = (meta.scrap || 0) < cost;
        btn.innerHTML = `<b>花 ${cost} 碎晶接關</b><small>復活並保留本局夥伴機與技能樹</small>`;
        btn.addEventListener('click', () => { if (this.reviveRun()) shop.remove(); });
        grid.appendChild(btn);
        shop.appendChild(reviveWrap);
      }
      renderShipSkillTree(shop, () => this.renderOverlayShop(card, clear));
      renderCompanionSkillPanel(shop, this, () => this.renderOverlayShop(card, clear));
    }

    drawAll() {
      this.g.clear();
      this.uiG.clear();
      this.drawBackground();
      this.drawMissionBlocks();
      this.drawDrops();
      this.drawBullets();
      this.drawEnemies();
      this.drawCompanions();
      this.drawPlayer();
      this.drawParticles();
      this.drawComicOverlay();
      this.drawScreenHints();
    }

    drawBackground() {
      const g = this.g;
      const style = currentRouteStyle();
      const accent = colorValue(style.accent);
      const secondary = colorValue(style.secondary);
      const dark = colorValue(style.dark);

      g.fillStyle(dark, 1);
      g.fillRect(0, 0, WORLD.w, WORLD.h);

      // Route-colored nebula slabs: broad background mood without hiding bullets.
      g.fillStyle(accent, 0.13);
      g.fillCircle(WORLD.w * 0.17, WORLD.h * 0.18, 560);
      g.fillStyle(secondary, 0.10);
      g.fillCircle(WORLD.w * 0.83, WORLD.h * 0.23, 520);
      g.fillStyle(COMIC.magenta, style.id === 'rift' ? 0.14 : 0.06);
      g.fillCircle(WORLD.w * 0.56, WORLD.h * 0.84, 620);

      // Far star field, deterministic so the world reads like a place instead of noise.
      for (const star of BACKDROP_PROPS.stars) {
        const twinkle = 0.62 + Math.sin(performance.now() * 0.0015 + star.phase) * 0.22;
        g.fillStyle(star.warm ? COMIC.gold : COMIC.cyan, star.alpha * twinkle);
        g.fillCircle(star.x, star.y, star.r);
      }

      // Comic panel geometry remains, but now sits behind real scenery silhouettes.
      g.fillStyle(0x173b76, 0.30);
      g.fillTriangle(0, 0, 860, 0, 0, WORLD.h * 0.8);
      g.fillStyle(0x822c2d, 0.25);
      g.fillTriangle(WORLD.w, 0, WORLD.w, WORLD.h, WORLD.w - 720, WORLD.h);
      g.fillStyle(secondary, 0.08);
      g.fillTriangle(WORLD.w * 0.22, WORLD.h, WORLD.w * 0.58, 0, WORLD.w * 0.90, WORLD.h);
      g.lineStyle(7, COMIC.ink, 0.58);
      g.lineBetween(0, WORLD.h * 0.8, 860, 0);
      g.lineBetween(WORLD.w - 720, WORLD.h, WORLD.w, 0);
      g.lineBetween(WORLD.w * 0.22, WORLD.h, WORLD.w * 0.58, 0);
      g.lineBetween(WORLD.w * 0.90, WORLD.h, WORLD.w * 0.58, 0);

      this.drawSectorScenery(style);

      // Sparse halftone dots, kept behind gameplay entities.
      for (let y = 110; y < WORLD.h; y += 132) {
        for (let x = 90; x < WORLD.w; x += 132) {
          const wave = Math.sin(x * 0.006 + y * 0.011);
          const radius = 2.4 + Math.max(0, wave) * 5.4;
          const warmSide = x > WORLD.w * 0.62;
          g.fillStyle(warmSide ? COMIC.orange : accent, warmSide ? 0.10 : 0.08);
          g.fillCircle(x, y, radius);
        }
      }

      // Graphic seams / border clarify that this is a stylized comic battlefield.
      g.lineStyle(3, 0xffffff, 0.06);
      for (let y = 180; y <= WORLD.h; y += 220) g.lineBetween(80, y, WORLD.w - 80, y - 96);
      g.lineStyle(2, COMIC.ink, 0.36);
      for (let x = 0; x <= WORLD.w; x += 320) g.lineBetween(x, 0, x - 170, WORLD.h);
      g.lineStyle(7, COMIC.ink, 0.95);
      g.strokeRect(24, 24, WORLD.w - 48, WORLD.h - 48);
      g.lineStyle(3, accent, 0.58);
      g.strokeRect(34, 34, WORLD.w - 68, WORLD.h - 68);
    }

    drawSectorScenery(style) {
      const g = this.g;
      const accent = colorValue(style.accent);
      const secondary = colorValue(style.secondary);
      for (const wreck of BACKDROP_PROPS.wrecks) this.drawWreckage(wreck, accent, secondary);
      for (const beacon of BACKDROP_PROPS.beacons) this.drawBeacon(beacon, accent, style.id === 'random' ? 0.78 : 0.46);
      for (const crystal of BACKDROP_PROPS.crystals) this.drawCrystalCluster(crystal, style.id === 'crystal' ? 1 : 0.45, accent, secondary);
      for (const rift of BACKDROP_PROPS.rifts) this.drawRiftCrack(rift, style.id === 'rift' ? 1 : 0.36, accent);

      const cx = WORLD.w * 0.5;
      const cy = WORLD.h * 0.52;
      g.lineStyle(10, COMIC.ink, 0.82);
      g.fillStyle(COMIC.ink, 0.25);
      g.fillRoundedRect(cx - 116, cy - 58, 232, 116, 18);
      g.fillStyle(accent, 0.18);
      g.fillRoundedRect(cx - 104, cy - 46, 208, 92, 16);
      g.strokeRoundedRect(cx - 116, cy - 58, 232, 116, 18);
      g.lineStyle(5, secondary, 0.52);
      g.lineBetween(cx - 92, cy, cx + 92, cy);
      g.lineBetween(cx, cy - 39, cx, cy + 39);
      g.fillStyle(secondary, 0.78);
      g.fillCircle(cx, cy, 15);
    }

    drawWreckage(prop, accent, secondary) {
      const g = this.g;
      const hull = rotatedBox(prop.x, prop.y, prop.w, prop.h, prop.a);
      g.fillStyle(COMIC.shadow, 0.20);
      fillPoly(g, rotatedBox(prop.x + 10, prop.y + 12, prop.w, prop.h, prop.a));
      g.fillStyle(accent, 0.15);
      fillPoly(g, hull);
      g.lineStyle(8, COMIC.ink, 0.72);
      strokePoly(g, hull);
      const stripe = rotatedBox(prop.x, prop.y, prop.w * 0.72, Math.max(7, prop.h * 0.16), prop.a);
      g.fillStyle(secondary, 0.20);
      fillPoly(g, stripe);
      g.lineStyle(3, COMIC.ink, 0.45);
      const p1 = point(prop.x, prop.y, prop.a, -prop.w * 0.38);
      const p2 = point(prop.x, prop.y, prop.a, prop.w * 0.38);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }

    drawCrystalCluster(prop, emphasis, accent, secondary) {
      const g = this.g;
      const alpha = 0.18 + 0.34 * emphasis;
      for (let i = 0; i < 3; i++) {
        const x = prop.x + (i - 1) * prop.r * 0.55;
        const h = prop.r * (1.4 - i * 0.12);
        g.lineStyle(5, COMIC.ink, alpha + 0.18);
        g.strokeTriangle(x, prop.y - h, x + prop.r * 0.48, prop.y + prop.r * 0.55, x - prop.r * 0.38, prop.y + prop.r * 0.72);
        g.fillStyle(i % 2 ? accent : secondary, alpha);
        g.fillTriangle(x, prop.y - h, x + prop.r * 0.48, prop.y + prop.r * 0.55, x - prop.r * 0.38, prop.y + prop.r * 0.72);
      }
    }

    drawRiftCrack(prop, emphasis, accent) {
      const g = this.g;
      const alpha = 0.12 + 0.42 * emphasis;
      const dx = Math.cos(prop.a);
      const dy = Math.sin(prop.a);
      const nx = -dy;
      const ny = dx;
      let last = null;
      for (let i = 0; i <= 7; i++) {
        const t = i / 7 - 0.5;
        const wobble = Math.sin(prop.phase + i * 1.9) * prop.amp;
        const p = { x: prop.x + dx * prop.len * t + nx * wobble, y: prop.y + dy * prop.len * t + ny * wobble };
        if (last) {
          g.lineStyle(11, COMIC.ink, alpha * 0.62);
          g.lineBetween(last.x, last.y, p.x, p.y);
          g.lineStyle(5, accent, alpha);
          g.lineBetween(last.x, last.y, p.x, p.y);
        }
        last = p;
      }
    }

    drawBeacon(prop, accent, alpha) {
      const g = this.g;
      const top = { x: prop.x, y: prop.y - prop.h * 0.62 };
      const bottom = { x: prop.x, y: prop.y + prop.h * 0.62 };
      g.lineStyle(8, COMIC.ink, alpha * 0.72);
      g.lineBetween(top.x, top.y, bottom.x, bottom.y);
      g.lineStyle(4, accent, alpha * 0.72);
      g.lineBetween(top.x, top.y, bottom.x, bottom.y);
      g.lineStyle(5, COMIC.ink, alpha);
      g.strokeTriangle(prop.x, prop.y - prop.h * 0.82, prop.x + prop.w, prop.y, prop.x, prop.y + prop.h * 0.82);
      g.strokeTriangle(prop.x, prop.y - prop.h * 0.82, prop.x - prop.w, prop.y, prop.x, prop.y + prop.h * 0.82);
      g.fillStyle(accent, alpha * 0.16);
      g.fillTriangle(prop.x, prop.y - prop.h * 0.82, prop.x + prop.w, prop.y, prop.x, prop.y + prop.h * 0.82);
      g.fillTriangle(prop.x, prop.y - prop.h * 0.82, prop.x - prop.w, prop.y, prop.x, prop.y + prop.h * 0.82);
      g.fillStyle(COMIC.gold, alpha * 0.60);
      g.fillCircle(prop.x, prop.y, 7);
    }

    drawPlayer() {
      const p = this.player;
      const g = this.g;
      const flicker = p.invuln > 0 && Math.sin(performance.now() * 0.04) > 0;
      if (flicker) return;
      const style = currentRouteStyle();
      const accent = colorValue(style.accent);
      const secondary = colorValue(style.secondary);
      const a = p.angle;
      const S = PLAYER_VISUAL_SCALE;
      const R = value => value * S;
      const L = value => Math.max(1, value * S);
      const nose = point(p.x, p.y, a, R(27));
      const left = point(p.x, p.y, a + 2.46, R(21));
      const right = point(p.x, p.y, a - 2.46, R(21));
      const tail = point(p.x, p.y, a + Math.PI, R(18));
      const leftWing = point(p.x, p.y, a + 2.92, R(31));
      const rightWing = point(p.x, p.y, a - 2.92, R(31));
      const leftGun = point(p.x, p.y, a + 2.76, R(22));
      const rightGun = point(p.x, p.y, a - 2.76, R(22));

      // Route skin: same readable silhouette, scaled to 50% of the previous ship size.
      g.lineStyle(L(15), COMIC.ink, 1);
      g.strokeTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);
      g.fillStyle(accent, 0.98);
      g.fillTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);

      g.lineStyle(L(10), COMIC.ink, 1);
      g.strokeTriangle(tail.x, tail.y, leftWing.x, leftWing.y, left.x, left.y);
      g.strokeTriangle(tail.x, tail.y, rightWing.x, rightWing.y, right.x, right.y);
      g.fillStyle(COMIC.red, style.id === 'rift' ? 1 : 0.86);
      g.fillTriangle(tail.x, tail.y, leftWing.x, leftWing.y, left.x, left.y);
      g.fillStyle(secondary, 0.94);
      g.fillTriangle(tail.x, tail.y, rightWing.x, rightWing.y, right.x, right.y);

      g.lineStyle(L(7), COMIC.ink, 0.92);
      g.lineBetween(leftGun.x, leftGun.y, nose.x, nose.y);
      g.lineBetween(rightGun.x, rightGun.y, nose.x, nose.y);
      g.lineStyle(L(3), COMIC.white, 0.86);
      g.lineBetween(point(leftGun.x, leftGun.y, a, R(4)).x, point(leftGun.x, leftGun.y, a, R(4)).y, point(nose.x, nose.y, a + Math.PI, R(8)).x, point(nose.x, nose.y, a + Math.PI, R(8)).y);
      g.lineBetween(point(rightGun.x, rightGun.y, a, R(4)).x, point(rightGun.x, rightGun.y, a, R(4)).y, point(nose.x, nose.y, a + Math.PI, R(8)).x, point(nose.x, nose.y, a + Math.PI, R(8)).y);

      const canopy = point(p.x, p.y, a, R(4));
      g.lineStyle(L(6), COMIC.ink, 1);
      g.fillStyle(COMIC.white, 1);
      g.fillCircle(canopy.x, canopy.y, R(8));
      g.strokeCircle(canopy.x, canopy.y, R(8));
      g.fillStyle(COMIC.ink, 0.72);
      g.fillCircle(point(canopy.x, canopy.y, a, R(2)).x, point(canopy.x, canopy.y, a, R(2)).y, R(3.2));
      g.lineStyle(L(4), secondary, 0.9);
      g.lineBetween(point(tail.x, tail.y, a, R(5)).x, point(tail.x, tail.y, a, R(5)).y, point(nose.x, nose.y, a + Math.PI, R(5)).x, point(nose.x, nose.y, a + Math.PI, R(5)).y);

      const badge = point(p.x, p.y, a + Math.PI, R(4));
      g.lineStyle(L(3), COMIC.ink, 0.9);
      g.strokeTriangle(badge.x, badge.y - R(5), badge.x + R(6), badge.y, badge.x, badge.y + R(5));
      g.strokeTriangle(badge.x, badge.y - R(5), badge.x - R(6), badge.y, badge.x, badge.y + R(5));
      g.fillStyle(secondary, 0.90);
      g.fillTriangle(badge.x, badge.y - R(5), badge.x + R(6), badge.y, badge.x, badge.y + R(5));
      g.fillTriangle(badge.x, badge.y - R(5), badge.x - R(6), badge.y, badge.x, badge.y + R(5));

      const flare1 = point(p.x, p.y, a + Math.PI, R(30));
      const flare2 = point(p.x, p.y, a + Math.PI + 0.28, R(46));
      const flare3 = point(p.x, p.y, a + Math.PI - 0.28, R(46));
      g.lineStyle(L(5), COMIC.ink, 0.9);
      g.strokeTriangle(tail.x, tail.y, flare2.x, flare2.y, flare3.x, flare3.y);
      g.fillStyle(style.id === 'crystal' ? COMIC.gold : COMIC.orange, 0.76);
      g.fillTriangle(tail.x, tail.y, flare2.x, flare2.y, flare3.x, flare3.y);
      g.fillStyle(secondary, 0.9);
      g.fillCircle(flare1.x, flare1.y, R(7));

      const pulse = Math.sin(performance.now() * 0.006) * R(2);
      g.lineStyle(L(4), COMIC.ink, 0.52);
      g.strokeCircle(p.x, p.y, R(26) + pulse);
      g.lineStyle(L(2), accent, 0.28);
      g.strokeCircle(p.x, p.y, R(29) + pulse);
      if (this.armorBuffTimer > 0 || this.boostTimer > 0 || this.magnetTimer > 0) {
        const t = performance.now() * 0.006;
        const buffColor = this.boostTimer > 0 ? colorValue(SUPPLY_ITEM_DEFS.boost.color) : this.armorBuffTimer > 0 ? colorValue(SUPPLY_ITEM_DEFS.armor.color) : colorValue(SUPPLY_ITEM_DEFS.magnet.color);
        g.lineStyle(L(5), COMIC.ink, 0.55);
        g.strokeCircle(p.x, p.y, R(39) + Math.sin(t) * R(3));
        g.lineStyle(L(3), buffColor, 0.68);
        g.strokeCircle(p.x, p.y, R(43) + Math.sin(t) * R(3));
      }
    }

    drawEnemies() {
      const g = this.g;
      for (const e of this.enemies) {
        const base = PhaserLib.Display.Color.HexStringToColor(e.hit > 0 ? '#f6f2dc' : e.color).color;
        g.fillStyle(COMIC.shadow, 0.32);
        g.fillEllipse(e.x + 5, e.y + 9, e.r * 2.2, e.r * 0.8);
        this.drawEnemyTelegraph(e);

        if (e.type === 'sprinter') {
          g.lineStyle(8, COMIC.ink, 1);
          g.strokeTriangle(e.x + e.r * 1.35, e.y, e.x - e.r * 1.05, e.y - e.r, e.x - e.r * 1.05, e.y + e.r);
          g.fillStyle(COMIC.orange, 1);
          g.fillTriangle(e.x + e.r * 1.35, e.y, e.x - e.r * 1.05, e.y - e.r, e.x - e.r * 1.05, e.y + e.r);
          g.lineStyle(3, COMIC.gold, 0.9);
          g.lineBetween(e.x - e.r * 0.55, e.y, e.x + e.r * 0.9, e.y);
        } else if (e.type === 'shooter') {
          g.lineStyle(8, COMIC.ink, 1);
          g.fillStyle(COMIC.magenta, 0.98);
          g.fillCircle(e.x, e.y, e.r);
          g.strokeCircle(e.x, e.y, e.r);
          g.lineStyle(4, COMIC.white, 0.78);
          g.lineBetween(e.x - e.r, e.y, e.x + e.r, e.y);
          g.lineBetween(e.x, e.y - e.r, e.x, e.y + e.r);
          g.lineStyle(3, COMIC.gold, 0.62);
          g.strokeCircle(e.x, e.y, e.r + 7);
        } else if (e.type === 'tank') {
          g.lineStyle(9, COMIC.ink, 1);
          g.fillStyle(0x334a9b, 1);
          g.fillRoundedRect(e.x - e.r * 1.1, e.y - e.r * 0.82, e.r * 2.2, e.r * 1.64, 8);
          g.strokeRoundedRect(e.x - e.r * 1.1, e.y - e.r * 0.82, e.r * 2.2, e.r * 1.64, 8);
          g.fillStyle(COMIC.cyan, 0.85);
          g.fillRect(e.x - e.r * 0.6, e.y - 3, e.r * 1.2, 6);
        } else if (e.type === 'bomber') {
          const pulse = 1 + (e.blastClock || 0) * 0.28;
          g.lineStyle(8, COMIC.ink, 1);
          g.fillStyle(0xff8c22, 0.98);
          g.fillTriangle(e.x, e.y - e.r * 1.35 * pulse, e.x + e.r * 1.25, e.y, e.x, e.y + e.r * 1.35 * pulse);
          g.fillTriangle(e.x, e.y - e.r * 1.35 * pulse, e.x - e.r * 1.25, e.y, e.x, e.y + e.r * 1.35 * pulse);
          g.strokeTriangle(e.x, e.y - e.r * 1.35 * pulse, e.x + e.r * 1.25, e.y, e.x, e.y + e.r * 1.35 * pulse);
          g.strokeTriangle(e.x, e.y - e.r * 1.35 * pulse, e.x - e.r * 1.25, e.y, e.x, e.y + e.r * 1.35 * pulse);
          g.fillStyle(COMIC.red, 0.88);
          g.fillCircle(e.x, e.y, e.r * 0.45);
        } else if (e.type === 'boss') {
          const kind = e.bossKind || 'warden';
          const bossBase = colorValue(bossColor(kind));
          g.lineStyle(12, COMIC.ink, 1);
          g.fillStyle(bossBase, 1);
          if (kind === 'ironclad') {
            g.fillRoundedRect(e.x - e.r * 1.18, e.y - e.r * 0.82, e.r * 2.36, e.r * 1.64, 14);
            g.strokeRoundedRect(e.x - e.r * 1.18, e.y - e.r * 0.82, e.r * 2.36, e.r * 1.64, 14);
          } else if (kind === 'crystalQueen') {
            g.fillTriangle(e.x, e.y - e.r * 1.32, e.x + e.r * 1.12, e.y, e.x, e.y + e.r * 1.32);
            g.fillTriangle(e.x, e.y - e.r * 1.32, e.x - e.r * 1.12, e.y, e.x, e.y + e.r * 1.32);
            g.strokeTriangle(e.x, e.y - e.r * 1.32, e.x + e.r * 1.12, e.y, e.x, e.y + e.r * 1.32);
            g.strokeTriangle(e.x, e.y - e.r * 1.32, e.x - e.r * 1.12, e.y, e.x, e.y + e.r * 1.32);
          } else if (kind === 'riftlord') {
            g.fillCircle(e.x, e.y, e.r);
            g.strokeCircle(e.x, e.y, e.r);
            g.lineStyle(9, COMIC.ink, 0.92);
            g.lineBetween(e.x - e.r * 0.9, e.y + e.r * 0.8, e.x + e.r * 0.9, e.y - e.r * 0.8);
            g.lineStyle(5, COMIC.magenta, 0.95);
            g.lineBetween(e.x - e.r * 0.9, e.y + e.r * 0.8, e.x + e.r * 0.9, e.y - e.r * 0.8);
          } else {
            g.fillCircle(e.x, e.y, e.r);
            g.strokeCircle(e.x, e.y, e.r);
          }
          g.lineStyle(6, COMIC.gold, e.attackFlash > 0 ? 1 : 0.72);
          g.strokeCircle(e.x, e.y, e.r + 12 + (e.attackFlash || 0) * 18);
          g.lineStyle(5, COMIC.ink, 0.86);
          g.lineBetween(e.x - e.r * 0.75, e.y - e.r * 0.25, e.x + e.r * 0.75, e.y - e.r * 0.25);
          g.fillStyle(COMIC.white, 1);
          g.fillCircle(e.x - e.r * 0.32, e.y - e.r * 0.18, 5);
          g.fillCircle(e.x + e.r * 0.32, e.y - e.r * 0.18, 5);
        } else {
          g.lineStyle(8, COMIC.ink, 1);
          g.fillStyle(base, 0.98);
          g.fillCircle(e.x, e.y, e.r);
          g.strokeCircle(e.x, e.y, e.r);
          g.lineStyle(3, COMIC.white, 0.54);
          g.lineBetween(e.x - e.r * 0.5, e.y - e.r * 0.35, e.x + e.r * 0.45, e.y + e.r * 0.35);
        }

        this.drawEnemySkinDetails(e);

        if (e.hp < e.maxHp) {
          g.lineStyle(3, COMIC.ink, 1);
          g.fillStyle(COMIC.ink, 0.95);
          g.fillRect(e.x - e.r - 2, e.y - e.r - 15, e.r * 2 + 4, 8);
          g.fillStyle(COMIC.green, 0.98);
          g.fillRect(e.x - e.r, e.y - e.r - 13, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4);
        }
      }
    }

    drawEnemyTelegraph(e) {
      const g = this.g;
      if (e.type === 'sprinter' && e.dashClock < -0.62) {
        const a = angleBetween(e.x, e.y, this.player.x, this.player.y);
        const end = point(e.x, e.y, a, 150);
        g.lineStyle(10, COMIC.ink, 0.34);
        g.lineBetween(e.x, e.y, end.x, end.y);
        g.lineStyle(4, COMIC.orange, 0.56);
        g.lineBetween(e.x, e.y, end.x, end.y);
      }
      if (e.type === 'shooter' && e.shotClock < 0.34) {
        g.lineStyle(5, COMIC.ink, 0.34);
        g.lineBetween(e.x, e.y, this.player.x, this.player.y);
        g.lineStyle(2, COMIC.magenta, 0.48);
        g.lineBetween(e.x, e.y, this.player.x, this.player.y);
      }
      if (e.type === 'tank' && e.shotClock < 0.56) {
        const grow = 1 - clamp(e.shotClock / 0.56, 0, 1);
        g.lineStyle(7, COMIC.ink, 0.26 + grow * 0.16);
        g.strokeCircle(e.x, e.y, e.r + 30 + grow * 24);
        g.lineStyle(3, COMIC.cyan, 0.34 + grow * 0.25);
        g.strokeCircle(e.x, e.y, e.r + 30 + grow * 24);
      }
      if (e.type === 'bomber' && e.blastClock > 0.05) {
        const alpha = clamp(e.blastClock, 0, 1);
        g.lineStyle(8, COMIC.ink, 0.36 + alpha * 0.24);
        g.strokeCircle(e.x, e.y, 146 * alpha);
        g.lineStyle(4, COMIC.orange, 0.42 + alpha * 0.36);
        g.strokeCircle(e.x, e.y, 146 * alpha);
      }
      if (e.type === 'boss' && e.shotClock < 0.58) {
        const kind = e.bossKind || 'warden';
        const alpha = 1 - clamp(e.shotClock / 0.58, 0, 1);
        const c = colorValue(bossColor(kind));
        g.lineStyle(10, COMIC.ink, 0.28 + alpha * 0.22);
        g.strokeCircle(e.x, e.y, e.r + 38 + alpha * 34);
        g.lineStyle(4, c, 0.34 + alpha * 0.40);
        g.strokeCircle(e.x, e.y, e.r + 38 + alpha * 34);
      }
    }

    drawEnemySkinDetails(e) {
      const g = this.g;
      if (e.type === 'sprinter') {
        g.lineStyle(4, COMIC.ink, 0.92);
        g.lineBetween(e.x - e.r * 0.95, e.y - e.r * 0.68, e.x - e.r * 1.42, e.y - e.r * 1.08);
        g.lineBetween(e.x - e.r * 0.95, e.y + e.r * 0.68, e.x - e.r * 1.42, e.y + e.r * 1.08);
        g.lineStyle(3, COMIC.white, 0.76);
        g.lineBetween(e.x - e.r * 0.55, e.y, e.x + e.r * 0.62, e.y);
        g.fillStyle(COMIC.gold, 0.74);
        g.fillCircle(e.x + e.r * 0.68, e.y, 3.8);
        return;
      }
      if (e.type === 'shooter') {
        g.lineStyle(7, COMIC.ink, 0.95);
        g.lineBetween(e.x, e.y, e.x + e.r * 1.35, e.y);
        g.lineStyle(4, COMIC.gold, 0.88);
        g.lineBetween(e.x + e.r * 0.2, e.y, e.x + e.r * 1.35, e.y);
        g.fillStyle(COMIC.white, 0.94);
        g.fillCircle(e.x, e.y, 4.5);
        g.lineStyle(2, COMIC.ink, 0.88);
        g.strokeCircle(e.x, e.y, 4.5);
        return;
      }
      if (e.type === 'tank') {
        g.fillStyle(COMIC.ink, 0.88);
        for (let i = -1; i <= 1; i++) {
          g.fillCircle(e.x + i * e.r * 0.62, e.y - e.r * 0.47, 3.4);
          g.fillCircle(e.x + i * e.r * 0.62, e.y + e.r * 0.47, 3.4);
        }
        g.lineStyle(4, COMIC.gold, 0.64);
        g.lineBetween(e.x - e.r * 0.92, e.y, e.x + e.r * 0.92, e.y);
        return;
      }
      if (e.type === 'bomber') {
        const fuse = clamp(e.blastClock || 0, 0, 1);
        g.lineStyle(5, COMIC.ink, 0.9);
        g.lineBetween(e.x - e.r * 0.62, e.y - e.r * 0.62, e.x + e.r * 0.62, e.y + e.r * 0.62);
        g.lineBetween(e.x + e.r * 0.62, e.y - e.r * 0.62, e.x - e.r * 0.62, e.y + e.r * 0.62);
        g.fillStyle(COMIC.gold, 0.72 + fuse * 0.22);
        g.fillCircle(e.x, e.y - e.r * 0.82, 3 + fuse * 5);
        return;
      }
      if (e.type === 'boss') {
        const spikes = [-0.92, -0.46, 0, 0.46, 0.92];
        for (const off of spikes) {
          const top = point(e.x, e.y, -Math.PI / 2 + off, e.r + 22);
          const left = point(e.x, e.y, -Math.PI / 2 + off - 0.10, e.r + 4);
          const right = point(e.x, e.y, -Math.PI / 2 + off + 0.10, e.r + 4);
          g.lineStyle(4, COMIC.ink, 0.94);
          g.strokeTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
          g.fillStyle(COMIC.gold, 0.78);
          g.fillTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
        }
        g.lineStyle(4, COMIC.white, 0.76);
        g.strokeCircle(e.x, e.y, e.r * 0.48);
        g.fillStyle(COMIC.magenta, 0.9);
        g.fillCircle(e.x, e.y, 7);
        return;
      }

      // Chaser/default: claw drone face instead of a plain dot.
      g.fillStyle(COMIC.ink, 0.9);
      g.fillCircle(e.x - e.r * 0.32, e.y - e.r * 0.18, 3.3);
      g.fillCircle(e.x + e.r * 0.32, e.y - e.r * 0.18, 3.3);
      g.lineStyle(4, COMIC.ink, 0.82);
      g.lineBetween(e.x - e.r * 0.78, e.y + e.r * 0.42, e.x - e.r * 1.26, e.y + e.r * 0.78);
      g.lineBetween(e.x + e.r * 0.78, e.y + e.r * 0.42, e.x + e.r * 1.26, e.y + e.r * 0.78);
      g.lineStyle(3, COMIC.gold, 0.72);
      g.lineBetween(e.x - e.r * 0.52, e.y + e.r * 0.42, e.x + e.r * 0.52, e.y + e.r * 0.42);
    }

    drawBullets() {
      const g = this.g;
      for (const b of this.bullets) {
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const nx = b.vx / speed;
        const ny = b.vy / speed;
        const artillery = b.source === 'drone-artillery';
        const tailLength = artillery ? 30 : 23;
        const tailX = b.x - nx * tailLength;
        const tailY = b.y - ny * tailLength;
        const coreColor = b.color ? colorValue(b.color) : COMIC.orange;
        // Smaller tracer lanes: bullets now match the shrunken ship scale.
        g.lineStyle(artillery ? 7 : 5.5, COMIC.ink, 0.88);
        g.lineBetween(tailX, tailY, b.x + nx * 4, b.y + ny * 4);
        g.lineStyle(artillery ? 3.6 : 2.8, coreColor, 0.92);
        g.lineBetween(tailX, tailY, b.x + nx * 4, b.y + ny * 4);
        g.lineStyle(1.5, COMIC.white, 0.82);
        g.lineBetween(tailX + nx * 6, tailY + ny * 6, b.x + nx * 5, b.y + ny * 5);
        g.fillStyle(coreColor, 1);
        g.fillCircle(b.x, b.y, Math.max(1.8, b.r));
      }
      for (const s of this.enemyShots) {
        const speed = Math.hypot(s.vx, s.vy) || 1;
        const nx = s.vx / speed;
        const ny = s.vy / speed;
        const tailX = s.x - nx * 24;
        const tailY = s.y - ny * 24;
        const shotColor = s.color ? colorValue(s.color) : COMIC.red;
        g.lineStyle(5.5, COMIC.ink, 0.88);
        g.lineBetween(tailX, tailY, s.x + nx * 3, s.y + ny * 3);
        g.lineStyle(Math.max(2.4, s.r + 1.15), shotColor, 0.90);
        g.lineBetween(tailX, tailY, s.x + nx * 3, s.y + ny * 3);
        g.lineStyle(1.5, COMIC.gold, 0.86);
        g.lineBetween(tailX + nx * 5, tailY + ny * 5, s.x + nx * 4, s.y + ny * 4);
        g.fillStyle(shotColor, 0.94);
        g.fillCircle(s.x, s.y, Math.max(1.9, s.r));
      }
    }

    drawMissionBlocks() {
      const g = this.g;
      for (const block of this.missionBlocks) {
        const def = DRONE_DEFS[block.droneType] || DRONE_DEFS.rapid;
        const color = colorValue(def.color);
        const progress = clamp(block.progress / block.target, 0, 1);
        const pulse = 1 + Math.sin(performance.now() * 0.006 + block.pulse) * 0.08;
        g.lineStyle(12, COMIC.ink, 0.88);
        g.strokeCircle(block.x, block.y, block.r * pulse);
        g.fillStyle(color, 0.16);
        g.fillCircle(block.x, block.y, block.r * pulse);
        g.lineStyle(5, color, 0.75);
        g.strokeCircle(block.x, block.y, block.r * pulse);
        g.lineStyle(7, COMIC.gold, 0.92);
        g.beginPath();
        g.arc(block.x, block.y, block.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        g.strokePath();
        g.lineStyle(5, COMIC.ink, 0.78);
        g.strokeRoundedRect(block.x - 50, block.y - 18, 100, 36, 8);
        g.fillStyle(color, 0.9);
        g.fillRoundedRect(block.x - 46, block.y - 14, 92, 28, 7);
      }
    }

    drawCompanions() {
      const g = this.g;
      for (const drone of this.companions) {
        const def = DRONE_DEFS[drone.type] || DRONE_DEFS.rapid;
        const color = colorValue(def.color);
        const lvl = this.companionLevel(drone);
        const r = 10 + Math.min(8, lvl * 1.2);
        const skillCount = Object.values(drone.upgrades || {}).reduce((sum, n) => sum + Number(n || 0), 0);
        g.fillStyle(COMIC.shadow, 0.28);
        g.fillEllipse(drone.x + 4, drone.y + 8, r * 2.6, r * 0.85);
        g.lineStyle(6, COMIC.ink, 0.96);
        if (drone.type === 'tank') {
          g.fillStyle(color, 0.95);
          g.fillRoundedRect(drone.x - r * 1.45, drone.y - r, r * 2.9, r * 2, 6);
          g.strokeRoundedRect(drone.x - r * 1.45, drone.y - r, r * 2.9, r * 2, 6);
          g.lineStyle(4, COMIC.ink, 0.9);
          g.lineBetween(drone.x - r * 1.25, drone.y, drone.x + r * 1.25, drone.y);
          g.lineBetween(drone.x, drone.y - r, drone.x, drone.y + r);
          g.fillStyle(COMIC.white, 0.82);
          g.fillRect(drone.x - r * 0.62, drone.y - 2, r * 1.24, 4);
        } else if (drone.type === 'artillery') {
          g.fillStyle(color, 0.96);
          g.fillRoundedRect(drone.x - r * 1.45, drone.y - r * 0.75, r * 2.5, r * 1.5, 7);
          g.strokeRoundedRect(drone.x - r * 1.45, drone.y - r * 0.75, r * 2.5, r * 1.5, 7);
          g.lineStyle(8, COMIC.ink, 1);
          g.lineBetween(drone.x + r * 0.4, drone.y, drone.x + r * 2.8, drone.y - r * 0.08);
          g.lineStyle(4, COMIC.gold, 0.95);
          g.lineBetween(drone.x + r * 0.6, drone.y, drone.x + r * 2.7, drone.y - r * 0.08);
          g.fillStyle(COMIC.white, 0.86);
          g.fillCircle(drone.x - r * 0.62, drone.y, 3.5);
        } else if (drone.type === 'repair') {
          g.fillStyle(color, 0.94);
          g.fillRoundedRect(drone.x - r * 1.0, drone.y - r * 1.25, r * 2.0, r * 2.5, 9);
          g.strokeRoundedRect(drone.x - r * 1.0, drone.y - r * 1.25, r * 2.0, r * 2.5, 9);
          g.fillStyle(COMIC.white, 0.92);
          g.fillRect(drone.x - r * 0.18, drone.y - r * 0.72, r * 0.36, r * 1.44);
          g.fillRect(drone.x - r * 0.72, drone.y - r * 0.18, r * 1.44, r * 0.36);
        } else if (drone.type === 'shield') {
          g.fillStyle(color, 0.18);
          g.fillCircle(drone.x, drone.y, r * 1.55);
          g.lineStyle(7, COMIC.ink, 0.92);
          g.strokeCircle(drone.x, drone.y, r * 1.55);
          g.lineStyle(4, color, 0.92);
          g.strokeCircle(drone.x, drone.y, r * 1.2);
          g.fillStyle(color, 0.96);
          g.fillTriangle(drone.x, drone.y - r * 1.1, drone.x + r, drone.y + r * 0.7, drone.x - r, drone.y + r * 0.7);
        } else if (drone.type === 'rapid') {
          g.fillStyle(color, 0.96);
          g.fillTriangle(drone.x + r * 1.45, drone.y, drone.x - r * 1.0, drone.y - r * 0.9, drone.x - r * 0.42, drone.y);
          g.fillTriangle(drone.x + r * 1.45, drone.y, drone.x - r * 1.0, drone.y + r * 0.9, drone.x - r * 0.42, drone.y);
          g.strokeTriangle(drone.x + r * 1.45, drone.y, drone.x - r * 1.0, drone.y - r * 0.9, drone.x - r * 0.42, drone.y);
          g.strokeTriangle(drone.x + r * 1.45, drone.y, drone.x - r * 1.0, drone.y + r * 0.9, drone.x - r * 0.42, drone.y);
          g.lineStyle(3, COMIC.white, 0.86);
          g.lineBetween(drone.x - r * 0.2, drone.y, drone.x + r * 1.35, drone.y);
        } else if (drone.type === 'melee') {
          g.fillStyle(color, 0.96);
          g.fillTriangle(drone.x, drone.y - r * 1.85, drone.x + r * 0.6, drone.y + r * 1.45, drone.x - r * 0.6, drone.y + r * 1.45);
          g.strokeTriangle(drone.x, drone.y - r * 1.85, drone.x + r * 0.6, drone.y + r * 1.45, drone.x - r * 0.6, drone.y + r * 1.45);
          g.lineStyle(4, COMIC.white, 0.84);
          g.lineBetween(drone.x, drone.y - r * 1.45, drone.x, drone.y + r * 1.05);
          g.lineStyle(3, color, 0.28);
          g.strokeCircle(drone.x, drone.y, r * 2.05);
        }
        g.lineStyle(2, COMIC.white, 0.68);
        g.strokeCircle(drone.x, drone.y, r + 5);
        if (skillCount > 0) {
          for (let i = 0; i < Math.min(6, skillCount); i++) {
            const a = -Math.PI / 2 + i * 0.42;
            g.fillStyle(COMIC.white, 0.95);
            g.fillCircle(drone.x + Math.cos(a) * (r + 12), drone.y + Math.sin(a) * (r + 12), 2.2);
          }
        }
      }
    }

    drawDrops() {
      const g = this.g;
      for (const s of this.shards) {
        if (SUPPLY_ITEM_DEFS[s.kind]) {
          const def = SUPPLY_ITEM_DEFS[s.kind];
          const color = colorValue(s.color || def.color);
          const r = s.r + 4 + Math.sin(performance.now() * 0.012 + s.y) * 1.6;
          g.lineStyle(5, COMIC.ink, 1);
          g.strokeCircle(s.x, s.y, r + 3);
          g.fillStyle(color, 0.96);
          if (s.kind === 'repair') {
            g.fillRoundedRect(s.x - r, s.y - r * 0.72, r * 2, r * 1.44, 5);
            g.lineStyle(3, COMIC.white, 0.9);
            g.lineBetween(s.x - r * 0.52, s.y, s.x + r * 0.52, s.y);
            g.lineBetween(s.x, s.y - r * 0.52, s.x, s.y + r * 0.52);
          } else if (s.kind === 'armor') {
            g.fillRoundedRect(s.x - r * 0.9, s.y - r, r * 1.8, r * 2, 4);
            g.lineStyle(3, COMIC.white, 0.82);
            g.lineBetween(s.x - r * 0.48, s.y, s.x + r * 0.48, s.y);
          } else if (s.kind === 'boost') {
            g.fillTriangle(s.x, s.y - r, s.x + r, s.y + r * 0.82, s.x - r, s.y + r * 0.82);
            g.lineStyle(3, COMIC.white, 0.9);
            g.lineBetween(s.x, s.y - r * 0.52, s.x, s.y + r * 0.52);
          } else if (s.kind === 'magnet') {
            g.strokeCircle(s.x, s.y, r * 0.82);
            g.lineStyle(4, COMIC.white, 0.84);
            g.lineBetween(s.x - r * 0.62, s.y - r * 0.35, s.x - r * 0.62, s.y + r * 0.35);
            g.lineBetween(s.x + r * 0.62, s.y - r * 0.35, s.x + r * 0.62, s.y + r * 0.35);
          } else {
            g.fillCircle(s.x, s.y, r);
            g.lineStyle(3, COMIC.ink, 0.76);
            g.strokeCircle(s.x, s.y, r * 0.55);
            g.fillStyle(COMIC.white, 0.9);
            g.fillCircle(s.x - 2, s.y - 3, 2.4);
          }
          continue;
        }
        const r = s.r + 3;
        g.lineStyle(4, COMIC.ink, 1);
        g.strokeTriangle(s.x, s.y - r, s.x + r, s.y, s.x, s.y + r);
        g.strokeTriangle(s.x, s.y - r, s.x - r, s.y, s.x, s.y + r);
        g.fillStyle(COMIC.gold, 0.98);
        g.fillTriangle(s.x, s.y - r, s.x + r, s.y, s.x, s.y + r);
        g.fillStyle(COMIC.orange, 0.94);
        g.fillTriangle(s.x, s.y - r, s.x - r, s.y, s.x, s.y + r);
        g.fillStyle(COMIC.white, 0.88);
        g.fillCircle(s.x + 1, s.y - 2, 2);
      }
    }

    drawParticles() {
      const g = this.g;
      for (const p of this.particles) {
        const alpha = clamp(p.life / (p.max || 0.5), 0, 1);
        const color = PhaserLib.Display.Color.HexStringToColor(p.color || '#ffffff').color;
        if (p.ring) {
          g.lineStyle(9, COMIC.ink, alpha * 0.78);
          g.strokeCircle(p.x, p.y, p.r);
          g.lineStyle(5, color, alpha * 0.92);
          g.strokeCircle(p.x, p.y, p.r);
          g.lineStyle(2, COMIC.white, alpha * 0.6);
          g.strokeCircle(p.x, p.y, p.r + 7);
        } else if (p.kind === 'star') {
          this.drawStarburst(g, p.x, p.y, p.r, color, alpha);
        } else {
          const tail = Math.min(24, Math.hypot(p.vx, p.vy) * 0.045);
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const tx = p.x - (p.vx / speed) * tail;
          const ty = p.y - (p.vy / speed) * tail;
          g.lineStyle(Math.max(3, p.r + (p.kind === 'slash' ? 8 : 4)), COMIC.ink, alpha * 0.78);
          g.lineBetween(tx, ty, p.x, p.y);
          g.lineStyle(Math.max(2, p.r + (p.kind === 'slash' ? 3 : 0)), color, alpha);
          g.lineBetween(tx, ty, p.x, p.y);
          g.fillStyle(color, alpha);
          g.fillCircle(p.x, p.y, Math.max(2, p.r));
        }
      }
    }

    drawStarburst(g, x, y, r, color, alpha = 1) {
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI * 2 / 12;
        const c = point(x, y, a, r * 0.20);
        const p1 = point(x, y, a - 0.12, r * (i % 2 ? 0.82 : 1.18));
        const p2 = point(x, y, a + 0.12, r * (i % 2 ? 0.82 : 1.18));
        g.lineStyle(3, COMIC.ink, alpha * 0.88);
        g.strokeTriangle(c.x, c.y, p1.x, p1.y, p2.x, p2.y);
        g.fillStyle(i % 3 === 0 ? COMIC.white : color, alpha);
        g.fillTriangle(c.x, c.y, p1.x, p1.y, p2.x, p2.y);
      }
    }

    drawComicOverlay() {
      const g = this.uiG;
      const w = this.scale.width;
      const h = this.scale.height;
      if (this.running && !this.gameOver && !this.pausedRun) {
        const move = clamp(Math.hypot(this.player.vx, this.player.vy) / PLAYER_BASE.speed, 0, 1.25);
        const drama = clamp(move * 0.55 + Math.min(this.combo, 8) * 0.045 + (this.screenFlash > 0 ? 0.45 : 0), 0, 1);
        if (drama > 0.08) {
          for (let i = 0; i < 7; i++) {
            const y = ((performance.now() * 0.055) + i * 117) % (h + 220) - 110;
            const fromLeft = i % 2 === 0;
            const x1 = fromLeft ? -80 : w + 80;
            const x2 = fromLeft ? w * (0.42 + i * 0.035) : w * (0.62 - i * 0.035);
            const yy = y + (fromLeft ? 68 : -68);
            g.lineStyle(7, COMIC.ink, 0.12 * drama);
            g.lineBetween(x1, y, x2, yy);
            g.lineStyle(3, i % 3 === 0 ? COMIC.gold : COMIC.cyan, 0.18 * drama);
            g.lineBetween(x1, y, x2, yy);
          }
        }
      }

      if (this.screenFlash > 0) {
        const c = PhaserLib.Display.Color.HexStringToColor(this.screenFlashColor || '#ffdf68').color;
        const alpha = clamp(this.screenFlash / 0.24, 0, 1);
        g.fillStyle(c, 0.14 * alpha);
        g.fillRect(0, 0, w, h);
        g.lineStyle(16, COMIC.ink, 0.22 * alpha);
        g.strokeRect(8, 8, w - 16, h - 16);
        g.lineStyle(7, c, 0.42 * alpha);
        g.strokeRect(18, 18, w - 36, h - 36);
      }

      if (this.damageCue) {
        const alpha = clamp(this.damageCue.life / this.damageCue.max, 0, 1);
        const cam = this.cameras.main;
        const sx = this.damageCue.x - cam.scrollX;
        const sy = this.damageCue.y - cam.scrollY;
        const angle = Math.atan2(sy - h / 2, sx - w / 2);
        const edge = point(w / 2, h / 2, angle, Math.max(w, h) * 0.42);
        const p1 = point(edge.x, edge.y, angle + 2.62, 48);
        const p2 = point(edge.x, edge.y, angle - 2.62, 48);
        g.lineStyle(6, COMIC.ink, 0.74 * alpha);
        g.strokeTriangle(edge.x, edge.y, p1.x, p1.y, p2.x, p2.y);
        g.fillStyle(COMIC.red, 0.35 * alpha);
        g.fillTriangle(edge.x, edge.y, p1.x, p1.y, p2.x, p2.y);
      }
    }

    addFloatingText(x, y, text, color = '#ffffff', duration = 760, fontSize = 18) {
      const label = this.add.text(x, y, text, {
        fontFamily: 'Impact, ui-sans-serif, system-ui, sans-serif',
        fontSize: `${fontSize}px`,
        fontStyle: '900',
        color,
        stroke: '#07080c',
        strokeThickness: 7
      }).setOrigin(0.5).setDepth(8);
      label.setAngle(PhaserLib.Math.FloatBetween(-8, 8));
      this.labels.push(label);
      this.tweens.add({
        targets: label,
        y: y - 50,
        scale: 1.14,
        alpha: 0,
        duration,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.labels = this.labels.filter(item => item !== label);
          label.destroy();
        }
      });
    }

    drawScreenHints() {
      const g = this.uiG;
      if (this.messageTimer > 0) {
        g.fillStyle(COMIC.ink, 0.88);
        g.fillRoundedRect(this.scale.width / 2 - 214, 82, 428, 42, 10);
        g.lineStyle(4, COMIC.gold, 0.92);
        g.strokeRoundedRect(this.scale.width / 2 - 214, 82, 428, 42, 10);
        g.lineStyle(2, COMIC.red, 0.75);
        g.lineBetween(this.scale.width / 2 - 194, 123, this.scale.width / 2 + 194, 83);
        if (this.bannerText) {
          this.bannerText.setVisible(true);
          this.bannerText.setText(`★ ${this.message} ★`);
          this.bannerText.setPosition(this.scale.width / 2, 103);
          this.bannerText.setStyle({
            fontFamily: 'Impact, ui-sans-serif, system-ui, sans-serif',
            fontSize: '17px',
            color: '#ffdf68',
            stroke: '#07080c',
            strokeThickness: 6
          });
        }
      } else if (this.bannerText) {
        this.bannerText.setVisible(false);
      }
      if (meta.controlMode === 'touch' && !ui.floatingJoystick && this.touchOrigin && this.touchVector) {
        const cx = this.touchOrigin.x;
        const cy = this.touchOrigin.y;
        const knobX = cx + this.touchVector.x * 42 * this.touchVector.force;
        const knobY = cy + this.touchVector.y * 42 * this.touchVector.force;
        g.lineStyle(7, COMIC.ink, 0.74);
        g.strokeCircle(cx, cy, 54);
        g.lineStyle(3, COMIC.cyan, 0.55);
        g.strokeCircle(cx, cy, 54);
        g.lineStyle(2, COMIC.white, 0.32);
        g.lineBetween(cx, cy, knobX, knobY);
        g.fillStyle(COMIC.gold, 0.34);
        g.fillCircle(knobX, knobY, 16);
        g.lineStyle(4, COMIC.ink, 0.8);
        g.strokeCircle(knobX, knobY, 16);
      }
    }
  }

  function createBackdropProps() {
    let seed = 93071;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const stars = Array.from({ length: 118 }, () => ({
      x: 72 + rnd() * (WORLD.w - 144),
      y: 70 + rnd() * (WORLD.h - 140),
      r: 1.1 + rnd() * 2.2,
      alpha: 0.16 + rnd() * 0.42,
      phase: rnd() * Math.PI * 2,
      warm: rnd() > 0.72
    }));
    const wrecks = Array.from({ length: 14 }, () => ({
      x: 130 + rnd() * (WORLD.w - 260),
      y: 150 + rnd() * (WORLD.h - 300),
      w: 90 + rnd() * 210,
      h: 20 + rnd() * 42,
      a: -0.75 + rnd() * 1.5
    }));
    const crystals = Array.from({ length: 12 }, () => ({
      x: 130 + rnd() * (WORLD.w - 260),
      y: 140 + rnd() * (WORLD.h - 280),
      r: 18 + rnd() * 34
    }));
    const rifts = Array.from({ length: 7 }, () => ({
      x: 220 + rnd() * (WORLD.w - 440),
      y: 220 + rnd() * (WORLD.h - 440),
      len: 180 + rnd() * 310,
      amp: 12 + rnd() * 28,
      a: rnd() * Math.PI,
      phase: rnd() * Math.PI * 2
    }));
    const beacons = Array.from({ length: 5 }, () => ({
      x: 320 + rnd() * (WORLD.w - 640),
      y: 260 + rnd() * (WORLD.h - 520),
      w: 24 + rnd() * 30,
      h: 70 + rnd() * 90
    }));
    return { stars, wrecks, crystals, rifts, beacons };
  }

  function currentRouteStyle() {
    return ROUTE_STYLE[meta.selectedZone] || ROUTE_STYLE.random;
  }

  function colorValue(hex) {
    return PhaserLib.Display.Color.HexStringToColor(hex).color;
  }

  function viewportSize(fallback = {}) {
    const vv = window.visualViewport;
    const width = Math.max(1, Math.round(vv?.width || fallback.width || window.innerWidth || document.documentElement.clientWidth || 1));
    const height = Math.max(1, Math.round(vv?.height || fallback.height || window.innerHeight || document.documentElement.clientHeight || 1));
    return { width, height };
  }

  function syncViewportVars(fallback = {}) {
    const size = viewportSize(fallback);
    document.documentElement.style.setProperty('--app-width', `${size.width}px`);
    document.documentElement.style.setProperty('--app-height', `${size.height}px`);
    return size;
  }

  function point(x, y, a, r) {
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  }

  function rotatedBox(x, y, w, h, a) {
    const hw = w / 2;
    const hh = h / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return [
      { x: x + (-hw * ca - -hh * sa), y: y + (-hw * sa + -hh * ca) },
      { x: x + (hw * ca - -hh * sa), y: y + (hw * sa + -hh * ca) },
      { x: x + (hw * ca - hh * sa), y: y + (hw * sa + hh * ca) },
      { x: x + (-hw * ca - hh * sa), y: y + (-hw * sa + hh * ca) }
    ];
  }

  function fillPoly(g, pts) {
    if (pts.length < 3) return;
    for (let i = 1; i < pts.length - 1; i++) {
      g.fillTriangle(pts[0].x, pts[0].y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    }
  }

  function strokePoly(g, pts) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function smoothAngle(current, target, t) {
    return current + wrapAngle(target - current) * clamp(t, 0, 1);
  }

  function enemyDef(type, wave, bossKind = null) {
    if (type === 'boss') {
      const table = {
        warden: { hp: 520 + wave * 42, speed: 86, r: 38, color: '#ff4d6d' },
        ironclad: { hp: 690 + wave * 52, speed: 58, r: 44, color: '#8aa3ff' },
        crystalQueen: { hp: 560 + wave * 44, speed: 78, r: 42, color: '#ffd166' },
        riftlord: { hp: 540 + wave * 40, speed: 104, r: 40, color: '#ff3df2' },
        artillery: { hp: 620 + wave * 46, speed: 66, r: 43, color: '#ff8c22' },
        starcore: { hp: 760 + wave * 58, speed: 76, r: 46, color: '#ffdf68' }
      };
      return table[bossKind] || table.warden;
    }
    if (type === 'sprinter') return { hp: 24 + wave * 2.1, speed: 188 + wave * 3, r: 12, color: '#ff9f1c' };
    if (type === 'shooter') return { hp: 32 + wave * 2.5, speed: 116 + wave * 2, r: 14, color: '#ff3df2' };
    if (type === 'tank') return { hp: 70 + wave * 4, speed: 74 + wave * 1.4, r: 20, color: '#8aa3ff' };
    if (type === 'bomber') return { hp: 42 + wave * 3.1, speed: 105 + wave * 1.4, r: 17, color: '#ff8c22' };
    return { hp: 34 + wave * 2.4, speed: 128 + wave * 2.2, r: 15, color: '#37f6ff' };
  }

  function pickEnemyType(wave) {
    const roll = Math.random();
    const zone = meta.selectedZone;
    if (zone === 'crystal' && roll < 0.30) return 'sprinter';
    if (zone === 'scrapyard' && roll < 0.32) return 'tank';
    if (zone === 'rift' && roll < 0.25) return 'shooter';
    if (zone === 'rift' && wave >= 3 && roll < 0.46) return 'bomber';
    if (wave >= 7 && roll < 0.22) return 'tank';
    if (wave >= 5 && roll < 0.42) return 'bomber';
    if (wave >= 4 && roll < 0.60) return 'shooter';
    if (roll < 0.33) return 'sprinter';
    return 'chaser';
  }

  function bossKindForWave(wave) {
    if (wave >= 10) {
      if (meta.selectedZone === 'rift') return 'riftlord';
      if (meta.selectedZone === 'crystal') return 'crystalQueen';
      return 'starcore';
    }
    if (meta.selectedZone === 'scrapyard') return 'ironclad';
    if (meta.selectedZone === 'crystal') return 'crystalQueen';
    if (meta.selectedZone === 'rift') return 'artillery';
    return 'warden';
  }

  function bossName(kind) {
    return {
      warden: '核心守衛',
      ironclad: '鐵壁殘骸王',
      crystalQueen: '晶礦女王',
      riftlord: '裂隙主宰',
      artillery: '重砲裂隙艦',
      starcore: '星環核心主宰'
    }[kind] || '核心守衛';
  }

  function bossColor(kind) {
    return {
      warden: '#ff4d6d',
      ironclad: '#8aa3ff',
      crystalQueen: '#ffd166',
      riftlord: '#ff3df2',
      artillery: '#ff8c22',
      starcore: '#ffdf68'
    }[kind] || '#ff4d6d';
  }

  function zoneRouteEffect() {
    if (meta.selectedZone === 'crystal') return { enemyMult: 1.05 };
    if (meta.selectedZone === 'scrapyard') return { enemyMult: 1.08 };
    if (meta.selectedZone === 'rift') return { enemyMult: 1.03 };
    return { enemyMult: 1 };
  }

  function playerFireRate(scene) {
    let rate = PLAYER_BASE.fireRate;
    rate *= 1 - Math.min(0.45, upgradeLevel('reactor') * 0.05);
    if (scene?.boostTimer > 0) rate *= 0.76;
    return Math.max(0.075, rate);
  }

  function playerDamage(scene = null) {
    let amount = PLAYER_BASE.damage;
    amount *= 1 + upgradeLevel('cannon') * 0.08;
    if (scene?.boostTimer > 0) amount *= 1.22;
    return amount;
  }

  function playerMaxHp(scene = null) {
    return PLAYER_BASE.hp + upgradeLevel('shield') * 12;
  }

  function updateHud(scene) {
    if (!scene) return;
    ui.wave.textContent = String(scene.wave || 1);
    ui.hp.textContent = String(Math.max(0, Math.ceil(scene.player?.hp ?? PLAYER_BASE.hp)));
    ui.scrap.textContent = String(meta.scrap || 0);
    ui.score.textContent = String(meta.score || 0);
    if (ui.xpBar) ui.xpBar.style.width = `${clamp((scene.waveSpawned / Math.max(1, scene.waveBudget)) * 100, 0, 100)}%`;
    if (ui.coreHud) {
      const buffs = [];
      if (scene.armorBuffTimer > 0) buffs.push(`護甲 ${Math.ceil(scene.armorBuffTimer)}s`);
      if (scene.boostTimer > 0) buffs.push(`增效 ${Math.ceil(scene.boostTimer)}s`);
      if (scene.magnetTimer > 0) buffs.push(`磁吸 ${Math.ceil(scene.magnetTimer)}s`);
      ui.coreHud.classList.toggle('buff-active', buffs.length > 0);
      ui.coreHud.textContent = buffs.length
        ? `固定主砲｜${buffs.join('｜')}`
        : '固定主砲｜擊殺掉落護甲 / 增效 / 磁吸 / 維修 / 貨幣道具';
    }
    if (ui.missionHud) {
      const nearby = scene.missionBlocks?.map(block => ({ block, d: dist(scene.player.x, scene.player.y, block.x, block.y) })).sort((a, b) => a.d - b.d)[0];
      const ready = nearby && nearby.d < nearby.block.r + 48;
      ui.missionHud.classList.toggle('ready', !!ready);
      if (nearby) {
        const def = DRONE_DEFS[nearby.block.droneType] || DRONE_DEFS.rapid;
        const pct = Math.round(clamp(nearby.block.progress / nearby.block.target, 0, 1) * 100);
        ui.missionHud.textContent = ready
          ? `任務區塊 ${pct}%｜停住開啟：${def.role} ${def.name}`
          : `任務區塊 ${Math.round(nearby.d)}m｜靠近停住可開啟 ${def.role}`;
      } else if (scene.companions?.length) {
        const lead = scene.companions[0];
        const def = DRONE_DEFS[lead?.type] || DRONE_DEFS.rapid;
        ui.missionHud.textContent = `夥伴機 ${scene.companions.length} 台｜暫停可看/升級技能樹｜P 整備`;
      } else {
        ui.missionHud.textContent = '任務區塊搜尋中｜停在旁邊可開啟夥伴機';
      }
    }
    if (ui.upgradePrompt) {
      ui.upgradePrompt.hidden = !scene.running || scene.gameOver;
      ui.upgradePrompt.textContent = '整備｜P';
    }
    if (ui.upgradeMenuBtn) {
      ui.upgradeMenuBtn.hidden = !scene.running || scene.gameOver;
      ui.upgradeMenuBtn.textContent = '整備';
    }
    if (ui.pauseBtn) ui.pauseBtn.textContent = scene.pausedRun ? '繼續' : '暫停';
  }

  function togglePause() {
    if (!sceneRef?.running || sceneRef.gameOver) return;
    sceneRef.pausedRun = !sceneRef.pausedRun;
    if (sceneRef.pausedRun) openRunShop();
    else hideUpgradeSurfaces();
    flash(sceneRef.pausedRun ? '已暫停｜可看主機/夥伴技能樹' : '繼續出擊');
    updateHud(sceneRef);
  }

  function cycleDifficulty() {
    const order = ['standard', 'high', 'chaos'];
    meta.difficulty = order[(order.indexOf(meta.difficulty) + 1) % order.length] || 'standard';
    saveMeta();
    updateSettingsLabels();
    flash(`難度：${difficultyFor(meta.difficulty).name}`);
  }

  function cycleAimAssist() {
    const order = ['assist', 'full', 'off'];
    meta.aimAssist = order[(order.indexOf(meta.aimAssist) + 1) % order.length] || 'assist';
    meta.autoAim = meta.aimAssist !== 'off';
    saveMeta();
    updateSettingsLabels();
  }

  function toggleControlMode() {
    sceneRef?.clearMovementInput?.(true);
    meta.controlMode = meta.controlMode === 'touch' ? 'keyboard' : 'touch';
    saveMeta();
    updateSettingsLabels();
    flash(meta.controlMode === 'touch' ? '手機模式：在任意位置按住生成虛擬搖桿' : '滑鼠鍵盤模式');
  }

  function bindUi() {
    ui.startBtn?.addEventListener('click', () => sceneRef?.startRun());
    ui.pauseBtn?.addEventListener('click', togglePause);
    ui.settingsBtn?.addEventListener('click', () => { if (ui.settingsModal) ui.settingsModal.hidden = false; });
    ui.homeSettingsBtn?.addEventListener('click', () => { if (ui.settingsModal) ui.settingsModal.hidden = false; });
    ui.closeSettingsBtn?.addEventListener('click', () => { if (ui.settingsModal) ui.settingsModal.hidden = true; });
    ui.howBtn?.addEventListener('click', () => { if (ui.how) ui.how.hidden = !ui.how.hidden; });
    ui.soundBtn?.addEventListener('click', () => { meta.soundEnabled = !meta.soundEnabled; saveMeta(); updateSettingsLabels(); beep('clear'); });
    ui.hapticBtn?.addEventListener('click', () => { meta.hapticsEnabled = !meta.hapticsEnabled; saveMeta(); updateSettingsLabels(); haptic(20); });
    ui.testSoundBtn?.addEventListener('click', () => { beep('clear'); if (ui.audioStatus) ui.audioStatus.textContent = 'Phaser 版音效 OK'; });
    ui.volumeRange?.addEventListener('input', e => { meta.volume = Number(e.target.value) / 100; saveMeta(); updateSettingsLabels(); });
    ui.shakeRange?.addEventListener('input', e => { meta.shakeStrength = Number(e.target.value) / 100; saveMeta(); updateSettingsLabels(); });
    ui.touchSensitivityRange?.addEventListener('input', e => {
      meta.touchSensitivity = clamp(Number(e.target.value) / 100, 0.55, 1.6);
      saveMeta();
      updateSettingsLabels();
    });
    ui.difficultyBtn?.addEventListener('click', cycleDifficulty);
    ui.controlModeBtn?.addEventListener('click', toggleControlMode);
    ui.autoAimBtn?.addEventListener('click', cycleAimAssist);
    ui.upgradeMenuBtn?.addEventListener('click', openRunShop);
    ui.closeUpgradeBtn?.addEventListener('click', () => hideUpgradeSurfaces({ resume: true }));
    ui.resumeFromUpgradeBtn?.addEventListener('click', () => hideUpgradeSurfaces({ resume: true }));
    ui.perfBtn?.addEventListener('click', () => flash('Phaser 版效能面板下一階段接入；目前使用瀏覽器/引擎 profiling。'));
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'KeyE') cycleAimAssist();
    });
    const syncViewport = () => syncViewportVars(sceneRef?.scale || {});
    window.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('resize', syncViewport);
    window.visualViewport?.addEventListener('scroll', syncViewport);
  }

  function boot() {
    setCardForHome();
    renderZones();
    updateMetaPanels();
    updateSettingsLabels();
    hideUpgradeSurfaces();
    bindUi();
    const size = syncViewportVars();
    const config = {
      type: PhaserLib.AUTO,
      parent: 'game',
      width: size.width,
      height: size.height,
      backgroundColor: '#050712',
      render: { antialias: true, pixelArt: false, roundPixels: false },
      scale: { mode: PhaserLib.Scale.RESIZE, autoCenter: PhaserLib.Scale.CENTER_BOTH },
      scene: [NeonScene]
    };
    window.__neonEngine = { name: 'Phaser', version: PhaserLib.VERSION, appVersion: VERSION };
    new PhaserLib.Game(config);
  }

  boot();
})();
