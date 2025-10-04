# 配置文件说明

## 配置项

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| apiEndpoint | string | `https://api.example.com` | API服务地址 |
| maxRetries | number | `3` | 请求失败最大重试次数 |
| timeout | number | `5000` | 请求超时时间(毫秒) |

## 环境变量覆盖

所有配置项都可以通过环境变量覆盖：
- `API_ENDPOINT`
- `MAX_RETRIES`
- `TIMEOUT`