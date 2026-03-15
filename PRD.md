# Nexus — AI Agent 管理面板

**版本**: v0.1.0  
**状态**: Draft  
**最后更新**: 2026-03-15

---

## 1. 背景与目标

### 痛点

运行多个 Claude Code 时有两个核心问题：

1. **没有统一入口**：每个 session 是独立的 ttyd 端口，没有全局视图
2. **移动端键盘残缺**：浏览器拦截 Ctrl+W/T/N 等快捷键；iOS/Android 没有 Esc 键；无法一键发送常用控制序列\
3. **查看对话历史不便**：tmux中查看历史需要启用鼠标，但是查看上下文和复制功能总是不好用，尤其是要同时考虑PC和移动端 

### 目标

构建 **Nexus**，一个薄层 Web 应用，叠加在现有 ttyd + tmux 上：

- 统一管理面板：所有 agent session 一览、可切换
- 自定义终端页面：接管 ttyd 的前端，增加控制工具栏（PC + 移动端均显示）
- 不改变 ttyd/tmux 的任何工作方式

### 非目标

- 不替代 tmux 做 session 保活
- 不替代 ttyd 做 PTY 管理
- 不做跨机器管理（如有需要，另一台机器单独部署 Nexus）
- 不引入数据库（session 元数据存内存 + 可选 JSON 文件）

---

## 2. 架构

### 整体结构

```
浏览器 / 手机
    │
    │ HTTPS（端口 57681，唯一入口）
    ▼
┌───────────────────────────────────────────────────┐
│                    Nexus                           │
│                                                    │
│  管理面板 (index.html)   终端页面 (terminal.html)  │
│  session 卡片列表        xterm.js + 控制工具栏      │
│                                                    │
│  WebSocket 代理                                     │
│  /proxy/:id  ──→  ws://127.0.0.1:<ttyd_port>/ws   │
│  （纯字节透传，不解析内容）                          │
│                                                    │
│  REST API  /api/sessions  JWT 认证                 │
└───────────────────────────────────────────────────┘
    │ loopback（ttyd 只监听 127.0.0.1）
    ▼
ttyd 实例们（各占一个本地端口，不对外暴露）
    │
    ▼
tmux sessions → run-claude.sh → Claude Code
```

### 核心设计

**ttyd 只监听 loopback**：`ttyd --interface 127.0.0.1 -p <port> ...`，Nexus 作为唯一公开入口，负责认证，将 WebSocket 透传到对应 ttyd 实例。

**Nexus 不碰 PTY**：WebSocket 代理只是字节透传。ttyd 全权负责 PTY 读写和 resize 处理。

**用自己的 xterm.js 前端替换 ttyd 默认前端**：Nexus 提供 `terminal.html`，连接到 `/proxy/:id`（透传到 ttyd WebSocket）。这样可以叠加控制工具栏、拦截浏览器快捷键，而不需要修改 ttyd。

---

## 3. 功能需求

### 3.1 管理面板

**FR-D-01** 首页展示所有已注册 session 的卡片，显示：名称、工作区路径、状态（运行中 / 离线）、运行时长。

**FR-D-02** 点击卡片进入该 session 的终端页面。

**FR-D-03** 页面每 10 秒轮询 session 状态（检测 ttyd 端口是否可达）。

**FR-D-04** 支持手动注册 session（输入名称、ttyd 端口、工作区路径）。

**FR-D-05** 支持删除 session 记录（可选同时 kill ttyd 进程）。

### 3.2 终端页面

**FR-T-01** 使用 xterm.js 渲染，连接到 `/proxy/:session_id?token=<jwt>`。

**FR-T-02** 拦截浏览器默认快捷键，转发给终端（`attachCustomKeyEventHandler`）：

- Ctrl+W、Ctrl+T、Ctrl+N、Ctrl+L、Ctrl+R、Ctrl+U、Ctrl+K
- F1–F12

**FR-T-03** 支持 256 色 / True Color、Unicode。

**FR-T-04** 字体大小可调（12–24px），持久化到 `localStorage`。

**FR-T-05** 窗口 resize 时同步终端尺寸到 ttyd。

### 3.3 控制工具栏

PC 和移动端均显示，解决两个问题：移动端没有物理 Esc/Ctrl 键；PC 端浏览器拦截部分快捷键。

**FR-K-01** 工具栏固定在终端底部，不遮挡终端主体；虚拟键盘弹出时自动上移（`visualViewport` API）。

**FR-K-02** 第一行：通用控制键（固定）

|标签|发送序列|说明|
|---|---|---|
|`Esc`|`\x1b`|退出当前模式|
|`Tab`|`\t`|自动补全|
|`^C`|`\x03`|中断|
|`^D`|`\x04`|EOF|
|`^Z`|`\x1a`|暂停|
|`↑`|`\x1b[A`|历史上一条|
|`↓`|`\x1b[B`|历史下一条|
|`^R`|`\x12`|历史搜索|

**FR-K-03** 第二行：Claude Code 常用键（默认值，可自定义）

|标签|发送内容|说明|
|---|---|---|
|`/`|`/`|slash command|
|`^O`|`\x0f`|打开文件|
|`^K`|`\x0b`|快速菜单|
|`Yes`|`yes\r`|确认|
|`No`|`no\r`|拒绝|
|`↵`|`\r`|回车（单独一键，移动端常用）|

**FR-K-04** 工具栏可自定义：设置页面增删按键（标签 + 发送序列），持久化到 `localStorage`。

**FR-K-05** 工具栏可折叠（点击收起/展开），折叠状态持久化。

### 3.4 Scrollback 历史浏览

xterm.js 在内存中维护 scrollback buffer，无需数据库，断线后 buffer 随页面消失（tmux 本身保留历史）。重连时通过 ttyd 读取 tmux 最近输出刷新 buffer。

**FR-S-01** xterm.js 初始化时设置 `scrollback: 10000`（行）。

**FR-S-02** PC 端：鼠标滚轮滚动 scrollback，xterm.js 原生支持，无需额外处理。

**FR-S-03** 移动端：在终端区域覆盖一个透明 `div`，完整接管所有 `touchstart` / `touchmove` 事件。手指上划调用 `terminal.scrollLines(-n)`，手指下划调用 `terminal.scrollLines(n)`，滚动速度与滑动速度正比。xterm.js 自身的触摸处理禁用（移动端在会话页面内滑动没有任何其他语义，就是看历史）。

**FR-S-04** 新输出到来时自动滚回底部——除非用户正在向上浏览（检测 `viewport < baseY`），此时不打断阅读。

**FR-S-05** 工具栏增加「↓↓ 回到底部」按钮，用户离开底部时高亮显示，点击后 `terminal.scrollToBottom()`。

### 3.5 PWA

**FR-P-01** `manifest.json`，`display: standalone`，支持添加主屏幕，全屏运行。

**FR-P-02** Service Worker 缓存静态资源，离线可加载应用壳（不缓存 API 和 WebSocket）。

**FR-P-03** 支持 iOS Safari 15+ 和 Android Chrome 90+。

### 3.5 认证

**FR-A-01** 单密码 JWT 认证，密码以 bcrypt hash 存环境变量，Token 有效期 30 天。

**FR-A-02** 所有页面和 API 需要有效 Token，否则跳转登录页。

**FR-A-03** WebSocket 代理握手时验证 Token（query param `?token=...`）。

---

## 4. Session 注册

### 4.1 `nexus-run` 脚本（推荐日常使用）

```bash
#!/usr/bin/env bash
# ~/bin/nexus-run
# 用法: nexus-run [workspace] [--name NAME]

NEXUS_URL="${NEXUS_URL:-http://localhost:57681}"
NEXUS_TOKEN=$(cat ~/.config/nexus/token 2>/dev/null)
WORKSPACE="${1:-$(pwd)}"
NAME="${3:-$(basename "$WORKSPACE")}"

# 找空闲端口
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); \
  print(s.getsockname()[1]); s.close()")

# 启动 tmux session（已存在则跳过）
tmux new-session -d -s "$NAME" -c "$WORKSPACE" \
  "bash ~/scripts/run-claude.sh" 2>/dev/null || true

# 启动 ttyd，仅监听 loopback
ttyd --port "$PORT" --interface 127.0.0.1 --writable \
  tmux attach-session -t "$NAME" &
TTYD_PID=$!
sleep 0.5

# 注册到 Nexus
RESULT=$(curl -sf \
  -H "Authorization: Bearer $NEXUS_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$NEXUS_URL/api/sessions" \
  -d "{\"name\":\"$NAME\",\"workspace\":\"$WORKSPACE\", \
      \"port\":$PORT,\"ttyd_pid\":$TTYD_PID}")

ID=$(echo "$RESULT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin)['id'])")

echo "✓ Session \"$NAME\" started"
echo "✓ Open: $NEXUS_URL/sessions/$ID"
```

### 4.2 手动注册已有 ttyd 实例

通过管理面板「+ 添加」，或直接调用 API：

```bash
curl -X POST http://localhost:57681/api/sessions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "vault", "workspace": "/home/user/vault", "port": 7681}'
```

---

## 5. 数据模型

无数据库。Session 元数据存内存，可选持久化到 `~/.config/nexus/sessions.json`。

```json
{
  "sessions": [
    {
      "id": "a1b2c3d4",
      "name": "vault",
      "workspace": "/home/user/vault",
      "port": 7681,
      "ttyd_pid": 12345,
      "created_at": "2026-03-15T10:00:00Z"
    }
  ]
}
```

Session 状态（`running` / `offline`）运行时动态检测，不持久化。

---

## 6. API

```
POST   /api/auth/login
       Body: { "password": "string" }
       Response: { "token": "jwt" }

GET    /api/sessions
       Response: Session[]（含 status, uptime_seconds）

POST   /api/sessions
       Body: { "name", "workspace", "port", "ttyd_pid"? }
       Response: Session

DELETE /api/sessions/:id
       可选 query: ?kill=true  → 同时 kill ttyd 进程

WS     /proxy/:session_id?token=<jwt>
       纯字节透传到 ws://127.0.0.1:<port>/ws
```

---

## 7. 实现

### 7.1 技术选型

|层|选型|理由|
|---|---|---|
|服务端|Node.js，无框架|内置 `http` + `ws` 库足够，~400 行|
|前端|原生 JS，无框架|无构建步骤，xterm.js 从 CDN 加载|
|依赖|`ws`、`jsonwebtoken`、`bcryptjs`|3 个包，无其他依赖|
|持久化|JSON 文件（可选）|无数据库服务|

### 7.2 文件结构

```
nexus/
├── server.js           # Nexus 主进程（~400 行）
├── public/
│   ├── index.html      # 管理面板
│   ├── terminal.html   # 终端页面（xterm.js + 工具栏）
│   ├── app.js          # 面板逻辑
│   ├── terminal.js     # 终端逻辑
│   ├── manifest.json
│   └── sw.js
├── .env.example
├── package.json
└── bin/
    └── nexus-run
```

### 7.3 启动

```bash
# 安装（一次性）
cd ~/nexus && npm install

# 配置
cp .env.example .env
# 填写 JWT_SECRET 和 ACC_PASSWORD_HASH

# 启动
node server.js
# 或 pm2 保活：pm2 start server.js --name nexus

# 安装注册脚本
cp bin/nexus-run ~/bin/ && chmod +x ~/bin/nexus-run
```

### 7.4 环境变量

```bash
# .env.example

# JWT 密钥（openssl rand -hex 32）
JWT_SECRET=

# 登录密码 bcrypt hash
# 生成：node -e "const b=require('bcryptjs');console.log(b.hashSync('yourpass',12))"
ACC_PASSWORD_HASH=

# 监听端口
PORT=57681

# Session 持久化路径（留空则仅内存）
SESSIONS_FILE=/home/user/.config/nexus/sessions.json
```

---

## 8. 迭代计划

### v1（3 天）

- [ ] `server.js`：静态文件服务 + REST API + WS 代理 + JWT 认证
- [ ] `index.html`：session 卡片列表，状态轮询，注册表单
- [ ] `terminal.html`：xterm.js + 快捷键拦截 + 尺寸自适应
- [ ] 控制工具栏：两行按键，`visualViewport` 适配
- [ ] 工具栏折叠 + 自定义（localStorage）
- [ ] `nexus-run` 脚本
- [ ] PWA manifest + Service Worker

### v2（按需）

- [ ] Telegram Bot：`/sessions` 查看列表，向指定 session 发 `claude -p` 任务
- [ ] 任务派发界面：不打开终端，输入 prompt → `claude -p` → 流式返回

---

## 9. 附录：ttyd WebSocket 协议

Nexus 代理层纯透传，无需解析。记录供前端参考：

```
服务端 → 客户端:
  "0" + <terminal output>        PTY 输出
  "1" + <window title>           标题
  "2" + <preferences JSON>       终端配置

客户端 → 服务端:
  "0" + <input data>             键盘输入
  "1" + {"columns":N,"rows":N}   resize
```

若 ttyd 未来更新协议，代理层不受影响，仅需更新前端的协议处理逻辑。