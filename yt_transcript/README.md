# yt_script — 유튜브 스크립트 추출 + 교정

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=...   # 없으면 규칙 기반 정리만 수행
python yt_script.py "https://youtu.be/Z3LH0buv7RY" -o out.md
```

옵션: `--lang ko en`(선호 자막 언어), `--raw`(원문 저장), `--no-llm`(Claude 교정 생략)

동작: URL → 영상 ID 추출 → 자막 수집(수동 자막 우선, 없으면 자동 자막) → 노이즈 태그/중복 정리 → Claude로 맞춤법·문맥 교정(청크 단위) → Markdown 저장.
테스트: `python -m pytest -q`
