/**
 * "Create form" ở thanh bên phải mở THẲNG trình hướng dẫn.
 *
 * Trước đây nó mở canvas rỗng của builder, và cách duy nhất đi tiếp là bấm Cancel
 * để quay về Dashboard rồi bấm "New Form" ở đó — người dùng phải HUỶ thì mới bắt
 * đầu được.
 *
 *   node tools/browser-qa/umb-create-form-qa.mjs
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const problems = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

// Vào section MegaForm bằng thanh trên cùng (điều hướng SPA, không goto).
await page.getByRole("link", { name: "MegaForm", exact: true }).first().click().catch(async () => {
  await page.getByText("MegaForm", { exact: true }).first().click();
});
await page.waitForTimeout(5000);

// "Create form" nằm trong cây bên trái, dưới nhiều lớp shadow root.
async function clickCreateForm() {
  return page.evaluate(() => {
    function walk(root, out) {
      for (const el of root.querySelectorAll("*")) {
        const label = el.getAttribute?.("label");
        if (el.tagName?.toLowerCase() === "uui-menu-item" && label === "Create form") out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, out);
      }
      return out;
    }
    const item = walk(document, [])[0];
    if (!item) return false;
    // Bấm vào chính phần tử menu — nó tự gọi _navigate.
    (item.shadowRoot?.querySelector("a") ?? item).click();
    return true;
  });
}

if (!(await clickCreateForm())) problems.push("không thấy mục 'Create form' trong cây bên trái");
await page.waitForTimeout(7000);

console.log(`URL sau khi bấm: ${page.url().replace(BASE, "")}`);
if (!/builder\/new/.test(page.url())) problems.push(`địa chỉ không phải builder/new: ${page.url()}`);
if (!/[?&]n=\d+/.test(page.url())) problems.push("thiếu nonce trong địa chỉ — bấm lần hai sẽ không mở lại");

// Trình hướng dẫn phải xuất hiện, KHÔNG phải canvas rỗng có nút Cancel.
const frame = page.frames().find(f => f.url().includes("/umbraco/MegaForm/"));
console.log(`khung: ${frame ? frame.url().replace(BASE, "") : "(không có)"}`);
if (!frame) problems.push("không thấy khung MegaForm");
else {
  const state = await frame.evaluate(() => ({
    wizard: !!document.querySelector(".mfw-shell, .mfw-steps, [class*=mfw-]"),
    stepText: document.body.innerText.match(/Step \d of \d[^\n]*/)?.[0] ?? null,
    emptyBuilder: /New Form/.test(document.body.innerText) && !!document.body.innerText.match(/Cancel/),
    heading: document.body.innerText.split("\n").map(l => l.trim()).filter(Boolean).slice(0, 4),
  }));
  console.log(`trình hướng dẫn: ${state.wizard} · bước: ${state.stepText ?? "-"}`);
  console.log(`dòng đầu: ${state.heading.join(" | ").slice(0, 120)}`);
  if (!state.wizard) problems.push("khung không hiện trình hướng dẫn");
  if (state.wizard && !state.stepText) problems.push("không thấy dòng 'Step 1 of 5'");
}

await page.screenshot({ path: "docs/qa-create-form.png" });
await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
