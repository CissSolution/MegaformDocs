// ============================================================================
//  Put a form built in the Umbraco FORMS section onto a content page, the way an
//  editor does it, and prove the public page renders it.
//
//  Content -> "Forms Demo" node -> "Umbraco Form" property -> pick a form ->
//  Save and publish -> re-fetch the public URL and look for the rendered <form>.
//  Screenshots at every step, because a green step count proves nothing here.
//
//  Env: UMB_BASE, UMB_USER, UMB_PASS, OUT_DIR, NODE_NAME, PUBLIC_URL, FORM_NAME
//  Run: node tools/browser-qa/umb-pick-umbraco-form.mjs
// ============================================================================
import { chromium } from "playwright";
import fs from "node:fs";
import { umbLogin } from "./umb-login.mjs";

const BASE = process.env.UMB_BASE || "http://localhost:5138";
const USER = process.env.UMB_USER || "admin@local";
const PASS = process.env.UMB_PASS || "Admin123456!";
const OUT = process.env.OUT_DIR || ".";
const NODE_NAME = process.env.NODE_NAME || "Forms Demo";
const PUBLIC_URL = process.env.PUBLIC_URL || "/forms-demo/";
const FORM_NAME = process.env.FORM_NAME || "myf";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: process.env.HEADED !== "1" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function publicPage(tag) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}${PUBLIC_URL}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1500);
  const state = await p.evaluate(() => ({
    title: document.title,
    forms: document.querySelectorAll("form").length,
    inputs: document.querySelectorAll("form input, form textarea, form select").length,
    buttons: [...document.querySelectorAll("form button, form input[type=submit]")].map((b) => (b.value || b.textContent || "").trim()).filter(Boolean),
    text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 300),
  }));
  await p.screenshot({ path: `${OUT}/umbform-public-${tag}.png`, fullPage: true });
  await p.close();
  return state;
}

console.log("public BEFORE:", JSON.stringify(await publicPage("before")));

await umbLogin(page, { base: BASE, user: USER, pass: PASS });

// Open the node from the content tree. A real mouse click is required: calling
// element.click() in page context returns the href without opening the workspace.
await page.goto(`${BASE}/umbraco/section/content`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(7000);
await page.getByText(NODE_NAME, { exact: true }).first().click({ timeout: 30000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/umbform-01-workspace.png`, fullPage: true });
console.log("workspace url:", page.url());

const propText = await page.evaluate(() => (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 700));
console.log("workspace text:", propText);

// The Forms picker renders as a button that opens a modal of forms.
const opener = page.getByRole("button", { name: /choose|select|add|pick/i }).first();
if (await opener.count()) {
  await opener.click({ timeout: 20000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/umbform-02-modal.png`, fullPage: true });

  const item = page.getByText(FORM_NAME, { exact: true }).first();
  if (await item.count()) {
    await item.click({ timeout: 20000 });
    await page.waitForTimeout(2000);
  } else {
    console.log(`!! form "${FORM_NAME}" not visible in the modal`);
  }

  const confirm = page.getByRole("button", { name: /^(choose|submit|select|ok)$/i }).first();
  if (await confirm.count()) {
    await confirm.click({ timeout: 20000 });
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: `${OUT}/umbform-03-picked.png`, fullPage: true });
} else {
  console.log("!! no picker button found — dumping the property area instead");
}

const publish = page.getByRole("button", { name: /save and publish/i }).first();
if (await publish.count()) {
  await publish.click({ timeout: 20000 });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/umbform-04-published.png`, fullPage: true });
} else {
  console.log("!! no 'Save and publish' button found");
}

console.log("public AFTER :", JSON.stringify(await publicPage("after")));

await browser.close();
