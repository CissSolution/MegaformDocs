// ============================================================================
//  Submit a form from a seeded Umbraco news page, end to end.
//
//  Two traps this script exists to avoid:
//    1. A "Thank you" panel is not proof. Anti-spam can swallow the post-commit
//       work and still answer 200, so the row in MF_Submissions is the evidence
//       — check the database after this runs.
//    2. Submitting instantly looks like a bot: the renderer times how long the
//       form was on screen, so this waits before it types and before it sends.
//
//  Env: UMB_BASE (default http://localhost:5138), OUT_DIR
//  Run: node tools/browser-qa/umb-news-submit.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const OUT = process.env.OUT_DIR || ".";
fs.mkdirSync(OUT, { recursive: true });

const STAMP = process.env.STAMP || "qa-run";

const TARGETS = [
  {
    slug: "/megaform-2033-ships-for-oqtane/",
    shot: "submit-newsletter",
    label: "Newsletter (form 2)",
    values: { email: `newsroom+${STAMP}@megaform.test` },
  },
  {
    slug: "/registration-opens-for-the-2026-user-conference/",
    shot: "submit-event",
    label: "Event registration (form 4)",
    values: { email: `conference+${STAMP}@megaform.test`, text: `QA ${STAMP}` },
  },
];

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });

const ONLY = process.env.ONLY; // substring of a slug, to rerun one target

for (const t of TARGETS) {
  if (ONLY && !t.slug.includes(ONLY)) continue;
  const page = await ctx.newPage();
  const calls = [];
  const sent = [];
  page.on("request", (r) => {
    if (/MegaFormApi\/(Submit|submit)/i.test(r.url()) && r.method() === "POST") {
      // The anti-spam score keys off the dwell time the CLIENT reports. Printing it here is
      // the difference between "the form was flagged" and knowing which number caused it.
      const data = r.postData() || "";
      const m = data.match(/"submissionTime[^,}]*/i);
      sent.push(m ? m[0] : "(no submissionTime in payload)");
    }
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (/MegaFormApi\/(Submit|submit)/i.test(u)) {
      let body = "";
      try { body = (await r.text()).slice(0, 300); } catch { /* stream consumed */ }
      calls.push(`${r.status()} ${u.split("/").slice(-1)[0]} ${body.replace(/\s+/g, " ")}`);
    }
  });

  await page.goto(`${BASE}${t.slug}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => {
    const root = document.querySelector(".megaform-root");
    return root && root.querySelectorAll("input, select, textarea").length > 0;
  }, { timeout: 20000 }).catch(() => {});

  // Let the renderer's dwell timer run past its spam threshold before typing.
  await page.waitForTimeout(6000);

  const root = page.locator(".megaform-root").first();

  const inputs = root.locator("input:visible");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const el = inputs.nth(i);
    const type = (await el.getAttribute("type")) || "text";
    if (["hidden", "file", "checkbox", "radio", "submit", "button"].includes(type)) continue;
    if (type === "email") await el.fill(t.values.email);
    else if (type === "tel") await el.fill("+49 170 1234567");
    else if (type === "number") await el.fill("2");
    else await el.fill(t.values.text || `QA ${STAMP}`);
  }

  const selects = root.locator("select:visible");
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const sel = selects.nth(i);
    const options = await sel.locator("option").all();
    // First option is the "Select…" placeholder; take the next real one when there is one.
    if (options.length > 1) await sel.selectOption({ index: 1 });
  }

  const areas = root.locator("textarea:visible");
  const areaCount = await areas.count();
  for (let i = 0; i < areaCount; i++) await areas.nth(i).fill(`Submitted by the newsroom QA run ${STAMP}.`);

  await page.waitForTimeout(2500);

  const buttons = await root.locator("button:visible").all();
  let clicked = null;
  for (const b of buttons) {
    const label = ((await b.textContent()) || "").trim();
    if (/^(cancel|back|←)/i.test(label)) continue;
    if (/submit|send|subscribe|register|reserve|apply/i.test(label)) { await b.click(); clicked = label; break; }
  }
  if (!clicked && buttons.length) {
    const label = ((await buttons[buttons.length - 1].textContent()) || "").trim();
    await buttons[buttons.length - 1].click();
    clicked = `${label} (fallback: last button)`;
  }

  await page.waitForTimeout(6000);

  const after = await page.evaluate(() => {
    const root = document.querySelector(".megaform-root");
    return (root?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 220);
  });

  await page.screenshot({ path: `${OUT}/umb-news-${t.shot}.png`, fullPage: true });

  console.log(`\n--- ${t.label}`);
  console.log(`    clicked : ${clicked || "(no button found)"}`);
  console.log(`    network : ${calls.length ? calls.join(" | ") : "(no Submit call seen)"}`);
  console.log(`    dwell   : ${sent.length ? sent.join(" | ") : "(no Submit POST captured)"}`);
  console.log(`    after   : ${after}`);
  console.log(`    shot    : ${OUT}/umb-news-${t.shot}.png`);

  await page.close();
}

await browser.close();
