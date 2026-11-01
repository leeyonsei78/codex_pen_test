import types
import pytest
import yt_script as y

@pytest.mark.parametrize("u", [
    "https://youtu.be/Z3LH0buv7RY?si=9UnMXGdcPMCoMRpa",
    "https://www.youtube.com/watch?v=Z3LH0buv7RY&t=3s",
    "https://m.youtube.com/shorts/Z3LH0buv7RY",
    "youtube.com/embed/Z3LH0buv7RY",
    "Z3LH0buv7RY",
])
def test_id(u):
    assert y.extract_video_id(u) == "Z3LH0buv7RY"

def test_bad_id():
    with pytest.raises(ValueError):
        y.extract_video_id("https://example.com/watch?v=abc")

def test_basic_clean():
    out = y.basic_clean("[음악] 안녕하세요 안녕하세요  여러분. 반갑습니다 &#39;ok&#39;")
    assert "[음악]" not in out and "안녕하세요 여러분." in out and "'ok'" in out

def test_split_chunks_long_no_punct():
    chunks = y.split_chunks("가나다 " * 3000, limit=500)
    assert all(len(c) <= 500 for c in chunks) and len(chunks) > 1

def test_refine_mocked():
    class C:
        class messages:
            @staticmethod
            def create(**k):
                return types.SimpleNamespace(content=[types.SimpleNamespace(type="text", text="교정됨")])
    assert y.refine_with_llm("원문입니다.", client=C) == "교정됨"
