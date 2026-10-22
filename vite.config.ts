import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// One dev server runs both the React app and the Worker (inside workerd).
export default defineConfig({
  plugins: [react(), cloudflare()],
});
