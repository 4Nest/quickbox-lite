# Console E2E

先在 `setup/dashboard/ui` 和 `setup/dashboard/ws` 运行 `npm ci && npm run build`。
然后在本目录运行 `npm ci && npx playwright install chromium && npm test`。

测试自动启动本机后端（临时账号与会话目录），覆盖登录、独立终端入口、旧路由清理和响应式宽度。真实 ttyd 的连接与会话撤销由后端测试以及部署验证覆盖。旧 PHP/Docker 测试环境已移除。
