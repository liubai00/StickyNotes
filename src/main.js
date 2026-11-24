'use strict';

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_SIZE = { width: 280, height: 280 };
const MIN_SIZE = { width: 200, height: 140 };
const ICON_PATH = path.join(__dirname, '..', 'assets', 'icon.png');

// 数据目录固定用英文名；也可以用环境变量指到别处（比如同步盘）。
app.setPath(
  'userData',
  process.env.STICKY_NOTES_DATA_DIR || path.join(app.getPath('appData'), 'sticky-notes'),
);
const DATA_FILE = path.join(app.getPath('userData'), 'notes.json');

// 便携版 exe 实际运行在临时目录里，开机自启要登记原始 exe 的路径。
const LOGIN_ITEM = process.env.PORTABLE_EXECUTABLE_FILE
  ? { path: process.env.PORTABLE_EXECUTABLE_FILE }
  : {};

/** @type {{id: string, text: string, pinned: boolean, bounds: Electron.Rectangle}[]} */
let notes = [];
/** 便签 id -> 窗口 */
const windows = new Map();
let tray = null;
let saveTimer = null;
let saveErrorShown = false;

// ---------- 数据读写 ----------

function loadNotes() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('读取便签失败：', err);
    return [];
  }
  try {
    return JSON.parse(raw)
      .notes.filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string')
      .map((n) => ({
        id: n.id,
        text: n.text,
        pinned: n.pinned === true,
        bounds: placeOnScreen(n.bounds),
      }));
  } catch (err) {
    // 文件损坏：先留一份备份，避免之后的保存把原内容覆盖掉。
    console.error('便签文件损坏，已备份：', err);
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.${Date.now()}.bak`);
    } catch {}
    return [];
  }
}

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    // 先写临时文件再改名，断电或崩溃时不会留下写了一半的文件。
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, notes }, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.error('保存便签失败：', err);
    if (!saveErrorShown) {
      saveErrorShown = true;
      dialog.showErrorBox('便签保存失败', `无法写入 ${DATA_FILE}\n${err.message}`);
    }
  }
}

function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 300);
}

function flushSave() {
  if (saveTimer) saveNow();
}

// ---------- 窗口 ----------

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/** 把保存的位置修正到当前可见的屏幕范围内（比如拔掉外接显示器之后）。 */
function placeOnScreen(saved) {
  const b = saved || {};
  const width = Math.max(MIN_SIZE.width, Math.round(b.width) || DEFAULT_SIZE.width);
  const height = Math.max(MIN_SIZE.height, Math.round(b.height) || DEFAULT_SIZE.height);

  if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    // 没有位置信息：放在主屏右上角，多张便签依次错开。
    const area = screen.getPrimaryDisplay().workArea;
    const step = (windows.size % 8) * 32;
    return { x: area.x + area.width - width - 40 - step, y: area.y + 40 + step, width, height };
  }

  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
  return {
    x: clamp(x, area.x - width + 80, area.x + area.width - 80),
    y: clamp(y, area.y, area.y + area.height - 60),
    width,
    height,
  };
}

function openWindow(note) {
  const existing = windows.get(note.id);
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    return;
  }

  const win = new BrowserWindow({
    ...placeOnScreen(note.bounds),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    frame: false,
    transparent: true, // 半透明效果由页面背景色决定，见 note.css
    backgroundColor: '#00000000',
    show: false, // 等页面填好内容和颜色后再显示，见 note:ready
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: note.pinned,
    title: '便签',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false,
    },
  });
  windows.set(note.id, win);

  const rememberBounds = () => {
    note.bounds = win.getNormalBounds();
    scheduleSave();
  };
  win.on('move', rememberBounds);
  win.on('resize', rememberBounds);
  win.on('closed', () => {
    windows.delete(note.id);
    flushSave();
  });

  // 便签窗口只显示本地页面，禁止跳转和弹出新窗口（例如把文件拖进窗口时）。
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('context-menu', (_event, params) => showEditMenu(win, params));

  win.loadFile(path.join(__dirname, 'note.html'));
}

function showEditMenu(win, params) {
  if (!params.isEditable) return;
  const can = params.editFlags;
  Menu.buildFromTemplate([
    { label: '撤销', role: 'undo', enabled: can.canUndo },
    { label: '重做', role: 'redo', enabled: can.canRedo },
    { type: 'separator' },
    { label: '剪切', role: 'cut', enabled: can.canCut },
    { label: '复制', role: 'copy', enabled: can.canCopy },
    { label: '粘贴', role: 'paste', enabled: can.canPaste },
    { label: '全选', role: 'selectAll', enabled: can.canSelectAll },
  ]).popup({ window: win });
}

// ---------- 便签操作 ----------

/** 新建便签；从已有便签上新建时，出现在它旁边。 */
function createNote(from) {
  const note = {
    id: randomUUID(),
    text: '',
    pinned: false,
    bounds: placeOnScreen(
      from && { ...DEFAULT_SIZE, x: from.bounds.x + 32, y: from.bounds.y + 32 },
    ),
  };
  notes.push(note);
  scheduleSave();
  openWindow(note);
}

async function deleteNote(note) {
  const win = windows.get(note.id);
  if (note.text.trim()) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['删除', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      message: '删除这张便签？',
      detail: '删除后无法恢复。',
    });
    if (response !== 0) return;
  }
  notes = notes.filter((n) => n !== note);
  saveNow();
  if (win && !win.isDestroyed()) win.close();
}

function showAllNotes() {
  if (notes.length === 0) {
    createNote();
    return;
  }
  notes.forEach(openWindow);
}

// ---------- 与便签页面通信 ----------

function noteOf(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return notes.find((note) => windows.get(note.id) === win);
}

ipcMain.handle('note:load', (event) => {
  const note = noteOf(event);
  return note && { text: note.text, pinned: note.pinned };
});

ipcMain.on('note:ready', (event) => {
  const note = noteOf(event);
  if (note) windows.get(note.id).show();
});

ipcMain.on('note:text', (event, text) => {
  const note = noteOf(event);
  if (!note || typeof text !== 'string') return;
  note.text = text;
  scheduleSave();
});

ipcMain.on('note:pin', (event, pinned) => {
  const note = noteOf(event);
  if (!note) return;
  note.pinned = pinned === true;
  windows.get(note.id).setAlwaysOnTop(note.pinned);
  scheduleSave();
});

ipcMain.on('note:new', (event) => createNote(noteOf(event)));

ipcMain.on('note:delete', (event) => {
  const note = noteOf(event);
  if (note) deleteNote(note);
});

// ---------- 托盘与菜单 ----------

function createTray() {
  const source = nativeImage.createFromPath(ICON_PATH);
  const icon = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) {
    const size = 16 * scaleFactor;
    icon.addRepresentation({
      scaleFactor,
      dataURL: source.resize({ width: size, height: size, quality: 'best' }).toDataURL(),
    });
  }

  const items = [
    { label: '新建便签', click: () => createNote() },
    { label: '显示全部便签', click: showAllNotes },
  ];
  // 开机自启只在打包后的 Windows / macOS 版本里可用。
  if (app.isPackaged && process.platform !== 'linux') {
    items.push(
      { type: 'separator' },
      {
        label: '开机自动启动',
        type: 'checkbox',
        checked: app.getLoginItemSettings(LOGIN_ITEM).openAtLogin,
        click: (item) => app.setLoginItemSettings({ ...LOGIN_ITEM, openAtLogin: item.checked }),
      },
    );
  }
  items.push({ type: 'separator' }, { label: '退出', role: 'quit' });

  tray = new Tray(icon);
  tray.setToolTip('便签');
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.on('click', showAllNotes);
}

function setAppMenu() {
  if (process.platform === 'darwin') {
    // macOS 上复制、粘贴等快捷键依赖应用菜单。
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

// ---------- 启动 ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('before-quit', flushSave);
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.whenReady().then(() => {
    setAppMenu();
    notes = loadNotes();
    createTray();
    showAllNotes();

    // 再次启动程序，或在 macOS 上点击程序坞图标：把所有便签带回前台。
    app.on('second-instance', showAllNotes);
    app.on('activate', showAllNotes);
  });
}
