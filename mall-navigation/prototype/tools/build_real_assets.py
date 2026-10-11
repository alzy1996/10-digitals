"""Build the v0.4 real-mall assets once (DESIGN-REAL.md 3). The outputs in public/assets/real/ are committed, so app
builds need no Python.

CC0 sources (Poly Haven, no attribution required, credited in ASSETS-LICENSES.md): marble_tiles,
painted_plaster_wall, brown_planks_03 (1k JPG maps) and leadenhall_market (1k HDRI).

  python tools/build_real_assets.py     # downloads to .cache/real-src (curl), writes public/assets/real/
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, '.cache', 'real-src')
OUT = os.path.join(ROOT, 'public', 'assets', 'real')
# output name -> (Poly Haven asset, map, WebP quality)
MAPS = {
    'marble.webp': ('marble_tiles', 'Diffuse', 80),
    'marble-n.webp': ('marble_tiles', 'nor_gl', 85),
    'marble-r.webp': ('marble_tiles', 'Rough', 85),
    'plaster.webp': ('painted_plaster_wall', 'Diffuse', 80),
    'plaster-n.webp': ('painted_plaster_wall', 'nor_gl', 85),
    'wood.webp': ('brown_planks_03', 'Diffuse', 80),
}


def curl_json(url):
    out = subprocess.run(['curl', '-s', '-m', '60', url], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def fetch(asset, kind, ext='jpg', res='1k'):
    """Path of a Poly Haven file in the cache, downloaded with curl (urllib gets 403 without a browser agent)."""
    files = curl_json('https://api.polyhaven.com/files/' + asset)
    url = files['hdri'][res][ext]['url'] if kind == 'hdri' else files[kind][res][ext]['url']
    dst = os.path.join(SRC, os.path.basename(url))
    if not os.path.exists(dst):
        subprocess.run(['curl', '-s', '-m', '180', '-o', dst, url], check=True)
    return dst


def read_rgbe(path):
    """Radiance .hdr (new-style RLE or flat scanlines) -> (width, height, rows of RGBE byte tuples)."""
    with open(path, 'rb') as f:
        data = f.read()
    i = data.index(b'\n\n') + 2
    j = data.index(b'\n', i)
    dims = data[i:j].decode().split()  # -Y H +X W
    h, w = int(dims[1]), int(dims[3])
    pos, rows = j + 1, []
    for _ in range(h):
        if data[pos] == 2 and data[pos + 1] == 2:
            pos += 4
            chans = []
            for _c in range(4):
                out = bytearray()
                while len(out) < w:
                    n = data[pos]
                    pos += 1
                    if n > 128:
                        out += bytes([data[pos]]) * (n - 128)
                        pos += 1
                    else:
                        out += data[pos:pos + n]
                        pos += n
                chans.append(out)
            rows.append(list(zip(chans[0], chans[1], chans[2], chans[3])))
        else:
            rows.append([tuple(data[pos + 4 * x: pos + 4 * x + 4]) for x in range(w)])
            pos += 4 * w
    return w, h, rows


def rgbe_to_f(p):
    if p[3] == 0:
        return (0.0, 0.0, 0.0)
    f = math.ldexp(1.0, p[3] - 136)
    return (p[0] * f, p[1] * f, p[2] * f)


def f_to_rgbe(c):
    v = max(c)
    if v < 1e-32:
        return bytes((0, 0, 0, 0))
    m, e = math.frexp(v)
    s = m * 256.0 / v
    return bytes((min(255, int(c[0] * s)), min(255, int(c[1] * s)), min(255, int(c[2] * s)), e + 128))


def downsample_hdr(src, dst, W=512, H=256):
    """Box-filter an equirectangular HDRI down to W x H and write it as flat (non-RLE) RGBE."""
    w, h, rows = read_rgbe(src)
    fx, fy = w // W, h // H
    out = bytearray()
    for y in range(H):
        for x in range(W):
            acc = [0.0, 0.0, 0.0]
            for dy in range(fy):
                row = rows[y * fy + dy]
                for dx in range(fx):
                    c = rgbe_to_f(row[x * fx + dx])
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
            n = fx * fy
            out += f_to_rgbe([a / n for a in acc])
    with open(dst, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n' % (H, W))
        f.write(bytes(out))


def main():
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    for name, (asset, kind, q) in MAPS.items():
        Image.open(fetch(asset, kind)).convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)
    downsample_hdr(fetch('leadenhall_market', 'hdri', 'hdr'), os.path.join(OUT, 'arcade.hdr'))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('real assets:', round(total / 1024), 'KiB in', OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main())
