#!/usr/bin/env python3
"""Generate seamless PBR-ish albedo textures with Gemini image models into assets/textures/.

Usage: python tools/gen_textures.py [name ...]   (no names = all)
Reads the key from secrets/gemini.txt. Existing files are skipped unless --force.
Each texture is requested as a top-down, evenly lit, seamless tile; the result is then made
strictly tileable by a soft cross-fade of the borders (wrap blend) before saving as JPEG.
"""
import base64, json, os, sys, urllib.request, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures')
MODEL = 'gemini-3.1-flash-image'
KEY = open(os.path.join(ROOT, 'secrets', 'gemini.txt')).read().strip()

TEXTURES = {
    'asphalt': 'seamless tileable texture of worn dark grey asphalt road surface, fine aggregate, subtle cracks and tyre polish, top-down, flat even lighting, no shadows, no markings, photorealistic',
    'concrete': 'seamless tileable texture of light grey concrete sidewalk pavement, subtle grain and stains, top-down, flat even lighting, no shadows, no visible slab edges, photorealistic',
    'sand': 'seamless tileable texture of dry beach sand with faint ripples and footprint traces, top-down, flat even lighting, no shadows, photorealistic',
    'grass': 'seamless tileable texture of dry coastal California scrub grass and dirt, golden brown and olive, top-down, flat even lighting, no shadows, photorealistic',
    'rock': 'seamless tileable texture of sandstone coastal cliff rock face with sediment layers, tan and ochre, flat even lighting, no shadows, photorealistic',
    'decking': 'seamless tileable texture of weathered wooden pier deck planks running vertically, grey-brown wood, top-down, flat even lighting, no shadows, photorealistic',
    'facade_stucco': 'seamless tileable texture of a cream stucco Californian building facade with rows of rectangular windows with white trim, 3 floors visible, straight-on view, flat even lighting, no shadows, photorealistic',
    'facade_deco': 'seamless tileable texture of a pastel pink art deco building facade with vertical window bands and decorative moldings, 3 floors visible, straight-on view, flat even lighting, no shadows, photorealistic',
    'facade_brick': 'seamless tileable texture of a pale painted brick building facade with arched windows, 3 floors visible, straight-on view, flat even lighting, no shadows, photorealistic',
    'roof': 'seamless tileable texture of a flat commercial roof with grey gravel and tar, top-down, flat even lighting, no shadows, photorealistic',
    'palmbark': 'seamless tileable texture of palm tree trunk bark with horizontal fibrous ridges, brown, straight-on view, flat even lighting, photorealistic',
}


def generate(prompt):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={KEY}'
    body = {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': '1:1'}}}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    for part in data['candidates'][0]['content']['parts']:
        if 'inlineData' in part:
            return base64.b64decode(part['inlineData']['data'])
    raise RuntimeError('no image in response: ' + json.dumps(data)[:400])


def make_tileable(img, blend=0.12):
    """Wrap-blend the borders so the tile repeats without seams."""
    img = img.convert('RGB')
    w, h = img.size
    bw, bh = int(w * blend), int(h * blend)
    # shift by half so the seam sits in the middle, then cross-fade the original over it
    shifted = Image.new('RGB', (w, h))
    shifted.paste(img.crop((w // 2, 0, w, h)), (0, 0)); shifted.paste(img.crop((0, 0, w // 2, h)), (w // 2, 0))
    tmp = Image.new('RGB', (w, h))
    tmp.paste(shifted.crop((0, h // 2, w, h)), (0, 0)); tmp.paste(shifted.crop((0, 0, w, h // 2)), (0, h // 2))
    # tmp now has all four original edges meeting at the centre cross; blend the original back over the cross
    mask = Image.new('L', (w, h), 0)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            dx = abs(x - w / 2) / (w / 2); dy = abs(y - h / 2) / (h / 2)
            fx = min(1.0, dx / blend) if dx < blend else 1.0
            fy = min(1.0, dy / blend) if dy < blend else 1.0
            px[x, y] = int(255 * min(fx, fy) ** 1.5)
    # original (shifted back) over tmp where the mask is white → edges from tmp are consistent at the tile border
    out = Image.composite(shifted_back(tmp, w, h), tmp, mask)
    return out


def shifted_back(img, w, h):
    a = Image.new('RGB', (w, h))
    a.paste(img.crop((w // 2, 0, w, h)), (0, 0)); a.paste(img.crop((0, 0, w // 2, h)), (w // 2, 0))
    b = Image.new('RGB', (w, h))
    b.paste(a.crop((0, h // 2, w, h)), (0, 0)); b.paste(a.crop((0, 0, w, h // 2)), (0, h // 2))
    return b


def main():
    os.makedirs(OUT, exist_ok=True)
    force = '--force' in sys.argv
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or list(TEXTURES)
    for name in names:
        path = os.path.join(OUT, name + '.jpg')
        if os.path.exists(path) and not force:
            print('skip', name); continue
        print('generating', name, '...', flush=True)
        raw = generate(TEXTURES[name])
        img = Image.open(io.BytesIO(raw))
        img = img.resize((1024, 1024), Image.LANCZOS)
        img = make_tileable(img) if not name.startswith('facade') else img.convert('RGB')
        img.save(path, 'JPEG', quality=88, optimize=True)
        print('saved', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    main()
