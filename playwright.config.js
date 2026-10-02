import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 1200, height: 800 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      } : {}),
    },
  },
  webServer: [
    {
      command: 'npm run dev -- --port 4175 --strictPort',
      url: 'http://127.0.0.1:4175',
      env: { VITE_MAPBOX_TOKEN: 'pk.local-test-placeholder' },
    },
    {
      command: 'npm run build -- --outDir .test-build && node tests/serve-build.js',
      url: 'http://127.0.0.1:4176/pipeline/index.html',
      env: { VITE_MAPBOX_TOKEN: '' },
    },
  ],
});
