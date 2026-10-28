import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveApprovedApiUrl } from './fixes/approved-api-url.mjs';

// Offline review only: two saved files, fake tokens and reserved .invalid URLs.
// No browser or network primitive is provided to the reviewed code regions.
const root = new URL('./', import.meta.url);
async function verifiedFile(directory, name) {
  const manifest = JSON.parse(await readFile(new URL(directory + 'responses.json', root), 'utf8'));
  const item = manifest.find(record => record.bodyFile === name);
  assert(item);
  const data = await readFile(new URL(directory + name, root));
  assert.equal(createHash('sha256').update(data).digest('hex'), item.sha256);
  return data.toString('utf8');
}
const plugin = await verifiedFile('path-evidence/common/', 'P03.js');
const axios = await verifiedFile('path-evidence/', 'P01.js');
const start = plugin.indexOf('var n=e.store,r=n.state.authStore.uuid,a=/');
const end = plugin.indexOf('t.headers["X-APP-CLIENT-ID"]', start);
assert(start >= 0 && end > start && end - start < 650);
const requestRegion = plugin.slice(start, end);
assert(!/\b(?:fetch|XMLHttpRequest|require|import|process|window|document)\b/.test(requestRegion));

function getExportedFunction(id, nextId) {
  const start = axios.indexOf(`${id}:function(t,e,r){`);
  const end = axios.indexOf(`,${nextId}:function`, start);
  assert(start >= 0 && end > start && end - start < 500);
  const module = axios.slice(start, end);
  const source = module.slice(module.indexOf('t.exports=') + 't.exports='.length, -1);
  assert(source.startsWith('function('));
  return source;
}
const joinUrl = getExportedFunction(569, 570);
const isAbsolute = getExportedFunction(570, 571);
const combineUrls = getExportedFunction(571, 572);
const apiOrigin = 'https://api.example.invalid';
const cases = [];
for (const url of [
  '/api/local-only',
  '/public/local-only',
  'https://audit.example.invalid/api/local-only',
  '//audit.example.invalid/public/local-only',
  'https://audit.example.invalid/local-only',
]) {
  const context = vm.createContext({
    e: { store: { state: { authStore: { uuid: 'AUDIT_FAKE_CLIENT', tokenInfo: { idToken: 'AUDIT_FAKE_ID_TOKEN' } } } }, $config: { VUE_APP_API_DOMAIN: apiOrigin } },
    t: { url, headers: {} },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(requestRegion + `\nvar n=(${isAbsolute}),o=(${combineUrls});var effective=(${joinUrl})(t.baseURL,t.url);`, context, { timeout: 500 });
  const effective = vm.runInContext('effective', context, { timeout: 500 });
  const syntheticAuthorization = vm.runInContext('t.headers.Authorization || null', context, { timeout: 500 });
  const outside = new URL(effective, 'https://www.example.invalid').origin !== apiOrigin;
  let fixedGuard;
  try { fixedGuard = { allowed: true, url: resolveApprovedApiUrl(url, apiOrigin) }; }
  catch { fixedGuard = { allowed: false }; }
  assert.equal(fixedGuard.allowed, !outside);
  if (url.includes('/api/') || url.includes('/public/')) assert.equal(syntheticAuthorization, 'AUDIT_FAKE_ID_TOKEN');
  else assert.equal(syntheticAuthorization, null);
  cases.push({ inputUrl: url, originalEffectiveUrl: effective, originalAuthorization: syntheticAuthorization, outsideApprovedOrigin: outside, fixedGuard });
}
const result = {
  at: new Date().toISOString(),
  scope: 'Offline request configuration only. No requests, browser preflight, real tokens or attacker-controlled application entry points were used.',
  reviewedSource: { file: 'path-evidence/common/P03.js', offset: start, source: requestRegion },
  axiosHelpers: { joinUrl, isAbsolute, combineUrls },
  cases,
  actualAttackerUrlControlVerified: false,
  actualNetworkHeaderTransmissionVerified: false,
  realCredentialsUsed: false,
};
await mkdir(new URL('financial-review-evidence/', root), { recursive: true });
await writeFile(new URL('financial-review-evidence/api-destination.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
