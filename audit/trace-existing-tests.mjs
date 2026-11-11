import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
const out=new URL(`resume-preparation-${stamp}/`,import.meta.url);await mkdir(out);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const original=JSON.parse(await readFile(new URL('audit/followup-20261101-01/original-manifest.json',root),'utf8'));
async function compare(){const records=[];for(const r of original){try{const actual=hash(await readFile(r.file));records.push({file:r.file,expected:r.sha256,actual,status:actual===r.sha256?'MATCH':'CHANGED'});}catch(e){records.push({file:r.file,status:'MISSING_OR_UNREADABLE',code:e.code});}}return records;}
const before=await compare();
const groups=[{name:'existing-32',files:['audit/tests/local-regression.test.mjs','audit/tests/campaign-regression.test.mjs','audit/tests/public-error-regression.test.mjs','audit/tests/approved-api-url.test.mjs','lina_header_review_20261030/release-policy.test.mjs']},{name:'existing-7',files:['audit/followup-20261101-01/headers.test.mjs']}];
const targets=['audit/fixes/safe-html.mjs','audit/fixes/security-headers.cjs','audit/fixes/campaign-params.mjs','audit/fixes/public-error-message.mjs','audit/fixes/approved-api-url.mjs','lina_header_review_20261030/release-policy.example.mjs','audit/followup-20261101-01/security-headers-preserve.cjs'];
const sourceManifest=await Promise.all([...groups.flatMap(g=>g.files),...targets].map(async file=>({file,sha256:hash(await readFile(new URL(file,root)))})));
const runs=[];
for(const g of groups){const start=new Date().toISOString();const result=spawnSync(process.execPath,['--test',...g.files],{cwd:fileURLToPath(root),encoding:'utf8',timeout:20000});await writeFile(new URL(g.name+'.tap',out),result.stdout+result.stderr,{flag:'wx'});const count=name=>Number(result.stdout.match(new RegExp('# '+name+' (\\d+)'))?.[1]??NaN);runs.push({name:g.name,command:[process.execPath,'--test',...g.files],cwd:fileURLToPath(root),runtime:process.version,start,end:new Date().toISOString(),exitCode:result.status,signal:result.signal,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),cancelled:count('cancelled'),todo:count('todo')});}
const after=await compare();
const result={at:new Date().toISOString(),scope:'Existing local reference tests only; no new tests, no service API execution',externalRequests:0,serviceFunctionalTests:0,gitHead:spawnSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(root),encoding:'utf8'}).stdout.trim(),serviceVersion:'UNKNOWN; Git HEAD is audit repository only',runs,sourceManifest,preservation:{scope:'Existing 187-file manifest; NOT the unavailable fourth-review 26-file manifest',before,after},matrixIds:'UNAVAILABLE; no IDs invented or updated'};
await writeFile(new URL('results.json',out),JSON.stringify(result,null,2),{flag:'wx'});
const artifacts=['results.json','existing-32.tap','existing-7.tap'];const sums=await Promise.all(artifacts.map(async file=>({file,sha256:hash(await readFile(new URL(file,out)))})));await writeFile(new URL('sha256.json',out),JSON.stringify(sums,null,2),{flag:'wx'});
console.log(JSON.stringify({folder:fileURLToPath(out),runs,preservationBefore:before.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),preservationAfter:after.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
