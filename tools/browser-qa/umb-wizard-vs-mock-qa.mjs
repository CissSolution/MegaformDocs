/**
 * Đặt trình hướng dẫn của MegaForm cạnh bản mock thiết kế và ĐẾM icon thật.
 *
 * Câu hỏi phải trả lời bằng số, không bằng cảm giác: mỗi bước trong thanh trái có
 * một hình hay chỉ là một ô màu trơn? Mỗi thẻ mẫu có hình không? Một ô vuông bo
 * góc rỗng trông vẫn "có gì đó" trong ảnh chụp nhỏ, nên phải đếm phần tử.
 *
 *   node tools/browser-qa/umb-wizard-vs-mock-qa.mjs
 */
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { umbLogin } from "./umb-login.mjs";

const REAL = process.env.UMB_BASE || "http://localhost:5138";
const MOCK = process.env.MOCK_BASE || "http://localhost:3020";
const OUT = "docs/qa-wizard-compare";
const problems = [];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });

// ── 1. Bản mock ───────────────────────────────────────────────────────────
const mock = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await mock.goto(`${MOCK}/builder`, { waitUntil: "networkidle" });
await mock.waitForTimeout(2500);
// /builder của mock là BUILDER; trình hướng dẫn là lớp phủ mở từ nút "New Form".
// Chụp thẳng /builder là chụp nhầm màn khác rồi so sánh với nó.
await mock.getByRole("button", { name: /New Form/i }).first().click().catch(() => {});
await mock.waitForTimeout(3000);
const mockStats = await mock.evaluate(() => {
  const rail = document.querySelectorAll("aside svg, nav svg");
  return { railIcons: rail.length, totalSvg: document.querySelectorAll("svg").length };
});
console.log(`mock  : ${mockStats.totalSvg} svg trên trang`);
await mock.screenshot({ path: `${OUT}/mock-wizard.png` });
await mock.close();

// ── 2. Bản thật ───────────────────────────────────────────────────────────
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
await umbLogin(page, { base: REAL, user: process.env.UMB_USER || "admin@local", pass: process.env.UMB_PASS || "Admin123456!" });
await page.goto(`${REAL}/umbraco/MegaForm/Admin#mf-new-form`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

const real = await page.evaluate(() => {
  const rail = document.querySelectorAll(".mfw-rail .ri");
  const railWithIcon = [...rail].filter(r => r.querySelector(".ic svg"));
  const cards = document.querySelectorAll(".mfw-pick");
  const cardsWithIcon = [...cards].filter(c => c.querySelector("svg"));
  const top = document.querySelectorAll(".mfw-steps-top .s");
  return {
    open: !!document.getElementById("mf-wizard-root"),
    rail: rail.length, railWithIcon: railWithIcon.length,
    cards: cards.length, cardsWithIcon: cardsWithIcon.length,
    topSteps: top.length,
    totalSvg: document.querySelectorAll("#mf-wizard-root svg").length,
    // Thẻ <i class="fas"> còn sót lại nghĩa là còn chỗ trông chờ font icon.
    legacyFontIcons: document.querySelectorAll("#mf-wizard-root i.fas, #mf-wizard-root i[class*='fa-']").length,
  };
});

console.log(`thật  : trình hướng dẫn mở=${real.open} · ${real.totalSvg} svg`);
console.log(`        thanh bước: ${real.railWithIcon}/${real.rail} bước có hình`);
console.log(`        thẻ mẫu   : ${real.cardsWithIcon}/${real.cards} thẻ có hình`);
console.log(`        thẻ <i class="fa*"> còn sót: ${real.legacyFontIcons}`);

if (!real.open) problems.push("trình hướng dẫn không mở");
if (real.rail === 0) problems.push("không thấy thanh bước");
if (real.railWithIcon < real.rail) problems.push(`${real.rail - real.railWithIcon}/${real.rail} bước vẫn là ô trống, không có hình`);
if (real.cards > 0 && real.cardsWithIcon < real.cards) problems.push(`${real.cards - real.cardsWithIcon}/${real.cards} thẻ mẫu không có hình`);
if (real.legacyFontIcons > 0) problems.push(`${real.legacyFontIcons} chỗ vẫn dùng <i class="fa*"> — sẽ rỗng vì không có font`);

await page.screenshot({ path: `${OUT}/real-wizard.png` });
await page.close();

await browser.close();
if (problems.length) { console.log("\nVẤN ĐỀ:"); problems.forEach(p => console.log("  ✗ " + p)); process.exitCode = 1; }
else console.log("\n✓ không thấy vấn đề");
