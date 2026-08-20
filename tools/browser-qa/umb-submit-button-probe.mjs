/**
 * Nút gửi của form đang render: nó là nút của TEMPLATE hay nút mặc định?
 *
 * Phân biệt bằng số, không bằng cảm giác màu: đọc class, màu nền thật, và xem
 * customCss của template có luật nào nhắm đúng selector ấy không.
 */
import { chromium } from "playwright-core";
const BASE = process.env.UMB_BASE || "http://localhost:5138";
const IDS = (process.argv[2] || "216,215,213").split(",");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

for (const id of IDS) {
  await page.goto(`${BASE}/f/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[type=submit], .mf-submit, button")]
      .filter(b => /submit/i.test(b.type || "") || /mf-submit|submit/i.test(b.className || ""));
    const b = btns[0];
    if (!b) return { none: true };
    const s = getComputedStyle(b);
    return {
      count: btns.length,
      text: (b.textContent || "").trim().slice(0, 34),
      cls: (b.className || "").toString().slice(0, 70),
      bg: s.backgroundColor, radius: s.borderTopLeftRadius, font: s.fontFamily.split(",")[0],
      // Luật CSS nào đang thắng cho background — nguồn của luật cho biết ai tô nó.
      inShell: !!b.closest(".mfp-paper, .mfp, [class*=mfp-]"),
    };
  });
  console.log(`#${id}: ${JSON.stringify(info)}`);
}
await browser.close();
