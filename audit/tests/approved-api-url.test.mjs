import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovedApiUrl } from '../fixes/approved-api-url.mjs';

const api = 'https://api.example.invalid';

test('normal relative API requests resolve to the approved origin', () => {
  assert.equal(resolveApprovedApiUrl('/api/local-only?limit=1', api), api + '/api/local-only?limit=1');
  assert.equal(resolveApprovedApiUrl('/public/local-only', api), api + '/public/local-only');
});

test('absolute and scheme-relative outside destinations are rejected before token attachment', () => {
  for (const input of ['https://audit.example.invalid/api/local-only', '//audit.example.invalid/public/local-only']) {
    assert.throws(() => resolveApprovedApiUrl(input, api), /approved origin/);
  }
});

test('similar host strings, different ports and HTTP downgrade are not trusted', () => {
  for (const input of ['https://api.example.invalid.audit.example.invalid/api/local-only', 'https://api.example.invalid:444/api/local-only', 'http://api.example.invalid/api/local-only']) {
    assert.throws(() => resolveApprovedApiUrl(input, api), /approved origin/);
  }
});

test('userinfo URLs are rejected and cannot serve as origin allowlisting tricks', () => {
  assert.throws(() => resolveApprovedApiUrl('https://api.example.invalid@audit.example.invalid/api/local-only', api), /approved origin/);
  assert.throws(() => resolveApprovedApiUrl('https://audit:fake@api.example.invalid/api/local-only', api), /approved origin/);
});

test('non-HTTP(S) destinations and malformed configuration are rejected', () => {
  for (const input of ['javascript:void(0)', 'data:text/plain,LOCAL_ONLY']) {
    assert.throws(() => resolveApprovedApiUrl(input, api), /approved origin/);
  }
  for (const origin of ['http://api.example.invalid', 'https://api.example.invalid/path', 'https://api.example.invalid/?query=1']) {
    assert.throws(() => resolveApprovedApiUrl('/api/local-only', origin), /HTTPS API origin/);
  }
});

test('matching HTTPS origin is accepted after standard URL normalization', () => {
  assert.equal(resolveApprovedApiUrl('https://API.EXAMPLE.INVALID:443/api/local-only', api), api + '/api/local-only');
  assert.throws(() => resolveApprovedApiUrl('', api), /non-empty/);
});
