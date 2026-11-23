import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@hengyida\/shared\/(.*)$/, replacement: `${sharedSrc}/$1` },
      { find: /^@hengyida\/shared$/, replacement: `${sharedSrc}/index.ts` },
    ],
  },
  server: { host: '0.0.0.0', port: 5173 },
});
