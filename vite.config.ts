import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    minify: false,
    commonjsOptions: {
      include: [/node_modules/],
    },
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/extension/background.ts'),
        devtools: resolve(__dirname, 'src/extension/devtools/devtools.ts'),
        panel: resolve(__dirname, 'src/extension/devtools/panel.ts'),
        sandbox: resolve(__dirname, 'src/extension/sandbox/sandbox.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // Phase 4.7：分析 Worker 的产物路径固定，面板用 chrome.runtime.getURL('chunks/decoder-analysis.worker.js') 加载
        assetFileNames: 'chunks/[name][extname]',
        format: 'es',
      },
    },
    // Worker 以 ES module 输出；Worker 入口自行 parseCode，不传输 AST
    worker: {
      format: 'es',
      rollupOptions: {
        output: { entryFileNames: 'chunks/[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
      },
    },
  },
  plugins: [
    {
      name: 'copy-extension-files',
      closeBundle() {
        const dist = resolve(__dirname, 'dist');
        const ext = resolve(__dirname, 'src/extension');

        copyFileSync(resolve(ext, 'manifest.json'), resolve(dist, 'manifest.json'));
        copyFileSync(resolve(ext, 'devtools/devtools.html'), resolve(dist, 'devtools.html'));
        copyFileSync(resolve(ext, 'devtools/panel.html'), resolve(dist, 'panel.html'));
        copyFileSync(resolve(ext, 'devtools/panel.css'), resolve(dist, 'panel.css'));
        copyFileSync(resolve(ext, 'devtools/panel-layout.css'), resolve(dist, 'panel-layout.css'));
        copyFileSync(resolve(ext, 'sandbox/sandbox.html'), resolve(dist, 'sandbox.html'));

        // 1x1 透明 PNG 占位图标
        const png = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        );
        for (const s of [16, 48, 128]) {
          const p = resolve(dist, `icon${s}.png`);
          if (!existsSync(p)) writeFileSync(p, png);
        }

        console.log('[OB-Recover] Static files copied to dist/');
      },
    },
  ],
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
  },
});
