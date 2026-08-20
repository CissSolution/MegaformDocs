/**
 * Hỏi thẳng BuilderTemplates/List xem nó trả về gì cho phần `fields`.
 *
 * Chạy trong trang backoffice để mượn phiên đăng nhập — endpoint có
 * [MegaFormAuthorize] nên gọi bằng curl chỉ nhận 302 về màn đăng nhập.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

const result = await page.evaluate(async () => {
  const response = await fetch("/umbraco/MegaForm/MegaFormApi/BuilderTemplates/List", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* để nguyên text */ }
  return { status: response.status, ok: response.ok, head: text.slice(0, 260), count: Array.isArray(data) ? data.length : -1, sample: Array.isArray(data) ? data.find(t => String(t.slug || t.Slug || "").includes("botanical")) ?? data[0] : null };
});

console.log(`HTTP ${result.status} · số template: ${result.count}`);
if (result.count < 0) {
  console.log("không phải mảng JSON. 260 ký tự đầu:\n" + result.head);
} else if (result.sample) {
  const t = result.sample;
  const fields = t.fields ?? t.Fields;
  console.log(`template: ${t.title ?? t.Title} (${t.slug ?? t.Slug})`);
  console.log(`  fields là: ${Array.isArray(fields) ? `mảng ${fields.length} phần tử` : typeof fields}`);
  if (Array.isArray(fields) && fields.length) {
    console.log(`  phần tử đầu: ${JSON.stringify(fields[0]).slice(0, 200)}`);
    const keys = Object.keys(fields[0] ?? {});
    console.log(`  khoá của phần tử đầu: ${keys.length ? keys.join(", ") : "(RỖNG — object không có thuộc tính nào)"}`);
  }
  console.log(`  settings: ${JSON.stringify(t.settings ?? t.Settings).slice(0, 120)}`);
}

await browser.close();
