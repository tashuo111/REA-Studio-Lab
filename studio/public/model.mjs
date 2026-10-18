export const BACKGROUNDS = {
  aurora: ['#283273', '#9e6ac9', '#e8afbc'],
  ocean: ['#0d455b', '#288e9a', '#a0d4c4'],
  dusk: ['#754950', '#cf8775', '#f1c895'],
  graphite: ['#191f28', '#333e51', '#546174'],
};
export const DEMO_SOURCE = { kind: 'demo', name: '产品演示 · 示例素材', size: 0, lastModified: 0, sha256: null, width: 1280, height: 720, duration: 12 };
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function createProject(source = DEMO_SOURCE) {
  return {
    schema: 'rea-studio-project', version: 1, source: { ...source },
    trim: { start: 0, end: source.duration },
    zoom: { enabled: true, start: source.duration * 0.2, end: source.duration * 0.7, scale: 1.7, x: 0.65, y: 0.45 },
    frame: { padding: 56, radius: 20, background: 'aurora' },
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
  if (value.schema !== 'rea-studio-project' || value.version !== 1) throw new Error('不支持的项目格式或版本');
  const { source, trim, zoom, frame } = value;
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
  // Explicit projection discards unknown keys and never merges untrusted object properties.
  return {
    schema: value.schema, version: 1,
    source: { kind: source.kind, name: source.name, duration: source.duration, width: source.width, height: source.height, size: source.size, lastModified: source.lastModified, sha256: source.sha256 },
    trim: { start: trim.start, end: trim.end },
    zoom: { enabled: zoom.enabled, start: zoom.start, end: zoom.end, scale: zoom.scale, x: zoom.x, y: zoom.y },
    frame: { padding: frame.padding, radius: frame.radius, background: frame.background },
  };
}

export function zoomAt(zoom, time) {
  if (!zoom.enabled || time <= zoom.start || time >= zoom.end) return 1;
  const ramp = Math.min(0.45, (zoom.end - zoom.start) / 2);
  const progress = clamp(Math.min((time - zoom.start) / ramp, (zoom.end - time) / ramp), 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  return 1 + (zoom.scale - 1) * eased;
}

export function cropAt(source, zoom, time) {
  const scale = zoomAt(zoom, time);
  const width = source.width / scale, height = source.height / scale;
  return { x: clamp(zoom.x * source.width - width / 2, 0, source.width - width), y: clamp(zoom.y * source.height - height / 2, 0, source.height - height), width, height };
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
