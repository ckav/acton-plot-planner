/* A tiny local web server for testing update.html without Google or Netlify.
   - Serves plot-planner/ as static files.
   - Serves a substituted /data/config.js that points memberUrl at the fake script below
     (the real data/config.js on disk is never touched).
   - /fake-script stands in for the Apps Script web app:
       GET  ?action=record&t=good  -> a made-up record
       GET  ?action=record&t=bad   -> { ok: false, error: 'expired' }
       POST                        -> { ok: true } after a short pause (so "disabled while sending"
                                      can be seen); email down@example.com drops the connection,
                                      odd@example.com answers { ok: false, error: 'weird' }.
   - /update.html?probe=<mode> gets test/page-probe.js injected before </body> so headless Chrome's
     --dump-dom output carries measurements the tests read back. */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');

var ROOT = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

var FAKE_RECORD = { ok: true, name: 'Test Person One', email: 'one@example.com', phone: '07700 900001', plots: 'Perryn 99', role: 'Responsible', shop: false, rota: false, news: true };

function start() {
  return new Promise(function (resolve, reject) {
    var seen = [];   // every call to /fake-script: { method, query, headers, body }
    var server = http.createServer(function (req, res) {
      var u = url.parse(req.url, true);
      var p = decodeURIComponent(u.pathname);
      function send(code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
      function json(obj) { send(200, 'application/json', JSON.stringify(obj)); }

      if (p === '/fake-script') {
        if (req.method === 'GET') {
          seen.push({ method: 'GET', query: u.query, headers: req.headers });
          if (u.query.action === 'record') {
            if (u.query.t === 'good') return json(FAKE_RECORD);
            if (u.query.t === 'noplot') return json(Object.assign({}, FAKE_RECORD, { plots: '' }));
            if (u.query.t === 'broken') return json({ ok: false, error: 'server' });
            if (u.query.t === 'drop') return json(Object.assign({}, FAKE_RECORD, { email: 'drop@example.com' }));   // a save from this record is dropped
            return json({ ok: false, error: 'expired' });
          }
          return json({ ok: true, service: 'AGA members (fake)' });
        }
        var chunks = [];
        req.on('data', function (c) { chunks.push(c); });
        req.on('end', function () {
          var raw = Buffer.concat(chunks).toString('utf8'), body = null;
          try { body = JSON.parse(raw); } catch (e) { body = null; }
          seen.push({ method: req.method, query: u.query, headers: req.headers, raw: raw, body: body });
          if (body && (body.email === 'down@example.com' || body.email === 'drop@example.com')) return req.socket.destroy();
          if (body && body.email === 'odd@example.com') return json({ ok: false, error: 'weird' });
          if (body && body.action === 'save' && body.t === 'broken') return json({ ok: false, error: 'server' });
          if (body && body.action === 'save' && !/^[0-9 +()]{0,30}$/.test(String(body.phone || ''))) return json({ ok: false, error: 'phone' });   // as the real script does
          if (body && body.action === 'save' && body.name === 'Save Server Error') return json({ ok: false, error: 'server' });
          setTimeout(function () { json({ ok: true }); }, 500);
        });
        return;
      }

      if (p === '/data/config.js') {
        return send(200, TYPES['.js'], 'window.PLANNER_CONFIG = { submitUrl: "", memberUrl: "http://127.0.0.1:' + server.address().port + '/fake-script" };\n');
      }
      if (p === '/data/config-notready.js') return send(200, TYPES['.js'], 'window.PLANNER_CONFIG = { submitUrl: "", memberUrl: "" };\n');

      var file = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'text/plain', 'not found: ' + p);
      var ext = path.extname(file).toLowerCase();
      var data = fs.readFileSync(file);
      if (p === '/update.html' && (u.query.probe !== undefined || u.query.notready !== undefined)) {
        var html = data.toString('utf8');
        if (u.query.notready !== undefined) html = html.replace(/(["'])(\.\/)?data\/config\.js\1/, '"data/config-notready.js"');   // a blank memberUrl
        if (u.query.probe !== undefined) {
          var probe = fs.readFileSync(path.join(__dirname, 'page-probe.js'), 'utf8');
          var tag = '<script>window.__QA_MODE=' + JSON.stringify(u.query.probe || '') + ';</script><script>' + probe + '</script>';
          html = html.indexOf('</body>') >= 0 ? html.replace('</body>', tag + '</body>') : html + tag;
        }
        return send(200, TYPES['.html'], html);
      }
      send(200, TYPES[ext] || 'application/octet-stream', data);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', function () {
      var base = 'http://127.0.0.1:' + server.address().port;
      resolve({ base: base, seen: seen, record: FAKE_RECORD, close: function () { return new Promise(function (r) { server.close(r); }); } });
    });
  });
}

module.exports = { start: start, FAKE_RECORD: FAKE_RECORD };
