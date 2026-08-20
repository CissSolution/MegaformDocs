/**
 * Chụp các màn chính của bản mock thiết kế để đặt cạnh bản thật khi so sánh.
 *
 *   node tools/browser-qa/mock-admin-shots.mjs [baseUrl]
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const BASE = process.argv[2] || "http://localhost:3020";
const OUT = "docs/qa-mock-admin";
const ROUTES = ["", "forms", "builder", "submissions", "inbox", "templates", "theme"];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

for (const route of ROUTES) {
  const url = `${BASE}/${route}`;
  const response = await page.goto(url, { waitUntil: "networkidle" }).catch(() => null);
  await page.waitForTimeout(2000);
  const name = route || "dashboard";
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const title = await page.title().catch(() => "");
  console.log(`  ${String(response?.status() ?? "?").padEnd(4)} /${route.padEnd(12)} ${title.slice(0, 48)}`);
}

await browser.close();
console.log(`\nảnh ở ${OUT}/`);
