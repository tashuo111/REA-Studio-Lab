import { BACKGROUNDS, cropAt, frameRect } from './model.mjs';

export function paintDemo(canvas, time) {
  const c = canvas.getContext('2d');
  c.fillStyle = '#f5f6fa'; c.fillRect(0, 0, 1280, 720);
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, 220, 720);
  c.fillStyle = '#10272d'; c.font = 'bold 30px system-ui'; c.fillText('orbit', 46, 65);
  c.font = '17px system-ui';
  ['Overview', 'Projects', 'Analytics', 'Team', 'Settings'].forEach((label, index) => {
    if (!index) { c.fillStyle = '#e1f0eb'; c.beginPath(); c.roundRect(25, 111, 170, 44, 8); c.fill(); }
    c.fillStyle = !index ? '#217260' : '#84909b'; c.fillText(label, 46, 140 + index * 62);
  });
  c.fillStyle = '#1d2c3e'; c.font = 'bold 32px system-ui'; c.fillText('Your work, in focus.', 270, 75);
  c.fillStyle = '#8e99a7'; c.font = '16px system-ui'; c.fillText('A little progress, every day.', 270, 111);
  const labels = ['Active projects', 'Hours in focus', 'Tasks completed'];
  ['12', '86.4', '248'].forEach((value, index) => {
    const x = 270 + index * 320;
    c.fillStyle = '#fff'; c.beginPath(); c.roundRect(x, 153, 294, 124, 14); c.fill();
    c.fillStyle = '#87929d'; c.font = '15px system-ui'; c.fillText(labels[index], x + 24, 187);
    c.fillStyle = '#25364b'; c.font = 'bold 35px system-ui'; c.fillText(value, x + 24, 239);
    c.fillStyle = '#3b9c80'; c.font = '14px system-ui'; c.fillText('+12%', x + 200, 236);
  });
  c.fillStyle = '#fff'; c.beginPath(); c.roundRect(270, 307, 934, 345, 14); c.fill();
  c.fillStyle = '#36485d'; c.font = 'bold 18px system-ui'; c.fillText('Activity over time', 298, 347);
  for (let i = 0; i < 4; i++) { c.strokeStyle = '#edf0f5'; c.beginPath(); c.moveTo(300, 393 + i * 62); c.lineTo(1170, 393 + i * 62); c.stroke(); }
  const values = [70, 96, 82, 150, 124, 168, 151, 198, 187, 231, 219, 255];
  values.forEach((height, i) => {
    c.fillStyle = i === Math.floor(time * 0.8) % 12 ? '#48b99b' : '#cdebe2';
    c.beginPath(); c.roundRect(319 + i * 70, 609 - height * 0.8, 35, height * 0.8, 5); c.fill();
  });
  const x = 760 + 170 * Math.sin(time * 0.45), y = 440 + 45 * Math.cos(time * 0.8);
  c.save(); c.translate(x, y); c.fillStyle = '#1a293c'; c.strokeStyle = '#fff'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(5, 25); c.lineTo(11, 18); c.lineTo(19, 30); c.lineTo(24, 27); c.lineTo(16, 15); c.lineTo(26, 13); c.closePath(); c.fill(); c.stroke(); c.restore();
}

// One compositor owns preview and video/still export geometry.
export function render(canvas, source, project, time) {
  const c = canvas.getContext('2d');
  const colors = BACKGROUNDS[project.frame.background];
  const gradient = c.createLinearGradient(0, 0, canvas.width, canvas.height);
  colors.forEach((color, index) => gradient.addColorStop(index / 2, color));
  c.fillStyle = gradient; c.fillRect(0, 0, canvas.width, canvas.height);
  const r = frameRect(project.source, project.frame, canvas.width, canvas.height);
  const crop = cropAt(project.source, project.zoom, time);
  const unit = canvas.width / 1280, radius = project.frame.radius * unit;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.save(); c.shadowColor = '#00000055'; c.shadowBlur = 38 * unit; c.shadowOffsetY = 14 * unit; c.fillStyle = '#fff';
  c.beginPath(); c.roundRect(r.x, r.y, r.width, r.height, radius); c.fill(); c.restore();
  c.save(); c.beginPath(); c.roundRect(r.x, r.y, r.width, r.height, radius); c.clip();
  c.drawImage(source, crop.x, crop.y, crop.width, crop.height, r.x, r.y, r.width, r.height); c.restore();
}
