// ============================================================================
//  Who draws the header band above the MegaForm frame?
//
//  The band shows "MegaForm Dashboard" on the left and the section-view tab on the
//  right, and it is mostly empty — the owner wants the form tabs moved INTO it, the
//  way Umbraco Forms puts Design/Analytics/Settings/Entries at the top right.
//  Before moving anything we need the element that owns that band, its shadow-root
//  path from document, and which slots it exposes.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, FORM_ID
//  Run: node tools/browser-qa/umb-workspace-header-probe.mjs
// ============================================================================
import { chromium } from "playwright";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const FORM = process.env.FORM_ID || "103";

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const page = await browser.newContext({ viewport: { width: 1500, height: 900 } }).then((c) => c.newPage());
await umbLogin(page, { base: BASE, user: USER, pass: PASS });
await page.evaluate((f) => {
  history.pushState({}, "", `/umbraco/section/megaform/view/open/builder/${f}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, FORM);
await page.waitForTimeout(6000);

const report = await page.evaluate(() => {
  // Walk every shadow root, recording the path we took to get there.
  const hits = [];
  const seen = new Set();
  function walk(root, path) {
    if (!root || seen.has(root)) return;
    seen.add(root);
    for (const el of root.querySelectorAll("*")) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(" ")
        .trim();
      if (/^MegaForm Dashboard$/i.test(own)) {
        hits.push({
          kind: "headline-text",
          path: path + " > " + el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : ""),
          parent: el.parentElement ? el.parentElement.tagName.toLowerCase() : "(none)",
          parentClass: el.parentElement ? String(el.parentElement.className || "") : "",
          slotAttr: el.getAttribute("slot") || "(none)",
        });
      }
      if (el.tagName.toLowerCase() === "megaform-workspace-view") {
        hits.push({ kind: "our-view", path: path + " > megaform-workspace-view" });
      }
      if (/^umb-(body-layout|workspace-editor|section-main-views|workspace-header)/.test(el.tagName.toLowerCase())) {
        const slots = el.shadowRoot ? [...el.shadowRoot.querySelectorAll("slot")].map((s) => s.getAttribute("name") || "(default)") : [];
        hits.push({ kind: "layout-el", tag: el.tagName.toLowerCase(), path: path + " > " + el.tagName.toLowerCase(), slots,
                    attrs: [...el.attributes].map((a) => a.name + "=" + a.value).join(" ").slice(0, 160) });
      }
      if (el.shadowRoot) walk(el.shadowRoot, path + " > " + el.tagName.toLowerCase() + "#shadow");
    }
  }
  walk(document, "document");

  // What sits in the band, geometrically? Everything whose box overlaps y 95..190.
  const band = [];
  function boxes(root, depth) {
    if (depth > 14) return;
    for (const el of root.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.height > 6 && b.height < 120 && b.top > 90 && b.top < 190 && b.width > 60) {
        band.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || "").slice(0, 40),
                    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
                    box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] });
      }
      if (el.shadowRoot) boxes(el.shadowRoot, depth + 1);
    }
  }
  boxes(document, 0);
  return { hits, band: band.slice(0, 40) };
});

console.log(JSON.stringify(report, null, 1));
await browser.close();
