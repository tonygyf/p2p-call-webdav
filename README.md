# WebDAV P2P Chat

一个基于WebDAV的点对点聊天应用，使用Electron框架构建。

## 功能特性

- 🔐 端到端加密消息
- 📎 文件传输功能
- 💬 实时消息同步
- 🖥️ 跨平台桌面应用

## 安装说明

### 前置要求
- Node.js (版本 16 或更高)
- npm 或 yarn

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd webdav-p2p-chat
```

2. 安装依赖
```bash
npm install
```

3. 配置WebDAV服务器
编辑 `config.js` 文件，设置您的WebDAV服务器信息：
```javascript
module.exports = {
  webdav: {
    url: 'https://your-webdav-server.com/dav',
    username: 'your-username',
    password: 'your-password'
  },
  encryption: {
    secret: 'your-encryption-secret'
  }
};
```

4. 启动应用
```bash
npm start
```

## 使用说明

1. 启动应用后，聊天界面会自动加载
2. 在输入框中输入消息，点击"Send"发送
3. 点击📎按钮可以发送文件
4. 消息会自动加密并存储到WebDAV服务器
5. 应用会定期检查新消息并自动显示

## 安全说明

- 所有消息都使用AES-256-CBC加密
- 文件传输也经过加密处理
- 请妥善保管您的加密密钥

## 技术栈

- Electron
- WebDAV
- Node.js Crypto API
- HTML5/CSS3/JavaScript

## 许可证

MIT License
