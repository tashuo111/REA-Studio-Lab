import { BACKGROUNDS, OUTPUT_PRESETS, MAX_MEDIA_BYTES, MAX_PROJECT_BYTES, hasPointer, captureBitrate, createProject, parseProject, clamp, cropAt, frameRect, sameSource, formatTime, zoomAt } from './model.mjs';
import { paintDemo, render } from './render.mjs';
import { webmType, openVideo, closeVideo, seekVideo, download } from './media.mjs';

const $ = id => document.getElementById(id);
const desktop = window.studioDesktop;
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
  desktop?.setActivity(kind);
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
  const output = OUTPUT_PRESETS[project.output.resolution];
  if (canvas.width !== output.width || canvas.height !== output.height) { canvas.width = output.width; canvas.height = output.height; }
  $('output-resolution').value = project.output.resolution;
  $('output-badge').textContent = `16:9 · ${output.label}`;
  $('export-format').textContent = `WebM · ${output.width} × ${output.height} · 30fps · 无音轨`;
  const frame = frameRect(project.source, project.frame, output.width, output.height);
  const zoomScale = project.zoom.enabled && project.zoom.end > project.trim.start && project.zoom.start < project.trim.end ? project.zoom.scale : 1;
  const upscale = frame.width * zoomScale > project.source.width * 1.01 || frame.height * zoomScale > project.source.height * 1.01;
  $('resolution-hint').textContent = `原片 ${project.source.width} × ${project.source.height}。${upscale ? '当前画面或缩放区间会放大输出，清晰度受原片限制。' : '当前画面可由原片分辨率覆盖。'}`;
  for (const [id, value] of Object.entries({ padding: project.frame.padding, radius: project.frame.radius, 'zoom-scale': project.zoom.scale, 'zoom-start': project.zoom.start, 'zoom-end': project.zoom.end, 'focus-x': project.zoom.x, 'focus-y': project.zoom.y, 'trim-start': project.trim.start, 'trim-end': project.trim.end })) $(id).value = Math.round(value * 1000) / 1000;
  $('zoom-enabled').checked = project.zoom.enabled;
  const following = project.zoom.mode === 'follow', tracked = hasPointer(project.pointer);
  $('zoom-mode').value = project.zoom.mode;
  $('follow-option').disabled = !tracked;
  $('manual-focus').hidden = following; $('follow-controls').hidden = !following;
  $('follow-smoothing').value = project.zoom.smoothing;
  $('smoothing-value').textContent = `${Math.round(project.zoom.smoothing * 1000)} ms`;
  $('pointer-hint').textContent = tracked ? '此素材含鼠标轨迹。保存原片和参数，可保留跟随效果。' : desktop ? '此素材没有鼠标轨迹。用桌面版新录屏后即可选择跟随。' : '此素材没有鼠标轨迹。请用桌面版录屏，并导入原片和参数。';
  $('zoom-band').textContent = following ? '跟随鼠标' : '固定焦点';
  $('timeline-hint').textContent = following ? '拖动进度条浏览 · 镜头按录制轨迹跟随鼠标' : '拖动进度条浏览 · 点击预览设置焦点';
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
$('zoom-mode').addEventListener('change', event => edit('zoom', 'mode', event.target.value));
$('follow-smoothing').addEventListener('input', event => edit('zoom', 'smoothing', event.target.valueAsNumber));
$('output-resolution').replaceChildren(...Object.entries(OUTPUT_PRESETS).map(([value, preset]) => new Option(`${preset.label} · ${preset.width} × ${preset.height}`, value)));
$('output-resolution').addEventListener('change', event => edit('output', 'resolution', event.target.value));
document.querySelectorAll('[data-background]').forEach(button => button.addEventListener('click', () => { if (Object.hasOwn(BACKGROUNDS, button.dataset.background)) edit('frame', 'background', button.dataset.background); }));
canvas.addEventListener('click', event => {
  if (busy) return;
  if (project.zoom.mode === 'follow') { status('当前按录制轨迹跟随鼠标；如需点击选焦点，请将缩放方式切换为固定焦点'); return; }
  const bounds = canvas.getBoundingClientRect();
  const px = (event.clientX - bounds.left) * canvas.width / bounds.width, py = (event.clientY - bounds.top) * canvas.height / bounds.height;
  const r = frameRect(project.source, project.frame, canvas.width, canvas.height), crop = cropAt(project.source, project.zoom, time);
  if (px < r.x || px > r.x + r.width || py < r.y || py > r.y + r.height) return;
  project.zoom.x = clamp((crop.x + (px - r.x) / r.width * crop.width) / project.source.width, 0, 1);
  project.zoom.y = clamp((crop.y + (py - r.y) / r.height * crop.height) / project.source.height, 0, 1);
  syncControls(); status('已设置手动缩放焦点');
});
$('scrub').addEventListener('input', event => seek(Number(event.target.value)).catch(error => status(error.message, true)));
action('play', () => playing ? pause() : play());
action('restart', () => seek(project.trim.start));
action('trim-end-seek', () => seek(project.trim.end));
action('demo', () => { pause(); closeVideo(media); media = null; project = createProject(undefined, project.output.resolution); time = 0; syncControls(); status('已加载生成的示例动画'); });
action('import-video', () => $('video-input').click());
action('download-source', () => { if (media) download(media.file, media.file.name); });

function replaceMedia(next) {
  pause(); closeVideo(media); media = next; project = createProject(next.source, project.output.resolution); time = 0; syncControls();
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
    if (file.size > MAX_PROJECT_BYTES) throw new Error('参数文件超过 2 MiB 上限');
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
  download(blob, 'rea-studio-frame.png'); status(desktop ? '请选择 PNG 保存位置' : '当前帧已导出为 PNG');
});

action('record', async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('当前浏览器不支持屏幕捕获，请在 Chrome 或 Edge 中打开本地地址');
  const mimeType = webmType();
  pause(); lock('choosing'); status(desktop ? '请在弹出的窗口中选择录制来源，并点击开始录制' : '请在浏览器弹出的选择器中选择录制来源');
  let stream, interval, recorder, captureToken, pointerReady, pointerResult;
  try {
    if (desktop) captureToken = await desktop.prepareCapture();
    stream = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    if (desktop) { status('正在准备鼠标轨迹…'); pointerReady = await desktop.preparePointer(captureToken).catch(error => ({ available: false, message: error.message })); }
    const capture = stream.getVideoTracks()[0].getSettings();
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: captureBitrate(capture.width, capture.height) });
    const chunks = []; let bytes = 0; const started = performance.now();
    recording = { stream, recorder, stop: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => { if (event.data.size) { chunks.push(event.data); bytes += event.data.size; if (bytes >= MAX_MEDIA_BYTES) recording?.stop(); } });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
      recorder.addEventListener('error', () => reject(new Error('屏幕录制失败，请重试')), { once: true });
    });
    stream.getVideoTracks()[0].addEventListener('ended', () => recording?.stop(), { once: true });
    const captureEpoch = performance.timeOrigin + performance.now();
    recorder.start(500);
    if (pointerReady?.available) {
      try { await desktop.startPointer(captureToken, captureEpoch); }
      catch { pointerReady = { available: false, message: '鼠标轨迹未能开始，本次保留普通录屏' }; }
    }
    lock('recording');
    interval = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      status(`正在录屏 ${formatTime(elapsed)}${capture.width && capture.height ? ` · ${capture.width} × ${capture.height}` : ''} · ${pointerReady?.available ? '鼠标轨迹记录中' : pointerReady?.message || '点击结束录屏后进入编辑'}`);
      if (elapsed >= 120) recording?.stop();
    }, 300);
    const blob = await done; const elapsed = (performance.now() - started) / 1000;
    if (desktop) pointerResult = await desktop.stopPointer(captureToken).catch(() => null);
    clearInterval(interval); stream.getTracks().forEach(track => track.stop()); recording = null;
    if (!blob.size || elapsed < 0.1) throw new Error('录制时间太短，请重新录制');
    lock('loading'); status('正在整理录屏…');
    replaceMedia(await openVideo(new File([blob], `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type: mimeType }), elapsed));
    if (pointerResult?.samples.length) {
      const pointer = { kind: pointerResult.kind, samples: pointerResult.samples.filter(sample => sample.t <= project.source.duration) };
      if (hasPointer(pointer)) {
        project = parseProject({ ...project, pointer, zoom: { ...project.zoom, mode: 'follow', start: 0, end: project.source.duration } });
        syncControls();
      }
    }
    const note = bytes >= MAX_MEDIA_BYTES ? '达到缓存上限，已自动结束并保留原片' : pointerResult?.warning || (project.zoom.mode === 'follow' ? '已启用跟随鼠标 · 请保存原片和参数以保留轨迹' : pointerReady?.message || (desktop ? '未采到画面内的鼠标轨迹，可使用固定焦点缩放' : '请保存原片，随后可以裁剪和导出'));
    status(`录屏已载入 · ${note}`);
  } catch (error) {
    const outcome = desktop && captureToken ? await desktop.captureOutcome(captureToken).catch(() => null) : null;
    const cancelled = outcome?.state === 'cancelled' || error.name === 'NotAllowedError';
    status(outcome?.state === 'failed' ? outcome.message : cancelled ? '已取消屏幕选择，或未获录屏权限' : error.message, !cancelled);
  } finally {
    clearInterval(interval); if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); recording = null;
    if (desktop && captureToken) await desktop.stopPointer(captureToken).catch(() => {});
    lock(null);
  }
});
action('stop-record', () => recording?.stop());

action('export-video', async () => {
  if (project.trim.end - project.trim.start > 120) throw new Error('原型单次导出最长 2 分钟，请先缩短裁剪区间');
  const mimeType = webmType(); const previousTime = time;
  const output = OUTPUT_PRESETS[project.output.resolution];
  pause(); lock('exporting');
  let stream, recorder;
  try {
    await seek(project.trim.start); draw();
    if (document.hidden) throw new Error('请保持页面在前台后重新导出');
    stream = canvas.captureStream(30); recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: output.bitrate });
    exporter = { recorder, stream, cancelled: false, reason: '已取消导出' };
    const run = exporter, chunks = []; let bytes = 0;
    const done = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => {
        if (!event.data.size || run.cancelled) return;
        bytes += event.data.size;
        if (bytes > MAX_MEDIA_BYTES) { chunks.length = 0; cancelExport('导出超过 256 MiB 缓存上限，请缩短裁剪片段或降低分辨率后重试。'); }
        else chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: mimeType })), { once: true });
      recorder.addEventListener('error', () => reject(new Error('视频导出失败')), { once: true });
    });
    recorder.start(250);
    const [, blob] = await Promise.all([play(), done]);
    pause();
    if (run.cancelled) status(run.reason);
    else {
      if (!blob.size) throw new Error('导出的视频为空');
      download(blob, 'rea-studio-export.webm'); status(desktop ? '视频已生成 · 请选择 WebM 保存位置' : `WebM 已导出 · ${output.width} × ${output.height} · 无音轨`);
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
  if (event.code === 'Space' && !busy && !['INPUT', 'SELECT', 'BUTTON', 'SUMMARY'].includes(document.activeElement.tagName)) {
    event.preventDefault(); (playing ? Promise.resolve(pause()) : play()).catch(error => status(error.message, true));
  }
});
if (desktop) {
  document.querySelector('.badge').textContent = `桌面版 ${desktop.version}`;
  document.querySelector('.record-note').innerHTML = '选择屏幕或应用窗口<br>同步记录鼠标轨迹 · 无声 · 最长 2 分钟';
  document.querySelector('.library-foot p').innerHTML = '视频在本机处理。<br>关闭软件前请保存原片和参数。';
  desktop.onSaveResult(result => {
    if (result.state === 'completed') status(`已保存：${result.name}`);
    else if (result.state === 'cancelled') status('已取消保存 · 当前编辑内容仍保留');
    else status('文件保存失败，请重新保存', true);
  });
}
syncControls(); requestAnimationFrame(tick);
