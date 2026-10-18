export const BACKGROUNDS = {
  aurora: ['#283273', '#9e6ac9', '#e8afbc'],
  ocean: ['#0d455b', '#288e9a', '#a0d4c4'],
  dusk: ['#754950', '#cf8775', '#f1c895'],
  graphite: ['#191f28', '#333e51', '#546174'],
};
export const DEMO_SOURCE = { kind: 'demo', name: '产品演示 · 示例素材', size: 0, lastModified: 0, sha256: null, width: 1280, height: 720, duration: 12 };
export const OUTPUT_PRESETS = {
  '720p': { label: '720p', width: 1280, height: 720, bitrate: 6000000 },
  '1080p': { label: '1080p', width: 1920, height: 1080, bitrate: 12000000 },
  '1440p': { label: '2K / QHD', width: 2560, height: 1440, bitrate: 24000000 },
  '2160p': { label: '4K / UHD', width: 3840, height: 2160, bitrate: 40000000 },
};
export const MAX_MEDIA_BYTES = 256 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
export const MAX_POINTER_SAMPLES = 4500;
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function createProject(source = DEMO_SOURCE, resolution = '720p') {
  return {
    schema: 'rea-studio-project', version: 3, source: { ...source },
    trim: { start: 0, end: source.duration },
    zoom: { enabled: true, mode: 'manual', smoothing: 0.2, start: source.duration * 0.2, end: source.duration * 0.7, scale: 1.7, x: 0.65, y: 0.45 },
    pointer: null,
    frame: { padding: 56, radius: 20, background: 'aurora' },
    output: { resolution },
  };
}

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}格式无效`);
}
function number(value, low, high, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) throw new Error(`${name}须在 ${low}–${high} 之间`);
}

// Parse at the persistence boundary; never let imported values reach canvas unchecked.
export function parseProject(value) {
  object(value, '项目');
  if (value.schema !== 'rea-studio-project' || ![1, 2, 3].includes(value.version)) throw new Error('不支持的项目格式或版本');
  const { source, trim, zoom, frame } = value;
  const output = value.version === 1 ? { resolution: '720p' } : value.output;
  object(output, '导出设置');
  if (typeof output.resolution !== 'string' || !Object.hasOwn(OUTPUT_PRESETS, output.resolution)) throw new Error('导出分辨率无效');
  for (const [name, item] of Object.entries({ source, trim, zoom, frame })) object(item, name);
  if (!['demo', 'video'].includes(source.kind)) throw new Error('素材类型无效');
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 300) throw new Error('素材名称无效');
  number(source.duration, 0.1, 1800, '素材时长');
  number(source.width, 1, 8192, '素材宽度'); number(source.height, 1, 8192, '素材高度');
  number(source.size, 0, 512 * 1024 * 1024, '素材大小'); number(source.lastModified, 0, Number.MAX_SAFE_INTEGER, '素材时间');
  if (source.kind === 'video' && (typeof source.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(source.sha256))) throw new Error('素材指纹无效');
  if (source.kind === 'demo' && source.sha256 !== null) throw new Error('示例素材指纹无效');
  if (source.kind === 'demo' && (source.duration !== 12 || source.width !== 1280 || source.height !== 720)) throw new Error('示例素材元数据无效');
  number(trim.start, 0, source.duration, '裁剪起点'); number(trim.end, 0, source.duration, '裁剪终点');
  if (trim.end - trim.start < 0.1 - 1e-9) throw new Error('裁剪片段至少需要 0.1 秒');
  if (typeof zoom.enabled !== 'boolean') throw new Error('缩放开关无效');
  number(zoom.start, 0, source.duration, '缩放起点'); number(zoom.end, 0, source.duration, '缩放终点');
  if (zoom.end <= zoom.start) throw new Error('缩放终点必须晚于起点');
  number(zoom.scale, 1, 3, '缩放倍率'); number(zoom.x, 0, 1, '焦点 X'); number(zoom.y, 0, 1, '焦点 Y');
  number(frame.padding, 0, 120, '留白'); number(frame.radius, 0, 48, '圆角');
  if (!Object.hasOwn(BACKGROUNDS, frame.background)) throw new Error('背景无效');
  const mode = value.version < 3 ? 'manual' : zoom.mode;
  const smoothing = value.version < 3 ? 0.2 : zoom.smoothing;
  if (!['manual', 'follow'].includes(mode)) throw new Error('缩放方式无效');
  number(smoothing, 0.05, 0.6, '跟随平滑度');
  let pointer = null;
  if (value.version === 3 && value.pointer !== null) {
    object(value.pointer, '鼠标轨迹');
    if (source.kind !== 'video' || !['screen', 'window'].includes(value.pointer.kind)) throw new Error('轨迹来源无效');
    const samples = value.pointer.samples;
    if (!Array.isArray(samples) || samples.length < 1 || samples.length > MAX_POINTER_SAMPLES) throw new Error('轨迹采样数量无效');
    let previous = -1;
    pointer = { kind: value.pointer.kind, samples: samples.map(sample => {
      object(sample, '轨迹采样'); number(sample.t, 0, Math.min(125, source.duration), '轨迹时间');
      if (sample.t <= previous) throw new Error('轨迹时间必须递增');
      previous = sample.t;
      if (sample.x !== null || sample.y !== null) { number(sample.x, 0, 1, '鼠标 X'); number(sample.y, 0, 1, '鼠标 Y'); }
      return { t: sample.t, x: sample.x, y: sample.y };
    }) };
  }
  if (mode === 'follow' && !hasPointer(pointer)) throw new Error('此素材没有可用的鼠标轨迹，请使用桌面版重新录制');
  // Explicit projection discards unknown keys and never merges untrusted object properties.
  return {
    schema: value.schema, version: 3,
    source: { kind: source.kind, name: source.name, duration: source.duration, width: source.width, height: source.height, size: source.size, lastModified: source.lastModified, sha256: source.sha256 },
    trim: { start: trim.start, end: trim.end },
    zoom: { enabled: zoom.enabled, mode, smoothing, start: zoom.start, end: zoom.end, scale: zoom.scale, x: zoom.x, y: zoom.y },
    pointer,
    frame: { padding: frame.padding, radius: frame.radius, background: frame.background },
    output: { resolution: output.resolution },
  };
}

export function captureBitrate(width = 3840, height = 2160) {
  const pixels = width * height;
  return Object.values(OUTPUT_PRESETS).find(preset => pixels <= preset.width * preset.height)?.bitrate ?? OUTPUT_PRESETS['2160p'].bitrate;
}

export function zoomAt(zoom, time) {
  if (!zoom.enabled || time <= zoom.start || time >= zoom.end) return 1;
  const ramp = Math.min(0.45, (zoom.end - zoom.start) / 2);
  const progress = clamp(Math.min((time - zoom.start) / ramp, (zoom.end - time) / ramp), 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  return 1 + (zoom.scale - 1) * eased;
}

export function hasPointer(pointer) { return Boolean(pointer?.samples.some(sample => sample.x !== null)); }

// The camera path depends only on saved samples and settings, never playback order.
// This makes seeking, preview, PNG and video export use exactly the same camera.
const pointerPaths = new WeakMap();
export function focusAt(zoom, time, pointer = null) {
  if (zoom.mode !== 'follow' || !pointer) return { x: zoom.x, y: zoom.y };
  let cached = pointerPaths.get(pointer);
  if (!cached || cached.smoothing !== zoom.smoothing) {
    let x = 0.5, y = 0.5, previous = 0;
    const path = pointer.samples.map((sample, index) => {
      if (sample.x !== null) {
        const alpha = index === 0 && sample.t === 0 ? 1 : 1 - Math.exp(-(sample.t - previous) / zoom.smoothing);
        x += (sample.x - x) * alpha; y += (sample.y - y) * alpha;
      }
      previous = sample.t;
      return { t: sample.t, x, y };
    });
    cached = { smoothing: zoom.smoothing, path }; pointerPaths.set(pointer, cached);
  }
  const path = cached.path;
  if (!path.length || time < path[0].t) return { x: 0.5, y: 0.5 };
  let low = 0, high = path.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (path[mid].t <= time) low = mid; else high = mid - 1; }
  const a = path[low], b = path[Math.min(low + 1, path.length - 1)];
  const progress = a === b ? 0 : clamp((time - a.t) / (b.t - a.t), 0, 1);
  return { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
}

export function cropAt(source, zoom, time, pointer = null) {
  const scale = zoomAt(zoom, time);
  const focus = focusAt(zoom, time, pointer);
  const width = source.width / scale, height = source.height / scale;
  return { x: clamp(focus.x * source.width - width / 2, 0, source.width - width), y: clamp(focus.y * source.height - height / 2, 0, source.height - height), width, height };
}

export function frameRect(source, frame, width = 1280, height = 720) {
  const padding = frame.padding * width / 1280;
  const scale = Math.min((width - padding * 2) / source.width, (height - padding * 2) / source.height);
  const w = source.width * scale, h = source.height * scale;
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

export function sameSource(a, b) {
  return a.kind === b.kind && a.sha256 === b.sha256 && a.size === b.size && a.width === b.width && a.height === b.height && Math.abs(a.duration - b.duration) < 0.1;
}
export function formatTime(value) {
  const seconds = Math.max(0, Number.isFinite(value) ? value : 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
}
