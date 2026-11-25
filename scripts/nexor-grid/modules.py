#!/usr/bin/env python3
"""
Writes the module grids of Nexor Grid to lib/ascii/nexor-grid.json, so code
that draws the letters from their modules (the loader) uses exactly the
glyphs the font is built from. Run after changing GLYPHS in build.py:
  python3 scripts/nexor-grid/modules.py
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "lib" / "ascii" / "nexor-grid.json"


def main():
    glyphs = {}
    for ch, pattern in build.GLYPHS.items():
        rows = [r for r in pattern.strip("\n").split("\n")]
        glyphs[ch] = rows
    data = {"module": {"w": build.MX, "h": build.M, "grow": build.B, "cut": build.K}, "rows": build.ROWS, "glyphs": glyphs}
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    print(f"{OUT.name}: {len(glyphs)} glyphs")


if __name__ == "__main__":
    main()
