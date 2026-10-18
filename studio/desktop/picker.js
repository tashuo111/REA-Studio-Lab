const $ = id => document.getElementById(id);
let sources = [], kind = 'screen', selected = null;
function renderSources() {
  selected = null; $('confirm').disabled = true; $('selection').textContent = '尚未选择';
  document.querySelectorAll('[data-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.kind === kind)));
  const visible = sources.filter(source => source.kind === kind);
  $('message').textContent = visible.length ? '仅录制你选中的来源。请勿最小化被录制的窗口。' : '没有可录制的来源。请先打开目标窗口，再重新开始录屏。';
  $('sources').replaceChildren(...visible.map(source => {
    const button = document.createElement('button'); button.className = 'source'; button.dataset.sourceId = source.id; button.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img'); image.src = source.thumbnail; image.alt = '';
    const name = document.createElement('span'); name.textContent = source.name;
    button.append(image, name);
    button.addEventListener('click', () => {
      selected = source.id; $('confirm').disabled = false; $('selection').textContent = source.name;
      document.querySelectorAll('.source').forEach(card => card.setAttribute('aria-pressed', String(card === button)));
    });
    return button;
  }));
}
document.querySelectorAll('[data-kind]').forEach(button => button.addEventListener('click', () => { kind = button.dataset.kind; renderSources(); }));
$('cancel').addEventListener('click', () => window.capturePicker.cancel());
$('confirm').addEventListener('click', () => { if (selected) { $('confirm').disabled = true; window.capturePicker.select(selected); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.capturePicker.cancel(); });
window.capturePicker.sources().then(result => { sources = result; renderSources(); }).catch(() => { $('message').textContent = '无法读取录制来源，请取消后重试。'; });
