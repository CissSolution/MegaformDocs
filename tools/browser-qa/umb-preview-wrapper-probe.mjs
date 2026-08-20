/**
 * Đo các lớp bọc quanh form TRONG MÀN PREVIEW của Umbraco.
 *
 * Trang công khai và màn preview không phải một: preview chạy trong khung riêng
 * của backoffice, nên một hộp bọc chỉ xuất hiện ở đó sẽ không bao giờ lộ ra khi
 * đo trang công khai.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const ID = process.argv[2] || "8283d176-045c-4ecf-804f-65aa75e721b5";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

const preview = await context.newPage();
await preview.goto(`${BASE}/umbraco/preview?id=${ID}`, { waitUntil: "networkidle" });
await preview.waitForTimeout(5000);

// Preview vẽ trang trong iframe; phải đi vào đúng khung đó.
const frames = preview.frames().map(f => f.url());
console.log(`khung trong preview: ${frames.length}`);
frames.forEach(u => console.log("   " + u.slice(0, 90)));

const target = preview.frames().find(f => f.url().includes("/umbraco/preview") === false && f.url() !== "about:blank") ?? preview.mainFrame();
console.log(`đo trong khung: ${target.url().slice(0, 90)}`);

const report = await target.evaluate(() => {
  const start = document.querySelector(".news-form") || document.querySelector("megaform")?.parentElement;
  if (!start) return { error: "không thấy khối form trong khung này", html: document.body?.innerHTML.slice(0, 200) };
  const rows = [];
  let node = start;
  while (node && node !== document.documentElement) {
    const s = getComputedStyle(node);
    const paints = s.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none";
    rows.push({
      name: node.tagName.toLowerCase() + (node.className ? "." + String(node.className).split(" ").join(".").slice(0, 40) : ""),
      bg: s.backgroundColor, border: `${s.borderTopWidth} ${s.borderTopStyle}`,
      radius: s.borderTopLeftRadius, padding: `${s.paddingTop} ${s.paddingRight}`,
      shadow: s.boxShadow === "none" ? "none" : s.boxShadow.slice(0, 30),
      width: Math.round(node.getBoundingClientRect().width), paints,
    });
    node = node.parentElement;
  }
  return { rows };
});

if (report.error) console.log("✗ " + report.error);
else for (const r of report.rows) {
  console.log(`  ${r.name.padEnd(34)} nền=${r.bg.padEnd(22)} viền=${r.border.padEnd(11)} bo=${r.radius.padEnd(6)} đệm=${r.padding.padEnd(13)} bóng=${r.shadow.padEnd(12)} rộng=${r.width}${r.paints ? "  ← VẼ" : ""}`);
}

await preview.screenshot({ path: "docs/qa-preview-wrapper.png" });
await browser.close();
