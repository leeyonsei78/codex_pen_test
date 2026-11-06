# -*- coding: utf-8 -*-
"""Word 보고서 생성(python-docx). 도식은 글상자 대신 자동 높이 표로 만들어 글자가 잘리지 않게 한다."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from content_main import *
from content_findings import FINDINGS, GROUPS, EVIDENCE
from content_rest import *

FONT = '맑은 고딕'
MONO = 'Consolas'
NAVY = RGBColor(0x23, 0x4F, 0x86)
GRAY = RGBColor(0x56, 0x61, 0x6F)
FILL = {'head': 'EDF0F4', 'blue': 'E5ECF7', 'beige': 'F4EDDF', 'amber': 'FBEEDC', 'green': 'E3F3E9', 'label': 'EDF0F4', 'white': 'FFFFFF'}
GROUP_FILL = {'ok': 'green', 'fix': 'amber', 'tidy': 'blue', 'design': 'head'}

doc = Document()


# ------------------------------------------------------------------ 저수준 도우미
def set_fonts(style, size=None, bold=None, color=None):
    f = style.font
    f.name = FONT
    rpr = style.element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts'); rpr.append(rf)
    for a in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rf.set(qn(a), FONT)
    if size: f.size = Pt(size)
    if bold is not None: f.bold = bold
    if color is not None: f.color.rgb = color


def shade(cell, hexfill):
    tcpr = cell._tc.get_or_add_tcPr()
    for e in tcpr.findall(qn('w:shd')): tcpr.remove(e)
    shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), hexfill)
    tcpr.append(shd)


def borders(table, color='C5CCD8', sz=4, style='single'):
    tblpr = table._tbl.tblPr
    for e in tblpr.findall(qn('w:tblBorders')): tblpr.remove(e)
    b = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), style); el.set(qn('w:sz'), str(sz)); el.set(qn('w:space'), '0'); el.set(qn('w:color'), color)
        b.append(el)
    tblpr.append(b)


def cell_margins(table, top=70, bottom=70, left=110, right=110):
    tblpr = table._tbl.tblPr
    m = OxmlElement('w:tblCellMar')
    for k, v in (('top', top), ('left', left), ('bottom', bottom), ('right', right)):
        el = OxmlElement(f'w:{k}'); el.set(qn('w:w'), str(v)); el.set(qn('w:type'), 'dxa'); m.append(el)
    tblpr.append(m)


def no_split(row):
    trpr = row._tr.get_or_add_trPr(); e = OxmlElement('w:cantSplit'); trpr.append(e)


def repeat_header(row):
    trpr = row._tr.get_or_add_trPr(); e = OxmlElement('w:tblHeader'); trpr.append(e)


def widths(table, cms):
    table.autofit = False
    tblpr = table._tbl.tblPr
    lay = OxmlElement('w:tblLayout'); lay.set(qn('w:type'), 'fixed'); tblpr.append(lay)
    for row in table.rows:
        for c, w in zip(row.cells, cms):
            c.width = Cm(w)
    grid = table._tbl.tblGrid
    for gc, w in zip(grid.findall(qn('w:gridCol')), cms):
        gc.set(qn('w:w'), str(int(w * 567)))


TOK = re.compile(r'(\*\*[^*]+\*\*|`[^`]+`)')


def runs(par, text, size=None, color=None, bold=False):
    for part in TOK.split(text):
        if not part: continue
        if part.startswith('**'):
            r = par.add_run(part[2:-2]); r.bold = True
        elif part.startswith('`'):
            r = par.add_run(part[1:-1]); r.font.name = MONO
            r._r.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), FONT)
            r.font.size = Pt((size or 10) - 0.5)
        else:
            r = par.add_run(part); r.bold = bold or None
        if size and not part.startswith('`'): r.font.size = Pt(size)
        if color is not None: r.font.color.rgb = color
    return par


def para(text='', size=None, color=None, bold=False, align=None, after=4, before=0, keep=False, container=None, indent=None, hanging=None):
    p = (container or doc).add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(after); pf.space_before = Pt(before); pf.line_spacing = 1.25
    if keep: pf.keep_with_next = True
    if align: p.alignment = align
    if indent is not None: pf.left_indent = Cm(indent)
    if hanging is not None: pf.first_line_indent = Cm(-hanging)
    runs(p, text, size, color, bold)
    return p


def first_par(cell, text, **kw):
    p = cell.paragraphs[0]
    pf = p.paragraph_format; pf.space_after = Pt(kw.get('after', 2)); pf.space_before = Pt(0); pf.line_spacing = 1.2
    if kw.get('keep'): pf.keep_with_next = True
    if kw.get('align'): p.alignment = kw['align']
    runs(p, text, kw.get('size', 9.5), kw.get('color'), kw.get('bold', False))
    return p


def cell_lines(cell, items, numbered=False, size=9.5, first=True):
    """셀 안에 글머리(•) 또는 번호 문단을 만든다."""
    for i, t in enumerate(items):
        mark = f'{i + 1}. ' if numbered else '• '
        if first and i == 0:
            p = cell.paragraphs[0]
        else:
            p = cell.add_paragraph()
        pf = p.paragraph_format; pf.space_after = Pt(2); pf.space_before = Pt(0); pf.line_spacing = 1.2
        pf.left_indent = Cm(0.45); pf.first_line_indent = Cm(-0.45)
        runs(p, mark + t, size)


def h(text, level):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.keep_with_next = True
    return p


def table(head, rows, cms, size=9, head_fill='head'):
    t = doc.add_table(rows=1, cols=len(head))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t); cell_margins(t)
    for c, txt in zip(t.rows[0].cells, head):
        shade(c, FILL[head_fill]); first_par(c, txt, size=size, bold=True, color=GRAY)
    repeat_header(t.rows[0])
    for r in rows:
        row = t.add_row(); no_split(row)
        for c, txt in zip(row.cells, r):
            first_par(c, str(txt), size=size)
    widths(t, cms)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return t


def callout(text, fill='blue', size=10.5, bold=False, label=None, width=17.0):
    t = doc.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(t, color='A8C0E6' if fill == 'blue' else 'E2BE86' if fill == 'amber' else 'C5CCD8'); cell_margins(t, 110, 110, 160, 160)
    c = t.rows[0].cells[0]; shade(c, FILL[fill]); no_split(t.rows[0])
    if label:
        p = c.paragraphs[0]; r = p.add_run(label + '  '); r.bold = True; r.font.size = Pt(size - 0.5); r.font.color.rgb = NAVY
        runs(p, text, size, bold=bold)
        p.paragraph_format.space_after = Pt(0); p.paragraph_format.line_spacing = 1.3
    else:
        first_par(c, text, size=size, bold=bold, after=0)
        c.paragraphs[0].paragraph_format.line_spacing = 1.3
    widths(t, [width])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def flow(title, items, labels, note, width=15.6):
    """도식 전체를 쪼개지지 않는 한 행(cantSplit)짜리 바깥 표에 넣어 쪽 경계에서 갈라지지 않게 한다."""
    outer = doc.add_table(rows=1, cols=1); outer.alignment = WD_TABLE_ALIGNMENT.CENTER
    borders(outer, color='D2D8E0'); cell_margins(outer, 120, 120, 180, 180)
    no_split(outer.rows[0])
    cell = outer.rows[0].cells[0]
    first_par(cell, title, size=10.5, bold=True, after=6)
    for i, (head, desc, state) in enumerate(items):
        if i:
            dashed = state == 'unknown'
            ap = cell.paragraphs[-1]
            ap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            ap.paragraph_format.space_after = Pt(0); ap.paragraph_format.line_spacing = 1.0
            r = ap.add_run('▽' if dashed else '▼'); r.font.size = Pt(11); r.font.color.rgb = GRAY
        t = cell.add_table(rows=1, cols=1); t.alignment = WD_TABLE_ALIGNMENT.CENTER
        unknown = state == 'unknown'
        borders(t, color='CDB98F' if unknown else 'A8C0E6', sz=8, style='dashed' if unknown else 'single')
        cell_margins(t, 90, 90, 160, 160)
        c = t.rows[0].cells[0]; shade(c, FILL['beige' if unknown else 'blue'])
        p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(1)
        r = p.add_run(f'[{labels[state]}]  '); r.bold = True; r.font.size = Pt(8.5); r.font.color.rgb = RGBColor(0x94, 0x56, 0x0A) if unknown else NAVY
        runs(p, head, 10.5, bold=True)
        q = c.add_paragraph(); q.paragraph_format.space_after = Pt(0); q.paragraph_format.line_spacing = 1.2
        runs(q, desc, 9.5, GRAY)
        widths(t, [width - 0.4])
    np_ = cell.paragraphs[-1]
    np_.paragraph_format.space_before = Pt(6); np_.paragraph_format.space_after = Pt(0); np_.paragraph_format.line_spacing = 1.2
    runs(np_, note, 8.5, GRAY)
    widths(outer, [17.0])
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


def hyperlink(par, url, text):
    part = par.part
    rid = part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    h_ = OxmlElement('w:hyperlink'); h_.set(qn('r:id'), rid)
    r = OxmlElement('w:r'); rpr = OxmlElement('w:rPr')
    c = OxmlElement('w:color'); c.set(qn('w:val'), '0B5FCC'); rpr.append(c)
    u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); rpr.append(u)
    sz = OxmlElement('w:sz'); sz.set(qn('w:val'), '17'); rpr.append(sz)
    r.append(rpr); t = OxmlElement('w:t'); t.text = text; r.append(t); h_.append(r)
    par._p.append(h_)


def page_number_footer(section):
    f = section.footer; f.is_linked_to_previous = False
    p = f.paragraphs[0]; p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(FOOTER_SHORT + '  ·  '); r.font.size = Pt(8); r.font.color.rgb = GRAY
    run = p.add_run(); run.font.size = Pt(8); run.font.color.rgb = GRAY
    for kind, txt in (('begin', None), (None, 'PAGE'), ('end', None)):
        if kind:
            fc = OxmlElement('w:fldChar'); fc.set(qn('w:fldCharType'), kind); run._r.append(fc)
        else:
            it = OxmlElement('w:instrText'); it.set(qn('xml:space'), 'preserve'); it.text = txt; run._r.append(it)


FOOTER_SHORT = '라이나생명 공개 홈페이지 보안 점검 결과 및 조치 계획'


# ------------------------------------------------------------------ 문서 설정
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.0); sec.top_margin = Cm(2.0); sec.bottom_margin = Cm(1.8)
set_fonts(doc.styles['Normal'], 10.5)
for name, size, color in (('Heading 1', 15, NAVY), ('Heading 2', 12.5, NAVY), ('Heading 3', 11, RGBColor(0x18, 0x21, 0x2C))):
    set_fonts(doc.styles[name], size, True, color)
    doc.styles[name].paragraph_format.space_before = Pt(16 if name == 'Heading 1' else 12)
    doc.styles[name].paragraph_format.space_after = Pt(6)
page_number_footer(sec)

# ------------------------------------------------------------------ 표지
para(EYEBROW, size=9.5, color=NAVY, bold=True, after=4)
p = para(TITLE, size=18, bold=True, after=8); p.paragraph_format.keep_with_next = True
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for k, v in META:
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['label']); first_par(row.cells[0], k, bold=True, color=GRAY, size=9.5)
    first_par(row.cells[1], v, size=9.5)
widths(t, [3.0, 14.0])
para('', after=2)

# ------------------------------------------------------------------ 목차(수동)
para('목차', size=10.5, bold=True, after=2)
toc = ['1 결론', '2 이 점검은 어떻게 했나', '3 점검 대상', '4 권장 조치 순서', '5 항목별 결과', '6 위험이 이어지는 경로와 끊는 지점',
       '7 최근 금융권 사고와 비교', '8 서버 쪽 확인이 필요한 항목', '9 결정이 필요한 사항과 진행 계획', '10 검증 현황과 종료 조건',
       '11 점검 범위와 한계', '12 용어 풀이', '13 근거 자료']
for i in range(0, len(toc), 2):
    row = [toc[i], toc[i + 1] if i + 1 < len(toc) else '']
    para('   ·   '.join(x for x in row if x), size=9.5, color=GRAY, after=1)

# ------------------------------------------------------------------ 1 결론
h('1  결론', 1)
callout(SUMMARY_HEADLINE, fill='blue', size=11, bold=True)
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for k, v in SUMMARY_POINTS:
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['label']); first_par(row.cells[0], k, bold=True, size=10, color=NAVY)
    first_par(row.cells[1], v, size=10)
widths(t, [3.4, 13.6])
para('', after=2)
callout(CAUTION, fill='amber', size=10, label='읽기 전에')
counts = {g: sum(1 for f in FINDINGS if f['group'] == g) for g in GROUPS}
para(f'항목은 모두 {len(FINDINGS)}개입니다. F-01~F-10 {sum(counts[g] for g in ("fix","tidy","design"))}건과 정상 관측 {counts["ok"]}건으로 나뉩니다.', size=10, after=4)
st = doc.add_table(rows=2, cols=4); borders(st); cell_margins(st, 90, 90, 120, 120)
for i, g in enumerate(['ok', 'fix', 'tidy', 'design']):
    c0, c1 = st.rows[0].cells[i], st.rows[1].cells[i]
    shade(c0, FILL[GROUP_FILL[g]]); shade(c1, FILL[GROUP_FILL[g]])
    first_par(c0, f'{counts[g]}건', size=18, bold=True, after=0, align=WD_ALIGN_PARAGRAPH.CENTER)
    first_par(c1, f'{GROUPS[g]["icon"]} {GROUPS[g]["label"]}', size=9.5, bold=True, after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
    c1.add_paragraph()
    q = c1.paragraphs[-1]; q.paragraph_format.space_after = Pt(0); runs(q, GROUPS[g]['hint'], 8, GRAY); q.alignment = WD_ALIGN_PARAGRAPH.CENTER
widths(st, [4.25] * 4)
para('', after=2)

# ------------------------------------------------------------------ 2 방법
h('2  이 점검은 어떻게 했나', 1)
para(METHOD_INTRO, size=10.5, after=6)
t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
for i, (a, b) in enumerate(METHOD_STEPS, 1):
    row = t.add_row(); no_split(row)
    shade(row.cells[0], FILL['blue']); first_par(row.cells[0], f'{i}. {a}', bold=True, size=10)
    first_par(row.cells[1], b, size=9.5)
widths(t, [4.4, 12.6])
para('', after=4)
flow(DIAGRAM1_TITLE, DIAGRAM1, {'done': '점검함', 'partial': '일부 재현', 'unknown': '미확인'}, DIAGRAM1_NOTE)
t = doc.add_table(rows=2, cols=2); borders(t); cell_margins(t)
for c, txt in zip(t.rows[0].cells, ['수행한 작업', '수행하지 않은 작업']):
    shade(c, FILL['head']); first_par(c, txt, bold=True, size=9.5, color=GRAY)
cell_lines(t.rows[1].cells[0], DID); cell_lines(t.rows[1].cells[1], DIDNT)
widths(t, [8.5, 8.5])
para('', after=2)

# ------------------------------------------------------------------ 3 대상
h('3  점검 대상', 1)
para(SCOPE_ANSWER_TITLE, size=11, bold=True, color=NAVY, after=3, keep=True)
for s_ in SCOPE_ANSWER:
    callout(s_, fill='blue', size=10) if s_ is SCOPE_ANSWER[1] else para(s_, size=10.5, after=6)
h('3.1  이번에 실제로 점검한 주소 (www.lina.co.kr, 21개)', 2)
table(['번호', '구분', '주소', '확인한 내용'], CHECKED_PAGES, [1.2, 4.0, 6.3, 5.5])
table(['구분', '파일', '비고'], CHECKED_FILES, [3.4, 9.0, 4.6])
para(CHECKED_NOTE, size=9, color=GRAY, after=6)
h('3.2  후속 점검 대상: 이번에 점검하지 않은 사이트와 주소', 2)
para(FOLLOWUP_INTRO, size=10, after=6)
table(['번호', '사이트', '주소', '이 목록의 확인 내용', '이번 보안 점검'],
      [(r[0], r[1], r[2], r[3], SITE_STATUS.get(r[0], '미점검')) for r in SITE_ROWS], [1.1, 3.0, 4.8, 5.1, 3.0])
cnt = {k: sum(1 for r in URL_ROWS if r[5] == k) for k in ['높음', '중간', '낮음']}
# 세부 주소 23개: 가로 방향 구역
ls = doc.add_section(WD_SECTION.NEW_PAGE)
ls.orientation = WD_ORIENT.LANDSCAPE; ls.page_width, ls.page_height = Cm(29.7), Cm(21.0)
ls.left_margin = ls.right_margin = Cm(2.0); ls.top_margin = Cm(1.8); ls.bottom_margin = Cm(1.6)
page_number_footer(ls)
para(f'세부 주소 23개 (우선순위 높음 {cnt["높음"]} · 중간 {cnt["중간"]} · 낮음 {cnt["낮음"]})', size=11, bold=True, color=NAVY, after=3, keep=True)
para('이번 보안 점검에서는 아래 주소에 접속하거나 점검하지 않았습니다. 우선순위는 점검 순서를 위한 잠정 권고이며 취약점의 심각도가 아닙니다.', size=9.5, color=GRAY, after=4)
table(['번호', '구분 · 이름', '주소', '목록의 확인 내용', '우선순위(잠정)', '권고'],
      [(r[0], f'{r[1]}\n{r[2]}', r[3], r[4], r[5], r[6]) for r in URL_ROWS], [1.1, 4.2, 8.0, 5.8, 1.9, 4.7], size=8.5)
ps = doc.add_section(WD_SECTION.NEW_PAGE)
ps.orientation = WD_ORIENT.PORTRAIT; ps.page_width, ps.page_height = Cm(21.0), Cm(29.7)
ps.left_margin = ps.right_margin = Cm(2.0); ps.top_margin = Cm(2.0); ps.bottom_margin = Cm(1.8)
page_number_footer(ps)
para(FOLLOWUP_LIMIT, size=9, color=GRAY, after=6)

# ------------------------------------------------------------------ 4 조치 순서
h('4  권장 조치 순서', 1)
para(PRIORITY_INTRO, size=10, after=6)
table(['순서', '조치', '해당 항목', '이유', '목표'],
      [(str(i), t_, ids, why, tgt) for i, (fid, t_, ids, why, tgt) in enumerate(PRIORITY, 1)], [1.1, 4.6, 2.4, 6.9, 2.0])

# ------------------------------------------------------------------ 5 항목별 결과
h('5  항목별 결과', 1)
para('각 항목은 "쉽게 말하면", "비유", "확인한 것과 못 한 것", "해야 할 일" 순서로 설명합니다. 낯선 용어는 12장의 용어 풀이를 참고하십시오.', size=10, after=4)
order = [('fix', '5.1'), ('tidy', '5.2'), ('design', '5.3'), ('ok', '5.4')]
for g, num in order:
    items = sorted([f for f in FINDINGS if f['group'] == g], key=lambda x: x['priority'])
    h(f'{num}  {GROUPS[g]["icon"]} {GROUPS[g]["label"]} ({len(items)}건)', 2)
    para(GROUPS[g]['hint'], size=9.5, color=GRAY, after=4, keep=True)
    for f in items:
        label = f['id'] if not f['id'].startswith('OK') else '정상'
        h3 = h(f'{label}  {f["title"]}', 3)
        t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t, 60, 60, 110, 110)
        def row(k, fill='label'):
            r = t.add_row(); shade(r.cells[0], FILL[fill]); first_par(r.cells[0], k, bold=True, size=9, color=GRAY)
            return r.cells[1]
        c = row('분류'); first_par(c, f'원 판정: {f["orig"]}  /  담당: {f["owner"]}  /  목표: {f["target"]}', size=9)
        c = row('쉽게 말하면'); first_par(c, f['plain'], size=9.5)
        r = t.add_row(); shade(r.cells[0], FILL['blue']); first_par(r.cells[0], '비유', bold=True, size=9, color=NAVY)
        shade(r.cells[1], FILL['blue']); first_par(r.cells[1], f['analogy'], size=9.5)
        c = row('확인한 것'); cell_lines(c, f['observed'])
        c = row('아직 확인하지 못한 것'); cell_lines(c, f['unknown'])
        c = row('어떤 문제가 생길 수 있나'); first_par(c, f['impact'], size=9.5)
        c = row('해야 할 일'); cell_lines(c, f['actions'], numbered=True)
        c = row('끝났다고 보는 기준'); cell_lines(c, f['done'])
        c = row('IT 담당자용 기술 메모')
        tech = list(f['tech'])
        if f.get('code'):
            tech.append(f'확인 명령 ({f["code"][0]}): `{f["code"][1]}`')
        tech.append(EVIDENCE[f['evidence']])
        cell_lines(c, tech, size=8.5)
        for rr in t.rows: no_split(rr)
        widths(t, [3.2, 13.8])
        para('', after=4)

# ------------------------------------------------------------------ 6 경로
h('6  위험이 이어지는 경로와 끊는 지점', 1)
para(PATH_INTRO, size=10, after=6)
flow(DIAGRAM2_TITLE, DIAGRAM2, {'done': '코드로 확인', 'partial': '컴퓨터 안 재현', 'unknown': '미확인'}, DIAGRAM2_NOTE)
h('어디서 끊을 것인가', 3)
table(['끊는 위치', '먼저 적용할 조치', '효과를 확인하는 방법'], BLOCK_ROWS, [3.6, 6.7, 6.7])

# ------------------------------------------------------------------ 7 금융권
h('7  최근 금융권 사고와 비교', 1)
para(FIN_INTRO, size=10, after=6)
callout(FIN_SOURCE_NOTE, fill='amber', size=9.5)
table(['사례', '보도·발표된 내용', '라이나에 던질 질문'], FIN_CASES, [2.9, 9.0, 5.1])
para(FIN_COMPARE_INTRO, size=10, after=4)
table(['비교 영역', '라이나에서 확보한 근거', '판단', '의미와 추가 확인'], FIN_COMPARE, [3.4, 4.0, 1.9, 7.7])
callout(FIN_VERDICT, fill='blue', size=10, label=FIN_VERDICT_TITLE)

# ------------------------------------------------------------------ 8 서버
h('8  서버 쪽 확인이 필요한 항목과 합격 기준', 1)
para(SERVER_INTRO, size=10, after=6)
table(['확인 영역', '쉽게 말하면', '합격 기준'], SERVER_ROWS, [3.2, 6.6, 7.2])
h('권한 시험의 정답표 예시', 3)
para(PERM_INTRO, size=10, after=4)
table(PERM_HEAD, PERM_ROWS, [4.4, 4.2, 4.2, 4.2])
para(PERM_EXAMPLE, size=9.5, color=GRAY, after=6)

# ------------------------------------------------------------------ 9 결정과 계획
h('9  결정이 필요한 사항과 진행 계획', 1)
h('9.1  결정이 필요한 사항', 2)
para(DECISION_INTRO, size=10, after=4)
for d in DECISIONS:
    t = doc.add_table(rows=0, cols=2); borders(t); cell_margins(t)
    r = t.add_row(); no_split(r)
    for c in r.cells: shade(c, FILL['blue'])
    r.cells[0].merge(r.cells[1])
    first_par(r.cells[0], f'{d["no"]}  {d["title"]}   (권고: {d["recommend"]})', bold=True, size=10.5, color=NAVY, keep=True)
    for k, v in (('요청', d['ask']), ('승인하면', d['approve']), ('보류하면', d['hold'])):
        r = t.add_row(); no_split(r); shade(r.cells[0], FILL['label']); first_par(r.cells[0], k, bold=True, size=9, color=GRAY); first_par(r.cells[1], v, size=9.5)
    widths(t, [2.6, 14.4])
    para('', after=4)
h('9.2  진행 계획', 2)
para(PLAN_INTRO, size=10, after=4)
para(DIAGRAM3_TITLE, size=10.5, bold=True, after=3, keep=True)
st = doc.add_table(rows=2, cols=len(PLAN)); borders(st); cell_margins(st, 80, 80, 90, 90)
for i, p_ in enumerate(PLAN):
    shade(st.rows[0].cells[i], FILL['blue']); shade(st.rows[1].cells[i], FILL['blue'])
    first_par(st.rows[0].cells[i], f'{p_[0]}. {p_[1]}', bold=True, size=9, align=WD_ALIGN_PARAGRAPH.CENTER)
    first_par(st.rows[1].cells[i], f'{p_[3]}', size=8.5, color=GRAY, align=WD_ALIGN_PARAGRAPH.CENTER)
widths(st, [3.4] * 5)
para('단계는 왼쪽에서 오른쪽으로 진행합니다.', size=8.5, color=GRAY, before=3, after=6)
table(['단계', '책임(권고)', '시기', '진행할 사항', '완료 산출물'], [(f'{p_[0]}. {p_[1]}', p_[2], p_[3], p_[4], p_[5]) for p_ in PLAN], [2.8, 2.4, 2.0, 5.5, 4.3], size=8.5)
para(PLAN_MATERIALS_TITLE, size=10.5, bold=True, color=NAVY, after=3, keep=True)
for m in PLAN_MATERIALS:
    para('• ' + m, size=10, after=2, indent=0.5, hanging=0.4)
para('', after=4)
para('항목별 조치 관리표', size=10.5, bold=True, color=NAVY, after=3, keep=True)
table(['항목', '원 판정', '조치', '권고 담당', '목표'],
      [(f['id'], f['orig'], f['title'], f['owner'], f['target']) for f in sorted(FINDINGS, key=lambda x: x['priority']) if f['group'] != 'ok'],
      [1.4, 3.6, 7.0, 3.3, 1.7], size=8.5)

# ------------------------------------------------------------------ 10 검증
h('10  검증 현황과 종료 조건', 1)
para(STATUS_INTRO, size=10, after=4)
table(['검증 구분', '결과', '해석'], STATUS_ROWS, [3.6, 6.7, 6.7])
h(CLOSE_TITLE, 3)
for t_ in CLOSE_TEXT: para(t_, size=10, after=4)
h(OPS_TITLE, 3)
for t_ in OPS_TEXT: para(t_, size=10, after=4)

# ------------------------------------------------------------------ 11 한계
h('11  점검 범위와 한계', 1)
for t_ in LIMITS: para('• ' + t_, size=10, after=3, indent=0.5, hanging=0.4)
h(READ_TITLE, 3)
table(['표현', '의미'], READ_ROWS, [4.2, 12.8])

# ------------------------------------------------------------------ 12 용어
h('12  용어 풀이', 1)
table(['용어', '쉬운 설명'], GLOSSARY, [4.6, 12.4], size=9)

# ------------------------------------------------------------------ 13 근거
h('13  근거 자료', 1)
para(SOURCES_INTRO, size=10, after=4)
h('점검 기록', 3)
for v in EVIDENCE.values(): para('• ' + v, size=9.5, after=2, indent=0.5, hanging=0.4)
h('외부 출처', 3)
t = doc.add_table(rows=1, cols=3); borders(t); cell_margins(t)
for c, txt in zip(t.rows[0].cells, ['번호', '출처', '주소']):
    shade(c, FILL['head']); first_par(c, txt, bold=True, size=9, color=GRAY)
repeat_header(t.rows[0])
for k, title_, url in EXT_SOURCES:
    r = t.add_row(); no_split(r)
    first_par(r.cells[0], k, size=8.5); first_par(r.cells[1], title_, size=8.5)
    if url: hyperlink(r.cells[2].paragraphs[0], url, url)
    else: first_par(r.cells[2], '공식 문서 이름과 CVE 번호로 표기', size=8.5, color=GRAY)
widths(t, [1.2, 8.3, 7.5])
para(EXT_NOTE, size=9, color=GRAY, before=4, after=6)
para(FOOTER, size=8.5, color=GRAY, before=10)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lina-security-report.docx')
doc.core_properties.title = TITLE
doc.core_properties.author = ''
doc.save(out)
print('saved', out)
