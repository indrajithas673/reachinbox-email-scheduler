import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const target = process.env.VITE_API_URL || 'http://localhost:3000';

// Proxy /api requests to the backend
app.use('/api', createProxyMiddleware({ 
  target, 
  changeOrigin: true,
  // This is the magic line that fixes the Railway cookie issue!
  // It intercepts the cookie from the backend and rewrites it to belong to the frontend domain.
  cookieDomainRewrite: { "*": "" } 
}));

// Serve static React files
app.use(express.static(path.join(__dirname, 'dist')));

// SPA Fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Frontend proxy listening on ${port} forwarding to ${target}`));
