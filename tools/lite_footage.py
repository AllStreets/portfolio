# 480-wide copies of the footage for phones, same frames and timing.
import glob, os
from PIL import Image, ImageSequence
for f in glob.glob('public/footage/*.webp'):
    im = Image.open(f)
    frames, durs = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert('RGB').resize((480, 300), Image.LANCZOS))
        durs.append(fr.info.get('duration', 50))
    out = f.replace('/footage/', '/footage/lite/')
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=durs, loop=0, quality=72, method=4)
    print(os.path.basename(out), len(frames), 'frames', round(os.path.getsize(out) / 1e6, 2), 'MB')
