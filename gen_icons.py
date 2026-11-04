# -*- coding: utf-8 -*-
"""生成应用图标（纯 Python，无第三方库）"""
import math, struct, zlib


def rounded_alpha(x, y, rx, ry, rw, rh, rad):
    # 有符号距离，返回 0..1 覆盖率
    cx, cy = rx + rw / 2, ry + rh / 2
    hx, hy = rw / 2 - rad, rh / 2 - rad
    dx = abs(x - cx) - hx
    dy = abs(y - cy) - hy
    ax, ay = max(dx, 0), max(dy, 0)
    d = math.hypot(ax, ay) + min(max(dx, dy), 0) - rad
    return max(0.0, min(1.0, 0.5 - d))


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


C1 = (129, 140, 248)
C2 = (67, 56, 202)

BARS = [(112, 132, 288, 44, 22, .95),
        (112, 212, 220, 40, 20, .75),
        (112, 284, 288, 40, 20, .55),
        (112, 348, 180, 40, 20, .85)]


def render(size, out):
    s = size / 512.0
    rows = []
    for py in range(size):
        row = bytearray()
        row.append(0)
        for px in range(size):
            x, y = (px + .5) / s, (py + .5) / s
            a = rounded_alpha(x, y, 0, 0, 512, 512, 112)
            if a <= 0:
                row += b'\x00\x00\x00\x00'
                continue
            t = (x + y) / 1024.0
            bg = lerp(C1, C2, max(0.0, min(1.0, t)))
            r, g, b = bg
            for (bx, by, bw, bh, br, op) in BARS:
                ba = rounded_alpha(x, y, bx, by, bw, bh, br) * op
                if ba > 0:
                    r = r + (255 - r) * ba
                    g = g + (255 - g) * ba
                    b = b + (255 - b) * ba
            row += bytes((int(r), int(g), int(b), int(a * 255)))
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    open(out, 'wb').write(png)
    print(out, size, len(png) // 1024, 'KB')


render(192, 'assets/icon-192.png')
render(512, 'assets/icon-512.png')
