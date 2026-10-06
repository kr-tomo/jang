#!/usr/bin/env python3
"""기본 테마 에셋 생성: assets/pieces.svg, assets/markers.svg, assets/board.svg, icons/*.png
- 한자 글리프는 Noto Serif CJK에서 윤곽선(path)으로 뽑아 SVG에 넣으므로 폰트가 없는 기기에서도 동일하게 보입니다.
- 이 스크립트를 쓰지 않고 직접 그린 이미지로 assets/ 파일만 바꿔도 됩니다 (theme.js 의 atlas 좌표만 맞추면 됨).
"""
import os, math
from fontTools.ttLib import TTCollection
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FONT = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Black.ttc'

def load_font():
    coll = TTCollection(FONT)
    for f in coll.fonts:
        name = f['name'].getDebugName(1) or ''
        if 'KR' in name:
            return f
    return coll.fonts[0]

font = load_font()
cmap = font.getBestCmap()
gs = font.getGlyphSet()
upm = font['head'].unitsPerEm

def glyph_path(ch, size, cx, cy):
    gname = cmap[ord(ch)]
    bp = BoundsPen(gs)
    gs[gname].draw(bp)
    x0, y0, x1, y1 = bp.bounds
    s = size / upm
    gcx, gcy = (x0 + x1) / 2, (y0 + y1) / 2
    pen = SVGPathPen(gs, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.'))
    tp = TransformPen(pen, (s, 0, 0, -s, cx - gcx * s, cy + gcy * s))
    gs[gname].draw(tp)
    return pen.getCommands()

# ---------- 기물 스프라이트 시트 ----------
FRAME = 192
TYPES = ['K', 'R', 'C', 'N', 'E', 'G', 'P']
RADIUS = {'K': 90, 'R': 83, 'C': 83, 'N': 76, 'E': 76, 'G': 70, 'P': 62}
GLYPH = {  # (초, 한)
    'K': ('楚', '漢'), 'R': ('車', '車'), 'C': ('包', '包'), 'N': ('馬', '馬'),
    'E': ('象', '象'), 'G': ('士', '士'), 'P': ('卒', '兵'),
}
GSIZE = {'K': 104, 'R': 92, 'C': 92, 'N': 86, 'E': 86, 'G': 78, 'P': 70}
INK = {0: '#1c6b45', 1: '#b3261e'}  # 초 / 한

def octagon(cx, cy, r, rot=22.5):
    pts = []
    for i in range(8):
        a = math.radians(rot + 45 * i)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return ' '.join('%.1f,%.1f' % p for p in pts)

def piece_frame(ox, oy, typ, side):
    cx, cy = ox + FRAME / 2, oy + FRAME / 2 - 2
    r = RADIUS[typ]
    ink = INK[side]
    ch = GLYPH[typ][side]
    d = glyph_path(ch, GSIZE[typ], cx, cy + 2)
    g = []
    g.append('<polygon points="%s" fill="#000" opacity=".28" transform="translate(3,6)"/>' % octagon(cx, cy, r))
    g.append('<polygon points="%s" fill="url(#body)" stroke="#6d5026" stroke-width="3" stroke-linejoin="round"/>' % octagon(cx, cy, r))
    g.append('<polygon points="%s" fill="none" stroke="%s" stroke-width="3.2" stroke-linejoin="round" opacity=".85"/>' % (octagon(cx, cy, r - 10), ink))
    g.append('<path d="%s" fill="%s"/>' % (d, ink))
    return '\n'.join(g)

def make_pieces():
    W, H = FRAME * len(TYPES), FRAME * 2
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H)]
    out.append('<defs><radialGradient id="body" cx="40%" cy="32%" r="80%"><stop offset="0" stop-color="#fbf1d6"/><stop offset=".65" stop-color="#ecd7a4"/><stop offset="1" stop-color="#d5b678"/></radialGradient></defs>')
    for side in (0, 1):
        for i, typ in enumerate(TYPES):
            out.append(piece_frame(i * FRAME, side * FRAME, typ, side))
    out.append('</svg>')
    open(os.path.join(ROOT, 'assets', 'pieces.svg'), 'w', encoding='utf-8').write('\n'.join(out))

# ---------- 마커 스프라이트 시트 ----------
MF = 128
MARKERS = ['select', 'from', 'to', 'dot', 'capture', 'check', 'hint']

def make_markers():
    W, H = MF * len(MARKERS), MF
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H)]
    def cxy(i): return i * MF + MF / 2, MF / 2
    # select: 네 모서리 괄호
    cx, cy = cxy(0); a = 54; l = 22
    path = ''
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = cx + sx * a, cy + sy * a
            path += 'M%.0f %.0f L%.0f %.0f L%.0f %.0f ' % (x - sx * l, y, x, y, x, y - sy * l)
    o.append('<path d="%s" fill="none" stroke="#f5c542" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>' % path)
    # from / to: 마지막 수 표시 (옅은 사각)
    for i, (op, st) in ((1, (.28, 0)), (2, (.42, 0))):
        cx, cy = cxy(i)
        o.append('<rect x="%.0f" y="%.0f" width="100" height="100" rx="18" fill="#f5c542" opacity="%.2f"/>' % (cx - 50, cy - 50, op))
    # dot
    cx, cy = cxy(3)
    o.append('<circle cx="%.0f" cy="%.0f" r="17" fill="#2c7a4b" stroke="#fff" stroke-opacity=".85" stroke-width="4"/>' % (cx, cy))
    # capture
    cx, cy = cxy(4)
    o.append('<circle cx="%.0f" cy="%.0f" r="48" fill="none" stroke="#d6342a" stroke-width="9"/>' % (cx, cy))
    o.append('<circle cx="%.0f" cy="%.0f" r="48" fill="#d6342a" opacity=".16"/>' % (cx, cy))
    # check
    cx, cy = cxy(5)
    o.append('<circle cx="%.0f" cy="%.0f" r="58" fill="none" stroke="#ff3b30" stroke-width="8" stroke-dasharray="14 9"/>' % (cx, cy))
    o.append('<circle cx="%.0f" cy="%.0f" r="58" fill="#ff3b30" opacity=".18"/>' % (cx, cy))
    # hint (훈수): 하늘색 사각 테두리 + 옅은 채움
    cx, cy = cxy(6)
    o.append('<rect x="%.0f" y="%.0f" width="104" height="104" rx="20" fill="#35c4e8" opacity=".22"/>' % (cx - 52, cy - 52))
    o.append('<rect x="%.0f" y="%.0f" width="104" height="104" rx="20" fill="none" stroke="#35c4e8" stroke-width="8"/>' % (cx - 52, cy - 52))
    o.append('</svg>')
    open(os.path.join(ROOT, 'assets', 'markers.svg'), 'w', encoding='utf-8').write('\n'.join(o))

# ---------- 장기판 ----------
CELL, MARGIN = 100, 60
BW, BH = 8 * CELL + 2 * MARGIN, 9 * CELL + 2 * MARGIN

def make_board():
    ox = oy = MARGIN
    def X(c): return ox + c * CELL
    def Y(r): return oy + r * CELL
    o = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (BW, BH, BW, BH)]
    o.append('<defs><linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8bd72"/><stop offset=".5" stop-color="#dcab5e"/><stop offset="1" stop-color="#cf9a4d"/></linearGradient>'
             '<pattern id="grain" width="240" height="14" patternUnits="userSpaceOnUse"><path d="M0 7 Q60 2 120 7 T240 7" fill="none" stroke="#a9772f" stroke-opacity=".10" stroke-width="2"/></pattern></defs>')
    o.append('<rect width="%d" height="%d" rx="26" fill="url(#wood)"/>' % (BW, BH))
    o.append('<rect width="%d" height="%d" rx="26" fill="url(#grain)"/>' % (BW, BH))
    o.append('<rect x="5" y="5" width="%d" height="%d" rx="22" fill="none" stroke="#8b5e22" stroke-opacity=".55" stroke-width="5"/>' % (BW - 10, BH - 10))
    # 바깥 테두리선
    o.append('<rect x="%d" y="%d" width="%d" height="%d" fill="none" stroke="#4a3418" stroke-width="7"/>' % (X(0) - 0, Y(0) - 0, 8 * CELL, 9 * CELL))
    ln = '#4a3418'
    for c in range(1, 8):
        o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="4"/>' % (X(c), Y(0), X(c), Y(9), ln))
    for r in range(1, 9):
        o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="4"/>' % (X(0), Y(r), X(8), Y(r), ln))
    # 궁성 대각선
    for top in (0, 7):
        o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="4"/>' % (X(3), Y(top), X(5), Y(top + 2), ln))
        o.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="4"/>' % (X(5), Y(top), X(3), Y(top + 2), ln))
    # 포·졸 자리 표시 (작은 ㄱ자)
    def tick(r, c):
        x, y = X(c), Y(r); g = 9; l = 13
        s = ''
        for sx in (-1, 1):
            for sy in (-1, 1):
                if (c == 0 and sx == -1) or (c == 8 and sx == 1):
                    continue
                s += 'M%d %d L%d %d L%d %d ' % (x + sx * g, y + sy * (g + l), x + sx * g, y + sy * g, x + sx * (g + l), y + sy * g)
        o.append('<path d="%s" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' % (s, ln))
    for r in (3, 6):
        for c in (0, 2, 4, 6, 8):
            tick(r, c)
    for r in (2, 7):
        for c in (1, 7):
            tick(r, c)
    o.append('</svg>')
    open(os.path.join(ROOT, 'assets', 'board.svg'), 'w', encoding='utf-8').write('\n'.join(o))

# ---------- 아이콘 (PNG) ----------
def make_icons():
    from PIL import Image, ImageDraw, ImageFont
    fpath = FONT
    def render(size, maskable):
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        bg = (28, 22, 16, 255)
        if maskable:
            d.rectangle([0, 0, size, size], fill=bg)
        else:
            d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=bg)
        # 나무판 느낌 안쪽
        pad = int(size * (0.14 if maskable else 0.09))
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(size * 0.12), fill=(220, 171, 94, 255))
        # 팔각 기물
        cx = cy = size / 2
        r = size * (0.27 if maskable else 0.31)
        pts = [(cx + r * math.cos(math.radians(22.5 + 45 * i)), cy + r * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
        sh = [(x + size * 0.012, y + size * 0.02) for x, y in pts]
        d.polygon(sh, fill=(0, 0, 0, 90))
        d.polygon(pts, fill=(246, 232, 196, 255), outline=(109, 80, 38, 255))
        r2 = r * 0.86
        pts2 = [(cx + r2 * math.cos(math.radians(22.5 + 45 * i)), cy + r2 * math.sin(math.radians(22.5 + 45 * i))) for i in range(8)]
        d.line(pts2 + [pts2[0]], fill=(28, 107, 69, 255), width=max(2, int(size * 0.012)))
        try:
            fnt = ImageFont.truetype(fpath, int(r * 1.25), index=2)
        except Exception:
            fnt = ImageFont.truetype(fpath, int(r * 1.25))
        d.text((cx, cy + r * 0.04), '將', font=fnt, fill=(28, 107, 69, 255), anchor='mm')
        return im
    os.makedirs(os.path.join(ROOT, 'icons'), exist_ok=True)
    render(192, False).save(os.path.join(ROOT, 'icons', 'icon-192.png'))
    render(512, False).save(os.path.join(ROOT, 'icons', 'icon-512.png'))
    render(512, True).save(os.path.join(ROOT, 'icons', 'maskable-512.png'))
    render(180, False).convert('RGB').save(os.path.join(ROOT, 'icons', 'apple-touch-icon.png'))

if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
    make_pieces(); make_markers(); make_board(); make_icons()
    print('assets ok')
