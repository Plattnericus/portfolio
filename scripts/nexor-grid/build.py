#!/usr/bin/env python3
"""
Nexor Grid: the display face of plattnericus.dev, generated from code.

Every glyph is drawn on a grid of modules. The outline follows three rules,
so every edge runs at 0, 45 or 90 degrees and the ASCII renderer can trace it
with - / | \\ :
  - a module's outer corner is cut at 45 degrees where nothing touches it
  - an inner corner between strokes gets a small 45 degree fillet
  - two modules that only touch at a corner are joined by a 45 degree stroke

Writes a TrueType font wrapped as WOFF, with no dependencies beyond the
Python standard library:  python3 scripts/nexor-grid/build.py
"""

import math
import struct
import sys
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "app" / "fonts" / "NexorGrid.woff"

UPM = 1000
M = 100  # module height
MX = 120  # module width: an extended face
B = 24  # every module grows by this on each side: heavier strokes
K = 40  # outer corner cut
F = 26  # inner corner fillet
SB = 55  # side bearing
ROWS = 7
CAP = ROWS * M + 2 * B

GLYPHS = {
    "A": """
.###.
#...#
#...#
#####
#...#
#...#
#...#""",
    "B": """
####.
#...#
#...#
####.
#...#
#...#
####.""",
    "C": """
.####
#....
#....
#....
#....
#....
.####""",
    "D": """
####.
#...#
#...#
#...#
#...#
#...#
####.""",
    "E": """
#####
#....
#....
####.
#....
#....
#####""",
    "F": """
#####
#....
#....
####.
#....
#....
#....""",
    "G": """
.####
#....
#....
#..##
#...#
#...#
.###.""",
    "H": """
#...#
#...#
#...#
#####
#...#
#...#
#...#""",
    "I": """
#
#
#
#
#
#
#""",
    "J": """
....#
....#
....#
....#
....#
#...#
.###.""",
    "K": """
#...#
#..#.
#.#..
##...
#.#..
#..#.
#...#""",
    "L": """
#....
#....
#....
#....
#....
#....
#####""",
    "M": """
#...#
##.##
#.#.#
#...#
#...#
#...#
#...#""",
    "N": """
#...#
##..#
#.#.#
#..##
#...#
#...#
#...#""",
    "O": """
.###.
#...#
#...#
#...#
#...#
#...#
.###.""",
    "P": """
####.
#...#
#...#
####.
#....
#....
#....""",
    "Q": """
.###.
#...#
#...#
#...#
#.#.#
#..#.
.##.#""",
    "R": """
####.
#...#
#...#
####.
#.#..
#..#.
#...#""",
    "S": """
.####
#....
#....
.###.
....#
....#
####.""",
    "T": """
#####
..#..
..#..
..#..
..#..
..#..
..#..""",
    "U": """
#...#
#...#
#...#
#...#
#...#
#...#
.###.""",
    "V": """
#...#
#...#
#...#
#...#
#...#
.#.#.
..#..""",
    "W": """
#...#
#...#
#...#
#...#
#.#.#
##.##
#...#""",
    "X": """
#...#
#...#
.#.#.
..#..
.#.#.
#...#
#...#""",
    "Y": """
#...#
#...#
.#.#.
..#..
..#..
..#..
..#..""",
    "Z": """
#####
....#
...#.
..#..
.#...
#....
#####""",
    "0": """
.###.
#...#
#..##
#.#.#
##..#
#...#
.###.""",
    "1": """
..#..
.##..
#.#..
..#..
..#..
..#..
#####""",
    "2": """
.###.
#...#
....#
...#.
..#..
.#...
#####""",
    "3": """
####.
....#
....#
.###.
....#
....#
####.""",
    "4": """
...#.
..##.
.#.#.
#..#.
#####
...#.
...#.""",
    "5": """
#####
#....
#....
####.
....#
....#
####.""",
    "6": """
.###.
#....
#....
####.
#...#
#...#
.###.""",
    "7": """
#####
....#
...#.
..#..
..#..
..#..
..#..""",
    "8": """
.###.
#...#
#...#
.###.
#...#
#...#
.###.""",
    "9": """
.###.
#...#
#...#
.####
....#
....#
.###.""",
    ".": """
.
.
.
.
.
.
#""",
    ",": """
.
.
.
.
.
#
#""",
    ":": """
.
.
#
.
.
.
#""",
    ";": """
.
.
#
.
.
#
#""",
    "'": """
#
#
.
.
.
.
.""",
    '"': """
#.#
#.#
...
...
...
...
...""",
    "!": """
#
#
#
#
#
.
#""",
    "?": """
.###.
#...#
....#
...#.
..#..
.....
..#..""",
    "-": """
...
...
...
###
...
...
...""",
    "_": """
....
....
....
....
....
....
####""",
    "+": """
.....
.....
..#..
#####
..#..
.....
.....""",
    "=": """
....
....
####
....
####
....
....""",
    "/": """
....#
...#.
...#.
..#..
.#...
.#...
#....""",
    "\\": """
#....
.#...
.#...
..#..
...#.
...#.
....#""",
    "&": """
.##..
#..#.
#..#.
.##..
#.#.#
#..#.
.##.#""",
    "@": """
.####.
#....#
#..###
#.#..#
#..###
#.....
.#####""",
    "#": """
.#.#.
#####
.#.#.
.#.#.
#####
.#.#.
.....""",
    "*": """
.....
#.#.#
.###.
#####
.###.
#.#.#
.....""",
    "(": """
.#
#.
#.
#.
#.
#.
.#""",
    ")": """
#.
.#
.#
.#
.#
.#
#.""",
    "[": """
##
#.
#.
#.
#.
#.
##""",
    "]": """
##
.#
.#
.#
.#
.#
##""",
    "<": """
....
...#
..#.
.#..
..#.
...#
....""",
    ">": """
....
#...
.#..
..#.
.#..
#...
....""",
    "%": """
##..#
##..#
...#.
..#..
.#...
#..##
#..##""",
    "|": """
#
#
#
#
#
#
#""",
}

# characters drawn with another glyph
ALIASES = {"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-"}


def parse(pattern):
    rows = [r for r in pattern.strip("\n").split("\n")]
    assert len(rows) == ROWS, pattern
    w = len(rows[0])
    assert all(len(r) == w for r in rows), pattern
    return [[ch == "#" for ch in r] for r in rows], w


def outline(grid, cols):
    def on(x, y):
        return 0 <= x < cols and 0 <= y < ROWS and grid[y][x]

    def box(x, y):
        x0 = x * MX - B
        x1 = (x + 1) * MX + B
        y1 = (ROWS - y) * M + B
        y0 = (ROWS - 1 - y) * M - B
        return x0, y0, x1, y1

    contours = []
    keep = set()  # (x, y, corner) that a diagonal stroke runs through

    # diagonal strokes between modules that only touch at a corner
    for y in range(ROWS):
        for x in range(cols):
            if not on(x, y):
                continue
            if on(x + 1, y + 1) and not on(x + 1, y) and not on(x, y + 1):
                a, b = box(x, y), box(x + 1, y + 1)
                contours.append([(a[2], a[3]), (b[2], b[3]), (b[0], b[1]), (a[0], a[1])])
                keep |= {(x, y, "tr"), (x, y, "bl"), (x + 1, y + 1, "tr"), (x + 1, y + 1, "bl")}
            if on(x - 1, y + 1) and not on(x - 1, y) and not on(x, y + 1):
                a, b = box(x, y), box(x - 1, y + 1)
                contours.append([(a[0], a[3]), (a[2], a[1]), (b[2], b[1]), (b[0], b[3])])
                keep |= {(x, y, "tl"), (x, y, "br"), (x - 1, y + 1, "tl"), (x - 1, y + 1, "br")}

    # modules, with exposed outer corners cut
    for y in range(ROWS):
        for x in range(cols):
            if not on(x, y):
                continue
            x0, y0, x1, y1 = box(x, y)
            cut = {
                "tl": not on(x, y - 1) and not on(x - 1, y) and not on(x - 1, y - 1),
                "tr": not on(x, y - 1) and not on(x + 1, y) and not on(x + 1, y - 1),
                "br": not on(x, y + 1) and not on(x + 1, y) and not on(x + 1, y + 1),
                "bl": not on(x, y + 1) and not on(x - 1, y) and not on(x - 1, y + 1),
            }
            for c in list(cut):
                if (x, y, c) in keep:
                    cut[c] = False
            pts = []
            pts += [(x0, y1 - K), (x0 + K, y1)] if cut["tl"] else [(x0, y1)]
            pts += [(x1 - K, y1), (x1, y1 - K)] if cut["tr"] else [(x1, y1)]
            pts += [(x1, y0 + K), (x1 - K, y0)] if cut["br"] else [(x1, y0)]
            pts += [(x0 + K, y0), (x0, y0 + K)] if cut["bl"] else [(x0, y0)]
            contours.append(pts)

    # inner corners get a fillet
    for y in range(ROWS):
        for x in range(cols):
            if on(x, y):
                continue
            ex0 = x * MX + B
            ex1 = (x + 1) * MX - B
            ey1 = (ROWS - y) * M - B
            ey0 = (ROWS - 1 - y) * M + B
            if on(x, y - 1) and on(x - 1, y) and on(x - 1, y - 1):
                contours.append([(ex0, ey1), (ex0 + F, ey1), (ex0, ey1 - F)])
            if on(x, y - 1) and on(x + 1, y) and on(x + 1, y - 1):
                contours.append([(ex1, ey1), (ex1, ey1 - F), (ex1 - F, ey1)])
            if on(x, y + 1) and on(x + 1, y) and on(x + 1, y + 1):
                contours.append([(ex1, ey0), (ex1 - F, ey0), (ex1, ey0 + F)])
            if on(x, y + 1) and on(x - 1, y) and on(x - 1, y + 1):
                contours.append([(ex0, ey0), (ex0, ey0 + F), (ex0 + F, ey0)])

    # sit on the baseline, after the left side bearing
    out = []
    for c in contours:
        pts = [(int(round(px + SB + B)), int(round(py + B))) for px, py in c]
        dedup = [p for i, p in enumerate(pts) if p != pts[i - 1]]
        if len(dedup) >= 3:
            out.append(dedup)
    advance = cols * MX + 2 * B + 2 * SB
    return out, advance


# ---------------------------------------------------------------- sfnt


def glyf_data(contours):
    if not contours:
        return b""
    xs = [p[0] for c in contours for p in c]
    ys = [p[1] for c in contours for p in c]
    data = struct.pack(">hhhhh", len(contours), min(xs), min(ys), max(xs), max(ys))
    end = -1
    for c in contours:
        end += len(c)
        data += struct.pack(">H", end)
    data += struct.pack(">H", 0)  # no instructions
    points = [p for c in contours for p in c]
    flags = bytearray([0x01] * len(points))
    flags[0] |= 0x40  # OVERLAP_SIMPLE: contours overlap on purpose
    data += bytes(flags)
    px = py = 0
    xd = b""
    yd = b""
    for x, y in points:
        xd += struct.pack(">h", x - px)
        yd += struct.pack(">h", y - py)
        px, py = x, y
    data += xd + yd
    if len(data) % 4:
        data += b"\0" * (4 - len(data) % 4)
    return data


def checksum(data):
    if len(data) % 4:
        data += b"\0" * (4 - len(data) % 4)
    return sum(struct.unpack(">%dI" % (len(data) // 4), data)) & 0xFFFFFFFF


def name_table(entries):
    records = b""
    strings = b""
    for nid, text in entries:
        raw = text.encode("utf-16-be")
        records += struct.pack(">HHHHHH", 3, 1, 0x409, nid, len(raw), len(strings))
        strings += raw
    header = struct.pack(">HHH", 0, len(entries), 6 + 12 * len(entries))
    return header + records + strings


def cmap_table(mapping):
    cps = sorted(mapping)
    segs = [(cp, cp, (mapping[cp] - cp) & 0xFFFF) for cp in cps] + [(0xFFFF, 0xFFFF, 1)]
    n = len(segs)
    search = 2 * (2 ** int(math.log2(n)))
    sub = struct.pack(">HHHHHHH", 4, 0, 0, 2 * n, search, int(math.log2(n)), 2 * n - search)
    sub += b"".join(struct.pack(">H", e) for _, e, _ in segs)
    sub += struct.pack(">H", 0)
    sub += b"".join(struct.pack(">H", s) for s, _, _ in segs)
    sub += b"".join(struct.pack(">H", d) for _, _, d in segs)
    sub += b"".join(struct.pack(">H", 0) for _ in segs)
    sub = sub[:2] + struct.pack(">H", len(sub)) + sub[4:]
    return struct.pack(">HHHHI", 0, 1, 3, 1, 12) + sub


def build():
    # glyph 0 .notdef, 1 space, then the drawn ones
    names = [".notdef", "space"] + list(GLYPHS)
    glyphs = []
    nd = [[(60, 0), (60, CAP), (440, CAP), (440, 0)], [(120, 60), (380, 60), (380, CAP - 60), (120, CAP - 60)]]
    glyphs.append((nd, 500))
    glyphs.append(([], 3 * MX + 2 * SB))
    for ch in GLYPHS:
        grid, cols = parse(GLYPHS[ch])
        glyphs.append(outline(grid, cols))

    gid = {ch: i + 2 for i, ch in enumerate(GLYPHS)}
    mapping = {0x20: 1, 0xA0: 1}
    for ch, g in gid.items():
        mapping[ord(ch)] = g
        if ch.isalpha():
            mapping[ord(ch.lower())] = g
    for src, dst in ALIASES.items():
        mapping[ord(src)] = gid[dst]

    glyf = b""
    loca = []
    for contours, _ in glyphs:
        loca.append(len(glyf))
        glyf += glyf_data(contours)
    loca.append(len(glyf))
    loca_data = b"".join(struct.pack(">I", o) for o in loca)

    allpts = [p for contours, _ in glyphs for c in contours for p in c]
    xmin = min(p[0] for p in allpts)
    ymin = min(p[1] for p in allpts)
    xmax = max(p[0] for p in allpts)
    ymax = max(p[1] for p in allpts)

    hmtx = b""
    lsbs = []
    rsbs = []
    extents = []
    for contours, adv in glyphs:
        if contours:
            gx = [p[0] for c in contours for p in c]
            lsb = min(gx)
            lsbs.append(lsb)
            rsbs.append(adv - max(gx))
            extents.append(max(gx))
        else:
            lsb = 0
        hmtx += struct.pack(">Hh", adv, lsb)
    advs = [adv for _, adv in glyphs]
    max_pts = max(sum(len(c) for c in contours) for contours, _ in glyphs)
    max_cont = max(len(contours) for contours, _ in glyphs)

    created = 3_800_000_000  # fixed, for reproducible builds
    head = struct.pack(
        ">IIIIHHQQhhhhHHhhh",
        0x00010000, 0x00010000, 0, 0x5F0F3CF5, 0x000B, UPM, created, created,
        xmin, ymin, xmax, ymax, 0, 8, 2, 1, 0,
    )
    asc, desc = 900, -240
    hhea = struct.pack(
        ">IhhhHhhhhhhhhhhhH",
        0x00010000, asc, desc, 0, max(advs), min(lsbs), min(rsbs), max(extents),
        1, 0, 0, 0, 0, 0, 0, 0, len(glyphs),
    )
    maxp = struct.pack(">IHHHHHHHHHHHHHH", 0x00010000, len(glyphs), max_pts, max_cont, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0)
    first = min(c for c in mapping if c >= 0x20)
    last = max(c for c in mapping if c < 0xFFFF)
    os2 = struct.pack(
        ">HhHHHhhhhhhhhhhh10sIIII4sHHHhhhHHIIhhHHH",
        4, int(sum(advs) / len(advs)), 800, 6, 0,
        650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0,
        bytes([2, 11, 8, 3, 0, 0, 0, 0, 0, 0]),
        1, 0, 0, 0, b"NXOR", 0x00C0, first, min(last, 0xFFFF),
        880, -240, 0, 1000, 260, 1, 0, CAP, CAP, 0, 0x20, 1,
    )
    name = name_table([
        (0, "Generated for plattnericus.dev"),
        (1, "Nexor Grid"),
        (2, "Regular"),
        (3, "NexorGrid-Regular-1.0"),
        (4, "Nexor Grid"),
        (5, "Version 1.000"),
        (6, "NexorGrid-Regular"),
    ])
    post = struct.pack(">IIhhIIIII", 0x00030000, 0, -120, 60, 0, 0, 0, 0, 0)

    tables = {
        b"OS/2": os2,
        b"cmap": cmap_table(mapping),
        b"glyf": glyf,
        b"head": head,
        b"hhea": hhea,
        b"hmtx": hmtx,
        b"loca": loca_data,
        b"maxp": maxp,
        b"name": name,
        b"post": post,
    }
    tags = sorted(tables)
    n = len(tags)
    es = int(math.log2(n))
    sr = (2 ** es) * 16
    offset = 12 + 16 * n

    def pad(d):
        return d + b"\0" * ((4 - len(d) % 4) % 4)

    # sfnt, to get the head checksum adjustment
    directory = struct.pack(">IHHHH", 0x00010000, n, sr, es, n * 16 - sr)
    body = b""
    sums = {}
    for t in tags:
        d = tables[t]
        sums[t] = checksum(d)
        directory += struct.pack(">4sIII", t, sums[t], offset + len(body), len(d))
        body += pad(d)
    adjust = (0xB1B0AFBA - checksum(directory + body)) & 0xFFFFFFFF
    tables[b"head"] = head[:8] + struct.pack(">I", adjust) + head[12:]
    sfnt_size = 12 + 16 * n + sum(len(pad(tables[t])) for t in tags)

    # WOFF 1.0
    woff_dir = b""
    woff_body = b""
    off = 44 + 20 * n
    for t in tags:
        d = tables[t]
        z = zlib.compress(d, 9)
        stored = z if len(z) < len(d) else d
        woff_dir += struct.pack(">4sIIII", t, off + len(woff_body), len(stored), len(d), sums[t])
        woff_body += pad(stored)
    total = 44 + len(woff_dir) + len(woff_body)
    header = struct.pack(">4sIIHHIHHIIIII", b"wOFF", 0x00010000, total, n, 0, sfnt_size, 1, 0, 0, 0, 0, 0, 0)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(header + woff_dir + woff_body)
    print(f"{OUT.relative_to(Path.cwd()) if OUT.is_relative_to(Path.cwd()) else OUT}: {len(glyphs)} glyphs, {total} bytes")


if __name__ == "__main__":
    sys.exit(build())
