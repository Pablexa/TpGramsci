import { defineConfig } from 'vite';
import { setupGameBackend } from './gameBackend.js';

export default defineConfig({
  plugins: [
    {
      name: 'socket-io',
      configureServer(server) {
        if (!server.httpServer) return;
        setupGameBackend(server.httpServer);
        
        // Custom routing for /jugar
        server.middlewares.use((req, res, next) => {
            if (req.url === '/jugar' || req.url === '/jugar/') {
                req.url = '/game.html';
            }
            next();
        });
      }
    }
  ]
});
