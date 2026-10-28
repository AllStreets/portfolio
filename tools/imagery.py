# Local photo layers for close-ups. Chicago: USGS NAIP aerial photography (public domain).
# Elsewhere: Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, contains modified Copernicus Sentinel data 2016).
# Each image is a square in the place's local frame: x east, rows north to south, centred on the place.
import math, io, sys, urllib.request, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
OUT = 'public/places/'

def get(url):
    for _ in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'portfolio-build'}), timeout=120).read()
        except Exception as e:
            err = e
    raise err

def naip(lat0, lon0, half_m, px, name, tiles=2):
    kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
    out = Image.new('RGB', (px, px))
    step = px // tiles
    for j in range(tiles):
        for i in range(tiles):
            x0 = -half_m + 2 * half_m * i / tiles; x1 = -half_m + 2 * half_m * (i + 1) / tiles
            n1 = half_m - 2 * half_m * j / tiles; n0 = half_m - 2 * half_m * (j + 1) / tiles
            bbox = f'{lon0 + x0 / kx},{lat0 + n0 / ky},{lon0 + x1 / kx},{lat0 + n1 / ky}'
            # Ask for an image with the bbox's own aspect in degrees, or the server widens the bbox to fit.
            hpx = int(round(step * ((n1 - n0) / ky) / ((x1 - x0) / kx)))
            url = ('https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
                   f'?bbox={bbox}&bboxSR=4326&imageSR=4326&size={step},{hpx}&format=jpg&f=image')
            t = Image.open(io.BytesIO(get(url))).convert('RGB')
            assert t.size == (step, hpx), t.size
            out.paste(t.resize((step, step), Image.LANCZOS), (i * step, j * step))
            print(name, i, j, flush=True)
    return out

def eox(lat0, lon0, half_m, px, z, tile=None):
    # Fetch web-mercator tiles covering the square, then resample into the local frame.
    kx = 111320 * math.cos(math.radians(lat0)); ky = 110574
    lat_n = lat0 + half_m / ky; lat_s = lat0 - half_m / ky
    lon_w = lon0 - half_m / kx; lon_e = lon0 + half_m / kx
    n = 2 ** z
    def tx(lon): return (lon + 180) / 360 * n
    def ty(lat): return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    x0, x1 = int(tx(lon_w)), int(tx(lon_e)); y0, y1 = int(ty(lat_n)), int(ty(lat_s))
    mosaic = Image.new('RGBA', ((x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256))
    from concurrent.futures import ThreadPoolExecutor
    def one(xy):
        x, y = xy
        url = (tile or 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg').format(z=z, y=y, x=x)
        try:
            return xy, Image.open(io.BytesIO(get(url))).convert('RGBA')
        except Exception:
            return xy, None
    jobs = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    with ThreadPoolExecutor(8) as ex:
        for (x, y), t in ex.map(one, jobs):
            if t is not None:
                mosaic.paste(t, ((x - x0) * 256, (y - y0) * 256))
    print('mosaic', mosaic.size, flush=True)
    m = np.asarray(mosaic)
    u = (np.arange(px) + 0.5) / px
    xs = -half_m + 2 * half_m * u                  # east metres per column
    ns = half_m - 2 * half_m * u                   # north metres per row
    lons = lon0 + xs / kx
    lats = lat0 + ns / ky
    px_x = ((np.array([tx(l) for l in lons]) - x0) * 256).astype(np.float32)
    px_y = ((np.array([ty(l) for l in lats]) - y0) * 256).astype(np.float32)
    X = np.clip(px_x[None, :].repeat(px, 0), 0, m.shape[1] - 1).astype(int)
    Y = np.clip(px_y[:, None].repeat(px, 1), 0, m.shape[0] - 1).astype(int)
    return Image.fromarray(m[Y, X], 'RGBA')

def deshadow(img):
    # NAIP is flown mid-morning: towers throw long blue-violet shadows that read as water under 3D buildings.
    # Lift the shadows toward the surrounding ground and pull out the blue cast.
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    lum = a @ np.array([0.3, 0.55, 0.15], np.float32)
    violet = np.clip((a[..., 2] - a[..., 1]) * 8, 0, 1)
    m = np.clip((0.42 - lum) / 0.22, 0, 1) * (0.35 + 0.65 * violet)
    grey = lum[..., None].repeat(3, -1) * np.array([1.02, 1.0, 0.96], np.float32)
    a = a * (1 - m[..., None]) + np.clip(grey * 1.75, 0, 1) * m[..., None]
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))

def save(img, mask, name, q=82):
    img = img.convert('RGB')
    if mask is not None:
        img.putalpha(mask.resize(img.size, Image.BILINEAR))
    img.save(OUT + name + '.webp', quality=q, method=6, exact=True)
    print('saved', name, img.size, flush=True)

which = sys.argv[1:] if __name__ == '__main__' else []
if 'chicago' in which:
    LAT, LON = 41.88203, -87.62784
    land = Image.open('public/chicago/land.png').convert('L')  # covers +-10240 m
    outer = naip(LAT, LON, 10240, 4096, 'chi-outer', tiles=2)
    a = np.asarray(outer).astype(int)
    nodata = (a.sum(-1) < 12)
    lm = np.asarray(land.resize((4096, 4096), Image.BILINEAR)).astype(np.float32) / 255
    xs = np.linspace(-10240, 10240, 4096)[None, :].repeat(4096, 0)
    water = ((lm < 0.5) & (xs > -4500))
    save(deshadow(outer), Image.fromarray(((~water) * 255).astype(np.uint8)), 'chicago-outer')
    inner = naip(LAT, LON, 3072, 4096, 'chi-inner', tiles=2)
    # inner mask: crop the land raster to +-3072 m
    c0 = int((10240 - 3072) / 20480 * 2048); c1 = int((10240 + 3072) / 20480 * 2048)
    lmi = np.asarray(land.crop((c0, c0, c1, c1)).resize((4096, 4096), Image.BILINEAR)) > 127
    ai = np.asarray(inner).astype(int); nod = ai.sum(-1) < 12
    save(deshadow(inner), Image.fromarray((lmi * 255).astype(np.uint8)), 'chicago-inner')
if 'chicago-wide' in which:
    LAT, LON = 41.88203, -87.62784
    wide = naip(LAT, LON, 32768, 4096, 'chi-wide', tiles=2)
    a = np.asarray(wide).astype(np.float32) / 255
    # Lake: NAIP has no coverage far out, and the near-shore water is blue-green; both count as water.
    lum = a.mean(-1)
    water = (lum < 0.05) | ((a[..., 2] > a[..., 0] + 0.06) & (a[..., 1] > a[..., 0]))
    xs = np.linspace(-32768, 32768, 4096)[None, :].repeat(4096, 0)
    water &= xs > -6000
    save(deshadow(wide), Image.fromarray(((~water) * 255).astype(np.uint8)), 'chicago-wide')
def s2(img):
    # Sentinel-2 cloudless is flat and bright; add contrast, and find water by its dark blue.
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    a = np.clip((a - 0.04) * 1.18, 0, 1) ** 1.12
    lum = a @ np.array([0.3, 0.55, 0.15], np.float32)
    water = (lum < 0.2) & (a[..., 2] >= a[..., 0] + 0.02)
    from PIL import ImageFilter
    m = Image.fromarray(((~water) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
    return Image.fromarray((a * 255).astype(np.uint8)), m

GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
def lights(lat, lon, name):
    # NASA Black Marble 2016 at 500 m, for sharp city lights from orbit at night.
    im = eox(lat, lon, 450000, 2048, 8, GIBS).convert('RGB').convert('L')
    a = np.asarray(im).astype(np.float32) / 255
    a = np.clip((a - 0.12) / 0.88, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8)).save(OUT + name + '.webp', quality=85, method=6)
    print('saved', name, flush=True)
if 'lights' in which:
    lights(22.3, 114.17, 'hongkong-region-lights')
    lights(51.997, -0.741, 'bletchley-region-lights')
    lights(41.88203, -87.62784, 'chicago-region-lights')
# Hong Kong: Lands Department orthophotos (open data, attribution to the Lands Department, HKSAR).
HKLD = 'https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/imagery/WGS84/{z}/{x}/{y}.png'
if 'hk-close' in which:
    im = eox(22.29, 114.17, 16000, 4096, 15, HKLD)
    a = np.asarray(im).astype(np.float32)
    have = a[..., 3] > 0
    rgb = Image.fromarray(a[..., :3].astype(np.uint8))
    save(rgb, Image.fromarray((have * 255).astype(np.uint8)), 'hongkong-close')
if 'melbourne' in which:
    from PIL import ImageFilter, ImageEnhance
    img, m = s2(eox(-37.8455, 144.9705, 7000, 4096, 16))
    img = img.filter(ImageFilter.UnsharpMask(radius=3, percent=80, threshold=2))
    save(img, m, 'melbourne')
# Regional day imagery: NASA Blue Marble Next Generation at 500 m via GIBS (public domain), cloud-free.
BMNG = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/2004-08-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
if 'hongkong' in which:
    save(eox(22.3, 114.17, 450000, 2048, 8, BMNG), None, 'hongkong')
if 'bletchley-s2' in which:
    im = s2(eox(51.997, -0.741, 200000, 4096, 11))
    save(im[0], im[1], 'bletchley-mid')
if 'bletchley' in which:
    save(eox(51.997, -0.741, 450000, 2048, 8, BMNG), None, 'bletchley')
