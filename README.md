# 恒易搭（HengYiDa）

> 恒信出方案，恒易搭系统。
> 原创零代码信息化系统搭建平台 · 内部研发代号「织蜂」（zhifeng / weaver）

面向企业的零代码搭建平台：业务人员通过拖拽控件即可搭建业务系统，一次搭建自动适配 PC 与 H5，支持 SaaS 与私有化双模式（一期以本地可运行为主，SaaS 底座预留）。

## 技术栈（🔒 v1.1 决策锁定）

| 层 | 选型 |
| --- | --- |
| 前端 | Vite + React 18 + TypeScript + MUI 5 + Tailwind 3 |
| 拖拽 | @dnd-kit 底层能力 + 100% 自研交互层 |
| 设计器状态 | Zustand |
| 后端 | Node.js + NestJS + TypeScript |
| 数据库 | MySQL 8.0（唯一实现，Knex + 方言抽象预留切换） |
| 公式 | 自研受限 AST（jsep + 白名单求值，禁 eval） |
| Schema 校验 | Ajv |
| 认证 | JWT + 自研 RBAC / 行级规则 |
| 部署 | Docker Compose 基础容器化 + dev/staging/prod 三套编排（K8s/计费 Phase 3） |
| CI | GitHub Actions + GitLab CI（PR 触发：typecheck / test / compose config） |
| 可观测 | pino 结构化 JSON 日志 + `GET /healthz`（DB ping + 版本） |

## 目录导航

```
hengyida/
├── docs/prd/          # 产品需求文档（PRD-MVP.md v1.1 决策锁定版）
├── docs/design/       # 架构设计、类图/时序图、原创性自查、视觉基线
├── docs/api/          # OpenAPI 3.0 契约
├── docs/DISASTER-RECOVERY.md  # 备份/恢复与演练记录
├── packages/
│   ├── shared/        # 前后端共享：类型 / 常量 / 控件注册表 / 公式内核
│   ├── designer/      # 设计器（搭建者用）
│   ├── runtime/       # 运行端（最终用户用）
│   └── server/        # NestJS 后端 + 核心引擎
├── deployments/       # saas / private 部署配置（同一套代码，仅配置不同）
├── scripts/           # 构建、开发、迁移脚本
└── tests/             # 单元 / 集成 / E2E（TEST_STRATEGY.md v1.1）
```

**核心纪律**：designer 与 runtime 互不 import，唯一耦合点是 `@hengyida/shared` 的 `FormSchema` 类型与 `widget-registry` 控件注册表；server/core 四引擎不依赖具体数据库；业务代码零 SaaS/私有化分支。

## 本地快速启动

前置：Node ≥ 20、pnpm 8（或 npm 10）、Docker Desktop（WSL2 后端）。数据库一律容器化，不依赖本机安装 MySQL。

```bash
# 1. 安装依赖（国内镜像，避免官方源卡住）
npm install --registry=https://registry.npmmirror.com

# 2. 一键引导：复制两份 example 为本地 .env，并自动生成强随机凭据
#    真实凭据只写本地文件（权限 0600），均已被 .gitignore 忽略；不覆盖已有 .env
pnpm run bootstrap
# 已有 .env 想轮换：pnpm run secrets:rotate（交互确认，并同步数据库账号与容器）

# 3. Docker PATH 自动检测（Windows 常见坑：Docker Desktop 默认不写入 PATH）
#    pnpm start 的 prestart 会自动检测并注入；交互 shell 可用以下命令：
pnpm run prestart
if ! command -v docker >/dev/null 2>&1; then
  eval "$(node scripts/ensure-docker-path.mjs --print-export)"
fi
docker --version

# 4. WSL2 后端自动核验（docker info 四断言，不调用 WSL 命令行工具）
#    pnpm run e2e:chain 也会自动执行同一检查
pnpm run wsl2:check

# 5. 一键启动：容器化 MySQL 8 + 后端/设计器/运行端
docker compose up -d && pnpm run dev
# 完全不依赖当前 shell PATH 的等价写法：
# pnpm run docker:up && pnpm run dev
```

> 根目录 `docker-compose.yml` 通过 `include` 复用 `deployments/private/docker-compose.yml`。`scripts/ensure-docker-path.mjs` 会自动探测 Docker Desktop 常见安装目录；PowerShell 用户可先执行 `$env:Path = "C:\Program Files\Docker\Docker\resources\bin;$env:Path"`。
> 3306 被占用时，把 `deployments/private/.env` 的 `MYSQL_HOST_PORT` 改为 3307，并同步根 `.env` 的 `DB_PORT=3307`。容器内后端始终用服务名 `mysql`，不受宿主端口影响。

或分别启动：

```bash
pnpm run dev:server     # 3000
pnpm run dev:designer   # 5173
pnpm run dev:runtime    # 5174

# 类型检查 / 构建 / 测试
pnpm run typecheck
pnpm run build
pnpm test
```

## 数据库与主链路验证（MySQL 8.0）

本机若无 MySQL/Docker，可先用离线集成测试验证核心引擎链路（无需数据库）：

```bash
npx vitest run --root packages/server src/main-chain.integration.test.ts
# 覆盖：搭建→发布→生成DDL→服务端公式计算→权限过滤→落库数据形状→渲染契约
```

真实数据库端到端联调（已在本机 Docker + MySQL 8.0.46 验证通过）：

```bash
# 1. 起库并等 healthcheck 通过
docker compose up -d
docker compose ps        # hengyida-mysql 状态应含 (healthy)

# 2. 基线迁移（建库 + meta_apps/meta_forms/meta_policies/meta_users，幂等）
pnpm run migrate

# 3. 启动后端（宿主机调试 DB_HOST=127.0.0.1；容器内 DB_HOST=mysql）
pnpm run dev:server

# 4. 主链路 E2E：搭建 → 发布 → 自动建表 → 填报 → 渲染
pnpm run e2e:chain
# 输出含：发布表名、information_schema 物理列核验、公式权威重算结果、渲染回读结果

# 或浏览器手工验证：
# 设计器 http://localhost:5173 新建应用 → 拖拽字段 → 配置公式 → 一键发布（自动建表）
# 运行端 http://localhost:5174?formId=<id> 填报 → 数据落库
```

> 业务动态表 `t_form_<formId>` 不由 migrate 创建，而是在表单发布时由 `DataEngine.ensureTable` 幂等生成（`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN`，只增不删）。

## 备份与灾难恢复

`mysql-backup` sidecar 每日用 `mysqldump` 备份业务库到 `backups/`，gzip 压缩，默认保留 7 天；`backups/` 已被 `.gitignore` 忽略。

```bash
# 手动立即备份一次
pnpm run backup:once

# 查看备份文件（仅文件名）
ls -lh backups

# 卷损坏 / 误删表 / 整库丢失的恢复步骤与演练记录
# 见 docs/DISASTER-RECOVERY.md
```

## 多环境编排（dev / staging / prod）

三套环境各自独立项目名、容器名、宿主端口与命名卷，互不影响：

| 环境 | 编排 | 本地 env | MySQL 宿主端口 | Server 宿主端口 |
| --- | --- | --- | --- | --- |
| dev | `deployments/dev/docker-compose.yml` | `deployments/dev/.env` | 3306 | 3000 |
| staging | `deployments/staging/docker-compose.yml` | `deployments/staging/.env` | 3307 | 3001 |
| prod | `deployments/prod/docker-compose.yml` | `deployments/prod/.env` | 3308 | 3002 |

```bash
cp deployments/prod/.env.example deployments/prod/.env
# 填入强随机 MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / JWT_SECRET
docker compose -f deployments/prod/docker-compose.yml --env-file deployments/prod/.env up -d
```

prod 基线额外启用：MySQL 只读根文件系统 + `tmpfs`、CPU/内存限额、`restart: always`、`no-new-privileges`。三个环境的 `.env` 均被 `.gitignore` 忽略。

本地快速校验全部编排：`pnpm run compose:check`。

## CI/CD

- GitHub Actions：`.github/workflows/ci.yml`，PR 与 main/master/develop push 自动触发。
- GitLab CI：`.gitlab-ci.yml`，MR 与主干自动触发，拆成 `node:verify` 与 `compose:verify` 两个作业。
- 两者均执行 `pnpm run typecheck`、`pnpm test`、根目录及三套环境的 `docker compose config -q`；CI 只使用占位凭据，不依赖真实 `.env`。

## 可观测性

- 服务端使用 **pino** 输出结构化 JSON 日志，HTTP 请求日志由 `pino-http` 输出；`Authorization` / Cookie / 密码 / JWT 字段自动脱敏为 `[REDACTED]`。
- 日志级别由 `LOG_LEVEL` 控制（默认 `info`）。
- 健康检查端点：`GET http://localhost:3000/healthz`，不经过 `/api` 前缀与统一响应包装，返回 DB ping、版本、部署模式、运行时长；DB 不可用时返回 `503`。
- Docker Compose 的 `server` 已用该端点作为 healthcheck。

```bash
curl -s http://localhost:3000/healthz
# {"status":"ok","db":"up","dbPingMs":3,"version":"1.1.0",...}
```

## 生产安全（🔒 v1.3 强制项）

- **凭据轮换**：`pnpm run secrets:rotate` 会生成强随机 `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` / `JWT_SECRET`，同步写入两个本地 `.env`；若 MySQL 容器在运行，还会 `ALTER USER` 并重建 mysql/server 容器，最后验证主链路。旧 `.env` 会备份为被忽略的 `.env.bak-*`。
- **JWT_SECRET**：生产环境必须设为 ≥32 字符强随机值；若缺失/弱值将**拒绝启动**（见 `server/src/deploy/secret.ts`）。
- **管理员密码**：默认种子 `admin/admin123` 仅用于私有化开箱；生产请设置 `ADMIN_BOOTSTRAP_PASSWORD`，或登录后立即改密。密码摘要已用 **bcrypt**（bcryptjs，标准 `$2a$` 哈希），旧 SHA-256 账号在首次成功登录后自动透明升级。
- 首次植入默认管理员时控制台会打印提示；生产仍用弱口令会打印醒目警告。

> 一期范围、两波次划分与排期详见 `docs/design/ARCHITECTURE.md`（v1.3 单人基准版：波次1 核心闭环本期交付，波次2 Excel/行级权限/H5 深度暂存 Phase 2）。
> 原创性红线与留痕要求详见 `docs/design/originality-checklist.md`；VI 视觉基准详见 `docs/design/visual-baseline.md`。
