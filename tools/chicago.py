# Packs Chicago building footprints (City of Chicago data portal, OpenStreetMap, Wikipedia heights)
# from the Chicago Open World pipeline cache into one small binary for the globe's city view.
import json, glob, math, struct, re
P = '/Users/connorevans/Downloads/Chicago_open_world/pipeline/'
LAT0, LON0 = 41.88203, -87.62784
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
RADIUS = 7000
FLOOR = 3.8

def tag_h(v):
    if not v: return None
    m = re.match(r"^~?(\d+(?:\.\d+)?)\s*('|ft|feet)?\s*(m)?$", str(v).strip(), re.I)
    if not m: return None
    n = float(m.group(1)) * (0.3048 if m.group(2) else 1)
    return n if n > 0 else None

osm = {}
for e in json.load(open(P + 'cache/osm-buildings.json'))['data']['elements']:
    t = e.get('tags', {}); bid = t.get('chicago:building_id')
    h = tag_h(t.get('height'))
    if h is None and t.get('building:levels', '').isdigit(): h = int(t['building:levels']) * FLOOR
    if bid and h: osm[bid] = h

sky = json.load(open(P + 'data/skyline.json'))['buildings']
def local(lon, lat): return ((lon - LON0) * KX, (lat - LAT0) * KY)
def inside(pt, poly):
    x, y = pt; c = False
    for i in range(len(poly)):
        x1, y1 = poly[i]; x2, y2 = poly[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c

blds = []
for f in glob.glob(P + 'cache/world/footprints-*.json'):
    d = json.load(open(f)); d = d.get('data', d)
    for r in d:
        g = r.get('the_geom')
        if not g: continue
        polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ring = [local(*p[:2]) for p in poly[0]]
            if len(ring) < 4: continue
            cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
            if cx * cx + cy * cy > RADIUS * RADIUS: continue
            area = 0.5 * abs(sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring))))
            if area < 40: continue
            st = int(r['stories']) if str(r.get('stories', '0')).isdigit() else 0
            h = osm.get(str(r.get('bldg_id'))) or (st * FLOOR if st > 0 else 9)
            # simplify: drop near-duplicate points
            s = [ring[0]]
            for p in ring[1:-1]:
                if (p[0] - s[-1][0]) ** 2 + (p[1] - s[-1][1]) ** 2 > 1.0: s.append(p)
            if len(s) < 3: continue
            blds.append([s, h, (cx, cy)])

for b in sky:
    pt = local(b['lon'], b['lat']); best = None
    for bl in blds:
        if (bl[2][0] - pt[0]) ** 2 + (bl[2][1] - pt[1]) ** 2 < 150 ** 2 and inside(pt, bl[0]):
            if best is None or len(bl[0]) > 0 and bl[1] > best[1]: best = bl
    if best: best[1] = max(best[1], b['heightM'])

out = bytearray(struct.pack('<I', len(blds)))
for s, h, _ in blds:
    out += struct.pack('<HH', len(s), min(int(h * 10), 65535))
    for x, y in s: out += struct.pack('<hh', int(round(x * 2)), int(round(y * 2)))
open('/Users/connorevans/Downloads/globe-portfolio/public/chicago/buildings.bin', 'wb').write(out)
print(len(blds), 'buildings', len(out) // 1024, 'KB', 'tallest', max(b[1] for b in blds))
