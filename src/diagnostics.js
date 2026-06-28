export function createDiagnostics({ document, storage, performance: perf = globalThis.performance } = {}) {
  const root = document?.getElementById?.('app') || document?.body;
  const panel = document?.createElement?.('aside');
  const storageKey = 'neon-salvage-perf-dashboard';
  const state = {
    visible: storage?.getItem?.(storageKey) === '1',
    frameStart: 0,
    frameMs: 0,
    updateMs: 0,
    drawMs: 0,
    fps: 0,
    frames: 0,
    fpsClock: perf?.now?.() || 0,
    lastPaint: 0,
    counts: {}
  };

  if (panel && root) {
    panel.id = 'perfDashboard';
    panel.className = 'perf-dashboard';
    panel.hidden = !state.visible;
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', '效能診斷面板');
    root.appendChild(panel);
  }

  function now() {
    return perf?.now?.() || Date.now();
  }

  function render(force = false) {
    if (!panel || !state.visible) return;
    const t = now();
    if (!force && t - state.lastPaint < 160) return;
    state.lastPaint = t;
    const c = state.counts || {};
    const status = c.paused ? '暫停' : c.running ? '戰鬥' : '首頁';
    panel.innerHTML = `
      <strong>PERF ${Math.round(state.fps)} fps</strong>
      <span>${status}｜${state.frameMs.toFixed(1)}ms frame</span>
      <span>update ${state.updateMs.toFixed(1)}ms｜draw ${state.drawMs.toFixed(1)}ms</span>
      <span>敵 ${c.enemies || 0}｜敵彈 ${c.enemyShots || 0}｜子彈 ${c.bullets || 0}</span>
      <span>碎晶 ${c.shards || 0}｜粒子 ${c.particles || 0}｜物件 ${c.worldFeatures || 0}</span>
      <small>F3 或設定可切換</small>
    `;
  }

  return {
    get visible() { return state.visible; },
    beginFrame(frameNow = now()) {
      state.frameStart = frameNow;
      state.updateMs = 0;
      state.drawMs = 0;
    },
    measure(label, fn) {
      const t0 = now();
      const value = fn();
      const elapsed = now() - t0;
      if (label === 'update') state.updateMs += elapsed;
      else if (label === 'draw') state.drawMs += elapsed;
      return value;
    },
    endFrame(counts = {}) {
      const t = now();
      state.frameMs = Math.max(0, t - (state.frameStart || t));
      state.frames++;
      state.counts = counts;
      const elapsed = t - state.fpsClock;
      if (elapsed >= 500) {
        state.fps = state.frames * 1000 / elapsed;
        state.frames = 0;
        state.fpsClock = t;
      }
      render();
    },
    toggle(force) {
      state.visible = typeof force === 'boolean' ? force : !state.visible;
      if (panel) panel.hidden = !state.visible;
      storage?.setItem?.(storageKey, state.visible ? '1' : '0');
      render(true);
      return state.visible;
    },
    snapshot() {
      return { ...state, counts: { ...state.counts } };
    }
  };
}
