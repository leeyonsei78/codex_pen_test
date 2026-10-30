// 서버/대상 사이트에서 온 문자열은 모두 textContent로만 출력한다 (innerHTML 사용 금지).
const $ = id => document.getElementById(id);
let last = null;

function cell(tr, text, cls) {
  const td = document.createElement('td');
  td.textContent = text;
  if (cls) td.className = cls;
  tr.appendChild(td);
}

function render({ result, markdown }) {
  last = { result, markdown };
  $('meta').textContent = `대상 ${result.target} · 요청 ${result.requests}건 · ${result.at}`;
  const rows = $('rows');
  rows.replaceChildren();
  const order = { medium: 0, low: 1, info: 2 };
  const sorted = [...result.findings].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
  if (!sorted.length) {
    const tr = document.createElement('tr');
    cell(tr, '발견 사항 없음');
    rows.appendChild(tr);
  }
  for (const f of sorted) {
    const tr = document.createElement('tr');
    cell(tr, f.id);
    cell(tr, f.severity, `sev-${['medium', 'low', 'info'].includes(f.severity) ? f.severity : 'info'}`);
    cell(tr, f.title);
    cell(tr, f.where);
    rows.appendChild(tr);
  }
  const diff = $('diff');
  diff.replaceChildren();
  if (result.diff) {
    const d = result.diff;
    const box = document.createElement('div');
    box.className = 'diff';
    const lines = [`이전 점검 대비: 신규 ${d.new.length}건 / 해결 ${d.resolved.length}건 / 유지 ${d.unchanged.length}건`];
    if (d.targetChanged) lines.push('경고: 기준 결과와 대상이 다릅니다.');
    if (d.incomplete) lines.push('경고: 일부 요청이 실패해 "해결" 판정이 부정확할 수 있습니다.');
    for (const f of d.new) lines.push(`신규 · ${f.id} · ${f.title}`);
    for (const f of d.resolved) lines.push(`해결 · ${f.id} · ${f.title}`);
    for (const line of lines) { const p = document.createElement('div'); p.textContent = line; box.appendChild(p); }
    diff.appendChild(box);
  }
  $('result').hidden = false;
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('dl-json').addEventListener('click', () => last && download('site-audit-result.json', JSON.stringify(last.result, null, 2), 'application/json'));
$('dl-md').addEventListener('click', () => last && download('site-audit-report.md', last.markdown, 'text/markdown'));

$('form').addEventListener('submit', async ev => {
  ev.preventDefault();
  const status = $('status');
  const run = $('run');
  status.className = '';
  status.textContent = '점검 중... (요청 사이 1초 간격이라 수십 초 걸릴 수 있습니다)';
  run.disabled = true;
  $('result').hidden = true;
  try {
    let baseline;
    const file = $('baseline').files[0];
    if (file) baseline = JSON.parse(await file.text());
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        target: $('target').value.trim(),
        paths: $('paths').value.split(',').map(s => s.trim()).filter(Boolean),
        authorized: $('authorized').checked,
        baseline,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `오류 ${res.status}`);
    status.textContent = '완료';
    render(data);
  } catch (e) {
    status.className = 'error';
    status.textContent = e.message;
  } finally {
    run.disabled = false;
  }
});
