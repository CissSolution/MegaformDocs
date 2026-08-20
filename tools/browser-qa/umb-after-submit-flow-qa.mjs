/**
 * Màn Settings: phần "After submit" phải đọc ra như một dòng chảy các bước,
 * theo lối Umbraco Forms — chứ không phải hai ô nhập nằm rời nhau.
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const FORM = process.argv[2] || "216";
const problems = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${BASE}/umbraco/section/megaform/view/open/form-settings/${FORM}`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(9000);

// Màn này là web component nằm sâu trong shadow DOM.
const state = await page.evaluate(() => {
  function deep(root, out) {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName?.toLowerCase().includes("form-settings")) out.push(el);
      if (el.shadowRoot) deep(el.shadowRoot, out);
    }
    return out;
  }
  const view = deep(document, [])[0];
  const sr = view?.shadowRoot;
  if (!sr) return { found: false };
  const heads = [...sr.querySelectorAll(".flow-head b")].map(b => b.textContent.trim());
  const steps = [...sr.querySelectorAll(".flow-steps .step > .head .txt b")].map(b => b.textContent.trim());
  const sections = [...sr.querySelectorAll(".section > h3")].map(h => h.textContent.trim());
  return { found: true, heads, steps, sections };
});

if (!state.found) {
  problems.push("không tìm thấy màn Settings (web component)");
} else {
  console.log(`mục trong màn : ${state.sections.join(" | ")}`);
  console.log(`nhóm sự kiện  : ${state.heads.join(" | ") || "(không có)"}`);
  console.log(`bước          : ${state.steps.join(" | ") || "(không có)"}`);

  if (!state.heads.includes("On Submit")) problems.push("thiếu nhóm 'On Submit'");
  if (!state.heads.includes("On Approve")) problems.push("thiếu nhóm 'On Approve'");
  if (!state.steps.some(s => /Submit message|Go to page/.test(s))) problems.push("thiếu bước 'Submit message / Go to page'");
  if (!state.steps.includes("Add workflow")) problems.push("thiếu 'Add workflow'");
  if (state.sections.includes("Notifications")) problems.push("mục 'Notifications' rời vẫn còn — lẽ ra đã thành một bước");
}

// Cuộn tới mục After submit rồi mở bước đầu, để ảnh cho thấy đúng thứ đang bàn.
await page.evaluate(() => {
  function deep(root, out) {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName?.toLowerCase().includes("form-settings")) out.push(el);
      if (el.shadowRoot) deep(el.shadowRoot, out);
    }
    return out;
  }
  const sr = deep(document, [])[0]?.shadowRoot;
  const head = [...(sr?.querySelectorAll(".section > h3") || [])].find(h => /After submit/i.test(h.textContent));
  head?.scrollIntoView({ block: "start" });
  sr?.querySelector(".flow-steps .step > .head")?.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: "docs/qa-after-submit.png" });
await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
