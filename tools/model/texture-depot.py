#!/usr/bin/env python3
"""Give the flat-coloured Supply Depot sculpts real PBR materials.

  python3 tools/model/texture-depot.py <in-dir> <out-dir>

Reads terran_supply_depot_{normal,lowered,animated}.glb (vertex colours only, no UVs), then for each file:
  - classifies every triangle by its vertex colour (red paint, light/mid/dark steel, hazard stripes, brass, glass, lamps...)
  - splits the meshes into one primitive per material, adds face normals and box-projected UVs
  - generates tileable procedural textures (brushed steel, chipped red paint, worn hazard stripes, rivets, panel seams,
    scratches, grime) with baseColor / metallicRoughness / normal maps, and writes a new GLB (animation kept as-is).
Needs Pillow only.
"""
import json, struct, sys, io, math, random, os
from array import array
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps

S = 512
random.seed(7)

# ---------------------------------------------------------------- textures
def noise(sx, sy, blur=0, seed=None):
    im = Image.effect_noise((sx, sy), 64).resize((S, S), Image.BICUBIC)
    if blur: im = im.filter(ImageFilter.GaussianBlur(blur))
    return tileable(im)

def tileable(im):
    b = ImageChops.offset(im, S // 2, S // 2)
    m = Image.new('L', (S, S))
    px = m.load()
    for y in range(S):
        wy = 1 - abs(y - S / 2) / (S / 2)
        for x in range(S):
            px[x, y] = int(255 * min(1, (1 - abs(x - S / 2) / (S / 2)) * wy * 2.2))
    return Image.composite(im, b, m)

def levels(im, lo, hi):
    return im.point(lambda v: max(0, min(255, int((v - lo) * 255 / max(1, hi - lo)))))

def scratches(n, length=(20, 120), bright=90):
    im = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(im)
    for _ in range(n):
        x, y = random.randrange(S), random.randrange(S)
        a = random.choice([0, 0, 0.15, -0.15, 1.57, 1.45])
        L = random.randint(*length)
        for ox in (-S, 0, S):
            for oy in (-S, 0, S):
                d.line([(x + ox, y + oy), (x + ox + math.cos(a) * L, y + oy + math.sin(a) * L)], fill=random.randint(bright // 2, bright), width=1)
    return im

def seams(d_h, d_c, inset=True, rivets=True, depth=70):
    """Panel border groove + inset second panel line + corner rivets, drawn onto height (d_h) and colour-darkening (d_c) layers."""
    for w, v in ((4, depth), (2, depth // 2)):
        pass
    for off, w, v in ((0, 5, 255), (S // 2 - 1, 0, 0)):
        pass
    for k, (o, w) in enumerate(((0, 6), (22, 3))):
        if k == 1 and not inset: break
        for (x0, y0, x1, y1) in ((o, o, S - 1 - o, o), (o, S - 1 - o, S - 1 - o, S - 1 - o), (o, o, o, S - 1 - o), (S - 1 - o, o, S - 1 - o, S - 1 - o)):
            d_h.line([(x0, y0), (x1, y1)], fill=255, width=w)
            d_c.line([(x0, y0), (x1, y1)], fill=255, width=max(2, w - 1))
    if rivets:
        for cx in (40, S - 41):
            for cy in (40, S - 41):
                d_h.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=0)       # dome (raised: inverted below)
                d_c.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=140)

def rgb(c): return tuple(c)

def make_metal(base, rough, metal, grime=0.5, paint_chips=None, brushed=True, name=''):
    """Returns (albedo, mr, normal) images."""
    streak = noise(S, 6, 0.6) if brushed else noise(48, 48, 2)
    blot = noise(10, 10, 3)
    fine = noise(S, S, 0)
    sc = scratches(55)
    hh = Image.new('L', (S, S), 0); cc = Image.new('L', (S, S), 0)
    seams(ImageDraw.Draw(hh), ImageDraw.Draw(cc))
    height = ImageChops.add(ImageChops.multiply(levels(streak, 90, 170), Image.new('L', (S, S), 80)),
                            ImageChops.multiply(levels(fine, 100, 156), Image.new('L', (S, S), 14)))
    groove = hh.filter(ImageFilter.GaussianBlur(1.2))
    height = ImageChops.subtract(height, ImageChops.multiply(groove, Image.new('L', (S, S), 200))) if False else ImageChops.subtract(height, groove.point(lambda v: int(v * 0.55)))
    height = ImageChops.add(height, sc.point(lambda v: int(v * 0.15)))
    # albedo
    lum = ImageChops.add(levels(streak, 60, 190).point(lambda v: int(v * 0.35)), levels(blot, 80, 176).point(lambda v: int(v * 0.65)))
    alb = Image.merge('RGB', [lum.point(lambda v, c=c: int(c * (0.8 + 0.4 * v / 255))) for c in base])
    if paint_chips is not None:      # red paint: chipped away to bare steel
        chips = levels(noise(26, 26, 2.2), 178, 190)
        edge_wear = levels(noise(S, S, 1.5), 185, 200)
        mask = ImageChops.lighter(chips.point(lambda v: v if v > 200 else 0), edge_wear.point(lambda v: v if v > 230 else 0)).filter(ImageFilter.GaussianBlur(0.6))
        steel = Image.new('RGB', (S, S), paint_chips)
        alb = Image.composite(steel, alb, mask.point(lambda v: min(255, v * 2)))
        height = ImageChops.subtract(height, mask.point(lambda v: v // 6))
    # grime in recesses + seams
    dirt = ImageChops.add(groove.point(lambda v: int(v * 0.8)), cc.filter(ImageFilter.GaussianBlur(2)).point(lambda v: int(v * 0.6)))
    dirt = ImageChops.add(dirt, levels(blot, 120, 200).point(lambda v: int(v * grime * 0.5)))
    alb = ImageChops.multiply(alb, ImageOps.invert(dirt.point(lambda v: int(v * 0.55))).convert('RGB'))
    # scratches lighten
    alb = ImageChops.add(alb, Image.merge('RGB', [sc.point(lambda v: int(v * 0.35))] * 3))
    # rivets shine
    # roughness / metallic
    r = ImageChops.add(Image.new('L', (S, S), int(rough * 255 * 0.8)), levels(blot, 60, 190).point(lambda v: int(v * rough * 0.3)))
    r = ImageChops.add(r, dirt.point(lambda v: int(v * 0.35)))
    r = ImageChops.subtract(r, sc.point(lambda v: int(v * 0.35)))
    m = Image.new('L', (S, S), int(metal * 255))
    m = ImageChops.subtract(m, dirt.point(lambda v: int(v * 0.25)))
    if paint_chips is not None:
        m = ImageChops.add(m.point(lambda v: v // 3), mask.point(lambda v: int(v * 0.6)))
    mr = Image.merge('RGB', [Image.new('L', (S, S), 255), r, m])  # G=rough B=metal
    return alb, mr, normal_from(height, 0.8)

def normal_from(h, k=2.0):
    h = h.filter(ImageFilter.GaussianBlur(0.8))
    kx = ImageFilter.Kernel((3, 3), [-1, 0, 1, -2, 0, 2, -1, 0, 1], scale=1 / k, offset=128)
    ky = ImageFilter.Kernel((3, 3), [-1, -2, -1, 0, 0, 0, 1, 2, 1], scale=1 / k, offset=128)
    gx = h.filter(kx); gy = ImageOps.invert(h.filter(ky))
    # reduce Z so slopes read; (nx,ny) kept around 128
    return Image.merge('RGB', [gx, gy, Image.new('L', (S, S), 235)])

def make_hazard(orange=(236, 160, 40), black=(24, 24, 26)):
    alb = Image.new('RGB', (S, S)); px = alb.load()
    period = S / 4
    hh = Image.new('L', (S, S), 120)
    for y in range(S):
        for x in range(S):
            t = ((x + y) % period) / period
            px[x, y] = orange if t < 0.5 else black
    wear = levels(noise(S, S, 0.7), 120, 175); blot = noise(12, 12, 3)
    sc = scratches(70, bright=140)
    dirty = ImageChops.add(blot.point(lambda v: int(v * 0.45)), wear.point(lambda v: int(v * 0.25)))
    alb = ImageChops.multiply(alb, ImageOps.invert(dirty.point(lambda v: int(v * 0.8))).convert('RGB'))
    steel = Image.new('RGB', (S, S), (120, 126, 130))
    chips = levels(noise(30, 30, 1.0), 165, 185).point(lambda v: 255 if v > 220 else 0).filter(ImageFilter.GaussianBlur(0.7))
    alb = Image.composite(steel, alb, chips)
    alb = ImageChops.add(alb, Image.merge('RGB', [sc.point(lambda v: int(v * 0.3))] * 3))
    height = ImageChops.add(Image.new('L', (S, S), 110), chips.point(lambda v: 0)).copy()
    hd = ImageDraw.Draw(height)
    hd.rectangle([0, 0, S - 1, S - 1], outline=None)
    height = ImageChops.subtract(height, chips.point(lambda v: v // 5))
    height = ImageChops.add(height, noise(S, S, 0).point(lambda v: v // 14))
    r = Image.new('L', (S, S), 150); r = ImageChops.add(r, dirty.point(lambda v: v // 3))
    mr = Image.merge('RGB', [Image.new('L', (S, S), 255), r, chips.point(lambda v: int(v * 0.8)).point(lambda v: v + 20 if v else 20)])
    return alb, mr, normal_from(height, 1.0)

def make_flat(base, rough, metal):
    n = noise(S, S, 0.5)
    alb = Image.merge('RGB', [n.point(lambda v, c=c: int(c * (0.85 + 0.3 * v / 255))) for c in base])
    mr = Image.merge('RGB', [Image.new('L', (S, S), 255), Image.new('L', (S, S), int(rough * 255)), Image.new('L', (S, S), int(metal * 255))])
    return alb, mr, normal_from(n.point(lambda v: v // 3), 0.5)

def jpg(im, q=88):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q); return b.getvalue()
def png(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return b.getvalue()

def make_emblem():
    """Terran-style emblem on a dark plate (RGBA)."""
    N = 256
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([6, 6, N - 7, N - 7], 26, fill=(34, 38, 46, 255), outline=(120, 128, 136, 255), width=6)
    c = N / 2; W = (232, 232, 226, 255)
    d.polygon([(c, 40), (c + 22, c - 14), (c + 70, c - 40), (c + 40, c + 4), (c + 56, c + 62), (c, c + 30), (c - 56, c + 62), (c - 40, c + 4), (c - 70, c - 40), (c - 22, c - 14)], fill=W)
    d.ellipse([c - 16, c - 16, c + 16, c + 16], fill=(34, 38, 46, 255)); d.ellipse([c - 8, c - 8, c + 8, c + 8], fill=W)
    for _ in range(90):
        x, y = random.randrange(N), random.randrange(N); a = im.getpixel((x, y))
        if a[3]: im.putpixel((x, y), tuple(int(v * 0.8) for v in a[:3]) + (255,))
    return im.filter(ImageFilter.GaussianBlur(0.6))

def make_fan():
    """Round vent: grey bezel, dark well, swept blades (RGBA)."""
    N = 256; c = N / 2
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([2, 2, N - 3, N - 3], fill=(150, 156, 162, 255)); d.ellipse([20, 20, N - 21, N - 21], fill=(18, 20, 24, 255))
    for k in range(6):
        a = k * math.pi / 3
        pts = []
        for r, da in ((14, 0), (104, 0.0), (112, 0.55), (60, 0.95), (14, 0.5)):
            pts.append((c + math.cos(a + da) * r, c + math.sin(a + da) * r))
        d.polygon(pts, fill=(104, 110, 118, 255), outline=(190, 196, 200, 255))
    d.ellipse([c - 20, c - 20, c + 20, c + 20], fill=(196, 150, 70, 255), outline=(60, 44, 20, 255), width=3)
    d.ellipse([20, 20, N - 21, N - 21], outline=(60, 64, 70, 255), width=5)
    return im.filter(ImageFilter.GaussianBlur(0.5))

DECALS = {'decal_emblem': make_emblem, 'decal_fan': make_fan}

# material table: name -> (builder, emissive, uv tiles-per-unit)
MATS = {
    'steel_light': (lambda: make_metal((175, 183, 190), 0.5, 0.6), None, 0.9),
    'steel_mid':   (lambda: make_metal((120, 130, 142), 0.5, 0.6), None, 0.9),
    'gunmetal':    (lambda: make_metal((62, 72, 84), 0.6, 0.5, grime=0.6), None, 0.9),
    'rubber':      (lambda: make_metal((34, 38, 44), 0.85, 0.15, grime=0.6, brushed=False), None, 1.2),
    'red_paint':   (lambda: make_metal((118, 38, 50), 0.5, 0.3, paint_chips=(110, 116, 122), grime=0.8), None, 0.9),
    'brass':       (lambda: make_metal((205, 150, 76), 0.38, 0.85, grime=0.5), None, 1.4),
    'hazard':      (make_hazard, None, 2.5),
    'glass':       (lambda: make_flat((20, 54, 60), 0.12, 0.4), (0.0, 0.25, 0.3), 1.0),
    'lamp_amber':  (lambda: make_flat((255, 176, 70), 0.3, 0.0), (1.0, 0.62, 0.2), 1.0),
    'lamp_green':  (lambda: make_flat((120, 255, 70), 0.3, 0.0), (0.3, 1.0, 0.15), 1.0),
}

def classify(c, mesh_i):
    c = tuple(c)
    if c in ((137, 145, 151), (183, 187, 181)): return 'steel_light'
    if c == (91, 101, 111): return 'steel_mid'
    if c in ((54, 63, 73), (31, 37, 45)): return 'gunmetal'
    if c == (17, 22, 27): return 'rubber'
    if c in ((91, 37, 48), (119, 47, 58)): return 'red_paint'
    if c == (178, 130, 67): return 'brass'
    if c == (45, 75, 82): return 'glass'
    if c == (118, 255, 69): return 'lamp_green'
    if c == (255, 174, 65): return 'hazard' if mesh_i == 0 else 'lamp_amber'
    return 'steel_mid'

# ---------------------------------------------------------------- glb io
def load(path):
    d = open(path, 'rb').read()
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl]); b = d[20 + jl + 8:]
    return j, b

def acc_bytes(j, b, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    sz = {5121: 1, 5123: 2, 5125: 4, 5126: 4}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return b[o:o + a['count'] * n * sz]

def vec3(j, b, ai):
    raw = acc_bytes(j, b, ai); return list(struct.unpack('<%df' % (len(raw) // 4), raw))

def convert(src, dst, tex):
    j, b = load(src)
    out = bytearray(); bvs = []; accs = []
    def add_bv(data, target=None):
        while len(out) % 4: out.append(0)
        bvs.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data), **({'target': target} if target else {})})
        out.extend(data); return len(bvs) - 1
    def add_acc(bv, comp, typ, count, mn=None, mx=None):
        a = {'bufferView': bv, 'componentType': comp, 'type': typ, 'count': count}
        if mn is not None: a['min'] = mn; a['max'] = mx
        accs.append(a); return len(accs) - 1

    images = []; textures = []; materials = []; mat_index = {}
    def get_mat(name):
        if name in mat_index: return mat_index[name]
        alb, mr, nrm = tex[name]
        def tx(data, mime):
            images.append({'bufferView': add_bv(data), 'mimeType': mime})
            textures.append({'source': len(images) - 1, 'sampler': 0}); return len(textures) - 1
        em = MATS[name][1]
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorTexture': {'index': tx(alb, 'image/jpeg')},
             'metallicRoughnessTexture': {'index': tx(mr, 'image/jpeg')}, 'metallicFactor': 1.0, 'roughnessFactor': 1.0},
             'normalTexture': {'index': tx(nrm, 'image/jpeg'), 'scale': 1.0}}
        if em: m['emissiveFactor'] = list(em)
        materials.append(m); mat_index[name] = len(materials) - 1; return mat_index[name]

    new_meshes = []
    hatch_prims = []
    DEC = {'decal_emblem': (make_emblem, (0.0, 0.8, 0.0)), 'decal_fan': (make_fan, (0.0, 0.0, 0.0))}
    def decal_mat(name):
        if name in mat_index: return mat_index[name]
        im = DEC[name][0]()
        images.append({'bufferView': add_bv(png(im)), 'mimeType': 'image/png'}); textures.append({'source': len(images) - 1, 'sampler': 1})
        materials.append({'name': name, 'alphaMode': 'BLEND', 'doubleSided': True,
                          'pbrMetallicRoughness': {'baseColorTexture': {'index': len(textures) - 1}, 'metallicFactor': 0.3, 'roughnessFactor': 0.55}})
        mat_index[name] = len(materials) - 1; return mat_index[name]
    def quad(name, cx, y, cz, hx, hz, rot=0.0):
        P = array('f'); N = array('f'); UV = array('f')
        c, sn = math.cos(rot), math.sin(rot)
        for (u, v) in ((0, 0), (1, 0), (1, 1), (0, 1)):
            lx, lz = (u - 0.5) * 2 * hx, (v - 0.5) * 2 * hz
            P.extend((cx + lx * c - lz * sn, y, cz + lx * sn + lz * c)); N.extend((0, 1, 0)); UV.extend((u, v))
        I = array('I', [0, 2, 1, 0, 3, 2])
        mn = [min(P[k::3]) for k in range(3)]; mx = [max(P[k::3]) for k in range(3)]
        return {'attributes': {'POSITION': add_acc(add_bv(P.tobytes(), 34962), 5126, 'VEC3', 4, mn, mx),
                               'NORMAL': add_acc(add_bv(N.tobytes(), 34962), 5126, 'VEC3', 4),
                               'TEXCOORD_0': add_acc(add_bv(UV.tobytes(), 34962), 5126, 'VEC2', 4)},
                'indices': add_acc(add_bv(I.tobytes(), 34963), 5125, 'SCALAR', 6, [0], [3]), 'material': decal_mat(name), 'mode': 4}
    for mi, mesh in enumerate(j['meshes']):
        at = mesh['primitives'][0]['attributes']
        pos = vec3(j, b, at['POSITION'])
        col = acc_bytes(j, b, at['COLOR_0'])
        raw = acc_bytes(j, b, mesh['primitives'][0]['indices'])
        idx = struct.unpack('<%dI' % (len(raw) // 4), raw)
        groups = {}
        for t in range(0, len(idx), 3):
            tri = idx[t:t + 3]
            c = tuple(col[4 * tri[0]:4 * tri[0] + 3])
            name = classify(c, mi)
            vs = [pos[3 * i:3 * i + 3] for i in tri]
            part = 'main'
            if mi == 0 and all(v[1] >= 0.35 and abs(v[0]) <= 1.1 and abs(v[2]) <= 0.93 for v in vs) and name not in ('gunmetal', 'steel_mid'):
                part = 'hatch'
            if mi == 1 and (c == (183, 187, 181) or (c == (178, 130, 67) and min(v[1] for v in vs) >= 1.9)):
                name = 'gunmetal'
            groups.setdefault((part, name), []).append(tri)
        prims = []
        for (part, name), tris in groups.items():
            scale = MATS[name][2]
            P = array('f'); N = array('f'); UV = array('f'); I = array('I')
            mn = [1e9] * 3; mx = [-1e9] * 3
            for tri in tris:
                v = [pos[3 * i:3 * i + 3] for i in tri]
                e1 = [v[1][k] - v[0][k] for k in range(3)]; e2 = [v[2][k] - v[0][k] for k in range(3)]
                n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]
                l = math.sqrt(sum(x * x for x in n)) or 1; n = [x / l for x in n]
                ax = max(range(3), key=lambda k: abs(n[k]))
                for p in v:
                    P.extend(p); N.extend(n)
                    if ax == 0: uv = (p[2], -p[1])
                    elif ax == 1: uv = (p[0], p[2])
                    else: uv = (p[0], -p[1])
                    UV.extend((uv[0] * scale, uv[1] * scale))
                    for k in range(3): mn[k] = min(mn[k], p[k]); mx[k] = max(mx[k], p[k])
                I.extend(range(len(P) // 3 - 3, len(P) // 3))
            cnt = len(P) // 3
            pr = {'attributes': {
                'POSITION': add_acc(add_bv(P.tobytes(), 34962), 5126, 'VEC3', cnt, mn, mx),
                'NORMAL': add_acc(add_bv(N.tobytes(), 34962), 5126, 'VEC3', cnt),
                'TEXCOORD_0': add_acc(add_bv(UV.tobytes(), 34962), 5126, 'VEC2', cnt)},
                'indices': add_acc(add_bv(I.tobytes(), 34963), 5125, 'SCALAR', len(I), [0], [cnt - 1]),
                'material': get_mat(name), 'mode': 4}
            (hatch_prims if part == 'hatch' else prims).append(pr)
        if mi == 1:   # structure top: Terran emblem on the dark panel, vent fan over the brass cross
            prims.append(quad('decal_emblem', -0.72, 1.815, -0.55, 0.36, 0.36))
            prims.append(quad('decal_fan', -0.35, 2.035, 0.40, 0.37, 0.37))
        new_meshes.append({'name': mesh.get('name'), 'primitives': prims})
    hatch_prims.append(quad('decal_emblem', 0.0, 0.59, 0.0, 0.3, 0.3, math.pi / 2))
    new_meshes.append({'name': 'Hatch', 'primitives': hatch_prims})
    nodes = j['nodes']
    nodes.append({'name': 'Hatch', 'mesh': 2})
    nodes[0].setdefault('children', []).append(len(nodes) - 1) if 'children' in nodes[0] else None
    sc = j['scenes'][0]
    if 'children' not in nodes[0]: sc['nodes'] = list(sc['nodes']) + [len(nodes) - 1]
    # pose: structure sunk (lowered) or at rest; hatch sunk when raised
    lowered = os.path.basename(src).endswith('lowered.glb')
    nodes[2]['translation'] = [0, -1.9 if lowered else 0.0, 0]
    nodes[3]['translation'] = [0, -0.9 if (not lowered and not j.get('animations')) else 0, 0]

    # animation: hatch drops away (0..0.5), structure rises (0.5..2.5) and mirrored back down (2.5..4.5, hatch closes 4.5..5)
    anims = j.get('animations')
    if anims:
        def f32(*v): return struct.pack('<%df' % len(v), *v)
        tin = add_acc(add_bv(f32(0, 0.5, 2.5, 4.5, 5)), 5126, 'SCALAR', 5, [0], [5])
        tst = add_acc(add_bv(f32(0, -1.9, 0, 0, -1.9, 0, 0, 0, 0, 0, -1.9, 0, 0, -1.9, 0, 0)[:60 // 1] if False else f32(0, -1.9, 0, 0, -1.9, 0, 0, 0, 0, 0, -1.9, 0, 0, -1.9, 0)), 5126, 'VEC3', 5, [0, -1.9, 0], [0, 0, 0])
        tht = add_acc(add_bv(f32(0, 0, 0, 0, -0.9, 0, 0, -0.9, 0, 0, -0.9, 0, 0, 0, 0)), 5126, 'VEC3', 5, [0, -0.9, 0], [0, 0, 0])
        j['animations'] = [{'name': 'Raise_Lower',
            'samplers': [{'input': tin, 'output': tst, 'interpolation': 'LINEAR'}, {'input': tin, 'output': tht, 'interpolation': 'LINEAR'}],
            'channels': [{'sampler': 0, 'target': {'node': 2, 'path': 'translation'}}, {'sampler': 1, 'target': {'node': 3, 'path': 'translation'}}]}]
    anims = j.get('animations')

    g = {'asset': {'version': '2.0', 'generator': 'tools/model/texture-depot.py'}, 'scene': 0, 'scenes': j['scenes'],
         'nodes': j['nodes'], 'meshes': new_meshes, 'materials': materials, 'textures': textures, 'images': images,
         'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}, {'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
         'accessors': accs, 'bufferViews': bvs, 'buffers': [{'byteLength': len(out)}]}
    if anims: g['animations'] = anims
    js = json.dumps(g, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    while len(out) % 4: out.append(0)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    os.makedirs(dst, exist_ok=True)
    tex = {}
    for name, (fn, em, sc) in MATS.items():
        alb, mr, nrm = fn()
        tex[name] = (jpg(alb), jpg(mr, 85), jpg(nrm, 92))
        print('tex', name, [len(x) // 1024 for x in tex[name]])
    for n in ('normal', 'lowered', 'animated'):
        convert(os.path.join(src, f'terran_supply_depot_{n}.glb'), os.path.join(dst, f'supply_depot_{n}.glb'), tex)
        print(n, os.path.getsize(os.path.join(dst, f'supply_depot_{n}.glb')) // 1024, 'KB')
