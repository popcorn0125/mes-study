"""터미널 출력(텍스트 파일)을 터미널 모양 PNG로 캡처한다. 결과 문서의 캡처 이미지를 같은 모양으로 맞추려고 쓴다.

  python3 bench/sensor-rollup/capture.py <제목> <텍스트 파일> <PNG 경로> [강조할 정규식 ...]
  python3 bench/sensor-rollup/capture.py --html <HTML 파일> <PNG 경로> [가로 세로]   (k6 리포트 같은 페이지 그대로)

강조 정규식에 맞는 줄은 노란 배경으로 칠한다(예: 'p\\(95\\)'). 헤드리스 Chrome으로 2배율 캡처한다.
"""
import html
import os
import re
import subprocess
import sys
import tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

PAGE = """<!doctype html><meta charset="utf-8">
<style>
  body {{ margin: 0; background: #e9ecef; font-family: -apple-system, 'Apple SD Gothic Neo', sans-serif; }}
  .win {{ margin: 24px; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.18); display: inline-block; min-width: 900px; }}
  .bar {{ background: #2d3036; color: #c9ccd1; font-size: 13px; padding: 9px 14px; display: flex; gap: 8px; align-items: center; }}
  .dot {{ width: 12px; height: 12px; border-radius: 50%; display: inline-block; }}
  .title {{ margin-left: 10px; }}
  pre {{ margin: 0; background: #1e2024; color: #e3e5e8; font: 13px/1.5 'SF Mono', Menlo, monospace; padding: 16px 18px; white-space: pre; }}
  .hl {{ background: #5c4a00; color: #ffe27a; display: inline-block; min-width: 100%; }}
</style>
<div class="win" id="win">
  <div class="bar"><span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="title">{title}</span></div>
  <pre>{body}</pre>
</div>
<script>document.body.dataset.w = document.getElementById('win').offsetWidth + 48; document.body.dataset.h = document.getElementById('win').offsetHeight + 48;</script>
"""


def shoot(page_path, png_path, width, height):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--window-size={width},{height}", "--virtual-time-budget=8000",
                    f"--screenshot={png_path}", f"file://{page_path}"], check=True, capture_output=True)


def measure(page_path):
    dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--window-size=2400,400", "--dump-dom",
                          f"file://{page_path}"], check=True, capture_output=True, text=True).stdout
    w = int(re.search(r'data-w="(\d+)"', dom).group(1))
    h = int(re.search(r'data-h="(\d+)"', dom).group(1))
    return w, h


def main(argv):
    if argv[0] == "--html":
        width, height = (int(argv[3]), int(argv[4])) if len(argv) > 4 else (1440, 2400)
        shoot(os.path.abspath(argv[1]), argv[2], width, height)
        return
    title, text_path, png_path, patterns = argv[0], argv[1], argv[2], [re.compile(p) for p in argv[3:]]
    lines = []
    for line in open(text_path, encoding="utf-8").read().rstrip("\n").split("\n"):
        escaped = html.escape(line)
        lines.append(f'<span class="hl">{escaped}</span>' if any(p.search(line) for p in patterns) else escaped)
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as f:
        f.write(PAGE.format(title=html.escape(title), body="\n".join(lines)))
        page = f.name
    width, height = measure(page)
    shoot(page, png_path, width, height)
    os.unlink(page)


if __name__ == "__main__":
    main(sys.argv[1:])
