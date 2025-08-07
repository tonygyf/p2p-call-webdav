# WebDAV P2P Call

<p align="center">
  <img src="https://img.shields.io/badge/Electron-%5E28.2.0-blue?logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/WebDAV-Storage-green?logo=webdav" alt="WebDAV">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-lightgrey" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

> 🚀 现代化的点对点通话与聊天桌面应用，基于 Electron 构建，使用 WebDAV 作为安全存储后端。

---

## ✨ 主要特性

- 🔒 端到端加密，保障隐私安全
- 📞 实时音视频通话与消息同步
- 📎 文件安全传输
- 🌐 跨平台支持（Windows / macOS / Linux）
- 💡 简洁美观的现代 UI
- ☁️ WebDAV 云端存储，数据自持有

---

## 📦 安装与启动

### 前置条件
- Node.js 16+  
- npm / pnpm / yarn

### 快速开始

```bash
# 克隆仓库
git clone <repository-url>
cd webdav-p2p-call

# 安装依赖
npm install

# 启动开发环境
npm start
```

---

## ⚙️ 配置

编辑 `config.js`，填写你的 WebDAV 服务器信息和加密密钥：

```js
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

---

## 🛠️ 使用说明

1. 启动应用，登录 WebDAV 账号
2. 输入对方 ID，发起通话或聊天
3. 支持文字、文件、音视频实时通信
4. 所有数据自动加密并存储于 WebDAV

---

## 🔐 安全说明

- 所有消息与文件均采用 AES-256-CBC 加密
- 通话信令与内容均加密传输
- 加密密钥仅本地保存，服务端无法解密

---

## 🏗️ 技术栈

- [Electron](https://www.electronjs.org/)
- [WebDAV](https://github.com/perry-mitchell/webdav-client)
- Node.js / JavaScript
- HTML5 / CSS3 / 现代前端

---

## 🤝 贡献指南

欢迎 PR 与 Issue！
1. Fork 本仓库
2. 新建分支进行开发
3. 提交 PR 并描述你的更改

---

## 📄 许可证

MIT License © 2024 tonygyf
