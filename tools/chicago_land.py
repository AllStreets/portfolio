# Rasterizes Chicago Open World's land polygons (OpenStreetMap, City of Chicago) into a 10 m/px land mask.
import json, numpy as np
from PIL import Image, ImageDraw
d = json.load(open('/Users/connorevans/Downloads/Chicago_open_world/app/public/world/land.json'))
S, HALF = 2048, 10240
acc = np.zeros((S, S), bool)
for ring in d['rings']:
    im = Image.new('1', (S, S), 0)
    pts = [((x + HALF) / (2 * HALF) * S, (z + HALF) / (2 * HALF) * S) for x, z in ring]
    if len(pts) > 2:
        ImageDraw.Draw(im).polygon(pts, fill=1)
        acc ^= np.array(im)
img = Image.fromarray((acc * 255).astype(np.uint8))
img.save('public/chicago/land.png', optimize=True)
print(len(d['rings']), 'rings', acc.mean())
