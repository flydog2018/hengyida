/**
 * 设计器主壳：顶部发布栏 + 三栏工作台。
 *
 * 视觉纪律：MUI 承担组件可访问性底座，Tailwind 承担原创布局与视觉基线；
 * 品牌色统一读取 tailwind.config.ts 的 VI 令牌（《恒信 VI 视觉识别系统手册》V1.1），
 * 单一深蓝色系，禁止橙色/渐变/阴影。
 */
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import tailwindConfig from '../tailwind.config';
import { DesignCanvas } from './components/DesignCanvas';
import { PropertyPanel } from './components/PropertyPanel';
import { PublishBar } from './components/PublishBar';
import { WidgetPalette } from './components/WidgetPalette';

const brand = tailwindConfig.theme.extend.colors.brand;

const theme = createTheme({
  palette: {
    primary: { main: brand.DEFAULT, dark: brand.deep },
    // 单一色系：无独立强调色，secondary 沿用深蓝加深，仅用于层级区分
    secondary: { main: brand.deep },
    background: { default: brand.soft, paper: brand.paper },
    text: { primary: brand.ink, secondary: brand.muted },
  },
  typography: {
    fontFamily: 'inherit',
    button: { textTransform: 'none' },
  },
  shape: { borderRadius: 10 },
});

/** 设计器应用根组件 */
export default function App(): JSX.Element {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="flex h-screen min-h-[600px] flex-col overflow-hidden bg-slate-50">
        <PublishBar />
        <div className="flex min-h-0 flex-1">
          <aside className="w-[248px] shrink-0 border-r border-slate-200 bg-white">
            <WidgetPalette />
          </aside>
          <main className="min-w-0 flex-1">
            <DesignCanvas />
          </main>
          <aside className="w-[320px] shrink-0 border-l border-slate-200 bg-white">
            <PropertyPanel />
          </aside>
        </div>
      </div>
    </ThemeProvider>
  );
}
