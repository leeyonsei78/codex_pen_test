import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Offline analysis only. No network interfaces, real tokens or browser objects.
// Reviewed statement regions are executed; a full app/server/browser is not.
const root = new URL('./', import.meta.url);
const sha = data => createHash('sha256').update(data).digest('hex');
const verified = [];
for (const directory of ['path-evidence/', 'path-evidence/common/']) {
  const records = JSON.parse(await readFile(new URL(`${directory}responses.json`, root), 'utf8'));
  for (const record of records) {
    assert.equal(record.status, 200);
    const body = await readFile(new URL(directory + record.bodyFile, root));
    assert.equal(sha(body), record.sha256, `Changed evidence ${directory}${record.bodyFile}`);
    verified.push({ file: directory + record.bodyFile, bytes: record.bytes, sha256: record.sha256 });
  }
}
const interceptor = await readFile(new URL('path-evidence/common/P03.js', root), 'utf8');
const store = await readFile(new URL('path-evidence/common/P04.js', root), 'utf8');
const viewRecords = JSON.parse(await readFile(new URL('additional-evidence/responses.json', root), 'utf8'));
const viewRecord = viewRecords.find(record => record.id === 'A03');
const viewBuffer = await readFile(new URL(`additional-evidence/${viewRecord.bodyFile}`, root));
assert.equal(sha(viewBuffer), viewRecord.sha256);
const view = viewBuffer.toString('utf8');
const axios = await readFile(new URL('path-evidence/P01.js', root), 'utf8');
const regions = [];
function between(text, file, startMarker, endMarker, limit = 2000) {
  const start = text.indexOf(startMarker);
  assert(start >= 0, `Missing marker ${startMarker}`);
  const end = text.indexOf(endMarker, start + startMarker.length);
  assert(end > start && end - start < limit, 'Reviewed region changed');
  const source = text.slice(start, end);
  assert(!/\b(?:fetch|XMLHttpRequest|require|import|process)\b/.test(source));
  regions.push({ file, offset: start, source, sha256: sha(source) });
  return source;
}
const initialMessage = between(interceptor, 'common/P03.js', 'm=null!==(c=null==d?void 0:d.message)', ',g=[');
const fallbackMessage = between(interceptor, 'common/P03.js', 'd.errorCode!==d.message&&Object.keys(d).includes("message")', ',T="staging"');
const payload = between(interceptor, 'common/P03.js', 'x={message:m,errorData:', ',e.store.commit("refreshStore/showMessageState",{messageInfo:x})');
const ownKeys = between(store, 'common/P04.js', 'function r(t,e){var n=Object.keys(t);', 'var s={namespaced:!0');
const mutation = between(store, 'common/P04.js', 'showMessageState:function(t,e){', ',hideMessageState:').slice('showMessageState:'.length);
const renderMarker = 'domProps:{innerHTML:t._s(t.messageState.messageInfo.message)}';
assert(view.includes(renderMarker));
const cases = [];
for (const data of [
  { errorCode: 'AUDIT_LOCAL_CODE', message: '<b data-audit="LOCAL_ONLY">AUDIT_MARKER</b>' },
  { errorCode: 'AUDIT_LOCAL_CODE', message: '일시적인 오류입니다.' },
  { errorCode: 'AUDIT_IDENTICAL', message: 'AUDIT_IDENTICAL' },
]) {
  const context = vm.createContext({ d: data, T: false }, { codeGeneration: { strings: false, wasm: false } });
  // Babel property helper and Vue stringification are minimal stubs, NOT Vue.
  const setup = `var m,c,l,x; var state={messageState:{}};
    var a={a:function(target,key,value){Object.defineProperty(target,key,{value:value,enumerable:true,writable:true,configurable:true});return target;}};`;
  vm.runInContext(setup + initialMessage + ';' + fallbackMessage + ';' + payload + ';' + ownKeys + '\nvar capturedMutation=(' + mutation + '); capturedMutation(state,{messageInfo:x});\nvar t={messageState:state.messageState,_s:function(value){return String(value)}};var capturedRenderData=({' + renderMarker + '});', context, { timeout: 500 });
  const rendered = vm.runInContext('capturedRenderData.domProps.innerHTML', context, { timeout: 500 });
  const stored = vm.runInContext('state.messageState.messageInfo.message', context, { timeout: 500 });
  if (data.errorCode === 'AUDIT_IDENTICAL') assert.equal(rendered, '오류가 발생했습니다');
  else assert.equal(rendered, data.message);
  assert.equal(stored, rendered);
  cases.push({ syntheticApiData: data, storedMessage: stored, htmlSinkValue: rendered });
}

const rotationMarker = 'r.data.refreshToken=O';
assert(interceptor.includes(rotationMarker));
const rotationContext = vm.createContext({ r: { data: { refreshToken: 'AUDIT_FAKE_NEW_REFRESH' } }, O: 'AUDIT_FAKE_PREVIOUS_REFRESH' }, { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(rotationMarker, rotationContext, { timeout: 500 });
const selectedRefresh = vm.runInContext('r.data.refreshToken', rotationContext, { timeout: 500 });
assert.equal(selectedRefresh, 'AUDIT_FAKE_PREVIOUS_REFRESH');

const xsrf = between(axios, 'P01.js', 'var g=(t.withCredentials||c(y))&&t.xsrfCookieName?', '}"setRequestHeader"');
const xsrfCases = [];
for (const [sameOrigin, withCredentials] of [[false, true], [false, false], [true, false]]) {
  const context = vm.createContext({
    t: { withCredentials, xsrfCookieName: 'XSRF-TOKEN', xsrfHeaderName: 'X-XSRF-TOKEN' },
    c: () => sameOrigin, y: 'https://audit.example.invalid/local-only',
    i: { read: () => 'AUDIT_FAKE_XSRF' }, p: {},
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(xsrf, context, { timeout: 500 });
  const copied = vm.runInContext('p["X-XSRF-TOKEN"] || null', context, { timeout: 500 });
  assert.equal(copied, (sameOrigin || withCredentials) ? 'AUDIT_FAKE_XSRF' : null);
  xsrfCases.push({ sameOrigin, withCredentials, syntheticHeaderValue: copied });
}
const version = axios.match(/"name":"axios","version":"([^"]+)"/)?.[1];
assert.equal(version, '0.21.4');
const result = {
  at: new Date().toISOString(),
  scope: 'Offline statement/VDOM-data reproduction using synthetic responses and stub helpers. No browser HTML parse or script execution, no real API calls or token use.',
  evidence: verified,
  requestCount: verified.length,
  totalCapturedBytes: verified.reduce((sum, item) => sum + item.bytes, 0),
  apiMessageToHtml: { cases, actualAttackerControlVerified: false, browserXssExecuted: false },
  tokenRotation: { originalNewResponseValue: 'AUDIT_FAKE_NEW_REFRESH', actualSelectedValue: selectedRefresh, serverRotationPolicyVerified: false },
  axiosXsrf: { version, cases: xsrfCases, realCookieOrExternalDestinationUsed: false, applicationExploitConditionsVerified: false },
  logout: { serverLogoutMethodCallPresent: interceptor.includes('l.A.getMemberLogout()'), serverInvalidationVerified: false },
  reviewedRegions: regions,
  verdict: { serverIntrusion: 'NOT_VERIFIED', accountTakeover: 'NOT_VERIFIED', apiMessageToHtmlDataFlow: 'REPRODUCED_OFFLINE', safeToRelease: 'NOT_DETERMINED' },
};
await writeFile(new URL('path-evidence/local-path-verification.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ verdict: result.verdict, requestCount: result.requestCount, totalCapturedBytes: result.totalCapturedBytes, apiMessageToHtml: result.apiMessageToHtml, tokenRotation: result.tokenRotation, axiosXsrf: result.axiosXsrf, logout: result.logout }, null, 2));
