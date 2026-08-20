/** Đọc màu thật của thanh bước trong bản mock, để không phải đoán bằng mắt. */
import { chromium } from "playwright-core";
const MOCK = process.env.MOCK_BASE || "http://localhost:3020";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await page.goto(`${MOCK}/builder`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
// /builder của mock là BUILDER; trình hướng dẫn là lớp phủ mở từ nút "New Form".
// Chụp thẳng /builder là chụp nhầm màn khác rồi so sánh với nó.
await page.getByRole("button", { name: /New Form/i }).first().click().catch(() => {});
await page.waitForTimeout(3000);

const out = await page.evaluate(() => {
  // Thanh bước là cột trái: tìm phần tử chứa cả "Setup" và "Publish".
  const all = [...document.querySelectorAll("div,aside,nav")];
  const rail = all.filter(el => /Setup/.test(el.textContent || "") && /Publish/.test(el.textContent || ""))
                  .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  if (!rail) return null;

  const rows = [...rail.children].filter(c => c.getBoundingClientRect().height > 30);
  const read = (el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, pad: s.padding }; };
  const iconBox = (row) => {
    const svg = row.querySelector("svg");
    const box = svg?.closest("div,span");
    return box ? { ...read(box), w: Math.round(box.getBoundingClientRect().width) } : null;
  };
  return {
    railWidth: Math.round(rail.getBoundingClientRect().width),
    rows: rows.slice(0, 5).map(r => ({ text: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28), row: read(r), icon: iconBox(r) })),
  };
});

console.log(JSON.stringify(out, null, 1).slice(0, 1600));
await browser.close();
