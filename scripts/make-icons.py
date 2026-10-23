"""Regenerates the PWA icons from the same glyph as public/favicon.svg. Run: python3 scripts/make-icons.py"""
import math
from PIL import Image, ImageDraw
PURPLE = (117, 104, 236, 255)
def arc(cx, cy, r, a0, a1, n=40):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
# favicon.svg path, in its 32x32 box: outer "R" and the hole in its bowl
OUTER = [(8, 9), (18, 9)] + arc(18, 14, 5, -90, 90) + [(15, 19), (24, 26), (15, 26), (8, 19)]
HOLE = [(14, 14), (14, 16), (18, 16)] + arc(18, 15, 1, 90, -90, 12)
def render(size, maskable):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    if maskable:  # full-bleed square; glyph kept inside the central safe zone
        d.rectangle([0, 0, S, S], fill=PURPLE); k = S / 32 * 0.92; ox, oy = S / 2 - 16 * k, S / 2 - 17.5 * k
    else:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 9 / 32, fill=PURPLE); k = S / 32; ox = oy = 0
    pt = lambda p: (ox + p[0] * k, oy + p[1] * k)
    d.polygon([pt(p) for p in OUTER], fill='white'); d.polygon([pt(p) for p in HOLE], fill=PURPLE)
    return img.resize((size, size), Image.LANCZOS)
for name, size, mask in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)]:
    render(size, mask).save('public/icons/' + name, optimize=True); print('wrote', name)
