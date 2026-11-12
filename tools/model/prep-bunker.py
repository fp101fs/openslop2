#!/usr/bin/env python3
"""Prepare the Sketchfab soviet bunker GLB for the game: drop the 'floor' octagon (metal foundation plate) and
optionally the other mesh names given with --drop, re-save as public/models/bunker.glb.
usage: prep-bunker.py in.glb out.glb [--drop nodeName,...] [--rotx deg]"""
import json, struct, sys, math

def load(p):
    d = open(p, 'rb').read()
    l = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + l])
    off = 20 + l
    bl = struct.unpack('<I', d[off:off + 4])[0]
    return j, d[off + 8:off + 8 + bl]

def save(p, j, b):
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    b += b'\0' * (-len(b) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(b))
    out += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(b), 0x004E4942) + b
    open(p, 'wb').write(out)

args = sys.argv[1:]
src, dst = args[0], args[1]
drop = set(['Cylinder001'])
rotx = 0
i = 2
while i < len(args):
    if args[i] == '--drop': drop |= set(args[i + 1].split(',')); i += 2
    elif args[i] == '--rotx': rotx = float(args[i + 1]); i += 2
    else: i += 1
j, b = load(src)
for n in j['nodes']:
    if 'children' in n:
        n['children'] = [c for c in n['children'] if j['nodes'][c].get('name') not in drop]
if rotx:
    h = math.radians(rotx) / 2
    j['nodes'][0]['rotation'] = [math.sin(h), 0, 0, math.cos(h)]
save(dst, j, b)
print('wrote', dst, 'dropped', sorted(drop))
