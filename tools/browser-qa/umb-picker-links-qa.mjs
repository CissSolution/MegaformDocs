/**
 * Hai thứ owner chỉ ra trên ảnh chụp:
 *   1. picker THIẾU các liên kết Edit / Open / Remove mà Umbraco Forms có
 *   2. trang render THỪA một thẻ bọc ngoài + dòng chú thích kỹ thuật
 *
 *   node tools/browser-qa/umb-picker-links-qa.mjs
 */
import { chromium } from "playwright-core";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const problems = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

await umbLogin(page, { base: BASE, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });

// ── 1. Trang đã render: không còn thẻ bọc, không còn chú thích kỹ thuật ────
const article = await context.newPage();
await article.goto(`${BASE}/what-we-changed-about-file-uploads/`, { waitUntil: "networkidle" });
await article.waitForTimeout(2500);

const box = await article.evaluate(() => {
  const section = document.querySelector(".news-form");
  if (!section) return null;
  const s = getComputedStyle(section);
  return {
    border: s.borderTopWidth,
    background: s.backgroundColor,
    radius: s.borderTopLeftRadius,
    padding: s.paddingTop,
    techNote: !!document.querySelector(".news-form-id"),
    headings: [...section.querySelectorAll("h2")].map(h => h.textContent.trim()),
  };
});
if (!box) problems.push("không thấy khối .news-form trên trang");
else {
  console.log(`thẻ bọc: viền=${box.border} nền=${box.background} bo=${box.radius} đệm=${box.padding}`);
  console.log(`h2 trong khối: ${box.headings.join(" | ") || "(không có)"} · dòng chú thích kỹ thuật: ${box.techNote}`);
  if (box.border !== "0px") problems.push(`vẫn còn viền bọc ngoài (${box.border})`);
  if (box.radius !== "0px") problems.push(`vẫn còn bo góc bọc ngoài (${box.radius})`);
  if (box.techNote) problems.push("vẫn còn dòng 'rendered by the <megaform> tag helper'");
  // Sau khi gỡ cặp ô "Form heading"/"Form intro", thứ duy nhất được phép có tiêu
  // đề trong khối này là chính bản thiết kế của form.
  const strayIntro = await article.evaluate(() => !!document.querySelector(".news-form-intro"));
  if (strayIntro) problems.push("vẫn còn đoạn dẫn ngoài form (.news-form-intro)");
  const h2Size = await article.evaluate(() => {
    const h = document.querySelector(".news-form h2");
    return h ? getComputedStyle(h).fontSize : null;
  });
  console.log(`h2 đầu tiên trong khối: ${box.headings[0] ?? "(không có)"} · cỡ chữ ${h2Size ?? "-"}`);
  if (box.headings[0] === "Send us a sample file") problems.push("tiêu đề ngoài form vẫn còn");
}
await article.screenshot({ path: "docs/qa-picker-1-article.png", fullPage: false });
await article.close();

// ── 2. Picker trong Content: phải có Edit / Open / Remove ──────────────────
await page.goto(`${BASE}/umbraco/section/content`, { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(6000);

// Deep-query xuyên shadow DOM: property editor nằm nhiều lớp dưới.
async function findPicker() {
  return page.evaluate(() => {
    function walk(root, out) {
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName?.toLowerCase() === "megaform-form-picker") out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, out);
      }
      return out;
    }
    const found = walk(document, []);
    if (!found.length) return null;
    const el = found[0];
    const labels = [...(el.shadowRoot?.querySelectorAll(".actions button") ?? [])].map(b => b.textContent.trim());
    return { count: found.length, actions: labels };
  });
}

// Bất kỳ node nào có picker đều dùng được; "News" là node đầu tiên có tab Form.
await page.getByText("News", { exact: true }).first().click().catch(() => {});
await page.waitForTimeout(4000);
const formTab = page.getByRole("tab", { name: /^Form$/ }).first();
if (await formTab.count()) { await formTab.click(); await page.waitForTimeout(2500); }

// Các liên kết chỉ tồn tại khi ĐÃ chọn một form — Umbraco Forms cũng vậy. Nên
// phải chọn trước rồi mới kiểm, nếu không thì "không thấy Edit" chỉ có nghĩa là
// "chưa chọn gì", chứ không phải tính năng thiếu.
const picked = await page.evaluate(() => {
  function walk(root, out) {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName?.toLowerCase() === "megaform-form-picker") out.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, out);
    }
    return out;
  }
  const el = walk(document, [])[0];
  if (!el) return null;
  const select = el.shadowRoot?.querySelector("uui-select");
  const options = select?.options ?? [];
  const first = options.find(o => o.value);
  if (!first) return { chose: null, optionCount: options.length };
  select.value = first.value;
  select.dispatchEvent(new Event("change"));
  return { chose: first.name, optionCount: options.length };
});
console.log(`chọn form trong picker: ${picked?.chose ?? "(không chọn được)"} · ${picked?.optionCount ?? 0} lựa chọn`);
await page.waitForTimeout(1500);

const picker = await findPicker();
if (!picker) {
  problems.push("không tìm thấy phần tử megaform-form-picker trên trang");
} else {
  console.log(`picker: ${picker.count} phần tử · liên kết: ${picker.actions.join(" | ") || "(KHÔNG CÓ)"}`);
  for (const want of ["Edit", "Open", "Remove"]) {
    if (!picker.actions.includes(want)) problems.push(`picker thiếu liên kết "${want}"`);
  }
}
await page.screenshot({ path: "docs/qa-picker-2-backoffice.png" });

// Remove phải xoá THẬT: ô hiển thị trống mà giá trị cũ còn nằm lại là kiểu hỏng
// người dùng chỉ phát hiện ở lần mở sau.
if (picker?.actions.includes("Remove")) {
  const after = await page.evaluate(() => {
    function walk(root, out) {
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName?.toLowerCase() === "megaform-form-picker") out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, out);
      }
      return out;
    }
    const el = walk(document, [])[0];
    const remove = [...(el.shadowRoot?.querySelectorAll(".actions button") ?? [])].find(b => b.textContent.trim() === "Remove");
    remove?.click();
    return { value: el.value, stillHasRow: !!el.shadowRoot?.querySelector(".selected") };
  });
  // Đọc lại SAU khi Lit kịp vẽ: ngay tại lúc click thì DOM cũ vẫn còn, và đọc
  // ở thời điểm đó sẽ báo nhầm là hàng không biến mất.
  await page.waitForTimeout(900);
  const settled = await page.evaluate(() => {
    function walk(root, out) {
      for (const el of root.querySelectorAll("*")) {
        if (el.tagName?.toLowerCase() === "megaform-form-picker") out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot, out);
      }
      return out;
    }
    const el = walk(document, [])[0];
    return { value: el.value, stillHasRow: !!el.shadowRoot?.querySelector(".selected") };
  });
  console.log(`sau khi bấm Remove: value="${settled.value}" · còn hàng đã chọn: ${settled.stillHasRow}`);
  if (settled.value !== "") problems.push(`Remove không xoá giá trị (còn "${settled.value}")`);
  if (settled.stillHasRow) problems.push("Remove xoá giá trị nhưng hàng đã chọn vẫn hiện");
}

await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
