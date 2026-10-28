import https from 'node:https';
import tls from 'node:tls';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Three ordinary requests only; immutable separate evidence for this follow-up.
const out = new URL('./additional-evidence/', import.meta.url);
await mkdir(out, { recursive: true });
try {
  await readFile(new URL('responses.json', out));
  throw new Error('Follow-up evidence exists; archive it before collecting again');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const baseline = await readFile(new URL('./evidence/R01.html', import.meta.url), 'utf8');
const assets = ['/_nuxt/04d919052cf557e38e0e.js', '/_nuxt/5a2f219c4df0d3402586.js'];
for (const asset of assets) {
  if (!baseline.includes(`src="${asset}"`)) throw new Error('Asset must be directly referenced in captured homepage');
}
const urls = ['https://www.lina.co.kr/', ...assets.map(path => `https://www.lina.co.kr${path}`)];
const records = [];
let totalBytes = 0;
for (const [index, url] of urls.entries()) {
  if (index) await delay(1000);
  const record = { id: `A0${index + 1}`, url, method: 'GET', at: new Date().toISOString() };
  try {
    const body = await new Promise((resolve, reject) => {
      const request = https.get(url, { agent: false, timeout: 15000, rejectUnauthorized: true }, response => {
        record.status = response.statusCode;
        record.headers = Object.fromEntries(Object.entries(response.headers).filter(([key]) => key !== 'set-cookie'));
        const socket = response.socket;
        const cert = socket.getPeerCertificate();
        record.tls = {
          authorized: socket.authorized,
          authorizationError: socket.authorizationError || null,
          hostnameMatch: !tls.checkServerIdentity('www.lina.co.kr', cert),
          protocol: socket.getProtocol(),
          cipher: socket.getCipher(),
          certificate: {
            subject: cert.subject,
            issuer: cert.issuer,
            subjectAltName: cert.subjectaltname,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            fingerprint256: cert.fingerprint256,
          },
        };
        let bytes = 0;
        const chunks = [];
        response.on('data', chunk => {
          bytes += chunk.length;
          totalBytes += chunk.length;
          if (bytes > 3 * 1024 * 1024 || totalBytes > 6 * 1024 * 1024) {
            request.destroy(new Error('Safety byte limit reached'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => resolve(Buffer.concat(chunks)));
      });
      const deadline = setTimeout(() => request.destroy(new Error('Overall request deadline reached')), 20000);
      request.once('close', () => clearTimeout(deadline));
      request.once('timeout', () => request.destroy(new Error('Request inactivity timeout')));
      request.once('error', reject);
    });
    record.bytes = body.length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    record.bodyFile = `${record.id}.${index === 0 ? 'html' : 'js'}`;
    await writeFile(new URL(record.bodyFile, out), body);
  } catch (error) {
    record.error = `${error.name}: ${error.message}`;
  }
  records.push(record);
  await writeFile(new URL('responses.json', out), JSON.stringify(records, null, 2) + '\n');
  console.log(JSON.stringify(record));
  if (record.error || record.status === 429 || record.status >= 500) break;
}
