# -*- coding: utf-8 -*-
"""Word 보고서 공용 도우미(python-docx). 도식은 글상자 대신 자동 높이 표로 만들어 글자가 잘리지 않게 한다."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT = os.environ.get('REPORT_FONT', '맑은 고딕')
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


FOOTER_SHORT = ''


