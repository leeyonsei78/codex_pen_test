import {readFile,writeFile,mkdir} from 'node:fs/promises';
const root=new URL('./',import.meta.url);
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const inline=s=>{
 let t=esc(s);
 t=t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>`<a href="${url}" rel="noreferrer">${label}</a>`);
 return t.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
};
let md=await readFile(new URL('출시전_재점검.md',root),'utf8');
md=md.replace(/^# .*\r?\n/,'').replace(/^점검일:.*\r?\n/m,'');
md=md.replace('상세 목록은 `URL별_결과.md`를 참조한다. 해당 목록의 HTTP 200은 본문 정상·인증 성공·미사용 여부를 의미하지 않는다.','아래는 전체 39개 URL의 HEAD 결과다. HTTP 200은 본문 정상·인증 성공·미사용 여부를 의미하지 않는다.');
const {records}=JSON.parse(await readFile(new URL('node-public-review/results.json',root),'utf8'));
md+='\n\n| 번호 | 주소 | 상태 | HTTPS 이동 또는 오류 |\n|---|---|---|---|\n';
for(const r of records) md+=`| ${r.id} | ${r.url} | ${r.status??'미확인'} | ${r.error?.code??r.headers?.location??''} |\n`;
const policy=await readFile(new URL('release-policy.example.mjs',root),'utf8');
const test=await readFile(new URL('release-policy.test.mjs',root),'utf8');
const testResults=await readFile(new URL('local-test-results.txt',root),'utf8');
const lines=md.split(/\r?\n/);let html='',list=false,table=false;
const close=()=>{if(list){html+='</ol>';list=false;}if(table){html+='</tbody></table></div>';table=false;}};
let headings=[];
for(let i=0;i<lines.length;i++){
 const line=lines[i].trim();
 if(!line){close();continue;}
 if(line.startsWith('|')){
  if(/^\|[\s:|-]+\|$/.test(line))continue;
  const cells=line.slice(1,-1).split('|').map(s=>s.trim());
  if(!table){if(list){html+='</ol>';list=false;}html+='<div class="table-scroll"><table><thead><tr>'+cells.map(s=>`<th>${inline(s)}</th>`).join('')+'</tr></thead><tbody>';table=true;}
  else html+='<tr>'+cells.map(s=>`<td>${inline(s)}</td>`).join('')+'</tr>';
  continue;
 }
 const h=/^(#{2,3})\s+(.+)$/.exec(line);
 if(h){close();const id=`section-${headings.length+1}`;const level=h[1].length;headings.push({id,title:h[2],level});html+=`<h${level} id="${id}">${inline(h[2])}</h${level}>`;continue;}
 const li=/^\d+\.\s+(.+)$/.exec(line);
 if(li){if(!list){close();html+='<ol>';list=true;}html+=`<li>${inline(li[1])}</li>`;continue;}
 close();html+=`<p>${inline(line)}</p>`;
}
close();
const css=`
:root{color-scheme:light;--ink:#172433;--muted:#536374;--line:#d9dfe6;--pale:#f3f6fa;--accent:#184f76}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#eef1f5;color:var(--ink);font-family:"Malgun Gothic","맑은 고딕",Arial,sans-serif;font-size:15px;line-height:1.8}
main{max-width:1080px;margin:32px auto;background:white;padding:64px 72px;box-shadow:0 5px 30px #17243312}
.eyebrow{color:var(--muted);font-size:13px;letter-spacing:.08em;margin:0 0 14px}h1{color:#000;font-size:32px;line-height:1.4;margin:0 0 18px;font-weight:700}h2{color:#000;font-size:23px;margin:46px 0 14px;line-height:1.5;break-after:avoid}h3{color:#000;font-size:19px;margin:32px 0 12px;line-height:1.5;break-after:avoid}
.meta{color:var(--muted);font-size:14px;margin-bottom:30px}.lead{font-size:17px;margin:0 0 24px}.summary{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:20px 0;margin:26px 0 30px;gap:20px}.summary b{display:block;font-size:26px;line-height:1.4}.summary span{font-size:13px;color:var(--muted)}
nav{padding:0 0 24px}nav p{font-weight:700;margin:0 0 8px}nav a{display:inline-block;margin:0 20px 6px 0;font-size:14px}p{margin:12px 0 16px;overflow-wrap:anywhere}a{color:var(--accent);text-underline-offset:3px}code{font-family:Consolas,"Malgun Gothic",monospace;font-size:.9em;overflow-wrap:anywhere}p code,li code{background:var(--pale);padding:1px 4px;border-radius:3px}.table-scroll{overflow-x:auto;margin:20px 0 26px}table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.65;table-layout:fixed}th,td{border:1px solid #d9d9d9;padding:11px 12px;text-align:left;vertical-align:middle;overflow-wrap:anywhere}th{background:#e2edf6;color:#111;font-weight:700}tbody tr:nth-child(even){background:#f6f8fb}th:first-child,td:first-child{width:15%}th:nth-child(2):nth-last-child(3),td:nth-child(2):nth-last-child(3){width:46%}th:nth-child(3):nth-last-child(2),td:nth-child(3):nth-last-child(2){width:12%}thead{display:table-header-group}tr{break-inside:avoid}li{padding:3px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-family:Consolas,"Malgun Gothic",monospace;font-size:12px;line-height:1.65;padding:18px 20px;background:#f5f7fa;border:1px solid var(--line)}footer{font-size:12px;color:var(--muted);margin-top:40px}.actions{position:fixed;right:24px;bottom:24px}button{border:0;background:#184f76;color:white;border-radius:5px;padding:13px 19px;font:inherit;cursor:pointer}.print-note{font-size:12px;color:var(--muted)}
@media(max-width:760px){main{margin:0;padding:32px 22px}.summary{grid-template-columns:repeat(2,1fr)}h1{font-size:27px}table{min-width:650px}.actions{position:static;margin:20px}}
@media print{@page{size:A4;margin:18mm 17mm}body{background:#fff;font-size:10.5pt;line-height:1.65}main{max-width:none;margin:0;padding:0;box-shadow:none}h1{font-size:24pt}h2{font-size:16pt;margin-top:24pt}h3{font-size:13pt;margin-top:18pt}table{font-size:8.5pt}th,td{padding:6pt 7pt}.actions,.print-note{display:none}.table-scroll{overflow:visible}nav{display:none}.summary{padding:12pt 0;margin:18pt 0}pre{font-size:8pt}a{color:inherit}h2,h3{break-after:avoid}p{orphans:3;widows:3}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`;
const content=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>라이나생명 출시 전 보안 점검 보고서</title><style>${css}</style></head><body><main>
<header><p class="eyebrow">PUBLIC WEBSITE SECURITY REVIEW</p><h1>라이나생명 출시 전 보안 점검 보고서</h1><p class="meta">점검일 2026년 10월 30일 KST · 대상 8개 호스트 · 공개 URL 점검 및 정적 코드 검토</p><p class="lead"><strong>공개 테스트 페이지와 보안 설정 개선 항목을 확인했습니다.</strong><br>서버 측 인증과 권한 검증이 남아 있어 출시 가능 판정은 보류합니다.</p></header>
<div class="summary"><div><b>39개</b><span>HTTPS 31개와 HTTP 8개</span></div><div><b>46회</b><span>HEAD 39회와 GET 7회</span></div><div><b>5개</b><span>발견 및 확인 필요 항목</span></div><div><b>2개 통과</b><span>참고 코드 로컬 회귀 테스트</span></div></div>
<nav aria-label="보고서 목차"><p>보고서 목차</p>${headings.filter(h=>h.level===2).map(h=>`<a href="#${h.id}">${esc(h.title)}</a>`).join('')}<a href="#appendix-code">수정 참고 코드와 테스트</a></nav>
${html}
<h2 id="appendix-code">수정 참고 코드와 테스트</h2><p>아래 코드는 실제 애플리케이션에 적용하지 않은 통합 참고 예시입니다. 원본 소스와 배포 스택을 확인한 뒤 적용 방법을 결정해야 합니다.</p><h3>정책 참고 코드</h3><pre>${esc(policy)}</pre><h3>회귀 테스트</h3><pre>${esc(test)}</pre><h3>로컬 테스트 실행 결과</h3><pre>${esc(testResults.replace(/^\uFEFF/,''))}</pre>
<footer>증적 위치: C:\\codex_pen_test\\lina_header_review_20261030 · node-public-review 및 get-public-review<br>본문 근거와 원시 증적의 관찰 범위에 한정한 점검 결과이며, 실제 서비스 변경 또는 출시 승인을 의미하지 않습니다.</footer><p class="print-note">우측 아래 버튼 또는 Ctrl+P로 인쇄 및 PDF 저장이 가능합니다. 인쇄 설정에서 배경 그래픽을 사용하면 표 색상이 유지됩니다.</p>
</main><div class="actions"><button type="button" onclick="window.print()">인쇄 및 PDF 저장</button></div></body></html>`;
const out=new URL('../deliverables/',root);await mkdir(out,{recursive:true});
const path=new URL('라이나생명_출시전_보안점검_보고서_20261030.html',out);
await writeFile(path,content,'utf8');
// Validate record coverage and the report's embedded evidence and code.
if(records.length!==39||headings.filter(h=>h.level===3&&/^R0[1-5]/.test(h.title)).length!==5)throw Error('Report coverage mismatch');
if(!content.includes('pass 2')||content.includes('undefined'))throw Error('Report content validation failed');
console.log(JSON.stringify({output:decodeURIComponent(path.pathname),urlRecords:records.length,findings:5,localTests:2,bytes:Buffer.byteLength(content)},null,2));
