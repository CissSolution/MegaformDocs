# Pixel diff between two screenshot folders (same filenames).
# usage: python qa-diff.py <baselineDir> <afterDir> <diffOutDir>
# Prints a table: file, dims, changed px, % changed. Writes diff PNGs for mismatches.
import sys, os
from PIL import Image, ImageChops

base_dir, after_dir, diff_dir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(diff_dir, exist_ok=True)

names = sorted(set(os.listdir(base_dir)) | set(os.listdir(after_dir)))
rows, worst = [], 0.0
for n in names:
    if not n.endswith('.png'):
        continue
    a, b = os.path.join(base_dir, n), os.path.join(after_dir, n)
    if not os.path.exists(a):
        rows.append((n, 'MISSING-IN-BASELINE', '', ''))
        continue
    if not os.path.exists(b):
        rows.append((n, 'MISSING-IN-AFTER', '', ''))
        continue
    ia, ib = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    if ia.size != ib.size:
        # pad to the larger canvas so we still diff (size change itself is a finding)
        w = max(ia.size[0], ib.size[0]); h = max(ia.size[1], ib.size[1])
        pa = Image.new('RGB', (w, h), (255, 0, 255)); pa.paste(ia, (0, 0))
        pb = Image.new('RGB', (w, h), (255, 0, 255)); pb.paste(ib, (0, 0))
        ia, ib, size_note = pa, pb, f'SIZE {ia.size}->{ib.size}'
    else:
        size_note = f'{ia.size[0]}x{ia.size[1]}'
    d = ImageChops.difference(ia, ib)
    bbox = d.getbbox()
    if bbox is None:
        rows.append((n, size_note, 0, '0.0000%'))
        continue
    # count pixels with any channel delta > 8 (antialias tolerance)
    g = d.convert('L')
    hist = g.histogram()
    changed = sum(hist[9:])
    total = ia.size[0] * ia.size[1]
    pct = changed * 100.0 / total
    worst = max(worst, pct)
    rows.append((n, size_note, changed, f'{pct:.4f}%'))
    if changed > 0:
        overlay = Image.blend(ia, Image.merge('RGB', (g.point(lambda v: 255 if v > 8 else 0), g.point(lambda v: 0), g.point(lambda v: 0))), 0.5)
        overlay.save(os.path.join(diff_dir, n))

w1 = max(len(r[0]) for r in rows) if rows else 10
print(f"{'file'.ljust(w1)}  {'dims':16}  {'changed_px':>10}  pct")
for r in rows:
    print(f"{str(r[0]).ljust(w1)}  {str(r[1]):16}  {str(r[2]):>10}  {r[3]}")
print(f"\nWORST: {worst:.4f}%  (gate: <=0.1% per template, 0 preferred)")
