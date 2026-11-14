import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';

async function startServer() {
  const app = await createApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PottoyonBD server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
