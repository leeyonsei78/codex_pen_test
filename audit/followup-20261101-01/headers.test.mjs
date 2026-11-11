import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const original=require('../fixes/security-headers.cjs');
const fixed=require('./security-headers-preserve.cjs');
function mock(){const headers=new Map([['X-Frame-Options','DENY']]);return {headers,getHeader:k=>headers.get(k),setHeader:(k,v)=>headers.set(k,v),appendHeader:(k,v)=>headers.set(k,headers.has(k)?headers.get(k)+', '+v:v)};}
test('original reference weakens existing DENY; fixed reference preserves it',()=>{
 const old=mock();original({},old,()=>{});assert.equal(old.getHeader('X-Frame-Options'),'SAMEORIGIN');
 const safe=mock();fixed({},safe,()=>{});assert.equal(safe.getHeader('X-Frame-Options'),'DENY');assert.equal(safe.getHeader('Content-Security-Policy'),"frame-ancestors 'none'");
});
for(const status of [200,401,403,404,500])test(`local reference supplies frame restriction on ${status}`,async t=>{
 const server=http.createServer((req,res)=>fixed(req,res,()=>{res.statusCode=status;res.end('LOCAL_SYNTHETIC');}));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:server.address().port,path:'/',agent:false},res=>{res.resume();res.on('end',()=>resolve(res));});req.setTimeout(2000,()=>req.destroy(new Error('Local timeout')));req.on('error',reject);});
 assert.equal(response.statusCode,status);assert.equal(response.headers['x-frame-options'],'SAMEORIGIN');assert.equal(response.headers['content-security-policy'],"frame-ancestors 'self'");
});
test('existing enforced CSP remains alongside the new frame policy',()=>{
 const res=mock();res.setHeader('Content-Security-Policy',"script-src 'self'; frame-ancestors 'none'");fixed({},res,()=>{});
 assert.match(res.getHeader('Content-Security-Policy'),/^script-src 'self'; frame-ancestors 'none', frame-ancestors 'none'$/);
});
