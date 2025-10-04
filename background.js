// 简单日志系统
const logger = {
    debug: (msg, context = {}) => console.debug(`[DEBUG] ${new Date().toISOString()}: ${msg}`, context),
    info: (msg, context = {}) => console.info(`[INFO] ${new Date().toISOString()}: ${msg}`, context),
    warn: (msg, context = {}) => console.warn(`[WARN] ${new Date().toISOString()}: ${msg}`, context),
    error: (msg, context = {}) => console.error(`[ERROR] ${new Date().toISOString()}: ${msg}`, context)
};

// 安全消息签名验证
// 简单加密函数
function encrypt(text) {
    if (!text) return '';
    const key = 3; // 简单的凯撒加密密钥
    return text.split('').map(c => String.fromCharCode(c.charCodeAt(0) + key)).join('');
}

// 简单解密函数
function decrypt(text) {
    if (!text) return '';
    const key = 3; // 与加密密钥匹配
    return text.split('').map(c => String.fromCharCode(c.charCodeAt(0) - key)).join('');
}

// 验证请求基本格式
function validateRequestFormat(request) {
    return request && typeof request.type === 'string';
}

// 验证消息来源
function validateMessageOrigin(sender) {
    // 允许来自 DeepSeek 聊天页面的所有子路径
    // 也允许来自扩展自身的消息（popup 页面）
    return !sender.origin || 
           sender.origin === 'https://chat.deepseek.com' || 
           sender.origin.startsWith('https://chat.deepseek.com/') ||
           sender.origin.startsWith('chrome-extension://') ||
           sender.origin.startsWith('moz-extension://');
}

async function validateMessageSignature(request) {
    try {
        // 从存储中获取加密的签名密钥
        const result = await chrome.storage.local.get('signatureKey');
        const encryptedKey = result.signatureKey || '';
        const expectedSignature = decrypt(encryptedKey);
        
        if (!request.signature) {
            logger.warn('请求缺少签名');
            return false;
        }
        
        const isValid = request.signature === expectedSignature;
        if (!isValid) {
            logger.warn('签名验证失败', {received: request.signature, expected: expectedSignature});
        }
        return isValid;
    } catch (error) {
        logger.error('签名验证失败', {error: error.message});
        return false;
    }
}

logger.info('DeepSeek Chat Saver服务工作进程已启动', {version: '1.0.0', env: 'production'});

// 全局错误监听
if (chrome.runtime.onError) {
    chrome.runtime.onError.addListener((error) => {
        logger.error(`运行时错误: ${error.message}`);
    });
}

// 监听扩展安装或更新
chrome.runtime.onInstalled.addListener((details) => {
    logger.info(`扩展安装/更新: ${details.reason}`);
});

// 唯一的消息处理函数（合并重复定义，保留完整逻辑）
async function handleMessageResponse(request, sender, sendResponse) {
    // 基本请求验证
    if (!request || typeof request.type !== 'string') {
        logger.warn('无效请求格式');
        sendResponse({status: 'error', message: '无效请求'});
        return;
    }

    // 签名验证（对扩展内部消息放宽）
    const isInternal = sender && sender.id === chrome.runtime.id;
    let isValid = true;
    if (!isInternal) {
        isValid = await validateMessageSignature(request);
        if (!isValid) {
            logger.warn('无效消息签名');
            sendResponse({status: 'error', message: '无效消息签名'});
            return;
        }
    }

    // 来源验证
    if (!validateMessageOrigin(sender)) {
        logger.warn(`未授权请求来源: ${sender.origin}`);
        sendResponse({status: 'error', message: '未授权的请求来源'});
        return false;
    }

    // 处理不同类型消息
    try {
        const msgType = request.type;
        switch (msgType) {
            case 'CHAT_DATA_EXTRACTED':
                logger.info('收到聊天数据', {
                    messageCount: request.payload?.messages?.length || 0,
                    url: request.payload?.url
                });
                
                // 存储数据
                chrome.storage.local.set({
                    lastChatData: request.payload
                }, () => {
                    if (chrome.runtime.lastError) {
                        logger.error('存储数据失败', {
                            error: chrome.runtime.lastError.message
                        });
                        sendResponse({status: 'error', message: '存储失败'});
                        return;
                    }
                    sendResponse({status: 'success'});
                });
                return true;
                
            case 'saveChat':
                if (!request.data?.messages) {
                    sendResponse({status: 'error', message: '无效的聊天数据'});
                    return false;
                }
                
                const chatText = request.data.messages.map(m => 
  `[${m.role === 'user' ? '用户' : '助手'}] ${m.time || ''}\n${m.content || ''}`
).join('\n\n---\n\n');
                
                // 在 background script 中创建数据 URL
                const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(chatText);
                
                // 获取用户配置
                const config = await chrome.storage.sync.get('chatSaverConfig');
                const userConfig = config.chatSaverConfig || {};
                
                // 生成文件名
                let filename = userConfig.filenamePattern || 'DeepSeek_Chat_{datetime}';
                const now = new Date();
                filename = filename
                    .replace('{datetime}', now.toISOString().replace(/[:.]/g, '-'))
                    .replace('{date}', now.toLocaleDateString('zh-CN').replace(/\//g, '-'))
                    .replace('{time}', now.toLocaleTimeString('zh-CN').replace(/:/g, '-'));
                
                if (!filename.endsWith('.txt')) filename += '.txt';
                
                // Edge 浏览器不支持在 filename 中使用路径分隔符，所以我们将路径信息放在提示中
                const downloadOptions = {
                    url: dataUrl,
                    filename: filename,
                    saveAs: !userConfig.autoSave,
                    conflictAction: 'uniquify'
                };
                
                // 如果配置了保存路径，添加提示信息
                if (userConfig.savePath) {
                    console.log(`用户配置的保存路径: ${userConfig.savePath} (实际保存时将忽略此路径设置)`);
                }
                
                chrome.downloads.download(downloadOptions, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        logger.error(`下载错误: ${chrome.runtime.lastError.message}`);
                        sendResponse({status: 'error', message: chrome.runtime.lastError.message});
                    } else {
                        logger.info(`聊天记录已保存，下载ID: ${downloadId}`);
                        sendResponse({status: 'success', downloadId});
                    }
                });
                
                return true;
                
            case 'getChatContent':
                if (!sender.tab) {
                    sendResponse({status: 'error', message: '无效的标签页'});
                    return false;
                }
                
                const results = await chrome.scripting.executeScript({
                    target: {tabId: sender.tab.id},
                    files: ["content.js"]
                });
                
                if (chrome.runtime.lastError) {
                    logger.error(`脚本执行错误: ${chrome.runtime.lastError.message}`);
                    sendResponse({status: 'error', message: chrome.runtime.lastError.message});
                    return false;
                }
                
                if (results?.[0]?.result) {
                    logger.info('成功获取聊天内容');
                    sendResponse({status: 'success', data: results[0].result});
                } else {
                    logger.warn('获取聊天内容失败');
                    sendResponse({status: 'error', message: '获取聊天内容失败'});
                }
                return true;
                
            default:
                logger.warn('未知消息类型', {type: request.type});
                sendResponse({status: 'error', message: '未知消息类型'});
                return false;
        }
    } catch (error) {
        logger.error(`处理消息时发生错误: ${error.message}`, {error});
        sendResponse({status: 'error', message: `处理失败: ${error.message}`});
        return false;
    }
}

// 仅注册一次消息监听
chrome.runtime.onMessage.addListener(handleMessageResponse);

// 端口通信路由：popup ⇄ background ⇄ content
const popupPorts = new Map();      // tabId -> popupPort
const contentPorts = new Map();    // tabId -> contentPort

chrome.runtime.onConnect.addListener((port) => {
    const tabId = port.sender?.tab?.id || null;

    if (port.name === 'chatExtractor') {
        // 来自 content.js 的端口
        if (tabId != null) contentPorts.set(tabId, port);

        port.onMessage.addListener((msg) => {
            if (msg && msg.type === 'EXTRACT_COMPLETE') {
                const p = tabId != null ? popupPorts.get(tabId) : null;
                if (p) {
                    p.postMessage({ type: 'EXTRACT_COMPLETE', data: msg.data });
                }
            }
        });

        port.onDisconnect.addListener(() => {
            if (tabId != null && contentPorts.get(tabId) === port) {
                contentPorts.delete(tabId);
            }
        });
    }

    if (port.name === 'chatExtractorPopup') {
        // 来自 popup.js 的端口
        port.onMessage.addListener((msg) => {
            if (msg && msg.type === 'EXTRACT_CHAT_DATA' && typeof msg.tabId === 'number') {
                popupPorts.set(msg.tabId, port);
                // 转发到目标 tab 的 content 脚本
                chrome.tabs.sendMessage(msg.tabId, { type: 'EXTRACT_CHAT_DATA' });
            }
        });

        port.onDisconnect.addListener(() => {
            // 清理所有指向此端口的映射
            for (const [tid, p] of popupPorts.entries()) {
                if (p === port) popupPorts.delete(tid);
            }
        });
    }
});

// Service Worker 激活事件
self.addEventListener('activate', (event) => {
    logger.info('Service Worker 已激活');
});

// Service Worker 安装事件
self.addEventListener('install', (event) => {
    logger.info('Service Worker 已安装');
    self.skipWaiting(); // 立即激活
});