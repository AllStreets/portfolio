# Builds the globe textures from NASA public-domain imagery in raw/.
import numpy as np, json, re, struct
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
R = 'raw/'; O = 'public/earth/'

def save(img, name, sizes, q=84):
    for w in sizes:
        im = img.resize((w, w // 2), Image.LANCZOS)
        im.save(f'{O}{name}-{w // 1024}k.webp', quality=q, method=6)

day = Image.open(R + 'bm21.jpg').convert('RGB')
save(day, 'day', [8192, 4096], 86)

night = Image.open(R + 'night.jpg').convert('L')
save(night, 'night', [8192, 4096], 82)

clouds = Image.open(R + 'clouds.tif').convert('L')
save(clouds, 'clouds', [8192, 4096], 80)

# Relief normals from GEBCO land elevation, water mask from bathymetry + Blue Marble colour (Great Lakes).
W, H = 8192, 4096
topo = np.asarray(Image.open(R + 'topo.png').resize((W, H), Image.LANCZOS), dtype=np.float32) / 255.0
bath = np.asarray(Image.open(R + 'bath.png').convert('L').resize((W, H), Image.NEAREST))
dcol = np.asarray(day.resize((W, H), Image.LANCZOS), dtype=np.int16)
lake = (dcol[..., 2] > dcol[..., 0] + 6) & (dcol[..., 0] < 70) & (topo < 0.25)
water = (bath < 255) | lake
h = topo * 6.0
dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1))
dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0))
lat = (0.5 - (np.arange(H) + 0.5) / H) * np.pi
dx = dx / np.maximum(np.cos(lat), 0.05)[:, None]
n = np.stack([-dx, dy, np.ones_like(h)], -1)
n /= np.linalg.norm(n, axis=-1, keepdims=True)
rgb = ((n * 0.5 + 0.5) * 255).astype(np.uint8)
wm = Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
img = Image.fromarray(rgb, 'RGB')
for w in [8192, 4096]:
    # Resize colour and alpha apart: an RGBA resize premultiplies, which would zero the normals on land (alpha 0).
    r = img.resize((w, w // 2), Image.LANCZOS)
    r.putalpha(wm.resize((w, w // 2), Image.LANCZOS))
    r.save(f'{O}relief-{w // 1024}k.webp', quality=88, method=6, exact=True)

# Yale Bright Star Catalog: unit vectors (equatorial J2000), magnitude, temperature.
stars = json.load(open(R + 'bsc.json'))
out = []
for s in stars:
    try:
        ra = re.findall(r'[\d.]+', s['RA']); de = re.findall(r'[\d.]+', s['Dec'])
        a = (float(ra[0]) + float(ra[1]) / 60 + float(ra[2]) / 3600) * 15 * np.pi / 180
        d = (float(de[0]) + float(de[1]) / 60 + float(de[2]) / 3600) * np.pi / 180
        if s['Dec'].strip().startswith('-'): d = -d
        out.append((np.cos(d) * np.cos(a), np.sin(d), -np.cos(d) * np.sin(a), float(s['V']), float(s.get('K', 6000))))
    except Exception:
        pass
with open(O + 'stars.bin', 'wb') as f:
    for r in out: f.write(struct.pack('<5f', *r))
print(len(out), 'stars')
