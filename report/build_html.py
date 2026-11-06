# -*- coding: utf-8 -*-
"""HTML 보고서 생성. 출력: 독립 실행형(.html)과 아티팩트 게시용 조각(.artifact.html)."""
import html, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content_main import *
from content_findings import FINDINGS, GROUPS, EVIDENCE
from content_rest import *

E = html.escape


def md(text):
    """`코드`, **굵게** 인라인 서식만 지원."""
    t = E(text, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    return t


def ul(items, cls=''):
    return '<ul%s>%s</ul>' % (f' class="{cls}"' if cls else '', ''.join(f'<li>{md(i)}</li>' for i in items))


def ol(items):
    return '<ol>%s</ol>' % ''.join(f'<li>{md(i)}</li>' for i in items)


def table(head, rows, cls='', raw_cols=()):
    th = ''.join(f'<th scope="col">{E(h)}</th>' for h in head)
    body = ''
    for r in rows:
        tds = ''.join(f'<td>{c if i in raw_cols else md(c)}</td>' for i, c in enumerate(r))
        body += f'<tr>{tds}</tr>'
    return f'<div class="tbl"><table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{body}</tbody></table></div>'


def section(sid, title, note, body):
    n = f'<p class="section-note">{md(note)}</p>' if note else ''
    return f'<section id="{sid}" aria-labelledby="h-{sid}"><div class="section-head"><h2 id="h-{sid}">{E(title)}</h2>{n}</div>{body}</section>'


def flow(title, items, labels, note):
    out = [f'<figure class="flow"><figcaption>{E(title)}</figcaption>']
    for i, (head, desc, state) in enumerate(items):
        if i:
            dashed = state == 'unknown'
            out.append(f'<div class="arrow {"dashed" if dashed else "solid"}" aria-hidden="true"><span>{"▽" if dashed else "▼"}</span></div>')
        out.append(f'<div class="box {state}"><span class="state">{E(labels[state])}</span><strong>{md(head)}</strong><p>{md(desc)}</p></div>')
    out.append(f'<p class="flow-note">{md(note)}</p></figure>')
    return ''.join(out)


def code_block(label, cmd, cid):
    return (f'<div class="code"><div class="code-head"><span>{E(label)}</span>'
            f'<button type="button" class="copy" data-target="{cid}">복사</button></div>'
            f'<pre id="{cid}"><code>{E(cmd)}</code></pre></div>')


def finding(f):
    g = GROUPS[f['group']]
    fid = f['id']
    chips = (f'<span class="chip">원 판정 · {E(f["orig"])}</span><span class="chip">담당 · {E(f["owner"])}</span>'
             f'<span class="chip">목표 · {E(f["target"])}</span>')
    tech = ul(f['tech'])
    if f.get('code'):
        tech += code_block(f['code'][0], f['code'][1], f'code-{fid}')
    panel = f'''
<div class="chips">{chips}</div>
<h4>쉽게 말하면</h4><p>{md(f['plain'])}</p>
<div class="analogy"><span>비유</span><p>{md(f['analogy'])}</p></div>
<div class="two">
  <div><h4>확인한 것</h4>{ul(f['observed'])}</div>
  <div><h4>아직 확인하지 못한 것</h4>{ul(f['unknown'])}</div>
</div>
<h4>그래서 어떤 문제가 생길 수 있나</h4><p>{md(f['impact'])}</p>
<h4>해야 할 일</h4>{ol(f['actions'])}
<h4>끝났다고 보는 기준</h4>{ul(f['done'])}
<details class="tech"><summary>IT 담당자용 기술 메모</summary>{tech}<p class="muted">{E(EVIDENCE[f['evidence']])}</p></details>'''
    return f'''
<article class="item" id="item-{fid}" data-group="{f['group']}">
  <h3><button type="button" class="head" aria-expanded="false" aria-controls="panel-{fid}">
    <span class="tag {f['group']}"><span aria-hidden="true">{g['icon']}</span> {E(g['label'])}</span>
    <span class="id">{E(fid) if not fid.startswith('OK') else '정상'}</span>
    <span class="ttl">{E(f['title'])}</span>
    <span class="caret" aria-hidden="true">▾</span>
  </button></h3>
  <div class="panel" id="panel-{fid}" hidden>{panel}</div>
</article>'''


def build_body():
    parts = []

    # ---------- 머리
    meta = ''.join(f'<div><dt>{E(k)}</dt><dd>{md(v)}</dd></div>' for k, v in META)
    nav = ''.join(f'<a href="#{i}">{E(t)}</a>' for i, t in [
        ('conclusion', '결론'), ('method', '점검 방법'), ('scope', '점검 대상'), ('priority', '조치 순서'),
        ('details', '항목별 결과'), ('decision', '결정 사항'), ('plan', '진행 계획'), ('glossary', '용어 풀이')])
    parts.append(f'''<a class="skip" href="#conclusion">본문 바로가기</a>
<header class="top"><p class="eyebrow">{E(EYEBROW)}</p><h1>{E(TITLE)}</h1><dl class="meta">{meta}</dl>
<nav aria-label="보고서 목차" class="toc">{nav}</nav></header>''')

    # ---------- 1 결론
    pts = ''.join(f'<div class="pt"><h3>{E(h)}</h3><p>{md(p)}</p></div>' for h, p in SUMMARY_POINTS)
    counts = {g: sum(1 for f in FINDINGS if f['group'] == g) for g in GROUPS}
    cards = ''
    for g in ['ok', 'fix', 'tidy', 'design']:
        cards += (f'<button type="button" class="stat {g}" data-filter="{g}" aria-pressed="false">'
                  f'<span class="n">{counts[g]}</span><span class="l"><span aria-hidden="true">{GROUPS[g]["icon"]}</span> {E(GROUPS[g]["label"])}</span>'
                  f'<span class="h">{E(GROUPS[g]["hint"])}</span></button>')
    parts.append(section('conclusion', '결론', '', f'''
<div class="headline"><p>{md(SUMMARY_HEADLINE)}</p></div>
<div class="points">{pts}</div>
<p class="caution"><strong>읽기 전에</strong> {md(CAUTION)}</p>
<p class="section-note">아래 숫자를 누르면 해당 항목만 "항목별 결과"에 표시됩니다. 항목은 모두 {len(FINDINGS)}개입니다. (F-01~F-10 {sum(counts[g] for g in ['fix','tidy','design'])}건과 정상 관측 {counts['ok']}건)</p>
<div class="stats">{cards}</div>'''))

    # ---------- 2 방법
    steps = ''.join(f'<li><strong>{E(h)}</strong><p>{md(p)}</p></li>' for h, p in METHOD_STEPS)
    parts.append(section('method', '이 점검은 어떻게 했나', '', f'''
<p class="lead">{md(METHOD_INTRO)}</p>
<ol class="steps-list">{steps}</ol>
{flow(DIAGRAM1_TITLE, DIAGRAM1, {'done': '점검함', 'partial': '일부 재현', 'unknown': '미확인'}, DIAGRAM1_NOTE)}
<div class="two did"><div><h4>수행한 작업</h4>{ul(DID)}</div><div><h4>수행하지 않은 작업</h4>{ul(DIDNT)}</div></div>'''))

    # ---------- 3 대상
    ans = ''.join(f'<p>{md(p)}</p>' for p in SCOPE_ANSWER)
    pages = table(['번호', '구분', '주소', '확인한 내용'], CHECKED_PAGES)
    files = table(['구분', '파일', '비고'], CHECKED_FILES)
    status = {r[0]: SITE_STATUS.get(r[0], '미점검') for r in SITE_ROWS}
    sites = table(['번호', '사이트', '주소', '이 목록의 확인 내용', '이번 보안 점검'],
                  [(r[0], r[1], r[2], r[3], status[r[0]]) for r in SITE_ROWS])
    cnt = {k: sum(1 for r in URL_ROWS if r[5] == k) for k in ['높음', '중간', '낮음']}
    url_rows = [(r[0], f'{r[1]} · {r[2]}', r[3], r[4], f'{r[5]} · {r[6]}') for r in URL_ROWS]
    urls = table(['번호', '구분·이름', '주소', '목록의 확인 내용', '우선순위(잠정)·권고'], url_rows)
    parts.append(section('scope', '점검 대상', '', f'''
<div class="answer"><h3>{E(SCOPE_ANSWER_TITLE)}</h3>{ans}</div>
<h3 class="sub">이번에 실제로 점검한 주소 (www.lina.co.kr, 21개)</h3>
{pages}{files}<p class="muted">{md(CHECKED_NOTE)}</p>
<h3 class="sub">후속 점검 대상: 이번에 점검하지 않은 사이트와 주소</h3>
<p>{md(FOLLOWUP_INTRO)}</p>
{sites}
<details class="more"><summary>세부 주소 23개 전체 보기 (우선순위 높음 {cnt['높음']} · 중간 {cnt['중간']} · 낮음 {cnt['낮음']})</summary>{urls}</details>
<p class="muted">{md(FOLLOWUP_LIMIT)}</p>'''))

    # ---------- 4 조치 순서
    rows = ''
    for i, (fid, title, ids, why, tgt) in enumerate(PRIORITY, 1):
        href = f'#item-{fid}' if fid != 'SRV' else '#server'
        rows += (f'<li><a class="pri" href="{href}" data-open="{fid}"><span class="no">{i}</span><span class="body"><strong>{E(title)}</strong>'
                 f'<span class="ids">{E(ids)}</span><span class="why">{md(why)}</span></span><span class="tgt">{E(tgt)}</span></a></li>')
    parts.append(section('priority', '권장 조치 순서', PRIORITY_INTRO, f'<ol class="prio">{rows}</ol>'))

    # ---------- 5 항목별 결과
    items = ''.join(finding(f) for f in sorted(FINDINGS, key=lambda x: x['priority']))
    parts.append(section('details', '항목별 결과', '각 항목을 눌러 쉬운 설명, 비유, 확인한 것과 못 한 것, 해야 할 일을 볼 수 있습니다. 보안 용어가 낯설면 "용어 풀이"를 참고하십시오.', f'''
<div class="bar"><div id="status" role="status" aria-live="polite"></div>
<div class="bulk"><button type="button" id="clear" class="btn" hidden>필터 해제</button><button type="button" id="open-all" class="btn">모두 펼치기</button><button type="button" id="close-all" class="btn">모두 접기</button></div></div>
<div id="list">{items}</div>
<p class="muted">{md('각 항목의 근거는 "근거 자료"의 근거 1~5에 해당하며, 점검 기록을 따로 보관하고 있습니다.')}</p>'''))

    # ---------- 6 경로
    parts.append(section('path', '위험이 이어지는 경로와 끊는 지점', PATH_INTRO, f'''
{flow(DIAGRAM2_TITLE, DIAGRAM2, {'done': '코드로 확인', 'partial': '컴퓨터 안 재현', 'unknown': '미확인'}, DIAGRAM2_NOTE)}
<h3 class="sub">어디서 끊을 것인가</h3>
{table(['끊는 위치', '먼저 적용할 조치', '효과를 확인하는 방법'], BLOCK_ROWS)}'''))

    # ---------- 7 금융권
    cases = ''.join(f'<details class="case"><summary><strong>{E(a)}</strong></summary><p>{md(b)}</p><p class="q"><span>라이나에 던질 질문</span> {md(c)}</p></details>' for a, b, c in FIN_CASES)
    cmp_rows = []
    for a, b, c, d in FIN_COMPARE:
        cls = {'정상 관측': 'ok', '개선 필요': 'fix', '확인 못함': 'design'}[c]
        cmp_rows.append((a, b, f'<span class="tag {cls}">{E(c)}</span>', md(d)))
    parts.append(section('finance', '최근 금융권 사고와 비교', FIN_INTRO, f'''
<p class="caution">{md(FIN_SOURCE_NOTE)}</p>
<div class="cases">{cases}</div>
<p>{md(FIN_COMPARE_INTRO)}</p>
{table(['비교 영역', '라이나에서 확보한 근거', '판단', '의미와 추가 확인'], cmp_rows, raw_cols=(2, 3))}
<div class="answer"><h3>{E(FIN_VERDICT_TITLE)}</h3><p>{md(FIN_VERDICT)}</p></div>'''))

    # ---------- 8 서버
    perm = table(PERM_HEAD, PERM_ROWS)
    parts.append(section('server', '서버 쪽 확인이 필요한 항목과 합격 기준', SERVER_INTRO, f'''
{table(['확인 영역', '쉽게 말하면', '합격 기준'], SERVER_ROWS)}
<h3 class="sub">권한 시험의 정답표 예시</h3><p>{md(PERM_INTRO)}</p>{perm}<p class="muted">{md(PERM_EXAMPLE)}</p>'''))

    # ---------- 9 결정과 계획
    dec = ''
    for d in DECISIONS:
        dec += f'''<article class="decision"><header><span class="dno">{E(d['no'])}</span><h3>{E(d['title'])}</h3><span class="rec">권고 · {E(d['recommend'])}</span></header>
<p>{md(d['ask'])}</p><div class="two"><div><h4>승인하면</h4><p>{md(d['approve'])}</p></div><div><h4>보류하면</h4><p>{md(d['hold'])}</p></div></div></article>'''
    parts.append(section('decision', '결정이 필요한 사항', DECISION_INTRO, f'<div class="decisions">{dec}</div>'))

    st = ''.join(f'<li><span class="sn">{p[0]}</span><strong>{E(p[1])}</strong><span class="when">{E(p[3])}</span></li>' for p in PLAN)
    plan_rows = [(p[0] + '  ' + p[1], p[2], p[3], p[4], p[5]) for p in PLAN]
    parts.append(section('plan', '진행 계획', PLAN_INTRO, f'''
<figure class="flow h"><figcaption>{E(DIAGRAM3_TITLE)}</figcaption><ol class="stepflow">{st}</ol></figure>
{table(['단계', '책임(권고)', '시기', '진행할 사항', '완료 산출물'], plan_rows)}
<h3 class="sub">{E(PLAN_MATERIALS_TITLE)}</h3>{ul(PLAN_MATERIALS)}
<h3 class="sub">항목별 조치 관리표</h3>
{table(['항목', '원 판정', '조치', '권고 담당', '목표'], [(f['id'], f['orig'], f['title'], f['owner'], f['target']) for f in sorted(FINDINGS, key=lambda x: x['priority']) if f['group'] != 'ok'])}'''))

    # ---------- 10 검증 현황
    parts.append(section('status-sec', '검증 현황과 종료 조건', STATUS_INTRO, f'''
{table(['검증 구분', '결과', '해석'], STATUS_ROWS)}
<h3 class="sub">{E(CLOSE_TITLE)}</h3>{''.join(f'<p>{md(t)}</p>' for t in CLOSE_TEXT)}
<h3 class="sub">{E(OPS_TITLE)}</h3>{''.join(f'<p>{md(t)}</p>' for t in OPS_TEXT)}'''))

    # ---------- 11 한계
    parts.append(section('limits', '점검 범위와 한계', '', f'''
{ul(LIMITS)}<h3 class="sub">{E(READ_TITLE)}</h3>{table(['표현', '의미'], READ_ROWS)}'''))

    # ---------- 12 용어
    gl = ''.join(f'<details class="term"><summary>{E(a)}</summary><p>{md(b)}</p></details>' for a, b in GLOSSARY)
    parts.append(section('glossary', '용어 풀이', '낯선 용어를 눌러 쉬운 설명을 볼 수 있습니다.', f'<div class="terms">{gl}</div>'))

    # ---------- 13 근거
    ev = ''.join(f'<li>{E(v)}</li>' for v in EVIDENCE.values())
    ext = ''
    for k, t, u in EXT_SOURCES:
        link = f'<a href="{E(u)}" target="_blank" rel="noopener noreferrer">{E(u)}</a>' if u else '<span class="muted">공식 문서 이름과 CVE 번호로 표기</span>'
        ext += f'<tr><td>{k}</td><td>{E(t)}</td><td>{link}</td></tr>'
    parts.append(section('sources', '근거 자료', SOURCES_INTRO, f'''
<h3 class="sub">점검 기록</h3><ul>{ev}</ul>
<h3 class="sub">외부 출처</h3><div class="tbl"><table><thead><tr><th scope="col">번호</th><th scope="col">출처</th><th scope="col">주소</th></tr></thead><tbody>{ext}</tbody></table></div>
<p class="muted">{md(EXT_NOTE)}</p>'''))

    parts.append(f'<footer class="foot"><p>{E(FOOTER)}</p></footer>')
    return '\n'.join(parts)


CSS = r'''
  /* Layout: 공문형 머리표 → 결론(필터 카드) → 방법·대상 → 조치 순서 → 항목별 결과(펼침) → 결정·계획 → 용어. 단일 열 960px */
  :root {
    --bg:#f2f4f7; --surface:#ffffff; --surface-2:#edf0f4; --rule:#d2d8e0;
    --ink:#18212c; --ink-muted:#56616f; --accent:#234f86; --accent-weak:#e5ecf5; --on-accent:#ffffff; --focus:#0b5fcc;
    --ok:#1d7443; --ok-bg:#e3f3e9; --ok-br:#9fd2b3;
    --fix:#94560a; --fix-bg:#fbeedc; --fix-br:#e2be86;
    --tidy:#234f86; --tidy-bg:#e5ecf7; --tidy-br:#a8c0e6;
    --design:#4b5466; --design-bg:#eceff4; --design-br:#c5ccd8;
    --done-bg:#e5ecf7; --done-br:#a8c0e6; --unk-bg:#f4eddf; --unk-br:#cdb98f;
    --font-body:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR","Nanum Gothic","Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
    --radius:12px; --maxw:960px;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg:#10151c; --surface:#171e28; --surface-2:#1d2531; --rule:#2c3646; --ink:#e6ebf3; --ink-muted:#9ba7b8;
    --accent:#86aee6; --accent-weak:#1b2739; --on-accent:#0f1620; --focus:#74a9ff;
    --ok:#6ed49a; --ok-bg:#13291d; --ok-br:#2f5c42; --fix:#e7b86a; --fix-bg:#2d2413; --fix-br:#6a5226;
    --tidy:#8fb5ee; --tidy-bg:#172339; --tidy-br:#344f7c; --design:#abb5c6; --design-bg:#1c222d; --design-br:#39424f;
    --done-bg:#172339; --done-br:#344f7c; --unk-bg:#2a2418; --unk-br:#5b4c2c; color-scheme:dark; } }
  :root[data-theme="dark"] {
    --bg:#10151c; --surface:#171e28; --surface-2:#1d2531; --rule:#2c3646; --ink:#e6ebf3; --ink-muted:#9ba7b8;
    --accent:#86aee6; --accent-weak:#1b2739; --on-accent:#0f1620; --focus:#74a9ff;
    --ok:#6ed49a; --ok-bg:#13291d; --ok-br:#2f5c42; --fix:#e7b86a; --fix-bg:#2d2413; --fix-br:#6a5226;
    --tidy:#8fb5ee; --tidy-bg:#172339; --tidy-br:#344f7c; --design:#abb5c6; --design-bg:#1c222d; --design-br:#39424f;
    --done-bg:#172339; --done-br:#344f7c; --unk-bg:#2a2418; --unk-br:#5b4c2c; color-scheme:dark; }

  * { box-sizing:border-box; }
  body { background:var(--bg); color:var(--ink); font-family:var(--font-body); font-size:16px; line-height:1.7; -webkit-text-size-adjust:100%; word-break:keep-all; overflow-wrap:break-word; }
  .wrap { max-width:var(--maxw); margin:0 auto; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); padding-block:28px 72px; display:flex; flex-direction:column; gap:44px; }
  .wrap > * { min-width:0; }
  a { color:var(--focus); }
  .skip { position:absolute; left:-9999px; top:0; z-index:20; background:var(--accent); color:var(--on-accent); padding:10px 16px; font-weight:700; border-radius:0 0 8px 0; }
  .skip:focus { left:0; }
  a:focus-visible, button:focus-visible, summary:focus-visible { outline:3px solid var(--focus); outline-offset:2px; border-radius:6px; }
  h1,h2,h3,h4 { text-wrap:balance; line-height:1.35; margin:0; }
  h1 { font-size:clamp(1.5rem,1.1rem + 1.8vw,2rem); font-weight:800; letter-spacing:-.01em; }
  h2 { font-size:1.28rem; font-weight:800; }
  h3.sub { font-size:1.05rem; font-weight:800; margin:26px 0 10px; }
  h4 { font-size:.92rem; font-weight:800; margin:18px 0 6px; color:var(--accent); }
  p { margin:0 0 10px; } p:last-child { margin-bottom:0; }
  ul,ol { margin:0 0 10px; padding-left:1.25rem; } li { margin:3px 0; }
  code { font-family:var(--font-mono); font-size:.88em; background:var(--surface-2); border:1px solid var(--rule); border-radius:5px; padding:1px 5px; word-break:normal; overflow-wrap:anywhere; }
  .muted { color:var(--ink-muted); font-size:.9rem; }
  .section-head { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
  .section-note { color:var(--ink-muted); font-size:.95rem; max-width:70ch; }
  section { scroll-margin-top:12px; }

  .top { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:24px; display:flex; flex-direction:column; gap:14px; }
  .eyebrow { margin:0; color:var(--accent); font-weight:700; font-size:.85rem; letter-spacing:.04em; }
  .meta { margin:0; display:grid; gap:0; border-top:1px solid var(--rule); }
  .meta > div { display:grid; grid-template-columns:7rem 1fr; gap:12px; padding:9px 0; border-bottom:1px solid var(--rule); }
  .meta dt { font-weight:700; color:var(--ink-muted); font-size:.9rem; } .meta dd { margin:0; font-size:.95rem; }
  .toc { display:flex; flex-wrap:wrap; gap:8px; }
  .toc a { text-decoration:none; font-size:.88rem; font-weight:600; padding:5px 12px; border:1px solid var(--rule); border-radius:999px; background:var(--surface-2); color:var(--ink); }
  .toc a:hover { border-color:var(--accent); color:var(--accent); }

  .headline { background:var(--accent-weak); border:1px solid var(--tidy-br); border-radius:var(--radius); padding:20px 22px; font-size:1.08rem; font-weight:600; line-height:1.7; }
  .points { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:16px 0; }
  .pt { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:16px 18px; }
  .pt h3 { font-size:.98rem; margin-bottom:6px; color:var(--accent); } .pt p { font-size:.95rem; }
  .caution { background:var(--fix-bg); border:1px solid var(--fix-br); border-radius:var(--radius); padding:14px 18px; font-size:.95rem; }
  .stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:12px; }
  .stat { text-align:left; font:inherit; color:var(--ink); background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:14px 16px; cursor:pointer; display:flex; flex-direction:column; gap:2px; }
  .stat:hover { border-color:var(--accent); }
  .stat[aria-pressed="true"] { outline:3px solid var(--focus); outline-offset:1px; }
  .stat .n { font-size:2rem; font-weight:800; line-height:1.1; font-variant-numeric:tabular-nums; }
  .stat .l { font-weight:700; font-size:.95rem; } .stat .h { font-size:.8rem; color:var(--ink-muted); line-height:1.45; }
  .stat.ok .n,.stat.ok .l { color:var(--ok); } .stat.fix .n,.stat.fix .l { color:var(--fix); }
  .stat.tidy .n,.stat.tidy .l { color:var(--tidy); } .stat.design .n,.stat.design .l { color:var(--design); }

  .lead { font-size:1.05rem; }
  .steps-list { list-style:none; padding:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; counter-reset:s; margin:14px 0 20px; }
  .steps-list li { counter-increment:s; background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:14px 16px 14px 52px; position:relative; margin:0; }
  .steps-list li::before { content:counter(s); position:absolute; left:14px; top:14px; width:26px; height:26px; border-radius:50%; background:var(--accent); color:var(--on-accent); font-weight:800; display:grid; place-items:center; font-size:.85rem; }
  .steps-list p { font-size:.92rem; margin-top:4px; color:var(--ink-muted); }
  .two { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; } .two > div { min-width:0; }

  figure.flow { margin:18px 0; background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:18px; display:flex; flex-direction:column; align-items:stretch; }
  figure.flow figcaption { font-weight:800; margin-bottom:12px; }
  .box { border:1.5px solid var(--done-br); background:var(--done-bg); border-radius:10px; padding:12px 16px; display:flex; flex-direction:column; gap:3px; }
  .box strong { font-size:1rem; } .box p { font-size:.92rem; color:var(--ink-muted); margin:0; }
  .box .state { align-self:flex-start; font-size:.75rem; font-weight:800; letter-spacing:.03em; padding:1px 8px; border-radius:999px; background:var(--surface); border:1px solid currentColor; color:var(--accent); margin-bottom:3px; }
  .box.unknown { background:var(--unk-bg); border:1.5px dashed var(--unk-br); } .box.unknown .state { color:var(--fix); }
  .arrow { text-align:center; height:30px; position:relative; color:var(--ink-muted); line-height:30px; }
  .arrow::before { content:""; position:absolute; left:50%; top:0; bottom:10px; border-left:2px solid var(--ink-muted); }
  .arrow.dashed::before { border-left-style:dashed; } .arrow span { position:absolute; left:0; right:0; bottom:-6px; font-size:.8rem; }
  .flow-note { font-size:.85rem; color:var(--ink-muted); margin-top:12px; }
  .stepflow { list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:10px; align-items:stretch; }
  .stepflow li { flex:1 1 150px; background:var(--done-bg); border:1.5px solid var(--done-br); border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; gap:4px; margin:0; position:relative; }
  .stepflow .sn { width:24px; height:24px; border-radius:50%; background:var(--accent); color:var(--on-accent); display:grid; place-items:center; font-weight:800; font-size:.8rem; }
  .stepflow .when { font-size:.82rem; color:var(--ink-muted); }

  .answer { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:18px 20px; margin-bottom:8px; }
  .answer h3 { font-size:1.02rem; margin-bottom:8px; color:var(--accent); }
  .tbl { overflow-x:auto; margin:10px 0 14px; border:1px solid var(--rule); border-radius:var(--radius); background:var(--surface); }
  table { border-collapse:collapse; width:100%; min-width:560px; font-size:.9rem; }
  th,td { text-align:left; vertical-align:top; padding:9px 12px; border-bottom:1px solid var(--rule); } tr:last-child td { border-bottom:0; }
  th { background:var(--surface-2); font-size:.82rem; color:var(--ink-muted); white-space:nowrap; } td { overflow-wrap:anywhere; }
  details.more, details.case, details.term, details.tech { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); margin:10px 0; }
  details > summary { cursor:pointer; padding:12px 16px; font-weight:700; list-style:none; } details > summary::-webkit-details-marker { display:none; }
  details > summary::after { content:"▾"; float:right; color:var(--ink-muted); } details[open] > summary::after { content:"▴"; }
  details > *:not(summary) { margin-left:16px; margin-right:16px; } details > :last-child { margin-bottom:14px; }
  details.more .tbl { margin:0 0 14px; }
  .q { font-size:.92rem; background:var(--surface-2); padding:8px 12px; border-radius:8px; } .q span { font-weight:800; color:var(--accent); margin-right:6px; }
  .terms { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; align-items:start; }

  ol.prio { list-style:none; padding:0; display:flex; flex-direction:column; gap:10px; margin:0; }
  ol.prio li { margin:0; }
  a.pri { display:grid; grid-template-columns:34px 1fr auto; gap:14px; align-items:start; text-decoration:none; color:var(--ink); background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:14px 16px; }
  a.pri:hover { border-color:var(--accent); }
  a.pri .no { width:30px; height:30px; border-radius:50%; background:var(--accent); color:var(--on-accent); display:grid; place-items:center; font-weight:800; }
  a.pri .body { display:flex; flex-direction:column; gap:2px; min-width:0; } a.pri .ids { font-size:.8rem; color:var(--ink-muted); } a.pri .why { font-size:.9rem; color:var(--ink-muted); }
  a.pri .tgt { font-size:.82rem; font-weight:700; color:var(--accent); background:var(--accent-weak); border-radius:999px; padding:2px 10px; white-space:nowrap; }

  .bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:12px; }
  #status { color:var(--ink-muted); font-size:.92rem; } .bulk { display:flex; gap:8px; flex-wrap:wrap; }
  .btn { font:inherit; font-size:.88rem; font-weight:700; color:var(--accent); background:var(--surface); border:1px solid var(--accent); border-radius:8px; padding:6px 14px; cursor:pointer; }
  .btn:hover { background:var(--accent-weak); }
  .item { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); margin-bottom:10px; overflow:hidden; scroll-margin-top:12px; }
  .item h3 { margin:0; }
  .head { all:unset; box-sizing:border-box; width:100%; cursor:pointer; display:grid; grid-template-columns:auto auto 1fr auto; gap:10px; align-items:center; padding:14px 16px; }
  .head:focus-visible { outline:3px solid var(--focus); outline-offset:-3px; }
  .head:hover { background:var(--surface-2); }
  .head .id { font-weight:800; color:var(--ink-muted); font-size:.85rem; font-variant-numeric:tabular-nums; }
  .head .ttl { font-weight:700; line-height:1.5; } .caret { color:var(--ink-muted); transition:transform .15s; }
  .head[aria-expanded="true"] .caret { transform:rotate(180deg); }
  .tag { display:inline-block; font-size:.78rem; font-weight:800; padding:2px 10px; border-radius:999px; border:1px solid; white-space:nowrap; }
  .tag.ok { color:var(--ok); background:var(--ok-bg); border-color:var(--ok-br); } .tag.fix { color:var(--fix); background:var(--fix-bg); border-color:var(--fix-br); }
  .tag.tidy { color:var(--tidy); background:var(--tidy-bg); border-color:var(--tidy-br); } .tag.design { color:var(--design); background:var(--design-bg); border-color:var(--design-br); }
  .panel { padding:4px 20px 20px; border-top:1px solid var(--rule); }
  .chips { display:flex; flex-wrap:wrap; gap:6px; margin:12px 0 4px; }
  .chip { font-size:.78rem; background:var(--surface-2); border:1px solid var(--rule); border-radius:999px; padding:2px 10px; color:var(--ink-muted); }
  .analogy { background:var(--accent-weak); border-radius:10px; padding:12px 16px; margin:12px 0; }
  .analogy span { display:inline-block; font-weight:800; font-size:.78rem; color:var(--on-accent); background:var(--accent); border-radius:999px; padding:1px 10px; margin-bottom:6px; }
  details.tech { margin-top:16px; background:var(--surface-2); } details.tech > summary { font-size:.92rem; }
  .code { margin:8px 0; border:1px solid var(--rule); border-radius:10px; overflow:hidden; background:var(--surface); }
  .code-head { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 10px 6px 14px; background:var(--surface-2); font-size:.8rem; color:var(--ink-muted); }
  .code pre { margin:0; padding:10px 14px; overflow-x:auto; font-family:var(--font-mono); font-size:.85rem; } .code pre code { background:none; border:0; padding:0; }
  .copy { font:inherit; font-size:.78rem; font-weight:700; padding:3px 10px; border-radius:6px; border:1px solid var(--accent); background:var(--surface); color:var(--accent); cursor:pointer; }

  .cases { margin:12px 0; } details.case p { font-size:.95rem; }
  .decisions { display:flex; flex-direction:column; gap:14px; }
  .decision { background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:16px 20px 18px; }
  .decision header { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:8px; }
  .decision h3 { font-size:1.02rem; flex:1 1 260px; } .dno { font-weight:800; color:var(--on-accent); background:var(--accent); border-radius:6px; padding:1px 9px; font-size:.82rem; }
  .rec { font-size:.8rem; font-weight:800; color:var(--ok); background:var(--ok-bg); border:1px solid var(--ok-br); border-radius:999px; padding:2px 10px; }
  .foot { border-top:1px solid var(--rule); padding-top:16px; color:var(--ink-muted); font-size:.85rem; }

  @media (max-width:760px) {
    .stats { grid-template-columns:repeat(2,minmax(0,1fr)); } .points,.steps-list,.two,.terms { grid-template-columns:minmax(0,1fr); }
    .meta > div { grid-template-columns:1fr; gap:2px; } .head { grid-template-columns:auto 1fr auto; } .head .id { display:none; }
    .head .ttl { grid-column:1 / -1; order:3; } a.pri { grid-template-columns:30px 1fr; } a.pri .tgt { grid-column:2; justify-self:start; }
    .top { padding:18px; } .panel { padding:4px 14px 16px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
  @media print { body { background:#fff; } .toc,.bulk,.skip,.copy,.stats { display:none !important; } .panel[hidden] { display:block !important; } }
'''

JS = r'''
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var items = $$('.item'), status = $('#status'), clearBtn = $('#clear');
  var names = { ok: '정상 관측', fix: '먼저 고칠 것', tidy: '함께 정리할 것', design: '설계·서버 확인' };
  var active = null;

  function setOpen(item, open) {
    var b = $('.head', item), p = $('.panel', item);
    b.setAttribute('aria-expanded', open ? 'true' : 'false'); p.hidden = !open;
  }
  function visibleItems() { return items.filter(function (i) { return !i.hidden; }); }
  function render() {
    items.forEach(function (i) { i.hidden = !!active && i.getAttribute('data-group') !== active; });
    $$('.stat').forEach(function (s) { s.setAttribute('aria-pressed', s.getAttribute('data-filter') === active ? 'true' : 'false'); });
    var n = visibleItems().length;
    status.textContent = active ? ('"' + names[active] + '" ' + n + '개 항목을 표시 중입니다 (전체 ' + items.length + '개)') : ('전체 ' + items.length + '개 항목을 표시 중입니다');
    clearBtn.hidden = !active;
  }
  items.forEach(function (item) {
    $('.head', item).addEventListener('click', function () { setOpen(item, $('.panel', item).hidden); });
  });
  $$('.stat').forEach(function (s) {
    s.addEventListener('click', function () {
      var f = s.getAttribute('data-filter'); active = (active === f) ? null : f; render();
      var d = $('#details'); if (d && active) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  clearBtn.addEventListener('click', function () { active = null; render(); });
  $('#open-all').addEventListener('click', function () { visibleItems().forEach(function (i) { setOpen(i, true); }); });
  $('#close-all').addEventListener('click', function () { visibleItems().forEach(function (i) { setOpen(i, false); }); });

  function openById(id) {
    var el = document.getElementById('item-' + id); if (!el) return false;
    if (el.hidden) { active = null; render(); }
    setOpen(el, true); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
  }
  $$('a.pri').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('data-open'); if (id && id !== 'SRV' && openById(id)) { e.preventDefault(); }
    });
  });
  function fromHash() {
    var m = /^#item-(.+)$/.exec(location.hash); if (m) openById(decodeURIComponent(m[1]));
  }
  window.addEventListener('hashchange', fromHash);

  $$('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var pre = document.getElementById(btn.getAttribute('data-target')); if (!pre) return;
      var text = pre.innerText;
      function done(ok) { var old = btn.textContent; btn.textContent = ok ? '복사됨' : '선택됨'; setTimeout(function () { btn.textContent = old; }, 1500); }
      function fallback() { var r = document.createRange(); r.selectNodeContents(pre); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); done(false); }
      try { navigator.clipboard.writeText(text).then(function () { done(true); }, fallback); } catch (e) { fallback(); }
    });
  });
  window.addEventListener('beforeprint', function () { items.forEach(function (i) { setOpen(i, true); }); });
  render(); fromHash();
})();
'''


def build(standalone):
    title = SHORT_TITLE
    body = build_body()
    inner = f'<div class="wrap">{body}</div>'
    if standalone:
        return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8">'
                f'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
                f'<title>{E(title)}</title><style>html{{color-scheme:light}}body{{margin:0}}{CSS}</style></head>'
                f'<body>{inner}<script>{JS}</script></body></html>')
    return (f'<title>{E(title)}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{CSS}</style>\n'
            f'{inner}\n<script>{JS}</script>\n')


if __name__ == '__main__':
    out = os.path.dirname(os.path.abspath(__file__))
    open(os.path.join(out, 'lina-security-report.html'), 'w', encoding='utf-8').write(build(True))
    open(os.path.join(out, 'lina-security-report.artifact.html'), 'w', encoding='utf-8').write(build(False))
    print('ok')
