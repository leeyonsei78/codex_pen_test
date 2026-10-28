import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicErrorMessage, defaultPublicErrorMessage } from '../fixes/public-error-message.mjs';

test('known error code produces reviewed text rather than the raw server message', () => {
  assert.equal(getPublicErrorMessage({ errorCode: 'COMM1007', message: '<b data-audit="LOCAL_ONLY">AUDIT_MARKER</b>' }), '다시 로그인해 주세요.');
});

test('unknown error does not echo HTML or synthetic private values', () => {
  assert.equal(getPublicErrorMessage({ errorCode: 'AUDIT_UNKNOWN', message: '<b>AUDIT_FAKE_TOKEN</b>', stackTrace: 'AUDIT_PRIVATE_STACK' }), defaultPublicErrorMessage);
});

test('object prototype names do not select values from the error map', () => {
  for (const errorCode of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(getPublicErrorMessage({ errorCode }), defaultPublicErrorMessage);
  }
});

test('inherited errorCode is not used as a trusted response field', () => {
  assert.equal(getPublicErrorMessage(Object.create({ errorCode: 'COMM1007' })), defaultPublicErrorMessage);
});

test('missing and malformed error objects have a stable non-sensitive fallback', () => {
  for (const value of [undefined, null, '', 123, [], {}, { errorCode: 1007 }, { errorCode: {} }]) {
    assert.equal(getPublicErrorMessage(value), defaultPublicErrorMessage);
  }
});

test('recognized codes are matched exactly and raw body text never determines the message', () => {
  assert.equal(getPublicErrorMessage({ errorCode: 'COMM1008', message: 'AUDIT_IGNORED' }), '로그인이 필요합니다.');
  assert.equal(getPublicErrorMessage({ errorCode: 'COMM1007_EXTRA', message: 'AUDIT_IGNORED' }), defaultPublicErrorMessage);
});
