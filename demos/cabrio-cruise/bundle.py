"""Inline everything into one HTML file with no external requests.

A published artifact runs under a CSP that blocks every other host, so
three.js and the four source files have to travel inside the page. The
skeleton (<!doctype>, <html>, <head>, <body>) is left out: the artifact host
supplies its own and would otherwise nest a second document.

    python3 bundle.py        # -> dist/cabrio-cruise.html
"""

import pathlib
import re

HERE = pathlib.Path(__file__).parent
OUT = HERE / "dist" / "cabrio-cruise.html"

SCRIPTS = [
    HERE / "vendor" / "three.min.js",
    HERE / "src" / "post.js",
    HERE / "src" / "world.js",
    HERE / "src" / "car.js",
    HERE / "src" / "game.js",
]


def main():
    page = (HERE / "index.html").read_text(encoding="utf-8")

    title = re.search(r"<title>.*?</title>", page, re.S).group(0)
    style = re.search(r"<style>.*?</style>", page, re.S).group(0)
    body = re.search(r'<div id="app">.*?</div>\s*</div>\s*</div>', page, re.S)
    if body is None:
        raise SystemExit("could not find the #app markup in index.html")
    body = page[body.start(): page.index("<script src=", body.start())].rstrip()

    # The inline bootstrap at the end of index.html, minus its script tags.
    boot = re.findall(r"<script>(.*?)</script>", page, re.S)[-1]

    # The host's skeleton may not declare an encoding, and the page is full of
    # umlauts. A charset meta counts only inside the first 1024 bytes, so it
    # goes first — everything before the body markup is plain ASCII.
    parts = ['<meta charset="utf-8">', title, style, body]
    for path in SCRIPTS:
        parts.append("<script>\n%s\n</script>" % path.read_text(encoding="utf-8"))
    parts.append("<script>%s</script>" % boot)

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print("%s: %.0f kB" % (OUT.name, OUT.stat().st_size / 1024))


main()
