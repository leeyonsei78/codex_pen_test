import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const out=new URL('./recheck-20261101/',import.meta.url);
await mkdir(out,{recursive:true});
const urls=(await readFile(new URL('../lina_header_review_20261030/targets.txt',import.meta.url),'utf8')).trim().split(/\r?\n/);
const targets=[...urls,...[...new Set(urls.map(u=>new URL(u).origin))].map(u=>u.replace('https:','http:')+'/')];
const records=[];
for(const [i,url] of targets.entries()) {
  if(i) await delay(1000);
  const r={id:i+1,url,time:new Date().toISOString(),method:'GET'};records.push(r);
  try {
    const res=await fetch(url,{redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Authorized-Public-Security-Review/1.0','Accept':'text/html,application/pdf;q=0.8,*/*;q=0.5'}});
    r.status=res.status;
    r.headers=Object.fromEntries([...res.headers].filter(([k])=>!['set-cookie'].includes(k)));
    r.cookies=res.headers.getSetCookie().map(c=>({name:c.split('=')[0],attributes:c.split(';').slice(1).map(v=>v.trim())}));
    const reader=res.body?.getReader();const chunks=[];let size=0;
    if(reader) {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){r.truncated=true;await reader.cancel();break;}chunks.push(value);}}
    const bytes=Buffer.concat(chunks);r.bytes=bytes.length;r.sha256=createHash('sha256').update(bytes).digest('hex');
    if((res.headers.get('content-type')||'').includes('html')) {
      const html=bytes.toString('utf8');
      r.title=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').slice(0,200);
      r.scriptSources=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]);
      r.observations={legacyJqueryReference:/jquery\/1\.12\.4|jquery[.-]1\.12\.4/i.test(html),privateRuntimeKey:/VUE_APP_PRIVATE_COMMON_API_DOMAIN|PRIVATE_DOMAINS/.test(html),internalServiceAddress:/https?:\/\/[\w.-]+\.svc(?::\d+)?/.test(html),escapeFunctionPresent:/function\s+(?:escapeHtml|excapeHtmlOrReturn)\s*\(/.test(html),ssoTestUi:/SSO/i.test(html)&&/GPN999M0/.test(url),ipRestrictionText:/허용.{0,15}IP|IP.{0,15}허용|접근.{0,10}제한/.test(html),forms:[...html.matchAll(/<form\b/gi)].length,passwordInputs:/type\s*=\s*["']password/i.test(html)};
      // Save only reviewed static helper definitions, never full runtime state or cookie values.
      r.helperDefinitions=[...html.matchAll(/function\s+(escapeHtml|excapeHtmlOrReturn)\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/g)].map(m=>m[0]).filter(s=>s.length<6000);
    }
    console.log(`${r.id}/${targets.length} ${r.status} ${url}`);
    if(res.status===429||res.status>=500){r.stopReason='Rate limit or server error: stopped all further requests';break;}
  }catch(e){r.error={message:e.message,code:e.cause?.code};console.log(`${r.id}/${targets.length} ERROR ${r.error.code||r.error.message}`);}
  await writeFile(new URL('responses.json',out),JSON.stringify({records},null,2));
  if(records.length===3&&records.every(x=>['EPERM','EACCES'].includes(x.error?.code)))break;
}
await writeFile(new URL('responses.json',out),JSON.stringify({records},null,2));
