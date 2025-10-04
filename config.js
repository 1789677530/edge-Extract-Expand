/**
 * 应用配置项
 * @typedef {Object} AppConfig
 * @property {string} apiEndpoint - API端点地址
 * @property {number} maxRetries - 最大重试次数
 * @property {number} timeout - 请求超时时间(ms)
 */

/**
 * 获取应用配置
 * @returns {AppConfig}
 */
// UI 配置常量
export const UI_CONFIG = {
  theme: {
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    textColor: '#1f2937'
  },
  layout: {
    maxWidth: '1200px',
    spacingUnit: '8px'
  }
};

// 在浏览器环境中模拟环境变量
function getEnvVariable(name, defaultValue = null) {
  // 浏览器环境中模拟环境变量
  if (typeof window !== 'undefined' && window[name]) {
    return window[name];
  }
  // 检查是否有全局定义
  if (typeof globalThis !== 'undefined' && globalThis[name]) {
    return globalThis[name];
  }
  // 检查是否有 process 对象（Node.js 环境）
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  return defaultValue;
}

function getConfig() {
  // 前置类型校验
  const apiEndpointEnv = getEnvVariable('API_ENDPOINT');
  if (apiEndpointEnv && typeof apiEndpointEnv !== 'string') {
    throw new Error(`apiEndpoint 必须是字符串，当前类型: ${typeof apiEndpointEnv}`)
  }

  const config = {
    apiEndpoint: apiEndpointEnv || 'https://api.example.com',
    maxRetries: parseInt(getEnvVariable('MAX_RETRIES')) || 3,
    timeout: parseInt(getEnvVariable('TIMEOUT')) || 5000
  }

  // 二次校验确保安全
  if(typeof config.apiEndpoint !== 'string') {
    throw new Error('配置系统异常: apiEndpoint 类型校验失败')
  }
  if(isNaN(config.maxRetries) || config.maxRetries < 0) {
    throw new Error('maxRetries 必须是正整数')
  }
  if(isNaN(config.timeout) || config.timeout <= 0) {
    throw new Error('timeout 必须是正数')
  }

  return config
}

export const appConfig = getConfig()