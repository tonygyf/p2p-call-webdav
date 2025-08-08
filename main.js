const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto'); // For encryption/decryption if needed, or just for randomUUID
const { createClient } = require('webdav'); // For WebDAV interaction
const config = require('./config');

const localDbPath = path.join(app.getPath('userData'), 'call.db');
const initialDbPath = path.join('d:\\typer\\cursor project\\claude\\init', 'call.db');

let db = null; // Global database instance

// WebDAV客户端实例
const client = createClient(
  config.webdav.url,
  { 
    username: config.webdav.username, 
    password: config.webdav.password 
  }
);

/**
 * 错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 */
function handleError(error, context) {
  console.error(`错误 [${context}]:`, error);
  // Optionally send error to renderer process
  // BrowserWindow.getAllWindows().forEach(win => {
  //   win.webContents.send('app-error', `错误: ${context}`);
  // });
}

/**
 * 初始化本地数据库
 * @returns {Promise<sqlite3.Database>} 数据库实例
 */
async function initDatabase() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(localDbPath)) {
      console.log('本地数据库不存在，从init目录复制...');
      try {
        fs.copyFileSync(initialDbPath, localDbPath);
        console.log('本地数据库复制成功。');
      } catch (err) {
        handleError(err, '复制初始数据库失败');
        return reject(err);
      }
    }

    db = new sqlite3.Database(localDbPath, (err) => {
      if (err) {
        handleError(err, '连接到本地数据库失败');
        return reject(err);
      }
      console.log('连接到本地数据库成功。');
      resolve(db);
    });
  });
}

/**
 * 获取数据库实例
 * @returns {sqlite3.Database} 数据库实例
 */
function getDb() {
  if (!db) {
    throw new Error('数据库未初始化。');
  }
  return db;
}

/**
 * 同步数据库到WebDAV
 * @returns {Promise<void>}
 */
async function syncDbToWebDAV() {
  try {
    // 确保WebDAV目录存在
    const webdavRoot = 'claude_chat';
    const dbDir = `${webdavRoot}/database`;
    
    // 检查并创建根目录
    try {
      await client.stat(webdavRoot);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        await client.createDirectory(webdavRoot);
        console.log(`创建WebDAV根目录: ${webdavRoot}`);
      } else {
        throw e;
      }
    }
    
    // 检查并创建数据库目录
    try {
      await client.stat(dbDir);
    } catch (e) {
      if (e.response && e.response.status === 404) {
        await client.createDirectory(dbDir);
        console.log(`创建WebDAV数据库目录: ${dbDir}`);
      } else {
        throw e;
      }
    }
    
    // 上传数据库文件
    const dbFileName = `${dbDir}/call.db`;
    const dbBuffer = fs.readFileSync(localDbPath);
    await client.putFileContents(dbFileName, dbBuffer, { overwrite: true });
    console.log('数据库成功同步到WebDAV。');
  } catch (error) {
    handleError(error, '同步数据库到WebDAV失败');
    throw error;
  }
}

/**
 * 从WebDAV同步数据库
 * @returns {Promise<void>}
 */
async function syncDbFromWebDAV() {
  try {
    console.log('开始从WebDAV同步数据库...');
    
    // 检查WebDAV上的数据库文件是否存在
    const webdavRoot = 'claude_chat';
    const dbDir = `${webdavRoot}/${config.paths.database}`;
    const webdavDbPath = `${dbDir}/call.db`;
    
    try {
      // 检查并创建根目录
      try {
        await client.stat(webdavRoot);
      } catch (e) {
        if (e.response && e.response.status === 404) {
          await client.createDirectory(webdavRoot);
          console.log(`创建WebDAV根目录: ${webdavRoot}`);
        } else {
          throw e;
        }
      }
      
      // 检查并创建数据库目录
      try {
        await client.stat(dbDir);
      } catch (e) {
        if (e.response && e.response.status === 404) {
          await client.createDirectory(dbDir);
          console.log(`创建WebDAV数据库目录: ${dbDir}`);
        } else {
          throw e;
        }
      }
      
      // 检查数据库文件
      await client.stat(webdavDbPath);
      
      // 下载数据库文件
      let content = await client.getFileContents(webdavDbPath);
      
      // 确保content是Buffer
      if (!(content instanceof Buffer)) {
        content = Buffer.from(content);
      }
      
      // 备份当前数据库（如果存在）
      if (fs.existsSync(localDbPath)) {
        const backupPath = `${localDbPath}.backup-${Date.now()}`;
        fs.copyFileSync(localDbPath, backupPath);
        console.log(`本地数据库已备份到: ${backupPath}`);
      }
      
      // 写入下载的数据库文件
      fs.writeFileSync(localDbPath, content);
      console.log('从WebDAV同步数据库成功。');
    } catch (e) {
      if (e.response && e.response.status === 404) {
        console.log('WebDAV上不存在数据库文件，将上传本地数据库。');
        // 确保本地数据库存在
        if (!fs.existsSync(localDbPath)) {
          console.log('本地数据库不存在，从初始数据库复制...');
          fs.copyFileSync(initialDbPath, localDbPath);
          console.log('本地数据库复制成功。');
        }
        await syncDbToWebDAV();
      } else {
        throw e;
      }
    }
  } catch (error) {
    handleError(error, '从WebDAV同步数据库失败');
    throw error;
  }
}

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
  } else {
    // 非开发模式也打开开发者工具，方便调试
    win.webContents.openDevTools();
  }

  // 处理窗口关闭事件
  win.on('closed', () => {
    // 在macOS上，即使所有窗口都关闭了，应用通常仍然保持活跃状态
  });
}

// IPC处理程序
ipcMain.handle('get-users', async () => {
  try {
    const dbInstance = getDb();
    return new Promise((resolve, reject) => {
      dbInstance.all("SELECT id, username, nickname, avatar FROM users", [], (err, rows) => {
        if (err) {
          handleError(err, '查询用户数据失败 (IPC)');
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  } catch (error) {
    handleError(error, '获取用户失败 (IPC)');
    throw error;
  }
});

// 上传数据库到WebDAV
ipcMain.handle('upload-db-to-webdav', async (event, webdavPath) => {
  try {
    const dbBuffer = fs.readFileSync(localDbPath);
    await client.putFileContents(webdavPath, dbBuffer, { overwrite: true });
    console.log(`数据库成功上传到WebDAV路径: ${webdavPath}`);
    return { success: true };
  } catch (error) {
    handleError(error, '上传数据库到WebDAV失败');
    return { success: false, error: error.message };
  }
});

ipcMain.handle('register-user', async (event, username) => {
  try {
    const dbInstance = getDb();
    return new Promise((resolve, reject) => {
      // 检查用户名是否已存在
      dbInstance.get("SELECT id FROM users WHERE username = ?", [username], (err, row) => {
        if (err) {
          handleError(err, '查询用户数据失败 (注册IPC)');
          reject(err);
          return;
        }

        if (row) {
          resolve({ success: false, message: '用户名已存在' });
          return;
        }

        // 生成默认昵称和头像
        const nickname = username; // 默认昵称与用户名相同
        const avatar = null; // 默认头像为空

        // 插入新用户
        dbInstance.run(
          "INSERT INTO users (username, nickname, avatar, created_at) VALUES (?, ?, ?, datetime('now'))", 
          [username, nickname, avatar], 
          async function(err) {
            if (err) {
              handleError(err, '创建用户失败 (注册IPC)');
              reject(err);
              return;
            }
            console.log(`创建用户成功，ID: ${this.lastID}`);
            // 注册成功后同步数据库到WebDAV
            try {
              await syncDbToWebDAV();
              console.log('数据库同步到WebDAV成功');
            } catch (syncErr) {
              console.error('数据库同步到WebDAV失败:', syncErr);
              // 继续处理，不影响用户注册
            }
            resolve({ success: true, userId: this.lastID });
          }
        );
      });
    });
  } catch (error) {
    handleError(error, '注册用户失败 (IPC)');
    throw error;
  }
});

// 用户登录验证
ipcMain.handle('login-user', async (event, userId) => {
  try {
    const dbInstance = getDb();
    return new Promise((resolve, reject) => {
      // 查询用户信息
      dbInstance.get("SELECT id, username, nickname, avatar FROM users WHERE id = ?", [userId], (err, row) => {
        if (err) {
          handleError(err, '查询用户数据失败 (登录IPC)');
          reject(err);
          return;
        }

        if (!row) {
          resolve({ success: false, message: '用户不存在' });
          return;
        }

        // 更新最后登录时间
        dbInstance.run(
          "UPDATE users SET last_login = datetime('now') WHERE id = ?", 
          [userId], 
          async function(err) {
            if (err) {
              console.error('更新登录时间失败:', err);
              // 继续处理，不影响登录
            }
            
            // 同步数据库到WebDAV
            try {
              await syncDbToWebDAV();
            } catch (syncErr) {
              console.error('数据库同步到WebDAV失败:', syncErr);
              // 继续处理，不影响登录
            }
            
            resolve({ 
              success: true, 
              user: {
                id: row.id,
                username: row.username,
                nickname: row.nickname,
                avatar: row.avatar
              }
            });
          }
        );
      });
    });
  } catch (error) {
    handleError(error, '用户登录失败 (IPC)');
    throw error;
  }
});

// 获取聊天用户列表（排除当前用户）
ipcMain.handle('get-chat-users', async (event, currentUserId) => {
  try {
    const dbInstance = getDb();
    return new Promise((resolve, reject) => {
      dbInstance.all("SELECT id, username, nickname, avatar FROM users WHERE id != ?", [currentUserId], (err, rows) => {
        if (err) {
          handleError(err, '查询聊天用户数据失败 (IPC)');
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  } catch (error) {
    handleError(error, '获取聊天用户失败 (IPC)');
    throw error;
  }
});

/**
 * 关闭数据库连接
 */
function closeDb() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('关闭数据库失败:', err.message);
      } else {
        console.log('数据库连接已关闭。');
      }
    });
  }
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(async () => {
  try {
    await initDatabase();
    await syncDbFromWebDAV(); // Initial sync from WebDAV
    createWindow();
  } catch (error) {
    handleError(error, '应用启动失败');
    app.quit();
  }

  // 在macOS上，当点击dock图标并且没有其他窗口打开时，
  // 通常会在应用程序中重新创建一个窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 在应用退出前关闭数据库连接
app.on('before-quit', () => {
  closeDb();
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
