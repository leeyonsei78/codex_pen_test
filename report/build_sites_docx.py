# -*- coding: utf-8 -*-
"""8개 사이트·23개 주소 점검 계획서(Word). 공용 도우미는 docx_kit."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import docx_kit
from docx_kit import *
import content_sites as C

docx_kit.FOOTER_SHORT = '라이나생명 8개 사이트·23개 주소 보안 점검 계획 및 대상 목록'
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.0); sec.top_margin = Cm(2.0); sec.bottom_margin = Cm(1.8)
set_fonts(doc.styles['Normal'], 10.5)
for name, size, color in (('Heading 1', 15, NAVY), ('Heading 2', 12.5, NAVY), ('Heading 3', 11, RGBColor(0x18, 0x21, 0x2C))):
    set_fonts(doc.styles[name], size, True, color)
    doc.styles[name].paragraph_format.space_before = Pt(16 if name == 'Heading 1' else 12)
    doc.styles[name].paragraph_format.space_after = Pt(6)
page_number_footer(sec)

# ---------- 표지
para(C.EYEBROW, size=9.5, color=NAVY, bold=True, after=4)
p = para(C.TITLE, size=18, bold=True, after=8); p.paragraph_format.keep_with_next = True
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for k, v in C.META:
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['label']); first_par(row.cells[0], k, bold=True, color=GRAY, size=9.5)
    first_par(row.cells[1], v, size=9.5)
widths(t, [3.0, 14.0])
para('', after=2)
para('목차', size=10.5, bold=True, after=2)
toc = ['1 결론', '2 점검은 이렇게 진행합니다', '3 점검 대상', '4 유형별 점검 가이드', '5 점검 순서(제안)', '6 결정이 필요한 사항과 진행 계획', '7 점검 범위와 한계', '8 용어 풀이', '9 근거 자료']
for i in range(0, len(toc), 3):
    para('   ·   '.join(toc[i:i + 3]), size=9.5, color=GRAY, after=1)

# ---------- 1 결론
h('1  결론', 1)
callout(C.HEADLINE, fill='blue', size=11, bold=True)
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for k, v in C.POINTS:
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['label']); first_par(row.cells[0], k, bold=True, size=10, color=NAVY)
    first_par(row.cells[1], v, size=10)
widths(t, [3.6, 13.4])
para('', after=2)
callout(C.CAUTION, fill='amber', size=10, label='읽기 전에')
cnt = {k: sum(1 for r in C.URL_ROWS if r[5] == k) for k in ('높음', '중간', '낮음')}
st = doc.add_table(rows=2, cols=4); borders(st); cell_margins(st, 90, 90, 120, 120)
cells = [('▲ 우선순위 높음', f'{cnt["높음"]}건', 'amber'), ('◆ 우선순위 중간', f'{cnt["중간"]}건', 'blue'), ('● 우선순위 낮음', f'{cnt["낮음"]}건', 'head'), ('미점검', f'{len(C.URL_ROWS)} / {len(C.URL_ROWS)}', 'beige')]
for i, (lab, num, fill) in enumerate(cells):
    shade(st.rows[0].cells[i], FILL[fill]); shade(st.rows[1].cells[i], FILL[fill])
    first_par(st.rows[0].cells[i], num, size=18, bold=True, after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
    first_par(st.rows[1].cells[i], lab, size=9.5, bold=True, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
widths(st, [4.25] * 4)
para('우선순위는 점검 순서를 위한 제안이며 취약점의 심각도가 아닙니다.', size=8.5, color=GRAY, before=3, after=4)

# ---------- 2 방법
h('2  점검은 이렇게 진행합니다', 1)
para(C.METHOD_INTRO, size=10.5, after=6)
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for i, (a, b) in enumerate(C.METHOD_STEPS, 1):
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['blue']); first_par(row.cells[0], f'{i}. {a}', bold=True, size=10)
    first_par(row.cells[1], b, size=9.5)
widths(t, [4.4, 12.6])
para('', after=4)
t = doc.add_table(rows=2, cols=2); borders(t); cell_margins(t)
for c, txt in zip(t.rows[0].cells, [C.RULES_TITLE, '하지 않는 일']):
    shade(c, FILL['head']); first_par(c, txt, bold=True, size=9.5, color=GRAY)
cell_lines(t.rows[1].cells[0], C.RULES); cell_lines(t.rows[1].cells[1], C.DO_NOT)
widths(t, [8.5, 8.5])

# ---------- 3 대상
h('3  점검 대상', 1)
h('3.1  사이트와 서브도메인 8개', 2)
table(['번호', '사이트', '주소', '이 목록의 확인 내용', '이번 보안 점검'],
      [(r[0], r[1], r[2], r[3], C.SITE_STATUS.get(r[0], '미점검')) for r in C.SITE_ROWS], [1.1, 3.0, 4.8, 4.6, 3.5])
para('목록의 "확인 내용"은 검색 결과와 화면 확인 기록이며 현재 서버 응답과 다를 수 있습니다.', size=9, color=GRAY, after=4)
h('3.2  세부 주소 23개', 2)
para('세부 주소 23개는 다음 쪽의 가로 표에 있습니다. 모두 이번 보안 점검에서 접속하거나 점검하지 않았습니다.', size=10, after=4)
ls = doc.add_section(WD_SECTION.NEW_PAGE)
ls.orientation = WD_ORIENT.LANDSCAPE; ls.page_width, ls.page_height = Cm(29.7), Cm(21.0)
ls.left_margin = ls.right_margin = Cm(2.0); ls.top_margin = Cm(1.8); ls.bottom_margin = Cm(1.6)
page_number_footer(ls)
para(f'세부 주소 23개 (우선순위 높음 {cnt["높음"]} · 중간 {cnt["중간"]} · 낮음 {cnt["낮음"]})', size=11, bold=True, color=NAVY, after=3, keep=True)
para('우선순위는 점검 순서를 위한 잠정 권고이며 취약점의 심각도가 아닙니다. 점검 상태는 모두 "미점검"입니다.', size=9.5, color=GRAY, after=4)
tname = {t_['id']: t_['name'].split(' (')[0] for t_ in C.TYPES}
table(['번호', '구분 · 이름', '주소', '목록의 확인 내용', '우선순위', '권고', '유형'],
      [(r[0], f'{r[1]}\n{r[2]}', r[3], r[4], r[5], r[6], tname[C.TYPE_OF[r[0]]]) for r in C.URL_ROWS],
      [1.0, 3.7, 6.6, 5.0, 1.5, 4.0, 3.9], size=8)
ps = doc.add_section(WD_SECTION.NEW_PAGE)
ps.orientation = WD_ORIENT.PORTRAIT; ps.page_width, ps.page_height = Cm(21.0), Cm(29.7)
ps.left_margin = ps.right_margin = Cm(2.0); ps.top_margin = Cm(2.0); ps.bottom_margin = Cm(1.8)
page_number_footer(ps)

# ---------- 4 유형별 가이드
h('4  유형별 점검 가이드', 1)
para('23개 주소를 5가지 유형으로 묶어, 왜 확인하는지와 무엇을 어떻게 볼지 설명합니다.', size=10, after=4)
for i, ty in enumerate(C.TYPES, 1):
    h(f'4.{i}  {ty["name"]}', 2)
    t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t, 60, 60, 110, 110)
    def row(k, fill='label'):
        r = t.add_row(); no_split(r); shade(r.cells[0], FILL[fill]); first_par(r.cells[0], k, bold=True, size=9, color=GRAY)
        return r.cells[1]
    first_par(row('쉽게 말하면'), ty['plain'], size=9.5)
    r = t.add_row(); no_split(r); shade(r.cells[0], FILL['blue']); first_par(r.cells[0], '비유', bold=True, size=9, color=NAVY)
    shade(r.cells[1], FILL['blue']); first_par(r.cells[1], ty['analogy'], size=9.5)
    first_par(row('왜 확인하나'), ty['why'], size=9.5)
    cell_lines(row('무엇을 확인하나'), ty['check'])
    first_par(row('어떻게 확인하나'), ty['method'], size=9.5)
    cell_lines(row('끝났다고 보는 기준'), ty['done'])
    members = [f'{r[0]}번 {r[2]} ({r[5]})' for r in C.URL_ROWS if C.TYPE_OF[r[0]] == ty['id']]
    cell_lines(row('속한 주소'), members, size=9)
    if ty['note']:
        first_par(row('참고'), ty['note'], size=9, color=GRAY)
    widths(t, [3.2, 13.8])
    para('', after=4)

# ---------- 5 순서
h('5  점검 순서 (제안)', 1)
para(C.ORDER_INTRO, size=10, after=6)
table(['순서', '대상', '해당 주소', '이유'], C.ORDER, [1.1, 3.6, 4.0, 8.3])

# ---------- 6 결정과 계획
h('6  결정이 필요한 사항과 진행 계획', 1)
h('6.1  결정이 필요한 사항', 2)
for d in C.DECISIONS:
    t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
    r = t.add_row(); no_split(r)
    for c in r.cells: shade(c, FILL['blue'])
    r.cells[0].merge(r.cells[1])
    first_par(r.cells[0], f'{d["no"]}  {d["title"]}   (권고: {d["recommend"]})', bold=True, size=10.5, color=NAVY, keep=True)
    for k, v in (('요청', d['ask']), ('승인하면', d['approve']), ('보류하면', d['hold'])):
        r = t.add_row(); no_split(r); shade(r.cells[0], FILL['label']); first_par(r.cells[0], k, bold=True, size=9, color=GRAY); first_par(r.cells[1], v, size=9.5)
    widths(t, [2.6, 14.4])
    para('', after=4)
h('6.2  진행 계획', 2)
para(C.PLAN_INTRO, size=10, after=4)
para(C.DIAGRAM_TITLE, size=10.5, bold=True, after=3, keep=True)
st = doc.add_table(rows=2, cols=len(C.PLAN)); borders(st); cell_margins(st, 80, 80, 90, 90)
for i, p_ in enumerate(C.PLAN):
    shade(st.rows[0].cells[i], FILL['blue']); shade(st.rows[1].cells[i], FILL['blue'])
    first_par(st.rows[0].cells[i], f'{p_[0]}. {p_[1]}', bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    first_par(st.rows[1].cells[i], p_[3], size=8.5, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)
widths(st, [4.25] * 4)
para('단계는 왼쪽에서 오른쪽으로 진행합니다.', size=8.5, color=GRAY, before=3, after=6)
table(['단계', '책임(권고)', '시기', '진행할 사항', '완료 산출물'], [(f'{p_[0]}. {p_[1]}', p_[2], p_[3], p_[4], p_[5]) for p_ in C.PLAN], [3.0, 2.4, 2.0, 5.6, 4.0], size=8.5)
para(C.MATERIALS_TITLE, size=10.5, bold=True, color=NAVY, after=3, keep=True)
for m in C.MATERIALS:
    para('• ' + m, size=10, after=2, indent=0.5, hanging=0.4)

# ---------- 7~9
h('7  점검 범위와 한계', 1)
for t_ in C.LIMITS: para('• ' + t_, size=10, after=3, indent=0.5, hanging=0.4)
h('8  용어 풀이', 1)
table(['용어', '쉬운 설명'], C.GLOSSARY, [4.6, 12.4], size=9)
h('9  근거 자료', 1)
para(C.SOURCES_INTRO, size=10, after=3)
for s_ in C.SOURCES: para('• ' + s_, size=9.5, after=2, indent=0.5, hanging=0.4)
para(C.FOOTER, size=8.5, color=GRAY, before=10)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lina-sites-plan.docx')
doc.core_properties.title = C.TITLE
doc.core_properties.author = ''
doc.save(out)
print('saved', out)
