#!/usr/bin/env python3
"""Bakes index.html into one file that issues no external requests.

Needed because a published artifact page runs under a CSP that blocks every
foreign host, so three.js and the elevation map have to travel inside the file.
The same file is what you hand to anyone who just wants to open it locally.

    python3 bundle.py            -> dist/inverted-earth.html
"""

import base64
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "dist" / "inverted-earth.html"

SCRIPTS = ["vendor/three.min.js", "vendor/OrbitControls.js"]
HEIGHTMAP = "heightmap.webp"


def main() -> int:
    html = (HERE / "index.html").read_text(encoding="utf-8")

    for rel in SCRIPTS:
        path = HERE / rel
        if not path.exists():
            sys.exit(f"{rel} is missing — see the README, dependencies section")
        tag = f'<script src="{rel}"></script>'
        if tag not in html:
            sys.exit(f"no <script src> for {rel} in index.html")
        # A </script> inside the library text would close the block early.
        body = path.read_text(encoding="utf-8").replace("</script>", "<\\/script>")
        html = html.replace(tag, f"<script>\n{body}\n</script>")
        print(f"  embedded: {rel}  ({path.stat().st_size / 1e6:.2f} MB)")

    hm = HERE / HEIGHTMAP
    if not hm.exists():
        sys.exit(f"{HEIGHTMAP} is missing — run build_heightmap.py first")
    uri = "data:image/webp;base64," + base64.b64encode(hm.read_bytes()).decode("ascii")
    html, n = re.subn(
        r'const HEIGHTMAP_URL = "[^"]*"; /\* BUNDLE:HEIGHTMAP \*/',
        'const HEIGHTMAP_URL = "' + uri + '"; /* embedded */',
        html,
    )
    if n != 1:
        sys.exit("BUNDLE:HEIGHTMAP marker not found in index.html")
    print(f"  embedded: {HEIGHTMAP}  ({len(uri) / 1e6:.2f} MB as a data URI)")

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"\n{OUT.relative_to(HERE)}: {OUT.stat().st_size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
