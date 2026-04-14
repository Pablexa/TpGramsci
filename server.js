import express from 'express';
import { createServer } from 'http';
import { setupGameBackend } from './gameBackend.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Serve Static files (dist folder built by Vite)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// Custom Routing routing
app.get('/jugar', (req, res) => {
    res.sendFile(path.join(distPath, 'game.html'));
});
app.get('/jugar/', (req, res) => {
    res.sendFile(path.join(distPath, 'game.html'));
});

// Any other route fallbacks to index.html
app.get('*', (req, res) => {
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
        res.sendFile(path.join(distPath, 'index.html'));
    } else {
        res.status(404).send("Error de compilado: No se encontró la carpeta 'dist'. Asegúrate de haber ejecutado 'npm run build'.");
    }
});

// Attach Socket.io Backend Core
setupGameBackend(httpServer);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Servidor de Producción corriendo en el puerto ${PORT}`);
});
