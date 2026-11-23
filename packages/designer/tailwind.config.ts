import type { Config } from 'tailwindcss';

// 恒信 VI 品牌令牌（依据《恒信 VI 视觉识别系统手册》V1.1）
// 单一深蓝色系：基石深蓝主色 + 中性色，无橙色/渐变/阴影。
// 与 @hengyida/shared/constants/brand.ts 的 VI_COLORS / VI_FONT_STACK 保持一致。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1B3D73', // 基石深蓝（主色）
          deep: '#13305C', // 深蓝加深（hover/active）
          accent: '#13305C', // 单色系：无独立强调色，沿用深蓝加深
          soft: '#E8EFF8', // 浅雾蓝（背景/卡片底/斑马纹）
          muted: '#9AA4B2', // 中灰（辅助信息/分隔线）
          ink: '#1A1A1A', // 墨黑（正文）
          paper: '#FFFFFF', // 纯白
        },
      },
      fontFamily: {
        sans: [
          '"Source Han Sans SC"',
          '"Noto Sans SC"',
          '"Source Sans 3"',
          '"Alibaba PuHuiTi"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
} satisfies Config;
