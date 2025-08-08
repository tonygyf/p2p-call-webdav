const { createClient } = require('webdav');
const crypto = require('crypto');
const { ipcRenderer } = require('electron'); // Import ipcRenderer
const config = require('./config');
const path = require('path');

// WebDAV根目录配置
const WEBDAV_ROOT = 'claude_chat'; // 应用专用根目录

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
 * WebDAV路径配置
 */
const webdavPaths = {
  root: WEBDAV_ROOT,
  database: `${WEBDAV_ROOT}/${config.paths.database}`,
  messages: `${WEBDAV_ROOT}/${config.paths.messages}`,
  files: `${WEBDAV_ROOT}/${config.paths.files}`,
  users: `${WEBDAV_ROOT}/${config.paths.users}`
};

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
 * 初始化WebDAV目录
 * @returns {Promise<void>}
 */
async function initWebDAVFolders() {
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
    const directories = [
      webdavPaths.root,
      webdavPaths.database,
      webdavPaths.messages,
      webdavPaths.files,
      webdavPaths.users
    ];
    
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
    
    // 检查数据库文件是否存在，不存在则上传
    const dbPath = `${webdavPaths.database}/call.db`;
    try {
      await client.stat(dbPath);
      console.log('数据库文件已存在');
    } catch (e) {
      if (e.response && e.response.status === 404) {
        // 通知主进程上传数据库文件
        const result = await ipcRenderer.invoke('upload-db-to-webdav', dbPath);
        if (result.success) {
          console.log('数据库文件上传成功');
        } else {
          console.error('数据库文件上传失败:', result.error);
        }
      } else {
        throw e;
      }
    }
  } catch (error) {
    handleError(error, 'WebDAV目录初始化失败');
  }
}

/**
 * 从主进程获取用户信息
 */
async function fetchUsers() {
  try {
    console.log('开始从主进程获取用户数据...');
    const users = await ipcRenderer.invoke('get-users');
    console.log('用户列表获取完成:', users);
    
    // 处理用户数据，确保显示名称
    return users.map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.nickname || user.username, // 使用昵称，如果没有则使用用户名
      avatar: user.avatar
    }));
  } catch (error) {
    handleError(error, '从主进程获取用户失败');
    return [];
  }
}

/**
 * 通过主进程注册新用户
 * @param {string} username - 用户名
 * @returns {Promise<boolean>} 是否注册成功
 */
async function registerUser(username) {
  if (!username || username.trim() === '') {
    alert('用户名不能为空');
    return false;
  }
  
  // 验证用户名格式
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,16}$/.test(username)) {
    alert('用户名只能包含字母、数字、下划线和中文，长度2-16个字符');
    return false;
  }
  
  try {
    const result = await ipcRenderer.invoke('register-user', username);
    if (result.success) {
      console.log(`用户注册成功，ID: ${result.userId}`);
      return true;
    } else {
      alert(result.message);
      return false;
    }
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
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    
    // 添加头像（如果有）
    if (user.avatar) {
      const avatarImg = document.createElement('img');
      avatarImg.src = user.avatar;
      avatarImg.className = 'user-avatar';
      avatarImg.alt = user.displayName;
      userDiv.appendChild(avatarImg);
    } else {
      // 创建默认头像（用户名首字母）
      const avatarPlaceholder = document.createElement('div');
      avatarPlaceholder.className = 'avatar-placeholder';
      avatarPlaceholder.textContent = user.displayName.charAt(0).toUpperCase();
      userDiv.appendChild(avatarPlaceholder);
    }
    
    // 添加用户名
    const nameSpan = document.createElement('span');
    nameSpan.textContent = user.displayName;
    nameSpan.className = 'user-name';
    userDiv.appendChild(nameSpan);
    
    li.appendChild(userDiv);
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
  addMessage(`欢迎, ${currentUser.displayName}!`, false);
  
  // 更新页面标题
  document.title = `WebDAV Chat - ${currentUser.displayName}`;
  
  // 初始化聊天相关功能
  initChatFeatures();
  
  // 加载聊天历史
  loadChatHistory();
}

/**
 * 加载聊天历史记录
 */
async function loadChatHistory() {
  try {
    // 清空聊天容器
    chatContainer.innerHTML = '';
    
    // 添加加载提示
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message system';
    loadingMsg.textContent = '正在加载聊天历史...';
    chatContainer.appendChild(loadingMsg);
    
    // 从WebDAV获取消息文件列表
    const files = await client.getDirectoryContents(webdavPaths.messages);
    
    // 过滤出JSON文件并按时间排序
    const messageFiles = files
      .filter(file => file.type === 'file' && file.basename.endsWith('.json'))
      .sort((a, b) => {
        // 尝试从文件名中提取时间戳
        const timeA = a.basename.match(/_(\d+)\./)?.[1] || a.lastmod;
        const timeB = b.basename.match(/_(\d+)\./)?.[1] || b.lastmod;
        return timeA - timeB;
      });
    
    // 移除加载提示
    chatContainer.removeChild(loadingMsg);
    
    // 如果没有消息，显示提示
    if (messageFiles.length === 0) {
      const noMsgDiv = document.createElement('div');
      noMsgDiv.className = 'message system';
      noMsgDiv.textContent = '没有聊天记录，开始发送消息吧！';
      chatContainer.appendChild(noMsgDiv);
      return;
    }
    
    // 限制加载的消息数量，避免过多消息导致性能问题
    const recentMessages = messageFiles.slice(-50); // 只加载最近的50条消息
    
    // 加载消息
    for (const file of recentMessages) {
      try {
        const content = await client.getFileContents(`${webdavPaths.messages}/${file.basename}`);
        const msg = JSON.parse(content.toString());
        
        // 显示消息
        if (msg.type === 'text') {
          try {
            const decrypted = decrypt(msg.iv, msg.content);
            const isOwn = msg.from === currentUser.id;
            addMessage(isOwn ? decrypted : `${msg.fromName}: ${decrypted}`, isOwn);
          } catch (error) {
            handleError(error, '消息解密失败');
          }
        } else if (msg.type === 'file') {
          displayFileMessage(msg);
        }
      } catch (error) {
        console.error(`加载消息 ${file.basename} 失败:`, error);
      }
    }
    
    // 滚动到底部
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (error) {
    handleError(error, '加载聊天历史失败');
    // 显示错误提示
    const errorMsg = document.createElement('div');
    errorMsg.className = 'message system error';
    errorMsg.textContent = '加载聊天历史失败，请检查网络连接';
    chatContainer.innerHTML = '';
    chatContainer.appendChild(errorMsg);
  }
}

/**
 * 显示文件消息
 * @param {Object} msg - 消息对象
 */
function displayFileMessage(msg) {
  const fileDiv = document.createElement('div');
  fileDiv.className = `message file-message ${msg.from === currentUser.id ? 'sent' : 'received'}`;
  
  const fileLink = document.createElement('a');
  fileLink.href = '#';
  fileLink.textContent = msg.from === currentUser.id ? 
    `📎 ${msg.originalName}` : 
    `📎 ${msg.originalName} (from ${msg.fromName})`;
  
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
      // 显示上传中提示
      const uploadingMsg = document.createElement('div');
      uploadingMsg.className = 'message system uploading sent';
      uploadingMsg.textContent = `正在上传: ${file.name}...`;
      chatContainer.appendChild(uploadingMsg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      // 读取文件内容
      const fileBuffer = await file.arrayBuffer();
      
      // 加密文件内容
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(Buffer.from(fileBuffer));
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // 生成唯一文件名并上传到WebDAV
      const fileId = crypto.randomUUID();
      const fileName = `${webdavPaths.files}/${fileId}`;
      await client.putFileContents(fileName, encrypted, { overwrite: false });

      // 创建消息数据
      const msgData = {
        from: currentUser.id,
        fromName: currentUser.displayName,
        time: Date.now(),
        type: 'file',
        iv: iv.toString('base64'),
        content: fileName,
        originalName: file.name,
        fileSize: file.size,
        fileType: file.type || 'application/octet-stream'
      };

      // 生成消息ID并保存消息数据
      const msgId = Date.now() + '_' + crypto.randomUUID();
      await client.putFileContents(
        `${webdavPaths.messages}/msg_${msgId}.json`,
        JSON.stringify(msgData),
        { overwrite: false }
      );

      // 移除上传中提示
      chatContainer.removeChild(uploadingMsg);
      
      // 显示文件消息
      displayFileMessage(msgData);
      
      // 清空文件输入框
      e.target.value = '';
    } catch (error) {
      handleError(error, '文件上传失败');
      e.target.value = '';
    }
  });

  // 发送消息处理
  sendButton.addEventListener('click', sendMessage);
  
  // 按Enter键发送消息
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  /**
   * 发送消息
   */
  async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    try {
      // 先在界面上显示消息
      addMessage(message, true);
      
      // 清空输入框
      messageInput.value = '';
      
      // 加密消息内容
      const encrypted = encrypt(message);
      
      // 创建消息数据
      const msgData = {
        from: currentUser.id,
        fromName: currentUser.displayName,
        time: Date.now(),
        type: 'text',
        iv: encrypted.iv,
        content: encrypted.content
      };

      // 生成消息ID并保存消息数据
      const msgId = Date.now() + '_' + crypto.randomUUID();
      await client.putFileContents(
        `${webdavPaths.messages}/msg_${msgId}.json`,
        JSON.stringify(msgData),
        { overwrite: false }
      );
    } catch (error) {
      handleError(error, '消息发送失败');
    }
  }

  // 存储已处理的消息ID
  const processedMessages = new Set();
  
  // 最后一次轮询时间
  let lastPollTime = Date.now();
  
  // 轮询新消息
  const pollInterval = setInterval(pollNewMessages, config.app.pollInterval);
  
  /**
   * 轮询新消息
   */
  async function pollNewMessages() {
    try {
      // 获取消息文件列表
      const files = await client.getDirectoryContents(webdavPaths.messages);
      
      // 过滤出JSON文件并按时间排序
      const messageFiles = files
        .filter(file => file.type === 'file' && file.basename.endsWith('.json'))
        .sort((a, b) => {
          // 尝试从文件名中提取时间戳
          const timeA = a.basename.match(/_(\d+)\./)?.[1] || a.lastmod;
          const timeB = b.basename.match(/_(\d+)\./)?.[1] || b.lastmod;
          return timeA - timeB;
        });
      
      // 处理新消息
      for (const file of messageFiles) {
        // 如果已经处理过该消息，跳过
        if (processedMessages.has(file.basename)) {
          continue;
        }
        
        try {
          // 获取消息内容
          const content = await client.getFileContents(`${webdavPaths.messages}/${file.basename}`);
          const msg = JSON.parse(content.toString());
          
          // 将消息标记为已处理
          processedMessages.add(file.basename);
          
          // 如果消息时间早于最后一次轮询时间，跳过（避免重复显示历史消息）
          if (msg.time && msg.time < lastPollTime) {
            continue;
          }
          
          // 不显示自己发送的消息（已在发送时显示）
          if (msg.from === currentUser.id) {
            continue;
          }
          
          // 根据消息类型处理
          if (msg.type === 'text') {
            try {
              const decrypted = decrypt(msg.iv, msg.content);
              addMessage(`${msg.fromName}: ${decrypted}`);
            } catch (error) {
              handleError(error, '消息解密失败');
            }
          } else if (msg.type === 'file') {
            displayFileMessage(msg);
          }
        } catch (error) {
          console.error(`处理消息 ${file.basename} 失败:`, error);
        }
      }
      
      // 更新最后一次轮询时间
      lastPollTime = Date.now();
      
      // 限制已处理消息集合的大小，避免内存泄漏
      if (processedMessages.size > 1000) {
        // 只保留最近的500条消息记录
        const messagesToKeep = Array.from(processedMessages).slice(-500);
        processedMessages.clear();
        messagesToKeep.forEach(msg => processedMessages.add(msg));
      }
    } catch (error) {
      handleError(error, '轮询消息失败');
    }
  }
  }
}

// 初始化应用
async function initApp() {
  // 显示连接中提示
  const connectingMsg = document.createElement('div');
  connectingMsg.className = 'connecting-message';
  connectingMsg.textContent = '正在连接WebDAV服务器...';
  document.body.appendChild(connectingMsg);
  
  try {
    console.log('开始初始化应用...');
    
    // 初始化WebDAV目录
    await initWebDAVFolders();
    
    // 移除连接提示
    document.body.removeChild(connectingMsg);
    
    // 显示成功提示（2秒后自动消失）
    const successMsg = document.createElement('div');
    successMsg.className = 'connecting-message';
    successMsg.textContent = '连接成功！';
    document.body.appendChild(successMsg);
    setTimeout(() => {
      if (document.body.contains(successMsg)) {
        document.body.removeChild(successMsg);
      }
    }, 2000);
    
    console.log('开始获取用户列表...');
    // 获取用户列表
    const users = await fetchUsers();
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
        const users = await fetchUsers();
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
    
    // 移除连接中提示（如果存在）
    if (document.body.contains(connectingMsg)) {
      document.body.removeChild(connectingMsg);
    }
    
    // 显示错误提示
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.textContent = `连接失败: ${error.message}`;
    document.body.appendChild(errorMsg);
    
    // 5秒后自动移除错误提示
    setTimeout(() => {
      if (document.body.contains(errorMsg)) {
        document.body.removeChild(errorMsg);
      }
    }, 5000);
  }
}

// 启动应用
initApp();

// End of file
