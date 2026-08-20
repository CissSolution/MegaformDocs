/**
 * Luật CSS nào đang tô nền cho nút gửi — và nó đến từ stylesheet nào.
 *
 * "Template có luật cho .mfp-submit" chưa nói lên điều gì: luật có thể tồn tại mà
 * vẫn thua một luật khác mạnh hơn, hoặc stylesheet chứa nó chưa hề được nạp.
 */
import { chromium } from "playwright-core";
const BASE = process.env.UMB_BASE || "http://localhost:5138";
const IDS = (process.argv[2] || "216,215").split(",");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

for (const id of IDS) {
  await page.goto(`${BASE}/f/${id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500);
  const out = await page.evaluate(() => {
    const btn = document.querySelector(".mfp-submit, .mfp-btn, .xms-submit, button[type=submit]");
    if (!btn) return { none: true };
    const hits = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }   // stylesheet khác origin
      for (const rule of rules) {
        if (!rule.selectorText || !rule.style) continue;
        if (!/background/.test(rule.style.cssText)) continue;
        let matches = false;
        try { matches = btn.matches(rule.selectorText); } catch { /* selector lạ */ }
        if (!matches) continue;
        hits.push({
          sel: rule.selectorText.slice(0, 60),
          bg: rule.style.getPropertyValue("background-color") || rule.style.getPropertyValue("background").slice(0, 30),
          important: rule.style.getPropertyPriority("background-color") || rule.style.getPropertyPriority("background"),
          from: (sheet.href || "").split("/").pop() || (sheet.ownerNode?.id ? "#" + sheet.ownerNode.id : "<style>"),
        });
      }
    }
    return { cls: btn.className, final: getComputedStyle(btn).backgroundColor, hits };
  });

  console.log(`\n── form ${id} · class="${out.cls}" · màu cuối=${out.final} ──`);
  for (const h of (out.hits || [])) {
    console.log(`   ${h.sel.padEnd(46)} bg=${String(h.bg).padEnd(22)} ${h.important ? "!important" : ""}  ← ${h.from}`);
  }
  if (!out.hits?.length) console.log("   (không luật nào khớp — nền đến từ inline style hoặc thuộc tính khác)");
}
await browser.close();
