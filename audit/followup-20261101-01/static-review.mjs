import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const audit=new URL('../',import.meta.url),out=new URL('./',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('evidence/responses.json',audit),'utf8'));
const files=[];
for(const r of manifest){const bytes=await readFile(new URL('evidence/'+r.bodyFile,audit));assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);files.push({file:'evidence/'+r.bodyFile,collectionTime:r.at,jqueryBanner:bytes.toString('utf8').slice(0,150).match(/jQuery[^\n]*?(?:v)?\d+\.\d+\.\d+/)?.[0]||null});}
const html=await readFile(new URL('evidence/R01.html',audit),'utf8');
const start=html.indexOf('function escapeHtml(value)'),end=html.indexOf('</script>',start);
const source=html.slice(start,end);assert(source.length<2000&&!/\b(?:fetch|XMLHttpRequest|require|import|process|window|document)\b/.test(source));
const ctx=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});vm.runInContext(source,ctx,{timeout:300});
const helperCases=[];
for(const [fn,input,expected] of [['escapeHtml','"','&qout;'],['escapeHtml','<','&amp;lt;'],['excapeHtmlOrReturn','<b>LOCAL</b>','<b>LOCAL</b>'],['excapeHtmlOrReturn','<b onclick="void 0">LOCAL</b>','<b onclick="void 0">LOCAL</b>']]){ctx.input=input;const actual=vm.runInContext(`${fn}(input)`,ctx,{timeout:300});assert.equal(actual,expected);helperCases.push({fn,input,actual});}
const occurrences=[];
for(const folder of ['evidence/','additional-evidence/','path-evidence/','path-evidence/common/'])for(const name of await readdir(new URL(folder,audit))){if(!/\.(html|js|txt)$/.test(name))continue;const text=await readFile(new URL(folder+name,audit),'utf8');for(const term of ['escapeHtml','excapeHtmlOrReturn']){const offsets=[];let p=0;while((p=text.indexOf(term,p))>=0){offsets.push(p);p+=term.length;}if(offsets.length)occurrences.push({file:folder+name,term,offsets});}}
const {records}=JSON.parse(await readFile(new URL('recheck-20261101/responses.json',audit),'utf8'));
const csp=[...new Set(records.filter(r=>r.url.startsWith('https:')&&r.status===200).map(r=>r.headers?.['content-security-policy']).filter(Boolean))].map(raw=>({policies:raw.split(',').map(policy=>policy.split(';').map(s=>s.trim()).filter(Boolean))}));
await writeFile(new URL('static-review.json',out),JSON.stringify({at:new Date().toISOString(),networkRequests:0,verifiedOriginalBodies:files,helperCases,occurrences,csp,blogTls:records.find(r=>r.id===7)?.error,notes:['CSP split is inventory only, not a browser parser.','Text search covers saved corpus only; dynamic property access and missing chunks remain unverified.']},null,2),{flag:'wx'});
console.log(JSON.stringify({originalBodiesVerified:files.length,helperCases:helperCases.length,helperOccurrences:occurrences,cspPolicyGroups:csp.length}));
