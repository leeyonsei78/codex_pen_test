import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url), audit=new URL('./',import.meta.url);
const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
let index=1, out;
while(true){out=new URL(`followup-${date}-${String(index).padStart(2,'0')}/`,audit);try{await mkdir(out);break;}catch(e){if(e.code!=='EEXIST')throw e;index++;}}
const hash=b=>createHash('sha256').update(b).digest('hex');
const originals=[];
async function snapshot(dir){for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name.startsWith('followup-'))continue;const url=new URL(entry.name+(entry.isDirectory()?'/':''),dir);if(entry.isDirectory())await snapshot(url);else originals.push({file:fileURLToPath(url),sha256:hash(await readFile(url))});}}
for(const dir of ['audit/','lina_header_review_20261030/','deliverables/'])await snapshot(new URL(dir,root));
await writeFile(new URL('original-manifest.json',out),JSON.stringify(originals,null,2));
const runs=[];
for(const [name,destination] of [['verify-additional.mjs','additional-evidence/local-verification.json'],['verify-intrusion-paths.mjs','path-evidence/local-path-verification.json'],['verify-api-destination.mjs','financial-review-evidence/api-destination.json']]){
 let source=await readFile(new URL(name,audit),'utf8');
 source=source.replace("new URL('./', import.meta.url)","new URL('../', import.meta.url)").replace("from './fixes/","from '../fixes/");
 source=source.replace(`new URL('${destination}',`, `new URL('${out.href}${name}.json',`);
 // Mask synthetic credential values too; no full source excerpts are needed in the new result.
 source=`function sanitize(value,key=''){if(['source','reviewedRegions','reviewedSource','extractedStatement','excerpts','syntheticCookieAssignments','syntheticSessionStorage'].includes(key))return '[OMITTED; see original evidence]';if(Array.isArray(value))return value.map(v=>sanitize(v));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,k)]));if(typeof value==='string')return value.replace(/AUDIT_FAKE_[A-Z_]+/g,'[SYNTHETIC_REDACTED]');return value;}\n`+source;
 source=source.replaceAll('JSON.stringify(result,','JSON.stringify(sanitize(result),');
 const copy=new URL(name,out);await writeFile(copy,source,{flag:'wx'});
 const result=spawnSync(process.execPath,[fileURLToPath(copy)],{encoding:'utf8',timeout:20000,cwd:fileURLToPath(root)});
 await writeFile(new URL(name+'.log',out),result.stdout+(result.stderr||''));runs.push({name,exitCode:result.status,error:result.error?.message});
}
const tests=['audit/tests/local-regression.test.mjs','audit/tests/campaign-regression.test.mjs','audit/tests/public-error-regression.test.mjs','audit/tests/approved-api-url.test.mjs','lina_header_review_20261030/release-policy.test.mjs'];
const test=spawnSync(process.execPath,['--test',...tests],{encoding:'utf8',timeout:20000,cwd:fileURLToPath(root)});
await writeFile(new URL('reference-tests.tap',out),test.stdout+(test.stderr||''));
runs.push({name:'reference-tests',exitCode:test.status,tests:Number(test.stdout.match(/# tests (\d+)/)?.[1]),pass:Number(test.stdout.match(/# pass (\d+)/)?.[1]),fail:Number(test.stdout.match(/# fail (\d+)/)?.[1])});
const sources=[];
for(const path of ['evidence/R01.html','additional-evidence/A03.js','path-evidence/common/P03.js','path-evidence/common/P04.js','path-evidence/P01.js']){
 const text=await readFile(new URL(path,audit),'utf8');
 const markers=['excapeHtmlOrReturn','escapeHtml','noConflict','domProps:{innerHTML:t._s(t.messageState.messageInfo.message)}','m=null!==(c=null==d?void 0:d.message)','showMessageState:function','r.data.refreshToken=O','var n=e.store,r=n.state.authStore.uuid,a=/'];
 sources.push({file:path,sha256:hash(text),markers:markers.map(marker=>{const offsets=[];let start=0;while((start=text.indexOf(marker,start))>=0){offsets.push(start);start+=marker.length;}return {marker,offsets};}).filter(x=>x.offsets.length)});
}
const saved=JSON.parse(await readFile(new URL('recheck-20261101/responses.json',audit),'utf8'));
const headerChecks=saved.records.filter(r=>r.url.startsWith('https:')&&r.status===200&&r.observations).map(r=>({id:r.id,url:r.url,collectedAt:r.time,status:r.status,frame:!!r.headers['x-frame-options']||/frame-ancestors/i.test(r.headers['content-security-policy']||''),csp:r.headers['content-security-policy']||null}));
const changed=[];for(const item of originals)if(hash(await readFile(item.file))!==item.sha256)changed.push(item.file);
const result={at:new Date().toISOString(),dateKst:date,round:index,networkRequests:0,runs,sources,headerChecks,originalFilesChecked:originals.length,changedOriginalFiles:changed,reportPath:`deliverables/라이나생명_후속_보안점검_${date}${index>1?'_'+String(index).padStart(2,'0'):''}.md`};
await writeFile(new URL('summary.json',out),JSON.stringify(result,null,2));
console.log(JSON.stringify({folder:fileURLToPath(out),runs,originalFilesChecked:originals.length,changedOriginalFiles:changed,reportPath:result.reportPath}));
