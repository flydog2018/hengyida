import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared', import.meta.url));

// 生产构建时可由环境变量注入部署子路径（如 /designer/），本地 dev 默认 '/'
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@hengyida\/shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@hengyida\/shared$/, replacement: `${sharedSrc}/index.ts` },
    ],
  },
  server: { host: '0.0.0.0', port: 5173 },
});
