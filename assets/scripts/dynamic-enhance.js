// 动态页面处理增强
(function($) {
    // 确保 jQuery 已定义
    if (!$) {
        console.warn('jQuery not found, dynamic enhancement features disabled');
        return;
    }
    
    // 等待元素出现的工具函数
    $.fn.waitForElement = function(selector, callback, timeout = 30000) {
        const $this = this;
        const interval = 100;
        const maxTries = timeout / interval;
        let tries = 0;
        
        const check = setInterval(function() {
            tries++;
            const $element = $this.find(selector);
            
            if ($element.length > 0) {
                clearInterval(check);
                callback($element);
            } else if (tries >= maxTries) {
                clearInterval(check);
                console.error(`Timeout waiting for element: ${selector}`);
                callback(null);
            }
        }, interval);
    };
    
    // 等待AJAX请求完成的工具函数
    $.waitForAjax = function(callback, timeout = 30000) {
        // 确保 jQuery.ajax 存在
        if (!$.ajax) {
            console.warn('jQuery.ajax not available, skipping AJAX wait');
            callback(null);
            return;
        }
        
        const originalAjax = $.ajax;
        let activeRequests = 0;
        let timeoutTimer;
        
        // 重置超时计时器
        const resetTimeout = () => {
            clearTimeout(timeoutTimer);
            timeoutTimer = setTimeout(() => {
                $.ajax = originalAjax;
                callback(new Error("Timeout waiting for AJAX requests"));
            }, timeout);
        };
        
        resetTimeout();
        
        // 重写AJAX方法以跟踪请求
        $.ajax = function() {
            activeRequests++;
            const promise = originalAjax.apply(this, arguments);
            
            promise.always(() => {
                activeRequests--;
                if (activeRequests === 0) {
                    $.ajax = originalAjax;
                    clearTimeout(timeoutTimer);
                    callback(null);
                } else {
                    resetTimeout();
                }
            });
            
            return promise;
        };
    };
})(window.jQuery);