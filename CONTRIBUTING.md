# 贡献指南（CONTRIBUTING）

恒易搭（HengYiDa）零代码搭建平台协作规范。适用于内部研发与受邀协作者。

## 一、分支规范

| 分支 | 用途 | 说明 |
| --- | --- | --- |
| `main` | 稳定主干 / 发布分支 | 只接受经过验证的合并；CI 必须通过；打 tag 只基于 main |
| `develop` | 集成开发分支 | 日常功能汇入点；从 main 切出，定期回并 main |
| `feature/<简述>` | 功能开发 | 从 develop 切出，完成后 PR 回 develop。例：`feature/form-permission` |
| `fix/<简述>` | 缺陷修复 | 从 develop（或 main 的 hotfix 从 main）切出。例：`fix/login-401` |
| `docs/<简述>` | 文档变更 | 仅文档时可用。例：`docs/api-contract` |
| `chore/<简述>` | 工程/依赖/脚本 | 例：`chore/upgrade-pnpm` |

**硬性约定**
- 禁止直接向 `main` 提交；一律通过 PR。
- 分支命名用小写、连字符分隔，不使用中文与空格。
- 单个 PR 聚焦一件事，控制在可 review 的体积。

## 二、Commit Message 规范

采用 Conventional Commits，格式：`<type>(<scope>): <subject>`

| type | 含义 | 示例 |
| --- | --- | --- |
| `feat` | 新功能 | `feat(data): 新增行级权限过滤` |
| `fix` | 缺陷修复 | `fix(auth): 空串管理员口令回退默认值` |
| `docs` | 文档 | `docs: 补充灾难恢复演练记录` |
| `chore` | 工程/依赖/配置 | `chore: 根加 vite 依赖修复 CI typecheck` |
| `refactor` | 重构（无功能变化） | `refactor(schema): 抽离字段校验器` |
| `test` | 测试 | `test: 增加公式引擎边界用例` |
| `perf` | 性能 | `perf(data): 列表查询加索引` |
| `security` | 安全 | `security: JWT 弱值 fail-fast` |

约定：
- `<scope>` 可选，建议用模块名（`auth` / `data` / `schema` / `formula` / `ci`）。
- `<subject>` 用祈使句、不超过 72 字符、结尾不加标点。
- 破坏性变更在正文写 `BREAKING CHANGE: ...`。

## 三、PR 模板

新建 PR 时按以下结构填写（可保存为 `.github/PULL_REQUEST_TEMPLATE.md`）：

```markdown
## 变更说明
<!-- 做了什么，为什么做 -->

## 关联 Issue
<!-- Closes #123 -->

## 变更类型
- [ ] feat 新功能
- [ ] fix 缺陷修复
- [ ] docs 文档
- [ ] chore 工程/依赖
- [ ] refactor 重构
- [ ] security 安全

## 自检清单
- [ ] `pnpm run typecheck` 通过
- [ ] `pnpm test` 通过（当前基线 62 项）
- [ ] 涉及主链路时 `pnpm run e2e:chain` 通过（需本地 MySQL 容器 healthy）
- [ ] 未提交任何 `.env`、口令、密钥、备份数据
- [ ] 文档/CHANGELOG 已同步（如需要）

## 验证方式
<!-- 关键命令与结果摘要 -->
```

## 四、本地开发环境

前置：Node ≥ 20、pnpm 8（Corepack）、Docker Desktop（WSL2 后端）。

```bash
pnpm run bootstrap     # 复制样例生成本地 .env + 强随机凭据（不覆盖已有）
pnpm run prestart      # 自动检测并注入 Docker PATH
pnpm run wsl2:check    # 四断言核验 WSL2 后端
pnpm run docker:up && pnpm run migrate && pnpm run dev
pnpm run e2e:chain     # 主链路 E2E（含 WSL2 前置断言）
```

> 数据库一律走容器，不安装本机 MySQL 服务。真实凭据只写在被 `.gitignore` 忽略的本地 `.env`。

## 五、CI 与合并

- 唯一 CI 平台为 **GitHub Actions**（`.github/workflows/ci.yml`），PR 与主干 push 自动触发：typecheck → test → 四套 compose config。
- CI 失败不得合并；本地先按第四节命令复现并修复。
- 合并回 `main` 后按语义化版本打 tag（当前 `v0.1.0`），发布说明见 `CHANGELOG.md`。
