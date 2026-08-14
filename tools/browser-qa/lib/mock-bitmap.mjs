/**
 * [MockDiff v2] A real per-pixel diff of the form region.
 *
 * pixelmatch/pngjs are not installed and this repo is not a good place to add a dependency for a
 * QA tool, so the diff runs on a canvas in the browser we already have open. Same arithmetic.
 *
 * Only the form region is compared - the mock's card element against our .mfp - so the DNN page's
 * site chrome never enters the subtraction. Both are scaled to a common width first, because a
 * card at 576 and a pane at 1184 subtract to "100% different" while telling you nothing.
 */

const DIFF_SRC = `(a, b, tol) => new Promise((resolve) => {
  const load = (src) => new Promise((ok, err) => {
    const img = new Image(); img.onload = () => ok(img); img.onerror = err; img.src = src;
  });
  Promise.all([load(a), load(b)]).then(([ia, ib]) => {
    const W = ia.naturalWidth;
    const scale = W / ib.naturalWidth;
    const hA = ia.naturalHeight;
    const hB = Math.round(ib.naturalHeight * scale);
    const H = Math.min(hA, hB);

    // Canvas is W x H (the common region); the image is drawn at its own scaled height and the
    // overflow is clipped, so both sides are sampled from the SAME top-left origin.
    const draw = (img, fullH) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      x.drawImage(img, 0, 0, W, fullH);
      return x.getImageData(0, 0, W, H).data;
    };
    const da = draw(ia, hA);
    const db = draw(ib, hB);

    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const ox = out.getContext('2d');
    const od = ox.createImageData(W, H);
    let bad = 0;
    for (let i = 0; i < W * H * 4; i += 4) {
      const dr = Math.abs(da[i] - db[i]);
      const dg = Math.abs(da[i + 1] - db[i + 1]);
      const dbl = Math.abs(da[i + 2] - db[i + 2]);
      const differs = Math.max(dr, dg, dbl) > tol;
      if (differs) {
        bad++;
        od.data[i] = 255; od.data[i + 1] = 24; od.data[i + 2] = 88; od.data[i + 3] = 255;
      } else {
        // faded original underneath, so the red reads as an overlay on the real layout
        const g = 255 - Math.round((255 - (da[i] * 0.3 + da[i + 1] * 0.59 + da[i + 2] * 0.11)) * 0.25);
        od.data[i] = g; od.data[i + 1] = g; od.data[i + 2] = g; od.data[i + 3] = 255;
      }
    }
    ox.putImageData(od, 0, 0);
    resolve({
      mismatch: Math.round((bad / (W * H)) * 10000) / 100,
      width: W, comparedHeight: H, mockHeight: hA, oursHeightScaled: hB,
      png: out.toDataURL('image/png'),
    });
  }).catch((e) => resolve({ error: String(e) }));
})`;

/**
 * @param page      a Playwright page (any page; it is only used as a canvas host)
 * @param mockPng   Buffer of the mock card screenshot
 * @param oursPng   Buffer of our .mfp screenshot
 * @param tolerance per-channel tolerance, 0-255
 */
export async function diffPngs(page, mockPng, oursPng, tolerance = 28) {
  const a = 'data:image/png;base64,' + mockPng.toString('base64');
  const b = 'data:image/png;base64,' + oursPng.toString('base64');
  const res = await page.evaluate(
    `(${DIFF_SRC})(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${Number(tolerance)})`,
  );
  if (res && res.png) {
    res.buffer = Buffer.from(res.png.split(',')[1], 'base64');
    delete res.png;
  }
  return res;
}
