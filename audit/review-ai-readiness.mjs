import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Offline evidence review. Fake DOM records assignments; it never loads scripts.
const root = new URL('./', import.meta.url);
const directories = ['evidence/', 'additional-evidence/', 'path-evidence/', 'path-evidence/common/'];
const indicators = /\b(?:chatbot|chatgpt|openai|anthropic|langchain|langgraph|ollama|bedrock|sagemaker)\b|챗봇|생성형|인공지능/gi;
const files = [];
for (const directory of directories) {
  for (const name of (await readdir(new URL(directory, root))).sort()) {
    if (!/\.(?:html|js|txt)$/.test(name)) continue;
    const path = directory + name;
    const buffer = await readFile(new URL(path, root));
    const source = buffer.toString('utf8');
    files.push({ path, bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'),
      aiIndicators: [...new Set(source.match(indicators) ?? [])] });
  }
}
const source = await readFile(new URL('evidence/R07.txt', root), 'utf8');
const cases = [];
for (const functionName of ['addHeadScript', 'addBodyScript']) {
  const start = source.indexOf(`function ${functionName}(`);
  assert(start >= 0);
  const end = source.indexOf('\n}', start) + 2;
  assert(end > start);
  const region = source.slice(start, end);
  const sourceOffset = start;
  for (const url of ['/audit-local-only.js', 'https://audit.example.invalid/local-only.js', '//audit.example.invalid/local-only.js']) {
    const assignments = [];
    const document = { createElement: () => ({ addEventListener() {} }),
      head: { appendChild: element => assignments.push(element.src) },
      body: { appendChild: element => assignments.push(element.src) } };
    const context = vm.createContext({ document, input: url, console: { log() {} } },
      { codeGeneration: { strings: false, wasm: false } });
    vm.runInContext(`let _testAddScriptSrcs='|';\n${region}\n${functionName}(input);`, context, { timeout: 500 });
    assert.deepEqual(assignments, [url]);
    cases.push({ functionName, input: url, assignedScriptSources: assignments, sourceOffset,
      sourceLine: source.slice(0, start).split('\n').length });
  }
}
const chatbotSource = await readFile(new URL('additional-evidence/A03.js', root), 'utf8');
const chatbotMarker = 'addChatbotJs:function()';
const chatbotOffset = chatbotSource.indexOf(chatbotMarker);
assert(chatbotOffset >= 0);
const chatbotLoader = { file: 'additional-evidence/A03.js', offset: chatbotOffset,
  excerpt: chatbotSource.slice(chatbotOffset, chatbotOffset + 430),
  status: 'Loader reference found; chatbot implementation and LLM usage unverified' };
const result = { reviewedAt: new Date().toISOString(), mode: 'OFFLINE_FAKE_DOM_NO_NETWORK', chatbotLoader,
  limits: ['Keyword inventory is not proof of AI absence.', 'Fake DOM does not execute scripts or model browser CSP.',
    'Attacker control of caller input is unverified.', 'Saved evidence is not a current deployment assessment.'],
  files, scriptLoaderCases: cases };
await mkdir(new URL('ai-review-evidence/', root), { recursive: true });
await writeFile(new URL('ai-review-evidence/local-review.json', root), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ reviewedFiles: files.length, aiIndicatorFiles: files.filter(f => f.aiIndicators.length),
  scriptLoaderCases: cases.length, output: 'audit/ai-review-evidence/local-review.json' }, null, 2));
