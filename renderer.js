const { createClient } = require('webdav');
const crypto = require('crypto');
const config = require('./config');

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
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const attachButton = document.getElementById('attach-button');
const fileInput = document.getElementById('file-input');

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

attachButton.addEventListener('click', () => {
  fileInput.click();
});

/**
 * 文件上传处理
 */
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
      from: 'user1',
      to: 'user2',
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

/**
 * 发送消息处理
 */
sendButton.addEventListener('click', async () => {
  const message = messageInput.value.trim();
  if (!message) return;

  try {
    const encrypted = encrypt(message);
    const msgData = {
      from: 'user1',
      to: 'user2',
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

/**
 * 轮询新消息
 * @description 定期检查WebDAV服务器上的新消息
 */
setInterval(async () => {
  try {
    const files = await client.getDirectoryContents(config.paths.messages);
    files.forEach(async file => {
      if (file.type === 'file' && file.basename.endsWith('.json')) {
        try {
          const content = await client.getFileContents(`${config.paths.messages}/${file.basename}`);
          const msg = JSON.parse(content.toString());
          
          if (msg.type === 'text') {
            try {
              const decrypted = decrypt(msg.iv, msg.content);
              addMessage(`${msg.from}: ${decrypted}`);
            } catch (error) {
              handleError(error, '消息解密失败');
            }
          } else if (msg.type === 'file') {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'message file-message received';
            const fileLink = document.createElement('a');
            fileLink.href = '#';
            fileLink.textContent = `📎 ${msg.originalName}`;
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
      }
    });
  } catch (error) {
    handleError(error, '轮询消息失败');
  }
}, config.app.pollInterval);