import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrlList, groupByOrigin, scanList } from './scan-list.mjs';

test('목록 파싱: 주석·빈 줄 무시, 잘못된 입력 거부', () => {
  const urls = parseUrlList('# 주석\n\nhttps://a.example/x?y=1\r\nhttps://a.example/z\n');
  assert.equal(urls.length, 2);
  assert.throws(() => parseUrlList('ftp://a.example/'), /http/);
  assert.throws(() => parseUrlList('https://u:p@a.example/'), /계정/);
  assert.throws(() => parseUrlList('not a url'), /올바른/);
});

test('origin별 그룹, 쿼리 유지, 중복 제거, 순서 유지', () => {
  const g = groupByOrigin(parseUrlList('https://a.example/x?y=1\nhttps://b.example/\nhttps://a.example/x?y=1\nhttps://a.example/z\nhttp://a.example/h'));
  assert.deepEqual(g.map(x => x.origin), ['https://a.example', 'https://b.example', 'http://a.example']);
  assert.deepEqual(g[0].paths, ['/x?y=1', '/z']);
});

test('scanList: 사이트마다 한 번씩 점검하고 결과를 모은다', async () => {
  const calls = [];
  const run = async ({ target, paths, allowPrivate }) => { calls.push({ target, paths, allowPrivate }); return { target, findings: [], records: [], requests: 0, at: 't' }; };
  const data = await scanList(parseUrlList('https://a.example/1\nhttps://b.example/2\nhttps://a.example/3'), { run });
  assert.equal(data.sites, 2);
  assert.deepEqual(calls.map(c => c.target), ['https://a.example', 'https://b.example']);
  assert.deepEqual(calls[0].paths, ['/1', '/3']);
  assert.equal(calls[0].allowPrivate, false);
});
