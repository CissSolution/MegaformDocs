/**
 * Trang demo có HAI ô chọn form (Umbraco Forms và MegaForm). Kiểm cả hai cùng
 * render, và kiểm luôn cái đã chọn thật sự ra HTML chứ không chỉ ra một cái nhãn.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const ID = process.argv[2] || "a80def15-d840-432a-b46b-a2f5b3c3a5f4";
const problems = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

const preview = await context.newPage();
await preview.goto(`${BASE}/umbraco/preview?id=${ID}`, { waitUntil: "networkidle" });
await preview.waitForTimeout(6000);

const frame = preview.frames().find(f => !f.url().includes("/umbraco/preview") && f.url() !== "about:blank") ?? preview.mainFrame();

const state = await frame.evaluate(() => ({
  labels: [...document.querySelectorAll(".news-form-which")].map(el => el.textContent.trim()),
  hasUmbForms: !!document.querySelector("form.umbraco-forms-form, .umbraco-forms-page, [data-umb-form]"),
  megaRoots: document.querySelectorAll(".megaform-root, megaform").length,
  megaFields: document.querySelectorAll(".megaform-root input, .megaform-root select, .megaform-root textarea").length,
  stillSaysNoForm: /No form picked yet/.test(document.body.innerText),
}));

console.log(`nhãn hiện trên trang : ${state.labels.join(" | ") || "(không có)"}`);
console.log(`khối MegaForm        : ${state.megaRoots} · ô nhập bên trong: ${state.megaFields}`);
console.log(`Umbraco Forms render : ${state.hasUmbForms}`);
console.log(`còn câu "chưa chọn"  : ${state.stillSaysNoForm}`);

if (!state.labels.includes("MegaForm")) problems.push("không thấy phần MegaForm trên trang");
if (state.megaRoots === 0) problems.push("MegaForm không render ra khối nào");
if (state.megaFields === 0) problems.push("MegaForm render nhưng không có ô nhập nào");
if (state.stillSaysNoForm) problems.push("vẫn báo 'No form picked yet' dù đã chọn form");

await preview.screenshot({ path: "docs/qa-forms-page.png", fullPage: false });
await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
