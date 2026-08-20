/**
 * Mở hộp Report và Portal & Access rồi ghi lại MỌI request 404.
 *
 * "HTTP 404" trên màn hình không cho biết cái gì 404. Bắt ở tầng mạng thì biết.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

const failures = [];
page.on("response", r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url().replace(BASE, "")}`); });

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${BASE}/umbraco/MegaForm/Admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);

// In ra cấu trúc cột hành động một lần, để biết bấm vào đâu.
const shape = await page.evaluate(() => {
  const row = [...document.querySelectorAll("tr")].find(r => /Coachella/.test(r.textContent || ""));
  if (!row) return "không thấy dòng Coachella";
  const last = row.querySelector("td:last-child");
  return [...(last?.children || [])].map(el => `${el.tagName.toLowerCase()}[${el.getAttribute("title") || el.getAttribute("aria-label") || el.className}]`).join(" ").slice(0, 300);
});
console.log("cột hành động:", shape);

async function clickRowAction(title, iconIndex, label) {
  failures.length = 0;
  const row = page.locator("tr", { hasText: title }).first();
  const actions = row.locator("td").last().locator("a, button");
  const n = await actions.count();
  if (iconIndex >= n) { console.log(`  ${label}: chỉ có ${n} hành động`); return; }
  await actions.nth(iconIndex).click();
  await page.waitForTimeout(4000);
  const dialogText = await page.locator("[class*=modal], [role=dialog], .mf-modal").first().innerText().catch(() => "");
  console.log(`\n── ${label} ──`);
  console.log(`   nội dung hộp: ${dialogText.replace(/\s+/g, " ").trim().slice(0, 90)}`);
  console.log(`   request hỏng: ${failures.length ? failures.join(" | ") : "(không có)"}`);
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(1200);
}

// Thứ tự icon trong cột Actions: mở, chia sẻ, sửa, hộp thư, báo cáo, quyền, xoá, khoá
await clickRowAction("Coachella", 4, "Report (biểu đồ)");
await clickRowAction("Coachella", 5, "Portal & Access (người)");

await browser.close();
