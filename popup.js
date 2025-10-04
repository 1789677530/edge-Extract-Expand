// 导入配置和UI组件
import { UI_CONFIG } from './config.js';
import { 
    createConfigForm, 
    createButtons, 
    createStatusDisplay,
    renderForm,
    renderButtons,
    renderStatus
} from './ui-components.js';

// 日志管理器
const logger = {
    error: (message, error) => {
        console.error(`${message}:`, error);
        updateStatus(message, true);
    }
};

// 默认配置
export const DEFAULT_CONFIG = {
    filenamePattern: 'Chat_{date}_{time}',
    savePath: '',
    autoSave: false,
    saveFormats: ['json', 'txt'],
    includeTimestamp: true,
    securityLevel: 'medium'
};

// 初始化UI组件
function initUI() {
    const configForm = createConfigForm(DEFAULT_CONFIG);
    const buttons = createButtons();
    const statusDisplay = createStatusDisplay();
    
    const configSection = document.querySelector('.section:nth-child(2)');
    const chatSection = document.querySelector('.section:first-child');
    
    // 渲染配置表单
    renderForm(configForm, configSection);
    
    // 渲染按钮
    renderButtons(buttons, configSection);
    
    // 渲染状态显示
    renderStatus(statusDisplay, document.body);
}

// 配置管理模块
export const ConfigManager = {
    async load() {
        try {
            // 增加上下文有效性检查
            if (!isExtensionContextValid()) {
                throw new Error('扩展上下文无效，无法加载配置');
            }
            
            const result = await chrome.storage.sync.get('chatSaverConfig');
            const config = {
                ...DEFAULT_CONFIG,
                ...(result.chatSaverConfig || {})
            };
            
            // 使用UI组件更新表单
            const configForm = createConfigForm(config);
            const configSection = document.querySelector('.section:nth-child(2)');
            configSection.innerHTML = '<h3>配置设置</h3>';
            renderForm(configForm, configSection);
            
            // 重新渲染按钮
            const buttons = createButtons();
            renderButtons(buttons, configSection);
            
            return config;
        } catch (error) {
            logger.error('加载配置失败', error);
            return DEFAULT_CONFIG;
        }
    },
    
    async save(config) {
        return saveConfigOnly(config);
    },
    
    async restore() {
        try {
            // 增加上下文有效性检查
            if (!isExtensionContextValid()) {
                throw new Error('扩展上下文无效，无法恢复配置');
            }
            
            await chrome.storage.sync.set({ chatSaverConfig: DEFAULT_CONFIG });
            updateStatus('已恢复默认配置', false);
            await this.load();
            return true;
        } catch (error) {
            logger.error('恢复默认配置失败', error);
            return false;
        }
    }
};

// 初始化应用
async function initApp() {
    // 初始化UI
    initUI();
    
    // 加载配置
    const config = await ConfigManager.load();
    
    // 检查当前页面是否支持保存
    const isSupported = await isDeepSeekPage();
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.disabled = !isSupported;
    }
    
    // 更新平台信息
    updatePlatformInfo(isSupported);
    
    // 注意：事件处理已移至另一个 DOMContentLoaded 事件中，避免重复绑定
}

// 启动应用
// document.addEventListener('DOMContentLoaded', initApp);  // 已移除以避免重复绑定

// 验证配置
function validateConfig(config) {
    const errors = [];
    
    if (typeof config.filenamePattern !== 'string' || 
        config.filenamePattern.length > 100) {
        errors.push('文件名格式无效（最多100字符）');
        config.filenamePattern = DEFAULT_CONFIG.filenamePattern;
    }
    
    if (typeof config.savePath === 'string') {
        config.savePath = config.savePath.trim();
    }
    const pathOk = !config.savePath || /^[A-Za-z0-9/_-]{1,200}$/.test(config.savePath);
    if (!pathOk || (config.savePath && (config.savePath.startsWith('/') || config.savePath.includes('..')))) {
        errors.push('保存路径无效（仅支持相对路径，允许字母、数字、下划线、短横线、斜杠）');
        config.savePath = DEFAULT_CONFIG.savePath;
    }
    
    return errors.length === 0 ? 
        { valid: true } : 
        { valid: false, errors };
}

// 保存用户配置
async function saveConfigOnly(config) {
    const validation = validateConfig(config);
    if (!validation.valid) {
        updateStatus(`配置无效: ${validation.errors.join('; ')}`, true);
        return false;
    }
    
    try {
        // 增加上下文有效性检查
        if (!isExtensionContextValid()) {
            throw new Error('扩展上下文无效，无法保存配置');
        }
        
        await chrome.storage.sync.set({ chatSaverConfig: config });
        updateStatus('配置已保存', false);
        document.dispatchEvent(new CustomEvent('configUpdated', {detail: config}));
        
        // 更新UI状态
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.disabled = !config.autoSave && !await isDeepSeekPage();
        }
        
        return true;
    } catch (error) {
        logger.error('保存配置失败', error);
        return false;
    }
}

// 检测当前标签页是否为DeepSeek聊天页面
function isDeepSeekPage() {
    return new Promise((resolve) => {
        // 增加上下文有效性检查
        if (!isExtensionContextValid()) {
            logger.error('扩展上下文无效，无法检测页面');
            resolve(false);
            return;
        }
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (chrome.runtime.lastError) {
                logger.error('获取标签页失败', chrome.runtime.lastError);
                resolve(false);
                return;
            }
            
            if (!tabs || tabs.length === 0 || !tabs[0].url) {
                resolve(false);
                return;
            }
            
            try {
                const url = new URL(tabs[0].url);
                const isDeepSeekDomain = url.hostname === 'chat.deepseek.com';
                // 支持根路径和 /a/chat/s/ 下的所有子路径
                const isChatPath = url.pathname === '/' || url.pathname.startsWith('/a/chat/s/');
                resolve(isDeepSeekDomain && isChatPath);
            } catch (error) {
                logger.error('解析URL失败', error);
                resolve(false);
            }
        });
    });
}

// 生成聊天记录文件内容
function generateChatFileContent(chatData, platform) {
    const header = `AI聊天记录保存时间: ${new Date().toLocaleString('zh-CN')}\n` +
                  `平台: ${platform}\n` +
                  `对话链接: ${chatData.url || '未知'}\n` +
                  `消息总数: ${chatData.messages?.length || 0}\n` +
                  (UI_CONFIG.SEPARATORS?.HEADER || '---') + '\n\n';
    
    if (!chatData.messages || !Array.isArray(chatData.messages)) {
        return header + '没有可提取的聊天消息';
    }
    
    const messages = chatData.messages.map((msg, index) => {
        const messageNumber = index + 1;
        const roleLabel = msg.role === 'user' ? (UI_CONFIG.LABELS?.USER || '用户') : (UI_CONFIG.LABELS?.AI || 'DeepSeek');
        return `【第${messageNumber}条】${roleLabel} (${msg.time || '时间未知'})\n` +
               `${msg.content || '无内容'}\n` +
               (UI_CONFIG.SEPARATORS?.MESSAGE || '---') + '\n\n';
    }).join('');
    
    return header + messages;
}

// 状态管理函数
function updateStatus(text, isError = false) {
    const status = document.getElementById('status');
    if (!status) return;
    
    status.textContent = text;
    status.style.color = isError ? 
        (UI_CONFIG.STATUS_COLORS?.ERROR || 'red') : 
        (UI_CONFIG.STATUS_COLORS?.NORMAL || 'green');
}

// 更新平台信息
function updatePlatformInfo(isSupported) {
    const platformInfo = document.getElementById('platformInfo');
    if (!platformInfo) return;
    
    platformInfo.textContent = isSupported ? 
        '当前页面支持保存聊天记录' : 
        '当前页面不支持保存聊天记录';
    platformInfo.style.color = isSupported ? 
        (UI_CONFIG.STATUS_COLORS?.NORMAL || 'green') : 
        (UI_CONFIG.STATUS_COLORS?.ERROR || 'red');
}

// 确保内容脚本已加载
async function ensureContentScriptLoaded(tabId) {
  return new Promise((resolve) => {
    const maxAttempts = 8;
    let attempts = 0;
    
    const check = () => {
      if (!isExtensionContextValid()) {
        console.error('扩展上下文无效，无法加载内容脚本');
        resolve(false);
        return;
      }

      chrome.tabs.sendMessage(tabId, { type: 'CHECK_SCRIPT_LOADED' }, (response) => {
        if (chrome.runtime.lastError) {
          if (attempts < maxAttempts) {
            attempts++;
            setTimeout(check, 500);
          } else {
            chrome.scripting.executeScript({
              target: { tabId },
              files: ["content.js"]
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { type: 'CHECK_SCRIPT_LOADED' }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error('注入后校验失败:', chrome.runtime.lastError);
                    resolve(false);
                    return;
                  }
                  resolve(!!(response && response.loaded));
                });
              }, 1500);
            }).catch(error => {
              console.error('注入内容脚本失败:', error);
              resolve(false);
            });
          }
          return;
        }
        
        if (response?.loaded) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(check, 500);
        } else {
          resolve(false);
        }
      });
    };
    
    check();
  });
}

// 检查扩展上下文是否有效
function isExtensionContextValid() {
    try {
        return typeof chrome !== 'undefined' &&
               typeof chrome.runtime !== 'undefined' && 
               typeof chrome.runtime.id !== 'undefined' &&
               chrome.runtime.id !== '';
    } catch (e) {
        return false;
    }
}

// 尝试恢复无效的扩展上下文
async function tryRecoverContext() {
    // 检查当前上下文是否有效
    if (isExtensionContextValid()) {
        return true;
    }
    
    // 尝试重新连接
    try {
        // 等待一小段时间
        await new Promise(resolve => setTimeout(resolve, 1000));
        return isExtensionContextValid();
    } catch (e) {
        console.warn('上下文恢复尝试失败:', e);
        return false;
    }
}

// 提取聊天数据 - 增加超时处理
async function extractChatData(tabId) {
    return new Promise((resolve) => {
        // 增加上下文有效性检查
        if (!isExtensionContextValid()) {
            resolve({ 
                success: false, 
                error: '扩展上下文无效，无法提取聊天数据' 
            });
            return;
        }
        
        // 延长超时时间到20秒，以适应可能更复杂的页面结构
        const timeoutId = setTimeout(() => {
            resolve({ 
                success: false, 
                error: '提取超时，请重试。可能是页面结构复杂或网络较慢。' 
            });
        }, 20000);

        let settled = false; // 新增变量，防止多次调用resolve
        
        const cleanup = (listener, timeout) => {
            try {
                chrome.runtime.onMessage.removeListener(listener);
            } catch (e) {
                console.warn('移除消息监听器时出错:', e);
            }
            clearTimeout(timeout);
        };

        const messageListener = (request, sender) => {
            if (!sender.tab || sender.tab.id !== tabId) return;
            if (request.type !== 'EXTRACT_COMPLETE') return;

            if (settled) return;
            settled = true;
            cleanup(messageListener, timeoutId);

            if (!request.data) {
                resolve({ success: false, error: '未收到提取数据' });
                return;
            }

            const requiredFields = ['success', 'messages', 'error'];
            const missingFields = requiredFields.filter(field => !(field in request.data));

            if (missingFields.length > 0) {
                const error = `数据不完整: 缺少${missingFields.join(',')}`;
                resolve({ success: false, error });
                return;
            }

            if (!request.data.success) {
                let errorMsg = request.data.error || '提取失败';
                if (errorMsg.includes('找不到有效消息元素')) {
                    errorMsg += '。可能是页面结构已更新，建议刷新页面或更新扩展。';
                }
                resolve({ success: false, error: errorMsg });
                return;
            }

            resolve({ success: true, data: request.data });
        };

        chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CHAT_DATA' }, (initialResponse) => {
            if (chrome.runtime.lastError) {
                // 特别处理端口关闭错误
                if (chrome.runtime.lastError.message && 
                    chrome.runtime.lastError.message.includes('closed before a response was received')) {
                    if (settled) return;
                    settled = true;
                    cleanup(messageListener, timeoutId);
                    resolve({
                        success: false,
                        error: '与内容脚本通信失败，请刷新页面后重试'
                    });
                    return;
                }
                
                if (settled) return;
                settled = true;
                cleanup(messageListener, timeoutId);
                resolve({
                    success: false,
                    error: `通信错误: ${chrome.runtime.lastError.message}。请刷新页面重试。`
                });
                return;
            }
            chrome.runtime.onMessage.addListener(messageListener);
        });
    });
}

// 保存聊天记录
async function saveChatHistory() {
    updateStatus('正在获取聊天记录...');
    
    try {
        if (!isExtensionContextValid()) {
            // 尝试恢复上下文
            const recovered = await tryRecoverContext();
            if (!recovered) {
                updateStatus('扩展上下文无效，请重新加载扩展并刷新页面', true);
                return;
            }
        }

        const tabs = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, resolve);
        });
        
        if (!tabs || !tabs[0] || !tabs[0].id) {
            updateStatus('无法获取当前标签页信息', true);
            return;
        }
        
        const tabId = tabs[0].id;
        const tabUrl = tabs[0].url;
        
        updateStatus('正在加载必要组件...');
        const scriptLoaded = await ensureContentScriptLoaded(tabId);
        if (!scriptLoaded) {
            updateStatus('无法加载内容脚本，请刷新页面重试', true);
            return;
        }
        
        updateStatus('正在提取聊天数据...');
        const extractionResult = await extractChatData(tabId);
        
        if (!extractionResult.success) {
            // 特别处理通信失败错误
            if (extractionResult.error && extractionResult.error.includes('通信失败')) {
                updateStatus('与页面通信失败，请刷新页面后重试', true);
                return;
            }
            updateStatus(`提取失败: ${extractionResult.error}`, true);
            return;
        }
        
        const chatData = extractionResult.data;
        chatData.url = tabUrl;
        
        const saveResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'saveChat',
                data: chatData,
                timestamp: Date.now()
            }, (response) => {
                if (chrome.runtime.lastError) {
                    // 特别处理端口关闭错误
                    if (chrome.runtime.lastError.message && 
                        chrome.runtime.lastError.message.includes('closed before a response was received')) {
                        resolve({ 
                            success: false, 
                            error: '与后台通信失败，请刷新页面后重试' 
                        });
                        return;
                    }
                    
                    resolve({ 
                        success: false, 
                        error: chrome.runtime.lastError.message 
                    });
                    return;
                }
                
                if (response && response.status === 'success') {
                    resolve({ success: true, downloadId: response.downloadId });
                } else {
                    resolve({ 
                        success: false, 
                        error: response?.message || '未知错误' 
                    });
                }
            });
        });
        
        if (saveResult.success) {
            updateStatus('聊天记录已保存!');
        } else {
            // 特别处理通信失败错误
            if (saveResult.error && saveResult.error.includes('通信失败')) {
                updateStatus('与后台通信失败，请刷新页面后重试', true);
                return;
            }
            updateStatus(`保存失败: ${saveResult.error}`, true);
        }
        
    } catch (error) {
        console.error('保存聊天记录时发生错误:', error);
        updateStatus(`操作失败: ${error.message}`, true);
    }
}

// 初始化DOM元素引用
function getDOMElements() {
    return {
        saveBtn: document.getElementById('saveBtn'),
        configSaveBtn: document.getElementById('configSaveBtn'),
        restoreBtn: document.getElementById('restoreBtn'),
        platformInfo: document.getElementById('platformInfo'),
        filenamePattern: document.getElementById('filenamePattern'),
        savePath: document.getElementById('savePath'),
        autoSave: document.getElementById('autoSave'),
        status: document.getElementById('status')
    };
}

// 新增：恢复默认配置函数
async function restoreDefaultConfig() {
    try {
        if (!isExtensionContextValid()) {
            throw new Error('扩展上下文无效，无法恢复默认配置');
        }
        
        await chrome.storage.sync.set({ chatSaverConfig: DEFAULT_CONFIG });
        updateStatus('已恢复默认配置', false);
        return true;
    } catch (error) {
        logger.error('恢复默认配置失败', error);
        return false;
    }
}

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', async () => {
    const elements = getDOMElements();
    
    const missingElements = Object.entries(elements)
        .filter(([_, element]) => !element)
        .map(([name]) => name);
    
    if (missingElements.length > 0) {
        console.error('缺少必要的DOM元素:', missingElements.join(', '));
        if (elements.status) {
            elements.status.textContent = '扩展加载失败: 缺少必要组件';
            elements.status.style.color = 'red';
        }
        return;
    }
    
    await ConfigManager.load();
    
    const isDeepSeek = await isDeepSeekPage();
    
    if (isDeepSeek) {
        elements.platformInfo.textContent = '已检测到 DeepSeek 聊天页面';
        elements.platformInfo.style.color = 'green';
        elements.saveBtn.disabled = false;
    } else {
        elements.platformInfo.textContent = '请在 DeepSeek 聊天页面使用此扩展';
        elements.platformInfo.style.color = 'red';
        elements.saveBtn.disabled = true;
    }
    
    // 只保留一个事件监听器，避免重复保存
    elements.saveBtn.addEventListener('click', async () => {
        if (!await isDeepSeekPage()) {
            updateStatus('请在DeepSeek聊天页面使用此功能', true);
            return;
        }
        
        // 保存配置
        const newConfig = {
            filenamePattern: elements.filenamePattern.value,
            savePath: elements.savePath.value,
            autoSave: elements.autoSave.checked
        };
        const configSaved = await saveConfigOnly(newConfig);
        if (!configSaved) {
            // 如果配置保存失败，不继续保存聊天记录
            return;
        }
        
        // 保存聊天记录
        updateStatus('正在获取聊天记录...');
        
        try {
            const tabs = await new Promise((resolve) => {
                chrome.tabs.query({ active: true, currentWindow: true }, resolve);
            });
            
            if (!tabs || !tabs[0] || !tabs[0].id) {
                updateStatus('无法获取当前标签页信息', true);
                return;
            }
            
            const tabId = tabs[0].id;
            const tabUrl = tabs[0].url;
            
            updateStatus('正在加载必要组件...');
            const scriptLoaded = await ensureContentScriptLoaded(tabId);
            if (!scriptLoaded) {
                updateStatus('无法加载内容脚本，请刷新页面重试', true);
                return;
            }
            
            updateStatus('正在提取聊天数据...');
            const extractionResult = await extractChatData(tabId);
            
            if (!extractionResult.success) {
                updateStatus(`提取失败: ${extractionResult.error}`, true);
                return;
            }
            
            const chatData = extractionResult.data;
            chatData.url = tabUrl;
            
            const saveResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'saveChat',
                    data: chatData,
                    timestamp: Date.now()
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve({ 
                            success: false, 
                            error: chrome.runtime.lastError.message 
                        });
                        return;
                    }
                    
                    if (response && response.status === 'success') {
                        resolve({ success: true, downloadId: response.downloadId });
                    } else {
                        resolve({ 
                            success: false, 
                            error: response?.message || '未知错误' 
                        });
                    }
                });
            });
            
            if (saveResult.success) {
                updateStatus('聊天记录已保存!');
            } else {
                updateStatus(`保存失败: ${saveResult.error}`, true);
            }
        } catch (error) {
            console.error('保存聊天记录时发生错误:', error);
            updateStatus(`操作失败: ${error.message}`, true);
        }
    });
    
    elements.configSaveBtn.addEventListener('click', async () => {
        const newConfig = {
            filenamePattern: elements.filenamePattern.value,
            savePath: elements.savePath.value,
            autoSave: elements.autoSave.checked
        };
        await saveConfigOnly(newConfig);
    });
    
    elements.restoreBtn.addEventListener('click', async () => {
        if (confirm('确定要恢复默认配置吗？当前配置将会丢失。')) {
            const restored = await restoreDefaultConfig();
            if (restored) {
                elements.filenamePattern.value = DEFAULT_CONFIG.filenamePattern;
                elements.savePath.value = DEFAULT_CONFIG.savePath;
                elements.autoSave.checked = DEFAULT_CONFIG.autoSave;
            }
        }
    });
});
