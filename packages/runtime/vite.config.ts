import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared', import.meta.url));

// 生产构建时可由环境变量注入部署子路径（默认根路径 '/'）
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      // 子路径优先：@hengyida/shared/xxx → shared/xxx（源码）
      { find: /^@hengyida\/shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      // 主入口 → shared/index.ts（源码）
      { find: /^@hengyida\/shared$/, replacement: `${sharedSrc}/index.ts` },
    ],
  },
  server: { host: '0.0.0.0', port: 5174 },
});
