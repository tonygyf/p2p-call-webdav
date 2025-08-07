/**
 * WebDAV P2P Chat 配置文件
 * @description 管理WebDAV连接和加密设置
 */

module.exports = {
  /**
   * WebDAV服务器配置
   */
  webdav: {
    url: 'https://zeze.teracloud.jp/dav',
    username: 'tonygoo2025',
    password: 'YB55dtdsJqbuwn7L'
  },
  
  /**
   * 加密配置
   */
  encryption: {
    algorithm: 'aes-256-cbc',
    secret: 'user-shared-secret',
    salt: 'webdav-chat-salt'
  },
  
  /**
   * 应用配置
   */
  app: {
    pollInterval: 3000, // 消息轮询间隔（毫秒）
    windowWidth: 1000,
    windowHeight: 700
  },
  
  /**
   * 文件路径配置
   */
  paths: {
    messages: 'messages/user1-user2',
    files: 'files/user1-user2'
  }
};
