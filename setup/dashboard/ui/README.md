# QuickBox Console

共享的 React + TypeScript + shadcn/ui + Tailwind CSS 控制台。登录、系统总览、应用服务与文件浏览使用同一套主题和组件。

## 本地构建

```bash
cd setup/dashboard/ui
npm ci
npm run build
cd ../ws
npm ci
npm run lint
npm test
npm run build
```

前端产物位于 `setup/dashboard/console-dist`，后端产物位于 `setup/dashboard/ws/dist`。两者随安装包一起分发，服务器安装时只需安装后端运行依赖，无需安装 Vite 或 Tailwind。

## 入口与功能

- `/`：CPU、内存、磁盘、网卡速率、运行时间、应用入口。
- `/files`：整机目录、路径输入、面包屑、名称搜索、大小/时间排序、隐藏文件、普通文件下载。
- `/services`：应用安装与后台服务的启动、停止、重启。操作前有确认框，输出通过现有 WebSocket 命令接口返回；原有命令白名单继续生效。
- `/settings`：明暗主题、隐藏文件偏好、当前登录会话与维护日志。
- `/login`：内置网页登录；沿用 QuickBox 管理员 htpasswd 密码。
- `/USER.qbittorrent.downloads/`（以及 Deluge、Transmission、rTorrent）：进入对应下载目录，使用与面板一致的文件页。
- `/terminal`：独立 Web 终端；沿用当前登录会话，退出或改密后连接失效。

旧 WebUI、`/legacy`、旧 `/node/*` 接口和 ruTorrent 插件管理页面已移除。ruTorrent 本身的应用入口保留。

文件页提供浏览、下载、文件及空目录删除，不提供移动、上传操作。删除前有确认弹窗；非空目录需先清空。默认只有 `/home/USER/torrents` 内可删除，系统路径保持只读。设置受限 `QUICKBOX_FILE_ROOT` 时，该根目录内可删除，但根目录本身不可删除。新面板优先使用中文。登录统一使用面板内置密码认证。

旧下载目录中的文件直链仍直接下载，目录链接进入统一文件页。下载支持断点续传，并从同一个已校验文件句柄读取，避免校验后路径被替换。受限根目录的下载使用 Linux `/proc/self/fd` 校验；非 Linux 本地预览在设置受限根目录时返回 503，不降低边界保护。

## 登录持久化

勾选“记住密码”使用 30 天 Cookie；未勾选使用浏览器会话 Cookie，服务端最长保留 12 小时。Cookie 设置 `HttpOnly`、`SameSite=Lax`，经 HTTPS 访问时设置 `Secure`。会话令牌为随机值，服务端只保存其摘要和密码指纹，目录为 `/srv/dashboard/db/sessions`。会话在服务重启后继续有效，退出或管理员密码变更后失效，WebSocket 每次接收命令前重新检查会话。

## 可选环境变量

通过 systemd drop-in 设置：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `QUICKBOX_USERNAME` | `db/master.txt` 首行 | 管理员账号；测试时可以显式指定 |
| `QUICKBOX_HTPASSWD_FILE` | `/etc/htpasswd.d/htpasswd.USER` | 管理员密码文件 |
| `QUICKBOX_DASHBOARD_DB_DIR` | `/srv/dashboard/db` | 会话和操作输出的持久化目录 |
| `QUICKBOX_FILE_ROOT` | `/` | 文件浏览范围；可限制到 `/home/USER`，符号链接不能越过该边界 |
| `QUICKBOX_DELETE_ROOTS` | 管理员 torrents 目录或受限浏览根目录 | 可删除目录，多个绝对路径用 `:` 分隔；目录本身受保护 |

## 现有安装升级

部署时同步控制台产物、后端产物与修改过的安装/更新辅助脚本。`qbUpdateDashboard` 会保留 `db/sessions` 并调用 `qbConsoleMigrate`，把面板和当前管理员的下载目录 Nginx 配置改为 Cookie 会话认证。迁移首次保存 `.conf.pre-console` 备份，可以重复执行。

不要只复制前端文件：旧 Nginx Basic Auth 会先拦截浏览器，因此登录路由、API 与下载入口的 Nginx 配置必须一起迁移。实际升级前需确认正在运行的 QuickBox 目录、管理员账号、Nginx 站点，以及 ARM64 软件包兼容性。

`qbDashboardPermissions` 让后端代码、命令白名单和会话归 root 管理，Web 工作进程只能读取静态文件。更新后仍会应用这些权限。`qbDashboardCleanup` 将旧静态资源和 PHP 页面移到 `/root/quickbox-legacy-backup`，不再保留在站点目录中。注销或令牌轮换无法撤销旧会话时返回 503，浏览器保留原 Cookie 以便重试。

Fork 部署可用 root 管理的 `/etc/quickbox-update-source.json` 固定更新来源，避免面板更新切回上游：

```json
{"repository":"https://github.com/4Nest/quickbox-lite.git","branch":"codex/shadcn-console"}
```

## 验证

```bash
cd setup/dashboard/ws
npm run lint
npm test
python3 tests/console/check-nginx.py  # 需要本机安装 nginx
```

Nginx 检查使用临时目录，覆盖内置认证配置的重复迁移和语法验证。认证测试覆盖 Cookie 持久化、注销、改密码、过期、请求来源检查、限流及受限文件目录的符号链接边界。

设计采用 [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)，基础组件由 shadcn CLI 生成，可直接在 `src/components/ui` 修改。登录页单独位于 `src/pages/login.tsx`，共享品牌、格式化和请求工具分别位于 `src/components/brand.tsx` 与 `src/lib`。
