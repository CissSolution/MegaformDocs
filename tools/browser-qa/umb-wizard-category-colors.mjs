/**
 * Đọc màu THẬT của 8 ô icon danh mục trong trình hướng dẫn.
 *
 * Owner chốt giữ đơn sắc xanh-xám (không theo bản mock đa sắc). Script này ghi lại
 * hiện trạng bằng số để lần sau không ai "sửa" nó về đa sắc rồi tưởng là cải tiến.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${BASE}/umbraco/MegaForm/Admin#mf-new-form`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

const cats = await page.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll("#mf-wizard-root .mfw-cat, #mf-wizard-root .mfw-pick")) {
    const svg = card.querySelector("svg");
    if (!svg) continue;
    const box = svg.closest("span,div");
    const label = (card.textContent || "").replace(/\s+/g, " ").trim().slice(0, 22);
    const s = getComputedStyle(box);
    out.push({ label, bg: s.backgroundColor, color: s.color });
  }
  return out;
});

console.log(`${cats.length} ô có icon:`);
const shades = new Set();
for (const c of cats.slice(0, 12)) {
  console.log(`  ${c.label.padEnd(24)} nền=${c.bg.padEnd(24)} hình=${c.color}`);
  shades.add(c.bg);
}
console.log(`\nsố tông nền khác nhau: ${shades.size} → ${shades.size <= 2 ? "ĐƠN SẮC (đúng ý owner)" : "đa sắc"}`);
await browser.close();
