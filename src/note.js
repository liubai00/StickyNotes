'use strict';

const api = window.stickyNote;
const textarea = document.getElementById('text');
const pinButton = document.getElementById('pin');

function setPinned(pinned) {
  pinButton.setAttribute('aria-pressed', String(pinned));
  pinButton.title = pinned ? '取消置顶' : '置顶';
}

// 先把内容填好，再通知主进程显示窗口，避免先闪一下空白便签。
api.load().then((note) => {
  textarea.value = note.text;
  textarea.setSelectionRange(note.text.length, note.text.length);
  setPinned(note.pinned);
  api.ready();
  textarea.focus();
});

// 每次输入都交给主进程，由它合并写盘；页面这边不留未保存的内容。
textarea.addEventListener('input', () => api.setText(textarea.value));

// Tab 输入缩进，而不是把焦点移到按钮上（Shift+Tab 仍可移出文本框）。
textarea.addEventListener('keydown', (event) => {
  const plainTab =
    event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
  if (plainTab && !event.isComposing) {
    event.preventDefault();
    document.execCommand('insertText', false, '\t'); // 这样插入可以被撤销
  }
});

document.getElementById('new').addEventListener('click', () => api.create());
document.getElementById('delete').addEventListener('click', () => api.remove());

pinButton.addEventListener('click', () => {
  const pinned = pinButton.getAttribute('aria-pressed') !== 'true';
  setPinned(pinned);
  api.setPinned(pinned);
  textarea.focus();
});

document.addEventListener('keydown', (event) => {
  const newNote =
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'n';
  if (newNote) {
    event.preventDefault();
    api.create();
  }
});
