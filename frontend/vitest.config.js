import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // The older src/**/*.test.js files were written for Jest and have never had a runner;
    // only the maintained *.spec.jsx files run.
    include: ['src/**/*.spec.{js,jsx}'],
  },
});
