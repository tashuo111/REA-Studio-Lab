export function webmType() {
  if (typeof MediaRecorder === 'undefined') throw new Error('当前浏览器不支持录制，请使用新版 Chrome 或 Edge');
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error('当前浏览器没有可用的 WebM 编码器');
  return type;
}

export function waitEvent(target, name, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const clear = () => { clearTimeout(timer); target.removeEventListener(name, success); target.removeEventListener('error', failure); };
    const success = () => { clear(); resolve(); };
    const failure = () => { clear(); reject(new Error('视频无法解码，请使用浏览器支持的 MP4 或 WebM 文件')); };
    const timer = setTimeout(() => { clear(); reject(new Error('等待视频超时，请重试或更换素材')); }, timeout);
    target.addEventListener(name, success, { once: true }); target.addEventListener('error', failure, { once: true });
  });
}

export async function seekVideo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) return;
  const ready = waitEvent(video, 'seeked');
  video.currentTime = time;
  await ready;
}

export async function openVideo(file, durationHint) {
  if (file.size > 512 * 1024 * 1024) throw new Error('原型单个素材上限为 512 MB');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    const metadata = waitEvent(video, 'loadedmetadata'); video.src = url; await metadata;
    if (!Number.isFinite(video.duration)) await seekVideo(video, 1e9);
    const duration = Number.isFinite(video.duration) ? video.duration : durationHint;
    if (!Number.isFinite(duration) || duration < 0.1 || duration > 1800) throw new Error('素材时长需在 0.1 秒至 30 分钟之间');
    if (video.videoWidth < 1 || video.videoWidth > 8192 || video.videoHeight < 1 || video.videoHeight > 8192) throw new Error('素材分辨率不受支持');
    await seekVideo(video, 0);
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    return { video, url, file, source: { kind: 'video', name: file.name, size: file.size, lastModified: file.lastModified, sha256, width: video.videoWidth, height: video.videoHeight, duration } };
  } catch (error) {
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); throw error;
  }
}

export function closeVideo(media) {
  if (!media) return;
  media.video.pause(); media.video.removeAttribute('src'); media.video.load(); URL.revokeObjectURL(media.url);
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
