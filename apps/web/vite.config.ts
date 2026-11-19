import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tanstackStart(),
    // Standalone Node server (.output/server/index.mjs) for the Docker image deployed on Coolify.
    nitro(),
    viteReact(),
  ],
});
