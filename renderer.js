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
  database: `${WEBDAV_ROOT}/${config.paths.database}`
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
 * @param {string|boolean} type - 消息类型：true表示自己发送的消息，false表示接收的消息，'system'表示系统消息
 * @param {boolean} isFile - 是否为文件消息
 */
function addMessage(text, type = false, isFile = false) {
  try {
    const div = document.createElement('div');
    
    // 根据类型设置样式
    if (type === 'system') {
      div.className = 'message system';
    } else {
      const isOwn = type === true;
      div.className = `message ${isFile ? 'file-message' : ''} ${isOwn ? 'sent' : 'received'}`;
    }
    
    div.textContent = text;
    
    // 添加时间戳
    if (type !== 'system') {
      const timeSpan = document.createElement('div');
      timeSpan.className = 'message-time';
      timeSpan.textContent = new Date().toLocaleTimeString();
      div.appendChild(timeSpan);
    }
    
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
      webdavPaths.database
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
  
  // 如果没有用户，显示提示
  if (users.length === 0) {
    const noUserMsg = document.createElement('div');
    noUserMsg.className = 'no-user-message';
    noUserMsg.textContent = '没有找到用户，请注册新用户';
    userList.appendChild(noUserMsg);
    loginButton.disabled = true;
    return;
  }
  
  // 添加用户到列表
  users.forEach(user => {
    const li = document.createElement('li');
    const userDiv = document.createElement('div');
    userDiv.className = 'user-item';
    
    // 添加头像（如果有）
    if (user.avatar && typeof user.avatar === 'string' && user.avatar.trim() !== '') {
      const avatarImg = document.createElement('img');
      avatarImg.src = user.avatar;
      avatarImg.className = 'user-avatar';
      avatarImg.alt = user.displayName;
      
      // 图片加载失败时的回退处理
      avatarImg.onerror = function() {
        // 创建默认头像
        const avatarPlaceholder = document.createElement('div');
        avatarPlaceholder.className = 'avatar-placeholder';
        const hue = (Math.abs(user.id) * 137.508) % 360;
        const randomColor = `hsl(${hue}, 75%, 50%)`;
        avatarPlaceholder.style.backgroundColor = randomColor;
        avatarPlaceholder.textContent = user.displayName.charAt(0).toUpperCase();
        
        // 替换损坏的图片
        if (this.parentNode) {
          this.parentNode.replaceChild(avatarPlaceholder, this);
        }
      };
      
      userDiv.appendChild(avatarImg);
    } else {
      // 创建默认头像（用户名首字母）
      const avatarPlaceholder = document.createElement('div');
      avatarPlaceholder.className = 'avatar-placeholder';
      // 生成一个基于用户ID的稳定随机颜色
      const hue = (Math.abs(user.id) * 137.508) % 360;
      const randomColor = `hsl(${hue}, 75%, 50%)`;
      avatarPlaceholder.style.backgroundColor = randomColor;
      avatarPlaceholder.textContent = user.displayName.charAt(0).toUpperCase();
      userDiv.appendChild(avatarPlaceholder);
    }
    
    // 添加用户名
    const nameSpan = document.createElement('span');
    nameSpan.textContent = user.displayName;
    nameSpan.className = 'user-name';
    userDiv.appendChild(nameSpan);
    
    // 添加最后登录时间（如果有）
    const lastLogin = localStorage.getItem(`lastLogin_${user.id}`);
    if (lastLogin) {
      const lastLoginSpan = document.createElement('span');
      lastLoginSpan.className = 'last-login';
      lastLoginSpan.textContent = `上次登录: ${lastLogin}`;
      userDiv.appendChild(lastLoginSpan);
    }
    
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
      // 更新登录按钮文本
      loginButton.textContent = `登录 ${user.displayName}`;
      console.log('已选择用户:', currentUser);
    });
    userList.appendChild(li);
  });
  
  // 默认选中第一个用户
  if (users.length > 0 && !currentUser) {
    const firstUser = userList.querySelector('li');
    if (firstUser) {
      firstUser.click();
    }
  }
}

/**
 * 初始化聊天页面
 */
async function initChatPage() {
  // 隐藏登录页面，显示聊天页面
  loginContainer.classList.add('hidden');
  registerContainer.classList.add('hidden');
  chatPage.classList.remove('hidden');
  
  // 显示欢迎消息
  addMessage(`欢迎, ${currentUser.displayName}!`, 'system');
  
  // 更新页面标题和聊天标题
  document.getElementById('chat-title').textContent = `WebDAV 聊天 - ${currentUser.displayName}`;
  document.title = `WebDAV 聊天 - ${currentUser.displayName}`;
  
  // 获取聊天对象列表
  try {
    const recipientSelect = document.getElementById('recipient-select');
    recipientSelect.innerHTML = '<option value="" disabled selected>请选择聊天对象</option>';
    
    // 显示加载中提示
    const loadingOption = document.createElement('option');
    loadingOption.disabled = true;
    loadingOption.textContent = '加载中...';
    recipientSelect.appendChild(loadingOption);
    
    // 获取聊天用户列表（排除当前用户）
    const chatUsers = await ipcRenderer.invoke('get-chat-users', currentUser.id);
    
    // 移除加载中选项（安全检查）
    if (loadingOption && loadingOption.parentNode === recipientSelect) {
      recipientSelect.removeChild(loadingOption);
    }
    
    if (chatUsers.length === 0) {
      const noUserOption = document.createElement('option');
      noUserOption.disabled = true;
      noUserOption.textContent = '没有其他用户';
      recipientSelect.appendChild(noUserOption);
      
      // 禁用消息输入和发送
      messageInput.disabled = true;
      sendButton.disabled = true;
      attachButton.disabled = true;
      
      addMessage('没有其他用户可聊天，请等待其他用户注册', 'system');
    } else {
      // 添加用户选项
      chatUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = user.nickname || user.username;
        option.dataset.username = user.username;
        recipientSelect.appendChild(option);
      });
      
      // 从本地存储中恢复上次选择的聊天对象
      const lastRecipientId = localStorage.getItem(`lastRecipient_${currentUser.id}`);
      if (lastRecipientId) {
        recipientSelect.value = lastRecipientId;
      }
      
      // 如果没有选中任何聊天对象，禁用消息输入和发送
      if (!recipientSelect.value) {
        messageInput.disabled = true;
        sendButton.disabled = true;
        attachButton.disabled = true;
      }
      
      // 添加聊天对象选择事件
      recipientSelect.addEventListener('change', () => {
        const selectedRecipientId = recipientSelect.value;
        if (selectedRecipientId) {
          // 保存选择的聊天对象
          localStorage.setItem(`lastRecipient_${currentUser.id}`, selectedRecipientId);
          
          // 清空聊天容器，重新加载聊天历史
          chatContainer.innerHTML = '';
          loadChatHistory();
          
          // 启用消息输入和发送
          messageInput.disabled = false;
          sendButton.disabled = false;
          attachButton.disabled = false;
          
          // 更新聊天标题
          const selectedOption = recipientSelect.options[recipientSelect.selectedIndex];
          const recipientName = selectedOption.textContent;
          document.getElementById('chat-title').textContent = `与 ${recipientName} 聊天`;
          document.title = `与 ${recipientName} 聊天 - WebDAV P2P Chat`;
        } else {
          // 禁用消息输入和发送
          messageInput.disabled = true;
          sendButton.disabled = true;
          attachButton.disabled = true;
        }
      });
      
      // 触发change事件，初始化聊天界面
      const event = new Event('change');
      recipientSelect.dispatchEvent(event);
    }
  } catch (error) {
    handleError(error, '获取聊天用户失败');
    addMessage('获取聊天用户失败，请重新登录', 'system');
  }
  
  // 初始化聊天相关功能
  initChatFeatures();
  
  // 添加退出登录按钮事件
  document.getElementById('logout-button').addEventListener('click', () => {
    // 保存最后登录时间
    localStorage.setItem(`lastLogin_${currentUser.id}`, new Date().toLocaleString());
    
    // 清空聊天容器
    chatContainer.innerHTML = '';
    
    // 隐藏聊天页面，显示登录页面
    chatPage.classList.add('hidden');
    loginContainer.classList.remove('hidden');
    
    // 更新页面标题
    document.title = 'WebDAV P2P Chat';
    
    // 显示退出成功提示
    const logoutMsg = document.createElement('div');
    logoutMsg.className = 'connecting-message';
    logoutMsg.textContent = '已退出登录';
    document.body.appendChild(logoutMsg);
    setTimeout(() => {
      if (document.body.contains(logoutMsg)) {
        document.body.removeChild(logoutMsg);
      }
    }, 2000);
  });

  // 手动同步按钮
  document.getElementById('sync-up-button').addEventListener('click', async () => {
    try {
      const syncMsg = document.createElement('div');
      syncMsg.className = 'connecting-message';
      syncMsg.textContent = '正在上传到WebDAV...';
      document.body.appendChild(syncMsg);

      const result = await ipcRenderer.invoke('sync-db-manual');
      
      document.body.removeChild(syncMsg);
      
      if (result.success) {
        showSyncSuccess('上传成功！');
      } else {
        alert('上传失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      handleError(error, '上传到WebDAV失败');
    }
  });

  document.getElementById('sync-down-button').addEventListener('click', async () => {
    try {
      const syncMsg = document.createElement('div');
      syncMsg.className = 'connecting-message';
      syncMsg.textContent = '正在从WebDAV下载...';
      document.body.appendChild(syncMsg);

      const result = await ipcRenderer.invoke('sync-db-from-webdav-manual');
      
      document.body.removeChild(syncMsg);
      
      if (result.success) {
        showSyncSuccess('下载成功！');
        // 重新加载聊天历史
        const recipientSelect = document.getElementById('recipient-select');
        const currentRecipientId = recipientSelect.value;
        if (currentRecipientId) {
          loadChatHistory();
        }
      } else {
        alert('下载失败: ' + (result.message || '未知错误'));
      }
    } catch (error) {
      handleError(error, '从WebDAV下载失败');
    }
  });

  // 显示同步成功提示
  function showSyncSuccess(message) {
    const successMsg = document.createElement('div');
    successMsg.className = 'connecting-message';
    successMsg.textContent = message;
    document.body.appendChild(successMsg);
    setTimeout(() => {
      if (document.body.contains(successMsg)) {
        document.body.removeChild(successMsg);
      }
    }, 2000);
  }
}

/**
 * 加载聊天历史记录
 */
async function loadChatHistory() {
  try {
    // 获取选中的聊天对象
    const recipientSelect = document.getElementById('recipient-select');
    const recipientId = recipientSelect.value;
    if (!recipientId) {
      // 如果没有选择聊天对象，显示提示
      const noRecipientMsg = document.createElement('div');
      noRecipientMsg.className = 'message system';
      noRecipientMsg.textContent = '请选择聊天对象';
      chatContainer.appendChild(noRecipientMsg);
      return;
    }
    
    // 清空聊天容器
    chatContainer.innerHTML = '';
    
    // 添加加载提示
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'message system';
    loadingMsg.textContent = '正在加载聊天历史...';
    chatContainer.appendChild(loadingMsg);
    
    // 从数据库获取聊天历史
    const messages = await ipcRenderer.invoke('get-chat-history', {
      userId: currentUser.id,
      recipientId: recipientId
    });
    
    // 移除加载提示（安全检查）
    if (loadingMsg && loadingMsg.parentNode === chatContainer) {
      chatContainer.removeChild(loadingMsg);
    }
    
    // 如果没有相关消息，显示提示
    if (messages.length === 0) {
      const noMsgDiv = document.createElement('div');
      noMsgDiv.className = 'message system';
      noMsgDiv.textContent = '没有聊天记录，开始发送消息吧！';
      chatContainer.appendChild(noMsgDiv);
      return;
    }
    
    // 限制加载的消息数量，避免过多消息导致性能问题
    const recentMessages = messages.slice(-50); // 只加载最近的50条消息
    
    // 加载消息
    for (const msg of recentMessages) {
      // 显示消息
      if (msg.type === 'text') {
        try {
          const decrypted = decrypt(msg.iv, msg.content);
          const isOwn = parseInt(msg.sender) === currentUser.id;
          // 根据消息是否是自己发送的来设置类型参数
          addMessage(isOwn ? decrypted : `${msg.fromName}: ${decrypted}`, isOwn);
        } catch (error) {
          handleError(error, '消息解密失败');
        }
      } else if (msg.type === 'file') {
        displayFileMessage(msg);
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
  const isOwn = parseInt(msg.sender) === currentUser.id;
  const fileDiv = document.createElement('div');
  fileDiv.className = `message file-message ${isOwn ? 'sent' : 'received'}`;
  
  // 创建文件图标
  const fileIcon = document.createElement('div');
  fileIcon.className = 'file-icon';
  fileIcon.textContent = '📎';
  fileDiv.appendChild(fileIcon);
  
  // 创建文件信息容器
  const fileInfo = document.createElement('div');
  fileInfo.className = 'file-info';
  
  // 创建文件名 - 从消息内容中提取文件名
  const fileName = document.createElement('div');
  fileName.className = 'file-name';
  
  // 如果是文件消息，尝试从content中提取文件名，否则使用默认名称
  let fileNameText = '未知文件';
  try {
    // 尝试解析消息内容获取文件名
    if (msg.content && typeof msg.content === 'string') {
      // 如果是base64编码的文件内容，显示文件名
      fileNameText = `文件消息 (${formatFileSize(msg.content.length)})`;
    }
  } catch (e) {
    fileNameText = '文件消息';
  }
  
  fileName.textContent = isOwn ? fileNameText : `${fileNameText}`;
  fileInfo.appendChild(fileName);
  
  // 如果不是自己发送的，显示发送者
  if (!isOwn) {
    const sender = document.createElement('div');
    sender.className = 'file-sender';
    sender.textContent = `发送者: ${msg.fromName || '未知用户'}`;
    sender.style.fontSize = '12px';
    sender.style.color = '#6c757d';
    sender.style.marginBottom = '5px';
    fileInfo.appendChild(sender);
  }
  
  // 创建文件大小信息（如果有）
  if (msg.content) {
    const fileSize = document.createElement('div');
    fileSize.className = 'file-size';
    fileSize.textContent = formatFileSize(Buffer.from(msg.content, 'base64').length);
    fileInfo.appendChild(fileSize);
  }
  
  fileDiv.appendChild(fileInfo);
  
  // 创建下载按钮
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'file-download';
  downloadBtn.textContent = '下载';
  
  downloadBtn.addEventListener('click', async () => {
    try {
      // 显示下载中状态
      const originalText = downloadBtn.textContent;
      downloadBtn.textContent = '下载中...';
      downloadBtn.disabled = true;
      
      // 从消息内容中直接获取加密的文件内容
      const encryptedContent = Buffer.from(msg.content, 'base64');
      const iv = Buffer.from(msg.iv, 'base64');
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encryptedContent);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      const blob = new Blob([decrypted], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `download_${Date.now()}`;
      a.click();
      URL.revokeObjectURL(url);
      
      // 恢复按钮状态
      setTimeout(() => {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
      }, 1000);
    } catch (error) {
      handleError(error, '文件下载失败');
      downloadBtn.textContent = '下载失败';
      setTimeout(() => {
        downloadBtn.textContent = originalText;
        downloadBtn.disabled = false;
      }, 2000);
    }
  });
  
  fileDiv.appendChild(downloadBtn);
  
  // 添加时间戳
  if (msg.time) {
    const timeSpan = document.createElement('div');
    timeSpan.className = 'message-time';
    timeSpan.textContent = new Date(msg.time).toLocaleTimeString();
    fileDiv.appendChild(timeSpan);
  }
  
  chatContainer.appendChild(fileDiv);
}

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
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

    // 获取选中的聊天对象
    const recipientSelect = document.getElementById('recipient-select');
    const recipientId = recipientSelect.value;
    if (!recipientId) {
      alert('请选择聊天对象');
      return;
    }
    
    const recipientName = recipientSelect.options[recipientSelect.selectedIndex].textContent;

    try {
      // 显示上传中提示
      const uploadingMsg = document.createElement('div');
      uploadingMsg.className = 'message system uploading sent';
      uploadingMsg.textContent = `正在上传: ${file.name} (${formatFileSize(file.size)})...`;
      chatContainer.appendChild(uploadingMsg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      // 读取文件内容
      const fileBuffer = await file.arrayBuffer();
      
      // 加密文件内容
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(Buffer.from(fileBuffer));
      encrypted = Buffer.concat([encrypted, cipher.final()]);

      // 生成唯一文件ID
      const fileId = crypto.randomUUID();
      
      // 获取当前时间戳
      const timestamp = Date.now();
      
      // 创建消息数据
      const msgData = {
        from_user_id: currentUser.id,
        from_user_name: currentUser.displayName || currentUser.username || '未知用户',
        to_user_id: recipientId,
        to_user_name: recipientName || '未知用户',
        message_time: timestamp,
        message_type: 'file',
        iv: iv.toString('base64'),
        content: encrypted.toString('base64'), // 直接将加密后的文件内容存储在数据库中
        original_name: file.name,
        file_size: file.size,
        file_type: file.type || 'application/octet-stream',
        file_id: fileId
      };

      // 将文件消息保存到数据库
      await ipcRenderer.invoke('save-file-message', msgData);
      console.log('文件消息已保存到数据库');

      // 移除上传中提示（安全检查）
      if (uploadingMsg && uploadingMsg.parentNode === chatContainer) {
        chatContainer.removeChild(uploadingMsg);
      }
      
      // 显示文件消息
      displayFileMessage(msgData);
      
      // 显示发送成功提示
      const successMsg = document.createElement('div');
      successMsg.className = 'message system success';
      successMsg.textContent = '文件发送成功！';
      chatContainer.appendChild(successMsg);
      setTimeout(() => {
        if (successMsg.parentNode === chatContainer) {
          chatContainer.removeChild(successMsg);
        }
      }, 2000);
      
      // 清空文件输入框
      e.target.value = '';
    } catch (error) {
      // 移除上传中提示（如果存在）
      const uploadingMsg = document.querySelector('.message.system.uploading');
      if (uploadingMsg) chatContainer.removeChild(uploadingMsg);
      
      // 显示错误消息
      addMessage(`文件上传失败: ${error.message}`, 'system');
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

    // 获取选中的聊天对象
    const recipientSelect = document.getElementById('recipient-select');
    const recipientId = recipientSelect.value;
    if (!recipientId) {
      alert('请选择聊天对象');
      return;
    }
    
    const recipientName = recipientSelect.options[recipientSelect.selectedIndex].textContent;

    try {
      // 获取当前时间
      const timestamp = Date.now();
      
      // 先在界面上显示消息
      addMessage(message, true);
      
      // 清空输入框
      messageInput.value = '';
      
      // 加密消息内容
      const encrypted = encrypt(message);
      
      // 创建消息数据
      const msgData = {
        from_user_id: currentUser.id,
        from_user_name: currentUser.displayName || currentUser.username || '未知用户',
        to_user_id: recipientId,
        to_user_name: recipientName || '未知用户',
        message_time: timestamp,
        message_type: 'text',
        iv: encrypted.iv,
        content: encrypted.content
      };

      // 将消息保存到数据库
      const msgId = timestamp + '_' + crypto.randomUUID();
      await ipcRenderer.invoke('save-message', msgData);
      console.log('消息已保存到数据库');
      
      // 显示发送成功提示
      const successMsg = document.createElement('div');
      successMsg.className = 'message system success';
      successMsg.textContent = '消息发送成功！';
      chatContainer.appendChild(successMsg);
      setTimeout(() => {
        if (successMsg.parentNode === chatContainer) {
          chatContainer.removeChild(successMsg);
        }
      }, 2000);
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
      // 获取选中的聊天对象
      const recipientSelect = document.getElementById('recipient-select');
      const recipientId = recipientSelect.value;
      if (!recipientId) {
        // 如果没有选择聊天对象，不处理新消息
        return;
      }
      
      // 从数据库获取新消息
      const messages = await ipcRenderer.invoke('get-new-messages', {
        userId: currentUser.id,
        recipientId: recipientId,
        lastPollTime: lastPollTime
      });
      
      // 处理新消息
      for (const msg of messages) {
        // 生成消息ID
        const msgId = `msg_${msg.time}_${msg.sender}`;
        
        // 如果已经处理过该消息，跳过
        if (processedMessages.has(msgId)) {
          continue;
        }
        
        // 将消息标记为已处理
        processedMessages.add(msgId);
        
        // 不显示自己发送的消息（已在发送时显示）
        if (parseInt(msg.sender) === currentUser.id) {
          continue;
        }
        
        // 处理当前聊天对象之间的双向消息
        const isValidChat = (parseInt(msg.sender) === parseInt(recipientId) && parseInt(msg.recipient) === currentUser.id) || 
                           (parseInt(msg.sender) === currentUser.id && parseInt(msg.recipient) === parseInt(recipientId));
        if (!isValidChat) {
          continue;
        }
        
        // 根据消息类型处理
        if (msg.type === 'text') {
          try {
            const decrypted = decrypt(msg.iv, msg.content);
            // 添加消息，false表示接收的消息
            addMessage(`${msg.fromName}: ${decrypted}`, false);
          } catch (error) {
            handleError(error, '消息解密失败');
          }
        } else if (msg.type === 'file') {
          displayFileMessage(msg);
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
    loginButton.addEventListener('click', async () => {
      if (currentUser) {
        try {
          // 显示登录中提示
          const loginMsg = document.createElement('div');
          loginMsg.className = 'connecting-message';
          loginMsg.textContent = '正在登录...';
          document.body.appendChild(loginMsg);
          
          // 通过IPC调用验证用户
          const result = await ipcRenderer.invoke('login-user', currentUser.id);
          
          // 移除登录中提示
          document.body.removeChild(loginMsg);
          
          if (result.success) {
            // 更新当前用户信息
            currentUser = result.user;
            
            // 记录登录时间和当前用户
            const loginTime = new Date().toLocaleString();
            localStorage.setItem(`lastLogin_${currentUser.id}`, loginTime);
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            // 初始化聊天页面
            initChatPage();
          } else {
            alert(result.message || '登录失败');
          }
        } catch (error) {
          handleError(error, '登录失败');
          alert('登录失败，请重试');
        }
      } else {
        alert('请选择一个用户进行登录');
      }
    });
    
    // 注册按钮点击事件
    registerButton.addEventListener('click', () => {
      loginContainer.classList.add('hidden');
      registerContainer.classList.remove('hidden');
      // 聚焦到用户名输入框
      registerName.focus();
    });
    
    // 注册提交按钮点击事件
    registerSubmit.addEventListener('click', async () => {
      const username = registerName.value.trim();
      const success = await registerUser(username);
      if (success) {
        // 显示注册成功提示
        const registerSuccessMsg = document.createElement('div');
        registerSuccessMsg.className = 'connecting-message';
        registerSuccessMsg.textContent = '注册成功！';
        document.body.appendChild(registerSuccessMsg);
        setTimeout(() => {
          if (document.body.contains(registerSuccessMsg)) {
            document.body.removeChild(registerSuccessMsg);
          }
        }, 2000);
        
        // 重新获取用户列表
        const users = await fetchUsers();
        displayUserList(users);
        // 返回登录页面
        registerContainer.classList.add('hidden');
        loginContainer.classList.remove('hidden');
        // 清空注册表单
        registerName.value = '';
        
        // 自动选择新注册的用户
        const newUserItem = Array.from(userList.querySelectorAll('li')).find(li => {
          const userName = li.querySelector('.user-name').textContent;
          return userName === username;
        });
        if (newUserItem) {
          newUserItem.click();
        }
      }
    });
    
    // 注册表单回车键提交
    registerName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        registerSubmit.click();
      }
    });
    
    // 注册取消按钮点击事件
    registerCancel.addEventListener('click', () => {
      registerContainer.classList.add('hidden');
      loginContainer.classList.remove('hidden');
      // 清空注册表单
      registerName.value = '';
    });
    
    // 检查是否有上次登录的用户信息
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        // 查找用户是否存在于当前用户列表中
        const userExists = users.some(user => user.id === parsedUser.id);
        if (userExists) {
          // 自动选择上次登录的用户
          const userItem = Array.from(userList.querySelectorAll('li')).find(li => {
            return li.dataset.userId === parsedUser.id.toString();
          });
          if (userItem) {
            userItem.click();
            // 可以选择自动登录或等待用户点击登录按钮
            // loginButton.click();
          }
        }
      } catch (e) {
        console.error('解析保存的用户信息失败:', e);
        localStorage.removeItem('currentUser');
      }
    }
    
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
