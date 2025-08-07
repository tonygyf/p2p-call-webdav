/**
 * 错误处理模块
 * @description 统一管理应用中的错误处理
 */

const fs = require('fs');
const path = require('path');

/**
 * 错误类型枚举
 */
const ErrorTypes = {
  NETWORK: 'NETWORK',
  ENCRYPTION: 'ENCRYPTION',
  FILE_OPERATION: 'FILE_OPERATION',
  WEBDAV: 'WEBDAV',
  UNKNOWN: 'UNKNOWN'
};

/**
 * 错误处理类
 */
class ErrorHandler {
  constructor() {
    this.logFile = path.join(__dirname, 'error.log');
  }

  /**
   * 记录错误到日志文件
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   * @param {string} type - 错误类型
   */
  logError(error, context, type = ErrorTypes.UNKNOWN) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${type}] [${context}] ${error.message}\n${error.stack}\n\n`;
    
    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (logError) {
      console.error('无法写入错误日志:', logError);
    }
  }

  /**
   * 处理网络错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  handleNetworkError(error, context) {
    this.logError(error, context, ErrorTypes.NETWORK);
    console.error(`网络错误 [${context}]:`, error.message);
  }

  /**
   * 处理加密错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  handleEncryptionError(error, context) {
    this.logError(error, context, ErrorTypes.ENCRYPTION);
    console.error(`加密错误 [${context}]:`, error.message);
  }

  /**
   * 处理文件操作错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  handleFileOperationError(error, context) {
    this.logError(error, context, ErrorTypes.FILE_OPERATION);
    console.error(`文件操作错误 [${context}]:`, error.message);
  }

  /**
   * 处理WebDAV错误
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  handleWebDAVError(error, context) {
    this.logError(error, context, ErrorTypes.WEBDAV);
    console.error(`WebDAV错误 [${context}]:`, error.message);
  }

  /**
   * 通用错误处理
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   */
  handleError(error, context) {
    this.logError(error, context);
    console.error(`错误 [${context}]:`, error.message);
  }
}

module.exports = {
  ErrorHandler,
  ErrorTypes
};
