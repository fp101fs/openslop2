#!/usr/bin/env python3
"""Re-encode every texture of a GLB as a JPEG of at most N px (default 512): python3 shrink-textures.py in.glb out.glb [N]. Needs Pillow."""
import json, struct, sys, io
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; N = int(sys.argv[3]) if len(sys.argv) > 3 else 512
d = open(src, 'rb').read()
jl = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + jl]); bo = 20 + jl; bl = struct.unpack_from('<I', d, bo)[0]; B = d[bo + 8:bo + 8 + bl]
bvs = J['bufferViews']; new = bytearray(); newbv = []
used = {im['bufferView'] for im in J.get('images', [])}
remap = {}
for i, bv in enumerate(bvs):
    chunk = B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    if i in used:
        im = Image.open(io.BytesIO(chunk)).convert('RGB'); im.thumbnail((N, N), Image.LANCZOS)
        out = io.BytesIO(); im.save(out, 'JPEG', quality=86); chunk = out.getvalue()
    pad = (4 - len(new) % 4) % 4; new += b'\0' * pad
    nb = {k: v for k, v in bv.items() if k != 'byteOffset'}; nb['byteOffset'] = len(new); nb['byteLength'] = len(chunk); newbv.append(nb); new += chunk
J['bufferViews'] = newbv
for im in J.get('images', []): im['mimeType'] = 'image/jpeg'
J['buffers'] = [{'byteLength': len(new)}]
jb = json.dumps(J, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4); new += b'\0' * ((4 - len(new) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(new)) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + struct.pack('<II', len(new), 0x004E4942) + bytes(new)
open(dst, 'wb').write(out); print(f'{len(d)/1e6:.1f} MB -> {len(out)/1e6:.2f} MB')
