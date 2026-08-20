/**
 * Liệt kê MỌI lớp bọc quanh form, từ .news-form xuống tới phần tử đầu tiên do
 * template vẽ, kèm nền / viền / bo góc / đệm / đổ bóng của từng lớp.
 *
 * Nhìn bằng mắt chỉ thấy "có card"; cái cần biết là card ấy do lớp NÀO vẽ.
 */
import { chromium } from "playwright-core";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const URL = process.argv[2] || `${BASE}/what-we-changed-about-file-uploads/`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

const layers = await page.evaluate(() => {
  const start = document.querySelector(".news-form");
  if (!start) return null;

  // TỔ TIÊN trước: một hộp bọc ngoài nằm ở phía trên, không phải phía dưới —
  // đo xuôi xuống thì không bao giờ thấy nó.
  const ups = [];
  let up = start.parentElement;
  while (up && up !== document.documentElement) {
    const s = getComputedStyle(up);
    ups.push({
      tag: up.tagName.toLowerCase(),
      cls: (up.className || "").toString().slice(0, 40),
      bg: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle}`,
      radius: s.borderTopLeftRadius,
      padding: `${s.paddingTop} ${s.paddingRight}`,
      shadow: s.boxShadow === "none" ? "none" : s.boxShadow.slice(0, 30),
      width: Math.round(up.getBoundingClientRect().width),
    });
    up = up.parentElement;
  }
  window.__ups = ups;

  const out = [];
  let node = start;
  let depth = 0;
  while (node && depth < 12) {
    const s = getComputedStyle(node);
    const paints =
      s.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      parseFloat(s.borderTopWidth) > 0 ||
      s.boxShadow !== "none" ||
      parseFloat(s.paddingTop) > 0 ||
      parseFloat(s.borderTopLeftRadius) > 0;

    out.push({
      depth,
      tag: node.tagName.toLowerCase(),
      cls: (node.className || "").toString().slice(0, 60),
      bg: s.backgroundColor,
      border: `${s.borderTopWidth} ${s.borderTopStyle}`,
      radius: s.borderTopLeftRadius,
      padding: `${s.paddingTop} ${s.paddingRight}`,
      shadow: s.boxShadow === "none" ? "none" : s.boxShadow.slice(0, 40),
      paints,
      width: Math.round(node.getBoundingClientRect().width),
    });

    // Đi xuống theo nhánh chứa form: phần tử con đầu tiên có kích thước.
    const child = [...node.children].find(c => c.getBoundingClientRect().width > 0);
    if (!child) break;
    node = child;
    depth++;
  }
  return out;
});

if (!layers) {
  console.log("không thấy .news-form");
} else {
  console.log("depth tag/class".padEnd(46) + "nền".padEnd(24) + "viền".padEnd(12) + "bo".padEnd(7) + "đệm".padEnd(16) + "rộng");
  for (const l of layers) {
    const name = `${" ".repeat(l.depth)}${l.tag}${l.cls ? "." + l.cls.split(" ").join(".") : ""}`.slice(0, 45);
    console.log(
      String(l.depth).padEnd(6) + name.padEnd(40) +
      l.bg.padEnd(24) + l.border.padEnd(12) + l.radius.padEnd(7) + l.padding.padEnd(16) + l.width +
      (l.paints ? "   ← VẼ" : ""));
  }
}

const ups = await page.evaluate(() => window.__ups);
console.log("");
console.log("── TỔ TIÊN của .news-form (từ trong ra ngoài) ──");
for (const u of ups ?? []) {
  const paints = u.bg !== "rgba(0, 0, 0, 0)" || parseFloat(u.border) > 0 || u.shadow !== "none";
  console.log(`  ${(u.tag + (u.cls ? "." + u.cls.split(" ").join(".") : "")).padEnd(30)} nền=${u.bg.padEnd(22)} viền=${u.border.padEnd(11)} bo=${u.radius.padEnd(6)} đệm=${u.padding.padEnd(14)} rộng=${u.width}${paints ? "   ← VẼ" : ""}`);
}

// Asset phải mang ?v=: không có nó, mọi bản vá CSS chỉ tới được trình duyệt
// chưa từng mở trang — người đã xem một lần vẫn thấy y nguyên bản cũ, và bản vá
// trông như chưa từng được áp.
const assets = await page.evaluate(() =>
  [...document.querySelectorAll('link[rel=stylesheet], script[src]')]
    .map(el => el.getAttribute("href") || el.getAttribute("src"))
    .filter(u => u && u.startsWith("/")));
console.log("");
console.log("── asset cục bộ ──");
let stale = 0;
for (const u of assets) {
  const ok = u.includes("?v=") || u.includes("?umb__rnd=");
  if (!ok) stale++;
  console.log(`  ${ok ? "✓" : "✗ KHÔNG có ?v="} ${u.slice(0, 78)}`);
}
if (stale) console.log(`  → ${stale} asset sẽ kẹt trong cache trình duyệt sau mỗi lần sửa`);

await browser.close();
