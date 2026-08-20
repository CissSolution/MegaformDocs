/**
 * Hộp Report và Portal & Access: không được hiện "HTTP 404" nữa.
 *
 * Report phải nạp được số liệu; Portal là tính năng chỉ có trên Oqtane nên phải
 * nói thẳng điều đó thay vì ném mã lỗi ra mặt người dùng.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const FORM = process.argv[2] || "216";
const problems = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${BASE}/umbraco/MegaForm/Admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(9000);

// Endpoint mà hộp Report dựa vào — kiểm thẳng, không qua giao diện.
const api = await page.evaluate(async (id) => {
  const base = "/umbraco/MegaForm/MegaFormApi/";
  const out = {};
  for (const path of [`Submissions?formId=${id}&pageSize=10`, `Submissions/List?formId=${id}&pageSize=10`, `Portal/Status?formId=${id}`]) {
    const r = await fetch(base + path, { credentials: "same-origin" });
    out[path.split("?")[0]] = r.status;
  }
  return out;
}, FORM);
console.log("endpoint:", JSON.stringify(api));

if (api["Submissions"] === 404 && api["Submissions/List"] === 404) {
  problems.push("cả hai đường lấy bài gửi đều 404 — hộp Report sẽ hỏng");
}

// Hộp Report qua giao diện.
const opened = await page.evaluate((id) => {
  const w = window;
  if (w.MegaForm && typeof w.MegaForm.openSubmissionReport === "function") { w.MegaForm.openSubmissionReport(Number(id), "QA"); return "openSubmissionReport"; }
  return null;
}, FORM);
if (!opened) {
  console.log("không gọi được hộp Report bằng hàm — bỏ qua phần giao diện");
} else {
  await page.waitForTimeout(6000);
  const text = await page.locator("body").innerText();
  const bad = /Failed to load: HTTP 404/.test(text);
  console.log(`hộp Report: ${bad ? "VẪN báo 404" : "không còn báo 404"}`);
  if (bad) problems.push("hộp Report vẫn 'Failed to load: HTTP 404'");
  await page.screenshot({ path: "docs/qa-report-dialog.png" });
}

await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
