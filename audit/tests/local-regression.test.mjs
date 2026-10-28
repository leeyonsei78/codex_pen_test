import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { encodeHtmlText } from '../fixes/safe-html.mjs';

const require = createRequire(import.meta.url);
const securityHeaders = require('../fixes/security-headers.cjs');

test('HTML metacharacters are encoded in one pass using valid entities', () => {
  assert.equal(encodeHtmlText('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});

test('angle brackets are not double encoded by the encoder itself', () => {
  assert.equal(encodeHtmlText('<b>audit</b>'), '&lt;b&gt;audit&lt;/b&gt;');
});

test('unlisted inert event markup is treated as text as well', () => {
  assert.equal(encodeHtmlText('<b onclick="void 0">audit</b>'), '&lt;b onclick=&quot;void 0&quot;&gt;audit&lt;/b&gt;');
});

test('existing entity text stays literal when inserted into HTML once', () => {
  assert.equal(encodeHtmlText('&lt;b&gt;'), '&amp;lt;b&amp;gt;');
});

test('ordinary Korean text, number and empty values remain usable', () => {
  assert.equal(encodeHtmlText('출시 전 점검'), '출시 전 점검');
  assert.equal(encodeHtmlText(123), '123');
  assert.equal(encodeHtmlText(null), '');
  assert.equal(encodeHtmlText(undefined), '');
});

test('reference middleware applies headers to normal and error responses locally', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/existing-policy') {
      res.setHeader('Content-Security-Policy', "script-src 'self'");
    }
    securityHeaders(req, res, () => {
      res.statusCode = req.url === '/missing' ? 404 : 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>Local audit fixture</title>');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  for (const [path, status] of [['/', 200], ['/login', 200], ['/missing', 404], ['/existing-policy', 200]]) {
    await t.test(`${path} (${status})`, async () => {
      const response = await new Promise((resolve, reject) => {
        const request = http.get({ hostname: '127.0.0.1', port, path, agent: false }, res => {
          res.resume();
          res.once('end', () => resolve(res));
        });
        request.setTimeout(3000, () => request.destroy(new Error('Local test timeout')));
        request.once('error', reject);
      });
      assert.equal(response.statusCode, status);
      assert.equal(response.headers['content-security-policy'], path === '/existing-policy'
        ? "script-src 'self', frame-ancestors 'self'"
        : "frame-ancestors 'self'");
      assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
    });
  }
});
