import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

// Offline reproduction of the TWO reviewed pure helpers, never the application.
// No URL is fetched and no HTML is rendered or event handler is executed.
const html = await readFile(new URL('./evidence/R01.html', import.meta.url), 'utf8');
const start = html.indexOf('function escapeHtml(value)');
assert(start >= 0, 'Expected helper was not found');
const end = html.indexOf('</script>', start);
assert(end > start, 'Missing script terminator');
const source = html.slice(start, end);
assert(source.length < 2000, 'Stop if reviewed helper region changes substantially');
assert(!/\b(?:fetch|XMLHttpRequest|require|import|process|document|window)\b/.test(source));
const context = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(source, context, { timeout: 500 });
const cases = [
  { name: 'benign HTML passes through blacklist', input: '<b>audit</b>', functionName: 'excapeHtmlOrReturn', expected: '<b>audit</b>' },
  { name: 'unlisted inert event attribute passes through', input: '<b onclick="void 0">audit</b>', functionName: 'excapeHtmlOrReturn', expected: '<b onclick="void 0">audit</b>' },
  { name: 'invalid quote entity', input: '"', functionName: 'escapeHtml', expected: '&qout;' },
  { name: 'replacement order double encodes angle bracket', input: '<', functionName: 'escapeHtml', expected: '&amp;lt;' },
];
const results = cases.map(item => {
  context.auditInput = item.input;
  const actual = vm.runInContext(`${item.functionName}(auditInput)`, context, { timeout: 500 });
  assert.equal(actual, item.expected);
  return { ...item, actual, reproduced: true };
});
const result = {
  at: new Date().toISOString(),
  source: 'R01.html',
  helperSha256: createHash('sha256').update(source).digest('hex'),
  scope: 'Pure helper behavior only; no remote XSS or application sink verified.',
  cases: results,
};
await writeFile(new URL('./evidence/local-reproduction.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
