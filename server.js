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
    // Slack-Notify bei Kontaktklick (WhatsApp). Webhook NUR aus ENV (Repo ist public).
    if (req.method === 'POST' && (req.url || '').split('?')[0] === '/api/notify') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 4000) req.destroy(); });
      req.on('end', () => {
        res.writeHead(204); res.end();
        try {
          const hook = process.env.SLACK_WEBHOOK_URL;
          if (!hook) return;
          let d = {}; try { d = JSON.parse(body || '{}'); } catch (e) {}
          const portal = String(d.portal || '?').slice(0, 60);
          const type = String(d.type || 'event').slice(0, 30);
          const txt = (type === 'whatsapp')
            ? '\u{1F4AC} *WhatsApp-Anfrage* auf der Stedy Partner-Bühne — jemand will dich anschreiben (Portal: *' + portal + '*). Schau auf WhatsApp.'
            : '\u{1F514} Stedy Partner-Bühne: ' + type + ' (Portal: ' + portal + ')';
          fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).catch(() => {});
        } catch (e) {}
      });
      return;
    }

    // ---- Internes Partner-Auswahl-Cockpit (Token-gegated; Daten NUR aus ENV, nicht im Repo) ----
    const _u = (req.url || '/');
    const _qp = new URLSearchParams(_u.split('?')[1] || '');
    const _p = _u.split('?')[0];
    const INTERN_TOKEN = process.env.INTERN_TOKEN || '';
    const DATA_DIR = process.env.DATA_DIR || ROOT;
    const REJ_FILE = path.join(DATA_DIR, 'stedy-rejections.json');
    const tokOK = (t) => !!(INTERN_TOKEN && t && t === INTERN_TOKEN);
    const readRej = () => { try { return JSON.parse(fs.readFileSync(REJ_FILE, 'utf8')).rejected || []; } catch (e) { return []; } };
    const writeRej = (arr) => { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(REJ_FILE, JSON.stringify({ rejected: [...new Set(arr)], updated: new Date().toISOString() })); } catch (e) {} };
    const jres = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

    if (req.method === 'GET' && _p.startsWith('/intern/')) {
      const t = _p.split('/').filter(Boolean).pop();
      if (!tokOK(t)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('forbidden'); }
      return fs.readFile(path.join(ROOT, 'intern-cockpit.html'), (err, data) => {
        if (err) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow' });
        res.end(data);
      });
    }
    if (req.method === 'GET' && _p === '/api/partners') {
      if (!tokOK(_qp.get('t'))) return jres(403, { error: 'forbidden' });
      let partners = [];
      try { partners = JSON.parse(Buffer.from(process.env.PARTNER_DATA_B64 || '', 'base64').toString('utf8')); } catch (e) {}
      return jres(200, { partners });
    }
    if (req.method === 'GET' && _p === '/api/rejections') {
      if (!tokOK(_qp.get('t'))) return jres(403, { error: 'forbidden' });
      return jres(200, { rejected: readRej() });
    }
    if (req.method === 'POST' && _p === '/api/reject') {
      if (!tokOK(_qp.get('t'))) return jres(403, { error: 'forbidden' });
      let body = ''; req.on('data', c => { body += c; if (body.length > 2000) req.destroy(); });
      req.on('end', () => {
        let d = {}; try { d = JSON.parse(body || '{}'); } catch (e) {}
        const slug = String(d.slug || '').slice(0, 80).replace(/[^a-z0-9\-]/gi, '');
        const action = d.action === 'remove' ? 'remove' : 'add';
        if (!slug) return jres(400, { error: 'no slug' });
        let arr = readRej();
        if (action === 'add' && !arr.includes(slug)) arr.push(slug);
        if (action === 'remove') arr = arr.filter(s => s !== slug);
        writeRej(arr);
        jres(200, { ok: true, rejected: arr });
        try {
          const hook = process.env.SLACK_WEBHOOK_URL;
          if (hook) {
            const txt = action === 'add'
              ? '\u{1F6AB} *Valentin hat einen Partner abgelehnt:* ' + slug + ' (Stedy Partner-Auswahl). Abgelehnt gesamt: ' + arr.length + '.'
              : '↩️ Valentin hat *' + slug + '* wieder aufgenommen (Stedy). Abgelehnt gesamt: ' + arr.length + '.';
            fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: txt }) }).catch(() => {});
          }
        } catch (e) {}
      });
      return;
    }

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
