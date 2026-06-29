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

  const VERSION = 'v7.3 背景造型版';
  const WORLD = { w: 3200, h: 2200 };
  const PLAYER_BASE = { hp: 122, speed: 310, damage: 17, fireRate: 0.19, bulletSpeed: 760, radius: 14 };
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
    difficultyBtn: document.getElementById('difficultyBtn'),
    perfBtn: document.getElementById('perfBtn'),
    controlModeBtn: document.getElementById('controlModeBtn'),
    autoAimBtn: document.getElementById('autoAimBtn'),
    zonePanel: document.getElementById('zonePanel'),
    achievementPanel: document.getElementById('achievementPanel'),
    offlineNotice: document.getElementById('offlineNotice'),
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
    if (eyebrow) eyebrow.textContent = 'BETA DEMO // 背景造型版';
    if (h2) h2.textContent = '霓虹拾荒者 Neon Salvage';
    if (p) p.textContent = 'v7.3 加上星域背景、漂浮殘骸、晶礦裂隙與路線塗裝；飛船和敵人不再只是幾何圖形，而是有清楚輪廓與部件。';
    if (ui.startBtn) {
      ui.startBtn.style.display = '';
      ui.startBtn.textContent = '開始 v7.3';
    }
    if (ui.howBtn) ui.howBtn.style.display = '';
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
    if (ui.offlineNotice) ui.offlineNotice.textContent = 'v7.3：新增星域遠景、殘骸/晶礦/裂隙地景、路線塗裝、飛船艙蓋與敵人部件造型；舊 Canvas 版仍保留在 game.js 供回滾。';
  }

  function hideUpgradeSurfaces() {
    if (ui.upgradePrompt) ui.upgradePrompt.hidden = true;
    if (ui.upgradeMenuBtn) ui.upgradeMenuBtn.hidden = true;
    if (ui.upgradeModal) ui.upgradeModal.hidden = true;
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
      this.player = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0, hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp, angle: -Math.PI / 2, invuln: 1.8 };
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
      this.input.on('pointerdown', pointer => this.handlePointerDown(pointer));
      this.input.on('pointerup', () => this.touchVector = null);
      this.input.on('pointermove', pointer => { if (pointer.isDown && meta.controlMode === 'touch') this.handlePointerDown(pointer); });
      this.scale.on('resize', gameSize => this.onResize(gameSize));
      this.onResize({ width: this.scale.width, height: this.scale.height });
      this.drawAll();
      updateHud(this);
    }

    onResize(gameSize) {
      document.documentElement.style.setProperty('--app-height', `${gameSize.height}px`);
      this.cameras.main.setViewport(0, 0, gameSize.width, gameSize.height);
    }

    startRun() {
      this.resetRuntime();
      this.running = true;
      this.pausedRun = false;
      this.gameOver = false;
      ui.overlay?.classList.remove('visible');
      hideUpgradeSurfaces();
      this.startWave(1);
      flash('Phaser 引擎啟動｜敵群接近');
      beep('clear');
      haptic(18);
    }

    startWave(n) {
      this.wave = n;
      this.waveSpawned = 0;
      this.waveBudget = waveEnemyBudgetValue({ wave: n, controlMode: meta.controlMode, difficulty: difficultyFor(meta.difficulty), route: zoneRouteEffect() });
      if (n % 5 === 0) this.waveBudget = 1;
      this.spawnClock = 0.05;
      this.message = n % 5 === 0 ? `第 ${n} 波｜核心守衛` : `第 ${n} 波｜敵群 ${this.waveBudget}`;
      this.messageTimer = 2.2;
      flash(this.message);
      this.screenFlash = Math.max(this.screenFlash, n % 5 === 0 ? 0.24 : 0.13);
      this.screenFlashColor = n % 5 === 0 ? '#e83b3b' : '#ffdf68';
      this.comicSplash(this.player.x, this.player.y, n % 5 === 0 ? 'BOSS!!' : 'WAVE!', n % 5 === 0 ? '#e83b3b' : '#ffdf68');
    }

    handlePointerDown(pointer) {
      if (meta.controlMode !== 'touch' || !this.running || this.pausedRun) return;
      const cx = this.scale.width / 2;
      const cy = this.scale.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      const len = Math.hypot(dx, dy);
      this.touchVector = len > 18 ? { x: dx / len, y: dy / len, force: clamp(len / 150, 0.45, 1) } : null;
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
      if (this.comboTimer <= 0) this.combo = 0;
      this.updatePlayer(dt);
      this.updateSpawning(dt);
      this.updateFiring(dt);
      this.updateBullets(dt);
      this.updateEnemies(dt);
      this.updateDrops(dt);
      this.updateParticles(dt);
      this.updateWaveProgress();
      this.updateCamera(dt);
      this.drawAll();
      updateHud(this);
    }

    updatePlayer(dt) {
      let mx = 0;
      let my = 0;
      if (this.keys.W.isDown || this.keys.UP.isDown) my -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) my += 1;
      if (this.keys.A.isDown || this.keys.LEFT.isDown) mx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) mx += 1;
      if (this.touchVector) {
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
      const speed = PLAYER_BASE.speed * zoneSpeed * (meta.controlMode === 'touch' ? 0.92 : 1);
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
      const hpScale = difficultyFor(meta.difficulty).enemy || 1;
      const def = enemyDef(type, this.wave);
      const enemy = {
        type, x: px, y: py, vx: 0, vy: 0, r: boss ? 38 : def.r, hp: def.hp * hpScale, maxHp: def.hp * hpScale,
        speed: def.speed * (difficultyFor(meta.difficulty).speed || 1), color: def.color, shotClock: PhaserLib.Math.FloatBetween(0.4, 1.6), dashClock: 0, hit: 0
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
      this.bullets.push({ x: this.player.x + Math.cos(a) * 22, y: this.player.y + Math.sin(a) * 22, vx: Math.cos(a) * PLAYER_BASE.bulletSpeed, vy: Math.sin(a) * PLAYER_BASE.bulletSpeed, life: 1.25, r: 4.2, damage: playerDamage() });
      this.fireClock = PLAYER_BASE.fireRate;
      beep('shot');
    }

    updateBullets(dt) {
      for (const b of this.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        for (const e of this.enemies) {
          if (e.dead || dist(b.x, b.y, e.x, e.y) > b.r + e.r) continue;
          e.hp -= b.damage;
          e.hit = 0.12;
          b.dead = true;
          const hitAngle = Math.atan2(b.vy, b.vx);
          this.burst(b.x, b.y, '#bdfcff', 5, 0.45);
          this.comicImpact(b.x, b.y, e.hp <= 0 ? '#ffdf68' : '#f6f2dc', hitAngle, e.hp <= 0 ? 1.05 : 0.72);
          if (e.hp <= 0) this.killEnemy(e);
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
        const a = angleBetween(e.x, e.y, this.player.x, this.player.y);
        const d = dist(e.x, e.y, this.player.x, this.player.y);
        let desired = a;
        let speed = e.speed;
        if (e.type === 'shooter' && d < 420) desired = a + Math.PI;
        if (e.type === 'sprinter') {
          e.dashClock -= dt;
          if (e.dashClock <= -1.0) e.dashClock = 0.42;
          if (e.dashClock > 0) {
            speed *= 1.85;
            e.dashClock -= dt;
          }
        }
        if (e.type === 'boss') speed *= d > 360 ? 0.72 : 0.18;
        e.vx = Math.cos(desired) * speed;
        e.vy = Math.sin(desired) * speed;
        e.x = clamp(e.x + e.vx * dt, 35, WORLD.w - 35);
        e.y = clamp(e.y + e.vy * dt, 35, WORLD.h - 35);

        if ((e.type === 'shooter' || e.type === 'boss') && d < 780) {
          e.shotClock -= dt;
          if (e.shotClock <= 0) {
            const spread = e.type === 'boss' ? [-0.22, 0, 0.22] : [0];
            for (const off of spread) this.enemyShots.push({ x: e.x, y: e.y, vx: Math.cos(a + off) * 260, vy: Math.sin(a + off) * 260, life: 3.2, r: 5, damage: e.type === 'boss' ? 16 : 9 });
            e.shotClock = e.type === 'boss' ? 1.15 : 1.7;
          }
        }

        if (d < e.r + PLAYER_BASE.radius) {
          this.damagePlayer(e.type === 'boss' ? 22 : 13, e.x, e.y);
          const push = angleBetween(e.x, e.y, this.player.x, this.player.y);
          this.player.x = clamp(this.player.x + Math.cos(push) * 28, 60, WORLD.w - 60);
          this.player.y = clamp(this.player.y + Math.sin(push) * 28, 60, WORLD.h - 60);
        }
      }
      this.enemies = this.enemies.filter(e => !e.dead);
    }

    updateDrops(dt) {
      for (const s of this.shards) {
        const d = dist(s.x, s.y, this.player.x, this.player.y);
        if (d < 170) {
          const a = angleBetween(s.x, s.y, this.player.x, this.player.y);
          s.vx += Math.cos(a) * 520 * dt;
          s.vy += Math.sin(a) * 520 * dt;
          if (Math.random() < 0.18) this.particles.push({ x: s.x, y: s.y, vx: -Math.cos(a) * 45, vy: -Math.sin(a) * 45, r: 2.1, life: 0.22, max: 0.22, color: '#ffdf68', kind: 'spark' });
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.pow(0.02, dt);
        s.vy *= Math.pow(0.02, dt);
        if (d < PLAYER_BASE.radius + 12) {
          s.dead = true;
          meta.scrap += s.value;
          meta.score += s.value * 4;
          this.comicImpact(s.x, s.y, '#ffdf68', angleBetween(s.x, s.y, this.player.x, this.player.y), 0.45);
        }
      }
      this.shards = this.shards.filter(s => !s.dead);
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
      this.player.hp -= amount;
      this.player.invuln = 0.42;
      this.addFloatingText(this.player.x, this.player.y - 28, `-${Math.round(amount)}`, '#ff4d6d', 650);
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
      this.addFloatingText(e.x, e.y - e.r, boss ? 'CORE BREAK' : '+KILL', boss ? '#ffd166' : '#bdfcff', 800);
      this.burst(e.x, e.y, boss ? '#ffd166' : e.color, boss ? 34 : 13, boss ? 1.45 : 0.8);
      this.comicSplash(e.x, e.y, boss ? 'KRAK!!' : 'BLAM!', boss ? '#ffdf68' : e.color, boss ? 1.28 : 0.82);
      this.screenFlash = Math.max(this.screenFlash, boss ? 0.22 : 0.08);
      this.screenFlashColor = boss ? '#ffdf68' : '#78f6ff';
      this.dropShards(e.x, e.y, boss ? 18 : PhaserLib.Math.Between(2, 4));
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
        combo: this.bestCombo, surges: this.surgeCount, time: Math.floor(this.runTime), scrap: meta.scrap, score: meta.score
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
      card.querySelector('.eyebrow').textContent = clear ? 'SECTOR CLEAR // Phaser runtime' : 'RUN TERMINATED // Phaser runtime';
      card.querySelector('h2').textContent = clear ? '星環核心已回收' : '飛船解體，但資料已保存';
      const p = card.querySelector('p:not(.eyebrow)');
      if (p) p.textContent = `Engine Phaser｜時間 ${formatTime(this.runTime)}｜第 ${this.wave} 波｜擊殺 ${this.kills}｜最高連殺 ${this.bestCombo}｜擊破爆發 ${this.surgeCount}｜碎晶 ${meta.scrap}`;
      if (ui.startBtn) {
        ui.startBtn.textContent = '再次出擊';
        ui.startBtn.style.display = '';
      }
      if (ui.howBtn) ui.howBtn.style.display = '';
      ui.overlay.classList.add('visible');
      updateMetaPanels();
    }

    drawAll() {
      this.g.clear();
      this.uiG.clear();
      this.drawBackground();
      this.drawDrops();
      this.drawBullets();
      this.drawEnemies();
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
      const nose = point(p.x, p.y, a, 27);
      const left = point(p.x, p.y, a + 2.46, 21);
      const right = point(p.x, p.y, a - 2.46, 21);
      const tail = point(p.x, p.y, a + Math.PI, 18);
      const leftWing = point(p.x, p.y, a + 2.92, 31);
      const rightWing = point(p.x, p.y, a - 2.92, 31);
      const leftGun = point(p.x, p.y, a + 2.76, 22);
      const rightGun = point(p.x, p.y, a - 2.76, 22);

      // Route skin: chunky ink silhouette + visible cockpit, fins, guns, route-color plating.
      g.lineStyle(15, COMIC.ink, 1);
      g.strokeTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);
      g.fillStyle(accent, 0.98);
      g.fillTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);

      g.lineStyle(10, COMIC.ink, 1);
      g.strokeTriangle(tail.x, tail.y, leftWing.x, leftWing.y, left.x, left.y);
      g.strokeTriangle(tail.x, tail.y, rightWing.x, rightWing.y, right.x, right.y);
      g.fillStyle(COMIC.red, style.id === 'rift' ? 1 : 0.86);
      g.fillTriangle(tail.x, tail.y, leftWing.x, leftWing.y, left.x, left.y);
      g.fillStyle(secondary, 0.94);
      g.fillTriangle(tail.x, tail.y, rightWing.x, rightWing.y, right.x, right.y);

      g.lineStyle(7, COMIC.ink, 0.92);
      g.lineBetween(leftGun.x, leftGun.y, nose.x, nose.y);
      g.lineBetween(rightGun.x, rightGun.y, nose.x, nose.y);
      g.lineStyle(3, COMIC.white, 0.86);
      g.lineBetween(point(leftGun.x, leftGun.y, a, 4).x, point(leftGun.x, leftGun.y, a, 4).y, point(nose.x, nose.y, a + Math.PI, 8).x, point(nose.x, nose.y, a + Math.PI, 8).y);
      g.lineBetween(point(rightGun.x, rightGun.y, a, 4).x, point(rightGun.x, rightGun.y, a, 4).y, point(nose.x, nose.y, a + Math.PI, 8).x, point(nose.x, nose.y, a + Math.PI, 8).y);

      const canopy = point(p.x, p.y, a, 4);
      g.lineStyle(6, COMIC.ink, 1);
      g.fillStyle(COMIC.white, 1);
      g.fillCircle(canopy.x, canopy.y, 8);
      g.strokeCircle(canopy.x, canopy.y, 8);
      g.fillStyle(COMIC.ink, 0.72);
      g.fillCircle(point(canopy.x, canopy.y, a, 2).x, point(canopy.x, canopy.y, a, 2).y, 3.2);
      g.lineStyle(4, secondary, 0.9);
      g.lineBetween(point(tail.x, tail.y, a, 5).x, point(tail.x, tail.y, a, 5).y, point(nose.x, nose.y, a + Math.PI, 5).x, point(nose.x, nose.y, a + Math.PI, 5).y);

      const badge = point(p.x, p.y, a + Math.PI, 4);
      g.lineStyle(3, COMIC.ink, 0.9);
      g.strokeTriangle(badge.x, badge.y - 5, badge.x + 6, badge.y, badge.x, badge.y + 5);
      g.strokeTriangle(badge.x, badge.y - 5, badge.x - 6, badge.y, badge.x, badge.y + 5);
      g.fillStyle(secondary, 0.90);
      g.fillTriangle(badge.x, badge.y - 5, badge.x + 6, badge.y, badge.x, badge.y + 5);
      g.fillTriangle(badge.x, badge.y - 5, badge.x - 6, badge.y, badge.x, badge.y + 5);

      const flare1 = point(p.x, p.y, a + Math.PI, 30);
      const flare2 = point(p.x, p.y, a + Math.PI + 0.28, 46);
      const flare3 = point(p.x, p.y, a + Math.PI - 0.28, 46);
      g.lineStyle(5, COMIC.ink, 0.9);
      g.strokeTriangle(tail.x, tail.y, flare2.x, flare2.y, flare3.x, flare3.y);
      g.fillStyle(style.id === 'crystal' ? COMIC.gold : COMIC.orange, 0.76);
      g.fillTriangle(tail.x, tail.y, flare2.x, flare2.y, flare3.x, flare3.y);
      g.fillStyle(secondary, 0.9);
      g.fillCircle(flare1.x, flare1.y, 7);

      g.lineStyle(4, COMIC.ink, 0.52);
      g.strokeCircle(p.x, p.y, 26 + Math.sin(performance.now() * 0.006) * 2);
      g.lineStyle(2, accent, 0.28);
      g.strokeCircle(p.x, p.y, 29 + Math.sin(performance.now() * 0.006) * 2);
    }

    drawEnemies() {
      const g = this.g;
      for (const e of this.enemies) {
        const base = PhaserLib.Display.Color.HexStringToColor(e.hit > 0 ? '#f6f2dc' : e.color).color;
        g.fillStyle(COMIC.shadow, 0.32);
        g.fillEllipse(e.x + 5, e.y + 9, e.r * 2.2, e.r * 0.8);

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
        } else if (e.type === 'boss') {
          g.lineStyle(12, COMIC.ink, 1);
          g.fillStyle(COMIC.red, 1);
          g.fillCircle(e.x, e.y, e.r);
          g.strokeCircle(e.x, e.y, e.r);
          g.lineStyle(6, COMIC.gold, 0.94);
          g.strokeCircle(e.x, e.y, e.r + 12);
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
        const tailX = b.x - nx * 56;
        const tailY = b.y - ny * 56;
        // Few but strong tracer lanes: black ink edge + hot comic core.
        g.lineStyle(16, COMIC.ink, 0.95);
        g.lineBetween(tailX, tailY, b.x + nx * 8, b.y + ny * 8);
        g.lineStyle(10, COMIC.orange, 0.96);
        g.lineBetween(tailX, tailY, b.x + nx * 7, b.y + ny * 7);
        g.lineStyle(3, COMIC.white, 1);
        g.lineBetween(tailX + nx * 10, tailY + ny * 10, b.x + nx * 9, b.y + ny * 9);
        g.fillStyle(COMIC.gold, 1);
        g.fillCircle(b.x, b.y, b.r + 1.2);
      }
      for (const s of this.enemyShots) {
        const speed = Math.hypot(s.vx, s.vy) || 1;
        const nx = s.vx / speed;
        const ny = s.vy / speed;
        const tailX = s.x - nx * 70;
        const tailY = s.y - ny * 70;
        g.lineStyle(17, COMIC.ink, 0.96);
        g.lineBetween(tailX, tailY, s.x + nx * 6, s.y + ny * 6);
        g.lineStyle(10, COMIC.red, 0.94);
        g.lineBetween(tailX, tailY, s.x + nx * 6, s.y + ny * 6);
        g.lineStyle(3, COMIC.gold, 1);
        g.lineBetween(tailX + nx * 14, tailY + ny * 14, s.x + nx * 8, s.y + ny * 8);
        g.fillStyle(COMIC.magenta, 0.96);
        g.fillCircle(s.x, s.y, s.r + 1.4);
      }
    }

    drawDrops() {
      const g = this.g;
      for (const s of this.shards) {
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
      if (meta.controlMode === 'touch' && this.touchVector) {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        g.lineStyle(7, COMIC.ink, 0.74);
        g.strokeCircle(cx, cy, 54);
        g.lineStyle(3, COMIC.cyan, 0.55);
        g.strokeCircle(cx, cy, 54);
        g.fillStyle(COMIC.gold, 0.34);
        g.fillCircle(cx + this.touchVector.x * 42 * this.touchVector.force, cy + this.touchVector.y * 42 * this.touchVector.force, 16);
        g.lineStyle(4, COMIC.ink, 0.8);
        g.strokeCircle(cx + this.touchVector.x * 42 * this.touchVector.force, cy + this.touchVector.y * 42 * this.touchVector.force, 16);
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

  function enemyDef(type, wave) {
    if (type === 'boss') return { hp: 520 + wave * 42, speed: 86, r: 38, color: '#ff4d6d' };
    if (type === 'sprinter') return { hp: 24 + wave * 2.1, speed: 188 + wave * 3, r: 12, color: '#ff9f1c' };
    if (type === 'shooter') return { hp: 32 + wave * 2.5, speed: 116 + wave * 2, r: 14, color: '#ff3df2' };
    if (type === 'tank') return { hp: 70 + wave * 4, speed: 74 + wave * 1.4, r: 20, color: '#8aa3ff' };
    return { hp: 34 + wave * 2.4, speed: 128 + wave * 2.2, r: 15, color: '#37f6ff' };
  }

  function pickEnemyType(wave) {
    const roll = Math.random();
    const zone = meta.selectedZone;
    if (zone === 'crystal' && roll < 0.34) return 'sprinter';
    if (zone === 'scrapyard' && roll < 0.28) return 'tank';
    if (zone === 'rift' && roll < 0.30) return 'shooter';
    if (wave >= 7 && roll < 0.22) return 'tank';
    if (wave >= 4 && roll < 0.48) return 'shooter';
    if (roll < 0.33) return 'sprinter';
    return 'chaser';
  }

  function zoneRouteEffect() {
    if (meta.selectedZone === 'crystal') return { enemyMult: 1.05 };
    if (meta.selectedZone === 'scrapyard') return { enemyMult: 1.08 };
    if (meta.selectedZone === 'rift') return { enemyMult: 1.03 };
    return { enemyMult: 1 };
  }

  function playerDamage() {
    const cannon = meta.upgrades?.cannon || 0;
    const reactor = meta.upgrades?.reactor || 0;
    return PLAYER_BASE.damage + cannon * 2.7 + reactor * 2.35;
  }

  function updateHud(scene) {
    if (!scene) return;
    ui.wave.textContent = String(scene.wave || 1);
    ui.hp.textContent = String(Math.max(0, Math.ceil(scene.player?.hp ?? PLAYER_BASE.hp)));
    ui.scrap.textContent = String(meta.scrap || 0);
    ui.score.textContent = String(meta.score || 0);
    if (ui.xpBar) ui.xpBar.style.width = `${clamp((scene.waveSpawned / Math.max(1, scene.waveBudget)) * 100, 0, 100)}%`;
    if (ui.pauseBtn) ui.pauseBtn.textContent = scene.pausedRun ? '繼續' : '暫停';
  }

  function togglePause() {
    if (!sceneRef?.running || sceneRef.gameOver) return;
    sceneRef.pausedRun = !sceneRef.pausedRun;
    flash(sceneRef.pausedRun ? '已暫停' : '繼續出擊');
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
    meta.controlMode = meta.controlMode === 'touch' ? 'keyboard' : 'touch';
    saveMeta();
    updateSettingsLabels();
    flash(meta.controlMode === 'touch' ? '手機模式：按住螢幕推進' : '滑鼠鍵盤模式');
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
    ui.difficultyBtn?.addEventListener('click', cycleDifficulty);
    ui.controlModeBtn?.addEventListener('click', toggleControlMode);
    ui.autoAimBtn?.addEventListener('click', cycleAimAssist);
    ui.closeUpgradeBtn?.addEventListener('click', hideUpgradeSurfaces);
    ui.resumeFromUpgradeBtn?.addEventListener('click', hideUpgradeSurfaces);
    ui.perfBtn?.addEventListener('click', () => flash('Phaser 版效能面板下一階段接入；目前使用瀏覽器/引擎 profiling。'));
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyP') togglePause();
      if (e.code === 'KeyE') cycleAimAssist();
    });
  }

  function boot() {
    setCardForHome();
    renderZones();
    updateMetaPanels();
    updateSettingsLabels();
    hideUpgradeSurfaces();
    bindUi();
    const config = {
      type: PhaserLib.AUTO,
      parent: 'game',
      width: window.innerWidth,
      height: window.innerHeight,
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
