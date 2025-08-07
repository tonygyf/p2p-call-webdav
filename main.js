const { app, BrowserWindow } = require('electron');
const config = require('./config');

/**
 * 创建主窗口
 * @description 创建并配置Electron主窗口
 */
function createWindow() {
  const win = new BrowserWindow({
    width: config.app.windowWidth,
    height: config.app.windowHeight,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'WebDAV P2P Chat',
    icon: null, // 可以添加应用图标
    show: false // 先隐藏窗口，加载完成后再显示
  });

  // 加载HTML文件
  win.loadFile('index.html');

  // 窗口准备好后显示
  win.once('ready-to-show', () => {
    win.show();
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }

  // 处理窗口关闭事件
  win.on('closed', () => {
    // 在macOS上，即使所有窗口都关闭了，应用通常仍然保持活跃状态
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();

  // 在macOS上，当点击dock图标并且没有其他窗口打开时，
  // 通常会在应用程序中重新创建一个窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都关闭时退出应用
app.on('window-all-closed', () => {
  // 在macOS上，即使所有窗口都关闭了，应用通常仍然保持活跃状态
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未处理的Promise拒绝:', reason);
});