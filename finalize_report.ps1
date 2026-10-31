$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src='C:\codex_pen_test\deliverables\라이나생명_보안점검_통합보고서_1.docx'
$out='C:\codex_pen_test\deliverables\라이나생명_보안점검_통합보고서_최종.docx'
Copy-Item -LiteralPath $src -Destination $out
$z=[IO.Compression.ZipFile]::Open($out,[IO.Compression.ZipArchiveMode]::Update)
function Read-Part($name){$e=$z.GetEntry($name);$r=[IO.StreamReader]::new($e.Open());try{[xml]$r.ReadToEnd()}finally{$r.Dispose()}}
function Write-Part($name,$xml){$e=$z.GetEntry($name);if($e){$e.Delete()};$e=$z.CreateEntry($name);$s=$e.Open();try{$xml.Save($s)}finally{$s.Dispose()}}
$x=Read-Part 'word/document.xml'
$ns=[Xml.XmlNamespaceManager]::new($x.NameTable)
$w='http://schemas.openxmlformats.org/wordprocessingml/2006/main';$ns.AddNamespace('w',$w)
function E($name){$x.CreateElement('w',$name,$w)}
function Attr($el,$name,$value){[void]$el.SetAttribute($name,$w,[string]$value)}
function Child($el,$name){$c=$el.SelectSingleNode('w:'+$name,$ns);if(!$c){$c=E $name;[void]$el.AppendChild($c)};return ,$c}
function Text($el){($el.SelectNodes('.//w:t',$ns)|ForEach-Object InnerText)-join ''}
function P($text,$style='Normal'){$p=E 'p';$pr=E 'pPr';$s=E 'pStyle';Attr $s 'val' $style;[void]$pr.AppendChild($s);[void]$p.AppendChild($pr);$r=E 'r';$t=E 't';$t.InnerText=$text;[void]$r.AppendChild($t);[void]$p.AppendChild($r);return ,$p}
function Page{$p=E 'p';$r=E 'r';$b=E 'br';Attr $b 'type' 'page';[void]$r.AppendChild($b);[void]$p.AppendChild($r);return ,$p}
$body=$x.SelectSingleNode('//w:body',$ns)
$remove=$false
foreach($c in @($body.ChildNodes)){
 if((Text $c) -eq '후속 조치 및 재점검 계획'){$remove=$true}
 if($remove -and $c.LocalName -ne 'sectPr'){[void]$body.RemoveChild($c)}
}
foreach($p in @($x.SelectNodes('//w:p',$ns))){if((Text $p) -like '편집 방법*'){[void]$p.ParentNode.RemoveChild($p)}}
# Remove a trailing empty paragraph with a page break left by the appended draft.
while($body.LastChild.PreviousSibling.LocalName -eq 'p' -and (Text $body.LastChild.PreviousSibling) -eq ''){[void]$body.RemoveChild($body.LastChild.PreviousSibling)}
$sect=$body.SelectSingleNode('w:sectPr',$ns)
function Add($el){[void]$body.InsertBefore($el,$sect)}
$records=@(
 @('F-01','중 위험 잠정','jQuery 중복 참조 제거 및 지원 버전 통합. 최종 실행 버전과 인증·전자서명·팝업 회귀 확인.','프런트 개발·운영 / D+10','E1 / 실행 버전·회귀 결과'),
 @('F-02','중 위험 잠정','최종 응답에 프레임 정책 적용. CSP는 Report-Only 검토 후 강화. 정상·오류 응답과 제휴 iframe 검증.','웹 운영·보안 / D+10','E1 / 응답 헤더·호환성 결과'),
 @('F-03','방어 함수 결함 확인','일반 메시지 텍스트 출력 및 실제 호출부 추적. F-07과 연결하여 입력부터 DOM까지 검증. 중복 건수 합산 제외.','프런트 개발 / D+10','E1·E3 / 데이터 흐름·DOM 증적'),
 @('F-04','낮음 잠정','내부 전용 설정을 서버 영역으로 분리. 공개 번들·초기 상태에서 불필요한 내부 주소 제거 확인.','개발·배포 운영 / D+10','E1 / 변경 버전·배포 산출물'),
 @('F-05','조건부 중 위험','토큰 저장 구조 검토. 서버 수명·회전·폐기와 로그아웃 후 거부 검증. 쿠키 인증 전환 시 CSRF 통제 함께 확인.','인증·백엔드 / D+20','E2 / 인증 계약·세션 시험 결과'),
 @('F-06','낮음 잠정','승인 캠페인 필드만 저장. raw query·디버그 로그 제거 및 기존 저장값 정리. 정상 캠페인 집계 회귀 확인.','프런트·분석 운영 / D+10','E2 / 저장값·로그·회귀 결과'),
 @('F-07','수정 우선순위 높음','API 오류 메시지 텍스트 출력 및 승인 코드 매핑. 격리 환경에서 서버 입력부터 DOM까지 안전한 출력 검증.','프런트·백엔드 / D+10','E3 / 통합 패치·DOM 검증'),
 @('F-08','서버 계약 확인 필요','refresh token 회전 계약 확보. 새 값 채택, 이전 값 재사용 거부, 동시 갱신·다중 탭·로그아웃 검증.','인증·백엔드 / D+20','E3 / 회전 계약·토큰 시험 결과'),
 @('F-09','의존성 개선 필요','Axios 지원 버전 교체 및 실제 의존성 트리 확인. 허용 API에만 필요한 XSRF·인증 헤더 전달 검증.','프런트·인증 / D+10','E3 / lock 파일·브라우저 요청'),
 @('F-10','수정 우선순위 높음','인증 헤더 부착 전 승인 HTTPS origin 정확히 비교. 검사한 URL로 전송하며 비허용 목적지 차단·헤더 미부착 검증.','프런트·인증 / D+10','E4 / 통합 패치·요청 증적')
)
function ManagementTable($rows){
 $tbl=E 'tbl';$pr=E 'tblPr';$tw=E 'tblW';Attr $tw 'w' 9750;Attr $tw 'type' 'dxa';[void]$pr.AppendChild($tw);$layout=E 'tblLayout';Attr $layout 'type' 'fixed';[void]$pr.AppendChild($layout);[void]$tbl.AppendChild($pr)
 $widths=@(650,1450,4200,1750,1700);$grid=E 'tblGrid';foreach($v in $widths){$gc=E 'gridCol';Attr $gc 'w' $v;[void]$grid.AppendChild($gc)};[void]$tbl.AppendChild($grid)
 $all=@(,@('항목','기존 판정','조치와 완료 기준','권고 담당 및 목표','근거 및 완료 증적'))+$rows
 foreach($row in $all){$tr=E 'tr';foreach($i in 0..4){$tc=E 'tc';$cp=E 'tcPr';$cw=E 'tcW';Attr $cw 'w' $widths[$i];Attr $cw 'type' 'dxa';[void]$cp.AppendChild($cw);[void]$tc.AppendChild($cp);[void]$tc.AppendChild((P $row[$i]));[void]$tr.AppendChild($tc)};[void]$tbl.AppendChild($tr)};return ,$tbl
}
Add (Page);Add (P '10 항목별 조치 관리와 재점검' 'Heading1')
Add (P '본 표는 기존 발견 사항의 판정과 후속 조치를 연결한다. 전체 항목의 원본 서비스 통합·운영 배포·재점검은 미수행 상태다. 담당 부서는 권고 역할이며 실제 책임자와 확정 일정은 자산 소유 부서가 승인한다.')
Add (P 'D는 착수와 필수 자료 제공이 완료된 날이다. D+10과 D+20은 영업일 기준 제안 목표이며, 운영 반영은 변경 승인 후 D+30을 목표로 한다. 일정은 확정된 완료 약속이 아니다.')
Add (ManagementTable @($records[0..4]))
Add (P 'F-03과 F-07은 관련된 출력 경로를 함께 검증하되 독립 취약점 수로 중복 합산하지 않는다. 기존 판정은 새 증적이 확보되기 전까지 유지한다.')
Add (Page);Add (P '항목별 조치 관리 계속' 'Heading1');Add (ManagementTable @($records[5..9]))
Add (P '조치 완료와 검증 완료의 구분' 'Heading2')
Add (P '완료 처리에는 적용 버전, 수행자와 검증 일시, 변경 전후 재현 결과, 정상 업무 회귀 및 증적 위치가 필요하다. 코드 수정이나 참고 테스트 통과만으로 종료하지 않는다. 적용만 확인되고 검증이 남은 항목은 적용 완료 및 검증 대기로 구분한다.')
Add (P '증적과 판정 이력' 'Heading2')
Add (P '기존 E1부터 E5는 최초 판정의 근거다. 조치 후 증적은 해당 F 번호에 연결하여 별도로 보관하고, 판정 변경 사유와 잔여 위험, 보완 통제, 책임자 및 재검토 일자를 기록한다. 배포 자료의 개인정보·세션 값·인증정보는 마스킹한다.')
# Apply one font throughout, retaining deliberate hierarchy and diagram geometry.
foreach($r in @($x.SelectNodes('//w:r',$ns))){$rp=Child $r 'rPr';$rf=Child $rp 'rFonts';foreach($a in @('ascii','hAnsi','eastAsia','cs')){Attr $rf $a '맑은 고딕'};foreach($a in @('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme')){$rf.RemoveAttribute($a,$w)};$co=Child $rp 'color';Attr $co 'val' '000000';$co.RemoveAttribute('themeColor',$w)}
foreach($p in @($x.SelectNodes('//w:body/w:p',$ns))){
 if($p.SelectSingleNode('.//w:pict|.//w:drawing',$ns)){continue}
 $pp=Child $p 'pPr';$sty=$pp.SelectSingleNode('w:pStyle',$ns);$sid=if($sty){$sty.GetAttribute('val',$w)}else{'Normal'}
 $size=switch($sid){'Title'{46};'Heading1'{34};'Heading2'{24};'Heading3'{22};default{20}}
 foreach($r in @($p.SelectNodes('w:r',$ns))){$rp=Child $r 'rPr';Attr (Child $rp 'sz') 'val' $size;Attr (Child $rp 'szCs') 'val' $size}
 $sp=Child $pp 'spacing';Attr $sp 'after' 140;Attr $sp 'line' 276;Attr $sp 'lineRule' 'auto'
 if($sid -match 'Heading|Title'){[void](Child $pp 'keepNext')}
}
# Normalize every table to the same typography, border and shading treatment.
foreach($tbl in @($x.SelectNodes('//w:tbl',$ns))){
 $tp=Child $tbl 'tblPr';$b=Child $tp 'tblBorders';foreach($side in @('top','left','bottom','right','insideH','insideV')){$v=Child $b $side;Attr $v 'val' 'single';Attr $v 'sz' 4;Attr $v 'color' 'D9D9D9'}
 $ri=0;foreach($tr in @($tbl.SelectNodes('w:tr',$ns))){$trp=Child $tr 'trPr';[void](Child $trp 'cantSplit');if($ri -eq 0){[void](Child $trp 'tblHeader')}
 foreach($tc in @($tr.SelectNodes('w:tc',$ns))){$cp=Child $tc 'tcPr';$sh=Child $cp 'shd';Attr $sh 'fill' $(if($ri -eq 0){'DDE7EF'}elseif($ri%2 -eq 0){'FFFFFF'}else{'F4F7F9'});$va=Child $cp 'vAlign';Attr $va 'val' 'center';$m=Child $cp 'tcMar';foreach($side in @('top','left','bottom','right')){$a=Child $m $side;Attr $a 'w' 85;Attr $a 'type' 'dxa'}
 foreach($p in @($tc.SelectNodes('w:p',$ns))){$pp=Child $p 'pPr';$sp=Child $pp 'spacing';Attr $sp 'after' 40;Attr $sp 'before' 0;Attr $sp 'line' 264;Attr $sp 'lineRule' 'auto';$kn=$pp.SelectSingleNode('w:keepNext',$ns);if($kn){[void]$pp.RemoveChild($kn)}}
 foreach($r in @($tc.SelectNodes('.//w:r',$ns))){$rp=Child $r 'rPr';Attr (Child $rp 'sz') 'val' 18;Attr (Child $rp 'szCs') 'val' 18;Attr (Child $rp 'b') 'val' $(if($ri -eq 0){'1'}else{'0'})}
 };$ri++}
}
Write-Part 'word/document.xml' $x
$styles=Read-Part 'word/styles.xml';$sn=[Xml.XmlNamespaceManager]::new($styles.NameTable);$sn.AddNamespace('w',$w)
foreach($rf in $styles.SelectNodes('//w:rFonts',$sn)){foreach($a in @('ascii','hAnsi','eastAsia','cs')){$rf.SetAttribute($a,$w,'맑은 고딕')};foreach($a in @('asciiTheme','hAnsiTheme','eastAsiaTheme','cstheme')){$rf.RemoveAttribute($a,$w)}}
Write-Part 'word/styles.xml' $styles
$z.Dispose()
Write-Output $out
