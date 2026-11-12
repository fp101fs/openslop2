#!/usr/bin/env python3
"""Slim a skinned glTF/GLB for the web without changing how it animates.

  python3 tools/model/slim-glb.py in.glb out.glb

- Animation keyframes are reduced (Ramer-Douglas-Peucker against linear interpolation) with tolerances far below visible:
  translation 0.04% of the model size, rotation 0.0006 (about 0.07 degrees), scale 0.0008. Clip durations are preserved.
- Mesh attributes the game never uses (TANGENT, TEXCOORD_1..n) are dropped; positions/normals/uv0/joints/weights are kept.
- Everything not referenced is removed from the binary chunk. Textures above 1024px are downscaled when Pillow is installed (otherwise copied byte for byte).
Pure standard library, so it runs anywhere python3 does.
"""
import json, struct, sys
from array import array

CT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}

src, dst = sys.argv[1], sys.argv[2]
data = open(src, 'rb').read()
magic, version, total = struct.unpack_from('<4sII', data, 0)
assert magic == b'glTF'
off, js, binc = 12, None, b''
while off < len(data):
    clen, ctype = struct.unpack_from('<II', data, off)
    chunk = data[off + 8: off + 8 + clen]
    if ctype == 0x4E4F534A: js = json.loads(chunk)
    elif ctype == 0x004E4942: binc = chunk
    off += 8 + clen
J = js
bvs, accs = J['bufferViews'], J['accessors']


def raw(ai):
    """Tightly packed bytes of accessor ai (honours bufferView byteStride)."""
    a = accs[ai]; bv = bvs[a['bufferView']]
    fmt, sz = CT[a['componentType']]; n = NC[a['type']]; el = sz * n
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride') or el
    if stride == el: return bytes(binc[start:start + a['count'] * el])
    out = bytearray()
    for i in range(a['count']): out += binc[start + i * stride: start + i * stride + el]
    return bytes(out)


def floats(ai):
    a = array('f'); a.frombytes(raw(ai)); return a


# ---------- model size -> tolerances ----------
ext = 1.0
for m in J['meshes']:
    for p in m['primitives']:
        pa = accs[p['attributes']['POSITION']]
        if 'min' in pa: ext = max(ext, max(mx - mn for mx, mn in zip(pa['max'], pa['min'])))
TOL = {'translation': ext * 0.0004, 'rotation': 0.0006, 'scale': 0.0008}


def reduce_track(times, vals, n, tol, quat):
    """Indices of keyframes to keep."""
    cnt = len(times)
    if cnt <= 2: return list(range(cnt))
    keep = {0, cnt - 1}
    stack = [(0, cnt - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2: continue
        ta, tb = times[a], times[b]; span = (tb - ta) or 1e-9
        worst, wi = -1.0, -1
        va = vals[a * n:(a + 1) * n]; vb = vals[b * n:(b + 1) * n]
        sign = 1.0
        if quat and sum(x * y for x, y in zip(va, vb)) < 0: sign = -1.0
        for i in range(a + 1, b):
            u = (times[i] - ta) / span
            vi = vals[i * n:(i + 1) * n]
            err = 0.0
            for k in range(n):
                interp = va[k] * (1 - u) + sign * vb[k] * u
                e = abs(vi[k] - interp)
                if e > err: err = e
            if err > worst: worst, wi = err, i
        if worst > tol:
            keep.add(wi); stack.append((a, wi)); stack.append((wi, b))
    return sorted(keep)


# ---------- rebuild buffers ----------
newbin = bytearray(); newbvs = []; newaccs = []


def add_bv(b, target=None):
    while len(newbin) % 4: newbin.append(0)
    bv = {'buffer': 0, 'byteOffset': len(newbin), 'byteLength': len(b)}
    if target: bv['target'] = target
    newbin.extend(b); newbvs.append(bv); return len(newbvs) - 1


def add_acc(b, comp, typ, count, target=None, mn=None, mx=None, norm=None):
    a = {'bufferView': add_bv(b, target), 'componentType': comp, 'count': count, 'type': typ}
    if mn is not None: a['min'] = mn
    if mx is not None: a['max'] = mx
    if norm: a['normalized'] = True
    newaccs.append(a); return len(newaccs) - 1


KEEP = {'POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'}
before = len(binc)
for m in J['meshes']:
    for p in m['primitives']:
        attrs = {}
        for k, ai in p['attributes'].items():
            if k not in KEEP: continue
            a = accs[ai]
            attrs[k] = add_acc(raw(ai), a['componentType'], a['type'], a['count'], 34962, a.get('min'), a.get('max'), a.get('normalized'))
        p['attributes'] = attrs
        if 'indices' in p:
            a = accs[p['indices']]; p['indices'] = add_acc(raw(p['indices']), a['componentType'], a['type'], a['count'], 34963)
        p.pop('targets', None)
for s in J.get('skins', []):
    if 'inverseBindMatrices' in s:
        a = accs[s['inverseBindMatrices']]; s['inverseBindMatrices'] = add_acc(raw(s['inverseBindMatrices']), a['componentType'], a['type'], a['count'])

kf_before = kf_after = 0
for anim in J.get('animations', []):
    samplers = []; cache = {}
    for ch in anim['channels']:
        sm = anim['samplers'][ch['sampler']]; path = ch['target']['path']
        key = (ch['sampler'], path)
        if key not in cache:
            times = floats(sm['input']); n = {'translation': 3, 'scale': 3, 'rotation': 4, 'weights': 1}[path]
            vals = floats(sm['output'])
            kf_before += len(times)
            if sm.get('interpolation', 'LINEAR') == 'LINEAR' and path != 'weights':
                idx = reduce_track(times, vals, n, TOL[path], path == 'rotation')
            else:
                idx = list(range(len(times)))
            kf_after += len(idx)
            t2 = array('f', [times[i] for i in idx]); v2 = array('f')
            for i in idx: v2.extend(vals[i * n:(i + 1) * n])
            ia = add_acc(t2.tobytes(), 5126, 'SCALAR', len(t2), None, [min(t2)], [max(t2)])
            oa = add_acc(v2.tobytes(), 5126, 'VEC%d' % n if n > 1 else 'SCALAR', len(idx))
            samplers.append({'input': ia, 'output': oa, 'interpolation': sm.get('interpolation', 'LINEAR')})
            cache[key] = len(samplers) - 1
        ch['sampler'] = cache[key]
    anim['samplers'] = samplers

try:
    from PIL import Image
    import io
except ImportError:
    Image = None
MAXTEX = 1024  # textures larger than this are downscaled (needs Pillow; otherwise copied byte for byte)
for im in J.get('images', []):
    if 'bufferView' in im:
        bv = bvs[im['bufferView']]; s = bv.get('byteOffset', 0)
        blob = bytes(binc[s:s + bv['byteLength']])
        if Image is not None and len(blob) > 300_000:
            img = Image.open(io.BytesIO(blob))
            if max(img.size) > MAXTEX:
                k = MAXTEX / max(img.size)
                img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
                buf = io.BytesIO(); img.save(buf, 'PNG', optimize=True); blob = buf.getvalue()
        im['bufferView'] = add_bv(blob)

J['bufferViews'] = newbvs; J['accessors'] = newaccs
J['buffers'] = [{'byteLength': len(newbin)}]
for k in ('extensionsUsed',):
    pass
jb = json.dumps(J, separators=(',', ':')).encode()
jb += b' ' * ((4 - len(jb) % 4) % 4)
newbin.extend(b'\0' * ((4 - len(newbin) % 4) % 4))
out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(newbin))
out += struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(newbin), 0x004E4942) + bytes(newbin)
open(dst, 'wb').write(out)
print('%s: %.1f MB -> %.1f MB  (binary chunk %.1f -> %.1f MB, keyframes %d -> %d)' % (src.split('/')[-1], len(data) / 1e6, len(out) / 1e6, before / 1e6, len(newbin) / 1e6, kf_before, kf_after))
