import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: { include: ['recharts'] },
  plugins: [react(), {
    name: 'static-route-preview',
    // Match the production host's exact rewrites when previewing the build.
    configurePreviewServer(server) {
      const directory = resolve(server.config.root, server.config.build.outDir);
      const rules = readFileSync(resolve(directory, '_redirects'), 'utf8').trim().split('\n').map(line => line.split(/\s+/));
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const rule = rules.find(([source]) => source.endsWith('*') ? url.pathname.startsWith(source.slice(0, -1)) : source === url.pathname);
        if (rule) {
          const [, target, status] = rule;
          if (status === '301') {
            response.writeHead(301, { Location: target + url.search });
            response.end();
            return;
          }
          request.url = target + url.search;
        } else if (!existsSync(resolve(directory, '.' + url.pathname))) {
          response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(readFileSync(resolve(directory, '404.html')));
          return;
        }
        next();
      });
    },
  }],
})
