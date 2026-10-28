# Adds a land/water alpha to photo layers that came without one, judged by colour.
import sys, numpy as np
from PIL import Image, ImageFilter
def mask(name, kind):
    p = f'public/places/{name}.webp'
    im = Image.open(p).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = a @ np.array([0.3, 0.55, 0.15], np.float32)
    if kind == 'hkmap':   # the Lands Department basemap draws water in one flat blue (204, 236, 255)
        import imagery
        mp = np.asarray(imagery.eox(22.29, 114.17, 16000, 4096, 15, 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png').convert('RGB')).astype(int)
        water = (abs(mp[..., 0] - 204) < 8) & (abs(mp[..., 1] - 236) < 8) & (mp[..., 2] > 245)
        w = Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
        water = np.asarray(w) > 127
    elif kind == 'ortho':   # harbour water in aerial photos: blue-teal and smooth, where hillsides are textured
        L = Image.fromarray((lum * 255).astype(np.uint8))
        L2 = Image.fromarray((lum * lum * 255).astype(np.uint8))
        m1 = np.asarray(L.filter(ImageFilter.BoxBlur(4))).astype(np.float32) / 255
        m2 = np.asarray(L2.filter(ImageFilter.BoxBlur(4))).astype(np.float32) / 255
        std = np.sqrt(np.maximum(m2 - m1 * m1, 0))
        water = (b > r + 0.05) & (b > g - 0.03) & (std < 0.03) & (lum < 0.5)
        w = Image.fromarray((water * 255).astype(np.uint8))
        w = w.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))   # open
        w = w.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))   # close
        water = np.asarray(w) > 127
    else:                 # deep blue in Blue Marble
        water = (b > r + 0.02) & (lum < 0.16)
    m = Image.fromarray(((~water) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.GaussianBlur(1))
    im.putalpha(m)
    im.save(p, quality=84, method=6, exact=True)
    print(name, 'water share', round(float(water.mean()), 3))
for n, k in [('hongkong-close', 'hkmap')] + ([('hongkong', 'bm'), ('bletchley', 'bm')] if 'all' in sys.argv else []):
    mask(n, k)
