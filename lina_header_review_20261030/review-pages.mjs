import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const base=new URL('./',import.meta.url);
const urls=(await readFile(new URL('targets.txt',base),'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/);
const folder=new URL('get-public-review/',base); await mkdir(folder);
const records=[];
for(const id of [1,3,9,14,15,16,22]){
 if(records.length) await delay(1500);
 const url=urls[id-1], r={id,url,time:new Date().toISOString(),method:'GET'}; records.push(r);
 try{
  const res=await fetch(url,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(10000),headers:{'User-Agent':'Authorized-Public-Security-Review/1.0'}});
  r.status=res.status;r.headers=Object.fromEntries([...res.headers].filter(([k])=>k!=='set-cookie'));
  r.cookies=res.headers.getSetCookie().map(c=>({name:c.split('=')[0],attributes:c.split(';').slice(1).map(v=>v.trim())}));
  if(res.status===429||res.status>=500){await res.body?.cancel();r.stopReason='Rate limit or server error';break;}
  const chunks=[];let bytes=0;
  for await(const chunk of res.body){bytes+=chunk.length;if(bytes>1048576)throw Error('Body size limit');chunks.push(chunk);}
  const body=Buffer.concat(chunks);r.bytes=body.length;r.sha256=createHash('sha256').update(body).digest('hex');
  r.bodyFile=`page_${id}.html`; await writeFile(new URL(r.bodyFile,folder),body);
  const text=body.toString('utf8');
  r.static={title:/<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1],scripts:[...text.matchAll(/<script\b[^>]*src\s*=\s*(["'])(.*?)\1/gi)].map(m=>m[2]),forms:(text.match(/<form\b/gi)||[]).length};
 }catch(e){r.error={message:e.message,code:e.cause?.code};}
 console.log(JSON.stringify({id,url,status:r.status,error:r.error,bytes:r.bytes}));
 await writeFile(new URL('results.json',folder),JSON.stringify({records},null,2));
}
await writeFile(new URL('results.json',folder),JSON.stringify({records},null,2));
