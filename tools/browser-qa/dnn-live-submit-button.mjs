/**
 * Nút gửi trên dnndefender.com sau khi cài gói: template có giữ được diện mạo không?
 *
 * Bản vá nằm ở CSS + renderer, và cả hai đã lên site (kiểm bằng fetch). Nhưng thứ
 * đáng tin là NÚT THẬT trên trang thật — đo màu nền, ảnh nền và bo góc.
 */
import { chromium } from "playwright-core";

const BASE = "https://dnndefender.com";
const PAGES = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

for (const path of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button[type=submit], .mfp-submit, .mf-submit, .mf-btn-submit")]
      .filter(b => b.offsetParent !== null);
    return btns.slice(0, 2).map(b => {
      const s = getComputedStyle(b);
      return {
        text: (b.textContent || "").trim().slice(0, 26),
        cls: (b.className || "").toString().slice(0, 34),
        bg: s.backgroundColor,
        img: s.backgroundImage === "none" ? "none" : s.backgroundImage.slice(0, 42),
        radius: s.borderTopLeftRadius,
        inShell: !!b.closest(".mfp"),
      };
    });
  });
  console.log(`\n── ${path} ──`);
  if (!info.length) { console.log("   (không thấy nút gửi nào đang hiện)"); continue; }
  info.forEach(b => console.log(`   "${b.text}" [${b.cls}] shell=${b.inShell}\n      màu=${b.bg} · ảnh nền=${b.img} · bo=${b.radius}`));
  await page.screenshot({ path: `docs/qa-live-${path.replace(/\W+/g, "-").slice(0, 40)}.png` });
}
await browser.close();
