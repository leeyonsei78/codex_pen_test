import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {releasePolicy,sessionCookieOptions} from './release-policy.example.mjs';
test('reference ingress blocks test page before application; retains prior policy on normal and error pages',async t=>{
 let reached=0;
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"script-src 'self'");
  releasePolicy(req,res,()=>{reached++;res.statusCode=req.url==='/missing'?404:200;res.end('Fixture');});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/html/gap/GM/GPN999M0.html','/html/gap/GM/GPN999M0.html?x=1','/HTML/GAP/GM/GPN999M0.HTML/']){
  const r=await fetch(base+path);assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');await r.text();
 }
 assert.equal(reached,0);
 for(const path of ['/','/missing']){
  const r=await fetch(base+path);assert.equal(r.status,path==='/missing'?404:200);
  assert.match(r.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  assert.equal(r.headers.get('x-content-type-options'),'nosniff');await r.text();
 }
 assert.equal(reached,2);
});
test('session cookie configuration defines exactly one SameSite policy and mandates Secure and HttpOnly',()=>{
 assert.deepEqual(sessionCookieOptions(),{secure:true,httpOnly:true,sameSite:'Lax',path:'/'});
 assert.deepEqual(sessionCookieOptions('None'),{secure:true,httpOnly:true,sameSite:'None',path:'/'});
 assert.throws(()=>sessionCookieOptions('Lax; SameSite=None'),TypeError);
});
