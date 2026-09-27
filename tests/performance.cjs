// Repeatable local benchmark; user documents never leave this machine.
// --sample file [--baseline old-index.html] [--runs 5]
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sample = option('--sample');
if (!sample || !fs.existsSync(sample)) throw Error('Provide --sample /path/to/document');
const runs = Number(option('--runs', '5'));
if (!Number.isInteger(runs) || runs < 1 || runs > 20) throw Error('--runs must be 1–20');
const versions = { current: path.resolve(__dirname, '../index.html') };
if (option('--baseline')) versions.baseline = path.resolve(option('--baseline'));
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const results = Object.fromEntries(Object.keys(versions).map(key => [key, []]));
    for (let run = 0; run < runs; run++) for (const [version, file] of Object.entries(versions)) {
      const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
      const session = await page.context().newCDPSession(page);
      await session.send('Performance.enable');
      await page.goto(pathToFileURL(file).href);
      await page.evaluate(() => {
        window.timings = { renderMs: 0, paginationMs: 0 };
        for (const [name, method, metric] of [['Hwp', 'render', 'renderMs'], ['Hwpx', 'render', 'renderMs'], ['Layout', 'layoutSection', 'paginationMs']]) {
          const original = HWPViewer[name];
          HWPViewer[name] = { ...original, [method](...args) {
            const start = performance.now();
            try { return original[method](...args); }
            finally { window.timings[metric] += performance.now() - start; }
          }};
        }
      });
      const before = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
      await page.locator('#fileInput').setInputFiles(path.resolve(sample));
      await page.waitForFunction(() => document.querySelector('.hx-pagecard'));
      await page.evaluate(() => document.fonts.ready);
      const after = Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
      const result = await page.evaluate(() => ({ ...window.timings, pages: document.querySelectorAll('.hx-pagecard').length }));
      for (const name of ['LayoutCount', 'RecalcStyleCount']) result[name] = after[name] - before[name];
      result.browserLayoutMs = (after.LayoutDuration - before.LayoutDuration) * 1000;
      results[version].push(result);
      await page.close();
    }
    const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)];
    console.log(JSON.stringify({ sample: path.basename(sample), runs, results,
      medians: Object.fromEntries(Object.entries(results).map(([version, rows]) => [version,
        Object.fromEntries(Object.keys(rows[0]).map(key => [key, median(rows.map(row => row[key]))]))])) }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
