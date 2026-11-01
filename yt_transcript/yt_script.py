#!/usr/bin/env python3
"""유튜브 주소 -> 스크립트(자막) 추출 -> 맞춤법/문맥 교정.

사용법:
    python yt_script.py "https://youtu.be/Z3LH0buv7RY" [-o out.md] [--lang ko en] [--raw] [--no-llm]

교정에는 Claude API(환경변수 ANTHROPIC_API_KEY)를 사용합니다.
키가 없거나 --no-llm 이면 규칙 기반 정리(공백/노이즈 태그/문단 나누기)만 수행합니다.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from urllib.parse import parse_qs, urlparse

MODEL = os.environ.get("YT_SCRIPT_MODEL", "claude-sonnet-5-5")
CHUNK_CHARS = 3500  # LLM 1회 호출당 입력 글자 수(문장 경계에서 분할)

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

SYSTEM_PROMPT = """너는 한국어 편집자다. 입력은 유튜브 자동/수동 자막을 이어붙인 원문이다.
다음 규칙으로 교정한 결과 텍스트만 출력하라(설명·머리말 금지).
- 맞춤법, 띄어쓰기, 문장부호를 바로잡는다.
- 음성인식 오류로 문맥상 어색한 단어는 앞뒤 문맥에 맞는 단어로 고친다. 확신이 없으면 원문을 유지한다.
- 말버릇/반복("어", "음", 중복 단어)은 의미 손실 없이 정리한다.
- 내용을 요약하거나 추가·삭제하지 말고, 화자의 말투와 의미를 유지한다.
- 의미 단위로 문단을 나누고 문단 사이에 빈 줄을 둔다.
- 입력이 한국어가 아니면 해당 언어 그대로 같은 규칙으로 교정한다(번역 금지)."""


def extract_video_id(url_or_id: str) -> str:
    s = url_or_id.strip()
    if _ID_RE.match(s):
        return s
    u = urlparse(s if "://" in s else "https://" + s)
    host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    vid = None
    if host == "youtu.be":
        vid = u.path.strip("/").split("/")[0]
    elif host in ("youtube.com", "music.youtube.com", "youtube-nocookie.com"):
        if u.path == "/watch":
            vid = parse_qs(u.query).get("v", [None])[0]
        else:
            m = re.match(r"^/(?:shorts|embed|live|v)/([^/?]+)", u.path)
            vid = m.group(1) if m else None
    if not vid or not _ID_RE.match(vid):
        raise ValueError(f"유튜브 영상 ID를 찾을 수 없습니다: {url_or_id}")
    return vid


def fetch_transcript(video_id: str, languages: list[str]) -> tuple[str, str]:
    """(텍스트 조각 리스트를 공백으로 이은 원문, 사용된 언어코드) 반환."""
    from youtube_transcript_api import YouTubeTranscriptApi

    api = YouTubeTranscriptApi()
    tl = api.list(video_id)
    try:  # 수동 자막 > 자동 생성 자막 순으로 선호 언어 탐색
        t = tl.find_transcript(languages)
    except Exception:
        t = next(iter(tl))  # 선호 언어가 없으면 아무 자막이나 사용
    snippets = t.fetch()
    return " ".join(s.text for s in snippets), t.language_code


_NOISE = re.compile(r"\[(?:음악|박수|웃음|Music|Applause|Laughter)\]|♪+", re.I)


def basic_clean(text: str) -> str:
    """LLM 없이도 가능한 규칙 기반 정리 + 문단 나누기."""
    text = _NOISE.sub(" ", text)
    text = re.sub(r"&#39;|&apos;", "'", text)
    text = text.replace("&quot;", '"').replace("&amp;", "&")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\b(\S+)( \1\b)+", r"\1", text)  # 연속 중복 단어 제거
    sents = re.split(r"(?<=[.?!。])\s+", text)
    paras = [" ".join(sents[i:i + 4]) for i in range(0, len(sents), 4)]
    return "\n\n".join(paras)


def split_chunks(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    sents = re.split(r"(?<=[.?!。])\s+", text)
    chunks, cur = [], ""
    for s in sents:
        while len(s) > limit:  # 문장부호 없는 긴 자막(자동자막)은 공백 기준 강제 분할
            cut = s.rfind(" ", 0, limit) or limit
            cut = cut if cut > 0 else limit
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(s[:cut].strip())
            s = s[cut:].strip()
        if cur and len(cur) + len(s) + 1 > limit:
            chunks.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur)
    return chunks


def refine_with_llm(text: str, client=None) -> str:
    if client is None:
        import anthropic
        client = anthropic.Anthropic()
    out = []
    chunks = split_chunks(text)
    for i, ch in enumerate(chunks, 1):
        print(f"  교정 중... {i}/{len(chunks)}", file=sys.stderr)
        r = client.messages.create(
            model=MODEL,
            max_tokens=8000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": ch}],
        )
        out.append("".join(b.text for b in r.content if b.type == "text").strip())
    return "\n\n".join(out)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="유튜브 스크립트 추출 및 교정")
    p.add_argument("url", help="유튜브 주소 또는 영상 ID")
    p.add_argument("-o", "--output", help="저장할 파일 경로(기본: <영상ID>.md)")
    p.add_argument("--lang", nargs="+", default=["ko", "en"], help="선호 자막 언어(기본: ko en)")
    p.add_argument("--raw", action="store_true", help="원문도 <영상ID>.raw.txt 로 저장")
    p.add_argument("--no-llm", action="store_true", help="Claude 교정 없이 규칙 기반 정리만 수행")
    a = p.parse_args(argv)

    try:
        vid = extract_video_id(a.url)
    except ValueError as e:
        print(e, file=sys.stderr)
        return 2
    print(f"[1/3] 자막 가져오는 중: {vid}", file=sys.stderr)
    try:
        raw, lang = fetch_transcript(vid, a.lang)
    except Exception as e:
        print(f"자막을 가져오지 못했습니다: {type(e).__name__}: {e}", file=sys.stderr)
        return 1

    print(f"[2/3] 기본 정리 (자막 언어: {lang})", file=sys.stderr)
    cleaned = basic_clean(raw)
    if a.raw:
        with open(f"{vid}.raw.txt", "w", encoding="utf-8") as f:
            f.write(raw)

    if a.no_llm or not os.environ.get("ANTHROPIC_API_KEY"):
        if not a.no_llm:
            print("ANTHROPIC_API_KEY 없음 -> 규칙 기반 정리만 수행합니다.", file=sys.stderr)
        final = cleaned
    else:
        print("[3/3] Claude로 맞춤법/문맥 교정", file=sys.stderr)
        final = refine_with_llm(re.sub(r"\n+", " ", cleaned))

    path = a.output or f"{vid}.md"
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"# 스크립트: https://youtu.be/{vid}\n\n{final}\n")
    print(f"저장 완료: {path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
