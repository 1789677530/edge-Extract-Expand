// 检查是否已经加载过此脚本，避免重复执行
if (typeof window.contentScriptLoaded !== 'undefined') {
    console.log('Content script already loaded, skipping execution');
    throw new Error('Content script already loaded');
}
window.contentScriptLoaded = true;

// 标准响应格式
const STANDARD_RESPONSE = {
    success: false,
    messages: [],
    url: window.location.href,
    error: null,
    timestamp: Date.now()
};

// 增强的选择器配置 - 特别针对DeepSeek页面结构
const FALLBACK_SELECTORS = {
    container: [
        '[class*="conversation"]', '[class*="chat"]', 
        '.ant-layout-content', '.main-content',
        '.chat-page', '.chat-content', '.conversation-container',
        '.app-main', '.main-container', '.page-container',
        '.ds-modal-wrapper', '.chat-container', '.conversation-wrapper',
        'div[role="dialog"]', '.chat-box', '.message-container',
        '#chat-container', '[data-testid="chat-container"]',
        '.main-content', '.app-content', '#__next', '.container'
    ],
    messages: [
        '[data-testid*="message"]', '[class*="message"]',
        '.chat-message', '.ant-message',
        '[data-testid="message-item"]', '.chat-message-item', '.msg-unit',
        '.chat-turn', '.message-block', '.chat-bubble-group',
        '.ds-message', '.message', '.chat-message', 'div[role="message"]',
        '.msg', '[data-testid="message"]', '.message-item', '.chat-item',
        '.message-unit', '.chat-bubble', '.msg-bubble'
    ],
    user: [
        '[data-role="user"]', '.user-msg', '[data-author="user"]',
        '.sender-user', '.human-message',
        '[class*="user-message"]', '.user', '.human', 'div[role="user"]',
        '[data-testid="user-message"]', '.from-user',
        '[aria-label="用户消息"]', '.user-bubble'
    ],
    assistant: [
        '[data-role="assistant"]', '.assistant-msg', '[data-author="assistant"]',
        '.sender-assistant', '.ai-message',
        '[class*="assistant-message"]', '.assistant', '.bot', 'div[role="assistant"]',
        '[data-testid="assistant-message"]', '.from-assistant',
        '[aria-label="助手消息"]', '.bot-bubble'
    ],
    content: [
        '#root > div > div > div.c3ecdb44 > div._7780f2e > div > div._3919b83 > div > div._0f72b0b.ds-scroll-area > div.dad65929 > div._4f9bf79.d7dc56a8._43c05b5 > div.ds-message._63c77b1 > div.ds-markdown > p',
        '.message-text', '.msg-content', '.chat-text',
        '[data-testid="message-content"]', '.markdown-content',
        '.message-content', '.content', '[class*="message-text"]',
        '[data-testid="message-content"]', '.text-content', '.markdown', '.message-body'
    ],
    time: [
        '.msg-timestamp', '[data-testid="message-time"]', '.send-time',
        '.message-time', '.time', 'time', '[data-testid="message-time"]',
        '.msg-time', '[datetime]', '.timestamp'
    ]
};

const MESSAGE_SELECTORS = {
    DEEPSEEK: {
        container: [
            '.chat-content',
            '.conversation-container',
            'div._0f72b0b.ds-scroll-area',
            'div.dad65929'
        ].join(', '),
        messages: [
            '[data-testid="message-item"]',
            '.chat-message-item',
            'div.ds-message._63c77b1'
        ].join(', '),
        user: [
            '[data-role="user"]',
            '.user-message',
            'div._9663006'
        ].join(', '),
        assistant: [
            '[data-role="assistant"]',
            '.assistant-message',
            'div._4f9bf79.d7dc56a8._43c05b5'
        ].join(', '),
        content: [
            '.message-content',
            '.markdown-content',
            'div.ds-markdown > p',
            'p.ds-markdown-paragraph'
        ].join(', '),
        time: '.message-time, [data-testid="message-time"]',
        system: '[class*="system-message"]'
    },
    DEFAULT: {
        container: 'div[class*="chat-container"], div[class*="modal-wrapper"]',
        messages: 'div[class*="message"]',
        user: 'div[class*="user-message"]',
        assistant: 'div[class*="assistant-message"]',
        content: 'div[class*="message-content"]',
        time: 'div[class*="message-time"]',
        system: 'div[class*="system-message"]'
    }
};

// 增强的元素查找函数
function findFirstMatchingElement(selectors, parent = document) {
    if (!selectors || (!Array.isArray(selectors) && typeof selectors !== 'string')) {
        console.warn('无效的选择器参数');
        return null;
    }

    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    
    // 1. 尝试直接选择器匹配
    for (const selector of selectorList) {
        try {
            const element = parent.querySelector(selector);
            if (element) {
                console.log(`选择器匹配成功: ${selector}`);
                return element;
            }
        } catch (error) {
            console.warn(`选择器 ${selector} 执行失败:`, error);
        }
    }
    
    // 2. 尝试部分类名匹配（更宽松的匹配）
    for (const selector of selectorList) {
        try {
            const cleanSelector = selector.replace(/^[.#]/, '');
            const elements = parent.getElementsByTagName('*');
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                if (el.className && el.className.includes(cleanSelector) && 
                    el.textContent.trim().length > 5) {
                    console.log(`类名包含匹配成功: ${cleanSelector}`);
                    return el;
                }
            }
        } catch (error) {
            console.warn(`类名匹配 ${selector} 执行失败:`, error);
        }
    }
    
    // 3. 尝试数据属性匹配
    for (const selector of selectorList) {
        try {
            if (selector.startsWith('[data-')) {
                const attrName = selector.match(/\[data-([^\]]+)\]/)[1];
                const elements = parent.querySelectorAll(`[data-${attrName}]`);
                for (const el of elements) {
                    if (el.textContent.trim().length > 5) {
                        console.log(`数据属性匹配成功: ${selector}`);
                        return el;
                    }
                }
            }
        } catch (error) {
            console.warn(`数据属性匹配 ${selector} 执行失败:`, error);
        }
    }
    
    // 4. 最后的手段：查找包含大量文本的元素作为候选
    const candidates = Array.from(parent.querySelectorAll('div, section, article'))
        .filter(el => el.textContent.trim().length > 100)
        .sort((a, b) => b.textContent.length - a.textContent.length);
        
    if (candidates.length > 0) {
        console.log('使用文本长度策略找到候选容器');
        return candidates[0];
    }
    
    return null;
}

// 放宽元素处理条件
function shouldProcessElement(element) {
    if (!element || !element.textContent) return false;
    
    const text = element.textContent.trim();
    // 对于 /a/chat/s/ 路径下的页面，进一步放宽文本长度限制
    const isTooShort = text.length < 1;
    
    // 检测是否为输入或按钮元素
    const isInput = element.tagName?.toLowerCase() === 'input' || 
                  element.tagName?.toLowerCase() === 'textarea' ||
                  element.querySelector('input, textarea');
    const isButton = element.tagName?.toLowerCase() === 'button' || 
                   element.hasAttribute('role') && element.getAttribute('role') === 'button';
    const isHidden = element.style.display === 'none' || 
                    element.style.visibility === 'hidden' ||
                    element.getAttribute('hidden') !== null;
    
    // 检测是否为脚本或样式元素
    const isScriptOrStyle = ['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName);
    
    // 检查是否包含特定的 DeepSeek 聊天消息类名
    const className = element.className || '';
    const isLikelyMessage = typeof className === 'string' && 
                          (className.includes('message') || 
                           className.includes('chat') || 
                           className.includes('bubble'));
    
    // 对于可能的消息元素，即使很短也接受
    const minLength = isLikelyMessage ? 1 : 1;
    
    return text.length >= minLength && 
           !isInput && 
           !isButton && 
           !isHidden && 
           !isTooShort &&
           !isScriptOrStyle;
}

// HTML转义函数
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(/\//g, "&#x2F;");
}

// 提取单条消息数据
function extractMessageData(element, index) {
    if (!element || !element.textContent) return null;
    
    let rawText = element.textContent
        .replace(/\s+/g, ' ')
        .trim();
        
    if (!rawText) return null;
    
    const text = escapeHtml(rawText);
    let role = 'unknown';
    
    // 检查元素本身或父元素的类名和属性（更宽松的判断）
    const elementHtml = element.outerHTML.toLowerCase();
    const parentHtml = element.parentElement?.outerHTML.toLowerCase() || '';
    
    // 检查用户相关特征
    if (elementHtml.includes('user') || 
        parentHtml.includes('user') ||
        element.hasAttribute('data-user') ||
        element.closest(FALLBACK_SELECTORS.user.join(', '))) {
        role = 'user';
    } 
    // 检查助手相关特征
    else if (elementHtml.includes('assistant') || 
             elementHtml.includes('bot') ||
             parentHtml.includes('assistant') ||
             parentHtml.includes('bot') ||
             element.hasAttribute('data-assistant') ||
             element.closest(FALLBACK_SELECTORS.assistant.join(', '))) {
        role = 'assistant';
    }

    // 进一步根据父容器类名增强判定
    try {
        const parentClass = element.parentElement?.className || '';
        if (!role || role === 'unknown') {
            if (parentClass.includes('_9663006')) {
                role = 'user';
            } else if (parentClass.includes('_4f9bf79') && parentClass.includes('d7dc56a8')) {
                role = 'assistant';
            }
        }
    } catch (_) {}
    
    // 获取时间信息
    let time = '时间未知';
    const timeElement = element.querySelector(FALLBACK_SELECTORS.time.join(', ')) ||
                       element.parentElement.querySelector(FALLBACK_SELECTORS.time.join(', '));
    if (timeElement && timeElement.textContent) {
        time = timeElement.textContent.trim();
    }
    
    return {
        role: role,
        content: text,
        id: `msg_${index}_${Date.now()}`,
        time: time,
        isValid: true
    };
}

// 提取聊天数据（增强版）
function extractDeepSeekChat() {
    const response = { ...STANDARD_RESPONSE };
    response.timestamp = Date.now();
    
    try {
        // 记录当前页面路径，便于调试
        console.log('当前页面路径:', window.location.pathname);
        console.log('是否为聊天详情页:', window.location.pathname.startsWith('/a/chat/s/'));
        
        // 优先查找特定于 /a/chat/s/ 页面的元素
        let chatContainer = document.querySelector('[class*="conversation"]') ||
                           document.querySelector('.ant-layout-content') ||
                           document.querySelector(MESSAGE_SELECTORS.DEEPSEEK.container) ||
                           document.querySelector(MESSAGE_SELECTORS.DEFAULT.container);
        
        // 如果还没找到，则使用通用回退策略
        if (!chatContainer) {
            chatContainer = findFirstMatchingElement(FALLBACK_SELECTORS.container);
        }
        
        if (!chatContainer) {
            // 最后的尝试：使用body作为容器
            chatContainer = document.body;
            console.warn('找不到专用聊天容器，使用body作为备选');
        }

        // 输出容器信息用于调试
        console.log('使用的聊天容器:', chatContainer);
        if (chatContainer) {
            console.log('容器HTML片段:', chatContainer.outerHTML.substring(0, 500));
        }

        // 2. 尝试找到所有消息元素 - 增加更多策略
        let messageElements = [];
        
        // 策略1: 使用主要选择器
        messageElements = Array.from(chatContainer.querySelectorAll(
            `${MESSAGE_SELECTORS.DEEPSEEK.messages}, ${MESSAGE_SELECTORS.DEFAULT.messages}`
        ));
        console.log(`策略1找到${messageElements.length}个消息元素`);
        
        // 策略2: 使用备用选择器
        if (!messageElements.length) {
            const messageSelector = FALLBACK_SELECTORS.messages.join(', ');
            messageElements = Array.from(chatContainer.querySelectorAll(messageSelector));
            console.log(`策略2找到${messageElements.length}个消息元素`);
        }
        
        // 策略3: 查找所有包含文本的元素（更宽松）
        if (!messageElements.length) {
            messageElements = Array.from(chatContainer.querySelectorAll('div, p, span'))
                .filter(el => el.textContent.trim().length > 1);
            console.log(`策略3找到${messageElements.length}个消息元素`);
        }
        
        // 策略4: 遍历所有子元素（最后的手段）
        if (!messageElements.length) {
            const allElements = [];
            const traverse = (node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    allElements.push(node);
                    for (const child of node.children) {
                        traverse(child);
                    }
                }
            };
            traverse(chatContainer);
            messageElements = allElements.filter(el => el.textContent.trim().length > 1);
            console.log(`策略4找到${messageElements.length}个消息元素`);
        }

        // 3. 过滤有效消息
        const validMessages = messageElements.filter(shouldProcessElement);
        console.log(`过滤后得到${validMessages.length}个有效消息元素`);
        
        if (!validMessages.length) {
            // 对于 /a/chat/s/ 路径做特殊处理
            const path = window.location.pathname;
            if (path.startsWith('/a/chat/s/')) {
                console.log('检测到对话详情页，使用专用提取策略');
                // 可以在这里添加针对详情页的特殊提取逻辑
            }
            
            // 输出更多调试信息
            console.log('所有消息元素:', messageElements);
            console.log('页面HTML片段:', document.documentElement.outerHTML.substring(0, 2000));
            throw new Error(`找不到有效消息元素（共检查了${messageElements.length}个元素）`);
        }

        // 4. 提取消息数据
        response.messages = validMessages
            .map((msgEl, index) => extractMessageData(msgEl, index))
            .filter(Boolean);

        if (!response.messages.length) {
            throw new Error('未能提取到有效消息内容');
        }

        response.success = true;
        console.log('成功提取到', response.messages.length, '条消息');
    } catch (error) {
        response.error = error.message;
        console.error('提取聊天数据错误:', error);
    }

    return response;
}

// 连接管理逻辑
let port = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const INITIAL_RECONNECT_DELAY = 1000;
let contextInvalidated = false; // 新增：标记上下文是否已永久失效

// 检查扩展上下文是否有效
function isExtensionContextValid() {
    try {
        // 更严格的上下文检查
        return typeof chrome !== 'undefined' &&
               typeof chrome.runtime !== 'undefined' &&
               typeof chrome.runtime.id !== 'undefined' &&
               chrome.runtime.id !== '';
    } catch (e) {
        console.log('Context validation error:', e);
        return false;
    }
}

// 重置重连计数器
function resetReconnectCounter() {
    reconnectAttempts = 0;
    contextInvalidated = false; // 重置上下文失效标记
    // 重新初始化连接
    setTimeout(connectToBackground, 100);
}

// 显示用户通知
function showUserNotification(message, isError = true) {
    // 创建一个临时通知元素
    const notification = document.createElement('div');
    notification.className = 'extension-notification'; // 使用类名而不是内联样式
    
    // 将样式定义移到 CSS 文件中或使用预定义类
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.classList.add('fade-out'); // 使用 CSS 过渡效果
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// 建立连接
function connectToBackground() {
    // 检查扩展上下文是否仍然有效
    if (!isExtensionContextValid()) {
        console.error('扩展上下文已失效，无法建立连接');
        // 不再显示通知，因为上下文已失效
        return;
    }

    // 检查重连次数
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`已达到最大重连次数(${MAX_RECONNECT_ATTEMPTS})，停止尝试`);
        // 添加更友好的用户提示
        console.log('请刷新页面以重新建立连接');
        return;
    }

    try {
        // 断开现有连接（如果存在）
        if (port) {
            try {
                port.disconnect();
            } catch (e) {
                console.warn('断开现有连接时出错:', e);
            }
            port = null;
        }

        // 建立新连接
        port = chrome.runtime.connect({ name: "chatExtractor" });
        
        resetReconnectCounter();
        console.log('内容脚本已连接到后台');
        
        // 消息处理
        port.onMessage.addListener(handlePortMessage);
        port.onDisconnect.addListener(handlePortDisconnect);
        
    } catch (error) {
        console.error('建立连接失败:', error);
        
        // 检测上下文失效错误
        if (error.message && (error.message.includes('Extension context invalidated') ||
                             error.message.includes('扩展上下文已失效'))) {
            contextInvalidated = true;
            console.error('扩展上下文已失效，停止重连');
            return;
        }
        
        // 其他错误，继续重连
        reconnectAttempts++;
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
        setTimeout(connectToBackground, delay);
    }
}

// 处理端口消息
function handlePortMessage(request) {
    if (request.type === 'EXTRACT_CHAT_DATA') {
        // 异步处理提取，避免阻塞
        setTimeout(() => {
            try {
                const data = extractDeepSeekChat();
                // 使用安全发送机制，防止上下文失效导致的错误
                try {
                    if (port) port.postMessage({ type: 'EXTRACT_COMPLETE', data });
                } catch (e) {
                    console.warn('通过端口发送消息失败:', e);
                }
                try {
                    chrome.runtime.sendMessage({ type: 'EXTRACT_COMPLETE', data });
                } catch (e) {
                    console.warn('通过runtime发送消息失败:', e);
                }
            } catch (error) {
                console.error('提取聊天数据时发生错误:', error);
                // 发送错误信息
                try {
                    const errorData = {
                        ...STANDARD_RESPONSE,
                        success: false,
                        error: error.message
                    };
                    if (port) port.postMessage({ type: 'EXTRACT_COMPLETE', data: errorData });
                } catch (e) {
                    console.warn('发送错误信息失败:', e);
                }
            }
        }, 0);
    } else if (request.type === 'CHECK_SCRIPT_LOADED') {
        const response = { loaded: true, timestamp: Date.now(), version: '1.0.4' };
        try {
            if (port) port.postMessage(response);
        } catch (e) {
            console.warn('通过端口发送加载状态失败:', e);
        }
        try {
            chrome.runtime.sendMessage(response);
        } catch (e) {
            console.warn('通过runtime发送加载状态失败:', e);
        }
    }
}

// 处理端口断开连接
function handlePortDisconnect() {
    console.log('连接已断开');
    port = null;
    
    // 检查断开原因
    if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || '';
        console.error('连接断开原因:', errorMsg);
        
        // 检测上下文失效错误
        if (errorMsg.includes('Extension context invalidated') || 
            errorMsg.includes('扩展上下文已失效')) {
            contextInvalidated = true;
            console.error('扩展上下文已失效，无法重连');
            return;
        }
    }
    
    // 准备重连
    reconnectAttempts++;
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
    console.log(`将在${delay}ms后尝试第${reconnectAttempts}次重连`);
    setTimeout(connectToBackground, delay);
}

// 消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 先检查上下文有效性
    if (!isExtensionContextValid()) {
        sendResponse({ 
            success: false, 
            error: '扩展上下文已失效，请刷新页面' 
        });
        return true;
    }
    
    console.log('收到消息:', request.type);
    
    if (request.type === 'CHECK_SCRIPT_LOADED') {
        sendResponse({ 
            loaded: true, 
            timestamp: Date.now(),
            version: '1.0.4'
        });
        return true;
    }
    
    if (request.type === 'EXTRACT_CHAT_DATA') {
        sendResponse({ processing: true });
        
        // 增加超时控制
        const timeoutId = setTimeout(() => {
            console.error('消息提取超时');
            if (sender.tab && sender.tab.id) {
                try {
                    chrome.tabs.sendMessage(sender.tab.id, {
                        type: 'EXTRACT_COMPLETE',
                        data: {
                            ...STANDARD_RESPONSE,
                            error: '消息提取超时，请重试'
                        }
                    });
                } catch (err) {
                    console.warn('发送超时消息失败:', err);
                }
            }
        }, 10000); // 10秒超时
        
        // 异步处理提取，避免阻塞
        setTimeout(() => {
            try {
                clearTimeout(timeoutId);
                const data = extractDeepSeekChat();
                chrome.runtime.sendMessage({
                    type: 'EXTRACT_COMPLETE',
                    data: data
                });
            } catch (error) {
                clearTimeout(timeoutId);
                console.error('异步提取失败:', error);
            }
        }, 100);
        
        return true;
    }
    
    return true;
});

// 初始化连接
connectToBackground();
