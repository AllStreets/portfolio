# Lighter copies for phones and weak laptops: every place layer and street-light map at 2048, the Earth at 2K.
# Colour and alpha are resized apart (an RGBA resize premultiplies) and saved with exact=True.
import glob, os
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
def shrink(src, dst, w):
    im = Image.open(src)
    h = round(im.height * w / im.width)
    if im.mode == 'RGBA':
        out = im.convert('RGB').resize((w, h), Image.LANCZOS)
        out.putalpha(im.split()[-1].resize((w, h), Image.LANCZOS))
        out.save(dst, quality=84, method=6, exact=True)
    else:
        im.resize((w, h), Image.LANCZOS).save(dst, quality=84, method=6)
    print(os.path.basename(dst), round(os.path.getsize(dst) / 1024), 'KB')
for f in glob.glob('public/places/*.webp'):
    shrink(f, f.replace('/places/', '/places/lite/'), 2048)
for n in ['day', 'night', 'relief', 'clouds']:
    shrink(f'public/earth/{n}-4k.webp', f'public/earth/{n}-2k.webp', 2048)
# Desktop: street lights at 4096 for Melbourne and Hong Kong (8192 stays for Chicago, where the camera is lowest).
for n in ['melbourne', 'hongkong']:
    src = f'public/places/{n}-lights.webp'
    im = Image.open(src)
    if im.width > 4096:
        im.resize((4096, 4096), Image.LANCZOS).save(src, quality=84, method=6)
        print(n, 'lights now 4096')
