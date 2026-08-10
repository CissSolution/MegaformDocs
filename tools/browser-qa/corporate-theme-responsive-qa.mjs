#!/usr/bin/env node

import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const tag = arg('tag', 'current');
const outDir = arg('out', `qa-out/corporate-theme-${tag}`);
const onlyCases = arg('only', '').split(',').map((value) => value.trim()).filter(Boolean);
const allCases = [
  {
    key: 'mock',
    url: 'http://localhost:3000/forms/corporate-registration',
    root: '.rounded-2xl',
  },
  {
    key: 'oq-home',
    url: 'http://localhost:5130/?view=form',
    root: '.mfp-crg .crg-card',
  },
  {
    key: 'oq-review',
    url: 'http://localhost:5130/mf-corporate-reg',
    root: '.mfp-crg .crg-card',
  },
  {
    key: 'dnn',
    url: 'http://megaclean008.ai/mfqa-wide?mfFormId=132',
    root: '.mfp-crg .crg-card',
  },
];
const cases = onlyCases.length
  ? allCases.filter((testCase) => onlyCases.includes(testCase.key))
  : allCases;
const viewports = [
  { key: 'desktop', width: 1365, height: 768 },
  { key: 'mobile', width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--host-resolver-rules=MAP megaclean008.ai 127.0.0.1'],
});

const results = [];
for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  for (const testCase of cases) {
    const page = await context.newPage();
    await page.goto(testCase.url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
    await page.waitForSelector(testCase.root, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1800);

    const metrics = await page.evaluate(({ rootSelector, caseKey }) => {
      const root = document.querySelector(rootSelector);
      const mfp = document.querySelector('.mfp-crg');
      const get = (selector) => document.querySelector(selector);
      const style = (selector) => {
        const element = get(selector);
        if (!element) return null;
        const computed = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          rect: {
            x: Math.round(rect.x * 10) / 10,
            y: Math.round(rect.y * 10) / 10,
            width: Math.round(rect.width * 10) / 10,
            height: Math.round(rect.height * 10) / 10,
            right: Math.round(rect.right * 10) / 10,
            bottom: Math.round(rect.bottom * 10) / 10,
          },
          color: computed.color,
          background: computed.backgroundColor,
          borderColor: computed.borderColor,
          display: computed.display,
          flexDirection: computed.flexDirection,
          gridTemplateColumns: computed.gridTemplateColumns,
          overflow: computed.overflow,
        };
      };

      const rootRect = root?.getBoundingClientRect();
      const variables = {};
      if (mfp) {
        const computed = getComputedStyle(mfp);
        for (const name of [
          '--crg-primary', '--crg-accent', '--crg-surface', '--crg-text', '--crg-muted',
          '--crg-border', '--crg-page', '--mf-page-primary', '--mf-page-surface', '--mf-page-text',
          '--mf-page-border', '--mf-preset-primary', '--mf-preset-surface', '--mf-preset-text',
        ]) variables[name] = computed.getPropertyValue(name).trim();
      }

      return {
        caseKey,
        url: location.href,
        title: document.title,
        viewport: { width: innerWidth, height: innerHeight },
        document: {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
        },
        rootFound: !!root,
        rootInsideViewport: rootRect
          ? rootRect.left >= -0.5 && rootRect.right <= innerWidth + 0.5
          : false,
        variables,
        card: style(rootSelector),
        triangle: style('.mfp-crg .crg-tri-a'),
        header: style('.mfp-crg .crg-head'),
        who: style('.mfp-crg .crg-who'),
        company: style('.mfp-crg .crg-co'),
        grid: style('.mfp-crg .crg-grid2'),
        input: style('.mfp-crg .mf-input'),
        date: style('.mfp-crg .mf-cal'),
        heading: style('.mfp-crg .crg-h1'),
      };
    }, { rootSelector: testCase.root, caseKey: testCase.key });

    results.push(metrics);
    await page.screenshot({
      path: join(outDir, `${viewport.key}-${testCase.key}.png`),
      fullPage: true,
    });
    await page.close();
  }
  await context.close();
}

await browser.close();
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(results, null, 2));

for (const result of results) {
  const view = `${result.viewport.width}x${result.viewport.height}`;
  const overflow = result.document.scrollWidth - result.document.clientWidth;
  const vars = result.variables;
  console.log(
    `${result.caseKey.padEnd(9)} ${view.padEnd(9)} root=${String(result.rootFound).padEnd(5)} `
      + `docOverflow=${String(overflow).padStart(4)} card=${result.card?.rect.width ?? '-'} `
      + `primary=${vars['--crg-primary'] || '-'} surface=${vars['--crg-surface'] || '-'} `
      + `text=${vars['--crg-text'] || '-'}`,
  );
}
console.log(`metrics + screenshots -> ${outDir}`);
