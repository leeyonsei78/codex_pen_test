import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
const base=new URL('./',import.meta.url);
const urls=(await readFile(new URL('targets.txt',base),'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const targets=[...urls,...[...new Set(urls.map(u=>new URL(u).origin))].map(u=>u.replace('https:','http:')+'/')];
const folder=new URL('node-public-review/',base);
await mkdir(folder);
const records=[];
for(const [i,url] of targets.entries()){
 if(i) await delay(1000);
 const r={id:i+1,url,time:new Date().toISOString(),method:'HEAD'};
 records.push(r);
 try{
  const res=await fetch(url,{method:'HEAD',redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Authorized-Public-Security-Review/1.0'}});
  r.status=res.status;
  r.headers=Object.fromEntries([...res.headers].filter(([k])=>k!=='set-cookie'));
  r.cookies=res.headers.getSetCookie().map(c=>({name:c.split('=')[0],attributes:c.split(';').slice(1).map(v=>v.trim())}));
  r.note='HEAD only; no redirect following or authenticated session';
  await res.body?.cancel();
  console.log(`${i+1}/${targets.length} ${r.status} ${url}`);
  if(res.status===429||res.status>=500){r.stopReason='Rate limit or server error; remaining requests not attempted';break;}
 }catch(e){r.error={message:e.message,code:e.cause?.code};console.log(`${i+1}/${targets.length} ERROR ${r.error.code??r.error.message} ${url}`);}
 await writeFile(new URL('results.json',folder),JSON.stringify({records},null,2));
 if(records.length===3&&records.every(x=>x.error?.code==='EPERM'||x.error?.code==='EACCES')) break;
}
await writeFile(new URL('results.json',folder),JSON.stringify({records},null,2));
