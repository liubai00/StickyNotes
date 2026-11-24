# 便签

一个简单的桌面便签：每张便签是一个半透明的小窗口，只记文字，输入即自动保存。

## 下载（Windows）

**[StickyNotes-Portable-1.1.0.exe](https://github.com/liubai00/StickyNotes/raw/main/download/StickyNotes-Portable-1.1.0.exe)**：便携版，下载后双击即可运行，不用安装。

程序没有数字签名，第一次运行时 Windows 可能提示“Windows 已保护你的电脑”，点“更多信息” → “仍要运行”即可。

## 使用

按钮平时隐藏，鼠标移到便签上才会出现。

| 操作 | 方法 |
| --- | --- |
| 新建便签 | 顶栏左侧 **＋**，或 `Ctrl+N`（macOS 为 `⌘N`），或托盘菜单「新建便签」 |
| 移动 | 拖动顶栏 |
| 调整大小 | 拖动窗口边缘 |
| 置顶 | 顶栏 📌 按钮，再点一次取消 |
| 删除 | 顶栏 🗑 按钮；有内容的便签会先确认 |
| 找回便签 | 点击托盘图标，或再次打开程序 |
| 退出 | 托盘菜单「退出」 |

- 内容、位置、大小、置顶状态都会自动保存，下次打开原样恢复。
- 只能运行一个实例，再次双击程序会把所有便签带回前台。
- Windows / macOS 打包版的托盘菜单里可以打开「开机自动启动」。

## 数据保存在哪里

所有便签都存在一个 `notes.json` 文件里：

- Windows：`%APPDATA%\sticky-notes\notes.json`
- macOS：`~/Library/Application Support/sticky-notes/notes.json`
- Linux：`~/.config/sticky-notes/notes.json`

想换个位置（比如放进同步盘），启动前设置环境变量 `STICKY_NOTES_DATA_DIR` 指向那个文件夹即可。
如果数据文件损坏，程序会把它另存为 `notes.json.<时间戳>.bak`，然后从空白开始，原内容不会被覆盖。

## 从源码运行 / 打包

需要 Node.js 20 或更新版本。

```bash
npm install
npm start          # 直接运行
npm run dist       # 打包当前系统的安装包，输出到 dist/
```

在 Windows 上 `npm run dist` 会生成安装版和便携版 exe；macOS 生成 dmg；Linux 生成 AppImage。

## 文件结构

```
src/main.js      主进程：窗口管理、读写数据、托盘
src/preload.js   给便签页面开放的接口
src/note.html    便签界面
src/note.css     界面样式；开头的 --paper 决定底色和透明度
src/note.js
assets/icon.png  图标（由 icon.svg 生成）
```
