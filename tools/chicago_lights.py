# Streetlight map for Chicago at night: every OpenStreetMap road within 10 km of the Loop, drawn at 5 m per pixel.
import json, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter
LAT0, LON0 = 41.88203, -87.62784
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
S, HALF = 4096, 10240
W = {'motorway': (3, 1.0), 'trunk': (3, 1.0), 'primary': (2, 1.0), 'secondary': (2, 0.9), 'tertiary': (2, 0.75),
     'residential': (1, 0.55), 'unclassified': (1, 0.5), 'living_street': (1, 0.45), 'service': (1, 0.28)}
img = Image.new('L', (S, S), 0)
dr = ImageDraw.Draw(img)
d = json.load(open('raw/roads.json'))
for e in d['elements']:
    hw = e.get('tags', {}).get('highway', '').replace('_link', '')
    if hw not in W or 'geometry' not in e: continue
    w, a = W[hw]
    pts = [(((g['lon'] - LON0) * KX + HALF) / (2 * HALF) * S, (HALF - (g['lat'] - LAT0) * KY) / (2 * HALF) * S) for g in e['geometry']]
    dr.line(pts, fill=int(255 * a), width=w)
glow = img.filter(ImageFilter.GaussianBlur(5))
out = np.asarray(img, np.float32) * 0.9 + np.asarray(glow, np.float32) * 0.9
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save('public/places/chicago-lights.webp', quality=80, method=6)
print(len(d['elements']), 'ways')
