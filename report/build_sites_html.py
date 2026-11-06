# -*- coding: utf-8 -*-
"""8개 사이트·23개 주소 점검 계획서(HTML). 스타일과 도우미는 build_html을 재사용한다."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_html import md, ul, ol, table, section, CSS, E
import content_sites as C

PRI = {'높음': ('fix', '▲'), '중간': ('tidy', '◆'), '낮음': ('design', '●')}
TYPE_BY_ID = {t['id']: t for t in C.TYPES}


def url_item(r):
    no, kind, name, url, seen, pri, rec = r
    grp, icon = PRI[pri]
    t = TYPE_BY_ID[C.TYPE_OF[no]]
    panel = f'''
<div class="chips"><span class="chip">유형 · {E(t['name'].split(' (')[0])}</span><span class="chip">이번 보안 점검 · 미점검</span></div>
<h4>주소</h4><p><code>{E(url)}</code></p>
<h4>목록의 확인 내용</h4><p>{md(seen)}</p>
<h4>권고 조치 (잠정)</h4><p>{md(rec)}</p>
<p class="muted">우선순위는 점검 순서를 위한 제안이며 취약점의 심각도가 아닙니다. 이 주소는 아직 접속해 점검하지 않았습니다.</p>'''
    return f'''
<article class="item" id="url-{no}" data-group="{grp}">
  <h3><button type="button" class="head" aria-expanded="false" aria-controls="purl-{no}">
    <span class="tag {grp}"><span aria-hidden="true">{icon}</span> 우선순위 {pri}</span>
    <span class="id">{no}번</span>
    <span class="ttl">{E(name)} <span class="sub-ttl">· {E(kind)}</span></span>
    <span class="caret" aria-hidden="true">▾</span>
  </button></h3>
  <div class="panel" id="purl-{no}" hidden>{panel}</div>
</article>'''


def type_item(t):
    tag_label, tag_cls = C.TYPE_TAG[t['tag']]
    nums = [r for r in C.URL_ROWS if C.TYPE_OF[r[0]] == t['id']]
    addr = ''.join(f'<li><strong>{r[0]}번</strong> {E(r[2])} <span class="muted">· {E(r[5])}</span></li>' for r in nums)
    note = f'<p class="muted">{md(t["note"])}</p>' if t['note'] else ''
    panel = f'''
<h4>쉽게 말하면</h4><p>{md(t['plain'])}</p>
<div class="analogy"><span>비유</span><p>{md(t['analogy'])}</p></div>
<h4>왜 확인하나</h4><p>{md(t['why'])}</p>
<div class="two"><div><h4>무엇을 확인하나</h4>{ul(t['check'])}</div><div><h4>어떻게 확인하나 (읽기 전용)</h4><p>{md(t['method'])}</p></div></div>
<h4>끝났다고 보는 기준</h4>{ul(t['done'])}
<h4>이 유형에 속한 주소</h4><ul>{addr}</ul>{note}'''
    return f'''
<article class="item" id="type-{t['id']}">
  <h3><button type="button" class="head" aria-expanded="false" aria-controls="ptype-{t['id']}">
    <span class="tag {tag_cls}">{E(tag_label)}</span><span class="id">{len(nums)}개</span>
    <span class="ttl">{E(t['name'].split(' (')[0])}</span><span class="caret" aria-hidden="true">▾</span>
  </button></h3>
  <div class="panel" id="ptype-{t['id']}" hidden>{panel}</div>
</article>'''


EXTRA_CSS = '''
  .sub-ttl { font-weight:500; color:var(--ink-muted); font-size:.9rem; }
  .stat.static { cursor:default; } .stat.static:hover { border-color:var(--rule); }
  .stat.none .n,.stat.none .l { color:var(--ink); }
  div.pri { display:grid; grid-template-columns:34px 1fr; gap:14px; align-items:start; background:var(--surface); border:1px solid var(--rule); border-radius:var(--radius); padding:14px 16px; }
  div.pri .no { width:30px; height:30px; border-radius:50%; background:var(--accent); color:var(--on-accent); display:grid; place-items:center; font-weight:800; }
  div.pri .body { display:flex; flex-direction:column; gap:2px; min-width:0; } div.pri .ids { font-size:.8rem; color:var(--ink-muted); } div.pri .why { font-size:.9rem; color:var(--ink-muted); }
'''

JS = r'''
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var urls = $$('#urls .item'), status = $('#status'), clearBtn = $('#clear'), active = null;
  var names = { fix: '우선순위 높음', tidy: '우선순위 중간', design: '우선순위 낮음' };
  function setOpen(item, open) { $('.head', item).setAttribute('aria-expanded', open ? 'true' : 'false'); $('.panel', item).hidden = !open; }
  $$('.item').forEach(function (item) { $('.head', item).addEventListener('click', function () { setOpen(item, $('.panel', item).hidden); }); });
  function visible() { return urls.filter(function (i) { return !i.hidden; }); }
  function render() {
    urls.forEach(function (i) { i.hidden = !!active && i.getAttribute('data-group') !== active; });
    $$('.stat[data-filter]').forEach(function (s) { s.setAttribute('aria-pressed', s.getAttribute('data-filter') === active ? 'true' : 'false'); });
    var n = visible().length;
    status.textContent = active ? ('"' + names[active] + '" ' + n + '개 주소를 표시 중입니다 (전체 ' + urls.length + '개)') : ('전체 ' + urls.length + '개 주소를 표시 중입니다');
    clearBtn.hidden = !active;
  }
  $$('.stat[data-filter]').forEach(function (s) {
    s.addEventListener('click', function () {
      var f = s.getAttribute('data-filter'); active = (active === f) ? null : f; render();
      if (active) { var d = $('#urls-wrap'); if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
  clearBtn.addEventListener('click', function () { active = null; render(); });
  $('#open-all').addEventListener('click', function () { visible().forEach(function (i) { setOpen(i, true); }); });
  $('#close-all').addEventListener('click', function () { visible().forEach(function (i) { setOpen(i, false); }); });
  var types = $$('#types-list .item');
  $('#open-types').addEventListener('click', function () { types.forEach(function (i) { setOpen(i, true); }); });
  $('#close-types').addEventListener('click', function () { types.forEach(function (i) { setOpen(i, false); }); });
  window.addEventListener('beforeprint', function () { $$('.item').forEach(function (i) { setOpen(i, true); }); });
  render();
})();
'''


def build_body():
    P = []
    meta = ''.join(f'<div><dt>{E(k)}</dt><dd>{md(v)}</dd></div>' for k, v in C.META)
    nav = ''.join(f'<a href="#{i}">{E(t)}</a>' for i, t in [
        ('conclusion', '결론'), ('method', '점검 방법'), ('scope', '점검 대상'), ('types', '유형별 가이드'),
        ('order', '점검 순서'), ('decision', '결정 사항'), ('plan', '진행 계획'), ('glossary', '용어 풀이')])
    P.append(f'''<a class="skip" href="#conclusion">본문 바로가기</a>
<header class="top"><p class="eyebrow">{E(C.EYEBROW)}</p><h1>{E(C.TITLE)}</h1><dl class="meta">{meta}</dl>
<nav aria-label="보고서 목차" class="toc">{nav}</nav></header>''')

    cnt = {k: sum(1 for r in C.URL_ROWS if r[5] == k) for k in ('높음', '중간', '낮음')}
    pts = ''.join(f'<div class="pt"><h3>{E(h)}</h3><p>{md(p)}</p></div>' for h, p in C.POINTS)
    cards = ''
    for k, g, icon in (('높음', 'fix', '▲'), ('중간', 'tidy', '◆'), ('낮음', 'design', '●')):
        cards += (f'<button type="button" class="stat {g}" data-filter="{g}" aria-pressed="false"><span class="n">{cnt[k]}</span>'
                  f'<span class="l"><span aria-hidden="true">{icon}</span> 우선순위 {k}</span><span class="h">주소 {cnt[k]}개를 아래 목록에서 보기</span></button>')
    cards += (f'<div class="stat static none"><span class="n">{len(C.URL_ROWS)}/{len(C.URL_ROWS)}</span>'
              f'<span class="l">미점검</span><span class="h">23개 주소 모두 아직 접속해 점검하지 않았습니다</span></div>')
    P.append(section('conclusion', '결론', '', f'''
<div class="headline"><p>{md(C.HEADLINE)}</p></div>
<div class="points">{pts}</div>
<p class="caution"><strong>읽기 전에</strong> {md(C.CAUTION)}</p>
<div class="stats">{cards}</div>'''))

    steps = ''.join(f'<li><strong>{E(h)}</strong><p>{md(p)}</p></li>' for h, p in C.METHOD_STEPS)
    P.append(section('method', '점검은 이렇게 진행합니다', '', f'''
<p class="lead">{md(C.METHOD_INTRO)}</p>
<ol class="steps-list">{steps}</ol>
<div class="two did"><div><h4>점검 규칙</h4>{ul(C.RULES)}</div><div><h4>하지 않는 일</h4>{ul(C.DO_NOT)}</div></div>'''))

    sites = table(['번호', '사이트', '주소', '이 목록의 확인 내용', '이번 보안 점검'],
                  [(r[0], r[1], r[2], r[3], C.SITE_STATUS.get(r[0], '미점검')) for r in C.SITE_ROWS])
    items = ''.join(url_item(r) for r in C.URL_ROWS)
    P.append(section('scope', '점검 대상', '사이트 8개와 세부 주소 23개입니다. 주소를 누르면 목록에 기록된 확인 내용과 권고를 볼 수 있습니다.', f'''
<h3 class="sub">사이트와 서브도메인 8개</h3>{sites}
<h3 class="sub" id="urls-wrap">세부 주소 23개</h3>
<div class="bar"><div id="status" role="status" aria-live="polite"></div>
<div class="bulk"><button type="button" id="clear" class="btn" hidden>필터 해제</button><button type="button" id="open-all" class="btn">모두 펼치기</button><button type="button" id="close-all" class="btn">모두 접기</button></div></div>
<div id="urls">{items}</div>'''))

    tp = ''.join(type_item(t) for t in C.TYPES)
    P.append(section('types', '유형별 점검 가이드', '23개 주소를 5가지 유형으로 묶어, 왜 확인하는지와 무엇을 어떻게 볼지 쉽게 설명했습니다.', f'''
<div class="bar"><div></div><div class="bulk"><button type="button" id="open-types" class="btn">모두 펼치기</button><button type="button" id="close-types" class="btn">모두 접기</button></div></div>
<div id="types-list">{tp}</div>'''))

    rows = ''.join(f'<li><div class="pri"><span class="no">{n}</span><span class="body"><strong>{E(t)}</strong><span class="ids">{E(ids)}</span><span class="why">{md(w)}</span></span></div></li>' for n, t, ids, w in C.ORDER)
    P.append(section('order', '점검 순서 (제안)', C.ORDER_INTRO, f'<ol class="prio">{rows}</ol>'))

    dec = ''
    for d in C.DECISIONS:
        dec += f'''<article class="decision"><header><span class="dno">{E(d['no'])}</span><h3>{E(d['title'])}</h3><span class="rec">권고 · {E(d['recommend'])}</span></header>
<p>{md(d['ask'])}</p><div class="two"><div><h4>승인하면</h4><p>{md(d['approve'])}</p></div><div><h4>보류하면</h4><p>{md(d['hold'])}</p></div></div></article>'''
    P.append(section('decision', '결정이 필요한 사항', '각 결정은 "승인"과 "보류"의 의미가 다르므로 함께 적었습니다.', f'<div class="decisions">{dec}</div>'))

    st = ''.join(f'<li><span class="sn">{p[0]}</span><strong>{E(p[1])}</strong><span class="when">{E(p[3])}</span></li>' for p in C.PLAN)
    P.append(section('plan', '진행 계획', C.PLAN_INTRO, f'''
<figure class="flow h"><figcaption>{E(C.DIAGRAM_TITLE)}</figcaption><ol class="stepflow">{st}</ol></figure>
{table(['단계', '책임(권고)', '시기', '진행할 사항', '완료 산출물'], [(p[0] + '  ' + p[1], p[2], p[3], p[4], p[5]) for p in C.PLAN])}
<h3 class="sub">{E(C.MATERIALS_TITLE)}</h3>{ul(C.MATERIALS)}'''))

    P.append(section('limits', '점검 범위와 한계', '', ul(C.LIMITS)))
    gl = ''.join(f'<details class="term"><summary>{E(a)}</summary><p>{md(b)}</p></details>' for a, b in C.GLOSSARY)
    P.append(section('glossary', '용어 풀이', '낯선 용어를 눌러 쉬운 설명을 볼 수 있습니다.', f'<div class="terms">{gl}</div>'))
    P.append(section('sources', '근거 자료', C.SOURCES_INTRO, ul(C.SOURCES)))
    P.append(f'<footer class="foot"><p>{E(C.FOOTER)}</p></footer>')
    return '\n'.join(P)


def build(standalone):
    inner = f'<div class="wrap">{build_body()}</div>'
    css = CSS + EXTRA_CSS
    if standalone:
        return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8">'
                f'<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
                f'<title>{E(C.SHORT_TITLE)}</title><style>html{{color-scheme:light}}body{{margin:0}}{css}</style></head>'
                f'<body>{inner}<script>{JS}</script></body></html>')
    return (f'<title>{E(C.SHORT_TITLE)}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{css}</style>\n'
            f'{inner}\n<script>{JS}</script>\n')


if __name__ == '__main__':
    out = os.path.dirname(os.path.abspath(__file__))
    open(os.path.join(out, 'lina-sites-plan.html'), 'w', encoding='utf-8').write(build(True))
    open(os.path.join(out, 'lina-sites-plan.artifact.html'), 'w', encoding='utf-8').write(build(False))
    print('ok')
