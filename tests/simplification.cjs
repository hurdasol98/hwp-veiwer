// Focused browser checks using synthetic documents; no private samples required.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;

(async () => {
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    const fixtures = await page.evaluate(() => {
      const lib = HWPLIB.CFB;
      function archive(entries, fileType) {
        const container = lib.utils.cfb_new();
        for (const [name, bytes] of Object.entries(entries)) lib.utils.cfb_add(container, name, bytes);
        return Array.from(lib.write(container, { type: 'array', fileType }));
      }
      function record(tag, level, payload) {
        const out = new Uint8Array(4 + payload.length);
        new DataView(out.buffer).setUint32(0, tag | (level << 10) | (payload.length << 20), true);
        out.set(payload, 4);
        return out;
      }
      const text = '검증 문서 ΟΣ İΟΟΣ 😀 ABC';
      const utf16 = new Uint8Array(text.length * 2);
      for (let i = 0; i < text.length; i++) new DataView(utf16.buffer).setUint16(i * 2, text.charCodeAt(i), true);
      const fh = new Uint8Array(256);
      fh.set(new TextEncoder().encode('HWP Document File'));
      fh[35] = 5;
      const body = new Uint8Array([...record(66, 0, new Uint8Array(22)), ...record(67, 1, utf16)]);
      const hwp = archive({ FileHeader: fh, DocInfo: record(16, 0, new Uint8Array([1, 0])), 'BodyText/Section0': body }, 'cfb');
      const enc = text => new TextEncoder().encode(text);
      const hwpx = archive({
        'Contents/header.xml': enc('<head/>'),
        'Contents/section0.xml': enc('<sec><p><run><t>' + text + '</t></run></p></sec>'),
      }, 'zip');
      const other = {};
      for (const prefix of ['word', 'xl', 'ppt', 'other'])
        other[prefix] = archive({ [prefix + '/document.xml']: enc('<doc/>') }, 'zip');
      return { hwp, hwpx, other, text };
    });
    async function load(bytes, name) {
      await page.locator('#fileInput').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
      await page.waitForFunction(() => !document.getElementById('loading').classList.contains('on'));
    }
    async function assertDedicated(badge = 'HWP 5.0 · 전용 렌더러') {
      assert(await page.locator('#hxScroll').isVisible());
      assert.equal(await page.locator('#hxPage').textContent(), fixtures.text);
      assert.equal(await page.locator('#badge').textContent(), badge);
      assert.equal(await page.locator('#btnCompat').textContent(), '호환 모드');
    }
    await load(fixtures.hwp, 'synthetic.hwp');
    await assertDedicated();
    // Isolate controller behavior from the third-party legacy parser.
    await page.evaluate(() => {
      window.legacyDestroyed = 0;
      HWPLIB.Viewer = function (container) {
        if (window.legacyFails) throw new Error('Test legacy failure');
        container.textContent = 'Legacy test view';
        this.distory = () => { window.legacyDestroyed++; };
      };
    });
    await page.locator('#btnCompat').click();
    assert(await page.locator('#binWrap').isVisible());
    assert.equal(await page.locator('#btnCompat').textContent(), '전용 렌더러');
    await page.waitForTimeout(80);
    await page.locator('#btnCompat').click();
    await assertDedicated();
    assert.equal(await page.evaluate(() => window.legacyDestroyed), 1);
    await page.evaluate(() => { window.legacyFails = true; });
    await page.locator('#btnCompat').click();
    await assertDedicated('HWP 5.0 · 전용 렌더러 (호환 모드 사용 불가)');
    await page.evaluate(() => { window.legacyFails = false; });
    await page.locator('#btnCompat').click();
    await page.waitForTimeout(80);
    await page.locator('#btnReset').click();
    assert.equal(await page.evaluate(() => window.legacyDestroyed), 2);
    assert(await page.locator('#drop').isVisible());
    await page.evaluate(() => {
      window.originalRender = HWPViewer.Hwp.render;
      HWPViewer.Hwp.render = () => { throw new Error('Test dedicated failure'); };
    });
    await load(fixtures.hwp, 'fallback.hwp');
    assert(await page.locator('#binWrap').isVisible());
    await page.waitForTimeout(80);
    await page.locator('#btnCompat').click();
    assert(await page.locator('#binWrap').isVisible());
    await page.waitForTimeout(80);
    await page.evaluate(() => { HWPViewer.Hwp.render = window.originalRender; });
    await page.locator('#btnCompat').click();
    await assertDedicated();
    console.log('PASS HWP open, mode switching, fallback, recovery and cleanup');

    await load(fixtures.hwpx, 'synthetic.hwpx');
    assert.equal(await page.locator('#hxPage').textContent(), fixtures.text);
    for (const [query, expected] of [['ΟΣ', 'ΟΣ'], ['İΟΟΣ', 'İΟΟΣ'], ['😀', '😀'], ['abc', 'ABC'], ['i', 'İ'], ['없는말', null]]) {
      await page.locator('#searchText').fill(query);
      await page.locator('#searchRun').click();
      await page.waitForFunction(() => document.getElementById('searchCount').textContent !== '찾는 중…');
      const selected = await page.evaluate(() => {
        const highlight = CSS.highlights.get('hxCurrent');
        return highlight ? [...highlight][0].toString() : null;
      });
      assert.equal(selected, expected, 'search range for ' + query);
    }
    await page.locator('#searchText').fill('');
    await page.locator('#searchRun').click();
    assert.equal(await page.locator('#searchCount').textContent(), '');
    console.log('PASS HWPX open and Unicode search with original-text ranges');

    const foreign = {
      word: ['이 파일은 Word 문서(docx)', '확장자만 hwp로 되어 있음 — Word에서 열어야 함'],
      xl: ['이 파일은 Excel 문서(xlsx)', '확장자만 hwp로 되어 있음 — Excel에서 열어야 함'],
      ppt: ['이 파일은 PowerPoint 문서(pptx)', '확장자만 hwp로 되어 있음'],
      other: ['HWPX 구조 아님 (header.xml 없음)', 'zip 형식이지만 한글 문서가 아님'],
    };
    for (const [prefix, expected] of Object.entries(foreign)) {
      await load(fixtures.other[prefix], 'foreign.hwpx');
      assert(await page.locator('#errbox').isVisible());
      assert.deepEqual(await page.locator('#errmsg, #errguide').allTextContents(), expected);
    }
    assert.deepEqual(errors, []);
    console.log('PASS Word/Excel/PowerPoint/generic ZIP errors and no uncaught browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
