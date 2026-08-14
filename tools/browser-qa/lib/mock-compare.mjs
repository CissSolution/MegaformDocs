/**
 * [MockDiff v2] Pure comparison of two collected specs. No browser here, so it is testable.
 */

const rgb = (s) => {
  const m = String(s || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
};

export const colourDelta = (a, b) => {
  const x = rgb(a); const y = rgb(b);
  if (!x || !y) return a === b ? 0 : 999;
  if (x.a === 0 && y.a === 0) return 0;                       // transparent is transparent
  const chan = Math.max(Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
  return Math.max(chan, Math.abs(x.a - y.a) * 255);
};

const quad = (s) => String(s || '0/0/0/0').split('/').map(Number);
const quadDelta = (a, b) => {
  const x = quad(a); const y = quad(b);
  let d = 0;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d = Math.max(d, Math.abs((x[i] || 0) - (y[i] || 0)));
  return d;
};

const DEFAULTS = {
  fontSize: 0.6, colour: 12, height: 0.15, box: 2, gap: 4, offset: 3, width: 4, radius: 2,
};

/** Typography + colour + box geometry for every element matched by text. */
export function compareKeyed(mock, ours, tol = {}) {
  const t = { ...DEFAULTS, ...tol };
  const rows = [];
  for (const k of mock.order) {
    const a = mock.keyed[k]; const b = ours.keyed[k];
    if (!a || !b) continue;
    const d = [];

    // -- typography -----------------------------------------------------------------------
    if (Math.abs(a.fontSize - b.fontSize) > t.fontSize) d.push(`font-size ${a.fontSize}->${b.fontSize}`);
    if (a.fontWeight !== b.fontWeight) d.push(`font-weight ${a.fontWeight}->${b.fontWeight}`);
    if (a.fontStyle !== b.fontStyle) d.push(`font-style ${a.fontStyle}->${b.fontStyle}`);
    if (a.fontFamily !== b.fontFamily) d.push(`font-family ${a.fontFamily}->${b.fontFamily}`);
    if (a.transform !== b.transform) d.push(`text-transform ${a.transform}->${b.transform}`);
    if (a.align !== b.align) d.push(`text-align ${a.align}->${b.align}`);
    if (Math.abs((a.letter || 0) - (b.letter || 0)) > 0.3) d.push(`letter-spacing ${a.letter}->${b.letter}`);
    if (a.lineHeight !== 'normal' && b.lineHeight !== 'normal' && Math.abs(a.lineHeight - b.lineHeight) > 2) {
      d.push(`line-height ${a.lineHeight}->${b.lineHeight}`);
    }

    // -- colour ---------------------------------------------------------------------------
    if (colourDelta(a.color, b.color) > t.colour) d.push(`colour ${a.color} -> ${b.color}`);
    if (colourDelta(a.bg, b.bg) > t.colour) d.push(`background ${a.bg} -> ${b.bg}`);
    // Only the sides the MOCK actually draws. Comparing a side with zero width compares the UA
    // default against ours and reports a colour nobody can see.
    const sides = ['top', 'right', 'bottom', 'left'];
    const aw = quad(a.borderW); const ac = String(a.borderC).split(' '); const bc = String(b.borderC).split(' ');
    const badSides = sides.filter((_, i) => aw[i] > 0 && colourDelta(ac[i], bc[i]) > t.colour);
    if (badSides.length) d.push(`border-colour ${badSides.join('+')} ${ac[sides.indexOf(badSides[0])]} -> ${bc[sides.indexOf(badSides[0])]}`);

    // -- box geometry: the whole point of v2 ----------------------------------------------
    if (quadDelta(a.pad, b.pad) > t.box) d.push(`padding ${a.pad} -> ${b.pad}`);
    if (quadDelta(a.mar, b.mar) > t.box) d.push(`margin ${a.mar} -> ${b.mar}`);
    if (quadDelta(a.gap, b.gap) > t.box) d.push(`gap ${a.gap} -> ${b.gap}`);
    if (quadDelta(a.borderW, b.borderW) > 0.5) d.push(`border-width ${a.borderW} -> ${b.borderW}`);
    if (Math.abs(a.radius - b.radius) > t.radius) d.push(`radius ${a.radius}->${b.radius}`);
    if (Math.abs(a.dx - b.dx) > t.offset) d.push(`x-offset ${a.dx}->${b.dx}`);
    if (Math.abs(a.w - b.w) > Math.max(t.width, a.w * 0.04)) d.push(`width ${a.w}->${b.w}`);
    if (Math.abs(a.h - b.h) > Math.max(2, a.h * t.height)) d.push(`height ${a.h}->${b.h}`);
    if (Math.abs((a.gapPrev || 0) - (b.gapPrev || 0)) > t.gap) {
      d.push(`gap-above ${a.gapPrev}->${b.gapPrev} (after "${a.prevKey || '-'}")`);
    }

    if (d.length) rows.push({ key: k, diffs: d });
  }
  return rows;
}

/**
 * Structure. Depth is NOT compared - the two DOMs nest differently by construction and a
 * depth-sensitive diff is all noise. What IS comparable: how many painted boxes, rules, controls
 * and images each side draws, and in what order the copy appears.
 */
export function compareStructure(mock, ours) {
  const hist = (s) => s.struct.reduce((m, n) => { m[n.role] = (m[n.role] || 0) + 1; return m; }, {});
  const a = hist(mock); const b = hist(ours);
  const roles = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const counts = roles.map((r) => ({ role: r, mock: a[r] || 0, ours: b[r] || 0 }))
    .filter((x) => x.mock !== x.ours);

  // Order of the visible copy. A reordered section shows as a move here even when every element
  // exists on both sides.
  const seqA = mock.struct.filter((n) => n.text).map((n) => n.text);
  const seqB = ours.struct.filter((n) => n.text).map((n) => n.text);
  const setB = new Set(seqB);
  const setA = new Set(seqA);
  return {
    roleCounts: counts,
    missingText: seqA.filter((x) => !setB.has(x)).slice(0, 30),
    extraText: seqB.filter((x) => !setA.has(x)).slice(0, 30),
  };
}
