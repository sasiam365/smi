// cPanel Node.js Application Startup Entry Point
import fs from 'node:fs';

if (fs.existsSync('./dist/server.js')) {
  await import('./dist/server.js');
} else {
  await import('./server.ts');
}
