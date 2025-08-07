const { createClient } = require('webdav');
const crypto = require('crypto');
const config = require('./config');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

/**
 * 加密算法和密钥配置
 */
const algorithm = config.encryption.algorithm;
const key = crypto.scryptSync(config.encryption.secret, config.encryption.salt, 32);

/**
 * WebDAV客户端实例
 */
const client = createClient(
  config.webdav.url,
  { 
    username: config.webdav.username, 
    password: config.webdav.password 
  }
);

/**
 * DOM元素引用
 */
// 登录页面元素
const loginContainer = document.getElementById('login-container');
const userList = document.getElementById('user-list');
const loginButton = document.getElementById('login-button');
const registerButton = document.getElementById('register-button');

// 注册页面元素
const registerContainer = document.getElementById('register-container');
const registerName = document.getElementById('register-name');
const registerSubmit = document.getElementById('register-submit');
const registerCancel = document.getElementById('register-cancel');

// 聊天页面元素
const chatPage = document.getElementById('chat-page');
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const attachButton = document.getElementById('attach-button');
const fileInput = document.getElementById('file-input');

// 当前登录用户信息
let currentUser = null;

/**
 * 错误处理函数
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文
 */
function handleError(error, context) {
  console.error(`错误 [${context}]:`, error);
  addMessage(`❌ 错误: ${context}`, false);
}

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {Object} 包含IV和加密内容的对象
 */
function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return { iv: iv.toString('base64'), content: encrypted };
  } catch (error) {
    handleError(error, '加密失败');
    throw error;
  }
}

/**
 * 解密文本
 * @param {string} iv - 初始化向量
 * @param {string} content - 加密内容
 * @returns {string} 解密后的文本
 */
function decrypt(iv, content) {
  try {
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'base64'));
    let decrypted = decipher.update(content, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    handleError(error, '解密失败');
    throw error;
  }
}

/**
 * 添加消息到聊天界面
 * @param {string} text - 消息文本
 * @param {boolean} isOwn - 是否为自己的消息
 * @param {boolean} isFile - 是否为文件消息
 */
function addMessage(text, isOwn = false, isFile = false) {
  try {
    const div = document.createElement('div');
    div.className = `message ${isFile ? 'file-message' : ''} ${isOwn ? 'sent' : 'received'}`;
    div.textContent = text;
    div.style.margin = '5px 0';
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    handleError(error, '添加消息失败');
  }
}

/**
 * 初始化WebDAV目录和上传数据库
 * @returns {Promise<void>}
 */
async function initWebDAVFoldersAndDB() {
  try {
    // 测试WebDAV连接
    await client.getDirectoryContents('/');
    console.log('WebDAV连接成功!');
  } catch (error) {
    handleError(error, 'WebDAV连接测试失败');
    throw error;
  }
  try {
    // 检查并创建必要的目录
    const directories = [config.paths.messages, config.paths.files, config.paths.users];
    
    for (const dir of directories) {
      try {
        await client.getDirectoryContents(dir);
        console.log(`目录已存在: ${dir}`);
      } catch (e) {
        if (e.response && e.response.status === 404) {
          await client.createDirectory(dir);
          console.log(`创建目录: ${dir}`);
        } else {
          throw e;
        }
      }
    }
    
    // 上传本地数据库文件到users目录
    const dbPath = 'init/MySQLiteDB.db';
    // 检查init目录是否存在，如果不存在则创建
    const initDir = 'init';
    if (!fs.existsSync(initDir)) {
      fs.mkdirSync(initDir);
      console.log('创建本地init目录');
    }
    const dbFileName = `${config.paths.users}/MySQLiteDB.db`;
    
    // 检查本地数据库文件是否存在
    if (!fs.existsSync(dbPath)) {
      console.error('本地数据库文件不存在:', dbPath);
      return;
    }
    
    // 仅在WebDAV上没有数据库时上传
    let needUpload = false;
    try {
      await client.stat(dbFileName);
      console.log('WebDAV上数据库已存在');
    } catch (e) {
      if (e.response && e.response.status === 404) {
        needUpload = true;
        console.log('WebDAV上数据库不存在，需要上传');
      } else {
        throw e;
      }
    }
    if (needUpload) {
      // 读取本地数据库文件
      const dbBuffer = fs.readFileSync(dbPath);
      await client.putFileContents(dbFileName, dbBuffer, { overwrite: false });
      console.log('数据库上传成功');
    }
  } catch (error) {
    handleError(error, 'WebDAV初始化失败');
  }
}

/**
 * 从WebDAV读取数据库并获取用户信息
 */
async function fetchUsersFromWebDAV() {
  try {
    console.log('开始从WebDAV获取用户数据...');
    console.log('WebDAV路径:', config.paths.users);
    const dbFileName = `${config.paths.users}/MySQLiteDB.db`;
    console.log('数据库文件路径:', dbFileName);
    
    // 检查数据库文件是否存在
    try {
      await client.stat(dbFileName);
      console.log('WebDAV上数据库文件存在');
    } catch (e) {
      console.error('WebDAV上数据库文件不存在:', e.message);
      return [];
    }
    
    const content = await client.getFileContents(dbFileName, { format: 'buffer' });
    console.log('成功获取数据库文件内容, 大小:', content.length, '字节');
    
    // 将Buffer写入临时文件
    const tempFilename = 'temp_db.db';
    fs.writeFileSync(tempFilename, content);
    console.log('临时数据库文件已创建:', tempFilename);

    // 连接到临时数据库
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(tempFilename, (err) => {
        if (err) {
          handleError(err, '连接到临时数据库失败');
          reject(err);
          return;
        }
        console.log('连接到临时数据库成功');

        // 先检查表是否存在
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
          if (err) {
            handleError(err, '检查表是否存在失败');
            db.close();
            fs.unlinkSync(tempFilename);
            reject(err);
            return;
          }
          
          if (!row) {
            console.error('数据库中不存在users表');
            db.close();
            fs.unlinkSync(tempFilename);
            resolve([]);
            return;
          }
          
          // 修改查询，确保使用正确的表名 'users'
          db.all("SELECT id, name FROM users", [], (err, rows) => {
            if (err) {
              handleError(err, '查询用户数据失败');
              db.close();
              fs.unlinkSync(tempFilename); // 删除临时文件
              reject(err);
              return;
            }

            console.log('获取到的用户数据:', rows);
            db.close((err) => {
              if (err) {
                handleError(err, '关闭临时数据库失败');
              }
              fs.unlinkSync(tempFilename); // 删除临时文件
              console.log('临时数据库已关闭并删除');
            });
            resolve(rows);
          });
        });
      });
    });
  } catch (error) {
    handleError(error, '从WebDAV读取数据库失败');
    return [];
  }
}

/**
 * 注册新用户
 * @param {string} username - 用户名
 * @returns {Promise<boolean>} 是否注册成功
 */
async function registerUser(username) {
  if (!username || username.trim() === '') {
    alert('用户名不能为空');
    return false;
  }
  
  try {
    const dbFileName = `${config.paths.users}/MySQLiteDB.db`;
    const content = await client.getFileContents(dbFileName, { format: 'buffer' });
    // 将Buffer写入临时文件
    const tempFilename = 'temp_db.db';
    fs.writeFileSync(tempFilename, content);

    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(tempFilename, (err) => {
        if (err) {
          handleError(err, '连接到临时数据库失败');
          reject(err);
          return;
        }

        // 检查用户名是否已存在
        db.get("SELECT id FROM users WHERE name = ?", [username], (err, row) => {
          if (err) {
            handleError(err, '查询用户数据失败');
            db.close();
            fs.unlinkSync(tempFilename);
            reject(err);
            return;
          }

          if (row) {
            alert('用户名已存在');
            db.close();
            fs.unlinkSync(tempFilename);
            resolve(false);
            return;
          }

          // 插入新用户
          db.run("INSERT INTO users (name) VALUES (?)", [username], async function(err) {
            if (err) {
              handleError(err, '创建用户失败');
              db.close();
              fs.unlinkSync(tempFilename);
              reject(err);
              return;
            }

            const userId = this.lastID;
            console.log(`创建用户成功，ID: ${userId}`);

            // 关闭数据库并上传回WebDAV
            db.close(async (err) => {
              if (err) {
                handleError(err, '关闭临时数据库失败');
                reject(err);
                return;
              }

              try {
                // 读取更新后的数据库文件
                const updatedDbBuffer = fs.readFileSync(tempFilename);
                // 上传到WebDAV
                await client.putFileContents(dbFileName, updatedDbBuffer, { overwrite: true });
                console.log('更新后的数据库上传成功');
                fs.unlinkSync(tempFilename); // 删除临时文件
                resolve(true);
              } catch (error) {
                handleError(error, '上传更新后的数据库失败');
                fs.unlinkSync(tempFilename); // 删除临时文件
                reject(error);
              }
            });
          });
        });
      });
    });
  } catch (error) {
    handleError(error, '注册用户失败');
    return false;
  }
}

/**
 * 显示用户列表
 * @param {Array} users - 用户数组
 */
function displayUserList(users) {
  // 清空用户列表
  userList.innerHTML = '';
  
  // 添加用户到列表
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.name;
    li.dataset.userId = user.id;
    li.addEventListener('click', () => {
      // 移除其他选中项
      document.querySelectorAll('#user-list li').forEach(item => {
        item.classList.remove('selected');
      });
      // 选中当前项
      li.classList.add('selected');
      // 启用登录按钮
      loginButton.disabled = false;
      // 保存选中的用户
      currentUser = user;
    });
    userList.appendChild(li);
  });
}

/**
 * 初始化聊天页面
 */
function initChatPage() {
  // 隐藏登录页面，显示聊天页面
  loginContainer.classList.add('hidden');
  registerContainer.classList.add('hidden');
  chatPage.classList.remove('hidden');
  
  // 显示欢迎消息
  addMessage(`欢迎, ${currentUser.name}!`, false);
  
  // 初始化聊天相关功能
  initChatFeatures();
}

/**
 * 初始化聊天功能
 */
function initChatFeatures() {
  // 文件上传处理
  attachButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const fileBuffer = await file.arrayBuffer();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(Buffer.from(fileBuffer));
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      const fileName = `${config.paths.files}/${crypto.randomUUID()}`;
      await client.putFileContents(fileName, encrypted, { overwrite: false });

      const msgData = {
        from: currentUser.id,
        fromName: currentUser.name,
        time: Date.now(),
        type: 'file',
        iv: iv.toString('base64'),
        content: fileName,
        originalName: file.name
      };

      await client.putFileContents(
        `${config.paths.messages}/msg_${crypto.randomUUID()}.json`,
        JSON.stringify(msgData),
        { overwrite: false }
      );

      addMessage(`📎 ${file.name}`, true, true);
      e.target.value = '';
    } catch (error) {
      handleError(error, '文件上传失败');
      e.target.value = '';
    }
  });

  // 发送消息处理
  sendButton.addEventListener('click', async () => {
    const message = messageInput.value.trim();
    if (!message) return;

    try {
      const encrypted = encrypt(message);
      const msgData = {
        from: currentUser.id,
        fromName: currentUser.name,
        time: Date.now(),
        type: 'text',
        iv: encrypted.iv,
        content: encrypted.content
      };

      await client.putFileContents(
        `${config.paths.messages}/msg_${crypto.randomUUID()}.json`,
        JSON.stringify(msgData),
        { overwrite: false }
      );

      addMessage(message, true);
      messageInput.value = '';
    } catch (error) {
      handleError(error, '消息发送失败');
    }
  });

  // 轮询新消息
  setInterval(async () => {
    try {
      const files = await client.getDirectoryContents(config.paths.messages);
      files.forEach(async file => {
        if (file.type === 'file' && file.basename.endsWith('.json')) {
          try {
            const content = await client.getFileContents(`${config.paths.messages}/${file.basename}`);
            const msg = JSON.parse(content.toString());
            
            // 不显示自己发送的消息（已在发送时显示）
            if (msg.from === currentUser.id) return;
            
            if (msg.type === 'text') {
              try {
                const decrypted = decrypt(msg.iv, msg.content);
                addMessage(`${msg.fromName}: ${decrypted}`);
              } catch (error) {
                handleError(error, '消息解密失败');
              }
            } else if (msg.type === 'file') {
              const fileDiv = document.createElement('div');
              fileDiv.className = 'message file-message received';
              const fileLink = document.createElement('a');
              fileLink.href = '#';
              fileLink.textContent = `📎 ${msg.originalName} (from ${msg.fromName})`;
              fileLink.addEventListener('click', async () => {
                try {
                  const encryptedContent = await client.getFileContents(msg.content);
                  const iv = Buffer.from(msg.iv, 'base64');
                  const decipher = crypto.createDecipheriv(algorithm, key, iv);
                  let decrypted = decipher.update(Buffer.from(encryptedContent));
                  decrypted = Buffer.concat([decrypted, decipher.final()]);
                  
                  const blob = new Blob([decrypted], { type: 'application/octet-stream' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = msg.originalName;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (error) {
                  handleError(error, '文件下载失败');
                }
              });
              fileDiv.appendChild(fileLink);
              chatContainer.appendChild(fileDiv);
              chatContainer.scrollTop = chatContainer.scrollHeight;
            }
          } catch (error) {
            handleError(error, '消息处理失败');
          }
        });
      } catch (error) {
        handleError(error, '轮询消息失败');
      }
    }, config.app.pollInterval);
  }
}

// 初始化应用
async function initApp() {
  try {
    console.log('开始初始化应用...');
    // 初始化WebDAV目录和数据库
    await initWebDAVFoldersAndDB();
    
    console.log('开始获取用户列表...');
    // 获取用户列表
    const users = await fetchUsersFromWebDAV();
    console.log('用户列表获取完成:', users);
    displayUserList(users);
    
    // 登录按钮点击事件
    loginButton.addEventListener('click', () => {
      if (currentUser) {
        initChatPage();
      }
    });
    
    // 注册按钮点击事件
    registerButton.addEventListener('click', () => {
      loginContainer.classList.add('hidden');
      registerContainer.classList.remove('hidden');
    });
    
    // 注册提交按钮点击事件
    registerSubmit.addEventListener('click', async () => {
      const username = registerName.value.trim();
      const success = await registerUser(username);
      if (success) {
        // 重新获取用户列表
        const users = await fetchUsersFromWebDAV();
        displayUserList(users);
        // 返回登录页面
        registerContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
        // 清空注册表单
        registerName.value = '';
      }
    });
    
    // 注册取消按钮点击事件
    registerCancel.addEventListener('click', () => {
      registerContainer.classList.add('hidden');
      loginContainer.classList.remove('hidden');
      // 清空注册表单
      registerName.value = '';
    });
    
  } catch (error) {
    handleError(error, '应用初始化失败');
  }
}

// 启动应用
initApp();