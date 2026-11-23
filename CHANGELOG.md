# 更新日志（CHANGELOG）

本项目遵循语义化版本（SemVer）。最新稳定版本：`v0.1.0`。

## [v0.1.0] - 2026-11-23

首个可交付版本：MySQL 8 容器化、主链路端到端验证通过、P1/P2/P3 全部完成。

### Added（新增）

- **容器化数据库**：`deployments/private/docker-compose.yml` 使用 `mysql:8.0` + 命名卷 `mysql-data` + `mysqladmin ping` 健康检查，端口绑定 `127.0.0.1:3306`（冲突可切 3307）；根 `docker-compose.yml` 通过 `include` 复用，保证共用同一命名卷。
- **迁移与主链路 E2E**：`scripts/migrate.mjs`（幂等建库 + 4 张元数据表）、`scripts/e2e-chain.mjs`（搭建表单 → 发布 → 自动建表 → 填报 → 渲染，含 `information_schema` 物理列核验与服务端公式权威重算断言）。
- **P1 备份与灾难恢复**：`mysql-backup` sidecar 每日 `mysqldump` → gzip → `backups/`，保留 7 天，`pnpm run backup:once` 可手动触发；`docs/DISASTER-RECOVERY.md` 覆盖卷损坏 / 误删表 / 整库丢失三场景，并完成真实恢复演练。
- **P2 CI/CD 与多环境**：GitHub Actions 唯一 CI（PR + 主干触发 typecheck / test / 四套 compose config）；`deployments/{dev,staging,prod}` 三套独立编排与 env 样例，prod 启用只读根文件系统、tmpfs、CPU/内存限额、`restart: always`。
- **P3 可观测性**：pino + pino-http 结构化 JSON 日志（`JsonLoggerService`，敏感字段脱敏）、`GET /healthz`（DB ping + 版本 + 部署模式，DB down 返回 503），compose server 健康Check 使用该端点。
- **P0 安全与正式化**：`scripts/generate-secrets.mjs` 强随机凭据轮换（同步两个本地 `.env`，运行时同步 ALTER USER 并重建容器）、`scripts/bootstrap.mjs` 一键环境引导、`scripts/check-wsl2.sh`/`.mjs` WSL2 四断言自动核验并接入 E2E 前置、`scripts/ensure-docker-path.mjs` Docker PATH 自动检测与 `prestart`。
- **工程文档**：`CHANGELOG.md`、`.env.example` / 各环境 env 样例、`docs/dev-log.md`、`docs/DISASTER-RECOVERY.md`、`CONTRIBUTING.md`。

### Changed（变更）

- 凭据管理改为「本地 `.env` + 占位样例 + 脚本轮换」：compose 全部改用 `${VAR}` 插值，不再写死凭据；`.gitignore` 忽略 `.env` / `.bak-*` / `backups/` / 依赖与构建产物。
- 部署模式收敛为单一 GitHub Actions；早期并存的 `.gitlab-ci.yml` 已移除，避免两套配置命令漂移。
- 根 `package.json` 显式声明 `vite` 为 devDependency，使根 `tsconfig.json` 的 `types: ["vite/client"]` 在 pnpm 严格隔离的 CI 环境下可解析（此前仅靠 npm 扁平化提升子包 vite 才可通过）。

### Fixed（修复）

- 宿主机调试时部署配置早于 `.env` 加载导致 root 空密码连接失败：新增 `packages/server/src/load-env.ts` 并在入口首行导入。
- `ADMIN_BOOTSTRAP_PASSWORD=` 空串被当作真实密码导致登录 401：改为 trim 后回退默认值。
- E2E 断言误判（应用 ID 由服务端生成、MySQLDialect 去 `form_` 前缀）：按真实契约修正。
- server 镜像构建缺 `tsconfig.base.json`（TS5083/TS1259）且默认 npm 源卡住：补齐复制并改用国内镜像源。
- 结构化日志版本初版显示 `unknown`（编译后 `__dirname` 路径差一级）：改为 `../../package.json` 后显示 `1.1.0`。
- CI Typecheck 失败 `TS2688: Cannot find type definition file for 'vite/client'`：根加 vite devDependency 后修复（详见 Changed）。

### Security（安全）

- 管理员密码由 SHA-256 改为 **bcrypt**（bcryptjs，`$2a$`），旧 SHA-256 账号首次成功登录后透明升级。
- 生产环境 JWT_SECRET 缺失 / 弱值 / 长度 <32 时 **fail-fast 拒绝启动**。
- 凭据轮换脚本生成强随机值（root 32 字节 base64url、应用账号 32 字节 base64url、JWT 48 字节 hex），只写被忽略的本地 `.env`，备份旧文件亦被忽略，**全程不回显明文**。
- 日志统一脱敏 `Authorization` / Cookie / 密码 / JWT / DB 口令为 `[REDACTED]`。
- 敏感串扫描：提交文件中真实凭据 **零命中**；仅 3 个含 `secret`/`password` 字样的源码文件（密钥校验实现与生成脚本），经内容级反查确认无明文。
