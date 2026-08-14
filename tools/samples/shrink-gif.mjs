/**
 * Re-encode an already-recorded demo GIF smaller, straight from its source webm.
 *
 * A docs page is not a video player: 6 MB of GIF for a twenty-second UI tour is bandwidth the
 * reader pays for and learns nothing extra from. Dropping the frame rate costs far less legibility
 * than dropping the width, so that is the first lever here.
 *
 * Run: node tools/samples/shrink-gif.mjs <name> [fps] [width] [quality] [maxSeconds]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pickSegments, toGif } from '../browser-qa/gif-recorder-lib.mjs';

const REPO = 'E:/DNNDEFENDER AND AI DESIGNES/AI DESIGNES/MegaFormSolution_280_Oqtane_um';
const [name, fps = '3', width = '680', quality = '32', maxSeconds = '13'] = process.argv.slice(2);
if (!name) throw new Error('usage: shrink-gif.mjs <name> [fps] [width] [quality] [maxSeconds]');

const vidDir = path.join(REPO, 'qa-out/integration-demos/video', name);
const webm = fs.readdirSync(vidDir).filter((f) => f.endsWith('.webm')).map((f) => path.join(vidDir, f))[0];
if (!webm) throw new Error('no webm under ' + vidDir);

const out = path.join(REPO, 'demo-gifs', name + '.gif');
const before = fs.existsSync(out) ? fs.statSync(out).size : 0;
const segments = pickSegments(webm, { threshold: 1.4, pad: 1, gap: 2, maxSeconds: Number(maxSeconds) });
const info = toGif(webm, out, { width: Number(width), fps: Number(fps), quality: Number(quality), segments });
fs.copyFileSync(out, path.join(REPO, 'Docs/docfx/images', name + '.gif'));

console.log(`${name}: ${(before / 1048576).toFixed(2)} MB -> ${(info.bytes / 1048576).toFixed(2)} MB  (${info.size}, ${info.frames} frames)`);
