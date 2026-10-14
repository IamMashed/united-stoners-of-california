import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  // The Cloudflare plugin starts its own Worker runtime, which vitest cannot share.
  plugins: [react(), !process.env.VITEST && cloudflare()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
});