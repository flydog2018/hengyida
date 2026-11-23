# 恒易搭 · 联调开发日志

> 本文只记录变量名与命令，不记录任何真实凭据值。真实凭据仅存在于本地 `.env`（已被 `.gitignore` 忽略）。

## 2026-11-23 单机 MySQL8 + Docker 联调

| 项 | 内容 |
| --- | --- |
| 执行人 | 寇豆码（Kou）· 工程师 |
| 时间窗口 | 约 17:32 – 17:40（本机时间），约 8 分钟（不含后台镜像构建） |
| 目标 | 容器化 MySQL 8 + 迁移 + 主链路（搭建→发布→自动建表→填报→渲染）+ 文档收尾 |
| 结论 | MySQL 容器 healthy、基线迁移通过；主链路 E2E 在宿主机后端（DB_HOST=127.0.0.1）与容器后端（DB_HOST=mysql）两种模式下均全部通过 |

### 1. 环境自检

- Docker Desktop 已安装且运行中：client/server 均为 `29.9.3`，Compose `v5.7.1`。
- `docker` **不在 PATH**：需把 `C:\Program Files\Docker\Docker\resources\bin` 加入 PATH，否则连带 `docker-credential-desktop` 找不到（详见踩坑 1）。
- `wsl.exe --status` 被本机安全策略 Program Blacklist 拦截（Permission denied），未绕过。结论：**WSL2 后端无法自动核验，需用户手动确认**；旁证 `docker info` 显示 `Kernel Version: 6.18.40.1-microsoft-standard-WSL2`、`Name: docker-desktop`。
- `sc.exe` 同样被拦截（未重试，不影响验证）。
- 3306 / 3307 均空闲 → 采用 `127.0.0.1:3306:3306`。

### 2. 容器与迁移

| 命令 | 输出摘要 |
| --- | --- |
| `docker compose -f deployments/private/docker-compose.yml --env-file deployments/private/.env config` | 校验通过；环境变量全部为插值，秘密字段脱敏后检查 |
| `docker compose ... up -d mysql` | 创建网络 `hengyida-private_default`、卷 `hengyida-private_mysql-data`、容器 `hengyida-mysql` |
| `docker inspect -f '{{.State.Health.Status}}' hengyida-mysql` | `starting` → `healthy`（第 2 次轮询） |
| `docker exec ... mysql -uroot -e "SELECT VERSION(); SHOW DATABASES;"` | `8.0.46`；`hengyida` 库存在；应用用户 `hengyida@%` 存在 |
| `pnpm run migrate` | `[migrate] 目标 127.0.0.1:3306/hengyida`；`业务库已就绪`；`基线表（4）: meta_apps, meta_forms, meta_policies, meta_users`；`DONE` |

### 3. 主链路 E2E

宿主机后端以 `DB_HOST=127.0.0.1` 启动（`node packages/server/dist/main.js`），容器内以 `DB_HOST=mysql` 注入。`pnpm run e2e:chain` 输出摘要：

- ① 登录成功：`user=admin role=admin`。
- ② 搭建：应用由服务端生成 `app_<uuid>`；表单 `form_e2e_<suffix>`；保存 5 个字段（`f_name/f_price/f_qty/f_amount/f_remark`，含公式与显示条件）。
- ③ 发布：`version=1`，`table=t_form_<suffix>`；DDL 为 `CREATE TABLE IF NOT EXISTS ... ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`。
- ④ 数据库核验：`information_schema` 确认物理表列 = `id, f_name, f_price, f_qty, f_amount, f_remark, created_at, updated_at`。
- ⑤ 填报：客户端伪造 `f_amount=999999`，服务端权威重算为 `50`；隐藏字段 `f_remark` 未落库。
- ⑥ 渲染：读回发布版 Schema 与列表，`total=1`，`f_name=唐山测试客户`，`f_amount=50.000000`，字段 id → 物理列映射闭环一致。
- 结论：`ALL PASS: 搭建→发布→自动建表→填报→渲染 全链路通过`。
- 回归：`pnpm test` → 6 个测试文件、62 个测试全部通过。
- 容器模式复验：停止宿主机后端后，`hengyida-server` 占用 `127.0.0.1:3000`，再次执行 `pnpm run e2e:chain` → 同样 `ALL PASS`（`DB_HOST=mysql` 容器内链路确认可用）。

### 4. 踩坑点与修复

1. **`docker compose up -d` 首次失败**：`error getting credentials - err: exec: "docker-credential-desktop": executable file not found in %PATH%`。按要求打印 `docker compose logs --tail=100 mysql`（此时无容器，输出为空）与错误栈后定位为 Docker 目录未入 PATH；命令前置 `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"` 后成功。
2. **后端启动 500/401 前置故障**：`Access denied for user 'root'@'172.18.0.1' (using password: NO)`。`deploy/config.private.ts` 在模块顶层读取 `process.env`，早于 `ConfigModule.forRoot()` 加载 `.env`，宿主机调试退化为 `root` + 空密码默认值。新增 `packages/server/src/load-env.ts` 并在 `main.ts` 首行导入，`dotenv` 加入 server 依赖；容器通过 env_file/环境注入的场景行为不变。
3. **登录返回 401**：根 `.env` 中 `ADMIN_BOOTSTRAP_PASSWORD=` 为空串，被 `?? 默认值` 判为“已设置”，导致种子管理员密码为空。修正为 `trim()` 后为空即回退内置默认；本地重建 `meta_users` 后重播种验证通过。
4. **E2E 断言误判**：应用 id 由服务端生成（非客户端指定）；`MySQLDialect.tableName` 会去掉 `form_` 前缀。两处断言已按真实契约修正。
5. **安全策略拦截**：`wsl.exe`、`sc.exe`、`wmic.exe` 被 Program Blacklist 拦截，均未绕过、未改用替代执行方式；`wmic.exe` 由包管理器间接触发，不影响结果。
6. **server 镜像构建卡住/失败**：原 Dockerfile 未复制 `tsconfig.base.json`，容器内 `tsc` 报 `TS5083: Cannot read file '/app/tsconfig.base.json'` 与 `TS1259`（esModuleInterop 失效）；默认 npm 源在容器内 `npm install` 长时间无输出。修复：`COPY package-lock.json tsconfig.base.json tsconfig.json ./`，并改用 `--registry=https://registry.npmmirror.com`。重建后 36 秒完成（安装 12s + 编译 3s），容器正常启动并通过容器模式 E2E。

### 5. 修改文件清单

- 新增：`.gitignore`、`docker-compose.yml`（根 `include` 入口）、`deployments/private/.env`（本地、忽略）、`scripts/migrate.mjs`、`scripts/e2e-chain.mjs`、`docs/dev-log.md`、`packages/server/src/load-env.ts`。
- 修改：`deployments/private/docker-compose.yml`、`deployments/private/.env.private.example`（仅占位符）、`deployments/saas/Dockerfile`（补齐 tsconfig 复制 + 国内镜像源）、`package.json`、`scripts/migrate.sh`、`packages/server/package.json`、`packages/server/src/main.ts`、`packages/server/src/modules/auth/auth.service.ts`、`README.md`、`docs/design/ARCHITECTURE.md`。
- 未修改：`.env.example` 的任何真实值；未向会提交的文件写入任何真实密码。

### 6. 未解决问题 / 待办

- **WSL2 后端**：受安全策略限制无法自动核验，需用户手动确认 Docker Desktop 使用 WSL2 based engine（当前 `docker info` 内核为 WSL2，属旁证）。
- **生产凭据**：`deployments/private/.env` 与根 `.env` 中的本地值仅用于开发联调；正式部署须替换为强随机值并妥善保管，切勿提交。
- **QA 复核**：任务 #5 由 QA 执行；当前环境状态为两容器均 Up（mysql healthy、server running）。

---

## 第二轮：P0 安全与正式化 + P1 备份/恢复（18:13–18:20）

### 1. 凭据轮换（P0）
- 新增 `scripts/generate-secrets.mjs`：生成 32 字节 base64url 的 `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` 与 48 字节 hex 的 `JWT_SECRET`；默认交互确认，`--yes` 跳过确认，`--skip-db` 只改文件。
- 同步写入根 `.env`（`DB_PASSWORD` + `JWT_SECRET`）与 `deployments/private/.env`（三个变量），保留其他变量与注释；原文件备份为被忽略的 `.env.bak-*`。
- 若 MySQL 容器运行：用旧 root 密码 `ALTER USER`（应用账号 + root 的 `%` / `localhost`），`docker compose up -d --force-recreate mysql server`，轮询 healthcheck，用新应用账号验证 `SELECT 1`。脚本不打印任何凭据值。
- 实机执行 `node scripts/generate-secrets.mjs --yes`：3/4 条 ALTER 成功（1 条为账号不存在，符合预期），容器重建后 MySQL healthy，新账号验证通过；随后 `pnpm run e2e:chain` ALL PASS。

### 2. Docker PATH 自动检测（P0）
- 新增 `scripts/ensure-docker-path.mjs`：探测 `DOCKER_BIN`、Docker Desktop 常见安装目录，注入 `process.env.PATH`；支持 `--print-export` 输出 bash/PowerShell 注入语句，支持 `-- <command>` 以修正后的 PATH 执行命令。
- `scripts/dev.mjs` 启动时自动调用；`package.json` 新增 `docker:up` / `docker:ps` / `secrets:rotate` / `backup:once` 入口。
- 实测：`node scripts/ensure-docker-path.mjs -- docker --version` 返回 Docker 29.9.3；README 一键启动前加入自动检测片段。

### 3. .env.example 补齐（P0）
- 根 `.env.example` 新增 `MYSQL_ROOT_PASSWORD`、`MYSQL_DATABASE`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_HOST_PORT`、`SERVER_HOST_PORT`、`BACKUP_RETENTION_DAYS`、`BACKUP_INTERVAL_SECONDS`，全部为占位值；`deployments/private/.env.private.example` 同步备份变量。未写任何真实值。

### 4. 每日备份 sidecar（P1）
- 新增 `scripts/mysql-backup.sh`：默认备份业务库，`--single-transaction --routines --triggers --events`，gzip 压缩，`find -mtime +7 -delete` 保留 7 天；`ONCE=1` 单次退出；`BACKUP_ALL=1` 可全库备份。
- compose 新增 `mysql-backup` 服务（mysql:8.0 镜像），挂载 `../../backups` 与只读脚本，凭据从 `.env` 插值；`backups/` 与 `.env.bak*` 已加入 `.gitignore`。
- 实测：`docker compose config -q` 通过；三容器 Up（mysql healthy）；`pnpm run backup:once` 成功生成 `mysql-hengyida-<ts>.sql.gz`。

### 5. 灾难恢复文档与演练（P1）
- 新增 `docs/DISASTER-RECOVERY.md`：覆盖卷损坏、误删表、整库丢失三场景，给出保留现场、重建卷、恢复逻辑备份、单表回灌与回归验证命令。
- 实机演练：临时库 `dr_restore_test` 建表并写入 `1:disaster-recovery-drill` → 单次备份 → DROP DATABASE → 从 gz 恢复 → 再次查询仍为 `1:disaster-recovery-drill` → 清理演练库与演练备份。**PASS**，生产库 `hengyida` 未受影响。

### 6. 本轮修改文件
- 新增：`scripts/generate-secrets.mjs`、`scripts/ensure-docker-path.mjs`、`scripts/mysql-backup.sh`、`docs/DISASTER-RECOVERY.md`、`backups/`（忽略）。
- 修改：`.gitignore`、`.env.example`、`deployments/private/.env.private.example`、`deployments/private/docker-compose.yml`、`package.json`、`scripts/dev.mjs`、`README.md`、`docs/design/ARCHITECTURE.md`、`docs/dev-log.md`。

### 7. 本轮遗留
- WSL2 UI 勾选项仍需用户手动确认（安全策略禁止自动核验）。
- P2（CI/CD、dev/staging/prod 三环境）与 P3（结构化日志、/healthz）按团队节奏另行排期，本轮未实施。

---

## 第三轮：P2 CI/CD + 多环境 / P3 可观测性（18:19–18:27）

### 1. CI/CD（P2）
- 生成 `pnpm-lock.yaml`（corepack pnpm 8.15.0），`pnpm install --frozen-lockfile --lockfile-only` 校验通过。
- 新增 `.github/workflows/ci.yml`：PR 与 main/master/develop push 触发；setup-node 20 + corepack pnpm 8.15.0；执行 `pnpm install --frozen-lockfile`、`pnpm run typecheck`、`pnpm test`、根目录与三套环境 `docker compose config -q`。
- 新增 `.gitlab-ci.yml`：`node:verify`（Node 20 跑 typecheck/test）与 `compose:verify`（docker:27.5 跑四套 compose config），MR/主干触发。
- CI 环境变量为 `ci-placeholder-*`，不依赖任何真实 `.env`。

### 2. 三套环境（P2）
- 新增 `deployments/{dev,staging,prod}/docker-compose.yml` 与对应 `.env.example`：独立项目名、容器名、命名卷与端口（dev 3306/3000，staging 3307/3001，prod 3308/3002）。
- prod 加固：`read_only: true` + `/tmp`、`/var/run/mysqld`、`/var/lib/mysql-files` tmpfs；mysql 1G / server 512M 内存上限、1 CPU；`restart: always`；`no-new-privileges:true`。
- `.gitignore` 新增 `deployments/*/.env` 与 `deployments/*/.env.bak*`；三套 compose 用各自 example 做 `--env-file` 配置校验，全部通过。
- package.json 新增 `compose:check` 一键校验四套编排。

### 3. 结构化日志与 /healthz（P3）
- 新增 `pino@^10.4.0`、`pino-http@^11.0.0` 到 server 依赖；`package-lock.json` 与 `pnpm-lock.yaml` 同步更新。
- 新增 `packages/server/src/common/JsonLoggerService.ts`：实现 NestJS LoggerService，pino JSON 输出，`Authorization`/Cookie/密码/JWT/DB 口令脱敏为 `[REDACTED]`；`readVersion()` 从 `packages/server/package.json` 读取版本。
- `main.ts`：启用 `bufferLogs` + `useLogger`，注册 `pino-http` 请求日志；注册根路径 `GET /healthz`（绕过 `/api` 前缀与响应包装），返回 status/db/dbPingMs/version/deployMode/uptimeSeconds/timestamp，DB 异常返回 503。
- 踩坑：`readVersion()` 初版用 `../package.json`，编译后位于 `dist/common` 导致版本显示 `unknown`；改为 `../../package.json` 后源码与编译产物均正确（1.1.0）。
- 重建 server 镜像并复验：`curl /healthz` → 200 JSON（db=up, version=1.1.0）；日志为 JSON 行；带 `Authorization: Bearer dummy-secret-token` 请求后日志中该 token 为 `[REDACTED]`；server 容器 healthcheck 状态 `healthy`。

### 4. 本轮修改文件
- 新增：`pnpm-lock.yaml`、`.github/workflows/ci.yml`、`.gitlab-ci.yml`、`deployments/dev/*`、`deployments/staging/*`、`deployments/prod/*`、`packages/server/src/common/JsonLoggerService.ts`。
- 修改：`package.json`、`package-lock.json`、`.gitignore`、`deployments/private/docker-compose.yml`（server healthcheck）、`packages/server/package.json`、`packages/server/src/main.ts`、`README.md`、`docs/design/ARCHITECTURE.md`、`docs/dev-log.md`。

### 5. 本轮验证
- `pnpm run typecheck`：0 错误；`pnpm test`：62/62；`pnpm run e2e:chain`：ALL PASS。
- `docker compose config -q`：根 + dev/staging/prod 四套全通过。
- `curl http://127.0.0.1:3000/healthz`：200 + JSON；server 容器 `healthy`。
- 敏感串扫描：可提交文件 0 命中（详见最终回归输出）。
