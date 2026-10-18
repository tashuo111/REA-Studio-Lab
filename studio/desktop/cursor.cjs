const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { existsSync } = require('node:fs');
const path = require('node:path');

const now = () => performance.timeOrigin + performance.now();
function normalizePoint(point, bounds) {
  if (!point || !bounds || ![point.x, point.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return { x: null, y: null };
  const x = (point.x - bounds.x) / bounds.width, y = (point.y - bounds.y) / bounds.height;
  return x >= 0 && x < 1 && y >= 0 && y < 1 ? { x: +x.toFixed(6), y: +y.toFixed(6) } : { x: null, y: null };
}

class CursorCapture {
  constructor(source, screen) {
    this.kind = source.id.startsWith('screen:') ? 'screen' : 'window';
    this.samples = []; this.latest = { x: null, y: null }; this.started = null;
    this.stopped = false; this.warning = ''; this.child = null;
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    this.timeout = setTimeout(() => this.fail('鼠标轨迹初始化超时'), 4000);
    this.watchdog = setTimeout(() => this.stop(), 130000);
    if (this.kind === 'screen') {
      const displayId = source.display_id;
      if (!displayId || !screen.getAllDisplays().some(display => String(display.id) === displayId)) { this.fail('无法确定所选屏幕的坐标，已保留普通录屏'); return; }
      const poll = () => {
        try {
          const display = screen.getAllDisplays().find(display => String(display.id) === displayId);
          if (!display) { this.fail('所选屏幕已断开，轨迹记录已停止'); return; }
          this.sample(normalizePoint(screen.getCursorScreenPoint(), display.bounds), now());
        } catch { this.fail('无法继续读取鼠标位置'); }
      };
      this.timer = setInterval(poll, 33); poll();
    } else {
      // Electron 44 also returns :2. Preserve the HWND and Aura source identifier.
      const match = /^window:(\d+):(\d+)$/.exec(source.id);
      if (process.platform !== 'win32' || !match) { this.fail('此系统暂不支持窗口鼠标轨迹'); return; }
      const bundled = path.join(__dirname, 'cursor-helper.exe');
      const executable = existsSync(bundled) ? bundled : path.join(__dirname, '../.local/cursor-helper.exe');
      // A nonzero window_id selects Chromium's in-process Aura surface (client area).
      this.child = spawn(executable, [match[1], match[2] === '0' ? 'frame' : 'client'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      const child = this.child;
      this.closed = new Promise(resolve => { child.once('close', resolve); child.once('error', resolve); });
      child.stdin.on('error', () => {});
      child.on('error', () => this.fail('鼠标采集组件无法启动，已保留普通录屏'));
      child.on('exit', () => { if (!this.stopped) this.fail('鼠标采集已结束，仅保留已记录轨迹'); });
      this.lines = createInterface({ input: child.stdout });
      this.lines.on('line', line => {
        if (this.stopped) return;
        try {
          if (line.length > 2048) throw new Error('Oversized sample');
          const value = JSON.parse(line);
          if (value.error || !Number.isFinite(value.elapsed) || value.elapsed < 0 || value.elapsed > 151000) throw new Error('Unavailable source');
          // Keep the native monotonic clock: pipe delivery delay must not distort the path.
          this.nativeOrigin ??= now() - value.elapsed;
          this.sample(normalizePoint(value.point, value.bounds), this.nativeOrigin + value.elapsed);
        } catch { this.fail('录制窗口不可用，鼠标轨迹已停止'); }
      });
    }
  }
  sample(point, timestamp) {
    if (this.stopped) return;
    this.latest = point;
    clearTimeout(this.timeout); this.resolveReady({ available: true });
    if (this.started === null) return;
    const t = +((timestamp - this.started) / 1000).toFixed(4);
    if (t < 0 || t <= (this.samples.at(-1)?.t ?? -1)) return;
    if (t > 125 || this.samples.length >= 4500) { this.fail('鼠标轨迹达到时长上限'); return; }
    this.samples.push({ t, ...point });
  }
  start(epoch) {
    if (this.started !== null || this.stopped || !Number.isFinite(epoch) || Math.abs(now() - epoch) > 5000) throw new Error('鼠标轨迹无法开始');
    this.started = epoch; this.samples.push({ t: 0, ...this.latest });
  }
  fail(message) {
    this.warning = message; this.rejectReady(new Error(message));
    void this.stop();
  }
  stop() {
    this.stopping ??= this.finishStop();
    return this.stopping;
  }
  async finishStop() {
    if (!this.stopped) {
      this.stopped = true; clearTimeout(this.timeout); clearTimeout(this.watchdog); clearInterval(this.timer);
      this.rejectReady(new Error('鼠标采集已结束'));
      if (this.child) {
        this.child.stdin.end();
        const kill = setTimeout(() => { if (this.child.exitCode === null) this.child.kill(); }, 500);
        await this.closed; clearTimeout(kill); this.lines?.close();
      }
    }
    return { kind: this.kind, samples: this.samples, warning: this.warning };
  }
}
module.exports = { CursorCapture, normalizePoint };
