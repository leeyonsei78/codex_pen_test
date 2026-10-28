import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Offline-only. Execute reviewed, small statement regions with fake data and
// stub storage. Do not execute whole bundles, make API calls or render HTML.
const base = new URL('./', import.meta.url);
const records = JSON.parse(await readFile(new URL('additional-evidence/responses.json', base), 'utf8'));
for (const record of records) {
  assert(record.bodyFile, `Incomplete follow-up response: ${record.id}`);
  const body = await readFile(new URL(`additional-evidence/${record.bodyFile}`, base));
  assert.equal(createHash('sha256').update(body).digest('hex'), record.sha256);
}
const bundle = await readFile(new URL('additional-evidence/A03.js', base), 'utf8');
const loader = await readFile(new URL('evidence/R07.txt', base), 'utf8');
const head = await readFile(new URL('evidence/R08.txt', base), 'utf8');

const tokenStart = bundle.indexOf('sessionStorage&&(sessionStorage.setItem("token",s.data.idToken)');
assert(tokenStart >= 0);
const tokenEnd = bundle.indexOf(',e.next=3,Promise.all', tokenStart);
assert(tokenEnd > tokenStart);
const tokenCode = bundle.slice(tokenStart, tokenEnd);
assert(tokenCode.length < 1000);
assert(!/\b(?:fetch|XMLHttpRequest|require|import|process|window)\b/.test(tokenCode));
const session = new Map();
const local = new Map();
const cookies = [];
const document = {};
Object.defineProperty(document, 'cookie', { set: value => cookies.push(value), get: () => cookies.map(value => value.split(';')[0]).join('; ') });
const tokenContext = vm.createContext({
  sessionStorage: { setItem: (key, value) => session.set(key, value) },
  localStorage: { setItem: (key, value) => local.set(key, value) },
  document,
  s: { data: { idToken: 'AUDIT_FAKE_ID_TOKEN', refreshToken: 'AUDIT_FAKE_REFRESH_TOKEN' } },
}, { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(tokenCode, tokenContext, { timeout: 500 });
assert.equal(session.get('token'), 'AUDIT_FAKE_ID_TOKEN');
assert.equal(session.get('refreshToken'), 'AUDIT_FAKE_REFRESH_TOKEN');
assert.equal(cookies.length, 2);
assert(cookies.every(cookie => !/;\s*httponly\b/i.test(cookie)));

const queryStart = loader.indexOf('const FULL_URL = window.location.href');
const queryEnd = loader.indexOf('\nfunction setFstEcid', queryStart);
assert(queryStart >= 0 && queryEnd > queryStart);
const queryCode = loader.slice(queryStart, queryEnd);
assert(queryCode.length < 2500);
const queryCases = [];
for (const href of [
  'https://www.lina.co.kr/?utm_source=audit&token=AUDIT_FAKE_TOKEN&email=fake%40example.invalid#AUDIT_FAKE_FRAGMENT',
  'https://www.lina.co.kr/?not_utm_source=audit&code=AUDIT_FAKE_CODE',
]) {
  const values = new Map();
  const logs = [];
  const context = vm.createContext({
    window: { location: { href } }, document: { referrer: '' },
    localStorage: { setItem: (key, value) => values.set(key, value) },
    console: { log: (...args) => logs.push(args.join(' ')) },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(queryCode + '\nsetUtmParam();', context, { timeout: 500 });
  assert(values.get('X_UTM_PARAM').includes('AUDIT_FAKE_'));
  assert(logs.some(log => log.includes('AUDIT_FAKE_')));
  queryCases.push({ href, storage: Object.fromEntries(values), logs });
}

const sink = 'domProps:{innerHTML:t._s(t.messageState.messageInfo.message)}';
assert(bundle.includes(sink));
const contexts = ['refreshLogin(s)', 'getTokenCookie:function', sink].map(marker => {
  const offset = bundle.indexOf(marker);
  return { marker, offset, excerpt: bundle.slice(Math.max(0, offset - 100), offset + 250) };
});
const externalScripts = [...new Set([...head.matchAll(/addHeadScript\('([^']+)'/g)].map(match => match[1]))];
const first = records[0];
const expiresAt = new Date(first.tls.certificate.validTo).getTime();
const result = {
  at: new Date().toISOString(),
  scope: 'Three additional GETs already captured. This script runs offline; only synthetic token/query data are used.',
  certificate: { ...first.tls, daysRemainingAtCollection: Math.floor((expiresAt - new Date(first.at).getTime()) / 86400000) },
  tokenStorage: {
    source: 'A03.js', offset: tokenStart,
    extractedStatement: tokenCode,
    syntheticSessionStorage: Object.fromEntries(session),
    syntheticCookieAssignments: cookies,
    realLoginOrTokensUsed: false,
    browserCookieAndServerLifecycleTested: false,
  },
  rawQueryStorage: { source: 'R07.txt', cases: queryCases },
  rawHtmlSink: { source: 'A03.js', marker: sink, offset: bundle.indexOf(sink), untrustedInputPathVerified: false },
  scriptLoading: {
    source: ['R07.txt', 'R08.txt'],
    referencedUrlsAcrossBranches: externalScripts,
    integrityAssignmentPresentInReviewedLoader: /\.integrity\s*=|setAttribute\(['"]integrity/.test(loader),
    remoteScriptsExecutedOrDownloaded: false,
  },
  excerpts: contexts,
};
await writeFile(new URL('additional-evidence/local-verification.json', base), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
