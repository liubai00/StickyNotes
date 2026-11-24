'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// 便签页面能调用的全部接口；主进程根据发送消息的窗口判断是哪一张便签。
contextBridge.exposeInMainWorld('stickyNote', {
  load: () => ipcRenderer.invoke('note:load'),
  ready: () => ipcRenderer.send('note:ready'),
  setText: (text) => ipcRenderer.send('note:text', text),
  setPinned: (pinned) => ipcRenderer.send('note:pin', pinned),
  create: () => ipcRenderer.send('note:new'),
  remove: () => ipcRenderer.send('note:delete'),
});
