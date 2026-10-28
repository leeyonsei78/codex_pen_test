import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCampaignParams, storeCampaignParams } from '../fixes/campaign-params.mjs';

test('unrelated query and fragment values do not enter stored campaign data', () => {
  assert.deepEqual(extractCampaignParams('https://www.lina.co.kr/?utm_source=launch&token=FAKE_TOKEN&email=fake%40example.invalid#FAKE_FRAGMENT'), {
    query: 'utm_source=launch', source: 'launch',
  });
});

test('source parameter is matched by exact name', () => {
  assert.deepEqual(extractCampaignParams('https://www.lina.co.kr/?not_utm_source=FAKE'), { query: '', source: '' });
});

test('fragment-only campaign marker does not count as query data', () => {
  assert.deepEqual(extractCampaignParams('https://www.lina.co.kr/#utm_source=launch'), { query: '', source: '' });
});

test('approved campaign codes are kept in stable order', () => {
  assert.deepEqual(extractCampaignParams('https://www.lina.co.kr/?utm_campaign=prelaunch_2026&utm_medium=web&utm_source=newsletter'), {
    query: 'utm_source=newsletter&utm_medium=web&utm_campaign=prelaunch_2026', source: 'newsletter',
  });
});

test('HTML markup, email values and oversized campaign fields are excluded', () => {
  const url = new URL('https://www.lina.co.kr/');
  url.searchParams.set('utm_source', '<b>audit</b>');
  url.searchParams.set('utm_campaign', 'fake@example.invalid');
  url.searchParams.set('utm_content', 'A'.repeat(129));
  assert.deepEqual(extractCampaignParams(url.href), { query: '', source: '' });
});

test('duplicate source parameters produce at most one stored source', () => {
  assert.equal(extractCampaignParams('https://www.lina.co.kr/?utm_source=first&utm_source=second').query, 'utm_source=first');
});

test('legacy raw query persistence is removed and only tab-scoped campaign data is set', () => {
  const local = new Map([['X_UTM_PARAM', 'FAKE_OLD_QUERY'], ['X_UTM_SOURCE', 'old'], ['unrelated', 'keep']]);
  const session = new Map();
  const tabStorage = { setItem: (key, value) => session.set(key, value) };
  const persistentStorage = { removeItem: key => local.delete(key) };
  storeCampaignParams('https://www.lina.co.kr/?utm_source=launch&code=FAKE_CODE', tabStorage, persistentStorage);
  assert.deepEqual(Object.fromEntries(local), { unrelated: 'keep' });
  assert.deepEqual(Object.fromEntries(session), { X_UTM_PARAM: 'utm_source=launch', X_UTM_SOURCE: 'launch' });
});

test('non-HTTP input is rejected', () => {
  assert.throws(() => extractCampaignParams('javascript:void(0)'), /HTTP/);
});
