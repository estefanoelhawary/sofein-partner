// Sofein × Stedy — Demo-Portal: schlanker lokaler Static-Server (kein npm-Dep)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8093;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const send = (fp, data) => {
      const ext = path.extname(fp).toLowerCase();
      const type = TYPES[ext] || 'application/octet-stream';
      const headers = { 'Content-Type': type };
      if (ext === '.html') headers['Cache-Control'] = 'no-cache'; // AR-1
      else if (/\.(png|jpe?g|webp|svg|avif|woff2|css|js)$/.test(ext)) headers['Cache-Control'] = 'public, max-age=3600';
      res.writeHead(200, headers);
      res.end(data);
    };
    const read = (fp, allowHtmlFallback) => fs.readFile(fp, (err, data) => {
      if (err) {
        // saubere URLs ohne .html, mit/ohne Schrägstrich (z.B. /azado oder /azado/ -> azado.html)
        if (allowHtmlFallback) {
          const base = fp.replace(/[/\\]+$/, '');
          if (base && base !== ROOT && !path.extname(base)) return read(base + '.html', false);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404');
      }
      send(fp, data);
    });
    read(filePath, true);
  } catch (e) { res.writeHead(500); res.end('err'); }
}).listen(PORT, () => console.log('Sofein-Leadportal on http://localhost:' + PORT));
