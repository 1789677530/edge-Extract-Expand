// UI 组件模块

/**
 * 创建配置表单组件
 * @param {Object} config - 配置对象
 * @returns {Object} - 包含表单元素的对象
 */
export function createConfigForm(config) {
    return {
        filenamePattern: {
            type: 'text',
            id: 'filenamePattern',
            label: '文件名格式',
            placeholder: '例如: DeepSeek_Chat_{datetime}',
            value: config.filenamePattern,
            hint: '可用变量: {datetime} {date} {time}'
        },
        savePath: {
            type: 'text',
            id: 'savePath',
            label: '保存路径 (相对)',
            placeholder: '例如: deepseek_chats',
            value: config.savePath,
            hint: '仅支持相对路径，不允许特殊字符'
        },
        autoSave: {
            type: 'checkbox',
            id: 'autoSave',
            label: '自动保存 (无需确认对话框)',
            checked: config.autoSave
        }
    };
}

/**
 * 创建按钮组件
 * @returns {Object} - 包含按钮配置的对象
 */
export function createButtons() {
    return {
        saveBtn: {
            id: 'saveBtn',
            text: '保存当前聊天记录',
            disabled: true,
            style: {
                backgroundColor: '#2563eb',
                color: 'white'
            }
        },
        configSaveBtn: {
            id: 'configSaveBtn',
            text: '保存配置',
            style: {
                backgroundColor: '#4ade80',
                color: '#1e293b'
            }
        },
        restoreBtn: {
            id: 'restoreBtn',
            text: '恢复默认',
            style: {
                backgroundColor: '#facc15',
                color: '#1e293b'
            }
        }
    };
}

/**
 * 创建状态显示组件
 * @returns {Object} - 包含状态显示配置的对象
 */
export function createStatusDisplay() {
    return {
        status: {
            id: 'status',
            style: {
                marginTop: '10px',
                padding: '5px',
                minHeight: '20px'
            }
        },
        platformInfo: {
            id: 'platformInfo',
            style: {
                margin: '5px 0',
                padding: '5px',
                fontStyle: 'italic'
            }
        }
    };
}

/**
 * 渲染表单组件
 * @param {Object} formConfig - 表单配置
 * @param {HTMLElement} container - 容器元素
 */
export function renderForm(formConfig, container) {
    Object.values(formConfig).forEach(field => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';

        if (field.type !== 'checkbox') {
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.textContent = field.label;
            formGroup.appendChild(label);
        }

        const input = document.createElement('input');
        input.type = field.type;
        input.id = field.id;
        
        if (field.type === 'text') {
            input.placeholder = field.placeholder;
            input.value = field.value || '';
        } else if (field.type === 'checkbox') {
            input.checked = field.checked || false;
            
            const label = document.createElement('label');
            label.htmlFor = field.id;
            label.appendChild(input);
            label.appendChild(document.createTextNode(field.label));
            formGroup.appendChild(label);
        }

        formGroup.appendChild(input);

        if (field.hint) {
            const hint = document.createElement('div');
            hint.className = 'hint';
            hint.textContent = field.hint;
            formGroup.appendChild(hint);
        }

        container.appendChild(formGroup);
    });
}

/**
 * 渲染按钮组
 * @param {Object} buttons - 按钮配置
 * @param {HTMLElement} container - 容器元素
 */
export function renderButtons(buttons, container) {
    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group';

    Object.values(buttons).forEach(btnConfig => {
        const button = document.createElement('button');
        button.id = btnConfig.id;
        button.textContent = btnConfig.text;
        button.disabled = btnConfig.disabled || false;
        
        Object.assign(button.style, btnConfig.style);
        
        btnGroup.appendChild(button);
    });

    container.appendChild(btnGroup);
}

/**
 * 渲染状态显示
 * @param {Object} statusConfig - 状态显示配置
 * @param {HTMLElement} container - 容器元素
 */
export function renderStatus(statusConfig, container) {
    Object.values(statusConfig).forEach(item => {
        const element = document.createElement('div');
        element.id = item.id;
        Object.assign(element.style, item.style);
        container.appendChild(element);
    });
}