# 恒易搭 · 原创视觉基线（VI 落地基准）

| 项目 | 内容 |
| --- | --- |
| 文档类型 | VI 规范在恒易搭产品中的落地基准 |
| 权威来源 | 《恒信 VI 视觉识别系统手册》V1.1（2026-11），恒信企业管理咨询（唐山）有限公司 |
| 手册节点 | WorkBuddy 资料库（VI 手册，单一权威版本，旧版同时废止） |
| 定稿日期 | 2026-11-23 |
| 适用包 | packages/designer、packages/runtime（server 不涉视觉） |

> 本文件是 VI 手册在产品工程侧的**执行基准**。凡界面视觉决策，一律以此为准；手册未覆盖的新场景，须报行政归口部门审核。原一期「深蓝 #1E3A8A + 橙 #F59E0B + 搭积木 Logo」占位方案已全部废止。

## 1. 品牌理念

- 品牌名称：恒信（HengXin）；产品口号：恒信出方案，恒易搭系统
- 品牌口号：恒以立身，信以成事
- 视觉策略四原则：稳固（深蓝主色）、意形（H·X 交织成蜂）、极简（纯几何无渐变）、原生（字体图形可商用可无限缩放）

## 2. 标准色板（单一色系，禁用第二强调色）

| 令牌 | HEX | RGB | 手册名称 | 产品用途 |
| --- | --- | --- | --- | --- |
| `brand.DEFAULT` | #1B3D73 | 27,61,115 | 基石深蓝 | 标志、标题、主视觉、主按钮、选中态 |
| `brand.deep` / `brand.accent` | #13305C | 19,48,92 | 深蓝加深（手册 --blue-d） | hover/active、次要强调（单色系无独立强调色） |
| `brand.soft` | #E8EFF8 | 232,239,248 | 浅雾蓝 | 页面背景、卡片底、斑马纹、选中浅底 |
| `brand.muted` | #9AA4B2 | 154,164,178 | 中灰 | 辅助信息、分隔线 |
| `brand.ink` | #1A1A1A | 26,26,26 | 墨黑 | 正文 |
| `brand.paper` | #FFFFFF | 255,255,255 | 纯白 | 反白、留白、底色 |

**严禁**：橙色、渐变、阴影、描边、立体特效、低对比背景上使用标志。

## 3. 标准字体

- 中文标题/正文：思源黑体 Source Han Sans SC（Bold/Heavy 标题，Regular/Medium 正文），SIL OFL 1.1 免费商用
- 英文/拼音：Source Sans 3 SemiBold，SIL OFL 1.1
- 兜底：阿里巴巴普惠体、微软雅黑（仅系统显示，不用于对外物料）
- 标准字体栈见 `packages/shared/constants/brand.ts` 的 `VI_FONT_STACK`，与两端 Tailwind `fontFamily.sans` 一致

## 4. 标志使用

- 标准图形：H·X 蜜蜂意形（恒信首字母交织，展翅向上），原创设计、不引用任何外部素材
- 四种标准文件（禁止自行仿制/改色/拉伸）：
  - `logo-primary.png` 完整组合（图形+字标+标语）——正式文件抬头、官网
  - `logo-reverse.png` 反白完整组合——深色背景
  - `logo-symbol.png` 纯图形标——favicon、App 图标、屏幕小尺寸
  - `logo-symbol-reverse.png` 反白图形标——深色顶栏
- 存放位置：`packages/designer/public/brand/`、`packages/runtime/public/brand/`
- 安全留白：标志四周 ≥ 一个图形单元（X）；屏幕最小宽度 ≥ 40px，印刷 ≥ 26mm
- 产品内使用：设计器顶栏用 `logo-symbol.png`（40px），运行端深色顶栏用 `logo-symbol-reverse.png`（36px），浏览器 favicon 用 `logo-symbol.png`

## 5. 工程落点（单一真源）

| 层级 | 文件 | 作用 |
| --- | --- | --- |
| 共享契约 | `packages/shared/constants/brand.ts` | VI_COLORS / VI_FONT_STACK / VI_SLOGANS / VI_BRAND / VI_LOGO_ASSETS 唯一定义，导出到 shared 主入口 |
| 设计器 | `packages/designer/tailwind.config.ts` | brand 色板 + 字体栈（与共享契约一致） |
| 设计器 | `packages/designer/src/App.tsx` | MUI 主题从 Tailwind brand 令牌注入 |
| 运行端 | `packages/runtime/tailwind.config.ts` | 同上 |
| 运行端 | `packages/runtime/src/main.tsx` | MUI 主题（深蓝/浅雾蓝/墨黑/中灰）+ 字体栈 |
| 静态资源 | 各前端 `public/brand/*.png` | VI 标准标志文件 |
| HTML 入口 | 各前端 `index.html` | theme-color #1B3D73、favicon 纯图形标、品牌署名 |

> 修改品牌色时：改 `brand.ts` 与两个 `tailwind.config.ts`（保持一致），业务组件只使用 `brand` 令牌类，零改动。

## 6. 原创性声明（知识产权溯源）

VI 手册第 11 章明确：标志以「恒信」首字母 H、X 独立推演为蜜蜂意形，为本项目原创；未抄袭或近似任何现有品牌标识；图形不引用任何外部图片/图标库/第三方素材；标准字用思源黑体（SIL OFL 1.1）重绘，可自由商用；设计成果著作权归委托方所有。

产品交互与代码的原创性留痕见 `docs/design/originality-checklist.md`。
