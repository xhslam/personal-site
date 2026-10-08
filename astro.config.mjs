import { defineConfig } from 'astro/config';

export default defineConfig({
  compressHTML: true,
  server: { port: 4321 },
});
