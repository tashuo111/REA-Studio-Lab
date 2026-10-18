import { BACKGROUNDS, createProject, parseProject, clamp, cropAt, frameRect, sameSource, formatTime, zoomAt } from './model.mjs';
import { paintDemo, render } from './render.mjs';
import { webmType, openVideo, closeVideo, seekVideo, download } from './media.mjs';

const $ = id => document.getElementById(id);
const canvas = $('preview');
const demoCanvas = document.createElement('canvas'); demoCanvas.width = 1280; demoCanvas.height = 720;
let project = createProject(), media = null, time = 0, playing = false, playOrigin = 0, playStart = 0;
let busy = null, recording = null, exporter = null, seekGeneration = 0;

function status(message, error = false) {
  $('status').textContent = message;
  $('status').parentElement.dataset.error = String(error);
}
function lock(kind) {
  busy = kind;
  document.querySelectorAll('[data-lock]').forEach(element => element.disabled = Boolean(kind));
  $('record').hidden = kind === 'recording'; $('stop-record').hidden = kind !== 'recording';
  $('cancel-export').hidden = kind !== 'exporting';
}
function action(id, fn) {
  $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(error => status(error.message, true)));
}
function draw() {
  if (project.source.kind === 'demo') paintDemo(demoCanvas, time);
  if (media && media.video.readyState < 2) return;
  render(canvas, media ? media.video : demoCanvas, project, time);
  $('time-readout').textContent = `${formatTime(time)} / ${formatTime(project.source.duration)}`;
  $('scrub').value = time;
  $('zoom-state').textContent = `${zoomAt(project.zoom, time).toFixed(2)}×`;
}
function syncControls() {
  for (const [id, value] of Object.entries({ padding: project.frame.padding, radius: project.frame.radius, 'zoom-scale': project.zoom.scale, 'zoom-start': project.zoom.start, 'zoom-end': project.zoom.end, 'focus-x': project.zoom.x, 'focus-y': project.zoom.y, 'trim-start': project.trim.start, 'trim-end': project.trim.end })) $(id).value = Math.round(value * 1000) / 1000;
  $('zoom-enabled').checked = project.zoom.enabled;
  for (const id of ['trim-start', 'trim-end', 'zoom-start', 'zoom-end', 'scrub']) $(id).max = project.source.duration;
  $('padding-value').textContent = `${project.frame.padding} px`; $('radius-value').textContent = `${project.frame.radius} px`;
  $('scale-value').textContent = `${project.zoom.scale.toFixed(2)}×`;
  $('x-value').textContent = `${Math.round(project.zoom.x * 100)}%`; $('y-value').textContent = `${Math.round(project.zoom.y * 100)}%`;
  $('source-name').textContent = project.source.name;
  $('source-meta').textContent = `${project.source.width} × ${project.source.height} · ${project.source.duration.toFixed(1)} 秒`;
  $('clip-title').textContent = project.source.name;
  $('clip-length').textContent = `片段 ${(project.trim.end - project.trim.start).toFixed(1)} 秒`;
  $('download-source').hidden = !media;
  $('source-hint').textContent = media ? '本地视频 · 当前版本的预览与导出均无声' : '当前为生成的示例动画，可直接体验编辑与导出';
  document.querySelector('.asset-art b').textContent = media ? 'LOCAL' : 'DEMO';
  document.querySelectorAll('[data-background]').forEach(element => element.setAttribute('aria-pressed', String(element.dataset.background === project.frame.background)));
  for (const [id, region] of [['clip-band', project.trim], ['zoom-band', project.zoom]]) {
    $(id).style.left = `${100 * region.start / project.source.duration}%`;
    $(id).style.width = `${100 * (region.end - region.start) / project.source.duration}%`;
  }
  $('zoom-band').hidden = !project.zoom.enabled;
  $('ruler').replaceChildren(...Array.from({ length: 7 }, (_, i) => { const label = document.createElement('span'); label.textContent = formatTime(project.source.duration * i / 6); return label; }));
  draw();
}
function pause() {
  playing = false; media?.video.pause(); $('play').textContent = '▶'; $('play').setAttribute('aria-label', '播放');
}
async function seek(timeTo) {
  pause(); const generation = ++seekGeneration;
  time = clamp(timeTo, 0, project.source.duration);
  if (media) await seekVideo(media.video, time);
  if (generation === seekGeneration) draw();
}
async function play() {
  if (time < project.trim.start || time >= project.trim.end - 0.01) await seek(project.trim.start);
  if (media) await media.video.play();
  playStart = time; playOrigin = performance.now(); playing = true;
  $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', '暂停');
}
function tick(now) {
  if (playing) {
    time = media ? media.video.currentTime : playStart + (now - playOrigin) / 1000;
    if (time >= project.trim.end || media?.video.ended) {
      time = project.trim.end; draw(); pause();
      if (exporter?.recorder.state === 'recording') exporter.recorder.stop();
    } else draw();
    if (exporter) status(`正在实时导出 ${Math.round(clamp((time - project.trim.start) / (project.trim.end - project.trim.start), 0, 1) * 100)}% · 请保持此页面在前台`);
  }
  requestAnimationFrame(tick);
}
function edit(section, key, value) {
  const candidate = structuredClone(project); candidate[section][key] = value;
  try { project = parseProject(candidate); status('调整已应用 · 可预览或导出'); }
  catch (error) { status(error.message, true); }
  syncControls();
}
for (const [id, section, key] of [['padding','frame','padding'],['radius','frame','radius'],['zoom-scale','zoom','scale'],['zoom-start','zoom','start'],['zoom-end','zoom','end'],['focus-x','zoom','x'],['focus-y','zoom','y'],['trim-start','trim','start'],['trim-end','trim','end']]) {
  const element = $(id);
  element.addEventListener(element.type === 'range' ? 'input' : 'change', () => edit(section, key, element.valueAsNumber));
}
$('zoom-enabled').addEventListener('change', event => edit('zoom', 'enabled', event.target.checked));
document.querySelectorAll('[data-background]').forEach(button => button.addEventListener('click', () => { if (Object.hasOwn(BACKGROUNDS, button.dataset.background)) edit('frame', 'background', button.dataset.background); }));
canvas.addEventListener('click', event => {
  if (busy) return;
  const bounds = canvas.getBoundingClientRect();
  const px = (event.clientX - bounds.left) * canvas.width / bounds.width, py = (event.clientY - bounds.top) * canvas.height / bounds.height;
  const r = frameRect(project.source, project.frame), crop = cropAt(project.source, project.zoom, time);
  if (px < r.x || px > r.x + r.width || py < r.y || py > r.y + r.height) return;
  project.zoom.x = clamp((crop.x + (px - r.x) / r.width * crop.width) / project.source.width, 0, 1);
  project.zoom.y = clamp((crop.y + (py - r.y) / r.height * crop.height) / project.source.height, 0, 1);
  syncControls(); status('已设置手动缩放焦点');
});
$('scrub').addEventListener('input', event => seek(Number(event.target.value)).catch(error => status(error.message, true)));
action('play', () => playing ? pause() : play());
action('restart', () => seek(project.trim.start));
action('trim-end-seek', () => seek(project.trim.end));
action('demo', () => { pause(); closeVideo(media); media = null; project = createProject(); time = 0; syncControls(); status('已加载生成的示例动画'); });
action('import-video', () => $('video-input').click());
action('download-source', () => { if (media) download(media.file, media.file.name); });

function replaceMedia(next) {
  pause(); closeVideo(media); media = next; project = createProject(next.source); time = 0; syncControls();
}
$('video-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  pause(); lock('loading'); status('正在读取本地视频…');
  try { replaceMedia(await openVideo(file)); status('视频已导入 · 可以开始裁剪和调整画面'); }
  catch (error) { status(error.message, true); }
  finally { lock(null); }
});
action('save-project', () => download(new Blob([JSON.stringify(parseProject(project), null, 2)], { type: 'application/json' }), 'rea-studio-project.json'));
action('open-project', () => $('project-input').click());
$('project-input').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  pause(); lock('loading');
  try {
    if (file.size > 256 * 1024) throw new Error('参数文件超过 256 KB 上限');
    const candidate = parseProject(JSON.parse(await file.text()));
    if (candidate.source.kind === 'video' && (!media || !sameSource(candidate.source, media.source))) throw new Error('请先导入此参数对应的原片（文件内容指纹需匹配，允许重命名）');
    if (candidate.source.kind === 'demo') { closeVideo(media); media = null; }
    project = candidate; await seek(project.trim.start); syncControls(); status('参数已恢复 · 参数文件不包含视频素材');
  } catch (error) { status(error instanceof SyntaxError ? '参数文件不是有效 JSON' : error.message, true); }
  finally { lock(null); }
});
action('export-frame', async () => {
  draw(); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('当前帧导出失败');
  download(blob, 'rea-studio-frame.png'); status('当前帧已导出为 PNG');
});

action('record', async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('当前浏览器不支持屏幕捕获，请在 Chrome 或 Edge 中打开本地地址');
  const mimeType = webmType();
  pause(); lock('choosing'); status('请在浏览器弹出的选择器中选择录制来源');
  let stream, interval, recorder;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
    const chunks = []; let bytes = 0; const started = performance.now();
    recording = { stream, recorder, stop: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= 256 * 1024 * 1024) recording?.stop(); } });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
      recorder.addEventListener('error', () => reject(new Error('屏幕录制失败，请重试')), { once: true });
    });
    stream.getVideoTracks()[0].addEventListener('ended', () => recording?.stop(), { once: true });
    recorder.start(500); lock('recording');
    interval = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      status(`正在录屏 ${formatTime(elapsed)} · 点击结束录屏后进入编辑`);
      if (elapsed >= 120) recording?.stop();
    }, 300);
    const blob = await done; const elapsed = (performance.now() - started) / 1000;
    clearInterval(interval); stream.getTracks().forEach(track => track.stop()); recording = null;
    if (!blob.size || elapsed < 0.1) throw new Error('录制时间太短，请重新录制');
    lock('loading'); status('正在整理录屏…');
    replaceMedia(await openVideo(new File([blob], `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: mimeType }), elapsed));
    status('录屏已载入 · 请保存原片，随后可以裁剪和导出');
  } catch (error) {
    status(error.name === 'NotAllowedError' ? '已取消屏幕选择，或浏览器未获录屏权限' : error.message, error.name !== 'NotAllowedError');
  } finally {
    clearInterval(interval); if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); recording = null; lock(null);
  }
});
action('stop-record', () => recording?.stop());

action('export-video', async () => {
  if (project.trim.end - project.trim.start > 120) throw new Error('原型单次导出最长 2 分钟，请先缩短裁剪区间');
  const mimeType = webmType(); const previousTime = time;
  pause(); lock('exporting');
  let stream, recorder;
  try {
    await seek(project.trim.start); draw();
    if (document.hidden) throw new Error('请保持页面在前台后重新导出');
    stream = canvas.captureStream(30); recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
    exporter = { recorder, stream, cancelled: false, reason: '已取消导出' };
    const run = exporter, chunks = [];
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
      recorder.addEventListener('error', () => reject(new Error('视频导出失败')), { once: true });
    });
    recorder.start(250);
    const [, blob] = await Promise.all([play(), done]);
    pause();
    if (run.cancelled) status(run.reason);
    else {
      if (!blob.size) throw new Error('导出的视频为空');
      download(blob, 'rea-studio-export.webm'); status('WebM 已导出 · 1280 × 720 · 无音轨');
    }
  } finally {
    pause(); if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); exporter = null; lock(null);
    await seek(previousTime);
  }
});
function cancelExport(reason) {
  if (!exporter) return;
  exporter.cancelled = true; exporter.reason = reason; pause();
  if (exporter.recorder.state !== 'inactive') exporter.recorder.stop();
}
action('cancel-export', () => cancelExport('已取消导出'));
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelExport('页面进入后台，已取消导出。请保持页面在前台后重试。'); });
window.addEventListener('pagehide', () => {
  cancelExport('页面已关闭'); recording?.stop(); recording?.stream.getTracks().forEach(track => track.stop()); closeVideo(media);
});
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !busy && !['INPUT', 'BUTTON', 'SUMMARY'].includes(document.activeElement.tagName)) {
    event.preventDefault(); (playing ? Promise.resolve(pause()) : play()).catch(error => status(error.message, true));
  }
});
syncControls(); requestAnimationFrame(tick);
