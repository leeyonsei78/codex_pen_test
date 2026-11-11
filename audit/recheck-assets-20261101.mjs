import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const records=[];
for(const url of ['https://www.lina.co.kr/lib/jquery-3.7.1.js','https://www.lina.co.kr/lib/jquery/1.12.4/jquery.min.js']) {
  if(records.length)await delay(1000);
  const r={url,time:new Date().toISOString()};records.push(r);
  try {const res=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Authorized-Public-Security-Review/1.0'}});r.status=res.status;const text=await res.text();r.bytes=Buffer.byteLength(text);r.sha256=createHash('sha256').update(text).digest('hex');r.banner=text.slice(0,200);if(res.status===429||res.status>=500)break;}catch(e){r.error={message:e.message,code:e.cause?.code};}
}
await writeFile(new URL('./recheck-20261101/assets.json',import.meta.url),JSON.stringify({records},null,2));
console.log(JSON.stringify(records,null,2));
