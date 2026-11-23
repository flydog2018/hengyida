# 恒易搭 · 备份与灾难恢复（Disaster Recovery）

> 适用范围：私有化单机 Docker Compose 部署（MySQL 8.0）。
> 原则：**先保现场，再恢复；先验证备份，再动生产数据。**

## 1. 备份机制

- 编排入口：仓库根目录 `docker-compose.yml` 复用 `deployments/private/docker-compose.yml`。
- 备份服务：`mysql-backup`（`mysql:8.0` 镜像，自带 `mysqldump`）。
- 备份内容：默认备份业务库 `MYSQL_DATABASE`（`hengyida`），可用 `BACKUP_ALL=1` 改为全库。
- 备份频率：`BACKUP_INTERVAL_SECONDS`，默认 `86400`（每天一次）。
- 保留策略：`BACKUP_RETENTION_DAYS`，默认 `7` 天，按文件名 `mysql-*.sql.gz` 清理。
- 存放位置：仓库根目录 `backups/`（已被 `.gitignore` 忽略，禁止提交）。
- 脚本：`scripts/mysql-backup.sh`（不含任何密码，凭据全部来自环境变量）。

常用命令（在仓库根目录执行）：

```bash
# 手动立即备份一次（演练/升级前建议先跑）
pnpm run backup:once

# 查看备份文件（只看文件名，不打印内容）
ls -lh backups

# 查看备份容器状态
pnpm run docker:ps
```

加载本地凭据（后续所有恢复命令都依赖它；**不要 cat 输出 .env 内容**）：

```bash
set -a; . deployments/private/.env; set +a
LATEST=$(ls -1t backups/mysql-hengyida-*.sql.gz | head -1)
echo "使用备份：$LATEST"
```

## 2. 场景 A：卷损坏（卷存在但数据文件不可用）

**症状**：MySQL 启动失败、日志出现 InnoDB 表空间损坏、`docker compose ps` 长时间 unhealthy。

```bash
# 1) 立即停服，避免二次写入
docker compose down

# 2) 保留损坏卷的取证副本（便于排查，不要直接删）
mkdir -p backups/incidents
docker run --rm \
  -v hengyida-private_mysql-data:/data \
  -v "$PWD/backups/incidents:/out" \
  alpine tar czf "/out/mysql-volume-$(date +%Y%m%d-%H%M%S).tar.gz" -C /data .

# 3) 删除损坏卷，让 Compose 用镜像环境重新初始化
docker volume rm hengyida-private_mysql-data

# 4) 起库并等待 healthy
docker compose up -d
docker compose ps        # hengyida-mysql 应显示 (healthy)

# 5) 重建元数据表（幂等）
pnpm run migrate

# 6) 恢复业务库逻辑备份
set -a; . deployments/private/.env; set +a
LATEST=$(ls -1t backups/mysql-hengyida-*.sql.gz | head -1)
gzip -dc "$LATEST" | docker compose exec -T \
  -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
  mysql mysql -uroot hengyida

# 7) 业务回归
pnpm run e2e:chain
```

> 说明：镜像会按 `MYSQL_ROOT_PASSWORD` / `MYSQL_USER` / `MYSQL_PASSWORD` 重建数据库账号；元数据表由 `migrate` 重建，动态业务表由备份 SQL 恢复。

## 3. 场景 B：误删表（单表或少量表）

**优先策略**：把最新备份恢复到**临时库**，再只把需要的表拷回业务库，避免整库覆盖造成二次损失。

```bash
set -a; . deployments/private/.env; set +a
LATEST=$(ls -1t backups/mysql-hengyida-*.sql.gz | head -1)
TABLE='t_form_xxxx'   # 替换为实际表名；元数据表名为 meta_xxx

# 1) 建临时库并从备份恢复
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot \
  -e "DROP DATABASE IF EXISTS dr_restore; CREATE DATABASE dr_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -dc "$LATEST" | docker compose exec -T \
  -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
  mysql mysql -uroot dr_restore

# 2) 核对临时库里的表和数据
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot dr_restore \
  -e "SHOW TABLES LIKE '${TABLE}'; SELECT COUNT(*) FROM \`${TABLE}\`;"

# 3) 拷回业务库（先确认无误再执行）
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot \
  -e "DROP TABLE IF EXISTS hengyida.\`${TABLE}\`; CREATE TABLE hengyida.\`${TABLE}\` LIKE dr_restore.\`${TABLE}\`; INSERT INTO hengyida.\`${TABLE}\` SELECT * FROM dr_restore.\`${TABLE}\`;"

# 4) 清理临时库并回归
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot -e "DROP DATABASE dr_restore;"
pnpm run e2e:chain
```

> 若误删的是 `meta_forms` 等元数据表，拷回后需要重启 server 让缓存失效：`docker compose restart server`。

## 4. 场景 C：整库丢失（库被 DROP / 数据卷被误删）

```bash
# 若数据卷也被删，先按场景 A 的第 1～5 步重建卷与元数据表。

set -a; . deployments/private/.env; set +a
LATEST=$(ls -1t backups/mysql-hengyida-*.sql.gz | head -1)

docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot \
  -e "CREATE DATABASE IF NOT EXISTS hengyida CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
gzip -dc "$LATEST" | docker compose exec -T \
  -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" \
  mysql mysql -uroot hengyida

# 核验与回归
docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot hengyida -e "SHOW TABLES;"
pnpm run e2e:chain
```

## 5. 恢复演练记录（2026-11-23）

演练目标：验证「备份 → 删库 → 恢复 → 数据校验」链路可用，且恢复后的数据与演练前一致。

- 演练对象：临时库 `dr_restore_test`（不触碰生产库 `hengyida`）。
- 演练数据：表 `t_check`，1 行记录，`note='disaster-recovery-drill'`。
- 备份命令：`docker compose run --rm -e ONCE=1 -e BACKUP_DB=dr_restore_test mysql-backup`。
- 恢复方式：`gzip -dc <drill dump> | docker compose exec -T -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql mysql -uroot dr_restore_test`。
- 结果：**PASS**——删库后从备份恢复，`SELECT COUNT(*) FROM t_check` = 1，`note` 值一致。
- 清理：演练库与演练备份文件已删除，生产库未受影响。

> 演练结果由实际执行命令输出确认；具体备份文件名含时间戳，不在此固定记录，避免与后续备份混淆。
