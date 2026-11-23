/**
 * 恒信 VI 品牌令牌（单一真源）
 *
 * 依据：《恒信 VI 视觉识别系统手册》V1.1（2026-11）
 * 来源：WorkBuddy 资料库节点 SaBRDplgdE6s8uD7fY49aD
 *
 * 品牌采用【单一色系】策略——基石深蓝为绝对主色，配中性色使用。
 * 严禁引入橙色等第二强调色或渐变/阴影；原一期占位的「深蓝 + 橙」
 * 方案已废止，全部以本文件为准。designer / runtime / server 共用本契约。
 */

/** VI 标准色板（屏幕端以 HEX 为准） */
export const VI_COLORS = {
  /** 基石深蓝 #1B3D73 — 标志、标题、主视觉（RGB 27,61,115） */
  primary: '#1B3D73',
  /** 深蓝加深 #13305C — hover/active/次要强调（VI 手册 --blue-d） */
  deep: '#13305C',
  /** 兼容旧 accent 令牌：单色系无独立强调色，映射为深蓝加深 */
  accent: '#13305C',
  /** 浅雾蓝 #E8EFF8 — 背景、卡片底、斑马纹（RGB 232,239,248） */
  soft: '#E8EFF8',
  /** 中灰 #9AA4B2 — 辅助信息、分隔线（RGB 154,164,178） */
  muted: '#9AA4B2',
  /** 墨黑 #1A1A1A — 正文、印刷黑 */
  ink: '#1A1A1A',
  /** 纯白 #FFFFFF — 反白、留白、底色 */
  paper: '#FFFFFF',
} as const;

/**
 * VI 标准字体栈。
 * 中文标题/正文：思源黑体 Source Han Sans SC（SIL OFL 1.1 免费商用）
 * 英文/拼音：Source Sans 3（SIL OFL 1.1 免费商用）
 * 微软雅黑仅作系统显示兜底，不用于对外物料。
 */
export const VI_FONT_STACK = [
  '"Source Han Sans SC"',
  '"Noto Sans SC"',
  '"Source Sans 3"',
  '"Alibaba PuHuiTi"',
  '"Microsoft YaHei"',
  'system-ui',
  'sans-serif',
] as const;

/** 品牌与产品口号 */
export const VI_SLOGANS = {
  brand: '恒以立身，信以成事',
  product: '恒信出方案，恒易搭系统',
} as const;

/** 品牌主体信息 */
export const VI_BRAND = {
  name: '恒信',
  nameEn: 'HengXin',
  company: '恒信企业管理咨询（唐山）有限公司',
  manualVersion: 'V1.1',
} as const;

/** Logo 资源路径（相对前端 public 根，源自 VI 手册标准文件，禁止自行仿制） */
export const VI_LOGO_ASSETS = {
  /** 完整组合：图形 + 字标 + 标语，用于正式文件抬头、官网 */
  primary: '/brand/logo-primary.png',
  /** 反白完整组合，用于深色背景 */
  reverse: '/brand/logo-reverse.png',
  /** 纯图形标，用于 favicon、App 图标、极小尺寸 */
  symbol: '/brand/logo-symbol.png',
  /** 反白图形标 */
  symbolReverse: '/brand/logo-symbol-reverse.png',
} as const;

export type ViColorKey = keyof typeof VI_COLORS;
