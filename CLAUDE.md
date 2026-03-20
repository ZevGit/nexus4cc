# CLAUDE.md — Nexus Development Standards

Project: **Nexus** — WebSocket tmux 桥接，AI 终端移动端面板
Anchor: `docs/NORTH-STAR.md` — 修改任何文档前先对照锚点三原则

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Node.js (ESM) + Express + ws + node-pty |
| Frontend | React 18 + TypeScript + xterm.js + Vite |
| Auth | JWT (30d) + bcrypt password hash |
| Runtime | Docker `cc:nexus`（基于 `cc:latest`，含 claude CLI + tmux） |
| Config | `.env` → `server.js` 顶部解构，无 dotenv 依赖 |
| Persist | `./data/` volume（toolbar config、session configs） |

## Architecture Constraints

- **单 PTY 架构**（v1）：所有客户端 attach 同一个 `tmux attach-session -t main`
- **前端 dist 由 Vite 构建**，server.js 静态伺服 `frontend/dist/` + `public/`
- **no database**：会话状态从 tmux 实时读取，持久化只用 JSON 文件
- `WORKSPACE_ROOT` 整体挂载进容器，路径与宿主机完全一致

## Key Files

```
server.js                  # 唯一后端入口：Express + WS + PTY 桥
frontend/src/
  App.tsx                  # 路由：登录页 / 终端页
  Terminal.tsx             # xterm.js + WebSocket + 触摸处理
  Toolbar.tsx              # 可配置工具栏（固定行 + 展开区）
  TabBar.tsx               # tmux window 标签（< 768px 顶部导航）
  SessionManager.tsx       # 新建/切换 session 面板
  toolbarDefaults.ts       # 按键定义与出厂配置
data/                      # Docker volume 持久化
docs/
  NORTH-STAR.md            # 锚点文件（核心问题/用户/Out-of-Scope）
  PRD.md                   # 功能规格
  ROADMAP.md               # 迭代路线图
  ARCHITECTURE.md          # 架构现状
```

## Agent Workflow Rules

- **用 `/plan`**：涉及多文件改动、架构变更、新 API endpoint、PTY 行为变更
- **用 `/tdd`**：新增工具栏按键逻辑、认证流程、API endpoint
- **直接做**：单文件 UI 调整、样式修复、文档更新

## Definition of Done

- Implementation matches requirements — no speculative features
- `docs/NORTH-STAR.md` 三原则未被违反（对照确认）
- Manual verification：打开浏览器验证受影响的用户流
- Commit follows standard below

## Git Commit Standard

```
type(scope): imperative subject ≤ 72 chars

Body (optional, any language): explain why, not what.
Bug fixes: explain root cause.

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat` `fix` `docs` `refactor` `test` `chore` `style`

Rules: English subject, imperative mood, no trailing period, blank line before body, **Co-Authored-By trailer required**.

## Code Standards

### General
- Implement only what the current task requires
- No speculative features, no opportunistic cleanup
- One logical change per commit

### TypeScript / React
- Strict mode; no `any`
- State and side effects via hooks only
- Single responsibility per component

### Security
- Secrets via env vars only — never hardcoded
- `.env` must not be committed (verify `.gitignore`)
- CORS: production must list explicit origins, no wildcards

## Docker Access Constraints

Claude runs with host Docker socket access — high privilege, strictly scoped.

**Allowed:** `docker compose ps/up/down/logs/build/exec` on this project only.
**Prohibited:** global prune commands; touching other projects' containers.

Host service access: `host.docker.internal:<port>`

## Agentic Behavior

- **Minimal footprint**: use only permissions needed
- **Prefer reversible actions**: confirm before destructive ops
- **Pause and ask** when scope exceeds request, destructive side-effect discovered, or intent is unclear
- **No opportunistic work**: no unrequested refactoring

## Documentation Map

| Change type | Update |
|---|---|
| New feature / interface | `README.md` + `docs/PRD.md` |
| Roadmap / scope change | `docs/ROADMAP.md` |
| Architecture change | `docs/ARCHITECTURE.md` |
| Process / convention | `CLAUDE.md` (this file) |
| Env var added | `.env.example` + commit body |
| Bug fix | commit body (root cause) |
