# Street lights at night from OpenStreetMap roads, around Chicago's Loop, Albert Park and Victoria Harbour.
# Red is the lit carriageway at its real width (8192 px across the area); green is the soft spill of light around it.
import sys, json, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter
PLACE = sys.argv[1] if len(sys.argv) > 1 else 'chicago'
LAT0, LON0, HALF, SRC = {'chicago': (41.88203, -87.62784, 10240, 'raw/roads.json'),
                         'melbourne': (-37.8455, 144.9705, 7000, 'raw/roads-mel.json'),
                         'hongkong': (22.29, 114.17, 16000, 'raw/roads-hk.json')}[PLACE]
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
S = 8192
MPP = 2 * HALF / S
# road class: (width in metres, brightness)
W = {'motorway': (20, 0.7), 'trunk': (18, 0.75), 'primary': (16, 0.95), 'secondary': (14, 0.85), 'tertiary': (12, 0.75),
     'residential': (9, 0.5), 'unclassified': (9, 0.5), 'living_street': (7, 0.4), 'service': (5, 0.22)}
SKIP_SERVICE = {'parking_aisle', 'driveway', 'drive-through', 'emergency_access'}
img = Image.new('L', (S, S), 0)
dr = ImageDraw.Draw(img)
d = json.load(open(SRC))
ways = []
for e in d['elements']:
    t = e.get('tags', {})
    hw = t.get('highway', '').replace('_link', '')
    if hw not in W or 'geometry' not in e: continue
    if hw == 'service' and t.get('service') in SKIP_SERVICE: continue
    if t.get('tunnel') in ('yes', 'building_passage') or t.get('covered') == 'yes': continue
    ways.append((W[hw], e['geometry']))
ways.sort(key=lambda w: w[0][1])  # brighter roads draw last
for (w, a), geom in ways:
    pts = [(((g['lon'] - LON0) * KX + HALF) / MPP, (HALF - (g['lat'] - LAT0) * KY) / MPP) for g in geom]
    dr.line(pts, fill=int(255 * a), width=max(1, round(w / MPP)), joint='curve')
line = np.asarray(img, np.float32)
spill = np.asarray(img.filter(ImageFilter.GaussianBlur(14 / MPP)), np.float32) * 2.2
out = np.zeros((S, S, 3), np.uint8)
out[..., 0] = np.clip(line, 0, 255)
out[..., 1] = np.clip(spill, 0, 255)
Image.fromarray(out, 'RGB').save(f'public/places/{PLACE}-lights.webp', quality=82, method=6)
print(PLACE, len(ways), 'ways', round(MPP, 2), 'm/px')
