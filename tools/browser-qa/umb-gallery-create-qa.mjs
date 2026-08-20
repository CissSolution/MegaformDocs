/**
 * Tạo form từ gallery, từ đầu đến cuối, rồi đếm field trong form vừa tạo.
 *
 *   node tools/browser-qa/umb-gallery-create-qa.mjs
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 980 } })).newPage();
page.on("pageerror", e => console.log("  pageerror:", e.message));

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${BASE}/umbraco/MegaForm/Admin`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(6000);

async function shot(name) { await page.screenshot({ path: `docs/qa-gallery-${name}.png` }); }
async function buttons() {
  return (await page.locator("button:visible, a:visible").allInnerTexts())
    .map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 30);
}

console.log("URL:", page.url());
await shot("0-landing");
console.log("nút lúc vào:", (await buttons()).join(" | ").slice(0, 400));
const newForm = page.locator('button:has-text("New Form"), a:has-text("New Form")').first();
if (!(await newForm.count())) { console.log("✗ không thấy nút New Form"); await browser.close(); process.exit(1); }
await newForm.click();
await page.waitForTimeout(3000);
await shot("1-wizard");
console.log("bước 1 — nút thấy được:", (await buttons()).join(" | ").slice(0, 400));

// Ô tìm template trong bước Setup.
const search = page.locator('input[placeholder*="emplate" i], input[placeholder*="earch" i]').first();
if (await search.count()) {
  await search.fill("Botanical");
  await page.waitForTimeout(2500);
  console.log("đã lọc 'Botanical'");
}
await shot("2-templates");

const pick = page.locator('button:has-text("Botanical")').first();
if (await pick.count()) {
  await pick.click();
  await page.waitForTimeout(2500);
  console.log("đã chọn template Botanical");
} else {
  console.log("✗ không thấy thẻ template Botanical");
}
await shot("3-picked");
console.log("sau khi chọn:", (await buttons()).join(" | ").slice(0, 400));

// Đi hết 5 bước rồi bấm tạo.
for (let step = 0; step < 4; step++) {
  const next = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
  if (!(await next.count())) { console.log(`✗ bước ${step + 2}: không thấy nút Continue`); break; }
  await next.click();
  await page.waitForTimeout(2500);
  const heading = await page.locator(".mfw-steps .active, [class*=step].active").first().innerText().catch(() => "");
  console.log(`→ bước ${step + 2}${heading ? " (" + heading.replace(/\s+/g, " ").trim() + ")" : ""}`);
}
await shot("4-publish");

const create = page.locator('button:has-text("Create Form"), button:has-text("Create form"), button:has-text("Create")').last();
if (await create.count()) {
  await create.click();
  await page.waitForTimeout(9000);
  console.log("đã bấm Create · URL sau đó:", page.url());
} else {
  console.log("✗ không thấy nút Create");
}
await shot("5-created");

// ── Form vừa tạo phải XEM ĐƯỢC NGAY ────────────────────────────────────────
// Không dừng ở "đã tạo xong": một form nháp vẫn được tạo, vẫn hiện trong danh
// sách, chỉ là mở đường dẫn của nó ra thì `schema?formId=` trả 404 và trang in
// "Error loading form". Nên phải đi tới tận trang công khai và ĐẾM ô nhập.
const created = Number(page.url().match(/formId=(\d+)/)?.[1] ?? 0);
if (!created) {
  console.log("✗ không đọc được id form vừa tạo từ địa chỉ");
} else {
  const status = await page.evaluate(async (id) => {
    const r = await fetch(`/umbraco/MegaForm/MegaFormApi/schema?formId=${id}`, { credentials: "same-origin" });
    return r.status;
  }, created);
  console.log(`form #${created} · schema công khai: HTTP ${status}`);

  const pub = await page.context().newPage();
  await pub.goto(`${BASE}/f/${created}`, { waitUntil: "networkidle" });
  await pub.waitForTimeout(4000);
  const view = await pub.evaluate(() => ({
    err: /Error loading form/i.test(document.body.innerText),
    inputs: document.querySelectorAll("input, select, textarea").length,
    title: (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 40),
  }));
  console.log(`trang /f/${created}: "${view.title}" · ${view.inputs} ô nhập · báo lỗi: ${view.err}`);
  if (status !== 200) console.log(`  ✗ schema trả ${status} — form chưa ở trạng thái xem được`);
  if (view.err) console.log("  ✗ trang công khai vẫn báo 'Error loading form'");
  if (view.inputs === 0) console.log("  ✗ trang công khai không có ô nhập nào");
  if (status === 200 && !view.err && view.inputs > 0) console.log("  ✓ xem được ngay sau khi tạo");
  await pub.screenshot({ path: "docs/qa-gallery-6-public.png" });
  await pub.close();
}


await browser.close();
