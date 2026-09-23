// Optional real-document regression. Input files remain local and are not fixtures.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const sample = args[args.indexOf('--sample') + 1];
if (!args.includes('--sample') || !sample) throw new Error('Use --sample /path/to/document.hwp');
(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1500 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.locator('#fileInput').setInputFiles(path.resolve(sample));
    await page.waitForFunction(() => document.querySelector('.hx-pagecard'));
    await page.evaluate(() => document.fonts.ready);
    const text = await page.locator('#hxPage').textContent();
    const count = await page.locator('.hx-pagecard').count();
    async function checkBounds() {
      const issues = await page.evaluate(() => {
        const issues = [];
        document.querySelectorAll('.hx-pagecard').forEach((card, index) => {
          const r = card.getBoundingClientRect(), css = getComputedStyle(card);
          const zoom = r.width / card.offsetWidth, tolerance = 2 * zoom;
          const bottom = r.top + (parseFloat(card.style.minHeight) - parseFloat(css.paddingBottom)) * zoom;
          const right = r.right - parseFloat(css.paddingRight) * zoom;
          let previousBottom = r.top;
          for (const table of card.querySelectorAll(':scope > .hx-p > table')) {
            const b = table.getBoundingClientRect();
            if (b.top < previousBottom - tolerance || b.bottom > bottom + tolerance || b.right > right + tolerance)
              issues.push({ page: index + 1, type: 'table boundary/overlap', text: table.textContent.slice(0, 20) });
            previousBottom = b.bottom;
          }
          for (const cell of card.querySelectorAll('td')) {
            const b = cell.getBoundingClientRect();
            for (const line of cell.querySelectorAll('.hx-seg > div')) {
              const range = document.createRange();range.selectNodeContents(line);
              const a = range.getBoundingClientRect();
              if (a.width && (a.right > b.right + tolerance || a.left < b.left - tolerance || a.bottom > b.bottom + tolerance))
                issues.push({ page: index + 1, type: 'cell text boundary', text: line.textContent.slice(0, 20) });
            }
          }
        });
        return issues;
      });
      assert.deepEqual(issues, []);
      assert.equal(await page.locator('#hxPage').textContent(), text);
      assert.equal(await page.locator('.hx-pagecard').count(), count);
    }
    for (const zoom of ['0.75', '1', '1.5', '2']) {
      await page.selectOption('#zoomSel', zoom);
      await page.waitForTimeout(100);
      await checkBounds();
    }
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await checkBounds();
    const pdf = await page.pdf({ preferCSSPageSize: true });
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, count);
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await checkBounds();
    assert.deepEqual(errors, []);
    console.log('PASS table/cell containment at 75–200% zoom, print and return; PDF pages:', count);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
