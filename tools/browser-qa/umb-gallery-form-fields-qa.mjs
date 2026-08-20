/**
 * Tạo một form từ Template Gallery rồi kiểm nó có field hay không.
 *
 * Bằng chứng phải là FIELD TRONG FORM, không phải "API trả đúng": giữa hai chỗ đó
 * còn cả wizard, và chính khúc giữa ấy là nơi 19 field của template biến mất.
 *
 *   node tools/browser-qa/umb-gallery-form-fields-qa.mjs
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const SLUG = process.env.TPL_SLUG || "botanical-thankyou";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
page.on("pageerror", e => console.log("  pageerror:", e.message));

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

// Trang dashboard là một route MVC riêng, không phải route SPA — mở thẳng được
// bằng cookie vừa có, và không đụng vào token nằm trong bộ nhớ của backoffice.
await page.goto(`${BASE}/umbraco/MegaForm/Admin`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(6000);

// Đọc catalog bằng chính đường mà wizard đọc, rồi chạy đúng phép biến đổi của
// wizard trên bản ghi ấy. Nếu số field ở đây bằng 0 thì lỗi nằm trong wizard,
// còn nếu bằng 19 thì đường dữ liệu đã thông tới tận nơi dùng.
const probe = await page.evaluate(async (slug) => {
  const response = await fetch("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/List", {
    credentials: "same-origin", headers: { Accept: "application/json" },
  });
  const list = await response.json();
  const t = Array.isArray(list) ? list.find(x => String(x.slug || x.Slug || "") === slug) : null;
  if (!t) return { found: false, count: Array.isArray(list) ? list.length : -1 };

  const fields = t.fields ?? t.Fields ?? [];
  const settings = t.settings ?? t.Settings ?? {};
  const typed = fields.filter(f => f && typeof f === "object" && (f.type || f.Type));
  return {
    found: true,
    total: fields.length,
    typed: typed.length,
    firstType: typed[0]?.type ?? null,
    isCustomShell: !!(settings.premiumGeneratedShell || settings.customShell || t.customHtml || t.CustomHtml),
  };
}, SLUG);

console.log(`template "${SLUG}":`);
if (!probe.found) {
  console.log(`  ✗ KHÔNG THẤY trong catalog (${probe.count} template)`);
} else {
  console.log(`  fields: ${probe.total} · có type đọc được: ${probe.typed} · type đầu: ${probe.firstType}`);
  console.log(`  custom shell: ${probe.isCustomShell}`);
  if (probe.typed === 0) console.log("  ✗ mọi field đều mất thuộc tính — wizard sẽ lọc sạch và form ra trắng");
  else console.log("  ✓ field còn nguyên thuộc tính, wizard nạp được");
}

await page.screenshot({ path: "docs/qa-umb-gallery-fields.png" });
await browser.close();
