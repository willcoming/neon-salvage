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

  const VERSION = 'v7.0 Phaser 引擎版';
  const WORLD = { w: 3200, h: 2200 };
  const PLAYER_BASE = { hp: 122, speed: 310, damage: 17, fireRate: 0.19, bulletSpeed: 760, radius: 14 };
  const MAX_PARTICLES = 220;
  const ZONE_DEFS = [
    { id: 'random', name: '隨機航線', desc: '每局抽一個星域，保持新鮮感。', color: '#bdfcff' },
    { id: 'scrapyard', name: '電磁殘骸帶', desc: '敵彈稍慢，戰場更擁擠。', color: '#37f6ff' },
    { id: 'crystal', name: '晶礦雲帶', desc: '資源較多，高速敵人較常出現。', color: '#ffd166' },
    { id: 'rift', name: '裂隙邊界', desc: '危險裂隙較多，但目標獎勵更高。', color: '#ff4d6d' }
  ];
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
    if (eyebrow) eyebrow.textContent = 'BETA DEMO // Phaser engine migration';
    if (h2) h2.textContent = '霓虹拾荒者 Neon Salvage';
    if (p) p.textContent = 'v7.0 已切到 Phaser 引擎：保留飛船生存、敵群清場、波次推進與擊破爆發，先把核心手感搬到可擴充的遊戲引擎。';
    if (ui.startBtn) {
      ui.startBtn.style.display = '';
      ui.startBtn.textContent = '開始 Phaser 版';
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
      btn.innerHTML = `<b style="color:${z.color}">${z.name}</b><small>${z.desc}</small><small>Engine：Phaser runtime</small>`;
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
    if (ui.achievementPanel) ui.achievementPanel.textContent = `最佳波次 ${meta.bestWave || 1}｜累積碎晶 ${meta.scrap || 0}｜Engine Phaser 3.90`;
    if (ui.offlineNotice) ui.offlineNotice.textContent = '舊 Canvas 版仍保留在 game.js 供回滾；目前首頁載入 Phaser runtime。';
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
          this.burst(b.x, b.y, '#bdfcff', 5, 0.45);
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
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= Math.pow(0.02, dt);
        s.vy *= Math.pow(0.02, dt);
        if (d < PLAYER_BASE.radius + 12) {
          s.dead = true;
          meta.scrap += s.value;
          meta.score += s.value * 4;
        }
      }
      this.shards = this.shards.filter(s => !s.dead);
    }

    updateParticles(dt) {
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      this.shakeTime = Math.max(0, this.shakeTime - dt);
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
        this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: PhaserLib.Math.FloatBetween(1.6, 4.2) * scale, life: PhaserLib.Math.FloatBetween(0.18, 0.52), color });
      }
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
      this.drawScreenHints();
    }

    drawBackground() {
      const g = this.g;
      g.fillStyle(0x050712, 1);
      g.fillRect(0, 0, WORLD.w, WORLD.h);
      g.lineStyle(1, 0x12304d, 0.34);
      for (let x = 0; x <= WORLD.w; x += 120) g.lineBetween(x, 0, x, WORLD.h);
      for (let y = 0; y <= WORLD.h; y += 120) g.lineBetween(0, y, WORLD.w, y);
      g.lineStyle(2, 0x37f6ff, 0.22);
      g.strokeRect(24, 24, WORLD.w - 48, WORLD.h - 48);
      const zone = ZONE_DEFS.find(z => z.id === meta.selectedZone) || ZONE_DEFS[0];
      g.fillStyle(PhaserLib.Display.Color.HexStringToColor(zone.color).color, 0.06);
      g.fillCircle(WORLD.w * 0.5, WORLD.h * 0.5, 520);
    }

    drawPlayer() {
      const p = this.player;
      const g = this.g;
      const flicker = p.invuln > 0 && Math.sin(performance.now() * 0.04) > 0;
      if (flicker) return;
      const a = p.angle;
      const nose = point(p.x, p.y, a, 24);
      const left = point(p.x, p.y, a + 2.45, 17);
      const right = point(p.x, p.y, a - 2.45, 17);
      g.fillStyle(0xbdfcff, 1);
      g.fillTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokeTriangle(nose.x, nose.y, left.x, left.y, right.x, right.y);
      g.lineStyle(2, 0x37f6ff, 0.28);
      g.strokeCircle(p.x, p.y, 34 + Math.sin(performance.now() * 0.006) * 4);
    }

    drawEnemies() {
      const g = this.g;
      for (const e of this.enemies) {
        const color = PhaserLib.Display.Color.HexStringToColor(e.hit > 0 ? '#ffffff' : e.color).color;
        g.fillStyle(color, e.type === 'boss' ? 0.95 : 0.88);
        if (e.type === 'sprinter') {
          g.fillTriangle(e.x + e.r, e.y, e.x - e.r, e.y - e.r * 0.8, e.x - e.r, e.y + e.r * 0.8);
        } else if (e.type === 'shooter') {
          g.fillStyle(color, 0.86);
          g.fillCircle(e.x, e.y, e.r);
          g.lineStyle(2, 0xff3df2, 0.55);
          g.strokeCircle(e.x, e.y, e.r + 5);
        } else if (e.type === 'boss') {
          g.fillStyle(0xff4d6d, 0.9);
          g.fillCircle(e.x, e.y, e.r);
          g.lineStyle(4, 0xffd166, 0.72);
          g.strokeCircle(e.x, e.y, e.r + 10);
        } else {
          g.fillCircle(e.x, e.y, e.r);
        }
        if (e.hp < e.maxHp) {
          g.fillStyle(0x07101f, 0.75);
          g.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
          g.fillStyle(0x4dff88, 0.9);
          g.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * clamp(e.hp / e.maxHp, 0, 1), 4);
        }
      }
    }

    drawBullets() {
      const g = this.g;
      g.fillStyle(0xbdfcff, 0.96);
      for (const b of this.bullets) g.fillCircle(b.x, b.y, b.r);
      g.fillStyle(0xff3df2, 0.9);
      for (const s of this.enemyShots) g.fillCircle(s.x, s.y, s.r);
    }

    drawDrops() {
      const g = this.g;
      g.fillStyle(0xffd166, 0.95);
      for (const s of this.shards) g.fillCircle(s.x, s.y, s.r);
    }

    drawParticles() {
      const g = this.g;
      for (const p of this.particles) {
        const alpha = clamp(p.life / (p.max || 0.5), 0, 1);
        const color = PhaserLib.Display.Color.HexStringToColor(p.color || '#ffffff').color;
        if (p.ring) {
          g.lineStyle(4, color, alpha * 0.82);
          g.strokeCircle(p.x, p.y, p.r);
        } else {
          g.fillStyle(color, alpha);
          g.fillCircle(p.x, p.y, p.r);
        }
      }
    }

    addFloatingText(x, y, text, color = '#ffffff', duration = 760) {
      const label = this.add.text(x, y, text, {
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: '800',
        color,
        stroke: '#050712',
        strokeThickness: 4
      }).setOrigin(0.5).setDepth(8);
      this.labels.push(label);
      this.tweens.add({
        targets: label,
        y: y - 42,
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
        g.fillStyle(0x050712, 0.58);
        g.fillRoundedRect(this.scale.width / 2 - 190, 86, 380, 34, 14);
        g.lineStyle(1, 0x37f6ff, 0.48);
        g.strokeRoundedRect(this.scale.width / 2 - 190, 86, 380, 34, 14);
        if (this.bannerText) {
          this.bannerText.setVisible(true);
          this.bannerText.setText(this.message);
          this.bannerText.setPosition(this.scale.width / 2, 103);
        }
      } else if (this.bannerText) {
        this.bannerText.setVisible(false);
      }
      if (meta.controlMode === 'touch' && this.touchVector) {
        const cx = this.scale.width / 2;
        const cy = this.scale.height / 2;
        g.lineStyle(3, 0xbdfcff, 0.34);
        g.strokeCircle(cx, cy, 54);
        g.fillStyle(0xbdfcff, 0.26);
        g.fillCircle(cx + this.touchVector.x * 42 * this.touchVector.force, cy + this.touchVector.y * 42 * this.touchVector.force, 14);
      }
    }
  }

  function point(x, y, a, r) {
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
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
